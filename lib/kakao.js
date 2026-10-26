// 카카오 Local(장소 검색) + 카카오모빌리티 Directions(자동차 길찾기) 연동
const LOCAL_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const NAVI_URL = "https://apis-navi.kakaomobility.com/v1/directions";
const NAVI_FUTURE_URL = "https://apis-navi.kakaomobility.com/v1/future/directions";

// traffic_state: 0 정보없음, 1 정체, 2 지체, 3 서행, 4 원활, 6 사고(통행불가)
export function trafficBucket(code) {
  if (code === 4) return "ok";
  if (code === 3 || code === 2) return "slow";
  if (code === 1 || code === 6) return "jam";
  return "none";
}

async function call(url, key, fetchImpl) {
  const res = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${key}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.msg || body.message || body.errorType || `HTTP ${res.status}`;
    const err = new Error(`카카오 API 오류: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function searchPlace(query, key, fetchImpl = fetch) {
  const url = `${LOCAL_URL}?query=${encodeURIComponent(query)}&size=1`;
  const body = await call(url, key, fetchImpl);
  const doc = body.documents?.[0];
  if (!doc) return null;
  return { name: doc.place_name, address: doc.road_address_name || doc.address_name, x: Number(doc.x), y: Number(doc.y) };
}

// departure: "now" 또는 "YYYYMMDDHHMM"
export async function getRoute(origin, dest, departure, key, fetchImpl = fetch) {
  const p = new URLSearchParams({
    origin: `${origin.x},${origin.y}`,
    destination: `${dest.x},${dest.y}`,
    priority: "RECOMMEND",
    summary: "false",
  });
  let base = NAVI_URL;
  if (departure && departure !== "now") {
    base = NAVI_FUTURE_URL;
    p.set("departure_time", departure);
  }
  const body = await call(`${base}?${p}`, key, fetchImpl);
  return toComparable(body);
}

// 카카오 응답 → 비교 화면 공통 형식
export function toComparable(body) {
  const route = body.routes?.[0];
  if (!route) throw new Error("경로 응답이 비어 있어요");
  if (route.result_code !== 0) {
    const err = new Error(route.result_msg || "경로를 찾지 못했어요");
    err.status = 404;
    throw err;
  }
  const roads = (route.sections || []).flatMap((s) => s.roads || []);
  const total = roads.reduce((a, r) => a + (r.distance || 0), 0) || 1;

  // 정체 띠: 도로 구간 길이 비율 그대로
  const strip = roads
    .filter((r) => r.distance > 0)
    .map((r) => ({ st: trafficBucket(r.traffic_state), w: r.distance / total }));
  const share = { ok: 0, slow: 0, jam: 0, none: 0 };
  strip.forEach((s) => (share[s.st] += s.w));

  // 주요 도로: 이름이 같은 연속 구간을 합치고, 길이 순 상위 6개를 원래 순서대로
  const merged = [];
  for (const r of roads) {
    const name = r.name || "이름 없는 도로";
    const last = merged[merged.length - 1];
    const st = trafficBucket(r.traffic_state);
    if (last && last.road === name) {
      last.len += r.distance;
      last.byState[st] = (last.byState[st] || 0) + r.distance;
    } else {
      merged.push({ road: name, len: r.distance, byState: { [st]: r.distance } });
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
    source: "kakao",
    dist: sum.distance / 1000,
    min: Math.round(sum.duration / 60),
    toll: sum.fare?.toll ?? 0,
    taxi: sum.fare?.taxi ?? null,
    strip,
    share,
    legs,
  };
}
