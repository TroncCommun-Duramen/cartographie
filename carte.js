// carte.js — Duramen · Carte des grumes
// Application à part, en LECTURE SEULE sur la base de Duramen.
//  - Une commune se connecte avec son code (le même que dans l'app) : elle voit ses grumes.
//  - Tronc Commun se connecte avec son code de lecture : il voit toutes les communes.
// Dépend de : Leaflet, MapLibre (fonds IGN), ../duramen/core.js (essences et couleurs),
// contours.js (contours des communes).
(function () {
'use strict';

// ═══════════ BASE SUPABASE (clé publique, la même que l'app) ═══════════
var SUPABASE_URL = 'https://zeadibimbdztpmsesaiw.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplYWRpYmltYmR6dHBtc2VzYWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTI2MTcsImV4cCI6MjA5MDQ2ODYxN30.xEHLNTROTu9QJ7c_vV3S54P76EXfpnx2VbhxznbQmmU';
var CLE_SESSION = 'duramen_carte_session';   // distincte des clés de l'app (même site)
var DELAI_MS = 20000;

function entetes(session) {
  var h = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };
  if (session && session.type === 'commune') h['x-commune-code'] = session.code;
  if (session && session.type === 'tc') h['x-code-lecture'] = session.code;
  return h;
}
async function requete(chemin, session, corps) {
  var ctrl = new AbortController();
  var minuteur = setTimeout(function () { ctrl.abort(); }, DELAI_MS);
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + chemin, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: entetes(session),
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(minuteur); }
}

// Le code tapé est d'abord essayé comme code de commune, puis comme code de Tronc Commun.
async function connecter(code) {
  code = code.trim().toUpperCase();
  var c = await requete('rpc/verifier_code', null, { code_saisi: code });
  if (c && c.length) return { type: 'commune', code: c[0].code, nom: c[0].commune };
  var t = await requete('rpc/tc_verifier', { type: 'tc', code: code }, {});
  if (t && t.length) return { type: 'tc', code: code, nom: t[0].nom || 'Tronc Commun' };
  return null;
}

// Grumes et sorties, ramenées à une même forme pour la carte
async function chargerDonnees(session) {
  var grumes, sorties;
  if (session.type === 'demo') {
    // Démonstration : grumes fictives de demo.js, rien n'est lu dans la base
    await chargerScript('demo.js');
    var cles = {};
    window.DEMO_GRUMES.forEach(function (g) { if (g.debitee) cles[g.id + '_0'] = true; });
    return window.DEMO_GRUMES.map(function (g) { return normaliser(Object.assign({ commune: session.nom }, g), cles); });
  }
  if (session.type === 'tc') {
    var res = await Promise.all([requete('rpc/tc_grumes', session, {}), requete('rpc/tc_sorties', session, {})]);
    grumes = res[0]; sorties = res[1];
  } else {
    var res2 = await Promise.all([
      requete('grumes?select=*&order=created_at.desc', session),
      requete('extractions?select=grumes_keys', session)
    ]);
    grumes = res2[0].map(function (g) { g.commune = session.nom; return g; });
    sorties = res2[1];
  }
  var sorties_cles = {};
  sorties.forEach(function (s) { (s.grumes_keys || []).forEach(function (k) { sorties_cles[k] = true; }); });
  return grumes.map(function (g) { return normaliser(g, sorties_cles); });
}

function normaliser(g, sortiesCles) {
  var pieces = Array.isArray(g.grumes) && g.grumes.length ? g.grumes : [{}];
  var debitee = pieces.every(function (p, i) { return sortiesCles[g.id + '_' + i]; });
  var lat = num(g.latitude), lon = num(g.longitude);
  return {
    id: g.id,
    nom: g.nom || '',
    essence: g.essence || 'Autre',
    commune: g.commune || '',
    cause: g.cause || '',
    tempete: g.nom_intemperie || '',
    date: (g.date_abattage || (g.created_at || '').slice(0, 10) || ''),
    vol: num(g.vol_brut) || 0,
    diam: num(pieces[0].diametre),
    etat: g.etat || 'standard',
    debitee: debitee,
    debitExterne: !!g.debit_externe,
    // Lieu : nom du parc (quand l'agent l'aura donné) puis rue · quartier retrouvés par la base
    lieu: [g.nom_parc, g.lieu].filter(Boolean).join(' · '),
    repere: g.repere || '',
    lat: lat, lon: lon,
    aPosition: lat !== null && lon !== null,
    precision: num(g.gps_precision),
    manuelle: !!g.position_manuelle
  };
}
function chargerScript(src) {
  return new Promise(function (ok, ko) {
    var s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = ko;
    document.head.appendChild(s);
  });
}
function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }

// ═══════════ OUTILS ═══════════
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var sansAccent = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
var m3 = function (v) { return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m³'; };
var dateFr = function (d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
var tri = function (a) { return Array.from(new Set(a.filter(Boolean))).sort(function (x, y) { return x.localeCompare(y, 'fr'); }); };
// Classe de couleur d'une essence : celle du noyau de Duramen (ex. 'ec-platane')
var ton = function (e) { var i = window.DuramenCore && DuramenCore.ESSENCES_INFO[e]; return i ? i.color : 'ec-autre'; };
var ETATS = { stock: 'En stock', debitee: 'Débitée', exceptionnelle: 'Exceptionnelle', mauvais_etat: 'Mauvais état' };
var NANTES = [47.218, -1.553];

// Contour d'une commune à partir de son nom
var C = window.CONTOURS_COMMUNES;
var codeInsee = {};
Object.keys(C.communes).forEach(function (k) { codeInsee[sansAccent(C.communes[k])] = k; });
var contourDe = function (nomCommune) { var k = codeInsee[sansAccent(nomCommune)]; return k ? C.contours[k] : null; };

// ═══════════ ÉTAT ═══════════
var session = null;
var toutes = [];               // grumes de la session
var choix = { commune: new Set(), essence: new Set(), cause: new Set(), tempete: new Set(), etat: new Set() };
var zone = null;               // lieu cherché sur OpenStreetMap : { nom, contient(g), couche }
var carte = null, coucheContours, couchePoints, coucheZone, marques = {};

// ═══════════ CONNEXION ═══════════
function lireSession() { try { return JSON.parse(localStorage.getItem(CLE_SESSION)); } catch (e) { return null; } }
function ecrireSession(s) { try { s ? localStorage.setItem(CLE_SESSION, JSON.stringify(s)) : localStorage.removeItem(CLE_SESSION); } catch (e) {} }

$('form-connexion').addEventListener('submit', async function (e) {
  e.preventDefault();
  var btn = $('btn-connexion');
  $('erreur-connexion').hidden = true;
  btn.disabled = true; btn.textContent = 'Vérification…';
  try {
    var s = await connecter($('code').value);
    if (!s) throw new Error('code');
    ecrireSession(s);
    await ouvrir(s);
  } catch (err) {
    $('erreur-connexion').textContent = err.message === 'code'
      ? 'Code inconnu. Vérifiez-le auprès de Tronc Commun.'
      : 'Connexion impossible. Vérifiez le réseau et réessayez.';
    $('erreur-connexion').hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Ouvrir la carte';
  }
});

$('deconnexion').addEventListener('click', function () {
  if (session && session.type === 'demo') { location.href = location.pathname; return; }
  ecrireSession(null);
  location.reload();
});

async function ouvrir(s) {
  session = s;
  toutes = await chargerDonnees(s);
  $('ecran-connexion').hidden = true;
  $('ecran-carte').hidden = false;
  $('session').hidden = false;
  $('nom-session').textContent = s.type === 'tc' ? 'Tronc Commun · toutes les communes'
    : s.type === 'demo' ? 'Démonstration · grumes fictives' : s.nom;
  $('deconnexion').textContent = s.type === 'demo' ? 'Quitter la démonstration' : 'Se déconnecter';
  $('note-demo').hidden = s.type !== 'demo';
  document.body.classList.toggle('sans-commune', s.type !== 'tc');
  $('m-commune').hidden = s.type !== 'tc';
  if (!carte) creerCarte();
  dessinerContours();
  rafraichir(true);
}

// ═══════════ CARTE ═══════════
function creerCarte() {
  carte = L.map('carte', { zoomSnap: 0.5 });
  var WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  var attrib = '© <a href="https://www.ign.fr/" target="_blank" rel="noopener">IGN</a> Géoplateforme';
  var STYLES = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/';
  // Vue aérienne adoucie avec les noms des rues (par défaut), ou plan IGN épuré
  var aerienne = L.layerGroup([
    L.tileLayer(WMTS + '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg', { maxZoom: 19, attribution: attrib, className: 'photo-adoucie' }),
    L.maplibreGL({ style: STYLES + 'toponymes.json', interactive: false, attribution: attrib })
  ]).addTo(carte);
  var epure = L.maplibreGL({ style: STYLES + 'epure.json', interactive: false, attribution: attrib });
  L.control.layers({ 'Vue aérienne': aerienne, 'Plan épuré': epure }, null, { position: 'topright', collapsed: false }).addTo(carte);
  coucheContours = L.layerGroup().addTo(carte);
  coucheZone = L.layerGroup().addTo(carte);
  couchePoints = L.layerGroup().addTo(carte);
  var legende = L.control({ position: 'bottomleft' });
  legende.onAdd = function () {
    var d = L.DomUtil.create('details', 'legende'); d.id = 'legende';
    d.open = !matchMedia('(max-width: 700px)').matches;   // repliée sur téléphone
    d.innerHTML = '<summary>Légende</summary><div id="legende-corps"></div>';
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
  legende.addTo(carte);
}

function dessinerContours() {
  coucheContours.clearLayers();
  Object.keys(C.contours).forEach(function (code) {
    var aMoi = session.type === 'tc' || sansAccent(C.communes[code]) === sansAccent(session.nom);
    L.polygon(C.contours[code], { className: aMoi ? 'contour' : 'contour-autre', interactive: false }).addTo(coucheContours);
  });
}

// Cercles d'une grume, de l'extérieur vers le centre (le cœur = l'essence)
var RAYON = 10, EPAISSEUR = 3;
function anneaux(g) {
  return [g.etat === 'exceptionnelle' ? 'or' : g.etat === 'mauvais_etat' ? 'ardoise' : '', g.debitee ? 'blanc' : ''].filter(Boolean);
}
function etatsDe(g) { return [g.debitee ? 'debitee' : 'stock', g.etat]; }

// ═══════════ CRITÈRES ═══════════
function texteCherche(g) { return sansAccent([g.nom, g.essence, g.lieu, g.commune, g.repere].join(' ')); }

function correspond(g, sauf) {
  if (zone) { if (!zone.contient(g)) return false; }
  else {
    var q = sansAccent($('recherche').value.trim());
    if (q && texteCherche(g).indexOf(q) === -1) return false;
  }
  if (sauf !== 'commune' && choix.commune.size && !choix.commune.has(g.commune)) return false;
  if (sauf !== 'essence' && choix.essence.size && !choix.essence.has(g.essence)) return false;
  // Cause et tempête vont ensemble : cocher une tempête suffit
  if (sauf !== 'cause' && (choix.cause.size || choix.tempete.size)
      && !choix.cause.has(g.cause) && !choix.tempete.has(g.tempete)) return false;
  if (sauf !== 'etat' && choix.etat.size) {
    // En stock / débitée d'un côté, exceptionnelle / mauvais état de l'autre
    var e = etatsDe(g);
    var cote = function (a) { return a.filter(function (x) { return choix.etat.has(x); }); };
    var suivi = cote(['stock', 'debitee']), rang = cote(['exceptionnelle', 'mauvais_etat']);
    if (suivi.length && suivi.indexOf(e[0]) === -1) return false;
    if (rang.length && rang.indexOf(e[1]) === -1) return false;
  }
  if ($('du').value && g.date < $('du').value) return false;
  if ($('au').value && g.date > $('au').value) return false;
  return true;
}

function caseHtml(cle, v, libelle, nb, extra, classe) {
  return '<label class="case ' + (classe || '') + (nb ? '' : ' vide') + '"><input type="checkbox" data-cle="' + cle + '" data-v="' + esc(v) + '"' +
    (choix[cle].has(v) ? ' checked' : '') + '>' + (extra || '') + esc(libelle) + '<span class="nb">' + nb + '</span></label>';
}

function panneaux(placees) {
  var base = function (cle) { return placees.filter(function (g) { return correspond(g, cle); }); };
  var compter = function (liste, f) { return function (v) { return liste.filter(function (g) { return [].concat(f(g)).indexOf(v) !== -1; }).length; }; };
  var nc = compter(base('commune'), function (g) { return g.commune; });
  $('p-commune').innerHTML = tri(placees.map(function (g) { return g.commune; })).map(function (c) { return caseHtml('commune', c, c, nc(c)); }).join('');
  var ne = compter(base('essence'), function (g) { return g.essence; });
  $('p-essence').innerHTML = tri(placees.map(function (g) { return g.essence; }))
    .map(function (e) { return caseHtml('essence', e, e, ne(e), '<span class="pastille ton-' + ton(e) + '"></span>'); }).join('');
  var bk = base('cause'), nk = compter(bk, function (g) { return g.cause; }), nt = compter(bk, function (g) { return g.tempete; });
  $('p-cause').innerHTML = tri(placees.map(function (g) { return g.cause; })).map(function (c) {
    return caseHtml('cause', c, c, nk(c)) + (c === 'Intempérie'
      ? tri(placees.filter(function (g) { return g.cause === c; }).map(function (g) { return g.tempete; }))
          .map(function (t) { return caseHtml('tempete', t, 'Tempête ' + t, nt(t), '', 'sous'); }).join('')
      : '');
  }).join('');
  var ns = compter(base('etat'), etatsDe);
  $('p-etat').innerHTML = '<div class="titre-panneau">Où en est la grume</div>' +
    ['stock', 'debitee'].map(function (e) { return caseHtml('etat', e, ETATS[e], ns(e)); }).join('') +
    '<div class="titre-panneau">Grumes à part</div>' +
    ['exceptionnelle', 'mauvais_etat'].map(function (e) { return caseHtml('etat', e, ETATS[e], ns(e)); }).join('');
  // Titre des boutons : nombre de choix actifs
  var actifs = { commune: choix.commune.size, essence: choix.essence.size, cause: choix.cause.size + choix.tempete.size,
    etat: choix.etat.size, dates: ($('du').value ? 1 : 0) + ($('au').value ? 1 : 0) };
  var noms = { commune: 'Commune', essence: 'Essence', cause: 'Cause', etat: 'État', dates: 'Dates' };
  document.querySelectorAll('.menu').forEach(function (m) {
    var k = m.dataset.menu, n = actifs[k];
    m.classList.toggle('actif', n > 0);
    m.querySelector('summary').textContent = noms[k] + (n ? ' · ' + n : '');
  });
  var total = Object.keys(actifs).reduce(function (a, k) { return a + actifs[k]; }, 0) + ($('recherche').value.trim() ? 1 : 0) + (zone ? 1 : 0);
  $('effacer').hidden = !total;
}

// ═══════════ AFFICHAGE ═══════════
function fiche(g) {
  var cause = g.cause + (g.tempete ? ' — tempête ' + g.tempete : '');
  var etat = g.etat !== 'standard' && ETATS[g.etat] ? '<span class="etat etat-' + g.etat + '">' + ETATS[g.etat] + '</span>' : '';
  var position = g.manuelle ? 'position placée au bureau' : (g.precision ? 'position GPS à ± ' + g.precision + ' m' : 'position GPS');
  return '<div class="fiche"><b>' + esc(g.nom || 'Sans numéro') + '</b> · ' + esc(g.essence) + etat + '<br>' +
    esc(g.lieu || 'Lieu en cours de recherche') + (session.type === 'tc' ? ', ' + esc(g.commune) : '') + '<br>' +
    'Abattue le ' + dateFr(g.date) + (cause ? ' · ' + esc(cause) : '') + '<br>' +
    m3(g.vol) + (g.diam ? ' · Ø ' + g.diam + ' cm' : '') + ' · ' + (g.debitee ? 'débitée' : 'en stock') +
    (g.debitExterne && !g.debitee ? ' · débit externalisé' : '') + '<br>' +
    '<span class="discret">' + position + '</span></div>';
}

function rafraichir(cadrer) {
  var placees = toutes.filter(function (g) { return g.aPosition; });
  var liste = placees.filter(function (g) { return correspond(g); }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  panneaux(placees);

  var vol = liste.reduce(function (s, g) { return s + g.vol; }, 0);
  $('compte').innerHTML = '<b>' + liste.length + ' grume' + (liste.length > 1 ? 's' : '') + '</b> · ' + m3(vol);

  // Message sur la carte
  var msg = '';
  if (!placees.length) msg = toutes.length ? 'Aucune grume n’a encore de position GPS.' : 'Aucune grume enregistrée pour le moment.';
  else if (!liste.length) msg = 'Aucune grume ne correspond.';
  $('message-carte').textContent = msg;
  $('message-carte').hidden = !msg;

  // Bouton « chercher ce lieu sur la carte » : quand le texte ne trouve rien dans les grumes
  var q = $('recherche').value.trim();
  var btnLieu = $('chercher-lieu');
  btnLieu.hidden = !!zone || q.length < 3 || liste.length > 0;
  btnLieu.textContent = 'Chercher « ' + q + ' » sur la carte';

  // Points : même taille pour tous ; cercles de l'extérieur vers le centre, puis le cœur (essence)
  couchePoints.clearLayers(); marques = {};
  liste.forEach(function (g) {
    var cercles = anneaux(g).map(function (a) { return 'anneau-' + a; }).concat('pt-' + ton(g.essence));
    var m;
    cercles.forEach(function (cls, i) {
      var c = L.circleMarker([g.lat, g.lon], { radius: RAYON - i * EPAISSEUR, stroke: false, fillOpacity: 1,
        className: cls, interactive: i === 0 }).addTo(couchePoints);
      if (i === 0) m = c;
    });
    m.bindPopup(function () { return fiche(g); }).bindTooltip((g.nom || 'Sans numéro') + ' · ' + g.essence);
    m.on('popupopen', function () { surligner(g.id); });
    marques[g.id] = m;
  });

  // Légende : seulement les essences visibles
  var parEss = {};
  liste.forEach(function (g) { parEss[g.essence] = (parEss[g.essence] || 0) + 1; });
  $('legende-corps').innerHTML = Object.keys(parEss).sort(function (a, b) { return parEss[b] - parEss[a]; }).map(function (e) {
    return '<div class="legende-ligne"><span class="pastille ton-' + ton(e) + '"></span>' + esc(e) + '</div>';
  }).join('') + '<hr><div class="legende-ligne"><span class="pastille r-or"></span>exceptionnelle</div>' +
    '<div class="legende-ligne"><span class="pastille r-ardoise"></span>mauvais état</div>' +
    '<div class="legende-ligne"><span class="pastille r-blanc"></span>débitée</div>';
  $('legende').hidden = !liste.length;

  // Liste
  $('liste-titre').textContent = 'Voir la liste (' + liste.length + ')';
  $('liste').innerHTML = liste.map(function (g) {
    return '<tr data-id="' + esc(g.id) + '">' +
      '<td data-l="Numéro">' + esc(g.nom || 'Sans numéro') + (g.etat !== 'standard' && ETATS[g.etat] ? '<span class="etat etat-' + g.etat + '">' + ETATS[g.etat] + '</span>' : '') + '</td>' +
      '<td data-l="Essence"><span class="pastille en-ligne ton-' + ton(g.essence) + '"></span>' + esc(g.essence) + '</td>' +
      '<td data-l="Lieu">' + esc(g.lieu || '—') + '</td>' +
      '<td data-l="Commune" class="col-commune">' + esc(g.commune) + '</td>' +
      '<td data-l="Abattage" class="date">' + dateFr(g.date) + '</td>' +
      '<td data-l="Cause">' + esc(g.cause) + (g.tempete ? ' — ' + esc(g.tempete) : '') + '</td>' +
      '<td data-l="Cubage" class="num">' + m3(g.vol) + '</td></tr>';
  }).join('');

  // Grumes sans position : signalées, pas montrées
  var sansPos = toutes.length - placees.length;
  $('sans-position').textContent = sansPos
    ? sansPos + (sansPos > 1 ? ' grumes n’ont' : ' grume n’a') + ' pas de position GPS : elles ne sont pas sur la carte. Elles peuvent être placées à la main dans la version bureau.'
    : '';
  $('sans-position').hidden = !sansPos;

  if (cadrer) cadrerCarte(liste);
}

function cadrerCarte(liste) {
  if (zone && zone.couche) { carte.fitBounds(zone.couche.getBounds(), { padding: [40, 40], maxZoom: 18 }); return; }
  if (liste.length) { carte.fitBounds(L.latLngBounds(liste.map(function (g) { return [g.lat, g.lon]; })), { padding: [50, 50], maxZoom: 18 }); return; }
  var c = session.type !== 'tc' && contourDe(session.nom);
  if (c) carte.fitBounds(L.polygon(c).getBounds());
  else carte.setView(NANTES, 11);
}
function surligner(id) { document.querySelectorAll('#liste tr').forEach(function (tr) { tr.classList.toggle('vise', tr.dataset.id === id); }); }

// ═══════════ CHERCHER UN LIEU (parc, square…) SUR OPENSTREETMAP ═══════════
// Le nom d'un parc n'est pas dans la base : on demande son contour, puis on montre
// les grumes qui sont dedans. Une seule demande, au clic (règle d'OpenStreetMap).
async function chercherLieu(texte) {
  var btn = $('chercher-lieu');
  btn.disabled = true; btn.textContent = 'Recherche…';
  var dansCommune = session.type !== 'tc' && contourDe(session.nom) ? ', ' + session.nom : '';
  var params = new URLSearchParams({
    format: 'jsonv2', q: texte + dansCommune, limit: '1', polygon_geojson: '1', 'accept-language': 'fr',
    countrycodes: 'fr', viewbox: '-1.85,47.08,-1.30,47.36', bounded: '1'   // Nantes Métropole
  });
  try {
    var r = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString());
    var res = await r.json();
    if (!res.length) throw new Error('rien');
    poserZone(res[0], texte);
  } catch (e) {
    $('message-carte').textContent = e.message === 'rien'
      ? 'Lieu « ' + texte + ' » introuvable sur la carte.'
      : 'Recherche impossible (pas de réseau ?).';
    $('message-carte').hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function poserZone(lieu, texte) {
  var geo = lieu.geojson || {};
  var nom = (lieu.name || texte);
  coucheZone.clearLayers();
  var contient, couche;
  if (geo.type === 'Polygon' || geo.type === 'MultiPolygon') {
    var polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
    contient = function (g) { return polys.some(function (p) { return dansPolygone(g.lon, g.lat, p); }); };
    couche = L.geoJSON(geo, { className: 'contour-zone', interactive: false }).addTo(coucheZone);
  } else {
    // Un simple point : on prend les grumes à moins de 150 m
    var centre = L.latLng(Number(lieu.lat), Number(lieu.lon));
    contient = function (g) { return centre.distanceTo([g.lat, g.lon]) <= 150; };
    couche = L.circle(centre, { radius: 150, className: 'contour-zone', interactive: false }).addTo(coucheZone);
  }
  zone = { nom: nom, contient: contient, couche: couche };
  $('zone-nom').textContent = nom;
  $('zone').hidden = false;
  $('recherche').value = '';
  rafraichir(true);
}

function retirerZone() {
  zone = null;
  coucheZone.clearLayers();
  $('zone').hidden = true;
}

// Point dans un polygone (avec trous) : coordonnées GeoJSON [longitude, latitude]
function dansPolygone(x, y, anneaux) {
  var dedans = false;
  anneaux.forEach(function (anneau, n) {
    var d = false;
    for (var i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      var xi = anneau[i][0], yi = anneau[i][1], xj = anneau[j][0], yj = anneau[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) d = !d;
    }
    if (n === 0) dedans = d; else if (d) dedans = false;   // les anneaux suivants sont des trous
  });
  return dedans;
}

// ═══════════ ÉVÉNEMENTS ═══════════
// Un seul menu ouvert à la fois ; un clic ailleurs ou Échap le referme
function fermerMenus(sauf) { document.querySelectorAll('.menu[open]').forEach(function (m) { if (m !== sauf) m.open = false; }); }
document.querySelectorAll('.menu').forEach(function (m) { m.addEventListener('toggle', function () { if (m.open) fermerMenus(m); }); });
document.addEventListener('click', function (e) { if (!e.target.closest('.menu')) fermerMenus(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermerMenus(); });
document.querySelector('.barre').addEventListener('change', function (e) {
  var c = e.target.closest('input[type=checkbox]');
  if (c) { var s = choix[c.dataset.cle]; c.checked ? s.add(c.dataset.v) : s.delete(c.dataset.v); }
  if (c || e.target.type === 'date') rafraichir(true);
});
var attente;
$('recherche').addEventListener('input', function () {
  if (zone && $('recherche').value.trim()) retirerZone();
  clearTimeout(attente); attente = setTimeout(function () { rafraichir(true); }, 200);
});
$('recherche').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !$('chercher-lieu').hidden) { e.preventDefault(); chercherLieu($('recherche').value.trim()); }
});
$('chercher-lieu').addEventListener('click', function () { chercherLieu($('recherche').value.trim()); });
$('zone-x').addEventListener('click', function () { retirerZone(); rafraichir(true); });
$('effacer').addEventListener('click', function () {
  Object.keys(choix).forEach(function (k) { choix[k].clear(); });
  ['recherche', 'du', 'au'].forEach(function (id) { $(id).value = ''; });
  retirerZone();
  rafraichir(true);
});
$('liste').addEventListener('click', function (e) {
  var tr = e.target.closest('tr'); var m = tr && marques[tr.dataset.id]; if (!m) return;
  carte.flyTo(m.getLatLng(), 18, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.6 });
  carte.once('moveend', function () { m.openPopup(); });
  $('carte').scrollIntoView({ block: 'center', behavior: 'smooth' });
});

// ═══════════ DÉMARRAGE ═══════════
// Le code gardé sur l'appareil est revérifié à chaque ouverture : un code coupé
// dans la base ne donne plus accès à rien.
// Adresse terminée par ?demo : démonstration sans code, avec des grumes fictives
var gardee = lireSession();
if (new URLSearchParams(location.search).has('demo')) {
  ouvrir({ type: 'demo', nom: 'Nantes' }).catch(function () {
    $('erreur-connexion').textContent = 'Démonstration indisponible (pas de réseau ?).';
    $('erreur-connexion').hidden = false;
  });
} else if (gardee && gardee.code) {
  connecter(gardee.code).then(function (s) {
    if (!s) { ecrireSession(null); throw new Error('code'); }
    ecrireSession(s);
    return ouvrir(s);
  }).catch(function () {
    // Code retiré ou réseau absent : retour à l'écran de connexion
    $('ecran-connexion').hidden = false;
    $('ecran-carte').hidden = true;
    $('erreur-connexion').textContent = 'Impossible d’ouvrir la carte. Retapez le code ou vérifiez le réseau.';
    $('erreur-connexion').hidden = false;
  });
}
}());
