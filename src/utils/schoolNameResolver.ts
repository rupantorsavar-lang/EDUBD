import { SchoolProfile } from '../types';
import { SaaSSchoolRecord } from '../services/saasApi';

const GENERIC_EN_PLACEHOLDERS = new Set(['smart school bd erp', 'amarschool erp', '']);
const GENERIC_BN_PLACEHOLDERS = new Set(['স্মার্ট স্কুল বিডি ইআরপি', 'আমারস্কুল ইআরপি', '']);

export function isGenericSchoolName(name?: string | null): boolean {
  const norm = (name || '').trim().toLowerCase();
  return GENERIC_EN_PLACEHOLDERS.has(norm) || GENERIC_BN_PLACEHOLDERS.has((name || '').trim());
}

/**
 * Resolves the single authoritative school display name shared by the Topbar Header,
 * Sidebar, and Document Title so Institutional Profile and Topbar always match.
 * Prefers the customized Institutional Profile name once set; falls back to the
 * SaaS school name when Institutional Profile still has placeholder defaults.
 */
export function resolveSchoolDisplayName(
  schoolProfile?: Partial<SchoolProfile> | null,
  saasSchool?: Partial<SaaSSchoolRecord> | null,
  language: 'en' | 'bn' = 'en'
): string {
  const preferredProfileName =
    language === 'bn'
      ? schoolProfile?.nameBn?.trim() || schoolProfile?.nameEn?.trim() || ''
      : schoolProfile?.nameEn?.trim() || schoolProfile?.nameBn?.trim() || '';

  if (preferredProfileName && !isGenericSchoolName(preferredProfileName)) {
    return preferredProfileName;
  }

  const alternateProfileName =
    language === 'bn'
      ? schoolProfile?.nameEn?.trim() || ''
      : schoolProfile?.nameBn?.trim() || '';

  if (alternateProfileName && !isGenericSchoolName(alternateProfileName)) {
    return alternateProfileName;
  }

  const saasName = saasSchool?.schoolName?.trim();
  if (saasName && !isGenericSchoolName(saasName)) {
    return saasName;
  }

  return preferredProfileName || 'Smart School BD ERP';
}

/**
 * Replaces default template placeholders in a tenant's Institutional Profile with
 * real details from the active SaaS school record, without overwriting user edits.
 */
export function hydrateSchoolProfileFromSaaSSchool(
  profile: SchoolProfile,
  saasSchool?: Partial<SaaSSchoolRecord> | null
): { profile: SchoolProfile; changed: boolean } {
  if (!saasSchool) {
    return { profile, changed: false };
  }

  let changed = false;
  const next: SchoolProfile = { ...profile };
  const saasName = saasSchool.schoolName?.trim();

  if (saasName && !isGenericSchoolName(saasName)) {
    if (isGenericSchoolName(next.nameEn)) {
      next.nameEn = saasName;
      changed = true;
    }
    if (isGenericSchoolName(next.nameBn)) {
      next.nameBn = saasName;
      changed = true;
    }
  }

  const tenantCode = saasSchool.schoolCode?.trim() || saasSchool.schoolId?.trim();
  if (!next.schoolCode?.trim() && tenantCode) {
    next.schoolCode = tenantCode;
    changed = true;
  }

  const phone = saasSchool.contactNumber?.trim();
  if (!next.phone?.trim() && phone) {
    next.phone = phone;
    changed = true;
  }

  const officialEmail = saasSchool.email?.trim() || saasSchool.adminEmail?.trim();
  if (
    officialEmail &&
    (!next.email?.trim() || next.email.trim().toLowerCase() === 'support@smartschoolbd.com')
  ) {
    next.email = officialEmail;
    changed = true;
  }

  const address = saasSchool.address?.trim();
  if (address) {
    if (!next.addressEn?.trim() || next.addressEn.trim() === 'Bangladesh') {
      next.addressEn = address;
      changed = true;
    }
    if (!next.addressBn?.trim() || next.addressBn.trim() === 'বাংলাদেশ') {
      next.addressBn = address;
      changed = true;
    }
  }

  const principal = saasSchool.principalName?.trim();
  if (principal) {
    if (!next.principalNameEn?.trim()) {
      next.principalNameEn = principal;
      changed = true;
    }
    if (!next.principalNameBn?.trim()) {
      next.principalNameBn = principal;
      changed = true;
    }
  }

  return { profile: next, changed };
}
