import { server } from '../app';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../seed';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import http from 'http';

const prisma = new PrismaClient();
const SOCKET_TEST_PORT = 4002;
const SERVER_URL = `http://localhost:${SOCKET_TEST_PORT}`;

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
        port: SOCKET_TEST_PORT,
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

function waitForEvent(socket: ClientSocket, eventName: string, timeoutMs: number = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event '${eventName}' on socket`));
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function runSocketTests() {
  console.log('--- STARTING PHASE 6 REAL-TIME WEBSOCKET EVENT TESTS ---');

  await seedDatabase();

  await new Promise<void>((resolve) => server.listen(SOCKET_TEST_PORT, resolve));
  console.log(`✓ Test WebSocket server listening on port ${SOCKET_TEST_PORT}`);

  let donorSocket: ClientSocket | null = null;
  let receiverSocket: ClientSocket | null = null;
  let driverSocket: ClientSocket | null = null;
  let adminSocket: ClientSocket | null = null;

  try {
    const usersRes = await request('GET', '/api/auth/users');
    const donor = usersRes.body.find((u: any) => u.email === 'marco@greenbistro.com');
    const driver = usersRes.body.find((u: any) => u.email === 'alex.rivera@rescue.org');
    const admin = usersRes.body.find((u: any) => u.role === 'ADMIN');

    // Connect clients
    adminSocket = Client(SERVER_URL);
    donorSocket = Client(SERVER_URL);
    driverSocket = Client(SERVER_URL);

    await Promise.all([
      new Promise<void>((res) => adminSocket!.on('connect', () => res())),
      new Promise<void>((res) => donorSocket!.on('connect', () => res())),
      new Promise<void>((res) => driverSocket!.on('connect', () => res())),
    ]);

    adminSocket.emit('join:role', 'ADMIN');
    donorSocket.emit('join:role', 'DONOR');
    donorSocket.emit('join:user', donor.id);
    driverSocket.emit('join:role', 'DRIVER');
    driverSocket.emit('join:user', driver.id);
    await new Promise((res) => setTimeout(res, 200));

    console.log('✓ Connected Admin, Donor, and Driver WebSockets');

    // 1. Test DONATION_CREATED real-time broadcast
    console.log('\n--- TEST: REAL-TIME DONATION CREATION & MATCH NOTIFICATION ---');
    const adminDonationPromise = waitForEvent(adminSocket, 'DONATION_CREATED');

    console.log('Posting donation to /api/donations...');
    const createDonationRes = await request(
      'POST',
      '/api/donations',
      {
        foodCategory: 'COOKED_MEALS',
        foodDescription: '25 boxes of warm chicken noodle soup',
        quantity: 25,
        safeDeadline: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      },
      { 'x-user-id': donor.id }
    );
    console.log('Got /api/donations response:', createDonationRes.status);

    if (createDonationRes.status !== 201) {
      throw new Error(`Failed to create donation in socket test: ${JSON.stringify(createDonationRes.body)}`);
    }

    const receivedAdminDonation = await adminDonationPromise;
    console.log(`✓ Admin received 'DONATION_CREATED' event for Donation #${receivedAdminDonation.id.slice(0, 8)}`);

    const createdDonation = createDonationRes.body.donation;
    const proposedAlloc = createdDonation.allocations[0];
    const receiverUser = usersRes.body.find((u: any) => u.receiverProfile?.id === proposedAlloc.receiverId);

    // Connect matched receiver socket
    receiverSocket = Client(SERVER_URL);
    await new Promise<void>((res) => receiverSocket!.on('connect', () => res()));
    receiverSocket.emit('join:role', 'RECEIVER');
    receiverSocket.emit('join:user', receiverUser.id);
    await new Promise((res) => setTimeout(res, 200));
    console.log(`✓ Connected Receiver WebSocket for ${receiverUser.name}`);

    // 2. Test DRIVER_REQUESTED broadcast when receiver selects PLATFORM_DRIVER
    console.log('\n--- TEST: REAL-TIME DRIVER REQUEST BROADCAST ---');
    // Accept allocation
    await request('POST', `/api/allocations/${proposedAlloc.id}/accept`, {}, { 'x-user-id': receiverUser.id });

    const driverRequestedPromise = waitForEvent(driverSocket, 'DRIVER_REQUESTED');

    const fulfillmentRes = await request(
      'POST',
      `/api/allocations/${proposedAlloc.id}/fulfillment`,
      { deliveryMode: 'PLATFORM_DRIVER' },
      { 'x-user-id': receiverUser.id }
    );
    const deliveryId = fulfillmentRes.body.delivery.id;

    // Join delivery room on all sockets
    donorSocket.emit('join:delivery', deliveryId);
    receiverSocket.emit('join:delivery', deliveryId);
    driverSocket.emit('join:delivery', deliveryId);
    adminSocket.emit('join:delivery', deliveryId);

    const driverJob = await driverRequestedPromise;
    console.log(`✓ Driver received 'DRIVER_REQUESTED' event for Delivery #${driverJob.id.slice(0, 8)}`);

    // 3. Test DRIVER_ASSIGNED broadcast when driver claims
    console.log('\n--- TEST: REAL-TIME DRIVER ASSIGNMENT BROADCAST ---');
    const receiverAssignedPromise = waitForEvent(receiverSocket, 'DRIVER_ASSIGNED');

    await request(
      'POST',
      `/api/deliveries/${deliveryId}/claim`,
      { latitude: 40.7180, longitude: -74.0010 },
      { 'x-user-id': driver.id }
    );

    const assignedDelivery = await receiverAssignedPromise;
    console.log(`✓ Receiver received 'DRIVER_ASSIGNED' event for Delivery #${assignedDelivery.id.slice(0, 8)}`);

    // 4. Test PICKUP_VERIFIED broadcast
    console.log('\n--- TEST: REAL-TIME PICKUP VERIFICATION BROADCAST ---');
    const pickupOtpRes = await request(
      'GET',
      `/api/donations/deliveries/${deliveryId}/pickup-otp`,
      undefined,
      { 'x-user-id': donor.id }
    );
    const pickupOtp = pickupOtpRes.body.pickupOtp;

    const receiverPickupPromise = waitForEvent(receiverSocket, 'PICKUP_VERIFIED');

    await request(
      'POST',
      `/api/deliveries/${deliveryId}/verify-pickup-otp`,
      { otp: pickupOtp },
      { 'x-user-id': driver.id }
    );

    const pickupDelivery = await receiverPickupPromise;
    console.log(`✓ Receiver received 'PICKUP_VERIFIED' event for Delivery #${pickupDelivery.id.slice(0, 8)}`);

    // 5. Test DELIVERY_VERIFIED and IMPACT_UPDATED broadcast
    console.log('\n--- TEST: REAL-TIME DELIVERY VERIFIED & IMPACT COUNTER BROADCAST ---');
    const deliveryOtpRes = await request(
      'GET',
      `/api/receivers/deliveries/${deliveryId}/delivery-otp`,
      undefined,
      { 'x-user-id': receiverUser.id }
    );
    const deliveryOtp = deliveryOtpRes.body.deliveryOtp;

    const adminImpactPromise = waitForEvent(adminSocket, 'IMPACT_UPDATED');

    await request(
      'POST',
      `/api/deliveries/${deliveryId}/verify-delivery-otp`,
      { otp: deliveryOtp },
      { 'x-user-id': driver.id }
    );

    const impactRecord = await adminImpactPromise;
    console.log(`✓ Admin received 'IMPACT_UPDATED' event! Rescued: ${impactRecord.mealsRescued} meals, Diverted: ${impactRecord.weightDivertedKg} kg, CO2e: ${impactRecord.co2eAvoidedKg} kg`);

    console.log('--- ALL PHASE 6 REAL-TIME WEBSOCKET EVENT TESTS PASSED ---');
  } finally {
    donorSocket?.disconnect();
    receiverSocket?.disconnect();
    driverSocket?.disconnect();
    adminSocket?.disconnect();
    server.close();
    await prisma.$disconnect();
  }
}

runSocketTests().catch((err) => {
  console.error('Socket Test Error:', err);
  process.exit(1);
});
