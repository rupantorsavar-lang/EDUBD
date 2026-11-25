import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { StorageService } from '../../services/storage';
import { Student, Staff } from '../../types';
import {
  QrCode,
  Printer,
  Download,
  Search,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  CreditCard,
  User,
  Users,
  Briefcase,
  Building,
  RotateCw,
  Layers,
  PhoneCall,
  MapPin,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { useAuth } from '../../context/AuthContext';
import QRCode from 'qrcode';
import { formatGroupName } from '../../utils/i18n';
import { resolveSchoolCode, formatSchoolScopedId } from '../../utils/schoolIdFormatter';
import { compareStudentsByClassAndRoll } from '../../utils/studentSort';
import {
  ModernTeacherIDCardFront,
  ModernTeacherIDCardBack,
  ModernStudentIDCardFront,
  ModernStudentIDCardBack,
  ID_CARD_THEME_OPTIONS,
  IDCardTheme,
} from '../common/ModernIDCardFronts';

export const StudentIDCardsTab: React.FC = () => {
  const { language, toBnNumber } = useLanguage();
  const { saasSession } = useAuth();
  const { schoolProfile: school } = useSchool();
  const activeSchoolCode = resolveSchoolCode(saasSession?.school?.schoolId, school);
  const [targetAudience, setTargetAudience] = useState<'students' | 'staff'>('students');
  const [students, setStudents] = useState<Student[]>(() => StorageService.getStudents());
  const [staffList, setStaffList] = useState<Staff[]>(() => StorageService.getStaff());

  useEffect(() => {
    const handleSync = () => {
      setStudents(StorageService.getStudents());
      setStaffList(StorageService.getStaff());
    };
    window.addEventListener('school_cloud_data_synced', handleSync);
    return () => window.removeEventListener('school_cloud_data_synced', handleSync);
  }, []);

  // Student Filters
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');

  // Staff Filter
  const [selectedDept, setSelectedDept] = useState<string>('all');

  // Common Search & Card View Mode (Front Side, Back Side, or Both)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cardViewMode, setCardViewMode] = useState<'both' | 'front' | 'back'>('both');
  const [cardTemplate, setCardTemplate] = useState<IDCardTheme>('classic_academic');
  const [qrCodeUrls, setQrCodeUrls] = useState<Record<string, string>>({});
  const [staffQrUrls, setStaffQrUrls] = useState<Record<string, string>>({});

  const ALL_CLASSES = [
    'Nursery',
    'KG',
    'Class 1',
    'Class 2',
    'Class 3',
    'Class 4',
    'Class 5',
    'Class 6',
    'Class 7',
    'Class 8',
    'Class 9',
    'Class 10',
  ];

  const DEPARTMENTS = [
    'Administration',
    'Mathematics & Science',
    'Languages',
    'Science',
    'Accounts & Finance',
    'Library',
    'Front Office',
  ];

  // Refresh lists on mount
  useEffect(() => {
    setStudents(StorageService.getStudents());
    setStaffList(StorageService.getStaff());
  }, []);

  // Filter students (active first/only & sorted ascending by class and roll 1, 2, 3...)
  const filteredStudents = students
    .filter((s) => {
      if (s.status && s.status !== 'active') return false;
      const matchClass = selectedClass === 'all' || s.className === selectedClass;
      const matchSection = selectedSection === 'all' || s.section === selectedSection;
      const scopedId = formatSchoolScopedId(s.studentId || '', activeSchoolCode);
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        String(s.nameEn || '').toLowerCase().includes(q) ||
        String(s.nameBn || '').toLowerCase().includes(q) ||
        String(s.roll || '').toLowerCase().includes(q) ||
        String(s.studentId || '').toLowerCase().includes(q) ||
        scopedId.toLowerCase().includes(q);
      return matchClass && matchSection && matchSearch;
    })
    .sort(compareStudentsByClassAndRoll);

  // Filter staff
  const filteredStaff = staffList.filter((st) => {
    if (st.status === 'resigned') return false;
    const matchDept = selectedDept === 'all' || st.department === selectedDept;
    const q = searchQuery.trim().toLowerCase();
    const scopedEmpId = formatSchoolScopedId(st.employeeId || '', activeSchoolCode);
    const matchSearch =
      !q ||
      String(st.nameEn || '').toLowerCase().includes(q) ||
      String(st.nameBn || '').toLowerCase().includes(q) ||
      String(st.employeeId || '').toLowerCase().includes(q) ||
      scopedEmpId.toLowerCase().includes(q) ||
      String(st.designation || '').toLowerCase().includes(q) ||
      String(st.phone || '').toLowerCase().includes(q);
    return matchDept && matchSearch;
  });

  // Generate QR Code data URLs for students in view (Strictly Pitch Black on White #000000 on #ffffff)
  useEffect(() => {
    if (targetAudience === 'students') {
      filteredStudents.forEach(async (student) => {
        if (!qrCodeUrls[student.id]) {
          try {
            const qrData = StorageService.generateStudentQRData(student);
            const url = await QRCode.toDataURL(qrData, {
              errorCorrectionLevel: 'H',
              margin: 1,
              width: 400,
              color: { dark: '#000000', light: '#ffffff' },
            });
            setQrCodeUrls((prev) => ({ ...prev, [student.id]: url }));
          } catch (e) {
            console.error('Failed generating QR code for student:', student.id, e);
          }
        }
      });
    }
  }, [targetAudience, filteredStudents, qrCodeUrls]);

  // Generate QR Code data URLs for teachers/staff in view (Strictly Pitch Black on White #000000 on #ffffff)
  useEffect(() => {
    if (targetAudience === 'staff') {
      filteredStaff.forEach(async (member) => {
        if (!staffQrUrls[member.id]) {
          try {
            const qrData = StorageService.generateStaffQRData(member);
            const url = await QRCode.toDataURL(qrData, {
              errorCorrectionLevel: 'H',
              margin: 1,
              width: 220,
              color: { dark: '#000000', light: '#ffffff' },
            });
            setStaffQrUrls((prev) => ({ ...prev, [member.id]: url }));
          } catch (e) {
            console.error('Failed generating QR code for staff:', member.id, e);
          }
        }
      });
    }
  }, [targetAudience, filteredStaff, staffQrUrls]);

  const handlePrintAll = () => {
    window.print();
  };

  const handleDownloadStudentQR = (student: Student) => {
    const url = qrCodeUrls[student.id];
    if (!url) return;
    const scopedId = formatSchoolScopedId(student.studentId || '', activeSchoolCode);
    const safeName = (student.nameEn || student.nameBn || 'Student').replace(/\s+/g, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR_Attendance_${scopedId}_${safeName}.png`;
    a.click();
  };

  const handleDownloadStaffQR = (member: Staff) => {
    const url = staffQrUrls[member.id];
    if (!url) return;
    const scopedEmpId = formatSchoolScopedId(member.employeeId || '', activeSchoolCode);
    const safeName = (member.nameEn || member.nameBn || 'Staff').replace(/\s+/g, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR_Attendance_${scopedEmpId}_${safeName}.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Target Audience Switcher: Students vs Teachers/Staff */}
      <div className="p-2 bg-slate-100 rounded-2xl border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setTargetAudience('students')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              targetAudience === 'students'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <User className="w-4 h-4" />
            <span>
              {language === 'bn'
                ? `শিক্ষার্থী আইডি কার্ড (${toBnNumber(students.length)} জন)`
                : `Student ID Cards (${students.length})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTargetAudience('staff')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              targetAudience === 'staff'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>
              {language === 'bn'
                ? `শিক্ষক ও স্টাফ আইডি কার্ড (${toBnNumber(staffList.length)} জন)`
                : `Teacher & Staff ID Cards (${staffList.length})`}
            </span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handlePrintAll}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'সবগুলো প্রিন্ট করুন' : 'Print All Cards'}</span>
          </button>
        </div>
      </div>

      {/* Filter & Card Mode Switcher Bar */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs print:hidden">
        {/* Card View Mode Selector (Front Side, Back Side, or Both) */}
        <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setCardViewMode('both')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-bold transition-all ${
              cardViewMode === 'both'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>উভয় অংশ (Front & Back Side)</span>
          </button>

          <button
            type="button"
            onClick={() => setCardViewMode('front')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-bold transition-all ${
              cardViewMode === 'front'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>সামনের অংশ (Front Side)</span>
          </button>

          <button
            type="button"
            onClick={() => setCardViewMode('back')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-bold transition-all ${
              cardViewMode === 'back'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>পেছনের অংশ (Back Side - White & Black QR)</span>
          </button>
        </div>

        {/* Template Selector (3 Customizable Professional Templates) */}
        <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-700 px-2 flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>কালার থিম:</span>
          </span>
          {ID_CARD_THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setCardTemplate(opt.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                cardTemplate === opt.id
                  ? opt.activeClass
                  : 'text-slate-600 hover:text-slate-900 bg-white/70'
              }`}
            >
              {language === 'bn' ? opt.labelBn : opt.labelEn}
            </button>
          ))}
        </div>

        {/* Dynamic Filters depending on Student vs Staff */}
        <div className="flex flex-wrap items-center gap-3">
          {targetAudience === 'students' ? (
            <>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-slate-700">শ্রেণি:</span>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium text-slate-800"
                >
                  <option value="all">সব শ্রেণি ({students.length} জন)</option>
                  {ALL_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c} ({students.filter((s) => s.className === c).length})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-slate-700">শাখা:</span>
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium text-slate-800"
                >
                  <option value="all">সব শাখা</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>
            </>
          ) : (
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-700">বিভাগ:</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium text-slate-800"
              >
                <option value="all">সব বিভাগ ({staffList.length} জন)</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d} ({staffList.filter((st) => st.department === d).length})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder={
                targetAudience === 'students'
                  ? 'নাম, রোল বা আইডি দিয়ে খুঁজুন...'
                  : 'নাম, পদবি বা এমপ্লয়ি আইডি...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-xs w-56"
            />
          </div>
        </div>
      </div>

      {/* Notice info banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center justify-between print:hidden">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            {targetAudience === 'students' ? (
              <>
                প্রতিটি শিক্ষার্থীর জন্য <strong>সামনের অংশ (Front)</strong> এবং <strong>পেছনের অংশ (Back)</strong> স্বয়ংক্রিয়ভাবে জেনারেট হচ্ছে। পেছনের অংশটি সম্পূর্ণ সাদা ব্যাকগ্রাউন্ডে ঝকঝকে কালো কিউআর ও জরুরি অভিভাবক মোবাইল নম্বরসহ প্রস্তুত।
              </>
            ) : (
              <>
                প্রতিটি শিক্ষক ও কর্মচারীর জন্য <strong>অফিসিয়াল ফ্যাকাল্টি কার্ড (Front)</strong> এবং <strong>সাদা ব্যাকগ্রাউন্ডে কালো কিউআর ও জরুরি মোবাইলযুক্ত ব্যাক পার্ট (Back)</strong> সংযুক্ত রয়েছে।
              </>
            )}
          </span>
        </div>
        <span className="font-bold text-blue-700 shrink-0">
          মোট কার্ড: {toBnNumber(targetAudience === 'students' ? filteredStudents.length : filteredStaff.length)} জন
        </span>
      </div>

      {/* ======================================================== */}
      {/* 1. TEACHERS & STAFF ID CARDS GRID                       */}
      {/* ======================================================== */}
      {targetAudience === 'staff' && (
        <div className="space-y-8">
          {filteredStaff.length === 0 ? (
            <div className="p-12 bg-white rounded-2xl border border-slate-200/80 text-center text-slate-400 text-xs">
              কোনো শিক্ষক বা কর্মচারী পাওয়া যায়নি। সার্চ ফিল্টার পরিবর্তন করুন।
            </div>
          ) : (
            filteredStaff.map((member) => {
              const qrUrl = staffQrUrls[member.id];
              const scopedEmployeeId = formatSchoolScopedId(member.employeeId, activeSchoolCode);

              return (
                <div
                  key={member.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs print:p-0 print:border-none print:shadow-none"
                >
                  {/* Staff Mini Header */}
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 print:hidden">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      <h3 className="font-extrabold text-slate-900 text-sm">
                        {member.nameBn || member.nameEn} ({member.nameEn})
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 font-mono">
                        ID: {scopedEmployeeId}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {member.designation} • {member.department}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-xs">
                      <button
                        onClick={() => handleDownloadStaffQR(member)}
                        className="flex items-center space-x-1 px-2.5 py-1 text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg font-bold"
                      >
                        <Download className="w-3 h-3" />
                        <span>কিউআর ডাউনলোড</span>
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="flex items-center space-x-1 px-2.5 py-1 text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg font-bold"
                      >
                        <Printer className="w-3 h-3" />
                        <span>প্রিন্ট</span>
                      </button>
                    </div>
                  </div>

                  {/* Dual Card Row for Staff (Front Side & Pure White Back Side) */}
                  <div className="flex flex-wrap items-center justify-center gap-6">
                    {/* 1. FRONT SIDE: MODERN DESIGNED FACULTY & STAFF ID CARD */}
                    {(cardViewMode === 'both' || cardViewMode === 'front') && (
                      <ModernTeacherIDCardFront
                        member={member}
                        school={school}
                        scopedEmployeeId={scopedEmployeeId}
                        theme={cardTemplate}
                        qrUrl={qrUrl}
                        heightClass="h-[500px]"
                      />
                    )}

                    {/* 2. BACK SIDE: MATCHED THEMED FACULTY & STAFF BACK CARD */}
                    {(cardViewMode === 'both' || cardViewMode === 'back') && (
                      <ModernTeacherIDCardBack
                        member={member}
                        school={school}
                        scopedEmployeeId={scopedEmployeeId}
                        theme={cardTemplate}
                        qrUrl={qrUrl}
                        heightClass="h-[500px]"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. STUDENTS ID CARDS GRID                                */}
      {/* ======================================================== */}
      {targetAudience === 'students' && (
        <div className="space-y-8">
          {filteredStudents.length === 0 ? (
            <div className="p-12 bg-white rounded-2xl border border-slate-200/80 text-center text-slate-400 text-xs">
              কোনো শিক্ষার্থী পাওয়া যায়নি। সার্চ ফিল্টার পরিবর্তন করুন।
            </div>
          ) : (
            filteredStudents.map((student) => {
              const qrUrl = qrCodeUrls[student.id];
              const scopedStudentId = formatSchoolScopedId(student.studentId, activeSchoolCode);

              return (
                <div
                  key={student.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs print:p-0 print:border-none print:shadow-none"
                >
                  {/* Student Mini Header */}
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 print:hidden">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <h3 className="font-extrabold text-slate-900 text-sm">
                        {student.nameBn || student.nameEn} ({student.nameEn})
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 font-mono">
                        ID: {scopedStudentId}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        শ্রেণি: {student.className} • রোল: {student.roll}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-xs">
                      <button
                        onClick={() => handleDownloadStudentQR(student)}
                        className="flex items-center space-x-1 px-2.5 py-1 text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg font-bold"
                      >
                        <Download className="w-3 h-3" />
                        <span>কিউআর ডাউনলোড</span>
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="flex items-center space-x-1 px-2.5 py-1 text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg font-bold"
                      >
                        <Printer className="w-3 h-3" />
                        <span>প্রিন্ট</span>
                      </button>
                    </div>
                  </div>

                  {/* Dual Card Row (Front Side & Pure White Back Side) */}
                  <div className="flex flex-wrap items-center justify-center gap-6">
                    {/* 1. FRONT SIDE: MODERN DESIGNED STUDENT ID CARD */}
                    {(cardViewMode === 'both' || cardViewMode === 'front') && (
                      <ModernStudentIDCardFront
                        student={student}
                        school={school}
                        scopedStudentId={scopedStudentId}
                        theme={cardTemplate}
                        qrUrl={qrUrl}
                        heightClass="h-[500px]"
                      />
                    )}

                    {/* 2. BACK SIDE: MATCHED THEMED STUDENT BACK CARD */}
                    {(cardViewMode === 'both' || cardViewMode === 'back') && (
                      <ModernStudentIDCardBack
                        student={student}
                        school={school}
                        scopedStudentId={scopedStudentId}
                        theme={cardTemplate}
                        qrUrl={qrUrl}
                        heightClass="h-[500px]"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
