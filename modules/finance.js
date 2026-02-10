(function () {
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};

  const { Storage, Keys } = window.FP;
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);
  const escapeHtml = typeof ui.escapeHtml === "function" ? ui.escapeHtml : (s) => String(s ?? "");
  const fmtMoney = typeof ui.fmtMoney === "function" ? ui.fmtMoney : (n) => {
    const x = Number(n || 0);
    try { return x.toLocaleString("ru-RU", { style: "currency", currency: "RUB" }); } catch (e) { return String(x); }
  };

  // ---- helpers ----
  function dayKey(ts) {
    const d = new Date(ts);
    if (!isFinite(d.getTime())) return "invalid";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function rangeForPreset(preset) {
    const now = Date.now();
    const today0 = startOfDay(now);
    const oneDay = 24 * 60 * 60 * 1000;

    if (preset === "today") return { from: today0, to: today0 + oneDay };
    if (preset === "7d") return { from: today0 - 6 * oneDay, to: today0 + oneDay };
    if (preset === "30d") return { from: today0 - 29 * oneDay, to: today0 + oneDay };
    if (preset === "month") {
      const d = new Date(now);
      const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      return { from, to };
    }
    return { from: today0 - 6 * oneDay, to: today0 + oneDay };
  }

  function parseRUB(x) {
    const n = Number(x);
    return isFinite(n) ? n : 0;
  }

  function getInventoryDB() {
    try { return Storage.get(Keys.INVENTORY_V2, null) || Storage.get(Keys.INVENTORY, null); } catch (e) { return null; }
  }

  function findProductCost(db, productId, variantId) {
    if (!db || db.version !== 2) return 0;
    const p = (db.products || []).find(x => x.id === productId);
    if (!p) return 0;
    if (variantId) {
      const v = (p.variants || []).find(vv => vv.id === variantId);
      if (v && isFinite(Number(v.cost))) return Number(v.cost);
    }
    return isFinite(Number(p.cost)) ? Number(p.cost) : 0;
  }

  function normalizeOrder(o) {
    const OM = window.FP.OrderModel;
    if (OM && typeof OM.normalizeOrder === "function") {
      return OM.normalizeOrder(o || {});
    }
    // Fallback (legacy)
    const ts = o.ts || o.createdAt || o.date || Date.now();
    return {
      id: o.id || o.orderId || o.uid || `ord_${String(ts)}_${Math.random().toString(16).slice(2)}`,
      ts: Number(ts) || Date.now(),
      dateISO: (o.dateISO || o.date || "").slice(0,10),
      platform: o.platform || o.market || "—",
      buyer: o.buyer || o.customer || o.user || "—",
      status: o.status || "В работе",
      revenue: parseRUB(o.revenue ?? o.price ?? o.sum ?? o.total),
      fee: parseRUB(o.fee ?? o.commission),
      cost: parseRUB(o.cost ?? o.cogs),
      qty: Number(o.qty ?? o.count ?? 1) || 1,
      productId: o.productId || null,
      variantId: o.variantId || null,
      note: o.note || o.comment || ""
    };
  }

  // Local-only build (no backend)

  function buildLocalSummary(range) {
    const rawOrders = (() => {
      try {
        // try common keys
        return Storage.get(Keys.ORDERS, null)
          || Storage.get("selleros_orders_v1", null)
          || Storage.get("fp_orders_v1", null)
          || [];
      } catch (e) { return []; }
    })();

    const inv = getInventoryDB();
    const filters = (range && range.filters) ? range.filters : {};
    const ordersAll = (Array.isArray(rawOrders) ? rawOrders : []).map(normalizeOrder);
    const ordersInRange = ordersAll.filter(o => o.ts >= range.from && o.ts < range.to);
    const orders = ordersInRange
      .filter(o => {
        if (filters.platform && filters.platform !== "all") {
          if (String(o.platform || "").toLowerCase() !== String(filters.platform).toLowerCase()) return false;
        }
        if (filters.status && filters.status !== "all") {
          if (String(o.status || "").toLowerCase() !== String(filters.status).toLowerCase()) return false;
        }
        if (filters.product && filters.product !== "all") {
          if (String(o.productId || "") !== String(filters.product)) return false;
        }
        return true;
      });

    // filter option pools (based on full in-range list)
    const platforms = Array.from(new Set(ordersInRange.map(o => String(o.platform || "—").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru'));
    const statuses = Array.from(new Set(ordersInRange.map(o => String(o.status || "—").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru'));
    const productIds = Array.from(new Set(ordersInRange.map(o => o.productId).filter(Boolean)));

    // If cost missing, try infer from inventory
    orders.forEach(o => {
      if (!o.cost && o.productId) {
        const unitCost = findProductCost(inv, o.productId, o.variantId);
        o.cost = unitCost * (o.qty || 1);
      }
    });

    const totals = {
      revenue: 0,
      fee: 0,
      cost: 0,
      profit: 0,
      orders: orders.length,
      done: 0,
      problem: 0
    };

    const byDay = new Map(); // day -> {revenue, cost, profit, orders}
    for (const o of orders) {
      totals.revenue += o.revenue;
      totals.fee += o.fee;
      totals.cost += o.cost;
      const p = (o.revenue - o.fee - o.cost);
      totals.profit += p;

      const st = String(o.status || "").toLowerCase();
      if (st.includes("вып") || st.includes("done") || st.includes("закры")) totals.done += 1;
      if (st.includes("проб") || st.includes("спор") || st.includes("refund") || st.includes("charge")) totals.problem += 1;

      const dk = dayKey(o.ts);
      if (!byDay.has(dk)) byDay.set(dk, { revenue: 0, cost: 0, profit: 0, orders: 0 });
      const r = byDay.get(dk);
      r.revenue += o.revenue;
      r.cost += o.cost;
      r.profit += p;
      r.orders += 1;
    }

    // movement-based hints (optional): count movements in range
    const movements = (inv && inv.version === 2 && Array.isArray(inv.movements)) ? inv.movements : [];
    const movesInRange = movements.filter(m => (m.ts || 0) >= range.from && (m.ts || 0) < range.to);
    const movesStats = {
      in: movesInRange.filter(m => m.type === "in").length,
      out: movesInRange.filter(m => m.type === "out").length,
      transfer: movesInRange.filter(m => m.type === "transfer").length,
      adjust: movesInRange.filter(m => m.type === "adjust").length
    };

    // labels sorted
    const labels = Array.from(byDay.keys()).sort();
    const series = labels.map(l => byDay.get(l));

    // margin % per day (profit / revenue)
    const margin = series.map(x => {
      const rev = Number(x.revenue || 0);
      const prof = Number(x.profit || 0);
      if (!rev) return 0;
      return Math.round((prof / rev) * 1000) / 10; // 1 decimal
    });

    // Top products (if productId exists)
    const prodMap = new Map();
    for (const o of orders) {
      const k = o.productId || "unknown";
      if (!prodMap.has(k)) prodMap.set(k, { revenue: 0, profit: 0, orders: 0 });
      const v = prodMap.get(k);
      v.revenue += o.revenue;
      v.profit += (o.revenue - o.fee - o.cost);
      v.orders += 1;
    }
    const topProducts = Array.from(prodMap.entries())
      .filter(([k]) => k !== "unknown")
      .map(([k, v]) => ({ id: k, ...v }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const nameOfProduct = (id) => {
      if (!inv || inv.version !== 2) return id;
      const p = (inv.products || []).find(x => x.id === id);
      return p ? p.name : id;
    };

    return {
      range,
      filters,
      options: {
        platforms,
        statuses,
        products: productIds.map(id => ({ id: String(id), name: nameOfProduct(id) })).sort((a,b)=>a.name.localeCompare(b.name,'ru')),
      },
      totals,
      chart: {
        labels,
        revenue: series.map(x => x.revenue),
        profit: series.map(x => x.profit),
        orders: series.map(x => x.orders),
        margin,
      },
      movesStats,
      topProducts: topProducts.map(p => ({ name: nameOfProduct(p.id), revenue: p.revenue, profit: p.profit, orders: p.orders })),
      lastOrders: orders.slice().sort((a,b)=>b.ts-a.ts).slice(0, 8),
      _exportOrders: orders.slice().sort((a,b)=>a.ts-b.ts)
    };
  }

  function render() {
    return `
      <div class="max-w-6xl mx-auto space-y-4">
        <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="text-lg font-semibold">Бухгалтерия v2</div>
              <div class="text-xs text-slate-500">Прибыль • комиссии • себестоимость • графики</div>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <select id="finPreset" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                <option value="today">Сегодня</option>
                <option value="7d" selected>7 дней</option>
                <option value="30d">30 дней</option>
                <option value="month">Текущий месяц</option>
              </select>
              <select id="finMetric" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                <option value="revenue_profit" selected>Выручка + прибыль</option>
                <option value="revenue">Только выручка</option>
                <option value="profit">Только прибыль</option>
                <option value="orders">Только заказы</option>
                <option value="margin">Маржа %</option>
              </select>
              <button id="finReload" class="px-4 py-2 rounded-xl fp-btn-primary">Обновить</button>
              <button id="finExport" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Экспорт отчёта</button>
            </div>
          </div>

          <div class="mt-4 grid md:grid-cols-3 gap-3">
            <div>
              <div class="text-xs text-slate-500 mb-1">Платформа</div>
              <select id="finFilterPlatform" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                <option value="all" selected>Все</option>
              </select>
            </div>
            <div>
              <div class="text-xs text-slate-500 mb-1">Товар</div>
              <select id="finFilterProduct" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                <option value="all" selected>Все</option>
              </select>
            </div>
            <div>
              <div class="text-xs text-slate-500 mb-1">Статус</div>
              <select id="finFilterStatus" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                <option value="all" selected>Все</option>
              </select>
            </div>
          </div>

          <div class="mt-4 grid md:grid-cols-4 gap-3">
            ${kpi("💰 Выручка", "kpiRevenue")}
            ${kpi("🧾 Комиссии", "kpiFee")}
            ${kpi("📦 Себестоимость", "kpiCost")}
            ${kpi("✅ Чистая прибыль", "kpiProfit")}
          </div>

          <div class="mt-3 grid md:grid-cols-3 gap-3 text-sm">
            ${kpiSmall("Заказы", "kpiOrders")}
            ${kpiSmall("Выполнено", "kpiDone")}
            ${kpiSmall("Проблемные", "kpiProblem")}
          </div>
        </div>

        <div class="grid lg:grid-cols-3 gap-4">
          <div class="lg:col-span-2 fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div class="text-base font-semibold">График</div>
                <div class="text-xs text-slate-500" id="finChartHint">Выручка и прибыль по дням</div>
              </div>
              <div class="text-xs text-slate-500" id="finRangeLabel"></div>
            </div>
            <div class="mt-4">
              <canvas id="finChart" height="110"></canvas>
              <div id="finChartFallback" class="hidden text-sm text-slate-500 mt-2">Chart.js не найден — график отключён.</div>
            </div>
          </div>

          <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
            <div class="text-base font-semibold">Топ товаров</div>
            <div class="text-xs text-slate-500">По прибыли за период</div>
            <div id="finTopProducts" class="mt-3 space-y-2 text-sm"></div>

            <div class="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div class="text-base font-semibold">Движения склада</div>
              <div class="text-xs text-slate-500">Сколько движений за период</div>
              <div id="finMoves" class="mt-3 grid grid-cols-2 gap-2 text-sm"></div>
            </div>
          </div>
        </div>

        <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div class="text-base font-semibold">Последние заказы</div>
              <div class="text-xs text-slate-500">Быстрый контроль, что сейчас происходит</div>
            </div>
            <a class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" href="#/orders">Открыть «Учет заказов»</a>
          </div>

          <div class="mt-4 overflow-x-auto fp-scroll">
            <table class="w-full text-sm fp-table">
              <thead class="text-slate-500">
                <tr>
                  <th class="text-left py-2 pr-3">Дата</th>
                  <th class="text-left py-2 pr-3">Платформа</th>
                  <th class="text-left py-2 pr-3">Покупатель</th>
                  <th class="text-left py-2 pr-3">Статус</th>
                  <th class="text-left py-2 pr-3">Выручка</th>
                  <th class="text-left py-2 pr-3">Себес.</th>
                  <th class="text-left py-2 pr-3">Комиссия</th>
                  <th class="text-left py-2 pr-3">Профит</th>
                </tr>
              </thead>
              <tbody id="finLastOrders"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function kpi(label, id) {
    return `
      <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div class="text-xs text-slate-500">${escapeHtml(label)}</div>
        <div id="${id}" class="mt-1 text-2xl font-semibold">—</div>
      </div>
    `;
  }
  function kpiSmall(label, id) {
    return `
      <div class="p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div class="text-xs text-slate-500">${escapeHtml(label)}</div>
        <div id="${id}" class="mt-1 text-lg font-semibold">—</div>
      </div>
    `;
  }

  let chartInstance = null;

  const FIN_UI_KEY = "selleros_finance_ui_v2";

  function loadUIState() {
    try { return Storage.get(FIN_UI_KEY, null) || {}; } catch (e) { return {}; }
  }
  function saveUIState(patch) {
    try {
      const cur = loadUIState();
      Storage.set(FIN_UI_KEY, { ...cur, ...patch });
    } catch (e) {}
  }

  async function mount() {
    const presetSel = document.getElementById("finPreset");
    const metricSel = document.getElementById("finMetric");
    const reloadBtn = document.getElementById("finReload");
    const exportBtn = document.getElementById("finExport");
    const filterPlatform = document.getElementById("finFilterPlatform");
    const filterProduct = document.getElementById("finFilterProduct");
    const filterStatus = document.getElementById("finFilterStatus");
    const chartHint = document.getElementById("finChartHint");

    // restore UI state
    const uiState = loadUIState();
    if (uiState.preset && presetSel) presetSel.value = uiState.preset;
    if (uiState.metric && metricSel) metricSel.value = uiState.metric;
    if (uiState.platform && filterPlatform) filterPlatform.value = uiState.platform;
    if (uiState.product && filterProduct) filterProduct.value = uiState.product;
    if (uiState.status && filterStatus) filterStatus.value = uiState.status;

    let lastSummary = null;

    async function loadAndRender() {
      const preset = presetSel.value || "7d";
      const range = rangeForPreset(preset);
      const filters = {
        platform: filterPlatform ? (filterPlatform.value || "all") : "all",
        product: filterProduct ? (filterProduct.value || "all") : "all",
        status: filterStatus ? (filterStatus.value || "all") : "all",
      };
      const metric = metricSel ? (metricSel.value || "revenue_profit") : "revenue_profit";

      saveUIState({ preset, metric, ...filters });

      // label
      const fromD = new Date(range.from);
      const toD = new Date(range.to - 1);
      const label = `${fromD.toLocaleDateString("ru-RU")} — ${toD.toLocaleDateString("ru-RU")}`;
      document.getElementById("finRangeLabel").textContent = label;

      // local-only summary
      const summary = buildLocalSummary({ ...range, filters });
      lastSummary = summary;

      // populate filter options
      try {
        const opt = (summary && summary.options) ? summary.options : {};

        if (filterPlatform) {
          const cur = filterPlatform.value || "all";
          filterPlatform.innerHTML = `<option value="all">Все</option>` + (opt.platforms || []).map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
          filterPlatform.value = (opt.platforms || []).some(p => String(p) === String(cur)) ? cur : "all";
        }
        if (filterStatus) {
          const cur = filterStatus.value || "all";
          filterStatus.innerHTML = `<option value="all">Все</option>` + (opt.statuses || []).map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
          filterStatus.value = (opt.statuses || []).some(s => String(s) === String(cur)) ? cur : "all";
        }
        if (filterProduct) {
          const cur = filterProduct.value || "all";
          filterProduct.innerHTML = `<option value="all">Все</option>` + (opt.products || []).map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");
          filterProduct.value = (opt.products || []).some(p => String(p.id) === String(cur)) ? cur : "all";
        }
      } catch (e) {}

      // KPIs
      document.getElementById("kpiRevenue").textContent = fmtMoney(summary.totals.revenue);
      document.getElementById("kpiFee").textContent = fmtMoney(summary.totals.fee);
      document.getElementById("kpiCost").textContent = fmtMoney(summary.totals.cost);
      document.getElementById("kpiProfit").textContent = fmtMoney(summary.totals.profit);

      document.getElementById("kpiOrders").textContent = String(summary.totals.orders);
      document.getElementById("kpiDone").textContent = String(summary.totals.done);
      document.getElementById("kpiProblem").textContent = String(summary.totals.problem);

      // top products
      const topHost = document.getElementById("finTopProducts");
      if (!summary.topProducts || summary.topProducts.length === 0) {
        topHost.innerHTML = `<div class="text-slate-500">Нет данных. Добавь productId в заказах — и тут появится топ.</div>`;
      } else {
        topHost.innerHTML = summary.topProducts.map(p => `
          <div class="p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div class="font-semibold">${escapeHtml(p.name)}</div>
            <div class="text-xs text-slate-500 mt-1">Заказов: ${p.orders} • Выручка: ${fmtMoney(p.revenue)}</div>
            <div class="text-sm mt-1">Профит: <span class="font-semibold">${fmtMoney(p.profit)}</span></div>
          </div>
        `).join("");
      }

      // moves
      const mv = summary.movesStats || { in: 0, out: 0, transfer: 0, adjust: 0 };
      const mvHost = document.getElementById("finMoves");
      mvHost.innerHTML = `
        ${mvCard("➕ Приход", mv.in)}
        ${mvCard("➖ Расход", mv.out)}
        ${mvCard("↔ Перемещение", mv.transfer)}
        ${mvCard("🛠 Коррект.", mv.adjust)}
      `;

      // last orders
      const tb = document.getElementById("finLastOrders");
      const orders = summary.lastOrders || [];
      if (!orders.length) {
        tb.innerHTML = `<tr><td class="py-6 text-slate-500" colspan="8">Пока нет заказов в выбранном периоде.</td></tr>`;
      } else {
        tb.innerHTML = orders.map(o => {
          const dt = new Date(o.ts);
          const when = isFinite(dt.getTime()) ? dt.toLocaleString("ru-RU") : "—";
          const profit = (o.revenue - o.fee - o.cost);
          return `
            <tr class="border-t border-slate-200 dark:border-slate-800">
              <td class="py-3 pr-3 whitespace-nowrap">${escapeHtml(when)}</td>
              <td class="py-3 pr-3">${escapeHtml(o.platform)}</td>
              <td class="py-3 pr-3">${escapeHtml(o.buyer)}</td>
              <td class="py-3 pr-3">${escapeHtml(o.status)}</td>
              <td class="py-3 pr-3">${fmtMoney(o.revenue)}</td>
              <td class="py-3 pr-3">${fmtMoney(o.cost)}</td>
              <td class="py-3 pr-3">${fmtMoney(o.fee)}</td>
              <td class="py-3 pr-3 font-semibold">${fmtMoney(profit)}</td>
            </tr>
          `;
        }).join("");
      }

      // chart
      // chart hint
      if (chartHint) {
        const map = {
          revenue_profit: "Выручка и прибыль по дням",
          revenue: "Выручка по дням",
          profit: "Прибыль по дням",
          orders: "Количество заказов по дням",
          margin: "Маржа (%) по дням",
        };
        chartHint.textContent = map[metric] || map.revenue_profit;
      }

      renderChart(summary.chart, metric);
    }

    function mvCard(label, val) {
      return `<div class="p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div class="text-xs text-slate-500">${escapeHtml(label)}</div>
        <div class="mt-1 text-lg font-semibold">${escapeHtml(String(val ?? 0))}</div>
      </div>`;
    }

    function renderChart(chart, metric) {
      const canvas = document.getElementById("finChart");
      const fallback = document.getElementById("finChartFallback");

      if (typeof Chart === "undefined") {
        fallback.classList.remove("hidden");
        return;
      }
      fallback.classList.add("hidden");

      const labels = (chart && chart.labels) ? chart.labels : [];
      const revenue = (chart && chart.revenue) ? chart.revenue : [];
      const profit = (chart && chart.profit) ? chart.profit : [];
      const orders = (chart && chart.orders) ? chart.orders : [];
      const margin = (chart && chart.margin) ? chart.margin : [];

      // destroy old
      if (chartInstance) {
        try { chartInstance.destroy(); } catch (e) {}
        chartInstance = null;
      }

      let datasets = [];
      let yBeginAtZero = true;
      let yTitle = "";

      if (metric === "revenue") {
        datasets = [{ label: "Выручка", data: revenue, tension: 0.35 }];
        yTitle = "RUB";
      } else if (metric === "profit") {
        datasets = [{ label: "Прибыль", data: profit, tension: 0.35 }];
        yTitle = "RUB";
      } else if (metric === "orders") {
        datasets = [{ label: "Заказы", data: orders, tension: 0.35 }];
        yTitle = "шт";
      } else if (metric === "margin") {
        datasets = [{ label: "Маржа %", data: margin, tension: 0.35 }];
        yBeginAtZero = false;
        yTitle = "%";
      } else {
        datasets = [
          { label: "Выручка", data: revenue, tension: 0.35 },
          { label: "Прибыль", data: profit, tension: 0.35 },
        ];
        yTitle = "RUB";
      }

      chartInstance = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true } },
          scales: {
            x: { ticks: { maxRotation: 0 } },
            y: { beginAtZero: yBeginAtZero, title: { display: !!yTitle, text: yTitle } }
          }
        }
      });
    }

    function exportReport() {
      if (!lastSummary) { toast("Нет данных для экспорта", "info"); return; }
      if (typeof XLSX === "undefined") { toast("SheetJS (XLSX) не найден — экспорт недоступен", "info"); return; }

      try {
        const s = lastSummary;
        const r = s.range;
        const f = s.filters || {};
        const fromD = new Date(r.from);
        const toD = new Date(r.to - 1);
        const label = `${fromD.toLocaleDateString("ru-RU")} — ${toD.toLocaleDateString("ru-RU")}`;

        const kpiRows = [
          ["Период", label],
          ["Платформа", f.platform && f.platform !== "all" ? f.platform : "Все"],
          ["Товар", f.product && f.product !== "all" ? (s.options && s.options.products ? (s.options.products.find(p=>String(p.id)===String(f.product))||{}).name : f.product) : "Все"],
          ["Статус", f.status && f.status !== "all" ? f.status : "Все"],
          [],
          ["Выручка", Number(s.totals.revenue || 0)],
          ["Комиссии", Number(s.totals.fee || 0)],
          ["Себестоимость", Number(s.totals.cost || 0)],
          ["Чистая прибыль", Number(s.totals.profit || 0)],
          [],
          ["Заказы", Number(s.totals.orders || 0)],
          ["Выполнено", Number(s.totals.done || 0)],
          ["Проблемные", Number(s.totals.problem || 0)],
        ];

        const orders = (s.lastOrdersFull || null) || []; // optional, see below
        const allOrders = (s._exportOrders && Array.isArray(s._exportOrders)) ? s._exportOrders : null;
        const exportOrders = allOrders || orders;

        const orderRows = [[
          "Дата", "Платформа", "Покупатель", "Статус", "Выручка", "Себестоимость", "Комиссия", "Профит", "Кол-во", "ProductId", "VariantId", "Комментарий"
        ]];

        for (const o of exportOrders) {
          const dt = new Date(o.ts);
          const when = isFinite(dt.getTime()) ? dt.toLocaleString("ru-RU") : "";
          const prof = (Number(o.revenue||0) - Number(o.fee||0) - Number(o.cost||0));
          orderRows.push([
            when,
            o.platform || "",
            o.buyer || "",
            o.status || "",
            Number(o.revenue || 0),
            Number(o.cost || 0),
            Number(o.fee || 0),
            Number(prof || 0),
            Number(o.qty || 1),
            o.productId || "",
            o.variantId || "",
            o.note || "",
          ]);
        }

        const wb = XLSX.utils.book_new();
        const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
        const wsOrders = XLSX.utils.aoa_to_sheet(orderRows);
        XLSX.utils.book_append_sheet(wb, wsKpi, "KPI");
        XLSX.utils.book_append_sheet(wb, wsOrders, "Orders");

        const safeDate = `${fromD.getFullYear()}-${String(fromD.getMonth()+1).padStart(2,'0')}-${String(fromD.getDate()).padStart(2,'0')}`;
        const fname = `SellerOS_Report_${safeDate}.xlsx`;
        XLSX.writeFile(wb, fname);
        toast("Отчёт выгружен в Excel", "success");
      } catch (e) {
        console.error(e);
        toast("Не удалось экспортировать отчёт", "info");
      }
    }

    presetSel.addEventListener("change", loadAndRender);
    if (metricSel) metricSel.addEventListener("change", loadAndRender);
    if (filterPlatform) filterPlatform.addEventListener("change", loadAndRender);
    if (filterProduct) filterProduct.addEventListener("change", loadAndRender);
    if (filterStatus) filterStatus.addEventListener("change", loadAndRender);
    reloadBtn.addEventListener("click", loadAndRender);
    if (exportBtn) exportBtn.addEventListener("click", exportReport);

    await loadAndRender();
  }

  window.FP.Modules.FinanceModule = {
    render: () => `<div id="moduleRoot"></div>`,
    mount: async () => {
      const root = document.getElementById("moduleRoot");
      if (!root) return;
      root.innerHTML = render();
      try { await mount(); } catch (e) { console.error("Finance v2 mount error:", e); toast("Ошибка модуля «Бухгалтерия»", "info"); }
    }
  };
})();
