# Nuit Calme — V2.1 (Phase 1 : stabilisation)

Corrections appliquées d'après l'audit technique. Aucune fonctionnalité retirée,
aucune régression introduite : tout le comportement existant est conservé.

## Corrections critiques

1. **Reprise de lecture EPUB réparée** (`reader.js`)
   La progression était enregistrée dans le magasin IndexedDB `progress` mais
   relue dans `books.lastCfi` — qui restait vide. La reprise ne fonctionnait
   jamais. Désormais, l'ouverture lit `progress` (CFI, taille de police, %) ;
   `books` ne sert plus que de repli pour d'anciens enregistrements.

2. **Préférences de lecture persistées** (`reader.js`, `pdf-reader.js`)
   - Taille de police EPUB : restaurée à l'ouverture depuis `progress`.
   - Zoom PDF : enregistré dans `books` mais jamais transmis à `openPdf()` —
     c'est corrigé (`zoom: rec.zoom`).

3. **Suppression propre d'un livre** (`idb.js`, `library.js`)
   Nouvelle `deleteBookCascade()` : une seule transaction supprime le livre,
   toutes ses annotations et sa progression. Plus de données orphelines.
   Échec de suppression signalé par un toast au lieu d'échouer en silence.

4. **Sommaire PDF hiérarchique** (`pdf-reader.js`)
   `buildOutline()` produisait `items` là où le rendu attend `subitems` :
   les sous-sections n'apparaissaient jamais. Structure normalisée.

5. **Rendus PDF concurrents sécurisés** (`pdf-reader.js`)
   Jeton de génération (`renderGen`) : un rendu devenu obsolète (zoom,
   redimensionnement, navigation rapprochés) s'arrête net et ne touche ni
   l'affichage ni la progression sauvegardée. `destroy()` invalide aussi
   les rendus en vol.

6. **Dimensions de la 2ᵉ page PDF** (`pdf-reader.js`)
   Le CSS de chaque canvas utilise désormais le viewport de SA page
   (avant : dimensions de la page 1 pour toutes).

7. **Clavier bibliothèque** (`library.js`)
   Entrée/Espace sur le bouton Supprimer (enfant de la carte) n'ouvrent plus
   le livre en même temps.

8. **Popup de sélection repositionné** (`epub-reader.js`)
   `#sel-popup` est en `position:fixed` : les coordonnées sont désormais en
   viewport (avant : décalé de la hauteur du bandeau supérieur).

9. **Sélections nettoyées partout** (`epub-reader.js`)
   En vue double, la sélection est effacée dans toutes les iframes, pas
   seulement la première.

## Robustesse

- **IndexedDB v3** (`idb.js`) : index `bookId` sur `annotations` (requêtes et
  purge efficaces), `onversionchange` (libère la connexion au lieu de bloquer
  un autre onglet), réessai propre après un échec d'ouverture.
- **Verrou d'ouverture** (`reader.js`) : un double-clic ou Entrée répétée ne
  peut plus lancer deux ouvertures concurrentes.
- **Erreurs** : message clair si IndexedDB est inaccessible au démarrage
  (`app.js`) ; message spécifique si le stockage du navigateur est saturé
  lors d'un import (`library.js`).
- Le hook `NC_DEBUG` est conservé : il sert à la vérification automatisée
  (et vient de servir à celle-ci). Local uniquement, aucune donnée envoyée.

## Tests exécutés (Chromium headless, serveur local)

| Test | Résultat |
| --- | --- |
| Import EPUB + PDF d'exemple | ✅ sans erreur |
| EPUB : 3 pages → fermer → rouvrir | ✅ reprise exacte (chapitre 2) |
| EPUB : police 130 % → rouvrir | ✅ préférence conservée |
| PDF : zoom 1,30 → rouvrir | ✅ zoom restauré (avant : 1,00) |
| PDF : page 3 → rouvrir | ✅ page restaurée |
| Sommaire PDF imbriqué | ✅ sous-sections présentes |
| Rafale zoom/navigation PDF | ✅ aucun canvas obsolète |
| Suppression d'un livre annoté | ✅ annotations + progression purgées |
| Journal d'erreurs runtime | ✅ vide |

## Prochaines étapes (Phase 2 — liseuse premium)

Paramètres typographiques avancés, thèmes papier/sépia/nuit/OLED, signets,
annotations multicolores et notes, recherche améliorée, navigation tactile,
mode concentration.
