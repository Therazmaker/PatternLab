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
    this.suggestionDrafts = {};
    this.suggestionOriginals = {};

    this.render();
  }

  setStoreGetter(getter) {
    this.storeGetter = typeof getter === "function" ? getter : null;
  }

  updateSuggestions(suggestions = []) {
    this.suggestions = Array.isArray(suggestions) ? suggestions : [];
    const nextDrafts = {};
    const nextOriginals = {};
    this.suggestions.forEach((suggestion) => {
      const suggestionId = String(suggestion?.id || "");
      if (!suggestionId) return;
      const original = JSON.stringify(suggestion.prefilledJson || {}, null, 2);
      nextOriginals[suggestionId] = original;
      nextDrafts[suggestionId] = this.suggestionDrafts[suggestionId] ?? original;
    });
    this.suggestionDrafts = nextDrafts;
    this.suggestionOriginals = nextOriginals;
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
    const result = this.validateJsonText(this.editor.value || "");
    this.lastValidItem = result.ok ? result.item : null;
    this.validationStatus.textContent = result.message;
    this.validationStatus.className = `neuron-validate-status ${result.ok ? "ok" : "error"}`;
    if (!result.ok) console.info("[NeuronManager] validation failed:", result.message);
    if (result.ok) console.info("[NeuronManager] JSON validated");
    return result.ok;
  }

  buildJsonSyntaxMessage(error, rawText = "") {
    const fallback = `JSON inválido: ${error?.message || "Error de sintaxis"}`;
    const match = String(error?.message || "").match(/position\s+(\d+)/i);
    if (!match) return fallback;
    const position = Number(match[1]);
    if (!Number.isFinite(position) || position < 0) return fallback;
    const source = String(rawText || "");
    const head = source.slice(0, position);
    const line = head.split("\n").length;
    const col = position - (head.lastIndexOf("\n") + 1) + 1;
    return `JSON inválido en línea ${line}, columna ${col}`;
  }

  validateJsonText(rawText = "") {
    let parsed;
    try {
      parsed = JSON.parse(rawText || "{}");
    } catch (error) {
      return { ok: false, message: this.buildJsonSyntaxMessage(error, rawText) };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "JSON debe ser un objeto." };
    }

    const requiredFields = ["id", "type", "name", "active", "priority", "data"];
    for (const field of requiredFields) {
      if (!(field in parsed)) return { ok: false, message: `Falta field: ${field}` };
    }

    if (typeof parsed.id !== "string" || !parsed.id.trim()) return { ok: false, message: "id debe ser string no vacío" };
    if (typeof parsed.type !== "string" || !parsed.type.trim()) return { ok: false, message: "type debe ser string no vacío" };
    if (typeof parsed.name !== "string" || !parsed.name.trim()) return { ok: false, message: "name debe ser string no vacío" };
    if (typeof parsed.active !== "boolean") return { ok: false, message: "active debe ser booleano" };
    if (!Number.isFinite(Number(parsed.priority))) return { ok: false, message: "priority debe ser numérico" };
    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return { ok: false, message: "data debe ser un objeto" };
    }

    const normalized = normalizeLibraryItem(parsed);
    if (!normalized.ok) {
      return { ok: false, message: normalized.error || "Error validando neurona" };
    }

    return {
      ok: true,
      item: normalized.item,
      message: `JSON válido · ${normalized.item.type} · ${normalized.item.id}`,
    };
  }

  resolveSaveCollision(item) {
    const existing = (this.config.getLibraryItems?.() || []).find((row) => row?.id === item.id);
    if (!existing) return item;
    const overwrite = window.confirm(`Ya existe una neurona con id "${item.id}". ¿Sobrescribir existente?`);
    if (overwrite) return item;
    const nextId = window.prompt("Ingresa un nuevo id para guardar como nueva neurona:", `${item.id}_copy`);
    if (!nextId) return null;
    const trimmedId = String(nextId).trim();
    if (!trimmedId) return null;
    const duplicate = (this.config.getLibraryItems?.() || []).find((row) => row?.id === trimmedId);
    if (duplicate) {
      window.alert(`El id "${trimmedId}" ya existe. Cambia el id e intenta nuevamente.`);
      return null;
    }
    return { ...item, id: trimmedId };
  }

  saveValidatedItem(item, options = {}) {
    const resolved = this.resolveSaveCollision(item);
    if (!resolved) {
      return { ok: false, message: "Guardado cancelado: id duplicado sin resolución." };
    }
    this.config.onSave?.(resolved);
    this.renderMineTab();
    if (!options.keepSuggestedTab) {
      this.switchTab("mine");
    }
    return { ok: true, item: resolved };
  }

  saveCurrentItem() {
    const valid = this.validateEditor();
    if (!valid || !this.lastValidItem) return;
    const saved = this.saveValidatedItem(this.lastValidItem);
    if (!saved.ok) {
      this.validationStatus.textContent = saved.message;
      this.validationStatus.className = "neuron-validate-status error";
      return;
    }
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
        <div class="suggestion-json-preview" data-suggestion-preview="${suggestion.id}">
          <textarea class="suggestion-json-editor" data-suggestion-editor="${suggestion.id}">${this.suggestionDrafts[suggestion.id] || JSON.stringify(suggestion.prefilledJson, null, 2)}</textarea>
          <div class="button-row compact">
            <button type="button" class="ghost small" data-suggestion-restore="${suggestion.id}">Restaurar sugerencia original</button>
            <button type="button" class="ghost small" data-suggestion-validate="${suggestion.id}">Validar JSON</button>
            <button type="button" class="primary small" data-suggestion-save="${suggestion.id}">Guardar neurona</button>
          </div>
          <span class="suggestion-validation-status muted" data-suggestion-status="${suggestion.id}"></span>
        </div>
      </div>
    `).join("");

    this.suggestedPanel.querySelectorAll("[data-suggestion-json]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pre = this.suggestedPanel.querySelector(`[data-suggestion-preview="${btn.dataset.suggestionJson}"]`);
        if (!pre) return;
        console.info("[NeuronManager] suggested JSON opened", { suggestionId: btn.dataset.suggestionJson });
        pre.classList.toggle("visible");
      });
    });

    this.suggestedPanel.querySelectorAll("[data-suggestion-editor]").forEach((editor) => {
      editor.addEventListener("input", () => {
        this.suggestionDrafts[editor.dataset.suggestionEditor] = editor.value;
      });
    });

    this.suggestedPanel.querySelectorAll("[data-suggestion-restore]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.suggestionRestore;
        const editor = this.suggestedPanel.querySelector(`[data-suggestion-editor="${id}"]`);
        const status = this.suggestedPanel.querySelector(`[data-suggestion-status="${id}"]`);
        if (!editor) return;
        editor.value = this.suggestionOriginals[id] || "";
        this.suggestionDrafts[id] = editor.value;
        if (status) {
          status.textContent = "Sugerencia original restaurada.";
          status.className = "suggestion-validation-status muted";
        }
      });
    });

    this.suggestedPanel.querySelectorAll("[data-suggestion-validate]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.suggestionValidate;
        const editor = this.suggestedPanel.querySelector(`[data-suggestion-editor="${id}"]`);
        const status = this.suggestedPanel.querySelector(`[data-suggestion-status="${id}"]`);
        if (!editor || !status) return;
        const result = this.validateJsonText(editor.value || "");
        this.suggestionDrafts[id] = editor.value;
        status.textContent = result.message;
        status.className = `suggestion-validation-status ${result.ok ? "ok" : "error"}`;
        if (result.ok) console.info("[NeuronManager] JSON validated", { suggestionId: id });
        else console.info("[NeuronManager] validation failed:", result.message, { suggestionId: id });
      });
    });

    this.suggestedPanel.querySelectorAll("[data-suggestion-save]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.suggestionSave;
        const editor = this.suggestedPanel.querySelector(`[data-suggestion-editor="${id}"]`);
        const status = this.suggestedPanel.querySelector(`[data-suggestion-status="${id}"]`);
        if (!editor || !status) return;
        const result = this.validateJsonText(editor.value || "");
        this.suggestionDrafts[id] = editor.value;
        if (!result.ok || !result.item) {
          status.textContent = result.message;
          status.className = "suggestion-validation-status error";
          console.info("[NeuronManager] validation failed:", result.message, { suggestionId: id });
          return;
        }
        const saved = this.saveValidatedItem(result.item, { keepSuggestedTab: true });
        if (!saved.ok) {
          status.textContent = saved.message;
          status.className = "suggestion-validation-status error";
          return;
        }
        status.textContent = `Guardado: ${saved.item.id}`;
        status.className = "suggestion-validation-status ok";
        console.info("[NeuronManager] neuron saved from suggestion", { suggestionId: id, neuronId: saved.item.id });
      });
    });

    this.suggestedPanel.querySelectorAll("[data-suggestion-use]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const suggestion = this.suggestions.find((row) => row.id === btn.dataset.suggestionUse);
        if (!suggestion) return;
        this.editor.value = this.suggestionDrafts[suggestion.id] || JSON.stringify(suggestion.prefilledJson, null, 2);
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
