# ClaudeHub

GitHub-based 项目管理看板，Claude Code 作为唯一执行和决策层。

## Architecture

三层架构：
- **Hono API Server** — 基础设施：CRUD、进程生命周期、stdin/stdout 管道、WebSocket 广播、GitHub 操作、按指令组装 plugin-dir
- **Kanban CC** — 决策：每 project 一个持久 `claude --print` stream-json 进程。分析 ticket、选择 plugin、监控进度、介入指导
- **Ticket CC** — 执行：每 ticket 一个持久 `claude --print` stream-json 进程。编码、测试、提交、推送、创建 PR。4 层隔离（scoped cwd、.git 边界、按需 plugin-dir、--setting-sources project,local）

### Ticket CC Spawn 参数

```bash
claude --print \
  --input-format stream-json \
  --output-format stream-json \
  --session-id <ticket-id> \
  --append-system-prompt "<kanban CC 生成的任务简报>" \
  --resume \
  --plugin-dir <assembled-plugins/> \
  --mcp-config <assembled-mcp.json> \
  --setting-sources project,local \
  --dangerously-skip-permissions
```

| 参数 | 用途 |
|------|------|
| `--append-system-prompt` | Kanban CC 分析 ticket 后生成任务简报，ticket CC 立刻有上下文开始工作 |
| `--resume` | 进程崩溃或容器重启后恢复会话，不丢失上下文 |
| `--plugin-dir` | Kanban CC 决定所需 plugin 子集，Hono 组装目录 |
| `--mcp-config` | Kanban CC 决定所需 MCP server，Hono 组装配置文件。注入模式同 plugin-dir |
| Hooks | Hono 注册 pre/post tool hooks，用于 GitHub 操作的阻断/事件通知，进度广播到前端 |

## Tech Stack

- Frontend: React 19 · Vite 7 · TypeScript · React Router v7 · HeroUI · Tailwind v4 · @dnd-kit · xterm.js · zustand · Sonner · React Hook Form
- Backend: Node 24 LTS · Hono · Redis · pnpm monorepo · TypeScript
- Infra: Docker · docker-compose

## Project Structure

```
claudehub/
├── docker-compose.yml            # server + redis + web
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
│
├── packages/
│   └── shared/                   # 前后端共享类型/常量
│       └── src/
│           ├── types/
│           │   ├── ticket.ts     # Ticket, TicketStatus, Column
│           │   ├── project.ts
│           │   ├── plugin.ts
│           │   └── stream.ts     # stream-json 消息类型定义（纯类型）
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
│   │       ├── hooks/            # useWebSocket (连接+分发), useProject
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
│           │   ├── streamJson.ts # stream-json JSONL 解析/序列化（运行时逻辑）
│           │   └── broadcast.ts  # WS 广播工具
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

## Key Design Decisions

- `shared/types/stream.ts` = 纯类型定义（前后端共用），`server/lib/streamJson.ts` = JSONL 运行时解析/序列化（仅 server）
- `useWebSocket` 是唯一消息入口，按 type 分发到 boardStore / terminalStore
- Worktree 在 ticket 创建时由 Hono 准备，ticket CC spawn 到已就绪的 worktree
- Plugin 为预定义模板池，Kanban CC 按 ticket 分析结果选子集，Hono 组装 plugin-dir

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
              ├── ticket-001/        ← git worktree add（创建 ticket 时）
              ├── ticket-002/
              └── ticket-003/
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
      → /         → web container (port 3000, 前端静态)
      → /api/     → server container (port 7700, API + WebSocket)
      → /api/webhooks/ → server container (port 7700, GitHub Webhooks)
```

- **Funnel URL:** `https://minyis-mac-mini.tail564b26.ts.net`
- **Webhook URL:** `https://minyis-mac-mini.tail564b26.ts.net/api/webhooks/github`

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
