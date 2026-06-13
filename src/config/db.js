// import sql from "mssql";

// const config = {
//   user: "sa",
//   password: "@dmin1305",
//   server: "202.21.46.227",
//   port: 16000,
//   database: "SwasERP_KPF",
//   options: {
//     encrypt: false,
//     trustServerCertificate: true,
//   },
//   connectionTimeout: 60000, // ⬅️ Increase connection timeout (default: 15s)
//   requestTimeout: 60000,    // ⬅️ Query execution timeout
//   pool: {
//     max: 10,
//     min: 0,
//     idleTimeoutMillis: 30000,
//   },
// };

// const poolPromise = new sql.ConnectionPool(config)
//   .connect()
//   .then((pool) => {
//     console.log("✅ Connected to MSSQL");
//     return pool;
//   })
//   .catch((err) => {
//     console.error("❌ Database Connection Failed:", err);
//     process.exit(1);
//   });

// export { sql, poolPromise };
