const WebSocket = require("ws");
const mysql = require("mysql2/promise");
require("dotenv-expand").expand(
  require("dotenv").config({ path: "../keys/.env" })
);

// MySQL 연결 설정
const db = mysql.createPool({
  host: "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "UCMS",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// WebSocket 서버 생성
const wss = new WebSocket.Server({ port: 8080 });

// 클라이언트 세션 관리
const clientSessions = new Map();

// 줄별 락 관리
const lineLocks = new Map(); // docId -> Map(lineNumber -> {clientId, lockedAt, expiresAt})

console.log(
  "🚀 공유문서 WebSocket 서버가 포트 8080에서 실행 중입니다."
);

// MySQL 연결 테스트
async function testDatabaseConnection() {
  try {
    const connection = await db.getConnection();
    console.log("✅ MySQL 데이터베이스 연결 성공");
    connection.release();
  } catch (error) {
    console.error("❌ MySQL 데이터베이스 연결 실패:", error.message);
    console.log("💡 해결 방법:");
    console.log("   1. MySQL 서버가 실행 중인지 확인");
    console.log("   2. 사용자명/비밀번호가 올바른지 확인");
    console.log("   3. UCMS 데이터베이스가 존재하는지 확인");
  }
}

// 서버 시작 시 DB 연결 테스트
testDatabaseConnection();

// 줄별 락 관리 함수들
async function handleLockLine(clientId, message) {
  const { docId, formId, lineNumber } = message;

  try {
    console.log(
      `🔒 줄 락 요청: ${docId} 줄 ${lineNumber} by ${clientId}`
    );

    // 문서별 락 맵 초기화
    if (!lineLocks.has(docId)) {
      lineLocks.set(docId, new Map());
    }

    const docLocks = lineLocks.get(docId);
    const existingLock = docLocks.get(lineNumber);

    // 이미 락이 있는지 확인
    if (existingLock) {
      // 만료된 락인지 확인
      if (existingLock.expiresAt < Date.now()) {
        console.log(`⏰ 만료된 락 제거: 줄 ${lineNumber}`);
        docLocks.delete(lineNumber);
      } else if (existingLock.clientId !== clientId) {
        // 다른 클라이언트가 락을 가지고 있음
        const response = {
          type: "lock-failed",
          docId: docId,
          lineNumber: lineNumber,
          message: `줄 ${lineNumber}은 다른 사용자가 편집 중입니다.`,
          lockedBy: existingLock.clientId,
          timestamp: Date.now(),
        };

        const session = clientSessions.get(clientId);
        if (session && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify(response));
        }
        return;
      }
    }

    // 락 설정 (5분 만료)
    const lockInfo = {
      clientId: clientId,
      lockedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5분
    };

    docLocks.set(lineNumber, lockInfo);

    // 성공 응답
    const response = {
      type: "lock-success",
      docId: docId,
      lineNumber: lineNumber,
      message: `줄 ${lineNumber} 편집 권한을 획득했습니다.`,
      timestamp: Date.now(),
    };

    const session = clientSessions.get(clientId);
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(response));
    }

    // 다른 클라이언트들에게 락 상태 브로드캐스트
    broadcastLockStatus(
      docId,
      formId,
      lineNumber,
      clientId,
      "locked"
    );

    console.log(
      `✅ 줄 락 성공: ${docId} 줄 ${lineNumber} by ${clientId}`
    );
  } catch (error) {
    console.error("❌ 줄 락 오류:", error);
  }
}

async function handleUnlockLine(clientId, message) {
  const { docId, formId, lineNumber } = message;

  try {
    console.log(
      `🔓 줄 락 해제 요청: ${docId} 줄 ${lineNumber} by ${clientId}`
    );

    const docLocks = lineLocks.get(docId);
    if (!docLocks) return;

    const existingLock = docLocks.get(lineNumber);
    if (existingLock && existingLock.clientId === clientId) {
      docLocks.delete(lineNumber);

      // 성공 응답
      const response = {
        type: "unlock-success",
        docId: docId,
        lineNumber: lineNumber,
        message: `줄 ${lineNumber} 편집 권한을 해제했습니다.`,
        timestamp: Date.now(),
      };

      const session = clientSessions.get(clientId);
      if (session && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(response));
      }

      // 다른 클라이언트들에게 락 상태 브로드캐스트
      broadcastLockStatus(
        docId,
        formId,
        lineNumber,
        null,
        "unlocked"
      );

      console.log(
        `✅ 줄 락 해제 성공: ${docId} 줄 ${lineNumber} by ${clientId}`
      );
    }
  } catch (error) {
    console.error("❌ 줄 락 해제 오류:", error);
  }
}

async function handleUpdateLine(clientId, message) {
  const { docId, formId, lineNumber, content, version } = message;

  try {
    console.log(
      `📝 줄 업데이트: ${docId} 줄 ${lineNumber} by ${clientId}`
    );

    // 락 확인
    const docLocks = lineLocks.get(docId);
    if (docLocks) {
      const existingLock = docLocks.get(lineNumber);
      if (existingLock && existingLock.clientId !== clientId) {
        // 락이 있고 다른 클라이언트가 소유
        const response = {
          type: "update-failed",
          docId: docId,
          lineNumber: lineNumber,
          message: `줄 ${lineNumber}은 다른 사용자가 편집 중입니다.`,
          timestamp: Date.now(),
        };

        const session = clientSessions.get(clientId);
        if (session && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify(response));
        }
        return;
      }
    }

    // 현재 문서 내용 가져오기
    const [rows] = await db.execute(
      "SELECT content, version FROM evaluation_notes WHERE response_id = ? AND form_id = ?",
      [docId, formId]
    );

    if (rows.length === 0) {
      console.log(`❌ 문서를 찾을 수 없음: ${docId}`);
      return;
    }

    const currentContent = rows[0].content || "";
    const currentVersion = rows[0].version || 1;

    // 버전 충돌 체크
    if (version <= currentVersion) {
      console.log(
        `⚠️ 버전 충돌: 요청 ${version} <= 현재 ${currentVersion}`
      );
      return;
    }

    // 줄별로 내용 업데이트
    const lines = currentContent.split("\n");

    if (lineNumber >= 0 && lineNumber < lines.length) {
      lines[lineNumber] = content;
    } else if (lineNumber === lines.length) {
      // 새 줄 추가
      lines.push(content);
    } else {
      console.log(`   - 잘못된 줄 번호: ${lineNumber}`);
      return;
    }

    const newContent = lines.join("\n");

    // DB 업데이트
    await db.execute(
      "UPDATE evaluation_notes SET content = ?, version = ?, updated_at = NOW() WHERE response_id = ? AND form_id = ?",
      [newContent, version, docId, formId]
    );

    console.log(`✅ 줄 업데이트 완료: ${docId} 줄 ${lineNumber}`);

    // 다른 클라이언트들에게 브로드캐스트
    const broadcastMessage = {
      type: "line-updated",
      docId: docId,
      lineNumber: lineNumber,
      content: content,
      version: version,
      timestamp: Date.now(),
      clientId: clientId,
    };

    let broadcastCount = 0;
    clientSessions.forEach((session, sessionClientId) => {
      if (
        sessionClientId !== clientId &&
        session.docId === docId &&
        session.formId === formId &&
        session.ws.readyState === WebSocket.OPEN
      ) {
        session.ws.send(JSON.stringify(broadcastMessage));
        broadcastCount++;
      }
    });

    if (broadcastCount > 0) {
      console.log(`📡 브로드캐스트: ${broadcastCount}개 클라이언트`);
    }
  } catch (error) {
    console.error("❌ 줄 업데이트 오류:", error);
  }
}

function broadcastLockStatus(
  docId,
  formId,
  lineNumber,
  clientId,
  status
) {
  const message = {
    type: "lock-status",
    docId: docId,
    lineNumber: lineNumber,
    status: status, // 'locked' or 'unlocked'
    clientId: clientId,
    timestamp: Date.now(),
  };

  let broadcastCount = 0;
  clientSessions.forEach((session, sessionClientId) => {
    if (
      session.docId === docId &&
      session.formId === formId &&
      session.ws.readyState === WebSocket.OPEN
    ) {
      session.ws.send(JSON.stringify(message));
      broadcastCount++;
    }
  });

  console.log(
    `📡 락 상태 브로드캐스트: ${broadcastCount}개 클라이언트`
  );
}

// 만료된 락 정리 (1분마다)
setInterval(() => {
  const now = Date.now();
  lineLocks.forEach((docLocks, docId) => {
    docLocks.forEach((lockInfo, lineNumber) => {
      if (lockInfo.expiresAt < now) {
        console.log(
          `⏰ 만료된 락 자동 해제: ${docId} 줄 ${lineNumber}`
        );
        docLocks.delete(lineNumber);
      }
    });
  });
}, 60000); // 1분마다

// WebSocket 연결 처리
wss.on("connection", function (ws, req) {
  const clientId = generateClientId();
  const clientIP = req.socket.remoteAddress;

  console.log(`✅ 클라이언트 연결됨: ${clientIP} ID: ${clientId}`);

  // 클라이언트 세션 저장
  clientSessions.set(clientId, {
    ws: ws,
    clientId: clientId,
    docId: null,
    formId: null,
    connectedAt: Date.now(),
  });

  // 메시지 처리
  ws.on("message", async function (data) {
    try {
      const message = JSON.parse(data);
      console.log(`📨 메시지 수신: ${message.type} from ${clientId}`);

      switch (message.type) {
        case "get":
          await handleGetDocument(clientId, message);
          break;
        case "update":
          await handleUpdateDocument(clientId, message);
          break;
        case "subscribe":
          await handleSubscribe(clientId, message);
          break;
        case "unsubscribe":
          await handleUnsubscribe(clientId, message);
          break;
        case "lock-line":
          await handleLockLine(clientId, message);
          break;
        case "unlock-line":
          await handleUnlockLine(clientId, message);
          break;
        case "update-line":
          await handleUpdateLine(clientId, message);
          break;
        default:
          console.log(`⚠️ 알 수 없는 메시지 타입: ${message.type}`);
      }
    } catch (error) {
      console.error("❌ 메시지 처리 오류:", error);
    }
  });

  // 연결 해제 처리
  ws.on("close", function () {
    console.log(`❌ 클라이언트 연결 해제: ${clientId}`);
    clientSessions.delete(clientId);
  });

  // 오류 처리
  ws.on("error", function (error) {
    console.error(`❌ WebSocket 오류 (${clientId}):`, error);
    clientSessions.delete(clientId);
  });
});

// 클라이언트 ID 생성
function generateClientId() {
  return Math.random().toString(36).substr(2, 9);
}

// 문서 가져오기
async function handleGetDocument(clientId, message) {
  const { docId, formId } = message;

  try {
    console.log(`📖 문서 요청: ${docId} (폼: ${formId})`);

    // DB에서 문서 내용 조회
    const [rows] = await db.execute(
      "SELECT content, version FROM evaluation_notes WHERE response_id = ? AND form_id = ?",
      [docId, formId]
    );

    let content = "";
    let version = 1;

    if (rows.length > 0) {
      content = rows[0].content || "";
      version = rows[0].version || 1;
    } else {
      // 문서가 없으면 새로 생성
      await db.execute(
        "INSERT INTO evaluation_notes (response_id, form_id, content, version) VALUES (?, ?, ?, ?)",
        [docId, formId, "", 1]
      );
    }

    // 클라이언트에게 문서 전송
    const response = {
      type: "doc",
      docId: docId,
      formId: formId,
      content: content,
      version: version,
      timestamp: Date.now(),
    };

    const session = clientSessions.get(clientId);
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(response));
      console.log(`📤 문서 전송 완료: ${docId} (버전: ${version})`);
    }
  } catch (error) {
    console.error("❌ 문서 가져오기 오류:", error);
  }
}

// 문서 업데이트
async function handleUpdateDocument(clientId, message) {
  const { docId, formId, content, version } = message;

  try {
    console.log(`📝 문서 업데이트: ${docId} (버전: ${version})`);

    // 현재 문서 버전 확인
    const [currentRows] = await db.execute(
      "SELECT version FROM evaluation_notes WHERE response_id = ? AND form_id = ?",
      [docId, formId]
    );

    let currentVersion = 1;
    if (currentRows.length > 0) {
      currentVersion = currentRows[0].version;
    }

    // 버전 충돌 체크
    if (version <= currentVersion) {
      console.log(
        `⚠️ 버전 충돌 감지: 요청 버전 ${version} <= 현재 버전 ${currentVersion}`
      );

      // 최신 문서 내용을 클라이언트에게 전송
      const [latestRows] = await db.execute(
        "SELECT content, version FROM evaluation_notes WHERE response_id = ? AND form_id = ?",
        [docId, formId]
      );

      if (latestRows.length > 0) {
        const conflictResponse = {
          type: "conflict",
          docId: docId,
          formId: formId,
          content: latestRows[0].content,
          version: latestRows[0].version,
          message:
            "다른 사용자가 먼저 수정했습니다. 최신 내용을 적용합니다.",
          timestamp: Date.now(),
        };

        const session = clientSessions.get(clientId);
        if (session && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify(conflictResponse));
        }
      }
      return;
    }

    // DB 업데이트
    await db.execute(
      "UPDATE evaluation_notes SET content = ?, version = ?, updated_at = NOW() WHERE response_id = ? AND form_id = ?",
      [content, version, docId, formId]
    );

    console.log(`✅ DB 업데이트 완료: ${docId} (버전: ${version})`);

    // 다른 클라이언트들에게 브로드캐스트
    const broadcastMessage = {
      type: "update",
      docId: docId,
      formId: formId,
      content: content,
      version: version,
      timestamp: Date.now(),
      clientId: clientId,
    };

    let broadcastCount = 0;
    clientSessions.forEach((session, sessionClientId) => {
      if (
        sessionClientId !== clientId &&
        session.docId === docId &&
        session.formId === formId &&
        session.ws.readyState === WebSocket.OPEN
      ) {
        session.ws.send(JSON.stringify(broadcastMessage));
        broadcastCount++;
      }
    });

    console.log(
      `📡 브로드캐스트 완료: ${broadcastCount}개 클라이언트에게 전송`
    );
  } catch (error) {
    console.error("❌ 문서 업데이트 오류:", error);
  }
}

// 문서 구독
async function handleSubscribe(clientId, message) {
  const { docId, formId } = message;

  const session = clientSessions.get(clientId);
  if (session) {
    session.docId = docId;
    session.formId = formId;
    console.log(`📌 클라이언트 ${clientId}가 문서 ${docId} 구독`);
  }
}

// 문서 구독 해제
async function handleUnsubscribe(clientId, message) {
  const session = clientSessions.get(clientId);
  if (session) {
    console.log(
      `📌 클라이언트 ${clientId}가 문서 ${session.docId} 구독 해제`
    );
    session.docId = null;
    session.formId = null;
  }
}

// 정기적인 연결 상태 확인
setInterval(() => {
  console.log(`📊 현재 연결된 클라이언트: ${clientSessions.size}개`);

  clientSessions.forEach((session, clientId) => {
    if (session.ws.readyState !== WebSocket.OPEN) {
      console.log(`🧹 비활성 클라이언트 정리: ${clientId}`);
      clientSessions.delete(clientId);
    }
  });
}, 60000 * 5); // 5분마다 확인

// 서버 종료 시 정리
process.on("SIGINT", () => {
  console.log("🛑 서버 종료 중...");

  clientSessions.forEach((session) => {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.close();
    }
  });

  wss.close(() => {
    console.log("✅ WebSocket 서버 종료 완료");
    process.exit(0);
  });
});

console.log("🎉 공유문서 서버가 성공적으로 시작되었습니다!");
