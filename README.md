# Duramen · Carte des grumes

Carte des grumes de l'application Duramen, pour les communes de Nantes Métropole et pour Tronc Commun.
Application à part, **en lecture seule** sur la base de Duramen : elle n'écrit jamais rien.

Adresse : https://tronccommun-duramen.github.io/cartographie/

## Qui voit quoi

- **Une commune** se connecte avec son code d'accès (le même que dans l'app) : elle voit ses grumes.
- **Tronc Commun** se connecte avec son code de lecture (table `acces_lecture`) : il voit toutes les communes.
- Le code gardé sur l'appareil est revérifié à chaque ouverture : un code coupé dans la base ne donne plus accès à rien.

## Ce que montre la carte

- Un point par grume qui a une position GPS. Couleur de l'essence au centre ; cercles autour : or = exceptionnelle, ardoise = mauvais état, blanc = débitée.
- Critères : essence, cause (avec le nom de la tempête), état, dates, commune (Tronc Commun).
- Recherche : numéro, essence, rue ou quartier (colonne `lieu`, remplie par la base). Pour un parc, « Chercher sur la carte » demande son contour à OpenStreetMap et montre les grumes qui sont dedans.
- Liste repliée sous la carte. Les grumes sans position sont comptées sous la carte.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | structure de la page |
| `carte.css` | présentation (aucune couleur d'essence en dur) |
| `carte.js` | connexion, lecture de la base, carte, critères |
| `contours.js` | contours des 24 communes |
| `logo-cartographie.png` | logo Duramen Cartographie |
| `tests/test_carte.py` | essais automatiques dans un navigateur, base imitée |

**Couleurs et essences** : la page charge `../duramen/theme.css` et `../duramen/core.js`, ceux de l'app (même site GitHub Pages). Un changement de couleur dans l'app se reporte donc tout seul sur la carte.

## Lieu de chaque grume (dans la base)

Colonne `grumes.lieu` : « rue · quartier », retrouvée par la base à partir du point GPS (OpenStreetMap), une fois, environ une minute après l'arrivée de la grume. Réveil `completer-lieux` (toutes les 20 s, une demande à la fois), suivi dans la table `lieux_suivi`. Si la position est replacée au bureau, le lieu est recherché à nouveau.

Fonds de carte : IGN Géoplateforme (gratuit). Noms de lieux : © contributeurs OpenStreetMap.
