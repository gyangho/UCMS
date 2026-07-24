// yhyhyhyjujujuyhtb
// ujujikik7uu
// 2025.07.08 장지수

const express = require("express");
const session = require("express-session");
const mySQLSessionStore = require("express-mysql-session")(session);
const bodyParser = require("body-parser");
const path = require("path");
const { ensureOAuthTokens } = require("./extern_apis/googleapis");

const db = require("./models/db"); // MVC 구조에 맞게 모델 디렉토리 사용
const defaultRouter = require("./routes/defaultRouter");
const apiRouter = require("./routes/apiRoutes/apiRouter");
const authRouter = require("./routes/authRouter");
const memberRouter = require("./routes/memberRouter");
const botRouter = require("./routes/botRouter");
const recruitRouter = require("./routes/recruitRouter");
const eventRouter = require("./routes/eventRouter");
const driveRouter = require("./routes/driveRouter");
const publicRouter = require("./routes/publicRouter");
const financeRouter = require("./routes/financeRouter");
const posRouter = require("./routes/posRouter");

const app = express();

// 2026-07-22: Nginx가 전달하는 HTTPS 프로토콜을 req.protocol에 반영합니다.
app.set("trust proxy", 1);

const DOMAIN = process.env.DOMAIN;
// 2026-07-24: Docker deployments use the shared infra port file while local legacy env files remain compatible.
const PORT = Number(process.env.WEB_PORT ?? 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("WEB_PORT or PORT must be an integer between 1 and 65535.");
}
const sessionStore = new mySQLSessionStore(
  {
    clearExpired: true,
    checkExpirationInterval: 600000, // 10분마다 정리
    expiration: 86400000, // 세션 만료는 24시간
  },
  db,
);

// MySQL 연결 테스트
async function testDatabaseConnection() {
  try {
    const connection = await db.getConnection();
    console.log("✅ MySQL 데이터베이스 연결 성공");
    connection.release();
  } catch (error) {
    console.error("❌ MySQL 데이터베이스 연결 실패:", error.message);

    // 에러 메시지에 'database'가 포함되어 있다면 대소문자 확인 알림 출력
    if (error.message.includes("database")) {
      console.log("💡 [체크] DB 이름을 확인하세요");
    }

    console.log("🔄 5초 후 재시도합니다...");
    // 직접 호출하지 말고, 5초 뒤에 한 번만 실행되도록 설정
    setTimeout(testDatabaseConnection, 5000);
  }
}

// 서버 시작 시 DB 연결 테스트
testDatabaseConnection();

// 0. 개발자도구 무시
app.use(ignoreChromeDevTools);

/* 1. body-parser (json, form 데이터 파싱) */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

/* 2. 세션 설정 */
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    name:
      process.env.NODE_ENV === "dev" ? "UCMS_SESSION_DEV" : "UCMS_SESSION_PROD",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2,
      cookie: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      },
    },
  }),
);

// 3. 로그 찍기 - 모든 요청 로깅 (세션 설정 후)
app.use(logger);

/* 4. 세션 유효성 검사 미들웨어 (로그인된 사용자만 접근 가능하도록) */
app.use(requireValidSession);

/* 5. 정적 파일 제공 (HTML, CSS, JS, 이미지 등) */
app.use(express.static(path.join(__dirname, "public")));

/* 6. EJS 템플릿 설정 */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public/views"));

/* 7. 라우터 등록 */
app.use("/", defaultRouter);
app.use("/public", publicRouter);
app.use("/api", apiRouter);
app.use("/auth", authRouter);
app.use("/member", memberRouter);
app.use("/bot", botRouter);
app.use("/recruit", recruitRouter);
app.use("/event", eventRouter);
app.use("/drive", driveRouter);
app.use("/finance", financeRouter);
app.use("/pos", posRouter);

app.use((err, req, res, next) => {
  if (err.status === 401 || err.code) {
    console.error("[" + new Date() + "]" + "\t" + "Error: " + err.stack);
    return res.send(`
      <script>
        alert("잘못된 접근입니다.");
        window.location.href = "/"; 
      </script>
    `);
  }

  console.error("[" + new Date() + "]" + "\t" + "Error: " + err.code);
  console.error(err.stack);
  return res.send(`
    <script>
      alert("${err.message}");
      window.location.href = "/"; 
    </script>
  `);
});

app.listen(PORT, () => {
  console.log(`Server is running on \"${DOMAIN}:${PORT}\"`);
  (async () => {
    await ensureOAuthTokens(); // 없으면 콘솔에 URL 출력
  })();
});

async function requireValidSession(req, res, next) {
  try {
    const isApiRequest = req.path.startsWith("/api");
    // 2026-07-23: Public notice reads use per-post visibility, while inquiry APIs admit general-or-higher sessions.
    const isPublicNoticeRequest =
      req.method === "GET" &&
      /^\/api\/boards\/notices(?:\/\d+)?$/.test(req.path);
    const isInquiryApiRequest = req.path.startsWith("/api/boards/inquiries");
    const isGeneralAccountApiRequest =
      req.path === "/api/user/me" || req.path === "/api/auth/logout";
    const isPublicApiRequest =
      req.path.startsWith("/api/public") ||
      // 2026-07-16: React dashboard must render for anonymous visitors; other contract APIs still require session.
      req.path === "/api/dashboard" ||
      isPublicNoticeRequest ||
      req.path.startsWith("/api/auth/member-confirm");

    const sessionInfo = await sessionStore.get(req.sessionID);
    const minimumSessionAuthority =
      isInquiryApiRequest || isGeneralAccountApiRequest ? 1 : 3;
    if (
      !sessionInfo ||
      Number(sessionInfo.authority) < minimumSessionAuthority
    ) {
      if (isPublicApiRequest) {
        if (sessionInfo) {
          req.session.authority = sessionInfo.authority;
          req.session.userId = sessionInfo.userId;
        }
        return next();
      }

      if (isApiRequest) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Login required.",
          },
        });
      }

      if (
        req.path === "/" ||
        req.path.startsWith("/images") ||
        req.path.startsWith("/styles") ||
        req.path.startsWith("/js") ||
        req.path.startsWith("/auth") ||
        req.path.startsWith("/bot") ||
        req.path.startsWith("/public")
      ) {
        return next();
      }
      const newErr = new Error("권한이 없습니다.");
      newErr.code = "CannotFindSessionID";
      res.status(403);
      return res.send(`
        <script>
          alert("세션이 없거나 권한이 없습니다.");
          window.location.href = "/";
        </script>
      `);
    } else if (req.path === "/") {
      return res.redirect("/dashboard");
    } else {
      if (isApiRequest) {
        req.session.authority = sessionInfo.authority;
        req.session.userId = sessionInfo.userId;
        return next();
      }

      /* 권한 별 분기 적용 */
      if (
        req.path.startsWith("/member") ||
        req.path.startsWith("/recruit/responses") ||
        req.path.startsWith("/recruit/detail") ||
        req.path.startsWith("/drive") ||
        req.path.startsWith("/event/submit") ||
        req.path.startsWith("/event/edit") ||
        req.path.startsWith("/event/delete") ||
        req.path.startsWith("/event/holidays") ||
        req.path.startsWith("/pos/instances/new") ||
        /^\/pos\/instances\/\d+\/edit$/.test(req.path) ||
        req.method === "DELETE"
      ) {
        if (sessionInfo.authority < 4) {
          res.status(403);
          return res.send(`
        <script>
          alert("권한이 없습니다.");
          window.location.href = "/";
        </script>
      `);
        }
      }
      return next();
    }
  } catch (err) {
    throw err;
  }

  /* 세션 정보가 유효할 경우 */
}

function ignoreChromeDevTools(req, res, next) {
  if (req.path.startsWith("/.well-known")) {
    return res.end();
  }
  return next();
}

function logger(req, res, next) {
  const userId =
    req.session && req.session.userId ? req.session.userId : "anonymous";
  console.log(
    "[LOG]\t" +
      new Date().toISOString() +
      "  " +
      req.headers["x-forwarded-for"] +
      "  " +
      "  User: " +
      userId +
      "  " +
      req.method +
      " " +
      req.url,
  );
  return next();
}
