const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

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
const { sign, requireAuth, requireAdmin, requireOwner, requireEditor } = require("./auth");

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
  const token = sign({ id: u.id, username: u.username, role: u.role, owner: !!u.owner });
  res.json({ token, username: u.username, role: u.role, owner: !!u.owner });
});

/* ---------- public, no-login work page (share link) ---------- */
// looked up by an unguessable random token, never by the work's real id, so this
// stays open even though everything else under /api requires login below.
app.get("/api/public/works/:token", (req, res) => {
  const w = db.prepare("SELECT * FROM works WHERE share_token=?").get(req.params.token);
  if (!w) return res.status(404).json({ error: "لینک نامعتبر است یا حذف شده" });
  res.json(hydrateWork(w));
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
app.get("/api/users", requireOwner, (req, res) => {
  const users = db.prepare("SELECT id,username,role,owner,created_at FROM users ORDER BY id").all();
  const perms = db.prepare(
    `SELECT up.id, up.user_id, up.template_id, up.project_id,
            t.label AS template_label, pr.title AS project_title
     FROM user_permissions up
     LEFT JOIN templates t ON t.id=up.template_id
     LEFT JOIN projects pr ON pr.id=up.project_id`
  ).all();
  res.json(users.map((u) => ({ ...u, permissions: perms.filter((x) => x.user_id === u.id) })));
});
app.post("/api/users", requireOwner, (req, res) => {
  const { username, password, role, owner } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "نام کاربری و رمز لازم است" });
  if (String(password).length < 6) return res.status(400).json({ error: "رمز باید حداقل ۶ کاراکتر باشد" });
  if (db.prepare("SELECT id FROM users WHERE username=?").get(username)) {
    return res.status(400).json({ error: "این نام کاربری قبلاً استفاده شده" });
  }
  const finalRole = role === "admin" ? "admin" : role === "editor" ? "editor" : "viewer";
  // only an existing owner can mint another one, and only for an admin-role account
  const grantOwner = finalRole === "admin" && !!owner && isOwnerReq(req);
  const r = db.prepare("INSERT INTO users (username,password_hash,role,created_at,owner) VALUES (?,?,?,?,?)")
    .run(username, db.hashPassword(password), finalRole, new Date().toISOString(), grantOwner ? 1 : 0);
  res.json({ id: r.lastInsertRowid, username, role: finalRole, owner: grantOwner });
});
app.put("/api/users/:id", requireOwner, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "not found" });
  const { password, role, owner } = req.body || {};
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: "رمز باید حداقل ۶ کاراکتر باشد" });
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(db.hashPassword(password), u.id);
  }
  if (role === "admin" || role === "viewer" || role === "editor") {
    db.prepare("UPDATE users SET role=? WHERE id=?").run(role, u.id);
  }
  // owner status can only be granted or revoked by an existing owner, and at least
  // one owner must always remain so locked archives never end up unmanageable.
  if (typeof owner === "boolean" && isOwnerReq(req)) {
    if (!owner && u.owner) {
      const ownerCount = db.prepare("SELECT COUNT(*) c FROM users WHERE owner=1").get().c;
      if (ownerCount <= 1) return res.status(400).json({ error: "باید حداقل یک مالک آرشیو باقی بماند" });
    }
    db.prepare("UPDATE users SET owner=? WHERE id=?").run(owner ? 1 : 0, u.id);
  }
  res.json({ ok: true });
});
app.delete("/api/users/:id", requireOwner, (req, res) => {
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
app.get("/api/users/:id/permissions", requireOwner, (req, res) => {
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
app.post("/api/users/:id/permissions", requireOwner, (req, res) => {
  const { template_id, project_id } = req.body || {};
  if (!template_id && !project_id) return res.status(400).json({ error: "تمپلیت یا فعالیت را انتخاب کن" });
  const r = db.prepare("INSERT INTO user_permissions (user_id,template_id,project_id,created_at) VALUES (?,?,?,?)")
    .run(req.params.id, project_id ? null : (template_id || null), project_id || null, new Date().toISOString());
  res.json({ id: r.lastInsertRowid });
});
app.delete("/api/users/:id/permissions/:permId", requireOwner, (req, res) => {
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
// An admin who ISN'T the archive owner is now scoped the same way, except they
// additionally auto-see anything locked plus anything they made themselves —
// see autoVisible*() below — without needing any explicit grant.
function isRestricted(user) {
  if (!user) return true;
  if (user.role === "admin") return !user.owner;
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
// visible "for free", with no explicit grant needed: anything locked (read-only for
// everyone — the whole point of a shared archive), plus — for admin-role accounts
// only — whatever template/activity they made themselves. This is what keeps one
// admin's own templates from leaking into another admin's view: each one auto-sees
// just the shared locked archive(s) plus their own, nothing else.
function autoVisibleTemplateIds(user) {
  const ids = new Set(db.prepare("SELECT id FROM templates WHERE locked=1").all().map((r) => r.id));
  if (user && user.role === "admin") {
    db.prepare("SELECT id FROM templates WHERE created_by=?").all(user.id).forEach((r) => ids.add(r.id));
  }
  return ids;
}
function autoVisibleProjectIds(user) {
  const ids = new Set(
    db.prepare(`SELECT p.id AS id FROM projects p JOIN templates t ON t.id=p.template_id WHERE t.locked=1`)
      .all().map((r) => r.id)
  );
  if (user && user.role === "admin") {
    db.prepare(`SELECT p.id AS id FROM projects p JOIN templates t ON t.id=p.template_id WHERE t.created_by=?`)
      .all(user.id).forEach((r) => ids.add(r.id));
    db.prepare(`SELECT id FROM projects WHERE created_by=?`).all(user.id).forEach((r) => ids.add(r.id));
  }
  return ids;
}
function visibleTemplateIdSet(user) {
  return new Set([...autoVisibleTemplateIds(user), ...permittedTemplateIds(user.id)]);
}
function visibleProjectIdSet(user) {
  return new Set([...autoVisibleProjectIds(user), ...permittedProjectIds(user.id)]);
}
function canSeeTemplate(req, templateId) {
  if (!isRestricted(req.user)) return true;
  return visibleTemplateIdSet(req.user).has(Number(templateId));
}
function canSeeProject(req, projectId) {
  if (!isRestricted(req.user)) return true;
  return visibleProjectIdSet(req.user).has(Number(projectId));
}


/* ---------- archive lock ---------- */
// a locked template can only be modified/deleted by the archive owner. everyone
// else (including other "admin" accounts) can still see it and copy works OUT of
// it, but can't touch anything inside it. lock is intentionally a template-wide
// switch, not per-activity — it's meant to protect a whole archive at once.
function isTemplateLockedForProject(projectId) {
  const row = db.prepare(
    `SELECT t.locked AS locked FROM projects p JOIN templates t ON t.id = p.template_id WHERE p.id = ?`
  ).get(projectId);
  return !!(row && row.locked);
}
function isOwnerReq(req) {
  return !!(req.user && req.user.role === "admin" && req.user.owner);
}
// returns true and lets the caller continue; on failure, sends the 403 itself and
// returns false so the route can just `if (!requireProjectUnlocked(...)) return;`
function requireProjectUnlocked(req, res, projectId) {
  if (isOwnerReq(req)) return true;
  if (isTemplateLockedForProject(projectId)) {
    res.status(403).json({ error: "این تمپلیت توسط مالک آرشیو قفل شده — فقط می‌توانی اثر را کپی کنی، نه ویرایش یا حذف." });
    return false;
  }
  return true;
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
  const copiedFrom = w.copied_from_work_id
    ? db.prepare("SELECT id, title FROM works WHERE id=?").get(w.copied_from_work_id)
    : null;
  return {
    ...w,
    templateLocked: isTemplateLockedForProject(w.project_id),
    copiedFrom: copiedFrom ? { id: copiedFrom.id, title: copiedFrom.title } : null,
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
  const tpl = p.template_id ? db.prepare("SELECT locked FROM templates WHERE id=?").get(p.template_id) : null;
  return { ...p, templateLocked: !!(tpl && tpl.locked), stats, works: works.map(hydrateWork) };
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
  const allowedTpl = restricted ? visibleTemplateIdSet(req.user) : null;
  const allowedProj = restricted ? visibleProjectIdSet(req.user) : null;
  const out = rows
    .filter((t) => !restricted || allowedTpl.has(t.id))
    .map((t) => {
      // full count (not just the filtered set) whenever the whole template is
      // "for free" visible — it's locked, it's their own, or it was explicitly granted
      const autoFull = !restricted || !!t.locked || t.created_by === req.user.id;
      const grantedFull = !autoFull && db.prepare(
        "SELECT COUNT(*) c FROM user_permissions WHERE user_id=? AND template_id=? AND project_id IS NULL"
      ).get(req.user.id, t.id).c > 0;
      const fullAccess = autoFull || grantedFull;
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
    "INSERT INTO templates (label, from_date, to_date, sort_order, theme, font, created_at, created_by) VALUES (?,?,?,?,?,?,?,?)"
  ).run(b.label || "تمپلیت جدید", b.from_date || null, b.to_date || null, b.sort_order ?? 0,
    b.theme || "orbit", b.font || "Vazirmatn", new Date().toISOString(), req.user.id);
  res.json(db.prepare("SELECT * FROM templates WHERE id=?").get(r.lastInsertRowid));
});
app.put("/api/templates/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM templates WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  if (cur.locked && !isOwnerReq(req)) {
    return res.status(403).json({ error: "این تمپلیت قفل شده — فقط مالک آرشیو می‌تواند ویرایشش کند." });
  }
  const b = { ...cur, ...req.body };
  db.prepare("UPDATE templates SET label=?, from_date=?, to_date=?, sort_order=?, theme=?, font=? WHERE id=?")
    .run(b.label, b.from_date, b.to_date, b.sort_order, b.theme || "orbit", b.font || "Vazirmatn", req.params.id);
  res.json(db.prepare("SELECT * FROM templates WHERE id=?").get(req.params.id));
});
// lock/unlock — a switch only the archive owner can flip. everyone else keeps
// full read access and can still duplicate works out of a locked template; they
// just can't add/edit/delete anything inside it (enforced at each route above).
app.put("/api/templates/:id/lock", requireOwner, (req, res) => {
  const cur = db.prepare("SELECT * FROM templates WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  const locked = !!req.body.locked;
  db.prepare("UPDATE templates SET locked=? WHERE id=?").run(locked ? 1 : 0, req.params.id);
  res.json({ id: Number(req.params.id), locked });
});
app.delete("/api/templates/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM templates WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  if (cur.locked && !isOwnerReq(req)) {
    return res.status(403).json({ error: "این تمپلیت قفل شده — فقط مالک آرشیو می‌تواند حذفش کند." });
  }
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
    const allowed = visibleProjectIdSet(req.user);
    rows = rows.filter((p) => allowed.has(p.id));
  }
  const out = rows.map((p) => ({
    ...p,
    worksCount: db.prepare("SELECT COUNT(*) c FROM works WHERE project_id=?").get(p.id).c,
    templateLocked: isTemplateLockedForProject(p.id),
  }));
  res.json(out);
});

app.get("/api/projects/all", (req, res) => {
  let rows = db.prepare("SELECT id,title,sub,start_date,end_date,template_id FROM projects ORDER BY start_date").all();
  if (isRestricted(req.user)) {
    const allowed = visibleProjectIdSet(req.user);
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
  if (b.template_id) {
    const tpl = db.prepare("SELECT locked, created_by FROM templates WHERE id=?").get(b.template_id);
    if (tpl) {
      if (tpl.locked && !isOwnerReq(req)) {
        return res.status(403).json({ error: "این تمپلیت قفل شده — فقط مالک آرشیو می‌تواند فعالیت جدید در آن بسازد." });
      }
      if (!tpl.locked && !isOwnerReq(req) && tpl.created_by && tpl.created_by !== req.user.id) {
        return res.status(403).json({ error: "این تمپلیت متعلق به کاربر دیگری است." });
      }
    }
  }
  const r = db.prepare(
    `INSERT INTO projects (title,sub,start_date,end_date,teaser_url,node_x,node_y,node_size,node_font,node_bold,orbit,template_id,created_at,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    b.title || "فعالیت جدید", b.sub || "", b.start_date || null, b.end_date || null, b.teaser_url || null,
    b.node_x ?? 50, b.node_y ?? 35, b.node_size ?? 56, b.node_font ?? 12, b.node_bold ?? 0,
    b.orbit ?? 1, b.template_id ?? null, new Date().toISOString(), req.user.id
  );
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id=?").get(r.lastInsertRowid)));
});

app.put("/api/projects/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, cur.id)) return res.status(403).json({ error: "دسترسی به این فعالیت را نداری" });
  if (!requireProjectUnlocked(req, res, cur.id)) return;
  const b = { ...cur, ...req.body };
  db.prepare(
    `UPDATE projects SET title=?,sub=?,start_date=?,end_date=?,teaser_url=?,node_x=?,node_y=?,node_size=?,node_font=?,node_bold=?,orbit=?,template_id=? WHERE id=?`
  ).run(b.title, b.sub, b.start_date, b.end_date ?? null, b.teaser_url, b.node_x, b.node_y, b.node_size, b.node_font, b.node_bold, b.orbit, b.template_id ?? null, req.params.id);
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id)));
});

app.delete("/api/projects/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, cur.id)) return res.status(403).json({ error: "دسترسی به این فعالیت را نداری" });
  if (!requireProjectUnlocked(req, res, cur.id)) return;
  db.prepare("DELETE FROM projects WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* full deep-copy of a project (stats + works + their keywords/media/platform-views)
   into another template, so an activity doesn't have to be redefined by hand. */
app.post("/api/projects/:id/duplicate", requireAdmin, (req, res) => {
  const src = db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id);
  if (!src) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, src.id)) return res.status(403).json({ error: "دسترسی به این فعالیت را نداری" });
  const targetTemplateId = req.body.template_id ?? null;
  if (targetTemplateId) {
    const tpl = db.prepare("SELECT locked, created_by FROM templates WHERE id=?").get(targetTemplateId);
    if (tpl) {
      if (tpl.locked && !isOwnerReq(req)) {
        return res.status(403).json({ error: "این تمپلیت قفل شده — فقط مالک آرشیو می‌تواند فعالیت جدید در آن بسازد." });
      }
      if (!tpl.locked && !isOwnerReq(req) && tpl.created_by && tpl.created_by !== req.user.id) {
        return res.status(403).json({ error: "این تمپلیت متعلق به کاربر دیگری است." });
      }
    }
  }

  const newId = db.transaction(() => {
    const now = new Date().toISOString();
    const pr = db.prepare(
      `INSERT INTO projects (title,sub,start_date,end_date,teaser_url,node_x,node_y,node_size,node_font,node_bold,orbit,template_id,created_at,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      src.title + " (کپی)", src.sub, src.start_date, src.end_date, src.teaser_url,
      src.node_x, src.node_y, src.node_size, src.node_font, src.node_bold, src.orbit,
      targetTemplateId, now, req.user.id
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
// requireEditor: admin OR the restricted "content editor" role — but still scoped
// to whatever templates/activities that person was actually granted.
app.put("/api/projects/:id/stats", requireEditor, (req, res) => {
  if (!canSeeProject(req, req.params.id)) return res.status(403).json({ error: "دسترسی نداری" });
  if (!requireProjectUnlocked(req, res, req.params.id)) return;
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
  // a work's "type" may hold several comma-separated keys (multi-type works), so
  // matching one type means "contains this key", not "equals exactly"
  if (type && type !== "all") { where.push("(',' || w.type || ',') LIKE ?"); args.push(`%,${type},%`); }
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
    const allowed = visibleProjectIdSet(req.user);
    rows = rows.filter((w) => allowed.has(w.project_id));
  }
  if (sort === "views") rows = rows.sort((a, b) => b.totalViews - a.totalViews);
  res.json(rows);
});

/* featured works belonging to a template (across all its projects) */
app.get("/api/templates/:id/featured-works", (req, res) => {
  if (isRestricted(req.user) && !visibleTemplateIdSet(req.user).has(Number(req.params.id))) {
    return res.status(403).json({ error: "دسترسی نداری" });
  }
  const rows = db.prepare(
    `SELECT w.* FROM works w JOIN projects p ON p.id=w.project_id
     WHERE p.template_id=? AND w.featured=1 ORDER BY datetime(w.created_at) DESC`
  ).all(req.params.id);
  let out = rows.map(hydrateWork);
  if (isRestricted(req.user)) {
    const allowed = visibleProjectIdSet(req.user);
    out = out.filter((w) => allowed.has(w.project_id));
  }
  res.json(out);
});

/* full stats report for a template: per-activity and aggregate totals for
   views/likes/comments and work-type counts, used by the report/dashboard page */
app.get("/api/templates/:id/report", (req, res) => {
  const templateId = Number(req.params.id);
  const template = db.prepare("SELECT id,label FROM templates WHERE id=?").get(templateId);
  if (!template) return res.status(404).json({ error: "not found" });
  if (isRestricted(req.user) && !visibleTemplateIdSet(req.user).has(templateId)) {
    return res.status(403).json({ error: "دسترسی نداری" });
  }

  let projects = db.prepare("SELECT id,title FROM projects WHERE template_id=? ORDER BY start_date").all(templateId);
  if (isRestricted(req.user)) {
    const allowed = visibleProjectIdSet(req.user);
    projects = projects.filter((p) => allowed.has(p.id));
  }

  const allTypes = db.prepare("SELECT key,label FROM work_types ORDER BY id").all();

  const activities = projects.map((p) => {
    const works = db.prepare("SELECT id,type FROM works WHERE project_id=?").all(p.id);
    let views = 0, likes = 0, comments = 0;
    const typeCounts = {};
    allTypes.forEach((t) => (typeCounts[t.key] = 0));
    works.forEach((w) => {
      views += totalViews(w.id);
      likes += totalLikes(w.id);
      comments += totalComments(w.id);
      String(w.type || "").split(",").filter(Boolean).forEach((k) => {
        typeCounts[k] = (typeCounts[k] || 0) + 1;
      });
    });
    return { id: p.id, title: p.title, workCount: works.length, views, likes, comments, typeCounts };
  });

  const totals = activities.reduce((acc, a) => {
    acc.views += a.views; acc.likes += a.likes; acc.comments += a.comments; acc.workCount += a.workCount;
    Object.entries(a.typeCounts).forEach(([k, v]) => { acc.typeCounts[k] = (acc.typeCounts[k] || 0) + v; });
    return acc;
  }, { views: 0, likes: 0, comments: 0, workCount: 0, typeCounts: {} });

  res.json({ template, types: allTypes, activities, totals });
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
// when engagement is entered on a work that was copied out of another (e.g. a
// non-owner admin's copy of a locked archive's work), mirror the same numbers
// onto the original — so the archive itself stays up to date with real reach,
// without needing the archive owner to enter it a second time.
// note: this is a full mirror, not an aggregate — if the same source has been
// copied into more than one place, whichever copy was saved last "wins" on the
// source. Fine for the common case of one destination per source.
function propagateEngagementToSource(workId, platformViews, tv) {
  const w = db.prepare("SELECT copied_from_work_id FROM works WHERE id=?").get(workId);
  if (!w || !w.copied_from_work_id) return;
  const src = db.prepare("SELECT id FROM works WHERE id=?").get(w.copied_from_work_id);
  if (!src) return; // original was since deleted — nothing to sync to
  if (platformViews !== undefined) savePlatformViews(src.id, platformViews);
  if (tv !== undefined) saveTvBroadcasts(src.id, tv);
}
/* the card thumbnail in the works list is driven by works.url — this must always
   point at an actual image/video/audio file, never at a link, regardless of what
   order the admin arranged the gallery in. a link has nothing to render as a thumb. */
function guessMediaKind(url, kind) {
  if (kind === "link") return "link";
  const ext = String(url || "").toLowerCase().split(/[?#]/)[0].split(".").pop();
  if (["mp4", "webm", "mov", "mkv", "avi", "m4v", "ogv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return "image";
  return kind || "image";
}
function firstDisplayableMediaUrl(media) {
  if (!Array.isArray(media)) return null;
  const item = media.find((m) => m && m.url && guessMediaKind(m.url, m.kind) !== "link");
  return item ? item.url : null;
}
function saveMedia(workId, media) {
  db.prepare("DELETE FROM work_media WHERE work_id=?").run(workId);
  const ins = db.prepare("INSERT INTO work_media (work_id,url,kind,sort_order) VALUES (?,?,?,?)");
  (media || []).filter((m) => m && m.url).forEach((m, i) =>
    ins.run(workId, m.url, m.kind || "image", i));
}

app.post("/api/works", requireAdmin, (req, res) => {
  const b = req.body;
  if (!canSeeProject(req, b.project_id)) return res.status(403).json({ error: "دسترسی به این فعالیت را نداری" });
  if (!requireProjectUnlocked(req, res, b.project_id)) return;
  const tx = db.transaction(() => {
    // primary url = explicit url, else first *displayable* media item (never a link)
    const primaryUrl = b.url || firstDisplayableMediaUrl(b.media);
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
  if (!canSeeProject(req, cur.project_id)) return res.status(403).json({ error: "دسترسی به این اثر را نداری" });
  if (!requireProjectUnlocked(req, res, cur.project_id)) return;
  const b = { ...cur, ...req.body };
  const tx = db.transaction(() => {
    // keep url in sync with the first displayable (non-link) media item when media provided
    let url = b.url;
    if ("media" in req.body) {
      url = firstDisplayableMediaUrl(b.media) || b.url || null;
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
  propagateEngagementToSource(
    req.params.id,
    ("platformViews" in req.body) ? b.platformViews : undefined,
    ("tv" in req.body) ? b.tv : undefined
  );
  res.json(hydrateWork(db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id)));
});

app.delete("/api/works/:id", requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, cur.project_id)) return res.status(403).json({ error: "دسترسی به این اثر را نداری" });
  if (!requireProjectUnlocked(req, res, cur.project_id)) return;
  db.prepare("DELETE FROM works WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* narrow endpoint for the "editor" role: touches ONLY platform-view numbers and the
   TV broadcast schedule — never title/description/media/keywords/type, and never
   deletes anything. This is the entire surface that role is allowed to write to. */
app.put("/api/works/:id/engagement", requireEditor, (req, res) => {
  const cur = db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, cur.project_id)) return res.status(403).json({ error: "دسترسی نداری" });
  if (!requireProjectUnlocked(req, res, cur.project_id)) return;
  const b = req.body || {};
  const tx = db.transaction(() => {
    if ("platformViews" in b) savePlatformViews(req.params.id, b.platformViews);
    if ("tv" in b) saveTvBroadcasts(req.params.id, b.tv);
  });
  tx();
  propagateEngagementToSource(req.params.id, b.platformViews, b.tv);
  res.json(hydrateWork(db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id)));
});

/* share link for a single work's public (no-login) page — any logged-in user who can
   see the work may create/reuse its link; the token itself is what gates public access */
app.post("/api/works/:id/share", (req, res) => {
  const w = db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id);
  if (!w) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, w.project_id)) return res.status(403).json({ error: "دسترسی نداری" });
  let token = w.share_token;
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    db.prepare("UPDATE works SET share_token=? WHERE id=?").run(token, w.id);
  }
  res.json({ token });
});
app.delete("/api/works/:id/share", (req, res) => {
  const w = db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id);
  if (!w) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, w.project_id)) return res.status(403).json({ error: "دسترسی نداری" });
  db.prepare("UPDATE works SET share_token=NULL WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* copy (or move) a single work into another activity, which may belong to a
   different template — or no template at all. */
app.post("/api/works/:id/duplicate", requireAdmin, (req, res) => {
  const src = db.prepare("SELECT * FROM works WHERE id=?").get(req.params.id);
  if (!src) return res.status(404).json({ error: "not found" });
  if (!canSeeProject(req, src.project_id)) return res.status(403).json({ error: "دسترسی به این اثر را نداری" });
  const targetProjectId = req.body.project_id;
  const move = !!req.body.move;
  const targetProject = db.prepare("SELECT id FROM projects WHERE id=?").get(targetProjectId);
  if (!targetProject) return res.status(400).json({ error: "فعالیت مقصد پیدا نشد" });
  if (!canSeeProject(req, targetProjectId)) return res.status(403).json({ error: "به فعالیت مقصد دسترسی نداری" });
  if (!requireProjectUnlocked(req, res, targetProjectId)) return; // can't add INTO a template locked by someone else

  // copying OUT of a locked template is always allowed (that's the whole point of
  // being able to reuse archived material) — but "move" deletes the source, which
  // is exactly what a lock exists to prevent. force a plain copy in that case.
  if (move && !requireProjectUnlocked(req, res, src.project_id)) return;

  // block re-copying the same work into an activity it's already in (by title) —
  // unless it was since removed from there. Doesn't apply when moving OUT of that
  // same activity (there's nothing to collide with) or moving the work onto itself.
  if (String(targetProjectId) !== String(src.project_id) || !move) {
    const dupe = db.prepare(
      "SELECT id FROM works WHERE project_id=? AND title=? AND id<>?"
    ).get(targetProjectId, src.title, src.id);
    if (dupe) {
      return res.status(409).json({ error: `اثر «${src.title}» قبلاً در این فعالیت وجود دارد (تکراری). اگر می‌خوای دوباره اضافه‌ش کنی، اول نسخهٔ قبلی را از آن فعالیت حذف کن.` });
    }
  }

  const newId = db.transaction(() => {
    const now = new Date().toISOString();
    const r = db.prepare(
      `INSERT INTO works (project_id,type,title,descr,axis,campaign,event_date,url,featured,created_at,copied_from_work_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(targetProjectId, src.type, src.title, src.descr, src.axis, src.campaign, src.event_date, src.url, src.featured, now,
      move ? null : src.id); // only a real copy links back — a moved work has no separate "original" to sync to
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
    if (move) db.prepare("DELETE FROM works WHERE id=?").run(src.id);
    return wid;
  })();

  res.json({ ...hydrateWork(db.prepare("SELECT * FROM works WHERE id=?").get(newId)), moved: move });
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
    const allowed = visibleProjectIdSet(req.user);
    out = out.filter((w) => allowed.has(w.project_id));
  }
  res.json(out);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Madar API on http://localhost:${PORT}`));
