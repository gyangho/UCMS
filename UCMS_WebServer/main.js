// yhyhyhyjujujuyhtb
// ujujikik7uu
// 2025.07.08 장지수

require("dotenv-expand").expand(
  require("dotenv").config({ path: "../keys/.env" })
);

const express = require("express");
const session = require("express-session");
const mySQLSessionStore = require("express-mysql-session")(session);
const bodyParser = require("body-parser");
const path = require("path");
const { ensureOAuthTokens } = require("./extern_apis/googleapis");

const db = require("./models"); // MVC 구조에 맞게 모델 디렉토리 사용
const defaultRouter = require("./routes/router");
const apiRouter = require("./routes/api");
const authRouter = require("./routes/auth");
const memberRouter = require("./routes/member");
const botRouter = require("./routes/bot");
const recruitRouter = require("./routes/recruit");
const eventRouter = require("./routes/event");
const driveRouter = require("./routes/drive");

const app = express();
const DOMAIN = process.env.DOMAIN;
const PORT = process.env.PORT;
const sessionStore = new mySQLSessionStore(
  {
    clearExpired: true,
    checkExpirationInterval: 600000, // 10분마다 정리
    expiration: 86400000, // 세션 만료는 24시간
  },
  db
);

// 0. 개발자도구 무시
app.use(ignoreChromeDevTools);

// 1. 로그 찍기 - 모든 요청 로깅
app.use(logger);

/* 2. body-parser (json, form 데이터 파싱) */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

/* 3. 세션 설정 */
app.use(
  session({
    secret: "secert",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { maxAge: 1000 * 60 * 60 * 2 },
  })
);

/* 4. 세션 유효성 검사 미들웨어 (로그인된 사용자만 접근 가능하도록) */
app.use(requireValidSession);

/* 5. 정적 파일 제공 (HTML, CSS, JS, 이미지 등) */
app.use(express.static(path.join(__dirname, "public")));

/* 6. EJS 템플릿 설정 */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public/views"));

/* 7. 라우터 등록 */
app.use("/", defaultRouter);
app.use("/api", apiRouter);
app.use("/auth", authRouter);
app.use("/member", memberRouter);
app.use("/bot", botRouter);
app.use("/recruit", recruitRouter);
app.use("/event", eventRouter);
app.use("/drive", driveRouter);

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
    //세션 정보 검색
    const sessionInfo = await sessionStore.get(req.sessionID);
    if (!sessionInfo || sessionInfo.authority < 3) {
      if (
        req.path === "/" ||
        req.path.startsWith("/auth") ||
        req.path.startsWith("/bot")
      ) {
        return next();
      }
      const newErr = new Error("권한이 없습니다.");
      newErr.code = "CannotFindSessionID";
      throw newErr;
    } else if (req.path === "/") {
      return res.redirect("/dashboard");
    } else {
      /* 권한 별 분기 적용 */
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
  console.log(
    "[LOG]\t" +
      new Date().toISOString() +
      "  " +
      req.ip +
      " " +
      req.method +
      " " +
      req.url
  );
  return next();
}
