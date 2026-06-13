// src/queue/redis.js
import { Redis } from "ioredis";

export const redisConfig = {
  host: "72.60.220.7",
  port: 6379,
  password: "Swastech@123",
};

export const redisConnection = new Redis({
  host:redisConfig.host || "127.0.0.1",
  port: Number(redisConfig.port),
  password: redisConfig.password,
  maxRetriesPerRequest: null,
});

redisConnection.on("connect", () => console.log("✅ Redis connected"));
redisConnection.on("error", (err) => console.error("❌ Redis error:", err));
