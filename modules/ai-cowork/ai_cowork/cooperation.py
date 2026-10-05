from __future__ import annotations

import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Callable


class ProtocolState(str, Enum):
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    OWN_WORK_ALLOWED = "OWN_WORK_ALLOWED"
    STATUS_REQUIRED = "STATUS_REQUIRED"
    READY = "READY"


@dataclass(frozen=True)
class AgentProtocolState:
    agent: str
    state: ProtocolState
    detail: str
    peer_head: str
    own_head: str
    latest_review: str
    latest_status: str


def evaluate_protocol_state(
    agent: str,
    own_head: str,
    peer_head: str,
    own_ts: int,
    peer_ts: int,
    review_ts: int,
    status_ts: int,
    review_path: str = "",
    status_path: str = "",
    reviewed_peer_head: str = "",
    review_own_head: str = "",
    status_own_head: str = "",
    review_after_status: bool | None = None,
) -> AgentProtocolState:
    review_current = (
        reviewed_peer_head == peer_head
        if reviewed_peer_head
        else review_ts >= peer_ts and review_ts > 0
    )
    status_current = (
        status_own_head == own_head
        if status_own_head
        else status_ts >= own_ts and status_ts > 0
    )

    if not review_current:
        return AgentProtocolState(
            agent,
            ProtocolState.REVIEW_REQUIRED,
            f"{agent} must write a fresh review of the current peer branch before own work.",
            peer_head,
            own_head,
            review_path or "(none)",
            status_path or "(none)",
        )

    # New-format messages carry enough exact SHA metadata to avoid comparing
    # timestamps across separate Git branches.
    if review_own_head:
        if review_after_status is False and status_current:
            return AgentProtocolState(
                agent,
                ProtocolState.READY,
                f"{agent} finished the previous cycle; write a new review before starting another work cycle.",
                peer_head,
                own_head,
                review_path or "(none)",
                status_path or "(none)",
            )

        own_changed_since_review = own_head != review_own_head
        if own_changed_since_review and not status_current:
            return AgentProtocolState(
                agent,
                ProtocolState.STATUS_REQUIRED,
                f"{agent} changed its own branch after review and must append a status for the current own head.",
                peer_head,
                own_head,
                review_path or "(none)",
                status_path or "(none)",
            )

        if review_after_status is True:
            return AgentProtocolState(
                agent,
                ProtocolState.OWN_WORK_ALLOWED,
                f"{agent} completed the fresh peer review gate and may work on its owned branch.",
                peer_head,
                own_head,
                review_path or "(none)",
                status_path or "(none)",
            )

        if review_after_status is None:
            return AgentProtocolState(
                agent,
                ProtocolState.REVIEW_REQUIRED,
                f"{agent} has ambiguous review/status ordering; append a new review before own work.",
                peer_head,
                own_head,
                review_path or "(none)",
                status_path or "(none)",
            )

    # Legacy fallback for older coordination messages that lack exact SHA
    # metadata. This remains for backward compatibility only.
    if own_ts > review_ts and not status_current:
        return AgentProtocolState(
            agent,
            ProtocolState.STATUS_REQUIRED,
            f"{agent} has newer own-branch work and must append a status for the current own head.",
            peer_head,
            own_head,
            review_path or "(none)",
            status_path or "(none)",
        )

    if review_ts > status_ts and review_current:
        return AgentProtocolState(
            agent,
            ProtocolState.OWN_WORK_ALLOWED,
            f"{agent} completed the fresh peer review gate and may work on its owned branch.",
            peer_head,
            own_head,
            review_path or "(none)",
            status_path or "(none)",
        )

    if status_current and status_ts >= review_ts:
        return AgentProtocolState(
            agent,
            ProtocolState.READY,
            f"{agent} finished the previous cycle; write a new review before starting another work cycle.",
            peer_head,
            own_head,
            review_path or "(none)",
            status_path or "(none)",
        )

    return AgentProtocolState(
        agent,
        ProtocolState.REVIEW_REQUIRED,
        f"{agent} needs a fresh review before the next own-work cycle.",
        peer_head,
        own_head,
        review_path or "(none)",
        status_path or "(none)",
    )


@dataclass(frozen=True)
class CoordinationSnapshot:
    chatgpt_head: str
    cursor_head: str
    coordination_head: str
    latest_message: str
    chatgpt_protocol: AgentProtocolState | None = None
    cursor_protocol: AgentProtocolState | None = None


class ProtocolGate:
    """Thread-safe latest cooperation state shared with web supervisors."""

    def __init__(self, max_snapshot_age_seconds: float = 35.0) -> None:
        self._lock = threading.Lock()
        self._snapshot: CoordinationSnapshot | None = None
        self._snapshot_at: float | None = None
        self._enabled = False
        self.max_snapshot_age_seconds = max(5.0, float(max_snapshot_age_seconds))

    def enable(self) -> None:
        with self._lock:
            self._enabled = True

    def disable(self) -> None:
        with self._lock:
            self._enabled = False
            self._snapshot = None
            self._snapshot_at = None

    def update(self, snapshot: CoordinationSnapshot) -> None:
        with self._lock:
            self._snapshot = snapshot
            self._snapshot_at = time.monotonic()

    def invalidate(self) -> None:
        with self._lock:
            if self._enabled:
                self._snapshot_at = None

    def is_fresh(self) -> bool:
        with self._lock:
            if not self._enabled:
                return True
            if self._snapshot is None or self._snapshot_at is None:
                return False
            age = time.monotonic() - self._snapshot_at
            return age <= self.max_snapshot_age_seconds

    def snapshot(self) -> CoordinationSnapshot | None:
        with self._lock:
            return self._snapshot

    def state_for(self, agent: str) -> AgentProtocolState | None:
        snap = self.snapshot()
        if snap is None:
            return None
        if agent == "chatgpt":
            return snap.chatgpt_protocol
        if agent == "cursor":
            return snap.cursor_protocol
        raise ValueError(f"Unknown agent: {agent}")

    def allows_own_work(self, agent: str) -> bool:
        with self._lock:
            enabled = self._enabled
        if not enabled:
            return True
        if not self.is_fresh():
            return False
        state = self.state_for(agent)
        if state is None:
            return False
        return state.state is ProtocolState.OWN_WORK_ALLOWED

    def block_reason(self, agent: str) -> str:
        with self._lock:
            enabled = self._enabled
        if not enabled:
            return ""
        if not self.is_fresh():
            with self._lock:
                has_snapshot = self._snapshot is not None
            if has_snapshot:
                return "STALE_COORDINATION: protocol snapshot expired; waiting for a fresh Git fetch."
            return "WAITING_FOR_COORDINATION: first protocol snapshot has not arrived yet."
        state = self.state_for(agent)
        if state is None:
            return "WAITING_FOR_COORDINATION: first protocol snapshot has not arrived yet."
        if self.allows_own_work(agent):
            return ""
        return f"{state.state.value}: {state.detail}"


class GitCoordinationMonitor:
    """GitHub-native protocol monitor using the repository's existing git remote."""

    def __init__(
        self,
        repo_path: str | Path = ".",
        poll_seconds: float = 10.0,
        on_status: Callable[[str], None] | None = None,
        on_snapshot: Callable[[CoordinationSnapshot], None] | None = None,
        on_error: Callable[[Exception], None] | None = None,
    ) -> None:
        self.repo_path = Path(repo_path).resolve()
        self.poll_seconds = max(3.0, float(poll_seconds))
        self.on_status = on_status or (lambda _: None)
        self.on_snapshot = on_snapshot or (lambda _: None)
        self.on_error = on_error or (lambda _: None)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last: CoordinationSnapshot | None = None

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self) -> bool:
        if self.running:
            return False
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="ai-cowork-coordination-monitor",
            daemon=True,
        )
        self._thread.start()
        return True

    def stop(self) -> None:
        self._stop.set()

    def _git(self, *args: str, timeout: float = 30.0) -> str:
        result = subprocess.run(
            ["git", "-C", str(self.repo_path), *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "git command failed")
        return result.stdout.strip()

    def _branch_timestamp(self, branch: str) -> int:
        raw = self._git("log", "-1", "--format=%ct", branch)
        return int(raw or "0")

    def _path_timestamp(self, branch: str, path: str) -> int:
        if not path or path.startswith("("):
            return 0
        raw = self._git("log", "-1", "--format=%ct", branch, "--", path)
        return int(raw or "0")

    @staticmethod
    def _latest_matching(names: list[str], agent: str, kind: str) -> str:
        needle = f"-{agent}-{kind}.md"
        matches = sorted(name for name in names if name.endswith(needle))
        return matches[-1] if matches else ""

    def _path_commit(self, path: str) -> str:
        if not path or path.startswith("("):
            return ""
        return self._git(
            "log",
            "-1",
            "--format=%H",
            "origin/coordination",
            "--",
            path,
        )

    def _is_commit_after(self, newer: str, older: str) -> bool | None:
        if not newer:
            return False
        if not older:
            return True
        if newer == older:
            return None
        result = subprocess.run(
            [
                "git",
                "-C",
                str(self.repo_path),
                "merge-base",
                "--is-ancestor",
                older,
                newer,
            ],
            capture_output=True,
            text=True,
            timeout=15.0,
            check=False,
        )
        if result.returncode == 0:
            return True
        if result.returncode == 1:
            return False
        return None

    def _read_coordination_path(self, path: str) -> str:
        if not path or path.startswith("("):
            return ""
        return self._git("show", f"origin/coordination:{path}")

    @staticmethod
    def _message_field(content: str, field: str) -> str:
        prefix = f"- {field}:"
        for line in (content or "").splitlines():
            stripped = line.strip()
            if stripped.startswith(prefix):
                return stripped[len(prefix):].strip()
        return ""

    def _protocol_state(
        self,
        agent: str,
        own_branch: str,
        peer_branch: str,
        names: list[str],
    ) -> AgentProtocolState:
        own_head = self._git("rev-parse", "--short=12", own_branch)
        peer_head = self._git("rev-parse", "--short=12", peer_branch)
        own_ts = self._branch_timestamp(own_branch)
        peer_ts = self._branch_timestamp(peer_branch)

        review_path = self._latest_matching(names, agent, "review")
        status_path = self._latest_matching(names, agent, "status")
        review_ts = self._path_timestamp("origin/coordination", review_path)
        status_ts = self._path_timestamp("origin/coordination", status_path)
        review_content = self._read_coordination_path(review_path)
        status_content = self._read_coordination_path(status_path)
        reviewed_peer_head = self._message_field(
            review_content, "Peer head reviewed"
        )
        review_own_head = self._message_field(
            review_content, "Own head"
        )
        status_own_head = self._message_field(
            status_content, "Own head"
        )
        review_commit = self._path_commit(review_path)
        status_commit = self._path_commit(status_path)
        review_after_status = self._is_commit_after(
            review_commit,
            status_commit,
        )

        return evaluate_protocol_state(
            agent=agent,
            own_head=own_head,
            peer_head=peer_head,
            own_ts=own_ts,
            peer_ts=peer_ts,
            review_ts=review_ts,
            status_ts=status_ts,
            review_path=review_path,
            status_path=status_path,
            reviewed_peer_head=reviewed_peer_head,
            review_own_head=review_own_head,
            status_own_head=status_own_head,
            review_after_status=review_after_status,
        )

    def snapshot(self) -> CoordinationSnapshot:
        self._git(
            "fetch",
            "--quiet",
            "origin",
            "coordination",
            "agent/chatgpt",
            "agent/cursor",
        )
        chatgpt = self._git("rev-parse", "--short=12", "origin/agent/chatgpt")
        cursor = self._git("rev-parse", "--short=12", "origin/agent/cursor")
        coord = self._git("rev-parse", "--short=12", "origin/coordination")

        names = self._git(
            "ls-tree",
            "-r",
            "--name-only",
            "origin/coordination",
            "messages",
        ).splitlines()
        markdown = sorted(
            name
            for name in names
            if name.endswith(".md") and not name.endswith("README.md")
        )
        latest = markdown[-1] if markdown else "(no coordination messages yet)"

        chatgpt_protocol = self._protocol_state(
            "chatgpt",
            "origin/agent/chatgpt",
            "origin/agent/cursor",
            markdown,
        )
        cursor_protocol = self._protocol_state(
            "cursor",
            "origin/agent/cursor",
            "origin/agent/chatgpt",
            markdown,
        )

        return CoordinationSnapshot(
            chatgpt,
            cursor,
            coord,
            latest,
            chatgpt_protocol,
            cursor_protocol,
        )

    def _describe_change(
        self,
        previous: CoordinationSnapshot | None,
        current: CoordinationSnapshot,
    ) -> str:
        protocol = (
            f"ChatGPT={current.chatgpt_protocol.state.value if current.chatgpt_protocol else 'UNKNOWN'}, "
            f"Cursor={current.cursor_protocol.state.value if current.cursor_protocol else 'UNKNOWN'}"
        )
        if previous is None:
            return (
                "Cooperation connected — "
                f"ChatGPT {current.chatgpt_head}, Cursor {current.cursor_head}, "
                f"latest {current.latest_message}; {protocol}."
            )

        changed: list[str] = []
        if current.chatgpt_head != previous.chatgpt_head:
            changed.append("ChatGPT branch updated")
        if current.cursor_head != previous.cursor_head:
            changed.append("Cursor branch updated")
        if current.coordination_head != previous.coordination_head:
            changed.append(f"coordination updated ({current.latest_message})")

        previous_states = (
            previous.chatgpt_protocol.state if previous.chatgpt_protocol else None,
            previous.cursor_protocol.state if previous.cursor_protocol else None,
        )
        current_states = (
            current.chatgpt_protocol.state if current.chatgpt_protocol else None,
            current.cursor_protocol.state if current.cursor_protocol else None,
        )
        if current_states != previous_states:
            changed.append(f"protocol {protocol}")

        if not changed:
            return ""
        return "Cooperation: " + "; ".join(changed) + "."

    def _run(self) -> None:
        try:
            while not self._stop.is_set():
                try:
                    current = self.snapshot()
                    message = self._describe_change(self._last, current)
                    self._last = current
                    self.on_snapshot(current)
                    if message:
                        self.on_status(message)
                except Exception as exc:
                    # Cooperation failures are isolated from the browser runtime,
                    # but any cached protocol permission must be invalidated.
                    try:
                        self.on_error(exc)
                    except Exception:
                        pass
                    self.on_status(f"Cooperation monitor error: {exc}")
                self._stop.wait(self.poll_seconds)
        finally:
            self._thread = None


def chatgpt_peer_review_instruction() -> str:
    return (
        "Before continuing your own work: read the latest commits on agent/cursor "
        "and all new files on coordination/messages. Write a NEW append-only "
        "review/advice message on coordination. Then continue only on agent/chatgpt. "
        "Never write main."
    )


def cursor_peer_review_instruction() -> str:
    return (
        "Before continuing your own work: read the latest commits on agent/chatgpt "
        "and all new files on coordination/messages. Write a NEW append-only "
        "review/advice message on coordination. Then continue only on agent/cursor. "
        "Never write main."
    )


MESSAGE_KINDS = {"review", "status", "handoff"}


def coordination_message_filename(
    agent: str,
    kind: str,
    when: datetime | None = None,
) -> str:
    if agent not in {"chatgpt", "cursor"}:
        raise ValueError("agent must be chatgpt or cursor")
    if kind not in MESSAGE_KINDS:
        raise ValueError("kind must be review, status, or handoff")
    stamp = (when or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return f"messages/{stamp:%Y%m%d-%H%M%S}-{agent}-{kind}.md"


def render_coordination_message(
    agent: str,
    kind: str,
    *,
    summary: str,
    peer_head: str = "",
    own_head: str = "",
    status: str = "",
    next_action: str = "",
) -> str:
    if kind not in MESSAGE_KINDS:
        raise ValueError("kind must be review, status, or handoff")
    if kind == "review" and (not peer_head or not own_head):
        raise ValueError("review messages require peer_head and own_head")
    if kind == "status" and not own_head:
        raise ValueError("status messages require own_head")
    lines = [
        f"# {kind.title()} — {agent}",
        "",
        f"- Agent: {agent}",
        f"- Type: {kind}",
    ]
    if status:
        lines.append(f"- Status: {status}")
    if peer_head:
        lines.append(f"- Peer head reviewed: {peer_head}")
    if own_head:
        lines.append(f"- Own head: {own_head}")
    lines.extend(["", "## Summary", "", summary.strip() or "(none)"])
    if next_action:
        lines.extend(["", "## Next action", "", next_action.strip()])
    lines.append("")
    return "\n".join(lines)


def protocol_next_action(state: AgentProtocolState) -> str:
    if state.state is ProtocolState.REVIEW_REQUIRED:
        return (
            f"Review peer head {state.peer_head}, then append a NEW review message "
            f"that records Peer head reviewed={state.peer_head} and Own head={state.own_head}."
        )
    if state.state is ProtocolState.STATUS_REQUIRED:
        return (
            f"Append a NEW status message for own head {state.own_head}; "
            "include completed work, validation, blockers, and the next action."
        )
    if state.state is ProtocolState.OWN_WORK_ALLOWED:
        return (
            f"Work only on the owned branch at {state.own_head}; do not write main. "
            "After committing, append a NEW status message for the new own head."
        )
    return (
        "The previous cycle is complete. Start the next cycle with a NEW peer review "
        "before doing more own-branch work."
    )


def draft_required_coordination_message(
    state: AgentProtocolState,
    *,
    summary: str,
    status: str = "",
    next_action: str = "",
) -> tuple[str, str]:
    if state.state in {ProtocolState.REVIEW_REQUIRED, ProtocolState.READY}:
        kind = "review"
        path = coordination_message_filename(state.agent, kind)
        body = render_coordination_message(
            state.agent,
            kind,
            summary=summary,
            peer_head=state.peer_head,
            own_head=state.own_head,
            status=status or "REVIEWED",
            next_action=next_action or protocol_next_action(state),
        )
        return path, body

    if state.state is ProtocolState.STATUS_REQUIRED:
        kind = "status"
        path = coordination_message_filename(state.agent, kind)
        body = render_coordination_message(
            state.agent,
            kind,
            summary=summary,
            own_head=state.own_head,
            status=status or "READY",
            next_action=next_action or protocol_next_action(state),
        )
        return path, body

    raise ValueError(
        "No protocol message is required while OWN_WORK_ALLOWED; work first, then status."
    )


class ProtocolDraftStore:
    """Writes local, non-Git protocol guidance/drafts for each agent."""

    def __init__(self, directory: str | Path = "state/protocol_drafts") -> None:
        self.directory = Path(directory)

    def write_agent(self, state: AgentProtocolState) -> Path:
        self.directory.mkdir(parents=True, exist_ok=True)
        target = self.directory / f"{state.agent}.md"

        lines = [
            f"# Protocol guidance — {state.agent}",
            "",
            f"- State: {state.state.value}",
            f"- Own head: {state.own_head}",
            f"- Peer head: {state.peer_head}",
            "",
            "## Required next action",
            "",
            protocol_next_action(state),
        ]

        if state.state is not ProtocolState.OWN_WORK_ALLOWED:
            try:
                message_path, body = draft_required_coordination_message(
                    state,
                    summary=(
                        "Replace this placeholder with a concise factual summary "
                        "before publishing to coordination."
                    ),
                )
                lines.extend(
                    [
                        "",
                        "## Suggested coordination message",
                        "",
                        f"Target path: `{message_path}`",
                        "",
                        "```markdown",
                        body.rstrip(),
                        "```",
                    ]
                )
            except ValueError:
                pass

        temp = target.with_suffix(".md.tmp")
        temp.write_text("\n".join(lines) + "\n", encoding="utf-8")
        temp.replace(target)
        return target

    def write_snapshot(
        self,
        snapshot: CoordinationSnapshot,
    ) -> tuple[Path | None, Path | None]:
        chat_path = (
            self.write_agent(snapshot.chatgpt_protocol)
            if snapshot.chatgpt_protocol is not None
            else None
        )
        cursor_path = (
            self.write_agent(snapshot.cursor_protocol)
            if snapshot.cursor_protocol is not None
            else None
        )
        return chat_path, cursor_path
