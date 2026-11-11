# Nuit Calme — V2.10 (signets & historique des passages)

Chantiers n° 8 et n° 9 de la feuille de route, livrés ensemble : le
marque-page pour poser un repère à un endroit précis, et l'historique
des passages pour retrouver par où la lecture est passée — sans rien
avoir à marquer soi-même. Les deux fonctionnent en EPUB comme en PDF,
et le reste de l'application est inchangé.

## Nouveautés

### 1. Le marque-page (n° 8)
Nouveau bouton dans la barre du haut, les deux formats :
- **un clic pose un signet** à l'endroit exact — en EPUB, le passage
  précis (CFI) ; en PDF, la page ;
- **un second clic le retire** : le bouton se remplit d'or tant qu'un
  signet est « ici » — en PDF, sur la même page ; en EPUB paginé, dans
  la même section ET sur la même page affichée (le pourcentage
  d'epub.js n'est pas assez fiable pour un test au grain fin) ; en
  défilement vertical, toute la section compte. Deux signets dans une
  même section restent possibles ; le bouton bascule sur celui de
  l'endroit ;
- la **touche B** fait la même chose sans quitter le texte des yeux.

Chaque pose est confirmée par un toast qui rappelle où se trouve la
liste : dans le sommaire.

### 2. Tous les signets dans le tiroir Sommaire
Le tiroir Sommaire devient « Sommaire & signets » : la section
Signets, en tête, liste les repères dans l'ordre du livre avec leur
libellé (chapitre · page en EPUB, page en PDF) et leur date. Un clic
sur une ligne y retourne à l'endroit exact ; une petite croix retire
le signet sans quitter le tiroir. En PDF sans sommaire intégré, la
grille de pages affiche un point doré sur chaque page signetée.
Tant qu'aucun signet n'existe, une astuce discrète rappelle le
marque-page.

### 3. L'historique des passages (n° 9)
Nouveau bouton (l'horloge fléchée) et nouveau tiroir : « Passages ».
Sans aucune action de votre part, **chaque endroit où la lecture se
pose 8 secondes ou plus s'y inscrit** — horodaté, avec l'endroit
(Chapitre 3 · page 2 / Page 12) et la durée du séjour. Feuilleter
vite ne laisse aucune trace : c'est la lecture, pas la navigation.
Chaque ligne est cliquable et y retourne ; les entrées sont groupées
par jour (Aujourd'hui, Hier, puis la date longue). Un bouton Effacer
(demi-mot : il demande confirmation) vide l'historique du livre.

### 4. Une mémoire qui reste raisonnable
L'historique d'un livre est borné à **150 passages** : le plus ancien
sort quand le plein est atteint, rien ne grossit sans fin. Le temps
passé onglet caché ne compte pas dans les durées ; fermer l'onglet
clôture proprement la session. Et tout disparaît avec le livre :
supprimer un livre de la bibliothèque emporte ses signets et son
historique (purge en cascade, comme les annotations).

### 5. Et un livre d'exemple réparé au passage
Les tests de cette version ont révélé un défaut ancien du livre
fourni en exemple, « Contes en pleine lune » : l'attribut `xmlns`
y était déclaré **deux fois** sur `<html>` (SVG + XHTML) dans les
cinq chapitres — le parseur rejetait le fichier et epub.js affichait
une page d'erreur XML à la place du texte. Les chapitres sont
réparés et s'affichent enfin ; le livre sert désormais de banc
d'essai réel pour les signets et l'historique EPUB.

## Sous le capot
- Base de données **v5** : deux magasins nouveaux, `bookmarks` et
  `history` (index `bookId`). La montée de version est automatique
  pour les bibliothèques existantes ; aucune donnée ancienne n'est
  touchée.
- Le suivi des positions vit dans `reader.js` (un seul point pour les
  deux formats) : les contrôleurs EPUB/PDF exposent un instantané de
  position (`captureBookmark`) et un saut (`gotoBookmark`) — le reste
  (bascule, liste, journal) est partagé.
- Barre du haut resserrée sur les petits écrans (boutons 30 px sous
  640 px) ; le plein écran, doublonné par les navigateurs mobiles,
  cède sa place sous 480 px.
- Aucune dépendance ajoutée ; `vendor/` inchangé.

## Fichiers touchés
`js/idb.js` (v5, magasins + API + cascade), `js/reader.js` (bouton
marque-page, section signets du tiroir, tiroir Passages, suivi des
positions, touche B), `js/epub-reader.js` et `js/pdf-reader.js`
(instantané + saut de signet), `js/util.js` (heure, durée, libellés
de jour), `index.html` (deux boutons, méta), `css/style.css`
(signets, passages, cellules marquées, responsive).

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Base v5 : magasins créés, montée de version sans erreur | ✅ |
| PDF : pose du signet → bouton doré, toast, enregistrement en base | ✅ |
| PDF : seconde pose page 3 → 2 signets ; bouton inactif ailleurs | ✅ |
| PDF : re-clic sur une page signetée → le signet est retiré | ✅ |
| Tiroir : section Signets listée, saut à la page exacte | ✅ |
| Tiroir : croix de suppression (la grille de pages, réservée aux PDF sans sommaire, n'est pas exercée par ce livre d'exemple qui en a un) | ✅ |
| Touche B : pose puis retrait | ✅ |
| Persistance : signets toujours là après rechargement | ✅ |
| Historique : position tenue ≥ 8 s → entrée avec heure et durée | ✅ |
| Historique : navigation rapide (< 8 s) → aucune entrée | ✅ |
| Historique : clic → retour au passage ; Effacer (confirmé) → vide | ✅ |
| EPUB : signet avec libellé de chapitre, saut exact, historique | ✅ |
| Suppression d'un livre → signets et historique purgés (cascade) | ✅ |
| Régressions : couche texte, copie, tourne-page, recherche, EPUB (suite V2.9 rejouée : 20/20) | ✅ |
| Journal d'erreurs runtime + console | ✅ vides |

## Prochaines étapes
N° 5 — surlignage PDF (la couche texte de la V2.9 attend ses
pastilles). N° 6 — zoom ajuster + pan. N° 7 — vignettes de navigation.
