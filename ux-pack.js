(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- Toasts ----------
  const toasts = $("#toasts");
  function toast(msg, type = "info", ms = 2600) {
    if (!toasts) return;
    const el = document.createElement("div");
    el.className =
      "glass rounded-2xl border border-white/10 px-4 py-3 text-sm flex items-start gap-3 " +
      (type === "success" ? "shadow-[0_12px_40px_rgba(34,197,94,0.18)]" :
       type === "error" ? "shadow-[0_12px_40px_rgba(239,68,68,0.18)]" :
       "shadow-[0_12px_40px_rgba(255,255,255,0.08)]");
    const icon = type === "success" ? "check-circle" : type === "error" ? "alert-triangle" : "info";
    el.innerHTML = `
      <i data-lucide="${icon}" class="w-5 h-5 mt-[1px] ${type === "success" ? "text-emerald-400" : type === "error" ? "text-red-400" : "text-white/70"}"></i>
      <div class="flex-1">
        <div class="text-white/90">${escapeHtml(msg)}</div>
      </div>
      <button class="w-8 h-8 rounded-xl chip inline-flex items-center justify-center -mt-1" aria-label="Zamknij">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;
    toasts.appendChild(el);
    safeLucide();
    const closeBtn = el.querySelector("button");
    const kill = () => {
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => el.remove(), 180);
    };
    closeBtn.addEventListener("click", kill);
    setTimeout(kill, ms);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[s]));
  }

  function safeLucide() {
    try { window.lucide?.createIcons?.(); } catch {}
  }

  // ---------- Login UX ----------
  function enhanceLogin() {
    const viewLogin = $("#viewLogin");
    if (!viewLogin) return;

    const login = $("#loginLogin");
    const pass = $("#loginPassword");
    const btn = $("#btnLogin");

    // Show/Hide password button
    if (pass && !$("#togglePass")) {
      const wrap = pass.parentElement;
      wrap.style.position = "relative";
      const t = document.createElement("button");
      t.id = "togglePass";
      t.type = "button";
      t.className = "absolute right-3 top-[38px] w-10 h-10 rounded-xl chip inline-flex items-center justify-center";
      t.innerHTML = `<i data-lucide="eye" class="w-5 h-5"></i>`;
      wrap.appendChild(t);
      t.addEventListener("click", () => {
        const isPw = pass.type === "password";
        pass.type = isPw ? "text" : "password";
        t.innerHTML = `<i data-lucide="${isPw ? "eye-off" : "eye"}" class="w-5 h-5"></i>`;
        safeLucide();
      });
      safeLucide();
    }

    // Caps Lock warning
    let capsEl = $("#capsWarn");
    if (!capsEl && pass) {
      capsEl = document.createElement("div");
      capsEl.id = "capsWarn";
      capsEl.className = "mt-2 text-xs text-amber-200/90 hidden";
      capsEl.innerHTML = `<span class="chip px-2 py-1 rounded-lg inline-flex items-center gap-2">
        <i data-lucide="alert-triangle" class="w-4 h-4"></i> Caps Lock jest włączony
      </span>`;
      pass.parentElement.appendChild(capsEl);
      safeLucide();
    }
    if (pass && capsEl) {
      pass.addEventListener("keyup", (e) => {
        const on = e.getModifierState && e.getModifierState("CapsLock");
        capsEl.classList.toggle("hidden", !on);
      });
    }

    // Enter submits
    [login, pass].forEach(inp => inp?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btn?.click();
    }));

    // Auto focus
    setTimeout(() => login?.focus(), 200);

    // Loading state on click (doesn't break your /app.js handler)
    if (btn && !btn.dataset.uxBound) {
      btn.dataset.uxBound = "1";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        const prev = btn.innerHTML;
        btn.dataset.prevHtml = prev;
        btn.innerHTML = `<span class="inline-flex items-center gap-2">
          <span class="w-4 h-4 rounded-full border border-white/50 border-t-transparent animate-spin"></span>
          Logowanie…
        </span>`;
        setTimeout(() => { // jeśli app.js nie odblokuje
          if (btn.disabled) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.prevHtml || prev;
          }
        }, 8000);
      }, { capture: true }); // capture: nie przeszkadza w app.js
    }
  }

  // ---------- Skeleton for outlet ----------
  function showOutletSkeleton() {
    const outlet = $("#outlet");
    if (!outlet) return;
    outlet.dataset.skeleton = "1";
    outlet.innerHTML = `
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

  // ---------- Active nav + router helpers ----------
  function setActiveNav(key) {
    const all = [...$$("[data-navkey]"), ...$$("[data-navkey-mobile]")];
    all.forEach(a => {
      const hit = a.dataset.navkey === key || a.dataset.navkeyMobile === key;
      a.classList.toggle("btn-accent", hit);
      a.classList.toggle("chip", !hit);
      a.classList.toggle("font-semibold", hit);
    });
  }

  // ---------- Command Palette (Ctrl/⌘+K) ----------
  const cmdk = $("#cmdk");
  const cmdkInput = $("#cmdkInput");
  const cmdkList = $("#cmdkList");

  const actions = [
    { label: "Dashboard", key: "dashboard", icon: "layout-dashboard", run: () => go("dashboard") },
    { label: "Projekty", key: "projekty", icon: "folder-kanban", run: () => go("projects") },
    { label: "Zlecenia", key: "zlecenia", icon: "clipboard-list", run: () => go("orders") },
    { label: "Portfel", key: "portfel", icon: "wallet", run: () => go("wallet") },
    { label: "Push: włącz / ustawienia", key: "push", icon: "bell", run: () => openPushModal() },
    { label: "Wyloguj", key: "wyloguj", icon: "log-out", run: () => $("#btnLogout2")?.click() || $("#btnLogout")?.click() || $("#btnLogoutMobile")?.click() },
  ];

  let cmdIndex = 0;
  function openCmdk() {
    if (!cmdk) return;
    cmdk.classList.remove("hidden");
    renderCmdk("");
    setTimeout(() => cmdkInput?.focus(), 40);
  }
  function closeCmdk() {
    cmdk?.classList.add("hidden");
  }
  function renderCmdk(q) {
    const query = (q || "").toLowerCase().trim();
    const filtered = actions.filter(a =>
      a.label.toLowerCase().includes(query) || a.key.toLowerCase().includes(query)
    );
    cmdIndex = 0;
    cmdkList.innerHTML = filtered.map((a, i) => `
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

    // click
    $$("[data-cmdk]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.cmdk);
        const chosen = filtered[idx];
        if (chosen) { closeCmdk(); chosen.run(); }
      }, { once: true });
    });

    // store current filtered list
    cmdkList.dataset.filtered = JSON.stringify(filtered.map(a => a.key));
  }

  function highlightCmdk() {
    const items = $$("[data-cmdk]");
    items.forEach((b, i) => b.classList.toggle("bg-white/10", i === cmdIndex));
  }

  function pickCmdk() {
    const items = $$("[data-cmdk]");
    const btn = items[cmdIndex];
    btn?.click();
  }

  // ---------- Push Modal ----------
  const pushModal = $("#pushModal");
  const pushClose = $("#pushClose");
  const pushEnable = $("#pushEnable");
  const pushTest = $("#pushTest");
  const pushHint = $("#pushHint");

  function openPushModal() {
    pushHint && (pushHint.textContent = "");
    pushModal?.classList.remove("hidden");
    safeLucide();
  }
  function closePushModal() {
    pushModal?.classList.add("hidden");
  }

  async function requestPushPermission() {
    if (!("Notification" in window)) {
      toast("Ta przeglądarka nie obsługuje push.", "error");
      return;
    }
    const p = await Notification.requestPermission();
    if (p === "granted") toast("Push włączone ✅", "success");
    else toast("Push wyłączone (odmowa w przeglądarce).", "info");
  }

  function sendTestPushLocal() {
    if (!("Notification" in window)) return toast("Brak obsługi Notification.", "error");
    if (Notification.permission !== "granted") return toast("Najpierw włącz push.", "info");
    new Notification("VelorieTeam", { body: "Test powiadomienia działa ✅", silent: false });
    toast("Wysłano test powiadomienia.", "success");
  }

  // ---------- Go to section (soft-integration with app.js) ----------
  function go(key) {
    // 1) jeśli masz linki w nav — klikamy je
    const link = document.querySelector(`[data-navkey="${key}"]`) ||
                 document.querySelector(`[data-navkey-mobile="${key}"]`) ||
                 document.querySelector(`[href="#${key}"]`);
    if (link) link.click();

    // 2) fallback: hash (jeśli router w app.js go używa)
    location.hash = key.startsWith("#") ? key : `#${key}`;
    setActiveNav(key);
    toast(`→ ${key}`, "info", 1200);
  }

  // ---------- Global keybinds ----------
  function bindGlobalKeys() {
    document.addEventListener("keydown", (e) => {
      const metaK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      if (metaK) {
        e.preventDefault();
        if (cmdk?.classList.contains("hidden")) openCmdk(); else closeCmdk();
        return;
      }
      if (e.key === "Escape") {
        if (pushModal && !pushModal.classList.contains("hidden")) closePushModal();
        if (cmdk && !cmdk.classList.contains("hidden")) closeCmdk();
      }
      if (cmdk && !cmdk.classList.contains("hidden")) {
        if (e.key === "ArrowDown") { e.preventDefault(); cmdIndex++; highlightCmdk(); }
        if (e.key === "ArrowUp") { e.preventDefault(); cmdIndex = Math.max(0, cmdIndex - 1); highlightCmdk(); }
        if (e.key === "Enter") { e.preventDefault(); pickCmdk(); }
      }
    });

    cmdk?.addEventListener("click", (e) => {
      if (e.target === cmdk.firstElementChild) closeCmdk();
    });
    cmdkInput?.addEventListener("input", (e) => renderCmdk(e.target.value));
  }

  // ---------- Hook buttons ----------
  function hookButtons() {
    $("#btnEnablePush")?.addEventListener("click", openPushModal);
    pushClose?.addEventListener("click", closePushModal);
    $("#overlayClose")?.addEventListener("click", () => $("#mobileOverlay")?.classList.add("hidden"));

    pushEnable?.addEventListener("click", async () => {
      await requestPushPermission();
      pushHint && (pushHint.textContent = Notification.permission === "granted"
        ? "Masz włączone powiadomienia. Możesz wysłać test."
        : "Jeśli odmówiłeś, włącz to w ustawieniach przeglądarki dla tej strony.");
    });

    pushTest?.addEventListener("click", sendTestPushLocal);
  }

  // ---------- Observe app switch (login -> app) ----------
  function watchAppVisibility() {
    const viewApp = $("#viewApp");
    if (!viewApp) return;

    const obs = new MutationObserver(() => {
      const isApp = !viewApp.classList.contains("hidden");
      if (isApp) {
        // pokaż skeleton na start (app.js zaraz go zastąpi)
        showOutletSkeleton();
        toast("Zalogowano ✅", "success");
        setTimeout(() => safeLucide(), 50);
      }
    });
    obs.observe(viewApp, { attributes: true, attributeFilter: ["class"] });
  }

  // ---------- Init ----------
  function init() {
    safeLucide();
    enhanceLogin();
    bindGlobalKeys();
    hookButtons();
    watchAppVisibility();

    // Delikatny polish: pokazuj "Wyloguj" w topbar po wejściu do app
    const viewApp = $("#viewApp");
    const btnLogout = $("#btnLogout");
    if (viewApp && btnLogout) {
      const o = new MutationObserver(() => {
        const isApp = !viewApp.classList.contains("hidden");
        btnLogout.classList.toggle("hidden", !isApp);
      });
      o.observe(viewApp, { attributes: true, attributeFilter: ["class"] });
    }

    // jeśli user kliknie gdziekolwiek poza cmdk — zamknij
    document.addEventListener("click", (e) => {
      if (cmdk && !cmdk.classList.contains("hidden")) {
        const box = cmdk.querySelector(".glass");
        if (box && !box.contains(e.target) && e.target === cmdk.firstElementChild) closeCmdk();
      }
    });
  }

  // start
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
