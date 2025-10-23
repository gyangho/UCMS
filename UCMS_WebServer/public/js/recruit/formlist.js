export function initFormChangeModal() {
  const overlay = document.getElementById("modal-overlay");
  document
    .querySelector(".close-modal")
    .addEventListener("click", () => {
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
    });

  // const formSelect = document.querySelector(".modal-btn.submit");
  // const formChange = document.querySelector("#formchange");
  // formSelect.addEventListener("click", async () => {
  //   if (formChange.newURL.value) {
  //     formId = formChange.newURL.value;
  //     const resp = await fetch(`/recruit/formlist`);
  //   } else {
  //     formId = formChange.URLSelect.value;
  //   }
  //   window.sessionStorage.setItem("currentFormID", formId);
  //   window.location.href = `/recruit/responses?formId=${formId}`;
  // });
}
