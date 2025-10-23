export function initEventFormModal() {
  const recruitCheckbox = document.querySelector('input[name="isrecruiting"]');
  const recruitTimeDiv = document.getElementById("recruit-time");
  const recruitStartInput = recruitTimeDiv.querySelector(
    'input[name="recruit_start"]'
  );
  const recruitEndInput = recruitTimeDiv.querySelector(
    'input[name="recruit_end"]'
  );

  const overlay = document.getElementById("modal-overlay");
  const cancelButton = document.querySelector(".cancel");

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

  cancelButton.addEventListener("click", function () {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  });
}
