import sql from "mssql";
import { clientDBConfig, LAN_CONFIG_KEYS } from "./dbConfigMap.js";

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

  try {
    const config = clientDBConfig[subDBName];
    console.log(config, "4545");

    if (!config) {
      throw new Error(`❌ No DB config found for ${subDBName}`);
    }

    // If cached and still connected → reuse
    if (connectionCache.has(subDBName)) {
      const pool = connectionCache.get(subDBName);
      if (pool.connected) return pool;
    }

    const dbConfig = {
      ...config,
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 60000,
      requestTimeout: 60000,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    };

    const pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log(`✅ Connected to DB for ${subDBName}`);

    connectionCache.set(subDBName, pool);
    return pool;

  } catch (err) {
    console.error(`❌ Database connection failed for ${subDBName}`);
    console.error("Error details:", err.message);

    // Clean cache if partial connection stored
    if (connectionCache.has(subDBName)) {
      connectionCache.delete(subDBName);
    }

    // LAN keys (e.g. TPN2_LAN) are internal servers used by regular (non-admin)
    // users. If unreachable they are off the office network, so give a friendly
    // message instead of the generic connection error.
    if (LAN_CONFIG_KEYS.has(subDBName)) {
      throw new Error(
        "You can use this application only on our campus (office) network. Please connect to the office network and try again.",
      );
    }

    // Send custom readable error upward
    throw new Error(`Your server connection is lost. Please check and try again.`);
  }
}
