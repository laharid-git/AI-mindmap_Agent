import { z } from "zod/v4";

/**
 * Shared types/schemas passed between agents. Every agent's LLM output is
 * validated against one of these schemas so downstream agents can consume it
 * without re-parsing free text.
 */

// ---------- Mind map ----------

// Recursive node type. Zod needs an explicit type + z.lazy() for recursion.
export interface MindMapNode {
  id: string;
  label: string;
  description?: string;
  children: MindMapNode[];
}

export const MindMapNodeSchema: z.ZodType<MindMapNode> = z.lazy(() =>
  z.object({
    id: z.string().describe("short stable slug, e.g. 'accessibility'"),
    label: z.string().describe("short branch label, 2-6 words"),
    description: z
      .string()
      .optional()
      .describe("one sentence explaining this node"),
    children: z.array(MindMapNodeSchema).default([]),
  }),
);

export const MindMapSchema = z.object({
  root: MindMapNodeSchema,
});
export type MindMap = z.infer<typeof MindMapSchema>;

/**
 * Gemini's schema-constrained generation occasionally leaks a stray
 * `.id`/`.label`/`.children` fragment onto the end of a label or
 * description when closing one recursive MindMapNode and opening the next
 * sibling in the same `children` array (observed live, consistently on the
 * second-to-last... see README/WEEK1_TEST_RESULTS for the reproduction).
 * The JSON itself is valid and passes schema validation - this is stray
 * text *inside* a string value, not a parse error - so it has to be cleaned
 * up after the fact rather than rejected.
 */
const TRAILING_SCHEMA_KEY_ARTIFACT = /(?:\.(?:id|label|description|children))+$/;

function cleanText(text: string): string {
  return text.replace(TRAILING_SCHEMA_KEY_ARTIFACT, "").trimEnd();
}

export function sanitizeMindMap(map: MindMap): MindMap {
  return { root: sanitizeNode(map.root) };
}

function sanitizeNode(node: MindMapNode): MindMapNode {
  return {
    ...node,
    label: cleanText(node.label),
    description: node.description ? cleanText(node.description) : node.description,
    children: node.children.map(sanitizeNode),
  };
}

// ---------- Agent 2: Context Analyzer ----------

export const ContextAnalysisSchema = z.object({
  isVague: z
    .boolean()
    .describe(
      "true if the input is too broad/generic to produce a meaningful map (e.g. a single word like 'Artificial Intelligence') and needs the user to narrow it first",
    ),
  vagueMessage: z
    .string()
    .optional()
    .describe("short friendly message explaining why it's too broad, only set if isVague"),
  suggestedDirections: z
    .array(z.string())
    .default([])
    .describe("3-6 concrete narrower directions the user could pick instead, only set if isVague"),
  goal: z.string().describe("the underlying goal of the request, one sentence"),
  mainTopic: z.string().describe("concise restatement of the main topic"),
  targetUsers: z.array(z.string()).describe("who this is for"),
  requirements: z.array(z.string()).describe("explicit or strongly implied requirements"),
  constraints: z.array(z.string()).describe("limitations, e.g. platform, budget, accessibility"),
  assumptions: z.array(z.string()).describe("assumptions implicit in the request as phrased"),
  missingInformation: z.array(z.string()).describe("information that would help but wasn't given"),
  clarifyingQuestions: z.array(z.string()).describe("questions worth asking the user"),
});
export type ContextAnalysis = z.infer<typeof ContextAnalysisSchema>;

// ---------- Agent 3: Exploration & Alternatives ----------

export const ExplorationPerspectiveSchema = z.object({
  lens: z
    .string()
    .describe(
      "short name for this distinct vantage point, e.g. 'End-user & accessibility', 'Stakeholder & business', 'Risk & ethics/governance'",
    ),
  findings: z
    .array(z.string())
    .describe("2-4 concrete findings genuinely specific to this lens, not restated from another lens"),
});
export type ExplorationPerspective = z.infer<typeof ExplorationPerspectiveSchema>;

export const ExplorationFindingsSchema = z.object({
  alternativePerspectives: z
    .array(z.string())
    .describe("other ways to frame the problem beyond the obvious one"),
  additionalStakeholders: z.array(z.string()).describe("people/roles beyond the stated primary user"),
  opportunities: z.array(z.string()).describe("underexplored opportunities"),
  edgeCases: z.array(z.string()).describe("edge cases and unusual situations"),
  risks: z.array(z.string()).describe("risks or failure modes"),
  missingBranches: z.array(z.string()).describe("topic branches a generic map would likely omit"),
  alternativeDirections: z
    .array(z.string())
    .describe("answers to 'are these the only options?' - alternative solution directions"),
  researchNotes: z
    .array(z.string())
    .default([])
    .describe("short factual notes surfaced from research, each written as a plain sentence"),
  sourcesUsed: z
    .array(z.string())
    .default([])
    .describe("titles or URLs of sources consulted, if web search was used; empty if not"),
  perspectives: z
    .array(ExplorationPerspectiveSchema)
    .min(2)
    .max(4)
    .describe(
      "the SAME exploration findings above, additionally organized under 2-4 explicitly distinct named vantage points, so a human reader can see multiple genuine perspectives at a glance",
    ),
  usedWebSearch: z
    .boolean()
    .default(false)
    .describe("true if this exploration was grounded in live web search results, false if it relied on the model's own knowledge because search was unavailable"),
});
export type ExplorationFindings = z.infer<typeof ExplorationFindingsSchema>;

// ---------- Agent 4: Assumption Challenger ----------

export const AssumptionChallengeSchema = z.object({
  challengedAssumptions: z
    .array(
      z.object({
        assumption: z.string(),
        whyItMightBeWrong: z.string(),
      }),
    )
    .describe("assumptions in the framing, and why each might not hold"),
  probingQuestions: z
    .array(z.string())
    .describe("probing questions like 'are we assuming the right user?'"),
  missingStakeholders: z.array(z.string()).describe("stakeholders the framing overlooks"),
  blindSpots: z.array(z.string()).describe("blind spots in the current framing"),
  contradictions: z.array(z.string()).describe("internal contradictions or tensions, if any"),
});
export type AssumptionChallenge = z.infer<typeof AssumptionChallengeSchema>;

// ---------- Agent 6: Critic ----------

export const CritiqueSchema = z.object({
  strengths: z.array(z.string()).describe("what the mind map does well"),
  gaps: z.array(z.string()).describe("missing coverage compared to context/exploration/challenges"),
  weakBranches: z.array(z.string()).describe("branches that are too generic, thin, or filler"),
  duplicates: z.array(z.string()).describe("redundant or overlapping branches found"),
  recommendedChanges: z.array(z.string()).describe("concrete recommended changes"),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const RefinementResultSchema = z.object({
  mindMap: MindMapSchema,
  changesSummary: z
    .array(z.string())
    .describe("concrete list of what changed vs. the previous map, driven by the user's feedback"),
});
export type RefinementResult = z.infer<typeof RefinementResultSchema>;

// ---------- Agent transparency ----------

export type AgentStatus = "pending" | "running" | "success" | "error";

export interface AgentTraceEntry {
  agent: string;
  purpose: string;
  status: AgentStatus;
  summary: string;
}

// ---------- Full pipeline payloads ----------

export interface GenerateVague {
  status: "vague";
  vagueMessage: string;
  suggestedDirections: string[];
  trace: AgentTraceEntry[];
}

export interface GenerateSuccess {
  status: "success";
  contextAnalysis: ContextAnalysis;
  exploration: ExplorationFindings;
  assumptionChallenge: AssumptionChallenge;
  mindMap: MindMap;
  critique: Critique;
  trace: AgentTraceEntry[];
}

export interface GenerateError {
  status: "error";
  error: string;
  trace: AgentTraceEntry[];
}

export type GenerateResponse = GenerateVague | GenerateSuccess | GenerateError;

export const RefineRequestBodySchema = z.object({
  originalInput: z.string().min(1).max(2000),
  additionalContext: z.string().max(2000).default(""),
  contextAnalysis: ContextAnalysisSchema,
  exploration: ExplorationFindingsSchema,
  assumptionChallenge: AssumptionChallengeSchema,
  previousMindMap: MindMapSchema,
  previousCritique: CritiqueSchema,
  feedback: z.string().min(1).max(2000),
});
export type RefineRequestBody = z.infer<typeof RefineRequestBodySchema>;

export interface RefineSuccess {
  status: "success";
  mindMap: MindMap;
  changesSummary: string[];
  /**
   * The map is re-reviewed by the Critic agent immediately after refinement,
   * so the human always sees an up-to-date assessment of the CURRENT map,
   * not a stale pre-refinement critique. Subsequent refine requests must
   * send this critique back as `previousCritique`, not the original one.
   */
  critique: Critique;
  trace: AgentTraceEntry[];
}

export interface RefineError {
  status: "error";
  error: string;
  trace: AgentTraceEntry[];
}

export type RefineResponse = RefineSuccess | RefineError;
