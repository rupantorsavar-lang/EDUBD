import { Expense, FeePayment, IncomeVoucher, Staff, UserProfile, UserRole } from '../types';
import {
  DateFilterPeriod,
  PaymentMethodSummary,
  isDateInPeriod,
  normalizeRecordDate,
  summarizeByPaymentMethod,
} from './financeFilters';

export type CollectorTransactionSource = 'fee_receipt' | 'income_voucher' | 'expense_voucher';
export type CollectorTransactionDirection = 'income' | 'expense';

export interface CollectorIdentity {
  collectorKey: string;
  displayName: string;
  displayNameBn: string;
  role: string;
  email?: string;
  staffId?: string;
}

export interface CollectorTransaction {
  id: string;
  source: CollectorTransactionSource;
  direction: CollectorTransactionDirection;
  refNo: string;
  date: string;
  partyName: string;
  subtitle: string;
  paymentMethod: string;
  transactionId?: string;
  amount: number;
  collectorKey: string;
  collectorName: string;
  collectorNameBn: string;
  collectorRole: string;
  rawCollectedBy: string;
  notes?: string;
}

export interface CollectorSummary {
  collectorKey: string;
  displayName: string;
  displayNameBn: string;
  role: string;
  roleLabelBn: string;
  roleLabelEn: string;
  email?: string;
  feeCount: number;
  feeAmount: number;
  voucherCount: number;
  voucherAmount: number;
  expenseCount: number;
  expenseAmount: number;
  totalCount: number;
  txCount: number;
  totalAmount: number; // Total Income (Fees + Income Vouchers)
  cashAmount: number; // Cash Income
  cashExpenseAmount: number; // Cash Expense
  mfsAndBankAmount: number; // Digital/Bank Income
  mfsAndBankExpenseAmount: number; // Digital/Bank Expense
  netCashInHand: number; // Cash Income - Cash Expense
  netBalance: number; // Total Income - Total Expense
  methodSummary: PaymentMethodSummary; // Income method summary
  expenseMethodSummary: PaymentMethodSummary;
  sharePercent: number;
  isCurrentUser: boolean;
}

export interface IncomeExpenseStats {
  incomeTotal: number;
  feeTotal: number;
  incomeVoucherTotal: number;
  incomeCount: number;
  cashIncome: number;
  digitalIncome: number;
  expenseTotal: number;
  expenseCount: number;
  cashExpense: number;
  digitalExpense: number;
  netBalance: number;
  netCashInHand: number;
  netDigitalBalance: number;
  incomeMethodSummary: PaymentMethodSummary;
  expenseMethodSummary: PaymentMethodSummary;
}

export const canViewAllCollectorReports = (role?: UserRole | null): boolean => {
  return role === 'super_admin' || role === 'master_admin';
};

export const getCollectorRoleLabels = (role?: string): { bn: string; en: string } => {
  switch (role) {
    case 'super_admin':
      return { bn: 'সুপার অ্যাডমিন', en: 'Super Admin' };
    case 'master_admin':
      return { bn: 'মাস্টার অ্যাডমিন', en: 'Master Admin' };
    case 'accountant':
      return { bn: 'হিসাবরক্ষক', en: 'Accountant' };
    case 'admin':
      return { bn: 'অ্যাডমিন / প্রধান শিক্ষক', en: 'Admin' };
    case 'receptionist':
      return { bn: 'রিসেপশনিস্ট', en: 'Receptionist' };
    case 'teacher':
      return { bn: 'শিক্ষক', en: 'Teacher' };
    default:
      return { bn: 'হিসাব সংগ্রহকারী', en: 'Collector' };
  }
};

export const extractCollectorDisplayName = (raw?: string): string => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const approvedMatch = trimmed.match(/\(Approved by\s+([^)]+)\)/i);
  if (approvedMatch && approvedMatch[1]) {
    return approvedMatch[1].trim();
  }
  return trimmed;
};

const normalizeTextKey = (val?: string): string =>
  String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

interface CollectorDirectory {
  identities: CollectorIdentity[];
  resolve: (params: {
    actorId?: string;
    actorEmail?: string;
    actorRole?: string;
    rawLabel?: string;
  }) => CollectorIdentity;
  resolveUserKey: (user: UserProfile | null | undefined) => string;
}

export const buildCollectorDirectory = (
  staffList: Staff[],
  currentUser?: UserProfile | null
): CollectorDirectory => {
  const identities: CollectorIdentity[] = [];
  const byId = new Map<string, CollectorIdentity>();
  const byEmail = new Map<string, CollectorIdentity>();
  const byName = new Map<string, CollectorIdentity>();

  const registerIdentity = (identity: CollectorIdentity, extraAliases: Array<string | undefined> = []) => {
    identities.push(identity);
    if (identity.staffId) {
      byId.set(identity.staffId, identity);
    }
    if (identity.email) {
      byEmail.set(normalizeTextKey(identity.email), identity);
    }
    const nameKeys = [identity.displayName, identity.displayNameBn, ...extraAliases]
      .map(normalizeTextKey)
      .filter(Boolean);
    nameKeys.forEach((nk) => {
      if (!byName.has(nk)) byName.set(nk, identity);
    });
  };

  // 1. Register staff who can manage fees / expenses
  const eligibleStaff = staffList.filter(
    (st) =>
      st.status !== 'resigned' &&
      (st.role === 'accountant' ||
        st.role === 'super_admin' ||
        st.role === 'admin' ||
        st.role === 'receptionist' ||
        st.permissions?.manageFees === true)
  );

  eligibleStaff.forEach((st) => {
    const key = st.id ? `staff:${st.id}` : `email:${normalizeTextKey(st.email)}`;
    const displayName = st.nameEn || st.nameBn || st.email || 'Accountant';
    const displayNameBn = st.nameBn || st.nameEn || st.email || 'হিসাবরক্ষক';
    registerIdentity(
      {
        collectorKey: key,
        displayName,
        displayNameBn,
        role: st.role || 'accountant',
        email: st.email,
        staffId: st.id,
      },
      [st.employeeId]
    );
  });

  // 2. Ensure currentUser is matched or registered
  const resolveUserMatch = (user: UserProfile | null | undefined): CollectorIdentity | null => {
    if (!user) return null;
    if (user.linkedStaffId && byId.has(user.linkedStaffId)) return byId.get(user.linkedStaffId)!;
    if (user.id && byId.has(user.id)) return byId.get(user.id)!;
    if (user.email && byEmail.has(normalizeTextKey(user.email))) return byEmail.get(normalizeTextKey(user.email))!;
    const n1 = normalizeTextKey(user.name);
    if (n1 && byName.has(n1)) return byName.get(n1)!;
    const n2 = normalizeTextKey(user.nameBn);
    if (n2 && byName.has(n2)) return byName.get(n2)!;
    return null;
  };

  if (currentUser) {
    const existing = resolveUserMatch(currentUser);
    if (existing) {
      if (currentUser.id && !byId.has(currentUser.id)) byId.set(currentUser.id, existing);
      if (currentUser.linkedStaffId && !byId.has(currentUser.linkedStaffId)) {
        byId.set(currentUser.linkedStaffId, existing);
      }
      if (currentUser.email && !byEmail.has(normalizeTextKey(currentUser.email))) {
        byEmail.set(normalizeTextKey(currentUser.email), existing);
      }
      const cuName = normalizeTextKey(currentUser.name);
      if (cuName && !byName.has(cuName)) byName.set(cuName, existing);
      const cuNameBn = normalizeTextKey(currentUser.nameBn);
      if (cuNameBn && !byName.has(cuNameBn)) byName.set(cuNameBn, existing);
    } else if (
      currentUser.role === 'accountant' ||
      currentUser.role === 'super_admin' ||
      currentUser.role === 'master_admin' ||
      currentUser.role === 'admin' ||
      currentUser.role === 'receptionist' ||
      currentUser.permissions?.manageFees
    ) {
      const key = currentUser.linkedStaffId
        ? `staff:${currentUser.linkedStaffId}`
        : currentUser.email
        ? `email:${normalizeTextKey(currentUser.email)}`
        : `user:${currentUser.id || normalizeTextKey(currentUser.name)}`;
      const created: CollectorIdentity = {
        collectorKey: key,
        displayName: currentUser.name || currentUser.nameBn || 'Accountant',
        displayNameBn: currentUser.nameBn || currentUser.name || 'হিসাবরক্ষক',
        role: currentUser.role,
        email: currentUser.email,
        staffId: currentUser.linkedStaffId || currentUser.id,
      };
      registerIdentity(created);
      if (currentUser.id) byId.set(currentUser.id, created);
    }
  }

  const resolve = ({
    actorId,
    actorEmail,
    actorRole,
    rawLabel,
  }: {
    actorId?: string;
    actorEmail?: string;
    actorRole?: string;
    rawLabel?: string;
  }): CollectorIdentity => {
    if (actorId && byId.has(actorId)) {
      return byId.get(actorId)!;
    }
    const emailNorm = normalizeTextKey(actorEmail);
    if (emailNorm && byEmail.has(emailNorm)) {
      return byEmail.get(emailNorm)!;
    }

    const extractedName = extractCollectorDisplayName(rawLabel);
    const extractedNorm = normalizeTextKey(extractedName);
    if (extractedNorm && byName.has(extractedNorm)) {
      return byName.get(extractedNorm)!;
    }

    const rawNorm = normalizeTextKey(rawLabel);
    if (rawNorm && byName.has(rawNorm)) {
      return byName.get(rawNorm)!;
    }

    // Fallback: create or reuse a dynamic identity for legacy / unknown collectors
    const fallbackName = extractedName || rawLabel?.trim() || 'Unknown Collector';
    const fallbackKey = actorId
      ? `id:${actorId}`
      : emailNorm
      ? `email:${emailNorm}`
      : `name:${normalizeTextKey(fallbackName) || 'unknown'}`;

    const existingDyn = identities.find((it) => it.collectorKey === fallbackKey);
    if (existingDyn) return existingDyn;

    const dyn: CollectorIdentity = {
      collectorKey: fallbackKey,
      displayName: fallbackName,
      displayNameBn: fallbackName,
      role: actorRole || 'accountant',
      email: actorEmail,
      staffId: actorId,
    };
    registerIdentity(dyn);
    if (actorId) byId.set(actorId, dyn);
    return dyn;
  };

  const resolveUserKey = (user: UserProfile | null | undefined): string => {
    if (!user) return '';
    const matched = resolveUserMatch(user);
    if (matched) return matched.collectorKey;
    return resolve({
      actorId: user.linkedStaffId || user.id,
      actorEmail: user.email,
      actorRole: user.role,
      rawLabel: user.name || user.nameBn,
    }).collectorKey;
  };

  return { identities, resolve, resolveUserKey };
};

export const normalizeCollectorTransactions = (
  payments: FeePayment[],
  incomeVouchers: IncomeVoucher[],
  staffList: Staff[],
  currentUser?: UserProfile | null,
  expenses: Expense[] = []
): {
  transactions: CollectorTransaction[];
  directory: CollectorDirectory;
} => {
  const directory = buildCollectorDirectory(staffList, currentUser);
  const transactions: CollectorTransaction[] = [];

  payments.forEach((p) => {
    const identity = directory.resolve({
      actorId: p.collectedById,
      actorEmail: p.collectedByEmail,
      actorRole: p.collectedByRole,
      rawLabel: p.collectedBy,
    });
    transactions.push({
      id: p.id,
      source: 'fee_receipt',
      direction: 'income',
      refNo: p.receiptNo,
      date: normalizeRecordDate(p.paidDate || p.paymentDate) || p.paidDate || '',
      partyName: p.studentName,
      subtitle: `${p.className}${p.roll ? ` • Roll ${p.roll}` : ''}`,
      paymentMethod: p.paymentMethod || 'Cash',
      transactionId: p.transactionId,
      amount: Number(p.amount) || 0,
      collectorKey: identity.collectorKey,
      collectorName: identity.displayName,
      collectorNameBn: identity.displayNameBn,
      collectorRole: identity.role,
      rawCollectedBy: p.collectedBy || identity.displayName,
      notes: p.notes,
    });
  });

  incomeVouchers.forEach((v) => {
    const identity = directory.resolve({
      actorId: v.receivedById,
      actorEmail: v.receivedByEmail,
      actorRole: v.receivedByRole,
      rawLabel: v.receivedBy,
    });
    transactions.push({
      id: v.id,
      source: 'income_voucher',
      direction: 'income',
      refNo: v.voucherNo,
      date: normalizeRecordDate(v.date) || v.date || '',
      partyName: v.receivedFrom || 'Walk-in',
      subtitle: v.title || v.category,
      paymentMethod: v.paymentMethod || 'Cash',
      transactionId: v.transactionId,
      amount: Number(v.amount) || 0,
      collectorKey: identity.collectorKey,
      collectorName: identity.displayName,
      collectorNameBn: identity.displayNameBn,
      collectorRole: identity.role,
      rawCollectedBy: v.receivedBy || identity.displayName,
      notes: v.notes,
    });
  });

  expenses.forEach((e) => {
    const identity = directory.resolve({
      actorId: e.approvedById,
      actorEmail: e.approvedByEmail,
      actorRole: e.approvedByRole,
      rawLabel: e.approvedBy,
    });
    transactions.push({
      id: e.id,
      source: 'expense_voucher',
      direction: 'expense',
      refNo: e.voucherNo,
      date: normalizeRecordDate(e.date) || e.date || '',
      partyName: e.paidTo || 'Vendor / Staff',
      subtitle: e.title || e.category,
      paymentMethod: e.paymentMethod || 'Cash',
      transactionId: e.referenceNo,
      amount: Number(e.amount) || 0,
      collectorKey: identity.collectorKey,
      collectorName: identity.displayName,
      collectorNameBn: identity.displayNameBn,
      collectorRole: identity.role,
      rawCollectedBy: e.approvedBy || identity.displayName,
      notes: e.notes,
    });
  });

  transactions.sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return db.localeCompare(da);
    return b.refNo.localeCompare(a.refNo);
  });

  return { transactions, directory };
};

export interface CollectorFilterOptions {
  period: DateFilterPeriod;
  customStart?: string;
  customEnd?: string;
  methodFilter?: string;
  sourceFilter?: 'all' | 'income_all' | CollectorTransactionSource;
  collectorKey?: string;
  search?: string;
  referenceDate?: Date;
}

export const filterCollectorTransactions = (
  transactions: CollectorTransaction[],
  options: CollectorFilterOptions
): CollectorTransaction[] => {
  const q = (options.search || '').trim().toLowerCase();
  return transactions.filter((tx) => {
    if (
      !isDateInPeriod(
        tx.date,
        options.period,
        options.customStart,
        options.customEnd,
        options.referenceDate
      )
    ) {
      return false;
    }
    if (options.sourceFilter && options.sourceFilter !== 'all') {
      if (options.sourceFilter === 'income_all') {
        if (tx.direction !== 'income') return false;
      } else if (tx.source !== options.sourceFilter) {
        return false;
      }
    }
    if (options.methodFilter && options.methodFilter !== 'all' && tx.paymentMethod !== options.methodFilter) {
      return false;
    }
    if (options.collectorKey && options.collectorKey !== 'all' && tx.collectorKey !== options.collectorKey) {
      return false;
    }
    if (q) {
      return (
        tx.refNo.toLowerCase().includes(q) ||
        tx.partyName.toLowerCase().includes(q) ||
        tx.subtitle.toLowerCase().includes(q) ||
        tx.collectorName.toLowerCase().includes(q) ||
        tx.collectorNameBn.toLowerCase().includes(q) ||
        (tx.transactionId || '').toLowerCase().includes(q)
      );
    }
    return true;
  });
};

export const computeIncomeExpenseStats = (
  transactions: CollectorTransaction[]
): IncomeExpenseStats => {
  const feeTxs = transactions.filter((t) => t.source === 'fee_receipt');
  const incomeVoucherTxs = transactions.filter((t) => t.source === 'income_voucher');
  const incomeTxs = transactions.filter((t) => t.direction === 'income');
  const expenseTxs = transactions.filter((t) => t.direction === 'expense');

  const feeTotal = feeTxs.reduce((s, t) => s + t.amount, 0);
  const incomeVoucherTotal = incomeVoucherTxs.reduce((s, t) => s + t.amount, 0);
  const incomeTotal = feeTotal + incomeVoucherTotal;
  const expenseTotal = expenseTxs.reduce((s, t) => s + t.amount, 0);

  const incomeMethodSummary = summarizeByPaymentMethod(incomeTxs);
  const expenseMethodSummary = summarizeByPaymentMethod(expenseTxs);

  const cashIncome = incomeMethodSummary.Cash;
  const digitalIncome =
    incomeMethodSummary.bKash +
    incomeMethodSummary.Nagad +
    incomeMethodSummary.Rocket +
    incomeMethodSummary.Bank +
    incomeMethodSummary.Other;

  const cashExpense = expenseMethodSummary.Cash;
  const digitalExpense =
    expenseMethodSummary.bKash +
    expenseMethodSummary.Nagad +
    expenseMethodSummary.Rocket +
    expenseMethodSummary.Bank +
    expenseMethodSummary.Other;

  return {
    incomeTotal,
    feeTotal,
    incomeVoucherTotal,
    incomeCount: incomeTxs.length,
    cashIncome,
    digitalIncome,
    expenseTotal,
    expenseCount: expenseTxs.length,
    cashExpense,
    digitalExpense,
    netBalance: incomeTotal - expenseTotal,
    netCashInHand: cashIncome - cashExpense,
    netDigitalBalance: digitalIncome - digitalExpense,
    incomeMethodSummary,
    expenseMethodSummary,
  };
};

export const summarizeByCollector = (
  transactions: CollectorTransaction[],
  identities: CollectorIdentity[],
  currentUserKey: string,
  includeZeroAccountants = true
): CollectorSummary[] => {
  const bucketMap = new Map<
    string,
    {
      identity: CollectorIdentity;
      txs: CollectorTransaction[];
    }
  >();

  if (includeZeroAccountants) {
    identities.forEach((id) => {
      if (id.role === 'accountant' || id.collectorKey === currentUserKey) {
        bucketMap.set(id.collectorKey, { identity: id, txs: [] });
      }
    });
  }

  transactions.forEach((tx) => {
    const existing = bucketMap.get(tx.collectorKey);
    if (existing) {
      existing.txs.push(tx);
    } else {
      const id = identities.find((it) => it.collectorKey === tx.collectorKey) || {
        collectorKey: tx.collectorKey,
        displayName: tx.collectorName,
        displayNameBn: tx.collectorNameBn,
        role: tx.collectorRole,
      };
      bucketMap.set(tx.collectorKey, { identity: id, txs: [tx] });
    }
  });

  const grandIncomeTotal = transactions
    .filter((tx) => tx.direction === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const summaries: CollectorSummary[] = Array.from(bucketMap.values()).map(({ identity, txs }) => {
    const feeTxs = txs.filter((t) => t.source === 'fee_receipt');
    const voucherTxs = txs.filter((t) => t.source === 'income_voucher');
    const expenseTxs = txs.filter((t) => t.source === 'expense_voucher');
    const stats = computeIncomeExpenseStats(txs);
    const roleLabels = getCollectorRoleLabels(identity.role);
    return {
      collectorKey: identity.collectorKey,
      displayName: identity.displayName,
      displayNameBn: identity.displayNameBn,
      role: identity.role,
      roleLabelBn: roleLabels.bn,
      roleLabelEn: roleLabels.en,
      email: identity.email,
      feeCount: feeTxs.length,
      feeAmount: stats.feeTotal,
      voucherCount: voucherTxs.length,
      voucherAmount: stats.incomeVoucherTotal,
      expenseCount: expenseTxs.length,
      expenseAmount: stats.expenseTotal,
      totalCount: stats.incomeCount,
      txCount: txs.length,
      totalAmount: stats.incomeTotal,
      cashAmount: stats.cashIncome,
      cashExpenseAmount: stats.cashExpense,
      mfsAndBankAmount: stats.digitalIncome,
      mfsAndBankExpenseAmount: stats.digitalExpense,
      netCashInHand: stats.netCashInHand,
      netBalance: stats.netBalance,
      methodSummary: stats.incomeMethodSummary,
      expenseMethodSummary: stats.expenseMethodSummary,
      sharePercent: grandIncomeTotal > 0 ? Math.round((stats.incomeTotal / grandIncomeTotal) * 100) : 0,
      isCurrentUser: identity.collectorKey === currentUserKey,
    };
  });

  summaries.sort((a, b) => {
    const activityA = a.totalAmount + a.expenseAmount;
    const activityB = b.totalAmount + b.expenseAmount;
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
    if (activityB !== activityA) return activityB - activityA;
    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return summaries;
};
