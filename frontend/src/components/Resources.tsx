"use client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Filter,
  Info,
  Download,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useApp, useT } from "@/lib/context";
import { request, params, download } from "@/lib/api";
import { modules, fieldNames, type Row, type PageResult } from "@/lib/modules";
import {
  PageTitle,
  DataTable,
  Pager,
  Empty,
  PdfButtons,
  Problem,
  Loading,
  Modal,
  Display,
  PrivateImage,
} from "./UI";
import { EntryForm, Field } from "./Forms";
export function ResourcePage({ resource }: { resource: string }) {
  const m = modules[resource],
    { route, go, refresh, notify } = useApp(),
    t = useT();
  const [q, search] = useState(""),
    [filter, select] = useState(""),
    [page, setPage] = useState(1),
    [busy, wait] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    select(
      m.filters
        ? (new URLSearchParams(window.location.search).get(m.filters[0]) ?? "")
        : "",
    );
    setReady(true);
  }, [resource, m]);
  const filters = {
    q,
    page,
    pageSize: 12,
    ...(m.filters ? { [m.filters[0]]: filter } : {}),
  };
  const query = useQuery({
    queryKey: ["list", resource, filters],
    queryFn: () => request<PageResult>("/" + m.api + params(filters)),
    enabled: ready,
    refetchInterval: (q) =>
      resource === "backups" &&
      (q.state.data?.items ?? []).some((r) => r.status === "InProgress")
        ? 2000
        : false,
  });
  const data = query.data;
  const actual = resource === "stock-out" ? "stock-outs" : m.api,
    id = Number(route[1]);
  const doc = useQuery({
    queryKey: ["detail", actual, id],
    queryFn: () => request("/" + actual + "/" + id),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  function create() {
    if (resource === "backups") go("backups/create");
    else go(resource + "/create");
  }
  function view(row: Row) {
    if (resource === "stock-out")
      go(
        (row.source_type === "orders" ? "orders" : "stock-out") +
          "/" +
          row.source_id,
      );
    else go(resource + "/" + row.id);
  }
  async function backup() {
    wait(true);
    try {
      const job = await request("/backups", "POST", {});
      await refresh();
      go("backups");
      notify(
        job.status === "InProgress" ? "Backup queued." : "Backup created.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      wait(false);
    }
  }
  return (
    <>
      <PageTitle
        kicker={
          ["products", "categories", "customers"].includes(resource)
            ? "Workspace"
            : ["audit-logs", "backups"].includes(resource)
              ? "Management"
              : "Operations"
        }
        title={m.title}
        sub={m.desc}
      >
        {m.create && (
          <button className="btn primary" onClick={create}>
            <Plus size={15} />
            {t(m.create)}
          </button>
        )}
      </PageTitle>
      <section className="panel">
        <header className="panel-head">
          <div className="panel-title">
            <m.icon size={17} />
            <h2>{t("All records")}</h2>
            <span className="count-pill">{data?.totalCount ?? "—"}</span>
          </div>
          <PdfButtons
            url={
              (m.report ? "/reports/" + m.report : "/" + m.api) +
              "/pdf" +
              params({ ...filters, page: null, pageSize: null })
            }
            name={resource}
          />
        </header>
        <div className="list-toolbar">
          <label className="search-box">
            <Search size={15} />
            <input
              aria-label={t("Search records")}
              placeholder={t("Search records…")}
              value={q}
              onChange={(e) => {
                search(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {m.filters && (
            <label className="button-row">
              <Filter size={14} className="muted" />
              <select
                aria-label={t("Filter records")}
                className="filter-select"
                value={filter}
                onChange={(e) => {
                  select(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">
                  {t("All") +
                    " " +
                    t(fieldNames[m.filters[0]] ?? m.filters[0]).toLowerCase()}
                </option>
                {m.filters[1].map((v) => (
                  <option value={v} key={v}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {query.error ? (
          <Problem message={query.error.message} retry={query.refetch} />
        ) : !data ? (
          <Loading />
        ) : data.items.length ? (
          <DataTable cols={m.cols} rows={data.items} onView={view} />
        ) : (
          <Empty
            icon={m.icon}
            title={q || filter ? "No matching records" : "No records yet"}
            sub={
              q || filter
                ? "Try another search or clear your filters."
                : resource === "products"
                  ? "Add your first product to start building your catalog."
                  : resource === "backups"
                    ? "Create a database snapshot to protect your workspace."
                    : "New records will appear here."
            }
          >
            {q || filter ? (
              <button
                className="btn outline compact"
                onClick={() => {
                  search("");
                  select("");
                  setPage(1);
                }}
              >
                {t("Clear filters")}
              </button>
            ) : m.create ? (
              <button className="btn subtle compact" onClick={create}>
                <Plus size={13} />
                {t(m.create)}
              </button>
            ) : null}
          </Empty>
        )}
        {data && <Pager data={data} setPage={setPage} />}
      </section>
      {route[1] === "create" &&
        m.create &&
        (resource === "backups" ? (
          <Modal
            title="Create backup"
            close={() => {
              if (!busy) go(resource);
            }}
          >
            <div className="modal-body">
              <div className="notice">
                <ShieldCheck size={17} />
                {t(
                  "Creates a database archive with a SHA-256 checksum. Keep a copy outside this server.",
                )}
              </div>
            </div>
            <footer className="modal-foot">
              <button
                className="btn outline"
                disabled={busy}
                onClick={() => go(resource)}
              >
                {t("Cancel")}
              </button>
              <button className="btn primary" disabled={busy} onClick={backup}>
                {busy && <LoaderCircle size={14} className="spin" />}
                {t("Create backup")}
              </button>
            </footer>
          </Modal>
        ) : (
          <EntryForm resource={resource} close={() => go(resource)} />
        ))}
      {id > 0 &&
        (doc.error ? (
          <Modal title="View details" close={() => go(resource)}>
            <div className="modal-body">
              <Problem message={doc.error.message} />
            </div>
          </Modal>
        ) : doc.data ? (
          route[2] === "edit" &&
          (["products", "customers", "categories"].includes(resource) ||
            (resource === "orders" && doc.data.status === "Pending")) ? (
            <EntryForm
              key={doc.data.version}
              existing={doc.data}
              resource={resource}
              close={() => go(resource + "/" + id)}
            />
          ) : (
            <Details
              resource={resource}
              api={actual}
              key={actual + ":" + id}
              doc={doc.data}
              close={() => go(resource)}
            />
          )
        ) : (
          <Modal title="View details" close={() => go(resource)}>
            <Loading />
          </Modal>
        ))}
    </>
  );
}
const txActions: Record<string, string> = {
  confirm: "Confirm order",
  deliver: "Mark delivered",
  cancel: "Cancel order",
  reverse: "Reverse transaction",
  approve: "Approve return",
  reject: "Reject return",
  archive: "Archive",
  activate: "Reactivate",
  verify: "Verify backup",
  restore: "Restore backup",
};
function Details({
  resource,
  api,
  doc: d,
  close,
}: {
  resource: string;
  api: string;
  doc: Row;
  close: () => void;
}) {
  const { go, notify, refresh } = useApp(),
    t = useT();
  const [op, action] = useState(""),
    [why, reason] = useState(""),
    [pass, pwd] = useState(""),
    [confirm, conf] = useState(""),
    [busy, wait] = useState(false),
    [error, err] = useState("");
  const m = modules[resource],
    catalog = ["products", "customers", "categories"].includes(resource),
    editable = catalog || (resource === "orders" && d.status === "Pending");
  const [historyPage, setHistoryPage] = useState(1),
    [historyTab, selectHistory] = useState("orders");
  const related = useQuery({
    queryKey: ["history", api, d.id, historyPage],
    queryFn: () =>
      request(
        "/" +
          api +
          "/" +
          d.id +
          (resource === "products" ? "/movements" : "/history") +
          params({ page: historyPage, pageSize: 10 }),
      ),
    enabled: resource === "products" || resource === "customers",
  });
  const ops = catalog
    ? [d.is_active ? "archive" : "activate"]
    : resource === "orders"
      ? d.status === "Pending"
        ? ["confirm", "cancel"]
        : d.status === "Confirmed"
          ? ["deliver", "cancel"]
          : []
      : resource === "returns" && d.status === "Pending"
        ? ["approve", "reject"]
        : ["stock-in", "stock-out"].includes(resource) &&
            d.status === "Completed"
          ? ["reverse"]
          : resource === "backups" && d.status === "Completed"
            ? ["verify", "restore"]
            : [];
  const hasReason = ["cancel", "reject", "reverse"].includes(op);
  async function execute(e: React.FormEvent) {
    e.preventDefault();
    wait(true);
    err("");
    try {
      const root = "/" + api + "/" + d.id;
      await request(
        root + "/" + (["archive", "activate"].includes(op) ? "status" : op),
        ["archive", "activate"].includes(op) ? "PATCH" : "POST",
        op === "restore"
          ? { password: pass, confirmation: confirm }
          : catalog
            ? { is_active: op === "activate" }
            : { reason: why },
      );
      if (op === "restore") {
        sessionStorage.removeItem("stockroom_setup");
        window.location.assign(
          window.location.pathname.replace(
            /\/[^/]+\/backups\/\d+$/,
            "/" + document.documentElement.lang + "/login",
          ),
        );
        return;
      }
      await refresh();
      action("");
      notify("Action completed.");
    } catch (e) {
      err((e as Error).message);
    } finally {
      wait(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    wait(true);
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Image must be under 2 MB.");
      const data = new FormData();
      data.append("file", file);
      await request("/products/" + d.id + "/image", "POST", data);
      await refresh();
      notify("Image saved.");
    } catch (e) {
      err((e as Error).message);
    } finally {
      wait(false);
    }
  }
  const keys = Array.from(new Set([...m.cols, ...Object.keys(d)])).filter(
    (k) =>
      ![
        "id",
        "version",
        "items",
        "image_path",
        "is_active",
        "order_date",
        "received_date",
        "out_date",
        "return_date",
        "adjustment_date",
        "occurred_at",
        "return_no",
        "user_agent",
      ].includes(k) &&
      !k.endsWith("_id") &&
      d[k] != null &&
      d[k] !== "",
  );
  return (
    <Modal
      title={
        d.name ?? d.full_name ?? d.reference_no ?? m.singular + " #" + d.id
      }
      sub={m.singular + " details"}
      close={() => {
        if (!busy) close();
      }}
      wide
    >
      <div className="modal-body">
        {error && <Problem message={error} />}
        {d.image_path && <PrivateImage src={d.image_path} alt={d.name} />}
        <dl className="detail-grid">
          {keys.map((k) => (
            <div key={k}>
              <dt>{t(fieldNames[k] ?? k.replaceAll("_", " "))}</dt>
              <dd>
                <Display k={k} v={d[k]} />
              </dd>
            </div>
          ))}
        </dl>
        {d.items && (
          <>
            <h3 className="sub-label">{t("Line items")}</h3>
            <DataTable
              rows={d.items}
              cols={
                resource === "orders"
                  ? [
                      "product",
                      "quantity",
                      "unit_price",
                      "line_total",
                      "returned_qty",
                    ]
                  : resource === "returns"
                    ? ["product", "quantity", "condition"]
                    : ["product", "quantity"]
              }
            />
          </>
        )}
        {resource === "products" && (
          <>
            <h3 className="sub-label">{t("Product image")}</h3>
            <input
              aria-label={t("Upload image")}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <h3 className="sub-label">{t("Stock movements")}</h3>
            {related.data?.items?.length ? (
              <DataTable
                cols={["reference_no", "date", "quantity", "stock_after"]}
                rows={related.data.items}
              />
            ) : (
              <p className="summary-copy">{t("No movements yet")}</p>
            )}
          </>
        )}
        {resource === "products" &&
          related.data &&
          related.data.totalPages > 1 && (
            <Pager data={related.data as PageResult} setPage={setHistoryPage} />
          )}
        {resource === "customers" && (
          <>
            <h3 className="sub-label">{t("Customer history")}</h3>
            <div className="settings-tabs">
              {["orders", "returns", "dispatches"].map((k) => (
                <button
                  key={k}
                  className={historyTab === k ? "active" : ""}
                  onClick={() => {
                    selectHistory(k);
                    setHistoryPage(1);
                  }}
                >
                  {t(
                    k === "orders"
                      ? "Orders"
                      : k === "returns"
                        ? "Returns"
                        : "Stock out",
                  )}
                </button>
              ))}
            </div>
            {related.data?.[historyTab]?.items?.length ? (
              <>
                <DataTable
                  cols={["reference_no", "date", "quantity", "status"]}
                  rows={related.data[historyTab].items}
                  onView={(row) =>
                    go(
                      historyTab === "dispatches"
                        ? "orders/" + row.source_id
                        : historyTab + "/" + row.id,
                    )
                  }
                />
                <Pager
                  data={related.data[historyTab]}
                  setPage={setHistoryPage}
                />
              </>
            ) : related.isLoading ? (
              <Loading />
            ) : (
              <p className="summary-copy">{t("No records yet")}</p>
            )}
          </>
        )}
        {related.error && <Problem message={related.error.message} />}
        {op ? (
          <form onSubmit={execute} className="document-action">
            <div className={"notice " + (op === "restore" ? "amber" : "")}>
              <Info size={16} />
              <span>
                <b>{t(txActions[op])}</b>
                <br />
                {t(
                  op === "restore"
                    ? "This replaces the database and ends all sessions. A safety backup is created first."
                    : "Confirm this change. The action will be recorded in the audit log.",
                )}
              </span>
            </div>
            {hasReason && (
              <Field
                spec={{ key: "reason", required: true, type: "textarea" }}
                value={why}
                onChange={reason}
              />
            )}{" "}
            {op === "restore" && (
              <div className="form-grid">
                <Field
                  spec={{
                    key: "password",
                    label: "Administrator password",
                    type: "password",
                    required: true,
                  }}
                  value={pass}
                  onChange={pwd}
                />
                <Field
                  spec={{
                    key: "confirmation",
                    label: "Type RESTORE",
                    required: true,
                  }}
                  value={confirm}
                  onChange={conf}
                />
              </div>
            )}
            <div className="button-row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn outline"
                disabled={busy}
                onClick={() => action("")}
              >
                {t("Back")}
              </button>
              <button
                className={"btn " + (op === "restore" ? "danger" : "primary")}
                disabled={busy || (op === "restore" && confirm !== "RESTORE")}
              >
                {busy && <LoaderCircle size={14} className="spin" />}
                {t("Confirm")}
              </button>
            </div>
          </form>
        ) : (
          <div
            className="button-row document-action"
            style={{ flexWrap: "wrap" }}
          >
            {editable && (
              <button
                className="btn primary compact"
                onClick={() => go(resource + "/" + d.id + "/edit")}
              >
                {t("Edit")}
              </button>
            )}
            {ops.map((o) => (
              <button
                key={o}
                className="btn outline compact"
                onClick={() => {
                  action(o);
                  reason("");
                  err("");
                }}
              >
                {t(txActions[o])}
              </button>
            ))}
            {resource === "backups" && d.status === "Completed" && (
              <button
                className="btn outline compact"
                onClick={() =>
                  download("/backups/" + d.id + "/download", d.file_name).catch(
                    (e) => err(e.message),
                  )
                }
              >
                <Download size={14} />
                {t("Download")}
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="modal-foot">
        <PdfButtons
          url={"/" + api + "/" + d.id + "/pdf"}
          name={d.reference_no ?? resource + "-" + d.id}
        />
        <button className="btn outline compact" disabled={busy} onClick={close}>
          {t("Close")}
        </button>
      </footer>
    </Modal>
  );
}
