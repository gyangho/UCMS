export function initFormChangeModal() {
  const overlay = document.getElementById("modal-overlay");
  document.querySelector(".close-modal").addEventListener("click", () => {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  });

  const formSelect = document.getElementById("URLSelect");
  //   const currentForm = window.sessionStorage.getItem(currentForm);
  //   if (currentForm) {
  //     formSelect.value = currentForm.title;
  //   }
}
