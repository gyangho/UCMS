const db = require("./index");

class Purchase {
  static async findAll(page = 1, limit = 10) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM purchases ORDER BY purchase_date DESC LIMIT ? OFFSET ?",
        [limit, (page - 1) * limit]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute("SELECT * FROM purchases WHERE id = ?", [
        id,
      ]);
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async create(purchaseData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO purchases (product_name, quantity, price, total_price, purchase_date) VALUES (?, ?, ?, ?, ?)",
        [
          purchaseData.product_name,
          purchaseData.quantity,
          purchaseData.price,
          purchaseData.total_price,
          purchaseData.purchase_date,
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async update(id, purchaseData) {
    try {
      await db.execute(
        "UPDATE purchases SET product_name = ?, quantity = ?, price = ?, total_price = ?, purchase_date = ? WHERE id = ?",
        [
          purchaseData.product_name,
          purchaseData.quantity,
          purchaseData.price,
          purchaseData.total_price,
          purchaseData.purchase_date,
          id,
        ]
      );
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await db.execute("DELETE FROM purchases WHERE id = ?", [id]);
    } catch (error) {
      throw error;
    }
  }

  static async count() {
    try {
      const [rows] = await db.execute(
        "SELECT COUNT(*) as total FROM purchases"
      );
      return rows[0].total;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Purchase;
