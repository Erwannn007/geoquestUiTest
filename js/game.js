/**
 * GeoQuest — prototype web de l'UI, fidèle à apps/mobile :
 * permission GPS → carte (joueur + lieux) → fiche du lieu → tirage de carte,
 * menu (Profil, Catalogue), toasts de déblocage, panneau de debug.
 * La position est simulée (debug « Téléporter au toucher » / lieux prédéfinis).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Thème                                                               */
  /* ------------------------------------------------------------------ */
  const params = new URLSearchParams(location.search);
  const THEME = GQ_THEMES.find((t) => t.id === params.get('theme')) || GQ_THEMES[0];
  document.documentElement.dataset.theme = THEME.id;
  document.title = `GeoQuest · ${THEME.name}`;
  if (THEME.fonts) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${THEME.fonts}&display=swap`;
    document.head.appendChild(l);
  }
  const G = THEME.glyphs;

  const rarityOf = (id) => {
    const r = GQ.RARITIES[Math.max(0, GQ.rarityRank(id))];
    const o = THEME.rarity && THEME.rarity[r.id];
    return o ? { ...r, color: o[0], tint: o[1] } : r;
  };

  /* ------------------------------------------------------------------ */
  /* Sauvegarde                                                          */
  /* ------------------------------------------------------------------ */
  const KEY = 'geoquest-ui-demo-v1';
  let S;
  try {
    S = JSON.parse(localStorage.getItem(KEY));
  } catch (e) {
    S = null;
  }
  if (!S || S.v !== 1) S = GQ.seedState();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      /* stockage indisponible : la partie reste en mémoire */
    }
  };

  const today = () => GQ.dayKey();
  const lifetime = () => S.lifetimeBase + Object.values(S.days).reduce((a, b) => a + b, 0);
  const balance = () => lifetime() - S.spent + S.refunded;
  const drawsToday = (poiId) => (S.draws[today()] || {})[poiId] || 0;
  // Version de test : tirages gratuits et illimités (le jeu applique GQ.quoteFor : 1 gratuit, puis payant, plafonné)
  const UNLIMITED_DRAWS = true;
  const quote = (poiId) => (UNLIMITED_DRAWS ? { kind: 'free', price: 0, paidLeft: Infinity } : GQ.quoteFor(drawsToday(poiId)));

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                         */
  /* ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = (n) => Math.max(0, Math.round(n)).toLocaleString('fr-FR');
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const haptic = () => navigator.vibrate && navigator.vibrate(12);

  const journal = [];
  function log(source, message, level = 'info') {
    journal.unshift({ at: new Date(), source, message, level });
    journal.length = Math.min(journal.length, 60);
    if (debugOpen) renderDebug();
  }

  async function fetchJson(url, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      log('http', `${new URL(url).host} ${Date.now() - started} ms`, 'ok');
      return json;
    } catch (e) {
      log('http', `${new URL(url).host} : ${e.name === 'AbortError' ? 'délai dépassé' : e.message}`, 'error');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Services : reverse search (Nominatim → Photon), Wikipédia           */
  /* ------------------------------------------------------------------ */
  const reverseCache = new Map();
  let lastNominatim = 0;
  async function reverse(p) {
    const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    if (reverseCache.has(key)) return reverseCache.get(key);
    const job = (async () => {
      try {
        const wait = 1100 - (Date.now() - lastNominatim);
        if (wait > 0) await sleep(wait);
        lastNominatim = Date.now();
        const j = await fetchJson(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&extratags=1&zoom=18&accept-language=fr&lat=${p.lat}&lon=${p.lon}`,
        );
        const a = j.address || {};
        return {
          provider: 'Nominatim',
          name: j.name || null,
          street: [a.house_number, a.road || a.pedestrian || a.square].filter(Boolean).join(' ') || null,
          postcode: a.postcode,
          city: a.city || a.town || a.village || a.municipality,
          state: a.state,
          country: a.country,
          displayName: j.display_name,
          category: j.category,
          type: j.type,
          extra: { wikipedia: j.extratags && j.extratags.wikipedia, openingHours: j.extratags && j.extratags.opening_hours },
        };
      } catch (e) {
        const j = await fetchJson(`https://photon.komoot.io/reverse?lang=fr&lat=${p.lat}&lon=${p.lon}`);
        const f = j.features && j.features[0];
        if (!f) throw new Error('aucun résultat');
        const a = f.properties;
        return {
          provider: 'Photon',
          name: a.name || null,
          street: [a.housenumber, a.street].filter(Boolean).join(' ') || null,
          postcode: a.postcode,
          city: a.city,
          state: a.state,
          country: a.country,
          displayName: [a.name, a.street, a.city, a.country].filter(Boolean).join(', '),
          category: a.osm_key,
          type: a.osm_value,
          extra: {},
        };
      }
    })();
    reverseCache.set(key, job);
    job.catch(() => reverseCache.delete(key));
    return job;
  }
  const shortAddress = (d) => [d.street || d.name, d.city].filter(Boolean).join(', ');

  const wikiCache = new Map();
  function wiki(title) {
    if (!title) return Promise.resolve(null);
    if (!wikiCache.has(title)) {
      const job = fetchJson(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, 5000)
        .then((j) => ({
          extract: j.extract || null,
          description: j.description || null,
          image: (j.thumbnail && j.thumbnail.source) || null,
          url: (j.content_urls && j.content_urls.mobile && j.content_urls.mobile.page) || null,
        }))
        .catch(() => null);
      wikiCache.set(title, job);
    }
    return wikiCache.get(title);
  }
  const wikipediaUrl = (t) => `https://fr.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
  const osmUrl = (poi) => `https://www.openstreetmap.org/${poi.id}`;

  /* ------------------------------------------------------------------ */
  /* État de jeu                                                         */
  /* ------------------------------------------------------------------ */
  let position = { ...GQ.MOCK_PLACES[0], accuracy: 12 };
  let following = true;
  let teleportArmed = false;
  let selection = null; // { kind: 'poi', id } | { kind: 'point', lat, lon }
  let loadingPois = false;
  let mapError = null;
  let playerAddress = null;
  const pois = GQ.DEMO_POIS.map((p) => ({ ...p, distance: Infinity, state: 'locked' }));

  function updatePois() {
    pois.forEach((p) => {
      p.distance = GQ.distanceMeters(position, p);
      p.state = S.cards[p.id] || S.discovered[p.id] ? 'discovered' : p.distance <= GQ.GAME_RULES.discoverRadiusMeters ? 'inRange' : 'locked';
    });
  }
  const nearestInRange = () =>
    pois.filter((p) => p.state === 'inRange').sort((a, b) => a.distance - b.distance)[0] || null;

  /* ------------------------------------------------------------------ */
  /* Carte                                                               */
  /* ------------------------------------------------------------------ */
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

  function recolor(style, P) {
    style.layers.forEach((l) => {
      const id = l.id;
      const p = (l.paint = l.paint || {});
      const line = l.type === 'line';
      if (l.type === 'background') p['background-color'] = P.bg;
      else if (id === 'park') { p['fill-color'] = P.park; p['fill-opacity'] = 1; }
      else if (id === 'landcover_wood') { p['fill-color'] = P.wood; p['fill-opacity'] = 0.9; }
      else if (id === 'water') p['fill-color'] = P.water;
      else if (id === 'waterway') p['line-color'] = P.water;
      else if (id.indexOf('landcover_') === 0) p['fill-color'] = P.bg;
      else if (id === 'landuse_residential') { p['fill-color'] = P.residential; p['fill-opacity'] = 1; }
      else if (id === 'building') { p['fill-color'] = P.building; p['fill-outline-color'] = P.buildingLine; }
      else if (id.indexOf('aeroway') === 0) line ? (p['line-color'] = P.road) : (p['fill-color'] = P.residential);
      else if (line && /casing/.test(id)) p['line-color'] = P.casing;
      else if (line && /rail/.test(id)) p['line-color'] = P.rail;
      else if (line && /boundary/.test(id)) p['line-color'] = P.boundary;
      else if (line && /(major|motorway)/.test(id)) p['line-color'] = P.roadMajor;
      else if (line) p['line-color'] = P.road;
      else if (l.type === 'fill' && /road|pier/.test(id)) p['fill-color'] = P.road;
      else if (l.type === 'symbol') {
        if (/shield/.test(id)) l.layout = { ...(l.layout || {}), visibility: 'none' };
        else { p['text-color'] = P.label; p['text-halo-color'] = P.halo; p['text-halo-width'] = 1.4; }
      }
    });
    return style;
  }

  let map = null;
  let playerMarker = null;
  let selectionMarker = null;
  const pinMarkers = new Map();
  let ignoreMapClickUntil = 0;
  let flying = false;

  async function initMap() {
    let style = STYLE_URL;
    try {
      style = recolor(await fetchJson(STYLE_URL, 8000), THEME.map);
    } catch (e) {
      log('map', 'Style recoloré indisponible, style par défaut', 'warn');
    }
    map = new maplibregl.Map({
      container: 'map',
      style,
      center: [position.lon, position.lat],
      zoom: 16.4,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();

    map.on('load', () => {
      map.addSource('accuracy', { type: 'geojson', data: accuracyCircle() });
      map.addLayer({ id: 'accuracy-fill', type: 'fill', source: 'accuracy', paint: { 'fill-color': THEME.accuracy, 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'accuracy-line', type: 'line', source: 'accuracy', paint: { 'line-color': THEME.accuracy, 'line-opacity': 0.4, 'line-width': 1 } });
      const attrib = document.querySelector('.maplibregl-ctrl-attrib');
      if (attrib) attrib.classList.remove('maplibregl-compact-show');
      log('map', `MapLibre ${maplibregl.getVersion()}, thème ${THEME.name}`, 'ok');
      onZoom();
      onMapReady();
    });
    map.on('error', (e) => log('map', (e && e.error && e.error.message) || 'Erreur carte', 'error'));
    map.on('dragstart', () => {
      if (following) {
        following = false;
        renderHud();
      }
    });
    map.on('zoom', onZoom);
    map.on('click', (e) => {
      if (Date.now() < ignoreMapClickUntil) return;
      if (teleportArmed) return teleportTo(e.lngLat.lat, e.lngLat.lng);
      select({ kind: 'point', lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    // Joueur
    const el = document.createElement('div');
    el.className = 'player';
    el.innerHTML = '<i class="pl-pulse"></i><i class="pl-sweep"></i><i class="pl-ring"></i><i class="pl-core"></i><i class="pl-extra"></i>';
    el.style.zIndex = 6;
    playerMarker = new maplibregl.Marker({ element: el }).setLngLat([position.lon, position.lat]).addTo(map);

    // Lieux
    pois.forEach((p) => {
      const pin = document.createElement('div');
      pin.className = `pin cat-${p.category}`;
      pin.innerHTML = `<div class="pin-halo"></div><div class="pin-body"><div class="pin-shape"></div><div class="pin-face"><span>${GQ.getCategory(p.category).emoji}</span></div></div><div class="pin-label">${esc(p.name)}</div>`;
      pin.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ignoreMapClickUntil = Date.now() + 400;
        haptic();
        if (teleportArmed) teleportTo(p.lat, p.lon);
        else select({ kind: 'poi', id: p.id });
      });
      pinMarkers.set(p.id, new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(map));
    });

    const ring = document.createElement('div');
    ring.className = 'selection-ring';
    selectionMarker = new maplibregl.Marker({ element: ring });
  }

  function onZoom() {
    const z = map.getZoom();
    const s = z <= 12 ? 0.7 : z <= 16 ? 0.7 + ((z - 12) / 4) * 0.3 : Math.min(1.15, 1 + ((z - 16) / 3) * 0.15);
    const c = map.getContainer();
    c.style.setProperty('--pin-scale', s.toFixed(3));
    c.classList.toggle('show-labels', z >= 15.5);
  }

  function accuracyCircle() {
    const pts = 48;
    const coords = [];
    const r = position.accuracy || 10;
    const dLat = r / 111320;
    const dLon = r / (111320 * Math.cos((position.lat * Math.PI) / 180));
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * 2 * Math.PI;
      coords.push([position.lon + dLon * Math.cos(a), position.lat + dLat * Math.sin(a)]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
  }

  function flyTo(lat, lon, zoom) {
    flying = true;
    map.flyTo({ center: [lon, lat], zoom: zoom == null ? map.getZoom() : zoom, speed: 1.6, essential: true });
    map.once('moveend', () => (flying = false));
  }

  function syncMap() {
    if (!map) return;
    playerMarker.setLngLat([position.lon, position.lat]);
    const src = map.getSource && map.getSource('accuracy');
    if (src) src.setData(accuracyCircle());
    const selId = selection && selection.kind === 'poi' ? selection.id : null;
    pois.forEach((p) => {
      const el = pinMarkers.get(p.id).getElement();
      el.classList.toggle('locked', p.state === 'locked');
      el.classList.toggle('inRange', p.state === 'inRange');
      el.classList.toggle('discovered', p.state === 'discovered');
      el.classList.toggle('selected', p.id === selId);
      el.style.zIndex = p.id === selId ? 5 : p.state === 'inRange' ? 3 : p.state === 'locked' ? 2 : 1;
    });
    if (selection && selection.kind === 'point') selectionMarker.setLngLat([selection.lon, selection.lat]).addTo(map);
    else selectionMarker.remove();
  }

  /* ------------------------------------------------------------------ */
  /* Position                                                            */
  /* ------------------------------------------------------------------ */
  let addressJob = 0;
  function refreshPlayerAddress() {
    const job = ++addressJob;
    reverse(position)
      .then((d) => {
        if (job !== addressJob) return;
        playerAddress = shortAddress(d) || null;
        renderHud();
      })
      .catch(() => {});
  }

  function teleportTo(lat, lon) {
    teleportArmed = false;
    following = true;
    position = { lat, lon, accuracy: 5 };
    log('debug', `Téléporté à ${lat.toFixed(5)}, ${lon.toFixed(5)}`, 'ok');
    const before = new Set(pois.filter((p) => p.state === 'inRange').map((p) => p.id));
    updatePois();
    pois.filter((p) => p.state === 'inRange' && !before.has(p.id)).forEach((p) => log('poi', `À portée : ${p.name}`, 'ok'));
    if (map) map.easeTo({ center: [lon, lat], duration: 600 });
    playerAddress = null;
    refreshPlayerAddress();
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */
  const hud = $('#hud');
  hud.innerHTML = `
    <div class="hud-left">
      <div class="score-card">
        <div class="score" id="score">0</div>
        <div class="score-meta"><div class="meta-strong">points</div><div class="meta" id="score-meta"></div></div>
      </div>
      <div class="address-pill" id="address" hidden><span class="you-dot"></span><span class="address-text"></span></div>
      <div class="status" id="status" hidden></div>
    </div>
    <div class="hud-right">
      <div class="steps-card">
        <div class="steps-value"><span class="steps-icon">👣</span><span id="steps-today">0</span></div>
        <div class="steps-label">pas aujourd’hui</div>
        <div class="wallet-row"><b id="wallet">0</b><span> à dépenser</span></div>
      </div>
      <button class="round" id="btn-recenter" aria-label="Recentrer sur moi"><span>${G.recenter}</span></button>
      <button class="round" id="btn-refresh" aria-label="Recharger les lieux"><span>${G.refresh}</span></button>
      <button class="round small" id="btn-debug" aria-label="Ouvrir le debug"><span>${G.debug}</span></button>
    </div>`;

  let shownScore = 0;
  let scoreAnim = 0;
  function animateScore(to) {
    cancelAnimationFrame(scoreAnim);
    const from = shownScore;
    if (from === to) return ($('#score').textContent = nf(to));
    const t0 = performance.now();
    const el = $('#score');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      shownScore = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
      el.textContent = nf(shownScore);
      if (k < 1) scoreAnim = requestAnimationFrame(step);
    };
    scoreAnim = requestAnimationFrame(step);
  }

  function statusMessage() {
    const nearest = nearestInRange();
    return (
      mapError ||
      (nearest && !selection && `${nearest.name} est à portée : touche son pin pour tirer une carte !`) ||
      (loadingPois && 'Recherche des lieux autour de toi…') ||
      null
    );
  }

  function renderHud() {
    animateScore(S.score);
    const disc = pois.filter((p) => p.state === 'discovered').length;
    $('#score-meta').textContent = `${disc} découvert${disc > 1 ? 's' : ''} sur ${pois.length} autour`;
    const addr = $('#address');
    addr.hidden = !playerAddress;
    addr.classList.add('mock');
    $('.address-text', addr).textContent = `Simulé : ${playerAddress || ''}`;
    const st = $('#status');
    const msg = teleportArmed ? 'Touche la carte pour t’y téléporter' : statusMessage();
    st.hidden = !msg;
    st.classList.toggle('teleport', teleportArmed);
    st.textContent = msg || '';
    $('#steps-today').textContent = nf(S.days[today()] || 0);
    $('#wallet').textContent = nf(balance());
    $('#btn-recenter').classList.toggle('active', following);
    $('#btn-refresh').classList.toggle('busy', loadingPois);
  }

  $('#btn-recenter').onclick = () => {
    haptic();
    following = true;
    flyTo(position.lat, position.lon, Math.max(map.getZoom(), 16.5));
    renderHud();
  };
  $('#btn-refresh').onclick = async () => {
    if (loadingPois) return;
    loadingPois = true;
    renderHud();
    log('poi', `Rechargement des lieux (${pois.length} lieux de démo)`, 'info');
    await sleep(900);
    loadingPois = false;
    updatePois();
    renderAll();
  };
  $('#btn-debug').onclick = () => openDebug();

  /* ------------------------------------------------------------------ */
  /* Toast de récompense                                                 */
  /* ------------------------------------------------------------------ */
  const toastQueue = [];
  let toastBusy = false;
  function toast(title, subtitle) {
    toastQueue.push({ title, subtitle });
    if (!toastBusy) nextToast();
  }
  async function nextToast() {
    const t = toastQueue.shift();
    if (!t) return (toastBusy = false);
    toastBusy = true;
    const el = $('#toast');
    el.innerHTML = `<div class="toast-title">${esc(t.title)}</div><div class="toast-sub">${esc(t.subtitle)}</div>`;
    el.classList.remove('out');
    el.classList.add('in');
    haptic();
    await sleep(2500);
    el.classList.remove('in');
    el.classList.add('out');
    await sleep(320);
    nextToast();
  }

  /* ------------------------------------------------------------------ */
  /* Menu principal                                                      */
  /* ------------------------------------------------------------------ */
  const MENU_ITEMS = [
    { id: 'profile', label: 'Profil', emoji: '🧭' },
    { id: 'catalog', label: 'Catalogue', emoji: '📚' },
  ];
  $('#menu-btn').innerHTML = `<span class="mb-half"></span><span class="mb-band"></span><span class="mb-hub"><i>${G.menu}</i></span>`;
  const menu = $('#menu');
  menu.innerHTML = `
    <div class="menu-items">${MENU_ITEMS.map(
      (it, i) => `<button class="menu-item" data-id="${it.id}" style="--i:${i}"><span class="menu-circle">${it.emoji}</span><span class="menu-label">${it.label}</span></button>`,
    ).join('')}</div>
    <button class="menu-btn menu-close" aria-label="Fermer le menu"><span>✕</span></button>`;
  $('#menu-btn').onclick = () => {
    haptic();
    menu.classList.add('open');
  };
  menu.onclick = (e) => {
    const item = e.target.closest('.menu-item');
    menu.classList.remove('open');
    if (item) {
      haptic();
      if (item.dataset.id === 'profile') openProfile();
      if (item.dataset.id === 'catalog') openCatalog();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Fiche du lieu                                                       */
  /* ------------------------------------------------------------------ */
  const sheet = $('#sheet');
  let sheetInfo = { loading: false, data: null, error: null };
  let sheetJob = 0;

  function select(sel) {
    selection = sel;
    sheetInfo = { loading: true, data: null, error: null };
    const job = ++sheetJob;
    const pt = selectedPoint();
    if (sel.kind === 'poi') log('poi', `Sélection : ${selectedPoi().name}`);
    reverse(pt)
      .then((d) => job === sheetJob && (sheetInfo = { loading: false, data: d, error: null }))
      .catch((e) => job === sheetJob && (sheetInfo = { loading: false, data: null, error: e.message }))
      .finally(() => job === sheetJob && selection && renderSheet());
    renderAll();
  }
  function closeSheet() {
    selection = null;
    sheetJob++;
    renderAll();
  }
  const selectedPoi = () => (selection && selection.kind === 'poi' ? pois.find((p) => p.id === selection.id) : null);
  const selectedPoint = () => {
    const p = selectedPoi();
    return p ? { lat: p.lat, lon: p.lon } : selection ? { lat: selection.lat, lon: selection.lon } : null;
  };

  const row = (label, value) =>
    value ? `<div class="row"><span class="row-label">${esc(label)}</span><span class="row-value">${esc(value)}</span></div>` : '';

  function renderSheet() {
    if (!selection) {
      sheet.classList.remove('open');
      return;
    }
    const poi = selectedPoi();
    const point = selectedPoint();
    const cat = poi ? GQ.getCategory(poi.category) : null;
    const data = sheetInfo.data;
    const d = (poi && poi.details) || {};
    const distance = poi ? poi.distance : GQ.distanceMeters(position, point);
    const title = (poi && poi.name) || (data && data.name) || (sheetInfo.loading ? 'Recherche…' : 'Lieu sans nom');
    const street = (poi && poi.address && poi.address.street) || (data && data.street);
    const city = [(poi && poi.address && poi.address.postcode) || (data && data.postcode), (poi && poi.address && poi.address.city) || (data && data.city)]
      .filter(Boolean)
      .join(' ');
    const region = data ? [data.state, data.country].filter(Boolean).join(', ') : null;
    const wk = d.wikipedia || (data && data.extra && data.extra.wikipedia);
    const kicker = [cat ? `${cat.emoji}  ${cat.label}` : 'Point de la carte', GQ.formatDistance(distance), cat ? `${cat.points} pts` : null]
      .filter(Boolean)
      .join('  •  ');

    sheet.innerHTML = `
      <div class="sheet-grip"></div>
      <div class="sheet-header">
        <div class="sheet-titles">
          <div class="kicker">${esc(kicker)}</div>
          <div class="sheet-title">${esc(title)}</div>
          ${poi && poi.localName ? `<div class="sheet-subtitle">${esc(poi.localName)}</div>` : ''}
        </div>
        <button class="close-btn" data-act="close" aria-label="Fermer la fiche">✕</button>
      </div>
      <div class="sheet-body">
        ${row('Adresse', street)}${row('Ville', city)}${row('Région', region)}${row('Date', d.startDate)}${row('Artiste', d.artist)}
        ${row('Religion', d.religion)}${row('Patrimoine', d.heritage ? 'Site protégé' : null)}
        ${row('Horaires', d.openingHours || (data && data.extra && data.extra.openingHours))}${row('Description', d.description)}
        ${!poi && data ? row('Lieu', data.displayName) + row('Type OSM', data.category ? `${data.category} / ${data.type}` : null) : ''}
        ${sheetInfo.loading ? '<div class="inline"><span class="spinner"></span><span class="muted">Recherche de l’adresse…</span></div>' : ''}
        ${sheetInfo.error && !poi ? `<div class="error">Adresse indisponible : ${esc(sheetInfo.error)}</div>` : ''}
        <div class="coords">${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}${data && data.provider ? `  •  via ${data.provider}` : ''}</div>
      </div>
      ${poi ? drawSection(poi, distance) : ''}
      <div class="links">
        ${wk ? `<a class="link-btn" href="${wikipediaUrl(wk)}" target="_blank" rel="noopener">Wikipédia ↗</a>` : ''}
        ${poi ? `<a class="link-btn" href="${osmUrl(poi)}" target="_blank" rel="noopener">OpenStreetMap ↗</a>` : ''}
      </div>`;
    sheet.classList.add('open');
  }

  function drawSection(poi, distance) {
    const R = GQ.GAME_RULES.discoverRadiusMeters;
    const inRange = distance <= R;
    const q = quote(poi.id);
    const card = S.cards[poi.id];
    let label;
    let disabled = false;
    let hint = null;
    let kind = q.kind;
    if (!inRange) {
      label = `Approche-toi encore de ${GQ.formatDistance(distance - R)}`;
      disabled = true;
      kind = 'far';
    } else if (q.kind === 'free') {
      label = 'Tirer une carte · gratuit ✦';
      hint = UNLIMITED_DRAWS ? 'Version de test : tirages gratuits et illimités' : 'Ton tirage gratuit du jour pour ce lieu';
    } else if (q.kind === 'paid') {
      const missing = q.price - balance();
      label = `Retirer · ${nf(q.price)} 👣`;
      disabled = missing > 0;
      hint = disabled
        ? `Il te manque ${nf(missing)} pas : marche encore un peu !`
        : `Solde ${nf(balance())} pas · ${q.paidLeft} retirage${q.paidLeft > 1 ? 's' : ''} possible${q.paidLeft > 1 ? 's' : ''} ici aujourd’hui`;
    } else {
      label = 'Plus de tirage ici aujourd’hui';
      disabled = true;
      hint = 'Reviens demain : ton tirage gratuit sera de nouveau disponible';
    }
    return `
      <div class="draw-section">
        <div class="draw-actions">
          <button class="primary draw-btn kind-${kind}" data-act="draw" ${disabled ? 'disabled' : ''}><span>${esc(label)}</span></button>
          ${card ? '<button class="secondary" data-act="view">Ma carte</button>' : ''}
        </div>
        ${inRange ? `<div class="draw-hint">${esc(hint)}</div>` : ''}
      </div>`;
  }

  sheet.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const poi = selectedPoi();
    if (b.dataset.act === 'close') closeSheet();
    if (b.dataset.act === 'draw' && poi) startDraw(poi);
    if (b.dataset.act === 'view' && poi) showCard(S.cards[poi.id]);
  };

  /* ------------------------------------------------------------------ */
  /* Cartes                                                              */
  /* ------------------------------------------------------------------ */
  function stars(n, color) {
    return `<span class="stars" style="color:${color}">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(5 - n)}</span></span>`;
  }
  function cardArt(card, cls = '') {
    const r = rarityOf(card.rarity);
    const emoji = GQ.getCategory(card.category).emoji;
    return `<div class="card-art ${cls}" style="background:${r.tint}"><span class="card-emoji">${emoji}</span>${
      card.imageUrl ? `<img src="${esc(card.imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ''
    }</div>`;
  }
  function countryName(code) {
    const c = GQ_COUNTRIES.find((x) => x[0] === code);
    return c ? c[1] : code;
  }
  function cardView(card) {
    const r = rarityOf(card.rarity);
    const cat = GQ.getCategory(card.category);
    const where = [card.cityName, card.countryCode ? `${GQ.flagOf(card.countryCode)} ${countryName(card.countryCode)}` : null].filter(Boolean).join(', ');
    const fact = (l, v) => (v ? `<div class="fact"><span>${esc(l)}</span><b>${esc(v)}</b></div>` : '');
    return `
      <div class="gq-card rarity-${r.id}" style="--r:${r.color};--rt:${r.tint}">
        <div class="gq-card-inner">
          <div class="gq-card-header">
            <div><div class="gq-rarity">${r.label}</div>${stars(r.stars, r.color)}</div>
            <div class="gq-points"><b>${card.points} pts</b>${card.copies > 1 ? `<span class="copies">×${card.copies}</span>` : ''}</div>
          </div>
          ${cardArt(card)}
          <div class="gq-card-body">
            <div class="gq-name">${esc(card.name)}</div>
            ${card.localName ? `<div class="gq-local">${esc(card.localName)}</div>` : ''}
            <div class="gq-meta">${cat.emoji} ${esc(cat.label)}${where ? `  ·  ${esc(where)}` : ''}</div>
            <div class="facts">${fact('Création', card.date)}${fact('Artiste', card.artist)}${fact('Patrimoine', card.heritage ? 'Site protégé' : null)}</div>
            <div class="gq-bio">${card.description ? `<b>${esc(capitalize(card.description))}</b>` : ''}${esc(card.bio)}</div>
            <div class="gq-footer">
              ${card.wikiUrl ? `<a href="${esc(card.wikiUrl)}" target="_blank" rel="noopener">Source : Wikipédia</a>` : '<span>Source : OpenStreetMap</span>'}
              <span>${new Date(card.drawnAt).toLocaleDateString('fr-FR')}</span>
            </div>
          </div>
        </div>
        <div class="gq-card-shine"></div>
      </div>`;
  }
  function cardMini(card) {
    const r = rarityOf(card.rarity);
    return `
      <button class="gq-mini rarity-${r.id}" data-card="${esc(card.poiId)}" style="--r:${r.color};--rt:${r.tint}">
        <div class="gq-mini-inner">
          ${cardArt(card, 'mini')}
          <div class="gq-mini-body">
            <div class="gq-mini-name">${esc(card.name)}</div>
            <div class="gq-mini-row">${stars(r.stars, r.color)}${card.copies > 1 ? `<span class="copies">×${card.copies}</span>` : ''}</div>
          </div>
        </div>
      </button>`;
  }
  const cardBack = () =>
    `<div class="card-back"><div class="cb-inner"><div class="cb-glyph">${G.back}</div><div class="cb-title">GeoQuest</div></div></div>`;

  /** Tirage : image + bio (Wikipédia si accessible, sinon bio rédigée depuis OSM). */
  async function drawCard(poi, existing) {
    const rarity = GQ.rollRarity(poi);
    const d = poi.details || {};
    const w = await wiki(d.wikipedia);
    const cat = GQ.getCategory(poi.category);
    const city = poi.address && poi.address.city;
    const bioFallback =
      `${poi.name} : ${cat.label.toLowerCase()}${city ? ` à ${city}` : ''}` +
      `${d.startDate ? `, daté de ${d.startDate}` : ''}${d.artist ? `, œuvre de ${d.artist}` : ''}.` +
      `${d.heritage ? ' Site protégé au titre du patrimoine.' : ''}`;
    return {
      poiId: poi.id,
      name: poi.name,
      localName: poi.localName || null,
      category: poi.category,
      rarity,
      points: GQ.cardPoints(poi.category, rarity),
      date: d.startDate || null,
      artist: d.artist || null,
      heritage: Boolean(d.heritage),
      description: (w && w.description) || null,
      bio: (w && w.extract) || bioFallback,
      imageUrl: (w && w.image) || (existing && existing.imageUrl) || null,
      wikiUrl: (w && w.url) || null,
      wikiTitle: d.wikipedia || null,
      countryCode: 'FR',
      cityId: GQ.PARIS.id,
      cityName: 'Paris',
      drawnAt: Date.now(),
    };
  }

  function startDraw(poi) {
    const q = quote(poi.id);
    if (q.kind === 'capped') return;
    if (q.kind === 'paid') {
      if (balance() < q.price) return;
      S.spent += q.price;
      S.tx.unshift({ at: Date.now(), label: `Tirage : ${poi.name}`, amount: -q.price });
    }
    const day = (S.draws[today()] = S.draws[today()] || {});
    day[poi.id] = (day[poi.id] || 0) + 1;
    save();
    haptic();
    log('cards', `Tirage ${q.kind === 'free' ? 'gratuit' : `payant (${q.price} pas)`} : ${poi.name}`, 'ok');
    const existing = S.cards[poi.id] || null;
    selection = null;
    renderAll();
    runDraw({ poi, price: q.price, existing });
  }

  function applyDraw(card, request) {
    const res = GQ.resolveDraw(request.existing, card);
    S.cards[card.poiId] = res.kept;
    S.score += res.points;
    let refund = 0;
    if (res.outcome === 'duplicate' && request.price > 0) {
      refund = GQ.duplicateRefund(request.price);
      S.refunded += refund;
      S.tx.unshift({ at: Date.now(), label: `Doublon remboursé : ${card.name}`, amount: refund });
    }
    save();
    return { ...res, refund };
  }

  function bannerFor(card, result) {
    const r = rarityOf(card.rarity);
    if (!result) {
      const copies = card.copies > 1 ? ` · obtenue ${card.copies} fois` : '';
      return { title: r.label, subtitle: `Ta carte${copies}`, color: r.color };
    }
    if (result.outcome === 'upgrade') {
      return { title: 'Amélioration !', subtitle: `${rarityOf(result.previous.rarity).label} → ${r.label}  ·  +${result.points} pts`, color: r.color };
    }
    if (result.outcome === 'duplicate') {
      const kept = rarityOf(result.kept.rarity);
      const refund = result.refund ? `  ·  +${result.refund} pas remboursés` : '';
      return { title: 'Doublon', subtitle: `Tu gardes ta carte ${kept.label.toLowerCase()} (×${result.kept.copies})${refund}`, color: 'var(--dup)' };
    }
    return { title: `${r.label} !`, subtitle: `Nouvelle carte  ·  +${result.points} pts`, color: r.color };
  }

  const drawEl = $('#draw');
  let drawToken = 0;

  async function runDraw(request) {
    const token = ++drawToken;
    drawEl.className = 'overlay draw-overlay open phase-drawing';
    drawEl.innerHTML = `
      <div class="draw-banner"></div>
      <div class="draw-stage"><div class="burst"></div><div class="back-wrap drawing">${cardBack()}</div><div class="face-wrap"></div></div>
      <div class="draw-hint-text">Tirage en cours… recherche des infos du lieu</div>
      <button class="primary continue" hidden>Continuer</button>`;
    const started = Date.now();
    const card = await drawCard(request.poi, request.existing);
    if (token !== drawToken) return;
    const result = applyDraw(card, request);
    const wait = 1800 - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    if (token !== drawToken) return;
    const shown = result.outcome === 'duplicate' ? card : result.kept;
    // Retournement : le dos s'écrase jusqu'à la tranche, puis la face s'ouvre
    drawEl.classList.replace('phase-drawing', 'phase-reveal');
    $('.back-wrap', drawEl).classList.replace('drawing', 'out');
    await sleep(230);
    if (token !== drawToken) return;
    $('.back-wrap', drawEl).remove();
    const face = $('.face-wrap', drawEl);
    face.innerHTML = cardView({ ...shown, copies: result.kept.copies });
    face.classList.add('in');
    $('.draw-hint-text', drawEl).hidden = true;
    revealFx(rarityOf(shown.rarity), result.outcome);
    setBanner(bannerFor(shown, result));
    haptic();
    await sleep(500);
    drawEl.classList.replace('phase-reveal', 'phase-shown');
    $('.continue', drawEl).hidden = false;
    updatePois();
    renderAll();
  }

  function showCard(card) {
    drawToken++;
    drawEl.className = 'overlay draw-overlay open phase-shown viewing';
    drawEl.innerHTML = `
      <div class="draw-banner"></div>
      <div class="draw-stage"><div class="burst"></div><div class="face-wrap in">${cardView(card)}</div></div>
      <button class="primary continue">Fermer</button>`;
    setBanner(bannerFor(card, null));
  }

  function setBanner(b) {
    const el = $('.draw-banner', drawEl);
    el.innerHTML = `<div class="banner-title" style="color:${b.color}">${esc(b.title)}</div>${b.subtitle ? `<div class="banner-sub">${esc(b.subtitle)}</div>` : ''}`;
    el.classList.add('in');
  }

  function revealFx(r, outcome) {
    const burst = $('.burst', drawEl);
    if (!burst) return;
    burst.style.setProperty('--r', r.color);
    burst.className = `burst go rarity-${r.id} outcome-${outcome}`;
    const n = outcome === 'duplicate' ? 6 : [10, 14, 20, 30, 46][r.stars - 1];
    let html = '<i class="ray"></i>';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = 110 + Math.random() * (60 + r.stars * 30);
      html += `<span class="spark" style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--d:${(Math.random() * 0.25).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.9).toFixed(2)}"></span>`;
    }
    burst.innerHTML = html;
    if (r.id === 'legendary' && outcome !== 'duplicate') document.body.classList.add('flash');
    setTimeout(() => document.body.classList.remove('flash'), 900);
  }

  drawEl.onclick = (e) => {
    if (e.target.closest('.continue')) {
      drawToken++;
      drawEl.classList.remove('open');
      setTimeout(() => !drawEl.classList.contains('open') && (drawEl.innerHTML = ''), 300);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Profil                                                              */
  /* ------------------------------------------------------------------ */
  const profile = $('#profile');
  const WEEKDAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

  function openProfile() {
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      week.push({ label: WEEKDAYS[d.getDay()], value: S.days[GQ.dayKey(d)] || 0, today: i === 0 });
    }
    const max = Math.max(1, ...week.map((d) => d.value));
    const real = Object.entries(S.days);
    const best = real.reduce((a, [k, v]) => (v > a.v ? { k, v } : a), { k: null, v: 0 });
    const active = real.filter(([, v]) => v > 0).length;
    const list = Object.values(S.cards);
    const copies = list.reduce((a, c) => a + (c.copies || 1), 0);
    const fmtKey = (k) => k.split('-').reverse().join('/');
    const prow = (l, v) => `<div class="prow"><span>${esc(l)}</span><b>${esc(v)}</b></div>`;
    const prices = Array.from({ length: GQ.DRAW_RULES.maxPaidPerDay }, (_, i) => nf(GQ.paidPrice(i + 1))).join(', ');

    profile.innerHTML = `
      <div class="screen-top"><div class="screen-title">Profil</div><button class="close-btn" data-act="close" aria-label="Fermer le profil">✕</button></div>
      <div class="screen-body">
        <div class="hero">
          <div class="hero-value" data-count="${lifetime()}">0</div>
          <div class="hero-label">pas depuis le début · explorateur depuis le ${new Date(S.installedAt).toLocaleDateString('fr-FR')}</div>
        </div>
        <div class="tiles">
          <div class="tile"><b>${nf(S.days[today()] || 0)}</b><span>aujourd’hui</span></div>
          <div class="tile strong"><b>${nf(balance())}</b><span>à dépenser</span></div>
          <div class="tile"><b>${nf(S.spent)}</b><span>dépensés</span></div>
        </div>
        <section><h3>7 derniers jours</h3>
          <div class="chart">${week
            .map(
              (d, i) => `<div class="bar-col"><span class="bar-value">${d.value >= 1000 ? `${Math.round(d.value / 100) / 10}k` : d.value || ''}</span>
              <div class="bar-track"><div class="bar ${d.today ? 'today' : ''}" style="--h:${Math.max(2, (d.value / max) * 100)}%;--i:${i}"></div></div>
              <span class="bar-label ${d.today ? 'today' : ''}">${d.label}</span></div>`,
            )
            .join('')}</div>
          ${prow('Meilleur jour', best.k ? `${nf(best.v)} pas (${fmtKey(best.k)})` : '—')}${prow('Jours actifs', String(active))}
        </section>
        <section><h3>Collection</h3>
          <div class="rarities">${GQ.RARITIES.map((x) => {
            const r = rarityOf(x.id);
            return `<div class="rarity-chip" style="--r:${r.color};--rt:${r.tint}"><b>${list.filter((c) => c.rarity === r.id).length}</b><span>${r.label}</span></div>`;
          }).join('')}</div>
          ${prow('Cartes', `${list.length} lieux · ${copies} tirages au total`)}${prow('Score', `${nf(S.score)} points`)}
          ${prow('Pays', `${Object.keys(S.countries).length}/${GQ_COUNTRIES.length}`)}${prow('Villes', String(Object.keys(S.cities).length))}
        </section>
        <section><h3>Tirages</h3>
          <p class="rule">Sur chaque lieu, ton premier tirage du jour est gratuit. Ensuite tu peux retirer en payant avec tes pas : ${prices} pas, puis plus rien jusqu’au lendemain.</p>
          <p class="rule">Tu gardes une seule carte par lieu : une meilleure rareté remplace l’ancienne, sinon c’est un doublon qui te rembourse ${Math.round(GQ.DRAW_RULES.duplicateRefundRate * 100)} % du prix.</p>
        </section>
        <section><h3>Dernières opérations</h3>
          ${
            S.tx.length
              ? S.tx
                  .slice(0, 15)
                  .map((t) => `<div class="tx"><span>${esc(t.label)}</span><b class="${t.amount < 0 ? 'neg' : 'pos'}">${t.amount > 0 ? '+' : '−'}${nf(Math.abs(t.amount))}</b></div>`)
                  .join('')
              : '<p class="muted">Aucune dépense pour l’instant.</p>'
          }
        </section>
      </div>`;
    openScreen(profile);
    countUp($('.hero-value', profile));
  }

  function countUp(el) {
    const to = +el.dataset.count;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 1100);
      el.textContent = nf(to * (1 - (1 - k) ** 4));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function openScreen(el) {
    el.classList.add('open');
    el.scrollTop = 0;
    const body = $('.screen-body', el);
    if (body) body.scrollTop = 0;
  }
  profile.onclick = (e) => e.target.closest('[data-act="close"]') && profile.classList.remove('open');

  /* ------------------------------------------------------------------ */
  /* Catalogue                                                           */
  /* ------------------------------------------------------------------ */
  const catalog = $('#catalog');
  const CONTINENT_ORDER = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'AN'];
  let catStack = [];
  let catQuery = '';
  let catOnlyUnlocked = false;
  let citiesData = null;

  function loadCities() {
    if (!citiesData) citiesData = fetch('data/cities.json').then((r) => r.json());
    return citiesData;
  }
  function openCatalog() {
    catStack = [{ view: 'countries' }];
    catQuery = '';
    renderCatalog();
    openScreen(catalog);
  }
  const catRow = (o) => `
    <button class="crow ${o.locked ? 'locked' : ''}" ${o.attrs || ''}>
      <span class="crow-left">${o.left}</span>
      <span class="crow-main"><span class="crow-title">${esc(o.title)}</span>${o.subtitle ? `<span class="crow-sub">${esc(o.subtitle)}</span>` : ''}</span>
      ${o.badge ? `<span class="badge">${esc(o.badge)}</span>` : ''}
      <span class="chev">${o.locked ? '🔒' : '›'}</span>
    </button>`;

  function renderCatalog() {
    const page = catStack[catStack.length - 1];
    const top = `<div class="screen-top">${
      catStack.length > 1 ? '<button class="nav-btn" data-act="back">‹ Retour</button>' : '<span></span>'
    }<button class="close-btn" data-act="close" aria-label="Fermer le catalogue">✕</button></div>`;
    if (page.view === 'countries') {
      const nCities = Object.keys(S.cities).length;
      const nCards = Object.keys(S.cards).length;
      catalog.innerHTML = `${top}
        <div class="screen-body">
          <div class="cat-hero">
            <div class="screen-title">Catalogue</div>
            <div class="stats">${Object.keys(S.countries).length}/${GQ_COUNTRIES.length} pays · ${plural(nCities, 'ville')} · ${plural(nCards, 'carte')}</div>
            <input class="search" id="cat-search" placeholder="Chercher un pays" autocomplete="off" autocorrect="off" value="${esc(catQuery)}">
            <div class="toggles"><button class="toggle ${!catOnlyUnlocked ? 'active' : ''}" data-act="all">Tous</button><button class="toggle ${catOnlyUnlocked ? 'active' : ''}" data-act="only">Débloqués</button></div>
          </div>
          <div id="cat-list"></div>
        </div>`;
      $('#cat-search').oninput = (e) => {
        catQuery = e.target.value;
        renderCountryList();
      };
      renderCountryList();
    } else if (page.view === 'country') {
      renderCountry(top, page.code);
    } else {
      renderCity(top, page.city);
    }
  }

  function renderCountryList() {
    const q = normalize(catQuery.trim());
    const rows = GQ_COUNTRIES.filter(([code, name]) => (!q || normalize(name).includes(q) || code.toLowerCase() === q) && (!catOnlyUnlocked || S.countries[code]));
    const sections = [];
    const mine = rows.filter(([c]) => S.countries[c]);
    if (mine.length && !catOnlyUnlocked && !q) sections.push(['Mes pays', mine]);
    CONTINENT_ORDER.forEach((c) => {
      const data = rows.filter((r) => r[2] === c);
      if (data.length) sections.push([GQ_CONTINENTS[c], data]);
    });
    const cardsBy = {};
    Object.values(S.cards).forEach((c) => (cardsBy[c.countryCode] = (cardsBy[c.countryCode] || 0) + 1));
    const citiesBy = {};
    Object.values(S.cities).forEach((c) => (citiesBy[c.country] = (citiesBy[c.country] || 0) + 1));
    $('#cat-list').innerHTML = sections.length
      ? sections
          .map(
            ([title, data]) =>
              `<div class="sec-title">${esc(title)}</div>` +
              data
                .map(([code, name]) => {
                  const open = Boolean(S.countries[code]);
                  return catRow({
                    locked: !open,
                    attrs: `data-country="${code}"`,
                    left: `<span class="flag">${GQ.flagOf(code)}</span>`,
                    title: name,
                    subtitle: open ? `${plural(citiesBy[code] || 0, 'ville')} · ${plural(cardsBy[code] || 0, 'carte')}` : null,
                    badge: open && code === 'FR' ? 'Tu es ici' : null,
                  });
                })
                .join(''),
          )
          .join('')
      : `<p class="empty">${catOnlyUnlocked ? 'Aucun pays débloqué : sors explorer, ton pays se débloquera tout seul.' : 'Aucun pays ne correspond.'}</p>`;
  }

  async function renderCountry(top, code) {
    const open = Boolean(S.countries[code]);
    const countryCards = Object.values(S.cards).filter((c) => c.countryCode === code);
    catalog.innerHTML = `${top}
      <div class="screen-body">
        <div class="cat-hero">
          <div class="big-flag ${open ? '' : 'locked'}">${GQ.flagOf(code)}</div>
          <div class="screen-title">${esc(countryName(code))}</div>
          <div class="stats" id="country-stats">${open ? '' : '🔒 Pays verrouillé : il se débloque quand tu t’y trouves'}</div>
        </div>
        <div id="cat-list"><div class="inline center"><span class="spinner"></span><span class="muted">Chargement des villes…</span></div></div>
      </div>`;
    const all = await loadCities();
    if (catStack[catStack.length - 1].code !== code) return;
    const list = (all[code] || []).map(([id, name, lat, lon, pop]) => ({ id: `gn/${id}`, name, pop }));
    const openL = list.filter((c) => S.cities[c.id]);
    const closed = list.filter((c) => !S.cities[c.id]);
    if (open) $('#country-stats').textContent = `${openL.length}/${list.length} villes · ${plural(countryCards.length, 'carte')}`;
    const fmtPop = (p) => (p >= 1e6 ? `${(p / 1e6).toFixed(1).replace('.', ',')} M` : `${Math.round(p / 1000)} k`);
    $('#cat-list').innerHTML = [...openL, ...closed]
      .map((c) => {
        const o = Boolean(S.cities[c.id]);
        const n = countryCards.filter((k) => k.cityId === c.id).length;
        return catRow({
          locked: !o,
          attrs: `data-city="${c.id}" data-name="${esc(c.name)}"`,
          left: '<span class="city-icon">🏙️</span>',
          title: c.name,
          subtitle: o ? plural(n, 'carte') : `${fmtPop(c.pop)} hab.`,
          badge: c.id === GQ.PARIS.id && o ? 'Tu es ici' : null,
        });
      })
      .join('') || '<p class="empty">Aucune ville trouvée.</p>';
  }

  function renderCity(top, city) {
    const open = Boolean(S.cities[city.id]);
    const list = Object.values(S.cards).filter((c) => c.cityId === city.id).sort((a, b) => b.drawnAt - a.drawnAt);
    catalog.innerHTML = `${top}
      <div class="screen-body">
        <div class="cat-hero">
          <div class="screen-title">${esc(city.name)}</div>
          <div class="stats">${open ? plural(list.length, 'carte') : '🔒 Ville verrouillée : elle se débloque quand tu t’y trouves'}</div>
        </div>
        ${
          list.length
            ? `<div class="mini-grid">${list.map(cardMini).join('')}</div>`
            : `<p class="empty">${open ? 'Aucune carte tirée ici pour l’instant. Approche-toi d’un lieu pour tirer une carte.' : ''}</p>`
        }
      </div>`;
  }

  catalog.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'close') return catalog.classList.remove('open');
    if (t.dataset.act === 'back') {
      catStack.pop();
      return renderCatalog();
    }
    if (t.dataset.act === 'all' || t.dataset.act === 'only') {
      catOnlyUnlocked = t.dataset.act === 'only';
      return renderCatalog();
    }
    if (t.dataset.country) {
      catStack.push({ view: 'country', code: t.dataset.country });
      return renderCatalog();
    }
    if (t.dataset.city) {
      catStack.push({ view: 'city', city: { id: t.dataset.city, name: t.dataset.name } });
      return renderCatalog();
    }
    if (t.dataset.card) {
      const v = $('#viewer');
      v.innerHTML = `<div class="viewer-card">${cardView(S.cards[t.dataset.card])}</div><div class="viewer-hint">Touche pour fermer</div>`;
      v.classList.add('open');
    }
  };
  $('#viewer').onclick = (e) => {
    if (e.target.closest('a')) return;
    e.currentTarget.classList.remove('open');
  };

  /* ------------------------------------------------------------------ */
  /* Debug                                                               */
  /* ------------------------------------------------------------------ */
  const debug = $('#debug');
  let debugOpen = false;
  function openDebug() {
    debugOpen = true;
    renderDebug();
    debug.classList.add('open');
  }
  function renderDebug() {
    const R = (cls) => ({ ok: 'ok', error: 'err', warn: 'warn' })[cls] || '';
    debug.innerHTML = `
      <div class="sheet-grip"></div>
      <div class="sheet-header"><div class="sheet-titles"><div class="sheet-title">Debug 🐞</div><div class="kicker">UI : ${esc(THEME.name)}</div></div>
        <button class="close-btn" data-act="close">✕</button></div>
      <div class="debug-body">
        <h4>Position</h4>
        <div class="dbg-line">Position simulée : ${position.lat.toFixed(5)}, ${position.lon.toFixed(5)} (±${position.accuracy} m)</div>
        <div class="dbg-grid">${GQ.MOCK_PLACES.map((p, i) => `<button class="dbg-btn" data-mock="${i}">${esc(p.label)}</button>`).join('')}</div>
        <button class="dbg-btn wide" data-act="teleport">Téléporter au toucher</button>
        <h4>Tirages</h4>
        <div class="dbg-grid"><button class="dbg-btn" data-act="steps">+1 000 pas (test)</button><button class="dbg-btn" data-act="resetdraws">Tirages du jour à zéro</button></div>
        <h4>Collection</h4>
        <div class="dbg-grid"><button class="dbg-btn" data-act="resetcol">Réinitialiser la collection</button><button class="dbg-btn" data-act="seed">Partie de démo</button></div>
        <h4>Journal</h4>
        <div class="journal">${journal
          .map((j) => `<div class="jl ${R(j.level)}"><span>${j.at.toLocaleTimeString('fr-FR')}</span> <b>${esc(j.source)}</b> ${esc(j.message)}</div>`)
          .join('')}</div>
        <a class="dbg-btn wide link" href="./">← Choisir une autre UI</a>
      </div>`;
  }
  debug.onclick = (e) => {
    const b = e.target.closest('[data-act],[data-mock]');
    if (!b) return;
    const close = () => {
      debugOpen = false;
      debug.classList.remove('open');
    };
    if (b.dataset.mock) {
      const p = GQ.MOCK_PLACES[+b.dataset.mock];
      close();
      return teleportTo(p.lat, p.lon);
    }
    switch (b.dataset.act) {
      case 'close':
        return close();
      case 'teleport':
        teleportArmed = true;
        close();
        return renderAll();
      case 'steps':
        S.days[today()] = (S.days[today()] || 0) + 1000;
        log('debug', '+1 000 pas (test)', 'ok');
        break;
      case 'resetdraws':
        S.draws = {};
        log('debug', 'Tirages du jour remis à zéro', 'ok');
        break;
      case 'resetcol':
        S.cards = {};
        S.countries = {};
        S.cities = {};
        S.score = 0;
        S.discovered = {};
        log('debug', 'Collection réinitialisée', 'ok');
        break;
      case 'seed':
        S = GQ.seedState();
        log('debug', 'Partie de démo rechargée', 'ok');
        setTimeout(unlockHere, 600);
        break;
    }
    save();
    updatePois();
    renderAll();
    renderDebug();
  };

  /* ------------------------------------------------------------------ */
  /* Boucle                                                              */
  /* ------------------------------------------------------------------ */
  function renderAll() {
    syncMap();
    renderHud();
    renderSheet();
    $('#menu-btn').classList.toggle('hidden', Boolean(selection));
  }

  /** Débloque le pays et la ville où se trouve le joueur (catalog:countryUnlocked / cityUnlocked). */
  function unlockHere() {
    if (!S.countries.FR) {
      S.countries.FR = { at: Date.now() };
      toast(`${GQ.flagOf('FR')} France`, 'Nouveau pays débloqué dans le catalogue');
    }
    if (!S.cities[GQ.PARIS.id]) {
      S.cities[GQ.PARIS.id] = { name: 'Paris', country: 'FR', at: Date.now() };
      toast('🏙️ Paris', 'Nouvelle ville débloquée dans le catalogue');
    }
    save();
  }

  function onMapReady() {
    updatePois();
    renderAll();
    refreshPlayerAddress();
    setTimeout(unlockHere, 1200);
    // Images Wikipédia des cartes déjà possédées
    Object.values(S.cards).forEach((c) => {
      if (c.imageUrl || !c.wikiTitle) return;
      wiki(c.wikiTitle).then((w) => {
        if (w && S.cards[c.poiId]) {
          S.cards[c.poiId].imageUrl = w.image;
          S.cards[c.poiId].wikiUrl = w.url;
          save();
        }
      });
    });
    // Podomètre simulé : quelques pas de temps en temps
    setInterval(() => {
      if (document.hidden) return;
      S.days[today()] = (S.days[today()] || 0) + Math.floor(Math.random() * 5);
      save();
      $('#steps-today').textContent = nf(S.days[today()]);
      $('#wallet').textContent = nf(balance());
    }, 4000);
  }

  /* ------------------------------------------------------------------ */
  /* Écran de permission                                                 */
  /* ------------------------------------------------------------------ */
  const perm = $('#permission');
  perm.innerHTML = `
    <div class="perm-art"><div class="perm-dot"></div></div>
    <div class="perm-title">GeoQuest</div>
    <div class="perm-body">Accepte la localisation pour apparaître sur la carte et partir à la chasse aux monuments autour de toi.</div>
    <button class="primary perm-btn">Autoriser la localisation</button>
    <div class="perm-note">Démo de l’UI « ${esc(THEME.name)} » · position simulée sur l’île de la Cité, Paris</div>
    <a class="perm-link" href="./">‹ Changer d’UI</a>`;
  $('.perm-btn', perm).onclick = () => {
    haptic();
    perm.classList.add('leaving');
    setTimeout(() => perm.remove(), 650);
    initMap();
  };

  $("#theme-chip").innerHTML = `<a href="./" aria-label="Changer d’UI (${esc(THEME.name)})">‹ UIs</a>`;
})();
