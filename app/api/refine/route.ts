import { NextRequest, NextResponse } from "next/server";
import { runRefinementPipeline } from "@/lib/agents/coordinator";
import { RefineRequestBodySchema } from "@/lib/schemas";
import type { RefineResponse } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json<RefineResponse>(
      { status: "error", error: "Invalid request.", trace: [] },
      { status: 400 },
    );
  }

  const parsed = RefineRequestBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<RefineResponse>(
      { status: "error", error: "Missing or invalid data - please regenerate the mind map and try again.", trace: [] },
      { status: 400 },
    );
  }

  try {
    const result = await runRefinementPipeline(parsed.data);
    return NextResponse.json<RefineResponse>(result);
  } catch {
    return NextResponse.json<RefineResponse>(
      { status: "error", error: "Something went wrong refining the mind map. Please try again.", trace: [] },
      { status: 500 },
    );
  }
}
