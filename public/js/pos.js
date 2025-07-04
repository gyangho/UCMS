const cart = {};
const cartContainer = document.getElementById('cart');
const totalEl = document.getElementById('total');

function renderCart() {
    cartContainer.innerHTML = '';
    let total = 0;

    Object.entries(cart).forEach(([name, item]) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
      <span>${name} (${item.qty}개)</span>
      <button onclick="changeQty('${name}', 1)">+</button>
      <button onclick="changeQty('${name}', -1)">-</button>
    `;
        cartContainer.appendChild(div);

        total += item.price * item.qty;
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

document.querySelectorAll('.products button').forEach(btn => {
    const name = btn.dataset.name;
    const price = parseInt(btn.dataset.price);

    if (name) {
        btn.addEventListener('click', () => {
            if (cart[name]) {
                cart[name].qty += 1;
                cart[name].price = price;
            } else {
                cart[name] = { qty: 1, price };
            }
            renderCart();
        });
    }
});

document.getElementById('clear').addEventListener('click', () => {
    if (confirm('초기화 하시겠습니까?')) {
        Object.keys(cart).forEach(key => delete cart[key]);
        renderCart();
    }
});

document.getElementById('purchase').addEventListener('click', async () => {
    if (Object.keys(cart).length === 0) {
        alert('장바구니가 비어있습니다.');
        return;
    }

    const confirmBuy = confirm('결제하시겠습니까?');
    if (!confirmBuy) return;

    // 총합 계산
    const total = Object.values(cart).reduce((sum, item) => sum + item.price * item.qty, 0);

    // 서버에 POST 요청
    const response = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart, total })
    });

    const result = await response.json();
    if (response.ok) {
        alert('구매가 완료되었습니다.');
        Object.keys(cart).forEach(key => delete cart[key]);
        renderCart();
    } else {
        alert('구매 실패: ' + result.error);
    }
});

