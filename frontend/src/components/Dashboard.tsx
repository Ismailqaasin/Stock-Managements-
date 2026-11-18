"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Warehouse,
  Boxes,
  Package,
  UsersRound,
  TriangleAlert,
  PackageX,
  Activity,
  History,
  ShieldCheck,
  LogIn,
  Undo2,
  SlidersHorizontal,
  Layers3,
  Clock3,
} from "lucide-react";
import { request } from "@/lib/api";
import { useApp, useT } from "@/lib/context";
import { operations, Row } from "@/lib/modules";
import { PageTitle, Drop, Jump, Loading, Problem } from "./UI";
export function Dashboard() {
  const { href, settings, locale } = useApp(),
    t = useT();
  const {
    data: d,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => request("/dashboard/summary"),
  });
  const [feed, setFeed] = useState("Activity");
  const num = (v: any) => (v == null ? "—" : Number(v).toLocaleString(locale));
  const metrics = [
    {
      label: "Total products",
      v: d?.products,
      icon: Package,
      tone: "green",
      url: "products",
      hint: "Active catalog",
    },
    {
      label: "Customers",
      v: d?.customers,
      icon: UsersRound,
      tone: "blue",
      url: "customers",
      hint: "Registered customers",
    },
    {
      label: "Low stock",
      v: d?.low_stock,
      icon: TriangleAlert,
      tone: "amber",
      url: "reports/low-stock",
      hint: "Below threshold",
    },
    {
      label: "Out of stock",
      v: d?.out_of_stock,
      icon: PackageX,
      tone: "red",
      url: "reports/out-of-stock",
      hint: "No units remaining",
    },
  ];
  return (
    <>
      <PageTitle
        kicker="Workspace overview"
        title="Dashboard"
        sub="Your warehouse operations, all in one place."
      >
        <Drop
          className="primary-drop"
          button={
            <>
              <Plus size={16} />
              {t("New transaction")}
              <ChevronDown size={14} />
            </>
          }
        >
          {(close) => (
            <>
              <div className="popover-title">{t("New transaction")}</div>
              {[
                ...operations,
                { title: "New return", path: "returns/create", icon: Undo2 },
                {
                  title: "Adjust stock",
                  path: "adjustments/create",
                  icon: SlidersHorizontal,
                },
              ].map(({ title, path, icon: Icon }) => (
                <Link key={path} onClick={close} href={href(path)}>
                  <Icon size={16} />
                  {t(title)}
                </Link>
              ))}
            </>
          )}
        </Drop>
      </PageTitle>
      {error && <Problem message={error.message} retry={refetch} />}
      <section className="stock-banner" aria-label={t("Warehouse snapshot")}>
        <div className="blueprint" />
        <div className="banner-art">
          <img
            src="/images/warehouse-cutout.webp"
            alt={t("Isometric warehouse with a loading dock and forklift")}
          />
        </div>
        <div className="banner-content">
          <div className="banner-kicker">
            <span className="live-dot" />
            {t("Live inventory")}
          </div>
          <h2>{t("Warehouse snapshot")}</h2>
          <div className="snapshot-numbers">
            {[
              ["On hand", d?.on_hand],
              ["Reserved", d?.reserved],
              ["Available", d?.available],
            ].map(([l, v]) => (
              <div key={l}>
                <span className="snapshot-value">
                  {num(v)} <small>{t("units")}</small>
                </span>
                <span className="snapshot-label">{t(l)}</span>
              </div>
            ))}
          </div>
        </div>
        <span className="warehouse-code">WH — 01</span>
      </section>
      <div className="stats-grid">
        {metrics.map(({ label, v, icon: Icon, tone, url, hint }) => (
          <Link className={"stat-card " + tone} key={label} href={href(url)}>
            <div className="stat-top">
              <span className={"tile small " + tone}>
                <Icon size={18} strokeWidth={1.7} />
              </span>
              <ArrowUpRight size={15} className="card-arrow" />
            </div>
            <div className="stat-value">{num(v)}</div>
            <span className="stat-label">{t(label)}</span>
          </Link>
        ))}
      </div>
      <section className="ops-section">
        <div className="section-heading">
          <h2>{t("Quick operations")}</h2>
          <span className="section-line" />
          <span className="section-meta">{t("Warehouse shortcuts")}</span>
        </div>
        <div className="ops-grid">
          {operations.map(({ title, desc, path, icon: Icon, tone }) => (
            <Link href={href(path)} className="op-card" key={title}>
              <span className={"tile " + tone}>
                <Icon size={21} strokeWidth={1.7} />
              </span>
              <span className="op-text">
                <strong>{t(title)}</strong>
                <small>{t(desc)}</small>
              </span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      </section>
      <div className="dash-lower">
        <section className="panel feed-panel">
          <header className="panel-head">
            <div className="panel-title">
              <span className="section-icon">
                <History size={17} />
              </span>
              <h2>{t("Recent activity")}</h2>
            </div>
            <Jump to={feed === "Activity" ? "audit-logs" : "reports/ledger"}>
              {t("View all")}
            </Jump>
          </header>
          <div className="feed-tabs">
            {["Activity", "Movements"].map((f) => (
              <button
                className={f === feed ? "selected" : ""}
                key={f}
                onClick={() => setFeed(f)}
              >
                {t(f)}
              </button>
            ))}
          </div>
          {isLoading ? (
            <Loading />
          ) : !(feed === "Activity" ? d?.activity : d?.movements)?.length ? (
            <div className="mini-empty">
              <Layers3 size={22} />
              <b>{t("No movements yet")}</b>
              <small>{t("Receive stock to record your first movement.")}</small>
            </div>
          ) : (
            <ul className="feed-list">
              {(feed === "Activity" ? d?.activity : d?.movements)
                ?.slice(0, 4)
                .map((r: Row) => {
                  const Icon =
                    feed !== "Activity"
                      ? Boxes
                      : r.action === "Login"
                        ? LogIn
                        : r.action === "Setup"
                          ? Warehouse
                          : Activity;
                  return (
                    <li key={r.id}>
                      <span
                        className={
                          "feed-icon " +
                          (r.action === "Setup" ? "purple" : "green")
                        }
                      >
                        <Icon size={15} />
                      </span>
                      <div>
                        <strong>{t(r.description ?? r.product)}</strong>
                        <small>
                          {t(
                            r.action === "Login"
                              ? "Authentication"
                              : r.action === "Setup"
                                ? "Workspace"
                                : (r.entity_type ?? r.movement_type),
                          )}
                        </small>
                      </div>
                      <time>
                        {new Date(r.created_at).toLocaleTimeString(locale, {
                          timeZone: settings.time_zone,
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
        <section className="panel alerts-panel">
          <header className="panel-head">
            <div className="panel-title">
              <span className="section-icon amber">
                <TriangleAlert size={17} />
              </span>
              <h2>{t("Stock alerts")}</h2>
            </div>
            <span
              className={
                "count-pill " + (d?.low_stock || d?.out_of_stock ? "amber" : "")
              }
            >
              {num((d?.low_stock ?? 0) + (d?.out_of_stock ?? 0))}
            </span>
          </header>
          {d?.low_stock || d?.out_of_stock ? (
            <div className="alert-list">
              <Link href={href("reports/low-stock")}>
                <span>{t("Low stock")}</span>
                <strong>{d.low_stock}</strong>
                <ArrowRight size={15} />
              </Link>
              <Link href={href("reports/out-of-stock")}>
                <span>{t("Out of stock")}</span>
                <strong>{d.out_of_stock}</strong>
                <ArrowRight size={15} />
              </Link>
              {d.alerts?.slice(0, 2).map((a: Row) => (
                <Link href={href("products/" + a.id)} key={a.id}>
                  {a.name}
                  <b>
                    {num(a.current_stock)} {t("units")}
                  </b>
                </Link>
              ))}
            </div>
          ) : (
            <div className="healthy">
              <span className="healthy-icon">
                <ShieldCheck size={24} strokeWidth={1.55} />
              </span>
              <strong>{t("All clear")}</strong>
              <small>{t("No stock alerts at the moment.")}</small>
            </div>
          )}
        </section>
      </div>
      <section className="today-band">
        <div>
          <Clock3 size={16} />
          <b>{t("Today at a glance")}</b>
        </div>
        {[
          ["Units in", d?.today_in],
          ["Units out", d?.today_out],
          ["Orders", d?.today_orders],
        ].map(([k, v]) => (
          <span key={k}>
            {t(k)}
            <strong>{num(v)}</strong>
          </span>
        ))}
      </section>
    </>
  );
}
