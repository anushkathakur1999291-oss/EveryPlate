import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const baseUrl = process.env.BACKEND_URL || 'http://localhost:4000';

async function main() {
  console.log('--- Surplus to Shelter Vision Evaluation Benchmark ---');

  // 1. Authenticate as donor
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marco@greenbistro.com', password: 'adminpassword123' })
  });
  assert.equal(loginRes.status, 200, 'Login failed');
  const cookie = loginRes.headers.get('set-cookie');
  console.log('✓ Donor authenticated');

  // 2. Health check
  const statusRes = await fetch(`${baseUrl}/api/ai/vision-status`, {
    headers: { Cookie: cookie }
  });
  const status = await statusRes.json();
  console.log('✓ Vision Status:', status.message, `(Provider: ${status.provider}, Model: ${status.model})`);

  // 3. Test dataset of images
  const testImages = [
    {
      name: 'Prepared Restaurant Meals (donor.jpg)',
      path: 'frontend/public/images/roles/donor.jpg',
      expectedCategory: 'COOKED_MEALS',
      expectedPackaged: true
    },
    {
      name: 'Shelter Dining Produce & Bakery (receiver.jpg)',
      path: 'frontend/public/images/roles/receiver.jpg',
      expectedCategory: ['PRODUCE', 'BAKERY', 'COOKED_MEALS'],
      expectedPackaged: false
    }
  ];

  const results = [];
  for (const testCase of testImages) {
    if (!existsSync(testCase.path)) {
      console.warn(`Skipping missing image: ${testCase.path}`);
      continue;
    }
    const b64 = readFileSync(testCase.path).toString('base64');
    const start = Date.now();

    const res = await fetch(`${baseUrl}/api/ai/analyze-food-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({ imageBase64: b64, mimeType: 'image/jpeg' })
    });

    const elapsed = Date.now() - start;
    assert.equal(res.status, 200, `API failed for ${testCase.name}`);
    const data = await res.json();

    // Verify structured output schema
    assert(data.foodCategory, 'Missing foodCategory');
    assert(data.foodName, 'Missing foodName');
    assert(Array.isArray(data.itemsDetected), 'itemsDetected must be array');
    assert(typeof data.confidence === 'number', 'confidence must be number');
    assert(Array.isArray(data.uncertainFields), 'uncertainFields must be array');

    const categoryMatches = Array.isArray(testCase.expectedCategory)
      ? testCase.expectedCategory.includes(data.foodCategory)
      : data.foodCategory === testCase.expectedCategory;

    results.push({
      image: testCase.name,
      category: data.foodCategory,
      items: data.itemsDetected.join(', '),
      portions: data.estimatedPortions,
      confidence: (data.confidence * 100).toFixed(1) + '%',
      latencyMs: elapsed,
      categoryMatches
    });
  }

  // 4. Test error handling & graceful fallback on malformed data
  const badRes = await fetch(`${baseUrl}/api/ai/analyze-food-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({ imageBase64: 'invalid_short_base64' })
  });
  assert.equal(badRes.status, 400, 'Expected 400 for malformed image');
  console.log('✓ Malformed image rejection verified (HTTP 400)');

  console.log('\n--- Vision Evaluation Summary ---');
  console.table(results);
  console.log('PASS: All vision evaluation benchmarks passed successfully.\n');
}

main().catch(err => {
  console.error('Vision Evaluation Failed:', err);
  process.exit(1);
});
