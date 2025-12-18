// VelorieTeam SPA (root) — minimal working core
const $ = (q) => document.querySelector(q);

const state = {
  token: localStorage.getItem("vt_token") || "",
  me: null,
  role: null,
  active: "dashboard",
  projectId: null
};

function toast(msg, type = "info") {
  const wrap = $("#toasts");
  const el = document.createElement("div");
  el.className =
    "glass rounded-2xl px-4 py-3 text-sm border border-white/10 flex items-start gap-3";
  el.innerHTML = `
    <i data-lucide="${type === "ok" ? "check-circle" : type === "err" ? "alert-triangle" : "info"}" class="w-5 h-5 text-[var(--accent)] mt-0.5"></i>
    <div class="flex-1">${msg}</div>
  `;
  wrap.appendChild(el);
  lucide.createIcons();
  setTimeout(() => el.remove(), 3200);
}

async function api(path, { method = "GET", body, headers = {}, isForm = false } = {}) {
  const h = { ...headers };
  if (!isForm) h["Content-Type"] = "application/json";
  if (state.token) h["Authorization"] = "Bearer " + state.token;

  const res = await fetch(path, {
    method,
    headers: h,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ---------- particles ----------
function createParticles() {
  const container = document.getElementById("particles-container");
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

// ---------- PWA SW ----------
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function enablePush() {
  if (!("serviceWorker" in navigator)) return toast("Brak Service Worker.", "err");
  if (!("PushManager" in window)) return toast("Brak PushManager.", "err");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return toast("Odmówiono powiadomień.", "err");

  const reg = await navigator.serviceWorker.ready;
  const { key } = await api("/api/push/vapidPublicKey");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  });

  await api("/api/push/subscribe", { method: "POST", body: sub });
  toast("Push włączony ✅", "ok");
}

// ---------- UI: nav ----------
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
      { id: "push", icon: "send", label: "Wyślij powiadomienie" }
    ];
  }
  // employee
  return [
    { id: "dashboard", icon: "layout-dashboard", label: "Dashboard" },
    { id: "projects", icon: "folder-kanban", label: "Projekty" },
    { id: "wallet", icon: "wallet", label: "Portfel" },
    { id: "projectTasks", icon: "check-square", label: "Do zrobienia" },
    { id: "notifications", icon: "bell", label: "Powiadomienia" }
  ];
}

function renderNav() {
  const nav = $("#nav");
  const navMobile = $("#navMobile");
  const items = navItemsForRole(state.role);

  function btn(item, mobile = false) {
    const active = state.active === item.id;
    const cls = active
      ? "flex items-center gap-4 px-5 py-4 rounded-xl bg-white/10 font-semibold text-white transition text-base"
      : "flex items-center gap-4 px-5 py-4 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition text-base";
    const iColor = active ? "text-[var(--accent)]" : "";
    return `
      <button data-nav="${item.id}" class="${cls} w-full text-left">
        <i data-lucide="${item.icon}" class="h-6 w-6 ${iColor}"></i>
        <span>${item.label}</span>
      </button>
    `;
  }

  nav.innerHTML = items.map(i => btn(i)).join("");
  navMobile.innerHTML = items.map(i => btn(i, true)).join("");
  lucide.createIcons();

  [...document.querySelectorAll("[data-nav]")].forEach(el => {
    el.addEventListener("click", () => {
      state.active = el.getAttribute("data-nav");
      if (state.active !== "projectView") state.projectId = null;
      closeMobileMenu();
      route();
      renderNav();
    });
  });
}

function openMobileMenu() {
  $("#mobileOverlay").classList.remove("hidden");
}
function closeMobileMenu() {
  $("#mobileOverlay").classList.add("hidden");
}

// ---------- ROUTES ----------
function card(title, subtitle, inner) {
  return `
    <div class="glass rounded-2xl p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold">${title}</h3>
          ${subtitle ? `<p class="text-white/60 mt-1">${subtitle}</p>` : ""}
        </div>
      </div>
      <div class="mt-5">${inner}</div>
    </div>
  `;
}

async function viewDashboard() {
  if (state.role === "admin") {
    const s = await api("/api/admin/stats");
    $("#statTeam").textContent = s.teamCount;
    $("#statIncome").textContent = `${Number(s.adminBalancePLN || 0).toFixed(2)} PLN`;
  } else {
    $("#statTeam").textContent = "—";
    $("#statIncome").textContent = `${Number(state.me?.balancePLN || 0).toFixed(2)} PLN`;
  }

  return `
    ${state.role === "employee" ? card("Twoje projekty", "Widzisz tylko te, do których jesteś przypisany.", `
      <div id="projectsMini"></div>
    `) : ""}
  `;
}

async function viewNotifications() {
  const list = await api("/api/notifications");
  const rows = list.map(n => `
    <div class="rounded-2xl chip p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold">${n.title}</div>
          <div class="text-xs text-white/60 mt-1">${n.body}</div>
          <div class="text-[11px] text-white/40 mt-2">${new Date(n.createdAt).toLocaleString("pl-PL")}</div>
        </div>
        ${n.read ? `<span class="text-[11px] text-white/40">OK</span>` : `<button data-read="${n.id}" class="text-xs chip px-3 py-2 rounded-xl">Oznacz</button>`}
      </div>
    </div>
  `).join("");

  setTimeout(() => {
    document.querySelectorAll("[data-read]").forEach(b => {
      b.addEventListener("click", async () => {
        try {
          await api(`/api/notifications/${b.getAttribute("data-read")}/read`, { method: "POST" });
          toast("Oznaczono jako przeczytane", "ok");
          route();
        } catch (e) { toast(e.message, "err"); }
      });
    });
  }, 0);

  return card("Powiadomienia", "Twoje ostatnie powiadomienia.", `<div class="space-y-3">${rows || `<div class="text-white/60 text-sm">Brak.</div>`}</div>`);
}

async function viewWallet() {
  const me = await api("/api/me");
  state.me = me;
  $("#topBalance").textContent = `${Number(me.balancePLN || 0).toFixed(2)} PLN`;

  if (state.role === "admin") {
    return card("Portfel (Admin)", "Dodaj ręcznie lub przelewaj pracownikom.", `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="rounded-2xl chip p-4">
          <div class="text-xs text-white/60">Saldo</div>
          <div class="text-2xl font-bold mt-1">${Number(me.balancePLN || 0).toFixed(2)} PLN</div>
        </div>

        <div class="rounded-2xl chip p-4">
          <div class="text-sm font-semibold mb-3">Dodaj środki ręcznie</div>
          <div class="flex gap-2">
            <input id="walletAddAmt" type="number" class="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="np. 100" />
            <button id="btnWalletAdd" class="px-4 py-3 rounded-xl btn-accent font-semibold">Dodaj</button>
          </div>
        </div>
      </div>
    `);
  }

  return card("Portfel", "Twoje środki (tylko podgląd, admin dodaje).", `
    <div class="rounded-2xl chip p-5">
      <div class="text-xs text-white/60">Saldo</div>
      <div class="text-3xl font-bold mt-1">${Number(me.balancePLN || 0).toFixed(2)} PLN</div>
    </div>
  `);
}

async function viewEmployees() {
  const users = await api("/api/admin/employees");
  const projs = await api("/api/projects");

  const rows = users.map(u => `
    <div class="rounded-2xl chip p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-semibold">${u.login}</div>
          <div class="text-xs text-white/60">Saldo: ${Number(u.balancePLN || 0).toFixed(2)} PLN</div>
          <div class="text-xs text-white/60">Projekty: ${(u.assignedProjects||[]).map(p=>p.name).join(", ") || "—"}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div class="flex gap-2">
          <select data-assign-project="${u.id}" class="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-3 text-sm">
            ${(projs||[]).map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}
          </select>
          <button data-assign="${u.id}" class="px-4 py-3 rounded-xl chip text-sm font-semibold">Przypisz</button>
        </div>

        <div class="flex gap-2">
          <input data-transfer-amt="${u.id}" type="number" class="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-3 text-sm" placeholder="PLN" />
          <button data-transfer="${u.id}" class="px-4 py-3 rounded-xl btn-accent text-sm font-semibold">Przelej</button>
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
        const login = $("#empLogin").value.trim();
        const password = $("#empPass").value;
        await api("/api/admin/employees", { method: "POST", body: { login, password } });
        toast("Utworzono pracownika ✅", "ok");
        route();
      } catch (e) { toast(e.message, "err"); }
    });

    document.querySelectorAll("[data-assign]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          const userId = btn.getAttribute("data-assign");
          const sel = document.querySelector(`[data-assign-project="${userId}"]`);
          const projectId = sel.value;
          await api(`/api/admin/projects/${projectId}/assign`, { method: "POST", body: { userId } });
          toast("Przypisano do projektu ✅", "ok");
          route();
        } catch (e) { toast(e.message, "err"); }
      });
    });

    document.querySelectorAll("[data-transfer]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          const userId = btn.getAttribute("data-transfer");
          const amt = Number(document.querySelector(`[data-transfer-amt="${userId}"]`).value);
          await api("/api/admin/transfer", { method: "POST", body: { userId, amountPLN: amt } });
          toast("Wysłano przelew ✅", "ok");
          route();
        } catch (e) { toast(e.message, "err"); }
      });
    });
  }, 0);

  return html;
}

async function viewProjects() {
  const projects = await api("/api/projects");

  const cards = (projects || []).map(p => `
    <button data-open-project="${p.id}" class="text-left rounded-2xl chip p-4 hover:border-white/20 transition">
      <div class="flex items-start gap-3">
        <img src="${p.imageUrl || "/favicon.png"}" class="w-14 h-14 rounded-2xl ring-1 ring-white/10 object-cover" />
        <div class="flex-1">
          <div class="font-semibold">${p.name}</div>
          <div class="text-xs text-white/60 mt-1 line-clamp-2">${p.description || "—"}</div>
          <div class="text-xs text-white/50 mt-2">Dochód projektu: ${Number(p.incomePLN||0).toFixed(2)} PLN</div>
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
        fd.append("name", $("#prName").value.trim());
        fd.append("description", $("#prDesc").value.trim());
        const f = $("#prImage").files?.[0];
        if (f) fd.append("image", f);

        await api("/api/admin/projects", { method: "POST", body: fd, isForm: true, headers: {} });
        toast("Utworzono projekt ✅", "ok");
        route();
      } catch (e) { toast(e.message, "err"); }
    });

    document.querySelectorAll("[data-open-project]").forEach(b => {
      b.addEventListener("click", () => {
        state.projectId = b.getAttribute("data-open-project");
        state.active = "projectView";
        route();
        renderNav();
      });
    });
  }, 0);

  return html;
}

async function viewProjectDashboard() {
  const projects = await api("/api/projects");
  const p = (projects || []).find(x => x.id === state.projectId);
  if (!p) {
    state.active = "projects";
    return await viewProjects();
  }

  // project tabs: tasks, income (admin), members (admin)
  const tab = (window.location.hash || "").includes("tab=")
    ? new URLSearchParams(window.location.hash.split("?")[1] || "").get("tab")
    : "tasks";

  const tabs = [
    { id: "tasks", label: "Do zrobienia", icon: "check-square" },
    ...(state.role === "admin" ? [{ id: "members", label: "Pracownicy", icon: "users" }, { id: "income", label: "Dochód", icon: "badge-dollar-sign" }] : [])
  ];

  const tabBtns = tabs.map(t => `
    <button data-ptab="${t.id}" class="px-4 py-2 rounded-xl ${tab === t.id ? "bg-white/10 font-semibold" : "chip"} inline-flex items-center gap-2 text-sm">
      <i data-lucide="${t.icon}" class="w-4 h-4 ${tab === t.id ? "text-[var(--accent)]" : ""}"></i>
      ${t.label}
    </button>
  `).join("");

  let inner = "";

  if (tab === "tasks") {
    const tasks = await api(`/api/projects/${p.id}/tasks`);
    const rows = (tasks || []).map(t => `
      <div class="rounded-2xl chip p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold">${t.title}</div>
            <div class="text-xs text-white/60 mt-1">${t.description || ""}</div>
            <div class="text-xs text-white/50 mt-2">Termin: ${new Date(t.dueDate).toLocaleDateString("pl-PL")}</div>
            ${t.assignee?.login ? `<div class="text-xs text-white/50 mt-1">Pracownik: ${t.assignee.login}</div>` : ""}
          </div>
          <div class="text-right">
            <div class="text-xs ${t.status === "done" ? "text-green-300" : "text-yellow-300"} font-semibold">${t.status}</div>
            ${state.role === "employee" && t.status !== "done" ? `<button data-done="${t.id}" class="mt-2 px-3 py-2 rounded-xl btn-accent text-xs font-semibold">Zakończ</button>` : ""}
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
        <div class="text-[11px] text-white/50 mt-2">W tym szkielecie przypisujesz po loginie (serwer mapuje na userId).</div>
      </div>
    ` : "";

    inner = `${add}<div class="space-y-3 mt-4">${rows || `<div class="text-white/60 text-sm">Brak zadań.</div>`}</div>`;

    setTimeout(() => {
      document.querySelectorAll("[data-done]").forEach(b => {
        b.addEventListener("click", async () => {
          try {
            await api(`/api/tasks/${b.getAttribute("data-done")}/complete`, { method: "POST" });
            toast("Zakończono ✅", "ok");
            route();
          } catch (e) { toast(e.message, "err"); }
        });
      });

      $("#btnAddTask")?.addEventListener("click", async () => {
        try {
          const login = $("#tAssignee").value.trim();
          const list = await api("/api/admin/employees"); // admin only
          const u = list.find(x => x.login === login);
          if (!u) return toast("Nie znaleziono pracownika po loginie.", "err");

          await api(`/api/admin/projects/${p.id}/tasks`, {
            method: "POST",
            body: {
              assigneeId: u.id,
              title: $("#tTitle").value.trim(),
              description: $("#tDesc").value.trim(),
              dueDate: $("#tDue").value
            }
          });

          toast("Dodano zadanie ✅", "ok");
          route();
        } catch (e) { toast(e.message, "err"); }
      });
    }, 0);
  }

  if (tab === "income" && state.role === "admin") {
    inner = `
      <div class="rounded-2xl chip p-5">
        <div class="text-xs text-white/60">Dochód projektu</div>
        <div class="text-3xl font-bold mt-1">${Number(p.incomePLN || 0).toFixed(2)} PLN</div>
        <div class="mt-4 flex gap-2">
          <input id="incVal" type="number" class="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="np. 5000" />
          <button id="btnIncSet" class="px-4 py-3 rounded-xl btn-accent font-semibold">Ustaw</button>
        </div>
      </div>
    `;
    setTimeout(() => {
      $("#btnIncSet").addEventListener("click", async () => {
        try {
          await api(`/api/admin/projects/${p.id}/income`, { method: "POST", body: { incomePLN: Number($("#incVal").value) } });
          toast("Zapisano ✅", "ok");
          route();
        } catch (e) { toast(e.message, "err"); }
      });
    }, 0);
  }

  if (tab === "members" && state.role === "admin") {
    const list = await api("/api/admin/employees");
    const assigned = list.filter(u => (u.assignedProjects || []).some(ap => ap.id === p.id));
    inner = `
      <div class="space-y-3">
        ${(assigned || []).map(u => `
          <div class="rounded-2xl chip p-4">
            <div class="font-semibold">${u.login}</div>
            <div class="text-xs text-white/60">Saldo: ${Number(u.balancePLN||0).toFixed(2)} PLN</div>
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
    document.querySelectorAll("[data-ptab]").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-ptab");
        history.replaceState(null, "", `/#project/${p.id}?tab=${id}`);
        route();
      });
    });
    lucide.createIcons();
  }, 0);

  return html;
}

async function viewOrders() {
  const list = await api("/api/admin/orders");
  const rows = (list || []).map(o => `
    <div class="rounded-2xl chip p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-semibold">${o.from} • ${Number(o.amountPLN).toFixed(2)} PLN</div>
          <div class="text-xs text-white/60 mt-1">${o.todo}</div>
          <div class="text-xs text-white/50 mt-2">Termin: ${new Date(o.dueDate).toLocaleDateString("pl-PL")} • Status: ${o.status}</div>
        </div>
        <div class="text-right">
          ${o.status === "open"
            ? `<button data-o-done="${o.id}" class="px-3 py-2 rounded-xl btn-accent text-xs font-semibold">Zakończ teraz</button>`
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
    $("#btnAddOrder").addEventListener("click", async () => {
      try {
        await api("/api/admin/orders", {
          method: "POST",
          body: {
            from: $("#oFrom").value.trim(),
            dueDate: $("#oDue").value,
            amountPLN: Number($("#oAmt").value),
            todo: $("#oTodo").value.trim()
          }
        });
        toast("Dodano zlecenie ✅", "ok");
        route();
      } catch (e) { toast(e.message, "err"); }
    });

    document.querySelectorAll("[data-o-done]").forEach(b => {
      b.addEventListener("click", async () => {
        try {
          await api(`/api/admin/orders/${b.getAttribute("data-o-done")}/complete`, { method: "POST" });
          toast("Zlecenie zakończone ✅", "ok");
          await hydrate();
          route();
        } catch (e) { toast(e.message, "err"); }
      });
    });
  }, 0);

  return html;
}

async function viewIdeas() {
  const list = await api("/api/admin/ideas");
  const rows = (list || []).map(i => `
    <div class="rounded-2xl chip p-4">
      <div class="flex items-start gap-3">
        <img src="${i.imageUrl || "/favicon.png"}" class="w-14 h-14 rounded-2xl ring-1 ring-white/10 object-cover" />
        <div class="flex-1">
          <div class="font-semibold">${i.title}</div>
          <div class="text-xs text-white/60 mt-1">${i.description}</div>
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
    $("#btnAddIdea").addEventListener("click", async () => {
      try {
        const fd = new FormData();
        fd.append("title", $("#iTitle").value.trim());
        fd.append("description", $("#iDesc").value.trim());
        const f = $("#iImg").files?.[0];
        if (f) fd.append("image", f);
        await api("/api/admin/ideas", { method: "POST", body: fd, isForm: true });
        toast("Dodano pomysł ✅", "ok");
        route();
      } catch (e) { toast(e.message, "err"); }
    });
  }, 0);

  return html;
}

async function viewPushSend() {
  const projs = await api("/api/projects");
  const opts = (projs || []).map(p => `<option value="${p.id}">${p.name}</option>`).join("");

  const html = card("Wyślij powiadomienie", "Wyśle push do wszystkich pracowników przypisanych do projektu.", `
    <div class="grid grid-cols-1 gap-3">
      <select id="pushProject" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white">${opts}</select>
      <textarea id="pushText" rows="4" class="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Treść powiadomienia..."></textarea>
      <button id="btnSendPush" class="rounded-xl btn-accent px-4 py-3 font-semibold inline-flex items-center justify-center gap-2">
        <i data-lucide="send" class="w-5 h-5"></i>
        Wyślij
      </button>
    </div>
  `);

  setTimeout(() => {
    $("#btnSendPush").addEventListener("click", async () => {
      try {
        await api("/api/admin/push/send", {
          method: "POST",
          body: { projectId: $("#pushProject").value, text: $("#pushText").value.trim() }
        });
        toast("Wysłano ✅", "ok");
        $("#pushText").value = "";
      } catch (e) { toast(e.message, "err"); }
    });
    lucide.createIcons();
  }, 0);

  return html;
}

async function route() {
  const outlet = $("#outlet");

  // project route (simple hash)
  const hash = window.location.hash || "";
  if (hash.startsWith("#/project/")) {
    state.active = "projectView";
    state.projectId = hash.split("#/project/")[1].split("?")[0];
    outlet.innerHTML = await viewProjectDashboard();
    lucide.createIcons();
    return;
  }

  switch (state.active) {
    case "dashboard":
      outlet.innerHTML = await viewDashboard();
      // mini projects for employee
      if (state.role === "employee") {
        const projects = await api("/api/projects");
        const mini = (projects || []).map(p => `
          <button data-open-project="${p.id}" class="rounded-2xl chip p-4 text-left">
            <div class="flex items-start gap-3">
              <img src="${p.imageUrl || "/favicon.png"}" class="w-12 h-12 rounded-2xl ring-1 ring-white/10 object-cover" />
              <div class="flex-1">
                <div class="font-semibold">${p.name}</div>
                <div class="text-xs text-white/60 mt-1">${(p.description || "—").slice(0, 90)}</div>
              </div>
            </div>
          </button>
        `).join("");
        $("#projectsMini").innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${mini || `<div class="text-white/60 text-sm">Brak.</div>`}</div>`;
        document.querySelectorAll("[data-open-project]").forEach(b => {
          b.addEventListener("click", () => {
            history.replaceState(null, "", `/#/project/${b.getAttribute("data-open-project")}?tab=tasks`);
            route();
          });
        });
      }
      break;

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
            await api("/api/admin/wallet/add", { method: "POST", body: { amountPLN: Number($("#walletAddAmt").value) } });
            toast("Dodano ✅", "ok");
            await hydrate();
            route();
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
      // shortcut: if employee has one project -> open it, otherwise show list
      outlet.innerHTML = await viewProjects();
      toast("Wejdź w projekt i użyj zakładki Do zrobienia.", "info");
      break;

    case "notifications":
      outlet.innerHTML = await viewNotifications();
      break;

    default:
      outlet.innerHTML = await viewDashboard();
  }

  lucide.createIcons();
}

// ---------- hydrate ----------
async function hydrate() {
  const me = await api("/api/me");
  state.me = me;
  state.role = me.role;

  $("#whoami").textContent = `${me.login} (${me.role})`;
  $("#btnLogout").classList.remove("hidden");
  $("#topBalance").textContent = `${Number(me.balancePLN || 0).toFixed(2)} PLN`;

  // subtitle
  $("#dashSubtitle").textContent =
    me.role === "admin"
      ? "Masz pełny dostęp: zlecenia, projekty, pracownicy, portfel, push."
      : "Masz dostęp tylko do przypisanych projektów i zadań.";

  renderNav();
}

// ---------- auth ----------
async function doLogin() {
  const login = $("#loginLogin").value.trim();
  const password = $("#loginPassword").value;

  const r = await api("/api/auth/login", { method: "POST", body: { login, password } });
  state.token = r.token;
  localStorage.setItem("vt_token", state.token);
  toast("Zalogowano ✅", "ok");

  $("#viewLogin").classList.add("hidden");
  $("#viewApp").classList.remove("hidden");

  await hydrate();
  state.active = "dashboard";
  await route();
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

// ---------- init ----------
document.addEventListener("DOMContentLoaded", async () => {
  createParticles();
  lucide.createIcons();
  await registerSW();

  // mobile menu
  $("#btnMenu").addEventListener("click", openMobileMenu);
  $("#btnCloseMenu").addEventListener("click", closeMobileMenu);
  $("#overlayClose").addEventListener("click", closeMobileMenu);

  // push
  $("#btnEnablePush").addEventListener("click", async () => {
    try { await enablePush(); } catch (e) { toast(e.message, "err"); }
  });

  // logout
  $("#btnLogout").addEventListener("click", logout);
  $("#btnLogout2").addEventListener("click", logout);
  $("#btnLogoutMobile").addEventListener("click", logout);

  // login
  $("#btnLogin").addEventListener("click", async () => {
    try { await doLogin(); } catch (e) { toast(e.message, "err"); }
  });

  // auto-login
  if (state.token) {
    $("#viewLogin").classList.add("hidden");
    $("#viewApp").classList.remove("hidden");
    try {
      await hydrate();
      await route();
    } catch {
      localStorage.removeItem("vt_token");
      $("#viewLogin").classList.remove("hidden");
      $("#viewApp").classList.add("hidden");
    }
  }

  window.addEventListener("hashchange", route);
});
