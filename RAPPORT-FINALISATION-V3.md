# Nuit Calme · Rapport de finalisation V3

**Verdict · PRÊT AVEC RÉSERVES**

Le paquet testé convient à un premier partage sur Edge et Chrome récents avec des livres de confiance. Les parcours essentiels, la reprise d’une vraie base v7 de test, les restaurations ZIP v1 et la mise à jour hors ligne ont passé la validation. Le moteur PDF embarqué reste ancien. La validation sur d’autres moteurs, appareils physiques et lecteurs d’écran reste ouverte. Pour une diffusion large avec des fichiers non fiables, le portage d’un PDF.js maintenu et sa validation constituent le principal travail restant.

## Diagnostic et corrections ciblées

| Gravité | Constat confirmé ou risque identifié | Traitement |
| --- | --- | --- |
| Élevée | Après un remplacement ZIP, un onglet qui affichait encore le livre pouvait réécrire l’ancienne progression. Le même risque s’appliquait à certaines autres écritures du lecteur. | Le lecteur lit le livre et le marqueur de restauration ensemble. Les écritures liées au livre vérifient ce marqueur dans leur transaction. Le lecteur périmé se ferme puis permet de rouvrir le livre restauré. Le remplacement garde son périmètre transactionnel et le marqueur reste exclu de l’archive. |
| Élevée | Le sandbox EPUB bloquait les scripts. Un document pouvait encore demander des ressources à une origine distante. | Une politique CSP restreint les chargements automatiques à l’origine de la liseuse et aux ressources locales `blob:` / `data:`. Les scripts restent désactivés dans l’iframe et la page ne transmet pas de référent. Le test instrumente une seconde origine locale et vérifie l’absence de requête de l’EPUB. |
| Élevée pour une diffusion large | PDF.js 3.11.174 fait partie de la plage concernée par CVE‑2024‑4367 lorsque l’évaluation dynamique est autorisée. | Les trois appels `getDocument` conservent `isEvalSupported: false`, le contournement documenté. La CSP de la page omet `unsafe-eval`. La version PDF.js est inchangée. Un portage doit préserver le calque texte, les annotations, le zoom et le worker hors ligne. [Avis Mozilla de mai 2024](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq) |
| Élevée pour la distribution | La racine du dépôt contient des livres, des packs, des archives anciennes, des rapports et des tests. Publier la racine exposerait ce contenu. | Le paquet public est construit par liste autorisée. Il contient l’application, les licences, le guide et un index de packs vide. Le mécanisme des packs reste présent. |
| Moyenne | Certains EPUB dont le paquet ou le chapitre manque pouvaient laisser le chargement ouvert. Le moteur expose notamment un événement d’échec de rendu sans rejeter l’attente correspondante. | L’ouverture utilise la promesse explicite du moteur et un délai borné de 15 secondes. Le signal `displayerror` rejette l’attente du chapitre. La liseuse rend la main avec son message d’échec. |
| Moyenne | L’écriture, le comptage et l’élagage de l’historique s’effectuaient sur des transactions séparées. | L’insertion et la limite de 150 passages sont appliquées dans une seule transaction par livre. |
| Moyenne, ouverte | La décompression et la restauration de gros ZIP doivent encore matérialiser des données en mémoire. Le quota, les plafonds de navigateur et le temps d’affichage peuvent varier sur mobile. | Les contrôles existants de taille, chemin et CRC restent en place. La suite vérifie le rejet d’une archive incomplète ou corrompue et l’annulation d’une restauration après injection d’une erreur de quota. |
| Faible | Le débogage, le rendu EPUB et la fermeture contiennent des chemins dépendants des moteurs embarqués. | Les interfaces de diagnostic réutilisées par les tests sont conservées. Les changements se limitent à l’ouverture, à la fermeture, aux transactions et à la politique de ressources. |

Les contrôles d’intégrité ont couvert la concurrence du lecteur, de la bibliothèque, du Carnet, des profils et des sessions. Les cas d’erreur vérifiés ont laissé la bibliothèque de test utilisable. La validation couvre le tas après stabilisation via le banc v7 et les cycles courants d’ouverture et de fermeture. La mesure de pics mémoire sur des ouvrages complexes récents et de longues sessions reste ouverte.

## Compatibilité IndexedDB et ZIP

**Recommandation · conserver IndexedDB v7 pour la sortie.** `ENABLE_V8_UPGRADE = false` est inchangé. La suite ouvre une base réellement créée par le code historique `6295c66`, met à jour le service worker sur la même origine, puis relit la base toujours en v7. Elle vérifie préférences, progression, annotation, citation, signet et statistiques. Elle restaure également un ZIP exporté par ce code. Les autres suites vérifient les profils et les nouvelles sessions dans des ZIP v1, la fusion sans doublons et l’annulation après quota injecté. Aucun schéma n’a été migré pendant cette finalisation.

| Livres synthétiques | Première fiche V3 v7, médiane | Recherche V3 v7, médiane |
| ---: | ---: | ---: |
| 100 | 266 ms | 160 ms |
| 300 | 435 ms | 149 ms |
| 1 000 | 386 ms | 150 ms |
| 3 000 | 780 ms | 179 ms |

Ces mesures Edge headless utilisent trois répétitions par volume et des tampons de 128 Kio par livre. Certaines suites tournaient en même temps. La recherche inclut le délai de saisie de 140 ms. La variation entre petits volumes ne démontre pas une tendance fine. La phase 3 avait mesuré un gain de première fiche de 627 à 143 ms pour 3 000 livres. Ce gain motive un examen ultérieur de v8 pour les grandes bibliothèques. Les coûts de construction sur mobile et la matrice multi-moteurs restent inconnus. Une ancienne application qui demande explicitement v7 peut recevoir `VersionError` après une vraie migration et doit disposer d’un export vérifié pour revenir à une branche v7. [Mesures et scénarios de la phase 3](RAPPORT-PHASE-3.md)

## Sécurité des moteurs et contenu du paquet

- **PDF.js.** L’autre avis Mozilla vérifié ici, CVE‑2026‑16633, vise une plage à partir de 5.6.83 et une configuration avec script du viewer. Le paquet actuel est en 3.11.174 et utilise son propre lecteur. Toute mise à jour du moteur doit tenir compte des deux avis. [Avis Mozilla de juillet 2026](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j)
- **epub.js.** Le moteur déclare la branche 0.3. Sa provenance au patch près n’est pas documentée dans le dépôt. La liseuse conserve `allowScriptedContent: false`. Le contrôle navigateur confirme l’absence de `allow-scripts`, de script exécuté et de chargement distant dans le scénario testé. Les EPUB dépendants de médias ou feuilles distants peuvent s’afficher partiellement. [Documentation amont epub.js](https://github.com/futurepress/epub.js#scripted-content)
- **JSZip 3.10.1 et html2canvas 1.4.1.** Les avis et versions amont ont été consultés. Aucun correctif obligatoire pour ces versions n’a été identifié lors de cette revue ciblée. Cela ne constitue pas une analyse complète des dépendances embarquées. [Avis JSZip](https://github.com/Stuk/jszip/security/advisories) · [Avis html2canvas](https://github.com/niklasvh/html2canvas/security/advisories)
- **Paquet public.** 55 fichiers, 1 141 904 octets. Le parcours automatisé vérifie le CRC de l’archive, le périmètre des entrées, l’index de packs vide et la lecture depuis les octets du ZIP. Le contrôle de signatures de secrets a relevé une coïncidence insensible à la casse à l’intérieur d’une chaîne encodée du bundle html2canvas embarqué. Aucun jeton ni clé privée n’a été identifié. Les droits de redistribution des livres du dépôt n’ont pas été établis et le paquet exclut ces livres. Les notices officielles de six dépendances et polices sont incluses dans `vendor/licenses/`. [Licence Cormorant Garamond](https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt) · [Licence Inter](https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt)

SHA‑256 du ZIP testé `BC02BE318351DBA0F3D09ABC01498C7A66D304EE66E2AAED5197DB6AC9F4D751`.

## Suites et environnements vérifiés

Edge `157.0.4341.60` et Chrome `157.0.8103.51` sur Windows, tous deux headless avec profils temporaires et serveur HTTP de boucle locale. Les données et les livres sont synthétiques. Firefox, Safari et WebKit étaient indisponibles sur cet environnement. Les observations Chromium n’établissent pas la compatibilité de ces autres moteurs.

| Suite | Environnement et résultats |
| --- | --- |
| Régression générale | Edge et Chrome. Import EPUB/PDF, recherche de bibliothèque, lecture et reprise, annotations, signets, packs, ZIP v1, quota injecté, concurrence, cache hors ligne, installation de précache incomplète et attente avec un autre onglet. |
| `--v3` et `--v3 --chrome` | Edge et Chrome. Ancienne base v7, ancienne archive ZIP v1, mise à jour réelle du service worker, fermeture d’un lecteur périmé, blocage des écritures tardives, nouvelle écriture valide. CSP et deux EPUB incomplets. Manifeste sans erreur, quatre icônes déclarées et diagnostics d’installabilité Chromium vides. |
| `--bundle=…` | Edge. Le serveur lit le ZIP public. Ouverture sous `/liseuse/`, import d’un fichier local, puis rechargement et lecture EPUB réseau coupé. |
| `--profiles` | Edge. Profils, EPUB à mise en page fixe, PDF, reprise, CFI, notes et signets, fusion/restauration, deux onglets. Le repère initial est resté visible dans les dix opérations du corpus synthétique. |
| `--stats` et `--stats --chrome` | Edge et Chrome. Horloge contrôlée, minuit, heures d’été et d’hiver, fuseaux, sessions successives et Web Locks, objectifs, exclusion du Carnet, recomposition sans crédit indu, calendrier, fusion et remplacement ZIP v1. |
| `NC_UX=1` | Edge. Navigation clavier, focus, réglages et dialogues, tactile émulé. Tailles 320 × 640, 390 × 844, 667 × 375, 768 × 1 024 et 1 024 × 768. |
| `NC_NOTEBOOK=1` | Edge. Création et consultation d’entrées, export Markdown, retour avec contexte, annotation concurrente, consultation sans modification de progression et corpus jusqu’à 5 000 entrées. |
| `NC_BENCHMARK=1` | Edge. Bibliothèques v7 de 100 à 3 000 livres synthétiques. |
| `--stats-benchmark` | Edge. Agrégation et rendu jusqu’à 15 000 sessions synthétiques réparties sur 1 825 jours. À ce volume, le tableau de bord s’ouvre en 154 ms en médiane sur trois répétitions. |

La suite vérifie l’installabilité web et le cycle du service worker. L’installation par le menu du système, le lancement depuis une icône native, le quota physique, le comportement après arrêt forcé du navigateur et les lecteurs d’écran restent à valider. Web Locks est vérifié sur Chromium. En l’absence de cette API, l’application affiche les cumuls et suspend le nouveau chronométrage pour éviter les doubles comptages. Les tailles, orientations et gestes mentionnés sont émulés.

## Publication et mise à jour

1. Produire ou utiliser le ZIP public. Pour reproduire le paquet avec Node.js 22 ou ultérieur, lancer `node tools/package-v3.mjs chemin/nuit-calme-v3.zip` vers un fichier encore absent. Le script valide les ressources déclarées et les dimensions des icônes.
2. Extraire le ZIP et publier **son contenu** sur un hébergement statique HTTPS. Servir `index.html`, `sw.js` et `manifest.webmanifest` au même niveau. Conserver les chemins relatifs fournis. Utiliser le ZIP public comme unité de mise en ligne pour éviter que plusieurs états du code coexistent pendant la mise à jour. Le fichier `sw.js` utilise le cache `v3.0.0`.
3. Garder la même origine pour une mise à jour existante. Une adresse dont le protocole, le domaine ou le port change demande un export suivi d’une restauration. Pour deux installations indépendantes, utiliser des origines distinctes. Les chemins d’une même origine peuvent partager la base IndexedDB.
4. Vérifier sur l’adresse finale que le manifeste et le service worker répondent correctement. Servir `manifest.webmanifest` en `application/manifest+json` et les scripts en `text/javascript` ou `application/javascript`. Autoriser la revalidation de `sw.js` et `index.html`. Tester avec un profil vide, un livre de test, le mode hors ligne et l’arrivée d’une mise à jour avec un second onglet.
5. Garder l’index de packs vide tant que les contenus destinés au partage ne sont pas validés. Distribuer le [guide de démarrage](GUIDE-NUIT-CALME.md) et expliquer que les ZIP personnels contiennent les livres et les données de lecture. Les bibliothèques restent locales au navigateur et ne se synchronisent pas entre appareils.

En cas de régression après mise en ligne, republier l’ensemble des fichiers de la version précédente avec une nouvelle clé de cache pour enclencher le cycle du service worker. Avant toute restauration, exporter l’état courant et conserver les deux archives. Le schéma v7 évite ici le blocage propre à un retour depuis v8. Un ancien lecteur n’affiche que les champs et fonctions de sa version.

## Fichiers modifiés et livrables

| Fichiers | Rôle |
| --- | --- |
| `index.html`, `sw.js` | CSP, politique de référent et version du cache. |
| `js/idb.js`, `js/reader.js`, `js/reading-tracker.js` | Transactions, marqueur de restauration, fermeture du lecteur et suivi de session. |
| `js/epub-reader.js`, `js/pdf-reader.js`, `js/library.js`, `js/util.js` | Ouverture EPUB, propagation des erreurs et protection des écritures du lecteur. |
| `tests/smoke.mjs`, `tests/finalisation-v3.mjs` | Suite v7 vers V3, Chromium, EPUB adverse et test du paquet publié. |
| `tools/package-v3.mjs`, `vendor/licenses/` | Génération reproductible du paquet et notices. |
| `GUIDE-NUIT-CALME.md`, `RAPPORT-FINALISATION-V3.md` | Documentation d’utilisation et validation finale. |

Le dépôt distant, la bibliothèque réelle, les livres du projet, le dossier `mises à jour` et les rapports précédents ont été préservés. Aucun push ni déploiement n’a été effectué.
