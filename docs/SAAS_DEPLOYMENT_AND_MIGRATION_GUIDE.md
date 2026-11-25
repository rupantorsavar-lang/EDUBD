# SmartSchoolBD Multi-Tenant SaaS — Complete Deployment, Migration & Architecture Guide

This guide documents how to deploy, configure, operate, migrate legacy single-school data, and later migrate to a dedicated Node.js + PostgreSQL VPS for **SmartSchoolBD Multi-Tenant SaaS**.

---

## 1. Architecture Overview & Future VPS Portability

The backend is cleanly decoupled behind two provider interfaces (`server/saas/types.ts`):
- `AuthProviderInterface` (`verifyIdToken`, `createUser`, `setCustomClaims`, `getUserByEmail`, `updateUserStatus`)
- `DatabaseProviderInterface` (CRUD & transactional locks for `schools`, `subscription_plans`, `payment_requests`, `payment_trx_index`, `subscription_history`, `saas_users`, `tenant_slices`)

Currently, `server/saas/providers/firebaseProvider.ts` implements both interfaces using **Firebase Admin SDK** + Cloud Firestore (named database configured in `firebase-applet-config.json`).

Frontend code communicates only with `/api/saas/*` REST contracts (`src/services/saasApi.ts`), keeping all subscription logic, duplicate Transaction ID protection, expiry date calculations, and custom claims assignments strictly server-side.

---

## 2. Environment Variables Setup

Copy `.env.example` to `.env` (or configure secrets in Cloud Run / hosting provider):

```env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
APP_URL="https://smartschoolbd.com"

# Firebase Admin SDK Credentials (required for creating users, setting custom claims, and server-side Firestore access)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
# OR path to downloaded service account JSON file:
# GOOGLE_APPLICATION_CREDENTIALS="/etc/secrets/firebase-service-account.json"

# Platform Owner Master Admin email(s), comma-separated
MASTER_ADMIN_EMAILS="owner@smartschoolbd.com"

# Platform Payment Instructions displayed to schools in Subscription & Billing
PLATFORM_BKASH_NUMBER="01711-234567 (Merchant / Send Money)"
PLATFORM_NAGAD_NUMBER="01911-234567 (Personal / Merchant)"
PLATFORM_BANK_ACCOUNT="Dutch-Bangla Bank • A/C: 101-110-0045678 (SmartSchool BD)"
PLATFORM_SUPPORT_PHONE="+880 1700-070707"
PLATFORM_SUPPORT_EMAIL="support@smartschoolbd.com"
```

---

## 3. Master Admin Initial Setup

1. Ensure the Master Admin account exists in **Firebase Authentication** (Email/Password or Google Sign-In with a verified email).
2. Add that email to `MASTER_ADMIN_EMAILS` in server environment variables **and/or** create a Firestore document at `/master_admins/{uid}` (`{ "email": "...", "role": "master_admin", "active": true }`).
3. On sign-in, `/api/saas/me` verifies the Firebase ID token and automatically grants `isMasterAdmin: true` access to the **Global Master Admin Console**.
4. For production strictness, once signed in with Firebase Admin configured, set custom claims `{ isMasterAdmin: true, schoolRole: 'master_admin' }` on that UID via Firebase Admin SDK.

---

## 4. Deploying Hardened Firestore Security Rules

The multi-tenant rules in `firestore.rules` enforce:
- Global default deny (`match /{document=**} { allow read, write: if false; }`)
- Strict `request.auth.token.schoolId == schoolId` isolation
- Server-time subscription validation (`schoolDoc.subscription.expiryTimestamp > request.time` and `schoolDoc.status == 'active'`)
- Read-only locks on `payment_requests`, `subscription_history`, `saas_users`, and `/schools/{schoolId}` so clients can never forge approvals or mutate `schoolId`/`schoolRole`.

**Before deploying `firestore.rules` to production:**
1. **Migrate your existing single-school data** into `/schools/SCH001/...` first (see Section 6 below), because `firestore.rules` locks legacy top-level collections (`/school_sync`, `/students`, `/staff`, etc.) to `isMasterAdmin()` only.
2. Deploy rules using Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```
   (When using a named Firestore database in `firebase.json`, ensure your `firebase.json` references `ai-studio-eduflowbd-5baa83b9-c3a1-4ca8-b5bf-0a209f34bf33`.)

---

## 5. SaaS Operational Workflows

### A. Creating a New School (Master Admin)
1. Open **Master Admin Portal -> Multi-School SaaS & Billing -> Create New School**.
2. Enter School Name, unique School Code, Address, Contact, Email, Principal Name, Admin Name, Admin Email, Admin Password, Plan (`Monthly`, `Quarterly`, `Half-Yearly`, `Yearly`), Start Date, and Expiry Date.
3. The backend transactionally:
   - Generates sequential `SCH001`, `SCH002`, ...
   - Rejects duplicate `schoolCode` or duplicate `adminEmail` (`409`).
   - Creates the Firebase Auth user with `emailVerified: true` and assigns custom claims `{ schoolId, schoolRole: 'super_admin', isMasterAdmin: false }`.
   - Initializes `/schools/{schoolId}`, `/schools/{schoolId}/slices/school_profile`, `/saas_users/{uid}`, and `subscription_history`.

### B. Manual Payment & Approval Workflow
1. School Super Admin / Head Teacher opens **Subscription & Billing** (or clicks **Renew Subscription** on `SaaSAccessGate` when expired).
2. Selects plan, sends money via **bKash / Nagad / Bank Transfer**, enters Amount, Sender Number, Transaction ID, Date, and optional screenshot, and submits (`POST /api/saas/payment-requests`).
3. Server creates a `pending` request with an atomic `payment_trx_index` lock (preventing duplicate TrxIDs). Subscription is **never** activated on submission.
4. Master Admin verifies the statement and clicks **Approve** (`POST /api/saas/master/payment-requests/:id/approve`):
   - **If renewed before expiry:** adds plan `durationDays` to the existing `expiryDate`.
   - **If renewed after expiry:** starts `durationDays` from server approval timestamp.
   - Updates `expiryTimestamp` (Firestore Timestamp) and logs an entry in `subscription_history`.

### C. Staff Account Provisioning
1. School Super Admin opens **Dashboard -> Staff RBAC & Login Access Control -> Grant New Staff Access** (or **Teachers & Staff -> Add New Staff**).
2. Entering email + password calls `POST /api/saas/users`, which creates the Firebase Auth user with custom claims `{ schoolId, schoolRole }`.
3. Plaintext passwords are **never** stored in Firestore or localStorage.
4. Migrated staff profiles with `authProvisionStatus: 'pending_provisioning'` can be provisioned cleanly by editing the staff member and setting an initial Firebase Auth password.

---

## 6. Safe Legacy Single-School Data Migration (6-Step Runbook)

Never manually delete or move production documents. Use the built-in migration CLI (`scripts/migrateLegacyTenant.ts`):

1. **Dry Run (Step 1 & 2 — Exports Timestamped JSON Backup, Writes Zero DB Changes)**:
   ```bash
   npx tsx scripts/migrateLegacyTenant.ts \
     --dry-run \
     --legacy-tenant=domain_default \
     --target-school=SCH001 \
     --school-code=DMHS01 \
     --school-name="Dhaka Model High School" \
     --admin-email="admin@dhakamodel.edu.bd"
   ```
2. **Inspect the Output**:
   - Verify document counts (`slices` and top-level collections).
   - Confirm the timestamped JSON backup file created inside `./backups/`.
3. **Apply Non-Destructive Copy (Steps 3–6 — Explicit Confirmation Required)**:
   ```bash
   npx tsx scripts/migrateLegacyTenant.ts \
     --confirm \
     --legacy-tenant=domain_default \
     --target-school=SCH001 \
     --school-code=DMHS01 \
     --school-name="Dhaka Model High School" \
     --admin-email="admin@dhakamodel.edu.bd"
   ```
   - Copies data into `/schools/SCH001/slices/*` and `/schools/SCH001/{collection}/*`.
   - Never overwrites existing destination documents.
   - Strips plaintext `password` fields from migrated `staff`, `students`, and `super_admin_creds`.
   - Prints post-migration verification counts and confirms zero plaintext passwords exist in destination.
   - Preserves all legacy documents intact for rollback safety.

---

## 7. Future VPS Migration Guide (Node.js + PostgreSQL)

To move off Firebase onto your own Linux VPS with PostgreSQL:
1. Provision PostgreSQL 15+ and apply the schema in `server/saas/providers/postgresStub.ts` (`POSTGRES_SAAS_SCHEMA_SQL`).
2. Implement `PostgresDatabaseProvider implements DatabaseProviderInterface` and `JwtAuthProvider implements AuthProviderInterface` (using Argon2/bcrypt password hashes + signed JWT access tokens containing `{ uid, schoolId, schoolRole, isMasterAdmin }`).
3. Swap the provider injection inside `server.ts` where `createSaasRouter({ db, auth })` is mounted.
4. Keep all frontend components (`SaaSAccessGate`, `SubscriptionBillingView`, `MasterAdminSaaSPanel`, `SaaSApi`) and `/api/saas/*` REST contracts unchanged.
5. Export Firestore data via JSON backup and import into PostgreSQL tables (`schools`, `subscription_plans`, `payment_requests`, `subscription_history`, `saas_users`, `tenant_slices`).

---

## 8. Running & Testing

```bash
# Install dependencies
npm install

# Run automated test suite (Vitest + Supertest)
npm test

# Type-check & lint
npm run lint

# Build production bundle
npm run build

# Start production full-stack server (port 3000)
npm start
```
