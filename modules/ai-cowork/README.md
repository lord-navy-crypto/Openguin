# AI-cowork

AI-cowork now uses a **web-first** architecture.

## Current main product

A small macOS control app for:

- **ChatGPT Web Supervisor**
- **Cursor Web Supervisor**
- **ChatGPT ↔ Cursor Cooperation**
- persistent dedicated browser login state
- optional hidden/headless running after login

The old ChatGPT desktop Accessibility implementation remains in repository history, but is no longer the default path.

## Install / update

```bash
cd ~/AI-cowork
git checkout main
git pull
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

## Launch

```bash
python main.py
```

The control window has:

- ChatGPT work URL
- Cursor Agent URL
- independent ChatGPT Supervisor / Cursor Supervisor / Cooperation switches
- separate status lines for all three modules
- Save Settings
- Start Web Runtime
- Open/Login Session
- Run hidden after login

All three modules share one persistent Chromium runtime so the browser profile is never opened concurrently by multiple processes.

Settings are stored locally in:

```text
state/web_settings.json
```

Browser login/session state is stored locally in:

```text
state/browser-profile/
```

Do not put passwords, cookies, or session tokens into configuration files.

## First run

1. Paste the dedicated ChatGPT work conversation URL.
2. Paste the Cursor Agent URL.
3. Click **Open/Login Session**.
4. Sign in to ChatGPT and Cursor inside the dedicated Chromium window if needed.
5. Close/stop the session after login state is saved.
6. Optionally enable **Run hidden after login**.
7. Click **Start Web Supervisor**.

## Supervisor behavior

The ChatGPT supervisor:

1. opens the saved ChatGPT conversation;
2. waits while ChatGPT is generating;
3. confirms the page is idle;
4. checks for context-limit messages;
5. enters the configured continue prompt;
6. sends it;
7. waits for the next generation cycle;
8. repeats until stopped.

Default prompt:

```text
Continue doing the current task. Keep working from where you stopped.
Do not restart or summarize unless necessary; continue the actual work.
```

## CLI

Check Playwright and Chromium:

```bash
python main.py doctor
```

Run without opening the control panel:

```bash
python main.py supervisor
```

## Cursor + GitHub coordination

The future multi-agent architecture remains GitHub-native:

```text
agent/chatgpt
agent/cursor
coordination
```

ChatGPT and Cursor should communicate through the append-only `coordination` branch rather than copying chat text between UIs.

DeepSeek is not part of the architecture.


## Three-module product direction

Desktop/App Accessibility automation is frozen for now. Active development is limited to:

1. ChatGPT Web Supervisor
2. Cursor Web Supervisor
3. ChatGPT ↔ Cursor Cooperation

See `WEB_ARCHITECTURE.md` for the current design and branch protocol.


## Cooperation diagnostics

Show the current gate state for both agents:

```bash
python main.py protocol
```

Draft the coordination message currently required by the protocol:

```bash
python main.py draft-message chatgpt --summary "Reviewed the current Cursor changes."
python main.py draft-message cursor --summary "Finished and validated the current Cursor work."
```

Draft generation does not push or modify the coordination branch automatically.

When Cooperation is enabled, automatic web actions are blocked until a valid protocol snapshot is available. Only `OWN_WORK_ALLOWED` permits automatic own-work actions.

## Runtime diagnostics

The controller maintains local crash-friendly diagnostics:

```text
state/runtime_status.json
state/events.jsonl
state/events.1.jsonl
```

`python main.py doctor` reports the last persisted module states when available.
