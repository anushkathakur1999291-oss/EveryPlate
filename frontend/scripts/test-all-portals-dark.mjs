import { chromium } from 'playwright';

const ARTIFACT_DIR = '/home/samashech/.gemini/antigravity-cli/brain/8750faba-5658-4932-b2a6-86d9a38658bc';

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/brave-origin',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
  });
  const page = await context.newPage();

  // Set dark mode in localStorage ahead of time
  await page.addInitScript(() => {
    localStorage.setItem('annsafe_theme', 'dark');
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // 1. Capture Receiver Portal
  const receiverTab = page.locator('nav[aria-label="Role selector"] button').nth(1);
  if (await receiverTab.isVisible()) {
    await receiverTab.click();
    await page.waitForTimeout(500);
    const demoBtn = page.locator('button:has-text("Demo:")').first();
    await demoBtn.click();
    await page.waitForSelector('.product-header', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/receiver_portal_dark_mode.png` });
    console.log('📸 Saved receiver_portal_dark_mode.png');
  }

  // 2. Driver Portal
  const signoutBtn = page.locator('.account-signout');
  if (await signoutBtn.isVisible()) {
    await signoutBtn.click();
    await page.waitForTimeout(500);
  }
  const driverTab = page.locator('nav[aria-label="Role selector"] button').nth(2);
  if (await driverTab.isVisible()) {
    await driverTab.click();
    await page.waitForTimeout(500);
    const demoBtn = page.locator('button:has-text("Demo:")').first();
    await demoBtn.click();
    await page.waitForSelector('.product-header', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/driver_portal_dark_mode.png` });
    console.log('📸 Saved driver_portal_dark_mode.png');
  }

  // 3. Admin Portal
  const signoutBtn2 = page.locator('.account-signout');
  if (await signoutBtn2.isVisible()) {
    await signoutBtn2.click();
    await page.waitForTimeout(500);
  }
  const adminTab = page.locator('nav[aria-label="Role selector"] button').nth(3);
  if (await adminTab.isVisible()) {
    await adminTab.click();
    await page.waitForTimeout(500);
    const demoBtn = page.locator('button:has-text("Demo:")').first();
    await demoBtn.click();
    await page.waitForSelector('.product-header', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/admin_portal_dark_mode.png` });
    console.log('📸 Saved admin_portal_dark_mode.png');
  }

  await browser.close();
}



run().catch(console.error);
