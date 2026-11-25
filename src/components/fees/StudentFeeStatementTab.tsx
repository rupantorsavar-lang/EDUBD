import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useSchool } from '../../context/SchoolContext';
import { StorageService } from '../../services/storage';
import { Student, FeePayment, FeeItem } from '../../types';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';
import { getManagedClassNames, getSectionsForClass } from '../../utils/academicClasses';
import {
  buildPrintableStatementHtml,
  buildStatementCsv,
  buildStudentFeeStatementEntries,
  filterAndSortFeeStatements,
  StatementSortOption,
  StatementStatusFilter,
  summarizeFeeStatements,
} from '../../utils/feeStatementHelper';
import {
  Search,
  Printer,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Receipt,
  Calendar,
  CreditCard,
  ArrowRight,
  Users,
  User,
  Download,
  FileSpreadsheet,
  Eye,
  X,
} from 'lucide-react';

interface StudentFeeStatementTabProps {
  onGoToCounter?: (student: Student, dueItems?: FeeItem[]) => void;
  preselectedStudentId?: string;
}

export const StudentFeeStatementTab: React.FC<StudentFeeStatementTabProps> = ({
  onGoToCounter,
  preselectedStudentId,
}) => {
  const { language, formatTaka, toBnNumber, formatDate, amountInWords } = useLanguage();
  const { schoolProfile } = useSchool();
  const students = useMemo(() => StorageService.getStudents(), []);
  const allPayments = useMemo(() => StorageService.getPayments(), []);
  const managedClasses = useMemo(() => StorageService.getClasses(), []);
  const managedClassSequence = useMemo(
    () => getManagedClassNames(managedClasses, { includeInactive: true }),
    [managedClasses]
  );

  // Mode switcher: Single student vs Whole School / Class statement
  const [viewMode, setViewMode] = useState<'single' | 'bulk'>('single');

  // ==================== SINGLE STUDENT STATE ====================
  const [searchQuery, setSearchQuery] = useState<string>(preselectedStudentId || '');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(() => {
    if (preselectedStudentId) {
      const found = students.find(
        (s) => s.studentId === preselectedStudentId || s.id === preselectedStudentId
      );
      if (found) return found;
    }
    return students[0] || null;
  });

  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [selectedReceiptPayment, setSelectedReceiptPayment] = useState<FeePayment | null>(null);

  // ==================== BULK (SCHOOL / CLASS) STATEMENT STATE ====================
  const [bulkClassFilter, setBulkClassFilter] = useState<string>('all');
  const [bulkSectionFilter, setBulkSectionFilter] = useState<string>('all');
  const [bulkStatusFilter, setBulkStatusFilter] = useState<StatementStatusFilter>('all');
  const [bulkSearchQuery, setBulkSearchQuery] = useState<string>('');
  const [bulkSortBy, setBulkSortBy] = useState<StatementSortOption>('roll');
  const [showRegisterPrintModal, setShowRegisterPrintModal] = useState<boolean>(false);
  const [showBulkIndividualPrintModal, setShowBulkIndividualPrintModal] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const isAnyModalOpen =
    showPrintModal ||
    Boolean(selectedReceiptPayment) ||
    showRegisterPrintModal ||
    showBulkIndividualPrintModal;

  // Quick-select matching students in Single mode
  const matchingStudents = useMemo(() => {
    if (!searchQuery.trim()) return students.slice(0, 6);
    const q = searchQuery.toLowerCase().trim();
    return students
      .filter(
        (s) =>
          s.studentId.toLowerCase().includes(q) ||
          s.admissionNo?.toLowerCase().includes(q) ||
          s.nameEn.toLowerCase().includes(q) ||
          s.nameBn.includes(q) ||
          s.roll.toLowerCase().includes(q) ||
          s.guardianPhone?.includes(q) ||
          s.fatherPhone?.includes(q)
      )
      .slice(0, 8);
  }, [students, searchQuery]);

  const handleSelectStudent = (st: Student) => {
    setSelectedStudent(st);
    setSearchQuery(st.studentId);
  };

  // Single-student computations
  const studentPayments = useMemo(() => {
    if (!selectedStudent) return [];
    return allPayments.filter(
      (p) =>
        p.studentId === selectedStudent.id ||
        p.studentId === selectedStudent.studentId ||
        p.studentName.toLowerCase() === selectedStudent.nameEn.toLowerCase()
    );
  }, [selectedStudent, allPayments]);

  const studentDues = useMemo(() => {
    if (!selectedStudent) return [];
    return StorageService.getStudentDueFees(selectedStudent);
  }, [selectedStudent]);

  const totalPaid = useMemo(
    () => studentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [studentPayments]
  );

  const totalDue = useMemo(
    () => studentDues.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [studentDues]
  );

  const totalAssessed = totalPaid + totalDue;

  const transportInfo = useMemo(() => {
    if (!selectedStudent) return null;
    return StorageService.getStudentTransportByStudentId(selectedStudent.id);
  }, [selectedStudent]);

  // ==================== BULK COMPUTATIONS ====================
  const allStatementEntries = useMemo(
    () =>
      buildStudentFeeStatementEntries({
        students,
        payments: allPayments,
        getDueFees: (st) => StorageService.getStudentDueFees(st),
      }),
    [students, allPayments]
  );

  const availableClasses = useMemo(() => {
    const classSet = new Set<string>(managedClassSequence);
    students.forEach((s) => {
      if (s.className) classSet.add(s.className);
    });
    const orderMap = new Map<string, number>();
    managedClassSequence.forEach((c, idx) => orderMap.set(c.toLowerCase(), idx));
    return Array.from(classSet).sort((a, b) => {
      const ra = orderMap.get(a.toLowerCase());
      const rb = orderMap.get(b.toLowerCase());
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return a.localeCompare(b);
    });
  }, [managedClassSequence, students]);

  const availableSections = useMemo(() => {
    if (bulkClassFilter === 'all') {
      const secSet = new Set<string>();
      students.forEach((s) => {
        if (s.section) secSet.add(s.section);
      });
      return Array.from(secSet).sort();
    }
    const configured = getSectionsForClass(bulkClassFilter, managedClasses);
    const secSet = new Set<string>(configured);
    students
      .filter((s) => s.className === bulkClassFilter)
      .forEach((s) => {
        if (s.section) secSet.add(s.section);
      });
    return Array.from(secSet);
  }, [bulkClassFilter, managedClasses, students]);

  const filteredBulkEntries = useMemo(
    () =>
      filterAndSortFeeStatements(allStatementEntries, {
        classFilter: bulkClassFilter,
        sectionFilter: bulkSectionFilter,
        statusFilter: bulkStatusFilter,
        searchQuery: bulkSearchQuery,
        sortBy: bulkSortBy,
        classOrder: managedClassSequence,
      }),
    [
      allStatementEntries,
      bulkClassFilter,
      bulkSectionFilter,
      bulkStatusFilter,
      bulkSearchQuery,
      bulkSortBy,
      managedClassSequence,
    ]
  );

  const bulkSummary = useMemo(
    () => summarizeFeeStatements(filteredBulkEntries, managedClassSequence),
    [filteredBulkEntries, managedClassSequence]
  );

  const schoolWideSummary = useMemo(
    () => summarizeFeeStatements(allStatementEntries, managedClassSequence),
    [allStatementEntries, managedClassSequence]
  );

  const bulkScopeTitle = useMemo(() => {
    const clsPart =
      bulkClassFilter === 'all'
        ? language === 'bn'
          ? 'সকল শ্রেণি (পুরো স্কুল)'
          : 'All Classes (Whole School)'
        : bulkClassFilter;
    const secPart =
      bulkSectionFilter === 'all'
        ? ''
        : language === 'bn'
        ? ` - শাখা ${bulkSectionFilter}`
        : ` - Section ${bulkSectionFilter}`;
    return `${clsPart}${secPart}`;
  }, [bulkClassFilter, bulkSectionFilter, language]);

  const showTemporaryNotice = (msg: string) => {
    setExportNotice(msg);
    setTimeout(() => {
      setExportNotice((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  const handleDownloadCsv = () => {
    if (filteredBulkEntries.length === 0) return;
    const csv = buildStatementCsv(filteredBulkEntries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (bulkClassFilter === 'all' ? 'Whole_School' : bulkClassFilter).replace(/\s+/g, '_');
    a.download = `Fee_Statement_${slug}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showTemporaryNotice(
      language === 'bn'
        ? `✓ ${toBnNumber(filteredBulkEntries.length)} জন শিক্ষার্থীর ফি স্টেটমেন্ট CSV/Excel ফাইল ডাউনলোড হয়েছে।`
        : `✓ Exported CSV fee statement for ${filteredBulkEntries.length} students.`
    );
  };

  const handleDownloadPrintableHtml = (mode: 'register' | 'individual-bulk') => {
    if (filteredBulkEntries.length === 0) return;
    const html = buildPrintableStatementHtml({
      mode,
      entries: filteredBulkEntries,
      summary: bulkSummary,
      schoolProfile,
      scopeTitle: bulkScopeTitle,
      logoSrc: schoolProfile.logoUrl || DEFAULT_SCHOOL_LOGO,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (bulkClassFilter === 'all' ? 'Whole_School' : bulkClassFilter).replace(/\s+/g, '_');
    a.download =
      mode === 'register'
        ? `Fee_Register_${slug}_${new Date().toISOString().split('T')[0]}.html`
        : `Fee_Statements_Bulk_${slug}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showTemporaryNotice(
      language === 'bn'
        ? '✓ প্রিন্টেবল HTML/PDF ফাইল ডাউনলোড হয়েছে — ওপেন করে সরাসরি Print বা Save as PDF করতে পারবেন।'
        : '✓ Printable statement HTML downloaded! Open it to Print or Save as PDF.'
    );
  };

  const handleOpenSingleFromBulk = (st: Student) => {
    setSelectedStudent(st);
    setSearchQuery(st.studentId);
    setViewMode('single');
  };

  return (
    <div className="space-y-5">
      {/* Main Screen Dashboard Content (Hidden when any Print Modal is active) */}
      <div className={`space-y-5 ${isAnyModalOpen ? 'print:hidden' : ''}`}>
        {/* Top Mode Switcher Bar */}
        <div className="p-3 sm:p-4 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              {language === 'bn' ? 'শিক্ষার্থীর ফি ও বকেয়া বিবরণী (Fee Statement)' : 'Student Fee Statement & Ledger'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === 'bn'
                ? 'একক শিক্ষার্থীর বিস্তারিত লেজার অথবা পুরো স্কুল ও শ্রেণিভিত্তিক সম্মিলিত বিবরণী দেখুন ও প্রিন্ট করুন'
                : 'Inspect individual ledgers or consolidated class-wide and school-wide statements'}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Fee statement view mode"
            className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 self-start sm:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'single'}
              onClick={() => setViewMode('single')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                viewMode === 'single'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>{language === 'bn' ? 'একজন শিক্ষার্থী' : 'Single Student'}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'bulk'}
              onClick={() => setViewMode('bulk')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                viewMode === 'bulk'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {language === 'bn' ? 'সকল / শ্রেণিভিত্তিক বিবরণী' : 'All / Class Statement'}
              </span>
            </button>
          </div>
        </div>

        {/* ==================== MODE 1: SINGLE STUDENT (ALL EXISTING FEATURES PRESERVED) ==================== */}
        {viewMode === 'single' ? (
          <div className="space-y-6">
            {/* Search Bar & Quick Student Picker */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-800 tracking-wide mb-1.5 flex items-center">
                    <Search className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                    {language === 'bn'
                      ? 'শিক্ষার্থী আইডি (Student ID), নাম বা রোল নম্বর দিন'
                      : 'Enter Student ID Number, Roll, or Name'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        language === 'bn'
                          ? 'যেমন: S-2026-0001, নাম বা রোল নম্বর টাইপ করুন...'
                          : 'e.g. S-2026-0001 or type student name / roll...'
                      }
                      className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold p-0.5 cursor-pointer"
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Print & Collect Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-1 md:pt-6">
                  <button
                    type="button"
                    onClick={() => setShowPrintModal(true)}
                    disabled={!selectedStudent}
                    className="flex items-center space-x-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-300" />
                    <span>{language === 'bn' ? 'স্টেটমেন্ট প্রিন্ট' : 'Print Statement'}</span>
                  </button>
                  {onGoToCounter && selectedStudent && (
                    <button
                      type="button"
                      onClick={() => onGoToCounter(selectedStudent, studentDues)}
                      className="flex items-center space-x-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>{language === 'bn' ? 'ফি কাউন্টারে জমা নিন' : 'Collect Fee at Desk'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick select chips */}
              <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-500">
                  {language === 'bn' ? 'দ্রুত নির্বাচন করুন:' : 'Quick Select Students:'}
                </span>
                {matchingStudents.map((st) => (
                  <button
                    type="button"
                    key={st.id}
                    onClick={() => handleSelectStudent(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all flex items-center space-x-1 cursor-pointer ${
                      selectedStudent?.id === st.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span className="font-mono text-[10px] opacity-80">{st.studentId}</span>
                    <span>•</span>
                    <span>{language === 'bn' ? st.nameBn : st.nameEn}</span>
                    <span className="text-[10px] opacity-75">({st.className})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Student Banner & Key Metrics */}
            {selectedStudent ? (
              <div className="space-y-6">
                {/* Student Info Card */}
                <div className="p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl shadow-md border border-blue-800/40 relative overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center font-bold text-2xl text-blue-200 shrink-0">
                        {selectedStudent.nameEn.charAt(0)}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black tracking-tight text-white">
                            {language === 'bn' ? selectedStudent.nameBn : selectedStudent.nameEn}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-500/30 text-blue-200 border border-blue-400/40">
                            ID: {selectedStudent.studentId}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/30">
                            Active
                          </span>
                        </div>
                        <div className="text-xs text-blue-200/90 font-medium mt-1">
                          {language === 'bn' ? selectedStudent.nameEn : selectedStudent.nameBn} • Roll: #{selectedStudent.roll}
                        </div>
                        <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                          <span>
                            <strong>Class:</strong> {selectedStudent.className} ({selectedStudent.section})
                          </span>
                          <span>
                            <strong>Shift:</strong> {selectedStudent.shift}
                          </span>
                          <span>
                            <strong>Session:</strong> 2026
                          </span>
                          <span>
                            <strong>Father:</strong>{' '}
                            {language === 'bn'
                              ? selectedStudent.fatherNameBn || selectedStudent.fatherNameEn
                              : selectedStudent.fatherNameEn}
                          </span>
                          <span>
                            <strong>Phone:</strong> {selectedStudent.guardianPhone || selectedStudent.fatherPhone}
                          </span>
                          {transportInfo && (
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded font-semibold text-[10px]">
                              Bus: {transportInfo.routeName} ({formatTaka(transportInfo.monthlyFare)}/mo)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="text-left md:text-right shrink-0">
                      <div className="text-xs tracking-wider text-slate-300 font-bold mb-1">
                        {language === 'bn' ? 'হালনাগাদ ফি স্ট্যাটাস' : 'Fee Status'}
                      </div>
                      {totalDue === 0 ? (
                        <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-xs">
                          <CheckCircle className="w-4 h-4" />
                          <span>{language === 'bn' ? 'সকল ফি পরিশোধিত (All Clear)' : 'All Fees Cleared'}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 font-bold text-xs">
                          <AlertCircle className="w-4 h-4" />
                          <span>
                            {language === 'bn' ? 'বকেয়া ফি রয়েছে' : 'Pending Fees Due'} (৳ {toBnNumber(totalDue)})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top 3 Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-5 bg-white rounded-2xl border border-emerald-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-emerald-800 tracking-wide flex items-center">
                        <TrendingUp className="w-4 h-4 mr-1 text-emerald-600" />
                        {language === 'bn' ? 'সর্বমোট ফি জমা (Total Paid)' : 'Total Fee Paid'}
                      </div>
                      <div className="text-2xl font-black text-emerald-700 mt-2 tracking-tight tabular-nums font-mono">
                        {formatTaka(totalPaid)}
                      </div>
                      <div className="text-[11px] text-emerald-800 font-medium mt-1">
                        {language === 'bn'
                          ? `${toBnNumber(studentPayments.length)} টি রসিদে জমা প্রদান করা হয়েছে`
                          : `Deposited via ${studentPayments.length} money receipts`}
                      </div>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      ৳
                    </div>
                  </div>

                  <div className="p-5 bg-white rounded-2xl border border-rose-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-rose-800 tracking-wide flex items-center">
                        <TrendingDown className="w-4 h-4 mr-1 text-rose-600" />
                        {language === 'bn' ? 'সর্বমোট বকেয়া ফি (Total Due)' : 'Total Due Fees'}
                      </div>
                      <div className="text-2xl font-black text-rose-700 mt-2 tracking-tight tabular-nums font-mono">
                        {formatTaka(totalDue)}
                      </div>
                      <div className="text-[11px] text-rose-800 font-medium mt-1">
                        {language === 'bn'
                          ? `${toBnNumber(studentDues.length)} টি ফি খাত এখনও অপরিশোধিত`
                          : `${studentDues.length} pending fee heads`}
                      </div>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                      ৳
                    </div>
                  </div>

                  <div className="p-5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-600 tracking-wide flex items-center">
                        <Receipt className="w-4 h-4 mr-1 text-blue-600" />
                        {language === 'bn' ? 'মোট ধার্য ফি (Total Net Payable)' : 'Total Assessed Fee'}
                      </div>
                      <div className="text-2xl font-black text-slate-900 mt-2 tracking-tight tabular-nums font-mono">
                        {formatTaka(totalAssessed)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-1">
                        {language === 'bn' ? 'জমা + বকেয়ার সর্বমোট সমন্বয়' : 'Total Paid + Total Pending Due'}
                      </div>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      ৳
                    </div>
                  </div>
                </div>

                {/* SIDE-BY-SIDE 2-COLUMN LEDGER: LEFT = JOMA, RIGHT = DUE */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* LEFT COLUMN: JOMA */}
                  <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden flex flex-col">
                    <div className="p-4 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                          <TrendingUp className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm tracking-tight">
                            {language === 'bn'
                              ? 'বাম পাশ: ফি জমা বিবরণী (Paid Ledger)'
                              : 'LEFT: Payment History (Joma)'}
                          </h4>
                          <p className="text-[10px] text-emerald-100">
                            {language === 'bn'
                              ? 'তারিখভিত্তিক পরিশোধিত সকল ফি ও মানি রিসিট'
                              : 'Date-wise payment deposits and receipts'}
                          </p>
                        </div>
                      </div>
                      <div className="px-2.5 py-1 rounded-full text-xs font-bold bg-white text-emerald-800">
                        {toBnNumber(studentPayments.length)} {language === 'bn' ? 'টি জমা' : 'Deposits'}
                      </div>
                    </div>

                    <div className="p-4 space-y-3 flex-1 min-h-[300px]">
                      {studentPayments.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 text-xs">
                          <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                          {language === 'bn'
                            ? 'এই শিক্ষার্থীর কোনো পূর্ববর্তী ফি জমার রেকর্ড নেই।'
                            : 'No payment deposit records found for this student.'}
                        </div>
                      ) : (
                        studentPayments.map((payment) => (
                          <div
                            key={payment.id}
                            className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50 transition-colors text-xs flex flex-col justify-between"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">
                                    {payment.receiptNo}
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-medium flex items-center">
                                    <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                                    {formatDate(payment.paidDate)}
                                  </span>
                                </div>
                                <div className="font-bold text-slate-900 mt-2 text-xs">
                                  {payment.items && payment.items.length > 0
                                    ? payment.items.map((it) => it.headName).join(' + ')
                                    : 'Monthly Tuition / Exam / School Fee'}
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                  <span className="flex items-center">
                                    <CreditCard className="w-3 h-3 mr-1 text-slate-400" />
                                    <strong>Method:</strong>&nbsp;{payment.paymentMethod}
                                  </span>
                                  {payment.transactionId && (
                                    <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1 rounded">
                                      TXN: {payment.transactionId}
                                    </span>
                                  )}
                                  <span>
                                    <strong>By:</strong>&nbsp;{payment.collectedBy}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-black text-emerald-700 text-base block font-mono tabular-nums">
                                  {formatTaka(payment.amount)}
                                </span>
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-900">
                                  {language === 'bn' ? 'পরিশোধিত' : 'Paid'}
                                </span>
                              </div>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px]">
                              <span className="text-slate-400 text-[10px]">
                                {payment.notes || 'Official Cash Receipt'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedReceiptPayment(payment)}
                                className="font-semibold text-emerald-800 hover:text-emerald-950 flex items-center space-x-1 cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                <span>{language === 'bn' ? 'রসিদ দেখুন' : 'View Receipt'}</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="p-4 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-emerald-900">
                          {language === 'bn' ? 'সর্বমোট পরিশোধিত জমা (Total Paid)' : 'Grand Total Paid'}
                        </div>
                        <div className="text-[11px] text-emerald-800 mt-0.5">{amountInWords(totalPaid)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-emerald-800 font-mono tabular-nums tracking-tight">
                          {formatTaka(totalPaid)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: DUE */}
                  <div className="bg-white rounded-2xl border border-rose-200 overflow-hidden flex flex-col">
                    <div className="p-4 bg-gradient-to-r from-rose-700 to-red-800 text-white flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center">
                          <TrendingDown className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm tracking-tight">
                            {language === 'bn'
                              ? 'ডান পাশ: বকেয়া ফি বিবরণী (Due Ledger)'
                              : 'RIGHT: Outstanding Dues'}
                          </h4>
                          <p className="text-[10px] text-rose-100">
                            {language === 'bn'
                              ? 'কোন কোন ফি খাতে কত টাকা বকেয়া রয়েছে ও শেষ তারিখ'
                              : 'Unpaid fee heads, due dates and pending amounts'}
                          </p>
                        </div>
                      </div>
                      <div className="px-2.5 py-1 rounded-full text-xs font-bold bg-white text-rose-800">
                        {toBnNumber(studentDues.length)} {language === 'bn' ? 'টি বকেয়া' : 'Dues'}
                      </div>
                    </div>

                    <div className="p-4 space-y-3 flex-1 min-h-[300px]">
                      {studentDues.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 text-xs">
                          <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
                          <div className="font-bold text-emerald-700 text-sm">
                            {language === 'bn' ? 'আলহামদুলিল্লাহ, কোনো বকেয়া নেই!' : 'No Due Fees!'}
                          </div>
                          <p className="text-slate-400 text-[11px] mt-1">
                            {language === 'bn'
                              ? 'এই শিক্ষার্থীর সকল ধার্যকৃত ফি সম্পূর্ণরূপে পরিশোধ করা হয়েছে।'
                              : 'All scheduled and monthly fees for this student have been cleared.'}
                          </p>
                        </div>
                      ) : (
                        studentDues.map((due, idx) => (
                          <div
                            key={due.id || idx}
                            className="p-3.5 rounded-xl border border-rose-100 bg-rose-50/40 hover:bg-rose-50 transition-colors text-xs flex flex-col justify-between"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-bold text-slate-900 text-xs">{due.headName}</span>
                                </div>
                                {due.month && (
                                  <div className="text-[11px] text-slate-600 font-medium mt-1">
                                    <strong>Session / Month:</strong> {due.month}
                                  </div>
                                )}
                                <div className="text-[11px] text-slate-500 flex items-center space-x-2 mt-1.5">
                                  <span className="flex items-center">
                                    <Clock className="w-3 h-3 mr-1 text-slate-400" />
                                    <strong>Due Date:</strong>&nbsp;{formatDate(due.dueDate || '2026-10-31')}
                                  </span>
                                  {due.isOverdue && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200 text-rose-800">
                                      {language === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Overdue'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-black text-rose-700 text-base block font-mono tabular-nums">
                                  {formatTaka(due.amount)}
                                </span>
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-900">
                                  {language === 'bn' ? 'বকেয়া' : 'Due'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="p-4 bg-rose-50 border-t border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-rose-900">
                          {language === 'bn' ? 'সর্বমোট বকেয়া (Grand Total Due)' : 'Grand Total Due'}
                        </div>
                        <div className="text-[11px] text-rose-800 mt-0.5">{amountInWords(totalDue)}</div>
                      </div>
                      <div className="flex items-center space-x-3 justify-between sm:justify-end">
                        <div className="text-xl font-black text-rose-800 font-mono tabular-nums tracking-tight">
                          {formatTaka(totalDue)}
                        </div>
                        {onGoToCounter && totalDue > 0 && (
                          <button
                            type="button"
                            onClick={() => onGoToCounter(selectedStudent, studentDues)}
                            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                          >
                            <span>{language === 'bn' ? 'জমা নিন' : 'Pay Now'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
                <Search className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <h4 className="font-bold text-slate-700 text-sm">
                  {language === 'bn' ? 'শিক্ষার্থী নির্বাচন করুন' : 'Select or Search a Student'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  {language === 'bn'
                    ? 'উপরের সার্চ বক্সে শিক্ষার্থী আইডি লিখে সার্চ করুন বা কুইক বাটন চাপুন।'
                    : 'Enter a student ID or select from quick list above to view complete fee statement.'}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* ==================== MODE 2: WHOLE SCHOOL / CLASS FEE STATEMENT ==================== */
          <div className="space-y-5">
            {exportNotice && (
              <div
                role="status"
                className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between"
              >
                <span>{exportNotice}</span>
                <button
                  type="button"
                  onClick={() => setExportNotice(null)}
                  className="text-emerald-700 hover:text-emerald-950 font-bold ml-3 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Filters & Action Bar */}
            <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Class Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    {language === 'bn' ? 'শ্রেণি নির্বাচন করুন' : 'Select Class'}
                  </label>
                  <select
                    value={bulkClassFilter}
                    onChange={(e) => {
                      setBulkClassFilter(e.target.value);
                      setBulkSectionFilter('all');
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-500 outline-hidden"
                  >
                    <option value="all">
                      {language === 'bn'
                        ? `সকল শ্রেণি — পুরো স্কুল (${toBnNumber(students.length)})`
                        : `All Classes — Whole School (${students.length})`}
                    </option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    {language === 'bn' ? 'শাখা (Section)' : 'Section'}
                  </label>
                  <select
                    value={bulkSectionFilter}
                    onChange={(e) => setBulkSectionFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-500 outline-hidden"
                  >
                    <option value="all">{language === 'bn' ? 'সকল শাখা' : 'All Sections'}</option>
                    {availableSections.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    {language === 'bn' ? 'পেমেন্ট অবস্থা' : 'Payment Status'}
                  </label>
                  <select
                    value={bulkStatusFilter}
                    onChange={(e) => setBulkStatusFilter(e.target.value as StatementStatusFilter)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-500 outline-hidden"
                  >
                    <option value="all">{language === 'bn' ? 'সকল শিক্ষার্থী' : 'All Students'}</option>
                    <option value="with_dues">{language === 'bn' ? 'বকেয়া আছে' : 'With Dues'}</option>
                    <option value="overdue">{language === 'bn' ? 'মেয়াদোত্তীর্ণ বকেয়া' : 'Overdue Only'}</option>
                    <option value="cleared">{language === 'bn' ? 'সম্পূর্ণ পরিশোধিত' : 'All Cleared'}</option>
                  </select>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    {language === 'bn' ? 'ক্রম (Sort By)' : 'Sort Order'}
                  </label>
                  <select
                    value={bulkSortBy}
                    onChange={(e) => setBulkSortBy(e.target.value as StatementSortOption)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-500 outline-hidden"
                  >
                    <option value="roll">{language === 'bn' ? 'শ্রেণি ও রোল অনুযায়ী' : 'Class & Roll'}</option>
                    <option value="due_desc">{language === 'bn' ? 'সর্বোচ্চ বকেয়া প্রথমে' : 'Highest Due First'}</option>
                    <option value="paid_desc">{language === 'bn' ? 'সর্বোচ্চ জমা প্রথমে' : 'Highest Paid First'}</option>
                    <option value="name">{language === 'bn' ? 'নাম অনুযায়ী (A-Z)' : 'Name (A-Z)'}</option>
                  </select>
                </div>

                {/* Search Box */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    {language === 'bn' ? 'তালিকায় খুঁজুন' : 'Quick Search'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={bulkSearchQuery}
                      onChange={(e) => setBulkSearchQuery(e.target.value)}
                      placeholder={language === 'bn' ? 'নাম, রোল, আইডি বা ফোন...' : 'Name, roll, ID, phone...'}
                      className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-500 outline-hidden"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    {bulkSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setBulkSearchQuery('')}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Bulk Actions Strip */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
                <div className="text-xs text-slate-600 font-medium">
                  {language === 'bn' ? 'দেখানো হচ্ছে:' : 'Showing:'}{' '}
                  <strong className="text-slate-900">{bulkScopeTitle}</strong> ·{' '}
                  <span className="font-mono font-bold text-slate-900">
                    {toBnNumber(filteredBulkEntries.length)}
                  </span>{' '}
                  {language === 'bn' ? 'জন শিক্ষার্থী' : 'students'}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    disabled={filteredBulkEntries.length === 0}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{language === 'bn' ? 'Excel / CSV' : 'Export CSV'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRegisterPrintModal(true)}
                    disabled={filteredBulkEntries.length === 0}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-300" />
                    <span>{language === 'bn' ? 'সম্মিলিত তালিকা প্রিন্ট' : 'Print Summary Register'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBulkIndividualPrintModal(true)}
                    disabled={filteredBulkEntries.length === 0}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      {language === 'bn'
                        ? `সবার আলাদা স্টেটমেন্ট একসাথে প্রিন্ট (${toBnNumber(filteredBulkEntries.length)})`
                        : `Print All Individual Statements (${filteredBulkEntries.length})`}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Aggregated 4-Column KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-2xl border border-slate-200">
                <div className="text-xs font-semibold text-slate-500">
                  {language === 'bn' ? 'মোট শিক্ষার্থী' : 'Total Students'}
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1.5 font-mono tabular-nums">
                  {toBnNumber(bulkSummary.studentCount)}
                </div>
                <div className="text-[11px] text-slate-600 mt-1">
                  {language === 'bn'
                    ? `${toBnNumber(bulkSummary.clearedCount)} জন পরিশোধিত · ${toBnNumber(bulkSummary.dueStudentCount)} জন বকেয়া`
                    : `${bulkSummary.clearedCount} cleared · ${bulkSummary.dueStudentCount} due`}
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-200">
                <div className="text-xs font-semibold text-slate-500">
                  {language === 'bn' ? 'মোট ধার্য ফি (Assessed)' : 'Total Assessed Fee'}
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1.5 font-mono tabular-nums">
                  {formatTaka(bulkSummary.totalAssessed)}
                </div>
                <div className="text-[11px] text-slate-600 mt-1">
                  {language === 'bn' ? 'নির্বাচিত পরিসরের মোট ফি' : 'Total billed in scope'}
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-emerald-200">
                <div className="text-xs font-semibold text-emerald-800">
                  {language === 'bn' ? 'সর্বমোট জমা / আদায় (Joma)' : 'Total Collected (Joma)'}
                </div>
                <div className="text-2xl font-black text-emerald-700 mt-1.5 font-mono tabular-nums">
                  {formatTaka(bulkSummary.totalPaid)}
                </div>
                <div className="text-[11px] text-emerald-800 mt-1">
                  {language === 'bn'
                    ? `আদায়ের হার: ${toBnNumber(bulkSummary.collectionRate)}%`
                    : `Collection rate: ${bulkSummary.collectionRate}%`}
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-rose-200">
                <div className="text-xs font-semibold text-rose-800">
                  {language === 'bn' ? 'সর্বমোট বকেয়া (Due)' : 'Total Outstanding Due'}
                </div>
                <div className="text-2xl font-black text-rose-700 mt-1.5 font-mono tabular-nums">
                  {formatTaka(bulkSummary.totalDue)}
                </div>
                <div className="text-[11px] text-rose-800 mt-1">
                  {language === 'bn'
                    ? `${toBnNumber(bulkSummary.overdueStudentCount)} জনের মেয়াদোত্তীর্ণ বকেয়া`
                    : `${bulkSummary.overdueStudentCount} with overdue fees`}
                </div>
              </div>
            </div>

            {/* Class-wise Quick Breakdown (Visible when viewing Whole School) */}
            {bulkClassFilter === 'all' && schoolWideSummary.byClass.length > 1 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    {language === 'bn'
                      ? 'শ্রেণিভিত্তিক সারসংক্ষেপ (যেকোনো শ্রেণিতে ক্লিক করে ফিল্টার করুন)'
                      : 'Class-Wise Breakdown (Click a class to filter)'}
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {toBnNumber(schoolWideSummary.byClass.length)} {language === 'bn' ? 'টি শ্রেণি' : 'Classes'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">{language === 'bn' ? 'শ্রেণি' : 'Class'}</th>
                        <th className="py-2.5 px-3 text-center">{language === 'bn' ? 'শিক্ষার্থী' : 'Students'}</th>
                        <th className="py-2.5 px-3 text-center">{language === 'bn' ? 'পরিশোধিত' : 'Cleared'}</th>
                        <th className="py-2.5 px-3 text-center">{language === 'bn' ? 'বকেয়া আছে' : 'With Dues'}</th>
                        <th className="py-2.5 px-3 text-right">{language === 'bn' ? 'ধার্য ফি' : 'Assessed'}</th>
                        <th className="py-2.5 px-3 text-right">{language === 'bn' ? 'মোট জমা' : 'Paid'}</th>
                        <th className="py-2.5 px-3 text-right">{language === 'bn' ? 'মোট বকেয়া' : 'Due'}</th>
                        <th className="py-2.5 px-4 text-right">{language === 'bn' ? 'আদায় %' : 'Rate'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {schoolWideSummary.byClass.map((cls) => (
                        <tr
                          key={cls.className}
                          onClick={() => {
                            setBulkClassFilter(cls.className);
                            setBulkSectionFilter('all');
                          }}
                          className="hover:bg-blue-50/60 transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-bold text-blue-700">{cls.className}</td>
                          <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                            {toBnNumber(cls.studentCount)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono tabular-nums text-emerald-700 font-semibold">
                            {toBnNumber(cls.clearedCount)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono tabular-nums text-rose-700 font-semibold">
                            {toBnNumber(cls.dueStudentCount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                            {formatTaka(cls.totalAssessed)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-bold">
                            {formatTaka(cls.totalPaid)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700 font-bold">
                            {formatTaka(cls.totalDue)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-700">
                            {toBnNumber(cls.collectionRate)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Main Student-by-Student Consolidated Statement Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  {language === 'bn'
                    ? `শিক্ষার্থীভিত্তিক সম্মিলিত বিবরণী — ${bulkScopeTitle}`
                    : `Consolidated Student Fee Ledger — ${bulkScopeTitle}`}
                </h4>
                <span className="text-[11px] font-mono font-semibold text-slate-500 tabular-nums">
                  {toBnNumber(filteredBulkEntries.length)} {language === 'bn' ? 'টি রেকর্ড' : 'records'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-3 px-3 text-center">{language === 'bn' ? 'রোল' : 'Roll'}</th>
                      <th className="py-3 px-3">{language === 'bn' ? 'আইডি ও শিক্ষার্থী' : 'ID & Student'}</th>
                      <th className="py-3 px-3">{language === 'bn' ? 'শ্রেণি ও শাখা' : 'Class & Sec'}</th>
                      <th className="py-3 px-3">{language === 'bn' ? 'রসিদ / শেষ জমা' : 'Receipts / Last Paid'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'ধার্য ফি' : 'Assessed'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'মোট জমা' : 'Paid (Joma)'}</th>
                      <th className="py-3 px-3 text-right">{language === 'bn' ? 'মোট বকেয়া' : 'Due'}</th>
                      <th className="py-3 px-3 text-center">{language === 'bn' ? 'অবস্থা' : 'Status'}</th>
                      <th className="py-3 px-4 text-right">{language === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBulkEntries.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                          {language === 'bn'
                            ? 'নির্বাচিত ফিল্টারে কোনো শিক্ষার্থী পাওয়া যায়নি।'
                            : 'No students matched the selected filters.'}
                        </td>
                      </tr>
                    ) : (
                      filteredBulkEntries.map((entry) => (
                        <tr key={entry.student.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700 tabular-nums">
                            #{entry.student.roll}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">
                              {language === 'bn' ? entry.student.nameBn : entry.student.nameEn}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {entry.student.studentId}
                              {entry.student.guardianPhone || entry.student.fatherPhone
                                ? ` · ${entry.student.guardianPhone || entry.student.fatherPhone}`
                                : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                            {entry.student.className} ({entry.student.section || '-'})
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                            <span className="font-mono font-semibold text-slate-800">
                              {toBnNumber(entry.payments.length)} {language === 'bn' ? 'টি' : 'rcpt'}
                            </span>
                            {entry.lastPaidDate ? ` · ${formatDate(entry.lastPaidDate)}` : ' · —'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                            {formatTaka(entry.totalAssessed)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                            {formatTaka(entry.totalPaid)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${
                              entry.totalDue > 0 ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {formatTaka(entry.totalDue)}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {entry.status === 'cleared' ? (
                              <span className="text-[11px] font-bold text-emerald-700">
                                {language === 'bn' ? 'পরিশোধিত' : 'Cleared'}
                              </span>
                            ) : entry.status === 'overdue' ? (
                              <span className="text-[11px] font-bold text-rose-700">
                                {language === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Overdue'}
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-amber-700">
                                {language === 'bn' ? 'বকেয়া' : 'Due'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenSingleFromBulk(entry.student)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3 text-blue-600" />
                                <span>{language === 'bn' ? 'বিবরণী' : 'View'}</span>
                              </button>
                              {onGoToCounter && entry.totalDue > 0 && (
                                <button
                                  type="button"
                                  onClick={() => onGoToCounter(entry.student, entry.dues)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  {language === 'bn' ? 'ফি নিন' : 'Collect'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredBulkEntries.length > 0 && (
                    <tfoot className="bg-slate-100 border-t border-slate-200 font-bold text-slate-900">
                      <tr>
                        <td colSpan={4} className="py-3 px-4 text-right">
                          {language === 'bn'
                            ? `সর্বমোট (${toBnNumber(bulkSummary.studentCount)} জন শিক্ষার্থী):`
                            : `GRAND TOTAL (${bulkSummary.studentCount} Students):`}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {formatTaka(bulkSummary.totalAssessed)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-800">
                          {formatTaka(bulkSummary.totalPaid)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-800">
                          {formatTaka(bulkSummary.totalDue)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== MODAL 1: SINGLE STUDENT PRINTABLE STATEMENT ==================== */}
      {showPrintModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:inset-auto print:block print:p-0 print:bg-white print:overflow-visible">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 sm:p-8 text-xs my-8 print:p-0 print:m-0 print:border-none print:shadow-none print:max-w-none print:w-full">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-6 print:hidden">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>
                  {language === 'bn'
                    ? 'শিক্ষার্থীর অফিসিয়াল ফি বিবরণী (Official Statement)'
                    : 'Official Student Fee Statement'}
                </span>
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="border border-slate-300 p-6 rounded-xl bg-white space-y-6 print:border-none print:p-0">
              <div className="text-center border-b pb-4 border-slate-200">
                <div className="flex items-center justify-center space-x-3 mb-2">
                  <img
                    src={schoolProfile.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="School Logo"
                    className="w-14 h-14 object-contain"
                  />
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">
                      {schoolProfile.nameEn}
                    </h2>
                    <h3 className="text-sm font-bold text-blue-800">{schoolProfile.nameBn}</h3>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600">
                  {schoolProfile.addressEn} • Phone: {schoolProfile.phone} • EIIN: {schoolProfile.eiin}
                </p>
                <div className="inline-block mt-2 px-3 py-1 bg-slate-900 text-white rounded font-bold uppercase text-[11px] tracking-wider">
                  STUDENT FEE STATEMENT &amp; LEDGER (ফি জমার ও বকেয়ার বিবরণী)
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
                <div className="space-y-1">
                  <div>
                    <strong>Student Name:</strong> {selectedStudent.nameEn} ({selectedStudent.nameBn})
                  </div>
                  <div>
                    <strong>Student ID:</strong>{' '}
                    <span className="font-mono font-bold text-blue-900">{selectedStudent.studentId}</span>
                  </div>
                  <div>
                    <strong>Class &amp; Section:</strong> {selectedStudent.className} - {selectedStudent.section}
                  </div>
                  <div>
                    <strong>Class Roll:</strong> #{selectedStudent.roll}
                  </div>
                </div>
                <div className="space-y-1">
                  <div>
                    <strong>Father's Name:</strong> {selectedStudent.fatherNameEn}{' '}
                    {selectedStudent.fatherNameBn ? `(${selectedStudent.fatherNameBn})` : ''}
                  </div>
                  <div>
                    <strong>Guardian Contact:</strong> {selectedStudent.guardianPhone || selectedStudent.fatherPhone}
                  </div>
                  <div>
                    <strong>Academic Session:</strong> 2026
                  </div>
                  <div>
                    <strong>Statement Date:</strong> {new Date().toLocaleDateString('en-GB')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="border border-emerald-300 rounded-lg overflow-hidden">
                  <div className="bg-emerald-700 text-white p-2 font-bold flex justify-between items-center text-[11px]">
                    <span>পরিশোধিত ফি (Paid History - Joma)</span>
                    <span className="font-mono tabular-nums">Total: {formatTaka(totalPaid)}</span>
                  </div>
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 font-semibold">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Receipt</th>
                        <th className="p-2">Particulars</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {studentPayments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-400">
                            No payment deposits
                          </td>
                        </tr>
                      ) : (
                        studentPayments.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2 font-mono">{p.paidDate}</td>
                            <td className="p-2 font-mono font-bold text-slate-700">{p.receiptNo}</td>
                            <td className="p-2">
                              {p.items?.map((it) => it.headName).join(', ') || 'School Fee'}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums font-bold text-emerald-800">
                              {formatTaka(p.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-emerald-100/60 font-bold border-t border-emerald-200">
                      <tr>
                        <td colSpan={3} className="p-2 text-emerald-900">
                          Total Paid Amount:
                        </td>
                        <td className="p-2 text-right text-emerald-950 font-mono tabular-nums">
                          {formatTaka(totalPaid)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="border border-rose-300 rounded-lg overflow-hidden">
                  <div className="bg-rose-700 text-white p-2 font-bold flex justify-between items-center text-[11px]">
                    <span>বকেয়া ফি তালিকা (Outstanding Dues)</span>
                    <span className="font-mono tabular-nums">Total: {formatTaka(totalDue)}</span>
                  </div>
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-rose-50 border-b border-rose-200 text-rose-900 font-semibold">
                      <tr>
                        <th className="p-2">Particulars / Head</th>
                        <th className="p-2">Month</th>
                        <th className="p-2">Due Date</th>
                        <th className="p-2 text-right">Due Amt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {studentDues.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-emerald-600 font-bold">
                            All fees cleared (No dues)
                          </td>
                        </tr>
                      ) : (
                        studentDues.map((d, i) => (
                          <tr key={i}>
                            <td className="p-2 font-semibold text-slate-800">{d.headName}</td>
                            <td className="p-2">{d.month || '-'}</td>
                            <td className="p-2 font-mono">{d.dueDate || '2026-10-31'}</td>
                            <td className="p-2 text-right font-mono tabular-nums font-bold text-rose-800">
                              {formatTaka(d.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-rose-100/60 font-bold border-t border-rose-200">
                      <tr>
                        <td colSpan={3} className="p-2 text-rose-900">
                          Total Outstanding Due:
                        </td>
                        <td className="p-2 text-right text-rose-950 font-mono tabular-nums">
                          {formatTaka(totalDue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="p-3 bg-slate-100 rounded-lg flex items-center justify-between text-xs font-bold text-slate-800">
                <div>
                  Net Assessed: <span className="font-mono tabular-nums">{formatTaka(totalAssessed)}</span>
                </div>
                <div>
                  Total Collected (Joma):{' '}
                  <span className="font-mono tabular-nums text-emerald-800">{formatTaka(totalPaid)}</span>
                </div>
                <div>
                  Current Balance Due:{' '}
                  <span className="font-mono tabular-nums text-rose-800">{formatTaka(totalDue)}</span>
                </div>
              </div>

              <div className="pt-12 grid grid-cols-3 gap-6 text-center text-xs">
                <div>
                  <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
                    Student / Guardian Signature
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
                    Accounts Officer
                  </div>
                </div>
                <div>
                  <PrincipalSignatureDisplay school={schoolProfile} fallbackText="" heightClass="h-10" />
                  <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
                    Headmaster / Principal
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: CONSOLIDATED CLASS / SCHOOL REGISTER PRINT ==================== */}
      {showRegisterPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:inset-auto print:block print:p-0 print:bg-white print:overflow-visible">
          <style>{`
            @media print {
              @page { size: A4 landscape; margin: 10mm; }
              body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
            }
          `}</style>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-6xl w-full p-4 sm:p-7 text-xs my-6 max-h-[95vh] overflow-y-auto print:max-h-none print:max-w-none print:w-full print:p-0 print:m-0 print:border-none print:shadow-none print:overflow-visible">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-5 print:hidden">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>
                  {language === 'bn'
                    ? `সম্মিলিত ফি স্টেটমেন্ট রেজিস্টার — ${bulkScopeTitle}`
                    : `Consolidated Fee Statement Register — ${bulkScopeTitle}`}
                </span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPrintableHtml('register')}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{language === 'bn' ? 'PDF / HTML ডাউনলোড' : 'Download HTML/PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegisterPrintModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="border border-slate-300 p-5 rounded-xl bg-white space-y-5 print:border-none print:p-0">
              <div className="text-center border-b pb-3 border-slate-200">
                <div className="flex items-center justify-center space-x-3 mb-1.5">
                  <img
                    src={schoolProfile.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="School Logo"
                    className="w-12 h-12 object-contain"
                  />
                  <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">
                      {schoolProfile.nameEn}
                    </h2>
                    <h3 className="text-xs font-bold text-blue-800">{schoolProfile.nameBn}</h3>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600">
                  {schoolProfile.addressEn} • Phone: {schoolProfile.phone} • EIIN: {schoolProfile.eiin}
                </p>
                <div className="inline-block mt-2 px-3 py-1 bg-slate-900 text-white rounded font-bold uppercase text-[11px] tracking-wider">
                  CONSOLIDATED FEE STATEMENT REGISTER — {bulkScopeTitle} ({new Date().toLocaleDateString('en-GB')})
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 font-semibold">Total Students</div>
                  <div className="font-black text-slate-900 text-sm font-mono tabular-nums">
                    {bulkSummary.studentCount} ({bulkSummary.clearedCount} Clear / {bulkSummary.dueStudentCount} Due)
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 font-semibold">Total Assessed</div>
                  <div className="font-black text-slate-900 text-sm font-mono tabular-nums">
                    {formatTaka(bulkSummary.totalAssessed)}
                  </div>
                </div>
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-[10px] text-emerald-800 font-semibold">Total Paid (Joma)</div>
                  <div className="font-black text-emerald-800 text-sm font-mono tabular-nums">
                    {formatTaka(bulkSummary.totalPaid)} ({bulkSummary.collectionRate}%)
                  </div>
                </div>
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                  <div className="text-[10px] text-rose-800 font-semibold">Total Due</div>
                  <div className="font-black text-rose-800 text-sm font-mono tabular-nums">
                    {formatTaka(bulkSummary.totalDue)}
                  </div>
                </div>
              </div>

              <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                <thead className="bg-slate-100 text-slate-800 font-bold">
                  <tr>
                    <th className="border border-slate-300 p-2 text-center">SL</th>
                    <th className="border border-slate-300 p-2">Student ID</th>
                    <th className="border border-slate-300 p-2 text-center">Roll</th>
                    <th className="border border-slate-300 p-2">Student Name</th>
                    <th className="border border-slate-300 p-2">Class &amp; Sec</th>
                    <th className="border border-slate-300 p-2">Phone</th>
                    <th className="border border-slate-300 p-2 text-center">Receipts</th>
                    <th className="border border-slate-300 p-2 text-right">Assessed</th>
                    <th className="border border-slate-300 p-2 text-right">Paid (Joma)</th>
                    <th className="border border-slate-300 p-2 text-right">Due</th>
                    <th className="border border-slate-300 p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBulkEntries.map((entry, idx) => (
                    <tr key={entry.student.id}>
                      <td className="border border-slate-300 p-1.5 text-center font-mono tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 p-1.5 font-mono font-bold">
                        {entry.student.studentId}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center font-mono font-bold">
                        #{entry.student.roll}
                      </td>
                      <td className="border border-slate-300 p-1.5">
                        <div className="font-bold text-slate-900">{entry.student.nameEn}</div>
                        <div className="text-[10px] text-slate-600">{entry.student.nameBn}</div>
                      </td>
                      <td className="border border-slate-300 p-1.5">
                        {entry.student.className} ({entry.student.section || '-'})
                      </td>
                      <td className="border border-slate-300 p-1.5 font-mono">
                        {entry.student.guardianPhone || entry.student.fatherPhone || '-'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center font-mono tabular-nums">
                        {entry.payments.length}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono tabular-nums">
                        {formatTaka(entry.totalAssessed)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono tabular-nums font-bold text-emerald-800">
                        {formatTaka(entry.totalPaid)}
                      </td>
                      <td
                        className={`border border-slate-300 p-1.5 text-right font-mono tabular-nums font-bold ${
                          entry.totalDue > 0 ? 'text-rose-800' : 'text-emerald-800'
                        }`}
                      >
                        {formatTaka(entry.totalDue)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center font-bold">
                        {entry.status === 'cleared'
                          ? 'Paid'
                          : entry.status === 'overdue'
                          ? 'Overdue'
                          : 'Due'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-black">
                  <tr>
                    <td colSpan={7} className="border border-slate-300 p-2 text-right">
                      GRAND TOTAL ({bulkSummary.studentCount} Students):
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono tabular-nums">
                      {formatTaka(bulkSummary.totalAssessed)}
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono tabular-nums text-emerald-800">
                      {formatTaka(bulkSummary.totalPaid)}
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono tabular-nums text-rose-800">
                      {formatTaka(bulkSummary.totalDue)}
                    </td>
                    <td className="border border-slate-300 p-2" />
                  </tr>
                </tfoot>
              </table>

              <div className="pt-10 grid grid-cols-2 gap-12 text-center text-xs">
                <div>
                  <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
                    Accounts Officer Signature
                  </div>
                </div>
                <div>
                  <PrincipalSignatureDisplay school={schoolProfile} fallbackText="" heightClass="h-10" />
                  <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
                    Headmaster / Principal Signature
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: BULK INDIVIDUAL STATEMENTS (1 STUDENT PER PAGE) ==================== */}
      {showBulkIndividualPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:inset-auto print:block print:p-0 print:bg-white print:overflow-visible">
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
              .statement-page-break { page-break-after: always !important; break-after: page !important; }
              .statement-page-break:last-child { page-break-after: auto !important; break-after: auto !important; }
            }
          `}</style>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-4 sm:p-6 text-xs my-6 max-h-[95vh] overflow-y-auto print:max-h-none print:max-w-none print:w-full print:p-0 print:m-0 print:border-none print:shadow-none print:overflow-visible">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-5 print:hidden">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>
                  {language === 'bn'
                    ? `একসাথে সকল শিক্ষার্থীর অফিসিয়াল স্টেটমেন্ট — ${bulkScopeTitle} (${toBnNumber(filteredBulkEntries.length)} জন)`
                    : `Bulk Individual Student Statements — ${bulkScopeTitle} (${filteredBulkEntries.length} Students)`}
                </span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPrintableHtml('individual-bulk')}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{language === 'bn' ? 'PDF / HTML ডাউনলোড' : 'Download HTML/PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {language === 'bn'
                      ? `সব প্রিন্ট করুন (${toBnNumber(filteredBulkEntries.length)})`
                      : `Print All (${filteredBulkEntries.length})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkIndividualPrintModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-6 print:space-y-0">
              {filteredBulkEntries.map((entry) => {
                const st = entry.student;
                return (
                  <div
                    key={st.id}
                    className="statement-page-break border border-slate-300 p-5 sm:p-6 rounded-xl bg-white space-y-5 print:rounded-none"
                  >
                    <div className="text-center border-b pb-3.5 border-slate-200">
                      <div className="flex items-center justify-center space-x-3 mb-1.5">
                        <img
                          src={schoolProfile.logoUrl || DEFAULT_SCHOOL_LOGO}
                          alt="School Logo"
                          className="w-12 h-12 object-contain"
                        />
                        <div>
                          <h2 className="text-lg font-black text-slate-900 tracking-tight">
                            {schoolProfile.nameEn}
                          </h2>
                          <h3 className="text-xs font-bold text-blue-800">{schoolProfile.nameBn}</h3>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {schoolProfile.addressEn} • Phone: {schoolProfile.phone} • EIIN: {schoolProfile.eiin}
                      </p>
                      <div className="inline-block mt-2 px-3 py-1 bg-slate-900 text-white rounded font-bold uppercase text-[10px] tracking-wider">
                        STUDENT FEE STATEMENT &amp; LEDGER (ফি জমার ও বকেয়ার বিবরণী)
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
                      <div className="space-y-1">
                        <div>
                          <strong>Student Name:</strong> {st.nameEn} ({st.nameBn})
                        </div>
                        <div>
                          <strong>Student ID:</strong>{' '}
                          <span className="font-mono font-bold text-blue-900">{st.studentId}</span>
                        </div>
                        <div>
                          <strong>Class &amp; Section:</strong> {st.className} - {st.section}
                        </div>
                        <div>
                          <strong>Class Roll:</strong> #{st.roll}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div>
                          <strong>Father's Name:</strong> {st.fatherNameEn}{' '}
                          {st.fatherNameBn ? `(${st.fatherNameBn})` : ''}
                        </div>
                        <div>
                          <strong>Guardian Contact:</strong> {st.guardianPhone || st.fatherPhone}
                        </div>
                        <div>
                          <strong>Academic Session:</strong> 2026
                        </div>
                        <div>
                          <strong>Statement Date:</strong> {new Date().toLocaleDateString('en-GB')}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="border border-emerald-300 rounded-lg overflow-hidden">
                        <div className="bg-emerald-700 text-white p-2 font-bold flex justify-between items-center text-[11px]">
                          <span>পরিশোধিত ফি (Paid History - Joma)</span>
                          <span className="font-mono tabular-nums">Total: {formatTaka(entry.totalPaid)}</span>
                        </div>
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 font-semibold">
                            <tr>
                              <th className="p-1.5">Date</th>
                              <th className="p-1.5">Receipt</th>
                              <th className="p-1.5">Particulars</th>
                              <th className="p-1.5 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {entry.payments.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-slate-400">
                                  No payment deposits
                                </td>
                              </tr>
                            ) : (
                              entry.payments.map((p) => (
                                <tr key={p.id}>
                                  <td className="p-1.5 font-mono">{p.paidDate}</td>
                                  <td className="p-1.5 font-mono font-bold text-slate-700">{p.receiptNo}</td>
                                  <td className="p-1.5">
                                    {p.items?.map((it) => it.headName).join(', ') || 'School Fee'}
                                  </td>
                                  <td className="p-1.5 text-right font-mono tabular-nums font-bold text-emerald-800">
                                    {formatTaka(p.amount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot className="bg-emerald-100/60 font-bold border-t border-emerald-200">
                            <tr>
                              <td colSpan={3} className="p-1.5 text-emerald-900">
                                Total Paid Amount:
                              </td>
                              <td className="p-1.5 text-right text-emerald-950 font-mono tabular-nums">
                                {formatTaka(entry.totalPaid)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <div className="border border-rose-300 rounded-lg overflow-hidden">
                        <div className="bg-rose-700 text-white p-2 font-bold flex justify-between items-center text-[11px]">
                          <span>বকেয়া ফি তালিকা (Outstanding Dues)</span>
                          <span className="font-mono tabular-nums">Total: {formatTaka(entry.totalDue)}</span>
                        </div>
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-rose-50 border-b border-rose-200 text-rose-900 font-semibold">
                            <tr>
                              <th className="p-1.5">Particulars / Head</th>
                              <th className="p-1.5">Month</th>
                              <th className="p-1.5">Due Date</th>
                              <th className="p-1.5 text-right">Due Amt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {entry.dues.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-emerald-600 font-bold">
                                  All fees cleared (No dues)
                                </td>
                              </tr>
                            ) : (
                              entry.dues.map((d, i) => (
                                <tr key={i}>
                                  <td className="p-1.5 font-semibold text-slate-800">{d.headName}</td>
                                  <td className="p-1.5">{d.month || '-'}</td>
                                  <td className="p-1.5 font-mono">{d.dueDate || '2026-10-31'}</td>
                                  <td className="p-1.5 text-right font-mono tabular-nums font-bold text-rose-800">
                                    {formatTaka(d.amount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot className="bg-rose-100/60 font-bold border-t border-rose-200">
                            <tr>
                              <td colSpan={3} className="p-1.5 text-rose-900">
                                Total Outstanding Due:
                              </td>
                              <td className="p-1.5 text-right text-rose-950 font-mono tabular-nums">
                                {formatTaka(entry.totalDue)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-100 rounded-lg flex items-center justify-between text-xs font-bold text-slate-800">
                      <div>
                        Net Assessed:{' '}
                        <span className="font-mono tabular-nums">{formatTaka(entry.totalAssessed)}</span>
                      </div>
                      <div>
                        Total Collected (Joma):{' '}
                        <span className="font-mono tabular-nums text-emerald-800">
                          {formatTaka(entry.totalPaid)}
                        </span>
                      </div>
                      <div>
                        Current Balance Due:{' '}
                        <span className="font-mono tabular-nums text-rose-800">{formatTaka(entry.totalDue)}</span>
                      </div>
                    </div>

                    <div className="pt-10 grid grid-cols-3 gap-6 text-center text-xs">
                      <div>
                        <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
                          Student / Guardian Signature
                        </div>
                      </div>
                      <div>
                        <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
                          Accounts Officer
                        </div>
                      </div>
                      <div>
                        <PrincipalSignatureDisplay school={schoolProfile} fallbackText="" heightClass="h-9" />
                        <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
                          Headmaster / Principal
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 4: SINGLE MONEY RECEIPT VIEW ==================== */}
      {selectedReceiptPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:static print:inset-auto print:block print:p-0 print:bg-white">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs print:max-w-none print:border-none print:shadow-none">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>Money Receipt: {selectedReceiptPayment.receiptNo}</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedReceiptPayment(null)}
                className="text-slate-400 hover:text-slate-600 print:hidden cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Receipt No:</span>
                <span className="font-mono font-bold text-slate-800">{selectedReceiptPayment.receiptNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paid Date:</span>
                <span className="font-mono text-slate-800">{formatDate(selectedReceiptPayment.paidDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Student Name:</span>
                <span className="font-bold text-slate-900">{selectedReceiptPayment.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-semibold text-blue-700">{selectedReceiptPayment.paymentMethod}</span>
              </div>
              {selectedReceiptPayment.transactionId && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction ID:</span>
                  <span className="font-mono text-slate-700">{selectedReceiptPayment.transactionId}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200">
                <div className="text-[11px] font-semibold text-slate-600 mb-1">Fee Heads:</div>
                <div className="bg-white p-2 rounded border border-slate-200 space-y-1">
                  {selectedReceiptPayment.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span>{it.headName}</span>
                      <span className="font-mono tabular-nums font-bold text-slate-800">
                        {formatTaka(it.amount)}
                      </span>
                    </div>
                  )) || <div>General Fee Deposit: {formatTaka(selectedReceiptPayment.amount)}</div>}
                </div>
              </div>
              <div className="pt-2 flex justify-between items-center text-sm font-bold text-emerald-800">
                <span>Total Paid:</span>
                <span className="font-mono tabular-nums text-base">
                  {formatTaka(selectedReceiptPayment.amount)}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end space-x-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedReceiptPayment(null)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
