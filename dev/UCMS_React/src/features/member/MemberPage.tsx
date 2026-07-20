import { useEffect, useState } from "react";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface Member {
  userId: string;
  name: string;
  studentId?: string | null;
  major?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  authority: number;
  authorityLabel?: string;
  status?: string | null;
}

export function MemberPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Member management must reflect initialData.sql-backed API rows, not local sample users.
  useEffect(() => {
    let ignore = false;

    async function loadMembers() {
      try {
        const data = await requestData<{ members: Member[] }>("/api/members");
        if (!ignore) {
          setMembers(data.members);
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

      {members.length === 0 ? (
        <EmptyState title="등록된 회원이 없습니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>학번</th>
                <th>전공</th>
                <th>연락처</th>
                <th>이메일</th>
                <th>권한</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>{member.name}</td>
                  <td>{member.studentId ?? "-"}</td>
                  <td>{member.major ?? "-"}</td>
                  <td>{member.phoneNumber ?? "-"}</td>
                  <td>{member.email ?? "-"}</td>
                  <td>{member.authorityLabel ?? member.authority}</td>
                  <td>{member.status ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
