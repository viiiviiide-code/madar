const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const DB_PATH = "/home/ubuntu/apps/madar/database/madar.db";
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',   -- 'admin' | 'viewer'
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS work_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE,
  label TEXT
);

CREATE TABLE IF NOT EXISTS platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  sub TEXT,
  start_date TEXT,            -- ISO 'YYYY-MM-DD' (Gregorian)
  teaser_url TEXT,
  node_x REAL DEFAULT 50,     -- percent
  node_y REAL DEFAULT 50,     -- percent
  node_size REAL DEFAULT 56,  -- px
  node_font REAL DEFAULT 12,  -- px (label font size)
  node_bold INTEGER DEFAULT 0,
  orbit INTEGER DEFAULT 1,
  template_id INTEGER,        -- optional: which core/template it belongs to
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  from_date TEXT,             -- ISO
  to_date TEXT,               -- ISO
  sort_order INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  label TEXT,
  value TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  type TEXT,
  title TEXT,
  descr TEXT,
  axis TEXT,
  campaign TEXT,
  event_date TEXT,           -- ISO 'YYYY-MM-DD'
  url TEXT,
  created_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER,
  text TEXT,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER,
  url TEXT,
  kind TEXT,                 -- 'video' | 'image' | 'audio'
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_platform_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER,
  platform_id INTEGER,
  views INTEGER DEFAULT 0,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tv_broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER,
  platform_id INTEGER,   -- a platform row with type='tv' (the network)
  date TEXT,             -- ISO 'YYYY-MM-DD'
  time TEXT,             -- 'HH:MM'
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  template_id INTEGER,   -- set (with project_id NULL) => full access to this whole template
  project_id INTEGER,    -- set => access to just this one activity (any template, or none)
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
`);

/* ---------- migrations (for DBs created before these columns) ---------- */
function addCol(table, col, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (e) {}
}
addCol("projects", "node_font", "REAL DEFAULT 12");
addCol("projects", "node_bold", "INTEGER DEFAULT 0");
addCol("projects", "template_id", "INTEGER");
addCol("projects", "end_date", "TEXT");
addCol("stats", "descr", "TEXT");
addCol("works", "featured", "INTEGER DEFAULT 0");
addCol("work_platform_views", "likes", "INTEGER DEFAULT 0");
addCol("work_platform_views", "comments", "INTEGER DEFAULT 0");
addCol("platforms", "logo_url", "TEXT");
addCol("platforms", "type", "TEXT DEFAULT 'social'"); // 'social' | 'tv'
addCol("templates", "theme", "TEXT DEFAULT 'orbit'");
addCol("templates", "font", "TEXT DEFAULT 'Vazirmatn'");

/* one-time addition of "screenshot" / "link" work types (existing installs already seeded) */
const typesV2 = db.prepare("SELECT value FROM settings WHERE key='types_v2_seeded'").get();
if (!typesV2) {
  const t = db.prepare("INSERT OR IGNORE INTO work_types (key,label) VALUES (?,?)");
  t.run("screenshot", "اسکرین‌شات");
  t.run("link", "لینک");
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('types_v2_seeded','1')").run();
}

/* ---------- seed users (independent of main seed flag, runs once) ---------- */
const usersExist = db.prepare("SELECT COUNT(*) c FROM users").get().c;
if (!usersExist) {
  const insUser = db.prepare(
    "INSERT INTO users (username,password_hash,role,created_at) VALUES (?,?,?,?)"
  );
  const now = new Date().toISOString();
  insUser.run("admin", hashPassword("admin12345"), "admin", now);
  insUser.run("user", hashPassword("user12345"), "viewer", now);
  console.log("Default users created — admin/admin12345 (مدیریت) و user/user12345 (نمایش). لطفاً پس از اولین ورود رمزها را تغییر دهید.");
}

/* ---------- seed once ---------- */
const seeded = db.prepare("SELECT value FROM settings WHERE key='seeded'").get();
if (!seeded) {
  const tx = db.transaction(() => {
    const setS = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)");
    setS.run("orbits", "3");
    setS.run("anim_pulse", "1");
    setS.run("anim_float", "1");
    setS.run("anim_twinkle", "1");
    setS.run("range_from", "1404-03-01");
    setS.run("range_to", "1405-03-01");
    setS.run("range_label", "");
    setS.run("range_label_font", "13");
    setS.run("theme", "dark");
    setS.run("seeded", "1");

    const t = db.prepare("INSERT INTO work_types (key,label) VALUES (?,?)");
    [["video", "ویدئو"], ["poster", "پوستر"], ["image", "عکس"], ["audio", "صوت"]]
      .forEach(([k, l]) => t.run(k, l));

    const p = db.prepare("INSERT INTO platforms (label) VALUES (?)");
    ["تلگرام", "اینستاگرام", "یوتیوب", "آپارات", "ایکس"].forEach((x) => p.run(x));

    const insProj = db.prepare(
      `INSERT INTO projects (title,sub,start_date,node_x,node_y,node_size,orbit,created_at)
       VALUES (@title,@sub,@start_date,@node_x,@node_y,@node_size,@orbit,@created_at)`
    );
    const insStat = db.prepare(
      "INSERT INTO stats (project_id,label,value,sort_order) VALUES (?,?,?,?)"
    );
    const insWork = db.prepare(
      `INSERT INTO works (project_id,type,title,descr,axis,campaign,event_date,created_at)
       VALUES (@project_id,@type,@title,@descr,@axis,@campaign,@event_date,@created_at)`
    );
    const insKw = db.prepare("INSERT INTO work_keywords (work_id,text) VALUES (?,?)");
    const insPV = db.prepare(
      "INSERT INTO work_platform_views (work_id,platform_id,views) VALUES (?,?,?)"
    );
    const now = new Date().toISOString();

    const sample = [
      {
        title: "پویش نوروز در خانه", sub: "کمپین فرهنگی نوروزی",
        start_date: "2025-03-20", node_x: 30, node_y: 38, node_size: 66, orbit: 1,
        stats: [["تیزر تولیدشده", "۷"], ["محورهای کاری", "۳"], ["آثار منتشرشده", "۲۴"]],
        works: [
          { type: "video", title: "تیزر افتتاحیه پویش", axis: "خانواده", campaign: "نوروز ۱۴۰۴",
            descr: "تیزر اصلی کمپین با محوریت دورهمی خانوادگی.", event_date: "2025-03-21",
            kw: ["نوروز", "خانواده", "تیزر"], pv: [["تلگرام", 120000], ["اینستاگرام", 240000], ["یوتیوب", 60000]] },
          { type: "poster", title: "پوستر سفرهٔ هفت‌سین", axis: "هویت بصری", campaign: "نوروز ۱۴۰۴",
            descr: "پوستر مجموعه برای فضای شهری و شبکه‌های اجتماعی.", event_date: "2025-03-15",
            kw: ["نوروز", "پوستر", "هفت‌سین"], pv: [["اینستاگرام", 88000]] },
          { type: "audio", title: "پادکست آیین‌ها", axis: "روایت", campaign: "نوروز ۱۴۰۴",
            descr: "اپیزود صوتی دربارهٔ آیین‌های نوروزی مناطق مختلف.", event_date: "2025-03-18",
            kw: ["نوروز", "آیین", "پادکست"], pv: [["آپارات", 31000]] },
        ],
      },
      {
        title: "مستند شهر بی‌خواب", sub: "پروژهٔ مستند شهری",
        start_date: "2025-05-10", node_x: 68, node_y: 30, node_size: 52, orbit: 2,
        stats: [["قسمت مستند", "۵"], ["ساعت تصویر خام", "۱۲۰"]],
        works: [
          { type: "video", title: "قسمت اول: نیمه‌شب", axis: "مستند", campaign: "شهر بی‌خواب",
            descr: "روایت زندگی شبانهٔ شهر از نگاه کارگران شب.", event_date: "2025-05-12",
            kw: ["مستند", "شهر", "شب"], pv: [["یوتیوب", 210000], ["تلگرام", 40000]] },
        ],
      },
      {
        title: "کمپین آب", sub: "آگاهی‌بخشی محیط‌زیست",
        start_date: "2025-07-01", node_x: 60, node_y: 70, node_size: 60, orbit: 2,
        stats: [["تیزر تولیدشده", "۴"], ["آثار منتشرشده", "۱۸"]],
        works: [
          { type: "video", title: "تیزر «هر قطره»", axis: "محیط‌زیست", campaign: "کمپین آب",
            descr: "تیزر اصلی با محوریت مصرف بهینهٔ آب.", event_date: "2025-07-05",
            kw: ["آب", "محیط‌زیست", "تیزر"], pv: [["اینستاگرام", 180000], ["تلگرام", 130000]] },
          { type: "image", title: "گزارش میدانی تالاب", axis: "مستند", campaign: "کمپین آب",
            descr: "عکس‌های میدانی از وضعیت تالاب‌ها.", event_date: "2025-06-28",
            kw: ["آب", "تالاب", "عکس"], pv: [["اینستاگرام", 27000]] },
        ],
      },
    ];

    const plats = db.prepare("SELECT id,label FROM platforms").all();
    const platId = (label) => plats.find((x) => x.label === label).id;

    // a sample template (core) covering spring 1404
    const tplId = db.prepare(
      "INSERT INTO templates (label, from_date, to_date, sort_order, created_at) VALUES (?,?,?,?,?)"
    ).run("بهار ۱۴۰۴", "2025-03-20", "2025-06-21", 0, now).lastInsertRowid;

    for (const sp of sample) {
      // assign projects that start within the template range to it
      const inTpl = sp.start_date >= "2025-03-20" && sp.start_date <= "2025-06-21";
      const pid = insProj.run({
        title: sp.title, sub: sp.sub, start_date: sp.start_date,
        node_x: sp.node_x, node_y: sp.node_y, node_size: sp.node_size,
        orbit: sp.orbit, created_at: now,
      }).lastInsertRowid;
      if (inTpl) db.prepare("UPDATE projects SET template_id=? WHERE id=?").run(tplId, pid);
      sp.stats.forEach(([l, v], i) => insStat.run(pid, l, v, i));
      for (const w of sp.works) {
        const wid = insWork.run({
          project_id: pid, type: w.type, title: w.title, descr: w.descr,
          axis: w.axis, campaign: w.campaign, event_date: w.event_date, created_at: now,
        }).lastInsertRowid;
        w.kw.forEach((k) => insKw.run(wid, k));
        w.pv.forEach(([pl, v]) => insPV.run(wid, platId(pl), v));
      }
    }
  });
  tx();
  console.log("Database seeded.");
}

module.exports = db;
module.exports.hashPassword = hashPassword;
module.exports.verifyPassword = verifyPassword;
