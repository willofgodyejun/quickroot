import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSteps } from "../lib/steps.js";
import { sectionSeconds } from "../lib/naver.js";

const seg = (name, dist, sec, st = "ok") => ({ name, dist, sec, st });

test("같은 도로는 합치고 이름 없는 구간·아주 짧은 구간은 앞 구간에 붙임", () => {
  const steps = buildSteps([
    seg("자유로", 10000, 600), seg("자유로", 2000, 300, "slow"),
    seg("", 400, 60), seg("진출로", 200, 30),            // 이름 없음 / 300m 미만 → 앞에 합침
    seg("강변북로", 8000, 900, "slow"),
  ]);
  assert.deepEqual(steps.map((s) => s.road), ["자유로", "강변북로"]);
  assert.equal(steps[0].km, 12.6);
  assert.equal(steps[0].min, 17);            // (600+300+60+30)초 = 990초 = 16.5분 → 반올림 17분
  assert.equal(steps[0].st, "ok");           // 길이 가장 긴 상태(10km ok vs 2km slow)
  assert.equal(steps[1].st, "slow");
});

test("단계가 많으면 가장 짧은 단계를 더 긴 이웃에 합침", () => {
  const segs = Array.from({ length: 12 }, (_, i) => seg(`도로${i}`, 1000 + i * 500, 100));
  const steps = buildSteps(segs, { maxSteps: 6 });
  assert.equal(steps.length, 6);
  const total = steps.reduce((a, s) => a + s.km, 0);
  assert.ok(Math.abs(total - segs.reduce((a, s) => a + s.dist, 0) / 1000) < 0.7); // 거리 합은 보존(반올림 오차만)
});

test("빈 입력·거리 0 구간 처리", () => {
  assert.deepEqual(buildSteps([]), []);
  assert.deepEqual(buildSteps([seg("a", 0, 0)]), []);
  assert.equal(buildSteps([seg("", 1000, 60)])[0].road, "출발지 주변");
  assert.equal(buildSteps([seg("a", 1000, 60), seg("", 100, 5), seg("b", 1000, 60)]).length, 2); // 중간의 이름 없는 짧은 구간은 앞에 합침
});

test("네이버: guide 시간을 구간에 배분하고, guide가 없으면 길이/속도 비율로 나눔", () => {
  const route = {
    summary: { duration: 600000 },
    path: Array.from({ length: 100 }, (_, i) => [126 + i / 1000, 37]),
    guide: [{ pointIndex: 0, duration: 100000 }, { pointIndex: 50, duration: 500000 }],
  };
  const sections = [{ pointIndex: 0, pointCount: 50, distance: 5000, speed: 50 }, { pointIndex: 50, pointCount: 50, distance: 5000, speed: 50 }];
  const secs = sectionSeconds(route, sections);
  assert.deepEqual(secs.map(Math.round), [100, 500]);
  const noGuide = sectionSeconds({ summary: { duration: 600000 }, path: [] }, [
    { distance: 1000, speed: 100 }, { distance: 1000, speed: 25 },
  ]);
  assert.equal(Math.round(noGuide[0] + noGuide[1]), 600);   // 합은 전체 시간
  assert.ok(noGuide[1] > noGuide[0]);                       // 느린 구간이 더 오래 걸림
});

test("구간 단계가 지도 경로의 점 번호 범위(pi)를 합쳐서 갖는다", () => {
  const steps = buildSteps([
    { name: "자유로", dist: 5000, sec: 300, st: "ok", pi: [0, 10] },
    { name: "자유로", dist: 5000, sec: 300, st: "ok", pi: [10, 25] },
    { name: "", dist: 100, sec: 10, st: "ok" },                       // 점 정보 없는 구간은 범위에 영향 없음
    { name: "강변북로", dist: 8000, sec: 600, st: "slow", pi: [25, 40] },
  ]);
  assert.deepEqual(steps.map((s) => s.pi), [[0, 25], [25, 40]]);
  assert.equal(buildSteps([{ name: "a", dist: 1000, sec: 60, st: "ok" }])[0].pi, null);
});
