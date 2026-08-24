import { runStructuredAgent } from "../gemini";
import { ContextAnalysisSchema, type ContextAnalysis } from "../schemas";

export const CONTEXT_ANALYZER_PURPOSE =
  "Understands the request before anything is generated: extracts the goal, target users, requirements, constraints, and assumptions, and flags requests that are too broad to map yet.";

const SYSTEM = `You are the Context Analyzer agent inside a multi-agent mind-mapping system for UX/design work.
Your only job is to deeply understand a user's request BEFORE any mind map is generated. You do not generate the map yourself.

Extract: the underlying goal, the main topic, target users, requirements, constraints, assumptions implicit in how the request is phrased, missing information, and clarifying questions worth asking.

Vagueness gate: the bar is "names a concrete audience and/or a concrete goal/problem" - NOT "names a specific solution or technology". Set isVague=true only when the input is a bare topic/domain word with neither an audience nor a goal attached (e.g. just "Artificial Intelligence", "Design", "Technology", "Marketing"). Do NOT set isVague when the input names a concrete audience or a concrete goal, even without a named solution, platform, or extra detail - e.g. "AI healthcare app for elderly users" (audience: elderly users), "Plan a multi-generational family vacation" (audience: multiple generations of one family), and "Improve the university student experience" (audience: university students, goal: improve their experience) are ALL specific enough - do not flag any of these three as vague. When in doubt between flagging and not, prefer NOT flagging: a slightly-broad-but-answerable request should get a real mind map, not a clarification prompt.
If isVague is true, you may leave the other analytical fields minimal/best-effort since the pipeline stops there.`;

export async function analyzeContext(
  userInput: string,
  additionalContext: string,
): Promise<ContextAnalysis> {
  const user = `User's request: """${userInput}"""
${additionalContext ? `Additional context/requirements provided: """${additionalContext}"""` : "No additional context was provided."}`;

  return runStructuredAgent({
    agentName: "Context Analyzer",
    system: SYSTEM,
    user,
    schema: ContextAnalysisSchema,
    effort: "medium",
    maxTokens: 4000,
  });
}

export function summarizeContextAnalysis(c: ContextAnalysis): string {
  return `Goal: ${c.goal}. Users: ${c.targetUsers.slice(0, 3).join(", ") || "n/a"}. Found ${c.requirements.length} requirement(s), ${c.constraints.length} constraint(s), ${c.assumptions.length} assumption(s), and ${c.clarifyingQuestions.length} clarifying question(s).`;
}
