import { Hono } from "hono";

export const projects = new Hono();

// GET /api/projects
projects.get("/", (c) => c.json([]));

// POST /api/projects
projects.post("/", async (c) => {
  // TODO: create project, git clone --bare, store in Redis
  return c.json({ message: "not implemented" }, 501);
});

// GET /api/projects/:id
projects.get("/:id", (c) => {
  // TODO: get project by id from Redis
  return c.json({ message: "not implemented" }, 501);
});
