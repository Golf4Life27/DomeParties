// Catalog + venue-config seed, importable so the admin can (re)load it after
// deploy without local tooling. Data sourced from the venue's party cards.
import type { PrismaClient } from '@/generated/prisma'

export async function runSeed(prisma: PrismaClient) {
  // --- Settings -------------------------------------------------------------
  await prisma.setting.upsert({
    where: { id: 1 },
    update: {
      taxPct: 0, // prices are tax-inclusive per venue policy
      serviceChargePct: 20,
      serviceChargeOnGolf: true, // brochure: 20% service charge on F&B AND golf charges
      cardFeePct: 3.5, // brochure: 3.5% convenience fee on all credit card transactions
      peakSurchargePct: 22, // Fri–Sun premium (~$20/bay flat on the card; tune in admin)
      offPeakDiscountPct: 0,
      depositPercent: 10,
      bayCapacity: 6,
      bufferMinutes: 30,
      leadTimeDaysOnline: 7,
      staffNotifyEmail: 'Alex@whitetailridgegc.com',
    },
    create: {
      id: 1,
      openHour: 9,
      closeHour: 22,
      bayCapacity: 6,
      bufferMinutes: 30,
      leadTimeDaysOnline: 7,
      depositPercent: 10,
      serviceChargePct: 20,
      serviceChargeOnGolf: true,
      cardFeePct: 3.5,
      staffNotifyEmail: 'Alex@whitetailridgegc.com',
      taxPct: 0,
      peakSurchargePct: 22,
      offPeakDiscountPct: 0,
      cancelHoursLarge: 48,
      cancelHoursSmall: 24,
      cancelLargeThreshold: 15,
    },
  })

  // --- Resources: 30 bays (15 up / 15 down), 2 sims, bar/restaurant ---------
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

  // --- Per-bay-per-hour rate table (day/time + volume tier) -----------------
  // Reproduces the birthday card exactly: Mon–Thu $45/bay/hr (>=4 bays $41.25),
  // Fri–Sun $55/bay/hr (>=4 bays $50). Edit/extend in admin for group time tiers.
  await prisma.bayRate.deleteMany()
  await prisma.bayRate.createMany({
    data: [
      // Birthday rate set (used by the Instant Book birthday packages)
      { label: 'Mon–Thu', tag: 'birthday', daysOfWeek: [1, 2, 3, 4], minBays: 1, ratePerHour: 4500, sortOrder: 1 },
      { label: 'Mon–Thu (4+ bays)', tag: 'birthday', daysOfWeek: [1, 2, 3, 4], minBays: 4, ratePerHour: 4125, sortOrder: 2 },
      { label: 'Fri–Sun', tag: 'birthday', daysOfWeek: [5, 6, 0], minBays: 1, ratePerHour: 5500, sortOrder: 3 },
      { label: 'Fri–Sun (4+ bays)', tag: 'birthday', daysOfWeek: [5, 6, 0], minBays: 4, ratePerHour: 5000, sortOrder: 4 },

      // Large-group rate set (per bay, 4-bay minimum). flatPerBay is the printed
      // per-bay block price from the trifold; ratePerHour is the reference rate.
      // Mon–Thu morning (open–12pm): $70 / $100 / $120 per bay
      { label: 'Group · Mon–Thu AM (2 hr)', tag: 'group', daysOfWeek: [1, 2, 3, 4], startMinute: 0, endMinute: 720, minHours: 0, ratePerHour: 3500, flatPerBay: 7000, sortOrder: 10 },
      { label: 'Group · Mon–Thu AM (3 hr)', tag: 'group', daysOfWeek: [1, 2, 3, 4], startMinute: 0, endMinute: 720, minHours: 3, ratePerHour: 3333, flatPerBay: 10000, sortOrder: 11 },
      { label: 'Group · Mon–Thu AM (4 hr)', tag: 'group', daysOfWeek: [1, 2, 3, 4], startMinute: 0, endMinute: 720, minHours: 4, ratePerHour: 3000, flatPerBay: 12000, sortOrder: 12 },
      // Mon–Thu afternoon/evening (12pm–close): $100 / $140 / $160 per bay
      { label: 'Group · Mon–Thu PM (2 hr)', tag: 'group', daysOfWeek: [1, 2, 3, 4], startMinute: 720, endMinute: 1440, minHours: 0, ratePerHour: 5000, flatPerBay: 10000, sortOrder: 13 },
      { label: 'Group · Mon–Thu PM (3 hr)', tag: 'group', daysOfWeek: [1, 2, 3, 4], startMinute: 720, endMinute: 1440, minHours: 3, ratePerHour: 4667, flatPerBay: 14000, sortOrder: 14 },
      { label: 'Group · Mon–Thu PM (4 hr)', tag: 'group', daysOfWeek: [1, 2, 3, 4], startMinute: 720, endMinute: 1440, minHours: 4, ratePerHour: 4000, flatPerBay: 16000, sortOrder: 15 },
      // Friday morning–afternoon (open–2pm): $100 / $150 / $190 per bay
      { label: 'Group · Fri AM (2 hr)', tag: 'group', daysOfWeek: [5], startMinute: 0, endMinute: 840, minHours: 0, ratePerHour: 5000, flatPerBay: 10000, sortOrder: 16 },
      { label: 'Group · Fri AM (3 hr)', tag: 'group', daysOfWeek: [5], startMinute: 0, endMinute: 840, minHours: 3, ratePerHour: 5000, flatPerBay: 15000, sortOrder: 17 },
      { label: 'Group · Fri AM (4 hr)', tag: 'group', daysOfWeek: [5], startMinute: 0, endMinute: 840, minHours: 4, ratePerHour: 4750, flatPerBay: 19000, sortOrder: 18 },
      // Sunday morning (open–12pm): $110 / $150 / $190 per bay
      { label: 'Group · Sun AM (2 hr)', tag: 'group', daysOfWeek: [0], startMinute: 0, endMinute: 720, minHours: 0, ratePerHour: 5500, flatPerBay: 11000, sortOrder: 19 },
      { label: 'Group · Sun AM (3 hr)', tag: 'group', daysOfWeek: [0], startMinute: 0, endMinute: 720, minHours: 3, ratePerHour: 5000, flatPerBay: 15000, sortOrder: 20 },
      { label: 'Group · Sun AM (4 hr)', tag: 'group', daysOfWeek: [0], startMinute: 0, endMinute: 720, minHours: 4, ratePerHour: 4750, flatPerBay: 19000, sortOrder: 21 },
      // Peak weekend (Fri 2pm–close, Sat all day, Sun 12pm–close): $110 / $165 / $220 per bay
      { label: 'Group · Fri PM (2 hr)', tag: 'group', daysOfWeek: [5], startMinute: 840, endMinute: 1440, minHours: 0, ratePerHour: 5500, flatPerBay: 11000, sortOrder: 22 },
      { label: 'Group · Fri PM (3 hr)', tag: 'group', daysOfWeek: [5], startMinute: 840, endMinute: 1440, minHours: 3, ratePerHour: 5500, flatPerBay: 16500, sortOrder: 23 },
      { label: 'Group · Fri PM (4 hr)', tag: 'group', daysOfWeek: [5], startMinute: 840, endMinute: 1440, minHours: 4, ratePerHour: 5500, flatPerBay: 22000, sortOrder: 24 },
      { label: 'Group · Saturday (2 hr)', tag: 'group', daysOfWeek: [6], startMinute: 0, endMinute: 1440, minHours: 0, ratePerHour: 5500, flatPerBay: 11000, sortOrder: 25 },
      { label: 'Group · Saturday (3 hr)', tag: 'group', daysOfWeek: [6], startMinute: 0, endMinute: 1440, minHours: 3, ratePerHour: 5500, flatPerBay: 16500, sortOrder: 26 },
      { label: 'Group · Saturday (4 hr)', tag: 'group', daysOfWeek: [6], startMinute: 0, endMinute: 1440, minHours: 4, ratePerHour: 5500, flatPerBay: 22000, sortOrder: 27 },
      { label: 'Group · Sun PM (2 hr)', tag: 'group', daysOfWeek: [0], startMinute: 720, endMinute: 1440, minHours: 0, ratePerHour: 5500, flatPerBay: 11000, sortOrder: 28 },
      { label: 'Group · Sun PM (3 hr)', tag: 'group', daysOfWeek: [0], startMinute: 720, endMinute: 1440, minHours: 3, ratePerHour: 5500, flatPerBay: 16500, sortOrder: 29 },
      { label: 'Group · Sun PM (4 hr)', tag: 'group', daysOfWeek: [0], startMinute: 720, endMinute: 1440, minHours: 4, ratePerHour: 5500, flatPerBay: 22000, sortOrder: 30 },
    ],
  })

  const BAY_INCLUDES = [
    '2 hours of bay time',
    'Dedicated party host',
    'Virtual games, driving range & course play',
    'Complimentary clubs & golf balls',
    'Juice box & chips per guest (with a food package)',
  ]

  // --- Birthday packages (FLAT, Mon–Thu base; Fri–Sun adds peak %) ----------
  await prisma.bookingAddOn.deleteMany()
  await prisma.package.deleteMany()
  await prisma.package.createMany({
    data: [
      {
        name: 'Birthday Party — Up to 10 Guests',
        tier: '2 Bays',
        eventType: 'BIRTHDAY',
        description: 'Our classic birthday party for up to 10 guests across 2 bays. Add a food package to make it a full celebration.',
        includes: BAY_INCLUDES,
        durationMinutes: 120,
        bays: 2,
        pricingType: 'BAY_RATE',
        minGuests: 1,
        maxGuests: 10,
        popular: false,
        sortOrder: 1,
      },
      {
        name: 'Birthday Party — Up to 20 Guests',
        tier: '4 Bays',
        eventType: 'BIRTHDAY',
        description: 'The big bash for up to 20 guests across 4 bays — perfect for bigger friend groups and families.',
        includes: BAY_INCLUDES,
        durationMinutes: 120,
        bays: 4,
        pricingType: 'BAY_RATE',
        minGuests: 11,
        maxGuests: 20,
        popular: true,
        sortOrder: 2,
      },
      // Premium anchor tier — INACTIVE until Alex approves the price. Three
      // tiers anchor better than two: this makes the 4-bay tier feel mid-range.
      {
        name: 'The Ultimate Bash — Up to 20 Guests',
        tier: 'VIP',
        eventType: 'BIRTHDAY' as const,
        description:
          'The no-decisions, all-in celebration: bays, burger sliders for everyone, unlimited soft drinks, and full décor — just show up and party.',
        includes: [
          '2 hours across 4 bays',
          'Burger sliders meal for every guest',
          'Unlimited soft drinks',
          'Celebration décor & reserved setup',
          'Dedicated party host',
          'Juice box & chips per guest',
        ],
        durationMinutes: 120,
        bays: 4,
        pricingType: 'FLAT' as const,
        flatPrice: 64900, // review before activating (≈ $330 bays + $240 sliders + $80 drinks + $75 décor − bundle discount)
        minGuests: 11,
        maxGuests: 20,
        popular: false,
        active: false, // flip in admin once the price is approved
        sortOrder: 3,
      },
      // Large-group self-serve: duration presets; bays scale with the group
      // (min 4), priced from the "group" rate set.
      ...[
        { hrs: 2, mins: 120 },
        { hrs: 3, mins: 180 },
        { hrs: 4, mins: 240 },
      ].map((d, i) => ({
        name: `Large Group — ${d.hrs} Hours`,
        tier: `${d.hrs} hr`,
        eventType: 'GROUP' as const,
        description: `Reserve your bays for ${d.hrs} hours. Bays scale with your group (4-bay minimum); price adjusts for day & time automatically.`,
        includes: [
          'Private bays (4-bay minimum)',
          'Complimentary clubs & unlimited balls',
          'Trackman range tech + virtual courses & games',
          'Dedicated party host & personal server',
          'Food & beverage service available',
        ],
        durationMinutes: d.mins,
        bays: 4,
        dynamicBays: true,
        rateTag: 'group',
        pricingType: 'BAY_RATE' as const,
        minGuests: 13,
        maxGuests: 180,
        popular: i === 1,
        sortOrder: 10 + i,
      })),
    ],
  })

  // --- F&B packages (per person) --------------------------------------------
  // Birthday food bundles are priced all-in (no extra service charge, matching
  // the rack card). Group themed buffets carry the 20% F&B service charge.
  await prisma.fnbPackage.deleteMany()
  await prisma.fnbPackage.createMany({
    data: [
      {
        name: 'Chicken Tenders Meal',
        description: 'Crispy chicken tenders for every guest, plus a juice box & chips each.',
        pricingType: 'PER_PERSON',
        price: 700,
        serviceCharge: false,
        sortOrder: 1,
      },
      {
        name: 'Burger Sliders Meal',
        description: 'Burger sliders for every guest, plus a juice box & chips each.',
        pricingType: 'PER_PERSON',
        price: 1200,
        serviceCharge: false,
        sortOrder: 2,
      },
      {
        name: 'Pizza Party Buffet',
        description: 'Cheese, pepperoni or sausage pizzas, bread sticks, cheese curds, choice of Caesar or pasta salad, cookies & brownie bites.',
        pricingType: 'PER_PERSON',
        price: 3000,
        serviceCharge: true,
        sortOrder: 3,
      },
      {
        name: 'Bunch of Bites Buffet',
        description: 'Boneless wings (choice of sauce or rub), cheese curds, fried pickles, chips & salsa, cookies & brownie bites.',
        pricingType: 'PER_PERSON',
        price: 2400,
        serviceCharge: true,
        sortOrder: 4,
      },
      {
        name: 'All American Buffet',
        description: 'Cheeseburger sliders, BBQ beef sliders, tots, choice of green/pasta/potato salad, cookies & brownie bites.',
        pricingType: 'PER_PERSON',
        price: 2600,
        serviceCharge: true,
        sortOrder: 5,
      },
      {
        name: 'Fiesta Buffet',
        description: 'Ground beef & honey-lime chicken, street tortillas, cilantro-lime rice, refried beans & condiments.',
        pricingType: 'PER_PERSON',
        price: 2600,
        dietaryNotes: 'Gluten-free options available',
        serviceCharge: true,
        sortOrder: 6,
      },
      // Retired from the current trifold — kept inactive so it's one click to restore.
      {
        name: 'Early Birdie Buffet',
        description: 'Eggs, sausage, bacon, tots, French toast & fresh fruit.',
        pricingType: 'PER_PERSON',
        price: 2000,
        serviceCharge: true,
        active: false,
        sortOrder: 7,
      },
    ],
  })

  // Appetizer menu for build-your-own platters — drawn from the restaurant
  // menu items on the trifold. Edit anytime in admin → Add-ons (choiceList).
  const BYO_APPS = [
    'Boneless Wings',
    'Cheese Curds',
    'Fried Pickles',
    'Chips, Salsa & Queso',
    'Loaded Fries',
    'Signature Nachos',
    'Giant Pretzel & Queso',
    'Cheeseburger Sliders',
    'BBQ Chicken Sliders',
    'Tots',
  ]

  // --- Add-ons (one-tap upsells) --------------------------------------------
  await prisma.addOn.deleteMany()
  await prisma.addOn.createMany({
    data: [
      // Beverages (per person, 2 hrs of service) — 20% service charge applies
      { name: 'Unlimited Soft Drinks', description: 'Bottomless soda, lemonade & iced tea for the whole party.', category: 'Beverages', price: 400, unit: 'PER_PERSON', serviceCharge: true, sortOrder: 1 },
      { name: 'Beer & Wine Bar', description: 'Domestic beer & house wine — 2 hours of service (21+).', category: 'Beverages', price: 1600, unit: 'PER_PERSON', serviceCharge: true, sortOrder: 2 },
      { name: 'Standard Bar', description: 'Wheatley Vodka, Tanqueray, Captain, Jim Beam & more — 2 hours (21+).', category: 'Beverages', price: 2000, unit: 'PER_PERSON', serviceCharge: true, sortOrder: 3 },
      { name: 'Premium Brand Bar', description: "Tito's, Bombay, Maker's Mark, Jack Daniels & more — 2 hours (21+).", category: 'Beverages', price: 2700, unit: 'PER_PERSON', serviceCharge: true, sortOrder: 4 },
      // Party platters (flat) — 20% service charge applies
      { name: 'Hand-Breaded Wings (30)', description: '30 wings with your choice of sauce or rub.', category: 'Food', price: 4000, unit: 'FLAT', serviceCharge: true, sortOrder: 10, choiceCount: 1, choiceList: ['BBQ', 'Buffalo', 'Caribbean Jerk', 'Nashville Hot Rub', 'House Rub', 'Lemon Pepper'] },
      { name: 'Cheese Curds', description: 'Beer-battered white cheddar cheese curds.', category: 'Food', price: 4000, unit: 'FLAT', serviceCharge: true, sortOrder: 11 },
      { name: 'Cheeseburger Sliders (15)', description: '15 cheeseburger sliders on brioche with lettuce, tomato & pickles.', category: 'Food', price: 3800, unit: 'FLAT', serviceCharge: true, sortOrder: 12 },
      { name: 'BBQ Chicken Sliders (15)', description: '15 BBQ chicken sliders on brioche with lettuce, tomato & pickles.', category: 'Food', price: 2800, unit: 'FLAT', serviceCharge: true, sortOrder: 13 },
      { name: 'Loaded Fries', description: 'Fries topped with queso, bacon bits & BBQ crema.', category: 'Food', price: 2600, unit: 'FLAT', serviceCharge: true, sortOrder: 14 },
      { name: 'The Sandtrap (Giant Pretzel)', description: 'Giant pretzel with house-made queso and honey-mustard horseradish.', category: 'Food', price: 2400, unit: 'FLAT', serviceCharge: true, sortOrder: 15 },
      { name: 'Signature Nachos', description: 'Lettuce, tomato, onions, queso & house-made crema.', category: 'Food', price: 2400, unit: 'FLAT', serviceCharge: true, sortOrder: 16 },
      { name: 'Bottomless Chips, Salsa & Queso', description: 'Tortilla chips with salsa and queso.', category: 'Food', price: 2400, unit: 'FLAT', serviceCharge: true, sortOrder: 17 },
      { name: 'Add Grilled Chicken (Fries/Nachos)', description: 'Top your Loaded Fries or Signature Nachos with grilled chicken.', category: 'Food', price: 1000, unit: 'FLAT', serviceCharge: true, sortOrder: 18 },
      { name: 'Add Ground Beef (Fries/Nachos)', description: 'Top your Loaded Fries or Signature Nachos with seasoned ground beef.', category: 'Food', price: 800, unit: 'FLAT', serviceCharge: true, sortOrder: 19 },
      // Retired from the current trifold — kept inactive so it's one click to restore.
      { name: 'Tater Smash', description: 'Crispy seasoned tater tots, ground beef, parmesan & BBQ crema.', category: 'Food', price: 2800, unit: 'FLAT', serviceCharge: true, active: false, sortOrder: 24 },
      // Build-your-own platter bundles (flat) — 20% service charge applies.
      // App list is editable in admin → Add-ons (choiceList).
      { name: 'Build-Your-Own: Pick 2 Apps', description: 'Choose any 2 appetizers from the restaurant menu.', category: 'Food', price: 2500, unit: 'FLAT', serviceCharge: true, sortOrder: 20, choiceCount: 2, choiceList: BYO_APPS },
      { name: 'Build-Your-Own: Pick 4 Apps', description: 'Choose any 4 appetizers from the restaurant menu.', category: 'Food', price: 5000, unit: 'FLAT', serviceCharge: true, sortOrder: 21, choiceCount: 4, choiceList: BYO_APPS },
      { name: 'Build-Your-Own: Pick 6 Apps', description: 'Choose any 6 appetizers from the restaurant menu.', category: 'Food', price: 7500, unit: 'FLAT', serviceCharge: true, sortOrder: 22, choiceCount: 6, choiceList: BYO_APPS },
      { name: 'Build-Your-Own: Pick 8 Apps', description: 'Choose any 8 appetizers from the restaurant menu.', category: 'Food', price: 10000, unit: 'FLAT', serviceCharge: true, sortOrder: 23, choiceCount: 8, choiceList: BYO_APPS },
      // Time & extras
      { name: '+30 Minutes of Bay Time', description: 'Keep the party going with an extra half hour of bay time.', category: 'Time', price: 4000, unit: 'PER_30_MIN', serviceCharge: false, sortOrder: 30 },
      { name: 'Celebration Décor', description: 'Balloons, table settings & a reserved décor setup.', category: 'Décor', price: 7500, unit: 'FLAT', serviceCharge: false, sortOrder: 31 },
    ],
  })

  const counts = {
    settings: await prisma.setting.count(),
    resources: await prisma.resource.count(),
    packages: await prisma.package.count(),
    fnb: await prisma.fnbPackage.count(),
    addOns: await prisma.addOn.count(),
  }
  return counts
}

