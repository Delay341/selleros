(function(){
  // Hardening: be resilient to script order issues
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};

  const { Storage, Keys } = window.FP;
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (msg) => console.log("[toast]", msg);

  const M = window.FP.Modules;

  window.FP.App = window.FP.App || {};
  window.FP.App.reboot = () => boot();

  const routes = [
    { id: "profile", title: "Личный кабинет", icon: "👤", module: M.ProfileModule },
    { id: "settings", title: "Кастомизация", icon: "🎛️", module: M.SettingsModule },
    { id: "currency", title: "Калькулятор валют", icon: "💱", module: M.CurrencyModule },
    { id: "calc", title: "Калькулятор iOS", icon: "🧮", module: M.CalculatorModule },
    { id: "notes", title: "Заметки", icon: "📝", module: M.NotesModule },
    { id: "templates", title: "Шаблоны сообщений", icon: "📋", module: M.TemplatesModule },
    { id: "inventory", title: "Склад", icon: "📦", module: M.InventoryModule },
    { id: "orders", title: "Учет заказов", icon: "🧾", module: M.OrdersModule },
    { id: "finance", title: "Бухгалтерия", icon: "📊", module: M.FinanceModule }
  ];

  function getFavorites(){
    const fav = Storage.get(Keys.FAVORITES, []);
    return Array.isArray(fav) ? fav : [];
  }
  function setFavorites(list){
    Storage.set(Keys.FAVORITES, Array.from(new Set(list)).filter(Boolean));
  }
  function isFav(id){ return getFavorites().includes(id); }
  function toggleFav(id){
    const fav = getFavorites();
    if (fav.includes(id)) setFavorites(fav.filter(x=>x!==id));
    else setFavorites([id, ...fav]);
  }

  // Apply customization (accent/density)
  try{ window.FP.ui && window.FP.ui.applyCustomization && window.FP.ui.applyCustomization(); }catch(e){}

    function ensureDefaults() {
    // --- Storage migrations (keep old data if key names change) ---
    // Inventory: fp_inventory -> fp_inventory_v1
    const legacyInv = Storage.get("fp_inventory", null);
    if (legacyInv && !Storage.get(Keys.INVENTORY, null)) {
      Storage.set(Keys.INVENTORY, legacyInv);
    }

    const user = Storage.get(Keys.USER);
    if (!user) {
      Storage.set(Keys.USER, {
        name: "Продавец FunPay",
        contact: "@your_contact",
        requisites: "Реквизиты/карта/кошелёк",
        avatar: "https://api.dicebear.com/9.x/thumbs/svg?seed=funpay"
      });
    }

    const theme = Storage.get(Keys.THEME, "dark");
    document.documentElement.setAttribute("data-theme", theme);

    const collapsed = Storage.get(Keys.SIDEBAR, false);
    Storage.set(Keys.SIDEBAR, collapsed);

    if (!Array.isArray(Storage.get(Keys.FAVORITES, null))) {
      Storage.set(Keys.FAVORITES, ["profile", "inventory", "finance"]);
    }

    if (!Storage.get(Keys.NOTES)) Storage.set(Keys.NOTES, []);
    if (!Storage.get(Keys.INVENTORY)) Storage.set(Keys.INVENTORY, []);
    if (!Storage.get(Keys.ORDERS)) Storage.set(Keys.ORDERS, null);
  }

  function layout() {
    const user = Storage.get(Keys.USER);
    const collapsed = Storage.get(Keys.SIDEBAR, false);
    const favIds = getFavorites();
    const favRoutes = favIds.map(id => routes.find(r=>r.id===id)).filter(Boolean);

    return `
    <div class="h-full w-full flex bg-slate-50 text-slate-900 dark:bg-[#0b1220] dark:text-slate-100">
      <aside id="sidebar" class="fp-sidebar ${collapsed ? "collapsed" : ""} h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d162a] fp-surface flex flex-col">
        <div class="p-4 flex items-center gap-3">
          <img src="./assets/logo.png" alt="SellerOS" class="w-10 h-10 rounded-xl bg-slate-200 object-cover"/>
          <div class="min-w-0 ${collapsed ? "hidden" : ""}">
            <div class="font-semibold truncate">SellerOS</div>
            <div class="text-xs text-slate-500 dark:text-slate-400 truncate">${user.name}</div>
          </div>
        </div>

        <div class="px-2 pb-2 ${collapsed ? "hidden" : ""}">
          <div class="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Избранное</div>
          <div id="favNav" class="flex flex-col gap-1">
            ${favRoutes.length ? favRoutes.map(r => `
              <button data-route="${r.id}" class="nav-btn nav-fav w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left">
                <span class="text-lg w-8">${r.icon}</span>
                <span class="text-sm font-medium">${r.title}</span>
              </button>
            `).join("") : `
              <div class="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Добавь сюда нужные модули через ⭐ в меню.</div>
            `}
          </div>
        </div>

        <nav class="px-2 pb-2 flex-1 fp-scroll overflow-auto">
          <div class="${collapsed ? "hidden" : ""} px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Модули</div>
          ${routes.map(r => `
            <div class="group flex items-center gap-1">
              <button data-route="${r.id}" class="nav-btn flex-1 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left">
                <span class="text-lg w-8">${r.icon}</span>
                <span class="${collapsed ? "hidden" : ""} text-sm font-medium flex-1">${r.title}</span>
              </button>
              <button data-fav="${r.id}" title="В избранное" class="${collapsed ? "hidden" : ""} fp-icon-btn !w-8 !h-8 !rounded-xl !border-slate-200 dark:!border-slate-700 hover:!bg-slate-50 dark:hover:!bg-slate-800 opacity-0 group-hover:opacity-100">
                ${isFav(r.id) ? "⭐" : "☆"}
              </button>
            </div>
          `).join("")}
        </nav>

        <div class="p-3 border-t border-slate-200 dark:border-slate-800">
          <button id="toggleSidebar" class="fp-btn w-full px-3 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90">
            ${collapsed ? "➡️ Развернуть меню" : "⬅️ Свернуть меню"}
          </button>
        </div>
      </aside>

      <main class="flex-1 h-full overflow-hidden">
        <header class="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d162a] fp-surface flex items-center justify-between px-4">
          <div class="min-w-0">
            <div id="pageTitle" class="font-semibold truncate">—</div>
            <div id="breadcrumbs" class="text-xs text-slate-500 dark:text-slate-400 truncate">SellerOS</div>
          </div>
          <div class="flex items-center gap-2">
            <button id="openSearch" class="fp-btn px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm flex items-center gap-2">
              🔎 Поиск <span class="fp-kbd">Ctrl K</span>
            </button>
            <button id="themeToggle" class="fp-btn px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">
              🌓 Тема
            </button>
          </div>
        </header>

        <section id="workspace" class="h-[calc(100%-56px)] overflow-auto fp-scroll p-4"></section>
      </main>
    </div>

    <!-- Global Search (Ctrl+K) -->
    <div id="searchOverlay" class="fp-overlay">
      <div class="fp-modal bg-white dark:bg-[#0d162a] fp-surface">
        <div class="fp-modal-header">
          <div class="fp-result-ico">🔎</div>
          <div class="flex-1 min-w-0">
            <input id="searchInput" placeholder="Искать: модуль, товар, заказ, заметка…" class="w-full bg-transparent outline-none text-base" />
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">Enter — открыть • ↑↓ — выбор • Esc — закрыть</div>
          </div>
          <div class="flex items-center gap-2">
            <span class="fp-kbd">Esc</span>
          </div>
        </div>
        <div id="searchResults" class="fp-results fp-scroll"></div>
      </div>
    </div>
    `;
  }

  function renderBreadcrumbs(route){
    const el = document.getElementById("breadcrumbs");
    if (!el) return;
    el.textContent = `SellerOS / ${route?.title || "—"}`;
  }

  function setActiveNav(routeId) {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      const active = btn.getAttribute("data-route") === routeId;
      btn.classList.toggle("bg-slate-100", active);
      btn.classList.toggle("dark:bg-slate-800", active);
    });
  }

  function renderRoute(routeId) {
    const route = routes.find(r => r.id === routeId) || routes[0];
    document.getElementById("pageTitle").textContent = route.title;
    renderBreadcrumbs(route);
    setActiveNav(route.id);

    const workspace = document.getElementById("workspace");
    if (!route.module || typeof route.module.render !== "function") {
      workspace.innerHTML = `
        <div class="max-w-3xl mx-auto fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border">
          <div class="text-lg font-semibold">Модуль не найден</div>
          <div class="text-sm text-slate-500 dark:text-slate-400 mt-1">Похоже, скрипт модуля не загрузился или был удалён.</div>
          <div class="text-xs text-slate-500 mt-3">routeId: <b>${route.id}</b></div>
        </div>
      `;
      toast("Не удалось загрузить модуль", "err");
      return;
    }

    workspace.innerHTML = route.module.render();

    try {
      if (typeof route.module.mount === "function") {
        route.module.mount(workspace);
      }
    } catch (e) {
      console.error(e);
      toast("Ошибка при инициализации модуля", "err");
    }

    // Pending actions (hotkeys etc.)
    try{
      const pending = window.FP.App && window.FP.App.pendingAction;
      if (pending && pending.type === "newOrder" && route.id === "orders") {
        window.FP.App.pendingAction = null;
        setTimeout(()=>{ document.getElementById("ordAdd")?.click(); }, 0);
      }
    }catch(e){}

    history.replaceState(null, "", `#${route.id}`);
  }

  window.FP.navigate = (routeId) => renderRoute(routeId);

  // ---------- Global Search (Ctrl+K) ----------
  function norm(s){ return String(s||"").toLowerCase().trim(); }

  function getOrdersArray(){
    const raw = Storage.get(Keys.ORDERS, []);
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.rows)) return raw.rows;
    if (raw && Array.isArray(raw.orders)) return raw.orders;
    return [];
  }

  function getInventoryItems(){
    // inventory v2 is a DB object with products
    const db = Storage.get(Keys.INVENTORY_V2, null);
    if (db && Array.isArray(db.products)) return db.products;
    // fallback to legacy
    const legacy = Storage.get(Keys.INVENTORY, []);
    return Array.isArray(legacy) ? legacy : [];
  }

  function buildSearchItems(){
    const items = [];

    // routes
    routes.forEach(r => items.push({
      type: "module",
      id: r.id,
      icon: r.icon,
      title: r.title,
      subtitle: "Открыть раздел",
      action: () => renderRoute(r.id)
    }));

    // inventory products
    getInventoryItems().forEach(p => {
      const title = p.name || p.title || p.sku || "Товар";
      const sku = p.sku ? `SKU: ${p.sku}` : "";
      const cat = p.category ? `Категория: ${p.category}` : (p.categoryId ? `Категория: ${p.categoryId}` : "");
      const subtitle = [sku, cat].filter(Boolean).join(" • ") || "Склад";
      items.push({
        type: "inventory",
        id: p.id || p.sku || title,
        icon: "📦",
        title,
        subtitle,
        action: () => {
          // push filter into Inventory view
          const st = Storage.get(Keys.UI_STATE, {}) || {};
          st.inventory = st.inventory || { tab: "products", q: "", cat: "", sort: "name" };
          st.inventory.tab = "products";
          st.inventory.q = title;
          Storage.set(Keys.UI_STATE, st);
          renderRoute("inventory");
        }
      });
    });

    // orders
    getOrdersArray().forEach(o => {
      const title = o.item || o.orderId || "Заказ";
      const subtitle = [o.platform, o.buyer, o.date].filter(Boolean).join(" • ") || "Учет заказов";
      items.push({
        type: "order",
        id: o.id || o.orderId || title,
        icon: "🧾",
        title,
        subtitle,
        action: () => {
          const st = Storage.get(Keys.UI_STATE, {}) || {};
          st.orders = st.orders || { q: "", status: "Все" };
          st.orders.q = o.orderId || title;
          Storage.set(Keys.UI_STATE, st);
          renderRoute("orders");
        }
      });
    });

    // notes
    const notes = Storage.get(Keys.NOTES, []);
    if (Array.isArray(notes)) {
      notes.forEach(n => {
        const title = (n.title || n.name || "Заметка").slice(0,80);
        const body = (n.text || n.body || "").replace(/\s+/g," ").slice(0,120);
        items.push({
          type: "note",
          id: n.id || title,
          icon: "📝",
          title,
          subtitle: body || "Заметки",
          action: () => renderRoute("notes")
        });
      });
    }

    // templates
    const tpls = Storage.get("fp_templates", Storage.get("selleros_templates_v1", []));
    if (Array.isArray(tpls)) {
      tpls.forEach(t => {
        const title = (t.title || t.name || "Шаблон").slice(0,80);
        const body = (t.text || t.body || "").replace(/\s+/g," ").slice(0,120);
        items.push({
          type: "template",
          id: t.id || title,
          icon: "📋",
          title,
          subtitle: body || "Шаблоны сообщений",
          action: () => renderRoute("templates")
        });
      });
    }

    return items;
  }

  function scoreItem(q, item){
    if (!q) return 1;
    const hay = norm(`${item.title} ${item.subtitle} ${item.type}`);
    if (!hay) return 0;
    if (hay.startsWith(q)) return 100;
    if (item.title && norm(item.title).startsWith(q)) return 90;
    if (hay.includes(` ${q}`)) return 70;
    if (hay.includes(q)) return 50;
    return 0;
  }

  function renderSearchResults(list, activeIdx){
    const box = document.getElementById("searchResults");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = `<div class="p-4 text-sm text-slate-500 dark:text-slate-400">Ничего не найдено. Попробуй другой запрос.</div>`;
      return;
    }
    box.innerHTML = list.map((it, idx) => `
      <div class="fp-result-item ${idx===activeIdx?"active":""}" data-idx="${idx}">
        <div class="fp-result-ico">${it.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <div class="fp-result-title truncate">${String(it.title||"")}</div>
            <span class="fp-chip">${it.type}</span>
          </div>
          <div class="fp-result-sub truncate">${String(it.subtitle||"")}</div>
        </div>
      </div>
    `).join("");
    box.querySelectorAll(".fp-result-item").forEach(el => {
      el.addEventListener("click", () => {
        const idx = Number(el.getAttribute("data-idx"));
        const it = list[idx];
        if (it && typeof it.action === "function") {
          closeSearch();
          it.action();
        }
      });
    });
  }

  function openSearch(prefill=""){
    const overlay = document.getElementById("searchOverlay");
    const input = document.getElementById("searchInput");
    if (!overlay || !input) return;
    overlay.classList.add("open");
    const all = buildSearchItems();

    let activeIdx = 0;
    let filtered = all;

    function update(){
      const q = norm(input.value);
      filtered = all
        .map(it => ({ it, s: scoreItem(q, it) }))
        .filter(x => x.s > 0)
        .sort((a,b)=>b.s-a.s)
        .slice(0, 24)
        .map(x=>x.it);
      if (activeIdx >= filtered.length) activeIdx = 0;
      renderSearchResults(filtered, activeIdx);
    }

    function onKey(e){
      if (e.key === "Escape") { e.preventDefault(); closeSearch(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx+1, Math.max(0, filtered.length-1)); renderSearchResults(filtered, activeIdx); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(0, activeIdx-1); renderSearchResults(filtered, activeIdx); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const it = filtered[activeIdx];
        if (it && typeof it.action === "function") {
          closeSearch();
          it.action();
        }
      }
    }

    input.value = prefill;
    setTimeout(()=>input.focus(), 0);
    update();

    input.addEventListener("input", update);
    input.addEventListener("keydown", onKey);
    overlay.addEventListener("mousedown", (e)=>{
      if (e.target === overlay) closeSearch();
    });

    // stash cleanup
    overlay.__cleanup = () => {
      input.removeEventListener("input", update);
      input.removeEventListener("keydown", onKey);
    };
  }

  function closeSearch(){
    const overlay = document.getElementById("searchOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    try{ overlay.__cleanup && overlay.__cleanup(); }catch(e){}
    overlay.__cleanup = null;
    const box = document.getElementById("searchResults");
    if (box) box.innerHTML = "";
  }

  function bindGlobalUI() {
    document.getElementById("toggleSidebar").addEventListener("click", () => {
      const collapsed = !Storage.get(Keys.SIDEBAR, false);
      Storage.set(Keys.SIDEBAR, collapsed);
      boot();
    });

    document.getElementById("themeToggle").addEventListener("click", () => {
      const current = Storage.get(Keys.THEME, "dark");
      const next = current === "dark" ? "light" : "dark";
      Storage.set(Keys.THEME, next);
      document.documentElement.setAttribute("data-theme", next);
      toast(`Тема: ${next}`, "ok");
    });

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => renderRoute(btn.getAttribute("data-route")));
    });

    // Favorites ⭐
    document.querySelectorAll("[data-fav]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-fav");
        toggleFav(id);
        boot();
        toast(isFav(id) ? "Добавлено в избранное" : "Удалено из избранного", "ok");
      });
    });

    // Global search
    document.getElementById("openSearch")?.addEventListener("click", () => openSearch());
    window.addEventListener("keydown", (e) => {
      const key = (e.key || "").toLowerCase();
      const isMac = navigator.platform && /mac/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      const typing = tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable);
      const anyOverlayOpen = !!document.querySelector(".fp-overlay.open") || !!document.querySelector("#ordModal:not(.hidden)");

      // Ctrl/⌘ + K — global search
      if (mod && key === "k") {
        e.preventDefault();
        openSearch();
        return;
      }

      // Hotkeys: ignore when typing or modal/overlay open
      if (typing || anyOverlayOpen || mod || e.altKey) return;

      if (key === "i") { e.preventDefault(); renderRoute("inventory"); return; }
      if (key === "f") { e.preventDefault(); renderRoute("finance"); return; }
      if (key === "n") {
        e.preventDefault();
        window.FP.App = window.FP.App || {};
        window.FP.App.pendingAction = { type: "newOrder" };
        renderRoute("orders");
        return;
      }
    });
    window.addEventListener("hashchange", () => {
      const routeId = location.hash.replace("#", "") || "profile";
      renderRoute(routeId);
    });
  }

  function boot() {
    ensureDefaults();
    document.getElementById("app").innerHTML = layout();
    bindGlobalUI();
    const routeId = location.hash.replace("#", "") || "profile";
    renderRoute(routeId);
  }


  boot();
})();
