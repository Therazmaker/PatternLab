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

  const withSr = updateSignalSrContext(updated, payload.srContext);
  if (payload.candleData) withSr.candleData = payload.candleData;
  if (payload.excursion) withSr.excursion = payload.excursion;
  if (payload.sessionRef) withSr.sessionRef = payload.sessionRef;
  if (payload.v3Meta) withSr.v3Meta = payload.v3Meta;
  return withSr;
}
