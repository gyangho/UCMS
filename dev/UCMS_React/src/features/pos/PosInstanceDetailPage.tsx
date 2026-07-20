import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface PosInstance {
  id: number;
  instanceName: string;
  status: string;
  managerName?: string | null;
}

interface PosProduct {
  id: number;
  name: string;
  price: number;
  stock: number;
}

export function PosInstanceDetailPage({
  path,
  mode
}: {
  path: string;
  mode: "detail" | "sale";
}) {
  const instanceId = Number(path.match(/\d+/)?.[0] ?? 0);
  const [instance, setInstance] = useState<PosInstance | null>(null);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 2026-07-16: POS detail/sale pages now use instance products from the contract API instead of demo inventory.
  useEffect(() => {
    let ignore = false;

    async function loadInstance() {
      try {
        const data = await requestData<{ instance: PosInstance; products: PosProduct[] }>(
          `/api/pos/instances/${instanceId}`
        );
        if (!ignore) {
          setInstance(data.instance);
          setProducts(data.products);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "POS 상세를 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadInstance();
    return () => {
      ignore = true;
    };
  }, [instanceId]);

  async function purchaseOne(product: PosProduct) {
    await requestData("/api/pos/purchase", {
      method: "POST",
      body: JSON.stringify({
        instanceId,
        items: [{ productId: product.id, quantity: 1 }],
        paid: true
      })
    });
    setProducts((currentProducts) =>
      currentProducts.map((item) =>
        item.id === product.id ? { ...item, stock: item.stock - 1 } : item
      )
    );
    setMessage(`${product.name} 1개를 판매했습니다.`);
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !instance) {
    return <ErrorState message={error ?? "POS 인스턴스를 찾을 수 없습니다."} />;
  }

  return (
    <section className="stack-page">
      <div className="page-heading">
        <div>
          <h1>{mode === "sale" ? "POS 판매" : "POS 인스턴스 상세"}</h1>
        </div>
        <div className="toolbar">
          <button
            type="button"
            onClick={() => navigate(`/pos/instances/${instanceId}/records`)}
          >
            판매 기록 보기
          </button>
          <button type="button" onClick={() => navigate("/pos/instances")}>
            목록
          </button>
        </div>
      </div>

      {message ? <div className="page-state success">{message}</div> : null}

      <section className="data-card">
        <div>
          <h2>{instance.instanceName}</h2>
          <span className="status-pill active">{instance.status}</span>
        </div>
        <dl>
          <dt>인스턴스 ID</dt>
          <dd>{instance.id}</dd>
          <dt>담당자</dt>
          <dd>{instance.managerName ?? "-"}</dd>
          <dt>화면</dt>
          <dd>{mode === "sale" ? "판매" : "상세 정보"}</dd>
        </dl>
      </section>

      {products.length === 0 ? (
        <EmptyState title="등록된 상품이 없습니다." />
      ) : (
        <div className="data-grid">
          {products.map((product) => (
            <article className="data-card" key={product.id}>
              <h2>{product.name}</h2>
              <dl>
                <dt>가격</dt>
                <dd>{formatCurrency(product.price)}</dd>
                <dt>재고</dt>
                <dd>{product.stock}</dd>
              </dl>
              {mode === "sale" ? (
                <button type="button" disabled={product.stock <= 0} onClick={() => purchaseOne(product)}>
                  담기
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}
