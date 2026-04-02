import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * Business-flows E2E tests.
 *
 * Test 1: Registration -> Login -> Create Property -> Create Unit
 * Test 2: Application -> Contract -> Invoice -> Payment (full lifecycle)
 * Test 3: Tenant Portal flow (viewer-scoped /my endpoints)
 * Test 4: Role-based access control (viewer restrictions)
 *
 * These tests use a single NestJS application instance and
 * sequentially walk through the core business lifecycle.
 */
describe('Business Flows (e2e)', () => {
  let app: INestApplication;

  // Tokens & IDs for the admin user (registered in Test 1)
  let adminToken: string;
  let adminTenantId: number;
  let adminUserId: number;

  // Tokens & IDs for the viewer user (created in Test 3/4)
  let viewerToken: string;

  // Entity IDs created during the flow
  let propertyId: number;
  let unitId: number;
  let clientId: number;
  let applicationId: number;
  let contractId: number;
  let invoiceId: number;

  const ts = Date.now();
  const adminEmail = `bflow-admin-${ts}@test.com`;
  const adminPassword = 'AdminPass123!';
  const viewerEmail = `bflow-viewer-${ts}@test.com`;
  const viewerPassword = 'ViewerPass123!';

  // ───────────────────────────────────────────────────────
  //  Bootstrap
  // ───────────────────────────────────────────────────────

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

  const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
  const viewerAuth = () => ({ Authorization: `Bearer ${viewerToken}` });
  const api = () => request(app.getHttpServer());

  // ═══════════════════════════════════════════════════════
  //  TEST 1: Registration -> Login -> Property -> Unit
  // ═══════════════════════════════════════════════════════

  describe('Test 1: Registration -> Login -> Create Property -> Create Unit', () => {
    it('POST /api/auth/register -> 201 (register admin tenant)', async () => {
      const res = await api()
        .post('/api/auth/register')
        .send({
          companyName: `BFlow Corp ${ts}`,
          slug: `bflow-${ts}`,
          email: adminEmail,
          password: adminPassword,
          fullName: 'Admin BFlow',
          acceptTerms: true,
        })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.role).toBe('admin');

      adminToken = res.body.accessToken;
      adminTenantId = res.body.user.tenantId ?? 1;
      adminUserId = res.body.user.id;
    });

    it('POST /api/auth/login -> 201 (login with same credentials)', async () => {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: adminEmail, password: adminPassword })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      // Refresh token to keep the session fresh
      adminToken = res.body.accessToken;
    });

    it('GET /api/auth/me -> 200 (verify profile)', async () => {
      const res = await api()
        .get('/api/auth/me')
        .set(adminAuth())
        .expect(200);

      expect(res.body).toHaveProperty('email', adminEmail);
      expect(res.body).toHaveProperty('id', adminUserId);
    });

    it('POST /api/properties -> 201 (create property)', async () => {
      const res = await api()
        .post('/api/properties')
        .set(adminAuth())
        .send({
          name: `BFlow Office ${ts}`,
          address: 'Moscow, Test Street 1',
          city: 'Moscow',
          type: 'office',
          totalArea: 3000,
          floorsCount: 5,
          yearBuilt: 2021,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(`BFlow Office ${ts}`);
      propertyId = res.body.id;
    });

    it('GET /api/properties/:id -> 200 (verify property)', async () => {
      const res = await api()
        .get(`/api/properties/${propertyId}`)
        .set(adminAuth())
        .expect(200);

      expect(res.body.id).toBe(propertyId);
    });

    it('POST /api/units -> 201 (create unit linked to property)', async () => {
      const res = await api()
        .post('/api/units')
        .set(adminAuth())
        .send({
          propertyId,
          floor: 2,
          areaSqm: 100,
          priceMonth: 75000,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.propertyId).toBe(propertyId);
      unitId = res.body.id;
    });

    it('GET /api/units/:id -> 200 (verify unit)', async () => {
      const res = await api()
        .get(`/api/units/${unitId}`)
        .set(adminAuth())
        .expect(200);

      expect(res.body.id).toBe(unitId);
      expect(res.body.propertyId).toBe(propertyId);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  TEST 2: Application -> Contract -> Invoice -> Payment
  // ═══════════════════════════════════════════════════════

  describe('Test 2: Application -> Contract -> Invoice -> Payment', () => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    it('setup: create client for application', async () => {
      const res = await api()
        .post('/api/clients')
        .set(adminAuth())
        .send({
          companyName: `BFlow Client ${ts}`,
          contactName: 'Ivanov Ivan',
          contactEmail: `bflow-client-${ts}@test.com`,
          contactPhone: '+79001234567',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      clientId = res.body.id;
    });

    it('POST /api/applications -> 201 (create application for unit)', async () => {
      const res = await api()
        .post('/api/applications')
        .set(adminAuth())
        .send({
          unitId,
          clientId,
          desiredStart: nextMonth.toISOString(),
          desiredEnd: nextYear.toISOString(),
          comment: 'E2E business flow test application',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('draft');
      applicationId = res.body.id;
    });

    it('PATCH /api/applications/:id/submit -> 200 (submit application)', async () => {
      const res = await api()
        .patch(`/api/applications/${applicationId}/submit`)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe('submitted');
    });

    it('PATCH /api/applications/:id/review -> 200 (take under review)', async () => {
      const res = await api()
        .patch(`/api/applications/${applicationId}/review`)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe('under_review');
    });

    it('PATCH /api/applications/:id/approve -> 200 (approve application)', async () => {
      const res = await api()
        .patch(`/api/applications/${applicationId}/approve`)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe('approved');
    });

    it('POST /api/contracts/:applicationId/generate -> 201 (generate contract)', async () => {
      const res = await api()
        .post(`/api/contracts/${applicationId}/generate`)
        .set(adminAuth())
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('contractNumber');
      contractId = res.body.id;
    });

    it('PATCH /api/contracts/:id/sign -> 200 (sign contract)', async () => {
      const res = await api()
        .patch(`/api/contracts/${contractId}/sign`)
        .set(adminAuth())
        .expect(200);

      expect(['signed', 'active']).toContain(res.body.status);
    });

    it('GET /api/invoices -> 200 (verify at least 1 invoice exists)', async () => {
      const res = await api()
        .get('/api/invoices')
        .set(adminAuth())
        .expect(200);

      // The response can be an array or a paginated object with `data`
      const invoices = Array.isArray(res.body) ? res.body : res.body.data;
      expect(invoices).toBeDefined();
      expect(invoices.length).toBeGreaterThanOrEqual(1);

      // Pick the first invoice linked to our contract for the payment test
      const linked = invoices.find(
        (inv: any) => inv.contractId === contractId,
      );
      if (linked) {
        invoiceId = linked.id;
      } else {
        // If auto-generation did not happen, create one manually
        const manualRes = await api()
          .post('/api/invoices')
          .set(adminAuth())
          .send({
            contractId,
            amount: 75000,
            dueDate: nextMonth.toISOString(),
            description: 'E2E manual invoice',
          })
          .expect(201);
        invoiceId = manualRes.body.id;
      }
    });

    it('POST /api/invoices/:id/pay -> 200/201 (manual payment)', async () => {
      const res = await api()
        .post(`/api/invoices/${invoiceId}/pay`)
        .set(adminAuth())
        .send({
          paidAmount: 75000,
          paymentReference: `PAY-E2E-${ts}`,
        });

      expect([200, 201]).toContain(res.status);
    });

    it('GET /api/invoices/:id -> 200 (verify invoice status is paid)', async () => {
      const res = await api()
        .get(`/api/invoices/${invoiceId}`)
        .set(adminAuth())
        .expect(200);

      expect(res.body.id).toBe(invoiceId);
      // After payment the status should be 'paid'
      expect(res.body.status).toBe('paid');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  TEST 3: Tenant Portal Flow (viewer / tenant user)
  // ═══════════════════════════════════════════════════════

  describe('Test 3: Tenant Portal Flow', () => {
    it('setup: create viewer user via admin', async () => {
      // Admin creates a viewer-role user inside the same tenant
      const res = await api()
        .post('/api/users')
        .set(adminAuth())
        .send({
          email: viewerEmail,
          password: viewerPassword,
          fullName: 'Viewer BFlow',
          role: 'viewer',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
    });

    it('setup: login as viewer', async () => {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: viewerEmail, password: viewerPassword })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      viewerToken = res.body.accessToken;
    });

    it('GET /api/my/applications -> 200 (tenant applications)', async () => {
      const res = await api()
        .get('/api/my/applications')
        .set(viewerAuth())
        .expect(200);

      // For a fresh viewer user this should be an empty array or paginated result
      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });

    it('GET /api/my/contracts -> 200 (tenant contracts)', async () => {
      const res = await api()
        .get('/api/my/contracts')
        .set(viewerAuth())
        .expect(200);

      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });

    it('GET /api/my/invoices -> 200 (tenant invoices)', async () => {
      const res = await api()
        .get('/api/my/invoices')
        .set(viewerAuth())
        .expect(200);

      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });

    it('GET /api/my/profile -> 200 (tenant profile)', async () => {
      const res = await api()
        .get('/api/my/profile')
        .set(viewerAuth())
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('GET /api/my/documents -> 200 (tenant documents)', async () => {
      const res = await api()
        .get('/api/my/documents')
        .set(viewerAuth())
        .expect(200);

      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });

    it('GET /api/my/maintenance -> 200 (tenant maintenance)', async () => {
      const res = await api()
        .get('/api/my/maintenance')
        .set(viewerAuth())
        .expect(200);

      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════
  //  TEST 4: Role-based Access Control
  // ═══════════════════════════════════════════════════════

  describe('Test 4: Role-based Access Control', () => {
    it('POST /api/properties -> 403 (viewer cannot create properties)', async () => {
      const res = await api()
        .post('/api/properties')
        .set(viewerAuth())
        .send({
          name: 'Should Fail',
          address: 'Nowhere',
          city: 'Nowhere',
          type: 'office',
          totalArea: 100,
          floorsCount: 1,
          yearBuilt: 2020,
        });

      expect(res.status).toBe(403);
    });

    it('POST /api/units -> 403 (viewer cannot create units)', async () => {
      const res = await api()
        .post('/api/units')
        .set(viewerAuth())
        .send({
          propertyId,
          floor: 1,
          areaSqm: 50,
          priceMonth: 30000,
        });

      expect(res.status).toBe(403);
    });

    it('POST /api/applications -> 403 (viewer cannot create applications)', async () => {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);

      const res = await api()
        .post('/api/applications')
        .set(viewerAuth())
        .send({
          unitId,
          clientId,
          desiredStart: nextMonth.toISOString(),
          desiredEnd: nextYear.toISOString(),
        });

      expect(res.status).toBe(403);
    });

    it('POST /api/invoices -> 403 (viewer cannot create invoices)', async () => {
      const due = new Date();
      due.setMonth(due.getMonth() + 1);

      const res = await api()
        .post('/api/invoices')
        .set(viewerAuth())
        .send({
          contractId,
          amount: 10000,
          dueDate: due.toISOString(),
        });

      expect(res.status).toBe(403);
    });

    it('GET /api/contracts -> 200 (viewer can read contracts)', async () => {
      const res = await api()
        .get('/api/contracts')
        .set(viewerAuth())
        .expect(200);

      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });

    it('GET /api/invoices -> 200 (viewer can read invoices)', async () => {
      const res = await api()
        .get('/api/invoices')
        .set(viewerAuth())
        .expect(200);

      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });

    it('GET /api/properties -> 200 (viewer can read properties)', async () => {
      const res = await api()
        .get('/api/properties')
        .set(viewerAuth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/units -> 200 (viewer can read units)', async () => {
      const res = await api()
        .get('/api/units')
        .set(viewerAuth())
        .expect(200);

      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });

    it('GET /api/applications -> 200 (viewer can read applications)', async () => {
      const res = await api()
        .get('/api/applications')
        .set(viewerAuth())
        .expect(200);

      const data = Array.isArray(res.body) ? res.body : res.body.data;
      expect(data).toBeDefined();
    });

    it('PATCH /api/properties/:id -> 403 (viewer cannot update properties)', async () => {
      const res = await api()
        .patch(`/api/properties/${propertyId}`)
        .set(viewerAuth())
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(403);
    });

    it('PATCH /api/applications/:id/approve -> 403 (viewer cannot approve)', async () => {
      const res = await api()
        .patch(`/api/applications/${applicationId}/approve`)
        .set(viewerAuth());

      expect(res.status).toBe(403);
    });

    it('POST /api/contracts/:applicationId/generate -> 403 (viewer cannot generate contracts)', async () => {
      const res = await api()
        .post(`/api/contracts/${applicationId}/generate`)
        .set(viewerAuth());

      expect(res.status).toBe(403);
    });

    it('POST /api/invoices/:id/pay -> 403 (viewer cannot pay invoices)', async () => {
      const res = await api()
        .post(`/api/invoices/${invoiceId}/pay`)
        .set(viewerAuth())
        .send({ paidAmount: 1000 });

      expect(res.status).toBe(403);
    });

    it('401 without token (unauthenticated access)', async () => {
      await api().get('/api/properties').expect(401);
      await api().get('/api/contracts').expect(401);
      await api().get('/api/invoices').expect(401);
      await api().get('/api/applications').expect(401);
    });
  });
});
