"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  ShieldCheck,
  Warehouse,
  SlidersHorizontal,
  KeyRound,
  Check,
  LoaderCircle,
} from "lucide-react";
import { useApp, useT } from "@/lib/context";
import { request } from "@/lib/api";
import { Row } from "@/lib/modules";
import { PageTitle, Problem, Loading, PrivateImage } from "./UI";
import { Field, FieldSpec } from "./Forms";
export function Settings() {
  const { settings, refresh, notify, preview, locale, setLocale } = useApp(),
    t = useT(),
    { setTheme } = useTheme();
  const [tab, setTab] = useState("Workspace"),
    [form, update] = useState<Row>({}),
    [busy, wait] = useState(false),
    [error, err] = useState(""),
    [check, checked] = useState<Row | null>(null),
    [show, reveal] = useState(false),
    [pass, pwd] = useState(""),
    [next, nw] = useState("");
  useEffect(() => update({ ...settings }), [settings.version]);
  const field = (s: FieldSpec) => (
    <Field
      key={s.key}
      spec={s}
      value={form[s.key]}
      onChange={(v) => update({ ...form, [s.key]: v })}
    />
  );
  const saved =
      typeof window !== "undefined"
        ? sessionStorage.getItem("stockroom_setup")
        : null,
    key =
      typeof window !== "undefined"
        ? sessionStorage.getItem("stockroom_key")
        : null;
  async function run(f: () => Promise<void>) {
    wait(true);
    err("");
    try {
      await f();
    } catch (e) {
      err((e as Error).message);
    } finally {
      wait(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await request("/settings", "PUT", form);
      await refresh();
      setTheme(form.default_theme);
      if (form.default_language !== locale) setLocale(form.default_language);
      notify("Settings saved.");
    });
  }
  async function upload(file: File) {
    await run(async () => {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Image must be under 2 MB.");
      const data = new FormData();
      data.append("file", file);
      await request("/settings/logo", "POST", data);
      await refresh();
      notify("Logo saved.");
    });
  }
  if (!form.version)
    return (
      <>
        <PageTitle
          kicker="Management"
          title="Settings"
          sub="Manage your warehouse identity, preferences, and security."
        />
        <Loading />
      </>
    );
  return (
    <>
      <PageTitle
        kicker="Management"
        title="Settings"
        sub="Manage your warehouse identity, preferences, and security."
      />
      <div className="settings-tabs">
        {["Workspace", "Preferences", "Security"].map((v) => (
          <button
            key={v}
            onClick={() => {
              setTab(v);
              err("");
            }}
            className={v === tab ? "active" : ""}
          >
            {t(v)}
          </button>
        ))}
      </div>
      {error && <Problem message={error} />}
      {tab !== "Security" ? (
        <form onSubmit={submit}>
          <section className="settings-card">
            <div className="card-heading">
              <span className="tile small green">
                {tab === "Workspace" ? (
                  <Warehouse size={17} />
                ) : (
                  <SlidersHorizontal size={17} />
                )}
              </span>
              <div>
                <h2>
                  {t(
                    tab === "Workspace"
                      ? "Warehouse profile"
                      : "Workspace preferences",
                  )}
                </h2>
                <p>
                  {t(
                    tab === "Workspace"
                      ? "These details appear on your reports and documents."
                      : "Choose display formats and default inventory rules.",
                  )}
                </p>
              </div>
            </div>
            <div className="settings-grid">
              {(tab === "Workspace" ? workspaceFields : preferenceFields).map(
                field,
              )}
            </div>
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Check size={14} />
                )}{" "}
                {t("Save changes")}
              </button>
            </div>
          </section>
        </form>
      ) : (
        <>
          <section className="settings-card">
            <div className="card-heading">
              <span className="tile small green">
                <KeyRound size={17} />
              </span>
              <div>
                <h2>{t("Account security")}</h2>
                <p>{t("Changing your password ends all current sessions.")}</p>
              </div>
            </div>
            {(saved || key) && (
              <>
                <button
                  className="btn outline compact"
                  onClick={() => reveal(!show)}
                >
                  {t(
                    show
                      ? "Hide credentials"
                      : preview
                        ? "Show private workspace credentials"
                        : "Show recovery key",
                  )}
                </button>
                {show && (
                  <div className="code-block">
                    {saved && (
                      <>
                        {t("Username")}: admin
                        <br />
                        {t("Password")}: {JSON.parse(saved).password}
                        <br />
                      </>
                    )}
                    {t("Recovery key")}: {saved ? JSON.parse(saved).key : key}
                  </div>
                )}
                <p>{t("Save these credentials offline before signing out.")}</p>
              </>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await request("/auth/change-password", "POST", {
                    currentPassword: pass,
                    newPassword: next,
                  });
                  sessionStorage.removeItem("stockroom_setup");
                  sessionStorage.removeItem("stockroom_key");
                  window.location.assign("/" + locale + "/login");
                });
              }}
            >
              <div className="settings-grid" style={{ marginTop: 14 }}>
                <Field
                  spec={{
                    key: "currentPassword",
                    label: "Current password",
                    type: "password",
                    required: true,
                  }}
                  value={pass}
                  onChange={pwd}
                />
                <Field
                  spec={{
                    key: "newPassword",
                    label: "New password",
                    type: "password",
                    required: true,
                    hint: "Use at least 12 characters.",
                  }}
                  value={next}
                  onChange={nw}
                />
              </div>
              <div className="button-row">
                <button className="btn outline" disabled={busy}>
                  {t("Change password")}
                </button>
              </div>
            </form>
          </section>
          <section className="settings-card">
            <div className="card-heading">
              <span className="tile small blue">
                <ShieldCheck size={17} />
              </span>
              <div>
                <h2>{t("Ledger integrity")}</h2>
                <p>
                  {t("Compare recorded stock to the sum of all movements.")}
                </p>
              </div>
            </div>
            <button
              className="btn outline"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  checked(await request("/settings/integrity-check")),
                )
              }
            >
              {t("Run integrity check")}
            </button>
            {check && (
              <div className={"notice " + (check.ok ? "" : "amber")}>
                <Check size={15} />
                {t(
                  check.ok
                    ? "All product balances match the stock ledger."
                    : "A discrepancy was found. Review stock movements.",
                )}{" "}
                {!check.ok && (
                  <pre>{JSON.stringify(check.discrepancies, null, 2)}</pre>
                )}
              </div>
            )}
          </section>
        </>
      )}
      {tab === "Workspace" && (
        <section className="settings-card">
          <h2>{t("Company logo")}</h2>
          <p>{t("PNG, JPEG, or WebP. Maximum 2 MB.")}</p>
          {form.logo_path && (
            <PrivateImage src={form.logo_path} alt={t("Company logo")} />
          )}
          <input
            style={{ marginTop: 10 }}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={t("Upload logo")}
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) upload(e.target.files[0]);
            }}
          />
        </section>
      )}
    </>
  );
}
const workspaceFields: FieldSpec[] = [
  { key: "system_name", required: true, maxLength: 80 },
  { key: "company_name", required: true, maxLength: 120 },
  { key: "company_phone", type: "tel", maxLength: 32 },
  { key: "company_email", type: "email", maxLength: 120 },
  { key: "company_address", wide: true, type: "textarea", maxLength: 300 },
];
const preferenceFields: FieldSpec[] = [
  { key: "currency_code", required: true, maxLength: 3 },
  { key: "currency_symbol", required: true, maxLength: 8 },
  { key: "time_zone", required: true },
  {
    key: "date_format",
    options: [
      ["YYYY-MM-DD", "YYYY-MM-DD"],
      ["DD/MM/YYYY", "DD/MM/YYYY"],
      ["MM/DD/YYYY", "MM/DD/YYYY"],
    ],
  },
  {
    key: "default_language",
    options: [
      ["en", "English"],
      ["so", "Soomaali"],
    ],
  },
  {
    key: "default_theme",
    options: [
      ["light", "Light"],
      ["dark", "Dark"],
    ],
  },
  { key: "low_stock_threshold", type: "number", min: 0, required: true },
  {
    key: "session_timeout_minutes",
    type: "number",
    min: 5,
    max: 720,
    required: true,
  },
];
