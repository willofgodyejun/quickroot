// 공유 서버 보호: 접속 비밀번호(Basic 인증), 일일 호출 상한, IP별 요청 제한
import crypto from "node:crypto";

// 한국 시간(KST) 기준 날짜. 자정에 일일 카운트가 0으로 돌아간다
const kstDay = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

// limits: { 이름: 하루 최대 횟수 }. limits에 없는 이름은 제한하지 않는다
export function createDailyLimiter(limits, now = Date.now) {
  let day = kstDay(now());
  const used = {};
  return {
    // 한도 안이면 1 올리고 true, 넘으면 false
    take(name) {
      const today = kstDay(now());
      if (today !== day) {
        day = today;
        for (const k of Object.keys(used)) delete used[k];
      }
      const max = limits[name];
      if (max == null) return true;
      if ((used[name] || 0) >= max) return false;
      used[name] = (used[name] || 0) + 1;
      return true;
    },
    usage() {
      return { day, used: { ...used }, limits: { ...limits } };
    },
  };
}

// 고정 구간 방식: windowMs 안에 같은 key가 max번을 넘으면 거절. 지난 항목은 주기적으로 지운다
export function createRateLimiter({ max, windowMs }, now = Date.now) {
  const hits = new Map();
  let lastSweep = now();
  const sweep = (t) => {
    if (t - lastSweep < windowMs) return;
    lastSweep = t;
    for (const [k, e] of hits) if (t - e.start >= windowMs) hits.delete(k);
  };
  const entry = (key, t) => {
    const e = hits.get(key);
    return e && t - e.start < windowMs ? e : null;
  };
  return {
    // 이번 요청을 세고, 한도 안이면 true
    hit(key) {
      const t = now();
      sweep(t);
      const e = entry(key, t);
      if (!e) {
        hits.set(key, { start: t, count: 1 });
        return max >= 1;
      }
      e.count++;
      return e.count <= max;
    },
    // 세지 않고 이미 한도를 넘었는지만 본다
    blocked(key) {
      const e = entry(key, now());
      return Boolean(e && e.count >= max);
    },
    size: () => hits.size,
  };
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest();

// "Authorization: Basic ..." 의 비밀번호가 맞는지. 사용자 이름은 아무거나 허용하고, 길이가 새지 않게 해시로 비교한다
export function passwordOk(header, password) {
  if (!password) return true;
  const m = /^Basic\s+(.+)$/i.exec(header || "");
  if (!m) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return crypto.timingSafeEqual(sha256(decoded.slice(i + 1)), sha256(password));
}

// 접속자 IP. 프록시(배포 서비스) 뒤에서는 프록시가 덧붙인 마지막 X-Forwarded-For 값을 쓴다 (앞쪽 값은 위조 가능)
export function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket?.remoteAddress || "unknown";
}

// 환경변수 숫자 읽기: 양의 정수가 아니면 기본값
export function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
