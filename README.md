# Nuit Calme — Liseuse EPUB & PDF

> Une liseuse qui s'ouvre dans votre navigateur. Bibliothèque locale, double page comme un vrai livre, charbon & doré.

![Le lecteur en vue double page](docs/apercu-lecteur-epub.png)

![La bibliothèque](docs/apercu-bibliotheque.png)

## ✨ Caractéristiques

- **Bibliothèque persistante** — vos livres restent dans votre navigateur (IndexedDB) : couvertures, auteurs, position de lecture. Rien ne quitte votre ordinateur.
- **Sauvegarde & restauration** — un bouton « Sauvegarde » rassemble toute la bibliothèque — livres, couvertures, soulignages & notes, signets, progression, passages, statistiques, groupes, réglages et objectif de lecture — dans un seul fichier daté (`nuit-calme-sauvegarde-AAAA-MM-JJ.zip`), à garder sur une clé USB, un autre disque ou votre nuage. La restauration se fait en **fusion** (rien n'est effacé, les données les plus récentes gagnent — idéal pour changer d'ordinateur) ou en **remplacement** (la bibliothèque redevient exactement celle de la sauvegarde, avec double confirmation). Comme on n'y pense jamais : une ligne d'état dans le pied de page (« sauvegarde : il y a 12 jours ») et, passés trente jours sans export, une invitation discrète — renvoyable « Plus tard ».
- **Import en masse** — glissez plusieurs livres d'un coup, ou un dossier entier : une seule pastille de progression, la bibliothèque se remplit au fil de l'eau, et un récapitulatif signale les fichiers refusés (et pourquoi).
- **Packs de livres** — un espace « Packs » propose des collections préparées par l'hébergeur du site (dossier `packs/`) : couvertures extraites à la volée, repérage de ce qui est déjà dans votre bibliothèque (« Déjà là »), import d'un pack entier (doublons sautés, pastille de progression) ou livre par livre. Les copies rejoignent votre bibliothèque comme des livres ordinaires — retirer un pack du site ne retire rien à personne.
- **Application installable (PWA)** — « Installer l'app » pose Nuit Calme sur l'écran d'accueil du téléphone (ou dans les applications de l'ordinateur) : icône dédiée — le livre doré sous la lune —, démarrage en plein écran sans barres de navigateur, encoches et barre de geste du téléphone respectées. Sur iPhone, où Safari installe par son menu Partager, le bouton explique le geste. Un service worker garde la coquille de l'app en cache : une fois visitée, la liseuse s'ouvre même sans réseau — et comme les livres vivent dans le navigateur, la lecture suit hors-ligne.
- **Statut de lecture & groupes** — À lire / En cours / Terminé, posés tout seul (l'ouverture fait passer « En cours », la fin du livre « Terminé ») ou à la main depuis le menu de chaque livre ; des groupes à créer librement — comme des rayons — et des filtres à compteurs pour ne montrer que ce qu'on cherche.
- **Recherche et tri** — retrouvez un livre d'une frappe (titre ou auteur, sans se soucier des accents ni de la casse) et triez la bibliothèque : dernière lecture, ajout, titre ou auteur, dans un sens ou dans l'autre ; le choix est mémorisé.
- **Édition des métadonnées** — le crayon de chaque livre corrige le titre, l'auteur et la couverture : une image choisie (contenue proprement en 640 px), le retour aux initiales élégantes, ou la jaquette d'origine réextraite du fichier. Pratique pour les PDF aux métadonnées bancales — la fiche est corrigée, le fichier du livre reste intact.
- **Export des citations** — les soulignages et notes d'un livre, remis dans l'ordre de la lecture (chapitres pour un EPUB, pages pour un PDF), relus une dernière fois dans un aperçu épuré filé à leurs couleurs, puis téléchargés en **Markdown** (pour Obsidian, Notion, Bear…) ou en **texte brut** : guillemets français, catégories, notes personnelles, lieux et dates repris tels quels.
- **Tactile sur le téléphone** — balayez horizontalement pour tourner les pages, touchez les bords de l'écran pour naviguer, le centre fait apparaître/disparaître les barres (mode immersion) ; pincez pour zoomer un PDF (avec aperçu pendant le geste) ou régler la taille du texte d'un EPUB. Le texte reste sélectionnable, les liens cliquables, le défilement vertical et le pan d'un PDF zoomé restent naturels — et rien ne change à la souris ni au clavier.
- **Vue double ou simple page** — comme un livre ouvert sur la table, ou une page unique ; bascule en un clic.
- **Sommaire & vignettes** — navigation par chapitres (EPUB) ; pour les PDF, le sommaire de l'éditeur et les **miniatures des pages** dans le tiroir : rendues paresseusement au fil du défilement, la page courante cerclée d'or et amenée au centre, les signets marqués d'un point doré — un clic sur une miniature y mène.
- **Signets (EPUB & PDF)** — le marque-page de la barre du haut pose et retire un repère à l'endroit exact (touche B) ; la liste vit dans le sommaire, un clic pour y retourner.
- **Historique des passages** — les endroits où la lecture se pose s'inscrivent tout seuls, horodatés avec la durée du séjour ; un clic pour y retourner.
- **Statistiques de lecture** — temps passé et pages lues par jour, mesurés tout seuls pendant la lecture : la courbe des 14 derniers jours, les totaux (aujourd'hui, 7 jours, 30 jours, depuis le début) et le total de tous les livres vivent dans le tiroir dédié.
- **Objectif de lecture** — se fixer un cap : un nombre de livres à finir en un temps choisi (cette année, ce mois-ci, une durée d'une semaine à un an, ou jusqu'à une date précise). La bibliothèque porte la bannière : progression dorée, badge d'état (en avance, dans les temps, un peu de retard), temps restant et allure conseillée recalculés à chaque livre. Comptent les livres passés « Terminé » pendant la période — à la main, ou tout seul en atteignant la fin —, la fiche détaille tout, liste datée comprise, et l'objectif atteint est fêté une seule fois, comme il se doit.
- **Reprise de lecture** — fermez l'onglet, revenez : vous êtes exactement à la page où vous vous étiez arrêté.
- **Recherche plein texte** — dans tout l'EPUB ou le PDF, avec extraits surlignés et navigation directe.
- **Sélection et copie de texte (PDF)** — le texte des pages est sélectionnable au curseur ; la copie (bouton ou Ctrl+C) reconstruit proprement espaces et retours à la ligne.
- **Zoom ajusté et pan (PDF)** — « Page entière », « Largeur » ou « Hauteur » : quand la page dépasse le cadre, elle se déplace à la main (curseur main) ; Ctrl+molette zoome, la position de lecture est gardée.
- **Soulignages multicolores** (EPUB & PDF) — sélectionnez un passage, choisissez une teinte ; les surlignages suivent le zoom et la vue double, et se retrouvent dans le panneau dédié avec recoloriage, catégories et « Aller au passage ».
- **Capture de page** — un clic sur l'appareil photo télécharge automatiquement la page courante en PNG.
- **Tourne-page théâtral** — la page se soulève et se rabat comme du papier.
- **Taille du texte** (EPUB) et **zoom** (PDF) réglables.
- **Raccourcis clavier** — tout se fait sans quitter le texte : flèches et Espace pour tourner les pages, B pose/retire un signet, F mode concentration, I immersion, T/R/N/H/S ouvrent les tiroirs (sommaire, recherche, notes, passages, statistiques), M double page, V défilement vertical, J thème suivant, A typographie, P plein écran, C capture, Début/Fin sautent aux extrémités, Échap referme — et « ? » (ou le bouton clavier de la barre du haut) ouvre le mémo qui les rappelle tous.
- **Hors-ligne** — toutes les bibliothèques (epub.js, pdf.js, polices) sont embarquées dans `vendor/` : aucune dépendance à internet au moment de la lecture. Et le service worker (V2.23) met la coquille entière en cache : la liseuse déjà visitée démarre même sans réseau.

## 🚀 Utiliser en local

**Le plus simple :** double-cliquez sur `index.html` — le site s'ouvre dans votre navigateur.

Pour une expérience optimale (et les fonctions plein écran), servez le dossier :

```bash
# avec Python (préinstallé sur la plupart des machines)
python3 -m http.server 8080
# puis ouvrez http://localhost:8080
```

ou avec Node :

```bash
npx serve .
```

Des livres d'exemple vous attendent dans [`exemples/`](exemples/) pour essayer immédiatement.

## 🌐 Publier sur GitHub Pages

1. Créez un dépôt sur GitHub (par ex. `nuit-calme`).
2. Téléversez tout le contenu de ce dossier à la racine du dépôt :
   ```bash
   git init
   git add .
   git commit -m "Nuit Calme — liseuse EPUB & PDF"
   git remote add origin https://github.com/<votre-compte>/nuit-calme.git
   git push -u origin main
   ```
3. Dans le dépôt : **Settings → Pages → Source : `main` / `(root)`** → Enregistrer.
4. Votre liseuse est en ligne sur `https://<votre-compte>.github.io/nuit-calme/`.

Le fichier `.nojekyll` inclus garantit que GitHub Pages sert tous les fichiers tels quels. Depuis Chrome ou Edge (ordinateur et Android), un bouton **« Installer l'app »** propose de poser la liseuse sur l'écran d'accueil — icône, plein écran, hors-ligne ; sur iPhone, le bouton explique le geste (Partager → « Sur l'écran d'accueil »).

### Les packs de livres

Le dossier [`packs/`](packs/) est l'espace des collections proposées aux visiteurs. Vous y déposez un dossier d'EPUB/PDF ou une archive `.zip`, vous poussez : le workflow `.github/workflows/packs.yml` reconstruit tout seul `packs/index.json` (la liste que lit l'app) et votre pack apparaît sur le site. Vos titres et descriptions édités à la main sont conservés ; le mode d'emploi complet vit dans [`packs/LISEZ-MOI.md`](packs/LISEZ-MOI.md).

> 💡 Déployée en ligne, la liseuse reste 100 % locale : les livres choisis par chaque visiteur sont stockés **dans son propre navigateur**, jamais sur un serveur.

## 🔒 Confidentialité

Aucune donnée n'est envoyée en ligne. Pas de compte, pas de traqueur, pas d'analyse. Vos livres et vos soulignages vivent dans le stockage local de votre navigateur (IndexedDB). Supprimer un livre de la bibliothèque le supprime définitivement de votre disque de navigation.

## 📁 Structure

```
nuit-calme-liseuse/
├── index.html              # point d'entrée unique (bibliothèque + lecteur)
├── manifest.webmanifest    # fiche d'installation (PWA) : nom, icônes, plein écran
├── sw.js                   # service worker : cache hors-ligne, retraits des vieux caches
├── icons/                  # icônes de l'app (écran d'accueil, masquables, apple-touch)
├── css/style.css           # design « Nuit calme » (charbon & doré)
├── js/
│   ├── app.js              # amorçage
│   ├── idb.js              # stockage local IndexedDB
│   ├── library.js          # bibliothèque : import, couvertures, statut, groupes, filtres, recherche, tri, édition des métadonnées, suppression
│   ├── goal.js             # objectif de lecture : cap, échéance, progression, allure conseillée
│   ├── packs.js            # vue « Packs de livres » : parcours, couvertures à la volée, import tout ou détail
│   ├── reader.js           # orchestrateur du lecteur, tourne-page, tiroirs, export des citations, mode immersion
│   ├── epub-reader.js      # moteur EPUB (epub.js) : pagination, notes, recherche
│   ├── pdf-reader.js       # moteur PDF (pdf.js) : pages, zoom, couche texte (sélection/copie), sommaire
│   ├── touch.js            # gestes tactiles : balayages, zones de tap, pinch (zoom PDF, texte EPUB)
│   └── util.js             # utilitaires, toasts, polices
├── vendor/                 # bibliothèques embarquées (fonctionne hors-ligne)
│   ├── epub.min.js, jszip.min.js, pdf.min.js, pdf.worker.min.js
│   ├── html2canvas.min.js
│   └── fonts/              # Cormorant Garamond & Inter (woff2)
├── exemples/               # un EPUB et un PDF de démonstration
├── packs/                  # collections proposées aux visiteurs (index auto-généré)
│   └── LISEZ-MOI.md        # mode d'emploi des packs
├── .github/workflows/      # reconstruction automatique de packs/index.json
└── docs/                   # captures d'écran
```

## 🛠 Technologies

- HTML / CSS / JavaScript — aucun build, aucune dépendance à installer
- [epub.js](https://github.com/futurepress/epub.js) 0.3.93 — rendu et pagination des EPUB
- [pdf.js](https://mozilla.github.io/pdf.js/) 3.11 — rendu des PDF
- [html2canvas](https://html2canvas.hertzen.com/) 1.4 — capture de page
- [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) & [Inter](https://rsms.me/inter/) — typographies

## ⚠️ Limites connues

- Les EPUB protégés par **DRM** (librairies commerciales) ne peuvent pas être ouverts — c'est le cas de toutes les liseuses non officielles.
- Les packs de livres n'apparaissent que sur le site servi en **http(s)** (GitHub Pages, serveur local) — ouvert en fichier local (`file://`), le navigateur interdit au JavaScript de lire le dossier `packs/` ; l'app l'explique poliment.
- L'installation en application (icône, plein écran, hors-ligne) demande elle aussi le **http(s)** — en fichier local, le navigateur ne permet ni service worker ni installation ; la liseuse s'ouvre normalement, sans rien montrer de plus. Le bouton « Installer l'app » n'apparaît d'ailleurs que lorsque le navigateur sait installer (Chrome, Edge, Android ; Safari d'iPhone reçoit le geste à faire à sa place).
- La recherche PDF nécessite un PDF contenant du **texte** (les scans sans couche texte ne donnent pas de résultats).
- Les notes rédigées (par opposition aux surlignages) sont réservées aux EPUB pour l'instant.
- Après un premier déploiement GitHub Pages, si les polices semblent absentes, rechargez une fois : le cache se met en place.

## Licence

MIT — voir [LICENSE](LICENSE). Les fables de Jean de La Fontaine (exemples) sont dans le domaine public.
