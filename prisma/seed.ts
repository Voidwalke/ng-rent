import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 10);

  // Суперадмин платформы (без тенанта — создадим системного)
  const systemTenant = await prisma.tenant.create({
    data: {
      name: 'NG RENT Platform',
      slug: 'platform',
      inn: '0000000000',
      plan: 'enterprise',
    },
  });

  await prisma.user.create({
    data: {
      tenantId: systemTenant.id,
      email: 'superadmin@ngrent.ru',
      passwordHash: hash,
      role: 'super_admin',
      fullName: 'Системный администратор',
      emailVerified: true,
    },
  });

  // Организация 1 — полный набор данных
  const tenant1 = await prisma.tenant.create({
    data: {
      name: 'ООО Авангард',
      slug: 'avangard',
      inn: '7701234567',
      kpp: '770101001',
      legalAddress: 'г. Москва, ул. Тверская, 1, оф. 100',
      contactEmail: 'info@avangard.ru',
      contactPhone: '+7 495 111 22 33',
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

  // Пользователи tenant1
  const admin1 = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'admin@avangard.ru',
      passwordHash: hash,
      role: 'admin',
      fullName: 'Козлов Андрей',
      phone: '+7 916 111 11 11',
      emailVerified: true,
      lastLoginAt: new Date(),
    },
  });

  const manager1 = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'manager@avangard.ru',
      passwordHash: hash,
      role: 'manager',
      fullName: 'Новикова Елена',
      phone: '+7 926 222 22 22',
      emailVerified: true,
    },
  });

  const viewer1 = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'viewer@avangard.ru',
      passwordHash: hash,
      role: 'viewer',
      fullName: 'Иванов Пётр',
      emailVerified: true,
    },
  });

  // Пользователи tenant2
  const admin2 = await prisma.user.create({
    data: {
      tenantId: tenant2.id,
      email: 'admin@stroyinvest.ru',
      passwordHash: hash,
      role: 'admin',
      fullName: 'Петров Игорь',
      emailVerified: true,
    },
  });

  // Объекты недвижимости
  const prop1 = await prisma.property.create({
    data: {
      tenantId: tenant1.id,
      name: 'БЦ Аврора',
      address: 'г. Москва, ул. Тверская, 15',
      city: 'Москва',
      type: 'office',
      totalArea: 8500,
      floorsCount: 12,
      yearBuilt: 2018,
      isPublished: true,
    },
  });

  const prop2 = await prisma.property.create({
    data: {
      tenantId: tenant1.id,
      name: 'ТЦ Галактика',
      address: 'г. Москва, Ленинградский пр-т, 80',
      city: 'Москва',
      type: 'retail',
      totalArea: 12000,
      floorsCount: 4,
      yearBuilt: 2015,
      isPublished: true,
    },
  });

  const prop3 = await prisma.property.create({
    data: {
      tenantId: tenant1.id,
      name: 'Склад Северный',
      address: 'г. Москва, Дмитровское ш., 163',
      city: 'Москва',
      type: 'warehouse',
      totalArea: 5000,
      floorsCount: 1,
      yearBuilt: 2020,
      isPublished: false,
    },
  });

  // Помещения — разные статусы
  const unit1 = await prisma.unit.create({
    data: {
      tenantId: tenant1.id, propertyId: prop1.id,
      unitNumber: 'A-301', floor: 3, areaSqm: 120, priceMonth: 180000,
      status: 'rented',
      description: 'Угловой офис с панорамным видом',
    },
  });

  const unit2 = await prisma.unit.create({
    data: {
      tenantId: tenant1.id, propertyId: prop1.id,
      unitNumber: 'A-502', floor: 5, areaSqm: 85, priceMonth: 127500,
      status: 'available',
    },
  });

  const unit3 = await prisma.unit.create({
    data: {
      tenantId: tenant1.id, propertyId: prop1.id,
      unitNumber: 'A-201', floor: 2, areaSqm: 200, priceMonth: 280000,
      status: 'reserved',
    },
  });

  const unit4 = await prisma.unit.create({
    data: {
      tenantId: tenant1.id, propertyId: prop2.id,
      unitNumber: 'Г-101', floor: 1, areaSqm: 65, priceMonth: 195000,
      status: 'available',
      description: 'Торговая площадь у главного входа',
    },
  });

  const unit5 = await prisma.unit.create({
    data: {
      tenantId: tenant1.id, propertyId: prop2.id,
      unitNumber: 'Г-201', floor: 2, areaSqm: 150, priceMonth: 375000,
      status: 'maintenance',
    },
  });

  const unit6 = await prisma.unit.create({
    data: {
      tenantId: tenant1.id, propertyId: prop3.id,
      unitNumber: 'С-1', floor: 1, areaSqm: 500, priceMonth: 250000,
      status: 'rented',
      description: 'Тёплый склад, потолки 6м',
    },
  });

  // Клиенты
  const client1 = await prisma.client.create({
    data: {
      tenantId: tenant1.id,
      companyName: 'ООО Альфа Технологии',
      inn: '7723456789',
      kpp: '772301001',
      legalAddress: 'г. Москва, ул. Садовая, 5',
      contactName: 'Сидоров Дмитрий',
      contactEmail: 'sidorov@alfa-tech.ru',
      contactPhone: '+7 999 111 22 33',
      bankAccount: '40702810100000012345',
      bik: '044525225',
    },
  });

  const client2 = await prisma.client.create({
    data: {
      tenantId: tenant1.id,
      companyName: 'ИП Волков М.С.',
      inn: '772300112233',
      contactName: 'Волков Максим',
      contactEmail: 'volkov@mail.ru',
      contactPhone: '+7 916 444 55 66',
    },
  });

  // Заявка active → есть договор
  const app1 = await prisma.application.create({
    data: {
      tenantId: tenant1.id,
      unitId: unit1.id,
      clientId: client1.id,
      status: 'active',
      desiredStart: new Date('2026-01-01'),
      desiredEnd: new Date('2026-12-31'),
      desiredPrice: 175000,
      reviewedById: admin1.id,
      reviewedAt: new Date('2025-12-20'),
    },
  });

  // Заявка submitted — в ожидании
  await prisma.application.create({
    data: {
      tenantId: tenant1.id,
      unitId: unit4.id,
      clientId: client2.id,
      status: 'submitted',
      desiredStart: new Date('2026-04-01'),
      desiredEnd: new Date('2027-03-31'),
      desiredPrice: 190000,
      comment: 'Нужна площадь под магазин одежды',
    },
  });

  // Заявка rejected
  await prisma.application.create({
    data: {
      tenantId: tenant1.id,
      unitId: unit2.id,
      clientId: client2.id,
      status: 'rejected',
      desiredStart: new Date('2026-02-01'),
      desiredEnd: new Date('2026-06-30'),
      rejectionReason: 'Не подошли условия',
      reviewedById: manager1.id,
      reviewedAt: new Date('2026-01-15'),
    },
  });

  // Активный договор
  const contract1 = await prisma.contract.create({
    data: {
      tenantId: tenant1.id,
      clientId: client1.id,
      unitId: unit1.id,
      applicationId: app1.id,
      contractNumber: 'D-202601-0001',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      monthlyRent: 180000,
      depositAmount: 360000,
      paymentDay: 5,
      status: 'active',
      signedAt: new Date('2025-12-25'),
    },
  });

  // Счёт оплаченный
  await prisma.invoice.create({
    data: {
      tenantId: tenant1.id,
      contractId: contract1.id,
      invoiceNumber: 'avangard-202601-0001',
      amount: 180000,
      vatAmount: 36000,
      totalAmount: 216000,
      paidAmount: 216000,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      dueDate: new Date('2026-01-05'),
      status: 'paid',
      paidAt: new Date('2026-01-04'),
    },
  });

  // Счёт оплаченный
  await prisma.invoice.create({
    data: {
      tenantId: tenant1.id,
      contractId: contract1.id,
      invoiceNumber: 'avangard-202602-0001',
      amount: 180000,
      vatAmount: 36000,
      totalAmount: 216000,
      paidAmount: 216000,
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-28'),
      dueDate: new Date('2026-02-05'),
      status: 'paid',
      paidAt: new Date('2026-02-03'),
    },
  });

  // Счёт pending (текущий месяц)
  await prisma.invoice.create({
    data: {
      tenantId: tenant1.id,
      contractId: contract1.id,
      invoiceNumber: 'avangard-202603-0001',
      amount: 180000,
      vatAmount: 36000,
      totalAmount: 216000,
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-31'),
      dueDate: new Date('2026-03-05'),
      status: 'pending',
    },
  });

  // Карта доступа СКУД
  await prisma.accessCard.create({
    data: {
      tenantId: tenant1.id,
      contractId: contract1.id,
      clientId: client1.id,
      cardNumber: 'AC-00001',
      holderName: 'Сидоров Дмитрий',
      zones: ['вход', 'этаж-3', 'парковка'],
      isActive: true,
      activatedAt: new Date('2026-01-01'),
      expiresAt: new Date('2026-12-31'),
    },
  });

  // Уведомления
  await prisma.notification.create({
    data: {
      tenantId: tenant1.id,
      userId: admin1.id,
      title: 'Новая заявка на аренду',
      message: 'Поступила заявка от ИП Волков М.С. на помещение Г-101',
      type: 'application',
    },
  });

  await prisma.notification.create({
    data: {
      tenantId: tenant1.id,
      userId: admin1.id,
      title: 'Счёт ожидает оплаты',
      message: 'Счёт avangard-202603-0001 на сумму 216 000 ₽ ожидает оплаты до 05.03.2026',
      type: 'invoice',
      readAt: new Date(),
    },
  });

  // Записи аудита
  await prisma.auditLog.create({
    data: {
      tenantId: tenant1.id,
      userId: admin1.id,
      action: 'contract.sign',
      entityType: 'contract',
      entityId: contract1.id,
      newData: { status: { from: 'sent', to: 'signed' } },
      ipAddress: '192.168.1.10',
      userAgent: 'Mozilla/5.0',
    },
  });

  // Подписка tenant1
  await prisma.subscription.create({
    data: {
      tenantId: tenant1.id,
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date('2026-01-01'),
      currentPeriodEnd: new Date('2026-04-01'),
      priceMonthly: 15000,
    },
  });

  // Подписка tenant2 — trial
  await prisma.subscription.create({
    data: {
      tenantId: tenant2.id,
      plan: 'basic',
      status: 'trialing',
      trialEndsAt: new Date('2026-03-15'),
      currentPeriodStart: new Date('2026-02-15'),
      currentPeriodEnd: new Date('2026-03-15'),
      priceMonthly: 5000,
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
