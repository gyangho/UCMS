import { useEffect, useState } from "react";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

const MEMBER_AUTHORITIES = ["부원", "임원진", "부회장", "회장"] as const;

interface Member {
  id: string;
  userId?: number | null;
  name: string;
  studentId: string;
  major?: string | null;
  phoneNumber?: string | null;
  generation: number;
  authority: number;
  authorityLabel: string;
}

export function MemberPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Member | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 2026-07-22: Member rows now expose DB contact/generation/authority fields and support inline editing.
  useEffect(() => {
    let ignore = false;

    async function loadMembers() {
      try {
        const data = await requestData<{ members: Member[] }>("/api/members");
        if (!ignore) {
          setMembers(data.members ?? []);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "회원 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadMembers();
    return () => {
      ignore = true;
    };
  }, []);

  function startEditing(member: Member) {
    setEditingStudentId(member.studentId);
    setDraft({ ...member });
    setActionError(null);
  }

  function cancelEditing() {
    setEditingStudentId(null);
    setDraft(null);
    setActionError(null);
  }

  async function saveMember() {
    if (!editingStudentId || !draft) {
      return;
    }

    setIsSaving(true);
    setActionError(null);
    try {
      await requestData<{ id: string }>(`/api/members/${encodeURIComponent(editingStudentId)}`, {
        method: "PUT",
        body: JSON.stringify({
          studentId: draft.studentId,
          name: draft.name,
          major: draft.major ?? "",
          phone: draft.phoneNumber ?? "",
          generation: draft.generation,
          authority: draft.authorityLabel
        })
      });
      setMembers((currentMembers) =>
        currentMembers.map((member) =>
          member.studentId === editingStudentId ? { ...draft, id: draft.studentId } : member
        )
      );
      cancelEditing();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "회원 정보를 수정하지 못했습니다.");
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
          <h1>회원 관리</h1>
        </div>
      </div>

      {actionError ? <div className="page-state error">{actionError}</div> : null}

      {members.length === 0 ? (
        <EmptyState title="등록된 회원이 없습니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table member-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>학번</th>
                <th>전공</th>
                <th>연락처</th>
                <th>기수</th>
                <th>권한</th>
                <th>수정</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isEditing = editingStudentId === member.studentId && draft;

                return (
                  <tr key={member.id || member.studentId}>
                    <td>
                      {isEditing ? (
                        <input
                          aria-label={`${member.name} 이름`}
                          value={draft.name}
                          onChange={(event) => setDraftField("name", event.target.value)}
                        />
                      ) : (
                        member.name
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          aria-label={`${member.name} 학번`}
                          inputMode="numeric"
                          value={draft.studentId}
                          onChange={(event) => setDraftField("studentId", event.target.value)}
                        />
                      ) : (
                        member.studentId
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          aria-label={`${member.name} 전공`}
                          value={draft.major ?? ""}
                          onChange={(event) => setDraftField("major", event.target.value)}
                        />
                      ) : (
                        member.major ?? "-"
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          aria-label={`${member.name} 연락처`}
                          inputMode="tel"
                          value={draft.phoneNumber ?? ""}
                          onChange={(event) => setDraftField("phoneNumber", event.target.value)}
                        />
                      ) : (
                        member.phoneNumber ?? "-"
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          aria-label={`${member.name} 기수`}
                          min={1}
                          type="number"
                          value={draft.generation}
                          onChange={(event) =>
                            setDraftField("generation", Number(event.target.value))
                          }
                        />
                      ) : (
                        member.generation
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          aria-label={`${member.name} 권한`}
                          value={draft.authorityLabel}
                          onChange={(event) => setDraftField("authorityLabel", event.target.value)}
                        >
                          {!MEMBER_AUTHORITIES.includes(
                            draft.authorityLabel as (typeof MEMBER_AUTHORITIES)[number]
                          ) ? (
                            <option value={draft.authorityLabel}>{draft.authorityLabel}</option>
                          ) : null}
                          {MEMBER_AUTHORITIES.map((authority) => (
                            <option key={authority} value={authority}>
                              {authority}
                            </option>
                          ))}
                        </select>
                      ) : (
                        member.authorityLabel
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="table-actions">
                          <button disabled={isSaving} type="button" onClick={saveMember}>
                            저장
                          </button>
                          <button disabled={isSaving} type="button" onClick={cancelEditing}>
                            취소
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => startEditing(member)}>
                          수정
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  function setDraftField<K extends keyof Member>(key: K, value: Member[K]) {
    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            [key]: value
          }
        : currentDraft
    );
  }
}
