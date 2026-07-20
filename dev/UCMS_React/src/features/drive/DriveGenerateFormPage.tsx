import { type FormEvent, useEffect, useState } from "react";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface FormTemplate {
  id: number;
  title: string;
  formUrl: string;
}

export function DriveGenerateFormPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 2026-07-16: Google Form templates now come from /api/drive/templates instead of hard-coded demo URLs.
  useEffect(() => {
    let ignore = false;

    async function loadTemplates() {
      try {
        const data = await requestData<{ templates: FormTemplate[] }>("/api/drive/templates");
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
    const data = await requestData<{ formUrl: string }>("/api/drive/forms", {
      method: "POST",
      body: JSON.stringify({
        templateId: Number(templateId),
        userEmail
      })
    });
    setMessage(`폼을 생성했습니다: ${data.formUrl}`);
  }

  async function addTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await requestData<{ template: FormTemplate }>("/api/drive/templates", {
      method: "POST",
      body: JSON.stringify({
        title: newTitle,
        formUrl: newUrl
      })
    });
    setTemplates((currentTemplates) => [...currentTemplates, data.template]);
    setNewTitle("");
    setNewUrl("");
    setMessage("폼 템플릿을 추가했습니다.");
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
          <h1>구글 폼 생성</h1>
        </div>
      </div>

      {message ? <div className="page-state success">{message}</div> : null}

      <div className="two-column">
        <form className="form-panel" onSubmit={createForm}>
          <h2>폼 생성</h2>
          <label>
            템플릿
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
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
          <button type="submit">폼 생성</button>
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

      {templates.length === 0 ? (
        <EmptyState title="등록된 템플릿이 없습니다." />
      ) : (
        <div className="data-grid">
          {templates.map((template) => (
            <article className="data-card" key={template.id}>
              <h2>{template.title}</h2>
              <p>{template.formUrl}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
