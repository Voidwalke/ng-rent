import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 10);

  // Создаём две организации
  const tenant1 = await prisma.tenant.create({
    data: {
      name: 'ООО Авангард',
      slug: 'avangard',
      inn: '7701234567',
      plan: 'pro',
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      name: 'ООО СтройИнвест',
      slug: 'stroyinvest',
      inn: '7709876543',
      plan: 'basic',
    },
  });

  // Пользователи
  const admin1 = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'admin@avangard.ru',
      passwordHash: hash,
      role: 'admin',
      fullName: 'Козлов Андрей',
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'manager@avangard.ru',
      passwordHash: hash,
      role: 'manager',
      fullName: 'Новикова Елена',
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant2.id,
      email: 'admin@stroyinvest.ru',
      passwordHash: hash,
      role: 'admin',
      fullName: 'Петров Игорь',
    },
  });

  // Объекты недвижимости
  const prop1 = await prisma.property.create({
    data: {
      tenantId: tenant1.id,
      name: 'БЦ Аврора',
      address: 'г. Москва, ул. Тверская, 15',
      type: 'office',
      totalArea: 8500,
    },
  });

  const prop2 = await prisma.property.create({
    data: {
      tenantId: tenant1.id,
      name: 'ТЦ Галактика',
      address: 'г. Москва, Ленинградский пр-т, 80',
      type: 'retail',
      totalArea: 12000,
    },
  });

  const prop3 = await prisma.property.create({
    data: {
      tenantId: tenant1.id,
      name: 'Склад Северный',
      address: 'г. Москва, Дмитровское ш., 163',
      type: 'warehouse',
      totalArea: 5000,
    },
  });

  // Помещения
  const units = await Promise.all([
    prisma.unit.create({
      data: { tenantId: tenant1.id, propertyId: prop1.id, floor: 3, areaSqm: 120, priceMonth: 180000, description: 'Угловой офис с панорамным видом' },
    }),
    prisma.unit.create({
      data: { tenantId: tenant1.id, propertyId: prop1.id, floor: 5, areaSqm: 85, priceMonth: 127500 },
    }),
    prisma.unit.create({
      data: { tenantId: tenant1.id, propertyId: prop1.id, floor: 2, areaSqm: 200, priceMonth: 280000 },
    }),
    prisma.unit.create({
      data: { tenantId: tenant1.id, propertyId: prop2.id, floor: 1, areaSqm: 65, priceMonth: 195000, description: 'Торговая площадь у входа' },
    }),
    prisma.unit.create({
      data: { tenantId: tenant1.id, propertyId: prop2.id, floor: 2, areaSqm: 150, priceMonth: 375000 },
    }),
    prisma.unit.create({
      data: { tenantId: tenant1.id, propertyId: prop3.id, floor: 1, areaSqm: 500, priceMonth: 250000, description: 'Тёплый склад, высота потолков 6м' },
    }),
  ]);

  // Клиенты
  const client1 = await prisma.client.create({
    data: {
      tenantId: tenant1.id,
      companyName: 'ООО Альфа Технологии',
      inn: '7723456789',
      contactName: 'Сидоров Дмитрий',
      contactEmail: 'sidorov@alfa-tech.ru',
      contactPhone: '+7 999 111 22 33',
    },
  });

  const client2 = await prisma.client.create({
    data: {
      tenantId: tenant1.id,
      companyName: 'ИП Волков М.С.',
      contactName: 'Волков Максим',
      contactEmail: 'volkov@mail.ru',
      contactPhone: '+7 916 444 55 66',
    },
  });

  // Заявки
  await prisma.application.create({
    data: {
      tenantId: tenant1.id,
      unitId: units[0].id,
      clientId: client1.id,
      status: 'active',
      desiredStart: new Date('2026-01-01'),
      desiredEnd: new Date('2026-12-31'),
      reviewedById: admin1.id,
      reviewedAt: new Date('2025-12-20'),
    },
  });

  await prisma.application.create({
    data: {
      tenantId: tenant1.id,
      unitId: units[3].id,
      clientId: client2.id,
      status: 'submitted',
      desiredStart: new Date('2026-04-01'),
      desiredEnd: new Date('2027-03-31'),
      comment: 'Нужна площадь под магазин одежды',
    },
  });

  console.log('Тестовые данные загружены');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
