from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class CursorState(str, Enum):
    UNKNOWN = "UNKNOWN"
    LOGIN_REQUIRED = "LOGIN_REQUIRED"
    WORKING = "WORKING"
    READY = "READY"
    FAILED = "FAILED"
    WAITING = "WAITING"


class CursorAction(str, Enum):
    NONE = "NONE"
    CLICK_CONTINUE = "CLICK_CONTINUE"


@dataclass(frozen=True)
class CursorSnapshot:
    state: CursorState
    detail: str


def classify_cursor_text(text: str, url: str = "") -> CursorSnapshot:
    body = " ".join((text or "").casefold().split())
    lowered_url = (url or "").casefold()

    if "/login" in lowered_url or "/auth" in lowered_url:
        return CursorSnapshot(CursorState.LOGIN_REQUIRED, "Cursor login required.")

    login_markers = ("log in", "sign in", "登录", "sign up")
    if any(marker in body[:2500] for marker in login_markers):
        return CursorSnapshot(CursorState.LOGIN_REQUIRED, "Cursor login required.")

    failure_markers = (
        "agent failed",
        "task failed",
        "something went wrong",
        "error occurred",
        "failed to run",
        "could not complete",
    )
    if any(marker in body for marker in failure_markers):
        return CursorSnapshot(CursorState.FAILED, "Cursor Agent reports a failure.")

    working_markers = (
        "agent is working",
        "working on",
        "running",
        "stop agent",
        "cancel agent",
        "in progress",
    )
    if any(marker in body for marker in working_markers):
        return CursorSnapshot(CursorState.WORKING, "Cursor Agent is working.")

    waiting_markers = (
        "waiting for",
        "needs your input",
        "requires input",
        "continue?",
        "approve",
    )
    if any(marker in body for marker in waiting_markers):
        return CursorSnapshot(CursorState.WAITING, "Cursor Agent appears to need input.")

    ready_markers = (
        "completed",
        "finished",
        "done",
        "ready for review",
        "view changes",
        "create pull request",
    )
    if any(marker in body for marker in ready_markers):
        return CursorSnapshot(CursorState.READY, "Cursor Agent appears finished/ready.")

    return CursorSnapshot(CursorState.UNKNOWN, "Cursor page connected; state is not recognized yet.")



def decide_cursor_action(
    state: CursorState,
    has_continue_control: bool,
) -> CursorAction:
    """Conservative action gate: never act on ambiguous or terminal states."""
    if state is CursorState.WAITING and has_continue_control:
        return CursorAction.CLICK_CONTINUE
    return CursorAction.NONE
