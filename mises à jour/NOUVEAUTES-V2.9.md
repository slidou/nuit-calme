# Nuit Calme — V2.9 (sélection et copie de texte dans les PDF)

Chantier n° 4 de la feuille de route, construit sur la V2.8.1 (audit &
corrections). C'est la brique de fondation du PDF : la sélection et la
copie sont désormais possibles sur les pages, et la même couche servira
d'ancrage au futur surlignage PDF (n° 5). Tout le reste est inchangé.

## Nouveautés

### 1. La couche texte, invisible et exactement à l'échelle
Chaque page PDF reçoit désormais un calque de spans transparents
(`.nc-text-layer`), positionnés par pdf.js (`renderTextLayer`, variable
CSS `--scale-factor`) au pixel près sur le canvas. Il est reconstruit à
chaque rendu — zoom, vue double, navigation, redimensionnement — donc
toujours aligné, et le contenu texte de chaque page est mis en cache :
les re-rendus ne redemandent rien au worker. Le calque se construit en
parallèle du dessin : aucun temps d'attente perceptible.

### 2. Sélectionner comme dans une page web
Curseur texte sur les pages, sélection dorée, et le menu contextuel
apparaît au-dessus du passage. En PDF, il ne propose pour l'instant que
**Copier** — les pastilles de couleur, « Souligner » et « Note » restent
cachées tant que le surlignage PDF (n° 5) n'existe pas (classe
`copy-only` posée à l'ouverture selon le type de livre).

### 3. Copie de qualité, pas copie de calque
Les spans de la couche sont absolument positionnés : les copier tels
quels donnerait un texte haché. Le texte est donc **reconstruit** à
partir des spans sélectionnés, dans l'ordre de lecture, avec :
- un **espace** recollé quand l'écart entre deux morceaux d'une même
  ligne dépasse la largeur d'une espace (mesuré sur la géométrie réelle) ;
- un **retour à la ligne** entre deux lignes — y compris entre les deux
  pages d'une vue double ;
- les bords partiels respectés (on ne copie que les caractères réellement
  sélectionnés dans le premier et le dernier morceau).
Ce même reconstructeur alimente le bouton **Copier** du menu ET
l'événement `copy` : **Ctrl+C** et le menu contextuel du navigateur
copient le texte propre aussi.

### 4. Clic dans le texte ≠ tourner la page
Un clic sur les mots (placer le curseur, double-clic sur un mot,
sélection) ne tourne plus la page. Le tourne-page reste là où il était :
bords sombres autour des pages, flèches latérales, clavier.

### 5. Thèmes : la sélection suit la page
Les filtres nuit / OLED / sépia portaient sur le canvas seul ; ils sont
portés par l'enveloppeur de page (`.nc-pdf-page`) — la sélection subit
le même filtre que la page qu'elle recouvre, et le futur calque de
surlignage en héritera automatiquement.

### 6. Marqueur de fin de page
Comme le viewer officiel de pdf.js, un élément `endOfContent` sous la
dernière ligne permet à une sélection qui part du texte de s'étendre
jusqu'au bas de la page sans lâcher le curseur.

## Fichiers touchés
`js/pdf-reader.js` (couche texte + cache, sélection, reconstructeur de
copie, handlers `mousedown`/`mouseup`/`copy` remplacés à chaque
ouverture, nettoyage dans `destroy()`), `js/reader.js` (classe
`copy-only` à l'ouverture, garde défensive sur les pastilles), 
`css/style.css` (`.nc-pdf-page`, `.nc-text-layer`, filtres de thème
déplacés, `#sel-popup.copy-only`). `vendor/` inchangé : pdf.js 3.11.174
était déjà embarqué, aucune dépendance ajoutée.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Couche texte présente, spans rendus (couverture + page de texte) | ✅ |
| Calque à la taille exacte du canvas (Δ ≤ 1 px) | ✅ |
| `--scale-factor` posé ; spans tous dans la page | ✅ |
| Sélection → menu « copie seule » (pastilles cachées, Copier visible) | ✅ |
| Popup positionné au-dessus de la sélection, dans le viewport | ✅ |
| Bouton Copier → presse-papiers = passage sélectionné | ✅ |
| Événement `copy` (Ctrl+C) → texte reconstruit identique | ✅ |
| Multi-lignes → espaces et retours à la ligne restitués | ✅ |
| Vue double → deux calques ; sélection inter-pages → saut de ligne | ✅ |
| Zoom ×1,25 → calque re-rendu à la bonne échelle | ✅ |
| Clic dans le texte : **pas** de tourne-page | ✅ |
| Clic en marge sombre + flèches clavier : tourne-page conservé | ✅ |
| Nuit : filtre sur l'enveloppeur, sélection opérationnelle | ✅ |
| Recherche PDF, capture PNG (régressions) | ✅ |
| EPUB : menu de sélection complet (pastilles + Souligner) intact | ✅ |
| Réouverture PDF : handlers proprement remplacés, sélection OK | ✅ |
| Journal d'erreurs runtime + console | ✅ vides |

Note d'environnement (identique à la V2.8) : l'instance Chromium headless
de test ne transmet pas les événements de souris aux iframes EPUB — la
simulation de sélection dans l'EPUB reste donc hors de portée de l'outil
(symptôme reproduit sur la V2.7 non modifiée lors de la V2.8). Le chemin
EPUB n'est pas modifié par la V2.9 ; ses régressions sont couvertes par
les vérifications de menu et de surlignage ci-dessus.

## Prochaines étapes
N° 5 — surlignage PDF : la couche texte fournit déjà l'ancrage
(position des passages) et le menu de sélection n'attend plus que ses
pastilles. N° 6 — zoom ajuster + pan. N° 7 — vignettes.
