const Member = require("../models/Member");

class MemberController {
  static async getMembers(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const searchType = req.query.searchType || "";

      const members = await Member.findAll(page, limit, search, searchType);
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

  static async createMember(req, res) {
    try {
      const memberData = req.body;
      const memberId = await Member.create(memberData);
      const member = await Member.findById(memberId);

      res.status(201).json(member);
    } catch (error) {
      console.error("Create member error:", error);
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
      res.status(204).send();
    } catch (error) {
      console.error("Delete member error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async bulkCreateMembers(req, res) {
    try {
      const { members } = req.body;

      if (!Array.isArray(members) || members.length === 0) {
        return res.status(400).json({ error: "Invalid members data" });
      }

      await Member.bulkCreate(members);
      res.status(201).json({ message: "Members created successfully" });
    } catch (error) {
      console.error("Bulk create members error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async renderMemberManage(req, res) {
    try {
      res.render("membermanage");
    } catch (error) {
      console.error("Render member manage error:", error);
      res.status(500).send("Internal server error");
    }
  }
}

module.exports = MemberController;
