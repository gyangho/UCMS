const User = require("../models/User");
const axios = require("axios");

class AuthController {
  static async call(method, uri, param, header) {
    try {
      const response = await axios({
        method,
        url: uri,
        data: param,
        headers: header,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  static async kakaoLogin(req, res) {
    try {
      const { code } = req.query;

      if (!code) {
        return res.redirect("/");
      }

      // 카카오 토큰 요청
      const tokenResponse = await this.call(
        "POST",
        "https://kauth.kakao.com/oauth/token",
        `grant_type=authorization_code&client_id=${process.env.KAKAO_CLIENT_ID}&redirect_uri=${process.env.KAKAO_REDIRECT_URI}&code=${code}`,
        { "Content-Type": "application/x-www-form-urlencoded" }
      );

      // 카카오 사용자 정보 요청
      const userResponse = await this.call(
        "GET",
        "https://kapi.kakao.com/v2/user/me",
        null,
        {
          Authorization: `Bearer ${tokenResponse.access_token}`,
        }
      );

      const { id, properties } = userResponse;
      const { nickname, email } = properties;

      // 사용자 조회 또는 생성
      let user = await User.findBySessionId(req.sessionID);

      if (!user) {
        const userId = await User.create({
          name: nickname,
          email: email || `${id}@kakao.com`,
          authority: 3,
          session_id: req.sessionID,
        });
        user = await User.findById(userId);
      } else {
        await User.updateSessionId(user.id, req.sessionID);
      }

      req.session.user = user;
      res.redirect("/dashboard");
    } catch (error) {
      console.error("Kakao login error:", error);
      res.redirect("/");
    }
  }

  static async logout(req, res) {
    try {
      await User.deleteSessionId(req.sessionID);
      req.session.destroy();
      res.redirect("/");
    } catch (error) {
      console.error("Logout error:", error);
      res.redirect("/");
    }
  }
}

module.exports = AuthController;
