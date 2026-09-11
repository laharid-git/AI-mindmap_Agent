"use client";

import { useState } from "react";
import MindMapView from "@/components/MindMapView";
import AgentTrace from "@/components/AgentTrace";
import Section, { ListBlock } from "@/components/Section";
import type {
  AgentTraceEntry,
  AssumptionChallenge,
  ContextAnalysis,
  Critique,
  ExplorationFindings,
  GenerateResponse,
  MindMap,
  RefineResponse,
} from "@/lib/schemas";

type Phase = "input" | "loading" | "vague" | "results" | "refining";

interface Example {
  label: string;
  input: string;
  hint?: string;
  suggestedFeedback?: string;
}

const EXAMPLES: Example[] = [
  {
    label: "AI healthcare app for elderly users",
    input: "Design an AI-powered healthcare application for elderly users.",
  },
  {
    label: "Multi-generational family vacation planning",
    input:
      "Plan a multi-generational family vacation that works well for grandparents, parents, and young children.",
  },
  {
    label: "Improving the university student experience",
    input: "Improve the university student experience, from orientation through graduation.",
  },
  {
    label: "Artificial Intelligence",
    input: "Artificial Intelligence",
    hint: "Intentionally vague - shows how the agent asks you to narrow it down instead of guessing.",
  },
  {
    label: "User feedback / refinement test",
    input: "Design an AI-powered healthcare application for elderly users.",
    hint: "Generates the healthcare map, then pre-fills feedback below so you can test the refinement loop immediately.",
    suggestedFeedback: "Focus more on caregivers and accessibility.",
  },
];

export default function Home() {
  const [input, setInput] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [trace, setTrace] = useState<AgentTraceEntry[]>([]);

  const [vague, setVague] = useState<{ message: string; directions: string[] } | null>(null);

  const [contextAnalysis, setContextAnalysis] = useState<ContextAnalysis | null>(null);
  const [exploration, setExploration] = useState<ExplorationFindings | null>(null);
  const [assumptionChallenge, setAssumptionChallenge] = useState<AssumptionChallenge | null>(null);
  const [mindMap, setMindMap] = useState<MindMap | null>(null);
  const [critique, setCritique] = useState<Critique | null>(null);

  const [feedback, setFeedback] = useState("");
  const [changesSummary, setChangesSummary] = useState<string[] | null>(null);
  const [refineError, setRefineError] = useState("");
  const [refineCount, setRefineCount] = useState(0);
  const [finished, setFinished] = useState(false);

  function applyExample(ex: Example) {
    setInput(ex.input);
    setAdditionalContext("");
    if (ex.suggestedFeedback) setFeedback(ex.suggestedFeedback);
  }

  /** Populates the (still-editable) feedback box from a Critic recommendation. */
  function applyRecommendation(text: string) {
    setFeedback(text);
    setFinished(false);
  }

  function resetResultState() {
    setVague(null);
    setContextAnalysis(null);
    setExploration(null);
    setAssumptionChallenge(null);
    setMindMap(null);
    setCritique(null);
    setChangesSummary(null);
    setRefineError("");
    setRefineCount(0);
    setFinished(false);
  }

  async function handleGenerate() {
    if (!input.trim() || phase === "loading") return;
    resetResultState();
    setErrorMsg("");
    setTrace([]);
    setPhase("loading");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, additionalContext }),
      });
      const data: GenerateResponse = await res.json();
      setTrace(data.trace);

      if (data.status === "error") {
        setErrorMsg(data.error);
        setPhase("input");
        return;
      }
      if (data.status === "vague") {
        setVague({ message: data.vagueMessage, directions: data.suggestedDirections });
        setPhase("vague");
        return;
      }
      setContextAnalysis(data.contextAnalysis);
      setExploration(data.exploration);
      setAssumptionChallenge(data.assumptionChallenge);
      setMindMap(data.mindMap);
      setCritique(data.critique);
      setPhase("results");
    } catch {
      setErrorMsg("Couldn't reach the server. Check your connection and try again.");
      setPhase("input");
    }
  }

  async function handleRefine() {
    if (!feedback.trim() || !mindMap || !contextAnalysis || !exploration || !assumptionChallenge || !critique) return;
    setPhase("refining");
    setRefineError("");
    setFinished(false);

    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalInput: input,
          additionalContext,
          contextAnalysis,
          exploration,
          assumptionChallenge,
          previousMindMap: mindMap,
          // Always the MOST RECENT critique (from the last generate or
          // refine response), never the original Week 1 one - `critique`
          // state is updated below on every successful refine, so a third
          // round of feedback reviews against the second critique, and so on.
          previousCritique: critique,
          feedback,
        }),
      });
      const data: RefineResponse = await res.json();
      setTrace((prev) => [...prev, ...data.trace]);

      if (data.status === "error") {
        setRefineError(data.error);
        setPhase("results");
        return;
      }
      setMindMap(data.mindMap);
      setChangesSummary(data.changesSummary);
      setCritique(data.critique);
      setRefineCount((n) => n + 1);
      setFeedback("");
      setPhase("results");
    } catch {
      setRefineError("Couldn't reach the server. Check your connection and try again.");
      setPhase("results");
    }
  }

  const isBusy = phase === "loading" || phase === "refining";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          AI Mind-Map Agent
        </h1>
        <p className="mt-2 text-base text-brand-600 dark:text-brand-400">
          Explore <span className="text-slate-400">•</span> Challenge{" "}
          <span className="text-slate-400">•</span> Critique <span className="text-slate-400">•</span> Refine
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500 dark:text-slate-400">
          A multi-agent AI system for UX/design work: six specialized agents research alternatives,
          challenge assumptions, and iteratively refine a mind map with you - instead of generating a
          generic map in one shot.
        </p>
      </header>

      <Section title="What would you like to explore?">
        <div className="flex flex-col gap-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Design an AI-powered healthcare application for elderly users."
            rows={3}
            maxLength={2000}
            disabled={isBusy}
            className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-ink-800 dark:text-white"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Additional context or requirements <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="e.g. must work on low-end Android phones, budget-constrained, must be WCAG AA accessible"
              rows={2}
              maxLength={2000}
              disabled={isBusy}
              className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-ink-800 dark:text-white"
            />
          </div>

          {errorMsg && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {errorMsg}
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={isBusy || !input.trim()}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "loading" ? <Spinner /> : null}
            {phase === "loading" ? "Running the agents…" : "Create Mind Map"}
          </button>

          {phase === "loading" && <PipelineProgress />}

          <div className="mt-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Test Examples</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  disabled={isBusy}
                  title={ex.hint}
                  onClick={() => applyExample(ex)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 dark:border-slate-700 dark:bg-ink-800 dark:text-slate-300 dark:hover:text-brand-300"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {phase === "vague" && vague && (
        <Section title="Let's narrow this down first" icon="🔎">
          <p className="text-sm text-slate-700 dark:text-slate-300">{vague.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {vague.directions.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setInput(d);
                  setPhase("input");
                }}
                className="rounded-full border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-200"
              >
                {d}
              </button>
            ))}
          </div>
        </Section>
      )}

      {mindMap && contextAnalysis && exploration && assumptionChallenge && critique && (
        <>
          <Section title="Mind Map" subtitle="Root topic in blue; click a branch to expand or collapse it." icon="🧠">
            {changesSummary && changesSummary.length > 0 && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Reported changes from Refinement Agent
                </p>
                <p className="mb-2 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                  What the AI says it changed, in its own words — not independently verified. See the Critic
                  review below for an independent check of the map that actually resulted.
                </p>
                <ul className="flex flex-col gap-0.5">
                  {changesSummary.map((c, i) => (
                    <li key={i} className="text-sm text-emerald-800 dark:text-emerald-200">
                      • {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <MindMapView root={mindMap.root} />
          </Section>

          <Section
            title="Exploration"
            subtitle="Alternative perspectives and options discovered beyond the obvious framing."
            icon="🧭"
          >
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {exploration.usedWebSearch ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  🔍 Grounded in live web search
                  {exploration.sourcesUsed.length > 0 ? ` (${exploration.sourcesUsed.length} source(s))` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-ink-800 dark:text-slate-300">
                  🧠 Based on the model&apos;s own knowledge — live search was unavailable this run
                </span>
              )}
            </div>

            {exploration.perspectives.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Perspectives considered
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {exploration.perspectives.map((p, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900 dark:bg-brand-950/20"
                    >
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                        {p.lens}
                      </p>
                      <ul className="flex flex-col gap-1">
                        {p.findings.map((f, j) => (
                          <li key={j} className="text-sm text-slate-600 dark:text-slate-300">
                            • {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <ListBlock heading="Alternative perspectives" items={exploration.alternativePerspectives} />
              <ListBlock heading="Additional stakeholders" items={exploration.additionalStakeholders} />
              <ListBlock heading="Opportunities" items={exploration.opportunities} tone="positive" />
              <ListBlock heading="Edge cases" items={exploration.edgeCases} tone="warning" />
              <ListBlock heading="Risks" items={exploration.risks} tone="danger" />
              <ListBlock heading="Alternative solution directions" items={exploration.alternativeDirections} />
            </div>
            {exploration.sourcesUsed.length > 0 && (
              <p className="mt-4 text-xs text-slate-400">
                Web research consulted: {exploration.sourcesUsed.join(", ")}
              </p>
            )}
          </Section>

          <Section title="Assumptions Challenged" subtitle="Probing questions about the framing itself." icon="❓">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Challenged assumptions
                </h3>
                {assumptionChallenge.challengedAssumptions.length === 0 ? (
                  <p className="text-sm italic text-slate-400">None identified.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {assumptionChallenge.challengedAssumptions.map((a, i) => (
                      <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-ink-800">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{a.assumption}</span>
                        <span className="block text-slate-500 dark:text-slate-400">{a.whyItMightBeWrong}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ListBlock heading="Probing questions" items={assumptionChallenge.probingQuestions} />
              <ListBlock heading="Missing stakeholders" items={assumptionChallenge.missingStakeholders} tone="warning" />
              <ListBlock heading="Blind spots" items={assumptionChallenge.blindSpots} tone="danger" />
              <ListBlock heading="Contradictions" items={assumptionChallenge.contradictions} />
            </div>
          </Section>

          <Section
            title={refineCount > 0 ? "Post-refinement Critic review" : "Critique"}
            subtitle={
              refineCount > 0
                ? "An independent review of the map that actually resulted from your last refinement — re-examined from scratch by the Critic agent, not based on the Refinement Agent's own report above."
                : "How the map holds up against the original problem."
            }
            icon="🔬"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <ListBlock heading="Strengths" items={critique.strengths} tone="positive" />
              <ListBlock heading="Gaps" items={critique.gaps} tone="danger" />
              <ListBlock heading="Weak branches" items={critique.weakBranches} tone="warning" />
              <ListBlock heading="Duplicate content" items={critique.duplicates} tone="warning" />
              <div className="sm:col-span-2">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Recommended changes
                </h3>
                {critique.recommendedChanges.length === 0 ? (
                  <p className="text-sm italic text-slate-400">None identified.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {critique.recommendedChanges.map((rec, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={isBusy}
                        onClick={() => applyRecommendation(rec)}
                        title="Click to use this as your refinement feedback (you can edit it first)"
                        className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm text-slate-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50 dark:border-slate-700 dark:bg-ink-800 dark:text-slate-300 dark:hover:border-brand-700 dark:hover:bg-brand-950/30 dark:hover:text-brand-200"
                      >
                        <span className="mt-0.5 flex-none text-current/50">✍️</span>
                        <span>{rec}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {finished ? (
            <Section title="Refine with Your Feedback" icon="✍️">
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  You marked this map as finished. Nice work! You can still refine it further if you change
                  your mind.
                </p>
                <button
                  type="button"
                  onClick={() => setFinished(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Refine anyway
                </button>
              </div>
            </Section>
          ) : (
          <Section title="Refine with Your Feedback" icon="✍️">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                What should the AI add, remove, challenge, or explore further?
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder='e.g. "Focus more on elderly users." · "Add caregivers." · "Remove business-related branches." · "Explore accessibility further."'
                rows={3}
                maxLength={2000}
                disabled={isBusy}
                className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-ink-800 dark:text-white"
              />
              {refineError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {refineError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleRefine}
                  disabled={isBusy || !feedback.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "refining" ? <Spinner /> : null}
                  {phase === "refining" ? "Refining…" : "Refine Mind Map"}
                </button>
                <span className="text-xs text-slate-400">or</span>
                <button
                  type="button"
                  onClick={() => setFinished(true)}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                >
                  ✓ I&apos;m happy with this map — Finish
                </button>
              </div>
            </div>
          </Section>
          )}

          <AgentTrace trace={trace} />
        </>
      )}
    </main>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

const PIPELINE_STEPS = [
  "Coordinator",
  "Context Analyzer",
  "Exploration + Assumption Challenger (parallel)",
  "Mind-Map Architect",
  "Critic",
];

function PipelineProgress() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-ink-800 dark:text-slate-400">
      <p className="mb-1.5 font-medium text-slate-600 dark:text-slate-300">
        Running the agent pipeline (usually 30–90 seconds)…
      </p>
      <ol className="flex flex-wrap gap-x-1.5 gap-y-1">
        {PIPELINE_STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span>{s}</span>
            {i < PIPELINE_STEPS.length - 1 && <span className="text-slate-300 dark:text-slate-600">→</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
