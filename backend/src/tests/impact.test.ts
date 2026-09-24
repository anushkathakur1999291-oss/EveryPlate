import http from 'http';
import { PrismaClient } from '@prisma/client';
import { app } from '../app';
import { seedDatabase } from '../seed';

const prisma = new PrismaClient();
const TEST_PORT = 4003;

async function runImpactTests() {
  console.log('--- STARTING PHASE 10 IMPACT ANALYTICS DASHBOARD TESTS ---');
  await seedDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test API server listening on port ${TEST_PORT}`);

  const request = async (method: string, path: string, body?: any, headers: Record<string, string> = {}) => {
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      const dataString = body ? JSON.stringify(body) : undefined;
      const req = http.request(
        `http://localhost:${TEST_PORT}${path}`,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(dataString ? { 'Content-Length': Buffer.byteLength(dataString) } : {}),
            ...headers,
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
    // 1. Fetch Users
    const usersRes = await request('GET', '/api/auth/users');
    const fixtures = await prisma.user.findMany({ include: { donorProfile: true, receiverProfile: true, driverProfile: true } });
    const donor = fixtures.find((u: any) => u.email === 'marco@greenbistro.com')!;
    const receiverHope = fixtures.find((u: any) => u.email === 'director@hopeshelter.org')!;
    const receiverStJude = fixtures.find((u: any) => u.email === 'kitchen@stjudes.org')!;
    const driver = fixtures.find((u: any) => u.email === 'alex.rivera@rescue.org')!;

    // 2. Initial baseline verification
    console.log('\n--- TEST 1: INITIAL IMPACT SUMMARY (ZERO BASELINE) ---');
    const initRes = await request('GET', '/api/impact/summary', undefined, { 'x-user-id': donor!.id });
    if (initRes.status !== 200 || initRes.body.totalMealsRescued !== 0) {
      throw new Error(`Expected 0 initial meals rescued, got ${initRes.body.totalMealsRescued}`);
    }
    console.log('✓ Verified: Initial baseline shows zero completed rescues');

    // 3. Fulfill Rescue 1 via Mode A (PLATFORM_DRIVER) - 30 COOKED_MEALS
    console.log('\n--- TEST 2: RESCUE 1 - MODE A (PLATFORM DRIVER DISPATCH) ---');
    const createDonationRes1 = await request(
      'POST',
      '/api/donations',
      {
        foodCategory: 'COOKED_MEALS',
        foodDescription: 'Gourmet Vegetable Stew',
        quantity: 30,
        safeDeadline: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      },
      { 'x-user-id': donor.id }
    );
    const donation1 = createDonationRes1.body.donation;
    const alloc1 = donation1.allocations[0];
    const receiverUser1 = fixtures.find((u: any) => u.receiverProfile?.id === alloc1.receiverId)!;

    // Accept & select PLATFORM_DRIVER
    await request('POST', `/api/allocations/${alloc1.id}/accept`, {}, { 'x-user-id': receiverUser1.id });
    const fulfillRes1 = await request(
      'POST',
      `/api/allocations/${alloc1.id}/fulfillment`,
      { deliveryMode: 'PLATFORM_DRIVER' },
      { 'x-user-id': receiverUser1.id }
    );
    const deliveryId1 = fulfillRes1.body.delivery.id;

    // Driver claims
    await request('POST', `/api/deliveries/${deliveryId1}/claim`, { latitude: 40.718, longitude: -74.001 }, { 'x-user-id': driver.id });

    // Handoff 1: Pickup OTP
    const pickupOtpRes1 = await request('GET', `/api/donations/deliveries/${deliveryId1}/pickup-otp`, undefined, { 'x-user-id': donor.id });
    await request('POST', `/api/deliveries/${deliveryId1}/verify-pickup-otp`, { otp: pickupOtpRes1.body.pickupOtp }, { 'x-user-id': driver.id });

    // Handoff 2: Delivery OTP
    const deliveryOtpRes1 = await request('GET', `/api/receivers/deliveries/${deliveryId1}/delivery-otp`, undefined, { 'x-user-id': receiverUser1.id });
    await request('POST', `/api/deliveries/${deliveryId1}/verify-delivery-otp`, { otp: deliveryOtpRes1.body.deliveryOtp }, { 'x-user-id': driver.id });
    console.log('✓ Mode A delivery successfully verified and completed (30 meals)');

    // 4. Fulfill Rescue 2 via Mode B (RECEIVER_LOGISTICS) - 20 BAKERY
    console.log('\n--- TEST 3: RESCUE 2 - MODE B (RECEIVER-OWNED LOGISTICS) ---');
    const createDonationRes2 = await request(
      'POST',
      '/api/donations',
      {
        foodCategory: 'BAKERY',
        foodDescription: 'Fresh Baguettes & Artisanal Rolls',
        quantity: 20,
        safeDeadline: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      },
      { 'x-user-id': donor.id }
    );
    const donation2 = createDonationRes2.body.donation;
    const alloc2 = donation2.allocations[0];
    const receiverUser2 = fixtures.find((u: any) => u.receiverProfile?.id === alloc2.receiverId)!;

    // Accept & select RECEIVER_LOGISTICS
    await request('POST', `/api/allocations/${alloc2.id}/accept`, {}, { 'x-user-id': receiverUser2.id });
    const fulfillRes2 = await request(
      'POST',
      `/api/allocations/${alloc2.id}/fulfillment`,
      {
        deliveryMode: 'RECEIVER_LOGISTICS',
        driverName: 'Sister Mary (Shelter Staff)',
        vehicleInfo: 'Hope Van #1',
        contactMechanism: 'Phone: 555-0201',
      },
      { 'x-user-id': receiverUser2.id }
    );
    const deliveryId2 = fulfillRes2.body.delivery.id;

    // Handoff 1: Pickup OTP
    const pickupOtpRes2 = await request('GET', `/api/donations/deliveries/${deliveryId2}/pickup-otp`, undefined, { 'x-user-id': donor.id });
    await request('POST', `/api/deliveries/${deliveryId2}/verify-pickup-otp`, { otp: pickupOtpRes2.body.pickupOtp }, { 'x-user-id': receiverUser2.id });

    // Handoff 2: Delivery OTP
    const deliveryOtpRes2 = await request('GET', `/api/receivers/deliveries/${deliveryId2}/delivery-otp`, undefined, { 'x-user-id': receiverUser2.id });
    await request('POST', `/api/deliveries/${deliveryId2}/verify-delivery-otp`, { otp: deliveryOtpRes2.body.deliveryOtp }, { 'x-user-id': receiverUser2.id });
    console.log('✓ Mode B delivery successfully verified and completed (20 meals)');

    // 5. Test Enhanced Impact Summary API
    console.log('\n--- TEST 4: VERIFY ENVIRONMENTAL EQUIVALENTS & TRANSIT EFFICIENCY ---');
    const impactRes = await request('GET', '/api/impact/summary', undefined, { 'x-user-id': donor!.id });
    if (impactRes.status !== 200) throw new Error(`Failed to get impact summary: ${JSON.stringify(impactRes.body)}`);

    const body = impactRes.body;
    console.log('Impact Summary Output:');
    console.log(`  - Total Meals Rescued: ${body.totalMealsRescued}`);
    console.log(`  - Total Weight Diverted: ${body.totalWeightDivertedKg} kg`);
    console.log(`  - Total CO2e Avoided: ${body.totalCo2eAvoidedKg} kg`);
    console.log(`  - Successful Deliveries: ${body.successfulDeliveries}`);

    // Assert total meals
    if (body.totalMealsRescued !== 50) {
      throw new Error(`Assertion failed: Expected 50 meals rescued, got ${body.totalMealsRescued}`);
    }

    // Weight = 50 * 0.42 = 21 kg
    if (body.totalWeightDivertedKg !== 21) {
      throw new Error(`Assertion failed: Expected 21 kg diverted, got ${body.totalWeightDivertedKg}`);
    }

    // Avoided CO2e = 21 * 2.50 = 52.5 kg
    if (body.totalCo2eAvoidedKg !== 52.5) {
      throw new Error(`Assertion failed: Expected 52.5 kg CO2e, got ${body.totalCo2eAvoidedKg}`);
    }

    // Environmental Equivalents
    const eq = body.environmentalEquivalents;
    console.log('\nEnvironmental Equivalents (EPA / UN FAO formulas):');
    console.log(`  - Urban Trees Equivalent: ${eq.treesPlantedEquivalent} trees`);
    console.log(`  - Passenger Vehicle Miles Offset: ${eq.passengerVehicleMilesOffset} miles`);
    console.log(`  - Landfill Space Spared: ${eq.landfillVolumeSparedLiters} L (${eq.landfillVolumeSparedM3} m³)`);
    console.log(`  - Freshwater Conserved: ${eq.freshwaterPreservedLiters} L`);

    if (!eq || eq.treesPlantedEquivalent <= 0 || eq.passengerVehicleMilesOffset <= 0) {
      throw new Error('Environmental equivalents were not computed properly');
    }

    // Transit Efficiency
    const transit = body.transitEfficiency;
    console.log('\nTransit Efficiency Analytics:');
    console.log(`  - Avg Matching Speed: ${transit.averageMatchingMinutes} min`);
    console.log(`  - Avg Pickup Duration: ${transit.averagePickupMinutes} min`);
    console.log(`  - Avg Delivery Duration: ${transit.averageDeliveryMinutes} min`);
    console.log(`  - Avg Total Turnaround: ${transit.averageTotalMinutes} min`);
    console.log(`  - Mode A (Platform Driver) Avg: ${transit.platformDriverAverageTotalMinutes} min`);
    console.log(`  - Mode B (Receiver Logistics) Avg: ${transit.receiverLogisticsAverageTotalMinutes} min`);

    if (!transit || transit.averageTotalMinutes === undefined) {
      throw new Error('Transit efficiency analytics are missing');
    }

    // Category Breakdown
    console.log('\nCategory Breakdown:');
    for (const [cat, data] of Object.entries(body.categoryBreakdown as Record<string, any>)) {
      console.log(`  - ${cat}: ${data.meals} meals, ${data.weightKg} kg, ${data.co2eKg} kg CO2e`);
    }
    if (!body.categoryBreakdown['COOKED_MEALS'] || !body.categoryBreakdown['BAKERY']) {
      throw new Error('Category breakdown did not record COOKED_MEALS and BAKERY');
    }

    // Recent Rescues Audit Feed
    console.log(`\nRecent Rescues Audit Feed (${body.recentRescues.length} records):`);
    if (body.recentRescues.length !== 2) {
      throw new Error(`Expected 2 recent rescues, got ${body.recentRescues.length}`);
    }
    body.recentRescues.forEach((r: any, idx: number) => {
      console.log(`  #${idx + 1}: ${r.donorName} -> ${r.receiverName} | ${r.mealsRescued} meals (${r.foodCategory}) | Mode: ${r.deliveryMode}`);
    });

    console.log('\n--- ALL PHASE 10 IMPACT ANALYTICS DASHBOARD TESTS PASSED ---');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runImpactTests().catch((err) => {
  console.error('Impact Test Failed:', err);
  process.exit(1);
});
