import { DEFAULT_SEARCH_PARAMS, type AdvancedSearchParams, type FeedSource } from "./api";
import type { DependentItem, PackageDetail, PackageSummary } from "./types";
import type { Language, ThemePreference } from "./i18n";

export type AppView = "landing" | "search" | "advanced-search";
export type SearchMode = "idle" | "feed" | "search";
export type AsyncStatus = "idle" | "loading" | "ready" | "error";
export type ResolvedTheme = "light" | "dark";

export type AppInitialData = {
  initialView: AppView;
  dataMode?: "dynamic" | "static";
  initialSearchParams?: Partial<AdvancedSearchParams>;
  initialSource?: FeedSource | null;
  initialSearchItems?: PackageSummary[];
  initialSearchError?: string | null;
};

export type PreferencesState = {
  language: Language;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
};

export type SearchState = {
  draftParams: AdvancedSearchParams;
  appliedParams: AdvancedSearchParams;
  mode: SearchMode;
  activeSource: FeedSource | null;
  status: AsyncStatus;
  items: PackageSummary[];
  errorMessage: string | null;
};

export type DetailState = {
  selectedFullName: string | null;
  status: "closed" | "loading" | "ready" | "error";
  packageName: string | null;
  detail: PackageDetail | null;
  dependents: DependentItem[];
  errorMessage: string | null;
};

export type AppState = {
  dataMode: "dynamic" | "static";
  preferences: PreferencesState;
  ui: {
    advancedOpen: boolean;
  };
  search: SearchState;
  detail: DetailState;
};

export type AppAction =
  | { type: "hydratePreferences"; language: Language; themePreference: ThemePreference; resolvedTheme: ResolvedTheme }
  | { type: "setLanguage"; language: Language }
  | { type: "setThemePreference"; themePreference: ThemePreference }
  | { type: "setResolvedTheme"; resolvedTheme: ResolvedTheme }
  | { type: "setDraftParams"; params: AdvancedSearchParams }
  | { type: "resetDraftParams"; params?: AdvancedSearchParams }
  | { type: "openAdvanced" }
  | { type: "closeAdvanced" }
  | { type: "clearSearch"; params?: AdvancedSearchParams }
  | { type: "submitSearchStarted"; params: AdvancedSearchParams }
  | { type: "submitSearchSucceeded"; items: PackageSummary[] }
  | { type: "submitSearchFailed"; message: string }
  | { type: "openFeedStarted"; source: FeedSource; params: AdvancedSearchParams }
  | { type: "openFeedSucceeded"; items: PackageSummary[] }
  | { type: "openFeedFailed"; message: string }
  | { type: "selectPackageStarted"; fullName: string }
  | { type: "selectPackageSucceeded"; fullName: string; detail: PackageDetail; dependents: DependentItem[] }
  | { type: "selectPackageFailed"; fullName: string; message: string }
  | { type: "closeDetail" };

export function cloneSearchParams(params: AdvancedSearchParams): AdvancedSearchParams {
  return { ...params };
}

export function normalizeSearchParams(params?: Partial<AdvancedSearchParams>): AdvancedSearchParams {
  return {
    ...cloneSearchParams(DEFAULT_SEARCH_PARAMS),
    ...params
  };
}

export function hasSearchIntent(params: AdvancedSearchParams): boolean {
  return Object.values(params).some((value) => typeof value === "string" && value.trim().length > 0);
}

export function resolveTheme(
  preference: ThemePreference,
  systemTheme: ResolvedTheme = "light"
): ResolvedTheme {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return systemTheme;
}

export function appendIfPresent(query: URLSearchParams, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) query.set(key, trimmed);
}

export function appendBooleanIfPresent(
  query: URLSearchParams,
  key: string,
  value: "" | "true" | "false"
): void {
  if (value) query.set(key, value);
}

export function buildSearchHref(
  params: AdvancedSearchParams,
  source?: FeedSource | null,
  pathname = "/search"
): string {
  const query = new URLSearchParams();

  if (source) {
    query.set("source", source);
  } else {
    appendIfPresent(query, "q", params.q);
    appendIfPresent(query, "owner", params.owner);
    appendIfPresent(query, "package", params.packageName);
    appendIfPresent(query, "keyword", params.keyword);
    appendIfPresent(query, "description", params.description);
    appendIfPresent(query, "license", params.license);
    appendIfPresent(query, "repository", params.repository);
    appendIfPresent(query, "rank", params.rank);
    appendIfPresent(query, "momentum", params.momentum);
    appendIfPresent(query, "min_score", params.minScore);
    appendIfPresent(query, "max_score", params.maxScore);
    appendIfPresent(query, "min_dependents", params.minDependents);
    appendIfPresent(query, "min_recent_dependents", params.minRecentDependents);
    appendIfPresent(query, "min_downloads", params.minDownloads);
    appendIfPresent(query, "from_year", params.fromYear);
    appendIfPresent(query, "to_year", params.toYear);
    appendBooleanIfPresent(query, "has_repository", params.hasRepository);
    appendBooleanIfPresent(query, "has_license", params.hasLicense);
    appendIfPresent(query, "sort", params.sort);
    appendIfPresent(query, "order", params.order);
    appendIfPresent(query, "expr", params.expr);
    appendIfPresent(query, "ast", params.ast);
  }

  const suffix = query.toString();
  return `${pathname}${suffix ? `?${suffix}` : ""}`;
}

export function createInitialAppState(data: AppInitialData): AppState {
  const params = normalizeSearchParams(data.initialSearchParams);
  const baseSearch: SearchState = {
    draftParams: params,
    appliedParams: params,
    mode: "idle",
    activeSource: null,
    status: "idle",
    items: [],
    errorMessage: null
  };

  if (data.initialView !== "landing") {
    if (data.initialSource) {
      baseSearch.mode = "feed";
      baseSearch.activeSource = data.initialSource;
      baseSearch.status = data.dataMode === "static" ? "loading" : "ready";
      baseSearch.items = data.initialSearchItems ?? [];
    } else if (hasSearchIntent(params)) {
      baseSearch.mode = "search";
      baseSearch.status = data.dataMode === "static" ? "loading" : (data.initialSearchError ? "error" : "ready");
      baseSearch.items = data.initialSearchItems ?? [];
      baseSearch.errorMessage = data.initialSearchError ?? null;
    }
  }

  return {
    dataMode: data.dataMode ?? "dynamic",
    preferences: {
      language: "zh-CN",
      themePreference: "system",
      resolvedTheme: "light"
    },
    ui: {
      advancedOpen: false
    },
    search: baseSearch,
    detail: {
      selectedFullName: null,
      status: "closed",
      packageName: null,
      detail: null,
      dependents: [],
      errorMessage: null
    }
  };
}

function resetDetailState(selectedFullName: string | null = null): DetailState {
  return {
    selectedFullName,
    status: selectedFullName ? "loading" : "closed",
    packageName: selectedFullName,
    detail: null,
    dependents: [],
    errorMessage: null
  };
}

export function reduceAppState(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "hydratePreferences":
      if (
        state.preferences.language === action.language &&
        state.preferences.themePreference === action.themePreference &&
        state.preferences.resolvedTheme === action.resolvedTheme
      ) {
        return state;
      }
      return {
        ...state,
        preferences: {
          language: action.language,
          themePreference: action.themePreference,
          resolvedTheme: action.resolvedTheme
        }
      };
    case "setLanguage":
      if (state.preferences.language === action.language) {
        return state;
      }
      return {
        ...state,
        preferences: {
          ...state.preferences,
          language: action.language
        }
      };
    case "setThemePreference":
      if (state.preferences.themePreference === action.themePreference) {
        return state;
      }
      return {
        ...state,
        preferences: {
          ...state.preferences,
          themePreference: action.themePreference
        }
      };
    case "setResolvedTheme":
      if (state.preferences.resolvedTheme === action.resolvedTheme) {
        return state;
      }
      return {
        ...state,
        preferences: {
          ...state.preferences,
          resolvedTheme: action.resolvedTheme
        }
      };
    case "setDraftParams":
      return {
        ...state,
        search: {
          ...state.search,
          draftParams: action.params
        }
      };
    case "resetDraftParams":
      return {
        ...state,
        search: {
          ...state.search,
          draftParams: action.params ?? normalizeSearchParams(DEFAULT_SEARCH_PARAMS)
        }
      };
    case "openAdvanced":
      if (state.ui.advancedOpen) {
        return state;
      }
      return {
        ...state,
        ui: {
          ...state.ui,
          advancedOpen: true
        }
      };
    case "closeAdvanced":
      if (!state.ui.advancedOpen) {
        return state;
      }
      return {
        ...state,
        ui: {
          ...state.ui,
          advancedOpen: false
        }
      };
    case "clearSearch": {
      const params = action.params ?? normalizeSearchParams(DEFAULT_SEARCH_PARAMS);
      return {
        ...state,
        search: {
          draftParams: params,
          appliedParams: params,
          mode: "idle",
          activeSource: null,
          status: "idle",
          items: [],
          errorMessage: null
        },
        detail: resetDetailState()
      };
    }
    case "submitSearchStarted":
      return {
        ...state,
        search: {
          draftParams: action.params,
          appliedParams: action.params,
          mode: "search",
          activeSource: null,
          status: "loading",
          items: [],
          errorMessage: null
        },
        detail: resetDetailState()
      };
    case "submitSearchSucceeded":
      return {
        ...state,
        search: {
          ...state.search,
          status: "ready",
          items: action.items,
          errorMessage: null
        }
      };
    case "submitSearchFailed":
      return {
        ...state,
        search: {
          ...state.search,
          status: "error",
          items: [],
          errorMessage: action.message
        }
      };
    case "openFeedStarted":
      return {
        ...state,
        search: {
          draftParams: action.params,
          appliedParams: action.params,
          mode: "feed",
          activeSource: action.source,
          status: "loading",
          items: [],
          errorMessage: null
        },
        detail: resetDetailState()
      };
    case "openFeedSucceeded":
      return {
        ...state,
        search: {
          ...state.search,
          status: "ready",
          items: action.items,
          errorMessage: null
        }
      };
    case "openFeedFailed":
      return {
        ...state,
        search: {
          ...state.search,
          status: "error",
          items: [],
          errorMessage: action.message
        }
      };
    case "selectPackageStarted":
      return {
        ...state,
        detail: resetDetailState(action.fullName)
      };
    case "selectPackageSucceeded":
      return {
        ...state,
        detail: {
          selectedFullName: action.fullName,
          status: "ready",
          packageName: action.fullName,
          detail: action.detail,
          dependents: action.dependents,
          errorMessage: null
        }
      };
    case "selectPackageFailed":
      return {
        ...state,
        detail: {
          selectedFullName: action.fullName,
          status: "error",
          packageName: action.fullName,
          detail: null,
          dependents: [],
          errorMessage: action.message
        }
      };
    case "closeDetail":
      return {
        ...state,
        detail: resetDetailState()
      };
    default:
      return state;
  }
}
