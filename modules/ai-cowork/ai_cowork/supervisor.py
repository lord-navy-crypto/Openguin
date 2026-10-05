from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Callable

from .agents import DesktopAgent
from .macos import generation_in_progress, notify_user


CONTEXT_LIMIT_MARKERS = (
    "maximum context length",
    "context window is full",
    "context window limit",
    "reached the context limit",
    "reached the maximum length for this conversation",
    "conversation is too long",
    "start a new chat to continue",
    "continue in a new chat",
    "上下文窗口已满",
    "上下文长度已达到",
    "已达到上下文",
    "对话太长",
    "请开始新对话",
    "新对话中继续",
)


def context_limit_detected(text: str) -> bool:
    normalized = " ".join((text or "").casefold().split())
    return any(marker.casefold() in normalized for marker in CONTEXT_LIMIT_MARKERS)


@dataclass
class SupervisorConfig:
    continue_prompt: str = (
        "Continue doing the current task. Keep working from where you stopped. "
        "Do not restart or summarize unless necessary; continue the actual work."
    )
    idle_confirm_seconds: float = 3.0
    poll_interval_seconds: float = 1.0


class ChatGPTSupervisor:
    def __init__(
        self,
        agent: DesktopAgent,
        config: SupervisorConfig | None = None,
        on_status: Callable[[str], None] | None = None,
    ) -> None:
        self.agent = agent
        self.config = config or SupervisorConfig()
        self.on_status = on_status or (lambda _: None)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self) -> bool:
        if self.running:
            return False
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="chatgpt-supervisor", daemon=True)
        self._thread.start()
        return True

    def stop(self) -> None:
        self._stop.set()
        self._status("Stopping after the current safe checkpoint…")

    def _status(self, message: str) -> None:
        self.on_status(message)

    def _wait_until_idle(self) -> bool:
        self._status("Watching ChatGPT…")
        idle_since: float | None = None
        while not self._stop.is_set():
            if generation_in_progress(self.agent.app_name):
                idle_since = None
                self._status("ChatGPT is working — waiting.")
            else:
                now = time.monotonic()
                if idle_since is None:
                    idle_since = now
                elif now - idle_since >= self.config.idle_confirm_seconds:
                    return True
            self._stop.wait(self.config.poll_interval_seconds)
        return False

    def _run(self) -> None:
        try:
            while not self._stop.is_set():
                if not self._wait_until_idle():
                    break

                # Inspect the already-visible conversation before prompting.
                try:
                    snapshot = self.agent.read_snapshot()
                except Exception:
                    snapshot = ""
                if context_limit_detected(snapshot):
                    self._context_notice()
                    break

                self._status("ChatGPT is idle — sending continue.")
                try:
                    reply = self.agent.send_and_read(self.config.continue_prompt, timeout=None)
                except Exception as exc:
                    self._status(f"Supervisor error: {exc}")
                    notify_user("AI-cowork Supervisor", f"ChatGPT supervisor stopped: {exc}")
                    break

                if context_limit_detected(reply):
                    self._context_notice()
                    break

                self._status("Work turn completed — monitoring for the next continue.")
        finally:
            if self._stop.is_set():
                self._status("Supervisor stopped.")
            self._thread = None

    def _context_notice(self) -> None:
        message = "ChatGPT appears to have reached the conversation/context limit."
        self._status("Context limit detected — supervisor paused.")
        notify_user("AI-cowork: context limit", message)
