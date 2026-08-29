import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { BlobReader, BlobWriter, type Entry, type FileEntry, TextReader, TextWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
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

interface NewMemberRow {
  key: number;
  studentId: string;
  name: string;
  major: string;
  phone: string;
  gender: "남자" | "여자";
  generation: number;
  authority: (typeof MEMBER_AUTHORITIES)[number];
}

const EXCEL_HEADERS = ["학번", "이름", "학과(부)", "전화번호", "성별", "기수"];
const MEMBER_TEMPLATE_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_MEMBER_SPREADSHEET_BYTES = 5 * 1024 * 1024;
const MAX_MEMBER_SPREADSHEET_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;"
  })[character] ?? character);
}

function excelColumnName(column: number) {
  let remaining = column;
  let result = "";
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

function excelColumnIndex(cellReference: string | null) {
  const letters = cellReference?.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  return letters.split("").reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseSpreadsheetXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("엑셀 파일 형식이 올바르지 않습니다.");
  }
  return document;
}

function isFileEntry(entry: Entry): entry is FileEntry {
  return !entry.directory;
}

// 2026-08-29: Read only the first worksheet of a small XLSX archive so member imports do not require a vulnerable spreadsheet parser.
async function readMemberSpreadsheet(file: File): Promise<string[][]> {
  if (file.size > MAX_MEMBER_SPREADSHEET_BYTES) {
    throw new Error("회원 엑셀 파일은 5MB 이하만 업로드할 수 있습니다.");
  }

  const zipReader = new ZipReader(new BlobReader(file));
  try {
    const entries = await zipReader.getEntries();
    const totalUncompressedSize = entries.reduce((total, entry) => total + (entry.uncompressedSize || 0), 0);
    if (totalUncompressedSize > MAX_MEMBER_SPREADSHEET_UNCOMPRESSED_BYTES) {
      throw new Error("압축을 푼 엑셀 파일 크기가 너무 큽니다.");
    }

    const fileEntries = entries.filter(isFileEntry);
    const sheetEntry = fileEntries
      .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.filename))
      .sort((left, right) => left.filename.localeCompare(right.filename, undefined, { numeric: true }))
      .at(0);
    if (!sheetEntry) {
      throw new Error("첫 번째 시트를 찾을 수 없습니다. .xlsx 형식인지 확인해 주세요.");
    }

    const sharedStringEntry = fileEntries.find((entry) => entry.filename === "xl/sharedStrings.xml");
    const sharedStrings = sharedStringEntry
      ? Array.from(parseSpreadsheetXml(await sharedStringEntry.getData(new TextWriter())).getElementsByTagNameNS("*", "si"))
          .map((item) => Array.from(item.getElementsByTagNameNS("*", "t")).map((text) => text.textContent ?? "").join(""))
      : [];
    const sheetDocument = parseSpreadsheetXml(await sheetEntry.getData(new TextWriter()));

    return Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).map((row) => {
      const values: string[] = [];
      for (const cell of Array.from(row.getElementsByTagNameNS("*", "c"))) {
        const index = excelColumnIndex(cell.getAttribute("r"));
        const type = cell.getAttribute("t");
        const rawValue = cell.getElementsByTagNameNS("*", "v").item(0)?.textContent ?? "";
        const value = type === "s"
          ? sharedStrings[Number(rawValue)] ?? ""
          : type === "inlineStr"
            ? Array.from(cell.getElementsByTagNameNS("*", "t")).map((text) => text.textContent ?? "").join("")
            : rawValue;
        values[index] = value;
      }
      return values;
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("회원 엑셀")) throw error;
    if (error instanceof Error && error.message.includes("압축을 푼")) throw error;
    if (error instanceof Error && error.message.includes("첫 번째 시트")) throw error;
    if (error instanceof Error && error.message.includes("엑셀 파일 형식")) throw error;
    throw new Error(".xlsx 형식의 회원 엑셀 파일만 불러올 수 있습니다.", { cause: error });
  } finally {
    await zipReader.close();
  }
}

export function MemberPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Member | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filters, setFilters] = useState({ query: "", authority: "", generation: "", linked: "" });
  const [isAdding, setIsAdding] = useState(false);
  const [newMembers, setNewMembers] = useState<NewMemberRow[]>([]);
  const [nextNewMemberKey, setNextNewMemberKey] = useState(1);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [isImportingMembers, setIsImportingMembers] = useState(false);

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
    setActionMessage(null);
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
      setActionMessage(`${draft.name} 회원 정보를 수정했습니다.`);
      cancelEditing();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "회원 정보를 수정하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  // 2026-08-22: Member deletion is deliberately available only from an explicit edit state.
  async function deleteMember() {
    if (!editingStudentId || !draft) return;
    if (!window.confirm(`${draft.name}(${editingStudentId}) 회원을 삭제할까요? 사용자 계정과 작성 기록은 삭제되지 않습니다.`)) return;

    setIsDeleting(true);
    setActionError(null);
    try {
      await requestData(`/api/members/${encodeURIComponent(editingStudentId)}`, { method: "DELETE" });
      setMembers((current) => current.filter((member) => member.studentId !== editingStudentId));
      setActionMessage(`${draft.name} 회원을 삭제했습니다.`);
      cancelEditing();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "회원을 삭제하지 못했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  // 2026-08-29: Restore the legacy member Excel/template/manual-entry flow in the React member management page.
  function createBlankMemberRow(key: number): NewMemberRow {
    return {
      key,
      studentId: "",
      name: "",
      major: "",
      phone: "",
      gender: "남자",
      generation: 1,
      authority: "부원"
    };
  }

  function openMemberAddPanel() {
    setIsAdding(true);
    setActionError(null);
    setActionMessage(null);
    if (newMembers.length === 0) {
      setNewMembers([createBlankMemberRow(nextNewMemberKey)]);
      setNextNewMemberKey((current) => current + 1);
    }
  }

  function addMemberRow() {
    setNewMembers((current) => [...current, createBlankMemberRow(nextNewMemberKey)]);
    setNextNewMemberKey((current) => current + 1);
  }

  function updateNewMemberRow<K extends keyof NewMemberRow>(
    key: number,
    field: K,
    value: NewMemberRow[K]
  ) {
    setNewMembers((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
  }

  async function downloadMemberTemplate() {
    const zipWriter = new ZipWriter(new BlobWriter(MEMBER_TEMPLATE_MIME));
    const addTextFile = (name: string, content: string) => zipWriter.add(name, new TextReader(content));
    const headerCells = EXCEL_HEADERS.map((header, index) => `<c r="${excelColumnName(index + 1)}1" t="inlineStr"><is><t>${escapeXml(header)}</t></is></c>`).join("");
    await addTextFile("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    await addTextFile("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    await addTextFile("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="부원양식" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    await addTextFile("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
    await addTextFile("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${headerCells}</row></sheetData></worksheet>`);
    const fileUrl = URL.createObjectURL(await zipWriter.close());
    const anchor = document.createElement("a");
    anchor.href = fileUrl;
    anchor.download = "부원_양식.xlsx";
    anchor.click();
    URL.revokeObjectURL(fileUrl);
  }

  async function importMemberExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setActionError(null);
    setIsImportingMembers(true);
    try {
      const values = await readMemberSpreadsheet(file);
      const headers = (values[0] ?? []).map((value) => String(value).trim());
      if (EXCEL_HEADERS.some((header, index) => headers[index] !== header)) {
        throw new Error("엑셀 첫 행은 학번, 이름, 학과(부), 전화번호, 성별, 기수 순서여야 합니다.");
      }
      const importedRows = values.slice(1).filter((row) => row.some((value) => String(value ?? "").trim())).map((row) => {
        const gender: NewMemberRow["gender"] = String(row[4] ?? "").trim() === "여자" ? "여자" : "남자";
        return {
          key: 0,
          studentId: String(row[0] ?? "").trim(),
          name: String(row[1] ?? "").trim(),
          major: String(row[2] ?? "").trim(),
          phone: String(row[3] ?? "").trim(),
          gender,
          generation: Math.max(1, Number(row[5]) || 1),
          authority: "부원" as const
        };
      });
      if (importedRows.length === 0) {
        throw new Error("등록할 회원 행이 없습니다.");
      }
      setNewMembers(importedRows.map((row, index) => ({ ...row, key: nextNewMemberKey + index })));
      setNextNewMemberKey((current) => current + importedRows.length);
      setIsAdding(true);
      setActionMessage(`${importedRows.length}명의 회원 정보를 불러왔습니다. 내용을 확인한 뒤 저장해 주세요.`);
    } catch (importError) {
      setActionError(importError instanceof Error ? importError.message : "엑셀 파일을 읽지 못했습니다.");
    } finally {
      setIsImportingMembers(false);
    }
  }

  async function saveNewMembers() {
    const invalidRow = newMembers.find((row) => !row.studentId.trim() || !row.name.trim());
    if (invalidRow) {
      setActionError("모든 행에 학번과 이름을 입력해 주세요.");
      return;
    }
    setIsAddingMembers(true);
    setActionError(null);
    try {
      await Promise.all(
        newMembers.map((row) =>
          requestData<{ id: string }>("/api/members", {
            method: "POST",
            body: JSON.stringify({
              studentId: row.studentId.trim(),
              name: row.name.trim(),
              major: row.major.trim(),
              phone: row.phone.trim(),
              gender: row.gender,
              generation: row.generation,
              authority: row.authority
            })
          })
        )
      );
      const data = await requestData<{ members: Member[] }>("/api/members");
      setMembers(data.members ?? []);
      setActionMessage(`${newMembers.length}명의 회원 정보를 저장했습니다.`);
      setNewMembers([]);
      setIsAdding(false);
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "회원 정보를 저장하지 못했습니다.");
    } finally {
      setIsAddingMembers(false);
    }
  }

  const generations = Array.from(new Set(members.map((member) => member.generation))).sort((a, b) => b - a);
  // 2026-08-22: Combine independent member filters without sending personal details back to the server repeatedly.
  const filteredMembers = useMemo(() => {
    const keyword = filters.query.trim().toLocaleLowerCase("ko-KR");
    return members.filter((member) => {
      const matchesKeyword = !keyword || `${member.name} ${member.studentId} ${member.major ?? ""} ${member.phoneNumber ?? ""}`.toLocaleLowerCase("ko-KR").includes(keyword);
      const matchesAuthority = !filters.authority || member.authorityLabel === filters.authority;
      const matchesGeneration = !filters.generation || member.generation === Number(filters.generation);
      const matchesLinked = !filters.linked || (filters.linked === "linked" ? Boolean(member.userId) : !member.userId);
      return matchesKeyword && matchesAuthority && matchesGeneration && matchesLinked;
    });
  }, [filters, members]);

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
        <div className="toolbar">
          <button type="button" onClick={openMemberAddPanel}>회원 추가</button>
        </div>
      </div>

      {actionMessage ? <div className="page-state success">{actionMessage}</div> : null}
      {actionError ? <div className="page-state error">{actionError}</div> : null}

      {isAdding ? (
        <section className="form-panel member-add-panel">
          <div className="member-add-heading">
            <div>
              <h2>회원 추가</h2>
              <p>엑셀 양식을 내려받아 올리거나, 행을 추가해 직접 입력할 수 있습니다.</p>
            </div>
            <div className="toolbar">
              <button className="secondary-button" type="button" onClick={downloadMemberTemplate}>양식 받기</button>
              <label className="secondary-button file-action-button">
                {isImportingMembers ? "불러오는 중..." : "엑셀로 추가"}
                <input accept=".xlsx" disabled={isImportingMembers} onChange={importMemberExcel} type="file" />
              </label>
              <button className="secondary-button" type="button" onClick={addMemberRow}>직접 수기 추가</button>
            </div>
          </div>
          <div className="table-wrap member-add-table-wrap">
            <table className="data-table member-table member-add-table">
              <thead><tr><th>학번</th><th>이름</th><th>학과(부)</th><th>전화번호</th><th>성별</th><th>기수</th><th>권한</th><th>삭제</th></tr></thead>
              <tbody>
                {newMembers.map((row) => (
                  <tr key={row.key}>
                    <td><input aria-label="학번" inputMode="numeric" value={row.studentId} onChange={(event) => updateNewMemberRow(row.key, "studentId", event.target.value)} /></td>
                    <td><input aria-label="이름" value={row.name} onChange={(event) => updateNewMemberRow(row.key, "name", event.target.value)} /></td>
                    <td><input aria-label="학과(부)" value={row.major} onChange={(event) => updateNewMemberRow(row.key, "major", event.target.value)} /></td>
                    <td><input aria-label="전화번호" inputMode="tel" value={row.phone} onChange={(event) => updateNewMemberRow(row.key, "phone", event.target.value)} /></td>
                    <td><select aria-label="성별" value={row.gender} onChange={(event) => updateNewMemberRow(row.key, "gender", event.target.value as NewMemberRow["gender"])}><option value="남자">남자</option><option value="여자">여자</option></select></td>
                    <td><input aria-label="기수" min={1} type="number" value={row.generation} onChange={(event) => updateNewMemberRow(row.key, "generation", Math.max(1, Number(event.target.value) || 1))} /></td>
                    <td><select aria-label="권한" value={row.authority} onChange={(event) => updateNewMemberRow(row.key, "authority", event.target.value as NewMemberRow["authority"])}>{MEMBER_AUTHORITIES.map((authority) => <option key={authority} value={authority}>{authority}</option>)}</select></td>
                    <td><button aria-label={`${row.name || "새 회원"} 행 삭제`} className="danger-button" type="button" onClick={() => setNewMembers((current) => current.filter((item) => item.key !== row.key))}>삭제</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar member-add-actions">
            <button className="secondary-button" disabled={isAddingMembers} type="button" onClick={() => { setIsAdding(false); setNewMembers([]); }}>취소</button>
            <button disabled={isAddingMembers || newMembers.length === 0} type="button" onClick={saveNewMembers}>{isAddingMembers ? "저장 중..." : `${newMembers.length}명 저장`}</button>
          </div>
        </section>
      ) : null}

      <section className="filter-panel member-filter-panel" aria-label="회원 검색 필터">
        <label>검색<input value={filters.query} placeholder="이름, 학번, 전공, 연락처" onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label>
        <label>권한<select value={filters.authority} onChange={(event) => setFilters({ ...filters, authority: event.target.value })}><option value="">전체</option>{MEMBER_AUTHORITIES.map((authority) => <option key={authority}>{authority}</option>)}</select></label>
        <label>기수<select value={filters.generation} onChange={(event) => setFilters({ ...filters, generation: event.target.value })}><option value="">전체</option>{generations.map((generation) => <option key={generation} value={generation}>{generation}기</option>)}</select></label>
        <label>계정 연결<select value={filters.linked} onChange={(event) => setFilters({ ...filters, linked: event.target.value })}><option value="">전체</option><option value="linked">연결됨</option><option value="unlinked">미연결</option></select></label>
        <span className="filter-result"><strong>{filteredMembers.length}</strong>명</span>
      </section>

      {members.length === 0 ? (
        <EmptyState title="등록된 회원이 없습니다." />
      ) : filteredMembers.length === 0 ? (
        <EmptyState title="조건에 맞는 회원이 없습니다." />
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
              {filteredMembers.map((member) => {
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
                          <button className="danger-button" disabled={isSaving || isDeleting} type="button" onClick={deleteMember}>
                            {isDeleting ? "삭제 중" : "회원 삭제"}
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
