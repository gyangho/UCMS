const express = require("express");
const router = express.Router();
const FormController = require("../../controllers/formController");

router.get("/:id/questions", FormController.getFormQuestions);

module.exports = router;
