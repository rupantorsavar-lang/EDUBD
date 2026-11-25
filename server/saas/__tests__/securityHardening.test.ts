import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../../apiApp';
import {
  InMemoryAuthProvider,
  InMemoryDatabaseProvider,
} from '../providers/inMemoryProvider';

describe('API & Tenant Security Hardening', () => {
  let auth: InMemoryAuthProvider;
  let db: InMemoryDatabaseProvider;
  let masterToken: string;
  let adminToken: string;
  let studentToken: string;
  let app: ReturnType<typeof createApiApp>;

  beforeEach(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssbd-sec-test-'));
    auth = new InMemoryAuthProvider();
    db = new InMemoryDatabaseProvider();

    const masterEmail = 'owner@smartschoolbd.com';
    db.masterAdminEmails.add(masterEmail);
    masterToken = auth.seedMasterAdmin(masterEmail, 'master_uid_1');

    app = createApiApp({
      dataDir: tmpDir,
      saasAuthProvider: auth,
      saasDbProvider: db,
    });

    const createSchoolRes = await request(app)
      .post('/api/saas/master/schools')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        schoolName: 'Dhaka Model High School',
        schoolCode: 'DMHS01',
        address: 'Mirpur-10, Dhaka',
        contactNumber: '01711000111',
        email: 'info@dmhs.edu.bd',
        principalName: 'Prof. Rafiqul Islam',
        adminName: 'Kamrul Hasan',
        adminEmail: 'admin@dmhs.edu.bd',
        adminPassword: 'Password@123',
        initialPlan: 'monthly',
        startDate: new Date().toISOString(),
        activateImmediately: true,
      });
    expect(createSchoolRes.status).toBe(201);
    adminToken = auth.issueTestTokenForEmail('admin@dmhs.edu.bd');

    const stuRes = await request(app)
      .post('/api/saas/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'student1@dmhs.edu.bd',
        password: 'Password@123',
        displayName: 'Student One',
        schoolRole: 'student',
        linkedStudentId: 'std_1',
      });
    expect(stuRes.status).toBe(201);
    studentToken = auth.issueTestTokenForEmail('student1@dmhs.edu.bd');
  });

  it('sets hardened response headers and suppresses x-powered-by while preserving iframe & camera support', async () => {
    const res = await request(app).get('/api/ai/status');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    expect(res.headers['permissions-policy']).toBe('camera=(self), microphone=(self)');
    expect(res.headers['x-frame-options']).toBeUndefined();
  });

  it('blocks unauthenticated writes to /api/mfs-settings and /api/school-profile and restricts student role', async () => {
    const unauthMfs = await request(app)
      .post('/api/mfs-settings')
      .send({ bkashNumber: '01999999999' });
    expect(unauthMfs.status).toBe(401);

    const studentMfs = await request(app)
      .post('/api/mfs-settings')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ bkashNumber: '01999999999' });
    expect(studentMfs.status).toBe(403);

    const unauthProfile = await request(app)
      .post('/api/school-profile')
      .send({ nameEn: 'Hijacked School' });
    expect(unauthProfile.status).toBe(401);

    const studentProfile = await request(app)
      .post('/api/school-profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ nameEn: 'Hijacked School' });
    expect(studentProfile.status).toBe(403);

    const adminMfs = await request(app)
      .post('/api/mfs-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bkashNumber: '01711111111', bkashType: 'Merchant' });
    expect(adminMfs.status).toBe(200);
    expect(adminMfs.body.settings.bkashNumber).toBe('01711111111');
    expect(adminMfs.body.settings.bkashType).toBe('Merchant');
  });

  it('requires authentication on AI endpoints and prevents student role escalation in /api/ai/agent-chat', async () => {
    const unauthEval = await request(app)
      .post('/api/ai/evaluate-homework')
      .send({ homeworkTitle: 'Test', textAnswer: 'Ans' });
    expect(unauthEval.status).toBe(401);

    const unauthAnalytics = await request(app)
      .post('/api/ai/student-analytics')
      .send({ studentName: 'Test' });
    expect(unauthAnalytics.status).toBe(401);

    const unauthChat = await request(app)
      .post('/api/ai/agent-chat')
      .send({ message: 'Hello', role: 'super_admin' });
    expect(unauthChat.status).toBe(401);

    // Student attempts to impersonate super_admin to trigger notice drafting action
    const escalatedChat = await request(app)
      .post('/api/ai/agent-chat')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        message: 'কাল বৃষ্টির কারণে ছুটি নোটিশ দাও',
        role: 'super_admin',
        userName: 'Student One',
      });
    expect(escalatedChat.status).toBe(200);
    expect(escalatedChat.body.action).toBeNull();
    expect(String(escalatedChat.body.text)).not.toContain('CREATE_NOTICE');
  });

  it('prevents students from overwriting tenant slices and blocks homework cross-student or grade spoofing', async () => {
    const sliceRes = await request(app)
      .put('/api/saas/tenant/slices/finance')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ school_erp_invoices: [] });
    expect(sliceRes.status).toBe(403);
    expect(sliceRes.body.code).toBe('INSUFFICIENT_ROLE');

    // Cross-student submission spoofing blocked
    const spoofRes = await request(app)
      .post('/api/saas/tenant/homework-submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        homeworkId: 'hw_1',
        studentId: 'std_other_student',
        studentName: 'Other Student',
        className: 'Class 10',
        textAnswer: 'Fake answer',
      });
    expect(spoofRes.status).toBe(403);
    expect(spoofRes.body.code).toBe('CROSS_STUDENT_FORBIDDEN');

    // Direct self-grading / approval without AI evaluation blocked
    const gradeTamperRes = await request(app)
      .post('/api/saas/tenant/homework-submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        homeworkId: 'hw_1',
        studentId: 'std_1',
        studentName: 'Student One',
        className: 'Class 10',
        textAnswer: 'My answer',
        status: 'approved',
        teacherMarks: 10,
      });
    expect(gradeTamperRes.status).toBe(403);
    expect(gradeTamperRes.body.code).toBe('GRADE_TAMPERING_FORBIDDEN');

    // Mismatched teacherMarks vs aiEvaluation.suggestedMarks blocked
    const mismatchRes = await request(app)
      .post('/api/saas/tenant/homework-submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        homeworkId: 'hw_1',
        studentId: 'std_1',
        studentName: 'Student One',
        className: 'Class 10',
        textAnswer: 'My answer',
        status: 'approved',
        teacherMarks: 10,
        aiEvaluation: {
          status: 'evaluated',
          suggestedMarks: 4,
          fullMarks: 10,
          requiresTeacherReview: false,
        },
      });
    expect(mismatchRes.status).toBe(403);
    expect(mismatchRes.body.code).toBe('GRADE_TAMPERING_FORBIDDEN');
  });
});
