// queue.js
import { Queue } from "bullmq";
import { redisConfig, redisConnection } from "./redis.js";

export const notificationQueue = new Queue("notification-queue", {
  connection: redisConnection,
});

// await notificationQueue.drain();        // clears waiting + delayed jobs
// await notificationQueue.clean(0);       // clears completed, failed, delayed, etc.
// await notificationQueue.obliterate({ force: true }); // removes EVERYTHING including repeatable jobs

export const lastSyncQueue = new Queue("last-sync-queue", {
  connection: redisConnection,
});

