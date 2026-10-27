// 비밀번호만 입력하는 로그인 화면 (외부 파일 없이 한 장짜리 HTML)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function loginPage(error = "") {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>QUICKROOT</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&family=Syncopate:wght@700&display=swap">
<style>
:root{--bg:#07040f;--surface:#0e0a1f;--ink:#e8f6ff;--muted:#8f8bb8;--field:#0a0719;--a1:#00f0ff;--err:#ff5c8a;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background-color:var(--bg);background-image:linear-gradient(rgba(0,240,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,43,214,.045) 1px,transparent 1px);background-size:44px 44px;color:var(--ink);font-family:"IBM Plex Sans KR",system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:360px;text-align:center}
.logo{display:block;margin:0 auto 12px;filter:drop-shadow(0 0 8px rgba(0,240,255,.75)) drop-shadow(0 0 18px rgba(255,43,214,.35))}
.logo .sp{animation:logoSpeed .6s linear infinite}
.logo .bob{animation:logoBob .5s ease-in-out infinite}
.logo .wheel{transform-box:fill-box;transform-origin:center;animation:logoSpin .45s linear infinite}
@keyframes logoSpeed{0%{opacity:0;transform:translateX(10px)}40%{opacity:1}100%{opacity:0;transform:translateX(-14px)}}
@keyframes logoBob{0%,100%{transform:translate(14px,14px) scale(.78)}50%{transform:translate(14px,11.5px) scale(.78)}}
@keyframes logoSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.logo .sp,.logo .bob,.logo .wheel{animation:none}.logo .sp{opacity:.8}}
h1{font-family:"Syncopate","IBM Plex Sans KR",system-ui,sans-serif;font-size:clamp(24px,7.4vw,34px);font-weight:700;letter-spacing:.02em;margin:0 0 6px;color:#fff;text-shadow:0 0 8px rgba(0,240,255,.9),0 0 22px rgba(0,240,255,.5),2px 0 0 rgba(255,43,214,.75),-2px 0 0 rgba(0,240,255,.45)}
p.sub{font-family:"Syncopate","IBM Plex Sans KR",system-ui,sans-serif;margin:0 0 28px;color:#fff;font-size:12px;font-weight:700;letter-spacing:.16em;text-shadow:0 0 6px rgba(0,240,255,.85),0 0 16px rgba(0,240,255,.45),1.5px 0 0 rgba(255,43,214,.7),-1.5px 0 0 rgba(0,240,255,.4)}
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
  <svg class="logo" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
    <rect width="72" height="72" rx="18" fill="#10082c" stroke="#00f0ff" stroke-width="2"/>
    <g class="sp"><line x1="8" y1="28" x2="20" y2="28" stroke="#ff2bd6" stroke-width="2.4" stroke-linecap="round"/></g>
    <g class="sp" style="animation-delay:.25s"><line x1="6" y1="38" x2="20" y2="38" stroke="#ff2bd6" stroke-width="2.4" stroke-linecap="round"/></g>
    <g class="sp" style="animation-delay:.45s"><line x1="9" y1="48" x2="20" y2="48" stroke="#ff2bd6" stroke-width="2.4" stroke-linecap="round"/></g>
    <g class="bob" transform="translate(14 14) scale(.78)">
      <rect x="2" y="18" width="64" height="18" rx="9" fill="#fff"/>
      <path d="M14 18 L21 7 Q22.5 4.5 26 4.5 L43 4.5 Q46.5 4.5 48 7 L55 18 Z" fill="#fff"/>
      <path d="M21 17 L26 8.5 L45 8.5 L50 17 Z" fill="#00f0ff"/>
      <circle cx="31" cy="12.5" r="2" fill="#fff"/><circle cx="40" cy="12.5" r="2" fill="#fff"/>
      <path d="M33.5 15 Q35.5 16.8 37.5 15" stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <circle cx="64" cy="25" r="2.6" fill="#ffd54a"/>
      <circle cx="18" cy="37" r="6.5" fill="#0a3d7a"/><g class="wheel"><circle cx="18" cy="37" r="3" fill="#fff"/><line x1="18" y1="34" x2="18" y2="40" stroke="#0a3d7a" stroke-width="1.4"/></g>
      <circle cx="52" cy="37" r="6.5" fill="#0a3d7a"/><g class="wheel"><circle cx="52" cy="37" r="3" fill="#fff"/><line x1="52" y1="34" x2="52" y2="40" stroke="#0a3d7a" stroke-width="1.4"/></g>
    </g>
  </svg>
  <h1>QUICKROOT</h1>
  <p class="sub">LIVE ROUTE COMPARISON</p>
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
