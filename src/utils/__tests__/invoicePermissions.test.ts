import { describe, it, expect, beforeEach } from 'vitest';
import { canEditOrDeleteInvoice, canEditOrDeleteFinanceRecord } from '../permissions';
import { Expense, FeeInvoice, FeePayment } from '../../types';

const mockLocalMap: Record<string, string> = {};
const mockSessionMap: Record<string, string> = {};

const createMockStorage = (map: Record<string, string>) => ({
  getItem: (k: string) => (k in map ? map[k] : null),
  setItem: (k: string, v: string) => {
    map[k] = String(v);
  },
  removeItem: (k: string) => {
    delete map[k];
  },
  clear: () => {
    Object.keys(map).forEach((k) => delete map[k]);
  },
  key: (i: number) => Object.keys(map)[i] ?? null,
  get length() {
    return Object.keys(map).length;
  },
});

Object.defineProperty(globalThis, 'localStorage', {
  value: createMockStorage(mockLocalMap),
  configurable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: createMockStorage(mockSessionMap),
  configurable: true,
});

import { StorageService } from '../../services/storage';

const makeInvoice = (overrides: Partial<FeeInvoice> = {}): FeeInvoice => ({
  id: 'inv_test_1',
  invoiceNo: 'INV-2026-10001',
  studentId: 'std_1',
  studentNameEn: 'Test Student',
  studentNameBn: 'টেস্ট শিক্ষার্থী',
  className: 'Class 10',
  section: 'A',
  roll: '1',
  session: '2026',
  feeType: 'Monthly Tuition Fee',
  month: 'November 2026',
  amount: 1500,
  discount: 0,
  netAmount: 1500,
  paidAmount: 0,
  dueAmount: 1500,
  dueDate: '2026-11-17',
  status: 'Unpaid',
  ...overrides,
});

const makePayment = (overrides: Partial<FeePayment> = {}): FeePayment => ({
  id: 'pay_test_1',
  receiptNo: 'REC-2026-20001',
  invoiceId: 'inv_test_1',
  studentId: 'std_1',
  studentName: 'Test Student',
  className: 'Class 10 (A)',
  roll: '1',
  amount: 1000,
  paidDate: '2026-11-17',
  paymentMethod: 'Cash',
  collectedBy: 'Accountant',
  ...overrides,
});

const makeExpense = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'exp_test_1',
  voucherNo: 'VOUCH-2026-586',
  category: 'Electricity & Utilities',
  title: 'Electricity Bill',
  amount: 555,
  date: '2026-11-17',
  paidTo: 'DESCO',
  paymentMethod: 'Cash',
  approvedBy: 'Accountant',
  ...overrides,
});

describe('Finance Edit/Delete Role Permissions (Invoices, Receipts, Expenses, Cashbook)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('allows only super_admin and master_admin to edit or delete financial records', () => {
    expect(canEditOrDeleteInvoice('super_admin')).toBe(true);
    expect(canEditOrDeleteInvoice('master_admin')).toBe(true);
    expect(canEditOrDeleteFinanceRecord('super_admin')).toBe(true);
    expect(canEditOrDeleteFinanceRecord('master_admin')).toBe(true);

    for (const restricted of [
      'accountant',
      'admin',
      'teacher',
      'student',
      'guardian',
      'receptionist',
      'librarian',
      'gatekeeper',
      null,
      undefined,
    ] as const) {
      expect(canEditOrDeleteInvoice(restricted)).toBe(false);
      expect(canEditOrDeleteFinanceRecord(restricted)).toBe(false);
    }
  });

  it('prevents accountant from updating or deleting an existing invoice in StorageService', () => {
    const inv = makeInvoice();
    StorageService.addInvoice(inv);

    const editedByAccountant: FeeInvoice = {
      ...inv,
      netAmount: 500,
      dueAmount: 500,
      discount: 1000,
    };

    expect(StorageService.updateInvoice(editedByAccountant, 'accountant')).toBe(false);
    expect(StorageService.deleteInvoice(inv.id, 'accountant')).toBe(false);
    expect(StorageService.updateInvoice(editedByAccountant)).toBe(false);
    expect(StorageService.deleteInvoice(inv.id)).toBe(false);

    const stored = StorageService.getInvoices().find((i) => i.id === inv.id);
    expect(stored).toBeDefined();
    expect(stored?.netAmount).toBe(1500);
    expect(stored?.discount).toBe(0);
  });

  it('allows super_admin to update and delete an existing invoice in StorageService', () => {
    const inv = makeInvoice();
    StorageService.addInvoice(inv);

    const editedBySuperAdmin: FeeInvoice = {
      ...inv,
      netAmount: 1200,
      dueAmount: 1200,
      discount: 300,
    };

    expect(StorageService.updateInvoice(editedBySuperAdmin, 'super_admin')).toBe(true);
    const updated = StorageService.getInvoices().find((i) => i.id === inv.id);
    expect(updated?.netAmount).toBe(1200);
    expect(updated?.discount).toBe(300);

    expect(StorageService.deleteInvoice(inv.id, 'super_admin')).toBe(true);
    const afterDelete = StorageService.getInvoices().find((i) => i.id === inv.id);
    expect(afterDelete).toBeUndefined();
  });

  it('prevents accountant from editing or deleting receipts (FeePayment), while allowing super_admin and normal collection', () => {
    const inv = makeInvoice({ id: 'inv_collect_1', invoiceNo: 'INV-2026-20001' });
    StorageService.addInvoice(inv);

    const payment = makePayment({ invoiceId: inv.id, amount: 1000 });
    StorageService.addPayment(payment);

    const afterPay = StorageService.getInvoices().find((i) => i.id === inv.id);
    expect(afterPay?.paidAmount).toBe(1000);
    expect(afterPay?.dueAmount).toBe(500);
    expect(afterPay?.status).toBe('Partial');

    // Accountant cannot edit or delete receipt
    expect(StorageService.updatePayment({ ...payment, amount: 200 }, 'accountant')).toBe(false);
    expect(StorageService.deletePayment(payment.id, 'accountant')).toBe(false);
    expect(StorageService.getPayments().find((p) => p.id === payment.id)?.amount).toBe(1000);

    // Super Admin can edit and delete receipt
    expect(StorageService.updatePayment({ ...payment, amount: 1200 }, 'super_admin')).toBe(true);
    expect(StorageService.getPayments().find((p) => p.id === payment.id)?.amount).toBe(1200);
    expect(StorageService.getInvoices().find((i) => i.id === inv.id)?.paidAmount).toBe(1200);

    expect(StorageService.deletePayment(payment.id, 'super_admin')).toBe(true);
    const afterDeletePay = StorageService.getInvoices().find((i) => i.id === inv.id);
    expect(afterDeletePay?.paidAmount).toBe(0);
    expect(afterDeletePay?.dueAmount).toBe(1500);
    expect(afterDeletePay?.status).toBe('Unpaid');
  });

  it('prevents accountant from editing or deleting expense vouchers, while allowing creation and super_admin edit/delete', () => {
    const exp = makeExpense();
    StorageService.addExpense(exp);

    expect(StorageService.updateExpense({ ...exp, amount: 100 }, 'accountant')).toBe(false);
    expect(StorageService.deleteExpense(exp.id, 'accountant')).toBe(false);
    expect(StorageService.getExpenses().find((e) => e.id === exp.id)?.amount).toBe(555);

    expect(StorageService.updateExpense({ ...exp, amount: 750 }, 'super_admin')).toBe(true);
    expect(StorageService.getExpenses().find((e) => e.id === exp.id)?.amount).toBe(750);

    expect(StorageService.deleteExpense(exp.id, 'super_admin')).toBe(true);
    expect(StorageService.getExpenses().find((e) => e.id === exp.id)).toBeUndefined();
  });

  it('persists multi-item expense vouchers and preserves accountant audit lock', () => {
    const multiVoucherNo = StorageService.generateNextExpenseVoucherNo('2026-11-19');
    expect(multiVoucherNo.startsWith('VOUCH-2026-')).toBe(true);

    const multiExp = makeExpense({
      id: 'exp_multi_1',
      voucherNo: multiVoucherNo,
      title: 'মার্কার পেন ×5, A4 কাগজ ×2',
      amount: 1160,
      items: [
        { id: 'li_1', description: 'মার্কার পেন', category: 'Printing & Stationery', quantity: 5, unitPrice: 40, amount: 200 },
        { id: 'li_2', description: 'A4 কাগজ', category: 'Printing & Stationery', quantity: 2, unitPrice: 480, amount: 960 },
      ],
    });
    StorageService.addExpense(multiExp);

    const saved = StorageService.getExpenses().find((e) => e.id === 'exp_multi_1');
    expect(saved?.items).toHaveLength(2);
    expect(saved?.amount).toBe(1160);

    // Accountant cannot edit or delete
    expect(StorageService.updateExpense({ ...multiExp, amount: 500 }, 'accountant')).toBe(false);
    expect(StorageService.deleteExpense('exp_multi_1', 'accountant')).toBe(false);

    // Super Admin can edit multi-item expense
    expect(StorageService.updateExpense({ ...multiExp, amount: 1200 }, 'super_admin')).toBe(true);
    expect(StorageService.getExpenses().find((e) => e.id === 'exp_multi_1')?.amount).toBe(1200);
  });

  it('tracks catalog stock on income voucher sales and enforces Super Admin-only edit/delete', () => {
    StorageService.addSaleItem({
      id: 'sale_khata_1',
      nameBn: 'স্কুল খাতা (৮০ পাতা)',
      nameEn: 'School Notebook',
      category: 'Stationery',
      unitPrice: 35,
      unit: 'টি',
      stockQty: 50,
      trackStock: true,
      isActive: true,
    });
    StorageService.addSaleItem({
      id: 'sale_singara_1',
      nameBn: 'গরম সিঙ্গারা',
      nameEn: 'Singara',
      category: 'Canteen',
      unitPrice: 15,
      unit: 'পিস',
      stockQty: 100,
      trackStock: false,
      isActive: true,
    });

    const voucherNo1 = StorageService.generateNextIncomeVoucherNo('2026-11-18');
    expect(voucherNo1).toBe('INC-2026-001');

    StorageService.addIncomeVoucher({
      id: 'inc_test_1',
      voucherNo: voucherNo1,
      category: 'Mixed',
      title: 'খাতা ও সিঙ্গারা বিক্রয়',
      items: [
        {
          id: 'l1',
          saleItemId: 'sale_khata_1',
          name: 'স্কুল খাতা (৮০ পাতা)',
          category: 'Stationery',
          quantity: 4,
          unitPrice: 35,
          total: 140,
        },
        {
          id: 'l2',
          saleItemId: 'sale_singara_1',
          name: 'গরম সিঙ্গারা',
          category: 'Canteen',
          quantity: 6,
          unitPrice: 15,
          total: 90,
        },
      ],
      subtotal: 230,
      discount: 10,
      amount: 220,
      date: '2026-11-18',
      receivedFrom: 'Rahim (Class 8)',
      paymentMethod: 'Cash',
      receivedBy: 'Accountant',
    });

    const khataAfterSale = StorageService.getSaleItems().find((i) => i.id === 'sale_khata_1');
    const singaraAfterSale = StorageService.getSaleItems().find((i) => i.id === 'sale_singara_1');
    expect(khataAfterSale?.stockQty).toBe(46);
    expect(singaraAfterSale?.stockQty).toBe(100);
    expect(StorageService.generateNextIncomeVoucherNo('2026-11-18')).toBe('INC-2026-002');

    const storedVoucher = StorageService.getIncomeVouchers().find((v) => v.id === 'inc_test_1')!;
    expect(storedVoucher.amount).toBe(220);

    // Accountant cannot edit or delete existing income voucher
    expect(
      StorageService.updateIncomeVoucher({ ...storedVoucher, amount: 100 }, 'accountant')
    ).toBe(false);
    expect(StorageService.deleteIncomeVoucher(storedVoucher.id, 'accountant')).toBe(false);
    expect(StorageService.getIncomeVouchers().find((v) => v.id === 'inc_test_1')?.amount).toBe(220);
    expect(StorageService.getSaleItems().find((i) => i.id === 'sale_khata_1')?.stockQty).toBe(46);

    // Super Admin can edit (changing qty from 4 to 2 restores 2 notebooks -> 48)
    expect(
      StorageService.updateIncomeVoucher(
        {
          ...storedVoucher,
          items: [
            { ...storedVoucher.items[0], quantity: 2, total: 70 },
            storedVoucher.items[1],
          ],
          subtotal: 160,
          discount: 0,
          amount: 160,
        },
        'super_admin'
      )
    ).toBe(true);
    expect(StorageService.getSaleItems().find((i) => i.id === 'sale_khata_1')?.stockQty).toBe(48);
    expect(StorageService.getIncomeVouchers().find((v) => v.id === 'inc_test_1')?.amount).toBe(160);

    // Super Admin delete restores full stock back to 50
    expect(StorageService.deleteIncomeVoucher('inc_test_1', 'super_admin')).toBe(true);
    expect(StorageService.getIncomeVouchers().find((v) => v.id === 'inc_test_1')).toBeUndefined();
    expect(StorageService.getSaleItems().find((i) => i.id === 'sale_khata_1')?.stockQty).toBe(50);
  });
});
