document.addEventListener("DOMContentLoaded", () => {
  // 검색
  {
    const searchToggles = document.querySelectorAll(".search-toggle");
    const searchInputs = document.querySelectorAll(".search-input");
    const searchClosesBtns = document.querySelectorAll(".close-search");
    const allsearchContaiers = document.querySelectorAll(".search-input-container");

    if (currentSearch != "" && currentColumn != "") {
      const currentSearchContainer = document.getElementById(currentColumn);
      currentSearchContainer.children[0].value = currentSearch;
      currentSearchContainer.classList.remove("hidden");
    }

    searchToggles.forEach((toggle) => {
      toggle.addEventListener("click", function () {
        allsearchContaiers.forEach((inputContainer) => {
          inputContainer.classList.add("hidden");
        });
        const th = this.closest("th");
        const inputContainer = th.querySelector(".search-input-container");
        const input = inputContainer.querySelector(".search-input");
        inputContainer.classList.remove("hidden"); // 보여주기
        input.focus(); // 포커스를 설정
      });
    });

    searchInputs.forEach((input) => {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          const th = this.closest("th");
          const column = th.getAttribute("data-column");
          const value = this.value.trim();
          if (value) {
            window.location.href = `/member?page=1&limit=10&column=${column}&search=${encodeURIComponent(
              value
            )}`;
          }
        }
      });
    });

    searchClosesBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        window.location.href = "/member";
      });
    });
  }

  // 수정
  // 1) 모든 edit 버튼에 클릭 핸들러 부착
  document.querySelectorAll("button.edit").forEach((editBtn) => {
    editBtn.addEventListener("click", () => {
      const tr = editBtn.closest("tr");
      const tds = tr.querySelectorAll("td");
      const id = tds[0].textContent.trim();

      // 현재 텍스트 추출
      const data = {
        student_id: id,
        name: tds[1].textContent.trim(),
        major: tds[2].textContent.trim(),
        phone: tds[3].textContent.trim(),
        gender: tds[4].textContent.trim(),
        generation: tds[5].textContent.trim(),
        authority: tds[6].textContent.trim(),
      };

      // 2) 각 셀을 input/select으로 교체
      // student_id는 PK 이므로 편집 불가, 그대로 텍스트 유지
      // 순서: 0=id, 1=name, 2=major, 3=phone, 4=gender, 5=generation, 6=actions
      tds[1].innerHTML = `<input class="edit-input" name="name" value="${data.name}" size=5 maxlength=8 />`;
      tds[2].innerHTML = `<input class="edit-input" name="major" value="${data.major}" size=20 maxlength=20 />`;
      tds[3].innerHTML = `<input class="edit-input" name="phone" value="${data.phone}" size=14 maxlength=14 />`;
      tds[4].innerHTML = `
        <select class="edit-select" name="gender">
          <option value="남자"${data.gender === "남자" ? " selected" : ""}>남자</option>
          <option value="여자"${data.gender === "여자" ? " selected" : ""}>여자</option>
        </select>
      `;
      tds[5].innerHTML = `<input class="edit-input" name="generation" value="${data.generation}" size=1 maxlength=3/>`;
      tds[6].innerHTML = `
        <select class="edit-select" name="authority">
          <option value="일반"${
            data.authority === "일반" ? " selected" : ""
          }>일반</option>
          <option value="부원"${
            data.authority === "부원" ? " selected" : ""
          }>부원</option>
          <option value="임원진"${
            data.authority === "임원진" ? " selected" : ""
          }>임원진</option>
          <option value="부회장"${
            data.authority === "부회장" ? " selected" : ""
          }>부회장</option>
          <option value="회장"${
            data.authority === "회장" ? " selected" : ""
          }>회장</option>
        </select>
      `;

      // 3) action 셀을 ✔️ 버튼으로 교체
      const actionCell = tds[7];
      actionCell.innerHTML = `<button class="icon-btn confirm">✔️</button>`;
      const confirmBtn = actionCell.querySelector("button.confirm");

      // 4) ✔️ 버튼 클릭 시 submit
      confirmBtn.addEventListener("click", async () => {
        const formData = new URLSearchParams();
        ["name", "major", "phone", "gender", "generation", "authority"].forEach(
          (field) => {
            const input = tr.querySelector(`[name="${field}"]`);
            formData.append(field, input.value);
          }
        );

        try {
          const res = await fetch(`/member/edit/${encodeURIComponent(id)}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
          });
          if (!res.ok) throw new Error("네트워크 오류");
          window.location.reload();
        } catch (err) {
          console.error(err);
          alert("수정에 실패했습니다.");
        }
      });
    });
  });

  const syncBtn = document.getElementById("syncBtn");
  const icon = syncBtn.querySelector(".icon-sync");

  syncBtn.addEventListener("click", async () => {
    // 1. 타임아웃(ms) 설정
    const TIMEOUT = 5000; // 5초

    // 2. AbortController 생성
    const controller = new AbortController();
    const { signal } = controller;

    // 3. 타임아웃 타이머 시작
    const timeoutId = setTimeout(() => {
      controller.abort(); // signal을 통해 fetch 취소
    }, TIMEOUT);

    // 애니메이션 시작
    icon.classList.add("spinning");
    syncBtn.disabled = true;

    try {
      const res = await fetch("/recruit/sync-form", {
        method: "POST",
        signal, // ← 여기에 추가
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          /* payload */
        }),
      });

      clearTimeout(timeoutId);

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "서버 오류");
      alert("✅ 동기화 완료");
    } catch (err) {
      console.error(err);
      alert("❌ 동기화 실패: " + err.message);
    } finally {
      // 애니메이션 중지
      icon.classList.remove("spinning");
      syncBtn.disabled = false;
    }
  });
});
