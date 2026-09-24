import http from 'http';
import { app } from '../app';

const TEST_PORT = 4004;

async function runAITests() {
  console.log('--- STARTING PHASE 11 LAYA SYSTEM-1 AI DECISION ENGINE TESTS ---');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test API server listening on port ${TEST_PORT}`);

  const request = async (method: string, path: string, body?: any) => {
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      const dataString = body ? JSON.stringify(body) : undefined;
      const req = http.request(
        `http://localhost:${TEST_PORT}${path}`,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(dataString ? { 'Content-Length': Buffer.byteLength(dataString) } : {}),
          },
        },
        (res) => {
          let chunks = '';
          res.on('data', (d) => (chunks += d));
          res.on('end', () => {
            try {
              const parsed = chunks ? JSON.parse(chunks) : {};
              resolve({ status: res.statusCode || 500, body: parsed });
            } catch (err) {
              resolve({ status: res.statusCode || 500, body: chunks });
            }
          });
        }
      );
      req.on('error', reject);
      if (dataString) req.write(dataString);
      req.end();
    });
  };

  try {
    // --- TEST 1: Cooked Meals Extraction ---
    console.log('\n--- TEST 1: LAYA INTAKE EXTRACTION - COOKED MEALS ---');
    const res1 = await request('POST', '/api/ai/parse-donation', {
      text: '35 portions of warm chicken pasta and garlic bread from dinner service, safe until 11:30 PM',
    });
    if (res1.status !== 200) throw new Error(`Extraction 1 failed: ${JSON.stringify(res1.body)}`);

    console.log('Laya Intake Output:');
    console.log(`  - Category: ${res1.body.foodCategory} (Confidence: ${res1.body.confidence})`);
    console.log(`  - Quantity: ${res1.body.quantity} ${res1.body.unit}`);
    console.log(`  - Deadline: ${res1.body.safeDeadline}`);
    console.log(`  - Urgency Tier: ${res1.body.urgencyTier}`);
    console.log(`  - Allergens: ${res1.body.detectedAllergens.join(', ')}`);
    console.log(`  - Execution Time: ${res1.body.executionTimeMs} ms (${res1.body.engine})`);

    if (res1.body.foodCategory !== 'COOKED_MEALS') {
      throw new Error(`Expected COOKED_MEALS, got ${res1.body.foodCategory}`);
    }
    if (res1.body.quantity !== 35) {
      throw new Error(`Expected quantity 35, got ${res1.body.quantity}`);
    }
    if (!res1.body.detectedAllergens.includes('GLUTEN')) {
      throw new Error('Expected GLUTEN in detected allergens');
    }
    console.log('✓ Cooked meals correctly extracted with allergens and high confidence');

    // --- TEST 2: Bakery Extraction ---
    console.log('\n--- TEST 2: LAYA INTAKE EXTRACTION - BAKERY ---');
    const res2 = await request('POST', '/api/ai/parse-donation', {
      text: '15 loaves of fresh artisanal sourdough bread and croissants, consume within 12 hours',
    });
    if (res2.status !== 200 || res2.body.foodCategory !== 'BAKERY' || res2.body.quantity !== 15) {
      throw new Error(`Bakery extraction failed: ${JSON.stringify(res2.body)}`);
    }
    console.log(`✓ Bakery extracted: ${res2.body.quantity} ${res2.body.unit}, Safe Hours: ${res2.body.safeHoursRemaining}h`);

    // --- TEST 3: Produce Extraction with kg unit ---
    console.log('\n--- TEST 3: LAYA INTAKE EXTRACTION - PRODUCE ---');
    const res3 = await request('POST', '/api/ai/parse-donation', {
      text: '50 kg of fresh apples, spinach, and carrots from organic market',
    });
    if (res3.status !== 200 || res3.body.foodCategory !== 'PRODUCE' || res3.body.unit !== 'kg') {
      throw new Error(`Produce extraction failed: ${JSON.stringify(res3.body)}`);
    }
    console.log(`✓ Produce extracted: ${res3.body.quantity} ${res3.body.unit}`);

    // --- TEST 4: Dairy Extraction ---
    console.log('\n--- TEST 4: LAYA INTAKE EXTRACTION - DAIRY ---');
    const res4 = await request('POST', '/api/ai/parse-donation', {
      text: '20 cartons of whole milk and cheddar cheese blocks',
    });
    if (res4.status !== 200 || res4.body.foodCategory !== 'DAIRY' || !res4.body.detectedAllergens.includes('DAIRY')) {
      throw new Error(`Dairy extraction failed: ${JSON.stringify(res4.body)}`);
    }
    console.log(`✓ Dairy extracted with allergen flag: ${res4.body.detectedAllergens.join(', ')}`);

    // --- TEST 5: Packaged Goods Extraction ---
    console.log('\n--- TEST 5: LAYA INTAKE EXTRACTION - PACKAGED GOODS ---');
    const res5 = await request('POST', '/api/ai/parse-donation', {
      text: '80 canned black beans and dry cereal boxes',
    });
    if (res5.status !== 200 || res5.body.foodCategory !== 'PACKAGED_GOODS') {
      throw new Error(`Packaged goods extraction failed: ${JSON.stringify(res5.body)}`);
    }
    console.log(`✓ Packaged goods extracted: ${res5.body.quantity} ${res5.body.unit}`);

    // --- TEST 6: Validation Error Handling ---
    console.log('\n--- TEST 6: VALIDATION ERROR HANDLING ---');
    const errRes = await request('POST', '/api/ai/parse-donation', { text: '' });
    if (errRes.status !== 400) {
      throw new Error(`Expected 400 for empty input, got ${errRes.status}`);
    }
    console.log('✓ Correctly rejected empty input string');

    // --- TEST 7: System-1 Fulfillment Mode Recommendation (Critical Risk) ---
    console.log('\n--- TEST 7: SYSTEM-1 DISPATCH ADVISOR (CRITICAL TIMEOUT DEFICIT) ---');
    const dispatchRes1 = await request('POST', '/api/ai/recommend-mode', {
      timeRemainingMins: 35,
      availablePlatformDrivers: 0,
      distanceKm: 1.8,
      receiverHasOwnLogistics: true,
      foodCategory: 'COOKED_MEALS',
    });

    console.log('Laya Dispatch Advisor Output (Deficit scenario):');
    console.log(`  - Recommended Mode: ${dispatchRes1.body.recommendedMode}`);
    console.log(`  - Risk Level: ${dispatchRes1.body.riskLevel}`);
    console.log(`  - Confidence: ${dispatchRes1.body.confidence}`);
    console.log(`  - Reasoning: ${dispatchRes1.body.reasoning}`);

    if (dispatchRes1.body.recommendedMode !== 'RECEIVER_LOGISTICS') {
      throw new Error(`Expected RECEIVER_LOGISTICS, got ${dispatchRes1.body.recommendedMode}`);
    }
    if (dispatchRes1.body.riskLevel !== 'CRITICAL') {
      throw new Error(`Expected CRITICAL risk level, got ${dispatchRes1.body.riskLevel}`);
    }
    console.log('✓ Correctly recommended RECEIVER_LOGISTICS under courier deficit');

    // --- TEST 8: System-1 Fulfillment Mode Recommendation (Ample Buffer) ---
    console.log('\n--- TEST 8: SYSTEM-1 DISPATCH ADVISOR (AMPLE BUFFER & COURIERS) ---');
    const dispatchRes2 = await request('POST', '/api/ai/recommend-mode', {
      timeRemainingMins: 120,
      availablePlatformDrivers: 3,
      distanceKm: 4.2,
      receiverHasOwnLogistics: true,
      foodCategory: 'BAKERY',
    });

    console.log('Laya Dispatch Advisor Output (Ample buffer scenario):');
    console.log(`  - Recommended Mode: ${dispatchRes2.body.recommendedMode}`);
    console.log(`  - Risk Level: ${dispatchRes2.body.riskLevel}`);
    console.log(`  - Confidence: ${dispatchRes2.body.confidence}`);
    console.log(`  - Reasoning: ${dispatchRes2.body.reasoning}`);

    if (dispatchRes2.body.recommendedMode !== 'PLATFORM_DRIVER') {
      throw new Error(`Expected PLATFORM_DRIVER, got ${dispatchRes2.body.recommendedMode}`);
    }
    console.log('✓ Correctly recommended PLATFORM_DRIVER when network has capacity');

    console.log('\n--- ALL PHASE 11 LAYA SYSTEM-1 AI DECISION ENGINE TESTS PASSED ---');
  } finally {
    server.close();
  }
}

runAITests().catch((err) => {
  console.error('AI Test Failed:', err);
  process.exit(1);
});
