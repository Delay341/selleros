(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};
  const { Storage, Keys } = window.FP;
  const ui = window.FP.ui || {};
  const toast = typeof ui.toast === "function" ? ui.toast : (m) => console.log("[toast]", m);
  const escapeHtml = typeof ui.escapeHtml === "function" ? ui.escapeHtml : (s) => String(s ?? "");

  // Provider prefs: openrouter | pollinations | offline
  function getPrefs(){
    return Storage.get("selleros_ai_prefs_v2", { provider: "openrouter" });
  }
  function setPrefs(p){ Storage.set("selleros_ai_prefs_v2", p); }

  function getSystemPrompt() {
    const s = Storage.get(Keys.AI) || {};
    return s.systemPrompt || "Ты — помощник для продавцов на FunPay. Отвечай кратко, по делу, помогай с составлением ответов покупателям, описанием товаров, решением типичных проблем. Не выдумывай факты; если данных не хватает — уточняй.";
  }

  // ---- OpenRouter ----
  function getOpenRouter(){
    return Storage.get(Keys.OPENROUTER, {
      apiKey: "",
      // Prefer the canonical model id. If you want a free-tier alias, pick :free in the dropdown.
      model: "meta-llama/llama-3.1-8b-instruct",
      temperature: 0.7,
      maxTokens: 700
    });
  }
  function setOpenRouter(v){ Storage.set(Keys.OPENROUTER, v); }

  async function sendOpenRouter({ apiKey, model, systemPrompt, userText, temperature = 0.7, maxTokens = 700 }) {
    async function call(modelId) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Recommended by OpenRouter for analytics/attribution:
          "HTTP-Referer": location.origin || "file://",
          "X-Title": "SellerOS"
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText }
          ],
          temperature,
          max_tokens: maxTokens
        })
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`OPENROUTER_${res.status}: ${t || res.statusText}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("OPENROUTER_EMPTY_RESPONSE");
      return content;
    }

    // Some OpenRouter "free" aliases may be unavailable at times.
    // If we get a 404 for a model ending with ":free", retry once without the suffix.
    try {
      return await call(model);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("OPENROUTER_404") && typeof model === "string" && model.endsWith(":free")) {
        const fallback = model.replace(/:free$/i, "");
        return await call(fallback);
      }
      throw e;
    }
  }

  // ---- Pollinations (free, no-key) ----
  async function sendPollinations(systemPrompt, userText) {
    const full = `${systemPrompt}\n\nПользователь: ${userText}\nАссистент:`;
    const url = `https://text.pollinations.ai/${encodeURIComponent(full)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("POLL_HTTP_" + res.status);
    return await res.text();
  }

  function render() {
    const prefs = getPrefs();
    const or = getOpenRouter();

    const provBtn = (id, title, desc) => `
      <button data-prov="${id}" class="provBtn px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 ${prefs.provider===id ? "bg-slate-50 dark:bg-slate-800" : ""}">
        <div class="text-sm font-semibold">${title}</div>
        <div class="text-xs opacity-70">${desc}</div>
      </button>
    `;

    return `
      <div class="p-4 space-y-4">
        <div class="fp-card bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border p-4">
          <div class="flex flex-col gap-3 md:flex-row md:items-stretch md:justify-between">
            <div class="flex-1">
              <div class="text-sm font-semibold mb-2">Провайдер ИИ</div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                ${provBtn("openrouter", "OpenRouter", "Лучше качество. Нужен API key.")}
                ${provBtn("pollinations", "Free (без ключа)", "Простой бесплатный текст-генератор.")}
                ${provBtn("offline", "Оффлайн", "Без запросов в сеть. Только шаблоны.")}
              </div>
              <div class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                ⚠️ Не вшивай ключ в код — держи его только у себя.
              </div>
            </div>

            <div class="w-full md:w-[420px]">
              <div class="text-sm font-semibold mb-2">OpenRouter настройки</div>
              <div class="space-y-2">
                <input id="orKey" type="password" placeholder="OpenRouter API key (sk-or-...)" value="${escapeHtml(or.apiKey || "")}"
                  class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"/>
                <select id="orModel" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent">
                  <option value="meta-llama/llama-3.1-8b-instruct">meta-llama/llama-3.1-8b-instruct</option>
                  <option value="meta-llama/llama-3.1-8b-instruct:free">meta-llama/llama-3.1-8b-instruct:free (если доступно)</option>
                  <option value="google/gemma-7b-it:free">google/gemma-7b-it:free</option>
                  <option value="mistralai/mistral-7b-instruct:free">mistralai/mistral-7b-instruct:free</option>
                </select>
                <div class="flex gap-2">
                  <input id="orTemp" type="number" step="0.1" min="0" max="2" value="${escapeHtml(or.temperature ?? 0.7)}"
                    class="w-1/2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="temperature"/>
                  <input id="orMax" type="number" step="50" min="100" max="2000" value="${escapeHtml(or.maxTokens ?? 700)}"
                    class="w-1/2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" placeholder="max tokens"/>
                </div>
                <button id="orSave" class="w-full fp-btn px-4 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90">Сохранить</button>
              </div>
            </div>
          </div>
        </div>

        <div class="fp-card bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border p-4">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="text-sm font-semibold">Быстрые запросы</div>
            <div class="flex gap-2 flex-wrap">
              <button class="chip px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" data-q="Сделай вежливый ответ покупателю: задержка выполнения заказа, уточни ник/ссылку, обозначь сроки и гарантию.">Задержка заказа</button>
              <button class="chip px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" data-q="Составь ответ на претензию (клиент недоволен качеством): извинись, уточни детали, предложи решение и компенсацию/перезапуск, держи деловой тон.">Ответ на претензию</button>
              <button class="chip px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" data-q="Сделай описание лота для FunPay: что входит, сроки, гарантия, условия, ограничения. Коротко и структурировано.">Описание лота</button>
            </div>
          </div>
        </div>

        <div class="fp-card bg-white dark:bg-[#0d162a] fp-surface border border-slate-200 dark:border-slate-800 fp-border overflow-hidden">
          <div id="chatLog" class="h-[420px] overflow-auto fp-scroll p-4 space-y-3">
            <div class="text-sm text-slate-500 dark:text-slate-400">
              Опиши ситуацию или вставь текст покупателя — я подготовлю ответ.
            </div>
          </div>

          <div class="p-3 border-t border-slate-200 dark:border-slate-800 fp-border flex gap-2">
            <input id="chatInput" placeholder="Сообщение…"
              class="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent"/>
            <button id="send" class="fp-btn px-4 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90">Отправить</button>
          </div>
        </div>
      </div>
    `;
  }

  function offlineAnswer(userText) {
    // Small deterministic helper when offline
    const t = userText.toLowerCase();
    if (t.includes("претенз") || t.includes("недоволен") || t.includes("плохо")) {
      return [
        "Понимаю вас. Приношу извинения за неудобства.",
        "Давайте уточним детали: что именно не устроило и какой результат вы ожидали?",
        "Предлагаю решение: перезапуск услуги / корректировка / частичный возврат — на ваш выбор.",
        "Пришлите ник/ссылку и время заказа — я проверю и дам точный срок исправления."
      ].join("\n");
    }
    return [
      "Уточните, пожалуйста, детали: площадка/услуга, ник/ссылка, срок, что уже сделано.",
      "После этого предложу точный текст ответа покупателю и план действий."
    ].join("\n");
  }

  window.FP.Modules.AIHelperModule = {
    id: "ai",
    title: "",
    icon: "✨",
    render,
    mount(root) {
      const log = root.querySelector("#chatLog");
      const input = root.querySelector("#chatInput");
      const sendBtn = root.querySelector("#send");

      const orKey = root.querySelector("#orKey");
      const orModel = root.querySelector("#orModel");
      const orTemp = root.querySelector("#orTemp");
      const orMax = root.querySelector("#orMax");
      const orSave = root.querySelector("#orSave");

      // init selects from storage
      const or = getOpenRouter();
      if (orModel) orModel.value = or.model || "meta-llama/llama-3.1-8b-instruct";

      const append = (role, text) => {
        const isUser = role === "user";
        const bubble = document.createElement("div");
        bubble.className =
          "p-3 rounded-2xl border " +
          (isUser
            ? "bg-emerald-600 text-white border-emerald-700"
            : "bg-white dark:bg-[#0b1220] border-slate-200 dark:border-slate-700");
        bubble.innerHTML =
          `<div class="text-xs opacity-60 mb-1">${isUser ? "Вы" : "ИИ"}</div>` +
          `<div class="whitespace-pre-wrap text-sm">${escapeHtml(text)}</div>`;
        log.appendChild(bubble);
        log.scrollTop = log.scrollHeight;
      };

      // Provider buttons
      root.querySelectorAll(".provBtn").forEach((b) => {
        b.addEventListener("click", () => {
          const p = getPrefs();
          p.provider = b.getAttribute("data-prov");
          setPrefs(p);
          toast("Провайдер: " + p.provider);
          root.innerHTML = render();
          // re-mount after re-render
          window.FP.Modules.AIHelperModule.mount(root);
        });
      });

      // Quick chips
      root.querySelectorAll(".chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          const q = btn.getAttribute("data-q") || "";
          input.value = q;
          input.focus();
        });
      });

      // Save OpenRouter settings
      orSave?.addEventListener("click", () => {
        const cur = getOpenRouter();
        const next = {
          ...cur,
          apiKey: (orKey?.value || "").trim(),
          model: orModel?.value || cur.model,
          temperature: Number(orTemp?.value ?? cur.temperature ?? 0.7),
          maxTokens: Number(orMax?.value ?? cur.maxTokens ?? 700)
        };
        setOpenRouter(next);
        toast("OpenRouter настройки сохранены ✅");
      });

      async function send() {
        const text = (input.value || "").trim();
        if (!text) return;
        input.value = "";
        append("user", text);

        const prefs = getPrefs();
        const systemPrompt = getSystemPrompt();

        sendBtn.disabled = true;
        sendBtn.textContent = "…";

        try {
          let reply = "";
          if (prefs.provider === "offline") {
            reply = offlineAnswer(text);
          } else if (prefs.provider === "pollinations") {
            reply = await sendPollinations(systemPrompt, text);
          } else {
            const cfg = getOpenRouter();
            if (!cfg.apiKey) {
              throw new Error("NO_OPENROUTER_KEY");
            }
            reply = await sendOpenRouter({
              apiKey: cfg.apiKey,
              model: cfg.model || "meta-llama/llama-3.1-8b-instruct",
              systemPrompt,
              userText: text,
              temperature: cfg.temperature ?? 0.7,
              maxTokens: cfg.maxTokens ?? 700
            });
          }
          append("assistant", reply);
        } catch (e) {
          const msg = String(e?.message || e);
          if (msg.includes("NO_OPENROUTER_KEY")) {
            append("assistant", "Добавь OpenRouter API key в настройках справа и нажми «Сохранить».");
          } else if (msg.includes("OPENROUTER_404")) {
            append("assistant",
              "Ошибка OpenRouter 404: модель недоступна для этого ключа или временно без провайдеров.\n" +
              "Попробуй выбрать модель без суффикса :free (например meta-llama/llama-3.1-8b-instruct) или другую free-модель (Gemma/Mistral)."
            );
          } else {
            append("assistant", "Ошибка: " + msg);
          }
          console.error(e);
        } finally {
          sendBtn.disabled = false;
          sendBtn.textContent = "Отправить";
        }
      }

      sendBtn.addEventListener("click", send);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") send();
      });
    }
  };
})();