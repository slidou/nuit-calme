# Nuit Calme · Activité de lecture

Phase 7 · Statistiques avancées, calendrier et sessions

## Parcours disponibles

Le bouton **Activité** de la bibliothèque ouvre le tableau de bord. Il présente les durées enregistrées, les livres en cours et terminés, les jours actifs, un calendrier mensuel, les tendances, l’objectif, les sessions et la répartition du temps. Le menu d’une fiche et le tiroir **Statistiques** du lecteur affichent l’activité du livre. Le tiroir donne également accès au tableau de bord de la bibliothèque.

Les cases du calendrier affichent le détail du jour au clic ou depuis le clavier. Les flèches changent de jour ou de semaine. Les boutons de période changent de mois. Les intensités utilisent quatre seuils de temps fixes. Une trame signale l’historique inconnu et un contour en tirets signale une durée mesurée à zéro. Une case neutre indique l’absence d’activité enregistrée depuis le début du suivi. L’intensité est aussi décrite textuellement. Les graphiques en barres ont une table HTML associée et des commandes natives pour choisir l’unité et l’indicateur. Ils réutilisent la palette charbon et or, Inter pour les commandes et Cormorant Garamond pour les titres.

## Audit et origine des données

| Source existante | Informations exploitables | Limites de l’historique |
| --- | --- | --- |
| `readstats` v6/v7 | Durée et compteur de présentations par livre et par date civile. `lastAt` indique le dernier enregistrement du jour. | Durée déjà créditée selon les anciennes règles. Les limites de session, la simultanéité entre onglets et la part éventuelle de chaque session sont inconnues. Les horodatages historiques correspondent aux écritures. |
| `progress` | Pourcentage conservé par le lecteur, CFI EPUB ou page PDF, dernière ouverture disponible. | Une dernière ouverture ne permet pas de connaître la première. Un pourcentage EPUB n’indique pas un nombre de pages physiques. |
| `history` | Passages visités et retours vers leur position. | Historique borné. Les visites répondent à une autre règle que le chronomètre. Aucune session rétroactive n’en est dérivée. |
| `bookmeta` | Statut actuel et date `statusAt` lorsqu’elle a été enregistrée pour la transition vers « Terminé ». | `updatedAt` peut refléter un changement de rayon ou de métadonnées. Le premier début et l’origine d’une fin ancienne peuvent rester inconnus. |
| `annotations`, `bookmarks` | Notes, surlignages et signets présents pour un livre. | Ces entrées sont des repères de lecture. Elles ne fournissent aucune durée. |
| Objectif existant | Nombre visé, période et fins datées des livres actuellement terminés. | L’application ne disposait pas d’un historique des objectifs successifs. |

L’ancien chronomètre démarrait à l’ouverture et se réarmait au mouvement de souris. Il ajoutait par tranches à l’agrégat du jour de l’écriture. Un changement de jour, la simultanéité de fenêtres et certains re-rendus pouvaient donc avoir un effet sur l’imputation. Les cumuls acquis restent affichés tels qu’ils ont été enregistrés. Le suivi des sessions commence à la première ouverture normale d’un livre avec cette version sur un navigateur qui permet la coordination. Sa date est visible dans le tableau de bord. La première ouverture enregistrée d’un livre et l’origine de sa fin sont recueillies à partir de cette phase.

## Définition des indicateurs

| Indicateur | Calcul appliqué |
| --- | --- |
| Temps actif total | Somme des durées quotidiennes enregistrées des livres présents. Les durées historiques et celles de la phase 7 sont incluses. |
| 7 et 30 jours | Jours civils glissants, aujourd’hui inclus. Les comparaisons utilisent les 7 ou 30 jours immédiatement précédents et signalent les périodes où des jours sont inconnus. |
| Jours actifs | Nombre de dates distinctes où une durée positive ou une présentation de page a été enregistrée. Une même date compte une fois pour toute la bibliothèque. |
| Séquence par livre | Jours actifs consécutifs à partir d’aujourd’hui, ou d’hier si aujourd’hui reste sans activité enregistrée. |
| Présentations | Positions paginées distinctes d’affilée après une navigation explicite du lecteur, pendant le suivi. Une double page peut compter deux présentations. Un retour au même passage peut être compté après un déplacement. Les cumuls antérieurs suivent l’ancien compteur. L’EPUB défilant ne fournit aucune unité de page au compteur. |
| Sessions et durée moyenne | Nombre de sessions journalières de durée positive dans la période choisie, puis somme de leurs durées divisée par ce nombre. L’agrégat historique et les seules présentations à durée nulle sont hors de cette mesure. |
| Évolution | Temps agrégé sur 14 jours, 8 semaines commençant le lundi ou 12 mois civils. Les périodes courantes s’arrêtent au jour affiché. Les tables signalent les totaux partiels. |
| Livres en cours ou terminés | Statut actuel des livres présents. La tendance des fins retient les statuts « Terminé » datés. Un changement de statut retire ou actualise le point correspondant. |
| Temps par livre | Temps cumulé des cinq livres les plus représentés et cumul du reste. |
| Progression et fin | Progression conservée séparément du statut. En PDF, la page du document est indiquée lorsqu’elle est connue. La source de la fin distingue le statut choisi manuellement, la fin détectée de l’EPUB et l’affichage de la dernière page du PDF. La détection automatique garde les seuils existants du lecteur. |
| Dates du livre | Première ouverture réussie enregistrée, dernière activité mesurée et date de la transition actuelle vers « Terminé » si disponible. Les données antérieures absentes sont libellées « Inconnue ». |
| Notes, surlignages et signets | Notes libres et notes associées à un surlignage sont comptées dans les notes. Un surlignage annoté compte aussi parmi les surlignages. Les signets sont comptés séparément. |
| Objectif | Livres actuellement terminés dont la date de fin connue tombe dans la période. Le rythme conseillé rapporte les livres restants aux jours civils restants. La progression cumulative suit les fins datées. L’interface distingue objectif en cours, atteint, dépassé et échu. |

L’ancien objectif pouvait utiliser `updatedAt` comme date de fin faute de `statusAt`. Cette approximation a été retirée du calcul périodique. Les livres concernés restent dans le total « Terminés » et dans le compteur de dates inconnues de l’objectif. Le compte périodique peut donc baisser après cette mise à jour. Les dates déjà enregistrées restent utilisables.

## Sessions, horloges et concurrence

Un geste réel sur le contenu de lecture, sa navigation ou son clavier démarre la mesure quand le document est visible et au premier plan. Un livre ouvert sans geste et le mouvement seul de la souris ne déclenchent pas le chronomètre. Une session cesse au bout de trois minutes sans geste, lors de la fermeture du lecteur, à la perte du premier plan ou lorsque le suivi détecte une suspension. Après interruption, un geste est nécessaire pour reprendre. La consultation des passages depuis le Carnet ne crée aucune session et conserve le comportement de consultation de la progression. Un zoom PDF, un changement de police, un changement de dimensions ou une recomposition EPUB actualisent le repère de page sans créditer de présentation.

L’application compare l’horloge murale et l’horloge monotone toutes les cinq secondes. Une tranche au-delà de 12,5 secondes, un saut d’horloge significatif ou un changement de fuseau arrête la mesure. Les tranches valides s’arrêtent à la limite d’inactivité. Elles sont découpées au prochain minuit construit dans le fuseau local, avec un nouvel identifiant de session au changement de jour. Cette règle permet les jours de 23 et 25 heures. Les jours civils déjà enregistrés restent ceux du moment de la lecture. Une durée enregistrée qui tombe sur un jour encore futur dans le nouveau fuseau reste disponible dans le total et dans le calendrier.

Un verrou exclusif Web Locks limite la mesure à un onglet de la même origine et du même profil navigateur. L’onglet doit aussi rester visible et avoir le focus. Les points d’écriture sont effectués environ toutes les 30 secondes et aux interruptions. Une fermeture brutale peut perdre le reliquat non écrit, typiquement jusqu’à une trentaine de secondes. Les échecs transitoires restent en mémoire et les écritures sont retentées. Le temps mesuré estime une présence active et dépend des gestes observés. Une lecture silencieuse prolongée peut être sous-estimée.

## Persistance et ZIP v1

- `readstats` garde ses clés et les totaux `seconds`, `pages`, `firstAt`, `lastAt`. Les lignes nouvelles ou enrichies contiennent un `journal` avec la part historique et une révision cumulative par identifiant de session pour le jour. Chaque révision contient la durée, les présentations et les bornes connues. L’écriture ne crée aucune ligne par geste ou par tic.
- `bookmeta` reçoit `firstOpenedAt`, `statusDay` et `finishSource` lorsque l’information existe. Une fusion conserve la première ouverture connue la plus ancienne. `settings` transporte la date de début du suivi.
- Le ZIP reste en version 1 et réutilise les tableaux `readstats`, `bookmeta` et `settings`. Une ancienne sauvegarde est restaurable même sans journal ni date de couverture. Les anciens lecteurs peuvent lire les totaux externes des lignes enrichies. Leur propre suivi reste soumis à leurs anciennes règles.
- En fusion, une paire d’agrégats purement historiques garde la priorité locale, comme dans le ZIP v1 précédent. Dès qu’un journal existe, la partie historique prend le plus grand total connu de chaque compteur. Des agrégats anciens sans identifiants ne peuvent pas être additionnés de manière fiable. Les sessions distinctes sont ajoutées et une session commune garde sa révision la plus élevée. Les sessions de deux appareils sont distinctes, même si leurs créneaux se chevauchent.
- Un remplacement restitue les lignes de l’archive. Un identifiant technique local, exclu du ZIP, invalide les écritures en attente d’avant le remplacement. Une écriture vérifie aussi l’existence du livre dans la même transaction. La suppression d’un livre efface ses statistiques via la cascade existante.

IndexedDB reste en v7. Les chemins utilisent uniquement des magasins et index existants et `ENABLE_V8_UPGRADE` reste à `false`. Le code commun peut fonctionner lorsque le magasin de fiches v8 est présent, sans en dépendre. Aucune migration n’a été exécutée. Les profils de lecture, les notes, les signets et les progressions utilisent leurs entrées de sauvegarde habituelles.

## Mesures sur données synthétiques

Edge headless dans un profil temporaire sur le poste de travail. Trois ouvertures par volume, 120 livres synthétiques et jusqu’à 1 825 jours d’activité. Les durées sont mesurées dans le navigateur. La colonne « Tableau de bord » inclut la lecture IndexedDB, l’agrégation et la construction du DOM. Elle s’arrête à la fin du rendu applicatif, avant d’éventuels coûts d’affichage du navigateur. Les résultats ne prédisent pas les temps sur téléphone.

| Sessions | Jours avec données | Lecture IndexedDB médiane | Agrégation médiane | Tableau de bord médian |
| ---: | ---: | ---: | ---: | ---: |
| 1 000 | 1 000 | 9,6 ms | 3,3 ms | 29,5 ms |
| 5 000 | 1 825 | 40,2 ms | 11,8 ms | 66,5 ms |
| 15 000 | 1 825 | 96,7 ms | 26,6 ms | 129,4 ms |

Le tableau de bord charge une fois les lignes statistiques et les clés de livres. La fiche utilise les index par livre. Le test interdit `getAll` sur `books` pendant l’ouverture de l’activité. La liste des sessions rend initialement douze lignes. Changer la période ou le regroupement réutilise le modèle en mémoire. L’ouverture de la bibliothèque n’effectue aucune lecture statistique pour préparer les graphiques. Les écritures de session sont regroupées et aucun agrégat général n’est recalculé au tourne-page.

## Tests réalisés

| Suite | Résultat et couvertures |
| --- | --- |
| `node tests/smoke.mjs --stats` | Horloge contrôlée, minuterie, minuit, jours de 23 et 25 heures, deux fuseaux, inactivité, suspension, rechargement, deux onglets et verrou, EPUB et PDF successifs, statuts et objectifs, Carnet, recomposition, historique incomplet, clavier et alternatives textuelles, suppression, fusion et remplacement ZIP v1. |
| `node tests/smoke.mjs --stats-benchmark` | 1 000, 5 000 et 15 000 sessions agrégées et affichées. |
| `node tests/smoke.mjs` | Régression générale, IndexedDB v7, EPUB et PDF, packs, concurrence, quota injecté, restauration et cache hors ligne. |
| `node tests/smoke.mjs --profiles` | Profils, ancrage EPUB, formats fixes, annotations, signets, restauration et coexistence des données statistiques. |
| `NC_UX=1` et `NC_NOTEBOOK=1` avec `tests/smoke.mjs` | Ergonomie précédente et Carnet, contrôle de la consultation sans écriture, exports et concurrence. |

Les scénarios de la phase 7 ont émulé 320 × 640, 844 × 390, 768 × 1 024 et 1 280 × 900. Ils ont contrôlé le confinement du panneau, la navigation du calendrier, la table textuelle et les retours de focus des dialogues. Aucun appareil physique ni lecteur d’écran n’a été utilisé.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `js/reading-stats.js` | Dates civiles, agrégations, états du calendrier et fusion des journaux. |
| `js/reading-tracker.js` | Horloges, sessions, verrou et écritures différées. |
| `js/stats-dashboard.js` | Vue globale et fiche, calendrier, graphiques avec table, sessions et objectifs. |
| `js/reader.js`, `js/epub-reader.js`, `js/pdf-reader.js` | Suivi depuis les gestes, événements de navigation et de recomposition, annulation du tourne-page à la fermeture. |
| `js/idb.js` | Transactions de suivi, lectures ciblées, merge ZIP v1 et métadonnées de lecture. |
| `js/library.js`, `js/goal.js`, `js/app.js` | Points d’accès, objectif et initialisation de l’interface. |
| `index.html`, `css/style.css`, `sw.js` | Structure, style et précache hors ligne. |
| `tests/reading-stats.mjs`, `tests/smoke.mjs`, `tests/reading-profiles.mjs` | Tests, banc de mesure et réutilisation de l’EPUB synthétique. |

## Points restant à valider avant la version stable

- Vérifier sur iOS, Android et les navigateurs de bureau le focus dans le lecteur EPUB, les gestes, la veille et la reprise. Un navigateur dépourvu de Web Locks affiche les cumuls et laisse le nouveau suivi actif indisponible pour éviter les doubles comptages.
- Vérifier les annonces et la lecture du tableau, du calendrier et des modales imbriquées avec VoiceOver, TalkBack et NVDA.
- Mesurer le coût d’ouverture sur appareils modestes au-delà de cinq ans d’activité et en présence de bibliothèques très volumineuses. Les mesures présentes portent sur un profil Edge headless et des données synthétiques.
- Les sessions passées, les fins non datées, les sessions perdues après un arrêt brutal et les états anciens d’objectifs édités restent inconnus. Une fusion de deux bibliothèques sans identifiants communs de livres ne peut pas rapprocher leur activité automatiquement.

La bibliothèque réelle, les fichiers EPUB et PDF du projet, le dossier `mises à jour` et les rapports précédents sont restés intacts. Les essais ont utilisé des profils jetables. Le travail est local.
