import { z } from "zod";

import {
  staticManifestSchema,
  staticSearchIndexSchema,
  packageAnalysisSchema,
  packageSummaryListSchema,
  type PackageAnalysis,
  type PackageSummary,
  type StaticManifest,
  type StaticSearchIndexItem
} from "./types";
import type { AdvancedSearchParams, FeedSource } from "./api";
import { normalizeSearchParams } from "./app-state";

type StaticSearchResponse = {
  items: PackageSummary[];
};

const STATIC_DATA_PREFIX = `${process.env["NEXT_PUBLIC_BASE_PATH"] ?? ""}/data`;

let manifestPromise: Promise<StaticManifest> | null = null;
let workerPromise: Promise<Worker> | null = null;
let workerReadyPromise: Promise<void> | null = null;
let workerManifestVersion: string | null = null;
let workerRequestId = 0;
const pendingWorkerRequests = new Map<number, {
  resolve: (items: PackageSummary[]) => void;
  reject: (error: Error) => void;
}>();

async function requestJson<T>(url: string, schema: z.ZodSchema<T>): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return schema.parse(payload);
}

function staticAsset(pathname: string): string {
  return `${STATIC_DATA_PREFIX}/${pathname}`;
}

function versionedStaticAsset(pathname: string, version: string): string {
  const url = new URL(staticAsset(pathname), "https://static.invalid");
  url.searchParams.set("v", version);
  return `${url.pathname}${url.search}`;
}

export async function fetchStaticManifest(): Promise<StaticManifest> {
  if (!manifestPromise) {
    manifestPromise = requestJson(staticAsset("manifest.json"), staticManifestSchema);
  }
  return manifestPromise;
}

export async function fetchStaticFeed(source: FeedSource): Promise<PackageSummary[]> {
  await fetchStaticManifest();
  const data = await requestJson(staticAsset(`feeds/${source}.json`), packageSummaryListSchema);
  return data.items;
}

type WorkerInitRequest = {
  type: "init";
  id: number;
  indexUrl: string;
};

type WorkerSearchRequest = {
  type: "search";
  id: number;
  params: AdvancedSearchParams;
};

type WorkerReadyResponse = {
  type: "ready";
  id: number;
};

type WorkerResultResponse = {
  type: "result";
  id: number;
  items: StaticSearchIndexItem[];
};

type WorkerErrorResponse = {
  type: "error";
  id: number;
  message: string;
};

type WorkerResponse = WorkerReadyResponse | WorkerResultResponse | WorkerErrorResponse;

function staticWorkerItemsToSummary(items: StaticSearchIndexItem[]): PackageSummary[] {
  return items.map((pkg) => ({
    full_name: pkg.full_name,
    owner: pkg.owner,
    package_name: pkg.package_name,
    description: pkg.description,
    latest_version: pkg.latest_version,
    dependent_count: pkg.dependent_count,
    recent_dependent_count: pkg.recent_dependent_count,
    download_count: pkg.download_count,
    score: pkg.score,
    score_30d_ago: pkg.score_30d_ago,
    score_growth_30d: pkg.score_growth_30d,
    score_growth_ratio_30d: pkg.score_growth_ratio_30d,
    rank_label: pkg.rank_label,
    momentum_label: pkg.momentum_label
  }));
}

function nextWorkerId(): number {
  workerRequestId += 1;
  return workerRequestId;
}

async function getStaticSearchWorker(): Promise<Worker> {
  if (typeof window === "undefined") {
    throw new Error("Static search worker is only available in the browser");
  }
  if (!workerPromise) {
    workerPromise = Promise.resolve(
      new Worker(new URL("./static-search.worker.ts", import.meta.url), {
        type: "module"
      })
    );
    const worker = await workerPromise;
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const payload = event.data;
      if (payload.type === "ready") {
        return;
      }
      const pending = pendingWorkerRequests.get(payload.id);
      if (!pending) {
        return;
      }
      pendingWorkerRequests.delete(payload.id);
      if (payload.type === "error") {
        pending.reject(new Error(payload.message));
        return;
      }
      pending.resolve(staticWorkerItemsToSummary(payload.items));
    });
  }
  return workerPromise;
}

async function resetStaticSearchWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    worker.terminate();
  }
  workerPromise = null;
  workerReadyPromise = null;
  workerManifestVersion = null;
}

async function ensureStaticSearchWorkerReady(): Promise<void> {
  const manifest = await fetchStaticManifest();
  if (workerManifestVersion !== manifest.generated_at) {
    await resetStaticSearchWorker();
    workerManifestVersion = manifest.generated_at;
  }
  if (!workerReadyPromise) {
    workerReadyPromise = (async () => {
      const worker = await getStaticSearchWorker();
      const requestId = nextWorkerId();
      await new Promise<void>((resolve, reject) => {
        const handleMessage = (event: MessageEvent<WorkerResponse>) => {
          const payload = event.data;
          if (payload.id !== requestId) {
            return;
          }
          worker.removeEventListener("message", handleMessage);
          if (payload.type === "error") {
            reject(new Error(payload.message));
            return;
          }
          resolve();
        };
        worker.addEventListener("message", handleMessage);
        worker.postMessage({
          type: "init",
          id: requestId,
          indexUrl: versionedStaticAsset("search/search-index.json", manifest.generated_at)
        } satisfies WorkerInitRequest);
      });
    })();
  }
  return workerReadyPromise;
}

export async function searchStaticPackages(params: Partial<AdvancedSearchParams> = {}): Promise<PackageSummary[]> {
  await fetchStaticManifest();
  await ensureStaticSearchWorkerReady();
  const worker = await getStaticSearchWorker();
  const normalized = normalizeSearchParams(params);
  const requestId = nextWorkerId();
  return await new Promise<PackageSummary[]>((resolve, reject) => {
    pendingWorkerRequests.set(requestId, { resolve, reject });
    worker.postMessage({
      type: "search",
      id: requestId,
      params: normalized
    } satisfies WorkerSearchRequest);
  });
}

export async function fetchStaticPackageAnalysis(owner: string, packageName: string): Promise<PackageAnalysis> {
  await fetchStaticManifest();
  return requestJson(staticAsset(`packages/${owner}--${packageName}.json`), packageAnalysisSchema);
}

export async function searchStaticPackagesResponse(params: Partial<AdvancedSearchParams> = {}): Promise<StaticSearchResponse> {
  return { items: await searchStaticPackages(params) };
}
