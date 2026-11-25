import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatTaka,
  parseLocaleNumber,
  sanitizeNumericInput,
  toBnNumber,
  toEnNumber,
  translations,
} from '../i18n';

describe('English Digit Normalization & Mixed Bangla+English Numeric Input', () => {
  it('normalizes Bengali digits (০-৯) and mixed strings to standard English digits (0-9)', () => {
    expect(toEnNumber('১২৩৪৫৬৭৮৯০')).toBe('1234567890');
    expect(toEnNumber('১ম মডেল টেস্ট ফি')).toBe('1ম মডেল টেস্ট ফি');
    expect(toEnNumber('১ম সেমিস্টার ও 2য় মডেল টেস্ট')).toBe('1ম সেমিস্টার ও 2য় মডেল টেস্ট');
    expect(toEnNumber('০১৭১১-১২৩৪৫৬')).toBe('01711-123456');
    expect(toEnNumber(450)).toBe('450');
    expect(toEnNumber('')).toBe('');
  });

  it('keeps toBnNumber aligned to English (0-9) digits across Bangla UI', () => {
    expect(toBnNumber(100)).toBe('100');
    expect(toBnNumber('২৬,৪০০')).toBe('26,400');
    expect(toBnNumber('৯ম শ্রেণি')).toBe('9ম শ্রেণি');
  });

  it('sanitizes numeric input accepting BOTH English (0-9) and Bengali (০-৯) digits', () => {
    expect(sanitizeNumericInput('৭৫')).toBe('75');
    expect(sanitizeNumericInput('8৫')).toBe('85');
    expect(sanitizeNumericInput('৫2.৭৫', { allowDecimal: true })).toBe('52.75');
    expect(sanitizeNumericInput('১2.3.৪', { allowDecimal: true })).toBe('12.34');
    expect(sanitizeNumericInput('-১৫', { allowNegative: true })).toBe('-15');
    expect(sanitizeNumericInput('abc৮৯xyz')).toBe('89');
  });

  it('parses English, Bengali, and mixed numeric values accurately for Mark Entry & Fees', () => {
    expect(parseLocaleNumber('৮৫')).toBe(85);
    expect(parseLocaleNumber('8৫')).toBe(85);
    expect(parseLocaleNumber('৫০.৫')).toBe(50.5);
    expect(parseLocaleNumber('1200')).toBe(1200);
    expect(parseLocaleNumber('', 0)).toBe(0);
    expect(parseLocaleNumber('abc', 33)).toBe(33);
  });

  it('formats currency and dates with Bangla context using English (0-9) digits', () => {
    expect(formatTaka(26400, 'bn')).toBe('৳ 26,400');
    expect(formatTaka(500, 'en')).toBe('৳ 500');
    expect(formatDate('2026-11-17', 'bn')).toBe('17/11/2026');
    expect(formatDate('2026-11-17', 'en')).toBe('17/11/2026');
  });

  it('keeps Bangla class labels with English ordinal digits (1ম - 10ম)', () => {
    expect(translations.bn.class1).toBe('1ম শ্রেণি');
    expect(translations.bn.class2).toBe('2য় শ্রেণি');
    expect(translations.bn.class10).toBe('10ম শ্রেণি');
  });
});
