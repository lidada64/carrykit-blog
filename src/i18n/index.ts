"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { en, type Dictionary } from "./en";
import { zh } from "./zh";

/**
 * 【扩展性接口】UI 语言切换(ARCHITECTURE §7.3)。
 * 纯 UI 层切换:字典随包下发,client 即时切换,不影响 SSG/ISR。
 * locale 以 localStorage 为外部存储(useSyncExternalStore):
 * 服务端/水合期渲染默认语言,水合后自动同步为持久化语言。
 * 新增语言 = 新增字典文件 + 在 dictionaries 注册 + Locale 联合类型加一项。
 */

export type Locale = "en" | "zh";

const dictionaries: Record<Locale, Dictionary> = { en, zh };

const DEFAULT_LOCALE: Locale = "en";
const STORAGE_KEY = "carrykit.locale";

// ---- localStorage 外部存储(同标签页写入需手动通知订阅者) ----

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener); // 跨标签页同步
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "zh" || stored === "en" ? stored : DEFAULT_LOCALE;
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function setStoredLocale(next: Locale): void {
  window.localStorage.setItem(STORAGE_KEY, next);
  listeners.forEach((listener) => listener());
}

// ---- 字典查询 ----

/** 字典的两级点路径键,如 "nav.work" */
export type TKey = {
  [K in keyof Dictionary & string]: Dictionary[K] extends string
    ? K
    : {
        [K2 in keyof Dictionary[K] & string]: `${K}.${K2}`;
      }[keyof Dictionary[K] & string];
}[keyof Dictionary & string];

function translate(dict: Dictionary, key: TKey): string {
  const [group, item] = key.split(".") as [
    keyof Dictionary,
    string | undefined,
  ];
  const node = dict[group];
  if (typeof node === "string") return node;
  if (item !== undefined && item in node) {
    return node[item as keyof typeof node];
  }
  return key;
}

// ---- Context 与 hooks ----

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: setStoredLocale,
      t: (key) => translate(dictionaries[locale], key),
    }),
    [locale],
  );

  useEffect(() => {
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  return createElement(LocaleContext.Provider, { value }, children);
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale/useT must be used within <LocaleProvider>");
  }
  return ctx;
}

/** 读取与切换当前语言 */
export function useLocale(): Pick<LocaleContextValue, "locale" | "setLocale"> {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}

/** 取 UI 文案:const t = useT(); t("nav.work") */
export function useT(): (key: TKey) => string {
  return useLocaleContext().t;
}
