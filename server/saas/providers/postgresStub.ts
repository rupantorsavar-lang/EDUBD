/**
 * Future VPS / PostgreSQL Migration Blueprint
 * ---------------------------------------------------------------------------
 * When migrating from Firebase Firestore to a dedicated Node.js + PostgreSQL VPS,
 * implement `DatabaseProviderInterface` using `pg` / Drizzle ORM / Prisma against
 * the schema below. Because all domain services (`tenantService`, `paymentService`,
 * `subscriptionService`, `middleware`, `router`) depend strictly on
 * `DatabaseProviderInterface` and `AuthProviderInterface`, zero frontend or
 * business-logic rewrites are required.
 */

export const POSTGRES_SAAS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  name_bn VARCHAR(120) NOT NULL,
  duration_days INTEGER NOT NULL,
  price_bdt NUMERIC(12, 2) NOT NULL,
  description TEXT NOT NULL,
  description_bn TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schools (
  school_id VARCHAR(32) PRIMARY KEY,
  school_code VARCHAR(64) NOT NULL UNIQUE,
  school_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  contact_number VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  principal_name VARCHAR(255) NOT NULL,
  admin_name VARCHAR(255) NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  admin_uid VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'suspended')),
  plan_id VARCHAR(32) NOT NULL REFERENCES subscription_plans(id),
  plan_name VARCHAR(120) NOT NULL,
  subscription_status VARCHAR(32) NOT NULL CHECK (subscription_status IN ('Pending', 'Active', 'Expired', 'Suspended')),
  subscription_start_date TIMESTAMPTZ NOT NULL,
  subscription_expiry_date TIMESTAMPTZ NOT NULL,
  last_payment_date TIMESTAMPTZ NULL,
  next_renewal_date TIMESTAMPTZ NULL,
  amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS saas_users (
  uid VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  school_id VARCHAR(32) NOT NULL REFERENCES schools(school_id),
  school_role VARCHAR(48) NOT NULL,
  linked_staff_id VARCHAR(128) NULL,
  linked_student_id VARCHAR(128) NULL,
  phone VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id VARCHAR(128) PRIMARY KEY,
  school_id VARCHAR(32) NOT NULL REFERENCES schools(school_id),
  school_name VARCHAR(255) NOT NULL,
  plan_id VARCHAR(32) NOT NULL REFERENCES subscription_plans(id),
  plan_name VARCHAR(120) NOT NULL,
  duration_days INTEGER NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  sender_number VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(128) NOT NULL,
  normalized_transaction_id VARCHAR(128) NOT NULL UNIQUE,
  payment_date VARCHAR(32) NOT NULL,
  screenshot_url TEXT NULL,
  notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by_uid VARCHAR(128) NOT NULL,
  submitted_by_email VARCHAR(255) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by_uid VARCHAR(128) NULL,
  reviewed_by_email VARCHAR(255) NULL,
  reviewed_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL
);

CREATE TABLE IF NOT EXISTS subscription_history (
  id VARCHAR(128) PRIMARY KEY,
  school_id VARCHAR(32) NOT NULL REFERENCES schools(school_id),
  school_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  plan_id VARCHAR(32) NOT NULL,
  plan_name VARCHAR(120) NOT NULL,
  previous_expiry_date TIMESTAMPTZ NULL,
  new_expiry_date TIMESTAMPTZ NULL,
  duration_days_added INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NULL,
  payment_request_id VARCHAR(128) NULL,
  transaction_id VARCHAR(128) NULL,
  actor_uid VARCHAR(128) NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  remarks TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_slices (
  school_id VARCHAR(32) NOT NULL REFERENCES schools(school_id),
  slice_name VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id, slice_name)
);
`;
