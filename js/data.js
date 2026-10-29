/**
 * Règles et constantes reprises telles quelles de packages/shared (GeoQuest monorepo),
 * plus un jeu de lieux de démonstration (OSM, île de la Cité à Paris) pour faire
 * tourner l'UI sans GPS ni Overpass.
 */
window.GQ = window.GQ || {};

GQ.CATEGORIES = {
  statue: { label: 'Statue', emoji: '🗿', points: 40 },
  monument: { label: 'Monument', emoji: '🏛️', points: 50 },
  memorial: { label: 'Mémorial', emoji: '🕯️', points: 25 },
  religious: { label: 'Lieu de culte', emoji: '⛩️', points: 35 },
  historic: { label: 'Site historique', emoji: '🏯', points: 60 },
  museum: { label: 'Musée', emoji: '🖼️', points: 35 },
  artwork: { label: 'Œuvre d’art', emoji: '🎨', points: 20 },
  viewpoint: { label: 'Point de vue', emoji: '🔭', points: 30 },
  attraction: { label: 'Attraction', emoji: '⭐', points: 30 },
  other: { label: 'Lieu-dit', emoji: '📍', points: 10 },
};
GQ.getCategory = (id) => GQ.CATEGORIES[id] || GQ.CATEGORIES.other;

GQ.RARITIES = [
  { id: 'common', label: 'Commune', stars: 1, weight: 55, multiplier: 1, color: '#8A94A6', tint: '#EEF1F5' },
  { id: 'uncommon', label: 'Peu commune', stars: 2, weight: 25, multiplier: 1.5, color: '#2E9E5B', tint: '#E3F5EA' },
  { id: 'rare', label: 'Rare', stars: 3, weight: 12, multiplier: 2.5, color: '#2F6FE4', tint: '#E4EDFD' },
  { id: 'epic', label: 'Épique', stars: 4, weight: 6, multiplier: 4, color: '#8E44AD', tint: '#F2E6F8' },
  { id: 'legendary', label: 'Légendaire', stars: 5, weight: 2, multiplier: 8, color: '#E0A100', tint: '#FFF4D1' },
];

GQ.GAME_RULES = { discoverRadiusMeters: 40 };
GQ.DRAW_RULES = { freePerDay: 1, basePrice: 500, priceGrowth: 2, maxPaidPerDay: 3, duplicateRefundRate: 0.25 };

/* ---------- logique (logic/rarity.ts, draws.ts, collection.ts) ---------- */
GQ.rarityRank = (id) => GQ.RARITIES.findIndex((r) => r.id === id);

const IMPORTANT = new Set(['monument', 'historic', 'religious', 'museum']);
GQ.importanceOf = (poi) => {
  const d = poi.details || {};
  let s = 0;
  if (d.wikipedia) s += 1.5;
  if (d.heritage) s += 1.5;
  if (IMPORTANT.has(poi.category)) s += 1;
  const y = parseInt((String(d.startDate || '').match(/\d{3,4}/) || [])[0], 10);
  if (y && y < 1800) s += 1;
  else if (y && y < 1950) s += 0.5;
  return Math.min(5, s);
};
GQ.rollRarity = (poi) => {
  const k = GQ.importanceOf(poi);
  const w = GQ.RARITIES.map((r, i) => r.weight * (1 + 0.25 * k) ** i);
  const total = w.reduce((a, b) => a + b, 0);
  let x = Math.random() * total;
  for (let i = 0; i < w.length; i++) if ((x -= w[i]) <= 0) return GQ.RARITIES[i].id;
  return GQ.RARITIES[GQ.RARITIES.length - 1].id;
};
GQ.cardPoints = (cat, rarity) =>
  Math.round(GQ.getCategory(cat).points * GQ.RARITIES[GQ.rarityRank(rarity)].multiplier);
GQ.paidPrice = (n) => Math.round(GQ.DRAW_RULES.basePrice * GQ.DRAW_RULES.priceGrowth ** (n - 1));
GQ.quoteFor = (drawsToday) => {
  const R = GQ.DRAW_RULES;
  const paidUsed = Math.max(0, drawsToday - R.freePerDay);
  if (drawsToday < R.freePerDay) return { kind: 'free', price: 0, paidLeft: R.maxPaidPerDay };
  if (paidUsed >= R.maxPaidPerDay) return { kind: 'capped', price: 0, paidLeft: 0 };
  return { kind: 'paid', price: GQ.paidPrice(paidUsed + 1), paidLeft: R.maxPaidPerDay - paidUsed };
};
GQ.duplicateRefund = (price) => Math.round(price * GQ.DRAW_RULES.duplicateRefundRate);
GQ.resolveDraw = (previous, drawn) => {
  if (!previous) return { outcome: 'new', points: drawn.points, kept: { ...drawn, copies: 1 } };
  const copies = (previous.copies || 1) + 1;
  if (GQ.rarityRank(drawn.rarity) > GQ.rarityRank(previous.rarity)) {
    return { outcome: 'upgrade', points: Math.max(0, drawn.points - previous.points), previous, kept: { ...drawn, copies } };
  }
  return { outcome: 'duplicate', points: 0, previous, kept: { ...previous, copies } };
};

GQ.distanceMeters = (a, b) => {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
GQ.formatDistance = (m) => (m < 1000 ? `${Math.max(0, Math.round(m))} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`);
GQ.flagOf = (code) => (code ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🏳️');

/* ---------- lieux de démo (données OpenStreetMap) ---------- */
const addr = (street, postcode = '75004') => ({ street, postcode, city: 'Paris' });
GQ.DEMO_POIS = [
  { id: 'node/1', name: 'Point zéro des routes de France', category: 'monument', lat: 48.85342, lon: 2.3488,
    details: { startDate: '1924', wikipedia: 'Point zéro des routes de France', description: 'plaque de bronze sur le parvis' }, address: addr('Parvis Notre-Dame – Place Jean-Paul II') },
  { id: 'node/2', name: 'Charlemagne et ses Leudes', category: 'statue', lat: 48.85357, lon: 2.34795,
    details: { startDate: '1878', artist: 'Charles et Louis Rochet', wikipedia: 'Charlemagne et ses Leudes' }, address: addr('Parvis Notre-Dame – Place Jean-Paul II') },
  { id: 'way/3', name: 'Cathédrale Notre-Dame de Paris', category: 'religious', lat: 48.85296, lon: 2.3499,
    details: { startDate: '1163', religion: 'chrétienne', heritage: true, wikipedia: 'Cathédrale Notre-Dame de Paris' }, address: addr('6 Parvis Notre-Dame – Place Jean-Paul II') },
  { id: 'way/4', name: 'Mémorial des Martyrs de la Déportation', category: 'memorial', lat: 48.85165, lon: 2.35225,
    details: { startDate: '1962', artist: 'Georges-Henri Pingusson', heritage: true, wikipedia: 'Mémorial des Martyrs de la Déportation' }, address: addr('Square de l’Île-de-France') },
  { id: 'way/5', name: 'Sainte-Chapelle', category: 'religious', lat: 48.8554, lon: 2.345,
    details: { startDate: '1248', religion: 'chrétienne', heritage: true, wikipedia: 'Sainte-Chapelle', openingHours: 'Mo-Su 09:00-19:00' }, address: addr('10 Boulevard du Palais', '75001') },
  { id: 'way/6', name: 'Conciergerie', category: 'historic', lat: 48.85614, lon: 2.34591,
    details: { startDate: 'XIVe siècle', heritage: true, wikipedia: 'Conciergerie' }, address: addr('2 Boulevard du Palais', '75001') },
  { id: 'node/7', name: 'Statue équestre d’Henri IV', category: 'statue', lat: 48.85707, lon: 2.34096,
    details: { startDate: '1818', artist: 'François-Frédéric Lemot', heritage: true, wikipedia: 'Statue équestre d’Henri IV (Paris)' }, address: addr('Pont Neuf', '75001') },
  { id: 'node/8', name: 'Square du Vert-Galant', category: 'viewpoint', lat: 48.8576, lon: 2.3387,
    details: { wikipedia: 'Square du Vert-Galant' }, address: addr('Place du Pont-Neuf', '75001') },
  { id: 'node/9', name: 'Fontaine Saint-Michel', category: 'monument', lat: 48.8532, lon: 2.3438,
    details: { startDate: '1860', artist: 'Gabriel Davioud', heritage: true, wikipedia: 'Fontaine Saint-Michel' }, address: addr('Place Saint-Michel', '75006') },
  { id: 'way/10', name: 'Musée de Cluny', localName: 'Musée national du Moyen Âge', category: 'museum', lat: 48.8505, lon: 2.3439,
    details: { heritage: true, wikipedia: 'Musée de Cluny', openingHours: 'Tu-Su 09:30-18:15' }, address: addr('28 Rue Du Sommerard', '75005') },
  { id: 'way/11', name: 'Tour Saint-Jacques', category: 'historic', lat: 48.858, lon: 2.3489,
    details: { startDate: '1523', heritage: true, wikipedia: 'Tour Saint-Jacques' }, address: addr('Square de la Tour-Saint-Jacques') },
  { id: 'way/12', name: 'Hôtel de Ville', category: 'historic', lat: 48.8564, lon: 2.3525,
    details: { startDate: '1882', heritage: true, wikipedia: 'Hôtel de ville de Paris' }, address: addr('Place de l’Hôtel-de-Ville') },
  { id: 'node/13', name: 'Fontaine Stravinsky', category: 'artwork', lat: 48.8595, lon: 2.3513,
    details: { startDate: '1983', artist: 'Jean Tinguely et Niki de Saint Phalle', wikipedia: 'Fontaine Stravinsky' }, address: addr('Place Igor-Stravinsky') },
  { id: 'node/14', name: 'Shakespeare and Company', category: 'attraction', lat: 48.85257, lon: 2.34713,
    details: { startDate: '1951', wikipedia: 'Shakespeare and Company (librairie)' }, address: addr('37 Rue de la Bûcherie', '75005') },
  { id: 'way/15', name: 'Pont Neuf', category: 'historic', lat: 48.857, lon: 2.3419,
    details: { startDate: '1607', heritage: true, wikipedia: 'Pont Neuf' }, address: addr('Pont Neuf', '75001') },
];

/** Positions prédéfinies du panneau de debug. */
GQ.MOCK_PLACES = [
  { label: 'Parvis Notre-Dame', lat: 48.85345, lon: 2.34905 },
  { label: 'Pont Neuf', lat: 48.85705, lon: 2.34175 },
  { label: 'Place Saint-Michel', lat: 48.85335, lon: 2.34395 },
  { label: 'Hôtel de Ville', lat: 48.8562, lon: 2.3519 },
];

GQ.PARIS = { id: 'gn/2988507', name: 'Paris', country: 'FR' };

/** Partie de démo : quelques cartes déjà tirées pour remplir profil et catalogue. */
GQ.seedState = () => {
  const now = Date.now();
  const day = 86400000;
  const card = (poiId, rarity, extra) => {
    const poi = GQ.DEMO_POIS.find((p) => p.id === poiId);
    return {
      poiId, name: poi.name, localName: poi.localName || null, category: poi.category, rarity,
      points: GQ.cardPoints(poi.category, rarity), date: poi.details.startDate || null, artist: poi.details.artist || null,
      heritage: Boolean(poi.details.heritage), countryCode: 'FR', cityId: GQ.PARIS.id, cityName: 'Paris',
      wikiTitle: poi.details.wikipedia || null, wikiUrl: null, imageUrl: null, copies: 1, ...extra,
    };
  };
  const cards = {
    'way/5': card('way/5', 'epic', {
      drawnAt: now - 3 * day,
      bio: 'Chapelle palatine bâtie sur l’île de la Cité à la demande de Saint Louis pour abriter les reliques de la Passion, consacrée en 1248. Ses verrières du XIIIe siècle couvrent plus de 600 m².',
    }),
    'way/11': card('way/11', 'rare', {
      drawnAt: now - 2 * day,
      bio: 'Clocher gothique flamboyant, seul vestige de l’église Saint-Jacques-de-la-Boucherie démolie après la Révolution. Haute de 52 m, elle était une étape des pèlerins vers Saint-Jacques-de-Compostelle.',
    }),
    'node/9': card('node/9', 'common', {
      drawnAt: now - day, copies: 2,
      bio: 'Fontaine monumentale dessinée par Gabriel Davioud et inaugurée en 1860 pendant les travaux haussmanniens. L’archange saint Michel y terrasse le dragon.',
    }),
  };
  const score = Object.values(cards).reduce((a, c) => a + c.points, 0);
  const days = {};
  const base = [7420, 11205, 5310, 9875, 13240, 8650];
  for (let i = 6; i >= 1; i--) days[GQ.dayKey(new Date(now - i * day))] = base[6 - i];
  days[GQ.dayKey(new Date(now))] = 4380;
  return {
    v: 1,
    cards,
    score,
    countries: {},
    cities: {},
    installedAt: now - 40 * day,
    lifetimeBase: 184320, // pas des jours plus anciens que la semaine affichée
    days,
    spent: 1500,
    refunded: 125,
    tx: [
      { at: now - day, label: 'Doublon remboursé : Fontaine Saint-Michel', amount: 125 },
      { at: now - day, label: 'Tirage : Fontaine Saint-Michel', amount: -500 },
      { at: now - 2 * day, label: 'Tirage : Tour Saint-Jacques', amount: -1000 },
    ],
    draws: {}, // { dayKey: { poiId: n } }
    discovered: {},
  };
};

GQ.dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
