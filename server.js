// 길찾기 3사 비교 — 로컬 서버
// API 키는 이 서버에만 두고, 브라우저는 /api/* 만 호출합니다.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchPlace, getRoute } from "./lib/kakao.js";

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

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/status") {
      return json(res, 200, { kakao: Boolean(KAKAO_KEY), naver: false, tmap: false });
    }
    if (url.pathname === "/api/route/kakao") {
      if (!KAKAO_KEY) return json(res, 503, { error: "KAKAO_REST_API_KEY가 설정되지 않았어요 (.env 확인)" });
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      const departure = url.searchParams.get("departure") || "now";
      if (!from || !to) return json(res, 400, { error: "출발지와 도착지를 모두 입력해 주세요" });
      if (departure !== "now" && !/^\d{12}$/.test(departure)) return json(res, 400, { error: "출발 시각 형식이 잘못됐어요" });
      const [o, d] = await Promise.all([place(from), place(to)]);
      const route = await getRoute(o, d, departure, KAKAO_KEY);
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
});
