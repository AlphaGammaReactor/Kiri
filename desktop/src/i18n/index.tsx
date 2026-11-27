import { createContext, useContext, type ReactNode } from "react";
import { en, zh, terms, type StringKey, type TermKey } from "./strings";

export type Lang = "en" | "zh" | "bi";

const LangContext = createContext<Lang>("en");
export const LangProvider = ({ lang, children }: { lang: Lang; children: ReactNode }) => (
  <LangContext.Provider value={lang}>{children}</LangContext.Provider>
);

function format(s: string, vars?: Record<string, string | number>) {
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")).replace(/= </g, "<") : s;
}

export function useT() {
  const lang = useContext(LangContext);
  const table = lang === "en" ? en : zh;
  const t = (key: StringKey, vars?: Record<string, string | number>) => format(table[key], vars);
  /** A technical term: English, Chinese, or "风险比 (hazard ratio)" in Bilingual mode. */
  const term = (key: TermKey) => {
    const x = terms[key];
    return lang === "en" ? x.en : lang === "zh" ? x.zh : `${x.zh} (${x.en})`;
  };
  return { t, term, lang };
}

export function systemLang(): Lang {
  const l = (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
  return l.startsWith("zh") ? "zh" : "en";
}
