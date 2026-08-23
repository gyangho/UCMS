const Board = require("../models/Board");
const {
  authorityRank,
  asyncHandler,
  created,
  fail,
  ok,
  toIso,
} = require("../routes/apiRoutes/apiResponse");

const NOTICE_MANAGER_RANK = 3;
const INQUIRY_MEMBER_RANK = 1;
const VISIBILITY_OPTIONS = [
  "미인증",
  "일반",
  "부원",
  "임원진",
  "부회장",
  "회장",
  "admin",
];

function viewerRank(req) {
  const sessionAuthority = req.session?.authority;
  // 2026-07-23: New general users store rank 1 directly; linked members store the 1-based MySQL ENUM position.
  if (typeof sessionAuthority === "number") {
    return sessionAuthority <= 1
      ? Math.max(0, sessionAuthority)
      : sessionAuthority - 1;
  }
  return authorityRank(sessionAuthority);
}

function userId(req) {
  const parsedUserId = Number(req.session?.userId);
  return Number.isInteger(parsedUserId) ? parsedUserId : null;
}

function isOwner(row, req) {
  return Boolean(userId(req)) && Number(row.author_id) === userId(req);
}

function validatePost(body) {
  const title = String(body?.title || "").trim();
  const content = String(body?.content || "").trim();
  if (!title || !content) {
    return { error: "제목과 내용을 모두 입력해 주세요." };
  }
  if (title.length > 255) {
    return { error: "제목은 255자 이하로 입력해 주세요." };
  }
  return { title, content };
}

function validateComment(body) {
  const content = String(body?.content || "").trim();
  if (!content) return { error: "댓글 내용을 입력해 주세요." };
  if (content.length > 65535) {
    return { error: "댓글이 너무 깁니다." };
  }
  return { content };
}

function noticePermissions(req) {
  const canManage = viewerRank(req) >= NOTICE_MANAGER_RANK;
  return { canEdit: canManage, canDelete: canManage };
}

function inquiryPermissions(row, req) {
  const canManage = viewerRank(req) >= NOTICE_MANAGER_RANK || isOwner(row, req);
  return { canEdit: canManage, canDelete: canManage };
}

// 2026-08-24: FAQ entries are public, but executives exclusively manage their lifecycle.
function faqPermissions(req) {
  const canManage = viewerRank(req) >= NOTICE_MANAGER_RANK;
  return { canEdit: canManage, canDelete: canManage };
}

function mapNotice(row, req) {
  return {
    id: Number(row.id),
    title: row.title,
    content: row.content,
    authorId: row.author_id === null ? null : Number(row.author_id),
    authorName: row.author_name,
    minimumAuthority: row.minimum_authority,
    minimumAuthorityRank: authorityRank(row.minimum_authority),
    category: row.minimum_authority,
    pinned: Boolean(row.is_pinned),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...noticePermissions(req),
  };
}

function mapInquiry(row, req) {
  const commentCount = Number(row.comment_count || 0);
  return {
    id: Number(row.id),
    title: row.title,
    content: row.content,
    authorId: row.author_id === null ? null : Number(row.author_id),
    authorName: row.author_name,
    commentCount,
    status: commentCount > 0 ? "answered" : "open",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...inquiryPermissions(row, req),
  };
}

function mapFaq(row, req) {
  return {
    id: Number(row.id),
    title: row.title,
    content: row.content,
    authorId: row.author_id === null ? null : Number(row.author_id),
    authorName: row.author_name,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...faqPermissions(req),
  };
}

function mapComment(row, req) {
  const canManage =
    viewerRank(req) >= NOTICE_MANAGER_RANK || isOwner(row, req);
  return {
    id: Number(row.id),
    authorId: row.author_id === null ? null : Number(row.author_id),
    authorName: row.author_name,
    content: row.content,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    canEdit: canManage,
    canDelete: canManage,
  };
}

async function resolveAuthor(req, res) {
  const currentUserId = userId(req);
  if (!currentUserId) {
    fail(res, 401, "UNAUTHORIZED", "로그인이 필요합니다.");
    return null;
  }
  const author = await Board.getAuthorIdentity(currentUserId);
  if (!author) {
    fail(res, 404, "USER_NOT_FOUND", "사용자 정보를 찾을 수 없습니다.");
    return null;
  }
  return author;
}

// 2026-07-23: Enforce board-specific read and write authority in the API layer.
const listPosts = asyncHandler(async (req, res) => {
  if (req.params.boardType === "notices") {
    const posts = await Board.listNotices(viewerRank(req));
    return ok(res, {
      posts: posts.map((post) => mapNotice(post, req)),
      canCreate: viewerRank(req) >= NOTICE_MANAGER_RANK,
      visibilityOptions:
        viewerRank(req) >= NOTICE_MANAGER_RANK ? VISIBILITY_OPTIONS : [],
    });
  }

  if (req.params.boardType === "inquiries") {
    if (!userId(req)) {
      return fail(res, 401, "UNAUTHORIZED", "로그인이 필요합니다.");
    }
    if (viewerRank(req) < INQUIRY_MEMBER_RANK) {
      return fail(
        res,
        403,
        "FORBIDDEN",
        "일반 이상의 권한이 필요합니다.",
      );
    }
    const posts = await Board.listInquiries();
    return ok(res, {
      posts: posts.map((post) => mapInquiry(post, req)),
      canCreate: true,
      visibilityOptions: [],
    });
  }

  if (req.params.boardType === "faqs") {
    const posts = await Board.listFaqs();
    return ok(res, {
      posts: posts.map((post) => mapFaq(post, req)),
      canCreate: viewerRank(req) >= NOTICE_MANAGER_RANK,
      visibilityOptions: [],
    });
  }
  return fail(res, 404, "BOARD_NOT_FOUND", "게시판을 찾을 수 없습니다.");
});

const createPost = asyncHandler(async (req, res) => {
  const payload = validatePost(req.body);
  if (payload.error) {
    return fail(res, 400, "INVALID_REQUEST", payload.error);
  }

  if (req.params.boardType === "faqs") {
    if (viewerRank(req) < NOTICE_MANAGER_RANK) {
      return fail(res, 403, "FORBIDDEN", "임원진 이상의 권한이 필요합니다.");
    }
    const author = await resolveAuthor(req, res);
    if (!author) return undefined;
    const id = await Board.createFaq({
      ...payload,
      authorId: author.id,
      authorName: author.name,
    });
    return created(res, {
      post: mapFaq(await Board.getFaqById(id), req),
    });
  }

  if (req.params.boardType === "notices") {
    if (viewerRank(req) < NOTICE_MANAGER_RANK) {
      return fail(
        res,
        403,
        "FORBIDDEN",
        "임원진 이상의 권한이 필요합니다.",
      );
    }
    const minimumAuthority = String(
      req.body.minimumAuthority || "부원",
    );
    if (!VISIBILITY_OPTIONS.includes(minimumAuthority)) {
      return fail(
        res,
        400,
        "INVALID_AUTHORITY",
        "올바른 조회 권한을 선택해 주세요.",
      );
    }
    const author = await resolveAuthor(req, res);
    if (!author) return undefined;
    const id = await Board.createNotice({
      ...payload,
      authorId: author.id,
      authorName: author.name,
      minimumAuthority,
      isPinned: Boolean(req.body.pinned),
    });
    return created(res, {
      post: mapNotice(await Board.getNoticeById(id), req),
    });
  }

  if (req.params.boardType === "inquiries") {
    if (viewerRank(req) < INQUIRY_MEMBER_RANK) {
      return fail(
        res,
        403,
        "FORBIDDEN",
        "일반 이상의 권한이 필요합니다.",
      );
    }
    const author = await resolveAuthor(req, res);
    if (!author) return undefined;
    const id = await Board.createInquiry({
      ...payload,
      authorId: author.id,
      authorName: author.name,
    });
    return created(res, {
      post: mapInquiry(await Board.getInquiryById(id), req),
    });
  }

  return fail(res, 404, "BOARD_NOT_FOUND", "게시판을 찾을 수 없습니다.");
});

const getPost = asyncHandler(async (req, res) => {
  if (req.params.boardType === "faqs") {
    const post = await Board.getFaqById(req.params.id);
    if (!post) {
      return fail(res, 404, "NOT_FOUND", "FAQ를 찾을 수 없습니다.");
    }
    return ok(res, {
      post: mapFaq(post, req),
      comments: [],
      canComment: false,
      visibilityOptions: [],
    });
  }

  if (req.params.boardType === "notices") {
    const post = await Board.getNoticeById(req.params.id);
    if (!post) {
      return fail(res, 404, "NOT_FOUND", "공지사항을 찾을 수 없습니다.");
    }
    if (viewerRank(req) < authorityRank(post.minimum_authority)) {
      return fail(res, 403, "FORBIDDEN", "공지사항 조회 권한이 없습니다.");
    }
    return ok(res, {
      post: mapNotice(post, req),
      comments: [],
      canComment: false,
      visibilityOptions:
        viewerRank(req) >= NOTICE_MANAGER_RANK ? VISIBILITY_OPTIONS : [],
    });
  }

  if (req.params.boardType === "inquiries") {
    if (!userId(req)) {
      return fail(res, 401, "UNAUTHORIZED", "로그인이 필요합니다.");
    }
    if (viewerRank(req) < INQUIRY_MEMBER_RANK) {
      return fail(
        res,
        403,
        "FORBIDDEN",
        "일반 이상의 권한이 필요합니다.",
      );
    }
    const post = await Board.getInquiryById(req.params.id);
    if (!post) {
      return fail(res, 404, "NOT_FOUND", "문의 글을 찾을 수 없습니다.");
    }
    const comments = await Board.listInquiryComments(req.params.id);
    return ok(res, {
      post: mapInquiry(post, req),
      comments: comments.map((comment) => mapComment(comment, req)),
      canComment:
        viewerRank(req) >= NOTICE_MANAGER_RANK || isOwner(post, req),
      visibilityOptions: [],
    });
  }

  return fail(res, 404, "BOARD_NOT_FOUND", "게시판을 찾을 수 없습니다.");
});

const updatePost = asyncHandler(async (req, res) => {
  const payload = validatePost(req.body);
  if (payload.error) {
    return fail(res, 400, "INVALID_REQUEST", payload.error);
  }

  if (req.params.boardType === "faqs") {
    if (viewerRank(req) < NOTICE_MANAGER_RANK) {
      return fail(res, 403, "FORBIDDEN", "임원진 이상의 권한이 필요합니다.");
    }
    const post = await Board.getFaqById(req.params.id);
    if (!post) {
      return fail(res, 404, "NOT_FOUND", "FAQ를 찾을 수 없습니다.");
    }
    await Board.updateFaq(post.id, payload);
    return ok(res, {
      post: mapFaq(await Board.getFaqById(post.id), req),
    });
  }

  if (req.params.boardType === "notices") {
    if (viewerRank(req) < NOTICE_MANAGER_RANK) {
      return fail(
        res,
        403,
        "FORBIDDEN",
        "임원진 이상의 권한이 필요합니다.",
      );
    }
    const post = await Board.getNoticeById(req.params.id);
    if (!post) {
      return fail(res, 404, "NOT_FOUND", "공지사항을 찾을 수 없습니다.");
    }
    const minimumAuthority = String(
      req.body.minimumAuthority || post.minimum_authority,
    );
    if (!VISIBILITY_OPTIONS.includes(minimumAuthority)) {
      return fail(
        res,
        400,
        "INVALID_AUTHORITY",
        "올바른 조회 권한을 선택해 주세요.",
      );
    }
    await Board.updateNotice(post.id, {
      ...payload,
      minimumAuthority,
      isPinned: Boolean(req.body.pinned),
    });
    return ok(res, {
      post: mapNotice(await Board.getNoticeById(post.id), req),
    });
  }

  if (req.params.boardType === "inquiries") {
    const post = await Board.getInquiryById(req.params.id);
    if (!post) {
      return fail(res, 404, "NOT_FOUND", "문의 글을 찾을 수 없습니다.");
    }
    if (
      viewerRank(req) < NOTICE_MANAGER_RANK &&
      !isOwner(post, req)
    ) {
      return fail(res, 403, "FORBIDDEN", "문의 글 수정 권한이 없습니다.");
    }
    await Board.updateInquiry(post.id, payload);
    return ok(res, {
      post: mapInquiry(await Board.getInquiryById(post.id), req),
    });
  }

  return fail(res, 404, "BOARD_NOT_FOUND", "게시판을 찾을 수 없습니다.");
});

const deletePost = asyncHandler(async (req, res) => {
  if (req.params.boardType === "faqs") {
    if (viewerRank(req) < NOTICE_MANAGER_RANK) {
      return fail(res, 403, "FORBIDDEN", "임원진 이상의 권한이 필요합니다.");
    }
    const deleted = await Board.deleteFaq(req.params.id);
    if (!deleted) {
      return fail(res, 404, "NOT_FOUND", "FAQ를 찾을 수 없습니다.");
    }
    return ok(res, { message: "FAQ가 삭제되었습니다." });
  }

  if (req.params.boardType === "notices") {
    if (viewerRank(req) < NOTICE_MANAGER_RANK) {
      return fail(
        res,
        403,
        "FORBIDDEN",
        "임원진 이상의 권한이 필요합니다.",
      );
    }
    const deleted = await Board.deleteNotice(req.params.id);
    if (!deleted) {
      return fail(res, 404, "NOT_FOUND", "공지사항을 찾을 수 없습니다.");
    }
    return ok(res, { message: "공지사항을 삭제했습니다." });
  }

  if (req.params.boardType === "inquiries") {
    const post = await Board.getInquiryById(req.params.id);
    if (!post) {
      return fail(res, 404, "NOT_FOUND", "문의 글을 찾을 수 없습니다.");
    }
    if (
      viewerRank(req) < NOTICE_MANAGER_RANK &&
      !isOwner(post, req)
    ) {
      return fail(res, 403, "FORBIDDEN", "문의 글 삭제 권한이 없습니다.");
    }
    await Board.deleteInquiry(post.id);
    return ok(res, { message: "문의 글을 삭제했습니다." });
  }

  return fail(res, 404, "BOARD_NOT_FOUND", "게시판을 찾을 수 없습니다.");
});

const createComment = asyncHandler(async (req, res) => {
  if (req.params.boardType !== "inquiries") {
    return fail(res, 405, "COMMENTS_NOT_ALLOWED", "댓글을 작성할 수 없습니다.");
  }
  const post = await Board.getInquiryById(req.params.id);
  if (!post) {
    return fail(res, 404, "NOT_FOUND", "문의 글을 찾을 수 없습니다.");
  }
  if (
    viewerRank(req) < NOTICE_MANAGER_RANK &&
    !isOwner(post, req)
  ) {
    return fail(
      res,
      403,
      "FORBIDDEN",
      "문의 작성자 또는 임원진만 댓글을 작성할 수 있습니다.",
    );
  }
  const payload = validateComment(req.body);
  if (payload.error) {
    return fail(res, 400, "INVALID_REQUEST", payload.error);
  }
  const author = await resolveAuthor(req, res);
  if (!author) return undefined;
  const id = await Board.createInquiryComment({
    inquiryId: post.id,
    authorId: author.id,
    authorName: author.name,
    content: payload.content,
  });
  return created(res, {
    comment: mapComment(await Board.getInquiryCommentById(id), req),
  });
});

const updateComment = asyncHandler(async (req, res) => {
  if (req.params.boardType !== "inquiries") {
    return fail(res, 405, "COMMENTS_NOT_ALLOWED", "댓글을 수정할 수 없습니다.");
  }
  const comment = await Board.getInquiryCommentById(req.params.commentId);
  if (!comment || Number(comment.inquiry_id) !== Number(req.params.id)) {
    return fail(res, 404, "NOT_FOUND", "댓글을 찾을 수 없습니다.");
  }
  if (
    viewerRank(req) < NOTICE_MANAGER_RANK &&
    !isOwner(comment, req)
  ) {
    return fail(res, 403, "FORBIDDEN", "댓글 수정 권한이 없습니다.");
  }
  const payload = validateComment(req.body);
  if (payload.error) {
    return fail(res, 400, "INVALID_REQUEST", payload.error);
  }
  await Board.updateInquiryComment(comment.id, payload.content);
  return ok(res, {
    comment: mapComment(
      await Board.getInquiryCommentById(comment.id),
      req,
    ),
  });
});

const deleteComment = asyncHandler(async (req, res) => {
  if (req.params.boardType !== "inquiries") {
    return fail(res, 405, "COMMENTS_NOT_ALLOWED", "댓글을 삭제할 수 없습니다.");
  }
  const comment = await Board.getInquiryCommentById(req.params.commentId);
  if (!comment || Number(comment.inquiry_id) !== Number(req.params.id)) {
    return fail(res, 404, "NOT_FOUND", "댓글을 찾을 수 없습니다.");
  }
  if (
    viewerRank(req) < NOTICE_MANAGER_RANK &&
    !isOwner(comment, req)
  ) {
    return fail(res, 403, "FORBIDDEN", "댓글 삭제 권한이 없습니다.");
  }
  await Board.deleteInquiryComment(comment.id);
  return ok(res, { message: "댓글을 삭제했습니다." });
});

module.exports = {
  createComment,
  createPost,
  deleteComment,
  deletePost,
  getPost,
  listPosts,
  updateComment,
  updatePost,
};
