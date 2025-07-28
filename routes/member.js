const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res, next) => {
  const { page = 1, limit = 10, search = "", column = "" } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = search && column ? `WHERE ${column} LIKE ?` : "";
  const searchParam = `%${search}%`;

  const countQuery = `SELECT COUNT(*) AS count FROM Members ${whereClause}`;
  const dataQuery = `SELECT * FROM Members ${whereClause} ORDER BY name LIMIT ? OFFSET ?`;
  try {
    const [countRows] = await db.query(countQuery, search && column ? [searchParam] : []);

    const total = countRows[0].count;

    const [members] = await db.query(
      dataQuery,
      search && column
        ? [searchParam, Number(limit), Number(offset)]
        : [Number(limit), Number(offset)]
    );

    res.render("membermanage", {
      members,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      limit: Number(limit),
      search,
      column,
    });
  } catch (err) {
    err.code = "부원 목록 불러오기 실패";
    return next(err);
  }
});

//부원 추가
router.post("/add", async (req, res, next) => {
  try {
    const members = req.body.members; // array of new members
    console.log(req.body.members);
    const values = members.map((m) => [
      m.student_id,
      m.name,
      m.major,
      m.phone,
      m.gender,
      m.generation,
    ]);
    await db.query(
      "INSERT INTO Members (student_id, name, major, phone, gender, generation) VALUES ?",
      [values]
    );
  } catch (err) {
    next(err);
  }
  return res.redirect("/member");
});

//부원 수정
router.post("/edit/:id", async (req, res, next) => {
  const { name, major, phone, gender, generation, authority } = req.body;
  const id = req.params.id;
  console.log(req.body);
  try {
    await db.query(
      "UPDATE Members SET name = ?, major = ?, phone = ?, gender = ?, generation = ?, authority = ? WHERE student_id = ?",
      [name, major, phone, gender, generation, authority, id]
    );
  } catch (err) {
    next(err);
  }
  return res.redirect("/member");
});

// 부원 삭제
router.post("/delete/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    await db.query("DELETE FROM Members WHERE student_id = ?", [id]);
  } catch (err) {
    next(err);
  }
  return res.redirect("/member");
});

module.exports = router;
