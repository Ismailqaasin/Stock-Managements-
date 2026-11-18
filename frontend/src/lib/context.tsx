"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { request, renew, setLanguage, setToken, ApiError } from "./api";
import type { Row } from "./modules";
export const keyFor = (s: string) =>
  s.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
export function useT() {
  const tr = useTranslations();
  return (s: string) => (s && tr.has(keyFor(s)) ? tr(keyFor(s)) : s);
}
type Ctx = {
  locale: string;
  route: string[];
  settings: Row;
  admin: Row | null;
  preview: boolean;
  ready: boolean;
  error: string;
  go: (path: string) => void;
  href: (path: string) => string;
  notify: (s: string) => void;
  toast: string;
  setSession: (r: Row) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setLocale: (loc: string) => void;
  retry: () => void;
};
const Context = createContext<Ctx>(null!);
export const useApp = () => useContext(Context);
let session: Row | null = null,
  boot: Promise<{ user: Row | null; preview: boolean }> | null = null,
  isPreview = false;
function storeSession(r: Row) {
  setToken(r.token);
  session = r.admin;
  if (r.preview_password)
    sessionStorage.setItem(
      "stockroom_setup",
      JSON.stringify({ password: r.preview_password, key: r.recovery_key }),
    );
  else if (r.recovery_key)
    sessionStorage.setItem("stockroom_key", r.recovery_key);
}
async function endSession() {
  try {
    await request("/auth/logout", "POST", {}, false);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    try {
      await renew();
      await request("/auth/logout", "POST", {}, false);
    } catch (second) {
      if (!(second instanceof ApiError) || second.status !== 401) throw second;
    }
  }
}
async function initialize(login: boolean) {
  if (session) return { user: session, preview: isPreview };
  if (!boot)
    boot = (async () => {
      const cfg = await request("/auth/config");
      isPreview = cfg.preview;
      try {
        let r: Row;
        if (cfg.preview && cfg.auto_start && !login)
          r = await request("/auth/preview", "POST", {});
        else r = await renew();
        storeSession(r);
        return { user: session, preview: isPreview };
      } catch (e) {
        if (e instanceof ApiError && [401, 403].includes(e.status))
          return { user: null, preview: isPreview };
        throw e;
      }
    })().finally(() => {
      boot = null;
    });
  return boot;
}
export function AppProvider({
  locale,
  route,
  children,
}: {
  locale: string;
  route: string[];
  children: React.ReactNode;
}) {
  const router = useRouter(),
    qc = useQueryClient(),
    { setTheme } = useTheme();
  const [admin, user] = useState<Row | null>(session),
    [ready, loaded] = useState(!!session),
    [preview, pv] = useState(isPreview),
    [error, err] = useState(""),
    [attempt, bump] = useState(0),
    [toast, msg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  setLanguage(locale);
  const notify = useCallback((s: string) => {
    msg(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => msg(""), 4500);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    let active = true;
    initialize(route[0] === "login")
      .then((r) => {
        if (active) {
          user(r.user);
          pv(r.preview);
          loaded(true);
          err("");
        }
      })
      .catch((e) => {
        if (active) {
          err(e.message);
          loaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt, locale, route[0]]);
  const reset = useCallback(() => {
    session = null;
    setToken("");
    user(null);
    qc.clear();
    sessionStorage.removeItem("stockroom_setup");
    sessionStorage.removeItem("stockroom_key");
    router.replace(`/${locale}/login`);
  }, [locale, qc, router]);
  useEffect(() => {
    window.addEventListener("session-expired", reset);
    return () => window.removeEventListener("session-expired", reset);
  }, [reset]);
  useEffect(() => {
    if (!ready || error) return;
    if ((!admin || admin.must_change_password) && route[0] !== "login")
      router.replace(`/${locale}/login`);
    else if (admin && !admin.must_change_password && route[0] === "login")
      router.replace(`/${locale}/dashboard`);
  }, [ready, error, admin, route, locale, router]);
  const s = useQuery({
    queryKey: ["settings"],
    queryFn: () => request("/settings"),
    enabled: !!admin && !admin.must_change_password,
  });
  const settings = s.data ?? {
    system_name: "Stockroom",
    company_name: "My warehouse",
    currency_code: "USD",
    time_zone: "Africa/Mogadishu",
    date_format: "YYYY-MM-DD",
    low_stock_threshold: 10,
  };
  useEffect(() => {
    if (!s.data) return;
    if (!localStorage.getItem("stockroom-theme"))
      setTheme(s.data.default_theme);
    if (
      !document.cookie
        .split("; ")
        .some((k) => k.startsWith("stockroom_locale="))
    ) {
      const fromRoot = new URLSearchParams(window.location.search).has(
        "defaultLocale",
      );
      const lang = fromRoot
        ? s.data.default_language === "so"
          ? "so"
          : "en"
        : locale;
      document.cookie = `stockroom_locale=${lang};path=/;max-age=31536000;SameSite=Lax`;
      if (fromRoot || lang !== locale)
        router.replace("/" + lang + "/" + route.join("/"));
    }
  }, [s.data, locale, route, router, setTheme]);
  useEffect(() => {
    if (!admin || admin.must_change_password) return;
    const limit = Number(settings.session_timeout_minutes ?? 60) * 60000;
    let last = Date.now();
    const touch = () => {
      if (Date.now() - last > limit) {
        void endSession()
          .catch(() => {})
          .finally(reset);
      } else last = Date.now();
    };
    const interval = setInterval(() => {
      if (Date.now() - last > limit) touch();
    }, 15000);
    document.addEventListener("pointerdown", touch);
    document.addEventListener("keydown", touch);
    return () => {
      clearInterval(interval);
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("keydown", touch);
    };
  }, [admin, settings.session_timeout_minutes, reset]);
  const setSession = (r: Row) => {
    storeSession(r);
    user(r.admin);
    loaded(true);
    if (!r.admin.must_change_password)
      router.replace(
        "/" +
          locale +
          "/dashboard" +
          (new URLSearchParams(window.location.search).has("defaultLocale")
            ? "?defaultLocale=1"
            : ""),
      );
  };
  return (
    <Context.Provider
      value={{
        locale,
        route,
        settings,
        admin,
        ready,
        preview,
        error: error || (s.error && !s.data ? s.error.message : ""),
        href: (p) => `/${locale}/${p}`,
        go: (p) => router.push(`/${locale}/${p}`),
        notify,
        toast,
        setSession,
        logout: async () => {
          await endSession();
          reset();
        },
        refresh: async () => {
          await qc.invalidateQueries();
        },
        setLocale: (l) => {
          document.cookie = `stockroom_locale=${l};path=/;max-age=31536000;SameSite=Lax`;
          router.push("/" + l + "/" + route.join("/") + window.location.search);
        },
        retry: () => {
          if (s.error && admin) {
            void s.refetch();
            return;
          }
          loaded(false);
          err("");
          bump((i) => i + 1);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useFormat() {
  const { settings, locale } = useApp();
  return {
    amount: (n: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: settings.currency_code || "USD",
      }).format(n),
    date: (raw: string, time = false) => {
      if (!raw) return "—";
      const dt = new Date(raw.length === 10 ? raw + "T12:00:00Z" : raw);
      if (isNaN(+dt)) return raw;
      const tz = raw.length === 10 ? "UTC" : settings.time_zone;
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).formatToParts(dt);
      const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
      const day =
        settings.date_format === "MM/DD/YYYY"
          ? `${p.month}/${p.day}/${p.year}`
          : settings.date_format === "DD/MM/YYYY"
            ? `${p.day}/${p.month}/${p.year}`
            : `${p.year}-${p.month}-${p.day}`;
      return (
        day +
        (time
          ? " · " +
            dt.toLocaleTimeString(locale, {
              timeZone: tz,
              hour: "2-digit",
              minute: "2-digit",
            })
          : "")
      );
    },
    today: () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: settings.time_zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
  };
}
