export function initEventInfoModal() {
  const valueDiv = document.querySelector(".values").dataset;
  const participants = JSON.parse(valueDiv.participants);
  const currentKakaoId = valueDiv.currentKakaoId;
  const sessionAuthority = valueDiv.sessionAuthority;
  const currentEvent = JSON.parse(valueDiv.currentEvent);
  const eventId = currentEvent.id;

  let isChanged = false;

  const recruitCheckbox = document.querySelector('input[name="isrecruiting"]');
  let recruitTimeDiv = "";
  let recruitStartInput = "";
  let recruitEndInput = "";
  if (currentEvent.isRecruiting) {
    recruitTimeDiv = document.getElementById("recruit-time");
    recruitStartInput = recruitTimeDiv.querySelector('input[name="recruit_start"]');
    recruitEndInput = recruitTimeDiv.querySelector('input[name="recruit_end"]');
  }
  const participateButton = document.querySelector(".participate");
  const cancleButton = document.querySelector(".cancel");
  const editButton = document.querySelector(".edit");
  const deleteButton = document.querySelector(".delete");
  const postButton = document.querySelector(".post");
  const editcancelButton = document.querySelector(".editcancel");

  const overlay = document.getElementById("modal-overlay");
  const inputs = document.querySelectorAll("input, textarea, select");

  const today = new Date();
  const recruit_start = new Date(currentEvent.recruit_start);
  const recruit_end = new Date(currentEvent.recruit_end);

  if (currentEvent.isRecruiting && recruit_start < today && recruit_end > today) {
    if (!participants.some((p) => `${p.kakao_id}` === currentKakaoId)) {
      participateButton.classList.remove("hidden");
    } else {
      cancleButton.classList.remove("hidden");
    }
  }

  if (
    currentEvent.authority < sessionAuthority ||
    currentEvent.author_kakao_id === currentKakaoId
  ) {
    editButton.classList.remove("hidden");
  }

  // 닫기 버튼
  document.querySelector(".close-modal").addEventListener("click", () => {
    if (isChanged) window.location.reload();
    else {
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
    }
  });

  recruitCheckbox.addEventListener("change", function (e) {
    if (e.target.checked) {
      recruitTimeDiv.classList.remove("hidden");
      recruitStartInput.required = true;
      recruitEndInput.required = true;
    } else {
      recruitTimeDiv.classList.add("hidden");
      recruitStartInput.required = false;
      recruitEndInput.required = false;
    }
  });

  participateButton.addEventListener("click", async function (e) {
    const resp = await fetch(`/event/participate?id=${eventId}`);
    if (resp.ok) {
      cancleButton.classList.remove("hidden");
      participateButton.classList.add("hidden");
      isChanged = true;
    }
  });

  cancleButton.addEventListener("click", async function (e) {
    const resp = await fetch(`/event/cancel?id=${eventId}`);
    if (resp.ok) {
      cancleButton.classList.add("hidden");
      participateButton.classList.remove("hidden");
      isChanged = true;
    }
  });

  deleteButton.addEventListener("click", async function (e) {
    const resp = await fetch(`/event/delete?id=${eventId}`);
    if (resp.ok) {
      window.location.reload();
    }
  });

  editButton.addEventListener("click", function (e) {
    inputs.forEach((input) => {
      input.disabled = false;
    });
    editButton.classList.add("hidden");
    postButton.classList.remove("hidden");
    editcancelButton.classList.remove("hidden");
    deleteButton.classList.remove("hidden");

    participateButton.classList.add("hidden");
    cancleButton.classList.add("hidden");
  });

  editcancelButton.addEventListener("click", function (e) {
    inputs.forEach((input) => {
      input.disabled = true;
    });
    postButton.classList.add("hidden");
    editcancelButton.classList.add("hidden");
    deleteButton.classList.add("hidden");
    editButton.classList.remove("hidden");

    if (currentEvent.isRecruiting) {
      if (!participants.some((p) => `${p.kakao_id}` === currentKakaoId)) {
        participateButton.classList.remove("hidden");
      } else {
        cancleButton.classList.remove("hidden");
      }
    }
  });
}
