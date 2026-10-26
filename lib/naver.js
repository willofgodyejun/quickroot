// 네이버 클라우드 Maps Directions 15(자동차 길찾기) 연동
// 장소 검색은 없어서 좌표는 카카오 Local 검색 결과를 씁니다. 출발 시각 지정은 지원하지 않아요(현재 교통 기준).
const DRIVING_URL = "https://maps.apigw.ntruss.com/map-direction-15/v1/driving";

// congestion: 0 정보없음, 1 원활, 2 서행, 3 혼잡
export function congestionBucket(code) {
  if (code === 1) return "ok";
  if (code === 2) return "slow";
  if (code === 3) return "jam";
  return "none";
}

// mode: "recommend"(실시간 최적) | "fast"(실시간 빠른길) | "short"(최단경로)
// 네이버에는 최단거리 옵션이 없어서 한 번에 받을 수 있는 최대 3개 후보(최적·빠른길·편한길) 중 가장 짧은 경로를 쓴다
const OPTIONS = { recommend: "traoptimal", fast: "trafast", short: "traoptimal:trafast:tracomfort" };
export async function getRoute(origin, dest, id, secret, mode = "recommend", fetchImpl = fetch) {
  const p = new URLSearchParams({
    start: `${origin.x},${origin.y}`,
    goal: `${dest.x},${dest.y}`,
    option: OPTIONS[mode] || OPTIONS.recommend,
  });
  const res = await fetchImpl(`${DRIVING_URL}?${p}`, {
    headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || body.message || `HTTP ${res.status}`;
    const err = new Error(`네이버 API 오류: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return toComparable(body, mode);
}

import { buildSteps } from "./steps.js";

const r5 = (n) => Math.round(n * 1e5) / 1e5; // 지도용, 소수 5자리 ≈ 1m

// 구간(section)별 소요시간(초). guide의 구간 시간을 경로 점 번호 범위로 겹치는 만큼 나눠 담는다.
// guide가 없으면 구간 길이/속도 비율로 전체 시간을 나눈다
export function sectionSeconds(route, sections) {
  const guide = route.guide || [];
  const total = (route.summary?.duration || 0) / 1000;
  const end = (route.path || []).length;
  if (guide.length && end) {
    return sections.map((s) => {
      const a = s.pointIndex, b = s.pointIndex + s.pointCount;
      let sec = 0;
      guide.forEach((g, j) => {
        const g0 = g.pointIndex, g1 = j + 1 < guide.length ? guide[j + 1].pointIndex : end;
        const overlap = Math.max(0, Math.min(b, g1) - Math.max(a, g0));
        if (g1 > g0 && overlap) sec += ((g.duration || 0) / 1000) * (overlap / (g1 - g0));
      });
      return sec;
    });
  }
  const w = sections.map((s) => s.distance / Math.max(s.speed || 0, 5));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => (total * x) / sum);
}

// 네이버 응답 → 비교 화면 공통 형식
export function toComparable(body, mode = "recommend") {
  if (body.code !== 0) {
    const err = new Error(body.message || "경로를 찾지 못했어요");
    err.status = 404;
    throw err;
  }
  // 응답 키가 옵션 이름(traoptimal, trafast …)이라 값에서 고른다. 최단경로는 후보 중 거리가 가장 짧은 것
  const candidates = Object.values(body.route || {}).map((a) => a?.[0]).filter(Boolean);
  const route = mode === "short"
    ? candidates.reduce((a, b) => (b.summary.distance < a.summary.distance ? b : a), candidates[0])
    : candidates[0];
  if (!route) throw new Error("경로 응답이 비어 있어요");

  const sections = (route.section || []).filter((s) => s.distance > 0);
  const total = sections.reduce((a, s) => a + s.distance, 0) || 1;

  const strip = sections.map((s) => ({ st: congestionBucket(s.congestion), w: s.distance / total }));
  const share = { ok: 0, slow: 0, jam: 0, none: 0 };
  strip.forEach((s) => (share[s.st] += s.w));

  // 주요 도로: 이름이 같은 연속 구간을 합치고, 길이 순 상위 6개를 원래 순서대로
  const merged = [];
  for (const s of sections) {
    const name = s.name || "이름 없는 도로";
    const st = congestionBucket(s.congestion);
    const last = merged[merged.length - 1];
    if (last && last.road === name) {
      last.len += s.distance;
      last.byState[st] = (last.byState[st] || 0) + s.distance;
    } else {
      merged.push({ road: name, len: s.distance, byState: { [st]: s.distance } });
    }
  }
  const top = [...merged].sort((a, b) => b.len - a.len).slice(0, 6);
  const legs = merged
    .filter((m) => top.includes(m))
    .map((m) => {
      const st = Object.entries(m.byState).sort((a, b) => b[1] - a[1])[0][0];
      return { road: m.road, len: m.len / 1000, st };
    });

  const sum = route.summary;
  return {
    source: "naver",
    steps: (() => { const secs = sectionSeconds(route, sections); return buildSteps(sections.map((s, i) => ({ name: s.name, dist: s.distance, sec: secs[i], st: congestionBucket(s.congestion) }))); })(),
    // section의 pointIndex/pointCount가 route.path(경도,위도) 안의 구간 범위. 끝점을 한 개 더 넣어 구간끼리 이어 준다
    path: sections
      .map((s) => ({
        st: congestionBucket(s.congestion),
        pts: (route.path || []).slice(s.pointIndex, s.pointIndex + s.pointCount + 1).map(([lng, lat]) => [r5(lat), r5(lng)]),
      }))
      .filter((p) => p.pts.length >= 2),
    dist: sum.distance / 1000,
    min: Math.round(sum.duration / 60000),
    toll: sum.tollFare ?? 0,
    taxi: sum.taxiFare ?? null,
    strip,
    share,
    legs,
  };
}
