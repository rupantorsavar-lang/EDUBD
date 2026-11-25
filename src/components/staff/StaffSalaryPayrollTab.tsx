import React, { useState, useEffect, useMemo } from 'react';
import {
  Staff,
  StaffSalaryPayment,
  SalaryPaymentMethod,
} from '../../types';
import { StorageService } from '../../services/storage';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSchool } from '../../context/SchoolContext';
import { resolveSchoolCode, formatSchoolScopedId } from '../../utils/schoolIdFormatter';
import { DigitInput } from '../common/DigitInput';
import { useTransactionPasswordGuard } from '../fees/TransactionPasswordModal';
import {
  PAYROLL_MONTHS,
  getCurrentYearMonth,
  getTodayDateStr,
  formatMonthLabel,
  shiftYearMonth,
  computeStaffMonthSummary,
  StaffMonthPayrollSummary,
} from '../../utils/payrollCalculator';
import {
  Wallet,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  Printer,
  FileText,
  Download,
  X,
  Plus,
  Trash2,
  Calculator,
  Grid,
  ListChecks,
  History,
  BookOpen,
  Users,
  Banknote,
  HelpCircle,
  CheckSquare,
  Square,
} from 'lucide-react';

interface StaffSalaryPayrollTabProps {
  preselectedStaffId?: string | null;
  onClearPreselectedStaff?: () => void;
  onExpenseUpdated?: () => void;
}

export const StaffSalaryPayrollTab: React.FC<StaffSalaryPayrollTabProps> = ({
  preselectedStaffId,
  onClearPreselectedStaff,
  onExpenseUpdated,
}) => {
  const { currentUser, saasSession } = useAuth();
  const { language, formatTaka, toBnNumber, formatDate, amountInWords } = useLanguage();
  const { schoolProfile } = useSchool();
  const activeSchoolCode = resolveSchoolCode(saasSession?.school?.schoolId, schoolProfile);

  const [staffList, setStaffList] = useState<Staff[]>(() => StorageService.getStaff());
  const [salaryPayments, setSalaryPayments] = useState<StaffSalaryPayment[]>(() =>
    StorageService.getStaffSalaries()
  );

  const currentYm = useMemo(() => getCurrentYearMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYm);
  const [selectedYear, setSelectedYear] = useState<string>(currentYm.slice(0, 4));
  const [subView, setSubView] = useState<'monthly' | 'matrix' | 'history'>('monthly');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Partial' | 'Due'>('all');
  const [matrixOnlyDues, setMatrixOnlyDues] = useState<boolean>(false);
  const [showFormulaGuide, setShowFormulaGuide] = useState<boolean>(false);

  // Pay Salary Modal state
  const [payModalSummary, setPayModalSummary] = useState<StaffMonthPayrollSummary | null>(null);
  const [payBasic, setPayBasic] = useState<number>(0);
  const [payHouseRent, setPayHouseRent] = useState<number>(0);
  const [payMedical, setPayMedical] = useState<number>(0);
  const [payOtherAllow, setPayOtherAllow] = useState<number>(0);
  const [payBonus, setPayBonus] = useState<number>(0);
  const [payPfDeduction, setPayPfDeduction] = useState<number>(0);
  const [payOtherDeduction, setPayOtherDeduction] = useState<number>(0);
  const [payDeductionNote, setPayDeductionNote] = useState<string>('');
  const [payAmountNow, setPayAmountNow] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(getTodayDateStr());
  const [payMethod, setPayMethod] = useState<SalaryPaymentMethod>('Cash');
  const [payVoucherNo, setPayVoucherNo] = useState<string>('');
  const [payRefNo, setPayRefNo] = useState<string>('');
  const [payRemarks, setPayRemarks] = useState<string>('');
  const [syncToExpense, setSyncToExpense] = useState<boolean>(true);
  const [payError, setPayError] = useState<string>('');

  // Bulk Pay Modal state
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [bulkSelectedStaffIds, setBulkSelectedStaffIds] = useState<Set<string>>(new Set());
  const [bulkPayDate, setBulkPayDate] = useState<string>(getTodayDateStr());
  const [bulkPayMethod, setBulkPayMethod] = useState<SalaryPaymentMethod>('Cash');
  const [bulkSyncExpense, setBulkSyncExpense] = useState<boolean>(true);
  const [bulkNotes, setBulkNotes] = useState<string>('');

  // Payslip Modal state
  const [payslipSummary, setPayslipSummary] = useState<StaffMonthPayrollSummary | null>(null);

  // Staff Yearly Ledger Modal state
  const [ledgerStaff, setLedgerStaff] = useState<Staff | null>(null);

  // Delete payment confirmation modal
  const [paymentToDelete, setPaymentToDelete] = useState<StaffSalaryPayment | null>(null);

  // Toast banner
  const [bannerMessage, setBannerMessage] = useState<string>('');
  const { authorizeTransaction, authModalElement } = useTransactionPasswordGuard(language);

  const reloadData = () => {
    setStaffList(StorageService.getStaff());
    setSalaryPayments(StorageService.getStaffSalaries());
  };

  useEffect(() => {
    const handleSync = () => reloadData();
    window.addEventListener('school_cloud_data_synced', handleSync);
    window.addEventListener('school_staff_salaries_updated', handleSync);
    return () => {
      window.removeEventListener('school_cloud_data_synced', handleSync);
      window.removeEventListener('school_staff_salaries_updated', handleSync);
    };
  }, []);

  // Auto-open Pay Modal if navigated with a preselectedStaffId
  useEffect(() => {
    if (!preselectedStaffId) return;
    const target = staffList.find((s) => s.id === preselectedStaffId);
    if (target) {
      const summary = computeStaffMonthSummary(target, selectedMonth, salaryPayments, currentYm);
      openPayModal(summary);
    }
    onClearPreselectedStaff?.();
  }, [preselectedStaffId]);

  const showNotice = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(''), 4000);
  };

  // Monthly Summaries for selectedMonth
  const monthlySummaries = useMemo(() => {
    return staffList
      .filter((st) => st.status !== 'resigned' || salaryPayments.some((p) => p.staffId === st.id && p.month === selectedMonth))
      .map((member) => computeStaffMonthSummary(member, selectedMonth, salaryPayments, currentYm));
  }, [staffList, selectedMonth, salaryPayments, currentYm]);

  // Monthly KPI totals
  const monthlyKpis = useMemo(() => {
    let totalPayable = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let paidCount = 0;
    let dueCount = 0;
    let partialCount = 0;

    monthlySummaries.forEach((s) => {
      if (s.status === 'BeforeJoining' || s.status === 'Resigned') return;
      totalPayable += s.netPayable;
      totalPaid += s.paidAmount;
      totalDue += s.dueAmount;
      if (s.status === 'Paid') paidCount++;
      else if (s.status === 'Partial') {
        partialCount++;
        dueCount++;
      } else if (s.status === 'Due') {
        dueCount++;
      }
    });

    return {
      totalPayable,
      totalPaid,
      totalDue,
      paidCount,
      dueCount,
      partialCount,
      eligibleCount: monthlySummaries.filter(
        (s) => s.status !== 'BeforeJoining' && s.status !== 'Resigned' && s.status !== 'Unconfigured'
      ).length,
    };
  }, [monthlySummaries]);

  // Yearly Matrix Summaries (all staff x 12 months for selectedYear)
  const yearlyMatrixData = useMemo(() => {
    let yearTotalDue = 0;
    let staffWithDueCount = 0;

    const rows = staffList.map((member) => {
      const months = PAYROLL_MONTHS.map((m) => {
        const ym = `${selectedYear}-${m.key}`;
        return computeStaffMonthSummary(member, ym, salaryPayments, currentYm);
      });
      const yearPaid = months.reduce((sum, ms) => sum + ms.paidAmount, 0);
      const yearDue = months.reduce((sum, ms) => sum + ms.dueAmount, 0);
      const dueMonths = months.filter((ms) => ms.status === 'Due' || ms.status === 'Partial');
      if (yearDue > 0) {
        yearTotalDue += yearDue;
        staffWithDueCount++;
      }
      return {
        staff: member,
        months,
        yearPaid,
        yearDue,
        dueMonthsCount: dueMonths.length,
      };
    });

    return { rows, yearTotalDue, staffWithDueCount };
  }, [staffList, selectedYear, salaryPayments, currentYm]);

  // Filtered rows for Monthly Register
  const filteredMonthlyRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return monthlySummaries.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      const st = item.staff;
      return (
        st.nameEn.toLowerCase().includes(q) ||
        (st.nameBn || '').includes(q) ||
        st.employeeId.toLowerCase().includes(q) ||
        st.designation.toLowerCase().includes(q) ||
        st.department.toLowerCase().includes(q)
      );
    });
  }, [monthlySummaries, statusFilter, searchTerm]);

  // Filtered rows for Yearly Matrix
  const filteredMatrixRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return yearlyMatrixData.rows.filter((row) => {
      if (matrixOnlyDues && row.yearDue <= 0) return false;
      if (!q) return true;
      const st = row.staff;
      return (
        st.nameEn.toLowerCase().includes(q) ||
        (st.nameBn || '').includes(q) ||
        st.employeeId.toLowerCase().includes(q) ||
        st.designation.toLowerCase().includes(q)
      );
    });
  }, [yearlyMatrixData, matrixOnlyDues, searchTerm]);

  // Filtered Payment History
  const filteredHistory = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...salaryPayments]
      .sort((a, b) => (b.paymentDate + b.createdAt).localeCompare(a.paymentDate + a.createdAt))
      .filter((p) => {
        if (!q) return true;
        return (
          p.staffNameEn.toLowerCase().includes(q) ||
          (p.staffNameBn || '').includes(q) ||
          p.employeeId.toLowerCase().includes(q) ||
          p.voucherNo.toLowerCase().includes(q) ||
          p.month.includes(q) ||
          (p.referenceNo || '').toLowerCase().includes(q)
        );
      });
  }, [salaryPayments, searchTerm]);

  const openPayModal = (summary: StaffMonthPayrollSummary) => {
    setPayModalSummary(summary);
    setPayBasic(summary.basicSalary);
    setPayHouseRent(summary.houseRentAllowance);
    setPayMedical(summary.medicalAllowance);
    setPayOtherAllow(summary.otherAllowance);
    setPayBonus(summary.bonus);
    setPayPfDeduction(summary.providentFundDeduction);
    setPayOtherDeduction(summary.otherDeduction);
    setPayDeductionNote(summary.deductionNote || '');
    const defaultPay = Math.max(0, summary.netPayable - summary.paidAmount);
    setPayAmountNow(defaultPay);
    setPayDate(getTodayDateStr());
    setPayMethod('Cash');
    setPayVoucherNo(StorageService.generateNextSalaryVoucherNo(summary.month));
    setPayRefNo('');
    setPayRemarks('');
    setSyncToExpense(true);
    setPayError('');
  };

  // Live computed totals inside Pay Modal
  const modalGross = payBasic + payHouseRent + payMedical + payOtherAllow + payBonus;
  const modalTotalDeductions = payPfDeduction + payOtherDeduction;
  const modalNetPayable = Math.max(0, modalGross - modalTotalDeductions);
  const modalAlreadyPaid = payModalSummary ? payModalSummary.paidAmount : 0;
  const modalRemainingBeforeThis = Math.max(0, modalNetPayable - modalAlreadyPaid);
  const modalRemainingAfterThis = Math.max(0, modalRemainingBeforeThis - payAmountNow);

  const handleSaveSalaryPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalSummary) return;

    if (payAmountNow <= 0) {
      setPayError(
        language === 'bn'
          ? 'পরিশোধের পরিমাণ ০ এর বেশি হতে হবে।'
          : 'Payment amount must be greater than 0.'
      );
      return;
    }

    if (payAmountNow > modalRemainingBeforeThis && modalRemainingBeforeThis > 0) {
      setPayError(
        language === 'bn'
          ? `প্রদেয় বকেয়ার (${formatTaka(modalRemainingBeforeThis)}) চেয়ে বেশি পরিশোধ করা যাবে না। প্রয়োজনে বোনাস যোগ করুন।`
          : `Cannot pay more than remaining payable (${formatTaka(modalRemainingBeforeThis)}). Add bonus if paying extra.`
      );
      return;
    }

    const summarySnapshot = payModalSummary;
    const totalPaidAfter = modalAlreadyPaid + payAmountNow;
    const dueAfter = Math.max(0, modalNetPayable - totalPaidAfter);
    const nextStatus: StaffSalaryPayment['status'] =
      dueAfter === 0 ? 'Paid' : totalPaidAfter > 0 ? 'Partial' : 'Unpaid';
    const voucherNoInput = payVoucherNo.trim();
    const basicSnap = payBasic;
    const houseSnap = payHouseRent;
    const medSnap = payMedical;
    const otherAllowSnap = payOtherAllow;
    const bonusSnap = payBonus;
    const grossSnap = modalGross;
    const pfSnap = payPfDeduction;
    const otherDedSnap = payOtherDeduction;
    const dedNoteSnap = payDeductionNote.trim() || undefined;
    const netSnap = modalNetPayable;
    const amtSnap = payAmountNow;
    const dateSnap = payDate;
    const methodSnap = payMethod;
    const refSnap = payRefNo.trim() || undefined;
    const remarksSnap = payRemarks.trim() || undefined;
    const syncExpSnap = syncToExpense;

    authorizeTransaction(
      {
        titleBn: 'স্টাফ বেতন পরিশোধ অনুমোদন',
        titleEn: 'Authorize Staff Salary Payment',
        summaryBn: `${summarySnapshot.staff.nameBn || summarySnapshot.staff.nameEn} • ${formatMonthLabel(
          summarySnapshot.month,
          'bn'
        )} (${methodSnap})`,
        summaryEn: `${summarySnapshot.staff.nameEn} • ${formatMonthLabel(
          summarySnapshot.month,
          'en'
        )} (${methodSnap})`,
        amountLabel: formatTaka(amtSnap),
        tone: 'rose',
      },
      (authStamp) => {
        const record: StaffSalaryPayment = {
          id: `sal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          voucherNo: voucherNoInput || StorageService.generateNextSalaryVoucherNo(summarySnapshot.month),
          staffId: summarySnapshot.staff.id,
          employeeId: summarySnapshot.staff.employeeId,
          staffNameEn: summarySnapshot.staff.nameEn,
          staffNameBn: summarySnapshot.staff.nameBn || summarySnapshot.staff.nameEn,
          designation: summarySnapshot.staff.designation,
          department: summarySnapshot.staff.department,
          month: summarySnapshot.month,
          basicSalary: basicSnap,
          houseRentAllowance: houseSnap,
          medicalAllowance: medSnap,
          otherAllowance: otherAllowSnap,
          bonus: bonusSnap,
          grossSalary: grossSnap,
          providentFundDeduction: pfSnap,
          otherDeduction: otherDedSnap,
          deductionNote: dedNoteSnap,
          netPayable: netSnap,
          paidAmount: amtSnap,
          dueAmount: dueAfter,
          status: nextStatus,
          paymentDate: dateSnap,
          paymentMethod: methodSnap,
          referenceNo: refSnap,
          paidBy: currentUser?.name || 'Admin',
          remarks: remarksSnap,
          createdAt: new Date().toISOString(),
          ...authStamp,
        };

        StorageService.addStaffSalaryPayment(record, { syncToExpense: syncExpSnap });
        reloadData();
        onExpenseUpdated?.();
        setPayModalSummary(null);
        showNotice(
          language === 'bn'
            ? `${summarySnapshot.staff.nameBn || summarySnapshot.staff.nameEn}-এর ${formatMonthLabel(
                summarySnapshot.month,
                'bn'
              )} মাসের বেতন ${formatTaka(amtSnap)} সফলভাবে পরিশোধ হয়েছে।`
            : `Salary ${formatTaka(amtSnap)} paid to ${summarySnapshot.staff.nameEn} for ${formatMonthLabel(
                summarySnapshot.month,
                'en'
              )}.`
        );
      }
    );
  };

  // Bulk pay modal helpers
  const unpaidForMonth = useMemo(
    () => monthlySummaries.filter((s) => (s.status === 'Due' || s.status === 'Partial') && s.dueAmount > 0),
    [monthlySummaries]
  );

  const handleOpenBulkModal = () => {
    setBulkSelectedStaffIds(new Set(unpaidForMonth.map((u) => u.staff.id)));
    setBulkPayDate(getTodayDateStr());
    setBulkPayMethod('Cash');
    setBulkSyncExpense(true);
    setBulkNotes('');
    setShowBulkModal(true);
  };

  const toggleBulkStaff = (staffId: string) => {
    setBulkSelectedStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const handleConfirmBulkPay = (e: React.FormEvent) => {
    e.preventDefault();
    const targets = unpaidForMonth.filter((u) => bulkSelectedStaffIds.has(u.staff.id));
    if (targets.length === 0) return;
    const totalDueAmount = targets.reduce((sum, s) => sum + (s.dueAmount || 0), 0);
    const bulkDateSnap = bulkPayDate;
    const bulkMethodSnap = bulkPayMethod;
    const bulkSyncSnap = bulkSyncExpense;
    const bulkNotesSnap = bulkNotes.trim();

    authorizeTransaction(
      {
        titleBn: 'বাল্ক স্টাফ বেতন পরিশোধ অনুমোদন',
        titleEn: 'Authorize Bulk Staff Payroll Disbursement',
        summaryBn: `${toBnNumber(targets.length)} জন শিক্ষক/স্টাফ • ${formatMonthLabel(
          selectedMonth,
          'bn'
        )} (${bulkMethodSnap})`,
        summaryEn: `${targets.length} staff • ${formatMonthLabel(selectedMonth, 'en')} (${bulkMethodSnap})`,
        amountLabel: formatTaka(totalDueAmount),
        tone: 'rose',
      },
      (authStamp) => {
        let totalDisbursed = 0;
        targets.forEach((summary) => {
          const dueNow = summary.dueAmount;
          if (dueNow <= 0) return;
          const voucherNo = StorageService.generateNextSalaryVoucherNo(summary.month);
          const record: StaffSalaryPayment = {
            id: `sal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            voucherNo,
            staffId: summary.staff.id,
            employeeId: summary.staff.employeeId,
            staffNameEn: summary.staff.nameEn,
            staffNameBn: summary.staff.nameBn || summary.staff.nameEn,
            designation: summary.staff.designation,
            department: summary.staff.department,
            month: summary.month,
            basicSalary: summary.basicSalary,
            houseRentAllowance: summary.houseRentAllowance,
            medicalAllowance: summary.medicalAllowance,
            otherAllowance: summary.otherAllowance,
            bonus: summary.bonus,
            grossSalary: summary.grossSalary,
            providentFundDeduction: summary.providentFundDeduction,
            otherDeduction: summary.otherDeduction,
            deductionNote: summary.deductionNote,
            netPayable: summary.netPayable,
            paidAmount: dueNow,
            dueAmount: 0,
            status: 'Paid',
            paymentDate: bulkDateSnap,
            paymentMethod: bulkMethodSnap,
            paidBy: currentUser?.name || 'Admin',
            remarks: bulkNotesSnap || `Bulk monthly payroll settlement (${summary.month})`,
            createdAt: new Date().toISOString(),
            ...authStamp,
          };
          StorageService.addStaffSalaryPayment(record, { syncToExpense: bulkSyncSnap });
          totalDisbursed += dueNow;
        });

        reloadData();
        onExpenseUpdated?.();
        setShowBulkModal(false);
        showNotice(
          language === 'bn'
            ? `${toBnNumber(targets.length)} জন স্টাফের ${formatMonthLabel(
                selectedMonth,
                'bn'
              )} মাসের মোট ${formatTaka(totalDisbursed)} বেতন পরিশোধ করা হয়েছে।`
            : `Paid ${formatTaka(totalDisbursed)} across ${targets.length} staff for ${formatMonthLabel(
                selectedMonth,
                'en'
              )}.`
        );
      }
    );
  };

  const handleConfirmDeletePayment = () => {
    if (!paymentToDelete) return;
    const targetPay = paymentToDelete;
    authorizeTransaction(
      {
        titleBn: `বেতন ভাউচার বাতিল (${targetPay.voucherNo})`,
        titleEn: `Revert Salary Payment (${targetPay.voucherNo})`,
        summaryBn: `${targetPay.staffNameBn || targetPay.staffNameEn} • ${formatMonthLabel(
          targetPay.month,
          'bn'
        )}`,
        summaryEn: `${targetPay.staffNameEn} • ${formatMonthLabel(targetPay.month, 'en')}`,
        amountLabel: formatTaka(targetPay.paidAmount),
        tone: 'rose',
      },
      () => {
        StorageService.deleteStaffSalaryPayment(targetPay.id);
        reloadData();
        onExpenseUpdated?.();

        if (payModalSummary && payModalSummary.staff.id === targetPay.staffId) {
          const freshPayments = StorageService.getStaffSalaries();
          setPayModalSummary(
            computeStaffMonthSummary(payModalSummary.staff, payModalSummary.month, freshPayments, currentYm)
          );
        }
        setPaymentToDelete(null);
        showNotice(
          language === 'bn'
            ? 'বেতন পেমেন্ট রেকর্ড এবং সংশ্লিষ্ট খরচের এন্ট্রি বাতিল করা হয়েছে।'
            : 'Salary payment record and linked expense entry reverted.'
        );
      }
    );
  };

  const handleExportMonthlyCsv = () => {
    const headers = [
      'Month',
      'Employee ID',
      'Name (EN)',
      'Name (BN)',
      'Designation',
      'Department',
      'Basic',
      'House Rent',
      'Medical',
      'Other Allowance',
      'Bonus',
      'Gross',
      'PF Deduction',
      'Other Deduction',
      'Net Payable',
      'Paid Amount',
      'Due Amount',
      'Status',
      'Last Payment Date',
      'Method',
    ];
    const rows = filteredMonthlyRows.map((r) => [
      r.month,
      formatSchoolScopedId(r.staff.employeeId, activeSchoolCode),
      r.staff.nameEn,
      r.staff.nameBn || '',
      r.staff.designation,
      r.staff.department,
      r.basicSalary,
      r.houseRentAllowance,
      r.medicalAllowance,
      r.otherAllowance,
      r.bonus,
      r.grossSalary,
      r.providentFundDeduction,
      r.otherDeduction,
      r.netPayable,
      r.paidAmount,
      r.dueAmount,
      r.status,
      r.latestPayment?.paymentDate || '',
      r.latestPayment?.paymentMethod || '',
    ]);
    const csv =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join(
        '\n'
      );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `staff_payroll_${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderStatusBadge = (status: StaffMonthPayrollSummary['status']) => {
    switch (status) {
      case 'Paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
            <CheckCircle className="w-3 h-3" />
            <span>{language === 'bn' ? 'পরিশোধিত' : 'Paid'}</span>
          </span>
        );
      case 'Partial':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
            <Clock className="w-3 h-3" />
            <span>{language === 'bn' ? 'আংশিক' : 'Partial'}</span>
          </span>
        );
      case 'Due':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
            <AlertCircle className="w-3 h-3" />
            <span>{language === 'bn' ? 'বকেয়া' : 'Due'}</span>
          </span>
        );
      case 'Upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
            <Calendar className="w-3 h-3" />
            <span>{language === 'bn' ? 'আসন্ন' : 'Upcoming'}</span>
          </span>
        );
      case 'BeforeJoining':
        return (
          <span className="text-[11px] text-slate-400 whitespace-nowrap">
            {language === 'bn' ? 'যোগদানের আগে' : 'Pre-joining'}
          </span>
        );
      case 'Unconfigured':
        return (
          <span className="text-[11px] text-slate-400 whitespace-nowrap">
            {language === 'bn' ? 'বেতন নির্ধারিত নয়' : 'Not set'}
          </span>
        );
      default:
        return (
          <span className="text-[11px] text-slate-400 whitespace-nowrap">
            {status}
          </span>
        );
    }
  };

  const availableYears = useMemo(() => {
    const curY = Number(currentYm.slice(0, 4));
    const set = new Set<number>([curY - 1, curY, curY + 1]);
    salaryPayments.forEach((p) => {
      const y = Number((p.month || '').slice(0, 4));
      if (!isNaN(y) && y > 2000) set.add(y);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [currentYm, salaryPayments]);

  return (
    <div className="space-y-5">
      {/* Top Toolbar & Sub-view Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 print:hidden">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {language === 'bn'
              ? 'শিক্ষক ও স্টাফ বেতন হিসাব (Payroll & Due Tracker)'
              : 'Teacher & Staff Payroll & Due Tracker'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? 'কাকে কোন মাসের বেতন দেওয়া হয়েছে, কার কোন কোন মাস বাকি (Due) আছে এবং পে-স্লিপ পরিচালনা করুন'
              : 'Track monthly salary payouts, pending dues by month, bonuses/deductions, and printable payslips'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setSubView('monthly')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subView === 'monthly'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'মাসিক বেতন রেজিস্টার' : 'Monthly Register'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subView === 'matrix'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? '১২ মাসের Paid/Due ম্যাট্রিক্স' : '12-Month Matrix'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subView === 'history'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>
                {language === 'bn'
                  ? `পেমেন্ট লগ (${toBnNumber(salaryPayments.length)})`
                  : `Payment Log (${salaryPayments.length})`}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowFormulaGuide((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              showFormulaGuide
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'বেতন হিসাবের নিয়ম' : 'Salary Formula'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Salary Calculation Guide */}
      {showFormulaGuide && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Calculator className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'bn'
                  ? 'শিক্ষক ও স্টাফ বেতন হিসাবের পদ্ধতি'
                  : 'How Teacher & Staff Monthly Salary Is Calculated'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowFormulaGuide(false)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1">
                {language === 'bn' ? '১. মোট প্রাপ্য (Gross Salary)' : '1. Gross Salary'}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {language === 'bn'
                  ? 'মূল বেতন (Basic) + বাড়ি ভাড়া (House Rent) + চিকিৎসা ভাতা + অন্যান্য ভাতা + মাসিক বোনাস (যেমন ঈদ বোনাস/অতিরিক্ত ক্লাস)।'
                  : 'Basic Salary + House Rent + Medical Allowance + Other Allowance + Monthly Bonus.'}
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1">
                {language === 'bn' ? '২. নিট বেতন (Net Payable)' : '2. Net Payable'}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {language === 'bn'
                  ? 'মোট প্রাপ্য − প্রভিডেন্ট ফান্ড (PF) − অগ্রিম/অনুপস্থিতি/অন্যান্য কর্তন = নিট প্রদেয় বেতন।'
                  : 'Gross Salary − Provident Fund − Advance/Absent/Other Deductions = Net Payable.'}
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1">
                {language === 'bn' ? '৩. বকেয়া (Due) ও খরচ সিঙ্ক' : '3. Due Tracking & Expense Sync'}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {language === 'bn'
                  ? 'যোগদানের মাস (Joining Date) থেকে বর্তমান মাস পর্যন্ত যেসব মাসের বেতন পূর্ণ পরিশোধ হয়নি সেগুলো স্বয়ংক্রিয়ভাবে বকেয়া (Due) হিসেবে দেখাবে।'
                  : 'Any month from joining date up to current month not fully paid appears automatically as Due or Partial.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {bannerMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{bannerMessage}</span>
          </div>
          <button type="button" onClick={() => setBannerMessage('')} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 print:hidden">
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>
              {language === 'bn'
                ? `মাসিক প্রদেয় (${formatMonthLabel(selectedMonth, 'bn')})`
                : `Payable (${formatMonthLabel(selectedMonth, 'en')})`}
            </span>
            <Wallet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900 font-mono tabular-nums">
            {formatTaka(monthlyKpis.totalPayable)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'bn'
              ? `${toBnNumber(monthlyKpis.eligibleCount)} জন সক্রিয় শিক্ষক/স্টাফ`
              : `${monthlyKpis.eligibleCount} active payroll staff`}
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{language === 'bn' ? 'এই মাসে পরিশোধিত' : 'Paid This Month'}</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-700 font-mono tabular-nums">
            {formatTaka(monthlyKpis.totalPaid)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'bn'
              ? `${toBnNumber(monthlyKpis.paidCount)} জন সম্পূর্ণ পরিশোধিত`
              : `${monthlyKpis.paidCount} staff fully paid`}
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{language === 'bn' ? 'এই মাসে বাকি (Due)' : 'Due This Month'}</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-rose-600 font-mono tabular-nums">
            {formatTaka(monthlyKpis.totalDue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'bn'
              ? `${toBnNumber(monthlyKpis.dueCount)} জনের বেতন বাকি${
                  monthlyKpis.partialCount > 0 ? ` (${toBnNumber(monthlyKpis.partialCount)} জন আংশিক)` : ''
                }`
              : `${monthlyKpis.dueCount} staff pending (${monthlyKpis.partialCount} partial)`}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setSubView('matrix');
            setMatrixOnlyDues(true);
          }}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-amber-300 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>
              {language === 'bn'
                ? `${toBnNumber(selectedYear)} সালের মোট বকেয়া`
                : `${selectedYear} Total Pending Dues`}
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-600 font-mono tabular-nums">
            {formatTaka(yearlyMatrixData.yearTotalDue)}
          </div>
          <div className="text-[11px] text-blue-700 font-medium mt-1">
            {language === 'bn'
              ? `${toBnNumber(yearlyMatrixData.staffWithDueCount)} জনের বকেয়া আছে · দেখতে ক্লিক করুন`
              : `${yearlyMatrixData.staffWithDueCount} staff with dues · Click to inspect`}
          </div>
        </button>
      </div>

      {/* Empty State if no staff yet */}
      {staffList.length === 0 ? (
        <div className="p-10 bg-white rounded-xl border border-slate-200 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-slate-900">
            {language === 'bn' ? 'কোনো শিক্ষক বা স্টাফ যুক্ত করা হয়নি' : 'No Teachers or Staff Found'}
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {language === 'bn'
              ? 'বেতন হিসাব শুরু করতে প্রথমে "শিক্ষক ও স্টাফ ডিরেক্টরি" থেকে শিক্ষক ও স্টাফদের তথ্য এবং মাসিক বেতন যোগ করুন।'
              : 'Add teachers and staff members in the Staff Directory first to calculate and track monthly payroll.'}
          </p>
        </div>
      ) : (
        <>
          {/* SUBVIEW 1: MONTHLY REGISTER */}
          {subView === 'monthly' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden print:border-none">
              {/* Filter & Month Controls */}
              <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3 print:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Month Picker with Prev/Next */}
                  <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedMonth((m) => shiftYearMonth(m, -1))}
                      className="p-2 hover:bg-slate-200/70 text-slate-700 transition-colors"
                      title={language === 'bn' ? 'আগের মাস' : 'Previous Month'}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedMonth(e.target.value);
                          setSelectedYear(e.target.value.slice(0, 4));
                        }
                      }}
                      className="px-2 py-1.5 text-xs font-semibold text-slate-900 bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedMonth((m) => shiftYearMonth(m, 1))}
                      className="p-2 hover:bg-slate-200/70 text-slate-700 transition-colors"
                      title={language === 'bn' ? 'পরের মাস' : 'Next Month'}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Status Filter Buttons */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                    {(
                      [
                        { id: 'all', bn: 'সব', en: 'All' },
                        { id: 'Due', bn: 'বকেয়া', en: 'Due' },
                        { id: 'Partial', bn: 'আংশিক', en: 'Partial' },
                        { id: 'Paid', bn: 'পরিশোধিত', en: 'Paid' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          statusFilter === f.id
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {language === 'bn' ? f.bn : f.en}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={language === 'bn' ? 'নাম, আইডি বা পদবি...' : 'Search staff or ID...'}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {unpaidForMonth.length > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenBulkModal}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>
                        {language === 'bn'
                          ? `একসাথে পরিশোধ (${toBnNumber(unpaidForMonth.length)})`
                          : `Bulk Pay (${unpaidForMonth.length})`}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleExportMonthlyCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Monthly Register Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4">{language === 'bn' ? 'শিক্ষক / স্টাফ' : 'Staff Member'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'মূল + ভাতা + বোনাস' : 'Gross Breakdown'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'কর্তন' : 'Deduction'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'নিট প্রদেয়' : 'Net Payable'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'পরিশোধিত' : 'Paid'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'বকেয়া' : 'Due'}</th>
                      <th className="py-3 px-3 text-center">{language === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                      <th className="py-3 px-3">{language === 'bn' ? 'পেমেন্ট তথ্য' : 'Payment Info'}</th>
                      <th className="py-3 px-4 text-right print:hidden">{language === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMonthlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          {language === 'bn'
                            ? 'এই ফিল্টারের জন্য কোনো রেকর্ড পাওয়া যায়নি।'
                            : 'No payroll records match your current filter.'}
                        </td>
                      </tr>
                    ) : (
                      filteredMonthlyRows.map((row) => {
                        const allowTotal =
                          row.houseRentAllowance + row.medicalAllowance + row.otherAllowance;
                        const deductTotal = row.providentFundDeduction + row.otherDeduction;
                        return (
                          <tr key={row.staff.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => setLedgerStaff(row.staff)}
                                className="text-left group"
                              >
                                <div className="font-semibold text-slate-900 group-hover:text-blue-700">
                                  {row.staff.nameBn || row.staff.nameEn}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-slate-700">
                                    {formatSchoolScopedId(row.staff.employeeId, activeSchoolCode)}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{row.staff.designation}</span>
                                </div>
                              </button>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              <div className="font-semibold text-slate-900">
                                {formatTaka(row.grossSalary)}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {formatTaka(row.basicSalary)} + {formatTaka(allowTotal)}
                                {row.bonus > 0 ? ` + ${formatTaka(row.bonus)}` : ''}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                              {deductTotal > 0 ? `-${formatTaka(deductTotal)}` : '৳ ০'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                              {formatTaka(row.netPayable)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                              {formatTaka(row.paidAmount)}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-mono tabular-nums font-bold ${
                                row.dueAmount > 0 ? 'text-rose-600' : 'text-slate-400'
                              }`}
                            >
                              {formatTaka(row.dueAmount)}
                            </td>
                            <td className="py-3 px-3 text-center">{renderStatusBadge(row.status)}</td>
                            <td className="py-3 px-3 text-[11px] text-slate-600">
                              {row.latestPayment ? (
                                <div>
                                  <div className="font-medium text-slate-800">
                                    {formatDate(row.latestPayment.paymentDate)} · {row.latestPayment.paymentMethod}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {row.latestPayment.voucherNo}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right print:hidden">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {row.status !== 'BeforeJoining' && row.status !== 'Resigned' && (
                                  <button
                                    type="button"
                                    onClick={() => openPayModal(row)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                      row.dueAmount > 0
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {row.status === 'Paid'
                                      ? language === 'bn'
                                        ? 'বিস্তারিত / বোনাস'
                                        : 'Details / Bonus'
                                      : row.status === 'Partial'
                                      ? language === 'bn'
                                        ? 'বাকি দিন'
                                        : 'Pay Due'
                                      : language === 'bn'
                                      ? 'বেতন দিন'
                                      : 'Pay Salary'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setPayslipSummary(row)}
                                  title={language === 'bn' ? 'বেতন স্লিপ দেখুন/প্রিন্ট করুন' : 'View / Print Payslip'}
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLedgerStaff(row.staff)}
                                  title={language === 'bn' ? 'সারা বছরের হিসাব' : 'Yearly Ledger'}
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBVIEW 2: 12-MONTH YEARLY MATRIX */}
          {subView === 'matrix' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600">
                      {language === 'bn' ? 'বছর:' : 'Year:'}
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-900"
                    >
                      {availableYears.map((y) => (
                        <option key={y} value={String(y)}>
                          {language === 'bn' ? toBnNumber(y) : y}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={matrixOnlyDues}
                      onChange={(e) => setMatrixOnlyDues(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      {language === 'bn'
                        ? `শুধু বকেয়া আছে (${toBnNumber(yearlyMatrixData.staffWithDueCount)} জন)`
                        : `Only Staff With Dues (${yearlyMatrixData.staffWithDueCount})`}
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                    {language === 'bn' ? 'পরিশোধিত' : 'Paid'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                    {language === 'bn' ? 'আংশিক' : 'Partial'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                    {language === 'bn' ? 'বকেয়া (Due)' : 'Due'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 inline-block" />
                    {language === 'bn' ? 'আসন্ন' : 'Upcoming'}
                  </span>

                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={language === 'bn' ? 'স্টাফ খুঁজুন...' : 'Search staff...'}
                      className="w-full pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-3 sticky left-0 bg-slate-50 z-10 min-w-[180px] border-r border-slate-200">
                        {language === 'bn' ? 'শিক্ষক / স্টাফ' : 'Staff Member'}
                      </th>
                      {PAYROLL_MONTHS.map((m) => (
                        <th key={m.key} className="py-2.5 px-1.5 text-center min-w-[62px]">
                          {language === 'bn' ? m.shortBn : m.shortEn}
                        </th>
                      ))}
                      <th className="py-2.5 px-3 text-right min-w-[95px] border-l border-slate-200">
                        {language === 'bn' ? 'মোট পরিশোধ' : 'Total Paid'}
                      </th>
                      <th className="py-2.5 px-3 text-right min-w-[95px]">
                        {language === 'bn' ? 'মোট বকেয়া' : 'Total Due'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMatrixRows.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="py-8 text-center text-slate-500 text-xs">
                          {language === 'bn'
                            ? 'কোনো বকেয়া বা রেকর্ড পাওয়া যায়নি।'
                            : 'No matching payroll records found.'}
                        </td>
                      </tr>
                    ) : (
                      filteredMatrixRows.map((row) => (
                        <tr key={row.staff.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-slate-200">
                            <button
                              type="button"
                              onClick={() => setLedgerStaff(row.staff)}
                              className="text-left hover:text-blue-700"
                            >
                              <div className="font-semibold text-slate-900 truncate max-w-[165px]">
                                {row.staff.nameBn || row.staff.nameEn}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {formatSchoolScopedId(row.staff.employeeId, activeSchoolCode)} ·{' '}
                                {row.staff.designation}
                              </div>
                            </button>
                          </td>
                          {row.months.map((ms) => {
                            let cellClass = 'bg-slate-50 text-slate-400 border-slate-200';
                            let cellText = '—';
                            if (ms.status === 'Paid') {
                              cellClass =
                                'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-bold';
                              cellText = '✓ Paid';
                            } else if (ms.status === 'Partial') {
                              cellClass =
                                'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-semibold';
                              cellText = language === 'bn' ? 'আংশিক' : 'Part';
                            } else if (ms.status === 'Due') {
                              cellClass =
                                'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-semibold';
                              cellText = language === 'bn' ? 'বকেয়া' : 'Due';
                            } else if (ms.status === 'Upcoming') {
                              cellClass =
                                'bg-slate-100/70 text-slate-500 border-slate-200 hover:bg-slate-200/70';
                              cellText = language === 'bn' ? 'আসন্ন' : 'Next';
                            }

                            const isClickable =
                              ms.status !== 'BeforeJoining' && ms.status !== 'Resigned';

                            return (
                              <td key={ms.month} className="py-1.5 px-1 text-center">
                                {isClickable ? (
                                  <button
                                    type="button"
                                    onClick={() => openPayModal(ms)}
                                    title={`${formatMonthLabel(ms.month, language)} · Net: ${formatTaka(
                                      ms.netPayable
                                    )}, Paid: ${formatTaka(ms.paidAmount)}, Due: ${formatTaka(ms.dueAmount)}`}
                                    className={`w-full py-1 px-1 rounded border text-[10px] transition-colors whitespace-nowrap ${cellClass}`}
                                  >
                                    {cellText}
                                  </button>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700 border-l border-slate-200">
                            {formatTaka(row.yearPaid)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div
                              className={`font-bold ${
                                row.yearDue > 0 ? 'text-rose-600' : 'text-slate-400'
                              }`}
                            >
                              {formatTaka(row.yearDue)}
                            </div>
                            {row.dueMonthsCount > 0 && (
                              <div className="text-[10px] text-rose-500">
                                {language === 'bn'
                                  ? `${toBnNumber(row.dueMonthsCount)} মাস বাকি`
                                  : `${row.dueMonthsCount} mo due`}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBVIEW 3: PAYMENT HISTORY LOG */}
          {subView === 'history' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {language === 'bn'
                      ? 'সকল বেতন পরিশোধ ভাউচার লগ'
                      : 'All Salary Disbursement Vouchers'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {language === 'bn'
                      ? 'প্রিন্ট বা ভুলবশত এন্ট্রি বাতিল করতে ডানপাশের অ্যাকশন ব্যবহার করুন'
                      : 'View receipts or revert accidental salary payment entries'}
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={language === 'bn' ? 'ভাউচার, নাম বা মাস...' : 'Voucher, staff or month...'}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4">{language === 'bn' ? 'ভাউচার নং' : 'Voucher No'}</th>
                      <th className="py-3 px-3">{language === 'bn' ? 'তারিখ' : 'Pay Date'}</th>
                      <th className="py-3 px-3">{language === 'bn' ? 'শিক্ষক / স্টাফ' : 'Staff'}</th>
                      <th className="py-3 px-3">{language === 'bn' ? 'বেতনের মাস' : 'Salary Month'}</th>
                      <th className="py-3 px-3">{language === 'bn' ? 'মাধ্যম / রেফ' : 'Method & Ref'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'পরিশোধিত' : 'Paid'}</th>
                      <th className="py-3 px-4 text-right">{language === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          {language === 'bn'
                            ? 'এখনো কোনো বেতন পরিশোধ রেকর্ড করা হয়নি।'
                            : 'No salary payment transactions recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      filteredHistory.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono font-semibold text-blue-700">
                            {p.voucherNo}
                          </td>
                          <td className="py-3 px-3 text-slate-700">{formatDate(p.paymentDate)}</td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">
                              {p.staffNameBn || p.staffNameEn}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {formatSchoolScopedId(p.employeeId, activeSchoolCode)} · {p.designation}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-800">
                            {formatMonthLabel(p.month, language)}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            <span>{p.paymentMethod}</span>
                            {p.referenceNo ? (
                              <span className="text-[10px] font-mono text-slate-500 block">
                                Ref: {p.referenceNo}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                            {formatTaka(p.paidAmount)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const staffObj = staffList.find((s) => s.id === p.staffId);
                                  if (staffObj) {
                                    setPayslipSummary(
                                      computeStaffMonthSummary(staffObj, p.month, salaryPayments, currentYm)
                                    );
                                  }
                                }}
                                title={language === 'bn' ? 'পে-স্লিপ দেখুন' : 'View Payslip'}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPaymentToDelete(p)}
                                title={language === 'bn' ? 'পেমেন্ট বাতিল করুন' : 'Revert Payment'}
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: PAY SALARY / ADJUST MONTH MODAL */}
      {payModalSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {language === 'bn' ? 'বেতন হিসাব ও পরিশোধ ফরম' : 'Salary Calculation & Payout'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {payModalSummary.staff.nameBn || payModalSummary.staff.nameEn} ·{' '}
                  {formatSchoolScopedId(payModalSummary.staff.employeeId, activeSchoolCode)} ·{' '}
                  {formatMonthLabel(payModalSummary.month, language)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayModalSummary(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {payError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
                {payError}
              </div>
            )}

            <form onSubmit={handleSaveSalaryPayment} className="mt-4 space-y-4 text-xs">
              {/* Earnings & Deductions Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-1.5">
                    {language === 'bn' ? 'প্রাপ্য ভাতা ও বোনাস (Earnings)' : 'Earnings & Bonus'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {language === 'bn' ? 'মূল বেতন (Basic)' : 'Basic Salary'}
                      </label>
                      <DigitInput
                        min={0}
                        value={payBasic}
                        onValueChange={(val) => setPayBasic(Math.max(0, val))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {language === 'bn' ? 'বাড়ি ভাড়া' : 'House Rent'}
                      </label>
                      <DigitInput
                        min={0}
                        value={payHouseRent}
                        onValueChange={(val) => setPayHouseRent(Math.max(0, val))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {language === 'bn' ? 'চিকিৎসা ভাতা' : 'Medical'}
                      </label>
                      <DigitInput
                        min={0}
                        value={payMedical}
                        onValueChange={(val) => setPayMedical(Math.max(0, val))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {language === 'bn' ? 'অন্যান্য ভাতা' : 'Other Allow.'}
                      </label>
                      <DigitInput
                        min={0}
                        value={payOtherAllow}
                        onValueChange={(val) => setPayOtherAllow(Math.max(0, val))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-emerald-700 mb-1">
                      {language === 'bn' ? 'বোনাস / অতিরিক্ত ক্লাস (+ Bonus)' : 'Bonus / Overtime (+)'}
                    </label>
                    <DigitInput
                      min={0}
                      value={payBonus}
                      onValueChange={(val) => setPayBonus(Math.max(0, val))}
                      className="w-full px-2.5 py-1.5 border border-emerald-200 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-1.5">
                    {language === 'bn' ? 'কর্তন ও নিট হিসাব (Deductions)' : 'Deductions & Net Summary'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {language === 'bn' ? 'প্রভিডেন্ট ফান্ড (PF)' : 'PF Deduction'}
                      </label>
                      <DigitInput
                        min={0}
                        value={payPfDeduction}
                        onValueChange={(val) => setPayPfDeduction(Math.max(0, val))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {language === 'bn' ? 'অগ্রিম/অন্যান্য কর্তন' : 'Other Deduction'}
                      </label>
                      <DigitInput
                        min={0}
                        value={payOtherDeduction}
                        onValueChange={(val) => setPayOtherDeduction(Math.max(0, val))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {language === 'bn' ? 'কর্তনের কারণ (ঐচ্ছিক)' : 'Deduction Reason (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={payDeductionNote}
                      onChange={(e) => setPayDeductionNote(e.target.value)}
                      placeholder={language === 'bn' ? 'যেমন: অগ্রিম সমন্বয় / অনুপস্থিতি' : 'e.g. Advance recovery'}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                    />
                  </div>
                  <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px]">
                    <div className="flex justify-between text-slate-600">
                      <span>{language === 'bn' ? 'মোট প্রাপ্য (Gross):' : 'Gross Salary:'}</span>
                      <span className="font-mono font-semibold">{formatTaka(modalGross)}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-bold">
                      <span>{language === 'bn' ? 'নিট প্রদেয় (Net Payable):' : 'Net Payable:'}</span>
                      <span className="font-mono">{formatTaka(modalNetPayable)}</span>
                    </div>
                    {modalAlreadyPaid > 0 && (
                      <div className="flex justify-between text-emerald-700 font-semibold">
                        <span>{language === 'bn' ? 'ইতোমধ্যে পরিশোধিত:' : 'Already Paid:'}</span>
                        <span className="font-mono">{formatTaka(modalAlreadyPaid)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>{language === 'bn' ? 'বর্তমান বকেয়া (Due):' : 'Remaining Due:'}</span>
                      <span className="font-mono">{formatTaka(modalRemainingBeforeThis)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Execution Details */}
              <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    {language === 'bn' ? 'এখন পরিশোধ করুন (Payout Details)' : 'Payout Details'}
                  </span>
                  {modalRemainingBeforeThis > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPayAmountNow(modalRemainingBeforeThis)}
                        className="px-2 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        {language === 'bn' ? 'পূর্ণ বকেয়া' : 'Full Due'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayAmountNow(Math.round(modalRemainingBeforeThis / 2))}
                        className="px-2 py-1 text-[11px] font-semibold bg-white text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                      >
                        {language === 'bn' ? '৫০% আংশিক' : '50% Partial'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      {language === 'bn' ? 'পরিশোধের টাকা *' : 'Amount Paying Now *'}
                    </label>
                    <DigitInput
                      min={0}
                      value={payAmountNow}
                      onValueChange={(val) => {
                        setPayAmountNow(Math.max(0, val));
                        setPayError('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-900"
                    />
                    <div className="text-[10px] text-slate-500 mt-1">
                      {language === 'bn'
                        ? `পেমেন্টের পর বকেয়া থাকবে: ${formatTaka(modalRemainingAfterThis)}`
                        : `Due after payment: ${formatTaka(modalRemainingAfterThis)}`}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      {language === 'bn' ? 'তারিখ *' : 'Payment Date *'}
                    </label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      {language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as SalaryPaymentMethod)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Cash">Cash (নগদ)</option>
                      <option value="Bank">Bank Transfer (ব্যাংক)</option>
                      <option value="bKash">bKash (বিকাশ)</option>
                      <option value="Nagad">Nagad (নগদ মোবাইল)</option>
                      <option value="Rocket">Rocket (রকেট)</option>
                      <option value="Cheque">Cheque (চেক)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {language === 'bn' ? 'ভাউচার নং' : 'Voucher No'}
                    </label>
                    <input
                      type="text"
                      value={payVoucherNo}
                      onChange={(e) => setPayVoucherNo(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {language === 'bn' ? 'TrxID / চেক নং' : 'Ref / TrxID'}
                    </label>
                    <input
                      type="text"
                      value={payRefNo}
                      onChange={(e) => setPayRefNo(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {language === 'bn' ? 'মন্তব্য' : 'Remarks'}
                    </label>
                    <input
                      type="text"
                      value={payRemarks}
                      onChange={(e) => setPayRemarks(e.target.value)}
                      placeholder="Optional note"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={syncToExpense}
                    onChange={(e) => setSyncToExpense(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    {language === 'bn'
                      ? 'বিদ্যালয়ের খরচের খাতায় (Accounts → Expenses) স্বয়ংক্রিয়ভাবে ভাউচার হিসেবে যোগ করুন'
                      : 'Automatically record as an expense voucher in Accounts → Expenses'}
                  </span>
                </label>
              </div>

              {/* Prior payments for this staff & month */}
              {payModalSummary.payments.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800 text-[11px]">
                    {language === 'bn'
                      ? 'এই মাসে পূর্ববর্তী পেমেন্ট সমূহ:'
                      : 'Previous Payouts for This Month:'}
                  </div>
                  <div className="divide-y divide-slate-200">
                    {payModalSummary.payments.map((p) => (
                      <div key={p.id} className="py-1.5 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-mono font-semibold text-blue-700">{p.voucherNo}</span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span>{formatDate(p.paymentDate)}</span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span>{p.paymentMethod}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-700">
                            {formatTaka(p.paidAmount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPaymentToDelete(p)}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                            title={language === 'bn' ? 'মুছে ফেলুন' : 'Delete'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = payModalSummary;
                    setPayModalSummary(null);
                    setPayslipSummary(target);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'স্লিপ দেখুন' : 'View Payslip'}</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPayModalSummary(null)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    {language === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                  >
                    {language === 'bn' ? 'বেতন পরিশোধ নিশ্চিত করুন' : 'Confirm Salary Payout'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: BULK MONTHLY PAYROLL MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {language === 'bn'
                    ? `${formatMonthLabel(selectedMonth, 'bn')} - একসাথে বেতন পরিশোধ`
                    : `Bulk Payroll Settlement - ${formatMonthLabel(selectedMonth, 'en')}`}
                </h3>
                <p className="text-xs text-slate-500">
                  {language === 'bn'
                    ? 'সিলেক্ট করা সকল স্টাফের অবশিষ্ট বকেয়া এক ক্লিকে পরিশোধ হয়ে যাবে'
                    : 'Settle remaining salary due for all selected staff in one action'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmBulkPay} className="mt-4 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (bulkSelectedStaffIds.size === unpaidForMonth.length) {
                      setBulkSelectedStaffIds(new Set());
                    } else {
                      setBulkSelectedStaffIds(new Set(unpaidForMonth.map((u) => u.staff.id)));
                    }
                  }}
                  className="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1"
                >
                  {bulkSelectedStaffIds.size === unpaidForMonth.length ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {bulkSelectedStaffIds.size === unpaidForMonth.length
                      ? language === 'bn'
                        ? 'সব আনসিলেক্ট করুন'
                        : 'Deselect All'
                      : language === 'bn'
                      ? 'সব সিলেক্ট করুন'
                      : 'Select All'}
                  </span>
                </button>
                <span className="font-mono font-bold text-slate-900">
                  {language === 'bn' ? 'মোট পরিশোধযোগ্য:' : 'Total Selected:'}{' '}
                  {formatTaka(
                    unpaidForMonth
                      .filter((u) => bulkSelectedStaffIds.has(u.staff.id))
                      .reduce((sum, u) => sum + u.dueAmount, 0)
                  )}
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {unpaidForMonth.map((u) => {
                  const checked = bulkSelectedStaffIds.has(u.staff.id);
                  return (
                    <label
                      key={u.staff.id}
                      className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBulkStaff(u.staff.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">
                            {u.staff.nameBn || u.staff.nameEn}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {formatSchoolScopedId(u.staff.employeeId, activeSchoolCode)} · {u.staff.designation}
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="font-bold text-rose-600">{formatTaka(u.dueAmount)}</div>
                        <div className="text-[10px] text-slate-400">
                          {u.status === 'Partial'
                            ? language === 'bn'
                              ? 'বাকি অংশ'
                              : 'Remaining'
                            : language === 'bn'
                            ? 'পূর্ণ বেতন'
                            : 'Full Due'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {language === 'bn' ? 'পেমেন্ট তারিখ' : 'Payment Date'}
                  </label>
                  <input
                    type="date"
                    value={bulkPayDate}
                    onChange={(e) => setBulkPayDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
                  </label>
                  <select
                    value={bulkPayMethod}
                    onChange={(e) => setBulkPayMethod(e.target.value as SalaryPaymentMethod)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Cash">Cash (নগদ)</option>
                    <option value="Bank">Bank Transfer (ব্যাংক)</option>
                    <option value="bKash">bKash (বিকাশ)</option>
                    <option value="Nagad">Nagad (নগদ মোবাইল)</option>
                    <option value="Rocket">Rocket (রকেট)</option>
                    <option value="Cheque">Cheque (চেক)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {language === 'bn' ? 'মন্তব্য' : 'Notes'}
                  </label>
                  <input
                    type="text"
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkSyncExpense}
                  onChange={(e) => setBulkSyncExpense(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  {language === 'bn'
                    ? 'সকল পেমেন্ট বিদ্যালয়ের খরচের খাতায় (Expenses) স্বয়ংক্রিয়ভাবে যোগ করুন'
                    : 'Automatically record expenses in Accounts → Expenses'}
                </span>
              </label>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={bulkSelectedStaffIds.size === 0}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold"
                >
                  {language === 'bn'
                    ? `${toBnNumber(bulkSelectedStaffIds.size)} জনের বেতন পরিশোধ করুন`
                    : `Pay ${bulkSelectedStaffIds.size} Selected Staff`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: STAFF FULL YEARLY LEDGER MODAL */}
      {ledgerStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {ledgerStaff.nameBn || ledgerStaff.nameEn} —{' '}
                  {language === 'bn' ? `${toBnNumber(selectedYear)} সালের বেতন খতিয়ান` : `${selectedYear} Salary Ledger`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatSchoolScopedId(ledgerStaff.employeeId, activeSchoolCode)} · {ledgerStaff.designation} ·{' '}
                  {language === 'bn' ? 'যোগদান:' : 'Joined:'} {formatDate(ledgerStaff.joiningDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLedgerStaff(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">{language === 'bn' ? 'মাস' : 'Month'}</th>
                    <th className="py-2.5 px-3 text-right">{language === 'bn' ? 'নিট প্রদেয়' : 'Net Payable'}</th>
                    <th className="py-2.5 px-3 text-right">{language === 'bn' ? 'পরিশোধিত' : 'Paid'}</th>
                    <th className="py-2.5 px-3 text-right">{language === 'bn' ? 'বকেয়া' : 'Due'}</th>
                    <th className="py-2.5 px-3 text-center">{language === 'bn' ? 'অবস্থা' : 'Status'}</th>
                    <th className="py-2.5 px-3 text-right">{language === 'bn' ? 'অ্যাকশন' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PAYROLL_MONTHS.map((m) => {
                    const ym = `${selectedYear}-${m.key}`;
                    const ms = computeStaffMonthSummary(ledgerStaff, ym, salaryPayments, currentYm);
                    return (
                      <tr key={ym} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {formatMonthLabel(ym, language)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {ms.status === 'BeforeJoining' ? '—' : formatTaka(ms.netPayable)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                          {formatTaka(ms.paidAmount)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${
                            ms.dueAmount > 0 ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {formatTaka(ms.dueAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-center">{renderStatusBadge(ms.status)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {ms.status !== 'BeforeJoining' && ms.status !== 'Resigned' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLedgerStaff(null);
                                  openPayModal(ms);
                                }}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                                  ms.dueAmount > 0
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {ms.dueAmount > 0
                                  ? language === 'bn'
                                    ? 'পরিশোধ'
                                    : 'Pay'
                                  : language === 'bn'
                                  ? 'বিস্তারিত'
                                  : 'Edit'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setLedgerStaff(null);
                                setPayslipSummary(ms);
                              }}
                              className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: OFFICIAL PRINTABLE MONTHLY SALARY PAYSLIP */}
      {payslipSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 print:p-0 print:border-none print:shadow-none my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 print:hidden">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'bn'
                  ? `বেতন বিবরণী ও রসিদ (${formatMonthLabel(payslipSummary.month, 'bn')})`
                  : `Salary Payslip (${formatMonthLabel(payslipSummary.month, 'en')})`}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print Payslip'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayslipSummary(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mt-4 p-5 border border-slate-200 rounded-xl bg-white text-xs text-slate-800">
              <div className="text-center pb-3 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900">{schoolProfile.nameBn}</h2>
                <h3 className="text-xs font-semibold text-slate-700">{schoolProfile.nameEn}</h3>
                <p className="text-[11px] text-slate-500">
                  {schoolProfile.addressBn || schoolProfile.addressEn} · EIIN: {schoolProfile.eiin}
                </p>
                <div className="mt-2 text-xs font-bold text-slate-900 uppercase tracking-wide">
                  {language === 'bn'
                    ? `মাসিক বেতন বিবরণী (Payslip) — ${formatMonthLabel(payslipSummary.month, 'bn')}`
                    : `Salary Slip — ${formatMonthLabel(payslipSummary.month, 'en')}`}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 my-3 py-2 border-b border-slate-100 text-[11px]">
                <div>
                  <span className="text-slate-500">{language === 'bn' ? 'নাম:' : 'Employee:'} </span>
                  <strong className="text-slate-900">
                    {payslipSummary.staff.nameBn || payslipSummary.staff.nameEn}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">{language === 'bn' ? 'আইডি:' : 'EMP ID:'} </span>
                  <strong className="font-mono text-slate-900">
                    {formatSchoolScopedId(payslipSummary.staff.employeeId, activeSchoolCode)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">{language === 'bn' ? 'পদবি:' : 'Designation:'} </span>
                  <strong className="text-slate-900">{payslipSummary.staff.designation}</strong>
                </div>
                <div>
                  <span className="text-slate-500">{language === 'bn' ? 'বিভাগ:' : 'Department:'} </span>
                  <strong className="text-slate-900">{payslipSummary.staff.department}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 my-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2">
                    {language === 'bn' ? 'প্রাপ্তি (Earnings)' : 'Earnings'}
                  </div>
                  <div className="space-y-1 text-[11px] font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="font-sans">{language === 'bn' ? 'মূল বেতন:' : 'Basic Salary:'}</span>
                      <span className="font-semibold">{formatTaka(payslipSummary.basicSalary)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans">{language === 'bn' ? 'বাড়ি ভাড়া:' : 'House Rent:'}</span>
                      <span className="font-semibold">{formatTaka(payslipSummary.houseRentAllowance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans">{language === 'bn' ? 'চিকিৎসা ভাতা:' : 'Medical:'}</span>
                      <span className="font-semibold">{formatTaka(payslipSummary.medicalAllowance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans">{language === 'bn' ? 'অন্যান্য ভাতা:' : 'Other Allow.:'}</span>
                      <span className="font-semibold">{formatTaka(payslipSummary.otherAllowance)}</span>
                    </div>
                    {payslipSummary.bonus > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span className="font-sans">{language === 'bn' ? 'বোনাস:' : 'Bonus:'}</span>
                        <span className="font-semibold">{formatTaka(payslipSummary.bonus)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900">
                      <span className="font-sans">{language === 'bn' ? 'মোট প্রাপ্য:' : 'Gross Salary:'}</span>
                      <span>{formatTaka(payslipSummary.grossSalary)}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2">
                      {language === 'bn' ? 'কর্তন (Deductions)' : 'Deductions'}
                    </div>
                    <div className="space-y-1 text-[11px] font-mono tabular-nums">
                      <div className="flex justify-between">
                        <span className="font-sans">{language === 'bn' ? 'প্রভিডেন্ট ফান্ড:' : 'Provident Fund:'}</span>
                        <span className="font-semibold">{formatTaka(payslipSummary.providentFundDeduction)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans">{language === 'bn' ? 'অন্যান্য কর্তন:' : 'Other Deduction:'}</span>
                        <span className="font-semibold">{formatTaka(payslipSummary.otherDeduction)}</span>
                      </div>
                      {payslipSummary.deductionNote && (
                        <div className="text-[10px] font-sans text-slate-500 pt-1">
                          {payslipSummary.deductionNote}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-slate-900 text-[11px] font-mono tabular-nums">
                    <span className="font-sans">{language === 'bn' ? 'মোট কর্তন:' : 'Total Deductions:'}</span>
                    <span className="text-rose-600">
                      {formatTaka(payslipSummary.providentFundDeduction + payslipSummary.otherDeduction)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs my-3 font-mono tabular-nums">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span className="font-sans">{language === 'bn' ? 'নিট প্রদেয় বেতন:' : 'Net Payable:'}</span>
                  <span className="text-sm">{formatTaka(payslipSummary.netPayable)}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-700 font-semibold">
                  <span className="font-sans">{language === 'bn' ? 'মোট পরিশোধিত:' : 'Total Paid:'}</span>
                  <span>{formatTaka(payslipSummary.paidAmount)}</span>
                </div>
                <div className="flex items-center justify-between font-bold">
                  <span className="font-sans">{language === 'bn' ? 'বকেয়া (Due):' : 'Balance Due:'}</span>
                  <span className={payslipSummary.dueAmount > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                    {formatTaka(payslipSummary.dueAmount)} ({payslipSummary.status})
                  </span>
                </div>
                {payslipSummary.paidAmount > 0 && (
                  <div className="pt-1 border-t border-slate-200 text-[10px] font-sans text-slate-600">
                    {language === 'bn' ? 'কথায়:' : 'In Words:'} {amountInWords(payslipSummary.paidAmount)}
                  </div>
                )}
              </div>

              {payslipSummary.payments.length > 0 && (
                <div className="text-[10px] text-slate-600 mb-3 border-t border-slate-100 pt-2">
                  <span className="font-semibold text-slate-800">
                    {language === 'bn' ? 'ভাউচার সূত্র:' : 'Voucher Ref:'}{' '}
                  </span>
                  {payslipSummary.payments
                    .map(
                      (p) =>
                        `${p.voucherNo} (${formatDate(p.paymentDate)} · ${p.paymentMethod} · ${formatTaka(
                          p.paidAmount
                        )})`
                    )
                    .join(', ')}
                </div>
              )}

              <div className="pt-8 grid grid-cols-3 gap-4 text-center text-[10px] text-slate-500">
                <div>
                  <div className="border-t border-slate-300 pt-1">
                    {language === 'bn' ? 'গ্রহীতার স্বাক্ষর' : 'Employee Signature'}
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-300 pt-1">
                    {language === 'bn' ? 'হিসাবরক্ষক' : 'Accountant'}
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-300 pt-1">
                    {language === 'bn' ? 'প্রধান শিক্ষক / অধ্যক্ষ' : 'Head Teacher / Principal'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: DELETE / REVERT PAYMENT CONFIRMATION */}
      {paymentToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 max-w-md w-full p-6 text-center">
            <h3 className="text-base font-bold text-slate-900">
              {language === 'bn' ? 'বেতন ভাউচার বাতিল করবেন?' : 'Revert Salary Payment?'}
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              {language === 'bn'
                ? `ভাউচার ${paymentToDelete.voucherNo} (${paymentToDelete.staffNameBn || paymentToDelete.staffNameEn} — ${formatTaka(
                    paymentToDelete.paidAmount
                  )}) মুছে দিলে ওই মাসের বেতন পুনরায় বকেয়া (Due) হিসেবে গণ্য হবে এবং যুক্ত খরচের এন্ট্রিও মুছে যাবে।`
                : `Reverting voucher ${paymentToDelete.voucherNo} (${formatTaka(
                    paymentToDelete.paidAmount
                  )}) will mark that amount due again and remove any linked expense entry.`}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button
                type="button"
                onClick={() => setPaymentToDelete(null)}
                className="py-2 px-4 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                {language === 'bn' ? 'থাকুক' : 'Keep'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePayment}
                className="py-2 px-4 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
              >
                {language === 'bn' ? 'হ্যাঁ, বাতিল করুন' : 'Confirm Revert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {authModalElement}
    </div>
  );
};
