"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider, useTheme } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PanelLeft,
  ChevronRight,
  ChevronsUpDown,
  Warehouse,
  Globe2,
  Moon,
  Sun,
  ChevronDown,
  CalendarDays,
  LogOut,
  Settings2,
  Check,
  X,
  ShieldCheck,
} from "lucide-react";
import en from "@/messages/en.json";
import so from "@/messages/so.json";
import { AppProvider, useApp, useT } from "@/lib/context";
import { nav, modules } from "@/lib/modules";
import { Brand, Drop, Loading, Problem, Modal } from "./UI";
import { Dashboard } from "./Dashboard";
import { ResourcePage } from "./Resources";
import { Reports } from "./Reports";
import { Settings } from "./Settings";
import { Login } from "./Login";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false },
  },
});
export function WarehouseApp({
  locale,
  route,
}: {
  locale: string;
  route: string[];
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "so" ? so : en}
      timeZone="Africa/Mogadishu"
    >
      <ThemeProvider
        attribute="class"
        storageKey="stockroom-theme"
        defaultTheme="light"
        enableSystem={false}
      >
        <QueryClientProvider client={client}>
          <AppProvider locale={locale} route={route}>
            <Frame />
          </AppProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
function Frame() {
  const {
      route,
      locale,
      admin,
      ready,
      error,
      retry,
      href,
      go,
      notify,
      toast,
      logout,
      setLocale,
      settings,
    } = useApp(),
    t = useT(),
    { resolvedTheme, setTheme } = useTheme();
  const [drawer, open] = useState(false),
    [compact, collapse] = useState(false),
    [exitInfo, setExitInfo] = useState<{
      password: string;
      key: string;
    } | null>(null),
    [ack, acknowledge] = useState(false);
  const key = route[0],
    page =
      nav.flatMap((g) => [...g.items]).find((x) => x[0] === key)?.[1] ??
      "Dashboard";
  useEffect(() => open(false), [key, route]);
  useEffect(() => {
    document.title = t(page) + " · " + settings.system_name;
  }, [page, locale, settings.system_name]);
  if (error)
    return (
      <main className="boot-page">
        <Brand />
        <Problem message={error} retry={retry} />
      </main>
    );
  if (!ready)
    return (
      <main className="boot-page">
        <Brand />
        <Loading />
      </main>
    );
  if (!admin || key === "login" || admin.must_change_password) return <Login />;
  return (
    <div
      className={
        "app-shell " +
        (compact ? "is-compact " : "") +
        (drawer ? "drawer-open" : "")
      }
    >
      {drawer && (
        <button
          className="scrim"
          aria-label={t("Close navigation")}
          onClick={() => open(false)}
        />
      )}
      <aside className="sidebar">
        <div className="brand-row">
          <Link href={href("dashboard")} aria-label="Stockroom">
            <Brand />
          </Link>
          <button
            className="mobile-close icon-button"
            aria-label={t("Close navigation")}
            onClick={() => open(false)}
          >
            <X size={18} />
          </button>
        </div>
        <Drop
          className="warehouse-picker"
          button={
            <>
              <span className="warehouse-mark">
                <Warehouse size={18} />
              </span>
              <span className="warehouse-info">
                <b>
                  {t(
                    settings.company_name === "My warehouse"
                      ? "Main warehouse"
                      : settings.company_name,
                  )}
                </b>
                <small>{t("Inventory workspace")}</small>
              </span>
              <ChevronsUpDown size={13} />
            </>
          }
        >
          {(close) => (
            <>
              <div className="popover-title">{t("Warehouse workspace")}</div>
              <div className="warehouse-meta">
                {settings.time_zone}
                <br />
                {settings.currency_code} · {t("Single warehouse")}
              </div>
              <Link href={href("settings")} onClick={close}>
                <Settings2 size={15} />
                {t("Workspace settings")}
              </Link>
            </>
          )}
        </Drop>
        <nav aria-label={t("Main navigation")}>
          {nav.map((group) => (
            <section className="nav-group" key={group.label}>
              <h2>{t(group.label)}</h2>
              {group.items.map(([slug, label, Icon]) => (
                <Link
                  href={href(slug)}
                  key={slug}
                  className={"nav-link " + (key === slug ? "active" : "")}
                  aria-current={key === slug ? "page" : undefined}
                  title={t(label)}
                >
                  <Icon size={17} strokeWidth={1.7} />
                  <span>{t(label)}</span>
                  {key === slug && <i />}
                </Link>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="online-dot" />
          <span>{t("System online")}</span>
          <small>v1.0</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="crumb">
            <button
              className="icon-button nav-toggle"
              aria-label={t("Toggle sidebar")}
              onClick={() =>
                window.matchMedia("(max-width: 820px)").matches
                  ? open(!drawer)
                  : collapse(!compact)
              }
            >
              <PanelLeft size={17} />
            </button>
            <span className="top-divider" />
            <span className="crumb-root">{t("Workspace")}</span>
            <ChevronRight size={13} />
            <strong>{t(page)}</strong>
          </div>
          <div className="top-actions">
            <span className="today">
              <CalendarDays size={15} />
              {new Intl.DateTimeFormat(locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: settings.time_zone,
              }).format(new Date())}
            </span>
            <span className="top-divider date-divider" />
            <Drop
              className="language-drop"
              button={
                <>
                  <Globe2 size={16} />
                  <span>{locale.toUpperCase()}</span>
                  <ChevronDown size={12} />
                </>
              }
            >
              {(close) => (
                <>
                  <div className="popover-title">{t("Language")}</div>
                  {[
                    ["en", "English"],
                    ["so", "Soomaali"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => {
                        close();
                        setLocale(v);
                      }}
                    >
                      {l}
                      {locale === v && <Check size={15} />}
                    </button>
                  ))}
                </>
              )}
            </Drop>
            <button
              className="icon-button theme-switch"
              aria-label={t("Toggle theme")}
              title={t("Toggle theme")}
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? (
                <Moon size={17} />
              ) : (
                <Sun size={17} />
              )}
            </button>
            <span className="top-divider" />
            <Drop
              className="profile-drop"
              button={
                <>
                  <span className="avatar">AD</span>
                  <span className="profile-name">{t("Admin")}</span>
                  <ChevronDown size={12} />
                </>
              }
            >
              {(close) => (
                <>
                  <div className="popover-title">{t("Administrator")}</div>
                  <button
                    onClick={() => {
                      close();
                      go("settings");
                    }}
                  >
                    <Settings2 size={15} />
                    {t("Settings")}
                  </button>
                  <button
                    onClick={() => {
                      close();
                      const info = sessionStorage.getItem("stockroom_setup");
                      if (info) {
                        setExitInfo(JSON.parse(info));
                        acknowledge(false);
                      } else logout().catch((e) => notify(e.message));
                    }}
                  >
                    <LogOut size={15} />
                    {t("Sign out")}
                  </button>
                </>
              )}
            </Drop>
          </div>
        </header>
        <main className="main-content" id="main-content">
          {key === "dashboard" ? (
            <Dashboard />
          ) : key === "reports" ? (
            <Reports />
          ) : key === "settings" ? (
            <Settings />
          ) : modules[key] ? (
            <ResourcePage key={key} resource={key} />
          ) : null}
        </main>
        <footer className="app-footer">
          <span>
            Stockroom <b>/</b> {t("Inventory workspace")}
          </span>
          <span>
            <ShieldCheck size={12} />
            {t("Single-admin workspace")}
          </span>
        </footer>
      </div>
      {exitInfo && (
        <Modal title="Save your access details" close={() => setExitInfo(null)}>
          <div className="modal-body">
            <p className="summary-copy">
              {t("Save these credentials offline before signing out.")}
            </p>
            <div className="code-block">
              {t("Username")}: admin
              <br />
              {t("Password")}: {exitInfo.password}
              <br />
              {t("Recovery key")}: {exitInfo.key}
            </div>
            <label>
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => acknowledge(e.target.checked)}
              />{" "}
              {t("I saved my access details.")}
            </label>
          </div>
          <footer className="modal-foot">
            <button className="btn outline" onClick={() => setExitInfo(null)}>
              {t("Cancel")}
            </button>
            <button
              className="btn primary"
              disabled={!ack}
              onClick={() => logout().catch((e) => notify(e.message))}
            >
              {t("Sign out")}
            </button>
          </footer>
        </Modal>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {t(toast)}
        </div>
      )}
    </div>
  );
}
