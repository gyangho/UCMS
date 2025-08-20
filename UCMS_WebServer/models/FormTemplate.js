const db = require("./db");

class FormTemplate {
  static async findAll() {
    try {
      const [rows] = await db.execute(
        "SELECT id, title, form_url FROM form_templates ORDER BY title"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT id, title, form_url FROM form_templates WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async create(templateData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO form_templates (title, form_url, created_at) VALUES (?, ?, NOW())",
        [templateData.title, templateData.form_url]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async createOrUpdate(templateData) {
    try {
      const [result] = await db.execute(
        `INSERT INTO form_templates (title, form_url, created_at) 
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           title = VALUES(title),
           form_url = VALUES(form_url)`,
        [templateData.title, templateData.form_url]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async update(id, templateData) {
    try {
      await db.execute(
        "UPDATE form_templates SET title = ?, form_url = ? WHERE id = ?",
        [templateData.title, templateData.form_url, id]
      );
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await db.execute("DELETE FROM form_templates WHERE id = ?", [id]);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = FormTemplate;
