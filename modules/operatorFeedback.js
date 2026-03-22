const OPERATOR_ACTIONS = [
  "approve",
  "veto",
  "still_short",
  "still_long",
  "pullback_only",
  "reversal_confirmed",
  "needs_confirmation",
  "resistance_active",
  "support_active",
];

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function normalizeActionList(actions = []) {
  const list = Array.isArray(actions) ? actions : [actions];
  return [...new Set(list.map((action) => String(action || "").trim().toLowerCase()).filter((action) => OPERATOR_ACTIONS.includes(action)))];
}

function inferTrendDirection(machineDecision = {}) {
  const bias = String(machineDecision.probabilityBias || "neutral").toLowerCase();
  if (bias === "bullish" || bias === "bearish") return bias;
  const bullish = Number(machineDecision.bullishScore || 0);
  const bearish = Number(machineDecision.bearishScore || 0);
  if (bullish > bearish + 3) return "bullish";
  if (bearish > bullish + 3) return "bearish";
  return "neutral";
}

function buildBaseDecision(record = {}) {
  const policy = record.policy || {};
  return {
    action: policy.action || "NO_TRADE",
    confidence: Number(policy.confidence || 0),
    reason: policy.reason || "",
    bullishScore: Number(policy.bullishScore || 0),
    bearishScore: Number(policy.bearishScore || 0),
    neutralScore: Number(policy.neutralScore || 0),
    probabilityBias: policy.probabilityBias || "neutral",
    probabilityConfidence: Number(policy.probabilityConfidence || 0),
    plan: record.plan || null,
  };
}

export function getOperatorActions() {
  return [...OPERATOR_ACTIONS];
}

export function applyOperatorFeedback(record = {}, payload = {}) {
  const machineDecision = record.decisionTrace?.machine || buildBaseDecision(record);
  const actions = normalizeActionList(payload.actions);
  const note = String(payload.note || "").trim();

  const nextScores = {
    bullish: clamp(machineDecision.bullishScore),
    bearish: clamp(machineDecision.bearishScore),
    neutral: clamp(machineDecision.neutralScore),
  };

  let finalAction = machineDecision.action;
  let finalState = "ready";
  let confidence = clamp(machineDecision.confidence * 100, 0, 100) / 100;
  let blockedByPullback = false;
  const influence = [];
  const trendDirection = inferTrendDirection(machineDecision);

  actions.forEach((action) => {
    if (action === "still_short") {
      nextScores.bearish = clamp(nextScores.bearish + 18);
      nextScores.bullish = clamp(nextScores.bullish - 14);
      confidence = Math.min(1, confidence + 0.06);
      influence.push("Operator still_short: bearish continuation boosted, bullish reversal penalized.");
    }
    if (action === "still_long") {
      nextScores.bullish = clamp(nextScores.bullish + 18);
      nextScores.bearish = clamp(nextScores.bearish - 14);
      confidence = Math.min(1, confidence + 0.06);
      influence.push("Operator still_long: bullish continuation boosted, bearish reversal penalized.");
    }
    if (action === "pullback_only") {
      blockedByPullback = true;
      nextScores.neutral = clamp(nextScores.neutral + 10);
      influence.push("Operator pullback_only: reversal trades blocked unless stronger confirmation appears.");
    }
    if (action === "reversal_confirmed") {
      blockedByPullback = false;
      nextScores.neutral = clamp(nextScores.neutral - 8);
      influence.push("Operator reversal_confirmed: reversal block removed.");
    }
    if (action === "resistance_active") {
      nextScores.bullish = clamp(nextScores.bullish - 10);
      nextScores.bearish = clamp(nextScores.bearish + 7);
      influence.push("Operator resistance_active: long pressure discounted near resistance.");
    }
    if (action === "support_active") {
      nextScores.bearish = clamp(nextScores.bearish - 10);
      nextScores.bullish = clamp(nextScores.bullish + 7);
      influence.push("Operator support_active: short pressure discounted near support.");
    }
    if (action === "approve") {
      confidence = Math.min(1, confidence + 0.03);
      influence.push("Operator approve: machine thesis accepted.");
    }
    if (action === "veto") {
      finalAction = "NO_TRADE";
      finalState = "operator_vetoed";
      confidence = Math.min(confidence, 0.35);
      influence.push("Operator veto: current signal blocked.");
    }
    if (action === "needs_confirmation") {
      finalState = "requires_manual_confirmation";
      influence.push("Operator needs_confirmation: trade paused for confirmation.");
    }
  });

  if (finalState !== "operator_vetoed") {
    if (nextScores.bullish > nextScores.bearish + 4 && nextScores.bullish > nextScores.neutral + 3) finalAction = "LONG";
    else if (nextScores.bearish > nextScores.bullish + 4 && nextScores.bearish > nextScores.neutral + 3) finalAction = "SHORT";
    else finalAction = "NO_TRADE";

    if (blockedByPullback) {
      const strongBullish = nextScores.bullish > nextScores.bearish + 16 && confidence >= 0.7;
      const strongBearish = nextScores.bearish > nextScores.bullish + 16 && confidence >= 0.7;
      const reversalAttemptAgainstBearTrend = trendDirection === "bearish" && finalAction === "LONG";
      const reversalAttemptAgainstBullTrend = trendDirection === "bullish" && finalAction === "SHORT";
      if ((reversalAttemptAgainstBearTrend && !strongBullish) || (reversalAttemptAgainstBullTrend && !strongBearish)) {
        finalAction = "NO_TRADE";
        influence.push("Pullback-only guard blocked reversal due to insufficient confirmation strength.");
      }
    }
  }

  const explanation = [
    `Machine action ${machineDecision.action} (${Math.round(machineDecision.confidence * 100)}% confidence).`,
    ...influence,
    `Recalculated scores → Bullish ${nextScores.bullish.toFixed(1)} · Bearish ${nextScores.bearish.toFixed(1)} · Neutral ${nextScores.neutral.toFixed(1)}.`,
    `Final action ${finalAction}${finalState !== "ready" ? ` · state ${finalState}` : ""}.`,
    note ? `Operator note: ${note}` : "",
  ].filter(Boolean).join(" ");

  return {
    actions,
    note,
    recalculated: {
      bullishScore: nextScores.bullish,
      bearishScore: nextScores.bearish,
      neutralScore: nextScores.neutral,
      finalAction,
      finalState,
      confidence,
      explanation,
      operatorInfluence: influence,
      timestamp: payload.timestamp || new Date().toISOString(),
    },
  };
}

export function deriveOperatorPatternFeedback(record = {}) {
  const actions = record?.operatorFeedback?.actions || [];
  const machineAction = record?.decisionTrace?.machine?.action || record?.policy?.action || "NO_TRADE";
  const correctedAction = record?.decisionTrace?.operatorCorrected?.finalAction || machineAction;
  const trendBias = inferTrendDirection(record?.decisionTrace?.machine || buildBaseDecision(record));

  const tags = [];
  if (actions.includes("still_short") && trendBias === "bearish") tags.push("user_often_overrides_to_still_short_in_downtrends");
  if (actions.includes("pullback_only") && correctedAction === "NO_TRADE") tags.push("user_often_marks_pullback_only_before_failed_reversals");
  if (actions.includes("veto") && machineAction === "LONG" && trendBias === "bearish") tags.push("user_often_blocks_longs_during_bearish_continuation");
  return tags;
}
