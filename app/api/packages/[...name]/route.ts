import { NextResponse } from "next/server";

import { getPackageAnalysis, isHttpError } from "../../../../lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/packages/<owner>/<name>: the full name may have more than two
// segments, as in tonyfettes/tree-sitter/cli.
export async function GET(_request: Request, context: { params: Promise<{ name: string[] }> }) {
  try {
    const { name } = await context.params;
    return NextResponse.json(getPackageAnalysis(name.map(decodeURIComponent).join("/")));
  } catch (error: unknown) {
    if (isHttpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected analysis error" }, { status: 500 });
  }
}
