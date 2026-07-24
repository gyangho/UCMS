import {
  type FormEvent,
  useCallback,
  useEffect,
  useState
} from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

type BoardName = "notices" | "inquiries" | "faq";

interface BoardPost {
  id: number;
  title: string;
  content: string;
  authorId?: number | null;
  authorName?: string | null;
  minimumAuthority?: string | null;
  pinned?: boolean;
  status?: "open" | "answered" | string | null;
  commentCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  canEdit?: boolean;
  canDelete?: boolean;
}

interface BoardComment {
  id: number;
  authorName?: string | null;
  content: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  canEdit?: boolean;
  canDelete?: boolean;
}

interface BoardListResponse {
  posts: BoardPost[];
  canCreate: boolean;
  visibilityOptions: string[];
}

interface BoardDetailResponse {
  post: BoardPost;
  comments: BoardComment[];
  canComment: boolean;
  visibilityOptions: string[];
}

interface BoardFormValue {
  title: string;
  content: string;
  minimumAuthority?: string;
  pinned?: boolean;
}

// 2026-07-23: 미인증 사용자도 읽을 수 있는 공지는 권한 문구 대신 '전체'로 표시합니다.
function formatNoticeAuthority(authority?: string | null) {
  const label = authority ?? "부원";
  return label === "미인증" ? "전체" : `${label} 이상`;
}

export function NoticeBoardPage() {
  return <BoardListPage board="notices" title="공지사항" />;
}

export function InquiryBoardPage() {
  return <BoardListPage board="inquiries" title="문의 게시판" />;
}

export function FaqBoardPage() {
  return <BoardListPage board="faq" title="FAQ" />;
}

// 2026-07-23: Provide schema-backed list and creation flows for notices and inquiries.
function BoardListPage({ board, title }: { board: BoardName; title: string }) {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [visibilityOptions, setVisibilityOptions] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestData<BoardListResponse>(
        `/api/boards/${apiBoardName(board)}`
      );
      setPosts(data.posts ?? []);
      setCanCreate(Boolean(data.canCreate));
      setVisibilityOptions(data.visibilityOptions ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "게시글을 불러오지 못했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, [board]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  async function createPost(value: BoardFormValue) {
    setIsSaving(true);
    setActionError(null);
    try {
      await requestData<{ post: BoardPost }>(
        `/api/boards/${apiBoardName(board)}`,
        {
          method: "POST",
          body: JSON.stringify(value)
        }
      );
      setIsCreating(false);
      await loadPosts();
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : "게시글을 등록하지 못했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <section className="stack-page">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
        </div>
        {canCreate ? (
          <div className="toolbar">
            <button type="button" onClick={() => setIsCreating(true)}>
              글 작성
            </button>
          </div>
        ) : null}
      </div>

      {isCreating ? (
        <BoardPostForm
          board={board}
          isSaving={isSaving}
          visibilityOptions={visibilityOptions}
          onCancel={() => {
            setIsCreating(false);
            setActionError(null);
          }}
          onSubmit={createPost}
        />
      ) : null}

      {actionError ? <p className="inline-error">{actionError}</p> : null}

      {posts.length === 0 ? (
        <EmptyState title="게시글이 없습니다." />
      ) : (
        <div className="board-list">
          {posts.map((post) => (
            <article
              className={`board-post clickable-row ${
                board === "notices" ? "notice-board-post" : ""
              }`}
              key={post.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/board/${board}/${post.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  navigate(`/board/${board}/${post.id}`);
                }
              }}
            >
              {board === "notices" ? (
                <span
                  aria-label={post.pinned ? "고정 공지" : undefined}
                  className="notice-board-pin"
                >
                  {post.pinned ? "📌" : ""}
                </span>
              ) : null}
              <div>
                <div className="board-post-badges">
                  {board === "inquiries" ? (
                    <span
                      className={
                        post.status === "answered"
                          ? "status-pill completed"
                          : "status-pill"
                      }
                    >
                      {post.status === "answered" ? "답변 있음" : "답변 대기"}
                    </span>
                  ) : null}
                </div>
                <h2>{post.title}</h2>
                <p className="board-content-preview">{post.content}</p>
              </div>
              <dl>
                <div>
                  <dt>작성자</dt>
                  <dd>{post.authorName ?? "-"}</dd>
                </div>
                <div>
                  <dt>수정일</dt>
                  <dd>{formatDateTime(post.updatedAt ?? post.createdAt)}</dd>
                </div>
                {board === "inquiries" ? (
                  <div>
                    <dt>댓글</dt>
                    <dd>{post.commentCount ?? 0}개</dd>
                  </div>
                ) : null}
              </dl>
              {board === "notices" ? (
                <span className="notice-read-authority">
                  <small>읽기 권한</small>
                  <strong>
                    {formatNoticeAuthority(post.minimumAuthority)}
                  </strong>
                </span>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// 2026-07-23: Detail pages expose server-approved edit, delete, and inquiry-answer actions.
export function BoardDetailPage({
  board,
  path
}: {
  board: BoardName;
  path: string;
}) {
  const postId = Number(path.split("/").at(-1));
  const [post, setPost] = useState<BoardPost | null>(null);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [canComment, setCanComment] = useState(false);
  const [visibilityOptions, setVisibilityOptions] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommentSaving, setIsCommentSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPost = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestData<BoardDetailResponse>(
        `/api/boards/${apiBoardName(board)}/${postId}`
      );
      setPost(data.post);
      setComments(data.comments ?? []);
      setCanComment(Boolean(data.canComment));
      setVisibilityOptions(data.visibilityOptions ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "게시글을 불러오지 못했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, [board, postId]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  async function updatePost(value: BoardFormValue) {
    setIsSaving(true);
    setActionError(null);
    try {
      const data = await requestData<{ post: BoardPost }>(
        `/api/boards/${apiBoardName(board)}/${postId}`,
        {
          method: "PUT",
          body: JSON.stringify(value)
        }
      );
      setPost(data.post);
      setIsEditing(false);
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : "게시글을 수정하지 못했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deletePost() {
    if (!window.confirm("이 게시글을 삭제하시겠습니까?")) return;
    setActionError(null);
    try {
      await requestData<{ message: string }>(
        `/api/boards/${apiBoardName(board)}/${postId}`,
        { method: "DELETE" }
      );
      navigate(`/board/${board}`);
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "게시글을 삭제하지 못했습니다."
      );
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    setIsCommentSaving(true);
    setActionError(null);
    try {
      const data = await requestData<{ comment: BoardComment }>(
        `/api/boards/${apiBoardName(board)}/${postId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content: comment })
        }
      );
      setComments((currentComments) => [...currentComments, data.comment]);
      setComment("");
      setPost((currentPost) =>
        currentPost
          ? {
              ...currentPost,
              commentCount: (currentPost.commentCount ?? 0) + 1,
              status: "answered"
            }
          : currentPost
      );
    } catch (commentError) {
      setActionError(
        commentError instanceof Error
          ? commentError.message
          : "댓글을 등록하지 못했습니다."
      );
    } finally {
      setIsCommentSaving(false);
    }
  }

  async function editComment(item: BoardComment) {
    const nextContent = window.prompt("수정할 댓글을 입력해 주세요.", item.content);
    if (nextContent === null || !nextContent.trim()) return;
    setActionError(null);
    try {
      const data = await requestData<{ comment: BoardComment }>(
        `/api/boards/${apiBoardName(board)}/${postId}/comments/${item.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ content: nextContent })
        }
      );
      setComments((currentComments) =>
        currentComments.map((current) =>
          current.id === item.id ? data.comment : current
        )
      );
    } catch (commentError) {
      setActionError(
        commentError instanceof Error
          ? commentError.message
          : "댓글을 수정하지 못했습니다."
      );
    }
  }

  async function deleteComment(item: BoardComment) {
    if (!window.confirm("이 댓글을 삭제하시겠습니까?")) return;
    setActionError(null);
    try {
      await requestData<{ message: string }>(
        `/api/boards/${apiBoardName(board)}/${postId}/comments/${item.id}`,
        { method: "DELETE" }
      );
      setComments((currentComments) =>
        currentComments.filter((current) => current.id !== item.id)
      );
    } catch (commentError) {
      setActionError(
        commentError instanceof Error
          ? commentError.message
          : "댓글을 삭제하지 못했습니다."
      );
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !post) {
    return <ErrorState message={error ?? "게시글을 찾을 수 없습니다."} />;
  }

  return (
    <section className="stack-page">
      <div className="page-heading">
        <div>
          <h1>{post.title}</h1>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => navigate(`/board/${board}`)}>
            목록
          </button>
          {post.canEdit ? (
            <button type="button" onClick={() => setIsEditing(true)}>
              수정
            </button>
          ) : null}
          {post.canDelete ? (
            <button className="danger-button" type="button" onClick={deletePost}>
              삭제
            </button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <BoardPostForm
          board={board}
          initialPost={post}
          isSaving={isSaving}
          visibilityOptions={visibilityOptions}
          onCancel={() => {
            setIsEditing(false);
            setActionError(null);
          }}
          onSubmit={updatePost}
        />
      ) : (
        <article className="board-detail">
          <dl>
            <div>
              <dt>작성자</dt>
              <dd>{post.authorName ?? "-"}</dd>
            </div>
            <div>
              <dt>작성일</dt>
              <dd>{formatDateTime(post.createdAt)}</dd>
            </div>
            <div>
              <dt>최종 수정</dt>
              <dd>{formatDateTime(post.updatedAt)}</dd>
            </div>
            {board === "notices" ? (
              <div>
                <dt>조회 권한</dt>
                <dd>{formatNoticeAuthority(post.minimumAuthority)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="board-detail-content">{post.content}</p>
        </article>
      )}

      {actionError ? <p className="inline-error">{actionError}</p> : null}

      {board === "inquiries" ? (
        <>
          <section className="comments-panel">
            <h2>답변 및 댓글</h2>
            {comments.length === 0 ? (
              <EmptyState title="등록된 댓글이 없습니다." />
            ) : (
              <div className="comment-list">
                {comments.map((item) => (
                  <article className="comment-item" key={item.id}>
                    <div>
                      <span>
                        <strong>{item.authorName ?? "-"}</strong>
                        {" · "}
                        {formatDateTime(item.updatedAt ?? item.createdAt)}
                      </span>
                      <div className="comment-actions">
                        {item.canEdit ? (
                          <button type="button" onClick={() => editComment(item)}>
                            수정
                          </button>
                        ) : null}
                        {item.canDelete ? (
                          <button
                            className="danger-button"
                            type="button"
                            onClick={() => deleteComment(item)}
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p>{item.content}</p>
                  </article>
                ))}
              </div>
            )}

            {canComment ? (
              <form className="comment-form" onSubmit={submitComment}>
                <label htmlFor="board-comment">댓글 작성</label>
                <textarea
                  id="board-comment"
                  value={comment}
                  rows={4}
                  onChange={(event) => setComment(event.target.value)}
                />
                <button disabled={isCommentSaving} type="submit">
                  {isCommentSaving ? "등록 중..." : "댓글 등록"}
                </button>
              </form>
            ) : (
              <p className="board-permission-note">
                문의 작성자 또는 임원진 이상만 댓글을 작성할 수 있습니다.
              </p>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function BoardPostForm({
  board,
  initialPost,
  isSaving,
  visibilityOptions,
  onCancel,
  onSubmit
}: {
  board: BoardName;
  initialPost?: BoardPost;
  isSaving: boolean;
  visibilityOptions: string[];
  onCancel: () => void;
  onSubmit: (value: BoardFormValue) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialPost?.title ?? "");
  const [content, setContent] = useState(initialPost?.content ?? "");
  const [minimumAuthority, setMinimumAuthority] = useState(
    initialPost?.minimumAuthority ?? "부원"
  );
  const [pinned, setPinned] = useState(Boolean(initialPost?.pinned));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      title,
      content,
      ...(board === "notices" ? { minimumAuthority, pinned } : {})
    });
  }

  return (
    <form className="form-panel board-post-form" onSubmit={submit}>
      <h2>{initialPost ? "게시글 수정" : "새 게시글 작성"}</h2>
      <label>
        제목
        <input
          required
          maxLength={255}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        내용
        <textarea
          required
          rows={10}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </label>
      {board === "notices" ? (
        <div className="board-form-options">
          <label>
            최소 조회 권한
            <select
              value={minimumAuthority}
              onChange={(event) => setMinimumAuthority(event.target.value)}
            >
              {visibilityOptions.map((option) => (
                <option key={option} value={option}>
                  {option} 이상
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label board-checkbox">
            <input
              checked={pinned}
              type="checkbox"
              onChange={(event) => setPinned(event.target.checked)}
            />
            상단에 고정
          </label>
        </div>
      ) : null}
      <div className="toolbar">
        <button className="secondary-button" type="button" onClick={onCancel}>
          취소
        </button>
        <button disabled={isSaving} type="submit">
          {isSaving ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}

function apiBoardName(board: BoardName) {
  return board === "faq" ? "faqs" : board;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
