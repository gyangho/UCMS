const express = require("express");
const router = express.Router();
const Pos = require("../../models/Pos");
const { requireAuthority } = require("./apiResponse");
// 2026-08-21: POS record management starts at the normalized executive rank.
const requirePosManager = requireAuthority(3);

// Get records for active instance (JSON)
router.get("/", async (req, res) => {
  try {
    const active = await Pos.findActiveInstance();
    if (!active)
      return res.json({ records: [], summary: { total_price: 0 } });

    const receipts = await Pos.findReceiptsByInstanceId(active.id);

    // Transform to a flat record per receipt for the existing client script
    const records = receipts.map((r) => {
      const entry = {
        id: r.id,
        purchase_time: r.purchase_time,
        total_price: r.total_price,
        paid: true,
      };
      for (const it of r.items) {
        const key =
          it.product_name + (it.is_service ? " (서비스)" : "");
        entry[key] = (entry[key] || 0) + it.product_quantity;
      }
      return entry;
    });

    const summary = records.reduce((acc, rec) => {
      Object.entries(rec).forEach(([k, v]) => {
        if (
          ["id", "purchase_time", "total_price", "paid"].includes(k)
        )
          return;
        acc[k] = (acc[k] || 0) + v;
      });
      acc.total_price = (acc.total_price || 0) + rec.total_price;
      return acc;
    }, {});

    res.json({ records, summary });
  } catch (err) {
    console.error("GET /api/records error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a record (receipt) by id
router.delete("/:id", requirePosManager, async (req, res) => {
  try {
    const active = await Pos.findActiveInstance();
    if (!active)
      return res.status(400).json({ error: "No active instance" });
    await Pos.deleteReceipt(req.params.id, active.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/records/:id error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Clear all records for active instance
router.post("/clear", requirePosManager, async (req, res) => {
  try {
    const active = await Pos.findActiveInstance();
    if (!active)
      return res.status(400).json({ error: "No active instance" });
    await Pos.clearReceiptsForInstance(active.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/records/clear error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
