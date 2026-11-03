// 에어코리아 API를 호출해 JSON 응답을 검증한 뒤 프런트엔드에 전달합니다.
const API_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

module.exports = async function handler(request, response) {
  const sido = typeof request.query.sido === "string" && request.query.sido.trim()
    ? request.query.sido.trim()
    : "서울";
  const serviceKey = process.env.AIRKOREA_KEY;

  if (!serviceKey) {
    return response.status(500).json({ message: "AIRKOREA_KEY 환경변수를 설정해주세요." });
  }

  const query = new URLSearchParams({
    returnType: "json",
    sidoName: sido,
    numOfRows: "100",
    pageNo: "1",
    ver: "1.3"
  });
  const url = `${API_URL}?serviceKey=${encodeURIComponent(serviceKey)}&${query.toString()}`;

  try {
    const upstreamResponse = await fetch(url);
    const responseText = await upstreamResponse.text();
    let result;

    try {
      result = JSON.parse(responseText);
    } catch {
      return response.status(502).json({ message: "인증키 또는 요청값을 확인해주세요" });
    }

    if (!upstreamResponse.ok) {
      return response.status(502).json({ message: "에어코리아 API 요청에 실패했습니다." });
    }

    const header = result?.response?.header;
    const resultCode = header?.resultCode ?? result?.response?.body?.resultCode;
    if (resultCode !== "00") {
      return response.status(502).json({
        message: header?.resultMsg
          ? `에어코리아 API 오류: ${header.resultMsg}`
          : "에어코리아 API 요청 결과가 성공이 아닙니다."
      });
    }

    return response.status(200).json(result);
  } catch {
    return response.status(502).json({ message: "에어코리아 API에 연결할 수 없습니다." });
  }
};
