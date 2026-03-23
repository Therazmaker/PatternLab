function prettyRole(role = "") {
  return String(role || "").replaceAll("_", " ");
}

function prettyCondition(condition = "") {
  return String(condition || "").replace("if_", "if ").replaceAll("_", " ");
}

export function renderTriggerLinePanel(triggerLines = [], evaluation = null) {
  const rows = Array.isArray(triggerLines) ? triggerLines : [];
  if (!rows.length) {
    return '<div class="panel-soft"><p class="tiny"><strong>Trigger Lines</strong></p><p class="muted tiny">No trigger lines configured.</p></div>';
  }

  const effectById = new Map((evaluation?.activeTriggerEffects || []).map((row) => [row.triggerLineId, row]));
  const items = rows.map((line) => {
    const effect = effectById.get(line.id);
    const status = effect?.status || line?.runtimeState?.status || "idle";
    const summaryText = effect?.summaryText || line?.runtimeState?.lastReason || `Watching ${line.level}`;
    return `
      <li>
        <span>Trigger ${Number(line.level).toFixed(2)} · ${prettyRole(line.triggerConfig?.role)}</span>
        <strong>${status}</strong>
        <small class="muted">${prettyCondition(line.triggerConfig?.condition)} · bias ${line.triggerConfig?.biasOnTrigger || "neutral"}</small>
        <small class="muted">${summaryText}</small>
      </li>
    `;
  }).join("");

  return `
    <div class="panel-soft">
      <p class="tiny"><strong>Trigger Lines</strong></p>
      <ul class="mini-list trigger-line-mini-list">${items}</ul>
      <p class="muted tiny">${evaluation?.summaryText || "Trigger lines loaded."}</p>
    </div>
  `;
}
