const DEFAULT_CLUSTER_FILTERS = {
  minNodeWeight: 1,
  minEdgeWeight: 1,
  session: "all",
};

function normalizeCandidates(candidates) {
  return Array.isArray(candidates) ? candidates : [];
}

function normalizeNeuronList(candidate) {
  if (Array.isArray(candidate?.neurons)) return candidate.neurons;
  if (Array.isArray(candidate?.neuronList)) return candidate.neuronList;
  return [];
}

function uniqueNeuronIds(neurons) {
  return [...new Set(neurons.map((value) => String(value || "").trim()).filter(Boolean))];
}

function edgeKey(a, b) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function buildClusterGraph(candidates, options = {}) {
  const filters = { ...DEFAULT_CLUSTER_FILTERS, ...(options || {}) };
  const nodeMap = new Map();
  const edgeMap = new Map();
  const nodePatterns = new Map();

  normalizeCandidates(candidates).forEach((candidate, candidateIndex) => {
    const neurons = uniqueNeuronIds(normalizeNeuronList(candidate));
    if (neurons.length < 1) return;

    const patternId = candidate?.patternId || `candidate-${candidateIndex}`;

    neurons.forEach((neuronId) => {
      nodeMap.set(neuronId, (nodeMap.get(neuronId) || 0) + 1);
      if (!nodePatterns.has(neuronId)) nodePatterns.set(neuronId, new Set());
      nodePatterns.get(neuronId).add(patternId);
    });

    for (let i = 0; i < neurons.length; i += 1) {
      for (let j = i + 1; j < neurons.length; j += 1) {
        const source = neurons[i];
        const target = neurons[j];
        const key = edgeKey(source, target);
        edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      }
    }
  });

  const allowedNodes = new Set(
    [...nodeMap.entries()]
      .filter(([, weight]) => weight >= filters.minNodeWeight)
      .map(([nodeId]) => nodeId)
  );

  const nodes = [...allowedNodes].map((id) => ({
    id,
    label: id,
    weight: nodeMap.get(id) || 0,
    patternIds: [...(nodePatterns.get(id) || new Set())],
  }));

  const edges = [...edgeMap.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split("::");
      return { source, target, weight, id: key };
    })
    .filter((edge) => edge.weight >= filters.minEdgeWeight)
    .filter((edge) => allowedNodes.has(edge.source) && allowedNodes.has(edge.target));

  const maxNodeWeight = Math.max(1, ...nodes.map((row) => row.weight));
  const minNodeWeight = Math.min(maxNodeWeight, ...nodes.map((row) => row.weight));
  const maxEdgeWeight = Math.max(1, ...edges.map((row) => row.weight));

  return {
    nodes,
    edges,
    stats: {
      maxNodeWeight,
      minNodeWeight,
      maxEdgeWeight,
      candidateCount: normalizeCandidates(candidates).length,
    },
  };
}

export function getNodeConnections(graph, nodeId) {
  if (!nodeId) return [];
  return (graph?.edges || [])
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => ({
      neuronId: edge.source === nodeId ? edge.target : edge.source,
      weight: edge.weight,
    }))
    .sort((a, b) => b.weight - a.weight || a.neuronId.localeCompare(b.neuronId));
}

export function getRelatedCandidates(candidates, nodeId) {
  if (!nodeId) return [];
  return normalizeCandidates(candidates)
    .filter((candidate) => uniqueNeuronIds(normalizeNeuronList(candidate)).includes(nodeId))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function getWeightBounds(candidates) {
  const graph = buildClusterGraph(candidates, { minEdgeWeight: 1, minNodeWeight: 1 });
  return {
    minNodeWeight: graph.nodes.length ? 1 : 0,
    maxNodeWeight: Math.max(1, ...graph.nodes.map((row) => row.weight)),
    minEdgeWeight: graph.edges.length ? 1 : 0,
    maxEdgeWeight: Math.max(1, ...graph.edges.map((row) => row.weight)),
  };
}
