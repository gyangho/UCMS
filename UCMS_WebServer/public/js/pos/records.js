document.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch("/api/records");
  const data = await res.json();
  const { records, summary } = data;

  const recordBox = document.getElementById("records");
  const summaryBox = document.getElementById("summary");
  const summaryPanel = document.getElementById("summary-panel");
  const summaryToggle = document.getElementById("summary-toggle");

  recordBox.innerHTML = "";
  records.forEach((record) => {
    const div = document.createElement("div");
    div.classList.add("record-entry");

    const itemList = Object.entries(record)
      .filter(
        ([key, val]) =>
          !["id", "purchase_time", "total_price", "paid"].includes(
            key
          ) && val > 0
      )
      .map(([key, val]) => `<li>${key} × ${val}</li>`)
      .join("");

    div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>🕒 ${new Date(
                record.purchase_time
              ).toLocaleString()}</strong>
              <button class="delete-record" data-id="${
                record.id
              }" title="삭제">❌</button>
            </div>
            <ul>${itemList}</ul>
            💳 총액: ${record.total_price.toLocaleString()}원
        `;

    recordBox.appendChild(div);
  });

  // 삭제 버튼 이벤트 등록
  document.querySelectorAll(".delete-record").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-id");
      const confirmDelete = confirm(
        "이 구매 기록을 삭제하시겠습니까?"
      );
      if (!confirmDelete) return;

      const res = await fetch(`/api/records/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        alert("삭제되었습니다.");
        location.reload();
      } else {
        alert("삭제 실패");
      }
    });
  });

  // 하단 통계
  summaryBox.innerHTML = `
      <h3>💰매출 통계💰</h3>
      <ul style="list-style-type: none; padding-inline-start: 0;">
        ${Object.entries(summary)
          .filter(([k, _]) => k !== "total_price")
          .map(
            ([k, v]) =>
              `<li style="padding:2px;">${k} 판매 수: ${v}개</li>`
          )
          .join("")}
      </ul>
      <strong>💰 총 매출: ${summary.total_price.toLocaleString()}원</strong>
    `;

  // Toggle collapse for summary
  if (summaryToggle) {
    summaryToggle.addEventListener("click", () => {
      summaryPanel.classList.toggle("collapsed");
    });
  }
});

document
  .getElementById("clear-data")
  .addEventListener("click", async () => {
    const confirmClear = confirm(
      "정말로 모든 구매 기록을 삭제하시겠습니까?"
    );
    if (!confirmClear) return;

    const res = await fetch("/api/records/clear", {
      method: "POST",
    });

    if (res.ok) {
      alert("모든 기록이 삭제되었습니다.");
      location.reload();
    } else {
      alert("삭제 실패");
    }
  });
