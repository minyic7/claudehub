import { Hono } from "hono";

export const tickets = new Hono();

// GET /api/tickets?projectId=xxx
tickets.get("/", (c) => c.json([]));

// POST /api/tickets
tickets.post("/", async (c) => {
  // TODO: create ticket, git fetch + worktree add, spawn ticket CC
  return c.json({ message: "not implemented" }, 501);
});

// PATCH /api/tickets/:id
tickets.patch("/:id", async (c) => {
  // TODO: update ticket status
  return c.json({ message: "not implemented" }, 501);
});
