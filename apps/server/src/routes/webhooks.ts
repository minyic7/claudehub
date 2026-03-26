import { Hono } from "hono";

export const webhooks = new Hono();

// POST /api/webhooks/github
webhooks.post("/github", async (c) => {
  // TODO: verify signature, parse event, update board state
  const event = c.req.header("X-GitHub-Event");
  console.log(`GitHub webhook received: ${event}`);
  return c.json({ received: true });
});
