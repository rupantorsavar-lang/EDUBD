import React, { useState, useMemo, useEffect } from 'react';
import {
  IncomeVoucher,
  IncomeVoucherLineItem,
  SaleItem,
  SaleItemCategory,
  Expense,
  Student,
  SchoolProfile,
  UserRole,
} from '../../types';
import { StorageService } from '../../services/storage';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { DigitInput } from '../common/DigitInput';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';
import { PeriodFilterBar } from './PeriodFilterBar';
import { ExpenseSummaryPrintModal, IncomeSummaryPrintModal } from './FinancePrintModals';
import { useTransactionPasswordGuard } from './TransactionPasswordModal';
import {
  DateFilterPeriod,
  getPeriodDisplayLabel,
  isDateInPeriod,
  normalizeExpenseItems,
  toLocalIsoDate,
} from '../../utils/financeFilters';
import {
  Plus,
  Search,
  Printer,
  Edit2,
  Trash2,
  Lock,
  BookOpen,
  PenTool,
  UtensilsCrossed,
  Shirt,
  Package,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  User,
  Minus,
  Receipt,
  Calendar,
  Boxes,
  Store,
} from 'lucide-react';

interface IncomeVouchersSectionProps {
  activeRole: UserRole | null;
  currentUserName: string;
  currentUserId?: string;
  currentUserEmail?: string;
  school: SchoolProfile;
  language: 'bn' | 'en';
  students: Student[];
  expenses: Expense[];
  incomeVouchers: IncomeVoucher[];
  canManage: boolean;
  canEditDeleteInvoices: boolean;
  formatTaka: (amount: number) => string;
  toBnNumber: (num: number | string) => string;
  formatDate: (dateStr: string) => string;
  amountInWords: (amount: number) => string;
  onRefreshAll: () => void;
  onOpenNewExpenseModal: () => void;
  onEditExpense: (exp: Expense) => void;
  onDeleteExpense: (exp: Expense) => void;
  onPrintExpense?: (exp: Expense) => void;
  initialSubMode?: 'income' | 'expense' | 'catalog';
  externalCreateSignal?: number;
}

export const SALE_CATEGORY_META: Record<
  SaleItemCategory,
  { labelBn: string; labelEn: string; badgeClass: string; icon: typeof BookOpen }
> = {
  Books: {
    labelBn: 'বই ও গাইড',
    labelEn: 'Books',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: BookOpen,
  },
  Stationery: {
    labelBn: 'খাতা ও কলম',
    labelEn: 'Stationery',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: PenTool,
  },
  Canteen: {
    labelBn: 'খাবার ও ক্যান্টিন',
    labelEn: 'Food & Canteen',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: UtensilsCrossed,
  },
  Uniform: {
    labelBn: 'ইউনিফর্ম ও আইডি',
    labelEn: 'Uniform & ID',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    icon: Shirt,
  },
  Other: {
    labelBn: 'অন্যান্য আয়',
    labelEn: 'Other Income',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Package,
  },
};

const STARTER_CATALOG_PRESETS: Array<Omit<SaleItem, 'id'>> = [
  // Books
  {
    nameBn: 'পাঠ্যবই ও গাইড সেট',
    nameEn: 'Textbook & Guide Set',
    category: 'Books',
    unitPrice: 250,
    unit: 'সেট',
    stockQty: 40,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'বাংলা ব্যাকরণ ও সহায়ক বই',
    nameEn: 'Bangla Grammar & Helper Book',
    category: 'Books',
    unitPrice: 140,
    unit: 'টি',
    stockQty: 50,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'English Grammar & Spoken Book',
    nameEn: 'English Grammar Book',
    category: 'Books',
    unitPrice: 160,
    unit: 'টি',
    stockQty: 50,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'গণিত প্র্যাকটিস ও মডেল বই',
    nameEn: 'Math Practice Book',
    category: 'Books',
    unitPrice: 150,
    unit: 'টি',
    stockQty: 45,
    trackStock: true,
    isActive: true,
  },
  // Stationery
  {
    nameBn: 'স্কুল খাতা (৮০ পাতা)',
    nameEn: 'School Exercise Notebook (80p)',
    category: 'Stationery',
    unitPrice: 35,
    unit: 'টি',
    stockQty: 200,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'বড় প্রিমিয়াম খাতা (১২০ পাতা)',
    nameEn: 'Large Notebook (120p)',
    category: 'Stationery',
    unitPrice: 55,
    unit: 'টি',
    stockQty: 150,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'বলপেন (নীল / কালো / লাল)',
    nameEn: 'Ballpoint Pen',
    category: 'Stationery',
    unitPrice: 10,
    unit: 'টি',
    stockQty: 300,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'কাঠ পেন্সিল (2B)',
    nameEn: 'Wooden Pencil (2B)',
    category: 'Stationery',
    unitPrice: 15,
    unit: 'টি',
    stockQty: 150,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'রাবার ও শার্পনার সেট',
    nameEn: 'Eraser & Sharpener Set',
    category: 'Stationery',
    unitPrice: 20,
    unit: 'সেট',
    stockQty: 100,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'জ্যামিতি বক্স (কমপ্লিট সেট)',
    nameEn: 'Geometry Box Set',
    category: 'Stationery',
    unitPrice: 130,
    unit: 'বক্স',
    stockQty: 40,
    trackStock: true,
    isActive: true,
  },
  // Canteen & Tasty Snacks
  {
    nameBn: 'গরম সিঙ্গারা',
    nameEn: 'Crispy Singara',
    category: 'Canteen',
    unitPrice: 15,
    unit: 'পিস',
    stockQty: 100,
    trackStock: false,
    isActive: true,
  },
  {
    nameBn: 'ক্রিস্পি সমুচা',
    nameEn: 'Crispy Samosa',
    category: 'Canteen',
    unitPrice: 15,
    unit: 'পিস',
    stockQty: 100,
    trackStock: false,
    isActive: true,
  },
  {
    nameBn: 'চিকেন প্যাটিস / রোল',
    nameEn: 'Chicken Patties / Roll',
    category: 'Canteen',
    unitPrice: 35,
    unit: 'পিস',
    stockQty: 50,
    trackStock: false,
    isActive: true,
  },
  {
    nameBn: 'ফ্রেশ কেক / কাপকেক',
    nameEn: 'Fresh Bakery Cake / Cupcake',
    category: 'Canteen',
    unitPrice: 20,
    unit: 'পিস',
    stockQty: 80,
    trackStock: false,
    isActive: true,
  },
  {
    nameBn: 'ক্রিম বিস্কুট / কুকিজ প্যাক',
    nameEn: 'Cream Biscuit / Cookies Pack',
    category: 'Canteen',
    unitPrice: 20,
    unit: 'প্যাক',
    stockQty: 90,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'ম্যাঙ্গো / লিচি ফ্রুট জুস',
    nameEn: 'Mango / Litchi Fruit Juice',
    category: 'Canteen',
    unitPrice: 25,
    unit: 'প্যাক',
    stockQty: 80,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'চকলেট মিল্ক / লাচ্ছি',
    nameEn: 'Chocolate Milk / Lassi',
    category: 'Canteen',
    unitPrice: 30,
    unit: 'বোতল',
    stockQty: 60,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'মিনারেল ওয়াটার (৫০০ মিলি)',
    nameEn: 'Mineral Water (500ml)',
    category: 'Canteen',
    unitPrice: 20,
    unit: 'বোতল',
    stockQty: 120,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'পটেটো চিপস প্যাক',
    nameEn: 'Potato Chips Pack',
    category: 'Canteen',
    unitPrice: 15,
    unit: 'প্যাক',
    stockQty: 100,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'চকলেট ওয়েফার / চকলেট বার',
    nameEn: 'Chocolate Wafer / Bar',
    category: 'Canteen',
    unitPrice: 20,
    unit: 'টি',
    stockQty: 100,
    trackStock: true,
    isActive: true,
  },
  // Uniform & Other
  {
    nameBn: 'স্কুল টাই ও মনোগ্রাম ব্যাজ',
    nameEn: 'School Tie & Monogram Badge',
    category: 'Uniform',
    unitPrice: 120,
    unit: 'সেট',
    stockQty: 60,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'আইডি কার্ড ফিতা ও হোল্ডার',
    nameEn: 'ID Card Ribbon & Holder',
    category: 'Uniform',
    unitPrice: 50,
    unit: 'টি',
    stockQty: 100,
    trackStock: true,
    isActive: true,
  },
  {
    nameBn: 'ভর্তি ফর্ম ও প্রসপেক্টাস',
    nameEn: 'Admission Form & Prospectus',
    category: 'Other',
    unitPrice: 200,
    unit: 'টি',
    stockQty: 100,
    trackStock: false,
    isActive: true,
  },
];

export const IncomeVouchersSection: React.FC<IncomeVouchersSectionProps> = ({
  activeRole,
  currentUserName,
  currentUserId,
  currentUserEmail,
  school,
  language,
  students,
  expenses,
  incomeVouchers,
  canManage,
  canEditDeleteInvoices,
  formatTaka,
  toBnNumber,
  formatDate,
  amountInWords,
  onRefreshAll,
  onOpenNewExpenseModal,
  onEditExpense,
  onDeleteExpense,
  onPrintExpense,
  initialSubMode = 'income',
  externalCreateSignal = 0,
}) => {
  const [subMode, setSubMode] = useState<'income' | 'expense' | 'catalog'>(initialSubMode);
  const [saleItems, setSaleItems] = useState<SaleItem[]>(() => StorageService.getSaleItems());
  const { authorizeTransaction, authModalElement } = useTransactionPasswordGuard(language);

  useEffect(() => {
    const refreshCatalog = () => setSaleItems(StorageService.getSaleItems());
    window.addEventListener('school_sale_items_updated', refreshCatalog);
    window.addEventListener('school_cloud_data_synced', refreshCatalog);
    return () => {
      window.removeEventListener('school_sale_items_updated', refreshCatalog);
      window.removeEventListener('school_cloud_data_synced', refreshCatalog);
    };
  }, []);

  const localToday = toLocalIsoDate();

  // Income voucher filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<SaleItemCategory | 'All'>('All');
  const [dateFilter, setDateFilter] = useState<DateFilterPeriod>('all');
  const [incomeCustomStart, setIncomeCustomStart] = useState<string>(localToday);
  const [incomeCustomEnd, setIncomeCustomEnd] = useState<string>(localToday);

  // Expense voucher filters & print modals
  const [expSearchQuery, setExpSearchQuery] = useState<string>('');
  const [expCategoryFilter, setExpCategoryFilter] = useState<string>('All');
  const [expDateFilter, setExpDateFilter] = useState<DateFilterPeriod>('all');
  const [expCustomStart, setExpCustomStart] = useState<string>(localToday);
  const [expCustomEnd, setExpCustomEnd] = useState<string>(localToday);
  const [showIncomeSummaryPrint, setShowIncomeSummaryPrint] = useState<boolean>(false);
  const [showExpenseSummaryPrint, setShowExpenseSummaryPrint] = useState<boolean>(false);

  // POS / Voucher Modal State
  const [showVoucherModal, setShowVoucherModal] = useState<boolean>(false);
  const [editingVoucher, setEditingVoucher] = useState<IncomeVoucher | null>(null);
  const [posCategoryTab, setPosCategoryTab] = useState<SaleItemCategory | 'All'>('All');
  const [posItemSearch, setPosItemSearch] = useState<string>('');
  const [cartItems, setCartItems] = useState<IncomeVoucherLineItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [buyerMode, setBuyerMode] = useState<'walkin' | 'student'>('walkin');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [receivedFromInput, setReceivedFromInput] = useState<string>('');
  const [buyerPhoneInput, setBuyerPhoneInput] = useState<string>('');
  const [voucherDateInput, setVoucherDateInput] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [paymentMethodInput, setPaymentMethodInput] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank'>('Cash');
  const [transactionIdInput, setTransactionIdInput] = useState<string>('');
  const [voucherTitleInput, setVoucherTitleInput] = useState<string>('');
  const [voucherNotesInput, setVoucherNotesInput] = useState<string>('');
  const [posFormError, setPosFormError] = useState<string>('');

  // Quick Custom Item Row inside POS Modal
  const [customItemName, setCustomItemName] = useState<string>('');
  const [customItemCategory, setCustomItemCategory] = useState<SaleItemCategory>('Canteen');
  const [customItemQty, setCustomItemQty] = useState<number>(1);
  const [customItemPrice, setCustomItemPrice] = useState<number>(0);

  // Catalog Modal State
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [editingSaleItem, setEditingSaleItem] = useState<SaleItem | null>(null);
  const [itemNameBn, setItemNameBn] = useState<string>('');
  const [itemNameEn, setItemNameEn] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<SaleItemCategory>('Books');
  const [itemUnitPrice, setItemUnitPrice] = useState<number>(0);
  const [itemUnit, setItemUnit] = useState<string>('টি');
  const [itemStockQty, setItemStockQty] = useState<number>(50);
  const [itemTrackStock, setItemTrackStock] = useState<boolean>(true);
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<SaleItemCategory | 'All'>('All');
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  // Printable Voucher / Cash Memo Modal
  const [printingVoucher, setPrintingVoucher] = useState<IncomeVoucher | null>(null);

  // Confirmation modal (for deletes without browser dialogs)
  const [confirmDeleteVoucher, setConfirmDeleteVoucher] = useState<IncomeVoucher | null>(null);
  const [confirmDeleteCatalogItem, setConfirmDeleteCatalogItem] = useState<SaleItem | null>(null);

  // Feedback banner
  const [noticeBanner, setNoticeBanner] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showBanner = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNoticeBanner({ text, type });
    setTimeout(() => setNoticeBanner(null), 4500);
  };

  useEffect(() => {
    if (externalCreateSignal > 0 && canManage) {
      setSubMode('income');
      handleOpenCreateVoucher();
    }
  }, [externalCreateSignal]);

  const todayIso = toLocalIsoDate();

  // KPI Metrics for Income Vouchers
  const incomeMetrics = useMemo(() => {
    let totalAmount = 0;
    let todayAmount = 0;
    let todayCount = 0;
    let booksStationeryAmount = 0;
    let canteenAmount = 0;

    incomeVouchers.forEach((v) => {
      const amt = Number(v.amount) || 0;
      totalAmount += amt;
      if (isDateInPeriod(v.date, 'today')) {
        todayAmount += amt;
        todayCount += 1;
      }

      if (Array.isArray(v.items) && v.items.length > 0) {
        const subTotal = v.items.reduce((s, it) => s + (Number(it.total) || 0), 0);
        const ratio = subTotal > 0 ? amt / subTotal : 1;
        v.items.forEach((it) => {
          const adjusted = Math.round((Number(it.total) || 0) * ratio);
          if (it.category === 'Books' || it.category === 'Stationery') {
            booksStationeryAmount += adjusted;
          } else if (it.category === 'Canteen') {
            canteenAmount += adjusted;
          }
        });
      } else {
        if (v.category === 'Books' || v.category === 'Stationery') {
          booksStationeryAmount += amt;
        } else if (v.category === 'Canteen') {
          canteenAmount += amt;
        }
      }
    });

    return {
      totalAmount,
      todayAmount,
      todayCount,
      booksStationeryAmount,
      canteenAmount,
    };
  }, [incomeVouchers]);

  const totalExpensesAmount = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const expenseCategories = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [expenses]);

  const expenseMetrics = useMemo(() => {
    let todayAmount = 0;
    let todayCount = 0;
    let monthAmount = 0;
    let totalItemsCount = 0;

    expenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      if (isDateInPeriod(e.date, 'today')) {
        todayAmount += amt;
        todayCount += 1;
      }
      if (isDateInPeriod(e.date, 'month')) {
        monthAmount += amt;
      }
      totalItemsCount += normalizeExpenseItems(e).length;
    });

    return {
      todayAmount,
      todayCount,
      monthAmount,
      totalItemsCount,
    };
  }, [expenses]);

  // Filtered Income Vouchers
  const filteredVouchers = useMemo(() => {
    return incomeVouchers.filter((v) => {
      if (!isDateInPeriod(v.date, dateFilter, incomeCustomStart, incomeCustomEnd)) return false;
      if (categoryFilter !== 'All') {
        const matchesMain = v.category === categoryFilter;
        const matchesItem = Array.isArray(v.items) && v.items.some((it) => it.category === categoryFilter);
        if (!matchesMain && !matchesItem) return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const itemText = (v.items || []).map((i) => i.name).join(' ').toLowerCase();
        return (
          v.voucherNo.toLowerCase().includes(q) ||
          v.title.toLowerCase().includes(q) ||
          v.receivedFrom.toLowerCase().includes(q) ||
          (v.buyerPhone || '').toLowerCase().includes(q) ||
          itemText.includes(q)
        );
      }
      return true;
    });
  }, [incomeVouchers, dateFilter, incomeCustomStart, incomeCustomEnd, categoryFilter, searchQuery]);

  // Filtered Expense Vouchers
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!isDateInPeriod(e.date, expDateFilter, expCustomStart, expCustomEnd)) return false;
      if (expCategoryFilter !== 'All' && e.category !== expCategoryFilter) return false;
      if (expSearchQuery.trim() !== '') {
        const q = expSearchQuery.toLowerCase().trim();
        const itemText = normalizeExpenseItems(e)
          .map((it) => it.description)
          .join(' ')
          .toLowerCase();
        return (
          e.voucherNo.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q) ||
          (e.paidTo || '').toLowerCase().includes(q) ||
          (e.category || '').toLowerCase().includes(q) ||
          itemText.includes(q)
        );
      }
      return true;
    });
  }, [expenses, expDateFilter, expCustomStart, expCustomEnd, expCategoryFilter, expSearchQuery]);

  // Catalog Items + Quick Pick Pool inside POS
  const quickPickPool = useMemo(() => {
    const baseList: Array<{
      id?: string;
      nameBn: string;
      nameEn: string;
      category: SaleItemCategory;
      unitPrice: number;
      unit?: string;
      stockQty?: number;
      trackStock?: boolean;
      fromCatalog: boolean;
    }> =
      saleItems.length > 0
        ? saleItems
            .filter((it) => it.isActive !== false)
            .map((it) => ({ ...it, fromCatalog: true }))
        : STARTER_CATALOG_PRESETS.map((p, idx) => ({
            ...p,
            id: `preset_${idx}`,
            fromCatalog: false,
          }));

    return baseList.filter((it) => {
      if (posCategoryTab !== 'All' && it.category !== posCategoryTab) return false;
      if (posItemSearch.trim() !== '') {
        const q = posItemSearch.toLowerCase().trim();
        return it.nameBn.toLowerCase().includes(q) || it.nameEn.toLowerCase().includes(q);
      }
      return true;
    });
  }, [saleItems, posCategoryTab, posItemSearch]);

  const filteredCatalogItems = useMemo(() => {
    return saleItems.filter((it) => {
      if (catalogCategoryFilter !== 'All' && it.category !== catalogCategoryFilter) return false;
      if (catalogSearch.trim() !== '') {
        const q = catalogSearch.toLowerCase().trim();
        return it.nameBn.toLowerCase().includes(q) || it.nameEn.toLowerCase().includes(q);
      }
      return true;
    });
  }, [saleItems, catalogCategoryFilter, catalogSearch]);

  const filteredStudentsForPos = useMemo(() => {
    const q = studentSearchQuery.toLowerCase().trim();
    if (!q) return students.slice(0, 20);
    return students
      .filter(
        (s) =>
          s.nameBn.toLowerCase().includes(q) ||
          s.nameEn.toLowerCase().includes(q) ||
          (s.studentId || '').toLowerCase().includes(q) ||
          String(s.roll || '').includes(q)
      )
      .slice(0, 20);
  }, [students, studentSearchQuery]);

  // POS Cart Totals
  const cartSubtotal = useMemo(
    () => cartItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0),
    [cartItems]
  );
  const netReceivable = Math.max(0, cartSubtotal - (Number(discountAmount) || 0));

  // Handlers
  const handleLoadStarterCatalog = () => {
    const existing = StorageService.getSaleItems();
    const existingKeys = new Set(
      existing.map((e) => `${e.nameBn.trim().toLowerCase()}|${e.nameEn.trim().toLowerCase()}`)
    );
    const toAdd: SaleItem[] = [];
    STARTER_CATALOG_PRESETS.forEach((preset, idx) => {
      const key = `${preset.nameBn.trim().toLowerCase()}|${preset.nameEn.trim().toLowerCase()}`;
      if (!existingKeys.has(key)) {
        toAdd.push({
          ...preset,
          id: `sale_${Date.now()}_${idx}`,
          createdAt: new Date().toISOString(),
        });
      }
    });
    if (toAdd.length === 0) {
      showBanner(
        language === 'bn'
          ? 'সকল জনপ্রিয় বই, খাতা, কলম ও ক্যান্টিন আইটেম ইতোমধ্যেই ক্যাটালগে যুক্ত আছে।'
          : 'All popular school store & canteen items are already in the catalog.',
        'info'
      );
      return;
    }
    const next = [...existing, ...toAdd];
    StorageService.saveSaleItems(next);
    setSaleItems(next);
    showBanner(
      language === 'bn'
        ? `✓ ${toBnNumber(toAdd.length)}টি জনপ্রিয় বই, খাতা-কলম ও ক্যান্টিন আইটেম ক্যাটালগে যুক্ত হয়েছে!`
        : `✓ Added ${toAdd.length} popular school & canteen items to the catalog!`,
      'success'
    );
  };

  const resetPosForm = () => {
    setEditingVoucher(null);
    setCartItems([]);
    setDiscountAmount(0);
    setBuyerMode('walkin');
    setSelectedStudentId('');
    setStudentSearchQuery('');
    setReceivedFromInput('');
    setBuyerPhoneInput('');
    setVoucherDateInput(todayIso);
    setPaymentMethodInput('Cash');
    setTransactionIdInput('');
    setVoucherTitleInput('');
    setVoucherNotesInput('');
    setPosFormError('');
    setCustomItemName('');
    setCustomItemQty(1);
    setCustomItemPrice(0);
    setPosItemSearch('');
  };

  const handleOpenCreateVoucher = () => {
    resetPosForm();
    setShowVoucherModal(true);
  };

  const handleOpenEditVoucher = (v: IncomeVoucher) => {
    if (!canEditDeleteInvoices) return;
    setEditingVoucher(v);
    setCartItems((v.items || []).map((it) => ({ ...it })));
    setDiscountAmount(v.discount || 0);
    setBuyerMode(v.studentId ? 'student' : 'walkin');
    setSelectedStudentId(v.studentId || '');
    setReceivedFromInput(v.receivedFrom || '');
    setBuyerPhoneInput(v.buyerPhone || '');
    setVoucherDateInput(v.date || todayIso);
    setPaymentMethodInput(v.paymentMethod || 'Cash');
    setTransactionIdInput(v.transactionId || '');
    setVoucherTitleInput(v.title || '');
    setVoucherNotesInput(v.notes || '');
    setPosFormError('');
    setShowVoucherModal(true);
  };

  const handleAddQuickPickToCart = (item: {
    id?: string;
    nameBn: string;
    nameEn: string;
    category: SaleItemCategory;
    unitPrice: number;
    fromCatalog: boolean;
  }) => {
    const displayName = language === 'bn' ? item.nameBn : item.nameEn || item.nameBn;
    const realCatalogId = item.fromCatalog ? item.id : undefined;

    setCartItems((prev) => {
      const existingIdx = prev.findIndex((c) =>
        realCatalogId ? c.saleItemId === realCatalogId : c.name === displayName && c.category === item.category
      );
      if (existingIdx >= 0) {
        return prev.map((c, idx) =>
          idx === existingIdx
            ? {
                ...c,
                quantity: c.quantity + 1,
                total: (c.quantity + 1) * c.unitPrice,
              }
            : c
        );
      }
      return [
        ...prev,
        {
          id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          saleItemId: realCatalogId,
          name: displayName,
          category: item.category,
          quantity: 1,
          unitPrice: item.unitPrice,
          total: item.unitPrice,
        },
      ];
    });
    setPosFormError('');
  };

  const handleAddCustomCartRow = () => {
    if (!customItemName.trim()) {
      setPosFormError(language === 'bn' ? 'কাস্টম আইটেমের নাম লিখুন।' : 'Please enter custom item name.');
      return;
    }
    const qty = Math.max(1, Number(customItemQty) || 1);
    const price = Math.max(0, Number(customItemPrice) || 0);
    if (price <= 0) {
      setPosFormError(language === 'bn' ? 'আইটেমের একক মূল্য ০ এর বেশি দিন।' : 'Unit price must be greater than 0.');
      return;
    }
    setCartItems((prev) => [
      ...prev,
      {
        id: `line_custom_${Date.now()}`,
        name: customItemName.trim(),
        category: customItemCategory,
        quantity: qty,
        unitPrice: price,
        total: qty * price,
      },
    ]);
    setCustomItemName('');
    setCustomItemQty(1);
    setCustomItemPrice(0);
    setPosFormError('');
  };

  const handleUpdateCartRow = (lineId: string, patch: { quantity?: number; unitPrice?: number }) => {
    setCartItems((prev) =>
      prev.map((row) => {
        if (row.id !== lineId) return row;
        const nextQty = patch.quantity !== undefined ? Math.max(1, patch.quantity) : row.quantity;
        const nextPrice = patch.unitPrice !== undefined ? Math.max(0, patch.unitPrice) : row.unitPrice;
        return {
          ...row,
          quantity: nextQty,
          unitPrice: nextPrice,
          total: nextQty * nextPrice,
        };
      })
    );
  };

  const handleRemoveCartRow = (lineId: string) => {
    setCartItems((prev) => prev.filter((row) => row.id !== lineId));
  };

  const handleSelectStudentForPos = (st: Student) => {
    setSelectedStudentId(st.id);
    setReceivedFromInput(`${st.nameBn || st.nameEn} (${st.className}, রোল ${st.roll})`);
    if (st.guardianPhone) {
      setBuyerPhoneInput(st.guardianPhone);
    }
  };

  const handleSaveIncomeVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) {
      setPosFormError(
        language === 'bn'
          ? 'অন্তত একটি বিক্রয় বা আয়ের আইটেম যুক্ত করুন।'
          : 'Please add at least one item to the income voucher.'
      );
      return;
    }
    if (netReceivable <= 0) {
      setPosFormError(
        language === 'bn' ? 'মোট গ্রহণযোগ্য টাকার পরিমাণ ০ এর বেশি হতে হবে।' : 'Total amount must be greater than 0.'
      );
      return;
    }

    const categoriesSet = new Set(cartItems.map((i) => i.category));
    const resolvedCategory: SaleItemCategory | 'Mixed' =
      categoriesSet.size === 1 ? Array.from(categoriesSet)[0] : 'Mixed';

    const autoTitle =
      cartItems.length === 1
        ? `${cartItems[0].name} (×${cartItems[0].quantity})`
        : `${cartItems
            .slice(0, 2)
            .map((i) => `${i.name} ×${i.quantity}`)
            .join(', ')}${cartItems.length > 2 ? ` + আরও ${cartItems.length - 2}টি` : ''}`;

    const finalTitle = voucherTitleInput.trim() || autoTitle;
    const finalBuyer =
      receivedFromInput.trim() || (language === 'bn' ? 'নগদ ক্রেতা (Walk-in)' : 'Walk-in Buyer');
    const itemsSnapshot = [...cartItems];
    const subtotalSnapshot = cartSubtotal;
    const discountSnapshot = Number(discountAmount) || 0;
    const netSnapshot = netReceivable;
    const dateSnapshot = voucherDateInput || todayIso;
    const phoneSnapshot = buyerPhoneInput.trim() || undefined;
    const studentIdSnapshot = buyerMode === 'student' && selectedStudentId ? selectedStudentId : undefined;
    const methodSnapshot = paymentMethodInput;
    const trxSnapshot = transactionIdInput.trim() || undefined;
    const notesSnapshot = voucherNotesInput.trim() || undefined;

    if (editingVoucher) {
      if (!canEditDeleteInvoices) return;
      const targetVoucher = editingVoucher;
      authorizeTransaction(
        {
          titleBn: `আয় ভাউচার সংশোধন (${targetVoucher.voucherNo})`,
          titleEn: `Update Income Voucher (${targetVoucher.voucherNo})`,
          summaryBn: `${finalTitle} • প্রদানকারী: ${finalBuyer}`,
          summaryEn: `${finalTitle} • Received From: ${finalBuyer}`,
          amountLabel: formatTaka(netSnapshot),
          tone: 'amber',
        },
        (authStamp) => {
          const updatedVoucher: IncomeVoucher = {
            ...targetVoucher,
            category: resolvedCategory,
            title: finalTitle,
            items: itemsSnapshot,
            subtotal: subtotalSnapshot,
            discount: discountSnapshot,
            amount: netSnapshot,
            date: dateSnapshot,
            receivedFrom: finalBuyer,
            buyerPhone: phoneSnapshot,
            studentId: studentIdSnapshot,
            paymentMethod: methodSnapshot,
            transactionId: trxSnapshot,
            notes: notesSnapshot,
            updatedAt: new Date().toISOString(),
            ...authStamp,
          };
          StorageService.updateIncomeVoucher(updatedVoucher, activeRole);
          onRefreshAll();
          setSaleItems(StorageService.getSaleItems());
          setShowVoucherModal(false);
          resetPosForm();
          showBanner(
            language === 'bn'
              ? `✓ আয় ভাউচার ${updatedVoucher.voucherNo} সফলভাবে সংশোধন করা হয়েছে।`
              : `✓ Income voucher ${updatedVoucher.voucherNo} updated.`,
            'success'
          );
        }
      );
      return;
    }

    authorizeTransaction(
      {
        titleBn: 'নতুন আয় ভাউচার / ইনভয়েস অনুমোদন',
        titleEn: 'Authorize New Income Voucher / Memo',
        summaryBn: `${finalTitle} • প্রদানকারী: ${finalBuyer} (${methodSnapshot})`,
        summaryEn: `${finalTitle} • From: ${finalBuyer} (${methodSnapshot})`,
        amountLabel: formatTaka(netSnapshot),
        tone: 'blue',
      },
      (authStamp) => {
        const voucherNo = StorageService.generateNextIncomeVoucherNo(dateSnapshot);
        const newVoucher: IncomeVoucher = {
          id: `inc_${Date.now()}`,
          voucherNo,
          category: resolvedCategory,
          title: finalTitle,
          items: itemsSnapshot,
          subtotal: subtotalSnapshot,
          discount: discountSnapshot,
          amount: netSnapshot,
          date: dateSnapshot,
          receivedFrom: finalBuyer,
          buyerPhone: phoneSnapshot,
          studentId: studentIdSnapshot,
          paymentMethod: methodSnapshot,
          transactionId: trxSnapshot,
          receivedBy: currentUserName,
          receivedById: currentUserId,
          receivedByEmail: currentUserEmail,
          receivedByRole: activeRole || undefined,
          notes: notesSnapshot,
          createdAt: new Date().toISOString(),
          ...authStamp,
        };

        StorageService.addIncomeVoucher(newVoucher);
        onRefreshAll();
        setSaleItems(StorageService.getSaleItems());
        setShowVoucherModal(false);
        resetPosForm();
        setPrintingVoucher(newVoucher);
        showBanner(
          language === 'bn'
            ? `✓ আয় ভাউচার ${voucherNo} (${formatTaka(netSnapshot)}) সফলভাবে তৈরি হয়েছে!`
            : `✓ Income voucher ${voucherNo} (${formatTaka(netSnapshot)}) created!`,
          'success'
        );
      }
    );
  };

  const handleConfirmDeleteVoucher = () => {
    if (!confirmDeleteVoucher || !canEditDeleteInvoices) return;
    const targetVoucher = confirmDeleteVoucher;
    authorizeTransaction(
      {
        titleBn: `আয় ভাউচার মুছে ফেলা (${targetVoucher.voucherNo})`,
        titleEn: `Delete Income Voucher (${targetVoucher.voucherNo})`,
        summaryBn: `${targetVoucher.title} • প্রদানকারী: ${targetVoucher.receivedFrom}`,
        summaryEn: `${targetVoucher.title} • From: ${targetVoucher.receivedFrom}`,
        amountLabel: formatTaka(targetVoucher.amount),
        tone: 'rose',
      },
      () => {
        StorageService.deleteIncomeVoucher(targetVoucher.id, activeRole);
        onRefreshAll();
        setSaleItems(StorageService.getSaleItems());
        showBanner(
          language === 'bn'
            ? `আয় ভাউচার ${targetVoucher.voucherNo} মুছে ফেলা হয়েছে ও স্টক সমন্বয় করা হয়েছে।`
            : `Income voucher ${targetVoucher.voucherNo} deleted.`,
          'info'
        );
        setConfirmDeleteVoucher(null);
      }
    );
  };

  // Catalog CRUD handlers
  const handleOpenCatalogModal = (item?: SaleItem) => {
    if (item) {
      setEditingSaleItem(item);
      setItemNameBn(item.nameBn);
      setItemNameEn(item.nameEn);
      setItemCategory(item.category);
      setItemUnitPrice(item.unitPrice);
      setItemUnit(item.unit || 'টি');
      setItemStockQty(item.stockQty || 0);
      setItemTrackStock(item.trackStock);
    } else {
      setEditingSaleItem(null);
      setItemNameBn('');
      setItemNameEn('');
      setItemCategory('Books');
      setItemUnitPrice(0);
      setItemUnit('টি');
      setItemStockQty(50);
      setItemTrackStock(true);
    }
    setShowCatalogModal(true);
  };

  const handleEditQuickPickItem = (poolItem: {
    id?: string;
    nameBn: string;
    nameEn: string;
    category: SaleItemCategory;
    unitPrice: number;
    unit?: string;
    stockQty?: number;
    trackStock?: boolean;
    fromCatalog: boolean;
  }) => {
    if (poolItem.fromCatalog && poolItem.id) {
      const existing = saleItems.find((it) => it.id === poolItem.id);
      if (existing) {
        handleOpenCatalogModal(existing);
        return;
      }
    }
    // If catalog hasn't been saved yet, seed starter items first so user can immediately edit price/stock
    const existing = StorageService.getSaleItems();
    const baseCatalog: SaleItem[] =
      existing.length > 0
        ? existing
        : STARTER_CATALOG_PRESETS.map((preset, idx) => ({
            ...preset,
            id: `sale_${Date.now()}_${idx}`,
            createdAt: new Date().toISOString(),
          }));
    if (existing.length === 0) {
      StorageService.saveSaleItems(baseCatalog);
      setSaleItems(baseCatalog);
    }
    const matched = baseCatalog.find(
      (it) => it.nameBn === poolItem.nameBn && it.category === poolItem.category
    );
    handleOpenCatalogModal(matched);
  };

  const handleSaveCatalogItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemNameBn.trim() && !itemNameEn.trim()) return;
    if (editingSaleItem) {
      StorageService.updateSaleItem({
        ...editingSaleItem,
        nameBn: itemNameBn.trim() || itemNameEn.trim(),
        nameEn: itemNameEn.trim() || itemNameBn.trim(),
        category: itemCategory,
        unitPrice: Number(itemUnitPrice) || 0,
        unit: itemUnit.trim() || 'টি',
        stockQty: Number(itemStockQty) || 0,
        trackStock: itemTrackStock,
      });
    } else {
      StorageService.addSaleItem({
        id: `sale_${Date.now()}`,
        nameBn: itemNameBn.trim() || itemNameEn.trim(),
        nameEn: itemNameEn.trim() || itemNameBn.trim(),
        category: itemCategory,
        unitPrice: Number(itemUnitPrice) || 0,
        unit: itemUnit.trim() || 'টি',
        stockQty: Number(itemStockQty) || 0,
        trackStock: itemTrackStock,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }
    setSaleItems(StorageService.getSaleItems());
    setShowCatalogModal(false);
    setEditingSaleItem(null);
    showBanner(
      language === 'bn' ? '✓ বিক্রয় আইটেম ক্যাটালগে সংরক্ষিত হয়েছে।' : '✓ Catalog item saved.',
      'success'
    );
  };

  const handleConfirmDeleteCatalogItem = () => {
    if (!confirmDeleteCatalogItem) return;
    StorageService.deleteSaleItem(confirmDeleteCatalogItem.id);
    setSaleItems(StorageService.getSaleItems());
    setConfirmDeleteCatalogItem(null);
  };

  const renderCategoryBadge = (cat: SaleItemCategory | 'Mixed') => {
    if (cat === 'Mixed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <Sparkles className="w-2.5 h-2.5" />
          {language === 'bn' ? 'মিশ্র আইটেম' : 'Mixed Items'}
        </span>
      );
    }
    const meta = SALE_CATEGORY_META[cat] || SALE_CATEGORY_META.Other;
    const IconComp = meta.icon;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.badgeClass}`}
      >
        <IconComp className="w-2.5 h-2.5" />
        {language === 'bn' ? meta.labelBn : meta.labelEn}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-mode switcher inside ব্যয় ও ভাউচার */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSubMode('income')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              subMode === 'income'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'আয় ভাউচার ও বিক্রয় (POS)' : 'Income Vouchers & Sales'}</span>
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                subMode === 'income' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {language === 'bn' ? toBnNumber(incomeVouchers.length) : incomeVouchers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubMode('expense')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              subMode === 'expense'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'ব্যয় ভাউচার' : 'Expense Vouchers'}</span>
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                subMode === 'expense' ? 'bg-rose-700 text-white' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {language === 'bn' ? toBnNumber(expenses.length) : expenses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubMode('catalog')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              subMode === 'catalog'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'বই, খাতা ও খাবার ক্যাটালগ' : 'Store & Canteen Catalog'}</span>
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                subMode === 'catalog' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700'
              }`}
            >
              {language === 'bn' ? toBnNumber(saleItems.length) : saleItems.length}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canManage && subMode === 'income' && (
            <button
              type="button"
              onClick={handleOpenCreateVoucher}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'নতুন আয় ভাউচার / বিক্রয়' : 'New Income Voucher'}</span>
            </button>
          )}
          {canManage && subMode === 'expense' && (
            <button
              type="button"
              onClick={onOpenNewExpenseModal}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'নতুন ব্যয় ভাউচার' : 'New Expense Voucher'}</span>
            </button>
          )}
          {canManage && subMode === 'catalog' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadStarterCatalog}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{language === 'bn' ? 'জনপ্রিয় আইটেম লোড' : 'Load Starter Items'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenCatalogModal()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'নতুন আইটেম যোগ' : 'Add Item'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Feedback notice banner */}
      {noticeBanner && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 print:hidden ${
            noticeBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : noticeBanner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {noticeBanner.text}
          </span>
          <button type="button" onClick={() => setNoticeBanner(null)} className="p-0.5 hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Accountant Audit Lock Notice */}
      {canManage && !canEditDeleteInvoices && subMode !== 'catalog' && (
        <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900 font-medium print:hidden">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            {language === 'bn'
              ? 'নিরাপত্তা নীতি: আয় বা ব্যয় ভাউচার তৈরি হওয়ার পর হিসাবরক্ষক সেটি এডিট বা ডিলিট করতে পারবেন না — শুধুমাত্র সুপার অ্যাডমিন সংশোধন বা ডিলিট করতে পারবেন।'
              : 'Audit lock: Created income & expense vouchers cannot be edited or deleted by Accountants — only Super Admin can edit or delete them.'}
          </span>
        </div>
      )}

      {/* SUB-MODE 1: INCOME VOUCHERS & POS SALES */}
      {subMode === 'income' && (
        <div className="space-y-4 print:hidden">
          {/* Income Breakdown KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>{language === 'bn' ? 'মোট আয় ভাউচার' : 'Total Income Vouchers'}</span>
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-1.5 text-lg font-extrabold text-emerald-700 tabular-nums">
                {formatTaka(incomeMetrics.totalAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn'
                  ? `মোট ${toBnNumber(incomeVouchers.length)}টি ভাউচার ইস্যু`
                  : `${incomeVouchers.length} vouchers issued`}
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>{language === 'bn' ? 'আজকের বিক্রয় ও আয়' : "Today's Store Income"}</span>
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-1.5 text-lg font-extrabold text-slate-900 tabular-nums">
                {formatTaka(incomeMetrics.todayAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn'
                  ? `আজ ${toBnNumber(incomeMetrics.todayCount)}টি ক্যাশ মেমো`
                  : `${incomeMetrics.todayCount} cash memos today`}
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>{language === 'bn' ? 'বই, খাতা ও কলম বিক্রয়' : 'Books & Stationery'}</span>
                <BookOpen className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-1.5 text-lg font-extrabold text-indigo-700 tabular-nums">
                {formatTaka(incomeMetrics.booksStationeryAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn' ? 'পাঠ্যবই, গাইড, খাতা, পেন' : 'Books, notebooks & pens'}
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>{language === 'bn' ? 'খাবার ও ক্যান্টিন বিক্রয়' : 'Food & Canteen Sales'}</span>
                <UtensilsCrossed className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-1.5 text-lg font-extrabold text-amber-700 tabular-nums">
                {formatTaka(incomeMetrics.canteenAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn' ? 'সিঙ্গারা, সমুচা, কেক, জুস ইত্যাদি' : 'Snacks, cake, juice & tiffin'}
              </div>
            </div>
          </div>

          {/* Search & Period Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-3">
            <PeriodFilterBar
              period={dateFilter}
              onPeriodChange={setDateFilter}
              customStart={incomeCustomStart}
              customEnd={incomeCustomEnd}
              onCustomStartChange={setIncomeCustomStart}
              onCustomEndChange={setIncomeCustomEnd}
              language={language}
              compact
            />

            <div className="pt-2.5 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['All', 'Books', 'Stationery', 'Canteen', 'Uniform', 'Other'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      categoryFilter === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat === 'All'
                      ? language === 'bn'
                        ? 'সকল খাত'
                        : 'All'
                      : language === 'bn'
                      ? SALE_CATEGORY_META[cat].labelBn
                      : SALE_CATEGORY_META[cat].labelEn}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === 'bn' ? 'ভাউচার নং, ক্রেতা বা আইটেম...' : 'Search voucher, buyer, item...'}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowIncomeSummaryPrint(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'আয় রিপোর্ট প্রিন্ট' : 'Print Report'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Income Vouchers Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-slate-900 text-sm">
                  {language === 'bn'
                    ? 'আয় ভাউচার রেজিস্ট্রি (বই, খাতা-কলম, খাবার ও অন্যান্য বিক্রয়)'
                    : 'Income Vouchers & Store Sales Registry'}
                </span>
                <span className="ml-2 text-[11px] text-slate-500 font-medium">
                  ({getPeriodDisplayLabel(dateFilter, language, incomeCustomStart, incomeCustomEnd)})
                </span>
              </div>
              <span className="text-emerald-700 font-bold tabular-nums">
                {language === 'bn'
                  ? `মোট (${toBnNumber(filteredVouchers.length)}টি):`
                  : `Total (${filteredVouchers.length}):`}{' '}
                {formatTaka(filteredVouchers.reduce((s, v) => s + v.amount, 0))}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">{language === 'bn' ? 'ভাউচার নং' : 'Voucher No'}</th>
                    <th className="py-3 px-4">{language === 'bn' ? 'ক্যাটাগরি' : 'Category'}</th>
                    <th className="py-3 px-4">{language === 'bn' ? 'বিক্রয় আইটেম ও বিবরণ' : 'Sold Items / Details'}</th>
                    <th className="py-3 px-4">{language === 'bn' ? 'ক্রেতা / প্রদানকারী' : 'Received From'}</th>
                    <th className="py-3 px-4">{language === 'bn' ? 'মাধ্যম' : 'Method'}</th>
                    <th className="py-3 px-4">{language === 'bn' ? 'তারিখ' : 'Date'}</th>
                    <th className="py-3 px-4 text-right">{language === 'bn' ? 'পরিমাণ (৳)' : 'Amount'}</th>
                    <th className="py-3 px-4 text-right">{language === 'bn' ? 'অ্যাকশন' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-bold text-emerald-800 font-mono whitespace-nowrap">
                        {v.voucherNo}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{renderCategoryBadge(v.category)}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{v.title}</div>
                        {v.items && v.items.length > 0 && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {v.items.map((it) => `${it.name} (×${it.quantity})`).join(' • ')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium">{v.receivedFrom}</div>
                        {v.buyerPhone && <div className="text-[10px] text-slate-400">{v.buyerPhone}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {v.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{v.date}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-emerald-700 text-sm tabular-nums whitespace-nowrap">
                        {formatTaka(v.amount)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            type="button"
                            onClick={() => setPrintingVoucher(v)}
                            className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            title={language === 'bn' ? 'ক্যাশ মেমো প্রিন্ট' : 'Print Cash Memo'}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {canEditDeleteInvoices ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditVoucher(v)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title={language === 'bn' ? 'ভাউচার এডিট করুন' : 'Edit Voucher'}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteVoucher(v)}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title={language === 'bn' ? 'ভাউচার মুছে ফেলুন' : 'Delete Voucher'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : canManage ? (
                            <span
                              className="inline-flex items-center p-1.5 text-slate-400 bg-slate-100 rounded-lg border border-slate-200 cursor-not-allowed"
                              title={
                                language === 'bn'
                                  ? 'শুধুমাত্র সুপার অ্যাডমিন আয় ভাউচার এডিট বা ডিলিট করতে পারবেন'
                                  : 'Only Super Admin can edit or delete income vouchers'
                              }
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredVouchers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <ShoppingBag className="w-8 h-8 text-slate-300" />
                          <p className="font-semibold text-slate-700">
                            {language === 'bn'
                              ? 'এখনো কোনো আয় ভাউচার বা বিক্রয় রেকর্ড নেই'
                              : 'No income vouchers recorded yet'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {language === 'bn'
                              ? 'বই, খাতা, কলম বা ক্যান্টিনের খাবার বিক্রি করে ক্যাশ মেমো ও আয় ভাউচার তৈরি করতে "+ নতুন আয় ভাউচার / বিক্রয়" বাটনে ক্লিক করুন।'
                              : 'Click "+ New Income Voucher" to sell books, stationery, canteen snacks, or record other institutional income.'}
                          </p>
                          {canManage && (
                            <button
                              type="button"
                              onClick={handleOpenCreateVoucher}
                              className="mt-1 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs"
                            >
                              + {language === 'bn' ? 'প্রথম আয় ভাউচার তৈরি করুন' : 'Create First Income Voucher'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODE 2: EXPENSE VOUCHERS */}
      {subMode === 'expense' && (
        <div className="space-y-4 print:hidden">
          {/* Expense KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>{language === 'bn' ? 'সর্বমোট প্রাতিষ্ঠানিক ব্যয়' : 'Total Expenses'}</span>
                <TrendingDown className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-1.5 text-lg font-extrabold text-rose-700 tabular-nums">
                {formatTaka(totalExpensesAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn'
                  ? `মোট ${toBnNumber(expenses.length)}টি ভাউচার (${toBnNumber(expenseMetrics.totalItemsCount)}টি আইটেম)`
                  : `${expenses.length} vouchers (${expenseMetrics.totalItemsCount} line items)`}
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>{language === 'bn' ? 'আজকের ব্যয়' : "Today's Expense"}</span>
                <Calendar className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-1.5 text-lg font-extrabold text-slate-900 tabular-nums">
                {formatTaka(expenseMetrics.todayAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn'
                  ? `আজ ${toBnNumber(expenseMetrics.todayCount)}টি ব্যয় ভাউচার`
                  : `${expenseMetrics.todayCount} vouchers today`}
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>{language === 'bn' ? 'এই মাসের মোট ব্যয়' : "This Month's Expense"}</span>
                <Receipt className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-1.5 text-lg font-extrabold text-amber-700 tabular-nums">
                {formatTaka(expenseMetrics.monthAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn' ? 'চলতি মাসের অনুমোদিত ব্যয়' : 'Approved expenses this month'}
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 rounded-2xl border border-rose-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-rose-800 font-bold">
                <span>{language === 'bn' ? 'নির্বাচিত সময়ের ব্যয়' : 'Filtered Period Total'}</span>
                <Printer className="w-4 h-4 text-rose-700" />
              </div>
              <div className="mt-1.5 text-lg font-extrabold text-rose-800 tabular-nums">
                {formatTaka(filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0))}
              </div>
              <div className="text-[11px] text-rose-700 mt-0.5">
                {language === 'bn'
                  ? `${toBnNumber(filteredExpenses.length)}টি ভাউচার পাওয়া গেছে`
                  : `${filteredExpenses.length} matching vouchers`}
              </div>
            </div>
          </div>

          {/* Expense Period Filter + Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-3">
            <PeriodFilterBar
              period={expDateFilter}
              onPeriodChange={setExpDateFilter}
              customStart={expCustomStart}
              customEnd={expCustomEnd}
              onCustomStartChange={setExpCustomStart}
              onCustomEndChange={setExpCustomEnd}
              language={language}
              compact
            />

            <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={expCategoryFilter}
                  onChange={(e) => setExpCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50"
                >
                  <option value="All">{language === 'bn' ? 'সকল ব্যয় খাত' : 'All Categories'}</option>
                  {expenseCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <div className="relative min-w-[210px] flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={expSearchQuery}
                    onChange={(e) => setExpSearchQuery(e.target.value)}
                    placeholder={language === 'bn' ? 'ভাউচার নং, প্রাপক বা আইটেম...' : 'Search voucher, vendor, item...'}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExpenseSummaryPrint(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-2xs shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'ব্যয় রিপোর্ট প্রিন্ট' : 'Print Expense Report'}</span>
              </button>
            </div>
          </div>

          {/* Expense Vouchers Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'বিদ্যালয়ের পরিচালনা ও প্রাতিষ্ঠানিক ব্যয়' : 'Institutional Operational Expenses'}
                </span>
                <span className="ml-2 text-[11px] text-slate-500 font-medium">
                  ({getPeriodDisplayLabel(expDateFilter, language, expCustomStart, expCustomEnd)})
                </span>
              </div>
              <span className="text-rose-600 font-bold tabular-nums">
                {language === 'bn'
                  ? `মোট ব্যয় (${toBnNumber(filteredExpenses.length)}টি):`
                  : `Total (${filteredExpenses.length}):`}{' '}
                {formatTaka(filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                    <th className="py-3 px-4">Voucher No</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Description & Items</th>
                    <th className="py-3 px-4">Paid To</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-right">Action / অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((e) => {
                    const lineItems = normalizeExpenseItems(e);
                    return (
                      <tr key={e.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-bold text-rose-800 font-mono whitespace-nowrap">{e.voucherNo}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {e.category}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                            <span>{e.title}</span>
                            {lineItems.length > 1 && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                                {language === 'bn'
                                  ? `${toBnNumber(lineItems.length)}টি আইটেম`
                                  : `${lineItems.length} items`}
                              </span>
                            )}
                          </div>
                          {lineItems.length > 1 && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {lineItems
                                .map((it) => `${it.description} (×${it.quantity}: ${formatTaka(it.amount)})`)
                                .join(' • ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          <div>{e.paidTo}</div>
                          <div className="text-[10px] text-slate-400">{e.paymentMethod}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{e.date}</td>
                        <td className="py-3 px-4 text-right font-bold text-rose-600 text-sm tabular-nums whitespace-nowrap">
                          {formatTaka(e.amount)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1">
                            {onPrintExpense && (
                              <button
                                type="button"
                                onClick={() => onPrintExpense(e)}
                                className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                                title={language === 'bn' ? 'ব্যয় ভাউচার প্রিন্ট' : 'Print Expense Voucher'}
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canEditDeleteInvoices ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onEditExpense(e)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="ভাউচার এডিট করুন"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteExpense(e)}
                                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="ভাউচার মুছে ফেলুন"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : canManage ? (
                              <span
                                className="inline-flex items-center p-1.5 text-slate-400 bg-slate-100 rounded-lg border border-slate-200 cursor-not-allowed"
                                title={
                                  language === 'bn'
                                    ? 'শুধুমাত্র সুপার অ্যাডমিন ব্যয় ভাউচার এডিট বা ডিলিট করতে পারবেন'
                                    : 'Only Super Admin can edit or delete expense vouchers'
                                }
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        {language === 'bn' ? 'কোনো ব্যয় ভাউচার পাওয়া যায়নি।' : 'No expense vouchers found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODE 3: CATALOG & STOCK MANAGEMENT */}
      {subMode === 'catalog' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', 'Books', 'Stationery', 'Canteen', 'Uniform', 'Other'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatalogCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    catalogCategoryFilter === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'All'
                    ? language === 'bn'
                      ? 'সকল আইটেম'
                      : 'All Items'
                    : language === 'bn'
                    ? SALE_CATEGORY_META[cat].labelBn
                    : SALE_CATEGORY_META[cat].labelEn}
                </button>
              ))}
            </div>
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder={language === 'bn' ? 'বই, খাতা বা খাবারের নাম...' : 'Search item name...'}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          {filteredCatalogItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 text-center space-y-3">
              <Boxes className="w-10 h-10 text-blue-300 mx-auto" />
              <h4 className="font-bold text-slate-900 text-sm">
                {language === 'bn'
                  ? 'আপনার প্রতিষ্ঠানের স্টোর ও ক্যান্টিন আইটেম ক্যাটালগ খালি'
                  : 'Your Institute Store & Canteen Catalog is Empty'}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {language === 'bn'
                  ? 'বই, খাতা, কলম, সিঙ্গারা, সমুচা, কেক, বিস্কুট, জুস ও স্কুল টাই এক ক্লিকে লোড করতে পারেন অথবা নিজের মতো নতুন আইটেম যোগ করতে পারেন।'
                  : 'Load popular Bangladeshi school books, notebooks, pens, canteen snacks & uniforms in one click or add custom items.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleLoadStarterCatalog}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{language === 'bn' ? 'জনপ্রিয় বই, খাতা ও খাবার লোড করুন' : 'Load Popular Items'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenCatalogModal()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{language === 'bn' ? 'কাস্টম আইটেম যোগ করুন' : 'Add Custom Item'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredCatalogItems.map((item) => {
                const isLowStock = item.trackStock && item.stockQty <= 10;
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        {renderCategoryBadge(item.category)}
                        {item.trackStock ? (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              isLowStock
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {language === 'bn'
                              ? `স্টক: ${toBnNumber(item.stockQty)} ${item.unit || 'টি'}`
                              : `Stock: ${item.stockQty}`}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">
                            {language === 'bn' ? 'দৈনিক ফ্রেশ' : 'Fresh Daily'}
                          </span>
                        )}
                      </div>
                      <div>
                        <h5 className="font-bold text-slate-900 text-sm leading-snug">{item.nameBn}</h5>
                        {item.nameEn && item.nameEn !== item.nameBn && (
                          <p className="text-[11px] text-slate-500">{item.nameEn}</p>
                        )}
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-base font-extrabold text-blue-700 tabular-nums">
                          {formatTaka(item.unitPrice)}
                        </span>
                        <span className="text-[11px] text-slate-400"> / {item.unit || 'টি'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenCatalogModal(item)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title={language === 'bn' ? 'এডিট' : 'Edit'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCatalogItem(item)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title={language === 'bn' ? 'মুছে ফেলুন' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* POS MODAL: CREATE / EDIT INCOME VOUCHER */}
      {showVoucherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs print:hidden">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <span>
                    {editingVoucher
                      ? language === 'bn'
                        ? `আয় ভাউচার সংশোধন (${editingVoucher.voucherNo})`
                        : `Edit Income Voucher (${editingVoucher.voucherNo})`
                      : language === 'bn'
                      ? 'নতুন আয় ভাউচার ও বিক্রয় (বই, খাতা, কলম ও ক্যান্টিন POS)'
                      : 'New Income Voucher & Store / Canteen POS'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {language === 'bn'
                    ? 'উপর থেকে আইটেমে ক্লিক করে দ্রুত বিল তৈরি করুন অথবা নিচে কাস্টম আইটেম যোগ করুন'
                    : 'Tap items below to add to bill or enter custom item details'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowVoucherModal(false);
                  resetPosForm();
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSaveIncomeVoucher} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
              {posFormError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{posFormError}</span>
                </div>
              )}

              {/* Quick-Tap Product Picker */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['All', 'Books', 'Stationery', 'Canteen', 'Uniform', 'Other'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setPosCategoryTab(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                          posCategoryTab === cat
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {cat === 'All'
                          ? language === 'bn'
                            ? 'সব আইটেম'
                            : 'All'
                          : language === 'bn'
                          ? SALE_CATEGORY_META[cat].labelBn
                          : SALE_CATEGORY_META[cat].labelEn}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={posItemSearch}
                        onChange={(e) => setPosItemSearch(e.target.value)}
                        placeholder={language === 'bn' ? 'আইটেম খুঁজুন...' : 'Search item...'}
                        className="pl-7 pr-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs w-40"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenCatalogModal()}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] whitespace-nowrap flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{language === 'bn' ? 'নতুন আইটেম / স্টক' : 'Add Item / Stock'}</span>
                    </button>
                    {saleItems.length === 0 && (
                      <button
                        type="button"
                        onClick={handleLoadStarterCatalog}
                        className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-bold text-[11px] whitespace-nowrap"
                      >
                        + ক্যাটালগে সেভ
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                  {quickPickPool.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="relative group bg-white hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-400 rounded-xl transition-all shadow-2xs flex flex-col justify-between"
                    >
                      <button
                        type="button"
                        onClick={() => handleAddQuickPickToCart(item)}
                        className="text-left p-2.5 pr-7 w-full h-full flex flex-col justify-between gap-1.5"
                      >
                        <div className="font-bold text-slate-900 text-[11px] leading-snug line-clamp-2">
                          {language === 'bn' ? item.nameBn : item.nameEn || item.nameBn}
                        </div>
                        <div className="flex items-center justify-between gap-1 w-full">
                          <span className="font-extrabold text-emerald-700 tabular-nums">
                            {formatTaka(item.unitPrice)}
                          </span>
                          {item.fromCatalog && item.trackStock && (
                            <span
                              className={`text-[10px] font-semibold ${
                                (item.stockQty || 0) <= 5 ? 'text-rose-600' : 'text-slate-400'
                              }`}
                            >
                              {language === 'bn' ? `স্টক ${toBnNumber(item.stockQty || 0)}` : `Qty ${item.stockQty || 0}`}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditQuickPickItem(item);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title={language === 'bn' ? 'দাম ও স্টক এডিট করুন' : 'Edit Price & Stock'}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cart Items Table + Custom Item Adder */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    {language === 'bn'
                      ? `নির্বাচিত আইটেম তালিকা (${toBnNumber(cartItems.length)}টি)`
                      : `Selected Bill Items (${cartItems.length})`}
                  </span>
                  <span className="font-bold text-emerald-700 tabular-nums">
                    {language === 'bn' ? 'সাবটোটাল:' : 'Subtotal:'} {formatTaka(cartSubtotal)}
                  </span>
                </div>

                {cartItems.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase bg-slate-50/50">
                          <th className="py-2 px-3">{language === 'bn' ? 'আইটেম' : 'Item'}</th>
                          <th className="py-2 px-3">{language === 'bn' ? 'ক্যাটাগরি' : 'Category'}</th>
                          <th className="py-2 px-3 text-center w-36">{language === 'bn' ? 'পরিমাণ' : 'Qty'}</th>
                          <th className="py-2 px-3 text-right w-28">{language === 'bn' ? 'দর (৳)' : 'Price'}</th>
                          <th className="py-2 px-3 text-right w-24">{language === 'bn' ? 'মোট' : 'Total'}</th>
                          <th className="py-2 px-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cartItems.map((row) => (
                          <tr key={row.id}>
                            <td className="py-2 px-3 font-semibold text-slate-900">{row.name}</td>
                            <td className="py-2 px-3">{renderCategoryBadge(row.category)}</td>
                            <td className="py-2 px-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCartRow(row.id, { quantity: row.quantity - 1 })}
                                  className="p-1 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <DigitInput
                                  min={1}
                                  value={row.quantity}
                                  onValueChange={(val) => handleUpdateCartRow(row.id, { quantity: val })}
                                  className="w-12 text-center py-1 border border-slate-200 rounded-md font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCartRow(row.id, { quantity: row.quantity + 1 })}
                                  className="p-1 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <DigitInput
                                min={0}
                                value={row.unitPrice}
                                onValueChange={(val) => handleUpdateCartRow(row.id, { unitPrice: val })}
                                className="w-20 text-right px-2 py-1 border border-slate-200 rounded-md font-bold"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums">
                              {formatTaka(row.total)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveCartRow(row.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-5 text-center text-slate-400">
                    {language === 'bn'
                      ? 'উপরে থেকে বই, খাতা, কলম বা খাবার সিলেক্ট করুন অথবা নিচে কাস্টম আইটেম যোগ করুন।'
                      : 'Select quick-pick items above or add a custom item below.'}
                  </div>
                )}

                {/* Quick Custom Item Row */}
                <div className="p-3 bg-slate-50/70 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      {language === 'bn' ? 'কাস্টম আইটেমের নাম' : 'Custom Item Name'}
                    </label>
                    <input
                      type="text"
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      placeholder={language === 'bn' ? 'যেমন: ডায়েরি / বিশেষ টিফিন' : 'e.g. School Diary / Special Tiffin'}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      {language === 'bn' ? 'ক্যাটাগরি' : 'Category'}
                    </label>
                    <select
                      value={customItemCategory}
                      onChange={(e) => setCustomItemCategory(e.target.value as SaleItemCategory)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="Books">{language === 'bn' ? 'বই ও গাইড' : 'Books'}</option>
                      <option value="Stationery">{language === 'bn' ? 'খাতা ও কলম' : 'Stationery'}</option>
                      <option value="Canteen">{language === 'bn' ? 'খাবার ও ক্যান্টিন' : 'Food & Canteen'}</option>
                      <option value="Uniform">{language === 'bn' ? 'ইউনিফর্ম ও আইডি' : 'Uniform'}</option>
                      <option value="Other">{language === 'bn' ? 'অন্যান্য আয়' : 'Other'}</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      {language === 'bn' ? 'পরিমাণ' : 'Qty'}
                    </label>
                    <DigitInput
                      min={1}
                      value={customItemQty}
                      onValueChange={(val) => setCustomItemQty(val)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      {language === 'bn' ? 'দর (৳)' : 'Unit Price'}
                    </label>
                    <DigitInput
                      min={0}
                      emptyWhenZero
                      value={customItemPrice || ''}
                      onValueChange={(val) => setCustomItemPrice(val)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddCustomCartRow}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center"
                      title={language === 'bn' ? 'যোগ করুন' : 'Add'}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Buyer Info & Totals */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Buyer Column */}
                <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      <span>{language === 'bn' ? 'ক্রেতা / অর্থ প্রদানকারী' : 'Buyer / Payer'}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setBuyerMode('walkin');
                          setSelectedStudentId('');
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          buyerMode === 'walkin' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        {language === 'bn' ? 'নগদ / অভিভাবক' : 'Walk-in'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuyerMode('student')}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          buyerMode === 'student' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        {language === 'bn' ? 'শিক্ষার্থী' : 'Student'}
                      </button>
                    </div>
                  </div>

                  {buyerMode === 'student' && (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        placeholder={language === 'bn' ? 'শিক্ষার্থীর নাম, রোল বা আইডি...' : 'Search student...'}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                      <div className="max-h-24 overflow-y-auto bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {filteredStudentsForPos.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => handleSelectStudentForPos(st)}
                            className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-blue-50 flex items-center justify-between ${
                              selectedStudentId === st.id ? 'bg-blue-50 font-bold text-blue-800' : 'text-slate-700'
                            }`}
                          >
                            <span>{st.nameBn || st.nameEn}</span>
                            <span className="text-[10px] text-slate-400">
                              {st.className} • রোল {st.roll}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'ক্রেতার নাম' : 'Buyer Name'}
                      </label>
                      <input
                        type="text"
                        value={receivedFromInput}
                        onChange={(e) => setReceivedFromInput(e.target.value)}
                        placeholder={language === 'bn' ? 'নগদ ক্রেতা (Walk-in)' : 'Walk-in Buyer'}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'মোবাইল নম্বর (ঐচ্ছিক)' : 'Phone (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={buyerPhoneInput}
                        onChange={(e) => setBuyerPhoneInput(e.target.value)}
                        placeholder="017..."
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-slate-700">
                      {language === 'bn' ? 'ভাউচার শিরোনাম (ফাঁকা রাখলে অটো তৈরি হবে)' : 'Voucher Title (Auto if blank)'}
                    </label>
                    <input
                      type="text"
                      value={voucherTitleInput}
                      onChange={(e) => setVoucherTitleInput(e.target.value)}
                      placeholder={language === 'bn' ? 'যেমন: খাতা, কলম ও টিফিন বিক্রয়' : 'e.g. Books & Canteen Sales'}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* Payment & Totals Column */}
                <div className="p-3.5 bg-emerald-50/40 border border-emerald-200 rounded-2xl space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'তারিখ' : 'Date'}
                      </label>
                      <input
                        type="date"
                        value={voucherDateInput}
                        onChange={(e) => setVoucherDateInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
                      </label>
                      <select
                        value={paymentMethodInput}
                        onChange={(e) => setPaymentMethodInput(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold"
                      >
                        <option value="Cash">Cash (নগদ)</option>
                        <option value="bKash">bKash (বিকাশ)</option>
                        <option value="Nagad">Nagad (নগদ)</option>
                        <option value="Bank">Bank (ব্যাংক)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'ডিসকাউন্ট (৳)' : 'Discount (৳)'}
                      </label>
                      <DigitInput
                        min={0}
                        emptyWhenZero
                        value={discountAmount || ''}
                        onValueChange={(val) => setDiscountAmount(val)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">
                        {language === 'bn' ? 'TrxID / রেফারেন্স (ঐচ্ছিক)' : 'TrxID / Ref (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={transactionIdInput}
                        onChange={(e) => setTransactionIdInput(e.target.value)}
                        placeholder="TRX..."
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-slate-700">
                      {language === 'bn' ? 'নোট (ঐচ্ছিক)' : 'Notes (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={voucherNotesInput}
                      onChange={(e) => setVoucherNotesInput(e.target.value)}
                      placeholder={language === 'bn' ? 'অতিরিক্ত মন্তব্য...' : 'Remarks...'}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="pt-2 border-t border-emerald-200 flex items-center justify-between">
                    <span className="font-bold text-emerald-950 text-xs">
                      {language === 'bn' ? 'সর্বমোট গ্রহণযোগ্য (Net):' : 'Net Receivable:'}
                    </span>
                    <span className="text-xl font-extrabold text-emerald-700 tabular-nums">
                      {formatTaka(netReceivable)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowVoucherModal(false);
                    resetPosForm();
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {editingVoucher
                      ? language === 'bn'
                        ? 'পরিবর্তন সংরক্ষণ করুন'
                        : 'Save Changes'
                      : language === 'bn'
                      ? 'আয় ভাউচার ও ক্যাশ মেমো তৈরি করুন'
                      : 'Issue Income Voucher & Cash Memo'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATALOG ITEM ADD/EDIT MODAL */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs print:hidden">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingSaleItem
                  ? language === 'bn'
                    ? 'বিক্রয় আইটেম এডিট করুন'
                    : 'Edit Catalog Item'
                  : language === 'bn'
                  ? 'নতুন বই, খাতা বা খাবার আইটেম যোগ'
                  : 'Add Store / Canteen Item'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCatalogModal(false);
                  setEditingSaleItem(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCatalogItem} className="mt-4 space-y-3">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'bn' ? 'আইটেমের বাংলা নাম *' : 'Item Name (Bangla) *'}
                </label>
                <input
                  type="text"
                  required
                  value={itemNameBn}
                  onChange={(e) => setItemNameBn(e.target.value)}
                  placeholder="যেমন: গরম সিঙ্গারা / স্কুল খাতা ৮০ পাতা"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  {language === 'bn' ? 'ইংরেজি নাম (ঐচ্ছিক)' : 'Item Name (English)'}
                </label>
                <input
                  type="text"
                  value={itemNameEn}
                  onChange={(e) => setItemNameEn(e.target.value)}
                  placeholder="e.g. Crispy Singara / School Notebook"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'ক্যাটাগরি' : 'Category'}
                  </label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value as SaleItemCategory)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="Books">{language === 'bn' ? 'বই ও গাইড' : 'Books'}</option>
                    <option value="Stationery">{language === 'bn' ? 'খাতা ও কলম' : 'Stationery'}</option>
                    <option value="Canteen">{language === 'bn' ? 'খাবার ও ক্যান্টিন' : 'Food & Canteen'}</option>
                    <option value="Uniform">{language === 'bn' ? 'ইউনিফর্ম ও আইডি' : 'Uniform'}</option>
                    <option value="Other">{language === 'bn' ? 'অন্যান্য আয়' : 'Other'}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'বিক্রয় মূল্য (৳) *' : 'Selling Price (৳) *'}
                  </label>
                  <DigitInput
                    required
                    min={1}
                    emptyWhenZero
                    value={itemUnitPrice || ''}
                    onValueChange={(val) => setItemUnitPrice(val)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'একক (Unit)' : 'Unit'}
                  </label>
                  <input
                    type="text"
                    value={itemUnit}
                    onChange={(e) => setItemUnit(e.target.value)}
                    placeholder="টি / পিস / প্যাক / বক্স"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'bn' ? 'বর্তমান স্টক পরিমাণ' : 'Stock Quantity'}
                  </label>
                  <DigitInput
                    min={0}
                    value={itemStockQty}
                    onValueChange={(val) => setItemStockQty(val)}
                    disabled={!itemTrackStock}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold disabled:bg-slate-100"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={itemTrackStock}
                  onChange={(e) => setItemTrackStock(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span className="font-semibold text-slate-700">
                  {language === 'bn'
                    ? 'বিক্রয়ের সাথে সাথে অটোমেটিক স্টক কমানো হবে (বই/খাতা/প্যাকেট আইটেম)'
                    : 'Automatically deduct stock quantity on sale'}
                </span>
              </label>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCatalogModal(false);
                    setEditingSaleItem(null);
                  }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
                >
                  {language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OFFICIAL PRINTABLE INCOME VOUCHER / CASH MEMO MODAL */}
      {printingVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 print:shadow-none print:border-none print:max-w-none print:p-2">
            {/* Modal controls hidden in print */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 print:hidden">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'bn' ? 'অফিসিয়াল আয় ভাউচার ও ক্যাশ মেমো' : 'Official Income Voucher & Cash Memo'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print Memo'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintingVoucher(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Cash Memo Sheet */}
            <div className="mt-4 p-5 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/30 print:mt-0 print:border-slate-500 print:rounded-none text-xs text-slate-900">
              <div className="flex items-start justify-between border-b border-slate-300 pb-3">
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
                  <span className="inline-block px-2.5 py-0.5 bg-emerald-800 text-white font-extrabold text-[10px] uppercase rounded-md tracking-wider print:bg-black">
                    INCOME VOUCHER / CASH MEMO
                  </span>
                  <div className="text-xs font-bold text-emerald-800 mt-1.5 font-mono">
                    Voucher: {printingVoucher.voucherNo}
                  </div>
                  <div className="text-[10px] text-slate-600">Date: {formatDate(printingVoucher.date)}</div>
                  {printingVoucher.authVerifiedAt && (
                    <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[9px] font-bold text-emerald-700">
                      ✓ PIN Verified
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-3 py-2 px-3 bg-white border border-slate-200 rounded-xl text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[10px]">
                    {language === 'bn' ? 'ক্রেতা / প্রদানকারী:' : 'Received From:'}
                  </span>
                  <strong className="text-slate-900">{printingVoucher.receivedFrom}</strong>
                  {printingVoucher.buyerPhone && (
                    <span className="block text-[10px] text-slate-500">{printingVoucher.buyerPhone}</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">
                    {language === 'bn' ? 'পেমেন্ট মাধ্যম:' : 'Payment Method:'}
                  </span>
                  <strong className="text-emerald-700">
                    {printingVoucher.paymentMethod}
                    {printingVoucher.transactionId ? ` (${printingVoucher.transactionId})` : ''}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">
                    {language === 'bn' ? 'গ্রহণকারী:' : 'Received By:'}
                  </span>
                  <strong className="text-slate-800">{printingVoucher.receivedBy}</strong>
                </div>
              </div>

              <div className="my-2 border border-slate-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                      <th className="py-1.5 px-3 w-8 text-center">SL</th>
                      <th className="py-1.5 px-3">{language === 'bn' ? 'আইটেমের বিবরণ' : 'Item Description'}</th>
                      <th className="py-1.5 px-3">{language === 'bn' ? 'খাত' : 'Category'}</th>
                      <th className="py-1.5 px-3 text-center">{language === 'bn' ? 'পরিমাণ' : 'Qty'}</th>
                      <th className="py-1.5 px-3 text-right">{language === 'bn' ? 'দর' : 'Rate'}</th>
                      <th className="py-1.5 px-3 text-right">{language === 'bn' ? 'মোট (৳)' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printingVoucher.items.map((it, idx) => (
                      <tr key={it.id || idx}>
                        <td className="py-1.5 px-3 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                        <td className="py-1.5 px-3 font-semibold text-slate-900">{it.name}</td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {language === 'bn'
                            ? SALE_CATEGORY_META[it.category]?.labelBn || it.category
                            : SALE_CATEGORY_META[it.category]?.labelEn || it.category}
                        </td>
                        <td className="py-1.5 px-3 text-center font-bold tabular-nums">{it.quantity}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{formatTaka(it.unitPrice)}</td>
                        <td className="py-1.5 px-3 text-right font-bold tabular-nums">{formatTaka(it.total)}</td>
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
                  <strong className="text-slate-900 font-serif">{amountInWords(printingVoucher.amount)}</strong>
                </div>

                <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-lg space-y-1 text-[11px]">
                  {printingVoucher.discount > 0 && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Subtotal / Discount:</span>
                      <span className="tabular-nums">
                        {formatTaka(printingVoucher.subtotal)} - {formatTaka(printingVoucher.discount)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950 text-xs">
                      {language === 'bn' ? 'মোট প্রাপ্ত অর্থ:' : 'Total Received:'}
                    </span>
                    <span className="text-base font-extrabold text-emerald-800 tabular-nums">
                      {formatTaka(printingVoucher.amount)}
                    </span>
                  </div>
                </div>
              </div>

              {printingVoucher.notes && (
                <p className="text-[11px] text-slate-600 mb-3 italic">Note: {printingVoucher.notes}</p>
              )}

              <div className="pt-6 grid grid-cols-2 text-center text-[10px] text-slate-600 items-end">
                <div>
                  <div className="w-40 mx-auto border-t border-slate-400 pt-1 font-semibold">
                    Cashier / Store Officer ({printingVoucher.receivedBy})
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <PrincipalSignatureDisplay school={school} />
                  <div className="w-44 mx-auto border-t border-slate-400 pt-1 font-bold text-slate-800">
                    Head Teacher / Principal
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL FOR INCOME VOUCHER */}
      {confirmDeleteVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs print:hidden">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-5 text-xs space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'আয় ভাউচার মুছে ফেলবেন?' : 'Delete Income Voucher?'}
                </h4>
                <p className="text-slate-600 mt-1">
                  {language === 'bn'
                    ? `ভাউচার "${confirmDeleteVoucher.voucherNo}" (${formatTaka(confirmDeleteVoucher.amount)}) মুছে ফেললে সংশ্লিষ্ট পণ্যের স্টক স্বয়ংক্রিয়ভাবে ফেরত যুক্ত হবে।`
                    : `Deleting "${confirmDeleteVoucher.voucherNo}" (${formatTaka(confirmDeleteVoucher.amount)}) will restore tracked item stock.`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteVoucher(null)}
                className="px-3.5 py-1.5 border border-slate-200 rounded-xl font-semibold text-slate-700"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteVoucher}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
              >
                {language === 'bn' ? 'হ্যাঁ, মুছে ফেলুন' : 'Delete Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL FOR CATALOG ITEM */}
      {confirmDeleteCatalogItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs print:hidden">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-5 text-xs space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'আইটেম ক্যাটালগ থেকে মুছে ফেলবেন?' : 'Remove Catalog Item?'}
                </h4>
                <p className="text-slate-600 mt-1">
                  "{confirmDeleteCatalogItem.nameBn}" ({formatTaka(confirmDeleteCatalogItem.unitPrice)}) ক্যাটালগ থেকে মুছে ফেলা হবে। পূর্বের ভাউচারগুলোর হিসাব অক্ষুণ্ণ থাকবে।
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteCatalogItem(null)}
                className="px-3.5 py-1.5 border border-slate-200 rounded-xl font-semibold text-slate-700"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCatalogItem}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
              >
                {language === 'bn' ? 'মুছে ফেলুন' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERIOD INCOME VOUCHERS SUMMARY PRINT MODAL */}
      {showIncomeSummaryPrint && (
        <IncomeSummaryPrintModal
          vouchers={filteredVouchers}
          periodLabel={getPeriodDisplayLabel(dateFilter, language, incomeCustomStart, incomeCustomEnd)}
          school={school}
          language={language}
          formatTaka={formatTaka}
          toBnNumber={toBnNumber}
          formatDate={formatDate}
          amountInWords={amountInWords}
          onClose={() => setShowIncomeSummaryPrint(false)}
        />
      )}

      {/* PERIOD EXPENSE SUMMARY PRINT MODAL */}
      {showExpenseSummaryPrint && (
        <ExpenseSummaryPrintModal
          expenses={filteredExpenses}
          periodLabel={getPeriodDisplayLabel(expDateFilter, language, expCustomStart, expCustomEnd)}
          school={school}
          language={language}
          formatTaka={formatTaka}
          toBnNumber={toBnNumber}
          formatDate={formatDate}
          amountInWords={amountInWords}
          onClose={() => setShowExpenseSummaryPrint(false)}
        />
      )}

      {authModalElement}
    </div>
  );
};
