// src/config/dbConfigMap.js

export const clientDBConfig = {
  "LP3VBXBR-3000": {
    // user: "sa",
    // password: "@dmin1305",
    // server: "202.21.46.227",
    // port: 16000,
    // database: "SwasERP_KPF_Check",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.208.228.199",
    // port: 16000,
    // database: "SwasERP_SKT_Test",

    user: "sa",
    password: "@dmin1305",
    server: "103.57.150.170",
    port: 16000,
    database: "SwasERP_Krishna",
  },
  192: {
    // user: "sa",
    // password: "@dmin1305",
    // server: "202.21.46.227",
    // port: 16000,
    // database: "SwasERP_KPF",
    // server: "SWAS-ANBUKATHIR\\SKYRP2008",
    // port: 1433,
    // database: "SwasERP_KPF",

    // user: "sa",
    // password: "@dmin1305",
    // server: "117.200.77.84",
    // port: 16000,
    // database: "SwasERP_KAS",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.199.209.172",
    // port: 16000,
    // database: "SwasERP_SASI",

    user: "sa",
    password: "@dmin1305",
    server: "SWAS-ANBUKATHIR\\SKYRP2008",
    port: 1433,
    database: "SwasERP_SKT",
  },

  LOCALHOST: {
    //******************** Local DB **********************/

    // user: "sa",
    // password: "@dmin1305",
    // server: "SWAS-ANBUKATHIR\\SKYRP2008",
    // port: 1433,
    // database: "SwasERP_KPF",

    // user: "sa",
    // password: "@dmin1305",
    // server: "SWAS-ANBUKATHIR\\SKYRP2008",
    // port: 1433,
    // database: "SwasERP_SASI",

    // user: "sa",
    // password: "@dmin1305",
    // server: "SWAS-ANBUKATHIR\\SKYRP2008",
    // port: 1433,
    // database: "SwasERP_KAS",

    // user: "sa",
    // password: "@dmin1305",
    // server: "SWAS-ANBUKATHIR\\SKYRP2008",
    // port: 1433,
    // database: "SwasERP_SKT",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.208.228.199",
    // port: 16000,
    // database: "SwasERP_SKT_Test",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.199.209.172",
    // port: 16000,
    // database: "SwasERP_SASI_Test",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.57.150.170",
    // port: 16000,
    // database: "SwasERP_Krishna_Check",

    // user: "sa",
    // password: "@dmin1305",
    // server: "202.21.46.227",
    // port: 16000,
    // database: "SwasERP_KPF_Check",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.207.14.68",
    // port: 16000,
    // database: "SwasERP_Thenpandian_Test",

    //********************  Live DB **********************/

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.208.228.199",
    // port: 16000,
    // database: "SwasERP_SKT",

    // user: "sa",
    // password: "@dmin1305",
    // server: "192.168.1.3",
    // port: 16000,
    // database: "SwasERP_SKT",

    // user: "sa",
    // password: "@dmin1305",
    // server: "MILLSERVER\\SQL2008",
    // port: 16000,
    // database: "SwasERP_SKT",

    // user: "sa",
    // password: "@dmin1305",
    // server: "MILLSERVER/SQL2008",
    // port: 16000,
    // database: "SwasERP_SKT",

    // user: "sa",
    // password: "@dmin1305",
    // server: "202.21.46.227",
    // port: 16000,
    // database: "SwasERP_KPF",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.208.228.199",
    // port: 16000,
    // database: "SwasERP_SKT_Test",

    // LOCALHOST mirrors the TPN2 (Thenpandian) client for local dev so the
    // role-based split can be tested on localhost: login + super-admins use the
    // external server (61.2.74.74); regular users are routed to the internal
    // LAN server (TPN2_LAN) by authMiddleware. See LAN_ROUTED_CLIENTS below.
    user: "sa",
    password: "@dmin1305",
    server: "61.2.74.74",
    port: 16000,
    database: "SwasERP_ThenpandianU2",
    // server: "TPSMSERVER\\SQL2008",

    // user: "sa",
    // password: "@dmin1305",
    // server: "117.200.77.84",
    // port: 16000,
    // database: "SwasERP_KAS_Check",

    // user: "sa",
    // password: "@dmin1305",
    // server: "117.200.77.84",
    // port: 16000,
    // database: "SwasERP_KAS",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.207.14.68",
    // port: 16000,
    // database: "SwasERP_Thenpandian",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.199.209.172",
    // port: 16000,
    // database: "SwasERP_SASI",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.104.58.162",
    // port: 16000,
    // database: "SwasERP_Vindhya",

    // user: "sa",
    // password: "@dmin1305",
    // server: "103.57.150.170",
    // port: 16000,
    // database: "SwasERP_Krishna",
  },
  DEV: {
    user: "sa",
    password: "@dmin1305",
    server: "103.208.228.199",
    port: 16000,
    database: "SwasERP_SKT_Test",
  },
  KPF: {
    user: "sa",
    password: "@dmin1305",
    server: "202.21.46.227",
    port: 16000,
    database: "SwasERP_KPF",
  },
  KAS: {
    user: "sa",
    password: "@dmin1305",
    server: "117.200.77.84",
    port: 16000,
    // database: "SwasERP_KAS_Check",
    database: "SwasERP_KAS",
  },

  SASM: {
    user: "sa",
    password: "@dmin1305",
    server: "103.199.209.172",
    port: 16000,
    database: "SwasERP_SASI",
  },

  KPT: {
    user: "sa",
    password: "@dmin1305",
    server: "103.57.150.170",
    port: 16000,
    database: "SwasERP_Krishna",
  },

  GOMATHIAMMAN: {
    user: "sa",
    password: "@dmin1305",
    server: "103.136.137.28",
    port: 16000,
    database: "SwasERP_GomathiAmman",
  },

  VINDHYA: {
    user: "sa",
    password: "@dmin1305",
    server: "103.104.58.162",
    port: 16000,
    database: "SwasERP_Vindhya",
  },

  TPN: {
    user: "sa",
    password: "@dmin1305",
    server: "103.207.14.68",
    port: 16000,
    database: "SwasERP_Thenpandian",
  },
  // TPN2 — admins (IsSuperAdmin) connect to the external/public server so they
  // can work from anywhere. Regular users are routed to TPN2_LAN (the internal
  // LAN server) by the auth middleware, so they can only use the app on campus.
  TPN2: {
    user: "sa",
    password: "@dmin1305",
    server: "61.2.74.74",
    port: 16000,
    database: "SwasERP_ThenpandianU2",
  },

  // TPN2_LAN — internal LAN server for regular (non-admin) TPN2 users only.
  // Not a real client key: it is selected automatically for non-super-admins.
  // Off campus this server is unreachable, which is intentional.
  TPN2_LAN: {
    user: "sa",
    password: "@dmin1305",
    server: "TPSMSERVER\\SQL2008",
    port: 16000,
    database: "SwasERP_ThenpandianU2",
  },

  SKT: {
    user: "sa",
    password: "@dmin1305",
    server: "103.208.228.199",
    port: 16000,
    database: "SwasERP_SKT",
  },

  // ──────────────────────────────────────────────────────────────────────
  //  AI_CHAT — central metadata DB for all tbl_chat_* tables
  //  (schema/columns/relationships/rules/examples/intent-patterns/history).
  //  ERP business data still lives in each client DB above; only AI-chat
  //  metadata + history is centralised here.
  // ──────────────────────────────────────────────────────────────────────
  AI_CHAT: {
    user: "sa",
    password: "Swas@1182",
    server: "103.131.196.130",
    port: 1433,
    database: "Swas",
  },
};

// ──────────────────────────────────────────────────────────────────────
//  Role-based DB routing.
//  Every user in a client listed here authenticates at LOGIN against that
//  client's own (external) server above, so anyone can log in from anywhere.
//  AFTER login, authMiddleware routes REGULAR (non-super-admin) users to the
//  mapped LAN key, so they can only use the app on the office network.
//  Super-admins stay on the external server. See authMiddleware.js + dynamicDB.js.
//    key   = client subdbname (external server — login + super-admins)
//    value = LAN config key   (internal server — that client's regular users)
//  LOCALHOST mirrors TPN2 so the split can be exercised in local dev.
// ──────────────────────────────────────────────────────────────────────
export const LAN_ROUTED_CLIENTS = {
  TPN2: "TPN2_LAN",
  LOCALHOST: "TPN2_LAN",
};

// LAN keys are internal-only servers selected automatically for non-super-admins.
// Off campus they're unreachable (intentional); getPool() turns the resulting
// connection failure into a friendly "use on campus" message for these keys.
export const LAN_CONFIG_KEYS = new Set(Object.values(LAN_ROUTED_CLIENTS));
