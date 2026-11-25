import { describe, it, expect } from 'vitest';
import {
  calculateExpenseItemsTotal,
  getPeriodDateRange,
  isDateInPeriod,
  normalizeExpenseItems,
  summarizeByPaymentMethod,
  summarizeExpenseTitle,
  toLocalIsoDate,
} from '../financeFilters';
import { Expense } from '../../types';

describe('Finance Period Filters & Multi-Item Expense Utilities', () => {
  // Reference date: Thursday Nov 19, 2026
  const refDate = new Date(2026, 10, 19);

  it('computes accurate Bangladesh school week (Sat–Fri), month, year, today and custom ranges', () => {
    expect(toLocalIsoDate(refDate)).toBe('2026-11-19');
    expect(getPeriodDateRange('today', undefined, undefined, refDate)).toEqual({
      start: '2026-11-19',
      end: '2026-11-19',
    });
    expect(getPeriodDateRange('week', undefined, undefined, refDate)).toEqual({
      start: '2026-11-14',
      end: '2026-11-20',
    });
    expect(getPeriodDateRange('month', undefined, undefined, refDate)).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(getPeriodDateRange('year', undefined, undefined, refDate)).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    });
    // Custom range auto-orders if reversed
    expect(getPeriodDateRange('custom', '2026-11-18', '2026-11-10', refDate)).toEqual({
      start: '2026-11-10',
      end: '2026-11-18',
    });
  });

  it('filters dates properly across all period modes including ISO timestamps', () => {
    expect(isDateInPeriod('2026-11-19', 'today', undefined, undefined, refDate)).toBe(true);
    expect(isDateInPeriod('2026-11-19T14:25:00.000Z', 'today', undefined, undefined, refDate)).toBe(true);
    expect(isDateInPeriod('2026-11-18', 'today', undefined, undefined, refDate)).toBe(false);

    expect(isDateInPeriod('2026-11-14', 'week', undefined, undefined, refDate)).toBe(true);
    expect(isDateInPeriod('2026-11-13', 'week', undefined, undefined, refDate)).toBe(false);

    expect(isDateInPeriod('2026-11-01', 'month', undefined, undefined, refDate)).toBe(true);
    expect(isDateInPeriod('2026-10-31', 'month', undefined, undefined, refDate)).toBe(false);

    expect(isDateInPeriod('2026-01-15', 'year', undefined, undefined, refDate)).toBe(true);
    expect(isDateInPeriod('2025-12-31', 'year', undefined, undefined, refDate)).toBe(false);

    expect(isDateInPeriod('2026-11-12', 'custom', '2026-11-10', '2026-11-15', refDate)).toBe(true);
    expect(isDateInPeriod('2026-11-17', 'custom', '2026-11-10', '2026-11-15', refDate)).toBe(false);

    expect(isDateInPeriod('2024-05-01', 'all', undefined, undefined, refDate)).toBe(true);
  });

  it('calculates totals and summarizes titles for multi-item expense vouchers', () => {
    const items = [
      { id: '1', description: 'মার্কার পেন', quantity: 5, unitPrice: 40, amount: 200 },
      { id: '2', description: 'A4 কাগজ', quantity: 2, unitPrice: 480, amount: 960 },
      { id: '3', description: 'ডাস্টার', quantity: 1, unitPrice: 90, amount: 90 },
    ];
    expect(calculateExpenseItemsTotal(items)).toBe(1250);
    expect(summarizeExpenseTitle(items)).toBe('মার্কার পেন ×5, A4 কাগজ ×2 + আরও 1টি');
    expect(summarizeExpenseTitle(items, 'নভেম্বর অফিস সামগ্রী ক্রয়')).toBe('নভেম্বর অফিস সামগ্রী ক্রয়');
  });

  it('normalizes legacy single-item expenses cleanly into ExpenseLineItem[]', () => {
    const legacyExpense: Expense = {
      id: 'exp_legacy_1',
      voucherNo: 'VOUCH-2026-557',
      category: 'Electricity & Utilities',
      title: 'Electricity Bill',
      amount: 1000,
      date: '2026-11-18',
      paidTo: 'DESCO',
      paymentMethod: 'Cash',
      approvedBy: 'Admin',
    };
    const normalized = normalizeExpenseItems(legacyExpense);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].description).toBe('Electricity Bill');
    expect(normalized[0].quantity).toBe(1);
    expect(normalized[0].unitPrice).toBe(1000);
    expect(normalized[0].amount).toBe(1000);
  });

  it('aggregates payment method totals accurately', () => {
    const summary = summarizeByPaymentMethod([
      { paymentMethod: 'Cash', amount: 1200 },
      { paymentMethod: 'bKash', amount: 800 },
      { paymentMethod: 'Nagad', amount: 500 },
      { paymentMethod: 'Rocket', amount: 300 },
      { paymentMethod: 'Bank', amount: 2000 },
    ]);
    expect(summary).toEqual({
      Cash: 1200,
      bKash: 800,
      Nagad: 500,
      Rocket: 300,
      Bank: 2000,
      Other: 0,
      total: 4800,
    });
  });
});
