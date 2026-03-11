import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('API (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Health Check ──────────────────────────────────

  describe('GET /api/health', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
        });
    });
  });

  // ─── Auth ──────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('should register a new tenant', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          companyName: 'E2E Test Company',
          slug: `e2e-test-${Date.now()}`,
          email: `e2e-${Date.now()}@test.com`,
          password: 'Test123456!',
          fullName: 'E2E Admin',
          inn: '1234567890',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          expect(res.body.user).toHaveProperty('role', 'admin');
          accessToken = res.body.accessToken;
        });
    });

    it('should reject duplicate email', async () => {
      const email = `dup-${Date.now()}@test.com`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          companyName: 'Dup Company',
          slug: `dup-${Date.now()}`,
          email,
          password: 'Test123456!',
          fullName: 'Dup Admin',
        })
        .expect(201);

      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          companyName: 'Dup Company 2',
          slug: `dup2-${Date.now()}`,
          email,
          password: 'Test123456!',
          fullName: 'Dup Admin 2',
        })
        .expect(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'wrong' })
        .expect(401);
    });
  });

  // ─── Protected Routes ────────────────────────────────

  describe('Authenticated requests', () => {
    it('should reject requests without token', () => {
      return request(app.getHttpServer())
        .get('/api/users/me')
        .expect(401);
    });

    it('should allow access with valid token', () => {
      return request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('email');
          expect(res.body).toHaveProperty('role');
        });
    });
  });

  // ─── Properties (CRUD) ────────────────────────────────

  describe('Properties API', () => {
    let propertyId: number;

    it('POST /api/properties should create a property', () => {
      return request(app.getHttpServer())
        .post('/api/properties')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'БЦ Тестовый',
          address: 'г. Москва, ул. Тестовая, 1',
          city: 'Москва',
          type: 'office',
          totalArea: 5000,
          floorsCount: 10,
          yearBuilt: 2020,
          description: 'Тестовый бизнес-центр',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('БЦ Тестовый');
          propertyId = res.body.id;
        });
    });

    it('GET /api/properties should list properties', () => {
      return request(app.getHttpServer())
        .get('/api/properties')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('GET /api/properties/:id should return a property', () => {
      return request(app.getHttpServer())
        .get(`/api/properties/${propertyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(propertyId);
        });
    });

    it('PATCH /api/properties/:id should update a property', () => {
      return request(app.getHttpServer())
        .patch(`/api/properties/${propertyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'БЦ Обновлённый' })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('БЦ Обновлённый');
        });
    });
  });

  // ─── Public Catalog ────────────────────────────────

  describe('Public Catalog', () => {
    it('GET /api/catalog/properties should be accessible without auth', () => {
      return request(app.getHttpServer())
        .get('/api/catalog/properties')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });
});
