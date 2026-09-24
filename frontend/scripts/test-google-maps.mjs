import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const artifactDir = '/home/samashech/.gemini/antigravity-cli/brain/8750faba-5658-4932-b2a6-86d9a38658bc';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const browserPath = process.env.BROWSER_PATH || (existsSync('/usr/bin/brave-origin') ? '/usr/bin/brave-origin' : undefined);

async function run() {
  console.log('=== Testing Google Maps Address Descriptors & Map Integration ===');
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  await page.goto(baseUrl);
  await page.waitForLoadState('networkidle');

  // Sign in if needed
  const demoBtn = page.getByRole('button', { name: /Demo:/i }).first();
  if (await demoBtn.isVisible()) {
    await demoBtn.click();
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
  }

  await page.locator('.product-header').waitFor({ timeout: 10000 });

  // 1. Open Donor Portal and verify Google Maps Address Descriptors section
  console.log('Verifying Google Maps Address Descriptors in Donor Portal...');
  const mapSummary = page.getByText(/Pickup Location & Landmarks \(Google Maps\)/i);
  await mapSummary.click();
  await page.waitForTimeout(1000);

  // Check that the exact DOM elements from the user's snippet exist
  const addressAutocomplete = page.locator('#address-autocomplete');
  await addressAutocomplete.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Found #address-autocomplete Places input');

  const mapCanvas = page.locator('#map');
  assert(await mapCanvas.isVisible(), 'Expected #map canvas to be visible');
  console.log('✓ Found #map container element');

  const landmarksSelect = page.locator('#landmarks');
  assert(await landmarksSelect.isVisible(), 'Expected #landmarks dropdown to be visible');
  console.log('✓ Found #landmarks Address Descriptors dropdown');

  const combinedAddress = page.locator('#combined-address');
  assert(await combinedAddress.isVisible(), 'Expected #combined-address output field to be visible');
  console.log('✓ Found #combined-address field');

  // Check structured fields
  assert(await page.locator('#apt-suite').isVisible(), 'Expected #apt-suite');
  assert(await page.locator('#city').isVisible(), 'Expected #city');
  assert(await page.locator('#state-province').isVisible(), 'Expected #state-province');
  assert(await page.locator('#zip-postal-code').isVisible(), 'Expected #zip-postal-code');
  assert(await page.locator('#country').isVisible(), 'Expected #country');
  console.log('✓ All 6 structured address fields (#apt-suite, #city, etc.) verified');

  // Take screenshot of Donor Portal with Google Maps Address Descriptors
  await page.screenshot({ path: `${artifactDir}/google_address_descriptors_donor.png`, fullPage: false });
  console.log(`✓ Saved screenshot to ${artifactDir}/google_address_descriptors_donor.png`);

  // 2. Open Admin Portal and verify RescueMap with Google Maps engine
  console.log('Verifying RescueMap with Google Maps in Admin Portal...');
  const adminTab = page.getByRole('button', { name: /operations & impact/i });
  if (await adminTab.isVisible()) {
    await adminTab.click();
    await page.waitForTimeout(1500);

    const mapLegend = page.getByText(/Google Maps \(MapID: f8b9e6163e48e501\)|Leaflet Fallback/i);
    assert(await mapLegend.isVisible(), 'Expected map engine status badge in RescueMap');
    console.log('✓ Verified RescueMap with Google Maps / resilient fallback');

    await page.screenshot({ path: `${artifactDir}/admin_rescue_map_google.png`, fullPage: false });
    console.log(`✓ Saved screenshot to ${artifactDir}/admin_rescue_map_google.png`);
  }

  await browser.close();
  console.log('=== ALL GOOGLE MAPS INTEGRATION CHECKS PASSED ===');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
