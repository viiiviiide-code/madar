const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// بارگذاری سبک .env (بدون نیاز به پکیج dotenv) — اگر server/.env وجود داشته باشد.
(function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) return;
    const key = m[1];
    let val = (m[2] || "").trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  });
})();

const db = require("./db");
const { sign, requireAuth, requireAdmin } = require("./auth");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

/* ---------- auth ---------- */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE username=?").get(String(username || "").trim());
  if (!u || !db.verifyPassword(password, u.password_hash)) {
    return res.status(401).json({ error: "نام کاربری یا رمز عبور اشتباه است" });
  }
  const token = sign({ id: u.id, username: u.username, role: u.role });
  res.json({ token, username: u.username, role: u.role });
});

// همه چیز زیر /api از این به بعد نیاز به ورود دارد؛ لاگین از قبل تعریف شده و مستثناست.
app.use("/api", requireAuth);

app.get("/api/me", (req, res) => res.json(req.user));

app.put("/api/account/password", (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!u || !db.verifyPassword(currentPassword, u.password_hash)) {
    return res.status(401).json({ error: "رمز فعلی اشتباه است" });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: "رمز جدید باید حداقل ۶ کاراکتر باشد" });
  }
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(db.hashPassword(newPassword), u.id);
  res.json({ ok: true });
});

/* ---------- user management (admin only) ---------- */
app.get("/api/users", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT id,username,role,created_at FROM users ORDER BY id").all());
});
app.post("/api/users", requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "نام کاربری و رمز لازم است" });
  if (String(password).length < 6) return res.status(400).json({ error: "رمز باید حداقل ۶ کاراکتر باشد" });
  if (db.prepare("SELECT id FROM users WHERE username=?").get(username)) {
    return res.status(400).json({ error: "این نام کاربری قبلاً استفاده شده" });
  }
  const finalRole = role === "admin" ? "admin" : "viewer";
  const r = db.prepare("INSERT INTO users (username,password_hash,role,created_at) VALUES (?,?,?,?)")
    .run(username, db.hashPassword(password), finalRole, new Date().toISOString());
  res.json({ id: r.lastInsertRowid, username, role: finalRole });
});
app.put("/api/users/:id", requireAdmin, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "not found" });
  const { password, role } = req.body || {};
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: "رمز باید حداقل ۶ کاراکتر باشد" });
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(db.hashPassword(password), u.id);
  }
  if (role === "admin" || role === "viewer") {
    db.prepare("UPDATE users SET role=? WHERE id=?").run(role, u.id);
  }
  res.json({ ok: true });
});
app.delete("/api/users/:id", requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "نمی‌توانی حساب خودت را حذف کنی" });
  }
  const target = db.prepare("SELECT role FROM users WHERE id=?").get(req.params.id);
  const adminCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c;
  if (target?.role === "admin" && adminCount <= 1) {
    return res.status(400).json({ error: "باید حداقل یک حساب مدیریت باقی بماند" });
  }
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* per-user access grants: a whole template, or a single activity */
app.get("/api/users/:id/permissions", requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT up.id, up.template_id, up.project_id,
            t.label AS template_label,
            pr.title AS project_title, pr.template_id AS project_template_id
     FROM user_permissions up
     LEFT JOIN templates t ON t.id=up.template_id
     LEFT JOIN projects pr ON pr.id=up.project_id
     WHERE up.user_id=? ORDER BY up.id`
  ).all(req.params.id);
  res.json(rows);
});
app.post("/api/users/:id/permissions", requireAdmin, (req, res) => {
  const { template_id, project_id } = req.body || {};
  if (!template_id && !project_id) return res.status(400).json({ error: "تمپلیت یا فعالیت را انتخاب کن" });
  const r = db.prepare("INSERT INTO user_permissions (user_id,template_id,project_id,created_at) VALUES (?,?,?,?)")
    .run(req.params.id, project_id ? null : (template_id || null), project_id || null, new Date().toISOString());
  res.json({ id: r.lastInsertRowid });
});
app.delete("/api/users/:id/permissions/:permId", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM user_permissions WHERE id=? AND user_id=?").run(req.params.permId, req.params.id);
  res.json({ ok: true });
});

const UP = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UP)) fs.mkdirSync(UP, { recursive: true });
app.use("/uploads", express.static(UP, {
  setHeaders: (res) => {
    // hint browsers/download-managers to play inline rather than download
    res.setHeader("Content-Disposition", "inline");
  },
}));

/* ---------- file upload ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });
app.post("/api/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  res.json({ url: "/uploads/" + req.file.filename });
});

/* ---------- per-user access scoping (template/activity level) ---------- */
// A viewer with zero permission rows is unrestricted (keeps existing shared
// "user" account working exactly as before). A viewer with any rows can only
// see what those rows grant — either a whole template, or a single activity.
function isRestricted(user) {
  if (!user || user.role === "admin") return false;
  const c = db.prepare("SELECT COUNT(*) c FROM user_permissions WHERE user_id=?").get(user.id).c;
  return c > 0;
}
function permittedProjectIds(userId) {
  const rows = db.prepare("SELECT template_id, project_id FROM user_permissions WHERE user_id=?").all(userId);
  const ids = new Set(rows.filter((r) => r.project_id).map((r) => r.project_id));
  const tplIds = rows.filter((r) => r.template_id && !r.project_id).map((r) => r.template_id);
  if (tplIds.length) {
    const ph = tplIds.map(() => "?").join(",");
    db.prepare(`SELECT id FROM projects WHERE template_id IN (${ph})`).all(...tplIds)
      .forEach((p) => ids.add(p.id));
  }
  return ids;
}
function permittedTemplateIds(userId) {
  const rows = db.prepare("SELECT template_id, project_id FROM user_permissions WHERE user_id=?").all(userId);
  const ids = new Set(rows.filter((r) => r.template_id && !r.project_id).map((r) => r.template_id));
  const projIds = rows.filter((r) => r.project_id).map((r) => r.project_id);
  if (projIds.length) {
    const ph = projIds.map(() => "?").join(",");
    db.prepare(`SELECT DISTINCT template_id FROM projects WHERE id IN (${ph}) AND template_id IS NOT NULL`)
      .all(...projIds).forEach((r) => ids.add(r.template_id));
  }
  return ids;
}
function canSeeProject(req, projectId) {
  if (!isRestricted(req.user)) return true;
  return permittedProjectIds(req.user.id).has(Number(projectId));
}

/* ---------- helpers ---------- */
const totalViews = (workId) =>
  db.prepare("SELECT COALESCE(SUM(views),0) t FROM work_platform_views WHERE work_id=?")
    .get(workId).t;
const totalLikes = (workId) =>
  db.prepare("SELECT COALESCE(SUM(likes),0) t FROM work_platform_views WHERE work_id=?")
    .get(workId).t;
const totalComments = (workId) =>
  db.prepare("SELECT COALESCE(SUM(comments),0) t FROM work_platform_views WHERE work_id=?")
    .get(workId).t;

const keywordsOf = (workId) =>
  db.prepare("SELECT text FROM work_keywords WHERE work_id=?").all(workId).map((r) => r.text);

const platformViewsOf = (workId) =>
  db.prepare(
    `SELECT pv.platform_id, p.label, p.logo_url, pv.views, pv.likes, pv.comments
     FROM work_platform_views pv JOIN platforms p ON p.id=pv.platform_id
     WHERE pv.work_id=?`
  ).all(workId);

const tvBroadcastsOf = (workId) =>
  db.prepare(
    `SELECT tb.id, tb.platform_id, p.label, p.logo_url, tb.date, tb.time
     FROM tv_broadcasts tb JOIN platforms p ON p.id=tb.platform_id
     WHERE tb.work_id=? ORDER BY tb.date, tb.time`
  ).all(workId);

const mediaOf = (workId) =>
  db.prepare("SELECT id, url, kind, sort_order FROM work_media WHERE work_id=? ORDER BY sort_order, id")
    .all(workId);

function hydrateWork(w) {
  if (!w) return w;
  return {
    ...w,
    keywords: keywordsOf(w.id),
    platformViews: platformViewsOf(w.id),
    totalViews: totalViews(w.id),
    totalLikes: totalLikes(w.id),
    totalComments: totalComments(w.id),
    media: mediaOf(w.id),
    tv: tvBroadcastsOf(w.id),
  };
}

function hydrateProject(p) {
  if (!p) return p;
  const stats = db.prepare("SELECT * FROM stats WHERE project_id=? ORDER BY sort_order").all(p.id);
  const works = db.prepare("SELECT * FROM works WHERE project_id=? ORDER BY datetime(created_at) DESC").all(p.id);
  return { ...p, stats, works: works.map(hydrateWork) };
}

/* ---------- settings ---------- */
app.get("/api/settings", (req, res) => {
  const rows = db.prepare("SELECT key,value FROM settings").all();
  const o = {};
  rows.forEach((r) => (o[r.key] = r.value));
  res.json(o);
});
app.put("/api/settings", requireAdmin, (req, res) => {
  const up = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)");
  const tx = db.transaction((obj) => {
    Object.entries(obj).forEach(([k, v]) => up.run(k, String(v)));
  });
  tx(req.body || {});
  res.json({ ok: true });
});

/* ---------- types & platforms ---------- */
app.get("/api/types", (req, res) =>
  res.json(db.prepare("SELECT * FROM work_types ORDER BY id").all()));
app.post("/api/types", requireAdmin, (req, res) => {
  const { key, label } = req.body;
  try {
    const r = db.prepare("INSERT INTO work_types (key,label) VALUES (?,?)").run(key, label);
    res.json(db.prepare("SELECT * FROM work_types WHERE id=?").get(r.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: "نوع تکراری است" });
  }
});
app.delete("/api/types/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM work_types WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/platforms", (req, res) =>
  res.json(db.prepare("SELECT * FROM platforms ORDER BY id").all()));
app.post("/api/platforms", requireAdmin, (req, res) => {
  const r = db.prepare("INSERT INTO platforms (label,logo_url,type) VALUES (?,?,?)")
    .run(req.body.label, req.body.logo_url || null, req.body.type === "tv" ? "tv" : "social");
  res.json(db.prepare("SELECT * FROM platforms WHERE id=?").get(r.lastInsertRowid));
});
app.put("/api/platforms/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM platforms WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  const b = { ...cur, ...req.body };
  db.prepare("UPDATE platforms SET label=?, logo_url=?, type=? WHERE id=?")
    .run(b.label, b.logo_url ?? null, b.type === "tv" ? "tv" : "social", req.params.id);
  res.json(db.prepare("SELECT * FROM platforms WHERE id=?").get(req.params.id));
});
app.delete("/api/platforms/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM work_platform_views WHERE platform_id=?").run(req.params.id);
  db.prepare("DELETE FROM tv_broadcasts WHERE platform_id=?").run(req.params.id);
  db.prepare("DELETE FROM platforms WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- keyword autocomplete ---------- */
app.get("/api/keywords", (req, res) => {
  const prefix = (req.query.prefix || "").trim();
  if (!prefix) return res.json([]);
  const rows = db.prepare(
    "SELECT text, COUNT(*) c FROM work_keywords WHERE text LIKE ? GROUP BY text ORDER BY c DESC LIMIT 8"
  ).all(prefix + "%");
  res.json(rows.map((r) => r.text));
});

/* distinct previously-used values for a given work field (axis | campaign) */
app.get("/api/field-values", (req, res) => {
  const field = String(req.query.field || "");
  const allowed = { axis: "axis", campaign: "campaign" };
  const col = allowed[field];
  if (!col) return res.json([]);
  const rows = db.prepare(
    `SELECT ${col} AS v, COUNT(*) c FROM works
     WHERE ${col} IS NOT NULL AND TRIM(${col})<>''
     GROUP BY ${col} ORDER BY c DESC, ${col} LIMIT 50`
  ).all();
  res.json(rows.map((r) => r.v));
});

/* ---------- templates (cores) ---------- */
app.get("/api/templates", (req, res) => {
  const rows = db.prepare("SELECT * FROM templates ORDER BY sort_order, id").all();
  const restricted = isRestricted(req.user);
  const allowedTpl = restricted ? permittedTemplateIds(req.user.id) : null;
  const allowedProj = restricted ? permittedProjectIds(req.user.id) : null;
  const out = rows
    .filter((t) => !restricted || allowedTpl.has(t.id))
    .map((t) => {
      const fullAccess = !restricted || db.prepare(
        "SELECT COUNT(*) c FROM user_permissions WHERE user_id=? AND template_id=? AND project_id IS NULL"
      ).get(req.user.id, t.id).c > 0;
      const count = fullAccess
        ? db.prepare("SELECT COUNT(*) c FROM projects WHERE template_id=?").get(t.id).c
        : db.prepare("SELECT id FROM projects WHERE template_id=?").all(t.id)
            .filter((p) => allowedProj.has(p.id)).length;
      return { ...t, count };
    });
  res.json(out);
});
app.post("/api/templates", requireAdmin, (req, res) => {
  const b = req.body;
  const r = db.prepare(
    "INSERT INTO templates (label, from_date, to_date, sort_order, theme, font, created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(b.label || "تمپلیت جدید", b.from_date || null, b.to_date || null, b.sort_order ?? 0,
    b.theme || "orbit", b.font || "Vazirmatn", new Date().toISOString());
  res.json(db.prepare("SELECT * FROM templates WHERE id=?").get(r.lastInsertRowid));
});
app.put("/api/templates/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM templates WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  const b = { ...cur, ...req.body };
  db.prepare("UPDATE templates SET label=?, from_date=?, to_date=?, sort_order=?, theme=?, font=? WHERE id=?")
    .run(b.label, b.from_date, b.to_date, b.sort_order, b.theme || "orbit", b.font || "Vazirmatn", req.params.id);
  res.json(db.prepare("SELECT * FROM templates WHERE id=?").get(req.params.id));
});
app.delete("/api/templates/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE projects SET template_id=NULL WHERE template_id=?").run(req.params.id);
  db.prepare("DELETE FROM templates WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- projects ---------- */
app.get("/api/projects", (req, res) => {
  const { from, to, templateId } = req.query;
  let rows;
  if (templateId) {
    rows = db.prepare("SELECT * FROM projects WHERE template_id=? ORDER BY start_date").all(templateId);
  } else if (from && to) {
    rows = db.prepare(
      "SELECT * FROM projects WHERE start_date IS NOT NULL AND start_date BETWEEN ? AND ? ORDER BY start_date"
    ).all(from, to);
  } else {
    rows = db.prepare("SELECT * FROM projects ORDER BY start_date").all();
  }
  if (isRestricted(req.user)) {
    const allowed = permittedProjectIds(req.user.id);
    rows = rows.filter((p) => allowed.has(p.id));
  }
  const out = rows.map((p) => ({
    ...p,
    worksCount: db.prepare("SELECT COUNT(*) c FROM works WHERE project_id=?").get(p.id).c,
  }));
  res.json(out);
});

app.get("/api/projects/all", (req, res) => {
  let rows = db.prepare("SELECT id,title,sub,start_date,end_date,template_id FROM projects ORDER BY start_date").all();
  if (isRestricted(req.user)) {
    const allowed = permittedProjectIds(req.user.id);
    rows = rows.filter((p) => allowed.has(p.id));
  }
  res.json(rows);
});

app.get("/api/projects/:id", (req, res) => {
  if (!canSeeProject(req, req.params.id)) return res.status(403).json({ error: "دسترسی به این فعالیت را نداری" });
  const p = db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json(hydrateProject(p));
});

app.post("/api/projects", requireAdmin, (req, res) => {
  const b = req.body;
  const r = db.prepare(
    `INSERT INTO projects (title,sub,start_date,end_date,teaser_url,node_x,node_y,node_size,node_font,node_bold,orbit,template_id,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    b.title || "فعالیت جدید", b.sub || "", b.start_date || null, b.end_date || null, b.teaser_url || null,
    b.node_x ?? 50, b.node_y ?? 35, b.node_size ?? 56, b.node_font ?? 12, b.node_bold ?? 0,
    b.orbit ?? 1, b.template_id ?? null, new Date().toISOString()
  );
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id=?").get(r.lastInsertRowid)));
});

app.put("/api/projects/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  const b = { ...cur, ...req.body };
  db.prepare(
    `UPDATE projects SET title=?,sub=?,start_date=?,end_date=?,teaser_url=?,node_x=?,node_y=?,node_size=?,node_font=?,node_bold=?,orbit=?,template_id=? WHERE id=?`
  ).run(b.title, b.sub, b.start_date, b.end_date ?? null, b.teaser_url, b.node_x, b.node_y, b.node_size, b.node_font, b.node_bold, b.orbit, b.template_id ?? null, req.params.id);
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id)));
});

app.delete("/api/projects/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM projects WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* full deep-copy of a project (stats + works + their keywords/media/platform-views)
   into another template, so an activity doesn't have to be redefined by hand. */
app.post("/api/projects/:id/duplicate", requireAdmin, (req, res) => {
  const src = db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id);
  if (!src) return res.status(404).json({ error: "not found" });
  const targetTemplateId = req.body.template_id ?? null;

  const newId = db.transaction(() => {
    const now = new Date().toISOString();
    const pr = db.prepare(
      `INSERT INTO projects (title,sub,start_date,end_date,teaser_url,node_x,node_y,node_size,node_font,node_bold,orbit,template_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      src.title + " (کپی)", src.sub, src.start_date, src.end_date, src.teaser_url,
      src.node_x, src.node_y, src.node_size, src.node_font, src.node_bold, src.orbit,
      targetTemplateId, now
    );
    const pid = pr.lastInsertRowid;

    const stats = db.prepare("SELECT * FROM stats WHERE project_id=? ORDER BY sort_order").all(src.id);
    const insStat = db.prepare("INSERT INTO stats (project_id,label,value,descr,sort_order) VALUES (?,?,?,?,?)");
    stats.forEach((s) => insStat.run(pid, s.label, s.value, s.descr, s.sort_order));

    const works = db.prepare("SELECT * FROM works WHERE project_id=?").all(src.id);
    const insWork = db.prepare(
      `INSERT INTO works (project_id,type,title,descr,axis,campaign,event_date,url,featured,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    const insKw = db.prepare("INSERT INTO work_keywords (work_id,text) VALUES (?,?)");
    const insPV = db.prepare("INSERT INTO work_platform_views (work_id,platform_id,views,likes,comments) VALUES (?,?,?,?,?)");
    const insMedia = db.prepare("INSERT INTO work_media (work_id,url,kind,sort_order) VALUES (?,?,?,?)");
    const insTv = db.prepare("INSERT INTO tv_broadcasts (work_id,platform_id,date,time) VALUES (?,?,?,?)");

    for (const w of works) {
      const wr = insWork.run(pid, w.type, w.title, w.descr, w.axis, w.campaign, w.event_date, w.url, w.featured, now);
      const wid = wr.lastInsertRowid;
      keywordsOf(w.id).forEach((k) => insKw.run(wid, k));
      db.prepare("SELECT platform_id,views,likes,comments FROM work_platform_views WHERE work_id=?").all(w.id)
        .forEach((pv) => insPV.run(wid, pv.platform_id, pv.views, pv.likes, pv.comments));
      mediaOf(w.id).forEach((m) => insMedia.run(wid, m.url, m.kind, m.sort_order));
      db.prepare("SELECT platform_id,date,time FROM tv_broadcasts WHERE work_id=?").all(w.id)
        .forEach((t) => insTv.run(wid, t.platform_id, t.date, t.time));
    }
    return pid;
  })();

  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id=?").get(newId)));
});

/* ---------- stats ---------- */
app.put("/api/projects/:id/stats", requireAdmin, (req, res) => {
  const pid = req.params.id;
  const items = req.body.stats || [];
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM stats WHERE project_id=?").run(pid);
    const ins = db.prepare("INSERT INTO stats (project_id,label,value,descr,sort_order) VALUES (?,?,?,?,?)");
    items.forEach((s, i) => ins.run(pid, s.label, s.value, s.descr || "", i));
  });
  tx();
  res.json(db.prepare("SELECT * FROM stats WHERE project_id=? ORDER BY sort_order").all(pid));
});

/* previously-used stat titles across all projects, for the suggestion dropdown */
app.get("/api/stat-labels", (req, res) => {
  const prefix = (req.query.prefix || "").trim();
  const rows = prefix
    ? db.prepare("SELECT DISTINCT label FROM stats WHERE label LIKE ? ORDER BY label LIMIT 20").all(prefix + "%")
    : db.prepare("SELECT DISTINCT label FROM stats WHERE label IS NOT NULL AND TRIM(label)<>'' ORDER BY label LIMIT 100").all();
  res.json(rows.map((r) => r.label));
});

/* ---------- works ---------- */
app.get("/api/works", (req, res) => {
  const { projectId, type, q, keyword, from, to, sort, featured } = req.query;
  if (projectId && !canSeeProject(req, projectId)) return res.status(403).json({ error: "دسترسی نداری" });
  // unified: q searches text fields AND keywords; legacy keyword param also supported
  const unifiedQ = q || keyword || "";

  let sql, args = [];
  if (unifiedQ) {
    // LEFT JOIN keywords so we can match either text fields OR keyword
    sql = "SELECT DISTINCT w.* FROM works w LEFT JOIN work_keywords k ON k.work_id=w.id";
  } else {
    sql = "SELECT DISTINCT w.* FROM works w";
  }
  const where = [];
  if (projectId) { where.push("w.project_id=?"); args.push(projectId); }
  if (type && type !== "all") { where.push("w.type=?"); args.push(type); }
  if (featured) { where.push("w.featured=1"); }
  if (from) { where.push("w.event_date>=?"); args.push(from); }
  if (to)   { where.push("w.event_date<=?"); args.push(to); }
  if (unifiedQ) {
    const like = "%" + unifiedQ + "%";
    where.push("(w.title LIKE ? OR w.descr LIKE ? OR w.axis LIKE ? OR w.campaign LIKE ? OR k.text LIKE ?)");
    args.push(like, like, like, like, like);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  if (sort === "old")   sql += " ORDER BY datetime(w.created_at) ASC";
  else if (sort === "title") sql += " ORDER BY w.title COLLATE NOCASE";
  else sql += " ORDER BY datetime(w.created_at) DESC";

  let rows = db.prepare(sql).all(...args).map(hydrateWork);
  if (!projectId && isRestricted(req.user)) {
    const allowed = permittedProjectIds(req.user.id);
    rows = rows.filter((w) => allowed.has(w.project_id));
  }
  if (sort === "views") rows = rows.sort((a, b) => b.totalViews - a.totalViews);
  res.json(rows);
});

/* featured works belonging to a template (across all its projects) */
app.get("/api/templates/:id/featured-works", (req, res) => {
  if (isRestricted(req.user) && !permittedTemplateIds(req.user.id).has(Number(req.params.id))) {
    return res.status(403).json({ error: "دسترسی نداری" });
  }
  const rows = db.prepare(
    `SELECT w.* FROM works w JOIN projects p ON p.id=w.project_id
     WHERE p.template_id=? AND w.featured=1 ORDER BY datetime(w.created_at) DESC`
  ).all(req.params.id);
  let out = rows.map(hydrateWork);
  if (isRestricted(req.user)) {
    const allowed = permittedProjectIds(req.user.id);
    out = out.filter((w) => allowed.has(w.project_id));
  }
  res.json(out);
});

app.get("/api/works/:id", (req, res) => {
  const w = db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id);
  if (!w) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, w.project_id)) return res.status(403).json({ error: "دسترسی نداری" });
  res.json(hydrateWork(w));
});

function saveKeywords(workId, keywords) {
  db.prepare("DELETE FROM work_keywords WHERE work_id=?").run(workId);
  const ins = db.prepare("INSERT INTO work_keywords (work_id,text) VALUES (?,?)");
  (keywords || []).map((k) => String(k).trim()).filter(Boolean)
    .forEach((k) => ins.run(workId, k));
}
function savePlatformViews(workId, platformViews) {
  db.prepare("DELETE FROM work_platform_views WHERE work_id=?").run(workId);
  const ins = db.prepare("INSERT INTO work_platform_views (work_id,platform_id,views,likes,comments) VALUES (?,?,?,?,?)");
  (platformViews || []).forEach((pv) =>
    ins.run(workId, pv.platform_id, Number(pv.views) || 0, Number(pv.likes) || 0, Number(pv.comments) || 0));
}
function saveTvBroadcasts(workId, tv) {
  db.prepare("DELETE FROM tv_broadcasts WHERE work_id=?").run(workId);
  const ins = db.prepare("INSERT INTO tv_broadcasts (work_id,platform_id,date,time) VALUES (?,?,?,?)");
  (tv || []).filter((t) => t && t.platform_id && t.date && t.time)
    .forEach((t) => ins.run(workId, t.platform_id, t.date, t.time));
}
function saveMedia(workId, media) {
  db.prepare("DELETE FROM work_media WHERE work_id=?").run(workId);
  const ins = db.prepare("INSERT INTO work_media (work_id,url,kind,sort_order) VALUES (?,?,?,?)");
  (media || []).filter((m) => m && m.url).forEach((m, i) =>
    ins.run(workId, m.url, m.kind || "image", i));
}

app.post("/api/works", requireAdmin, (req, res) => {
  const b = req.body;
  const tx = db.transaction(() => {
    // primary url = explicit url, else first media item
    const primaryUrl = b.url || (Array.isArray(b.media) && b.media[0] ? b.media[0].url : null);
    const r = db.prepare(
      `INSERT INTO works (project_id,type,title,descr,axis,campaign,event_date,url,featured,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(b.project_id, b.type, b.title, b.descr || "", b.axis || "", b.campaign || "",
      b.event_date || null, primaryUrl, b.featured ? 1 : 0, new Date().toISOString());
    const id = r.lastInsertRowid;
    saveKeywords(id, b.keywords);
    savePlatformViews(id, b.platformViews);
    saveTvBroadcasts(id, b.tv);
    saveMedia(id, b.media);
    return id;
  });
  const id = tx();
  res.json(hydrateWork(db.prepare("SELECT * FROM works WHERE id=?").get(id)));
});

app.put("/api/works/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  const b = { ...cur, ...req.body };
  const tx = db.transaction(() => {
    // keep url in sync with first media item when media provided
    let url = b.url;
    if ("media" in req.body) {
      url = (Array.isArray(b.media) && b.media[0]) ? b.media[0].url : (b.url || null);
    }
    db.prepare(
      `UPDATE works SET type=?,title=?,descr=?,axis=?,campaign=?,event_date=?,url=?,featured=? WHERE id=?`
    ).run(b.type, b.title, b.descr, b.axis, b.campaign, b.event_date, url, b.featured ? 1 : 0, req.params.id);
    if ("keywords" in req.body) saveKeywords(req.params.id, b.keywords);
    if ("platformViews" in req.body) savePlatformViews(req.params.id, b.platformViews);
    if ("tv" in req.body) saveTvBroadcasts(req.params.id, b.tv);
    if ("media" in req.body) saveMedia(req.params.id, b.media);
  });
  tx();
  res.json(hydrateWork(db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id)));
});

app.delete("/api/works/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM works WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* copy a single work (with its keywords/media/platform-views) into another activity,
   which may belong to a different template — or no template at all. */
app.post("/api/works/:id/duplicate", requireAdmin, (req, res) => {
  const src = db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id);
  if (!src) return res.status(404).json({ error: "not found" });
  const targetProjectId = req.body.project_id;
  const targetProject = db.prepare("SELECT id FROM projects WHERE id=?").get(targetProjectId);
  if (!targetProject) return res.status(400).json({ error: "فعالیت مقصد پیدا نشد" });

  const newId = db.transaction(() => {
    const now = new Date().toISOString();
    const r = db.prepare(
      `INSERT INTO works (project_id,type,title,descr,axis,campaign,event_date,url,featured,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(targetProjectId, src.type, src.title, src.descr, src.axis, src.campaign, src.event_date, src.url, src.featured, now);
    const wid = r.lastInsertRowid;
    const insKw = db.prepare("INSERT INTO work_keywords (work_id,text) VALUES (?,?)");
    keywordsOf(src.id).forEach((k) => insKw.run(wid, k));
    const insPV = db.prepare("INSERT INTO work_platform_views (work_id,platform_id,views,likes,comments) VALUES (?,?,?,?,?)");
    db.prepare("SELECT platform_id,views,likes,comments FROM work_platform_views WHERE work_id=?").all(src.id)
      .forEach((pv) => insPV.run(wid, pv.platform_id, pv.views, pv.likes, pv.comments));
    const insMedia = db.prepare("INSERT INTO work_media (work_id,url,kind,sort_order) VALUES (?,?,?,?)");
    mediaOf(src.id).forEach((m) => insMedia.run(wid, m.url, m.kind, m.sort_order));
    const insTv = db.prepare("INSERT INTO tv_broadcasts (work_id,platform_id,date,time) VALUES (?,?,?,?)");
    db.prepare("SELECT platform_id,date,time FROM tv_broadcasts WHERE work_id=?").all(src.id)
      .forEach((t) => insTv.run(wid, t.platform_id, t.date, t.time));
    return wid;
  })();

  res.json(hydrateWork(db.prepare("SELECT * FROM works WHERE id=?").get(newId)));
});

/* similar works: shares >=1 keyword (OR), ranked by shared count —
   scoped to the same template (or, if the work's activity has no template, just that activity) */
app.get("/api/works/:id/similar", (req, res) => {
  const kws = keywordsOf(req.params.id);
  if (!kws.length) return res.json([]);
  const srcWork = db.prepare("SELECT project_id FROM works WHERE id=?").get(req.params.id);
  if (!srcWork) return res.json([]);
  if (!canSeeProject(req, srcWork.project_id)) return res.status(403).json({ error: "دسترسی نداری" });
  const srcProject = db.prepare("SELECT template_id FROM projects WHERE id=?").get(srcWork.project_id);
  const templateId = srcProject?.template_id ?? null;
  const ph = kws.map(() => "?").join(",");

  let sql, args;
  if (templateId) {
    sql = `SELECT w.*, COUNT(*) shared
           FROM works w JOIN work_keywords k ON k.work_id=w.id
           JOIN projects p ON p.id=w.project_id
           WHERE k.text IN (${ph}) AND w.id<>? AND p.template_id=?
           GROUP BY w.id ORDER BY shared DESC, datetime(w.created_at) DESC LIMIT 6`;
    args = [...kws, req.params.id, templateId];
  } else {
    sql = `SELECT w.*, COUNT(*) shared
           FROM works w JOIN work_keywords k ON k.work_id=w.id
           WHERE k.text IN (${ph}) AND w.id<>? AND w.project_id=?
           GROUP BY w.id ORDER BY shared DESC, datetime(w.created_at) DESC LIMIT 6`;
    args = [...kws, req.params.id, srcWork.project_id];
  }
  const rows = db.prepare(sql).all(...args);
  let out = rows.map(hydrateWork);
  if (isRestricted(req.user)) {
    const allowed = permittedProjectIds(req.user.id);
    out = out.filter((w) => allowed.has(w.project_id));
  }
  res.json(out);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Madar API on http://localhost:${PORT}`));
