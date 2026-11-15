# Nuit Calme — V2.2 (thèmes de lecture + préférences centralisées)

Fonctionnalité 1 de la Phase 2 « liseuse premium », construite sur la V2.1
(stabilisation). Toutes les corrections de la V2.1 restent en place.

## Nouveautés

### 1. Quatre thèmes de lecture (au lieu de deux)
- **Papier** — crème chaud `#f5eedc`, encre sombre (le défaut).
- **Sépia** — teinte chaude et douce `#d9d1bd`.
- **Nuit** — charbon `#191a1f` (comme avant).
- **OLED** — noir absolu `#000000`, encre légèrement adoucie pour éviter
  le halo sur écran OLED.

Application complète :
- **EPUB** : CSS régénéré depuis une table de palettes unique
  (`NC.BOOK_THEMES` dans `util.js`) — fond, encre, titres, liens,
  citations, filets.
- **PDF** : filtres CSS par thème — sépia = voile chaud, nuit = inversion,
  OLED = inversion plus douce (moins d'éclat). Les captures PNG respectent
  le thème actif, y compris OLED.
- **Choix dans un popover** : clic sur l'icône de thème → 4 pastilles
  nommées, thème courant surligné. Fermeture par clic extérieur ou Échap.

### 2. Thème mémorisé PAR LIVRE
- Chaque livre garde son propre thème (nouveau magasin IndexedDB `prefs`,
  version 4 de la base).
- À l'ouverture : préférence du livre → dernier thème utilisé → réglage
  historique → papier.
- Un changement de thème sur un livre ne touche pas les autres.

### 3. Module centralisé de préférences (fondation de la suite)
- `NC.db.getPrefs(bookId)` / `putPrefs(prefs)` : un enregistrement par
  livre, séparé des fichiers (`books`) et de la position (`progress`).
- La taille de police EPUB migre vers ce module (recopiée automatiquement
  depuis l'ancien emplacement, sauvegarde différée pour absorber les
  rafales de clics sur A−/A+).
- La suppression d'un livre purge aussi ses préférences.

## Fichiers touchés
`js/idb.js` (v4, prefs, cascade), `js/util.js` (palettes + CSS),
`js/reader.js` (popover, résolution du thème, migration police),
`js/epub-reader.js` (thèmes 4 voies, capture, persistance police),
`js/pdf-reader.js` (thèmes 4 voies, capture), `js/app.js` (hook de test),
`index.html` (popover), `css/style.css` (popover, pastilles, filtres PDF).

## Tests exécutés (Chromium headless, serveur local)

| Test | Résultat |
| --- | --- |
| Popover : 4 thèmes affichés, courant surligné | ✅ |
| Sépia appliqué à l'EPUB (fond réel `#d9d1bd`) | ✅ |
| Fermer/rouvrir → sépia restauré sans action | ✅ |
| OLED appliqué (fond `#000`, bouton en état sombre) | ✅ |
| PDF : hérite du dernier thème utilisé (OLED) | ✅ |
| PDF : filtre OLED puis filtre sépia corrects | ✅ |
| Isolation : EPUB reste OLED quand le PDF passe en sépia | ✅ |
| PDF rouvert → son propre thème (sépia) restauré | ✅ |
| Suppression d'un livre → préférences purgées | ✅ |
| Journal d'erreurs runtime | ✅ vide |

## Prochaines étapes possibles (Phase 2)
N° 7 signets · N° 8 soulignages multicolores · N° 2 typographie avancée
(le module `prefs` de cette version est déjà prêt pour l'accueillir) ·
bloc PDF N° 12-13.
