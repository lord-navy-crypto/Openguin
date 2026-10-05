from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from .events import EventLog
from .macos import (
    background_send_chat_message,
    generation_in_progress,
    paste_and_enter,
    paste_into_chat,
    select_all_copy_text,
    text_snapshot,
    webarea_text,
)


class Agent(ABC):
    @abstractmethod
    def send(self, prompt: str) -> None: ...

    @abstractmethod
    def read_snapshot(self) -> str: ...

    @abstractmethod
    def wait_until_stable(self, timeout: float | None = None) -> str: ...


def _extract_delta(before: str, after: str) -> str:
    if not before:
        return after.strip()
    if after.startswith(before):
        return after[len(before):].strip()

    # UI chrome can mutate near the start of a flattened snapshot. Prefer the
    # longest common suffix/prefix overlap before falling back to a character
    # prefix diff.
    max_overlap = min(len(before), len(after), 20000)
    for size in range(max_overlap, 64, -1):
        if before[-size:] == after[:size]:
            return after[size:].strip()

    limit = min(len(before), len(after))
    i = 0
    while i < limit and before[i] == after[i]:
        i += 1
    return after[i:].strip() or after.strip()


@dataclass
class DesktopAgent(Agent):
    name: str
    app_name: str
    poll_interval: float = 1.0
    stable_seconds: float = 4.0
    enter_to_send: bool = True
    events: EventLog | None = None
    read_strategy: str = "ax_tree"
    background_preferred: bool = False
    allow_foreground_fallback: bool = True
    _baseline: str = field(default="", init=False, repr=False)
    _last_prompt: str = field(default="", init=False, repr=False)

    def send(self, prompt: str) -> None:
        try:
            self._baseline = self.read_snapshot()
        except Exception:
            self._baseline = ""
        self._last_prompt = prompt

        if self.events:
            self.events.emit("agent_send", agent=self.name, chars=len(prompt))

        if self.background_preferred:
            if background_send_chat_message(self.app_name, prompt):
                if self.events:
                    self.events.emit("agent_send_transport", agent=self.name, transport="background_ax")
                return
            if not self.allow_foreground_fallback:
                raise RuntimeError(
                    f"{self.name} background send unavailable and foreground fallback is disabled"
                )

        # Fallback for app builds that do not expose a writable background AX composer.
        paste_into_chat(self.app_name, prompt, enter=self.enter_to_send)
        if self.events:
            self.events.emit("agent_send_transport", agent=self.name, transport="foreground_fallback")

    def read_snapshot(self) -> str:
        if self.read_strategy == "webarea":
            value = webarea_text(self.app_name)
            return value or text_snapshot(self.app_name)
        if self.read_strategy == "clipboard":
            value = select_all_copy_text(self.app_name)
            return value or text_snapshot(self.app_name)
        return text_snapshot(self.app_name)

    def wait_until_stable(self, timeout: float | None = None) -> str:
        started = time.monotonic()
        previous = ""
        stable_since: float | None = None
        seen_change = False

        interval = self.poll_interval
        clipboard_mode = self.read_strategy == "clipboard"
        clipboard_fallback_after = started + 5.0
        saw_generating = False

        while timeout is None or time.monotonic() - started < timeout:
            if clipboard_mode:
                # Do not steal focus from a clipboard-read desktop agent while it is visibly thinking
                # or generating. Use Accessibility as a passive completion
                # probe and only copy the page after generation has ended.
                busy = generation_in_progress(self.app_name)
                if busy:
                    saw_generating = True
                    time.sleep(max(interval, 0.75))
                    continue
                if not saw_generating and time.monotonic() < clipboard_fallback_after:
                    time.sleep(max(interval, 0.75))
                    continue

            current = self.read_snapshot()

            if current and current != self._baseline:
                seen_change = True

            still_generating = generation_in_progress(self.app_name)

            if seen_change and current and current == previous and not still_generating:
                if stable_since is None:
                    stable_since = time.monotonic()
                required_stable = max(1.5, self.stable_seconds if not clipboard_mode else 2.0)
                if time.monotonic() - stable_since >= required_stable:
                    output = self._extract_response(current)
                    if self.events:
                        self.events.emit(
                            "agent_stable",
                            agent=self.name,
                            snapshot_chars=len(current),
                            output_chars=len(output),
                            strategy=self.read_strategy,
                        )
                    return output
            else:
                previous = current
                stable_since = None

            time.sleep(max(interval, 1.5) if clipboard_mode else interval)

        raise TimeoutError(f"{self.name} output did not become stable within {timeout} seconds")

    def _extract_response(self, current: str) -> str:
        # In flattened WebArea text the prompt itself is normally echoed into
        # the conversation. Taking text after its last occurrence is more
        # robust than diffing huge pages with changing sidebar chrome.
        if self._last_prompt:
            idx = current.rfind(self._last_prompt)
            if idx >= 0:
                tail = current[idx + len(self._last_prompt):].strip()
                if tail:
                    return tail
        return _extract_delta(self._baseline, current)

    def send_and_read(self, prompt: str, timeout: float | None = None) -> str:
        self.send(prompt)
        return self.wait_until_stable(timeout=timeout)


@dataclass
class BrowserAgent(DesktopAgent):
    window_title_contains: str | None = None
