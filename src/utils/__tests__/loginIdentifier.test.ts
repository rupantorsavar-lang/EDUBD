import { describe, it, expect } from 'vitest';
import {
  buildSyntheticAuthEmail,
  formatDisplayLoginId,
  isPhoneLikeIdentifier,
  isSyntheticAuthEmail,
  normalizeBanglaDigits,
  normalizeLoginUsernameKey,
  normalizePhoneNumber,
  validateLoginIdentifier,
} from '../loginIdentifier';

describe('loginIdentifier utilities', () => {
  it('preserves standard @ emails and rejects malformed @ emails', () => {
    const valid = validateLoginIdentifier('  Teacher.One@School.EDU.BD ');
    expect(valid.valid).toBe(true);
    expect(valid.kind).toBe('email');
    expect(valid.displayValue).toBe('teacher.one@school.edu.bd');
    expect(valid.normalizedKey).toBe('email:teacher.one@school.edu.bd');

    const bad = validateLoginIdentifier('invalid@email');
    expect(bad.valid).toBe(false);
    expect(bad.kind).toBe('email');

    const noLocal = validateLoginIdentifier('@domain.com');
    expect(noLocal.valid).toBe(false);
  });

  it('normalizes Bangladesh mobile numbers across formats and Bangla digits', () => {
    expect(normalizeBanglaDigits('০১৭১২-৩৪৫৬৭৮')).toBe('01712-345678');
    expect(isPhoneLikeIdentifier('01712345678')).toBe(true);
    expect(isPhoneLikeIdentifier('+880 1712-345678')).toBe(true);
    expect(isPhoneLikeIdentifier('০১৭১২৩৪৫৬৭৮')).toBe(true);
    expect(isPhoneLikeIdentifier('rahim01712345678')).toBe(false);

    expect(normalizePhoneNumber('01712345678')).toBe('01712345678');
    expect(normalizePhoneNumber('+8801712345678')).toBe('01712345678');
    expect(normalizePhoneNumber('8801712345678')).toBe('01712345678');
    expect(normalizePhoneNumber('008801712345678')).toBe('01712345678');
    expect(normalizePhoneNumber('1712345678')).toBe('01712345678');
    expect(normalizePhoneNumber('০১৭১২-৩৪৫৬৭৮')).toBe('01712345678');

    const parsedBn = validateLoginIdentifier('০১৭১২-৩৪৫৬৭৮');
    expect(parsedBn.valid).toBe(true);
    expect(parsedBn.kind).toBe('mobile');
    expect(parsedBn.normalizedKey).toBe('phone:01712345678');
    expect(parsedBn.normalizedPhone).toBe('01712345678');
  });

  it('accepts any plain name, Bangla name, or name+number combination', () => {
    const plain = validateLoginIdentifier('Rahim');
    expect(plain.valid).toBe(true);
    expect(plain.kind).toBe('username');
    expect(plain.displayValue).toBe('Rahim');
    expect(plain.normalizedKey).toBe('name:rahim');

    const combo = validateLoginIdentifier('teacher_01');
    expect(combo.valid).toBe(true);
    expect(combo.kind).toBe('username');
    expect(combo.normalizedKey).toBe('name:teacher_01');

    const bangla = validateLoginIdentifier('রহিম১২');
    expect(bangla.valid).toBe(true);
    expect(bangla.kind).toBe('username');
    expect(bangla.normalizedKey).toBe('name:রহিম12');

    const studentCode = validateLoginIdentifier('S-2026-1001');
    expect(studentCode.valid).toBe(true);
    expect(studentCode.kind).toBe('username');
    expect(studentCode.normalizedKey).toBe('name:s-2026-1001');
  });

  it('rejects empty, single-char, control characters, and overly long identifiers', () => {
    expect(validateLoginIdentifier('').valid).toBe(false);
    expect(validateLoginIdentifier('   ').valid).toBe(false);
    expect(validateLoginIdentifier('a').valid).toBe(false);
    expect(validateLoginIdentifier('rahim\n01').valid).toBe(false);
    expect(validateLoginIdentifier('x'.repeat(121)).valid).toBe(false);
  });

  it('builds deterministic synthetic auth emails and formats display login IDs cleanly', () => {
    const synthPhone = buildSyntheticAuthEmail('01712345678', 'SCH001');
    const synthIntl = buildSyntheticAuthEmail('+880 1712-345678', 'SCH001');
    expect(synthPhone).toBe(synthIntl);
    expect(isSyntheticAuthEmail(synthPhone)).toBe(true);
    expect(synthPhone.endsWith('@sch001.users.smartschool.bd')).toBe(true);

    const synthBangla = buildSyntheticAuthEmail('রহিম', 'SCH001');
    expect(isSyntheticAuthEmail(synthBangla)).toBe(true);

    expect(isSyntheticAuthEmail('admin@dmhs.edu.bd')).toBe(false);

    expect(
      formatDisplayLoginId({ username: '01712345678', email: synthPhone })
    ).toBe('01712345678');
    expect(
      formatDisplayLoginId({ username: 'jamal01', email: 'jamal@dmhs.edu.bd' })
    ).toBe('jamal01');
    expect(
      formatDisplayLoginId({ email: 'admin@dmhs.edu.bd' })
    ).toBe('admin@dmhs.edu.bd');
    expect(normalizeLoginUsernameKey('Jamal   Uddin')).toBe('name:jamal uddin');
  });
});
