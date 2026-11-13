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

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.error(`Configuration manquante : ${missingEnv.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const ROOMS_TABLE = process.env.SUPABASE_ROOMS_TABLE || 'chambres';
const MESSAGES_TABLE = process.env.SUPABASE_MESSAGES_TABLE || 'messages';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'room-photos';

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use(express.static(__dirname));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Format de photo non accepté. Utilisez JPEG, PNG ou WebP.'));
    cb(null, true);
  }
});

const adminOnly = (req, res, next) => req.session.isAdmin
  ? next()
  : res.status(401).json({ error: 'Connexion administrateur requise.' });

function mapRoom(row) {
  return {
    id: String(row.id),
    title: row.titre || '',
    city: row.ville || '',
    neighborhood: row.quartier || '',
    price: Number(row.prix || 0),
    duration: row.duree || '',
    description: row.description || '',
    address: row.adresse || '',
    latitude: row.latitude == null ? '' : String(row.latitude),
    longitude: row.longitude == null ? '' : String(row.longitude),
    phone: row.telephone || '',
    amenities: row.equipements || '',
    photos: Array.isArray(row.photos) ? row.photos : [],
    published: row.published !== false,
    createdAt: row.created_at || null
  };
}

function roomToDb(body, includeDefaults = false) {
  const data = {
    titre: String(body.title || '').trim(),
    ville: String(body.city || '').trim(),
    quartier: String(body.neighborhood || '').trim(),
    prix: Number(body.price),
    duree: String(body.duration || '').trim(),
    description: String(body.description || ''),
    adresse: String(body.address || ''),
    latitude: body.latitude === '' || body.latitude == null ? null : Number(body.latitude),
    longitude: body.longitude === '' || body.longitude == null ? null : Number(body.longitude),
    telephone: String(body.phone || ''),
    equipements: String(body.amenities || '')
  };
  if (includeDefaults) data.published = true;
  return data;
}

function validateRoom(data) {
  if (!data.titre || !data.ville || !data.duree || !Number.isFinite(data.prix) || data.prix <= 0) {
    return 'Titre, ville, durée et prix valide sont obligatoires.';
  }
  if ((data.latitude !== null && !Number.isFinite(data.latitude)) ||
      (data.longitude !== null && !Number.isFinite(data.longitude))) {
    return 'Les coordonnées GPS doivent être numériques.';
  }
  return null;
}

async function uploadPhotos(files, roomId) {
  const urls = [];
  for (const file of files || []) {
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.mimetype];
    const objectPath = `rooms/${roomId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });
    if (error) {
      if (urls.length) {
        const paths = urls.map(url => storagePathFromPublicUrl(url)).filter(Boolean);
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      }
      throw error;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    urls.push(data.publicUrl);
  }
  return urls;
}

function storagePathFromPublicUrl(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = String(url).indexOf(marker);
  return index >= 0 ? decodeURIComponent(String(url).slice(index + marker.length)) : null;
}

async function deleteStoredPhotos(urls) {
  const paths = (urls || []).map(storagePathFromPublicUrl).filter(Boolean);
  if (paths.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) console.error('Suppression des photos Supabase :', error.message);
  }
}

// Public: chambres visibles et recherche.
app.get('/api/rooms', async (req, res, next) => {
  try {
    let query = supabase.from(ROOMS_TABLE).select('*').eq('published', true).order('created_at', { ascending: false });
    const q = String(req.query.q || '').trim();
    const duration = String(req.query.duration || '').trim();
    const maxPrice = Number(req.query.maxPrice || 0);
    if (duration) query = query.eq('duree', duration);
    if (maxPrice > 0) query = query.lte('prix', maxPrice);
    if (q) query = query.or(`titre.ilike.%${q.replace(/[(),]/g, ' ')}%,ville.ilike.%${q.replace(/[(),]/g, ' ')}%,quartier.ilike.%${q.replace(/[(),]/g, ' ')}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json((data || []).map(mapRoom));
  } catch (error) { next(error); }
});

app.get('/api/rooms/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from(ROOMS_TABLE).select('*').eq('id', req.params.id).eq('published', true).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Annonce introuvable.' });
    res.json(mapRoom(data));
  } catch (error) { next(error); }
});

app.post('/api/contact', async (req, res, next) => {
  try {
    const { roomId, name, phone, message } = req.body || {};
    if (!roomId || !String(name || '').trim() || !String(phone || '').trim() || !String(message || '').trim()) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
    }
    const { data: room, error: roomError } = await supabase.from(ROOMS_TABLE).select('id,titre').eq('id', roomId).eq('published', true).maybeSingle();
    if (roomError) throw roomError;
    if (!room) return res.status(404).json({ error: "Cette annonce n'est plus disponible." });
    const { error } = await supabase.from(MESSAGES_TABLE).insert({
      room_id: String(room.id), room_title: room.titre,
      name: String(name).trim(), phone: String(phone).trim(), message: String(message).trim()
    });
    if (error) throw error;
    res.json({ message: "Votre demande a été envoyée à l'administrateur." });
  } catch (error) { next(error); }
});

// Administration.
app.post('/api/admin/login', (req, res) => {
  const suppliedUser = String(req.body.username || '');
  const suppliedPass = String(req.body.password || '');
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  const safeEqual = (a, b) => {
    const aa = Buffer.from(a); const bb = Buffer.from(b);
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  };
  if (!safeEqual(suppliedUser, expectedUser) || !safeEqual(suppliedPass, expectedPass)) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Impossible de créer la session.' });
    req.session.isAdmin = true;
    req.session.save(saveErr => saveErr
      ? res.status(500).json({ error: "Impossible d'enregistrer la session." })
      : res.json({ message: 'Connexion réussie.' }));
  });
});

app.post('/api/admin/logout', adminOnly, (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Déconnexion impossible.' });
    res.clearCookie('connect.sid', { path: '/' });
    res.json({ message: 'Déconnexion.' });
  });
});
app.get('/api/admin/me', (req, res) => res.json({ authenticated: !!req.session.isAdmin }));

app.get('/api/admin/rooms', adminOnly, async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from(ROOMS_TABLE).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(mapRoom));
  } catch (error) { next(error); }
});

app.get('/api/admin/messages', adminOnly, async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from(MESSAGES_TABLE).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(row => ({
      id: row.id, roomId: row.room_id, roomTitle: row.room_title,
      name: row.name, phone: row.phone, message: row.message, createdAt: row.created_at
    })));
  } catch (error) { next(error); }
});

app.post('/api/admin/rooms', adminOnly, upload.array('photos', 8), async (req, res, next) => {
  let uploadedUrls = [];
  try {
    const dbRoom = roomToDb(req.body, true);
    const validationError = validateRoom(dbRoom);
    if (validationError) return res.status(400).json({ error: validationError });
    const id = crypto.randomUUID();
    uploadedUrls = await uploadPhotos(req.files, id);
    const { data, error } = await supabase.from(ROOMS_TABLE).insert({
      id, ...dbRoom, photos: uploadedUrls
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(mapRoom(data));
  } catch (error) {
    await deleteStoredPhotos(uploadedUrls);
    next(error);
  }
});

app.put('/api/admin/rooms/:id', adminOnly, async (req, res, next) => {
  try {
    const input = req.body || {};
    const dbRoom = {};
    const fields = {
      title: 'titre', city: 'ville', neighborhood: 'quartier', price: 'prix',
      duration: 'duree', description: 'description', address: 'adresse',
      latitude: 'latitude', longitude: 'longitude', phone: 'telephone', amenities: 'equipements'
    };
    for (const [apiField, dbField] of Object.entries(fields)) {
      if (Object.prototype.hasOwnProperty.call(input, apiField)) {
        if (apiField === 'price') dbRoom[dbField] = Number(input[apiField]);
        else if (['latitude', 'longitude'].includes(apiField)) dbRoom[dbField] = input[apiField] === '' || input[apiField] == null ? null : Number(input[apiField]);
        else dbRoom[dbField] = String(input[apiField] ?? '').trim();
      }
    }
    if (dbRoom.prix !== undefined && (!Number.isFinite(dbRoom.prix) || dbRoom.prix <= 0)) {
      return res.status(400).json({ error: 'Le prix doit être un nombre positif.' });
    }
    const { data, error } = await supabase.from(ROOMS_TABLE).update(dbRoom).eq('id', req.params.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Annonce introuvable.' });
    res.json(mapRoom(data));
  } catch (error) { next(error); }
});

app.delete('/api/admin/rooms/:id', adminOnly, async (req, res, next) => {
  try {
    const { data: room, error: readError } = await supabase.from(ROOMS_TABLE).select('id,photos').eq('id', req.params.id).maybeSingle();
    if (readError) throw readError;
    if (!room) return res.status(404).json({ error: 'Annonce introuvable.' });
    const { error } = await supabase.from(ROOMS_TABLE).delete().eq('id', req.params.id);
    if (error) throw error;
    await deleteStoredPhotos(room.photos);
    res.json({ message: 'Annonce supprimée.' });
  } catch (error) { next(error); }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Chaque photo doit faire 5 Mo maximum.' : 'Nombre ou taille de photos non autorisé.' });
  }
  const message = err.message || 'Erreur interne du serveur.';
  if (message.includes('bucket') || message.includes('Bucket')) {
    return res.status(500).json({ error: `Vérifiez que le bucket Supabase « ${BUCKET} » existe et est public.` });
  }
  res.status(500).json({ error: message });
});

app.listen(PORT, () => console.log(`RoomFinder démarre sur le port ${PORT}`));
