import { app, server } from '../app';
import { PrismaClient, Role } from '@prisma/client';
import { seedDatabase } from '../seed';
import http from 'http';

const prisma = new PrismaClient();
const TEST_PORT = 4001;

// Helper to make HTTP JSON requests
function request(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runApiTests() {
  console.log('--- STARTING PHASE 5 BACKEND API TESTS ---');

  await seedDatabase();

  // Start test server
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test API server listening on port ${TEST_PORT}`);

  try {
    // 1. Fetch Users
    const usersRes = await request('GET', '/api/auth/users');
    const fixtures = await prisma.user.findMany({ include: { donorProfile: true, receiverProfile: true, driverProfile: true } });
    if (usersRes.status !== 200 || !Array.isArray(usersRes.body)) {
      throw new Error(`Failed to fetch users: ${JSON.stringify(usersRes.body)}`);
    }
    console.log(`✓ GET /api/auth/users: Retrieved ${usersRes.body.length} seeded users`);

    const donor = fixtures.find((u: any) => u.email === 'marco@greenbistro.com')!;
    let receiver = fixtures.find((u: any) => u.email === 'director@hopeshelter.org')!;
    const driver = fixtures.find((u: any) => u.email === 'alex.rivera@rescue.org')!;

    // 2. Donor creates a donation
    console.log('\n--- TEST: DONOR CREATES SURPLUS DONATION ---');
    const createDonationRes = await request(
      'POST',
      '/api/donations',
      {
        foodCategory: 'COOKED_MEALS',
        foodDescription: '30 warm hearty vegetable stews',
        quantity: 30,
        safeDeadline: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      },
      { 'x-user-id': donor.id }
    );

    if (createDonationRes.status !== 201) {
      throw new Error(`Failed to create donation: ${JSON.stringify(createDonationRes.body)}`);
    }
    const createdDonation = createDonationRes.body.donation;
    console.log(`✓ POST /api/donations: Created Donation #${createdDonation.id.slice(0, 8)}`);
    console.log(`  Matching Summary: Proposed to ${createDonationRes.body.matchingSummary.map((m: any) => m.organizationName).join(', ')}`);

    // Verify Server-Side Privacy: Donor cannot see receiver phone or raw coordinates
    const proposedAlloc = createdDonation.allocations[0];
    if (proposedAlloc?.receiver?.phone || proposedAlloc?.receiver?.address) {
      throw new Error('Privacy Violation: Donor response leaked receiver personal address/phone!');
    }
    console.log('✓ Verified: Server-Side Privacy Masking prevents receiver address/phone exposure to donor');

    // 3. Receiver views and accepts allocation
    console.log('\n--- TEST: RECEIVER VIEWS AND ACCEPTS ALLOCATION ---');
    const matchedReceiverUser = fixtures.find((u: any) => u.receiverProfile?.id === proposedAlloc.receiverId)!;
    if (!matchedReceiverUser) {
      throw new Error('Matched receiver user not found in seeded users');
    }
    receiver = matchedReceiverUser;

    const receiverAllocsRes = await request('GET', '/api/receivers/my/allocations', undefined, {
      'x-user-id': receiver.id,
    });
    if (receiverAllocsRes.status !== 200 || receiverAllocsRes.body.length === 0) {
      throw new Error('Receiver did not receive proposed allocation');
    }
    const allocationId = receiverAllocsRes.body[0].id;

    const acceptRes = await request('POST', `/api/allocations/${allocationId}/accept`, {}, {
      'x-user-id': receiver.id,
    });
    if (acceptRes.status !== 200) {
      throw new Error(`Failed to accept allocation: ${JSON.stringify(acceptRes.body)}`);
    }
    console.log(`✓ POST /api/allocations/:id/accept: Receiver accepted allocation`);

    // 4. Receiver selects Fulfillment Method A (PLATFORM_DRIVER)
    console.log('\n--- TEST: RECEIVER CHOOSES PLATFORM_DRIVER FULFILLMENT ---');
    const fulfillmentRes = await request(
      'POST',
      `/api/allocations/${allocationId}/fulfillment`,
      { deliveryMode: 'PLATFORM_DRIVER' },
      { 'x-user-id': receiver.id }
    );
    if (fulfillmentRes.status !== 201) {
      throw new Error(`Failed to select fulfillment: ${JSON.stringify(fulfillmentRes.body)}`);
    }
    const deliveryId = fulfillmentRes.body.delivery.id;
    console.log(`✓ POST /api/allocations/:id/fulfillment: Created Delivery #${deliveryId.slice(0, 8)} in status: ${fulfillmentRes.body.delivery.status}`);

    // 5. Platform Driver views available jobs and claims
    console.log('\n--- TEST: PLATFORM DRIVER DISPATCH & CLAIM ---');
    const availableJobsRes = await request('GET', '/api/drivers/available-jobs', undefined, {
      'x-user-id': driver.id,
    });
    if (availableJobsRes.status !== 200 || availableJobsRes.body.length === 0) {
      throw new Error('Driver did not see available delivery job');
    }
    console.log(`✓ GET /api/drivers/available-jobs: Driver sees ${availableJobsRes.body.length} open rescue job(s)`);

    const claimRes = await request(
      'POST',
      `/api/deliveries/${deliveryId}/claim`,
      { latitude: 40.7180, longitude: -74.0010 },
      { 'x-user-id': driver.id }
    );
    if (claimRes.status !== 200) {
      throw new Error(`Driver failed to claim job: ${JSON.stringify(claimRes.body)}`);
    }
    console.log(`✓ POST /api/deliveries/:id/claim: Driver claimed job. Total ETA: ${claimRes.body.totalEtaMinutes} mins`);

    // 6. Two-Stage OTP Custody Handoff
    console.log('\n--- TEST: TWO-STAGE VERIFIED OTP CUSTODY HANDOFF ---');
    // Donor gets Pickup OTP
    const pickupOtpRes = await request(
      'GET',
      `/api/donations/deliveries/${deliveryId}/pickup-otp`,
      undefined,
      { 'x-user-id': donor.id }
    );
    if (pickupOtpRes.status !== 200 || !pickupOtpRes.body.pickupOtp) {
      throw new Error('Failed to retrieve pickup OTP');
    }
    const pickupOtp = pickupOtpRes.body.pickupOtp;
    console.log(`✓ GET /api/donations/deliveries/:id/pickup-otp: Retrieved Pickup OTP`);

    // Transporter submits Pickup OTP
    const verifyPickupRes = await request(
      'POST',
      `/api/deliveries/${deliveryId}/verify-pickup-otp`,
      { otp: pickupOtp },
      { 'x-user-id': driver.id }
    );
    if (verifyPickupRes.status !== 200) {
      throw new Error(`Pickup OTP verification failed: ${JSON.stringify(verifyPickupRes.body)}`);
    }
    console.log(`✓ POST /api/deliveries/:id/verify-pickup-otp: Pickup verified`);

    // Receiver gets Delivery OTP
    const deliveryOtpRes = await request(
      'GET',
      `/api/receivers/deliveries/${deliveryId}/delivery-otp`,
      undefined,
      { 'x-user-id': receiver.id }
    );
    if (deliveryOtpRes.status !== 200 || !deliveryOtpRes.body.deliveryOtp) {
      throw new Error('Failed to retrieve delivery OTP');
    }
    const deliveryOtp = deliveryOtpRes.body.deliveryOtp;
    console.log(`✓ GET /api/receivers/deliveries/:id/delivery-otp: Retrieved Delivery OTP`);

    // Transporter submits Delivery OTP
    const verifyDeliveryRes = await request(
      'POST',
      `/api/deliveries/${deliveryId}/verify-delivery-otp`,
      { otp: deliveryOtp },
      { 'x-user-id': driver.id }
    );
    if (verifyDeliveryRes.status !== 200) {
      throw new Error(`Delivery OTP verification failed: ${JSON.stringify(verifyDeliveryRes.body)}`);
    }
    console.log(`✓ POST /api/deliveries/:id/verify-delivery-otp: Delivery completed and verified!`);

    // 7. Verify Impact Metrics
    console.log('\n--- TEST: IMPACT SUMMARY API ---');
    const impactRes = await request('GET', '/api/impact/summary', undefined, { 'x-user-id': donor!.id });
    if (impactRes.status !== 200) {
      throw new Error(`Failed to get impact summary: ${JSON.stringify(impactRes.body)}`);
    }
    console.log('✓ GET /api/impact/summary:');
    console.log(`  - Total Meals Rescued: ${impactRes.body.totalMealsRescued}`);
    console.log(`  - Total Weight Diverted: ${impactRes.body.totalWeightDivertedKg} kg`);
    console.log(`  - Total CO2e Avoided: ${impactRes.body.totalCo2eAvoidedKg} kg`);
    console.log(`  - Mode Breakdown: Platform Driver = ${impactRes.body.deliveryModeBreakdown.platformDriver}, Receiver Logistics = ${impactRes.body.deliveryModeBreakdown.receiverLogistics}`);

    if (impactRes.body.totalMealsRescued !== 30) {
      throw new Error(`Assertion failed: Expected 30 meals rescued, got ${impactRes.body.totalMealsRescued}`);
    }

    // 8. Admin Command Center Dashboard
    console.log('\n--- TEST: ADMIN COMMAND CENTER DASHBOARD ---');
    const adminRes = await request('GET', '/api/admin/dashboard', undefined, { 'x-user-id': fixtures.find(u => u.role === 'ADMIN')!.id })!;
    if (adminRes.status !== 200) {
      throw new Error(`Failed to get admin dashboard: ${JSON.stringify(adminRes.body)}`);
    }
    console.log(`✓ GET /api/admin/dashboard: Active Receivers: ${adminRes.body.activeReceiversCount}, Available Drivers: ${adminRes.body.availableDriversCount}`);

    console.log('--- ALL PHASE 5 BACKEND API TESTS PASSED ---');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runApiTests().catch((err) => {
  console.error('API Test Error:', err);
  process.exit(1);
});
