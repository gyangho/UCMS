import { initFormChangeModal } from "./formlist.js";

document.addEventListener("DOMContentLoaded", () => {
  // 검색
  {
    const searchToggles = document.querySelectorAll(".search-toggle");
    const searchInputs = document.querySelectorAll(".search-input");
    const searchClosesBtns =
      document.querySelectorAll(".close-search");
    const allsearchContaiers = document.querySelectorAll(
      ".search-input-container"
    );

    if (currentSearch != "" && currentColumn != "") {
      const currentSearchContainer =
        document.getElementById(currentColumn);
      currentSearchContainer.children[0].value = currentSearch;
      currentSearchContainer.classList.remove("hidden");
    }

    searchToggles.forEach((toggle) => {
      toggle.addEventListener("click", function () {
        allsearchContaiers.forEach((inputContainer) => {
          inputContainer.classList.add("hidden");
        });
        const th = this.closest("th");
        const inputContainer = th.querySelector(
          ".search-input-container"
        );
        const input = inputContainer.querySelector(".search-input");
        inputContainer.classList.remove("hidden"); // 보여주기
        input.focus(); // 포커스를 설정
      });
    });

    searchInputs.forEach((input) => {
      input.addEventListener("change", function (e) {
        const th = this.closest("th");
        const column = th.getAttribute("data-column");
        const value = this.value.trim();
        if (value) {
          window.location.href = `/recruit/responses?page=1&limit=10&column=${column}&search=${encodeURIComponent(
            value
          )}`;
        }
      });
    });

    searchClosesBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        window.location.href = "/recruit/responses";
      });
    });
  }

  const syncForm = document.querySelector(".sync-container");
  const icon = syncBtn.querySelector(".icon-sync");

  syncForm.addEventListener("submit", () => {
    // 애니메이션 시작
    icon.classList.add("spinning");
    syncBtn.disabled = true;

    // 5초 뒤에 실행될 알림 타이머
    const timer = setTimeout(() => {
      alert("응답 불러오기 실패: 요청이 너무 오래 걸립니다.");
    }, 5000);

    // — navigation 이 시작되면 이 이벤트가 불리며, 타이머를 제거합니다.
    window.addEventListener(
      "beforeunload",
      () => {
        clearTimeout(timer);
      },
      { once: true }
    );
  });

  const URLChangeBtn = document.getElementById("URLChangeBtn");
  const overlay = document.getElementById("modal-overlay");

  URLChangeBtn.addEventListener("click", async () => {
    try {
      const resp = await fetch(`/recruit/formlist`);
      if (!resp.ok) throw new Error("서버 응답 에러");
      const html = await resp.text();

      // ① HTML 삽입
      overlay.innerHTML = html;
      overlay.classList.remove("hidden");
      initFormChangeModal();
    } catch (err) {
      console.error(err);
      alert("모달을 불러오는 데 실패했습니다.");
    }
  });
});
