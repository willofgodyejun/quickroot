// 비밀번호만 입력하는 로그인 화면 (외부 파일 없이 한 장짜리 HTML)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function loginPage(error = "") {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>빨리가유</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap">
<style>
:root{--bg:#f5f5f7;--surface:#fff;--ink:#1d1d1f;--muted:#6e6e73;--field:#f2f2f7;--a1:#0071e3;--err:#d70015;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#000;--surface:#1c1c1e;--ink:#f5f5f7;--muted:#98989d;--field:#2c2c2e;--a1:#0a84ff;--err:#ff6961;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans KR",system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:360px;text-align:center}
h1{font-size:40px;font-weight:700;letter-spacing:-.025em;margin:0 0 6px}
p.sub{margin:0 0 28px;color:var(--muted);font-size:14px}
form{background:var(--surface);border-radius:22px;padding:22px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 28px rgba(0,0,0,.07);display:flex;flex-direction:column;gap:12px;text-align:left}
label{font-size:13px;font-weight:500;color:var(--muted)}
input{width:100%;font:inherit;font-size:16px;padding:13px 14px;border-radius:12px;border:1px solid transparent;background:var(--field);color:var(--ink)}
input:focus{outline:none;border-color:var(--a1);background:var(--surface);box-shadow:0 0 0 4px color-mix(in srgb,var(--a1) 22%,transparent)}
button{font:inherit;font-size:16px;font-weight:600;border:0;border-radius:14px;padding:13px;background:var(--a1);color:#fff;cursor:pointer}
button:hover{filter:brightness(1.08)}
.err{margin:0;font-size:14px;color:var(--err);text-align:center}
</style>
</head>
<body>
<main>
  <h1>빨리가유</h1>
  <p class="sub">실시간 네비게이션 비교분석</p>
  <form method="post" action="/login">
    <label for="pw">비밀번호</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
    ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
    <button type="submit">들어가기</button>
  </form>
</main>
</body>
</html>`;
}
