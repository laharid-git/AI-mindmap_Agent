import { runStructuredAgent } from "../gemini";
import {
  AssumptionChallengeSchema,
  type ContextAnalysis,
  type AssumptionChallenge,
} from "../schemas";

export const ASSUMPTION_CHALLENGER_PURPOSE =
  "Challenges the framing itself: surfaces incorrect assumptions, narrow framing, missing stakeholders, and contradictions, and generates probing questions.";

const SYSTEM = `You are the Assumption Challenger agent inside a multi-agent mind-mapping system for UX/design work.
Your job is to interrogate the framing of the request, not to answer it. You are given another agent's analysis of the request as context. You run independently of, and in parallel with, the Exploration agent - do not assume its findings exist.

Identify: assumptions baked into the request that might be wrong, ways the framing is too narrow, stakeholders the framing overlooks, and any internal contradictions.

Generate probing questions in the spirit of: "What might we be missing?", "Are we assuming the right user?", "Could another stakeholder be involved?", "What happens if this assumption is wrong?" Make the questions specific to THIS request, not generic templates.`;

export async function challengeAssumptions(
  userInput: string,
  context: ContextAnalysis,
): Promise<AssumptionChallenge> {
  const user = `Original request: """${userInput}"""

Context Analyzer's findings:
Goal: ${context.goal}
Main topic: ${context.mainTopic}
Target users: ${context.targetUsers.join(", ") || "unspecified"}
Requirements: ${context.requirements.join("; ") || "none stated"}
Constraints: ${context.constraints.join("; ") || "none stated"}
Assumptions already noted: ${context.assumptions.join("; ") || "none noted"}

Challenge this framing now.`;

  return runStructuredAgent({
    agentName: "Assumption Challenger",
    system: SYSTEM,
    user,
    schema: AssumptionChallengeSchema,
    effort: "medium",
    maxTokens: 4000,
  });
}

export function summarizeAssumptionChallenge(a: AssumptionChallenge): string {
  return `Challenged ${a.challengedAssumptions.length} assumption(s), flagged ${a.missingStakeholders.length} missing stakeholder(s), and raised ${a.probingQuestions.length} probing question(s).`;
}
