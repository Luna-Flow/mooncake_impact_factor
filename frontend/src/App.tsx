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
import type { PackageSummary } from "./types";

type AppProps = {
  initialTopPackages: PackageSummary[];
  initialView: AppView;
  initialSearchParams?: Partial<AdvancedSearchParams>;
  initialSource?: FeedSource | null;
  initialSearchItems?: PackageSummary[];
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

  if (params.q.trim()) chips.push(`${copy.workspace.queryLabel}: ${params.q.trim()}`);
  if (params.rank) chips.push(`${copy.filters.rank}: ${params.rank}`);
  if (params.momentum) chips.push(`${copy.filters.momentum}: ${params.momentum}`);
  if (params.minScore.trim()) chips.push(`${copy.filters.minScore}: ${params.minScore.trim()}`);
  if (params.minDependents.trim()) chips.push(`${copy.filters.minDependents}: ${params.minDependents.trim()}`);
  if (params.keyword.trim()) chips.push(`${copy.filters.keyword}: ${params.keyword.trim()}`);
  if (params.sort) chips.push(`${copy.filters.sort}: ${params.sort}`);

  return chips;
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
      <nav className="masthead__nav" aria-label="Primary">
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
              value={params.q}
              placeholder={copy.toolbar.searchPlaceholder}
              onChange={(event) => onChange({ ...params, q: event.target.value })}
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
      { value: "Hot", label: "Hot" },
      { value: "Rising", label: "Rising" },
      { value: "Stable", label: "Stable" }
    ],
    [copy.filters.any]
  );
  const sortOptions = useMemo<SelectOption<SearchSort | "">[]>(
    () => [
      { value: "", label: copy.filters.any },
      { value: "relevance", label: "Relevance" },
      { value: "score", label: "Score" },
      { value: "growth", label: "Growth" },
      { value: "downloads", label: "Downloads" },
      { value: "dependents", label: "Dependents" },
      { value: "recent", label: "Recent" },
      { value: "updated", label: "Updated" },
      { value: "name", label: "Name" }
    ],
    [copy.filters.any]
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
              value={params.q}
              placeholder={copy.toolbar.searchPlaceholder}
              onChange={(event) => onChange({ ...params, q: event.target.value })}
            />
          </label>
          <button type="submit" className="button button--primary">{copy.common.search}</button>
        </div>

        <div className="query-stage__filters">
          <div className="facet-control query-stage__filter-select">
            <span>{copy.filters.rank}</span>
            <SelectMenu label={copy.filters.rank} value={params.rank} options={rankOptions} onChange={(value) => onChange({ ...params, rank: value })} />
          </div>
          <div className="facet-control query-stage__filter-select">
            <span>{copy.filters.momentum}</span>
            <SelectMenu label={copy.filters.momentum} value={params.momentum} options={momentumOptions} onChange={(value) => onChange({ ...params, momentum: value })} />
          </div>
          <div className="facet-control query-stage__filter-select">
            <span>{copy.filters.sort}</span>
            <SelectMenu label={copy.filters.sort} value={params.sort} options={sortOptions} onChange={(value) => onChange({ ...params, sort: value })} />
          </div>
          <label className="facet-control">
            <span>{copy.filters.minScore}</span>
            <input inputMode="decimal" value={params.minScore} onChange={(event) => onChange({ ...params, minScore: event.target.value })} />
          </label>
          <label className="facet-control">
            <span>{copy.filters.minDependents}</span>
            <input inputMode="numeric" value={params.minDependents} onChange={(event) => onChange({ ...params, minDependents: event.target.value })} />
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
            <span className="badge badge--accent">{item.momentum_label}</span>
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
          <span className="badge badge--accent">{pkg.momentum_label}</span>
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
                    <span className="badge badge--accent">{item.momentum_label}</span>
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

function AdvancedSearchPanel(props: {
  language: Language;
  params: AdvancedSearchParams;
  open: boolean;
  standalone?: boolean;
  onChange: (params: AdvancedSearchParams) => void;
  onApply: () => Promise<void>;
  onReset: () => void;
  onClose: () => void;
}) {
  const { language, params, open, standalone = false, onChange, onApply, onReset, onClose } = props;
  const copy = dictionaries[language];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useDialogBehavior({ open: open && !standalone, rootRef, initialFocusRef: closeButtonRef, onClose });

  useGSAP(
    () => {
      if (!open || shouldReduceMotion()) return;
      gsap.fromTo(".advanced-dialog", { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.2, ease: "power2.out" });
    },
    { scope: rootRef, dependencies: [open], revertOnUpdate: true }
  );

  if (!open) return null;

  function update<K extends keyof AdvancedSearchParams>(key: K, value: AdvancedSearchParams[K]): void {
    onChange({ ...params, [key]: value });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onApply();
  }

  const anyOption = useMemo<SelectOption<"">[]>(
    () => [{ value: "", label: copy.filters.any }],
    [copy.filters.any]
  );
  const booleanOptions = useMemo(
    () => [...anyOption, { value: "true" as const, label: copy.filters.yes }, { value: "false" as const, label: copy.filters.no }],
    [anyOption, copy.filters.no, copy.filters.yes]
  );
  const rankOptions = useMemo(
    () => [...anyOption, ...(["S", "A", "B", "C", "D"] as SearchRank[]).filter(Boolean).map((rank) => ({ value: rank, label: rank }))] as SelectOption<SearchRank>[],
    [anyOption]
  );
  const momentumOptions = useMemo(
    () => [...anyOption, { value: "Hot" as const, label: "Hot" }, { value: "Rising" as const, label: "Rising" }, { value: "Stable" as const, label: "Stable" }] as SelectOption<SearchMomentum>[],
    [anyOption]
  );
  const sortOptions = useMemo(
    () => [...anyOption, ...(["relevance", "score", "growth", "downloads", "dependents", "recent", "updated", "name"] as const).map((value) => ({ value, label: value }))] as SelectOption<SearchSort | "">[],
    [anyOption]
  );
  const orderOptions = useMemo(
    () => [...anyOption, { value: "asc" as const, label: copy.filters.orderAscending }, { value: "desc" as const, label: copy.filters.orderDescending }] as SelectOption<SearchOrder | "">[],
    [anyOption, copy.filters.orderAscending, copy.filters.orderDescending]
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

          <form className="advanced-form" onSubmit={(event) => void handleSubmit(event)}>
            <section className="field-section">
              <h3>{copy.filters.textGroup}</h3>
              <div className="field-grid">
                <label><span>{copy.filters.query}</span><input value={params.q} onChange={(event) => update("q", event.target.value)} /></label>
                <label><span>{copy.filters.owner}</span><input value={params.owner} onChange={(event) => update("owner", event.target.value)} /></label>
                <label><span>{copy.filters.packageName}</span><input value={params.packageName} onChange={(event) => update("packageName", event.target.value)} /></label>
                <label><span>{copy.filters.keyword}</span><input value={params.keyword} onChange={(event) => update("keyword", event.target.value)} /></label>
                <label className="field-grid__wide"><span>{copy.filters.description}</span><input value={params.description} onChange={(event) => update("description", event.target.value)} /></label>
              </div>
            </section>

            <section className="field-section">
              <h3>{copy.filters.metadataGroup}</h3>
              <div className="field-grid">
                <label><span>{copy.filters.license}</span><input value={params.license} onChange={(event) => update("license", event.target.value)} /></label>
                <label><span>{copy.filters.repository}</span><input value={params.repository} onChange={(event) => update("repository", event.target.value)} /></label>
                <div className="field-grid__control">
                  <span>{copy.filters.hasRepository}</span>
                  <SelectMenu label={copy.filters.hasRepository} value={params.hasRepository} options={booleanOptions} onChange={(value) => update("hasRepository", value)} />
                </div>
                <div className="field-grid__control">
                  <span>{copy.filters.hasLicense}</span>
                  <SelectMenu label={copy.filters.hasLicense} value={params.hasLicense} options={booleanOptions} onChange={(value) => update("hasLicense", value)} />
                </div>
              </div>
            </section>

            <section className="field-section">
              <h3>{copy.filters.scoreGroup}</h3>
              <div className="field-grid">
                <div className="field-grid__control">
                  <span>{copy.filters.rank}</span>
                  <SelectMenu label={copy.filters.rank} value={params.rank} options={rankOptions} onChange={(value) => update("rank", value)} />
                </div>
                <div className="field-grid__control">
                  <span>{copy.filters.momentum}</span>
                  <SelectMenu label={copy.filters.momentum} value={params.momentum} options={momentumOptions} onChange={(value) => update("momentum", value)} />
                </div>
                <label><span>{copy.filters.minScore}</span><input inputMode="decimal" value={params.minScore} onChange={(event) => update("minScore", event.target.value)} /></label>
                <label><span>{copy.filters.maxScore}</span><input inputMode="decimal" value={params.maxScore} onChange={(event) => update("maxScore", event.target.value)} /></label>
                <label><span>{copy.filters.minDependents}</span><input inputMode="numeric" value={params.minDependents} onChange={(event) => update("minDependents", event.target.value)} /></label>
                <label><span>{copy.filters.minRecentDependents}</span><input inputMode="numeric" value={params.minRecentDependents} onChange={(event) => update("minRecentDependents", event.target.value)} /></label>
                <label><span>{copy.filters.minDownloads}</span><input inputMode="numeric" value={params.minDownloads} onChange={(event) => update("minDownloads", event.target.value)} /></label>
              </div>
            </section>

            <section className="field-section">
              <h3>{copy.filters.timeGroup}</h3>
              <div className="field-grid">
                <label><span>{copy.filters.fromYear}</span><input inputMode="numeric" value={params.fromYear} onChange={(event) => update("fromYear", event.target.value)} /></label>
                <label><span>{copy.filters.toYear}</span><input inputMode="numeric" value={params.toYear} onChange={(event) => update("toYear", event.target.value)} /></label>
                <div className="field-grid__control">
                  <span>{copy.filters.sort}</span>
                  <SelectMenu label={copy.filters.sort} value={params.sort} options={sortOptions} onChange={(value) => update("sort", value)} />
                </div>
                <div className="field-grid__control">
                  <span>{copy.filters.order}</span>
                  <SelectMenu label={copy.filters.order} value={params.order} options={orderOptions} onChange={(value) => update("order", value)} />
                </div>
              </div>
            </section>

            <div className="advanced-form__actions">
              <button type="button" className="button button--secondary" onClick={onReset}>{copy.common.reset}</button>
              <button type="submit" className="button button--primary">{copy.common.apply}</button>
            </div>
          </form>
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

        <form className="advanced-form" onSubmit={(event) => void handleSubmit(event)}>
          <section className="field-section">
            <h3>{copy.filters.textGroup}</h3>
            <div className="field-grid">
              <label><span>{copy.filters.query}</span><input value={params.q} onChange={(event) => update("q", event.target.value)} /></label>
              <label><span>{copy.filters.owner}</span><input value={params.owner} onChange={(event) => update("owner", event.target.value)} /></label>
              <label><span>{copy.filters.packageName}</span><input value={params.packageName} onChange={(event) => update("packageName", event.target.value)} /></label>
              <label><span>{copy.filters.keyword}</span><input value={params.keyword} onChange={(event) => update("keyword", event.target.value)} /></label>
              <label className="field-grid__wide"><span>{copy.filters.description}</span><input value={params.description} onChange={(event) => update("description", event.target.value)} /></label>
            </div>
          </section>

          <section className="field-section">
            <h3>{copy.filters.metadataGroup}</h3>
            <div className="field-grid">
              <label><span>{copy.filters.license}</span><input value={params.license} onChange={(event) => update("license", event.target.value)} /></label>
              <label><span>{copy.filters.repository}</span><input value={params.repository} onChange={(event) => update("repository", event.target.value)} /></label>
              <div className="field-grid__control">
                <span>{copy.filters.hasRepository}</span>
                <SelectMenu label={copy.filters.hasRepository} value={params.hasRepository} options={booleanOptions} onChange={(value) => update("hasRepository", value)} />
              </div>
              <div className="field-grid__control">
                <span>{copy.filters.hasLicense}</span>
                <SelectMenu label={copy.filters.hasLicense} value={params.hasLicense} options={booleanOptions} onChange={(value) => update("hasLicense", value)} />
              </div>
            </div>
          </section>

          <section className="field-section">
            <h3>{copy.filters.scoreGroup}</h3>
            <div className="field-grid">
              <div className="field-grid__control">
                <span>{copy.filters.rank}</span>
                <SelectMenu label={copy.filters.rank} value={params.rank} options={rankOptions} onChange={(value) => update("rank", value)} />
              </div>
              <div className="field-grid__control">
                <span>{copy.filters.momentum}</span>
                <SelectMenu label={copy.filters.momentum} value={params.momentum} options={momentumOptions} onChange={(value) => update("momentum", value)} />
              </div>
              <label><span>{copy.filters.minScore}</span><input inputMode="decimal" value={params.minScore} onChange={(event) => update("minScore", event.target.value)} /></label>
              <label><span>{copy.filters.maxScore}</span><input inputMode="decimal" value={params.maxScore} onChange={(event) => update("maxScore", event.target.value)} /></label>
              <label><span>{copy.filters.minDependents}</span><input inputMode="numeric" value={params.minDependents} onChange={(event) => update("minDependents", event.target.value)} /></label>
              <label><span>{copy.filters.minRecentDependents}</span><input inputMode="numeric" value={params.minRecentDependents} onChange={(event) => update("minRecentDependents", event.target.value)} /></label>
              <label><span>{copy.filters.minDownloads}</span><input inputMode="numeric" value={params.minDownloads} onChange={(event) => update("minDownloads", event.target.value)} /></label>
            </div>
          </section>

          <section className="field-section">
            <h3>{copy.filters.timeGroup}</h3>
            <div className="field-grid">
              <label><span>{copy.filters.fromYear}</span><input inputMode="numeric" value={params.fromYear} onChange={(event) => update("fromYear", event.target.value)} /></label>
              <label><span>{copy.filters.toYear}</span><input inputMode="numeric" value={params.toYear} onChange={(event) => update("toYear", event.target.value)} /></label>
              <div className="field-grid__control">
                <span>{copy.filters.sort}</span>
                <SelectMenu label={copy.filters.sort} value={params.sort} options={sortOptions} onChange={(value) => update("sort", value)} />
              </div>
              <div className="field-grid__control">
                <span>{copy.filters.order}</span>
                <SelectMenu label={copy.filters.order} value={params.order} options={orderOptions} onChange={(value) => update("order", value)} />
              </div>
            </div>
          </section>

          <div className="advanced-form__actions">
            <button type="button" className="button button--secondary" onClick={onReset}>{copy.common.reset}</button>
            <button type="submit" className="button button--primary">{copy.common.apply}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function App(props: AppProps) {
  const { initialTopPackages, initialView, initialSource = null } = props;
  const router = useRouter();
  const initialData = useMemo(
    () => {
      const data: AppInitialData = {
        initialView: props.initialView
      };
      if (props.initialSearchParams) data.initialSearchParams = props.initialSearchParams;
      if (props.initialSource !== undefined) data.initialSource = props.initialSource;
      if (props.initialSearchItems) data.initialSearchItems = props.initialSearchItems;
      return data;
    },
    [props.initialSearchItems, props.initialSearchParams, props.initialSource, props.initialView]
  );
  const { state, commands } = useAppController(initialData, router, {
    workspaceUnknownError: dictionaries["zh-CN"].workspace.unknownError,
    detailUnknownError: dictionaries["zh-CN"].detail.unknownError
  });
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
        onApply={() => commands.submitSearch(search.draftParams, initialView === "advanced-search" ? "/advanced-search" : "/search")}
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
          items={initialTopPackages}
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
