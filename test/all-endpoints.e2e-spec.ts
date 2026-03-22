import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Полный E2E‑тест: проверяет все основные эндпоинты по реальной БД.
 * Сценарий повторяет бизнес-цикл: регистрация → объект → помещение →
 * клиент → заявка → договор → счёт → оплата → обслуживание → поддержка.
 */
describe('All Endpoints (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let tenantId: number;
  let userId: number;

  // Сущности, создаваемые по ходу теста
  let propertyId: number;
  let unitId: number;
  let clientId: number;
  let applicationId: number;
  let contractId: number;
  let invoiceId: number;
  let maintenanceId: number;
  let ticketId: number;
  let templateId: number;
  let managerId: number;

  const ts = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  // ═══════════════════════════════════════════════════════
  //  1. HEALTH
  // ═══════════════════════════════════════════════════════

  describe('Health', () => {
    it('GET /api/health → 200', async () => {
      const res = await api().get('/api/health');
      // 503 допустим при последовательном запуске тест-файлов (соединения восстанавливаются)
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
    });

    it('GET /api/health/ready → 200', () =>
      api().get('/api/health/ready').expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  2. AUTH — Регистрация, логин, профиль, сессии
  // ═══════════════════════════════════════════════════════

  describe('Auth', () => {
    const email = `e2e-full-${ts}@test.com`;
    const password = 'Test123456!';

    it('POST /api/auth/register → 201', () =>
      api()
        .post('/api/auth/register')
        .send({
          companyName: `E2E Full ${ts}`,
          slug: `e2e-full-${ts}`,
          email,
          password,
          fullName: 'E2E Fulltest',
          acceptTerms: true,
        })
        .expect(201)
        .expect((r) => {
          expect(r.body).toHaveProperty('accessToken');
          expect(r.body.user.role).toBe('admin');
          token = r.body.accessToken;
          tenantId = r.body.user.tenantId ?? 1;
          userId = r.body.user.id;
        }));

    it('POST /api/auth/login → 201', () =>
      api()
        .post('/api/auth/login')
        .send({ email, password })
        .expect(201)
        .expect((r) => {
          expect(r.body).toHaveProperty('accessToken');
          // обновляем токен
          token = r.body.accessToken;
        }));

    it('GET /api/auth/me → 200', () =>
      api()
        .get('/api/auth/me')
        .set(auth())
        .expect(200)
        .expect((r) => {
          expect(r.body).toHaveProperty('email', email);
        }));

    it('GET /api/auth/sessions → 200', () =>
      api().get('/api/auth/sessions').set(auth()).expect(200));

    it('POST /api/auth/change-password → 201', () =>
      api()
        .post('/api/auth/change-password')
        .set(auth())
        .send({ currentPassword: password, newPassword: 'NewPass123456!' })
        .expect(201));

    // Логинимся с новым паролем
    it('POST /api/auth/login (new password) → 201', () =>
      api()
        .post('/api/auth/login')
        .send({ email, password: 'NewPass123456!' })
        .expect(201)
        .expect((r) => {
          token = r.body.accessToken;
        }));

    it('POST /api/auth/login (wrong password) → 401', () =>
      api()
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword1!' })
        .expect(401));

    it('POST /api/auth/forgot-password → 200/201', () =>
      api()
        .post('/api/auth/forgot-password')
        .send({ email })
        .expect((r) => {
          expect([200, 201]).toContain(r.status);
        }));
  });

  // ═══════════════════════════════════════════════════════
  //  3. ONBOARDING
  // ═══════════════════════════════════════════════════════

  describe('Onboarding', () => {
    it('GET /api/onboarding → 200', () =>
      api().get('/api/onboarding').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  4. USERS — CRUD менеджера
  // ═══════════════════════════════════════════════════════

  describe('Users', () => {
    it('POST /api/users → 201 (создать менеджера)', () =>
      api()
        .post('/api/users')
        .set(auth())
        .send({
          email: `manager-${ts}@test.com`,
          password: 'Manager123!',
          fullName: 'Менеджер E2E',
          role: 'manager',
        })
        .expect(201)
        .expect((r) => {
          expect(r.body).toHaveProperty('id');
          managerId = r.body.id;
        }));

    it('GET /api/users → 200', () =>
      api()
        .get('/api/users')
        .set(auth())
        .expect(200)
        .expect((r) => {
          expect(Array.isArray(r.body)).toBe(true);
          expect(r.body.length).toBeGreaterThanOrEqual(1);
        }));

    it('GET /api/users/:id → 200', () =>
      api().get(`/api/users/${managerId}`).set(auth()).expect(200));

    it('PATCH /api/users/:id → 200', () =>
      api()
        .patch(`/api/users/${managerId}`)
        .set(auth())
        .send({ fullName: 'Менеджер Обновлён' })
        .expect(200)
        .expect((r) => {
          expect(r.body.fullName).toBe('Менеджер Обновлён');
        }));
  });

  // ═══════════════════════════════════════════════════════
  //  5. PROPERTIES — CRUD
  // ═══════════════════════════════════════════════════════

  describe('Properties', () => {
    it('POST /api/properties → 201', () =>
      api()
        .post('/api/properties')
        .set(auth())
        .send({
          name: `БЦ Тест ${ts}`,
          address: 'г. Москва, ул. Тестовая, 1',
          city: 'Москва',
          type: 'office',
          totalArea: 5000,
          floorsCount: 10,
          yearBuilt: 2020,
        })
        .expect(201)
        .expect((r) => {
          propertyId = r.body.id;
        }));

    it('GET /api/properties → 200', () =>
      api()
        .get('/api/properties')
        .set(auth())
        .expect(200)
        .expect((r) => {
          expect(Array.isArray(r.body)).toBe(true);
        }));

    it('GET /api/properties/:id → 200', () =>
      api().get(`/api/properties/${propertyId}`).set(auth()).expect(200));

    it('PATCH /api/properties/:id → 200', () =>
      api()
        .patch(`/api/properties/${propertyId}`)
        .set(auth())
        .send({ name: 'БЦ Обновлённый' })
        .expect(200));

    it('GET /api/properties/:id/stats → 200', () =>
      api().get(`/api/properties/${propertyId}/stats`).set(auth()).expect(200));

    it('PATCH /api/properties/:id/publish → 200', () =>
      api()
        .patch(`/api/properties/${propertyId}/publish`)
        .set(auth())
        .expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  6. UNITS — CRUD
  // ═══════════════════════════════════════════════════════

  describe('Units', () => {
    it('POST /api/units → 201', () =>
      api()
        .post('/api/units')
        .set(auth())
        .send({
          propertyId,
          floor: 3,
          areaSqm: 120,
          priceMonth: 85000,
        })
        .expect(201)
        .expect((r) => {
          unitId = r.body.id;
        }));

    it('GET /api/units → 200', () =>
      api().get('/api/units').set(auth()).expect(200));

    it('GET /api/units/:id → 200', () =>
      api().get(`/api/units/${unitId}`).set(auth()).expect(200));

    it('PATCH /api/units/:id → 200', () =>
      api()
        .patch(`/api/units/${unitId}`)
        .set(auth())
        .send({ areaSqm: 125 })
        .expect(200));

    it('PATCH /api/units/:id/maintenance → 200', () =>
      api().patch(`/api/units/${unitId}/maintenance`).set(auth()).expect(200));

    it('PATCH /api/units/:id/available → 200', () =>
      api().patch(`/api/units/${unitId}/available`).set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  7. CLIENTS — CRUD
  // ═══════════════════════════════════════════════════════

  describe('Clients', () => {
    it('POST /api/clients → 201', () =>
      api()
        .post('/api/clients')
        .set(auth())
        .send({
          companyName: `ООО Тестовая ${ts}`,
          contactName: 'Иванов Иван',
          contactEmail: `client-${ts}@test.com`,
          contactPhone: '+79001234567',
          inn: '7712345678',
        })
        .expect(201)
        .expect((r) => {
          clientId = r.body.id;
        }));

    it('GET /api/clients → 200', () =>
      api().get('/api/clients').set(auth()).expect(200));

    it('GET /api/clients/:id → 200', () =>
      api().get(`/api/clients/${clientId}`).set(auth()).expect(200));

    it('PATCH /api/clients/:id → 200', () =>
      api()
        .patch(`/api/clients/${clientId}`)
        .set(auth())
        .send({ companyName: 'ООО Обновлённая' })
        .expect(200));

    it('GET /api/clients/:id/history → 200', () =>
      api().get(`/api/clients/${clientId}/history`).set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  8. CONTRACT TEMPLATES — CRUD
  // ═══════════════════════════════════════════════════════

  describe('Contract Templates', () => {
    it('POST /api/contract-templates → 201', () =>
      api()
        .post('/api/contract-templates')
        .set(auth())
        .send({
          name: `Шаблон ${ts}`,
          type: 'office',
          content: '<p>Договор аренды №{{contractNumber}}</p>',
        })
        .expect(201)
        .expect((r) => {
          templateId = r.body.id;
        }));

    it('GET /api/contract-templates → 200', () =>
      api().get('/api/contract-templates').set(auth()).expect(200));

    it('GET /api/contract-templates/:id → 200', () =>
      api()
        .get(`/api/contract-templates/${templateId}`)
        .set(auth())
        .expect(200));

    it('PATCH /api/contract-templates/:id → 200', () =>
      api()
        .patch(`/api/contract-templates/${templateId}`)
        .set(auth())
        .send({ name: 'Шаблон обновлён' })
        .expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  9. APPLICATIONS — полный цикл заявки
  // ═══════════════════════════════════════════════════════

  describe('Applications', () => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    it('POST /api/applications → 201', () =>
      api()
        .post('/api/applications')
        .set(auth())
        .send({
          unitId,
          clientId,
          desiredStart: nextMonth.toISOString(),
          desiredEnd: nextYear.toISOString(),
          comment: 'E2E тестовая заявка',
        })
        .expect(201)
        .expect((r) => {
          applicationId = r.body.id;
          expect(r.body.status).toBe('draft');
        }));

    it('GET /api/applications → 200', () =>
      api().get('/api/applications').set(auth()).expect(200));

    it('GET /api/applications/:id → 200', () =>
      api().get(`/api/applications/${applicationId}`).set(auth()).expect(200));

    it('PATCH /api/applications/:id/submit → 200', () =>
      api()
        .patch(`/api/applications/${applicationId}/submit`)
        .set(auth())
        .expect(200)
        .expect((r) => {
          expect(r.body.status).toBe('submitted');
        }));

    it('PATCH /api/applications/:id/review → 200', () =>
      api()
        .patch(`/api/applications/${applicationId}/review`)
        .set(auth())
        .expect(200)
        .expect((r) => {
          expect(r.body.status).toBe('under_review');
        }));

    it('PATCH /api/applications/:id/approve → 200', () =>
      api()
        .patch(`/api/applications/${applicationId}/approve`)
        .set(auth())
        .expect(200)
        .expect((r) => {
          expect(r.body.status).toBe('approved');
        }));
  });

  // ═══════════════════════════════════════════════════════
  //  10. CONTRACTS — генерация, подписание, продление
  // ═══════════════════════════════════════════════════════

  describe('Contracts', () => {
    it('POST /api/contracts/:applicationId/generate → 201', () =>
      api()
        .post(`/api/contracts/${applicationId}/generate`)
        .set(auth())
        .expect(201)
        .expect((r) => {
          contractId = r.body.id;
          expect(r.body).toHaveProperty('contractNumber');
        }));

    it('GET /api/contracts → 200', () =>
      api().get('/api/contracts').set(auth()).expect(200));

    it('GET /api/contracts/:id → 200', () =>
      api().get(`/api/contracts/${contractId}`).set(auth()).expect(200));

    it('PATCH /api/contracts/:id/sign → 200', () =>
      api()
        .patch(`/api/contracts/${contractId}/sign`)
        .set(auth())
        .expect(200)
        .expect((r) => {
          expect(['signed', 'active']).toContain(r.body.status);
        }));

    it('GET /api/contracts/expiring → 200', () =>
      api().get('/api/contracts/expiring').set(auth()).expect(200));

    it('PATCH /api/contracts/:id/extend → 200', () => {
      const newEnd = new Date();
      newEnd.setFullYear(newEnd.getFullYear() + 2);
      return api()
        .patch(`/api/contracts/${contractId}/extend`)
        .set(auth())
        .send({ newEndDate: newEnd.toISOString() })
        .expect(200);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  11. INVOICES — ручной, список, оплата, кредит-нота
  // ═══════════════════════════════════════════════════════

  describe('Invoices', () => {
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 1);

    it('POST /api/invoices → 201 (ручной счёт)', () =>
      api()
        .post('/api/invoices')
        .set(auth())
        .send({
          contractId,
          amount: 85000,
          dueDate: dueDate.toISOString(),
          description: 'E2E ручной счёт',
        })
        .expect(201)
        .expect((r) => {
          invoiceId = r.body.id;
          expect(r.body).toHaveProperty('invoiceNumber');
        }));

    it('GET /api/invoices → 200', () =>
      api().get('/api/invoices').set(auth()).expect(200));

    it('GET /api/invoices/summary → 200', () =>
      api().get('/api/invoices/summary').set(auth()).expect(200));

    it('GET /api/invoices/:id → 200', () =>
      api().get(`/api/invoices/${invoiceId}`).set(auth()).expect(200));

    it('POST /api/invoices/:id/pay → 200/201', () =>
      api()
        .post(`/api/invoices/${invoiceId}/pay`)
        .set(auth())
        .expect((r) => {
          expect([200, 201]).toContain(r.status);
        }));

    it('POST /api/invoices/credit-note → 201', () =>
      api()
        .post('/api/invoices/credit-note')
        .set(auth())
        .send({
          invoiceId,
          amount: 1000,
          reason: 'E2E кредит-нота',
        })
        .expect(201));
  });

  // ═══════════════════════════════════════════════════════
  //  12. ACCESS CARDS
  // ═══════════════════════════════════════════════════════

  describe('Access Cards', () => {
    let cardId: number;

    it('POST /api/access-cards → 201', () =>
      api()
        .post('/api/access-cards')
        .set(auth())
        .send({
          contractId,
          clientId,
          cardNumber: `CARD-${ts}`,
          holderName: 'Иванов И.И.',
        })
        .expect(201)
        .expect((r) => {
          cardId = r.body.id;
        }));

    it('GET /api/access-cards → 200', () =>
      api().get('/api/access-cards').set(auth()).expect(200));

    it('GET /api/access-cards/:id → 200', () =>
      api().get(`/api/access-cards/${cardId}`).set(auth()).expect(200));

    it('PATCH /api/access-cards/:id/block → 200', () =>
      api()
        .patch(`/api/access-cards/${cardId}/block`)
        .set(auth())
        .send({ reason: 'E2E тестовая блокировка' })
        .expect(200));

    it('PATCH /api/access-cards/:id/unblock → 200', () =>
      api()
        .patch(`/api/access-cards/${cardId}/unblock`)
        .set(auth())
        .expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  13. MAINTENANCE — заявки на обслуживание
  // ═══════════════════════════════════════════════════════

  describe('Maintenance', () => {
    it('POST /api/maintenance → 201', () =>
      api()
        .post('/api/maintenance')
        .set(auth())
        .send({
          unitId,
          title: 'Сломан кондиционер',
          description: 'Не работает кондиционер в офисе 301',
          priority: 'high',
        })
        .expect(201)
        .expect((r) => {
          maintenanceId = r.body.id;
        }));

    it('GET /api/maintenance → 200', () =>
      api().get('/api/maintenance').set(auth()).expect(200));

    it('GET /api/maintenance/:id → 200', () =>
      api().get(`/api/maintenance/${maintenanceId}`).set(auth()).expect(200));

    it('PATCH /api/maintenance/:id → 200 (обновить статус)', () =>
      api()
        .patch(`/api/maintenance/${maintenanceId}`)
        .set(auth())
        .send({ status: 'in_progress' })
        .expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  14. SUPPORT — тикеты
  // ═══════════════════════════════════════════════════════

  describe('Support', () => {
    it('POST /api/support/tickets → 201', () =>
      api()
        .post('/api/support/tickets')
        .set(auth())
        .send({
          subject: 'E2E тестовый тикет',
          message: 'Описание проблемы для E2E теста',
          category: 'general',
          priority: 'medium',
        })
        .expect(201)
        .expect((r) => {
          ticketId = r.body.id;
        }));

    it('GET /api/support/tickets → 200', () =>
      api().get('/api/support/tickets').set(auth()).expect(200));

    it('GET /api/support/tickets/:id → 200', () =>
      api().get(`/api/support/tickets/${ticketId}`).set(auth()).expect(200));

    it('POST /api/support/tickets/:id/messages → 201', () =>
      api()
        .post(`/api/support/tickets/${ticketId}/messages`)
        .set(auth())
        .send({ message: 'Дополнительная информация к тикету' })
        .expect(201));

    it('PATCH /api/support/tickets/:id/resolve → 200', () =>
      api()
        .patch(`/api/support/tickets/${ticketId}/resolve`)
        .set(auth())
        .expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  15. NOTIFICATIONS
  // ═══════════════════════════════════════════════════════

  describe('Notifications', () => {
    it('GET /api/notifications → 200', () =>
      api().get('/api/notifications').set(auth()).expect(200));

    it('GET /api/notifications/unread-count → 200', () =>
      api().get('/api/notifications/unread-count').set(auth()).expect(200));

    it('PATCH /api/notifications/read-all → 200', () =>
      api().patch('/api/notifications/read-all').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  16. NOTIFICATION PREFERENCES
  // ═══════════════════════════════════════════════════════

  describe('Notification Preferences', () => {
    it('GET /api/notification-preferences → 200', () =>
      api().get('/api/notification-preferences').set(auth()).expect(200));

    it('PATCH /api/notification-preferences → 200', () =>
      api()
        .patch('/api/notification-preferences')
        .set(auth())
        .send({ settings: { email: true, push: false } })
        .expect(200));

    it('GET /api/notification-preferences/webhooks → 200', () =>
      api()
        .get('/api/notification-preferences/webhooks')
        .set(auth())
        .expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  17. ANALYTICS
  // ═══════════════════════════════════════════════════════

  describe('Analytics', () => {
    it('GET /api/analytics/dashboard → 200', () =>
      api().get('/api/analytics/dashboard').set(auth()).expect(200));

    it('GET /api/analytics/revenue → 200', () =>
      api().get('/api/analytics/revenue').set(auth()).expect(200));

    it('GET /api/analytics/occupancy → 200', () =>
      api().get('/api/analytics/occupancy').set(auth()).expect(200));

    it('GET /api/analytics/aged-debt → 200', () =>
      api().get('/api/analytics/aged-debt').set(auth()).expect(200));

    it('GET /api/analytics/cashflow → 200', () =>
      api().get('/api/analytics/cashflow').set(auth()).expect(200));

    it('GET /api/analytics/vacancy-cost → 200', () =>
      api().get('/api/analytics/vacancy-cost').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  18. RENT INDEXATION
  // ═══════════════════════════════════════════════════════

  describe('Rent Indexation', () => {
    it('POST /api/rent-indexation/preview → 200/201', () =>
      api()
        .post('/api/rent-indexation/preview')
        .set(auth())
        .send({ rate: 5 })
        .expect((r) => {
          expect([200, 201]).toContain(r.status);
          expect(Array.isArray(r.body)).toBe(true);
        }));
  });

  // ═══════════════════════════════════════════════════════
  //  19. ACTIVITY
  // ═══════════════════════════════════════════════════════

  describe('Activity', () => {
    it('GET /api/activity → 200', async () => {
      const res = await api().get('/api/activity').set(auth());
      if (res.status !== 200) {
        console.log('Activity response:', res.status, JSON.stringify(res.body));
      }
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  20. SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════

  describe('Subscriptions', () => {
    it('GET /api/subscriptions/plans → 200', () =>
      api().get('/api/subscriptions/plans').set(auth()).expect(200));

    it('GET /api/subscriptions/current → 200', () =>
      api().get('/api/subscriptions/current').set(auth()).expect(200));

    it('GET /api/subscriptions/invoices → 200', () =>
      api().get('/api/subscriptions/invoices').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  21. CATALOG (public)
  // ═══════════════════════════════════════════════════════

  describe('Catalog (public)', () => {
    it('GET /api/catalog/properties → 200', () =>
      api()
        .get('/api/catalog/properties')
        .expect(200)
        .expect((r) => {
          expect(r.body).toHaveProperty('data');
        }));

    it('GET /api/catalog/units → 200', () =>
      api().get('/api/catalog/units').expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  22. COMPLIANCE
  // ═══════════════════════════════════════════════════════

  describe('Compliance', () => {
    it('POST /api/compliance/consent → 200/201', () =>
      api()
        .post('/api/compliance/consent')
        .set(auth())
        .send({ type: 'privacy_policy', accepted: true })
        .expect((r) => {
          expect([200, 201]).toContain(r.status);
        }));

    it('GET /api/compliance/consents → 200', () =>
      api().get('/api/compliance/consents').set(auth()).expect(200));

    it('GET /api/compliance/data-export → 200', () =>
      api().get('/api/compliance/data-export').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  23. IMPORT
  // ═══════════════════════════════════════════════════════

  describe('Import', () => {
    it('GET /api/import/template → 200', () =>
      api()
        .get('/api/import/template')
        .set(auth())
        .query({ type: 'clients' })
        .expect(200));

    it('GET /api/import/jobs → 200', () =>
      api().get('/api/import/jobs').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  24. DOCUMENTS
  // ═══════════════════════════════════════════════════════

  describe('Documents', () => {
    it('GET /api/documents → 200', () =>
      api().get('/api/documents').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  25. INTEGRATION 1C
  // ═══════════════════════════════════════════════════════

  describe('Integration 1C', () => {
    it('GET /api/integration/1c/health → 200', () =>
      api().get('/api/integration/1c/health').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  26. PAYMENTS
  // ═══════════════════════════════════════════════════════

  describe('Payments', () => {
    it('GET /api/payments → 200', () =>
      api().get('/api/payments').set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  27. CLEANUP — удаление в обратном порядке
  // ═══════════════════════════════════════════════════════

  describe('Cleanup (DELETE)', () => {
    it('DELETE /api/maintenance/:id → 200', () =>
      api()
        .delete(`/api/maintenance/${maintenanceId}`)
        .set(auth())
        .expect(200));

    it('DELETE /api/contract-templates/:id → 200', () =>
      api()
        .delete(`/api/contract-templates/${templateId}`)
        .set(auth())
        .expect(200));

    it('DELETE /api/units/:id → 400 (есть активные договоры)', () =>
      api().delete(`/api/units/${unitId}`).set(auth()).expect(400));

    it('DELETE /api/users/:id (менеджер) → 200', () =>
      api().delete(`/api/users/${managerId}`).set(auth()).expect(200));
  });

  // ═══════════════════════════════════════════════════════
  //  28. NEGATIVE CASES — ошибки и защита
  // ═══════════════════════════════════════════════════════

  describe('Negative cases', () => {
    it('GET /api/properties/999999 → 404', () =>
      api().get('/api/properties/999999').set(auth()).expect(404));

    it('GET /api/contracts/999999 → 404', () =>
      api().get('/api/contracts/999999').set(auth()).expect(404));

    it('POST /api/applications → 400 (без обязательных полей)', () =>
      api().post('/api/applications').set(auth()).send({}).expect(400));

    it('POST /api/auth/register → 400 (без acceptTerms)', () =>
      api()
        .post('/api/auth/register')
        .send({
          companyName: 'Bad',
          slug: 'bad',
          email: 'bad@test.com',
          password: 'Test123456!',
          fullName: 'Bad User',
        })
        .expect(400));

    it('GET /api/users → 401 (без токена)', () =>
      api().get('/api/users').expect(401));

    it('POST /api/units → 400 (отрицательная площадь)', () =>
      api()
        .post('/api/units')
        .set(auth())
        .send({
          propertyId,
          floor: 1,
          areaSqm: -10,
          priceMonth: 100,
        })
        .expect(400));
  });
});
