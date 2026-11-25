import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { createSaasRouter } from '../router';
import {
  InMemoryAuthProvider,
  InMemoryDatabaseProvider,
} from '../providers/inMemoryProvider';

function setupSupportTestServer(initialDateIso = '2026-05-01T10:00:00.000Z') {
  let currentNow = new Date(initialDateIso);
  const auth = new InMemoryAuthProvider();
  const db = new InMemoryDatabaseProvider();

  const masterEmail = 'owner@smartschoolbd.com';
  db.masterAdminEmails.add(masterEmail);
  const masterToken = auth.seedMasterAdmin(masterEmail, 'master_uid_1');

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(
    '/api/saas',
    createSaasRouter({
      db,
      auth,
      nowProvider: () => currentNow,
      adminSdkReady: true,
    })
  );

  return {
    app,
    auth,
    db,
    masterToken,
    advanceDays: (days: number) => {
      currentNow = new Date(currentNow.getTime() + days * 24 * 60 * 60 * 1000);
    },
  };
}

describe('Support Team Two-Way Chat & Screenshot Feedback API', () => {
  let ctx: ReturnType<typeof setupSupportTestServer>;
  let schoolAToken: string;
  let schoolBToken: string;

  beforeEach(async () => {
    ctx = setupSupportTestServer('2026-05-01T10:00:00.000Z');

    const schoolARes = await request(ctx.app)
      .post('/api/saas/master/schools')
      .set('Authorization', `Bearer ${ctx.masterToken}`)
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
        startDate: '2026-05-01T10:00:00.000Z',
        activateImmediately: true,
      });
    expect(schoolARes.status).toBe(201);
    schoolAToken = ctx.auth.issueTestTokenForEmail('admin@dmhs.edu.bd')!;

    const schoolBRes = await request(ctx.app)
      .post('/api/saas/master/schools')
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({
        schoolName: 'Sylhet Ideal Academy',
        schoolCode: 'SIA02',
        address: 'Zindabazar, Sylhet',
        contactNumber: '01712000222',
        email: 'info@sia.edu.bd',
        principalName: 'Mizanur Rahman',
        adminName: 'Tariqul Islam',
        adminEmail: 'admin@sia.edu.bd',
        adminPassword: 'Password@123',
        initialPlan: 'monthly',
        startDate: '2026-05-01T10:00:00.000Z',
        activateImmediately: true,
      });
    expect(schoolBRes.status).toBe(201);
    schoolBToken = ctx.auth.issueTestTokenForEmail('admin@sia.edu.bd')!;
  });

  it('allows school user to create a ticket with text + screenshot images and notifies Master Admin', async () => {
    const sampleImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';

    const createRes = await request(ctx.app)
      .post('/api/saas/support/tickets')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({
        subject: 'ফি কালেকশন পেজে সমস্যা',
        category: 'technical',
        text: 'আমি স্টুডেন্ট ফি রসিদ প্রিন্ট করতে পারছি না, এখানে সমস্যা হচ্ছে।',
        imageUrls: [sampleImage],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.ticket.schoolId).toBe('SCH001');
    expect(createRes.body.ticket.status).toBe('open');
    expect(createRes.body.ticket.unreadByMaster).toBe(true);
    expect(createRes.body.ticket.unreadBySchool).toBe(false);
    expect(createRes.body.ticket.messageCount).toBe(1);
    expect(createRes.body.message.imageUrls).toEqual([sampleImage]);
    expect(createRes.body.message.senderRole).toBe('school');
  });

  it('enforces strict cross-tenant isolation between School A and School B', async () => {
    const createRes = await request(ctx.app)
      .post('/api/saas/support/tickets')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({
        subject: 'রেজাল্ট পাবলিশ অপশন বুঝতে পারছি না',
        category: 'training',
        text: 'কোথায় ক্লিক করলে মার্কশিট দেখা যাবে?',
      });
    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.ticket.id;

    // School B cannot see School A ticket in list
    const listB = await request(ctx.app)
      .get('/api/saas/support/tickets')
      .set('Authorization', `Bearer ${schoolBToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body.tickets).toHaveLength(0);

    // School B gets 403 reading, replying to, or updating School A ticket
    const readB = await request(ctx.app)
      .get(`/api/saas/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${schoolBToken}`);
    expect(readB.status).toBe(403);
    expect(readB.body.code).toBe('CROSS_TENANT_FORBIDDEN');

    const replyB = await request(ctx.app)
      .post(`/api/saas/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${schoolBToken}`)
      .send({ text: 'Unauthorized intrusion' });
    expect(replyB.status).toBe(403);
    expect(replyB.body.code).toBe('CROSS_TENANT_FORBIDDEN');

    const statusB = await request(ctx.app)
      .patch(`/api/saas/support/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${schoolBToken}`)
      .send({ status: 'resolved' });
    expect(statusB.status).toBe(403);
    expect(statusB.body.code).toBe('CROSS_TENANT_FORBIDDEN');
  });

  it('supports Master Admin viewing all tickets, replying with feedback image, clearing unread flags, and resolving/reopening', async () => {
    const createRes = await request(ctx.app)
      .post('/api/saas/support/tickets')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({
        subject: 'লগইন পাসওয়ার্ড রিসেট সমস্যা',
        category: 'technical',
        text: 'স্ক্রিনশটে দেখুন এরর আসছে।',
        imageUrls: ['data:image/jpeg;base64,/9j/SCHOOL_IMG'],
      });
    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.ticket.id;

    // Master Admin sees ticket
    const masterList = await request(ctx.app)
      .get('/api/saas/support/tickets')
      .set('Authorization', `Bearer ${ctx.masterToken}`);
    expect(masterList.status).toBe(200);
    expect(masterList.body.tickets).toHaveLength(1);
    expect(masterList.body.tickets[0].unreadByMaster).toBe(true);

    // Master Admin reads messages -> clears unreadByMaster
    const masterRead = await request(ctx.app)
      .get(`/api/saas/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${ctx.masterToken}`);
    expect(masterRead.status).toBe(200);
    expect(masterRead.body.ticket.unreadByMaster).toBe(false);
    expect(masterRead.body.messages).toHaveLength(1);

    // Master Admin replies with feedback text + guide screenshot
    const masterReply = await request(ctx.app)
      .post(`/api/saas/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({
        text: 'এই ধাপগুলো অনুসরণ করুন, সমাধান হয়ে যাবে।',
        imageUrls: ['data:image/jpeg;base64,/9j/MASTER_GUIDE_IMG'],
      });
    expect(masterReply.status).toBe(201);
    expect(masterReply.body.ticket.status).toBe('replied');
    expect(masterReply.body.ticket.unreadBySchool).toBe(true);
    expect(masterReply.body.ticket.unreadByMaster).toBe(false);
    expect(masterReply.body.ticket.messageCount).toBe(2);
    expect(masterReply.body.message.senderRole).toBe('master_admin');
    expect(masterReply.body.message.imageUrls).toEqual(['data:image/jpeg;base64,/9j/MASTER_GUIDE_IMG']);

    // School reads messages -> clears unreadBySchool and sees both messages
    const schoolRead = await request(ctx.app)
      .get(`/api/saas/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(schoolRead.status).toBe(200);
    expect(schoolRead.body.ticket.unreadBySchool).toBe(false);
    expect(schoolRead.body.messages).toHaveLength(2);

    // School marks resolved, then Master Admin can reopen
    const resolveRes = await request(ctx.app)
      .patch(`/api/saas/support/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ status: 'resolved' });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.ticket.status).toBe('resolved');

    const reopenRes = await request(ctx.app)
      .patch(`/api/saas/support/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${ctx.masterToken}`)
      .send({ status: 'open' });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.ticket.status).toBe('open');
  });

  it('allows schools with expired subscriptions to still access Support Team endpoints', async () => {
    // Advance past 30-day monthly plan expiry
    ctx.advanceDays(45);

    const createRes = await request(ctx.app)
      .post('/api/saas/support/tickets')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({
        subject: 'সাবস্ক্রিপশন নবায়ন সংক্রান্ত সহায়তা',
        category: 'billing',
        text: 'প্ল্যান মেয়াদ শেষ হয়েছে, পেমেন্ট কনফার্ম হয়নি।',
      });
    expect(createRes.status).toBe(201);

    const listRes = await request(ctx.app)
      .get('/api/saas/support/tickets')
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.tickets).toHaveLength(1);
  });
});
