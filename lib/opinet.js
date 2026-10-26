// 유종별 단가: 오피넷(한국석유공사) 전국 평균 판매가격
// OPINET_API_KEY가 있으면 오피넷 API로 갱신하고, 없거나 실패하면 아래 기본값을 씁니다.
// 전기는 오피넷 대상이 아니라서 충전 단가 참고값(원/kWh)만 둡니다.
export const DEFAULT_PRICES = {
  gasoline: 1858, // 2026년 10월 첫째 주 전국 평균 (1,857.6원/L)
  diesel: 1843,   // 2026년 10월 첫째 주 전국 평균 (1,843.3원/L)
  ev: 300,        // 충전 단가 참고값 — 충전 사업자·요금제마다 다름
  asOf: "2026-10 첫째 주",
  source: "default",
};

const AVG_URL = "http://www.opinet.co.kr/api/avgAllPrice.do";

// 오피넷 제품 코드: B027 보통휘발유, D047 자동차용경유
export function parseAverages(body) {
  const oil = body?.RESULT?.OIL;
  if (!Array.isArray(oil)) throw new Error("오피넷 응답 형식이 달라요");
  const price = (code) => {
    const row = oil.find((o) => o.PRODCD === code);
    const n = Number(row?.PRICE);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const gasoline = price("B027");
  const diesel = price("D047");
  if (!gasoline || !diesel) throw new Error("오피넷 응답에 휘발유/경유 가격이 없어요");
  const dt = oil.find((o) => o.PRODCD === "B027")?.TRADE_DT || "";
  const asOf = /^\d{8}$/.test(dt) ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : "";
  return { gasoline, diesel, asOf };
}

export async function fetchAverages(key, fetchImpl = fetch) {
  const res = await fetchImpl(`${AVG_URL}?out=json&code=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`오피넷 API 오류: HTTP ${res.status}`);
  return parseAverages(await res.json());
}
