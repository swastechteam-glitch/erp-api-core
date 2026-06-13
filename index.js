// index.js
import dotenv from "dotenv";
dotenv.config(); // Must be first

import express from "express";
import cors from "cors";
import compression from "compression";
import requestIp from "request-ip";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server as SocketIO } from "socket.io";
import Redis from "ioredis";
import { Queue } from "bullmq";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { createBullBoard } from "@bull-board/api";
import admin from "firebase-admin";
import { readFileSync } from "fs";

import appRoutes from "./src/routes/index.js";
import { companyResolver } from "./src/middleware/companyResolver.js";
import { getNetworkTime } from "./src/utils/common.js";
import { notificationJob, scheduleLastSyncJob } from "./src/queue/producer.js";
import { lastSyncQueue } from "./src/queue/queue.js";
import { initQueueEvents } from "./src/queue/events.js";
import { redisConfig, redisConnection } from "./src/queue/redis.js";
import { notificationQueue } from "./src/queue/queue.js";
// import "./src/queue/worker.js";

// --------------------------------------------------------
// ESM helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------------------------
// Firebase initialization
const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, "firebase-key.json"), "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// --------------------------------------------------------
// Redis Initialization (VERY IMPORTANT: before using anywhere)

redisConnection.on("connect", () => console.log("✅ Redis connected"));
redisConnection.on("error", (err) => console.error("❌ Redis error:", err));

// --------------------------------------------------
// AUTO START ALL LAST SYNC JOBS WHEN SERVER BOOTS
// --------------------------------------------------
// const subDBList = ["KPT",];

// subDBList.forEach((db) => {
//   scheduleLastSyncJob(db);
// });

// --------------------------------------------------------
// Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(requestIp.mw());

const allowedOrigins = [
  "https://sasm.swasinfotechnologies.cloud",
  "https://kpf.swasinfotechnologies.cloud",
  "https://kas.swasinfotechnologies.cloud",
  "https://tpn.swasinfotechnologies.cloud",
  "https://gomathiamman.swasinfotechnologies.cloud",
  "https://kpt.swasinfotechnologies.cloud",
  "https://vindhya.swasinfotechnologies.cloud",
  "https://swasinfotechnologies.cloud",
  "https://lp3vbxbr-3000.inc1.devtunnels.ms",
  // "http://localhost:3000",
  // "http://localhost:3001",
  "http://192.168.1.12:3000",
  // "http://192.168.1.5:3000",
  // "http://localhost:8000"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) callback(null, true);
      else {
        console.log("❌ BLOCKED ORIGIN:", origin);
        return callback(null, false);
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "subdbname"],
    methods: ["GET", "POST", "PUT", "DELETE"],
  }),
);

// --------------------------------------------------------
// HTTP & Socket.IO
const httpServer = http.createServer(app);
export const io = new SocketIO(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
});

io.on("connection", (socket) => {
  console.log("🔥 Socket connected:", socket.id);

  socket.on("message", (data) => {
    socket.emit("serverMessage", "Received: " + data);
  });

  socket.on("register-fcm-token", async (data) => {
    const { fcmToken, subdbname = "guest", isGuest } = data;
    if (!fcmToken) return console.log("❌ No FCM token");

    try {
      // Store in Redis
      await redisConnection.setex(
        `fcm:${subdbname}:${socket.id}`,
        3600,
        JSON.stringify({ token: fcmToken, isGuest }),
      );
      await redisConnection.sadd(`fcm:tokens:${subdbname}`, fcmToken);

      console.log(
        `✅ FCM registered: ${subdbname} (${isGuest ? "guest" : "user"})`,
      );
      socket.emit("token-registered", { success: true });
    } catch (err) {
      console.error("Token registration failed:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// --------------------------------------------------------
// BullMQ Queues
const myQueue = new Queue("myQueue", { connection: redisConnection });

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  // queues: [new BullMQAdapter(sampleQueue), new BullMQAdapter(lastSyncQueue),], // wrap your queue here
  queues: [
    new BullMQAdapter(notificationQueue), // ✅ Correct queue instance
    new BullMQAdapter(lastSyncQueue),
  ],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

// --------------------------------------------------------
// Test API to add job
app.get("/test-queue", async (req, res) => {
  try {
    const job = await notificationJob(req, res);
    res.json({ status: "Job added", jobId: job?.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/last-sync", async (req, res) => {
  scheduleLastSyncJob(req.headers.subdbname);
  // await notificationJob({
  //   message: "Test queue message",
  //   Name: "Anbu",
  //   subdbname: req.headers.subdbname,
  //   userId: 24,
  // });
  res.json({ status: "Last Sync Job added" });
});

// Update API
app.get("/update.json", (req, res) => {
  res.json({
    latestVersionCode: 3,
    latestVersionName: "2.2",
    apkUrl: "https://zgz261q3-8000.inc1.devtunnels.ms/etex-v2.1.apk",
    releaseNotes: "Bug fixes and improvements",
  });
});

// Health API
app.get("/health", async (req, res) => {
  const time = await getNetworkTime();
  io.emit("check_emit", { subdbname: req.headers.subdbname, value: time });
  res.status(200).json({ status: 200, message: "Success", time });
});

// API Routes
app.use("/api/v1", appRoutes());

// Initialize queue events
// initQueueEvents(io);

// import "./src/queue/worker.js";
// --------------------------------------------------------
// Start server
const PORT = process.env.PORT || 8001;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
