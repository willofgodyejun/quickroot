import { test } from "node:test";
import assert from "node:assert/strict";
import { toComparable, trafficBucket, getRoute, searchPlace } from "../lib/kakao.js";

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
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "now", "KEY", fake);
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "202610270810", "KEY", fake);
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
