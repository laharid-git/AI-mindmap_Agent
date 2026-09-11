import { runExplorationAgent } from "../gemini";
import {
  ExplorationFindingsSchema,
  type ContextAnalysis,
  type ExplorationFindings,
} from "../schemas";

export const EXPLORATION_AGENT_PURPOSE =
  "Goes beyond the obvious: asks 'are these the only options?', researches alternative perspectives, additional stakeholders, opportunities, edge cases, and risks a generic map would miss.";

const RESEARCH_SYSTEM = `You are the research phase of the Exploration & Alternatives agent inside a multi-agent mind-mapping system for UX/design work.
Your job is to go beyond the obvious, generic categories a single-shot AI answer would produce. You are given another agent's analysis of the user's request as context.

Explicitly ask yourself: "Are these the only options?" Consider alternative perspectives, additional stakeholders beyond the stated primary user, underexplored opportunities, edge cases, risks, topic branches a generic map would omit, and alternative solution directions entirely.

You have Google Search available. Use it when the topic would benefit from current, real-world grounding - e.g. domain-specific best practices, known pitfalls, or terminology you're unsure about. Skip it if the topic is purely conceptual/internal and search would not add anything.

Write your findings as free-text research notes (not JSON yet) - a structuring step will convert them afterward. Be concrete and specific, not generic filler like "consider user needs".`;

const STRUCTURE_SYSTEM = `You are the structuring phase of the Exploration & Alternatives agent inside a multi-agent mind-mapping system for UX/design work.
You are given the original request, another agent's context analysis, and research notes gathered in a prior research step (which may be empty if web search wasn't needed).

Convert those into the required structured fields: alternative perspectives, additional stakeholders, opportunities, edge cases, risks, missing branches a generic map would omit, alternative solution directions, and short research notes. Keep each list item short (one sentence, concrete). If research notes were provided, list the sources they came from in sourcesUsed (titles or URLs); otherwise leave sourcesUsed empty.

Additionally, organize your OWN findings above into "perspectives": 2-4 explicitly named, genuinely distinct vantage points on this same request (e.g. "End-user & accessibility", "Stakeholder & business", "Risk & ethics/governance", "Technical & operational" - pick whichever 2-4 lenses are actually relevant to THIS request, don't force irrelevant ones). Each lens's findings must say something a reader wouldn't already get from a different lens - if two lenses would produce near-identical points, merge them into one lens instead of padding the count. This is not new research - it's the same material above, re-organized so a human reader can see multiple genuine perspectives at a glance instead of one blended list.`;

export async function explore(
  userInput: string,
  context: ContextAnalysis,
): Promise<ExplorationFindings> {
  const user = `Original request: """${userInput}"""

Context Analyzer's findings:
Goal: ${context.goal}
Main topic: ${context.mainTopic}
Target users: ${context.targetUsers.join(", ") || "unspecified"}
Requirements: ${context.requirements.join("; ") || "none stated"}
Constraints: ${context.constraints.join("; ") || "none stated"}
Assumptions in the framing: ${context.assumptions.join("; ") || "none noted"}

Explore beyond this framing now.`;

  const { result, usedWebSearch, sources } = await runExplorationAgent({
    agentName: "Exploration Agent",
    researchSystem: RESEARCH_SYSTEM,
    structureSystem: STRUCTURE_SYSTEM,
    user,
    schema: ExplorationFindingsSchema,
    maxTokens: 6000,
  });

  // Ground truth for whether search actually ran comes from the grounding
  // metadata computed in lib/gemini.ts, not the model's own self-report -
  // it can't be wrong about whether the tool call succeeded.
  return {
    ...result,
    usedWebSearch,
    // If the model didn't list its own sources, fall back to what the
    // search grounding metadata actually reported.
    sourcesUsed: result.sourcesUsed.length === 0 && sources.length > 0 ? sources : result.sourcesUsed,
  };
}

export function summarizeExploration(e: ExplorationFindings): string {
  const searched = e.usedWebSearch
    ? ` Grounded in live web search (${e.sourcesUsed.length} source(s)).`
    : " Based on the model's own knowledge (web search was unavailable this run).";
  return `Surfaced ${e.additionalStakeholders.length} additional stakeholder(s), ${e.alternativeDirections.length} alternative direction(s), and ${e.risks.length} risk(s) across ${e.perspectives.length} distinct perspectives.${searched}`;
}
