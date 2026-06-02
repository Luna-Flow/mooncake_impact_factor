import { NextResponse } from "next/server";

import { getPackageAnalysis, isHttpError } from "../../../../../../lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; packageName: string }> }
) {
  try {
    const { owner, packageName } = await context.params;
    const analysis = getPackageAnalysis(owner, packageName);
    return NextResponse.json(analysis);
  } catch (error: unknown) {
    if (isHttpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected analysis error" }, { status: 500 });
  }
}
