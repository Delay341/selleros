(function(){
  // Ensure global namespace
  window.FP = window.FP || {};

  const Storage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    del(key) { localStorage.removeItem(key); },
    uid(prefix = "id") {
      // Prefer collision-resistant ids when available
      if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
      return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  };

  const Keys = {
    USER: "fp_user",
    THEME: "fp_theme",
    ACCENT: "fp_accent",
    DENSITY: "fp_density",
    CUSTOM: "selleros_custom_v1",
    SIDEBAR: "fp_sidebar_collapsed",
    NOTES: "fp_notes",
    // Versioned key to allow future schema changes + migrations
    INVENTORY: "fp_inventory_v1",
    INVENTORY_V2: "fp_inventory_v2",

    // Orders data is shared between Orders + Finance
    ORDERS: "selleros_orders_v3_6",

    // Finance settings (commission presets, etc.)
    FINANCE_SETTINGS: "selleros_finance_settings_v1",

    // UI state (filters, last opened tab, etc.)
    UI_STATE: "selleros_ui_state_v1",

    // Pinned / favorite modules in sidebar
    FAVORITES: "selleros_favorites_v1",

    // App meta (schema version, migrations)
    META: "selleros_meta_v1"
  };

  // ---- Unified UI state helpers (single source of truth) ----
  // Stored under Keys.UI_STATE as a nested object.
  function getPath(obj, path){
    if (!path) return obj;
    const parts = String(path).split(".").filter(Boolean);
    let cur = obj;
    for (const p of parts){
      if (!cur || typeof cur !== "object") return undefined;
      cur = cur[p];
    }
    return cur;
  }
  function setPath(obj, path, value){
    const parts = String(path).split(".").filter(Boolean);
    if (!parts.length) return value;
    let cur = obj;
    for (let i=0;i<parts.length-1;i++){
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length-1]] = value;
    return obj;
  }
  function delPath(obj, path){
    const parts = String(path).split(".").filter(Boolean);
    if (!parts.length) return {};
    let cur = obj;
    for (let i=0;i<parts.length-1;i++){
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object") return obj;
      cur = cur[p];
    }
    delete cur[parts[parts.length-1]];
    return obj;
  }

  const State = {
    get(path, fallback=null){
      const st = Storage.get(Keys.UI_STATE, {}) || {};
      const v = getPath(st, path);
      return (v === undefined) ? fallback : v;
    },
    set(path, value){
      const st = Storage.get(Keys.UI_STATE, {}) || {};
      const next = setPath(st, path, value);
      Storage.set(Keys.UI_STATE, next);
    },
    del(path){
      const st = Storage.get(Keys.UI_STATE, {}) || {};
      const next = delPath(st, path);
      Storage.set(Keys.UI_STATE, next);
    },
    reset(){ Storage.del(Keys.UI_STATE); }
  };

  // Helper: list all app-owned localStorage keys
  function listAppKeys(){
    const keys = [];
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("fp_") || k.startsWith("selleros_")) keys.push(k);
    }
    return keys.sort();
  }

  window.FP.Storage = Storage;
  window.FP.Keys = Keys;
  window.FP.State = State;
  window.FP.listAppKeys = listAppKeys;
})();