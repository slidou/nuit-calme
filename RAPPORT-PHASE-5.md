# Nuit Calme · Carnet transversal

16 novembre 2026 · Phase 5

## Utilisation

Le bouton **Carnet** de la bibliothèque réunit les notes personnelles, les surlignages et les signets. La carte affiche le livre, l’auteur si disponible, le type d’entrée, sa couleur et sa date enregistrées. La citation et le texte personnel sont présentés dans deux blocs distincts. Une citation vient du texte sélectionné qui existe déjà dans l’annotation. Un signet sans extrait reste un repère.

La recherche couvre les extraits, les notes, le titre, l’auteur et la référence disponible. Les mots peuvent être répartis entre les champs. La casse et les accents sont ignorés. Les filtres livre, type, couleur et date se combinent. Le type « Avec citation » sélectionne les entrées qui contiennent un extrait. Les dates proposent les 30 derniers jours, l’année en cours et les entrées sans date. Le tri propose les dates croissantes ou décroissantes, puis le titre du livre. Une date absente est classée après les dates connues.

**Consulter** affiche l’entrée complète. Les notes personnelles peuvent être modifiées et chaque suppression dans le Carnet demande une confirmation explicite. Un échec d’écriture conserve le brouillon. La confirmation compare l’entrée relue dans IndexedDB avec la version affichée. Une note concurrente est protégée même si le formulaire est resté ouvert dans l’autre onglet. Dans le tiroir du lecteur, la suppression d’une annotation demande également une confirmation.

**Aller au passage** ouvre un PDF à la page enregistrée ou un EPUB avec son CFI lorsque le moteur peut le résoudre. Un EPUB peut se replier sur le début de la section enregistrée. Si aucun repère utilisable ne subsiste, le lecteur indique le repli vers la position habituelle. Une entrée orpheline reste consultable et son livre est signalé comme indisponible. Les références utilisent uniquement les champs existants, par exemple une page ou un numéro de section.

L’ouverture depuis le Carnet est une **consultation**. La visite conserve la progression principale, le statut, l’historique et les statistiques. Les outils de lecture continuent de fonctionner et une modification volontaire d’annotation reste une écriture normale. Le bouton **Retour au carnet** restitue la recherche, les filtres, l’ordre et la position de défilement. Il redonne le focus à l’entrée si elle est encore affichée.

**Exporter le carnet** inclut toutes les entrées. **Exporter les résultats** capture la sélection des filtres. Le fichier Markdown regroupe par livre, indique l’auteur et la référence quand ils sont connus, et identifie les citations et les notes personnelles. Les retours à la ligne et les lignes vides sont encodés dans les blocs de texte, avec échappement de la ponctuation Markdown. Le navigateur génère le fichier localement.

## Architecture et fichiers

Le Carnet lit `annotations`, `bookmarks` et les clés de `books` dans une transaction de lecture. Il réutilise les fiches déjà chargées par la bibliothèque et reçoit les changements de titre et d’auteur sous forme de fiches légères. Lister et filtrer le Carnet ne lit pas les fichiers EPUB/PDF. Ouvrir un passage charge uniquement le livre correspondant. IndexedDB v7, les identifiants et le contenu du ZIP v1 restent ceux des phases précédentes.

La recherche prépare les champs normalisés en mémoire puis filtre et trie les résultats. La préparation rend la main toutes les 250 entrées et la vue monte les cartes par lots de 40. Le filtrage et l’export couvrent toutes les correspondances, y compris celles qui ne sont pas encore affichées. Les transactions existantes restent la source des écritures. Les notifications post-commit propagent les insertions, éditions, suppressions et restaurations entre le Carnet et les lecteurs d’autres onglets.

| Fichiers | Rôle |
| --- | --- |
| [js/notebook.js](js/notebook.js) | Vue, recherche, filtres, fabrication progressive des cartes, détail et export Markdown. |
| [index.html](index.html), [css/style.css](css/style.css) | Accès principal, présentation du Carnet, dialogue et adaptations mobiles. Cormorant Garamond, Inter et palette existante. |
| [js/idb.js](js/idb.js), [js/library.js](js/library.js) | Instantané sans binaires, garde sur les écritures concurrentes et notifications après commit. |
| [js/reader.js](js/reader.js), [js/epub-reader.js](js/epub-reader.js), [js/pdf-reader.js](js/pdf-reader.js) | Visite sans mise à jour de la reprise et repli sur un repère exploitable. |
| [js/app.js](js/app.js), [sw.js](sw.js) | Initialisation et inclusion du Carnet dans le pré-cache hors ligne. |
| [tests/notebook.mjs](tests/notebook.mjs), [tests/smoke.mjs](tests/smoke.mjs) | Parcours d’intégration et mesures dans les profils synthétiques. |

## Mesures

Edge headless sous Windows, bibliothèque déjà ouverte, deux livres synthétiques et trois passages par taille. Le premier délai va du clic sur **Carnet** à l’affichage du résultat et du premier lot dans le DOM. Le second va de la saisie d’un terme sélectif au compteur filtré et inclut l’attente de saisie de 100 ms.

| Entrées | Ouverture médiane | Recherche médiane | Cartes au premier lot |
| ---: | ---: | ---: | ---: |
| 10 | 4,1 ms | 107,7 ms | 10 |
| 100 | 10,5 ms | 108,2 ms | 40 |
| 1 000 | 21,3 ms | 107,0 ms | 40 |
| 5 000 | 116,4 ms | 107,5 ms | 40 |

Le test bloque la lecture intégrale du magasin `books` pendant ces ouvertures. Les mesures portent sur les délais DOM du corpus synthétique. Le temps du premier affichage visuel, le pic mémoire, un téléphone physique et les bibliothèques contenant des milliers de livres distincts n’ont pas été mesurés.

## Vérifications

- Création d’une note EPUB via le menu de sélection et d’un surlignage PDF à la page 2. Présence dans le Carnet, présentation d’un signet sans citation, recherche accentuée et filtres combinés.
- Ouverture EPUB, PDF et repli sur une section EPUB ou la reprise PDF en cas de repère invalide. Conservation des filtres, du focus, de la progression et des statistiques du livre dans les scénarios de consultation.
- Modification du seul texte d’une note, conservation de sa couleur et de son CFI, protection d’un brouillon et rejet d’une confirmation de suppression périmée dans deux onglets Edge.
- Suppression confirmée depuis le Carnet et disparition du surlignage PDF dans l’autre onglet. Suppression depuis le contrôleur EPUB et disparition dans le Carnet.
- Export complet et filtré. Vérification du contenu du Blob Markdown généré, du groupement, des séparateurs et de l’échappement sur un commentaire multiligne.
- Export et restaurations ZIP v1 des annotations et signets. Suites de régression EPUB/PDF, IndexedDB, packs, service worker, clavier et tailles d’écran de la phase 4 passées dans Edge.
- Rendu inspecté en 1 440 × 1 000 et en émulation téléphone 390 × 844.

Reproduction sous PowerShell avec Node.js 22+ et un binaire Edge ou Chromium disponible.

```powershell
$env:NC_NOTEBOOK = '1'
node tests/smoke.mjs
Remove-Item Env:NC_NOTEBOOK
node tests/smoke.mjs
```

`NC_NOTEBOOK_OUT` permet d’enregistrer les captures dans le dossier choisi. Les tests de création et de rendu emploient des EPUB/PDF synthétiques. Le nom du fichier téléchargé et le Blob ont été vérifiés via l’interface d’export locale. Le gestionnaire de téléchargements de l’appareil, les lecteurs d’écran, Safari, Firefox et Android ou iOS physiques restent à tester.

## Limites et évolutions

- **Ancrage des citations.** Un CFI résolu identifie un repère dans le document, avec une précision qui dépend du livre et de sa mise en page. Ajouter un réancrage par extrait et contexte nécessiterait des tests sur plusieurs éditions. Les rectangles PDF sont utilisés par le lecteur pour dessiner le surlignage. Le Carnet envoie à la page, sans calculer un défilement exact au rectangle.
- **Lecture des données anciennes.** Les anciens enregistrements peuvent ne contenir ni extrait, ni date, ni nom de chapitre. Les noms de chapitre ne sont pas extraits à l’ouverture du Carnet. Les références disponibles permettent encore de se repérer. Les notifications immédiates entre onglets utilisent BroadcastChannel, et une réouverture ou le retour de visibilité relit les données.
- **Organisation.** Les prochaines améliorations possibles sont le filtre par catégorie existante, des sélections réutilisables et un export d’un seul livre directement depuis son groupe. Les filtres restent en mémoire pendant la navigation, puis repartent de leur valeur initiale après rechargement complet.
- **Passer de la consultation à la lecture.** Une commande volontaire pourrait reprendre le suivi principal à partir du passage, après avoir affiché la position actuelle à conserver ou remplacer.

Les essais ont utilisé IndexedDB v7 dans des profils temporaires. `ENABLE_V8_UPGRADE` est resté à `false`. Les livres et le dossier `mises à jour` ont été préservés. Aucun push ni déploiement n’a été effectué.
