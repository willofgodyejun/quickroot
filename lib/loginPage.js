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
:root{--bg:#07040f;--surface:#0e0a1f;--ink:#e8f6ff;--muted:#8f8bb8;--field:#0a0719;--a1:#00f0ff;--err:#ff5c8a;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background-color:var(--bg);background-image:linear-gradient(rgba(0,240,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,43,214,.045) 1px,transparent 1px);background-size:44px 44px;color:var(--ink);font-family:"IBM Plex Sans KR",system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:360px;text-align:center}
h1{font-size:40px;font-weight:700;letter-spacing:.02em;margin:0 0 6px;color:#fff;text-shadow:0 0 8px rgba(0,240,255,.9),0 0 22px rgba(0,240,255,.5),2px 0 0 rgba(255,43,214,.75),-2px 0 0 rgba(0,240,255,.45)}
p.sub{margin:0 0 28px;color:#7fe9ff;font-size:12px;letter-spacing:.12em}
form{background:var(--surface);border:1px solid rgba(0,240,255,.35);border-radius:6px;padding:22px;box-shadow:0 0 0 1px rgba(0,240,255,.2),0 0 26px rgba(0,240,255,.12);display:flex;flex-direction:column;gap:12px;text-align:left}
label{font-size:13px;font-weight:500;color:var(--muted)}
input{width:100%;font:inherit;font-size:16px;padding:13px 14px;border-radius:4px;border:1px solid rgba(0,240,255,.28);background:var(--field);color:var(--ink);box-shadow:inset 0 2px 6px rgba(0,0,0,.85)}
input:focus{outline:none;border-color:var(--a1);background:var(--surface);box-shadow:0 0 0 1px var(--a1),0 0 14px rgba(0,240,255,.55)}
button{font:inherit;font-size:16px;font-weight:700;letter-spacing:.08em;border:0;border-radius:4px;padding:13px;background:#fcee09;color:#0a0a12;cursor:pointer;box-shadow:0 0 0 1px #fcee09,0 0 22px rgba(252,238,9,.5)}
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
