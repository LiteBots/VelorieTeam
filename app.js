// VelorieTeam SPA (root) — improved UX & safety (single-file app.js)
// Requires: index.html with ids used below + lucide + tailwind classes.
// Endpoints expected:
//  - POST /api/auth/login {login,password} -> {token}
//  - GET  /api/me -> {login, role, balancePLN, ...}
//  - GET  /api/admin/stats
//  - Push: GET /api/push/vapidPublicKey -> {key}, POST /api/push/subscribe (subscription json)
//  - other endpoints as in original code

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const state = {
  token: localStorage.getItem("vt_token") || "",
  me: null,
  role: null,
  active: "dashboard",
  projectId: null,
};

// ----------------- utils -----------------
function safeText(selOrEl, text) {
  const el = typeof selOrEl === "string" ? $(selOrEl) : selOrEl;
  if (el) el.textContent = text ?? "";
}

function safeHTML(selOrEl, html) {
  const el = typeof selOrEl === "string" ? $(selOrEl) : selOrEl;
  if (el) el.innerHTML = html ?? "";
}

function safeClass(sel, cls, add) {
  const el = $(sel);
  if (!el) return;
  el.classList.toggle(cls, !!add);
}

function fmtPLN(n) {
  const v = Number(n || 0);
  return `${v.toFixed(2)} PLN`;
}

function safeLucide() {
  try { window.lucide?.createIcons?.(); } catch {}
}

function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}

function isStandalonePWA() {
  // iOS uses navigator.standalone; others use display-mode
  // eslint-disable-next-line no-undef
  return (window.navigator && window.navigator.standalone) || window.matchMedia?.("(display-mode: standalone)")?.matches;
}

// ----------------- toasts -----------------
function toast(msg, type = "info", ms = 3200) {
  const wrap = $("#toasts");
  if (!wrap) return;

  const icon =
    type === "ok" || type === "success" ? "check-circle" :
    type === "err" || type === "error" ? "alert-triangle" :
    "info";

  const el = document.createElement("div");
  el.className =
    "glass rounded-2xl px-4 py-3 text-sm border border-white/10 flex items-start gap-3";

  el.innerHTML = `
    <i data-lucide="${icon}" class="w-5 h-5 mt-0.5 ${
      type === "ok" || type === "success" ? "text-emerald-300" :
      type === "err" || type === "error" ? "text-red-300" :
      "text-[var(--accent)]"
    }"></i>
    <div class="flex-1 text-white/90">${escapeHtml(String(msg))}</div>
    <button class="w-8 h-8 rounded-xl chip inline-flex items-center justify-center -mt-1" aria-label="Zamknij">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;

  wrap.appendChild(el);
  safeLucide();

  const kill = () => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 180);
  };

  el.querySelector("button")?.addEventListener("click", kill);
  setTimeout(kill, ms);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[s]));
}

// ----------------- API -----------------
async function api(path, { method = "GET", body, headers = {}, isForm = false } = {}) {
  const h = { ...headers };
  if (!isForm) h["Content-Type"] = "application/json";
  if (state.token) h["Authorization"] = "Bearer " + state.token;

  const res = await fetch(path, {
    method,
    headers: h,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}

// ----------------- particles -----------------
function createParticles() {
  const container = $("#particles-container");
  if (!container) return;

  const particleCount = 26;
  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement("span");
    const size = 22 + (i % 6) * 10;
    p.className = "absolute rounded-full opacity-20 blur-2xl particle";
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.background = i % 3 ? "var(--accent)" : "#4f46e5";
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${Math.random() * 100}%`;
    p.style.animationDuration = `${10 + (i % 6)}s`;
    p.style.animationDelay = `${i * 0.2}s`;
    container.appendChild(p);
  }
}

// ----------------- SW -----------------
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // silent
  }
}

// ----------------- Push -----------------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function explainPushLimitations() {
  // UX-first explanation for iOS
  if (isIOS() && !isStandalonePWA()) {
    toast("Na iPhonie push działa dopiero po dodaniu aplikacji do ekranu głównego (PWA).", "info", 5200);
    toast("Safari → Udostępnij → Dodaj do ekranu głównego, potem otwórz z ikonki i włącz Push.", "info", 7200);
    return true;
  }
  return false;
}

async function enablePush() {
  if (explainPushLimitations()) return;

  if (!("serviceWorker" in navigator)) return toast("Brak Service Worker w tej przeglądarce.", "err");
  if (!("PushManager" in window)) {
    // Better message than raw "Brak PushManager"
    if (isIOS()) {
      toast("Brak PushManager: na iOS push działa tylko w trybie PWA (z ekranu głównego).", "info", 6500);
    } else {
      toast("Ta przeglądarka nie obsługuje powiadomień push (PushManager).", "err", 5200);
    }
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return toast("Odmówiono powiadomień w przeglądarce.", "err");

  const reg = await navigator.serviceWorker.ready;

  const { key } = await api("/api/push/vapidPublicKey");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  await api("/api/push/subscribe", { method: "POST", body: sub });
  toast("Push włączony ✅", "ok");
}

// ----------------- UI: mobile menu -----------------
function openMobileMenu() {
  $("#mobileOverlay")?.classList.remove("hidden");
}
function closeMobileMenu() {
  $("#mobileOverlay")?.classList.add("hidden");
}

// ----------------- UI: nav -----------------
function navItemsForRole(role) {
  if (role === "admin") {
    return [
      { id: "dashboard", icon: "layout-dashboard", label: "Dashboard" },
      { id: "orders", icon: "clipboard-list", label: "Zlecenia" },
      { id: "projects", icon: "folder-kanban", label: "Projekty" },
      { id: "employees", icon: "users", label: "Pracownicy" },
      { id: "wallet", icon: "wallet", label: "Portfel" },
      { id: "ideas", icon: "lightbulb", label: "Pomysły" },
      { id: "notifications", icon: "bell", label: "Powiadomienia" },
      { id: "push", icon: "send", label: "Wyślij powiadomienie" },
    ];
  }
  // employee
  return [
    { id: "dashboard", icon: "layout-dashboard", label: "Dashboard" },
    { id: "projects", icon: "folder-kanban", label: "Projekty" },
    { id: "wallet", icon: "wallet", label: "Portfel" },
    { id: "projectTasks", icon: "check-square", label: "Do zrobienia" },
    { id: "notifications", icon: "bell", label: "Powiadomienia" },
  ];
}

function renderNav() {
  const nav = $("#nav");
  const navMobile = $("#navMobile");
  if (!nav || !navMobile) return;

  const items = navItemsForRole(state.role);

  const btn = (item) => {
    const active = state.active === item.id;
    const cls = active
      ? "flex items-center gap-4 px-5 py-4 rounded-xl bg-white/10 font-semibold text-white transition text-base"
      : "flex items-center gap-4 px-5 py-4 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition text-base";
    const iColor = active ? "text-[var(--accent)]" : "";
    return `
      <button data-nav="${item.id}" class="${cls} w-full text-left">
        <i data-lucide="${item.icon}" class="h-6 w-6 ${iColor}"></i>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `;
  };

  nav.innerHTML = items.map(btn).join("");
  navMobile.innerHTML = items.map(btn).join("");
  safeLucide();

  $$("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      state.active = el.getAttribute("data-nav");
      if (state.active !== "projectView") state.projectId = null;
      closeMobileMenu();
      route().catch((e) => toast(e.message, "err"));
      renderNav();
    });
  });
}

// ----------------- ROUTE helpers -----------------
function card(title, subtitle, inner) {
  return `
    <div class="glass rounded-2xl p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold">${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="text-white/60 mt-1">${escapeHtml(subtitle)}</p>` : ""}
        </div>
      </div>
      <div class="mt-5">${inner}</div>
    </div>
  `;
}

function outletSkeleton() {
  return `
    <div class="glass rounded-2xl p-6">
      <div class="h-5 w-40 rounded-lg bg-white/10 animate-pulse"></div>
      <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="rounded-2xl chip p-5">
          <div class="h-3 w-24 rounded bg-white/10 animate-pulse"></div>
          <div class="h-8 w-32 rounded bg-white/10 animate-pulse mt-3"></div>
        </div>
        <div class="rounded-2xl chip p-5">
          <div class="h-3 w-24 rounded bg-white/10 animate-pulse"></div>
          <div class="h-8 w-40 rounded bg-white/10 animate-pulse mt-3"></div>
        </div>
      </div>
    </div>
  `;
}

// ----------------- Views -----------------
async function viewDashboard() {
  // these may or may not exist in index.html, so we guard
  if (state.role === "admin") {
    const s = await api("/api/admin/stats");
    safeText("#statTeam", s.teamCount ?? "—");
    safeText("#statIncome", fmtPLN(s.adminBalancePLN || 0));
  } else {
    safeText("#statTeam", "—");
    safeText("#statIncome", fmtPLN(state.me?.balancePLN || 0));
  }

  return `
    ${state.role === "employee"
      ? card("Twoje projekty", "Widzisz tylko te, do których jesteś przypisany.", `<div id="projectsMini"></div>`)
      : ""
    }
  `;
}

async function viewNotifications() {
  const list = await api("/api/notifications");
  const rows = (list || []).map((n) => `
    <div class="rounded-2xl chip p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold">${escapeHtml(n.title)}</div>
          <div class="text-xs text-white/60 mt-1">${escapeHtml(n.body)}</div>
          <div class="text-[11px] text-white/40 mt-2">${new Date(n.createdAt).toLocaleString("pl-PL")}</div>
        </div>
        ${n.read
          ? `<span class="text-[11px] text-white/40">OK</span>`
          : `<button data-read="${escapeHtml(n.id)}" class="text-xs chip px-3 py-2 rounded-xl">Oznacz</button>`
        }
      </div>
    </div>
  `).join("");

  setTimeout(() => {
    $$("[data-read]").forEach((b) => {
      b.addEventListener("click", async () => {
        try {
          await api(`/api/notifications/${b.getAttribute("data-read")}/read`, { method: "POST" });
          toast("Oznaczono jako przeczytane", "ok");
          route().catch((e) => toast(e.message, "err"));
        } catch (e) { toast(e.message, "err"); }
      });
    });
  }, 0);

  return card("Powiadomienia", "Twoje ostatnie powiadomienia.", `<div class="space-y-3">${rows || `<div class="text-white/60 text-sm">Brak.</div>`}</div>`);
}

async function viewWallet() {
  const me = await api("/api/me");
  state.me = me;
  safeText("#topBalance", fmtPLN(me.balancePLN || 0));

  if (state.role === "admin") {
    return card("Portfel (Admin)", "Dodaj ręcznie lub przelewaj pracownikom.", `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="rounded-2xl chip p-4">
          <div class="text-xs text-white/60">Saldo</div>
          <div class="text-2xl font-bold mt-1">${fmtPLN(me.balancePLN || 0)}</div>
        </div>

        <div class="rounded-2xl chip p-4">
          <div class="text-sm font-semibold mb-3">Dodaj środki ręcznie</div>
          <div class="flex gap-2">
            <input id="walletAddAmt" type="number"
              class="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="np. 100" />
            <button id="btnWalletAdd" class="px-4 py-3 rounded-xl btn-accent font-semibold">Dodaj</button>
          </div>
        </div>
      </div>
    `);
  }

  return card("Portfel", "Twoje środki (tylko podgląd, admin dodaje).", `
    <div class="rounded-2xl chip p-5">
      <div class="text-xs text-white/60">Saldo</div>
      <div class="text-3xl font-bold mt-1">${fmtPLN(me.balancePLN || 0)}</div>
    </div>
  `);
}

async function viewEmployees() {
  const users = await api("/api/admin/employees");
  const projs = await api("/api/projects");

  const rows = (users || []).map((u) => `
    <div class="rounded-2xl chip p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-semibold">${escapeHtml(u.login)}</div>
          <div class="text-xs text-white/60">Saldo: ${fmtPLN(u.balancePLN || 0)}</div>
          <div class="text-xs text-white/60">Projekty: ${(u.assignedProjects||[]).map(p=>escapeHtml(p.name)).join(", ") || "—"}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div class="flex gap-2">
          <select data-assign-project="${escapeHtml(u.id)}"
            class="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-3 text-sm">
            ${(projs||[]).map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}
          </select>
          <button data-assign="${escapeHtml(u.id)}" class="px-4 py-3 rounded-xl chip text-sm font-semibold">Przypisz</button>
        </div>

        <div class="flex gap-2">
          <input data-transfer-amt="${escapeHtml(u.id)}" type="number"
            class="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-3 text-sm" placeholder="PLN" />
          <button data-transfer="${escapeHtml(u.id)}" class="px-4 py-3 rounded-xl btn-accent text-sm font-semibold">Przelej</button>
        </div>
      </div>
    </div>
  `).join("");

  const html = `
    ${card("Dodaj pracownika", "Utwórz login/hasło dla nowej osoby.", `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input id="empLogin" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="login" />
        <input id="empPass" type="password" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="hasło" />
        <button id="btnCreateEmp" class="rounded-xl btn-accent px-4 py-3 font-semibold">Utwórz</button>
      </div>
    `)}

    ${card("Lista pracowników", "Przypisuj do projektów i przelewaj środki.", `<div class="space-y-3">${rows || `<div class="text-white/60 text-sm">Brak pracowników.</div>`}</div>`)}
  `;

  setTimeout(() => {
    $("#btnCreateEmp")?.addEventListener("click", async () => {
      try {
        const login = $("#empLogin")?.value?.trim() || "";
        const password = $("#empPass")?.value || "";
        await api("/api/admin/employees", { method: "POST", body: { login, password } });
        toast("Utworzono pracownika ✅", "ok");
        route().catch((e) => toast(e.message, "err"));
      } catch (e) { toast(e.message, "err"); }
    });

    $$("[data-assign]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const userId = btn.getAttribute("data-assign");
          const sel = document.querySelector(`[data-assign-project="${CSS.escape(userId)}"]`);
          const projectId = sel?.value;
          await api(`/api/admin/projects/${projectId}/assign`, { method: "POST", body: { userId } });
          toast("Przypisano do projektu ✅", "ok");
          route().catch((e) => toast(e.message, "err"));
        } catch (e) { toast(e.message, "err"); }
      });
    });

    $$("[data-transfer]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const userId = btn.getAttribute("data-transfer");
          const amtEl = document.querySelector(`[data-transfer-amt="${CSS.escape(userId)}"]`);
          const amt = Number(amtEl?.value || 0);
          await api("/api/admin/transfer", { method: "POST", body: { userId, amountPLN: amt } });
          toast("Wysłano przelew ✅", "ok");
          route().catch((e) => toast(e.message, "err"));
        } catch (e) { toast(e.message, "err"); }
      });
    });
  }, 0);

  return html;
}

async function viewProjects() {
  const projects = await api("/api/projects");

  const cards = (projects || []).map((p) => `
    <button data-open-project="${escapeHtml(p.id)}" class="text-left rounded-2xl chip p-4 hover:border-white/20 transition">
      <div class="flex items-start gap-3">
        <img src="${escapeHtml(p.imageUrl || "/favicon.png")}" class="w-14 h-14 rounded-2xl ring-1 ring-white/10 object-cover" />
        <div class="flex-1">
          <div class="font-semibold">${escapeHtml(p.name)}</div>
          <div class="text-xs text-white/60 mt-1 line-clamp-2">${escapeHtml(p.description || "—")}</div>
          <div class="text-xs text-white/50 mt-2">Dochód projektu: ${fmtPLN(p.incomePLN || 0)}</div>
        </div>
        <i data-lucide="chevron-right" class="w-5 h-5 text-white/50"></i>
      </div>
    </button>
  `).join("");

  const createForm = state.role === "admin"
    ? card("Dodaj projekt", "Nazwa + zdjęcie + opis.", `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input id="prName" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="Nazwa projektu" />
          <input id="prImage" type="file" accept="image/*" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white/80 rounded-xl" />
          <button id="btnCreateProject" class="rounded-xl btn-accent px-4 py-3 font-semibold">Utwórz</button>
        </div>
        <textarea id="prDesc" class="mt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="Opis..." rows="3"></textarea>
      `)
    : "";

  const html = `
    ${createForm}
    ${card("Projekty", state.role === "admin" ? "Kliknij projekt, aby wejść w jego dashboard." : "Widzisz tylko przypisane projekty.", `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${cards || `<div class="text-white/60 text-sm">Brak projektów.</div>`}</div>
    `)}
  `;

  setTimeout(() => {
    $("#btnCreateProject")?.addEventListener("click", async () => {
      try {
        const fd = new FormData();
        fd.append("name", $("#prName")?.value?.trim() || "");
        fd.append("description", $("#prDesc")?.value?.trim() || "");
        const f = $("#prImage")?.files?.[0];
        if (f) fd.append("image", f);

        await api("/api/admin/projects", { method: "POST", body: fd, isForm: true, headers: {} });
        toast("Utworzono projekt ✅", "ok");
        route().catch((e) => toast(e.message, "err"));
      } catch (e) { toast(e.message, "err"); }
    });

    $$("[data-open-project]").forEach((b) => {
      b.addEventListener("click", () => {
        state.projectId = b.getAttribute("data-open-project");
        state.active = "projectView";
        route().catch((e) => toast(e.message, "err"));
        renderNav();
      });
    });
  }, 0);

  return html;
}

async function viewProjectDashboard() {
  const projects = await api("/api/projects");
  const p = (projects || []).find((x) => x.id === state.projectId);

  if (!p) {
    state.active = "projects";
    return await viewProjects();
  }

  const hash = window.location.hash || "";
  const tab = hash.includes("tab=")
    ? new URLSearchParams(hash.split("?")[1] || "").get("tab")
    : "tasks";

  const tabs = [
    { id: "tasks", label: "Do zrobienia", icon: "check-square" },
    ...(state.role === "admin"
      ? [{ id: "members", label: "Pracownicy", icon: "users" }, { id: "income", label: "Dochód", icon: "badge-dollar-sign" }]
      : []),
  ];

  const tabBtns = tabs.map((t) => `
    <button data-ptab="${escapeHtml(t.id)}"
      class="px-4 py-2 rounded-xl ${tab === t.id ? "bg-white/10 font-semibold" : "chip"} inline-flex items-center gap-2 text-sm">
      <i data-lucide="${escapeHtml(t.icon)}" class="w-4 h-4 ${tab === t.id ? "text-[var(--accent)]" : ""}"></i>
      ${escapeHtml(t.label)}
    </button>
  `).join("");

  let inner = "";

  if (tab === "tasks") {
    const tasks = await api(`/api/projects/${p.id}/tasks`);
    const rows = (tasks || []).map((t) => `
      <div class="rounded-2xl chip p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold">${escapeHtml(t.title)}</div>
            <div class="text-xs text-white/60 mt-1">${escapeHtml(t.description || "")}</div>
            <div class="text-xs text-white/50 mt-2">Termin: ${new Date(t.dueDate).toLocaleDateString("pl-PL")}</div>
            ${t.assignee?.login ? `<div class="text-xs text-white/50 mt-1">Pracownik: ${escapeHtml(t.assignee.login)}</div>` : ""}
          </div>
          <div class="text-right">
            <div class="text-xs ${t.status === "done" ? "text-green-300" : "text-yellow-300"} font-semibold">${escapeHtml(t.status)}</div>
            ${state.role === "employee" && t.status !== "done"
              ? `<button data-done="${escapeHtml(t.id)}" class="mt-2 px-3 py-2 rounded-xl btn-accent text-xs font-semibold">Zakończ</button>`
              : ""
            }
          </div>
        </div>
      </div>
    `).join("");

    const add = state.role === "admin" ? `
      <div class="rounded-2xl chip p-4">
        <div class="text-sm font-semibold mb-3">Dodaj zadanie</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input id="tTitle" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Nazwa" />
          <input id="tDue" type="date" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" />
        </div>
        <textarea id="tDesc" class="mt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" rows="3" placeholder="Opis..."></textarea>
        <div class="mt-3 flex gap-2">
          <input id="tAssignee" class="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Login pracownika (dokładnie)" />
          <button id="btnAddTask" class="px-4 py-3 rounded-xl btn-accent font-semibold">Dodaj</button>
        </div>
        <div class="text-[11px] text-white/50 mt-2">Przypisujesz po loginie (serwer mapuje na userId).</div>
      </div>
    ` : "";

    inner = `${add}<div class="space-y-3 mt-4">${rows || `<div class="text-white/60 text-sm">Brak zadań.</div>`}</div>`;

    setTimeout(() => {
      $$("[data-done]").forEach((b) => {
        b.addEventListener("click", async () => {
          try {
            await api(`/api/tasks/${b.getAttribute("data-done")}/complete`, { method: "POST" });
            toast("Zakończono ✅", "ok");
            route().catch((e) => toast(e.message, "err"));
          } catch (e) { toast(e.message, "err"); }
        });
      });

      $("#btnAddTask")?.addEventListener("click", async () => {
        try {
          const login = $("#tAssignee")?.value?.trim() || "";
          const list = await api("/api/admin/employees");
          const u = (list || []).find((x) => x.login === login);
          if (!u) return toast("Nie znaleziono pracownika po loginie.", "err");

          await api(`/api/admin/projects/${p.id}/tasks`, {
            method: "POST",
            body: {
              assigneeId: u.id,
              title: $("#tTitle")?.value?.trim() || "",
              description: $("#tDesc")?.value?.trim() || "",
              dueDate: $("#tDue")?.value || "",
            },
          });

          toast("Dodano zadanie ✅", "ok");
          route().catch((e) => toast(e.message, "err"));
        } catch (e) { toast(e.message, "err"); }
      });
    }, 0);
  }

  if (tab === "income" && state.role === "admin") {
    inner = `
      <div class="rounded-2xl chip p-5">
        <div class="text-xs text-white/60">Dochód projektu</div>
        <div class="text-3xl font-bold mt-1">${fmtPLN(p.incomePLN || 0)}</div>
        <div class="mt-4 flex gap-2">
          <input id="incVal" type="number" class="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="np. 5000" />
          <button id="btnIncSet" class="px-4 py-3 rounded-xl btn-accent font-semibold">Ustaw</button>
        </div>
      </div>
    `;
    setTimeout(() => {
      $("#btnIncSet")?.addEventListener("click", async () => {
        try {
          await api(`/api/admin/projects/${p.id}/income`, { method: "POST", body: { incomePLN: Number($("#incVal")?.value || 0) } });
          toast("Zapisano ✅", "ok");
          route().catch((e) => toast(e.message, "err"));
        } catch (e) { toast(e.message, "err"); }
      });
    }, 0);
  }

  if (tab === "members" && state.role === "admin") {
    const list = await api("/api/admin/employees");
    const assigned = (list || []).filter((u) => (u.assignedProjects || []).some((ap) => ap.id === p.id));
    inner = `
      <div class="space-y-3">
        ${(assigned || []).map((u) => `
          <div class="rounded-2xl chip p-4">
            <div class="font-semibold">${escapeHtml(u.login)}</div>
            <div class="text-xs text-white/60">Saldo: ${fmtPLN(u.balancePLN || 0)}</div>
          </div>
        `).join("") || `<div class="text-white/60 text-sm">Brak przypisanych pracowników.</div>`}
      </div>
    `;
  }

  const html = card(
    `Projekt: ${p.name}`,
    "Osobny dashboard projektu.",
    `
      <div class="flex flex-wrap gap-2">${tabBtns}</div>
      <div class="mt-4">${inner}</div>
    `
  );

  setTimeout(() => {
    $$("[data-ptab]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-ptab");
        history.replaceState(null, "", `/#/project/${p.id}?tab=${id}`);
        route().catch((e) => toast(e.message, "err"));
      });
    });
    safeLucide();
  }, 0);

  return html;
}

async function viewOrders() {
  const list = await api("/api/admin/orders");
  const rows = (list || []).map((o) => `
    <div class="rounded-2xl chip p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-semibold">${escapeHtml(o.from)} • ${fmtPLN(o.amountPLN)}</div>
          <div class="text-xs text-white/60 mt-1">${escapeHtml(o.todo)}</div>
          <div class="text-xs text-white/50 mt-2">Termin: ${new Date(o.dueDate).toLocaleDateString("pl-PL")} • Status: ${escapeHtml(o.status)}</div>
        </div>
        <div class="text-right">
          ${o.status === "open"
            ? `<button data-o-done="${escapeHtml(o.id)}" class="px-3 py-2 rounded-xl btn-accent text-xs font-semibold">Zakończ teraz</button>`
            : `<span class="text-xs text-white/50">—</span>`
          }
        </div>
      </div>
    </div>
  `).join("");

  const html = `
    ${card("Dodaj zlecenie", "Od kogo / termin / kwota / co do zrobienia", `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input id="oFrom" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Od kogo" />
        <input id="oDue" type="date" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" />
        <input id="oAmt" type="number" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Kwota PLN" />
        <input id="oTodo" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Co do zrobienia" />
      </div>
      <button id="btnAddOrder" class="mt-3 w-full rounded-xl btn-accent px-4 py-3 font-semibold">Dodaj</button>
    `)}

    ${card("Lista zleceń", "Tylko admin. Deadline noty lecą 7d / 3d / 24h przed terminem.", `<div class="space-y-3">${rows || `<div class="text-white/60 text-sm">Brak.</div>`}</div>`)}
  `;

  setTimeout(() => {
    $("#btnAddOrder")?.addEventListener("click", async () => {
      try {
        await api("/api/admin/orders", {
          method: "POST",
          body: {
            from: $("#oFrom")?.value?.trim() || "",
            dueDate: $("#oDue")?.value || "",
            amountPLN: Number($("#oAmt")?.value || 0),
            todo: $("#oTodo")?.value?.trim() || "",
          },
        });
        toast("Dodano zlecenie ✅", "ok");
        route().catch((e) => toast(e.message, "err"));
      } catch (e) { toast(e.message, "err"); }
    });

    $$("[data-o-done]").forEach((b) => {
      b.addEventListener("click", async () => {
        try {
          await api(`/api/admin/orders/${b.getAttribute("data-o-done")}/complete`, { method: "POST" });
          toast("Zlecenie zakończone ✅", "ok");
          await hydrate();
          route().catch((e) => toast(e.message, "err"));
        } catch (e) { toast(e.message, "err"); }
      });
    });
  }, 0);

  return html;
}

async function viewIdeas() {
  const list = await api("/api/admin/ideas");
  const rows = (list || []).map((i) => `
    <div class="rounded-2xl chip p-4">
      <div class="flex items-start gap-3">
        <img src="${escapeHtml(i.imageUrl || "/favicon.png")}" class="w-14 h-14 rounded-2xl ring-1 ring-white/10 object-cover" />
        <div class="flex-1">
          <div class="font-semibold">${escapeHtml(i.title)}</div>
          <div class="text-xs text-white/60 mt-1">${escapeHtml(i.description || "")}</div>
          <div class="text-[11px] text-white/40 mt-2">${new Date(i.createdAt).toLocaleString("pl-PL")}</div>
        </div>
      </div>
    </div>
  `).join("");

  const html = `
    ${card("Dodaj pomysł", "Nazwa + opis + opcjonalnie zdjęcie.", `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input id="iTitle" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Nazwa" />
        <input id="iImg" type="file" accept="image/*" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white/80" />
        <button id="btnAddIdea" class="rounded-xl btn-accent px-4 py-3 font-semibold">Dodaj</button>
      </div>
      <textarea id="iDesc" rows="3" class="mt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Opis..."></textarea>
    `)}

    ${card("Pomysły", "Tylko admin.", `<div class="space-y-3">${rows || `<div class="text-white/60 text-sm">Brak.</div>`}</div>`)}
  `;

  setTimeout(() => {
    $("#btnAddIdea")?.addEventListener("click", async () => {
      try {
        const fd = new FormData();
        fd.append("title", $("#iTitle")?.value?.trim() || "");
        fd.append("description", $("#iDesc")?.value?.trim() || "");
        const f = $("#iImg")?.files?.[0];
        if (f) fd.append("image", f);

        await api("/api/admin/ideas", { method: "POST", body: fd, isForm: true });
        toast("Dodano pomysł ✅", "ok");
        route().catch((e) => toast(e.message, "err"));
      } catch (e) { toast(e.message, "err"); }
    });
  }, 0);

  return html;
}

async function viewPushSend() {
  const projs = await api("/api/projects");
  const opts = (projs || []).map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");

  const html = card("Wyślij powiadomienie", "Wyśle push do wszystkich pracowników przypisanych do projektu.", `
    <div class="grid grid-cols-1 gap-3">
      <select id="pushProject" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white">${opts}</select>
      <textarea id="pushText" rows="4" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Treść powiadomienia..."></textarea>
      <button id="btnSendPush" class="rounded-xl btn-accent px-4 py-3 font-semibold inline-flex items-center justify-center gap-2">
        <i data-lucide="send" class="w-5 h-5"></i>
        Wyślij
      </button>
      ${isIOS() && !isStandalonePWA()
        ? `<div class="text-xs text-white/60 chip rounded-xl p-3">
             iOS: push działa dopiero w PWA dodanym do ekranu głównego.
           </div>`
        : ""
      }
    </div>
  `);

  setTimeout(() => {
    $("#btnSendPush")?.addEventListener("click", async () => {
      try {
        await api("/api/admin/push/send", {
          method: "POST",
          body: {
            projectId: $("#pushProject")?.value || "",
            text: ($("#pushText")?.value || "").trim(),
          },
        });
        toast("Wysłano ✅", "ok");
        if ($("#pushText")) $("#pushText").value = "";
      } catch (e) { toast(e.message, "err"); }
    });
    safeLucide();
  }, 0);

  return html;
}

// ----------------- Router -----------------
async function route() {
  const outlet = $("#outlet");
  if (!outlet) return;

  // Show skeleton during async view building
  outlet.innerHTML = outletSkeleton();

  const hash = window.location.hash || "";

  // project route
  if (hash.startsWith("#/project/") || hash.startsWith("#/project/") || hash.startsWith("#/project/") || hash.startsWith("#/project/")) {
    // keep as-is, but our actual used is "#/project/"
  }
  if (hash.startsWith("#/project/") || hash.startsWith("#/project/") ) {
    // noop
  }

  if (hash.startsWith("#/project/")) {
    state.active = "projectView";
    state.projectId = hash.split("#/project/")[1].split("?")[0];
    outlet.innerHTML = await viewProjectDashboard();
    safeLucide();
    return;
  }

  switch (state.active) {
    case "dashboard": {
      outlet.innerHTML = await viewDashboard();

      if (state.role === "employee") {
        const projects = await api("/api/projects");
        const mini = (projects || []).map((p) => `
          <button data-open-project="${escapeHtml(p.id)}" class="rounded-2xl chip p-4 text-left hover:border-white/20 transition">
            <div class="flex items-start gap-3">
              <img src="${escapeHtml(p.imageUrl || "/favicon.png")}" class="w-12 h-12 rounded-2xl ring-1 ring-white/10 object-cover" />
              <div class="flex-1">
                <div class="font-semibold">${escapeHtml(p.name)}</div>
                <div class="text-xs text-white/60 mt-1">${escapeHtml((p.description || "—").slice(0, 90))}</div>
              </div>
            </div>
          </button>
        `).join("");

        safeHTML("#projectsMini", `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${mini || `<div class="text-white/60 text-sm">Brak.</div>`}</div>`);

        $$("[data-open-project]").forEach((b) => {
          b.addEventListener("click", () => {
            history.replaceState(null, "", `/#/project/${b.getAttribute("data-open-project")}?tab=tasks`);
            route().catch((e) => toast(e.message, "err"));
          });
        });
      }
      break;
    }

    case "orders":
      outlet.innerHTML = await viewOrders();
      break;

    case "projects":
      outlet.innerHTML = await viewProjects();
      break;

    case "employees":
      outlet.innerHTML = await viewEmployees();
      break;

    case "wallet":
      outlet.innerHTML = await viewWallet();
      setTimeout(() => {
        $("#btnWalletAdd")?.addEventListener("click", async () => {
          try {
            await api("/api/admin/wallet/add", { method: "POST", body: { amountPLN: Number($("#walletAddAmt")?.value || 0) } });
            toast("Dodano ✅", "ok");
            await hydrate();
            route().catch((e) => toast(e.message, "err"));
          } catch (e) { toast(e.message, "err"); }
        });
      }, 0);
      break;

    case "ideas":
      outlet.innerHTML = await viewIdeas();
      break;

    case "push":
      outlet.innerHTML = await viewPushSend();
      break;

    case "projectTasks":
      outlet.innerHTML = await viewProjects();
      toast("Wejdź w projekt i użyj zakładki Do zrobienia.", "info");
      break;

    case "notifications":
      outlet.innerHTML = await viewNotifications();
      break;

    default:
      outlet.innerHTML = await viewDashboard();
  }

  safeLucide();
}

// ----------------- hydrate -----------------
async function hydrate() {
  const me = await api("/api/me");
  state.me = me;
  state.role = me.role;

  safeText("#whoami", `${me.login} (${me.role})`);
  $("#btnLogout")?.classList.remove("hidden");
  safeText("#topBalance", fmtPLN(me.balancePLN || 0));

  // Optional subtitle (guarded!)
  const dashSubtitleEl = $("#dashSubtitle");
  if (dashSubtitleEl) {
    dashSubtitleEl.textContent =
      me.role === "admin"
        ? "Masz pełny dostęp: zlecenia, projekty, pracownicy, portfel, push."
        : "Masz dostęp tylko do przypisanych projektów i zadań.";
  }

  renderNav();
}

// ----------------- auth -----------------
async function doLogin() {
  const loginEl = $("#loginLogin");
  const passEl = $("#loginPassword");
  const btn = $("#btnLogin");

  const login = loginEl?.value?.trim() || "";
  const password = passEl?.value || "";

  if (!login || !password) {
    toast("Uzupełnij login i hasło.", "err");
    return;
  }

  // UX: loading state
  const prev = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-flex items-center gap-2">
      <span class="w-4 h-4 rounded-full border border-white/50 border-t-transparent animate-spin"></span>
      Logowanie…
    </span>`;
  }

  try {
    const r = await api("/api/auth/login", { method: "POST", body: { login, password } });
    state.token = r.token;
    localStorage.setItem("vt_token", state.token);

    toast("Zalogowano ✅", "ok");

    $("#viewLogin")?.classList.add("hidden");
    $("#viewApp")?.classList.remove("hidden");

    await hydrate();
    state.active = "dashboard";
    await route();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = prev || btn.innerHTML;
    }
  }
}

function logout() {
  localStorage.removeItem("vt_token");
  state.token = "";
  state.me = null;
  state.role = null;
  state.active = "dashboard";
  state.projectId = null;
  window.location.hash = "";
  toast("Wylogowano.", "info");
  location.reload();
}

// ----------------- Command Palette (Ctrl/⌘+K) -----------------
function initCommandPalette() {
  // no HTML required — we create it here (still in app.js as you wanted)
  const overlay = document.createElement("div");
  overlay.id = "cmdk";
  overlay.className = "fixed inset-0 z-[200] hidden";
  overlay.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
    <div class="absolute left-1/2 top-[12%] -translate-x-1/2 w-[92%] max-w-xl">
      <div class="glass rounded-2xl border border-white/10 overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,.6)]">
        <div class="p-3 border-b border-white/10 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-white/60"></i>
          <input id="cmdkInput" class="w-full bg-transparent outline-none text-sm px-1 py-2"
                 placeholder="Szukaj… (dashboard, projekty, push, wyloguj)" />
          <div class="text-[10px] text-white/40 hidden sm:block">ESC</div>
        </div>
        <div id="cmdkList" class="max-h-[52vh] overflow-auto p-2"></div>
        <div class="p-3 border-t border-white/10 text-xs text-white/50 flex items-center justify-between">
          <span>↑↓ wybór • Enter akcja</span>
          <span>Ctrl/⌘+K</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  safeLucide();

  const cmdk = $("#cmdk");
  const input = $("#cmdkInput");
  const list = $("#cmdkList");

  const baseActions = [
    { label: "Dashboard", key: "dashboard", icon: "layout-dashboard", run: () => go("dashboard") },
    { label: "Projekty", key: "projects", icon: "folder-kanban", run: () => go("projects") },
    { label: "Zlecenia", key: "orders", icon: "clipboard-list", run: () => go("orders") },
    { label: "Portfel", key: "wallet", icon: "wallet", run: () => go("wallet") },
    { label: "Włącz Push", key: "push-enable", icon: "bell", run: () => enablePush().catch(e => toast(e.message, "err")) },
    { label: "Wyślij Push (Admin)", key: "push", icon: "send", run: () => go("push") },
    { label: "Wyloguj", key: "logout", icon: "log-out", run: () => logout() },
  ];

  let filtered = [];
  let idx = 0;

  function open() {
    cmdk?.classList.remove("hidden");
    render("");
    setTimeout(() => input?.focus(), 20);
  }
  function close() {
    cmdk?.classList.add("hidden");
  }

  function render(q) {
    const query = (q || "").toLowerCase().trim();

    // Filter actions by role
    const actions = baseActions.filter(a => {
      if (a.key === "orders" || a.key === "push") return state.role === "admin";
      return true;
    });

    filtered = actions.filter(a =>
      a.label.toLowerCase().includes(query) || a.key.toLowerCase().includes(query)
    );

    idx = 0;
    list.innerHTML = filtered.map((a, i) => `
      <button class="w-full text-left rounded-xl px-3 py-3 flex items-center gap-3 ${i===0?"bg-white/10":""} hover:bg-white/10"
              data-cmdk="${i}">
        <i data-lucide="${a.icon}" class="w-5 h-5 text-white/70"></i>
        <div class="flex-1">
          <div class="text-sm font-semibold">${escapeHtml(a.label)}</div>
          <div class="text-xs text-white/50">${escapeHtml(a.key)}</div>
        </div>
        <div class="text-[10px] text-white/40">Enter</div>
      </button>
    `).join("") || `<div class="p-4 text-sm text-white/60">Brak wyników.</div>`;

    safeLucide();
    $$("[data-cmdk]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.cmdk);
        const chosen = filtered[i];
        if (chosen) { close(); chosen.run(); }
      }, { once: true });
    });
  }

  function highlight() {
    $$("[data-cmdk]").forEach((b, i) => b.classList.toggle("bg-white/10", i === idx));
  }

  function pick() {
    const chosen = filtered[idx];
    if (chosen) { close(); chosen.run(); }
  }

  // overlay click closes
  cmdk?.addEventListener("click", (e) => {
    if (e.target === cmdk.firstElementChild) close();
  });

  input?.addEventListener("input", (e) => render(e.target.value));

  document.addEventListener("keydown", (e) => {
    const metaK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
    if (metaK) {
      e.preventDefault();
      if (cmdk?.classList.contains("hidden")) open(); else close();
      return;
    }
    if (!cmdk || cmdk.classList.contains("hidden")) return;

    if (e.key === "Escape") close();
    if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(filtered.length - 1, idx + 1); highlight(); }
    if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(0, idx - 1); highlight(); }
    if (e.key === "Enter") { e.preventDefault(); pick(); }
  });
}

function go(id) {
  state.active = id;
  if (id !== "projectView") state.projectId = null;
  closeMobileMenu();
  renderNav();
  route().catch((e) => toast(e.message, "err"));
}

// ----------------- init -----------------
document.addEventListener("DOMContentLoaded", async () => {
  createParticles();
  safeLucide();
  await registerSW();

  initCommandPalette();

  // mobile menu
  $("#btnMenu")?.addEventListener("click", openMobileMenu);
  $("#btnCloseMenu")?.addEventListener("click", closeMobileMenu);
  $("#overlayClose")?.addEventListener("click", closeMobileMenu);

  // push
  $("#btnEnablePush")?.addEventListener("click", async () => {
    try { await enablePush(); } catch (e) { toast(e.message, "err"); }
  });

  // logout
  $("#btnLogout")?.addEventListener("click", logout);
  $("#btnLogout2")?.addEventListener("click", logout);
  $("#btnLogoutMobile")?.addEventListener("click", logout);

  // login (Enter support + safe)
  $("#btnLogin")?.addEventListener("click", async () => {
    try { await doLogin(); } catch (e) { toast(e.message, "err"); }
  });

  $("#loginLogin")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btnLogin")?.click(); });
  $("#loginPassword")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btnLogin")?.click(); });

  // auto-login
  if (state.token) {
    $("#viewLogin")?.classList.add("hidden");
    $("#viewApp")?.classList.remove("hidden");
    try {
      await hydrate();
      await route();
    } catch {
      localStorage.removeItem("vt_token");
      $("#viewLogin")?.classList.remove("hidden");
      $("#viewApp")?.classList.add("hidden");
    }
  }

  window.addEventListener("hashchange", () => {
    route().catch((e) => toast(e.message, "err"));
  });
});
