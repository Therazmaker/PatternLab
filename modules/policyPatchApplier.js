const BOUNDED_FIELD_LIMITS = {
  "longEntry.minBullishScore": 5,
  "shortEntry.minBearishScore": 5,
  "longEntry.minConfidence": 0.05,
  "shortEntry.minConfidence": 0.05,
  "longEntry.minMomentum": 0.05,
  "shortEntry.minMomentum": 0.05,
  "longEntry.maxDistanceToResistance": 0.2,
  "shortEntry.maxDistanceToSupport": 0.2,
  "penalties.resistanceProximityPenalty": 0.1,
  "penalties.supportProximityPenalty": 0.1,
  "penalties.lowMomentumPenalty": 0.1,
  "penalties.countertrendPenalty": 0.1,
  "penalties.noFollowThroughPenalty": 0.1,
  "penalties.lateEntryPenalty": 0.1,
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function getPathValue(obj, field) {
  return String(field || "")
    .split(".")
    .reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), obj);
}

function setPathValue(obj, field, value) {
  const keys = String(field || "").split(".");
  const leaf = keys.pop();
  const target = keys.reduce((acc, key) => {
    if (!acc[key] || typeof acc[key] !== "object") acc[key] = {};
    return acc[key];
  }, obj);
  target[leaf] = value;
}

function validateApproval(proposal = {}, options = {}) {
  const explicitApproved = proposal.approved === true || proposal?.reviewStatus === "approved";
  const autoAllowed = options.mode === "bounded_auto_tune" && proposal.autoApplicable === true;
  if (!explicitApproved && !autoAllowed) {
    throw new Error("Proposal not approved for application. Require explicit approval or bounded auto tune with autoApplicable=true.");
  }
}

function assertFieldBound(change = {}) {
  const current = Number(change.oldValue);
  const next = Number(change.newValue);
  if (!Number.isFinite(current) || !Number.isFinite(next)) return;
  const maxDelta = BOUNDED_FIELD_LIMITS[change.field];
  if (!Number.isFinite(maxDelta)) return;
  const delta = Math.abs(next - current);
  if (delta > maxDelta + 1e-9) {
    throw new Error(`Change exceeds allowed bound for ${change.field}: ${delta} > ${maxDelta}`);
  }
}

function assertExactOldValue(policy, change = {}) {
  if (!change?.field) throw new Error("Invalid proposal change: missing field");
  const existing = getPathValue(policy, change.field);
  if (typeof existing === "undefined") throw new Error(`Proposal field does not exist: ${change.field}`);
  if (existing !== change.oldValue) {
    throw new Error(`Old value mismatch for ${change.field}. expected=${change.oldValue} actual=${existing}`);
  }
}

function bumpPolicyVersion(policyVersion = "live_v1") {
  const matched = String(policyVersion).match(/^(.*)_v(\d+)$/);
  if (!matched) return `${policyVersion}_v2`;
  const prefix = matched[1];
  const current = Number(matched[2]);
  return `${prefix}_v${current + 1}`;
}

export function applyPolicyProposal(currentPolicy = {}, proposal = {}, options = {}) {
  validateApproval(proposal, options);
  const changes = Array.isArray(proposal?.changes) ? proposal.changes : [];
  if (!changes.length) throw new Error("Proposal has no changes to apply.");

  const basePolicy = clone(currentPolicy);
  const newPolicy = clone(currentPolicy);

  changes.forEach((change) => {
    assertExactOldValue(basePolicy, change);
    assertFieldBound(change);
    setPathValue(newPolicy, change.field, change.newValue);
  });

  const previousVersion = String(currentPolicy?.policyVersion || "live_v1");
  const newVersion = bumpPolicyVersion(previousVersion);
  newPolicy.policyVersion = newVersion;
  const historyEntry = {
    previousVersion,
    newVersion,
    appliedProposalId: String(proposal?.proposalId || "proposal_unknown"),
    appliedAt: new Date().toISOString(),
    summary: String(proposal?.title || "Policy patch applied"),
  };

  if (!Array.isArray(newPolicy.policyHistory)) newPolicy.policyHistory = [];
  newPolicy.policyHistory = [...newPolicy.policyHistory, historyEntry];

  console.info("Policy proposal applied", {
    proposalId: historyEntry.appliedProposalId,
    previousVersion,
    newVersion,
  });

  return {
    newPolicy,
    policyHistoryEntry: historyEntry,
  };
}
