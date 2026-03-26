import { itemContains } from "./libraryDecisionAdapter.js";
import { buildMarketContext } from "./contextEngine.js";
import { evaluateBearishReversalEvidence } from "./reversalValidator.js";
import { combineDecisionScores } from "./decisionCombiner.js";

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
    blockedReason: extras.blockedReason || null,
    confidence: extras.confidence ?? null,
    setup: extras.setup || null,
    contextState: extras.contextState || "range",
    emaSlope: extras.emaSlope || "flat",
    priceVsEMA: extras.priceVsEMA || "unknown",
    structureState: extras.structureState || "mixed",
    trendBiasScore: Number(extras.trendBiasScore || 0),
    reversalEvidenceScore: Number(extras.reversalEvidenceScore || 0),
    counterTrendPenalty: Number(extras.counterTrendPenalty || 0),
    entrySignalScore: Number(extras.entrySignalScore || 0),
    finalShortScore: Number(extras.finalShortScore || 0),
    contextScore: Number(extras.contextScore || 0),
    reversalComponents: extras.reversalComponents || {},
    finalDecision: extras.finalDecision || action,
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

function resolveShortBlockReason({ context = {}, reversal = {} } = {}) {
  if (context.contextState === "strong_uptrend" && !reversal.confirmedBreakdown) return "short_blocked_strong_uptrend";
  if (!reversal.components?.breakdown) return "short_blocked_no_structure_break";
  if (!reversal.components?.bearishFollowthrough) return "short_blocked_no_followthrough";
  if (reversal.pullbackLikely) return "short_blocked_pullback_not_reversal";
  if (!reversal.hasRobustCombination) return "short_blocked_no_reversal_confirmation";
  return null;
}

function emitDecisionDebugLog(payload = {}) {
  console.info("[MicroBotContext] decision", {
    contextState: payload.contextState,
    emaSlope: payload.emaSlope,
    priceVsEMA: payload.priceVsEMA,
    structureState: payload.structureState,
    reversalEvidenceScore: payload.reversalEvidenceScore,
    counterTrendPenalty: payload.counterTrendPenalty,
    finalDecision: payload.finalDecision,
    blockedReason: payload.blockedReason,
  });
}

export function evaluateMicroBotDecision({ candles = [], libraryContext = null } = {}) {
  const lib = libraryContext || { patterns: [], contexts: [], lessons: [], bias: { longAllowed: true, shortAllowed: true, avoidChase: false }, warnings: [] };
  const baseWarnings = Array.isArray(lib.warnings) ? [...lib.warnings] : [];

  if (!Array.isArray(candles) || candles.length < 4) {
    return buildDecision("no_trade", "no_match", {});
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
  const shortMatched = Boolean(shortPatterns.length && bearishRejection);
  const longMatched = Boolean(longPatterns.length && bullishRejection);
  const hasPatternMatch = shortMatched || longMatched;

  if (!hasPatternMatch) {
    return buildDecision("no_trade", "no_match", {});
  }

  const matchedLibraryItems = shortMatched
    ? shortPatterns.map((item) => item.id)
    : longPatterns.map((item) => item.id);
  const setup = shortMatched ? "failed_breakout_short" : "failed_breakout_long";
  const contextFlags = detectContextFlags({ lib, candles });
  const warnings = [...baseWarnings, ...contextFlags.contextWarnings];
  const contextVeto = resolveContextVeto({ flags: contextFlags, hasPatternMatch: true });

  const context = buildMarketContext(candles);
  const reversal = evaluateBearishReversalEvidence(candles, context);
  const entrySignalScore = shortMatched || longMatched ? 0.66 : 0;
  const scorePack = combineDecisionScores({
    action: shortMatched ? "short" : longMatched ? "long" : "no_trade",
    entrySignalScore,
    context,
    reversal,
  });

  if (contextVeto.blocked) {
    const payload = {
      warnings,
      blockingReason: contextVeto.blockingReason,
      matchedLibraryItems,
      setup,
      confidence: 0.82,
      contextState: context.contextState,
      emaSlope: context.ema.slopeState,
      priceVsEMA: context.priceVsEMA,
      structureState: context.structure.structureState,
      trendBiasScore: context.trendBiasScore,
      reversalEvidenceScore: reversal.reversalEvidenceScore,
      counterTrendPenalty: scorePack.counterTrendPenalty,
      entrySignalScore,
      finalShortScore: scorePack.finalShortScore,
      contextScore: scorePack.contextScore,
      reversalComponents: reversal.components,
      blockedReason: "context_veto",
      finalDecision: "no_trade",
    };
    emitDecisionDebugLog(payload);
    return buildDecision("no_trade", "context_veto", payload);
  }

  if (shortMatched) {
    const blockReason = resolveShortBlockReason({ context, reversal });
    if (lib.bias?.shortAllowed === false) {
      const payload = {
        warnings: [...warnings, "short_not_allowed"],
        blockingReason: ["short_not_allowed"],
        matchedLibraryItems,
        setup: "failed_breakout_short",
        confidence: 0.61,
        contextState: context.contextState,
        emaSlope: context.ema.slopeState,
        priceVsEMA: context.priceVsEMA,
        structureState: context.structure.structureState,
        trendBiasScore: context.trendBiasScore,
        reversalEvidenceScore: reversal.reversalEvidenceScore,
        counterTrendPenalty: scorePack.counterTrendPenalty,
        entrySignalScore,
        finalShortScore: scorePack.finalShortScore,
        contextScore: scorePack.contextScore,
        reversalComponents: reversal.components,
        blockedReason: "short_not_allowed",
        finalDecision: "no_trade",
      };
      emitDecisionDebugLog(payload);
      return buildDecision("no_trade", "blocked_by_library", payload);
    }

    if (blockReason) {
      const payload = {
        warnings,
        blockingReason: [blockReason],
        matchedLibraryItems,
        setup: "failed_breakout_short",
        confidence: 0.57,
        contextState: context.contextState,
        emaSlope: context.ema.slopeState,
        priceVsEMA: context.priceVsEMA,
        structureState: context.structure.structureState,
        trendBiasScore: context.trendBiasScore,
        reversalEvidenceScore: reversal.reversalEvidenceScore,
        counterTrendPenalty: scorePack.counterTrendPenalty,
        entrySignalScore,
        finalShortScore: scorePack.finalShortScore,
        contextScore: scorePack.contextScore,
        reversalComponents: reversal.components,
        blockedReason: blockReason,
        finalDecision: "no_trade",
      };
      emitDecisionDebugLog(payload);
      return buildDecision("no_trade", "context_veto", payload);
    }

    const payload = {
      matchedLibraryItems,
      setup: "failed_breakout_short",
      confidence: scorePack.finalShortScore >= 0.55 ? 0.7 : 0.62,
      warnings,
      contextState: context.contextState,
      emaSlope: context.ema.slopeState,
      priceVsEMA: context.priceVsEMA,
      structureState: context.structure.structureState,
      trendBiasScore: context.trendBiasScore,
      reversalEvidenceScore: reversal.reversalEvidenceScore,
      counterTrendPenalty: scorePack.counterTrendPenalty,
      entrySignalScore,
      finalShortScore: scorePack.finalShortScore,
      contextScore: scorePack.contextScore,
      reversalComponents: reversal.components,
      finalDecision: "short",
    };
    emitDecisionDebugLog(payload);
    return buildDecision("short", "matched_library_pattern", payload);
  }

  if (longMatched) {
    if (lib.bias?.longAllowed === false) {
      const payload = {
        warnings: [...warnings, "long_not_allowed"],
        blockingReason: ["long_not_allowed"],
        matchedLibraryItems,
        setup: "failed_breakout_long",
        confidence: 0.61,
        contextState: context.contextState,
        emaSlope: context.ema.slopeState,
        priceVsEMA: context.priceVsEMA,
        structureState: context.structure.structureState,
        trendBiasScore: context.trendBiasScore,
        reversalEvidenceScore: reversal.reversalEvidenceScore,
        counterTrendPenalty: 0,
        entrySignalScore,
        finalShortScore: 0,
        contextScore: scorePack.contextScore,
        reversalComponents: reversal.components,
        blockedReason: "long_not_allowed",
        finalDecision: "no_trade",
      };
      emitDecisionDebugLog(payload);
      return buildDecision("no_trade", "blocked_by_library", payload);
    }

    const payload = {
      matchedLibraryItems,
      setup: "failed_breakout_long",
      confidence: 0.66,
      warnings,
      contextState: context.contextState,
      emaSlope: context.ema.slopeState,
      priceVsEMA: context.priceVsEMA,
      structureState: context.structure.structureState,
      trendBiasScore: context.trendBiasScore,
      reversalEvidenceScore: reversal.reversalEvidenceScore,
      counterTrendPenalty: 0,
      entrySignalScore,
      finalShortScore: 0,
      contextScore: scorePack.contextScore,
      reversalComponents: reversal.components,
      finalDecision: "long",
    };
    emitDecisionDebugLog(payload);
    return buildDecision("long", "matched_library_pattern", payload);
  }

  return buildDecision("no_trade", "no_match", {});
}
