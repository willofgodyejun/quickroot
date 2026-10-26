import { test } from "node:test";
import assert from "node:assert/strict";
import { toComparable, speedBucket, getRoute } from "../lib/tmap.js";

const line = (name, distance, time) => ({ geometry: { type: "LineString" }, properties: { name, distance, time } });
const sample = {
  features: [
    { geometry: { type: "Point" }, properties: { totalDistance: 30000, totalTime: 2700, totalFare: 1100, taxiFare: 32000, pointType: "S" } },
    line("자유로", 10000, 600),
    line("자유로", 2000, 300),
    line("강변북로", 8000, 900),
    line("", 500, 0),
    line("올림픽대로", 9500, 1900),
  ],
};

test("속도 기반 정체 분류", () => {
  assert.equal(speedBucket(10000, 600), "ok");   // 60km/h
  assert.equal(speedBucket(2000, 300), "slow");  // 24km/h
  assert.equal(speedBucket(9500, 1900), "jam");  // 18km/h
  assert.equal(speedBucket(500, 0), "none");
});

test("응답 변환", () => {
  const r = toComparable(sample);
  assert.equal(r.source, "tmap");
  assert.equal(r.dist, 30);
  assert.equal(r.min, 45);
  assert.equal(r.toll, 1100);
  assert.equal(r.taxi, 32000);
  assert.deepEqual(r.legs.map((l) => l.road), ["자유로", "강변북로", "이름 없는 도로", "올림픽대로"]);
  assert.equal(r.legs[0].len, 12);
  const sum = Object.values(r.share).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("빈 응답 처리", () => {
  assert.throws(() => toComparable({ features: [] }), /비어/);
});

test("실시간/예측 호출 형식", async () => {
  const calls = [];
  const fake = async (url, opt) => { calls.push({ url, opt }); return { ok: true, json: async () => sample }; };
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "now", "KEY", "recommend", fake);
  assert.match(calls[0].url, /\/tmap\/routes\?version=1$/);
  assert.equal(calls[0].opt.headers.appKey, "KEY");
  assert.equal(JSON.parse(calls[0].opt.body).startX, 126.7);

  const withDep = async (url, opt) => {
    calls.push({ url, opt });
    return { ok: true, json: async () => ({ features: [{ geometry: { type: "Point" }, properties: { ...sample.features[0].properties, departureTime: "2026-10-27T08:10:30+0900" } }, ...sample.features.slice(1)] }) };
  };
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "202610270810", "KEY", "recommend", withDep);
  const last = calls[calls.length - 1];
  assert.match(last.url, /\/tmap\/routes\/prediction/);
  assert.equal(JSON.parse(last.opt.body).routesInfo.predictionTime, "2026-10-27T08:10:00+0900");
});

test("오류 메시지", async () => {
  const bad = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Invalid appKey" } }) });
  await assert.rejects(getRoute({ x: 1, y: 1 }, { x: 2, y: 2 }, "now", "K", "recommend", bad), /Invalid appKey/);
});

test("경로 옵션: 추천경로/최소시간", async () => {
  const bodies = [];
  const fake = async (url, opt) => { bodies.push(JSON.parse(opt.body)); return { ok: true, json: async () => sample }; };
  const a = { x: 126.7, y: 37.6 }, b = { x: 127.0, y: 37.5 };
  await getRoute(a, b, "now", "KEY", "recommend", fake);
  await getRoute(a, b, "now", "KEY", "fast", fake);
  assert.equal(bodies[0].searchOption, 0);
  assert.equal(bodies[1].searchOption, 2);
});

test("지도용 경로 좌표", () => {
  const body = { features: [
    { geometry: { type: "Point" }, properties: { totalDistance: 1000, totalTime: 100, totalFare: 0, taxiFare: 0 } },
    { geometry: { type: "LineString", coordinates: [[126.1, 37.1], [126.2, 37.2]] }, properties: { name: "a", distance: 1000, time: 60 } },
  ] };
  assert.deepEqual(toComparable(body).path, [{ st: "ok", pts: [[37.1, 126.1], [37.2, 126.2]] }]);
});

test("최단경로는 searchOption 10", async () => {
  const bodies = [];
  const fake = async (url, opt) => { bodies.push(JSON.parse(opt.body)); return { ok: true, json: async () => sample }; };
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "now", "KEY", "short", fake);
  assert.equal(bodies[0].searchOption, 10);
});
