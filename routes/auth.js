const express = require("express");
const router = express.Router();
const qs = require("qs");
const axios = require("axios");
const db = require("../db");

const client_id = process.env.KAKAO_REST_KEY;
const client_secret = process.env.KAKAO_CLIENT_SECRET;
const domain = process.env.DOMAIN;
const redirect_uri = `${domain}/auth/redirect`;
const token_uri = "https://kauth.kakao.com/oauth/token"; // 액세스 토큰 요청을 보낼 카카오 인증 서버 주소
const api_host = "https://kapi.kakao.com"; // 카카오 API 호출 서버 주소

// API 요청 함수 정의
async function call(method, uri, param, header) {
  let rtn;
  try {
    // 지정된 method, uri, param, header 값을 사용해 카카오 API 서버로 HTTP 요청 전송
    rtn = await axios({
      method: method, // "POST" 또는 "GET" 등 HTTP 메서드
      url: uri, // 요청할 API 주소
      headers: header, // 요청 헤더 (예: Content-Type, Authorization 등)
      data: param, // 전송할 요청 데이터 (body)
    });
  } catch (err) {
    throw err;
  }
  // 요청 성공 또는 실패에 상관없이 응답 데이터 반환
  return rtn.data;
}

/*

  ==================== ROUTER AREA ====================

*/

//예시 사용자 로그인
router.get("/authorize", function (req, res) {
  // 선택: 사용자에게 추가 동의를 요청하는 경우, scope 값으로 동의항목 ID를 전달
  // 친구 목록, 메시지 전송 등 접근권한 요청 가능
  // (예: /authorize?scope=friends,talk_message)
  let { scope } = req.query;
  let scopeParam = "";
  if (scope) {
    scopeParam = "&scope=" + scope;
  }

  // 카카오 인증 서버로 리다이렉트
  // 사용자 동의 후 리다이렉트 URI로 인가 코드가 전달
  res
    .status(302)
    .redirect(
      `https://kauth.kakao.com/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code${scopeParam}`
    );
});

// 카카오 인증 서버에서 전달받은 인가 코드로 액세스 토큰 발급 요청
router.get("/redirect", async function (req, res, next) {
  try {
    // 인가 코드 발급 요청에 필요한 파라미터 구성
    const param = qs.stringify({
      grant_type: "authorization_code", // 인증 방식 고정값
      client_id: client_id, // 내 앱의 REST API 키
      redirect_uri: redirect_uri, // 등록된 리다이렉트 URI
      code: req.query.code, // 전달받은 인가 코드
      client_secret: client_secret, // 클라이언트 시크 사용 시 추가
    });

    // API 요청 헤더 설정
    const header = { "content-type": "application/x-www-form-urlencoded" };

    // 카카오 인증 서버에 액세스 토큰 요청
    const rtn = await call("POST", token_uri, param, header);

    // 세션 고정 방어: 로그인 직후 세션 ID 교체
    req.session.regenerate((err) => {
      if (err) throw err;
      // 발급받은 액세스 토큰을 세션에 저장 (로그인 상태 유지 목적)
      req.session.key = rtn.access_token;
      // 로그인 완료 후 사용자 정보 받아오기
      res.status(302).redirect(`${domain}/auth/profile`);
    });
  } catch (err) {
    next(err);
  }
});

router.get("/profile", async function (req, res, next) {
  const uri = api_host + "/v2/user/me"; // 사용자 정보 가져오기 API 주소
  const param = {}; // 사용자 정보 요청 시 파라미터는 필요 없음
  const header = {
    "content-type": "application/x-www-form-urlencoded", // 요청 헤더 Content-Type 지정
    Authorization: "Bearer " + req.session.key, // 세션에 저장된 액세스 토큰 전달
  };

  try {
    const rtn = await call("POST", uri, param, header); // 카카오 API에 요청 전송

    req.session.kakao_id = rtn.id;
    req.session.save();

    const user = {
      kakao_id: rtn.id,
      thumbnail_image: rtn.kakao_account.profile.thumbnail_image_url,
      profile_image: rtn.kakao_account.profile.profile_image_url,
      name: rtn.kakao_account.name,
      email: rtn.kakao_account.email,
      phone: rtn.kakao_account.phone_number.replace("+82", "0").replace(/\s/g, ""),
      gender: rtn.kakao_account.gender === "male" ? "남자" : "여자",
    };

    const query = `
    INSERT INTO Users(
    ${Object.keys(user).join(", ")})
    VALUES (${Object.values(user)
      .map(() => "?")
      .join(", ")})
    ON DUPLICATE KEY UPDATE
    profile_image   = VALUES(profile_image),
    thumbnail_image = VALUES(thumbnail_image),
    name            = VALUES(name),
    email           = VALUES(email),
    phone           = VALUES(phone),
    gender          = VALUES(gender),
    updated_at = CURRENT_TIMESTAMP;
  `;
    const values = Object.values(user);

    await db.query(query, values);

    const [row] = await db.query(
      `SELECT authority + 0 AS authority FROM Members WHERE name =? AND phone = ?`,
      [user.name, user.phone]
    );
    if (row.length === 0) {
      req.session.authority = 0;
    } else {
      req.session.authority = row[0].authority;
    }
    req.session.save();
  } catch (err) {
    return next(err);
  }
  res.redirect("/dashboard"); // 조회한 사용자 정보를 클라이언트에 반환
});

// 로그아웃 요청: 세션을 종료하고 사용자 로그아웃 처리
router.get("/logout", async function (req, res, next) {
  try {
    const uri = api_host + "/v1/user/logout"; // 로그아웃 API 주소
    const header = {
      Authorization: "Bearer " + req.session.key, // 세션에 저장된 액세스 토큰 전달
    };
    const rtn = await call("POST", uri, null, header); // 카카오 API에 로그아웃 요청 전송
    req.session.destroy(); // 세션 삭제 (로그아웃 처리)
    res.redirect("/");
  } catch (err) {
    if (err.response.status == 401) {
      const newErr = new Error("인증정보 없는 로그아웃");
      newErr.code = "NoAuthInfoLogout";
      return next(newErr);
    }
    next(err);
  }
});

// 연결 끊기 요청: 사용자와 앱의 연결을 해제하고 세션 종료
router.get("/unlink", async function (req, res) {
  const uri = api_host + "/v1/user/unlink"; // 연결 끊기 API 주소
  const header = {
    Authorization: "Bearer " + req.session.key, // 세션에 저장된 액세스 토큰 전달
  };

  const rtn = await call("POST", uri, null, header); // 카카오 API에 연결 끊기 요청 전송
  req.session.destroy(); // 세션 삭제 (연결 해제 처리)
  res.send(rtn); // 응답 결과 클라이언트에 반환
});

module.exports = router;
