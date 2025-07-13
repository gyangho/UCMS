const logo = document.querySelector(".small-logo");
const userInfo = document.querySelector(".user-info");

logo.addEventListener("click", function () {
  window.location.href = "/";
});

userInfo.addEventListener("click", function () {
  window.location.href = "/mypage";
});

// 로그인한 사용자 정보 불러오기 (예: /api/user 반환값 사용)
fetch("/api/user")
  .then((res) => res.json())
  .then((user) => {
    document.getElementById("userInfo").innerHTML = `
                <img src="${user.thumbnail_image}" alt="프로필" >
                ${user.name}
                `;
  })
  .catch(() => {
    document.getElementById("userInfo").textContent =
      "로그인 정보를 가져오지 못했습니다.";
  });
