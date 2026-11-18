"use client";
import { useState } from "react";
import { useApp, useT } from "@/lib/context";
import { request, setToken } from "@/lib/api";
import { ArrowRight, ShieldCheck, Globe2, LoaderCircle } from "lucide-react";
import { Brand, Problem } from "./UI";
import { Field } from "./Forms";
export function Login() {
  const { locale, setLocale, admin, preview, setSession } = useApp(),
    t = useT();
  const [reset, resetting] = useState(false),
    [name, user] = useState("admin"),
    [pass, pwd] = useState(""),
    [newPass, np] = useState(""),
    [key, rk] = useState(""),
    [saved, confirm] = useState(false),
    [busy, wait] = useState(false),
    [error, err] = useState(""),
    [message, msg] = useState("");
  const initial = admin?.must_change_password,
    firstKey =
      typeof window !== "undefined"
        ? sessionStorage.getItem("stockroom_key")
        : null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    wait(true);
    err("");
    try {
      if (reset) {
        await request("/auth/reset-password", "POST", {
          recoveryKey: key,
          newPassword: newPass,
        });
        resetting(false);
        pwd("");
        msg("Password reset. Sign in with your new password.");
        return;
      }
      if (initial) {
        await request("/auth/change-password", "POST", {
          currentPassword: pass,
          newPassword: newPass,
        });
        sessionStorage.removeItem("stockroom_key");
        setToken("");
        setSession(
          await request("/auth/login", "POST", {
            username: admin?.username,
            password: newPass,
          }),
        );
        return;
      }
      setSession(
        await request("/auth/login", "POST", {
          username: name,
          password: pass,
        }),
      );
    } catch (e) {
      err((e as Error).message);
    } finally {
      wait(false);
    }
  }
  async function create() {
    wait(true);
    err("");
    try {
      setSession(
        await request("/auth/preview", "POST", { newWorkspace: true }),
      );
    } catch (e) {
      err((e as Error).message);
    } finally {
      wait(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-art">
        <Brand />
        <img src="/images/warehouse.webp" alt="" />
        <div>
          <div className="eyebrow">{t("Inventory workspace")}</div>
          <h1>{t("A clear view of your warehouse.")}</h1>
          <p>
            {t(
              "Receive goods, manage orders, and keep every unit accounted for.",
            )}
          </p>
        </div>
      </div>
      <div className="login-form-wrap">
        <button
          className="btn login-lang"
          onClick={() => setLocale(locale === "en" ? "so" : "en")}
        >
          <Globe2 size={14} />
          {locale === "en" ? "Soomaali" : "English"}
        </button>
        <form className="login-form" onSubmit={submit}>
          <div className="eyebrow">
            <ShieldCheck size={14} />
            {t("Secure workspace")}
          </div>
          <h2>
            {t(
              initial
                ? "Secure your account"
                : reset
                  ? "Recover account"
                  : "Welcome back",
            )}
          </h2>
          <p>
            {t(
              initial
                ? "Save your recovery key and replace the initial password."
                : reset
                  ? "Use your one-time recovery key to choose a new password."
                  : "Sign in to manage your warehouse.",
            )}
          </p>
          {error && <Problem message={error} />}{" "}
          {message && <div className="notice">{t(message)}</div>}
          {initial && firstKey && (
            <>
              <div className="code-block">{firstKey}</div>
              <label>
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => confirm(e.target.checked)}
                />{" "}
                {t("I saved my recovery key offline.")}
              </label>
            </>
          )}
          {!initial && !reset && (
            <Field
              spec={{
                key: "username",
                label: "Username",
                required: true,
                maxLength: 50,
              }}
              value={name}
              onChange={user}
            />
          )}
          {!reset && (
            <Field
              spec={{
                key: "password",
                label: initial ? "Current password" : "Password",
                type: "password",
                required: true,
                maxLength: 256,
              }}
              value={pass}
              onChange={pwd}
            />
          )}
          {reset && (
            <Field
              spec={{
                key: "recoveryKey",
                label: "Recovery key",
                required: true,
                type: "password",
              }}
              value={key}
              onChange={rk}
            />
          )}{" "}
          {(reset || initial) && (
            <Field
              spec={{
                key: "newPassword",
                label: "New password",
                required: true,
                type: "password",
                maxLength: 256,
                hint: "Use at least 12 characters.",
              }}
              value={newPass}
              onChange={np}
            />
          )}
          <button
            className="btn primary"
            disabled={busy || (initial && !!firstKey && !saved)}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <ArrowRight size={15} />
            )}{" "}
            {t(
              initial
                ? "Save new password"
                : reset
                  ? "Reset password"
                  : "Sign in",
            )}
          </button>
          {!initial && (
            <button
              type="button"
              className="entry-back"
              onClick={() => {
                resetting(!reset);
                err("");
                msg("");
              }}
            >
              {t(reset ? "Back to sign in" : "Forgot your password?")}
            </button>
          )}
          {preview && !initial && !reset && (
            <button
              type="button"
              className="btn outline"
              disabled={busy}
              onClick={create}
            >
              {t("Open a new private workspace")}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
