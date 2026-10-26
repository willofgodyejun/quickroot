import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAverages, fetchAverages, DEFAULT_PRICES } from "../lib/opinet.js";

const sample = { RESULT: { OIL: [
  { TRADE_DT: "20261026", PRODCD: "B034", PRODNM: "고급휘발유", PRICE: "2100.10" },
  { TRADE_DT: "20261026", PRODCD: "B027", PRODNM: "휘발유", PRICE: "1857.60" },
  { TRADE_DT: "20261026", PRODCD: "D047", PRODNM: "자동차용경유", PRICE: "1843.30" },
] } };

test("오피넷 평균가 파싱", () => {
  assert.deepEqual(parseAverages(sample), { gasoline: 1858, diesel: 1843, asOf: "2026-10-26" });
});

test("형식이 다르면 오류", () => {
  assert.throws(() => parseAverages({}), /형식/);
  assert.throws(() => parseAverages({ RESULT: { OIL: [{ PRODCD: "B027", PRICE: "1800" }] } }), /경유/);
});

test("API 호출 형식", async () => {
  const urls = [];
  const fake = async (url) => { urls.push(url); return { ok: true, json: async () => sample }; };
  const r = await fetchAverages("KEY", fake);
  assert.equal(r.gasoline, 1858);
  assert.match(urls[0], /^http:\/\/www\.opinet\.co\.kr\/api\/avgAllPrice\.do\?out=json&code=KEY$/);
  await assert.rejects(fetchAverages("KEY", async () => ({ ok: false, status: 401 })), /401/);
});

test("기본값 존재", () => {
  assert.ok(DEFAULT_PRICES.gasoline > 1000 && DEFAULT_PRICES.diesel > 1000 && DEFAULT_PRICES.ev > 0);
});
