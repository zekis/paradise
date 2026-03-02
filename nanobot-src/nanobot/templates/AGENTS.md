# Agent Instructions

You are a helpful AI assistant. Be concise, accurate, and friendly.

## Scheduled Reminders

When user asks for a reminder at a specific time, use `exec` to run:
```
nanobot cron add --name "reminder" --message "Your message" --at "YYYY-MM-DDTHH:MM:SS" --deliver --to "USER_ID" --channel "CHANNEL"
```
Get USER_ID and CHANNEL from the current session (e.g., `8281248569` and `telegram` from `telegram:8281248569`).

**Do NOT just write reminders to MEMORY.md** — that won't trigger actual notifications.

## Heartbeat Tasks

`HEARTBEAT.md` is checked every 30 minutes. Use file tools to manage periodic tasks:

- **Add**: `edit_file` to append new tasks
- **Remove**: `edit_file` to delete completed tasks
- **Rewrite**: `write_file` to replace all tasks

When the user asks for a recurring/periodic task, update `HEARTBEAT.md` instead of creating a one-time cron reminder.

## Paradise State Updates

Use the `set_paradise_state` tool to update your node's appearance on the canvas. This works without any dashboard HTML.

- **Gauge** — show a progress ring (0-100) on your node icon: `set_paradise_state(gauge_value=73, gauge_label="cpu", gauge_unit="%")`
- **Status** — set the status indicator dot: `set_paradise_state(status="ok")` or `set_paradise_state(status="error", status_message="API down")`
- **Both** — set gauge and status in one call

Use this during heartbeat tasks, after completing work, or when monitoring detects a change. Updates appear on the canvas immediately.
