import { normalizeDirection } from "./operatorActionTypes.js";

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function asSignedMachineComponent(machineSignal = {}) {
  const bullish = Number(machineSignal.bullishScore || 0);
  const bearish = Number(machineSignal.bearishScore || 0);
  const confidence = clamp(machineSignal.confidence, 0, 1);
  return clamp(((bullish - bearish) / 100) * (0.5 + confidence * 0.5), -0.7, 0.7);
}

function asStructureComponent(structureFilterResult = {}) {
  const decision = String(structureFilterResult.decision || structureFilterResult.structureDecision || "ALLOW").toUpperCase();
  if (decision === "BLOCK") return -0.35;
  if (decision === "REQUIRES_MANUAL_CONFIRMATION") return -0.22;
  if (decision === "WARN") return -0.12;
  return 0.05;
}

function classifyDecision(score) {
  if (score <= -0.35) return "BLOCK";
  if (score <= -0.15) return "REQUIRES_MANUAL_CONFIRMATION";
  if (score <= 0.05) return "WARN";
  return "ALLOW";
}

export function combineFinalDecision(machineSignal = {}, structureFilterResult = {}, operatorModifier = {}, learningModifier = {}, triggerLineEffects = {}) {
  const machineComponent = asSignedMachineComponent(machineSignal);
  const structureComponent = asStructureComponent(structureFilterResult);
  const operatorComponent = clamp(operatorModifier.modifierScore, -0.45, 0.45);
  const learningComponent = clamp(learningModifier.modifierScore, -0.7, 0.7);
  const triggerDirection = String(machineSignal.direction || machineSignal.bias || "NONE").toUpperCase();
  const triggerComponentRaw = triggerDirection === "LONG"
    ? Number(triggerLineEffects.longModifier || 0)
    : triggerDirection === "SHORT"
      ? Number(triggerLineEffects.shortModifier || 0)
      : (Number(triggerLineEffects.longModifier || 0) + Number(triggerLineEffects.shortModifier || 0)) * 0.5;
  const triggerComponent = clamp(triggerComponentRaw, -0.45, 0.45);

  const totalScore = clamp(machineComponent + structureComponent + learningComponent + operatorComponent + triggerComponent, -1, 1);
  let finalDecision = classifyDecision(totalScore);

  const biasFromMachine = normalizeDirection(machineSignal.direction || machineSignal.bias || "NONE", "NONE");
  const finalBias = totalScore > 0.07 ? (biasFromMachine === "NONE" ? "LONG" : biasFromMachine)
    : totalScore < -0.07 ? (biasFromMachine === "NONE" ? "SHORT" : biasFromMachine)
      : "NONE";

  const confidence = clamp(Math.abs(totalScore));
  const reasonCodes = [
    `machine_component_${machineComponent >= 0 ? "positive" : "negative"}`,
    `structure_component_${structureComponent >= 0 ? "supportive" : "penalized"}`,
    `learning_component_${learningComponent >= 0 ? "supportive" : "protective"}`,
    `operator_component_${operatorComponent >= 0 ? "supportive" : "protective"}`,
    `trigger_component_${triggerComponent >= 0 ? "supportive" : "protective"}`,
  ];

  if (operatorModifier.effectOnDecision === "block") reasonCodes.push("operator_blocking_modifier");
  if (operatorModifier.effectOnDecision === "require_confirmation") reasonCodes.push("operator_requires_confirmation");
  if (learningModifier.requiresConfirmation) reasonCodes.push("learning_requires_confirmation");
  if (learningModifier.forcedByLearning) reasonCodes.push("learning_forced_confirmation");
  if (triggerLineEffects.requireConfirmation) reasonCodes.push("trigger_requires_confirmation");
  if ((triggerDirection === "LONG" && triggerLineEffects.blockLong) || (triggerDirection === "SHORT" && triggerLineEffects.blockShort)) {
    reasonCodes.push("trigger_bias_blocked");
    finalDecision = "BLOCK";
  }
  if (triggerLineEffects.reasonCodes?.length) reasonCodes.push(...triggerLineEffects.reasonCodes.slice(0, 5));

  const summaryText = `Final decision combined. Machine ${machineComponent.toFixed(2)} + structure ${structureComponent.toFixed(2)} + learning ${learningComponent.toFixed(2)} + operator ${operatorComponent.toFixed(2)} + trigger ${triggerComponent.toFixed(2)} = ${totalScore.toFixed(2)} -> ${finalDecision}.`;

  console.debug("Final decision combined", {
    machineComponent,
    structureComponent,
    learningComponent,
    operatorComponent,
    triggerComponent,
    finalDecision,
  });

  return {
    finalDecision,
    finalBias,
    confidence: Number(confidence.toFixed(4)),
    decisionBreakdown: {
      machineComponent: Number(machineComponent.toFixed(4)),
      structureComponent: Number(structureComponent.toFixed(4)),
      learningComponent: Number(learningComponent.toFixed(4)),
      operatorComponent: Number(operatorComponent.toFixed(4)),
      triggerComponent: Number(triggerComponent.toFixed(4)),
      finalDecision,
    },
    reasonCodes,
    summaryText,
  };
}
