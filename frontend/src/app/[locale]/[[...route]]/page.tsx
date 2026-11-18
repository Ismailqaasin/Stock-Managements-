import { notFound, redirect } from "next/navigation";
import { WarehouseApp } from "@/components/Workspace";
const pages = [
  "dashboard",
  "login",
  "categories",
  "products",
  "customers",
  "stock-in",
  "stock-out",
  "orders",
  "returns",
  "adjustments",
  "reports",
  "audit-logs",
  "backups",
  "settings",
];
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; route?: string[] }>;
}) {
  const { locale, route } = await params;
  if (!["so", "en"].includes(locale)) notFound();
  if (!route?.length) redirect("/" + locale + "/dashboard");
  if (!pages.includes(route[0])) notFound();
  return <WarehouseApp locale={locale} route={route} />;
}
