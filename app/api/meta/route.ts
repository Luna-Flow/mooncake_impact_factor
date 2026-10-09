import { NextResponse } from "next/server";

import { getIndexMeta, isHttpError } from "../../../lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(getIndexMeta());
  } catch (error: unknown) {
    if (isHttpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected meta error" }, { status: 500 });
  }
}
