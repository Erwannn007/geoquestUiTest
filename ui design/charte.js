/**
 * Charte graphique d'une UI : charte.html?theme=<id>
 * Structure : en-tête, 01 Emblème, 02 Couleurs, 03 Typographie, 04 Interface, 05 Mouvement.
 * Les composants de la partie Interface reprennent le balisage de js/game.js.
 */
(function () {
  'use strict';
  const id = new URLSearchParams(location.search).get('theme');
  const T = GQ_THEMES.find((t) => t.id === id) || GQ_THEMES[0];
  const C = GQ_CHARTS[T.id];
  const num = GQ_THEMES.indexOf(T) + 1;
  const root = document.documentElement;
  root.dataset.theme = T.id;
  document.title = `${T.name} · Charte graphique GeoQuest`;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${T.fonts}&display=swap`;
  document.head.appendChild(l);

  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const inkOn = (bg) => (contrast(bg, C.ink) >= contrast(bg, '#FFFFFF') ? C.ink : '#FFFFFF');
  const accentText = contrast(C.accent, C.page) >= 3 ? C.accent : C.band;

  const vars = {
    '--ch-page': C.page, '--ch-ink': C.ink, '--ch-soft': C.soft, '--ch-band': C.band, '--ch-band-ink': C.bandInk,
    '--ch-band-soft': C.bandSoft, '--ch-alt': C.alt, '--ch-accent-text': accentText,
    '--ch-map': T.map.bg, '--ch-map-ink': inkOn(T.map.bg), '--ch-water': T.map.water, '--ch-road': T.map.road, '--ch-park': T.map.park,
  };
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const G = T.glyphs;
  const rarity = (rid) => {
    const r = GQ.RARITIES.find((x) => x.id === rid);
    const o = T.rarity && T.rarity[rid];
    return o ? { ...r, color: o[0], tint: o[1] } : r;
  };

  /* ---------- composants du jeu ---------- */
  const menuBtn = () =>
    `<button class="menu-btn" aria-hidden="true"><span class="mb-half"></span><span class="mb-band"></span><span class="mb-hub"><i>${G.menu}</i></span></button>`;
  const pin = (cat, state, extra = '') =>
    `<div class="pin ${state} cat-${cat}" ${extra}><div class="pin-halo"></div><div class="pin-body"><div class="pin-shape"></div><div class="pin-face"><span>${GQ.getCategory(cat).emoji}</span></div></div></div>`;
  const player = (style) =>
    `<div class="player" style="${style}"><i class="pl-pulse"></i><i class="pl-sweep"></i><i class="pl-ring"></i><i class="pl-core"></i><i class="pl-extra"></i></div>`;
  const stars = (n, color) => `<span class="stars" style="color:${color}">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(5 - n)}</span></span>`;

  const card = {
    name: 'Sainte-Chapelle', category: 'religious', rarity: 'epic', points: GQ.cardPoints('religious', 'epic'), copies: 1,
    date: '1248', heritage: true, imageUrl: null, drawnAt: Date.now(),
    bio: 'Chapelle palatine bâtie sur l’île de la Cité à la demande de Saint Louis pour abriter les reliques de la Passion, consacrée en 1248. Ses verrières du XIIIe siècle couvrent plus de 600 m².',
  };
  const cardView = (c) => {
    const r = rarity(c.rarity);
    const cat = GQ.getCategory(c.category);
    return `
      <div class="gq-card rarity-${r.id}" style="--r:${r.color};--rt:${r.tint}">
        <div class="gq-card-inner">
          <div class="gq-card-header"><div><div class="gq-rarity">${r.label}</div>${stars(r.stars, r.color)}</div><div class="gq-points"><b>${c.points} pts</b></div></div>
          <div class="card-art" style="background:${r.tint}"><span class="card-emoji">${cat.emoji}</span><img id="card-img" alt="" hidden></div>
          <div class="gq-card-body">
            <div class="gq-name">${esc(c.name)}</div>
            <div class="gq-meta">${cat.emoji} ${cat.label}  ·  Paris, ${GQ.flagOf('FR')} France</div>
            <div class="facts"><div class="fact"><span>Création</span><b>${c.date}</b></div><div class="fact"><span>Patrimoine</span><b>Site protégé</b></div></div>
            <div class="gq-bio">${esc(c.bio)}</div>
            <div class="gq-footer"><span>Source : Wikipédia</span><span>${new Date(c.drawnAt).toLocaleDateString('fr-FR')}</span></div>
          </div>
        </div>
        <div class="gq-card-shine"></div>
      </div>`;
  };
  const cardBack = () => `<div class="card-back"><div class="cb-inner"><div class="cb-glyph">${G.back}</div><div class="cb-title">GeoQuest</div></div></div>`;

  /* ---------- sections ---------- */
  const variants = [
    ['statue', 'locked', 'Statue'], ['monument', 'locked', 'Monument'], ['religious', 'locked', 'Lieu de culte'],
    ['historic', 'locked', 'Site historique'], ['museum', 'locked', 'Musée'], ['viewpoint', 'inRange', 'À portée'], ['artwork', 'discovered', 'Découvert'],
  ];

  const head = `
    <div class="ch-band ch-head">
      <div>
        <div class="ch-kicker">Charte graphique · GeoQuest · UI ${num} / ${GQ_THEMES.length}</div>
        <div class="ch-h1">${esc(T.name)}</div>
        <p class="ch-sub">${esc(C.tagline)}</p>
      </div>
      <div class="ch-head-tile"><div style="transform:scale(1.5)">${menuBtn()}</div></div>
    </div>`;

  const emblem = `
    <div class="ch-wrap">
      <div class="ch-kicker">01 — Emblème</div>
      <div class="ch-h2">${esc(C.emblem.title)}</div>
      <div class="ch-row">
        <div class="ch-emblem"><div class="ch-scale">${menuBtn()}</div></div>
        <div>
          <div class="ch-h3">Règles d’usage</div>
          <p class="ch-p">${esc(C.emblem.text)}</p>
          <p class="ch-p"><b>Rôle :</b> c’est le bouton menu, en bas au centre de l’écran. Il ouvre Profil et Catalogue.</p>
          <p class="ch-p"><b>Taille :</b> 68 à 72 px dans le jeu, jamais sous 44 px (zone tactile minimale).</p>
          <p class="ch-p"><b>Zone de protection :</b> 18 px au-dessus de la zone sûre de l’écran, rien d’autre à moins de 16 px. Il disparaît quand une fiche de lieu est ouverte.</p>
        </div>
      </div>
      <div class="ch-h3" style="margin-top:40px">Variantes des lieux sur la carte</div>
      <div class="ch-variants" style="margin-top:0">${variants
        .map(([cat, st, label]) => `<div class="ch-var"><div class="ch-pin">${pin(cat, st)}</div><span>${label}</span></div>`)
        .join('')}</div>
    </div>`;

  const total = C.split.reduce((a, s) => a + s[1], 0);
  const colors = `
    <div class="ch-alt"><div class="ch-wrap">
      <div class="ch-kicker">02 — Couleurs</div>
      <div class="ch-h2">${esc(C.colorsTitle)}</div>
      <div class="ch-swatches">${C.palette
        .map(([n, hex, role]) => `<div class="ch-sw" style="background:${hex};color:${inkOn(hex)}"><b>${esc(n)}</b><code>${hex}</code><small>${esc(role)}</small></div>`)
        .join('')}</div>
      <div class="ch-cols">
        <div><div class="ch-h3">Couleurs de jeu</div>
          <div class="ch-chips">${C.game.map(([n, hex]) => `<div class="ch-chip" style="background:${hex};color:${inkOn(hex)}">${esc(n)}<code>${hex}</code></div>`).join('')}</div>
        </div>
        <div><div class="ch-h3">Répartition</div>
          <div class="ch-split">${C.split.map(([hex, p]) => `<i style="flex:${p / total};background:${hex}"></i>`).join('')}</div>
          <p class="ch-p" style="font-size:13px">${esc(C.splitText)}</p>
        </div>
      </div>
      <div class="ch-h3" style="margin-top:34px;margin-bottom:0">Raretés des cartes</div>
      <div class="ch-rar" style="margin-top:14px">${GQ.RARITIES.map((x) => {
        const r = rarity(x.id);
        return `<div style="--r:${r.color};--rt:${r.tint}"><b>${r.label}</b>${stars(r.stars, r.color)}<small>${r.color} · points ×${r.multiplier}</small></div>`;
      }).join('')}</div>
    </div></div>`;

  const dispName = C.display[0];
  const bodyName = C.body[0];
  const typo = `
    <div class="ch-wrap">
      <div class="ch-kicker">03 — Typographie</div>
      <div class="ch-h2">${esc(C.typoTitle)}</div>
      <div class="ch-typo">
        <div><div class="ch-big d">Aa</div><div class="ch-h3">${esc(dispName)}</div><p class="ch-p">${esc(C.display[1])}</p></div>
        <div><div class="ch-big b">Aa</div><div class="ch-h3">${esc(bodyName)}</div><p class="ch-p">${esc(C.body[1])}</p></div>
        <div>
          <div class="ch-scale-item"><div class="ch-kicker">Score · ${esc(dispName)} 34</div><div style="font-family:var(--font-display);font-weight:var(--weight-display);font-size:34px;line-height:1.1">340 points</div></div>
          <div class="ch-scale-item"><div class="ch-kicker">Titre · ${esc(dispName)} 22</div><div style="font-family:var(--font-display);font-weight:var(--weight-display);font-size:22px;line-height:1.2">Cathédrale Notre-Dame de Paris</div></div>
          <div class="ch-scale-item"><div class="ch-kicker">Bouton · ${esc(dispName)} 16</div><div style="font-family:var(--font-display);font-weight:800;font-size:16px">Tirer une carte · gratuit ✦</div></div>
          <div class="ch-scale-item"><div class="ch-kicker">Texte · ${esc(bodyName)} 14</div><div style="font-size:14px;line-height:1.45">Ton tirage gratuit du jour pour ce lieu</div></div>
          <div class="ch-scale-item"><div class="ch-kicker">Légende · ${esc(bodyName)} 12</div><div style="font-size:12px">Il te manque 320 pas : marche encore un peu !</div></div>
        </div>
      </div>
    </div>`;

  const light = lum(C.band) > 0.35;
  const ui = `
    <div class="ch-band ${light ? 'ch-light' : ''}"><div class="ch-wrap">
      <div class="ch-kicker">04 — Interface</div>
      <div class="ch-h2">Les écrans, pièce par pièce</div>
      <div class="ch-ui">
        <div class="ch-panel" style="background:${T.map.bg}">
          <div class="ch-kicker" style="color:${inkOn(T.map.bg)};opacity:.7">HUD</div>
          <div class="ch-hud">
            <div class="score-card"><div class="score">340</div><div class="score-meta"><div class="meta-strong">points</div><div class="meta">3 découverts sur 15 autour</div></div></div>
            <div class="steps-card"><div class="steps-value"><span class="steps-icon">👣</span>4 380</div><div class="steps-label">pas aujourd’hui</div><div class="wallet-row"><b>2 430</b><span> à dépenser</span></div></div>
          </div>
          <div class="ch-rounds">
            <button class="round active"><span>${G.recenter}</span></button><button class="round"><span>${G.refresh}</span></button><button class="round small"><span>${G.debug}</span></button>
            <div class="address-pill mock" style="animation:none"><span class="you-dot"></span><span class="address-text">Parvis Notre-Dame, Paris</span></div>
          </div>
          <div class="status" style="margin-top:12px;animation:none;display:inline-block">Point zéro des routes de France est à portée : touche son pin pour tirer une carte !</div>
        </div>

        <div class="ch-panel">
          <div class="ch-kicker">Joueur et lieux</div>
          <div class="ch-map"><i class="park"></i><i class="water"></i><i class="road" style="left:0;right:0;top:92px;height:8px"></i><i class="road" style="top:0;bottom:0;left:120px;width:7px"></i>
            ${player('left:150px;top:112px')}
            ${pin('monument', 'inRange', 'style="left:180px;top:50px"')}
            ${pin('statue', 'locked', 'style="left:40px;top:28px"')}
            ${pin('museum', 'discovered', 'style="left:300px;top:110px"')}
            ${pin('historic', 'locked selected', 'style="left:60px;top:130px"')}
          </div>
          <p class="ch-p" style="font-size:12px;margin-top:10px;color:inherit;opacity:.8">À découvrir · à portée (halo, moins de ${GQ.GAME_RULES.discoverRadiusMeters} m) · découvert · sélectionné (×1,3)</p>
        </div>

        <div class="ch-panel">
          <div class="ch-kicker">Fiche du lieu · boutons de tirage</div>
          <div class="ch-sheet">
            <div class="kicker">🏛️  Monument  •  19 m  •  50 pts</div>
            <div class="sheet-title">Point zéro des routes de France</div>
            <div class="draw-actions"><button class="primary draw-btn kind-free">Tirer une carte · gratuit ✦</button></div>
            <div class="draw-actions"><button class="primary draw-btn kind-paid">Retirer · 1 000 👣</button><button class="secondary">Ma carte</button></div>
            <div class="draw-actions"><button class="primary" disabled>Approche-toi encore de 25 m</button></div>
            <div class="links"><span class="link-btn">Wikipédia ↗</span><span class="link-btn">OpenStreetMap ↗</span></div>
          </div>
        </div>

        <div class="ch-panel">
          <div class="ch-kicker">Menu · notification</div>
          <div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">
            ${menuBtn()}
            <div class="menu-item" style="opacity:1;transform:none"><span class="menu-circle">🧭</span><span class="menu-label" style="${light ? '' : ''}">Profil</span></div>
            <div class="menu-item" style="opacity:1;transform:none"><span class="menu-circle">📚</span><span class="menu-label">Catalogue</span></div>
          </div>
          <div style="margin-top:22px"><div class="toast"><div class="toast-title">${GQ.flagOf('FR')} France</div><div class="toast-sub">Nouveau pays débloqué dans le catalogue</div></div></div>
        </div>
      </div>

      <div class="ch-panel" style="margin-top:26px">
        <div class="ch-kicker">Cartes à collectionner · face et dos</div>
        <div class="ch-cards">${cardView(card)}<div>${cardBack()}<p class="ch-p" style="margin-top:16px;max-width:260px;color:inherit">Le cadre prend la couleur de la rareté, l’en-tête sa teinte. Les cartes Épique et Légendaire ont un reflet qui passe en boucle.</p></div></div>
      </div>
    </div></div>`;

  const layout = C.layout
    ? `<div class="ch-alt"><div class="ch-wrap">
      <div class="ch-kicker">05 — Disposition</div>
      <div class="ch-h2">Les boutons changent de place</div>
      <p class="ch-p" style="font-size:17px;max-width:820px">${esc(C.layout)}</p>
    </div></div>`
    : '';

  const motion = `
    <div class="ch-wrap">
      <div class="ch-kicker">${C.layout ? '06' : '05'} — Mouvement</div>
      <div class="ch-h2">Ce qui bouge, et comment</div>
      <div class="ch-motion">${C.motion.map((m, i) => `<div><b>0${i + 1}</b>${esc(m)}</div>`).join('')}</div>
    </div>
    <div class="ch-band ch-foot"><span>GeoQuest · ${esc(T.name)} · charte v1.0</span><span>Données © OpenStreetMap · GeoNames · OpenFreeMap</span></div>`;

  document.getElementById('chart').innerHTML = head + emblem + colors + typo + ui + layout + motion;

  // Image de la carte (Wikipédia), puis signal « prêt » pour l'export PDF
  const done = () => (window.__chartReady = true);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 5000);
  fetch('https://fr.wikipedia.org/api/rest_v1/page/summary/Sainte-Chapelle', { signal: ctrl.signal })
    .then((r) => r.json())
    .then((j) => {
      const img = document.getElementById('card-img');
      if (!j.thumbnail) return done();
      img.onload = () => {
        img.hidden = false;
        done();
      };
      img.onerror = done;
      img.src = j.thumbnail.source;
    })
    .catch(done);
  setTimeout(done, 6000);
})();
