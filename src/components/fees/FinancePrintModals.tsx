import React from 'react';
import { Printer, X, Download, Receipt, FileText } from 'lucide-react';
import { Expense, FeePayment, IncomeVoucher, SchoolProfile } from '../../types';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';
import { buildPrincipalSignatureHtml } from '../../utils/signatureHelper';
import {
  normalizeExpenseItems,
  summarizeByPaymentMethod,
} from '../../utils/financeFilters';
import {
  CollectorSummary,
  CollectorTransaction,
  computeIncomeExpenseStats,
} from '../../utils/collectorReports';

const escapeHtml = (value: string | number | undefined | null): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const downloadBlob = (content: string, mimeType: string, filename: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

interface CommonPrintProps {
  school: SchoolProfile;
  language: 'bn' | 'en';
  formatTaka: (amount: number) => string;
  toBnNumber: (num: number | string) => string;
  formatDate: (dateStr: string) => string;
  amountInWords: (num: number) => string;
}

/* ============================================================================
 * 1. SINGLE MULTI-ITEM EXPENSE VOUCHER PRINT MODAL
 * ========================================================================== */
interface ExpenseVoucherPrintModalProps extends CommonPrintProps {
  expense: Expense;
  onClose: () => void;
}

export const ExpenseVoucherPrintModal: React.FC<ExpenseVoucherPrintModalProps> = ({
  expense,
  school,
  language,
  formatTaka,
  toBnNumber,
  formatDate,
  amountInWords,
  onClose,
}) => {
  const items = normalizeExpenseItems(expense);

  const handleDownloadHtml = () => {
    const rowsHtml = items
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td><strong>${escapeHtml(it.description)}</strong></td>
        <td>${escapeHtml(it.category || expense.category)}</td>
        <td style="text-align:center;">${it.quantity}${it.unit ? ' ' + escapeHtml(it.unit) : ''}</td>
        <td style="text-align:right;">৳${it.unitPrice.toLocaleString()}</td>
        <td style="text-align:right;font-weight:700;">৳${it.amount.toLocaleString()}</td>
      </tr>`
      )
      .join('');

    const htmlDoc = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<title>Expense Voucher ${escapeHtml(expense.voucherNo)} - ${escapeHtml(school.nameEn)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; padding: 18px; }
  .sheet { border: 2px dashed #64748b; padding: 20px; border-radius: 8px; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header h2 { margin: 2px 0; font-size: 13px; color: #334155; }
  .header p { margin: 2px 0; font-size: 11px; color: #475569; }
  .badge { background: #be123c; color: #fff; padding: 4px 10px; font-size: 10px; font-weight: 800; border-radius: 4px; display: inline-block; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; font-size: 11px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 10px; }
  .summary { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  .words { flex: 1; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; border-radius: 6px; font-size: 11px; }
  .total { background: #fff1f2; border: 1px solid #fecdd3; padding: 10px 14px; border-radius: 6px; font-size: 13px; font-weight: 800; color: #be123c; }
  .sigs { margin-top: 42px; display: flex; justify-content: space-between; font-size: 11px; text-align: center; }
  .sig { border-top: 1px solid #334155; padding-top: 4px; min-width: 140px; font-weight: 600; }
  .print-bar { text-align: right; margin-bottom: 12px; }
  @media print { .print-bar { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<div class="print-bar"><button onclick="window.print()" style="padding:8px 16px;background:#be123c;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Print / Save PDF</button></div>
<div class="sheet">
  <div class="header">
    <div>
      <h1>${escapeHtml(school.nameBn)}</h1>
      <h2>${escapeHtml(school.nameEn)}</h2>
      <p>${escapeHtml(school.addressBn || school.addressEn)} • EIIN: ${escapeHtml(school.eiin)} • ফোন: ${escapeHtml(school.phone)}</p>
    </div>
    <div style="text-align:right;">
      <span class="badge">EXPENSE VOUCHER (ব্যয় ভাউচার)</span>
      <div style="font-weight:800;font-family:monospace;margin-top:6px;">${escapeHtml(expense.voucherNo)}</div>
      <div style="font-size:11px;color:#475569;">Date: ${escapeHtml(formatDate(expense.date))}</div>
    </div>
  </div>
  <div class="meta">
    <div><span style="color:#64748b;display:block;font-size:10px;">প্রাপক (Paid To):</span><strong>${escapeHtml(expense.paidTo || '—')}</strong></div>
    <div><span style="color:#64748b;display:block;font-size:10px;">পেমেন্ট মাধ্যম:</span><strong>${escapeHtml(expense.paymentMethod)}${expense.referenceNo ? ` (${escapeHtml(expense.referenceNo)})` : ''}</strong></div>
    <div><span style="color:#64748b;display:block;font-size:10px;">অনুমোদনকারী (Approved By):</span><strong>${escapeHtml(expense.approvedBy)}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:center;width:36px;">SL</th>
        <th>আইটেম / ব্যয়ের বিবরণ</th>
        <th>ক্যাটাগরি</th>
        <th style="text-align:center;">পরিমাণ</th>
        <th style="text-align:right;">দর (৳)</th>
        <th style="text-align:right;">মোট (৳)</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="summary">
    <div class="words"><div style="font-size:10px;color:#475569;font-weight:700;">AMOUNT IN WORDS (কথায়):</div><strong>${escapeHtml(amountInWords(expense.amount))}</strong></div>
    <div class="total">মোট ব্যয়: ৳${expense.amount.toLocaleString()}</div>
  </div>
  ${expense.notes ? `<p style="font-size:11px;color:#475569;font-style:italic;margin-top:10px;">Note: ${escapeHtml(expense.notes)}</p>` : ''}
  <div class="sigs">
    <div class="sig">প্রাপকের স্বাক্ষর (Receiver)</div>
    <div class="sig">হিসাবরক্ষক (${escapeHtml(expense.approvedBy)})</div>
    <div class="sig">${buildPrincipalSignatureHtml(school)}অধ্যক্ষ / প্রধান শিক্ষক</div>
  </div>
</div>
</body>
</html>`;
    downloadBlob(htmlDoc, 'text/html;charset=utf-8;', `Expense_Voucher_${expense.voucherNo}.html`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-5 sm:p-6 my-4 max-h-[94vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-none print:max-w-none print:p-2 print:my-0">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-rose-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              {language === 'bn' ? 'অফিসিয়াল ব্যয় ভাউচার প্রিন্ট' : 'Official Expense Voucher Memo'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{language === 'bn' ? 'শীট (.html)' : 'Save (.html)'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Voucher Sheet */}
        <div className="mt-4 p-5 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/30 print:mt-0 print:border-slate-500 print:rounded-none text-xs text-slate-900">
          <div className="flex items-start justify-between border-b border-slate-300 pb-3 gap-3">
            <div className="flex items-center gap-3">
              <img
                src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                alt="School Logo"
                className="w-12 h-12 object-contain rounded-lg p-0.5 bg-white border border-slate-200 print:border-none"
              />
              <div>
                <h2 className="text-base font-extrabold text-slate-900">{school.nameBn}</h2>
                <h3 className="text-xs font-bold text-slate-700">{school.nameEn}</h3>
                <p className="text-[10px] text-slate-600">
                  {school.addressBn} • EIIN: {school.eiin} • ফোন: {school.phone}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block px-2.5 py-0.5 bg-rose-700 text-white font-extrabold text-[10px] uppercase rounded-md tracking-wider print:bg-black">
                EXPENSE VOUCHER (ব্যয় ভাউচার)
              </span>
              <div className="text-xs font-bold text-rose-800 mt-1.5 font-mono">
                {expense.voucherNo}
              </div>
              <div className="text-[10px] text-slate-600">Date: {formatDate(expense.date)}</div>
              {expense.authVerifiedAt && (
                <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[9px] font-bold text-emerald-700">
                  ✓ PIN Verified
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-3 py-2 px-3 bg-white border border-slate-200 rounded-xl text-[11px]">
            <div>
              <span className="text-slate-500 block text-[10px]">
                {language === 'bn' ? 'প্রাপক (Paid To):' : 'Paid To:'}
              </span>
              <strong className="text-slate-900">{expense.paidTo || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">
                {language === 'bn' ? 'পেমেন্ট মাধ্যম:' : 'Payment Method:'}
              </span>
              <strong className="text-rose-700">
                {expense.paymentMethod}
                {expense.referenceNo ? ` (${expense.referenceNo})` : ''}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">
                {language === 'bn' ? 'অনুমোদনকারী:' : 'Approved By:'}
              </span>
              <strong className="text-slate-800">{expense.approvedBy}</strong>
            </div>
          </div>

          <div className="my-2 border border-slate-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                  <th className="py-1.5 px-3 w-8 text-center">SL</th>
                  <th className="py-1.5 px-3">{language === 'bn' ? 'আইটেম ও ব্যয়ের বিবরণ' : 'Item Description'}</th>
                  <th className="py-1.5 px-3">{language === 'bn' ? 'ক্যাটাগরি' : 'Category'}</th>
                  <th className="py-1.5 px-3 text-center">{language === 'bn' ? 'পরিমাণ' : 'Qty'}</th>
                  <th className="py-1.5 px-3 text-right">{language === 'bn' ? 'দর' : 'Rate'}</th>
                  <th className="py-1.5 px-3 text-right">{language === 'bn' ? 'মোট (৳)' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, idx) => (
                  <tr key={it.id || idx}>
                    <td className="py-1.5 px-3 text-center text-slate-400 font-mono text-[10px]">
                      {language === 'bn' ? toBnNumber(idx + 1) : idx + 1}
                    </td>
                    <td className="py-1.5 px-3 font-semibold text-slate-900">{it.description}</td>
                    <td className="py-1.5 px-3 text-slate-600">{it.category || expense.category}</td>
                    <td className="py-1.5 px-3 text-center font-bold tabular-nums">
                      {it.quantity}
                      {it.unit ? ` ${it.unit}` : ''}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{formatTaka(it.unitPrice)}</td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums">{formatTaka(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3 items-center">
            <div className="p-2.5 bg-slate-100/80 rounded-lg border border-slate-200 text-[11px]">
              <span className="font-bold text-slate-700 block text-[10px] uppercase">
                Amount in Words (কথায়):
              </span>
              <strong className="text-slate-900 font-serif">{amountInWords(expense.amount)}</strong>
            </div>

            <div className="p-2.5 bg-rose-50/80 border border-rose-200 rounded-lg flex items-center justify-between">
              <span className="font-bold text-rose-950 text-xs">
                {language === 'bn' ? `মোট ব্যয় (${toBnNumber(items.length)}টি আইটেম):` : `Total Expense (${items.length} items):`}
              </span>
              <span className="text-base font-extrabold text-rose-800 tabular-nums">
                {formatTaka(expense.amount)}
              </span>
            </div>
          </div>

          {expense.notes && (
            <p className="text-[11px] text-slate-600 mb-3 italic">Note: {expense.notes}</p>
          )}

          <div className="pt-8 grid grid-cols-3 gap-3 text-center text-[10px] text-slate-600 items-end">
            <div>
              <div className="w-32 mx-auto border-t border-slate-400 pt-1 font-semibold">
                {language === 'bn' ? 'প্রাপকের স্বাক্ষর' : 'Receiver Signature'}
              </div>
            </div>
            <div>
              <div className="w-36 mx-auto border-t border-slate-400 pt-1 font-semibold">
                {language === 'bn' ? 'হিসাবরক্ষক' : 'Accountant'} ({expense.approvedBy})
              </div>
            </div>
            <div className="flex flex-col items-center">
              <PrincipalSignatureDisplay school={school} />
              <div className="w-36 mx-auto border-t border-slate-400 pt-1 font-bold text-slate-800">
                {language === 'bn' ? 'প্রধান শিক্ষক / অধ্যক্ষ' : 'Principal / Head'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. COLLECTION REPORT PRINT MODAL (FEE RECEIPTS REGISTER)
 * ========================================================================== */
interface CollectionReportPrintModalProps extends CommonPrintProps {
  payments: FeePayment[];
  periodLabel: string;
  methodFilterLabel: string;
  onClose: () => void;
}

export const CollectionReportPrintModal: React.FC<CollectionReportPrintModalProps> = ({
  payments,
  periodLabel,
  methodFilterLabel,
  school,
  language,
  formatTaka,
  toBnNumber,
  formatDate,
  amountInWords,
  onClose,
}) => {
  const methodSummary = summarizeByPaymentMethod(payments);

  const handleDownloadCsv = () => {
    const headers = ['SL', 'Receipt No', 'Date', 'Student Name', 'Class', 'Roll', 'Method', 'TrxID / Note', 'Collected By', 'Amount'];
    const rows = payments.map((p, idx) =>
      [
        idx + 1,
        p.receiptNo,
        p.paidDate,
        p.studentName,
        p.className,
        p.roll,
        p.paymentMethod,
        p.transactionId || p.notes || '',
        p.collectedBy,
        p.amount,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    );
    downloadBlob('\uFEFF' + [headers.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8;', `Fee_Collection_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleDownloadHtml = () => {
    const rowsHtml = payments
      .map(
        (p, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-family:monospace;font-weight:700;color:#1d4ed8;">${escapeHtml(p.receiptNo)}</td>
        <td>${escapeHtml(formatDate(p.paidDate))}</td>
        <td><strong>${escapeHtml(p.studentName)}</strong><br/><span style="font-size:10px;color:#475569;">${escapeHtml(p.className)} • Roll ${escapeHtml(p.roll)}</span></td>
        <td>${escapeHtml(p.paymentMethod)}${p.transactionId ? `<br/><span style="font-size:10px;font-family:monospace;">${escapeHtml(p.transactionId)}</span>` : ''}</td>
        <td>${escapeHtml(p.notes || 'School Tuition Fee')}</td>
        <td style="text-align:right;font-weight:700;color:#047857;">৳${p.amount.toLocaleString()}</td>
      </tr>`
      )
      .join('');

    const htmlDoc = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<title>Fee Collection Report - ${escapeHtml(school.nameEn)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; padding: 16px; }
  .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header h2 { margin: 2px 0; font-size: 13px; color: #1e40af; }
  .header p { margin: 2px 0; font-size: 11px; color: #475569; }
  .badge { display: inline-block; margin-top: 6px; padding: 4px 12px; background: #047857; color: #fff; font-size: 11px; font-weight: 700; border-radius: 4px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
  .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
  .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; font-size: 11px; background: #fff; }
  .card span { display: block; color: #64748b; font-size: 10px; }
  .card strong { font-size: 13px; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 10px; }
  .total-row td { background: #ecfdf5; font-weight: 800; font-size: 12px; }
  .footer { margin-top: 36px; display: flex; justify-content: space-between; font-size: 11px; }
  .sig { border-top: 1px solid #334155; padding-top: 4px; min-width: 150px; text-align: center; font-weight: 600; }
  .print-bar { margin-bottom: 12px; text-align: right; }
  @media print { .print-bar { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<div class="print-bar"><button onclick="window.print()" style="padding:8px 16px;background:#047857;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Print / Save PDF</button></div>
<div class="header">
  <h1>${escapeHtml(school.nameBn)}</h1>
  <h2>${escapeHtml(school.nameEn)}</h2>
  <p>${escapeHtml(school.addressBn || school.addressEn)} • Phone: ${escapeHtml(school.phone)} • EIIN: ${escapeHtml(school.eiin)}</p>
  <div class="badge">FEE COLLECTION STATEMENT (ফি কালেকশন রিপোর্ট)</div>
</div>
<div class="meta">
  <span><strong>সময়কাল:</strong> ${escapeHtml(periodLabel)} • <strong>মাধ্যম:</strong> ${escapeHtml(methodFilterLabel)}</span>
  <span><strong>মোট রসিদ:</strong> ${payments.length}টি • <strong>মোট কালেকশন:</strong> ৳${methodSummary.total.toLocaleString()}</span>
</div>
<div class="cards">
  <div class="card"><span>Cash (নগদ)</span><strong>৳${methodSummary.Cash.toLocaleString()}</strong></div>
  <div class="card"><span>bKash (বিকাশ)</span><strong>৳${methodSummary.bKash.toLocaleString()}</strong></div>
  <div class="card"><span>Nagad (নগদ)</span><strong>৳${methodSummary.Nagad.toLocaleString()}</strong></div>
  <div class="card"><span>Rocket / Bank</span><strong>৳${(methodSummary.Rocket + methodSummary.Bank).toLocaleString()}</strong></div>
  <div class="card" style="background:#ecfdf5;"><span>সর্বমোট কালেকশন</span><strong style="color:#047857;">৳${methodSummary.total.toLocaleString()}</strong></div>
</div>
<table>
  <thead>
    <tr>
      <th style="text-align:center;width:32px;">SL</th>
      <th>Receipt No</th>
      <th>Date</th>
      <th>Student & Class</th>
      <th>Method / TrxID</th>
      <th>Details</th>
      <th style="text-align:right;">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
    <tr class="total-row">
      <td colspan="6" style="text-align:right;">TOTAL COLLECTION (${payments.length} Receipts) — ${escapeHtml(amountInWords(methodSummary.total))}:</td>
      <td style="text-align:right;color:#047857;">৳${methodSummary.total.toLocaleString()}</td>
    </tr>
  </tbody>
</table>
<div class="footer">
  <div class="sig">Accounts Officer</div>
  <div class="sig">${buildPrincipalSignatureHtml(school)}Head Teacher / Principal</div>
</div>
</body>
</html>`;
    downloadBlob(htmlDoc, 'text/html;charset=utf-8;', `Fee_Collection_Report_${new Date().toISOString().slice(0, 10)}.html`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-4 sm:p-8 text-xs my-4 sm:my-8 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:my-0 print:max-w-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-5 print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-600" />
              <span>{language === 'bn' ? 'ফি কালেকশন রিপোর্ট প্রিন্ট প্রিভিউ' : 'Fee Collection Report Print Preview'}</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{language === 'bn' ? 'প্রিন্ট শীট (.html)' : 'Save (.html)'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Body */}
        <div className="border border-slate-300 p-4 sm:p-6 rounded-xl bg-white space-y-4 print:border-none print:p-0">
          <div className="text-center border-b-2 border-slate-800 pb-3">
            <div className="flex items-center justify-center gap-3 mb-1">
              <img src={school.logoUrl || DEFAULT_SCHOOL_LOGO} alt="School Logo" className="w-12 h-12 object-contain" />
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">{school.nameBn}</h2>
                <h3 className="text-xs sm:text-sm font-bold text-blue-800">{school.nameEn}</h3>
              </div>
            </div>
            <p className="text-[11px] text-slate-600">
              {school.addressBn || school.addressEn} • Phone: {school.phone} • EIIN: {school.eiin}
            </p>
            <div className="inline-block mt-2 px-3 py-1 bg-emerald-700 text-white rounded font-bold uppercase text-[11px] tracking-wider print:bg-black">
              FEE COLLECTION REPORT (ফি কালেকশন স্টেটমেন্ট)
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px]">
            <div className="space-x-3">
              <span><strong>{language === 'bn' ? 'সময়কাল:' : 'Period:'}</strong> {periodLabel}</span>
              <span>•</span>
              <span><strong>{language === 'bn' ? 'মাধ্যম:' : 'Method:'}</strong> {methodFilterLabel}</span>
            </div>
            <div className="space-x-3 font-semibold text-slate-800">
              <span>{language === 'bn' ? `মোট রসিদ: ${toBnNumber(payments.length)}টি` : `Receipts: ${payments.length}`}</span>
              <span>•</span>
              <span className="text-emerald-700 font-extrabold">
                {language === 'bn' ? `মোট কালেকশন: ${formatTaka(methodSummary.total)}` : `Total: ${formatTaka(methodSummary.total)}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="p-2.5 border border-slate-200 rounded-lg bg-white">
              <span className="text-[10px] text-slate-500 block">Cash (নগদ)</span>
              <strong className="text-sm text-slate-900 tabular-nums">{formatTaka(methodSummary.Cash)}</strong>
            </div>
            <div className="p-2.5 border border-slate-200 rounded-lg bg-white">
              <span className="text-[10px] text-slate-500 block">bKash (বিকাশ)</span>
              <strong className="text-sm text-pink-700 tabular-nums">{formatTaka(methodSummary.bKash)}</strong>
            </div>
            <div className="p-2.5 border border-slate-200 rounded-lg bg-white">
              <span className="text-[10px] text-slate-500 block">Nagad (নগদ)</span>
              <strong className="text-sm text-orange-700 tabular-nums">{formatTaka(methodSummary.Nagad)}</strong>
            </div>
            <div className="p-2.5 border border-slate-200 rounded-lg bg-white">
              <span className="text-[10px] text-slate-500 block">Rocket / Bank</span>
              <strong className="text-sm text-blue-700 tabular-nums">{formatTaka(methodSummary.Rocket + methodSummary.Bank)}</strong>
            </div>
            <div className="p-2.5 border border-emerald-200 rounded-lg bg-emerald-50">
              <span className="text-[10px] text-emerald-800 font-bold block">সর্বমোট কালেকশন</span>
              <strong className="text-sm text-emerald-800 font-black tabular-nums">{formatTaka(methodSummary.total)}</strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold uppercase">
                  <th className="border border-slate-300 py-2 px-2.5 text-center w-10">SL</th>
                  <th className="border border-slate-300 py-2 px-2.5">Receipt No</th>
                  <th className="border border-slate-300 py-2 px-2.5">Date</th>
                  <th className="border border-slate-300 py-2 px-2.5">Student & Class</th>
                  <th className="border border-slate-300 py-2 px-2.5">Method / TrxID</th>
                  <th className="border border-slate-300 py-2 px-2.5">Details / Collector</th>
                  <th className="border border-slate-300 py-2 px-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-slate-300 py-6 text-center text-slate-500">
                      {language === 'bn' ? 'নির্বাচিত সময়কালে কোনো কালেকশন পাওয়া যায়নি।' : 'No collections found for selected period.'}
                    </td>
                  </tr>
                ) : (
                  payments.map((p, idx) => (
                    <tr key={p.id}>
                      <td className="border border-slate-300 py-1.5 px-2.5 text-center font-mono">
                        {language === 'bn' ? toBnNumber(idx + 1) : idx + 1}
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2.5 font-mono font-bold text-blue-700">{p.receiptNo}</td>
                      <td className="border border-slate-300 py-1.5 px-2.5 whitespace-nowrap">{formatDate(p.paidDate)}</td>
                      <td className="border border-slate-300 py-1.5 px-2.5">
                        <div className="font-bold text-slate-900">{p.studentName}</div>
                        <div className="text-[10px] text-slate-500">{p.className} • Roll {p.roll}</div>
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2.5">
                        <div className="font-semibold">{p.paymentMethod}</div>
                        {p.transactionId && <div className="text-[10px] font-mono text-slate-600">{p.transactionId}</div>}
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2.5 text-slate-600">
                        <div>{p.notes || 'School Fee'}</div>
                        <div className="text-[10px] text-slate-400">By: {p.collectedBy}</div>
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2.5 text-right font-extrabold text-emerald-700 tabular-nums">
                        {formatTaka(p.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {payments.length > 0 && (
                <tfoot>
                  <tr className="bg-emerald-50/70 font-extrabold text-slate-900">
                    <td colSpan={6} className="border border-slate-300 py-2 px-3 text-right">
                      {language === 'bn'
                        ? `সর্বমোট কালেকশন (${toBnNumber(payments.length)}টি রসিদ) — কথায়: ${amountInWords(methodSummary.total)}`
                        : `TOTAL COLLECTION (${payments.length} Receipts) — ${amountInWords(methodSummary.total)}`}
                    </td>
                    <td className="border border-slate-300 py-2 px-2.5 text-right text-emerald-800 text-sm tabular-nums">
                      {formatTaka(methodSummary.total)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="pt-10 flex items-end justify-between text-[11px] text-slate-700">
            <div className="text-center">
              <div className="border-t border-slate-400 pt-1 px-6 font-semibold">
                {language === 'bn' ? 'হিসাবরক্ষক' : 'Accounts Officer'}
              </div>
            </div>
            <div className="text-center">
              <PrincipalSignatureDisplay school={school} fallbackText="" heightClass="h-10" textClassName="font-serif italic font-bold text-xs text-slate-900 pb-0.5" />
              <div className="border-t border-slate-400 pt-1 px-6 font-semibold">
                {language === 'bn' ? 'প্রধান শিক্ষক / অধ্যক্ষ' : 'Principal / Head Teacher'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. CASHBOOK / INCOME-EXPENDITURE STATEMENT PRINT MODAL
 * ========================================================================== */
interface CashbookStatementPrintModalProps extends CommonPrintProps {
  payments: FeePayment[];
  incomeVouchers: IncomeVoucher[];
  expenses: Expense[];
  periodLabel: string;
  onClose: () => void;
}

export const CashbookStatementPrintModal: React.FC<CashbookStatementPrintModalProps> = ({
  payments,
  incomeVouchers,
  expenses,
  periodLabel,
  school,
  language,
  formatTaka,
  toBnNumber,
  formatDate,
  amountInWords,
  onClose,
}) => {
  const feeTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const voucherIncomeTotal = incomeVouchers.reduce((s, v) => s + (Number(v.amount) || 0), 0);
  const totalIncome = feeTotal + voucherIncomeTotal;
  const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netBalance = totalIncome - totalExpense;

  const handleDownloadCsv = () => {
    const headers = ['Type', 'Ref / Voucher No', 'Date', 'Title / Party', 'Items Breakdown', 'Method', 'Income (+)', 'Expense (-)'];
    const incomeRows = [
      ...incomeVouchers.map((v) => [
        'Income Voucher',
        v.voucherNo,
        v.date,
        `${v.title} (${v.receivedFrom})`,
        (v.items || []).map((i) => `${i.name} x${i.quantity}`).join('; '),
        v.paymentMethod,
        v.amount,
        0,
      ]),
      ...payments.map((p) => [
        'Fee Collection',
        p.receiptNo,
        p.paidDate,
        `${p.studentName} (${p.className} Roll ${p.roll})`,
        p.notes || 'School Fee',
        p.paymentMethod,
        p.amount,
        0,
      ]),
    ];
    const expenseRows = expenses.map((e) => [
      'Expense Voucher',
      e.voucherNo,
      e.date,
      `${e.title} (${e.paidTo})`,
      normalizeExpenseItems(e).map((i) => `${i.description} x${i.quantity}=${i.amount}`).join('; '),
      e.paymentMethod,
      0,
      e.amount,
    ]);
    const csvRows = [...incomeRows, ...expenseRows].map((r) =>
      r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    );
    downloadBlob('\uFEFF' + [headers.join(','), ...csvRows].join('\n'), 'text/csv;charset=utf-8;', `Income_Expense_Statement_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleDownloadHtml = () => {
    const incomeRowsHtml = [
      ...incomeVouchers.map(
        (v) => `<tr><td style="font-family:monospace;">${escapeHtml(v.voucherNo)}</td><td>${escapeHtml(formatDate(v.date))}</td><td><strong>${escapeHtml(v.title)}</strong><br/><span style="font-size:10px;color:#475569;">${escapeHtml(v.receivedFrom)}</span></td><td>${escapeHtml(v.paymentMethod)}</td><td style="text-align:right;font-weight:700;color:#047857;">৳${v.amount.toLocaleString()}</td></tr>`
      ),
      ...payments.map(
        (p) => `<tr><td style="font-family:monospace;">${escapeHtml(p.receiptNo)}</td><td>${escapeHtml(formatDate(p.paidDate))}</td><td><strong>${escapeHtml(p.studentName)}</strong><br/><span style="font-size:10px;color:#475569;">${escapeHtml(p.className)} • Roll ${escapeHtml(p.roll)}</span></td><td>${escapeHtml(p.paymentMethod)}</td><td style="text-align:right;font-weight:700;color:#047857;">৳${p.amount.toLocaleString()}</td></tr>`
      ),
    ].join('');

    const expenseRowsHtml = expenses
      .map((e) => {
        const items = normalizeExpenseItems(e);
        const itemDesc = items.length > 1 ? `<ul style="margin:2px 0 0 14px;padding:0;font-size:10px;color:#475569;">${items.map((it) => `<li>${escapeHtml(it.description)} (×${it.quantity}) — ৳${it.amount.toLocaleString()}</li>`).join('')}</ul>` : '';
        return `<tr><td style="font-family:monospace;">${escapeHtml(e.voucherNo)}</td><td>${escapeHtml(formatDate(e.date))}</td><td><strong>${escapeHtml(e.title)}</strong><br/><span style="font-size:10px;color:#475569;">${escapeHtml(e.paidTo)}</span>${itemDesc}</td><td>${escapeHtml(e.paymentMethod)}</td><td style="text-align:right;font-weight:700;color:#be123c;">৳${e.amount.toLocaleString()}</td></tr>`;
      })
      .join('');

    const htmlDoc = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<title>Cashbook Statement - ${escapeHtml(school.nameEn)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; padding: 16px; }
  .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header h2 { margin: 2px 0; font-size: 13px; color: #1e40af; }
  .header p { margin: 2px 0; font-size: 11px; color: #475569; }
  .badge { display: inline-block; margin-top: 6px; padding: 4px 12px; background: #0f172a; color: #fff; font-size: 11px; font-weight: 700; border-radius: 4px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; font-size: 11px; }
  .card span { display: block; color: #64748b; font-size: 10px; }
  .card strong { font-size: 14px; }
  h4 { margin: 12px 0 6px; font-size: 12px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; font-size: 10px; }
  .footer { margin-top: 34px; display: flex; justify-content: space-between; font-size: 11px; }
  .sig { border-top: 1px solid #334155; padding-top: 4px; min-width: 150px; text-align: center; font-weight: 600; }
  .print-bar { text-align: right; margin-bottom: 10px; }
  @media print { .print-bar { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<div class="print-bar"><button onclick="window.print()" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Print / Save PDF</button></div>
<div class="header">
  <h1>${escapeHtml(school.nameBn)}</h1>
  <h2>${escapeHtml(school.nameEn)}</h2>
  <p>${escapeHtml(school.addressBn || school.addressEn)} • Phone: ${escapeHtml(school.phone)} • EIIN: ${escapeHtml(school.eiin)}</p>
  <div class="badge">INCOME & EXPENDITURE STATEMENT (${escapeHtml(periodLabel)})</div>
</div>
<div class="cards">
  <div class="card"><span>ফি আদায় (${payments.length})</span><strong style="color:#047857;">৳${feeTotal.toLocaleString()}</strong></div>
  <div class="card"><span>আয় ভাউচার (${incomeVouchers.length})</span><strong style="color:#0284c7;">৳${voucherIncomeTotal.toLocaleString()}</strong></div>
  <div class="card"><span>মোট ব্যয় (${expenses.length})</span><strong style="color:#be123c;">৳${totalExpense.toLocaleString()}</strong></div>
  <div class="card" style="background:#eff6ff;"><span>নিট ক্যাশ উদ্বৃত্ত</span><strong style="color:#1d4ed8;">৳${netBalance.toLocaleString()}</strong></div>
</div>
<h4 style="color:#047857;">INCOME / RECEIPTS (মোট আদায় ও আয়: ৳${totalIncome.toLocaleString()})</h4>
<table><thead><tr><th>Ref No</th><th>Date</th><th>Description & Party</th><th>Method</th><th style="text-align:right;">Amount</th></tr></thead><tbody>${incomeRowsHtml || '<tr><td colspan="5" style="text-align:center;">কোনো আয় পাওয়া যায়নি</td></tr>'}</tbody></table>
<h4 style="color:#be123c;">EXPENDITURE / PAYMENTS (মোট ব্যয়: ৳${totalExpense.toLocaleString()})</h4>
<table><thead><tr><th>Voucher No</th><th>Date</th><th>Description & Line Items</th><th>Method</th><th style="text-align:right;">Amount</th></tr></thead><tbody>${expenseRowsHtml || '<tr><td colspan="5" style="text-align:center;">কোনো ব্যয় পাওয়া যায়নি</td></tr>'}</tbody></table>
<div style="padding:10px;border:1px solid #cbd5e1;background:#f8fafc;font-size:12px;font-weight:700;display:flex;justify-content:space-between;">
  <span>সময়কালের নিট ক্যাশ ব্যালেন্স (Net Surplus): ${escapeHtml(amountInWords(Math.max(0, netBalance)))}</span>
  <span>৳${netBalance.toLocaleString()}</span>
</div>
<div class="footer">
  <div class="sig">Accounts Officer</div>
  <div class="sig">${buildPrincipalSignatureHtml(school)}Head Teacher / Principal</div>
</div>
</body>
</html>`;
    downloadBlob(htmlDoc, 'text/html;charset=utf-8;', `Cashbook_Statement_${new Date().toISOString().slice(0, 10)}.html`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-4 sm:p-8 text-xs my-4 sm:my-8 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:my-0 print:max-w-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-5 print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span>{language === 'bn' ? 'আয়-ব্যয় ও ক্যাশবুক স্টেটমেন্ট প্রিন্ট' : 'Income & Expenditure Statement Preview'}</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{language === 'bn' ? 'প্রিন্ট শীট (.html)' : 'Save (.html)'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="border border-slate-300 p-4 sm:p-6 rounded-xl bg-white space-y-5 print:border-none print:p-0">
          <div className="text-center border-b-2 border-slate-800 pb-3">
            <div className="flex items-center justify-center gap-3 mb-1">
              <img src={school.logoUrl || DEFAULT_SCHOOL_LOGO} alt="School Logo" className="w-12 h-12 object-contain" />
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">{school.nameBn}</h2>
                <h3 className="text-xs sm:text-sm font-bold text-blue-800">{school.nameEn}</h3>
              </div>
            </div>
            <p className="text-[11px] text-slate-600">
              {school.addressBn || school.addressEn} • Phone: {school.phone} • EIIN: {school.eiin}
            </p>
            <div className="inline-block mt-2 px-3 py-1 bg-slate-900 text-white rounded font-bold uppercase text-[11px] tracking-wider print:bg-black">
              INCOME & EXPENDITURE STATEMENT ({periodLabel})
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 border border-emerald-200 bg-emerald-50/50 rounded-xl">
              <span className="text-[10px] text-slate-600 block">{language === 'bn' ? 'ফি আদায়' : 'Fee Collection'}</span>
              <strong className="text-sm font-extrabold text-emerald-700 tabular-nums">{formatTaka(feeTotal)}</strong>
              <span className="text-[10px] text-slate-500 block">{toBnNumber(payments.length)} টি রসিদ</span>
            </div>
            <div className="p-3 border border-sky-200 bg-sky-50/50 rounded-xl">
              <span className="text-[10px] text-slate-600 block">{language === 'bn' ? 'আয় ভাউচার / POS' : 'Income Vouchers'}</span>
              <strong className="text-sm font-extrabold text-sky-700 tabular-nums">{formatTaka(voucherIncomeTotal)}</strong>
              <span className="text-[10px] text-slate-500 block">{toBnNumber(incomeVouchers.length)} টি ভাউচার</span>
            </div>
            <div className="p-3 border border-rose-200 bg-rose-50/50 rounded-xl">
              <span className="text-[10px] text-slate-600 block">{language === 'bn' ? 'মোট ব্যয়' : 'Total Expenses'}</span>
              <strong className="text-sm font-extrabold text-rose-700 tabular-nums">{formatTaka(totalExpense)}</strong>
              <span className="text-[10px] text-slate-500 block">{toBnNumber(expenses.length)} টি ভাউচার</span>
            </div>
            <div className="p-3 border border-blue-200 bg-blue-50/70 rounded-xl">
              <span className="text-[10px] text-blue-900 font-bold block">{language === 'bn' ? 'নিট ক্যাশ উদ্বৃত্ত' : 'Net Surplus'}</span>
              <strong className="text-base font-black text-blue-800 tabular-nums">{formatTaka(netBalance)}</strong>
              <span className="text-[10px] text-slate-500 block">{language === 'bn' ? `মোট আয়: ${formatTaka(totalIncome)}` : `Income: ${formatTaka(totalIncome)}`}</span>
            </div>
          </div>

          {/* Income Table */}
          <div>
            <h4 className="font-bold text-emerald-800 text-xs uppercase mb-2">
              {language === 'bn' ? `আয়ের বিবরণ (মোট: ${formatTaka(totalIncome)})` : `INCOME LEDGER (Total: ${formatTaka(totalIncome)})`}
            </h4>
            <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold uppercase">
                  <th className="border border-slate-300 py-1.5 px-2.5">Ref / No</th>
                  <th className="border border-slate-300 py-1.5 px-2.5">Date</th>
                  <th className="border border-slate-300 py-1.5 px-2.5">Description & Payer</th>
                  <th className="border border-slate-300 py-1.5 px-2.5">Method</th>
                  <th className="border border-slate-300 py-1.5 px-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {incomeVouchers.map((v) => (
                  <tr key={v.id}>
                    <td className="border border-slate-300 py-1.5 px-2.5 font-mono font-bold text-emerald-800">{v.voucherNo}</td>
                    <td className="border border-slate-300 py-1.5 px-2.5 whitespace-nowrap">{formatDate(v.date)}</td>
                    <td className="border border-slate-300 py-1.5 px-2.5">
                      <div className="font-semibold">{v.title}</div>
                      <div className="text-[10px] text-slate-500">{v.receivedFrom}</div>
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2.5">{v.paymentMethod}</td>
                    <td className="border border-slate-300 py-1.5 px-2.5 text-right font-bold text-emerald-700 tabular-nums">{formatTaka(v.amount)}</td>
                  </tr>
                ))}
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="border border-slate-300 py-1.5 px-2.5 font-mono font-bold text-blue-700">{p.receiptNo}</td>
                    <td className="border border-slate-300 py-1.5 px-2.5 whitespace-nowrap">{formatDate(p.paidDate)}</td>
                    <td className="border border-slate-300 py-1.5 px-2.5">
                      <div className="font-semibold">{p.studentName}</div>
                      <div className="text-[10px] text-slate-500">{p.className} • Roll {p.roll}</div>
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2.5">{p.paymentMethod}</td>
                    <td className="border border-slate-300 py-1.5 px-2.5 text-right font-bold text-emerald-700 tabular-nums">{formatTaka(p.amount)}</td>
                  </tr>
                ))}
                {incomeVouchers.length === 0 && payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border border-slate-300 py-4 text-center text-slate-400">
                      {language === 'bn' ? 'নির্বাচিত সময়কালে কোনো আয় পাওয়া যায়নি।' : 'No income recorded in this period.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Expenditure Table */}
          <div>
            <h4 className="font-bold text-rose-800 text-xs uppercase mb-2">
              {language === 'bn' ? `ব্যয়ের বিবরণ (মোট: ${formatTaka(totalExpense)})` : `EXPENDITURE LEDGER (Total: ${formatTaka(totalExpense)})`}
            </h4>
            <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold uppercase">
                  <th className="border border-slate-300 py-1.5 px-2.5">Voucher No</th>
                  <th className="border border-slate-300 py-1.5 px-2.5">Date</th>
                  <th className="border border-slate-300 py-1.5 px-2.5">Description & Itemized Breakdown</th>
                  <th className="border border-slate-300 py-1.5 px-2.5">Method</th>
                  <th className="border border-slate-300 py-1.5 px-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const items = normalizeExpenseItems(e);
                  return (
                    <tr key={e.id}>
                      <td className="border border-slate-300 py-1.5 px-2.5 font-mono font-bold text-rose-800">{e.voucherNo}</td>
                      <td className="border border-slate-300 py-1.5 px-2.5 whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="border border-slate-300 py-1.5 px-2.5">
                        <div className="font-semibold text-slate-900">{e.title}</div>
                        <div className="text-[10px] text-slate-500">{e.paidTo} • {e.category}</div>
                        {items.length > 1 && (
                          <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[10px] text-slate-600">
                            {items.map((it, idx) => (
                              <li key={it.id || idx}>
                                {it.description} (×{it.quantity}) — <strong>{formatTaka(it.amount)}</strong>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2.5">{e.paymentMethod}</td>
                      <td className="border border-slate-300 py-1.5 px-2.5 text-right font-bold text-rose-700 tabular-nums">{formatTaka(e.amount)}</td>
                    </tr>
                  );
                })}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border border-slate-300 py-4 text-center text-slate-400">
                      {language === 'bn' ? 'নির্বাচিত সময়কালে কোনো ব্যয় পাওয়া যায়নি।' : 'No expenses recorded in this period.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-10 flex items-end justify-between text-[11px] text-slate-700">
            <div className="text-center">
              <div className="border-t border-slate-400 pt-1 px-6 font-semibold">
                {language === 'bn' ? 'হিসাবরক্ষক' : 'Accounts Officer'}
              </div>
            </div>
            <div className="text-center">
              <PrincipalSignatureDisplay school={school} fallbackText="" heightClass="h-10" textClassName="font-serif italic font-bold text-xs text-slate-900 pb-0.5" />
              <div className="border-t border-slate-400 pt-1 px-6 font-semibold">
                {language === 'bn' ? 'প্রধান শিক্ষক / অধ্যক্ষ' : 'Principal / Head Teacher'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. EXPENSE SUMMARY REPORT PRINT MODAL (EXPENSE VOUCHERS TAB)
 * ========================================================================== */
interface ExpenseSummaryPrintModalProps extends CommonPrintProps {
  expenses: Expense[];
  periodLabel: string;
  onClose: () => void;
}

export const ExpenseSummaryPrintModal: React.FC<ExpenseSummaryPrintModalProps> = ({
  expenses,
  periodLabel,
  school,
  language,
  formatTaka,
  toBnNumber,
  formatDate,
  amountInWords,
  onClose,
}) => {
  const totalAmount = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-4 sm:p-8 text-xs my-4 sm:my-8 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:my-0 print:max-w-none">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-5 print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Printer className="w-5 h-5 text-rose-600" />
              <span>{language === 'bn' ? 'প্রাতিষ্ঠানিক ব্যয় রিপোর্ট প্রিন্ট' : 'Expense Statement Print Preview'}</span>
            </h3>
            <p className="text-[11px] text-slate-500">{periodLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="border border-slate-300 p-4 sm:p-6 rounded-xl bg-white space-y-4 print:border-none print:p-0">
          <div className="text-center border-b-2 border-slate-800 pb-3">
            <h2 className="text-lg font-black text-slate-900">{school.nameBn}</h2>
            <h3 className="text-xs font-bold text-slate-700">{school.nameEn}</h3>
            <p className="text-[11px] text-slate-600">{school.addressBn || school.addressEn} • EIIN: {school.eiin}</p>
            <div className="inline-block mt-2 px-3 py-1 bg-rose-700 text-white rounded font-bold uppercase text-[11px] print:bg-black">
              INSTITUTIONAL EXPENSE REPORT ({periodLabel})
            </div>
          </div>

          <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
            <thead>
              <tr className="bg-slate-100 font-bold uppercase">
                <th className="border border-slate-300 py-1.5 px-2 text-center">SL</th>
                <th className="border border-slate-300 py-1.5 px-2">Voucher No</th>
                <th className="border border-slate-300 py-1.5 px-2">Date</th>
                <th className="border border-slate-300 py-1.5 px-2">Category</th>
                <th className="border border-slate-300 py-1.5 px-2">Description & Items</th>
                <th className="border border-slate-300 py-1.5 px-2">Paid To</th>
                <th className="border border-slate-300 py-1.5 px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, idx) => {
                const items = normalizeExpenseItems(e);
                return (
                  <tr key={e.id}>
                    <td className="border border-slate-300 py-1.5 px-2 text-center font-mono">{toBnNumber(idx + 1)}</td>
                    <td className="border border-slate-300 py-1.5 px-2 font-mono font-bold text-rose-800">{e.voucherNo}</td>
                    <td className="border border-slate-300 py-1.5 px-2 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="border border-slate-300 py-1.5 px-2">{e.category}</td>
                    <td className="border border-slate-300 py-1.5 px-2">
                      <div className="font-bold text-slate-900">{e.title}</div>
                      {items.length > 1 && (
                        <ul className="list-disc pl-4 mt-0.5 text-[10px] text-slate-600">
                          {items.map((it, i) => (
                            <li key={it.id || i}>
                              {it.description} (×{it.quantity}) — {formatTaka(it.amount)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2">{e.paidTo}</td>
                    <td className="border border-slate-300 py-1.5 px-2 text-right font-bold text-rose-700 tabular-nums">{formatTaka(e.amount)}</td>
                  </tr>
                );
              })}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="border border-slate-300 py-6 text-center text-slate-400">
                    {language === 'bn' ? 'কোনো ব্যয় পাওয়া যায়নি।' : 'No expenses found.'}
                  </td>
                </tr>
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr className="bg-rose-50 font-extrabold">
                  <td colSpan={6} className="border border-slate-300 py-2 px-3 text-right">
                    মোট ব্যয় ({toBnNumber(expenses.length)}টি ভাউচার) — {amountInWords(totalAmount)}
                  </td>
                  <td className="border border-slate-300 py-2 px-2 text-right text-rose-800 text-sm tabular-nums">
                    {formatTaka(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

          <div className="pt-10 flex items-end justify-between text-[11px] text-slate-700">
            <div className="border-t border-slate-400 pt-1 px-6 font-semibold">হিসাবরক্ষক</div>
            <div className="text-center">
              <PrincipalSignatureDisplay school={school} />
              <div className="border-t border-slate-400 pt-1 px-6 font-semibold">প্রধান শিক্ষক / অধ্যক্ষ</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 5. INCOME VOUCHERS SUMMARY REPORT PRINT MODAL
 * ========================================================================== */
interface IncomeSummaryPrintModalProps extends CommonPrintProps {
  vouchers: IncomeVoucher[];
  periodLabel: string;
  onClose: () => void;
}

export const IncomeSummaryPrintModal: React.FC<IncomeSummaryPrintModalProps> = ({
  vouchers,
  periodLabel,
  school,
  language,
  formatTaka,
  toBnNumber,
  formatDate,
  amountInWords,
  onClose,
}) => {
  const totalAmount = vouchers.reduce((s, v) => s + (Number(v.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-4 sm:p-8 text-xs my-4 sm:my-8 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:my-0 print:max-w-none">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-5 print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-600" />
              <span>{language === 'bn' ? 'আয় ভাউচার ও বিক্রয় রিপোর্ট প্রিন্ট' : 'Income Vouchers Report Preview'}</span>
            </h3>
            <p className="text-[11px] text-slate-500">{periodLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="border border-slate-300 p-4 sm:p-6 rounded-xl bg-white space-y-4 print:border-none print:p-0">
          <div className="text-center border-b-2 border-slate-800 pb-3">
            <h2 className="text-lg font-black text-slate-900">{school.nameBn}</h2>
            <h3 className="text-xs font-bold text-slate-700">{school.nameEn}</h3>
            <p className="text-[11px] text-slate-600">{school.addressBn || school.addressEn} • EIIN: {school.eiin}</p>
            <div className="inline-block mt-2 px-3 py-1 bg-emerald-700 text-white rounded font-bold uppercase text-[11px] print:bg-black">
              INCOME VOUCHERS & STORE SALES REPORT ({periodLabel})
            </div>
          </div>

          <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
            <thead>
              <tr className="bg-slate-100 font-bold uppercase">
                <th className="border border-slate-300 py-1.5 px-2 text-center">SL</th>
                <th className="border border-slate-300 py-1.5 px-2">Voucher No</th>
                <th className="border border-slate-300 py-1.5 px-2">Date</th>
                <th className="border border-slate-300 py-1.5 px-2">Sold Items / Details</th>
                <th className="border border-slate-300 py-1.5 px-2">Buyer / Payer</th>
                <th className="border border-slate-300 py-1.5 px-2">Method</th>
                <th className="border border-slate-300 py-1.5 px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v, idx) => (
                <tr key={v.id}>
                  <td className="border border-slate-300 py-1.5 px-2 text-center font-mono">{toBnNumber(idx + 1)}</td>
                  <td className="border border-slate-300 py-1.5 px-2 font-mono font-bold text-emerald-800">{v.voucherNo}</td>
                  <td className="border border-slate-300 py-1.5 px-2 whitespace-nowrap">{formatDate(v.date)}</td>
                  <td className="border border-slate-300 py-1.5 px-2">
                    <div className="font-bold text-slate-900">{v.title}</div>
                    {v.items && v.items.length > 0 && (
                      <div className="text-[10px] text-slate-600">
                        {v.items.map((it) => `${it.name} (×${it.quantity})`).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="border border-slate-300 py-1.5 px-2">{v.receivedFrom}</td>
                  <td className="border border-slate-300 py-1.5 px-2">{v.paymentMethod}</td>
                  <td className="border border-slate-300 py-1.5 px-2 text-right font-bold text-emerald-700 tabular-nums">{formatTaka(v.amount)}</td>
                </tr>
              ))}
              {vouchers.length === 0 && (
                <tr>
                  <td colSpan={7} className="border border-slate-300 py-6 text-center text-slate-400">
                    {language === 'bn' ? 'কোনো আয় ভাউচার পাওয়া যায়নি।' : 'No income vouchers found.'}
                  </td>
                </tr>
              )}
            </tbody>
            {vouchers.length > 0 && (
              <tfoot>
                <tr className="bg-emerald-50 font-extrabold">
                  <td colSpan={6} className="border border-slate-300 py-2 px-3 text-right">
                    মোট আয় ({toBnNumber(vouchers.length)}টি ভাউচার) — {amountInWords(totalAmount)}
                  </td>
                  <td className="border border-slate-300 py-2 px-2 text-right text-emerald-800 text-sm tabular-nums">
                    {formatTaka(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

          <div className="pt-10 flex items-end justify-between text-[11px] text-slate-700">
            <div className="border-t border-slate-400 pt-1 px-6 font-semibold">হিসাবরক্ষক</div>
            <div className="text-center">
              <PrincipalSignatureDisplay school={school} />
              <div className="border-t border-slate-400 pt-1 px-6 font-semibold">প্রধান শিক্ষক / অধ্যক্ষ</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 6. COLLECTOR-WISE & ACCOUNTANT COLLECTION REPORT PRINT MODAL
 * ========================================================================== */
interface CollectorReportPrintModalProps extends CommonPrintProps {
  transactions: CollectorTransaction[];
  collectorSummaries: CollectorSummary[];
  periodLabel: string;
  selectedCollectorLabel: string;
  canViewAllCollectors: boolean;
  onClose: () => void;
}

export const CollectorReportPrintModal: React.FC<CollectorReportPrintModalProps> = ({
  transactions,
  collectorSummaries,
  periodLabel,
  selectedCollectorLabel,
  canViewAllCollectors,
  school,
  language,
  formatTaka,
  toBnNumber,
  formatDate,
  amountInWords,
  onClose,
}) => {
  const stats = computeIncomeExpenseStats(transactions);
  const formatSignedTaka = (val: number) =>
    val < 0 ? `-${formatTaka(Math.abs(val))}` : formatTaka(val);

  const handleDownloadCsv = () => {
    const header = 'SL,Date,Ref No,Direction,Type,Recorded By,Party,Details,Method,TrxID,Amount\n';
    const body = transactions
      .map((t, idx) =>
        [
          idx + 1,
          `"${escapeHtml(t.date)}"`,
          `"${escapeHtml(t.refNo)}"`,
          t.direction === 'expense' ? 'Expense' : 'Income',
          t.source === 'fee_receipt'
            ? 'Fee Receipt'
            : t.source === 'income_voucher'
            ? 'Income Voucher'
            : 'Expense Voucher',
          `"${String(t.collectorName).replace(/"/g, '""')}"`,
          `"${String(t.partyName).replace(/"/g, '""')}"`,
          `"${String(t.subtitle).replace(/"/g, '""')}"`,
          t.paymentMethod,
          `"${t.transactionId || ''}"`,
          t.direction === 'expense' ? -t.amount : t.amount,
        ].join(',')
      )
      .join('\n');
    downloadBlob(
      '\uFEFF' + header + body,
      'text/csv;charset=utf-8;',
      `Collector_Income_Expense_Report_${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const handleDownloadHtml = () => {
    const summaryRowsHtml = canViewAllCollectors
      ? collectorSummaries
          .map(
            (c, idx) => `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td><strong>${escapeHtml(c.displayNameBn || c.displayName)}</strong><br/><span style="font-size:10px;color:#475569;">${escapeHtml(c.roleLabelBn)}</span></td>
            <td style="text-align:right;">৳${c.feeAmount.toLocaleString()} (${c.feeCount})</td>
            <td style="text-align:right;">৳${c.voucherAmount.toLocaleString()} (${c.voucherCount})</td>
            <td style="text-align:right;font-weight:700;color:#047857;">৳${c.totalAmount.toLocaleString()}</td>
            <td style="text-align:right;font-weight:700;color:#be123c;">৳${c.expenseAmount.toLocaleString()} (${c.expenseCount})</td>
            <td style="text-align:right;font-weight:700;color:#1d4ed8;">${c.netCashInHand < 0 ? '-' : ''}৳${Math.abs(c.netCashInHand).toLocaleString()}</td>
            <td style="text-align:right;font-weight:800;color:#0f172a;">${c.netBalance < 0 ? '-' : ''}৳${Math.abs(c.netBalance).toLocaleString()}</td>
          </tr>`
          )
          .join('')
      : '';

    const txRowsHtml = transactions
      .map(
        (t, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(formatDate(t.date))}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(t.refNo)}</td>
        <td>${t.source === 'fee_receipt' ? 'ফি রসিদ (আয়)' : t.source === 'income_voucher' ? 'আয় ভাউচার' : 'ব্যয় ভাউচার'}</td>
        <td>${escapeHtml(t.collectorNameBn || t.collectorName)}</td>
        <td><strong>${escapeHtml(t.partyName)}</strong><br/><span style="font-size:10px;color:#475569;">${escapeHtml(t.subtitle)}</span></td>
        <td>${escapeHtml(t.paymentMethod)}</td>
        <td style="text-align:right;font-weight:700;color:${t.direction === 'expense' ? '#be123c' : '#047857'};">${t.direction === 'expense' ? '-' : '+'}৳${t.amount.toLocaleString()}</td>
      </tr>`
      )
      .join('');

    const htmlDoc = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<title>Accountant Income & Expense Report - ${escapeHtml(school.nameEn)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; padding: 16px; }
  .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header h2 { margin: 2px 0; font-size: 13px; color: #1e3a8a; }
  .header p { margin: 2px 0; font-size: 11px; color: #475569; }
  .badge { display: inline-block; margin-top: 6px; background: #0f172a; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
  .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc; font-size: 11px; }
  .card strong { display: block; font-size: 14px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 14px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 7px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; font-size: 10px; }
  .footer { margin-top: 34px; display: flex; justify-content: space-between; font-size: 11px; }
  .sig { border-top: 1px solid #334155; padding-top: 4px; min-width: 150px; text-align: center; font-weight: 600; }
  .print-bar { text-align: right; margin-bottom: 10px; }
  @media print { .print-bar { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<div class="print-bar"><button onclick="window.print()" style="padding:8px 16px;background:#047857;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Print / Save PDF</button></div>
<div class="header">
  <h1>${escapeHtml(school.nameBn)}</h1>
  <h2>${escapeHtml(school.nameEn)}</h2>
  <p>${escapeHtml(school.addressBn || school.addressEn)} • EIIN: ${escapeHtml(school.eiin)}</p>
  <div class="badge">INCOME & EXPENSE AUDIT • ${escapeHtml(selectedCollectorLabel)} (${escapeHtml(periodLabel)})</div>
</div>
<div class="cards">
  <div class="card"><span>মোট আয় (${stats.incomeCount})</span><strong style="color:#047857;">৳${stats.incomeTotal.toLocaleString()}</strong></div>
  <div class="card"><span>মোট ব্যয় (${stats.expenseCount})</span><strong style="color:#be123c;">৳${stats.expenseTotal.toLocaleString()}</strong></div>
  <div class="card"><span>হাতে নিট নগদ (Cash)</span><strong style="color:#1d4ed8;">${stats.netCashInHand < 0 ? '-' : ''}৳${Math.abs(stats.netCashInHand).toLocaleString()}</strong></div>
  <div class="card"><span>নিট ব্যালেন্স (আয় - ব্যয়)</span><strong>${stats.netBalance < 0 ? '-' : ''}৳${Math.abs(stats.netBalance).toLocaleString()}</strong></div>
</div>
${
  canViewAllCollectors && collectorSummaries.length > 0
    ? `<h4>হিসাবরক্ষক / স্টাফ ভিত্তিক আয়-ব্যয় সারসংক্ষেপ</h4><table><thead><tr><th>SL</th><th>নাম ও পদবি</th><th>ফি (৳)</th><th>আয় ভাউচার</th><th>মোট আয়</th><th>মোট ব্যয়</th><th>নিট নগদ Cash</th><th>নিট ব্যালেন্স</th></tr></thead><tbody>${summaryRowsHtml}</tbody></table>`
    : ''
}
<h4>বিস্তারিত আয় ও ব্যয় লেনদেন রেজিস্টার</h4>
<table><thead><tr><th>SL</th><th>তারিখ</th><th>রসিদ/ভাউচার</th><th>ধরন</th><th>সংগ্রহকারী / ব্যয়কারী</th><th>বিবরণ</th><th>মাধ্যম</th><th style="text-align:right;">টাকা</th></tr></thead><tbody>${txRowsHtml || '<tr><td colspan="8" style="text-align:center;">কোনো লেনদেন পাওয়া যায়নি</td></tr>'}</tbody></table>
<div style="padding:8px 10px;background:#f8fafc;border:1px solid #cbd5e1;font-size:11px;font-weight:700;">নিট ব্যালেন্স (কথায়): ${stats.netBalance < 0 ? '(-) ' : ''}${escapeHtml(amountInWords(Math.abs(stats.netBalance)))}</div>
<div class="footer">
  <div class="sig">হিসাবরক্ষক / Collector</div>
  <div class="sig">${buildPrincipalSignatureHtml(school)}সুপার অ্যাডমিন / অধ্যক্ষ</div>
</div>
</body>
</html>`;
    downloadBlob(
      htmlDoc,
      'text/html;charset=utf-8;',
      `Collector_Income_Expense_Report_${new Date().toISOString().slice(0, 10)}.html`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full p-4 sm:p-8 text-xs my-4 sm:my-8 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:my-0 print:max-w-none">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-5 print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-600" />
              <span>
                {language === 'bn'
                  ? 'হিসাবরক্ষক আয়-ব্যয় অডিট রিপোর্ট প্রিন্ট'
                  : 'Accountant Income & Expense Audit Print'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {selectedCollectorLabel} • {periodLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{language === 'bn' ? 'প্রিন্ট শীট (.html)' : 'Save (.html)'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="border border-slate-300 p-4 sm:p-6 rounded-xl bg-white space-y-4 print:border-none print:p-0">
          <div className="text-center border-b-2 border-slate-800 pb-3">
            <div className="flex items-center justify-center gap-3 mb-1">
              <img src={school.logoUrl || DEFAULT_SCHOOL_LOGO} alt="School Logo" className="w-12 h-12 object-contain" />
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">{school.nameBn}</h2>
                <h3 className="text-xs sm:text-sm font-bold text-blue-800">{school.nameEn}</h3>
              </div>
            </div>
            <p className="text-[11px] text-slate-600">
              {school.addressBn || school.addressEn} • Phone: {school.phone} • EIIN: {school.eiin}
            </p>
            <div className="inline-block mt-2 px-3 py-1 bg-slate-900 text-white rounded font-bold uppercase text-[11px] print:bg-black">
              {selectedCollectorLabel} • {periodLabel}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 border border-emerald-200 bg-emerald-50/50 rounded-xl">
              <span className="text-[10px] text-slate-600 block">
                {language === 'bn' ? 'মোট আয় (Income)' : 'Total Income'}
              </span>
              <strong className="text-sm font-extrabold text-emerald-700 tabular-nums">
                {formatTaka(stats.incomeTotal)}
              </strong>
              <span className="text-[10px] text-slate-500 block">
                ফি: {formatTaka(stats.feeTotal)} • ভাউচার: {formatTaka(stats.incomeVoucherTotal)}
              </span>
            </div>
            <div className="p-3 border border-rose-200 bg-rose-50/50 rounded-xl">
              <span className="text-[10px] text-slate-600 block">
                {language === 'bn' ? 'মোট ব্যয় (Expense)' : 'Total Expense'}
              </span>
              <strong className="text-sm font-extrabold text-rose-700 tabular-nums">
                {formatTaka(stats.expenseTotal)}
              </strong>
              <span className="text-[10px] text-slate-500 block">
                {toBnNumber(stats.expenseCount)}টি ভাউচার • নগদ: {formatTaka(stats.cashExpense)}
              </span>
            </div>
            <div className="p-3 border border-blue-200 bg-blue-50/50 rounded-xl">
              <span className="text-[10px] text-slate-600 block">
                {language === 'bn' ? 'হাতে নিট নগদ (Cash Handover)' : 'Net Cash in Hand'}
              </span>
              <strong className="text-sm font-extrabold text-blue-700 tabular-nums">
                {formatSignedTaka(stats.netCashInHand)}
              </strong>
              <span className="text-[10px] text-slate-500 block">
                নগদ আয় {formatTaka(stats.cashIncome)} - ব্যয় {formatTaka(stats.cashExpense)}
              </span>
            </div>
            <div className="p-3 border border-slate-200 bg-slate-50 rounded-xl">
              <span className="text-[10px] text-slate-600 block">
                {language === 'bn' ? 'নিট ব্যালেন্স (আয় - ব্যয়)' : 'Net Balance'}
              </span>
              <strong className="text-sm font-extrabold text-slate-900 tabular-nums">
                {formatSignedTaka(stats.netBalance)}
              </strong>
              <span className="text-[10px] text-slate-500 block">
                ডিজিটাল নিট: {formatSignedTaka(stats.netDigitalBalance)}
              </span>
            </div>
          </div>

          {canViewAllCollectors && collectorSummaries.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 text-xs uppercase mb-2">
                {language === 'bn'
                  ? 'হিসাবরক্ষক / স্টাফ ভিত্তিক আয়-ব্যয় সারসংক্ষেপ (কে কত আয় ও ব্যয় করেছে)'
                  : 'Collector-Wise Income & Expense Summary'}
              </h4>
              <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 font-bold">
                    <th className="border border-slate-300 py-1.5 px-2 text-center">SL</th>
                    <th className="border border-slate-300 py-1.5 px-2">নাম ও পদবি</th>
                    <th className="border border-slate-300 py-1.5 px-2 text-right">ফি (৳)</th>
                    <th className="border border-slate-300 py-1.5 px-2 text-right">আয় ভাউচার</th>
                    <th className="border border-slate-300 py-1.5 px-2 text-right">মোট আয়</th>
                    <th className="border border-slate-300 py-1.5 px-2 text-right">মোট ব্যয়</th>
                    <th className="border border-slate-300 py-1.5 px-2 text-right">নিট নগদ (Cash)</th>
                    <th className="border border-slate-300 py-1.5 px-2 text-right">নিট ব্যালেন্স</th>
                  </tr>
                </thead>
                <tbody>
                  {collectorSummaries.map((c, idx) => (
                    <tr key={c.collectorKey}>
                      <td className="border border-slate-300 py-1.5 px-2 text-center font-mono">
                        {toBnNumber(idx + 1)}
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2">
                        <div className="font-bold text-slate-900">{c.displayNameBn || c.displayName}</div>
                        <div className="text-[10px] text-slate-500">{c.roleLabelBn}</div>
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2 text-right tabular-nums">
                        {formatTaka(c.feeAmount)} ({toBnNumber(c.feeCount)})
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2 text-right tabular-nums">
                        {formatTaka(c.voucherAmount)} ({toBnNumber(c.voucherCount)})
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2 text-right font-bold text-emerald-700 tabular-nums">
                        {formatTaka(c.totalAmount)}
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2 text-right font-bold text-rose-700 tabular-nums">
                        {formatTaka(c.expenseAmount)} ({toBnNumber(c.expenseCount)})
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2 text-right tabular-nums text-blue-700 font-semibold">
                        {formatSignedTaka(c.netCashInHand)}
                      </td>
                      <td className="border border-slate-300 py-1.5 px-2 text-right font-extrabold text-slate-900 tabular-nums">
                        {formatSignedTaka(c.netBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <h4 className="font-bold text-slate-800 text-xs uppercase mb-2">
              {language === 'bn' ? 'বিস্তারিত আয় ও ব্যয় লেনদেন রেজিস্টার' : 'Income & Expense Register'}
            </h4>
            <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-100 font-bold">
                  <th className="border border-slate-300 py-1.5 px-2 text-center">SL</th>
                  <th className="border border-slate-300 py-1.5 px-2">তারিখ</th>
                  <th className="border border-slate-300 py-1.5 px-2">রসিদ / ভাউচার</th>
                  <th className="border border-slate-300 py-1.5 px-2">ধরন</th>
                  <th className="border border-slate-300 py-1.5 px-2">সংগ্রহকারী / ব্যয়কারী</th>
                  <th className="border border-slate-300 py-1.5 px-2">বিবরণ / প্রেরক / প্রাপক</th>
                  <th className="border border-slate-300 py-1.5 px-2">মাধ্যম</th>
                  <th className="border border-slate-300 py-1.5 px-2 text-right">টাকা</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, idx) => (
                  <tr key={`${t.source}_${t.id}`}>
                    <td className="border border-slate-300 py-1.5 px-2 text-center font-mono">
                      {toBnNumber(idx + 1)}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2 whitespace-nowrap">{formatDate(t.date)}</td>
                    <td
                      className={`border border-slate-300 py-1.5 px-2 font-mono font-bold ${
                        t.direction === 'expense' ? 'text-rose-700' : 'text-blue-700'
                      }`}
                    >
                      {t.refNo}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2">
                      {t.source === 'fee_receipt'
                        ? 'ফি রসিদ (আয়)'
                        : t.source === 'income_voucher'
                        ? 'আয় ভাউচার'
                        : 'ব্যয় ভাউচার'}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2 font-semibold">
                      {t.collectorNameBn || t.collectorName}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2">
                      <div className="font-semibold text-slate-900">{t.partyName}</div>
                      <div className="text-[10px] text-slate-500">{t.subtitle}</div>
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2">{t.paymentMethod}</td>
                    <td
                      className={`border border-slate-300 py-1.5 px-2 text-right font-bold tabular-nums ${
                        t.direction === 'expense' ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {t.direction === 'expense' ? `-${formatTaka(t.amount)}` : `+${formatTaka(t.amount)}`}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="border border-slate-300 py-6 text-center text-slate-400">
                      {language === 'bn' ? 'নির্বাচিত সময়কালে কোনো লেনদেন পাওয়া যায়নি।' : 'No transactions found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span>
              মোট আয়: {formatTaka(stats.incomeTotal)} • মোট ব্যয়: {formatTaka(stats.expenseTotal)}
            </span>
            <span>
              নিট ব্যালেন্স (কথায়): {stats.netBalance < 0 ? '(-) ' : ''}
              {amountInWords(Math.abs(stats.netBalance))}
            </span>
          </div>

          <div className="pt-10 flex items-end justify-between text-[11px] text-slate-700">
            <div className="border-t border-slate-400 pt-1 px-6 font-semibold">হিসাবরক্ষক / Collector</div>
            <div className="text-center">
              <PrincipalSignatureDisplay school={school} />
              <div className="border-t border-slate-400 pt-1 px-6 font-semibold">সুপার অ্যাডমিন / অধ্যক্ষ</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
