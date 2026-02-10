(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};
  const { Storage, Keys } = window.FP;
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);
  const escapeHtml = typeof ui.escapeHtml === "function" ? ui.escapeHtml : (s) => String(s ?? "");
  const fmtMoney = typeof ui.fmtMoney === "function" ? ui.fmtMoney : (n) => String(n ?? 0);

  // Inventory v2 (local-only)
  const DEFAULT = {
    version: 2,
    warehouses: [{ id: "wh_main", name: "Основной склад", location: "", note: "" }],
    categories: ["Подписчики", "Лайки", "Просмотры", "Другое"],
    products: [
      { id: "p_demo", name: "Подписчики Telegram (demo)", sku: "TG-SUB", category: "Подписчики", unit: "шт", price: 100, cost: 60, track: true, minQty: 100, variants: [] }
    ],
    stock: [{ id: "st_demo", warehouseId: "wh_main", productId: "p_demo", variantId: null, qty: 1000 }],
    movements: []
  };

  function uid(prefix="id"){ return (Storage && Storage.uid) ? Storage.uid(prefix) : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }

  function load(){
    const v2 = Storage.get(Keys.INVENTORY_V2, null);
    if (v2 && v2.version === 2) return v2;
    // migrate v1 (best effort)
    const v1 = Storage.get(Keys.INVENTORY, []);
    const migrated = JSON.parse(JSON.stringify(DEFAULT));
    if (Array.isArray(v1) && v1.length){
      migrated.products = v1.map((it, idx) => ({
        id: uid("p"),
        name: it.name || `Товар ${idx+1}`,
        sku: it.sku || (it.name ? it.name.slice(0,12).toUpperCase().replace(/\s+/g,"-") : `SKU-${idx+1}`),
        category: it.category || "Другое",
        unit: it.unit || "шт",
        price: Number(it.price || 0),
        cost: Number(it.cost || 0),
        track: true,
        minQty: 0,
        variants: []
      }));
      migrated.stock = migrated.products.map(p => ({
        id: uid("st"),
        warehouseId: "wh_main",
        productId: p.id,
        variantId: null,
        qty: Number((v1.find(x => (x.name||"") === p.name)?.qty) || 0)
      }));
    }
    Storage.set(Keys.INVENTORY_V2, migrated);
    return migrated;
  }
  function save(db){ Storage.set(Keys.INVENTORY_V2, db); }

  // local-only adapters (kept for minimal refactor)
  async function fetchDB(){ return load(); }
  async function persistDB(db){ save(db); return true; }

  // --- Selectors ---
  function getWarehouse(db, id){ return db.warehouses.find(w => w.id === id); }
  function getProduct(db, id){ return db.products.find(p => p.id === id); }
  function getVariant(product, id){ return (product.variants||[]).find(v => v.id === id); }

  function stockKey(warehouseId, productId, variantId){ return `${warehouseId}::${productId}::${variantId||""}`; }
  function indexStock(db){
    const map = new Map();
    (db.stock||[]).forEach(s => map.set(stockKey(s.warehouseId,s.productId,s.variantId), s));
    return map;
  }
  function ensureStockRow(db, warehouseId, productId, variantId){
    const map = indexStock(db);
    const k = stockKey(warehouseId, productId, variantId);
    if (map.has(k)) return map.get(k);
    const row = { id: uid("st"), warehouseId, productId, variantId: variantId||null, qty: 0 };
    db.stock.push(row);
    return row;
  }

  function badge(label, tone){
    const tones = {
      ok: "background: rgba(16,185,129,.15); color: rgb(16,185,129); border: 1px solid rgba(16,185,129,.35);",
      warn:"background: rgba(245,158,11,.15); color: rgb(245,158,11); border: 1px solid rgba(245,158,11,.35);",
      bad: "background: rgba(239,68,68,.15); color: rgb(239,68,68); border: 1px solid rgba(239,68,68,.35);",
      neutral:"background: rgba(148,163,184,.15); color: rgb(148,163,184); border: 1px solid rgba(148,163,184,.35);"
    };
    return `<span class="fp-badge" style="${tones[tone]||tones.neutral}">${escapeHtml(label)}</span>`;
  }

  function render(){
    return `
      <div class="max-w-6xl mx-auto space-y-4">
        <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div class="text-lg font-semibold">Склад</div>
              <div class="text-xs text-slate-500">Гибкая система: товары, склады, остатки, движения.</div>
            </div>
            <div class="flex gap-2 flex-wrap">
              <button id="invExport" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Экспорт JSON</button>
              <button id="invImport" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Импорт JSON</button>
              <button id="invReset" class="px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300">Сброс (demo)</button>
            </div>
          </div>

          <div class="mt-4 flex gap-2 flex-wrap">
            <button data-tab="products" class="inv-tab px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Товары</button>
            <button data-tab="warehouses" class="inv-tab px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Склады</button>
            <button data-tab="stock" class="inv-tab px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Остатки</button>
            <button data-tab="moves" class="inv-tab px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Движения</button>
          </div>
        </div>

        <div id="invBody"></div>
      </div>
    `;
  }

  function mount(){
    const host = document.getElementById("moduleRoot");
    if (!host) return;

    host.innerHTML = render();

    const State = window.FP.State;
    let invState = State ? State.get("inventory", { tab: "products", q: "", cat: "", sort: "name" }) : null;
    if (!invState) {
      const state = Storage.get(Keys.UI_STATE, {});
      state.inventory = state.inventory || { tab: "products", q: "", cat: "", sort: "name" };
      invState = state.inventory;
    }

    const tabs = Array.from(document.querySelectorAll(".inv-tab"));
    function setActive(tab){
      invState.tab = tab;
      if (State) State.set("inventory", invState);
      else {
        const state = Storage.get(Keys.UI_STATE, {});
        state.inventory = invState;
        Storage.set(Keys.UI_STATE, state);
      }
      tabs.forEach(b => {
        const on = b.dataset.tab === tab;
        b.style.background = on ? "rgba(148,163,184,.12)" : "";
      });
      draw();
    }

    tabs.forEach(b => b.addEventListener("click", () => setActive(b.dataset.tab)));

    document.getElementById("invExport").addEventListener("click", async () => {
      const db = await fetchDB();
      const blob = new Blob([JSON.stringify(db, null, 2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "selleros_inventory_v2.json";
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 500);
    });

    document.getElementById("invImport").addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try{
          const text = await file.text();
          const obj = JSON.parse(text);
          if (!obj || obj.version !== 2) throw new Error("Неверная версия");
          await persistDB(obj);
          toast("Импорт выполнен", "ok");
          draw();
        }catch(e){
          toast("Не удалось импортировать JSON", "info");
        }
      };
      input.click();
    });

    document.getElementById("invReset").addEventListener("click", async () => {
      const ok = ui.confirm ? await ui.confirm({ title: "Сброс склада", message: "Вы уверены? Все данные склада будут заменены demo-данными.", okText: "Сбросить", cancelText: "Отмена", danger: true }) : confirm("Сбросить склад?");
      if (!ok) return;
      await persistDB(JSON.parse(JSON.stringify(DEFAULT)));
      toast("Склад сброшен на demo-данные", "ok");
      draw();
    });

function readView(){
      if (State) invState = State.get("inventory", invState) || invState;
      return invState;
    }

    async function draw(){
      const body = document.getElementById("invBody");
      const db = await fetchDB();
      const view = readView();
      const tab = view?.tab || "products";
      if (tab === "products") body.innerHTML = renderProducts(db, view);
      if (tab === "warehouses") body.innerHTML = renderWarehouses(db);
      if (tab === "stock") body.innerHTML = renderStock(db, view);
      if (tab === "moves") body.innerHTML = renderMoves(db, view);

      bindTab(tab, db);
    }

    


function renderProducts(db, view){
  const cats = db.categories || [];
  const q = String(view?.q || "").trim().toLowerCase();
  const cat = String(view?.cat || "");
  const sort = String(view?.sort || "name");
  const selSet = new Set((view?.sel||[]).map(String));

  const map = indexStock(db);
  const whs = (db.warehouses||[]);

  function sumQtyFor(productId, variantId){
    let total = 0;
    for (const w of whs){
      const k = stockKey(w.id, productId, variantId);
      const row = map.get(k);
      total += Number(row?.qty || 0);
    }
    return total;
  }

  const filtered = (db.products||[]).filter(p => {
    const hay = `${p.name||""} ${p.sku||""}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (cat && (p.category||"") !== cat) return false;
    return true;
  });

  filtered.sort((a,b)=>{
    if (sort === "price") return Number(b.price||0) - Number(a.price||0);
    if (sort === "cost") return Number(b.cost||0) - Number(a.cost||0);
    if (sort === "qty") {
      const aq = (a.track? getProductTotalQty(a) : 0);
      const bq = (b.track? getProductTotalQty(b) : 0);
      return bq - aq;
    }
    return String(a.name||"").localeCompare(String(b.name||""), "ru");
  });

  function getProductTotalQty(p){
    if (!p.track) return 0;
    const vars = (p.variants||[]);
    if (vars.length){
      return vars.reduce((acc,v)=> acc + sumQtyFor(p.id, v.id), 0);
    }
    return sumQtyFor(p.id, null);
  }

  function getLowState(p){
    if (!p.track) return { tone: "neutral", label: "—" };
    const qty = getProductTotalQty(p);
    const min = Number(p.minQty || 0);
    if (!min) return { tone: "neutral", label: String(qty) };
    if (qty <= 0) return { tone: "bad", label: `${qty} / min ${min}` };
    if (qty <= min) return { tone: "warn", label: `${qty} / min ${min}` };
    return { tone: "ok", label: String(qty) };
  }

  const selectedCount = selSet.size;

  let rows = filtered.map(p => {
    const variantsCount = (p.variants||[]).length;
    const variantsBadge = variantsCount ? badge(`Вариантов: ${variantsCount}`, "neutral") : badge("Без вариантов", "neutral");
    const stockBadge = p.track ? (()=>{ const s=getLowState(p); return badge(s.label, s.tone); })() : badge("Не учитывается", "neutral");
    const checked = selSet.has(String(p.id));
    return `
      <tr class="border-t border-slate-200 dark:border-slate-800 ${checked?"bg-slate-50/60 dark:bg-slate-900/30":""}">
        <td class="py-3 pr-3 w-10"><input class="inv-sel" type="checkbox" data-id="${p.id}" ${checked?"checked":""}/></td>
        <td class="py-3 pr-3">
          <div class="font-semibold">${escapeHtml(p.name)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(p.sku || "")} • ${escapeHtml(p.category || "")}</div>
        </td>
        <td class="py-3 pr-3">${escapeHtml(p.unit || "шт")}</td>
        <td class="py-3 pr-3">${fmtMoney(p.price || 0)}</td>
        <td class="py-3 pr-3">${fmtMoney(p.cost || 0)}</td>
        <td class="py-3 pr-3">${p.track ? badge("Учет", "ok") : badge("Без учета", "neutral")}</td>
        <td class="py-3 pr-3">${stockBadge}</td>
        <td class="py-3 pr-3">${variantsBadge}</td>
        <td class="py-3 text-right">
          <button class="inv-edit px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" data-id="${p.id}">Изменить</button>
          <button class="inv-variants ml-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" data-id="${p.id}">Варианты</button>
          <button class="inv-del ml-2 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300" data-id="${p.id}">Удалить</button>
        </td>
      </tr>
    `;
  }).join("");

  if (!filtered.length) {
    const es = (ui.emptyState ? ui.emptyState({
      icon: "📦",
      title: "Склад пока пустой",
      desc: "Добавь первый товар — потом можно привязывать его к заказам и списывать остатки автоматически.",
      actionLabel: "+ Товар",
      actionId: "invEmptyAdd"
    }) : '<div class="p-4 text-sm text-slate-500">Пока нет товаров.</div>');
    rows = `<tr><td colspan="9" class="p-4">${es}</td></tr>`;
  }

  const bulkBar = selectedCount ? `
    <div class="mt-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/20 flex items-center justify-between flex-wrap gap-2">
      <div class="text-sm">Выбрано: <b>${selectedCount}</b></div>
      <div class="flex gap-2 flex-wrap items-center">
        <button id="invBulkDel" class="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">Удалить</button>
        <select id="invBulkCat" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm">
          <option value="">Категория…</option>
          ${cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
        <button id="invBulkApplyCat" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Применить</button>
        <input id="invBulkMin" type="number" step="1" class="w-36 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" placeholder="min остаток"/>
        <button id="invBulkApplyMin" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Применить</button>
        <button id="invBulkClear" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Снять выделение</button>
      </div>
    </div>
  ` : '';

  return `
    <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex gap-2 flex-wrap items-center">
          <input id="invQ" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" placeholder="Поиск по названию / SKU" value="${escapeHtml(view?.q||"")}" />
          <select id="invCat" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm">
            <option value="">Все категории</option>
            ${cats.map(c=>`<option value="${escapeHtml(c)}" ${String(view?.cat||"")===String(c)?"selected":""}>${escapeHtml(c)}</option>`).join('')}
          </select>
          <select id="invSort" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm">
            <option value="name" ${sort==="name"?"selected":""}>Сортировка: имя</option>
            <option value="price" ${sort==="price"?"selected":""}>Сортировка: цена ↓</option>
            <option value="cost" ${sort==="cost"?"selected":""}>Сортировка: себестоимость ↓</option>
            <option value="qty" ${sort==="qty"?"selected":""}>Сортировка: остаток ↓</option>
          </select>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button id="invCats" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Категории</button>
          <button id="invAddProduct" class="px-4 py-2 rounded-xl fp-btn-primary">+ Товар</button>
        </div>
      </div>

      ${bulkBar}

      <div class="text-xs text-slate-500 mt-3">Показано: <b>${filtered.length}</b></div>

      <div class="mt-4 overflow-x-auto fp-scroll">
        <table class="w-full text-sm fp-table">
          <thead class="text-slate-500">
            <tr>
              <th class="text-left py-2 pr-3 w-10"><input id="invSelAll" type="checkbox" ${filtered.length && selectedCount===filtered.length?"checked":""}/></th>
              <th class="text-left py-2 pr-3">Товар</th>
              <th class="text-left py-2 pr-3">Ед.</th>
              <th class="text-left py-2 pr-3">Цена</th>
              <th class="text-left py-2 pr-3">Себестоимость</th>
              <th class="text-left py-2 pr-3">Учет</th>
              <th class="text-left py-2 pr-3">Остаток</th>
              <th class="text-left py-2 pr-3">Варианты</th>
              <th class="text-right py-2">Действия</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td class="py-6 text-slate-500" colspan="9">Нет товаров</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderWarehouses(db){
      const rows = (db.warehouses||[]).map(w => `
        <tr class="border-t border-slate-200 dark:border-slate-800">
          <td class="py-3 pr-3">
            <div class="font-semibold">${escapeHtml(w.name)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(w.location || "")}</div>
          </td>
          <td class="py-3 pr-3">${escapeHtml(w.note || "")}</td>
          <td class="py-3 text-right">
            <button class="wh-edit px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" data-id="${w.id}">Изменить</button>
            <button class="wh-del ml-2 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300" data-id="${w.id}">Удалить</button>
          </td>
        </tr>
      `).join("");

      return `
        <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="text-lg font-semibold">Склады</div>
            <button id="whAdd" class="px-4 py-2 rounded-xl fp-btn-primary">+ Добавить склад</button>
          </div>

          <div class="mt-4 overflow-x-auto fp-scroll">
            <table class="w-full text-sm fp-table">
              <thead class="text-slate-500">
                <tr>
                  <th class="text-left py-2 pr-3">Склад</th>
                  <th class="text-left py-2 pr-3">Заметка</th>
                  <th class="text-right py-2">Действия</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td class="py-6 text-slate-500" colspan="3">Нет складов</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    
function renderStock(db, view){
  const whs = db.warehouses||[];
  const products = db.products||[];
  const map = indexStock(db);

  const selectedWh = (view && view.stockWh) ? String(view.stockWh) : (whs[0]?.id || 'wh_main');
  const q = String(view?.stockQ || '').trim().toLowerCase();
  const lowOnly = !!view?.stockLowOnly;

  const whSel = whs.map(w => `<option value="${w.id}" ${String(w.id)===String(selectedWh)?"selected":""}>${escapeHtml(w.name)}</option>`).join("");

  function rowQty(productId, variantId){
    const k = stockKey(selectedWh, productId, variantId);
    return Number(map.get(k)?.qty || 0);
  }

  function minFor(p, v){
    const min = Number((v && v.minQty != null) ? v.minQty : (p.minQty||0));
    return isFinite(min) ? min : 0;
  }

  const rows = products.flatMap(p => {
    const variants = (p.variants||[]).length ? (p.variants||[]) : [ { id:null, name:"—", sku:"" } ];
    return variants.map(v => {
      const title = `${p.name||""}${v.id ? ` • ${v.name}` : ""}`;
      const hay = `${p.name||""} ${p.sku||""} ${v.name||""} ${v.sku||""}`.toLowerCase();
      if (q && !hay.includes(q)) return '';
      const qty = rowQty(p.id, v.id);
      const min = p.track ? minFor(p, v) : 0;
      const isLow = p.track && min > 0 && qty <= min;
      if (lowOnly && !isLow) return '';
      const tone = !p.track ? 'neutral' : (min>0 ? (qty<=0 ? 'bad' : (qty<=min ? 'warn' : 'ok')) : 'neutral');
      const badgeText = !p.track ? 'Не учитывается' : (min>0 ? `${qty} / min ${min}` : String(qty));
      return `
        <tr class="border-t border-slate-200 dark:border-slate-800 ${isLow?"bg-amber-50/60 dark:bg-amber-950/20":""}">
          <td class="py-3 pr-3">
            <div class="font-semibold">${escapeHtml(p.name)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(p.sku||"")}${v.id ? ` • ${escapeHtml(v.name)}` : ""}</div>
          </td>
          <td class="py-3 pr-3">${escapeHtml(p.unit || 'шт')}</td>
          <td class="py-3 pr-3">${badge(badgeText, tone)}</td>
          <td class="py-3 pr-3">
            <input class="st-qty w-28 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" type="number" step="1" value="${Number(qty||0)}"
              data-warehouse="${escapeHtml(selectedWh)}" data-product="${escapeHtml(p.id)}" data-variant="${escapeHtml(v.id||"")}" />
          </td>
          <td class="py-3 text-right">
            <button class="st-save px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" data-product="${p.id}" data-variant="${v.id||""}">Сохранить</button>
          </td>
        </tr>
      `;
    }).filter(Boolean);
  }).join('');

  return `
    <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div class="text-lg font-semibold">Остатки</div>
          <div class="text-xs text-slate-500">Редактирование остатков по складу + подсветка низких остатков.</div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <div class="text-sm text-slate-500">Склад:</div>
          <select id="stWarehouse" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">${whSel}</select>
          <input id="stQ" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" placeholder="Поиск…" value="${escapeHtml(view?.stockQ||"")}" />
          <label class="flex items-center gap-2 text-sm text-slate-500 select-none">
            <input id="stLow" type="checkbox" ${lowOnly?"checked":""}/>
            Только низкий остаток
          </label>
        </div>
      </div>

      <div class="mt-4 overflow-x-auto fp-scroll">
        <table class="w-full text-sm fp-table">
          <thead class="text-slate-500">
            <tr>
              <th class="text-left py-2 pr-3">Товар</th>
              <th class="text-left py-2 pr-3">Ед.</th>
              <th class="text-left py-2 pr-3">Статус</th>
              <th class="text-left py-2 pr-3">Остаток</th>
              <th class="text-right py-2">Действия</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td class="py-6 text-slate-500" colspan="5">Нет данных</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMoves(db, view){
      const whs = db.warehouses||[];
      const products = db.products||[];

      const whOpt = whs.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
      const pOpt = products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

      const rows = (db.movements||[]).slice().reverse().slice(0,200).map(mv => {
        const wFrom = mv.fromWarehouseId ? (getWarehouse(db, mv.fromWarehouseId)?.name || mv.fromWarehouseId) : "—";
        const wTo   = mv.toWarehouseId ? (getWarehouse(db, mv.toWarehouseId)?.name || mv.toWarehouseId) : "—";
        const p = getProduct(db, mv.productId);
        const v = p ? getVariant(p, mv.variantId) : null;
        const title = p ? p.name : mv.productId;
        const varLabel = v ? ` • ${v.name}` : "";
        const dt = new Date(mv.ts || Date.now());
        const when = isFinite(dt.getTime()) ? dt.toLocaleString() : "";
        const typeMap = { in:"Приход", out:"Расход", adjust:"Корректировка", transfer:"Перемещение", order:"Заказ" };
        const badgeTone = mv.type === "in" ? "ok" : (mv.type === "out" ? "warn" : (mv.type === "transfer" ? "neutral" : "neutral"));
        return `
          <tr class="border-t border-slate-200 dark:border-slate-800">
            <td class="py-3 pr-3">${badge(typeMap[mv.type] || mv.type, badgeTone)}</td>
            <td class="py-3 pr-3">
              <div class="font-semibold">${escapeHtml(title)}${escapeHtml(varLabel)}</div>
              <div class="text-xs text-slate-500">${escapeHtml(mv.comment||"")}</div>
            </td>
            <td class="py-3 pr-3">${escapeHtml(wFrom)} → ${escapeHtml(wTo)}</td>
            <td class="py-3 pr-3">${escapeHtml(String((mv.qty ?? ((mv.delta!=null)?Math.abs(mv.delta):0)) || 0))}</td>
            <td class="py-3 pr-3 text-xs text-slate-500">${escapeHtml(when)}</td>
          </tr>
        `;
      }).join("");

      return `
        <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="text-lg font-semibold">Движения</div>
              <div class="text-xs text-slate-500">Приход/расход/перемещение/корректировка. Лог хранится и пригодится для бухгалтерии.</div>
            </div>
          </div>

          <div class="mt-4 grid md:grid-cols-4 gap-3">
            <select id="mvType" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
              <option value="in">Приход</option>
              <option value="out">Расход</option>
              <option value="transfer">Перемещение</option>
              <option value="adjust">Корректировка</option>
            </select>

            <select id="mvProduct" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">${pOpt}</select>

            <input id="mvQty" type="number" step="1" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="Кол-во" value="1"/>

            <button id="mvAdd" class="px-4 py-2 rounded-xl fp-btn-primary">Добавить</button>

            <select id="mvFrom" class="md:col-span-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">${whOpt}</select>
            <select id="mvTo" class="md:col-span-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">${whOpt}</select>

            <input id="mvComment" class="md:col-span-4 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="Комментарий / ссылка на заказ / причина"/>
          </div>

          <div class="mt-4 overflow-x-auto fp-scroll">
            <table class="w-full text-sm fp-table">
              <thead class="text-slate-500">
                <tr>
                  <th class="text-left py-2 pr-3">Тип</th>
                  <th class="text-left py-2 pr-3">Товар</th>
                  <th class="text-left py-2 pr-3">Откуда → Куда</th>
                  <th class="text-left py-2 pr-3">Кол-во</th>
                  <th class="text-left py-2 pr-3">Время</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td class="py-6 text-slate-500" colspan="5">Пока нет движений</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    function modal(title, bodyHtml, actionsHtml){
      const wrap = document.createElement("div");
      wrap.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4";
      wrap.innerHTML = `
        <div class="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#0d162a] border border-slate-200 dark:border-slate-800 shadow-xl">
          <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div class="font-semibold">${escapeHtml(title)}</div>
            <button class="inv-close px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">✕</button>
          </div>
          <div class="p-4">${bodyHtml}</div>
          <div class="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">${actionsHtml || ""}</div>
        </div>
      `;
      wrap.querySelector(".inv-close").addEventListener("click", () => wrap.remove());
      wrap.addEventListener("click", (e)=>{ if (e.target === wrap) wrap.remove(); });
      document.body.appendChild(wrap);
      return wrap;
    }

    function bindTab(tab, db){
      if (tab === "products"){
        const addBtn = document.getElementById("invAddProduct");
        const catsBtn = document.getElementById("invCats");
        const qInp = document.getElementById("invQ");
        const catSel = document.getElementById("invCat");
        const sortSel = document.getElementById("invSort");
        addBtn && addBtn.addEventListener("click", () => openProductModal(db, null));
        document.getElementById("invEmptyAdd")?.addEventListener("click", () => openProductModal(db, null));
        catsBtn && catsBtn.addEventListener("click", () => openCatsModal(db));

        // unified per-module UI state
        invState = invState || { tab: "products", q: "", cat: "", sort: "name" };
        invState.sel = Array.isArray(invState.sel) ? invState.sel : [];
        const saveView = () => {
          if (State) State.set("inventory", invState);
          else {
            const s = Storage.get(Keys.UI_STATE, {});
            s.inventory = invState;
            Storage.set(Keys.UI_STATE, s);
          }
        };

        let t;
        qInp && qInp.addEventListener("input", () => {
          clearTimeout(t);
          t = setTimeout(() => {
            invState.q = qInp.value;
            saveView();
            draw();
          }, 150);
        });
        catSel && catSel.addEventListener("change", () => {
          invState.cat = catSel.value;
          saveView();
          draw();
        });
        sortSel && sortSel.addEventListener("change", () => {
          invState.sort = sortSel.value;
          saveView();
          draw();
        });

        // selection + bulk actions
        const selAll = document.getElementById("invSelAll");
        selAll && selAll.addEventListener("change", () => {
          const checked = !!selAll.checked;
          const ids = Array.from(document.querySelectorAll(".inv-sel")).map(x => x.dataset.id);
          invState.sel = checked ? Array.from(new Set([...(invState.sel||[]), ...ids])) : (invState.sel||[]).filter(id => !ids.includes(String(id)));
          saveView();
          draw();
        });

        document.querySelectorAll(".inv-sel").forEach(ch => ch.addEventListener("change", () => {
          const id = String(ch.dataset.id);
          const cur = new Set((invState.sel||[]).map(String));
          if (ch.checked) cur.add(id); else cur.delete(id);
          invState.sel = Array.from(cur);
          saveView();
          draw();
        }));

        document.getElementById("invBulkClear")?.addEventListener("click", () => {
          invState.sel = [];
          saveView();
          draw();
        });

        document.getElementById("invBulkApplyCat")?.addEventListener("click", async () => {
          const catVal = document.getElementById("invBulkCat")?.value || "";
          if (!catVal){ toast("Выбери категорию", "info"); return; }
          const set = new Set((invState.sel||[]).map(String));
          db.products = (db.products||[]).map(p => set.has(String(p.id)) ? { ...p, category: catVal } : p);
          await persistDB(db);
          toast("Категория применена", "ok");
          draw();
        });

        document.getElementById("invBulkApplyMin")?.addEventListener("click", async () => {
          const minVal = Number(document.getElementById("invBulkMin")?.value || 0);
          if (!isFinite(minVal) || minVal < 0){ toast("Неверный min остаток", "info"); return; }
          const set = new Set((invState.sel||[]).map(String));
          db.products = (db.products||[]).map(p => set.has(String(p.id)) ? { ...p, minQty: Math.floor(minVal) } : p);
          await persistDB(db);
          toast("Min остаток применен", "ok");
          draw();
        });

        document.getElementById("invBulkDel")?.addEventListener("click", async () => {
          const set = new Set((invState.sel||[]).map(String));
          if (!set.size) return;
          const ok = ui.confirm ? await ui.confirm({ title: "Удалить товары", message: `Удалить выбранные товары: ${set.size}?`, okText: "Удалить", cancelText: "Отмена" }) : confirm(`Удалить выбранные товары: ${set.size}?`);
          if (!ok) return;
          db.products = (db.products||[]).filter(p => !set.has(String(p.id)));
          db.stock = (db.stock||[]).filter(s => !set.has(String(s.productId)));
          db.movements = (db.movements||[]).filter(m => !set.has(String(m.productId)));
          invState.sel = [];
          saveView();
          await persistDB(db);
          toast("Товары удалены", "ok");
          draw();
        });

        document.querySelectorAll(".inv-edit").forEach(b => b.addEventListener("click", () => openProductModal(db, b.dataset.id)));
        document.querySelectorAll(".inv-del").forEach(b => b.addEventListener("click", async () => {
          const id = b.dataset.id;
          const ok = ui.confirm ? await ui.confirm({ title: "Удалить товар", message: "Товар будет удалён вместе с остатками и движениями. Продолжить?", okText: "Удалить", cancelText: "Отмена" }) : confirm("Удалить товар?");
          if (!ok) return;
          db.products = (db.products||[]).filter(p => p.id !== id);
          db.stock = (db.stock||[]).filter(s => s.productId !== id);
          db.movements = (db.movements||[]).filter(m => m.productId !== id);
          await persistDB(db);
          toast("Товар удалён", "ok");
          draw();
        }));
        document.querySelectorAll(".inv-variants").forEach(b => b.addEventListener("click", () => openVariantsModal(db, b.dataset.id)));
      }

      if (tab === "warehouses"){
        document.getElementById("whAdd")?.addEventListener("click", () => openWarehouseModal(db, null));
        document.querySelectorAll(".wh-edit").forEach(b => b.addEventListener("click", () => openWarehouseModal(db, b.dataset.id)));
        document.querySelectorAll(".wh-del").forEach(b => b.addEventListener("click", async () => {
          const id=b.dataset.id;
          const ok = ui.confirm ? await ui.confirm({ title: "Удалить склад", message: "Склад будет удалён вместе с остатками/движениями, привязанными к нему. Продолжить?", okText: "Удалить", cancelText: "Отмена" }) : confirm("Удалить склад?");
          if (!ok) return;
          if ((db.warehouses||[]).length <= 1){ toast("Должен остаться хотя бы 1 склад", "info"); return; }
          db.warehouses = db.warehouses.filter(w => w.id !== id);
          db.stock = db.stock.filter(s => s.warehouseId !== id);
          db.movements = db.movements.filter(m => m.fromWarehouseId !== id && m.toWarehouseId !== id);
          await persistDB(db);
          toast("Склад удалён", "ok");
          draw();
        }));
      }

      if (tab === "stock"){        const sel = document.getElementById("stWarehouse");
        const qInp = document.getElementById("stQ");
        const lowChk = document.getElementById("stLow");

        invState = invState || { tab: "products", q: "", cat: "", sort: "name" };
        if (!invState.stockWh) invState.stockWh = "wh_main";
        if (invState.stockQ == null) invState.stockQ = "";
        if (invState.stockLowOnly == null) invState.stockLowOnly = false;
        const saveStockView = () => {
          if (State) State.set("inventory", invState);
          else {
            const s = Storage.get(Keys.UI_STATE, {});
            s.inventory = invState;
            Storage.set(Keys.UI_STATE, s);
          }
        };

        sel?.addEventListener("change", () => {
          invState.stockWh = sel.value;
          saveStockView();
          draw();
        });

        let tt;
        qInp?.addEventListener("input", () => {
          clearTimeout(tt);
          tt = setTimeout(() => {
            invState.stockQ = qInp.value;
            saveStockView();
            draw();
          }, 150);
        });

        lowChk?.addEventListener("change", () => {
          invState.stockLowOnly = !!lowChk.checked;
          saveStockView();
          draw();
        });

        document.querySelectorAll(".st-save").forEach(b => b.addEventListener("click", async () => {
          const row = document.querySelector(`input.st-qty[data-product="${CSS.escape(b.dataset.product)}"][data-variant="${CSS.escape(b.dataset.variant||"")}"]`);
          if (!row) return;
          const wh = row.dataset.warehouse;
          const pid = row.dataset.product;
          const vid = row.dataset.variant || null;
          const qty = Number(row.value || 0);
          const st = ensureStockRow(db, wh, pid, vid);
          st.qty = isFinite(qty) ? qty : 0;

          // record movement as adjust
          db.movements.push({ id: uid("mv"), ts: Date.now(), type: "adjust", productId: pid, variantId: vid, fromWarehouseId: wh, toWarehouseId: wh, qty: st.qty, comment: "Правка остатка (ручная)" });

          await persistDB(db);
          toast("Остаток сохранён", "ok");
        }));
      }

      if (tab === "moves"){
        document.getElementById("mvAdd")?.addEventListener("click", async () => {
          const type = document.getElementById("mvType").value;
          const pid = document.getElementById("mvProduct").value;
          const qty = Number(document.getElementById("mvQty").value || 0);
          const from = document.getElementById("mvFrom").value;
          const to = document.getElementById("mvTo").value;
          const comment = document.getElementById("mvComment").value || "";

          if (!pid){ toast("Выбери товар", "info"); return; }
          if (!isFinite(qty) || qty === 0){ toast("Укажи количество", "info"); return; }

          const mv = { id: uid("mv"), ts: Date.now(), type, productId: pid, variantId: null, fromWarehouseId: from, toWarehouseId: to, qty, comment };

          // Apply to stock
          if (type === "in"){
            const st = ensureStockRow(db, to, pid, null);
            st.qty += qty;
          } else if (type === "out"){
            const st = ensureStockRow(db, from, pid, null);
            st.qty -= qty;
          } else if (type === "transfer"){
            const sFrom = ensureStockRow(db, from, pid, null);
            const sTo = ensureStockRow(db, to, pid, null);
            sFrom.qty -= qty;
            sTo.qty += qty;
          } else if (type === "adjust"){
            const st = ensureStockRow(db, from, pid, null);
            st.qty = qty;
          }

          db.movements.push(mv);
          await persistDB(db);
          toast("Движение добавлено", "ok");
          draw();
        });
      }
    }

    function openCatsModal(db){
      const items = (db.categories||[]).map(c => `<li class="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-800">
        <span>${escapeHtml(c)}</span>
        <button class="cat-del px-3 py-1 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300" data-cat="${escapeHtml(c)}">Удалить</button>
      </li>`).join("");

      const m = modal("Категории", `
        <div class="space-y-3">
          <div class="flex gap-2">
            <input id="catNew" class="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="Новая категория"/>
            <button id="catAdd" class="px-4 py-2 rounded-xl fp-btn-primary">Добавить</button>
          </div>
          <ul class="text-sm">${items || `<div class="text-slate-500">Пока нет категорий</div>`}</ul>
        </div>
      `, `<button class="inv-close2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Закрыть</button>`);

      m.querySelector(".inv-close2").addEventListener("click", ()=>m.remove());

      m.querySelector("#catAdd").addEventListener("click", async () => {
        const val = (m.querySelector("#catNew").value || "").trim();
        if (!val) return;
        db.categories = Array.from(new Set([...(db.categories||[]), val]));
        await persistDB(db);
        toast("Категория добавлена", "ok");
        m.remove(); draw();
      });

      m.querySelectorAll(".cat-del").forEach(b => b.addEventListener("click", async () => {
        const c=b.dataset.cat;
        db.categories = (db.categories||[]).filter(x => x !== c);
        // reassign products
        db.products = (db.products||[]).map(p => (p.category===c ? {...p, category:"Другое"} : p));
        await persistDB(db);
        toast("Категория удалена", "ok");
        m.remove(); draw();
      }));
    }

    function openWarehouseModal(db, id){
      const w = id ? getWarehouse(db, id) : { id: uid("wh"), name:"", location:"", note:"" };
      const m = modal(id ? "Изменить склад" : "Новый склад", `
        <div class="space-y-3 text-sm">
          <div>
            <div class="text-xs text-slate-500 mb-1">Название</div>
            <input id="whName" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(w.name)}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Локация</div>
            <input id="whLoc" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(w.location||"")}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Заметка</div>
            <input id="whNote" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(w.note||"")}"/>
          </div>
        </div>
      `, `
        <button class="whSave px-4 py-2 rounded-xl fp-btn-primary">Сохранить</button>
      `);

      m.querySelector(".whSave").addEventListener("click", async () => {
        w.name = (m.querySelector("#whName").value || "").trim() || "Склад";
        w.location = (m.querySelector("#whLoc").value || "").trim();
        w.note = (m.querySelector("#whNote").value || "").trim();

        const exists = (db.warehouses||[]).some(x => x.id === w.id);
        if (exists){
          db.warehouses = db.warehouses.map(x => x.id === w.id ? w : x);
        } else {
          db.warehouses = [...(db.warehouses||[]), w];
        }
        await persistDB(db);
        toast("Склад сохранён", "ok");
        m.remove(); draw();
      });
    }

    function openProductModal(db, id){
      const p = id ? getProduct(db, id) : { id: uid("p"), name:"", sku:"", category:(db.categories||[])[0]||"Другое", unit:"шт", price:0, cost:0, track:true, minQty: 0, variants:[] };
      const catOpt = (db.categories||[]).map(c => `<option value="${escapeHtml(c)}" ${p.category===c?"selected":""}>${escapeHtml(c)}</option>`).join("");

      const m = modal(id ? "Изменить товар" : "Новый товар", `
        <div class="grid md:grid-cols-2 gap-3 text-sm">
          <div class="md:col-span-2">
            <div class="text-xs text-slate-500 mb-1">Название</div>
            <input id="pName" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(p.name)}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">SKU</div>
            <input id="pSku" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(p.sku||"")}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Категория</div>
            <select id="pCat" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">${catOpt}</select>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Ед. измерения</div>
            <input id="pUnit" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(p.unit||"шт")}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Учет остатков</div></div>
            <select id="pTrack" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
              <option value="1" ${p.track?"selected":""}>Да</option>
              <option value="0" ${!p.track?"selected":""}>Нет</option>
            </select>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Мин. остаток (для подсветки)<\/div>
            <input id="pMin" type="number" step="1" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${Number(p.minQty||0)}"/>
          <\/div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Цена</div>
            <input id="pPrice" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${Number(p.price||0)}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Себестоимость</div>
            <input id="pCost" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${Number(p.cost||0)}"/>
          </div>
          <div class="md:col-span-2 text-xs text-slate-500">
            Совет: если у товара есть варианты (например, 100/500/1000), добавь их через кнопку «Варианты». Тогда можно держать отдельные SKU и цены.
          </div>
        </div>
      `, `<button class="pSave px-4 py-2 rounded-xl fp-btn-primary">Сохранить</button>`);

      m.querySelector(".pSave").addEventListener("click", async () => {
        p.name = (m.querySelector("#pName").value || "").trim() || "Товар";
        p.sku = (m.querySelector("#pSku").value || "").trim();
        p.category = m.querySelector("#pCat").value || "Другое";
        p.unit = (m.querySelector("#pUnit").value || "").trim() || "шт";
        p.track = m.querySelector("#pTrack").value === "1";
        p.minQty = Math.max(0, Math.floor(Number(m.querySelector("#pMin").value || 0)));
        p.price = Number(m.querySelector("#pPrice").value || 0);
        p.cost = Number(m.querySelector("#pCost").value || 0);

        const exists = (db.products||[]).some(x => x.id === p.id);
        if (exists){
          db.products = db.products.map(x => x.id === p.id ? p : x);
        } else {
          db.products = [...(db.products||[]), p];
          // ensure stock row for each warehouse
          (db.warehouses||[]).forEach(w => ensureStockRow(db, w.id, p.id, null));
        }
        await persistDB(db);
        toast("Товар сохранён", "ok");
        m.remove(); draw();
      });
    }

    function openVariantsModal(db, productId){
      const p = getProduct(db, productId);
      if (!p){ toast("Товар не найден", "info"); return; }
      p.variants = p.variants || [];

      const list = (p.variants||[]).map(v => `
        <li class="py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div>
            <div class="font-semibold text-sm">${escapeHtml(v.name)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(v.sku || "")} • цена ${fmtMoney(v.price||0)} • себестоимость ${fmtMoney(v.cost||0)}</div>
          </div>
          <div class="flex gap-2">
            <button class="var-edit px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700" data-id="${v.id}">Изменить</button>
            <button class="var-del px-3 py-1 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300" data-id="${v.id}">Удалить</button>
          </div>
        </li>
      `).join("");

      const m = modal(`Варианты: ${p.name}`, `
        <div class="space-y-3">
          <div class="flex gap-2 flex-wrap">
            <button id="varAdd" class="px-4 py-2 rounded-xl fp-btn-primary">+ Добавить вариант</button>
            <div class="text-xs text-slate-500 self-center">Пример: 100 / 500 / 1000</div>
          </div>
          <ul>${list || `<div class="text-slate-500 text-sm">Вариантов пока нет</div>`}</ul>
        </div>
      `, `<button class="inv-close2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Закрыть</button>`);

      m.querySelector(".inv-close2").addEventListener("click", ()=>m.remove());

      function openVarModal(varId){
        const v = varId ? (p.variants||[]).find(x => x.id === varId) : { id: uid("v"), name:"", sku:"", price: p.price || 0, cost: p.cost || 0, minQty: (p.minQty||0) };
        const mm = modal(varId ? "Изменить вариант" : "Новый вариант", `
          <div class="grid md:grid-cols-2 gap-3 text-sm">
            <div class="md:col-span-2">
              <div class="text-xs text-slate-500 mb-1">Название варианта</div>
              <input id="vName" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(v.name)}" placeholder="Напр. 500 шт"/>
            </div>
            <div>
              <div class="text-xs text-slate-500 mb-1">SKU варианта</div>
              <input id="vSku" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(v.sku||"")}" placeholder="TG-SUB-500"/>
            </div>
            <div>
              <div class="text-xs text-slate-500 mb-1">Цена</div>
              <input id="vPrice" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${Number(v.price||0)}"/>
            </div>
            <div>
              <div class="text-xs text-slate-500 mb-1">Себестоимость</div>
              <input id="vCost" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${Number(v.cost||0)}"/>
            </div>
            <div>
              <div class="text-xs text-slate-500 mb-1">Мин. остаток варианта</div>
              <input id="vMin" type="number" step="1" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${Number(v.minQty||0)}"/>
            </div>
          </div>
        `, `<button class="vSave px-4 py-2 rounded-xl fp-btn-primary">Сохранить</button>`);
        mm.querySelector(".vSave").addEventListener("click", async () => {
          v.name = (mm.querySelector("#vName").value||"").trim() || "Вариант";
          v.sku = (mm.querySelector("#vSku").value||"").trim();
          v.price = Number(mm.querySelector("#vPrice").value||0);
          v.cost = Number(mm.querySelector("#vCost").value||0);
          v.minQty = Math.max(0, Math.floor(Number(mm.querySelector("#vMin").value||0)));
          const exists = (p.variants||[]).some(x => x.id === v.id);
          if (exists) p.variants = p.variants.map(x => x.id === v.id ? v : x);
          else p.variants = [...p.variants, v];

          // ensure stock rows for all warehouses
          (db.warehouses||[]).forEach(w => ensureStockRow(db, w.id, p.id, v.id));

          db.products = db.products.map(x => x.id === p.id ? p : x);
          await persistDB(db);
          toast("Вариант сохранён", "ok");
          mm.remove(); m.remove(); draw();
        });
      }

      m.querySelector("#varAdd").addEventListener("click", ()=>openVarModal(null));
      m.querySelectorAll(".var-edit").forEach(b => b.addEventListener("click", ()=>openVarModal(b.dataset.id)));
      m.querySelectorAll(".var-del").forEach(b => b.addEventListener("click", async () => {
        const id=b.dataset.id;
        p.variants = (p.variants||[]).filter(x => x.id !== id);
        db.stock = (db.stock||[]).filter(s => !(s.productId === p.id && s.variantId === id));
        db.products = db.products.map(x => x.id === p.id ? p : x);
        await persistDB(db);
        toast("Вариант удалён", "ok");
        m.remove(); draw();
      }));
    }

    // init active tab
    setActive((invState && invState.tab) ? invState.tab : "products");
  }

  window.FP.Modules.InventoryModule = {
    render: () => `<div id="moduleRoot"></div>`,
    mount
  };
})();
