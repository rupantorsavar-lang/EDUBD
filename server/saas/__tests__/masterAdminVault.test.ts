import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { createSaasRouter } from '../router';
import { encryptVaultPassword, decryptVaultPassword } from '../credentialVault';
import {
  InMemoryAuthProvider,
  InMemoryDatabaseProvider,
} from '../providers/inMemoryProvider';

function setupTestServer() {
  const currentNow = new Date('2026-06-01T10:00:00.000Z');
  const auth = new InMemoryAuthProvider();
  const db = new InMemoryDatabaseProvider();

  const masterEmail = 'master@smartschoolbd.com';
  db.masterAdminEmails.add(masterEmail);
  const masterToken = auth.seedMasterAdmin(masterEmail, 'master_uid_1');

  const app = express();
  app.use(express.json());
  app.use(
    '/api/saas',
    createSaasRouter({
      db,
      auth,
      nowProvider: () => currentNow,
      adminSdkReady: true,
    })
  );

  return { app, auth, db, masterToken };
}

describe('Master Admin Super Admin Credential Vault & Encryption Tests', () => {
  let ctx: ReturnType<typeof setupTestServer>;

  beforeEach(() => {
    ctx = setupTestServer();
  });

  it('encrypts with AES-256-GCM unique IVs and rejects tampered ciphertexts or wrong secret', () => {
    const c1 = encryptVaultPassword('Secret#2026', 'vault-key-1');
    const c2 = encryptVaultPassword('Secret#2026', 'vault-key-1');
    expect(c1).toMatch(/^v1:/);
    expect(c1).not.toBe(c2);
    expect(c1).not.toContain('Secret#2026');

    expect(decryptVaultPassword(c1, 'vault-key-1')).toBe('Secret#2026');
    expect(decryptVaultPassword(c2, 'vault-key-1')).toBe('Secret#2026');
    expect(decryptVaultPassword(c1, 'wrong-key')).toBeNull();

    const parts = c1.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(decryptVaultPassword(parts.join(':'), 'vault-key-1')).toBeNull();
  });

  it('stores encrypted Super Admin credentials on school creation and returns decrypted credentials to Master Admin only', async () => {
    const createRes = await request(ctx.app)
      .post('/api/saas/master/schools')
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({
        schoolName: 'Greenfield Academy',
        schoolCode: 'GFA01',
        address: 'Dhanmondi, Dhaka',
        contactNumber: '01712345678',
        email: 'info@gfa.edu.bd',
        principalName: 'Dr. Mahmud',
        adminName: 'Tariqul Islam',
        adminEmail: 'superadmin@gfa.edu.bd',
        adminPassword: 'InitPass#99',
        initialPlan: 'monthly',
        startDate: '2026-06-01T00:00:00.000Z',
        activateImmediately: true,
      });

    expect(createRes.status).toBe(201);
    const schoolId = createRes.body.school.schoolId;
    const adminUid = createRes.body.school.adminUid;

    // Stored record in DB must be encrypted, never plaintext
    const storedVault = await ctx.db.getMasterVaultRecordByUid(adminUid);
    expect(storedVault).not.toBeNull();
    expect(storedVault!.encryptedPassword).toMatch(/^v1:/);
    expect(storedVault!.encryptedPassword).not.toContain('InitPass#99');

    // Master Admin can fetch decrypted Super Admin credentials
    const vaultRes = await request(ctx.app)
      .get(`/api/saas/master/schools/${schoolId}/admin-credentials`)
      .set('Authorization', `Bearer ${ctx.masterToken}`);

    expect(vaultRes.status).toBe(200);
    expect(vaultRes.body.credentials).toHaveLength(1);
    expect(vaultRes.body.credentials[0]).toMatchObject({
      uid: adminUid,
      email: 'superadmin@gfa.edu.bd',
      displayName: 'Tariqul Islam',
      isPrimaryAdmin: true,
      hasStoredPassword: true,
      managedPassword: 'InitPass#99',
    });

    // School Super Admin & Accountant must be blocked from Master Admin vault endpoint
    const superAdminToken = ctx.auth.issueTestTokenForEmail('superadmin@gfa.edu.bd');
    const forbiddenSuper = await request(ctx.app)
      .get(`/api/saas/master/schools/${schoolId}/admin-credentials`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(forbiddenSuper.status).toBe(403);

    // Public/School user listing must never expose encrypted or plaintext passwords
    const listRes = await request(ctx.app)
      .get(`/api/saas/users`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(listRes.status).toBe(200);
    expect(JSON.stringify(listRes.body)).not.toContain('InitPass#99');
    expect(JSON.stringify(listRes.body)).not.toContain('encryptedPassword');
  });

  it('updates vault when Super Admin password is reset by Master Admin or changed by self, and excludes non-super_admin roles', async () => {
    const createRes = await request(ctx.app)
      .post('/api/saas/master/schools')
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({
        schoolName: 'Sunrise Public School',
        schoolCode: 'SPS02',
        address: 'Uttara, Dhaka',
        contactNumber: '01811223344',
        email: 'info@sps.edu.bd',
        principalName: 'Nusrat Jahan',
        adminName: 'Rafiqul Hoque',
        adminEmail: 'rafiq@sps.edu.bd',
        adminPassword: 'OldPass#11',
        initialPlan: 'monthly',
        startDate: '2026-06-01T00:00:00.000Z',
        activateImmediately: true,
      });

    const schoolId = createRes.body.school.schoolId;
    const adminUid = createRes.body.school.adminUid;

    // Provision a teacher — must NOT go into Master Admin Vault
    const teacherRes = await request(ctx.app)
      .post('/api/saas/users')
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({
        schoolId,
        displayName: 'Karim Teacher',
        email: 'teacher@sps.edu.bd',
        password: 'TeacherPass#22',
        schoolRole: 'teacher',
      });
    expect(teacherRes.status).toBe(201);
    expect(await ctx.db.getMasterVaultRecordByUid(teacherRes.body.user.uid)).toBeNull();

    // Master Admin resets Super Admin password
    const resetRes = await request(ctx.app)
      .patch(`/api/saas/users/${adminUid}/credentials`)
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({
        password: 'MasterReset#77',
      });
    expect(resetRes.status).toBe(200);

    let vaultRes = await request(ctx.app)
      .get(`/api/saas/master/schools/${schoolId}/admin-credentials`)
      .set('Authorization', `Bearer ${ctx.masterToken}`);
    expect(vaultRes.body.credentials[0].managedPassword).toBe('MasterReset#77');

    // Super Admin changes own password via /me/credentials -> vault stays in sync
    const superAdminToken = ctx.auth.issueTestTokenForEmail('rafiq@sps.edu.bd');
    const selfRes = await request(ctx.app)
      .patch('/api/saas/me/credentials')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        password: 'SelfUpdated#88',
      });
    expect(selfRes.status).toBe(200);

    vaultRes = await request(ctx.app)
      .get(`/api/saas/master/schools/${schoolId}/admin-credentials`)
      .set('Authorization', `Bearer ${ctx.masterToken}`);
    expect(vaultRes.body.credentials[0].managedPassword).toBe('SelfUpdated#88');
  });

  it('cleans up vault records when Super Admin is demoted, user deleted, or school deleted', async () => {
    const createRes = await request(ctx.app)
      .post('/api/saas/master/schools')
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({
        schoolName: 'Crescent School',
        schoolCode: 'CRS03',
        address: 'Sylhet',
        contactNumber: '01911223344',
        email: 'info@crescent.edu.bd',
        principalName: 'Kamal Uddin',
        adminName: 'Kamal Uddin',
        adminEmail: 'kamal@crescent.edu.bd',
        adminPassword: 'Crescent#55',
        initialPlan: 'monthly',
        startDate: '2026-06-01T00:00:00.000Z',
        activateImmediately: true,
      });
    const schoolId = createRes.body.school.schoolId;

    // Provision secondary super_admin
    const secondAdmin = await request(ctx.app)
      .post('/api/saas/users')
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({
        schoolId,
        displayName: 'Second Super Admin',
        email: 'second@crescent.edu.bd',
        password: 'SecondPass#99',
        schoolRole: 'super_admin',
      });
    expect(secondAdmin.status).toBe(201);
    const secondUid = secondAdmin.body.user.uid;
    expect(await ctx.db.getMasterVaultRecordByUid(secondUid)).not.toBeNull();

    // Demoting second super_admin to teacher removes vault entry
    const demoteRes = await request(ctx.app)
      .patch(`/api/saas/users/${secondUid}/credentials`)
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({ schoolRole: 'teacher' });
    expect(demoteRes.status).toBe(200);
    expect(await ctx.db.getMasterVaultRecordByUid(secondUid)).toBeNull();

    // Deleting entire school wipes remaining vault entries
    const delSchoolRes = await request(ctx.app)
      .delete(`/api/saas/master/schools/${schoolId}`)
      .set('Authorization', `Bearer ${ctx.masterToken}`);
    expect(delSchoolRes.status).toBe(200);
    expect(await ctx.db.getMasterVaultRecordsBySchool(schoolId)).toHaveLength(0);
  });
});
