from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass

import ApplicationServices as AS

from ApplicationServices import (
    AXIsProcessTrusted,
    AXUIElementCopyAttributeNames,
    AXUIElementCopyAttributeValue,
    AXUIElementCreateApplication,
    AXUIElementSetAttributeValue,
)
from AppKit import NSWorkspace


TEXT_ATTRIBUTES = ("AXValue", "AXTitle", "AXDescription")
CHILD_ATTRIBUTES = ("AXChildren", "AXContents", "AXRows", "AXWindows")


def run_osascript(script: str) -> str:
    p = subprocess.run(
        ["osascript", "-e", script],
        text=True,
        capture_output=True,
        check=True,
    )
    return p.stdout.strip()


def set_clipboard(text: str) -> None:
    subprocess.run(["pbcopy"], input=text, text=True, check=True)


def get_clipboard() -> str:
    return subprocess.run(
        ["pbpaste"], text=True, capture_output=True, check=True
    ).stdout


def accessibility_trusted() -> bool:
    try:
        return bool(AXIsProcessTrusted())
    except Exception:
        return False


def find_pid(app_name: str) -> int | None:
    workspace = NSWorkspace.sharedWorkspace()
    target = app_name.casefold()
    for app in workspace.runningApplications():
        name = (app.localizedName() or "").casefold()
        if name == target:
            return int(app.processIdentifier())
    return None


def activate_app(app_name: str) -> None:
    escaped = app_name.replace('"', '\\"')
    run_osascript(f'tell application "{escaped}" to activate')


def paste_and_enter(app_name: str, text: str, enter: bool = True) -> None:
    set_clipboard(text)
    activate_app(app_name)
    time.sleep(0.25)
    enter_line = "key code 36" if enter else ""
    run_osascript(
        f'''
        tell application "System Events"
            keystroke "v" using command down
            delay 0.1
            {enter_line}
        end tell
        '''
    )


def system_events_probe(app_name: str) -> dict[str, str]:
    escaped = app_name.replace('"', '\\"')
    script = f'''
    tell application "System Events"
        if not (exists process "{escaped}") then return "PROCESS_MISSING"
        tell process "{escaped}"
            set frontmost to true
            set wc to count of windows
            set ec to count of UI elements
            set namesText to ""
            repeat with w in windows
                try
                    set namesText to namesText & (name of w as text) & " | "
                end try
            end repeat
            return "windows=" & wc & "; root_ui_elements=" & ec & "; window_names=" & namesText
        end tell
    end tell
    '''
    try:
        return {"ok": "true", "output": run_osascript(script)}
    except subprocess.CalledProcessError as e:
        return {
            "ok": "false",
            "output": (e.stderr or e.stdout or str(e)).strip(),
        }


def _attr(element, name: str):
    try:
        err, value = AXUIElementCopyAttributeValue(element, name, None)
        if err == 0:
            return value
    except Exception:
        pass
    return None


def _attr_names(element) -> list[str]:
    try:
        err, names = AXUIElementCopyAttributeNames(element, None)
        if err == 0 and names:
            return [str(x) for x in names]
    except Exception:
        pass
    return []


def enable_enhanced_accessibility(app_name: str) -> bool:
    pid = find_pid(app_name)
    if pid is None:
        return False
    app = AXUIElementCreateApplication(pid)
    # Electron/Chromium apps may keep the deep web accessibility tree lazy
    # until an assistive technology requests enhanced UI.
    for attr in ("AXEnhancedUserInterface", "AXManualAccessibility"):
        try:
            AXUIElementSetAttributeValue(app, attr, True)
        except Exception:
            pass
    return True


@dataclass
class AXNode:
    role: str
    value: str
    depth: int


def walk_accessibility(app_name: str, max_depth: int = 12, max_nodes: int = 4000) -> list[AXNode]:
    pid = find_pid(app_name)
    if pid is None:
        raise RuntimeError(f"{app_name} is not running")

    enable_enhanced_accessibility(app_name)
    root = AXUIElementCreateApplication(pid)
    out: list[AXNode] = []
    seen: set[str] = set()

    def visit(node, depth: int) -> None:
        if depth > max_depth or len(out) >= max_nodes:
            return

        ident = str(node)
        if ident in seen:
            return
        seen.add(ident)

        role = str(_attr(node, "AXRole") or "")
        pieces: list[str] = []
        for attr_name in TEXT_ATTRIBUTES:
            value = _attr(node, attr_name)
            if isinstance(value, str) and value.strip():
                pieces.append(value.strip())

        unique = []
        for item in pieces:
            if item not in unique:
                unique.append(item)

        out.append(AXNode(role=role, value=" | ".join(unique), depth=depth))

        children: list = []
        for attr_name in CHILD_ATTRIBUTES:
            value = _attr(node, attr_name)
            if value is None:
                continue
            # PyObjC commonly returns NSArray/CFArray proxy objects rather than
            # native Python list/tuple instances. Treat any non-string iterable
            # as a child collection.
            if isinstance(value, (str, bytes)):
                continue
            try:
                children.extend(list(value))
            except TypeError:
                pass

        for child in children:
            visit(child, depth + 1)

    visit(root, 0)
    return out


def text_snapshot(app_name: str) -> str:
    nodes = walk_accessibility(app_name)
    return "\n".join(node.value for node in nodes if node.value)


def formatted_tree(app_name: str) -> str:
    nodes = walk_accessibility(app_name)
    return "\n".join(
        f'{"  " * node.depth}{node.role}: {node.value[:240]}'
        for node in nodes
    )


def accessibility_debug(app_name: str, max_depth: int = 10) -> str:
    """Dump roles plus available AX attributes for WebArea/text-like nodes."""
    pid = find_pid(app_name)
    if pid is None:
        raise RuntimeError(f"{app_name} is not running")
    enable_enhanced_accessibility(app_name)
    root = AXUIElementCreateApplication(pid)
    lines: list[str] = []
    seen: set[str] = set()

    def visit(node, depth: int) -> None:
        if depth > max_depth:
            return
        ident = str(node)
        if ident in seen:
            return
        seen.add(ident)

        role = str(_attr(node, "AXRole") or "")
        value = str(_attr(node, "AXTitle") or _attr(node, "AXValue") or "")
        if role in ("AXWebArea", "AXTextArea", "AXStaticText", "AXGroup"):
            names = ",".join(_attr_names(node))
            lines.append(f'{"  " * depth}{role}: {value[:120]}')
            lines.append(f'{"  " * depth}  attrs=[{names}]')

        children: list = []
        for attr_name in ("AXChildren", "AXContents", "AXRows", "AXWindows", "AXChildrenInNavigationOrder"):
            value_obj = _attr(node, attr_name)
            if value_obj is None or isinstance(value_obj, (str, bytes)):
                continue
            try:
                children.extend(list(value_obj))
            except TypeError:
                pass
        for child in children:
            visit(child, depth + 1)

    visit(root, 0)
    return "\n".join(lines)


MEANINGFUL_ROLES = {
    "AXTextArea", "AXTextField", "AXStaticText", "AXButton", "AXLink",
    "AXHeading", "AXWebArea", "AXCheckBox", "AXRadioButton",
    "AXList", "AXListItem", "AXScrollArea"
}


def meaningful_accessibility_dump(app_name: str, max_depth: int = 30, max_nodes: int = 12000) -> str:
    """Deep dump focused on actionable/text-bearing nodes plus a role histogram."""
    pid = find_pid(app_name)
    if pid is None:
        raise RuntimeError(f"{app_name} is not running")
    enable_enhanced_accessibility(app_name)
    root = AXUIElementCreateApplication(pid)

    seen: set[str] = set()
    lines: list[str] = []
    counts: dict[str, int] = {}
    visited = 0

    def visit(node, depth: int) -> None:
        nonlocal visited
        if depth > max_depth or visited >= max_nodes:
            return
        ident = str(node)
        if ident in seen:
            return
        seen.add(ident)
        visited += 1

        role = str(_attr(node, "AXRole") or "")
        counts[role] = counts.get(role, 0) + 1

        title = str(_attr(node, "AXTitle") or "")
        value = str(_attr(node, "AXValue") or "")
        desc = str(_attr(node, "AXDescription") or "")
        placeholder = str(_attr(node, "AXPlaceholderValue") or "")
        domid = str(_attr(node, "AXDOMIdentifier") or "")
        classes = _attr(node, "AXDOMClassList")
        class_text = ""
        if classes is not None and not isinstance(classes, (str, bytes)):
            try:
                class_text = " ".join(str(x) for x in list(classes))
            except TypeError:
                class_text = str(classes)

        if role in MEANINGFUL_ROLES or any((title, value, desc, placeholder, domid)):
            bits = []
            if title: bits.append(f"title={title[:160]!r}")
            if value: bits.append(f"value={value[:240]!r}")
            if desc: bits.append(f"desc={desc[:160]!r}")
            if placeholder: bits.append(f"placeholder={placeholder[:160]!r}")
            if domid: bits.append(f"id={domid[:120]!r}")
            if class_text: bits.append(f"class={class_text[:180]!r}")
            lines.append(f'{"  " * min(depth, 20)}{role}: ' + " | ".join(bits))

        children: list = []
        for attr_name in ("AXChildren", "AXContents", "AXRows", "AXWindows", "AXChildrenInNavigationOrder"):
            obj = _attr(node, attr_name)
            if obj is None or isinstance(obj, (str, bytes)):
                continue
            try:
                children.extend(list(obj))
            except TypeError:
                pass
        for child in children:
            visit(child, depth + 1)

    visit(root, 0)
    histogram = "\n".join(
        f"{role or '(none)'}={count}"
        for role, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    )
    return (
        f"visited_nodes={visited}\n"
        f"===== ROLE HISTOGRAM =====\n{histogram}\n"
        f"===== MEANINGFUL NODES =====\n" + "\n".join(lines)
    )


def _parameterized_names(element) -> list[str]:
    fn = getattr(AS, "AXUIElementCopyParameterizedAttributeNames", None)
    if fn is None:
        return []
    try:
        err, names = fn(element, None)
        if err == 0 and names:
            return [str(x) for x in names]
    except Exception:
        pass
    return []


def _parameterized_value(element, name: str, parameter):
    fn = getattr(AS, "AXUIElementCopyParameterizedAttributeValue", None)
    if fn is None:
        return None
    try:
        err, value = fn(element, name, parameter, None)
        if err == 0:
            return value
    except Exception:
        pass
    return None


def _find_role_nodes(app_name: str, wanted_role: str, max_depth: int = 40, max_nodes: int = 20000):
    pid = find_pid(app_name)
    if pid is None:
        raise RuntimeError(f"{app_name} is not running")
    enable_enhanced_accessibility(app_name)
    root = AXUIElementCreateApplication(pid)
    found = []
    seen: set[str] = set()
    visited = 0

    def visit(node, depth: int):
        nonlocal visited
        if depth > max_depth or visited >= max_nodes:
            return
        ident = str(node)
        if ident in seen:
            return
        seen.add(ident)
        visited += 1

        if str(_attr(node, "AXRole") or "") == wanted_role:
            found.append(node)

        children = []
        for attr_name in ("AXChildren", "AXContents", "AXRows", "AXWindows", "AXChildrenInNavigationOrder"):
            obj = _attr(node, attr_name)
            if obj is None or isinstance(obj, (str, bytes)):
                continue
            try:
                children.extend(list(obj))
            except TypeError:
                pass
        for child in children:
            visit(child, depth + 1)

    visit(root, 0)
    return found


def webarea_text_dump(app_name: str) -> str:
    """Try Chromium's text-marker API to read WebArea text as one string."""
    webareas = _find_role_nodes(app_name, "AXWebArea")
    lines = [f"webareas={len(webareas)}"]

    range_create = getattr(AS, "AXTextMarkerRangeCreate", None)
    if range_create is None:
        lines.append("AXTextMarkerRangeCreate unavailable in this PyObjC build")

    for i, area in enumerate(webareas):
        title = str(_attr(area, "AXTitle") or "")
        loaded = _attr(area, "AXLoaded")
        busy = _attr(area, "AXElementBusy")
        count = _attr(area, "AXNumberOfCharacters")
        params = _parameterized_names(area)
        lines.append(
            f"===== WEBAREA {i} title={title!r} loaded={loaded!r} busy={busy!r} chars={count!r} ====="
        )
        lines.append("parameterized=" + ",".join(params))

        direct_value = _attr(area, "AXValue")
        if isinstance(direct_value, str) and direct_value.strip():
            lines.append("AXValue:")
            lines.append(direct_value)

        start = _attr(area, "AXStartTextMarker")
        end = _attr(area, "AXEndTextMarker")
        if start is None or end is None or range_create is None:
            lines.append("text-marker range unavailable")
            continue

        try:
            marker_range = range_create(None, start, end)
        except Exception as exc:
            lines.append(f"marker-range-create-error={exc}")
            continue

        candidates = [
            "AXStringForTextMarkerRange",
            "AXAttributedStringForTextMarkerRange",
        ]
        got = False
        for attr_name in candidates:
            if attr_name not in params:
                continue
            value = _parameterized_value(area, attr_name, marker_range)
            if value is None:
                continue
            lines.append(attr_name + ":")
            lines.append(str(value))
            got = True
            break
        if not got:
            lines.append("no text-marker string parameter returned a value")

    return "\n".join(lines)


def webarea_text(app_name: str) -> str:
    """Return the longest non-empty Chromium WebArea text snapshot."""
    webareas = _find_role_nodes(app_name, "AXWebArea")
    range_create = getattr(AS, "AXTextMarkerRangeCreate", None)
    if range_create is None:
        return ""

    candidates: list[str] = []
    for area in webareas:
        start = _attr(area, "AXStartTextMarker")
        end = _attr(area, "AXEndTextMarker")
        if start is None or end is None:
            continue
        try:
            marker_range = range_create(None, start, end)
        except Exception:
            continue
        params = _parameterized_names(area)
        if "AXStringForTextMarkerRange" not in params:
            continue
        value = _parameterized_value(area, "AXStringForTextMarkerRange", marker_range)
        if isinstance(value, str) and value.strip():
            candidates.append(value.strip())

    return max(candidates, key=len) if candidates else ""



def generation_in_progress(app_name: str) -> bool:
    """Passively detect whether a Chromium/Electron chat is still generating.

    This does not activate the app or touch the clipboard. It first checks
    AXElementBusy on WebAreas, then looks for generation-stop buttons.
    """
    try:
        for area in _find_role_nodes(app_name, "AXWebArea", max_depth=30, max_nodes=8000):
            if bool(_attr(area, "AXElementBusy")):
                return True

        stop_markers = (
            "stop response",
            "stop generating",
            "stop generation",
            "cancel response",
            "停止生成",
            "停止回应",
            "停止回复",
        )
        for button in _find_role_nodes(app_name, "AXButton", max_depth=30, max_nodes=8000):
            text = " ".join(
                str(_attr(button, attr) or "")
                for attr in ("AXTitle", "AXValue", "AXDescription", "AXHelp")
            ).casefold()
            if any(marker in text for marker in stop_markers):
                return True
    except Exception:
        return False
    return False


def cancel_generation(app_name: str) -> bool:
    """Best-effort cancellation for a visibly stuck generation.

    Uses Escape only when an explicit watchdog asks for cancellation.
    Normal reads never send Escape.
    """
    try:
        activate_app(app_name)
        time.sleep(0.2)
        run_osascript(
            '''
            tell application "System Events"
                key code 53
            end tell
            '''
        )
        return True
    except Exception:
        return False

def frontmost_app_name() -> str:
    try:
        app = NSWorkspace.sharedWorkspace().frontmostApplication()
        return str(app.localizedName() or "")
    except Exception:
        return ""


def select_all_copy_text(app_name: str, settle: float = 0.25) -> str:
    """Best-effort read fallback using Cmd+A / Cmd+C.

    This is intended for Electron apps whose AX WebArea exposes no text-marker
    content (currently Claude on the tested macOS build). It restores the
    user's clipboard after the read. Deliberately do NOT press Escape: in
    Claude, Escape can cancel an in-progress generation.
    """
    old_clipboard = get_clipboard()
    previous_app = frontmost_app_name()
    activate_app(app_name)
    time.sleep(settle)
    try:
        run_osascript(
            '''
            tell application "System Events"
                keystroke "a" using command down
                delay 0.15
                keystroke "c" using command down
                delay 0.25
            end tell
            '''
        )
        copied = get_clipboard()
        return copied.strip()
    finally:
        set_clipboard(old_clipboard)
        if previous_app and previous_app.casefold() != app_name.casefold():
            try:
                activate_app(previous_app)
            except Exception:
                pass


def focused_element_info(app_name: str) -> tuple[str, str, str]:
    """Return (role, placeholder, description) for the focused AX element."""
    pid = find_pid(app_name)
    if pid is None:
        return "", "", ""
    enable_enhanced_accessibility(app_name)
    app = AXUIElementCreateApplication(pid)
    focused = _attr(app, "AXFocusedUIElement")
    if focused is None:
        return "", "", ""
    role = str(_attr(focused, "AXRole") or "")
    placeholder = str(_attr(focused, "AXPlaceholderValue") or "")
    desc = str(_attr(focused, "AXDescription") or "")
    return role, placeholder, desc


def focus_chat_input(app_name: str, max_tabs: int = 24) -> bool:
    """Best-effort keyboard focus search for a chat composer.

    Avoids fixed screen coordinates. It activates the app and cycles Tab until
    the focused AX element looks editable.
    """
    activate_app(app_name)
    time.sleep(0.25)

    for _ in range(max_tabs + 1):
        role, placeholder, desc = focused_element_info(app_name)
        hint = (placeholder + " " + desc).casefold()
        if role in ("AXTextArea", "AXTextField") or any(
            token in hint
            for token in ("message", "chatgpt", "claude", "消息", "发送消息", "发消息")
        ):
            return True

        run_osascript(
            '''
            tell application "System Events"
                key code 48
                delay 0.08
            end tell
            '''
        )

    return False


def paste_into_chat(app_name: str, text: str, enter: bool = True) -> None:
    """Focus a chat composer if possible, then paste and optionally send."""
    set_clipboard(text)
    focus_chat_input(app_name)
    time.sleep(0.1)
    enter_line = "key code 36" if enter else ""
    run_osascript(
        f'''
        tell application "System Events"
            keystroke "v" using command down
            delay 0.12
            {enter_line}
        end tell
        '''
    )


def notify_user(title: str, message: str) -> None:
    """Show a macOS notification without stealing focus."""
    safe_title = title.replace("\\", "\\\\").replace('"', '\\"')
    safe_message = message.replace("\\", "\\\\").replace('"', '\\"')
    try:
        run_osascript(
            f'display notification "{safe_message}" with title "{safe_title}"'
        )
    except Exception:
        pass


CHAT_COMPOSER_HINTS = (
    "message",
    "send a message",
    "ask anything",
    "chatgpt",
    "prompt",
    "消息",
    "发送消息",
)

SEND_BUTTON_HINTS = (
    "send",
    "send message",
    "submit",
    "发送",
    "发送消息",
)


def _node_text(node) -> str:
    return " ".join(
        str(_attr(node, attr) or "")
        for attr in ("AXTitle", "AXValue", "AXDescription", "AXHelp", "AXPlaceholderValue")
    ).casefold()


def _find_background_composer(app_name: str):
    """Find a likely chat composer without activating the application."""
    candidates = []
    for role in ("AXTextArea", "AXTextField"):
        try:
            candidates.extend(_find_role_nodes(app_name, role, max_depth=40, max_nodes=16000))
        except Exception:
            continue

    scored = []
    for node in candidates:
        text = _node_text(node)
        score = sum(1 for hint in CHAT_COMPOSER_HINTS if hint in text)
        if score:
            scored.append((score, node))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def _find_background_send_button(app_name: str):
    try:
        buttons = _find_role_nodes(app_name, "AXButton", max_depth=40, max_nodes=16000)
    except Exception:
        return None
    scored = []
    for button in buttons:
        text = _node_text(button)
        score = sum(1 for hint in SEND_BUTTON_HINTS if hint in text)
        if score:
            scored.append((score, button))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def _perform_ax_action(element, action: str) -> bool:
    fn = getattr(AS, "AXUIElementPerformAction", None)
    if fn is None:
        return False
    try:
        return fn(element, action) == 0
    except Exception:
        return False


def background_send_chat_message(app_name: str, text: str) -> bool:
    """Best-effort true background send using Accessibility only.

    Does not activate the target application and does not touch the clipboard.
    Returns False when the current app build does not expose a writable composer
    and pressable send button, allowing callers to decide whether a foreground
    fallback is acceptable.
    """
    try:
        composer = _find_background_composer(app_name)
        if composer is None:
            return False
        err = AXUIElementSetAttributeValue(composer, "AXValue", text)
        if err != 0:
            return False

        # Give Chromium/Electron a moment to update the enabled state of Send.
        time.sleep(0.08)
        button = _find_background_send_button(app_name)
        if button is None:
            return False
        return _perform_ax_action(button, "AXPress")
    except Exception:
        return False
