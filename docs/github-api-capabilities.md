# GitHub API Capabilities Reference for ClaudeHub

Comprehensive inventory of GitHub REST API v3 and GraphQL API v4 operations relevant to ClaudeHub's kanban project management tool.

---

## 1. Repository Operations

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}` | Get a repository |
| POST | `/orgs/{org}/repos` | Create an organization repository |
| POST | `/user/repos` | Create a repository for authenticated user |
| PATCH | `/repos/{owner}/{repo}` | Update a repository (name, description, visibility, settings) |
| DELETE | `/repos/{owner}/{repo}` | Delete a repository |
| POST | `/repos/{owner}/{repo}/transfer` | Transfer a repository |
| POST | `/repos/{owner}/{repo}/forks` | Create a fork |
| GET | `/repos/{owner}/{repo}/forks` | List forks |
| POST | `/repos/{template_owner}/{template_repo}/generate` | Create repository from template |
| GET | `/orgs/{org}/repos` | List organization repositories |
| GET | `/user/repos` | List authenticated user's repositories |
| GET | `/repositories` | List all public repositories |
| POST | `/repos/{owner}/{repo}/dispatches` | Create a repository dispatch event |
| GET | `/repos/{owner}/{repo}/contributors` | List contributors |
| GET | `/repos/{owner}/{repo}/languages` | List languages |
| GET | `/repos/{owner}/{repo}/tags` | List tags |
| GET | `/repos/{owner}/{repo}/teams` | List teams |
| GET | `/repos/{owner}/{repo}/topics` | Get all topics |
| PUT | `/repos/{owner}/{repo}/topics` | Replace all topics |
| GET | `/repos/{owner}/{repo}/activity` | List repository activities |

---

## 2. Branch Operations

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/branches` | List branches |
| GET | `/repos/{owner}/{repo}/branches/{branch}` | Get a branch |
| POST | `/repos/{owner}/{repo}/branches/{branch}/rename` | Rename a branch |
| POST | `/repos/{owner}/{repo}/merges` | Merge a branch (into another) |
| POST | `/repos/{owner}/{repo}/merge-upstream` | Sync fork branch with upstream |

### Branch Protection (REST)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/branches/{branch}/protection` | Get branch protection |
| PUT | `/repos/{owner}/{repo}/branches/{branch}/protection` | Update branch protection |
| DELETE | `/repos/{owner}/{repo}/branches/{branch}/protection` | Delete branch protection |
| GET/POST/DELETE | `.../protection/enforce_admins` | Admin enforcement |
| GET/PATCH/DELETE | `.../protection/required_pull_request_reviews` | Required PR reviews |
| GET/POST/DELETE | `.../protection/required_signatures` | Required signatures |
| GET/PATCH/DELETE | `.../protection/required_status_checks` | Required status checks |
| GET/POST/PUT/DELETE | `.../protection/required_status_checks/contexts` | Status check contexts |
| GET/DELETE | `.../protection/restrictions` | Access restrictions |
| GET/POST/PUT/DELETE | `.../protection/restrictions/apps` | App restrictions |
| GET/POST/PUT/DELETE | `.../protection/restrictions/teams` | Team restrictions |
| GET/POST/PUT/DELETE | `.../protection/restrictions/users` | User restrictions |

### GraphQL Mutations

- `createRef` -- Create a branch (reference)
- `deleteRef` -- Delete a branch (reference)
- `mergeBranch` -- Merge a branch
- `createLinkedBranch` -- Link a branch to an issue
- `deleteLinkedBranch` -- Unlink a branch from an issue
- `createBranchProtectionRule` -- Create protection rule
- `updateBranchProtectionRule` -- Update protection rule
- `deleteBranchProtectionRule` -- Delete protection rule

**Note:** Branch creation/deletion via REST is done through the Git References API (see section 5).

---

## 3. Pull Request Operations

### REST API -- Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/pulls` | List pull requests (filter by state, head, base) |
| POST | `/repos/{owner}/{repo}/pulls` | Create a pull request |
| GET | `/repos/{owner}/{repo}/pulls/{pull_number}` | Get a pull request |
| PATCH | `/repos/{owner}/{repo}/pulls/{pull_number}` | Update a pull request (title, body, state, base) |
| GET | `/repos/{owner}/{repo}/pulls/{pull_number}/commits` | List PR commits |
| GET | `/repos/{owner}/{repo}/pulls/{pull_number}/files` | List PR changed files |
| GET | `/repos/{owner}/{repo}/pulls/{pull_number}/merge` | Check if PR is merged |
| PUT | `/repos/{owner}/{repo}/pulls/{pull_number}/merge` | Merge a PR (merge/squash/rebase) |
| PUT | `/repos/{owner}/{repo}/pulls/{pull_number}/update-branch` | Update PR branch with upstream |

### REST API -- Reviews

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews` | List reviews |
| POST | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews` | Create a review |
| GET | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}` | Get a review |
| PUT | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}` | Update a review |
| DELETE | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}` | Delete pending review |
| GET | `.../reviews/{review_id}/comments` | List review comments |
| PUT | `.../reviews/{review_id}/dismissals` | Dismiss a review |
| POST | `.../reviews/{review_id}/events` | Submit a review (approve/request changes/comment) |

### REST API -- Review Requests

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers` | List review requests |
| POST | `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers` | Request reviewers |
| DELETE | `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers` | Remove review requests |

### REST API -- PR Comments (Review Comments)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/pulls/comments` | List all PR review comments in repo |
| GET | `/repos/{owner}/{repo}/pulls/comments/{comment_id}` | Get a review comment |
| PATCH | `/repos/{owner}/{repo}/pulls/comments/{comment_id}` | Update a review comment |
| DELETE | `/repos/{owner}/{repo}/pulls/comments/{comment_id}` | Delete a review comment |
| GET | `/repos/{owner}/{repo}/pulls/{pull_number}/comments` | List comments on a PR |
| POST | `/repos/{owner}/{repo}/pulls/{pull_number}/comments` | Create a review comment |
| POST | `.../comments/{comment_id}/replies` | Reply to a review comment |

### GraphQL Mutations

- `createPullRequest` -- Create a PR
- `closePullRequest` -- Close a PR
- `reopenPullRequest` -- Reopen a PR
- `mergePullRequest` -- Merge a PR
- `convertPullRequestToDraft` -- Convert to draft
- `markPullRequestReadyForReview` -- Mark ready for review
- `enablePullRequestAutoMerge` -- Enable auto-merge
- `disablePullRequestAutoMerge` -- Disable auto-merge
- `enqueuePullRequest` -- Add to merge queue
- `dequeuePullRequest` -- Remove from merge queue
- `revertPullRequest` -- Revert a merged PR
- `addPullRequestReview` -- Add a review
- `submitPullRequestReview` -- Submit a review
- `dismissPullRequestReview` -- Dismiss a review
- `deletePullRequestReview` -- Delete a review
- `addPullRequestReviewComment` -- Add review comment
- `deletePullRequestReviewComment` -- Delete review comment
- `addPullRequestReviewThread` -- Create review thread
- `addPullRequestReviewThreadReply` -- Reply in thread
- `resolveReviewThread` -- Resolve a thread
- `unresolveReviewThread` -- Unresolve a thread
- `requestReviews` -- Request reviews (by team)
- `requestReviewsByLogin` -- Request reviews (by username)
- `markFileAsViewed` -- Mark file as viewed
- `unmarkFileAsViewed` -- Unmark file as viewed

---

## 4. Issue Operations

### REST API -- Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/issues` | List authenticated user's issues |
| GET | `/orgs/{org}/issues` | List organization issues |
| GET | `/repos/{owner}/{repo}/issues` | List repository issues |
| GET | `/user/issues` | List user account issues |
| POST | `/repos/{owner}/{repo}/issues` | Create an issue |
| GET | `/repos/{owner}/{repo}/issues/{issue_number}` | Get an issue |
| PATCH | `/repos/{owner}/{repo}/issues/{issue_number}` | Update an issue (title, body, state, assignees, labels, milestone) |
| PUT | `/repos/{owner}/{repo}/issues/{issue_number}/lock` | Lock an issue |
| DELETE | `/repos/{owner}/{repo}/issues/{issue_number}/lock` | Unlock an issue |

### REST API -- Assignees

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/assignees` | List available assignees |
| GET | `/repos/{owner}/{repo}/assignees/{assignee}` | Check if user can be assigned |
| POST | `/repos/{owner}/{repo}/issues/{issue_number}/assignees` | Add assignees (up to 10) |
| DELETE | `/repos/{owner}/{repo}/issues/{issue_number}/assignees` | Remove assignees |
| GET | `.../issues/{issue_number}/assignees/{assignee}` | Check assignee permission |

### REST API -- Labels

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/issues/{issue_number}/labels` | List labels on an issue |
| POST | `/repos/{owner}/{repo}/issues/{issue_number}/labels` | Add labels to an issue |
| PUT | `/repos/{owner}/{repo}/issues/{issue_number}/labels` | Set/replace all labels on an issue |
| DELETE | `/repos/{owner}/{repo}/issues/{issue_number}/labels` | Remove all labels |
| DELETE | `/repos/{owner}/{repo}/issues/{issue_number}/labels/{name}` | Remove a specific label |

### REST API -- Milestones

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/milestones` | List milestones |
| POST | `/repos/{owner}/{repo}/milestones` | Create a milestone |
| GET | `/repos/{owner}/{repo}/milestones/{milestone_number}` | Get a milestone |
| PATCH | `/repos/{owner}/{repo}/milestones/{milestone_number}` | Update a milestone |
| DELETE | `/repos/{owner}/{repo}/milestones/{milestone_number}` | Delete a milestone |

### REST API -- Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/issues/comments` | List all issue comments in repo |
| GET | `/repos/{owner}/{repo}/issues/comments/{comment_id}` | Get a comment |
| PATCH | `/repos/{owner}/{repo}/issues/comments/{comment_id}` | Update a comment |
| DELETE | `/repos/{owner}/{repo}/issues/comments/{comment_id}` | Delete a comment |
| PUT | `/repos/{owner}/{repo}/issues/comments/{comment_id}/pin` | Pin a comment |
| DELETE | `/repos/{owner}/{repo}/issues/comments/{comment_id}/pin` | Unpin a comment |
| GET | `/repos/{owner}/{repo}/issues/{issue_number}/comments` | List comments on an issue |
| POST | `/repos/{owner}/{repo}/issues/{issue_number}/comments` | Create a comment |

### GraphQL Mutations

- `createIssue` -- Create an issue
- `updateIssue` -- Update an issue
- `closeIssue` -- Close an issue
- `reopenIssue` -- Reopen an issue
- `deleteIssue` -- Delete an issue
- `transferIssue` -- Transfer to another repo
- `pinIssue` / `unpinIssue` -- Pin/unpin an issue
- `pinIssueComment` / `unpinIssueComment` -- Pin/unpin a comment
- `addComment` -- Add a comment
- `updateIssueComment` -- Update a comment
- `deleteIssueComment` -- Delete a comment
- `addAssigneesToAssignable` / `removeAssigneesFromAssignable` -- Manage assignees
- `addLabelsToLabelable` / `removeLabelsFromLabelable` / `clearLabelsFromLabelable` -- Manage labels
- `addSubIssue` / `removeSubIssue` / `reprioritizeSubIssue` -- Sub-issues (hierarchy)
- `addBlockedBy` / `removeBlockedBy` -- Issue dependencies/blocking
- `createLabel` / `updateLabel` / `deleteLabel` -- Label CRUD

---

## 5. Commit/Git Operations (Low-Level)

### REST API -- Commits

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/commits` | List commits |
| GET | `/repos/{owner}/{repo}/commits/{ref}` | Get a commit |
| GET | `/repos/{owner}/{repo}/commits/{commit_sha}/branches-where-head` | List branches where commit is HEAD |
| GET | `/repos/{owner}/{repo}/commits/{commit_sha}/pulls` | List PRs that introduced this commit |
| GET | `/repos/{owner}/{repo}/compare/{basehead}` | Compare two commits (diff) |

### REST API -- Git References (branches/tags)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/git/matching-refs/{ref}` | List matching references |
| GET | `/repos/{owner}/{repo}/git/ref/{ref}` | Get a reference |
| POST | `/repos/{owner}/{repo}/git/refs` | **Create a reference (branch/tag)** |
| PATCH | `/repos/{owner}/{repo}/git/refs/{ref}` | Update a reference (force push) |
| DELETE | `/repos/{owner}/{repo}/git/refs/{ref}` | **Delete a reference (branch/tag)** |

### REST API -- Git Commits

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/repos/{owner}/{repo}/git/commits` | Create a commit object |
| GET | `/repos/{owner}/{repo}/git/commits/{commit_sha}` | Get a commit object |

### REST API -- Git Trees

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/repos/{owner}/{repo}/git/trees` | Create a tree (file structure) |
| GET | `/repos/{owner}/{repo}/git/trees/{tree_sha}` | Get a tree (supports recursive) |

### REST API -- Git Blobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/repos/{owner}/{repo}/git/blobs` | Create a blob (file content) |
| GET | `/repos/{owner}/{repo}/git/blobs/{file_sha}` | Get a blob (base64 encoded) |

### REST API -- Git Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/repos/{owner}/{repo}/git/tags` | Create an annotated tag object |
| GET | `/repos/{owner}/{repo}/git/tags/{tag_sha}` | Get a tag object |

---

## 6. Webhook Operations

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/hooks` | List repository webhooks |
| POST | `/repos/{owner}/{repo}/hooks` | Create a webhook |
| GET | `/repos/{owner}/{repo}/hooks/{hook_id}` | Get a webhook |
| PATCH | `/repos/{owner}/{repo}/hooks/{hook_id}` | Update a webhook |
| DELETE | `/repos/{owner}/{repo}/hooks/{hook_id}` | Delete a webhook |
| GET | `/repos/{owner}/{repo}/hooks/{hook_id}/config` | Get webhook config |
| PATCH | `/repos/{owner}/{repo}/hooks/{hook_id}/config` | Update webhook config |
| GET | `/repos/{owner}/{repo}/hooks/{hook_id}/deliveries` | List deliveries |
| GET | `.../deliveries/{delivery_id}` | Get a delivery |
| POST | `.../deliveries/{delivery_id}/attempts` | Redeliver a delivery |
| POST | `/repos/{owner}/{repo}/hooks/{hook_id}/pings` | Ping a webhook |
| POST | `/repos/{owner}/{repo}/hooks/{hook_id}/tests` | Test push webhook |

### Key Webhook Events (for kanban)

- `issues` -- Issue opened, edited, closed, assigned, labeled, milestoned
- `pull_request` -- PR opened, closed, merged, review requested, labeled
- `pull_request_review` -- Review submitted, dismissed
- `push` -- Code pushed
- `check_run` / `check_suite` -- CI status changes
- `workflow_run` -- Workflow completed
- `create` / `delete` -- Branch/tag created/deleted
- `project_card` / `projects_v2_item` -- Project board changes
- `issue_comment` -- Comment created/edited/deleted
- `status` -- Commit status changes

---

## 7. Actions/CI Operations

### REST API -- Workflows

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/actions/workflows` | List workflows |
| GET | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}` | Get a workflow |
| PUT | `.../workflows/{workflow_id}/disable` | Disable a workflow |
| PUT | `.../workflows/{workflow_id}/enable` | Enable a workflow |
| POST | `.../workflows/{workflow_id}/dispatches` | **Trigger a workflow run** |
| GET | `.../workflows/{workflow_id}/timing` | Get workflow usage |

### REST API -- Workflow Runs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/actions/runs` | List workflow runs |
| GET | `.../actions/runs/{run_id}` | Get a workflow run |
| DELETE | `.../actions/runs/{run_id}` | Delete a workflow run |
| POST | `.../actions/runs/{run_id}/cancel` | Cancel a run |
| POST | `.../actions/runs/{run_id}/force-cancel` | Force cancel a run |
| POST | `.../actions/runs/{run_id}/rerun` | Re-run a workflow |
| POST | `.../actions/runs/{run_id}/rerun-failed-jobs` | Re-run failed jobs only |
| POST | `.../actions/runs/{run_id}/approve` | Approve a run (for fork PRs) |
| GET | `.../actions/runs/{run_id}/logs` | Download run logs |
| DELETE | `.../actions/runs/{run_id}/logs` | Delete run logs |
| GET | `.../actions/runs/{run_id}/timing` | Get run timing |
| GET | `.../actions/runs/{run_id}/approvals` | Get run approvals |
| GET | `.../actions/runs/{run_id}/pending_deployments` | Get pending deployments |
| POST | `.../actions/runs/{run_id}/pending_deployments` | Review pending deployments |
| GET | `.../runs/{run_id}/attempts/{attempt_number}` | Get a run attempt |
| GET | `.../runs/{run_id}/attempts/{attempt_number}/logs` | Get attempt logs |
| GET | `.../workflows/{workflow_id}/runs` | List runs for a workflow |

### REST API -- Workflow Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/actions/jobs/{job_id}` | Get a job |
| GET | `.../actions/jobs/{job_id}/logs` | Download job logs |
| POST | `.../actions/jobs/{job_id}/rerun` | Re-run a job |
| GET | `.../actions/runs/{run_id}/jobs` | List jobs for a run |
| GET | `.../runs/{run_id}/attempts/{attempt_number}/jobs` | List jobs for an attempt |

### REST API -- Artifacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/actions/artifacts` | List artifacts |
| GET | `.../actions/artifacts/{artifact_id}` | Get an artifact |
| DELETE | `.../actions/artifacts/{artifact_id}` | Delete an artifact |
| GET | `.../actions/artifacts/{artifact_id}/{archive_format}` | Download an artifact |
| GET | `.../actions/runs/{run_id}/artifacts` | List artifacts for a run |

---

## 8. Release Operations

### REST API -- Releases

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/releases` | List releases |
| POST | `/repos/{owner}/{repo}/releases` | Create a release (supports draft, prerelease) |
| GET | `/repos/{owner}/{repo}/releases/latest` | Get latest release |
| GET | `/repos/{owner}/{repo}/releases/tags/{tag}` | Get release by tag |
| GET | `/repos/{owner}/{repo}/releases/{release_id}` | Get a release |
| PATCH | `/repos/{owner}/{repo}/releases/{release_id}` | Update a release |
| DELETE | `/repos/{owner}/{repo}/releases/{release_id}` | Delete a release |
| POST | `/repos/{owner}/{repo}/releases/generate-notes` | Generate release notes |

### REST API -- Release Assets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/releases/{release_id}/assets` | List assets |
| POST | `/repos/{owner}/{repo}/releases/{release_id}/assets` | Upload an asset |
| GET | `/repos/{owner}/{repo}/releases/assets/{asset_id}` | Get an asset |
| PATCH | `/repos/{owner}/{repo}/releases/assets/{asset_id}` | Update an asset |
| DELETE | `/repos/{owner}/{repo}/releases/assets/{asset_id}` | Delete an asset |

---

## 9. Project Operations (GitHub Projects v2)

### GraphQL Queries

- `organization(login:).projectV2(number:)` -- Get org project by number
- `user(login:).projectV2(number:)` -- Get user project by number
- `node(id:).projectsV2(first:)` -- List projects
- `fields(first:)` -- List project fields (text, single select, iteration, etc.)
- `items(first:)` -- List project items with field values
- `fieldValues(first:)` -- Get field values (text, date, single select)

### GraphQL Mutations -- Projects v2

| Mutation | Description |
|----------|-------------|
| `createProjectV2` | Create a new project |
| `copyProjectV2` | Copy/duplicate a project |
| `deleteProjectV2` | Delete a project |
| `updateProjectV2` | Update project settings (title, README, visibility: public/private) |
| `markProjectV2AsTemplate` | Mark project as template |
| `unmarkProjectV2AsTemplate` | Unmark as template |
| `linkProjectV2ToRepository` | Link project to a repo |
| `unlinkProjectV2FromRepository` | Unlink from repo |
| `linkProjectV2ToTeam` | Link project to a team |
| `unlinkProjectV2FromTeam` | Unlink from team |

### GraphQL Mutations -- Project Items

| Mutation | Description |
|----------|-------------|
| `addProjectV2ItemById` | Add existing issue/PR to project |
| `addProjectV2DraftIssue` | Create a draft issue in project |
| `convertProjectV2DraftIssueItemToIssue` | Convert draft to real issue |
| `deleteProjectV2Item` | Remove item from project |
| `archiveProjectV2Item` | Archive an item |
| `unarchiveProjectV2Item` | Unarchive an item |
| `updateProjectV2ItemFieldValue` | **Update item field (status, priority, text, date, iteration, single select)** |
| `clearProjectV2ItemFieldValue` | Clear a field value |

### GraphQL Mutations -- Project Fields

| Mutation | Description |
|----------|-------------|
| `createProjectV2Field` | Create a custom field |
| `deleteProjectV2Field` | Delete a custom field |
| `createProjectV2IssueField` | Create an issue-type field |
| `createProjectV2StatusUpdate` | Create a status update |
| `deleteProjectV2StatusUpdate` | Delete a status update |
| `deleteProjectV2Workflow` | Delete a project workflow/automation |

**Note:** GitHub Projects v2 is GraphQL-only. There is no REST API for Projects v2. The old REST API (`/projects`, `/projects/columns`, `/projects/columns/cards`) is for classic projects which are deprecated.

---

## 10. Code/Content Operations

### REST API -- Repository Contents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/contents/{path}` | Get file/directory contents |
| PUT | `/repos/{owner}/{repo}/contents/{path}` | Create or update a file |
| DELETE | `/repos/{owner}/{repo}/contents/{path}` | Delete a file |
| GET | `/repos/{owner}/{repo}/readme` | Get README |
| GET | `/repos/{owner}/{repo}/readme/{dir}` | Get README from subdirectory |
| GET | `/repos/{owner}/{repo}/tarball/{ref}` | Download tarball |
| GET | `/repos/{owner}/{repo}/zipball/{ref}` | Download zipball |

### REST API -- Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search/code` | Search code across repos |
| GET | `/search/commits` | Search commits |
| GET | `/search/issues` | Search issues and PRs |
| GET | `/search/labels` | Search labels |
| GET | `/search/repositories` | Search repositories |
| GET | `/search/topics` | Search topics |
| GET | `/search/users` | Search users |

### REST API -- Compare

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/compare/{basehead}` | Compare two commits/branches/tags |

---

## 11. User/Org/Team Operations

### REST API -- Collaborators

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/collaborators` | List collaborators |
| GET | `/repos/{owner}/{repo}/collaborators/{username}` | Check if user is collaborator |
| PUT | `/repos/{owner}/{repo}/collaborators/{username}` | Add collaborator (sends invite) |
| DELETE | `/repos/{owner}/{repo}/collaborators/{username}` | Remove collaborator |
| GET | `.../collaborators/{username}/permission` | Get user's permission level |

### REST API -- Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orgs/{org}/teams` | List teams |
| POST | `/orgs/{org}/teams` | Create a team |
| GET | `/orgs/{org}/teams/{team_slug}` | Get a team |
| PATCH | `/orgs/{org}/teams/{team_slug}` | Update a team |
| DELETE | `/orgs/{org}/teams/{team_slug}` | Delete a team |
| GET | `/orgs/{org}/teams/{team_slug}/repos` | List team repos |
| GET | `.../teams/{team_slug}/repos/{owner}/{repo}` | Check team permission for repo |
| PUT | `.../teams/{team_slug}/repos/{owner}/{repo}` | Add/update team repo access |
| DELETE | `.../teams/{team_slug}/repos/{owner}/{repo}` | Remove repo from team |
| GET | `/orgs/{org}/teams/{team_slug}/teams` | List child teams |
| GET | `/user/teams` | List teams for authenticated user |

---

## 12. Notification Operations

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | List all notifications |
| PUT | `/notifications` | Mark all as read |
| GET | `/notifications/threads/{thread_id}` | Get a notification thread |
| PATCH | `/notifications/threads/{thread_id}` | Mark thread as read |
| DELETE | `/notifications/threads/{thread_id}` | Mark thread as done |
| GET | `.../threads/{thread_id}/subscription` | Get thread subscription |
| PUT | `.../threads/{thread_id}/subscription` | Set thread subscription |
| DELETE | `.../threads/{thread_id}/subscription` | Mute a thread |
| GET | `/repos/{owner}/{repo}/notifications` | List repo notifications |
| PUT | `/repos/{owner}/{repo}/notifications` | Mark repo notifications as read |

### REST API -- Watching/Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/subscribers` | List watchers |
| GET | `/repos/{owner}/{repo}/subscription` | Get repo subscription |
| PUT | `/repos/{owner}/{repo}/subscription` | Watch/subscribe to repo |
| DELETE | `/repos/{owner}/{repo}/subscription` | Unwatch repo |
| GET | `/user/subscriptions` | List watched repos |

---

## 13. Check Runs/Statuses

### REST API -- Check Runs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/repos/{owner}/{repo}/check-runs` | Create a check run (GitHub Apps only) |
| GET | `/repos/{owner}/{repo}/check-runs/{check_run_id}` | Get a check run |
| PATCH | `/repos/{owner}/{repo}/check-runs/{check_run_id}` | Update a check run |
| GET | `.../check-runs/{check_run_id}/annotations` | List annotations |
| POST | `.../check-runs/{check_run_id}/rerequest` | Re-request a check run |
| GET | `.../check-suites/{check_suite_id}/check-runs` | List check runs in suite |
| GET | `/repos/{owner}/{repo}/commits/{ref}/check-runs` | List check runs for a ref |

### REST API -- Check Suites

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/repos/{owner}/{repo}/check-suites` | Create a check suite |
| PATCH | `/repos/{owner}/{repo}/check-suites/preferences` | Set auto-creation preferences |
| GET | `/repos/{owner}/{repo}/check-suites/{check_suite_id}` | Get a check suite |
| POST | `.../check-suites/{check_suite_id}/rerequest` | Re-request a check suite |
| GET | `/repos/{owner}/{repo}/commits/{ref}/check-suites` | List check suites for a ref |

### REST API -- Commit Statuses

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/repos/{owner}/{repo}/statuses/{sha}` | Create a commit status (pending/success/failure/error) |
| GET | `/repos/{owner}/{repo}/commits/{ref}/status` | Get combined status for a ref |
| GET | `/repos/{owner}/{repo}/commits/{ref}/statuses` | List statuses for a ref |

**Note:** Check runs (GitHub Apps) are the newer system. Commit statuses are the older system. Both can coexist -- the combined status endpoint merges them.

---

## 14. Reactions (Bonus -- useful for kanban feedback)

### REST API

Reactions can be added to: issues, issue comments, PR review comments, commit comments, and releases.

Pattern: `GET/POST/DELETE /repos/{owner}/{repo}/{resource}/{id}/reactions`

Supported reactions: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`, `rocket`, `eyes`

---

## ClaudeHub Priority Recommendations

### Tier 1 -- Essential for Kanban Core

| Category | Key Operations |
|----------|---------------|
| Issues | Create, update, close, assign, label, comment, list |
| Pull Requests | Create, update, merge, list files, list commits |
| Branches | Create (via git refs), delete, list |
| Git Refs | Create ref, delete ref (branch creation/deletion) |
| Commits | List, compare |
| Labels | Add/remove on issues and PRs |
| Projects v2 | Create project, add items, update field values (status column moves), archive |

### Tier 2 -- Essential for Automation

| Category | Key Operations |
|----------|---------------|
| PR Reviews | Request reviewers, create review, submit review |
| Check Runs/Statuses | List check runs for ref, get combined status (monitor CI) |
| Webhooks | Create webhook (issue/PR/push events for real-time updates) |
| Actions | Trigger workflow dispatch, list runs, get run status |
| Repo Contents | Get file contents, create/update files |

### Tier 3 -- Nice to Have

| Category | Key Operations |
|----------|---------------|
| Milestones | Create, list, associate with issues |
| Releases | Create, upload assets |
| Search | Search issues, code, commits |
| Notifications | List, mark as read |
| Collaborators | List, check permissions |
| Teams | List, check repo access |
| Reactions | Add reactions to issues/comments |
| Branch Protection | Get/set protection rules |
