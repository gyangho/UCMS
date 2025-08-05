const express = require("express");
const router = express.Router();
const db = require("../db");
const { getOAuthClients, extractFormIdFromURL } = require("../extern_apis/googleapis");

router.get("/", async (req, res, next) => {
  //   res.render("drive/index");
});

// 폼 생성 페이지
router.get("/generateform", async (req, res, next) => {
  try {
    // form_templates 테이블에서 모든 템플릿 가져오기
    const [templates] = await db.execute(
      "SELECT id, title, form_url FROM form_templates ORDER BY title"
    );

    res.render("drive/generateform", {
      templates: templates || [],
    });
  } catch (err) {
    console.error("폼 생성 페이지 로드 실패:", err);
    res.status(500).send("페이지를 불러올 수 없습니다.");
  }
});

// 폼 템플릿 추가 API
router.post("/add-template", async (req, res, next) => {
  try {
    const { title, form_url } = req.body;

    if (!title || !form_url) {
      return res.status(400).json({ error: "제목과 폼 URL을 모두 입력해주세요." });
    }

    // form_templates 테이블에 저장
    const insertSql = `
      INSERT INTO form_templates (title, form_url, created_at) 
      VALUES (?, ?, NOW())
    `;

    await db.execute(insertSql, [title, form_url]);

    console.log(`폼 템플릿 추가: title=${title}, form_url=${form_url}`);
    res.json({ success: true, message: "폼 템플릿이 추가되었습니다." });
  } catch (err) {
    console.error("폼 템플릿 추가 실패:", err);
    res.status(500).json({ error: "폼 템플릿 추가에 실패했습니다." });
  }
});

// Google 폼 생성 API
router.post("/create-form", async (req, res, next) => {
  try {
    const { drive } = await getOAuthClients();
    const { template_id, user_email } = req.body;

    if (!template_id || !user_email) {
      return res.status(400).json({ error: "템플릿과 이메일을 모두 입력해주세요." });
    }

    // 템플릿 정보 가져오기
    const [templateInfo] = await db.execute(
      "SELECT title, form_url FROM form_templates WHERE id = ?",
      [template_id]
    );

    if (templateInfo.length === 0) {
      return res.status(404).json({ error: "템플릿을 찾을 수 없습니다." });
    }

    const template = templateInfo[0];

    // 템플릿 폼에서 폼 ID 추출
    const templateFormId = extractFormIdFromURL(template.form_url);
    if (!templateFormId) {
      return res.status(400).json({ error: "템플릿 폼 URL이 유효하지 않습니다." });
    }

    // 1. 템플릿 폼 복사
    const copyResponse = await drive.files.copy({
      fileId: templateFormId,
      requestBody: {
        name: `[UCMS]${new Date().toLocaleString()}에 생성된 폼`,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
    });

    const newFormId = copyResponse.data.id;
    const newFormUrl = `https://forms.google.com/d/${newFormId}`;

    // 2. 새 폼에 편집자 권한 부여
    await drive.permissions.create({
      fileId: newFormId,
      requestBody: {
        role: "writer",
        type: "user",
        emailAddress: user_email,
      },
    });

    console.log(
      `폼 생성 완료: template=${template.title}, email=${user_email}, formId=${newFormId}`
    );

    res.json({
      success: true,
      message: "폼이 생성되었습니다.",
      form_url: newFormUrl,
    });
  } catch (err) {
    console.error("폼 생성 실패:", err);
    res.status(500).json({ error: "폼 생성에 실패했습니다." });
  }
});

module.exports = router;
