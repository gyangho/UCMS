import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface PosInstance {
  id: number;
  instanceName: string;
  status: string;
  createdAt?: string | null;
}

export function PosInstancesPage() {
  const [instances, setInstances] = useState<PosInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: POS instances now render only records returned by /api/pos/instances.
  useEffect(() => {
    let ignore = false;

    async function loadInstances() {
      try {
        const data = await requestData<{ instances: PosInstance[] }>("/api/pos/instances");
        if (!ignore) {
          setInstances(data.instances);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "POS 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadInstances();
    return () => {
      ignore = true;
    };
  }, []);

  async function openInstance(instanceId: number) {
    await requestData(`/api/pos/instances/${instanceId}/open`, { method: "POST" });
    setInstances((currentInstances) =>
      currentInstances.map((instance) =>
        instance.id === instanceId ? { ...instance, status: "active" } : instance
      )
    );
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
          <h1>POS 인스턴스</h1>
        </div>
      </div>

      {instances.length === 0 ? (
        <EmptyState title="POS 인스턴스가 없습니다." />
      ) : (
        <div className="data-grid">
          {instances.map((instance) => (
            <article className="data-card" key={instance.id}>
              <div>
                <h2>{instance.instanceName}</h2>
                <span className={`status-pill ${instance.status}`}>{instance.status}</span>
              </div>
              <dl>
                <dt>ID</dt>
                <dd>{instance.id}</dd>
                <dt>생성일</dt>
                <dd>{instance.createdAt ? formatDate(instance.createdAt) : "-"}</dd>
              </dl>
              <div className="card-actions">
                <button type="button" onClick={() => openInstance(instance.id)}>
                  활성화
                </button>
                <button type="button" onClick={() => navigate(`/pos/instances/${instance.id}`)}>
                  상세보기
                </button>
                <button type="button" onClick={() => navigate(`/pos/${instance.id}`)}>
                  판매
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}
