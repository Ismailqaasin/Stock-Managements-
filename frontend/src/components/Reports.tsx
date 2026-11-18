"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowLeft, Search, FileText } from "lucide-react";
import { useApp, useT } from "@/lib/context";
import { request, params } from "@/lib/api";
import {
  reports,
  reportCols,
  modules,
  fieldNames,
  type PageResult,
} from "@/lib/modules";
import {
  PageTitle,
  PdfButtons,
  DataTable,
  Empty,
  Loading,
  Problem,
  Pager,
} from "./UI";
export function Reports() {
  const { route, href } = useApp(),
    t = useT();
  const [q, search] = useState("");
  if (route[1]) return <Report key={route[1]} type={route[1]} />;
  const list = reports.filter((r) =>
    (t(r[1]) + " " + t(r[2])).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        kicker="Management"
        title="Reports"
        sub="Explore your warehouse data and export print-ready reports."
      />
      <div className="section-heading">
        <h2>
          {t("Report library")} <span className="count-pill">13</span>
        </h2>
        <label className="search-box">
          <Search size={14} />
          <input
            placeholder={t("Search reports…")}
            aria-label={t("Search reports")}
            value={q}
            onChange={(e) => search(e.target.value)}
          />
        </label>
      </div>
      {list.length ? (
        <div className="report-grid">
          {list.map(([slug, name, description, Icon], i) => (
            <Link
              className="report-card"
              href={href("reports/" + slug)}
              key={slug}
            >
              <div className="stat-top">
                <span
                  className={
                    "tile small " +
                    ["green", "blue", "amber", "peach", "purple"][i % 5]
                  }
                >
                  <Icon size={18} />
                </span>
                <ArrowUpRight size={15} />
              </div>
              <h2>{t(name)}</h2>
              <p>{t(description)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="No matching records"
          sub="Try another search or clear your filters."
        />
      )}
    </>
  );
}
function Report({ type }: { type: string }) {
  const { href } = useApp(),
    t = useT(),
    config = reports.find((r) => r[0] === type);
  const [from, start] = useState(""),
    [to, end] = useState(""),
    [q, search] = useState(""),
    [page, set] = useState(1),
    [selected, setSelected] = useState("");
  const selector = modules[type]?.filters;
  const extra = selector ? { [selector[0]]: selected } : {};
  const valid = !from || !to || from <= to;
  const filters = { from, to, q, page, pageSize: 15, ...extra };
  const query = useQuery({
    queryKey: ["report", type, filters],
    queryFn: () => request<PageResult>("/reports/" + type + params(filters)),
    enabled: !!config && valid,
  });
  if (!config) return <Empty title="Unknown report" />;
  return (
    <>
      <Link className="back-link" href={href("reports")}>
        <ArrowLeft size={14} />
        {t("Report library")}
      </Link>
      <PageTitle kicker="Reports" title={config[1]} sub={config[2]}>
        {valid && (
          <PdfButtons
            url={
              "/reports/" + type + "/pdf" + params({ from, to, q, ...extra })
            }
            name={type + "-report"}
          />
        )}
      </PageTitle>
      <section className="panel">
        <div className="report-tools">
          <label className="search-box">
            <Search size={14} />
            <input
              value={q}
              onChange={(e) => {
                search(e.target.value);
                set(1);
              }}
              aria-label={t("Search records")}
              placeholder={t("Search records…")}
            />
          </label>
          <div className="date-filters">
            {selector && (
              <select
                aria-label={t("Filter records")}
                className="filter-select"
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  set(1);
                }}
              >
                <option value="">
                  {t("All")} · {t(fieldNames[selector[0]] ?? selector[0])}
                </option>
                {selector[1].map((v) => (
                  <option key={v} value={v}>
                    {t(v)}
                  </option>
                ))}
              </select>
            )}
            <label>
              {t("From")}{" "}
              <input
                className="date-input"
                type="date"
                aria-label={t("From date")}
                value={from}
                onChange={(e) => {
                  start(e.target.value);
                  set(1);
                }}
              />
            </label>
            <label>
              {t("To")}{" "}
              <input
                className="date-input"
                type="date"
                aria-label={t("To date")}
                value={to}
                onChange={(e) => {
                  end(e.target.value);
                  set(1);
                }}
              />
            </label>
          </div>
        </div>
        {!valid ? (
          <Problem message="End date must not precede start date." />
        ) : query.error ? (
          <Problem message={query.error.message} retry={query.refetch} />
        ) : !query.data ? (
          <Loading />
        ) : query.data.items.length ? (
          <DataTable cols={reportCols[type]} rows={query.data.items} />
        ) : (
          <Empty
            icon={FileText}
            title="No matching records"
            sub="Records matching your report filters will appear here."
          />
        )}
        {query.data && valid && <Pager data={query.data} setPage={set} />}
      </section>
    </>
  );
}
