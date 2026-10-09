#!/usr/bin/env node
// Interface strings, localised the way the Luna-Flow documentation site
// localises its own: English source strings by key in web/i18n/conf.json,
// gettext catalogs in web/i18n/locale/, and a compiled table per locale.
// The catalog code follows lunadoc (Luna-Flow.github.io/tools/lunadoc,
// src/catalog.mjs) so that translators meet the same msgmerge behaviour:
// translations are kept by msgid, a changed source string becomes fuzzy
// with `#| msgid` pointing at the old text, and unused translations are kept
// as obsolete entries.
//
// Usage: node scripts/i18n.mjs <update|status|compile|check>

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { po } from "gettext-parser";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const I18N = path.join(ROOT, "web", "i18n");
const CONF = path.join(I18N, "conf.json");
const LOCALES = path.join(I18N, "locales.json");
const POT = path.join(I18N, "locale", "app.pot");
const COMPILED = path.join(ROOT, "frontend", "src", "generated", "strings.json");
const PROJECT = "mooncake_impact_factor web interface";
const FUZZY_THRESHOLD = 0.6;

const poPath = (locale) => path.join(I18N, "locale", locale, "LC_MESSAGES", "app.po");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function emptyCatalog(language = "") {
  return { language, entries: new Map(), obsolete: new Map() };
}

function fromParsed(entry) {
  const flags = new Set(
    (entry.comments?.flag ?? "")
      .split(/[,\s]+/)
      .map((flag) => flag.trim())
      .filter(Boolean)
  );
  const previous = entry.comments?.previous?.match(/^msgid "(.*)"$/s)?.[1];
  return {
    msgid: entry.msgid,
    msgstr: entry.msgstr?.[0] ?? "",
    references: (entry.comments?.reference ?? "").split(/\s+/).filter(Boolean),
    flags,
    previous: previous ? JSON.parse(`"${previous}"`) : undefined,
    translatorComment: entry.comments?.translator
  };
}

function readCatalog(file) {
  if (!fs.existsSync(file)) return null;
  const data = po.parse(fs.readFileSync(file));
  const catalog = emptyCatalog(data.headers?.Language ?? "");
  for (const table of Object.values(data.translations ?? {})) {
    for (const entry of Object.values(table)) {
      if (entry.msgid) catalog.entries.set(entry.msgid, fromParsed(entry));
    }
  }
  for (const table of Object.values(data.obsolete ?? {})) {
    for (const entry of Object.values(table)) {
      if (entry.msgid) catalog.obsolete.set(entry.msgid, fromParsed(entry));
    }
  }
  return catalog;
}

function writeCatalog(file, catalog, { template = false } = {}) {
  const headers = {
    "Project-Id-Version": PROJECT,
    "Report-Msgid-Bugs-To": "https://github.com/Luna-Flow/mooncake_impact_factor",
    Language: template ? "" : catalog.language,
    "MIME-Version": "1.0",
    "Content-Type": "text/plain; charset=UTF-8",
    "Content-Transfer-Encoding": "8bit"
  };
  const toParsed = (entry) => {
    const comments = {};
    if (entry.translatorComment) comments.translator = entry.translatorComment;
    if (entry.references.length) comments.reference = entry.references.join("\n");
    if (entry.flags.size) comments.flag = [...entry.flags].join(", ");
    if (entry.previous !== undefined) comments.previous = `msgid ${JSON.stringify(entry.previous)}`;
    return { msgid: entry.msgid, msgstr: [template ? "" : entry.msgstr], comments };
  };
  const translations = { "": { "": { msgid: "", msgstr: [""] } } };
  for (const entry of catalog.entries.values()) translations[""][entry.msgid] = toParsed(entry);
  const obsolete = { "": {} };
  if (!template) {
    for (const entry of catalog.obsolete.values()) obsolete[""][entry.msgid] = toParsed({ ...entry, references: [] });
  }
  const output = po.compile({ charset: "utf-8", headers, translations, obsolete }, { foldLength: 0, sort: false });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${output.toString().trimEnd()}\n`);
}

function words(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function similarity(a, b) {
  if (a === b) return 1;
  const left = words(a);
  const right = words(b);
  if (!left.length || !right.length) return 0;
  const counts = new Map();
  for (const word of left) counts.set(word, (counts.get(word) ?? 0) + 1);
  let common = 0;
  for (const word of right) {
    const count = counts.get(word) ?? 0;
    if (count > 0) {
      common += 1;
      counts.set(word, count - 1);
    }
  }
  return (2 * common) / (left.length + right.length);
}

function templateFrom(strings) {
  const catalog = emptyCatalog();
  for (const [key, text] of Object.entries(strings)) {
    const msgid = String(text).trim();
    if (!msgid) continue;
    const reference = `conf.json:strings.${key}`;
    const existing = catalog.entries.get(msgid);
    if (existing) existing.references.push(reference);
    else catalog.entries.set(msgid, { msgid, msgstr: "", references: [reference], flags: new Set() });
  }
  return catalog;
}

function mergeCatalog(template, old, language) {
  const merged = emptyCatalog(language);
  const pool = new Map();
  for (const entry of old?.entries.values() ?? []) {
    if (!template.entries.has(entry.msgid) && entry.msgstr) pool.set(entry.msgid, entry);
  }
  for (const entry of old?.obsolete.values() ?? []) {
    if (!template.entries.has(entry.msgid) && entry.msgstr && !pool.has(entry.msgid)) pool.set(entry.msgid, entry);
  }
  for (const source of template.entries.values()) {
    const kept = old?.entries.get(source.msgid) ?? old?.obsolete.get(source.msgid);
    if (kept) {
      merged.entries.set(source.msgid, {
        ...source,
        msgstr: kept.msgstr,
        flags: new Set(kept.flags),
        previous: kept.flags.has("fuzzy") ? kept.previous : undefined,
        translatorComment: kept.translatorComment
      });
      continue;
    }
    let best = null;
    let bestScore = FUZZY_THRESHOLD;
    for (const candidate of pool.values()) {
      const score = similarity(source.msgid, candidate.msgid);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    merged.entries.set(
      source.msgid,
      best
        ? { ...source, msgstr: best.msgstr, flags: new Set([...best.flags, "fuzzy"]), previous: best.msgid, translatorComment: best.translatorComment }
        : { ...source, msgstr: "", flags: new Set(source.flags) }
    );
  }
  for (const entry of pool.values()) {
    const used = [...merged.entries.values()].some((item) => item.previous === entry.msgid);
    if (!used) merged.obsolete.set(entry.msgid, { ...entry, references: [] });
  }
  return merged;
}

function coverageOf(catalog) {
  let translated = 0;
  let fuzzy = 0;
  for (const entry of catalog.entries.values()) {
    if (entry.msgstr && entry.flags.has("fuzzy")) fuzzy += 1;
    else if (entry.msgstr) translated += 1;
  }
  const total = catalog.entries.size;
  return { total, translated, fuzzy, untranslated: total - translated - fuzzy };
}

// Only finished, non-fuzzy translations are used, as on the documentation site.
function translator(catalog) {
  return (msgid) => {
    const entry = catalog?.entries.get(msgid);
    if (!entry || !entry.msgstr || entry.flags.has("fuzzy")) return undefined;
    return entry.msgstr;
  };
}

function placeholders(text) {
  return [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
}

const conf = readJson(CONF);
const locales = readJson(LOCALES);
const source = locales[0];
const command = process.argv[2];

switch (command) {
  case "update": {
    const template = templateFrom(conf.strings);
    writeCatalog(POT, template, { template: true });
    for (const locale of conf.locales) {
      const merged = mergeCatalog(template, readCatalog(poPath(locale)), locale);
      writeCatalog(poPath(locale), merged);
      const c = coverageOf(merged);
      console.log(`${locale}: ${c.translated}/${c.total} translated, ${c.fuzzy} fuzzy, ${c.untranslated} untranslated`);
    }
    break;
  }
  case "status": {
    for (const locale of conf.locales) {
      const c = coverageOf(readCatalog(poPath(locale)) ?? emptyCatalog());
      console.log(`${locale}: ${c.translated}/${c.total} translated, ${c.fuzzy} fuzzy, ${c.untranslated} untranslated`);
    }
    break;
  }
  case "check": {
    // The catalogs must be up to date with conf.json, and a translation must
    // keep the {placeholders} of its source string.
    const template = templateFrom(conf.strings);
    let problems = 0;
    for (const locale of conf.locales) {
      const catalog = readCatalog(poPath(locale));
      if (!catalog) {
        console.error(`${locale}: missing ${path.relative(ROOT, poPath(locale))}`);
        problems += 1;
        continue;
      }
      for (const msgid of template.entries.keys()) {
        const entry = catalog.entries.get(msgid);
        if (!entry) {
          console.error(`${locale}: not merged: ${JSON.stringify(msgid)} (run node scripts/i18n.mjs update)`);
          problems += 1;
        } else if (entry.msgstr && placeholders(entry.msgstr) !== placeholders(msgid)) {
          console.error(`${locale}: placeholders differ: ${JSON.stringify(msgid)}`);
          problems += 1;
        }
      }
    }
    if (problems) process.exit(1);
    console.log("catalogs are up to date");
    break;
  }
  case "compile": {
    const tables = {};
    for (const locale of locales) {
      const strings = {};
      if (locale.id === source.id) {
        Object.assign(strings, conf.strings);
      } else {
        const lookup = translator(readCatalog(poPath(locale.id)));
        for (const [key, text] of Object.entries(conf.strings)) strings[key] = lookup(String(text).trim()) ?? text;
      }
      tables[locale.path] = strings;
    }
    fs.mkdirSync(path.dirname(COMPILED), { recursive: true });
    fs.writeFileSync(COMPILED, `${JSON.stringify({ locales, strings: tables }, null, 2)}\n`);
    console.log(`wrote ${path.relative(ROOT, COMPILED)}`);
    break;
  }
  default:
    console.error("Usage: node scripts/i18n.mjs <update|status|compile|check>");
    process.exit(1);
}
