# Nuit Calme — V2.8.1 (audit complet & corrections)

Audit du code intégral (les 7 modules JS, le CSS et le HTML, lus ligne à
ligne) complété par des tests automatisés sous Chromium headless. Quatre
défauts corrigés, une course à l'ouverture sécurisée, deux filets de
robustesse. Aucune fonctionnalité retirée : la suite de régression passe
intégralement, journal d'erreurs vide.

## Défauts corrigés

1. **Progression PDF : le livre ENTIER était réécrit à chaque tourne-page**
   (`pdf-reader.js`, `reader.js`, `library.js`) — la correction la plus lourde.
   `render()` réécrivait l'enregistrement complet du livre (`putBook(rec)` :
   données + couverture) à chaque changement de page, de zoom, et à chaque
   passage sur un autre onglet. Mesuré : **118 ms par écriture à 25 Mo,
   562 ms à 80 Mo**, contre **0,4 ms** pour un enregistrement léger —
   environ **1 400×** plus coûteux, et inutilement éprouvant pour le
   stockage du navigateur. La progression PDF vit désormais dans le magasin
   léger `progress` (`{ id, lastPage, zoom, pct, lastOpened }`), comme
   l'EPUB depuis la V2.1 ; `rec.lastPage` / `rec.zoom` ne servent que de
   repli pour les livres enregistrés avant la migration. La bibliothèque
   fusionne `books.lastOpened` et `progress.lastOpened` au tri, donc le
   classement « récemment ouverts » est conservé. Au passage, le pourcentage
   de lecture est désormais aussi enregistré pour les PDF — utile au futur
   n° 18 (statut de lecture).

2. **Erreur JavaScript si une flèche était pressée pendant l'ouverture**
   (`reader.js`) — le lecteur s'affiche avant la fin de l'ouverture ; une
   flèche pressée dans cette fenêtre levait `TypeError: Cannot read
   properties of null (reading 'type')` (relevé par le journal d'erreurs et
   reproduit par test). Garde posée avant la gestion clavier, et dans
   `toggleFontPop()` pour le même motif.

3. **Fuite d'écouteurs à chaque fermeture de livre EPUB** (`epub-reader.js`)
   — `book.destroy()` ne démonte PAS la rendition : le manager d'epub.js
   gardait son écouteur global `resize` de la fenêtre, et un cycle
   ouverture/fermeture en laissait un fantôme derrière lui (travail inutile
   à chaque redimensionnement, mémoire qui s'accumule sur une longue
   session). `ctl.destroy()` appelle désormais `rendition.destroy()` (qui
   démonte le manager et retire ses écouteurs) et nettoie les minuteries de
   re-redessin (`_fsTimer`, `_fsTimer2`, `_typoTimer`, `_typoTimer2`,
   `_fsPrefsTimer`) pour qu'elles ne visent plus une rendition détruite.

4. **Les filtres du tiroir Soulignages & notes survivaient à la fermeture du
   livre** (`reader.js`) — contrairement à ce que documente la V2.8
   (« reviennent à tout à la prochaine ouverture de livre »), le filtre
   actif (recherche, type ou catégorie) était conservé : on ouvrait le livre
   suivant avec un tiroir déjà filtré, à croire qu'il n'y avait rien dedans.
   Vérifié avant/après correctif (« Notes » restait actif ; désormais « Tout »).

5. **Contrôleur fantôme si « Retour à la bibliothèque » pendant une
   ouverture** (`reader.js`) — fermer pendant que le livre s'ouvrait
   laissait l'ouverture courante finir en arrière-plan : contrôleur vivant,
   rendition active, tout derrière la bibliothèque. Un jeton de génération
   (`openGen`) invalide désormais toute ouverture dépassée — Retour comme
   nouvelle demande — et le contrôleur périmé est détruit au moment où il
   se matérialise.

## Robustesse

- **Journal d'erreurs borné** (`util.js`) : `__ncErrors` plafonné à 200
  entrées — une boucle d'erreurs dans une longue session ne doit pas
  croître sans fin.
- **Initiales de couverture Unicode** (`library.js`) : le filtre
  `a-zA-ZÀ-ÿ0-9` retombait sur « NC » pour un titre en cyrillique, grec ou
  chinois ; désormais `\p{L}\p{N}` avec le drapeau `u` (toutes lettres et
  chiffres Unicode).

## Ce que l'audit a validé (aucun défaut relevé)

- Protection des données à l'ouverture : `rec.data.slice(0)` partout —
  pdf.js TRANSFÈRE l'ArrayBuffer au worker ; sans la copie, le livre en
  base serait devenu vide après la première lecture. Correct et systématique.
- Jeton de génération des rendus PDF (`renderGen`), anti-rebond du curseur
  de progression, migration des anciennes annotations, calques SVG
  ré-ancrés, `deleteBookCascade()` transactionnel, messages d'erreur
  (quota saturé, DRM, mot de passe), anti-réentrance de `saveNote()`.
- Performance de lecture : re-rendus ciblés, unloads des sections EPUB en
  recherche, débounces sur les changements de typographie.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Flèche pressée pendant l'ouverture → erreur | ✅ corrigé (0 erreur) |
| Tourne-page PDF → enregistrement léger `progress` | ✅ lastPage/zoom/pct/lastOpened |
| Fermer/rouvrir le PDF → reprise de page depuis `progress` | ✅ page exacte |
| Filtre « Notes » → fermer → rouvrir → filtre | ✅ réinitialisé (« Tout ») |
| Souligner → fermer → rouvrir (après `rendition.destroy()`) | ✅ rects identiques (13/13) |
| Tri bibliothèque après ouverture (fusion progress/books) | ✅ ordre correct |
| Recherche EPUB (« fourmi » → 5 passages) | ✅ inchangée |
| Recherche PDF, zoom, thème nuit, capture PNG | ✅ inchangés |
| Catégories d'annotations + popover | ✅ inchangés |
| Vue double ↔ simple, EPUB et PDF | ✅ inchangés |
| Journal d'erreurs runtime | ✅ vide |

## Suite

Le carnet de route (n° 6, 7, 11, 12-13, 14-16, 17-18, 19, tactile) est
inchangé et prêt ; l'audit n'a rien modifié de ce qui touche l'interface,
les nouveaux correctifs sont invisibles à l'écran.
