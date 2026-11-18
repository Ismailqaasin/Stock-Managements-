"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Info, LoaderCircle } from "lucide-react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { request, params } from "@/lib/api";
import { useApp, useFormat, useT } from "@/lib/context";
import { modules, fieldNames, type Row, type PageResult } from "@/lib/modules";
import { Problem, Modal } from "./UI";
export type FieldSpec = {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: [string, string][];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
  wide?: boolean;
  maxLength?: number;
};
export function Field({
  spec: s,
  value,
  onChange,
}: {
  spec: FieldSpec;
  value: any;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const shared = {
    value: value ?? "",
    required: s.required,
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => onChange(e.target.value),
    name: s.key,
    "aria-label": t(s.label ?? fieldNames[s.key] ?? s.key),
  };
  return (
    <label className={"field " + (s.wide ? "span-two" : "")}>
      <span>
        {t(s.label ?? fieldNames[s.key] ?? s.key)}
        {s.required && <b className="req">*</b>}
      </span>
      {s.options ? (
        <select {...shared}>
          {s.options.map(([v, l]) => (
            <option key={v} value={v}>
              {t(l)}
            </option>
          ))}
        </select>
      ) : s.type === "textarea" ? (
        <textarea
          {...shared}
          placeholder={t(s.placeholder ?? "")}
          maxLength={s.maxLength ?? 4000}
        />
      ) : (
        <input
          {...shared}
          type={s.type ?? "text"}
          placeholder={t(s.placeholder ?? "")}
          min={s.min ?? (s.type === "number" ? 0 : undefined)}
          max={s.max}
          step={s.step ?? (s.type === "number" ? "1" : undefined)}
          maxLength={s.maxLength ?? 200}
        />
      )}
      {s.hint && <small>{t(s.hint)}</small>}
    </label>
  );
}
export async function allRows(
  r: string,
  filters: Record<string, unknown> = {},
) {
  const out: Row[] = [];
  for (let page = 1; ; page++) {
    const data = await request<PageResult>(
      "/" + r + params({ ...filters, page, pageSize: 100 }),
    );
    out.push(...data.items);
    if (page >= data.totalPages) break;
  }
  return out;
}
export function EntryForm({
  resource,
  existing,
  close,
}: {
  resource: string;
  existing?: Row;
  close: () => void;
}) {
  const { go, notify, refresh } = useApp(),
    t = useT(),
    fmt = useFormat(),
    cfg = modules[resource];
  const sale = resource === "stock-out",
    orders = resource === "orders",
    receipt = resource === "stock-in",
    ret = resource === "returns",
    adjust = resource === "adjustments";
  const { watch, control, handleSubmit } = useForm<Row>({
    defaultValues: {
      selling_price: "0.00",
      date: fmt.today(),
      type: "Order",
      customer_type: "Registered",
      quantity: "1",
      ...existing,
    },
  });
  const b = watch();
  const [items, lines] = useState<Row[]>(
      existing?.items?.map((i: Row) => ({ ...i })) ?? [
        { product_id: "", quantity: "1", condition: "Good", unit_price: "" },
      ],
    ),
    [busy, wait] = useState(false),
    [error, err] = useState("");
  const orderSale = sale && ["Order", "Cash"].includes(b.type),
    isOrder = orders || orderSale,
    isMulti = receipt || isOrder || ret;
  const pQ = useQuery({
    queryKey: ["choices", "products"],
    queryFn: () => allRows("products", { is_active: true }),
    enabled: receipt || sale || orders || adjust,
  });
  const cQ = useQuery({
    queryKey: ["choices", "categories"],
    queryFn: () => allRows("categories", { is_active: true }),
    enabled: resource === "products",
  });
  const custQ = useQuery({
    queryKey: ["choices", "customers"],
    queryFn: () => allRows("customers", { is_active: true }),
    enabled: isOrder,
  });
  const oQ = useQuery({
    queryKey: ["choices", "return-orders"],
    queryFn: async () => [
      ...(await allRows("orders", { status: "Confirmed" })),
      ...(await allRows("orders", { status: "Delivered" })),
    ],
    enabled: ret,
  });
  const original = useQuery({
    queryKey: ["order-items", b.order_id],
    queryFn: () => request("/orders/" + b.order_id),
    enabled: ret && !!b.order_id,
  });
  const originals: Row[] = original.data?.items ?? [];
  const products: Row[] = (pQ.data ?? []).map((p) => ({
    ...p,
    available:
      Number(p.available) +
      Number(
        existing?.items?.find((i: Row) => i.product_id === p.id)?.quantity ?? 0,
      ),
  }));
  const selectable =
    sale || orders ? products.filter((p) => p.available > 0) : products;
  const options = (
    rows: Row[],
    key = "name",
    placeholder = "Select an option",
  ): [string, string][] => [
    ["", placeholder],
    ...rows.map((r) => [String(r.id), String(r[key])] as [string, string]),
  ];
  const productOptions = (rows: Row[]): [string, string][] => [
    ["", "Select product"],
    ...rows.map(
      (r) =>
        [
          String(r.id),
          `${r.name} · ${r.sku} (${r.available} ${t("available")})`,
        ] as [string, string],
    ),
  ];
  const f = (s: FieldSpec) => (
    <Controller
      key={s.key}
      name={s.key}
      control={control}
      rules={{ required: s.required }}
      render={({ field }) => (
        <Field
          spec={s}
          value={field.value}
          onChange={(v) => {
            field.onChange(v);
            err("");
            if (s.key === "order_id")
              lines([{ order_item_id: "", quantity: "1", condition: "Good" }]);
          }}
        />
      )}
    />
  );
  const updateLine = (i: number, k: string, v: string) =>
    lines((old) =>
      old.map((row, n) =>
        i !== n
          ? row
          : {
              ...row,
              [k]: v,
              ...(k === "product_id"
                ? {
                    unit_price:
                      products.find((p) => String(p.id) === v)?.selling_price ??
                      "",
                  }
                : {}),
            },
      ),
    );
  const price =
    items.reduce(
      (sum, i) =>
        sum +
        Math.round(Number(i.unit_price || 0) * 100) * Number(i.quantity || 0),
      0,
    ) / 100;
  const registered =
    isOrder && (sale ? b.type === "Order" : b.customer_type === "Registered");
  const blocked =
    !pQ.isLoading && (receipt || sale || orders || adjust) && !selectable.length
      ? products.length
        ? "No available units. Receive stock before issuing an item."
        : "Add an active product before recording stock."
      : registered && !custQ.isLoading && !custQ.data?.length
        ? "Add a customer or choose a cash sale."
        : ret && !oQ.isLoading && !oQ.data?.length
          ? "Confirm or deliver an order before creating a return."
          : "";
  async function submit(values: Row) {
    if (busy) return;
    wait(true);
    err("");
    try {
      let payload: Row = { ...values },
        api = cfg.api;
      if (resource === "products") {
        z.object({
          name: z.string().trim().min(1),
          sku: z.string().trim().min(1),
          selling_price: z.coerce.number().nonnegative(),
        }).parse(b);
      }
      if (isMulti) {
        const lineSchema = z
          .object({ quantity: z.coerce.number().int().positive() })
          .passthrough();
        z.array(lineSchema).min(1).max(100).parse(items);
        payload.items = items;
      }
      if (isOrder) {
        api = "orders";
        payload.customer_type = registered ? "Registered" : "Cash";
        payload.customer_id = registered ? b.customer_id : null;
        payload.confirm = sale;
      }
      if (sale && !orderSale) {
        api = "stock-outs";
        payload.type = b.type;
      }
      if (adjust)
        payload.previous_quantity = products.find(
          (p) => p.id === Number(b.product_id),
        )?.current_stock;
      await request(
        "/" + api + (existing ? "/" + existing.id : ""),
        existing ? "PUT" : "POST",
        payload,
      );
      await refresh();
      notify(
        existing
          ? "Changes saved."
          : receipt
            ? "Stock received."
            : sale
              ? "Stock issued."
              : "Record created.",
      );
      close();
    } catch (e) {
      err(
        e instanceof z.ZodError
          ? "Check the required fields, quantities and prices."
          : (e as Error).message,
      );
    } finally {
      wait(false);
    }
  }
  const date: FieldSpec = { key: "date", type: "date", required: true };
  const notes: FieldSpec = { key: "notes", type: "textarea", wide: true };
  const requiredProduct: FieldSpec = {
    key: "product_id",
    options: productOptions(selectable),
    required: true,
  };
  return (
    <Modal
      title={existing ? "Edit " + cfg.singular.toLowerCase() : cfg.create!}
      close={() => {
        if (!busy) close();
      }}
      wide={isMulti}
    >
      <form
        onSubmit={handleSubmit(submit, () =>
          err("Check the required fields, quantities and prices."),
        )}
      >
        <div className="form-body">
          {error && <Problem message={error} />}
          {[pQ, cQ, custQ, oQ, original].find((q) => q.error) && (
            <Problem
              message={
                (
                  [pQ, cQ, custQ, oQ, original].find((q) => q.error)
                    ?.error as Error
                ).message
              }
            />
          )}
          <div className="form-grid">
            {resource === "products" &&
              [
                {
                  key: "name",
                  label: "Product name",
                  required: true,
                  wide: true,
                  placeholder: "e.g. Storage box",
                },
                {
                  key: "sku",
                  label: "SKU",
                  required: true,
                  maxLength: 50,
                  placeholder: "e.g. BOX-001",
                },
                {
                  key: "category_id",
                  options: options(cQ.data ?? [], "name", "Uncategorized"),
                },
                {
                  key: "selling_price",
                  type: "number",
                  step: "0.01",
                  required: true,
                },
                {
                  key: "low_stock_threshold",
                  type: "number",
                  hint: "Leave blank to use the workspace default.",
                },
                { key: "description", type: "textarea", wide: true },
              ].map(f)}
            {resource === "categories" &&
              [
                {
                  key: "name",
                  label: "Category name",
                  required: true,
                  wide: true,
                  maxLength: 100,
                },
                { key: "description", type: "textarea", wide: true },
              ].map(f)}
            {resource === "customers" &&
              [
                { key: "full_name", required: true, wide: true },
                { key: "phone", type: "tel", maxLength: 32 },
                { key: "email", type: "email", maxLength: 120 },
                {
                  key: "gender",
                  options: [
                    ["", "Not specified"],
                    ["Male", "Male"],
                    ["Female", "Female"],
                    ["Other", "Other"],
                  ] as [string, string][],
                },
                { key: "location" },
                notes,
              ].map(f)}
            {sale &&
              f({
                key: "type",
                label: "Dispatch type",
                options: [
                  ["Order", "Customer order"],
                  ["Cash", "Cash sale"],
                  ["Sample", "Sample"],
                  ["Gift", "Gift"],
                ],
                required: true,
              })}
            {orders &&
              f({
                key: "customer_type",
                options: [
                  ["Registered", "Registered"],
                  ["Cash", "Cash"],
                ],
                required: true,
              })}
            {(receipt || sale || orders || ret || adjust) && f(date)}
            {registered &&
              f({
                key: "customer_id",
                label: "Customer",
                required: true,
                options: options(
                  custQ.data ?? [],
                  "full_name",
                  "Select customer",
                ),
                wide: true,
              })}
            {isOrder &&
              !registered &&
              [
                { key: "cash_customer_name", placeholder: "Optional" },
                {
                  key: "cash_customer_phone",
                  type: "tel",
                  placeholder: "Optional",
                  maxLength: 32,
                },
              ].map(f)}
            {receipt &&
              [
                { key: "source_name", placeholder: "Optional" },
                {
                  key: "external_ref",
                  placeholder: "Optional",
                  maxLength: 100,
                },
              ].map(f)}
            {sale &&
              !orderSale &&
              [
                requiredProduct,
                {
                  key: "quantity",
                  type: "number",
                  min: 1,
                  max: products.find((p) => p.id === Number(b.product_id))
                    ?.available,
                  required: true,
                },
                { key: "recipient_name", required: true },
                { key: "reason", required: true, type: "textarea", wide: true },
              ].map(f)}
            {adjust &&
              [
                requiredProduct,
                {
                  key: "new_quantity",
                  type: "number",
                  required: true,
                  hint: b.product_id
                    ? `${t("On hand")}: ${products.find((p) => p.id === Number(b.product_id))?.current_stock ?? 0}`
                    : undefined,
                },
                { key: "reason", required: true, type: "textarea", wide: true },
              ].map(f)}
            {ret &&
              [
                {
                  key: "order_id",
                  options: options(
                    oQ.data ?? [],
                    "reference_no",
                    "Select original order",
                  ),
                  required: true,
                },
                { key: "reason", required: true, wide: true },
              ].map(f)}
          </div>
          {blocked && (
            <div className="notice amber">
              <Info size={15} />
              <div>
                {t(blocked)}{" "}
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    go(
                      ret
                        ? "orders"
                        : blocked.startsWith("Add a customer")
                          ? "customers/create"
                          : products.length
                            ? "stock-in/create"
                            : "products/create",
                    )
                  }
                >
                  {t(
                    ret
                      ? "View orders"
                      : blocked.startsWith("Add a customer")
                        ? "Add customer"
                        : products.length
                          ? "Receive stock"
                          : "Add product",
                  )}{" "}
                  →
                </button>
              </div>
            </div>
          )}
          {isMulti && (
            <>
              <div className="sub-label">{t("Line items")}</div>
              {items.map((item, i) => (
                <div className="item-line" key={i}>
                  <header>
                    <b>
                      {t("Item")} {String(i + 1).padStart(2, "0")}
                    </b>
                    {items.length > 1 && (
                      <button
                        type="button"
                        aria-label={t("Remove item")}
                        className="icon-button tiny"
                        onClick={() =>
                          lines((old) => old.filter((_, n) => n !== i))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </header>
                  <div className="line-fields">
                    <Field
                      spec={
                        ret
                          ? {
                              key: "order_item_id",
                              required: true,
                              options: options(
                                originals
                                  .filter((o) => o.returnable > 0)
                                  .map((o) => ({
                                    ...o,
                                    label: `${o.product} (${o.returnable} ${t("returnable")})`,
                                  })),
                                "label",
                                "Select order item",
                              ),
                            }
                          : requiredProduct
                      }
                      value={ret ? item.order_item_id : item.product_id}
                      onChange={(v) =>
                        updateLine(i, ret ? "order_item_id" : "product_id", v)
                      }
                    />
                    <Field
                      spec={{
                        key: "quantity",
                        type: "number",
                        min: 1,
                        required: true,
                        max: ret
                          ? originals.find((o) => o.id === +item.order_item_id)
                              ?.returnable
                          : isOrder
                            ? products.find((p) => p.id === +item.product_id)
                                ?.available
                            : undefined,
                      }}
                      value={item.quantity}
                      onChange={(v) => updateLine(i, "quantity", v)}
                    />
                    {isOrder && (
                      <Field
                        spec={{
                          key: "unit_price",
                          type: "number",
                          required: true,
                          step: "0.01",
                        }}
                        value={item.unit_price}
                        onChange={(v) => updateLine(i, "unit_price", v)}
                      />
                    )}{" "}
                    {ret && (
                      <Field
                        spec={{
                          key: "condition",
                          options: [
                            ["Good", "Good"],
                            ["Damaged", "Damaged"],
                          ],
                        }}
                        value={item.condition}
                        onChange={(v) => updateLine(i, "condition", v)}
                      />
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="btn outline compact"
                onClick={() =>
                  lines((x) => [
                    ...x,
                    {
                      product_id: "",
                      quantity: 1,
                      unit_price: "",
                      condition: "Good",
                    },
                  ])
                }
                disabled={items.length >= 100}
              >
                <Plus size={14} />
                {t("Add line")}
              </button>
            </>
          )}
          {(isMulti || sale || adjust) && (
            <div style={{ marginTop: 15 }}>{f(notes)}</div>
          )}
          {isOrder && (
            <div className="notice">
              <Info size={15} />
              <div>
                <b>
                  {t("Total amount")}: {fmt.amount(price)}
                </b>
                <br />
                {t(
                  sale
                    ? "Stock is deducted immediately."
                    : "Pending orders reserve units until confirmation.",
                )}
              </div>
            </div>
          )}
          {ret && (
            <div className="notice">
              <Info size={15} />
              {t(
                "On approval, good items return to stock. Damaged items are recorded only.",
              )}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          <button
            type="button"
            className="btn outline"
            disabled={busy}
            onClick={close}
          >
            {t("Cancel")}
          </button>
          <button className="btn primary" disabled={busy || !!blocked}>
            {busy && <LoaderCircle size={14} className="spin" />}
            {t(existing ? "Save changes" : cfg.create!)}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
