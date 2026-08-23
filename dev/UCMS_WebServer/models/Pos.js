const db = require("./db");

class Pos {
  static async findAllInstances() {
    // 2026-07-23: POS 목록에서 생성자와 생성 시각을 함께 표시한다.
    const [rows] = await db.query(
      `SELECT pi.*, COALESCE(m.name, u.name) AS creator_name
         FROM pos_instances pi
         LEFT JOIN users u ON u.id = pi.created_by
         LEFT JOIN members m ON m.user_id = u.id
        ORDER BY pi.created_at DESC, pi.id DESC`
    );
    return rows;
  }

  static async findActiveInstance() {
    // 2026-08-20: Expired sales are closed before any active-instance decision is made.
    await this.closeExpiredInstances();
    const [rows] = await db.query(
      "SELECT * FROM pos_instances WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    return rows[0] || null;
  }

  static async createInstance({
    instance_name,
    products = [],
    salesmans = [],
    created_by = null,
    poster_file_name = null,
    poster_pdf = null,
    promotion_copy = null,
    auto_close_at = null,
  }) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [instanceResult] = await connection.query(
        `INSERT INTO pos_instances
          (instance_name, status, created_by, poster_file_name, poster_mime_type, poster_pdf, promotion_copy, auto_close_at)
         VALUES (?, 'inactive', ?, ?, ?, ?, ?, ?)`,
        [instance_name, created_by, poster_file_name, poster_pdf ? "application/pdf" : null, poster_pdf, promotion_copy, auto_close_at]
      );
      const instanceId = instanceResult.insertId;

      if (products.length > 0) {
        const values = products.map((p) => [
          instanceId,
          p.product_name,
          p.product_price,
          p.stock ?? 0,
          p.stock ?? 0,
        ]);
        await connection.query(
          "INSERT INTO pos_products (instance_id, product_name, product_price, stock, initial_stock) VALUES ?",
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
    // 2026-07-23: 상세 화면의 작성자와 판매 상태 전환 정보를 조회한다.
    const [instances] = await db.query(
      `SELECT pi.*, COALESCE(m.name, u.name) AS creator_name
         FROM pos_instances pi
         LEFT JOIN users u ON u.id = pi.created_by
         LEFT JOIN members m ON m.user_id = u.id
        WHERE pi.id = ?`,
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
    return this.setInstanceStatus(id, "active");
  }

  static async closeExpiredInstances() {
    const [result] = await db.query(
      `UPDATE pos_instances
          SET status = 'closed', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)
        WHERE status = 'active'
          AND auto_close_at IS NOT NULL
          AND auto_close_at <= CURRENT_TIMESTAMP`
    );
    return result.affectedRows || 0;
  }

  static async getActivePromotion() {
    const instance = await this.findActiveInstance();
    if (!instance) return null;
    const [totals] = await db.query(
      `SELECT COALESCE(SUM(initial_stock), 0) AS initial_stock,
              COALESCE(SUM(stock), 0) AS remaining_stock
         FROM pos_products
        WHERE instance_id = ?`,
      [instance.id]
    );
    const initialStock = Number(totals[0]?.initial_stock || 0);
    const remainingStock = Number(totals[0]?.remaining_stock || 0);
    return {
      ...instance,
      initial_stock: initialStock,
      sold_quantity: Math.max(0, initialStock - remainingStock),
      sale_rate: initialStock > 0 ? Math.max(0, initialStock - remainingStock) / initialStock : 0,
    };
  }

  static async setInstanceStatus(id, status) {
    if (!["inactive", "active", "closed"].includes(status)) {
      const error = new Error("지원하지 않는 POS 상태입니다.");
      error.code = "INVALID_POS_STATUS";
      throw error;
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [instances] = await connection.query(
        "SELECT status FROM pos_instances WHERE id = ? FOR UPDATE",
        [id]
      );
      if (!instances[0]) {
        const error = new Error("POS 인스턴스를 찾을 수 없습니다.");
        error.code = "POS_NOT_FOUND";
        throw error;
      }
      if (instances[0].status === "closed") {
        const error = new Error("마감된 POS 인스턴스의 상태는 변경할 수 없습니다.");
        error.code = "POS_CLOSED";
        throw error;
      }

      // 2026-07-23: 동시에 판매 중인 인스턴스는 하나만 유지하고 마감 시각을 기록한다.
      if (status === "active") {
        await connection.query(
          "UPDATE pos_instances SET status = 'inactive' WHERE status = 'active' AND id <> ?",
          [id]
        );
      }
      await connection.query(
        `UPDATE pos_instances
            SET status = ?,
                closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP ELSE closed_at END
          WHERE id = ?`,
        [status, status, id]
      );
      await connection.commit();
      return { status };
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
          p.stock ?? 0,
        ]);
        await connection.query(
          "INSERT INTO pos_products (instance_id, product_name, product_price, stock, initial_stock) VALUES ?",
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
    // 2026-08-21: Persist automatic closure before opening the purchase transaction so rejection cannot roll it back.
    await this.closeExpiredInstances();
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

      // 2026-07-23: 판매 중인 인스턴스와 실제 재고를 잠근 뒤 서비스 수량도 재고에서 차감한다.
      const [instances] = await connection.query(
        "SELECT status, auto_close_at FROM pos_instances WHERE id = ? FOR UPDATE",
        [instanceId]
      );
      if (!instances[0] || instances[0].status !== "active") {
        const error = new Error("판매 중인 POS 인스턴스가 아닙니다.");
        error.code = "POS_NOT_ACTIVE";
        throw error;
      }
      if (instances[0].auto_close_at && new Date(instances[0].auto_close_at) <= new Date()) {
        await connection.query(
          "UPDATE pos_instances SET status = 'closed', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP) WHERE id = ?",
          [instanceId]
        );
        const error = new Error("자동 판매 종료 시간이 지났습니다.");
        error.code = "POS_NOT_ACTIVE";
        throw error;
      }

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

        const [stockResult] = await connection.query(
          `UPDATE pos_products
              SET stock = stock - ?
            WHERE id = ? AND instance_id = ? AND stock >= ?`,
          [item.quantity, item.product_id, instanceId, item.quantity]
        );
        if (stockResult.affectedRows !== 1) {
          const error = new Error("재고가 부족한 품목이 있습니다.");
          error.code = "OUT_OF_STOCK";
          throw error;
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
