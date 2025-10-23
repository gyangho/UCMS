const Pos = require("../models/Pos");

class PosController {
  static async renderInstances(req, res) {
    try {
      const active = await Pos.findActiveInstance();
      if (active) {
        return res.redirect(`/pos/${active.id}`);
      }
      const instances = await Pos.findAllInstances();
      res.render("pos/instances", { instances });
    } catch (error) {
      console.error("Render POS error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInstanceInfo(req, res) {
    try {
      const { instance, products, salesmans } =
        await Pos.findInstanceInfoById(req.params.id);
      if (!instance)
        return res.status(404).send("Instance not found");
      res.render("pos/instanceInfo", {
        instance,
        products,
        salesmans,
      });
    } catch (error) {
      console.error("Render instance info error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderCreateInstance(req, res) {
    try {
      res.render("pos/create");
    } catch (error) {
      console.error("Render create instance error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderSale(req, res) {
    try {
      const { instance, products } = await Pos.findInstanceInfoById(
        req.params.id
      );
      if (!instance)
        return res.status(404).send("Instance not found");
      res.render("pos/pos", { instance, products });
    } catch (error) {
      console.error("Render POS-Sale error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderRecords(req, res) {
    try {
      // Page renders, data will be fetched via /api/records
      res.render("pos/records");
    } catch (error) {
      console.error("Render records error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderEditInstance(req, res) {
    try {
      const { instance, products, salesmans } =
        await Pos.findInstanceInfoById(req.params.id);

      if (!instance)
        return res.status(404).send("Instance not found");

      res.render("pos/edit", { instance, products, salesmans });
    } catch (error) {
      console.error("Render edit instance error:", error);
      res.status(500).send("Internal server error");
    }
  }
}

module.exports = PosController;
