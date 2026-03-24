export function buildLiveShadowAnalytics(records = []) {
  const resolved = records.filter((row) => row?.outcome?.status === "resolved");
  const wins = resolved.filter((row) => row?.outcome?.result === "win").length;
  const losses = resolved.filter((row) => row?.outcome?.result === "loss").length;
  const waits = records.filter((row) => row?.policy?.action === "NO_TRADE").length;
  const pending = records.filter((row) => row?.outcome?.status === "pending").length;
  return {
    total: records.length,
    resolved: resolved.length,
    wins,
    losses,
    waits,
    pending,
    winRate: resolved.length ? Number((wins / Math.max(1, wins + losses)).toFixed(3)) : 0,
  };
}
