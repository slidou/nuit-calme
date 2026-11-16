# Nuit Calme · Profils de lecture et stabilité EPUB

16 novembre 2026 · Phase 6

## Utilisation

Le bouton **Aa · Réglages de lecture** donne accès à un sélecteur de profils, à un résumé des valeurs du profil sélectionné et à l’indication du profil appliqué au livre ouvert. **Appliquer** associe une copie des valeurs au livre. Les modèles **Roman**, **Philosophie**, **Poésie** et **Lecture nocturne** sont personnalisables. La section **Gérer les profils** permet de créer un profil à partir des réglages visibles, de le renommer, d’y enregistrer les réglages actuels ou de le dupliquer. La suppression d’un profil personnel demande une confirmation. Sa copie reste disponible dans les livres auxquels elle a été appliquée.

Sur un EPUB reflowable, un profil enregistre la police, la taille, l’interligne, la largeur de lecture, les marges horizontales, l’alignement, le thème, l’espacement après les paragraphes et le mode pages ou défilement. La largeur est un maximum adapté à l’espace disponible. La pagination utilise l’écart entre colonnes d’epub.js pour les marges horizontales. En défilement, le lecteur ajuste le remplissage horizontal du texte. Le mode de lecture est également disponible depuis la barre du lecteur et ses raccourcis habituels.

Les réglages directs sont propres au livre. Lorsque celui-ci utilise un profil, ils s’affichent comme des ajustements du livre. **Rétablir le profil** reprend les valeurs de la version appliquée. La case **Ajuster pour cette session uniquement** permet d’essayer des valeurs en mémoire. Décocher la case ou fermer le livre les efface. **Créer avec les réglages actuels** peut enregistrer une configuration essayée pendant cette session. **Réglages précédents** restaure la configuration qui précédait la dernière application explicite. Pour un profil reçu à l’import, **Retirer le profil du livre** revient aux réglages habituels.

La gestion est repliée sous le sélecteur rapide. Les champs portent des libellés, l’état et les erreurs sont annoncés, et la confirmation a un bouton d’annulation. Le panneau se repositionne lorsque sa hauteur ou la zone visible change, notamment pendant la saisie. La palette charbon et or et les polices locales Cormorant Garamond et Inter servent aux nouveaux contrôles.

## Règles de priorité et persistance

1. Les valeurs de Nuit Calme fournissent les défauts. Les valeurs historiques de `flow`, `lastTypo`, `lastBookTheme`, `bookTheme` et l’ancienne taille EPUB restent lisibles comme replis. Les réglages saisis dans cette phase restent individuels, sauf sélection explicite d’un profil par défaut pour les nouveaux imports.
2. **Définir par défaut** s’applique aux futurs imports de livres et de packs. Au moment de l’import, l’écriture du livre et celle de son profil se font dans une même transaction. Les livres déjà présents et les livres restaurés conservent leurs propres données.
3. Le profil choisi pour un livre est un instantané. Une édition ou suppression dans le catalogue garde l’apparence des livres associés. Une nouvelle application reprend la version sélectionnée. Le lecteur signale une « version conservée » si elle diffère du catalogue.
4. Les ajustements persistants du livre priment sur l’instantané. Sans profil, les préférences individuelles priment sur les replis historiques. Au retour aux réglages précédents, le lecteur conserve les valeurs visibles avant l’application.
5. Les réglages de session priment pendant l’ouverture en cours. La consultation depuis le Carnet garde également les réglages de confort en mémoire pour la durée de la visite.

Le catalogue et le choix par défaut sont une valeur `readingProfiles` dans `settings`. Les associations, ajustements et réglages précédents sont dans `prefs.reading`. Les anciennes clés et les CFI des annotations et signets restent exploitables. La progression garde son magasin et continue de transporter l’ancienne taille de police séparément des ajustements de profil. IndexedDB fonctionne en v7, avec `ENABLE_V8_UPGRADE = false`. Les imports passent par la fonction commune d’écriture des livres utilisée par la projection de fiches si un magasin v8 est un jour présent.

Une transaction relit le catalogue avant chaque mutation. Les créations concurrentes sont conservées. Les opérations sur un profil déjà lu comparent sa révision, et une édition périmée reçoit un message. Le panneau ouvert rafraîchit le catalogue à réception d’une notification entre onglets. Les ajustements individuels fusionnent les champs dans la transaction. Si le profil associé a changé dans un autre onglet, l’écriture périmée est refusée et le lecteur demande de rouvrir le livre. Les onglets déjà en train de lire conservent leur mise en page jusqu’à une action de leur lecteur.

Le ZIP reste en version 1. Les nouvelles données voyagent dans les entrées `settings` et `prefs` déjà prévues. Le remplacement restitue les réglages de l’archive. En fusion, les profils distincts s’ajoutent. En cas d’identifiant commun, le profil local prévaut. Si un catalogue local existe, son choix du profil par défaut est gardé, y compris l’absence de profil par défaut. Les instantanés des livres garantissent que les associations continuent de fonctionner si le profil de catalogue est absent ou a évolué. Une version antérieure de Nuit Calme lit la structure ZIP v1 et ses préférences historiques. Elle affiche les réglages qu’elle connaît, ce qui peut modifier l’apparence et la pagination par rapport à cette phase.

## Conservation du passage EPUB

L’analyse d’epub.js a montré deux sources de déplacement. D’une part, les changements de police et de taille reformatent les colonnes alors que le décalage visuel correspond encore à l’ancienne géométrie. D’autre part, la fenêtre et la rendition peuvent déclencher plusieurs redimensionnements et repositionnements en parallèle. Les événements `relocated` arrivent de façon différée et peuvent décrire une étape intermédiaire.

Le lecteur conserve le CFI du début visible et contrôle sa géométrie dans l’intersection de l’iframe et de la zone de lecture. Si ce CFI ne désigne pas un caractère visible, il essaie de produire un CFI à partir de texte situé près du haut de la zone. Un court extrait et son décalage dans le texte servent de secours en cas de résolution incorrecte du CFI. La recherche de cet extrait reste dans la même section et exige une occurrence unique. Lorsque le repère précis échoue, le lien de la section sert de repli s’il est disponible.

Un `ResizeObserver` suit les dimensions de la zone de lecture. La navigation et les recompositions partagent une file. Les changements de police simple mettent à jour la feuille du document en place. Le mode, les dimensions, les marges de colonnes et la vue double peuvent recréer la rendition. Le code attend la mise en place des polices avec un délai borné, vérifie que le caractère d’ancrage est visible et corrige la position si nécessaire. La navigation volontaire rafraîchit le repère, y compris quand elle aboutit dans une page déjà affichée. Le CFI de progression au rechargement et les sauts par CFI vers une autre section suivent le même recalage. Les événements de recomposition intermédiaires ne sont pas utilisés pour la progression. Le rendu stabilisé redessine les surlignages et actualise le repère de statistiques sans créditer une nouvelle page.

### PDF et EPUB à mise en page fixe

Un profil applique son thème au PDF via le mécanisme de thème existant. Le zoom, les ajustements, les vignettes, la recherche, la sélection, les surlignages, les signets et la progression restent accessibles. Les commandes de composition EPUB sont absentes du panneau PDF. Pour les EPUB qui déclarent une mise en page fixe dans le paquet, dans les métadonnées Apple prises en charge par le moteur ou dans une entrée du livre, la typographie de l’éditeur est conservée. Le thème de profil s’applique au cadre du lecteur. Pour les EPUB mixtes détectés, le mode prudent réserve cette politique à tout le volume.

## Mesures avant et après

Edge en mode headless, profil temporaire, EPUB synthétique de deux sections de 160 paragraphes. Le même script repart d’un CFI situé au milieu de la première section avant chaque opération. Il relève le premier caractère visible à partir des rectangles de texte et vérifie si ce même caractère reste visible après stabilisation. Les cas communs ont été exécutés sur le commit `5d00f6a` de phase 5 puis sur cette phase. Les chiffres donnent un ordre de grandeur pour ce document et ces tailles de fenêtre.

| Opération | Écart du premier paragraphe, phase 5 | Écart, phase 6 | Caractère initial visible, phase 5 → phase 6 |
| --- | ---: | ---: | --- |
| Changer de police | −7 | −2 | Non → oui |
| Agrandir le texte | −23 | −3 | Non → oui |
| Augmenter l’interligne | −18 | −2 | Non → oui |
| Pages vers défilement | −29 | 0 | Non → oui |
| Défilement vers pages | −41 | −2 | Non → oui |
| 1 240 × 870 vers 390 × 844 | −34 | 0 | Non → oui |
| Portrait vers 844 × 390 | −34 | −1 | Non → oui |
| Élargir les marges | — | 0 | Oui en phase 6 |
| Réduire la largeur | — | −2 | Oui en phase 6 |
| Appliquer Lecture nocturne | — | 0 | Oui en phase 6 |

Sur les sept opérations comparables, le caractère initial reste visible dans **0/7** cas avant et **7/7** après. L’écart absolu médian du premier paragraphe passe de **29 à 2 paragraphes**. Les trois nouvelles opérations conservent elles aussi le caractère initial. Un écart négatif indique que la page commence un peu plus tôt, ce qui reste normal lorsque les coupures de pages changent. Les délais du banc d’essai incluent des attentes de stabilisation et ne constituent pas une mesure de latence interactive.

## Vérifications automatisées

| Commande | Vérifications |
| --- | --- |
| `node tests/smoke.mjs --profiles-baseline` | Mesure du passage visible sur le commit de phase 5. |
| `node tests/smoke.mjs --profiles` | Création, renommage, édition, copie, suppression confirmée et annulation. Modèles, application, héritage à l’import, réglages précédents, ajustements avec ou sans écriture, rechargement, quota simulé et deux onglets. ZIP v1 avec et sans profils, v7, EPUB long, repli par extrait, CFI, annotation, signet, EPUB fixe et PDF. |
| `node tests/smoke.mjs` | Import, EPUB, PDF, reprise, recherche, progression, statistiques, packs, cohérence des écritures, restauration et cache hors ligne. |
| `$env:NC_UX='1'; node tests/smoke.mjs` | Parcours au clavier, retour de focus, réglages en tailles 320 × 640, 390 × 844, 667 × 375, 768 × 1 024 et 1 024 × 768, réduction simulée de la zone visible. |
| `$env:NC_NOTEBOOK='1'; node tests/smoke.mjs` | Carnet, annotations PDF et EPUB, filtrage, export, consultation sans écriture de progression, restauration et concurrence. |

Les vérifications sur les appareils et lecteurs d’écran sont à distinguer des contrôles automatisés. Le test tactile, les dimensions et l’orientation ont été émulés dans Edge. Aucun appareil physique ni lecteur d’écran n’a été utilisé. Les livres et les bases de test ont été créés par les scénarios, dans des profils temporaires.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `js/reading-profiles.js` | Modèles, normalisation, catalogue, aperçu et gestion du profil. |
| `js/epub-anchor.js` | Repère CFI, géométrie de la zone visible et secours textuel. |
| `js/reader.js`, `js/epub-reader.js`, `js/touch.js`, `js/util.js` | Priorités, contrôles, gestes, typographie, recomposition et progression. |
| `js/idb.js`, `js/library.js` | Catalogue transactionnel, association à l’import et fusion avec ZIP v1. |
| `index.html`, `css/style.css`, `sw.js` | Intégration, accessibilité du panneau et précache hors ligne. |
| `tests/reading-profiles.mjs`, `tests/smoke.mjs` | Scénarios, EPUB synthétiques et comparaison avant/après. |
| `RAPPORT-PHASE-6.md` | Documentation de la phase. |

## Limites et suites envisageables

- Le positionnement dépend des CFI et de la mise en page que l’ouvrage expose au moteur. Une page sans texte, une mise en forme très spécifique, des ressources lentes ou un extrait répété peuvent réduire la précision. En mode paginé, le résultat attendu est la présence du passage dans la page visible. Le caractère peut changer de ligne ou de colonne à l’écran.
- Un profil peut provoquer une courte reconstruction visuelle au changement de mode ou de dimensions. Sa durée sur des livres richement illustrés n’a pas été mesurée. Une validation iOS Safari et Android sur appareils réels couvrirait la rotation, le clavier virtuel, les gestes et la mise en veille pendant un recalcul.
- La prise en charge des EPUB mixtes reste prudente. Un corpus complémentaire avec texte bidirectionnel, compositions verticales, illustrations lourdes, scripts bloqués et EPUB fixes hétérogènes permettrait de qualifier l’ancrage au-delà du corpus synthétique.
- Un test guidé avec VoiceOver, TalkBack et NVDA permettrait de vérifier les annonces de profil, le défilement du panneau et les confirmations. Un aperçu typographique sur un échantillon indépendant et une comparaison côte à côte pourraient être envisagés ultérieurement.

Les rapports précédents sont conservés. Les livres fournis, le dossier `mises à jour` et la bibliothèque réelle sont restés intacts. Le travail est local.
