const DEFAULT_GRAPH_OPTIONS = {
  minNodeActivations: 1,
  minEdgeWeight: 1,
  maxEdges: 180,
  maxNodes: 48,
};

const CATEGORY_COLORS = {
  single_candle: "#4ea1ff",
  two_candle: "#41d39f",
  context_session: "#ffd166",
  local_structure: "#ff7aa2",
  unknown: "#9ca3af",
};

function toRows(neuronMatrix) {
  return Array.isArray(neuronMatrix) ? neuronMatrix : [];
}

function normalizeNodeSize(value, min, max) {
  if (max <= min) return 16;
  return 10 + ((value - min) / (max - min)) * 20;
}

export function buildNeuronNodeStats(neuronMatrix) {
  const stats = new Map();

  toRows(neuronMatrix).forEach((row) => {
    const neurons = row?.neurons || {};
    Object.entries(neurons).forEach(([neuronId, entry]) => {
      if (!entry?.active) return;
      const current = stats.get(neuronId) || {
        id: neuronId,
        label: neuronId,
        category: entry?.category || "unknown",
        activationCount: 0,
        pineCompatible: Boolean(entry?.pineCompatible),
      };
      current.activationCount += 1;
      if (entry?.pineCompatible) current.pineCompatible = true;
      if (!current.category || current.category === "unknown") current.category = entry?.category || "unknown";
      stats.set(neuronId, current);
    });
  });

  return [...stats.values()];
}

export function buildNeuronEdgeStats(neuronMatrix) {
  const edgeMap = new Map();

  toRows(neuronMatrix).forEach((row) => {
    const activeNeurons = Object.entries(row?.neurons || {})
      .filter(([, entry]) => Boolean(entry?.active))
      .map(([neuronId]) => neuronId)
      .sort();

    // v1 rule: same-candle co-activation only.
    for (let i = 0; i < activeNeurons.length; i += 1) {
      for (let j = i + 1; j < activeNeurons.length; j += 1) {
        const source = activeNeurons[i];
        const target = activeNeurons[j];
        const key = `${source}::${target}`;
        const edge = edgeMap.get(key) || { source, target, weight: 0 };
        edge.weight += 1;
        edgeMap.set(key, edge);
      }
    }
  });

  return [...edgeMap.values()];
}

export function buildNeuronCoactivationGraph(neuronMatrix, options = {}) {
  const config = { ...DEFAULT_GRAPH_OPTIONS, ...(options || {}) };
  const nodeStats = buildNeuronNodeStats(neuronMatrix)
    .filter((node) => node.activationCount >= config.minNodeActivations)
    .sort((a, b) => b.activationCount - a.activationCount)
    .slice(0, Math.max(0, config.maxNodes));

  const allowedNodeIds = new Set(nodeStats.map((node) => node.id));

  const edgeStats = buildNeuronEdgeStats(neuronMatrix)
    .filter((edge) => edge.weight >= config.minEdgeWeight)
    .filter((edge) => allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, config.maxEdges));

  const maxNodeActivations = Math.max(1, ...nodeStats.map((node) => node.activationCount));
  const minNodeActivations = Math.min(maxNodeActivations, ...nodeStats.map((node) => node.activationCount));
  const maxEdgeWeight = Math.max(1, ...edgeStats.map((edge) => edge.weight));

  return {
    nodes: nodeStats.map((node) => ({
      ...node,
      color: CATEGORY_COLORS[node.category] || CATEGORY_COLORS.unknown,
      size: Number(normalizeNodeSize(node.activationCount, minNodeActivations, maxNodeActivations).toFixed(2)),
    })),
    edges: edgeStats.map((edge) => ({
      ...edge,
      normalizedWeight: Number((edge.weight / maxEdgeWeight).toFixed(4)),
    })),
  };
}

export function getStrongestEdges(graph, limit = 10) {
  return [...(graph?.edges || [])]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, limit));
}

export function getTopConnectedNeurons(graph, limit = 10) {
  const connectionStrength = new Map();
  (graph?.edges || []).forEach((edge) => {
    connectionStrength.set(edge.source, (connectionStrength.get(edge.source) || 0) + edge.weight);
    connectionStrength.set(edge.target, (connectionStrength.get(edge.target) || 0) + edge.weight);
  });

  return (graph?.nodes || [])
    .map((node) => ({
      id: node.id,
      category: node.category,
      activationCount: node.activationCount,
      totalConnectionWeight: connectionStrength.get(node.id) || 0,
    }))
    .sort((a, b) => b.totalConnectionWeight - a.totalConnectionWeight || b.activationCount - a.activationCount)
    .slice(0, Math.max(0, limit));
}

export function getNodeTopConnections(graph, nodeId, limit = 8) {
  if (!nodeId) return [];
  return (graph?.edges || [])
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => ({
      neuronId: edge.source === nodeId ? edge.target : edge.source,
      weight: edge.weight,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, limit));
}

export function renderNeuronGraph(container, graph, callbacks = {}) {
  if (!container) return;
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];

  if (!nodes.length) {
    container.innerHTML = '<div class="muted tiny">No graph data yet.</div>';
    return;
  }

  const width = Math.max(720, container.clientWidth || 720);
  const height = 420;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(120, Math.min(width, height) * 0.34);

  const positionedNodes = nodes.map((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });

  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));

  const edgeSvg = edges
    .map((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return "";
      const thickness = (1 + edge.normalizedWeight * 6).toFixed(2);
      const opacity = (0.15 + edge.normalizedWeight * 0.7).toFixed(2);
      return `<line class="ng-edge" data-source="${edge.source}" data-target="${edge.target}" stroke-width="${thickness}" stroke-opacity="${opacity}" x1="${source.x.toFixed(2)}" y1="${source.y.toFixed(2)}" x2="${target.x.toFixed(2)}" y2="${target.y.toFixed(2)}"></line>`;
    })
    .join("");

  const nodeSvg = positionedNodes
    .map((node) => `<g class="ng-node" data-node-id="${node.id}">
      <circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${node.size.toFixed(2)}" fill="${node.color}"></circle>
      <text x="${node.x.toFixed(2)}" y="${(node.y + node.size + 12).toFixed(2)}" text-anchor="middle">${node.label}</text>
    </g>`)
    .join("");

  container.innerHTML = `
    <svg class="neuron-graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Neuron coactivation graph">
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
      <g class="ng-edges">${edgeSvg}</g>
      <g class="ng-nodes">${nodeSvg}</g>
    </svg>
  `;

  container.querySelectorAll(".ng-node").forEach((nodeEl) => {
    nodeEl.addEventListener("click", () => {
      const nodeId = nodeEl.getAttribute("data-node-id") || "";
      const node = nodeById.get(nodeId);
      if (node && typeof callbacks.onNodeClick === "function") callbacks.onNodeClick(node);
    });
  });

  container.querySelectorAll(".ng-edge").forEach((edgeEl) => {
    edgeEl.addEventListener("click", () => {
      const source = edgeEl.getAttribute("data-source") || "";
      const target = edgeEl.getAttribute("data-target") || "";
      const edge = edges.find((row) => row.source === source && row.target === target);
      if (edge && typeof callbacks.onEdgeClick === "function") callbacks.onEdgeClick(edge);
    });
  });
}
