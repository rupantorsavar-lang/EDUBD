import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSchool } from '../../context/SchoolContext';
import { StorageService } from '../../services/storage';
import { ClassInfo, Student } from '../../types';
import { formatClassOptionLabel, getManagedClassList } from '../../utils/academicClasses';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { formatGroupName } from '../../utils/i18n';
import { resolveSchoolCode, formatSchoolScopedId } from '../../utils/schoolIdFormatter';
import { compareStudentsByClassAndRoll } from '../../utils/studentSort';
import QRCode from 'qrcode';
import {
  ModernStudentIDCardFront,
  ModernStudentIDCardBack,
  ID_CARD_THEME_OPTIONS,
  IDCardTheme,
} from '../common/ModernIDCardFronts';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';
import {
  FileBadge,
  Printer,
  Search,
  CreditCard,
  Award,
  CheckCircle,
  FileCheck2,
  Calendar,
  X,
  Building,
  Layers,
  Scissors,
  Sparkles,
  SlidersHorizontal,
  Users,
  Check,
  Phone,
  Wifi,
  ShieldCheck,
  QrCode,
} from 'lucide-react';
import {
  AdmitCardTemplate,
  AdmitCardFormat,
  InstructionMode,
  TableDensity,
} from './AdmitCardTemplate';
import { LandscapeCertificate3x2, LandscapeCertDocType } from './LandscapeCertificate3x2';

export const CertificatesView: React.FC = () => {
  const { saasSession } = useAuth();
  const { language, toBnNumber } = useLanguage();
  const { schoolProfile } = useSchool();
  const school = schoolProfile;
  const activeSchoolCode = resolveSchoolCode(saasSession?.school?.schoolId, schoolProfile);
  const [academicClasses, setAcademicClasses] = useState<ClassInfo[]>(() => StorageService.getClasses());
  const managedClassList = React.useMemo(() => getManagedClassList(academicClasses), [academicClasses]);
  const students = StorageService.getStudents();
  const exams = StorageService.getExams();
  const [, setSyncTick] = useState<number>(0);

  useEffect(() => {
    const handleSync = () => {
      setAcademicClasses(StorageService.getClasses());
      setSyncTick((n) => n + 1);
    };
    const handleClassesUpdated = () => {
      setAcademicClasses(StorageService.getClasses());
      setSyncTick((n) => n + 1);
    };
    window.addEventListener('school_cloud_data_synced', handleSync);
    window.addEventListener('school_classes_updated', handleClassesUpdated);
    return () => {
      window.removeEventListener('school_cloud_data_synced', handleSync);
      window.removeEventListener('school_classes_updated', handleClassesUpdated);
    };
  }, []);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    const sorted = students.slice().sort(compareStudentsByClassAndRoll);
    return sorted[0]?.id || 'std_1';
  });
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [docType, setDocType] = useState<'id_card' | 'admit_card' | 'testimonial' | 'transfer' | 'character' | 'bonafide'>('admit_card');
  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0]?.id || 'ex_1');
  const [issueDate, setIssueDate] = useState<string>('2026-06-10');
  const [certificateSerial, setCertificateSerial] = useState<string>('AC-2026-0842');

  // Advanced Admit Card Settings & Layouts
  const [admitFormat, setAdmitFormat] = useState<AdmitCardFormat>('a4_full');
  const [admitTwoPerPageMode, setAdmitTwoPerPageMode] = useState<'duplicate' | 'two_students'>('duplicate');
  const [admitDensity, setAdmitDensity] = useState<TableDensity>('auto');
  const [admitInstructionMode, setAdmitInstructionMode] = useState<InstructionMode>('auto' as any);
  const [bulkPrintAll, setBulkPrintAll] = useState<boolean>(false);

  // Institutional Certificate Size (A4 Landscape 297x210mm 3:2 default vs 14x11 Inch) and Templates (Royal 3:2 Demo Style vs Classic)
  const [certSize, setCertSize] = useState<'a4_landscape' | 'fourteen_by_eleven'>('a4_landscape');
  const [certTemplate, setCertTemplate] = useState<'royal_3x2' | 'classic'>('royal_3x2');
  const [idCardTheme, setIdCardTheme] = useState<IDCardTheme>('classic_academic');

  const filteredStudents = (selectedClassFilter === 'all'
    ? students
    : students.filter((s) => s.className === selectedClassFilter)
  )
    .slice()
    .sort(compareStudentsByClassAndRoll);

  const student = filteredStudents.find((s) => s.id === selectedStudentId) || filteredStudents[0] || students[0];
  const exam = exams.find((e) => e.id === selectedExamId) || exams[0];

  const [studentQrUrl, setStudentQrUrl] = useState<string>('');

  useEffect(() => {
    if (student) {
      try {
        const qrData = StorageService.generateStudentQRData(student);
        QRCode.toDataURL(qrData, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 400,
          color: { dark: '#000000', light: '#ffffff' },
        }).then(setStudentQrUrl).catch(console.error);
      } catch (err) {
        console.error('QR generation failed:', err);
      }
    }
  }, [student]);

  // Helper to fetch routines strictly matching student's class and group
  const getRoutinesForStudent = (std: Student) => {
    if (!std) return [];
    let all = StorageService.getRoutinesForClassAndExam(selectedExamId, std.className);
    if (all.length === 0) {
      all = StorageService.autoGenerateRoutineFromSubjects(selectedExamId, std.className);
    }
    return all.filter((item) => {
      if (!['Class 9', 'Class 10'].includes(std.className)) return true;
      const sGroup = (std.group || 'Science').toLowerCase();
      if (!item.group || item.group.toLowerCase() === 'all' || item.group.toLowerCase() === 'general') return true;
      const iGroup = item.group.toLowerCase();
      if (sGroup.includes('science') && iGroup.includes('science')) return true;
      if ((sGroup.includes('commerce') || sGroup.includes('business')) && (iGroup.includes('commerce') || iGroup.includes('business'))) return true;
      if ((sGroup.includes('humanities') || sGroup.includes('arts')) && (iGroup.includes('humanities') || iGroup.includes('arts'))) return true;
      if (sGroup.includes('vocational') && iGroup.includes('vocational')) return true;
      return iGroup === sGroup;
    });
  };

  const classRoutines = student ? getRoutinesForStudent(student) : [];

  // Paired student for two_per_page mode
  const currentIdx = filteredStudents.findIndex((s) => s.id === student?.id);
  const pairedStudent = filteredStudents[currentIdx + 1] || filteredStudents[0];
  const pairedRoutines = pairedStudent ? getRoutinesForStudent(pairedStudent) : [];

  const certificateLauncherItems: LauncherTileItem[] = [
    {
      id: 'admit_card',
      label: language === 'bn' ? 'প্রবেশপত্র' : 'Admit Card',
      icon: FileBadge,
      color: 'blue',
      active: docType === 'admit_card',
      onClick: () => setDocType('admit_card'),
    },
    {
      id: 'id_card',
      label: language === 'bn' ? 'আইডি কার্ড' : 'ID Card',
      icon: CreditCard,
      color: 'teal',
      active: docType === 'id_card',
      onClick: () => setDocType('id_card'),
    },
    {
      id: 'testimonial',
      label: language === 'bn' ? 'প্রশংসাপত্র' : 'Testimonial',
      icon: Award,
      color: 'amber',
      active: docType === 'testimonial',
      onClick: () => setDocType('testimonial'),
    },
    {
      id: 'transfer',
      label: language === 'bn' ? 'ছাড়পত্র (TC)' : 'Transfer (TC)',
      icon: FileCheck2,
      color: 'red',
      active: docType === 'transfer',
      onClick: () => setDocType('transfer'),
    },
    {
      id: 'character',
      label: language === 'bn' ? 'চারিত্রিক সনদ' : 'Character Cert',
      icon: ShieldCheck,
      color: 'purple',
      active: docType === 'character',
      onClick: () => setDocType('character'),
    },
    {
      id: 'bonafide',
      label: language === 'bn' ? 'প্রত্যয়নপত্র' : 'Bonafide Cert',
      icon: CheckCircle,
      color: 'green',
      active: docType === 'bonafide',
      onClick: () => setDocType('bonafide'),
    },
  ];

  return (
    <div className="space-y-5">
      {/* App-Launcher Icon Tile Grid (Hidden on Print) */}
      <LauncherIconGrid items={certificateLauncherItems} columns={6} compact />

      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            {language === 'bn' ? 'সনদপত্র ও প্রত্যয়নপত্র প্রিন্ট' : 'Official Certificates & Document Generator'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? 'আইডি কার্ড, অ্যাডমিট কার্ড, প্রশংসাপত্র, ছাড়পত্র (TC), চারিত্রিক সনদ ও প্রত্যয়নপত্র'
              : 'Printable ID cards, admit cards, testimonials, transfer certificates & bonafide letters'}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs"
        >
          <Printer className="w-4 h-4" />
          <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print Document'}</span>
        </button>
      </div>

      {/* Control Panel (Hidden on Print) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3.5 print:hidden">
        {/* Main Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {/* Certificate Type */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Document Type:</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-semibold text-blue-700"
            >
              <option value="admit_card">Exam Admit Card (প্রবেশপত্র)</option>
              <option value="id_card">Student ID Card (Front & Back)</option>
              <option value="testimonial">Testimonial (প্রশংসাপত্র)</option>
              <option value="transfer">Transfer Certificate (ছাড়পত্র / TC)</option>
              <option value="character">Character Certificate (চারিত্রিক সনদ)</option>
              <option value="bonafide">Bonafide Student Certificate</option>
            </select>
          </div>

          {/* Class Filter */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Filter by Class:</label>
            <select
              value={selectedClassFilter}
              onChange={(e) => {
                setSelectedClassFilter(e.target.value);
                const matching = (e.target.value === 'all'
                  ? students
                  : students.filter((s) => s.className === e.target.value)
                )
                  .slice()
                  .sort(compareStudentsByClassAndRoll);
                if (matching.length > 0) {
                  setSelectedStudentId(matching[0].id);
                }
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-medium text-slate-800"
            >
              <option value="all">All Classes (সকল শ্রেণি)</option>
              {managedClassList.map((cls) => (
                <option key={cls.id} value={cls.name}>{formatClassOptionLabel(cls, language)}</option>
              ))}
            </select>
          </div>

          {/* Student Selector */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Student:</label>
            <select
              value={student?.id || selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-medium"
              disabled={bulkPrintAll}
            >
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.roll} - {s.nameEn} ({s.className})
                </option>
              ))}
              {filteredStudents.length === 0 && (
                <option value="">No students in this class</option>
              )}
            </select>
          </div>

          {/* Exam (if Admit Card) */}
          {docType === 'admit_card' ? (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Select Examination:</label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.nameEn}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Serial Number:</label>
              <input
                type="text"
                value={certificateSerial}
                onChange={(e) => setCertificateSerial(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-mono"
              />
            </div>
          )}

          {/* Issue Date */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Issue Date:</label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-medium"
            />
          </div>
        </div>

        {/* Specialized Toolbar for Admit Card (Page Size, Half A4, Density, Instructions, Bulk Print) */}
        {docType === 'admit_card' && (
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Format / Page Size Buttons */}
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700 flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>{language === 'bn' ? 'প্রবেশপত্র সাইজ / লেআউট:' : 'Page Layout Size:'}</span>
                </span>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setAdmitFormat('a4_full')}
                    className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                      admitFormat === 'a4_full'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {language === 'bn' ? 'A4 পূর্ণ পাতা (Single A4)' : 'A4 Full Page'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdmitFormat('half_a4')}
                    className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                      admitFormat === 'half_a4'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {language === 'bn' ? 'হাফ A4 / A5 সাইজ' : 'Half A4 (A5)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdmitFormat('two_per_page')}
                    className={`px-3 py-1 rounded-md font-bold text-xs transition-all flex items-center space-x-1 ${
                      admitFormat === 'two_per_page'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <Scissors className="w-3 h-3 text-amber-300" />
                    <span>{language === 'bn' ? '1 পাতায় 2টি (পেপার সেভার)' : '2 Cards / A4'}</span>
                  </button>
                </div>
              </div>

              {/* In 2 Cards per Page mode: Mode selector */}
              {admitFormat === 'two_per_page' && (
                <div className="flex items-center space-x-1.5 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 text-xs">
                  <span className="font-bold text-blue-900 text-[11px]">{language === 'bn' ? '2য় কার্ড:' : '2nd Card:'}</span>
                  <select
                    value={admitTwoPerPageMode}
                    onChange={(e) => setAdmitTwoPerPageMode(e.target.value as any)}
                    className="px-2 py-0.5 bg-white border border-blue-300 rounded text-xs font-semibold text-blue-950"
                  >
                    <option value="duplicate">
                      {language === 'bn' ? 'একই শিক্ষার্থীর 2 কপি (শিক্ষার্থী + অফিস কপি)' : 'Student + Office Copy (Same)'}
                    </option>
                    <option value="two_students">
                      {language === 'bn' ? 'পরপর 2 জন শিক্ষার্থী (50% কাগজ সাশ্রয়)' : 'Consecutive Students (Save 50% Paper)'}
                    </option>
                  </select>
                </div>
              )}

              {/* Density and Instructions Selectors */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-1">
                  <span className="text-slate-500 text-[11px] font-semibold">{language === 'bn' ? 'ঘনত্ব:' : 'Density:'}</span>
                  <select
                    value={admitDensity}
                    onChange={(e) => setAdmitDensity(e.target.value as any)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                  >
                    <option value="auto">{language === 'bn' ? 'অটো-ফিট (Auto)' : 'Auto-Fit'}</option>
                    <option value="standard">{language === 'bn' ? 'স্বাভাবিক (Standard)' : 'Standard'}</option>
                    <option value="compact">{language === 'bn' ? 'কম্প্যাক্ট (ঘন - 12 বিষয়)' : 'Compact'}</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1">
                  <span className="text-slate-500 text-[11px] font-semibold">{language === 'bn' ? 'নির্দেশনা:' : 'Rules:'}</span>
                  <select
                    value={admitInstructionMode}
                    onChange={(e) => setAdmitInstructionMode(e.target.value as any)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                  >
                    <option value="auto">{language === 'bn' ? 'স্মার্ট (Smart)' : 'Smart Auto'}</option>
                    <option value="full">{language === 'bn' ? 'পূর্ণাঙ্গ (4টি নিয়ম)' : 'Full (4 Rules)'}</option>
                    <option value="compact">{language === 'bn' ? '2-কলাম সংক্ষিপ্ত' : 'Compact 2-Col'}</option>
                    <option value="minimal">{language === 'bn' ? '1-লাইন সামারি' : '1-Line Minimal'}</option>
                    <option value="none">{language === 'bn' ? 'বাদ দিন (None)' : 'None'}</option>
                  </select>
                </div>

                {/* Bulk Print Class Toggle */}
                <button
                  type="button"
                  onClick={() => setBulkPrintAll(!bulkPrintAll)}
                  className={`flex items-center space-x-1 px-3 py-1 rounded-lg font-bold text-xs transition-colors border ${
                    bulkPrintAll
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50'
                  }`}
                  title="Print admit cards for all students in the selected class"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {bulkPrintAll
                      ? (language === 'bn' ? `সকল ${filteredStudents.length} জনের মোড চালু` : `Bulk Mode ON (${filteredStudents.length})`)
                      : (language === 'bn' ? `শ্রেণির সবার প্রিন্ট (${filteredStudents.length} জন)` : `Print All (${filteredStudents.length})`)}
                  </span>
                </button>
              </div>
            </div>

            {/* Smart Advisory Banner based on subject count */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border text-xs bg-slate-50">
              <div className="flex items-center space-x-2">
                {classRoutines.length <= 7 ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>{language === 'bn' ? 'কম বিষয়' : 'Few Subjects'}</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    <span>{language === 'bn' ? `${classRoutines.length}টি বিষয়` : `${classRoutines.length} Subjects`}</span>
                  </span>
                )}
                <span className="text-slate-700 font-medium text-[11px]">
                  {classRoutines.length <= 7 ? (
                    language === 'bn'
                      ? `এই শ্রেণিতে মোট ${classRoutines.length}টি বিষয় রয়েছে। পেপার সাশ্রয় করতে 'হাফ A4' অথবা '1 পাতায় 2টি (পেপার সেভার)' বেছে নিতে পারেন!`
                      : `This class has ${classRoutines.length} subjects. Consider using 'Half A4' or '2 Cards / A4' to save paper!`
                  ) : (
                    language === 'bn'
                      ? `এই শ্রেণিতে মোট ${classRoutines.length}টি বিষয় রয়েছে। এটি কোনো অবস্থাতেই A4 সাইজের বাইরে যাবে না—নিখুঁত 1 পেজে ফিট রাখার জন্য অপ্টিমাইজ করা হয়েছে!`
                      : `This class has ${classRoutines.length} subjects. It is strictly optimized to never exceed 1 single A4 sheet!`
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono hidden sm:block">
                A4 Max-Height: 280mm
              </div>
            </div>
          </div>
        )}

        {/* Specialized Toolbar for Institutional Certificates (A4 Landscape 3:2 vs 14x11 Inch) */}
        {['testimonial', 'transfer', 'character', 'bonafide'].includes(docType) && (
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Paper Size: A4 Landscape (297 x 210 mm · 3:2) Default vs 14x11 Inch Landscape */}
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700 flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>{language === 'bn' ? 'প্রিন্ট পেপার সাইজ:' : 'Certificate Print Size:'}</span>
                </span>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setCertSize('a4_landscape')}
                    className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                      certSize === 'a4_landscape'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {language === 'bn' ? 'A4 ল্যান্ডস্কেপ (297×210 mm · 3:2)' : 'A4 Landscape (297×210mm · 3:2)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCertSize('fourteen_by_eleven')}
                    className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                      certSize === 'fourteen_by_eleven'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {language === 'bn' ? '14 × 11 ইঞ্চি ল্যান্ডস্কেপ' : '14 × 11 Inch Landscape'}
                  </button>
                </div>
              </div>

              {/* Template Choice: 3:2 Royal Landscape (Demo Style) vs Classic Formal */}
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{language === 'bn' ? 'ডিজাইন টেমপ্লেট:' : 'Design Template:'}</span>
                </span>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setCertTemplate('royal_3x2')}
                    className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                      certTemplate === 'royal_3x2'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {language === 'bn' ? 'টেমপ্লেট 1: 4টি রয়্যাল ডিজাইন (3:2)' : '4 Bespoke Designs (3:2 Landscape)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCertTemplate('classic')}
                    className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                      certTemplate === 'classic'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {language === 'bn' ? 'টেমপ্লেট 2: ক্লাসিক ফর্মাল' : 'Classic Formal'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 bg-blue-50/70 p-2 rounded-lg border border-blue-200">
              <span className="flex items-center gap-1.5 font-medium text-blue-900">
                <CheckCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  {certSize === 'a4_landscape'
                    ? '4টি সনদের জন্য 4টি ভিন্ন প্রিমিয়াম ডিজাইন (3:2 অনুপাত · 1536 × 1024 px) — A4 Landscape (297 × 210 mm) প্রিন্ট সেটআপ সক্রিয়।'
                    : '4টি সনদের জন্য 4টি ভিন্ন প্রিমিয়াম ডিজাইন (3:2 অনুপাত) — 14 × 11 ইঞ্চি ল্যান্ডস্কেপ প্রিন্ট সেটআপ সক্রিয়।'}
                </span>
              </span>
              <span className="font-mono font-bold text-blue-800">
                {certSize === 'a4_landscape' ? 'Ratio 3:2 · A4 Landscape (297 × 210 mm)' : 'Ratio 3:2 · 14" × 11" Landscape'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* DOCUMENT PREVIEW CONTAINER */}
      <div className="bg-slate-100 p-4 md:p-8 rounded-2xl border border-slate-200 flex justify-center print:bg-white print:p-0 print:border-none">
        {!student ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 w-full max-w-lg shadow-sm">
            <Award className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <h3 className="font-bold text-base text-slate-800">
              {language === 'bn' ? 'কোনো শিক্ষার্থী পাওয়া যায়নি' : 'No Students Available'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {language === 'bn'
                ? 'আইডি কার্ড, প্রবেশপত্র বা সনদ প্রিন্ট করার জন্য প্রথমে শিক্ষার্থী মেনু থেকে নতুন শিক্ষার্থী যুক্ত করুন।'
                : 'Please add students from the Student Management module to preview and generate certificates.'}
            </p>
          </div>
        ) : (
          <>
            {/* 1. STUDENT ID CARD (Front & Back) */}
            {docType === 'id_card' && (
              <div className="space-y-4">
                <div className="flex items-center justify-center print:hidden">
                  <div className="inline-flex items-center space-x-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                    <span className="text-[11px] font-bold text-slate-600 px-2">কালার থিম:</span>
                    {ID_CARD_THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setIdCardTheme(opt.id)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors ${
                          idCardTheme === opt.id
                            ? opt.activeClass
                            : 'text-slate-600 hover:text-slate-900 bg-white/70'
                        }`}
                      >
                        {language === 'bn' ? opt.labelBn : opt.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-6 print:m-0 print:gap-4 justify-center items-center">
                  {/* Front Side: Modern Student ID Card */}
                  <ModernStudentIDCardFront
                    student={student}
                    school={school}
                    scopedStudentId={formatSchoolScopedId(student.studentId, activeSchoolCode)}
                    theme={idCardTheme}
                    qrUrl={studentQrUrl}
                    heightClass="h-[500px]"
                  />

                  {/* Back Side: Matched Themed Student Back Card */}
                  <ModernStudentIDCardBack
                    student={student}
                    school={school}
                    scopedStudentId={formatSchoolScopedId(student.studentId, activeSchoolCode)}
                    theme={idCardTheme}
                    qrUrl={studentQrUrl}
                    heightClass="h-[500px]"
                  />
                </div>
              </div>
            )}

        {/* 2. EXAM ADMIT CARD */}
        {docType === 'admit_card' && (
          <div className="w-full">
            {/* Print Stylesheet for strict A4 / Half A4 print geometry */}
            <style>{`
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 6mm 6mm 6mm 6mm;
                }
                body {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                .print-page-break {
                  page-break-after: always !important;
                  break-after: page !important;
                }
                .print-page-break:last-child {
                  page-break-after: avoid !important;
                  break-after: avoid !important;
                }
              }
            `}</style>

            {!bulkPrintAll ? (
              /* Single Student Mode */
              student && (
                <AdmitCardTemplate
                  school={school}
                  student={student}
                  exam={exam}
                  routines={classRoutines}
                  issueDate={issueDate}
                  format={admitFormat}
                  instructionMode={admitInstructionMode}
                  density={admitDensity}
                  twoPerPageMode={admitTwoPerPageMode}
                  pairedStudent={pairedStudent}
                  pairedRoutines={pairedRoutines}
                  language={language}
                />
              )
            ) : (
              /* Bulk Print Mode (All Students in Filtered Class) */
              <div className="space-y-6 print:space-y-0">
                {admitFormat === 'two_per_page' ? (
                  /* 2 Cards per Sheet Pairing */
                  Array.from({ length: Math.ceil(filteredStudents.length / (admitTwoPerPageMode === 'two_students' ? 2 : 1)) }).map((_, sheetIdx) => {
                    const firstStd = admitTwoPerPageMode === 'two_students'
                      ? filteredStudents[sheetIdx * 2]
                      : filteredStudents[sheetIdx];
                    const secondStd = admitTwoPerPageMode === 'two_students'
                      ? filteredStudents[sheetIdx * 2 + 1]
                      : firstStd;
                    if (!firstStd) return null;

                    const firstRoutines = getRoutinesForStudent(firstStd);
                    const secondRoutines = secondStd ? getRoutinesForStudent(secondStd) : firstRoutines;

                    return (
                      <div key={sheetIdx} className="print-page-break pb-6 print:pb-0">
                        <AdmitCardTemplate
                          school={school}
                          student={firstStd}
                          exam={exam}
                          routines={firstRoutines}
                          issueDate={issueDate}
                          format="two_per_page"
                          instructionMode={admitInstructionMode}
                          density={admitDensity}
                          twoPerPageMode={admitTwoPerPageMode}
                          pairedStudent={secondStd}
                          pairedRoutines={secondRoutines}
                          language={language}
                        />
                      </div>
                    );
                  })
                ) : (
                  /* Single Card per Sheet (A4 Full or Half A4) */
                  filteredStudents.map((std, idx) => (
                    <div key={std.id || idx} className="print-page-break pb-6 print:pb-0">
                      <AdmitCardTemplate
                        school={school}
                        student={std}
                        exam={exam}
                        routines={getRoutinesForStudent(std)}
                        issueDate={issueDate}
                        format={admitFormat}
                        instructionMode={admitInstructionMode}
                        density={admitDensity}
                        language={language}
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Dynamic Certificate Print Stylesheet (A4 Landscape 297x210mm or 14x11 Landscape) */}
        {['testimonial', 'transfer', 'character', 'bonafide'].includes(docType) && (
          <style>{`
            @media print {
              @page {
                size: ${certSize === 'fourteen_by_eleven' ? '14in 11in landscape' : 'A4 landscape'};
                margin: ${certSize === 'fourteen_by_eleven' ? '6mm' : '5mm'};
              }
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                background: white !important;
              }
              .landscape-cert-3x2-outer {
                width: auto !important;
                height: auto !important;
              }
              .landscape-cert-3x2 {
                width: ${certSize === 'fourteen_by_eleven' ? '335mm' : '282mm'} !important;
                height: ${certSize === 'fourteen_by_eleven' ? '223.3mm' : '188mm'} !important;
                transform: none !important;
                margin: 0 auto !important;
                box-shadow: none !important;
                page-break-inside: avoid !important;
                page-break-after: avoid !important;
              }
              .a4-certificate-sheet {
                width: 100% !important;
                max-width: ${certSize === 'fourteen_by_eleven' ? '345mm' : '285mm'} !important;
                min-height: ${certSize === 'fourteen_by_eleven' ? '265mm' : '195mm'} !important;
                height: auto !important;
                margin: 0 auto !important;
                padding: ${certSize === 'fourteen_by_eleven' ? '12mm 16mm' : '8mm 12mm'} !important;
                box-shadow: none !important;
                border-width: 4px !important;
                page-break-inside: avoid !important;
                page-break-after: avoid !important;
              }
            }
          `}</style>
        )}

        {/* 3-6 ROYAL 3:2 LANDSCAPE CERTIFICATES (1536x1024 Ratio · A4 Landscape Ready) */}
        {['testimonial', 'transfer', 'character', 'bonafide'].includes(docType) && certTemplate === 'royal_3x2' && (
          <LandscapeCertificate3x2
            docType={docType as LandscapeCertDocType}
            school={school}
            student={student}
            scopedStudentId={formatSchoolScopedId(student.studentId, activeSchoolCode)}
            activeSchoolCode={activeSchoolCode}
            serialNo={certificateSerial}
            issueDate={issueDate}
            qrUrl={studentQrUrl}
            language={language}
            certSize={certSize}
          />
        )}

        {/* 3. TESTIMONIAL (CLASSIC FORMAL FALLBACK) */}
        {docType === 'testimonial' && certTemplate === 'classic' && (
          <div
            className={`a4-certificate-sheet w-full ${
              certSize === 'fourteen_by_eleven'
                ? 'max-w-[355mm] min-h-[279mm] p-8 sm:p-14'
                : 'max-w-[285mm] min-h-[195mm] p-6 sm:p-10'
            } bg-white rounded-none sm:rounded-2xl shadow-2xl border-[8px] border-double border-slate-900 ring-2 ring-slate-800 text-slate-900 print:shadow-none print:border-4 print:border-slate-900 flex flex-col justify-between relative mx-auto my-0`}
          >
            {/* Watermark Logo */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
              <img
                src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                alt=""
                className="w-80 h-80 object-contain"
              />
            </div>

            {/* Header */}
            <div>
              <div className="text-center pb-5 border-b-2 border-slate-900 relative z-10">
                <div className="flex items-center justify-center space-x-3 mb-2">
                  <img
                    src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="School Logo"
                    className="w-16 h-16 object-contain"
                  />
                  <div className="text-center">
                    <h1 className="text-2xl font-black text-slate-900 leading-tight">{school.nameBn}</h1>
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">{school.nameEn}</h2>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1">{school.addressBn} • EIIN: {school.eiin} • ফোন: {school.phone}</p>
                <div className="inline-block mt-3 px-6 py-1.5 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-full shadow-xs">
                  TESTIMONIAL CERTIFICATE • প্রশংসাপত্র
                </div>
              </div>

              {/* Serial & Date Bar */}
              <div className="flex justify-between items-center text-xs text-slate-600 py-3 border-b border-dashed border-slate-300 relative z-10 font-mono">
                <span>স্মারক / Sl. No: <strong className="text-slate-900 font-bold">{certificateSerial}</strong></span>
                <span>প্রদানের তারিখ / Date: <strong className="text-slate-900 font-bold">{issueDate}</strong></span>
              </div>

              {/* Certificate Body Paragraphs */}
              <div className="my-8 space-y-5 text-[14px] leading-loose text-slate-800 text-justify relative z-10">
                <p className="indent-10">
                  This is to solemnly certify that <strong className="text-slate-950 font-black text-base underline decoration-slate-400 underline-offset-4">{student.nameEn}</strong>{' '}
                  <span className="font-semibold text-slate-700">({student.nameBn})</span>, son / daughter of{' '}
                  <strong className="text-slate-950 font-bold">{student.fatherNameEn}</strong> and{' '}
                  <strong className="text-slate-950 font-bold">{student.motherNameEn}</strong>, bearing Student ID{' '}
                  <strong className="text-blue-900 font-mono font-black">{student.studentId}</strong> and Class Roll{' '}
                  <strong className="text-slate-950 font-mono font-black">{student.roll}</strong>, was a bonafide student of this institution in{' '}
                  <strong className="text-slate-950 font-bold">{student.className}</strong>
                  {['Class 9', 'Class 10'].includes(student.className) && (
                    <span> (বিভাগ / Group: <strong className="text-amber-900 font-bold">{formatGroupName(student.group || 'Science', language)}</strong>)</span>
                  )}{' '}, Section <strong className="text-slate-950 font-bold">{student.section}</strong> during the academic session{' '}
                  <strong className="text-slate-950 font-bold">{student.session || school.currentSession || '2026'}</strong>.
                </p>

                <p className="indent-10">
                  During his / her period of study in this renowned institution, his / her academic performance was found to be thoroughly satisfactory and conduct was exemplary. To the best of my knowledge and official records, he / she never took part in any activity subversive of the discipline of the institution or of the state.
                </p>

                <p className="indent-10">
                  He / She bears a reputable character and good moral conduct. I sincerely wish him / her a prosperous and illuminating future in all higher academic pursuits.
                </p>
              </div>
            </div>

            {/* Bottom Official Signatures & Seal */}
            <div className="pt-8 border-t-2 border-slate-900 relative z-10">
              <div className="grid grid-cols-3 items-end text-center text-xs">
                {/* Prepared By */}
                <div>
                  <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-800">
                    Prepared By
                  </div>
                  <span className="text-[10px] text-slate-500 block">অফিস সহকারী / প্রণেতা</span>
                </div>

                {/* Institutional Official Seal Stamp */}
                <div className="flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-400 flex flex-col items-center justify-center text-[8px] text-slate-400 text-center uppercase p-1">
                    <span>SEAL</span>
                    <span className="text-[6.5px]">প্রতিষ্ঠানের সীল</span>
                  </div>
                </div>

                {/* Principal Signature */}
                <div>
                  <div className="border-b border-slate-700 pb-0.5">
                    <PrincipalSignatureDisplay
                      school={school}
                      fallbackText="Principal / Head Teacher"
                      heightClass="h-11"
                      imgClassName="max-h-10 max-w-[165px] object-contain mx-auto"
                      textClassName="font-serif italic font-black text-sm text-blue-950 truncate"
                    />
                  </div>
                  <div className="pt-1 font-bold text-slate-900">
                    Principal / Headmaster
                  </div>
                  {school.principalSignatureUrl && (school.principalNameEn || school.principalNameBn) && (
                    <span className="text-[10px] font-semibold text-slate-700 block truncate">
                      {school.principalNameEn || school.principalNameBn}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 block">অধ্যক্ষ / প্রধান শিক্ষক</span>
                </div>
              </div>

              {/* Footer Note */}
              <div className="mt-6 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400 font-mono">
                {certSize === 'fourteen_by_eleven' ? '14" × 11" Institutional Certificate Standard' : 'ISO A4 Standard Certificate'} • {school.nameEn} • Verification Helpline: {school.phone}
              </div>
            </div>
          </div>
        )}

        {/* 4. TRANSFER CERTIFICATE (CLASSIC FORMAL FALLBACK) */}
        {docType === 'transfer' && certTemplate === 'classic' && (
          <div
            className={`a4-certificate-sheet w-full ${
              certSize === 'fourteen_by_eleven'
                ? 'max-w-[355mm] min-h-[279mm] p-8 sm:p-14'
                : 'max-w-[285mm] min-h-[195mm] p-6 sm:p-10'
            } bg-white rounded-none sm:rounded-2xl shadow-2xl border-[8px] border-double border-rose-950 ring-2 ring-rose-900 text-slate-900 print:shadow-none print:border-4 print:border-rose-950 flex flex-col justify-between relative mx-auto my-0`}
          >
            {/* Watermark Logo */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
              <img
                src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                alt=""
                className="w-80 h-80 object-contain"
              />
            </div>

            {/* Header */}
            <div>
              <div className="text-center pb-5 border-b-2 border-rose-950 relative z-10">
                <div className="flex items-center justify-center space-x-3 mb-2">
                  <img
                    src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="School Logo"
                    className="w-16 h-16 object-contain"
                  />
                  <div className="text-center">
                    <h1 className="text-2xl font-black text-slate-900 leading-tight">{school.nameBn}</h1>
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">{school.nameEn}</h2>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1">{school.addressBn} • EIIN: {school.eiin} • ফোন: {school.phone}</p>
                <div className="inline-block mt-3 px-6 py-1.5 bg-rose-900 text-white font-black text-xs uppercase tracking-widest rounded-full shadow-xs">
                  TRANSFER CERTIFICATE (ছাড়পত্র / TC)
                </div>
              </div>

              {/* Serial & Date Bar */}
              <div className="flex justify-between items-center text-xs text-slate-600 py-3 border-b border-dashed border-slate-300 relative z-10 font-mono">
                <span>ছাড়পত্র নং / TC No: <strong className="text-rose-950 font-bold">{certificateSerial.replace(/^AC/, 'TC')}</strong></span>
                <span>প্রদানের তারিখ / Date: <strong className="text-slate-900 font-bold">{issueDate}</strong></span>
              </div>

              {/* Form Particulars Table */}
              <div className="my-6 space-y-2 text-xs leading-relaxed relative z-10">
                <table className="w-full border-collapse border border-slate-300 text-left text-slate-800">
                  <tbody>
                    <tr className="border-b border-slate-200 bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 w-1/3 border-r border-slate-200">1. শিক্ষার্থীর নাম (Student Name):</td>
                      <td className="p-2.5 font-black text-slate-950 text-sm">{student.nameEn} ({student.nameBn})</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">2. স্টুডেন্ট / ভর্তি আইডি (Student ID):</td>
                      <td className="p-2.5 font-mono font-black text-blue-900">{student.studentId}</td>
                    </tr>
                    <tr className="border-b border-slate-200 bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">3. পিতার নাম (Father's Name):</td>
                      <td className="p-2.5 font-semibold text-slate-900">{student.fatherNameEn} ({student.fatherNameBn || '—'})</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">4. মাতার নাম (Mother's Name):</td>
                      <td className="p-2.5 font-semibold text-slate-900">{student.motherNameEn} ({student.motherNameBn || '—'})</td>
                    </tr>
                    <tr className="border-b border-slate-200 bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">5. জন্ম তারিখ (Date of Birth):</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{student.dob}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">6. সর্বশেষ অধ্যয়নরত শ্রেণি ও রোল:</td>
                      <td className="p-2.5 font-bold text-slate-900">
                        {student.className} (রোল: {student.roll}, শাখা: {student.section})
                        {['Class 9', 'Class 10'].includes(student.className) && (
                          <span className="text-amber-900 font-bold ml-2">বিভাগ: {formatGroupName(student.group || 'Science', language)}</span>
                        )}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-200 bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">7. শিক্ষাবর্ষ (Academic Session):</td>
                      <td className="p-2.5 font-bold text-slate-900">{student.session || school.currentSession || '2026'}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">8. বকেয়া বেতন ও ফি পরিশোধের বিবরণ:</td>
                      <td className="p-2.5 font-bold text-emerald-700">সমস্ত প্রাতিষ্ঠানিক ফি ও বকেয়া সম্পূর্ণ পরিশোধিত (Full Dues Cleared)</td>
                    </tr>
                    <tr className="border-b border-slate-200 bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">9. সাধারণ আচরণ ও চরিত্র:</td>
                      <td className="p-2.5 font-bold text-slate-900">সন্তোষজনক ও প্রশংসনীয় (Satisfactory & Exemplary)</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-700 border-r border-slate-200">10. বিদ্যালয় ত্যাগের কারণ:</td>
                      <td className="p-2.5 font-bold text-slate-900">অভিভাবকের স্থানান্তর / ব্যক্তিগত সুবিধা (Guardian Transfer / Relocation)</td>
                    </tr>
                  </tbody>
                </table>

                <p className="pt-3 text-justify text-xs text-slate-700">
                  অভিভাবকের আবেদনের প্রেক্ষিতে এবং বিদ্যালয়ের হিসাব শাখা ও একাডেমিক রেকর্ড যাচাইপূর্বক এই ছাড়পত্র (Transfer Certificate) প্রদান করা হলো। আমরা শিক্ষার্থীর ভবিষ্যৎ শিক্ষা জীবনের সর্বাঙ্গীন সাফল্য কামনা করি।
                </p>
              </div>
            </div>

            {/* Signatures & Seal */}
            <div className="pt-8 border-t-2 border-rose-950 relative z-10">
              <div className="grid grid-cols-3 items-end text-center text-xs">
                <div>
                  <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-800">
                    Head Clerk / Accountant
                  </div>
                  <span className="text-[10px] text-slate-500 block">প্রধান সহকারী / হিসাবরক্ষক</span>
                </div>

                <div className="flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-400 flex flex-col items-center justify-center text-[8px] text-slate-400 text-center uppercase p-1">
                    <span>SEAL</span>
                    <span className="text-[6.5px]">অফিসিয়াল সীল</span>
                  </div>
                </div>

                <div>
                  <div className="border-b border-slate-700 pb-0.5">
                    <PrincipalSignatureDisplay
                      school={school}
                      fallbackText="Principal / Head Teacher"
                      heightClass="h-11"
                      imgClassName="max-h-10 max-w-[165px] object-contain mx-auto"
                      textClassName="font-serif italic font-black text-sm text-rose-950 truncate"
                    />
                  </div>
                  <div className="pt-1 font-bold text-slate-900">
                    Principal / Headmaster
                  </div>
                  {school.principalSignatureUrl && (school.principalNameEn || school.principalNameBn) && (
                    <span className="text-[10px] font-semibold text-slate-700 block truncate">
                      {school.principalNameEn || school.principalNameBn}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 block">প্রধান শিক্ষক / অধ্যক্ষ</span>
                </div>
              </div>

              <div className="mt-6 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400 font-mono">
                {certSize === 'fourteen_by_eleven' ? '14" × 11" Institutional Certificate Standard' : 'ISO A4 Standard Certificate'} • {school.nameEn} • Verification Helpline: {school.phone}
              </div>
            </div>
          </div>
        )}

        {/* 5. CHARACTER CERTIFICATE (CLASSIC FORMAL FALLBACK) */}
        {docType === 'character' && certTemplate === 'classic' && (
          <div
            className={`a4-certificate-sheet w-full ${
              certSize === 'fourteen_by_eleven'
                ? 'max-w-[355mm] min-h-[279mm] p-8 sm:p-14'
                : 'max-w-[285mm] min-h-[195mm] p-6 sm:p-10'
            } bg-white rounded-none sm:rounded-2xl shadow-2xl border-[8px] border-double border-indigo-950 ring-2 ring-indigo-900 text-slate-900 print:shadow-none print:border-4 print:border-indigo-950 flex flex-col justify-between relative mx-auto my-0`}
          >
            {/* Watermark Logo */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
              <img
                src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                alt=""
                className="w-80 h-80 object-contain"
              />
            </div>

            {/* Header */}
            <div>
              <div className="text-center pb-5 border-b-2 border-indigo-950 relative z-10">
                <div className="flex items-center justify-center space-x-3 mb-2">
                  <img
                    src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="School Logo"
                    className="w-16 h-16 object-contain"
                  />
                  <div className="text-center">
                    <h1 className="text-2xl font-black text-slate-900 leading-tight">{school.nameBn}</h1>
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">{school.nameEn}</h2>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1">{school.addressBn} • EIIN: {school.eiin} • ফোন: {school.phone}</p>
                <div className="inline-block mt-3 px-6 py-1.5 bg-indigo-900 text-white font-black text-xs uppercase tracking-widest rounded-full shadow-xs">
                  CHARACTER CERTIFICATE • চারিত্রিক সনদপত্র
                </div>
              </div>

              {/* Serial & Date Bar */}
              <div className="flex justify-between items-center text-xs text-slate-600 py-3 border-b border-dashed border-slate-300 relative z-10 font-mono">
                <span>সনদ নং / Certificate No: <strong className="text-indigo-950 font-bold">{certificateSerial.replace(/^AC/, 'CC')}</strong></span>
                <span>প্রদানের তারিখ / Date: <strong className="text-slate-900 font-bold">{issueDate}</strong></span>
              </div>

              {/* Certificate Body Paragraphs */}
              <div className="my-8 space-y-5 text-[14px] leading-loose text-slate-800 text-justify relative z-10">
                <p className="indent-10">
                  This is to certify that <strong className="text-slate-950 font-black text-base underline decoration-slate-400 underline-offset-4">{student.nameEn}</strong>{' '}
                  <span className="font-semibold text-slate-700">({student.nameBn})</span>, son / daughter of{' '}
                  <strong className="text-slate-950 font-bold">{student.fatherNameEn}</strong> and{' '}
                  <strong className="text-slate-950 font-bold">{student.motherNameEn}</strong>, is a student of this school in{' '}
                  <strong className="text-slate-950 font-bold">{student.className}</strong>
                  {['Class 9', 'Class 10'].includes(student.className) && (
                    <span> (Group: <strong className="text-indigo-900 font-bold">{formatGroupName(student.group || 'Science', language)}</strong>)</span>
                  )}{' '}, Section <strong className="text-slate-950 font-bold">{student.section}</strong>, Class Roll <strong className="text-slate-950 font-mono font-bold">{student.roll}</strong>, Student ID <strong className="text-indigo-950 font-mono font-bold">{student.studentId}</strong>.
                </p>

                <p className="indent-10">
                  To the best of my knowledge and according to our institutional registers, he / she bears a sublime moral character, exhibits disciplined demeanour, and possesses polite manners. He / She has never been found engaged in any activity detrimental to the discipline of this institution or the laws of the country.
                </p>

                <p className="indent-10">
                  I wish him / her all success in his / her life and higher academic pursuits.
                </p>
              </div>
            </div>

            {/* Bottom Official Signatures & Seal */}
            <div className="pt-8 border-t-2 border-indigo-950 relative z-10">
              <div className="grid grid-cols-3 items-end text-center text-xs">
                <div>
                  <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-800">
                    Prepared By
                  </div>
                  <span className="text-[10px] text-slate-500 block">নথিপত্র নিরীক্ষক</span>
                </div>

                <div className="flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-400 flex flex-col items-center justify-center text-[8px] text-slate-400 text-center uppercase p-1">
                    <span>SEAL</span>
                    <span className="text-[6.5px]">প্রাতিষ্ঠানিক সীল</span>
                  </div>
                </div>

                <div>
                  <div className="border-b border-slate-700 pb-0.5">
                    <PrincipalSignatureDisplay
                      school={school}
                      fallbackText="Principal / Head Teacher"
                      heightClass="h-11"
                      imgClassName="max-h-10 max-w-[165px] object-contain mx-auto"
                      textClassName="font-serif italic font-black text-sm text-indigo-950 truncate"
                    />
                  </div>
                  <div className="pt-1 font-bold text-slate-900">
                    Principal / Headmaster
                  </div>
                  {school.principalSignatureUrl && (school.principalNameEn || school.principalNameBn) && (
                    <span className="text-[10px] font-semibold text-slate-700 block truncate">
                      {school.principalNameEn || school.principalNameBn}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 block">প্রধান শিক্ষক / অধ্যক্ষ</span>
                </div>
              </div>

              <div className="mt-6 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400 font-mono">
                {certSize === 'fourteen_by_eleven' ? '14" × 11" Institutional Certificate Standard' : 'ISO A4 Standard Certificate'} • {school.nameEn} • Verification Helpline: {school.phone}
              </div>
            </div>
          </div>
        )}

        {/* 6. BONAFIDE STUDENT CERTIFICATE (CLASSIC FORMAL FALLBACK) */}
        {docType === 'bonafide' && certTemplate === 'classic' && (
          <div
            className={`a4-certificate-sheet w-full ${
              certSize === 'fourteen_by_eleven'
                ? 'max-w-[355mm] min-h-[279mm] p-8 sm:p-14'
                : 'max-w-[285mm] min-h-[195mm] p-6 sm:p-10'
            } bg-white rounded-none sm:rounded-2xl shadow-2xl border-[8px] border-double border-emerald-950 ring-2 ring-emerald-900 text-slate-900 print:shadow-none print:border-4 print:border-emerald-950 flex flex-col justify-between relative mx-auto my-0`}
          >
            {/* Watermark Logo */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
              <img
                src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                alt=""
                className="w-80 h-80 object-contain"
              />
            </div>

            {/* Header */}
            <div>
              <div className="text-center pb-5 border-b-2 border-emerald-950 relative z-10">
                <div className="flex items-center justify-center space-x-3 mb-2">
                  <img
                    src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="School Logo"
                    className="w-16 h-16 object-contain"
                  />
                  <div className="text-center">
                    <h1 className="text-2xl font-black text-slate-900 leading-tight">{school.nameBn}</h1>
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">{school.nameEn}</h2>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1">{school.addressBn} • EIIN: {school.eiin} • ফোন: {school.phone}</p>
                <div className="inline-block mt-3 px-6 py-1.5 bg-emerald-900 text-white font-black text-xs uppercase tracking-widest rounded-full shadow-xs">
                  BONAFIDE STUDENT CERTIFICATE • অধ্যয়নরত প্রত্যয়নপত্র
                </div>
              </div>

              {/* Serial & Date Bar */}
              <div className="flex justify-between items-center text-xs text-slate-600 py-3 border-b border-dashed border-slate-300 relative z-10 font-mono">
                <span>স্মারক / Ref No: <strong className="text-emerald-950 font-bold">{certificateSerial.replace(/^AC/, 'BON')}</strong></span>
                <span>প্রদানের তারিখ / Date: <strong className="text-slate-900 font-bold">{issueDate}</strong></span>
              </div>

              {/* Certificate Body Paragraphs */}
              <div className="my-8 space-y-5 text-[14px] leading-loose text-slate-800 text-justify relative z-10">
                <div className="text-center font-bold tracking-wider text-xs text-slate-700 uppercase pb-2">
                  TO WHOM IT MAY CONCERN
                </div>

                <p className="indent-10">
                  This is to certify that <strong className="text-slate-950 font-black text-base underline decoration-slate-400 underline-offset-4">{student.nameEn}</strong>{' '}
                  <span className="font-semibold text-slate-700">({student.nameBn})</span>, son / daughter of{' '}
                  <strong className="text-slate-950 font-bold">{student.fatherNameEn}</strong> and{' '}
                  <strong className="text-slate-950 font-bold">{student.motherNameEn}</strong>, is a regular and bonafide student of this institution.
                </p>

                <p className="indent-10">
                  He / She is presently studying in <strong className="text-slate-950 font-bold">{student.className}</strong>
                  {['Class 9', 'Class 10'].includes(student.className) && (
                    <span> (Group: <strong className="text-emerald-900 font-bold">{formatGroupName(student.group || 'Science', language)}</strong>)</span>
                  )}{' '}, Section <strong className="text-slate-950 font-bold">{student.section}</strong>, Class Roll <strong className="text-slate-950 font-mono font-bold">{student.roll}</strong>, Student ID <strong className="text-emerald-950 font-mono font-bold">{student.studentId}</strong> for the current academic session <strong className="text-slate-950 font-bold">{student.session || school.currentSession || '2026'}</strong>.
                </p>

                <p className="indent-10">
                  As per school admission register, his / her recorded date of birth is <strong className="text-slate-950 font-mono font-bold">{student.dob}</strong>. This certificate is issued upon the specific prayer of his / her legal guardian for official verification, passport, bank account, or scholarship purposes.
                </p>
              </div>
            </div>

            {/* Bottom Official Signatures & Seal */}
            <div className="pt-8 border-t-2 border-emerald-950 relative z-10">
              <div className="grid grid-cols-3 items-end text-center text-xs">
                <div>
                  <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-800">
                    Prepared By
                  </div>
                  <span className="text-[10px] text-slate-500 block">যাচাইকারী কর্মকর্তা</span>
                </div>

                <div className="flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-400 flex flex-col items-center justify-center text-[8px] text-slate-400 text-center uppercase p-1">
                    <span>SEAL</span>
                    <span className="text-[6.5px]">বিদ্যালয়ের সীল</span>
                  </div>
                </div>

                <div>
                  <div className="border-b border-slate-700 pb-0.5">
                    <PrincipalSignatureDisplay
                      school={school}
                      fallbackText="Principal / Head Teacher"
                      heightClass="h-11"
                      imgClassName="max-h-10 max-w-[165px] object-contain mx-auto"
                      textClassName="font-serif italic font-black text-sm text-emerald-950 truncate"
                    />
                  </div>
                  <div className="pt-1 font-bold text-slate-900">
                    Principal / Headmaster
                  </div>
                  {school.principalSignatureUrl && (school.principalNameEn || school.principalNameBn) && (
                    <span className="text-[10px] font-semibold text-slate-700 block truncate">
                      {school.principalNameEn || school.principalNameBn}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 block">প্রধান শিক্ষক / অধ্যক্ষ</span>
                </div>
              </div>

              <div className="mt-6 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400 font-mono">
                {certSize === 'fourteen_by_eleven' ? '14" × 11" Institutional Certificate Standard' : 'ISO A4 Standard Certificate'} • {school.nameEn} • Verification Helpline: {school.phone}
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};
