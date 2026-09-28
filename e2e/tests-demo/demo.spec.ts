import { test, expect } from "@playwright/test";
import { clickButton, expectStep } from "../helpers";

test("仕訳と期首BSを変更でき、再読み込みでサンプルに戻る", async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  await page.goto("/");
  await expectStep(page, "日々の仕訳");
  await expect(page.getByRole("button", { name: "仮締めを実行" })).toBeEnabled();
  await expect(page.getByRole("note")).toContainText("再読み込みするとサンプルデータに戻ります。");

  await page.getByRole("button", { name: "期首のBSを入力", exact: true }).click();
  await expect(page.getByRole("region", { name: "資産の部", exact: true })).toContainText("2,602,000");
  await page.getByRole("button", { name: "編集する", exact: true }).click();
  for (const [account, value] of [["現金", "330000"], ["元入金", "1844000"]] as const) {
    const amount = page.getByLabel(`${account} 金額`, { exact: true });
    await amount.click();
    await amount.press("ControlOrMeta+A");
    await amount.pressSequentially(value);
    await expect(amount).toHaveValue(value);
  }
  await clickButton(page, "上書き保存");
  await expectStep(page, "日々の仕訳");
  await page.getByRole("button", { name: "期首のBSを入力", exact: true }).click();
  await expect(page.getByRole("region", { name: "資産の部", exact: true })).toContainText("2,612,000");

  await page.getByRole("link", { name: "仕訳", exact: true }).click();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
  await drawer.getByLabel("摘要").fill("体験版の入力テスト");
  await drawer.getByLabel("借方金額").first().fill("1000");
  await drawer.getByLabel("貸方金額").last().fill("1000");
  await clickButton(page, "作成");
  await expect(drawer).not.toBeVisible();
  await expect(page.getByText("体験版の入力テスト")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "追加", exact: true })).toBeVisible();
  await expect(page.getByText("体験版の入力テスト")).toHaveCount(0);
  await page.getByRole("link", { name: "手順", exact: true }).click();
  await expectStep(page, "日々の仕訳");
  await page.getByRole("button", { name: "期首のBSを入力", exact: true }).click();
  await expect(page.getByRole("region", { name: "資産の部", exact: true })).toContainText("2,602,000");
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("サンプルで締め処理と次期への引継ぎを試せる", async ({ page }) => {
  await page.goto("/");
  await expectStep(page, "日々の仕訳");
  await clickButton(page, "仮締めを実行");
  await clickButton(page, "実行する");
  await clickButton(page, "実行する");
  await clickButton(page, "次の手順へ");
  await expectStep(page, "本締め");
  await clickButton(page, "本締めを実行");
  await clickButton(page, "実行する");
  await expect(page.getByText("財務諸表の概要")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "手順", exact: true }).click();
  await expectStep(page, "書類を受け取る");
  await clickButton(page, "全て受け取りました");
  await expectStep(page, "次の期間へ");
  await clickButton(page, "次期を作成");
  await expectStep(page, "期間を開始");
  await expect(page.getByRole("textbox").first()).toHaveValue("2027年分");
  await page.reload();
  await page.getByRole("link", { name: "手順", exact: true }).click();
  await expectStep(page, "日々の仕訳");
});

test("期首BSの科目と金額が狭い幅やサイドバー表示の境界でも重ならない", async ({ page }) => {
  await page.goto("/steps/opening-bs");
  await expect(page.getByRole("region", { name: "資産の部", exact: true })).toBeVisible();
  for (const width of [320, 390, 640, 641, 768, 800, 880, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const violations = await page.locator(".bk-opening-bs-row").evaluateAll((rows) => rows.flatMap((row) => {
      const rect = row.getBoundingClientRect();
      if (!rect.height) return [];
      const label = row.children[0]!.getBoundingClientRect();
      const amount = row.children[1]!.getBoundingClientRect();
      const problems = [];
      if (label.right > amount.left) problems.push("科目と金額が重なる");
      if (amount.right > rect.right || label.left < rect.left) problems.push("表からはみ出す");
      for (const child of row.querySelectorAll("div, span")) {
        if (child.scrollWidth > child.clientWidth + 1) problems.push(`文字が切れる: ${child.textContent}`);
      }
      return problems;
    }));
    expect(violations, `viewport ${width}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("favicon・アプリ内・ホーム画面のアイコンを配信する", async ({ page, request }) => {
  await page.goto("/");
  const icon = page.locator('img[src="/images/openkk-icon.png"]');
  await expect(icon).toBeVisible();
  expect(await icon.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(256);
  const svgUrl = await page.locator('link[rel="icon"][type="image/svg+xml"]').first().getAttribute("href");
  const svg = await request.get(svgUrl!);
  expect(await svg.text()).toContain('fill="#2584fc"');
  expect(await svg.text()).toContain('shape-rendering="crispEdges"');
  const favicon = await request.get("/favicon.ico");
  expect((await favicon.body()).readUInt16LE(4)).toBe(3);
  const manifest = await (await request.get("/manifest.json")).json();
  for (const { src } of manifest.icons) expect((await request.get(src)).ok()).toBe(true);
});
