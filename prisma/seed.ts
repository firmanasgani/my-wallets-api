import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
const prisma = new PrismaClient();

async function main() {
  console.log(`Start Seeding ...`);

  const banksData = [
    {
      code: '002',
      name: 'PT. BANK RAKYAT INDONESIA (PERSERO), TBK (BRI)',
    },
    {
      code: '008',
      name: 'PT. BANK MANDIRI (PERSERO), TBK',
    },
    {
      code: '009',
      name: 'PT. BANK NEGARA INDONESIA (PERSERO), TBK (BNI)',
    },
    {
      code: '011',
      name: 'Bank Danamon',
    },
    {
      code: '013',
      name: 'PT. BANK MAYAPADA INTERNATIONAL TBK',
    },
    {
      code: '014',
      name: 'PT. BANK CENTRAL ASIA, TBK - (BCA)',
    },
    {
      code: '016',
      name: 'PT. BANK MAYBANK INDONESIA, TBK',
    },
    {
      code: '022',
      name: 'PT. BANK CIMB NIAGA - (CIMB)',
    },
    {
      code: '028',
      name: 'PT. BANK OCBC NISP, TBK',
    },
    {
      code: '042',
      name: 'PT. BANK WOORI SAUDARA INDONESIA',
    },
    {
      code: '046',
      name: 'PT. BANK DBS INDONESIA',
    },
    {
      code: '054',
      name: 'PT. BANK CAPITAL INDONESIA',
    },
    {
      code: '076',
      name: 'PT. BANK SUMUT',
    },
    {
      code: '087',
      name: 'PT. BANK HSBC INDONESIA',
    },
    {
      code: '088',
      name: 'PT. BANK MEGA SYARIAH',
    },
    {
      code: '095',
      name: 'PT. BANK JTRUST INDONESIA, TBK',
    },
    {
      code: '100',
      name: 'PT. BANK GANESHA',
    },
    {
      code: '101',
      name: 'PT. BANK GANESHA - 101',
    },
    {
      code: '102',
      name: 'PT. BANK GANESHA - 102',
    },
    {
      code: '103',
      name: 'PT. BANK GANESHA - 103',
    },
    {
      code: '104',
      name: 'PT. BANK GANESHA - 104',
    },
    {
      code: '110',
      name: 'PT. BANK MASPION INDONESIA',
    },
    {
      code: '111',
      name: 'PT. BANK DKI',
    },
    {
      code: '114',
      name: 'PT. BANK PERSYARIKATAN INDONESIA',
    },
    {
      code: '123',
      name: 'Bank BPD Kalbar',
    },
    {
      code: '137',
      name: 'PT. BANK PEMBANGUNAN DAERAH BANTEN',
    },
    {
      code: '147',
      name: 'PT. BANK MUAMALAT INDONESIA, TBK',
    },
    {
      code: '161',
      name: 'PT. BANK MNC INTERNASIONAL',
    },
    {
      code: '164',
      name: 'PT. BANK ICBC INDONESIA',
    },
    {
      code: '200',
      name: 'PT. BANK TABUNGAN NEGARA (PERSERO), TBK (BTN)',
    },
    {
      code: '212',
      name: 'PT. BANK WOORI SAUDARA INDONESIA 1906, TBK (BWS)',
    },
    {
      code: '213',
      name: 'PT. BANK SUMITOMO MITSUI INDONESIA - (SMBC)',
    },
    {
      code: '023',
      name: 'PT. BANK UOB INDONESIA',
    },
    {
      code: '405',
      name: 'PT. BANK VICTORIA SYARIAH',
    },
    {
      code: '422',
      name: 'PT. BANK SYARIAH BRI - (BRI SYARIAH)',
    },
    {
      code: '425',
      name: 'PT. BANK JABAR BANTEN SYARIAH',
    },
    {
      code: '426',
      name: 'PT. BANK MEGA, TBK',
    },
    {
      code: '427',
      name: 'PT. BNI SYARIAH',
    },
    {
      code: '441',
      name: 'PT. BANK BUKOPIN',
    },
    {
      code: '451',
      name: 'PT. BANK SYARIAH MANDIRI',
    },
    {
      code: '484',
      name: 'Bank KEB Hana',
    },
    {
      code: '494',
      name: 'PT. BANK RAKYAT INDONESIA AGRONIAGA, TBK',
    },
    {
      code: '513',
      name: 'PT. BANK INA PERDANA',
    },
    {
      code: '517',
      name: 'PT. BANK HARFA',
    },
    {
      code: '521',
      name: 'PT. BANK SYARIAH BUKOPIN',
    },
    {
      code: '525',
      name: 'PT. BANK AKITA',
    },
    {
      code: '526',
      name: 'PT. BANK CHINA TRUST INDONESIA',
    },
    {
      code: '536',
      name: 'PT. BANK BCA SYARIAH',
    },
    {
      code: '547',
      name: 'PT. BANK SINAR HARAPAN BALI',
    },
    {
      code: '548',
      name: 'PT. BANK WOORI SAUDARA',
    },
    {
      code: '553',
      name: 'PT. BANK MAYORA',
    },
    {
      code: '564',
      name: 'PT. BANK MANDIRI TASPEN POS',
    },
    {
      code: '566',
      name: 'PT. BANK VICTORIA INTERNATIONAL',
    },
    {
      code: '721',
      name: 'PT. BANK PERMATA, TBK UNIT USAHA SYARIAH',
    },
    {
      code: '723',
      name: 'PT. BANK TABUNGAN NEGARA (PERSERO), TBK UNIT USAHA SYARIAH',
    },
    {
      code: '724',
      name: 'PT. BANK DKI UNIT USAHA SYARIAH',
    },
    {
      code: '730',
      name: 'PT. BANK CIMB NIAGA UNIT USAHA SYARIAH - (CIMB SYARIAH)',
    },
    {
      code: '731',
      name: 'PT. BANK OCBC NISP, TBK UNIT USAHA SYARIAH',
    },
  ];

  for (const bank of banksData) {
    await prisma.bank.upsert({
      where: {
        code: bank.code,
      },
      update: {
        name: bank.name,
      },
      create: bank,
    });
  }

  // --- Subscription Plans ---
  const plans = [
    {
      name: 'Free Plan',
      code: 'FREE',
      description: 'Default free plan',
      price: 0,
      discountPrice: 0,
      durationMonths: null,
    },
    {
      name: 'Premium 1 Month',
      code: 'PREMIUM_1M',
      description: 'Premium access for 1 month',
      price: 39000,
      discountPrice: 35000,
      durationMonths: 1,
    },
    {
      name: 'Premium 6 Months',
      code: 'PREMIUM_6M',
      description: 'Premium access for 6 months',
      price: 199000,
      discountPrice: 175000,
      durationMonths: 6,
    },
    {
      name: 'Premium 1 Year',
      code: 'PREMIUM_1Y',
      description: 'Premium access for 1 year',
      price: 299000,
      discountPrice: 250000,
      durationMonths: 12,
    },
  ];

  const seededPlans: any[] = [];
  for (const plan of plans) {
    const p = await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
    seededPlans.push(p);
  }

  // --- Users ---
  const saltRounds = 10;
  const defaultPassword = 'MyWallets123';
  const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);

  const users = [
    {
      username: 'freeuser',
      email: 'free@example.com',
      passwordHash: hashedPassword,
      fullName: 'Free User',
    },
    {
      username: 'premiumuser',
      email: 'premium@example.com',
      passwordHash: hashedPassword,
      fullName: 'Premium User',
    },
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: userData,
    });

    // Assign subscription
    const planCode =
      userData.username === 'premiumuser' ? 'PREMIUM_1M' : 'FREE';
    const plan = seededPlans.find((p) => p.code === planCode);

    if (plan) {
      const now = new Date();
      let endDate: Date | null = null;
      if (plan.durationMonths) {
        endDate = new Date();
        endDate.setMonth(now.getMonth() + plan.durationMonths);
      }

      // Check if user already has an active subscription
      const existingSub = await prisma.userSubscription.findFirst({
        where: {
          userId: user.id,
          status: SubscriptionStatus.ACTIVE,
        },
      });

      if (!existingSub) {
        await prisma.userSubscription.create({
          data: {
            userId: user.id,
            subscriptionPlanId: plan.id,
            startDate: now,
            endDate: endDate,
            status: SubscriptionStatus.ACTIVE,
          },
        });
      }
    }
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
