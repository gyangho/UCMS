const express = require("express");
const router = express.Router();
const User = require("../../models/User");

router.get("/", async (req, res) => {});

router.get("/getUserById", async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({
    id: user.id,
    name: user.name,
    profile_image: user.profile_image,
    thumbnail_image: user.thumbnail_image,
  });
});

module.exports = router;
