const db = require("./db");

class Pos {
  static async findAllInstances() {
    const [rows] = await db.query(
      "SELECT * FROM pos_instances ORDER BY id DESC"
    );
    return rows;
  }

  static async findActiveInstance() {
    const [rows] = await db.query(
      "SELECT * FROM pos_instances WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    return rows[0] || null;
  }

  static async createInstance({
    instance_name,
    products = [],
    salesmans = [],
  }) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [instanceResult] = await connection.query(
        "INSERT INTO pos_instances (instance_name, status) VALUES (?, 'inactive')",
        [instance_name]
      );
      const instanceId = instanceResult.insertId;

      if (products.length > 0) {
        const values = products.map((p) => [
          instanceId,
          p.product_name,
          p.product_price,
          p.stock ?? 0,
        ]);
        await connection.query(
          "INSERT INTO pos_products (instance_id, product_name, product_price, stock) VALUES ?",
          [values]
        );
      }

      if (salesmans.length > 0) {
        const values = salesmans.map((m) => [
          m.member_id,
          instanceId,
        ]);
        await connection.query(
          "INSERT INTO pos_salesmans (member_id, instance_id) VALUES ?",
          [values]
        );
      }

      await connection.commit();
      return instanceId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findInstanceInfoById(id) {
    const [instances] = await db.query(
      "SELECT * FROM pos_instances WHERE id = ?",
      [id]
    );
    const instance = instances[0] || null;

    const [products] = await db.query(
      `SELECT * FROM pos_products WHERE instance_id = ? ORDER BY id ASC`,
      [id]
    );

    const [salesmans] = await db.query(
      `SELECT s.*, m.name AS member_name
       FROM pos_salesmans s
       JOIN members m ON m.student_id = s.member_id
       WHERE s.instance_id = ?
       ORDER BY s.id ASC`,
      [id]
    );

    return { instance, products, salesmans };
  }

  static async setActiveInstance(id) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        "UPDATE pos_instances SET status = 'inactive'"
      );
      await connection.query(
        "UPDATE pos_instances SET status = 'active' WHERE id = ?",
        [id]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateInstance({
    id,
    instance_name,
    products = [],
    salesmans = [],
  }) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      if (instance_name) {
        await connection.query(
          "UPDATE pos_instances SET instance_name = ? WHERE id = ?",
          [instance_name, id]
        );
      }

      // Replace products
      await connection.query(
        "DELETE FROM pos_products WHERE instance_id = ?",
        [id]
      );
      if (products.length > 0) {
        const values = products.map((p) => [
          id,
          p.product_name,
          p.product_price,
          p.stock ?? 0,
        ]);
        await connection.query(
          "INSERT INTO pos_products (instance_id, product_name, product_price, stock) VALUES ?",
          [values]
        );
      }

      // Replace salesmans
      await connection.query(
        "DELETE FROM pos_salesmans WHERE instance_id = ?",
        [id]
      );
      if (salesmans.length > 0) {
        const values = salesmans.map((m) => [m.member_id, id]);
        await connection.query(
          "INSERT INTO pos_salesmans (member_id, instance_id) VALUES ?",
          [values]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async isUserSalesmanForInstance(userId, instanceId) {
    const [rows] = await db.query(
      `SELECT s.id AS salesman_id, s.member_id
       FROM pos_salesmans s
       JOIN members m ON m.student_id = s.member_id
       JOIN Users u ON u.id = m.user_id
       WHERE u.id = ? AND s.instance_id = ?
       LIMIT 1`,
      [userId, instanceId]
    );
    return rows[0] || null;
  }

  static async recordPurchase({
    instanceId,
    userId,
    items,
    totalPrice,
  }) {
    // items: [{ product_id, quantity, is_service }]
    const salesman = await this.isUserSalesmanForInstance(
      userId,
      instanceId
    );
    if (!salesman) {
      const err = new Error("판매 권한이 없습니다.");
      err.code = "NOT_SALESMAN";
      throw err;
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [receiptResult] = await connection.query(
        `INSERT INTO pos_receipts (instance_id, total_price, salesman_id) VALUES (?, ?, ?)`,
        [instanceId, totalPrice, salesman.salesman_id]
      );
      const receiptId = receiptResult.insertId;

      for (const item of items) {
        await connection.query(
          `INSERT INTO pos_sales_history (receipt_id, instance_id, product_id, product_quantity, is_service)
           VALUES (?, ?, ?, ?, ?)`,
          [
            receiptId,
            instanceId,
            item.product_id,
            item.quantity,
            !!item.is_service,
          ]
        );

        if (!item.is_service) {
          await connection.query(
            `UPDATE pos_products SET stock = stock - ? WHERE id = ? AND instance_id = ?`,
            [item.quantity, item.product_id, instanceId]
          );
        }
      }

      await connection.commit();
      return { receiptId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findReceiptsByInstanceId(instanceId) {
    const [receipts] = await db.query(
      `SELECT r.*, s.member_id, m.name AS salesman_name
       FROM pos_receipts r
       JOIN pos_salesmans s ON s.id = r.salesman_id
       JOIN members m ON m.student_id = s.member_id
       WHERE r.instance_id = ?
       ORDER BY r.id DESC`,
      [instanceId]
    );

    const [items] = await db.query(
      `SELECT h.*, p.product_name, p.product_price
       FROM pos_sales_history h
       JOIN pos_products p
         ON p.id = h.product_id AND p.instance_id = h.instance_id
       WHERE h.instance_id = ?
       ORDER BY h.receipt_id DESC, h.id ASC`,
      [instanceId]
    );

    const receiptIdToItems = new Map();
    for (const it of items) {
      if (!receiptIdToItems.has(it.receipt_id))
        receiptIdToItems.set(it.receipt_id, []);
      receiptIdToItems.get(it.receipt_id).push(it);
    }

    return receipts.map((r) => ({
      ...r,
      items: receiptIdToItems.get(r.id) || [],
    }));
  }

  static async clearReceiptsForInstance(id) {
    try {
      db.execute(`DELETE FROM pos_receipts where instance_id = ?`, [
        id,
      ]);
    } catch (error) {
      console.err(error);
    }
  }

  static async deleteReceipt(receiptId, instanceId) {
    try {
      db.execute(
        `DELETE FROM pos_receipts where id=? AND instance_id = ?`,
        [receiptId, instanceId]
      );
    } catch (error) {
      console.err(error);
    }
  }
}

module.exports = Pos;
