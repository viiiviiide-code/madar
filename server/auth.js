const crypto = require("crypto");

// در محیط واقعی حتماً این مقدار را با متغیر محیطی JWT_SECRET جایگزین کنید.
const SECRET = process.env.JWT_SECRET || "madar-dev-secret-please-change-me";
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // ۷ روز

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}
function sign(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}
function verify(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(p).toString("utf8")); } catch { return null; }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

function getToken(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return null;
}

function requireAuth(req, res, next) {
  const payload = verify(getToken(req));
  if (!payload) return res.status(401).json({ error: "ورود لازم است" });
  req.user = payload; // { id, username, role, owner }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "فقط کاربر مدیریت اجازهٔ این عملیات را دارد" });
  }
  next();
}

// the "archive owner" flag — orthogonal to role. an admin who isn't the owner can
// still do everything a normal admin does, EXCEPT touch a template someone has
// locked (see isTemplateLocked in server.js). only used to gate the lock toggle
// itself; the per-action lock checks live next to the routes they protect.
function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== "admin" || !req.user.owner) {
    return res.status(403).json({ error: "فقط مالک آرشیو اجازهٔ این عملیات را دارد" });
  }
  next();
}

// admin OR the restricted "content editor" role: can only touch the two data-entry
// endpoints this guards (project stats, and a work's engagement numbers) — never
// media, titles, or structural actions like delete.
function requireEditor(req, res, next) {
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "editor")) {
    return res.status(403).json({ error: "اجازهٔ این عملیات را نداری" });
  }
  next();
}

module.exports = { sign, verify, requireAuth, requireAdmin, requireOwner, requireEditor };
