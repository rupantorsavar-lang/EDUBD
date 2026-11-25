import { Expense, ExpenseLineItem } from '../types';

export type DateFilterPeriod = 'today' | 'week' | 'month' | 'year' | 'custom' | 'all';

const pad2 = (n: number): string => String(n).padStart(2, '0');

export const toLocalIsoDate = (date: Date = new Date()): string => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const normalizeRecordDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return toLocalIsoDate(parsed);
  }
  return '';
};

export const getPeriodDateRange = (
  period: DateFilterPeriod,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): { start: string | null; end: string | null } => {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const todayStr = toLocalIsoDate(ref);

  if (period === 'today') {
    return { start: todayStr, end: todayStr };
  }

  if (period === 'week') {
    // Bangladesh school week: Saturday to Friday
    const dayOfWeek = ref.getDay(); // 0=Sun ... 6=Sat
    const diffToSaturday = (dayOfWeek + 1) % 7;
    const weekStart = new Date(ref);
    weekStart.setDate(ref.getDate() - diffToSaturday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return {
      start: toLocalIsoDate(weekStart),
      end: toLocalIsoDate(weekEnd),
    };
  }

  if (period === 'month') {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return {
      start: toLocalIsoDate(start),
      end: toLocalIsoDate(end),
    };
  }

  if (period === 'year') {
    return {
      start: `${ref.getFullYear()}-01-01`,
      end: `${ref.getFullYear()}-12-31`,
    };
  }

  if (period === 'custom') {
    const s = normalizeRecordDate(customStart);
    const e = normalizeRecordDate(customEnd);
    if (s && e && s > e) {
      return { start: e, end: s };
    }
    return {
      start: s || null,
      end: e || null,
    };
  }

  return { start: null, end: null };
};

export const isDateInPeriod = (
  dateStr: string | undefined,
  period: DateFilterPeriod,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): boolean => {
  if (period === 'all') return true;
  const normalized = normalizeRecordDate(dateStr);
  if (!normalized) return false;
  const { start, end } = getPeriodDateRange(period, customStart, customEnd, referenceDate);
  if (start && normalized < start) return false;
  if (end && normalized > end) return false;
  return true;
};

export const getPeriodDisplayLabel = (
  period: DateFilterPeriod,
  language: 'bn' | 'en',
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): string => {
  const { start, end } = getPeriodDateRange(period, customStart, customEnd, referenceDate);
  if (period === 'today') {
    return language === 'bn' ? `আজকের (${start})` : `Today (${start})`;
  }
  if (period === 'week') {
    return language === 'bn' ? `এই সপ্তাহ (${start} – ${end})` : `This Week (${start} – ${end})`;
  }
  if (period === 'month') {
    const monthLabel = referenceDate.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
      month: 'long',
      year: 'numeric',
    });
    return language === 'bn' ? `এই মাস (${monthLabel})` : `This Month (${monthLabel})`;
  }
  if (period === 'year') {
    return language === 'bn'
      ? `এই বছর (${referenceDate.getFullYear()})`
      : `This Year (${referenceDate.getFullYear()})`;
  }
  if (period === 'custom') {
    if (start && end) return language === 'bn' ? `কাস্টম তারিখ (${start} – ${end})` : `Custom (${start} – ${end})`;
    if (start) return language === 'bn' ? `${start} থেকে` : `From ${start}`;
    if (end) return language === 'bn' ? `${end} পর্যন্ত` : `Until ${end}`;
    return language === 'bn' ? 'কাস্টম তারিখ নির্বাচন করুন' : 'Select Custom Range';
  }
  return language === 'bn' ? 'সকল সময় (All Time)' : 'All Time';
};

export const normalizeExpenseItems = (expense: Expense): ExpenseLineItem[] => {
  if (Array.isArray(expense.items) && expense.items.length > 0) {
    return expense.items.map((it, idx) => {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
      const amount = Number(it.amount) >= 0 && it.amount !== undefined ? Number(it.amount) : qty * unitPrice;
      return {
        id: it.id || `exp_item_${idx + 1}`,
        description: it.description || expense.title,
        category: it.category || expense.category,
        unit: it.unit || '',
        quantity: qty,
        unitPrice,
        amount,
      };
    });
  }
  return [
    {
      id: `exp_legacy_${expense.id}`,
      description: expense.title,
      category: expense.category,
      unit: '',
      quantity: 1,
      unitPrice: Number(expense.amount) || 0,
      amount: Number(expense.amount) || 0,
    },
  ];
};

export const calculateExpenseItemsTotal = (items: ExpenseLineItem[]): number => {
  return items.reduce((sum, item) => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const lineAmount = qty * price;
    return sum + (Number.isFinite(lineAmount) ? Math.round(lineAmount) : 0);
  }, 0);
};

export const summarizeExpenseTitle = (items: ExpenseLineItem[], customTitle?: string): string => {
  if (customTitle && customTitle.trim()) return customTitle.trim();
  const valid = items.filter((it) => it.description.trim() !== '');
  if (valid.length === 0) return '';
  if (valid.length === 1) {
    const first = valid[0];
    return first.quantity > 1 ? `${first.description.trim()} (×${first.quantity})` : first.description.trim();
  }
  const head = valid
    .slice(0, 2)
    .map((it) => (it.quantity > 1 ? `${it.description.trim()} ×${it.quantity}` : it.description.trim()))
    .join(', ');
  return valid.length > 2 ? `${head} + আরও ${valid.length - 2}টি` : head;
};

export interface PaymentMethodSummary {
  Cash: number;
  bKash: number;
  Nagad: number;
  Rocket: number;
  Bank: number;
  Other: number;
  total: number;
}

export const summarizeByPaymentMethod = (
  records: Array<{ paymentMethod?: string; amount: number }>
): PaymentMethodSummary => {
  const summary: PaymentMethodSummary = {
    Cash: 0,
    bKash: 0,
    Nagad: 0,
    Rocket: 0,
    Bank: 0,
    Other: 0,
    total: 0,
  };
  records.forEach((rec) => {
    const amt = Number(rec.amount) || 0;
    summary.total += amt;
    const method = (rec.paymentMethod || 'Cash').toLowerCase();
    if (method === 'cash') summary.Cash += amt;
    else if (method === 'bkash') summary.bKash += amt;
    else if (method === 'nagad') summary.Nagad += amt;
    else if (method === 'rocket') summary.Rocket += amt;
    else if (method === 'bank' || method === 'cheque') summary.Bank += amt;
    else summary.Other += amt;
  });
  return summary;
};
