import { useCallback, useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";
import { BusyLabel } from "../../shared/ui/BusyLabel";

const MAX_POS_POSTER_BYTES = 10 * 1024 * 1024;

interface PosInstance {
  id: number;
  instanceName: string;
  status: "inactive" | "active" | "closed";
  creatorName?: string | null;
  createdAt?: string | null;
  closedAt?: string | null;
  autoCloseAt?: string | null;
  promotionCopy?: string | null;
  posterUrl?: string | null;
}

interface PosProduct {
  id: number;
  name: string;
  price: number;
  stock: number;
}

interface PosSalesman {
  id: number;
  studentId: string;
  name: string;
}

interface MemberOption {
  id: string;
  name: string;
  studentId: string;
}

interface CartLine {
  key: string;
  productId: number;
  name: string;
  price: number;
  quantity: number;
  isService: boolean;
}

export function PosInstanceDetailPage({
  path,
  mode,
}: {
  path: string;
  mode: "detail" | "sale";
}) {
  const instanceId = Number(path.match(/\d+/)?.[0] ?? 0);
  const [instance, setInstance] = useState<PosInstance | null>(null);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [salesmans, setSalesmans] = useState<PosSalesman[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PosProduct | null>(
    null,
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPromotionCopy, setEditPromotionCopy] = useState("");
  const [editAutoCloseAt, setEditAutoCloseAt] = useState("");
  const [editPoster, setEditPoster] = useState<File | null>(null);
  const [editProducts, setEditProducts] = useState<PosProduct[]>([]);
  const [editSalesmans, setEditSalesmans] = useState<PosSalesman[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberQuery, setMemberQuery] = useState("");

  const loadInstance = useCallback(async () => {
    try {
      const data = await requestData<{
        instance: PosInstance;
        products: PosProduct[];
        salesmans?: PosSalesman[];
        canManage?: boolean;
      }>(`/api/pos/instances/${instanceId}`);
      setInstance(data.instance);
      setProducts(data.products ?? []);
      setSalesmans(data.salesmans ?? []);
      setCanManage(Boolean(data.canManage));
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "POS 상세 정보를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    loadInstance();
  }, [loadInstance]);

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (total, line) =>
          total + (line.isService ? 0 : line.price * line.quantity),
        0,
      ),
    [cart],
  );

  const memberResults = useMemo(() => {
    const keyword = memberQuery.trim().toLocaleLowerCase("ko-KR");
    if (!keyword) return [];
    const selected = new Set(editSalesmans.map((salesman) => salesman.studentId));
    return members.filter((member) => !selected.has(member.studentId) && `${member.name} ${member.studentId}`.toLocaleLowerCase("ko-KR").includes(keyword)).slice(0, 8);
  }, [editSalesmans, memberQuery, members]);

  async function startEditing() {
    if (!instance) return;
    setEditName(instance.instanceName);
    setEditPromotionCopy(instance.promotionCopy ?? "");
    setEditAutoCloseAt(toLocalInput(instance.autoCloseAt));
    setEditProducts(products.map((product) => ({ ...product })));
    setEditSalesmans(salesmans.map((salesman) => ({ ...salesman })));
    setEditPoster(null);
    setMemberQuery("");
    setIsEditing(true);
    if (!members.length) {
      try {
        const data = await requestData<{ members: MemberOption[] }>("/api/members");
        setMembers(data.members ?? []);
      } catch (loadError) {
        setMessage(loadError instanceof Error ? loadError.message : "판매자 목록을 불러오지 못했습니다.");
      }
    }
  }

  async function saveInstanceEdit() {
    if (!editName.trim() || !editProducts.length || !editSalesmans.length) {
      setMessage("인스턴스 이름, 판매자, 품목을 모두 입력해 주세요.");
      return;
    }
    if (editProducts.some((product) => !product.name.trim() || product.price < 0 || product.stock < 0)) {
      setMessage("품목명, 가격, 재고를 올바르게 입력해 주세요.");
      return;
    }
    setIsSaving(true);
    try {
      await requestData(`/api/pos/instances/${instanceId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editName.trim(),
          promotionCopy: editPromotionCopy.trim(),
          autoCloseAt: editAutoCloseAt ? new Date(editAutoCloseAt).toISOString() : null,
          posterFileName: editPoster?.name ?? null,
          posterDataUrl: editPoster ? await fileToDataUrl(editPoster) : null,
          products: editProducts.map(({ id, name, price, stock }) => ({ id: id > 0 ? id : null, name: name.trim(), price: Number(price), stock: Number(stock) })),
          salesmanStudentIds: editSalesmans.map((salesman) => salesman.studentId),
        }),
      });
      setMessage("POS 인스턴스를 수정했습니다.");
      setIsEditing(false);
      await loadInstance();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "POS 인스턴스를 수정하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function selectEditPoster(file: File | undefined, input: HTMLInputElement) {
    // 2026-08-23: Keep POS edit uploads within the same limit as creation and the API.
    if (file && file.type !== "application/pdf") {
      setEditPoster(null);
      setMessage("홍보 포스터는 PDF 파일만 업로드할 수 있습니다.");
      input.value = "";
      return;
    }
    if (file && file.size > MAX_POS_POSTER_BYTES) {
      setEditPoster(null);
      setMessage("홍보 포스터 PDF는 10MB 이하여야 합니다.");
      input.value = "";
      return;
    }
    setMessage(null);
    setEditPoster(file ?? null);
  }

  function cartQuantity(productId: number, lines = cart) {
    return lines
      .filter((line) => line.productId === productId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  // 2026-07-23: 상품 버튼은 항상 일반 판매 행을 늘리고 서비스 행과는 별도로 유지한다.
  function addProduct(product: PosProduct) {
    setCart((current) => {
      if (cartQuantity(product.id, current) >= product.stock) {
        setMessage(`${product.name}의 재고가 부족합니다.`);
        return current;
      }
      const normalKey = `${product.id}:normal`;
      const normalLine = current.find((line) => line.key === normalKey);
      if (normalLine) {
        return current.map((line) =>
          line.key === normalKey
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [
        ...current,
        {
          key: normalKey,
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          isService: false,
        },
      ];
    });
  }

  function changeQuantity(line: CartLine, delta: number) {
    const product = products.find((item) => item.id === line.productId);
    setCart((current) => {
      if (
        delta > 0 &&
        product &&
        cartQuantity(line.productId, current) >= product.stock
      ) {
        setMessage(`${line.name}의 재고가 부족합니다.`);
        return current;
      }
      const nextQuantity = line.quantity + delta;
      if (nextQuantity <= 0) {
        return current.filter((item) => item.key !== line.key);
      }
      return current.map((item) =>
        item.key === line.key
          ? { ...item, quantity: nextQuantity }
          : item,
      );
    });
  }

  // 2026-07-23: 서비스 여부를 바꿀 때 같은 상품의 대상 행이 있으면 수량을 합치고 원래 행을 제거한다.
  function toggleService(line: CartLine) {
    setCart((current) => {
      const nextIsService = !line.isService;
      const targetKey = `${line.productId}:${
        nextIsService ? "service" : "normal"
      }`;
      const target = current.find((item) => item.key === targetKey);
      if (target) {
        return current
          .filter((item) => item.key !== line.key)
          .map((item) =>
            item.key === targetKey
              ? { ...item, quantity: item.quantity + line.quantity }
              : item,
          );
      }
      return current.map((item) =>
        item.key === line.key
          ? {
              ...item,
              key: targetKey,
              isService: nextIsService,
            }
          : item,
      );
    });
  }

  async function changeStatus(
    status: "inactive" | "active" | "closed",
  ) {
    if (
      status === "closed" &&
      !window.confirm("이 인스턴스를 마감하면 다시 판매할 수 없습니다. 마감할까요?")
    ) {
      return;
    }
    setIsSaving(true);
    try {
      await requestData(`/api/pos/instances/${instanceId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage(
        status === "active"
          ? "판매를 시작했습니다."
          : status === "inactive"
            ? "판매를 종료했습니다."
            : "인스턴스를 마감했습니다.",
      );
      await loadInstance();
    } catch (saveError) {
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "상태를 변경하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function checkout() {
    if (!cart.length) {
      setMessage("장바구니에 품목을 담아 주세요.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await requestData<{ totalPrice: number }>(
        "/api/pos/purchase",
        {
          method: "POST",
          body: JSON.stringify({
            instanceId,
            items: cart.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              isService: line.isService,
            })),
          }),
        },
      );
      setCart([]);
      setMessage(`${formatCurrency(result.totalPrice)} 판매를 완료했습니다.`);
      await loadInstance();
    } catch (saveError) {
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "판매를 처리하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <LoadingState />;
  if (error || !instance) {
    return (
      <ErrorState message={error ?? "POS 인스턴스를 찾을 수 없습니다."} />
    );
  }

  if (mode === "sale") {
    return (
      <section className="stack-page pos-page pos-sale-page">
        <div className="page-heading">
          <div>
            <h1>{instance.instanceName} 판매</h1>
            <p>품목 버튼을 눌러 장바구니에 담아 주세요.</p>
          </div>
          <div className="toolbar">
            <button
              type="button"
              onClick={() => navigate(`/pos/instances/${instanceId}`)}
            >
              인스턴스 상세
            </button>
          </div>
        </div>

        {message ? <div className="page-state notice">{message}</div> : null}

        {instance.status !== "active" ? (
          <EmptyState title="현재 판매 중인 인스턴스가 아닙니다." />
        ) : (
          <div className="pos-sale-layout">
            <section className="pos-product-pad">
              {products.length ? (
                products.map((product) => {
                  const remaining =
                    product.stock - cartQuantity(product.id);
                  return (
                    <button
                      disabled={remaining <= 0}
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                    >
                      <strong>{product.name}</strong>
                      <span>{formatCurrency(product.price)}</span>
                      <small>남은 수량 {Math.max(remaining, 0)}</small>
                    </button>
                  );
                })
              ) : (
                <EmptyState title="등록된 품목이 없습니다." />
              )}
            </section>

            <aside className="pos-cart">
              <div className="section-heading-row">
                <h2>장바구니</h2>
                <span>{cart.reduce((sum, line) => sum + line.quantity, 0)}개</span>
              </div>
              {cart.length ? (
                <div className="pos-cart-lines">
                  {cart.map((line) => (
                    <article
                      className={line.isService ? "service" : ""}
                      key={line.key}
                    >
                      <div className="pos-cart-line-heading">
                        <strong>{line.name}</strong>
                        <span>
                          {line.isService
                            ? "서비스 · 0원"
                            : formatCurrency(line.price * line.quantity)}
                        </span>
                      </div>
                      <div className="pos-cart-line-actions">
                        <div className="quantity-control">
                          <button
                            aria-label={`${line.name} 수량 줄이기`}
                            type="button"
                            onClick={() => changeQuantity(line, -1)}
                          >
                            −
                          </button>
                          <strong>{line.quantity}</strong>
                          <button
                            aria-label={`${line.name} 수량 늘리기`}
                            type="button"
                            onClick={() => changeQuantity(line, 1)}
                          >
                            +
                          </button>
                        </div>
                        <label>
                          <input
                            checked={line.isService}
                            type="checkbox"
                            onChange={() => toggleService(line)}
                          />
                          서비스
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">담긴 품목이 없습니다.</p>
              )}
              <div className="pos-cart-total">
                <span>결제 금액</span>
                <strong>{formatCurrency(cartTotal)}</strong>
              </div>
              <button
                className="pos-checkout-button"
                disabled={!cart.length || isSaving}
                type="button"
                onClick={checkout}
              >
                {isSaving ? <BusyLabel /> : "판매 완료"}
              </button>
            </aside>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="stack-page pos-page">
      <div className="page-heading">
        <div>
          <h1>POS 인스턴스 상세</h1>
          <p>{instance.instanceName}</p>
        </div>
        <div className="toolbar">
          {canManage && instance.status !== "active" && !isEditing ? (
            <button className="secondary-button" type="button" onClick={startEditing}>수정</button>
          ) : null}
          {instance.status === "active" ? (
            <button
              className="success-button"
              type="button"
              onClick={() => navigate(`/pos/${instanceId}`)}
            >
              판매 화면
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate(`/pos/instances/${instanceId}/records`)}
          >
            판매 기록
          </button>
          <button type="button" onClick={() => navigate("/pos/instances")}>
            목록
          </button>
        </div>
      </div>

      {message ? <div className="page-state notice">{message}</div> : null}

      {isEditing ? (
        <section className="pos-instance-edit-panel" aria-label="POS 인스턴스 수정">
          {/* 2026-08-23: Non-selling instances can be safely revised from their detail screen. */}
          <div className="section-heading-row"><h2>인스턴스 수정</h2><span>판매 중에는 수정할 수 없습니다.</span></div>
          <label>인스턴스 이름<input required value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
          <div className="form-grid">
            <label>새 홍보 포스터(A4 PDF)<span className="field-help">PDF, 10MB 이하</span><input accept="application/pdf" type="file" onChange={(event) => selectEditPoster(event.target.files?.[0], event.currentTarget)} />{editPoster ? <span className="selected-file-summary">선택: {editPoster.name}</span> : null}</label>
            {/* 2026-08-23: Offer the same ten-minute time selection interval across UCMS forms. */}
            <label>자동 판매 종료 시간<input type="datetime-local" step={600} value={editAutoCloseAt} onChange={(event) => setEditAutoCloseAt(event.target.value)} /></label>
          </div>
          <label>홍보 문구<textarea rows={4} value={editPromotionCopy} onChange={(event) => setEditPromotionCopy(event.target.value)} /></label>

          <section className="pos-create-section">
            <h3>판매자</h3>
            <div className="pos-selected-members">{editSalesmans.map((salesman) => <span key={salesman.studentId}>{salesman.name} · {salesman.studentId}<button aria-label={`${salesman.name} 판매자 삭제`} type="button" onClick={() => setEditSalesmans((current) => current.filter((item) => item.studentId !== salesman.studentId))}>×</button></span>)}</div>
            <div className="pos-member-search"><input value={memberQuery} placeholder="이름 또는 학번 검색" onChange={(event) => setMemberQuery(event.target.value)} />{memberResults.length ? <div className="pos-member-results">{memberResults.map((member) => <button key={member.studentId} type="button" onClick={() => { setEditSalesmans((current) => [...current, { id: 0, name: member.name, studentId: member.studentId }]); setMemberQuery(""); }}><strong>{member.name}</strong><span>{member.studentId}</span></button>)}</div> : null}</div>
          </section>

          <section className="pos-create-section">
            <div className="section-heading-row"><h3>판매 품목</h3><button type="button" onClick={() => setEditProducts((current) => [...current, { id: -Date.now(), name: "", price: 0, stock: 0 }])}>품목 추가</button></div>
            <div className="pos-edit-product-list">{editProducts.map((product) => <div key={product.id}><label>품목명<input value={product.name} onChange={(event) => setEditProducts((current) => current.map((item) => item.id === product.id ? { ...item, name: event.target.value } : item))} /></label><label>가격<input min={0} type="number" value={product.price} onChange={(event) => setEditProducts((current) => current.map((item) => item.id === product.id ? { ...item, price: Number(event.target.value) } : item))} /></label><label>재고<input min={0} type="number" value={product.stock} onChange={(event) => setEditProducts((current) => current.map((item) => item.id === product.id ? { ...item, stock: Number(event.target.value) } : item))} /></label><button className="danger-button" disabled={editProducts.length === 1} type="button" onClick={() => setEditProducts((current) => current.filter((item) => item.id !== product.id))}>삭제</button></div>)}</div>
          </section>
          <div className="card-actions"><button className="secondary-button" disabled={isSaving} type="button" onClick={() => setIsEditing(false)}>취소</button><button disabled={isSaving} type="button" onClick={saveInstanceEdit}>{isSaving ? <BusyLabel text="저장 중..." /> : "수정 저장"}</button></div>
        </section>
      ) : null}

      <section className="pos-instance-summary">
        <div>
          <div className="settlement-detail-heading">
            <h2>{instance.instanceName}</h2>
            <span className={`status-pill ${instance.status}`}>
              {statusLabel(instance.status)}
            </span>
          </div>
          <dl>
            <div>
              <dt>생성일</dt>
              <dd>{formatDate(instance.createdAt)}</dd>
            </div>
            <div>
              <dt>작성자</dt>
              <dd>{instance.creatorName ?? "-"}</dd>
            </div>
            <div>
              <dt>판매자</dt>
              <dd>
                {salesmans.length
                  ? salesmans.map((salesman) => salesman.name).join(", ")
                  : "-"}
              </dd>
            </div>
            {instance.closedAt ? (
              <div>
                <dt>마감일</dt>
                <dd>{formatDate(instance.closedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {canManage && instance.status !== "closed" ? (
          <div className="pos-status-actions">
            {instance.status === "inactive" ? (
              <button
                className="success-button"
                disabled={isSaving}
                type="button"
                onClick={() => changeStatus("active")}
              >
                {isSaving ? <BusyLabel /> : "판매 시작"}
              </button>
            ) : (
              <button
                disabled={isSaving}
                type="button"
                onClick={() => changeStatus("inactive")}
              >
                {isSaving ? <BusyLabel /> : "판매 종료"}
              </button>
            )}
            <button
              className="danger-button"
              disabled={isSaving}
              type="button"
              onClick={() => changeStatus("closed")}
            >
              {isSaving ? <BusyLabel /> : "마감"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="pos-products-section">
        <div className="section-heading-row">
          <h2>판매 품목</h2>
          <span>{products.length}개</span>
        </div>
        {products.length === 0 ? (
          <EmptyState title="등록된 품목이 없습니다." />
        ) : (
          <div className="pos-product-list">
            <div className="pos-product-list-head">
              <span>품목명</span>
              <span>가격</span>
              <span>재고</span>
              <span>관리</span>
            </div>
            {products.map((product) => (
              <div className="pos-product-row" key={product.id}>
                <strong>{product.name}</strong>
                <span>{formatCurrency(product.price)}</span>
                <span>{product.stock}개</span>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(product)}
                >
                  상세보기
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedProduct ? (
        <section className="pos-product-detail">
          <div>
            <h2>{selectedProduct.name}</h2>
            <button type="button" onClick={() => setSelectedProduct(null)}>
              닫기
            </button>
          </div>
          <dl>
            <div>
              <dt>가격</dt>
              <dd>{formatCurrency(selectedProduct.price)}</dd>
            </div>
            <div>
              <dt>남은 재고</dt>
              <dd>{selectedProduct.stock}개</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </section>
  );
}

function statusLabel(status: PosInstance["status"]) {
  if (status === "active") return "판매 중";
  if (status === "closed") return "마감";
  return "판매 종료";
}

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
