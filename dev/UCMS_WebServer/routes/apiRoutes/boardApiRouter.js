const express = require("express");
const BoardController = require("../../controllers/boardController");

const router = express.Router();

// 2026-07-23: Expose schema-backed notice, inquiry, and inquiry-comment CRUD.
router.get("/:boardType", BoardController.listPosts);
router.post("/:boardType", BoardController.createPost);
router.get("/:boardType/:id", BoardController.getPost);
router.put("/:boardType/:id", BoardController.updatePost);
router.delete("/:boardType/:id", BoardController.deletePost);
router.post("/:boardType/:id/comments", BoardController.createComment);
router.put(
  "/:boardType/:id/comments/:commentId",
  BoardController.updateComment,
);
router.delete(
  "/:boardType/:id/comments/:commentId",
  BoardController.deleteComment,
);

module.exports = router;
