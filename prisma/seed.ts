import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  // --- Settings (confirmed with Alex) ---------------------------------------
  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      openHour: 9,
      closeHour: 22,
      bayCapacity: 6,
      bufferMinutes: 30,
      leadTimeDaysOnline: 7,
      depositPercent: 10,
      serviceChargePct: 20,
      taxPct: 7.25, // Oswego, IL placeholder — confirm exact rate
      cancelHoursLarge: 48,
      cancelHoursSmall: 24,
      cancelLargeThreshold: 15,
    },
  })

  // --- Resources: 30 bays (15 up / 15 down), 2 sims, 1 event space ----------
  await prisma.bookingResource.deleteMany()
  await prisma.resource.deleteMany()
  const resources: {
    name: string
    type: 'BAY' | 'SIMULATOR' | 'EVENT_SPACE'
    floor: string | null
    capacity: number
    sortOrder: number
  }[] = []
  for (let i = 1; i <= 15; i++)
    resources.push({ name: `Bay ${i}`, type: 'BAY', floor: 'Downstairs', capacity: 6, sortOrder: i })
  for (let i = 16; i <= 30; i++)
    resources.push({ name: `Bay ${i}`, type: 'BAY', floor: 'Upstairs', capacity: 6, sortOrder: i })
  resources.push({ name: 'Simulator A', type: 'SIMULATOR', floor: 'Upstairs', capacity: 6, sortOrder: 31 })
  resources.push({ name: 'Simulator B', type: 'SIMULATOR', floor: 'Upstairs', capacity: 6, sortOrder: 32 })
  resources.push({ name: 'Bar & Restaurant', type: 'EVENT_SPACE', floor: null, capacity: 80, sortOrder: 33 })
  await prisma.resource.createMany({ data: resources })

  // --- Birthday packages (placeholder, vibe-named, editable in admin) -------
  await prisma.bookingAddOn.deleteMany()
  await prisma.package.deleteMany()
  await prisma.package.createMany({
    data: [
      {
        name: 'The Birdie',
        tier: 'Good',
        eventType: 'BIRTHDAY',
        description: 'A great-time starter: bay time, gameplay, and the essentials to get the party going.',
        includes: ['2 hours of bay time', 'Unlimited gameplay', 'Club rental included', 'Dedicated party host'],
        durationMinutes: 120,
        pricingType: 'PER_PERSON',
        pricePerPerson: 3900,
        minGuests: 6,
        maxGuests: 24,
        popular: false,
        sortOrder: 1,
      },
      {
        name: 'The Eagle',
        tier: 'Better',
        eventType: 'BIRTHDAY',
        description: 'Our most popular party: more time, a round of food, and the premium gameplay experience.',
        includes: [
          '2.5 hours of bay time',
          'Premium gameplay + games',
          'Club rental included',
          'One round of shareable food',
          'Dedicated party host',
          'Reserved party area',
        ],
        durationMinutes: 150,
        pricingType: 'PER_PERSON',
        pricePerPerson: 5500,
        minGuests: 6,
        maxGuests: 36,
        popular: true,
        sortOrder: 2,
      },
      {
        name: 'The Albatross',
        tier: 'Best',
        eventType: 'BIRTHDAY',
        description: 'The all-out celebration: maximum time, premium food & drink, and white-glove service.',
        includes: [
          '3 hours of bay time',
          'Premium gameplay + games',
          'Club rental included',
          'Chef-selected food spread',
          'Premium beverage package',
          'Dedicated party host + server',
          'Reserved premium area',
          'Celebration décor',
        ],
        durationMinutes: 180,
        pricingType: 'PER_PERSON',
        pricePerPerson: 7500,
        minGuests: 6,
        maxGuests: 48,
        popular: false,
        sortOrder: 3,
      },
    ],
  })

  // --- F&B packages ---------------------------------------------------------
  await prisma.fnbPackage.deleteMany()
  await prisma.fnbPackage.createMany({
    data: [
      {
        name: 'Snack Attack',
        description: 'Shareable apps to keep the energy up — chips & dip, pretzel bites, veggie tray.',
        pricingType: 'PER_PERSON',
        price: 1200,
        dietaryNotes: 'Vegetarian options available',
        serviceCharge: true,
        sortOrder: 1,
      },
      {
        name: 'MVP Spread',
        description: 'Crowd-pleasing buffet — sliders, wings, flatbreads, fries, and fresh salad.',
        pricingType: 'PER_PERSON',
        price: 2200,
        dietaryNotes: 'Gluten-free & vegetarian options available',
        serviceCharge: true,
        sortOrder: 2,
      },
      {
        name: 'The Clubhouse Feast',
        description: 'Premium spread — carving station, gourmet flatbreads, premium apps, dessert.',
        pricingType: 'PER_PERSON',
        price: 3200,
        dietaryNotes: 'Gluten-free, vegetarian & vegan options available',
        serviceCharge: true,
        sortOrder: 3,
      },
    ],
  })

  // --- Add-ons (the one-tap upsells; beverages first) -----------------------
  await prisma.addOn.createMany({
    data: [
      { name: 'Bottomless Soft Drinks', description: 'Unlimited soda, lemonade & iced tea for the whole party.', category: 'Beverages', price: 500, unit: 'PER_PERSON', serviceCharge: true, sortOrder: 1 },
      { name: 'Premium Bar Package', description: '2 hours of beer, wine & house cocktails (21+).', category: 'Beverages', price: 1800, unit: 'PER_PERSON', serviceCharge: true, sortOrder: 2 },
      { name: 'Round of Wings', description: 'A heaping platter of our famous wings (serves ~6).', category: 'Food', price: 4500, unit: 'FLAT', serviceCharge: true, sortOrder: 3 },
      { name: '+30 Minutes of Bay Time', description: 'Keep the party going with an extra half hour.', category: 'Time', price: 4000, unit: 'PER_30_MIN', serviceCharge: false, sortOrder: 4 },
      { name: 'Birthday Cake', description: 'Custom celebration cake (serves ~12).', category: 'Food', price: 3500, unit: 'FLAT', serviceCharge: false, sortOrder: 5 },
      { name: 'Celebration Décor', description: 'Balloons, table settings & a reserved décor setup.', category: 'Décor', price: 7500, unit: 'FLAT', serviceCharge: false, sortOrder: 6 },
      { name: 'Photographer (1 hr)', description: 'A pro to capture the memories for one hour.', category: 'Experience', price: 15000, unit: 'FLAT', serviceCharge: false, sortOrder: 7 },
      { name: 'Swag Bags', description: 'A branded Dome swag bag for every guest to take home.', category: 'Extras', price: 1200, unit: 'PER_PERSON', serviceCharge: false, sortOrder: 8 },
    ],
  })

  const counts = {
    settings: await prisma.setting.count(),
    resources: await prisma.resource.count(),
    packages: await prisma.package.count(),
    fnb: await prisma.fnbPackage.count(),
    addOns: await prisma.addOn.count(),
  }
  console.log('Seed complete:', counts)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
