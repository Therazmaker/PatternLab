export function applyReview(signal, status, comment) {
  const updated = structuredClone(signal);
  updated.outcome.status = status;
  updated.outcome.comment = comment;
  updated.outcome.reviewedAt = new Date().toISOString();
  if (status === "win") updated.outcome.win = true;
  else if (status === "loss") updated.outcome.win = false;
  else updated.outcome.win = null;
  return updated;
}
