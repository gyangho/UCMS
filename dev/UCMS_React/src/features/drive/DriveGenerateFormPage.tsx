import { type FormEvent, useEffect, useState } from "react";
import { ApiError, requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface FormTemplate {
  id: number;
  title: string;
  formUrl: string;
}

function isGoogleReconnectError(error: unknown) {
  if (!(error instanceof ApiError) || typeof error.body !== "object" || error.body === null) {
    return false;
  }
  const apiError = (error.body as { error?: { code?: string } }).error;
  return apiError?.code === "GOOGLE_OAUTH_RECONNECT_REQUIRED";
}

export function DriveGenerateFormPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [createdForm, setCreatedForm] = useState<{
    title: string;
    formUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(
    null,
  );
  const [editingTemplate, setEditingTemplate] = useState<FormTemplate | null>(null);

  // 2026-07-16: Google Form templates now come from /api/drive/templates instead of hard-coded demo URLs.
  useEffect(() => {
    let ignore = false;

    async function loadTemplates() {
      try {
        // 2026-07-23: Google 재연결 관리는 관리자 화면에서만 제공하고 이 화면은 템플릿만 불러옵니다.
        const data = await requestData<{ templates: FormTemplate[] }>(
          "/api/drive/templates",
        );
        if (!ignore) {
          setTemplates(data.templates);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "템플릿을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadTemplates();
    return () => {
      ignore = true;
    };
  }, []);

  async function createForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setMessage(null);
    setCreatedForm(null);
    setActionError(null);
    try {
      const data = await requestData<{
        formUrl: string;
        title: string;
        message: string;
      }>("/api/drive/forms", {
        method: "POST",
        body: JSON.stringify({
          templateId: Number(templateId),
          title: formTitle,
          userEmail,
        }),
      });
      setCreatedForm({ title: data.title, formUrl: data.formUrl });
      setMessage(data.message || "폼을 생성했습니다.");
    } catch (createError) {
      if (isGoogleReconnectError(createError)) {
        setActionError(
          "구글 계정이 만료됐습니다. 관리자에게 문의해주세요.",
        );
      } else {
        setActionError(
          createError instanceof Error
            ? createError.message
            : "폼을 생성하지 못했습니다.",
        );
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function addTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    try {
      const data = await requestData<{ template: FormTemplate }>(
        "/api/drive/templates",
        {
          method: "POST",
          body: JSON.stringify({
            title: newTitle,
            formUrl: newUrl,
          }),
        },
      );
      setTemplates((currentTemplates) => [
        ...currentTemplates,
        data.template,
      ]);
      setNewTitle("");
      setNewUrl("");
      setCreatedForm(null);
      setMessage("폼 템플릿을 추가했습니다.");
    } catch (templateError) {
      setActionError(
        templateError instanceof Error
          ? templateError.message
          : "폼 템플릿을 추가하지 못했습니다.",
      );
    }
  }

  async function deleteTemplate(template: FormTemplate) {
    if (!window.confirm(`'${template.title}' 템플릿을 삭제하시겠습니까?`)) {
      return;
    }

    setDeletingTemplateId(template.id);
    setActionError(null);
    setMessage(null);
    try {
      const data = await requestData<{ message: string }>(
        `/api/drive/templates/${template.id}`,
        { method: "DELETE" },
      );
      // 2026-07-23: 행의 X 버튼으로 삭제한 템플릿을 즉시 목록과 선택값에서 제거합니다.
      setTemplates((currentTemplates) =>
        currentTemplates.filter((item) => item.id !== template.id),
      );
      if (templateId === String(template.id)) {
        setTemplateId("");
        setFormTitle("");
      }
      setMessage(data.message || "폼 템플릿을 삭제했습니다.");
    } catch (templateError) {
      setActionError(
        templateError instanceof Error
          ? templateError.message
          : "폼 템플릿을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingTemplateId(null);
    }
  }

  async function updateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTemplate) return;
    setActionError(null);
    try {
      const data = await requestData<{ template: FormTemplate }>(`/api/drive/templates/${editingTemplate.id}`, {
        method: "PUT",
        body: JSON.stringify(editingTemplate),
      });
      // 2026-08-23: UCMS edits template metadata; the linked Google Form button edits its actual questions.
      setTemplates((current) => current.map((item) => item.id === data.template.id ? data.template : item));
      setEditingTemplate(null);
      setMessage("양식 정보를 수정했습니다.");
    } catch (templateError) {
      setActionError(templateError instanceof Error ? templateError.message : "양식을 수정하지 못했습니다.");
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
          <h1>양식 관리</h1>
          <p>Google Form 원본 양식과 UCMS에서 복사할 양식 정보를 관리합니다.</p>
        </div>
      </div>

      {/* 2026-07-22: Keep the title-only template links at the top for quick access. */}
      <section className="stack-page">
        <h2 className="section-title">템플릿 목록</h2>
        {templates.length === 0 ? (
          <EmptyState title="등록된 템플릿이 없습니다." />
        ) : (
          <div className="table-wrap">
            <table className="data-table template-management-table">
              <thead>
                <tr>
                  <th>제목</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr
                    className="clickable-row"
                    key={template.id}
                  >
                    <td>{template.title}</td>
                    <td className="template-delete-cell">
                      <a className="secondary-button" href={template.formUrl} rel="noreferrer" target="_blank">Google Form에서 질문 수정</a>
                      <button className="secondary-button" type="button" onClick={() => setEditingTemplate({ ...template })}>정보 수정</button>
                      <button
                        aria-label={`${template.title} 템플릿 삭제`}
                        className="template-delete-button"
                        disabled={deletingTemplateId === template.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteTemplate(template);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {actionError ? <div className="page-state error">{actionError}</div> : null}

      {message ? (
        <div className={`page-state ${createdForm ? "success" : "notice"}`}>
          <span>{message}</span>
          {createdForm ? (
            <>
              {" "}
              <a
                className="generated-form-link"
                href={createdForm.formUrl}
                rel="noreferrer"
                target="_blank"
              >
                {createdForm.title} 열기
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      {editingTemplate ? <form className="form-panel" onSubmit={updateTemplate}>
        <h2>양식 정보 수정</h2>
        <label>양식 이름<input required value={editingTemplate.title} onChange={(event) => setEditingTemplate({ ...editingTemplate, title: event.target.value })} /></label>
        <label>Google Form URL<input required type="url" value={editingTemplate.formUrl} onChange={(event) => setEditingTemplate({ ...editingTemplate, formUrl: event.target.value })} /></label>
        <div className="toolbar"><button type="submit">저장</button><button className="secondary-button" type="button" onClick={() => setEditingTemplate(null)}>취소</button></div>
      </form> : null}

      <div className="two-column">
        <form className="form-panel" onSubmit={createForm}>
          <h2>양식으로 폼 생성</h2>
          <label>
            템플릿
            <select
              value={templateId}
              onChange={(event) => {
                const nextTemplateId = event.target.value;
                setTemplateId(nextTemplateId);
                const selectedTemplate = templates.find(
                  (template) => String(template.id) === nextTemplateId,
                );
                if (selectedTemplate) {
                  setFormTitle(selectedTemplate.title);
                }
              }}
              required
            >
              <option value="">템플릿 선택</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
          {/* 2026-07-23: 복사될 Drive 파일명과 Google Form 내부 제목을 함께 지정한다. */}
          <label>
            생성할 폼 제목
            <input
              value={formTitle}
              onChange={(event) => setFormTitle(event.target.value)}
              required
              placeholder="생성할 구글 폼 제목"
            />
          </label>
          <label>
            편집자 이메일
            <input
              type="email"
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              required
              placeholder="example@gmail.com"
            />
          </label>
          <button disabled={isCreating} type="submit">
            {isCreating ? "생성 중..." : "폼 생성"}
          </button>
        </form>

        <form className="form-panel" onSubmit={addTemplate}>
          <h2>템플릿 추가</h2>
          <label>
            템플릿 이름
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              required
            />
          </label>
          <label>
            Google Form URL
            <input
              type="url"
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
              required
              placeholder="https://forms.google.com/..."
            />
          </label>
          <button type="submit">추가</button>
        </form>
      </div>

    </section>
  );
}
