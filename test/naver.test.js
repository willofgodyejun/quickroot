import { test } from "node:test";
import assert from "node:assert/strict";
import { toComparable, congestionBucket, getRoute } from "../lib/naver.js";

const sample = {
  code: 0,
  message: "길찾기를 성공하였습니다.",
  route: { traoptimal: [{
    summary: { distance: 30000, duration: 2700000, tollFare: 1100, taxiFare: 32000 },
    section: [
      { pointIndex: 0, pointCount: 10, distance: 10000, name: "자유로", congestion: 1 },
      { pointIndex: 10, pointCount: 5, distance: 2000, name: "자유로", congestion: 2 },
      { pointIndex: 15, pointCount: 5, distance: 8000, name: "강변북로", congestion: 2 },
      { pointIndex: 20, pointCount: 2, distance: 500, name: "", congestion: 0 },
      { pointIndex: 22, pointCount: 5, distance: 9500, name: "올림픽대로", congestion: 3 },
    ],
  }] },
};

test("congestion 분류", () => {
  assert.equal(congestionBucket(1), "ok");
  assert.equal(congestionBucket(2), "slow");
  assert.equal(congestionBucket(3), "jam");
  assert.equal(congestionBucket(0), "none");
});

test("응답 변환", () => {
  const r = toComparable(sample);
  assert.equal(r.source, "naver");
  assert.equal(r.dist, 30);
  assert.equal(r.min, 45);
  assert.equal(r.toll, 1100);
  assert.deepEqual(r.legs.map((l) => l.road), ["자유로", "강변북로", "이름 없는 도로", "올림픽대로"]);
  assert.equal(r.legs[0].len, 12);
  const sum = Object.values(r.share).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(r.share.jam - 9500 / 30000) < 1e-9);
});

test("경로 실패 코드 처리", () => {
  assert.throws(() => toComparable({ code: 1, message: "출발지와 도착지가 같습니다." }), /같습니다/);
});

test("API 호출 형식과 오류 메시지", async () => {
  const calls = [];
  const fake = async (url, opt) => { calls.push({ url, opt }); return { ok: true, json: async () => sample }; };
  await getRoute({ x: 126.7, y: 37.6 }, { x: 127.0, y: 37.5 }, "ID", "SECRET", "recommend", fake);
  assert.match(calls[0].url, /^https:\/\/maps\.apigw\.ntruss\.com\/map-direction-15\/v1\/driving\?start=126\.7%2C37\.6&goal=127%2C37\.5/);
  assert.equal(calls[0].opt.headers["X-NCP-APIGW-API-KEY-ID"], "ID");
  assert.equal(calls[0].opt.headers["X-NCP-APIGW-API-KEY"], "SECRET");
  const bad = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Permission Denied" } }) });
  await assert.rejects(getRoute({ x: 1, y: 1 }, { x: 2, y: 2 }, "ID", "S", "recommend", bad), /Permission Denied/);
});

test("경로 옵션: 추천경로/최소시간", async () => {
  const urls = [];
  const fast = { ...sample, route: { trafast: sample.route.traoptimal } };
  const fake = async (url) => { urls.push(url); return { ok: true, json: async () => (urls.length === 1 ? sample : fast) }; };
  const a = { x: 126.7, y: 37.6 }, b = { x: 127.0, y: 37.5 };
  await getRoute(a, b, "ID", "S", "recommend", fake);
  const r = await getRoute(a, b, "ID", "S", "fast", fake);
  assert.match(urls[0], /option=traoptimal/);
  assert.match(urls[1], /option=trafast/);
  assert.equal(r.min, 45); // trafast 키로 와도 변환된다
});

test("지도용 경로 좌표", () => {
  const body = { code: 0, route: { traoptimal: [{
    summary: { distance: 3000, duration: 300000 },
    path: [[126.1, 37.1], [126.2, 37.2], [126.3, 37.3], [126.4, 37.4]],
    section: [
      { pointIndex: 0, pointCount: 1, distance: 1000, name: "a", congestion: 1 },
      { pointIndex: 1, pointCount: 2, distance: 2000, name: "b", congestion: 3 },
    ],
  }] } };
  const r = toComparable(body);
  assert.deepEqual(r.path[0].pts, [[37.1, 126.1], [37.2, 126.2]]);
  assert.deepEqual(r.path[1], { st: "jam", pts: [[37.2, 126.2], [37.3, 126.3], [37.4, 126.4]] });
});

test("최단경로: 후보 중 거리가 가장 짧은 경로", async () => {
  const mk = (distance) => [{ summary: { distance, duration: 600000 }, section: [{ pointIndex: 0, pointCount: 1, distance, name: "a", congestion: 1 }], path: [[126.1, 37.1], [126.2, 37.2]] }];
  const body = { code: 0, route: { traoptimal: mk(30000), trafast: mk(28000), tracomfort: mk(31000) } };
  const urls = [];
  const fake = async (url) => { urls.push(url); return { ok: true, json: async () => body }; };
  const r = await getRoute({ x: 1, y: 1 }, { x: 2, y: 2 }, "ID", "S", "short", fake);
  assert.equal(r.dist, 28);
  assert.match(urls[0], /option=traoptimal%3Atrafast%3Atracomfort/);
  assert.equal(toComparable(body).dist, 30); // 기본 모드는 첫 후보
});
