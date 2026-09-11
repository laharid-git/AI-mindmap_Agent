# AI Mind-Map Agent — Assignment Test Log

Live test results for the 5 required Week 1 test cases, plus the dedicated vague-input check (Step 6) and
mind-map visual verification (Step 7). Every result below is copied from actual tool output captured during
live testing against the real Gemini API — none of it is predicted or invented.

**Testing environment:** Primary testing was done against the local dev server (`npm run dev`), using both
direct API calls (`/api/generate`, `/api/refine`) and the real browser UI (simulated clicks/DOM inspection,
not just reading JSON). Test 1 and the Test 4/Step 6 vague-input case were additionally re-verified against
the **live production deployment** at `https://ai-mindmap-agent.vercel.app` after deploying, confirming the
same behavior holds in production.

**Model:** `gemini-3.5-flash-lite` (Google Gemini API). See `WEEK1_TEST_RESULTS.md` in this repo for the
full bug-fix history uncovered during this testing pass (6 real, reproduced-and-fixed issues), which this
log doesn't repeat in full.

---

## Test 1 — Healthcare app for elderly users

**Input:** `"Design an AI-powered healthcare application for elderly users."`

**Expected behavior:** Full 6-agent pipeline runs end-to-end; non-generic mind map; exploration surfaces
caregivers/family/accessibility; assumption challenger questions whether elderly users are the only people
interacting with the system, per the assignment brief.

**Actual behavior:** `status: "success"` in ~30-38s (both locally and in production). All 6 trace entries
reported `"success"`. Context Analyzer identified target users as `["Elderly adults (seniors)", "Family
caregivers", "Healthcare providers"]` and constraints including HIPAA and low digital literacy. Exploration
surfaced, unprompted: *"Remote adult children managing care from afar"*, *"Underpaid, high-turnover...
home health aides"*, *"Aging spouses or peer caregivers who share devices."* Assumption Challenger asked,
in its own words: *"Is the elderly user the primary active operator of the application?"* and *"Are we
assuming a smartphone app is the best form factor?"* — the exact spirit of "are elderly users always the
only people interacting with the system?" The Architect produced 6-7 branches / 23-24 sub-nodes, folding
Exploration's alternative directions (an "Alternative Hardware and Interaction" branch with ambient sensors)
and the Challenger's missing stakeholders (a dedicated caregiver-coordination branch) into real structural
branches. The Critic caught a specific, non-generic gap: *"The mind map dropped the exploration finding
regarding local neighborhood and community volunteers"* - proof it cross-checked against Exploration's raw
output, not just the map alone. Re-confirmed live in production with the same result shape (7 branches,
all agents `"success"`).

**What worked:** Full agent flow; genuine cross-agent synthesis traceable from Exploration/Challenger
findings into specific map branches; specific (not generic) critique.

**What broke:** On the very first attempt, before fixes: the configured model (`gemini-2.5-flash`) was
deprecated (live `404`), and the first successful map had a reproducible text artifact (stray `.id`
fragments on node descriptions). Both fixed and re-verified — see `WEEK1_TEST_RESULTS.md`.

**What surprised us:** The Critic's gap-finding was specific enough to name the exact dropped Exploration
finding, not just a generic "add more stakeholders."

**What should be improved:** None outstanding for this test; passes cleanly and repeatedly.

---

## Test 2 — Multi-generational family vacation planning

**Input:** `"Plan a multi-generational family vacation."`

**Expected behavior:** Full map, not flagged vague (names a concrete audience: multiple generations of one
family).

**Actual behavior:** `status: "success"` in 32.3s. Root: *"Multi-Generational Vacation Planning"*. 5
branches: *Accommodation & Spatial Design, Itinerary & Activity Balance, Accessibility & Health Safety,
Decision-Making & Governance, Financial & Logistical Alignment.*

**What worked:** Correctly not flagged vague. Branches are specific to the multi-generational angle (e.g.
"Decision-Making & Governance" for resolving conflicting preferences across generations), not a generic
"trip planning" checklist.

**What broke:** Nothing on this run.

**What surprised us:** "Decision-Making & Governance" as a top-level branch - not an obvious category for a
vacation planner, but a genuinely useful one once you consider a multi-generational group has to agree on
things.

**What should be improved:** None outstanding.

---

## Test 3 — Improving the university student experience

**Input:** `"Improve the university student experience."`

**Expected behavior:** Full map, not flagged vague (this is one of the app's own listed Test Examples,
distinct from the intentionally-vague "Artificial Intelligence" example).

**Actual behavior (first run):** `status: "vague"` - incorrectly stopped the pipeline. **Actual behavior
(after a prompt-calibration fix):** `status: "success"` in 32.1s. Root: *"University Student Experience"*.
6 branches: *Academic & Instructional Ecosystem, Administrative & Financial Friction, Lifecycle Transitions
& Equity, Community & Wellbeing Support, Workforce & Civic Integration, Digital Risks & Governance.*

**What worked (after fix):** Produces a full, non-generic map. Re-verified "Artificial Intelligence" still
correctly triggers the vague gate afterward, confirming the fix was a genuine calibration, not a disabled
check.

**What broke:** The vagueness gate over-triggered on this exact example from the app's own Test Examples
list before the fix - a real calibration bug (documented and fixed - see `WEEK1_TEST_RESULTS.md`, fix #6).

**What surprised us:** How close this prompt and "Artificial Intelligence" looked to the same model before
calibration - both are broad, but only one names a concrete audience. That distinction needed to be spelled
out explicitly rather than left implicit.

**What should be improved:** The vagueness heuristic is now "audience or goal named ⇒ proceed," which is
intentionally more permissive. Worth watching for under-triggering (generating a generic map for genuinely
vague input) in future use; not observed in testing so far.

---

## Test 4 — Artificial Intelligence (vague input)

**Input:** `"Artificial Intelligence"`

**Expected behavior:** System recognizes the topic is too broad and asks for clarification instead of
generating a generic map.

**Actual behavior:** `status: "vague"` in ~4s (single agent call; pipeline correctly stopped before
Exploration/Architect/Critic ever ran). Confirmed on multiple independent runs, locally and in production,
with slightly different model-generated wording each time but identically correct behavior, e.g.:

- *"Artificial Intelligence is a vast field. Could you narrow down your focus so we can build a targeted
  mind map for your specific project?"* — 5 directions: AI healthcare diagnostics, AI ethics/governance, AI
  learning assistants, AI customer support, AI UX/design tools.
- (production) *"Your request is too broad to build a targeted UX mind map. Please choose a specific
  direction or provide more details."* — 4 directions offered.

**What worked:** Exactly matches the required behavior, every time it was run. Fast (no wasted downstream
agent calls - only the Context Analyzer runs). Suggested directions are concrete and clickable in the UI
(clicking one populates the input field so the user can immediately retry).

**What broke:** Nothing - correct on the very first run and remained correct through every subsequent
change made this session, including the Test 3 recalibration.

**What surprised us:** Nothing notable - this is the one case the prompt was written most carefully for
from the start.

**What should be improved:** None outstanding. See Step 6 below for a dedicated deeper check.

---

## Test 5 — Human feedback / refinement test

**Input:** Generate on `"Design an AI-powered healthcare application for elderly users."`, then submit
feedback: `"Focus more on caregivers and accessibility."`

**Expected behavior:** Refined map visibly incorporates the feedback - not just a claim that it was
"considered."

**Actual behavior:** Tested twice - via direct API call, and through the real browser UI end-to-end (typed
via the app's own "User feedback / refinement test" example chip, which pre-fills this exact feedback
string, then clicked **Refine Mind Map**). `status: "success"` in 10-15s both times.
`changesSummary` (browser run, verbatim): *"Expanded the accessibility branch with a dedicated onboarding
and offline-capable literacy sub-branch"*; *"Deepened the caregiver ecosystem by adding an institutional
staff branch for assisted living facility administrators"*; *"Upgraded the community support branch with...
delegated wellness check workflows"*; *"Streamlined user segmentation to laser-focus... on the requested
caregiver and accessibility pillars."*

Verified structurally, not just by the AI's own summary text: the "Comprehensive Caregiver & Medical
Network" branch grew from 3 to 4 children (new: "Facility Administrators & Staff", "Local Community
Volunteers"), the accessibility branch grew from 2 to 3 children (new: "Accessible Onboarding & Literacy"),
and the root node's own description changed to *"...centered deeply on caregiver coordination and senior
accessibility."* The feedback textarea correctly cleared after a successful refine, and the agent-trace
panel appended the Refinement step onto the existing generation trace (one continuous transparency log for
the whole session).

**What worked:** Real, verifiable structural changes tied directly to the feedback wording. The UI's green
"Refined based on your feedback" banner rendered with the concrete change list.

**What broke:** The `.id` text artifact (see Test 1 / `WEEK1_TEST_RESULTS.md` fix #3) first surfaced in this
test's baseline map; confirmed 0 artifacts in the refined output after the fix.

**What surprised us:** The refinement didn't just add nodes - it also consolidated/streamlined per its own
judgment ("streamlined user segmentation... to laser-focus"), matching the brief's requirement that
refinement be a genuine edit, not pure addition.

**What should be improved:** Only positive-framed feedback ("focus more on X") was tested this session. A
*removal*-style instruction ("Remove business-related branches") was not tested - worth checking in a future
pass to confirm the agent handles subtraction as well as it handles expansion.

---

## Step 6 — Dedicated vague-input verification

**Requirement:** For `"Artificial Intelligence"`, the app must NOT blindly generate a large generic map. It
must recognize the topic is broad and either ask for clarification or offer useful directions.

**Result: confirmed correct.** On every run (multiple independent attempts, both local and production):

- The pipeline stops after the Context Analyzer - Exploration, Assumption Challenger, Architect, and Critic
  never run, confirmed by the returned `trace` array containing only `Coordinator` and `Context Analyzer`
  entries (2-3 entries, vs. 7+ for a full run).
- No mind map is generated at all (`mindMap` field is entirely absent from the vague-path response schema -
  not an empty one, not a generic placeholder one).
- A friendly, non-technical `vagueMessage` is returned, phrased differently each run (genuinely
  model-generated, not a canned string) but consistently explaining the topic is too broad.
- 4-5 concrete, specific `suggestedDirections` are returned every time (e.g. "AI healthcare diagnostics for
  rural clinics," never a repeat of the vague input itself).
- Response time for the vague path (~4s) is far shorter than a full generation (~30-40s), confirming the
  short-circuit is real and not just a UI-level message layered on top of a full generation.

No case was observed where the app generated a full, generic map for this input.

---

## Step 7 — Mind map visual verification

**Requirement:** Confirm the output is an actual visual mind map, not raw JSON or plain text, with a clear
root topic, main branches, sub-branches, readability, visible relationships, no unnecessary duplication,
and a reasonable hierarchy.

**Method:** Inspected the live-rendered DOM in the real browser (not just the API JSON) via element
class/attribute queries and simulated real mouse clicks - not inference from the React source alone.

- **Root topic distinguished:** confirmed via computed class name -
  `bg-brand-600 ... text-white ... rounded-2xl` on the root card, labeled "Root topic," visually and
  structurally separate from every branch card underneath it.
- **Main branches / sub-branches:** confirmed a real two-to-three-level nested hierarchy (root → 5-7
  top-level branches → 2-4 sub-branches each), each depth level using a visually distinct background/border
  style (verified in `components/MindMapView.tsx` and confirmed rendered in the live DOM).
- **Readability:** every node carries a short label plus a one-sentence description, rendered as separate
  visual lines, not a wall of text.
- **Relationships / hierarchy:** parent-child nesting is expressed with real DOM nesting plus a visible
  connecting border (`border-l-2`) and indentation, not just a flat list.
- **Expand/collapse works:** confirmed with real simulated mouse clicks (not just `.click()` in JS) at the
  button's actual screen coordinates - `aria-expanded` toggled `true` ↔ `false`, and the children were
  confirmed **removed from the DOM entirely** while collapsed (not just hidden with CSS), then correctly
  restored on re-expand.
- **No unnecessary duplication:** the reproducible `.id` text-artifact bug (see Test 1/5) was found and
  fixed, and confirmed at 0 occurrences across a full map afterward. Separately, the Critic agent itself is
  designed to catch *semantic* duplication (distinct from the text-artifact bug) and did so correctly at
  least once during testing, flagging real overlapping content between two branches by name - this is the
  system's intended self-check working as designed, not a defect.

**Conclusion:** the output is a genuine, interactive, hierarchical visual mind map - confirmed by direct DOM
inspection and real interaction, not inferred from the JSON payload alone.
