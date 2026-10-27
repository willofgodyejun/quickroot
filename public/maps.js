// 앱별 지도: 네이버 · 카카오 · 티맵 각자의 지도 SDK로 경로를 그립니다.
// SDK를 못 불러오거나 인증에 실패하면 Leaflet(OpenStreetMap)으로 대신 그리고 이유를 돌려줍니다.
const RouteMaps = (() => {
  let cfg = {};
  const loaded = {};
  const leaflets = [];
  const fits = {};      // 지도 id → 경로 전체 보기 함수
  const maps = {};      // 지도 id → SDK 지도 객체
  const observers = [];
  const kinds = {};     // 지도 id → "naver" | "kakao" | "tmap" | "leaflet"
  const hl = {};        // 지도 id → 구간 강조용으로 그린 선 목록

  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error("SDK 스크립트를 불러오지 못했어요"));
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }

  const flat = (path) => path.flatMap((s) => s.pts);

  // 경로 전체가 한눈에 들어오도록 범위를 넉넉히 잡는다 → [남서, 북동] 모서리.
  // 마커 핀은 좌표 위쪽으로 솟아 있어서 위쪽 여백을 더 크게 둔다. 아주 짧은 경로는 지나치게 확대되지 않게 최소 범위를 둔다
  function paddedCorners(pts) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of pts) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    const dLat = Math.max(maxLat - minLat, 0.004);
    const dLng = Math.max(maxLng - minLng, 0.004);
    return [[minLat - dLat * 0.12, minLng - dLng * 0.1], [maxLat + dLat * 0.25, maxLng + dLng * 0.1]];
  }

  // 지도 칸 크기가 바뀌면(창 크기 변경, 레이아웃 변경) 경로 전체가 다시 보이게 맞춘다
  function watchResize(el, fit) {
    if (typeof ResizeObserver === "undefined") return;
    let timer = null;
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(fit, 150); });
    ro.observe(el);
    observers.push(ro);
  }
  const timeout = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));

  // ---- 네이버 (Maps JS API v3: ncpKeyId = Client ID, 'Web Dynamic Map' 이용 신청 + 서비스 URL 등록 필요) ----
  let naverAuthError = null;
  async function renderNaver(el, path, colors) {
    if (!cfg.naverClientId) throw new Error("네이버 Client ID가 없어요");
    window.navermap_authFailure = () => { naverAuthError = new Error("네이버 지도 인증 실패 (Dynamic Map 이용 신청·서비스 URL 확인)"); };
    await loadScript(`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(cfg.naverClientId)}`);
    if (!window.naver?.maps) throw new Error("네이버 지도 SDK를 쓸 수 없어요");
    const ll = (p) => new naver.maps.LatLng(p[0], p[1]);
    const map = new naver.maps.Map(el, { zoomControl: true, scrollWheelZoom: false });
    const bounds = new naver.maps.LatLngBounds();
    path.forEach((seg) => {
      const pts = seg.pts.map(ll);
      pts.forEach((p) => bounds.extend(p));
      new naver.maps.Polyline({ map, path: pts, strokeColor: colors[seg.st], strokeWeight: 6, strokeOpacity: 1 });
    });
    const pts = flat(path);
    const rawPts = pts;
    new naver.maps.Marker({ map, position: ll(pts[0]), title: "출발" });
    new naver.maps.Marker({ map, position: ll(pts[pts.length - 1]), title: "도착" });
    const [sw, ne] = paddedCorners(rawPts);
    bounds.extend(ll(sw));
    bounds.extend(ll(ne));
    const fit = () => map.fitBounds(bounds, { top: 8, right: 8, bottom: 8, left: 8 });
    fit();
    setTimeout(fit, 400);
    fits[el.id] = fit; maps[el.id] = map; kinds[el.id] = "naver"; watchResize(el, fit);
    await new Promise((r) => setTimeout(r, 1500)); // 인증 결과는 지도 생성 직후 비동기로 온다
    // 인증이 거절되면 콜백이 오거나, SDK가 지도 자리에 오류 문구를 그려 넣는다
    const failed = naverAuthError || (/인증이 실패|인증 실패|Open API/.test(el.textContent) ? new Error("네이버 지도 인증 실패 (콘솔에서 Dynamic Map 이용 신청·서비스 URL 확인)") : null);
    naverAuthError = null;
    if (failed) throw failed;
  }

  // ---- 카카오 (JavaScript 키 + 사이트 도메인 등록 + 카카오맵 사용 설정 필요) ----
  async function renderKakao(el, path, colors) {
    if (!cfg.kakaoJsKey) throw new Error("카카오 JavaScript 키가 없어요 (.env의 KAKAO_JS_KEY)");
    await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(cfg.kakaoJsKey)}&autoload=false`);
    if (!window.kakao?.maps) throw new Error("카카오 지도 SDK를 쓸 수 없어요");
    await new Promise((resolve) => kakao.maps.load(resolve));
    const ll = (p) => new kakao.maps.LatLng(p[0], p[1]);
    const pts = flat(path);
    const map = new kakao.maps.Map(el, { center: ll(pts[0]), level: 8 });
    const bounds = new kakao.maps.LatLngBounds();
    path.forEach((seg) => {
      const line = seg.pts.map(ll);
      line.forEach((p) => bounds.extend(p));
      new kakao.maps.Polyline({ map, path: line, strokeColor: colors[seg.st], strokeWeight: 6, strokeOpacity: 1 });
    });
    new kakao.maps.Marker({ map, position: ll(pts[0]), title: "출발" });
    new kakao.maps.Marker({ map, position: ll(pts[pts.length - 1]), title: "도착" });
    // 지도 크기가 잡힌 뒤에 맞춰야 경로 전체가 보인다
    const [sw, ne] = paddedCorners(pts);
    bounds.extend(ll(sw));
    bounds.extend(ll(ne));
    const fit = () => { map.relayout(); map.setBounds(bounds, 8, 8, 8, 8); };
    fit();
    setTimeout(fit, 400);
    fits[el.id] = fit; maps[el.id] = map; kinds[el.id] = "kakao"; watchResize(el, fit);
  }

  // ---- 티맵 (Tmapv2 지도 SDK: appKey, 지도 API 이용 신청 필요) ----
  async function renderTmap(el, path, colors) {
    if (!cfg.tmapAppKey) throw new Error("티맵 appKey가 없어요");
    await loadScript(`https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${encodeURIComponent(cfg.tmapAppKey)}`);
    if (!window.Tmapv2) throw new Error("티맵 지도 SDK를 쓸 수 없어요");
    // 로더는 본체(tmapjs2)를 document.write로 붙이는데, 동적으로 넣은 스크립트에서는 동작하지 않아서 본체를 직접 불러온다
    if (!Tmapv2.Map) await loadScript(`${Tmapv2._getScriptLocation()}tmapjs2.min.js?version=20231206`);
    if (!Tmapv2.Map) throw new Error("티맵 지도 SDK 본체를 불러오지 못했어요");
    const ll = (p) => new Tmapv2.LatLng(p[0], p[1]);
    const pts = flat(path);
    el.innerHTML = "";
    const map = new Tmapv2.Map(el.id, { center: ll(pts[0]), width: "100%", height: `${el.clientHeight || 220}px`, zoom: 11 });
    const bounds = new Tmapv2.LatLngBounds();
    path.forEach((seg) => {
      const line = seg.pts.map(ll);
      line.forEach((p) => bounds.extend(p));
      new Tmapv2.Polyline({ map, path: line, strokeColor: colors[seg.st], strokeWeight: 6 });
    });
    new Tmapv2.Marker({ position: ll(pts[0]), map, title: "출발" });
    new Tmapv2.Marker({ position: ll(pts[pts.length - 1]), map, title: "도착" });
    // 지도 크기가 잡힌 뒤에 맞춰야 경로 전체가 보인다
    const [sw, ne] = paddedCorners(pts);
    bounds.extend(ll(sw));
    bounds.extend(ll(ne));
    const fit = () => { map.fitBounds(bounds); };
    fit();
    setTimeout(fit, 400);
    fits[el.id] = fit; maps[el.id] = map; kinds[el.id] = "tmap"; watchResize(el, fit);
  }

  // ---- 대체: Leaflet + OpenStreetMap ----
  function leaflet(el, path, colors, names) {
    if (typeof L === "undefined") throw new Error("대체 지도(Leaflet)도 불러오지 못했어요");
    el.innerHTML = "";
    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    const all = flat(path);
    path.forEach((seg) => {
      L.polyline(seg.pts, { color: "#fff", weight: 8, opacity: 0.9 }).addTo(map);
      L.polyline(seg.pts, { color: colors[seg.st], weight: 5 }).addTo(map).bindTooltip(names[seg.st]);
    });
    L.circleMarker(all[0], { radius: 7, color: "#fff", weight: 2, fillColor: "#1c6cb3", fillOpacity: 1 }).addTo(map).bindTooltip("출발");
    L.circleMarker(all[all.length - 1], { radius: 7, color: "#fff", weight: 2, fillColor: "#d93a2f", fillOpacity: 1 }).addTo(map).bindTooltip("도착");
    const [sw, ne] = paddedCorners(all);
    const fit = () => { map.invalidateSize(); map.fitBounds(L.latLngBounds([sw, ne]), { padding: [8, 8] }); };
    fit();
    fits[el.id] = fit; maps[el.id] = map; kinds[el.id] = "leaflet"; watchResize(el, fit);
    leaflets.push(map);
  }

  // ---- 구간 강조: 해당 구간만 흰 테두리 + 상태 색으로 굵게 덧그린다 ----
  function clearHighlight(appId) {
    const id = "map-" + appId;
    (hl[id] || []).forEach((x) => {
      try { kinds[id] === "leaflet" ? maps[id].removeLayer(x) : x.setMap(null); } catch (_) {}
    });
    hl[id] = [];
  }
  function highlight(appId, pts, color) {
    clearHighlight(appId);
    const id = "map-" + appId, map = maps[id], kind = kinds[id];
    if (!map || !kind || !pts || pts.length < 2) return;
    const lines = [];
    if (kind === "naver") {
      const path = pts.map((p) => new naver.maps.LatLng(p[0], p[1]));
      lines.push(new naver.maps.Polyline({ map, path, strokeColor: "#ffffff", strokeWeight: 13, strokeOpacity: 0.95, zIndex: 50 }));
      lines.push(new naver.maps.Polyline({ map, path, strokeColor: color, strokeWeight: 7, strokeOpacity: 1, zIndex: 51 }));
    } else if (kind === "kakao") {
      const path = pts.map((p) => new kakao.maps.LatLng(p[0], p[1]));
      lines.push(new kakao.maps.Polyline({ map, path, strokeColor: "#ffffff", strokeWeight: 13, strokeOpacity: 0.95, zIndex: 50 }));
      lines.push(new kakao.maps.Polyline({ map, path, strokeColor: color, strokeWeight: 7, strokeOpacity: 1, zIndex: 51 }));
    } else if (kind === "tmap") {
      const path = pts.map((p) => new Tmapv2.LatLng(p[0], p[1]));
      lines.push(new Tmapv2.Polyline({ map, path, strokeColor: "#ffffff", strokeWeight: 13, strokeOpacity: 0.95 }));
      lines.push(new Tmapv2.Polyline({ map, path, strokeColor: color, strokeWeight: 7, strokeOpacity: 1 }));
    } else {
      lines.push(L.polyline(pts, { color: "#ffffff", weight: 13, opacity: 0.95 }).addTo(map));
      lines.push(L.polyline(pts, { color, weight: 7, opacity: 1 }).addTo(map));
    }
    hl[id] = lines;
  }

  const renderers = { naver: renderNaver, kakao: renderKakao, tmap: renderTmap };

  return {
    init(config) { cfg = config || {}; },
    reset() {
      for (const k of Object.keys(hl)) delete hl[k];
      leaflets.splice(0).forEach((m) => m.remove());
      observers.splice(0).forEach((o) => o.disconnect());
      for (const k of Object.keys(fits)) delete fits[k];
      for (const k of Object.keys(maps)) delete maps[k];
    },
    // 경로 전체 보기: 사용자가 확대·이동한 뒤 처음 배율로 되돌린다 (appId 없으면 전부)
    fit(appId) { (appId ? [appId] : Object.keys(fits).map((k) => k.replace(/^map-/, ""))).forEach((id) => fits["map-" + id]?.()); },
    instance(appId) { return maps["map-" + appId]; },
    highlight,
    clearHighlight,
    // 앱 자체 지도로 그리고 { fallback, reason }을 돌려줌. 실패하면 Leaflet으로 대체
    async draw(appId, el, path, colors, names) {
      const render = renderers[appId];
      try {
        if (!render) throw new Error("지원하지 않는 지도예요");
        await Promise.race([render(el, path, colors, names), timeout(12000, "지도 불러오기 시간 초과")]);
        return { fallback: false };
      } catch (e) {
        try { leaflet(el, path, colors, names); } catch (e2) { return { fallback: true, reason: `${e.message} / ${e2.message}` }; }
        return { fallback: true, reason: e.message };
      }
    },
  };
})();
