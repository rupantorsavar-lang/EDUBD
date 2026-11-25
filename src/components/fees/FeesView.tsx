import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSchool } from '../../context/SchoolContext';
import { StorageService } from '../../services/storage';
import { ClassInfo, FeeInvoice, FeePayment, Expense, ExpenseLineItem, Student, FeeItem, ClassFeeConfig, OnlinePaymentRequest, MfsPaymentSettings, IncomeVoucher } from '../../types';
import { formatClassOptionLabel, getManagedClassList } from '../../utils/academicClasses';
import { ClassFeeSetupTab } from './ClassFeeSetupTab';
import { ScheduledFeesTab } from './ScheduledFeesTab';
import { TransportStudentsTab } from './TransportStudentsTab';
import { StudentFeeStatementTab } from './StudentFeeStatementTab';
import { StaffSalaryPayrollTab } from '../staff/StaffSalaryPayrollTab';
import { IncomeVouchersSection } from './IncomeVouchersSection';
import { PeriodFilterBar } from './PeriodFilterBar';
import { CollectorCollectionTab } from './CollectorCollectionTab';
import { useTransactionPasswordGuard } from './TransactionPasswordModal';
import {
  ExpenseVoucherPrintModal,
  CollectionReportPrintModal,
  CashbookStatementPrintModal,
} from './FinancePrintModals';
import {
  DateFilterPeriod,
  calculateExpenseItemsTotal,
  getPeriodDisplayLabel,
  isDateInPeriod,
  normalizeExpenseItems,
  summarizeByPaymentMethod,
  summarizeExpenseTitle,
  toLocalIsoDate,
} from '../../utils/financeFilters';
import {
  canViewAllCollectorReports,
  computeIncomeExpenseStats,
  filterCollectorTransactions,
  normalizeCollectorTransactions,
} from '../../utils/collectorReports';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { formatGroupName } from '../../utils/i18n';
import { findDuplicatePaidFee } from '../../utils/feeDuplicateCheck';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';
import { buildPrincipalSignatureHtml } from '../../utils/signatureHelper';
import { canEditOrDeleteInvoice } from '../../utils/permissions';
import { DigitInput } from '../common/DigitInput';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';
import {
  Wallet,
  Search,
  Plus,
  Printer,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Receipt,
  X,
  CreditCard,
  Building,
  ArrowDownRight,
  ArrowUpRight,
  Trash2,
  UserCheck,
  Sparkles,
  Calendar,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  Phone,
  Tag,
  BookOpen,
  Bus,
  Award,
  Layers,
  HelpCircle,
  CalendarDays,
  ShieldCheck,
  Zap,
  CheckSquare,
  UserPlus,
  Smartphone,
  Settings,
  MessageSquare,
  Edit2,
  Download,
  Lock,
  KeyRound,
} from 'lucide-react';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_NAMES_BN: Record<string, string> = {
  January: 'জানুয়ারি',
  February: 'ফেব্রুয়ারি',
  March: 'মার্চ',
  April: 'এপ্রিল',
  May: 'মে',
  June: 'জুন',
  July: 'জুলাই',
  August: 'আগস্ট',
  September: 'সেপ্টেম্বর',
  October: 'অক্টোবর',
  November: 'নভেম্বর',
  December: 'ডিসেম্বর',
};

// Preset standard fee heads for quick adding
const QUICK_PRESETS = [
  { id: 'tuition', nameEn: 'Monthly Tuition Fee', nameBn: 'মাসিক বেতন', defaultAmount: 800, icon: BookOpen },
  { id: 'session', nameEn: 'Session Charge', nameBn: 'বাৎসরিক সেশন ফি', defaultAmount: 3000, icon: Building },
  { id: 'exam_mt1', nameEn: '1st Model Test Fee', nameBn: '1ম মডেল টেস্ট ফি', defaultAmount: 300, icon: Award },
  { id: 'exam_sem1', nameEn: '1st Semester Exam Fee', nameBn: '1ম সেমিস্টার পরীক্ষা ফি', defaultAmount: 400, icon: Award },
  { id: 'exam_mt2', nameEn: '2nd Model Test Fee', nameBn: '2য় মডেল টেস্ট ফি', defaultAmount: 300, icon: Award },
  { id: 'exam_sem2', nameEn: '2nd Semester Exam Fee', nameBn: '2য় সেমিস্টার পরীক্ষা ফি', defaultAmount: 400, icon: Award },
  { id: 'exam_mt3', nameEn: '3rd Model Test Fee', nameBn: '3য় মডেল টেস্ট ফি', defaultAmount: 300, icon: Award },
  { id: 'exam_sem3', nameEn: '3rd Semester Exam Fee', nameBn: '3য় সেমিস্টার পরীক্ষা ফি', defaultAmount: 500, icon: Award },
  { id: 'transport', nameEn: 'Transport Bus Fee', nameBn: 'পরিবহন বাস ফি', defaultAmount: 1500, icon: Bus },
  { id: 'tour', nameEn: 'Educational Study Tour', nameBn: 'শিক্ষা সফর ফি', defaultAmount: 1500, icon: Sparkles },
  { id: 'sports', nameEn: 'Sports & Cultural Fee', nameBn: 'ক্রীড়া ও সাংস্কৃতিক ফি', defaultAmount: 500, icon: Sparkles },
];

const EXPENSE_CATEGORIES = [
  'Electricity & Utilities',
  'Printing & Stationery',
  'Science Laboratory',
  'Maintenance & Repairs',
  'Sports & Cultural',
  'Teacher Welfare',
  'Canteen & Refreshment',
  'Furniture & Equipment',
  'Transport & Fuel',
  'Other Expenses',
];

const QUICK_EXPENSE_PRESETS: Array<{ description: string; category: string; unit: string; unitPrice: number }> = [
  { description: 'বিদ্যুৎ বিল পরিশোধ', category: 'Electricity & Utilities', unit: 'মাস', unitPrice: 2500 },
  { description: 'হোয়াইটবোর্ড মার্কার পেন', category: 'Printing & Stationery', unit: 'পিস', unitPrice: 40 },
  { description: 'A4 ফটোকপি কাগজ (রিম)', category: 'Printing & Stationery', unit: 'রিম', unitPrice: 480 },
  { description: 'চা-নাস্তা ও অতিথি আপ্যায়ন', category: 'Canteen & Refreshment', unit: 'প্যাকেজ', unitPrice: 300 },
  { description: 'পানি ও পরিচ্ছন্নতা সামগ্রী', category: 'Maintenance & Repairs', unit: 'সেট', unitPrice: 350 },
  { description: 'ইলেকট্রিক ও ফ্যান মেরামত', category: 'Maintenance & Repairs', unit: 'কাজ', unitPrice: 500 },
  { description: 'পরীক্ষার খাতা ও প্রশ্ন প্রিন্টিং', category: 'Printing & Stationery', unit: 'সেট', unitPrice: 1200 },
  { description: 'ল্যাব কেমিক্যাল ও উপকরণ', category: 'Science Laboratory', unit: 'সেট', unitPrice: 800 },
];

const createBlankExpenseItem = (category = 'Electricity & Utilities'): ExpenseLineItem => ({
  id: `exp_item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  description: '',
  category,
  unit: '',
  quantity: 1,
  unitPrice: 0,
  amount: 0,
});

export type FeesSubTab =
  | 'counter'
  | 'statement'
  | 'online_approvals'
  | 'class_fees'
  | 'scheduled_fees'
  | 'transport_fees'
  | 'collection'
  | 'invoices'
  | 'collector_report'
  | 'dues'
  | 'expenses'
  | 'payroll'
  | 'cashbook';

interface FeesViewProps {
  initialSubTab?: FeesSubTab;
  jumpNonce?: number;
}

export const FeesView: React.FC<FeesViewProps> = ({ initialSubTab, jumpNonce }) => {
  const { activeRole, currentUser } = useAuth();
  const { t, language, formatTaka, toBnNumber, formatDate, amountInWords } = useLanguage();
  const [activeTab, setActiveTab] = useState<FeesSubTab>(initialSubTab || 'counter');

  const students = StorageService.getStudents();
  const { schoolProfile } = useSchool();
  const school = schoolProfile;
  const [invoices, setInvoices] = useState<FeeInvoice[]>(() => StorageService.getInvoices());
  const [payments, setPayments] = useState<FeePayment[]>(() => StorageService.getPayments());
  const [expenses, setExpenses] = useState<Expense[]>(() => StorageService.getExpenses());
  const [incomeVouchers, setIncomeVouchers] = useState<IncomeVoucher[]>(() => StorageService.getIncomeVouchers());
  const [incomeCreateSignal, setIncomeCreateSignal] = useState<number>(0);
  const [academicClasses, setAcademicClasses] = useState<ClassInfo[]>(() => StorageService.getClasses());
  const managedClassList = useMemo(() => getManagedClassList(academicClasses), [academicClasses]);
  const [classFeeConfigs, setClassFeeConfigs] = useState<ClassFeeConfig[]>(() => StorageService.getClassFeeConfigs());

  // Online Fee Payments & Approvals State
  const [onlineRequests, setOnlineRequests] = useState<OnlinePaymentRequest[]>(() =>
    StorageService.getOnlinePaymentRequests()
  );
  const [syncTick, setSyncTick] = useState<number>(0);
  const skipNextAutoItemsRef = useRef<boolean>(false);

  const refreshFinanceData = () => {
    setAcademicClasses(StorageService.getClasses());
    setInvoices(StorageService.getInvoices());
    setPayments(StorageService.getPayments());
    setExpenses(StorageService.getExpenses());
    setIncomeVouchers(StorageService.getIncomeVouchers());
    setClassFeeConfigs(StorageService.getClassFeeConfigs());
    setOnlineRequests(StorageService.getOnlinePaymentRequests());
    setMfsSettings(StorageService.getMfsSettings());
    setSyncTick((n) => n + 1);
  };

  useEffect(() => {
    const handleSync = () => {
      refreshFinanceData();
    };
    const handleIncomeVoucherUpdate = () => {
      setIncomeVouchers(StorageService.getIncomeVouchers());
    };
    const handleClassesUpdated = () => {
      setAcademicClasses(StorageService.getClasses());
      setClassFeeConfigs(StorageService.getClassFeeConfigs());
    };
    window.addEventListener('school_cloud_data_synced', handleSync);
    window.addEventListener('school_income_vouchers_updated', handleIncomeVoucherUpdate);
    window.addEventListener('school_classes_updated', handleClassesUpdated);
    return () => {
      window.removeEventListener('school_cloud_data_synced', handleSync);
      window.removeEventListener('school_income_vouchers_updated', handleIncomeVoucherUpdate);
      window.removeEventListener('school_classes_updated', handleClassesUpdated);
    };
  }, []);
  const [onlineStatusFilter, setOnlineStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [onlineMethodFilter, setOnlineMethodFilter] = useState<'all' | 'bKash' | 'Nagad' | 'Rocket'>('all');
  const [onlineSearch, setOnlineSearch] = useState<string>('');

  // Deep-link support to jump directly into Online Approvals from notification triggers
  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
      if (initialSubTab === 'online_approvals') {
        const latest = StorageService.getOnlinePaymentRequests();
        setOnlineRequests(latest);
        if (latest.some((r) => r.status === 'pending')) {
          setOnlineStatusFilter('pending');
        }
      }
    }
  }, [initialSubTab, jumpNonce]);

  useEffect(() => {
    const handleJumpToApprovals = () => {
      setActiveTab('online_approvals');
      const latest = StorageService.getOnlinePaymentRequests();
      setOnlineRequests(latest);
      if (latest.some((r) => r.status === 'pending')) {
        setOnlineStatusFilter('pending');
      }
    };
    window.addEventListener('open_fees_online_approvals', handleJumpToApprovals);
    return () => window.removeEventListener('open_fees_online_approvals', handleJumpToApprovals);
  }, []);

  // Rejection modal
  const [rejectingRequest, setRejectingRequest] = useState<OnlinePaymentRequest | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');

  // MFS Payment Settings Modal State
  const [showMfsModal, setShowMfsModal] = useState<boolean>(false);
  const [mfsSettings, setMfsSettings] = useState<MfsPaymentSettings>(() =>
    StorageService.getMfsSettings()
  );
  const [bkashNumberInput, setBkashNumberInput] = useState<string>(mfsSettings.bkashNumber || '01711234567');
  const [bkashTypeInput, setBkashTypeInput] = useState<'Personal' | 'Merchant' | 'Agent'>(mfsSettings.bkashType || 'Personal');
  const [nagadNumberInput, setNagadNumberInput] = useState<string>(mfsSettings.nagadNumber || '01911234567');
  const [nagadTypeInput, setNagadTypeInput] = useState<'Personal' | 'Merchant' | 'Agent'>(mfsSettings.nagadType || 'Personal');
  const [rocketNumberInput, setRocketNumberInput] = useState<string>(mfsSettings.rocketNumber || '01811234567');
  const [rocketTypeInput, setRocketTypeInput] = useState<'Personal' | 'Merchant' | 'Agent'>(mfsSettings.rocketType || 'Personal');
  const [mfsInstructionsInput, setMfsInstructionsInput] = useState<string>(
    mfsSettings.instructionsBn || 'বিকাশ, নগদ অথবা রকেট নম্বরে সেন্ড মানি বা পেমেন্ট করে নিচে ট্রানজেকশন আইডি (TrxID) ও আপনার ফোন নম্বর দিন।'
  );
  const [mfsSavedSuccess, setMfsSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    const handleOnlineUpdate = () => {
      setOnlineRequests(StorageService.getOnlinePaymentRequests());
      setInvoices(StorageService.getInvoices());
      setPayments(StorageService.getPayments());
    };
    const handleMfsUpdate = () => {
      const latest = StorageService.getMfsSettings();
      setMfsSettings(latest);
      setBkashNumberInput(latest.bkashNumber || '');
      setBkashTypeInput(latest.bkashType || 'Personal');
      setNagadNumberInput(latest.nagadNumber || '');
      setNagadTypeInput(latest.nagadType || 'Personal');
      setRocketNumberInput(latest.rocketNumber || '');
      setRocketTypeInput(latest.rocketType || 'Personal');
      setMfsInstructionsInput(latest.instructionsBn || '');
    };
    window.addEventListener('online_payments_updated', handleOnlineUpdate);
    window.addEventListener('mfs_settings_updated', handleMfsUpdate);
    return () => {
      window.removeEventListener('online_payments_updated', handleOnlineUpdate);
      window.removeEventListener('mfs_settings_updated', handleMfsUpdate);
    };
  }, []);

  const pendingRequestsCount = useMemo(() => {
    return onlineRequests.filter((r) => r.status === 'pending').length;
  }, [onlineRequests]);

  // Search & Filter for tables
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('all');

  // COUNTER STATE
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [deskSelectedClass, setDeskSelectedClass] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(() => students[0] || null);

  // Line items for the new invoice (starts empty until cashier explicitly selects fee items)
  const [invoiceItems, setInvoiceItems] = useState<FeeItem[]>([]);

  // Selected multi-months for quick tuition fee addition
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [academicYear, setAcademicYear] = useState<string>(() => schoolProfile.currentSession || '2026');
  const [monthlyTuitionRate, setMonthlyTuitionRate] = useState<number>(() => {
    const s = students[0];
    return s ? StorageService.getClassFee(s.className).tuitionFee : 1200;
  });

  // Custom Item Inputs
  const [customItemTitle, setCustomItemTitle] = useState<string>('');
  const [customItemPeriod, setCustomItemPeriod] = useState<string>('');
  const [customItemAmount, setCustomItemAmount] = useState<number>(500);
  const [counterLayoutMode, setCounterLayoutMode] = useState<'side_by_side' | 'stacked'>('side_by_side');

  // Financial adjustments
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>('');
  const [lateFineAmount, setLateFineAmount] = useState<number>(0);
  const [paidNowAmount, setPaidNowAmount] = useState<number>(0);
  // DEFAULT PAYMENT METHOD IS CASH (নগদ গ্রহণ)
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Bank'>('Cash');
  const [transactionId, setTransactionId] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isManualPaidAmount, setIsManualPaidAmount] = useState<boolean>(false);

  // Single collect modal
  const [showCollectModal, setShowCollectModal] = useState<boolean>(false);
  const [targetInvoice, setTargetInvoice] = useState<FeeInvoice | null>(null);
  const [singleCollectAmount, setSingleCollectAmount] = useState<number>(0);

  // Printable Official Money Receipt Modal
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [selectedReceipt, setSelectedReceipt] = useState<FeePayment | null>(null);
  const [selectedReceiptInvoice, setSelectedReceiptInvoice] = useState<FeeInvoice | null>(null);

  // Printable Official Due List Modal
  const [showDuePrintModal, setShowDuePrintModal] = useState<boolean>(false);
  const [duePrintMode, setDuePrintMode] = useState<'summary' | 'detailed'>('summary');

  // Expense Modal State (Create & Edit - Multi-Item Supported)
  const localToday = toLocalIsoDate();
  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>('Electricity & Utilities');
  const [expenseItems, setExpenseItems] = useState<ExpenseLineItem[]>(() => [createBlankExpenseItem('Electricity & Utilities')]);
  const [expenseDate, setExpenseDate] = useState<string>(localToday);
  const [expensePaidTo, setExpensePaidTo] = useState<string>('');
  const [expenseMethod, setExpenseMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank' | 'Cheque'>('Cash');
  const [expenseRefNo, setExpenseRefNo] = useState<string>('');
  const [expenseNotes, setExpenseNotes] = useState<string>('');
  const [expenseFormError, setExpenseFormError] = useState<string>('');
  const [printingExpense, setPrintingExpense] = useState<Expense | null>(null);

  // Period Filters & Print Modals for Collection (Receipts), Invoices, and Cashbook
  const [receiptPeriodFilter, setReceiptPeriodFilter] = useState<DateFilterPeriod>('all');
  const [receiptCustomStart, setReceiptCustomStart] = useState<string>(localToday);
  const [receiptCustomEnd, setReceiptCustomEnd] = useState<string>(localToday);
  const [receiptMethodFilter, setReceiptMethodFilter] = useState<string>('all');
  const [receiptCollectorFilter, setReceiptCollectorFilter] = useState<string>('all');
  const [receiptSearch, setReceiptSearch] = useState<string>('');
  const [showCollectionPrintModal, setShowCollectionPrintModal] = useState<boolean>(false);

  const [cashbookPeriodFilter, setCashbookPeriodFilter] = useState<DateFilterPeriod>('all');
  const [cashbookCustomStart, setCashbookCustomStart] = useState<string>(localToday);
  const [cashbookCustomEnd, setCashbookCustomEnd] = useState<string>(localToday);
  const [cashbookMethodFilter, setCashbookMethodFilter] = useState<string>('all');
  const [showCashbookPrintModal, setShowCashbookPrintModal] = useState<boolean>(false);

  const [invoicePeriodFilter, setInvoicePeriodFilter] = useState<DateFilterPeriod>('all');
  const [invoiceCustomStart, setInvoiceCustomStart] = useState<string>(localToday);
  const [invoiceCustomEnd, setInvoiceCustomEnd] = useState<string>(localToday);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | 'Paid' | 'Partial' | 'Unpaid'>('all');

  // Edit Receipt Modal State
  const [editingReceipt, setEditingReceipt] = useState<FeePayment | null>(null);
  const [showEditReceiptModal, setShowEditReceiptModal] = useState<boolean>(false);
  const [editReceiptAmount, setEditReceiptAmount] = useState<number>(0);
  const [editReceiptDate, setEditReceiptDate] = useState<string>('');
  const [editReceiptMethod, setEditReceiptMethod] = useState<string>('Cash');
  const [editReceiptTrxId, setEditReceiptTrxId] = useState<string>('');
  const [editReceiptNotes, setEditReceiptNotes] = useState<string>('');

  // Edit Due / Invoice Modal State
  const [editingInvoice, setEditingInvoice] = useState<FeeInvoice | null>(null);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState<boolean>(false);
  const [editInvoiceFeeType, setEditInvoiceFeeType] = useState<string>('');
  const [editInvoiceNetAmount, setEditInvoiceNetAmount] = useState<number>(0);
  const [editInvoiceDueDate, setEditInvoiceDueDate] = useState<string>('');
  const [editInvoiceDiscount, setEditInvoiceDiscount] = useState<number>(0);

  // Online Payment Approval State & Handler
  const [approvingRequest, setApprovingRequest] = useState<OnlinePaymentRequest | null>(null);
  const [approvalFeedbackNotice, setApprovalFeedbackNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleOpenApproveModal = (req: OnlinePaymentRequest) => {
    setApprovingRequest(req);
  };

  const handleExecuteApproval = (req: OnlinePaymentRequest) => {
    if (req.status === 'approved') return;
    authorizeTransaction(
      {
        titleBn: 'অনলাইন পেমেন্ট অনুমোদন ও রসিদ তৈরি',
        titleEn: 'Approve Online Payment & Issue Receipt',
        summaryBn: `${req.studentName} (${req.className}) • ${req.paymentMethod} TrxID: ${req.transactionId}`,
        summaryEn: `${req.studentName} (${req.className}) • ${req.paymentMethod} TrxID: ${req.transactionId}`,
        amountLabel: formatTaka(req.amount),
        tone: 'emerald',
      },
      (authStamp) => {
    try {

      const nowMs = Date.now();
      const officialReceiptNo = `MR-${String(nowMs).slice(-6)}`;
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];

      const matchedStudent = students.find(
        (st) =>
          st.id === req.studentId ||
          st.studentId === req.studentId ||
          (st.roll === req.studentRoll && st.className === req.className)
      );

      const isPayAllReq =
        Boolean(req.isPayAll) ||
        /সকল\s*বকে(?:য়া|য়া)|all\s*outstanding\s*dues|all\s*dues/i.test(req.feeTitle || '');

      let resolvedItems: FeeItem[] = Array.isArray(req.items) && req.items.length > 0 ? [...req.items] : [];
      if (resolvedItems.length === 0 && isPayAllReq && matchedStudent) {
        const currentDues = StorageService.getStudentDueFees(matchedStudent, req.requestDate || todayStr);
        let remainingBudget = Number(req.amount) || 0;
        for (const d of currentDues) {
          if (remainingBudget <= 0) break;
          if (d.amount <= remainingBudget) {
            resolvedItems.push(d);
            remainingBudget -= d.amount;
          } else {
            resolvedItems.push({ ...d, amount: remainingBudget });
            remainingBudget = 0;
          }
        }
      }
      if (resolvedItems.length === 0) {
        resolvedItems = [
          {
            id: `online_${nowMs}`,
            headName: req.feeTitle,
            month: req.requestDate || todayStr,
            amount: req.amount,
          },
        ];
      }

      const allInvs = StorageService.getInvoices();
      const studentUnpaidInvs = allInvs.filter(
        (inv) =>
          (inv.studentId === req.studentId ||
            (matchedStudent && (inv.studentId === matchedStudent.id || inv.studentId === matchedStudent.studentId))) &&
          (inv.status === 'Unpaid' || inv.status === 'Partial') &&
          inv.dueAmount > 0
      );

      // 1. Settle matching existing unpaid invoice(s) first if applicable
      let remainingAmount = Number(req.amount) || 0;
      const nonInvoiceItems: FeeItem[] = [];

      if (isPayAllReq) {
        const explicitInvIds = new Set(
          resolvedItems
            .filter((it) => it.id && it.id.startsWith('due_inv_'))
            .map((it) => it.id.replace('due_inv_', ''))
        );
        for (const inv of studentUnpaidInvs) {
          if (remainingAmount <= 0) break;
          if (explicitInvIds.size === 0 || explicitInvIds.has(inv.id)) {
            const payPart = Math.min(remainingAmount, inv.dueAmount);
            if (payPart > 0) {
              const oldPayment: FeePayment = {
                id: `pay_${nowMs}_inv_${inv.id}`,
                receiptNo: officialReceiptNo,
                invoiceId: inv.id,
                studentId: req.studentId,
                studentName: req.studentName,
                className: req.className as any,
                roll: req.studentRoll,
                amount: payPart,
                items:
                  inv.items && inv.items.length > 0
                    ? inv.items
                    : [{ id: `due_inv_${inv.id}`, headName: inv.feeType, month: inv.month, amount: payPart }],
                paidDate: todayStr,
                paymentMethod: req.paymentMethod as any,
                transactionId: req.transactionId,
                collectedBy: `${req.paymentMethod} Online (Approved by ${currentUser.name})`,
                collectedById: currentUser.linkedStaffId || currentUser.id,
                collectedByEmail: currentUser.email,
                collectedByRole: activeRole,
                notes: `${inv.feeType} - অনলাইন পেমেন্ট অনুমোদন। প্রেরক: ${req.senderPhone}, TrxID: ${req.transactionId}`,
                ...authStamp,
              };
              StorageService.addPayment(oldPayment);
              remainingAmount -= payPart;
            }
          }
        }
        resolvedItems.forEach((it) => {
          if (!it.id || !it.id.startsWith('due_inv_')) {
            nonInvoiceItems.push(it);
          }
        });
      } else {
        const exactUnpaid = studentUnpaidInvs.find(
          (inv) =>
            resolvedItems.some((it) => it.id === `due_inv_${inv.id}`) ||
            inv.feeType === req.feeTitle ||
            inv.dueAmount === req.amount
        );
        if (exactUnpaid) {
          const payPart = Math.min(remainingAmount, exactUnpaid.dueAmount);
          const linkedPayment: FeePayment = {
            id: `pay_${nowMs}`,
            receiptNo: officialReceiptNo,
            invoiceId: exactUnpaid.id,
            studentId: req.studentId,
            studentName: req.studentName,
            className: req.className as any,
            roll: req.studentRoll,
            amount: payPart,
            items: resolvedItems,
            paidDate: todayStr,
            paymentMethod: req.paymentMethod as any,
            transactionId: req.transactionId,
            collectedBy: `${req.paymentMethod} Online (Approved by ${currentUser.name})`,
            collectedById: currentUser.linkedStaffId || currentUser.id,
            collectedByEmail: currentUser.email,
            collectedByRole: activeRole,
            notes: `${req.feeTitle} - অনলাইন পেমেন্ট অনুমোদন। প্রেরক: ${req.senderPhone}, TrxID: ${req.transactionId}`,
            ...authStamp,
          };
          StorageService.addPayment(linkedPayment);
          remainingAmount -= payPart;
        } else {
          nonInvoiceItems.push(...resolvedItems);
        }
      }

      // 2. For remaining non-invoice dues (monthly tuition, scheduled fees, transport, custom fees),
      // create ONE invoice first and link the payment to invoiceId = newInvoice.id
      if (remainingAmount > 0) {
        const invoiceId = `inv_${nowMs}`;
        const itemsForInvoice = nonInvoiceItems.length > 0 ? nonInvoiceItems : resolvedItems;
        const itemMonths = itemsForInvoice
          .map((it) => it.month)
          .filter((m): m is string => Boolean(m && m.trim()));
        const monthSummary = itemMonths.length > 0 ? Array.from(new Set(itemMonths)).join(', ') : todayStr;

        const newInvoice: FeeInvoice = {
          id: invoiceId,
          invoiceNo: `INV-${String(nowMs).slice(-6)}`,
          studentId: req.studentId,
          studentNameEn: req.studentName,
          studentNameBn: req.studentName,
          className: req.className as any,
          section: req.section as any,
          roll: req.studentRoll,
          session: schoolProfile.currentSession || '2026',
          feeType: req.feeTitle,
          month: monthSummary,
          items: itemsForInvoice,
          amount: remainingAmount,
          discount: 0,
          netAmount: remainingAmount,
          paidAmount: 0,
          dueAmount: remainingAmount,
          dueDate: todayStr,
          status: 'Unpaid',
          ...authStamp,
        };
        StorageService.addInvoice(newInvoice);

        const newPayment: FeePayment = {
          id: `pay_${nowMs}`,
          receiptNo: officialReceiptNo,
          invoiceId: newInvoice.id,
          studentId: req.studentId,
          studentName: req.studentName,
          className: req.className as any,
          roll: req.studentRoll,
          amount: remainingAmount,
          items: itemsForInvoice,
          paidDate: todayStr,
          paymentMethod: req.paymentMethod as any,
          transactionId: req.transactionId,
          collectedBy: `${req.paymentMethod} Online (Approved by ${currentUser.name})`,
          collectedById: currentUser.linkedStaffId || currentUser.id,
          collectedByEmail: currentUser.email,
          collectedByRole: activeRole,
          notes: `${req.feeTitle} - অনলাইন পেমেন্ট অনুমোদন। প্রেরক: ${req.senderPhone}, TrxID: ${req.transactionId}`,
          ...authStamp,
        };
        StorageService.addPayment(newPayment);
      }

      // 3. Mark Online Request as Approved
      StorageService.updateOnlinePaymentRequest(req.id, {
        status: 'approved',
        approvedAt: nowIso,
        approvedBy: currentUser.name,
        receiptNo: officialReceiptNo,
        items: resolvedItems,
      });

      // Update local states
      setOnlineRequests(StorageService.getOnlinePaymentRequests());
      setInvoices(StorageService.getInvoices());
      setPayments(StorageService.getPayments());
      setApprovingRequest(null);

      setApprovalFeedbackNotice({
        message: language === 'bn'
          ? `✓ ${req.studentName} এর ${formatTaka(req.amount)} টাকার অনলাইন পেমেন্ট সফলভাবে অনুমোদিত হয়েছে এবং মানি রসিদ (${officialReceiptNo}) তৈরি হয়েছে।`
          : `✓ Successfully approved ${formatTaka(req.amount)} for ${req.studentName}. Receipt #${officialReceiptNo} issued.`,
        type: 'success',
      });
      setTimeout(() => setApprovalFeedbackNotice(null), 6000);
    } catch (err: any) {
      console.error('Error approving payment request:', err);
      setApprovalFeedbackNotice({
        message: language === 'bn' ? 'পেমেন্ট অনুমোদন করতে ত্রুটি হয়েছে।' : 'Error approving payment request.',
        type: 'error',
      });
    }
      }
    );
  };

  const handleOpenRejectModal = (req: OnlinePaymentRequest) => {
    setRejectingRequest(req);
    setRejectionReasonInput('ট্রানজেকশন আইডি সঠিক নয় / একাউন্টে টাকা জমা হয়নি');
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRequest) return;
    const targetReq = rejectingRequest;
    const reason =
      rejectionReasonInput.trim() ||
      (language === 'bn' ? 'ট্রানজেকশন তথ্য যাচাই করা সম্ভব হয়নি' : 'Transaction could not be verified');

    authorizeTransaction(
      {
        titleBn: 'অনলাইন পেমেন্ট রিকোয়েস্ট বাতিল',
        titleEn: 'Reject Online Payment Request',
        summaryBn: `${targetReq.studentName} • ${targetReq.paymentMethod} TrxID: ${targetReq.transactionId}`,
        summaryEn: `${targetReq.studentName} • ${targetReq.paymentMethod} TrxID: ${targetReq.transactionId}`,
        amountLabel: formatTaka(targetReq.amount),
        tone: 'rose',
      },
      () => {
        StorageService.updateOnlinePaymentRequest(targetReq.id, {
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectedBy: currentUser.name,
          rejectedReason: reason,
        });

        setOnlineRequests(StorageService.getOnlinePaymentRequests());
        setRejectingRequest(null);
        setRejectionReasonInput('');

        setApprovalFeedbackNotice({
          message: language === 'bn'
            ? 'পেমেন্ট রিকোয়েস্টটি বাতিল করা হয়েছে এবং কারণ সংরক্ষণ করা হয়েছে।'
            : 'Payment request rejected with reason.',
          type: 'success',
        });
        setTimeout(() => setApprovalFeedbackNotice(null), 5000);
      }
    );
  };

  const handleSaveMfsSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: MfsPaymentSettings = {
      ...mfsSettings,
      bkashNumber: bkashNumberInput.trim(),
      bkashType: bkashTypeInput,
      nagadNumber: nagadNumberInput.trim(),
      nagadType: nagadTypeInput,
      rocketNumber: rocketNumberInput.trim(),
      rocketType: rocketTypeInput,
      instructionsBn: mfsInstructionsInput.trim(),
    };
    StorageService.saveMfsSettings(updated);
    setMfsSettings(updated);
    setMfsSavedSuccess(true);
    setTimeout(() => {
      setMfsSavedSuccess(false);
      setShowMfsModal(false);
    }, 1200);
  };

  const canManage = activeRole === 'super_admin' || activeRole === 'admin' || activeRole === 'accountant' || activeRole === 'master_admin';
  const canEditDeleteInvoices = canEditOrDeleteInvoice(activeRole);

  const {
    authorizeTransaction,
    authModalElement,
    openSecuritySettings,
    lockNow,
    isTimedUnlocked,
    securityConfig,
    UnlockIcon,
  } = useTransactionPasswordGuard(language);

  // Comprehensive Outstanding Dues across all students (Unpaid invoices + Overdue monthly tuition + Scheduled fees + Transport + Custom fees)
  const comprehensiveDueEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      student?: Student;
      studentId: string;
      studentNameEn: string;
      studentNameBn: string;
      className: string;
      section: string;
      roll: string;
      session: string;
      headName: string;
      monthLabel: string;
      dueDate: string;
      isOverdue: boolean;
      amount: number;
      sourceInvoice?: FeeInvoice;
      dueItem: FeeItem;
    }> = [];

    const invoiceById = new Map<string, FeeInvoice>();
    invoices.forEach((inv) => invoiceById.set(inv.id, inv));
    const matchedStudentIds = new Set<string>();

    students.forEach((st) => {
      matchedStudentIds.add(st.id);
      if (st.studentId) matchedStudentIds.add(st.studentId);
      const stDues = StorageService.getStudentDueFees(st);
      stDues.forEach((due) => {
        const isInvoiceDue = due.id.startsWith('due_inv_');
        const sourceInvoice = isInvoiceDue ? invoiceById.get(due.id.replace('due_inv_', '')) : undefined;
        entries.push({
          id: `${st.id}_${due.id}`,
          student: st,
          studentId: st.studentId || st.id,
          studentNameEn: st.nameEn,
          studentNameBn: st.nameBn,
          className: st.className,
          section: st.section,
          roll: st.roll,
          session: (st as any).session || academicYear || school.currentSession || '2026',
          headName: due.headName,
          monthLabel: due.month || due.headName,
          dueDate: due.dueDate || '—',
          isOverdue: Boolean(due.isOverdue),
          amount: Number(due.amount) || 0,
          sourceInvoice,
          dueItem: due,
        });
      });
    });

    // Include any orphan unpaid invoices whose studentId wasn't found in active students list
    invoices.forEach((inv) => {
      if (inv.dueAmount > 0 && !matchedStudentIds.has(inv.studentId)) {
        entries.push({
          id: `orphan_inv_${inv.id}`,
          studentId: inv.studentId,
          studentNameEn: inv.studentNameEn,
          studentNameBn: inv.studentNameBn || inv.studentNameEn,
          className: inv.className,
          section: inv.section,
          roll: inv.roll,
          session: inv.session || academicYear || '2026',
          headName: `Previous Invoice Due (${inv.invoiceNo}): ${inv.feeType}`,
          monthLabel: inv.month || inv.feeType,
          dueDate: inv.dueDate || '—',
          isOverdue: true,
          amount: inv.dueAmount,
          sourceInvoice: inv,
          dueItem: {
            id: `due_inv_${inv.id}`,
            headName: `Previous Invoice Due (${inv.invoiceNo}): ${inv.feeType}`,
            month: inv.month || inv.dueDate,
            dueDate: inv.dueDate,
            isOverdue: true,
            amount: inv.dueAmount,
          },
        });
      }
    });

    return entries;
  }, [students, invoices, payments, classFeeConfigs, syncTick, activeTab, academicYear, school.currentSession]);

  // Financial Totals
  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalIncomeVouchersAmount = incomeVouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
  const totalInstitutionalIncome = totalCollected + totalIncomeVouchersAmount;
  const totalDues = comprehensiveDueEntries.reduce((sum, d) => sum + d.amount, 0);
  const totalExpensesAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netCashInHand = totalInstitutionalIncome - totalExpensesAmount;

  // Today's live snapshot across Fee Receipts, Income Vouchers, and Expenses
  const todayFeeCollection = useMemo(
    () => payments.filter((p) => isDateInPeriod(p.paidDate, 'today')).reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments]
  );
  const todayIncomeVoucherCollection = useMemo(
    () => incomeVouchers.filter((v) => isDateInPeriod(v.date, 'today')).reduce((s, v) => s + (Number(v.amount) || 0), 0),
    [incomeVouchers]
  );
  const todayTotalCollection = todayFeeCollection + todayIncomeVoucherCollection;
  const todayExpenseTotal = useMemo(
    () => expenses.filter((e) => isDateInPeriod(e.date, 'today')).reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const staffList = useMemo(() => StorageService.getStaff(), [syncTick]);
  const canViewAllCollectors = canViewAllCollectorReports(activeRole);

  const { transactions: collectorNormalizedTxs, directory: collectorDirectory } = useMemo(
    () => normalizeCollectorTransactions(payments, incomeVouchers, staffList, currentUser, expenses),
    [payments, incomeVouchers, staffList, currentUser, expenses]
  );
  const currentCollectorKey = useMemo(
    () => collectorDirectory.resolveUserKey(currentUser),
    [collectorDirectory, currentUser]
  );
  const myTodayStats = useMemo(() => {
    const myToday = filterCollectorTransactions(collectorNormalizedTxs, {
      period: 'today',
      collectorKey: currentCollectorKey,
    });
    const st = computeIncomeExpenseStats(myToday);
    return {
      total: st.incomeTotal,
      expense: st.expenseTotal,
      netCashInHand: st.netCashInHand,
      netBalance: st.netBalance,
      cash: st.cashIncome,
      count: myToday.length,
    };
  }, [collectorNormalizedTxs, currentCollectorKey]);

  // Filtered Fee Collection Receipts (রসিদ রেজিস্ট্রি)
  const filteredReceipts = useMemo(() => {
    return payments.filter((p) => {
      if (!isDateInPeriod(p.paidDate, receiptPeriodFilter, receiptCustomStart, receiptCustomEnd)) return false;
      if (receiptMethodFilter !== 'all' && p.paymentMethod !== receiptMethodFilter) return false;
      if (canViewAllCollectors && receiptCollectorFilter !== 'all') {
        const resolved = collectorDirectory.resolve({
          actorId: p.collectedById,
          actorEmail: p.collectedByEmail,
          actorRole: p.collectedByRole,
          rawLabel: p.collectedBy,
        });
        if (resolved.collectorKey !== receiptCollectorFilter) return false;
      }
      if (receiptSearch.trim() !== '') {
        const q = receiptSearch.toLowerCase().trim();
        return (
          p.receiptNo.toLowerCase().includes(q) ||
          p.studentName.toLowerCase().includes(q) ||
          (p.className || '').toLowerCase().includes(q) ||
          String(p.roll || '').toLowerCase().includes(q) ||
          (p.collectedBy || '').toLowerCase().includes(q) ||
          (p.transactionId || '').toLowerCase().includes(q) ||
          (p.notes || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [
    payments,
    receiptPeriodFilter,
    receiptCustomStart,
    receiptCustomEnd,
    receiptMethodFilter,
    receiptCollectorFilter,
    canViewAllCollectors,
    collectorDirectory,
    receiptSearch,
  ]);

  const receiptMethodSummary = useMemo(() => summarizeByPaymentMethod(filteredReceipts), [filteredReceipts]);

  // Filtered Cashbook Data (আয়-ব্যয় খাতা)
  const cashbookFilteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (!isDateInPeriod(p.paidDate, cashbookPeriodFilter, cashbookCustomStart, cashbookCustomEnd)) return false;
      if (cashbookMethodFilter !== 'all' && p.paymentMethod !== cashbookMethodFilter) return false;
      return true;
    });
  }, [payments, cashbookPeriodFilter, cashbookCustomStart, cashbookCustomEnd, cashbookMethodFilter]);

  const cashbookFilteredIncomeVouchers = useMemo(() => {
    return incomeVouchers.filter((v) => {
      if (!isDateInPeriod(v.date, cashbookPeriodFilter, cashbookCustomStart, cashbookCustomEnd)) return false;
      if (cashbookMethodFilter !== 'all' && v.paymentMethod !== cashbookMethodFilter) return false;
      return true;
    });
  }, [incomeVouchers, cashbookPeriodFilter, cashbookCustomStart, cashbookCustomEnd, cashbookMethodFilter]);

  const cashbookFilteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!isDateInPeriod(e.date, cashbookPeriodFilter, cashbookCustomStart, cashbookCustomEnd)) return false;
      if (cashbookMethodFilter !== 'all' && e.paymentMethod !== cashbookMethodFilter) return false;
      return true;
    });
  }, [expenses, cashbookPeriodFilter, cashbookCustomStart, cashbookCustomEnd, cashbookMethodFilter]);

  const cashbookTotals = useMemo(() => {
    const feeIncome = cashbookFilteredPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const voucherIncome = cashbookFilteredIncomeVouchers.reduce((s, v) => s + (Number(v.amount) || 0), 0);
    const totalIncome = feeIncome + voucherIncome;
    const totalExpense = cashbookFilteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return {
      feeIncome,
      voucherIncome,
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      incomeByMethod: summarizeByPaymentMethod([
        ...cashbookFilteredPayments.map((p) => ({ paymentMethod: p.paymentMethod, amount: p.amount })),
        ...cashbookFilteredIncomeVouchers.map((v) => ({ paymentMethod: v.paymentMethod, amount: v.amount })),
      ]),
    };
  }, [cashbookFilteredPayments, cashbookFilteredIncomeVouchers, cashbookFilteredExpenses]);

  // Selected student's active transport mapping if any
  const selectedStudentTransport = useMemo(() => {
    if (!selectedStudent) return undefined;
    return StorageService.getStudentTransportByStudentId(selectedStudent.id);
  }, [selectedStudent]);

  // Selected student's comprehensive dues (unpaid invoices + overdue scheduled fees + transport)
  const studentAllDues = useMemo(() => {
    if (!selectedStudent) return [];
    return StorageService.getStudentDueFees(selectedStudent);
  }, [selectedStudent, invoices, payments, onlineRequests, syncTick]);

  // Filter out dues that are ALREADY included in current invoice builder
  const pendingDuesToDisplay = useMemo(() => {
    return studentAllDues.filter((due) => {
      return !invoiceItems.some((item) => {
        if (item.id === due.id) return true;
        const cleanDue = due.headName.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
        const cleanItem = item.headName.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');

        // Safe ordinal check for Model Tests
        const isDueMt = cleanDue.includes('মডেলটেস্ট') || cleanDue.includes('modeltest');
        const isItemMt = cleanItem.includes('মডেলটেস্ট') || cleanItem.includes('modeltest');
        if (isDueMt && isItemMt) {
          const due1 = cleanDue.includes('১ম') || cleanDue.includes('1ম') || cleanDue.includes('1st') || cleanDue.includes('mt1');
          const item1 = cleanItem.includes('১ম') || cleanItem.includes('1ম') || cleanItem.includes('1st') || cleanItem.includes('mt1');
          const due2 = cleanDue.includes('২য়') || cleanDue.includes('২য়') || cleanDue.includes('2য়') || cleanDue.includes('2য়') || cleanDue.includes('2nd') || cleanDue.includes('mt2');
          const item2 = cleanItem.includes('২য়') || cleanItem.includes('২য়') || cleanItem.includes('2য়') || cleanItem.includes('2য়') || cleanItem.includes('2nd') || cleanItem.includes('mt2');
          const due3 = cleanDue.includes('৩য়') || cleanDue.includes('৩য়') || cleanDue.includes('3য়') || cleanDue.includes('3য়') || cleanDue.includes('3rd') || cleanDue.includes('mt3');
          const item3 = cleanItem.includes('৩য়') || cleanItem.includes('৩য়') || cleanItem.includes('3য়') || cleanItem.includes('3য়') || cleanItem.includes('3rd') || cleanItem.includes('mt3');
          return (due1 && item1) || (due2 && item2) || (due3 && item3);
        }

        // Safe ordinal check for Semester Exams
        const isDueSem = cleanDue.includes('সেমিস্টার') || cleanDue.includes('semester');
        const isItemSem = cleanItem.includes('সেমিস্টার') || cleanItem.includes('semester');
        if (isDueSem && isItemSem) {
          const due1 = cleanDue.includes('১ম') || cleanDue.includes('1ম') || cleanDue.includes('1st') || cleanDue.includes('sem1');
          const item1 = cleanItem.includes('১ম') || cleanItem.includes('1ম') || cleanItem.includes('1st') || cleanItem.includes('sem1');
          const due2 = cleanDue.includes('২য়') || cleanDue.includes('২য়') || cleanDue.includes('2য়') || cleanDue.includes('2য়') || cleanDue.includes('2nd') || cleanDue.includes('sem2');
          const item2 = cleanItem.includes('২য়') || cleanItem.includes('২য়') || cleanItem.includes('2য়') || cleanItem.includes('2য়') || cleanItem.includes('2nd') || cleanItem.includes('sem2');
          const due3 = cleanDue.includes('৩য়') || cleanDue.includes('৩য়') || cleanDue.includes('3য়') || cleanDue.includes('3য়') || cleanDue.includes('3rd') || cleanDue.includes('sem3');
          const item3 = cleanItem.includes('৩য়') || cleanItem.includes('৩য়') || cleanItem.includes('3য়') || cleanItem.includes('3য়') || cleanItem.includes('3rd') || cleanItem.includes('sem3');
          return (due1 && item1) || (due2 && item2) || (due3 && item3);
        }

        return cleanDue === cleanItem || (cleanDue.length > 5 && cleanItem.includes(cleanDue)) || (cleanItem.length > 5 && cleanDue.includes(cleanItem));
      });
    });
  }, [studentAllDues, invoiceItems]);

  // Total student dues
  const studentTotalDueAmount = studentAllDues.reduce((sum, d) => sum + d.amount, 0);

  // Compute which months student has already paid
  const paidMonthsForSelectedStudent = useMemo(() => {
    if (!selectedStudent) return new Set<string>();
    const paidSet = new Set<string>();
    const studentInvoices = invoices.filter(
      (i) => (i.studentId === selectedStudent.id || i.studentId === selectedStudent.studentId) && (i.status === 'Paid' || i.paidAmount > 0)
    );
    studentInvoices.forEach((inv) => {
      const feeTypeNorm = (inv.feeType || '').normalize('NFC');
      const monthNorm = (inv.month || '').normalize('NFC');
      MONTH_NAMES.forEach((m) => {
        const mBn = (MONTH_NAMES_BN[m] || '').normalize('NFC');
        const matchInType = feeTypeNorm.includes(m) || (mBn && feeTypeNorm.includes(mBn));
        const matchInMonth = monthNorm.includes(m) || (mBn && monthNorm.includes(mBn));
        const matchInItems =
          inv.items &&
          inv.items.some((it) => {
            const headNorm = (it.headName || '').normalize('NFC');
            const itemMonthNorm = (it.month || '').normalize('NFC');
            return (
              headNorm.includes(m) ||
              (mBn && headNorm.includes(mBn)) ||
              itemMonthNorm.includes(m) ||
              (mBn && itemMonthNorm.includes(mBn))
            );
          });
        if (matchInType || matchInMonth || matchInItems) {
          paidSet.add(m);
        }
      });
    });
    return paidSet;
  }, [selectedStudent, invoices]);

  // Duplicate Fee Alert State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    isOpen: boolean;
    feeItemName: string;
    month?: string;
    amount?: number;
    existingRecord: {
      feeName: string;
      invoiceNo: string;
      date: string;
      amount: number;
      status: string;
    };
    onConfirmAdd: () => void;
  } | null>(null);

  // Helper to check duplicate fee before adding
  const checkDuplicateFee = (
    feeTitle: string,
    period?: string,
    alternateTitles: string[] = []
  ): { isDuplicate: boolean; record?: any } => {
    if (!selectedStudent) return { isDuplicate: false };
    const studentInvoices = invoices.filter(
      (i) => i.studentId === selectedStudent.id || i.studentId === selectedStudent.studentId
    );
    return findDuplicatePaidFee(studentInvoices, feeTitle, period, alternateTitles);
  };

  // AUTO-SET CLASS TUITION RATE & RECALCULATE ON STUDENT CHANGE
  useEffect(() => {
    if (selectedStudent) {
      const classFee = StorageService.getClassFee(selectedStudent.className);
      setMonthlyTuitionRate(classFee.tuitionFee);

      if (skipNextAutoItemsRef.current) {
        skipNextAutoItemsRef.current = false;
        setIsManualPaidAmount(false);
        return;
      }

      // Reset invoice items when switching to another student so no items are pre-selected
      setInvoiceItems([]);
      setSelectedMonths([]);
      setDiscountAmount(0);
      setDiscountReason('');
      setLateFineAmount(0);
      setIsManualPaidAmount(false);
    }
  }, [selectedStudent?.id, selectedStudent?.className]);

  // Search filtered students for Counter selection
  const searchedStudents = useMemo(() => {
    return students.filter((s) => {
      if (deskSelectedClass !== 'all' && s.className !== deskSelectedClass) return false;
      if (!studentSearchQuery.trim()) return true;
      const q = studentSearchQuery.toLowerCase().trim();
      return (
        s.nameEn.toLowerCase().includes(q) ||
        s.nameBn.includes(q) ||
        (s.admissionNo || s.studentId || '').toLowerCase().includes(q) ||
        s.roll.toLowerCase().includes(q) ||
        s.guardianPhone.includes(q) ||
        s.fatherNameBn.includes(q) ||
        s.className.toLowerCase().includes(q)
      );
    });
  }, [students, studentSearchQuery, deskSelectedClass]);

  // Itemized calculations for new invoice
  const subTotal = invoiceItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const netPayable = Math.max(0, subTotal + lateFineAmount - discountAmount);

  // Sync paidNowAmount with netPayable unless manually overridden
  const effectivePaidAmount = isManualPaidAmount ? paidNowAmount : netPayable;
  const balanceDue = Math.max(0, netPayable - effectivePaidAmount);

  const executeToggleMonth = (month: string) => {
    let updatedMonths: string[];
    if (selectedMonths.includes(month)) {
      updatedMonths = selectedMonths.filter((m) => m !== month);
    } else {
      updatedMonths = [...selectedMonths, month];
    }
    setSelectedMonths(updatedMonths);

    const otherItems = invoiceItems.filter(
      (item) => !item.headName.includes('Monthly Tuition Fee') && !item.headName.includes('মাসিক বেতন')
    );
    const newTuitionItems: FeeItem[] = updatedMonths.map((m) => ({
      id: `tuition_${m}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      headName: `Monthly Tuition Fee (${MONTH_NAMES_BN[m] || m} - মাসিক বেতন)`,
      month: `${m} ${academicYear}`,
      amount: monthlyTuitionRate,
    }));

    setInvoiceItems([...otherItems, ...newTuitionItems]);
    setIsManualPaidAmount(false);
  };

  // Quick toggle month for tuition fee with duplicate check
  const handleToggleMonth = (month: string) => {
    if (!selectedMonths.includes(month)) {
      // Check if this month is already paid
      if (paidMonthsForSelectedStudent.has(month)) {
        const dup = checkDuplicateFee(`মাসিক বেতন (${MONTH_NAMES_BN[month] || month})`, `${month} ${academicYear}`);
        setDuplicateWarning({
          isOpen: true,
          feeItemName: `মাসিক বেতন (${MONTH_NAMES_BN[month] || month} ${academicYear})`,
          month: `${month} ${academicYear}`,
          amount: monthlyTuitionRate,
          existingRecord: dup.record || {
            feeName: `মাসিক বেতন (${MONTH_NAMES_BN[month] || month})`,
            invoiceNo: 'পূর্ববর্তী ইনভয়েস',
            date: '2026',
            amount: monthlyTuitionRate,
            status: 'Paid',
          },
          onConfirmAdd: () => {
            executeToggleMonth(month);
            setDuplicateWarning(null);
          },
        });
        return;
      }
    }
    executeToggleMonth(month);
  };

  // Dynamic presets that reflect current student's class, admission fee, custom fees, and transport
  const dynamicPresets = useMemo(() => {
    if (!selectedStudent) return QUICK_PRESETS;
    const classFee = StorageService.getClassFee(selectedStudent.className);
    const transport = StorageService.getStudentTransportByStudentId(selectedStudent.id);

    // Read custom fee columns configured
    let customCols: { id: string; nameEn: string; nameBn: string; defaultAmount: number }[] = [];
    try {
      const saved = localStorage.getItem('school_erp_custom_class_fee_columns');
      if (saved) customCols = JSON.parse(saved);
    } catch {}

    const baseList = [
      { id: 'admission', nameEn: 'Admission Fee', nameBn: 'নতুন ভর্তি ফি', defaultAmount: classFee.admissionFee ?? 1500, icon: UserPlus },
      { id: 'tuition', nameEn: 'Monthly Tuition Fee', nameBn: 'মাসিক বেতন', defaultAmount: classFee.tuitionFee, icon: BookOpen },
      { id: 'session', nameEn: 'Session Charge', nameBn: 'বাৎসরিক সেশন ফি', defaultAmount: classFee.sessionFee, icon: Building },
      { id: 'exam_mt1', nameEn: '1st Model Test Fee', nameBn: '1ম মডেল টেস্ট ফি', defaultAmount: classFee.examFee1stModelTest ?? classFee.examFee1stTest ?? 250, icon: Award },
      { id: 'exam_sem1', nameEn: '1st Semester Exam Fee', nameBn: '1ম সেমিস্টার পরীক্ষা ফি', defaultAmount: classFee.examFee1stSemester ?? classFee.examFeeHalfYearly ?? 350, icon: Award },
      { id: 'exam_mt2', nameEn: '2nd Model Test Fee', nameBn: '2য় মডেল টেস্ট ফি', defaultAmount: classFee.examFee2ndModelTest ?? classFee.examFeeModelTest ?? 250, icon: Award },
      { id: 'exam_sem2', nameEn: '2nd Semester Exam Fee', nameBn: '2য় সেমিস্টার পরীক্ষা ফি', defaultAmount: classFee.examFee2ndSemester ?? classFee.examFeeHalfYearly ?? 350, icon: Award },
      { id: 'exam_mt3', nameEn: '3rd Model Test Fee', nameBn: '3য় মডেল টেস্ট ফি', defaultAmount: classFee.examFee3rdModelTest ?? classFee.examFeeModelTest ?? 250, icon: Award },
      { id: 'exam_sem3', nameEn: '3rd Semester Exam Fee', nameBn: '3য় সেমিস্টার পরীক্ষা ফি', defaultAmount: classFee.examFee3rdSemester ?? classFee.examFeeAnnual ?? 400, icon: Award },
      { id: 'transport', nameEn: 'Transport Bus Fee', nameBn: 'পরিবহন বাস ফি', defaultAmount: transport ? transport.monthlyFare : 1500, icon: Bus },
      { id: 'tour', nameEn: 'Educational Study Tour', nameBn: 'শিক্ষা সফর ফি', defaultAmount: 1500, icon: Sparkles },
      { id: 'sports', nameEn: 'Sports & Cultural Fee', nameBn: 'ক্রীড়া ও সাংস্কৃতিক ফি', defaultAmount: 500, icon: Sparkles },
    ];

    // Add any custom defined fee columns
    customCols.forEach((col) => {
      const amt = classFee.customFees?.[col.id] ?? col.defaultAmount;
      baseList.push({
        id: `custom_${col.id}`,
        nameEn: col.nameEn,
        nameBn: col.nameBn,
        defaultAmount: amt,
        icon: Tag,
      });
    });

    return baseList;
  }, [selectedStudent]);

  const executeAddPreset = (preset: typeof dynamicPresets[0]) => {
    const newItem: FeeItem = {
      id: `preset_${preset.id}_${Date.now()}`,
      headName: `${preset.nameEn} (${preset.nameBn})`,
      month: `${academicYear} Session`,
      amount: preset.defaultAmount,
    };
    setInvoiceItems((prev) => [...prev, newItem]);
    setIsManualPaidAmount(false);
  };

  // Quick add preset fee with duplicate alert
  const handleAddPreset = (preset: typeof dynamicPresets[0]) => {
    const dup = checkDuplicateFee(preset.nameBn, `${academicYear} Session`, [preset.nameEn]);
    if (dup.isDuplicate && dup.record) {
      setDuplicateWarning({
        isOpen: true,
        feeItemName: `${preset.nameBn} (${preset.nameEn})`,
        month: `${academicYear} Session`,
        amount: preset.defaultAmount,
        existingRecord: dup.record,
        onConfirmAdd: () => {
          executeAddPreset(preset);
          setDuplicateWarning(null);
        },
      });
      return;
    }
    executeAddPreset(preset);
  };

  // Include single due into current invoice
  const handleIncludeSingleDue = (due: FeeItem) => {
    if (invoiceItems.some((it) => it.id === due.id || it.headName === due.headName)) {
      alert(language === 'bn' ? 'এই ফি আইটেমটি ইতিমধ্যে ইনভয়েসে যুক্ত রয়েছে!' : 'This fee item is already in invoice!');
      return;
    }
    setInvoiceItems((prev) => [...prev, due]);
    setIsManualPaidAmount(false);
  };

  // Include all pending dues into current invoice
  const handleIncludeAllDues = () => {
    const existingIds = new Set(invoiceItems.map((it) => it.id));
    const missing = pendingDuesToDisplay.filter((d) => !existingIds.has(d.id));
    if (missing.length === 0) {
      alert(language === 'bn' ? 'সকল বকেয়া ইতিমধ্যে ইনভয়েসে যুক্ত রয়েছে!' : 'All dues are already added!');
      return;
    }
    setInvoiceItems((prev) => [...prev, ...missing]);
    setIsManualPaidAmount(false);
  };

  // Add custom line item
  const executeAddCustomItem = () => {
    const newItem: FeeItem = {
      id: `custom_${Date.now()}`,
      headName: customItemTitle.trim(),
      month: customItemPeriod.trim() || `${academicYear} Session`,
      amount: customItemAmount,
    };
    setInvoiceItems((prev) => [...prev, newItem]);
    setCustomItemTitle('');
    setCustomItemPeriod('');
    setCustomItemAmount(500);
    setIsManualPaidAmount(false);
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customItemTitle.trim() || customItemAmount <= 0) return;
    const dup = checkDuplicateFee(customItemTitle.trim(), customItemPeriod.trim() || `${academicYear} Session`);
    if (dup.isDuplicate && dup.record) {
      setDuplicateWarning({
        isOpen: true,
        feeItemName: customItemTitle.trim(),
        month: customItemPeriod.trim() || `${academicYear} Session`,
        amount: customItemAmount,
        existingRecord: dup.record,
        onConfirmAdd: () => {
          executeAddCustomItem();
          setDuplicateWarning(null);
        },
      });
      return;
    }
    executeAddCustomItem();
  };

  // Remove line item
  const handleRemoveItem = (id: string) => {
    setInvoiceItems((prev) => prev.filter((i) => i.id !== id));
    setIsManualPaidAmount(false);
  };

  // Update item amount
  const handleItemAmountChange = (id: string, newAmt: number) => {
    setInvoiceItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, amount: Math.max(0, newAmt) } : i))
    );
    setIsManualPaidAmount(false);
  };

  // Include existing pending due invoice into invoice items
  const handleIncludePendingDue = (inv: FeeInvoice) => {
    const dueItem: FeeItem = {
      id: `due_${inv.id}_${Date.now()}`,
      headName: `Previous Due (${inv.invoiceNo}) - ${inv.feeType}`,
      month: inv.month || inv.session,
      amount: inv.dueAmount,
    };
    setInvoiceItems((prev) => [...prev, dueItem]);
    setIsManualPaidAmount(false);
  };

  // Submit Fee Collection and Generate Official Receipt
  const handleSubmitFeeCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      alert(language === 'bn' ? 'অনুগ্রহ করে প্রথমে একজন শিক্ষার্থী নির্বাচন করুন!' : 'Please select a student first!');
      return;
    }
    if (invoiceItems.length === 0) {
      alert(language === 'bn' ? 'কমপক্ষে একটি ফি আইটেম যুক্ত করুন!' : 'Please add at least one fee item!');
      return;
    }
    if (effectivePaidAmount < 0) {
      alert('Paid amount cannot be negative');
      return;
    }

    const studentSnapshot = selectedStudent;
    const itemsSnapshot = [...invoiceItems];
    const subTotalSnapshot = subTotal;
    const discountSnapshot = discountAmount;
    const netPayableSnapshot = netPayable;
    const paidSnapshot = effectivePaidAmount;
    const methodSnapshot = paymentMethod;
    const trxSnapshot = transactionId;
    const notesSnapshot = paymentNotes;
    const selectedMonthsSnapshot = [...selectedMonths];

    authorizeTransaction(
      {
        titleBn: paidSnapshot > 0 ? 'ফি আদায় ও ইনভয়েস অনুমোদন' : 'বকেয়া ইনভয়েস তৈরি অনুমোদন',
        titleEn: paidSnapshot > 0 ? 'Authorize Fee Collection & Invoice' : 'Authorize Due Invoice Creation',
        summaryBn: `${studentSnapshot.nameBn || studentSnapshot.nameEn} (${studentSnapshot.className}, রোল ${studentSnapshot.roll}) • ${itemsSnapshot.length}টি আইটেম (${methodSnapshot})`,
        summaryEn: `${studentSnapshot.nameEn} (${studentSnapshot.className}, Roll ${studentSnapshot.roll}) • ${itemsSnapshot.length} items (${methodSnapshot})`,
        amountLabel: formatTaka(paidSnapshot > 0 ? paidSnapshot : netPayableSnapshot),
        tone: 'emerald',
      },
      (authStamp) => {
        const curSess = school.currentSession || academicYear || '2026';
        const invoiceNo = `INV-${curSess}-${Math.floor(10000 + Math.random() * 90000)}`;
        const receiptNo = `REC-${curSess}-${Math.floor(10000 + Math.random() * 90000)}`;
        const today = new Date().toISOString().split('T')[0];

        const feeDescription = itemsSnapshot.map((i) => i.headName).join(' + ');

        const itemMonths = itemsSnapshot
          .map((i) => i.month)
          .filter((m): m is string => Boolean(m && m.trim()));
        const combinedMonthLabel =
          itemMonths.length > 0
            ? Array.from(new Set(itemMonths)).join(', ')
            : selectedMonthsSnapshot.length > 0
            ? selectedMonthsSnapshot.join(', ') + ` ${academicYear}`
            : `${academicYear} Session`;

        const newInvoice: FeeInvoice = {
          id: `inv_${Date.now()}`,
          invoiceNo,
          studentId: studentSnapshot.id,
          studentNameEn: studentSnapshot.nameEn,
          studentNameBn: studentSnapshot.nameBn,
          className: studentSnapshot.className,
          section: studentSnapshot.section,
          roll: studentSnapshot.roll,
          session: academicYear,
          feeType: feeDescription.length > 80 ? `${feeDescription.slice(0, 77)}...` : feeDescription,
          month: combinedMonthLabel,
          items: itemsSnapshot,
          amount: subTotalSnapshot,
          discount: discountSnapshot,
          netAmount: netPayableSnapshot,
          paidAmount: 0,
          dueAmount: netPayableSnapshot,
          dueDate: today,
          status: 'Unpaid',
          ...authStamp,
        };

        const newPayment: FeePayment = {
          id: `pay_${Date.now()}`,
          receiptNo,
          invoiceId: newInvoice.id,
          studentId: studentSnapshot.id,
          studentName: studentSnapshot.nameEn,
          className: `${studentSnapshot.className} (${studentSnapshot.section})`,
          roll: studentSnapshot.roll,
          amount: paidSnapshot,
          items: itemsSnapshot,
          paidDate: today,
          paymentMethod: methodSnapshot,
          transactionId: trxSnapshot || (methodSnapshot !== 'Cash' ? `TXN-${Date.now().toString().slice(-6)}` : undefined),
          collectedBy: currentUser.name,
          collectedById: currentUser.linkedStaffId || currentUser.id,
          collectedByEmail: currentUser.email,
          collectedByRole: activeRole,
          notes: notesSnapshot || `${itemsSnapshot.length} items collected (Discount: ৳ ${discountSnapshot})`,
          ...authStamp,
        };

        StorageService.addInvoice(newInvoice);
        if (paidSnapshot > 0) {
          StorageService.addPayment(newPayment);
        }

        setInvoices(StorageService.getInvoices());
        setPayments(StorageService.getPayments());

        setSelectedReceipt(newPayment);
        setSelectedReceiptInvoice(newInvoice);
        setShowReceiptModal(true);

        // Reset items for next collection (leave empty until next selection)
        setInvoiceItems([]);
        setSelectedMonths([]);
        setDiscountAmount(0);
        setDiscountReason('');
        setLateFineAmount(0);
        setTransactionId('');
        setPaymentNotes('');
        setIsManualPaidAmount(false);
      }
    );
  };

  const handleOpenSingleCollect = (inv: FeeInvoice) => {
    setTargetInvoice(inv);
    setSingleCollectAmount(inv.dueAmount);
    setPaymentMethod('bKash');
    setTransactionId('');
    setPaymentNotes('');
    setShowCollectModal(true);
  };

  const handleConfirmSinglePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInvoice || singleCollectAmount <= 0) return;
    const invSnapshot = targetInvoice;
    const amountSnapshot = singleCollectAmount;
    const methodSnapshot = paymentMethod;
    const trxSnapshot = transactionId;
    const notesSnapshot = paymentNotes;

    authorizeTransaction(
      {
        titleBn: 'বকেয়া ইনভয়েস ফি আদায় অনুমোদন',
        titleEn: 'Authorize Invoice Payment Collection',
        summaryBn: `${invSnapshot.studentNameBn || invSnapshot.studentNameEn} • ${invSnapshot.invoiceNo} (${methodSnapshot})`,
        summaryEn: `${invSnapshot.studentNameEn} • ${invSnapshot.invoiceNo} (${methodSnapshot})`,
        amountLabel: formatTaka(amountSnapshot),
        tone: 'emerald',
      },
      (authStamp) => {
        const curSess = school.currentSession || academicYear || '2026';
        const receiptNo = `REC-${curSess}-${Math.floor(10000 + Math.random() * 90000)}`;
        const newPayment: FeePayment = {
          id: `pay_${Date.now()}`,
          receiptNo,
          invoiceId: invSnapshot.id,
          studentId: invSnapshot.studentId,
          studentName: invSnapshot.studentNameEn,
          className: `${invSnapshot.className} (${invSnapshot.section})`,
          roll: invSnapshot.roll,
          amount: amountSnapshot,
          items: invSnapshot.items || [
            {
              id: `item_${Date.now()}`,
              headName: invSnapshot.feeType,
              month: invSnapshot.month,
              amount: amountSnapshot,
            },
          ],
          paidDate: new Date().toISOString().split('T')[0],
          paymentMethod: methodSnapshot,
          transactionId: trxSnapshot || (methodSnapshot !== 'Cash' ? `TXN-${Date.now().toString().slice(-6)}` : undefined),
          collectedBy: currentUser.name,
          collectedById: currentUser.linkedStaffId || currentUser.id,
          collectedByEmail: currentUser.email,
          collectedByRole: activeRole,
          notes: notesSnapshot || 'Fee Collection Desk',
          ...authStamp,
        };

        StorageService.addPayment(newPayment);
        setInvoices(StorageService.getInvoices());
        setPayments(StorageService.getPayments());
        setShowCollectModal(false);

        setSelectedReceipt(newPayment);
        setSelectedReceiptInvoice(invSnapshot);
        setShowReceiptModal(true);
      }
    );
  };

  const expenseModalGrandTotal = useMemo(() => calculateExpenseItemsTotal(expenseItems), [expenseItems]);

  const resetExpenseForm = (defaultCategory = 'Electricity & Utilities') => {
    setEditingExpense(null);
    setExpenseTitle('');
    setExpenseCategory(defaultCategory);
    setExpenseItems([createBlankExpenseItem(defaultCategory)]);
    setExpenseDate(toLocalIsoDate());
    setExpensePaidTo('');
    setExpenseMethod('Cash');
    setExpenseRefNo('');
    setExpenseNotes('');
    setExpenseFormError('');
  };

  const handleOpenNewExpenseModal = () => {
    resetExpenseForm('Electricity & Utilities');
    setShowExpenseModal(true);
  };

  const handleAddExpenseRow = () => {
    setExpenseItems((prev) => [...prev, createBlankExpenseItem(expenseCategory)]);
    setExpenseFormError('');
  };

  const handleAddPresetExpenseItem = (preset: { description: string; category: string; unit: string; unitPrice: number }) => {
    setExpenseItems((prev) => {
      const existingIdx = prev.findIndex(
        (row) => row.description.trim().toLowerCase() === preset.description.toLowerCase()
      );
      if (existingIdx >= 0) {
        return prev.map((row, i) => {
          if (i !== existingIdx) return row;
          const nextQty = row.quantity + 1;
          return { ...row, quantity: nextQty, amount: nextQty * row.unitPrice };
        });
      }
      const emptyIdx = prev.findIndex((row) => row.description.trim() === '' && row.unitPrice === 0);
      const newRow: ExpenseLineItem = {
        id: `exp_item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        description: preset.description,
        category: preset.category,
        unit: preset.unit,
        quantity: 1,
        unitPrice: preset.unitPrice,
        amount: preset.unitPrice,
      };
      if (emptyIdx >= 0) {
        return prev.map((row, i) => (i === emptyIdx ? newRow : row));
      }
      return [...prev, newRow];
    });
    setExpenseFormError('');
  };

  const handleUpdateExpenseRow = (
    rowId: string,
    patch: Partial<Pick<ExpenseLineItem, 'description' | 'category' | 'unit' | 'quantity' | 'unitPrice'>>
  ) => {
    setExpenseItems((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const nextQty = patch.quantity !== undefined ? Math.max(1, Number(patch.quantity) || 1) : row.quantity;
        const nextPrice = patch.unitPrice !== undefined ? Math.max(0, Number(patch.unitPrice) || 0) : row.unitPrice;
        return {
          ...row,
          ...patch,
          quantity: nextQty,
          unitPrice: nextPrice,
          amount: Math.round(nextQty * nextPrice),
        };
      })
    );
    setExpenseFormError('');
  };

  const handleRemoveExpenseRow = (rowId: string) => {
    setExpenseItems((prev) => {
      const remaining = prev.filter((row) => row.id !== rowId);
      return remaining.length > 0 ? remaining : [createBlankExpenseItem(expenseCategory)];
    });
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = expenseItems
      .map((it) => {
        const qty = Math.max(1, Number(it.quantity) || 1);
        const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
        return {
          ...it,
          description: it.description.trim(),
          category: it.category || expenseCategory,
          quantity: qty,
          unitPrice,
          amount: Math.round(qty * unitPrice),
        };
      })
      .filter((it) => it.description !== '' && it.amount > 0);

    if (validItems.length === 0) {
      setExpenseFormError(
        language === 'bn'
          ? 'অন্তত একটি ব্যয়ের আইটেমের বিবরণ ও টাকার পরিমাণ (০ এর বেশি) দিন।'
          : 'Please enter at least one valid expense item with description and amount > 0.'
      );
      return;
    }

    if (!expensePaidTo.trim()) {
      setExpenseFormError(
        language === 'bn' ? 'প্রাপকের নাম (Vendor / Person) লিখুন।' : 'Please enter Paid To (Vendor / Person).'
      );
      return;
    }

    const totalAmount = calculateExpenseItemsTotal(validItems);
    const resolvedTitle = summarizeExpenseTitle(validItems, expenseTitle);
    const resolvedDate = expenseDate || toLocalIsoDate();
    const paidToSnapshot = expensePaidTo.trim();
    const categorySnapshot = expenseCategory;
    const methodSnapshot = expenseMethod;
    const refSnapshot = expenseRefNo.trim() || undefined;
    const notesSnapshot = expenseNotes.trim() || undefined;

    if (editingExpense) {
      if (!canEditDeleteInvoices) {
        return;
      }
      const targetExp = editingExpense;
      authorizeTransaction(
        {
          titleBn: `ব্যয় ভাউচার সংশোধন (${targetExp.voucherNo})`,
          titleEn: `Update Expense Voucher (${targetExp.voucherNo})`,
          summaryBn: `${resolvedTitle} • প্রাপক: ${paidToSnapshot}`,
          summaryEn: `${resolvedTitle} • Paid To: ${paidToSnapshot}`,
          amountLabel: formatTaka(totalAmount),
          tone: 'amber',
        },
        (authStamp) => {
          const updatedExpense: Expense = {
            ...targetExp,
            category: categorySnapshot,
            title: resolvedTitle,
            amount: totalAmount,
            items: validItems,
            date: resolvedDate,
            paidTo: paidToSnapshot,
            paymentMethod: methodSnapshot,
            referenceNo: refSnapshot,
            notes: notesSnapshot,
            ...authStamp,
          };
          StorageService.updateExpense(updatedExpense, activeRole);
          setExpenses(StorageService.getExpenses());
          setShowExpenseModal(false);
          resetExpenseForm();
        }
      );
      return;
    }

    authorizeTransaction(
      {
        titleBn: 'নতুন ব্যয় ভাউচার অনুমোদন',
        titleEn: 'Authorize New Expense Voucher',
        summaryBn: `${resolvedTitle} • প্রাপক: ${paidToSnapshot} (${methodSnapshot})`,
        summaryEn: `${resolvedTitle} • Paid To: ${paidToSnapshot} (${methodSnapshot})`,
        amountLabel: formatTaka(totalAmount),
        tone: 'rose',
      },
      (authStamp) => {
        const newExpense: Expense = {
          id: `exp_${Date.now()}`,
          voucherNo: StorageService.generateNextExpenseVoucherNo(resolvedDate),
          category: categorySnapshot,
          title: resolvedTitle,
          amount: totalAmount,
          items: validItems,
          date: resolvedDate,
          paidTo: paidToSnapshot,
          paymentMethod: methodSnapshot,
          referenceNo: refSnapshot,
          approvedBy: currentUser.name,
          approvedById: currentUser.linkedStaffId || currentUser.id,
          approvedByEmail: currentUser.email,
          approvedByRole: activeRole,
          notes: notesSnapshot,
          ...authStamp,
        };

        StorageService.addExpense(newExpense);
        setExpenses(StorageService.getExpenses());
        setShowExpenseModal(false);
        resetExpenseForm();
        setPrintingExpense(newExpense);
      }
    );
  };

  const handleOpenEditExpense = (exp: Expense) => {
    if (!canEditDeleteInvoices) {
      return;
    }
    setEditingExpense(exp);
    const normalized = normalizeExpenseItems(exp);
    const autoSummary = summarizeExpenseTitle(normalized);
    setExpenseTitle(exp.title !== autoSummary ? exp.title : '');
    setExpenseCategory(exp.category || 'Electricity & Utilities');
    setExpenseItems(normalized);
    setExpenseDate(exp.date || toLocalIsoDate());
    setExpensePaidTo(exp.paidTo || '');
    setExpenseMethod((exp.paymentMethod as any) || 'Cash');
    setExpenseRefNo(exp.referenceNo || '');
    setExpenseNotes(exp.notes || '');
    setExpenseFormError('');
    setShowExpenseModal(true);
  };

  const handleDeleteExpense = (exp: Expense) => {
    if (!canEditDeleteInvoices) {
      return;
    }
    authorizeTransaction(
      {
        titleBn: `ব্যয় ভাউচার মুছে ফেলা (${exp.voucherNo})`,
        titleEn: `Delete Expense Voucher (${exp.voucherNo})`,
        summaryBn: `${exp.title} • প্রাপক: ${exp.paidTo || '—'}`,
        summaryEn: `${exp.title} • Paid To: ${exp.paidTo || '—'}`,
        amountLabel: formatTaka(exp.amount),
        tone: 'rose',
      },
      () => {
        StorageService.deleteExpense(exp.id, activeRole);
        setExpenses(StorageService.getExpenses());
      }
    );
  };

  const handleOpenEditReceipt = (payment: FeePayment) => {
    if (!canEditDeleteInvoices) {
      return;
    }
    setEditingReceipt(payment);
    setEditReceiptAmount(payment.amount);
    setEditReceiptDate(payment.paidDate || new Date().toISOString().split('T')[0]);
    setEditReceiptMethod(payment.paymentMethod || 'Cash');
    setEditReceiptTrxId(payment.transactionId || '');
    setEditReceiptNotes(payment.notes || '');
    setShowEditReceiptModal(true);
  };

  const handleSaveEditReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReceipt || !canEditDeleteInvoices) return;
    const targetReceipt = editingReceipt;
    const nextAmt = Number(editReceiptAmount);
    const nextDate = editReceiptDate;
    const nextMethod = editReceiptMethod;
    const nextTrx = editReceiptTrxId.trim() || undefined;
    const nextNotes = editReceiptNotes.trim() || undefined;

    authorizeTransaction(
      {
        titleBn: `মানি রসিদ সংশোধন (${targetReceipt.receiptNo})`,
        titleEn: `Update Money Receipt (${targetReceipt.receiptNo})`,
        summaryBn: `${targetReceipt.studentName} • ${nextMethod}`,
        summaryEn: `${targetReceipt.studentName} • ${nextMethod}`,
        amountLabel: formatTaka(nextAmt),
        tone: 'amber',
      },
      (authStamp) => {
        const updated: FeePayment = {
          ...targetReceipt,
          amount: nextAmt,
          paidDate: nextDate,
          paymentMethod: nextMethod as any,
          transactionId: nextTrx,
          notes: nextNotes,
          ...authStamp,
        };
        StorageService.updatePayment(updated, activeRole);
        setPayments(StorageService.getPayments());
        setInvoices(StorageService.getInvoices());
        setShowEditReceiptModal(false);
        setEditingReceipt(null);
      }
    );
  };

  const handleDeletePayment = (payment: FeePayment) => {
    if (!canEditDeleteInvoices) {
      return;
    }
    authorizeTransaction(
      {
        titleBn: `মানি রসিদ মুছে ফেলা (${payment.receiptNo})`,
        titleEn: `Delete Money Receipt (${payment.receiptNo})`,
        summaryBn: `${payment.studentName} • এটি মুছলে সংশ্লিষ্ট ইনভয়েসের বকেয়া সমন্বয় হবে`,
        summaryEn: `${payment.studentName} • Restores linked invoice due amount`,
        amountLabel: formatTaka(payment.amount),
        tone: 'rose',
      },
      () => {
        StorageService.deletePayment(payment.id, activeRole);
        setPayments(StorageService.getPayments());
        setInvoices(StorageService.getInvoices());
      }
    );
  };

  const handleOpenEditInvoice = (inv: FeeInvoice) => {
    if (!canEditDeleteInvoices) {
      return;
    }
    setEditingInvoice(inv);
    setEditInvoiceFeeType(inv.feeType);
    setEditInvoiceNetAmount(inv.netAmount);
    setEditInvoiceDueDate(inv.dueDate);
    setEditInvoiceDiscount(inv.discount || 0);
    setShowEditInvoiceModal(true);
  };

  const handleSaveEditInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice || !canEditDeleteInvoices) return;
    const targetInv = editingInvoice;
    const newNet = Number(editInvoiceNetAmount);
    const newFeeType = editInvoiceFeeType;
    const newDueDate = editInvoiceDueDate;
    const newDiscount = Number(editInvoiceDiscount);

    authorizeTransaction(
      {
        titleBn: `ইনভয়েস সংশোধন (${targetInv.invoiceNo})`,
        titleEn: `Update Invoice (${targetInv.invoiceNo})`,
        summaryBn: `${targetInv.studentNameBn || targetInv.studentNameEn} • ${newFeeType}`,
        summaryEn: `${targetInv.studentNameEn} • ${newFeeType}`,
        amountLabel: formatTaka(newNet),
        tone: 'amber',
      },
      (authStamp) => {
        const newPaid = targetInv.paidAmount;
        const newDue = Math.max(0, newNet - newPaid);
        const newStatus = newDue === 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';

        const updated: FeeInvoice = {
          ...targetInv,
          feeType: newFeeType,
          netAmount: newNet,
          dueAmount: newDue,
          status: newStatus,
          dueDate: newDueDate,
          discount: newDiscount,
          ...authStamp,
        };
        StorageService.updateInvoice(updated, activeRole);
        setInvoices(StorageService.getInvoices());
        setShowEditInvoiceModal(false);
        setEditingInvoice(null);
      }
    );
  };

  const handleDeleteInvoice = (inv: FeeInvoice) => {
    if (!canEditDeleteInvoices) {
      return;
    }
    authorizeTransaction(
      {
        titleBn: `ইনভয়েস মুছে ফেলা (${inv.invoiceNo})`,
        titleEn: `Delete Invoice (${inv.invoiceNo})`,
        summaryBn: `${inv.studentNameBn || inv.studentNameEn} • ${inv.feeType}`,
        summaryEn: `${inv.studentNameEn} • ${inv.feeType}`,
        amountLabel: formatTaka(inv.netAmount),
        tone: 'rose',
      },
      () => {
        StorageService.deleteInvoice(inv.id, activeRole);
        setInvoices(StorageService.getInvoices());
      }
    );
  };

  const handleClearAllOnlineRequests = () => {
    authorizeTransaction(
      {
        titleBn: 'সকল অনলাইন পেমেন্ট রিকোয়েস্ট খালি করা',
        titleEn: 'Clear All Online Payment Requests',
        summaryBn: 'তালিকার সকল অনলাইন পেমেন্ট রিকোয়েস্ট মুছে ফেলা হবে',
        summaryEn: 'Removes all entries from online payment request list',
        tone: 'rose',
      },
      () => {
        StorageService.clearOnlinePaymentRequests();
        setOnlineRequests([]);
        setApprovalFeedbackNotice({
          type: 'success',
          message:
            language === 'bn'
              ? 'অনলাইন পেমেন্ট রিকোয়েস্ট তালিকা সম্পূর্ণ খালি করা হয়েছে।'
              : 'Online payment requests list has been cleared.',
        });
      }
    );
  };

  const handleDeleteOnlineRequest = (req: OnlinePaymentRequest) => {
    authorizeTransaction(
      {
        titleBn: `অনলাইন রিকোয়েস্ট মুছে ফেলা (${req.receiptNo})`,
        titleEn: `Delete Online Request (${req.receiptNo})`,
        summaryBn: `${req.studentName} • TrxID: ${req.transactionId}`,
        summaryEn: `${req.studentName} • TrxID: ${req.transactionId}`,
        amountLabel: formatTaka(req.amount),
        tone: 'rose',
      },
      () => {
        StorageService.deleteOnlinePaymentRequest(req.id);
        setOnlineRequests(StorageService.getOnlinePaymentRequests());
        setApprovalFeedbackNotice({
          type: 'success',
          message:
            language === 'bn'
              ? `রিকোয়েস্ট "${req.receiptNo}" সফলভাবে মুছে ফেলা হয়েছে।`
              : `Request "${req.receiptNo}" deleted.`,
        });
      }
    );
  };

  const [selectedSessionFilter, setSelectedSessionFilter] = useState<'all' | '2026' | '2027' | '2028'>('all');

  const filteredInvoices = invoices.filter((inv) => {
    if (selectedClass !== 'all' && inv.className !== selectedClass) return false;
    if (selectedSessionFilter !== 'all') {
      const invSession = (inv as any).session || (inv.invoiceNo?.includes('2027') ? '2027' : '2026');
      if (invSession !== selectedSessionFilter) return false;
    }
    if (invoiceStatusFilter !== 'all' && inv.status !== invoiceStatusFilter) return false;
    if (
      invoicePeriodFilter !== 'all' &&
      !isDateInPeriod(inv.paymentDate || inv.dueDate, invoicePeriodFilter, invoiceCustomStart, invoiceCustomEnd)
    ) {
      return false;
    }
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      return (
        inv.studentNameEn.toLowerCase().includes(q) ||
        inv.studentNameBn.includes(q) ||
        inv.invoiceNo.toLowerCase().includes(q) ||
        inv.roll.includes(q)
      );
    }
    return true;
  });

  const filteredDueEntries = useMemo(() => {
    return comprehensiveDueEntries.filter((entry) => {
      if (selectedClass !== 'all' && entry.className !== selectedClass) return false;
      if (selectedSessionFilter !== 'all' && entry.session !== selectedSessionFilter) return false;
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        return (
          entry.studentNameEn.toLowerCase().includes(q) ||
          entry.studentNameBn.includes(q) ||
          entry.studentId.toLowerCase().includes(q) ||
          entry.roll.toLowerCase().includes(q) ||
          entry.headName.toLowerCase().includes(q) ||
          entry.monthLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [comprehensiveDueEntries, selectedClass, selectedSessionFilter, searchTerm]);

  const [expandedDueStudentKey, setExpandedDueStudentKey] = useState<string | null>(null);

  const groupedDueStudents = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        key: string;
        student?: Student;
        studentId: string;
        studentNameEn: string;
        studentNameBn: string;
        className: string;
        section: string;
        roll: string;
        session: string;
        totalAmount: number;
        overdueCount: number;
        earliestDueDate: string;
        latestDueDate: string;
        entries: typeof filteredDueEntries;
      }
    >();

    filteredDueEntries.forEach((entry) => {
      const key = entry.student?.id || entry.studentId;
      const existing = groupsMap.get(key);
      if (!existing) {
        groupsMap.set(key, {
          key,
          student: entry.student,
          studentId: entry.studentId,
          studentNameEn: entry.studentNameEn,
          studentNameBn: entry.studentNameBn,
          className: entry.className,
          section: entry.section,
          roll: entry.roll,
          session: entry.session,
          totalAmount: entry.amount,
          overdueCount: entry.isOverdue ? 1 : 0,
          earliestDueDate: entry.dueDate && entry.dueDate !== '—' ? entry.dueDate : '—',
          latestDueDate: entry.dueDate && entry.dueDate !== '—' ? entry.dueDate : '—',
          entries: [entry],
        });
      } else {
        existing.totalAmount += entry.amount;
        if (entry.isOverdue) existing.overdueCount += 1;
        if (entry.dueDate && entry.dueDate !== '—') {
          if (existing.earliestDueDate === '—' || entry.dueDate < existing.earliestDueDate) {
            existing.earliestDueDate = entry.dueDate;
          }
          if (existing.latestDueDate === '—' || entry.dueDate > existing.latestDueDate) {
            existing.latestDueDate = entry.dueDate;
          }
        }
        existing.entries.push(entry);
      }
    });

    return Array.from(groupsMap.values());
  }, [filteredDueEntries]);

  const totalGroupedDueAmount = useMemo(
    () => groupedDueStudents.reduce((sum, g) => sum + g.totalAmount, 0),
    [groupedDueStudents]
  );

  const escapeHtml = (value: string) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const handleDownloadDueListCsv = () => {
    const headers = [
      'SL',
      'Student ID',
      'Student Name',
      'Class',
      'Section',
      'Roll',
      'Guardian Phone',
      'Due Items Count',
      'Fee Details',
      'Due Date',
      'Total Due (BDT)',
    ];
    const rows = groupedDueStudents.map((g, idx) => {
      const dateRange =
        g.earliestDueDate !== '—' && g.latestDueDate !== '—' && g.earliestDueDate !== g.latestDueDate
          ? `${g.earliestDueDate} to ${g.latestDueDate}`
          : g.earliestDueDate;
      const details = g.entries
        .map((e) => `${e.monthLabel || e.headName} (${e.amount})`)
        .join('; ');
      return [
        idx + 1,
        g.studentId,
        g.studentNameBn || g.studentNameEn,
        g.className,
        g.section,
        g.roll,
        g.student?.guardianPhone || '',
        g.entries.length,
        details,
        dateRange,
        g.totalAmount,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Due_List_${selectedClass === 'all' ? 'All_Classes' : selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDueListPrintableHtml = () => {
    const printedAt = new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const rowsHtml = groupedDueStudents
      .map((g, idx) => {
        const dateRange =
          g.earliestDueDate !== '—' && g.latestDueDate !== '—' && g.earliestDueDate !== g.latestDueDate
            ? `${g.earliestDueDate} – ${g.latestDueDate}`
            : g.earliestDueDate;
        const detailsHtml =
          duePrintMode === 'detailed'
            ? `<ul style="margin:0;padding-left:14px;">${g.entries
                .map(
                  (e) =>
                    `<li>${escapeHtml(e.headName)}${
                      e.monthLabel && e.monthLabel !== e.headName ? ` (${escapeHtml(e.monthLabel)})` : ''
                    } — <strong>৳${e.amount.toLocaleString()}</strong></li>`
                )
                .join('')}</ul>`
            : `${escapeHtml(String(g.entries.length))} item(s): ${escapeHtml(
                g.entries.map((e) => e.monthLabel || e.headName).join(', ')
              )}`;
        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td><strong>${escapeHtml(g.studentNameBn || g.studentNameEn)}</strong><br/><span style="color:#475569;font-size:10px;font-family:monospace;">${escapeHtml(g.studentId)}</span></td>
            <td>${escapeHtml(g.className)} (${escapeHtml(g.section)}) • Roll ${escapeHtml(String(g.roll))}</td>
            <td>${escapeHtml(g.student?.guardianPhone || '—')}</td>
            <td style="font-size:10.5px;">${detailsHtml}</td>
            <td>${escapeHtml(dateRange)}</td>
            <td style="text-align:right;font-weight:700;color:#be123c;">৳${g.totalAmount.toLocaleString()}</td>
          </tr>
        `;
      })
      .join('');

    const htmlDoc = `<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>Student Outstanding Dues List - ${escapeHtml(school.nameEn)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; padding: 16px; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
    .header h2 { margin: 2px 0; font-size: 13px; color: #1e40af; }
    .header p { margin: 2px 0; font-size: 11px; color: #475569; }
    .badge { display: inline-block; margin-top: 6px; padding: 4px 12px; background: #0f172a; color: #fff; font-size: 11px; font-weight: 700; border-radius: 4px; }
    .meta { display: flex; justify-content: space-between; font-size: 11px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 10px; }
    .total-row td { background: #fff1f2; font-weight: 800; font-size: 12px; }
    .footer { margin-top: 36px; display: flex; justify-content: space-between; font-size: 11px; }
    .sig { border-top: 1px solid #334155; padding-top: 4px; min-width: 150px; text-align: center; font-weight: 600; }
    .print-bar { margin-bottom: 12px; text-align: right; }
    @media print { .print-bar { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="print-bar">
    <button onclick="window.print()" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Print / Save as PDF</button>
  </div>
  <div class="header">
    <h1>${escapeHtml(school.nameEn)}</h1>
    <h2>${escapeHtml(school.nameBn)}</h2>
    <p>${escapeHtml(school.addressEn || school.addressBn)} • Phone: ${escapeHtml(school.phone)} • EIIN: ${escapeHtml(school.eiin)}</p>
    <div class="badge">STUDENT OUTSTANDING DUES LIST (শিক্ষার্থীদের বকেয়া ফি তালিকা)</div>
  </div>
  <div class="meta">
    <span><strong>Class:</strong> ${escapeHtml(selectedClass === 'all' ? 'All Classes' : selectedClass)} • <strong>Session:</strong> ${escapeHtml(selectedSessionFilter === 'all' ? 'All Sessions' : selectedSessionFilter)}</span>
    <span><strong>Students:</strong> ${groupedDueStudents.length} • <strong>Items:</strong> ${filteredDueEntries.length} • <strong>Total Due:</strong> ৳${totalGroupedDueAmount.toLocaleString()} • <strong>Date:</strong> ${escapeHtml(printedAt)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:center;width:32px;">SL</th>
        <th>Student Name & ID</th>
        <th>Class & Roll</th>
        <th>Guardian Phone</th>
        <th>Due Details</th>
        <th>Due Date</th>
        <th style="text-align:right;">Total Due</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="6" style="text-align:right;">GRAND TOTAL OUTSTANDING DUE (${groupedDueStudents.length} Students):</td>
        <td style="text-align:right;color:#be123c;">৳${totalGroupedDueAmount.toLocaleString()}</td>
      </tr>
    </tbody>
  </table>
  <div class="footer">
    <div class="sig">Accounts Officer</div>
    <div class="sig">${buildPrincipalSignatureHtml(school)}Head Teacher / Principal</div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Due_List_Printable_${selectedClass === 'all' ? 'All_Classes' : selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const feeLauncherItems: LauncherTileItem[] = [
    {
      id: 'counter',
      label: language === 'bn' ? 'ফি কাউন্টার' : 'Fee Desk',
      icon: Wallet,
      color: 'green',
      active: activeTab === 'counter',
      onClick: () => setActiveTab('counter'),
    },
    {
      id: 'statement',
      label: language === 'bn' ? 'স্টেটমেন্ট' : 'Statement',
      icon: FileText,
      color: 'sky',
      active: activeTab === 'statement',
      onClick: () => setActiveTab('statement'),
    },
    {
      id: 'class_fees',
      label: language === 'bn' ? 'শ্রেণিভিত্তিক ফি' : 'Class Rates',
      icon: Layers,
      color: 'blue',
      active: activeTab === 'class_fees',
      onClick: () => setActiveTab('class_fees'),
    },
    {
      id: 'scheduled_fees',
      label: language === 'bn' ? 'ফি শিডিউল' : 'Fee Deadlines',
      icon: Clock,
      color: 'amber',
      active: activeTab === 'scheduled_fees',
      onClick: () => setActiveTab('scheduled_fees'),
    },
    {
      id: 'transport_fees',
      label: language === 'bn' ? 'পরিবহন ফি' : 'Bus Fees',
      icon: Bus,
      color: 'teal',
      active: activeTab === 'transport_fees',
      onClick: () => setActiveTab('transport_fees'),
    },
    {
      id: 'online_approvals',
      label: language === 'bn' ? 'অনলাইন অনুমোদন' : 'Online Approvals',
      icon: Smartphone,
      color: 'purple',
      badge: pendingRequestsCount > 0 ? (language === 'bn' ? toBnNumber(pendingRequestsCount) : pendingRequestsCount) : undefined,
      active: activeTab === 'online_approvals',
      onClick: () => setActiveTab('online_approvals'),
    },
    {
      id: 'collection',
      label: language === 'bn' ? 'ইনভয়েস তালিকা' : 'Invoices',
      icon: CreditCard,
      color: 'sky',
      active: activeTab === 'collection',
      onClick: () => setActiveTab('collection'),
    },
    {
      id: 'invoices',
      label: language === 'bn' ? 'রসিদ রেজিস্ট্রি' : 'Receipts',
      icon: Receipt,
      color: 'green',
      active: activeTab === 'invoices',
      onClick: () => setActiveTab('invoices'),
    },
    ...(canManage
      ? [
          {
            id: 'collector_report',
            label: canViewAllCollectors
              ? language === 'bn'
                ? 'কালেক্টর আয়-ব্যয়'
                : 'Collector Audit'
              : language === 'bn'
              ? 'আমার আয়-ব্যয়'
              : 'My Ledger',
            icon: UserCheck,
            color: 'indigo' as const,
            active: activeTab === 'collector_report',
            onClick: () => setActiveTab('collector_report'),
          },
        ]
      : []),
    {
      id: 'dues',
      label: language === 'bn' ? 'বকেয়া তালিকা' : 'Due List',
      icon: AlertCircle,
      color: 'red',
      active: activeTab === 'dues',
      onClick: () => setActiveTab('dues'),
    },
    {
      id: 'expenses',
      label: language === 'bn' ? 'আয় ও ব্যয় ভাউচার' : 'Vouchers & Store',
      icon: TrendingDown,
      color: 'red',
      active: activeTab === 'expenses',
      onClick: () => setActiveTab('expenses'),
    },
    ...(canManage
      ? [
          {
            id: 'payroll',
            label: language === 'bn' ? 'স্টাফ বেতন' : 'Staff Payroll',
            icon: DollarSign,
            color: 'teal' as const,
            active: activeTab === 'payroll',
            onClick: () => setActiveTab('payroll'),
          },
        ]
      : []),
    {
      id: 'cashbook',
      label: language === 'bn' ? 'ক্যাশ বুক' : 'Cashbook',
      icon: BookOpen,
      color: 'amber',
      active: activeTab === 'cashbook',
      onClick: () => setActiveTab('cashbook'),
    },
    ...(canManage
      ? [
          {
            id: 'mfs_settings',
            label: language === 'bn' ? 'বিকাশ ও নগদ' : 'bKash/Nagad',
            icon: Settings,
            color: 'orange' as const,
            onClick: () => setShowMfsModal(true),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* Sub-module Colorful Launcher Grid */}
      <LauncherIconGrid items={feeLauncherItems} columns={5} />

      {/* Pending Online Payment Notification Strip */}
      {pendingRequestsCount > 0 && activeTab !== 'online_approvals' && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <p className="font-bold text-amber-950">
                অভিভাবকদের {toBnNumber(pendingRequestsCount)}টি অনলাইন ফি পেমেন্ট (বিকাশ / নগদ / রকেট) অনুমোদনের অপেক্ষায়!
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                মোট পরিমাণ:{' '}
                <strong>
                  {formatTaka(
                    onlineRequests
                      .filter((r) => r.status === 'pending')
                      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
                  )}
                </strong>{' '}
                • TrxID যাচাই করে অনুমোদন দিন
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('online_approvals');
              setOnlineStatusFilter('pending');
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0"
          >
            অনলাইন অনুমোদন দেখুন &rarr;
          </button>
        </div>
      )}

      {/* Clean Compact Action Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {language === 'bn' ? 'ফি গ্রহণ ও প্রাতিষ্ঠানিক হিসাবরক্ষণ' : 'Fee Collection & Accounts Management'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? 'বহু-আইটেম ইনভয়েস, ডুপ্লিকেট মানি রসিদ, বকেয়া, ব্যয় ভাউচার ও ক্যাশ বুক'
              : 'Multi-item invoicing, duplicate money receipts, dues, vouchers & cashbook'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canManage && (
            <button
              type="button"
              onClick={openSecuritySettings}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                securityConfig.requireTransactionPassword
                  ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
              }`}
              title={
                language === 'bn'
                  ? 'আমার ট্রানজেকশন পিন পরিবর্তন ও নিরাপত্তা নীতি'
                  : 'My Transaction PIN & Security Settings'
              }
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'ট্রানজেকশন পিন' : 'Transaction PIN'}</span>
            </button>
          )}
          {canManage && isTimedUnlocked && (
            <button
              type="button"
              onClick={lockNow}
              className="flex items-center space-x-1 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold cursor-pointer"
              title={language === 'bn' ? 'এখনই লেনদেন সেশন লক করুন' : 'Lock transaction session now'}
            >
              <UnlockIcon className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'আনলক • লক করুন' : 'Unlocked • Lock'}</span>
            </button>
          )}
          {canManage && (
            <button
              onClick={() => {
                setActiveTab('counter');
                window.scrollTo({ top: 200, behavior: 'smooth' });
              }}
              className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'bn' ? 'ফি গ্রহণ করুন' : 'Collect Fee'}</span>
            </button>
          )}
          {canManage && activeTab === 'expenses' && (
            <>
              <button
                type="button"
                onClick={() => setIncomeCreateSignal((n) => n + 1)}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{language === 'bn' ? 'নতুন আয় ভাউচার' : 'New Income'}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenNewExpenseModal}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{language === 'bn' ? 'ব্যয় ভাউচার' : 'New Expense'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              {language === 'bn' ? 'মোট আয় ও সংগৃহীত ফি' : 'Total Income & Fees'}
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900 tabular-nums">
            {formatTaka(totalInstitutionalIncome)}
          </div>
          <div className="text-[11px] text-emerald-700 font-bold mt-1 tabular-nums">
            {language === 'bn'
              ? `আজকের কালেকশন: ${formatTaka(todayTotalCollection)}`
              : `Today's Collection: ${formatTaka(todayTotalCollection)}`}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {totalIncomeVouchersAmount > 0
              ? language === 'bn'
                ? `ফি: ${formatTaka(totalCollected)} • আয় ভাউচার: ${formatTaka(totalIncomeVouchersAmount)}`
                : `Fees: ${formatTaka(totalCollected)} • Vouchers: ${formatTaka(totalIncomeVouchersAmount)}`
              : language === 'bn'
              ? 'ক্যাশ, বিকাশ ও ব্যাংক প্রাপ্তি'
              : 'Cash, bKash & Bank receipts'}
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setActiveTab('collector_report')}
              className="mt-2 w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 text-[10px] font-bold text-indigo-800 transition-colors cursor-pointer"
            >
              <span>
                {canViewAllCollectors
                  ? language === 'bn'
                    ? 'হিসাবরক্ষক আয়-ব্যয় (কে কত):'
                    : 'Collector Audit:'
                  : language === 'bn'
                  ? 'আজ আমার আয় / ব্যয়:'
                  : 'My Today In / Out:'}
              </span>
              <span className="tabular-nums text-indigo-700">
                {canViewAllCollectors
                  ? language === 'bn'
                    ? 'দেখুন →'
                    : 'View →'
                  : `${formatTaka(myTodayStats.total)} / ${formatTaka(myTodayStats.expense)} →`}
              </span>
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              {language === 'bn' ? 'মোট বকেয়া পাওনা' : 'Outstanding Dues'}
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-amber-600">
            {formatTaka(totalDues)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'bn' ? 'বকেয়া মাসিক, শিডিউল ও ইনভয়েস' : 'Unpaid invoices & overdue fees'}
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              {language === 'bn' ? 'মোট প্রাতিষ্ঠানিক ব্যয়' : 'Total Expenses'}
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-700">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900 tabular-nums">
            {formatTaka(totalExpensesAmount)}
          </div>
          <div className="text-[11px] text-rose-600 font-bold mt-1 tabular-nums">
            {language === 'bn'
              ? `আজকের ব্যয়: ${formatTaka(todayExpenseTotal)}`
              : `Today's Expense: ${formatTaka(todayExpenseTotal)}`}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {language === 'bn' ? 'অনুমোদিত ভাউচার সমূহ' : 'Approved operational vouchers'}
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              {language === 'bn' ? 'হাতে নগদ উদ্বৃত্ত (Net Balance)' : 'Net Cashbook Balance'}
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-blue-700">
            {formatTaka(netCashInHand)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {language === 'bn' ? 'বর্তমান ক্যাশ ব্যালেন্স' : 'Net institutional funds'}
          </div>
        </div>
      </div>

      {/* TAB: COUNTER */}
      {activeTab === 'counter' && (
        <div className="space-y-6">
          <div className="p-4 bg-gradient-to-r from-blue-50 via-teal-50 to-indigo-50 border border-blue-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs mt-0.5">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'স্মার্ট ফি কাউন্টার (Smart Fee Desk)' : 'Smart Student Fee Collection Counter'}
                </h3>
                <p className="text-slate-600 mt-0.5">
                  {language === 'bn'
                    ? '১. যেকোনো শিক্ষার্থীকে খুঁজুন ও সিলেক্ট করুন • ২. একসাথে ২-৩ মাসের বেতন, পরীক্ষা বা পরিবহন ফি যোগ করুন • ৩. পেমেন্ট গ্রহণ করে ডুপ্লিকেট মানি রসিদ প্রিন্ট করুন।'
                    : '1. Search & pick student • 2. Select 2-3 months tuition, exam, transport & custom items in 1 invoice • 3. Receive payment & print duplicate receipt.'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <span className="text-[11px] font-semibold text-slate-500">Session:</span>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-blue-800"
              >
                <option value="2026">2026 Session</option>
                <option value="2027">2027 Session</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT COLUMN: Student Search & Selection */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                    <User className="w-4 h-4 text-blue-600" />
                    <span>{language === 'bn' ? '১. শিক্ষার্থী খুঁজুন ও নির্বাচন করুন' : '1. Search & Select Student'}</span>
                  </h4>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                    {searchedStudents.length} Found
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder={
                        language === 'bn'
                          ? 'নাম, আইডি (S-xxxx), রোল বা মোবাইল...'
                          : 'Search by Name, Student ID, Roll, Phone...'
                      }
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <select
                      value={deskSelectedClass}
                      onChange={(e) => setDeskSelectedClass(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg bg-white font-medium"
                    >
                      <option value="all">{language === 'bn' ? 'সকল শ্রেণি (All Classes)' : 'All Classes'}</option>
                      {[...managedClassList].reverse().map((cls) => (
                        <option key={cls.id} value={cls.name}>{formatClassOptionLabel(cls, language)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Students list */}
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                  {searchedStudents.map((st) => {
                    const isSelected = selectedStudent?.id === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedStudent(st)}
                        className={`w-full text-left p-2.5 transition-colors flex items-center space-x-3 text-xs ${
                          isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        {st.photoUrl ? (
                          <img
                            src={st.photoUrl}
                            alt={st.nameEn}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-xs">
                            {st.nameEn.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 truncate">{st.nameEn}</span>
                            <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 font-bold text-slate-600 rounded">
                              Roll: {st.roll}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center justify-between mt-0.5">
                            <span>{st.className} ({st.section})</span>
                            <span className="font-mono text-[10px] text-blue-600">{st.admissionNo || st.studentId}</span>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                  {searchedStudents.length === 0 && (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      {language === 'bn' ? 'কোনো শিক্ষার্থী মেলেনি' : 'No students found'}
                    </div>
                  )}
                </div>

                {/* Selected Student Card: Photo First (Left), Name / ID / Class / Roll After (Right) */}
                {selectedStudent && (
                  <div className="p-3.5 bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-xl shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">
                        {language === 'bn' ? 'নির্বাচিত শিক্ষার্থী' : 'Selected Student'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full font-mono">
                        {selectedStudent.admissionNo || selectedStudent.studentId}
                      </span>
                    </div>

                    <div className="flex items-center gap-3.5">
                      {/* Left: Student Image First */}
                      {selectedStudent.photoUrl ? (
                        <img
                          src={selectedStudent.photoUrl}
                          alt={selectedStudent.nameEn}
                          className="w-20 h-24 rounded-xl object-cover border-2 border-blue-400/70 shadow-sm bg-slate-800 shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-24 rounded-xl bg-blue-600/90 border-2 border-blue-400/50 font-extrabold text-xl flex items-center justify-center shadow-sm shrink-0">
                          {selectedStudent.nameEn.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      {/* Right: Name, ID, Class & Roll */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div>
                          <h5 className="font-bold text-sm sm:text-base leading-tight text-white truncate">
                            {selectedStudent.nameEn}
                          </h5>
                          {selectedStudent.nameBn && (
                            <p className="text-xs text-blue-200 truncate mt-0.5">{selectedStudent.nameBn}</p>
                          )}
                        </div>

                        <div className="text-[11px] font-mono text-sky-300 font-semibold truncate">
                          ID: {selectedStudent.admissionNo || selectedStudent.studentId}
                        </div>

                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-200">
                          <span className="font-semibold">
                            {selectedStudent.className} ({selectedStudent.section})
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="font-semibold">
                            {language === 'bn' ? `রোল: ${selectedStudent.roll}` : `Roll: ${selectedStudent.roll}`}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="capitalize text-slate-300">{selectedStudent.shift}</span>
                        </div>

                        {/* Class 9 & 10 Group Badge */}
                        {(selectedStudent.className === 'Class 9' || selectedStudent.className === 'Class 10') && (
                          <div className="pt-0.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950 shadow-2xs">
                              <Award className="w-3 h-3 mr-1 text-slate-950" />
                              <span>{formatGroupName(selectedStudent.group, language)}</span>
                            </span>
                          </div>
                        )}

                        {/* Transport User Badge */}
                        {selectedStudentTransport && (
                          <div className="pt-0.5">
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <Bus className="w-3 h-3 text-emerald-400" />
                              <span>
                                {language === 'bn'
                                  ? `বাস যাত্রী: ${selectedStudentTransport.routeName} (${formatTaka(selectedStudentTransport.monthlyFare)}/মাস)`
                                  : `Bus User: ${selectedStudentTransport.routeName} (${formatTaka(selectedStudentTransport.monthlyFare)}/mo)`}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-300 flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{selectedStudent.guardianPhone}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-700/50">
                          {language === 'bn' ? `বেতন: ${formatTaka(monthlyTuitionRate)}` : `Rate: ${formatTaka(monthlyTuitionRate)}`}
                        </span>
                        <div>
                          {studentTotalDueAmount > 0 ? (
                            <span className="text-rose-400 font-bold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                              {language === 'bn' ? 'মোট বকেয়া:' : 'Due:'} {formatTaka(studentTotalDueAmount)}
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 flex items-center space-x-1">
                              <CheckCircle className="w-3 h-3" />
                              <span>{language === 'bn' ? 'বকেয়ামুক্ত' : 'No Dues'}</span>
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('statement')}
                          className="inline-flex items-center space-x-1 text-[10px] bg-indigo-500/30 hover:bg-indigo-500/50 text-indigo-200 px-2 py-0.5 rounded border border-indigo-400/40 font-semibold transition-colors"
                          title="View Complete Fee Deposit & Due Statement"
                        >
                          <FileText className="w-3 h-3 text-indigo-300" />
                          <span>{language === 'bn' ? 'স্টেটমেন্ট দেখুন' : 'Statement'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* COMPREHENSIVE ACTIVE & OVERDUE DUES FOR SELECTED STUDENT */}
                {selectedStudent && (
                  <>
                    {pendingDuesToDisplay.length > 0 ? (
                      <div className="p-3.5 bg-rose-50/90 border-2 border-rose-300 rounded-2xl text-xs space-y-2.5 shadow-xs animate-in fade-in">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-bold text-rose-950 border-b border-rose-200 pb-2">
                          <div className="flex items-center space-x-1.5">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>
                              {language === 'bn'
                                ? `সক্রিয় ও বকেয়া ফিস (${pendingDuesToDisplay.length}টি বাকি)`
                                : `Outstanding & Due Fees (${pendingDuesToDisplay.length} pending)`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleIncludeAllDues}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shadow-xs flex items-center space-x-1 self-start sm:self-auto transition-colors"
                            title="Include all overdue and pending fees in current invoice"
                          >
                            <Zap className="w-3 h-3 text-amber-300" />
                            <span>{language === 'bn' ? 'সব বকেয়া যুক্ত করুন' : 'Include All Dues'}</span>
                          </button>
                        </div>

                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {pendingDuesToDisplay.map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center justify-between p-2 bg-white rounded-xl border border-rose-200 shadow-2xs hover:border-rose-400 transition-colors"
                            >
                              <div className="min-w-0 flex-1 mr-2">
                                <div className="font-bold text-slate-900 text-[11px] truncate">{d.headName}</div>
                                <div className="text-[10px] text-slate-500 flex items-center space-x-2 mt-0.5">
                                  <span>{d.month || '2026 Session'}</span>
                                  {d.dueDate && (
                                    <span className={`font-mono ${d.isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                                      • {language === 'bn' ? 'শেষ তারিখ:' : 'Last Date:'} {d.dueDate}
                                    </span>
                                  )}
                                  {d.isOverdue && (
                                    <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded font-bold text-[9px]">
                                      {language === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Overdue'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 shrink-0">
                                <span className="font-black text-rose-700 text-xs">{formatTaka(d.amount)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleIncludeSingleDue(d)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-2xs transition-colors flex items-center space-x-0.5"
                                  title="Add to current bill"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>{language === 'bn' ? 'যোগ' : 'Add'}</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : studentAllDues.length > 0 ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs flex items-center space-x-2.5 text-emerald-900 animate-in fade-in">
                        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <div className="font-bold">{language === 'bn' ? 'সকল সক্রিয় ও বকেয়া ফি ইনভয়েসে যুক্ত হয়েছে' : 'All Due Fees Included in Invoice'}</div>
                          <div className="text-[11px] text-emerald-700">{language === 'bn' ? 'ডান পাশের ইনভয়েস আইটেমাইজড ব্রেকডাউনে সকল ফি দেখতে পাবেন।' : 'Review fee items in the breakdown table on the right.'}</div>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Invoice Builder */}
            <div className="lg:col-span-8 space-y-4">
              <form onSubmit={handleSubmitFeeCollection} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5 text-xs">
                {/* Step 2: Multi-Item Fee Selection */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
                    <h4 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-emerald-600" />
                      <span>
                        {language === 'bn'
                          ? '২. ফি আইটেম নির্বাচন ও ইনভয়েস ব্রেকডাউন'
                          : '2. Fee Item Selection & Invoice Breakdown'}
                      </span>
                    </h4>
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-semibold text-slate-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        {invoiceItems.length} {language === 'bn' ? 'টি আইটেম যুক্ত' : 'Items in Invoice'}
                      </span>
                      {/* Mobile layout view switcher */}
                      <div className="flex md:hidden items-center bg-slate-100 rounded-lg p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setCounterLayoutMode('stacked')}
                          className={`px-2 py-0.5 rounded transition-all ${
                            counterLayoutMode === 'stacked'
                              ? 'bg-white shadow-2xs font-bold text-blue-600'
                              : 'text-slate-600'
                          }`}
                        >
                          {language === 'bn' ? 'বাম: নির্বাচন' : 'Left: Select'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCounterLayoutMode('side_by_side')}
                          className={`px-2 py-0.5 rounded transition-all ${
                            counterLayoutMode === 'side_by_side'
                              ? 'bg-white shadow-2xs font-bold text-blue-600'
                              : 'text-slate-600'
                          }`}
                        >
                          {language === 'bn' ? 'ডান: ব্রেকডাউন' : 'Right: Breakdown'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2-COLUMN SPLIT: LEFT = Selected Item (Selectors) | RIGHT = Invoice Itemized Breakdown */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* LEFT COLUMN: Selected Item / Fee Selection Tools */}
                    <div className={`space-y-3.5 ${counterLayoutMode === 'side_by_side' ? 'block md:block' : 'block'}`}>
                      <div className="flex items-center justify-between px-1 border-b border-slate-100 pb-1">
                        <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                          <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                          <span>{language === 'bn' ? 'ফি আইটেম নির্বাচন (Selected Item / Select)' : 'Fee Item Selection (Left Side)'}</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {language === 'bn' ? 'বেতন, পরীক্ষা বা প্রিসেট বেছে নিন' : 'Pick items to add'}
                        </span>
                      </div>

                      {/* Multi-Month Tuition Selector */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <span className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                            <span>
                              {language === 'bn' ? 'মাসিক বেতন (1 বা একাধিক মাস সিলেক্ট করুন):' : 'Monthly Tuition (Multi-Month):'}
                            </span>
                          </span>
                          <div className="flex items-center space-x-1.5 self-end sm:self-auto">
                            <span className="text-[10px] text-slate-500">{language === 'bn' ? 'হার/মাস:' : 'Rate/mo:'}</span>
                            <DigitInput
                              min={0}
                              value={monthlyTuitionRate}
                              onValueChange={(val) => {
                                setMonthlyTuitionRate(val);
                                setInvoiceItems((prev) =>
                                  prev.map((item) =>
                                    item.headName.includes('Monthly Tuition Fee') || item.headName.includes('মাসিক বেতন')
                                      ? { ...item, amount: val }
                                      : item
                                  )
                                );
                              }}
                              className="w-18 px-1.5 py-0.5 text-xs font-bold border border-slate-300 rounded bg-white text-right"
                            />
                            <span className="text-[10px] font-bold text-slate-600">৳</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                          {MONTH_NAMES.map((m) => {
                            const isSelected = selectedMonths.includes(m);
                            const isAlreadyPaid = paidMonthsForSelectedStudent.has(m);
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => handleToggleMonth(m)}
                                className={`px-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border text-center flex flex-col items-center justify-center relative ${
                                  isSelected
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                    : isAlreadyPaid
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/80 shadow-2xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
                                }`}
                                title={isAlreadyPaid ? `${m} - পূর্বে পরিশোধিত (Already Paid)` : m}
                              >
                                <span className="leading-tight">{language === 'bn' ? MONTH_NAMES_BN[m] : m.slice(0, 3)}</span>
                                {isAlreadyPaid && (
                                  <span className={`text-[8px] font-black leading-none mt-0.5 ${isSelected ? 'text-emerald-200' : 'text-emerald-700'}`}>
                                    ✓ পরিশোধিত
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Quick Preset Buttons (Dynamic based on selected student's class, admission, custom & bus) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-700 uppercase flex items-center space-x-1">
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            <span>
                              {language === 'bn'
                                ? `শ্রেণি প্রিসেট (${selectedStudent?.className || 'Class'}):`
                                : `Class Presets for ${selectedStudent?.className || 'Student'}:`}
                            </span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {dynamicPresets.map((preset) => {
                            const Icon = preset.icon || Sparkles;
                            const isDup = checkDuplicateFee(preset.nameBn, `${academicYear} Session`, [preset.nameEn]).isDuplicate;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleAddPreset(preset)}
                                className={`flex items-center space-x-1 px-2.5 py-1 border rounded-lg font-semibold transition-colors shadow-2xs text-[11px] ${
                                  isDup
                                    ? 'bg-amber-50/80 border-amber-300 text-amber-900 hover:bg-amber-100'
                                    : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/50'
                                }`}
                                title={isDup ? 'পূর্বে পরিশোধিত ফি - ক্লিক করলে নিশ্চিতকরণ সতর্কতা আসবে' : preset.nameEn}
                              >
                                <Icon className={`w-3 h-3 shrink-0 ${isDup ? 'text-amber-600' : 'text-emerald-600'}`} />
                                <span className="truncate">{language === 'bn' ? preset.nameBn : preset.nameEn}</span>
                                <span className="text-[10px] text-blue-700 font-bold font-mono">({preset.defaultAmount}৳)</span>
                                {isDup && (
                                  <span className="text-[8px] bg-amber-200/90 text-amber-800 px-1 rounded font-bold">পূর্বে প্রদত্ত</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Add Custom Fee Item */}
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-600 uppercase flex items-center space-x-1">
                          <Plus className="w-3 h-3 text-blue-600" />
                          <span>{language === 'bn' ? 'কাস্টম ফি যুক্ত করুন' : 'Add Custom Fee Item'}</span>
                        </span>
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            placeholder={language === 'bn' ? 'কাস্টম ফি-এর নাম (যেমন: বিজ্ঞান মেলা, জরিমানা...)' : 'Custom Fee Title (e.g. Science Fair...)'}
                            value={customItemTitle}
                            onChange={(e) => setCustomItemTitle(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder={language === 'bn' ? 'সেশন / বিবরণ' : 'Session / Period'}
                              value={customItemPeriod}
                              onChange={(e) => setCustomItemPeriod(e.target.value)}
                              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                            />
                            <DigitInput
                              min={0}
                              emptyWhenZero
                              placeholder="৳"
                              value={customItemAmount || ''}
                              onValueChange={(val) => setCustomItemAmount(val)}
                              className="w-20 px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg bg-white text-right"
                            />
                            <button
                              type="button"
                              onClick={handleAddCustomItem}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shrink-0 flex items-center justify-center space-x-1 text-xs shadow-2xs"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{language === 'bn' ? 'যোগ' : 'Add'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Invoice Itemized Breakdown */}
                    <div className={`space-y-2.5 ${counterLayoutMode === 'stacked' ? 'hidden md:block' : 'block'}`}>
                      <div className="flex items-center justify-between px-1 border-b border-slate-100 pb-1">
                        <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                          <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{language === 'bn' ? 'ইনভয়েস আইটেমাইজড ব্রেকডাউন' : 'Invoice Itemized Breakdown'}</span>
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {language === 'bn' ? 'মোট:' : 'Total:'} {formatTaka(subTotal)}
                        </span>
                      </div>

                      {/* Current Invoice Items Table */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                        <div className="bg-gradient-to-r from-slate-100 to-emerald-50/70 px-3 py-1.5 font-bold text-slate-700 flex items-center justify-between text-xs border-b border-slate-200">
                          <span className="flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>{language === 'bn' ? 'ইনভয়েসভুক্ত আইটেম তালিকা' : 'Invoice Items List'}</span>
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {language === 'bn' ? 'টাকার পরিমাণ পরিবর্তনযোগ্য' : 'Editable amounts'}
                          </span>
                        </div>
                        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                                <th className="py-2 px-2 w-7 text-center">#</th>
                                <th className="py-2 px-2">{language === 'bn' ? 'ফি বিবরণ' : 'Fee Description'}</th>
                                <th className="py-2 px-1.5 text-center">{language === 'bn' ? 'মাস' : 'Month'}</th>
                                <th className="py-2 px-2 text-right w-24">{language === 'bn' ? 'টাকা (৳)' : 'Amount (৳)'}</th>
                                <th className="py-2 px-1 text-center w-7"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {invoiceItems.map((item, idx) => (
                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2 px-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                  <td className="py-2 px-2 font-semibold text-slate-900 leading-tight">
                                    <div className="line-clamp-2">{item.headName}</div>
                                  </td>
                                  <td className="py-2 px-1.5 text-center text-slate-500 text-[10px] whitespace-nowrap">
                                    {item.month || '-'}
                                  </td>
                                  <td className="py-2 px-2 text-right">
                                    <DigitInput
                                      min={0}
                                      value={item.amount}
                                      onValueChange={(val) => handleItemAmountChange(item.id, val)}
                                      className="w-18 px-1.5 py-1 border border-slate-200 rounded font-bold text-slate-900 text-right text-xs bg-slate-50 focus:bg-white focus:border-blue-500"
                                    />
                                  </td>
                                  <td className="py-2 px-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveItem(item.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                      title="Remove Item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {invoiceItems.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                                    <div className="flex flex-col items-center justify-center space-y-1">
                                      <Receipt className="w-6 h-6 text-slate-300" />
                                      <span className="text-xs font-medium">
                                        {language === 'bn'
                                          ? '← বাম পাশের মেনু থেকে ফি সিলেক্ট করুন'
                                          : '← Select fee items from the left side'}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-50/90 border-t-2 border-slate-200 font-bold sticky bottom-0">
                                <td colSpan={3} className="py-2.5 px-2 text-right text-slate-700">
                                  {language === 'bn' ? 'সর্বমোট গ্রস ফি:' : 'Subtotal Gross:'}
                                </td>
                                <td className="py-2.5 px-2 text-right text-xs sm:text-sm text-slate-900 font-extrabold">
                                  {formatTaka(subTotal)}
                                </td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* Breakdown Summary footer note */}
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">
                          {language === 'bn' ? 'মোট যুক্ত আইটেম:' : 'Total Items:'}{' '}
                          <span className="font-bold text-slate-900">{invoiceItems.length}</span>
                        </span>
                        <div className="flex items-center space-x-1">
                          <span className="text-slate-500">{language === 'bn' ? 'বর্তমান নিট:' : 'Current Net:'}</span>
                          <span className="font-bold text-emerald-700">{formatTaka(netPayable)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3: Financial Calculations, Waivers & Payment Details */}
                <div className="border-t border-slate-200 pt-4 space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span>{language === 'bn' ? '3. ছাড়, আদায় ও পেমেন্ট বিবরণ' : '3. Discount, Collection & Payment Details'}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'বিশেষ ছাড় / ওয়েভার (৳)' : 'Discount / Waiver (৳)'}
                      </label>
                      <DigitInput
                        min={0}
                        max={subTotal}
                        emptyWhenZero
                        value={discountAmount || ''}
                        onValueChange={(val) => {
                          setDiscountAmount(val);
                          setIsManualPaidAmount(false);
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-slate-900"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'ছাড়ের কারণ' : 'Waiver Reason'}
                      </label>
                      <input
                        type="text"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        placeholder={language === 'bn' ? 'যেমন: ভাই-বোন ছাড় / দরিদ্র তহবিল' : 'e.g. Sibling concession / Poor fund'}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'বিলম্ব ফি / জরিমানা (৳)' : 'Late Fine (৳)'}
                      </label>
                      <DigitInput
                        min={0}
                        emptyWhenZero
                        value={lateFineAmount || ''}
                        onValueChange={(val) => {
                          setLateFineAmount(val);
                          setIsManualPaidAmount(false);
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-slate-900"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Highlighted Net Payable & Amount Paid Card */}
                  <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    <div>
                      <span className="text-[11px] font-bold text-slate-600 uppercase">
                        {language === 'bn' ? 'সর্বমোট প্রদেয় (Net Payable):' : 'Net Payable Amount:'}
                      </span>
                      <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                        {formatTaka(netPayable)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Subtotal {subTotal} {discountAmount > 0 ? `- Discount ${discountAmount}` : ''} {lateFineAmount > 0 ? `+ Fine ${lateFineAmount}` : ''}
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-emerald-900 mb-1">
                        {language === 'bn' ? 'এখন আদায় হচ্ছে (৳) *' : 'Amount Being Paid (৳) *'}
                      </label>
                      <DigitInput
                        min={0}
                        max={netPayable}
                        value={effectivePaidAmount}
                        onValueChange={(val) => {
                          setPaidNowAmount(val);
                          setIsManualPaidAmount(true);
                        }}
                        className="w-full px-3 py-1.5 border-2 border-emerald-500 rounded-lg font-extrabold text-emerald-800 text-base bg-white"
                      />
                      <span className="text-[10px] text-emerald-700">
                        {effectivePaidAmount === netPayable ? (
                          language === 'bn' ? 'সম্পূর্ণ পরিশোধ (Full Paid)' : 'Full Payment'
                        ) : (
                          language === 'bn' ? 'আংশিক পরিশোধ (Partial)' : 'Partial Payment'
                        )}
                      </span>
                    </div>

                    <div className="border-l border-emerald-200/80 pl-4">
                      <span className="text-[11px] font-bold text-slate-600 uppercase">
                        {language === 'bn' ? 'অবশিষ্ট বকেয়া (Balance Due):' : 'Remaining Balance Due:'}
                      </span>
                      <div className={`text-xl font-extrabold mt-0.5 ${balanceDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {formatTaka(balanceDue)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {balanceDue === 0 ? 'Nil' : 'Will be tracked in dues'}
                      </div>
                    </div>
                  </div>

                  {/* Payment Method & TrxID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'পেমেন্ট মেথড *' : 'Payment Method *'}
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-slate-800 bg-white"
                      >
                        <option value="Cash">Cash (নগদ গ্রহণ)</option>
                        <option value="bKash">bKash (বিকাশ)</option>
                        <option value="Nagad">Nagad (নগদ অ্যাপ)</option>
                        <option value="Rocket">Rocket (রকেট)</option>
                        <option value="Bank">Bank Deposit (ব্যাংক)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'ট্রানজ্যাকশন আইডি (TrxID) / স্লিপ নং' : 'TrxID / Bank Slip No'}
                      </label>
                      <input
                        type="text"
                        placeholder={paymentMethod === 'Cash' ? 'Not required for cash' : 'e.g. BK98231940'}
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  {/* Primary Action Buttons (Elevated above remarks/footer so floating badges never overlap) */}
                  <div className="pt-2 pb-1 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceItems([]);
                        setSelectedMonths([]);
                        setDiscountAmount(0);
                        setDiscountReason('');
                        setLateFineAmount(0);
                        setIsManualPaidAmount(false);
                      }}
                      className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-center"
                    >
                      {language === 'bn' ? 'মুছে ফেলুন' : 'Clear'}
                    </button>
                    <button
                      type="submit"
                      disabled={!selectedStudent || invoiceItems.length === 0}
                      className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-md shadow-emerald-700/20 transition-all text-sm"
                    >
                      <Receipt className="w-4 h-4" />
                      <span>{language === 'bn' ? 'ফি গ্রহণ ও রসিদ প্রিন্ট করুন' : 'Confirm & Print Official Receipt'}</span>
                    </button>
                  </div>

                  {/* Optional Remarks & Cashier Attribution */}
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'বিশেষ মন্তব্য (ঐচ্ছিক)' : 'Receipt Remarks (Optional)'}
                      </label>
                      <input
                        type="text"
                        placeholder={language === 'bn' ? 'প্রয়োজনে কোনো মন্তব্য লিখুন...' : 'Optional notes...'}
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center space-x-1.5 sm:justify-end pb-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {language === 'bn' ? 'আদায়কারী:' : 'Cashier:'} <strong>{currentUser.name}</strong> ({currentUser.email})
                      </span>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ONLINE PAYMENT APPROVALS (অনলাইন পেমেন্ট অনুমোদন) */}
      {activeTab === 'online_approvals' && (
        <div className="space-y-5 animate-in fade-in">
          {/* Approval Feedback Banner */}
          {approvalFeedbackNotice && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold animate-in fade-in shadow-xs ${
                approvalFeedbackNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{approvalFeedbackNotice.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setApprovalFeedbackNotice(null)}
                className="text-slate-500 hover:text-slate-800 p-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase">
                    {language === 'bn' ? 'মোট অনলাইন আবেদন' : 'Total Online Requests'}
                  </span>
                  <div className="text-xl font-black text-slate-900 mt-1">
                    {toBnNumber(onlineRequests.length)} টি
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatTaka(onlineRequests.reduce((sum, r) => sum + r.amount, 0))}
                  </div>
                </div>
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Smartphone className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-amber-800 uppercase">
                    {language === 'bn' ? 'অপেক্ষমাণ অনুমোদন' : 'Pending Verification'}
                  </span>
                  <div className="text-xl font-black text-amber-900 mt-1 flex items-center space-x-1.5">
                    <span>{toBnNumber(onlineRequests.filter((r) => r.status === 'pending').length)} টি</span>
                    {pendingRequestsCount > 0 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping inline-block"></span>
                    )}
                  </div>
                  <div className="text-[10px] text-amber-700 mt-0.5">
                    {formatTaka(
                      onlineRequests
                        .filter((r) => r.status === 'pending')
                        .reduce((sum, r) => sum + r.amount, 0)
                    )} (যাচাই প্রয়োজন)
                  </div>
                </div>
                <div className="p-2.5 bg-amber-200 text-amber-800 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-emerald-800 uppercase">
                    {language === 'bn' ? 'অনুমোদিত আদায়' : 'Approved & Collected'}
                  </span>
                  <div className="text-xl font-black text-emerald-900 mt-1">
                    {toBnNumber(onlineRequests.filter((r) => r.status === 'approved').length)} টি
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5 font-bold">
                    {formatTaka(
                      onlineRequests
                        .filter((r) => r.status === 'approved')
                        .reduce((sum, r) => sum + r.amount, 0)
                    )}
                  </div>
                </div>
                <div className="p-2.5 bg-emerald-200 text-emerald-800 rounded-xl">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-rose-50/80 rounded-2xl border border-rose-200 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-rose-800 uppercase">
                    {language === 'bn' ? 'প্রত্যাখ্যাত / বাতিল' : 'Rejected Requests'}
                  </span>
                  <div className="text-xl font-black text-rose-900 mt-1">
                    {toBnNumber(onlineRequests.filter((r) => r.status === 'rejected').length)} টি
                  </div>
                  <div className="text-[10px] text-rose-700 mt-0.5">
                    মন্তব্য সহ বাতিলকৃত আবেদন
                  </div>
                </div>
                <div className="p-2.5 bg-rose-200 text-rose-800 rounded-xl">
                  <X className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters & Actions Bar */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={
                  language === 'bn'
                    ? 'শিক্ষার্থীর নাম, রোল, TrxID বা মোবাইল নম্বর দিয়ে খুঁজুন...'
                    : 'Search by student name, roll, TrxID or phone...'
                }
                value={onlineSearch}
                onChange={(e) => setOnlineSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Status Filter */}
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setOnlineStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    onlineStatusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  সকল ({onlineRequests.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOnlineStatusFilter('pending')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    onlineStatusFilter === 'pending'
                      ? 'bg-amber-500 text-white shadow-2xs font-bold'
                      : 'text-amber-800 hover:text-amber-900'
                  }`}
                >
                  অপেক্ষমাণ ({onlineRequests.filter((r) => r.status === 'pending').length})
                </button>
                <button
                  type="button"
                  onClick={() => setOnlineStatusFilter('approved')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    onlineStatusFilter === 'approved'
                      ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                      : 'text-emerald-800 hover:text-emerald-900'
                  }`}
                >
                  অনুমোদিত ({onlineRequests.filter((r) => r.status === 'approved').length})
                </button>
                <button
                  type="button"
                  onClick={() => setOnlineStatusFilter('rejected')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    onlineStatusFilter === 'rejected'
                      ? 'bg-rose-600 text-white shadow-2xs font-bold'
                      : 'text-rose-800 hover:text-rose-900'
                  }`}
                >
                  বাতিল ({onlineRequests.filter((r) => r.status === 'rejected').length})
                </button>
              </div>

              {/* Method Filter */}
              <select
                value={onlineMethodFilter}
                onChange={(e) => setOnlineMethodFilter(e.target.value as any)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-semibold text-slate-700"
              >
                <option value="all">সকল মাধ্যম (bKash/Nagad/Rocket)</option>
                <option value="bKash">বিকাশ (bKash)</option>
                <option value="Nagad">নগদ (Nagad)</option>
                <option value="Rocket">রকেট (Rocket)</option>
              </select>

              {canManage && (
                <button
                  type="button"
                  onClick={handleClearAllOnlineRequests}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1"
                  title="অনলাইন পেমেন্ট রিকোয়েস্ট তালিকা সম্পূর্ণ খালি করুন"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>{language === 'bn' ? 'তালিকা খালি করুন' : 'Clear All'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowMfsModal(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center space-x-1"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>MFS সেটিংস</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">তারিখ</th>
                    <th className="py-3 px-4">রিকোয়েস্ট নং</th>
                    <th className="py-3 px-4">শিক্ষার্থী ও শ্রেণি</th>
                    <th className="py-3 px-4">ফি এর খাত</th>
                    <th className="py-3 px-4">মাধ্যম</th>
                    <th className="py-3 px-4">প্রেরক নম্বর</th>
                    <th className="py-3 px-4">ট্রানজেকশন আইডি (TrxID)</th>
                    <th className="py-3 px-4 text-right">টাকা</th>
                    <th className="py-3 px-4 text-center">অনুমোদন স্থিতি</th>
                    <th className="py-3 px-4 text-right">কার্যক্রম / অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {onlineRequests
                    .filter((r) => {
                      if (onlineStatusFilter !== 'all' && r.status !== onlineStatusFilter) return false;
                      if (onlineMethodFilter !== 'all' && r.paymentMethod !== onlineMethodFilter) return false;
                      if (onlineSearch.trim() !== '') {
                        const q = onlineSearch.toLowerCase();
                        return (
                          r.studentName.toLowerCase().includes(q) ||
                          r.studentRoll.includes(q) ||
                          r.className.toLowerCase().includes(q) ||
                          r.transactionId.toLowerCase().includes(q) ||
                          r.senderPhone.includes(q) ||
                          r.receiptNo.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-600">{formatDate(req.requestDate)}</td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">{req.receiptNo}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{req.studentName}</div>
                          <div className="text-[10px] text-slate-500">
                            {req.className} ({req.section}) • রোল: {req.studentRoll}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-800 font-medium max-w-xs truncate" title={req.feeTitle}>
                          {req.feeTitle}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              req.paymentMethod === 'bKash'
                                ? 'bg-pink-100 text-pink-700 border border-pink-200'
                                : req.paymentMethod === 'Rocket'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : 'bg-orange-100 text-orange-700 border border-orange-200'
                            }`}
                          >
                            {req.paymentMethod === 'bKash'
                              ? 'বিকাশ'
                              : req.paymentMethod === 'Rocket'
                              ? 'রকেট'
                              : 'নগদ'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 select-all font-semibold">
                          {req.senderPhone}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700 select-all">
                          {req.transactionId}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                          {formatTaka(req.amount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {req.status === 'pending' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                              🟡 অপেক্ষমাণ
                            </span>
                          )}
                          {req.status === 'approved' && (
                            <div>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                🟢 অনুমোদিত
                              </span>
                              {req.approvedBy && (
                                <div className="text-[9px] text-slate-500 mt-0.5">{req.approvedBy}</div>
                              )}
                            </div>
                          )}
                          {req.status === 'rejected' && (
                            <div>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                🔴 বাতিলকৃত
                              </span>
                              {req.rejectedReason && (
                                <div className="text-[10px] text-rose-700 font-bold mt-0.5 max-w-xs truncate" title={req.rejectedReason}>
                                  {req.rejectedReason}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {req.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenApproveModal(req)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors flex items-center space-x-1"
                                  title="Approve payment & issue official receipt"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>অনুমোদন</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenRejectModal(req)}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors flex items-center space-x-1"
                                  title="Reject payment with reason comment"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>বাতিল</span>
                                </button>
                              </>
                            )}
                            {req.status === 'approved' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const foundPayment = payments.find((p) => p.receiptNo === req.receiptNo || p.transactionId === req.transactionId);
                                  setSelectedReceipt(foundPayment || {
                                    id: `pay_${req.id}`,
                                    receiptNo: req.receiptNo,
                                    invoiceId: `inv_${req.id}`,
                                    studentId: req.studentId,
                                    studentName: req.studentName,
                                    className: req.className as any,
                                    roll: req.studentRoll,
                                    amount: req.amount,
                                    paidDate: req.approvedAt?.split('T')[0] || req.requestDate,
                                    paymentMethod: req.paymentMethod as any,
                                    transactionId: req.transactionId,
                                    collectedBy: req.approvedBy || 'Admin',
                                    notes: req.feeTitle,
                                  });
                                  setShowReceiptModal(true);
                                }}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center space-x-1"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>রসিদ</span>
                              </button>
                            )}
                            {req.status === 'rejected' && (
                              <button
                                type="button"
                                onClick={() => handleOpenRejectModal(req)}
                                className="px-2 py-1 text-slate-500 hover:text-slate-700 text-[11px] underline"
                              >
                                কারণ দেখুন
                              </button>
                            )}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleDeleteOnlineRequest(req)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="এই রিকোয়েস্ট মুছে ফেলুন"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {onlineRequests.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        এখনও কোনো শিক্ষার্থী বিকাশ বা নগদে অনলাইন ফি জমার আবেদন পাঠায়নি।
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: INVOICES TABLE */}
      {activeTab === 'collection' && (
        <div className="space-y-4">
          {canManage && !canEditDeleteInvoices && (
            <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900 font-medium">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {language === 'bn'
                  ? 'নিরাপত্তা নীতি: একটি ইনভয়েস তৈরি হওয়ার পর হিসাবরক্ষক সেটি এডিট বা ডিলিট করতে পারবেন না — শুধুমাত্র সুপার অ্যাডমিন সংশোধন বা ডিলিট করতে পারবেন।'
                  : 'Audit lock: Created invoices cannot be edited or deleted by Accountants — only Super Admin can edit or delete them.'}
              </span>
            </div>
          )}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <PeriodFilterBar
              period={invoicePeriodFilter}
              onPeriodChange={setInvoicePeriodFilter}
              customStart={invoiceCustomStart}
              customEnd={invoiceCustomEnd}
              onCustomStartChange={setInvoiceCustomStart}
              onCustomEndChange={setInvoiceCustomEnd}
              language={language}
              compact
            />
            <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={language === 'bn' ? 'শিক্ষার্থী, ইনভয়েস নং বা রোল দিয়ে খুঁজুন...' : 'Search student name, invoice, roll...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
                />
              </div>
              <div className="sm:w-44">
                <select
                  value={invoiceStatusFilter}
                  onChange={(e) => setInvoiceStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white font-semibold"
                >
                  <option value="all">{language === 'bn' ? 'সকল স্ট্যাটাস' : 'All Status'}</option>
                  <option value="Paid">Paid (পরিশোধিত)</option>
                  <option value="Partial">Partial (আংশিক)</option>
                  <option value="Unpaid">Unpaid (বকেয়া)</option>
                </select>
              </div>
              <div className="sm:w-48">
                <select
                  value={selectedSessionFilter}
                  onChange={(e) => setSelectedSessionFilter(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-blue-900"
                >
                  <option value="all">{language === 'bn' ? 'সকল শিক্ষাবর্ষ (All Sessions)' : 'All Sessions'}</option>
                  <option value="2026">সেশন ২০২৬ (বর্তমান)</option>
                  <option value="2027">সেশন ২০২৭ (অগ্রিম ভর্তি)</option>
                  <option value="2028">সেশন ২০২৮</option>
                </select>
              </div>
              <div className="sm:w-44">
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">{language === 'bn' ? 'সকল শ্রেণি' : 'All Classes'}</option>
                  {[...managedClassList].reverse().map((cls) => (
                    <option key={cls.id} value={cls.name}>{formatClassOptionLabel(cls, language)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="font-semibold text-slate-600">
                {getPeriodDisplayLabel(invoicePeriodFilter, language, invoiceCustomStart, invoiceCustomEnd)} •{' '}
                {language === 'bn' ? `${toBnNumber(filteredInvoices.length)}টি ইনভয়েস` : `${filteredInvoices.length} invoices`}
              </span>
              <div className="flex flex-wrap items-center gap-3 font-bold tabular-nums">
                <span className="text-slate-800">
                  {language === 'bn' ? 'মোট বিল:' : 'Billed:'} {formatTaka(filteredInvoices.reduce((s, i) => s + i.netAmount, 0))}
                </span>
                <span className="text-emerald-700">
                  {language === 'bn' ? 'আদায়:' : 'Paid:'} {formatTaka(filteredInvoices.reduce((s, i) => s + i.paidAmount, 0))}
                </span>
                <span className="text-rose-600">
                  {language === 'bn' ? 'বকেয়া:' : 'Due:'} {formatTaka(filteredInvoices.reduce((s, i) => s + i.dueAmount, 0))}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                    <th className="py-3 px-4">Invoice No</th>
                    <th className="py-3 px-4">Student & Class</th>
                    <th className="py-3 px-4">Fee Head / Description</th>
                    <th className="py-3 px-4 text-right">Net Amount</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-4 text-right">Due</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-bold text-blue-700">{inv.invoiceNo}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{inv.studentNameEn}</div>
                        <div className="text-[11px] text-slate-500">
                          {inv.className} ({inv.section}) • Roll: {inv.roll}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium max-w-xs truncate" title={inv.feeType}>
                        {inv.feeType}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">{formatTaka(inv.netAmount)}</td>
                      <td className="py-3 px-4 text-right text-emerald-700 font-semibold">{formatTaka(inv.paidAmount)}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-600">
                        {formatTaka(inv.dueAmount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'Partial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {inv.dueAmount > 0 && canManage ? (
                            <button
                              type="button"
                              onClick={() => handleOpenSingleCollect(inv)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                            >
                              Collect
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const pay = payments.find((p) => p.invoiceId === inv.id);
                                if (pay) {
                                  setSelectedReceipt(pay);
                                  setSelectedReceiptInvoice(inv);
                                  setShowReceiptModal(true);
                                } else {
                                  const previewPay: FeePayment = {
                                    id: `preview_${inv.id}`,
                                    receiptNo: `REC-${inv.invoiceNo.replace('INV-', '')}`,
                                    invoiceId: inv.id,
                                    studentId: inv.studentId,
                                    studentName: inv.studentNameEn,
                                    className: `${inv.className} (${inv.section})`,
                                    roll: inv.roll,
                                    amount: inv.paidAmount,
                                    items: inv.items,
                                    paidDate: inv.dueDate,
                                    paymentMethod: 'Cash',
                                    collectedBy: currentUser.name,
                                    notes: inv.feeType,
                                  };
                                  setSelectedReceipt(previewPay);
                                  setSelectedReceiptInvoice(inv);
                                  setShowReceiptModal(true);
                                }
                              }}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Print Money Receipt"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          )}
                          {canEditDeleteInvoices ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditInvoice(inv)}
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="ইনভয়েস এডিট"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteInvoice(inv)}
                                className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="ইনভয়েস মুছে ফেলুন"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : canManage ? (
                            <span
                              className="inline-flex items-center p-1 text-slate-400 bg-slate-100 rounded border border-slate-200 cursor-not-allowed"
                              title={
                                language === 'bn'
                                  ? 'শুধুমাত্র সুপার অ্যাডমিন ইনভয়েস এডিট বা ডিলিট করতে পারবেন'
                                  : 'Only Super Admin can edit or delete invoices'
                              }
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        {language === 'bn' ? 'কোনো ফি ইনভয়েস পাওয়া যায়নি' : 'No fee invoices found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: STUDENT FEE STATEMENT (LEFT JOMA & RIGHT DUE) */}
      {activeTab === 'statement' && (
        <StudentFeeStatementTab
          preselectedStudentId={selectedStudent?.studentId}
          onGoToCounter={(student, dues) => {
            if (dues && dues.length > 0) {
              if (selectedStudent?.id !== student.id || selectedStudent?.className !== student.className) {
                skipNextAutoItemsRef.current = true;
              }
              setInvoiceItems(dues);
            }
            setSelectedStudent(student);
            setActiveTab('counter');
            window.scrollTo({ top: 200, behavior: 'smooth' });
          }}
        />
      )}

      {/* TAB: CLASS FEE SETUP */}
      {activeTab === 'class_fees' && (
        <ClassFeeSetupTab
          onConfigsUpdated={(newConfigs) => {
            setClassFeeConfigs(newConfigs);
            if (selectedStudent) {
              const currentClassConfig = newConfigs.find((c) => c.className === selectedStudent.className);
              if (currentClassConfig) {
                setMonthlyTuitionRate(currentClassConfig.tuitionFee);
              }
            }
          }}
        />
      )}

      {/* TAB: SCHEDULED FEES & PAYMENT DEADLINES */}
      {activeTab === 'scheduled_fees' && <ScheduledFeesTab />}

      {/* TAB: TRANSPORT STUDENTS & FARES */}
      {activeTab === 'transport_fees' && <TransportStudentsTab />}

      {/* TAB: PAID RECEIPTS / COLLECTION REGISTER */}
      {activeTab === 'invoices' && (
        <div
          className={`space-y-4 ${
            showReceiptModal || showCollectionPrintModal ? 'print:hidden' : ''
          }`}
        >
          {canManage && !canEditDeleteInvoices && (
            <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900 font-medium">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {language === 'bn'
                  ? 'নিরাপত্তা নীতি: রসিদ তৈরি হওয়ার পর হিসাবরক্ষক সেটি এডিট বা ডিলিট করতে পারবেন না — শুধুমাত্র সুপার অ্যাডমিন সংশোধন বা ডিলিট করতে পারবেন।'
                  : 'Audit lock: Created receipts cannot be edited or deleted by Accountants — only Super Admin can edit or delete them.'}
              </span>
            </div>
          )}

          {/* Collection KPI & Today's Live Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 shadow-xs">
              <div className="text-xs font-bold text-emerald-900">
                {language === 'bn' ? 'আজকের মোট কালেকশন (ফি + ভাউচার)' : "Today's Total Collection"}
              </div>
              <div className="mt-1 text-lg font-black text-emerald-700 tabular-nums">
                {formatTaka(todayTotalCollection)}
              </div>
              <div className="text-[11px] text-emerald-800 mt-0.5 tabular-nums">
                {language === 'bn'
                  ? `ফি রসিদ: ${formatTaka(todayFeeCollection)} • আয় ভাউচার: ${formatTaka(todayIncomeVoucherCollection)}`
                  : `Fees: ${formatTaka(todayFeeCollection)} • Vouchers: ${formatTaka(todayIncomeVoucherCollection)}`}
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold text-slate-500">
                {language === 'bn' ? 'নির্বাচিত সময়ের ফি কালেকশন' : 'Filtered Fee Collection'}
              </div>
              <div className="mt-1 text-lg font-extrabold text-slate-900 tabular-nums">
                {formatTaka(receiptMethodSummary.total)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn'
                  ? `${toBnNumber(filteredReceipts.length)}টি রসিদ`
                  : `${filteredReceipts.length} receipt(s)`}
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold text-slate-500">
                {language === 'bn' ? 'নগদ (Cash) কালেকশন' : 'Cash Collection'}
              </div>
              <div className="mt-1 text-lg font-extrabold text-blue-700 tabular-nums">
                {formatTaka(receiptMethodSummary.Cash)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn' ? 'ক্যাশ কাউন্টার প্রাপ্তি' : 'Cash counter payments'}
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold text-slate-500">
                {language === 'bn' ? 'বিকাশ / নগদ / রকেট / ব্যাংক' : 'MFS & Bank Collection'}
              </div>
              <div className="mt-1 text-lg font-extrabold text-purple-700 tabular-nums">
                {formatTaka(receiptMethodSummary.bKash + receiptMethodSummary.Nagad + receiptMethodSummary.Rocket + receiptMethodSummary.Bank)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                bKash: {formatTaka(receiptMethodSummary.bKash)} • Nagad: {formatTaka(receiptMethodSummary.Nagad)}
              </div>
            </div>
          </div>

          {/* Period & Search Filter Bar */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <PeriodFilterBar
              period={receiptPeriodFilter}
              onPeriodChange={setReceiptPeriodFilter}
              customStart={receiptCustomStart}
              customEnd={receiptCustomEnd}
              onCustomStartChange={setReceiptCustomStart}
              onCustomEndChange={setReceiptCustomEnd}
              language={language}
              compact
            />

            <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={receiptSearch}
                    onChange={(e) => setReceiptSearch(e.target.value)}
                    placeholder={language === 'bn' ? 'রসিদ নং, শিক্ষার্থী, রোল বা TrxID...' : 'Search receipt no, student, roll, TrxID...'}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <select
                  value={receiptMethodFilter}
                  onChange={(e) => setReceiptMethodFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-700"
                >
                  <option value="all">{language === 'bn' ? 'সকল পেমেন্ট মাধ্যম' : 'All Methods'}</option>
                  <option value="Cash">Cash (নগদ)</option>
                  <option value="bKash">bKash (বিকাশ)</option>
                  <option value="Nagad">Nagad (নগদ)</option>
                  <option value="Rocket">Rocket (রকেট)</option>
                  <option value="Bank">Bank (ব্যাংক)</option>
                </select>
                {canViewAllCollectors && (
                  <select
                    value={receiptCollectorFilter}
                    onChange={(e) => setReceiptCollectorFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-indigo-200 rounded-xl bg-indigo-50/70 font-bold text-indigo-950"
                  >
                    <option value="all">{language === 'bn' ? 'সকল সংগ্রহকারী' : 'All Collectors'}</option>
                    {collectorDirectory.identities.map((id) => (
                      <option key={id.collectorKey} value={id.collectorKey}>
                        {id.displayNameBn || id.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCollectionPrintModal(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs shrink-0"
              >
                <Printer className="w-4 h-4" />
                <span>{language === 'bn' ? 'কালেকশন রিপোর্ট প্রিন্ট' : 'Print Collection Report'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-bold text-slate-900">
                {language === 'bn' ? 'পরিশোধিত ফি রসিদ খাতা (কালেকশন রেজিস্টার)' : 'Official Fee Payment Receipts Registry'}
              </span>
              <span className="ml-2 text-[11px] text-slate-500 font-medium">
                ({getPeriodDisplayLabel(receiptPeriodFilter, language, receiptCustomStart, receiptCustomEnd)})
              </span>
            </div>
            <span className="text-emerald-700 font-bold tabular-nums">
              {language === 'bn'
                ? `${toBnNumber(filteredReceipts.length)}টি রসিদ • মোট: ${formatTaka(receiptMethodSummary.total)}`
                : `${filteredReceipts.length} Receipts • Total: ${formatTaka(receiptMethodSummary.total)}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-3 px-4">Receipt No</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">{language === 'bn' ? 'সংগ্রহকারী' : 'Collector'}</th>
                  <th className="py-3 px-4">TrxID / Note</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">অ্যাকশন / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceipts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-bold text-blue-700 font-mono">{p.receiptNo}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{p.studentName}</div>
                      <div className="text-[11px] text-slate-500">{p.className} • Roll {p.roll}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {p.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[11px] font-semibold text-slate-700">
                      {p.collectedBy || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-[11px]">
                      {p.transactionId ? <span className="font-mono text-blue-600">{p.transactionId}</span> : p.notes}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{p.paidDate}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700 text-sm tabular-nums">
                      {formatTaka(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          type="button"
                          onClick={() => {
                            const inv = invoices.find((i) => i.id === p.invoiceId);
                            setSelectedReceipt(p);
                            setSelectedReceiptInvoice(inv || null);
                            setShowReceiptModal(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="মানি রসিদ প্রিন্ট করুন"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {canEditDeleteInvoices ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEditReceipt(p)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="রসিদ এডিট / সংশোধন করুন"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePayment(p)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="রসিদ মুছে ফেলুন (Delete Receipt)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : canManage ? (
                          <span
                            className="inline-flex items-center p-1.5 text-slate-400 bg-slate-100 rounded-lg border border-slate-200 cursor-not-allowed"
                            title={
                              language === 'bn'
                                ? 'শুধুমাত্র সুপার অ্যাডমিন রসিদ এডিট বা ডিলিট করতে পারবেন'
                                : 'Only Super Admin can edit or delete receipts'
                            }
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReceipts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      {language === 'bn'
                        ? 'নির্বাচিত সময়কাল বা ফিল্টারে কোনো ফি রসিদ পাওয়া যায়নি।'
                        : 'No payment receipts found for the selected filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {/* TAB: ACCOUNTANT / COLLECTOR-WISE INCOME & EXPENSE REPORT */}
      {activeTab === 'collector_report' && canManage && (
        <CollectorCollectionTab
          payments={payments}
          incomeVouchers={incomeVouchers}
          expenses={expenses}
          staffList={staffList}
          currentUser={currentUser}
          activeRole={activeRole}
          school={school}
          language={language}
          formatTaka={formatTaka}
          toBnNumber={toBnNumber}
          formatDate={formatDate}
          amountInWords={amountInWords}
          onInspectFeeReceipt={(_receiptNo, paymentId) => {
            const pay = payments.find((p) => p.id === paymentId);
            if (!pay) return;
            const inv = invoices.find((i) => i.id === pay.invoiceId) || null;
            setSelectedReceipt(pay);
            setSelectedReceiptInvoice(inv);
            setShowReceiptModal(true);
          }}
          onInspectExpenseVoucher={(expenseId) => {
            const exp = expenses.find((e) => e.id === expenseId);
            if (exp) setPrintingExpense(exp);
          }}
        />
      )}

      {/* TAB: OUTSTANDING DUES LIST */}
      {activeTab === 'dues' && (
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden ${showDuePrintModal ? 'print:hidden' : ''}`}>
          <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs print:hidden">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'শিক্ষার্থীদের বকেয়া ফি তালিকা' : 'Student Outstanding Dues List'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  {language === 'bn'
                    ? `${toBnNumber(groupedDueStudents.length)} জন শিক্ষার্থী (${toBnNumber(filteredDueEntries.length)}টি বকেয়া) • মোট ${formatTaka(totalGroupedDueAmount)}`
                    : `${groupedDueStudents.length} Students (${filteredDueEntries.length} Due Items) • Total ${formatTaka(totalGroupedDueAmount)}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn' ? 'তাত্ক্ষণিকভাবে বকেয়া গ্রহণ করতে "Collect" বাটনে চাপুন বা প্রিন্ট করুন' : 'Click "Collect" to receive dues or Print / Export list'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={language === 'bn' ? 'নাম, আইডি বা রোল...' : 'Name, ID or Roll...'}
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white text-xs w-40 sm:w-48 outline-hidden"
                />
              </div>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-700"
              >
                <option value="all">{language === 'bn' ? 'সকল শ্রেণি' : 'All Classes'}</option>
                {Array.from(new Set(students.map((s) => s.className))).map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
              <select
                value={selectedSessionFilter}
                onChange={(e) => setSelectedSessionFilter(e.target.value as any)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-blue-900"
              >
                <option value="all">{language === 'bn' ? 'সকল শিক্ষাবর্ষ (All Sessions)' : 'All Sessions'}</option>
                <option value="2026">সেশন ২০২৬</option>
                <option value="2027">সেশন ২০২৭ (অগ্রিম ভর্তি)</option>
                <option value="2028">সেশন ২০২৮</option>
              </select>
              <button
                type="button"
                onClick={() => setShowDuePrintModal(true)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'প্রিন্ট / পিডিএফ (Print Due List)' : 'Print Due List'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadDueListCsv}
                className="inline-flex items-center space-x-1 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-colors"
                title="Download Excel / CSV"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>CSV</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Class & Roll</th>
                  <th className="py-3 px-4">Fee Month / Type</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Outstanding Due</th>
                  <th className="py-3 px-4 text-right print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedDueStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 px-4 text-center text-slate-400">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                      <p className="font-semibold text-slate-600">
                        {language === 'bn' ? 'কোনো বকেয়া ফি পাওয়া যায়নি' : 'No outstanding dues found'}
                      </p>
                      <p className="text-[11px] mt-0.5">
                        {language === 'bn' ? 'সকল শিক্ষার্থীর নির্ধারিত ফি পরিশোধিত রয়েছে অথবা ফিল্টার পরিবর্তন করে দেখুন।' : 'All scheduled & invoiced fees are cleared or adjust your filters.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  groupedDueStudents.map((group) => {
                    const isExpanded = expandedDueStudentKey === group.key;
                    const singleEntry = group.entries.length === 1 ? group.entries[0] : null;
                    const dateRangeLabel =
                      group.earliestDueDate !== '—' &&
                      group.latestDueDate !== '—' &&
                      group.earliestDueDate !== group.latestDueDate
                        ? `${group.earliestDueDate} – ${group.latestDueDate}`
                        : group.earliestDueDate;

                    return (
                      <React.Fragment key={group.key}>
                        <tr className="hover:bg-slate-50/60">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {language === 'bn' ? (group.studentNameBn || group.studentNameEn) : group.studentNameEn}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">{group.studentId}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {group.className} ({group.section}) • Roll {group.roll}
                          </td>
                          <td className="py-3 px-4">
                            {singleEntry ? (
                              <>
                                <div className="font-medium text-slate-800">{singleEntry.headName}</div>
                                {singleEntry.monthLabel && singleEntry.monthLabel !== singleEntry.headName && (
                                  <div className="text-[10px] text-slate-500">{singleEntry.monthLabel}</div>
                                )}
                              </>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                                    {language === 'bn'
                                      ? `মোট ${toBnNumber(group.entries.length)}টি বকেয়া`
                                      : `${group.entries.length} Due Items`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDueStudentKey(isExpanded ? null : group.key)}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition-colors print:hidden"
                                  >
                                    {isExpanded ? (
                                      <>
                                        <span>{language === 'bn' ? 'সংক্ষিপ্ত' : 'Hide'}</span>
                                        <ChevronUp className="w-3 h-3" />
                                      </>
                                    ) : (
                                      <>
                                        <span>{language === 'bn' ? 'বিস্তারিত' : 'Details'}</span>
                                        <ChevronDown className="w-3 h-3" />
                                      </>
                                    )}
                                  </button>
                                </div>
                                <div className="text-[11px] text-slate-600 line-clamp-1">
                                  {group.entries
                                    .slice(0, 2)
                                    .map((e) => e.monthLabel || e.headName)
                                    .join(', ')}
                                  {group.entries.length > 2 &&
                                    (language === 'bn'
                                      ? ` + আরও ${toBnNumber(group.entries.length - 2)}টি`
                                      : ` + ${group.entries.length - 2} more`)}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-rose-600 font-medium">{dateRangeLabel}</div>
                            {group.overdueCount > 0 && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                                {group.overdueCount > 1
                                  ? language === 'bn'
                                    ? `${toBnNumber(group.overdueCount)}টি মেয়াদোত্তীর্ণ`
                                    : `${group.overdueCount} Overdue`
                                  : language === 'bn'
                                  ? 'মেয়াদোত্তীর্ণ'
                                  : 'Overdue'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-bold text-rose-600 text-sm">
                              {formatTaka(group.totalAmount)}
                            </div>
                            {group.entries.length > 1 && (
                              <div className="text-[10px] text-slate-500">
                                {language === 'bn'
                                  ? `${toBnNumber(group.entries.length)}টি বকেয়ার মোট`
                                  : `Total of ${group.entries.length} items`}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right print:hidden">
                            <div className="flex items-center justify-end space-x-1.5">
                              {canManage && singleEntry?.sourceInvoice && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSingleCollect(singleEntry.sourceInvoice!)}
                                    className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-xs"
                                  >
                                    Collect
                                  </button>
                                  {canEditDeleteInvoices ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditInvoice(singleEntry.sourceInvoice!)}
                                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="বকেয়া এডিট বা মওকুফ করুন"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteInvoice(singleEntry.sourceInvoice!)}
                                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                        title="বকেয়া ইনভয়েস মুছে ফেলুন"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <span
                                      className="inline-flex items-center p-1.5 text-slate-400 bg-slate-100 rounded-lg border border-slate-200 cursor-not-allowed"
                                      title={
                                        language === 'bn'
                                          ? 'শুধুমাত্র সুপার অ্যাডমিন ইনভয়েস এডিট বা ডিলিট করতে পারবেন'
                                          : 'Only Super Admin can edit or delete invoices'
                                      }
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </>
                              )}
                              {canManage && !(singleEntry?.sourceInvoice) && group.student && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const allStudentDues = group.entries.map((e) => e.dueItem);
                                    if (
                                      selectedStudent?.id !== group.student!.id ||
                                      selectedStudent?.className !== group.student!.className
                                    ) {
                                      skipNextAutoItemsRef.current = true;
                                    }
                                    setInvoiceItems(
                                      allStudentDues.length > 0
                                        ? allStudentDues
                                        : StorageService.getStudentDueFees(group.student!)
                                    );
                                    setSelectedStudent(group.student!);
                                    setActiveTab('counter');
                                    window.scrollTo({ top: 200, behavior: 'smooth' });
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-xs"
                                >
                                  Collect
                                </button>
                              )}
                              {canManage && !(singleEntry?.sourceInvoice) && !group.student && group.entries[0]?.sourceInvoice && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSingleCollect(group.entries[0].sourceInvoice!)}
                                  className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-xs"
                                >
                                  Collect
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && group.entries.length > 1 && (
                          <tr className="bg-slate-50/80 print:hidden">
                            <td colSpan={6} className="px-4 py-2.5">
                              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-700">
                                  <span>
                                    {language === 'bn'
                                      ? `${group.studentNameBn || group.studentNameEn}-এর ${toBnNumber(group.entries.length)}টি বকেয়ার বিবরণ`
                                      : `Breakdown of ${group.entries.length} due items for ${group.studentNameEn}`}
                                  </span>
                                  <span className="text-rose-600">
                                    {language === 'bn' ? 'মোট: ' : 'Total: '}
                                    {formatTaka(group.totalAmount)}
                                  </span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                  {group.entries.map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                                    >
                                      <div>
                                        <span className="font-semibold text-slate-800">{entry.headName}</span>
                                        {entry.monthLabel && entry.monthLabel !== entry.headName && (
                                          <span className="text-slate-500 ml-1.5">({entry.monthLabel})</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-slate-500">{entry.dueDate}</span>
                                        <span className="font-bold text-rose-600">{formatTaka(entry.amount)}</span>
                                        {canManage && entry.sourceInvoice && (
                                          <div className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={() => handleOpenSingleCollect(entry.sourceInvoice!)}
                                              className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-semibold hover:bg-emerald-700"
                                            >
                                              Collect
                                            </button>
                                            {canEditDeleteInvoices ? (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenEditInvoice(entry.sourceInvoice!)}
                                                  className="p-1 text-slate-500 hover:text-blue-600 rounded"
                                                  title="বকেয়া এডিট বা মওকুফ করুন"
                                                >
                                                  <Edit2 className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteInvoice(entry.sourceInvoice!)}
                                                  className="p-1 text-slate-500 hover:text-rose-600 rounded"
                                                  title="বকেয়া ইনভয়েস মুছে ফেলুন"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              </>
                                            ) : (
                                              <span
                                                className="inline-flex items-center p-1 text-slate-400 bg-slate-100 rounded border border-slate-200 cursor-not-allowed"
                                                title={
                                                  language === 'bn'
                                                    ? 'শুধুমাত্র সুপার অ্যাডমিন ইনভয়েস এডিট বা ডিলিট করতে পারবেন'
                                                    : 'Only Super Admin can edit or delete invoices'
                                                }
                                              >
                                                <Lock className="w-3 h-3" />
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {canManage && !entry.sourceInvoice && entry.student && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (
                                                selectedStudent?.id !== entry.student!.id ||
                                                selectedStudent?.className !== entry.student!.className
                                              ) {
                                                skipNextAutoItemsRef.current = true;
                                              }
                                              setInvoiceItems([entry.dueItem]);
                                              setSelectedStudent(entry.student!);
                                              setActiveTab('counter');
                                              window.scrollTo({ top: 200, behavior: 'smooth' });
                                            }}
                                            className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-semibold hover:bg-emerald-700"
                                          >
                                            Collect
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: STAFF PAYROLL */}
      {activeTab === 'payroll' && canManage && (
        <StaffSalaryPayrollTab
          onExpenseUpdated={() => setExpenses(StorageService.getExpenses())}
        />
      )}

      {/* TAB: INCOME & EXPENSE VOUCHERS + STORE/CANTEEN POS */}
      {activeTab === 'expenses' && (
        <IncomeVouchersSection
          activeRole={activeRole}
          currentUserName={currentUser.name}
          currentUserId={currentUser.linkedStaffId || currentUser.id}
          currentUserEmail={currentUser.email}
          school={school}
          language={language}
          students={students}
          expenses={expenses}
          incomeVouchers={incomeVouchers}
          canManage={canManage}
          canEditDeleteInvoices={canEditDeleteInvoices}
          formatTaka={formatTaka}
          toBnNumber={toBnNumber}
          formatDate={formatDate}
          amountInWords={amountInWords}
          onRefreshAll={refreshFinanceData}
          onOpenNewExpenseModal={handleOpenNewExpenseModal}
          onEditExpense={handleOpenEditExpense}
          onDeleteExpense={handleDeleteExpense}
          onPrintExpense={(exp) => setPrintingExpense(exp)}
          externalCreateSignal={incomeCreateSignal}
        />
      )}

      {/* TAB: CASHBOOK */}
      {activeTab === 'cashbook' && (
        <div
          className={`p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-5 ${
            showCashbookPrintModal || printingExpense ? 'print:hidden' : ''
          }`}
        >
          {canManage && !canEditDeleteInvoices && (
            <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900 font-medium">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {language === 'bn'
                  ? 'নিরাপত্তা নীতি: ক্যাশ বুকে এন্ট্রি হওয়ার পর হিসাবরক্ষক কোনো আয় (রসিদ) বা ব্যয় (ভাউচার) এডিট বা ডিলিট করতে পারবেন না — শুধুমাত্র সুপার অ্যাডমিন পারবেন।'
                  : 'Audit lock: Income receipts and expenditure vouchers in Cashbook cannot be edited or deleted by Accountants — only Super Admin can edit or delete them.'}
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {language === 'bn' ? 'দৈনিক ক্যাশ বই ও আয়-ব্যয় খাতা' : 'Daily Cashbook & Financial Summary'}
              </h3>
              <p className="text-xs text-slate-500">
                {school.nameBn} • {getPeriodDisplayLabel(cashbookPeriodFilter, language, cashbookCustomStart, cashbookCustomEnd)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={cashbookMethodFilter}
                onChange={(e) => setCashbookMethodFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50"
              >
                <option value="all">{language === 'bn' ? 'সকল মাধ্যম' : 'All Methods'}</option>
                <option value="Cash">Cash (নগদ)</option>
                <option value="bKash">bKash (বিকাশ)</option>
                <option value="Nagad">Nagad (নগদ)</option>
                <option value="Rocket">Rocket (রকেট)</option>
                <option value="Bank">Bank (ব্যাংক)</option>
              </select>
              <button
                type="button"
                onClick={() => setShowCashbookPrintModal(true)}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'আয়-ব্যয় স্টেটমেন্ট প্রিন্ট' : 'Print Statement'}</span>
              </button>
            </div>
          </div>

          {/* Period Filter Bar for Cashbook */}
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200">
            <PeriodFilterBar
              period={cashbookPeriodFilter}
              onPeriodChange={setCashbookPeriodFilter}
              customStart={cashbookCustomStart}
              customEnd={cashbookCustomEnd}
              onCustomStartChange={setCashbookCustomStart}
              onCustomEndChange={setCashbookCustomEnd}
              language={language}
              compact
            />
          </div>

          {/* Period Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <div className="text-[11px] font-semibold text-emerald-900">
                {language === 'bn' ? 'সময়কালের মোট আয়' : 'Period Income'}
              </div>
              <div className="mt-1 text-lg font-extrabold text-emerald-700 tabular-nums">
                {formatTaka(cashbookTotals.totalIncome)}
              </div>
              <div className="text-[10px] text-emerald-800 mt-0.5 tabular-nums">
                {language === 'bn'
                  ? `ফি: ${formatTaka(cashbookTotals.feeIncome)} • ভাউচার: ${formatTaka(cashbookTotals.voucherIncome)}`
                  : `Fees: ${formatTaka(cashbookTotals.feeIncome)} • Vouchers: ${formatTaka(cashbookTotals.voucherIncome)}`}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
              <div className="text-[11px] font-semibold text-rose-900">
                {language === 'bn' ? 'সময়কালের মোট ব্যয়' : 'Period Expense'}
              </div>
              <div className="mt-1 text-lg font-extrabold text-rose-700 tabular-nums">
                {formatTaka(cashbookTotals.totalExpense)}
              </div>
              <div className="text-[10px] text-rose-800 mt-0.5">
                {language === 'bn'
                  ? `${toBnNumber(cashbookFilteredExpenses.length)}টি ব্যয় ভাউচার`
                  : `${cashbookFilteredExpenses.length} expense voucher(s)`}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
              <div className="text-[11px] font-semibold text-blue-900">
                {language === 'bn' ? 'নিট ক্যাশ উদ্বৃত্ত (Net)' : 'Period Net Balance'}
              </div>
              <div className="mt-1 text-lg font-extrabold text-blue-700 tabular-nums">
                {formatTaka(cashbookTotals.netBalance)}
              </div>
              <div className="text-[10px] text-blue-800 mt-0.5">
                {language === 'bn' ? 'আয় থেকে ব্যয় বাদ দিয়ে' : 'Income minus expenditure'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-600">
                {language === 'bn' ? 'মাধ্যম ভিত্তিক আদায়' : 'Income by Method'}
              </div>
              <div className="mt-1 text-[11px] font-bold text-slate-800 space-y-0.5 tabular-nums">
                <div>Cash: {formatTaka(cashbookTotals.incomeByMethod.Cash)}</div>
                <div>
                  bKash/Nagad: {formatTaka(cashbookTotals.incomeByMethod.bKash + cashbookTotals.incomeByMethod.Nagad)} • Bank: {formatTaka(cashbookTotals.incomeByMethod.Bank)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
              <h4 className="font-bold text-emerald-800 border-b border-emerald-200 pb-2 mb-3 flex items-center justify-between">
                <span>INCOME (আদায় ও বিক্রয়)</span>
                <span className="text-sm tabular-nums">{formatTaka(cashbookTotals.totalIncome)}</span>
              </h4>
              <div className="space-y-2">
                {cashbookFilteredIncomeVouchers.map((v) => (
                  <div key={v.id} className="flex justify-between items-center py-1.5 border-b border-slate-100 hover:bg-white/80 px-2 rounded-lg transition-colors">
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <span>{v.title}</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold">
                          {v.voucherNo}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {v.date} • {v.receivedFrom} • {v.paymentMethod}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-emerald-700 tabular-nums">{formatTaka(v.amount)}</span>
                      {canEditDeleteInvoices ? (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => setActiveTab('expenses')}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                            title={language === 'bn' ? 'ভাউচার সেকশনে দেখুন/এডিট' : 'View/Edit in Vouchers'}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              authorizeTransaction(
                                {
                                  titleBn: `আয় ভাউচার মুছে ফেলা (${v.voucherNo})`,
                                  titleEn: `Delete Income Voucher (${v.voucherNo})`,
                                  summaryBn: `${v.title} • প্রাপক/ক্রেতা: ${v.receivedFrom}`,
                                  summaryEn: `${v.title} • Received From: ${v.receivedFrom}`,
                                  amountLabel: formatTaka(v.amount),
                                  tone: 'rose',
                                },
                                () => {
                                  StorageService.deleteIncomeVoucher(v.id, activeRole);
                                  refreshFinanceData();
                                }
                              );
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title={language === 'bn' ? 'আয় ভাউচার মুছে ফেলুন' : 'Delete income voucher'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : canManage ? (
                        <span
                          className="inline-flex items-center p-1 text-slate-400 bg-slate-100 rounded border border-slate-200 cursor-not-allowed"
                          title={
                            language === 'bn'
                              ? 'শুধুমাত্র সুপার অ্যাডমিন আয় ভাউচার এডিট বা ডিলিট করতে পারবেন'
                              : 'Only Super Admin can edit or delete income vouchers'
                          }
                        >
                          <Lock className="w-3 h-3" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {cashbookFilteredPayments.map((p) => (
                  <div key={p.id} className="flex justify-between items-center py-1.5 border-b border-slate-100 hover:bg-white/80 px-2 rounded-lg transition-colors">
                    <div>
                      <div className="font-semibold text-slate-800">{p.studentName} ({p.receiptNo})</div>
                      <div className="text-[10px] text-slate-400">{p.paidDate} • {p.paymentMethod}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-emerald-700 tabular-nums">{formatTaka(p.amount)}</span>
                      {canEditDeleteInvoices ? (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditReceipt(p)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                            title="রসিদ এডিট"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(p)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="রসিদ মুছে ফেলুন"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : canManage ? (
                        <span
                          className="inline-flex items-center p-1 text-slate-400 bg-slate-100 rounded border border-slate-200 cursor-not-allowed"
                          title={
                            language === 'bn'
                              ? 'শুধুমাত্র সুপার অ্যাডমিন রসিদ এডিট বা ডিলিট করতে পারবেন'
                              : 'Only Super Admin can edit or delete receipts'
                          }
                        >
                          <Lock className="w-3 h-3" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {cashbookFilteredIncomeVouchers.length === 0 && cashbookFilteredPayments.length === 0 && (
                  <div className="py-6 text-center text-slate-400">
                    {language === 'bn' ? 'নির্বাচিত সময়কালে কোনো আয় পাওয়া যায়নি।' : 'No income in selected period.'}
                  </div>
                )}
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
              <h4 className="font-bold text-rose-800 border-b border-rose-200 pb-2 mb-3 flex items-center justify-between">
                <span>EXPENDITURE (ব্যয়)</span>
                <span className="text-sm tabular-nums">{formatTaka(cashbookTotals.totalExpense)}</span>
              </h4>
              <div className="space-y-2">
                {cashbookFilteredExpenses.map((e) => {
                  const lineItems = normalizeExpenseItems(e);
                  return (
                    <div key={e.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-100 hover:bg-white/80 px-2 rounded-lg transition-colors">
                      <div>
                        <div className="font-semibold text-slate-800 flex flex-wrap items-center gap-1.5">
                          <span>{e.title}</span>
                          {lineItems.length > 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-bold">
                              {language === 'bn' ? `${toBnNumber(lineItems.length)}টি আইটেম` : `${lineItems.length} items`}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {e.date} • {e.voucherNo} • {e.paymentMethod}
                          {e.approvedBy ? ` • ${language === 'bn' ? 'ব্যয়কারী' : 'By'}: ${e.approvedBy}` : ''}
                        </div>
                        {lineItems.length > 1 && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {lineItems.map((it) => `${it.description} (×${it.quantity})`).join(' • ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span className="font-bold text-rose-600 tabular-nums">{formatTaka(e.amount)}</span>
                        <button
                          type="button"
                          onClick={() => setPrintingExpense(e)}
                          className="p-1 text-slate-400 hover:text-rose-700 rounded"
                          title={language === 'bn' ? 'ভাউচার প্রিন্ট' : 'Print Voucher'}
                        >
                          <Printer className="w-3 h-3" />
                        </button>
                        {canEditDeleteInvoices ? (
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditExpense(e)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                              title="ব্যয় ভাউচার এডিট"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(e)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="ব্যয় ভাউচার মুছে ফেলুন"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : canManage ? (
                          <span
                            className="inline-flex items-center p-1 text-slate-400 bg-slate-100 rounded border border-slate-200 cursor-not-allowed"
                            title={
                              language === 'bn'
                                ? 'শুধুমাত্র সুপার অ্যাডমিন ব্যয় ভাউচার এডিট বা ডিলিট করতে পারবেন'
                                : 'Only Super Admin can edit or delete expense vouchers'
                            }
                          >
                            <Lock className="w-3 h-3" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {cashbookFilteredExpenses.length === 0 && (
                  <div className="py-6 text-center text-slate-400">
                    {language === 'bn' ? 'নির্বাচিত সময়কালে কোনো ব্যয় পাওয়া যায়নি।' : 'No expenses in selected period.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE INVOICE COLLECT MODAL */}
      {showCollectModal && targetInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Collect Student Fee</h3>
              <button onClick={() => setShowCollectModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmSinglePayment} className="mt-4 space-y-3">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <div className="font-bold text-slate-900">{targetInvoice.studentNameEn}</div>
                <div className="text-[11px] text-slate-600">
                  {targetInvoice.className} ({targetInvoice.section}) • Roll {targetInvoice.roll}
                </div>
                <div className="text-[11px] text-blue-700 font-semibold mt-1">
                  Due Amount: {formatTaka(targetInvoice.dueAmount)} ({targetInvoice.feeType})
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Amount to Collect (৳) *</label>
                <DigitInput
                  required
                  min={1}
                  max={targetInvoice.dueAmount}
                  value={singleCollectAmount}
                  onValueChange={(val) => setSingleCollectAmount(val)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-semibold"
                >
                  <option value="Cash">Cash (নগদ)</option>
                  <option value="bKash">bKash (বিকাশ)</option>
                  <option value="Nagad">Nagad (নগদ)</option>
                  <option value="Rocket">Rocket (রকেট)</option>
                  <option value="Bank">Bank Deposit (ব্যাংক)</option>
                </select>
              </div>

              {paymentMethod !== 'Cash' && (
                <div>
                  <label className="block font-semibold mb-1">Transaction ID (TrxID) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BK98721XA"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs"
                >
                  Confirm & Print Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OFFICIAL DUPLICATE PRINTABLE MONEY RECEIPT MODAL */}
      {showReceiptModal && selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 my-8 max-h-[95vh] overflow-y-auto print:p-0 print:border-none print:shadow-none print:max-w-none print:my-0">
            {/* Header controls (hidden when printing) */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 print:hidden">
              <div className="flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  {language === 'bn' ? 'অফিসিয়াল মানি রসিদ (Duplicate Money Receipt)' : 'Official Money Receipt'}
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>{language === 'bn' ? 'রসিদ প্রিন্ট' : 'Print Receipt'}</span>
                </button>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Receipt Body: Student Copy + Office Copy */}
            <div className="mt-4 space-y-6 text-xs text-slate-900 print:mt-0 print:space-y-4">
              {[
                { copy: 'STUDENT COPY (শিক্ষার্থী কপি)', bg: 'bg-blue-50/30' },
                { copy: 'OFFICE COPY (অফিস কপি)', bg: 'bg-slate-50/40' },
              ].map(({ copy, bg }, idx) => (
                <div
                  key={idx}
                  className={`p-5 border-2 border-dashed border-slate-300 rounded-2xl ${bg} print:border-slate-400 print:p-4 print:rounded-none`}
                >
                  {/* School Header */}
                  <div className="flex items-start justify-between border-b border-slate-300 pb-3">
                    <div className="flex items-center space-x-3">
                      <img
                        src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                        alt="School Logo"
                        className="w-12 h-12 object-contain shrink-0 rounded-lg p-0.5 bg-white border border-slate-200 shadow-2xs print:border-none"
                      />
                      <div className="space-y-0.5">
                        <h2 className="text-base font-extrabold text-slate-900">{school.nameBn}</h2>
                        <h3 className="text-xs font-bold text-slate-700">{school.nameEn}</h3>
                        <p className="text-[10px] text-slate-600">
                          {school.addressBn} • EIIN: {school.eiin} • ফোন: {school.phone}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block px-2.5 py-0.5 bg-slate-900 text-white font-extrabold text-[10px] uppercase rounded-md tracking-wider print:bg-black">
                        {copy}
                      </span>
                      <div className="text-xs font-bold text-blue-800 mt-1.5 font-mono">
                        Receipt: {selectedReceipt.receiptNo}
                      </div>
                      <div className="text-[10px] text-slate-600">
                        Date: {formatDate(selectedReceipt.paidDate)}
                      </div>
                      {selectedReceipt.authVerifiedAt && (
                        <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[9px] font-bold text-emerald-700">
                          ✓ PIN Verified
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Student Info Box */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5 py-2 px-3 bg-white border border-slate-200 rounded-xl text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Student Name:</span>
                      <strong className="text-slate-900">{selectedReceipt.studentName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Class & Roll:</span>
                      <strong>{selectedReceipt.className} • Roll {selectedReceipt.roll}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Payment Method:</span>
                      <strong className="text-emerald-700">
                        {selectedReceipt.paymentMethod} {selectedReceipt.transactionId ? `(${selectedReceipt.transactionId})` : ''}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Academic Session:</span>
                      <strong>{school.currentSession || selectedReceiptInvoice?.session || '2026'} Session</strong>
                    </div>
                  </div>

                  {/* Itemized Table Breakdown */}
                  <div className="my-2 border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                          <th className="py-1.5 px-3 w-8 text-center">SL</th>
                          <th className="py-1.5 px-3">Description / Fee Head (ফি-এর খাত)</th>
                          <th className="py-1.5 px-3">Month / Period (মাস / বিবরণ)</th>
                          <th className="py-1.5 px-3 text-right w-24">Amount (টাকা)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedReceipt.items && selectedReceipt.items.length > 0 ? (
                          selectedReceipt.items.map((it, i) => (
                            <tr key={it.id || i}>
                              <td className="py-1 px-3 text-center text-slate-400 font-mono text-[10px]">{i + 1}</td>
                              <td className="py-1 px-3 font-medium text-slate-900">{it.headName}</td>
                              <td className="py-1 px-3 text-slate-500">{it.month || '-'}</td>
                              <td className="py-1 px-3 text-right font-bold">{it.amount.toLocaleString('en-IN')}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="py-1 px-3 text-center text-slate-400 font-mono text-[10px]">1</td>
                            <td className="py-1 px-3 font-medium text-slate-900">{selectedReceipt.notes || 'School Tuition Fee'}</td>
                            <td className="py-1 px-3 text-slate-500">2026</td>
                            <td className="py-1 px-3 text-right font-bold">{selectedReceipt.amount.toLocaleString('en-IN')}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary & Amount in Words */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2 items-center">
                    <div className="p-2.5 bg-slate-100/80 rounded-lg border border-slate-200 text-[11px]">
                      <span className="font-bold text-slate-700 block text-[10px] uppercase">
                        Amount in Words (কথায়):
                      </span>
                      <strong className="text-slate-900 font-serif">
                        {amountInWords(selectedReceipt.amount)}
                      </strong>
                    </div>

                    <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-lg text-right flex items-center justify-between">
                      <span className="font-bold text-emerald-950 text-xs">
                        Total Amount Received (মোট প্রাপ্ত অর্থ):
                      </span>
                      <span className="text-base font-extrabold text-emerald-800">
                        {formatTaka(selectedReceipt.amount)}
                      </span>
                    </div>
                  </div>

                  {/* Signature lines */}
                  <div className="pt-6 grid grid-cols-2 text-center text-[10px] text-slate-600">
                    <div>
                      <div className="w-36 mx-auto border-t border-slate-400 pt-1">
                        Student / Guardian Signature
                      </div>
                    </div>
                    <div>
                      <div className="w-48 mx-auto border-t border-slate-400 pt-1 font-bold text-slate-800">
                        Authorized Cashier ({selectedReceipt.collectedBy})
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MULTI-ITEM EXPENSE MODAL (CREATE & EDIT) */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs print:hidden">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs animate-in zoom-in-95">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-rose-600" />
                  <span>
                    {editingExpense
                      ? language === 'bn'
                        ? `ব্যয় ভাউচার সংশোধন (${editingExpense.voucherNo})`
                        : `Edit Expense Voucher (${editingExpense.voucherNo})`
                      : language === 'bn'
                      ? 'নতুন প্রাতিষ্ঠানিক ব্যয় ভাউচার (একাধিক আইটেমসহ)'
                      : 'New Multi-Item Expense Voucher'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {language === 'bn'
                    ? 'একটি ভাউচারে একাধিক ব্যয়ের আইটেম, পরিমাণ ও দর যোগ করে সরাসরি অনুমোদন ও প্রিন্ট করুন'
                    : 'Add one or multiple expense line items with quantity and unit price in a single voucher'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowExpenseModal(false);
                  resetExpenseForm();
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {expenseFormError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-semibold">
                  {expenseFormError}
                </div>
              )}

              {/* Quick Preset Chips */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-3 space-y-2">
                <div className="text-[11px] font-bold text-slate-600">
                  {language === 'bn' ? 'দ্রুত সাধারণ ব্যয়ের আইটেম যোগ করুন (এক ক্লিকে):' : 'Quick Add Common Expense Items:'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_EXPENSE_PRESETS.map((preset) => (
                    <button
                      key={preset.description}
                      type="button"
                      onClick={() => handleAddPresetExpenseItem(preset)}
                      className="px-2.5 py-1 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-lg text-[11px] font-semibold text-slate-700 transition-colors"
                    >
                      + {preset.description} ({formatTaka(preset.unitPrice)})
                    </button>
                  ))}
                </div>
              </div>

              {/* Multi-item Expense Line Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    {language === 'bn'
                      ? `ব্যয়ের আইটেম তালিকা (${toBnNumber(expenseItems.length)}টি)`
                      : `Expense Line Items (${expenseItems.length})`}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddExpenseRow}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'আরেকটি আইটেম যোগ করুন' : 'Add Item Row'}</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {expenseItems.map((row, idx) => (
                    <div key={row.id} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white hover:bg-slate-50/40">
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          #{idx + 1} {language === 'bn' ? 'আইটেম / ব্যয়ের বিবরণ *' : 'Item Description *'}
                        </label>
                        <input
                          type="text"
                          placeholder={language === 'bn' ? 'যেমন: মার্কার পেন / বিদ্যুৎ বিল' : 'e.g. Lab Chemical / Marker'}
                          value={row.description}
                          onChange={(e) => handleUpdateExpenseRow(row.id, { description: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          {language === 'bn' ? 'খাত / ক্যাটাগরি' : 'Category'}
                        </label>
                        <select
                          value={row.category || expenseCategory}
                          onChange={(e) => handleUpdateExpenseRow(row.id, { category: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                        >
                          {EXPENSE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-3 sm:col-span-4 gap-1.5 items-end">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {language === 'bn' ? 'পরিমাণ' : 'Qty'}
                          </label>
                          <DigitInput
                            min={1}
                            value={row.quantity}
                            onValueChange={(val) => handleUpdateExpenseRow(row.id, { quantity: val })}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-bold text-center text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {language === 'bn' ? 'দর (৳) *' : 'Rate (৳) *'}
                          </label>
                          <DigitInput
                            min={0}
                            emptyWhenZero
                            value={row.unitPrice || ''}
                            onValueChange={(val) => handleUpdateExpenseRow(row.id, { unitPrice: val })}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-bold text-right text-xs"
                          />
                        </div>
                        <div className="text-right pb-1.5">
                          <span className="block text-[9px] text-slate-400">{language === 'bn' ? 'মোট' : 'Total'}</span>
                          <span className="font-extrabold text-rose-700 tabular-nums">{formatTaka(row.amount)}</span>
                        </div>
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveExpenseRow(row.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title={language === 'bn' ? 'আইটেম সরান' : 'Remove Row'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-4 py-2.5 bg-rose-50/70 border-t border-rose-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleAddExpenseRow}
                    className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-900 font-bold text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{language === 'bn' ? '+ আরও একটি আইটেম যোগ করুন' : '+ Add Another Item'}</span>
                  </button>
                  <div className="text-right">
                    <span className="text-slate-600 font-semibold mr-2">
                      {language === 'bn' ? 'সর্বমোট ব্যয়:' : 'Grand Total:'}
                    </span>
                    <span className="text-base font-black text-rose-700 tabular-nums">
                      {formatTaka(expenseModalGrandTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Voucher Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'প্রাপক (Vendor / Person) *' : 'Paid To (Vendor / Person) *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bengal Scientific Co. / DESCO"
                    value={expensePaidTo}
                    onChange={(e) => setExpensePaidTo(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'মূল ক্যাটাগরি' : 'Primary Category'}
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'তারিখ' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
                  </label>
                  <select
                    value={expenseMethod}
                    onChange={(e) => setExpenseMethod(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="Cash">Cash (নগদ)</option>
                    <option value="bKash">bKash (বিকাশ)</option>
                    <option value="Nagad">Nagad (নগদ)</option>
                    <option value="Bank">Bank (ব্যাংক)</option>
                    <option value="Cheque">Cheque (চেক)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'ভাউচার শিরোনাম (ঐচ্ছিক)' : 'Voucher Title (Auto if blank)'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'bn' ? 'ফাঁকা রাখলে আইটেম থেকে অটো তৈরি হবে' : 'Auto-generated from items if blank'}
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'বিল / রেফারেন্স নং (ঐচ্ছিক)' : 'Ref / Bill No (Optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BILL-409 / TrxID"
                    value={expenseRefNo}
                    onChange={(e) => setExpenseRefNo(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'নোট / মন্তব্য (ঐচ্ছিক)' : 'Notes (Optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'bn' ? 'অতিরিক্ত বিবরণ...' : 'Remarks...'}
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-500">
                  {expenseModalGrandTotal > 0 ? amountInWords(expenseModalGrandTotal) : ''}
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowExpenseModal(false);
                      resetExpenseForm();
                    }}
                    className="px-3.5 py-2 border border-slate-200 rounded-xl text-slate-700 font-semibold"
                  >
                    {language === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs"
                  >
                    {editingExpense
                      ? language === 'bn'
                        ? 'পরিবর্তন সংরক্ষণ করুন'
                        : 'Save Changes'
                      : language === 'bn'
                      ? 'ভাউচার অনুমোদন ও প্রিন্ট'
                      : 'Approve & Print Voucher'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT RECEIPT MODAL */}
      {showEditReceiptModal && editingReceipt && canEditDeleteInvoices && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'ফি রসিদ সংশোধন / এডিট' : 'Edit Fee Receipt'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  রসিদ নং: <span className="font-mono text-blue-700 font-bold">{editingReceipt.receiptNo}</span> • {editingReceipt.studentName}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditReceiptModal(false);
                  setEditingReceipt(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEditReceipt} className="mt-4 space-y-3">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'bn' ? 'পরিশোধিত টাকার পরিমাণ (৳) *' : 'Paid Amount (৳) *'}
                </label>
                <DigitInput
                  required
                  min={1}
                  value={editReceiptAmount}
                  onValueChange={(val) => setEditReceiptAmount(val)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-sm text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
                  </label>
                  <select
                    value={editReceiptMethod}
                    onChange={(e) => setEditReceiptMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="Cash">Cash (নগদ টাকা)</option>
                    <option value="bKash">bKash (বিকাশ)</option>
                    <option value="Nagad">Nagad (নগদ)</option>
                    <option value="Rocket">Rocket (রকেট)</option>
                    <option value="Bank">Bank (ব্যাংক)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'জমার তারিখ *' : 'Payment Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={editReceiptDate}
                    onChange={(e) => setEditReceiptDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'bn' ? 'ট্রানজেকশন আইডি (TrxID)' : 'Transaction ID (TrxID)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. BK8B5544MN"
                  value={editReceiptTrxId}
                  onChange={(e) => setEditReceiptTrxId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono font-semibold"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'bn' ? 'মন্তব্য / খাত বিবরণ' : 'Notes / Description'}
                </label>
                <input
                  type="text"
                  placeholder="বিবরণ বা নোট..."
                  value={editReceiptNotes}
                  onChange={(e) => setEditReceiptNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditReceiptModal(false);
                    setEditingReceipt(null);
                  }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs"
                >
                  {language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT INVOICE / DUE MODAL */}
      {showEditInvoiceModal && editingInvoice && canEditDeleteInvoices && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'ফি ইনভয়েস ও বকেয়া সংশোধন' : 'Edit Fee Invoice & Due'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ইনভয়েস: <span className="font-mono text-blue-700 font-bold">{editingInvoice.invoiceNo}</span> • {editingInvoice.studentNameEn}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditInvoiceModal(false);
                  setEditingInvoice(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEditInvoice} className="mt-4 space-y-3">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'bn' ? 'ফি এর খাত / বিবরণ *' : 'Fee Head / Description *'}
                </label>
                <input
                  type="text"
                  required
                  value={editInvoiceFeeType}
                  onChange={(e) => setEditInvoiceFeeType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'নিট ফি পরিমাণ (৳) *' : 'Net Fee Amount (৳) *'}
                  </label>
                  <DigitInput
                    required
                    min={0}
                    value={editInvoiceNetAmount}
                    onValueChange={(val) => setEditInvoiceNetAmount(val)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'ছাড় / ওয়েভার (৳)' : 'Discount / Waiver (৳)'}
                  </label>
                  <DigitInput
                    min={0}
                    value={editInvoiceDiscount}
                    onValueChange={(val) => setEditInvoiceDiscount(val)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'পরিশোধের শেষ তারিখ' : 'Due Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={editInvoiceDueDate}
                    onChange={(e) => setEditInvoiceDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-semibold">
                    {language === 'bn' ? 'পরিশোধিত:' : 'Paid:'}
                  </div>
                  <div className="text-emerald-700 font-bold">{formatTaka(editingInvoice.paidAmount)}</div>
                  <div className="text-[10px] text-slate-500 font-semibold mt-1">
                    {language === 'bn' ? 'সংশোধিত বকেয়া:' : 'Revised Due:'}
                  </div>
                  <div className="text-rose-600 font-black">
                    {formatTaka(Math.max(0, editInvoiceNetAmount - editingInvoice.paidAmount))}
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditInvoiceModal(false);
                    setEditingInvoice(null);
                  }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs"
                >
                  {language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate Fee Warning Modal */}
      {duplicateWarning && duplicateWarning.isOpen && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border-2 border-amber-400 overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-white animate-pulse" />
                <h3 className="font-extrabold text-sm">
                  {language === 'bn' ? 'সতর্কতা: ফি ইতোমধ্যেই পরিশোধিত!' : 'Alert: Fee Already Paid!'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                <div className="font-bold text-slate-800 text-sm">
                  {selectedStudent.nameBn} ({selectedStudent.nameEn})
                </div>
                <div className="text-slate-600 space-y-1 text-xs">
                  <div>
                    <span className="font-semibold text-slate-500">{language === 'bn' ? 'শ্রেণি ও রোল:' : 'Class & Roll:'} </span>
                    <span className="font-bold text-slate-800">{selectedStudent.className} ({selectedStudent.section}) - রোল {selectedStudent.roll}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">{language === 'bn' ? 'ফি আইটেম:' : 'Fee Item:'} </span>
                    <span className="font-extrabold text-rose-700">{duplicateWarning.feeItemName}</span>
                  </div>
                </div>
              </div>

              {/* Existing Payment Record Info */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="font-bold text-slate-700 flex items-center space-x-1">
                  <Receipt className="w-3.5 h-3.5 text-blue-600" />
                  <span>{language === 'bn' ? 'পূর্বে পরিশোধিত রেকর্ডের তথ্য:' : 'Previous Payment Record:'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-slate-400 block">{language === 'bn' ? 'ইনভয়েস নম্বর:' : 'Invoice No:'}</span>
                    <span className="font-mono font-bold text-blue-700">#{duplicateWarning.existingRecord.invoiceNo}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{language === 'bn' ? 'পরিশোধের তারিখ:' : 'Paid Date:'}</span>
                    <span className="font-mono font-semibold text-slate-700">{duplicateWarning.existingRecord.date}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{language === 'bn' ? 'পূর্বে আদায়কৃত টাকা:' : 'Amount Paid:'}</span>
                    <span className="font-bold text-emerald-700 font-mono">৳ {duplicateWarning.existingRecord.amount}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{language === 'bn' ? 'স্ট্যাটাস:' : 'Status:'}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-block">
                      {duplicateWarning.existingRecord.status === 'Paid' ? 'পরিশোধিত (Paid)' : duplicateWarning.existingRecord.status}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-rose-700 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-200 leading-relaxed">
                {language === 'bn'
                  ? '⚠️ এই শিক্ষার্থী ইতোমধ্যে উক্ত ফি পরিশোধ করেছে। ভুলবশত কি আবার এটি ইনভয়েসে যোগ করতে চাচ্ছেন?'
                  : '⚠️ This student has already paid this fee. Are you sure you want to add it again to the invoice?'}
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-bold transition-colors"
                >
                  {language === 'bn' ? 'না, বাদ দিন (Cancel)' : 'No, Cancel'}
                </button>
                <button
                  type="button"
                  onClick={duplicateWarning.onConfirmAdd}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs transition-colors flex items-center space-x-1"
                >
                  <span>{language === 'bn' ? 'হ্যাঁ, পুনরায় যোগ করুন' : 'Yes, Add Anyway'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ONLINE PAYMENT APPROVE CONFIRMATION MODAL */}
      {approvingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden text-xs">
            <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-emerald-200" />
                <div>
                  <h3 className="font-extrabold text-sm">অনলাইন পেমেন্ট অনুমোদন নিশ্চিতকরণ</h3>
                  <p className="text-[11px] text-emerald-100">অফিশিয়াল মানি রসিদ তৈরি ও বকেয়া সমন্বয় করা হবে</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApprovingRequest(null)}
                className="p-1 hover:bg-white/20 rounded-lg text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">শিক্ষার্থী:</span>
                  <span className="font-bold text-slate-900 text-sm">{approvingRequest.studentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">শ্রেণি ও রোল:</span>
                  <span className="font-bold text-slate-900">{approvingRequest.className} (রোল: {approvingRequest.studentRoll})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ফি বিবরণ:</span>
                  <span className="font-bold text-blue-900">{approvingRequest.feeTitle}</span>
                </div>
                <div className="flex justify-between border-t border-emerald-200/80 pt-1.5">
                  <span className="text-slate-700 font-bold">টাকার পরিমাণ:</span>
                  <span className="font-black text-emerald-700 text-base">{formatTaka(approvingRequest.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">পেমেন্ট মাধ্যম:</span>
                  <span className="font-bold text-slate-900">{approvingRequest.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">প্রেরক মোবাইল:</span>
                  <span className="font-mono font-bold text-slate-800">{approvingRequest.senderPhone}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">ট্রানজেকশন আইডি (TrxID):</span>
                  <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{approvingRequest.transactionId}</span>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                💡 "হ্যাঁ, অনুমোদন করুন" বাটনে ক্লিক করলে শিক্ষার্থীর বকেয়া সমন্বয় হবে এবং সফটওয়্যারে স্বয়ংক্রিয় অফিশিয়াল মানি রসিদ (MR No.) ইস্যু হবে।
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApprovingRequest(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  ফিরে যান
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteApproval(approvingRequest)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition-colors flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>হ্যাঁ, অনুমোদন করুন</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON COMMENT MODAL */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-rose-200 overflow-hidden text-xs">
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <X className="w-5 h-5" />
                <h3 className="font-extrabold text-sm">অনলাইন পেমেন্ট রিকোয়েস্ট বাতিল / প্রত্যাখ্যান</h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingRequest(null)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="p-5 space-y-4">
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 space-y-1.5">
                <div className="font-bold text-slate-900 text-sm">
                  {rejectingRequest.studentName} ({rejectingRequest.className}, রোল: {rejectingRequest.studentRoll})
                </div>
                <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                  <span>ফি: <strong>{rejectingRequest.feeTitle}</strong></span>
                  <span>টাকা: <strong className="text-rose-700">{formatTaka(rejectingRequest.amount)}</strong></span>
                  <span>মাধ্যম: <strong>{rejectingRequest.paymentMethod}</strong></span>
                  <span>TrxID: <strong className="font-mono">{rejectingRequest.transactionId}</strong></span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  প্রত্যাখ্যানের সুনির্দিষ্ট কারণ / কমেন্ট লিখুন *:
                </label>
                <div className="space-y-1.5 mb-2">
                  {[
                    'ট্রানজেকশন আইডি সঠিক নয় / একাউন্টে টাকা জমা হয়নি',
                    'প্রেরক মোবাইল নম্বর বা স্টেটমেন্টের সাথে মেলেনি',
                    'টাকার পরিমাণ কম পাঠানো হয়েছে',
                    'ডুপ্লিকেট ট্রানজেকশন আইডি ব্যবহার করা হয়েছে',
                  ].map((quickReason) => (
                    <button
                      key={quickReason}
                      type="button"
                      onClick={() => setRejectionReasonInput(quickReason)}
                      className="block w-full text-left p-1.5 text-[11px] rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700"
                    >
                      • {quickReason}
                    </button>
                  ))}
                </div>
                <textarea
                  required
                  rows={3}
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="শিক্ষার্থীর ড্যাশবোর্ডে প্রদর্শনের জন্য প্রত্যাখ্যানের কারণ লিখুন..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  এই কারণটি শিক্ষার্থী তার ড্যাশবোর্ডে লাল রঙে দেখতে পাবে যাতে সে সঠিক তথ্য দিয়ে পুনরায় জমা দিতে পারে।
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectingRequest(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  ফিরে যান
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition-colors flex items-center space-x-1"
                >
                  <X className="w-4 h-4" />
                  <span>প্রত্যাখ্যান নিশ্চিত করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MFS PAYMENT SETTINGS MODAL (bKash, Nagad & Rocket Numbers Configuration) */}
      {showMfsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden text-xs max-h-[92vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-pink-600 via-purple-600 to-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Smartphone className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm">বিকাশ, নগদ ও রকেট পেমেন্ট সেটিংস</h3>
                  <p className="text-[11px] text-pink-100">
                    অভিভাবক পোর্টালে অনলাইন ফি গ্রহণের জন্য স্কুলের বিকাশ, নগদ ও রকেট নম্বর কনফিগার করুন
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMfsModal(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors text-white"
              >
                ✕
              </button>
            </div>

            {mfsSavedSuccess && (
              <div className="m-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center space-x-2 font-bold animate-in fade-in">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>বিকাশ, নগদ ও রকেট নম্বর সেটিংস সফলভাবে সংরক্ষিত হয়েছে!</span>
              </div>
            )}

            <form onSubmit={handleSaveMfsSettings} className="p-5 space-y-4">
              {/* bKash Settings Card */}
              <div className="p-4 bg-pink-50/70 border border-pink-200 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 font-bold text-pink-900">
                  <div className="w-3 h-3 rounded-full bg-pink-600"></div>
                  <span>বিকাশ (bKash) সেটিংস</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">বিকাশ নম্বর *</label>
                    <input
                      type="text"
                      required
                      value={bkashNumberInput}
                      onChange={(e) => setBkashNumberInput(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full px-3 py-2 border border-pink-300 rounded-xl font-mono text-sm font-bold bg-white focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">অ্যাকাউন্টের ধরন</label>
                    <select
                      value={bkashTypeInput}
                      onChange={(e) => setBkashTypeInput(e.target.value as any)}
                      className="w-full px-3 py-2 border border-pink-300 rounded-xl text-xs font-semibold bg-white"
                    >
                      <option value="Personal">পার্সোনাল (Personal - Send Money)</option>
                      <option value="Merchant">মার্চেন্ট (Merchant - Payment)</option>
                      <option value="Agent">এজেন্ট (Agent - Cash In)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Nagad Settings Card */}
              <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 font-bold text-orange-900">
                  <div className="w-3 h-3 rounded-full bg-orange-600"></div>
                  <span>নগদ (Nagad) সেটিংস</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">নগদ নম্বর *</label>
                    <input
                      type="text"
                      required
                      value={nagadNumberInput}
                      onChange={(e) => setNagadNumberInput(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full px-3 py-2 border border-orange-300 rounded-xl font-mono text-sm font-bold bg-white focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">অ্যাকাউন্টের ধরন</label>
                    <select
                      value={nagadTypeInput}
                      onChange={(e) => setNagadTypeInput(e.target.value as any)}
                      className="w-full px-3 py-2 border border-orange-300 rounded-xl text-xs font-semibold bg-white"
                    >
                      <option value="Personal">পার্সোনাল (Personal - Send Money)</option>
                      <option value="Merchant">মার্চেন্ট (Merchant - Payment)</option>
                      <option value="Agent">এজেন্ট (Agent - Cash In)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Rocket Settings Card */}
              <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 font-bold text-purple-900">
                  <div className="w-3 h-3 rounded-full bg-purple-600"></div>
                  <span>রকেট (Rocket) সেটিংস</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">রকেট নম্বর *</label>
                    <input
                      type="text"
                      required
                      value={rocketNumberInput}
                      onChange={(e) => setRocketNumberInput(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full px-3 py-2 border border-purple-300 rounded-xl font-mono text-sm font-bold bg-white focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">অ্যাকাউন্টের ধরন</label>
                    <select
                      value={rocketTypeInput}
                      onChange={(e) => setRocketTypeInput(e.target.value as any)}
                      className="w-full px-3 py-2 border border-purple-300 rounded-xl text-xs font-semibold bg-white"
                    >
                      <option value="Personal">পার্সোনাল (Personal - Send Money)</option>
                      <option value="Merchant">মার্চেন্ট (Merchant - Payment)</option>
                      <option value="Agent">এজেন্ট (Agent - Cash In)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  অভিভাবক ও শিক্ষার্থীদের জন্য নির্দেশনাবলী (Payment Instructions)
                </label>
                <textarea
                  rows={2}
                  value={mfsInstructionsInput}
                  onChange={(e) => setMfsInstructionsInput(e.target.value)}
                  placeholder="বিকাশ, নগদ বা রকেট অ্যাপ থেকে Send Money / Payment করার পর..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900">
                💡 এখানে নম্বর পরিবর্তন করলে সাথে সাথে অভিভাবক পোর্টালে এই নম্বর দৃশ্যমান হবে। অভিভাবকরা টাকা পাঠিয়ে ট্রানজেকশন আইডি দিলে আপনি "অনলাইন পেমেন্ট অনুমোদন" ট্যাবে নোটিফিকেশন পাবেন ও অনুমোদন করতে পারবেন।
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMfsModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-pink-600 via-purple-600 to-orange-600 hover:from-pink-700 hover:to-orange-700 text-white rounded-xl font-bold shadow-xs transition-colors flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>সেটিংস সংরক্ষণ করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OFFICIAL PRINTABLE STUDENT DUE LIST MODAL */}
      {showDuePrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-4 sm:p-8 text-xs my-4 sm:my-8 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:my-0 print:max-w-none">
            {/* Modal Controls (Hidden in Print) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-5 print:hidden">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <Printer className="w-5 h-5 text-blue-600" />
                  <span>
                    {language === 'bn'
                      ? 'বকেয়া ফি তালিকা প্রিন্ট প্রিভিউ (Printable Due List)'
                      : 'Official Outstanding Dues Print Preview'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {language === 'bn'
                    ? 'সরাসরি প্রিন্ট করুন অথবা মোবাইল/পিসি থেকে প্রিন্টেবল HTML / CSV ফাইল ডাউনলোড করুন।'
                    : 'Print directly or download a printable A4 HTML report / CSV spreadsheet.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="p-0.5 bg-slate-100 rounded-lg flex text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setDuePrintMode('summary')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      duePrintMode === 'summary' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {language === 'bn' ? 'সংক্ষিপ্ত (মোট বকেয়া)' : 'Summary'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuePrintMode('detailed')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      duePrintMode === 'detailed' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {language === 'bn' ? 'বিস্তারিত বিবরণ' : 'Detailed'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center space-x-1.5 shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDueListPrintableHtml}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold flex items-center space-x-1.5 shadow-xs"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>{language === 'bn' ? 'প্রিন্ট শীট (.html)' : 'Save Print Sheet'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDueListCsv}
                  className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDuePrintModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINTABLE A4 REPORT BODY */}
            <div className="border border-slate-300 p-4 sm:p-6 rounded-xl bg-white space-y-5 print:border-none print:p-0">
              {/* Institution Header */}
              <div className="text-center border-b-2 border-slate-800 pb-3">
                <div className="flex items-center justify-center space-x-3 mb-1.5">
                  <img
                    src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="School Logo"
                    className="w-12 h-12 object-contain"
                  />
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      {school.nameEn}
                    </h2>
                    <h3 className="text-sm font-bold text-blue-800">{school.nameBn}</h3>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600">
                  {school.addressEn || school.addressBn} • Phone: {school.phone} • EIIN: {school.eiin}
                </p>
                <div className="inline-block mt-2 px-3 py-1 bg-slate-900 text-white rounded font-bold uppercase text-[11px] tracking-wider print:bg-black">
                  STUDENT OUTSTANDING DUES LIST (শিক্ষার্থীদের বকেয়া ফি তালিকা)
                </div>
              </div>

              {/* Filter & Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px]">
                <div className="space-x-3">
                  <span>
                    <strong>{language === 'bn' ? 'শ্রেণি:' : 'Class:'}</strong>{' '}
                    {selectedClass === 'all' ? (language === 'bn' ? 'সকল শ্রেণি' : 'All Classes') : selectedClass}
                  </span>
                  <span>
                    <strong>{language === 'bn' ? 'সেশন:' : 'Session:'}</strong>{' '}
                    {selectedSessionFilter === 'all' ? (language === 'bn' ? 'সকল সেশন' : 'All') : selectedSessionFilter}
                  </span>
                </div>
                <div className="space-x-3 font-semibold text-slate-800">
                  <span>
                    {language === 'bn' ? `মোট শিক্ষার্থী: ${toBnNumber(groupedDueStudents.length)} জন` : `Students: ${groupedDueStudents.length}`}
                  </span>
                  <span>•</span>
                  <span className="text-rose-700 font-bold">
                    {language === 'bn' ? `সর্বমোট বকেয়া: ${formatTaka(totalGroupedDueAmount)}` : `Grand Total: ${formatTaka(totalGroupedDueAmount)}`}
                  </span>
                  <span>•</span>
                  <span className="text-slate-500 font-normal">
                    {new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-GB')}
                  </span>
                </div>
              </div>

              {/* Printable Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold uppercase">
                      <th className="border border-slate-300 py-2 px-2.5 text-center w-10">SL</th>
                      <th className="border border-slate-300 py-2 px-2.5">Student Name & ID</th>
                      <th className="border border-slate-300 py-2 px-2.5">Class & Roll</th>
                      <th className="border border-slate-300 py-2 px-2.5">Guardian Mobile</th>
                      <th className="border border-slate-300 py-2 px-2.5">
                        {duePrintMode === 'detailed' ? 'Fee Breakdown' : 'Due Summary'}
                      </th>
                      <th className="border border-slate-300 py-2 px-2.5">Due Date</th>
                      <th className="border border-slate-300 py-2 px-2.5 text-right">Total Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedDueStudents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="border border-slate-300 py-6 text-center text-slate-500">
                          {language === 'bn' ? 'কোনো বকেয়া ফি পাওয়া যায়নি।' : 'No outstanding dues found.'}
                        </td>
                      </tr>
                    ) : (
                      groupedDueStudents.map((group, idx) => {
                        const dateRangeLabel =
                          group.earliestDueDate !== '—' &&
                          group.latestDueDate !== '—' &&
                          group.earliestDueDate !== group.latestDueDate
                            ? `${group.earliestDueDate} – ${group.latestDueDate}`
                            : group.earliestDueDate;
                        return (
                          <tr key={group.key} className="hover:bg-slate-50/40">
                            <td className="border border-slate-300 py-2 px-2.5 text-center font-mono">
                              {language === 'bn' ? toBnNumber(idx + 1) : idx + 1}
                            </td>
                            <td className="border border-slate-300 py-2 px-2.5">
                              <div className="font-bold text-slate-900">
                                {language === 'bn' ? (group.studentNameBn || group.studentNameEn) : group.studentNameEn}
                              </div>
                              <div className="text-[10px] font-mono text-slate-600">{group.studentId}</div>
                            </td>
                            <td className="border border-slate-300 py-2 px-2.5 text-slate-800">
                              {group.className} ({group.section}) • Roll {group.roll}
                            </td>
                            <td className="border border-slate-300 py-2 px-2.5 font-mono text-slate-700">
                              {group.student?.guardianPhone || '—'}
                            </td>
                            <td className="border border-slate-300 py-2 px-2.5 text-slate-700">
                              {duePrintMode === 'detailed' ? (
                                <ul className="list-disc pl-3.5 space-y-0.5 text-[10px]">
                                  {group.entries.map((e) => (
                                    <li key={e.id}>
                                      {e.headName}
                                      {e.monthLabel && e.monthLabel !== e.headName ? ` (${e.monthLabel})` : ''} —{' '}
                                      <strong>{formatTaka(e.amount)}</strong>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div>
                                  <span className="font-semibold text-slate-900">
                                    {language === 'bn'
                                      ? `মোট ${toBnNumber(group.entries.length)}টি বকেয়া:`
                                      : `${group.entries.length} item(s):`}
                                  </span>{' '}
                                  <span className="text-[10px] text-slate-600">
                                    {group.entries.map((e) => e.monthLabel || e.headName).join(', ')}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="border border-slate-300 py-2 px-2.5 text-rose-700 font-medium">
                              {dateRangeLabel}
                            </td>
                            <td className="border border-slate-300 py-2 px-2.5 text-right font-extrabold text-rose-700">
                              {formatTaka(group.totalAmount)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {groupedDueStudents.length > 0 && (
                    <tfoot>
                      <tr className="bg-rose-50/70 font-extrabold text-slate-900">
                        <td colSpan={6} className="border border-slate-300 py-2.5 px-3 text-right">
                          {language === 'bn'
                            ? `সর্বমোট বকেয়া (${toBnNumber(groupedDueStudents.length)} জন শিক্ষার্থী):`
                            : `GRAND TOTAL OUTSTANDING DUE (${groupedDueStudents.length} Students):`}
                        </td>
                        <td className="border border-slate-300 py-2.5 px-2.5 text-right text-rose-700 text-sm">
                          {formatTaka(totalGroupedDueAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Signatures Footer */}
              <div className="pt-10 flex items-end justify-between text-[11px] text-slate-700">
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-1 px-6 font-semibold">
                    {language === 'bn' ? 'হিসাবরক্ষক' : 'Accounts Officer'}
                  </div>
                </div>
                <div className="text-center">
                  <PrincipalSignatureDisplay
                    school={school}
                    fallbackText=""
                    heightClass="h-10"
                    textClassName="font-serif italic font-bold text-xs text-slate-900 pb-0.5"
                  />
                  <div className="border-t border-slate-400 pt-1 px-6 font-semibold">
                    {language === 'bn' ? 'প্রধান শিক্ষক / অধ্যক্ষ' : 'Principal / Head Teacher'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL PRINTABLE MULTI-ITEM EXPENSE VOUCHER MODAL */}
      {printingExpense && (
        <ExpenseVoucherPrintModal
          expense={printingExpense}
          school={school}
          language={language}
          formatTaka={formatTaka}
          toBnNumber={toBnNumber}
          formatDate={formatDate}
          amountInWords={amountInWords}
          onClose={() => setPrintingExpense(null)}
        />
      )}

      {/* OFFICIAL PRINTABLE COLLECTION REPORT MODAL */}
      {showCollectionPrintModal && (
        <CollectionReportPrintModal
          payments={filteredReceipts}
          periodLabel={getPeriodDisplayLabel(receiptPeriodFilter, language, receiptCustomStart, receiptCustomEnd)}
          methodFilterLabel={receiptMethodFilter === 'all' ? (language === 'bn' ? 'সকল মাধ্যম' : 'All Methods') : receiptMethodFilter}
          school={school}
          language={language}
          formatTaka={formatTaka}
          toBnNumber={toBnNumber}
          formatDate={formatDate}
          amountInWords={amountInWords}
          onClose={() => setShowCollectionPrintModal(false)}
        />
      )}

      {/* OFFICIAL PRINTABLE CASHBOOK / INCOME-EXPENSE STATEMENT MODAL */}
      {showCashbookPrintModal && (
        <CashbookStatementPrintModal
          payments={cashbookFilteredPayments}
          incomeVouchers={cashbookFilteredIncomeVouchers}
          expenses={cashbookFilteredExpenses}
          periodLabel={getPeriodDisplayLabel(cashbookPeriodFilter, language, cashbookCustomStart, cashbookCustomEnd)}
          school={school}
          language={language}
          formatTaka={formatTaka}
          toBnNumber={toBnNumber}
          formatDate={formatDate}
          amountInWords={amountInWords}
          onClose={() => setShowCashbookPrintModal(false)}
        />
      )}

      {/* TRANSACTION PASSWORD AUTHORIZATION & SECURITY POLICY MODALS */}
      {authModalElement}
    </div>
  );
};
