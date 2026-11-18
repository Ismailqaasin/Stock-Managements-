"use client";
import { useMemo } from "react";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import { useEffect, useRef, useState, useId } from "react";
import Link from "next/link";
import {
  X,
  LoaderCircle,
  AlertCircle,
  ArrowUpRight,
  Download,
  Printer,
  PackageOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useApp, useFormat, useT } from "@/lib/context";
import { download, request } from "@/lib/api";
import { fieldNames, type Row, type PageResult } from "@/lib/modules";
export function Brand() {
  return (
    <span className="brand">
      <img src="/mark.svg" alt="" />
      <span>
        Stockroom<span className="brand-period">.</span>
      </span>
    </span>
  );
}
export function PageTitle({
  kicker,
  title,
  sub,
  children,
}: {
  kicker?: string;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <header className="page-title">
      <div>
        {kicker && (
          <div className="eyebrow">
            <span className="kicker-line" />
            {t(kicker)}
          </div>
        )}
        <h1>{t(title)}</h1>
        <p>{t(sub)}</p>
      </div>
      {children && <div className="title-actions">{children}</div>}
    </header>
  );
}
export function Loading() {
  const t = useT();
  return (
    <div className="loading" role="status">
      <LoaderCircle size={17} className="spin" />
      {t("Loading workspace…")}
    </div>
  );
}
export function Problem({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const t = useT();
  return (
    <div className="problem" role="alert">
      <AlertCircle size={17} />
      <span>{t(message)}</span>
      {retry && <button onClick={retry}>{t("Try again")}</button>}
    </div>
  );
}
export function Modal({
  title,
  sub,
  children,
  close,
  wide = false,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const t = useT(),
    ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const d = ref.current;
    const old = document.activeElement as HTMLElement | null;
    d?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d?.close();
      document.body.style.overflow = overflow;
      old?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) {
          const b = ref.current.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            close();
        }
      }}
    >
      <header>
        <div>
          <div className="eyebrow">{t("Warehouse workspace")}</div>
          <h2 id={id}>{t(title)}</h2>
          {sub && <p>{t(sub)}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          aria-label={t("Close")}
        >
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Drop({
  button,
  children,
  className = "",
}: {
  button: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  className?: string;
}) {
  const [open, set] = useState(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) set(false);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") set(false);
    };
    window.addEventListener("mousedown", f);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("mousedown", f);
      window.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <div className={"drop " + className} ref={ref}>
      <button
        className="drop-trigger"
        aria-expanded={open}
        onClick={() => set(!open)}
      >
        {button}
      </button>
      {open && <div className="popover">{children(() => set(false))}</div>}
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  const t = useT();
  const tone =
    /^(Active|In stock|Completed|Approved|Delivered|Good|Verified)$/.test(value)
      ? "green"
      : /^(Pending|Low stock|InProgress)$/.test(value)
        ? "amber"
        : /^(Archived|Cancelled|Reversed|Rejected|Failed|Damaged|Out of stock)$/.test(
              value,
            )
          ? "red"
          : "blue";
  return (
    <span className={"badge " + tone}>
      <i />
      {t(value)}
    </span>
  );
}
export function Display({ k, v }: { k: string; v: any }) {
  const t = useT(),
    fmt = useFormat();
  if (v == null || v === "") return <span className="muted">—</span>;
  if (["status", "stock_status", "condition"].includes(k))
    return <Badge value={v} />;
  if (["selling_price", "total_amount", "unit_price", "line_total"].includes(k))
    return <>{fmt.amount(+v)}</>;
  if (k.endsWith("_at") || k === "date" || k.endsWith("_date"))
    return <>{fmt.date(String(v), k.endsWith("_at"))}</>;
  if (k === "file_size") return <>{(v / 1024 / 1024).toFixed(2)} MB</>;
  if (typeof v === "object")
    return <pre className="json">{JSON.stringify(v, null, 2)}</pre>;
  if (typeof v === "boolean") return <>{t(v ? "Yes" : "No")}</>;
  return (
    <>
      {[
        "action",
        "type",
        "customer_type",
        "gender",
        "movement_type",
        "admin",
        "entity_type",
      ].includes(k)
        ? t(String(v))
        : String(v)}
    </>
  );
}
export function DataTable({
  rows,
  cols,
  onView,
}: {
  rows: Row[];
  cols: string[];
  onView?: (r: Row) => void;
}) {
  const t = useT();
  const columns = useMemo(
    () => cols.map((key) => ({ accessorKey: key, id: key })),
    [cols],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    getRowId: (row, index) => String(row.id ?? index),
  });
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {table.getFlatHeaders().map(({ id: k }) => (
              <th key={k}>{t(fieldNames[k] ?? k)}</th>
            ))}
            {onView && (
              <th>
                <span className="sr-only">{t("View details")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {table
            .getRowModel()
            .rows.map(({ id, original: r, getVisibleCells }) => (
              <tr
                key={id}
                className={onView ? "click-row" : ""}
                onClick={() => onView?.(r)}
              >
                {getVisibleCells().map(({ column: { id: k } }, i) => (
                  <td
                    key={k}
                    className={
                      (i === 0 ? "first-col " : "") +
                      (["sku", "reference_no", "order_no"].includes(k)
                        ? "mono"
                        : "")
                    }
                  >
                    <Display k={k} v={r[k]} />
                  </td>
                ))}
                {onView && (
                  <td>
                    <button
                      className="icon-button tiny"
                      aria-label={
                        t("View details") +
                        " " +
                        (r.reference_no ?? r.name ?? r.id)
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onView(r);
                      }}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pager({
  data,
  setPage,
}: {
  data: PageResult;
  setPage: (v: number) => void;
}) {
  const t = useT();
  return (
    <footer className="pager">
      <span>
        {data.totalCount.toLocaleString()}{" "}
        {t(data.totalCount === 1 ? "record" : "records")}
      </span>
      <div>
        <button
          aria-label={t("Previous page")}
          className="icon-button tiny"
          disabled={data.page <= 1}
          onClick={() => setPage(data.page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {t("Page")} {data.page} / {Math.max(1, data.totalPages)}
        </span>
        <button
          aria-label={t("Next page")}
          className="icon-button tiny"
          disabled={data.page >= data.totalPages}
          onClick={() => setPage(data.page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </footer>
  );
}
export function Empty({
  title = "No records yet",
  sub = "Records will appear here as you work.",
  children,
  icon: Icon = PackageOpen,
}: {
  title?: string;
  sub?: string;
  children?: React.ReactNode;
  icon?: typeof PackageOpen;
}) {
  const t = useT();
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={25} strokeWidth={1.55} />
      </div>
      <h3>{t(title)}</h3>
      <p>{t(sub)}</p>
      {children}
    </div>
  );
}
export function PdfButtons({ url, name }: { url: string; name: string }) {
  const { notify } = useApp(),
    t = useT();
  const [busy, set] = useState(false);
  async function run(print = false) {
    set(true);
    try {
      await download(url, name + ".pdf", print);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      set(false);
    }
  }
  return (
    <div className="button-row">
      <button
        className="btn outline compact"
        disabled={busy}
        onClick={() => run(true)}
      >
        <Printer size={15} />
        {t("Print")}
      </button>
      <button
        className="btn outline compact"
        disabled={busy}
        onClick={() => run()}
      >
        <Download size={15} />
        {t("Export PDF")}
      </button>
    </div>
  );
}
export function PrivateImage({ src, alt }: { src: string; alt: string }) {
  const [url, set] = useState("");
  useEffect(() => {
    let cancelled = false,
      u = "";
    request<Blob>(src.replace(/^\/api\//, "/"), "GET", undefined, true, true)
      .then((b) => {
        if (!cancelled) {
          u = URL.createObjectURL(b);
          set(u);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [src]);
  return url ? <img className="private-image" src={url} alt={alt} /> : null;
}
export function Jump({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  const { href } = useApp();
  return (
    <Link className="jump" href={href(to)}>
      {children}
      <ChevronRight size={14} />
    </Link>
  );
}
