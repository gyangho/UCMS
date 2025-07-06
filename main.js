require("dotenv-expand").expand(require("dotenv").config());

const express = require("express");
const session = require("express-session");
const mySQLSessionStore = require("express-mysql-session")(session);

const db = require("./db");
const defaultRouter = require("./routes/router");
const apiRouter = require("./routes/api");
const authRouter = require("./routes/auth");

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

function requireValidSession(req, res, next) {
  if (!req.sessionID) {
    if (req.path === "/") {
      return next(); // 로그인 전 메인 페이지 접근 허용
    }
    return res.redirect("/");
  }

  sessionStore.get(req.sessionID, (err, session, next) => {
    if (!session) {
      if (req.path === "/") {
        return next();
      }
      return res.redirect("/");
    } else if (err) {
      newErr = new Error("세션이 만료되었거나 찾을 수 없습니다.");
      newErr.code = "CannotFindSessionID";
    }
    if (req.path === "/") {
      return res.redirect("/dashboard");
    }
    return next();
  });
}

app.use(
  session({
    secret: "secert",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { maxAge: 1000 * 60 * 60 },
  })
);

app.use("/", defaultRouter);
app.use("/api", apiRouter);
app.use("/auth", authRouter);

app.use(requireValidSession);

app.use((err, req, res, next) => {
  console.error("[" + new Date() + "]" + "\t" + "Error: " + err.code);
  res.send(`
    <script>
      alert("${err.message}");
      window.location.href = "/"; 
    </script>
  `);
});

app.listen(PORT, () => {
  console.log(`Server is running on \"${DOMAIN}\"`);
});
