# geoquestUiTest

Le repo pour tester les différents designs de GeoQuest (le jeu de `geoquest-monorepo`).

**Ouvrir sur iPhone (Safari)** : `https://erwannn007.github.io/geoquestUiTest/`, puis choisir une UI dans la liste.
Astuce : Partager → « Sur l’écran d’accueil » pour l’ouvrir en plein écran comme une app.

## Les UI

| # | Nom | Ambiance |
|---|---|---|
| 1 | Carnet d’explorateur | l’UI actuelle du jeu (référence) |
| 2 | Nuit polaire | carte sombre, verre dépoli, radar cyan |
| 3 | Vieux grimoire | parchemin, sceaux de cire, rose des vents |
| 4 | Pixel Arcade | 8-bit, héros en sprite, bordures épaisses |
| 5 | Néon 84 | synthwave, néons, soleil rétro |
| 6 | Bonbon | pastel, bulles, petit blob qui rebondit |
| 7 | Atlas suisse | minimalisme noir / blanc / rouge |
| 8 | Expédition | safari kaki, tampons, boussole de terrain |
| 9 | Tactique | HUD vision nocturne, cibles, boutons en rail à gauche |
| 10 | Verre liquide | style iOS, barre d’outils flottante en bas, notifications façon Dynamic Island |
| 11 | Bande dessinée | trames, bulles de dialogue, boutons en bas à gauche, menu « GO! » |
| 12 | Carnet de voyage | aquarelle, post-it, tampons empilés en bas à droite |
| 13 | Art déco | noir et or, score centré, rail de losanges à droite |

Les UI 9 à 13 changent aussi la disposition des boutons (`css/themes-nouveaux.css`).

Chaque UI change : le point du joueur, les pins des lieux, les couleurs de la carte, le HUD, le bouton menu,
la fiche du lieu, les cartes à collectionner (face, dos, animation de tirage), le toast, le profil et le catalogue.

## Chartes graphiques

Le dossier [`ui design/`](ui%20design/) contient une charte par UI (même structure que l’exemple Culture Go) :
emblème, couleurs, typographie, interface, mouvement.

- `ui design/pdf/` : les 13 chartes en PDF (une page longue chacune)
- `ui design/apercus/` : les mêmes en PNG
- `ui design/charte.html?theme=<id>` : la version web, rendue avec le vrai CSS du jeu
- `ui design/charts.js` : les textes et palettes de chaque charte

## Ce qui est repris du jeu

Uniquement ce qui existe dans `apps/mobile` et `packages/shared` : écran de permission, HUD (score, adresse,
pas, solde, recentrer, recharger, debug), fiche du lieu et ses états de tirage (gratuit, payant 500 / 1 000 / 2 000 pas,
plafond, trop loin), tirage avec raretés et points identiques aux règles partagées, amélioration / doublon / remboursement 25 %,
menu Profil / Catalogue, catalogue des 250 pays et des villes GeoNames, toasts de déblocage, panneau de debug.

C’est une démo web : la position est simulée sur l’île de la Cité (Paris) avec 15 lieux OSM.
🐞 → « Téléporter au toucher » ou les lieux prédéfinis pour se déplacer.

## Structure

```
index.html        liste des UI
play.html         le jeu (?theme=<id>)
js/themes.js      les UI : couleurs de carte, polices, raretés, symboles
js/data.js        règles (copie de packages/shared) + lieux de démo
js/game.js        écrans et logique
css/base.css      structure commune (= UI actuelle)
css/themes.css    une section par UI (1 à 8)
css/themes-nouveaux.css  UI 9 à 13 (style + disposition)
data/cities.json  villes GeoNames (CC-BY 4.0)
```

Ajouter une UI : une entrée dans `js/themes.js` + un bloc `[data-theme='<id>']` dans `css/themes.css`.

Données © contributeurs OpenStreetMap (ODbL), GeoNames (CC-BY 4.0), tuiles OpenFreeMap, résumés Wikipédia.
