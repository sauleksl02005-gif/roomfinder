require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "rooms.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || "change-this-secret-before-deployment",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(ROOT, "public")));

const readRooms = () => JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const saveRooms = rooms => fs.writeFileSync(DB_FILE, JSON.stringify(rooms, null, 2));
const adminOnly = (req, res, next) => req.session.isAdmin ? next() : res.status(401).json({ error: "Connexion administrateur requise." });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
});

app.get("/api/rooms", (req, res) => {
  let rooms = readRooms().filter(r => r.published);
  const q = (req.query.q || "").toLowerCase();
  const duration = req.query.duration || "";
  const maxPrice = Number(req.query.maxPrice || 0);
  rooms = rooms.filter(r =>
    (!q || `${r.title} ${r.city} ${r.neighborhood}`.toLowerCase().includes(q)) &&
    (!duration || r.duration === duration) &&
    (!maxPrice || Number(r.price) <= maxPrice)
  );
  res.json(rooms);
});
app.get("/api/rooms/:id", (req, res) => {
  const room = readRooms().find(r => r.id === req.params.id && r.published);
  room ? res.json(room) : res.status(404).json({ error: "Annonce introuvable." });
});
app.post("/api/contact", (req, res) => {
  const { roomId, name, phone, message } = req.body;
  if (!name || !phone || !message || !roomId) return res.status(400).json({ error: "Tous les champs sont obligatoires." });
  const room = readRooms().find(r => r.id === roomId && r.published);
  if (!room) return res.status(404).json({ error: "Cette annonce n'est plus disponible." });
  const logFile = path.join(DATA_DIR, "messages.json");
  const messages = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : [];
  messages.unshift({ id: Date.now().toString(), roomId, roomTitle: room.title, name, phone, message, createdAt: new Date().toISOString() });
  fs.writeFileSync(logFile, JSON.stringify(messages, null, 2));
  res.json({ message: "Votre demande a été envoyée à l'administrateur." });
});

app.post("/api/admin/login", async (req, res) => {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "ChangeMoi123!";
  if (req.body.username === username && await bcrypt.compare(req.body.password || "", await bcrypt.hash(password, 10))) {
    req.session.isAdmin = true;
    return res.json({ message: "Connexion réussie." });
  }
  res.status(401).json({ error: "Identifiants incorrects." });
});
app.post("/api/admin/logout", adminOnly, (req, res) => req.session.destroy(() => res.json({ message: "Déconnexion." })));
app.get("/api/admin/me", (req, res) => res.json({ authenticated: !!req.session.isAdmin }));
app.get("/api/admin/rooms", adminOnly, (req, res) => res.json(readRooms()));
app.get("/api/admin/messages", adminOnly, (req, res) => {
  const f = path.join(DATA_DIR, "messages.json");
  res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []);
});
app.post("/api/admin/rooms", adminOnly, upload.array("photos", 8), (req, res) => {
  const { title, city, neighborhood, price, duration, description, address, latitude, longitude, phone, amenities } = req.body;
  if (!title || !city || !price || !duration) return res.status(400).json({ error: "Titre, ville, prix et durée sont obligatoires." });
  const rooms = readRooms();
  const room = {
    id: Date.now().toString(), title, city, neighborhood: neighborhood || "",
    price: Number(price), duration, description: description || "", address: address || "",
    latitude: latitude || "", longitude: longitude || "", phone: phone || "",
    amenities: amenities || "", photos: (req.files || []).map(f => `/uploads/${f.filename}`),
    published: true, createdAt: new Date().toISOString()
  };
  rooms.unshift(room); saveRooms(rooms); res.json(room);
});
app.put("/api/admin/rooms/:id", adminOnly, (req, res) => {
  const rooms = readRooms(); const room = rooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: "Annonce introuvable." });
  Object.assign(room, req.body, { price: Number(req.body.price ?? room.price) });
  saveRooms(rooms); res.json(room);
});
app.delete("/api/admin/rooms/:id", adminOnly, (req, res) => {
  const rooms = readRooms(); const next = rooms.filter(r => r.id !== req.params.id);
  if (next.length === rooms.length) return res.status(404).json({ error: "Annonce introuvable." });
  saveRooms(next); res.json({ message: "Annonce supprimée." });
});

app.listen(PORT, () => console.log(`RoomFinder démarre sur http://localhost:${PORT}`));
