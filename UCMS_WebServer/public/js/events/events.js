const monthYear = document.getElementById("monthYear");
const calendarBody = document.getElementById("calendarBody");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const eventsPanel = document.getElementById("eventsPanel");
const eventsDate = document.getElementById("eventsDate");
const eventsList = document.getElementById("eventsList");

// 예시 이벤트 데이터
const events = {
  "2025-07-21": [
    { time: "10:00", title: "팀 미팅" },
    { time: "15:00", title: "코드 리뷰" },
  ],
  "2025-07-23": [{ time: "09:00", title: "클라이언트 콜" }],
};

let today = new Date();
let curYear = today.getFullYear();
let curMonth = today.getMonth();

function formatDate(year, month, day) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function renderCalendar(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  monthYear.textContent = `${year}년 ${month + 1}월`;
  calendarBody.innerHTML = "";

  let date = 1;
  for (let i = 0; i < 6; i++) {
    const row = document.createElement("tr");
    for (let j = 0; j < 7; j++) {
      const cell = document.createElement("td");
      if (i === 0 && j < firstDay) {
        cell.textContent = "";
      } else if (date > lastDate) {
        cell.textContent = "";
      } else {
        cell.textContent = date;
        const dateKey = formatDate(year, month, date);
        if (events[dateKey]) cell.classList.add("has-event");
        if (
          date === today.getDate() &&
          year === today.getFullYear() &&
          month === today.getMonth()
        ) {
          cell.classList.add("today");
        }
        cell.addEventListener("click", () => showEvents(dateKey));
        date++;
      }
      row.appendChild(cell);
    }
    calendarBody.appendChild(row);
  }
}

function showEvents(dateKey) {
  eventsDate.textContent = `${dateKey} 일정`;
  eventsList.innerHTML = "";
  const dayEvents = events[dateKey] || [];
  if (dayEvents.length === 0) {
    eventsList.innerHTML = '<p class="no-events">일정이 없습니다.</p>';
    return;
  }
  dayEvents.forEach((ev) => {
    const div = document.createElement("div");
    div.className = "event-item";
    div.textContent = `${ev.time} - ${ev.title}`;
    eventsList.appendChild(div);
  });
}

prevBtn.addEventListener("click", () => {
  curMonth--;
  if (curMonth < 0) {
    curMonth = 11;
    curYear--;
  }
  renderCalendar(curYear, curMonth);
  eventsDate.textContent = "날짜를 선택하세요";
  eventsList.innerHTML = '<p class="no-events">일정이 없습니다.</p>';
});

nextBtn.addEventListener("click", () => {
  curMonth++;
  if (curMonth > 11) {
    curMonth = 0;
    curYear++;
  }
  renderCalendar(curYear, curMonth);
  eventsDate.textContent = "날짜를 선택하세요";
  eventsList.innerHTML = '<p class="no-events">일정이 없습니다.</p>';
});

// 초기 렌더링
renderCalendar(curYear, curMonth);
