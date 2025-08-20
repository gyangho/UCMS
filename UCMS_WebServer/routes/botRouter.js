const express = require("express");
const router = express.Router();
const BotController = require("../controllers/botController");

router.get("/", (req, res, next) => {
  console.log(req.query);
  const { param } = req.query;
  const responseData = {
    message: "빵뿡이는 아직 이런거 몰라용❗❗ 👉👈",
    yourParam: param || null,
    timestamp: Date.now(),
  };
  return res.status(200).json(responseData);
});

router.get("/auth", BotController.completeAuth);

module.exports = router;
