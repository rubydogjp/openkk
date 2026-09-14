import { expect, test } from "@playwright/test";

test.use({ timezoneId: "Asia/Tokyo" });

test("updates the current date across midnight without reloading", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-12-31T23:59:50+09:00") });
  await page.goto("/fiscal-periods");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByPlaceholder("例: 2026年分")).toHaveValue("2026年分");
  await page.getByRole("button", { name: "キャンセル" }).click();

  await page.clock.fastForward(20_000);

  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByPlaceholder("例: 2026年分")).toHaveValue("2027年分");
});
