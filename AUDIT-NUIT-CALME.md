# Audit technique de Nuit Calme

16 novembre 2026 · Base V2.27 · Première passe locale

## 1. Diagnostic général

Nuit Calme est une liseuse statique sans serveur de données. Le HTML porte les vues, le CSS assure les mises en page et les états, et onze scripts classiques se partagent le namespace `NC`. `app.js` initialise la bibliothèque, les packs, l’objectif, la sauvegarde et le lecteur. `reader.js` relie les contrôleurs EPUB et PDF aux commandes, tiroirs, préférences et statistiques. Les moteurs et les polices sont embarqués.

Le modèle de stockage sépare utilement le fichier du livre de sa progression, de ses préférences et de ses annotations. Une rotation de page peut donc enregistrer la position avec une petite écriture. IndexedDB v7 contient dix magasins et les suppressions existantes de livres et de groupes ont déjà une transaction dédiée. Le stockage local du navigateur conserve aussi l’objectif de lecture et les préférences de bibliothèque. Une sauvegarde ZIP v1 transporte les données IndexedDB et l’objectif. Les filtres, le tri et les dates de rappel restent propres au navigateur.

La bibliothèque dispose déjà du tri, de la recherche par titre ou auteur, des rayons, des statuts et de l’édition des fiches. Le lecteur propose notamment la reprise, le sommaire, les signets, l’historique, les surlignages, les captures, la recherche et les statistiques. Le PDF propose des vignettes et un calque de texte. Un scan sans texte demande de l’OCR pour la recherche ou la sélection. L’EPUB prend en charge les notes textuelles et la typographie. Ces différences comptent pour la suite des tests et de la feuille de route.

Pour un usage personnel, l’architecture permet de garder les livres et annotations sur l’appareil, sans compte à gérer. Sur plusieurs appareils ou profils, chacun dispose de sa propre bibliothèque. Pour déplacer les données, il faut exporter puis restaurer. Deux onglets d’une même origine partagent les écritures IndexedDB alors que plusieurs vues conservent leurs propres copies en mémoire. Un changement d’origine ou l’effacement des données du site rend indispensable la sauvegarde pour retrouver la bibliothèque.

## 2. Problèmes détectés

| Gravité | Constat et conséquence | État |
| --- | --- | --- |
| Critique | **Remplacement non atomique.** Le code vidait les dix magasins et retirait l’objectif avant de lire les fichiers. Un livre absent, une clé invalide ou un échec d’écriture pouvait entraîner la perte de la bibliothèque antérieure. La fusion pouvait aussi laisser une restauration partielle. | Corrigé pour IndexedDB. L’objectif utilise une écriture distincte après validation et commit. |
| Élevée | **PDF malveillant.** PDF.js 3.11.174 activait par défaut une optimisation par évaluation de code. La faille pouvait être déclenchée au rendu par l’aperçu d’import, la réextraction de jaquette ou le lecteur. | Contournement officiel appliqué aux trois chemins. Mise à niveau du moteur à planifier. |
| Élevée | **Couplage du cache à toute l’origine.** L’activation supprimait les caches des applications voisines. Une navigation de même origine pouvait remplacer la page de secours, même avec une réponse d’erreur. Le worker mettait aussi en cache les packs téléchargés, en plus des livres déjà importés dans IndexedDB. | Cache dédié à la portée, ressources prévues à l’installation et secours réservé à la page de la liseuse. |
| Élevée | **Archives et documents volumineux ou forgés.** Le ZIP et ses livres sont matérialisés en mémoire. Les tailles déclarées par une archive et ses métadonnées restent des entrées non fiables. Les EPUB sont rendus sans scripts autorisés par epub.js, mais leurs ressources, liens et éventuelles requêtes externes méritent un contrôle spécifique. | Validation structurelle renforcée. Budgets de décompression, validation exhaustive, isolation EPUB et politique de ressources à traiter avant une ouverture publique. |
| Élevée | **Catalogue du checkout incohérent.** `packs/index.json` référence deux fichiers de démonstration absents, tandis que deux autres dossiers contiennent 144 fichiers `.epub` et trois fichiers avec le suffixe `. epub_`, exclus par le générateur. Le volume du dossier approche 251 Mo. | Constat local. À vérifier avec le workflow et les autorisations de diffusion des ouvrages avant d’ouvrir un catalogue public. |
| Moyenne | **Statistiques concurrentes.** Deux transactions de lecture puis d’écriture pouvaient écraser un incrément. En cas d’erreur, le reliquat était reversé dans les compteurs du livre actif, éventuellement différent. | Addition atomique et reprise par livre et par jour. |
| Moyenne | **Instantané de sauvegarde incohérent.** Les fichiers étaient lus avant les magasins associés. Une suppression ou un ajout concurrent pouvait produire un export mêlant des états différents. Le rappel rechargeait aussi tous les livres pour les compter. | Export dans une seule lecture IndexedDB et rappel via `count()`. |
| Moyenne | **Cycle de vie EPUB et PDF.** L’aperçu EPUB pouvait détruire le livre dès la lecture des métadonnées, avant la fin de son initialisation. Un échec du premier rendu pouvait laisser un moteur ouvert. Le cache du calque texte PDF augmentait avec le nombre de pages parcourues. | Initialisation EPUB attendue, nettoyage des ouvertures échouées et cache texte borné. |
| Moyenne | **Packs ZIP fragiles.** Un seul document illisible arrêtait l’aperçu des suivants. Deux imports groupés pouvaient se chevaucher. Une ancienne opération pouvait encore modifier le pack affiché après navigation. | Échec par entrée, réservation immédiate du lot, contrôle de la session active et annulation des téléchargements d’aperçu. |
| Moyenne | **Écritures concurrentes restantes.** Le rangement modifie une copie locale de la fiche alors que le lecteur peut promouvoir son statut. L’édition du titre et de la couverture réécrit une copie complète du livre. Un autre onglet peut avoir changé ou supprimé l’enregistrement entre-temps. | À traiter avec des mises à jour par champ en transaction, puis des notifications entre onglets. |
| Moyenne | **Décrochage sur grandes bibliothèques.** Le démarrage charge avec `allBooks()` les binaires de tous les livres, y compris pour afficher des fiches. Les imports en masse reconstruisent la grille à chaque ajout. Les packs conservent les fichiers déjà téléchargés durant l’aperçu. | Le rappel a été allégé. La séparation du catalogue et des binaires reste le chantier principal. |
| Moyenne | **Accessibilité.** Les commandes masquées de carte étaient inatteignables au clavier. Les modales reposent sur des mécanismes maison et le lecteur retire explicitement le focus après plusieurs actions. Les textes PDF positionnés au-dessus du canvas ne garantissent pas un ordre de lecture accessible. | Commandes de carte visibles au focus et sur les appareils sans survol. Parcours modal, lecteur d’écran et ordre du texte à vérifier. |
| Moyenne | **Durée et progression approximatives.** Les passages au même endroit peuvent être comptés à nouveau après navigation. Le mode EPUB défilant ne comptabilise pas les pages de la même manière. Les fins de session et passages de minuit utilisent des heuristiques, et un navigateur peut interrompre une écriture en quittant la page. | Cumul fiabilisé. Définition des mesures, persistance de dernier recours et sessions actives à revoir. |
| Faible | **Dette d’intégration.** Les scripts globaux ont un ordre implicite, les contrôleurs répètent des règles de sélection et de persistance, et certaines fonctions IndexedDB ainsi que `NC_DEBUG` servent surtout de points de diagnostic. La version apparaît en plusieurs endroits. Les bundles sont copiés directement dans `vendor/`. | Conserver les interfaces utilisées pour le diagnostic, inventorier les appels puis retirer les exports inutiles avec les tests. Centraliser l’inventaire des versions et licences. |

Pour PDF.js, le contournement de la faille de 2024 consiste à désactiver `isEvalSupported`. Le moteur est ancien et les versions récentes ont leur propre historique d’avis. La mise à niveau devra vérifier le worker, le rendu du calque texte, les annotations et la configuration de sécurité. [Avis Mozilla de 2024](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq) · [Avis Mozilla sur les versions ultérieures](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j)

## 3. Corrections livrées et fichiers

| Fichier | Modification |
| --- | --- |
| `js/idb.js` | Lecture cohérente de la sauvegarde, restauration des dix magasins dans une transaction, cumul des statistiques par transaction, comptage direct et remise à zéro de la connexion mémorisée quand la base se ferme. |
| `js/backup.js` | Vérification du format, des collections, des identifiants en double, de la présence et des tailles déclarées des fichiers, puis préparation des binaires avant écriture. Échec d’archive incomplète signalé aussi en fusion. Signalement distinct si l’écriture de l’objectif échoue après le commit. |
| `js/library.js` | Chargement PDF avec évaluation désactivée, libération de la tâche de chargement, attente de l’initialisation EPUB avec délai borné et réutilisation du même chemin pour la couverture d’origine. |
| `js/pdf-reader.js` | Même protection PDF, cache du calque texte plafonné à 24 pages et nettoyage en cas d’échec initial. |
| `js/epub-reader.js` | Nettoyage du contrôleur si l’ouverture initiale échoue. |
| `js/reader.js` | Relance des écritures statistiques sous leur identifiant d’origine, garde d’ouverture autour des lectures asynchrones et gestion de l’absence du plein écran. |
| `js/packs.js` | Traitement indépendant des entrées ZIP, annulation des aperçus réseau et protection de l’interface contre les tâches d’une session précédente. |
| `sw.js` | Cache nommé par portée, accès limité au pré-cache et secours de navigation limité aux deux URL d’entrée. Nouvelle clé de cache pour diffuser les scripts corrigés. |
| `css/style.css` | Boutons de carte accessibles lorsque la carte ou un de ses boutons reçoit le focus. Commandes visibles sur les appareils sans survol. |
| `tests/smoke.mjs` | Vérifications reproductibles dans un Chromium isolé avec un serveur HTTP local et des livres générés pour le test. |

Le schéma IndexedDB reste v7 et le format de sauvegarde reste v1. Les règles de fusion existantes continuent de départager la progression, les préférences et la fiche par leur horodatage. Les notes, paramètres et statistiques déjà présents restent prioritaires lorsqu’ils portent le même identifiant. Un ancien cache sans portée peut rester sur disque. Son nom ne permet pas de savoir quelle installation l’utilise sur une origine partagée.

## 4. Vérifications

Le scénario d’intégration lance Edge sur une origine locale dédiée dans un profil temporaire. Il sert l’application sous `/liseuse/`, comme un site hébergé sous le chemin d’un projet. Les fichiers EPUB et PDF synthétiques ne dépendent ni du catalogue ni d’un service distant.

- Démarrage et contrôle par le service worker, import EPUB/PDF, affichage des fiches, recherche de texte dans les deux formats et reprise du PDF en page 2.
- Export ZIP v1 puis fusion et remplacement, avec contrôle du contenu restauré, des réglages, d’un signet et d’une annotation. Une archive à laquelle manque un livre est rejetée et la bibliothèque ainsi que l’objectif restent présents. Une écriture invalide après les demandes d’effacement annule toute la transaction.
- Douze ajouts statistiques simultanés par la même connexion donnent 60 secondes et 12 pages.
- Un pack ZIP contenant un EPUB invalide et un PDF valide laisse le PDF importable. Le déclenchement répété du lot n’ajoute qu’un exemplaire. Le focus clavier sur la carte révèle ses actions.
- Lecture de l’index des packs sur le réseau sans l’ajouter au cache, puis rechargement hors ligne et reprise du PDF importé.
- Analyse de syntaxe avec `node --check` et contrôle du diff Git avec `git diff --check`.

L’incident de fermeture EPUB détecté au premier essai a été corrigé puis le scénario a réussi. Les tests ci-dessus utilisent les moteurs réels et IndexedDB sous Edge. Ils ne couvrent pas les quotas réels, la fermeture forcée pendant une écriture, les gros volumes, les manipulations simultanées dans deux onglets, une mise à jour de service worker entre deux versions, les DRM, les PDF scannés et complexes, ni les tests sur Safari, Firefox et appareils physiques. Les annotations et le signet ont été vérifiés en stockage/restauration. Leur interaction visuelle, la sélection tactile, les captures et les lecteurs d’écran demandent des scénarios dédiés.

Reproduction avec Node.js 22 ou ultérieur et Edge sur Windows ou Chromium sur les autres systèmes.

```text
node tests/smoke.mjs
```

`NC_BROWSER` permet de choisir un autre binaire Chromium. Ajouter ensuite des scénarios de mise à jour PWA et deux onglets sur une même origine, puis des tests de navigation et de sélection sous Chromium, WebKit et Firefox. Une petite collection de fichiers synthétiques peut couvrir les EPUB reflowables et à mise en page fixe, le texte de droite à gauche, les couvertures manquantes, les PDF mixtes, les archives malformées et l’évolution des schémas. Réserver le profilage mémoire et l’accessibilité à des parcours reproductibles de 100 à 300 livres sur un appareil mobile.

## 5. Travaux restant à arbitrer avant une ouverture publique

- **Intégrité et récupération.** Vérifier le contenu et les sommes de contrôle par entrée, borner la décompression et tester les quotas. Mesurer le coût d’une restauration atomique d’une bibliothèque de plusieurs centaines de mégaoctets. Évaluer un journal de restauration ou un format exportable en flux et l’intégration de l’objectif dans IndexedDB. Une option de sauvegarde chiffrée exigera une gestion explicite de la phrase secrète et de sa récupération.
- **Sécurité des moteurs.** Mettre à jour les dépendances avec une matrice de fichiers et de navigateurs, analyser les chemins d’inclusion réseau des EPUB, imposer une politique de contenu adaptée et vérifier la résistance aux EPUB et PDF hostiles. Les tests fonctionnels de cette passe ne tentent pas d’exploiter les moteurs.
- **Concurrence et mises à jour.** Synchroniser les changements de métadonnées et décider comment arbitrer deux positions différentes, une suppression ou une restauration pendant une lecture. Le service worker sert un pré-cache fixe pour ses ressources et cherche la page sur le réseau. Un déploiement en plusieurs étapes peut encore mélanger une page et ses scripts. Concevoir un paquet de publication cohérent et un message invitant à recharger hors d’une lecture.
- **Distribution et hébergement.** Vérifier la provenance et les autorisations de diffusion de chaque titre avant de publier les packs. Contrôler la régénération de l’index avec une exécution locale en lecture seule. Le workflow y inscrit une date à chaque génération, ce qui peut créer des commits même lorsque le catalogue est identique.

## 6. Améliorations priorisées

| Priorité | Proposition et intérêt | Complexité et dépendances |
| --- | --- | --- |
| P0 | **Sauvegardes vérifiables et stockage durable.** Montrer la taille occupée, le contenu de l’archive et la date d’une vérification. Faciliter le déplacement vers un autre appareil. | Élevée. API Storage, contrôle d’intégrité, mesure des quotas, format versionné et corpus de reprises. |
| P0 | **Lecture accessible.** Une navigation au clavier continue, un vrai parcours de focus modal et un accès direct au texte au lecteur d’écran. | Moyenne à élevée. Sémantique des commandes, tests clavier, VoiceOver, NVDA, calque texte et ordre de lecture. |
| P0 | **Imports et mises à jour prévisibles.** Produire des erreurs actionnables par fichier et isoler les fichiers coûteux ou invalides. Déployer des ressources d’une même version. | Élevée. Workers, budgets d’archives, dépendances maintenues, tests PWA et politique de ressources. |
| P1 | **Catalogue de métadonnées léger.** Rendre la grande bibliothèque instantanément parcourable. Ajouter tags, collections multiples et détection de doublons par empreinte du fichier. | Élevée. Catalogue distinct, migration additive versionnée, chargement différé des couvertures et index. |
| P1 | **Profils de lecture et mise en page.** Garder une typographie adaptée à chaque genre, un thème horaire optionnel et une bonne lecture en orientation portrait. | Moyenne. Extension des préférences, tests de reflow et compatibilité des CFI. |
| P1 | **Carnet transversal de notes.** Retrouver les citations, filtrer par livre et couleur, exporter en Markdown et réancrer un passage quand la mise en page change. | Moyenne à élevée. Identifiants de livres, CFI et contexte textuel, coordonnées PDF, index local. |
| P1 | **Recherche locale progressive.** Rechercher dans la bibliothèque, naviguer dans les occurrences et interrompre un travail long. OCR lancé à la demande pour les scans. | Élevée. Worker d’indexation, extraction EPUB/PDF, budget disque, moteur OCR et fichiers de langue. |
| P1 | **Mode voyage.** Afficher les livres prêts, l’espace disponible et proposer un test de disponibilité hors ligne avant de partir. | Moyenne. Cache versionné, IndexedDB, remontée des états d’installation et tests iOS/Android. |
| P1 | **Statistiques lisibles.** Distinguer temps actif, rythme et passages visités, avec ventilation par jour et export CSV. | Moyenne. Règles de comptage explicites, fuseaux horaires, agrégats compatibles et session de référence. |
| P2 | **Synchronisation facultative.** Retrouver d’abord ses positions et notes sur deux appareils, avec arbitrage visible des conflits et transfert des fichiers sur demande. | Élevée. Identité, stockage distant ou fichier de synchronisation, chiffrement, suppression propagée et fonctionnement hors ligne. |
| P2 | **Partage entre amis.** Partager une liste commentée, une citation ou un lien vers un passage quand chacun a l’ouvrage. | Moyenne à élevée. Identité d’édition, format de lien, choix de confidentialité et canal de partage. |
| P2 | **Reprise douce.** Afficher au retour la dernière phrase lue et ses propres notes autour, avec un voile de fin de session facultatif. | Moyenne. Localisateurs EPUB/PDF, extraction locale de contexte et réglage du rythme. |
| P2 | **Lecture à voix haute et accès au texte.** Offrir une reprise au paragraphe, une synthèse contrôlable et un mode linéaire pour les textes extraits des PDF. | Élevée. Couche de texte, segmentation par langue, synthèse vocale et essais mobiles. |

## 7. Feuille de route

1. **Fiabiliser l’usage personnel.** Rejouer les tests d’intégration sur les navigateurs cibles, écrire les scénarios de concurrence et de mise à jour, vérifier la récupération après échec, corriger le cycle du focus et tester les archives de grande taille.
2. **Préparer un partage privé.** Mettre à jour les moteurs, vérifier l’isolation des documents et la provenance du catalogue, fiabiliser la publication PWA, puis faire un essai sur iPhone, Android et une tablette avec un petit groupe.
3. **Faire évoluer la liseuse.** Charger la bibliothèque depuis un catalogue léger, rendre la recherche et le carnet utilisables en dehors d’un livre, améliorer les profils typographiques et fiabiliser les indicateurs de lecture.
4. **Ouvrir les fonctions réseau sur choix explicite.** Tester la synchronisation de données légères et le partage de références entre amis. Évaluer le transfert de livres après avoir défini la confidentialité, les coûts et le comportement des appareils hors ligne.
