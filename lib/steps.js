// 도로가 바뀌는 분기점마다 한 단계씩, 구간 길이·소요시간·교통 상태를 요약한다 (지도 아래 줄글용)
// segs: 경로 순서대로 [{ name, dist(m), sec(초), st("ok"|"slow"|"jam"|"none"), pi?: [시작, 끝) }]
// pi는 지도 경로(path의 점들을 순서대로 이어 붙인 목록) 안의 점 번호 범위. 단계마다 합쳐서 지도에서 그 구간만 강조할 수 있게 한다
const STATES = ["ok", "slow", "jam", "none"];

function newRun(seg) {
  const run = { name: seg.name || "", dist: 0, sec: 0, pi: null, byState: { ok: 0, slow: 0, jam: 0, none: 0 } };
  addTo(run, seg);
  return run;
}
function addTo(run, seg) {
  run.dist += seg.dist || 0;
  run.sec += seg.sec || 0;
  run.byState[STATES.includes(seg.st) ? seg.st : "none"] += seg.dist || 0;
  if (seg.pi) joinRange(run, seg.pi);
}
function joinRange(run, pi) {
  run.pi = run.pi ? [Math.min(run.pi[0], pi[0]), Math.max(run.pi[1], pi[1])] : [pi[0], pi[1]];
}
function mergeInto(a, b) {
  a.dist += b.dist;
  a.sec += b.sec;
  for (const k of STATES) a.byState[k] += b.byState[k];
  if (b.pi) joinRange(a, b.pi);
  if (!a.name) a.name = b.name;
}

export function buildSteps(segs, { maxSteps = 8, minKm = 0.3 } = {}) {
  const runs = [];
  for (const seg of segs) {
    if (!(seg.dist > 0)) continue;
    const last = runs[runs.length - 1];
    // 이름이 같거나, 이름이 없거나, 아주 짧은 구간(진출입로 등)은 앞 구간에 붙여 분기점 단위로 읽히게 한다
    if (last && (seg.name === last.name || !seg.name || seg.dist < minKm * 1000)) addTo(last, seg);
    else runs.push(newRun(seg));
  }
  // 단계가 너무 많으면 가장 짧은 단계를 더 긴 이웃에 합친다
  while (runs.length > maxSteps) {
    let i = 0;
    runs.forEach((r, j) => { if (r.dist < runs[i].dist) i = j; });
    const prev = runs[i - 1], next = runs[i + 1];
    const target = !prev ? next : !next ? prev : prev.dist >= next.dist ? prev : next;
    mergeInto(target, runs[i]);
    runs.splice(i, 1);
    // 합쳐서 같은 이름이 이어지면 다시 합친다
    for (let j = runs.length - 1; j > 0; j--) {
      if (runs[j].name && runs[j].name === runs[j - 1].name) { mergeInto(runs[j - 1], runs[j]); runs.splice(j, 1); }
    }
  }
  return runs.map((r, i) => ({
    road: r.name || (i === 0 ? "출발지 주변" : "이름 없는 도로"),
    km: Math.round(r.dist / 100) / 10,
    min: Math.round(r.sec / 60),
    pi: r.pi,
    // 길이가 가장 긴 교통 상태를 대표로
    st: STATES.reduce((best, k) => (r.byState[k] > r.byState[best] ? k : best), "ok"),
  }));
}
