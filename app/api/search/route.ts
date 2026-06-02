import { NextResponse } from "next/server";

import { isHttpError, searchPackagesFromInput } from "../../../lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const items = searchPackagesFromInput({
      q: searchParams.get("q"),
      limit: searchParams.get("limit"),
      owner: searchParams.get("owner"),
      package: searchParams.get("package"),
      keyword: searchParams.get("keyword"),
      description: searchParams.get("description"),
      license: searchParams.get("license"),
      repository: searchParams.get("repository"),
      rank: searchParams.get("rank"),
      momentum: searchParams.get("momentum"),
      min_score: searchParams.get("min_score"),
      max_score: searchParams.get("max_score"),
      min_dependents: searchParams.get("min_dependents"),
      min_recent_dependents: searchParams.get("min_recent_dependents"),
      min_downloads: searchParams.get("min_downloads"),
      from_year: searchParams.get("from_year"),
      to_year: searchParams.get("to_year"),
      has_repository: searchParams.get("has_repository"),
      has_license: searchParams.get("has_license"),
      sort: searchParams.get("sort"),
      order: searchParams.get("order"),
      expr: searchParams.get("expr"),
      ast: searchParams.get("ast")
    });

    return NextResponse.json({ items });
  } catch (error: unknown) {
    if (isHttpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected search error" }, { status: 500 });
  }
}
