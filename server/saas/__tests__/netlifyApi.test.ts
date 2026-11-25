import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApiApp } from '../../apiApp';
import { handler } from '../../../netlify/functions/api';
import {
  parseServiceAccountFromEnv,
  toFirebaseAdminServiceError,
} from '../providers/firebaseProvider';
import { createSaaSMiddleware } from '../middleware';
import { createSaasRouter } from '../router';
import { InMemoryDatabaseProvider } from '../providers/inMemoryProvider';
import { SaaSServiceError } from '../types';
import { isSaaSBackendUnavailableError } from '../../../src/services/saasApi';

describe('Netlify Functions & Shared API App', () => {
  it('serves /api/saas/health with safe diagnostics via createApiApp', async () => {
    const app = createApiApp();
    const res = await request(app).get('/api/saas/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dbProvider).toBeDefined();
    expect(typeof res.body.adminSdkReady).toBe('boolean');
    expect(res.body.diagnostics).toBeDefined();
    expect(typeof res.body.diagnostics.hasServiceAccountJson).toBe('boolean');
    expect(typeof res.body.diagnostics.hasSplitCredentials).toBe('boolean');
    expect(typeof res.body.diagnostics.hasProjectId).toBe('boolean');
    expect(res.body.diagnostics.hasProjectId).toBe(true);
  });

  it('rewrites /.netlify/functions/api/saas/health to /api/saas/health', async () => {
    const app = createApiApp();
    const res = await request(app).get('/.netlify/functions/api/saas/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dbProvider).toBeDefined();
  });

  it('invokes Netlify Function handler directly for /api/saas/health', async () => {
    const result = (await handler(
      {
        httpMethod: 'GET',
        path: '/.netlify/functions/api/saas/health',
        rawUrl: 'https://shafiq900.netlify.app/.netlify/functions/api/saas/health',
        headers: { host: 'shafiq900.netlify.app' },
        multiValueHeaders: {},
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        body: null,
        isBase64Encoded: false,
      } as any,
      {} as any
    )) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.dbProvider).toBeDefined();
  });

  it('serves /api/ai/status cleanly via Netlify Function handler', async () => {
    const result = (await handler(
      {
        httpMethod: 'GET',
        path: '/.netlify/functions/api/ai/status',
        rawUrl: 'https://shafiq900.netlify.app/.netlify/functions/api/ai/status',
        headers: { host: 'shafiq900.netlify.app' },
        multiValueHeaders: {},
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        body: null,
        isBase64Encoded: false,
      } as any,
      {} as any
    )) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('ok');
  });

  it('parses quoted, base64, double-encoded, and multi-line service account JSON safely', () => {
    const sample = {
      type: 'service_account',
      project_id: 'smart-school-cc66c',
      client_email: 'firebase-adminsdk@smart-school-cc66c.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nLINE1\nLINE2\n-----END PRIVATE KEY-----\n',
    };

    // 1. Wrapped in single quotes
    const quoted = `'${JSON.stringify(sample)}'`;
    expect(parseServiceAccountFromEnv(quoted)?.client_email).toBe(sample.client_email);

    // 2. Base64 encoded
    const b64 = Buffer.from(JSON.stringify(sample), 'utf-8').toString('base64');
    expect(parseServiceAccountFromEnv(b64)?.private_key).toContain('\nLINE1\n');

    // 3. Double-JSON-encoded
    const doubleEncoded = JSON.stringify(JSON.stringify(sample));
    expect(parseServiceAccountFromEnv(doubleEncoded)?.project_id).toBe('smart-school-cc66c');

    // 4. Raw literal newline inside JSON string literal (Netlify UI copy-paste artifact)
    const rawNewlines = `{"type":"service_account","project_id":"smart-school-cc66c","client_email":"firebase-adminsdk@smart-school-cc66c.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\nLINE1\n-----END PRIVATE KEY-----\n"}`;
    const parsedRaw = parseServiceAccountFromEnv(rawNewlines);
    expect(parsedRaw?.client_email).toBe(sample.client_email);
    expect(parsedRaw?.private_key).toContain('LINE1');
  });

  it('preserves 503 ADMIN_SDK_UNAVAILABLE in requireActiveTenantSubscription instead of 500', async () => {
    const auth = {
      providerName: 'mock-auth',
      verifyIdToken: async () => ({
        uid: 'u1',
        email: 'admin@school.com',
        emailVerified: true,
        schoolId: 'SCH003',
        schoolRole: 'super_admin' as const,
        isMasterAdmin: false,
      }),
    } as any;
    const db = new InMemoryDatabaseProvider();
    db.getSchoolById = async () => {
      throw new SaaSServiceError('Admin SDK missing', 503, 'ADMIN_SDK_UNAVAILABLE');
    };

    const mw = createSaaSMiddleware(auth, db);
    const app = express();
    app.get('/test', mw.requireAuth, mw.requireActiveTenantSubscription, (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer school-admin-token');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ADMIN_SDK_UNAVAILABLE');
  });

  it('maps gRPC 16 UNAUTHENTICATED (revoked/deleted service account key) to 503 ADMIN_CREDENTIAL_INVALID while keeping client token errors 401', () => {
    const grpcErr = Object.assign(
      new Error(
        '16 UNAUTHENTICATED: Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.'
      ),
      { code: 16 }
    );
    const mapped = toFirebaseAdminServiceError(grpcErr);
    expect(mapped).toBeInstanceOf(SaaSServiceError);
    expect(mapped?.statusCode).toBe(503);
    expect(mapped?.code).toBe('ADMIN_CREDENTIAL_INVALID');

    const oauthGrantErr = new Error('invalid_grant: Invalid JWT Signature.');
    const mappedGrant = toFirebaseAdminServiceError(oauthGrantErr);
    expect(mappedGrant?.statusCode).toBe(503);
    expect(mappedGrant?.code).toBe('ADMIN_CREDENTIAL_INVALID');

    const expiredUserTokenErr = Object.assign(new Error('Firebase ID token has expired'), {
      code: 'auth/id-token-expired',
    });
    expect(toFirebaseAdminServiceError(expiredUserTokenErr)).toBeNull();
  });

  it('returns 503 ADMIN_CREDENTIAL_INVALID from /me on revoked Admin key so frontend falls back cleanly', async () => {
    const grpcUnauthError = Object.assign(
      new Error('16 UNAUTHENTICATED: Request had invalid authentication credentials.'),
      { code: 16 }
    );
    const auth = {
      providerName: 'mock-auth',
      verifyIdToken: async () => ({
        uid: 'u1',
        email: 'admin@school.com',
        emailVerified: true,
        schoolId: 'SCH003',
        schoolRole: 'super_admin' as const,
        isMasterAdmin: false,
      }),
    } as any;
    const db = new InMemoryDatabaseProvider();
    db.getSaaSUserByUid = async () => {
      throw grpcUnauthError;
    };
    db.getSchoolById = async () => {
      throw grpcUnauthError;
    };

    const app = express();
    app.use(express.json());
    app.use('/api/saas', createSaasRouter({ auth, db }));

    const res = await request(app)
      .get('/api/saas/me')
      .set('Authorization', 'Bearer valid-user-token');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ADMIN_CREDENTIAL_INVALID');

    expect(isSaaSBackendUnavailableError({ code: res.body.code, status: res.status })).toBe(true);
    expect(
      isSaaSBackendUnavailableError({
        status: 500,
        message: '16 UNAUTHENTICATED: Request had invalid authentication credentials.',
      })
    ).toBe(true);
  });
});
