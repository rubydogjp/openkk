import { test, expect, type Page } from "@playwright/test";

test("追加できる環境では目的と操作を案内する", async ({ page }) => {
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "オープン会計をインストール" })).toBeVisible();
  await expect(page.getByText("インストールせずに、ブラウザで使うこともできます。", { exact: false })).toBeVisible();
  await offerInstall(page, "accepted");
  await expect(page.getByRole("status")).toContainText("下のボタンからホーム画面に追加できます");
  await expect(page.getByRole("button", { name: "ブラウザで開く" })).toBeEnabled();
  await page.getByRole("button", { name: "ホーム画面に追加", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ホーム画面に追加済みです");
  await expect(page.getByRole("button", { name: "アプリを開く" })).toBeEnabled();
});

test("追加をキャンセルしてもブラウザで使い始められる", async ({ page }) => {
  await page.goto("/install");
  await expect(page.getByRole("status")).toBeVisible();
  await offerInstall(page, "dismissed");
  await page.getByRole("button", { name: "ホーム画面に追加", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("追加をキャンセルしました");
  await page.getByRole("button", { name: "ブラウザで開く" }).click();
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
});

test("ボタンから追加できない場合はメニューとブラウザ利用を案内する", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "install", { value: undefined });
  });
  await page.goto("/install");
  await expect(page.getByRole("status")).toContainText("ブラウザのメニューに");
  await expect(page.getByRole("status")).not.toContainText("この環境では「ホーム画面に追加」できません");
  await page.getByRole("button", { name: "ブラウザで開く" }).click();
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
});

async function offerInstall(page: Page, outcome: "accepted" | "dismissed") {
  await page.evaluate((outcome) => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome }),
    });
    window.dispatchEvent(event);
  }, outcome);
}
