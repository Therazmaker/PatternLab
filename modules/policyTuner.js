import { aggregatePolicyEvidence } from "./policyEvidenceAggregator.js";
import {
  shouldEnableBlockInRange,
  shouldIncreaseConfidenceThreshold,
  shouldIncreaseCountertrendPenalty,
  shouldIncreaseLateEntryPenalty,
  shouldIncreaseMomentumThreshold,
  shouldIncreaseNoFollowThroughPenalty,
  shouldRecommendStructureConfirmation,
  shouldTightenLongResistanceRule,
  shouldTightenShortSupportRule,
  TUNING_BOUNDS,
} from "./policyAdjustmentRules.js";

function uuid(prefix = "policy") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function rankWeight(proposal = {}) {
  const categoryWeight = proposal.category === "filter" ? 0.2 : proposal.category === "threshold" ? 0.15 : 0.1;
  const sampleWeight = Math.min(0.2, (proposal?.basedOn?.sampleSize || 0) / 100);
  return (proposal.confidence || 0) + categoryWeight + sampleWeight;
}

function withIds(proposals = []) {
  return proposals.map((proposal, index) => ({
    ...proposal,
    proposalId: proposal.proposalId || uuid(`proposal_${index + 1}`),
  }));
}

function pruneConflicts(proposals = []) {
  const pickedByField = new Map();
  proposals.forEach((proposal) => {
    const fields = (proposal.changes || []).map((change) => change.field);
    fields.forEach((field) => {
      const current = pickedByField.get(field);
      if (!current || proposal.confidence > current.confidence) pickedByField.set(field, proposal);
    });
  });

  return proposals.filter((proposal) => {
    const fields = (proposal.changes || []).map((change) => change.field);
    return fields.every((field) => pickedByField.get(field) === proposal);
  });
}

function createLowEvidenceLogger(candidates = []) {
  candidates.forEach((candidate) => {
    if (!candidate) {
      console.info("Proposal candidate rejected due to low evidence");
    }
  });
}

function filterRecentWindow(items = [], recentWindow = null) {
  if (!recentWindow || recentWindow <= 0) return Array.isArray(items) ? items : [];
  return (Array.isArray(items) ? items : []).slice(-recentWindow);
}

export function generatePolicyProposals(currentPolicy = {}, trades = [], decisions = [], options = {}) {
  const mergedOptions = {
    mode: options.mode || "suggest_only",
    minSampleSize: Number.isFinite(Number(options.minSampleSize)) ? Number(options.minSampleSize) : TUNING_BOUNDS.weakSampleSize,
    recentWindow: Number.isFinite(Number(options.recentWindow)) ? Number(options.recentWindow) : null,
    maxProposalsPerRun: Number.isFinite(Number(options.maxProposalsPerRun)) ? Number(options.maxProposalsPerRun) : 5,
  };

  const scopedTrades = filterRecentWindow(trades, mergedOptions.recentWindow);
  const scopedDecisions = filterRecentWindow(decisions, mergedOptions.recentWindow);
  const evidenceSummary = aggregatePolicyEvidence(scopedTrades, scopedDecisions);

  const ruleConfig = { minSampleSize: mergedOptions.minSampleSize };

  const candidates = [
    shouldTightenLongResistanceRule(evidenceSummary, currentPolicy, ruleConfig),
    shouldTightenShortSupportRule(evidenceSummary, currentPolicy, ruleConfig),
    shouldIncreaseMomentumThreshold(evidenceSummary, "LONG", currentPolicy, ruleConfig),
    shouldIncreaseMomentumThreshold(evidenceSummary, "SHORT", currentPolicy, ruleConfig),
    shouldIncreaseCountertrendPenalty(evidenceSummary, currentPolicy, ruleConfig),
    shouldIncreaseNoFollowThroughPenalty(evidenceSummary, currentPolicy, ruleConfig),
    shouldIncreaseLateEntryPenalty(evidenceSummary, currentPolicy, ruleConfig),
    shouldIncreaseConfidenceThreshold(evidenceSummary, "LONG", currentPolicy, ruleConfig),
    shouldIncreaseConfidenceThreshold(evidenceSummary, "SHORT", currentPolicy, ruleConfig),
    shouldEnableBlockInRange(evidenceSummary, currentPolicy, ruleConfig),
    shouldRecommendStructureConfirmation(evidenceSummary, currentPolicy, ruleConfig),
  ];

  createLowEvidenceLogger(candidates);

  let proposals = candidates.filter(Boolean);
  proposals = pruneConflicts(proposals);

  proposals = proposals
    .sort((a, b) => rankWeight(b) - rankWeight(a))
    .slice(0, mergedOptions.maxProposalsPerRun)
    .map((proposal) => ({
      ...proposal,
      autoApplicable: mergedOptions.mode === "bounded_auto_tune" ? Boolean(proposal.autoApplicable) : false,
    }));

  const identifiedProposals = withIds(proposals);

  const output = {
    runId: uuid("policy_run"),
    policyVersionBase: String(currentPolicy?.policyVersion || "unknown_policy"),
    mode: mergedOptions.mode,
    generatedAt: new Date().toISOString(),
    evidenceSummary,
    proposals: identifiedProposals,
    debugSummary: {
      topLosingPatterns: evidenceSummary?.debugSummary?.topLosingPatterns || [],
      topWinningPatterns: evidenceSummary?.debugSummary?.topWinningPatterns || [],
      strongestOperatorSaves: evidenceSummary?.debugSummary?.strongestOperatorSaves || {},
      fieldsMostLikelyToBenefit: evidenceSummary?.debugSummary?.likelyFieldsToTune || [],
    },
    reviewPanelRows: identifiedProposals.map((proposal) => ({
      proposalId: proposal.proposalId,
      title: proposal.title,
      affectedFields: (proposal.changes || []).map((change) => change.field),
      oldToNew: (proposal.changes || []).map((change) => `${change.oldValue} -> ${change.newValue}`),
      reasonCodes: proposal?.basedOn?.reasonCodes || [],
      sampleSize: proposal?.basedOn?.sampleSize || 0,
      confidence: proposal.confidence,
      expectedEffect: proposal.expectedEffect,
      status: "pending_review",
    })),
  };

  console.info("Policy proposals generated", {
    runId: output.runId,
    proposals: output.proposals.length,
    mode: output.mode,
  });

  return output;
}
