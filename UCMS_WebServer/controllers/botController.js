const PendingAuth = require("../models/pendingAuth");
const User = require("../models/User");
const Member = require("../models/Member");
const Event = require("../models/Event");
const GroupChatRooms = require("../models/GroupChatRooms");
const SettlementParticipants = require("../models/SettlementParticipant");

class BotController {
  static async completeAuth(req, res) {
    try {
      const { authcode, chat_room_id } = req.query;
      const upperAuthcode = authcode
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();

      if (!upperAuthcode || !chat_room_id) {
        return res.json({
          success: false,
          message: "인증코드가 없습니다.",
        });
      }

      const pendingAuth = await PendingAuth.findByAuthCode(
        upperAuthcode
      );

      if (!pendingAuth) {
        return res.json({
          success: false,
          message: "인증 세션이 없습니다.",
        });
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

      await PendingAuth.updateIsCompleted(
        chat_room_id,
        upperAuthcode,
        true
      );

      res.json({
        success: true,
        message: `🤚안녕하세요 ${pendingAuth.name}님🤚\n😊저는 뿡빵이에요😊\n웹페이지에서 인증 확인 버튼을 눌러주세요`,
      });
    } catch (error) {
      console.error("Complete auth error:", error);
      res.json({
        success: false,
        message: "인증 완료에 실패했습니다.",
      });
    }
  }

  static async chatResponse(req, res) {
    const query = req.query;
    const content = query.content;
    const chat_room_id = parseInt(query.chat_room_id);
    const isgroupchat = query.isgroupchat;
    const author = query.author;

    let sender;
    let groupChatRoom;
    let authority = 0;

    console.log(query);

    if (isgroupchat === "true") {
      groupChatRoom = await GroupChatRooms.findById(chat_room_id);
      if (groupChatRoom) {
        authority = groupChatRoom.authority;
      }
    } else {
      sender = await User.findByChatRoomId(chat_room_id);
      if (sender) {
        authority = await Member.getAuthorityByUserId(sender.id);
      }
    }

    let ret = {
      isProcessed: false,
      message: "",
      chat_room_id: chat_room_id,
    };

    if (authority >= 4) {
      ret = await BotController.adminResponse(
        content,
        chat_room_id,
        sender,
        authority,
        author
      );

      if (!ret.isProcessed) {
        ret = await BotController.settingResponse(
          content,
          chat_room_id,
          sender,
          authority,
          author
        );
      }
    }

    if (!ret.isProcessed) {
      ret = await BotController.publicResponse(
        content,
        chat_room_id,
        sender,
        authority,
        author
      );
    }
    console.log(ret.message);

    res.json({
      success: true,
      message: ret.message,
      chat_room_id: parseInt(ret.chat_room_id),
    });
  }

  static async adminResponse(
    content,
    chat_room_id,
    sender,
    authority,
    author
  ) {
    let message;
    let isProcessed = false;

    switch (content) {
      case "명령어":
        message = `제가 아는 명령어 목록은 다음과 같아요😊\n❤️ 안녕: 빵뿡이 인사\n❤️ 명령어: 명령어 목록\n❤️ 일정: 일정 목록\n❤️ 미완료 정산 목록: 미완료 정산 목록\n❤️ 단체 채팅방 목록: 단체 채팅방 목록`;
        message += `\n❤️ 관리방 지정\n❤️ 대화방 지정\n❤️ 공지방 지정\n❤️ 관리방 해제\n❤️ 공지방 해제\n❤️ 대화방 해제`;
        isProcessed = true;
        break;

      case "단체 채팅방 목록":
        const chatRooms = await GroupChatRooms.findAll();
        message = `채팅방 목록🎉\n${chatRooms
          .map((chatRoom) => chatRoom.name)
          .join("\n")}`;

        const managementChatRoom =
          await GroupChatRooms.findByChatRoomName("관리방");

        if (!managementChatRoom) {
          message = `관리방이 없습니다.`;
        }
        isProcessed = true;
        break;
    }

    return { message, chat_room_id, isProcessed };
  }

  static async settingResponse(
    content,
    chat_room_id,
    sender,
    authority,
    author
  ) {
    let message;
    let isProcessed = false;

    // 정규식으로 "채팅방 설정 인증 {인증코드}" 패턴 매칭
    const authMatch = content.match(/^채팅방 설정 인증 ([A-F0-9]+)$/);
    if (authMatch) {
      const extractedAuthCode = authMatch[1];
      const pendingAuth = await BotController.completePendingAuth(
        extractedAuthCode
      );
      message = pendingAuth.message;
      if (pendingAuth.isSuccess) {
        chat_room_id = pendingAuth.chat_room_id;
      }
      isProcessed = true;
    }
    return { message, chat_room_id, isProcessed };
  }

  static async publicResponse(
    content,
    chat_room_id,
    sender,
    authority,
    author
  ) {
    let message;

    // 정규식으로 설정 명령어 패턴 매칭
    const settingMatch = content.match(
      /^(관리방|대화방|공지방) (지정|해제)$/
    );
    if (settingMatch) {
      const roomType = settingMatch[1]; // 관리방, 대화방, 공지방
      const action = settingMatch[2]; // 지정, 해제
      const settingName = `${roomType} ${action}`;

      const authCode = await BotController.generatePendingAuth(
        0,
        settingName,
        chat_room_id
      );
      message = `권한이 있는 사용자가 아래 내용을 복사하여\n개인톡으로 인증을 완료해주세요\n\n!채팅방 설정 인증 ${authCode}`;
      return { message, chat_room_id, isProcessed: true };
    }

    switch (content) {
      case "안녕":
        message = `안녕하세요🤚\n${
          author ? author : ""
        }님😊\n저는 🍞빵뿡이🥖이에요!!\n무엇을 도와드릴까요?`;
        break;

      case "명령어":
        message = `제가 아는 명령어 목록은 다음과 같아요😊\n❤️ 안녕: 빵뿡이 인사\n❤️ 명령어: 명령어 목록\n❤️ 일정: 일정 목록\n❤️ 미완료 정산 목록: 미완료 정산 목록\n`;
        message += `❤️ 인증: 인증 명령어`;
        break;

      case "일정":
        const events = await Event.findByAuthority(authority);
        message = `일정 목록🎉\n${events
          .map((event) => event.title)
          .join("\n")}`;
        break;

      case "미완료 정산 목록":
        const settleRequests = await SettleRequest.findByUserId(
          sender.id ? sender.id : 0
        );

        message = `정산 목록🎉\n${settleRequests
          .map((settleRequest) => settleRequest.name)
          .join("\n")}`;
        break;

      default:
        message = "빵뿡이는 아직 이런거 몰라용❗❗ 👉👈";
        break;
    }

    return { message, chat_room_id, isProcessed: true };
  }

  static async generatePendingAuth(kakao_id, name, chat_room_id) {
    const authCode = Math.random()
      .toString(16)
      .substring(2, 10)
      .toUpperCase();
    const pendingAuth = await PendingAuth.createForBot({
      auth_code: authCode,
      kakao_id: kakao_id,
      name: name,
      chat_room_id: chat_room_id,
    });
    return authCode;
  }

  static async completePendingAuth(authCode) {
    const pendingAuth = await PendingAuth.findByAuthCode(authCode);
    let message = "";
    let isSuccess = false;

    if (!pendingAuth) {
      message = `인증 세션이 없습니다.`;
      return { message, isSuccess };
    } else {
      if (
        new Date(pendingAuth.created_at).getTime() + 5 * 60 * 1000 <
        new Date().getTime()
      ) {
        message = `인증 시간이 만료되었습니다.`;
        await PendingAuth.deleteByAuthCode(authCode);
        return { message, isSuccess };
      } else {
        switch (pendingAuth.name) {
          case "관리방 지정":
            await GroupChatRooms.create(
              "관리방",
              pendingAuth.chat_room_id,
              "임원진"
            );
            message = `관리방 지정 완료🎉 ${pendingAuth.chat_room_id}방을 관리방으로 지정했어요`;
            isSuccess = true;
            break;
          case "대화방 지정":
            await GroupChatRooms.create(
              "대화방",
              pendingAuth.chat_room_id,
              "부원"
            );
            message = `대화방 지정 완료🎉 ${pendingAuth.chat_room_id}방을 대화방으로 지정했어요`;
            isSuccess = true;
            break;
          case "공지방 지정":
            await GroupChatRooms.create(
              "공지방",
              pendingAuth.chat_room_id,
              "부원"
            );
            message = `공지방 지정 완료🎉 ${pendingAuth.chat_room_id}방을 공지방으로 지정했어요`;
            isSuccess = true;
            break;

          case "관리방 해제":
            await GroupChatRooms.delete(pendingAuth.chat_room_id);
            message = `관리방 해제 완료🎉 ${pendingAuth.chat_room_id}방을 관리방에서 해제했어요`;
            isSuccess = true;
            break;
          case "공지방 해제":
            await GroupChatRooms.delete(pendingAuth.chat_room_id);
            message = `공지방 해제 완료🎉 ${pendingAuth.chat_room_id}방을 공지방에서 해제했어요`;
            isSuccess = true;
            break;
          case "대화방 해제":
            await GroupChatRooms.delete(pendingAuth.chat_room_id);
            message = `대화방 해제 완료🎉 ${pendingAuth.chat_room_id}방을 대화방에서 해제했어요`;
            isSuccess = true;
            break;
        }

        await PendingAuth.deleteByAuthCode(authCode);
        return {
          message,
          chat_room_id: pendingAuth.chat_room_id,
          isSuccess,
        };
      }
    }
  }

  static async kakaobankResponse(req, res) {
    const content = req.query.content;
    const title = req.query.title;
    const queryResult = await GroupChatRooms.findByChatRoomName(
      "관리방"
    );
    const chat_room_id = queryResult.id;

    let message = `카카오뱅크 에러 났어요... 👉👈\n내용: ${content}`;
    let isKakaoBank = false;

    const titles = title.split(/\s+/);

    console.log(titles);

    if (titles[0] === "모임통장") {
      isKakaoBank = true;
    } else {
      message = "";
    }

    if (isKakaoBank) {
      const type = titles[1]; // 입금 또는 출금
      const amount = titles[2].split("원")[0];
      const intAmount = parseInt(amount.replace(/,/g, ""));
      const sender = content.split("→")[0].trim();
      const receiver = content.split("→")[1].trim();

      const senderStudent = await Member.findByName(sender);
      const senderStudentId = senderStudent[0].student_id;

      if (type === "입금") {
        console.log(type);
        await SettlementParticipants.updateStatusWithStudentIdAndAmount(
          senderStudentId,
          intAmount,
          "paid"
        );
      }

      message = `모임통장 ${type} 완료🎉\n입금 금액: ${amount}\n보낸 사람: ${sender}\n받은 사람: ${receiver}`;
    }

    res.json({
      success: isKakaoBank,
      message: message,
      chat_room_id: chat_room_id,
    });
  }
}

module.exports = BotController;
