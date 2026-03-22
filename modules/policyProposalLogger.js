import { loadFuturesPolicySnapshots, saveFuturesPolicySnapshots } from "./storage.js";

const POLICY_PROPOSAL_RUN_TYPE = "policy_proposal_run";
const POLICY_APPLIED_PATCH_TYPE = "policy_applied_patch";

function appendSnapshotEntry(entry) {
  const snapshots = loadFuturesPolicySnapshots();
  const next = [entry, ...(Array.isArray(snapshots) ? snapshots : [])].slice(0, 500);
  return saveFuturesPolicySnapshots(next).then(() => entry);
}

export async function logPolicyProposalRun(runOutput = {}) {
  const entry = {
    id: runOutput.runId || `policy_run_${Date.now().toString(36)}`,
    type: POLICY_PROPOSAL_RUN_TYPE,
    createdAt: runOutput.generatedAt || new Date().toISOString(),
    policyVersionBase: runOutput.policyVersionBase || "unknown",
    payload: runOutput,
  };
  return appendSnapshotEntry(entry);
}

export async function logAppliedPolicyPatch(historyEntry = {}) {
  const entry = {
    id: `${historyEntry.appliedProposalId || "policy_patch"}_${Date.now().toString(36)}`,
    type: POLICY_APPLIED_PATCH_TYPE,
    createdAt: historyEntry.appliedAt || new Date().toISOString(),
    policyVersionBase: historyEntry.previousVersion || "unknown",
    payload: historyEntry,
  };
  return appendSnapshotEntry(entry);
}
