# Nuit Calme V3 · Guide de démarrage

Nuit Calme est une liseuse EPUB et PDF pour navigateur. Elle permet d’organiser et de rechercher ses livres, de personnaliser la lecture, de reprendre à la dernière position et de consulter ses signets, notes et surlignages dans le Carnet. La vue **Activité** présente les statistiques et les objectifs.

## Vos premières minutes

1. Ouvrez l’adresse HTTPS de Nuit Calme dans Edge ou Chrome.
2. Cliquez sur **Ajouter un livre** et choisissez un EPUB ou un PDF enregistré sur votre appareil. Vous pouvez aussi glisser des fichiers dans la bibliothèque sur ordinateur.
3. Ouvrez la fiche du livre. **Aa** ouvre les réglages de lecture et les profils. Dans un PDF, vous pouvez régler le zoom et l’ajustement. Le bouton d’aide du lecteur liste les raccourcis au clavier.
4. Pour retrouver vos passages, utilisez les signets dans le lecteur et ouvrez **Carnet** depuis la bibliothèque.
5. Créez une première archive via **Sauvegarde**. Conservez-la dans un dossier dont vous avez la maîtrise.

## Installation et mode hors ligne

Quand le navigateur propose l’installation, choisissez **Installer l’app** ou la commande d’installation de son menu. Sur iOS, Safari peut proposer **Ajouter à l’écran d’accueil** dans le menu Partager. L’installation par le système et le fonctionnement sous Safari et Firefox restent à valider sur ces environnements.

Ouvrez l’application une première fois avec une connexion et laissez-la finir de charger. Les fichiers de l’interface sont mis en cache et les livres importés sont conservés dans le stockage local du navigateur. La liseuse et les livres déjà importés s’ouvrent ensuite hors ligne. Les packs qui restent sur un hébergement doivent être téléchargés avant la lecture. Le ZIP de distribution démarre avec un catalogue de packs vide. Vous pouvez toujours importer vos fichiers locaux.

## Où sont les livres et les données

Le navigateur conserve une copie des livres et leurs données de lecture dans le profil utilisé, pour l’origine du site (protocole, domaine et port). Un changement d’adresse vers une autre origine, d’appareil, de navigateur ou de profil nécessite une sauvegarde puis une restauration. Il n’y a pas de compte ni de synchronisation automatique. Le site statique peut recevoir les requêtes de chargement de l’interface et des packs disponibles. Les livres importés et vos données de lecture sont traités sur l’appareil. Une sauvegarde ZIP contient les livres, notes et réglages et doit être traitée comme un fichier personnel.

## Sauvegarder, déplacer et restaurer

- **Exporter** produit une archive ZIP de format v1. Gardez-la en dehors du stockage du navigateur.
- **Fusionner** ajoute les entrées absentes et applique les règles propres aux préférences, à la progression et aux statistiques. Si vous hésitez, exportez d’abord la bibliothèque qui va recevoir le fichier.
- **Remplacer** restaure la bibliothèque de l’archive. Conservez un export de l’état actuel avant de confirmer. Fermez les autres onglets de Nuit Calme pour travailler à partir de l’état restauré.
- Le stockage privé, les politiques de quota et l’effacement des données de site peuvent rendre une bibliothèque indisponible. Un export est le moyen de la récupérer indépendamment de ce navigateur.

## Mise à jour et résolution des problèmes

- **La mise à jour ne s’affiche pas.** Revenez en ligne, revenez à la bibliothèque, puis fermez toutes les fenêtres et tous les onglets Nuit Calme, y compris la fenêtre installée, avant de rouvrir. Les données de lecture restent à la même origine.
- **Je ne retrouve plus mes livres.** Vérifiez le profil navigateur et l’adresse du site. Retrouvez l’ancienne adresse pour exporter ou restaurez un ZIP v1.
- **Le navigateur manque de place.** Vérifiez l’espace disponible et les réglages de stockage. Sauvegardez ce que vous souhaitez conserver avant d’effacer des données de site ou des livres.
- **Un ouvrage refuse de s’ouvrir.** Vérifiez qu’il s’agit d’un EPUB ou PDF lisible et complet. Les protections DRM et certains PDF protégés ne sont pas pris en charge. Les scripts et chargements distants automatiques des EPUB sont bloqués. Un ouvrage qui dépend d’éléments hébergés ailleurs peut s’afficher partiellement.
- **L’activité ne progresse pas.** Le suivi nécessite une interaction de lecture au premier plan. Il s’interrompt après trois minutes d’inactivité. Le navigateur doit prendre en charge Web Locks pour comptabiliser les nouvelles sessions sans doublon entre onglets.

Cette version a été vérifiée sur des navigateurs Chromium de bureau. Les tailles tactiles et orientations mobiles ont été vérifiées par émulation. Les lecteurs d’écran et les appareils physiques restent à vérifier. Les notices des polices et bibliothèques embarquées figurent dans `vendor/licenses/`.
