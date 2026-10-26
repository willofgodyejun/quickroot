import { test } from "node:test";
import assert from "node:assert/strict";
import { createDailyLimiter, createRateLimiter, passwordOk, passwordMatches, createSession, sessionOk, parseCookies, sessionCookie, clientIp, positiveInt } from "../lib/guard.js";

const basic = (user, pass) => "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

test("일일 상한: 한도까지만 허용하고 KST 자정에 초기화", () => {
  let t = Date.parse("2026-10-27T14:00:00Z"); // KST 23:00
  const d = createDailyLimiter({ a: 2 }, () => t);
  assert.equal(d.take("a"), true);
  assert.equal(d.take("a"), true);
  assert.equal(d.take("a"), false);
  assert.equal(d.take("제한없음"), true);
  t = Date.parse("2026-10-27T15:30:00Z"); // KST 다음 날 00:30
  assert.equal(d.take("a"), true);
  assert.equal(d.usage().used.a, 1);
});

test("IP 제한: 구간 안에서 max 초과 시 거절, 구간이 지나면 다시 허용", () => {
  let t = 0;
  const r = createRateLimiter({ max: 3, windowMs: 1000 }, () => t);
  assert.deepEqual([r.hit("ip"), r.hit("ip"), r.hit("ip"), r.hit("ip")], [true, true, true, false]);
  assert.equal(r.hit("other"), true);
  assert.equal(r.blocked("ip"), true);
  t = 1500;
  assert.equal(r.blocked("ip"), false);
  assert.equal(r.hit("ip"), true);
});

test("IP 제한: 지난 항목은 정리돼 메모리가 무한히 늘지 않음", () => {
  let t = 0;
  const r = createRateLimiter({ max: 1, windowMs: 1000 }, () => t);
  for (let i = 0; i < 100; i++) r.hit(`ip${i}`);
  assert.equal(r.size(), 100);
  t = 5000;
  r.hit("new");
  assert.equal(r.size(), 1);
});

test("비밀번호: 맞을 때만 통과, 사용자 이름은 무관, 잘못된 형식은 거절", () => {
  assert.equal(passwordOk(undefined, ""), true); // 비밀번호를 안 쓰는 설정
  assert.equal(passwordOk(basic("아무나", "비번123"), "비번123"), true);
  assert.equal(passwordOk(basic("x", "틀림"), "비번123"), false);
  assert.equal(passwordOk(basic("x", "비번123 "), "비번123"), false);
  assert.equal(passwordOk("Bearer abc", "비번123"), false);
  assert.equal(passwordOk(undefined, "비번123"), false);
  assert.equal(passwordOk("Basic " + Buffer.from("콜론없음").toString("base64"), "비번123"), false);
  assert.equal(passwordOk(basic("x", "a:b"), "a:b"), true); // 비밀번호에 콜론이 있어도 됨
});

test("클라이언트 IP: 프록시를 믿을 때만 X-Forwarded-For의 마지막 값", () => {
  const req = { headers: { "x-forwarded-for": "6.6.6.6, 1.2.3.4" }, socket: { remoteAddress: "10.0.0.1" } };
  assert.equal(clientIp(req, false), "10.0.0.1");
  assert.equal(clientIp(req, true), "1.2.3.4");
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: "10.0.0.1" } }, true), "10.0.0.1");
});

test("환경변수 숫자: 양의 정수가 아니면 기본값", () => {
  assert.equal(positiveInt("500", 1), 500);
  assert.equal(positiveInt("0", 7), 7);
  assert.equal(positiveInt("abc", 7), 7);
  assert.equal(positiveInt(undefined, 7), 7);
  assert.equal(positiveInt("-3", 7), 7);
});

test("비밀번호 입력값 비교", () => {
  assert.equal(passwordMatches("비번123", "비번123"), true);
  assert.equal(passwordMatches("비번124", "비번123"), false);
  assert.equal(passwordMatches("", "비번123"), false);
  assert.equal(passwordMatches(undefined, "비번123"), false);
});

test("로그인 세션: 유효, 만료, 위조, 비밀번호 변경 시 무효", () => {
  let t = 1_800_000_000_000;
  const token = createSession("비번", 1000, () => t);
  assert.equal(sessionOk(token, "비번", () => t + 500), true);
  assert.equal(sessionOk(token, "비번", () => t + 1000), false); // 만료
  assert.equal(sessionOk(token, "다른비번", () => t + 500), false); // 비밀번호 변경
  const [exp, sig] = token.split(".");
  assert.equal(sessionOk(`${Number(exp) + 99999}.${sig}`, "비번", () => t + 500), false); // 만료시각 조작
  assert.equal(sessionOk(`${exp}.${"0".repeat(64)}`, "비번", () => t + 500), false);
  assert.equal(sessionOk("엉터리", "비번", () => t), false);
  assert.equal(sessionOk(undefined, "비번", () => t), false);
  assert.equal(sessionOk(undefined, "", () => t), true); // 비밀번호를 안 쓰는 설정
});

test("쿠키 읽기/만들기", () => {
  assert.deepEqual(parseCookies("a=1; ppalli_session=x%2Ey; b=%ED%95%9C"), { a: "1", ppalli_session: "x.y", b: "한" });
  assert.deepEqual(parseCookies(undefined), {});
  const c = sessionCookie("s", "v", { maxAgeSec: 60, secure: true });
  assert.match(c, /^s=v; Path=\/; HttpOnly; SameSite=Lax; Max-Age=60; Secure$/);
  assert.doesNotMatch(sessionCookie("s", "v", { maxAgeSec: 60, secure: false }), /Secure/);
});
