---
description: Standard git workflow for committing, pushing, handling CI results, and rebasing
---

# Git Workflow

You are working in a git worktree on a feature branch. Follow this standard workflow.

## Commit Conventions

```bash
# Stage specific files (never use git add -A blindly)
git add src/feature.ts src/feature.test.ts

# Commit with a clear message
git commit -m "Add user authentication endpoint

Implements JWT-based login with bcrypt password hashing.
Adds integration tests for login success and failure cases."
```

- First line: imperative mood, max 72 chars (e.g., "Add", "Fix", "Update")
- Blank line, then body with details if needed
- Commit often — small, logical units of work

## Push

```bash
git push origin HEAD
```

After pushing, **wait for the CI notification**. The server will send one of:
- `[SYSTEM] CI check "..." PASSED/FAILED` — CI result
- `[SYSTEM] No CI workflows configured` — No CI in this repo, proceed directly

### No CI

If the server tells you no CI is configured, skip the CI wait and proceed directly to self-assessment and set status to reviewing.

### CI Failed

If CI fails:
1. Read the failure message carefully
2. Investigate the root cause (don't just retry)
3. Fix the issue
4. Commit the fix
5. Push again
6. Wait for CI again

Do NOT set status to reviewing until CI passes.

### CI Passed

Proceed to the self-assessment checklist (see ticket-status skill), then update status to reviewing.

## Rebase

If you receive a `[SYSTEM] Base branch updated` notification:

```bash
git fetch origin
git rebase origin/$BASE_BRANCH
```

### Conflict Resolution

If rebase has conflicts:
1. `git status` to see conflicted files
2. Edit files to resolve conflicts (remove `<<<<<<<` markers)
3. `git add <resolved-files>`
4. `git rebase --continue`
5. Push with force: `git push origin HEAD --force`

If conflicts are too complex, explain the situation — the Kanban CC or human may intervene.

## Branch Rules

- Your branch is already checked out in the worktree. Do NOT switch branches.
- Do NOT modify files outside your worktree.
- Do NOT push to the base branch (main/master).
- Do NOT create new branches.

## Testing

Before pushing, always run the project's test suite:

```bash
# Detect and run tests (adapt to the project's framework)
# Node.js projects:
npm test
# or: pnpm test / yarn test / npx jest / npx vitest

# Python projects:
pytest

# Go projects:
go test ./...
```

If the project has no test runner configured, at minimum verify:
- The code compiles/builds without errors
- Linting passes (if configured)
- The changes work as expected based on manual verification
