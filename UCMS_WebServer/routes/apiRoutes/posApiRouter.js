const express = require("express");
const router = express.Router();
const Pos = require("../../models/Pos");
const db = require("../../models/db");

// List instances
router.get("/instances", async (req, res) => {
  try {
    const instances = await Pos.findAllInstances();
    res.json({ instances });
  } catch (err) {
    console.error("GET /api/pos/instances error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create instance
router.post("/instances", async (req, res) => {
  try {
    const { instance_name, products, salesmans } = req.body;
    if (!instance_name)
      return res
        .status(400)
        .json({ error: "instance_name is required" });
    const id = await Pos.createInstance({
      instance_name,
      products: products || [],
      salesmans: salesmans || [],
    });
    res.status(201).json({ id });
  } catch (err) {
    console.error("POST /api/pos/instances error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get instance info
router.get("/instances/:id", async (req, res) => {
  try {
    const data = await Pos.findInstanceInfoById(req.params.id);
    if (!data.instance)
      return res.status(404).json({ error: "Instance not found" });
    res.json(data);
  } catch (err) {
    console.error("GET /api/pos/instances/:id error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update instance
router.put("/instances/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { instance_name, products, salesmans } = req.body;
    await Pos.updateInstance({
      id,
      instance_name,
      products: products || [],
      salesmans: salesmans || [],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/pos/instances/:id error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete instance
router.delete("/instances/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await db.query("DELETE FROM pos_instances WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/pos/instances/:id error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Open instance (set active) and return active info
router.post("/instances/:id/open", async (req, res) => {
  try {
    await Pos.setActiveInstance(req.params.id);
    const instance = await Pos.findActiveInstance();
    res.json({ instance });
  } catch (err) {
    console.error("POST /api/pos/instances/:id/open error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Purchase
router.post("/purchase", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId)
      return res.status(401).json({ error: "Unauthorized" });

    let { instanceId, items, total } = req.body;
    if (!instanceId) {
      const active = await Pos.findActiveInstance();
      if (!active)
        return res.status(400).json({ error: "No active instance" });
      instanceId = active.id;
    }

    if (!Array.isArray(items))
      return res
        .status(400)
        .json({ error: "items must be an array" });

    // total can be recomputed or trusted - keep as provided for now
    const result = await Pos.recordPurchase({
      instanceId,
      userId,
      items,
      totalPrice: total,
    });
    res.status(201).json({ receiptId: result.receiptId });
  } catch (err) {
    if (err.code === "NOT_SALESMAN") {
      return res.status(403).json({ error: err.message });
    }
    console.error("POST /api/pos/purchase error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Search members by student_id (for salesman picker)
router.get("/members", async (req, res) => {
  try {
    const studentId = (req.query.student_id || "").trim();
    if (!studentId) return res.json({ members: [] });
    const [rows] = await db.query(
      `SELECT student_id, name FROM Members WHERE student_id LIKE ? ORDER BY name ASC LIMIT 20`,
      [studentId + "%"]
    );
    res.json({ members: rows });
  } catch (err) {
    console.error("GET /api/pos/members error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/close", async (req, res) => {
  const instanceId = req.body.instanceId;
  const id = parseInt(instanceId);

  try {
    result = await db.execute(
      `UPDATE pos_instances SET status='inactive' where id = ?`,
      [id]
    );
  } catch (error) {
    console.error("POST /api/pos/close error", error);
    res.status(500).json({ error: "Internal server error" });
  }

  res.json({ success: true });
});

module.exports = router;
