(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};

  const { Storage, Keys } = window.FP;
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);
  const escapeHtml = typeof ui.escapeHtml === "function" ? ui.escapeHtml : (s) => String(s ?? "");


  const PROFILES = {
    funpay: {
      name: "FunPay",
      theme: "light",
      accent: "#3b82f6",
      density: "comfortable",
      sidebarCollapsed: false
    },
    boostx: {
      name: "BoostX",
      theme: "dark",
      accent: "#22c55e",
      density: "comfortable",
      sidebarCollapsed: false
    },
    minimal: {
      name: "Minimal Dark",
      theme: "dark",
      accent: "#94a3b8",
      density: "compact",
      sidebarCollapsed: true
    }
  };

  function applyThemeToDom(theme){
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.dataset.theme = theme; // backward-compat
  }

  function updatePreviewUI(){
    const dens = Storage.get(Keys.DENSITY, "comfortable");
    const money = document.getElementById("prevMoney");
    const d = document.getElementById("prevDensity");
    if (d) d.textContent = dens;
    if (money) {
      const cur = (Storage.get(Keys.CUSTOM, {})?.finance?.currency) || "RUB";
      money.textContent = (typeof ui.fmtMoney === "function" ? ui.fmtMoney(1290, cur) : "1290 " + cur);
    }
  }


  const SettingsModule = {
    render() {
      const theme = Storage.get(Keys.THEME, "dark");
      const collapsed = Storage.get(Keys.SIDEBAR, false);
      const density = Storage.get(Keys.DENSITY, "comfortable");
      const accent = Storage.get(Keys.ACCENT, "#22c55e");
      const custom = Storage.get(Keys.CUSTOM, {
        orders: { showColumns: { platform:true, buyer:true, profit:true, status:true } },
        finance: { currency: "RUB" }
      });
      return `
        <div class="max-w-3xl mx-auto space-y-4">
          <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
            <div class="text-lg font-semibold mb-2">Кастомизация</div>
            <div class="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Тема, акцент, плотность, отображение колонок и технические настройки.
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div class="font-medium">Тема</div>
                  <div class="text-xs text-slate-500">Светлая / Тёмная / Синяя</div>
                </div>
                <select id="themeSel" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                  <option value="light" ${theme === "light" ? "selected" : ""}>Светлая</option>
                  <option value="dark" ${theme === "dark" ? "selected" : ""}>Тёмная</option>
                  <option value="blue" ${theme === "blue" ? "selected" : ""}>Синяя</option>
                </select>
              </div>

              <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div class="font-medium">Акцентный цвет</div>
                  <div class="text-xs text-slate-500">Основные кнопки/акценты</div>
                </div>
                <input id="accentInp" type="color" class="w-12 h-10 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(accent)}" />
              </div>

              <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div class="font-medium mb-1">Профили оформления</div>
                <div class="text-xs text-slate-500 mb-3">Готовые наборы: тема + акцент + плотность (можно потом вручную подстроить).</div>
                <div class="flex flex-wrap gap-2">
                  <button class="fp-profile-btn px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" data-profile="funpay">FunPay</button>
                  <button class="fp-profile-btn px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" data-profile="boostx">BoostX</button>
                  <button class="fp-profile-btn px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" data-profile="minimal">Minimal Dark</button>
                </div>
                <div id="profileHint" class="text-xs text-slate-500 mt-2"></div>
              </div>

              <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div class="font-medium mb-1">Превью (как будет выглядеть)</div>
                <div class="text-xs text-slate-500 mb-3">Меняй тему/акцент/плотность — превью обновляется сразу.</div>

                <div id="uiPreview" class="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-white/60 dark:bg-[#0b1326]/60">
                  <div class="flex flex-wrap items-center gap-2 mb-3">
                    <button class="px-4 py-2 rounded-xl fp-btn-primary">Primary</button>
                    <button class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Secondary</button>
                    <span class="px-3 py-1 rounded-full text-xs border border-slate-200 dark:border-slate-700">Badge</span>
                  </div>

                  <div class="fp-card fp-surface border border-slate-200 dark:border-slate-800 rounded-2xl">
                    <div class="flex items-center justify-between mb-3">
                      <div class="font-medium">Пример формы</div>
                      <span class="text-xs text-slate-500">density: <span id="prevDensity"></span></span>
                    </div>
                    <input class="fp-input w-full mb-3" placeholder="Поиск / ввод…" />
                    <div class="overflow-x-auto">
                      <table class="fp-table w-full">
                        <thead>
                          <tr>
                            <th class="text-left">Товар</th>
                            <th class="text-left">Статус</th>
                            <th class="text-right">Сумма</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Подписчики</td>
                            <td><span class="px-2 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-700">В работе</span></td>
                            <td class="text-right"><span id="prevMoney"></span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>


              <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div class="font-medium">Плотность интерфейса</div>
                  <div class="text-xs text-slate-500">Комфортно / Компактно</div>
                </div>
                <select id="densitySel" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                  <option value="comfortable" ${density === "comfortable" ? "selected" : ""}>Комфортная</option>
                  <option value="compact" ${density === "compact" ? "selected" : ""}>Компактная</option>
                </select>
              </div>

              <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div class="font-medium">Боковое меню</div>
                  <div class="text-xs text-slate-500">Свернуть / Развернуть</div>
                </div>
                <button id="sidebarToggle" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                  ${collapsed ? "Развернуть" : "Свернуть"}
                </button>
              </div>

              <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div class="font-medium">Отображение в «Учет заказов»</div>
                <div class="text-xs text-slate-500 mb-2">Какие колонки показывать (быстрее работать на маленьком экране).</div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  ${checkbox("col_platform","Платформа", custom.orders?.showColumns?.platform)}
                  ${checkbox("col_buyer","Покупатель", custom.orders?.showColumns?.buyer)}
                  ${checkbox("col_profit","Прибыль", custom.orders?.showColumns?.profit)}
                  ${checkbox("col_status","Статус", custom.orders?.showColumns?.status)}
                </div>
                <button id="saveCols" class="mt-3 px-4 py-2 rounded-xl fp-btn-primary">Сохранить настройки колонок</button>
              </div>

              <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div class="font-medium">Сброс фильтров и состояния UI</div>
                <div class="text-xs text-slate-500 mb-2">Полезно, если «залипли» фильтры/поиск/вкладки.</div>
                <button id="uiReset" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Сбросить состояние UI
                </button>
              </div>

              <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div class="font-medium">Бэкап и восстановление</div>
                <div class="text-xs text-slate-500 mb-3">Экспортирует все данные панели (склад, заказы, бухгалтерия, заметки, настройки) в один файл.</div>
                <div class="flex flex-wrap gap-2">
                  <button id="backupExport" class="px-4 py-2 rounded-xl fp-btn-primary">Скачать бэкап</button>
                  <button id="backupImportBtn" class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Восстановить из файла</button>
                  <button id="backupResetAll" class="px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 hover:bg-rose-50/40 dark:hover:bg-rose-900/20">Сбросить ВСЁ</button>
                </div>
                <input id="backupImport" type="file" accept="application/json,.json" class="hidden" />
                <div id="backupHint" class="text-xs text-slate-500 mt-2"></div>
              </div>
            </div>
          </div>

        </div>
      `;
    },
    mount() {
      const themeSel = document.getElementById("themeSel");
      const sidebarToggle = document.getElementById("sidebarToggle");
      const uiReset = document.getElementById("uiReset");
      const backupExport = document.getElementById("backupExport");
      const backupImport = document.getElementById("backupImport");
      const backupImportBtn = document.getElementById("backupImportBtn");
      const backupResetAll = document.getElementById("backupResetAll");
      const backupHint = document.getElementById("backupHint");

      const densitySel = document.getElementById("densitySel");
      const accentInp = document.getElementById("accentInp");


      const profileBtns = Array.from(document.querySelectorAll(".fp-profile-btn"));
      const profileHint = document.getElementById("profileHint");

      // init preview
      updatePreviewUI();

      function rerenderApp(){
        // Reboot app to apply layout-related settings (sidebar, density, etc.)
        if (window.FP?.App?.reboot) window.FP.App.reboot();
      }

      profileBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-profile");
          const p = PROFILES[key];
          if (!p) return;

          Storage.set(Keys.THEME, p.theme);
          Storage.set(Keys.ACCENT, p.accent);
          Storage.set(Keys.DENSITY, p.density);
          Storage.set(Keys.SIDEBAR, !!p.sidebarCollapsed);

          // update controls
          if (themeSel) themeSel.value = p.theme;
          if (accentInp) accentInp.value = p.accent;
          if (densitySel) densitySel.value = p.density;

          applyThemeToDom(p.theme);
          if (ui.applyCustomization) ui.applyCustomization();
          updatePreviewUI();

          if (profileHint) profileHint.textContent = `Применён профиль: ${p.name}`;
          toast(`Профиль «${p.name}» применён`, "ok");
          rerenderApp();
        });
      });

      themeSel.addEventListener("change", () => {
        const t = themeSel.value;
        Storage.set(Keys.THEME, t);
        applyThemeToDom(t);
        if (ui.applyCustomization) ui.applyCustomization();
        updatePreviewUI();
        toast("Тема сохранена", "ok");
      });

      densitySel.addEventListener("change", () => {
        Storage.set(Keys.DENSITY, densitySel.value);
        if (ui.applyCustomization) ui.applyCustomization();
        updatePreviewUI();
        toast("Плотность сохранена", "ok");
      });

      accentInp.addEventListener("change", () => {
        Storage.set(Keys.ACCENT, accentInp.value);
        if (ui.applyCustomization) ui.applyCustomization();
        updatePreviewUI();
        toast("Акцент сохранён", "ok");
      });

      sidebarToggle.addEventListener("click", () => {
        const next = !Storage.get(Keys.SIDEBAR, false);
        Storage.set(Keys.SIDEBAR, next);
        toast(next ? "Меню свернуто" : "Меню развернуто", "ok");
        rerenderApp();
      });

      uiReset.addEventListener("click", () => {
        if (window.FP?.State?.reset) window.FP.State.reset();
        else Storage.del(Keys.UI_STATE);
        toast("UI-состояние сброшено", "ok");
      });

      // ---- Backup / restore ----
      function buildBackup(){
        const meta = {
          format: "SellerOSBackup",
          createdAt: Date.now(),
          schema: window.FP?.Migrations?.CURRENT_SCHEMA || 0,
          keys: []
        };
        const data = {};
        const keys = (typeof window.FP.listAppKeys === "function") ? window.FP.listAppKeys() : [];
        meta.keys = keys;
        keys.forEach((k) => {
          data[k] = Storage.get(k, null);
        });
        return { meta, data };
      }

      function downloadJson(filename, obj){
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=>URL.revokeObjectURL(url), 300);
      }

      async function confirmAction(title, message){
        if (ui.confirm) return await ui.confirm({ title, message });
        return confirm(title + "\n\n" + message);
      }

      backupExport?.addEventListener("click", () => {
        const payload = buildBackup();
        const date = new Date();
        const stamp = date.toISOString().slice(0,10);
        downloadJson(`SellerOS_backup_${stamp}.json`, payload);
        toast("Бэкап скачан", "ok");
      });

      backupImportBtn?.addEventListener("click", () => backupImport?.click());

      backupImport?.addEventListener("change", async () => {
        const file = backupImport.files && backupImport.files[0];
        if (!file) return;
        try{
          const text = await file.text();
          const obj = JSON.parse(text);
          const okFormat = obj && obj.meta && obj.meta.format === "SellerOSBackup" && obj.data;
          if (!okFormat) {
            toast("Неверный формат бэкапа", "err");
            if (backupHint) backupHint.textContent = "Файл не похож на бэкап SellerOS.";
            return;
          }

          const ok = await confirmAction("Восстановить данные?", "Текущие данные будут перезаписаны. Рекомендуется сначала скачать бэкап.");
          if (!ok) return;

          // Clear app keys and restore from backup
          const keys = (typeof window.FP.listAppKeys === "function") ? window.FP.listAppKeys() : [];
          keys.forEach((k) => Storage.del(k));
          Object.keys(obj.data || {}).forEach((k) => {
            try{ Storage.set(k, obj.data[k]); }catch(e){}
          });

          // Run migrations after restore
          try{ window.FP?.Migrations?.run && window.FP.Migrations.run(); }catch(e){}

          toast("Данные восстановлены", "ok");
          rerenderApp();
        }catch(e){
          console.error(e);
          toast("Не удалось импортировать бэкап", "err");
        }finally{
          backupImport.value = "";
        }
      });

      backupResetAll?.addEventListener("click", async () => {
        const ok = await confirmAction("Сбросить ВСЁ?", "Будут удалены склад, заказы, бухгалтерия, заметки и настройки. Действие необратимо.");
        if (!ok) return;
        const keys = (typeof window.FP.listAppKeys === "function") ? window.FP.listAppKeys() : [];
        keys.forEach((k) => Storage.del(k));
        try{ window.FP?.Migrations?.run && window.FP.Migrations.run(); }catch(e){}
        toast("Данные сброшены", "ok");
        rerenderApp();
      });

      document.getElementById("saveCols").addEventListener("click", () => {
        const custom = Storage.get(Keys.CUSTOM, {});
        custom.orders = custom.orders || {};
        custom.orders.showColumns = {
          platform: !!document.getElementById("col_platform").checked,
          buyer: !!document.getElementById("col_buyer").checked,
          profit: !!document.getElementById("col_profit").checked,
          status: !!document.getElementById("col_status").checked,
        };
        Storage.set(Keys.CUSTOM, custom);
        toast("Колонки сохранены", "ok");
      });

      // Local-only version: no backend/API settings
    }
  };

  function checkbox(id,label,checked){
    return `
      <label class="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
        <input id="${id}" type="checkbox" ${checked ? "checked":""}/>
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  window.FP.Modules.SettingsModule = SettingsModule;
})();
