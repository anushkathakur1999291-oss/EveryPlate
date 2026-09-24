import { chromium } from 'playwright';

const ARTIFACT_DIR = '/home/samashech/.gemini/antigravity-cli/brain/8750faba-5658-4932-b2a6-86d9a38658bc';

async function run() {
  console.log('🧪 Starting Dark Mode verification...');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/brave-origin',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    colorScheme: 'light',
  });

  const page = await context.newPage();

  // 1. Visit Login Page
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  console.log('✓ Page loaded');

  // Verify initial light mode
  let isDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log(`Initial dark class: ${isDarkClass} (expected: false)`);
  if (isDarkClass) throw new Error('Expected light mode initially');

  // Find ThemeToggle in header
  const toggleBtn = page.locator('header button[title*="dark mode" i], header button[aria-label*="dark mode" i]').first();
  await toggleBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Theme toggle button located on SignIn page');

  // 2. Click ThemeToggle
  await toggleBtn.click();
  await page.waitForTimeout(300);

  // Verify dark mode class added
  isDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const storedTheme = await page.evaluate(() => localStorage.getItem('annsafe_theme'));
  console.log(`After toggle -> isDark: ${isDarkClass}, data-theme: ${dataTheme}, localStorage: ${storedTheme}`);

  if (!isDarkClass || dataTheme !== 'dark' || storedTheme !== 'dark') {
    throw new Error('Dark mode was not properly applied or persisted!');
  }

  // Take screenshot of SignIn in Dark Mode
  await page.screenshot({ path: `${ARTIFACT_DIR}/signin_dark_mode.png`, fullPage: false });
  console.log('📸 Saved signin_dark_mode.png');

  // 3. Log in as Donor to verify in-portal Dark Mode
  console.log('Authenticating into Donor Portal...');
  const demoBtn = page.locator('button:has-text("Demo:")').first();
  await demoBtn.click();
  await page.waitForTimeout(1000);

  // Verify we are inside the portal
  await page.locator('.product-header').waitFor({ timeout: 10000 });
  await page.waitForSelector('text=Create a donation', { timeout: 10000 });
  console.log('✓ Inside Donor Portal');


  // Verify dark mode is still preserved
  isDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log(`In-portal dark class: ${isDarkClass}`);
  if (!isDarkClass) throw new Error('Dark mode did not persist after login!');

  // Check header ThemeToggle
  const getPortalToggle = () => page.locator('.product-header button[title*="mode" i]').first();
  await getPortalToggle().waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Theme toggle button located in portal header');

  // Take screenshot of Donor Portal in Dark Mode
  await page.screenshot({ path: `${ARTIFACT_DIR}/donor_portal_dark_mode.png`, fullPage: false });
  console.log('📸 Saved donor_portal_dark_mode.png');

  // 4. Toggle back to Light mode inside portal
  await getPortalToggle().click();
  await page.waitForTimeout(300);
  isDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log(`After toggling back to Light -> isDark: ${isDarkClass} (expected: false)`);
  if (isDarkClass) throw new Error('Failed to toggle back to light mode!');

  // 5. Toggle back to Dark mode to leave it dark
  await getPortalToggle().click();
  await page.waitForTimeout(300);
  isDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log(`After toggling back to Dark -> isDark: ${isDarkClass} (expected: true)`);
  if (!isDarkClass) throw new Error('Failed to re-enable dark mode!');

  console.log('🎉 ALL DARK MODE TESTS PASSED SUCCESSFULLY!');
  await browser.close();
}


run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
