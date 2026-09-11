# Part 2 — Architecture Enhancement Documentation

Implementation and live-test evidence for the four approved Part 2 changes. Everything in this document is
copied from actual tool output captured during this session against the real Gemini API (`gemini-3.5-flash-lite`)
— nothing is predicted or invented. Week 1 architecture, agent count, and Gemini setup are unchanged; no new
agents were added.

---

## 1. What changed (summary)

| # | Change | Files touched | New LLM calls? | New agents? |
|---|---|---|---|---|
| 1 | Post-refinement Critic loop | `lib/agents/coordinator.ts`, `lib/agents/critic.ts`, `lib/schemas.ts`, `app/page.tsx` | +1 per refinement (reuses existing `critiqueMindMap`) | No |
| 2 | Surface `usedWebSearch` data-quality signal | `lib/schemas.ts`, `lib/agents/exploration.ts`, `app/page.tsx` | No | No |
| 3 | Multi-lens Exploration output | `lib/schemas.ts`, `lib/agents/exploration.ts`, `app/page.tsx` | No (same 2-call research→structure flow) | No |
| 4 | Clickable Critic recommendations | `app/page.tsx` | No | No |

Exploration and Assumption Challenger remain exactly the two parallel agents they were in Week 1
(`Promise.allSettled` in `coordinator.ts`, unchanged). No additional parallel LLM calls were introduced
anywhere in the pipeline.

---

## 2. Change 1 — Post-refinement Critic loop

**Before:** `runRefinementPipeline` called `refineMindMap` and returned immediately. The map a human ends up
with after refining was never reviewed by anything.

**After:** `runRefinementPipeline` now calls the *same* `critiqueMindMap` function used for the first pass
against the newly refined map, adds a `Critic` trace entry (purpose text: *"Re-reviews the map after
refinement, using the exact same review process as the first pass..."*), and returns the new `Critique` in
`RefineSuccess.critique`.

The frontend (`app/page.tsx`) now updates its `critique` state from every refine response and sends that
state back as `previousCritique` on the next refine call — so a second refinement round reviews against the
first refinement's critique, not the original Week 1 critique. This was previously impossible: `RefineSuccess`
didn't carry a critique field at all.

A new explicit choice was added after every critique is shown: **"Refine Mind Map"** or **"✓ I'm happy with
this map — Finish"**. Finish replaces the feedback form with an acknowledgment and a "Refine anyway" escape
hatch (verified working in Test C below) — this is the "meaningful human-in-the-loop" decision point that
didn't exist before (previously there was no way to signal "I'm done" other than closing the tab).

## 3. Change 2 — Data-quality signal (`usedWebSearch`)

**Before:** `lib/gemini.ts`'s `runExplorationAgent` already computed `usedWebSearch` from Gemini's grounding
metadata, but `exploration.ts`'s `explore()` discarded it before returning `ExplorationFindings`. The UI had
no way to tell the user whether a result was search-grounded or model-knowledge-only.

**After:** `usedWebSearch` is now part of `ExplorationFindingsSchema` and is passed through unchanged from
the value `lib/gemini.ts` already computes (not re-derived, not inferred — the exact same boolean). The
Exploration section now shows one of two badges:
- 🔍 *"Grounded in live web search (N source(s))"*
- 🧠 *"Based on the model's own knowledge — live search was unavailable this run"*

## 4. Change 3 — Multi-lens Exploration (before/after prompt evidence)

This is the real answer to the "add parallel perspective agents?" question raised in the planning phase: it
was rejected (see prior architecture analysis) because the free tier's search-grounding quota was already
observed exhausted for nearly all of Week 1 testing, and adding more simultaneous calls would worsen a
constraint already fought hard to work around. Instead, the *same* Exploration agent's *same* two calls
(research, then structure) were changed to require explicitly named, genuinely distinct vantage points.

**Before** (`STRUCTURE_SYSTEM` in `lib/agents/exploration.ts`):
```
Convert those into the required structured fields: alternative perspectives, additional stakeholders,
opportunities, edge cases, risks, missing branches a generic map would omit, alternative solution
directions, and short research notes. Keep each list item short (one sentence, concrete). If research
notes were provided, list the sources they came from in sourcesUsed (titles or URLs); otherwise leave
sourcesUsed empty.
```

**After** (added paragraph, rest unchanged):
```
Additionally, organize your OWN findings above into "perspectives": 2-4 explicitly named, genuinely
distinct vantage points on this same request (e.g. "End-user & accessibility", "Stakeholder & business",
"Risk & ethics/governance", "Technical & operational" - pick whichever 2-4 lenses are actually relevant to
THIS request, don't force irrelevant ones). Each lens's findings must say something a reader wouldn't
already get from a different lens - if two lenses would produce near-identical points, merge them into one
lens instead of padding the count. This is not new research - it's the same material above, re-organized
so a human reader can see multiple genuine perspectives at a glance instead of one blended list.
```

Schema addition: `perspectives: { lens: string; findings: string[] }[]` (min 2, max 4), enforced via Zod +
Gemini's `responseJsonSchema`.

**Actual live output for the healthcare test** (Test A, verbatim, not trimmed):

| Lens | Sample finding |
|---|---|
| End-user & Cognitive Experience | *"Must dynamically adapt to fluctuating cognitive states like sundowning and delirium."* |
| Care Ecosystem & Professional Integration | *"Needs to synthesize passive health monitoring data into actionable, non-fatiguing summaries for overburdened primary care providers."* |
| Systemic Risk, Privacy & Infrastructure | *"Requires offline-first fallback mechanisms to handle rural connectivity gaps and power outages."* |

All three lenses were chosen by the model (not hardcoded) and are genuinely non-overlapping in content —
each finding above is specific to its lens and wouldn't naturally appear under another. This is real
evidence of the requirement 9 ("prompt iteration with before/after evidence"): same input, same call count,
materially different (and more useful) output structure.

## 5. Change 4 — Clickable Critic recommendations

Each item in `critique.recommendedChanges` now renders as a clickable button (reusing the existing
suggestion-chip visual language already used for vague-topic directions). Clicking one populates the
feedback textarea with that exact text — still fully editable before submitting, per the requirement.

---

## 6. Tests performed (live, real, this session)

Dev server: `npm run dev` on `localhost:3000`, real `GEMINI_API_KEY`, model `gemini-3.5-flash-lite`. Tests
A/B/D/E/H/I run via direct `curl` against `/api/generate` and `/api/refine` for precise JSON inspection; Test
C run through the real browser DOM (simulated clicks, not inference from source).

### Test A — Healthcare workflow

**Input:** `"Design an AI-powered healthcare application for elderly users."`
**Expected:** Full 6-agent pipeline succeeds; Exploration returns 2-4 distinct named perspectives;
`usedWebSearch` present.
**Actual:** `status: "success"` in 38.1s. Trace: `Coordinator → Context Analyzer → Exploration & Alternatives
→ Assumption Challenger → Mind-Map Architect → Critic → Coordinator`, all `"success"`. Exploration returned
**3** perspectives (table above), `usedWebSearch: false` (search quota was exhausted this run — see Test G).
Mind map: 5 branches, 19 total sub-nodes. Critic v1: 3 strengths, 3 gaps, 1 weak branch, 1 duplicate.
**Pass/Fail: PASS.**
**Observations:** Multi-lens output is genuinely distinct per lens (manually inspected all 3, no restated
content across lenses).

### Test B — Human feedback

**Input:** Refine Test A's map with `"Focus more on caregivers and accessibility."`
**Expected:** Refined map visibly reflects the feedback.
**Actual:** `status: "success"` in 21.4s. "User Experience & Accessibility" branch grew 3→4 children (added
*"Socioeconomic & Device Compatibility"*); "Stakeholders & Care Ecosystem" gained *"Reverse-Telemetry Care
Model"*. `changesSummary` listed 4 concrete changes.
**Pass/Fail: PASS.** See the detailed evaluation in §7 for whether this genuinely satisfies the feedback,
beyond just "a change happened."

### Test C — Critic recommendation → clickable feedback

**Input:** Click a Critic recommendation chip in the real browser UI.
**Expected:** Feedback textarea populates with that exact recommendation text, remains editable.
**Actual:** Verified via DOM inspection: 3 recommendation buttons rendered; clicking the first
(*"Add an emergency services and first responders escalation branch."*) set the feedback textarea's value to
that exact string, `disabled: false`, `readOnly: false`. Submitted it through the real "Refine Mind Map"
button; the resulting map's `changesSummary` read *"Added a new 'Emergency Services & First Responders'
branch with sub-nodes for automated AI alert dispatch and first responder data handover"* — confirmed the
clicked recommendation was genuinely incorporated (cross-checked, not just claimed - see §7).
**Pass/Fail: PASS.**

### Test D — Refinement → new Critic

**Input:** Same as Test B (chained from it).
**Expected:** `/api/refine` response includes a fresh `critique` field from re-running the Critic on the
refined map, not a copy of the pre-refinement critique.
**Actual:** `trace` for the refine call: `Coordinator → Refinement Agent → Critic → Coordinator`. New
critique: 3 strengths, **2** gaps (down from 3), 1 weak branch, 1 duplicate. Critically, the 2 new gaps
(*"Community-level health tracking... omitted"*, *"pharmacist workflow integration... missing"*) are **not**
the same as any of the 3 original gaps — all 3 original gaps are gone, replaced by genuinely new findings.
The original duplicate (Ambient Monitoring vs. Zero-UI) is also gone, replaced by a different, new duplicate
(Conversational Voice vs. Motor/Sensory Accommodations).
**Pass/Fail: PASS.**
**Observation:** This is the clearest evidence the re-critique is a genuine fresh review, not the model
echoing its own prior critique - the specific content differs, not just the counts.

### Test E — Second refinement using the newest Critic

**Input:** Refine again with `"Add pharmacist workflows for managing complex medication schedules, as the
critic recommended."` (a gap that only exists in the *second* critique, not the original) — request body
built with `previousCritique` set to the critique returned by Test D, not the original.
**Expected:** If the newest critique is genuinely being used (not stale Week 1 data), the pharmacist gap —
which the original critique never mentioned — should be addressable at all.
**Actual:** `status: "success"`, `changesSummary`: *"Added a dedicated Pharmacist Medication Workflows
sub-node under the clinical and emergency teams branch..."* **However**, inspecting the actual returned
`mindMap` tree at full depth, no such node exists — "Clinical & Emergency Teams" mentions pharmacists only in
its description text, not as a child node. The third critique (after this refinement) independently
confirmed the gap was NOT resolved: *"Pharmacists and EMS responders are mentioned in the descriptions, but
lack explicit, dedicated node representation,"* and re-issued the same recommendation a second time.
**Pass/Fail: PASS for the requirement being tested** (the newest critique's gap was demonstrably reachable
and actionable - proving stale-critique reuse is fixed), **but this surfaced a real, separate bug** - see §8.

### Test F — Multi-lens Exploration

Covered in Test A and §4 above. **Pass/Fail: PASS.**

### Test G — Search-grounded vs. model-knowledge-only indication

**Expected:** The `usedWebSearch` badge matches the actual grounding outcome.
**Actual:** In Test A, Google Search grounding hit its (already well-documented, separate) free-tier quota
and failed with `429 RESOURCE_EXHAUSTED` (confirmed in server logs: *"[Exploration Agent] Google Search
grounding unavailable, falling back to model knowledge"*). `usedWebSearch: false` was returned and the UI
correctly rendered the 🧠 "model's own knowledge" badge, not the 🔍 search badge.
**Pass/Fail: PASS** (the signal correctly reflects the real outcome). **Not exercised this session:** the
🔍 "grounded" badge path itself, because search grounding did not succeed in any run this session (same
quota constraint documented in Week 1 - `WEEK1_TEST_RESULTS.md`). The fallback path is proven; the
success-path badge is implemented but unverified against a live grounded response this session.

### Test H — Vague input

**Input:** `"Artificial Intelligence"`
**Expected:** Unchanged Week 1 behavior - pipeline stops after Context Analyzer, no map generated.
**Actual:** `status: "vague"` in 3.9s, trace has only `Coordinator` + `Context Analyzer` entries, 5 concrete
suggested directions returned.
**Pass/Fail: PASS.** Confirms Part 2 changes did not regress this Week 1 behavior.

### Test I — Error / retry behavior

**Expected:** Input validation and schema safety hold after the schema changes.
**Actual, all verified live:**
- Empty input → `400`, *"Please describe what you'd like to explore."*
- `/api/refine` with missing fields → `400`, friendly message.
- `/api/refine` with an **old-shape** `exploration` object (no `perspectives`/`usedWebSearch` - simulating a
  stale client) → `400`, friendly message, not a crash. Confirms the schema migration fails safely.
- Search-grounding 429 (real, hit during Test A) → caught, logged server-side only, fallback triggered
  automatically, pipeline still returned `status: "success"`.
**Pass/Fail: PASS.**

---

## 7. Healthcare refinement chain — full comparison and qualitative evaluation

**Chain tested:** Original map → Critic v1 → Refinement 1 (human feedback: *"Focus more on caregivers and
accessibility."*) → Critic v2 → Refinement 2 (Critic-v2-recommendation-derived feedback) → Critic v3.

Per your instruction, Critic counts alone are **not** treated as proof of success below. Each predefined
criterion is evaluated against the actual returned content, not the self-reported `changesSummary` alone.

### Refinement 1 (feedback: "Focus more on caregivers and accessibility.")

| Criterion | Result | Evidence |
|---|---|---|
| Incorporated the user's explicit feedback? | **Yes** | Accessibility branch gained a real node (Socioeconomic & Device Compatibility); Stakeholders branch gained Reverse-Telemetry Care Model, directly caregiver-relevant |
| Addressed relevant Critic recommendations? | **Yes, 4/4** | All 4 of v1's `recommendedChanges` are traceable to specific new/changed nodes (checked individually, not just counted) |
| Removed/reduced relevant gaps? | **Yes** | All 3 of v1's gaps are absent from v2; v2's 2 new gaps are genuinely different topics, not restated |
| Added meaningful relevant content? | **Yes** | New nodes are specific (e.g. "Reverse-Telemetry Care Model") not generic filler |
| Avoided unnecessary duplication? | **Partial** | v1's known duplicate was resolved, but v2 independently found a *new*, different duplicate - duplication wasn't eliminated overall, just changed shape |
| Preserved useful existing info? | **Yes** | All 5 original branches persisted; nothing important was dropped |
| Resulting map remained coherent? | **Yes** | 5 branches, consistent structure, 0 stray text artifacts |

### Refinement 2 (feedback: "Add pharmacist workflows... as the critic recommended.")

| Criterion | Result | Evidence |
|---|---|---|
| Incorporated the user's explicit feedback? | **No** | Despite the claim in `changesSummary`, no dedicated pharmacist node exists in the actual returned tree |
| Addressed relevant Critic recommendations? | **No** | Same finding - the specific v2 recommendation this feedback was based on was not actually implemented |
| Removed/reduced relevant gaps? | **No** | Critic v3 re-raised the identical gap and re-issued the identical recommendation |
| Added meaningful relevant content? | **Partial** | Description text was touched, but the structural change claimed did not occur |
| Avoided unnecessary duplication? | **Yes** (no new duplicates from this round) | v3's duplicate list is the same single item carried from v2, not worsened |
| Preserved useful existing info? | **Yes** | Nothing was removed |
| Resulting map remained coherent? | **Yes** | Structure intact, no artifacts |

**Conclusion of this evaluation:** the re-critique loop (Change 1) is what caught Refinement 2's failure.
Without it, a user would have trusted the `changesSummary` claim at face value. This is real, direct
evidence for why "review before final output" (Part 2 requirement #4) has practical value beyond
satisfying a checklist - it caught something a naive implementation would have missed.

---

## 8. Bugs encountered and fixed / found

- **Fixed (implementation bug, caught before testing):** none required for this pass - Weeks 1's existing
  `sanitizeMindMap` continued to catch/clean any stray schema-key text artifacts; 0 artifacts found across
  all test runs this session (verified programmatically on every generated/refined map).
- **Found, not fixed (model reliability issue, documented not patched):** the Refinement agent's
  self-reported `changesSummary` is not always accurate - Test E demonstrated a concrete case where it
  claimed a structural change that did not occur. This was *caught* by Change 1 (the re-critique loop) but
  the underlying over-claiming behavior itself was not patched, per the scope you approved (no new
  validation logic was requested). See Remaining Limitations.

---

## 9. Evaluation results (qualitative, not a single invented score)

No aggregate percentage or numeric "quality score" is reported here, per your instruction. The two
refinement rounds above show materially different outcomes under the same 7 criteria: Refinement 1 met 6/7
criteria fully and 1 partially; Refinement 2 met 3/7 fully, 1 partially, and failed 3 - specifically the
three criteria most tied to *this round's own explicit goal* (incorporate feedback, address the
recommendation, reduce the gap). Critic-count deltas alone (gaps 3→2→2) would have obscured this - the count
didn't drop between v2 and v3, which is itself consistent with (though not a mathematical proof of) the
qualitative finding that round 2 didn't resolve what it claimed to.

---

## 10. Remaining limitations

- `changesSummary` (and by extension the model's own account of what it did) is still **not independently
  verified against the actual returned map structure anywhere in the pipeline** - that underlying behavior
  is unchanged. What changed (§11 below) is that the UI no longer implies it *is* verified: it's now
  explicitly labeled "reported" (AI's own claim) versus the Critic's "independent review," so a human
  reading both sections is told, not left to assume, which one to trust more. The system still cannot
  auto-detect a false claim on its own - a human (or a future automated check, out of scope for this pass)
  has to read both sections and notice a mismatch, same as happened in Test E.
- The 🔍 "grounded in live web search" badge path is implemented and schema-verified but was not observed
  against a real successful grounded search this session (the free-tier search quota was exhausted for
  effectively the same reason documented in `WEEK1_TEST_RESULTS.md`).
- The re-critique loop adds one Gemini call (and roughly 10-20s) to every refinement. Not tested this
  session: behavior under the free-tier rate limits if many refinements happen in rapid succession (the
  existing retry-with-backoff in `lib/gemini.ts` is unchanged and should apply equally to this new call,
  but this specific scenario wasn't exercised).
- No automated regression tests exist yet for any of this - Week 1's limitation stands unchanged.
- "Finish" is UI-state only (no persistence) - refreshing the page still loses everything, exactly as in
  Week 1.

---

## 11. Follow-up fix: labeling `changesSummary` as reported, not verified

**Problem (from Test E, §6/§7 above):** the UI showed the Refinement Agent's `changesSummary` under a
neutral heading ("Refined based on your feedback") with no indication it was a self-report. A user reading
only that section - not the critique below it - had no signal that the claimed change might not have
actually happened, as Test E demonstrated it sometimes doesn't.

**Fix scope, as directed:** UI labeling only. No new agent, no new API call, no validation/cross-checking
logic added. Two label changes in `app/page.tsx`:

1. The green banner under the mind map is now headed **"Reported changes from Refinement Agent"** with an
   explicit caption: *"What the AI says it changed, in its own words — not independently verified. See the
   Critic review below for an independent check of the map that actually resulted."*
2. The Critique section, when shown after a refinement, is now headed **"Post-refinement Critic review"**
   with subtitle: *"An independent review of the map that actually resulted from your last refinement —
   re-examined from scratch by the Critic agent, not based on the Refinement Agent's own report above."*

Neither label claims or implies that `changesSummary` has been verified - it explicitly says the opposite,
and points the reader to the section that *is* an independent check.

### Build

`npm run build` (dev server stopped first to avoid the shared-`.next`-cache conflict noted in earlier
sessions) - **succeeded cleanly**, no new errors or warnings beyond the pre-existing npm/version notices.

### Re-test: healthcare refinement, live, through the real browser UI

**Input:** "User feedback / refinement test" example (pre-fills the healthcare prompt and the
"Focus more on caregivers and accessibility." feedback) → Create Mind Map → Refine Mind Map.

**Actual, verified by reading the live-rendered page text (not the source, not assumption):**

- Both new labels rendered exactly as written: *"REPORTED CHANGES FROM REFINEMENT AGENT"* with the
  "not independently verified" caption present, and *"Post-refinement Critic review"* with the
  "independent review... not based on the Refinement Agent's own report above" caption present.
- The old labels ("Refined based on your feedback", "Updated review of the CURRENT map...") were confirmed
  **absent** - fully replaced, not duplicated.
- **The post-refinement Critic still uses the newest refined map**, confirmed directly (not inferred): the
  Critic's gaps and weak-branches referenced exact node names that only exist in the post-refinement
  tree - *"Pharmacy & Refill Logistics"* (under "Alternative Solution Paradigms"), *"Clinical Oversight
  Integration"*, and *"Care Managers & Family Dashboards"* - all three verified present in the actually
  rendered mind map at the time. A critique reviewing a stale/original map could not have named these,
  since they don't exist there.
- This particular refinement's `changesSummary` claims were spot-checked against the rendered tree and were
  accurate this time (e.g. *"Enhanced the caregiver branch with dedicated nodes for informal shadow
  caregivers, professional home health aides, and shared family dashboards"* → all three nodes verified
  present). This is expected and fine - the point of the fix isn't that self-reports are always wrong, it's
  that the UI no longer asks the user to simply trust them.
- No console errors during the run.
- Multi-lens Exploration (3 perspectives), the search-grounding badge, the recommendation chips, and the
  Finish/Refine-again choice all rendered correctly alongside the new labels - nothing else regressed.

**Pass/Fail: PASS.**
