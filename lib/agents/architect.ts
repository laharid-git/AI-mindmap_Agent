import { runStructuredAgent } from "../gemini";
import {
  MindMapSchema,
  sanitizeMindMap,
  type ContextAnalysis,
  type ExplorationFindings,
  type AssumptionChallenge,
  type MindMap,
  type MindMapNode,
} from "../schemas";

export const ARCHITECT_PURPOSE =
  "Synthesizes the context analysis, exploration findings, and challenged assumptions into one coherent, non-generic hierarchical mind map.";

const SYSTEM = `You are the Mind-Map Architect agent inside a multi-agent mind-mapping system for UX/design work.
You synthesize the outputs of three other agents (Context Analyzer, Exploration & Alternatives, Assumption Challenger) into ONE coherent hierarchical mind map. You do not invent new research - you organize and structure what those agents already found, filling only small structural gaps needed for coherence.

Rules:
- The root node is the main topic, stated concretely (not just the raw user string).
- Group related ideas into meaningful branches (aim for 4-7 top-level branches). Do not create a branch for every single input item - cluster them.
- Actively fold in findings from Exploration (alternative directions, additional stakeholders, opportunities, edge cases, risks) and from the Assumption Challenger (missing stakeholders, blind spots) as real branches or sub-branches, not just an appendix. A generic map that ignores those agents' work is a failure.
- Remove duplication: if two findings are really the same idea, merge them into one node.
- Avoid generic filler nodes ("Other considerations", "Miscellaneous", "General benefits"). Every node should say something specific to this request.
- Each node needs a short label (2-6 words) and a one-sentence description. Give nodes stable lowercase-hyphen ids.
- Depth 2-3 levels below the root is usually right; go deeper only where it adds real information.`;

export async function synthesizeMindMap(
  userInput: string,
  context: ContextAnalysis,
  exploration: ExplorationFindings,
  challenge: AssumptionChallenge,
): Promise<MindMap> {
  const user = `Original request: """${userInput}"""

CONTEXT ANALYSIS
Goal: ${context.goal}
Main topic: ${context.mainTopic}
Target users: ${context.targetUsers.join(", ")}
Requirements: ${context.requirements.join("; ")}
Constraints: ${context.constraints.join("; ")}

EXPLORATION FINDINGS
Alternative perspectives: ${exploration.alternativePerspectives.join("; ")}
Additional stakeholders: ${exploration.additionalStakeholders.join("; ")}
Opportunities: ${exploration.opportunities.join("; ")}
Edge cases: ${exploration.edgeCases.join("; ")}
Risks: ${exploration.risks.join("; ")}
Missing branches a generic map would omit: ${exploration.missingBranches.join("; ")}
Alternative solution directions: ${exploration.alternativeDirections.join("; ")}
Research notes: ${exploration.researchNotes.join("; ") || "none"}

ASSUMPTIONS CHALLENGED
Challenged assumptions: ${challenge.challengedAssumptions.map((a) => `${a.assumption} (${a.whyItMightBeWrong})`).join("; ")}
Missing stakeholders: ${challenge.missingStakeholders.join("; ")}
Blind spots: ${challenge.blindSpots.join("; ")}

Build the mind map now.`;

  const mindMap = await runStructuredAgent({
    agentName: "Mind-Map Architect",
    system: SYSTEM,
    user,
    schema: MindMapSchema,
    effort: "high",
    maxTokens: 8000,
  });
  return sanitizeMindMap(mindMap);
}

export function summarizeMindMap(m: MindMap): string {
  const count = countNodes(m.root) - 1;
  return `Built "${m.root.label}" with ${m.root.children.length} top-level branch(es) and ${count} total sub-node(s).`;
}

function countNodes(n: MindMapNode): number {
  return 1 + n.children.reduce((sum, c) => sum + countNodes(c), 0);
}
