export function initSettlementModal() {
  const overlay = document.getElementById("modal-overlay");
  const cancelButton = document.querySelector(".cancel");
  const form = document.getElementById("settlementForm");

  let participants = [];
  let isEqualAmount = true;

  // 멤버 목록 (서버에서 전달받은 데이터)
  const members = JSON.parse(
    document.querySelector(".values").dataset.members
  );
  const events = JSON.parse(
    document.querySelector(".values").dataset.events
  );

  // 참여자 추가 함수
  function addParticipant(memberId = "", memberName = "") {
    const participantId = Date.now();
    const participant = {
      id: participantId,
      member_id: memberId,
      name: memberName,
      amount: 0,
    };

    participants.push(participant);
    renderParticipants();
  }

  // 참여자 목록 렌더링
  function renderParticipants(updateAmounts = true) {
    const participantsList = document.getElementById(
      "participantsList"
    );
    const isDutchPay =
      document.getElementById("is_dutch_pay").checked;

    participantsList.innerHTML = participants
      .map(
        (participant) => `
      <div class="participant-item" data-id="${participant.id}">
        <select name="member_id" required>
          <option value="">멤버 선택</option>
          ${members
            .map(
              (member) =>
                `<option value="${member.student_id}" ${
                  member.student_id === participant.member_id
                    ? "selected"
                    : ""
                }>
              ${member.name} (${member.student_id})
            </option>`
            )
            .join("")}
        </select>
        <input type="number" name="amount" placeholder="금액" value="${
          participant.amount
        }" ${!isDutchPay ? "readonly" : ""} required>
        <button type="button" class="remove-participant" onclick="removeParticipant(${
          participant.id
        })">제거</button>
      </div>
    `
      )
      .join("");

    if (updateAmounts) {
      updateAmountInputs();
    }
  }

  // 참여자 제거
  window.removeParticipant = function (id) {
    participants = participants.filter((p) => p.id !== id);
    renderParticipants();
  };

  // 전체 선택 체크박스 상태 업데이트
  function updateSelectAllCheckbox() {
    const eventCheckboxes = document.querySelectorAll(
      "#eventParticipantsList input[type='checkbox']"
    );
    const selectAllCheckbox = document.getElementById(
      "selectAllEventParticipants"
    );

    if (eventCheckboxes.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }

    const checkedCount = Array.from(eventCheckboxes).filter(
      (cb) => cb.checked
    ).length;

    if (checkedCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === eventCheckboxes.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  // 금액 입력 업데이트
  function updateAmountInputs() {
    const totalAmount =
      parseInt(document.getElementById("total_amount").value) || 0;
    const participantCount = participants.length;
    const isDutchPay =
      document.getElementById("is_dutch_pay").checked;

    if (participantCount > 0) {
      if (isDutchPay) {
        // 더치페이인 경우: 총 금액을 참여자 수로 나누어 분배
        if (isEqualAmount) {
          const equalAmount = Math.floor(
            totalAmount / participantCount
          );
          const remainder = totalAmount % participantCount;

          participants.forEach((participant, index) => {
            participant.amount =
              equalAmount + (index < remainder ? 1 : 0);
          });
        }
        // 개별 금액 모드에서는 사용자가 직접 입력
      } else {
        // 더치페이가 아닌 경우: 총 금액을 모든 참여자에게 부과
        participants.forEach((participant) => {
          participant.amount = totalAmount;
        });
      }

      renderParticipants(false); // 금액 업데이트 시에는 updateAmountInputs를 호출하지 않음
    }
  }

  // 이벤트 선택 시 참여자 불러오기
  document
    .getElementById("event_select")
    .addEventListener("change", async function () {
      const eventId = this.value;
      const eventParticipantsDiv = document.getElementById(
        "eventParticipants"
      );
      const eventParticipantsList = document.getElementById(
        "eventParticipantsList"
      );

      if (eventId) {
        try {
          const response = await fetch(
            `/finance/events/${eventId}/participants`
          );
          const eventParticipants = await response.json();

          if (eventParticipants.length > 0) {
            eventParticipantsList.innerHTML = eventParticipants
              .map(
                (participant) =>
                  `<div>
               <input type="checkbox" id="event_participant_${participant.student_id}" value="${participant.student_id}">
               <label for="event_participant_${participant.student_id}">${participant.name} (${participant.student_id})</label>
             </div>`
              )
              .join("");

            eventParticipantsDiv.style.display = "block";
            // 전체 선택 체크박스 상태 초기화
            updateSelectAllCheckbox();
          } else {
            eventParticipantsDiv.style.display = "none";
            // 전체 선택 체크박스 상태 초기화
            updateSelectAllCheckbox();
          }
        } catch (error) {
          console.error("이벤트 참여자 조회 오류:", error);
        }
      } else {
        eventParticipantsDiv.style.display = "none";
      }
    });

  // 전체 선택 체크박스 이벤트
  document
    .getElementById("selectAllEventParticipants")
    .addEventListener("change", function () {
      const eventCheckboxes = document.querySelectorAll(
        "#eventParticipantsList input[type='checkbox']"
      );
      const isChecked = this.checked;

      eventCheckboxes.forEach((checkbox) => {
        checkbox.checked = isChecked;
        if (isChecked) {
          const memberId = checkbox.value;
          const memberName =
            checkbox.nextElementSibling.textContent.split(" (")[0];

          if (!participants.find((p) => p.member_id === memberId)) {
            addParticipant(memberId, memberName);
          }
        }
      });
    });

  // 이벤트 참여자 선택 시 정산 참여자에 추가
  document
    .getElementById("eventParticipantsList")
    .addEventListener("change", function (e) {
      if (e.target.type === "checkbox") {
        const memberId = e.target.value;
        const memberName =
          e.target.nextElementSibling.textContent.split(" (")[0];

        if (e.target.checked) {
          // 선택된 경우 정산 참여자에 추가
          if (!participants.find((p) => p.member_id === memberId)) {
            addParticipant(memberId, memberName);
          }
        } else {
          // 선택 해제된 경우 정산 참여자에서 제거
          participants = participants.filter(
            (p) => p.member_id !== memberId
          );
          renderParticipants();
        }

        // 전체 선택 체크박스 상태 업데이트
        updateSelectAllCheckbox();
      }
    });

  // 금액 옵션 버튼
  document
    .getElementById("equalAmount")
    .addEventListener("click", function () {
      isEqualAmount = true;
      this.classList.add("active");
      document
        .getElementById("individualAmount")
        .classList.remove("active");
      updateAmountInputs();
    });

  document
    .getElementById("individualAmount")
    .addEventListener("click", function () {
      isEqualAmount = false;
      this.classList.add("active");
      document
        .getElementById("equalAmount")
        .classList.remove("active");
      updateAmountInputs();
    });

  // 참여자 추가 버튼
  document
    .getElementById("addParticipant")
    .addEventListener("click", function () {
      addParticipant();
    });

  // 총 금액 변경 시 동일 금액 업데이트
  document
    .getElementById("total_amount")
    .addEventListener("input", updateAmountInputs);

  // 더치페이 체크박스 변경 시 금액 업데이트
  document
    .getElementById("is_dutch_pay")
    .addEventListener("change", function () {
      updateAmountInputs();
      renderParticipants(false); // 참여자 목록 다시 렌더링 (금액 입력 필드 readonly 상태 변경)
    });

  // 멤버 선택 변경 시 이름 업데이트
  document
    .getElementById("participantsList")
    .addEventListener("change", function (e) {
      if (e.target.name === "member_id") {
        const selectedMember = members.find(
          (m) => m.student_id === e.target.value
        );
        const participantItem = e.target.closest(".participant-item");
        const participantId = parseInt(participantItem.dataset.id);
        const participant = participants.find(
          (p) => p.id === participantId
        );

        if (participant && selectedMember) {
          participant.member_id = selectedMember.student_id;
          participant.name = selectedMember.name;
        }
      }
    });

  // 폼 제출
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const formData = new FormData(this);
    const participantsData = participants.map((participant) => ({
      member_id: participant.member_id,
      amount: participant.amount,
    }));

    const data = {
      name: formData.get("name"),
      total_amount: formData.get("total_amount"),
      deadline: formData.get("deadline"),
      is_dutch_pay: formData.get("is_dutch_pay") === "on",
      participants: participantsData,
    };

    try {
      const response = await fetch("/finance/settle/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        alert("정산이 성공적으로 생성되었습니다.");
        overlay.classList.add("hidden");
        overlay.innerHTML = "";
        // 정산 생성 후 목록 새로고침
        if (window.loadUserSettlements) {
          window.loadUserSettlements();
        }
        window.location.href = "/dashboard";
      } else {
        alert("정산 생성에 실패했습니다.");
      }
    } catch (error) {
      console.error("정산 생성 오류:", error);
      alert("정산 생성 중 오류가 발생했습니다.");
    }
  });

  // 취소 버튼
  cancelButton.addEventListener("click", function () {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  });

  // 초기 설정
  document.getElementById("equalAmount").classList.add("active");
  addParticipant();
}
