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
const Pos = require("./models/Pos");
const {
  isImpersonationMutationBlocked,
} = require("./services/UserImpersonationService");
const defaultRouter = require("./routes/defaultRouter");
const apiRouter = require("./routes/apiRoutes/apiRouter");
const authRouter = require("./routes/authRouter");
const memberRouter = require("./routes/memberRouter");
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
// 2026-08-20: Recruitment images and the A4 POS PDF are uploaded as bounded base64 JSON payloads.
app.use(bodyParser.json({ limit: "15mb" }));

/* 2. 세션 설정 */
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    name:
      process.env.NODE_ENV === "dev" ? "UCMS_SESSION_DEV" : "UCMS_SESSION_PROD",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    // 2026-08-19: Apply security attributes at the actual cookie level and honor HTTPS forwarded by the trusted proxy.
    cookie: {
      maxAge: 1000 * 60 * 60 * 2,
      httpOnly: true,
      secure: "auto",
      sameSite: "lax",
    },
  }),
);

// 2026-08-19: Reject cross-origin browser mutations while keeping same-origin EJS forms and React fetch calls compatible.
app.use(requireSameOriginMutation);

// 3. 로그 찍기 - 모든 요청 로깅 (세션 설정 후)
app.use(logger);

// 2026-08-19: Container and reverse-proxy health checks include a lightweight database round trip.
app.get("/health", async (req, res) => {
  try {
    await db.execute("SELECT 1");
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(503).json({ status: "unavailable" });
  }
});

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
// 2026-08-19: The unauthenticated legacy bot integration is retired; a future Kakao Business chatbot API will replace it.
app.use("/recruit", recruitRouter);
app.use("/event", eventRouter);
app.use("/drive", driveRouter);
app.use("/finance", financeRouter);
app.use("/pos", posRouter);

app.use((err, req, res, next) => {
  // 2026-08-19: Preserve HTTP failures and return JSON for APIs instead of masking errors as successful HTML responses.
  const requestedStatus = Number(err.status ?? err.statusCode);
  const status =
    Number.isInteger(requestedStatus) &&
    requestedStatus >= 400 &&
    requestedStatus <= 599
      ? requestedStatus
      : 500;
  console.error("[" + new Date() + "]" + "\t" + "Error: " + err.stack);

  if (req.path.startsWith("/api")) {
    const code =
      typeof err.code === "string" && /^[A-Z0-9_]+$/.test(err.code)
        ? err.code
        : status === 401
          ? "UNAUTHORIZED"
          : status === 403
            ? "FORBIDDEN"
            : "INTERNAL_SERVER_ERROR";
    const message =
      status >= 500
        ? "Internal server error."
        : err.message || "Request failed.";
    return res.status(status).json({
      success: false,
      error: { code, message },
    });
  }

  const message =
    status === 401 || status === 403
      ? "잘못된 접근입니다."
      : status >= 500
        ? "서버 오류가 발생했습니다."
        : err.message || "요청을 처리하지 못했습니다.";
  const safeMessage = JSON.stringify(message).replace(/</g, "\\u003c");
  return res.status(status).type("html").send(`
    <script>
      alert(${safeMessage});
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

// 2026-08-20: Enforce POS automatic closing even when no client is currently polling the active sale.
const POS_CLOSE_INTERVAL_MS = 30 * 1000;
setInterval(() => {
  Pos.closeExpiredInstances().catch((error) =>
    console.error("POS automatic close failed:", error),
  );
}, POS_CLOSE_INTERVAL_MS).unref();

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
    // 2026-08-22: Registration, password validation, and email-code verification must be reachable before a session exists.
    const isPublicEmailAuthRequest =
      req.method === "POST" &&
      ["/api/auth/register/start", "/api/auth/login/start", "/api/auth/email/verify", "/api/auth/password/temporary"].includes(req.path);
    const isImpersonationExitApiRequest =
      req.method === "POST" && req.path === "/api/admin/impersonation/exit";
    // 2026-08-22: Application answers require a verified UCMS account identity instead of anonymous lookup.
    const isOwnRecruitResponseRequest =
      req.path === "/api/public/recruit-responses/search" ||
      req.path === "/public/recruit/response" ||
      req.path === "/public/recruit/response/search";
    // 2026-08-21: Dashboard promotion assets are public only when their route-level lifecycle query allows them.
    const isPublicPromotionAssetRequest =
      req.method === "GET" &&
      (/^\/api\/recruit\/instances\/\d+\/posters\/\d+$/.test(req.path) ||
        /^\/api\/pos\/instances\/\d+\/poster$/.test(req.path));
    const isPublicApiRequest =
      (req.path.startsWith("/api/public") && !isOwnRecruitResponseRequest) ||
      // 2026-07-16: React dashboard must render for anonymous visitors; other contract APIs still require session.
      req.path === "/api/dashboard" ||
      isPublicEmailAuthRequest ||
      isPublicPromotionAssetRequest ||
      isPublicNoticeRequest;

    const sessionInfo = await sessionStore.get(req.sessionID);
    // 2026-08-22: Human targets are read-only; identity and external-account mutations stay blocked for every impersonation.
    if (
      sessionInfo &&
      isImpersonationMutationBlocked(
        req.method,
        req.path,
        sessionInfo.impersonation,
      )
    ) {
      return res.status(403).json({
        success: false,
        error: {
          code: "IMPERSONATION_READ_ONLY",
          message: "This action is not allowed while impersonating another account.",
        },
      });
    }
    const minimumSessionAuthority =
      isImpersonationExitApiRequest && sessionInfo?.impersonation
        ? 0
        : isInquiryApiRequest ||
      isGeneralAccountApiRequest ||
      isOwnRecruitResponseRequest
        ? 1
        : 3;
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

      if (isOwnRecruitResponseRequest) {
        return res.redirect("/auth/authorize");
      }

      if (
        req.path === "/" ||
        req.path.startsWith("/images") ||
        req.path.startsWith("/styles") ||
        req.path.startsWith("/js") ||
        req.path.startsWith("/auth") ||
        (req.path.startsWith("/public") && !isOwnRecruitResponseRequest)
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

function requireSameOriginMutation(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origin = req.get("origin");
  const expectedOrigin = `${req.protocol}://${req.get("host")}`;
  const fetchSite = req.get("sec-fetch-site");
  const isAllowed = origin
    ? origin === expectedOrigin
    : !fetchSite || fetchSite === "same-origin";
  if (isAllowed) return next();

  if (req.path.startsWith("/api")) {
    return res.status(403).json({
      success: false,
      error: { code: "CSRF_REJECTED", message: "Cross-origin request rejected." },
    });
  }
  return res.status(403).send("Cross-origin request rejected.");
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
