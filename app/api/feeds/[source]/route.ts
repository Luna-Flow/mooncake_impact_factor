import { NextResponse } from "next/server";

import { getFeedPackages, isHttpError } from "../../../../lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ source: string }> }) {
  try {
    const { source } = await context.params;
    if (source !== "top" && source !== "hot" && source !== "rising") {
      return NextResponse.json({ error: "Unknown feed source" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const items = getFeedPackages(source, limit ? Number(limit) : undefined);
    return NextResponse.json({ items });
  } catch (error: unknown) {
    if (isHttpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected feed error" }, { status: 500 });
  }
}
