import { test, expect } from "@playwright/test";
test("category and customer catalog, registered reservations, cancellation and archive", async ({
  page,
}) => {
  const dialog = page.getByRole("dialog");
  const visit = async (p: string) => page.goto("/en/" + p);
  await visit("categories/create");
  await dialog.getByLabel("Category name").fill("Containers");
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(dialog).toHaveCount(0);
  await visit("customers/create");
  await dialog.getByLabel("Full name").fill("Customer One");
  await dialog.getByLabel("Phone", { exact: true }).fill("0700000000");
  await dialog.getByRole("button", { name: "Add customer" }).click();
  await expect(dialog).toHaveCount(0);
  await visit("products/create");
  await dialog.getByLabel("Product name").fill("Pallet box");
  await dialog.getByLabel("SKU", { exact: true }).fill("PALLET");
  await dialog
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Containers" });
  await dialog
    .getByRole("button", { name: "Add product", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await visit("stock-in/create");
  await dialog
    .getByLabel("Product", { exact: true })
    .selectOption({ label: "Pallet box · PALLET (0 available)" });
  await dialog.getByLabel("Quantity").fill("6");
  await dialog.getByRole("button", { name: "Receive stock" }).click();
  await expect(dialog).toHaveCount(0);
  await visit("orders/create");
  await dialog
    .getByLabel("Customer", { exact: true })
    .selectOption({ label: "Customer One" });
  await dialog
    .getByLabel("Product", { exact: true })
    .selectOption({ label: "Pallet box · PALLET (6 available)" });
  await dialog.getByLabel("Quantity").fill("4");
  await dialog.getByRole("button", { name: "Create order" }).click();
  await expect(dialog).toHaveCount(0);
  await visit("dashboard");
  await expect(page.locator(".snapshot-value").nth(1)).toContainText("4 units");
  await expect(page.locator(".snapshot-value").nth(2)).toContainText("2 units");
  await visit("orders/1/edit");
  await dialog.getByLabel("Quantity").fill("3");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await dialog.getByRole("button", { name: "Confirm order" }).click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel order" }).click();
  await dialog.getByLabel("Reason", { exact: true }).fill("Not collected");
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    dialog.getByText("Cancelled", { exact: true }).first(),
  ).toBeVisible();
  await visit("customers/1");
  await expect(dialog.getByRole("cell", { name: "Cancelled" })).toBeVisible();
  await dialog.getByRole("button", { name: "Archive", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog.getByText("Archived", { exact: true })).toBeVisible();
  await visit("dashboard");
  await expect(page.locator(".snapshot-value").first()).toContainText(
    "6 units",
  );
  await expect(page.locator(".snapshot-value").nth(1)).toContainText("0 units");
});
