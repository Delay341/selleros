(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);

  const CURRENCIES = [
    "RUB","USD","EUR","GBP","TRY","PLN","CZK","CHF","SEK","NOK","DKK",
    "JPY","CNY","KRW","CAD","AUD","UAH","KZT","AED"
  ];

  const CACHE_KEY = "selleros_rates_cache_v1";

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
  }

  function writeCache(obj) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  }

  // Кэшируем на 1 час все курсы ЦБ РФ (к RUB)
  async function getCbrRates() {
    const now = Date.now();
    const cache = readCache();
    if (cache && cache.ts && (now - cache.ts) < 3600_000 && cache.data) {
      return { ...cache.data, _cached: true };
    }

    // Запрос к ЦБ РФ (удобный JSON-эндпоинт)
    const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js");
    if (!res.ok) throw new Error("CBR_HTTP_" + res.status);
    const data = await res.json();

    const val = data?.Valute || {};
    // rubPer[CODE] = RUB за 1 единицу валюты
    const rubPer = { RUB: 1 };
    Object.keys(val).forEach(code => {
      const v = val[code];
      rubPer[code] = Number(v.Value) / Number(v.Nominal);
    });

    const payload = {
      date: (data?.Date || "").slice(0,10) || new Date().toISOString().slice(0,10),
      rubPer
    };

    writeCache({ ts: now, data: payload });
    return { ...payload, _cached: false };
  }

  function rateFromRubPer(rubPerFrom, rubPerTo) {
    // 1 FROM = rubPerFrom RUB; 1 TO = rubPerTo RUB -> 1 FROM в TO:
    return rubPerFrom / rubPerTo;
  }

  async function fetchRate(from, to) {
    // Основной сценарий по твоему ТЗ: https://api.frankfurter.app/latest?from=RUB
    // Но Frankfurter (ECB) обычно НЕ содержит RUB. Поэтому используем ЦБ РФ как основной источник.
    const { date, rubPer, _cached } = await getCbrRates();

    if (!rubPer[from] || !rubPer[to]) {
      // если вдруг валюты нет у ЦБ — попробуем Frankfurter как запасной вариант
      try {
        const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error("FR_HTTP_" + r.status);
        const d = await r.json();
        const rate = d?.rates?.[to];
        if (!rate) throw new Error("FR_NO_RATE");
        return { rate, date: d.date, cached: false, source: "Frankfurter" };
      } catch (e) {
        throw new Error("NO_RATE_FOR_SELECTED_CURRENCY");
      }
    }

    const rate = rateFromRubPer(rubPer[from], rubPer[to]);
    return { rate, date, cached: _cached, source: "CBR" };
  }

  const CurrencyModule = {
    render() {
      const opts = (val) => CURRENCIES.map(c => `<option value="${c}" ${c===val?"selected":""}>${c}</option>`).join("");
      return `
        <div class="max-w-3xl mx-auto space-y-4">
          <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border">
            <div class="text-lg font-semibold">Калькулятор валют</div>
            <div class="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Источник: <b>ЦБ РФ</b> (cbr-xml-daily). Кэш на 1 час. (Если валюты нет у ЦБ — пробуем Frankfurter)
            </div>

            <div class="grid md:grid-cols-4 gap-3 mt-4">
              <label class="block">
                <div class="text-xs text-slate-500 mb-1">Из</div>
                <select id="from" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                  ${opts("RUB")}
                </select>
              </label>

              <label class="block">
                <div class="text-xs text-slate-500 mb-1">В</div>
                <select id="to" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                  ${opts("USD")}
                </select>
              </label>

              <label class="block md:col-span-2">
                <div class="text-xs text-slate-500 mb-1">Сумма</div>
                <input id="amount" type="number" step="0.01" value="1000"
                  class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"/>
              </label>
            </div>

            <div class="mt-4 flex gap-2">
              <button id="calc" class="fp-btn px-4 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90">💱 Рассчитать</button>
              <button id="swap" class="fp-btn px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">🔁 Поменять</button>
            </div>

            <div id="result" class="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 fp-border">
              <div class="text-sm text-slate-500 dark:text-slate-400">Выбери валюты или введи сумму — пересчёт будет автоматически.</div>
            </div>
          </div>
        </div>
      `;
    },

    mount(root) {
      const fromEl = root.querySelector("#from");
      const toEl = root.querySelector("#to");
      const amountEl = root.querySelector("#amount");
      const resultEl = root.querySelector("#result");

      const setLoading = (on) => {
        if (on) {
          resultEl.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span class="inline-block w-4 h-4 rounded-full border border-slate-400 border-t-transparent animate-spin"></span>
            Загружаю курс…
          </div>`;
        }
      };

      const renderResult = ({ from, to, amount, rate, date, cached, source }) => {
        const out = Number(amount) * Number(rate);
        resultEl.innerHTML = `
          <div class="text-sm text-slate-500 dark:text-slate-400">
            Дата: <b>${date}</b> · Источник: <b>${source}</b>${cached ? ' <span class="ml-2 text-xs">(кэш)</span>' : ''}
          </div>
          <div class="mt-2 text-2xl font-semibold">
            ${amount} ${from} → ${out.toFixed(2)} ${to}
          </div>
          <div class="mt-1 text-sm">
            Курс: <b>1 ${from} = ${Number(rate).toFixed(6)} ${to}</b>
          </div>
        `;
      };

      const recalc = async () => {
        const from = fromEl.value;
        const to = toEl.value;
        const amount = Number(amountEl.value || 0);
        setLoading(true);
        try {
          const { rate, date, cached, source } = await fetchRate(from, to);
          renderResult({ from, to, amount, rate, date, cached, source });
        } catch (e) {
          console.error(e);
          // Часто на file:// бывает "Failed to fetch" из-за CORS
          const msg = String(e.message || e);
          toast("Не удалось получить курс — см. детали в блоке результата", "err");
          resultEl.innerHTML = `<div class="text-sm text-rose-400">
            Ошибка получения курса: ${msg.replaceAll("<","&lt;").slice(0,220)}
            <div class="mt-2 text-xs text-slate-500">
              Если открываешь через <b>file://</b> и браузер блокирует запросы — запусти локально:
              <code class="block mt-1">python -m http.server</code>
              и открой <b>http://127.0.0.1:8000/</b>
            </div>
          </div>`;
        }
      };

      root.querySelector("#swap").addEventListener("click", () => {
        const a = fromEl.value;
        fromEl.value = toEl.value;
        toEl.value = a;
        recalc();
      });

      root.querySelector("#calc").addEventListener("click", recalc);
      fromEl.addEventListener("change", recalc);
      toEl.addEventListener("change", recalc);
      amountEl.addEventListener("input", recalc);

      // first calc
      recalc();
    }
  };

  window.FP.Modules["CurrencyModule"] = CurrencyModule;
})();