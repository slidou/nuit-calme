# Nuit Calme · Audit UX/UI et expérience de lecture

16 novembre 2026 · Phase 4

## Diagnostic

Nuit Calme a une identité lisible. Cormorant Garamond distingue le livre et les titres, Inter sert les commandes, et le charbon et l’or structurent les états. La bibliothèque et les lecteurs partagent ce langage visuel. L’enjeu principal se situe dans les transitions entre vues et panneaux, la densité des commandes et le maintien du contexte. Les corrections conservent les polices, les thèmes et les fonctions existantes.

| Priorité | Parcours et constat | Traitement |
| --- | --- | --- |
| P1 | **Clavier et modales.** Le lecteur retirait le focus après l’activation d’un outil. Plusieurs dialogues affichaient un voile sans contenir Tab, et les panneaux ouverts après une reconstruction du DOM pouvaient rendre le focus à un élément absent. | Focus initial, boucle Tab et Maj+Tab, arrière-plan inerte, Échap et restitution du focus pour les modales. Le mémo non modal dispose d’un bouton Fermer. Lecture et rangement accessibles depuis les fiches. |
| P1 | **Téléphone et tablette.** La barre des quatorze outils partageait une ligne avec le titre et débordait sur certaines largeurs. En vue courte, les filtres, la fiche d’objectif et les actions pouvaient consommer la hauteur de la bibliothèque. Des champs à 13,5 px et certains panneaux à hauteur fixe réduisaient la marge en présence du clavier. | Barre adaptée en lignes, titre lisible, bibliothèque et packs défilants sur petits écrans, panneaux confinés à la zone visible, champs tactiles de 16 px et contrôles espacés. |
| P1 | **Sauvegarde et restauration.** La confirmation de remplacement expirait après six secondes. Le choix pouvait s’armer après fermeture de la modale si la lecture du ZIP finissait tard. Le texte de fusion généralisait la règle des dates. | Confirmation explicite avec date et nombre de livres, annulation visible, prévisualisation périmée ignorée et description plus précise de chaque mode. Le remplacement exige toujours une deuxième action. |
| P1 | **Lisibilité, focus visible et mouvements.** Les libellés secondaires étaient difficiles à lire sur les panneaux et plusieurs champs supprimaient le contour de focus. L’option de réduction des mouvements raccourcissait l’animation CSS de la feuille tout en laissant le délai JavaScript. | Contraste des textes secondaires relevé, contour clavier étendu aux contrôles, page tournée sans animation ni délai de feuille sous réduction des mouvements. |
| P2 | **Accueil et import.** L’état vide expliquait comment importer alors que l’action utile se trouvait dans l’en-tête. Les erreurs d’import et la progression étaient déjà accompagnées de toasts. | Accès direct à l’import dans l’état vide, message de stockage local commun aux appareils. Conservés pour la suite, un récapitulatif d’import consultable et des erreurs par fichier qui persistent après le toast. |
| P2 | **Navigation entre vues et ouverture du lecteur.** L’ouverture d’une fiche et la sortie du lecteur perdaient le point de navigation. Des outils étaient visuellement disponibles pendant que le moteur chargeait. | Focus dans la zone de lecture, indication de chargement, outils dépendants du moteur désactivés pendant l’ouverture, retour à la fiche, focus restitué lors de la navigation dans les packs. |
| P2 | **Lecture EPUB, PDF et réglages.** L’EPUB offre quatre thèmes, un réglage par livre et un mode de défilement qui repart du CFI. Une nouvelle police ou un nouvel interlignage provoque un reflow, dont la stabilité doit encore être évaluée sur chapitres longs. Le PDF conserve une position relative au zoom et revient à 100 % lors d’un changement d’ajustement. Sa dernière page pouvait afficher un pourcentage inférieur à 100 %, et ses marges étaient trop grandes sur téléphone. | Marges PDF adaptées à la scène et calcul du pourcentage aligné sur le saut par page. Les réglages annoncent leur état, prennent le focus et restent dans la zone visible. |
| P2 | **Recherche, sommaire et passages.** La recherche était accessible par raccourci, mais l’arrivée dans le tiroir et le retour n’étaient pas prévisibles. Les annonces d’état manquaient. Le sommaire et les vignettes proposent déjà une navigation directe. | Focus dans la recherche ou sur Fermer, résultats et erreurs annoncés sans lire chaque incrément de progression, pourcentage exprimé sur le curseur. Les raccourcis de caractère sont limités à la zone du livre, y compris l’iframe EPUB. |
| P2 | **Sélection, signets et annotations.** Le menu positionné par un décalage fixe se superposait parfois au passage. Les pastilles étaient petites. Les signets fournissent déjà un ruban et un accès depuis le sommaire. La note EPUB et la sélection PDF suivent des parcours distincts. | Menu ancré sur la sélection et borné à la zone visible, pastilles agrandies, champs étiquetés, et retour au tiroir après un dialogue d’annotation ou d’export. La sélection et le zoom natifs sur appareils physiques restent à examiner. |
| P2 | **Immersion et concentration.** Le tactile de retour des commandes pouvait rester masqué en concentration. Au clavier, la mise au point d’un contrôle masqué n’avait pas de manifestation visuelle. | Le tap central permet de retrouver les commandes en concentration. Les barres redeviennent visibles quand un contrôle reçoit le focus clavier. |
| P2 | **Objectifs et statistiques.** Une partie du formulaire utilisait des libellés sans liaison au champ. Les statistiques affichent le temps actif et des pages vues, avec une définition particulière en EPUB défilant. | Étiquettes associées, prévisualisation de l’échéance annoncée, focus préservé quand l’objectif se reconstruit. Les règles de calcul restent celles de l’application. |
| P3 | **Packs.** L’attente de l’index n’était pas signalée, le message vide parlait d’un push Git, et l’erreur d’une archive pouvait laisser un bouton en « Chargement… ». | Chargement et erreur annoncés, état vide centré sur la disponibilité des packs, action terminée en cas d’échec. |

Sur les fonds unis mesurés, le contraste du texte secondaire est passé de **3,59 à 5,67:1** sur le fond principal, de **3,29 à 5,21:1** sur un panneau et de **2,98 à 4,71:1** dans les popovers. Ces calculs portent sur les couleurs de base. Les fonds translucides, les illustrations et les contenus des livres demandent une validation distincte. Les cibles de couleurs atteignent 24 px dans le tiroir et 28 px dans le menu de sélection. [WCAG 2.2, contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [Taille minimale des cibles](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Le cycle du focus des panneaux modaux suit le modèle WAI-ARIA. Les raccourcis de lettre restent disponibles lorsque le livre a le focus, avec une interaction distincte dans les champs de recherche et d’annotation. [Modèle de dialogue WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) · [Raccourcis de caractères](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)

## Fichiers modifiés

| Fichier | Intervention |
| --- | --- |
| [index.html](index.html), [css/style.css](css/style.css) | Accessibilité des commandes et états, contraste, cibles tactiles, barre et panneaux responsives, état vide et réduction des mouvements. |
| [js/util.js](js/util.js) | Gestion du focus des modales et placement des panneaux selon la zone visible. |
| [js/library.js](js/library.js), [js/packs.js](js/packs.js) | Navigation et focus des vues et actions, fiches accessibles, chargements et états des packs. |
| [js/reader.js](js/reader.js), [js/epub-reader.js](js/epub-reader.js), [js/pdf-reader.js](js/pdf-reader.js), [js/touch.js](js/touch.js) | Raccourcis du livre, tiroirs, réglages, sélection et navigation sans animation. |
| [js/backup.js](js/backup.js), [js/goal.js](js/goal.js) | Confirmation de restauration, cycle modal et labels du formulaire d’objectif. |
| [sw.js](sw.js) | Nouvelle clé de pré-cache pour la feuille de style, le HTML et les scripts de cette phase. |
| [tests/smoke.mjs](tests/smoke.mjs) | Parcours UX automatisé dans le profil temporaire existant, canaux clavier et toucher, contrôles de géométrie et captures facultatives. |

## Contrôles et limites

Le scénario UX utilise des EPUB et PDF synthétiques dans Edge headless sous Windows. Il envoie les touches via DevTools et vérifie la cible du focus, la boucle des modales, les actions et les états dans le DOM. La suite de régression d’origine couvre séparément l’intégrité des restaurations, IndexedDB et le hors-ligne. Le scénario UX se relance ainsi sous PowerShell.

```powershell
$env:NC_UX = '1'
node tests/smoke.mjs
Remove-Item Env:NC_UX
node tests/smoke.mjs
```

Les deux suites Edge ont réussi. Le scénario UX a exercé le champ de fichiers, la confirmation de sauvegarde, les modales imbriquées, la recherche EPUB, les notes, l’export, les signets et les vignettes PDF, un surlignage PDF, les statistiques, la réduction des mouvements et le retour depuis les packs. Il a aussi vérifié un tap émulé sur le bouton de thème.

| Taille émulée | Contrôle |
| --- | --- |
| 1 440 × 900 | Vue ordinateur, focus, clavier et panneaux imbriqués. |
| 320 × 640, 390 × 844 | Titre et barre d’outils visibles, progression accessible et panneau de réglages dans l’écran. |
| 667 × 375 | Même contrôle en paysage, scène de lecture de 228 px de haut dans le scénario PDF. |
| 768 × 1 024, 1 024 × 768 | Même contrôle sur deux orientations de tablette. |
| 390 × 320 | Tiroir de recherche maintenu dans la hauteur réduite. |

Quatre captures des vues ordinateur et téléphone ont été inspectées. `NC_UX_OUT` permet de les enregistrer dans un dossier choisi. Les contrôles en hauteur réduite et au toucher restent des émulations. Il reste à vérifier le clavier virtuel et les gestes natifs sur iOS et Android, Safari et Firefox, VoiceOver, TalkBack et NVDA, le zoom navigateur à 200 %, les livres réels à mise en page fixe, les PDF scannés et les longues sessions de lecture. L’ordre de lecture du calque PDF dépend toujours du document et du moteur. La sélection clavier dans une iframe EPUB et le passage de la sélection au menu parent nécessitent aussi un essai dédié.

## Suite proposée

1. **Priorité haute · Lire et annoter avec des technologies d’assistance.** Tester le focus, les changements de chapitres et les annonces avec VoiceOver, TalkBack et NVDA. Prototyper un parcours de sélection clavier et vérifier l’ordre du texte des PDF. La faisabilité du mode texte PDF dépend de la qualité du calque fourni par le document.
2. **Priorité haute · Préserver un passage lors du reflow.** Mesurer les petits sauts après changement de police, de taille, de mode et d’orientation sur de longs chapitres. Évaluer un ancrage visible qui combine CFI et court extrait.
3. **Priorité moyenne · Hiérarchie des outils mobiles.** Prototyper une barre qui laisse visibles les actions de lecture fréquentes et regroupe les outils ponctuels. Comparer le nombre de gestes, l’ordre du focus et la place disponible dans les deux orientations avant décision.
4. **Priorité moyenne · États récupérables.** Étudier des comptes rendus d’import et de restauration consultables, avec détail d’un échec, possibilité de réessayer un fichier, avertissement de quota et mémorisation du dernier récapitulatif.
5. **Phase ultérieure · Fonctions à valider.** Carnet transversal de citations, lecture à voix haute, profils typographiques personnels, repères de chapitre dans la barre de progression et mode texte linéaire pour les PDF. Pour les statistiques, distinguer les pages affichées du temps actif et étudier un aperçu hebdomadaire accessible.

Le schéma IndexedDB et le drapeau `ENABLE_V8_UPGRADE = false` sont inchangés. Les livres et le dossier `mises à jour` n’ont pas été modifiés. Aucun push ni déploiement n’a été effectué.
