import { App } from "../frontend/src/App";
import type { PackageSummary } from "../frontend/src/types";
import { getFeedPackages } from "../lib/data";

export const dynamic = "force-dynamic";

export default function Page() {
  let initialTopPackages: PackageSummary[] = [];
  try {
    initialTopPackages = getFeedPackages("top", 12);
  } catch {
    initialTopPackages = [];
  }
  return <App initialTopPackages={initialTopPackages} initialView="landing" />;
}
