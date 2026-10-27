// TMAP 자동차 경로안내 연동 (실시간: /routes, 출발 시각 지정: /routes/prediction)
// 장소 검색은 없어서 좌표는 카카오 Local 검색 결과를 씁니다.
const ROUTES_URL = "https://apis.openapi.sk.com/tmap/routes?version=1";
const PREDICTION_URL = "https://apis.openapi.sk.com/tmap/routes/prediction?version=1";

// 응답에 정체 등급이 없어서 구간 평균 속도(km/h)로 추정: 40 이상 원활, 20 이상 서행, 그 아래 정체
export function speedBucket(distanceM, timeSec) {
  if (!(timeSec > 0)) return "none";
  const kmh = (distanceM / timeSec) * 3.6;
  if (kmh >= 40) return "ok";
  if (kmh >= 20) return "slow";
  return "jam";
}

async function post(url, key, payload, fetchImpl) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { appKey: key, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || body.errorMessage || body.message || `HTTP ${res.status}`;
    const err = new Error(`티맵 API 오류: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// "YYYYMMDDHHMM" → "YYYY-MM-DDTHH:MM:00+0900"
function toIso(dep) {
  return `${dep.slice(0, 4)}-${dep.slice(4, 6)}-${dep.slice(6, 8)}T${dep.slice(8, 10)}:${dep.slice(10, 12)}:00+0900`;
}

// departure: "now" 또는 "YYYYMMDDHHMM", mode: "recommend"(추천, searchOption 0) | "fast"(최소시간, 2) | "short"(최단거리, 10)
export async function getRoute(origin, dest, departure, key, mode = "recommend", fetchImpl = fetch) {
  const searchOption = { fast: 2, short: 10 }[mode] ?? 0;
  if (!departure || departure === "now") {
    const body = await post(ROUTES_URL, key, {
      startX: origin.x, startY: origin.y, endX: dest.x, endY: dest.y,
      reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
      searchOption, trafficInfo: "Y",
    }, fetchImpl);
    return toComparable(body);
  }
  const iso = toIso(departure);
  const ask = (predictionType) => post(PREDICTION_URL, key, {
    routesInfo: {
      departure: { name: "출발", lon: String(origin.x), lat: String(origin.y) },
      destination: { name: "도착", lon: String(dest.x), lat: String(dest.y) },
      predictionType,
      predictionTime: iso,
    },
    searchOption, // routesInfo 안이 아니라 최상위에 둬야 적용된다
  }, fetchImpl);
  // 실측상 predictionType 이름이 문서와 반대로 동작해서("arrival"이 출발 기준),
  // 응답의 departureTime이 요청 시각과 맞는 쪽을 쓴다.
  let body = await ask("arrival");
  const dep = body.features?.[0]?.properties?.departureTime;
  if (dep && dep.slice(0, 16) !== iso.slice(0, 16)) body = await ask("departure");
  return toComparable(body);
}

import { buildSteps } from "./steps.js";

const r5 = (n) => Math.round(n * 1e5) / 1e5; // 지도용, 소수 5자리 ≈ 1m

// TMAP 응답(GeoJSON) → 비교 화면 공통 형식
export function toComparable(body) {
  const feats = body.features || [];
  const head = feats[0]?.properties;
  if (!head || head.totalDistance == null) throw new Error("경로 응답이 비어 있어요");

  const lines = feats.filter((f) => f.geometry?.type === "LineString" && f.properties.distance > 0);
  const total = lines.reduce((a, f) => a + f.properties.distance, 0) || 1;

  const strip = lines.map((f) => ({ st: speedBucket(f.properties.distance, f.properties.time), w: f.properties.distance / total }));
  const share = { ok: 0, slow: 0, jam: 0, none: 0 };
  strip.forEach((s) => (share[s.st] += s.w));

  // 주요 도로: 이름이 같은 연속 구간을 합치고, 길이 순 상위 6개를 원래 순서대로
  const merged = [];
  for (const f of lines) {
    const { distance, time } = f.properties;
    const name = f.properties.name || "이름 없는 도로";
    const last = merged[merged.length - 1];
    if (last && last.road === name) {
      last.len += distance;
      last.time += time;
    } else {
      merged.push({ road: name, len: distance, time });
    }
  }
  const top = [...merged].sort((a, b) => b.len - a.len).slice(0, 6);
  const legs = merged
    .filter((m) => top.includes(m))
    .map((m) => ({ road: m.road, len: m.len / 1000, st: speedBucket(m.len, m.time) }));

  // 지도용 경로. 구간마다 점 번호 범위(pi)를 기록해 두었다가 구간 단계에 연결한다
  const path = [];
  const ranges = lines.map((f) => {
    if (!(f.geometry.coordinates?.length >= 2)) return null;
    const pts = f.geometry.coordinates.map(([lng, lat]) => [r5(lat), r5(lng)]);
    const start = path.reduce((a, p) => a + p.pts.length, 0);
    path.push({ st: speedBucket(f.properties.distance, f.properties.time), pts });
    return [start, start + pts.length];
  });

  return {
    source: "tmap",
    steps: buildSteps(lines.map((f, i) => ({ name: f.properties.name, dist: f.properties.distance, sec: f.properties.time, st: speedBucket(f.properties.distance, f.properties.time), pi: ranges[i] }))),
    path,
    dist: head.totalDistance / 1000,
    min: Math.round(head.totalTime / 60),
    toll: head.totalFare ?? 0,
    taxi: head.taxiFare ?? null,
    strip,
    share,
    legs,
  };
}
