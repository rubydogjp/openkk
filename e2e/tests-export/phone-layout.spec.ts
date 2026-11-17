import { expect, test } from "@playwright/test";

import { waitUntilBootPhase } from "../helpers";

test("電話の幅では、知らせがメニューのアカウントを覆わない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitUntilBootPhase(page, "ready");
  await expect(
    page.getByText("データはこのブラウザの中だけにあります"),
  ).toBeVisible();

  await page.getByRole("button", { name: "メニューを開く" }).click();
  const menu = page.getByRole("dialog", { name: "ナビゲーションメニュー" });
  await expect(menu).toBeVisible();
  await menu
    .getByRole("button", { name: "アカウントメニュー" })
    .click({ trial: true });
});
