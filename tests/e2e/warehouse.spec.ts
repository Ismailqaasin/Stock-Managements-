import { test, expect } from "@playwright/test";
test("empty warehouse → receipt → cash sale → good return → count → PDF → backup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/en/dashboard");
  await expect(
    page.getByRole("heading", { name: "Warehouse snapshot" }),
  ).toBeVisible();
  const visit = async (path: string) => {
    await page.goto("/en/" + path);
  };
  const modal = page.getByRole("dialog");
  await visit("products/create");
  await modal.getByLabel("Product name").fill("Storage bin");
  await modal.getByLabel("SKU", { exact: true }).fill("BIN-01");
  await modal.getByLabel("Selling price").fill("12.50");
  await modal.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Storage bin", exact: true }),
  ).toBeVisible();
  await visit("stock-in/create");
  await modal
    .getByLabel("Product", { exact: true })
    .selectOption({ label: "Storage bin · BIN-01 (0 available)" });
  await modal.getByLabel("Quantity", { exact: true }).fill("12");
  await modal.getByRole("button", { name: "Receive stock" }).click();
  await expect(modal).toHaveCount(0);
  await visit("stock-out/create");
  await modal.getByLabel("Dispatch type").selectOption("Cash");
  await modal.getByLabel("Cash customer name").fill("Walk-in buyer");
  await modal
    .getByLabel("Product", { exact: true })
    .selectOption({ label: "Storage bin · BIN-01 (12 available)" });
  await modal.getByLabel("Quantity", { exact: true }).fill("4");
  await modal.getByRole("button", { name: "Issue stock" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Confirmed" })).toBeVisible();
  await visit("returns/create");
  await modal.getByLabel("Original order").selectOption({ index: 1 });
  await modal.getByLabel("Reason", { exact: true }).fill("Unused item");
  await modal
    .getByLabel("Order item", { exact: true })
    .selectOption({ index: 1 });
  await modal.getByRole("button", { name: "New return" }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole("button", { name: /View details RET-/ }).click();
  await modal.getByRole("button", { name: "Approve return" }).click();
  await modal.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    modal.getByText("Approved", { exact: true }).first(),
  ).toBeVisible();
  await visit("adjustments/create");
  await modal
    .getByLabel("Product", { exact: true })
    .selectOption({ label: "Storage bin · BIN-01 (9 available)" });
  await modal.getByLabel("New count").fill("10");
  await modal.getByLabel("Reason", { exact: true }).fill("Physical count");
  await modal.getByRole("button", { name: "Adjust stock" }).click();
  await expect(modal).toHaveCount(0);
  await visit("reports/stock");
  await expect(
    page.getByRole("cell", { name: "10", exact: true }).first(),
  ).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.pdf$/);
  await visit("backups/create");
  await modal.getByRole("button", { name: "Create backup" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Completed" })).toBeVisible();
  await visit("settings");
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await page.getByRole("button", { name: "Run integrity check" }).click();
  await expect(
    page.getByText("All product balances match the stock ledger."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile navigation, Somali, persistent theme and private workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/dashboard");
  await expect(page.locator(".snapshot-value").first()).toContainText("0");
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(page.getByText("No records yet")).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "Soomaali", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Alaabta", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Beddel muuqaalka" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("lang", "so");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
