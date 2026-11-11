# Nuit Calme — V2.20 (édition des métadonnées)

Chantier n° 16 de la feuille de route : **corriger la fiche d'un
livre**. Les métadonnées embarquées sont parfois bancales — surtout
celles des PDF (« microsoft word - rapport final », auteur vide,
première page sans grâce) — et jusqu'ici rien ne permettait d'y
toucher. Désormais, un crayon sur chaque carte ouvre la fiche :
titre, auteur, couverture — et le fichier du livre, lui, reste
intact.

## Nouveautés

### 1. Le crayon de la carte
À côté du ⋮ de rangement et de la corbeille, un troisième bouton
flottant — le crayon — apparaît au survol de chaque carte. Un clic
ouvre la modale « Modifier la fiche du livre », préremplie avec
l'état actuel, le titre sélectionné d'avance pour un replacement
rapide. Entrée enregistre, Échap et Annuler s'en vont sans rien
écrire, un clic sur le fond referme de même.

### 2. La couverture, trois gestes
L'aperçu de couverture vit à gauche de la modale, et il est vivant :
- **Changer l'image…** — une image choisie est décodée puis contenue
  proprement (640 px au grand côté, JPEG) ; un PNG transparent ne
  devient pas noir, il prend la matière des cartes sans image ;
- **Retirer l'image** — retour aux initiales élégantes du titre,
  affichées à la frappe dans l'aperçu quand il n'y a pas d'image ;
- **Rétablir l'origine** — la jaquette re-sort du fichier stocké :
  la couverture déclarée par l'EPUB, la première page rendue pour le
  PDF. Le bouton raconte ce qu'il fait (« Extraction… »), et si le
  fichier n'en propose pas, un toast le dit sans rien casser.

### 3. Toute la bibliothèque suit la fiche corrigée
Titre et auteur corrigés irriguent tout ce qui les lisait déjà : la
grille, la **recherche** (le nouveau titre répond, l'ancien ne
répond plus), le **tri** par titre ou auteur, le titre affiché en
haut du lecteur à la prochaine ouverture. L'enregistrement écrit une
seule fiche — les statistiques, signets, annotations et la position
de lecture ne sont pas concernés.

## Sous le capot
- `library.js` : état d'édition borné à la modale (`editBookId`,
  `editCoverState` untouched/set/removed, compteur `editExtractSeq`
  qui rend inoffensif le résultat d'une extraction en vol après une
  fermeture) ; `openBookEdit` / `closeBookEdit` / `renderEditCover` /
  `shrinkImage` / `restoreOrigCover` / `saveBookEdit` ; le crayon
  rejoint la carte entre le ⋮ et la corbeille.
- Le rendu de la première page PDF est **factorisé** dans
  `renderPdfCover(doc)` — l'import et la réextraction de la jaquette
  partagent exactement le même geste, plus de copie.
- `closeBookEdit` rend le voile (`#modal-backdrop`) à la grille —
  un premier fil de vérification a attrapé la modale fermée mais le
  fond resté au-dessus, qui avalait les clics.
- Échap et le clic sur le fond arbitrèrent dans l'ordre : fiche
  d'édition, puis fenêtres de groupes, puis menu de rangement.
- Aucune dépendance ajoutée ; `vendor/` inchangé ; aucun changement
  du lecteur ni du schéma de base (le titre, l'auteur et la
  couverture vivaient déjà dans l'enregistrement du livre).

## Fichiers touchés
`js/library.js` (crayon, modale, réextraction, factorisation du
rendu de page), `index.html` (modale `#book-edit`, champ image,
description), `css/style.css` (crayon de carte, fiche d'édition et
sa variante mobile en colonne), `README.md` (caractéristique).

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Chaque carte porte son crayon ; la modale s'ouvre préremplie, titre sélectionné | ✅ |
| Aperçu : initiales du titre sans image, suivies à la frappe (N → VM) | ✅ |
| Échap et Annuler referment sans rien écrire | ✅ |
| Entrée dans le champ auteur enregistre et referme | ✅ |
| Titre et auteur corrigés : grille, base, fichier intact | ✅ |
| La recherche suit : « veille » trouve, l'ancien titre ne répond plus | ✅ |
| Titre corrigé survivant au rechargement (IndexedDB) | ✅ |
| Image choisie : aperçu immédiat, JPEG contenu, 300 × 450 gardés | ✅ |
| La carte affiche la nouvelle couverture | ✅ |
| « Retirer l'image » : aperçu aux initiales, base nettoyée, carte fidèle | ✅ |
| « Rétablir l'origine » (PDF) : la page 1 revient en JPEG | ✅ |
| « Rétablir l'origine » (EPUB) : la jaquette déclarée revient ; Annuler n'écrit rien | ✅ |
| Titre vide : repli « Sans titre », livre cherchable | ✅ |
| Clic sur le fond : modale refermée, rien n'a été écrit | ✅ |
| Import EPUB + PDF après factorisation : métadonnées et couvertures intactes | ✅ |
| Menu ⋮ de rangement et tri par titre : régressions nulles | ✅ |
| Aucune exception de page sur toute la session | ✅ |

**50/50 vérifications vertes** (suite `scripts/test-v2.20.js`), plus
régressions rejouées : **53/53** (V2.14 statuts & groupes), **31/31**
(V2.15 import en masse) et **40/40** (V2.16 recherche & tri).
Contrôle visuel : crayon au survol entre ⋮ et corbeille, fiche
équilibrée avec jaquette réextraite comme avec initiales, lisible en
largeur de téléphone (colonne).

## Prochaines étapes
Export des citations — dans l'ordre de la feuille de route.
