(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};
  
  const { Storage, Keys } = window.FP;
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);

  const NotesModule = {
    render() {
      return `
        <div class="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
          <div class="fp-card p-4 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between">
              <div class="font-semibold">Заметки</div>
              <button id="newNote" class="fp-btn px-3 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90">＋</button>
            </div>
            <div id="notesList" class="mt-3 space-y-2"></div>
          </div>

          <div class="md:col-span-2 fp-card p-4 bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800">
            <div class="font-semibold mb-3">Редактор</div>

            <label class="block">
              <div class="text-xs text-slate-500 mb-1">Заголовок</div>
              <input id="noteTitle" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" />
            </label>

            <label class="block mt-3">
              <div class="text-xs text-slate-500 mb-1">Текст</div>
              <textarea id="noteBody" rows="10" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"></textarea>
            </label>

            <div class="mt-4 flex gap-2">
              <button id="saveNote" class="fp-btn px-4 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90">💾 Сохранить</button>
              <button id="delNote" class="fp-btn px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">🗑 Удалить</button>
            </div>

            <div id="noteHint" class="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Выбери заметку слева или создай новую.
            </div>
          </div>
        </div>
      `;
    },

    mount(root) {
      const listEl = root.querySelector("#notesList");
      const titleEl = root.querySelector("#noteTitle");
      const bodyEl = root.querySelector("#noteBody");
      const hintEl = root.querySelector("#noteHint");

      let notes = Storage.get(Keys.NOTES, []);
      let activeId = null;

      const saveAll = () => Storage.set(Keys.NOTES, notes);

      const renderList = () => {
        listEl.innerHTML = "";
        if (!notes.length) {
          listEl.innerHTML = ui.emptyState ? ui.emptyState({ icon:"📝", title:"Заметок пока нет", desc:"Создай первую заметку — и держи быстрые шаблоны/идеи под рукой.", actionLabel:"＋ Новая заметка", actionId:"notesEmptyAdd" }) : `<div class="text-sm text-slate-500">Пока пусто.</div>`;
          root.querySelector("#notesEmptyAdd")?.addEventListener("click", () => root.querySelector("#newNote")?.click());
          return;
        }
        notes
          .slice()
          .sort((a,b) => b.updatedAt - a.updatedAt)
          .forEach(n => {
            const btn = document.createElement("button");
            btn.className =
              "w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";
            if (n.id === activeId) btn.classList.add("bg-slate-50","dark:bg-slate-800");

            btn.innerHTML = `
              <div class="font-medium truncate">${n.title || "Без названия"}</div>
              <div class="text-xs text-slate-500 truncate">${(n.body || "").slice(0, 80)}</div>
            `;

            btn.addEventListener("click", () => {
              activeId = n.id;
              titleEl.value = n.title || "";
              bodyEl.value = n.body || "";
              hintEl.textContent = `Обновлено: ${new Date(n.updatedAt).toLocaleString("ru-RU")}`;
              renderList();
            });

            listEl.appendChild(btn);
          });
      };

      root.querySelector("#newNote").addEventListener("click", () => {
        const note = {
          id: `note_${Date.now()}`,
          title: "Новая заметка",
          body: "",
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        notes.push(note);
        saveAll();
        activeId = note.id;
        titleEl.value = note.title;
        bodyEl.value = "";
        hintEl.textContent = "Новая заметка создана.";
        renderList();
        toast("Заметка создана", "ok");
      });

      root.querySelector("#saveNote").addEventListener("click", () => {
        if (!activeId) return toast("Выбери заметку", "err");
        const n = notes.find(x => x.id === activeId);
        if (!n) return;
        n.title = titleEl.value.trim();
        n.body = bodyEl.value;
        n.updatedAt = Date.now();
        saveAll();
        renderList();
        toast("Сохранено", "ok");
      });

      root.querySelector("#delNote").addEventListener("click", async () => {
        if (!activeId) return toast("Выбери заметку", "err");
        const ok = ui.confirm ? await ui.confirm({ title:"Удалить заметку", message:"Заметка будет удалена без возможности восстановления. Продолжить?", okText:"Удалить", cancelText:"Отмена" }) : confirm("Удалить заметку?");
        if (!ok) return;
        notes = notes.filter(n => n.id !== activeId);
        saveAll();
        activeId = null;
        titleEl.value = "";
        bodyEl.value = "";
        hintEl.textContent = "Удалено.";
        renderList();
        toast("Заметка удалена", "ok");
      });

      renderList();
    }
  };

  window.FP.Modules["NotesModule"] = NotesModule;
})();