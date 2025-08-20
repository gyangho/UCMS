const User = require("../models/User");
const Member = require("../models/Member");
const PendingAuth = require("../models/pendingAuth");
const axios = require("axios");

class AuthController {
  static generateAuthCode() {
    return Math.random().toString(16).substring(2, 10).toUpperCase();
  }

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

  static async authorize(req, res) {
    res.redirect(
      `https://kauth.kakao.com/oauth/authorize?client_id=${process.env.KAKAO_REST_KEY}&redirect_uri=${process.env.KAKAO_REDIRECT_URI}&response_type=code`
    );
  }

  static async redirect(req, res) {
    try {
      const { code } = req.query;

      if (!code) {
        console.log("code is null");
        return res.redirect("/");
      }

      // 카카오 토큰 요청
      const tokenResponse = await AuthController.call(
        "POST",
        "https://kauth.kakao.com/oauth/token",
        {
          grant_type: "authorization_code",
          client_id: process.env.KAKAO_REST_KEY,
          redirect_uri: process.env.KAKAO_REDIRECT_URI,
          code: code,
          client_secret: process.env.KAKAO_CLIENT_SECRET,
        },
        { "Content-Type": "application/x-www-form-urlencoded" }
      );

      // 카카오 사용자 정보 요청
      const userResponse = await AuthController.call(
        "GET",
        "https://kapi.kakao.com/v2/user/me",
        null,
        {
          Authorization: `Bearer ${tokenResponse.access_token}`,
        }
      );

      const { id, properties } = userResponse;
      const { nickname, profile_image, thumbnail_image } = properties;

      // 사용자 조회 또는 생성
      let user = await User.findByKakaoId(id);

      if (!user) {
        // 새로운 사용자인 경우 카카오톡 인증 페이지로 이동
        const authCode = AuthController.generateAuthCode();
        req.session.pendingAuth = authCode;
        await PendingAuth.create({
          kakao_id: id,
          name: nickname,
          profile_image: profile_image,
          thumbnail_image: thumbnail_image,
          auth_code: authCode,
        });
        req.session.authority = 0;
        res.render("kakao_auth", { authCode: authCode });
        return;
      } else {
        const authority = await Member.getAuthorityByUserId(user.id);
        if (!authority || !user.chat_room_id) {
          await User.delete(user.id);
          res.redirect("/auth/authorize");
        } else {
          req.session.authority = authority;
          req.session.userId = user.id;
          await User.update(
            user.id,
            nickname,
            profile_image,
            thumbnail_image
          );
          res.redirect("/dashboard");
        }
      }
    } catch (error) {
      console.error("Kakao login error:", error);
      res.redirect("/");
    }
  }

  static async regenerateCode(req, res) {
    try {
      const newAuthCode = AuthController.generateAuthCode();

      await PendingAuth.updateAuthCode(
        req.session.pendingAuth,
        newAuthCode
      );

      res.json({ success: true, authCode: newAuthCode });
    } catch (error) {
      console.error("Regenerate code error:", error);
      res.json({
        success: false,
        message: "인증코드 재발급에 실패했습니다.",
      });
    }
  }

  static async checkAuthCompleted(req, res) {
    try {
      const pendingAuth = await PendingAuth.findByAuthCode(
        req.session.pendingAuth
      );

      console.log(pendingAuth.chat_room_id);

      if (!pendingAuth) {
        res.json({
          success: false,
          message: "인증 세션이 없습니다.",
        });
      } else {
        if (!pendingAuth.is_completed) {
          res.json({
            success: false,
            message: "인증이 완료되지 않았습니다.",
          });
        } else {
          const userId = await User.create({
            kakao_id: pendingAuth.kakao_id,
            name: pendingAuth.name,
            profile_image: pendingAuth.profile_image,
            thumbnail_image: pendingAuth.thumbnail_image,
            chat_room_id: pendingAuth.chat_room_id,
          });
          await PendingAuth.deleteByAuthCode(req.session.pendingAuth);
          req.session.userId = userId;

          // 같은 이름의 멤버들 조회
          const members = await Member.findByName(pendingAuth.name);
          console.log(members);
          if (members.length === 0) {
            // 멤버가 없으면 기본 권한으로 설정
            req.session.authority = 1;
            res.json({
              success: true,
              message:
                "부원이 아니시군요!\n아래 신입부원 지원 버튼을 통해 저희와 함께해 보아요!",
            });
          } else if (members.length === 1) {
            // 멤버가 하나면 바로 확인
            const member = members[0];
            await Member.updateUserId(userId, member.student_id);
            req.session.authority = member.authority_num;
            res.json({
              success: true,
              message: "인증이 완료되었습니다.",
            });
          } else {
            // 멤버가 여러 개면 선택 페이지로 이동
            req.session.pendingMembers = members;
            res.json({ success: true, redirect: "/member-confirm" });
          }
        }
      }
    } catch (error) {
      console.error("Check auth completed error:", error);
      res.json({
        success: false,
        message: "인증 확인에 실패했습니다.",
      });
    }
  }
  static async cancelAuth(req, res) {
    await PendingAuth.deleteByAuthCode(req.session.pendingAuth);
    res.json({ success: true, message: "인증이 취소되었습니다." });
  }

  static async showMemberConfirm(req, res) {
    try {
      if (!req.session.pendingMembers) {
        return res.redirect("/");
      }

      res.render("member_confirm", {
        members: req.session.pendingMembers,
      });
    } catch (error) {
      console.error("Show member confirm error:", error);
      res.redirect("/");
    }
  }

  static async confirmMember(req, res) {
    try {
      const { memberId } = req.body;

      if (!req.session.pendingMembers || !req.session.userId) {
        return res.json({
          success: false,
          message: "세션이 유효하지 않습니다.",
        });
      }

      const selectedMember = req.session.pendingMembers.find(
        (m) => m.id == memberId
      );
      if (!selectedMember) {
        return res.json({
          success: false,
          message: "선택한 멤버를 찾을 수 없습니다.",
        });
      }

      // 선택한 멤버의 user_id를 업데이트
      await Member.updateUserId(
        selectedMember.id,
        req.session.userId
      );
      // 선택한 멤버의 권한 수정
      await Member.updateAuthority(selectedMember.id, "부원");

      // 세션에 권한 설정
      req.session.authority = 1;

      // pendingMembers 세션 삭제
      delete req.session.pendingMembers;

      res.json({
        success: true,
        message: "멤버 확인이 완료되었습니다.",
      });
    } catch (error) {
      console.error("Confirm member error:", error);
      res.json({
        success: false,
        message: "멤버 확인에 실패했습니다.",
      });
    }
  }

  static async logout(req, res) {
    req.session.destroy();
    res.redirect("/");
  }
}

module.exports = AuthController;
