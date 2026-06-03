"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Dispatch } from "react";

import { DEFAULT_SEARCH_PARAMS, fetchFeed, fetchPackageAnalysis, searchPackages, type AdvancedSearchParams, type FeedSource } from "./api";
import { detectLanguage, dictionaries, type Language, type ThemePreference } from "./i18n";
import { fetchStaticFeed, fetchStaticPackageAnalysis, searchStaticPackages } from "./static-api";
import type { PackageSummary } from "./types";
import {
  buildSearchHref,
  cloneSearchParams,
  createInitialAppState,
  hasSearchIntent,
  normalizeSearchParams,
  reduceAppState,
  resolveTheme,
  type AppInitialData,
  type AppAction,
  type AppState,
  type ResolvedTheme
} from "./app-state";

const LANGUAGE_STORAGE_KEY = "mooncake-impact-language";
const THEME_STORAGE_KEY = "mooncake-impact-theme";

type RouterLike = {
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

function navigateStaticUrl(href: string, mode: "push" | "replace"): void {
  if (typeof window === "undefined") return;
  const url = new URL(href, window.location.origin);
  if (mode === "replace") {
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } else {
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

type ControllerCommands = {
  changeLanguage: (language: Language) => void;
  changeThemePreference: (themePreference: ThemePreference) => void;
  changeDraftParams: (params: AdvancedSearchParams) => void;
  resetDraftParams: () => void;
  clearSearchResults: (pathname?: "/search" | "/advanced-search") => void;
  submitSearch: (params?: AdvancedSearchParams, pathname?: "/search" | "/advanced-search") => Promise<void>;
  openFeed: (source: FeedSource, pathname?: "/search" | "/advanced-search") => Promise<void>;
  selectPackage: (fullName: string) => Promise<void>;
  retryCurrentSearch: (pathname?: "/search" | "/advanced-search") => Promise<void>;
  retryDetail: () => Promise<void>;
  openAdvanced: () => void;
  closeAdvanced: () => void;
};

function detectStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "system" || stored === "light" || stored === "dark") {
    return stored;
  }
  return "system";
}

function detectSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function splitFullName(fullName: string): { owner: string; packageName: string } {
  const parts = fullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid package name: ${fullName}`);
  }
  return { owner: parts[0], packageName: parts[1] };
}

function getSearchErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  if (/^Unexpected .* error$/i.test(error.message)) {
    return fallback;
  }
  return error.message;
}

function getFeedLimit(source: FeedSource): number {
  return source === "top" ? 40 : 24;
}

function getCurrentSearchParams(): Partial<AdvancedSearchParams> {
  if (typeof window === "undefined") {
    return {};
  }
  const query = new URLSearchParams(window.location.search);
  return {
    q: query.get("q") ?? "",
    owner: query.get("owner") ?? "",
    packageName: query.get("package") ?? "",
    keyword: query.get("keyword") ?? "",
    description: query.get("description") ?? "",
    license: query.get("license") ?? "",
    repository: query.get("repository") ?? "",
    rank: (query.get("rank") ?? "") as AdvancedSearchParams["rank"],
    momentum: (query.get("momentum") ?? "") as AdvancedSearchParams["momentum"],
    minScore: query.get("min_score") ?? "",
    maxScore: query.get("max_score") ?? "",
    minDependents: query.get("min_dependents") ?? "",
    minRecentDependents: query.get("min_recent_dependents") ?? "",
    minDownloads: query.get("min_downloads") ?? "",
    fromYear: query.get("from_year") ?? "",
    toYear: query.get("to_year") ?? "",
    hasRepository: (query.get("has_repository") ?? "") as AdvancedSearchParams["hasRepository"],
    hasLicense: (query.get("has_license") ?? "") as AdvancedSearchParams["hasLicense"],
    sort: (query.get("sort") ?? "") as AdvancedSearchParams["sort"],
    order: (query.get("order") ?? "") as AdvancedSearchParams["order"],
    expr: query.get("expr") ?? "",
    ast: query.get("ast") ?? ""
  };
}

function usePreferenceHydration(dispatch: Dispatch<AppAction>): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedLanguage = typeof window !== "undefined" ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY) : null;
    const initialLanguage =
      storedLanguage === "zh-CN" || storedLanguage === "ja-JP" || storedLanguage === "en-US"
        ? storedLanguage
        : detectLanguage();
    const themePreference = detectStoredThemePreference();
    const resolvedTheme = resolveTheme(themePreference, detectSystemTheme());

    dispatch({
      type: "hydratePreferences",
      language: initialLanguage,
      themePreference,
      resolvedTheme
    });
    setHydrated(true);
  }, [dispatch]);

  return hydrated;
}

function usePreferenceEffects(state: AppState, hydrated: boolean): void {
  const { language, themePreference, resolvedTheme } = state.preferences;

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [hydrated, language]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset["theme"] = resolvedTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [hydrated, resolvedTheme, themePreference]);
}

function useThemeResolution(preference: ThemePreference, dispatch: Dispatch<AppAction>): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolvedTheme = resolveTheme(preference, media.matches ? "dark" : "light");
      dispatch({
        type: "setResolvedTheme",
        resolvedTheme
      });
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [dispatch, preference]);
}

export function useAppController(
  initialData: AppInitialData,
  router: RouterLike
): { state: AppState; commands: ControllerCommands } {
  const [state, dispatch] = useReducer(reduceAppState, initialData, createInitialAppState);
  const commandsRef = useRef<ControllerCommands | null>(null);
  const lastStaticLocationRef = useRef<string | null>(null);
  const preferencesHydrated = usePreferenceHydration(dispatch);

  usePreferenceEffects(state, preferencesHydrated);
  useThemeResolution(state.preferences.themePreference, dispatch);

  useEffect(() => {
    if (state.search.status !== "ready") return;
    if (state.search.items.length === 0) {
      if (state.detail.status !== "closed") {
        dispatch({ type: "closeDetail" });
      }
      return;
    }

    const selected = state.detail.selectedFullName;
    const stillExists = selected
      ? state.search.items.some((item) => item.full_name === selected)
      : false;
    if (stillExists || state.detail.status === "loading") return;

    void commandsRef.current?.selectPackage(state.search.items[0]!.full_name);
  }, [state.detail.selectedFullName, state.detail.status, state.search.items, state.search.status]);

  const commands = useMemo<ControllerCommands>(() => {
    const runtimeCopy = dictionaries[state.preferences.language];
    const isStaticMode = state.dataMode === "static";

    function replaceUrl(href: string, options?: { scroll?: boolean }): void {
      if (isStaticMode) {
        navigateStaticUrl(href, "replace");
        if (options?.scroll !== false && typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "auto" });
        }
        return;
      }
      router.replace(href, options);
    }

    async function submitSearch(
      params = state.search.draftParams,
      pathname: "/search" | "/advanced-search" = "/search"
    ): Promise<void> {
      const nextParams = cloneSearchParams(params);
      if (!hasSearchIntent(nextParams)) {
        dispatch({ type: "clearSearch", params: normalizeSearchParams(DEFAULT_SEARCH_PARAMS) });
        replaceUrl(pathname, { scroll: false });
        return;
      }

      dispatch({ type: "submitSearchStarted", params: nextParams });
      replaceUrl(buildSearchHref(nextParams, null, pathname), { scroll: false });

      try {
        const items = isStaticMode
          ? await searchStaticPackages(nextParams)
          : await searchPackages(nextParams);
        dispatch({ type: "submitSearchSucceeded", items });
      } catch (error: unknown) {
        dispatch({
          type: "submitSearchFailed",
          message: getSearchErrorMessage(error, runtimeCopy.workspace.unknownError)
        });
      }
    }

    async function openFeed(
      source: FeedSource,
      pathname: "/search" | "/advanced-search" = "/search"
    ): Promise<void> {
      const params = normalizeSearchParams(DEFAULT_SEARCH_PARAMS);
      dispatch({ type: "openFeedStarted", source, params });
      replaceUrl(buildSearchHref(params, source, pathname), { scroll: false });

      try {
        const items = isStaticMode
          ? await fetchStaticFeed(source)
          : await fetchFeed(source, getFeedLimit(source));
        dispatch({ type: "openFeedSucceeded", items });
      } catch (error: unknown) {
        dispatch({
          type: "openFeedFailed",
          message: getSearchErrorMessage(error, runtimeCopy.workspace.unknownError)
        });
      }
    }

    async function selectPackage(fullName: string): Promise<void> {
      dispatch({ type: "selectPackageStarted", fullName });
      try {
        const { owner, packageName } = splitFullName(fullName);
        const { detail, dependents } = isStaticMode
          ? await fetchStaticPackageAnalysis(owner, packageName)
          : await fetchPackageAnalysis(owner, packageName);
        dispatch({ type: "selectPackageSucceeded", fullName, detail, dependents });
      } catch (error: unknown) {
        dispatch({
          type: "selectPackageFailed",
          fullName,
          message: getSearchErrorMessage(error, runtimeCopy.detail.unknownError)
        });
      }
    }

    async function retryCurrentSearch(
      pathname: "/search" | "/advanced-search" = "/search"
    ): Promise<void> {
      if (state.search.mode === "feed" && state.search.activeSource) {
        await openFeed(state.search.activeSource, pathname);
        return;
      }
      if (state.search.mode === "search") {
        await submitSearch(state.search.appliedParams, pathname);
      }
    }

    async function retryDetail(): Promise<void> {
      if (!state.detail.packageName) return;
      await selectPackage(state.detail.packageName);
    }

    return {
      changeLanguage(language) {
        dispatch({ type: "setLanguage", language });
      },
      changeThemePreference(themePreference) {
        dispatch({ type: "setThemePreference", themePreference });
      },
      changeDraftParams(params) {
        dispatch({ type: "setDraftParams", params });
      },
      resetDraftParams() {
        dispatch({ type: "resetDraftParams" });
      },
      clearSearchResults(pathname = "/search") {
        dispatch({ type: "clearSearch", params: normalizeSearchParams(DEFAULT_SEARCH_PARAMS) });
        replaceUrl(pathname, { scroll: false });
      },
      submitSearch,
      openFeed,
      selectPackage,
      retryCurrentSearch,
      retryDetail,
      openAdvanced() {
        dispatch({ type: "openAdvanced" });
      },
      closeAdvanced() {
        dispatch({ type: "closeAdvanced" });
      }
    };
  }, [router, state.dataMode, state.detail.packageName, state.preferences.language, state.search.activeSource, state.search.appliedParams, state.search.draftParams, state.search.mode]);

  useEffect(() => {
    if (state.dataMode !== "static") return;
    if (initialData.initialView !== "search" && initialData.initialView !== "advanced-search") return;

    const pathname = initialData.initialView === "advanced-search" ? "/advanced-search" : "/search";
    const syncFromLocation = () => {
      if (typeof window === "undefined") return;
      const href = `${window.location.pathname}${window.location.search}`;
      if (lastStaticLocationRef.current === href) {
        return;
      }
      lastStaticLocationRef.current = href;

      const params = normalizeSearchParams(getCurrentSearchParams());
      const source = new URLSearchParams(window.location.search).get("source");

      if (source === "top" || source === "hot" || source === "rising") {
        void commandsRef.current?.openFeed(source, pathname);
        return;
      }

      if (hasSearchIntent(params)) {
        void commandsRef.current?.submitSearch(params, pathname);
        return;
      }

      dispatch({ type: "clearSearch", params: normalizeSearchParams(DEFAULT_SEARCH_PARAMS) });
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [initialData.initialView, state.dataMode]);

  commandsRef.current = commands;

  return { state, commands };
}
