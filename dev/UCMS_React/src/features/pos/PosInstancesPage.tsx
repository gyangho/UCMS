import { type FormEvent, useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";
import { BusyLabel } from "../../shared/ui/BusyLabel";
import { TenMinuteDateTimeInput } from "../../shared/ui/TenMinuteDateTimeInput";

const MAX_POS_POSTER_BYTES = 10 * 1024 * 1024;

interface PosInstance {
  id: number;
  instanceName: string;
  status: "inactive" | "active" | "closed";
  createdAt?: string | null;
  creatorName?: string | null;
}

interface MemberOption {
  id: string;
  name: string;
  studentId: string;
}

interface ProductDraft {
  key: number;
  name: string;
  price: number;
  stock: number;
}

export function PosInstancesPage() {
  const [instances, setInstances] = useState<PosInstance[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<MemberOption[]>([]);
  const [instanceName, setInstanceName] = useState("");
  const [promotionCopy, setPromotionCopy] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [autoCloseAt, setAutoCloseAt] = useState("");
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [productForm, setProductForm] = useState({
    name: "",
    price: "",
    stock: "",
  });

  useEffect(() => {
    let ignore = false;

    async function loadInstances() {
      try {
        const data = await requestData<{
          instances: PosInstance[];
          canCreate?: boolean;
        }>("/api/pos/instances");
        if (!ignore) {
          setInstances(data.instances ?? []);
          setCanCreate(Boolean(data.canCreate));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "POS 인스턴스 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadInstances();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!showCreate || members.length) return;
    requestData<{ members: MemberOption[] }>("/api/members")
      .then((data) => setMembers(data.members ?? []))
      .catch((loadError) =>
        setMessage(
          loadError instanceof Error
            ? loadError.message
            : "판매자 목록을 불러오지 못했습니다.",
        ),
      );
  }, [members.length, showCreate]);

  const memberResults = useMemo(() => {
    const keyword = memberQuery.trim().toLocaleLowerCase("ko-KR");
    if (!keyword) return [];
    const selectedIds = new Set(
      selectedMembers.map((member) => member.studentId),
    );
    return members
      .filter(
        (member) =>
          !selectedIds.has(member.studentId) &&
          `${member.name} ${member.studentId}`
            .toLocaleLowerCase("ko-KR")
            .includes(keyword),
      )
      .slice(0, 8);
  }, [memberQuery, members, selectedMembers]);

  function addProduct() {
    const name = productForm.name.trim();
    const price = Number(productForm.price);
    const stock = Number(productForm.stock);
    if (
      !name ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setMessage("품목명, 가격, 재고를 올바르게 입력해 주세요.");
      return;
    }
    setProducts((current) => [
      ...current,
      { key: Date.now(), name, price, stock },
    ]);
    setProductForm({ name: "", price: "", stock: "" });
    setMessage(null);
  }

  async function createInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!instanceName.trim() || !products.length || !selectedMembers.length) {
      setMessage("인스턴스 이름, 판매자, 품목을 모두 입력해 주세요.");
      return;
    }

    setIsCreating(true);
    setMessage(null);
    try {
      const posterDataUrl = posterFile ? await fileToDataUrl(posterFile) : null;
      const data = await requestData<{ id: number; path?: string }>(
        "/api/pos/instances",
        {
          method: "POST",
          body: JSON.stringify({
            name: instanceName.trim(),
            products: products.map(({ name, price, stock }) => ({
              name,
              price,
              stock,
            })),
            salesmans: selectedMembers.map((member) => ({
              member_id: member.studentId,
            })),
            posterFileName: posterFile?.name ?? null,
            posterDataUrl,
            promotionCopy: promotionCopy.trim(),
            autoCloseAt: autoCloseAt ? new Date(autoCloseAt).toISOString() : null,
          }),
        },
      );
      navigate(data.path ?? `/pos/instances/${data.id}`);
    } catch (saveError) {
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "POS 인스턴스를 만들지 못했습니다.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  function selectPosterFile(file: File | undefined, input: HTMLInputElement) {
    // 2026-08-23: Validate POS PDFs before base64 conversion and nginx upload.
    if (file && file.type !== "application/pdf") {
      setPosterFile(null);
      setMessage("홍보 포스터는 PDF 파일만 업로드할 수 있습니다.");
      input.value = "";
      return;
    }
    if (file && file.size > MAX_POS_POSTER_BYTES) {
      setPosterFile(null);
      setMessage("홍보 포스터 PDF는 10MB 이하여야 합니다.");
      input.value = "";
      return;
    }
    setMessage(null);
    setPosterFile(file ?? null);
  }

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section className="stack-page pos-page">
      <div className="page-heading">
        <div>
          <h1>POS 인스턴스</h1>
          <p>판매 단위별 품목과 판매자를 관리합니다.</p>
        </div>
        {canCreate ? (
          <div className="toolbar">
            <button
              type="button"
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? "생성 닫기" : "새 인스턴스"}
            </button>
          </div>
        ) : null}
      </div>

      {message ? <div className="page-state notice">{message}</div> : null}

      {showCreate ? (
        <form aria-busy={isCreating} className="pos-create-panel" onSubmit={createInstance}>
          <div className="section-heading-row">
            <h2>인스턴스 생성</h2>
            <span>판매자 {selectedMembers.length}명</span>
          </div>

          <label className="pos-full-field">
            인스턴스 이름
            <input
              required
              value={instanceName}
              placeholder="예: 2026 동아리제 판매"
              onChange={(event) => setInstanceName(event.target.value)}
            />
          </label>

          {/* 2026-08-20: Store the A4 promotion PDF with an optional automatic sale closing time. */}
          <div className="form-grid">
            <label>
              홍보 포스터(A4 PDF)
              <span className="field-help">PDF, 10MB 이하</span>
              <input
                accept="application/pdf"
                type="file"
                onChange={(event) => selectPosterFile(event.target.files?.[0], event.currentTarget)}
              />
              {posterFile ? <span className="selected-file-summary">선택: {posterFile.name}</span> : null}
            </label>
            <TenMinuteDateTimeInput label="자동 판매 종료 시간" value={autoCloseAt} onChange={setAutoCloseAt} />
          </div>

          <label className="pos-full-field">홍보 문구<textarea rows={4} value={promotionCopy} placeholder="대시보드에 포스터와 함께 표시할 문구" onChange={(event) => setPromotionCopy(event.target.value)} /></label>

          <section className="pos-create-section">
            <h3>판매자</h3>
            <div className="pos-selected-members">
              {selectedMembers.map((member) => (
                <span key={member.studentId}>
                  {member.name} · {member.studentId}
                  <button
                    aria-label={`${member.name} 판매자 삭제`}
                    type="button"
                    onClick={() =>
                      setSelectedMembers((current) =>
                        current.filter(
                          (item) => item.studentId !== member.studentId,
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="pos-member-search">
              <input
                value={memberQuery}
                placeholder="이름 또는 학번 검색"
                onChange={(event) => setMemberQuery(event.target.value)}
              />
              {memberResults.length ? (
                <div className="pos-member-results">
                  {memberResults.map((member) => (
                    <button
                      key={member.studentId}
                      type="button"
                      onClick={() => {
                        setSelectedMembers((current) => [...current, member]);
                        setMemberQuery("");
                      }}
                    >
                      <strong>{member.name}</strong>
                      <span>{member.studentId}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="pos-create-section">
            <h3>판매 품목</h3>
            <div className="pos-product-form">
              <label>
                품목명
                <input
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                가격
                <input
                  min={0}
                  type="number"
                  value={productForm.price}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      price: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                재고
                <input
                  min={0}
                  type="number"
                  value={productForm.stock}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      stock: event.target.value,
                    })
                  }
                />
              </label>
              <button type="button" onClick={addProduct}>
                품목 추가
              </button>
            </div>

            {products.length ? (
              <div className="pos-draft-list">
                {products.map((product) => (
                  <div key={product.key}>
                    <strong>{product.name}</strong>
                    <span>{formatCurrency(product.price)}</span>
                    <span>재고 {product.stock}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setProducts((current) =>
                          current.filter((item) => item.key !== product.key),
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-copy">추가된 품목이 없습니다.</p>
            )}
          </section>

          <div className="card-actions">
            <button disabled={isCreating} type="button" onClick={() => setShowCreate(false)}>
              취소
            </button>
            <button disabled={isCreating} type="submit">
              {isCreating ? <BusyLabel /> : "인스턴스 생성"}
            </button>
          </div>
        </form>
      ) : null}

      {/* 2026-07-23: POS 인스턴스를 생성일과 작성자가 보이는 클릭형 행 목록으로 표시한다. */}
      {instances.length === 0 ? (
        <EmptyState title="POS 인스턴스가 없습니다." />
      ) : (
        <div className="pos-instance-list">
          <div className="pos-instance-list-head">
            <span>인스턴스 이름</span>
            <span>상태</span>
            <span>생성일</span>
            <span>작성자</span>
          </div>
          {instances.map((instance) => (
            <button
              className="pos-instance-row"
              key={instance.id}
              type="button"
              onClick={() => navigate(`/pos/instances/${instance.id}`)}
            >
              <strong>{instance.instanceName}</strong>
              <span className={`status-pill ${instance.status}`}>
                {statusLabel(instance.status)}
              </span>
              <span>{formatDate(instance.createdAt)}</span>
              <span>{instance.creatorName ?? "-"}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function statusLabel(status: PosInstance["status"]) {
  if (status === "active") return "판매 중";
  if (status === "closed") return "마감";
  return "판매 종료";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
