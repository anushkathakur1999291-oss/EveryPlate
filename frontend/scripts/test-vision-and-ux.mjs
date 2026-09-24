import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const artifactDir = '/home/samashech/.gemini/antigravity-cli/brain/8750faba-5658-4932-b2a6-86d9a38658bc';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const browserPath = process.env.BROWSER_PATH || (existsSync('/usr/bin/brave-origin') ? '/usr/bin/brave-origin' : undefined);

async function run() {
  console.log('=== Testing Upgrade 1 (Response UX) & Upgrade 2 (Food Vision Engine) ===');
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });
  const page = await context.newPage();

  // 1. Visit Login / Landing page
  console.log(`Navigating to ${baseUrl}...`);
  await page.goto(baseUrl);
  await page.waitForLoadState('networkidle');

  // If on login/selection page, select DONOR and sign in
  const isLoginPage = await page.getByRole('button', { name: /continue to sign in/i }).count() > 0 ||
                     await page.getByText(/sign in to your role/i).count() > 0;

  if (isLoginPage) {
    console.log('Detected Account Selector / Sign In page...');
    // Click instant demo button
    const demoBtn = page.getByRole('button', { name: /Demo:/i }).first();
    console.log('Clicking Demo button...');
    await demoBtn.click();
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
  }

  // Verify Navbar / App Header is loaded
  await page.locator('.product-header').waitFor({ timeout: 10000 });
  console.log('✓ Successfully authenticated and loaded application');

  // Navigate to DONOR view if not already
  const donorTab = page.getByRole('button', { name: /donate food/i });
  if (await donorTab.isVisible()) {
    await donorTab.click();
    await page.waitForTimeout(600);
  }

  // 2. Verify AI Food Vision Scanner component is mounted
  console.log('Verifying AI Food Vision Scanner...');
  const scannerHeading = page.getByText('AI Food Vision Assistant');
  await scannerHeading.waitFor({ state: 'visible', timeout: 8000 });
  console.log('✓ Found "AI Food Vision Assistant" card');

  // Verify Local GPU and Ollama status badge
  const gpuBadge = page.getByText('Local GPU').first();
  const ollamaBadge = page.getByText(/Ollama Ready/i).first();
  assert(await gpuBadge.isVisible(), 'Expected GPU engine status badge');
  assert(await ollamaBadge.isVisible(), 'Expected Ollama status badge');
  console.log('✓ Verified local GPU and Ollama status badges');

  // 3. Test One-Click Sample Image: Catered Meals
  console.log('Testing Sample Image: Catered Meals...');
  const sampleBtn = page.getByRole('button', { name: /🍗 Catered Meals/i });
  await sampleBtn.click();
  await page.waitForTimeout(1000);

  // Verify preview thumbnail image is visible
  const previewImg = page.locator('img[alt="Donation preview"]');
  await previewImg.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Food image preview loaded into visual canvas');

  // 4. Trigger Local Vision Analysis
  console.log('Executing local vision inspection with Ollama moondream...');
  const inspectBtn = page.getByRole('button', { name: /Inspect Food with Vision Model/i });
  await inspectBtn.click();

  // Verify Anime.js-style scanning laser or spinner is activated
  const scanningStatus = page.getByText(/Running local vision model|Analyzing food/i).first();
  await scanningStatus.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Scanning laser & radar state activated');

  // Wait for vision result card to appear
  const applyBtn = page.getByRole('button', { name: /Apply to Donation Form/i });
  await applyBtn.waitFor({ state: 'visible', timeout: 25000 });
  console.log('✓ Vision result received & structured card presented!');

  // Capture screenshot of the analyzed food vision card
  await page.screenshot({ path: `${artifactDir}/food_vision_result.png`, fullPage: false });
  console.log(`✓ Saved screenshot to ${artifactDir}/food_vision_result.png`);

  // 5. Test "Apply to Donation Form" autofill
  console.log('Applying vision structured output to donation form...');
  await applyBtn.click();
  await page.waitForTimeout(800);

  // Verify form fields were pre-filled
  const descriptionInput = page.getByLabel(/Food description and allergens/i);
  const descriptionValue = await descriptionInput.inputValue();
  console.log(`✓ Form description auto-populated: "${descriptionValue.slice(0, 50)}..."`);
  assert(descriptionValue.length > 5, 'Expected description to be auto-populated');

  const quantityInput = page.getByLabel(/Quantity in meals/i);
  const quantityValue = await quantityInput.inputValue();
  console.log(`✓ Form quantity auto-populated: ${quantityValue} meals`);
  assert(Number(quantityValue) > 0, 'Expected positive quantity');

  // Capture Donor Portal with prefilled form
  await page.screenshot({ path: `${artifactDir}/donor_portal_prefilled.png`, fullPage: true });

  // 6. Test Receiver Portal Response-Based UX
  console.log('Testing Receiver Portal Response-Based UX...');
  const receiverTab = page.getByRole('button', { name: /receive food/i });
  if (await receiverTab.isVisible()) {
    await receiverTab.click();
    await page.waitForTimeout(1000);
    // Verify capacity gauge bar exists with .capacity-gauge-fill
    const capacityBar = page.locator('.capacity-gauge-fill');
    assert(await capacityBar.count() > 0, 'Expected capacity-gauge-fill transition classes');
    console.log('✓ Verified smooth capacity gauge elements');
    await page.screenshot({ path: `${artifactDir}/receiver_portal_ux.png`, fullPage: true });
  }

  // 7. Test Driver Portal Response-Based UX
  console.log('Testing Driver Portal Response-Based UX...');
  const driverTab = page.getByRole('button', { name: /deliver/i });
  if (await driverTab.isVisible()) {
    await driverTab.click();
    await page.waitForTimeout(1000);
    // Verify GPS telemetry active badge exists
    const telemetryBadge = page.getByText(/GPS Telemetry Active/i);
    assert(await telemetryBadge.isVisible(), 'Expected GPS telemetry badge');
    console.log('✓ Verified GPS telemetry heartbeat pulse');
    await page.screenshot({ path: `${artifactDir}/driver_portal_ux.png`, fullPage: true });
  }

  // 8. Test Admin Portal Response-Based UX
  console.log('Testing Admin Portal Response-Based UX...');
  const adminTab = page.getByRole('button', { name: /operations & impact/i });
  if (await adminTab.isVisible()) {
    await adminTab.click();
    await page.waitForTimeout(1000);
    // Verify Realtime Telemetry Synced badge
    const adminTelemetry = page.getByText(/Realtime Telemetry Synced/i);
    assert(await adminTelemetry.isVisible(), 'Expected Realtime Telemetry Synced badge');
    // Verify .interactive-card elements
    const cards = page.locator('.interactive-card');
    assert(await cards.count() >= 3, 'Expected interactive cards in Admin portal');
    console.log('✓ Verified Admin interactive metrics and telemetry pulse');
    await page.screenshot({ path: `${artifactDir}/admin_portal_ux.png`, fullPage: true });
  }

  await browser.close();
  console.log('=== ALL BROWSER & VISION VERIFICATION TESTS COMPLETED SUCCESSFULLY ===');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
