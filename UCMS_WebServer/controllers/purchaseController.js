const Purchase = require("../models/Purchase");

class PurchaseController {
  static async getPurchases(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const purchases = await Purchase.findAll(page, limit);
      const total = await Purchase.count();
      const totalPages = Math.ceil(total / limit);

      res.json({
        purchases,
        pagination: {
          currentPage: page,
          totalPages,
          total,
          limit,
        },
      });
    } catch (error) {
      console.error("Get purchases error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getPurchase(req, res) {
    try {
      const { id } = req.params;
      const purchase = await Purchase.findById(id);

      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      res.json(purchase);
    } catch (error) {
      console.error("Get purchase error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async createPurchase(req, res) {
    try {
      const purchaseData = req.body;
      const purchaseId = await Purchase.create(purchaseData);
      const purchase = await Purchase.findById(purchaseId);

      res.status(201).json(purchase);
    } catch (error) {
      console.error("Create purchase error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updatePurchase(req, res) {
    try {
      const { id } = req.params;
      const purchaseData = req.body;

      await Purchase.update(id, purchaseData);
      const purchase = await Purchase.findById(id);

      res.json(purchase);
    } catch (error) {
      console.error("Update purchase error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deletePurchase(req, res) {
    try {
      const { id } = req.params;
      await Purchase.delete(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete purchase error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteAll(req, res) {
    try {
      await Purchase.deleteAll();
      res.status(204).send();
    } catch (error) {
      console.error("Delete all purchases error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async renderRecords(req, res) {
    try {
      res.render("records");
    } catch (error) {
      console.error("Render records error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderPos(req, res) {
    try {
      res.render("pos");
    } catch (error) {
      console.error("Render POS error:", error);
      res.status(500).send("Internal server error");
    }
  }
}

module.exports = PurchaseController;
