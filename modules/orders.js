(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};

  const { Storage, Keys } = window.FP;
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);
  const fmtMoney = typeof ui.fmtMoney === "function" ? ui.fmtMoney : (n) => String(n ?? 0);
  const fmtDateTime = typeof ui.fmtDate === "function" ? ui.fmtDate : (ts) => new Date(ts).toLocaleString("ru-RU");
  const escapeHtml = typeof ui.escapeHtml === "function" ? ui.escapeHtml : (s) => String(s ?? "");

  // Shared storage with Finance module
  const LS_KEY = Keys.ORDERS;

  // Shared order model (used by Finance too)
  const OM = window.FP.OrderModel;
  const STATUS = OM?.STATUS || { WORK: "В работе", DONE: "Выполнено", PROBLEM: "Проблема", CANCEL: "Отменён" };
  const normalizeStatus = OM?.normalizeStatus || ((s)=>String(s||"В работе"));

  
  function getShowColumns(){
    const custom = Storage.get(Keys.CUSTOM, { orders: { showColumns: { platform:true, buyer:true, profit:true, status:true } } }) || {};
    return (custom.orders && custom.orders.showColumns) ? custom.orders.showColumns : { platform:true, buyer:true, profit:true, status:true };
  }
  function columnsStyle(show){
    const off = [];
    if (show && show.platform === false) off.push(".col-platform{display:none !important;}");
    if (show && show.buyer === false) off.push(".col-buyer{display:none !important;}");
    if (show && show.profit === false) off.push(".col-profit{display:none !important;}");
    if (show && show.status === false) off.push(".col-status{display:none !important;}");
    return off.join("\n");
  }
function statusMeta(s){
    const st = normalizeStatus(s);
    if (st === STATUS.DONE) return { cls: "fp-badge fp-badge--done", icon: "✅" };
    if (st === STATUS.PROBLEM) return { cls: "fp-badge fp-badge--problem", icon: "⚠️" };
    if (st === STATUS.CANCEL) return { cls: "fp-badge fp-badge--cancel", icon: "⛔" };
    return { cls: "fp-badge fp-badge--work", icon: "🟡" };
  }

  const STATUS_OPTIONS = OM?.STATUS_OPTIONS || [STATUS.WORK, STATUS.DONE, STATUS.PROBLEM, STATUS.CANCEL];
  const PLATFORM_OPTIONS = OM?.PLATFORM_OPTIONS || ["FunPay", "Playerok", "Другое"];

  function toNum(v){
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  const todayISO = OM?.todayISO || (() => new Date().toISOString().slice(0,10));

  function uid(){
    if (typeof crypto !== "undefined" && crypto.randomUUID) return "O" + crypto.randomUUID();
    return "O" + Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-4);
  }

  function ensureRow(row){
    const base = (OM && typeof OM.normalizeOrder === "function") ? OM.normalizeOrder(row||{}) : (row||{});
    const r = Object.assign({
      id: base.id || uid(),
      ts: base.ts || Date.now(),
      dateISO: base.dateISO || todayISO(),
      platform: base.platform || "FunPay",
      orderId: base.orderId || "",
      buyer: base.buyer || "",
      status: normalizeStatus(base.status || STATUS.WORK),
      item: base.item || "",
      productId: base.productId || null,
      variantId: base.variantId || null,
      qty: toNum(base.qty) || 1,
      unitPrice: toNum(base.unitPrice),
      unitCost: toNum(base.unitCost),
      revenue: toNum(base.revenue),
      fee: toNum(base.fee),
      cost: toNum(base.cost),
      note: base.note || "",
      history: Array.isArray(row?.history) ? row.history : []
    }, row || {});

    // keep compatibility with older field names
    if (!r.revenue && r.sum) r.revenue = toNum(r.sum);
    // compatibility aliases for older UI code
    r.sum = toNum(r.revenue);
    r.date = (r.dateISO || r.date || todayISO()).slice(0,10);
    r.status = normalizeStatus(r.status);
    if (!Array.isArray(r.history)) r.history = [];
    return r;
  }

  function loadRows(){
    const rows = Storage.get(LS_KEY, null);
    if (Array.isArray(rows)) return rows.map(ensureRow);

    // seed
    return [
      ensureRow({ platform: "FunPay", orderId: "#EXAMPLE1", date: todayISO(), item: "Пример товара", buyer: "@buyer", sum: 100, fee: 10, cost: 0, status: STATUS.DONE, note: "Демо" }),
      ensureRow({ platform: "Playerok", orderId: "#EXAMPLE2", date: todayISO(), item: "Пример услуги", buyer: "@client", sum: 250, fee: 0, cost: 50, status: STATUS.WORK, note: "" })
    ];
  }
  function saveRows(rows){ Storage.set(LS_KEY, rows); }

  // ---- Inventory link (v2: by productId/variantId) ----
  function isDoneStatus(s){ return normalizeStatus(s) === STATUS.DONE; }

  function applyStockDeltaV2(productId, variantId, deltaQty, orderId){
    if (!productId) return { ok: true };
    const db = (OM && typeof OM.getInventoryDB === "function") ? OM.getInventoryDB() : null;
    if (!db || db.version !== 2) return { ok: true };

    const wh = (db.warehouses && db.warehouses[0]) ? db.warehouses[0].id : "wh_main";
    db.stock = db.stock || [];
    db.movements = db.movements || [];
    const qty = toNum(deltaQty);

    let row = db.stock.find(s => s.warehouseId === wh && s.productId === productId && (s.variantId||null) === (variantId||null));
    if (!row){
      row = { id: (Storage.uid?Storage.uid("st"):"st_"+Date.now()), warehouseId: wh, productId, variantId: variantId||null, qty: 0 };
      db.stock.push(row);
    }
    const next = toNum(row.qty) + qty;
    if (next < 0) return { ok: false, msg: "Недостаточно товара на складе" };
    row.qty = next;

    // Movement log
    db.movements.push({
      id: (Storage.uid?Storage.uid("mv"):"mv_"+Date.now()),
      ts: Date.now(),
      type: "order",
      orderId: orderId || "",
      warehouseId: wh,
      productId,
      variantId: variantId||null,
      delta: qty,
      note: qty < 0 ? "Списание по заказу" : "Возврат по заказу"
    });

    try{ Storage.set(Keys.INVENTORY_V2, db); }catch(e){}
    return { ok: true };
  }

  function revertLinkEffects(oldRow){
    if (!oldRow) return;
    if (!isDoneStatus(oldRow.status)) return;
    const q = toNum(oldRow.qty);
    if (!q) return;
    applyStockDeltaV2(oldRow.productId, oldRow.variantId, +q, oldRow.id);
  }
  function applyLinkEffects(newRow){
    if (!newRow) return { ok: true };
    if (!isDoneStatus(newRow.status)) return { ok: true };
    const q = toNum(newRow.qty);
    if (!q) return { ok: true };
    return applyStockDeltaV2(newRow.productId, newRow.variantId, -q, newRow.id);
  }

  // ---- UI state (filters) ----
  function loadUIState(){
    const State = window.FP.State;
    if (State) return State.get("orders", { q: "", status: "Все" });
    const st = Storage.get(Keys.UI_STATE, {}) || {};
    return st.orders || { q: "", status: "Все" };
  }
  function saveUIState(next){
    const State = window.FP.State;
    if (State) return State.set("orders", next);
    const st = Storage.get(Keys.UI_STATE, {}) || {};
    st.orders = next;
    Storage.set(Keys.UI_STATE, st);
  }

  function profit(row){
    return toNum(row.sum) - toNum(row.fee) - toNum(row.cost);
  }

  function isProblem(row){ return normalizeStatus(row.status) === STATUS.PROBLEM; }
  function isWork(row){ return normalizeStatus(row.status) === STATUS.WORK; }

  function calcKPIs(rows){
    const today = todayISO();
    const doneToday = rows.filter(r => isDoneStatus(r.status) && r.date === today);
    const profitToday = doneToday.reduce((a,r)=>a+profit(r),0);

    const active = rows.filter(r => isWork(r));
    const problems = rows.filter(r => isProblem(r));
    const doneCountToday = doneToday.length;

    return {
      profitToday,
      activeCount: active.length,
      doneCountToday,
      problemCount: problems.length
    };
  }

  function groupByPeriod(rows, period){
    // period: "day" | "week" | "month"
    const map = new Map();
    rows.forEach(r=>{
      const d = new Date((r.date || "") + "T00:00:00");
      if (isNaN(d)) return;
      let key = r.date;
      if (period === "month"){
        key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      } else if (period === "week"){
        // ISO week key: YYYY-W## (rough, good enough for dashboard)
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
        key = `${date.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
      }
      if (!map.has(key)) map.set(key, { key, revenue:0, fee:0, cost:0, profit:0, done:0 });
      const agg = map.get(key);
      if (isDoneStatus(r.status)){
        agg.revenue += toNum(r.sum);
        agg.fee += toNum(r.fee);
        agg.cost += toNum(r.cost);
        agg.profit += profit(r);
        agg.done += 1;
      }
    });
    const arr = Array.from(map.values()).sort((a,b)=> String(a.key).localeCompare(String(b.key)));
    return arr;
  }

  // ---- Excel export ----
  function exportXLSX(rows){
    if (typeof XLSX === "undefined"){
      toast("Библиотека Excel не загрузилась", "err");
      return;
    }
    const data = rows.map(r => ({
      "ID (внутр.)": r.id,
      "Платформа": r.platform,
      "Дата": r.date,
      "ID заказа": r.orderId,
      "Товар": r.item,
      "Покупатель": r.buyer,
      "Сумма": toNum(r.sum),
      "Комиссия": toNum(r.fee),
      "Себестоимость": toNum(r.cost),
      "Прибыль": profit(r),
      "Статус": normalizeStatus(r.status),
      "Склад (товар)": r.invName,
      "Склад (кол-во)": toNum(r.invQty),
      "Заметка": r.note
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `SellerOS_orders_${todayISO()}.xlsx`);
  }

  // ---- History ----
  function pushHistory(row, action, payload){
    row.history = Array.isArray(row.history) ? row.history : [];
    row.history.push({
      ts: Date.now(),
      action: String(action || "update"),
      payload: payload || {}
    });
  }

  function openChat(buyer){
    const b = String(buyer || "").trim();
    if (!b) return toast("Нет контакта покупателя", "err");
    if (b.startsWith("@")){
      window.open("https://t.me/" + b.slice(1), "_blank");
      return;
    }
    toast("Контакт не похож на Telegram @username — скопируй вручную", "info");
  }

  function copyText(txt){
    const t = String(txt || "");
    if (!t) return;
    if (navigator.clipboard?.writeText){
      navigator.clipboard.writeText(t).then(()=>toast("Скопировано", "ok")).catch(()=>toast("Не удалось скопировать", "err"));
    } else {
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast("Скопировано", "ok"); } catch { toast("Не удалось скопировать", "err"); }
      ta.remove();
    }
  }

  function renderKPIs(k){
    return `
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button data-kpi="profitToday" class="fp-kpi text-left bg-white dark:bg-[#0d162a] fp-surface hover:bg-slate-50 dark:hover:bg-slate-800">
          <div class="v">${fmtMoney(k.profitToday)}</div>
          <div class="k">💰 Прибыль сегодня</div>
        </button>
        <button data-kpi="active" class="fp-kpi text-left bg-white dark:bg-[#0d162a] fp-surface hover:bg-slate-50 dark:hover:bg-slate-800">
          <div class="v">${k.activeCount}</div>
          <div class="k">📦 Активные</div>
        </button>
        <button data-kpi="doneToday" class="fp-kpi text-left bg-white dark:bg-[#0d162a] fp-surface hover:bg-slate-50 dark:hover:bg-slate-800">
          <div class="v">${k.doneCountToday}</div>
          <div class="k">✅ Выполнено сегодня</div>
        </button>
        <button data-kpi="problems" class="fp-kpi text-left bg-white dark:bg-[#0d162a] fp-surface hover:bg-slate-50 dark:hover:bg-slate-800">
          <div class="v">${k.problemCount}</div>
          <div class="k">⚠️ Проблемные</div>
        </button>
      </div>
    `;
  }

  function renderRow(r){
    const meta = statusMeta(r.status);
    return `
      <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
        <td class="py-2 px-3 col-platform">${escapeHtml(r.platform)}</td>
        <td class="py-2 px-3">${escapeHtml(r.date)}</td>
        <td class="py-2 px-3 font-mono text-xs">${escapeHtml(r.orderId)}</td>
        <td class="py-2 px-3">
          <div class="font-medium">${escapeHtml(r.item)}</div>
        </td>
        <td class="py-2 px-3 col-buyer">${escapeHtml(r.buyer || "")}</td>
        <td class="py-2 px-3 text-right">${fmtMoney(toNum(r.sum))}</td>
        <td class="py-2 px-3 text-right">${fmtMoney(toNum(r.fee))}</td>
        <td class="py-2 px-3 text-right">${fmtMoney(toNum(r.cost))}</td>
        <td class="py-2 px-3 text-right col-profit">${fmtMoney(profit(r))}</td>
        <td class="py-2 px-3 col-status">
          <button data-statusfilter="${escapeHtml(normalizeStatus(r.status))}" class="${meta.cls}">${meta.icon} ${escapeHtml(normalizeStatus(r.status))}</button>
        </td>
        <td class="py-2 px-3">
          <div class="flex items-center justify-end gap-2">
            <button title="Выполнено" data-act="done" data-id="${r.id}" class="fp-icon-btn hover:bg-emerald-50 dark:hover:bg-emerald-900/20">✔️</button>
            <button title="Отменить" data-act="cancel" data-id="${r.id}" class="fp-icon-btn hover:bg-slate-50 dark:hover:bg-slate-800">❌</button>
            <button title="Чат" data-act="chat" data-id="${r.id}" class="fp-icon-btn hover:bg-slate-50 dark:hover:bg-slate-800">💬</button>
            <button title="Копировать ID" data-act="copy" data-id="${r.id}" class="fp-icon-btn hover:bg-slate-50 dark:hover:bg-slate-800">📋</button>
            <button title="Открыть" data-act="open" data-id="${r.id}" class="fp-icon-btn hover:bg-slate-50 dark:hover:bg-slate-800">↗️</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderHistory(row){
    const list = Array.isArray(row.history) ? row.history.slice().reverse() : [];
    if (!list.length) return `<div class="text-sm text-slate-500">История пустая.</div>`;
    return `
      <div class="space-y-2 max-h-56 overflow-auto fp-scroll pr-1">
        ${list.map(h => `
          <div class="p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <div class="text-xs text-slate-500">${fmtDateTime(h.ts)}</div>
            <div class="text-sm font-medium">${escapeHtml(h.action)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(JSON.stringify(h.payload || {}))}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // Report modal
  function renderReport(period, rows){
    const agg = groupByPeriod(rows, period);
    const title = period === "day" ? "День" : period === "week" ? "Неделя" : "Месяц";
    const totalProfit = agg.reduce((a,x)=>a+x.profit,0);
    const totalDone = agg.reduce((a,x)=>a+x.done,0);

    return `
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-lg font-semibold">Отчёт: ${title}</div>
            <div class="text-sm text-slate-500">Суммы считаются по заказам со статусом «Выполнено».</div>
          </div>
          <div class="text-right">
            <div class="text-sm text-slate-500">Итого прибыль</div>
            <div class="text-lg font-semibold">${fmtMoney(totalProfit)}</div>
            <div class="text-xs text-slate-500">Сделок: ${totalDone}</div>
          </div>
        </div>

        <div class="border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <canvas id="ordReportChart" height="90"></canvas>
        </div>

        <div class="overflow-auto fp-scroll border border-slate-200 dark:border-slate-800 rounded-xl">
          <table class="w-full text-sm">
            <thead class="bg-white dark:bg-[#0d162a] fp-surface border-b border-slate-200 dark:border-slate-800">
              <tr class="text-left text-slate-500">
                <th class="py-2 px-3 w-40">Период</th>
                <th class="py-2 px-3 text-right">Выручка</th>
                <th class="py-2 px-3 text-right">Комиссия</th>
                <th class="py-2 px-3 text-right">Себест.</th>
                <th class="py-2 px-3 text-right">Прибыль</th>
                <th class="py-2 px-3 text-right">Сделки</th>
              </tr>
            </thead>
            <tbody>
              ${agg.map(x=>`
                <tr class="border-b border-slate-100 dark:border-slate-800">
                  <td class="py-2 px-3 font-mono text-xs">${escapeHtml(x.key)}</td>
                  <td class="py-2 px-3 text-right">${fmtMoney(x.revenue)}</td>
                  <td class="py-2 px-3 text-right">${fmtMoney(x.fee)}</td>
                  <td class="py-2 px-3 text-right">${fmtMoney(x.cost)}</td>
                  <td class="py-2 px-3 text-right font-semibold">${fmtMoney(x.profit)}</td>
                  <td class="py-2 px-3 text-right">${x.done}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  const OrdersModule = {
    render(){
      const rows = loadRows();
      const uiState = loadUIState();
      const kpi = calcKPIs(rows);

      return `
        <div class="max-w-7xl mx-auto space-y-4">
          <style id="ordersColsStyle">${columnsStyle(getShowColumns())}</style>
          ${renderKPIs(kpi)}

          <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border">
            <div class="flex flex-col gap-3">
              <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div class="text-lg font-semibold">Учет заказов</div>
                  <div class="text-sm text-slate-500 dark:text-slate-400">История заказов + быстрые действия + отчёты + экспорт.</div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button id="ordCommission" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">⚙️ Комиссия</button>
                  <button id="ordReportDay" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">📊 День</button>
                  <button id="ordReportWeek" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">📊 Неделя</button>
                  <button id="ordReportMonth" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">📊 Месяц</button>
                  <button id="ordExport" class="px-4 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90 dark:bg-slate-100 dark:text-slate-900">📤 Excel</button>
                  <button id="ordAdd" class="fp-btn px-4 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90">➕ Заказ</button>
                </div>
              </div>

              <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input id="ordSearch" value="${escapeHtml(uiState.q || "")}" placeholder="Поиск по ID / товару / покупателю / заметке…"
                  class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent w-full sm:w-96"/>
                <select id="ordStatus" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent w-full sm:w-56"></select>
                <button id="ordClear" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Сброс</button>
              </div>
            </div>
          </div>

          <div class="fp-card p-4 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border">
            <div class="overflow-auto fp-scroll max-h-[640px] border border-slate-200 dark:border-slate-800 fp-border rounded-xl">
              <table class="w-full text-sm">
                <thead class="sticky top-0 bg-white dark:bg-[#0d162a] fp-surface fp-border border-b border-slate-200 dark:border-slate-800">
                  <tr class="text-left text-slate-500">
                    <th class="py-2 px-3 w-28 col-platform">Платформа</th>
                    <th class="py-2 px-3 w-28">Дата</th>
                    <th class="py-2 px-3 w-32">ID</th>
                    <th class="py-2 px-3">Товар</th>
                    <th class="py-2 px-3 w-40 col-buyer">Покупатель</th>
                    <th class="py-2 px-3 w-28 text-right">Сумма</th>
                    <th class="py-2 px-3 w-28 text-right">Комиссия</th>
                    <th class="py-2 px-3 w-28 text-right">Себест.</th>
                    <th class="py-2 px-3 w-28 text-right col-profit">Прибыль</th>
                    <th class="py-2 px-3 w-32 col-status">Статус</th>
                    <th class="py-2 px-3 w-56 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody id="ordBody"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Order modal -->
        <div id="ordModal" class="hidden fixed inset-0 bg-black/50 z-50 items-center justify-center p-4">
          <div class="w-full max-w-4xl fp-card bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border p-5">
            <div class="flex items-center justify-between">
              <div class="text-lg font-semibold" id="ordModalTitle">Заказ</div>
              <button id="ordClose" class="px-3 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">✖</button>
            </div>

            <div class="mt-4 grid lg:grid-cols-3 gap-4">
              <div class="lg:col-span-2 space-y-3">
                <div class="grid md:grid-cols-2 gap-3">
                  <label class="block">
                    <div class="text-xs text-slate-500 mb-1">Платформа</div>
                    <select id="m_platform" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"></select>
                  </label>

                  <label class="block">
                    <div class="text-xs text-slate-500 mb-1">Дата</div>
                    <input id="m_date" type="date" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"/>
                  </label>

                  <label class="block">
                    <div class="text-xs text-slate-500 mb-1">ID заказа</div>
                    <input id="m_orderId" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="#123"/>
                  </label>

                  <label class="block">
                    <div class="text-xs text-slate-500 mb-1">Статус</div>
                    <select id="m_status" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"></select>
                  </label>

                  <label class="block md:col-span-2">
                    <div class="text-xs text-slate-500 mb-1">Товар</div>
                    <input id="m_item" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="Например: 1000 подписчиков Telegram"/>
                  </label>

                  <label class="block md:col-span-2">
                    <div class="text-xs text-slate-500 mb-1">Покупатель / контакт</div>
                    <input id="m_buyer" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="@username или что угодно"/>
                  </label>

                  <label class="block">
                    <div class="text-xs text-slate-500 mb-1">Сумма</div>
                    <input id="m_sum" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"/>
                  </label>

                  <label class="block">
                    <div class="text-xs text-slate-500 mb-1">Комиссия</div>
                    <input id="m_fee" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"/>
                  </label>

                  <label class="block">
                    <div class="text-xs text-slate-500 mb-1">Себестоимость</div>
                    <input id="m_cost" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"/>
                  </label>

                  <label class="block md:col-span-2">
                    <div class="text-xs text-slate-500 mb-1">Заметка</div>
                    <input id="m_note" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="Например: клиент попросил быстрее / есть нюанс"/>
                  </label>
                </div>

                <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div class="font-medium mb-2">Товар из склада (связь с бухгалтерией)</div>
                  <div class="grid md:grid-cols-2 gap-3">
                    <label class="block md:col-span-2">
                      <div class="text-xs text-slate-500 mb-1">Выбрать товар / вариант</div>
                      <select id="m_productLink" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"></select>
                    </label>
                    <label class="block">
                      <div class="text-xs text-slate-500 mb-1">Кол-во</div>
                      <input id="m_qty" type="number" step="1" min="1" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"/>
                    </label>
                    <div class="text-xs text-slate-500 flex items-center">
                      Автосебестоимость/сумма подтягиваются из склада. При статусе «Выполнено» — списание остатков.
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button id="m_save" class="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90">💾 Сохранить</button>
                  <button id="m_done" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">✔️ Выполнено</button>
                  <button id="m_cancel" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">❌ Отменить</button>
                  <button id="m_chat" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">💬 Чат</button>
                  <button id="m_copy" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">📋 Копировать ID</button>
                  <button id="m_delete" class="px-4 py-2 rounded-xl bg-rose-600 text-white hover:opacity-90">🗑️ Удалить</button>
                </div>
              </div>

              <div class="space-y-3">
                <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div class="font-medium mb-2">История</div>
                  <div id="m_history"></div>
                </div>

                <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div class="font-medium mb-2">Быстрые заметки</div>
                  <div class="flex flex-wrap gap-2">
                    <button data-quicknote="Срочно" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">⚡ Срочно</button>
                    <button data-quicknote="Ожидаю ответ" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">⏳ Ожидаю</button>
                    <button data-quicknote="Нужно уточнить" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">❓ Уточнить</button>
                  </div>
                </div>

                <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div class="font-medium mb-2">Прибыль по заказу</div>
                  <div class="text-2xl font-semibold" id="m_profit">—</div>
                  <div class="text-xs text-slate-500">Сумма − комиссия − себестоимость</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Report modal -->
        <div id="ordReportModal" class="hidden fixed inset-0 bg-black/50 z-50 items-center justify-center p-4">
          <div class="w-full max-w-5xl fp-card bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border p-5">
            <div class="flex items-center justify-between">
              <div class="text-lg font-semibold" id="ordReportTitle">Отчёт</div>
              <button id="ordReportClose" class="px-3 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">✖</button>
            </div>
            <div class="mt-4" id="ordReportBody"></div>
          </div>
        </div>

        <!-- Commission settings modal -->
        <div id="ordCommModal" class="hidden fixed inset-0 bg-black/50 z-50 items-center justify-center p-4">
          <div class="w-full max-w-xl fp-card bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border p-5">
            <div class="flex items-center justify-between">
              <div class="text-lg font-semibold">Комиссия по платформам</div>
              <button id="ordCommClose" class="px-3 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">✖</button>
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400 mt-1">Если в заказе поле «Комиссия» пустое или 0 — она будет рассчитана автоматически по этим процентам.</div>
            <div class="mt-4 grid gap-3">
              <label class="block">
                <div class="text-xs text-slate-500 mb-1">FunPay, %</div>
                <input id="comm_funpay" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" />
              </label>
              <label class="block">
                <div class="text-xs text-slate-500 mb-1">Playerok, %</div>
                <input id="comm_playerok" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" />
              </label>
              <label class="block">
                <div class="text-xs text-slate-500 mb-1">Другое, %</div>
                <input id="comm_other" type="number" step="0.01" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" />
              </label>
              <div class="flex gap-2 pt-2">
                <button id="ordCommSave" class="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90">💾 Сохранить</button>
                <button id="ordCommReset" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Сбросить</button>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    mount(root){
      let rows = loadRows();
      // ensure normalized + saved once to migrate legacy
      saveRows(rows);

      const uiState = loadUIState();

      const elBody = root.querySelector("#ordBody");
      const elSearch = root.querySelector("#ordSearch");
      const elStatus = root.querySelector("#ordStatus");

      function fillSelect(sel, opts, selected){
        sel.innerHTML = "";
        opts.forEach(o=>{
          const opt = document.createElement("option");
          opt.value = o;
          opt.textContent = o;
          if (String(selected) === String(o)) opt.selected = true;
          sel.appendChild(opt);
        });
      }

      fillSelect(elStatus, ["Все", ...STATUS_OPTIONS], uiState.status || "Все");

      function applyFilters(){
        const q = String(elSearch.value || "").trim().toLowerCase();
        const st = String(elStatus.value || "Все");

        saveUIState({ q, status: st });

        const filtered = rows.filter(r=>{
          const hay = `${r.orderId} ${r.item} ${r.note} ${r.platform} ${r.buyer}`.toLowerCase();
          const okQ = !q || hay.includes(q);
          const okS = st === "Все" ? true : normalizeStatus(r.status) === st;
          return okQ && okS;
        });

        if (!filtered.length) {
          const es = (ui.emptyState ? ui.emptyState({
            icon: "🧾",
            title: "Заказов пока нет",
            desc: "Добавь первый заказ — и он сразу появится в бухгалтерии и отчётах.",
            actionLabel: "➕ Добавить заказ",
            actionId: "ordEmptyAdd"
          }) : '<div class="p-4 text-sm text-slate-500">Пока нет заказов.</div>');
          elBody.innerHTML = `<tr><td colspan="11" class="p-4">${es}</td></tr>`;
        } else {
          elBody.innerHTML = filtered.map(renderRow).join("");
        }
        hookRowActions();
        hookStatusClicks();
        hookKPIClicks();
        root.querySelector("#ordEmptyAdd")?.addEventListener("click", () => openModal(uid()));
      }

      function hookStatusClicks(){
        root.querySelectorAll("[data-statusfilter]").forEach(btn=>{
          btn.addEventListener("click", () => {
            const st = btn.getAttribute("data-statusfilter");
            elStatus.value = st;
            applyFilters();
          });
        });
      }

      function hookKPIClicks(){
        root.querySelectorAll("[data-kpi]").forEach(btn=>{
          btn.addEventListener("click", () => {
            const k = btn.getAttribute("data-kpi");
            if (k === "active") elStatus.value = STATUS.WORK;
            if (k === "problems") elStatus.value = STATUS.PROBLEM;
            if (k === "doneToday") {
              elStatus.value = STATUS.DONE;
              elSearch.value = todayISO();
            }
            applyFilters();
          });
        });
      }

      function openModal(rowId){
        const modal = root.querySelector("#ordModal");
        const close = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); };
        const open = () => { modal.classList.remove("hidden"); modal.classList.add("flex"); };

        const row = rows.find(r=>r.id===rowId) || ensureRow({ id: rowId });
        const isNew = !rows.some(r=>r.id===rowId);

        const title = root.querySelector("#ordModalTitle");
        title.textContent = isNew ? "Новый заказ" : `Заказ ${row.orderId || ""}`;

        // fill selects
        fillSelect(root.querySelector("#m_platform"), PLATFORM_OPTIONS, row.platform);
        fillSelect(root.querySelector("#m_status"), STATUS_OPTIONS, normalizeStatus(row.status));

        // fields
        const f = (id) => root.querySelector(id);
        f("#m_date").value = row.date || todayISO();
        f("#m_orderId").value = row.orderId || "";
        f("#m_item").value = row.item || "";
        f("#m_buyer").value = row.buyer || "";
        f("#m_sum").value = toNum(row.sum);
        f("#m_fee").value = toNum(row.fee);
        f("#m_cost").value = toNum(row.cost);
        f("#m_note").value = row.note || "";
        // Inventory link (v2)
        const inv = OM && typeof OM.getInventoryDB === "function" ? OM.getInventoryDB() : null;
        const sel = f("#m_productLink");
        const options = [{ value: "", label: "— вручную (без склада) —" }];
        if (inv && inv.version === 2){
          (inv.products||[]).forEach(p=>{
            options.push({ value: `${p.id}::`, label: p.name });
            (p.variants||[]).forEach(v=>{
              options.push({ value: `${p.id}::${v.id}`, label: `↳ ${p.name} — ${v.name}` });
            });
          });
        }
        sel.innerHTML = options.map(o=>`<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
        const curVal = row.productId ? `${row.productId}::${row.variantId||""}` : "";
        sel.value = options.some(o=>o.value===curVal) ? curVal : "";
        f("#m_qty").value = Math.max(1, toNum(row.qty)||1);

        const profitEl = root.querySelector("#m_profit");
        function refreshProfit(){
          const tmp = {
            sum: toNum(f("#m_sum").value),
            fee: toNum(f("#m_fee").value),
            cost: toNum(f("#m_cost").value)
          };
          profitEl.textContent = fmtMoney(tmp.sum - tmp.fee - tmp.cost);
        }
        ["#m_sum","#m_fee","#m_cost"].forEach(id=>f(id).addEventListener("input", refreshProfit));
        refreshProfit();

        // Auto calc from inventory + commission settings
        function parseLink(){
          const v = String(f("#m_productLink").value||"");
          if (!v) return { productId: null, variantId: null };
          const parts = v.split("::");
          return { productId: parts[0]||null, variantId: parts[1]||null };
        }

        // mark auto fields when empty
        ["#m_item", "#m_sum", "#m_cost", "#m_fee"].forEach(id=>{
          const el = f(id);
          el.dataset.auto = (String(el.value||"").trim() ? "0" : "1");
          el.addEventListener("input", ()=>{ el.dataset.auto = "0"; });
        });

        function autoRecalc(){
          const link = parseLink();
          const draft = {
            id: row.id,
            platform: f("#m_platform").value,
            dateISO: f("#m_date").value,
            orderId: f("#m_orderId").value.trim(),
            buyer: f("#m_buyer").value.trim(),
            status: f("#m_status").value,
            note: f("#m_note").value,
            productId: link.productId,
            variantId: link.variantId,
            qty: toNum(f("#m_qty").value) || 1,
            item: f("#m_item").value.trim(),
            revenue: toNum(f("#m_sum").value),
            fee: toNum(f("#m_fee").value),
            cost: toNum(f("#m_cost").value)
          };
          const next = ensureRow(draft);
          if (f("#m_item").dataset.auto === "1" && next.item) f("#m_item").value = next.item;
          if (f("#m_sum").dataset.auto === "1" && next.sum) f("#m_sum").value = next.sum;
          if (f("#m_cost").dataset.auto === "1" && next.cost) f("#m_cost").value = next.cost;
          if (f("#m_fee").dataset.auto === "1" && next.fee) f("#m_fee").value = next.fee;
          refreshProfit();
        }
        f("#m_productLink").addEventListener("change", ()=>{
          f("#m_item").dataset.auto = "1";
          if (!String(f("#m_sum").value||"").trim()) f("#m_sum").dataset.auto = "1";
          if (!String(f("#m_cost").value||"").trim()) f("#m_cost").dataset.auto = "1";
          autoRecalc();
        });
        f("#m_qty").addEventListener("input", ()=>{
          if (f("#m_sum").dataset.auto === "1"){}
          autoRecalc();
        });
        f("#m_platform").addEventListener("change", ()=>{ if (f("#m_fee").dataset.auto === "1") autoRecalc(); });
        // initial
        autoRecalc();

        // history render
        const hEl = root.querySelector("#m_history");
        hEl.innerHTML = renderHistory(row);

        // quick notes
        root.querySelectorAll("[data-quicknote]").forEach(btn=>{
          btn.onclick = () => {
            const t = btn.getAttribute("data-quicknote");
            const cur = f("#m_note").value || "";
            f("#m_note").value = cur ? (cur + " | " + t) : t;
          };
        });

        function readForm(){
          const link = parseLink();
          return ensureRow({
            id: row.id,
            platform: f("#m_platform").value,
            dateISO: f("#m_date").value,
            orderId: f("#m_orderId").value.trim(),
            item: f("#m_item").value.trim(),
            buyer: f("#m_buyer").value.trim(),
            qty: f("#m_qty").value,
            productId: link.productId,
            variantId: link.variantId,
            revenue: f("#m_sum").value,
            fee: f("#m_fee").value,
            cost: f("#m_cost").value,
            status: f("#m_status").value,
            note: f("#m_note").value
          });
        }

        function upsert(next, reason){
          // Revert stock if needed for previous version
          if (!isNew) revertLinkEffects(row);

          // Apply stock effects for next
          const linkRes = applyLinkEffects(next);
          if (!linkRes.ok){
            // rollback revert effects by re-applying old (best effort)
            applyLinkEffects(row);
            toast(linkRes.msg || "Ошибка склада", "err");
            return;
          }

          // push history
          if (reason) pushHistory(next, reason, { status: normalizeStatus(next.status) });

          const idx = rows.findIndex(r=>r.id===row.id);
          if (idx === -1) rows.unshift(next);
          else rows[idx] = next;

          saveRows(rows);
          toast("Сохранено", "ok");
          applyFilters();
          // refresh current row reference
          Object.assign(row, next);
          hEl.innerHTML = renderHistory(row);
          title.textContent = `Заказ ${row.orderId || ""}`;
        }

        root.querySelector("#ordClose").onclick = close;

        root.querySelector("#m_save").onclick = () => {
          const next = readForm();
          upsert(next, isNew ? "created" : "edited");
        };

        root.querySelector("#m_done").onclick = () => {
          const next = readForm();
          next.status = STATUS.DONE;
          upsert(next, "set_done");
        };

        root.querySelector("#m_cancel").onclick = () => {
          const next = readForm();
          next.status = STATUS.CANCEL;
          upsert(next, "set_cancel");
        };

        root.querySelector("#m_chat").onclick = () => openChat(f("#m_buyer").value);
        root.querySelector("#m_copy").onclick = () => copyText(f("#m_orderId").value);

        root.querySelector("#m_delete").onclick = async () => {
          const ok = ui.confirm ? await ui.confirm({ title: "Удалить заказ", message: "Заказ будет удалён без возможности восстановления. Продолжить?", okText: "Удалить", cancelText: "Отмена" }) : confirm("Удалить заказ?");
          if (!ok) return;
          // revert stock effects
          revertLinkEffects(row);
          rows = rows.filter(r=>r.id!==row.id);
          saveRows(rows);
          toast("Удалено", "ok");
          applyFilters();
          close();
        };

        open();
      }

      function hookRowActions(){
        root.querySelectorAll("[data-act][data-id]").forEach(btn=>{
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            const act = btn.getAttribute("data-act");
            const row = rows.find(r=>r.id===id);
            if (!row) return;

            if (act === "open") return openModal(id);
            if (act === "chat") return openChat(row.buyer);
            if (act === "copy") return copyText(row.orderId);

            if (act === "done"){
              const next = ensureRow({ ...row, status: STATUS.DONE });
              revertLinkEffects(row);
              const linkRes = applyLinkEffects(next);
              if (!linkRes.ok){
                applyLinkEffects(row);
                return toast(linkRes.msg || "Ошибка склада", "err");
              }
              pushHistory(next, "quick_done", {});
              rows = rows.map(r=>r.id===id ? next : r);
              saveRows(rows);
              toast("Отмечено как выполнено", "ok");
              return applyFilters();
            }

            if (act === "cancel"){
              const next = ensureRow({ ...row, status: STATUS.CANCEL });
              revertLinkEffects(row);
              const linkRes = applyLinkEffects(next);
              if (!linkRes.ok){
                applyLinkEffects(row);
                return toast(linkRes.msg || "Ошибка склада", "err");
              }
              pushHistory(next, "quick_cancel", {});
              rows = rows.map(r=>r.id===id ? next : r);
              saveRows(rows);
              toast("Отменено", "ok");
              return applyFilters();
            }
          });
        });
      }

      // Search behavior (Enter applies; typing applies too)
      elSearch.addEventListener("input", applyFilters);
      elSearch.addEventListener("keydown", (e)=>{ if (e.key === "Enter") applyFilters(); });

      elStatus.addEventListener("change", applyFilters);

      root.querySelector("#ordClear").addEventListener("click", () => {
        elSearch.value = "";
        elStatus.value = "Все";
        applyFilters();
      });

      root.querySelector("#ordAdd").addEventListener("click", () => openModal(uid()));

      // Commission settings
      const commModal = root.querySelector("#ordCommModal");
      const commClose = () => { commModal.classList.add("hidden"); commModal.classList.remove("flex"); };
      const commOpen = () => { commModal.classList.remove("hidden"); commModal.classList.add("flex"); };
      root.querySelector("#ordCommClose").addEventListener("click", commClose);
      const commFunPay = root.querySelector("#comm_funpay");
      const commPlayerok = root.querySelector("#comm_playerok");
      const commOther = root.querySelector("#comm_other");

      function fillComm(){
        const s = (OM && OM.loadFinanceSettings) ? OM.loadFinanceSettings() : { commissionPct: { FunPay: 0, Playerok: 0, "Другое": 0 } };
        commFunPay.value = toNum(s.commissionPct?.FunPay ?? 0);
        commPlayerok.value = toNum(s.commissionPct?.Playerok ?? 0);
        commOther.value = toNum(s.commissionPct?.["Другое"] ?? 0);
      }
      root.querySelector("#ordCommission").addEventListener("click", () => {
        fillComm();
        commOpen();
      });
      root.querySelector("#ordCommSave").addEventListener("click", () => {
        const s = (OM && OM.loadFinanceSettings) ? OM.loadFinanceSettings() : { version: 1, commissionPct: {} };
        s.version = 1;
        s.commissionPct = s.commissionPct || {};
        s.commissionPct.FunPay = toNum(commFunPay.value);
        s.commissionPct.Playerok = toNum(commPlayerok.value);
        s.commissionPct["Другое"] = toNum(commOther.value);
        if (OM && OM.saveFinanceSettings) OM.saveFinanceSettings(s);
        toast("Комиссия сохранена", "ok");
        commClose();
      });
      root.querySelector("#ordCommReset").addEventListener("click", () => {
        const s = { version: 1, commissionPct: { FunPay: 0, Playerok: 0, "Другое": 0 } };
        if (OM && OM.saveFinanceSettings) OM.saveFinanceSettings(s);
        fillComm();
        toast("Сброшено", "ok");
      });

      // Export
      root.querySelector("#ordExport").addEventListener("click", () => exportXLSX(rows));

      // Reports
      const repModal = root.querySelector("#ordReportModal");
      const repBody = root.querySelector("#ordReportBody");
      const repTitle = root.querySelector("#ordReportTitle");
      const repClose = () => { repModal.classList.add("hidden"); repModal.classList.remove("flex"); };
      const repOpen = () => { repModal.classList.remove("hidden"); repModal.classList.add("flex"); };

      root.querySelector("#ordReportClose").addEventListener("click", repClose);

      function showReport(period){
        repTitle.textContent = "Отчёт";
        repBody.innerHTML = renderReport(period, rows);
        repOpen();

        // draw chart
        const agg = groupByPeriod(rows, period);
        const ctx = repBody.querySelector("#ordReportChart");
        if (ctx && typeof Chart !== "undefined"){
          const labels = agg.map(x=>x.key);
          const data = agg.map(x=>x.profit);
          // destroy previous if exists
          if (window.__ordChart) { try { window.__ordChart.destroy(); } catch {} }
          window.__ordChart = new Chart(ctx, {
            type: "line",
            data: { labels, datasets: [{ label: "Прибыль", data }] },
            options: { responsive: true, maintainAspectRatio: false }
          });
        }
      }

      root.querySelector("#ordReportDay").addEventListener("click", ()=>showReport("day"));
      root.querySelector("#ordReportWeek").addEventListener("click", ()=>showReport("week"));
      root.querySelector("#ordReportMonth").addEventListener("click", ()=>showReport("month"));

      // initial render
      applyFilters();
    }
  };

  window.FP.Modules.OrdersModule = OrdersModule;
})();