import { NextRequest, NextResponse } from "next/server";
import { runGenerationPipeline } from "@/lib/agents/coordinator";
import type { GenerateResponse } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<GenerateResponse>(
      { status: "error", error: "Invalid request.", trace: [] },
      { status: 400 },
    );
  }

  const input = typeof (body as { input?: unknown })?.input === "string" ? (body as { input: string }).input.trim() : "";
  const additionalContext =
    typeof (body as { additionalContext?: unknown })?.additionalContext === "string"
      ? (body as { additionalContext: string }).additionalContext.trim()
      : "";

  if (!input) {
    return NextResponse.json<GenerateResponse>(
      { status: "error", error: "Please describe what you'd like to explore.", trace: [] },
      { status: 400 },
    );
  }
  if (input.length > 2000) {
    return NextResponse.json<GenerateResponse>(
      { status: "error", error: "That's too long - please keep it under 2000 characters.", trace: [] },
      { status: 400 },
    );
  }

  try {
    const result = await runGenerationPipeline(input, additionalContext);
    return NextResponse.json<GenerateResponse>(result);
  } catch {
    return NextResponse.json<GenerateResponse>(
      { status: "error", error: "Something went wrong generating the mind map. Please try again.", trace: [] },
      { status: 500 },
    );
  }
}
