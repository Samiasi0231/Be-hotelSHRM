import { PrismaClient, Role, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Super Admin
  const superAdminPassword = await bcrypt.hash('SuperAdmin@123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@hotelms.com' },
    update: {},
    create: {
      email: 'superadmin@hotelms.com',
      password: superAdminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log('✅ Super Admin created:', superAdmin.email);

  // Hotel Director
  const directorPassword = await bcrypt.hash('Director@123', 12);
  const director = await prisma.user.upsert({
    where: { email: 'director@grandhotel.com' },
    update: {},
    create: {
      email: 'director@grandhotel.com',
      password: directorPassword,
      firstName: 'John',
      lastName: 'Smith',
      phone: '+2348012345678',
      role: Role.HOTEL_DIRECTOR,
      isActive: true,
    },
  });
  console.log('✅ Hotel Director created:', director.email);

  // Hotel
  const hotel = await prisma.hotel.upsert({
    where: { directorId: director.id },
    update: {},
    create: {
      name: 'The Grand Lagos Hotel',
      description: 'A luxury 5-star hotel in the heart of Lagos',
      address: '123 Victoria Island',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      phone: '+2341234567890',
      email: 'info@grandhotel.com',
      website: 'https://grandhotel.com',
      starRating: 5,
      directorId: director.id,
      subscriptionPlan: SubscriptionPlan.LARGE,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  console.log('✅ Hotel created:', hotel.name);

  const shiftTypes = [
  {
    name: 'Morning',
    code: 'M',
    startTime: '07:00',
    endTime: '15:00',
    color: '#2563eb',
  },
  {
    name: 'Afternoon',
    code: 'A',
    startTime: '15:00',
    endTime: '23:00',
    color: '#16a34a',
  },
  {
    name: 'Night',
    code: 'N',
    startTime: '23:00',
    endTime: '07:00',
    color: '#7c3aed',
  },
  {
    name: 'Off',
    code: 'OFF',
    startTime: null,
    endTime: null,
    color: '#6b7280',
  },
];

  // Rooms
  const roomTypes = [
    { type: 'Standard', price: 25000, capacity: 2 },
    { type: 'Deluxe', price: 45000, capacity: 2 },
    { type: 'Suite', price: 85000, capacity: 4 },
    { type: 'Executive Suite', price: 150000, capacity: 4 },
    { type: 'Presidential Suite', price: 300000, capacity: 6 },
  ];

  for (let i = 1; i <= 20; i++) {
    const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
    await prisma.room.upsert({
      where: { hotelId_roomNumber: { hotelId: hotel.id, roomNumber: `${100 + i}` } },
      update: {},
      create: {
        hotelId: hotel.id,
        roomNumber: `${100 + i}`,
        roomType: roomType.type,
        description: `Beautiful ${roomType.type} room with modern amenities`,
        pricePerNight: roomType.price,
        capacity: roomType.capacity,
        floor: Math.ceil(i / 5),
        amenities: ['WiFi', 'AC', 'TV', 'Mini Bar', 'Safe'],
        images: [],
      },
    });
  }
  console.log('✅ 20 Rooms created');

  // Admin user
  const adminPassword = await bcrypt.hash('Admin@123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@grandhotel.com' },
    update: {},
    create: {
      email: 'admin@grandhotel.com',
      password: adminPassword,
      firstName: 'Mary',
      lastName: 'Johnson',
      phone: '+2348023456789',
      role: Role.ADMIN,
      isActive: true,
    },
  });

  await prisma.staff.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      hotelId: hotel.id,
      employeeId: 'EMP001',
      department: 'Administration',
      position: 'Hotel Manager',
      salary: 350000,
    },
  });
  console.log('✅ Admin staff created:', adminUser.email);

  // HR Admin
  const hrPassword = await bcrypt.hash('HR@123', 12);
  const hrUser = await prisma.user.upsert({
    where: { email: 'hr@grandhotel.com' },
    update: {},
    create: {
      email: 'hr@grandhotel.com',
      password: hrPassword,
      firstName: 'David',
      lastName: 'Okafor',
      phone: '+2348034567890',
      role: Role.ADMIN_HR,
      isActive: true,
    },
  });

  await prisma.staff.upsert({
    where: { userId: hrUser.id },
    update: {},
    create: {
      userId: hrUser.id,
      hotelId: hotel.id,
      employeeId: 'EMP002',
      department: 'Human Resources',
      position: 'HR Manager',
      salary: 280000,
    },
  });
  console.log('✅ HR Admin created:', hrUser.email);

  console.log('\n🎉 Seed completed!\n');
  console.log('📋 Login Credentials:');
  console.log('-----------------------------------');
  console.log('Super Admin: superadmin@hotelms.com / SuperAdmin@123');
  console.log('Director:    director@grandhotel.com / Director@123');
  console.log('Admin:       admin@grandhotel.com / Admin@123');
  console.log('HR Admin:    hr@grandhotel.com / HR@123');
  console.log('-----------------------------------');
}

main()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());


  