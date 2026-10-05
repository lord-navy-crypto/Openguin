from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

from playwright.sync_api import BrowserContext, Page, Playwright, sync_playwright

from .cursor_supervisor import (
    CursorAction,
    CursorState,
    classify_cursor_text,
    decide_cursor_action,
)
from .cooperation import ProtocolGate


CHATGPT_HOSTS = {"chatgpt.com", "www.chatgpt.com"}
CURSOR_HOSTS = {"cursor.com", "www.cursor.com"}

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


def _valid_url_for(url: str, hosts: set[str]) -> bool:
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False
    return parsed.scheme == "https" and (parsed.hostname or "").casefold() in hosts


def validate_chatgpt_url(url: str) -> bool:
    return _valid_url_for(url, CHATGPT_HOSTS)


def validate_cursor_url(url: str) -> bool:
    return _valid_url_for(url, CURSOR_HOSTS)


def context_limit_detected(text: str) -> bool:
    normalized = " ".join((text or "").casefold().split())
    return any(marker.casefold() in normalized for marker in CONTEXT_LIMIT_MARKERS)


@dataclass
class WebSettings:
    chatgpt_url: str = ""
    cursor_url: str = ""
    continue_prompt: str = (
        "Continue doing the current task. Keep working from where you stopped. "
        "Do not restart or summarize unless necessary; continue the actual work."
    )
    idle_confirm_seconds: float = 3.0
    poll_interval_seconds: float = 1.0
    headless: bool = False
    profile_dir: str = "state/browser-profile"
    chatgpt_supervisor_enabled: bool = True
    cursor_supervisor_enabled: bool = True
    cooperation_enabled: bool = True
    cursor_auto_continue: bool = False


class SettingsStore:
    def __init__(self, path: str | Path = "state/web_settings.json") -> None:
        self.path = Path(path)

    def load(self) -> WebSettings:
        if not self.path.exists():
            return WebSettings()
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            allowed = {field for field in WebSettings.__dataclass_fields__}
            settings = WebSettings(**{k: v for k, v in raw.items() if k in allowed})
            settings.idle_confirm_seconds = max(
                1.5, min(float(settings.idle_confirm_seconds), 60.0)
            )
            settings.poll_interval_seconds = max(
                0.5, min(float(settings.poll_interval_seconds), 10.0)
            )
            return settings
        except Exception:
            return WebSettings()

    def save(self, settings: WebSettings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.path.parent, 0o700)
        except OSError:
            pass
        temp = self.path.with_suffix(self.path.suffix + ".tmp")
        temp.write_text(
            json.dumps(asdict(settings), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temp.replace(self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass


class WebAutomationRuntime:
    """One persistent Chromium profile for ChatGPT and Cursor work pages."""

    def __init__(
        self,
        settings: WebSettings,
        on_status: Callable[[str], None] | None = None,
        supervise: bool = True,
        protocol_gate: ProtocolGate | None = None,
    ) -> None:
        self.settings = settings
        self.supervise = supervise
        self.protocol_gate = protocol_gate
        self.on_status = on_status or (lambda _: None)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._playwright: Playwright | None = None
        self._context: BrowserContext | None = None
        self._chatgpt_page: Page | None = None
        self._cursor_page: Page | None = None
        self._last_cursor_state: CursorState | None = None
        self._last_cursor_poll = 0.0
        self._cursor_failure_count = 0
        self._cursor_paused_reason: str | None = None
        self._cursor_action_armed = True
        self._chatgpt_paused_reason: str | None = None
        self._fatal_error: str | None = None
        self._stop_requested = False

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    @property
    def fatal_error(self) -> str | None:
        return self._fatal_error

    @property
    def stop_requested(self) -> bool:
        return self._stop_requested

    def start(self) -> bool:
        if self.running:
            return False
        if (
            self.supervise
            and self.settings.chatgpt_supervisor_enabled
            and not validate_chatgpt_url(self.settings.chatgpt_url)
        ):
            raise ValueError("ChatGPT Supervisor requires a valid https://chatgpt.com/... URL.")
        if (
            self.supervise
            and self.settings.cursor_supervisor_enabled
            and not validate_cursor_url(self.settings.cursor_url)
        ):
            raise ValueError("Cursor Supervisor requires a valid https://cursor.com/... URL.")
        if not self.supervise:
            if self.settings.chatgpt_url and not validate_chatgpt_url(self.settings.chatgpt_url):
                raise ValueError("Invalid ChatGPT URL.")
            if self.settings.cursor_url and not validate_cursor_url(self.settings.cursor_url):
                raise ValueError("Invalid Cursor URL.")

        self._stop.clear()
        self._stop_requested = False
        self._fatal_error = None
        self._thread = threading.Thread(
            target=self._run,
            name="ai-cowork-web-runtime",
            daemon=True,
        )
        self._thread.start()
        return True

    def stop(self) -> None:
        self._stop_requested = True
        self._stop.set()
        self._status("Stopping web supervisor…")

    def _status(self, message: str) -> None:
        self.on_status(message)

    def _launch(self) -> None:
        profile = Path(self.settings.profile_dir).expanduser().resolve()
        profile.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(profile, 0o700)
        except OSError:
            pass
        self._playwright = sync_playwright().start()
        self._context = self._playwright.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            headless=bool(self.settings.headless),
            viewport={"width": 1280, "height": 900},
            args=["--disable-background-timer-throttling"],
        )
        pages = list(self._context.pages)
        reusable = pages[0] if pages else None

        open_chatgpt = bool(self.settings.chatgpt_url) and (
            not self.supervise or self.settings.chatgpt_supervisor_enabled
        )
        open_cursor = bool(self.settings.cursor_url) and (
            not self.supervise or self.settings.cursor_supervisor_enabled
        )

        if open_chatgpt:
            self._chatgpt_page = reusable or self._context.new_page()
            reusable = None
            self._chatgpt_page.goto(
                self.settings.chatgpt_url,
                wait_until="domcontentloaded",
                timeout=60_000,
            )

        if open_cursor:
            self._cursor_page = reusable or self._context.new_page()
            self._cursor_page.goto(
                self.settings.cursor_url,
                wait_until="domcontentloaded",
                timeout=60_000,
            )

        if not open_chatgpt and not open_cursor and reusable is not None:
            try:
                reusable.close()
            except Exception:
                pass

    def _close(self) -> None:
        try:
            if self._context is not None:
                self._context.close()
        except Exception:
            pass
        try:
            if self._playwright is not None:
                self._playwright.stop()
        except Exception:
            pass
        self._context = None
        self._playwright = None
        self._chatgpt_page = None
        self._cursor_page = None

    @staticmethod
    def _page_text(page: Page) -> str:
        try:
            return page.locator("body").inner_text(timeout=5_000)
        except Exception:
            return ""

    @staticmethod
    def _login_required(page: Page) -> bool:
        text = WebAutomationRuntime._page_text(page).casefold()
        url = page.url.casefold()
        markers = ("log in", "sign up", "登录", "注册")
        return "/auth/" in url or any(marker in text[:2500] for marker in markers)

    @staticmethod
    def _chatgpt_generating(page: Page) -> bool:
        selectors = (
            'button[data-testid="stop-button"]',
            'button[aria-label*="Stop"]',
            'button[title*="Stop"]',
        )
        for selector in selectors:
            try:
                if page.locator(selector).first.is_visible(timeout=250):
                    return True
            except Exception:
                pass

        try:
            buttons = page.get_by_role("button")
            count = min(buttons.count(), 100)
            for i in range(count):
                try:
                    label = (
                        buttons.nth(i).get_attribute("aria-label")
                        or buttons.nth(i).get_attribute("title")
                        or ""
                    ).casefold()
                    if any(token in label for token in ("stop generating", "stop response", "stop streaming")):
                        return True
                except Exception:
                    continue
        except Exception:
            pass
        return False

    @staticmethod
    def _context_limit_on_page(page: Page) -> bool:
        """Check current error/status surfaces and the newest assistant content."""
        try:
            for selector in ('[role="alert"]', '[role="status"]'):
                loc = page.locator(selector)
                count = min(loc.count(), 20)
                for i in range(count):
                    try:
                        text = loc.nth(i).inner_text(timeout=500)
                        if context_limit_detected(text):
                            return True
                    except Exception:
                        continue
        except Exception:
            pass

        _, _, latest_assistant = WebAutomationRuntime._message_state(page)
        if latest_assistant and context_limit_detected(latest_assistant):
            return True

        # Some system notices are not exposed as alerts. Limit the fallback to
        # the tail of the rendered page so old conversation text cannot trip it.
        try:
            body = page.locator("body").inner_text(timeout=2_000)
            return context_limit_detected(body[-6000:])
        except Exception:
            return False

    @staticmethod
    def _find_prompt(page: Page):
        candidates = (
            "#prompt-textarea",
            '[contenteditable="true"][data-virtualkeyboard="true"]',
            '[contenteditable="true"]',
            "textarea",
        )
        for selector in candidates:
            locator = page.locator(selector).last
            try:
                if locator.is_visible(timeout=400) and locator.is_editable(timeout=400):
                    return locator
            except Exception:
                continue
        return None

    @staticmethod
    def _message_state(page: Page) -> tuple[int, int, str]:
        """Return (user_count, assistant_count, last_assistant_text)."""
        try:
            users = page.locator('[data-message-author-role="user"]')
            assistants = page.locator('[data-message-author-role="assistant"]')
            user_count = users.count()
            assistant_count = assistants.count()

            # Fallback for ChatGPT builds that do not expose author-role on
            # the outer turn but still render assistant Markdown blocks.
            if assistant_count == 0:
                assistants = page.locator("div.markdown, .markdown.prose")
                assistant_count = assistants.count()

            last_text = ""
            if assistant_count:
                try:
                    last_text = assistants.nth(assistant_count - 1).inner_text(timeout=2_000).strip()
                except Exception:
                    last_text = ""
            return user_count, assistant_count, last_text
        except Exception:
            return 0, 0, ""

    @staticmethod
    def _continuation_acknowledged(
        page: Page,
        before: tuple[int, int, str],
        prompt_text: str,
    ) -> bool:
        before_users, before_assistants, before_last = before
        users, assistants, last_assistant = WebAutomationRuntime._message_state(page)

        if users > before_users or assistants > before_assistants:
            return True
        if last_assistant and last_assistant != before_last:
            return True

        return False

    @staticmethod
    def _wait_for_send_ack(
        page: Page,
        before: tuple[int, int, str],
        prompt_text: str,
        stop_event: threading.Event,
        timeout: float = 20.0,
    ) -> bool:
        deadline = time.monotonic() + timeout
        while not stop_event.is_set() and time.monotonic() < deadline:
            if WebAutomationRuntime._chatgpt_generating(page):
                return True
            if WebAutomationRuntime._continuation_acknowledged(page, before, prompt_text):
                return True
            stop_event.wait(0.5)
        return False

    @staticmethod
    def _send_prompt(page: Page, text: str) -> None:
        prompt = WebAutomationRuntime._find_prompt(page)
        if prompt is None:
            raise RuntimeError("ChatGPT prompt box was not found. The page may need login or the UI changed.")

        prompt.fill(text)

        selectors = (
            'button[data-testid="send-button"]',
            'button[aria-label*="Send"]',
            'button[title*="Send"]',
        )
        for selector in selectors:
            button = page.locator(selector).first
            try:
                if button.is_visible(timeout=350) and button.is_enabled(timeout=350):
                    button.click()
                    return
            except Exception:
                continue

        prompt.press("Enter")

    @staticmethod
    def _find_cursor_continue_control(page: Page):
        labels = ("Continue", "Resume")
        for label in labels:
            try:
                button = page.get_by_role("button", name=label, exact=True).first
                if button.is_visible(timeout=250) and button.is_enabled(timeout=250):
                    return button
            except Exception:
                continue
        return None

    def _recover_cursor_page(self) -> Page | None:
        if self._context is None or not self.settings.cursor_url:
            return None

        page = self._cursor_page
        self._cursor_failure_count += 1
        attempt = self._cursor_failure_count

        if attempt > 3:
            self._cursor_paused_reason = "repeated page failures"
            self.settings.cursor_supervisor_enabled = False
            self._status(
                "Cursor Supervisor paused after repeated page failures; "
                "ChatGPT Supervisor remains independent."
            )
            return None

        self._status(f"Cursor Supervisor recovery attempt {attempt}/3.")
        try:
            if page is not None and not page.is_closed():
                page.reload(wait_until="domcontentloaded", timeout=45_000)
                self._cursor_failure_count = 0
                return page
        except Exception:
            pass

        try:
            replacement = self._context.new_page()
            replacement.goto(
                self.settings.cursor_url,
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            self._cursor_page = replacement
            self._cursor_failure_count = 0
            return replacement
        except Exception as exc:
            self._status(f"Cursor Supervisor recovery failed: {exc}")
            return None

    def _tick_cursor(self, force: bool = False) -> None:
        if not self.settings.cursor_supervisor_enabled:
            return
        page = self._cursor_page
        if page is None or page.is_closed():
            page = self._recover_cursor_page()
            if page is None:
                return

        now = time.monotonic()
        if not force and now - self._last_cursor_poll < 5.0:
            return
        self._last_cursor_poll = now

        try:
            text = self._page_text(page)
            snapshot = classify_cursor_text(text, page.url)

            if snapshot.state is not CursorState.WAITING:
                self._cursor_action_armed = True

            if snapshot.state is CursorState.LOGIN_REQUIRED:
                self._cursor_paused_reason = "login required"
                if self.settings.headless:
                    self.settings.cursor_supervisor_enabled = False
                    self._status(
                        "Cursor Supervisor paused: login required. "
                        "Open/Login Session again; ChatGPT Supervisor remains active."
                    )
                    return

            continue_control = self._find_cursor_continue_control(page)
            action = decide_cursor_action(
                snapshot.state,
                has_continue_control=continue_control is not None,
            )

            cursor_gate_ok = (
                self.protocol_gate is None
                or self.protocol_gate.allows_own_work("cursor")
            )
            if (
                self.settings.cursor_auto_continue
                and self._cursor_action_armed
                and cursor_gate_ok
                and action is CursorAction.CLICK_CONTINUE
                and continue_control is not None
            ):
                continue_control.click()
                self._cursor_action_armed = False
                self._status(
                    "Cursor Supervisor [ACTION]: clicked verified Continue/Resume control; "
                    "waiting for state change before another automatic action."
                )
                self._last_cursor_state = snapshot.state
                return
        except Exception as exc:
            self._status(f"Cursor Supervisor error: {exc}")
            self._recover_cursor_page()
            return

        if force or snapshot.state != self._last_cursor_state:
            self._last_cursor_state = snapshot.state
            suffix = ""
            if action is CursorAction.CLICK_CONTINUE:
                if (
                    self.protocol_gate is not None
                    and not self.protocol_gate.allows_own_work("cursor")
                ):
                    suffix = (
                        " Auto-continue blocked by Cooperation gate: "
                        + self.protocol_gate.block_reason("cursor")
                    )
                else:
                    suffix = " Auto-continue available."
            self._status(
                f"Cursor Supervisor [{snapshot.state.value}]: "
                f"{snapshot.detail}{suffix}"
            )

    def _cursor_summary(self) -> str:
        page = self._cursor_page
        if page is None:
            return "Cursor URL not configured."
        if self._login_required(page):
            return "Cursor login required in the dedicated browser."
        snapshot = classify_cursor_text(self._page_text(page), page.url)
        return f"Cursor Supervisor [{snapshot.state.value}]: {snapshot.detail}"

    def _wait_for_generation_cycle(
        self,
        page: Page,
        before: tuple[int, int, str],
    ) -> None:
        """Wait for a genuinely new response cycle after our continue prompt."""
        if not self._wait_for_send_ack(
            page,
            before,
            self.settings.continue_prompt,
            self._stop,
            timeout=20.0,
        ):
            raise RuntimeError(
                "Continue was not acknowledged by the ChatGPT page; refusing to send another one."
            )

        idle_since: float | None = None
        _, before_assistants, before_last = before
        saw_assistant_change = False

        while not self._stop.is_set():
            self._tick_cursor()
            _, assistant_count, assistant_last = self._message_state(page)
            if (
                assistant_count > before_assistants
                or (assistant_last and assistant_last != before_last)
            ):
                saw_assistant_change = True

            if self._chatgpt_generating(page):
                idle_since = None
                self._status("ChatGPT Web is working — waiting.")
            else:
                now = time.monotonic()
                if idle_since is None:
                    idle_since = now
                elif (
                    saw_assistant_change
                    and now - idle_since >= self.settings.idle_confirm_seconds
                ):
                    return
            self._stop.wait(max(0.5, self.settings.poll_interval_seconds))

    def _recover_chatgpt_page(self, page: Page, attempt: int) -> Page:
        """Best-effort recovery after a transient page/browser failure."""
        if self._context is None:
            raise RuntimeError("Browser context is unavailable.")

        delay = min(8.0, 1.5 * attempt)
        self._status(f"Transient page error — recovery attempt {attempt}/3.")
        self._stop.wait(delay)
        if self._stop.is_set():
            return page

        try:
            if not page.is_closed():
                page.reload(wait_until="domcontentloaded", timeout=45_000)
                return page
        except Exception:
            pass

        replacement = self._context.new_page()
        replacement.goto(
            self.settings.chatgpt_url,
            wait_until="domcontentloaded",
            timeout=60_000,
        )
        self._chatgpt_page = replacement
        return replacement

    def _run(self) -> None:
        try:
            self._status("Opening dedicated web session…")
            self._launch()
            page = self._chatgpt_page

            if page is not None and self._login_required(page):
                if self.settings.headless:
                    self._chatgpt_paused_reason = "login required"
                    self.settings.chatgpt_supervisor_enabled = False
                    self._status(
                        "ChatGPT Supervisor paused: login required. "
                        "Cursor Supervisor can continue."
                    )
                else:
                    self._status(
                        "ChatGPT login required — sign in in the dedicated browser."
                    )
                    while not self._stop.is_set() and self._login_required(page):
                        self._tick_cursor()
                        self._stop.wait(2.0)

            if self._stop.is_set():
                return

            if self._cursor_page is not None:
                self._status(self._cursor_summary())
                self._tick_cursor(force=True)
            if not self.supervise:
                self._status("Dedicated web session connected — login state will be saved locally.")
                while not self._stop.is_set():
                    self._stop.wait(1.0)
                return

            self._status("ChatGPT Web connected — supervisor active.")

            recovery_attempts = 0
            while not self._stop.is_set():
                self._tick_cursor()
                if page is None or not self.settings.chatgpt_supervisor_enabled:
                    reason = (
                        f" ({self._chatgpt_paused_reason})"
                        if self._chatgpt_paused_reason
                        else ""
                    )
                    if page is not None:
                        self._status(
                            "ChatGPT Supervisor paused"
                            + reason
                            + "; Cursor monitoring remains active."
                        )
                    self._stop.wait(max(0.5, self.settings.poll_interval_seconds))
                    continue
                try:
                    if page.is_closed():
                        raise RuntimeError("ChatGPT page was closed.")

                    if self._context_limit_on_page(page):
                        self._chatgpt_paused_reason = "context limit detected"
                        self.settings.chatgpt_supervisor_enabled = False
                        self._status(
                            "ChatGPT Supervisor paused: context limit detected. "
                            "Cursor Supervisor remains active."
                        )
                        continue

                    if self._chatgpt_generating(page):
                        recovery_attempts = 0
                        self._status("ChatGPT Web is working — waiting.")
                        self._stop.wait(max(0.5, self.settings.poll_interval_seconds))
                        continue

                    if (
                        self.protocol_gate is not None
                        and not self.protocol_gate.allows_own_work("chatgpt")
                    ):
                        self._status(
                            "ChatGPT Supervisor [BLOCKED]: "
                            + self.protocol_gate.block_reason("chatgpt")
                        )
                        self._stop.wait(max(1.0, self.settings.poll_interval_seconds))
                        continue

                    self._status("ChatGPT Web is idle — sending continue.")
                    before = self._message_state(page)
                    self._send_prompt(page, self.settings.continue_prompt)
                    self._wait_for_generation_cycle(page, before)
                    recovery_attempts = 0

                except Exception as exc:
                    recovery_attempts += 1
                    if recovery_attempts > 3:
                        self._chatgpt_paused_reason = str(exc)
                        self.settings.chatgpt_supervisor_enabled = False
                        self._status(
                            "ChatGPT Supervisor paused after repeated failures; "
                            f"Cursor Supervisor remains active. Last error: {exc}"
                        )
                        recovery_attempts = 0
                        continue
                    page = self._recover_chatgpt_page(page, recovery_attempts)
                    if self._login_required(page):
                        self._chatgpt_paused_reason = "login required"
                        self.settings.chatgpt_supervisor_enabled = False
                        self._status(
                            "ChatGPT Supervisor paused: login required. "
                            "Open/Login Session again; Cursor Supervisor remains active."
                        )
                        recovery_attempts = 0
                        continue

        except Exception as exc:
            self._fatal_error = str(exc)
            self._status(f"Web supervisor error: {exc}")
        finally:
            self._close()
            self._thread = None
            if self._stop.is_set():
                self._status("Web supervisor stopped.")
