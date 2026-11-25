import { FeeItem, FeePayment, SchoolProfile, Student } from '../types';

export type StatementStatusFilter = 'all' | 'with_dues' | 'overdue' | 'cleared';
export type StatementSortOption = 'roll' | 'due_desc' | 'paid_desc' | 'name';

export interface StudentFeeStatementEntry {
  student: Student;
  payments: FeePayment[];
  dues: FeeItem[];
  totalPaid: number;
  totalDue: number;
  totalAssessed: number;
  overdueCount: number;
  lastPaidDate: string | null;
  status: 'cleared' | 'due' | 'overdue';
}

export interface ClassStatementSummary {
  className: string;
  studentCount: number;
  clearedCount: number;
  dueStudentCount: number;
  overdueStudentCount: number;
  totalPaid: number;
  totalDue: number;
  totalAssessed: number;
  collectionRate: number;
}

export interface FeeStatementTotals {
  studentCount: number;
  clearedCount: number;
  dueStudentCount: number;
  overdueStudentCount: number;
  totalPaid: number;
  totalDue: number;
  totalAssessed: number;
  collectionRate: number;
  byClass: ClassStatementSummary[];
}

export function matchPaymentsForStudent(student: Student, allPayments: FeePayment[]): FeePayment[] {
  const nameLower = (student.nameEn || '').trim().toLowerCase();
  return allPayments.filter(
    (p) =>
      p.studentId === student.id ||
      p.studentId === student.studentId ||
      (nameLower.length > 0 && (p.studentName || '').trim().toLowerCase() === nameLower)
  );
}

function parseNumericRoll(roll?: string): number {
  const digits = String(roll || '').replace(/\D/g, '');
  if (!digits) return Number.MAX_SAFE_INTEGER;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function buildStudentFeeStatementEntries(params: {
  students: Student[];
  payments: FeePayment[];
  getDueFees: (student: Student) => FeeItem[];
}): StudentFeeStatementEntry[] {
  const { students, payments, getDueFees } = params;

  return students.map((student) => {
    const studentPayments = matchPaymentsForStudent(student, payments).sort((a, b) =>
      String(b.paidDate || '').localeCompare(String(a.paidDate || ''))
    );
    const dues = getDueFees(student) || [];
    const totalPaid = studentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalDue = dues.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalAssessed = totalPaid + totalDue;
    const overdueCount = dues.filter((d) => Boolean(d.isOverdue)).length;
    const lastPaidDate = studentPayments[0]?.paidDate || null;
    const status: 'cleared' | 'due' | 'overdue' =
      totalDue <= 0 ? 'cleared' : overdueCount > 0 ? 'overdue' : 'due';

    return {
      student,
      payments: studentPayments,
      dues,
      totalPaid,
      totalDue,
      totalAssessed,
      overdueCount,
      lastPaidDate,
      status,
    };
  });
}

export function filterAndSortFeeStatements(
  entries: StudentFeeStatementEntry[],
  filters: {
    classFilter?: string;
    sectionFilter?: string;
    statusFilter?: StatementStatusFilter;
    searchQuery?: string;
    sortBy?: StatementSortOption;
    classOrder?: string[];
  }
): StudentFeeStatementEntry[] {
  const {
    classFilter = 'all',
    sectionFilter = 'all',
    statusFilter = 'all',
    searchQuery = '',
    sortBy = 'roll',
    classOrder = [],
  } = filters;

  const classRankMap = new Map<string, number>();
  classOrder.forEach((cls, idx) => {
    classRankMap.set(cls.trim().toLowerCase(), idx);
  });

  const q = searchQuery.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    const st = entry.student;

    if (classFilter !== 'all' && st.className !== classFilter) {
      return false;
    }

    if (sectionFilter !== 'all' && (st.section || '') !== sectionFilter) {
      return false;
    }

    if (statusFilter === 'cleared' && entry.totalDue > 0) {
      return false;
    }
    if (statusFilter === 'with_dues' && entry.totalDue <= 0) {
      return false;
    }
    if (statusFilter === 'overdue' && entry.overdueCount === 0) {
      return false;
    }

    if (q) {
      const matched =
        (st.studentId || '').toLowerCase().includes(q) ||
        (st.admissionNo || '').toLowerCase().includes(q) ||
        (st.nameEn || '').toLowerCase().includes(q) ||
        (st.nameBn || '').toLowerCase().includes(q) ||
        (st.roll || '').toLowerCase().includes(q) ||
        (st.className || '').toLowerCase().includes(q) ||
        (st.guardianPhone || '').toLowerCase().includes(q) ||
        (st.fatherPhone || '').toLowerCase().includes(q);
      if (!matched) return false;
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === 'due_desc') {
      if (b.totalDue !== a.totalDue) return b.totalDue - a.totalDue;
      return parseNumericRoll(a.student.roll) - parseNumericRoll(b.student.roll);
    }
    if (sortBy === 'paid_desc') {
      if (b.totalPaid !== a.totalPaid) return b.totalPaid - a.totalPaid;
      return parseNumericRoll(a.student.roll) - parseNumericRoll(b.student.roll);
    }
    if (sortBy === 'name') {
      return (a.student.nameEn || '').localeCompare(b.student.nameEn || '');
    }

    // Default 'roll': group by class order when viewing whole school, then roll ascending
    if (classFilter === 'all' && a.student.className !== b.student.className) {
      const rankA = classRankMap.get((a.student.className || '').trim().toLowerCase());
      const rankB = classRankMap.get((b.student.className || '').trim().toLowerCase());
      if (rankA !== undefined && rankB !== undefined && rankA !== rankB) {
        return rankA - rankB;
      }
      if (rankA !== undefined && rankB === undefined) return -1;
      if (rankA === undefined && rankB !== undefined) return 1;
      return (a.student.className || '').localeCompare(b.student.className || '');
    }

    const rollDiff = parseNumericRoll(a.student.roll) - parseNumericRoll(b.student.roll);
    if (rollDiff !== 0) return rollDiff;
    return String(a.student.roll || '').localeCompare(String(b.student.roll || ''));
  });
}

export function summarizeFeeStatements(
  entries: StudentFeeStatementEntry[],
  classOrder: string[] = []
): FeeStatementTotals {
  const classRankMap = new Map<string, number>();
  classOrder.forEach((cls, idx) => {
    classRankMap.set(cls.trim().toLowerCase(), idx);
  });

  let clearedCount = 0;
  let dueStudentCount = 0;
  let overdueStudentCount = 0;
  let totalPaid = 0;
  let totalDue = 0;
  let totalAssessed = 0;

  const classMap = new Map<string, ClassStatementSummary>();

  for (const entry of entries) {
    if (entry.totalDue <= 0) {
      clearedCount += 1;
    } else {
      dueStudentCount += 1;
    }
    if (entry.overdueCount > 0) {
      overdueStudentCount += 1;
    }

    totalPaid += entry.totalPaid;
    totalDue += entry.totalDue;
    totalAssessed += entry.totalAssessed;

    const clsName = entry.student.className || 'Unassigned';
    const existing = classMap.get(clsName) || {
      className: clsName,
      studentCount: 0,
      clearedCount: 0,
      dueStudentCount: 0,
      overdueStudentCount: 0,
      totalPaid: 0,
      totalDue: 0,
      totalAssessed: 0,
      collectionRate: 0,
    };

    existing.studentCount += 1;
    if (entry.totalDue <= 0) existing.clearedCount += 1;
    else existing.dueStudentCount += 1;
    if (entry.overdueCount > 0) existing.overdueStudentCount += 1;
    existing.totalPaid += entry.totalPaid;
    existing.totalDue += entry.totalDue;
    existing.totalAssessed += entry.totalAssessed;
    existing.collectionRate =
      existing.totalAssessed > 0
        ? Math.round((existing.totalPaid / existing.totalAssessed) * 100)
        : existing.studentCount > 0
        ? 100
        : 0;

    classMap.set(clsName, existing);
  }

  const byClass = Array.from(classMap.values()).sort((a, b) => {
    const rankA = classRankMap.get(a.className.trim().toLowerCase());
    const rankB = classRankMap.get(b.className.trim().toLowerCase());
    if (rankA !== undefined && rankB !== undefined && rankA !== rankB) {
      return rankA - rankB;
    }
    if (rankA !== undefined && rankB === undefined) return -1;
    if (rankA === undefined && rankB !== undefined) return 1;
    return a.className.localeCompare(b.className);
  });

  const collectionRate =
    totalAssessed > 0
      ? Math.round((totalPaid / totalAssessed) * 100)
      : entries.length > 0
      ? 100
      : 0;

  return {
    studentCount: entries.length,
    clearedCount,
    dueStudentCount,
    overdueStudentCount,
    totalPaid,
    totalDue,
    totalAssessed,
    collectionRate,
    byClass,
  };
}

function csvCell(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildStatementCsv(entries: StudentFeeStatementEntry[]): string {
  const headers = [
    'Student ID',
    'Roll',
    'Student Name (EN)',
    'Student Name (BN)',
    'Class',
    'Section',
    'Guardian Phone',
    'Deposits Count',
    'Last Paid Date',
    'Total Assessed (BDT)',
    'Total Paid (BDT)',
    'Total Due (BDT)',
    'Status',
  ];

  const rows = entries.map((e) => [
    csvCell(e.student.studentId),
    csvCell(e.student.roll),
    csvCell(e.student.nameEn),
    csvCell(e.student.nameBn),
    csvCell(e.student.className),
    csvCell(e.student.section),
    csvCell(e.student.guardianPhone || e.student.fatherPhone || ''),
    csvCell(e.payments.length),
    csvCell(e.lastPaidDate || ''),
    csvCell(e.totalAssessed),
    csvCell(e.totalPaid),
    csvCell(e.totalDue),
    csvCell(e.status === 'cleared' ? 'Cleared' : e.status === 'overdue' ? 'Overdue' : 'Due'),
  ]);

  return `\uFEFF${[headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n')}`;
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtBdt(amount: number): string {
  return `৳ ${Math.round(Number(amount) || 0).toLocaleString('en-US')}`;
}

export function buildPrintableStatementHtml(params: {
  mode: 'register' | 'individual-bulk';
  entries: StudentFeeStatementEntry[];
  summary: FeeStatementTotals;
  schoolProfile: SchoolProfile;
  scopeTitle: string;
  logoSrc: string;
}): string {
  const { mode, entries, summary, schoolProfile, scopeTitle, logoSrc } = params;
  const statementDate = new Date().toLocaleDateString('en-GB');
  const schoolNameEn = escapeHtml(schoolProfile.nameEn);
  const schoolNameBn = escapeHtml(schoolProfile.nameBn);
  const schoolMeta = `${escapeHtml(schoolProfile.addressEn)} • Phone: ${escapeHtml(
    schoolProfile.phone
  )} • EIIN: ${escapeHtml(schoolProfile.eiin)}`;
  const principalName = escapeHtml(schoolProfile.principalNameEn || schoolProfile.principalNameBn || '');
  const safeLogo = escapeHtml(logoSrc);

  if (mode === 'register') {
    const rowsHtml = entries
      .map(
        (e, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(e.student.studentId)}</td>
        <td style="text-align:center;font-weight:700;">#${escapeHtml(e.student.roll)}</td>
        <td>
          <div style="font-weight:700;color:#0f172a;">${escapeHtml(e.student.nameEn)}</div>
          <div style="font-size:10px;color:#475569;">${escapeHtml(e.student.nameBn)}</div>
        </td>
        <td>${escapeHtml(e.student.className)} (${escapeHtml(e.student.section || '-')})</td>
        <td style="font-family:monospace;">${escapeHtml(
          e.student.guardianPhone || e.student.fatherPhone || '-'
        )}</td>
        <td style="text-align:center;">${e.payments.length}</td>
        <td style="text-align:right;font-family:monospace;">${fmtBdt(e.totalAssessed)}</td>
        <td style="text-align:right;font-family:monospace;color:#047857;font-weight:700;">${fmtBdt(
          e.totalPaid
        )}</td>
        <td style="text-align:right;font-family:monospace;color:${
          e.totalDue > 0 ? '#be123c' : '#047857'
        };font-weight:700;">${fmtBdt(e.totalDue)}</td>
        <td style="text-align:center;font-weight:700;color:${
          e.status === 'cleared' ? '#047857' : e.status === 'overdue' ? '#be123c' : '#b45309'
        };">${e.status === 'cleared' ? 'Paid' : e.status === 'overdue' ? 'Overdue' : 'Due'}</td>
      </tr>`
      )
      .join('');

    return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<title>Fee Statement Register - ${escapeHtml(scopeTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: 'Plus Jakarta Sans', 'Hind Siliguri', Arial, sans-serif; color: #0f172a; margin: 0; padding: 16px; background: #fff; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: middle; }
  th { background: #f1f5f9; font-weight: 700; text-align: left; font-size: 10px; text-transform: uppercase; }
  .header { text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 12px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
  .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
  .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; margin-top: 38px; text-align: center; }
  .sig-line { border-top: 1px solid #64748b; padding-top: 6px; font-weight: 600; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:10px;text-align:right;">
    <button onclick="window.print()" style="padding:8px 16px;background:#0f172a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;">Print / Save PDF</button>
  </div>
  <div class="header">
    <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
      <img src="${safeLogo}" alt="Logo" style="width:48px;height:48px;object-fit:contain;" />
      <div>
        <div style="font-size:18px;font-weight:900;">${schoolNameEn}</div>
        <div style="font-size:13px;font-weight:700;color:#1e40af;">${schoolNameBn}</div>
      </div>
    </div>
    <div style="font-size:10px;color:#475569;margin-top:4px;">${schoolMeta}</div>
    <div style="display:inline-block;margin-top:8px;padding:4px 12px;background:#0f172a;color:#fff;border-radius:4px;font-weight:700;font-size:11px;">
      CONSOLIDATED STUDENT FEE STATEMENT REGISTER — ${escapeHtml(scopeTitle)} (Date: ${statementDate})
    </div>
  </div>
  <div class="summary">
    <div class="kpi"><div style="font-size:10px;color:#475569;">Total Students</div><div style="font-size:15px;font-weight:900;">${summary.studentCount} (${summary.clearedCount} Clear / ${summary.dueStudentCount} Due)</div></div>
    <div class="kpi"><div style="font-size:10px;color:#475569;">Total Assessed Fee</div><div style="font-size:15px;font-weight:900;font-family:monospace;">${fmtBdt(summary.totalAssessed)}</div></div>
    <div class="kpi"><div style="font-size:10px;color:#047857;">Total Collected (Joma)</div><div style="font-size:15px;font-weight:900;font-family:monospace;color:#047857;">${fmtBdt(summary.totalPaid)} (${summary.collectionRate}%)</div></div>
    <div class="kpi"><div style="font-size:10px;color:#be123c;">Total Outstanding Due</div><div style="font-size:15px;font-weight:900;font-family:monospace;color:#be123c;">${fmtBdt(summary.totalDue)}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:center;">SL</th>
        <th>Student ID</th>
        <th style="text-align:center;">Roll</th>
        <th>Student Name</th>
        <th>Class &amp; Sec</th>
        <th>Phone</th>
        <th style="text-align:center;">Receipts</th>
        <th style="text-align:right;">Assessed</th>
        <th style="text-align:right;">Paid (Joma)</th>
        <th style="text-align:right;">Due</th>
        <th style="text-align:center;">Status</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr style="background:#f1f5f9;font-weight:900;">
        <td colspan="7" style="text-align:right;">GRAND TOTAL (${summary.studentCount} Students):</td>
        <td style="text-align:right;font-family:monospace;">${fmtBdt(summary.totalAssessed)}</td>
        <td style="text-align:right;font-family:monospace;color:#047857;">${fmtBdt(summary.totalPaid)}</td>
        <td style="text-align:right;font-family:monospace;color:#be123c;">${fmtBdt(summary.totalDue)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  <div class="signatures">
    <div><div class="sig-line">Accounts Officer Signature</div></div>
    <div><div style="min-height:24px;font-style:italic;font-weight:700;">${principalName}</div><div class="sig-line">Headmaster / Principal Signature</div></div>
  </div>
</body>
</html>`;
  }

  // mode === 'individual-bulk'
  const pagesHtml = entries
    .map((entry) => {
      const st = entry.student;
      const paidRows =
        entry.payments.length === 0
          ? `<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8;">No payment deposits</td></tr>`
          : entry.payments
              .map(
                (p) => `<tr>
                  <td style="font-family:monospace;">${escapeHtml(p.paidDate)}</td>
                  <td style="font-family:monospace;font-weight:700;">${escapeHtml(p.receiptNo)}</td>
                  <td>${escapeHtml(p.items?.map((it) => it.headName).join(', ') || 'School Fee')}</td>
                  <td style="text-align:right;font-family:monospace;font-weight:700;color:#065f46;">${fmtBdt(
                    p.amount
                  )}</td>
                </tr>`
              )
              .join('');

      const dueRows =
        entry.dues.length === 0
          ? `<tr><td colspan="4" style="padding:12px;text-align:center;color:#059669;font-weight:700;">All fees cleared (No dues)</td></tr>`
          : entry.dues
              .map(
                (d) => `<tr>
                  <td style="font-weight:600;">${escapeHtml(d.headName)}</td>
                  <td>${escapeHtml(d.month || '-')}</td>
                  <td style="font-family:monospace;">${escapeHtml(d.dueDate || '-')}</td>
                  <td style="text-align:right;font-family:monospace;font-weight:700;color:#9f1239;">${fmtBdt(
                    d.amount
                  )}</td>
                </tr>`
              )
              .join('');

      return `
      <div class="statement-page">
        <div class="header">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
            <img src="${safeLogo}" alt="Logo" style="width:46px;height:46px;object-fit:contain;" />
            <div>
              <div style="font-size:17px;font-weight:900;">${schoolNameEn}</div>
              <div style="font-size:12px;font-weight:700;color:#1e40af;">${schoolNameBn}</div>
            </div>
          </div>
          <div style="font-size:10px;color:#475569;margin-top:3px;">${schoolMeta}</div>
          <div style="display:inline-block;margin-top:6px;padding:3px 10px;background:#0f172a;color:#fff;border-radius:4px;font-weight:700;font-size:10px;">
            STUDENT FEE STATEMENT &amp; LEDGER (ফি জমার ও বকেয়ার বিবরণী)
          </div>
        </div>

        <div class="meta-box">
          <div>
            <div><strong>Student Name:</strong> ${escapeHtml(st.nameEn)} (${escapeHtml(st.nameBn)})</div>
            <div><strong>Student ID:</strong> <span style="font-family:monospace;font-weight:700;color:#1e3a8a;">${escapeHtml(
              st.studentId
            )}</span></div>
            <div><strong>Class &amp; Section:</strong> ${escapeHtml(st.className)} - ${escapeHtml(
        st.section
      )}</div>
            <div><strong>Class Roll:</strong> #${escapeHtml(st.roll)}</div>
          </div>
          <div>
            <div><strong>Father's Name:</strong> ${escapeHtml(st.fatherNameEn)}${
        st.fatherNameBn ? ` (${escapeHtml(st.fatherNameBn)})` : ''
      }</div>
            <div><strong>Guardian Contact:</strong> ${escapeHtml(
              st.guardianPhone || st.fatherPhone || '-'
            )}</div>
            <div><strong>Academic Session:</strong> 2026</div>
            <div><strong>Statement Date:</strong> ${statementDate}</div>
          </div>
        </div>

        <div class="ledger-grid">
          <div class="ledger-box" style="border-color:#6ee7b7;">
            <div class="ledger-head" style="background:#047857;">
              <span>পরিশোধিত ফি (Paid History - Joma)</span>
              <span>Total: ${fmtBdt(entry.totalPaid)}</span>
            </div>
            <table>
              <thead><tr style="background:#ecfdf5;"><th>Date</th><th>Receipt</th><th>Particulars</th><th style="text-align:right;">Amount</th></tr></thead>
              <tbody>${paidRows}</tbody>
              <tfoot><tr style="background:#d1fae5;font-weight:700;"><td colspan="3">Total Paid Amount:</td><td style="text-align:right;font-family:monospace;">${fmtBdt(
                entry.totalPaid
              )}</td></tr></tfoot>
            </table>
          </div>
          <div class="ledger-box" style="border-color:#fda4af;">
            <div class="ledger-head" style="background:#be123c;">
              <span>বকেয়া ফি তালিকা (Outstanding Dues)</span>
              <span>Total: ${fmtBdt(entry.totalDue)}</span>
            </div>
            <table>
              <thead><tr style="background:#fff1f2;"><th>Particulars / Head</th><th>Month</th><th>Due Date</th><th style="text-align:right;">Due Amt</th></tr></thead>
              <tbody>${dueRows}</tbody>
              <tfoot><tr style="background:#ffe4e6;font-weight:700;"><td colspan="3">Total Outstanding Due:</td><td style="text-align:right;font-family:monospace;">${fmtBdt(
                entry.totalDue
              )}</td></tr></tfoot>
            </table>
          </div>
        </div>

        <div class="balance-strip">
          <div>Net Assessed: <strong style="font-family:monospace;">${fmtBdt(entry.totalAssessed)}</strong></div>
          <div>Total Collected (Joma): <strong style="font-family:monospace;color:#065f46;">${fmtBdt(
            entry.totalPaid
          )}</strong></div>
          <div>Current Balance Due: <strong style="font-family:monospace;color:#9f1239;">${fmtBdt(
            entry.totalDue
          )}</strong></div>
        </div>

        <div class="signatures">
          <div><div class="sig-line">Student / Guardian Signature</div></div>
          <div><div class="sig-line">Accounts Officer</div></div>
          <div><div style="min-height:22px;font-style:italic;font-weight:700;">${principalName}</div><div class="sig-line">Headmaster / Principal</div></div>
        </div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<title>Bulk Student Fee Statements - ${escapeHtml(scopeTitle)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: 'Plus Jakarta Sans', 'Hind Siliguri', Arial, sans-serif; color: #0f172a; margin: 0; padding: 14px; background: #fff; font-size: 11px; }
  .statement-page { border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; margin-bottom: 18px; page-break-after: always; break-after: page; }
  .statement-page:last-child { page-break-after: auto; break-after: auto; }
  .header { text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px; }
  .meta-box { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; line-height: 1.55; }
  .ledger-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  .ledger-box { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
  .ledger-head { color: #fff; padding: 6px 8px; font-weight: 700; display: flex; justify-content: space-between; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; text-align: left; }
  .balance-strip { margin-top: 12px; padding: 8px 12px; background: #f1f5f9; border-radius: 6px; display: flex; justify-content: space-between; font-weight: 700; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 34px; text-align: center; }
  .sig-line { border-top: 1px solid #64748b; padding-top: 5px; font-weight: 600; }
  @media print { body { padding: 0; } .no-print { display: none; } .statement-page { margin-bottom: 0; } }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:10px;text-align:right;">
    <button onclick="window.print()" style="padding:8px 16px;background:#0f172a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;">Print All (${entries.length} Statements)</button>
  </div>
  ${pagesHtml}
</body>
</html>`;
}
