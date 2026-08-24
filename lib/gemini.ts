import { GoogleGenAI, ApiError } from "@google/genai";
import { z } from "zod/v4";

/**
 * gemini-3.5-flash-lite: free-tier-eligible Gemini model, chosen after live
 * testing against the alternatives. gemini-2.5-flash and gemini-2.0-flash
 * are retired (404 for this key). gemini-3.6-flash works but its default
 * "thinking" can consume the entire output budget on small responses,
 * returning empty text unless maxOutputTokens is generously sized.
 * flash-lite returned clean, immediate structured JSON and tolerated a
 * 4-request burst in ~0.6s with no rate-limit errors - a better fit for a
 * free-tier, multi-call-per-request pipeline. Swap this one constant to
 * move the whole app to a different Gemini model later.
 */
const MODEL = "gemini-3.5-flash-lite";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new AgentError(
      "Server is missing GEMINI_API_KEY. Set it as an environment variable (see .env.example) and restart the server.",
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

/** Error type whose `.message` is always safe to show directly to end users. */
export class AgentError extends Error {}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Maps our provider-agnostic effort levels onto Gemini's thinking budget. */
function thinkingBudgetFor(effort: Effort): number {
  return effort === "low" ? 0 : -1; // 0 = disabled (fast), -1 = automatic
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The free tier's requests-per-minute cap is easy to hit when this pipeline
 * fires several calls close together (e.g. Exploration ∥ Assumption
 * Challenger). Rather than fail the whole pipeline on a transient burst,
 * retry 429s with backoff - free-tier RPM windows typically clear within
 * seconds. Non-429 errors are not retried.
 */
async function generateContentWithRetry(
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  retries = 3,
): Promise<Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getClient().models.generateContent(params);
    } catch (err) {
      const isRateLimited = err instanceof ApiError && err.status === 429;
      if (!isRateLimited || attempt >= retries) throw err;
      const delay = 2500 * 2 ** attempt; // 2.5s, 5s, 10s
      console.warn(`[retry] 429 on attempt ${attempt}, waiting ${delay}ms`);
      await sleep(delay);
    }
  }
}

/**
 * Runs one structured-output LLM call and validates the result against a Zod
 * schema. This is the workhorse used by every analytical agent (context
 * analyzer, assumption challenger, architect, critic, refinement) and by the
 * structuring phase of the exploration agent below.
 */
export async function runStructuredAgent<T extends z.ZodTypeAny>({
  agentName,
  system,
  user,
  schema,
  effort = "medium",
  maxTokens = 8000,
}: {
  agentName: string;
  system: string;
  user: string;
  schema: T;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  try {
    const response = await generateContentWithRetry({
      model: MODEL,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiJsonSchema(schema),
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: thinkingBudgetFor(effort), includeThoughts: false },
      },
    });

    return parseStructuredResponse(agentName, response.text, schema);
  } catch (err) {
    throw toAgentError(agentName, err);
  }
}

/**
 * Runs the exploration agent in two phases against a single Gemini model:
 *
 *  1. Research - the model is given the Google Search grounding tool and
 *     asked to write free-text research notes. Gemini does not reliably
 *     support mixing a hosted tool (Google Search) with a JSON response
 *     schema in the same call, so structured output is deliberately kept
 *     out of this phase.
 *  2. Structuring - a second, tool-free call turns the (optional) research
 *     notes plus the original context into the validated ExplorationFindings
 *     shape, via the same structured-output path every other agent uses.
 *
 * Both phases run against the same model and same underlying request
 * mechanism as the rest of the app - this is not a different provider or
 * shortcut, just a two-step prompt for one agent's single responsibility.
 */
export async function runExplorationAgent<T extends z.ZodTypeAny>({
  agentName,
  researchSystem,
  structureSystem,
  user,
  schema,
  maxTokens = 6000,
}: {
  agentName: string;
  researchSystem: string;
  structureSystem: string;
  user: string;
  schema: T;
  maxTokens?: number;
}): Promise<{ result: z.infer<T>; usedWebSearch: boolean; sources: string[] }> {
  try {
    // Google Search grounding has its own, much stricter free-tier quota,
    // separate from plain generation calls. Try it, but don't let a search
    // quota failure take down the whole agent - fall back to the model's
    // own knowledge, exactly as the brief allows ("use web research when
    // available and appropriate"). This fallback is not retried with
    // backoff: a search-quota 429 is very unlikely to clear in seconds, so
    // fail fast to the fallback instead of stalling the whole pipeline.
    let researchResponse;
    let searchAvailable = true;
    try {
      researchResponse = await getClient().models.generateContent({
        model: MODEL,
        contents: user,
        config: {
          systemInstruction: researchSystem,
          tools: [{ googleSearch: {} }],
          maxOutputTokens: maxTokens,
        },
      });
    } catch (searchErr) {
      searchAvailable = false;
      console.warn(`[${agentName}] Google Search grounding unavailable, falling back to model knowledge:`, searchErr);
      researchResponse = await generateContentWithRetry({
        model: MODEL,
        contents: user,
        config: { systemInstruction: researchSystem, maxOutputTokens: maxTokens },
      });
    }

    const researchText = researchResponse.text ?? "";
    const chunks = searchAvailable
      ? (researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
      : [];
    const usedWebSearch = chunks.length > 0;
    const sources = Array.from(
      new Set(
        chunks
          .map((c) => c.web?.title || c.web?.uri)
          .filter((s): s is string => Boolean(s)),
      ),
    );

    const researchLabel = searchAvailable
      ? "RESEARCH NOTES (gathered via live web search just now; may be empty if search wasn't needed for this topic)"
      : "RESEARCH NOTES (web search was unavailable this run; these notes come from the model's own knowledge instead)";
    const structuringUser = `${user}

${researchLabel}:
${researchText || "(no research notes were produced - reason from your own knowledge instead)"}`;

    const result = await runStructuredAgent({
      agentName,
      system: structureSystem,
      user: structuringUser,
      schema,
      effort: "medium",
      maxTokens,
    });

    return { result, usedWebSearch, sources };
  } catch (err) {
    throw toAgentError(agentName, err);
  }
}

/**
 * Converts a Zod schema to the JSON Schema shape Gemini's `responseJsonSchema`
 * expects. Zod v4's own `toJSONSchema` marks recursive properties (like
 * MindMapNode.children) as `required` even though they carry a `.default()`.
 * Gemini's docs call out that cyclic `$ref`s are only reliable on
 * *non-required* properties, so this strips any property from `required`
 * whose value schema cycles back to its own definition.
 */
function toGeminiJsonSchema<T extends z.ZodTypeAny>(schema: T): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  const defs = json.$defs as Record<string, JsonSchemaNode> | undefined;
  if (!defs) return json;

  for (const [defKey, def] of Object.entries(defs)) {
    if (!def || !Array.isArray(def.required) || !def.properties) continue;
    def.required = def.required.filter(
      (propName) => !refsBackTo(def.properties![propName], defKey, defs, new Set()),
    );
  }
  return json;
}

interface JsonSchemaNode {
  $ref?: string;
  items?: JsonSchemaNode;
  properties?: Record<string, JsonSchemaNode>;
  anyOf?: JsonSchemaNode[];
  required?: string[];
}

function refsBackTo(
  node: JsonSchemaNode | undefined,
  targetDefKey: string,
  defs: Record<string, JsonSchemaNode>,
  seen: Set<string>,
): boolean {
  if (!node) return false;
  if (node.$ref) {
    const key = node.$ref.replace("#/$defs/", "");
    if (key === targetDefKey) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return refsBackTo(defs[key], targetDefKey, defs, seen);
  }
  if (node.items) return refsBackTo(node.items, targetDefKey, defs, seen);
  if (node.properties) {
    return Object.values(node.properties).some((p) => refsBackTo(p, targetDefKey, defs, seen));
  }
  if (node.anyOf) return node.anyOf.some((n) => refsBackTo(n, targetDefKey, defs, seen));
  return false;
}

function parseStructuredResponse<T extends z.ZodTypeAny>(
  agentName: string,
  text: string | undefined,
  schema: T,
): z.infer<T> {
  if (!text) {
    throw new AgentError(`${agentName} did not return a result. Please try again.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AgentError(`${agentName} returned a malformed response. Please try again.`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AgentError(
      `${agentName} returned data that didn't match the expected structure. Please try again.`,
    );
  }
  return parsed.data;
}

function toAgentError(agentName: string, err: unknown): AgentError {
  if (err instanceof AgentError) return err;
  // Server-side only - full detail for debugging, never sent to the client.
  console.error(`[${agentName}] Gemini call failed:`, err);
  if (err instanceof ApiError) {
    // Gemini returns a plain 400 INVALID_ARGUMENT/API_KEY_INVALID for a bad
    // key (not 401/403), so match on that in addition to the standard auth
    // status codes.
    const isInvalidKey =
      err.status === 401 ||
      err.status === 403 ||
      /API_KEY_INVALID|API key not valid/i.test(err.message);
    if (isInvalidKey) {
      return new AgentError(
        "The server's Gemini API key is missing or invalid. Please contact the site owner.",
      );
    }
    if (err.status === 429) {
      return new AgentError(
        `${agentName} is rate-limited right now (the free tier has a low requests-per-minute cap). Please wait a moment and try again.`,
      );
    }
    return new AgentError(`${agentName} failed (service error). Please try again.`);
  }
  return new AgentError(`${agentName} failed unexpectedly. Please try again.`);
}
