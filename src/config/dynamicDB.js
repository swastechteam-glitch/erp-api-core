import sql from "mssql";
import { clientDBConfig } from "./dbConfigMap.js";

const connectionCache = new Map();

// Fixed key for the central AI-chat metadata DB. All tbl_chat_* tables
// (schema / rules / examples / intent patterns / history) live there,
// regardless of which client DB the request's subdbname resolves to.
export const AI_CHAT_DB_KEY = "AI_CHAT";

// Convenience wrapper — always returns a pool to the central AI-chat DB.
// Reuses the same cached-pool mechanism as getPool() so we don't open a
// new connection per request.
export async function getAiChatPool() {
  return getPool(AI_CHAT_DB_KEY);
}

export async function getPool(subDBName) {
  console.log(subDBName, "subDBName");

  const rawConfig = clientDBConfig[subDBName];
  if (!rawConfig) {
    throw new Error(`❌ No DB config found for ${subDBName}`);
  }

  // If cached and still connected → reuse
  if (connectionCache.has(subDBName)) {
    const pool = connectionCache.get(subDBName);
    if (pool.connected) return pool;
    // Stale/broken pool — drop it and reconnect below.
    connectionCache.delete(subDBName);
  }

  // A client can list several endpoints (e.g. local LAN server first, then a
  // public-IP fallback). Normalize to an array and try each IN ORDER, using the
  // first that connects.
  const endpoints = Array.isArray(rawConfig) ? rawConfig : [rawConfig];

  let lastError;
  for (let i = 0; i < endpoints.length; i++) {
    const config = endpoints[i];
    const isLast = i === endpoints.length - 1;

    const dbConfig = {
      ...config,
      options: { encrypt: false, trustServerCertificate: true },
      // Fail fast on earlier endpoints so we can move to the next one quickly;
      // give the last endpoint the full timeout since there's no fallback left.
      connectionTimeout: isLast ? 60000 : 8000,
      requestTimeout: 60000,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    };

    try {
      const pool = await new sql.ConnectionPool(dbConfig).connect();
      console.log(
        `✅ Connected to DB for ${subDBName} via ${config.server}:${config.port}` +
          (endpoints.length > 1 ? ` (endpoint ${i + 1}/${endpoints.length})` : ""),
      );
      connectionCache.set(subDBName, pool);
      return pool;
    } catch (err) {
      lastError = err;
      console.error(
        `❌ DB connect failed for ${subDBName} via ${config.server}:${config.port} — ${err.message}`,
      );
      // Try the next endpoint (if any).
    }
  }

  // Every endpoint failed.
  connectionCache.delete(subDBName);
  console.error(
    `❌ Database connection failed for ${subDBName} (all ${endpoints.length} endpoint(s))`,
  );
  console.error("Last error details:", lastError?.message);

  // Send custom readable error upward
  throw new Error(`Your server connection is lost. Please check and try again.`);
}
