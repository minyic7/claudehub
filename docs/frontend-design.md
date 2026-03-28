# Frontend Design

## Tech Stack

React 19 · Vite 7 · TypeScript · React Router v7 · HeroUI · Tailwind v4 · @dnd-kit · xterm.js · zustand · Sonner · React Hook Form

## Base Path

生产环境 app 挂在 `/claudehub/` 下（nginx 转发）。需要配置：

- **Vite**: `base: "/claudehub/"` in `vite.config.ts`
- **React Router**: `basename="/claudehub"` on Router
- **API Client**: `VITE_API_BASE=/claudehub/api`（开发环境可用 proxy 到 `localhost:7700`）
- **WebSocket**: WS URL 也需要拼接 base path（`/claudehub/api/ws/...`）

开发环境（`pnpm -F web dev`）base path 为 `/`，通过 Vite proxy 转发 `/api` 到后端。

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Centered login card on `--bg-base`. ClaudeHub pixel logo + cat icon at top. Username/password fields (`--bg-input`, `--border-default`). "Login" button accent color. Error shown inline below fields |
| Projects | `/projects` | Project list + create project form |
| Board | `/projects/:id/board` | Main kanban view (core page) |
| Settings | `/settings` | API key, maxConcurrentTickets |

- `/` redirects to `/projects`
- Protected routes: all except `/login`. Redirect to `/login` if no token.

## Board Layout

```
+----------------------------------------------+---------------------------+
|  Header (← Projects, project name, settings) |                           |
+----------------------------------------------+  Terminal Panel (right)   |
|                                              |                           |
|  Kanban Board (left)                         |  [Kanban CC] [Ticket #3]  |
|                                              |  +---------------------+  |
|  +--------+ +--------+ +--------+ +-------+ |  |                     |  |
|  |  TODO  | |IN PROG | |REVIEW  | |MERGED | |  |  xterm.js terminal  |  |
|  |        | |        | |        | |       | |  |                     |  |
|  | Card 1 | | Card 3 | | Card 5 | |Card 7| |  |                     |  |
|  | Card 2 | | Card 4 | |        | |Card 8| |  |                     |  |
|  |        | |        | |        | |       | |  |                     |  |
|  +--------+ +--------+ +--------+ +-------+ |  +---------------------+  |
|                                              |  [Collapse >>]            |
+----------------------------------------------+---------------------------+
```

### Left: Kanban Board

- 4 columns: `todo`, `in_progress`, `reviewing`, `merged`
- Ticket cards sorted by priority (ascending)
- Drag & drop:
  - **Cross-column drag** = status transition (calls PATCH status)
  - **Same-column drag** = priority reorder (calls PATCH priority)
- "+ New Ticket" button at top → opens create ticket Modal
- Board stats bar: total tickets, running CCs, queued CCs, Kanban CC status

### Right: Terminal Panel

- Collapsible panel (click to collapse/expand to right edge)
- Tab bar with max 2 tabs:
  - **Kanban CC** tab — always present on Board page (shows status: starting/running/stopped/error)
  - **Ticket #N CC** tab — appears when a ticket is opened, disappears when closed
- Each tab contains a full xterm.js terminal connected via WebSocket
- Active tab indicator, click to switch
- Terminal auto-connects on tab activation, replays ring buffer history
- **Kanban CC controls**: Status display (running/stopped/error + uptime) + Restart button in terminal header (DELETE then POST kanban-cc)
- **Operator lock**: If current user is not the operator, terminal is read-only (input disabled), drag disabled, action buttons disabled. Show "View Only" badge.

## Ticket Card

```
+---------------------------+
|  #3  feature         P:2  |
|  Add user auth             |
|  [running] [CI: pass]     |
+---------------------------+
```

- Ticket number, type badge, priority
- Title (truncated if long)
- Status indicators: ccStatus (idle/queued/running/completed), CI status
- **Merge progress**: When merging, card shows inline progress bar/steps:
  - `creating_pr` → "Creating PR..."
  - `merging` → "Merging..."
  - `waiting_cd` → "Waiting for CD..."
  - `cd_failed` → "CD Failed" (warning badge)
  - `cd_timeout` → "CD Timeout" (warning badge)
  - `merged` → normal merged state
- **Return reason badges**:
  - `returnReason === "conflict"` → red "Rebase Conflict" badge
  - `returnReason === "rejected"` → amber "Rejected" badge
- Click → opens Ticket Detail Modal
- Draggable via @dnd-kit

## Ticket Detail Modal

```
+------------------------------------------+
|  Ticket #3: Add user auth          [X]   |
+------------------------------------------+
|  Status: in_progress    Type: feature    |
|  Priority: 2            Branch: feat/... |
|  CC Status: running     CI: passed       |
|                                          |
|  Description:                            |
|  +------------------------------------+  |
|  | Implement JWT-based authentication |  |
|  | with login/logout endpoints...     |  |
|  +------------------------------------+  |
|  [Edit]                                  |
|                                          |
|  Dependencies: #1, #2           [Edit]   |
|  Priority: 2                    [Edit]   |
|                                          |
|  Actions:                                |
|  [Start CC] [Stop CC] [Delete]           |
|  [Move to Todo] [Move to Reviewing]      |
|  [Merge]                                 |
+------------------------------------------+
```

- Full ticket details (all fields)
- Editable description (inline edit or sub-modal)
- Editable dependencies (multi-select of non-merged tickets, non-merged status only)
- Editable priority (number input, non-merged status only, validates uniqueness)
- Action buttons based on current status:
  - `todo`: "Start" (→ in_progress). Disabled with tooltip if dependencies not all merged
  - `in_progress`: "Back to Todo", "Move to Reviewing", "Start CC", "Stop CC". "Move to Reviewing" disabled with tooltip if CI not passed
  - `reviewing`: "Merge" (POST /merge), "Reject" (→ in_progress), "Back to Todo"
  - `reviewing` + merge in progress: "Cancel Merge" (DELETE /merge), merge progress indicator
  - `merged`: read-only, no actions
- Disabled buttons: `opacity: 0.4`, `cursor: not-allowed`, tooltip on hover explains why (e.g. "Dependencies #1, #2 not yet merged", "CI not passed")
- Delete button (with confirmation, shows dependents if any)
- Opening this modal also adds/switches the Ticket CC terminal tab in the right panel
- Closing this modal removes the Ticket CC tab

## Create Ticket Modal

```
+------------------------------------------+
|  New Ticket                        [X]   |
+------------------------------------------+
|  Title:    [________________________]    |
|  Type:     [feature v]                   |
|  Description:                            |
|  +------------------------------------+  |
|  |                                    |  |
|  +------------------------------------+  |
|  Priority: [auto]                        |
|  Dependencies: [multi-select]            |
|                                          |
|  [Cancel]                  [Create]      |
+------------------------------------------+
```

- React Hook Form with validation (title pattern, max length)
- Type dropdown: feature, bugfix, refactor, docs, chore
- Priority: optional, defaults to auto (max+1)
- Dependencies: multi-select of existing non-merged tickets
- Sonner toast on success/error

## Create Project Modal

```
+------------------------------------------+
|  New Project                       [X]   |
+------------------------------------------+
|  GitHub URL: [______________________]    |
|  Name:       [______________________]    |
|  Token:      [______________________]    |
|  Base Branch:[main_________________ ]    |
|                                          |
|  [Cancel]                  [Create]      |
+------------------------------------------+
```

- GitHub URL parsed to extract owner/repo
- Token validated server-side (scope check)
- Base branch defaults to "main"

## Projects Page

```
+------------------------------------------+
|  ClaudeHub                   [Settings]  |
+------------------------------------------+
|                                          |
|  Projects              [+ New Project]   |
|                                          |
|  +------------------------------------+  |
|  | Project Alpha                      |  |
|  | owner/repo  |  12 tickets  |  3 CC |  |
|  +------------------------------------+  |
|  | Project Beta                       |  |
|  | owner/repo2 |  5 tickets   |  1 CC |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+
```

- Project cards with name, repo, ticket count, running CC count
- Click → navigates to Board page
- Edit project: click edit icon → inline fields for name, token (masked). Save/Cancel buttons. Token change validated server-side
- Sync button (POST /sync → git fetch), shows spinner during sync
- Delete project (with confirmation dialog: "This will stop all CCs, remove worktrees, close Issues/PRs, and delete remote branches")

## Settings Page

```
+------------------------------------------+
|  Settings                                |
+------------------------------------------+
|  Anthropic API Key:                      |
|  [****abcd________________________]      |
|                                          |
|  Max Concurrent Tickets: [20]            |
|                                          |
|  [Save]                                  |
+------------------------------------------+
```

- API key masked on display, full value on edit
- Max concurrent tickets: number input, 1-100

## State Management (zustand)

### boardStore

```typescript
interface BoardStore {
  // Board data
  project: Project | null;
  columns: BoardColumn[];
  stats: BoardStats;
  kanbanCCStatus: "running" | "stopped" | "error";

  // Actions
  fetchBoard: (projectId: string) => Promise<void>;
  moveTicket: (number: number, toStatus: TicketStatus) => Promise<void>;
  reorderTicket: (number: number, newPriority: number) => Promise<void>;

  // Operator lock
  isOperator: boolean;

  // WebSocket event handlers
  handleTicketCreated: (ticket: Ticket) => void;
  handleTicketUpdated: (data: { number: number; changes: Partial<Ticket> }) => void;
  handleTicketDeleted: (data: { number: number }) => void;
  handleStatusChanged: (data: { number: number; from: string; to: string; ccStatus: string }) => void;
  handleMergeProgress: (data: { number: number; step: string }) => void;
  handleRebaseEvent: (data: { number: number; event: string }) => void;
  handleCICompleted: (data: { number: number; passed: boolean }) => void;
  handleCDEvent: (data: { event: string; passed?: boolean }) => void;
  handleKanbanCCStatus: (data: { status: string }) => void;
}
```

### terminalStore

```typescript
interface TerminalStore {
  // Active terminals
  activeTab: "kanban" | "ticket";     // currently visible tab
  activeTicketNumber: number | null;  // currently open ticket terminal (max 1)
  kanbanConnected: boolean;
  ticketConnected: boolean;

  // Actions
  switchTab: (tab: "kanban" | "ticket") => void;
  openTicketTerminal: (number: number) => void;  // also switches to ticket tab
  closeTicketTerminal: () => void;                // also switches to kanban tab
  setKanbanConnected: (connected: boolean) => void;
  setTicketConnected: (connected: boolean) => void;
}
```

### authStore

```typescript
interface AuthStore {
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: () => boolean;
}
```

## Custom Hooks

### WebSocket URL Builder

```typescript
// hooks/useWsUrl.ts
function buildWsUrl(path: string, params?: Record<string, string>): string {
  const base = import.meta.env.VITE_API_BASE || "/claudehub/api";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const query = new URLSearchParams({
    ...params,
    token: localStorage.getItem("token") || "",
  }).toString();
  return `${protocol}//${host}${base}${path}?${query}`;
}
```

### useEventWs(projectId)

Connects to `buildWsUrl("/ws/events", { projectId })`. Dispatches events to boardStore handlers. Auto-reconnects on disconnect.

### useAutoStartKanbanCC(projectId)

Called on BoardPage mount. Checks Kanban CC status via `api.getKanbanCC()`. If stopped, auto-starts via `api.startKanbanCC()`. Updates `boardStore.kanbanCCStatus`. Handles 409 (already running) silently.

### useTerminalWs(type, projectId, number?)

Connects via `buildWsUrl("/ws/terminal/kanban/:projectId")` or `buildWsUrl("/ws/terminal/ticket/:projectId/:number")`. Returns:
- `attach(terminal: Terminal)` — attach xterm.js instance
- `send(data: string)` — write to terminal
- `connected: boolean`

Replays ring buffer history on connect. Auto-reconnects.

### useProject(projectId)

Fetches and caches project data. Returns `{ project, loading, error }`.

## API Client

```typescript
// api/client.ts
const BASE = import.meta.env.VITE_API_BASE || "/claudehub/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = `${import.meta.env.BASE_URL}login`;
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Projects
  getProjects: () => request<Project[]>("/projects"),
  createProject: (data: CreateProjectInput) => request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  updateProject: (id: string, data: Partial<Project>) => request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  syncProject: (id: string) => request<void>(`/projects/${id}/sync`, { method: "POST" }),

  // Board
  getBoard: (projectId: string) => request<BoardView>(`/projects/${projectId}/board`),

  // Tickets
  getTickets: (projectId: string) => request<Ticket[]>(`/projects/${projectId}/tickets`),
  createTicket: (projectId: string, data: CreateTicketInput) => request<Ticket>(`/projects/${projectId}/tickets`, { method: "POST", body: JSON.stringify(data) }),
  updateTicket: (projectId: string, number: number, data: Partial<Ticket>) => request<Ticket>(`/projects/${projectId}/tickets/${number}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTicket: (projectId: string, number: number, cascade?: boolean) => request<void>(`/projects/${projectId}/tickets/${number}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" }),
  mergeTicket: (projectId: string, number: number) => request<void>(`/projects/${projectId}/tickets/${number}/merge`, { method: "POST" }),
  cancelMerge: (projectId: string, number: number) => request<void>(`/projects/${projectId}/tickets/${number}/merge`, { method: "DELETE" }),

  // Kanban CC
  startKanbanCC: (projectId: string) => request<void>(`/projects/${projectId}/kanban-cc`, { method: "POST" }),
  getKanbanCC: (projectId: string) => request<KanbanCCStatus>(`/projects/${projectId}/kanban-cc`),
  stopKanbanCC: (projectId: string) => request<void>(`/projects/${projectId}/kanban-cc`, { method: "DELETE" }),
  sendKanbanCCMessage: (projectId: string, content: string) => request<void>(`/projects/${projectId}/kanban-cc/messages`, { method: "POST", body: JSON.stringify({ content }) }),

  // Ticket CC
  startTicketCC: (projectId: string, number: number) => request<void>(`/projects/${projectId}/tickets/${number}/cc`, { method: "POST" }),
  getTicketCC: (projectId: string, number: number) => request<TicketCCStatus>(`/projects/${projectId}/tickets/${number}/cc`),
  stopTicketCC: (projectId: string, number: number) => request<void>(`/projects/${projectId}/tickets/${number}/cc`, { method: "DELETE" }),
  sendTicketCCMessage: (projectId: string, number: number, content: string) => request<void>(`/projects/${projectId}/tickets/${number}/cc/messages`, { method: "POST", body: JSON.stringify({ content }) }),

  // Settings
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (data: Partial<Settings>) => request<Settings>("/settings", { method: "PATCH", body: JSON.stringify(data) }),

  // Auth
  login: (username: string, password: string) => request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
};
```

## Component Tree

```
App
├── ScanlineOverlay (global, fixed position)
├── PawPrintBg (global background pattern)
├── LoginPage
├── Layout (Header + Sidebar)
│   ├── ProjectsPage
│   │   ├── ProjectCard[]
│   │   └── CreateProjectModal
│   ├── BoardPage
│   │   ├── BoardHeader (project info, stats, Kanban CC status, "+ New Ticket")
│   │   ├── SplitView
│   │   │   ├── KanbanBoard (left, resizable)
│   │   │   │   ├── Column[] (@dnd-kit droppable)
│   │   │   │   │   └── TicketCard[] (@dnd-kit draggable)
│   │   │   │   └── DragOverlay
│   │   │   └── TerminalPanel (right, collapsible)
│   │   │       ├── TerminalHeader (CC status, uptime, restart button)
│   │   │       ├── TerminalTabs
│   │   │       ├── CatScene (pixel art cats, moon, stars — canvas)
│   │   │       └── TerminalView (xterm.js)
│   │   ├── TicketDetailModal
│   │   └── CreateTicketModal
│   └── SettingsPage
```

## Drag & Drop Behavior

### Cross-column (status change)

1. User drags card from column A to column B
2. Optimistic UI: move card immediately
3. Call `PATCH /tickets/:number` with `{ status: newStatus }`
4. If API rejects (e.g., deps not merged for todo→in_progress, CI not passed for →reviewing):
   - Revert card position with bounce-back animation (300ms)
   - Show Sonner error toast with specific reason from API response
5. If API succeeds: WebSocket event confirms, board syncs

Note: Pre-validation on drag is not performed — the backend is the source of truth for transition rules. Drag always appears valid visually (except merged column), backend rejects invalid transitions.

### Same-column (priority reorder)

1. User drags card within same column
2. Calculate new priority based on position (between neighbors)
3. Optimistic UI: reorder immediately
4. Call `PATCH /tickets/:number` with `{ priority: newPriority }`
5. Revert on error

### Restricted drops

- Cannot drag TO `merged` column — merged only via POST /merge endpoint, never by drag
- Cannot drag FROM `merged` column — merged is terminal state
- Visual feedback: invalid drop zones grayed out, valid zones show accent border

## WebSocket Reconnection

Both event and terminal WebSockets:
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Connection status indicator in UI (green dot / red dot)
- Terminal WebSocket replays buffer on reconnect (no manual refresh needed)

## Real-time Updates

Event WebSocket drives all board updates:
- `ticket:created` → add card to column
- `ticket:updated` → update card fields
- `ticket:deleted` → remove card
- `ticket:status_changed` → move card between columns
- `merge:progress` → show progress toast/indicator
- `rebase:*` → show toast notification
- `ci:completed` → update CI badge on card
- `cd:*` → show toast notification
- `kanban_cc:status_changed` → update terminal panel status

## Responsive Design

- Desktop-first (primary use case is desktop browser)
- Minimum width: 1024px
- Terminal panel collapse for smaller screens
- Mobile: simplified board view (stacked columns, no drag)

## Visual Design

Dark theme only. Pixel art / retro aesthetic with cat theme. "外壳是游戏，内核是工具"。

### Design Tokens

#### Colors

```css
/* Background layers (深→浅) */
--bg-base:        #080808;    /* 页面底色 */
--bg-surface:     #0E0E0E;    /* column、面板 */
--bg-card:        #161616;    /* ticket 卡片 */
--bg-elevated:    #1C1C1C;    /* modal、dropdown、hover 态 */
--bg-input:       #121212;    /* 输入框 */

/* Accent */
--accent:         #E8941C;    /* 主强调（选中、active tab、主按钮） */
--accent-hover:   #F0A030;    /* hover 态 */
--accent-dim:     #E8941C33;  /* 20% 透明，用于 subtle 背景 */

/* Text */
--text-primary:   #C0C0C0;    /* 主文字 */
--text-secondary: #808080;    /* 次要文字、placeholder */
--text-muted:     #505050;    /* 禁用态 */
--text-accent:    #E8941C;    /* 强调文字 */

/* Border */
--border-default: #1C1C1C;    /* 默认边框 */
--border-hover:   #2A2A2A;    /* hover 边框 */
--border-active:  #E8941C;    /* 选中/active 边框 */

/* Status (语义色) */
--status-ok:      #5ED490;    /* running、CI passed、merged */
--status-warn:    #E8C040;    /* queued、CD timeout */
--status-error:   #E06060;    /* error、CI failed、CD failed */
--status-info:    #70B8F0;    /* reviewing、idle */

/* Cat eye (column header 状态指示) */
--eye-todo:       #808080;    /* 灰色，休眠 */
--eye-progress:   #5ED490;    /* 绿色，活跃 */
--eye-review:     #E8C040;    /* 黄色，等待 */
--eye-merged:     #70B8F0;    /* 蓝色，完成 */

/* Tag badges — bg (20% opacity) + text */
--tag-feature:    #E8941C20 / #E8941C;
--tag-bugfix:     #E0606020 / #E06060;
--tag-refactor:   #70B8F020 / #70B8F0;
--tag-docs:       #5ED49020 / #5ED490;
--tag-chore:      #80808020 / #808080;
```

#### Typography

```css
/* Font families */
--font-pixel:     'Press Start 2P', monospace;    /* 标题、标签、按钮 */
--font-mono:      'JetBrains Mono', monospace;     /* 正文、终端、ID */

/* Pixel font sizes */
--text-pixel-xs:  8px;     /* tag badge、小标签 */
--text-pixel-sm:  10px;    /* 按钮、列标题 */
--text-pixel-md:  12px;    /* 页面标题 */
--text-pixel-lg:  16px;    /* logo */

/* Mono font sizes */
--text-mono-xs:   11px;    /* 次要信息 */
--text-mono-sm:   13px;    /* 卡片标题、ticket ID */
--text-mono-md:   14px;    /* 正文、modal 内容 */
--text-mono-lg:   16px;    /* 终端输出 */

/* Line height */
--leading-pixel:  1.6;     /* pixel font 行距要大 */
--leading-mono:   1.5;     /* mono font */
```

Font usage boundary:
- **Press Start 2P** → logo, column headers, tag badges, buttons, status labels
- **JetBrains Mono** → ticket titles, ticket IDs, terminal output, all body text

#### Spacing

```css
--space-1:   4px;
--space-2:   8px;
--space-3:   12px;
--space-4:   16px;
--space-5:   20px;
--space-6:   24px;
--space-8:   32px;

/* Component-specific */
--card-padding:     12px 16px;
--column-gap:       16px;
--card-gap:         8px;
--panel-padding:    16px;
```

#### Effects

```css
/* Scanline overlay (改良版 — 慢速、低透明度，环境质感而非干扰) */
--scanline-dash:      14px;
--scanline-gap:       9px;
--scanline-speed:     5s;
--scanline-opacity:   0.03;

/* Card */
--card-radius:        0px;       /* 像素风不用圆角 */
--card-hover-lift:    -3px;      /* translateY */
--card-hover-border:  #2A2A2A;
/* Running ticket: crawling dashed border, 1px #E8941C40, animation 3s linear infinite */

/* Cat ears clip-path (卡片顶部猫耳裁切) */
--cat-ear-clip: polygon(0 8px, 6px 0, 12px 8px, 12px 8px, 100% 8px, 100% 100%, 0 100%);

/* Paw print background pattern */
--paw-opacity:  0.02;
--paw-size:     60px;
--paw-gap:      120px;

/* Shadows & Overlays */
--shadow-modal:    0 0 0 1px #1C1C1C, 0 8px 32px #00000080;
--overlay-modal:   #000000B0;     /* modal 遮罩 ~70% */
```

### Cat Theme Elements

- **Cat ear cards**: `clip-path` on ticket cards creates cat ear silhouette at top
- **Cat eye indicators**: Small dot on each column header — color matches column status (see `--eye-*` tokens)
- **Cat scene**: Right panel header area with pixel art cats, moon, stars, yarn ball (canvas-drawn)
- **Paw print pattern**: Subtle repeating paw print background on `--bg-base`, opacity 0.02
- **Cat animations**: Pixel cats gently float (subtle `translateY` sine wave), sleeping cat shows floating zzz

### Column Styling

All columns share `--bg-surface` (#0E0E0E) background. Status differentiation through:
- Column header cat eye color (todo=gray, in_progress=green, reviewing=yellow, merged=blue)
- Column header text uses `--font-pixel` at `--text-pixel-sm`
- Ticket count badge next to column title: `(3)` in `var(--text-secondary)`, `--font-mono` at `--text-mono-xs`

### Animations & Transitions

All transitions use `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out) unless noted.

#### Card Hover

```css
.ticket-card {
  transition: transform 150ms, border-color 150ms, background-color 150ms;
}
.ticket-card:hover {
  transform: translateY(-3px);
  border-color: var(--border-hover);      /* #1C1C1C → #2A2A2A */
  background-color: #1A1A1A;              /* subtle lighten from #161616 */
}
```

Cat eye on card: idle eyes dim (`#404040`) on hover brighten to their status color.

#### Drag & Drop

**Pick up (drag start):**
- Card scales up slightly: `transform: scale(1.03)`
- Border becomes accent: `border-color: var(--accent)` with `opacity: 0.5`
- Card gets elevated shadow: `box-shadow: 0 8px 24px #00000060`
- Rest of board dims: other cards `opacity: 0.6`, transition 200ms
- Source slot shows dashed placeholder outline (`1px dashed var(--border-hover)`)

**During drag (DragOverlay):**
- Card follows cursor with slight rotation: `transform: rotate(2deg)` for natural feel
- Cursor: `grabbing`

**Over valid drop zone:**
- Column border pulses accent: `border-color: var(--accent-dim)`, subtle `pulse` animation (opacity 0.3→0.6, 800ms)
- Drop position indicator: thin horizontal line (`2px solid var(--accent)`) between cards at insert point

**Over invalid drop zone (merged column):**
- Column shows no highlight change
- Cursor: `not-allowed`
- DragOverlay card tints red: `border-color: var(--status-error)` with `opacity: 0.3`

**Drop (drag end):**
- Card snaps to new position: `transform` transition 200ms
- Brief success flash: card background `var(--accent-dim)` → `var(--bg-card)`, 300ms fade
- Other cards restore `opacity: 1`, transition 200ms

**Drop rejected (API error):**
- Card animates back to original position: 300ms ease-out
- Card flashes red border: `border-color: var(--status-error)`, 400ms fade back to default
- Sonner error toast slides in

#### Card Status Animations

**Idle (ccStatus=idle):**
- No special border (default `1px solid var(--border-default)`)
- Cat eye: gray (`#404040`), steady

**Running (ccStatus=running):**
- Crawling dashed border: `border: 1px dashed var(--accent)` at 40% opacity
- `background-size: 16px 16px` dash pattern, `animation: crawl 3s linear infinite`
- Cat eye on card: green, gentle pulse (opacity 0.7→1.0, 2s)

**Queued (ccStatus=queued):**
- Static dashed border: `border: 1px dashed var(--status-warn)` at 30% opacity (no animation)
- Cat eye: yellow, steady

**Completed (ccStatus=completed):**
- Cat eye: green, steady (no pulse)

**Merge in progress:**
- Card border: accent color, slow pulse (opacity 0.3→0.7, 1.5s)
- Progress text fades between steps: `opacity` transition 200ms

**Return reason badges:**
- Rebase conflict: red badge with subtle shake animation on appear: `translateX(-2px, 2px, -1px, 1px, 0)`, 300ms, once
- Rejected: amber badge, fade-in 200ms, no shake (less urgent than conflict)

#### Column Drop Highlight

When any card is being dragged:
- Valid columns: cat eye brightens (opacity 0.5→1.0), 200ms
- Merged column: cat eye stays dim, no change

#### Modal

**Open:**
- Overlay fades in: `opacity: 0→1`, 200ms
- Modal slides up + fades: `translateY(16px) → translateY(0)` + `opacity: 0→1`, 250ms

**Close:**
- Reverse of open, 150ms (slightly faster for responsiveness)

#### Terminal Panel

**Expand/Collapse:**
- Width transition: 300ms ease-out
- Content fades: `opacity` 150ms (fade out before collapse, fade in after expand)
- Collapse button icon rotates: `rotate(0deg) → rotate(180deg)`, 200ms

**Tab switch:**
- Active tab underline slides: `transform: translateX()`, 200ms
- Terminal content cross-fades: outgoing `opacity: 1→0` 100ms, incoming `opacity: 0→1` 100ms (staggered)

#### Toast Notifications (Sonner)

Sonner handles its own animations. Custom styling:
- Background: `var(--bg-elevated)`
- Border: `1px solid var(--border-default)`
- Text: `var(--font-mono)` at `var(--text-mono-sm)`
- Success icon color: `var(--status-ok)`
- Error icon color: `var(--status-error)`

#### Page Transitions

- Route change: content area fades `opacity: 0→1`, 150ms
- No slide — keep it snappy for a tool

#### Operator Lock (View Only)

When current user is not the operator:
- "View Only" badge: fixed top-right of board area, `var(--font-pixel)` at `--text-pixel-xs`, amber border, pulse animation (subtle, 3s)
- Cards: no hover lift (`transform: none`), `cursor: default` (not `grab`)
- Action buttons in modal: all disabled (`opacity: 0.3`), tooltip "View only — another user is operating"
- Terminal input: visually dimmed input area, keystrokes ignored, placeholder text "View only mode"
- Drag: completely disabled (`@dnd-kit` sensors removed), no drag handle cursor

#### Terminal Panel Dimensions

```css
--panel-default-width:   420px;     /* initial width */
--panel-min-width:       320px;     /* resize minimum */
--panel-max-width:       50vw;      /* resize maximum */
--panel-collapsed-width: 36px;      /* collapsed: just the expand button strip */
```

Collapsed state: panel shrinks to `36px` wide strip showing a vertical `>>` expand button. Board takes full remaining width.

#### Modal Submit Flow

1. User clicks "Create" / "Save"
2. Button enters loading state (spinner replaces text)
3. On success: modal closes (close animation 150ms) → Sonner success toast appears
4. On error: modal stays open, button exits loading, Sonner error toast with API message, form fields preserved
5. On validation error (client-side): no API call, inline field errors shown (red border + error text below field)

#### Loading States

- Board skeleton: cards show as empty `var(--bg-card)` rectangles with subtle shimmer (`background-position` animation, 1.5s)
- Button loading: text replaced by 3-dot pixel bounce animation
- Spinner: pixel-art style rotating cat paw (4-frame sprite, 400ms per frame)
- Terminal connecting: centered text "Connecting..." in `var(--text-secondary)`, cat eye blinks
