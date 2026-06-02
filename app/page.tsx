import { App } from "../frontend/src/App";
import { connection } from "next/server";
import type { PackageSummary } from "../frontend/src/types";

const APP_MODE = process.env["NEXT_PUBLIC_APP_MODE"] === "static" ? "static" : "dynamic";

export default async function Page() {
  let initialTopPackages: PackageSummary[] = [];
  if (APP_MODE === "dynamic") {
    await connection();
    try {
      const { getFeedPackages } = await import("../lib/data");
      initialTopPackages = getFeedPackages("top", 12);
    } catch {
      initialTopPackages = [];
    }
  }
  return <App initialTopPackages={initialTopPackages} initialView="landing" dataMode={APP_MODE} />;
}
