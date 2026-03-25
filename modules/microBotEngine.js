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
    confidence: extras.confidence ?? null,
    warnings: extras.warnings || [],
    setup: extras.setup || null,
  };
}

export function evaluateMicroBotDecision({ candles = [], libraryContext = null } = {}) {
  const lib = libraryContext || { patterns: [], contexts: [], lessons: [], bias: { longAllowed: true, shortAllowed: true, avoidChase: false }, warnings: [] };
  const warnings = Array.isArray(lib.warnings) ? [...lib.warnings] : [];

  if (!Array.isArray(candles) || candles.length < 3) {
    return buildDecision("no_trade", "no_match", { warnings: [...warnings, "insufficient_candles"] });
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(Number(last.close) - Number(last.open));
  const upperWick = Number(last.high) - Math.max(Number(last.open), Number(last.close));
  const lowerWick = Math.min(Number(last.open), Number(last.close)) - Number(last.low);
  const ar = avgRange(candles, 12);
  const expanded = ar > 0 ? body > ar * 1.2 : false;

  if (lib.bias?.avoidChase && expanded) {
    return buildDecision("no_trade", "blocked_by_library", {
      warnings: [...warnings, "blocked_chase_after_expansion"],
      matchedLibraryItems: lib.contexts.filter((item) => itemContains(item, ["chase", "expansion"])).map((item) => item.id),
      setup: "blocked_chase",
      confidence: 0.75,
    });
  }

  const shortPatterns = (lib.patterns || []).filter((item) => itemContains(item, ["failed breakout short", "rejection short", "sweep short", "fade high"]));
  const longPatterns = (lib.patterns || []).filter((item) => itemContains(item, ["failed breakout long", "rejection long", "sweep long", "fade low"]));

  const bearishRejection = Number(last.close) < Number(last.open) && upperWick > body * 0.6 && Number(last.high) >= Number(prev.high);
  const bullishRejection = Number(last.close) > Number(last.open) && lowerWick > body * 0.6 && Number(last.low) <= Number(prev.low);

  if (shortPatterns.length && bearishRejection) {
    if (lib.bias?.shortAllowed === false) {
      return buildDecision("no_trade", "blocked_by_library", {
        warnings: [...warnings, "short_not_allowed"],
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

  return buildDecision("no_trade", "no_match", { warnings, confidence: 0.35 });
}
