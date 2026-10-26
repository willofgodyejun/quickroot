import { test } from "node:test";
import assert from "node:assert/strict";
import { toComparable, trafficBucket, getRoute, searchPlace, searchPlaces, reverseGeocode } from "../lib/kakao.js";

const sample = {
  trans_id: "x",
  routes: [{
    result_code: 0, result_msg: "길찾기 성공",
    summary: { distance: 30000, duration: 2700, fare: { taxi: 32000, toll: 1100 } },
    sections: [{ distance: 30000, duration: 2700, roads: [
      { name: "자유로", distance: 10000, duration: 600, traffic_speed: 60, traffic_state: 4 },
      { name: "자유로", distance: 2000, duration: 300, traffic_speed: 24, traffic_state: 3 },
      { name: "강변북로", distance: 8000, duration: 900, traffic_speed: 32, traffic_state: 2 },
      { name: "", distance: 500, duration: 60, traffic_speed: 30, traffic_state: 0 },
      { name: "올림픽대로", distance: 9500, duration: 840, traffic_speed: 12, traffic_state: 1 },
    ]}],
  }],
};

test("traffic_state 분류", () => {
  assert.equal(trafficBucket(4), "ok");
  assert.equal(trafficBucket(3), "slow");
  assert.equal(trafficBucket(2), "slow");
  assert.equal(trafficBucket(1), "jam");
  assert.equal(trafficBucket(6), "jam");
  assert.equal(trafficBucket(0), "none");
});

test("응답 변환", () => {
  const r = toComparable(sample);
  assert.equal(r.dist, 30);
  assert.equal(r.min, 45);
  assert.equal(r.toll, 1100);
  assert.deepEqual(r.legs.map(l => l.road), ["자유로", "강변북로", "이름 없는 도로", "올림픽대로"]);
  assert.equal(r.legs[0].len, 12);
  assert.equal(r.legs[0].st, "ok");
  const sum = Object.values(r.share).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(r.share.jam - 9500 / 30000) < 1e-9);
});

test("경로 실패 코드 처리", () => {
  assert.throws(() => toComparable({ routes: [{ result_code: 104, result_msg: "출발지와 도착지가 너무 가까움" }] }), /너무 가까움/);
});

test("API 호출 형식", async () => {
  const calls = [];
  const fake = async (url, opt) => { calls.push({ url, opt }); return { ok: true, json: async () => sample }; };
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "now", "KEY", "recommend", fake);
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "202610270810", "KEY", "recommend", fake);
  assert.match(calls[0].url, /^https:\/\/apis-navi\.kakaomobility\.com\/v1\/directions\?origin=126\.7%2C37\.6/);
  assert.match(calls[1].url, /\/v1\/future\/directions\?.*departure_time=202610270810/);
  assert.equal(calls[0].opt.headers.Authorization, "KakaoAK KEY");
});

test("장소 검색 + 오류 메시지", async () => {
  const ok = async () => ({ ok: true, json: async () => ({ documents: [{ place_name: "킨텍스 제1전시장", x: "126.745", y: "37.668", road_address_name: "고양시 일산서구 킨텍스로 217-60" }] }) });
  const p = await searchPlace("킨텍스", "KEY", ok);
  assert.equal(p.name, "킨텍스 제1전시장");
  assert.equal(p.x, 126.745);
  const bad = async () => ({ ok: false, status: 403, json: async () => ({ errorType: "NotAuthorizedError", message: "App(...) disabled OPEN_MAP_AND_LOCAL service." }) });
  await assert.rejects(searchPlace("x", "KEY", bad), /OPEN_MAP_AND_LOCAL/);
});

test("경로 옵션: 추천경로/최소시간", async () => {
  const urls = [];
  const fake = async (url) => { urls.push(url); return { ok: true, json: async () => sample }; };
  const a = { x: 126.7, y: 37.6 }, b = { x: 127.0, y: 37.5 };
  await getRoute(a, b, "now", "KEY", "recommend", fake);
  await getRoute(a, b, "now", "KEY", "fast", fake);
  assert.match(urls[0], /priority=RECOMMEND/);
  assert.match(urls[1], /priority=TIME/);
});

test("지도용 경로 좌표", () => {
  const withV = { routes: [{ result_code: 0, summary: { distance: 1000, duration: 120 }, sections: [{ roads: [
    { name: "a", distance: 600, traffic_state: 4, vertexes: [126.1, 37.1, 126.2, 37.2] },
    { name: "b", distance: 400, traffic_state: 1, vertexes: [126.2, 37.2, 126.3, 37.3] },
    { name: "c", distance: 10, traffic_state: 4 },
  ] }] }] };
  const r = toComparable(withV);
  assert.equal(r.path.length, 2);
  assert.deepEqual(r.path[0], { st: "ok", pts: [[37.1, 126.1], [37.2, 126.2]] });
  assert.equal(r.path[1].st, "jam");
});

test("최단경로는 priority=DISTANCE", async () => {
  const urls = [];
  const fake = async (url) => { urls.push(url); return { ok: true, json: async () => sample }; };
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "now", "KEY", "short", fake);
  assert.match(urls[0], /priority=DISTANCE/);
});

test("자동완성 장소 목록", async () => {
  const urls = [];
  const fake = async (url) => { urls.push(url); return { ok: true, json: async () => ({ documents: [
    { place_name: "강남역 2호선", road_address_name: "서울 강남구 강남대로 396", address_name: "서울 강남구 역삼동 858", category_group_name: "지하철역", x: "127.028", y: "37.497" },
    { place_name: "강남역 신분당선", address_name: "서울 강남구 역삼동 814", x: "127.027", y: "37.495" },
  ] }) }; };
  const r = await searchPlaces("강남역", "KEY", fake);
  assert.match(urls[0], /query=%EA%B0%95%EB%82%A8%EC%97%AD&size=7/);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { name: "강남역 2호선", address: "서울 강남구 강남대로 396", x: 127.028, y: 37.497, category: "지하철역" });
  assert.equal(r[1].address, "서울 강남구 역삼동 814");
  assert.equal(r[1].category, "");
});

test("좌표 → 주소 변환", async () => {
  const urls = [];
  const mk = (doc) => async (url) => { urls.push(url); return { ok: true, json: async () => ({ documents: doc ? [doc] : [] }) }; };
  const road = await reverseGeocode(127.028, 37.497, "KEY", mk({ road_address: { address_name: "서울 강남구 강남대로 396" }, address: { address_name: "서울 강남구 역삼동 858" } }));
  assert.equal(road, "서울 강남구 강남대로 396");
  assert.match(urls[0], /coord2address\.json\?x=127\.028&y=37\.497/);
  assert.equal(await reverseGeocode(1, 2, "KEY", mk({ road_address: null, address: { address_name: "서울 강남구 역삼동 858" } })), "서울 강남구 역삼동 858");
  assert.equal(await reverseGeocode(1, 2, "KEY", mk(null)), "");
});
