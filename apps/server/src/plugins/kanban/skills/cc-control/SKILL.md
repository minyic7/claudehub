---
description: Start, stop, and send messages to Ticket CC processes for guidance and intervention
---

# CC Control

Manage Ticket CC processes through the ClaudeHub API.

## Check Ticket CC Status

```bash
curl -s "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER/cc"
```

Returns: `ccStatus` (idle/queued/running/completed), `pid`, `uptime`, `lastActiveAt`

## Start Ticket CC

Normally Ticket CC starts automatically when status changes to `in_progress`. Manual start:

```bash
curl -s -X POST "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER/cc"
```

Prerequisite: ticket must be `in_progress`.

## Stop Ticket CC

```bash
curl -s -X DELETE "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER/cc"
```

Sets ccStatus=idle. Ticket status remains unchanged (stays in_progress).

Use this when:
- Ticket CC is stuck in a loop
- You want to manually intervene before restarting
- The approach needs to be completely changed (stop, update taskBrief, restart)

## Send Message to Ticket CC

```bash
curl -s -X POST "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER/cc/messages" \
  -H "Content-Type: application/json" \
  -d '{"content": "Your message here"}'
```

The message is written to the CC's PTY stdin. Use for:

- **Course correction**: `[KANBAN] Change approach: use X library instead of Y`
- **Priority guidance**: `[KANBAN] This is blocking ticket #5, prioritize finishing`
- **Bug hints**: `[KANBAN] The failing test is related to the timezone handling in utils.ts`
- **Scope clarification**: `[KANBAN] Don't refactor the auth module, just fix the bug`

Prefix messages with `[KANBAN]` so Ticket CC knows it's from the Kanban manager, not a system event.

## Monitoring Strategy

Periodically check on running Ticket CCs:

1. Check ccStatus — is it still running?
2. Check lastActiveAt — has it been idle too long? (might be stuck)
3. Read the terminal output via WebSocket if needed
4. If stuck: send a nudge message, or stop and restart with updated taskBrief
