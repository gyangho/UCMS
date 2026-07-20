import { type FormEvent, useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

type BoardName = "notices" | "inquiries" | "faq";

interface BoardPost {
  id: number;
  title: string;
  category?: string | null;
  authorName?: string | null;
  createdAt?: string | null;
  pinned?: boolean;
  status?: string | null;
  content?: string | null;
}

interface BoardComment {
  id: number;
  authorName?: string | null;
  content: string;
  createdAt?: string | null;
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

function BoardListPage({ board, title }: { board: BoardName; title: string }) {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Board pages now call board contract endpoints and intentionally show empty states while schema is missing.
  useEffect(() => {
    let ignore = false;

    async function loadPosts() {
      try {
        const data = await requestData<{ posts: BoardPost[] }>(`/api/boards/${apiBoardName(board)}`);
        if (!ignore) {
          setPosts(data.posts);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "게시글을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadPosts();
    return () => {
      ignore = true;
    };
  }, [board]);

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
      </div>

      {posts.length === 0 ? (
        <EmptyState title="게시글이 없습니다." />
      ) : (
        <div className="board-list">
          {posts.map((post) => (
            <article
              className="board-post clickable-row"
              key={post.id}
              onClick={() => navigate(`/board/${board}/${post.id}`)}
            >
              <h2>{post.title}</h2>
              <dl>
                <div>
                  <dt>분류</dt>
                  <dd>{post.pinned ? "고정" : post.category ?? "-"}</dd>
                </div>
                <div>
                  <dt>작성자</dt>
                  <dd>{post.authorName ?? "-"}</dd>
                </div>
                <div>
                  <dt>작성일</dt>
                  <dd>{post.createdAt ? formatDate(post.createdAt) : "-"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function BoardDetailPage({ board, path }: { board: BoardName; path: string }) {
  const postId = Number(path.split("/").at(-1));
  const [post, setPost] = useState<BoardPost | null>(null);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Detail and comments now verify board API support instead of reading demoBoard.ts.
  useEffect(() => {
    let ignore = false;

    async function loadPost() {
      try {
        const data = await requestData<{ post: BoardPost; comments: BoardComment[] }>(
          `/api/boards/${apiBoardName(board)}/${postId}`
        );
        if (!ignore) {
          setPost(data.post);
          setComments(data.comments);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "게시글을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadPost();
    return () => {
      ignore = true;
    };
  }, [board, postId]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await requestData<{ comment: BoardComment }>(
      `/api/boards/${apiBoardName(board)}/${postId}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ content: comment })
      }
    );
    setComments((currentComments) => [...currentComments, data.comment]);
    setComment("");
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !post) {
    return <ErrorState message={error ?? "게시글을 찾을 수 없습니다."} />;
  }

  return (
    <section className="stack-page">
      <article className="board-detail">
        <div className="page-heading">
          <div>
            <h1>{post.title}</h1>
            <p>{post.authorName ?? "-"} · {post.createdAt ? formatDate(post.createdAt) : "-"}</p>
          </div>
          <button type="button" onClick={() => navigate(`/board/${board}`)}>
            목록
          </button>
        </div>
        <p>{post.content ?? ""}</p>
      </article>

      <section className="data-card">
        <h2>댓글</h2>
        {comments.length === 0 ? (
          <EmptyState title="댓글이 없습니다." />
        ) : (
          <dl>
            {comments.map((item) => (
              <div key={item.id}>
                <dt>{item.authorName ?? "-"} · {item.createdAt ? formatDate(item.createdAt) : "-"}</dt>
                <dd>{item.content}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <form className="form-panel" onSubmit={submitComment}>
        <label>
          댓글
          <textarea value={comment} rows={4} onChange={(event) => setComment(event.target.value)} />
        </label>
        <button type="submit">등록</button>
      </form>
    </section>
  );
}

function apiBoardName(board: BoardName) {
  return board === "faq" ? "faqs" : board;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}
