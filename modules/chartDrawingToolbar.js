const TOOL_LAYOUT = [
  { key: "select", label: "Select", title: "Select drawing" },
  { key: "tp_line", label: "TP", title: "Draw Take Profit line" },
  { key: "sl_line", label: "SL", title: "Draw Stop Loss line" },
  { key: "horizontal_line", label: "H-Line", title: "Draw horizontal line" },
  { key: "trigger_line", label: "Trigger", title: "Draw trigger line" },
  { key: "trendline", label: "Trend", title: "Draw trendline" },
  { key: "channel", label: "Channel", title: "Draw channel" },
  { key: "erase", label: "Erase", title: "Erase drawing" },
];

function styleButton(button, active = false, toolKey = null) {
  let borderColor, bgColor, textColor;
  if (toolKey === "tp_line") {
    borderColor = active ? "rgba(34,197,94,0.9)" : "rgba(34,197,94,0.45)";
    bgColor = active ? "rgba(34,197,94,0.22)" : "rgba(13,22,33,0.9)";
    textColor = active ? "#86efac" : "#4ade80";
  } else if (toolKey === "sl_line") {
    borderColor = active ? "rgba(239,68,68,0.9)" : "rgba(239,68,68,0.45)";
    bgColor = active ? "rgba(239,68,68,0.22)" : "rgba(13,22,33,0.9)";
    textColor = active ? "#fca5a5" : "#f87171";
  } else {
    borderColor = active ? "rgba(96,165,250,0.8)" : "rgba(148,163,184,0.28)";
    bgColor = active ? "rgba(37,99,235,0.2)" : "rgba(13,22,33,0.9)";
    textColor = active ? "#bfdbfe" : "#94a3b8";
  }
  button.style.cssText = [
    "font:500 11px/1 'JetBrains Mono',monospace",
    "padding:4px 8px",
    "border-radius:5px",
    `border:1px solid ${borderColor}`,
    `background:${bgColor}`,
    `color:${textColor}`,
    "cursor:pointer",
    "transition:all .15s",
  ].join(";");
}

export function createChartDrawingToolbar(container, {
  onToolSelect,
  onClear,
  onFullscreen,
  onToggleFullscreenLabel,
} = {}) {
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "position:absolute;top:8px;right:88px;display:flex;gap:6px;align-items:center;z-index:12;flex-wrap:wrap;max-width:68%;";

  const buttons = new Map();

  TOOL_LAYOUT.forEach((tool) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tool.label;
    button.title = tool.title;
    styleButton(button, tool.key === "select", tool.key);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onToolSelect?.(tool.key);
    });
    buttons.set(tool.key, button);
    toolbar.appendChild(button);
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.title = "Clear drawings";
  styleButton(clearButton, false);
  clearButton.addEventListener("click", (event) => {
    event.stopPropagation();
    onClear?.();
  });
  toolbar.appendChild(clearButton);

  const fsButton = document.createElement("button");
  fsButton.type = "button";
  fsButton.textContent = "⛶ Full";
  fsButton.title = "Fullscreen";
  styleButton(fsButton, false);
  fsButton.addEventListener("click", (event) => {
    event.stopPropagation();
    onFullscreen?.();
  });
  toolbar.appendChild(fsButton);

  container.appendChild(toolbar);

  return {
    element: toolbar,
    setActiveTool(tool = "select") {
      buttons.forEach((button, key) => styleButton(button, key === tool, key));
    },
    setFullscreen(fullscreen = false) {
      fsButton.textContent = fullscreen ? "⛶ Exit" : "⛶ Full";
      styleButton(fsButton, fullscreen);
      onToggleFullscreenLabel?.(fullscreen);
    },
    destroy() {
      toolbar.remove();
    },
  };
}
