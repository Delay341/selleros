(function(){
  window.FP = window.FP || {};

  const { Storage, Keys } = window.FP;

  const STATUS = {
    WORK: "В работе",
    DONE: "Выполнено",
    PROBLEM: "Проблема",
    CANCEL: "Отменён"
  };
  const STATUS_OPTIONS = [STATUS.WORK, STATUS.DONE, STATUS.PROBLEM, STATUS.CANCEL];
  const PLATFORM_OPTIONS = ["FunPay", "Playerok", "Другое"];

  function normalizeStatus(s){
    const v = String(s || "").trim().toLowerCase();
    if (!v) return STATUS.WORK;
    if (["в работе","выполняется","in progress","processing"].includes(v)) return STATUS.WORK;
    if (["выполнено","выполнен","сделан","done","completed"].includes(v)) return STATUS.DONE;
    if (["проблема","спор","dispute","issue","problem"].includes(v)) return STATUS.PROBLEM;
    if (["отменён","отмена","cancel","canceled","cancelled"].includes(v)) return STATUS.CANCEL;
    return s;
  }

  function toNum(v){
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function todayISO(){
    const d = new Date();
    return d.toISOString().slice(0,10);
  }

  function isoToTs(iso){
    const s = String(iso||"").trim();
    if (!s) return Date.now();
    const ts = new Date(s + "T12:00:00").getTime();
    return Number.isFinite(ts) ? ts : Date.now();
  }

  function uid(){
    if (typeof crypto !== "undefined" && crypto.randomUUID) return "O" + crypto.randomUUID();
    return "O" + Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-4);
  }

  function loadFinanceSettings(){
    const key = Keys.FINANCE_SETTINGS || "selleros_finance_settings_v1";
    const def = {
      version: 1,
      commissionPct: {
        FunPay: 0,
        Playerok: 0,
        "Другое": 0
      }
    };
    try{
      const cur = Storage.get(key, null);
      if (cur && cur.version === 1) return cur;
      Storage.set(key, def);
      return def;
    }catch(e){
      return def;
    }
  }

  function saveFinanceSettings(s){
    const key = Keys.FINANCE_SETTINGS || "selleros_finance_settings_v1";
    try{ Storage.set(key, s); }catch(e){}
  }

  function getInventoryDB(){
    try { return Storage.get(Keys.INVENTORY_V2, null) || null; } catch (e) { return null; }
  }

  function findUnitCost(db, productId, variantId){
    if (!db || db.version !== 2) return 0;
    const p = (db.products||[]).find(x=>x.id===productId);
    if (!p) return 0;
    if (variantId){
      const v = (p.variants||[]).find(vv=>vv.id===variantId);
      if (v && Number.isFinite(Number(v.cost))) return Number(v.cost);
    }
    return Number.isFinite(Number(p.cost)) ? Number(p.cost) : 0;
  }

  function findUnitPrice(db, productId, variantId){
    if (!db || db.version !== 2) return 0;
    const p = (db.products||[]).find(x=>x.id===productId);
    if (!p) return 0;
    if (variantId){
      const v = (p.variants||[]).find(vv=>vv.id===variantId);
      if (v && Number.isFinite(Number(v.price))) return Number(v.price);
    }
    return Number.isFinite(Number(p.price)) ? Number(p.price) : 0;
  }

  function findItemName(db, productId, variantId){
    if (!db || db.version !== 2) return "";
    const p = (db.products||[]).find(x=>x.id===productId);
    if (!p) return "";
    if (variantId){
      const v = (p.variants||[]).find(vv=>vv.id===variantId);
      if (v && v.name) return `${p.name} — ${v.name}`;
    }
    return p.name || "";
  }

  function computeFromInventory(row){
    const inv = getInventoryDB();
    if (!inv) return row;
    const qty = Math.max(1, toNum(row.qty||1));
    const unitCost = findUnitCost(inv, row.productId, row.variantId);
    const unitPrice = findUnitPrice(inv, row.productId, row.variantId);
    const itemName = row.item || findItemName(inv, row.productId, row.variantId);
    return Object.assign({}, row, {
      qty,
      item: itemName,
      unitCost: Number.isFinite(Number(row.unitCost)) && Number(row.unitCost) ? Number(row.unitCost) : unitCost,
      unitPrice: Number.isFinite(Number(row.unitPrice)) && Number(row.unitPrice) ? Number(row.unitPrice) : unitPrice,
      cost: toNum(row.cost) || (unitCost * qty),
      revenue: toNum(row.revenue ?? row.sum) || (unitPrice * qty)
    });
  }

  function applyCommission(row, settings){
    const s = settings || loadFinanceSettings();
    const pct = toNum(s?.commissionPct?.[row.platform] ?? 0);
    const revenue = toNum(row.revenue);
    // If fee explicitly set (>0), keep it. Otherwise auto.
    const fee = toNum(row.fee);
    if (fee > 0) return row;
    return Object.assign({}, row, { fee: Math.round(revenue * pct) / 100 });
  }

  function normalizeOrder(o){
    const ts = toNum(o.ts) || isoToTs(o.date || o.dateISO || o.createdAt) || Date.now();
    const dateISO = (o.dateISO || o.date || "").slice(0,10) || new Date(ts).toISOString().slice(0,10);
    const base = {
      id: o.id || o.uid || o.orderId || uid(),
      ts,
      dateISO,
      platform: o.platform || o.market || "FunPay",
      orderId: o.orderId || o.extId || "",
      buyer: o.buyer || o.customer || o.user || "",
      status: normalizeStatus(o.status || STATUS.WORK),
      note: o.note || o.comment || "",
      // item linkage
      productId: o.productId || null,
      variantId: o.variantId || null,
      item: o.item || o.itemName || "",
      qty: Math.max(1, toNum(o.qty ?? o.count ?? 1) || 1),
      unitPrice: toNum(o.unitPrice),
      unitCost: toNum(o.unitCost),
      revenue: toNum(o.revenue ?? o.sum ?? o.total ?? o.price),
      fee: toNum(o.fee ?? o.commission),
      cost: toNum(o.cost ?? o.cogs)
    };

    const withInv = computeFromInventory(base);
    const withFee = applyCommission(withInv);
    return withFee;
  }

  window.FP.OrderModel = {
    STATUS,
    STATUS_OPTIONS,
    PLATFORM_OPTIONS,
    normalizeStatus,
    normalizeOrder,
    loadFinanceSettings,
    saveFinanceSettings,
    getInventoryDB,
    findUnitCost,
    findUnitPrice,
    findItemName,
    toNum,
    todayISO,
    isoToTs
  };
})();
