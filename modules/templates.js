(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};
  
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);

  const templates = [
    { cat: "Благодарность за заказ", items: [
      "Спасибо за заказ! ✅ Если будут вопросы — пишите, всегда на связи.",
      "Благодарю за покупку! ✨ Выполнение начну прямо сейчас, отпишусь по результату."
    ]},
    { cat: "Просьба об отзыве", items: [
      "Если всё понравилось — буду благодарен за отзыв ⭐ Это очень помогает магазину!",
      "Готово ✅ Если не сложно — оставьте, пожалуйста, отзыв. Спасибо!"
    ]},
    { cat: "Ответ на вопрос", items: [
      "Да, актуально ✅ Уточните, пожалуйста: ник/платформа/нужное количество — и стартуем.",
      "Срок обычно: 5–30 минут (зависит от нагрузки). Могу начать сразу после оплаты ✅"
    ]}
  ];

  const TemplatesModule = {
    render() {
      return `
        <div class="max-w-4xl mx-auto space-y-4">
          <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
            <div class="text-lg font-semibold">Шаблоны сообщений</div>
            <div class="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Клик по шаблону → копирование в буфер обмена.
            </div>
          </div>

          ${templates.map(group => `
            <div class="fp-card p-5 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
              <div class="font-semibold mb-3">${group.cat}</div>
              <div class="space-y-2">
                ${group.items.map(t => `
                  <button class="tpl w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" data-text="${t.replaceAll('"', "&quot;")}">
                    <div class="text-sm">${t}</div>
                    <div class="text-xs text-slate-500 mt-1">Нажми, чтобы скопировать</div>
                  </button>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      `;
    },

    mount(root) {
      root.querySelectorAll(".tpl").forEach(btn => {
        btn.addEventListener("click", async () => {
          const text = btn.getAttribute("data-text");
          try {
            await navigator.clipboard.writeText(text);
            toast("Скопировано ✅", "ok");
          } catch {
            toast("Не удалось скопировать (разрешения браузера)", "err");
          }
        });
      });
    }
  };

  window.FP.Modules["TemplatesModule"] = TemplatesModule;
})();