import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const superAdmins = [
    {
      email: 'superadmin@gmail.com',
      password: 'admin123@',
      name: 'Super Admin',
      mobile_number: '1234567890'
    },
    {
      email: 'Jaydipdevani@sulit.com',
      password: 'Jaydipdevani@123sulit',
      name: 'Jaydip Devani',
      mobile_number: '1234567890'
    }
  ];

  // Remove Neha Mudaliar from the database (deleteMany so it's a no-op if she's already gone).
  const removed = await prisma.user.deleteMany({
    where: { email: 'nehamudaliar@sulit.com' },
  });
  if (removed.count > 0) {
    console.log('🗑️  Removed user: nehamudaliar@sulit.com');
  }

  for (const admin of superAdmins) {
    const hashedPassword = await bcrypt.hash(admin.password, 10);
    await prisma.user.upsert({
      where: { email: admin.email },
      update: {
        name: admin.name,
        password: hashedPassword,
        role: 'super_admin',
        mobile_number: admin.mobile_number
      },
      create: {
        email: admin.email,
        name: admin.name,
        password: hashedPassword,
        role: 'super_admin',
        mobile_number: admin.mobile_number
      },
    });

    console.log('-----------------------------------');
    console.log(`✅ Super Admin created successfully: ${admin.name}`);
    console.log(`📧 Email: ${admin.email}`);
    console.log(`🔑 Password: ${admin.password}`);
    console.log('-----------------------------------');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });