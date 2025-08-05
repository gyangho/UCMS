const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const KEY_DIR = path.join(__dirname, "../../keys");
const TOKEN_PATH = path.join(KEY_DIR, "token.json");
const CRED_PATH = path.join(KEY_DIR, "oauth_credentials.json"); // ➊ GCP OAuth-클라이언트 json (client_id, secret)

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/forms",
];

/* ───────── Service-Account 클라이언트 (기존 코드 유지) ───────── */
const saAuth = new google.auth.GoogleAuth({
  keyFile: path.join(KEY_DIR, "ucms-466410-b5ec552f2e06.json"),
  scopes: [
    "https://www.googleapis.com/auth/forms.body.readonly",
    "https://www.googleapis.com/auth/forms.responses.readonly",
  ],
});
const saDrive = google.drive({ version: "v3", auth: saAuth });
const saForms = google.forms({ version: "v1", auth: saAuth });

/* ───────── OAuth2 클라이언트 헬퍼 ───────── */
function buildOAuthClient() {
  const creds = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
  const { client_id, client_secret, redirect_uris } = creds.installed;
  return new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0] // ex) http://localhost/auth/oauth2callback
  );
}

/* 서버 부팅시 호출 – 토큰 확인 or 안내 */
async function ensureOAuthTokens() {
  if (fs.existsSync(TOKEN_PATH)) return true; // 이미 준비 완료

  const oauth2 = buildOAuthClient();
  const authUrl = oauth2.generateAuthUrl({
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  console.log("\n[Google OAuth] 최초 설정이 필요합니다.");
  console.log("다음 URL을 브라우저에 복사-붙여넣기 하여 로그인 해주세요.");
  console.log(authUrl, "\n");

  /* 서버는 콜백이 올 때까지 service 계정만으로 계속 실행 */
  return false;
}

/* 콜백에서 code 를 받아 토큰 저장 */
async function saveOAuthTokens(code) {
  const oauth2 = buildOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log("[Google OAuth] token.json 생성 완료");
}

/* 매 요청에 쓰는 OAuth-drive/ forms 클라이언트 */
function getOAuthClients() {
  const oauth2 = buildOAuthClient();
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  oauth2.setCredentials(tokens);
  return {
    drive: google.drive({ version: "v3", auth: oauth2 }),
    forms: google.forms({ version: "v1", auth: oauth2 }),
  };
}

/* 폼 URL에서 id 추출 */
function extractFormIdFromURL(url) {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

module.exports = {
  /* service-account */
  saDrive,
  saForms,

  /* oauth helpers */
  ensureOAuthTokens,
  saveOAuthTokens,
  getOAuthClients,
  extractFormIdFromURL,
};
