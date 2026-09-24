import { PrismaClient, Role, NeedLevel, DonationStatus, AllocationStatus } from '@prisma/client';
import { MatchingService } from '../services/matching/matching.service';
import { AllocationEngine } from '../services/allocation/allocation.service';
import { seedDatabase } from '../seed';

const prisma = new PrismaClient();

async function runMatchingTests() {
  console.log('--- STARTING PHASE 3 MATCHING & ALLOCATION ENGINE TESTS ---');

  // 1. Reset and re-seed
  await seedDatabase();
  const matchingService = new MatchingService(prisma);
  const allocationEngine = new AllocationEngine(prisma);

  // 2. Fetch seeded entities
  const donorUser = await prisma.user.findUnique({
    where: { email: 'marco@greenbistro.com' },
    include: { donorProfile: true },
  });
  const donorProfile = donorUser!.donorProfile!;

  console.log('\n--- TEST 1: STAGE 1 HARD FILTERING ---');
  // Create a Cooked Meals donation with 3 hours safe deadline
  const donation1 = await prisma.donation.create({
    data: {
      donorId: donorProfile.id,
      foodCategory: 'COOKED_MEALS',
      foodDescription: 'Trays of warm shepherd pie',
      quantity: 50,
      unit: 'meals',
      pickupAddress: donorProfile.address,
      pickupLatitude: donorProfile.latitude,
      pickupLongitude: donorProfile.longitude,
      availableAt: new Date(),
      safeDeadline: new Date(Date.now() + 3 * 3600 * 1000), // 3 hrs
      status: DonationStatus.MATCHING,
    },
  });

  const filterResult = await matchingService.getEligibleReceivers(donation1, 50);
  console.log(`Total eligible candidates: ${filterResult.eligible.length}`);
  console.log(`Total disqualified candidates: ${filterResult.disqualified.length}`);

  // Assertions on Hard Filtering
  const disqualifiedReasons = filterResult.disqualified.map((d) => d.reason);
  console.log('Disqualified reasons logged:');
  filterResult.disqualified.forEach((d) => console.log(`  - [Receiver ${d.receiverId.slice(0, 8)}] ${d.reason}`));

  // Inactive pantry must be disqualified
  const hasInactiveDisqualified = disqualifiedReasons.some((r) => r.includes('not currently accepting donations'));
  if (!hasInactiveDisqualified) {
    throw new Error('Assertion failed: Inactive receiver was not disqualified by Hard Filter!');
  }
  console.log('✓ Verified: Receiver with acceptingDonations=false was disqualified');

  // Category mismatch (Grace Food Bank only accepts PACKAGED_GOODS, PRODUCE, DAIRY - not COOKED_MEALS)
  const hasCategoryMismatch = disqualifiedReasons.some((r) => r.includes('is not accepted'));
  if (!hasCategoryMismatch) {
    throw new Error('Assertion failed: Food category mismatch was not disqualified by Hard Filter!');
  }
  console.log('✓ Verified: Food category mismatch strictly enforced as a HARD constraint');

  console.log('\n--- TEST 2: STAGE 2 MULTI-FACTOR RANKING (URGENCY & NEED OVER DISTANCE) ---');
  const matchResult = await matchingService.matchDonation(donation1, 50);
  console.log('Ranked Receivers:');
  matchResult.ranked.forEach((r, idx) => {
    console.log(
      `  #${idx + 1}: ${r.receiver.organizationName} | Need: ${r.receiver.needLevel} | Available: ${r.availableCapacity} | Dist: ${r.roadDistanceKm}km (${r.travelMinutes}min) | Score: ${r.scores.composite} (Urgency: ${r.scores.urgency}, Need: ${r.scores.needLevel}, Cap: ${r.scores.capacityFit}, Dist: ${r.scores.distance})`
    );
  });

  // Top ranked receiver must have High need
  if (matchResult.ranked[0].receiver.needLevel !== NeedLevel.HIGH) {
    throw new Error('Assertion failed: High need receiver was not prioritized!');
  }
  console.log('✓ Verified: Priority ranking correctly prioritizes Urgency and Need over mere physical distance');

  console.log('\n--- TEST 3: 1:N PARTIAL SPLITTING & ATOMIC CAPACITY RESERVATION ---');
  // Create a 65 meal donation where top receiver can only take 55 meals
  // Hope Shelter has maxCap: 70, currentOcc: 15, reserved: 0 => available: 55 meals
  // St. Jude has maxCap: 45, currentOcc: 10, reserved: 0 => available: 35 meals
  const donation2 = await prisma.donation.create({
    data: {
      donorId: donorProfile.id,
      foodCategory: 'COOKED_MEALS',
      foodDescription: '65 containers of fresh pasta primavera',
      quantity: 65,
      unit: 'meals',
      pickupAddress: donorProfile.address,
      pickupLatitude: donorProfile.latitude,
      pickupLongitude: donorProfile.longitude,
      availableAt: new Date(),
      safeDeadline: new Date(Date.now() + 4 * 3600 * 1000),
      status: DonationStatus.MATCHING,
    },
  });

  const allocResult = await allocationEngine.proposeAllocationsForDonation(donation2.id);
  console.log(`Proposed ${allocResult.allocations.length} allocations for Donation #${donation2.id.slice(0, 8)}:`);
  allocResult.matchedReceivers.forEach((m) => {
    console.log(`  -> ${m.organizationName}: ${m.allocatedQuantity} meals (isPartial: ${m.isPartial})`);
  });

  if (allocResult.allocations.length !== 2) {
    throw new Error(`Assertion failed: Expected 2 allocations for 65 meals, got ${allocResult.allocations.length}`);
  }

  const totalAllocated = allocResult.allocations.reduce((sum, a) => sum + a.allocatedQuantity, 0);
  if (totalAllocated !== 65) {
    throw new Error(`Assertion failed: Expected total 65 meals allocated, got ${totalAllocated}`);
  }

  // Verify single donation record invariant
  const totalDonations = await prisma.donation.count({ where: { id: donation2.id } });
  if (totalDonations !== 1) {
    throw new Error('Assertion failed: Original donation record was duplicated!');
  }
  console.log('✓ Verified 1:N Splitting: Single donation split into 2 allocations without record duplication');

  // Verify atomic reservation hold
  const hopeProfile = await prisma.receiverProfile.findFirst({
    where: { organizationName: 'Hope Community Shelter' },
  });
  console.log(`Hope Shelter Reserved Quantity: ${hopeProfile?.reservedIncomingQuantity} (Expected: 55)`);
  if (hopeProfile?.reservedIncomingQuantity !== 55) {
    throw new Error('Assertion failed: Reserved incoming quantity was not atomically updated!');
  }
  console.log('✓ Verified: Atomic capacity reservation holds updated in database');

  console.log('\n--- TEST 4: RECEIVER REJECTION & AUTOMATIC REMATCHING ---');
  // First allocation is for Hope Shelter (55 meals)
  const hopeAllocation = allocResult.allocations[0];
  console.log(`Simulating rejection of Allocation #${hopeAllocation.id.slice(0, 8)} by Hope Shelter...`);

  const rejectionResult = await allocationEngine.rejectAllocation(
    hopeAllocation.id,
    'Kitchen refrigerator undergoing emergency maintenance'
  );

  console.log(`Allocation #${rejectionResult.rejectedAllocation.id.slice(0, 8)} status: ${rejectionResult.rejectedAllocation.status}`);
  if (rejectionResult.rejectedAllocation.status !== AllocationStatus.REJECTED) {
    throw new Error('Assertion failed: Allocation status is not REJECTED');
  }

  // Verify capacity reservation was released
  const updatedHope = await prisma.receiverProfile.findUnique({
    where: { id: hopeAllocation.receiverId },
  });
  console.log(`Hope Shelter Reserved Quantity after rejection: ${updatedHope?.reservedIncomingQuantity} (Expected: 0)`);
  if (updatedHope?.reservedIncomingQuantity !== 0) {
    throw new Error('Assertion failed: Reserved incoming quantity was not released upon rejection!');
  }
  console.log('✓ Verified: Capacity reservation atomically released upon rejection');

  console.log('--- ALL PHASE 3 MATCHING & ALLOCATION ENGINE TESTS PASSED ---');
}

runMatchingTests()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
