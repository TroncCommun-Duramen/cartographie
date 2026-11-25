# CLAUDE.md — Duramen · Carte des grumes

Application à part de Duramen (voir le dépôt `TroncCommun-Duramen/duramen`, son CLAUDE.md et ses Docs). Le porteur n'est pas programmeur : expliquer chaque action en français simple, avec le pourquoi.

## Règles

- **Lecture seule** : la carte n'écrit jamais dans la base. Elle lit `grumes` et `extractions` avec l'en-tête `x-commune-code`, ou `tc_grumes()` et `tc_sorties()` avec `x-code-lecture`.
- **Couleurs** : jamais de couleur d'essence en dur. La page charge `../duramen/theme.css` (variables `--ec-…`) et `../duramen/core.js` (`DuramenCore.ESSENCES_INFO[essence].color`).
- Pas de `style="..."` dans le HTML ni dans le JS : des classes dans `carte.css`.
- Mêmes repères que l'app : boutons de 44 px minimum, police Outfit, indigo réservé à ce qu'on touche.
- La carte montre, elle n'interprète pas : pas de bilan ni de graphique (c'est la synthèse).
- OpenStreetMap : une demande seulement au clic, jamais à chaque lettre tapée.
- Code sur une branche, fusion dans `main` après validation du porteur. Documentation directement sur `main`.
- **Version** : après toute modification, augmenter le numéro `?v=` de `carte.css`, `carte.js`, `contours.js` (dans `index.html`) et `demo.js` (dans `carte.js`). Sans ça, les navigateurs gardent l'ancienne version jusqu'à 10 minutes.
- Essais : `tests/test_carte.py` (Playwright, base imitée) avant chaque livraison.
