import { Hono } from "hono";
import type { UpdateSettingsInput, SettingsResponse } from "@claudehub/shared";
import * as db from "../services/redis.js";

export const settings = new Hono();

// GET /api/settings
settings.get("/", async (c) => {
  const data = await db.getSettings();
  const response: SettingsResponse = {
    anthropicApiKey: data.anthropicApiKey
      ? `****${data.anthropicApiKey.slice(-4)}`
      : undefined,
    maxConcurrentTickets: data.maxConcurrentTickets,
  };
  return c.json(response);
});

// PATCH /api/settings
settings.patch("/", async (c) => {
  const body = await c.req.json<UpdateSettingsInput>();

  if (body.maxConcurrentTickets !== undefined) {
    if (!Number.isInteger(body.maxConcurrentTickets) || body.maxConcurrentTickets < 1 || body.maxConcurrentTickets > 100) {
      return c.json({ error: "maxConcurrentTickets must be an integer between 1 and 100" }, 400);
    }
  }

  const updated = await db.updateSettings(body);
  const response: SettingsResponse = {
    anthropicApiKey: updated.anthropicApiKey
      ? `****${updated.anthropicApiKey.slice(-4)}`
      : undefined,
    maxConcurrentTickets: updated.maxConcurrentTickets,
  };
  return c.json(response);
});
