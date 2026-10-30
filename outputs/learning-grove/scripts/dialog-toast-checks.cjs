const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function checkDialogToasts(browser, url, output) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [],
    cases = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const pass = (name) => cases.push({ name, passed: true });
  const close = () => page.getByRole("button", { name: "关闭弹窗" }).click();
  async function expectToast(text, inDialog = true) {
    const toast = page.locator(".toast");
    await page.waitForFunction(
      (expected) => document.querySelector(".toast")?.textContent === expected,
      text,
    );
    await toast.waitFor({ state: "visible" });
    assert.equal(await toast.innerText(), text);
    const placement = await toast.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return {
        inDialog: Boolean(element.closest("dialog[open]")),
        onTop: hit === element || element.contains(hit),
        withinViewport:
          box.left >= 0 &&
          box.right <= innerWidth &&
          box.top >= 0 &&
          box.bottom <= innerHeight,
      };
    });
    assert.equal(
      placement.onTop,
      true,
      "toast must be above the modal backdrop, not merely present in the DOM",
    );
    assert.equal(placement.inDialog, inDialog);
    assert.equal(placement.withinViewport, true);
  }
  try {
    await page.goto(url);
    await page.getByRole("heading", { name: /让每一点好奇/ }).waitFor();
    await page
      .locator(".mobile-nav")
      .getByRole("link", { name: "个人", exact: true })
      .click();
    await page.getByRole("button", { name: "导入档案", exact: true }).click();
    await page.getByLabel("档案文件", { exact: true }).setInputFiles({
      name: "unsupported-archive.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "unsupported-test-format", state: {} }),
      ),
    });
    await page.getByRole("button", { name: "检查并导入", exact: true }).click();
    await expectToast("不支持的档案格式");
    assert.equal(
      await page
        .getByLabel("档案文件", { exact: true })
        .evaluate((input) => input.files[0].name),
      "unsupported-archive.json",
    );
    if (output)
      await page.screenshot({
        path: path.join(output, "dialog-error.png"),
        fullPage: true,
      });
    pass(
      "Archive import error is readable above the modal and preserves the selected file",
    );

    await close();
    await expectToast("不支持的档案格式", false);
    await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "恢复导入前档案", exact: true })
      .click();
    await expectToast("没有可恢复的导入前档案", false);
    await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
    pass(
      "Outside-dialog errors keep their original text, placement and four-second dismissal",
    );

    await page
      .locator(".mobile-nav")
      .getByRole("link", { name: "学习空间", exact: true })
      .click();
    await page
      .getByRole("button", { name: "体验高数演示树", exact: true })
      .click();
    await page.locator(".reading-card").waitFor();
    await page.getByRole("button", { name: /^学习资料 ·/ }).click();
    await page.getByText("粘贴 / 导入文字材料", { exact: true }).click();
    await page.getByLabel("材料标题", { exact: true }).fill("保留的材料标题");
    await page
      .getByLabel("从 TXT / Markdown 文件读取", { exact: true })
      .setInputFiles({
        name: "too-large.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(100001, "a"),
      });
    await expectToast("文字文件太大，请选取所需章节");
    assert.equal(
      await page.getByLabel("材料标题", { exact: true }).inputValue(),
      "保留的材料标题",
    );
    pass("Material file errors are readable and keep the entered title");
    await close();

    await page.getByRole("button", { name: "调整讲法", exact: true }).click();
    await page.getByLabel("希望怎么调整", { exact: true }).fill("   ");
    await page
      .getByRole("button", { name: "记下并应用到后续内容", exact: true })
      .click();
    await expectToast("请填写想调整的地方");
    assert.equal(
      await page.getByLabel("希望怎么调整", { exact: true }).inputValue(),
      "   ",
    );
    pass(
      "Feedback validation failures remain visible inside the dialog and keep input",
    );
    await close();

    await page
      .getByRole("button", { name: "自愿加强学习", exact: true })
      .click();
    await page.getByLabel("你的想法", { exact: true }).fill("   ");
    await page.getByRole("button", { name: "看看解释", exact: true }).click();
    await expectToast("写下一点想法即可");
    assert.equal(
      await page.getByLabel("你的想法", { exact: true }).inputValue(),
      "   ",
    );
    pass("Reinforcement validation failures remain visible and keep input");
    await close();

    for (const width of [360, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole("button", { name: /^学习资料 ·/ }).click();
      await page.getByText("粘贴 / 导入文字材料", { exact: true }).click();
      await page
        .getByLabel("从 TXT / Markdown 文件读取", { exact: true })
        .setInputFiles({
          name: "too-large.txt",
          mimeType: "text/plain",
          buffer: Buffer.alloc(100001, "a"),
        });
      await expectToast("文字文件太大，请选取所需章节");
      await close();
      await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
    }
    pass(
      "Dialog messages stay on top and within the viewport at 360, 390 and 1280 pixels",
    );
    assert.deepEqual(errors, []);
    return cases;
  } catch (error) {
    if (output)
      await page.screenshot({
        path: path.join(output, "dialog-error-failure.png"),
        fullPage: true,
      });
    throw error;
  } finally {
    await context.close();
  }
}

module.exports = { checkDialogToasts };
if (require.main === module) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    playwright = require("/usr/local/lib/node_modules/playwright");
  }
  (async () => {
    const output = process.env.ZHIZHI_DIALOG_OUTPUT;
    if (output) fs.mkdirSync(output, { recursive: true });
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const cases = await checkDialogToasts(
        browser,
        process.env.ZHIZHI_URL || "http://localhost:5175/",
        output,
      );
      const report = { passed: true, cases, browser: browser.version() };
      if (output)
        fs.writeFileSync(
          path.join(output, "dialog-errors.json"),
          JSON.stringify(report, null, 2),
        );
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await browser.close();
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
