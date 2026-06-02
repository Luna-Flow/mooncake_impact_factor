"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Globe,
  MoonStar,
  Search,
  SlidersHorizontal,
  SunMedium
} from "lucide-react";

import {
  DEFAULT_SEARCH_PARAMS,
  fetchFeed,
  type AdvancedSearchParams,
  type FeedSource,
  type SearchMomentum,
  type SearchOrder,
  type SearchRank,
  type SearchSort
} from "./api";
import { dictionaries, type Language, type ThemePreference } from "./i18n";
import {
  buildSearchHref,
  normalizeSearchParams,
  type AppInitialData,
  type AppView,
  type DetailState,
  type SearchState
} from "./app-state";
import { useAppController } from "./useAppController";
import { fetchStaticFeed } from "./static-api";
import type { PackageSummary } from "./types";
import {
  clearStructuredQuery,
  createEmptyQueryAst,
  deriveQueryAst,
  encodeQueryAst,
  hasQueryAstIntent,
  parseNativeExpression,
  serializeQueryAst,
  withQueryAst,
  type QueryAst,
  type QueryGroupNode,
  type QueryGroupOperator,
  type QueryNode,
  type QueryTermField,
  type QueryTermNode,
  type QueryTermOperator
} from "../../lib/query";

type AppProps = {
  initialTopPackages: PackageSummary[];
  initialView: AppView;
  dataMode?: "dynamic" | "static";
  initialSearchParams?: Partial<AdvancedSearchParams>;
  initialSource?: FeedSource | null;
  initialSearchItems?: PackageSummary[];
  initialSearchError?: string | null;
};

type PromptPreset = { label: string; params: Partial<AdvancedSearchParams> };
type SelectOption<T extends string> = { value: T; label: string; hint?: string };

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatNumber(language: Language, value: number): string {
  return new Intl.NumberFormat(language).format(value);
}

function formatDecimal(language: Language, value: number): string {
  return new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(language: Language, value: string | null): string {
  if (!value) return dictionaries[language].common.unknown;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat(language, { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

function shouldReduceMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getSourceCopy(language: Language, source: FeedSource | null): string {
  const copy = dictionaries[language];
  if (source === "top") return copy.workspace.topFeed;
  if (source === "hot") return copy.workspace.hotFeed;
  if (source === "rising") return copy.workspace.risingFeed;
  return copy.workspace.searchResults;
}

function hasActiveFilters(params: AdvancedSearchParams): boolean {
  const { q: _query, ...rest } = params;
  return Object.values(rest).some((value) => typeof value === "string" && value.trim().length > 0);
}

function buildFilterSummary(language: Language, params: AdvancedSearchParams): string[] {
  const copy = dictionaries[language];
  const chips: string[] = [];

  if (params.ast.trim() || params.expr.trim()) {
    chips.push(`${copy.workspace.queryLabel}: ${params.expr.trim() || serializeQueryAst(deriveQueryAst(params))}`);
  }

  if (params.q.trim()) chips.push(`${copy.workspace.queryLabel}: ${params.q.trim()}`);
  if (params.rank) chips.push(`${copy.filters.rank}: ${params.rank}`);
  if (params.momentum) chips.push(`${copy.filters.momentum}: ${getMomentumLabel(copy, params.momentum)}`);
  if (params.minScore.trim()) chips.push(`${copy.filters.minScore}: ${params.minScore.trim()}`);
  if (params.minDependents.trim()) chips.push(`${copy.filters.minDependents}: ${params.minDependents.trim()}`);
  if (params.keyword.trim()) chips.push(`${copy.filters.keyword}: ${params.keyword.trim()}`);
  if (params.sort) chips.push(`${copy.filters.sort}: ${getSortLabel(copy, params.sort)}`);

  return chips;
}

function applyLegacyPatch(
  params: AdvancedSearchParams,
  patch: Partial<AdvancedSearchParams>
): AdvancedSearchParams {
  return clearStructuredQuery({
    ...params,
    ...patch
  });
}

type QueryFieldSpec = {
  field: QueryTermField;
  label: string;
  operators: QueryTermOperator[];
  kind: "text" | "enum" | "number" | "boolean";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

function getQueryFieldSpecs(language: Language): QueryFieldSpec[] {
  const copy = dictionaries[language];
  return [
    { field: "text", label: copy.filters.query, operators: ["match"], kind: "text", placeholder: copy.toolbar.searchPlaceholder },
    { field: "owner", label: copy.filters.owner, operators: ["match"], kind: "text" },
    { field: "package", label: copy.filters.packageName, operators: ["match"], kind: "text" },
    { field: "keyword", label: copy.filters.keyword, operators: ["match"], kind: "text" },
    { field: "description", label: copy.filters.description, operators: ["match"], kind: "text" },
    { field: "license", label: copy.filters.license, operators: ["match"], kind: "text" },
    { field: "repository", label: copy.filters.repository, operators: ["match"], kind: "text" },
    {
      field: "rank",
      label: copy.filters.rank,
      operators: ["eq"],
      kind: "enum",
      options: ["S", "A", "B", "C", "D"].map((value) => ({ value, label: value }))
    },
    {
      field: "momentum",
      label: copy.filters.momentum,
      operators: ["eq"],
      kind: "enum",
      options: [
        { value: "Hot", label: copy.filters.momentumHot },
        { value: "Rising", label: copy.filters.momentumRising },
        { value: "Stable", label: copy.filters.momentumStable }
      ]
    },
    { field: "score", label: copy.filters.scoreField, operators: ["gte", "lte", "eq"], kind: "number" },
    { field: "dependents", label: copy.filters.dependentsField, operators: ["gte", "lte", "eq"], kind: "number" },
    { field: "recent_dependents", label: copy.filters.recentDependentsField, operators: ["gte", "lte", "eq"], kind: "number" },
    { field: "downloads", label: copy.filters.downloadsField, operators: ["gte", "lte", "eq"], kind: "number" },
    { field: "year", label: copy.filters.yearField, operators: ["gte", "lte", "eq"], kind: "number" },
    {
      field: "has_repository",
      label: copy.filters.hasRepository,
      operators: ["eq"],
      kind: "boolean",
      options: [
        { value: "true", label: copy.filters.yes },
        { value: "false", label: copy.filters.no }
      ]
    },
    {
      field: "has_license",
      label: copy.filters.hasLicense,
      operators: ["eq"],
      kind: "boolean",
      options: [
        { value: "true", label: copy.filters.yes },
        { value: "false", label: copy.filters.no }
      ]
    }
  ];
}

function createDefaultTerm(): QueryTermNode {
  return { kind: "term", field: "text", operator: "match", value: "" };
}

function createInitialBuilderAst(): QueryAst {
  return {
    kind: "group",
    op: "and",
    children: [
      {
        kind: "group",
        op: "and",
        children: []
      }
    ]
  };
}

function getExpressionPreview(ast: QueryAst): string {
  return hasQueryAstIntent(ast) ? serializeQueryAst(ast) : "";
}

function getDefaultValueForField(spec: QueryFieldSpec): string {
  if (spec.options?.[0]) return spec.options[0].value;
  return "";
}

function getDefaultOperatorForField(spec: QueryFieldSpec): QueryTermOperator {
  return spec.operators[0] ?? "match";
}

function normalizeTermAgainstSpec(term: QueryTermNode, spec: QueryFieldSpec): QueryTermNode {
  const nextOperator = spec.operators.includes(term.operator) ? term.operator : getDefaultOperatorForField(spec);
  const nextValue = spec.options?.some((option) => option.value === term.value)
    ? term.value
    : (term.value || getDefaultValueForField(spec));
  return {
    ...term,
    operator: nextOperator,
    value: nextValue
  };
}

function getOperatorLabel(operator: QueryTermOperator): string {
  if (operator === "match") return ":";
  if (operator === "eq") return "=";
  if (operator === "gte") return ">=";
  return "<=";
}

function getMomentumLabel(copy: (typeof dictionaries)[Language], value: string): string {
  if (value === "Hot") return copy.filters.momentumHot;
  if (value === "Rising") return copy.filters.momentumRising;
  if (value === "Stable") return copy.filters.momentumStable;
  return value;
}

function getSortLabel(copy: (typeof dictionaries)[Language], value: string): string {
  if (value === "relevance") return copy.filters.sortRelevance;
  if (value === "score") return copy.filters.sortScore;
  if (value === "growth") return copy.filters.sortGrowth;
  if (value === "downloads") return copy.filters.sortDownloads;
  if (value === "dependents") return copy.filters.sortDependents;
  if (value === "recent") return copy.filters.sortRecent;
  if (value === "updated") return copy.filters.sortUpdated;
  if (value === "name") return copy.filters.sortName;
  return value;
}

function getStatusLabel(copy: (typeof dictionaries)[Language], value: string): string {
  if (value === "Hot") return copy.filters.momentumHot;
  if (value === "Rising") return copy.filters.momentumRising;
  if (value === "Stable") return copy.filters.momentumStable;
  return value;
}

function getTermDisplayValue(spec: QueryFieldSpec | undefined, value: string): string {
  if (!spec?.options) {
    return value;
  }
  return spec.options.find((option) => option.value === value)?.label ?? value;
}

function getNodeLabel(language: Language, node: QueryNode): string {
  const specs = getQueryFieldSpecs(language);
  if (node.kind === "group") {
    return node.op.toUpperCase();
  }
  const spec = specs.find((item) => item.field === node.field);
  const fieldLabel = spec?.label ?? node.field;
  return `${fieldLabel} ${getOperatorLabel(node.operator)} ${getTermDisplayValue(spec, node.value)}`;
}

function cloneQueryAst(ast: QueryAst): QueryAst {
  return JSON.parse(JSON.stringify(ast)) as QueryAst;
}

function getGroupByPath(ast: QueryAst, path: number[]): QueryGroupNode {
  let current: QueryNode = ast;
  for (const index of path) {
    if (current.kind !== "group") {
      throw new Error("Invalid query group path");
    }
    const next: QueryNode | undefined = current.children[index];
    if (!next) {
      throw new Error("Query group path is out of range");
    }
    current = next;
  }
  if (current.kind !== "group") {
    throw new Error("Expected query group at path");
  }
  return current;
}

function updateAstGroup(
  ast: QueryAst,
  path: number[],
  mutate: (group: QueryGroupNode) => void
): QueryAst {
  const next = cloneQueryAst(ast);
  mutate(getGroupByPath(next, path));
  return next;
}

function removeNodeAtPath(ast: QueryAst, path: number[]): QueryAst {
  if (path.length === 0) {
    return createEmptyQueryAst();
  }
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  if (index === undefined) {
    return createEmptyQueryAst();
  }
  return updateAstGroup(ast, parentPath, (group) => {
    group.children.splice(index, 1);
  });
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden")
  );
}

function useDialogBehavior(props: {
  open: boolean;
  rootRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { open, rootRef, initialFocusRef, onClose } = props;
  const previousActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTarget = initialFocusRef.current;
    if (focusTarget) {
      focusTarget.focus();
    } else if (rootRef.current) {
      const focusables = getFocusableElements(rootRef.current);
      focusables[0]?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!rootRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusables = getFocusableElements(rootRef.current);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveRef.current?.focus();
    };
  }, [initialFocusRef, onClose, open, rootRef]);
}

function createPromptPresets(language: Language): PromptPreset[] {
  const copy = dictionaries[language];
  return [
    {
      label: copy.workspace.promptOne,
      params: { minDependents: "5", sort: "dependents", order: "desc" }
    },
    {
      label: copy.workspace.promptTwo,
      params: { momentum: "Rising", sort: "growth", order: "desc" }
    },
    {
      label: copy.workspace.promptThree,
      params: { minScore: "180", hasRepository: "true", sort: "score", order: "desc" }
    }
  ];
}

function pickLeadMetric(language: Language, item: PackageSummary): { label: string; value: string } {
  const copy = dictionaries[language];
  return { label: copy.detail.score, value: formatDecimal(language, item.score) };
}

function SelectMenu<T extends string>(props: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  icon?: ReactNode;
  align?: "start" | "end";
}) {
  const { label, value, options, onChange, icon, align = "start" } = props;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => {
    const selected = options.findIndex((option) => option.value === value);
    return selected >= 0 ? selected : 0;
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelId = useId();
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectedIndex = options.findIndex((option) => option.value === value);
  const panelStyleRef = useRef<{ top: number; left: number; minWidth: number } | null>(null);
  const [panelStyle, setPanelStyle] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    const updatePanelPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const minWidth = Math.max(rect.width, 220);
      const left = align === "end" ? rect.right - minWidth : rect.left;
      const nextStyle = {
        top: rect.bottom + 8,
        left: Math.max(12, left),
        minWidth
      };
      const previous = panelStyleRef.current;
      if (
        previous &&
        previous.top === nextStyle.top &&
        previous.left === nextStyle.left &&
        previous.minWidth === nextStyle.minWidth
      ) {
        return;
      }
      panelStyleRef.current = nextStyle;
      setPanelStyle(nextStyle);
    };

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [align, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % options.length);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + options.length) % options.length);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const next = options[activeIndex];
        if (next) {
          onChange(next.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, onChange, open, options]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    if (selectedIndex >= 0 && selectedIndex !== activeIndex) {
      setActiveIndex(selectedIndex);
    }
  }, [activeIndex, open, selectedIndex]);

  useEffect(() => {
    if (open) return;
    const fallbackIndex = selectedIndex >= 0 ? selectedIndex : 0;
    if (fallbackIndex !== activeIndex) {
      setActiveIndex(fallbackIndex);
    }
  }, [activeIndex, open, selectedIndex]);

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className={`select-menu select-menu--${align}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="control-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        {icon}
        <span className="control-select__value">{selectedOption?.label ?? label}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && panelStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              id={panelId}
              ref={panelRef}
              className="select-menu__panel"
              role="listbox"
              aria-label={label}
              style={{
                position: "fixed",
                top: panelStyle.top,
                left: panelStyle.left,
                minWidth: panelStyle.minWidth
              }}
            >
              {options.map((option, index) => (
                <button
                  key={option.value}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`select-menu__option${option.value === value ? " is-selected" : ""}${index === activeIndex ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.hint ? <small>{option.hint}</small> : null}
                  </span>
                  {option.value === value ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function ThemeSwitcher(props: {
  language: Language;
  preference: ThemePreference;
  resolvedTheme: "light" | "dark";
  onChange: (value: ThemePreference) => void;
}) {
  const { language, preference, resolvedTheme, onChange } = props;
  const copy = dictionaries[language];
  const icon = resolvedTheme === "dark" ? <SunMedium size={16} strokeWidth={2} aria-hidden="true" /> : <MoonStar size={16} strokeWidth={2} aria-hidden="true" />;

  const options = useMemo<SelectOption<ThemePreference>[]>(
    () => [
      { value: "system", label: copy.toolbar.themeSystem },
      { value: "light", label: copy.toolbar.themeLight },
      { value: "dark", label: copy.toolbar.themeDark }
    ],
    [copy.toolbar.themeDark, copy.toolbar.themeLight, copy.toolbar.themeSystem]
  );

  return <SelectMenu label={copy.common.theme} value={preference} options={options} onChange={onChange} icon={icon} align="end" />;
}

function LanguageSwitcher(props: { language: Language; onChange: (language: Language) => void }) {
  const { language, onChange } = props;
  const options = useMemo<SelectOption<Language>[]>(
    () => [
      { value: "zh-CN", label: "中文" },
      { value: "ja-JP", label: "日本語" },
      { value: "en-US", label: "English" }
    ],
    []
  );

  return <SelectMenu label={dictionaries[language].common.language} value={language} options={options} onChange={onChange} icon={<Globe size={16} strokeWidth={2} aria-hidden="true" />} align="end" />;
}

function SourceTabs(props: {
  language: Language;
  currentSource: FeedSource | null;
  onSelectSource: (source: FeedSource) => void;
}) {
  const { language, currentSource, onSelectSource } = props;
  const copy = dictionaries[language];

  return (
    <div className="segmented" role="tablist" aria-label={copy.workspace.feedSwitcher}>
      <button type="button" className={`segmented__item${currentSource === "top" ? " is-active" : ""}`} onClick={() => onSelectSource("top")}>
        {copy.workspace.topFeed}
      </button>
      <button type="button" className={`segmented__item${currentSource === "hot" ? " is-active" : ""}`} onClick={() => onSelectSource("hot")}>
        {copy.workspace.hotFeed}
      </button>
      <button type="button" className={`segmented__item${currentSource === "rising" ? " is-active" : ""}`} onClick={() => onSelectSource("rising")}>
        {copy.workspace.risingFeed}
      </button>
    </div>
  );
}

function Masthead(props: {
  page: "landing" | "search" | "advanced-search";
  language: Language;
  themePreference: ThemePreference;
  resolvedTheme: "light" | "dark";
  onLanguageChange: (language: Language) => void;
  onThemeChange: (value: ThemePreference) => void;
  onNavigate: (href: "/" | "/search" | "/advanced-search") => void;
}) {
  const { page, language, themePreference, resolvedTheme, onLanguageChange, onThemeChange, onNavigate } = props;
  const copy = dictionaries[language];

  return (
    <header className="masthead">
      <button type="button" className="masthead__brand" onClick={() => onNavigate("/")}>
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <strong>{copy.toolbar.projectLabel}</strong>
          <small>{copy.toolbar.projectCaption}</small>
        </div>
      </button>
      <nav className="masthead__nav" aria-label={copy.toolbar.primaryNav}>
        <button type="button" className={`nav-link${page === "landing" ? " is-active" : ""}`} onClick={() => onNavigate("/")}>
          {copy.toolbar.home}
        </button>
        <button type="button" className={`nav-link${page === "search" ? " is-active" : ""}`} onClick={() => onNavigate("/search")}>
          {copy.toolbar.searchPage}
        </button>
        <button type="button" className={`nav-link${page === "advanced-search" ? " is-active" : ""}`} onClick={() => onNavigate("/advanced-search")}>
          {copy.toolbar.advancedSearchPage}
        </button>
      </nav>
      <div className="masthead__controls">
        <ThemeSwitcher language={language} preference={themePreference} resolvedTheme={resolvedTheme} onChange={onThemeChange} />
        <LanguageSwitcher language={language} onChange={onLanguageChange} />
      </div>
    </header>
  );
}

function ImpactMetricCard(props: { title: string; body: string }) {
  const { title, body } = props;
  return (
    <article className="metric-block">
      <span className="metric-block__index" aria-hidden="true" />
      <strong>{title}</strong>
      <p>{body}</p>
    </article>
  );
}

function LandingSampleCard(props: {
  language: Language;
  item: PackageSummary;
  onOpen: () => void;
}) {
  const { language, item, onOpen } = props;
  const copy = dictionaries[language];
  return (
    <button type="button" className="sample-card" onClick={onOpen}>
      <div className="sample-card__head">
        <strong>{item.full_name}</strong>
        <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
      </div>
      <p>{item.description ?? copy.common.noDescription}</p>
      <dl className="sample-card__meta">
        <div>
          <dt>{copy.detail.score}</dt>
          <dd>{formatDecimal(language, item.score)}</dd>
        </div>
        <div>
          <dt>{copy.detail.dependentsMetric}</dt>
          <dd>{formatNumber(language, item.dependent_count)}</dd>
        </div>
      </dl>
    </button>
  );
}

function LandingScreen(props: {
  language: Language;
  items: PackageSummary[];
  onOpenSearch: () => void;
  onBrowseTop: () => void;
  onOpenPackage: (item: PackageSummary) => void;
}) {
  const { language, items, onOpenSearch, onBrowseTop, onOpenPackage } = props;
  const copy = dictionaries[language];
  const rootRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      if (shouldReduceMotion()) return;
      gsap.from(".landing-hero__content", { y: 18, autoAlpha: 0, duration: 0.35, ease: "power2.out" });
      gsap.from(".landing-hero__annotation", { y: 12, autoAlpha: 0, duration: 0.24, delay: 0.08, ease: "power2.out" });
      gsap.from(".landing-narrative__lead", { y: 12, autoAlpha: 0, duration: 0.24, delay: 0.12, ease: "power2.out" });
      gsap.from(".metric-block", { y: 14, autoAlpha: 0, duration: 0.24, stagger: 0.05, delay: 0.08, ease: "power2.out" });
      gsap.from(".sample-card", { y: 12, autoAlpha: 0, duration: 0.22, stagger: 0.04, delay: 0.14, ease: "power2.out" });
    },
    { scope: rootRef }
  );

  return (
    <section className="screen screen--landing" ref={rootRef}>
      <section className="landing-hero">
        <div className="landing-hero__content">
          <p className="eyebrow">{copy.landing.eyebrow}</p>
          <h1>{copy.landing.title}</h1>
          <p className="landing-hero__lede">{copy.landing.subtitle}</p>
          <div className="landing-hero__actions">
            <button type="button" className="button button--primary" onClick={onOpenSearch}>
              {copy.landing.primaryAction}
            </button>
            <button type="button" className="button button--secondary" onClick={onBrowseTop}>
              {copy.landing.secondaryAction}
            </button>
          </div>
        </div>
        <div className="landing-hero__annotation">
          <div className="section-label">{copy.landing.methodsTitle}</div>
          <p>{copy.landing.methodsBody}</p>
        </div>
      </section>

      <section className="landing-narrative">
        <div className="landing-narrative__lead">
          <p className="eyebrow">{copy.landing.valueTitle}</p>
          <h2>{copy.landing.valueBody}</h2>
        </div>
        <div className="landing-narrative__aside">
          <div className="section-label">{copy.landing.qualityTitle}</div>
          <p>{copy.landing.qualityBody}</p>
        </div>
      </section>

      <section className="signal-story">
        <div className="signal-story__grid">
          <ImpactMetricCard title={copy.landing.metricOneTitle} body={copy.landing.metricOneBody} />
          <ImpactMetricCard title={copy.landing.metricTwoTitle} body={copy.landing.metricTwoBody} />
          <ImpactMetricCard title={copy.landing.metricThreeTitle} body={copy.landing.metricThreeBody} />
          <ImpactMetricCard title={copy.landing.metricFourTitle} body={copy.landing.metricFourBody} />
        </div>
      </section>

      <section className="sample-stage">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{copy.landing.sampleTitle}</p>
            <h2>{copy.landing.sampleBody}</h2>
          </div>
          <button type="button" className="text-link" onClick={onOpenSearch}>
            {copy.landing.viewAll}
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="sample-grid">
          {items.slice(0, 3).map((item) => (
            <LandingSampleCard key={item.full_name} language={language} item={item} onOpen={() => onOpenPackage(item)} />
          ))}
        </div>
      </section>
    </section>
  );
}

function SearchHero(props: {
  language: Language;
  params: AdvancedSearchParams;
  onChange: (params: AdvancedSearchParams) => void;
  onSubmit: () => Promise<void>;
  onApplyPrompt: (params: Partial<AdvancedSearchParams>) => Promise<void>;
  onOpenFeed: (source: FeedSource) => Promise<void>;
  onOpenAdvancedSearch: () => void;
}) {
  const { language, params, onChange, onSubmit, onApplyPrompt, onOpenFeed, onOpenAdvancedSearch } = props;
  const copy = dictionaries[language];
  const promptPresets = createPromptPresets(language);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSubmit();
  }

  return (
    <section className="screen screen--search-home">
      <div className="search-home">
        <p className="eyebrow">{copy.workspace.emptySearchTitle}</p>
        <h1>{copy.workspace.emptySearchBody}</h1>
        <form className="search-home__form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="search-field search-field--hero">
            <Search size={18} strokeWidth={2} aria-hidden="true" />
            <span className="sr-only">{copy.common.search}</span>
            <input
              aria-label={copy.common.search}
              type="search"
              value={params.q || params.expr}
              placeholder={copy.toolbar.searchPlaceholder}
              onChange={(event) => onChange(applyLegacyPatch(params, { q: event.target.value }))}
            />
          </label>
          <button type="submit" className="button button--primary">{copy.common.search}</button>
        </form>

        <div className="search-home__prompts">
          <div className="section-label">{copy.workspace.promptTitle}</div>
          <div className="prompt-grid">
            {promptPresets.map((prompt) => (
              <button key={prompt.label} type="button" className="prompt-chip" onClick={() => void onApplyPrompt(prompt.params)}>
                {prompt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="search-home__browse">
          <div className="section-label">{copy.workspace.browseTitle}</div>
          <div className="search-home__actions">
            <button type="button" className="button button--secondary" onClick={() => void onOpenFeed("top")}>{copy.workspace.topFeed}</button>
            <button type="button" className="button button--secondary" onClick={() => void onOpenFeed("hot")}>{copy.workspace.hotFeed}</button>
            <button type="button" className="button button--secondary" onClick={() => void onOpenFeed("rising")}>{copy.workspace.risingFeed}</button>
            <button type="button" className="button button--secondary" onClick={onOpenAdvancedSearch}>{copy.toolbar.advancedSearchPage}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SearchControlRail(props: {
  language: Language;
  currentSource: FeedSource | null;
  params: AdvancedSearchParams;
  onChange: (params: AdvancedSearchParams) => void;
  onSubmit: () => Promise<void>;
  onSelectSource: (source: FeedSource) => void;
  onOpenAdvanced: () => void;
  onOpenAdvancedSearch: () => void;
  onReset: () => void;
}) {
  const { language, currentSource, params, onChange, onSubmit, onSelectSource, onOpenAdvanced, onOpenAdvancedSearch, onReset } = props;
  const copy = dictionaries[language];
  const rankOptions = useMemo<SelectOption<SearchRank>[]>(
    () => [
      { value: "", label: copy.filters.any },
      { value: "S", label: "S" },
      { value: "A", label: "A" },
      { value: "B", label: "B" },
      { value: "C", label: "C" },
      { value: "D", label: "D" }
    ],
    [copy.filters.any]
  );
  const momentumOptions = useMemo<SelectOption<SearchMomentum>[]>(
    () => [
      { value: "", label: copy.filters.any },
      { value: "Hot", label: copy.filters.momentumHot },
      { value: "Rising", label: copy.filters.momentumRising },
      { value: "Stable", label: copy.filters.momentumStable }
    ],
    [copy.filters.any, copy.filters.momentumHot, copy.filters.momentumRising, copy.filters.momentumStable]
  );
  const sortOptions = useMemo<SelectOption<SearchSort | "">[]>(
    () => [
      { value: "", label: copy.filters.any },
      { value: "relevance", label: copy.filters.sortRelevance },
      { value: "score", label: copy.filters.sortScore },
      { value: "growth", label: copy.filters.sortGrowth },
      { value: "downloads", label: copy.filters.sortDownloads },
      { value: "dependents", label: copy.filters.sortDependents },
      { value: "recent", label: copy.filters.sortRecent },
      { value: "updated", label: copy.filters.sortUpdated },
      { value: "name", label: copy.filters.sortName }
    ],
    [copy.filters.any, copy.filters.sortDependents, copy.filters.sortDownloads, copy.filters.sortGrowth, copy.filters.sortName, copy.filters.sortRecent, copy.filters.sortRelevance, copy.filters.sortScore, copy.filters.sortUpdated]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSubmit();
  }

  return (
    <section className="query-stage">
      <div className="query-stage__header">
        <div>
          <p className="eyebrow">{copy.filters.quickFilters}</p>
          <h2>{copy.workspace.queryTitle}</h2>
          <p>{copy.workspace.queryBody}</p>
        </div>
        <SourceTabs language={language} currentSource={currentSource} onSelectSource={onSelectSource} />
      </div>

      <form className="query-stage__form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="query-stage__main">
          <label className="search-field">
            <Search size={18} strokeWidth={2} aria-hidden="true" />
            <span className="sr-only">{copy.common.search}</span>
            <input
              aria-label={copy.common.search}
              type="search"
              value={params.q || params.expr}
              placeholder={copy.toolbar.searchPlaceholder}
              onChange={(event) => onChange(applyLegacyPatch(params, { q: event.target.value }))}
            />
          </label>
          <button type="submit" className="button button--primary">{copy.common.search}</button>
        </div>

        <div className="query-stage__filters">
          <div className="facet-control query-stage__filter-select">
            <span>{copy.filters.rank}</span>
            <SelectMenu label={copy.filters.rank} value={params.rank} options={rankOptions} onChange={(value) => onChange(applyLegacyPatch(params, { rank: value }))} />
          </div>
          <div className="facet-control query-stage__filter-select">
            <span>{copy.filters.momentum}</span>
            <SelectMenu label={copy.filters.momentum} value={params.momentum} options={momentumOptions} onChange={(value) => onChange(applyLegacyPatch(params, { momentum: value }))} />
          </div>
          <div className="facet-control query-stage__filter-select">
            <span>{copy.filters.sort}</span>
            <SelectMenu label={copy.filters.sort} value={params.sort} options={sortOptions} onChange={(value) => onChange({ ...params, sort: value })} />
          </div>
          <label className="facet-control">
            <span>{copy.filters.minScore}</span>
            <input inputMode="decimal" value={params.minScore} onChange={(event) => onChange(applyLegacyPatch(params, { minScore: event.target.value }))} />
          </label>
          <label className="facet-control">
            <span>{copy.filters.minDependents}</span>
            <input inputMode="numeric" value={params.minDependents} onChange={(event) => onChange(applyLegacyPatch(params, { minDependents: event.target.value }))} />
          </label>
        </div>

        <div className="query-stage__footer">
          <button type="button" className="text-link" onClick={onReset}>{copy.workspace.clearFilters}</button>
          <div className="query-stage__footer-actions">
            <button type="button" className="button button--secondary button--compact" onClick={onOpenAdvancedSearch}>
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
              <span>{copy.toolbar.advancedSearchPage}</span>
            </button>
            <button type="button" className="button button--secondary button--compact" onClick={onOpenAdvanced}>
              <SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" />
              <span>{copy.filters.moreFilters}</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function ResultCard(props: {
  language: Language;
  item: PackageSummary;
  active: boolean;
  onClick: () => void;
}) {
  const { language, item, active, onClick } = props;
  const copy = dictionaries[language];
  const leadMetric = pickLeadMetric(language, item);

  return (
    <button type="button" className={`result-card${active ? " is-active" : ""}`} onClick={onClick}>
      <div className="result-card__lead">
        <span>{leadMetric.label}</span>
        <strong>{leadMetric.value}</strong>
      </div>
      <div className="result-card__body">
        <div className="result-card__title">
          <div>
            <strong>{item.full_name}</strong>
            <p>{item.description ?? copy.common.noDescription}</p>
          </div>
          <div className="result-badges" aria-label={copy.workspace.statusBadges}>
            <span className="badge">{item.rank_label}</span>
            <span className="badge badge--accent">{getStatusLabel(copy, item.momentum_label)}</span>
          </div>
        </div>
        <dl className="metric-grid">
          <div>
            <dt>{copy.detail.score}</dt>
            <dd>{formatDecimal(language, item.score)}</dd>
          </div>
          <div>
            <dt>{copy.detail.scoreGrowth}</dt>
            <dd>{formatDecimal(language, item.score_growth_30d)}</dd>
          </div>
          <div>
            <dt>{copy.detail.dependentsMetric}</dt>
            <dd>{formatNumber(language, item.dependent_count)}</dd>
          </div>
          <div>
            <dt>{copy.detail.downloads}</dt>
            <dd>{formatNumber(language, item.download_count)}</dd>
          </div>
        </dl>
      </div>
    </button>
  );
}

function DetailContent(props: { language: Language; state: DetailState; onRetry: () => Promise<void> }) {
  const { language, state, onRetry } = props;
  const copy = dictionaries[language];

  if (state.status === "loading") {
    return (
      <div className="analysis-state">
        <strong>{copy.detail.loadingTitle}</strong>
        <p>{copy.detail.loading}</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="analysis-state">
        <strong>{copy.detail.errorTitle}</strong>
        <p>{state.errorMessage}</p>
        <button type="button" className="button button--primary" onClick={() => void onRetry()}>{copy.workspace.retry}</button>
      </div>
    );
  }

  if (state.status === "closed") {
    return (
      <div className="analysis-state">
        <strong>{copy.detail.idleTitle}</strong>
        <p>{copy.detail.idleBody}</p>
      </div>
    );
  }

  const pkg = state.detail;
  if (!pkg) return null;

  return (
    <div className="analysis-content">
      <header className="analysis-content__header">
        <div>
          <h2>{pkg.full_name}</h2>
          <p>{pkg.description ?? copy.common.noDescription}</p>
        </div>
        <div className="result-badges">
          <span className="badge">{pkg.rank_label}</span>
          <span className="badge badge--accent">{getStatusLabel(copy, pkg.momentum_label)}</span>
        </div>
      </header>

      <dl className="analysis-metrics">
        <div>
          <dt>{copy.detail.score}</dt>
          <dd>{formatDecimal(language, pkg.score)}</dd>
        </div>
        <div>
          <dt>{copy.detail.scoreGrowth}</dt>
          <dd>{formatDecimal(language, pkg.score_growth_30d)}</dd>
        </div>
        <div>
          <dt>{copy.detail.dependentsMetric}</dt>
          <dd>{formatNumber(language, pkg.dependent_count)}</dd>
        </div>
        <div>
          <dt>{copy.detail.downloads}</dt>
          <dd>{formatNumber(language, pkg.download_count)}</dd>
        </div>
      </dl>

      <section className="analysis-section">
        <div className="analysis-section__head">
          <h3>{copy.detail.packageMeta}</h3>
          {pkg.repository ? (
            <a href={pkg.repository} target="_blank" rel="noreferrer" className="text-link">
              {copy.detail.repository}
            </a>
          ) : null}
        </div>
        <dl className="analysis-meta">
          <div>
            <dt>{copy.detail.latest}</dt>
            <dd>{pkg.latest_version ?? copy.common.unknown}</dd>
          </div>
          <div>
            <dt>{copy.detail.license}</dt>
            <dd>{pkg.license ?? copy.common.unknown}</dd>
          </div>
          <div>
            <dt>{copy.detail.versions}</dt>
            <dd>{formatNumber(language, pkg.version_count)}</dd>
          </div>
          <div>
            <dt>{copy.detail.recentDependents}</dt>
            <dd>{formatNumber(language, pkg.recent_dependent_count)}</dd>
          </div>
          <div>
            <dt>{copy.detail.released}</dt>
            <dd>{formatDate(language, pkg.latest_created_at)}</dd>
          </div>
        </dl>
      </section>

      <section className="analysis-section">
        <h3>{copy.detail.keywords}</h3>
        <div className="pill-list">
          {pkg.keywords.length > 0 ? pkg.keywords.map((keyword) => <span key={keyword} className="pill">{keyword}</span>) : <span className="pill pill--muted">{copy.detail.noKeywords}</span>}
        </div>
      </section>

      <section className="analysis-section">
        <h3>{copy.detail.dependents}</h3>
        <div className="dependent-list">
          {state.dependents.length > 0 ? (
            state.dependents.map((item) => (
              <article key={item.full_name} className="dependent-card">
                <div className="dependent-card__head">
                  <strong>{item.full_name}</strong>
                  <div className="result-badges">
                    <span className="badge">{item.rank_label}</span>
                    <span className="badge badge--accent">{getStatusLabel(copy, item.momentum_label)}</span>
                  </div>
                </div>
                <p>{item.description ?? copy.common.noDescription}</p>
              </article>
            ))
          ) : (
            <div className="analysis-state analysis-state--compact">
              <p>{copy.detail.noDependents}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function WorkspaceScreen(props: {
  language: Language;
  currentSource: FeedSource | null;
  state: SearchState;
  selectedFullName: string | null;
  params: AdvancedSearchParams;
  onBack: () => void;
  onChangeParams: (params: AdvancedSearchParams) => void;
  onSubmit: () => Promise<void>;
  onSelectSource: (source: FeedSource) => void;
  onOpenAdvanced: () => void;
  onOpenAdvancedSearch: () => void;
  onReset: () => void;
  onSelect: (fullName: string) => void;
  onRetry: () => Promise<void>;
  detailState: DetailState;
  onRetryDetail: () => Promise<void>;
}) {
  const {
    language,
    currentSource,
    state,
    selectedFullName,
    params,
    onBack,
    onChangeParams,
    onSubmit,
    onSelectSource,
    onOpenAdvanced,
    onOpenAdvancedSearch,
    onReset,
    onSelect,
    onRetry,
    detailState,
    onRetryDetail
  } = props;
  const copy = dictionaries[language];
  const rootRef = useRef<HTMLElement | null>(null);
  const filterSummary = state.mode === "idle" ? [] : buildFilterSummary(language, state.appliedParams);

  useGSAP(
    () => {
      if (shouldReduceMotion()) return;
      gsap.from(".workspace-overview", { y: 10, autoAlpha: 0, duration: 0.22, ease: "power2.out" });
      gsap.from(".result-card", { y: 8, autoAlpha: 0, stagger: 0.025, duration: 0.18, ease: "power2.out" });
      gsap.from(".analysis-pane__inner", { x: 10, autoAlpha: 0, duration: 0.24, delay: 0.08, ease: "power2.out" });
    },
    { scope: rootRef, dependencies: [state.status, state.items.length, selectedFullName], revertOnUpdate: true }
  );

  const sourceLabel = getSourceCopy(language, state.activeSource);
  const resultCount = state.mode === "idle" ? 0 : state.items.length;

  return (
    <section className="screen screen--workspace" ref={rootRef}>
      <div className="workspace-shell">
        <div className="workspace-stream">
          <section className="workspace-overview">
            <div className="workspace-overview__copy">
              <button type="button" className="text-link" onClick={onBack}>{copy.workspace.back}</button>
              <p className="eyebrow">{copy.workspace.resultsLabel}</p>
              <h1>{sourceLabel}</h1>
              <p>{copy.workspace.summaryTemplate.replace("{count}", formatNumber(language, resultCount))}</p>
            </div>
            <div className="workspace-overview__chips">
              <span className="chip chip--strong">{copy.workspace.sourceLabel}: {sourceLabel}</span>
              {filterSummary.length > 0 ? filterSummary.map((chip) => <span key={chip} className="chip">{chip}</span>) : <span className="chip">{copy.workspace.noFilters}</span>}
            </div>
          </section>

          <SearchControlRail
            language={language}
            currentSource={currentSource}
            params={params}
            onChange={onChangeParams}
            onSubmit={onSubmit}
            onSelectSource={onSelectSource}
            onOpenAdvanced={onOpenAdvanced}
            onOpenAdvancedSearch={onOpenAdvancedSearch}
            onReset={onReset}
          />

          <section className="workspace-results" aria-live="polite">
            {state.status === "loading" ? (
              <div className="state-card">
                <strong>{copy.workspace.loadingTitle}</strong>
                <p>{copy.workspace.loading}</p>
              </div>
            ) : state.status === "error" ? (
              <div className="state-card">
                <strong>{copy.workspace.errorTitle}</strong>
                <p>{state.errorMessage}</p>
                <div className="state-card__actions">
                  <button type="button" className="button button--primary" onClick={() => void onRetry()}>{copy.workspace.retry}</button>
                  <button type="button" className="button button--secondary" onClick={onBack}>{copy.workspace.back}</button>
                </div>
              </div>
            ) : state.items.length === 0 ? (
              <div className="state-card">
                <strong>{copy.workspace.emptyTitle}</strong>
                <p>{copy.workspace.noResults}</p>
              </div>
            ) : (
              <div className="result-list">
                {state.items.map((item) => (
                  <ResultCard
                    key={item.full_name}
                    language={language}
                    item={item}
                    active={selectedFullName === item.full_name}
                    onClick={() => onSelect(item.full_name)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="analysis-pane">
          <div className="analysis-pane__inner">
            <div className="analysis-pane__head">
              <div>
                <p className="eyebrow">{copy.workspace.analysisLabel}</p>
                <h2>{copy.detail.title}</h2>
                <p>{copy.workspace.analysisBody}</p>
              </div>
            </div>
            <DetailContent language={language} state={detailState} onRetry={onRetryDetail} />
          </div>
        </aside>
      </div>
    </section>
  );
}

function QueryTermEditor(props: {
  language: Language;
  term: QueryTermNode;
  specs: QueryFieldSpec[];
  onChange: (term: QueryTermNode) => void;
  onRemove: () => void;
}) {
  const { language, term, specs, onChange, onRemove } = props;
  const copy = dictionaries[language];
  const fieldOptions = useMemo<SelectOption<QueryTermField>[]>(
    () => specs.map((spec) => ({ value: spec.field, label: spec.label })),
    [specs]
  );
  const spec = specs.find((item) => item.field === term.field) ?? specs[0]!;
  const normalizedTerm = normalizeTermAgainstSpec(term, spec);
  const operatorOptions = spec.operators.map((operator) => ({
    value: operator,
    label: getOperatorLabel(operator)
  }));
  const showOperator = spec.operators.length > 1;

  function updateField(field: QueryTermField): void {
    const nextSpec = specs.find((item) => item.field === field) ?? specs[0]!;
    onChange(
      normalizeTermAgainstSpec(
        {
          ...normalizedTerm,
          field,
          operator: getDefaultOperatorForField(nextSpec),
          value: getDefaultValueForField(nextSpec)
        },
        nextSpec
      )
    );
  }

  return (
    <div className={`query-node query-node--term${normalizedTerm.negated === true ? " is-excluded" : ""}`}>
      <div className="query-node__header">
        <strong>{getNodeLabel(language, normalizedTerm)}</strong>
        <button type="button" className="text-link" onClick={onRemove}>{copy.filters.remove}</button>
      </div>
      <div className={`query-term-grid${showOperator ? "" : " query-term-grid--compact"}`}>
        <div className="field-grid__control">
          <span>{copy.filters.field}</span>
          <SelectMenu label={copy.filters.field} value={normalizedTerm.field} options={fieldOptions} onChange={updateField} />
        </div>
        {showOperator ? (
          <div className="field-grid__control">
            <span>{copy.filters.operator}</span>
            <SelectMenu
              label={copy.filters.operator}
              value={normalizedTerm.operator}
              options={operatorOptions}
              onChange={(operator) => onChange({ ...normalizedTerm, operator })}
            />
          </div>
        ) : null}
        {spec.kind === "enum" || spec.kind === "boolean" ? (
          <div className="field-grid__control query-term-grid__value">
            <span>{copy.filters.value}</span>
            <SelectMenu
              label={copy.filters.value}
              value={normalizedTerm.value}
              options={(spec.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
              onChange={(value) => onChange({ ...normalizedTerm, value })}
            />
          </div>
        ) : (
          <label className="query-term-input query-term-grid__value">
            <span>{copy.filters.value}</span>
            <input
              inputMode={spec.kind === "number" ? "decimal" : undefined}
              value={normalizedTerm.value}
              placeholder={spec.placeholder ?? ""}
              onChange={(event) => onChange({ ...normalizedTerm, value: event.target.value })}
            />
          </label>
        )}
        <button
          type="button"
          className={`button button--secondary query-builder-button query-toggle-button query-term-grid__toggle${normalizedTerm.negated === true ? " is-active" : ""}`}
          aria-pressed={normalizedTerm.negated === true}
          onClick={() => onChange({ ...normalizedTerm, negated: normalizedTerm.negated !== true })}
        >
          {normalizedTerm.negated === true ? copy.filters.include : copy.filters.exclude}
        </button>
      </div>
    </div>
  );
}

function QueryGroupEditor(props: {
  language: Language;
  group: QueryGroupNode;
  path: number[];
  specs: QueryFieldSpec[];
  isRoot?: boolean;
  onChangeAst: (ast: QueryAst) => void;
  ast: QueryAst;
}) {
  const { language, group, path, specs, isRoot = false, onChangeAst, ast } = props;
  const copy = dictionaries[language];

  const logicOptions: SelectOption<QueryGroupOperator>[] = [
    { value: "and", label: copy.filters.logicAnd },
    { value: "or", label: copy.filters.logicOr }
  ];

  function patchGroup(mutate: (target: QueryGroupNode) => void): void {
    onChangeAst(updateAstGroup(ast, path, mutate));
  }

  return (
    <section className={`query-node query-node--group${isRoot ? " is-root" : ""}${group.negated === true ? " is-excluded" : ""}`}>
      <div className="query-node__header">
        <strong>{isRoot ? copy.filters.builderTitle : copy.filters.groupTitle}</strong>
        <div className="query-node__actions">
          {!isRoot ? (
            <button type="button" className="text-link" onClick={() => onChangeAst(removeNodeAtPath(ast, path))}>
              {copy.filters.remove}
            </button>
          ) : null}
          <button type="button" className="button button--secondary button--compact query-builder-button" onClick={() => patchGroup((target) => target.children.push(createDefaultTerm()))}>
            {copy.filters.addCondition}
          </button>
          <button
            type="button"
            className="button button--secondary button--compact query-builder-button"
            onClick={() => patchGroup((target) => target.children.push({ kind: "group", op: "and", children: [createDefaultTerm()] }))}
          >
            {copy.filters.addGroup}
          </button>
        </div>
      </div>
      <div className="query-group__toolbar">
        <div className="field-grid__control query-group__logic">
          <span>{copy.filters.logic}</span>
          <SelectMenu label={copy.filters.logic} value={group.op} options={logicOptions} onChange={(op) => patchGroup((target) => { target.op = op; })} />
        </div>
        {!isRoot ? (
          <button
            type="button"
            className={`button button--secondary query-builder-button query-toggle-button query-group__toggle${group.negated === true ? " is-active" : ""}`}
            aria-pressed={group.negated === true}
            onClick={() => patchGroup((target) => { target.negated = target.negated !== true; })}
          >
            {group.negated === true ? copy.filters.includeGroup : copy.filters.excludeGroup}
          </button>
        ) : null}
      </div>
      <div className="query-group__children">
        {group.children.length === 0 ? <div className="state-card state-card--compact"><p>{copy.filters.emptyBuilder}</p></div> : null}
        {group.children.map((child, index) => {
          const childPath = [...path, index];
          return child.kind === "group" ? (
            <QueryGroupEditor
              key={childPath.join(".")}
              language={language}
              group={child}
              path={childPath}
              specs={specs}
              ast={ast}
              onChangeAst={onChangeAst}
            />
          ) : (
            <QueryTermEditor
              key={childPath.join(".")}
              language={language}
              term={child}
              specs={specs}
              onChange={(term) => {
                onChangeAst(
                  updateAstGroup(ast, path, (target) => {
                    target.children[index] = term;
                  })
                );
              }}
              onRemove={() => onChangeAst(removeNodeAtPath(ast, childPath))}
            />
          );
        })}
      </div>
    </section>
  );
}

function AdvancedSearchPanel(props: {
  language: Language;
  params: AdvancedSearchParams;
  open: boolean;
  standalone?: boolean;
  onChange: (params: AdvancedSearchParams) => void;
  onApply: (params: AdvancedSearchParams) => Promise<void>;
  onReset: () => void;
  onClose: () => void;
}) {
  const { language, params, open, standalone = false, onChange, onApply, onReset, onClose } = props;
  const copy = dictionaries[language];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const specs = useMemo(() => getQueryFieldSpecs(language), [language]);
  const initialMode = params.expr.trim() && !params.ast.trim() ? "expression" : "builder";
  const [editorMode, setEditorMode] = useState<"builder" | "expression">(initialMode);
  const [draftAst, setDraftAst] = useState<QueryAst>(() => {
    const ast = deriveQueryAst(params);
    return hasQueryAstIntent(ast) ? ast : createInitialBuilderAst();
  });
  const [expressionText, setExpressionText] = useState(() => {
    const ast = deriveQueryAst(params);
    return params.expr.trim() || getExpressionPreview(ast);
  });
  const [expressionError, setExpressionError] = useState<string | null>(null);

  useDialogBehavior({ open: open && !standalone, rootRef, initialFocusRef: closeButtonRef, onClose });

  useGSAP(
    () => {
      if (!open || shouldReduceMotion()) return;
      gsap.fromTo(".advanced-dialog", { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.2, ease: "power2.out" });
    },
    { scope: rootRef, dependencies: [open], revertOnUpdate: true }
  );

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (editorMode === "expression") {
      try {
        const parsed = parseNativeExpression(expressionText);
        setExpressionError(null);
        const nextParams = hasQueryAstIntent(parsed) ? withQueryAst(params, parsed) : clearStructuredQuery(params);
        onChange(nextParams);
        await onApply(nextParams);
        return;
      } catch (error: unknown) {
        setExpressionError(copy.filters.expressionError);
        return;
      }
    }
    const nextParams = hasQueryAstIntent(draftAst) ? withQueryAst(params, draftAst) : clearStructuredQuery(params);
    onChange(nextParams);
    await onApply(nextParams);
  }

  useEffect(() => {
    const nextAst = deriveQueryAst(params);
    const normalizedAst = hasQueryAstIntent(nextAst) ? nextAst : createInitialBuilderAst();
    setDraftAst(normalizedAst);
    setExpressionText(params.expr.trim() || getExpressionPreview(nextAst));
    setEditorMode(params.expr.trim() && !params.ast.trim() ? "expression" : "builder");
    setExpressionError(null);
  }, [params]);

  const panelBody = (
    <form className="advanced-form advanced-form--builder" onSubmit={(event) => void handleSubmit(event)}>
      <div className="advanced-mode-switch">
        <button
          type="button"
          className={`nav-link${editorMode === "builder" ? " is-active" : ""}`}
          onClick={() => {
            setEditorMode("builder");
            setExpressionError(null);
          }}
        >
          {copy.filters.builderMode}
        </button>
        <button
          type="button"
          className={`nav-link${editorMode === "expression" ? " is-active" : ""}`}
          onClick={() => {
            setEditorMode("expression");
            setExpressionText(serializeQueryAst(draftAst));
            setExpressionError(null);
          }}
        >
          {copy.filters.expressionMode}
        </button>
      </div>

      {editorMode === "builder" ? (
        <div className="query-builder-shell">
          <QueryGroupEditor
            language={language}
            group={draftAst}
            path={[]}
            specs={specs}
            ast={draftAst}
            isRoot
          onChangeAst={(nextAst) => {
              setDraftAst(nextAst);
              setExpressionText(getExpressionPreview(nextAst));
            }}
          />
          <section className="field-section">
            <h3>{copy.filters.preview}</h3>
            <div className="query-expression-preview">{getExpressionPreview(draftAst)}</div>
          </section>
        </div>
      ) : (
        <section className="field-section">
          <h3>{copy.filters.expressionMode}</h3>
          <label className="query-expression-label">
            <span>{copy.filters.expressionHelp}</span>
            <textarea
              className="query-expression-editor"
              value={expressionText}
              onChange={(event) => {
                setExpressionText(event.target.value);
                setExpressionError(null);
              }}
            />
          </label>
          {expressionError ? <p className="query-expression-error">{expressionError}</p> : null}
        </section>
      )}

      <section className="field-section">
        <h3>{copy.filters.timeGroup}</h3>
        <div className="field-grid">
          <div className="field-grid__control">
            <span>{copy.filters.sort}</span>
            <SelectMenu
              label={copy.filters.sort}
              value={params.sort}
              options={[
                { value: "", label: copy.filters.any },
                { value: "relevance", label: copy.filters.sortRelevance },
                { value: "score", label: copy.filters.sortScore },
                { value: "growth", label: copy.filters.sortGrowth },
                { value: "downloads", label: copy.filters.sortDownloads },
                { value: "dependents", label: copy.filters.sortDependents },
                { value: "recent", label: copy.filters.sortRecent },
                { value: "updated", label: copy.filters.sortUpdated },
                { value: "name", label: copy.filters.sortName }
              ]}
              onChange={(value) => onChange({ ...params, sort: value })}
            />
          </div>
          <div className="field-grid__control">
            <span>{copy.filters.order}</span>
            <SelectMenu
              label={copy.filters.order}
              value={params.order}
              options={[
                { value: "", label: copy.filters.any },
                { value: "asc", label: copy.filters.orderAscending },
                { value: "desc", label: copy.filters.orderDescending }
              ]}
              onChange={(value) => onChange({ ...params, order: value })}
            />
          </div>
        </div>
      </section>

      <div className="advanced-form__actions">
        <button type="button" className="button button--secondary" onClick={onReset}>{copy.common.reset}</button>
        <button type="submit" className="button button--primary">{copy.common.apply}</button>
      </div>
    </form>
  );

  if (standalone) {
    return (
      <section className="screen screen--advanced-search">
        <section className="advanced-dialog advanced-dialog--standalone" ref={rootRef} aria-labelledby={titleId}>
          <div className="advanced-dialog__head">
            <div>
              <p className="eyebrow">{copy.filters.eyebrow}</p>
              <h2 id={titleId}>{copy.filters.title}</h2>
              <p>{copy.filters.subtitle}</p>
            </div>
          </div>
          {panelBody}
        </section>
      </section>
    );
  }

  return (
    <div className="dialog-shell">
      <button type="button" className="dialog-shell__backdrop" onClick={onClose} aria-label={copy.common.close} />
      <section className="advanced-dialog" ref={rootRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="advanced-dialog__head">
          <div>
            <p className="eyebrow">{copy.filters.eyebrow}</p>
            <h2 id={titleId}>{copy.filters.title}</h2>
            <p>{copy.filters.subtitle}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="button button--secondary" onClick={onClose}>{copy.common.close}</button>
        </div>
        {panelBody}
      </section>
    </div>
  );
}

export function App(props: AppProps) {
  const { initialTopPackages, initialView, initialSource = null } = props;
  const router = useRouter();
  const [landingItems, setLandingItems] = useState(initialTopPackages);
  const initialData = useMemo(
    () => {
      const data: AppInitialData = {
        initialView: props.initialView,
        dataMode: props.dataMode ?? "dynamic"
      };
      if (props.initialSearchParams) data.initialSearchParams = props.initialSearchParams;
      if (props.initialSource !== undefined) data.initialSource = props.initialSource;
      if (props.initialSearchItems) data.initialSearchItems = props.initialSearchItems;
      if (props.initialSearchError !== undefined) data.initialSearchError = props.initialSearchError;
      return data;
    },
    [props.initialSearchError, props.initialSearchItems, props.initialSearchParams, props.initialSource, props.initialView]
  );
  const { state, commands } = useAppController(initialData, router);
  const { language, themePreference, resolvedTheme } = state.preferences;
  const { search, detail } = state;

  function navigate(href: "/" | "/search" | "/advanced-search"): void {
    router.push(href);
  }

  function openAdvancedSearchPage(): void {
    if (search.mode === "search") {
      router.push(buildSearchHref(search.draftParams, null, "/advanced-search"));
      return;
    }

    router.push(buildSearchHref(normalizeSearchParams(DEFAULT_SEARCH_PARAMS), search.activeSource, "/advanced-search"));
  }

  function openLandingPackage(item: PackageSummary): void {
    router.push(buildSearchHref(normalizeSearchParams({ owner: item.owner, packageName: item.package_name })));
  }

  async function applyPrompt(params: Partial<AdvancedSearchParams>): Promise<void> {
    const next = normalizeSearchParams(params);
    commands.changeDraftParams(next);
    await commands.submitSearch(next);
  }

  useEffect(() => {
    document.title = dictionaries[language].appName;
  }, [language]);

  useEffect(() => {
    if ((props.dataMode ?? "dynamic") !== "static") return;
    if (initialView !== "landing") return;
    if (landingItems.length > 0) return;
    void fetchStaticFeed("top").then((items) => setLandingItems(items.slice(0, 12))).catch(() => setLandingItems([]));
  }, [initialView, landingItems.length, props.dataMode]);

  return (
    <main className="app-shell">
      <div className="page-background" aria-hidden="true">
        <span className="page-background__grid" />
      </div>

      <Masthead
        page={initialView}
        language={language}
        themePreference={themePreference}
        resolvedTheme={resolvedTheme}
        onLanguageChange={commands.changeLanguage}
        onThemeChange={commands.changeThemePreference}
        onNavigate={navigate}
      />

      <AdvancedSearchPanel
        language={language}
        params={search.draftParams}
        open={state.ui.advancedOpen || initialView === "advanced-search"}
        standalone={initialView === "advanced-search"}
        onChange={commands.changeDraftParams}
        onApply={(nextParams) => commands.submitSearch(nextParams, initialView === "advanced-search" ? "/advanced-search" : "/search")}
        onReset={
          initialView === "advanced-search"
            ? () => commands.clearSearchResults("/advanced-search")
            : commands.resetDraftParams
        }
        onClose={() => {
          if (initialView === "advanced-search") {
            navigate("/search");
            return;
          }
          commands.closeAdvanced();
        }}
      />

      {initialView === "landing" ? (
        <LandingScreen
          language={language}
          items={landingItems}
          onOpenSearch={() => navigate("/search")}
          onBrowseTop={() => router.push("/search?source=top")}
          onOpenPackage={openLandingPackage}
        />
      ) : search.status === "idle" ? (
        <SearchHero
          language={language}
          params={search.draftParams}
          onChange={commands.changeDraftParams}
          onSubmit={() => commands.submitSearch(search.draftParams, initialView === "advanced-search" ? "/advanced-search" : "/search")}
          onApplyPrompt={applyPrompt}
          onOpenFeed={(source) => commands.openFeed(source, initialView === "advanced-search" ? "/advanced-search" : "/search")}
          onOpenAdvancedSearch={openAdvancedSearchPage}
        />
      ) : (
        <WorkspaceScreen
          language={language}
          currentSource={search.activeSource}
          state={search}
          selectedFullName={detail.selectedFullName}
          params={search.draftParams}
          onBack={() => navigate("/")}
          onChangeParams={commands.changeDraftParams}
          onSubmit={() => commands.submitSearch(search.draftParams, initialView === "advanced-search" ? "/advanced-search" : "/search")}
          onSelectSource={(source) => void commands.openFeed(source, initialView === "advanced-search" ? "/advanced-search" : "/search")}
          onOpenAdvanced={commands.openAdvanced}
          onOpenAdvancedSearch={openAdvancedSearchPage}
          onReset={() => commands.clearSearchResults(initialView === "advanced-search" ? "/advanced-search" : "/search")}
          onSelect={(fullName) => void commands.selectPackage(fullName)}
          onRetry={() => commands.retryCurrentSearch(initialView === "advanced-search" ? "/advanced-search" : "/search")}
          detailState={detail}
          onRetryDetail={commands.retryDetail}
        />
      )}
    </main>
  );
}
