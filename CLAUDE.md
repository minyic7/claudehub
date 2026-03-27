# ClaudeHub

GitHub-based 项目管理看板，Claude Code 作为唯一执行和决策层。

## Architecture

三层架构：
- **Hono API Server** — 基础设施：CRUD、进程生命周期、stdin/stdout 管道、WebSocket 广播、GitHub 操作、按指令组装 plugin-dir
- **Kanban CC** — 决策：每 project 一个持久 `claude --print` stream-json 进程。分析 ticket、选择 plugin、监控进度、介入指导
- **Ticket CC** — 执行：每 ticket 一个持久 `claude --print` stream-json 进程。编码、测试、提交、推送、创建 PR。4 层隔离（scoped cwd、.git 边界、按需 plugin-dir、--setting-sources project,local）

### CC Spawn 参数

交互模式（PTY），不使用 `--print` / stream-json。通过 `node-pty` 分配伪终端，xterm.js 通过 WebSocket 直连 PTY stdin/stdout。

```bash
claude \
  --session-id <id> \
  --append-system-prompt "<任务简报>" \
  --resume \
  --plugin-dir <assembled-plugins/> \
  --mcp-config <assembled-mcp.json> \
  --setting-sources project,local \
  --dangerously-skip-permissions
```

| 参数 | 用途 |
|------|------|
| `--session-id` | Kanban CC 用 project ID，Ticket CC 用 ticket ID |
| `--append-system-prompt` | Kanban CC：看板管理能力注入；Ticket CC：Kanban CC 生成的任务简报 |
| `--resume` | 进程崩溃或容器重启后恢复会话，不丢失上下文 |
| `--plugin-dir` | Kanban CC 决定所需 plugin 子集，Hono 组装目录 |
| `--mcp-config` | Kanban CC 决定所需 MCP server，Hono 组装配置文件。注入模式同 plugin-dir |
| Hooks | Hono 注册 pre/post tool hooks，用于 GitHub 操作的阻断/事件通知，状态变更广播到前端 |

## Tech Stack

- Frontend: React 19 · Vite 7 · TypeScript · React Router v7 · HeroUI · Tailwind v4 · @dnd-kit · xterm.js · zustand · Sonner · React Hook Form
- Backend: Node 24 LTS · Hono · Redis · pnpm monorepo · TypeScript
- Infra: Docker · docker-compose

## Project Structure

```
claudehub/
├── .github/
│   └── workflows/
│       └── deploy-to-mac-mini.yml  # CD pipeline
├── docker-compose.yml            # server + redis + web
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
│
├── docs/
│   └── github-api-capabilities.md  # GitHub API 能力清单
│
├── packages/
│   └── shared/                   # 前后端共享类型/常量
│       └── src/
│           ├── types/
│           │   ├── ticket.ts     # Ticket, TicketStatus, Column
│           │   ├── project.ts
│           │   ├── plugin.ts
│           │   └── ws.ts          # WebSocket 事件类型定义
│           └── constants/
│               └── index.ts
│
├── apps/
│   ├── web/                      # React 前端
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── components/
│   │       │   ├── board/        # Board, Column, TicketCard (dnd-kit)
│   │       │   ├── terminal/     # TerminalPanel (xterm.js)
│   │       │   └── layout/       # Header, Sidebar
│   │       ├── stores/           # zustand: boardStore, terminalStore
│   │       ├── hooks/            # useTerminalWs, useEventWs, useProject
│   │       ├── api/              # fetch wrapper
│   │       └── styles/
│   │
│   └── server/                   # Hono 后端
│       ├── Dockerfile
│       └── src/
│           ├── routes/           # projects, tickets, ws, webhooks
│           ├── services/
│           │   ├── cc/           # manager (生命周期), kanbanCC, ticketCC
│           │   ├── plugin/       # assembler (组装 plugin-dir)
│           │   ├── git/          # worktree, github
│           │   └── redis.ts
│           ├── lib/
│           │   ├── pty.ts        # node-pty 管理 + ring buffer
│           │   └── broadcast.ts  # WebSocket 事件广播工具
│           └── plugins/          # 预定义 plugin 模板池
```

## GitHub API Capabilities

详细文档见 [docs/github-api-capabilities.md](docs/github-api-capabilities.md)

### Tier 1 — 看板核心
- **Issues**：创建、更新、关闭、分配、标签、评论
- **Pull Requests**：创建、更新、合并、文件列表
- **Branches/Git Refs**：创建/删除分支
- **Commits**：列表、比较
- **Projects v2**（GraphQL only）：状态列移动

### Tier 2 — 自动化必需
- **PR Reviews**：请求 reviewer、创建/提交 review
- **Check Runs/Statuses**：监控 CI 状态
- **Webhooks**：实时事件推送（issue/PR/push 事件回调到 Hono）
- **Actions**：触发 workflow、查看运行状态
- **Repo Contents**：读写文件

### Tier 3 — 锦上添花
- Milestones、Releases、Search、Notifications、Reactions 等

## REST API

所有前端操作均可抽象为 Kanban CC 的 skill，共用同一套 API。

### Projects

ID 策略：per-global sequential（`PROJ-1`、`PROJ-2`），Redis `INCR project:next_id`

存储字段：`id, name, githubUrl, owner, repo, githubToken, baseBranch, webhookId, webhookSecret, createdAt`

| Method | Endpoint | 功能 | 备注 |
|--------|----------|------|------|
| GET | `/api/projects` | 列出所有项目 | |
| POST | `/api/projects` | 创建项目 | body: `{githubUrl, name?, githubToken, baseBranch}`。验证 token scope（repo + admin:repo_hook）→ 验证 repo 访问 → bare clone → 生成 webhook secret → 注册 webhook |
| GET | `/api/projects/:id` | 项目详情 | |
| PATCH | `/api/projects/:id` | 更新项目 | 可更新: name, githubToken。baseBranch 不可变（创建时指定，想换则删项目重建） |
| DELETE | `/api/projects/:id` | 删除项目 | 前置：无进行中的 merge（否则 409）。停所有 CC → 清 worktrees → 关闭所有 Issue/PR → 删除所有远程分支 → 删 bare repo → 注销 webhook |
| POST | `/api/projects/:id/sync` | 手动同步 | git fetch，确保 bare repo 是最新的 |

### Tickets

ID 策略：per-project sequential（`#1`、`#2`），Redis `INCR project:{projectId}:ticket:next_id`。`id` 为内部 Redis key，`number` 面向用户。

存储字段：`id, projectId, number, title, description, type, status, ccStatus, priority, branchName, worktreePath, dependencies[], githubIssueNumber, githubPrNumber?, taskBrief?, returnReason?, createdAt, updatedAt`

taskBrief：Kanban CC 分析 ticket 后通过 PATCH 写入的任务简报。cc/manager.ts spawn Ticket CC 时读取作为 `--append-system-prompt`。为空时 fallback 到 ticket description + 标准指令模板。

returnReason：ticket 从 reviewing 回到 in_progress 时标记原因。`conflict`（rebase 冲突）、`rejected`（人类拒绝）。前端可据此显示提示。回到 in_progress 后清除。

Type：`feature | bugfix | refactor | docs | chore`

Title 规则：最大 72 字符，只允许字母、数字、空格、`-`，前后端校验。

Branch 命名：`{type}/ticket-{number}-{slugified-title}`（如 `feature/ticket-3-add-user-auth`）。slug 化：小写、空格转 `-`、截断 50 字符。

ccStatus：`idle`（todo/回退后）→ `queued`（等待并发 slot）→ `running`（CC 执行中）→ `completed`（编码完成，等待 review）。进入 in_progress 时（含打回重做）：有空位则 running，满则 queued，按 priority 排队。

并发控制：全局 `maxConcurrentTickets`（默认 20），所有项目共享。由 cc/manager.ts 管理进程生命周期、队列调度、健康监控、崩溃 `--resume` 重启。优先级调整不触发抢占（不杀运行中的 CC），下次有空 slot 时按新 priority 排序启动。

Status 流转：
```
todo → in_progress（前置：所有 dependencies 已 merged） → reviewing → merged（via POST /merge）
in_progress → todo（丢弃所有 change + rebase main，ccStatus=idle）
reviewing → in_progress（打回重做，ccStatus 按并发决定 queued/running）
reviewing → todo（暂不做，丢弃所有 change + rebase main，ccStatus=idle）
merged 是终态，不可移动，不可通过 PATCH 设置（必须用 merge 端点）
任何非 merged 状态可删除
```

PR 生命周期：创建 ticket → branch + worktree + GitHub Issue（无 PR）→ Ticket CC 编码 → CI 通过 → Ticket CC 自行设 status=reviewing → Kanban CC review → approve 后创建 ready to merge PR（`closes #N`）→ merge

Rebase 策略（由 push webhook 统一触发）：
- todo ticket（无 CC）：server 直接执行 git rebase + force push（固定代码）
- in_progress ticket（CC 运行中）：server 通过 `/messages` 通知 Ticket CC rebase，CC 自行执行 fetch + rebase + resolve conflict
- reviewing ticket：server 尝试 rebase，如有冲突 → server 直接 PATCH status=in_progress（标记 `returnReason: conflict`）→ CC 自动重启（`--resume`）→ server 通过 `/messages` 通知冲突
- 回退到 todo 时丢弃所有 change + rebase main，worktree 保留（干净的 main checkout）
- Kanban CC worktree 同步 git pull

Review 流程：Kanban CC review（读 diff、检查测试、质量），approve → 等待人类确认。确认方式二选一：xterm.js 终端回复（Kanban CC system prompt 指示征求确认）或前端 UI approve/reject 按钮（按钮通过 `/messages` 发送给 Kanban CC）。人类同意 → 创建 ready to merge PR → merge。人类拒绝并提供原因 → Kanban CC PATCH status=in_progress（标记 `returnReason: rejected`），通知 Ticket CC 返工。

依赖：同项目内 ticket number（如 `[1, 2]`），不允许跨项目依赖。创建时定义，非 merged 状态都可修改。修改时校验无循环依赖。删除 ticket 时：如有其他 ticket 依赖它，提示用户确认，确认后级联删除所有依赖它的 ticket（批量处理：先完成所有删除，再统一释放 slot 触发调度）。Kanban CC 排优先级时考虑依赖。

优先级：per-project，数字越小越优先，用户 priority（≥1）同项目内不允许重复。priority=0 仅系统保留（CD 失败自动创建的 urgent ticket），可多个并存，按 createdAt 排序。用户从 1 开始。新建 ticket 默认 priority = max(现有非零) + 1。排序：priority 升序。跨项目并发调度：同 priority 按 createdAt 先来先得。

串行 merge：per-project 一次只 merge 一个，有 CD 必须等 CD 完成。

CI/CD 规则：CI 只在 feature branch 触发（不在 base branch）；CD 只在 base branch 触发（不在 feature branch）。

CI 失败：检测 + retry。CD 失败：自动创建最高优先级 fix ticket。

GitHub 联动（1:1 同步）：
- 创建 ticket → 创建 GitHub Issue（标题、描述同步）
- PATCH description → 同步更新 GitHub Issue
- status 变化 → 更新 Issue label（todo、in-progress、reviewing）
- Kanban CC approve → 创建 PR（`closes #N`）
- merge PR → Issue 自动关闭
- GitHub → ClaudeHub（webhook 回调）：
  - Issue 被关闭 → 删除 ticket（停 CC、清 worktree、删分支等完整清理）
  - Issue title 被修改 → 删除 ticket（title 不可变，不建议用户在 GitHub 侧改 title）
  - Issue description 被修改 → 同步回 ClaudeHub

CD 失败自动创建 ticket：type=bugfix，priority=0（urgent），status=in_progress（自动启动），title/description 自动填入失败的 CD 信息（workflow name、run URL、error）。`--append-system-prompt` 由 server 用固定模板生成（不等 Kanban CC），包含 CD 失败详情。

| Method | Endpoint | 功能 | 备注 |
|--------|----------|------|------|
| GET | `/api/projects/:id/tickets` | 列出项目下所有 ticket | 支持按 status、priority 筛选 |
| POST | `/api/projects/:id/tickets` | 创建 ticket | body: `{title, description, type, priority?, dependencies?[]}`。git fetch → worktree add → 创建 GitHub Issue |
| GET | `/api/projects/:id/tickets/:number` | ticket 详情 | |
| PATCH | `/api/projects/:id/tickets/:number` | 更新 ticket | 可更新: description, status, priority, dependencies, taskBrief。title/type/branchName 不可变。description 同步 GitHub Issue。status=merged 禁止（用 merge 端点）。status=reviewing 前置：CI 通过。status=in_progress 前置：所有 dependencies 已 merged。priority=0 禁止（系统保留） |
| DELETE | `/api/projects/:id/tickets/:number` | 删除 ticket | 停 CC → worktree remove → 关闭 PR（如有）→ 关闭 Issue → 删除远程分支 → 清理本地分支 |
| POST | `/api/projects/:id/tickets/:number/merge` | 合并 ticket | 前置：status=reviewing + CI 通过 + 无正在进行的 merge + 所有 dependencies 已 merged。返回 202 Accepted，异步执行：创建 ready to merge PR → merge → 等 CD（如有）。rebase 由 push webhook 统一触发。进度通过 WebSocket 推送。同一时间只允许一个 merge 操作（per-project） |
| DELETE | `/api/projects/:id/tickets/:number/merge` | 取消 merge | 取消进行中的 merge 操作。如 PR 已创建则关闭 PR，ticket 保持 reviewing 状态 |

### Board

| Method | Endpoint | 功能 | 备注 |
|--------|----------|------|------|
| GET | `/api/projects/:id/board` | 获取完整看板视图 | 返回: project 信息、kanbanCC 状态、columns（tickets 按 status 分组、按 priority 排序）、stats（total、byStatus、runningCC、queuedCC） |

### Kanban CC

每个 project 一个 Kanban CC（持久交互模式进程，PTY），重复启动返回 409。用户打开看板时自动启动（如未运行），切换看板不停止（后台持续运行），只有用户主动停止（DELETE）才关闭。

cwd：专属 worktree，checkout base branch（如 `worktrees/kanban/`）。merge 后通过 webhook 通知或主动 git fetch + git pull 更新到最新 base branch，方便 Kanban CC 读代码、检查 diff。

职责：review ticket、调度 Ticket CC、排优先级、触发 rebase、监控 CI/CD、选 plugin/MCP、与用户对话。所有职责通过 `--append-system-prompt` 注入，Kanban CC 通过调用 Hono API 操作 ticket（不直接操作 Redis）。

用户交互：前端 xterm.js 终端通过 WebSocket 直连 CC 的 PTY stdin/stdout，用户直接打字如同本地使用 `claude`。可以聊天、提问、下指令（如"创建一个 ticket"、"调整优先级"），Kanban CC 自行决定调用哪些 API 执行。

崩溃恢复：cc/manager.ts 检测崩溃 → `--resume` 自动重启 → WebSocket 通知前端。容器重启时 cc/manager.ts 扫描 Redis 中所有 status=running 的 Kanban CC 并自动重启。重启后 server 自动发送当前看板状态摘要（reviewing 待 review 的 ticket、conflict 状态等），确保 Kanban CC 不遗漏停机期间的状态变化。

终端历史：server 端 per-CC ring buffer 缓存 PTY 输出（默认 10000 行）。WebSocket 连接/重连时先回放 buffer 再切换实时流。覆盖场景：CC 重启、浏览器刷新、页面切换。已知限制：容器重启后 ring buffer 丢失（内存存储），CC 上下文通过 `--resume` 恢复但终端历史不可见。

| Method | Endpoint | 功能 | 备注 |
|--------|----------|------|------|
| POST | `/api/projects/:id/kanban-cc` | 启动 Kanban CC | 已启动返回 409 |
| GET | `/api/projects/:id/kanban-cc` | 获取状态 | 返回: status（running/stopped/error）, pid, uptime, lastActiveAt |
| DELETE | `/api/projects/:id/kanban-cc` | 停止 Kanban CC | |
| POST | `/api/projects/:id/kanban-cc/messages` | 发消息 | body: `{content}` → PTY stdin。程序化/系统事件专用（用户通过 xterm.js 直接交互）。server 自动发送事件通知：ticket status 变化、CI/CD 结果、webhook 事件等 |

### Ticket CC

每个 ticket 一个 Ticket CC（持久交互模式进程，PTY）。

生命周期：status 驱动 + 手动控制。PATCH status=in_progress → 自动启动（或排队）；PATCH status=todo → 自动停止（ccStatus=idle）；PATCH status=reviewing → 自动停止（ccStatus=completed），释放并发 slot，cc/manager.ts 自动启动下一个 queued ticket。打回重做（reviewing → in_progress）时用 `--resume` 重启恢复上下文。POST/DELETE 端点提供手动启停能力（如暂停 CC 但保持 in_progress 状态）。

cwd：ticket 的 worktree 路径（feature branch checkout，如 `worktrees/ticket-3/`）。

用户交互：同 Kanban CC，前端每个 ticket 可展开 xterm.js 终端面板，PTY + WebSocket 直连。用户可监控进度、给额外指令、debug 问题。

状态更新：Ticket CC 通过 `--plugin-dir` 注入的 HTTP 工具主动调用 Hono API 更新自身状态。完成流程：编码 → 本地测试 → 提交 → 推送 → 自检（对照 ticket description 验证完成度）→ 等待 CI 通知（via `/messages`）→ CI 通过 → 调用 plugin 设 status=reviewing。

CI 感知：推送后 CI 在 feature branch 触发，GitHub webhook → server 匹配 branch 到 ticket → 通过 `/messages` 通知 Ticket CC CI 结果。CI 失败时 Ticket CC 自行修复重试。

`--append-system-prompt`：Kanban CC 生成的任务简报，包含 ticket description、依赖上下文、代码背景、具体指令。Ticket CC 工作时始终 refer to ticket description 验证完成度。

崩溃恢复：同 Kanban CC，cc/manager.ts 检测崩溃 → `--resume` 重启。容器重启时自动恢复所有 running/queued 的 Ticket CC。

终端历史：同 Kanban CC，per-CC ring buffer（默认 10000 行）。

| Method | Endpoint | 功能 | 备注 |
|--------|----------|------|------|
| POST | `/api/projects/:id/tickets/:number/cc` | 启动 Ticket CC | 手动启动（正常由 status 变化自动触发）。前置：status=in_progress |
| GET | `/api/projects/:id/tickets/:number/cc` | 获取状态 | 返回: ccStatus（idle/queued/running/completed）, pid, uptime, lastActiveAt |
| DELETE | `/api/projects/:id/tickets/:number/cc` | 停止 Ticket CC | 手动停止，ccStatus=idle，ticket status 保持不变 |
| POST | `/api/projects/:id/tickets/:number/cc/messages` | 发消息 | body: `{content}` → PTY stdin。server 自动发送：CI 结果、rebase 通知等 |

### Settings

存储：Redis。

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `anthropicApiKey` | 无 | Claude API key，GET 时脱敏（仅返回后 4 位） |
| `maxConcurrentTickets` | 20 | 最大并发 Ticket CC 数，全局共享。调低时不杀已有进程，等自然降到新上限以下 |

| Method | Endpoint | 功能 | 备注 |
|--------|----------|------|------|
| GET | `/api/settings` | 获取配置 | anthropicApiKey 脱敏返回 |
| PATCH | `/api/settings` | 更新配置 | |

### Webhooks

验证：每个 project 的 `webhookSecret` 校验 `X-Hub-Signature-256`。按 payload 中的 owner/repo 匹配 project（1:1，一个 repo 只能对应一个 project）。handler 幂等：ticket 不存在时静默忽略。

处理事件：

| GitHub 事件 | 触发场景 | ClaudeHub 动作 |
|------------|---------|---------------|
| `issues.closed` | Issue 被关闭 | 仅非 merged ticket 执行删除（完整清理）。merged ticket 忽略（PR merge 自动关闭 Issue 是正常流程） |
| `issues.edited` (title) | Issue title 被改 | 删除对应 ticket（title 不可变） |
| `issues.edited` (body) | Issue description 被改 | 同步 description 到 ticket |
| `check_run.completed` / `workflow_run.completed` (feature branch) | CI 完成 | 匹配 branch → 通知对应 Ticket CC CI 结果 |
| `push` (base branch only) | base branch 变化 | 触发所有非 merged ticket rebase + 更新 Kanban CC worktree（git pull）+ 监控 CD。feature branch push 忽略 |
| `workflow_run.completed` (base branch) | CD 完成/失败 | 成功 → 通知 Kanban CC；失败 → 自动创建 priority=0 bugfix ticket |

| Method | Endpoint | 功能 | 备注 |
|--------|----------|------|------|
| POST | `/api/webhooks/github` | 接收 GitHub 事件 | 验证签名，按事件类型分发处理 |

### WebSocket

并发控制：per-project lock，同一时间只有一个 operator 可操作（终端输入 + UI 按钮）。其他用户 view-only（看终端输出、看板状态）。锁范围仅限人类操作，不阻止 CC 进程的 API 调用和 server 内部操作（webhook、自动 rebase 等）。WebSocket 断开自动释放锁，如只剩一个连接则自动获得锁。

两个独立通道：

**终端通道（双向二进制流）：**

| Endpoint | 功能 | 备注 |
|----------|------|------|
| `/api/ws/terminal/kanban/:projectId` | Kanban CC 终端 | 双向：xterm.js ↔ PTY stdin/stdout。连接时回放 ring buffer 历史 |
| `/api/ws/terminal/ticket/:projectId/:number` | Ticket CC 终端 | 同上 |

**事件通道（单向 JSON 推送）：**

| Endpoint | 功能 | 备注 |
|----------|------|------|
| `/api/ws/events?projectId=xxx` | 看板事件推送 | 单向：server → 前端。可选 projectId 过滤，不传则接收所有 project 事件 |

事件类型：
- `ticket:created` / `ticket:updated` / `ticket:deleted` — ticket 变更
- `ticket:status_changed` — status 流转（含 ccStatus 变化）
- `merge:progress` — merge 异步进度（PR 创建、merge 完成、CD 等待、CD 结果）
- `rebase:started` / `rebase:completed` / `rebase:conflict` — rebase 状态
- `ci:completed` — CI 结果
- `cd:completed` / `cd:failed` — CD 结果
- `kanban_cc:status_changed` — Kanban CC 启停/崩溃/恢复

### Auth

| Method | Endpoint | 功能 | 备注 |
|--------|----------|------|------|
| POST | `/api/auth/login` | 登录 | body: `{username, password}`。V1 硬编码 admin/admin。返回 JWT token |

所有 API 端点 + WebSocket 连接需携带 JWT token（Header `Authorization: Bearer <token>` 或 WebSocket query `?token=xxx`）。

## Redis Key 设计

```
# Auth & Settings
settings                            → Hash { anthropicApiKey, maxConcurrentTickets }

# Projects
project:next_id                     → String (INCR)
project:{id}                        → Hash { id, name, githubUrl, owner, repo, githubToken, baseBranch, webhookId, webhookSecret, createdAt }
projects                            → Set { id1, id2, ... }

# Tickets
project:{projectId}:ticket:next_id  → String (INCR)
ticket:{projectId}:{number}         → Hash { all ticket fields }
project:{projectId}:tickets         → Set { number1, number2, ... }

# Reverse Lookups (webhook 匹配)
repo:{owner}/{repo}                 → String (projectId)
issue:{projectId}:{issueNumber}     → String (ticketNumber)
branch:{projectId}:{branchName}     → String (ticketNumber)

# CC Status
cc:kanban:{projectId}               → Hash { status, pid, lastActiveAt }
cc:ticket:{projectId}:{number}      → Hash { ccStatus, pid, lastActiveAt }

# CC Scheduling
cc:queue                            → Sorted Set { member=projectId:number, score=priority }
cc:running                          → Set { projectId:number, ... }

# Locks
merge:lock:{projectId}              → String (SET NX, TTL)
project:lock:{projectId}            → String (connectionId)
```

## Key Design Decisions

- CC 使用交互模式（PTY），不使用 `--print` / stream-json。xterm.js 通过 WebSocket 直连 PTY，用户体验等同本地终端
- WebSocket 双通道：终端通道（双向二进制，PTY I/O）+ 事件通道（单向 JSON，状态推送）。终端连接时 CC 必须已启动，否则返回错误
- CC 通过 `--plugin-dir` 注入的 HTTP 工具调用 Hono API 操作 ticket（不直接操作 Redis）
- server 通过 Hooks 感知 CC 的工具调用，通过 `/messages` 向 CC 推送系统事件（CI/CD 结果、rebase 通知等）
- Worktree 在 ticket 创建时由 Hono 准备，Ticket CC spawn 到已就绪的 worktree；Kanban CC 有专属 base branch worktree
- Plugin 为预定义模板池，Kanban CC 按 ticket 分析结果选子集，Hono 组装 plugin-dir
- GitHub 联动 1:1：ticket = Issue，状态通过 label 同步，merge 时创建 PR（`closes #N`），webhook 双向同步
- Rebase 由 push webhook 统一触发（无论 ClaudeHub merge 还是外部 push），不在 merge 端点内处理

## Plugins

预定义 plugin 模板池，存放于 `apps/server/src/plugins/`。Kanban CC 按 ticket 分析结果选子集，Hono assembler 组装临时 plugin-dir 传给 CC。

### Plugin 目录结构

```
apps/server/src/plugins/
├── kanban/                          # Kanban CC 专用（全量加载）
│   ├── ticket-crud/
│   │   └── SKILL.md                 # 创建/更新/删除 ticket，调整 priority，设 taskBrief
│   ├── ticket-review/
│   │   └── SKILL.md                 # Review 流程：读 diff、检查质量、approve/reject
│   └── cc-control/
│       └── SKILL.md                 # 启停 Ticket CC、发消息指导
│
├── ticket/                          # Ticket CC 专用（按需组装）
│   ├── ticket-status/
│   │   └── SKILL.md                 # 更新自身 status（→reviewing）、汇报进度
│   └── git-workflow/
│       └── SKILL.md                 # commit → push → 等 CI → 自检完成度的标准流程
│
└── hooks/                           # 共享 Hooks
    └── hooks.json                   # post-push 通知、文件边界保护
```

### Kanban CC Plugins

Kanban CC **始终全量加载** `kanban/` 下所有 plugin。

| Plugin | 类型 | 功能 |
|--------|------|------|
| `ticket-crud` | Skill | 通过 Hono API 创建/更新/删除 ticket。包含：设 title/description/type/priority、设 taskBrief（任务简报，spawn Ticket CC 时注入）、调整依赖关系。教 CC 使用 `curl` 调用 REST API |
| `ticket-review` | Skill | Review 流程指南：`git diff base..branch` 读变更、检查测试覆盖、代码质量评估、approve（创建 PR）或 reject（打回 + 原因）。包含质量标准 checklist |
| `cc-control` | Skill | Ticket CC 生命周期管理：启动/停止/发消息。用于介入指导（如"换个方案"、"先处理这个 bug"）、监控卡住的 CC |

### Ticket CC Plugins

Ticket CC **按需组装**，Kanban CC 在 taskBrief 中指定需要哪些 plugin（默认全部）。

| Plugin | 类型 | 功能 |
|--------|------|------|
| `ticket-status` | Skill | 自身状态管理：编码完成后调 `PATCH /tickets/:number` 设 `status=reviewing`。包含完成度自检流程（对照 ticket description 逐条验证） |
| `git-workflow` | Skill | 标准 git 工作流：commit message 规范、push 前自检、push 后等待 CI 通知（via `[SYSTEM]` 消息）、CI 失败时自动排查修复。包含分支命名规范和 rebase 指导 |

### Shared Hooks

所有 CC 共享的事件钩子。

| Hook | 触发 | 功能 |
|------|------|------|
| `post-push` | PostToolUse (Bash, 匹配 `git push`) | 推送后日志记录，辅助 server 追踪推送事件 |
| `file-boundary` | PreToolUse (Edit/Write) | 阻止 CC 修改 worktree 外的文件（安全边界，防止越权编辑其他 ticket 或系统文件） |

### 组装流程

1. Kanban CC 分析 ticket → 写入 `taskBrief`，可选指定 plugin 子集
2. Hono `plugin/assembler.ts` 读取 taskBrief 中的 plugin 列表（或默认全部 ticket plugin）
3. 组装临时目录：复制选中的 plugin + 共享 hooks → `/tmp/plugins-{ticketId}/`
4. Spawn Ticket CC 时传入 `--plugin-dir /tmp/plugins-{ticketId}/`
5. Kanban CC 自身固定传入 `--plugin-dir plugins/kanban/`（全量）

### Skill 文件格式

每个 SKILL.md 遵循 Claude Code plugin 规范：

```markdown
---
description: 一行描述，CC 据此判断何时调用
---

# Skill 名称

## 使用场景
何时使用此 skill

## API 端点
具体的 curl 命令模板（含 URL、method、body 格式）

## 流程
分步骤指导 CC 执行

## 注意事项
边界条件、错误处理
```

## Deployment

Docker 部署（仅生产 build），CI/CD 每次 push 自动部署。

### Services

| 服务 | 镜像/构建 | 说明 |
|------|-----------|------|
| server | apps/server/Dockerfile | Hono API + CC 进程管理，安装 git + Claude CLI |
| web | apps/web/Dockerfile | Vite build → nginx 静态服务 |
| redis | redis:8.6-alpine | 状态存储 |

### Volumes

| Volume | 挂载点 | 用途 |
|--------|--------|------|
| repos-data | /repos | bare clone 的 git repos + worktrees，持久化避免重复 clone |
| claude-auth | ~/.claude | Claude CLI auth 数据 |
| redis-data | /data | Redis 持久化 |

### Git Repo & Worktree 策略

```
/repos/                              ← named volume (repos-data)
  └── {owner}/{repo}.git/            ← git clone --bare（添加 project 时，首次全量）
        └── worktrees/
              ├── kanban/            ← Kanban CC 专属，checkout base branch，merge 后自动更新
              ├── ticket-1/          ← git worktree add（创建 ticket 时）
              ├── ticket-2/
              └── ticket-3/
```

1. 添加 project → `git clone --bare` 到 volume（首次全量）
2. 创建 ticket → `git fetch` 拉增量 + `git worktree add -b ticket-xxx`
3. ticket 完成 → `git worktree remove` 清理
4. 容器重启/重新部署 → volume 保留，不需要重新 clone

### GitHub Token
- `GITHUB_TOKEN` 由用户在前端创建 kanban/project 时提供，server 存入 Redis
- 用于 GitHub API 操作（clone、PR、webhook 等）

### Server 容器关键点
- Dockerfile 内安装 git + Claude CLI
- 认证方式（二选一）：
  1. **OAuth**：用户通过前端 Kanban CC 的 xterm.js 终端执行 `claude login`，auth 持久化到 claude-auth volume
  2. **API Key**：用户通过前端 Settings 页面注入 API key，server 存入 Redis，spawn CC 时通过 `ANTHROPIC_API_KEY` 环境变量传入

### Production Server (Mac Mini)

- **Tailscale IP:** 100.107.201.81 (`minyis-mac-mini`)
- **SSH:** `ssh minyis-mac-mini`
- **Deploy path:** `/Users/minyic/claudehub/`
- **Docker:** `/usr/local/bin/docker`（SSH 时需 `export PATH=/usr/local/bin:$PATH`）
- **Tailscale CLI:** `/Applications/Tailscale.app/Contents/MacOS/Tailscale`

### Network Topology

```
Internet
  → https://minyis-mac-mini.tail564b26.ts.net (Tailscale Funnel)
    → nginx gateway (port 8080)
      → /                → 个人主页（预留）
      → /claudehub/      → web container (port 3000, 前端静态)
      → /claudehub/api/  → server container (port 7700, API + WebSocket)
```

- **Funnel URL:** `https://minyis-mac-mini.tail564b26.ts.net/claudehub/`
- **Webhook URL:** `https://minyis-mac-mini.tail564b26.ts.net/claudehub/api/webhooks/github`

### CD Pipeline

```
push to main
  → GitHub Actions (ubuntu-24.04-arm)
  → Build server + web Docker images (linux/arm64)
  → Push to ghcr.io/minyic7/claudehub-{server,web}:latest
  → Tailscale SSH → Mac Mini
  → SCP docker-compose.yml
  → docker compose pull + up -d + health check
```

### GitHub Secrets

| Secret | 说明 |
|--------|------|
| `GITHUB_TOKEN` | 自动提供，推 image 到 GHCR |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth，CI 建立隧道 |
| `TS_OAUTH_SECRET` | Tailscale OAuth secret |
| `DEPLOY_SSH_KEY` | SSH 私钥（ed25519），连接 Mac Mini |
| `DEPLOY_USER` | Mac Mini 用户名（minyic） |
| `DEPLOY_HOST` | Mac Mini Tailscale IP（100.107.201.81） |

## Commands

```bash
# 开发
pnpm install          # 安装依赖
pnpm -F server dev    # 启动后端开发服务器
pnpm -F web dev       # 启动前端开发服务器

# 部署（自动，push to main 触发）
# 手动部署
docker compose pull && docker compose up -d --remove-orphans
```
