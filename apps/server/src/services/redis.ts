import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379/0";

export const redis = new Redis(redisUrl);
