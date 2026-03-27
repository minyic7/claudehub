---
description: Create, update, delete, and manage tickets on the Kanban board via the ClaudeHub API
---

# Ticket CRUD

You can manage tickets through the ClaudeHub REST API. All requests use JSON body and return JSON.

## Create Ticket

```bash
curl -s -X POST "$API_BASE/api/projects/$PROJECT_ID/tickets" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Short descriptive title",
    "description": "Detailed description of what needs to be done",
    "type": "feature",
    "priority": 1,
    "dependencies": []
  }'
```

- **title**: Max 72 chars, letters/numbers/spaces/hyphens only
- **type**: `feature | bugfix | refactor | docs | chore`
- **priority**: Optional (auto-assigned max+1). Must be >= 1 (0 is system-reserved). Unique per project
- **dependencies**: Optional array of ticket numbers that must be merged first

## Update Ticket

```bash
curl -s -X PATCH "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "status": "in_progress",
    "priority": 2,
    "dependencies": [1, 3],
    "taskBrief": "Detailed task brief for Ticket CC..."
  }'
```

Updatable fields: `description, status, priority, dependencies, taskBrief`
Immutable fields: `title, type, branchName`

### Status Transitions

- `todo` -> `in_progress` (requires: all dependencies merged)
- `in_progress` -> `todo` (discards changes, resets to base branch)
- `in_progress` -> `reviewing` (requires: CI passed)
- `reviewing` -> `in_progress` (rejection, set returnReason)
- `reviewing` -> `todo` (shelve, discards changes)
- Cannot set `status: "merged"` via PATCH (use merge endpoint)

### taskBrief

Write a detailed task brief when moving a ticket to `in_progress`. This becomes the Ticket CC's system prompt. Include:
- What to implement (specific requirements from description)
- Relevant code context (files to modify, architecture notes)
- Dependencies context (what related tickets changed)
- Acceptance criteria
- Testing expectations

## Delete Ticket

```bash
curl -s -X DELETE "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER"
```

If other tickets depend on this one, returns 409 with dependent list. Use `?cascade=true` to delete dependents too.

## Merge Ticket

```bash
curl -s -X POST "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER/merge"
```

Prerequisites: status=reviewing, CI passed, no active merge, all dependencies merged.
Returns 202 (async). Creates PR with "Closes #N", squash merges, waits for CD.

## List Tickets

```bash
curl -s "$API_BASE/api/projects/$PROJECT_ID/tickets"
curl -s "$API_BASE/api/projects/$PROJECT_ID/tickets?status=in_progress"
curl -s "$API_BASE/api/projects/$PROJECT_ID/tickets?priority=1"
```

## View Board

```bash
curl -s "$API_BASE/api/projects/$PROJECT_ID/board"
```

Returns columns (todo, in_progress, reviewing, merged) with tickets sorted by priority.
