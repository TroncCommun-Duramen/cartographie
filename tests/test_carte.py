"""Essais de la carte des grumes dans un navigateur, base Supabase imitée.
Lance un petit serveur local avec /duramen (l'app) et /cartographie côte à côte,
comme sur GitHub Pages."""
import json, re, subprocess, time, sys
from playwright.sync_api import sync_playwright

NM = '/home/claude/carte-test/node_modules/'
TUILE = open('/home/claude/carte-test/tuile.jpg', 'rb').read()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', '/home/claude/site'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
URL = 'http://localhost:8765/cartographie/'

# ── Base imitée ──
JP = [-1.5452975, 47.2181603, -1.5405873, 47.2213176]   # cadre du Jardin des Plantes
def gr(i, nom, ess, lat, lon, **k):
    g = {'id': f'id-{i}', 'nom': nom, 'essence': ess, 'cause': 'Coupe sanitaire', 'nom_intemperie': None,
         'date_abattage': f'2026-11-{10+i:02d}', 'created_at': f'2026-11-{10+i:02d}T08:00:00Z', 'vol_brut': 0.5 + i/10,
         'grumes': [{'diametre': 30 + i, 'longueur': 3}], 'etat': 'standard', 'debit_externe': False,
         'latitude': lat, 'longitude': lon, 'gps_precision': 4, 'position_manuelle': False,
         'lieu': 'Boulevard de Stalingrad · Coulmiers - Jardin des Plantes', 'repere': None}
    g.update(k); return g
NANTES = [
    gr(1, 'NAN-00001', 'Platane', 47.2195, -1.5430),                                   # dans le parc
    gr(2, 'NAN-00002', 'Chêne', 47.2200, -1.5420, etat='exceptionnelle'),             # dans le parc
    gr(3, 'NAN-00003', 'Frêne', 47.2165, -1.5556, lieu='Rue des Trois Croissants · Bouffay, Centre Ville',
       cause='Intempérie', nom_intemperie='Ciarán', etat='mauvais_etat'),
    gr(4, 'NAN-00004', 'Tilleul', 47.2300, -1.5700, lieu=None, grumes=[{'diametre': 85}], debit_externe=True),
    gr(5, 'NAN-00005', 'Séquoia', None, None, lieu=None),                              # sans position
    gr(6, None, 'Essence inconnue', 47.2250, -1.5600, lieu='Rue <b>X</b> · Test', position_manuelle=True, gps_precision=None),
]
SORTIES_NANTES = [{'grumes_keys': ['id-1_0']}]                                         # NAN-00001 débitée
TC = [dict(g, commune='Nantes') for g in NANTES if g['latitude']] + [
    dict(gr(7, 'REZ-00001', 'Peuplier', 47.1900, -1.5500, lieu='Rue Alsace-Lorraine · Pont-Rousseau'), commune='Rezé')]
for g in TC: g.pop('commune_code', None)
appels = []

def json_rep(r, data, status=200):
    r.fulfill(status=status, body=json.dumps(data), headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})

def supabase(r):
    u, h = r.request.url, r.request.headers
    corps = r.request.post_data or ''
    appels.append((u, h.get('x-commune-code'), h.get('x-code-lecture'), r.request.method))
    if r.request.method == 'OPTIONS': return r.fulfill(status=200, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'})
    if r.request.method not in ('GET', 'POST'): return json_rep(r, {'message': 'interdit'}, 403)
    if u.endswith('rpc/verifier_code'):
        code = json.loads(corps)['code_saisi'].strip().upper()
        return json_rep(r, [{'code': 'NAN-TEST', 'commune': 'Nantes'}] if code == 'NAN-TEST' else [])
    if u.endswith('rpc/tc_verifier'):
        return json_rep(r, [{'nom': 'Tronc Commun'}] if h.get('x-code-lecture') == 'TC-LECTURE' else [])
    if u.endswith('rpc/tc_grumes'):
        return json_rep(r, TC if h.get('x-code-lecture') == 'TC-LECTURE' else [])
    if u.endswith('rpc/tc_sorties'):
        return json_rep(r, SORTIES_NANTES if h.get('x-code-lecture') == 'TC-LECTURE' else [])
    if '/rest/v1/grumes' in u:
        return json_rep(r, NANTES if h.get('x-commune-code') == 'NAN-TEST' else [])
    if '/rest/v1/extractions' in u:
        return json_rep(r, SORTIES_NANTES if h.get('x-commune-code') == 'NAN-TEST' else [])
    json_rep(r, {'message': 'inconnu'}, 404)

def route(r):
    u = r.request.url
    if u.startswith('http://localhost'): return r.continue_()
    if 'supabase.co' in u: return supabase(r)
    if 'unpkg.com/leaflet@' in u:
        f = u.split('/dist/')[1]
        return r.fulfill(status=200, body=open(NM + 'leaflet/dist/' + f, 'rb').read(), headers={'content-type': 'text/css' if f.endswith('css') else 'application/javascript', 'access-control-allow-origin': '*'})
    if 'unpkg.com/maplibre-gl@' in u:
        f = u.split('/dist/')[1]
        return r.fulfill(status=200, body=open(NM + 'maplibre-gl/dist/' + f, 'rb').read(), headers={'content-type': 'text/css' if f.endswith('css') else 'application/javascript', 'access-control-allow-origin': '*'})
    if 'maplibre-gl-leaflet' in u:
        return r.fulfill(status=200, body=open(NM + '@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js', 'rb').read(), headers={'content-type': 'application/javascript', 'access-control-allow-origin': '*'})
    if 'vectorTiles/styles' in u:
        return json_rep(r, {'version': 8, 'sources': {}, 'layers': [{'id': 'fond', 'type': 'background', 'paint': {'background-color': '#e8e6df'}}] if 'epure' in u else []})
    if 'data.geopf.fr/wmts' in u: return r.fulfill(status=200, body=TUILE, headers={'content-type': 'image/jpeg'})
    if 'nominatim.openstreetmap.org/search' in u:
        appels.append((u, None, None, 'NOMINATIM'))
        if 'Jardin' in u:
            x0, y0, x1, y1 = JP
            return json_rep(r, [{'name': 'Jardin des Plantes', 'lat': '47.2197', 'lon': '-1.5429',
                'geojson': {'type': 'Polygon', 'coordinates': [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}}])
        if 'Stalingrad' in u:
            return json_rep(r, [{'name': 'Square point', 'lat': '47.2165', 'lon': '-1.5556', 'geojson': {'type': 'Point', 'coordinates': [-1.5556, 47.2165]}}])
        return json_rep(r, [])
    r.abort()

res, errs = [], []
def check(nom, cond):
    res.append(bool(cond)); print(('OK   ' if cond else 'ÉCHEC'), nom)

def coche(pg, menu, v):
    pg.click(f'.menu[data-menu={menu}] summary'); pg.click(f'.panneau input[data-v="{v}"]', force=True); pg.wait_for_timeout(150)
    pg.keyboard.press('Escape')

nb = lambda pg: int(pg.inner_text('#compte').split(' ')[0])

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'])
    for larg, haut, nv in [(1280, 860, 'ordi'), (390, 844, 'tel')]:
        ctx = b.new_context(viewport={'width': larg, 'height': haut})
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
        pg.route(re.compile(r'^https?://'), route)
        pg.goto(URL); pg.wait_for_timeout(600)
        check(f'[{nv}] écran de connexion d\'abord', pg.is_visible('#ecran-connexion') and pg.is_hidden('#ecran-carte'))
        check(f'[{nv}] couleurs de l\'app chargées (theme.css de Duramen)', pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--ec-platane').trim()") == '#C3432A')
        check(f'[{nv}] essences de l\'app chargées (core.js)', pg.evaluate("DuramenCore.ESSENCES_INFO['Platane'].color") == 'ec-platane')
        pg.fill('#code', 'faux'); pg.click('#btn-connexion'); pg.wait_for_timeout(500)
        check(f'[{nv}] faux code refusé', pg.is_visible('#erreur-connexion') and 'inconnu' in pg.inner_text('#erreur-connexion'))
        # ── Commune ──
        pg.fill('#code', ' nan-test '); pg.click('#btn-connexion'); pg.wait_for_timeout(1200)
        check(f'[{nv}] commune connectée', pg.is_visible('#ecran-carte') and pg.inner_text('#nom-session') == 'Nantes')
        check(f'[{nv}] en-tête x-commune-code envoyé', any('/grumes?' in a[0] and a[1] == 'NAN-TEST' for a in appels))
        check(f'[{nv}] 5 grumes placées', nb(pg) == 5 and pg.locator('path.pt-ec-platane').count() == 1)
        check(f'[{nv}] essence inconnue en gris', pg.locator('path.pt-ec-autre').count() == 1)
        couleur = pg.evaluate("getComputedStyle(document.querySelector('path.pt-ec-platane')).fill")
        check(f'[{nv}] point Platane à la couleur de l\'app ({couleur})', couleur == 'rgb(195, 67, 42)')
        check(f'[{nv}] grume sans position signalée', pg.is_visible('#sans-position') and pg.inner_text('#sans-position').startswith('1 grume'))
        check(f'[{nv}] cercles : or ×1, ardoise ×1, blanc (débitée) ×1',
              pg.locator('path.anneau-or').count() == 1 and pg.locator('path.anneau-ardoise').count() == 1 and pg.locator('path.anneau-blanc').count() == 1)
        check(f'[{nv}] bouton Commune caché pour une commune', pg.locator('#m-commune').is_hidden())
        check(f'[{nv}] colonne Commune cachée', pg.evaluate("getComputedStyle(document.querySelector('th.col-commune')).display") == 'none')
        check(f'[{nv}] aucun style écrit dans le HTML de la page', pg.evaluate("document.querySelectorAll('#ecran-carte .barre [style], #liste [style], .entete [style]').length") == 0)
        check(f'[{nv}] texte de lieu échappé (pas de HTML injecté)', pg.locator('#liste b').count() == 0 and '<b>X</b>' in pg.text_content('#liste'))
        # Recherche dans les lieux enregistrés
        pg.fill('#recherche', 'stalingrad'); pg.wait_for_timeout(400)
        check(f'[{nv}] recherche « stalingrad » : 2 grumes (rue enregistrée)', nb(pg) == 2)
        pg.fill('#recherche', 'bouffay'); pg.wait_for_timeout(400)
        check(f'[{nv}] recherche par quartier « bouffay » : 1', nb(pg) == 1)
        # Parc : pas dans le texte enregistré → bouton de recherche sur la carte
        pg.fill('#recherche', 'Jardin des Plantes'); pg.wait_for_timeout(400)
        n0 = nb(pg)
        pg.fill('#recherche', 'Jardin des Pl'); pg.wait_for_timeout(400)
        # « Jardin des Plantes » figure dans le quartier enregistré : on force un nom absent
        pg.fill('#recherche', 'Parc du Jardin'); pg.wait_for_timeout(400)
        check(f'[{nv}] nom absent → bouton « Chercher sur la carte »', nb(pg) == 0 and pg.is_visible('#chercher-lieu'))
        pg.fill('#recherche', 'Jardin des Plantes zzz'); pg.wait_for_timeout(400)
        pg.click('#chercher-lieu'); pg.wait_for_timeout(800)
        check(f'[{nv}] contour du parc : 2 grumes dedans', pg.is_visible('#zone') and nb(pg) == 2 and pg.locator('path.contour-zone').count() == 1)
        check(f'[{nv}] demande OpenStreetMap limitée à la commune', any(a[3] == 'NOMINATIM' and 'Nantes' in a[0] and 'bounded=1' in a[0] for a in appels))
        coche(pg, 'etat', 'exceptionnelle')
        check(f'[{nv}] parc + exceptionnelle : 1', nb(pg) == 1)
        pg.click('#effacer'); pg.wait_for_timeout(300)
        check(f'[{nv}] tout effacer', nb(pg) == 5 and pg.is_hidden('#zone'))
        pg.fill('#recherche', 'introuvablexyz'); pg.wait_for_timeout(400); pg.click('#chercher-lieu'); pg.wait_for_timeout(500)
        check(f'[{nv}] lieu introuvable signalé', 'introuvable' in pg.inner_text('#message-carte'))
        pg.click('#effacer'); pg.wait_for_timeout(300)
        # Critères
        coche(pg, 'cause', 'Ciarán')
        check(f'[{nv}] tempête Ciarán : 1', nb(pg) == 1)
        pg.click('#effacer'); pg.wait_for_timeout(200)
        coche(pg, 'etat', 'debitee')
        check(f'[{nv}] débitées : 1', nb(pg) == 1)
        pg.click('#effacer'); pg.wait_for_timeout(200)
        coche(pg, 'essence', 'Chêne')
        check(f'[{nv}] essence Chêne : 1', nb(pg) == 1)
        pg.click('#effacer'); pg.wait_for_timeout(200)
        # Fiche
        pg.evaluate("document.querySelector('#liste-bloc').open = true")
        pg.click('#liste tr[data-id="id-4"]'); pg.wait_for_timeout(1500)
        t = pg.inner_text('.leaflet-popup-content') if pg.locator('.leaflet-popup-content').count() else ''
        check(f'[{nv}] fiche : lieu en cours de recherche, débit externalisé, précision', 'Lieu en cours de recherche' in t and 'débit externalisé' in t and '± 4 m' in t)
        # Revenue : session gardée et revérifiée
        pg.reload(); pg.wait_for_timeout(1500)
        check(f'[{nv}] session gardée et revérifiée à l\'ouverture', pg.is_visible('#ecran-carte') and sum(1 for a in appels if a[0].endswith('verifier_code')) >= 3)
        pg.click('#deconnexion'); pg.wait_for_timeout(800)
        check(f'[{nv}] déconnexion', pg.is_visible('#ecran-connexion') and pg.evaluate("localStorage.getItem('duramen_carte_session')") is None)
        # ── Tronc Commun ──
        pg.fill('#code', 'tc-lecture'); pg.click('#btn-connexion'); pg.wait_for_timeout(1200)
        check(f'[{nv}] Tronc Commun connecté', pg.is_visible('#ecran-carte') and 'Tronc Commun' in pg.inner_text('#nom-session'))
        check(f'[{nv}] en-tête x-code-lecture envoyé', any(a[0].endswith('tc_grumes') and a[2] == 'TC-LECTURE' for a in appels))
        check(f'[{nv}] toutes les communes : 6 grumes', nb(pg) == 6 and pg.locator('#m-commune').is_visible())
        coche(pg, 'commune', 'Rezé')
        check(f'[{nv}] filtre commune Rezé : 1', nb(pg) == 1)
        pg.click('#effacer'); pg.wait_for_timeout(200)
        check(f'[{nv}] colonne Commune visible pour Tronc Commun', pg.evaluate("getComputedStyle(document.querySelector('th.col-commune')).display") != 'none' or nv == 'tel')
        # Ancien code gardé puis coupé dans la base → plus d'accès
        pg.evaluate("localStorage.setItem('duramen_carte_session', JSON.stringify({type:'commune', code:'ANCIEN', nom:'Nantes'}))")
        pg.reload(); pg.wait_for_timeout(1200)
        check(f'[{nv}] code coupé : retour à la connexion', pg.is_visible('#ecran-connexion') and pg.is_hidden('#ecran-carte'))
        check(f'[{nv}] aucune écriture vers la base', not any(a[3] not in ('GET', 'POST', 'NOMINATIM', 'OPTIONS') for a in appels)
              and not any(a[3] == 'POST' and '/rest/v1/' in a[0] and '/rpc/' not in a[0] for a in appels))
        # ── Démonstration sans code ──
        pg.goto(URL + '?demo'); pg.wait_for_timeout(1500)
        check(f'[{nv}] démonstration : 51 grumes fictives sans code', pg.is_visible('#ecran-carte') and nb(pg) == 51 and 'fictives' in pg.inner_text('#nom-session'))
        check(f'[{nv}] démonstration : avertissement visible, aucune lecture de la base', pg.is_visible('#note-demo') and not any('demo' in a[0] for a in appels if 'supabase' in a[0]))
        pg.fill('#recherche', 'procé'); pg.wait_for_timeout(400)
        check(f'[{nv}] démonstration : recherche « procé » : 7', nb(pg) == 7)
        check(f'[{nv}] © Tronc Commun en pied de page', pg.is_visible('.pied') and pg.inner_text('.pied') == '© Tronc Commun')
        pg.click('#deconnexion'); pg.wait_for_timeout(800)
        check(f'[{nv}] quitter la démonstration', pg.is_visible('#ecran-connexion') and pg.is_visible('.lien-demo'))
        if nv == 'tel':
            pg.fill('#code', 'nan-test'); pg.click('#btn-connexion'); pg.wait_for_timeout(1200)
            larg_page = pg.evaluate('document.documentElement.scrollWidth')
            check(f'[tel] pas de débordement horizontal ({larg_page})', larg_page <= 390)
            pg.screenshot(path='/home/claude/carte-test/tel.png')
        else:
            pg.fill('#code', 'nan-test'); pg.click('#btn-connexion'); pg.wait_for_timeout(1200)
            pg.screenshot(path='/home/claude/carte-test/ordi.png')
        ctx.close()
    b.close()
srv.terminate()
print('Erreurs de page :', errs)
print(f'{sum(res)}/{len(res)} vérifications réussies')
