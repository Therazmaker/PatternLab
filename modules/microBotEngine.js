import { itemContains } from "./libraryDecisionAdapter.js";

function avgRange(candles = [], size = 8) {
  const slice = candles.slice(-size);
  const ranges = slice
    .map((candle) => Number(candle?.high) - Number(candle?.low))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!ranges.length) return 0;
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function buildDecision(action, reason, extras = {}) {
  return {
    action,
    reason,
    matchedLibraryItems: extras.matchedLibraryItems || [],
    warnings: extras.warnings || [],
    blockingReason: extras.blockingReason || [],
    confidence: extras.confidence ?? null,
    setup: extras.setup || null,
  };
}

function detectContextFlags({ lib = {}, candles = [] } = {}) {
  const activeItems = Array.isArray(lib.activeItems) ? lib.activeItems : [];
  const contexts = Array.isArray(lib.contexts) ? lib.contexts : [];
  const warnings = Array.isArray(lib.warnings) ? lib.warnings : [];
  const contextItems = contexts.length ? contexts : activeItems;

  const highDangerItem = contextItems.find((item) => itemContains(item, ["high danger", "high_danger", "danger context", "risk off"]));
  const lateMoveItem = contextItems.find((item) => itemContains(item, ["late move", "late entry", "extended", "extension", "overextended"]));

  const last = candles[candles.length - 1] || {};
  const ar = avgRange(candles, 12);
  const body = Math.abs(Number(last.close) - Number(last.open));
  const extensionRatio = ar > 0 ? body / ar : 0;

  const isExtendedMove = extensionRatio >= 1.4;
  const isLateMove = Boolean(lateMoveItem) || extensionRatio >= 1.2;
  const hasHighDanger = Boolean(highDangerItem) || warnings.some((w) => String(w || "").toLowerCase().includes("danger"));
  const avoidChaseActive = Boolean(lib.bias?.avoidChase);

  const dangerWarnings = [];
  if (hasHighDanger) dangerWarnings.push("high_danger_context");
  if (avoidChaseActive) dangerWarnings.push("avoid_chase_active");
  if (isLateMove || isExtendedMove) dangerWarnings.push("late_entry_risk");

  return {
    hasHighDanger,
    avoidChaseActive,
    isLateMove,
    isExtendedMove,
    contextWarnings: dangerWarnings,
    matchedContextItems: [highDangerItem, lateMoveItem].filter(Boolean).map((item) => item.id),
  };
}

function resolveContextVeto({ flags = {}, hasPatternMatch = false } = {}) {
  const blockingReason = [];

  if (flags.hasHighDanger && (flags.isLateMove || flags.isExtendedMove)) {
    blockingReason.push("high_danger_late_extension");
  }

  if (flags.avoidChaseActive && flags.isExtendedMove) {
    blockingReason.push("avoid_chase_strong_extension");
  }

  if (hasPatternMatch && blockingReason.length) {
    return {
      blocked: true,
      reason: "context_veto",
      blockingReason,
    };
  }

  return {
    blocked: false,
    reason: null,
    blockingReason,
  };
}

export function evaluateMicroBotDecision({ candles = [], libraryContext = null } = {}) {
  const lib = libraryContext || { patterns: [], contexts: [], lessons: [], bias: { longAllowed: true, shortAllowed: true, avoidChase: false }, warnings: [] };
  const baseWarnings = Array.isArray(lib.warnings) ? [...lib.warnings] : [];

  if (!Array.isArray(candles) || candles.length < 3) {
    return buildDecision("no_trade", "no_match", { warnings: [...baseWarnings, "insufficient_candles"], blockingReason: ["insufficient_candles"] });
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(Number(last.close) - Number(last.open));
  const upperWick = Number(last.high) - Math.max(Number(last.open), Number(last.close));
  const lowerWick = Math.min(Number(last.open), Number(last.close)) - Number(last.low);

  const shortPatterns = (lib.patterns || []).filter((item) => itemContains(item, ["failed breakout short", "rejection short", "sweep short", "fade high"]));
  const longPatterns = (lib.patterns || []).filter((item) => itemContains(item, ["failed breakout long", "rejection long", "sweep long", "fade low"]));

  const bearishRejection = Number(last.close) < Number(last.open) && upperWick > body * 0.6 && Number(last.high) >= Number(prev.high);
  const bullishRejection = Number(last.close) > Number(last.open) && lowerWick > body * 0.6 && Number(last.low) <= Number(prev.low);
  const hasPatternMatch = (shortPatterns.length && bearishRejection) || (longPatterns.length && bullishRejection);

  const contextFlags = detectContextFlags({ lib, candles });
  const warnings = [...baseWarnings, ...contextFlags.contextWarnings];
  const contextVeto = resolveContextVeto({ flags: contextFlags, hasPatternMatch: Boolean(hasPatternMatch) });

  if (contextVeto.blocked) {
    return buildDecision("no_trade", contextVeto.reason, {
      warnings,
      blockingReason: contextVeto.blockingReason,
      matchedLibraryItems: [...shortPatterns, ...longPatterns].map((item) => item.id),
      setup: shortPatterns.length ? "failed_breakout_short" : longPatterns.length ? "failed_breakout_long" : null,
      confidence: 0.82,
    });
  }

  if (shortPatterns.length && bearishRejection) {
    if (lib.bias?.shortAllowed === false) {
      return buildDecision("no_trade", "blocked_by_library", {
        warnings: [...warnings, "short_not_allowed"],
        blockingReason: ["short_not_allowed"],
        matchedLibraryItems: shortPatterns.map((item) => item.id),
        setup: "failed_breakout_short",
        confidence: 0.61,
      });
    }
    return buildDecision("short", "matched_library_pattern", {
      matchedLibraryItems: shortPatterns.map((item) => item.id),
      setup: "failed_breakout_short",
      confidence: 0.66,
      warnings,
    });
  }

  if (longPatterns.length && bullishRejection) {
    if (lib.bias?.longAllowed === false) {
      return buildDecision("no_trade", "blocked_by_library", {
        warnings: [...warnings, "long_not_allowed"],
        blockingReason: ["long_not_allowed"],
        matchedLibraryItems: longPatterns.map((item) => item.id),
        setup: "failed_breakout_long",
        confidence: 0.61,
      });
    }
    return buildDecision("long", "matched_library_pattern", {
      matchedLibraryItems: longPatterns.map((item) => item.id),
      setup: "failed_breakout_long",
      confidence: 0.66,
      warnings,
    });
  }

  return buildDecision("no_trade", "no_match", { warnings, blockingReason: ["no_clear_pattern"], confidence: 0.35 });
}
