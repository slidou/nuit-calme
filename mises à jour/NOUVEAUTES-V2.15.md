# Nuit Calme — V2.15 (import en masse)

Chantier n° 3 de la feuille de route : nourrir la bibliothèque **d'un
coup**. On glisse plusieurs livres à la fois — ou un dossier entier —
au lieu de les passer un par un, et l'import raconte ce qu'il fait :
une seule pastille de progression, une bibliothèque qui se remplit au
fil de l'eau, un récapitulatif final qui dit ce qui a échoué — et
pourquoi.

## Nouveautés

### 1. Plusieurs livres d'un coup, dossier compris
Trois portes d'entrée, un même traitement en masse :
- le **dépôt multi-fichiers** (plusieurs EPUB/PDF lâchés ensemble) ;
- la **sélection multiple** dans la boîte de dialogue du bouton « + »
  (l'attribut `multiple` est là, gardé et testé) ;
- le **dossier entier glissé** : parcouru en profondeur, sous-dossiers
  compris — seuls les EPUB et PDF remontent, le reste (jaquettes,
  fichiers texte, données de calibre) est ignoré en silence. Un
  dossier sans aucun livre le dit clairement (« Aucun fichier EPUB ni
  PDF dans ce dépôt ») au lieu d'une erreur absurde fichier par fichier.

### 2. Une pastille au lieu de quarante toasts
Avant : deux toasts par livre, et le bac n'en garde que trois — un lot
de dix livres inondait l'écran sans rien dire de sûr. Maintenant : une
seule pastille mise à jour en place (« Import en masse — 3/12 :
« livre.epub » »), puis un **récapitulatif final** :
- « Import en masse terminé — 12 livres ajoutés. » ;
- « 9 livres ajoutés — 3 en échec : a.pdf (stockage saturé) ;
  b.epub (protégé — DRM ou mot de passe) ; c.epub (fichier illisible) ».
Les motifs sont courts et honnêtes : stockage saturé, DRM ou mot de
passe, délai dépassé, fichier illisible, format non pris en charge.

### 3. La bibliothèque se remplit au fil de l'eau
Pendant un grand import, chaque livre réussi **pose sa carte
immédiatement** (étiquette « À lire », compteurs des filtres à jour) —
pas besoin d'attendre la fin du lot pour voir où on en est.

### 4. Les messages à l'unité restent les messages d'avant
L'import d'un **seul** fichier garde le comportement exact de la
V2.14 : « Import de… » puis « ajouté à la bibliothèque », et les
messages d'échec détaillés (phrase complète sur le stockage saturé,
mention DRM). Le traitement en masse ne s'applique qu'à partir de
deux fichiers.

## Sous le capot
- `importFiles` distingue l'unitaire (inchangé) du lot : en masse, les
  imports passent « silencieux » (pas de toast par livre), la pastille
  fait le récit, et `refresh()` complet n'intervient qu'à la fin.
- `importEpub`/`importPdf` renvoient la fiche enregistrée : la grille
  s'allonge sans relire la base à chaque livre.
- Les entrées `webkitGetAsEntry` sont saisies **pendant** l'événement
  de dépôt (dataTransfer est neutralisé dès que le gestionnaire rend
  la main), puis parcourues : lecture des dossiers **par lots** (les
  navigateurs les rendent par 100), bornée à profondeur 8 et 600
  livres — une arborescence immense ne fige jamais la page.
- Sans l'API d'entrées (navigateur ancien), repli sur la liste plate
  des fichiers, exactement comme avant.
- `NC.toastHold` (util.js) : même apparence qu'un toast, mais il reste
  tant qu'on ne le congédie pas — `update()` rafraîchit le texte en
  place et le replace en queue du bac (jamais évincé), `done()` le
  change en récapitulatif. Aucun CSS nouveau.
- Crochets de vérification `_onDrop` / `_walkEntries` exposés par la
  bibliothèque — même philosophie que `NC.reader._state()`.
- Aucune dépendance ajoutée ; `vendor/` inchangé.

## Fichiers touchés
`js/library.js` (import en masse, parcours des dossiers déposés,
pastille de progression, récapitulatif, grille vivante),
`js/util.js` (toast persistant `NC.toastHold`), `index.html` (texte de
l'overlay de dépôt : « plusieurs d'un coup, dossier compris »),
`README.md` (caractéristique « Import en masse »).

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Import simple d'un EPUB : toasts individuels, carte, état vide masqué | ✅ |
| Boîte de dialogue : attribut `multiple` présent | ✅ |
| Lot de 4 (2 livres + epub corrompu + .txt) : pastille « Import en masse — n/N » | ✅ |
| Grille vivante : cartes posées au fil des succès, pas à la fin | ✅ |
| Récapitulatif « 2 livres ajoutés — 2 en échec » avec motifs par fichier | ✅ |
| Comptages exacts en base et à l'écran après le lot | ✅ |
| Mauvais fichier à l'unité : message d'origine intact, rien d'importé | ✅ |
| Dossier glissé (lots simulés) : EPUB/PDF remontent, .jpg/.txt ignorés | ✅ |
| Récapitulatif « 2 livres ajoutés » du dossier | ✅ |
| Dossier sans livre : message clair, rien d'importé | ✅ |
| Dépôt mixte (fichier + dossier) : les deux traités | ✅ |
| Repli sans API d'entrées : liste plate importée | ✅ |
| Arborescence de profondeur 12 : bornée, rien ne fige, rien d'importé | ✅ |
| Compteurs des puces (Tous 8, À lire 8), pied de page « 8 livres » | ✅ |
| Étiquette « À lire » sur les cartes neuves | ✅ |
| Rechargement : les 8 livres reviennent, journal d'erreurs vide | ✅ |
| Aucune exception de page sur toute la session | ✅ |

**31/31 vérifications vertes** (suite `scripts/test-v2.15.js`,
dépôts de dossiers simulés via les crochets — l'API d'entrées n'est
pas constructible hors d'un vrai glisser).

## Prochaines étapes
Vignettes de navigation, export des citations, recherche et tri de la
bibliothèque — dans l'ordre de la feuille de route.
