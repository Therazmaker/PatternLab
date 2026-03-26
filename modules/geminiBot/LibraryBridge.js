import { resolveLibraryMatches } from "../libraryMemory.js";

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toDirectionFromPattern(pattern = {}) {
  const type = String(pattern.type || "").toLowerCase();
  if (type.includes("bullish")) return "long";
  if (type.includes("bearish")) return "short";
  return "neutral";
}

export class LibraryBridge {
  constructor(config = {}) {
    this.libraryItems = Array.isArray(config.libraryItems) ? config.libraryItems : [];
    this.onVeto = typeof config.onVeto === "function" ? config.onVeto : null;
    this.onApprove = typeof config.onApprove === "function" ? config.onApprove : null;
    this.onSuggest = typeof config.onSuggest === "function" ? config.onSuggest : null;
    this.lastDecision = "none";
  }

  setLibraryItems(items) {
    this.libraryItems = Array.isArray(items) ? items : [];
  }

  getActiveItemsCount() {
    return this.libraryItems.filter((item) => item?.active !== false).length;
  }

  deriveTagsFromIndicators(indicators = {}) {
    const tags = [];
    const rsi14 = Number(indicators.rsi14);
    const ema9 = Number(indicators.ema9);
    const ema21 = Number(indicators.ema21);
    const volumeRatio = Number(indicators.volumeRatio);
    const atr14 = Number(indicators.atr14);
    const close = Number(indicators.close);

    if (Number.isFinite(rsi14) && rsi14 > 70) tags.push("overbought");
    if (Number.isFinite(rsi14) && rsi14 < 30) tags.push("oversold");
    if (Number.isFinite(ema9) && Number.isFinite(ema21) && ema9 > ema21) tags.push("ema_bullish_cross");
    if (Number.isFinite(ema9) && Number.isFinite(ema21) && ema9 < ema21) tags.push("ema_bearish_cross");
    if (Number.isFinite(volumeRatio) && volumeRatio > 2) tags.push("volume_spike");
    if (Number.isFinite(atr14) && Number.isFinite(close) && close > 0 && atr14 > (close * 0.005)) tags.push("high_volatility");

    return [...new Set(tags)];
  }

  evaluate(pattern = {}, indicators = {}) {
    const direction = toDirectionFromPattern(pattern);
    const derivedTags = this.deriveTagsFromIndicators(indicators);
    const currentContext = {
      tags: [pattern.type, pattern.timeframe, ...derivedTags].filter(Boolean),
      direction,
      setupName: pattern.type,
    };

    const result = resolveLibraryMatches(currentContext, this.libraryItems);
    const matched = (result.matches || []).map((row) => row.item).filter(Boolean);

    if (!matched.length) {
      this.lastDecision = "approve";
      const neutral = {
        decision: "approve",
        weight: 1,
        matchedRules: [],
        reason: "Sin match de Library, usando peso neutral.",
      };
      this.onApprove?.(pattern, [], neutral.weight);
      return neutral;
    }

    let decision = "approve";
    let weight = 1;
    const reasons = [];
    const matchedRules = [];

    for (const item of matched) {
      const itemType = String(item.type || "").toLowerCase();
      const itemTags = Array.isArray(item.tags) ? item.tags : [];
      const ruleText = String(item?.data?.rule || "").toLowerCase();
      const itemDirection = String(item?.data?.direction || "").toLowerCase();
      const bias = String(item?.data?.bias || "").toLowerCase();

      if (itemType === "rule" && /(never|avoid|veto)/i.test(ruleText)) {
        decision = "veto";
        matchedRules.push(item.id || item.name || "rule");
        reasons.push(`Regla veto: ${item.name || item.id}`);
      }

      if (itemType === "lesson" && itemTags.some((tag) => ["loss-streak", "discipline"].includes(String(tag).toLowerCase()))) {
        if (decision !== "veto") decision = "caution";
        weight = Math.min(weight, 0.5);
        reasons.push(`Lección cautela: ${item.name || item.id}`);
      }

      if (itemType === "pattern" && itemDirection && itemDirection === direction) {
        weight += Number(item.priority || 0);
        reasons.push(`Patrón alineado: ${item.name || item.id}`);
      }

      if (itemType === "context" && bias === "neutral") {
        if (decision !== "veto") decision = "caution";
        weight = Math.min(weight, 0.7);
        reasons.push(`Contexto neutral: ${item.name || item.id}`);
      }
    }

    const finalWeight = clamp(weight, 0.1, 2);
    const finalReason = reasons.join(" · ") || "Match de Library aplicado.";

    this.lastDecision = decision;
    if (decision === "veto") this.onVeto?.(pattern, matched);
    else this.onApprove?.(pattern, matched, finalWeight);

    return {
      decision,
      weight: finalWeight,
      matchedRules,
      reason: finalReason,
    };
  }

  suggestNeurons(recentPatterns = [], recentIndicators = {}) {
    const rows = Array.isArray(recentPatterns)
      ? recentPatterns.filter((row) => ["win", "loss"].includes(row?.outcome?.result)).slice(-10)
      : [];

    const suggestions = [];
    const grouped = new Map();

    rows.forEach((row) => {
      const key = row.type || "unknown";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    for (const [type, groupRows] of grouped.entries()) {
      const wins = groupRows.filter((row) => row.outcome?.result === "win").length;
      const losses = groupRows.filter((row) => row.outcome?.result === "loss").length;
      const count = groupRows.length;
      const winRate = count ? (wins / count) : 0;

      if (count >= 3 && winRate < 0.4) {
        suggestions.push({
          id: `sg-${Date.now()}-${type}-rule`,
          reason: `${count} ${type} con ${(winRate * 100).toFixed(0)}% win rate`,
          confidence: clamp(1 - winRate, 0, 1),
          prefilledJson: {
            id: `rule_avoid_${type}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
            type: "rule",
            name: `Evitar ${type} en condiciones actuales`,
            active: true,
            priority: 0.85,
            tags: [type, String(recentIndicators?.timeframe || "")].filter(Boolean),
            data: {
              hint: `Avoid ${type} in current conditions`,
              direction: "neutral",
              context_labels: ["auto:suggested", "performance:low"],
            },
          },
        });
      }

      if (count >= 3 && winRate > 0.7) {
        suggestions.push({
          id: `sg-${Date.now()}-${type}-pattern`,
          reason: `${count} ${type} con ${(winRate * 100).toFixed(0)}% win rate`,
          confidence: clamp(winRate, 0, 1),
          prefilledJson: {
            id: `pattern_favor_${type}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
            type: "pattern",
            name: `Favorecer ${type} en condiciones actuales`,
            active: true,
            priority: 0.9,
            tags: [type],
            data: {
              hint: `Favor ${type} in current conditions`,
              direction: toDirectionFromPattern({ type }),
              context_labels: ["auto:suggested", "performance:high"],
            },
          },
        });
      }

      void losses;
    }

    const lossRows = rows.filter((row) => row?.outcome?.result === "loss");
    if (lossRows.length >= 3) {
      const overboughtLosses = lossRows.filter((row) => Number(row?.indicators?.rsi14) > 70).length;
      if (overboughtLosses / lossRows.length >= 0.6) {
        suggestions.push({
          id: `sg-${Date.now()}-ctx-overbought`,
          reason: `RSI>70 antes de pérdidas (${overboughtLosses}/${lossRows.length})`,
          confidence: clamp(overboughtLosses / lossRows.length, 0, 1),
          prefilledJson: {
            id: "context_overbought_risky",
            type: "context",
            name: "Overbought context risky",
            active: true,
            priority: 0.75,
            tags: ["overbought", "risk"],
            data: {
              hint: "Overbought context risky",
              direction: "neutral",
              context_labels: ["rsi:overbought", "auto:suggested"],
            },
          },
        });
      }

      const lowVolumeLosses = lossRows.filter((row) => Number(row?.indicators?.volumeRatio) < 0.8).length;
      if (lowVolumeLosses / lossRows.length >= 0.6) {
        suggestions.push({
          id: `sg-${Date.now()}-ctx-lowvol`,
          reason: `Volumen bajo antes de pérdidas (${lowVolumeLosses}/${lossRows.length})`,
          confidence: clamp(lowVolumeLosses / lossRows.length, 0, 1),
          prefilledJson: {
            id: "context_low_volume_weak_signal",
            type: "context",
            name: "Low volume = weak signal",
            active: true,
            priority: 0.72,
            tags: ["low-volume", "weak-signal"],
            data: {
              hint: "Low volume = weak signal",
              direction: "neutral",
              context_labels: ["volume:low", "auto:suggested"],
            },
          },
        });
      }
    }

    const unique = [];
    const seen = new Set();
    for (const suggestion of suggestions) {
      if (seen.has(suggestion.reason)) continue;
      seen.add(suggestion.reason);
      unique.push(suggestion);
    }

    this.onSuggest?.(unique);
    return unique;
  }
}
