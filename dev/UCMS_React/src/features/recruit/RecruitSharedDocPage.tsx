import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiError, requestData } from "../../shared/api/http";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

const RATINGS = [
  "대기",
  "1차합격",
  "느별",
  "느괜",
  "느좋",
  "최종합격",
  "불합격",
];

type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

interface Applicant {
  responseId: number;
  documentId: string;
  formId: string;
  name: string;
  studentId?: string | null;
  major?: string | null;
  phone?: string | null;
  email?: string | null;
  rating?: string | null;
  formTitle?: string | null;
}

interface Answer {
  questionId?: number | string | null;
  question: string;
  answer: string;
}

interface EvaluationSocketMessage {
  type: string;
  docId?: string;
  formId?: string;
  content?: string;
  version?: number;
  lineNumber?: number;
  message?: string;
  status?: "locked" | "unlocked";
  clientId?: string | null;
}

interface EvaluationSocketTicket {
  ticket: string;
  expiresAt: string;
  documentId: string;
  formId: string;
}

function getEvaluationClientId() {
  const storageKey = "ucms_evaluation_client_id";
  const stored = window.sessionStorage.getItem(storageKey);
  if (stored) return stored;
  const created = `client_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
  window.sessionStorage.setItem(storageKey, created);
  return created;
}

function getEvaluationSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/sharedb`;
}

function getLineNumber(value: string, selectionStart: number) {
  return value.slice(0, selectionStart).split("\n").length - 1;
}

// 2026-07-23: Port the legacy EJS ShareDB protocol to React with subscriptions,
// line locks, version conflict recovery, and automatic reconnection.
function useEvaluationNote(
  responseId: number | null,
  documentId: string | null,
  formId: string | null,
) {
  const [content, setContent] = useState("");
  const [version, setVersion] = useState(1);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [isReady, setIsReady] = useState(false);
  const [syncMessage, setSyncMessage] = useState(
    "공유 문서 서버에 연결하는 중입니다.",
  );

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const contentRef = useRef("");
  const versionRef = useRef(1);
  const currentLineRef = useRef(0);
  const previousLineRef = useRef(0);
  const myLockedLinesRef = useRef(new Set<number>());
  const lockedLinesRef = useRef(new Map<number, string | null>());
  const updateTimerRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const applyRemoteContent = useCallback((nextContent: string) => {
    const editor = editorRef.current;
    const selectionStart = editor?.selectionStart ?? 0;
    const selectionEnd = editor?.selectionEnd ?? selectionStart;

    contentRef.current = nextContent;
    setContent(nextContent);

    if (editor) {
      window.requestAnimationFrame(() => {
        const nextLength = nextContent.length;
        editor.setSelectionRange(
          Math.min(selectionStart, nextLength),
          Math.min(selectionEnd, nextLength),
        );
      });
    }
  }, []);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(
      JSON.stringify({
        ...message,
        clientId: getEvaluationClientId(),
        timestamp: Date.now(),
      }),
    );
    return true;
  }, []);

  const requestLatestDocument = useCallback(() => {
    if (!documentId || !formId) return;
    sendMessage({ type: "get", docId: documentId, formId });
  }, [documentId, formId, sendMessage]);

  const requestLineLock = useCallback(
    (lineNumber: number) => {
      if (!documentId || !formId || myLockedLinesRef.current.has(lineNumber)) {
        return;
      }
      sendMessage({
        type: "lock-line",
        docId: documentId,
        formId,
        lineNumber,
      });
    },
    [documentId, formId, sendMessage],
  );

  const releaseLineLock = useCallback(
    (lineNumber: number) => {
      if (!documentId || !formId) return;
      sendMessage({
        type: "unlock-line",
        docId: documentId,
        formId,
        lineNumber,
      });
    },
    [documentId, formId, sendMessage],
  );

  const releaseAllLineLocks = useCallback(() => {
    myLockedLinesRef.current.forEach((lineNumber) => {
      releaseLineLock(lineNumber);
    });
    myLockedLinesRef.current.clear();
  }, [releaseLineLock]);

  const updateVersionAfterSend = useCallback(
    (message: Record<string, unknown>) => {
      const nextVersion = versionRef.current + 1;
      if (!sendMessage({ ...message, version: nextVersion })) return;
      versionRef.current = nextVersion;
      setVersion(nextVersion);
      setSyncMessage("변경 내용을 실시간으로 동기화했습니다.");
    },
    [sendMessage],
  );

  const sendFullUpdate = useCallback(
    (nextContent: string) => {
      if (!documentId || !formId) return;
      updateVersionAfterSend({
        type: "update",
        docId: documentId,
        formId,
        content: nextContent,
      });
    },
    [documentId, formId, updateVersionAfterSend],
  );

  const sendLineUpdate = useCallback(
    (lineNumber: number, nextContent: string) => {
      if (!documentId || !formId) return;
      updateVersionAfterSend({
        type: "update-line",
        docId: documentId,
        formId,
        lineNumber,
        content: nextContent.split("\n")[lineNumber] ?? "",
      });
    },
    [documentId, formId, updateVersionAfterSend],
  );

  useEffect(() => {
    if (!responseId || !documentId || !formId) return;

    let disposed = false;
    setContent("");
    contentRef.current = "";
    setVersion(1);
    versionRef.current = 1;
    setIsReady(false);
    setConnectionStatus("connecting");
    setSyncMessage("공유 문서 서버에 연결하는 중입니다.");

    // 2026-08-19: Obtain a fresh document-scoped ticket before every initial or reconnecting WebSocket session.
    async function connect() {
      if (disposed) return;
      setConnectionStatus((current) =>
        current === "connected" ? "reconnecting" : current,
      );

      let credential: EvaluationSocketTicket;
      try {
        credential = await requestData<EvaluationSocketTicket>(
          `/api/recruit/responses/${responseId}/shared-document/ticket`,
          { method: "POST" },
        );
      } catch (error) {
        if (disposed) return;
        setConnectionStatus("error");
        setSyncMessage("공유 문서 인증 정보를 발급받지 못했습니다.");
        if (!(error instanceof ApiError) || error.status >= 500) {
          reconnectTimerRef.current = window.setTimeout(connect, 3000);
        }
        return;
      }

      if (
        credential.documentId !== documentId ||
        credential.formId !== formId ||
        disposed
      ) {
        setConnectionStatus("error");
        setSyncMessage("공유 문서 인증 범위가 일치하지 않습니다.");
        return;
      }

      const socket = new WebSocket(getEvaluationSocketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        setSyncMessage("공유 문서 연결을 인증하는 중입니다.");
        sendMessage({ type: "authenticate", ticket: credential.ticket });
      };

      socket.onmessage = (event) => {
        let data: EvaluationSocketMessage;
        try {
          data = JSON.parse(String(event.data)) as EvaluationSocketMessage;
        } catch {
          setSyncMessage("공유 문서 서버의 응답을 해석하지 못했습니다.");
          return;
        }
        if (data.docId && data.docId !== documentId) return;

        switch (data.type) {
          case "authenticated": {
            setConnectionStatus("connected");
            setSyncMessage("평가 노트를 불러오는 중입니다.");
            sendMessage({ type: "subscribe", docId: documentId, formId });
            sendMessage({ type: "get", docId: documentId, formId });
            break;
          }
          case "doc": {
            applyRemoteContent(data.content ?? "");
            const nextVersion = Number(data.version || 1);
            versionRef.current = nextVersion;
            setVersion(nextVersion);
            setIsReady(true);
            setSyncMessage("실시간 공유가 연결되었습니다.");
            break;
          }
          case "update": {
            applyRemoteContent(data.content ?? "");
            const nextVersion = Number(data.version || versionRef.current);
            versionRef.current = nextVersion;
            setVersion(nextVersion);
            setSyncMessage("다른 면접관의 변경 내용을 반영했습니다.");
            break;
          }
          case "line-updated": {
            const lineNumber = Number(data.lineNumber);
            if (!Number.isInteger(lineNumber) || lineNumber < 0) break;
            const lines = contentRef.current.split("\n");
            while (lines.length <= lineNumber) lines.push("");
            lines[lineNumber] = data.content ?? "";
            applyRemoteContent(lines.join("\n"));
            const nextVersion = Number(data.version || versionRef.current);
            versionRef.current = nextVersion;
            setVersion(nextVersion);
            setSyncMessage("다른 면접관의 변경 내용을 반영했습니다.");
            break;
          }
          case "lock-success": {
            const lineNumber = Number(data.lineNumber);
            myLockedLinesRef.current.add(lineNumber);
            lockedLinesRef.current.delete(lineNumber);
            setSyncMessage(`${lineNumber + 1}번째 줄을 편집 중입니다.`);
            break;
          }
          case "lock-failed":
          case "update-failed":
            setSyncMessage(
              data.message ?? "다른 면접관이 해당 줄을 편집 중입니다.",
            );
            requestLatestDocument();
            break;
          case "unlock-success": {
            const lineNumber = Number(data.lineNumber);
            myLockedLinesRef.current.delete(lineNumber);
            lockedLinesRef.current.delete(lineNumber);
            break;
          }
          case "lock-status": {
            const lineNumber = Number(data.lineNumber);
            if (data.status === "locked") {
              if (!myLockedLinesRef.current.has(lineNumber)) {
                lockedLinesRef.current.set(
                  lineNumber,
                  data.clientId ?? null,
                );
              }
            } else {
              lockedLinesRef.current.delete(lineNumber);
            }
            break;
          }
          case "conflict": {
            applyRemoteContent(data.content ?? "");
            const nextVersion = Number(data.version || 1);
            versionRef.current = nextVersion;
            setVersion(nextVersion);
            setSyncMessage(
              data.message ??
                "동시 수정 충돌이 발생해 최신 내용을 적용했습니다.",
            );
            break;
          }
          default:
            break;
        }
      };

      socket.onerror = () => {
        if (disposed) return;
        setConnectionStatus("error");
        setSyncMessage("공유 문서 서버에 연결하지 못했습니다.");
      };

      socket.onclose = (event) => {
        if (disposed) return;
        if (socketRef.current === socket) socketRef.current = null;
        myLockedLinesRef.current.clear();
        lockedLinesRef.current.clear();
        setIsReady(false);
        if (event.code === 4403) {
          setConnectionStatus("error");
          setSyncMessage("공유 문서 인증 또는 접근 범위가 거부되었습니다.");
          return;
        }
        setConnectionStatus("reconnecting");
        setSyncMessage("연결이 끊어져 3초 후 다시 연결합니다.");
        reconnectTimerRef.current = window.setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (updateTimerRef.current !== null) {
        window.clearTimeout(updateTimerRef.current);
      }
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      releaseAllLineLocks();
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "unsubscribe",
            docId: documentId,
            formId,
          }),
        );
      }
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, [
    applyRemoteContent,
    documentId,
    formId,
    responseId,
    releaseAllLineLocks,
    requestLatestDocument,
    sendMessage,
  ]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (!isReady) return;
      const previousContent = contentRef.current;
      const nextContent = event.target.value;
      const nextLine = getLineNumber(
        nextContent,
        event.target.selectionStart,
      );

      contentRef.current = nextContent;
      setContent(nextContent);
      currentLineRef.current = nextLine;

      if (!myLockedLinesRef.current.has(nextLine)) {
        requestLineLock(nextLine);
      }

      if (updateTimerRef.current !== null) {
        window.clearTimeout(updateTimerRef.current);
      }
      updateTimerRef.current = window.setTimeout(() => {
        const previousLineCount = previousContent.split("\n").length;
        const nextLineCount = nextContent.split("\n").length;
        if (previousLineCount !== nextLineCount) {
          sendFullUpdate(nextContent);
        } else {
          sendLineUpdate(nextLine, nextContent);
        }
      }, 500);

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(
        requestLatestDocument,
        1200,
      );
    },
    [
      isReady,
      requestLatestDocument,
      requestLineLock,
      sendFullUpdate,
      sendLineUpdate,
    ],
  );

  const handleCaretMove = useCallback(
    (textarea: HTMLTextAreaElement) => {
      const nextLine = getLineNumber(textarea.value, textarea.selectionStart);
      currentLineRef.current = nextLine;

      if (
        nextLine !== previousLineRef.current &&
        myLockedLinesRef.current.has(previousLineRef.current)
      ) {
        releaseLineLock(previousLineRef.current);
      }

      if (lockedLinesRef.current.has(nextLine)) {
        setSyncMessage(`${nextLine + 1}번째 줄은 다른 면접관이 편집 중입니다.`);
      } else if (!myLockedLinesRef.current.has(nextLine)) {
        requestLineLock(nextLine);
      }
      previousLineRef.current = nextLine;
    },
    [releaseLineLock, requestLineLock],
  );

  return {
    connectionStatus,
    content,
    editorRef,
    handleBlur: releaseAllLineLocks,
    handleCaretMove,
    handleChange,
    isReady,
    requestLineLock,
    syncMessage,
    version,
  };
}

export function RecruitSharedDocPage({ path }: { path: string }) {
  const responseId = Number(path.split("/").at(-1));
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    connectionStatus,
    content: evaluationContent,
    editorRef: evaluationEditorRef,
    handleBlur: handleEvaluationBlur,
    handleCaretMove,
    handleChange: handleEvaluationChange,
    isReady: isEvaluationReady,
    requestLineLock,
    syncMessage,
    version: evaluationVersion,
  } = useEvaluationNote(
    applicant?.responseId ?? null,
    applicant?.documentId ?? null,
    applicant?.formId ?? null,
  );

  useEffect(() => {
    let ignore = false;
    async function loadDetail() {
      try {
        const detailData = await requestData<{
          applicant: Applicant;
          responses: Answer[];
        }>(`/api/recruit/responses/${responseId}`);
        if (!ignore) {
          setApplicant(detailData.applicant);
          setAnswers(detailData.responses ?? []);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "지원자 상세를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    loadDetail();
    return () => {
      ignore = true;
    };
  }, [responseId]);

  async function updateRating(rating: string) {
    if (!applicant) return;
    const previous = applicant.rating;
    setActionError(null);
    setApplicant({ ...applicant, rating });
    try {
      await requestData<{ id: number }>(
        `/api/recruit/responses/${responseId}/rating`,
        {
          method: "PATCH",
          body: JSON.stringify({ rating }),
        },
      );
    } catch (ratingError) {
      setApplicant((current) =>
        current ? { ...current, rating: previous } : current,
      );
      setActionError(
        ratingError instanceof Error
          ? ratingError.message
          : "평가를 변경하지 못했습니다.",
      );
    }
  }

  if (isLoading) return <LoadingState />;
  if (error || !applicant) {
    return (
      <ErrorState message={error ?? "지원자를 찾을 수 없습니다."} />
    );
  }

  const connectionLabel = isEvaluationReady
    ? "실시간 연결됨"
    : connectionStatus === "reconnecting"
      ? "재연결 중"
      : connectionStatus === "error"
        ? "연결 오류"
        : "연결 중";

  return (
    <section className="stack-page response-detail-page">
      <div className="page-heading">
        <div>
          <h1>응답 상세 정보</h1>
          <p>{applicant.formTitle ?? "지원 폼"}</p>
        </div>
        <label className="rating-control">
          평가
          <select
            className={`rating-select rating-${applicant.rating ?? "대기"}`}
            value={applicant.rating ?? "대기"}
            onChange={(event) => updateRating(event.target.value)}
          >
            {RATINGS.map((rating) => (
              <option key={rating}>{rating}</option>
            ))}
          </select>
        </label>
      </div>

      {actionError ? (
        <div className="page-state error">{actionError}</div>
      ) : null}

      <div className="response-workspace">
        <main className="response-scroll-column">
          <section className="applicant-hero-card">
            <div>
              <h2>{applicant.name}</h2>
            </div>
            <dl>
              <div>
                <dt>학번</dt>
                <dd>{applicant.studentId ?? "-"}</dd>
              </div>
              <div>
                <dt>학과(부)</dt>
                <dd>{applicant.major ?? "-"}</dd>
              </div>
              <div>
                <dt>전화번호</dt>
                <dd>{applicant.phone ?? "-"}</dd>
              </div>
              {applicant.email ? (
                <div>
                  <dt>이메일</dt>
                  <dd>{applicant.email}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="answer-card-list">
            {answers.map((answer, index) => (
              <article
                className="answer-card"
                key={`${answer.questionId ?? index}-${answer.question}`}
              >
                <span>Q{index + 1}</span>
                <div>
                  <h3>{answer.question || "질문"}</h3>
                  <p>{answer.answer || "-"}</p>
                </div>
              </article>
            ))}
          </section>
        </main>

        <aside className="evaluation-note-panel">
          <div className="evaluation-note-heading">
            <div>
              <h2>평가 노트</h2>
              <p>면접관들과 실시간으로 공유되는 메모입니다.</p>
            </div>
            <span
              className={`evaluation-connection-status ${connectionStatus}`}
            >
              {connectionLabel}
            </span>
          </div>
          <textarea
            ref={evaluationEditorRef}
            aria-label="평가 노트"
            disabled={!isEvaluationReady}
            value={evaluationContent}
            placeholder="지원자 평가와 면접 질문을 기록하세요."
            onBlur={handleEvaluationBlur}
            onChange={handleEvaluationChange}
            onClick={(event) => handleCaretMove(event.currentTarget)}
            onDoubleClick={(event) => {
              const lineNumber = getLineNumber(
                event.currentTarget.value,
                event.currentTarget.selectionStart,
              );
              requestLineLock(lineNumber);
            }}
            onKeyUp={(event) => handleCaretMove(event.currentTarget)}
          />
          <div className="note-footer">
            <span>버전 {evaluationVersion}</span>
            <span>{syncMessage}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
