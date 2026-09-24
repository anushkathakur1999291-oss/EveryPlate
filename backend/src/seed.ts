import { PrismaClient, Role, NeedLevel } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedDatabase() {
  console.log('Seeding Surplus-To-Shelter database...');

  // Clear existing
  if (process.env.ALLOW_DEMO_RESET !== 'true' || process.env.NODE_ENV === 'production') throw new Error('Demo reset requires ALLOW_DEMO_RESET=true on a non-production database');
  await prisma.impactRecord.deleteMany();
  await prisma.locationEvent.deleteMany();
  await prisma.oTPVerification.deleteMany();
  await prisma.deliveryEvent.deleteMany();
  await prisma.driverAssignment.deleteMany();
  await prisma.receiverLogisticsAssignment.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.capacityReservation.deleteMany();
  await prisma.donationAllocation.deleteMany();
  await prisma.donation.deleteMany();
  await prisma.donorProfile.deleteMany();
  await prisma.receiverProfile.deleteMany();
  await prisma.driverProfile.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();

  // 1. Admin
  await prisma.user.create({
    data: {
      email: 'admin@everyplate.org',
      name: 'Elena Rostova',
      role: Role.ADMIN
    }
  });

  // 2. Donors
  const donors = [
    {
      email: 'marco@greenbistro.com',
      name: 'Chef Marco',
      org: 'The Green Bistro',
      type: 'RESTAURANT',
      address: '124 Market St, Downtown',
      lat: 40.7128,
      lng: -74.0060,
      phone: '+1-555-0101'
    },
    {
      email: 'sarah@wholeharvest.com',
      name: 'Sarah Jenkins',
      org: 'Whole Harvest Supermarket',
      type: 'GROCERY_STORE',
      address: '560 Broadway, SoHo',
      lat: 40.7223,
      lng: -73.9978,
      phone: '+1-555-0102'
    },
    {
      email: 'dining@campus.edu',
      name: 'Dave Miller',
      org: 'Metro University Cafeteria',
      type: 'CAFETERIA',
      address: '110 8th Ave, Midtown',
      lat: 40.7450,
      lng: -73.9930,
      phone: '+1-555-0103'
    }
  ];

  for (const d of donors) {
    await prisma.user.create({
      data: {
        email: d.email,
        name: d.name,
        role: Role.DONOR,
        donorProfile: {
          create: {
            organizationName: d.org,
            donorType: d.type,
            address: d.address,
            latitude: d.lat,
            longitude: d.lng,
            phone: d.phone
          }
        }
      }
    });
  }

  // 3. Receivers
  const receivers = [
    {
      email: 'director@hopeshelter.org',
      name: 'Sister Mary',
      org: 'Hope Community Shelter',
      maxCap: 70,
      currentOcc: 15,
      need: NeedLevel.HIGH,
      prefs: ['COOKED_MEALS', 'BAKERY', 'PRODUCE'],
      accepting: true,
      address: '320 Bowery, East Village',
      lat: 40.7245,
      lng: -73.9920,
      phone: '+1-555-0201',
      ownLogistics: true
    },
    {
      email: 'foodbank@grace.org',
      name: 'Pastor Thomas',
      org: 'Grace Metropolitan Food Bank',
      maxCap: 120,
      currentOcc: 45,
      need: NeedLevel.MEDIUM,
      prefs: ['PACKAGED_GOODS', 'PRODUCE', 'DAIRY'],
      accepting: true,
      address: '740 10th Ave, Hell\'s Kitchen',
      lat: 40.7650,
      lng: -73.9910,
      phone: '+1-555-0202',
      ownLogistics: false
    },
    {
      email: 'kitchen@stjudes.org',
      name: 'Brother Leo',
      org: 'St. Jude Youth Kitchen',
      maxCap: 45,
      currentOcc: 10,
      need: NeedLevel.HIGH,
      prefs: ['COOKED_MEALS', 'DAIRY'],
      accepting: true,
      address: '185 Canal St, Chinatown',
      lat: 40.7160,
      lng: -73.9980,
      phone: '+1-555-0203',
      ownLogistics: false
    },
    {
      email: 'info@northsidepantry.org',
      name: 'Karen Walker',
      org: 'Northside Closed Pantry',
      maxCap: 50,
      currentOcc: 50,
      need: NeedLevel.LOW,
      prefs: ['COOKED_MEALS'],
      accepting: false, // Testing Hard Filter
      address: '920 Amsterdam Ave, Upper West Side',
      lat: 40.8000,
      lng: -73.9680,
      phone: '+1-555-0204',
      ownLogistics: true
    }
  ];

  for (const r of receivers) {
    await prisma.user.create({
      data: {
        email: r.email,
        name: r.name,
        role: Role.RECEIVER,
        receiverProfile: {
          create: {
            organizationName: r.org,
            maxCapacity: r.maxCap,
            currentOccupancy: r.currentOcc,
            reservedIncomingQuantity: 0,
            needLevel: r.need,
            foodPreferences: JSON.stringify(r.prefs),
            acceptingDonations: r.accepting,
            address: r.address,
            latitude: r.lat,
            longitude: r.lng,
            phone: r.phone,
            hasOwnLogistics: r.ownLogistics
          }
        }
      }
    });
  }

  // 4. Drivers
  const drivers = [
    {
      email: 'alex.rivera@rescue.org',
      name: 'Alex Rivera',
      vehicle: 'CAR',
      lat: 40.7180,
      lng: -74.0010,
      phone: '+1-555-0301'
    },
    {
      email: 'priya.sharma@rescue.org',
      name: 'Priya Sharma',
      vehicle: 'VAN',
      lat: 40.7300,
      lng: -73.9950,
      phone: '+1-555-0302'
    },
    {
      email: 'marcus.chen@rescue.org',
      name: 'Marcus Chen',
      vehicle: 'BIKE',
      lat: 40.7100,
      lng: -74.0080,
      phone: '+1-555-0303'
    }
  ];

  for (const drv of drivers) {
    await prisma.user.create({
      data: {
        email: drv.email,
        name: drv.name,
        role: Role.DRIVER,
        driverProfile: {
          create: {
            fullName: drv.name,
            vehicleType: drv.vehicle,
            currentLatitude: drv.lat,
            currentLongitude: drv.lng,
            isAvailable: true,
            phone: drv.phone
          }
        }
      }
    });
  }

  console.log('✓ Seeding complete: 1 Admin, 3 Donors, 4 Receivers, 3 Drivers');
}

if (require.main === module) {
  seedDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
