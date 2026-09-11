import { runStructuredAgent } from "../gemini";
import {
  CritiqueSchema,
  RefinementResultSchema,
  sanitizeMindMap,
  type ContextAnalysis,
  type ExplorationFindings,
  type AssumptionChallenge,
  type MindMap,
  type Critique,
  type RefinementResult,
} from "../schemas";

export const CRITIC_PURPOSE =
  "Reviews the synthesized mind map against the original problem and the other agents' findings: identifies gaps, weak or duplicate branches, and recommends concrete changes.";

export const POST_REFINEMENT_CRITIC_PURPOSE =
  "Re-reviews the map after refinement, using the exact same review process as the first pass, so the human sees an honest, up-to-date assessment instead of trusting an unreviewed edit.";

export const REFINEMENT_PURPOSE =
  "Takes the human's feedback and produces a revised mind map that visibly incorporates it, while preserving what already worked.";

const CRITIC_SYSTEM = `You are the Critic agent inside a multi-agent mind-mapping system for UX/design work.
Review the synthesized mind map critically. Compare it against: the original request, the Context Analyzer's requirements/constraints, the Exploration agent's findings, and the Assumption Challenger's findings.

Identify: genuine strengths (be specific, not just "well organized"), gaps (things those other agents surfaced that the map dropped), weak branches (generic/thin/filler), duplicate or overlapping branches, and concrete recommended changes. Be honest and specific - a critique that only says positive things has failed.`;

export async function critiqueMindMap(
  userInput: string,
  context: ContextAnalysis,
  exploration: ExplorationFindings,
  challenge: AssumptionChallenge,
  mindMap: MindMap,
): Promise<Critique> {
  const user = buildReviewContext(userInput, context, exploration, challenge, mindMap);
  return runStructuredAgent({
    agentName: "Critic",
    system: CRITIC_SYSTEM,
    user,
    schema: CritiqueSchema,
    effort: "high",
    maxTokens: 5000,
  });
}

export function summarizeCritique(c: Critique): string {
  return `Found ${c.strengths.length} strength(s), ${c.gaps.length} gap(s), ${c.weakBranches.length} weak branch(es), and ${c.recommendedChanges.length} recommended change(s).`;
}

const REFINEMENT_SYSTEM = `You are the Refinement agent (part of the Critic & Refinement role) inside a multi-agent mind-mapping system for UX/design work.
A human has reviewed the mind map, its critique, and the other agents' findings, and given feedback in their own words. Produce a revised mind map that visibly and concretely acts on that feedback - the human must be able to see their feedback reflected in the result.

Rules:
- Honor the feedback precisely: if they say "focus more on X", expand X with real sub-branches and can shrink/demote less relevant branches; if they say "remove Y", remove it; if they say "add Z", add a real branch for Z, not a token mention; if they ask a question ("what other stakeholders are missing?"), answer it by adding the missing stakeholders as branches.
- Keep everything from the previous map that the feedback didn't ask to change, unless the critique already flagged it as a weak/duplicate branch worth dropping.
- Still avoid generic filler nodes. Keep ids stable for unchanged nodes where possible.
- changesSummary must be a concrete, specific list of what changed (e.g. "Added a Caregivers branch with 3 sub-nodes" not "improved the map").`;

export async function refineMindMap(
  userInput: string,
  additionalContext: string,
  context: ContextAnalysis,
  exploration: ExplorationFindings,
  challenge: AssumptionChallenge,
  previousMindMap: MindMap,
  previousCritique: Critique,
  feedback: string,
): Promise<RefinementResult> {
  const user = `${buildReviewContext(userInput, context, exploration, challenge, previousMindMap)}

PREVIOUS CRITIQUE
Strengths: ${previousCritique.strengths.join("; ")}
Gaps: ${previousCritique.gaps.join("; ")}
Weak branches: ${previousCritique.weakBranches.join("; ")}
Duplicates: ${previousCritique.duplicates.join("; ")}
Recommended changes: ${previousCritique.recommendedChanges.join("; ")}

HUMAN FEEDBACK (must be visibly incorporated):
"""${feedback}"""
${additionalContext ? `\nOriginal additional context: """${additionalContext}"""` : ""}

Produce the refined mind map now.`;

  const refinement = await runStructuredAgent({
    agentName: "Refinement Agent",
    system: REFINEMENT_SYSTEM,
    user,
    schema: RefinementResultSchema,
    effort: "high",
    maxTokens: 8000,
  });
  return { ...refinement, mindMap: sanitizeMindMap(refinement.mindMap) };
}

export function summarizeRefinement(r: RefinementResult): string {
  return r.changesSummary.length > 0
    ? `Applied ${r.changesSummary.length} change(s): ${r.changesSummary.slice(0, 3).join("; ")}${r.changesSummary.length > 3 ? "…" : ""}`
    : "Produced a refined mind map.";
}

function buildReviewContext(
  userInput: string,
  context: ContextAnalysis,
  exploration: ExplorationFindings,
  challenge: AssumptionChallenge,
  mindMap: MindMap,
): string {
  return `Original request: """${userInput}"""

CONTEXT ANALYSIS
Goal: ${context.goal}
Requirements: ${context.requirements.join("; ")}
Constraints: ${context.constraints.join("; ")}

EXPLORATION FINDINGS
Additional stakeholders: ${exploration.additionalStakeholders.join("; ")}
Alternative directions: ${exploration.alternativeDirections.join("; ")}
Missing branches: ${exploration.missingBranches.join("; ")}
Risks: ${exploration.risks.join("; ")}

ASSUMPTIONS CHALLENGED
Missing stakeholders: ${challenge.missingStakeholders.join("; ")}
Blind spots: ${challenge.blindSpots.join("; ")}

CURRENT MIND MAP (JSON)
${JSON.stringify(mindMap, null, 2)}`;
}
