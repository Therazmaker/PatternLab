import { updateSignalSrContext } from "./sr.js";

export function applyReview(signal, payload) {
  const updated = structuredClone(signal);
  const status = payload.status;
  updated.outcome.status = status;
  updated.outcome.comment = payload.comment || "";
  updated.outcome.reviewedAt = new Date().toISOString();
  updated.outcome.expiryClose = payload.expiryClose ?? null;
  if (status === "win") updated.outcome.win = true;
  else if (status === "loss") updated.outcome.win = false;
  else updated.outcome.win = null;

  updated.reviewMeta = {
    labels: payload.labels || [],
    executionError: Boolean(payload.executionError),
    lateEntry: Boolean(payload.lateEntry),
    reviewer: "manual",
    updatedAt: updated.outcome.reviewedAt,
  };

  return updateSignalSrContext(updated, payload.srContext);
}
