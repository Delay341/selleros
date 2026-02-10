(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};

  const { Storage, Keys } = window.FP;
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);
  const escapeHtml = typeof ui.escapeHtml === "function" ? ui.escapeHtml : (s) => String(s ?? "");

  function safeUser(){
    const u = Storage.get(Keys.USER, null);
    if (u && typeof u === "object") return u;
    const def = { name: "Пользователь", avatar: "https://placehold.co/128x128?text=SO", role: "Seller", email: "", phone: "", funpay: "", createdAt: Date.now() };
    Storage.set(Keys.USER, def);
    return def;
  }

  function render(){
    const u = safeUser();
    return `
      <div class="max-w-5xl mx-auto space-y-4">
        <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
          <div class="flex items-center gap-4">
            <img src="${escapeHtml(u.avatar)}" class="w-16 h-16 rounded-2xl bg-slate-200 object-cover" />
            <div class="flex-1">
              <div class="text-xl font-semibold">${escapeHtml(u.name)}</div>
              <div class="text-sm text-slate-500">${escapeHtml(u.role || "Seller")} • ${u.funpay ? `FunPay: ${escapeHtml(u.funpay)}` : "профиль не настроен"}</div>
            </div>
            <button id="profEdit" class="px-4 py-2 rounded-xl fp-btn-primary">Редактировать</button>
          </div>

          <div class="mt-4 grid md:grid-cols-2 gap-3 text-sm">
            <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="text-xs text-slate-500">Контакты</div>
              <div class="mt-1 font-medium">${escapeHtml(u.email || "—")}</div>
              <div class="text-xs text-slate-500 mt-1">${escapeHtml(u.phone || "")}</div>
            </div>
            <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="text-xs text-slate-500">Режим</div>
              <div class="mt-1 font-medium">Локальный (данные сохраняются в браузере)</div>
              <div class="text-xs text-slate-500 mt-1">Рекомендуется делать резервные копии через экспорт JSON</div>
            </div>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
            <div class="text-lg font-semibold">Предпочтения</div>
            <div class="text-xs text-slate-500 mt-1">То, как выглядит панель и как тебе удобно работать.</div>

            <div class="mt-4 space-y-3 text-sm">
              <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div class="font-medium">Плотность интерфейса</div>
                  <div class="text-xs text-slate-500">Комфортная / Компактная</div>
                </div>
                <select id="profDensity" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                  <option value="comfortable">Комфортная</option>
                  <option value="compact">Компактная</option>
                </select>
              </div>

              <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div class="font-medium">Акцентный цвет</div>
                  <div class="text-xs text-slate-500">Влияет на основные кнопки</div>
                </div>
                <input id="profAccent" type="color" class="w-12 h-10 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" />
              </div>

              <button id="profSavePrefs" class="w-full px-4 py-2 rounded-xl fp-btn-primary">Сохранить предпочтения</button>
            </div>
          </div>

          <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
            <div class="text-lg font-semibold">Быстрые ссылки</div>
            <div class="text-xs text-slate-500 mt-1">Чтобы не искать каждый раз.</div>

            <div class="mt-4 grid grid-cols-2 gap-2 text-sm">
              <a href="#/orders" class="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">🧾 Учет заказов</a>
              <a href="#/inventory" class="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">📦 Склад</a>
              <a href="#/finance" class="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">📊 Бухгалтерия</a>
              <a href="#/settings" class="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">⚙️ Настройки</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function mount(){
    const root = document.getElementById("moduleRoot");
    if (!root) return;
    root.innerHTML = render();

    // apply saved prefs
    const densitySel = document.getElementById("profDensity");
    const accentInp = document.getElementById("profAccent");
    densitySel.value = Storage.get(Keys.DENSITY, "comfortable");
    accentInp.value = Storage.get(Keys.ACCENT, "#22c55e");

    document.getElementById("profSavePrefs").addEventListener("click", () => {
      Storage.set(Keys.DENSITY, densitySel.value);
      Storage.set(Keys.ACCENT, accentInp.value);
      if (ui.applyCustomization) ui.applyCustomization();
      toast("Предпочтения сохранены", "ok");
    });

    document.getElementById("profEdit").addEventListener("click", () => openEditModal());
  }

  function openEditModal(){
    const u = safeUser();
    const wrap = document.createElement("div");
    wrap.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4";
    wrap.innerHTML = `
      <div class="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#0d162a] border border-slate-200 dark:border-slate-800 shadow-xl">
        <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div class="font-semibold">Редактировать профиль</div>
          <button class="close px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">✕</button>
        </div>
        <div class="p-4 grid md:grid-cols-2 gap-3 text-sm">
          <div class="md:col-span-2">
            <div class="text-xs text-slate-500 mb-1">Имя</div>
            <input id="uName" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(u.name)}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Email</div>
            <input id="uEmail" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(u.email||"")}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Телефон</div>
            <input id="uPhone" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(u.phone||"")}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Ник/ссылка FunPay</div>
            <input id="uFunpay" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(u.funpay||"")}"/>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">Аватар (URL)</div>
            <input id="uAvatar" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" value="${escapeHtml(u.avatar||"")}"/>
          </div>
        </div>
        <div class="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button class="save px-4 py-2 rounded-xl fp-btn-primary">Сохранить</button>
        </div>
      </div>
    `;
    wrap.querySelector(".close").addEventListener("click", ()=>wrap.remove());
    wrap.addEventListener("click", (e)=>{ if (e.target===wrap) wrap.remove(); });
    wrap.querySelector(".save").addEventListener("click", ()=>{
      u.name = (wrap.querySelector("#uName").value || "").trim() || "Пользователь";
      u.email = (wrap.querySelector("#uEmail").value || "").trim();
      u.phone = (wrap.querySelector("#uPhone").value || "").trim();
      u.funpay = (wrap.querySelector("#uFunpay").value || "").trim();
      u.avatar = (wrap.querySelector("#uAvatar").value || "").trim() || u.avatar;
      Storage.set(Keys.USER, u);
      toast("Профиль сохранён", "ok");
      wrap.remove();
      const root = document.getElementById("moduleRoot");
      if (root) root.innerHTML = render(), mount();
    });
    document.body.appendChild(wrap);
  }

  window.FP.Modules.ProfileModule = {
    render: () => `<div id="moduleRoot"></div>`,
    mount
  };
})();
