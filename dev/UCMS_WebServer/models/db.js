const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // 2026-08-23: Interpret MySQL DATETIME values as Korean local wall-clock time before ISO serialization.
    timezone: process.env.DB_TIMEZONE || "+09:00",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// 2026-08-23: Keep MySQL NOW() and DATETIME decoding in the same Korean wall-clock timezone.
pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+09:00'");
});

module.exports = pool;
