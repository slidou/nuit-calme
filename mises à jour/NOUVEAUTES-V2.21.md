# Nuit Calme — V2.21 (export des citations)

Chantier n° 11 de la feuille de route : **reprendre ses citations hors
de la liseuse**. Les soulignages et notes restent dans le navigateur ;
désormais, un bouton « Exporter » les remet en ordre de lecture, les
montre une dernière fois dans leur plus bel appareil, puis les
télécharge en **Markdown** ou en **texte brut** — un fichier épuré,
prêt pour Obsidian, Notion, Bear, un carnet de lecture ou une simple
archive.

## Nouveautés

### 1. Le bouton du tiroir
Dans le tiroir « Soulignages & notes », à côté de la croix, un
discret **« Exporter »** — il n'existe que dans ce tiroir, et
disparaît quand le livre n'a aucune citation. Un clic ouvre la modale
« Exporter les citations ».

### 2. L'aperçu, la dernière relecture
La modale reprend chaque citation **en Cormorant italique**, filée à
sa couleur (le filet de gauche et la pastille reprennent la teinte du
soulignement), sous l'entête de son chapitre (EPUB) — le PDF, sans
chapitres, reste un fil continu aligné par page. Chaque fiche porte
sa catégorie, son lieu (« Page 12 », « II. Le Corbeau et le
Renard ») et sa date ; les notes rédigées s'affichent sous leur
passage, introduites par « Ma note — ». Le sous-titre résume :
*« Contes en pleine lune — 2 citations · 1 note »*.

### 3. Les deux fichiers
- **Markdown (.md)** — titre en H1, auteur en italique, ligne
  d'en-tête datée et signée (« 2 citations · 1 note — exporté le …
  depuis Nuit Calme »), citations en bloc `>`, chapitres en `##`
  séparés d'un trait, attribution en em-dash (`— Idée · Page 2 · le
  3 nov. 2026`), notes en « **Ma note —** … ».
- **Texte brut (.txt)** — le même contenu sans syntaxe : titre en
  capitales, doubles filets `═`, chapitres soulignés d'un filet fin
  `─`, citations entre guillemets français « … », attribution en
  retrait. Lisible partout, sur n'importe quoi.

Les deux noms de fichier suivent le titre du livre :
`citations-contes-en-pleine-lune.md`. La modale reste ouverte après
un téléchargement — les deux formats se prennent en une session ;
Échap, Annuler ou un clic sur le voile referment.

### 4. L'ordre de la lecture, pas celui des frappes
Les citations sont remises dans l'ordre du livre : PDF par page
croissante, EPUB par section puis position dans la section (les
annotations migrées portent leurs décalages ; les anciennes retombent
sur l'ordre de création). Les entêtes de chapitres sont résolues au
moment de l'export depuis le CFI de chaque annotation — le sommaire
de l'éditeur d'abord, repli « Chapitre N » si le livre n'en a pas.

## Sous le capot
- `reader.js` : section « Export des citations » — `exportLocation`
  (lieu lisible), `orderForExport` (ordre de lecture), `groupForExport`
  (chapitres EPUB / fil continu PDF), `buildMarkdown` / `buildTxt`
  (les deux appareils de fichier), `renderExportPreview` (l'aperçu),
  `openExportPop` / `closeExportPop` / `downloadExport`. Le bouton
  rejoint l'en-tête du tiroir (affiché seulement pour « notes » et
  seulement s'il y a quelque chose à exporter) ; `closeDrawer` le
  retire à chaque fermeture.
- `epub-reader.js` : `ctl.chapterLabelFor(cfi)` — la résolution de
  chapitre de `chapterLabel()`, mais pour n'importe quel CFI ;
  numérotation humaine en repli (le premier feuillet = chapitre 1).
- La modale a **son propre voile** (`#export-backdrop`) — jamais
  celui de la bibliothèque, que l'édition des fiches (V2.20) rend à
  la grille. Panneau modal au clavier : Échap le referme, et aucune
  touche n'agit derrière lui (le livre ne tourne pas de page) ;
  l'arbitrage Échap devient export → mémo → catégorie → tiroir.
- Aucune dépendance ajoutée ; `vendor/` inchangé ; aucun changement
  du schéma de base — l'export ne lit que les annotations existantes
  et n'écrit rien.

## Fichiers touchés
`js/reader.js` (module d'export, bouton du tiroir, garde clavier),
`js/epub-reader.js` (`chapterLabelFor`), `index.html` (bouton, modale
`#export-pop`, voile, description), `css/style.css` (voile, carte
centrée réutilisant `popInKbd`, aperçu `.xg-*`, rangée d'actions de
l'en-tête du tiroir), `README.md` (caractéristique).

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Chargement initial sans erreur ; PDF importé | ✅ |
| Sans citation : pas de bouton Exporter, message vide intact | ✅ |
| Avec 3 annotations : le bouton apparaît ; filtres du tiroir intacts | ✅ |
| La modale s'ouvre ; sous-titre « 2 citations · 1 note » | ✅ |
| Aperçu : 3 fiches, pastilles et filets aux couleurs, note visible | ✅ |
| PDF : aucun entête de chapitre ; ordre des pages respecté (2 → 5) | ✅ |
| Markdown : nom, H1, blocs « > », attribution, note, pas de `##` | ✅ |
| TXT : nom, titre en capitales, filets, guillemets, note, retrait | ✅ |
| La modale reste ouverte après téléchargement (les deux formats) | ✅ |
| « B » n'agit pas derrière le panneau (modal au clavier) | ✅ |
| Échap referme l'export puis le tiroir, dans cet ordre | ✅ |
| Clic sur le voile : refermé, rien d'écrit | ✅ |
| EPUB : `chapterLabelFor` résout un CFI réel (« I. Au seuil de la nuit ») | ✅ |
| Aperçu EPUB : entêtes de chapitres dans l'ordre de lecture | ✅ |
| Markdown EPUB : `##` des chapitres + séparateur `---` | ✅ |
| TXT EPUB : chapitres en capitales, note rédigée | ✅ |
| Retour bibliothèque : les deux livres sont là, rien n'a bougé | ✅ |
| Aucune exception de page sur toute la session | ✅ |

**54/54 vérifications vertes** (suite `scripts/test-v2.21.js`).
Contrôle visuel : carte centrée, filets aux couleurs, lisible à la
largeur d'un téléphone ; entêtes de chapitres dorées sur l'EPUB.

## Prochaines étapes
Dans l'ordre de la feuille de route — le minuteur de veille (n° 20)
est écarté sur décision du lecteur.
