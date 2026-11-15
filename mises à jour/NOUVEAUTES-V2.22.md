# Nuit Calme — V2.22 (packs de livres)

Chantier n° 17 de la feuille de route : **des collections posées par
l'hébergeur du site, prêtes à avaler**. Le site reste 100 % local et
sans serveur : à côté de `index.html`, un dossier `packs/` reçoit des
packs — un dossier de livres ou une archive `.zip` — et la liseuse
ouvre un espace « Packs de livres » où l'on parcourt ces collections,
reconnaît ce qu'on possède déjà, et importe un pack entier ou livre
par livre. Les copies rejoignent la bibliothèque comme des livres
ordinaires ; rien n'est jamais lié au site.

## Nouveautés

### 1. La porte d'entrée
Dans la bibliothèque, à côté de « Ajouter un livre », un bouton
**« Packs de livres »** — et dans l'état vide, un « Découvrir les
packs de livres ». La vue ouverte respire la même charbon & doré :
entête avec retour, tagline, puis les **cartes de packs** — icône
rayonnage, titre en Cormorant, description, et la ligne métrique
(« 2 livres · 84 Ko » ou « Archive .zip · 12 Mo »).

### 2. Le parcours d'un pack
Un clic ouvre le détail : sous-titre compté (« 2 livres · 84 Ko · 1
déjà dans votre bibliothèque »), description posée par l'hébergeur,
bouton **« Tout importer (N) »**, et la grille des livres — la même
silhouette que la bibliothèque. Chaque couverture est **extraite à
la volée** (titre, auteur, jaquette relus dans le fichier, comme à
l'import classique) : la carte naît en « Lecture… » filet doré
animé, puis prend sa vraie peau. Un pack `.zip` télécharge d'abord
l'archive — une barre de progression lui est faite — puis la
décompresse dans le navigateur (JSZip, déjà embarqué) et aperçoit
ses EPUB/PDF, en ignorant les entrées d'archive parasites
(`__MACOSX`, fichiers cachés).

### 3. L'import, bien élevé
- **Livre par livre** — un « Ajouter » discret en bas de couverture ;
  la carte passe « Ajout… » puis « Ajouté ✓ », un toast le confirme.
- **Tout importer** — pastille « Import du pack — 3/12 » comme
  l'import en masse (V2.15), récapitulatif final (ajoutés, échecs et
  pourquoi).
- **Les doublons n'entrent pas deux fois** — un livre dont le titre
  (et l'auteur quand il est connu) rejoint une fiche existante
  affiche le badge « Déjà là » et n'a plus de bouton ; « Tout
  importer » les saute et le dit. La comparaison plie la casse et
  les accents — « Éclats » retrouve « éclats ».
- Les livres importés sont des copies complètes : statut, groupes,
  soulignages, tout fonctionne comme pour un import ordinaire, et la
  grille de la bibliothèque vit au fil de l'eau derrière la vue.

### 4. Côté hébergeur : déposer, pousser, c'est tout
- Le dossier **`packs/`** accueille les collections (dossier ou
  `.zip`, les deux formats), avec son **`packs/LISEZ-MOI.md`**.
- Le workflow **`.github/workflows/packs.yml`** reconstruit
  `packs/index.json` à chaque poussée qui touche `packs/` : liste
  des fichiers et tailles recalculées, **titres et descriptions
  écrits à la main conservés**, commit « packs : mise à jour de
  l'index » seulement s'il y a du neuf. Aucun script à lancer —
  le dossier est le seul geste.
- Un **pack de démonstration** (`classiques-de-la-nuit/`, les deux
  livres d'exemple) montre le rendu dès la mise en ligne ; il
  s'efface d'un geste quand les vrais packs arrivent.

### 5. Les détours prévus
- Ouvert en fichier local (`file://`), le navigateur interdit la
  lecture du dossier : la vue l'explique gentiment au lieu de
  planter. Hors-ligne : « Impossible de joindre le site » + bouton
  Réessayer. Index absent : un état vide qui rappelle le geste
  (déposer dans `packs/`, pousser).
- Un livre illisible dans un pack ne casse rien : sa carte passe
  « Illisible / Échec », le reste du pack continue.
- Quitter la vue (ou changer de pack) pendant un aperçu en vol :
  les promesses périmées sont ignorées — rien n'écrit dans le mauvais
  affichage, l'archive et les aperçus sont rendus au ramasse-miettes.

## Sous le capot
- `js/packs.js` (nouveau) : la vue entière — `fetchManifest` (404 =
  « pas encore de packs », pas une erreur), liste, détail, aperçu
  progressif, session annulable par jeton global, `addOne` /
  `importAll`, détection des doublons.
- `js/library.js` : l'extraction des métadonnées sort de l'import
  classique (`peepEpub` / `peepPdf` / `peepFile` — même travail,
  sans rien stocker) ; `importOne(file, meta)` accepte une fiche
  déjà lue (pas de double lecture) ; `librarySignatures` /
  `looksKnown` portent la comparaison de doublons ; `shortReason`
  est exporté pour les récits d'échec des packs.
- `index.html` : bouton d'entrée, vue `#view-packs` (liste + détail),
  bouton de l'état vide, description mise à jour.
- `css/style.css` : la vue rejoint la règle des vues fixes ; cartes
  de packs, états d'aperçu (`pk-load`), d'ajout (`pk-add`,
  `pk-added`), badges « Déjà là » / « Échec », barre de progression
  d'archive ; responsive jusqu'au téléphone.
- **Aucun changement du schéma de base** — un pack n'écrit que des
  livres ordinaires ; `vendor/` inchangé ; aucune dépendance neuve.

## Fichiers touchés
`js/packs.js` (nouveau), `js/library.js` (peep/importOne/doublons),
`js/app.js` (amorçage), `index.html`, `css/style.css`,
`packs/index.json`, `packs/LISEZ-MOI.md`,
`packs/classiques-de-la-nuit/` (démonstration),
`.github/workflows/packs.yml`, `README.md`.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Chargement initial sans erreur ; bouton « Packs de livres » présent | ✅ |
| Index 404 intercepté : état vide expliqué, pas d'exception | ✅ |
| La liste montre le pack de démo (titre, « 2 livres », taille) | ✅ |
| Détail du pack : 2 cartes, couvertures réelles, titres d'origine | ✅ |
| Sous-titre compté ; « Tout importer (2) » actif | ✅ |
| Import à l'unité : toast, carte « Ajouté ✓ », bibliothèque remplie | ✅ |
| « Tout importer » : pastille « Import du pack — n/N », récapitulatif | ✅ |
| Réouverture du pack : badges « Déjà là », plus de boutons, import tout inerte | ✅ |
| La bibliothèque derrière : 2 livres, fiches correctes | ✅ |
| Pack `.zip` de test : archive téléchargée, décompressée, 2 cartes, import OK | ✅ |
| Retour liste / retour bibliothèque : états propres, pas de fuite | ✅ |
| Échap : détail → liste → bibliothèque, dans cet ordre | ✅ |
| Aucune exception de page sur toute la session | ✅ |

**Contrôle visuel** : cartes de packs posées, couvertures extraites,
badges lisibles à la largeur d'un téléphone.

## Prochaines étapes
Dans l'ordre de la feuille de route — le minuteur de veille (n° 20)
reste écarté sur décision du lecteur.
