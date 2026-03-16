import { getNodeConnections } from "./clusterGraphBuilder.js";

function scaleColor(weight, minWeight, maxWeight) {
  const ratio = maxWeight <= minWeight ? 1 : (weight - minWeight) / (maxWeight - minWeight);
  if (ratio < 0.5) {
    const t = ratio / 0.5;
    return d3.interpolateRgb("#0a1d53", "#00d8ff")(t);
  }
  return d3.interpolateRgb("#00d8ff", "#39ff6d")((ratio - 0.5) / 0.5);
}

export function renderClusterMap(container, graph, options = {}) {
  if (!container) return;
  if (!graph?.nodes?.length) {
    container.innerHTML = '<div class="muted tiny">No cluster data yet.</div>';
    return;
  }
  if (typeof d3 === "undefined") {
    container.innerHTML = '<div class="muted tiny">D3.js is required for Cluster Map.</div>';
    return;
  }

  const width = Math.max(760, container.clientWidth || 760);
  const height = 520;
  container.innerHTML = "";

  const tooltip = d3
    .select(container)
    .append("div")
    .attr("class", "cluster-tooltip")
    .style("opacity", 0);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("class", "cluster-map-svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  const maxNodeWeight = Math.max(1, ...graph.nodes.map((node) => node.weight));
  const minNodeWeight = Math.min(maxNodeWeight, ...graph.nodes.map((node) => node.weight));
  const maxEdgeWeight = Math.max(1, ...graph.edges.map((edge) => edge.weight));

  const edgeScale = d3.scaleLinear().domain([1, maxEdgeWeight]).range([1, 8]);
  const nodeScale = d3.scaleLinear().domain([minNodeWeight, maxNodeWeight]).range([10, 26]);

  const simulation = d3
    .forceSimulation(graph.nodes.map((node) => ({ ...node })))
    .force("link", d3.forceLink(graph.edges.map((edge) => ({ ...edge }))).id((d) => d.id).distance(95).strength(0.25))
    .force("charge", d3.forceManyBody().strength(-180))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius((d) => nodeScale(d.weight) + 8));

  const linkLayer = svg.append("g").attr("stroke", "#7d8aa0");
  const nodeLayer = svg.append("g");

  const link = linkLayer
    .selectAll("line")
    .data(graph.edges)
    .join("line")
    .attr("stroke-width", (d) => edgeScale(d.weight))
    .attr("stroke-opacity", (d) => 0.15 + (d.weight / maxEdgeWeight) * 0.7);

  const node = nodeLayer
    .selectAll("circle")
    .data(simulation.nodes())
    .join("circle")
    .attr("r", (d) => nodeScale(d.weight))
    .attr("fill", (d) => scaleColor(d.weight, minNodeWeight, maxNodeWeight))
    .attr("stroke", "#0b1118")
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      const topConnections = getNodeConnections(graph, d.id).slice(0, 5);
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${d.id}</strong><br/>
          total occurrences: ${d.weight}<br/>
          top 5 connections:<br/>
          ${topConnections.map((item) => `${item.neuronId} (${item.weight})`).join("<br/>") || "-"}
        `)
        .style("left", `${event.offsetX + 14}px`)
        .style("top", `${event.offsetY + 14}px`);
    })
    .on("mousemove", (event) => {
      tooltip.style("left", `${event.offsetX + 14}px`).style("top", `${event.offsetY + 14}px`);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    })
    .on("click", (_, d) => {
      if (typeof options.onNodeClick === "function") options.onNodeClick(d);
      const relatedNodeIds = new Set(getNodeConnections(graph, d.id).map((row) => row.neuronId));
      relatedNodeIds.add(d.id);

      node.attr("opacity", (item) => (relatedNodeIds.has(item.id) ? 1 : 0.2));
      link.attr("opacity", (item) => (item.source.id === d.id || item.target.id === d.id ? 1 : 0.08));
    });

  const labels = nodeLayer
    .selectAll("text")
    .data(simulation.nodes())
    .join("text")
    .text((d) => d.id)
    .attr("font-size", 10)
    .attr("fill", "#d6dfec")
    .attr("text-anchor", "middle")
    .attr("dy", (d) => nodeScale(d.weight) + 12)
    .style("pointer-events", "none");

  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    labels.attr("x", (d) => d.x).attr("y", (d) => d.y);
  });
}
