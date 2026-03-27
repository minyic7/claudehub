---
description: Review tickets that reach "reviewing" status - read diffs, check quality, approve or reject
---

# Ticket Review

When a ticket reaches `reviewing` status, perform a thorough code review.

## Review Process

### Step 1: Gather Context

```bash
# Read ticket details (extract branchName from response)
TICKET=$(curl -s "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER")
BRANCH_NAME=$(echo "$TICKET" | jq -r '.branchName')

# View the diff against base branch
git diff $BASE_BRANCH...$BRANCH_NAME

# Check what files changed
git diff --stat $BASE_BRANCH...$BRANCH_NAME

# Read the commit history
git log --oneline $BASE_BRANCH..$BRANCH_NAME
```

Note: `$API_BASE`, `$PROJECT_ID`, and `$BASE_BRANCH` are environment variables. `$BRANCH_NAME` comes from the ticket API response.

### Step 2: Quality Checklist

Evaluate the changes against these criteria:

1. **Completeness** - Does the implementation satisfy every requirement in the ticket description?
2. **Correctness** - Is the logic correct? Are edge cases handled?
3. **Tests** - Are there adequate tests? Do they cover the key scenarios?
4. **Code Quality** - Is the code clean, readable, and maintainable?
5. **Security** - No injection vulnerabilities, no exposed secrets, proper input validation?
6. **Performance** - No obvious N+1 queries, unnecessary re-renders, or memory leaks?
7. **Consistency** - Does the code follow existing patterns and conventions in the codebase?

### Step 3: Decision

#### Approve

If the code passes review, **ask the human for confirmation before merging**:

> I've reviewed ticket #N. The changes look good:
> - [Summary of what was done]
> - [Key quality observations]
>
> Shall I merge this?

After human confirms:

```bash
curl -s -X POST "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER/merge"
```

#### Reject

If the code needs work, send it back with a clear explanation:

```bash
curl -s -X PATCH "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
```

The Ticket CC will be automatically restarted with `--resume`. Send it guidance via messages:

```bash
curl -s -X POST "$API_BASE/api/projects/$PROJECT_ID/tickets/$NUMBER/cc/messages" \
  -H "Content-Type: application/json" \
  -d '{"content": "[KANBAN] Review feedback: <specific issues to fix>"}'
```

## Review Priority

- Review tickets in priority order (lower number = higher priority)
- Priority 0 tickets (CD failure fixes) should be reviewed first
- If multiple tickets are reviewing, handle them sequentially

## Human Override

The human may approve or reject from the UI. Respect their decision and proceed accordingly.
