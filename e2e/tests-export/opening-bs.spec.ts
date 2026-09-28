import { test, expect } from "@playwright/test";
import { clickButton, createFiscalPeriod, expectStep } from "../helpers";

test("期首BSを狭い画面で入力し、幅を変えても値を失わず保存できる", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await createFiscalPeriod(page, "期首BSの表示確認");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "期首のBSを入力");
  const cash = page.getByRole("textbox", { name: "現金 金額", exact: true });
  const capital = page.getByRole("textbox", { name: "元入金 金額", exact: true });
  await cash.fill("2602000");
  await capital.fill("2602000");

  for (const width of [320, 390, 640, 641, 768, 800, 880, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(cash).toHaveValue("2,602,000");
    const overlaps = await page.locator(".bk-opening-bs-row").evaluateAll((rows) => rows.flatMap((row) => {
      if (!row.getBoundingClientRect().height) return [];
      const label = row.children[0]!.getBoundingClientRect();
      const field = row.querySelector("input");
      if (!field) return [];
      const amount = field.getBoundingClientRect();
      return label.right > amount.left || amount.right > row.getBoundingClientRect().right
        ? [field.getAttribute("aria-label")] : [];
    }));
    expect(overlaps, `viewport ${width}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }

  await page.setViewportSize({ width: 800, height: 900 });
  await clickButton(page, "保存して次へ");
  await expectStep(page, "日々の仕訳");
  await page.goto("/steps/opening-bs");
  await expect(page.getByRole("region", { name: "資産の部", exact: true })).toContainText("2,602,000");
  await page.getByRole("button", { name: "編集する", exact: true }).click();
  await expect(cash).toHaveValue("2,602,000");
  await expect(capital).toHaveValue("2,602,000");
});
