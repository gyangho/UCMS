const Member = require("../models/Member");

class MemberController {
  static async getMembers(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const searchType = req.query.searchType || "";

      const members = await Member.findAll(
        page,
        limit,
        search,
        searchType
      );
      const total = await Member.count(search, searchType);
      const totalPages = Math.ceil(total / limit);

      res.json({
        members,
        pagination: {
          currentPage: page,
          totalPages,
          total,
          limit,
        },
      });
    } catch (error) {
      console.error("Get members error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getMember(req, res) {
    try {
      const { id } = req.params;
      const member = await Member.findById(id);

      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      res.json(member);
    } catch (error) {
      console.error("Get member error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateMember(req, res) {
    try {
      const { id } = req.params;
      const memberData = req.body;

      await Member.update(id, memberData);
      const member = await Member.findById(id);

      res.json(member);
    } catch (error) {
      console.error("Update member error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteMember(req, res) {
    try {
      const { id } = req.params;
      await Member.delete(id);
      res.redirect("/member");
    } catch (error) {
      console.error("Delete member error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addMember(req, res) {
    try {
      const { members } = req.body;

      console.log(members);

      if (!Array.isArray(members) || members.length === 0) {
        return res
          .status(400)
          .json({ error: "Invalid members data" });
      }
      members.forEach(async (member) => {
        await Member.create(member);
      });

      res.redirect("/member");
    } catch (error) {
      console.error("Add members error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async renderMemberManage(req, res) {
    try {
      res.render("membermanage", {
        search: req.query.search || "",
        column: req.query.column || "",
        members: await Member.findAll(
          req.query.page || 1,
          req.query.limit || 10,
          req.query.search || "",
          req.query.column || ""
        ),
        total: await Member.count(
          req.query.search || "",
          req.query.column || ""
        ),
        totalPages: Math.ceil(
          (await Member.count(
            req.query.search || "",
            req.query.column || ""
          )) / (req.query.limit || 10)
        ),
        currentPage: req.query.page || 1,
        limit: req.query.limit || 10,
      });
    } catch (error) {
      console.error("Render member manage error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async editMember(req, res) {
    try {
      const { id } = req.params;
      const memberData = req.body;
      console.log(id, memberData);
      await Member.update(id, memberData);
      res
        .status(200)
        .json({ message: "Member updated successfully" });
    } catch (error) {
      console.error("Edit member error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

module.exports = MemberController;
