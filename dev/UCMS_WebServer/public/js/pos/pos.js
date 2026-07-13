const cart = {};
const cartContainer = document.getElementById("cart");
const totalEl = document.getElementById("total");

function renderCart() {
  cartContainer.innerHTML = "";
  let total = 0;

  Object.entries(cart).forEach(([name, item]) => {
    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <span>${name} (${item.qty}개)</span>
      <label style="margin-left:8px;">
        <input type="checkbox" onchange="toggleService('${name}', this.checked)" ${
      item.is_service ? "checked" : ""
    } /> 서비스
      </label>
      <button onclick="changeQty('${name}', 1)">+</button>
      <button onclick="changeQty('${name}', -1)">-</button>
    `;
    cartContainer.appendChild(div);

    total += (item.is_service ? 0 : item.price) * item.qty;
  });

  totalEl.textContent = `총합: ${total.toLocaleString()}원`;
}

function changeQty(name, delta) {
  cart[name].qty += delta;
  if (cart[name].qty <= 0) {
    delete cart[name];
  }
  renderCart();
}

function toggleService(name, checked) {
  if (!cart[name]) return;
  cart[name].is_service = !!checked;
  renderCart();
}

document.querySelectorAll(".products button").forEach((btn) => {
  const productId = parseInt(btn.dataset.productId);
  const name = btn.dataset.name;
  const price = parseInt(btn.dataset.price);

  if (name) {
    btn.addEventListener("click", () => {
      if (cart[name]) {
        cart[name].qty += 1;
        cart[name].price = price;
        cart[name].product_id = productId;
      } else {
        cart[name] = {
          qty: 1,
          price,
          product_id: productId,
          is_service: false,
        };
      }
      renderCart();
    });
  }
});

document.getElementById("clear").addEventListener("click", () => {
  if (confirm("초기화 하시겠습니까?")) {
    Object.keys(cart).forEach((key) => delete cart[key]);
    renderCart();
  }
});

document
  .getElementById("close")
  .addEventListener("click", async () => {
    if (confirm("판매를 종료하시겠습니까?")) {
      const pathParts = window.location.pathname.split("/"); // ['/pos', '3']
      const id = pathParts[pathParts.length - 1]; // '3' (문자열)
      // 서버에 POST 요청
      const response = await fetch("/api/pos/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: id }),
      });
      const data = await response.json();
      if (data.success) {
        // 성공하면 이동
        window.location.href = "/pos";
      } else {
        alert("판매 종료에 실패했습니다.");
      }
    }
  });

document
  .getElementById("purchase")
  .addEventListener("click", async () => {
    const purchaseBtn = document.getElementById("purchase");
    // 비활성 인스턴스면 구매 불가
    const instanceStatusEl = document.querySelector(
      "[data-instance-status]"
    );
    const isInactive =
      instanceStatusEl &&
      instanceStatusEl.getAttribute("data-instance-status") ===
        "inactive";
    if (isInactive) {
      alert(
        "해당 인스턴스는 비활성 상태입니다. 활성화 후 구매 가능합니다."
      );
      return;
    }
    if (Object.keys(cart).length === 0) {
      alert("장바구니가 비어있습니다.");
      return;
    }

    const confirmBuy = confirm("결제하시겠습니까?");
    if (!confirmBuy) return;

    // 총합 계산
    const total = Object.values(cart).reduce((sum, item) => {
      return sum + (item.is_service ? 0 : item.price) * item.qty;
    }, 0);

    // 서버에 POST 요청
    const response = await fetch("/api/pos/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: Object.values(cart).map((item) => ({
          product_id: item.product_id,
          quantity: item.qty,
          is_service: !!item.is_service,
        })),
        total,
      }),
    });

    const result = await response.json();
    if (response.ok) {
      alert("구매가 완료되었습니다.");
      Object.keys(cart).forEach((key) => delete cart[key]);
      renderCart();
    } else {
      alert("구매 실패: " + result.error);
    }
  });

document.addEventListener("DOMContentLoaded", () => {
  const instanceInfoButton =
    document.getElementById("instanceinfobtn");
  const purchaseButton = document.getElementById("purchase");
  const closeButton = document.getElementById("close");
  const instanceStatusEl = document.querySelector(
    "[data-instance-status]"
  );
  const isInactive =
    instanceStatusEl &&
    instanceStatusEl.getAttribute("data-instance-status") ===
      "inactive";
  if (isInactive) {
    // 비활성 상태면 구매 버튼 비활성화
    if (purchaseButton) {
      purchaseButton.style.display = "none";
      closeButton.style.display = "none";
    }
  } else {
    // 활성 상태면 인스턴스 상세 버튼 숨기기
    if (instanceInfoButton) {
      instanceInfoButton.style.display = "none";
    }
  }
});
