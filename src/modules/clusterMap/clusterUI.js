import { getNodeConnections, getRelatedCandidates } from "./clusterGraphBuilder.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderClusterSummary(container, graph) {
  if (!container) return;
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  if (!nodes.length) {
    container.className = "panel-soft muted tiny";
    container.textContent = "No cluster map data yet. Run Discover Patterns first.";
    return;
  }

  const strongest = [...edges].sort((a, b) => b.weight - a.weight).slice(0, 3);
  container.className = "panel-soft tiny";
  container.innerHTML = `
    <div class="neuron-summary-grid">
      <span class="item">Nodes: <strong>${nodes.length}</strong></span>
      <span class="item">Edges: <strong>${edges.length}</strong></span>
      <span class="item">Strongest: <strong>${strongest.map((edge) => `${escapeHtml(edge.source)}↔${escapeHtml(edge.target)} (${edge.weight})`).join(" · ") || "-"}</strong></span>
    </div>
  `;
}

export function renderClusterInspector(container, graph, selectedNodeId, candidates) {
  if (!container) return;
  if (!graph?.nodes?.length) {
    container.className = "panel-soft muted tiny";
    container.textContent = "Click a node to inspect combos and related patterns.";
    return;
  }

  const node = graph.nodes.find((row) => row.id === selectedNodeId);
  if (!node) {
    container.className = "panel-soft muted tiny";
    container.textContent = "Click a node to inspect combos and related patterns.";
    return;
  }

  const topConnections = getNodeConnections(graph, node.id).slice(0, 10);
  const relatedCandidates = getRelatedCandidates(candidates, node.id).slice(0, 8);

  container.className = "panel-soft tiny";
  container.innerHTML = `
    <h4>${escapeHtml(node.id)}</h4>
    <p>Total occurrences: <strong>${node.weight}</strong></p>
    <div class="tiny muted">Top combos</div>
    <ul>
      ${topConnections.map((item) => `<li>${escapeHtml(node.id)} + ${escapeHtml(item.neuronId)} <strong>(${item.weight})</strong></li>`).join("") || "<li>-</li>"}
    </ul>
    <div class="tiny muted">Related candidate patterns</div>
    <ul>
      ${relatedCandidates.map((candidate) => `<li>${escapeHtml(candidate.patternId || "candidate")} · score ${(candidate.score || 0).toFixed(3)} · sample ${candidate.sampleCount || 0}</li>`).join("") || "<li>-</li>"}
    </ul>
  `;
}

export function syncRangeInput(rangeEl, labelEl, value) {
  if (!rangeEl || !labelEl) return;
  rangeEl.value = String(value);
  labelEl.textContent = String(value);
}
