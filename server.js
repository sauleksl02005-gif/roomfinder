require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Configuration manquante : ${missing.join(', ')}`);
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ROOMS = process.env.SUPABASE_ROOMS_TABLE || 'chambres';
const MESSAGES = process.env.SUPABASE_MESSAGES_TABLE || 'messages';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'room-photos';

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));
// Expose uniquement les fichiers front-end nécessaires, jamais server.js ou .env.
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
for (const file of ['style.css', 'app.js', 'admin.js']) {
  app.get('/' + file, (_req, res) => res.sendFile(path.join(__dirname, file)));
}
app.get('/health', (_req, res) => res.json({ ok: true, service: 'RoomFinder Cameroun' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 8 }, fileFilter: (_req, file, cb) => {
  cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
} });
const adminOnly = (req, res, next) => req.session.isAdmin ? next() : res.status(401).json({ error: 'Connexion administrateur requise.' });
const mapRoom = r => ({ id: String(r.id), title: r.titre || '', city: r.ville || '', neighborhood: r.quartier || '', price: Number(r.prix || 0), duration: r.duree || '', description: r.description || '', address: r.adresse || '', latitude: r.latitude ?? '', longitude: r.longitude ?? '', phone: r.telephone || '', amenities: r.equipements || '', photos: Array.isArray(r.photos) ? r.photos : [], published: r.published !== false, createdAt: r.created_at || null });
function roomData(b) {
  return { titre: String(b.title || '').trim(), ville: String(b.city || '').trim(), quartier: String(b.neighborhood || '').trim(), prix: Number(b.price), duree: String(b.duration || '').trim(), description: String(b.description || ''), adresse: String(b.address || ''), latitude: b.latitude === '' || b.latitude == null ? null : Number(b.latitude), longitude: b.longitude === '' || b.longitude == null ? null : Number(b.longitude), telephone: String(b.phone || ''), equipements: String(b.amenities || '') };
}
function validateRoom(d) {
  if (!d.titre || !d.ville || !d.duree || !Number.isFinite(d.prix) || d.prix <= 0) return 'Titre, ville, durée et prix valide sont obligatoires.';
  if ((d.latitude !== null && !Number.isFinite(d.latitude)) || (d.longitude !== null && !Number.isFinite(d.longitude))) return 'Les coordonnées GPS doivent être numériques.';
  return null;
}
function storagePath(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = String(url).indexOf(marker);
  return i < 0 ? null : decodeURIComponent(String(url).slice(i + marker.length));
}
async function uploadPhotos(files, id) {
  const urls = [];
  for (const f of files || []) {
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[f.mimetype];
    if (!ext) throw new Error('Format photo non accepté.');
    const object = `rooms/${id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(object, f.buffer, { contentType: f.mimetype, upsert: false });
    if (error) throw error;
    urls.push(supabase.storage.from(BUCKET).getPublicUrl(object).data.publicUrl);
  }
  return urls;
}
async function removePhotos(urls) {
  const paths = (urls || []).map(storagePath).filter(Boolean);
  if (paths.length) { const { error } = await supabase.storage.from(BUCKET).remove(paths); if (error) console.error('Suppression photos:', error.message); }
}

app.get('/api/rooms', async (req, res, next) => {
  try {
    let q = supabase.from(ROOMS).select('*').eq('published', true).order('created_at', { ascending: false });
    const term = String(req.query.q || '').trim().replace(/[(),]/g, ' ');
    const duration = String(req.query.duration || '').trim();
    const max = Number(req.query.maxPrice || 0);
    if (duration) q = q.eq('duree', duration);
    if (max > 0) q = q.lte('prix', max);
    if (term) q = q.or(`titre.ilike.%${term}%,ville.ilike.%${term}%,quartier.ilike.%${term}%`);
    const { data, error } = await q; if (error) throw error;
    res.json((data || []).map(mapRoom));
  } catch (e) { next(e); }
});
app.get('/api/rooms/:id', async (req, res, next) => {
  try { const { data, error } = await supabase.from(ROOMS).select('*').eq('id', req.params.id).eq('published', true).maybeSingle(); if (error) throw error; if (!data) return res.status(404).json({ error: 'Annonce introuvable.' }); res.json(mapRoom(data)); }
  catch (e) { next(e); }
});
app.post('/api/contact', async (req, res, next) => {
  try {
    const { roomId, name, phone, message } = req.body || {};
    if (!roomId || !String(name || '').trim() || !String(phone || '').trim() || !String(message || '').trim()) return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
    const { data: room, error: re } = await supabase.from(ROOMS).select('id,titre').eq('id', roomId).eq('published', true).maybeSingle(); if (re) throw re; if (!room) return res.status(404).json({ error: 'Cette annonce est indisponible.' });
    const { error } = await supabase.from(MESSAGES).insert({ room_id: String(room.id), room_title: room.titre, name: String(name).trim(), phone: String(phone).trim(), message: String(message).trim() }); if (error) throw error;
    res.json({ message: 'Votre demande a été envoyée.' });
  } catch (e) { next(e); }
});
app.post('/api/admin/login', (req, res) => {
  const safe = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  if (!safe(req.body.username, process.env.ADMIN_USERNAME) || !safe(req.body.password, process.env.ADMIN_PASSWORD)) return res.status(401).json({ error: 'Identifiants incorrects.' });
  req.session.regenerate(err => { if (err) return res.status(500).json({ error: 'Session impossible.' }); req.session.isAdmin = true; req.session.save(e => e ? res.status(500).json({ error: 'Session impossible.' }) : res.json({ message: 'Connexion réussie.' })); });
});
app.get('/api/admin/me', (req, res) => res.json({ authenticated: !!req.session.isAdmin }));
app.post('/api/admin/logout', adminOnly, (req, res) => req.session.destroy(err => err ? res.status(500).json({ error: 'Déconnexion impossible.' }) : res.json({ message: 'Déconnecté.' })));
app.get('/api/admin/rooms', adminOnly, async (_req, res, next) => { try { const { data, error } = await supabase.from(ROOMS).select('*').order('created_at', { ascending: false }); if (error) throw error; res.json((data || []).map(mapRoom)); } catch (e) { next(e); } });
app.get('/api/admin/messages', adminOnly, async (_req, res, next) => { try { const { data, error } = await supabase.from(MESSAGES).select('*').order('created_at', { ascending: false }); if (error) throw error; res.json(data || []); } catch (e) { next(e); } });
app.post('/api/admin/rooms', adminOnly, upload.array('photos', 8), async (req, res, next) => {
  try {
    const d = roomData(req.body); const invalid = validateRoom(d); if (invalid) return res.status(400).json({ error: invalid });
    const id = crypto.randomUUID(); const photos = await uploadPhotos(req.files, id);
    const { data, error } = await supabase.from(ROOMS).insert({ id, ...d, photos, published: req.body.published !== 'false' }).select('*').single();
    if (error) { await removePhotos(photos); throw error; } res.status(201).json(mapRoom(data));
  } catch (e) { next(e); }
});
app.put('/api/admin/rooms/:id', adminOnly, upload.array('photos', 8), async (req, res, next) => {
  try {
    const { data: old, error: oldError } = await supabase.from(ROOMS).select('*').eq('id', req.params.id).maybeSingle(); if (oldError) throw oldError; if (!old) return res.status(404).json({ error: 'Annonce introuvable.' });
    const d = roomData(req.body); const invalid = validateRoom(d); if (invalid) return res.status(400).json({ error: invalid });
    const added = await uploadPhotos(req.files, req.params.id); const keep = Array.isArray(old.photos) ? old.photos : []; const photos = [...keep, ...added];
    const { data, error } = await supabase.from(ROOMS).update({ ...d, photos, published: req.body.published !== 'false' }).eq('id', req.params.id).select('*').single(); if (error) { await removePhotos(added); throw error; } res.json(mapRoom(data));
  } catch (e) { next(e); }
});
app.delete('/api/admin/rooms/:id', adminOnly, async (req, res, next) => { try { const { data: old, error: e1 } = await supabase.from(ROOMS).select('photos').eq('id', req.params.id).maybeSingle(); if (e1) throw e1; const { error } = await supabase.from(ROOMS).delete().eq('id', req.params.id); if (error) throw error; await removePhotos(old?.photos || []); res.json({ message: 'Annonce supprimée.' }); } catch (e) { next(e); } });
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: err.message || 'Erreur serveur.' }); });
app.listen(PORT, () => console.log(`RoomFinder Cameroun disponible sur le port ${PORT}`));
