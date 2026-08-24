# AI Mind-Map Agent

**Explore • Challenge • Critique • Refine**

A Week 1 prototype for a Master's in Design course on *Designing UX with AI and Continuous Adaptation*.

## Project overview

This is **not** a one-shot "topic → mind map" generator. It's a small, justified multi-agent system: six
specialized agents collaborate — researching alternatives, challenging assumptions, synthesizing,
critiquing, and refining based on human feedback — to produce a mind map that goes beyond what a single
LLM call would produce.

## Problem statement

> Design an AI agent that creates mind maps from a given context or requirement, and goes beyond generic
> structures by researching alternatives and asking probing questions such as "Are these the only options?"
> and "What might we be missing?" to deepen coverage; it should incorporate learnings from the first course,
> challenge assumptions, and iteratively refine the map based on responses.

## Target users

UX/UI designers, design students, researchers, and product designers.

## Primary task

The user provides a topic, problem, or requirement and receives a mind map that has been expanded,
challenged, critiqued, and refined — rather than simply generated in one step.

---

## Why multi-agent?

> A single LLM call can produce a basic mind map. This problem specifically requires **exploration**,
> **assumption-challenging**, **synthesis**, **critique**, and **iterative refinement** — five distinct
> reasoning responsibilities that pull in different directions (e.g. "explore broadly" vs. "cut duplication"
> conflict if done by the same pass). Separating them into specialized agents, each with a narrow prompt and
> a single job, produces a materially better and more defensible result than asking one prompt to do
> everything at once. The goal is not to maximize the number of agents — it's to use only the agents that
> provide meaningful value to the problem. Six is the minimum that covers each distinct responsibility.

### Alternatives considered

- **Single prompt, one LLM call.** Rejected — a single pass has to simultaneously diverge (explore
  alternatives) and converge (cut duplication, organize hierarchy), which are opposing objectives; in
  practice this produces shallow, generic maps because the model settles for the most obvious framing.
- **One generic "reasoning" agent looped N times.** Rejected — without distinct roles/prompts, repeated
  passes tend to reinforce the same framing rather than genuinely challenging it; there's no mechanism
  forcing the model to argue against its own first answer.
- **An agent per mind-map branch (many small agents).** Rejected — this multiplies API calls and cost
  without adding a distinct *responsibility*; a single Architect agent synthesizing everything at once
  produces a more coherent hierarchy than merging N independently-generated fragments.
- **Six agents, one responsibility each (chosen).** Matches the distinct reasoning steps the problem
  statement itself calls for: understand → explore → challenge → synthesize → critique → refine.

## The six agents

| # | Agent | Responsibility | LLM call? |
|---|-------|-----------------|-----------|
| 1 | **Coordinator** | Runs the workflow: receives the request, dispatches to each agent in the right order (including running two agents in parallel), collects outputs, hands off to synthesis. | No — pure control flow. This is a deliberate design choice: it has nothing to reason about that the other agents don't already own, so it doesn't need a model call. |
| 2 | **Context Analyzer** | Understands the request first: goal, main topic, target users, requirements, constraints, assumptions, missing info, clarifying questions. Also flags requests that are too vague to map yet. | Yes |
| 3 | **Exploration & Alternatives** | Asks "are these the only options?" — alternative perspectives, additional stakeholders, opportunities, edge cases, risks, missing branches. Uses live Google Search grounding when it would help ground the answer. | Yes (+ optional Google Search tool) |
| 4 | **Assumption Challenger** | Interrogates the framing itself: which assumptions might be wrong, which stakeholders are missing, what blind spots exist. Generates probing questions ("What might we be missing?"). Runs **in parallel** with Exploration — neither depends on the other. | Yes |
| 5 | **Mind-Map Architect** | Synthesizes the outputs of 2–4 into one coherent hierarchical mind map: groups ideas, removes duplication, avoids generic filler. | Yes |
| 6 | **Critic & Refinement** | First reviews the map (gaps, weak/duplicate branches, recommended changes) against the original problem and the other agents' findings. Later, after a human gives feedback, refines the map to visibly incorporate it. | Yes (two prompts, one role) |

## Architecture flow

```
USER
 │
 ▼
COORDINATOR
 │
 ▼
CONTEXT ANALYZER ── (vague topic? stop here, ask user to narrow) ──▶ USER
 │
 ├────────────────────┬────────────────────┐
 ▼                     ▼                    (run in parallel)
EXPLORATION      ASSUMPTION CHALLENGER
 │                     │
 └──────────┬──────────┘
            ▼
    MIND-MAP ARCHITECT
            ▼
          CRITIC
            ▼
       USER REVIEW  ◀── mind map, exploration, assumptions, critique all shown
            ▼
      USER FEEDBACK  (free text: "focus more on X", "add Y", "remove Z", ...)
            ▼
       REFINEMENT
            ▼
     REFINED MIND MAP
```

`POST /api/generate` runs Coordinator → Context Analyzer → (Exploration ∥ Assumption Challenger) →
Architect → Critic in one request and returns every agent's structured output plus a step-by-step trace.
`POST /api/refine` runs Coordinator → Refinement with the full prior state + the human's feedback, and
returns the updated map plus what changed.

## Agent responsibilities & hand-offs

Every agent's output is validated against a **Zod schema** (`lib/schemas.ts`) before being handed to the
next agent — nothing is passed downstream as loose text:

- **Context Analyzer** takes the raw user input → outputs `ContextAnalysis` (goal, users, requirements,
  constraints, assumptions, vagueness flag).
- **Exploration** and **Assumption Challenger** each take the `ContextAnalysis` → output `ExplorationFindings`
  and `AssumptionChallenge` respectively. They run independently (`Promise.allSettled`, not sequential).
- **Mind-Map Architect** takes all three prior outputs → outputs the hierarchical `MindMap`.
- **Critic** takes the `MindMap` plus all three prior outputs → outputs a `Critique` (strengths, gaps, weak
  branches, duplicates, recommended changes).
- **Refinement** (same agent role as Critic, second prompt) takes the current `MindMap`, the `Critique`, all
  three prior outputs, and the human's free-text feedback → outputs a revised `MindMap` plus a concrete
  `changesSummary` of what it changed.

This keeps each agent's prompt narrow and makes the hand-offs inspectable (see "How the AI Agents Worked"
in the UI, which shows each agent's purpose, status, and a plain-language summary of its output — never
raw chain-of-thought).

## Human-in-the-loop

After the Coordinator finishes the first pass, the UI shows the mind map, the exploration findings, the
challenged assumptions, and the critique together, then asks: *"What would you like to change, add, remove,
or explore further?"* The user's free-text answer is the only input to the Refinement step — nothing is
auto-refined without it, and the refined map is shown with an explicit "what changed" list so the user can
verify their feedback actually took effect.

## Technology stack

- **Next.js 15** (App Router, TypeScript) — single deployable app, API routes double as the agent backend
- **Google Gemini API** (`gemini-3.5-flash-lite`) via `@google/genai`, using native structured JSON output
  (`responseJsonSchema` generated from the same Zod schemas via `zod/v4`'s `toJSONSchema`) for all six
  agent calls, and the hosted `googleSearch` grounding tool for the Exploration agent's research phase
  (with a graceful fallback to the model's own knowledge if search grounding is unavailable - see
  Known limitations). Model choice was based on live testing, not assumption - see
  [WEEK1_TEST_RESULTS.md](WEEK1_TEST_RESULTS.md).
- **Tailwind CSS** for styling
- No database — this is a single-session, stateless Week 1 prototype (state lives in the browser tab)

---

## Setup instructions

### 1. Prerequisites

- Node.js 20+ and npm
- A free Gemini API key from **[Google AI Studio](https://aistudio.google.com/apikey)** — no billing
  required for the free tier this app uses

### 2. Install

```bash
npm install
```

### 3. Configure your API key

```bash
cp .env.example .env.local
```

Edit `.env.local` and set:

```
GEMINI_API_KEY=your-real-key
```

`.env.local` is git-ignored — the key never gets committed. The key is only read server-side
(`lib/gemini.ts`); it is never sent to the browser.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

### 5. Build for production (optional local check)

```bash
npm run build && npm run start
```

---

## How to test

1. Open the app and click a **Test Example** chip, or type your own request, e.g.
   *"Design an AI-powered healthcare application for elderly users."*
2. Click **Create Mind Map** and wait (usually 20–60 seconds — six Gemini calls run in sequence/parallel).
3. Review the five result sections: **Mind Map**, **Exploration**, **Assumptions Challenged**, **Critique**,
   and **Refine with Your Feedback**. Expand **"How the AI Agents Worked"** to see each agent's status and
   a summary of what it produced.
4. In the feedback box, type something like *"Focus more on caregivers and accessibility."* and click
   **Refine Mind Map**. The map updates and a green banner lists exactly what changed.
5. Try the **"Artificial Intelligence"** example to see the vagueness gate: the system asks you to narrow
   the topic instead of generating a generic map.
6. The **"User feedback / refinement test"** example pre-fills both the healthcare prompt and a suggested
   feedback string, so you can generate → refine end-to-end in two clicks.

See [WEEK1_TEST_RESULTS.md](WEEK1_TEST_RESULTS.md) for the actual recorded results of these test cases.

## Error handling

- Vague input (e.g. a bare topic with no angle) stops after the Context Analyzer with a friendly prompt and
  suggested narrower directions, instead of generating a generic map.
- If any agent call fails (rate limit, network, missing key), the UI shows a short, non-technical message
  and lets you retry — no stack traces, no API errors, no key values are ever shown to the user.

## Environment variables / secrets

| Variable | Required | Where | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | Server only (`.env.local` locally, project secret on the host) | Never committed. Never exposed to the client — all Gemini calls happen inside Next.js API routes (`app/api/*/route.ts`), which run server-side only. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |

No other secrets are used. There is no database, no auth, and no third-party analytics in this prototype.

## Project structure

```
app/
  page.tsx                 # main UI (input, results, feedback loop)
  api/generate/route.ts    # runs the full generation pipeline
  api/refine/route.ts      # runs the refinement pipeline
lib/
  schemas.ts                # Zod schemas shared between all agents (the "contract")
  gemini.ts                  # Gemini client + structured-output / search-grounding helpers
  agents/
    coordinator.ts           # workflow orchestration (Agent 1)
    contextAnalyzer.ts        # Agent 2
    exploration.ts             # Agent 3
    assumptionChallenger.ts     # Agent 4
    architect.ts                 # Agent 5
    critic.ts                     # Agent 6 (critique + refinement)
components/
  MindMapView.tsx            # collapsible hierarchical mind map
  AgentTrace.tsx              # "How the AI Agents Worked" panel
  Section.tsx                  # result section cards + bullet lists
```

## Known limitations (Week 1)

- **Free-tier Gemini rate limits are low** and this pipeline fires several calls close together (Exploration
  ∥ Assumption Challenger). A 429 on a plain generation call is retried automatically with backoff; if it's
  still rate-limited after 3 retries, the pipeline reports a clear "try again" error rather than a raw one.
- **Google Search grounding has its own, much stricter free-tier quota**, separate from plain generation
  calls - during Week 1 testing it was quota-exhausted almost the entire session. The Exploration agent
  detects this and falls back to the model's own knowledge automatically (confirmed working live), so the
  pipeline never fails because of it - but "true" web-grounded findings couldn't be exercised end-to-end in
  this environment. Re-test once quota resets or billing is enabled to confirm grounded search end-to-end.
- State lives only in the browser tab — refreshing the page loses the current map (no persistence/database).
- The Refinement step re-uses the original Critique/Exploration/Assumption-Challenge findings rather than
  re-running those agents after each refinement — a deliberate cost/latency trade-off for a prototype.
- No automated test suite (unit/e2e) yet — validation for Week 1 is the manual test log in
  `WEEK1_TEST_RESULTS.md`.
- Single-user, single-session only — no accounts, no saved history across visits.

## Week 1 scope

Deliberately out of scope for this prototype: user accounts, a production database, analytics,
personalization, and multi-user collaboration. State is per-browser-tab; refresh the page to start over.

## Future improvements (beyond Week 1)

- Persist generated maps (database) so users can return to previous sessions.
- Re-run Critic after each refinement so the critique stays current with the latest map.
- Exportable output (PNG/PDF/Markdown outline) for including maps in design deliverables.
- Multi-turn refinement history (undo/redo across refinements, not just one-shot feedback).
- Automated regression tests against the Week 1 test cases.
