const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_MODULE || '/usr/local/lib/node_modules/playwright'); }

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'verification');
  fs.mkdirSync(out, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const cases = [];
  const check = (name, details = {}) => cases.push({ name, passed: true, ...details });
  async function ready() { await page.getByTestId('status').filter({ hasText: '已就绪' }).waitFor(); }
  async function statusIncludes(text) { await page.waitForFunction(text => document.querySelector('[data-testid=status]')?.textContent.includes(text), text); }
  async function count() { return Number(await page.getByTestId('runs').textContent()); }
  const started = Date.now();
  try {
    await page.goto(process.env.PROBE_URL || 'http://localhost:5176/');
    await ready();
    check('Production React application mounts at mobile viewport');
    await page.getByRole('button', { name: '下一页' }).click();
    await page.getByTestId('page').filter({ hasText: '2 / 3' }).waitFor();
    await page.locator('#preference').fill('先给定义，再给完整数字例子');
    await page.getByRole('button', { name: '保存偏好' }).click();
    await statusIncludes('偏好已保存');
    await page.reload(); await ready();
    assert.equal(await page.getByTestId('page').textContent(), '2 / 3');
    assert.equal(await page.locator('#preference').inputValue(), '先给定义，再给完整数字例子');
    check('IndexedDB restores reading position and preference after reload');
    let before = await count();
    for (let i = 0; i < 50; i++) {
      await page.getByRole('button', { name: '运行 Pi 验证', exact: true }).click();
      await statusIncludes('Pi 验证通过');
      assert.equal(await count(), before + i + 1);
    }
    const result = JSON.parse(await page.getByTestId('result').textContent());
    assert.equal(result.audit.requests, 2);
    assert.equal(result.audit.toolCalls, 1);
    assert.ok(result.audit.trace.includes('read_learning_context'));
    assert.ok(result.result.goal.includes('先给定义，再给完整数字例子'));
    check('50 sequential real Pi loops complete with simulated model transport', { iterations: 50, requestsPerLoop: 2, toolsPerLoop: 1 });
    before = await count();
    const saved = await page.getByTestId('result').textContent();
    await page.getByRole('button', { name: '模拟网络失败' }).click();
    await statusIncludes('测试网络异常');
    assert.equal(await count(), before);
    assert.equal(await page.getByTestId('result').textContent(), saved);
    check('Simulated transport failure preserves the last committed result');
    await page.getByRole('button', { name: '启动慢任务' }).click();
    await statusIncludes('正在执行');
    await page.getByRole('button', { name: '下一页' }).click();
    await page.getByTestId('page').filter({ hasText: '3 / 3' }).waitFor();
    await page.getByRole('button', { name: '取消任务' }).click();
    await statusIncludes('已取消');
    assert.equal(await count(), before);
    assert.equal(await page.getByTestId('result').textContent(), saved);
    check('UI remains interactive during a pending request and cancellation preserves state');
    await page.getByRole('button', { name: '启动慢任务' }).click();
    await statusIncludes('正在执行');
    await page.reload(); await ready();
    assert.equal(await count(), before);
    assert.equal(await page.getByTestId('page').textContent(), '3 / 3');
    await page.getByRole('button', { name: '运行 Pi 验证', exact: true }).click();
    await statusIncludes('Pi 验证通过');
    assert.equal(await count(), before + 1);
    check('Reload during pending work preserves committed data and a new run succeeds');
    await context.setOffline(true);
    await page.getByRole('button', { name: '上一页' }).click();
    await page.getByTestId('page').filter({ hasText: '2 / 3' }).waitFor();
    await page.locator('#preference').fill('离线阅读保存检查');
    await page.getByRole('button', { name: '保存偏好' }).click();
    await statusIncludes('偏好已保存');
    await context.setOffline(false);
    await page.reload(); await ready();
    assert.equal(await page.locator('#preference').inputValue(), '离线阅读保存检查');
    check('Loaded application reads and saves locally while browser network is disabled');
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    }
    check('No horizontal overflow at widths 360, 390, and 768');
    await page.getByRole('button', { name: '检查原生桥接' }).click();
    await page.getByTestId('native').filter({ hasText: '尚未执行 Android 原生桥接' }).waitFor();
    check('Browser reports native bridge as untested rather than simulating native success');
    assert.deepEqual(errors, []);
    check('No browser JavaScript or console errors');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
    const report = { date: new Date().toISOString(), browser: browser.version(), viewport: '390x844', elapsedMs: Date.now() - started, passed: true, caseCount: cases.length, cases, errors, caveats: ['Chromium browser, not Android WebView or a physical phone.', 'Pi core and tools are real; model responses and transport failures are simulated.', 'No real model API, Android lifecycle, native bridge runtime, battery, device memory, or long-duration performance measured.'] };
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(out, 'browser-failure.json'), JSON.stringify({ date: new Date().toISOString(), error: String(error), cases, errors, body: await page.locator('body').innerText().catch(() => '') }, null, 2));
    await page.screenshot({ path: path.join(out, 'browser-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
