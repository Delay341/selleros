(function(){
  function escapeHtml(str = "") {
    const s = String(str ?? "");
    return s
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("\'").join("&#39;");
  }

  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className =
      "fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm " +
      (type === "ok"
        ? "bg-emerald-600 text-white"
        : type === "err"
          ? "bg-rose-600 text-white"
          : "bg-slate-900 text-white");

    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function fmtMoney(n, currency = "RUB") {
    const num = Number(n || 0);
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(num);
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString("ru-RU");
  }

  function applyCustomization(){
    try{
      const Keys = (window.FP && window.FP.Keys) || {};
      const Storage = (window.FP && window.FP.Storage) || null;
      if (!Storage || !Keys) return;
      const accent = Storage.get(Keys.ACCENT, "#22c55e"); // default green
      const density = Storage.get(Keys.DENSITY, "comfortable"); // comfortable|compact
      document.documentElement.style.setProperty("--accent", accent);
      document.documentElement.dataset.density = density;
    }catch(e){}
  }

  function emptyState({ icon="✨", title="Пока пусто", desc="Добавь первый элемент, чтобы начать.", actionLabel="", actionId="" } = {}){
    const btn = actionLabel && actionId
      ? `<button id="${escapeHtml(actionId)}" class="fp-btn px-4 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90 dark:bg-slate-100 dark:text-slate-900">${escapeHtml(actionLabel)}</button>`
      : "";
    return `
      <div class="fp-empty">
        <div class="fp-empty-ico">${icon}</div>
        <div class="fp-empty-title">${escapeHtml(title)}</div>
        <div class="fp-empty-desc">${escapeHtml(desc)}</div>
        ${btn ? `<div class="mt-4">${btn}</div>` : ""}
      </div>
    `;
  }

  function modal({ title="Окно", icon="🧩", body="", actions=[] } = {}){
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "fp-overlay open";
      overlay.innerHTML = `
        <div class="fp-modal bg-white dark:bg-[#0d162a] fp-surface">
          <div class="fp-modal-header">
            <div class="fp-result-ico">${icon}</div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold">${escapeHtml(title)}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">Esc — закрыть</div>
            </div>
            <button data-x class="fp-btn px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">✖</button>
          </div>
          <div class="p-4 fp-scroll" style="max-height: 520px;">${body}</div>
          ${actions.length ? `
            <div class="p-4 pt-0 flex items-center justify-end gap-2">
              ${actions.map(a => {
                const variant = a.variant || "ghost"; // ghost|primary|danger
                const cls = variant === "primary"
                  ? "fp-btn px-4 py-2 rounded-xl fp-btn-primary"
                  : variant === "danger"
                    ? "fp-btn px-4 py-2 rounded-xl bg-rose-600 text-white hover:opacity-90"
                    : "fp-btn px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";
                return `<button data-act="${escapeHtml(a.id)}" class="${cls}">${escapeHtml(a.label || a.id)}</button>`;
              }).join("")}
            </div>
          ` : ""}
        </div>
      `;
      document.body.appendChild(overlay);

      let done = false;
      const cleanup = () => {
        window.removeEventListener("keydown", onKey, true);
      };
      const finish = (val) => {
        if (done) return;
        done = true;
        cleanup();
        try{ overlay.remove(); }catch(e){}
        resolve(val);
      };

      function onKey(e){
        if (e.key === "Escape") { e.preventDefault(); finish(null); }
      }

      overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) finish(null); });
      overlay.querySelector("[data-x]")?.addEventListener("click", () => finish(null));
      overlay.querySelectorAll("[data-act]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-act");
          const act = actions.find(x => String(x.id) === String(id));
          finish(act?.value ?? id);
        });
      });
      window.addEventListener("keydown", onKey, true);
    });
  }

  function confirm({ title="Подтвердить", icon="⚠️", message="Вы уверены?", okText="Да", cancelText="Отмена", danger=true } = {}){
    return modal({
      title,
      icon,
      body: `<div class="text-sm text-slate-600 dark:text-slate-300">${escapeHtml(message)}</div>`,
      actions: [
        { id:"cancel", label: cancelText, variant:"ghost", value:false },
        { id:"ok", label: okText, variant: danger ? "danger" : "primary", value:true }
      ]
    });
  }

  window.FP = window.FP || {};
  applyCustomization();
  window.FP.ui = { escapeHtml, toast, fmtMoney, fmtDate, applyCustomization, emptyState, modal, confirm };
})();