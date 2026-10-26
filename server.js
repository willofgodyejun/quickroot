// 길찾기 3사 비교 — 로컬 서버
// API 키는 이 서버에만 두고, 브라우저는 /api/* 만 호출합니다.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchPlace, searchPlaces, reverseGeocode, getRoute } from "./lib/kakao.js";
import { getRoute as getNaverRoute } from "./lib/naver.js";
import { getRoute as getTmapRoute } from "./lib/tmap.js";
import { DEFAULT_PRICES, fetchAverages } from "./lib/opinet.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// .env 읽기 (외부 패키지 없이)
const envPath = path.join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const PORT = Number(process.env.PORT) || 3000;
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY || "";
const NAVER_ID = process.env.NAVER_CLIENT_ID || "";
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
// 네이버 길찾기는 장소 검색이 없어 카카오 Local 검색으로 좌표를 얻으므로 카카오 키도 필요
const NAVER_ON = Boolean(NAVER_ID && NAVER_SECRET && KAKAO_KEY);
const TMAP_KEY = process.env.TMAP_APP_KEY || "";
const TMAP_ON = Boolean(TMAP_KEY && KAKAO_KEY);
// 지도 SDK용 키 (REST 키와 별개): 카카오는 JavaScript 키, 티맵은 지도용 appKey를 따로 쓰면 그걸, 없으면 경로 appKey 사용
const KAKAO_JS_KEY = process.env.KAKAO_JS_KEY || "";
const TMAP_MAP_KEY = process.env.TMAP_MAP_APP_KEY || TMAP_KEY;

// 유종별 단가: OPINET_API_KEY가 있으면 오피넷 전국 평균으로 6시간마다 갱신, 아니면 기본값
const OPINET_KEY = process.env.OPINET_API_KEY || "";
let fuelCache = null;
async function fuelPrices() {
  if (!OPINET_KEY) return DEFAULT_PRICES;
  if (fuelCache && Date.now() - fuelCache.at < 6 * 3600 * 1000) return fuelCache.data;
  try {
    const avg = await fetchAverages(OPINET_KEY);
    fuelCache = { at: Date.now(), data: { ...DEFAULT_PRICES, ...avg, source: "opinet" } };
  } catch (e) {
    console.warn(`오피넷 단가 갱신 실패, 기본값 사용: ${e.message}`);
    fuelCache = { at: Date.now() - 5 * 3600 * 1000, data: DEFAULT_PRICES }; // 1시간 뒤 재시도
  }
  return fuelCache.data;
}

const placeCache = new Map();
async function place(q) {
  const key = q.trim();
  if (placeCache.has(key)) return placeCache.get(key);
  const p = await searchPlace(key, KAKAO_KEY);
  if (!p) {
    const err = new Error(`'${key}'을(를) 찾지 못했어요. 장소 이름을 더 구체적으로 적어 주세요.`);
    err.status = 404;
    throw err;
  }
  placeCache.set(key, p);
  return p;
}

// 자동완성에서 고른 장소는 좌표(fromX/fromY/fromName)를 같이 받아 다시 검색하지 않고 그대로 쓴다
function resolvePlace(url, prefix, text) {
  const x = Number(url.searchParams.get(`${prefix}X`));
  const y = Number(url.searchParams.get(`${prefix}Y`));
  const name = url.searchParams.get(`${prefix}Name`) || text;
  if (Number.isFinite(x) && Number.isFinite(y) && x > 120 && x < 135 && y > 30 && y < 40) {
    return { name, address: url.searchParams.get(`${prefix}Addr`) || "", x, y };
  }
  return place(text);
}

// 경로 옵션: recommend(추천경로, 기본) | fast(최소시간)
const modeOf = (url) => (["fast", "short"].includes(url.searchParams.get("mode")) ? url.searchParams.get("mode") : "recommend");

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/status") {
      return json(res, 200, { kakao: Boolean(KAKAO_KEY), naver: NAVER_ON, tmap: TMAP_ON });
    }
    if (url.pathname === "/api/geocode") {
      if (!KAKAO_KEY) return json(res, 503, { error: "KAKAO_REST_API_KEY가 설정되지 않았어요 (.env 확인)" });
      const x = Number(url.searchParams.get("x"));
      const y = Number(url.searchParams.get("y"));
      if (!(x > 120 && x < 135 && y > 30 && y < 40)) return json(res, 400, { error: "한국 안의 좌표만 조회할 수 있어요" });
      return json(res, 200, { address: await reverseGeocode(x, y, KAKAO_KEY) });
    }
    if (url.pathname === "/api/places") {
      if (!KAKAO_KEY) return json(res, 503, { error: "KAKAO_REST_API_KEY가 설정되지 않았어요 (.env 확인)" });
      const q = (url.searchParams.get("q") || "").trim().slice(0, 50);
      if (!q) return json(res, 200, { places: [] });
      return json(res, 200, { places: await searchPlaces(q, KAKAO_KEY) });
    }
    if (url.pathname === "/api/config") {
      // 지도 SDK는 브라우저에서 불러오므로 키가 화면에 노출돼요. 네이버 Client ID·카카오 JavaScript 키는
      // 원래 공개용(허용 도메인으로 제한)이고, 티맵 appKey는 경로 호출과 같은 키라 따로 만들어 쓰는 걸 권장해요.
      return json(res, 200, { naverClientId: NAVER_ID, kakaoJsKey: KAKAO_JS_KEY, tmapAppKey: TMAP_MAP_KEY });
    }
    if (url.pathname === "/api/fuel") {
      return json(res, 200, await fuelPrices());
    }
    if (url.pathname === "/api/route/tmap") {
      if (!TMAP_ON) return json(res, 503, { error: "TMAP_APP_KEY 또는 KAKAO_REST_API_KEY가 설정되지 않았어요 (.env 확인)" });
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      const departure = url.searchParams.get("departure") || "now";
      if (!from || !to) return json(res, 400, { error: "출발지와 도착지를 모두 입력해 주세요" });
      if (departure !== "now" && !/^\d{12}$/.test(departure)) return json(res, 400, { error: "출발 시각 형식이 잘못됐어요" });
      const [o, d] = await Promise.all([resolvePlace(url, "from", from), resolvePlace(url, "to", to)]);
      const route = await getTmapRoute(o, d, departure, TMAP_KEY, modeOf(url));
      return json(res, 200, { origin: o, destination: d, route });
    }
    if (url.pathname === "/api/route/naver") {
      if (!NAVER_ON) return json(res, 503, { error: "NAVER_CLIENT_ID/SECRET 또는 KAKAO_REST_API_KEY가 설정되지 않았어요 (.env 확인)" });
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      if (!from || !to) return json(res, 400, { error: "출발지와 도착지를 모두 입력해 주세요" });
      const [o, d] = await Promise.all([resolvePlace(url, "from", from), resolvePlace(url, "to", to)]);
      const route = await getNaverRoute(o, d, NAVER_ID, NAVER_SECRET, modeOf(url));
      return json(res, 200, { origin: o, destination: d, route });
    }
    if (url.pathname === "/api/route/kakao") {
      if (!KAKAO_KEY) return json(res, 503, { error: "KAKAO_REST_API_KEY가 설정되지 않았어요 (.env 확인)" });
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      const departure = url.searchParams.get("departure") || "now";
      if (!from || !to) return json(res, 400, { error: "출발지와 도착지를 모두 입력해 주세요" });
      if (departure !== "now" && !/^\d{12}$/.test(departure)) return json(res, 400, { error: "출발 시각 형식이 잘못됐어요" });
      const [o, d] = await Promise.all([resolvePlace(url, "from", from), resolvePlace(url, "to", to)]);
      const route = await getRoute(o, d, departure, KAKAO_KEY, modeOf(url));
      return json(res, 200, { origin: o, destination: d, route });
    }
    // 정적 파일
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const full = path.join(ROOT, "public", path.normalize(file));
    if (!full.startsWith(path.join(ROOT, "public"))) return json(res, 403, { error: "forbidden" });
    const data = await readFile(full);
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[path.extname(full)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(data);
  } catch (e) {
    if (e.code === "ENOENT") return json(res, 404, { error: "not found" });
    json(res, e.status && e.status < 600 ? e.status : 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT} 에서 실행 중`);
  console.log(`카카오 키: ${KAKAO_KEY ? "설정됨" : "없음 (시뮬레이션으로 표시)"}`);
  console.log(`네이버 키: ${NAVER_ON ? "설정됨" : "없음 (시뮬레이션으로 표시)"}`);
  console.log(`티맵 키: ${TMAP_ON ? "설정됨" : "없음 (시뮬레이션으로 표시)"}`);
});
