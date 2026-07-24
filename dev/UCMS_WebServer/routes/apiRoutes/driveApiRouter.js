const express = require("express");
const router = express.Router();
const FormTemplate = require("../../models/FormTemplate");

router.get("/templates", async (req, res) => {
  try {
    const templates = await FormTemplate.findAll();
    res.json({ success: true, templates: templates || [] });
  } catch (error) {
    console.error("GET /api/drive/templates error", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

module.exports = router;
