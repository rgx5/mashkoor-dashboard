import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const day = 24 * 3600 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * day);
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10) + "T00:00:00.000Z");

/** Demo data for trying every portal locally. Reference numbers use a DEMO suffix so they never collide with real sequences. */
async function seedDemo(passwordHash: string) {
  // Demo partner (approved, with a funded wallet) and demo customer, so the B2B/B2C demo logins have real records.
  const partner = await prisma.partner.upsert({
    where: { refNo: "MKP-DEMO" },
    update: {},
    create: {
      refNo: "MKP-DEMO",
      companyName: "Demo Travels & Tours",
      contactName: "Demo Partner Admin",
      phone: "+919000000002",
      email: "partner@demo.mashkoor.local",
      city: "Mumbai",
      state: "Maharashtra",
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });
  await prisma.walletAccount.upsert({ where: { partnerId: partner.id }, update: {}, create: { partnerId: partner.id, balance: 100_000, creditLimit: 50_000 } });

  const customer = await prisma.customer.upsert({
    where: { refNo: "MKC-DEMO" },
    update: {},
    create: { refNo: "MKC-DEMO", fullName: "Demo Customer", phone: "+919000000001", email: "customer@demo.mashkoor.local", city: "Mumbai", source: "OTHER" },
  });

  const demos = [
    { type: "STAFF", role: "OPS_MANAGER", name: "Demo Operations", email: "ops@demo.mashkoor.local" },
    { type: "STAFF", role: "SALES_AGENT", name: "Demo Sales Agent", email: "sales@demo.mashkoor.local" },
    { type: "PARTNER", role: "PARTNER_ADMIN", name: "Demo Partner Admin", email: "partner@demo.mashkoor.local", partnerId: partner.id },
    { type: "CUSTOMER", role: "CUSTOMER", name: "Demo Customer", email: "customer@demo.mashkoor.local", customerId: customer.id },
  ] as const;
  for (const demo of demos) {
    const links = { partnerId: "partnerId" in demo ? demo.partnerId : undefined, customerId: "customerId" in demo ? demo.customerId : undefined };
    await prisma.user.upsert({ where: { email: demo.email }, update: links, create: { ...demo, passwordHash, status: "ACTIVE" } });
  }

  // Catalog
  const destination = await prisma.destination.upsert({
    where: { slug: "makkah-madinah" },
    update: {},
    create: { slug: "makkah-madinah", name: "Makkah & Madinah", country: "Saudi Arabia", summary: "Umrah and Ziyarat to the two holy cities.", published: true },
  });
  await prisma.package.upsert({
    where: { slug: "umrah-10-nights" },
    update: {},
    create: {
      refCode: "PKG-DEMO",
      slug: "umrah-10-nights",
      title: "Umrah — 10 Nights, 5-star Haram view",
      productType: "PACKAGE",
      destinationId: destination.id,
      nights: 10,
      days: 11,
      summary: "Guided Umrah with 5 nights each in Makkah and Madinah.",
      inclusions: ["Return flights", "Visa", "Hotels with breakfast", "Airport transfers"],
      exclusions: ["Lunch and dinner", "Personal expenses"],
      itinerary: [
        { day: 1, title: "Depart Mumbai", description: "Fly to Jeddah, transfer to Makkah." },
        { day: 2, title: "Umrah", description: "Perform Umrah with a guide." },
      ],
      hotels: [
        { city: "Makkah", hotelName: "Demo Haram Hotel", nights: 5, roomType: "Quad", mealPlan: "Breakfast" },
        { city: "Madinah", hotelName: "Demo Nabawi Hotel", nights: 5, roomType: "Quad", mealPlan: "Breakfast" },
      ],
      priceTiers: [{ label: "Quad sharing", adultPrice: 125_000, childPrice: 105_000, currency: "INR" }],
      published: true,
      featured: true,
    },
  });
  await prisma.testimonial.upsert({
    where: { id: "00000000-0000-7000-8000-0000000000a1" },
    update: {},
    create: { id: "00000000-0000-7000-8000-0000000000a1", customerName: "Ahmed K.", location: "Mumbai", rating: 5, quote: "Everything was arranged perfectly — from the visa to the hotel by the Haram.", published: true },
  });

  // Inventory: one hotel with a room type and a rate period, and one flight block
  let hotel = await prisma.hotel.findFirst({ where: { name: "Demo Haram Hotel" } });
  hotel ??= await prisma.hotel.create({ data: { name: "Demo Haram Hotel", city: "Makkah", country: "SA", category: 5 } });
  let roomType = await prisma.roomType.findFirst({ where: { hotelId: hotel.id, name: "Quad Room" } });
  roomType ??= await prisma.roomType.create({ data: { hotelId: hotel.id, name: "Quad Room", maxAdults: 4, maxChildren: 1, mealPlan: "BREAKFAST" } });
  if (!(await prisma.ratePeriod.findFirst({ where: { roomTypeId: roomType.id } }))) {
    await prisma.ratePeriod.create({ data: { roomTypeId: roomType.id, startDate: dateOnly(inDays(20)), endDate: dateOnly(inDays(60)), costPrice: 6_000, totalRooms: 20 } });
  }
  if (!(await prisma.flightSeatBlock.findFirst({ where: { flightNumber: "SV751" } }))) {
    await prisma.flightSeatBlock.create({
      data: { airline: "Saudia", flightNumber: "SV751", origin: "BOM", destination: "JED", departureAt: inDays(25), arrivalAt: new Date(inDays(25).getTime() + 5 * 3600 * 1000), cabinClass: "ECONOMY", totalSeats: 40, costPrice: 32_000 },
    });
  }

  // Pricing: 15% on B2C, 8% on B2B
  for (const rule of [
    { name: "Default B2C markup", scope: "B2C", value: 15 },
    { name: "Default B2B markup", scope: "B2B", value: 8 },
  ] as const) {
    if (!(await prisma.pricingRule.findFirst({ where: { name: rule.name } }))) {
      await prisma.pricingRule.create({ data: { name: rule.name, scope: rule.scope, adjustmentType: "PERCENT_MARKUP", value: rule.value, priority: 0 } });
    }
  }
}

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@mashkoor.co.in").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 10) throw new Error("Set SEED_ADMIN_PASSWORD (at least 10 characters) in backend/.env");

  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { type: "STAFF", role: "SUPER_ADMIN", name: "Super Admin", email, passwordHash, status: "ACTIVE" },
  });

  if (process.env.NODE_ENV !== "production") await seedDemo(passwordHash);

  await prisma.setting.upsert({
    where: { key: "company.profile" },
    update: {},
    create: {
      key: "company.profile",
      value: {
        name: "Mashkoor International Tourism",
        email: "info@mashkoor.co.in",
        phones: ["+919082710830", "+918779500335"],
        address: "Office No. 09, Sector G, N/2 Line, Cheeta Camp, Trombay, Mumbai",
      },
    },
  });

  console.log(`Seeded Super Admin: ${email}${process.env.NODE_ENV !== "production" ? " (+ demo partner, customer, catalog, inventory and pricing)" : ""}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
