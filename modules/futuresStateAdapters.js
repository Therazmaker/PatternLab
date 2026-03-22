function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toBinanceShadowOrder(decision, signal = {}) {
  if (!decision || decision.action === "NO_TRADE") return null;
  const side = decision.action === "LONG" ? "BUY" : "SELL";
  const plan = decision.executionPlan || {};
  const symbol = String(signal.asset || "").toUpperCase().replace(/\//g, "") || "UNKNOWN";
  return {
    symbol: `${symbol}USDT`,
    side,
    positionSide: "BOTH",
    entryType: plan.entryType === "limit-zone" ? "LIMIT" : "MARKET",
    quantityModel: plan.sizingMode || "disabled",
    stopLossPrice: toNumber(plan.stopLoss, null),
    takeProfitPrice: toNumber(plan.takeProfit, null),
    leverageCap: toNumber(plan.leverageCap, null),
  };
}
