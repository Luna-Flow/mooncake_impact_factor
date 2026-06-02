import { App } from "../frontend/src/App";
import { getFeedPackages } from "../lib/data";

export const dynamic = "force-dynamic";

export default function Page() {
  const initialTopPackages = getFeedPackages("top", 12);
  return <App initialTopPackages={initialTopPackages} initialView="landing" />;
}
