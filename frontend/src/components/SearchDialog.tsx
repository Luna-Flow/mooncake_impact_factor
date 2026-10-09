"use client";

// The search dialog of the documentation site (Search.astro), searching
// packages instead of pages: the best matches by name, keyword and
// description as you type, and "all results" in the rankings.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { searchRegistry } from "../client";
import { formatInteger, t, type Lang } from "../i18n";
import type { PackageSummary } from "../types";

const LIMIT = 8;

export function packageHref(lang: Lang, fullName: string): string {
  return `/${lang}/package/?name=${encodeURIComponent(fullName)}`;
}

function Highlight(props: { text: string; query: string }) {
  const { text, query } = props;
  const needle = query.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

export function SearchDialog(props: { lang: Lang; open: boolean; onClose: () => void }) {
  const { lang, open, onClose } = props;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PackageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.select();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey) && !dialogRef.current?.open) {
        event.preventDefault();
        dialogRef.current?.showModal();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const text = query.trim();
    setActive(-1);
    if (!text) {
      setItems([]);
      setTotal(0);
      setStatus("");
      return;
    }
    let cancelled = false;
    setStatus(t(lang, "search.loading"));
    const timer = window.setTimeout(() => {
      searchRegistry(new URLSearchParams({ q: text }), 1)
        .then((result) => {
          if (cancelled) return;
          setItems(result.items.slice(0, LIMIT));
          setTotal(result.total);
          setStatus(result.total === 0 ? t(lang, "search.empty") : "");
        })
        .catch(() => {
          if (!cancelled) setStatus(t(lang, "search.unavailable"));
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lang, query]);

  function showAll(): void {
    onClose();
    router.push(`/${lang}/?q=${encodeURIComponent(query.trim())}`);
  }

  function go(item: PackageSummary): void {
    onClose();
    router.push(packageHref(lang, item.full_name));
  }

  return (
    <dialog
      ref={dialogRef}
      className="search-dialog"
      aria-label={t(lang, "search.open")}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form
        method="dialog"
        className="search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const item = items[Math.max(active, 0)];
          if (active >= 0 && item) go(item);
          else if (query.trim()) showAll();
        }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3.25 3.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          name="q"
          autoComplete="off"
          spellCheck={false}
          placeholder={t(lang, "search.placeholder")}
          aria-controls="search-results"
          aria-activedescendant={active >= 0 ? `search-result-${active}` : undefined}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && items.length) {
              event.preventDefault();
              setActive((index) => (index + 1) % items.length);
            } else if (event.key === "ArrowUp" && items.length) {
              event.preventDefault();
              setActive((index) => (index - 1 + items.length) % items.length);
            }
          }}
        />
        <kbd>esc</kbd>
      </form>
      <ol id="search-results" className="search-results" role="listbox">
        {items.map((item, index) => (
          <li key={item.full_name}>
            <a
              id={`search-result-${index}`}
              href={packageHref(lang, item.full_name)}
              role="option"
              aria-selected={index === active}
              onClick={(event) => {
                event.preventDefault();
                go(item);
              }}
            >
              <span className="search-title">
                <Highlight text={item.full_name} query={query} />
              </span>
              <span className="search-where">
                {t(lang, "search.where", { position: formatInteger(lang, item.rank_position), grade: item.rank_label })}
              </span>
              {item.description ? (
                <span className="search-excerpt">
                  <Highlight text={item.description} query={query} />
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ol>
      {total > 0 ? (
        <p className="search-all">
          <button type="button" className="text-button" onClick={showAll}>
            {t(lang, "search.all", { count: formatInteger(lang, total) })}
          </button>
          <span>{t(lang, "search.keys")}</span>
        </p>
      ) : null}
      <p className="search-status" aria-live="polite">
        {status}
      </p>
    </dialog>
  );
}
