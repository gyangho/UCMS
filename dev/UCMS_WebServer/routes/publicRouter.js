const express = require("express");

const router = express.Router();

router.get("/", (_req, res) => res.redirect(308, "/"));

// 2026-08-22: Legacy public pages redirect to the lifecycle-bounded React flows.
router.get("/recruit_result", (_req, res) =>
  res.redirect(308, "/public/recruit-result"),
);
router.get("/recruit/response", (_req, res) =>
  res.redirect(308, "/public/recruit-response"),
);

// 2026-08-22: Legacy clients cannot submit lookup identities; the contract API uses verified account fields.
router.post("/recruit/response/search", (_req, res) =>
  res.status(410).json({
    success: false,
    error: "내 지원서 보기 화면을 새로 열어주세요.",
  }),
);
router.post("/recruit_result/search", (_req, res) =>
  res.status(410).json({
    success: false,
    error: "지원 결과 확인 화면에서 학번, 이름, 전화번호를 입력해 주세요.",
  }),
);

module.exports = router;
