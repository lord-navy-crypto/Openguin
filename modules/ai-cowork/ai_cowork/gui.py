from __future__ import annotations

import objc
from AppKit import (
    NSApplication,
    NSApplicationActivationPolicyRegular,
    NSBackingStoreBuffered,
    NSButton,
    NSButtonTypeSwitch,
    NSMakeRect,
    NSTextField,
    NSWindow,
    NSWindowStyleMaskClosable,
    NSWindowStyleMaskMiniaturizable,
    NSWindowStyleMaskTitled,
)
from Foundation import NSObject

from .cooperation import GitCoordinationMonitor, ProtocolDraftStore, ProtocolGate
from .runtime_state import RuntimeStateStore, classify_status_message
from .web_runtime import (
    SettingsStore,
    WebAutomationRuntime,
    WebSettings,
    validate_chatgpt_url,
    validate_cursor_url,
)


class WebControlWindowController(NSObject):
    def init(self):
        self = objc.super(WebControlWindowController, self).init()
        if self is None:
            return None
        self.store = SettingsStore()
        self.settings = self.store.load()
        self.runtime = None
        self.window = None
        self.chatgpt_field = None
        self.cursor_field = None
        self.status_label = None
        self.chatgpt_status_label = None
        self.cursor_status_label = None
        self.cooperation_status_label = None
        self.gate_status_label = None
        self.start_button = None
        self.headless_check = None
        self.chatgpt_check = None
        self.cursor_check = None
        self.cooperation_check = None
        self.cursor_auto_continue_check = None
        self.cooperation_monitor = None
        self.protocol_gate = ProtocolGate()
        self.protocol_drafts = ProtocolDraftStore()
        self.runtime_state = RuntimeStateStore()
        return self

    @objc.python_method
    def build(self) -> None:
        style = (
            NSWindowStyleMaskTitled
            | NSWindowStyleMaskClosable
            | NSWindowStyleMaskMiniaturizable
        )
        self.window = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
            NSMakeRect(0, 0, 680, 470),
            style,
            NSBackingStoreBuffered,
            False,
        )
        self.window.setTitle_("AI-cowork Web Controller")
        self.window.center()
        self.window.setDelegate_(self)
        content = self.window.contentView()

        content.addSubview_(self._label("AI-cowork Web Controller", 24, 418, 630, 30, 21))
        content.addSubview_(
            self._label(
                "Dedicated ChatGPT + Cursor web sessions. Passwords and cookies stay in the browser profile.",
                24, 390, 630, 20, 12,
            )
        )

        content.addSubview_(self._label("ChatGPT work URL", 24, 344, 170, 20, 13))
        self.chatgpt_field = self._text_field(
            self.settings.chatgpt_url,
            24, 312, 630, 28,
        )
        content.addSubview_(self.chatgpt_field)

        content.addSubview_(self._label("Cursor Agent URL", 24, 275, 170, 20, 13))
        self.cursor_field = self._text_field(
            self.settings.cursor_url,
            24, 243, 630, 28,
        )
        content.addSubview_(self.cursor_field)

        self.headless_check = NSButton.alloc().initWithFrame_(NSMakeRect(24, 207, 240, 24))
        self.headless_check.setButtonType_(NSButtonTypeSwitch)
        self.headless_check.setTitle_("Run hidden after login")
        self.headless_check.setState_(1 if self.settings.headless else 0)
        content.addSubview_(self.headless_check)

        self.chatgpt_check = NSButton.alloc().initWithFrame_(NSMakeRect(24, 177, 210, 24))
        self.chatgpt_check.setButtonType_(NSButtonTypeSwitch)
        self.chatgpt_check.setTitle_("ChatGPT Supervisor")
        self.chatgpt_check.setState_(1 if self.settings.chatgpt_supervisor_enabled else 0)
        content.addSubview_(self.chatgpt_check)

        self.cursor_check = NSButton.alloc().initWithFrame_(NSMakeRect(238, 177, 210, 24))
        self.cursor_check.setButtonType_(NSButtonTypeSwitch)
        self.cursor_check.setTitle_("Cursor Supervisor")
        self.cursor_check.setState_(1 if self.settings.cursor_supervisor_enabled else 0)
        content.addSubview_(self.cursor_check)

        self.cooperation_check = NSButton.alloc().initWithFrame_(NSMakeRect(452, 177, 200, 24))
        self.cooperation_check.setButtonType_(NSButtonTypeSwitch)
        self.cooperation_check.setTitle_("Cooperation")
        self.cooperation_check.setState_(1 if self.settings.cooperation_enabled else 0)
        content.addSubview_(self.cooperation_check)

        self.cursor_auto_continue_check = NSButton.alloc().initWithFrame_(NSMakeRect(238, 151, 300, 22))
        self.cursor_auto_continue_check.setButtonType_(NSButtonTypeSwitch)
        self.cursor_auto_continue_check.setTitle_("Cursor: auto Continue/Resume when verified")
        self.cursor_auto_continue_check.setState_(1 if self.settings.cursor_auto_continue else 0)
        content.addSubview_(self.cursor_auto_continue_check)

        save_button = self._button("Save Settings", 24, 115, 145, 34, "saveURLs:")
        content.addSubview_(save_button)

        self.start_button = self._button(
            "Start Runtime",
            183, 115, 220, 34,
            "toggleSupervisor:",
        )
        content.addSubview_(self.start_button)

        browser_button = self._button(
            "Open/Login Session",
            417, 115, 235, 34,
            "openSession:",
        )
        content.addSubview_(browser_button)

        self.chatgpt_status_label = self._label("ChatGPT: idle", 24, 82, 630, 22, 12)
        self.cursor_status_label = self._label("Cursor: idle", 24, 60, 630, 22, 12)
        self.cooperation_status_label = self._label("Cooperation: idle", 24, 38, 630, 20, 11)
        self.gate_status_label = self._label(
            "Gates: ChatGPT=unknown | Cursor=unknown",
            24, 20, 630, 18, 11,
        )
        self.status_label = self._label("System: idle", 24, 4, 630, 16, 10)
        content.addSubview_(self.chatgpt_status_label)
        content.addSubview_(self.cursor_status_label)
        content.addSubview_(self.cooperation_status_label)
        content.addSubview_(self.gate_status_label)
        content.addSubview_(self.status_label)

        self.window.makeKeyAndOrderFront_(None)

    @objc.python_method
    def _label(self, text: str, x: float, y: float, w: float, h: float, size: float):
        label = NSTextField.alloc().initWithFrame_(NSMakeRect(x, y, w, h))
        label.setStringValue_(text)
        label.setEditable_(False)
        label.setSelectable_(False)
        label.setBordered_(False)
        label.setDrawsBackground_(False)
        label.setFont_(label.font().fontWithSize_(size))
        return label

    @objc.python_method
    def _text_field(self, text: str, x: float, y: float, w: float, h: float):
        field = NSTextField.alloc().initWithFrame_(NSMakeRect(x, y, w, h))
        field.setStringValue_(text or "")
        return field

    @objc.python_method
    def _button(self, title: str, x: float, y: float, w: float, h: float, action: str):
        button = NSButton.alloc().initWithFrame_(NSMakeRect(x, y, w, h))
        button.setTitle_(title)
        button.setTarget_(self)
        button.setAction_(action)
        return button

    @objc.python_method
    def _collect_settings(self) -> WebSettings:
        chatgpt_url = self.chatgpt_field.stringValue().strip()
        cursor_url = self.cursor_field.stringValue().strip()
        current = self.store.load()
        current.chatgpt_url = chatgpt_url
        current.cursor_url = cursor_url
        current.headless = bool(self.headless_check.state()) if self.headless_check is not None else False
        current.chatgpt_supervisor_enabled = bool(self.chatgpt_check.state()) if self.chatgpt_check is not None else True
        current.cursor_supervisor_enabled = bool(self.cursor_check.state()) if self.cursor_check is not None else True
        current.cooperation_enabled = bool(self.cooperation_check.state()) if self.cooperation_check is not None else True
        current.cursor_auto_continue = (
            bool(self.cursor_auto_continue_check.state())
            if self.cursor_auto_continue_check is not None
            else False
        )
        return current

    @objc.python_method
    def _validate(self, settings: WebSettings) -> str | None:
        if settings.chatgpt_supervisor_enabled:
            if not validate_chatgpt_url(settings.chatgpt_url):
                return "ChatGPT Supervisor requires a valid https://chatgpt.com/... URL."
        elif settings.chatgpt_url and not validate_chatgpt_url(settings.chatgpt_url):
            return "The saved ChatGPT URL is invalid."

        if settings.cursor_supervisor_enabled:
            if not validate_cursor_url(settings.cursor_url):
                return "Cursor Supervisor requires a valid https://cursor.com/... URL."
        elif settings.cursor_url and not validate_cursor_url(settings.cursor_url):
            return "The saved Cursor URL is invalid."

        if (
            not settings.chatgpt_supervisor_enabled
            and not settings.cursor_supervisor_enabled
            and not settings.cooperation_enabled
        ):
            return "Enable at least one module."
        return None

    @objc.python_method
    def _save(self) -> WebSettings | None:
        settings = self._collect_settings()
        error = self._validate(settings)
        if error:
            self.updateStatus_(error)
            return None
        self.store.save(settings)
        self.settings = settings
        self.updateStatus_("URLs saved.")
        return settings

    @objc.IBAction
    def saveURLs_(self, sender):
        self._save()

    @objc.IBAction
    def openSession_(self, sender):
        settings = self._save()
        if settings is None:
            return
        if not settings.chatgpt_url and not settings.cursor_url:
            self.updateStatus_("Enter at least one ChatGPT or Cursor URL before opening a login session.")
            return
        if self.runtime and self.runtime.running:
            self.updateStatus_("Dedicated browser session is already running.")
            return
        # Login sessions are always visible so the user can authenticate.
        settings.headless = False
        self.runtime = WebAutomationRuntime(
            settings,
            on_status=self.status_from_worker,
            supervise=False,
        )
        try:
            self.runtime.start()
            self.start_button.setTitle_("Stop Session")
            self.updateStatus_("Opening dedicated browser for login/connection only.")
        except Exception as exc:
            self.updateStatus_(f"Start error: {exc}")

    @objc.IBAction
    def toggleSupervisor_(self, sender):
        if (
            (self.runtime and self.runtime.running)
            or (self.cooperation_monitor and self.cooperation_monitor.running)
        ):
            if self.runtime and self.runtime.running:
                self.runtime.stop()
            if self.cooperation_monitor and self.cooperation_monitor.running:
                self.cooperation_monitor.stop()
            self.protocol_gate.disable()
            self.runtime_state.mark_stopped("user stop")
            self.start_button.setTitle_("Start Runtime")
            return

        settings = self._save()
        if settings is None:
            return

        try:
            self.runtime_state.mark_started("gui")
            if settings.cooperation_enabled:
                self.protocol_gate.enable()
            else:
                self.protocol_gate.disable()

            web_enabled = (
                settings.chatgpt_supervisor_enabled
                or settings.cursor_supervisor_enabled
            )
            if web_enabled:
                self.runtime = WebAutomationRuntime(
                    settings,
                    on_status=self.status_from_worker,
                    protocol_gate=self.protocol_gate,
                )
                self.runtime.start()
            else:
                self.runtime = None

            if settings.cooperation_enabled:
                self.cooperation_monitor = GitCoordinationMonitor(
                    ".",
                    poll_seconds=10.0,
                    on_status=self.cooperation_status_from_worker,
                    on_snapshot=self.cooperation_snapshot_from_worker,
                    on_error=self.cooperation_error_from_worker,
                )
                self.cooperation_monitor.start()

            self.start_button.setTitle_("Stop Runtime")
            if web_enabled:
                self.updateStatus_("Selected web modules starting…")
            else:
                self.updateStatus_("Cooperation monitor starting without Chromium.")
        except Exception as exc:
            if self.runtime and self.runtime.running:
                self.runtime.stop()
            if self.cooperation_monitor and self.cooperation_monitor.running:
                self.cooperation_monitor.stop()
            self.protocol_gate.disable()
            self.runtime_state.mark_stopped(f"start error: {exc}")
            self.updateStatus_(f"Start error: {exc}")

    @objc.python_method
    def status_from_worker(self, message: str) -> None:
        self.performSelectorOnMainThread_withObject_waitUntilDone_(
            "updateStatus:", message, False
        )

    @objc.python_method
    def cooperation_status_from_worker(self, message: str) -> None:
        self.runtime_state.update("cooperation", message)
        self.performSelectorOnMainThread_withObject_waitUntilDone_(
            "updateCooperationStatus:", message, False
        )

    @objc.python_method
    def cooperation_error_from_worker(self, exc) -> None:
        self.protocol_gate.invalidate()
        message = f"Gates: STALE/INVALID — {exc}"
        self.runtime_state.update("cooperation", message)
        self.performSelectorOnMainThread_withObject_waitUntilDone_(
            "updateGateStatus:", message, False
        )

    @objc.python_method
    def cooperation_snapshot_from_worker(self, snapshot) -> None:
        self.protocol_gate.update(snapshot)
        try:
            self.protocol_drafts.write_snapshot(snapshot)
        except Exception as exc:
            self.runtime_state.update(
                "cooperation",
                f"Cooperation draft error: {exc}",
            )
        chat = (
            snapshot.chatgpt_protocol.state.value
            if snapshot.chatgpt_protocol is not None
            else "UNKNOWN"
        )
        cursor = (
            snapshot.cursor_protocol.state.value
            if snapshot.cursor_protocol is not None
            else "UNKNOWN"
        )
        summary = f"Gates: ChatGPT={chat} | Cursor={cursor}"
        self.performSelectorOnMainThread_withObject_waitUntilDone_(
            "updateGateStatus:", summary, False
        )

    def updateGateStatus_(self, message):
        if self.gate_status_label is not None:
            self.gate_status_label.setStringValue_(message)

    def updateCooperationStatus_(self, message):
        if self.cooperation_status_label is not None:
            self.cooperation_status_label.setStringValue_(message)

    def updateStatus_(self, message):
        self.runtime_state.update(classify_status_message(message), str(message))
        if (
            self.runtime is not None
            and not self.runtime.running
            and self.runtime.fatal_error
            and not self.runtime.stop_requested
        ):
            self.runtime_state.mark_crashed(self.runtime.fatal_error)
        if self.status_label is not None:
            self.status_label.setStringValue_(f"System: {message}")
        if self.chatgpt_status_label is not None and message.startswith("ChatGPT"):
            self.chatgpt_status_label.setStringValue_(message)
        if self.cursor_status_label is not None and message.startswith("Cursor"):
            self.cursor_status_label.setStringValue_(message)
        any_running = (
            (self.runtime and self.runtime.running)
            or (self.cooperation_monitor and self.cooperation_monitor.running)
        )
        if self.start_button is not None and not any_running:
            self.start_button.setTitle_("Start Runtime")

    def windowWillClose_(self, notification):
        if self.runtime and self.runtime.running:
            self.runtime.stop()
        if self.cooperation_monitor and self.cooperation_monitor.running:
            self.cooperation_monitor.stop()
        self.protocol_gate.disable()
        self.runtime_state.mark_stopped("window closed")
        NSApplication.sharedApplication().terminate_(None)


_controller_ref = None


def run_gui() -> None:
    global _controller_ref
    app = NSApplication.sharedApplication()
    app.setActivationPolicy_(NSApplicationActivationPolicyRegular)
    controller = WebControlWindowController.alloc().init()
    controller.build()
    _controller_ref = controller
    app.activateIgnoringOtherApps_(True)
    app.run()
