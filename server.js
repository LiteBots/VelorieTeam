import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import webpush from "web-push";
import cron from "node-cron";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- ENV ----------
const {
  MONGO_URI,
  ADMIN_LOGIN,
  ADMIN_PASSWORD,
  JWT_SECRET,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
} = process.env;

if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");
if (!ADMIN_LOGIN || !ADMIN_PASSWORD) throw new Error("Missing ADMIN_LOGIN / ADMIN_PASSWORD");
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY");

webpush.setVapidDetails("mailto:admin@velorie.pl", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ---------- DB ----------
await mongoose.connect(MONGODB_URI);

// ---------- Schemas ----------
const UserSchema = new mongoose.Schema({
  login: { type: String, unique: true, index: true },
  passHash: String,
  role: { type: String, enum: ["admin", "employee"], default: "employee" },
  assignedProjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
  balancePLN: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const ProjectSchema = new mongoose.Schema({
  name: String,
  description: String,
  imageUrl: String,
  incomePLN: { type: Number, default: 0 },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  from: String,
  dueDate: Date,
  amountPLN: Number,
  todo: String,
  status: { type: String, enum: ["open", "done", "cancelled"], default: "open" },
  doneAt: Date,
  notified7d: { type: Boolean, default: false },
  notified3d: { type: Boolean, default: false },
  notified24h: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const TaskSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true },
  assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  title: String,
  description: String,
  dueDate: Date,
  status: { type: String, enum: ["open", "done"], default: "open" },
  doneAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const IdeaSchema = new mongoose.Schema({
  title: String,
  description: String,
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
  type: String,
  title: String,
  body: String,
  data: Object,
  createdAt: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const PushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  endpoint: String,
  keys: { p256dh: String, auth: String },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Project = mongoose.model("Project", ProjectSchema);
const Order = mongoose.model("Order", OrderSchema);
const Task = mongoose.model("Task", TaskSchema);
const Idea = mongoose.model("Idea", IdeaSchema);
const Notification = mongoose.model("Notification", NotificationSchema);
const PushSub = mongoose.model("PushSubscription", PushSubscriptionSchema);

// ---------- ensure admin user exists ----------
async function ensureAdmin() {
  const existing = await User.findOne({ login: ADMIN_LOGIN });
  if (existing) return;
  const passHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await User.create({ login: ADMIN_LOGIN, passHash, role: "admin" });
}
await ensureAdmin();

async function getAdminUser() {
  return User.findOne({ role: "admin" });
}

// ---------- uploads (ROOT/uploads) ----------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = (Date.now() + "-" + file.originalname).replace(/[^\w.\-]+/g, "_");
    cb(null, safe);
  }
});
const upload = multer({ storage });

// ---------- auth helpers ----------
function signToken(user) {
  return jwt.sign(
    { uid: user._id.toString(), role: user.role, login: user.login },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

// ---------- push helpers ----------
async function sendPushToUser(userId, payload) {
  const subs = await PushSub.find({ userId });
  const data = JSON.stringify(payload);

  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data);
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await PushSub.deleteOne({ _id: s._id });
      }
    }
  }
}

async function notify(userId, { title, body, type, projectId = null, data = {} }) {
  await Notification.create({ toUserId: userId, title, body, type, projectId, data });
  await sendPushToUser(userId, {
    title,
    body,
    icon: "/favicon.png",
    badge: "/favicon.png",
    data: { url: "/#notifications", ...data }
  });
}

// ---------- STATIC (ROOT) ----------
app.use("/uploads", express.static(uploadDir));
app.use(express.static(__dirname)); // serwuje index.html, app.js, sw.js, manifest.json, favicon.png

// ---------- API ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/auth/login", async (req, res) => {
  const { login, password } = req.body || {};
  const user = await User.findOne({ login });
  if (!user) return res.status(401).json({ error: "Bad credentials" });

  const ok = await bcrypt.compare(password || "", user.passHash);
  if (!ok) return res.status(401).json({ error: "Bad credentials" });

  res.json({
    token: signToken(user),
    user: { id: user._id, login: user.login, role: user.role, balancePLN: user.balancePLN }
  });
});

app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.uid).populate("assignedProjects");
  if (!user) return res.status(404).json({ error: "Not found" });

  res.json({
    id: user._id,
    login: user.login,
    role: user.role,
    balancePLN: user.balancePLN,
    assignedProjects: (user.assignedProjects || []).map(p => ({
      id: p._id, name: p.name, imageUrl: p.imageUrl, incomePLN: p.incomePLN
    }))
  });
});

// ---- PUSH ----
app.get("/api/push/vapidPublicKey", (req, res) => res.json({ key: VAPID_PUBLIC_KEY }));

app.post("/api/push/subscribe", auth, async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: "Bad subscription" });

  await PushSub.updateOne(
    { userId: req.user.uid, endpoint: sub.endpoint },
    { $set: { keys: sub.keys } },
    { upsert: true }
  );
  res.json({ ok: true });
});

// ---- NOTIFICATIONS (admin: podgląd) ----
app.get("/api/notifications", auth, async (req, res) => {
  const list = await Notification.find({ toUserId: req.user.uid }).sort({ createdAt: -1 }).limit(50);
  res.json(list.map(n => ({
    id: n._id, type: n.type, title: n.title, body: n.body, projectId: n.projectId,
    createdAt: n.createdAt, read: n.read, data: n.data || {}
  })));
});

app.post("/api/notifications/:id/read", auth, async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, toUserId: req.user.uid }, { $set: { read: true } });
  res.json({ ok: true });
});

// ---- ADMIN DASHBOARD STATS ----
app.get("/api/admin/stats", auth, adminOnly, async (req, res) => {
  const teamCount = await User.countDocuments({ role: "employee" });
  const admin = await getAdminUser();
  res.json({ teamCount, adminBalancePLN: admin?.balancePLN || 0 });
});

// ---- EMPLOYEES (admin only) ----
app.get("/api/admin/employees", auth, adminOnly, async (req, res) => {
  const users = await User.find({ role: "employee" }).populate("assignedProjects");
  res.json(users.map(u => ({
    id: u._id,
    login: u.login,
    balancePLN: u.balancePLN,
    assignedProjects: (u.assignedProjects || []).map(p => ({ id: p._id, name: p.name }))
  })));
});

app.post("/api/admin/employees", auth, adminOnly, async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: "login/password required" });

  const exists = await User.findOne({ login });
  if (exists) return res.status(409).json({ error: "Login exists" });

  const passHash = await bcrypt.hash(password, 10);
  const u = await User.create({ login, passHash, role: "employee" });

  await notify(u._id, {
    type: "employee_created",
    title: "VelorieTeam",
    body: "Twoje konto zostało utworzone. Zaloguj się w aplikacji."
  });

  res.json({ id: u._id, login: u.login });
});

// assign employee to project
app.post("/api/admin/projects/:projectId/assign", auth, adminOnly, async (req, res) => {
  const { projectId } = req.params;
  const { userId } = req.body || {};
  const p = await Project.findById(projectId);
  const u = await User.findById(userId);
  if (!p || !u) return res.status(404).json({ error: "Not found" });

  await Project.updateOne({ _id: p._id }, { $addToSet: { members: u._id } });
  await User.updateOne({ _id: u._id }, { $addToSet: { assignedProjects: p._id } });

  await notify(u._id, {
    type: "assigned_project",
    projectId: p._id,
    title: "Przypisano do projektu",
    body: `Masz dostęp do projektu: ${p.name}`,
    data: { projectId: p._id.toString() }
  });

  res.json({ ok: true });
});

// transfer PLN from admin to employee
app.post("/api/admin/transfer", auth, adminOnly, async (req, res) => {
  const { userId, amountPLN } = req.body || {};
  const amt = Number(amountPLN);
  if (!userId || !Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "Bad input" });

  const admin = await getAdminUser();
  const u = await User.findById(userId);
  if (!admin || !u) return res.status(404).json({ error: "Not found" });

  if ((admin.balancePLN || 0) < amt) return res.status(400).json({ error: "Admin has insufficient funds" });

  admin.balancePLN -= amt;
  u.balancePLN += amt;
  await admin.save();
  await u.save();

  await notify(u._id, {
    type: "money_received",
    title: "Portfel",
    body: `Otrzymałeś przelew: ${amt.toFixed(2)} PLN`,
    data: { amountPLN: amt }
  });

  res.json({ ok: true, adminBalancePLN: admin.balancePLN });
});

// ---- PROJECTS ----
app.post("/api/admin/projects", auth, adminOnly, upload.single("image"), async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
  const p = await Project.create({ name, description: description || "", imageUrl });

  res.json({ id: p._id, name: p.name, imageUrl: p.imageUrl });
});

app.get("/api/projects", auth, async (req, res) => {
  const user = await User.findById(req.user.uid);
  if (!user) return res.status(404).json({ error: "Not found" });

  if (req.user.role === "admin") {
    const projects = await Project.find().populate("members");
    return res.json(projects.map(p => ({
      id: p._id, name: p.name, description: p.description, imageUrl: p.imageUrl, incomePLN: p.incomePLN,
      members: (p.members || []).map(m => ({ id: m._id, login: m.login }))
    })));
  }

  const projects = await Project.find({ _id: { $in: user.assignedProjects || [] } });
  res.json(projects.map(p => ({
    id: p._id, name: p.name, description: p.description, imageUrl: p.imageUrl, incomePLN: p.incomePLN
  })));
});

// per project income (admin)
app.post("/api/admin/projects/:projectId/income", auth, adminOnly, async (req, res) => {
  const { projectId } = req.params;
  const p = await Project.findById(projectId);
  if (!p) return res.status(404).json({ error: "Not found" });

  p.incomePLN = Number(req.body?.incomePLN) || 0;
  await p.save();
  res.json({ ok: true, incomePLN: p.incomePLN });
});

// ---- TASKS (Do zrobienia) ----
app.post("/api/admin/projects/:projectId/tasks", auth, adminOnly, async (req, res) => {
  const { projectId } = req.params;
  const { assigneeId, title, description, dueDate } = req.body || {};
  if (!assigneeId || !title || !dueDate) return res.status(400).json({ error: "assigneeId/title/dueDate required" });

  const p = await Project.findById(projectId);
  const u = await User.findById(assigneeId);
  if (!p || !u) return res.status(404).json({ error: "Not found" });

  const t = await Task.create({
    projectId: p._id,
    assigneeId: u._id,
    title,
    description: description || "",
    dueDate: new Date(dueDate)
  });

  await notify(u._id, {
    type: "task_assigned",
    projectId: p._id,
    title: "Nowe zadanie",
    body: `${title} (termin: ${new Date(dueDate).toLocaleDateString("pl-PL")})`,
    data: { taskId: t._id.toString(), projectId: p._id.toString() }
  });

  res.json({ id: t._id });
});

app.get("/api/projects/:projectId/tasks", auth, async (req, res) => {
  const { projectId } = req.params;
  const user = await User.findById(req.user.uid);
  if (!user) return res.status(404).json({ error: "Not found" });

  const allowed =
    req.user.role === "admin" ||
    (user.assignedProjects || []).some(pid => pid.toString() === projectId);

  if (!allowed) return res.status(403).json({ error: "Forbidden" });

  if (req.user.role === "admin") {
    const tasks = await Task.find({ projectId }).populate("assigneeId");
    return res.json(tasks.map(t => ({
      id: t._id,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      status: t.status,
      assignee: t.assigneeId ? { id: t.assigneeId._id, login: t.assigneeId.login } : null
    })));
  }

  const tasks = await Task.find({ projectId, assigneeId: user._id });
  res.json(tasks.map(t => ({
    id: t._id, title: t.title, description: t.description, dueDate: t.dueDate, status: t.status
  })));
});

// employee completes task → admin gets push + panel notification
app.post("/api/tasks/:taskId/complete", auth, async (req, res) => {
  const t = await Task.findById(req.params.taskId);
  if (!t) return res.status(404).json({ error: "Not found" });

  const user = await User.findById(req.user.uid);
  if (!user) return res.status(404).json({ error: "Not found" });

  if (req.user.role !== "admin" && t.assigneeId.toString() !== user._id.toString()) {
    return res.status(403).json({ error: "Forbidden" });
  }

  t.status = "done";
  t.doneAt = new Date();
  await t.save();

  const admin = await getAdminUser();
  const p = await Project.findById(t.projectId);

  if (admin) {
    await notify(admin._id, {
      type: "task_done",
      projectId: t.projectId,
      title: "Zadanie zakończone",
      body: `${user.login} zakończył: ${t.title}${p ? ` (projekt: ${p.name})` : ""}`,
      data: { taskId: t._id.toString(), projectId: t.projectId.toString() }
    });
  }

  res.json({ ok: true });
});

// ---- ORDERS (Zlecenia) admin only ----
app.post("/api/admin/orders", auth, adminOnly, async (req, res) => {
  const { from, dueDate, amountPLN, todo } = req.body || {};
  if (!from || !dueDate || !amountPLN || !todo) return res.status(400).json({ error: "Missing fields" });

  const o = await Order.create({
    from,
    dueDate: new Date(dueDate),
    amountPLN: Number(amountPLN),
    todo
  });

  res.json({ id: o._id });
});

app.get("/api/admin/orders", auth, adminOnly, async (req, res) => {
  const list = await Order.find().sort({ createdAt: -1 }).limit(200);
  res.json(list.map(o => ({
    id: o._id,
    from: o.from,
    dueDate: o.dueDate,
    amountPLN: o.amountPLN,
    todo: o.todo,
    status: o.status
  })));
});

// admin completes order early -> adds amount to admin wallet + push
app.post("/api/admin/orders/:id/complete", auth, adminOnly, async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) return res.status(404).json({ error: "Not found" });
  if (o.status !== "open") return res.status(400).json({ error: "Order not open" });

  o.status = "done";
  o.doneAt = new Date();
  await o.save();

  const admin = await getAdminUser();
  admin.balancePLN = (admin.balancePLN || 0) + (Number(o.amountPLN) || 0);
  await admin.save();

  await notify(admin._id, {
    type: "order_done",
    title: "Zlecenia",
    body: `Zlecenie zakończone. +${Number(o.amountPLN || 0).toFixed(2)} PLN do portfela.`,
    data: { orderId: o._id.toString() }
  });

  res.json({ ok: true, adminBalancePLN: admin.balancePLN });
});

// ---- IDEAS (Pomysły) admin only ----
app.post("/api/admin/ideas", auth, adminOnly, upload.single("image"), async (req, res) => {
  const { title, description } = req.body || {};
  if (!title || !description) return res.status(400).json({ error: "title/description required" });

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
  const i = await Idea.create({ title, description, imageUrl });

  res.json({ id: i._id });
});

app.get("/api/admin/ideas", auth, adminOnly, async (req, res) => {
  const list = await Idea.find().sort({ createdAt: -1 }).limit(200);
  res.json(list.map(i => ({
    id: i._id, title: i.title, description: i.description, imageUrl: i.imageUrl, createdAt: i.createdAt
  })));
});

// ---- ADMIN: wallet add (manual) ----
app.post("/api/admin/wallet/add", auth, adminOnly, async (req, res) => {
  const amt = Number(req.body?.amountPLN);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "Bad amount" });

  const admin = await getAdminUser();
  admin.balancePLN = (admin.balancePLN || 0) + amt;
  await admin.save();

  await notify(admin._id, {
    type: "wallet_add",
    title: "Portfel",
    body: `Dodano ręcznie: +${amt.toFixed(2)} PLN`,
    data: { amountPLN: amt }
  });

  res.json({ ok: true, adminBalancePLN: admin.balancePLN });
});

// ---- SEND PUSH TO PROJECT (admin only) ----
app.post("/api/admin/push/send", auth, adminOnly, async (req, res) => {
  const { projectId, text } = req.body || {};
  if (!projectId || !text) return res.status(400).json({ error: "projectId/text required" });

  const p = await Project.findById(projectId).populate("members");
  if (!p) return res.status(404).json({ error: "Not found" });

  for (const m of (p.members || [])) {
    await notify(m._id, {
      type: "admin_message",
      projectId: p._id,
      title: `Powiadomienie – ${p.name}`,
      body: text,
      data: { projectId: p._id.toString() }
    });
  }

  res.json({ ok: true });
});

// ---------- CRON: order deadline notifications to admin (7d/3d/24h) ----------
cron.schedule("*/30 * * * *", async () => {
  try {
    const admin = await getAdminUser();
    if (!admin) return;

    const now = new Date();
    const openOrders = await Order.find({ status: "open" });

    for (const o of openOrders) {
      const due = new Date(o.dueDate);
      const diffMs = due.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffHours / 24;

      if (!o.notified7d && diffDays <= 7 && diffDays > 6) {
        o.notified7d = true;
        await o.save();
        await notify(admin._id, {
          type: "order_deadline",
          title: "Zlecenia",
          body: `Zlecenie zbliża się do terminu (7 dni): ${o.from} / ${o.amountPLN} PLN`,
          data: { orderId: o._id.toString() }
        });
      }

      if (!o.notified3d && diffDays <= 3 && diffDays > 2) {
        o.notified3d = true;
        await o.save();
        await notify(admin._id, {
          type: "order_deadline",
          title: "Zlecenia",
          body: `Zlecenie zbliża się do terminu (3 dni): ${o.from} / ${o.amountPLN} PLN`,
          data: { orderId: o._id.toString() }
        });
      }

      if (!o.notified24h && diffHours <= 24 && diffHours > 23) {
        o.notified24h = true;
        await o.save();
        await notify(admin._id, {
          type: "order_deadline",
          title: "Zlecenia",
          body: `Zlecenie zbliża się do terminu (24h): ${o.from} / ${o.amountPLN} PLN`,
          data: { orderId: o._id.toString() }
        });
      }
    }
  } catch (e) {
    console.error("CRON error:", e);
  }
});

// ---------- SPA fallback ----------
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("VelorieTeam running on port", PORT));
