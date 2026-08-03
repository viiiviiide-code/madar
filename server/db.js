const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const DB_DIR = path.join(__dirname, "..", "database");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, "madar.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ---------- Schema Creation & Migration ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    from_date TEXT,
    to_date TEXT,
    sort_order INTEGER DEFAULT 0,
    cover_theme TEXT DEFAULT 'radial',
    font_family TEXT DEFAULT 'Vazirmatn',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    sub TEXT,
    start_date TEXT,
    end_date TEXT,
    teaser_url TEXT,
    node_x REAL DEFAULT 50,
    node_y REAL DEFAULT 35,
    node_size REAL DEFAULT 56,
    node_font REAL DEFAULT 12,
    node_bold INTEGER DEFAULT 0,
    orbit INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS work_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platforms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT,
    title TEXT NOT NULL,
    descr TEXT,
    axis TEXT,
    campaign TEXT,
    event_date TEXT,
    url TEXT,
    media_type TEXT DEFAULT 'file',
    external_url TEXT,
    is_featured INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS work_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    text TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS work_platform_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    platform_id INTEGER REFERENCES platforms(id) ON DELETE CASCADE,
    views INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS work_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'image',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Safe Migration Helper
function safeAddColumn(table, columnDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
  } catch (e) {
    // ستون از قبل وجود دارد
  }
}

// Migrations
safeAddColumn("templates", "cover_theme TEXT DEFAULT 'radial'");
safeAddColumn("templates", "font_family TEXT DEFAULT 'Vazirmatn'");
safeAddColumn("projects", "end_date TEXT");
safeAddColumn("works", "media_type TEXT DEFAULT 'file'");
safeAddColumn("works", "external_url TEXT");
safeAddColumn("works", "is_featured INTEGER DEFAULT 0");
safeAddColumn("works", "likes_count INTEGER DEFAULT 0");
safeAddColumn("works", "comments_count INTEGER DEFAULT 0");
safeAddColumn("work_platform_views", "likes_count INTEGER DEFAULT 0");
safeAddColumn("work_platform_views", "comments_count INTEGER DEFAULT 0");
safeAddColumn("work_platform_views", "description TEXT");

/* ---------- Auth Helpers ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, hash] = storedHash.split(":");
  const verifyHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verifyHash, "hex"));
}

/* ---------- Seed Init Data ---------- */
(function seed() {
  const userCount = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (userCount === 0) {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)").run(
      "admin",
      hashPassword("admin12345"),
      "admin",
      now
    );
    db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)").run(
      "user",
      hashPassword("user12345"),
      "viewer",
      now
    );
  }

  const typesCount = db.prepare("SELECT COUNT(*) c FROM work_types").get().c;
  if (typesCount === 0) {
    const types = [
      ["video", "ویدیو"],
      ["poster", "پوستر / بنر"],
      ["podcast", "پادکست"],
      ["text", "متن / یادداشت"],
      ["clip", "کلیپ کوتاه"]
    ];
    const ins = db.prepare("INSERT INTO work_types (key, label) VALUES (?, ?)");
    types.forEach(([k, l]) => ins.run(k, l));
  }

  const platCount = db.prepare("SELECT COUNT(*) c FROM platforms").get().c;
  if (platCount === 0) {
    const plats = ["تلگرام", "اینستاگرام", "بله", "ایتا", "آپارات", "یوتیوب", "وب‌سایت"];
    const ins = db.prepare("INSERT INTO platforms (label) VALUES (?)");
    plats.forEach((p) => ins.run(p));
  }
})();

module.exports = db;
module.exports.hashPassword = hashPassword;
module.exports.verifyPassword = verifyPassword;
