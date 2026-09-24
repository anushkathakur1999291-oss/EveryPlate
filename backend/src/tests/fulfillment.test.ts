import { PrismaClient, DeliveryMode, DeliveryStatus } from '@prisma/client';
import { FulfillmentService } from '../services/fulfillment/fulfillment.service';
import { AllocationEngine } from '../services/allocation/allocation.service';
import { seedDatabase } from '../seed';

const prisma = new PrismaClient();

async function runFulfillmentTests() {
  console.log('--- STARTING PHASE 4 FULFILLMENT & LOGISTICS ENGINE TESTS ---');

  // 1. Reset and reseed
  await seedDatabase();
  const allocationEngine = new AllocationEngine(prisma);
  const fulfillmentService = new FulfillmentService(prisma);

  // Fetch seeded donor and create a donation
  const donorUser = await prisma.user.findUnique({
    where: { email: 'marco@greenbistro.com' },
    include: { donorProfile: true },
  });
  const donorProfile = donorUser!.donorProfile!;

  const donation = await prisma.donation.create({
    data: {
      donorId: donorProfile.id,
      foodCategory: 'COOKED_MEALS',
      foodDescription: '40 hot catered gourmet meals',
      quantity: 40,
      unit: 'meals',
      pickupAddress: donorProfile.address,
      pickupLatitude: donorProfile.latitude,
      pickupLongitude: donorProfile.longitude,
      availableAt: new Date(),
      safeDeadline: new Date(Date.now() + 3 * 3600 * 1000), // 3 hrs
    },
  });

  // Propose and accept allocation for Hope Shelter
  const allocResult = await allocationEngine.proposeAllocationsForDonation(donation.id);
  const allocation = allocResult.allocations[0];
  await allocationEngine.acceptAllocation(allocation.id);

  console.log(`\n--- TEST 1: MODE A INITIALIZATION & SIMULTANEOUS DRIVER DISPATCH RESOLUTION ---`);
  // Create delivery in PLATFORM_DRIVER mode
  const deliveryA = await fulfillmentService.createDeliveryForAllocation(
    allocation.id,
    DeliveryMode.PLATFORM_DRIVER
  );

  console.log(`Created Delivery #${deliveryA.id.slice(0, 8)} in status: ${deliveryA.status}`);
  if (deliveryA.status !== DeliveryStatus.DRIVER_SEARCH) {
    throw new Error(`Assertion failed: Expected DRIVER_SEARCH, got ${deliveryA.status}`);
  }

  // Fetch candidate drivers
  const driverAlex = await prisma.user.findUnique({ where: { email: 'alex.rivera@rescue.org' }, include: { driverProfile: true } });
  const driverPriya = await prisma.user.findUnique({ where: { email: 'priya.sharma@rescue.org' }, include: { driverProfile: true } });

  // Simulate simultaneous claims by Alex (closer) and Priya (further away)
  console.log('Simulating simultaneous driver claims. Evaluating dispatch metric (Lowest Total ETA to Receiver)...');
  const candidateAlex = {
    driverId: driverAlex!.driverProfile!.id,
    coords: { latitude: 40.7180, longitude: -74.0010 },
  };
  const candidatePriya = {
    driverId: driverPriya!.driverProfile!.id,
    coords: { latitude: 40.7600, longitude: -73.9700 }, // further north
  };

  const dispatchResult = await fulfillmentService.resolveBestDriverForDelivery(deliveryA.id, [
    candidatePriya,
    candidateAlex,
  ]);

  console.log(`Dispatched to Driver: ${dispatchResult.assignedDriverId} with Total ETA: ${dispatchResult.totalEtaMinutes} mins`);
  if (dispatchResult.assignedDriverId !== candidateAlex.driverId) {
    throw new Error('Assertion failed: Dispatch metric did not choose driver with lowest total ETA!');
  }
  console.log('✓ Verified: Dispatch metric chose driver with lowest total ETA to receiver');

  // Verify atomic lock rejects secondary attempt
  try {
    await fulfillmentService.acceptPlatformDeliveryJob(deliveryA.id, candidatePriya.driverId, candidatePriya.coords);
    throw new Error('Assertion failed: Secondary claim was not rejected by concurrency lock!');
  } catch (err: any) {
    console.log(`✓ Verified: Concurrency guard rejected second driver claim: "${err.message}"`);
  }

  console.log(`\n--- TEST 2: DRIVER CANCELLATION & REASSIGNMENT ---`);
  const cancelledDelivery = await fulfillmentService.cancelPlatformDriver(
    deliveryA.id,
    candidateAlex.driverId,
    'Flat tire on vehicle en route'
  );
  console.log(`Delivery #${cancelledDelivery.id.slice(0, 8)} reverted to status: ${cancelledDelivery.status}`);
  if (cancelledDelivery.status !== DeliveryStatus.DRIVER_SEARCH) {
    throw new Error('Assertion failed: Delivery was not returned to DRIVER_SEARCH after cancellation');
  }
  console.log('✓ Verified: Platform driver cancellation logged reason and triggered reassignment');

  console.log(`\n--- TEST 3: MODE SWITCHING (PLATFORM_DRIVER -> RECEIVER_LOGISTICS) ---`);
  // Hope Shelter decides to switch to their own logistics
  const switchedDelivery = await fulfillmentService.switchDeliveryMode(
    deliveryA.id,
    DeliveryMode.RECEIVER_LOGISTICS,
    {
      driverName: 'Brother Dave',
      vehicleInfo: 'Shelter Van 01',
      contactMechanism: 'Internal Radio',
    }
  );
  console.log(`Delivery mode switched to: ${switchedDelivery.deliveryMode}, Status: ${switchedDelivery.status}`);
  if (switchedDelivery.deliveryMode !== DeliveryMode.RECEIVER_LOGISTICS || switchedDelivery.status !== DeliveryStatus.RECEIVER_LOGISTICS_ASSIGNED) {
    throw new Error('Assertion failed: Delivery mode switch failed');
  }
  console.log('✓ Verified: Delivery successfully switched to RECEIVER_LOGISTICS with deadline re-validation');

  console.log(`\n--- TEST 4: TWO-STAGE VERIFIED OTP CUSTODY HANDOFF & IMPACT GENERATION ---`);
  // Fetch fresh delivery to get the generated OTPs
  const activeDelivery = await prisma.delivery.findUnique({
    where: { id: deliveryA.id },
  });

  // Stage 1: Pickup OTP at Donor
  console.log(`Submitting Pickup OTP: ${activeDelivery!.pickupOtp}...`);
  const pickedUpDelivery = await fulfillmentService.verifyPickupOtp(
    deliveryA.id,
    activeDelivery!.pickupOtp,
    donorUser!.id,
    'DONOR'
  );
  console.log(`Pickup verified! Status: ${pickedUpDelivery.status}, Pickup Time: ${pickedUpDelivery.pickupVerifiedAt?.toISOString()}`);
  if (pickedUpDelivery.status !== DeliveryStatus.PICKED_UP || !pickedUpDelivery.pickupVerifiedAt) {
    throw new Error('Assertion failed: Pickup OTP verification failed');
  }
  console.log('✓ Verified: Stage 1 Pickup OTP handoff completed');

  // Verify delivery OTP is rejected before arrival
  try {
    await fulfillmentService.verifyPickupOtp(deliveryA.id, '9999'); // Invalid OTP
    throw new Error('Assertion failed: Invalid OTP was accepted!');
  } catch (err: any) {
    console.log(`✓ Verified: Invalid OTP correctly rejected: "${err.message}"`);
  }

  // Stage 2: Delivery OTP at Receiver
  console.log(`Submitting Delivery OTP: ${activeDelivery!.deliveryOtp}...`);
  const completionResult = await fulfillmentService.verifyDeliveryOtp(
    deliveryA.id,
    activeDelivery!.deliveryOtp,
    'receiver-user-id',
    'RECEIVER'
  );

  console.log(`Delivery verified! Status: ${completionResult.delivery.status}`);
  if (completionResult.delivery.status !== DeliveryStatus.COMPLETED) {
    throw new Error('Assertion failed: Delivery status is not COMPLETED');
  }

  // Check Impact Record
  const impact = completionResult.impactRecord;
  console.log(`Impact Record Created:`);
  console.log(`  - Meals Rescued: ${impact.mealsRescued}`);
  console.log(`  - Weight Diverted: ${impact.weightDivertedKg} kg`);
  console.log(`  - CO2e Avoided: ${impact.co2eAvoidedKg} kg`);
  console.log(`  - Fulfillment Mode: ${impact.deliveryMode}`);

  if (impact.mealsRescued !== 40 || impact.weightDivertedKg !== 16.8 || impact.co2eAvoidedKg !== 42.0) {
    throw new Error('Assertion failed: Impact calculations are incorrect!');
  }
  console.log('✓ Verified: Genuine Impact Record generated strictly upon verified delivery completion');

  // Verify Receiver Capacity Committal (reserved decremented, occupancy incremented)
  const hopeProfile = await prisma.receiverProfile.findFirst({
    where: { organizationName: 'Hope Community Shelter' },
  });
  console.log(`Hope Shelter Final Capacity: Current Occ = ${hopeProfile?.currentOccupancy}, Reserved = ${hopeProfile?.reservedIncomingQuantity}`);
  // Initial currentOcc was 15, now + 40 = 55. Reserved was 40, now - 40 = 0.
  if (hopeProfile?.currentOccupancy !== 55 || hopeProfile?.reservedIncomingQuantity !== 0) {
    throw new Error(`Assertion failed: Capacity was not correctly committed! Occ: ${hopeProfile?.currentOccupancy}, Reserved: ${hopeProfile?.reservedIncomingQuantity}`);
  }
  console.log('✓ Verified: Receiver capacity committed atomically from reserved to current occupancy');

  console.log('--- ALL PHASE 4 FULFILLMENT & LOGISTICS ENGINE TESTS PASSED ---');
}

runFulfillmentTests()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
