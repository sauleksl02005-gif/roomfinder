# RoomFinder Cameroun — version Supabase

Cette version conserve l'interface RoomFinder et remplace les fichiers locaux `rooms.json`, `messages.json` et `uploads/` par :
- Supabase PostgreSQL : chambres et demandes de contact ;
- Supabase Storage : photos des chambres ;
- Render : serveur Node.js/Express.

## Structure

- `server.js` : API Express connectée à Supabase.
- `public/index.html`, `public/style.css`, `public/app.js` : site public.
- `public/admin.html`, `public/admin.js` : administration (connexion, publication, GPS, suppression et messages).
- `package.json` : dépendances et commande de démarrage.
- `.env.example` : variables à configurer.
- `sql/verify-and-setup.sql` : création/complément des tables et du bucket si nécessaire.

## 1. Vérifier Supabase

Le serveur attend :

### Table `public.chambres`

`id` (TEXT, clé primaire), `titre` (TEXT), `ville` (TEXT), `quartier` (TEXT), `prix` (NUMERIC), `duree` (TEXT), `description` (TEXT), `adresse` (TEXT), `latitude` (DOUBLE PRECISION), `longitude` (DOUBLE PRECISION), `telephone` (TEXT), `equipements` (TEXT), `photos` (TEXT[]), `published` (BOOLEAN), `created_at` (TIMESTAMPTZ).

### Table `public.messages`

`id` (identifiant généré automatiquement), `room_id` (TEXT), `room_title` (TEXT), `name` (TEXT), `phone` (TEXT), `message` (TEXT), `created_at` (TIMESTAMPTZ).

### Storage

Un bucket public nommé exactement `room-photos` doit exister. Le script `sql/verify-and-setup.sql` peut compléter les éléments manquants. Vérifiez les noms et types de colonnes avant de l'exécuter si vos tables ont été personnalisées.

## 2. Configurer les variables Render

Dans Render > votre service > Environment, ajouter :

- `NODE_ENV` = `production`
- `SESSION_SECRET` = une longue chaîne aléatoire unique
- `ADMIN_USERNAME` = votre identifiant administrateur
- `ADMIN_PASSWORD` = un mot de passe long et unique
- `SUPABASE_URL` = URL du projet Supabase
- `SUPABASE_SERVICE_ROLE_KEY` = clé `service_role` / secret du projet
- `SUPABASE_ROOMS_TABLE` = `chambres`
- `SUPABASE_MESSAGES_TABLE` = `messages`
- `SUPABASE_STORAGE_BUCKET` = `room-photos`

Ne publiez jamais `.env` ou `SUPABASE_SERVICE_ROLE_KEY` dans GitHub. Cette clé reste uniquement dans les variables secrètes Render. Ne la mettez jamais dans `app.js` ou dans le HTML.

## 3. Déployer

1. Faites une copie de sauvegarde du dépôt actuel.
2. Remplacez les fichiers correspondants par ceux de ce dossier en gardant `server.js` et `package.json` à la racine et les fichiers du site dans `public/`.
3. Vérifiez les variables d'environnement Render.
4. Faites un commit GitHub. Render réinstallera les dépendances avec `npm install` et lancera `npm start`.
5. Testez `https://VOTRE-SITE/health`, puis le site public et `/admin.html`.

## 4. À savoir avant de remplacer

Cette version lit et écrit les chambres et les messages dans Supabase. Les photos nouvelles sont envoyées directement dans le bucket `room-photos`. Les anciennes annonces déjà présentes uniquement dans `data/rooms.json` et leurs photos locales ne sont pas importées automatiquement : sauvegardez-les et migrez-les avant de supprimer l'ancien environnement. Les sessions administrateur restent dans SQLite local ; elles peuvent être réinitialisées lors d'un redéploiement, mais les annonces, messages et photos Supabase restent persistants.

## 5. Vérifications

- Créer une chambre depuis `/admin.html`.
- Vérifier sa présence dans `public.chambres` et ses photos dans Storage > `room-photos`.
- Ouvrir le site public et vérifier la fiche/photo.
- Envoyer un message et vérifier `public.messages`.
- Redémarrer/redéployer le service et vérifier que chambre, photo et message sont toujours visibles.
