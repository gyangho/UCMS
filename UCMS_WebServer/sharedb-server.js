const WebSocket = require("ws");
require("dotenv-expand").expand(require("dotenv").config({ path: "../keys/.env" }));
const db = require("./db");

// WebSocket 서버 생성 (로컬에서만 접속 허용)
const wss = new WebSocket.Server({
  port: 8080,
  host: "127.0.0.1", // nginx를 통해서만 접속 허용
});

console.log("MySQL 기반 WebSocket 서버가 포트 8080에서 실행 중입니다.");

// WebSocket 연결 처리
wss.on("connection", function (ws, req) {
  console.log("클라이언트 연결됨:", req.socket.remoteAddress);

  ws.on("message", async function (message) {
    try {
      const data = JSON.parse(message);

      if (data.type === "get") {
        // MySQL에서 문서 가져오기
        const connection = await db.getConnection();
        try {
          const [rows] = await connection.execute(
            "SELECT content FROM evaluation_notes WHERE response_id = ?",
            [data.docId]
          );

          const content = rows.length > 0 ? rows[0].content : "";
          ws.send(
            JSON.stringify({
              type: "doc",
              docId: data.docId,
              content: content,
            })
          );
        } finally {
          connection.release();
        }
      } else if (data.type === "update") {
        // MySQL에 문서 저장/업데이트
        const connection = await db.getConnection();
        try {
          await connection.execute(
            "INSERT INTO evaluation_notes (response_id, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)",
            [data.docId, data.content]
          );

          // 다른 클라이언트들에게 브로드캐스트
          wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "update",
                  docId: data.docId,
                  content: data.content,
                })
              );
            }
          });
        } finally {
          connection.release();
        }
      }
    } catch (error) {
      console.error("메시지 처리 오류:", error);
    }
  });

  ws.on("close", function () {
    console.log("클라이언트 연결 해제");
  });

  ws.on("error", function (error) {
    console.error("WebSocket 오류:", error);
  });
});

// 에러 처리
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
