const PendingAuth = require("../models/pendingAuth");

class BotController {
  static async completeAuth(req, res) {
    try {
      const { authcode, chat_room_id } = req.query;
      const upperAuthcode = authcode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

      if (!upperAuthcode || !chat_room_id) {
        return res.json({ success: false, message: "인증코드가 없습니다." });
      }

      const pendingAuth = await PendingAuth.findByAuthCode(upperAuthcode);

      if (!pendingAuth) {
        return res.json({ success: false, message: "인증 세션이 없습니다." });
      }

      if (pendingAuth.auth_code !== upperAuthcode) {
        return res.json({
          success: false,
          message: "인증코드가 일치하지 않습니다.",
        });
      }

      // 5분 제한 확인
      const now = Date.now();
      const timeDiff = now - pendingAuth.created_at;
      if (timeDiff > 5 * 60 * 1000) {
        // 5분
        await PendingAuth.deleteByAuthCode(upperAuthcode);
        return res.json({
          success: false,
          message: "인증 시간이 만료되었습니다.",
        });
      }

      await PendingAuth.updateIsCompleted(chat_room_id, upperAuthcode, true);

      res.json({
        success: true,
        message: `🤚안녕하세요 ${pendingAuth.name}님🤚\n😊저는 뿡빵이에요😊\n웹페이지에서 인증 확인 버튼을 눌러주세요`,
      });
    } catch (error) {
      console.error("Complete auth error:", error);
      res.json({ success: false, message: "인증 완료에 실패했습니다." });
    }
  }
}

module.exports = BotController;
