import { AgentError } from "../gemini";
import type { AgentTraceEntry, GenerateResponse, RefineRequestBody, RefineResponse } from "../schemas";
import {
  analyzeContext,
  CONTEXT_ANALYZER_PURPOSE,
  summarizeContextAnalysis,
} from "./contextAnalyzer";
import { explore, EXPLORATION_AGENT_PURPOSE, summarizeExploration } from "./exploration";
import {
  challengeAssumptions,
  ASSUMPTION_CHALLENGER_PURPOSE,
  summarizeAssumptionChallenge,
} from "./assumptionChallenger";
import { synthesizeMindMap, ARCHITECT_PURPOSE, summarizeMindMap } from "./architect";
import {
  critiqueMindMap,
  CRITIC_PURPOSE,
  summarizeCritique,
  refineMindMap,
  REFINEMENT_PURPOSE,
  summarizeRefinement,
} from "./critic";

/**
 * The Coordinator agent. Unlike the other five, it makes no LLM calls of its
 * own - its responsibility is purely to run the workflow: receive the
 * request, dispatch it to the right specialized agents in the right order
 * (including running Exploration and the Assumption Challenger in parallel),
 * collect their outputs, and hand everything to the next stage. Keeping it
 * as plain control flow (rather than another LLM call) is a deliberate
 * design choice - it has nothing to reason about that the other agents don't
 * already own.
 */
export async function runGenerationPipeline(
  userInput: string,
  additionalContext: string,
): Promise<GenerateResponse> {
  const trace: AgentTraceEntry[] = [
    {
      agent: "Coordinator",
      purpose:
        "Receives the request and manages the workflow, dispatching to each specialized agent in turn.",
      status: "success",
      summary: `Received request (${userInput.length} chars). Starting with Context Analyzer.`,
    },
  ];

  const contextStep = await runStep(
    trace,
    "Context Analyzer",
    CONTEXT_ANALYZER_PURPOSE,
    () => analyzeContext(userInput, additionalContext),
    summarizeContextAnalysis,
  );
  if (!contextStep.ok) return { status: "error", error: contextStep.error, trace };
  const contextAnalysis = contextStep.value;

  if (contextAnalysis.isVague) {
    trace.push({
      agent: "Coordinator",
      purpose: "Manages the workflow.",
      status: "success",
      summary:
        "Topic judged too broad to map meaningfully. Stopped the pipeline here and asked the user to narrow it, instead of generating a generic map.",
    });
    return {
      status: "vague",
      vagueMessage:
        contextAnalysis.vagueMessage ||
        "This topic is broad. Before creating a detailed map, what aspect would you like to explore?",
      suggestedDirections: contextAnalysis.suggestedDirections,
      trace,
    };
  }

  // Exploration and Assumption Challenger run independently/in parallel -
  // neither depends on the other's output, only on the Context Analyzer's.
  const explorationEntry = pendingEntry("Exploration & Alternatives", EXPLORATION_AGENT_PURPOSE);
  const challengerEntry = pendingEntry("Assumption Challenger", ASSUMPTION_CHALLENGER_PURPOSE);
  trace.push(explorationEntry, challengerEntry);

  const [explorationResult, challengeResult] = await Promise.allSettled([
    explore(userInput, contextAnalysis),
    challengeAssumptions(userInput, contextAnalysis),
  ]);

  if (explorationResult.status === "rejected") {
    const msg = messageOf(explorationResult.reason);
    finalizeEntry(explorationEntry, "error", msg);
    if (challengeResult.status === "fulfilled") {
      finalizeEntry(challengerEntry, "success", summarizeAssumptionChallenge(challengeResult.value));
    } else {
      finalizeEntry(challengerEntry, "error", messageOf(challengeResult.reason));
    }
    return { status: "error", error: msg, trace };
  }
  finalizeEntry(explorationEntry, "success", summarizeExploration(explorationResult.value));

  if (challengeResult.status === "rejected") {
    const msg = messageOf(challengeResult.reason);
    finalizeEntry(challengerEntry, "error", msg);
    return { status: "error", error: msg, trace };
  }
  finalizeEntry(challengerEntry, "success", summarizeAssumptionChallenge(challengeResult.value));

  const exploration = explorationResult.value;
  const assumptionChallenge = challengeResult.value;

  const architectStep = await runStep(
    trace,
    "Mind-Map Architect",
    ARCHITECT_PURPOSE,
    () => synthesizeMindMap(userInput, contextAnalysis, exploration, assumptionChallenge),
    summarizeMindMap,
  );
  if (!architectStep.ok) return { status: "error", error: architectStep.error, trace };
  const mindMap = architectStep.value;

  const criticStep = await runStep(
    trace,
    "Critic",
    CRITIC_PURPOSE,
    () => critiqueMindMap(userInput, contextAnalysis, exploration, assumptionChallenge, mindMap),
    summarizeCritique,
  );
  if (!criticStep.ok) return { status: "error", error: criticStep.error, trace };
  const critique = criticStep.value;

  trace.push({
    agent: "Coordinator",
    purpose: "Manages the workflow.",
    status: "success",
    summary: "All agents complete. Handing results to the human for review and feedback.",
  });

  return {
    status: "success",
    contextAnalysis,
    exploration,
    assumptionChallenge,
    mindMap,
    critique,
    trace,
  };
}

export async function runRefinementPipeline(body: RefineRequestBody): Promise<RefineResponse> {
  const trace: AgentTraceEntry[] = [
    {
      agent: "Coordinator",
      purpose: "Manages the workflow.",
      status: "success",
      summary: "Received human feedback. Dispatching to the Refinement agent.",
    },
  ];

  const step = await runStep(
    trace,
    "Refinement Agent",
    REFINEMENT_PURPOSE,
    () =>
      refineMindMap(
        body.originalInput,
        body.additionalContext,
        body.contextAnalysis,
        body.exploration,
        body.assumptionChallenge,
        body.previousMindMap,
        body.previousCritique,
        body.feedback,
      ),
    summarizeRefinement,
  );
  if (!step.ok) return { status: "error", error: step.error, trace };

  trace.push({
    agent: "Coordinator",
    purpose: "Manages the workflow.",
    status: "success",
    summary: "Refined mind map ready for the human to review.",
  });

  return { status: "success", mindMap: step.value.mindMap, changesSummary: step.value.changesSummary, trace };
}

// ---- helpers ----

type StepResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function runStep<T>(
  trace: AgentTraceEntry[],
  agent: string,
  purpose: string,
  fn: () => Promise<T>,
  summarize: (result: T) => string,
): Promise<StepResult<T>> {
  const entry = pendingEntry(agent, purpose);
  trace.push(entry);
  try {
    const result = await fn();
    finalizeEntry(entry, "success", summarize(result));
    return { ok: true, value: result };
  } catch (err) {
    const msg = messageOf(err);
    finalizeEntry(entry, "error", msg);
    return { ok: false, error: msg };
  }
}

function pendingEntry(agent: string, purpose: string): AgentTraceEntry {
  return { agent, purpose, status: "running", summary: "" };
}

function finalizeEntry(entry: AgentTraceEntry, status: "success" | "error", summary: string) {
  entry.status = status;
  entry.summary = summary;
}

function messageOf(err: unknown): string {
  if (err instanceof AgentError) return err.message;
  return "This agent failed unexpectedly. Please try again.";
}
