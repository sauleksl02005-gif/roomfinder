# RoomFinder Cameroun — version racine + Supabase

Tous les fichiers du site sont directement à la racine du projet. Aucun dossier `public/` n'est nécessaire.

## Fichiers
- `server.js` : API Express, sessions administrateur, Supabase et routes `/` et `/admin`.
- `index.html`, `style.css`, `app.js` : site public.
- `admin.html`, `admin.js` : espace administrateur.
- `verify-and-setup.sql` : schéma de référence Supabase.

## Base Supabase attendue
Table `public.chambres` : `id` (TEXT), `titre`, `ville`, `quartier`, `prix`, `duree`, `description`, `adresse`, `latitude`, `longitude`, `telephone`, `equipements`, `photos` (TEXT[]), `published` (BOOLEAN), `created_at`.
Table `public.messages` : `id`, `room_id`, `room_title`, `name`, `phone`, `message`, `created_at`.
Bucket public Storage : `room-photos`.

Si les tables existent déjà, compare leurs noms et types avec cette liste avant d'exécuter le SQL. `CREATE TABLE IF NOT EXISTS` ne renomme pas les colonnes existantes.

## Render
- Build Command : `npm install`
- Start Command : `npm start`
- Runtime : Node 18 ou plus.
- Variables d'environnement : `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Les noms de tables et bucket sont facultatifs si les valeurs par défaut conviennent.
- Ne jamais mettre la clé `SUPABASE_SERVICE_ROLE_KEY` dans GitHub, HTML ou JavaScript navigateur. La saisir uniquement dans Render > Environment.

Après déploiement, tester `/health`, `/`, puis `/admin`.

## Important
Les annonces, messages et photos sont conservés dans Supabase. Les sessions de connexion utilisent SQLite sur le disque local Render et peuvent être réinitialisées lors d'un redéploiement. Les anciennes données présentes uniquement dans les fichiers JSON ou dans `uploads/` ne sont pas migrées automatiquement. Sauvegardez-les avant de remplacer l'ancien site.
