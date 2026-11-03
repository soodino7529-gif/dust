// Vercel 서버리스 함수를 조회하고 측정소 카드와 지역 평균을 표시합니다.

const regionSelect = document.querySelector("#region-select");
const airSummary = document.querySelector("#air-summary");
const summaryRegion = document.querySelector("#summary-region");
const statusEmoji = document.querySelector("#status-emoji");
const statusLabel = document.querySelector("#status-label");
const averagePm10 = document.querySelector("#average-pm10");
const averageNote = document.querySelector("#average-note");
const airAdvice = document.querySelector("#air-advice");
const stationCount = document.querySelector("#station-count");
const statusMessage = document.querySelector("#status-message");
const stationList = document.querySelector("#station-list");
const chartMessage = document.querySelector("#chart-message");
const chartCanvas = document.querySelector("#station-chart");
let stationChart = null;

const gradeClasses = {
  "1": "grade-1",
  "2": "grade-2",
  "3": "grade-3",
  "4": "grade-4"
};

const airGrades = {
  "1": { label: "좋음", emoji: "🔵" },
  "2": { label: "보통", emoji: "🟢" },
  "3": { label: "나쁨", emoji: "🟠" },
  "4": { label: "매우나쁨", emoji: "🔴" }
};

const gradeColors = {
  "1": "#4285e8",
  "2": "#38a875",
  "3": "#e9982e",
  "4": "#e45b5b"
};

function getAverageGrade(value) {
  if (value <= 30) return "1";
  if (value <= 80) return "2";
  if (value <= 150) return "3";
  return "4";
}

function formatMeasurementTime(value) {
  const match = String(value || "").match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (!match) return value || "정보 없음";
  const [, year, month, day, hour] = match;
  return `${year}년 ${Number(month)}월 ${Number(day)}일 ${Number(hour)}시 기준`;
}

function showMeasurement(value) {
  if (value === "-" || value === null || value === undefined || String(value).trim() === "") {
    return "측정 안 됨";
  }
  return `${value} ㎍/㎥`;
}

function getValidMeasurements(items) {
  return items
    .map((item) => item.pm10Value)
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "" && String(value).trim() !== "-")
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

function updateStationChart(items) {
  if (stationChart) {
    stationChart.destroy();
    stationChart = null;
  }

  if (typeof Chart === "undefined") {
    chartMessage.textContent = "그래프를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.";
    return;
  }

  const topStations = items
    .filter((item) => item.pm10Value !== null
      && item.pm10Value !== undefined
      && String(item.pm10Value).trim() !== ""
      && String(item.pm10Value).trim() !== "-")
    .map((item) => ({ ...item, pm10Number: Number(item.pm10Value) }))
    .filter((item) => Number.isFinite(item.pm10Number))
    .sort((first, second) => second.pm10Number - first.pm10Number)
    .slice(0, 10);

  if (topStations.length === 0) {
    chartMessage.textContent = "그래프에 표시할 측정값이 없습니다.";
    return;
  }

  chartMessage.textContent = "";
  stationChart = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels: topStations.map((item) => item.stationName || "측정소 이름 없음"),
      datasets: [{
        data: topStations.map((item) => item.pm10Number),
        backgroundColor: topStations.map((item) => gradeColors[item.pm10Grade] || "#aeb8c6"),
        borderRadius: 6,
        barThickness: 22
      }]
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.x} ㎍/㎥`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: "미세먼지 (㎍/㎥)" },
          ticks: { precision: 0 }
        },
        y: {
          grid: { display: false }
        }
      }
    }
  });
}

function createStationCard(item) {
  const card = document.createElement("article");
  card.className = `station-card ${gradeClasses[item.pm10Grade] || "grade-unknown"}`;

  const name = document.createElement("h3");
  name.className = "station-name";
  name.textContent = item.stationName || "측정소 이름 없음";

  const values = document.createElement("dl");
  values.className = "station-values";
  for (const [label, value] of [
    ["미세먼지", showMeasurement(item.pm10Value)],
    ["초미세먼지", showMeasurement(item.pm25Value)]
  ]) {
    const entry = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    entry.append(term, detail);
    values.append(entry);
  }

  const measuredAt = document.createElement("p");
  measuredAt.className = "measured-at";
  measuredAt.textContent = formatMeasurementTime(item.dataTime);
  card.append(name, values, measuredAt);
  return card;
}

async function loadMeasurements(region) {
  statusMessage.textContent = "불러오는 중...";
  chartMessage.textContent = "불러오는 중...";
  if (stationChart) {
    stationChart.destroy();
    stationChart = null;
  }
  stationList.replaceChildren();
  stationCount.textContent = "";
  averagePm10.textContent = "--";
  averageNote.textContent = "불러오는 중...";
  summaryRegion.textContent = region;
  airSummary.className = "summary grade-unknown";
  statusEmoji.textContent = "⚪";
  statusLabel.textContent = "불러오는 중...";
  airAdvice.textContent = "측정 정보를 불러오는 중입니다.";

  try {
    const response = await fetch(`/api/dust?sido=${encodeURIComponent(region)}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `서버 응답 오류 (${response.status})`);
    }

    const body = result?.response?.body;
    const header = result?.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      throw new Error(header.resultMsg || "대기질 정보를 가져오지 못했습니다.");
    }

    const items = body?.items;
    const measurements = Array.isArray(items) ? items : items ? [items] : [];
    if (measurements.length === 0) {
      statusMessage.textContent = "표시할 측정 정보가 없습니다.";
      averageNote.textContent = "평균을 계산할 측정값이 없습니다.";
      statusLabel.textContent = "정보 없음";
      airAdvice.textContent = "측정 정보를 확인할 수 없습니다.";
      return;
    }

    const validValues = getValidMeasurements(measurements);
    if (validValues.length > 0) {
      const average = validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
      averagePm10.textContent = average.toFixed(1);
      averageNote.textContent = `${region} · ${validValues.length}개 측정소 기준`;
      const grade = getAverageGrade(average);
      const airGrade = airGrades[grade];
      airSummary.className = `summary grade-${grade}`;
      statusEmoji.textContent = airGrade.emoji;
      statusLabel.textContent = airGrade.label;
      airAdvice.textContent = Number(grade) >= 3
        ? "외출 시 마스크를 챙기세요"
        : "오늘의 대기질을 확인하고 건강한 하루 보내세요";
    } else {
      averagePm10.textContent = "측정 안 됨";
      averageNote.textContent = "평균을 계산할 수 있는 미세먼지 값이 없습니다.";
      statusLabel.textContent = "정보 없음";
      airAdvice.textContent = "측정 정보를 확인할 수 없습니다.";
    }

    stationCount.textContent = `${measurements.length}개 측정소`;
    const cards = measurements.map(createStationCard);
    stationList.append(...cards);
    updateStationChart(measurements);
    statusMessage.textContent = "";
  } catch (error) {
    statusMessage.textContent = `정보를 불러오지 못했습니다. ${error.message}`;
    averageNote.textContent = "API 키와 네트워크 연결을 확인해 주세요.";
    statusLabel.textContent = "정보 없음";
    airAdvice.textContent = "대기질 정보를 불러오지 못했습니다.";
  }
}

regionSelect.addEventListener("change", () => loadMeasurements(regionSelect.value));
loadMeasurements(regionSelect.value);
