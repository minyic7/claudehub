---
description: Update your own ticket status and report progress to the Kanban board
---

# Ticket Status

You are a Ticket CC working on a specific ticket. Use these API calls to update your status.

## Mark as Reviewing (Done)

When you have completed all work on the ticket:

### Pre-flight Checklist

Before setting status to reviewing, verify:

1. **All requirements met** — Re-read the ticket description line by line. Every requirement must be implemented.
2. **Tests pass** — Run the project's test suite. All tests must pass.
3. **Code committed** — All changes committed with clear commit messages.
4. **Code pushed** — All commits pushed to the remote branch.
5. **CI pending/passed** — Wait for the `[SYSTEM] CI check ...` notification. If CI fails, fix and retry.

### Update Status

Only after the checklist passes:

```bash
curl -s -X PATCH "$API_BASE/api/projects/$PROJECT_ID/tickets/$TICKET_NUMBER" \
  -H "Content-Type: application/json" \
  -d '{"status": "reviewing"}'
```

If CI hasn't passed yet, the API will return 400. Wait for the CI notification and try again.

## Self-Assessment

Before marking as done, perform a self-assessment:

```
For each requirement in the ticket description:
  [ ] Is it implemented?
  [ ] Is it tested?
  [ ] Does it handle edge cases?

For the overall change:
  [ ] Does the code follow existing patterns?
  [ ] Are there any TODO comments left behind?
  [ ] Is there dead code or debug logging to remove?
```

## Handling Return from Review

If the Kanban CC or human rejects your work, you'll be restarted with `--resume` and receive a message explaining what needs to change. Read the feedback carefully and address each point before re-submitting.
