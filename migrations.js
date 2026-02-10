(function(){
  window.FP = window.FP || {};
  const { Storage, Keys } = window.FP;

  const CURRENT_SCHEMA = 3;

  function readMeta(){
    return Storage.get(Keys.META, { schemaVersion: 0 }) || { schemaVersion: 0 };
  }

  function writeMeta(meta){
    Storage.set(Keys.META, meta);
  }

  // ---- Migrations ----
  function migrate_0_to_1(){
    // Ensure inventory v2 exists (convert legacy v1 array if present)
    const hasV2 = !!Storage.get(Keys.INVENTORY_V2, null);
    if (hasV2) return;

    const legacy = Storage.get(Keys.INVENTORY, null); // fp_inventory_v1
    if (!Array.isArray(legacy)) return;

    const products = legacy.map((p) => {
      const id = p.id || (typeof crypto !== "undefined" && crypto.randomUUID ? "P" + crypto.randomUUID() : "P" + Math.random().toString(16).slice(2));
      const variants = Array.isArray(p.variants) ? p.variants.map((v) => ({
        id: v.id || (typeof crypto !== "undefined" && crypto.randomUUID ? "V" + crypto.randomUUID() : "V" + Math.random().toString(16).slice(2)),
        name: v.name || "Основной",
        price: Number(v.price || p.price || 0),
        cost: Number(v.cost || p.cost || 0),
        qty: Number(v.qty || p.qty || 0),
        minQty: Number(v.minQty || p.minQty || 0)
      })) : [];
      return {
        id,
        title: p.title || p.name || "Товар",
        sku: p.sku || "",
        category: p.category || "Без категории",
        accounted: (p.accounted !== false),
        minQty: Number(p.minQty || 0),
        variants,
        createdAt: p.createdAt || Date.now(),
        updatedAt: Date.now()
      };
    });

    const db = {
      version: 2,
      products,
      categories: Array.from(new Set(products.map(p => p.category))).filter(Boolean),
      movements: [],
      warehouses: [{ id: "W_MAIN", name: "Основной" }]
    };

    Storage.set(Keys.INVENTORY_V2, db);
  }

  function migrate_1_to_2(){
    // Normalize orders storage to an array of rows
    const raw = Storage.get(Keys.ORDERS, null);
    if (!raw) return;
    if (Array.isArray(raw)) return;

    if (raw && Array.isArray(raw.rows)) {
      Storage.set(Keys.ORDERS, raw.rows);
      return;
    }
    if (raw && Array.isArray(raw.orders)) {
      Storage.set(Keys.ORDERS, raw.orders);
      return;
    }
  }

  function migrate_2_to_3(){
    // Ensure UI_STATE exists as an object (older builds might store string/null)
    const st = Storage.get(Keys.UI_STATE, null);
    if (st == null) return;
    if (typeof st !== "object" || Array.isArray(st)) {
      Storage.set(Keys.UI_STATE, {});
    }
  }

  function runMigrations(){
    const meta = readMeta();
    let v = Number(meta.schemaVersion || 0);

    try{
      if (v < 1) { migrate_0_to_1(); v = 1; }
      if (v < 2) { migrate_1_to_2(); v = 2; }
      if (v < 3) { migrate_2_to_3(); v = 3; }
    }catch(e){
      console.error("[migrations] failed", e);
    }

    meta.schemaVersion = Math.max(v, meta.schemaVersion || 0);
    meta.lastRunAt = Date.now();
    meta.appSchema = CURRENT_SCHEMA;
    writeMeta(meta);
  }

  window.FP.Migrations = {
    CURRENT_SCHEMA,
    run: runMigrations
  };

  // Run immediately on load (before app boot)
  runMigrations();
})();
