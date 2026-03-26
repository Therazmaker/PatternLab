import { normalizeLibraryItem } from "../libraryMemory.js";

const DEFAULT_TEMPLATE = {
  id: "my_neuron_001",
  type: "pattern",
  name: "Mi patrón personalizado",
  active: true,
  priority: 0.75,
  tags: ["bullish", "5m"],
  data: {
    direction: "long",
    hint: "Descripción de cuándo aplica este patrón",
    context_labels: ["session:ny", "volatility:medium"],
  },
};

const PROMPT_TEMPLATE = `You are a trading pattern analyst. Below is a dataset of detected candlestick patterns with neural predictions and outcomes.
Your task:
1. Identify which pattern types and indicator conditions correlate most strongly with wins.
2. Suggest 3-5 new Library neurons (as JSON objects with id, type, name, active, priority, tags, data.hint, data.direction, data.context_labels) that would help filter out losing trades.
3. For each suggestion, explain the reasoning in 1-2 sentences.

Schema reference:
- Library item types: pattern, context, lesson, rule
- Library item data.hint: human-readable guidance for the bot
- Library item data.direction: "long" | "short" | "neutral"
- Library item tags: array of strings used for context matching

Dataset stats: {{STATS}}
Training samples: {{TRAINING_COUNT}}
Top losing contexts: {{LOSING_CONTEXTS}}`;

export class NeuronModal {
  constructor(containerElement, config = {}) {
    this.containerElement = containerElement;
    this.config = config;
    this.suggestions = [];
    this.storeGetter = null;
    this.activeTab = "new";
    this.lastValidItem = null;

    this.render();
  }

  setStoreGetter(getter) {
    this.storeGetter = typeof getter === "function" ? getter : null;
  }

  updateSuggestions(suggestions = []) {
    this.suggestions = Array.isArray(suggestions) ? suggestions : [];
    if (this.dialog?.open && this.activeTab === "suggested") {
      this.renderSuggestedTab();
    }
  }

  switchTab(tabName = "new") {
    this.activeTab = tabName;
    this.dialog?.querySelectorAll(".neuron-modal-tab").forEach((tabBtn) => {
      tabBtn.classList.toggle("active", tabBtn.dataset.tab === tabName);
    });
    this.dialog?.querySelectorAll("[data-neuron-panel]").forEach((panel) => {
      panel.style.display = panel.dataset.neuronPanel === tabName ? "block" : "none";
    });

    if (tabName === "mine") this.renderMineTab();
    if (tabName === "suggested") this.renderSuggestedTab();
  }

  open(prefilledJson = null) {
    if (prefilledJson) {
      this.editor.value = JSON.stringify(prefilledJson, null, 2);
    } else if (!String(this.editor.value || "").trim()) {
      this.editor.value = JSON.stringify(DEFAULT_TEMPLATE, null, 2);
    }
    this.switchTab("new");
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() {
    if (this.dialog?.open) this.dialog.close();
  }

  validateEditor() {
    try {
      const parsed = JSON.parse(this.editor.value || "{}");
      const normalized = normalizeLibraryItem(parsed);
      if (!normalized.ok) {
        this.lastValidItem = null;
        this.validationStatus.textContent = `Error: ${normalized.error}`;
        this.validationStatus.className = "neuron-validate-status error";
        return false;
      }
      this.lastValidItem = normalized.item;
      this.validationStatus.textContent = `OK · ${normalized.item.type} · ${normalized.item.id}`;
      this.validationStatus.className = "neuron-validate-status ok";
      return true;
    } catch (error) {
      this.lastValidItem = null;
      this.validationStatus.textContent = `JSON inválido: ${error.message}`;
      this.validationStatus.className = "neuron-validate-status error";
      return false;
    }
  }

  saveCurrentItem() {
    const valid = this.validateEditor();
    if (!valid || !this.lastValidItem) return;
    this.config.onSave?.(this.lastValidItem);
    this.renderMineTab();
    this.switchTab("mine");
  }

  renderMineTab() {
    const items = this.config.getLibraryItems?.() || [];
    if (!items.length) {
      this.minePanel.innerHTML = '<p class="muted">No hay neuronas guardadas en Library.</p>';
      return;
    }

    const rows = items.map((item) => `
      <tr>
        <td>${item.name || item.id}</td>
        <td>${item.type || "-"}</td>
        <td>${(item.tags || []).join(", ") || "-"}</td>
        <td><input type="checkbox" data-neuron-toggle="${item.id}" ${item.active === false ? "" : "checked"} /></td>
        <td><button type="button" class="ghost small" data-neuron-delete="${item.id}">🗑</button></td>
      </tr>
    `).join("");

    this.minePanel.innerHTML = `
      <table class="neuron-items-table">
        <thead>
          <tr><th>Nombre</th><th>Tipo</th><th>Tags</th><th>Activo</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    this.minePanel.querySelectorAll("[data-neuron-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.config.onDelete?.(btn.dataset.neuronDelete);
        this.renderMineTab();
      });
    });

    this.minePanel.querySelectorAll("[data-neuron-toggle]").forEach((toggle) => {
      toggle.addEventListener("change", () => {
        this.config.onToggle?.(toggle.dataset.neuronToggle, toggle.checked);
      });
    });
  }

  renderSuggestedTab() {
    if (!this.suggestions.length) {
      this.suggestedPanel.innerHTML = '<p class="muted">Sin sugerencias por ahora.</p>';
      return;
    }

    this.suggestedPanel.innerHTML = this.suggestions.map((suggestion) => `
      <div class="suggestion-card">
        <div class="suggestion-card-header">
          <span class="suggestion-card-reason">💡 ${suggestion.reason}</span>
          <span class="suggestion-card-conf">Conf: ${Math.round((Number(suggestion.confidence) || 0) * 100)}%</span>
        </div>
        <div class="button-row compact">
          <button type="button" class="ghost small" data-suggestion-json="${suggestion.id}">Ver JSON</button>
          <button type="button" class="small" data-suggestion-use="${suggestion.id}">Usar esta neurona</button>
        </div>
        <pre class="suggestion-json-preview" data-suggestion-preview="${suggestion.id}">${JSON.stringify(suggestion.prefilledJson, null, 2)}</pre>
      </div>
    `).join("");

    this.suggestedPanel.querySelectorAll("[data-suggestion-json]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pre = this.suggestedPanel.querySelector(`[data-suggestion-preview="${btn.dataset.suggestionJson}"]`);
        if (!pre) return;
        pre.classList.toggle("visible");
      });
    });

    this.suggestedPanel.querySelectorAll("[data-suggestion-use]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const suggestion = this.suggestions.find((row) => row.id === btn.dataset.suggestionUse);
        if (!suggestion) return;
        this.editor.value = JSON.stringify(suggestion.prefilledJson, null, 2);
        this.switchTab("new");
      });
    });
  }

  buildLosingContexts(storeRows = []) {
    const lossRows = storeRows.filter((row) => row?.outcome?.result === "loss");
    const counts = {};
    lossRows.forEach((row) => {
      const key = `${row.type || "unknown"} @ ${row.timeframe || "?"}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ") || "none";
  }

  exportSchema() {
    const store = this.storeGetter?.();
    const libraryItems = this.config.getLibraryItems?.() || [];
    const neuronStoreJson = store?.toJson?.() || { schema: "gemini.neuron.v1", exportedAt: new Date().toISOString(), rows: [] };
    const trainingDataset = store?.toTrainingDataset?.() || { schema: "gemini.training.v1", exportedAt: new Date().toISOString(), rows: [] };
    const stats = store?.getStats?.() || {};

    const payload = {
      schema: "gemini.neuron.export.v1",
      exportedAt: new Date().toISOString(),
      libraryItems,
      neuronStore: neuronStoreJson,
      trainingDataset,
      stats,
      promptTemplate: PROMPT_TEMPLATE
        .replace("{{STATS}}", JSON.stringify(stats))
        .replace("{{TRAINING_COUNT}}", String(trainingDataset.rows?.length || 0))
        .replace("{{LOSING_CONTEXTS}}", this.buildLosingContexts(neuronStoreJson.rows || [])),
    };
    console.info("[Training] export rows count:", {
      neuronStoreRows: neuronStoreJson.rows?.length || 0,
      trainingRows: trainingDataset.rows?.length || 0,
    });

    this.config.onExportSchema?.(payload);

    const content = JSON.stringify(payload, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `gemini-neuron-export-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  render() {
    this.dialog = document.createElement("dialog");
    this.dialog.innerHTML = `
      <div class="neuron-modal-header">
        <span>🧠 Neuron Manager</span>
        <button type="button" class="ghost small" data-neuron-close>✕ Close</button>
      </div>
      <div class="neuron-modal-tabs">
        <button type="button" class="neuron-modal-tab active" data-tab="new">Nueva Neurona</button>
        <button type="button" class="neuron-modal-tab" data-tab="mine">Mis Neuronas</button>
        <button type="button" class="neuron-modal-tab" data-tab="suggested">Sugeridas</button>
      </div>
      <div class="neuron-modal-body">
        <section data-neuron-panel="new">
          <textarea id="neuron-json-editor" class="neuron-json-editor"></textarea>
          <div class="button-row compact">
            <button type="button" class="ghost" data-neuron-validate>Validar</button>
            <button type="button" class="primary" data-neuron-save>✓ Guardar en Library</button>
          </div>
          <span id="neuron-validate-status" class="neuron-validate-status muted"></span>
        </section>
        <section data-neuron-panel="mine" style="display:none"></section>
        <section data-neuron-panel="suggested" style="display:none"></section>
      </div>
      <div class="neuron-modal-footer">
        <button type="button" class="ghost" data-neuron-export>⬇ Exportar Schema + Prompt</button>
      </div>
    `;

    this.containerElement?.appendChild(this.dialog);

    this.editor = this.dialog.querySelector("#neuron-json-editor");
    this.validationStatus = this.dialog.querySelector("#neuron-validate-status");
    this.minePanel = this.dialog.querySelector('[data-neuron-panel="mine"]');
    this.suggestedPanel = this.dialog.querySelector('[data-neuron-panel="suggested"]');
    this.editor.value = JSON.stringify(DEFAULT_TEMPLATE, null, 2);

    this.dialog.querySelector("[data-neuron-close]")?.addEventListener("click", () => this.close());
    this.dialog.querySelector("[data-neuron-validate]")?.addEventListener("click", () => this.validateEditor());
    this.dialog.querySelector("[data-neuron-save]")?.addEventListener("click", () => this.saveCurrentItem());
    this.dialog.querySelector("[data-neuron-export]")?.addEventListener("click", () => this.exportSchema());

    this.dialog.querySelectorAll(".neuron-modal-tab").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => this.switchTab(tabBtn.dataset.tab || "new"));
    });
  }
}
