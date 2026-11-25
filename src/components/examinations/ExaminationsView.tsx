import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSchool } from '../../context/SchoolContext';
import { StorageService } from '../../services/storage';
import {
  calculateSubjectGrade,
  calculateTotalGPA,
  calculateCombinedCGPA,
  CombinedPassPolicy,
  ExamGPABreakdown,
} from '../../utils/grading';
import { Exam, MarksEntry, Student, Subject, ExamScheduleItem, ClassLevel, ClassInfo } from '../../types';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { formatGroupName } from '../../utils/i18n';
import { compareStudentsByRoll } from '../../utils/studentSort';
import {
  getManagedClassList,
  getManagedClassNames,
  getSectionsForClass,
  classHasGroups,
  isEarlyChildhoodClass,
  formatClassOptionLabel,
} from '../../utils/academicClasses';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';
import { ClassTeacherSignatureDisplay } from '../common/ClassTeacherSignatureDisplay';
import { buildPrincipalSignatureHtml, buildClassTeacherSignatureHtml } from '../../utils/signatureHelper';
import { computeClassExamMeritMap } from '../../utils/examMeritHelper';
import { compressSignatureImage } from '../../utils/storageHelper';
import {
  MarksheetLanguageMode,
  buildMarksheetsPrintableHtml,
} from '../../utils/marksheetLocale';
import { OfficialMarksheetSheet } from './OfficialMarksheetSheet';
import { DigitInput } from '../common/DigitInput';
import {
  Award,
  Search,
  Plus,
  Printer,
  CheckCircle,
  FileText,
  TrendingUp,
  Table,
  Eye,
  Sliders,
  Check,
  X,
  BookOpen,
  Calendar,
  Clock,
  CreditCard,
  Sparkles,
  Building,
  Trash2,
  Edit2,
  AlertCircle,
  FileCheck,
  Trophy,
  Medal,
  CheckCircle2,
  Scissors,
  Layers,
  Users,
  HelpCircle,
  Save,
  Lock,
  Unlock,
  User,
  Zap,
  CheckSquare,
  Grid,
  List,
  LayoutGrid,
  GraduationCap,
  Download,
  FileSpreadsheet,
  Send,
  ShieldCheck,
  RotateCcw,
  PenTool,
} from 'lucide-react';
import {
  AdmitCardTemplate,
  AdmitCardFormat,
  InstructionMode,
  TableDensity,
} from '../certificates/AdmitCardTemplate';
import { ExamSeatPlanTab } from './ExamSeatPlanTab';
import { MeritPromotionModal } from './MeritPromotionModal';
import {
  buildSuperAdminPublishMeta,
  buildTeacherDraftMeta,
  getApprovalStatusBadgeInfo,
  isPublishedForStudents,
  isSuperAdminApprover,
  resolveEffectiveApprovalStatus,
} from '../../utils/approvalWorkflow';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';

// Helper to get subjects specifically matching a student's class and secondary stream (group)
export const getSubjectsForStudent = (
  student: Student,
  allClassSubjects: Subject[],
  academicClasses?: ClassInfo[]
): Subject[] => {
  if (!student) return allClassSubjects;
  const hasSecondaryGroups = academicClasses
    ? classHasGroups(student.className, academicClasses)
    : ['Class 9', 'Class 10'].includes(student.className);
  if (!hasSecondaryGroups) {
    return allClassSubjects;
  }
  const sGroup = (student.group || 'Science').toLowerCase();
  return allClassSubjects.filter((sub) => {
    if (!sub.group || sub.group === 'General') return true;
    const subGroup = sub.group.toLowerCase();
    if (sGroup.includes('science') && subGroup.includes('science')) return true;
    if ((sGroup.includes('commerce') || sGroup.includes('business')) && (subGroup.includes('commerce') || subGroup.includes('business'))) return true;
    if ((sGroup.includes('humanities') || sGroup.includes('arts')) && (subGroup.includes('humanities') || subGroup.includes('arts'))) return true;
    if (sGroup.includes('vocational') && subGroup.includes('vocational')) return true;
    return subGroup === sGroup;
  });
};

export type ExamSubTab =
  | 'exams'
  | 'exam_routine'
  | 'admit_cards'
  | 'seat_plan'
  | 'marks_entry'
  | 'report_cards'
  | 'tabulation'
  | 'merit_list';

interface ExaminationsViewProps {
  initialSubTab?: ExamSubTab;
  jumpNonce?: number;
}

export const ExaminationsView: React.FC<ExaminationsViewProps> = ({ initialSubTab, jumpNonce }) => {
  const { activeRole, currentUser } = useAuth();
  const { t, language, toBnNumber } = useLanguage();

  const resolveAuthorizedExamTab = (requested?: ExamSubTab): ExamSubTab => {
    if (!requested) return 'exam_routine';
    if (activeRole === 'teacher' && requested === 'admit_cards') return 'exam_routine';
    if (activeRole === 'student' && (requested === 'marks_entry' || requested === 'tabulation' || requested === 'merit_list' || requested === 'seat_plan')) {
      return 'exam_routine';
    }
    return requested;
  };

  const [activeTab, setActiveTab] = useState<ExamSubTab>(() => resolveAuthorizedExamTab(initialSubTab));

  useEffect(() => {
    if (jumpNonce && jumpNonce > 0 && initialSubTab) {
      setActiveTab(resolveAuthorizedExamTab(initialSubTab));
    }
  }, [jumpNonce, initialSubTab, activeRole]);

  const [academicClasses, setAcademicClasses] = useState<ClassInfo[]>(() => StorageService.getClasses());
  const activeClassInfos = React.useMemo(() => getManagedClassList(academicClasses), [academicClasses]);
  const activeClassNames = React.useMemo(() => getManagedClassNames(academicClasses), [academicClasses]);

  const [exams, setExams] = useState<Exam[]>(() => StorageService.getExams());
  const [selectedExamId, setSelectedExamId] = useState<string>(() => exams[0]?.id || 'ex_1');
  const [selectedClass, setSelectedClass] = useState<string>(() => {
    const initial = getManagedClassNames(StorageService.getClasses());
    return initial.includes('Class 10') ? 'Class 10' : initial[0] || 'Class 10';
  });
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('sub_10_ban');

  // Merit List Filters & Modal
  const [meritSection, setMeritSection] = useState<string>('all');
  const [meritShift, setMeritShift] = useState<string>('all');
  const [meritGroup, setMeritGroup] = useState<string>('all');
  const [showFormulaModal, setShowFormulaModal] = useState<boolean>(false);
  const [showMeritPromotionModal, setShowMeritPromotionModal] = useState<boolean>(false);
  const [promotionFeedback, setPromotionFeedback] = useState<string | null>(null);
  const [showMeritPrintModal, setShowMeritPrintModal] = useState<boolean>(false);
  const [meritPrintOrientation, setMeritPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [meritPrintIncludeFailed, setMeritPrintIncludeFailed] = useState<boolean>(true);
  const [meritPrintIncludeTop3, setMeritPrintIncludeTop3] = useState<boolean>(true);
  const [meritPrintIncludeSignatures, setMeritPrintIncludeSignatures] = useState<boolean>(true);
  const [meritPrintNotice, setMeritPrintNotice] = useState<string | null>(null);

  // Combined Multi-Exam Final CGPA Merit List State
  const [meritMode, setMeritMode] = useState<'combined' | 'single'>('single');
  const [meritSelectedExamIds, setMeritSelectedExamIds] = useState<string[]>(() =>
    exams.map((e) => e.id)
  );
  const [useCustomExamWeights, setUseCustomExamWeights] = useState<boolean>(false);
  const [meritExamWeights, setMeritExamWeights] = useState<Record<string, number>>({});
  const [combinedPassPolicy, setCombinedPassPolicy] =
    useState<CombinedPassPolicy>('cumulative_cgpa');

  const students = StorageService.getStudents();
  const subjects = StorageService.getSubjects();
  const staffList = StorageService.getStaff();
  const [allMarks, setAllMarks] = useState<MarksEntry[]>(() => StorageService.getMarks());
  const [examRoutines, setExamRoutines] = useState<ExamScheduleItem[]>(() => StorageService.getExamRoutines());
  const [, setSyncTick] = useState<number>(0);

  useEffect(() => {
    const handleSync = () => {
      const latestExams = StorageService.getExams();
      setAcademicClasses(StorageService.getClasses());
      setExams(latestExams);
      setAllMarks(StorageService.getMarks());
      setExamRoutines(StorageService.getExamRoutines());
      setMeritSelectedExamIds((prev) => {
        const validSet = new Set(latestExams.map((e) => e.id));
        const kept = prev.filter((id) => validSet.has(id));
        if (kept.length === 0) return latestExams.map((e) => e.id);
        return kept;
      });
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

  useEffect(() => {
    if (activeRole === 'student') return;
    if (activeClassNames.length > 0 && !activeClassNames.includes(selectedClass as ClassLevel)) {
      setSelectedClass(activeClassNames[0]);
    }
  }, [activeClassNames, selectedClass, activeRole]);

  // Routine Modal state
  const [showRoutineModal, setShowRoutineModal] = useState<boolean>(false);
  const [editingRoutineItem, setEditingRoutineItem] = useState<ExamScheduleItem | null>(null);
  const [routineSubjectId, setRoutineSubjectId] = useState<string>('');
  const [routineDate, setRoutineDate] = useState<string>('2026-06-15');
  const [routineDay, setRoutineDay] = useState<string>('Monday');
  const [routineStartTime, setRoutineStartTime] = useState<string>('10:00 AM');
  const [routineEndTime, setRoutineEndTime] = useState<string>('01:00 PM');
  const [routineRoom, setRoutineRoom] = useState<string>('Room 201');

  // Smart Auto Exam Routine Generator State
  const [showAutoRoutineModal, setShowAutoRoutineModal] = useState<boolean>(false);
  const [autoRoutineExamId, setAutoRoutineExamId] = useState<string>('');
  const [autoRoutineTargetClass, setAutoRoutineTargetClass] = useState<ClassLevel | 'all'>('Class 9');
  const [autoRoutineStartDate, setAutoRoutineStartDate] = useState<string>('2026-03-05');
  const [autoRoutineEndDate, setAutoRoutineEndDate] = useState<string>('2026-03-20');
  const [autoRoutineStartTime, setAutoRoutineStartTime] = useState<string>('10:00 AM');
  const [autoRoutineEndTime, setAutoRoutineEndTime] = useState<string>('01:00 PM');
  const [autoRoutineRoom, setAutoRoutineRoom] = useState<string>('মূল কেন্দ্র / Room 201');
  const [autoRoutineSkipFridays, setAutoRoutineSkipFridays] = useState<boolean>(true);
  const [autoRoutineSkipSaturdays, setAutoRoutineSkipSaturdays] = useState<boolean>(() => StorageService.isSaturdayOff());
  const [autoRoutineSkipHolidays, setAutoRoutineSkipHolidays] = useState<boolean>(true);
  const [autoRoutineParallelGroup, setAutoRoutineParallelGroup] = useState<boolean>(true);
  const [autoRoutineHasGaps, setAutoRoutineHasGaps] = useState<boolean>(false);
  const [routineViewMode, setRoutineViewMode] = useState<'date_grouped' | 'table_list'>('date_grouped');
  const [showRoutinePrintModal, setShowRoutinePrintModal] = useState<boolean>(false);

  // Admit Card selection state
  const [selectedAdmitCardStudentId, setSelectedAdmitCardStudentId] = useState<string>('');
  const [showPrintAllAdmitCards, setShowPrintAllAdmitCards] = useState<boolean>(false);
  const [admitFormat, setAdmitFormat] = useState<AdmitCardFormat>('a4_full');
  const [admitTwoPerPageMode, setAdmitTwoPerPageMode] = useState<'duplicate' | 'two_students'>('duplicate');
  const [admitDensity, setAdmitDensity] = useState<TableDensity>('auto');
  const [admitInstructionMode, setAdmitInstructionMode] = useState<InstructionMode>('auto' as any);

  // Marksheet Modal State (Single & Whole-Class Bulk Print + Bilingual/English Toggle)
  const [showTranscriptModal, setShowTranscriptModal] = useState<boolean>(false);
  const [transcriptStudent, setTranscriptStudent] = useState<Student | null>(null);
  const [marksheetBulkMode, setMarksheetBulkMode] = useState<boolean>(false);
  const [marksheetLangMode, setMarksheetLangMode] = useState<MarksheetLanguageMode>('bilingual');
  const [reportCardSectionFilter, setReportCardSectionFilter] = useState<string>('all');
  const [marksheetPrintNotice, setMarksheetPrintNotice] = useState<string | null>(null);
  const [showTranscriptSigEditor, setShowTranscriptSigEditor] = useState<boolean>(false);
  const [transcriptClassTeacherNameDraft, setTranscriptClassTeacherNameDraft] = useState<string>('');

  // Exam Modal (Add / Edit)
  const [showAddExamModal, setShowAddExamModal] = useState<boolean>(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [newExamNameEn, setNewExamNameEn] = useState<string>('');
  const [newExamNameBn, setNewExamNameBn] = useState<string>('');
  const [newExamTerm, setNewExamTerm] = useState<any>('half_yearly');
  const [newExamStart, setNewExamStart] = useState<string>('2026-06-15');
  const [newExamEnd, setNewExamEnd] = useState<string>('2026-06-30');

  // Explicit Mark Entry Save & Edit Mode State
  const [isEditingMarks, setIsEditingMarks] = useState<boolean>(true);
  const [marksSaveStatus, setMarksSaveStatus] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const isApprover = isSuperAdminApprover(activeRole);
  const isStudentViewer = activeRole === 'student' || activeRole === 'guardian';
  const actorName = currentUser?.nameBn || currentUser?.name || (isApprover ? 'Super Admin' : 'Teacher');

  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{
    kind: 'exam_routine' | 'marks';
    examId: string;
    itemIds?: string[];
    subjectId?: string;
    label: string;
  } | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');

  const showWorkflowNotice = (msg: string) => {
    setWorkflowNotice(msg);
    setTimeout(() => setWorkflowNotice(null), 4500);
  };

  const canManage =
    (activeRole === 'super_admin' ||
      activeRole === 'admin' ||
      activeRole === 'master_admin' ||
      activeRole === 'teacher') &&
    currentUser?.permissions?.manageExams !== false;
  const { schoolProfile, updateSchoolProfile } = useSchool();
  const school = schoolProfile;

  useEffect(() => {
    if (transcriptStudent) {
      const existing =
        school.classTeacherSignatures?.[transcriptStudent.className]?.name ||
        school.classTeacherName ||
        '';
      setTranscriptClassTeacherNameDraft(existing);
    }
  }, [transcriptStudent, school.classTeacherSignatures, school.classTeacherName]);

  const handleSaveMarksExplicit = () => {
    if (!currentSubject) return;
    const meta = isApprover
      ? buildSuperAdminPublishMeta(actorName)
      : buildTeacherDraftMeta(currentUser, 'draft');
    const currentSubjectEntries = allMarks
      .filter((m) => m.examId === selectedExamId && m.subjectId === currentSubject.id)
      .map((m) => ({
        ...m,
        className: m.className || selectedClass,
        ...meta,
      }));
    if (currentSubjectEntries.length > 0) {
      StorageService.saveMarksBatch(currentSubjectEntries);
      setAllMarks(StorageService.getMarks());
    }
    const now = new Date().toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLastSavedTime(now);
    setMarksSaveStatus('saved');
    setTimeout(() => {
      setMarksSaveStatus(null);
    }, 4000);
  };

  const handleSubmitMarksForApproval = () => {
    if (!currentSubject) return;
    const currentEntries = allMarks.filter(
      (m) => m.examId === selectedExamId && m.subjectId === currentSubject.id
    );
    if (currentEntries.length === 0) {
      showWorkflowNotice(
        language === 'bn'
          ? 'প্রথমে অন্তত একজন শিক্ষার্থীর নম্বর এন্ট্রি করে সংরক্ষণ করুন।'
          : 'Please enter marks for at least one student first.'
      );
      return;
    }
    const count = StorageService.submitMarksDraft(selectedExamId, currentSubject.id, {
      name: actorName,
      id: currentUser?.id,
    });
    setAllMarks(StorageService.getMarks());
    showWorkflowNotice(
      language === 'bn'
        ? `${currentSubject.nameBn || currentSubject.nameEn}-এর ${toBnNumber(count)}টি নম্বর খসড়া সুপার অ্যাডমিনের অনুমোদনের জন্য পাঠানো হয়েছে!`
        : `Submitted ${count} mark entries for SuperAdmin approval!`
    );
  };

  const handleApproveSubjectMarks = (subjectId: string | 'all', alsoPublishExam = false) => {
    if (!isApprover) return;
    const count = StorageService.approveMarksEntries(
      selectedExamId,
      subjectId,
      actorName,
      alsoPublishExam
    );
    setAllMarks(StorageService.getMarks());
    setExams(StorageService.getExams());
    showWorkflowNotice(
      language === 'bn'
        ? `${toBnNumber(count)}টি নম্বর এন্ট্রি অনুমোদন ও প্রকাশ করা হয়েছে।`
        : `${count} mark entries approved & published.`
    );
  };

  // Handle open add exam
  const handleOpenAddExam = () => {
    setEditingExam(null);
    setNewExamNameEn('');
    setNewExamNameBn('');
    setNewExamTerm('half_yearly');
    setNewExamStart('2026-06-15');
    setNewExamEnd('2026-06-30');
    setShowAddExamModal(true);
  };

  // Handle open edit exam
  const handleOpenEditExam = (exam: Exam) => {
    setEditingExam(exam);
    setNewExamNameEn(exam.nameEn);
    setNewExamNameBn(exam.nameBn);
    setNewExamTerm(exam.term);
    setNewExamStart(exam.startDate);
    setNewExamEnd(exam.endDate);
    setShowAddExamModal(true);
  };

  // Handle delete exam
  const handleDeleteExam = (exam: Exam) => {
    if (!canManage) return;
    const confirmMsg = language === 'bn'
      ? `আপনি কি নিশ্চিত যে "${exam.nameBn || exam.nameEn}" পরীক্ষাটি মুছে ফেলতে চান? এর সাথে যুক্ত সকল পরীক্ষার রুটিনও মুছে যাবে।`
      : `Are you sure you want to delete "${exam.nameEn}"? All scheduled routines for this exam will also be deleted.`;
    
    if (window.confirm(confirmMsg)) {
      StorageService.deleteExam(exam.id);
      const remaining = StorageService.getExams();
      setExams(remaining);
      setExamRoutines(StorageService.getExamRoutines());
      if (selectedExamId === exam.id) {
        if (remaining.length > 0) {
          setSelectedExamId(remaining[0].id);
        }
      }
    }
  };

  // Apply quick exam preset in modal
  const handleApplyExamPreset = (nameEn: string, nameBn: string, term: any, start: string, end: string) => {
    setNewExamNameEn(nameEn);
    setNewExamNameBn(nameBn);
    setNewExamTerm(term);
    setNewExamStart(start);
    setNewExamEnd(end);
  };

  // Current selected exam
  const currentExam = exams.find((e) => e.id === selectedExamId) || exams[0];

  // Identify student if student role is active
  const authenticatedStudent: Student | undefined = React.useMemo(() => {
    if (activeRole === 'student') {
      return (
        students.find((s) => s.id === currentUser?.linkedStudentId) ||
        students.find((s) => s.nameEn.toLowerCase() === (currentUser?.name || '').toLowerCase()) ||
        students.find((s) => s.id === 'std_1') ||
        students[0]
      );
    }
    return undefined;
  }, [activeRole, currentUser, students]);

  React.useEffect(() => {
    if (activeRole === 'student') {
      if (authenticatedStudent) {
        setSelectedClass(authenticatedStudent.className);
        setSelectedAdmitCardStudentId(authenticatedStudent.id);
      }
      if (
        activeTab === 'tabulation' ||
        activeTab === 'merit_list' ||
        activeTab === 'marks_entry' ||
        activeTab === 'seat_plan'
      ) {
        setActiveTab('report_cards');
      }
    }
  }, [activeRole, authenticatedStudent, activeTab]);

  // Students for selected class (or for student role, restricted to self)
  const classStudents = React.useMemo(() => {
    if (activeRole === 'student' && authenticatedStudent) {
      return [authenticatedStudent];
    }
    return students
      .filter((s) => s.className === selectedClass && s.status === 'active')
      .sort(compareStudentsByRoll);
  }, [students, selectedClass, activeRole, authenticatedStudent]);

  const reportCardSectionOptions = React.useMemo(() => {
    const set = new Set<string>();
    classStudents.forEach((s) => {
      if (s.section) set.add(s.section);
    });
    return Array.from(set).sort();
  }, [classStudents]);

  React.useEffect(() => {
    setReportCardSectionFilter('all');
  }, [selectedClass]);

  const filteredReportCardStudents = React.useMemo(() => {
    if (reportCardSectionFilter === 'all') return classStudents;
    return classStudents.filter((s) => s.section === reportCardSectionFilter);
  }, [classStudents, reportCardSectionFilter]);

  // Subjects for selected class
  const classSubjects = subjects.filter((s) => s.className === selectedClass);
  const currentSubject = subjects.find((s) => s.id === selectedSubjectId) || classSubjects[0];

  // Handle Mark Entry Change
  const handleMarkChange = (studentId: string, field: 'written' | 'mcq' | 'practical', value: number) => {
    if (!canManage || !currentSubject) return;
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;

    const existingIndex = allMarks.findIndex(
      (m) => m.examId === selectedExamId && m.studentId === studentId && m.subjectId === currentSubject.id
    );

    const draftMeta = isApprover
      ? buildSuperAdminPublishMeta(actorName)
      : buildTeacherDraftMeta(currentUser, 'draft');

    let entry: MarksEntry;
    if (existingIndex >= 0) {
      entry = {
        ...allMarks[existingIndex],
        className: allMarks[existingIndex].className || selectedClass,
        [field]: safeValue,
        ...draftMeta,
      };
    } else {
      entry = {
        id: `m_${Date.now()}_${studentId}`,
        examId: selectedExamId,
        studentId,
        className: selectedClass,
        subjectId: currentSubject.id,
        subjectName: currentSubject.nameEn,
        written: 0,
        mcq: 0,
        practical: 0,
        total: 0,
        grade: 'F',
        gpa: 0,
        [field]: safeValue,
        ...draftMeta,
      };
    }

    const total = entry.written + entry.mcq + entry.practical;
    const gradeInfo = calculateSubjectGrade(total, currentSubject.fullMarks);
    entry.total = total;
    entry.grade = gradeInfo.grade;
    entry.gpa = gradeInfo.gpa;

    StorageService.saveMarksBatch([entry]);
    setAllMarks(StorageService.getMarks());
  };

  const getStudentMarkForSubject = (studentId: string, subjectId: string): MarksEntry | undefined => {
    const found = allMarks.find(
      (m) => m.examId === selectedExamId && m.studentId === studentId && m.subjectId === subjectId
    );
    if (found && isStudentViewer && !isPublishedForStudents(found.approvalStatus)) {
      return undefined;
    }
    return found;
  };

  // Toggle publish status (SuperAdmin only)
  const handleTogglePublish = (exam: Exam) => {
    if (!canManage || !isApprover) return;
    const nextPublished = !exam.isPublished;
    if (nextPublished) {
      StorageService.approveMarksEntries(exam.id, 'all', actorName, true);
      setAllMarks(StorageService.getMarks());
    }
    const updated = { ...exam, isPublished: nextPublished };
    StorageService.saveExam(updated);
    setExams(StorageService.getExams());
  };

  const handleCreateExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamNameEn) return;

    if (editingExam) {
      const updatedExam: Exam = {
        ...editingExam,
        nameEn: newExamNameEn,
        nameBn: newExamNameBn || newExamNameEn,
        term: newExamTerm,
        startDate: newExamStart,
        endDate: newExamEnd,
      };
      StorageService.saveExam(updatedExam);
      setExams(StorageService.getExams());
      setShowAddExamModal(false);
      setEditingExam(null);
    } else {
      const exam: Exam = {
        id: `ex_${Date.now()}`,
        nameEn: newExamNameEn,
        nameBn: newExamNameBn || newExamNameEn,
        term: newExamTerm,
        session: '2026',
        startDate: newExamStart,
        endDate: newExamEnd,
        isPublished: false,
        applicableClasses: activeClassNames,
      };
      StorageService.saveExam(exam);
      setExams(StorageService.getExams());
      setShowAddExamModal(false);
      setSelectedExamId(exam.id);
    }
  };

  // Current class routines (strictly filter unpublished teacher drafts from students/guardians)
  const rawClassRoutines = StorageService.getRoutinesForClassAndExam(
    selectedExamId,
    selectedClass as ClassLevel
  );
  const currentClassRoutines = isStudentViewer
    ? rawClassRoutines.filter((r) => isPublishedForStudents(r.approvalStatus))
    : rawClassRoutines;

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const daysOfWeekBn: Record<string, string> = {
    Sunday: 'রবিবার',
    Monday: 'সোমবার',
    Tuesday: 'মঙ্গলবার',
    Wednesday: 'বুধবার',
    Thursday: 'বৃহস্পতিবার',
    Friday: 'শুক্রবার',
    Saturday: 'শনিবার',
  };

  const handleOpenAddRoutine = () => {
    setEditingRoutineItem(null);
    const firstSub = classSubjects[0];
    setRoutineSubjectId(firstSub?.id || '');
    setRoutineDate(currentExam?.startDate || '2026-06-15');
    const d = new Date(currentExam?.startDate || '2026-06-15');
    setRoutineDay(daysOfWeek[d.getDay()] || 'Monday');
    setRoutineStartTime('10:00 AM');
    const isEarly = isEarlyChildhoodClass(selectedClass);
    setRoutineEndTime(isEarly ? '11:30 AM' : '01:00 PM');
    setRoutineRoom(isEarly ? `${selectedClass} Hall` : 'Room 201');
    setShowRoutineModal(true);
  };

  const handleOpenEditRoutine = (item: ExamScheduleItem) => {
    setEditingRoutineItem(item);
    const sub = subjects.find((s) => s.className === item.className && (s.code === item.subjectCode || s.nameEn === item.subjectNameEn));
    setRoutineSubjectId(sub?.id || '');
    setRoutineDate(item.examDate);
    setRoutineDay(item.dayOfWeek || 'Monday');
    setRoutineStartTime(item.startTime);
    setRoutineEndTime(item.endTime);
    setRoutineRoom(item.roomNo || 'Room 201');
    setShowRoutineModal(true);
  };

  const handleSaveRoutineItem = (e: React.FormEvent) => {
    e.preventDefault();
    const sub = subjects.find((s) => s.id === routineSubjectId) || classSubjects[0];
    if (!sub) return;
    const approvalMeta = isApprover
      ? buildSuperAdminPublishMeta(actorName)
      : buildTeacherDraftMeta(currentUser, 'draft');

    if (editingRoutineItem) {
      const updated: ExamScheduleItem = {
        ...editingRoutineItem,
        subjectCode: sub.code,
        subjectNameEn: sub.nameEn,
        subjectNameBn: sub.nameBn,
        examDate: routineDate,
        dayOfWeek: routineDay,
        startTime: routineStartTime,
        endTime: routineEndTime,
        roomNo: routineRoom,
        ...approvalMeta,
      };
      StorageService.updateExamRoutineItem(updated);
    } else {
      const newItem: ExamScheduleItem = {
        id: `er_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        examId: selectedExamId,
        className: selectedClass as ClassLevel,
        subjectCode: sub.code,
        subjectNameEn: sub.nameEn,
        subjectNameBn: sub.nameBn,
        examDate: routineDate,
        dayOfWeek: routineDay,
        startTime: routineStartTime,
        endTime: routineEndTime,
        roomNo: routineRoom,
        ...approvalMeta,
      };
      StorageService.addExamRoutineItem(newItem);
    }
    setExamRoutines(StorageService.getExamRoutines());
    setShowRoutineModal(false);
    showWorkflowNotice(
      isApprover
        ? (language === 'bn' ? 'পরীক্ষার রুটিন অনুমোদন ও প্রকাশ করা হয়েছে।' : 'Exam routine published.')
        : (language === 'bn' ? 'পরীক্ষার রুটিন খসড়া হিসেবে সংরক্ষিত হয়েছে। সুপার অ্যাডমিনের অনুমোদনের জন্য পাঠান।' : 'Saved as exam routine draft.')
    );
  };

  const handleDeleteRoutineItem = (id: string) => {
    const target = examRoutines.find((r) => r.id === id);
    if (target && !isApprover && isPublishedForStudents(target.approvalStatus)) {
      showWorkflowNotice(
        language === 'bn'
          ? 'প্রকাশিত পরীক্ষার রুটিন সরাসরি মুছা যাবে না। এডিট করে খসড়া হিসেবে সুপার অ্যাডমিনের অনুমোদনে পাঠান।'
          : 'Published exam routines cannot be deleted directly by teachers.'
      );
      return;
    }
    StorageService.deleteExamRoutineItem(id);
    setExamRoutines(StorageService.getExamRoutines());
  };

  const handleOpenAutoRoutineModal = () => {
    setAutoRoutineExamId(selectedExamId);
    setAutoRoutineTargetClass(selectedClass as ClassLevel);
    if (currentExam) {
      setAutoRoutineStartDate(currentExam.startDate || '2026-03-05');
      setAutoRoutineEndDate(currentExam.endDate || '2026-03-20');
    }
    setShowAutoRoutineModal(true);
  };

  const handleApply1stModelTestPreset = () => {
    const modelExam = exams.find(
      (e) =>
        e.id === 'exam_1st_model_test_2026' ||
        e.nameEn.toLowerCase().includes('model test') ||
        e.nameBn.includes('মডেল টেস্ট')
    );
    if (modelExam) {
      setSelectedExamId(modelExam.id);
      setAutoRoutineExamId(modelExam.id);
    }
    setAutoRoutineStartDate('2026-03-05');
    setAutoRoutineEndDate('2026-03-20');
    setAutoRoutineStartTime('10:00 AM');
    setAutoRoutineEndTime('01:00 PM');
    setAutoRoutineSkipFridays(true);
    setAutoRoutineSkipSaturdays(true);
    setAutoRoutineSkipHolidays(true);
    setAutoRoutineParallelGroup(true);
    setAutoRoutineHasGaps(false);
    setAutoRoutineTargetClass(selectedClass as ClassLevel);
    setShowAutoRoutineModal(true);
  };

  const handleAutoGenerateRoutine = () => {
    handleOpenAutoRoutineModal();
  };

  const handleExecuteSmartRoutine = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetExamId = autoRoutineExamId || selectedExamId;
    const approvalMeta = isApprover
      ? buildSuperAdminPublishMeta(actorName)
      : buildTeacherDraftMeta(currentUser, 'draft');
    StorageService.generateSmartExamRoutine({
      examId: targetExamId,
      className: autoRoutineTargetClass,
      startDate: autoRoutineStartDate,
      endDate: autoRoutineEndDate,
      startTime: autoRoutineStartTime,
      endTime: autoRoutineEndTime,
      roomNo: autoRoutineRoom,
      skipFridays: autoRoutineSkipFridays,
      skipSaturdays: autoRoutineSkipSaturdays,
      skipHolidays: autoRoutineSkipHolidays,
      parallelGroupSubjects: autoRoutineParallelGroup,
      hasGapDays: autoRoutineHasGaps,
      overwriteExisting: true,
      approvalMeta,
    });
    setExamRoutines(StorageService.getExamRoutines());
    setShowAutoRoutineModal(false);
    showWorkflowNotice(
      isApprover
        ? (language === 'bn' ? 'স্মার্ট পরীক্ষার রুটিন তৈরি ও প্রকাশ করা হয়েছে।' : 'Exam routine generated and published.')
        : (language === 'bn' ? 'স্মার্ট পরীক্ষার রুটিন খসড়া তৈরি হয়েছে! অনুমোদনের জন্য সুপার অ্যাডমিনের কাছে পাঠান।' : 'Exam routine draft generated! Submit to SuperAdmin for approval.')
    );
  };

  const handleSubmitExamRoutineDrafts = () => {
    const draftIds = currentClassRoutines
      .filter((r) => r.approvalStatus === 'draft' || r.approvalStatus === 'rejected')
      .map((r) => r.id);
    if (draftIds.length === 0) return;
    const count = StorageService.submitExamRoutineDrafts(selectedExamId, draftIds, {
      name: actorName,
      id: currentUser?.id,
    });
    setExamRoutines(StorageService.getExamRoutines());
    showWorkflowNotice(
      language === 'bn'
        ? `${toBnNumber(count)}টি পরীক্ষার রুটিন খসড়া সুপার অ্যাডমিনের অনুমোদনের জন্য পাঠানো হয়েছে।`
        : `${count} exam routine draft(s) submitted for SuperAdmin approval.`
    );
  };

  const handleApproveExamRoutineItems = (itemIds: string[] | 'all') => {
    if (!isApprover) return;
    const count = StorageService.approveExamRoutines(selectedExamId, itemIds, actorName);
    setExamRoutines(StorageService.getExamRoutines());
    showWorkflowNotice(
      language === 'bn'
        ? `${toBnNumber(count)}টি পরীক্ষার রুটিন অনুমোদন ও প্রকাশ করা হয়েছে।`
        : `${count} exam routine item(s) approved & published.`
    );
  };

  const handleConfirmRejectDialog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isApprover || !rejectDialog) return;
    if (rejectDialog.kind === 'exam_routine' && rejectDialog.itemIds?.length) {
      StorageService.rejectExamRoutines(
        rejectDialog.examId,
        rejectDialog.itemIds,
        actorName,
        rejectReasonInput
      );
      setExamRoutines(StorageService.getExamRoutines());
    } else if (rejectDialog.kind === 'marks' && rejectDialog.subjectId) {
      StorageService.rejectMarksEntries(
        rejectDialog.examId,
        rejectDialog.subjectId,
        actorName,
        rejectReasonInput
      );
      setAllMarks(StorageService.getMarks());
    }
    setRejectDialog(null);
    setRejectReasonInput('');
    showWorkflowNotice(
      language === 'bn'
        ? 'সংশোধনের জন্য শিক্ষকের কাছে ফেরত পাঠানো হয়েছে।'
        : 'Returned to teacher for revision.'
    );
  };

  // Live preview working dates for modal
  const previewWorkingDates = React.useMemo(() => {
    return StorageService.getWorkingDatesForRange(
      autoRoutineStartDate,
      autoRoutineEndDate,
      autoRoutineSkipFridays,
      autoRoutineSkipSaturdays,
      autoRoutineSkipHolidays
    );
  }, [autoRoutineStartDate, autoRoutineEndDate, autoRoutineSkipFridays, autoRoutineSkipSaturdays, autoRoutineSkipHolidays]);

  // Live preview slots for modal
  const previewSlots = React.useMemo(() => {
    const targetCls = autoRoutineTargetClass === 'all' ? selectedClass : autoRoutineTargetClass;
    const clsSubjects = subjects.filter((s) => s.className === targetCls);
    if (clsSubjects.length === 0) return [];

    const isSecondaryGroupClass = classHasGroups(targetCls, academicClasses);
    const slots: { slotNumber: number; title: string; subjects: Subject[]; isParallel: boolean }[] = [];

    if (isSecondaryGroupClass && autoRoutineParallelGroup) {
      const compulsory = clsSubjects.filter((s) => !s.group || s.group.toLowerCase() === 'all');
      compulsory.forEach((sub) => {
        slots.push({
          slotNumber: slots.length + 1,
          title: `${sub.nameBn || sub.nameEn} (আবশ্যিক)`,
          subjects: [sub],
          isParallel: false,
        });
      });

      const scienceSubs = clsSubjects.filter((s) => s.group?.toLowerCase().includes('science'));
      const commerceSubs = clsSubjects.filter(
        (s) => s.group?.toLowerCase().includes('commerce') || s.group?.toLowerCase().includes('business')
      );
      const humanitiesSubs = clsSubjects.filter(
        (s) => s.group?.toLowerCase().includes('humanities') || s.group?.toLowerCase().includes('arts')
      );
      const vocationalSubs = clsSubjects.filter((s) => s.group?.toLowerCase().includes('vocational'));

      const maxGroupLen = Math.max(
        scienceSubs.length,
        commerceSubs.length,
        humanitiesSubs.length,
        vocationalSubs.length
      );

      for (let i = 0; i < maxGroupLen; i++) {
        const pSubs: Subject[] = [];
        if (scienceSubs[i]) pSubs.push(scienceSubs[i]);
        if (commerceSubs[i]) pSubs.push(commerceSubs[i]);
        if (humanitiesSubs[i]) pSubs.push(humanitiesSubs[i]);
        if (vocationalSubs[i]) pSubs.push(vocationalSubs[i]);

        if (pSubs.length > 0) {
          slots.push({
            slotNumber: slots.length + 1,
            title: `বিভাগীয় বিষয়সমূহ (${i + 1}) - একই তারিখে ৪ গ্রুপ`,
            subjects: pSubs,
            isParallel: true,
          });
        }
      }
    } else {
      clsSubjects.forEach((sub, idx) => {
        slots.push({
          slotNumber: idx + 1,
          title: sub.nameBn || sub.nameEn,
          subjects: [sub],
          isParallel: false,
        });
      });
    }

    return slots;
  }, [autoRoutineTargetClass, selectedClass, autoRoutineParallelGroup, subjects]);

  const handleOpenTranscript = (student: Student) => {
    setMarksheetBulkMode(false);
    setMarksheetPrintNotice(null);
    setTranscriptStudent(student);
    setShowTranscriptModal(true);
  };

  const handleOpenBulkMarksheets = () => {
    const first = filteredReportCardStudents[0] || classStudents[0] || null;
    if (!first) return;
    setMarksheetBulkMode(true);
    setMarksheetPrintNotice(null);
    setTranscriptStudent(first);
    setShowTranscriptSigEditor(false);
    setShowTranscriptModal(true);
  };

  const [routineGroupFilter, setRoutineGroupFilter] = useState<string>('all');

  const admitCardStudent = classStudents.find((s) => s.id === selectedAdmitCardStudentId) || classStudents[0];

  // Group-filtered routines for Routine Tab display
  const displayClassRoutines = currentClassRoutines.filter((item) => {
    if (!classHasGroups(selectedClass, academicClasses)) return true;
    if (routineGroupFilter === 'all') return true;
    if (routineGroupFilter === 'compulsory') return !item.group || item.group.toLowerCase() === 'all';
    return (
      !item.group ||
      item.group.toLowerCase() === 'all' ||
      item.group.toLowerCase().includes(routineGroupFilter.toLowerCase())
    );
  });

  // Group routines by date for modern parallel view
  const groupedRoutinesByDate = React.useMemo(() => {
    const map = new Map<string, ExamScheduleItem[]>();
    displayClassRoutines.forEach((r) => {
      if (!map.has(r.examDate)) {
        map.set(r.examDate, []);
      }
      map.get(r.examDate)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayClassRoutines]);

  // Routine filtered strictly for the specific student's group on Admit Card
  const admitCardRoutines = currentClassRoutines.filter((item) => {
    if (!admitCardStudent) return true;
    if (!classHasGroups(admitCardStudent.className, academicClasses)) return true;
    const sGroup = (admitCardStudent.group || 'Science').toLowerCase();
    // Compulsory subjects with no group or 'all' apply to all students
    if (!item.group || item.group.toLowerCase() === 'all') return true;
    const iGroup = item.group.toLowerCase();
    if (sGroup.includes('science') && iGroup.includes('science')) return true;
    if ((sGroup.includes('commerce') || sGroup.includes('business')) && (iGroup.includes('commerce') || iGroup.includes('business'))) return true;
    if ((sGroup.includes('humanities') || sGroup.includes('arts')) && (iGroup.includes('humanities') || iGroup.includes('arts'))) return true;
    if (sGroup.includes('vocational') && iGroup.includes('vocational')) return true;
    return iGroup === sGroup;
  });

  const examLauncherItems: LauncherTileItem[] = [
    {
      id: 'exams',
      label: language === 'bn' ? 'পরীক্ষার তালিকা' : 'Exams List',
      icon: Award,
      color: 'red',
      active: activeTab === 'exams',
      onClick: () => setActiveTab('exams'),
    },
    {
      id: 'exam_routine',
      label: language === 'bn' ? 'পরীক্ষার রুটিন' : 'Exam Routine',
      icon: Calendar,
      color: 'sky',
      active: activeTab === 'exam_routine',
      onClick: () => setActiveTab('exam_routine'),
    },
    ...(activeRole !== 'teacher'
      ? [
          {
            id: 'admit_cards',
            label: language === 'bn' ? 'প্রবেশপত্র' : 'Admit Cards',
            icon: CreditCard,
            color: 'green' as const,
            active: activeTab === 'admit_cards',
            onClick: () => setActiveTab('admit_cards'),
          },
        ]
      : []),
    ...(activeRole !== 'student'
      ? [
          {
            id: 'seat_plan',
            label: language === 'bn' ? 'আসন বিন্যাস' : 'Seat Plan',
            icon: LayoutGrid,
            color: 'purple' as const,
            active: activeTab === 'seat_plan',
            onClick: () => setActiveTab('seat_plan'),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            id: 'marks_entry',
            label: language === 'bn' ? 'নম্বর এন্ট্রি' : 'Marks Entry',
            icon: Edit2,
            color: 'blue' as const,
            active: activeTab === 'marks_entry',
            onClick: () => setActiveTab('marks_entry'),
          },
        ]
      : []),
    {
      id: 'report_cards',
      label: language === 'bn' ? 'মার্কশিট' : 'Report Cards',
      icon: FileCheck,
      color: 'green',
      active: activeTab === 'report_cards',
      onClick: () => setActiveTab('report_cards'),
    },
    ...(activeRole !== 'student'
      ? [
          {
            id: 'tabulation',
            label: language === 'bn' ? 'ট্যাবুলেশন শিট' : 'Tabulation',
            icon: Table,
            color: 'teal' as const,
            active: activeTab === 'tabulation',
            onClick: () => setActiveTab('tabulation'),
          },
          {
            id: 'merit_list',
            label: language === 'bn' ? 'মেধা তালিকা' : 'Merit List',
            icon: Trophy,
            color: 'amber' as const,
            active: activeTab === 'merit_list',
            onClick: () => setActiveTab('merit_list'),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* Sub-module Colorful Launcher Grid */}
      <LauncherIconGrid items={examLauncherItems} columns={5} />

      {/* Clean Compact Header & Contextual Actions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {language === 'bn' ? 'পরীক্ষা ও ফলাফল ব্যবস্থাপনা' : 'Examinations & Result Management'}
          </h2>
          <p className="text-xs text-slate-500">
            {language === 'bn'
              ? 'এনসিটিবি গ্রেডিং স্কেল (GPA 5.00), নম্বর এন্ট্রি, ট্রান্সক্রিপ্ট ও ট্যাবুলেশন শিট'
              : 'NCTB grading scale (GPA 5.00), marks entry, transcripts & master tabulation sheet'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && activeTab === 'exams' && (
            <button
              onClick={handleOpenAddExam}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'bn' ? 'নতুন পরীক্ষা তৈরি' : 'New Exam'}</span>
            </button>
          )}

          {canManage && activeTab === 'exam_routine' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={handleAutoGenerateRoutine}
                className="flex items-center space-x-1 px-3 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold"
                title="Auto generate routine with 2 days gap skipping Fridays"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>{language === 'bn' ? 'অটো জেনারেট' : 'Auto Generate'}</span>
              </button>
              <button
                onClick={handleOpenAddRoutine}
                className="flex items-center space-x-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>{language === 'bn' ? 'বিষয় যোগ' : 'Add Subject'}</span>
              </button>
              <button
                onClick={() => setShowRoutinePrintModal(true)}
                className="flex items-center space-x-1 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>{language === 'bn' ? 'রুটিন প্রিন্ট' : 'Print Routine'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Selector Bar for Exam, Class, and Subject */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Exam Selector */}
          <div className="flex items-center space-x-2">
            <Award className="w-4 h-4 text-blue-600" />
            <label className="font-semibold text-slate-700">Exam:</label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium text-slate-800"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {language === 'bn' ? ex.nameBn : ex.nameEn}
                </option>
              ))}
            </select>
          </div>

          {/* Class Selector - Synced with Academic Structure */}
          <div className="flex items-center space-x-2">
            <label className="font-semibold text-slate-700">Class:</label>
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                const sub = subjects.find((s) => s.className === e.target.value);
                if (sub) setSelectedSubjectId(sub.id);
                const std = students.find((s) => s.className === e.target.value && s.status === 'active');
                if (std) setSelectedAdmitCardStudentId(std.id);
              }}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-blue-800"
            >
              {activeClassInfos.map((cls) => (
                <option key={cls.id} value={cls.name}>
                  {formatClassOptionLabel(cls, language)}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Selector (if in marks entry mode) */}
          {activeTab === 'marks_entry' && (
            <div className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <label className="font-semibold text-slate-700">Subject:</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {classSubjects.map((sub) => {
                  let groupLabel = '';
                  if (sub.group === 'Science') groupLabel = ' [বিজ্ঞান / Science]';
                  else if (sub.group === 'Commerce') groupLabel = ' [ব্যবসায় শিক্ষা / Commerce]';
                  else if (sub.group === 'Humanities' || sub.group === 'Arts') groupLabel = ' [মানবিক / Humanities]';
                  else if (sub.group === 'Vocational') groupLabel = ' [কারিগরি / Vocational]';
                  else if (classHasGroups(selectedClass, academicClasses)) groupLabel = ' [বাধ্যতামূলক / Compulsory]';

                  return (
                    <option key={sub.id} value={sub.id}>
                      {sub.code} - {language === 'bn' ? (sub.nameBn || sub.nameEn) : sub.nameEn}{groupLabel} (Full: {sub.fullMarks})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        {/* Publication status */}
        <div className="flex items-center space-x-2 text-xs">
          {currentExam?.isPublished ? (
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center space-x-1">
              <Check className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'ফলাফল প্রকাশিত' : 'Result Published'}</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">
              {language === 'bn' ? 'খসড়া / অপ্রকাশিত' : 'Draft / Unpublished'}
            </span>
          )}
          {canManage && isApprover && (
            <button
              onClick={() => currentExam && handleTogglePublish(currentExam)}
              className="px-3 py-1 border border-slate-200 hover:bg-slate-50 rounded-lg font-semibold text-slate-700"
            >
              {currentExam?.isPublished ? 'Unpublish' : 'Publish Result'}
            </button>
          )}
        </div>
      </div>

      {/* Workflow Status Feedback Alert */}
      {workflowNotice && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{workflowNotice}</span>
          </div>
          <button onClick={() => setWorkflowNotice(null)} className="text-emerald-700 hover:text-emerald-950">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB: EXAM ROUTINE */}
      {activeTab === 'exam_routine' && (
        <div className="space-y-4">
          <div className="p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 text-white rounded-2xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-700/80 text-blue-100 text-[10px] font-extrabold uppercase tracking-wider">
                  {currentExam?.term || 'Official Exam'}
                </span>
                <span className="text-blue-300 text-xs font-semibold">
                  Session {currentExam?.session || '2026'}
                </span>
              </div>
              <h3 className="text-lg font-black mt-1">
                {currentExam?.nameEn} • {selectedClass} Exam Routine
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                {currentExam?.nameBn} • {selectedClass}-এর অফিসিয়াল পরীক্ষা রুটিন
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleApply1stModelTestPreset}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-md transition-all scale-100 hover:scale-[1.02]"
                title="১ম মডেল টেস্ট পরীক্ষা (০৫/০৩/২০২৬ - ২০/০৩/২০২৬) স্বয়ংক্রিয় রুটিন প্রিসেট"
              >
                <Zap className="w-4 h-4 text-slate-950 fill-current" />
                <span>{language === 'bn' ? '১ম মডেল টেস্ট (০৫-২০ মার্চ)' : '1st Model Test (05-20 Mar)'}</span>
              </button>
              {activeRole !== 'teacher' && (
                <button
                  onClick={() => setActiveTab('admit_cards')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  <CreditCard className="w-4 h-4 text-amber-300" />
                  <span>{language === 'bn' ? 'প্রবেশপত্র' : 'Admit Cards'}</span>
                </button>
              )}
              {canManage && (
                <>
                  <button
                    onClick={handleOpenAutoRoutineModal}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-800 hover:bg-blue-700 text-white border border-blue-500/80 rounded-xl text-xs font-bold transition-colors shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>{language === 'bn' ? 'স্মার্ট অটো জেনারেটর' : 'Smart Auto Generator'}</span>
                  </button>
                  <button
                    onClick={handleOpenAddRoutine}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{language === 'bn' ? '+ বিষয় যোগ' : '+ Add Subject'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bangladesh Curriculum Info Banner for Group-based Secondary Classes */}
          {classHasGroups(selectedClass, academicClasses) && (
            <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs print:hidden shadow-xs">
              <div className="flex items-start space-x-2.5">
                <span className="p-1.5 bg-blue-600 text-white rounded-lg shrink-0 mt-0.5">
                  <BookOpen className="w-4 h-4" />
                </span>
                <div>
                  <h5 className="font-bold text-blue-950">
                    {language === 'bn'
                      ? 'মাধ্যমিক কারিকুলাম সমন্বিত সমান্তরাল রুটিন (SSC Curriculum Parallel Slotting)'
                      : 'SSC Board Curriculum Parallel Exam Scheduling'}
                  </h5>
                  <p className="text-slate-600 mt-0.5">
                    {language === 'bn'
                      ? 'বিজ্ঞান, ব্যবসায় শিক্ষা, মানবিক ও ভোকেশনাল বিভাগের শিক্ষার্থীদের বিভাগীয় পরীক্ষা একই দিনে একই সময়ে অনুষ্ঠিত হয়। প্রবেশপত্রে প্রত্যেক শিক্ষার্থী শুধুমাত্র তার স্ব-স্ব বিভাগের বিষয় দেখতে পাবে।'
                      : 'Science, Commerce, Humanities, and Vocational departmental exams are held on the same date at the same time. Each student only takes their respective group exam.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0 self-end md:self-auto">
                <span className="text-[11px] font-bold text-slate-500">ভিউ মোড:</span>
                <div className="inline-flex rounded-xl p-0.5 bg-white border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setRoutineViewMode('date_grouped')}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      routineViewMode === 'date_grouped'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'তারিখভিত্তিক গ্রুপ' : 'Grouped'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutineViewMode('table_list')}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      routineViewMode === 'table_list'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'সাধারণ তালিকা' : 'Table List'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Exam Routine Teacher Draft -> SuperAdmin Approval Banner */}
          {(() => {
            const erDraftOrReturned = currentClassRoutines.filter(
              (r) => r.approvalStatus === 'draft' || r.approvalStatus === 'rejected'
            );
            const erPending = currentClassRoutines.filter((r) => r.approvalStatus === 'pending_approval');
            const erUnpublishedIds = currentClassRoutines
              .filter((r) => r.approvalStatus === 'pending_approval' || r.approvalStatus === 'draft')
              .map((r) => r.id);

            return (
              <>
                {canManage && !isApprover && (erDraftOrReturned.length > 0 || erPending.length > 0) && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
                    <div className="flex items-center space-x-2.5 text-amber-950">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span className="font-bold">
                          {language === 'bn'
                            ? `${selectedClass} পরীক্ষার রুটিন খসড়া: ${toBnNumber(erDraftOrReturned.length)}টি খসড়া/ফেরত, ${toBnNumber(erPending.length)}টি অনুমোদনের অপেক্ষায়`
                            : `${selectedClass} Exam Routine: ${erDraftOrReturned.length} draft/returned, ${erPending.length} pending SuperAdmin approval`}
                        </span>
                        <p className="text-[11px] text-amber-800">
                          {language === 'bn'
                            ? 'সুপার অ্যাডমিনের অনুমোদন ও প্রকাশের পূর্বে শিক্ষার্থীরা এই খসড়া দেখতে পাবে না।'
                            : 'Students cannot see exam routine drafts until approved and published by SuperAdmin.'}
                        </p>
                      </div>
                    </div>
                    {erDraftOrReturned.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSubmitExamRoutineDrafts}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {language === 'bn'
                            ? `অনুমোদনের জন্য পাঠান (${toBnNumber(erDraftOrReturned.length)})`
                            : `Submit Draft (${erDraftOrReturned.length})`}
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {isApprover && erUnpublishedIds.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
                    <div className="flex items-center space-x-2.5 text-indigo-950">
                      <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div>
                        <span className="font-bold">
                          {language === 'bn'
                            ? `সুপার অ্যাডমিন অনুমোদন: ${selectedClass}-এর ${toBnNumber(erPending.length)}টি পাঠানো রুটিন (${toBnNumber(erUnpublishedIds.length)}টি মোট অপ্রকাশিত)`
                            : `SuperAdmin Review: ${erPending.length} submitted routine item(s) (${erUnpublishedIds.length} unpublished)`}
                        </span>
                        <p className="text-[11px] text-indigo-800">
                          {language === 'bn'
                            ? 'অনুমোদন ও প্রকাশ করলে রুটিনটি শিক্ষার্থী ও প্রবেশপত্র মডিউলে প্রকাশিত হবে।'
                            : 'Approve and publish to release this exam schedule.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApproveExamRoutineItems(erUnpublishedIds)}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {language === 'bn'
                          ? `সব অনুমোদন ও প্রকাশ করুন (${toBnNumber(erUnpublishedIds.length)})`
                          : `Approve & Publish All (${erUnpublishedIds.length})`}
                      </span>
                    </button>
                  </div>
                )}
              </>
            );
          })()}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none">
            <div className="hidden print:block text-center p-4 border-b-2 border-slate-900">
              <img
                src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                alt="School Logo"
                className="w-14 h-14 object-contain mx-auto mb-2"
              />
              <h1 className="text-xl font-black">{school.nameBn}</h1>
              <h2 className="text-sm font-bold text-slate-700">{school.nameEn}</h2>
              <p className="text-xs text-slate-600">{school.addressBn} • EIIN: {school.eiin}</p>
              <div className="mt-2 inline-block px-4 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
                EXAMINATION ROUTINE • {currentExam?.nameEn} ({selectedClass}{routineGroupFilter !== 'all' ? ` - ${routineGroupFilter}` : ''})
              </div>
            </div>

            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs print:hidden">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900">
                    {selectedClass} Routine Schedule ({displayClassRoutines.length} Subject Entries)
                  </h4>
                </div>
                {classHasGroups(selectedClass, academicClasses) && (
                  <div className="flex items-center space-x-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
                    <span className="font-bold text-amber-950 text-[11px]">বিভাগ / Group:</span>
                    <select
                      value={routineGroupFilter}
                      onChange={(e) => setRoutineGroupFilter(e.target.value)}
                      className="px-2 py-0.5 border border-amber-300 rounded text-xs bg-white font-bold text-slate-900 focus:outline-none"
                    >
                      <option value="all">সকল বিষয় (All Groups)</option>
                      <option value="compulsory">আবশ্যিক বিষয় (Compulsory)</option>
                      <option value="Science">বিজ্ঞান (Science)</option>
                      <option value="Commerce">ব্যবসায় শিক্ষা (Commerce)</option>
                      <option value="Humanities">মানবিক (Humanities)</option>
                      <option value="Vocational">ভোকেশনাল (Vocational)</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-3 text-slate-500 font-medium">
                <span>
                  {language === 'bn'
                    ? 'প্রবেশপত্রে শিক্ষার্থীদের সংশ্লিষ্ট বিভাগের রুটিন স্বয়ংক্রিয়ভাবে দৃশ্যমান হবে।'
                    : 'Admit cards reflect these subject dates automatically.'}
                </span>
                <button
                  onClick={() => setShowRoutinePrintModal(true)}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold flex items-center space-x-1 shadow-xs active:scale-95 transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'প্রিন্ট রুটিন' : 'Print Routine'}</span>
                </button>
              </div>
            </div>

            {/* DATE GROUPED PARALLEL VIEW MODE */}
            {routineViewMode === 'date_grouped' && displayClassRoutines.length > 0 ? (
              <div className="divide-y divide-slate-200">
                {groupedRoutinesByDate.map(([dateStr, items]) => {
                  const dayName = items[0]?.dayOfWeek || 'Sunday';
                  const hasParallel = items.length > 1;

                  return (
                    <div key={dateStr} className={`p-4 transition-colors ${hasParallel ? 'bg-amber-50/20' : 'bg-white'}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-3 py-1 bg-blue-900 text-white rounded-lg font-bold font-mono text-xs shadow-xs">
                            {dateStr}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">
                            {dayName} {daysOfWeekBn[dayName] ? `(${daysOfWeekBn[dayName]})` : ''}
                          </span>
                          {hasParallel ? (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[11px] font-black uppercase flex items-center space-x-1">
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              <span>একই তারিখে সমান্তরাল {items.length}টি বিভাগীয় পরীক্ষা</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[10px] font-bold">
                              {items[0]?.group ? items[0]?.group : 'সাধারণ / আবশ্যিক'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-slate-600 font-medium">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            <strong className="text-slate-800">{items[0]?.startTime} - {items[0]?.endTime}</strong>
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center space-x-1">
                            <Building className="w-3.5 h-3.5 text-emerald-600" />
                            <strong className="text-slate-800">{items[0]?.roomNo || 'Main Hall'}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Parallel Cards Grid for multiple subjects on this date */}
                      <div className={`grid gap-3 ${hasParallel ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1'}`}>
                        {items.map((item) => {
                          const groupLower = (item.group || '').toLowerCase();
                          let borderClass = 'border-slate-200 bg-slate-50/50';
                          let badgeBg = 'bg-slate-100 text-slate-800 border-slate-300';

                          if (groupLower.includes('science')) {
                            borderClass = 'border-blue-300 bg-blue-50/40 hover:bg-blue-50/70';
                            badgeBg = 'bg-blue-600 text-white border-blue-700';
                          } else if (groupLower.includes('commerce') || groupLower.includes('business')) {
                            borderClass = 'border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50/70';
                            badgeBg = 'bg-emerald-600 text-white border-emerald-700';
                          } else if (groupLower.includes('humanities') || groupLower.includes('arts')) {
                            borderClass = 'border-amber-300 bg-amber-50/40 hover:bg-amber-50/70';
                            badgeBg = 'bg-amber-600 text-white border-amber-700';
                          } else if (groupLower.includes('vocational')) {
                            borderClass = 'border-purple-300 bg-purple-50/40 hover:bg-purple-50/70';
                            badgeBg = 'bg-purple-600 text-white border-purple-700';
                          }

                          return (
                            <div
                              key={item.id}
                              className={`p-3.5 rounded-xl border ${borderClass} shadow-xs flex flex-col justify-between transition-all`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1.5">
                                  <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-900 shadow-2xs">
                                    কোড: {item.subjectCode}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {!isStudentViewer && (() => {
                                      const stBadge = getApprovalStatusBadgeInfo(item.approvalStatus, language);
                                      return (
                                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold print:hidden ${stBadge.badgeClass}`}>
                                          {stBadge.label}
                                        </span>
                                      );
                                    })()}
                                    {Boolean(item.group) ? (
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${badgeBg}`}>
                                        {item.group === 'Commerce' ? 'বাণিজ্য' : item.group === 'Science' ? 'বিজ্ঞান' : item.group === 'Humanities' ? 'মানবিক' : item.group === 'Vocational' ? 'ভোকেশনাল' : item.group}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                                        আবশ্যিক
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <h5 className="font-extrabold text-slate-900 text-sm leading-snug">
                                  {item.subjectNameBn || item.subjectNameEn}
                                </h5>
                                <p className="text-[11px] text-slate-500 font-medium">
                                  {item.subjectNameEn}
                                </p>
                                {item.approvalStatus === 'rejected' && item.rejectionNote && !isStudentViewer && (
                                  <p className="text-[10px] text-rose-700 mt-1 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                                    {item.rejectionNote}
                                  </p>
                                )}
                              </div>

                              {(canManage || isApprover) && (
                                <div className="flex flex-wrap items-center justify-end gap-1.5 mt-3 pt-2 border-t border-slate-200/60 print:hidden">
                                  {isApprover && resolveEffectiveApprovalStatus(item.approvalStatus) !== 'published' && (
                                    <>
                                      <button
                                        onClick={() => handleApproveExamRoutineItems([item.id])}
                                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold flex items-center space-x-1"
                                        title={language === 'bn' ? 'অনুমোদন ও প্রকাশ' : 'Approve & Publish'}
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>{language === 'bn' ? 'প্রকাশ' : 'Publish'}</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRejectReasonInput('');
                                          setRejectDialog({
                                            kind: 'exam_routine',
                                            examId: selectedExamId,
                                            itemIds: [item.id],
                                            label: `${item.subjectNameBn || item.subjectNameEn} (${item.className})`,
                                          });
                                        }}
                                        className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold"
                                      >
                                        {language === 'bn' ? 'ফেরত' : 'Return'}
                                      </button>
                                    </>
                                  )}
                                  {canManage && (
                                    <>
                                      <button
                                        onClick={() => handleOpenEditRoutine(item)}
                                        className="p-1 hover:bg-white text-slate-500 rounded-md hover:text-blue-600 transition-colors"
                                        title="Edit"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteRoutineItem(item.id)}
                                        className="p-1 hover:bg-white text-slate-400 rounded-md hover:text-rose-600 transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* CLASSIC TABLE LIST VIEW MODE (or fallback for empty list) */}
            <div className={`overflow-x-auto ${routineViewMode === 'date_grouped' && displayClassRoutines.length > 0 ? 'hidden print:block' : ''}`}>
              <table className="w-full text-left border-collapse text-xs print:border print:border-slate-800">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px] print:bg-slate-100">
                    <th className="py-3 px-4 w-12 text-center print:border print:border-slate-800">Sl</th>
                    <th className="py-3 px-4 w-24 text-center print:border print:border-slate-800">Code</th>
                    <th className="py-3 px-4 print:border print:border-slate-800">Subject Name (বিষয়)</th>
                    <th className="py-3 px-4 w-44 text-center print:border print:border-slate-800">Exam Date & Day (তারিখ ও বার)</th>
                    <th className="py-3 px-4 w-40 text-center print:border print:border-slate-800">Time (সময়)</th>
                    <th className="py-3 px-4 w-32 text-center print:border print:border-slate-800">Exam Hall (কক্ষ)</th>
                    {canManage && <th className="py-3 px-4 w-28 text-right print:hidden">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 print:divide-slate-800">
                  {displayClassRoutines.length > 0 ? (
                    displayClassRoutines.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-center font-bold text-slate-400 print:border print:border-slate-800 print:text-black">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 text-center print:border print:border-slate-800">
                          <span className="font-mono font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs print:border-none print:bg-transparent print:text-black">
                            {item.subjectCode}
                          </span>
                        </td>
                        <td className="py-3 px-4 print:border print:border-slate-800">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900">{item.subjectNameEn}</span>
                            {!isStudentViewer && (() => {
                              const stBadge = getApprovalStatusBadgeInfo(item.approvalStatus, language);
                              return (
                                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold print:hidden ${stBadge.badgeClass}`}>
                                  {stBadge.label}
                                </span>
                              );
                            })()}
                            {Boolean(item.group) && (item.group as string) !== 'all' && (
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${
                                item.group === 'Science'
                                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                                  : item.group === 'Commerce'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : item.group === 'Humanities'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-purple-100 text-purple-900 border-purple-300'
                              } print:border-slate-600 print:bg-transparent`}>
                                {item.group}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{item.subjectNameBn}</div>
                        </td>
                        <td className="py-3 px-4 text-center print:border print:border-slate-800">
                          <strong className="text-slate-900 block font-semibold">{item.examDate}</strong>
                          <span className="text-[11px] text-blue-700 font-medium print:text-slate-700">
                            {item.dayOfWeek} {item.dayOfWeek && daysOfWeekBn[item.dayOfWeek] ? `(${daysOfWeekBn[item.dayOfWeek]})` : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-medium text-slate-700 print:border print:border-slate-800">
                          <div className="inline-flex items-center space-x-1 text-slate-800">
                            <Clock className="w-3.5 h-3.5 text-slate-400 print:hidden" />
                            <span>{item.startTime} - {item.endTime}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-700 print:border print:border-slate-800">
                          {item.roomNo || 'Main Hall'}
                        </td>
                        {canManage && (
                          <td className="py-3 px-4 text-right print:hidden">
                            <div className="flex items-center justify-end space-x-1.5">
                              {isApprover && resolveEffectiveApprovalStatus(item.approvalStatus) !== 'published' && (
                                <>
                                  <button
                                    onClick={() => handleApproveExamRoutineItems([item.id])}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                                  >
                                    {language === 'bn' ? 'প্রকাশ' : 'Publish'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRejectReasonInput('');
                                      setRejectDialog({
                                        kind: 'exam_routine',
                                        examId: selectedExamId,
                                        itemIds: [item.id],
                                        label: `${item.subjectNameBn || item.subjectNameEn} (${item.className})`,
                                      });
                                    }}
                                    className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-bold"
                                  >
                                    {language === 'bn' ? 'ফেরত' : 'Return'}
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleOpenEditRoutine(item)}
                                className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteRoutineItem(item.id)}
                                className="p-1.5 hover:bg-rose-50 text-slate-400 rounded-lg hover:text-rose-600 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={canManage ? 7 : 6} className="py-12 text-center">
                        <div className="max-w-md mx-auto space-y-2">
                          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                          <h4 className="font-bold text-slate-800 text-sm">
                            {language === 'bn' ? 'কোনো রুটিন পাওয়া যায়নি' : 'No Routine Found for ' + selectedClass}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {language === 'bn'
                              ? '"১ম মডেল টেস্ট" অথবা "স্মার্ট অটো জেনারেটর" বাটনে চাপ দিয়ে ০৫/০৩/২৬ থেকে ২০/০৩/২৬ তারিখের রুটিন তৈরি করুন।'
                              : 'Click "1st Model Test" or "Smart Auto Generator" to populate the exam routine.'}
                          </p>
                          {canManage && (
                            <div className="flex items-center justify-center gap-2 pt-2">
                              <button
                                onClick={handleApply1stModelTestPreset}
                                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-xs"
                              >
                                <Zap className="w-4 h-4 text-slate-950 fill-current" />
                                <span>{language === 'bn' ? '১ম মডেল টেস্ট রুটিন প্রস্তুত' : 'Setup 1st Model Test'}</span>
                              </button>
                              <button
                                onClick={handleOpenAutoRoutineModal}
                                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <span>{language === 'bn' ? 'কাস্টম অটো জেনারেটর' : 'Custom Generator'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Print Footer */}
            <div className="hidden print:flex justify-between items-end p-6 pt-12 text-xs border-t border-slate-800 mt-6">
              <div className="text-center w-44">
                <ClassTeacherSignatureDisplay
                  school={school}
                  className={selectedClass}
                  staffList={staffList}
                  fallbackText=""
                  heightClass="h-9"
                  textClassName="font-serif italic font-bold text-xs text-slate-900"
                />
                <div className="border-t border-slate-800 pt-1 font-bold">Class Teacher</div>
              </div>
              <div className="text-center w-48">
                <PrincipalSignatureDisplay
                  school={school}
                  fallbackText=""
                  heightClass="h-9"
                  textClassName="font-serif italic font-bold text-xs text-slate-900"
                />
                <div className="border-t border-slate-800 pt-1 font-bold">Principal / Head Teacher</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ADMIT CARDS */}
      {activeTab === 'admit_cards' && (
        <div className="space-y-4">
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

          {/* Control Bar */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3.5 print:hidden text-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  <label className="font-bold text-slate-800">Select Student in {selectedClass}:</label>
                  <select
                    value={admitCardStudent?.id || ''}
                    onChange={(e) => setSelectedAdmitCardStudentId(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white font-medium focus:ring-2 focus:ring-blue-500"
                    disabled={showPrintAllAdmitCards}
                  >
                    {classStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        Roll {s.roll} • {s.nameEn} ({s.studentId})
                      </option>
                    ))}
                    {classStudents.length === 0 && (
                      <option value="">No students in {selectedClass}</option>
                    )}
                  </select>
                </div>
                <span className="text-slate-400">|</span>
                <span className="text-slate-500">
                  Total in Class: <strong>{classStudents.length}</strong>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPrintAllAdmitCards(!showPrintAllAdmitCards)}
                  className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors border ${
                    showPrintAllAdmitCards
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {showPrintAllAdmitCards
                      ? (language === 'bn' ? `সকল ${classStudents.length} জনের মোড চালু` : `Bulk ON (${classStudents.length})`)
                      : (language === 'bn' ? `শ্রেণির সবার প্রিন্ট (${classStudents.length} জন)` : `Print All (${classStudents.length})`)}
                  </span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>{language === 'bn' ? 'প্রবেশপত্র প্রিন্ট' : 'Print Admit Card'}</span>
                </button>
              </div>
            </div>

            {/* Layout, Half-A4, Density & Instructions Toolbar */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              {/* Page Format Selector */}
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700 flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>{language === 'bn' ? 'সাইজ / লেআউট:' : 'Layout Size:'}</span>
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
                    {language === 'bn' ? 'A4 পূর্ণ পাতা (Single)' : 'A4 Full Page'}
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
                    <span>{language === 'bn' ? '১ পাতায় ২টি (পেপার সেভার)' : '2 Cards / A4'}</span>
                  </button>
                </div>
              </div>

              {/* 2nd Card Option in 2 per page mode */}
              {admitFormat === 'two_per_page' && (
                <div className="flex items-center space-x-1.5 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 text-xs">
                  <span className="font-bold text-blue-900 text-[11px]">{language === 'bn' ? '২য় কার্ড:' : '2nd Card:'}</span>
                  <select
                    value={admitTwoPerPageMode}
                    onChange={(e) => setAdmitTwoPerPageMode(e.target.value as any)}
                    className="px-2 py-0.5 bg-white border border-blue-300 rounded text-xs font-semibold text-blue-950"
                  >
                    <option value="duplicate">
                      {language === 'bn' ? 'একই শিক্ষার্থীর ২ কপি (শিক্ষার্থী + অফিস কপি)' : 'Student + Office Copy (Same)'}
                    </option>
                    <option value="two_students">
                      {language === 'bn' ? 'পরপর ২ জন শিক্ষার্থী (৫০% কাগজ সাশ্রয়)' : 'Consecutive Students (Save 50% Paper)'}
                    </option>
                  </select>
                </div>
              )}

              {/* Density & Instruction Selectors */}
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
                    <option value="compact">{language === 'bn' ? 'কম্প্যাক্ট (ঘন - ১২ বিষয়)' : 'Compact'}</option>
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
                    <option value="full">{language === 'bn' ? 'পূর্ণাঙ্গ (৪টি নিয়ম)' : 'Full (4 Rules)'}</option>
                    <option value="compact">{language === 'bn' ? '২-কলাম সংক্ষিপ্ত' : 'Compact 2-Col'}</option>
                    <option value="minimal">{language === 'bn' ? '১-লাইন সামারি' : '1-Line Minimal'}</option>
                    <option value="none">{language === 'bn' ? 'বাদ দিন (None)' : 'None'}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Smart Advisory Banner */}
            <div className="p-2.5 rounded-xl border text-xs bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {admitCardRoutines.length <= 7 ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>{language === 'bn' ? 'কম বিষয়' : 'Few Subjects'}</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    <span>{language === 'bn' ? `${admitCardRoutines.length}টি বিষয়` : `${admitCardRoutines.length} Subjects`}</span>
                  </span>
                )}
                <span className="text-slate-700 font-medium text-[11px]">
                  {admitCardRoutines.length <= 7 ? (
                    language === 'bn'
                      ? `এই শ্রেণিতে মোট ${admitCardRoutines.length}টি বিষয় রয়েছে। পেপার সাশ্রয় করতে 'হাফ A4' অথবা '১ পাতায় ২টি (পেপার সেভার)' বেছে নিতে পারেন!`
                      : `This class has ${admitCardRoutines.length} subjects. Consider using 'Half A4' or '2 Cards / A4' to save paper!`
                  ) : (
                    language === 'bn'
                      ? `এই শ্রেণিতে মোট ${admitCardRoutines.length}টি বিষয় রয়েছে। এটি কোনো অবস্থাতেই A4 সাইজের বাইরে যাবে না—নিখুঁত ১ পেজে ফিট রাখার জন্য অপ্টিমাইজ করা হয়েছে!`
                      : `This class has ${admitCardRoutines.length} subjects. It is strictly optimized to never exceed 1 single A4 sheet!`
                  )}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                A4 Max: 280mm
              </span>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex justify-center bg-slate-100 p-4 md:p-8 rounded-2xl border border-slate-200 print:bg-white print:p-0 print:border-none">
            {admitCardStudent ? (
              <div className="w-full">
                {!showPrintAllAdmitCards ? (
                  /* Single Card Mode */
                  <AdmitCardTemplate
                    school={school}
                    student={admitCardStudent}
                    exam={currentExam}
                    routines={admitCardRoutines}
                    format={admitFormat}
                    instructionMode={admitInstructionMode}
                    density={admitDensity}
                    twoPerPageMode={admitTwoPerPageMode}
                    pairedStudent={classStudents.find((s) => s.id !== admitCardStudent.id) || admitCardStudent}
                    pairedRoutines={currentClassRoutines}
                    language={language}
                  />
                ) : (
                  /* Bulk Print Mode for Selected Class */
                  <div className="space-y-6 print:space-y-0">
                    {admitFormat === 'two_per_page' ? (
                      Array.from({ length: Math.ceil(classStudents.length / (admitTwoPerPageMode === 'two_students' ? 2 : 1)) }).map((_, sheetIdx) => {
                        const firstStd = admitTwoPerPageMode === 'two_students'
                          ? classStudents[sheetIdx * 2]
                          : classStudents[sheetIdx];
                        const secondStd = admitTwoPerPageMode === 'two_students'
                          ? classStudents[sheetIdx * 2 + 1]
                          : firstStd;
                        if (!firstStd) return null;

                        const firstRoutines = currentClassRoutines.filter((item) => {
                          if (!classHasGroups(firstStd.className, academicClasses)) return true;
                          const sGroup = (firstStd.group || 'Science').toLowerCase();
                          if (!item.group || item.group.toLowerCase() === 'all') return true;
                          return item.group.toLowerCase().includes(sGroup);
                        });

                        const secondRoutines = secondStd ? currentClassRoutines.filter((item) => {
                          if (!classHasGroups(secondStd.className, academicClasses)) return true;
                          const sGroup = (secondStd.group || 'Science').toLowerCase();
                          if (!item.group || item.group.toLowerCase() === 'all') return true;
                          return item.group.toLowerCase().includes(sGroup);
                        }) : firstRoutines;

                        return (
                          <div key={sheetIdx} className="print-page-break pb-6 print:pb-0">
                            <AdmitCardTemplate
                              school={school}
                              student={firstStd}
                              exam={currentExam}
                              routines={firstRoutines}
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
                      classStudents.map((std, idx) => {
                        const stdRoutines = currentClassRoutines.filter((item) => {
                          if (!classHasGroups(std.className, academicClasses)) return true;
                          const sGroup = (std.group || 'Science').toLowerCase();
                          if (!item.group || item.group.toLowerCase() === 'all') return true;
                          return item.group.toLowerCase().includes(sGroup);
                        });

                        return (
                          <div key={std.id || idx} className="print-page-break pb-6 print:pb-0">
                            <AdmitCardTemplate
                              school={school}
                              student={std}
                              exam={currentExam}
                              routines={stdRoutines}
                              format={admitFormat}
                              instructionMode={admitInstructionMode}
                              density={admitDensity}
                              language={language}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-8 text-slate-500">
                No active students enrolled in {selectedClass}. Please choose another class or admit students first.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: EXAM SEAT PLAN */}
      {activeTab === 'seat_plan' && (
        <ExamSeatPlanTab
          school={school}
          currentExam={currentExam}
          selectedExamId={selectedExamId}
          selectedClass={selectedClass}
          allStudents={students}
          canManage={canManage}
          language={language}
          toBnNumber={toBnNumber}
        />
      )}

      {/* TAB: Exams Overview */}
      {activeTab === 'exams' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-100 text-blue-700">
                      Session {exam.session}
                    </span>
                    {canManage && isApprover ? (
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(exam)}
                        className="cursor-pointer"
                        title={language === 'bn' ? 'স্ট্যাটাস পরিবর্তন করতে ক্লিক করুন' : 'Click to toggle status'}
                      >
                        {exam.isPublished ? (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full hover:bg-emerald-100">
                            Published
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full hover:bg-amber-100">
                            Draft
                          </span>
                        )}
                      </button>
                    ) : (
                      <span>
                        {exam.isPublished ? (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                            Published
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                            Draft
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditExam(exam)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title={language === 'bn' ? 'পরীক্ষা সম্পাদনা করুন' : 'Edit Exam'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteExam(exam)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title={language === 'bn' ? 'পরীক্ষা মুছে ফেলুন' : 'Delete Exam'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-2">
                  {language === 'bn' ? exam.nameBn : exam.nameEn}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Schedule: {exam.startDate} to {exam.endDate}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {exam.applicableClasses.map((cls) => (
                    <span key={cls} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                      {cls}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => {
                    setSelectedExamId(exam.id);
                    setActiveTab('marks_entry');
                  }}
                  className="font-semibold text-blue-600 hover:underline flex items-center space-x-1"
                >
                  <span>{language === 'bn' ? 'নম্বর এন্ট্রি' : 'Enter Marks'}</span>
                  <span>&rarr;</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedExamId(exam.id);
                    setActiveTab('tabulation');
                  }}
                  className="font-semibold text-slate-600 hover:text-slate-900"
                >
                  {language === 'bn' ? 'ট্যাবুলেশন শিট' : 'View Tabulation Sheet'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Subject Marks Entry */}
      {activeTab === 'marks_entry' && currentSubject && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-0">
          {/* Top Control Bar with Save & Edit Buttons */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-slate-900 text-sm">
                  {currentSubject.code} - {language === 'bn' ? currentSubject.nameBn : currentSubject.nameEn}
                </span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[11px]">
                  {language === 'bn' ? `${selectedClass}` : `${selectedClass}`}
                </span>
                <span className="ml-1 text-slate-500 font-medium">
                  (Full: {currentSubject.fullMarks} | Pass: {currentSubject.passMarks})
                </span>
              </div>
              <div className="text-slate-500 font-medium text-[11px] mt-0.5">
                Theory CQ: {currentSubject.writtenMarks} | MCQ: {currentSubject.mcqMarks || 0} | Practical: {currentSubject.practicalMarks || 0}
              </div>
            </div>

            {/* Save & Edit Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {marksSaveStatus === 'saved' && (
                <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {language === 'bn'
                      ? `নম্বর সফলভাবে সংরক্ষিত হয়েছে! (${lastSavedTime})`
                      : `Marks Saved Successfully! (${lastSavedTime})`}
                  </span>
                </div>
              )}

              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditingMarks((prev) => !prev)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      isEditingMarks
                        ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                    title={isEditingMarks ? 'Lock entries from accidental edit' : 'Enable editing marks'}
                  >
                    {isEditingMarks ? (
                      <>
                        <Unlock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{language === 'bn' ? 'সম্পাদনা চালু (Edit Mode)' : 'Editing Enabled'}</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-slate-600" />
                        <span>{language === 'bn' ? 'লক করা (Locked)' : 'Locked'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveMarksExplicit}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-sm transition-all"
                    title="Explicitly save and persist all marks"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {isApprover
                        ? (language === 'bn' ? 'নম্বর সংরক্ষণ ও প্রকাশ' : 'Save & Publish Marks')
                        : (language === 'bn' ? 'খসড়া সংরক্ষণ (Save Draft)' : 'Save Draft Marks')}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Subject Marks Entry Draft -> SuperAdmin Approval Status Bar */}
          {(() => {
            const subMarks = allMarks.filter(
              (m) => m.examId === selectedExamId && m.subjectId === currentSubject.id
            );
            const hasPending = subMarks.some((m) => m.approvalStatus === 'pending_approval');
            const hasDraft = subMarks.some((m) => m.approvalStatus === 'draft');
            const hasRejected = subMarks.some((m) => m.approvalStatus === 'rejected');
            const effectiveStatus = hasPending
              ? 'pending_approval'
              : hasRejected
              ? 'rejected'
              : hasDraft
              ? 'draft'
              : subMarks.length > 0
              ? resolveEffectiveApprovalStatus(subMarks[0]?.approvalStatus)
              : 'draft';
            const badge = getApprovalStatusBadgeInfo(effectiveStatus, language);
            const submittedBy = subMarks.find((m) => m.submittedBy)?.submittedBy;
            const rejectionNote = subMarks.find((m) => m.rejectionNote)?.rejectionNote;
            const pendingOtherSubjects = Array.from(
              new Set(
                allMarks
                  .filter(
                    (m) =>
                      m.examId === selectedExamId &&
                      m.approvalStatus === 'pending_approval' &&
                      m.subjectId !== currentSubject.id
                  )
                  .map((m) => m.subjectId)
              )
            );

            return (
              <div
                className={`px-4 py-3 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs ${
                  effectiveStatus === 'published'
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : effectiveStatus === 'pending_approval'
                    ? 'bg-amber-50 border-amber-200'
                    : effectiveStatus === 'rejected'
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-slate-50/90 border-slate-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${badge.badgeClass}`}>
                      {badge.label}
                    </span>
                    <span className="text-[11px] text-slate-600 font-medium">
                      {language === 'bn'
                        ? `এন্ট্রিকৃত শিক্ষার্থী: ${toBnNumber(subMarks.length)} জন`
                        : `Entered students: ${subMarks.length}`}
                    </span>
                    {submittedBy && effectiveStatus !== 'published' && (
                      <span className="text-[11px] text-slate-600">
                        • {language === 'bn' ? `শিক্ষক: ${submittedBy}` : `Teacher: ${submittedBy}`}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {effectiveStatus === 'published'
                      ? (language === 'bn'
                          ? 'এই বিষয়ের নম্বর সুপার অ্যাডমিন কর্তৃক অনুমোদিত। পরীক্ষা প্রকাশিত হলে শিক্ষার্থীরা ফলাফল দেখতে পাবে।'
                          : 'Subject marks are approved. Students see marks once exam is published.')
                      : effectiveStatus === 'rejected'
                      ? (language === 'bn'
                          ? `সংশোধনের জন্য ফেরত: ${rejectionNote || 'যাচাই করে পুনরায় জমা দিন'}`
                          : `Returned for revision: ${rejectionNote || 'Please verify and resubmit'}`)
                      : effectiveStatus === 'pending_approval'
                      ? (language === 'bn'
                          ? 'নম্বরপত্রটি সুপার অ্যাডমিনের অনুমোদনের অপেক্ষায় রয়েছে।'
                          : 'Marks draft is waiting for SuperAdmin approval.')
                      : (language === 'bn'
                          ? 'নম্বর এন্ট্রির পর "অনুমোদনের জন্য পাঠান" বাটনে ক্লিক করলে সুপার অ্যাডমিন তা যাচাই ও প্রকাশ করবেন।'
                          : 'After entering marks, submit to SuperAdmin for final approval & publication.')}
                  </p>
                  {isApprover && pendingOtherSubjects.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-bold text-indigo-800">
                        {language === 'bn' ? 'অন্যান্য অপেক্ষমাণ বিষয়:' : 'Other pending subjects:'}
                      </span>
                      {pendingOtherSubjects.map((subId) => {
                        const subObj = subjects.find((s) => s.id === subId);
                        return (
                          <button
                            key={subId}
                            type="button"
                            onClick={() => {
                              if (subObj?.className) setSelectedClass(subObj.className);
                              setSelectedSubjectId(subId);
                            }}
                            className="px-2 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-900 text-[10px] font-bold"
                          >
                            {subObj ? `${subObj.className} - ${subObj.nameBn || subObj.nameEn}` : subId}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {canManage && !isApprover && subMarks.length > 0 && effectiveStatus !== 'published' && (
                    <button
                      type="button"
                      onClick={handleSubmitMarksForApproval}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {effectiveStatus === 'pending_approval'
                          ? (language === 'bn' ? 'পুনরায় অনুমোদনে পাঠান' : 'Resubmit Draft')
                          : (language === 'bn' ? 'অনুমোদনের জন্য পাঠান' : 'Submit for Approval')}
                      </span>
                    </button>
                  )}

                  {isApprover && subMarks.length > 0 && effectiveStatus !== 'published' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApproveSubjectMarks(currentSubject.id, true)}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          {language === 'bn' ? 'নম্বর অনুমোদন ও প্রকাশ করুন' : 'Approve & Publish Marks'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectReasonInput('');
                          setRejectDialog({
                            kind: 'marks',
                            examId: selectedExamId,
                            subjectId: currentSubject.id,
                            label: `${selectedClass} - ${currentSubject.nameBn || currentSubject.nameEn}`,
                          });
                        }}
                        className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-xl font-bold"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{language === 'bn' ? 'ফেরত পাঠান' : 'Return'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {(() => {
            const isNineOrTen = classHasGroups(selectedClass, academicClasses);
            const subjectGroup = currentSubject?.group;
            const isSpecificGroup = Boolean(isNineOrTen && subjectGroup && subjectGroup !== 'General');

            const marksStudents = classStudents.filter((std) => {
              if (!isSpecificGroup) return true;
              const sGroup = (std.group || '').toLowerCase();
              const subG = (subjectGroup || '').toLowerCase();
              if (subG === 'science' && sGroup.includes('science')) return true;
              if ((subG === 'commerce' || subG === 'business') && (sGroup.includes('commerce') || sGroup.includes('business'))) return true;
              if ((subG === 'humanities' || subG === 'arts') && (sGroup.includes('humanities') || sGroup.includes('arts'))) return true;
              if (subG === 'vocational' && sGroup.includes('vocational')) return true;
              return !std.group; // unassigned
            });

            return (
              <>
                {isSpecificGroup && (
                  <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-200 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950">
                    <span className="font-semibold flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                      <span>
                        {language === 'bn'
                          ? `এই বিষয়টি "${subjectGroup}" বিভাগের অন্তর্ভুক্ত। নিচে শুধুমাত্র এই বিভাগের শিক্ষার্থীদের তালিকা প্রদর্শিত হচ্ছে (${marksStudents.length} জন শিক্ষার্থী)।`
                          : `This subject belongs to the "${subjectGroup}" stream. Showing matching students (${marksStudents.length} students).`}
                      </span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full font-bold bg-sky-100 text-sky-800 text-[11px] border border-sky-300">
                      {subjectGroup} Stream Only
                    </span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-white border-b border-slate-200 text-slate-600 font-semibold uppercase">
                        <th className="py-3 px-4 w-16">{language === 'bn' ? 'রোল' : 'Roll'}</th>
                        <th className="py-3 px-4">{language === 'bn' ? 'শিক্ষার্থীর নাম' : 'Student Name'}</th>
                        <th className="py-3 px-4 w-28">{language === 'bn' ? 'লিখিত (CQ)' : 'Written (CQ)'}</th>
                        <th className="py-3 px-4 w-28">MCQ</th>
                        <th className="py-3 px-4 w-28">{language === 'bn' ? 'ব্যবহারিক' : 'Practical'}</th>
                        <th className="py-3 px-4 w-24">{language === 'bn' ? 'মোট' : 'Total'}</th>
                        <th className="py-3 px-4 w-20">{language === 'bn' ? 'গ্রেড' : 'Grade'}</th>
                        <th className="py-3 px-4 w-20">GPA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {marksStudents.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            {language === 'bn'
                              ? `এই বিভাগে (${subjectGroup || 'General'}) কোনো শিক্ষার্থী পাওয়া যায়নি।`
                              : `No students enrolled in this group (${subjectGroup || 'General'}).`}
                          </td>
                        </tr>
                      ) : (
                        marksStudents.map((std) => {
                          const m = getStudentMarkForSubject(std.id, currentSubject.id) || {
                            written: 0,
                            mcq: 0,
                            practical: 0,
                            total: 0,
                            grade: 'F',
                            gpa: 0,
                          };
                          return (
                            <tr key={std.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-700">
                                {toBnNumber(std.roll)}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900">{std.nameEn}</div>
                                <div className="text-[11px] text-slate-500 flex items-center space-x-1.5">
                                  <span>{std.studentId}</span>
                                  {isNineOrTen && (
                                    <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 text-[10px]">
                                      {std.group || 'Science'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <DigitInput
                                  allowDecimal
                                  disabled={!canManage || !isEditingMarks}
                                  min={0}
                                  max={currentSubject.writtenMarks}
                                  value={m.written}
                                  onValueChange={(val) => handleMarkChange(std.id, 'written', val)}
                                  className="w-20 px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <DigitInput
                                  allowDecimal
                                  disabled={!canManage || !isEditingMarks || !currentSubject.mcqMarks}
                                  min={0}
                                  max={currentSubject.mcqMarks || 0}
                                  value={m.mcq}
                                  onValueChange={(val) => handleMarkChange(std.id, 'mcq', val)}
                                  className="w-20 px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <DigitInput
                                  allowDecimal
                                  disabled={!canManage || !isEditingMarks || !currentSubject.practicalMarks}
                                  min={0}
                                  max={currentSubject.practicalMarks || 0}
                                  value={m.practical}
                                  onValueChange={(val) => handleMarkChange(std.id, 'practical', val)}
                                  className="w-20 px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                                />
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                                {m.total}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded font-bold text-xs ${
                                    m.grade === 'A+'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : m.grade === 'A' || m.grade === 'A-'
                                      ? 'bg-blue-100 text-blue-800'
                                      : m.grade === 'F'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {m.grade}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-800">
                                {m.gpa.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          {/* Bottom Summary & Save Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-slate-600 font-medium">
              <span>
                {language === 'bn'
                  ? `মোট শিক্ষার্থী: ${toBnNumber(classStudents.length)} জন | বিষয়: ${currentSubject.nameBn || currentSubject.nameEn}`
                  : `Total Students: ${classStudents.length} | Subject: ${currentSubject.nameEn}`}
              </span>
            </div>
            {canManage && (
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditingMarks(true)}
                  className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-bold flex items-center space-x-1.5 shadow-2xs"
                >
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>{language === 'bn' ? 'সম্পাদনা করুন (Edit)' : 'Edit'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveMarksExplicit}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center space-x-1.5 shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>{language === 'bn' ? 'নম্বর সংরক্ষণ করুন (Save Marks)' : 'Save Marks'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Report Cards Directory */}
      {activeTab === 'report_cards' && (
        <div
          className={`bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden ${
            showTranscriptModal ? 'print:hidden' : ''
          }`}
        >
          <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-slate-900">
                {language === 'bn' ? `${selectedClass} - নম্বরপত্র সংগ্রহ` : `${selectedClass} - Student Marksheet Generator`}
              </span>
              <span className="text-slate-500 ml-2">
                ({filteredReportCardStudents.length} {language === 'bn' ? 'জন শিক্ষার্থী' : 'students'} • NCTB Grading Scale)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Language Switcher: Bangla + Eng / Bangla / English */}
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                {(
                  [
                    { id: 'bilingual', label: 'বাংলা + Eng' },
                    { id: 'bn', label: 'বাংলা' },
                    { id: 'en', label: 'English' },
                  ] as { id: MarksheetLanguageMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMarksheetLangMode(opt.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                      marksheetLangMode === opt.id
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {activeRole !== 'student' && reportCardSectionOptions.length > 1 && (
                <select
                  value={reportCardSectionFilter}
                  onChange={(e) => setReportCardSectionFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-semibold text-slate-700"
                >
                  <option value="all">{language === 'bn' ? 'সকল শাখা (All)' : 'All Sections'}</option>
                  {reportCardSectionOptions.map((sec) => (
                    <option key={sec} value={sec}>
                      {language === 'bn' ? `শাখা ${sec}` : `Section ${sec}`}
                    </option>
                  ))}
                </select>
              )}

              {activeRole !== 'student' && filteredReportCardStudents.length > 0 && (
                <button
                  type="button"
                  onClick={handleOpenBulkMarksheets}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    {language === 'bn'
                      ? `পুরো শ্রেণির মার্কশিট একসাথে প্রিন্ট (${filteredReportCardStudents.length} জন)`
                      : `Print All Class Marksheets (${filteredReportCardStudents.length})`}
                  </span>
                </button>
              )}
            </div>
          </div>
          {activeRole === 'student' && !currentExam?.isPublished ? (
            <div className="p-8 text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">
                {language === 'bn' ? 'ফলাফল এখনো প্রকাশিত হয়নি' : 'Result Not Published Yet'}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {language === 'bn'
                  ? 'এই পরীক্ষার ফলাফল বর্তমানে খসড়া অবস্থায় আছে। প্রকাশ করা হলে এখান থেকে মার্কশিট দেখতে পাবেন।'
                  : 'This exam result is still in draft mode. Your marksheet will appear once published.'}
              </p>
            </div>
          ) : (
          <div className="divide-y divide-slate-100">
            {filteredReportCardStudents.map((std) => {
              const relevantSubs = getSubjectsForStudent(std, classSubjects, academicClasses);
              const studentSubjectMarks = relevantSubs.map((sub) => getStudentMarkForSubject(std.id, sub.id));
              const validMarks = studentSubjectMarks.filter(Boolean) as MarksEntry[];
              const hasFail = validMarks.some((m) => m.grade === 'F');
              const gpas = validMarks.map((m) => m.gpa);
              const gpaResult = calculateTotalGPA(gpas, hasFail);

              return (
                <div key={std.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-xs shrink-0">
                      {std.roll}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-xs truncate">{std.nameEn} ({std.nameBn})</h4>
                      <p className="text-[11px] text-slate-500 truncate">
                        ID: {std.studentId} • Section {std.section} • {std.shift} Shift
                        {classHasGroups(std.className, academicClasses) && (
                          <span className="font-bold text-blue-700 ml-1.5">
                            • {std.group || 'Science'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 sm:space-x-4 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-900">
                        GPA: <span className="text-blue-700">{gpaResult.totalGPA.toFixed(2)}</span>
                      </div>
                      <div className={`text-[10px] font-bold ${gpaResult.overallGrade === 'A+' ? 'text-emerald-600' : gpaResult.overallGrade === 'F' ? 'text-rose-600' : 'text-blue-600'}`}>
                        Grade: {gpaResult.overallGrade} ({gpaResult.status})
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenTranscript(std)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'মার্কশিট দেখুন' : 'View Marksheet'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* TAB: Master Tabulation Sheet */}
      {activeTab === 'tabulation' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-slate-900">
                {language === 'bn' ? `মাস্টার ট্যাবুলেশন শিট: ${selectedClass}` : `Master Tabulation Sheet: ${selectedClass}`}
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {currentExam?.nameEn} • Session 2026
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('print')}</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Roll</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  {classSubjects.map((sub) => (
                    <th key={sub.id} className="py-2.5 px-2 text-center border-l border-slate-200">
                      <div>{sub.nameEn.split(' ')[0]}</div>
                      <div className="text-[9px] text-slate-400">({sub.fullMarks})</div>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-center border-l border-slate-200">Total Marks</th>
                  <th className="py-2.5 px-3 text-center">GPA</th>
                  <th className="py-2.5 px-3 text-center">Grade</th>
                  <th className="py-2.5 px-3 text-center">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.map((std) => {
                  let totalObtained = 0;
                  const gpas: number[] = [];
                  let hasFail = false;
                  const isNineOrTen = classHasGroups(std.className, academicClasses);
                  const sGroup = (std.group || 'Science').toLowerCase();

                  return (
                    <tr key={std.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-bold text-slate-800">{std.roll}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                        <div>{std.nameEn}</div>
                        {isNineOrTen && (
                          <div className="text-[10px] text-blue-700 font-semibold">{std.group || 'Science'}</div>
                        )}
                      </td>
                      {classSubjects.map((sub) => {
                        let isStudentSubject = true;
                        if (isNineOrTen && sub.group && sub.group !== 'General') {
                          const subGroup = sub.group.toLowerCase();
                          isStudentSubject = subGroup.includes(sGroup) || sGroup.includes(subGroup);
                        }

                        const m = isStudentSubject ? getStudentMarkForSubject(std.id, sub.id) : undefined;
                        if (isStudentSubject && m) {
                          totalObtained += m.total;
                          gpas.push(m.gpa);
                          if (m.grade === 'F') hasFail = true;
                        }

                        return (
                          <td key={sub.id} className="py-2.5 px-2 text-center border-l border-slate-100">
                            {!isStudentSubject ? (
                              <span className="text-slate-300 text-[10px] italic">N/A</span>
                            ) : m ? (
                              <div>
                                <span className="font-semibold text-slate-800">{m.total}</span>
                                <span className="text-[9px] text-slate-500 block">({m.grade})</span>
                              </div>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })}
                      {(() => {
                        const res = calculateTotalGPA(gpas, hasFail);
                        return (
                          <>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-900 border-l border-slate-200">
                              {totalObtained}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-blue-700">
                              {res.totalGPA.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  res.overallGrade === 'A+'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : res.overallGrade === 'F'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {res.overallGrade}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-semibold">
                              <span className={res.status === 'PASSED' ? 'text-emerald-600' : 'text-rose-600'}>
                                {res.status}
                              </span>
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Official Student Merit List (মেধা তালিকা ও ফাইনাল CGPA র‍্যাংকিং) */}
      {activeTab === 'merit_list' && (() => {
        const isCombinedMode = meritMode === 'combined' && exams.length > 0;
        const activeCombinedExams = isCombinedMode
          ? exams.filter((ex) => meritSelectedExamIds.includes(ex.id))
          : currentExam
          ? [currentExam]
          : [];
        const effectiveExams =
          activeCombinedExams.length > 0
            ? activeCombinedExams
            : currentExam
            ? [currentExam]
            : [];

        const toggleMeritExam = (examId: string) => {
          setMeritSelectedExamIds((prev) => {
            if (prev.includes(examId)) {
              if (prev.length <= 1) return prev;
              return prev.filter((id) => id !== examId);
            }
            return [...prev, examId];
          });
        };

        // Filter eligible students based on class, section, shift, and group
        const meritEligibleStudents = students.filter((s) => {
          if (s.className !== selectedClass) return false;
          if (s.status !== 'active') return false;
          if (meritSection !== 'all' && s.section !== meritSection) return false;
          if (meritShift !== 'all' && s.shift !== meritShift) return false;
          if (meritGroup !== 'all' && s.group !== meritGroup) return false;
          return true;
        });

        // Helper for marks of a specific student in a specific exam & subject
        const getMarkForExam = (examId: string, studentId: string, subjectId: string) =>
          allMarks.find(
            (m) =>
              m.examId === examId &&
              m.studentId === studentId &&
              m.subjectId === subjectId &&
              (!isStudentViewer || isPublishedForStudents(m.approvalStatus))
          );

        // Calculate Single Exam GPA OR Multi-Exam Combined Final CGPA per student
        const meritCalculated = meritEligibleStudents.map((std) => {
          const relevantSubs = getSubjectsForStudent(std, classSubjects, academicClasses);

          if (!isCombinedMode) {
            let totalObtained = 0;
            let fullMarks = 0;
            const gpas: number[] = [];
            let hasFail = false;
            let failedCount = 0;
            let subjectsWithMarksCount = 0;

            relevantSubs.forEach((sub) => {
              const m = getStudentMarkForSubject(std.id, sub.id);
              if (m) {
                fullMarks += sub.fullMarks;
                subjectsWithMarksCount++;
                totalObtained += m.total;
                gpas.push(m.gpa);
                if (m.grade === 'F') {
                  hasFail = true;
                  failedCount++;
                }
              }
            });

            const res = calculateTotalGPA(gpas, hasFail);
            const percentage = fullMarks > 0 ? Math.round((totalObtained / fullMarks) * 100) : 0;

            return {
              student: std,
              totalObtained,
              fullMarks,
              percentage,
              gpa: res.totalGPA,
              overallGrade: res.overallGrade,
              hasFail,
              failedCount,
              subjectsWithMarksCount,
              examBreakdowns: [] as ExamGPABreakdown[],
              examsCompletedCount: subjectsWithMarksCount > 0 ? 1 : 0,
            };
          }

          // Combined Multi-Exam Calculation (3, 4, 5, 6+ exams -> 1 Final CGPA)
          const examBreakdowns: ExamGPABreakdown[] = effectiveExams.map((ex) => {
            let exObtained = 0;
            let exFull = 0;
            const exGpas: number[] = [];
            let exHasFail = false;
            let exSubWithMarks = 0;

            relevantSubs.forEach((sub) => {
              const m = getMarkForExam(ex.id, std.id, sub.id);
              if (m) {
                exFull += sub.fullMarks;
                exSubWithMarks++;
                exObtained += m.total;
                exGpas.push(m.gpa);
                if (m.grade === 'F') {
                  exHasFail = true;
                }
              }
            });

            const exRes = calculateTotalGPA(exGpas, exHasFail);
            const weight = useCustomExamWeights
              ? Math.max(0, Number(meritExamWeights[ex.id] ?? 1))
              : 1;

            return {
              examId: ex.id,
              examName: language === 'bn' ? ex.nameBn || ex.nameEn : ex.nameEn,
              gpa: exRes.totalGPA,
              overallGrade: exRes.overallGrade,
              totalObtained: exObtained,
              fullMarks: exFull,
              hasFail: exHasFail,
              hasData: exSubWithMarks > 0,
              weight,
            };
          });

          const combinedRes = calculateCombinedCGPA(examBreakdowns, combinedPassPolicy);
          const percentage =
            combinedRes.totalFullMarks > 0
              ? Math.round((combinedRes.totalObtained / combinedRes.totalFullMarks) * 100)
              : 0;

          return {
            student: std,
            totalObtained: combinedRes.totalObtained,
            fullMarks: combinedRes.totalFullMarks,
            percentage,
            gpa: combinedRes.cgpa,
            overallGrade: combinedRes.overallGrade,
            hasFail: combinedRes.status === 'FAILED',
            failedCount: combinedRes.failedExamsCount,
            subjectsWithMarksCount: combinedRes.examsCompletedCount,
            examBreakdowns,
            examsCompletedCount: combinedRes.examsCompletedCount,
          };
        });

        // 1. Passing students sorted by Final CGPA/GPA desc, then Total Marks desc, then Roll asc
        const passedStudents = meritCalculated
          .filter((m) => !m.hasFail && m.subjectsWithMarksCount > 0)
          .sort((a, b) => {
            if (b.gpa !== a.gpa) return b.gpa - a.gpa;
            if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
            return compareStudentsByRoll(a.student, b.student);
          });

        // 2. Failed / Incomplete students
        const failedStudents = meritCalculated
          .filter((m) => m.hasFail || m.subjectsWithMarksCount === 0)
          .sort((a, b) => {
            if (a.failedCount !== b.failedCount) return a.failedCount - b.failedCount;
            if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
            return compareStudentsByRoll(a.student, b.student);
          });

        const top1 = passedStudents[0];
        const top2 = passedStudents[1];
        const top3 = passedStudents[2];
        const scoreMetricLabel = isCombinedMode ? 'CGPA' : 'GPA';

        return (
          <div className="space-y-6">
            <div className={showMeritPrintModal || showTranscriptModal ? 'print:hidden space-y-6' : 'space-y-6'}>
            {/* Printable Official School Header for Merit List */}
            <div className="hidden print:block text-center pb-4 border-b-2 border-slate-900">
              <div className="flex items-center justify-center space-x-3 mb-1">
                <img
                  src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                  alt="School Logo"
                  className="w-14 h-14 object-contain"
                />
                <div>
                  <h1 className="text-xl font-black text-slate-950">{school.nameBn || school.nameEn}</h1>
                  <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{school.nameEn}</h2>
                </div>
              </div>
              <p className="text-[11px] text-slate-600">
                {school.addressBn} {school.eiin ? `• EIIN: ${school.eiin}` : ''} • Session: {school.currentSession}
              </p>
              <div className="inline-block mt-2 px-5 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded print:bg-black">
                {isCombinedMode
                  ? language === 'bn'
                    ? `চূড়ান্ত সমন্বিত মেধা তালিকা (সকল ${toBnNumber(effectiveExams.length)}টি পরীক্ষার CGPA) • ${selectedClass}`
                    : `FINAL COMBINED CGPA MERIT LIST (${effectiveExams.length} EXAMS) • ${selectedClass}`
                  : `${currentExam ? currentExam.nameBn || currentExam.nameEn : 'Examination'} • ${selectedClass} — ${
                      language === 'bn' ? 'অফিসিয়াল মেধা তালিকা (MERIT LIST)' : 'OFFICIAL MERIT LIST'
                    }`}
              </div>
              {isCombinedMode && effectiveExams.length > 0 && (
                <p className="text-[10px] text-slate-700 mt-1.5 font-semibold">
                  {language === 'bn' ? 'অন্তর্ভুক্ত পরীক্ষাসমূহ:' : 'Included Exams:'}{' '}
                  {effectiveExams.map((ex) => (language === 'bn' ? ex.nameBn || ex.nameEn : ex.nameEn)).join(' + ')}
                </p>
              )}
            </div>

            {promotionFeedback && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between print:hidden">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{promotionFeedback}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPromotionFeedback(null)}
                  className="text-emerald-700 hover:text-emerald-950"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Merit List Header and Filter Bar */}
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-4 print:hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 shadow-xs">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base flex flex-wrap items-center gap-2">
                      <span>
                        {isCombinedMode
                          ? language === 'bn'
                            ? `চূড়ান্ত সমন্বিত মেধা তালিকা (Final CGPA): ${selectedClass}`
                            : `Final Combined CGPA Merit List: ${selectedClass}`
                          : language === 'bn'
                          ? `অফিসিয়াল মেধা তালিকা (Merit List): ${selectedClass}`
                          : `Official Student Merit List: ${selectedClass}`}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                        {isCombinedMode
                          ? language === 'bn'
                            ? `${toBnNumber(effectiveExams.length)}টি পরীক্ষা → ১টি CGPA`
                            : `${effectiveExams.length} Exams → 1 CGPA`
                          : 'NCTB GPA 5.00'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isCombinedMode
                        ? language === 'bn'
                          ? `নির্বাচিত সকল ${toBnNumber(effectiveExams.length)}টি পরীক্ষার GPA সমন্বয় করে চূড়ান্ত CGPA হিসাব করা হয়েছে`
                          : `Combined CGPA calculated across ${effectiveExams.length} selected exams`
                        : currentExam?.nameEn || 'Term Examination'}{' '}
                      • {language === 'bn' ? 'মোট পরীক্ষার্থী' : 'Total Students'}:{' '}
                      {meritEligibleStudents.length} {language === 'bn' ? 'জন' : ''} •{' '}
                      {language === 'bn' ? 'উত্তীর্ণ' : 'Passed'}: {passedStudents.length}{' '}
                      {language === 'bn' ? 'জন' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowFormulaModal(true)}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    <span>{language === 'bn' ? 'গণনা পদ্ধতি জানুন' : 'Ranking Formula'}</span>
                  </button>

                  {canManage && activeRole !== 'teacher' && (
                    <button
                      type="button"
                      onClick={() => setShowMeritPromotionModal(true)}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>
                        {language === 'bn'
                          ? 'শ্রেণি ও শিক্ষাবর্ষ পরিবর্তন (Promote)'
                          : 'Promote Class & Year Change'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setMeritPrintOrientation(isCombinedMode && effectiveExams.length >= 3 ? 'landscape' : 'portrait');
                      setMeritPrintNotice(null);
                      setShowMeritPrintModal(true);
                    }}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>
                      {language === 'bn' ? 'মেধা তালিকা প্রিন্ট করুন' : 'Print Official Merit List'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Calculation Mode Switch + Multi-Exam CGPA Selector */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-amber-50/70 border border-blue-200 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex rounded-xl bg-white p-1 border border-slate-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setMeritMode('single')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        meritMode === 'single'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {language === 'bn' ? 'একক পরীক্ষা (Single Exam)' : 'Single Exam Only'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMeritMode('combined')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        meritMode === 'combined'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {language === 'bn'
                        ? 'সকল পরীক্ষা মিলিয়ে ১টি ফাইনাল CGPA (Combined)'
                        : 'Combined Final CGPA (All Selected Exams)'}
                    </button>
                  </div>

                  {isCombinedMode && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={combinedPassPolicy}
                        onChange={(e) =>
                          setCombinedPassPolicy(e.target.value as CombinedPassPolicy)
                        }
                        className="px-2.5 py-1.5 border border-blue-300 rounded-lg bg-white font-semibold text-blue-950 text-[11px]"
                      >
                        <option value="cumulative_cgpa">
                          {language === 'bn'
                            ? 'সমন্বিত গড় CGPA >= ১.০০ হলেই পাস (Cumulative)'
                            : 'Cumulative Average CGPA >= 1.00 Pass'}
                        </option>
                        <option value="strict_all_exams">
                          {language === 'bn'
                            ? 'সব নির্বাচিত পরীক্ষায় আলাদাভাবে পাস বাধ্যতামূলক (Strict)'
                            : 'Strict: Must Pass Every Selected Exam'}
                        </option>
                      </select>

                      <label className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer font-semibold text-[11px]">
                        <input
                          type="checkbox"
                          checked={useCustomExamWeights}
                          onChange={(e) => setUseCustomExamWeights(e.target.checked)}
                          className="w-3.5 h-3.5 text-blue-600 rounded"
                        />
                        <span>
                          {language === 'bn'
                            ? 'কাস্টম % ওয়েটেজ দিন'
                            : 'Custom Exam Weights (%)'}
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {isCombinedMode && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-slate-700">
                        {language === 'bn'
                          ? `ফাইনাল CGPA-তে যুক্ত করার জন্য পরীক্ষা নির্বাচন করুন (৩/৪/৫/৬টি বা সব পরীক্ষা):`
                          : `Select 3, 4, 5, 6 or all exams to combine into 1 Final CGPA:`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMeritSelectedExamIds(exams.map((e) => e.id))}
                        className="text-blue-700 font-bold hover:underline cursor-pointer"
                      >
                        {language === 'bn' ? 'সব পরীক্ষা সিলেক্ট করুন' : 'Select All Exams'}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {exams.map((ex) => {
                        const checked = meritSelectedExamIds.includes(ex.id);
                        return (
                          <div
                            key={ex.id}
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                              checked
                                ? 'bg-white border-blue-500 text-blue-950 shadow-2xs'
                                : 'bg-slate-100/70 border-slate-200 text-slate-500'
                            }`}
                          >
                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMeritExam(ex.id)}
                                className="w-3.5 h-3.5 text-blue-600 rounded"
                              />
                              <span>{language === 'bn' ? ex.nameBn || ex.nameEn : ex.nameEn}</span>
                            </label>
                            {checked && useCustomExamWeights && (
                              <div className="flex items-center space-x-1 pl-1.5 border-l border-slate-200">
                                <DigitInput
                                  min={1}
                                  max={100}
                                  value={meritExamWeights[ex.id] ?? 1}
                                  onValueChange={(val) =>
                                    setMeritExamWeights((prev) => ({
                                      ...prev,
                                      [ex.id]: Math.max(1, val || 1),
                                    }))
                                  }
                                  className="w-12 px-1.5 py-0.5 border border-blue-300 rounded text-center text-[11px] font-bold"
                                  title="Exam Weight"
                                />
                                <span className="text-[10px] text-slate-500">%</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Filtering Controls */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
                {/* Exam Selector (active in Single Exam mode) */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {language === 'bn' ? 'একক পরীক্ষা নির্বাচন' : 'Single Exam'}
                  </label>
                  <select
                    value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                    disabled={isCombinedMode}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-medium disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {language === 'bn' ? ex.nameBn : ex.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Class Selector */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {language === 'bn' ? 'শ্রেণি নির্বাচন' : 'Select Class'}
                  </label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    {activeClassInfos.map((cls) => (
                      <option key={cls.id} value={cls.name}>
                        {formatClassOptionLabel(cls, language)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {language === 'bn' ? 'শাখা' : 'Section'}
                  </label>
                  <select
                    value={meritSection}
                    onChange={(e) => setMeritSection(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">{language === 'bn' ? 'সকল শাখা (All Sections)' : 'All Sections'}</option>
                    {getSectionsForClass(selectedClass, academicClasses).map((sec) => (
                      <option key={sec} value={sec}>
                        Section {sec}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Shift Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {language === 'bn' ? 'শিফট' : 'Shift'}
                  </label>
                  <select
                    value={meritShift}
                    onChange={(e) => setMeritShift(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">{language === 'bn' ? 'সকল শিফট' : 'All Shifts'}</option>
                    <option value="Morning">Morning (প্রভাতি)</option>
                    <option value="Day">Day (দিবা)</option>
                  </select>
                </div>

                {/* Group Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {language === 'bn' ? 'বিভাগ (Group)' : 'Secondary Group'}
                  </label>
                  <select
                    value={meritGroup}
                    onChange={(e) => setMeritGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">{language === 'bn' ? 'সকল বিভাগ' : 'All Groups'}</option>
                    <option value="Science">Science (বিজ্ঞান)</option>
                    <option value="Commerce">Commerce (ব্যবসায়)</option>
                    <option value="Arts">Humanities (মানবিক)</option>
                    <option value="Vocational">Vocational (ভোকেশনাল)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* TOP 3 PODIUM CARDS */}
            {passedStudents.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
                {/* 1st Place (Gold) */}
                {top1 && (
                  <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-400 to-yellow-500 text-slate-900 shadow-md border-2 border-yellow-300">
                    <div className="absolute top-2 right-2 p-2 bg-white/30 backdrop-blur-xs rounded-full">
                      <Trophy className="w-6 h-6 text-yellow-950" />
                    </div>
                    <div className="inline-block px-2.5 py-0.5 rounded-full bg-yellow-950 text-amber-300 font-extrabold text-[11px] uppercase tracking-wider mb-3">
                      🥇 {language === 'bn' ? '১ম স্থান (Champion)' : '1st Place Champion'}
                    </div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-12 h-12 rounded-full border-2 border-yellow-900 bg-white flex items-center justify-center font-bold text-yellow-900 text-base shadow-xs overflow-hidden">
                        {top1.student.photoUrl ? (
                          <img src={top1.student.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          top1.student.nameEn.charAt(0)
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-yellow-950 leading-tight">
                          {language === 'bn' ? top1.student.nameBn || top1.student.nameEn : top1.student.nameEn}
                        </h4>
                        <p className="text-xs text-yellow-900 font-medium">
                          Roll: {top1.student.roll} • Sec {top1.student.section} • {top1.student.className}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-yellow-950/10 rounded-xl text-center text-xs font-bold text-yellow-950">
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-yellow-900">{scoreMetricLabel}</div>
                        <div className="text-sm font-black">{top1.gpa.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-yellow-900">Marks</div>
                        <div className="text-sm font-black">{top1.totalObtained}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-yellow-900">Grade</div>
                        <div className="text-sm font-black">{top1.overallGrade}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2nd Place (Silver) */}
                {top2 && (
                  <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 text-slate-800 shadow-xs border border-slate-300">
                    <div className="absolute top-2 right-2 p-2 bg-slate-400/20 rounded-full">
                      <Medal className="w-6 h-6 text-slate-600" />
                    </div>
                    <div className="inline-block px-2.5 py-0.5 rounded-full bg-slate-700 text-slate-100 font-extrabold text-[11px] uppercase tracking-wider mb-3">
                      🥈 {language === 'bn' ? '২য় স্থান (Runner-Up)' : '2nd Place Runner-Up'}
                    </div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-12 h-12 rounded-full border-2 border-slate-400 bg-white flex items-center justify-center font-bold text-slate-700 text-base shadow-xs overflow-hidden">
                        {top2.student.photoUrl ? (
                          <img src={top2.student.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          top2.student.nameEn.charAt(0)
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-slate-900 leading-tight">
                          {language === 'bn' ? top2.student.nameBn || top2.student.nameEn : top2.student.nameEn}
                        </h4>
                        <p className="text-xs text-slate-600 font-medium">
                          Roll: {top2.student.roll} • Sec {top2.student.section} • {top2.student.className}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-400/15 rounded-xl text-center text-xs font-bold text-slate-800">
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-600">{scoreMetricLabel}</div>
                        <div className="text-sm font-black">{top2.gpa.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-600">Marks</div>
                        <div className="text-sm font-black">{top2.totalObtained}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-600">Grade</div>
                        <div className="text-sm font-black">{top2.overallGrade}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3rd Place (Bronze) */}
                {top3 && (
                  <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-amber-700 via-amber-600 to-amber-800 text-white shadow-xs border border-amber-600">
                    <div className="absolute top-2 right-2 p-2 bg-white/20 rounded-full">
                      <Medal className="w-6 h-6 text-amber-200" />
                    </div>
                    <div className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-amber-100 font-extrabold text-[11px] uppercase tracking-wider mb-3">
                      🥉 {language === 'bn' ? '৩য় স্থান (3rd Place)' : '3rd Place'}
                    </div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-12 h-12 rounded-full border-2 border-amber-300 bg-white flex items-center justify-center font-bold text-amber-800 text-base shadow-xs overflow-hidden">
                        {top3.student.photoUrl ? (
                          <img src={top3.student.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          top3.student.nameEn.charAt(0)
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-white leading-tight">
                          {language === 'bn' ? top3.student.nameBn || top3.student.nameEn : top3.student.nameEn}
                        </h4>
                        <p className="text-xs text-amber-100 font-medium">
                          Roll: {top3.student.roll} • Sec {top3.student.section} • {top3.student.className}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-black/20 rounded-xl text-center text-xs font-bold text-white">
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-amber-200">{scoreMetricLabel}</div>
                        <div className="text-sm font-black">{top3.gpa.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-amber-200">Marks</div>
                        <div className="text-sm font-black">{top3.totalObtained}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-amber-200">Grade</div>
                        <div className="text-sm font-black">{top3.overallGrade}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FULL MERIT LIST TABLE */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden print:border-slate-900">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between print:bg-slate-100 print:border-slate-900">
                <span className="font-bold text-slate-800 text-xs">
                  {isCombinedMode
                    ? language === 'bn'
                      ? `সমন্বিত ফাইনাল CGPA মেধা তালিকা (মোট উত্তীর্ণ: ${toBnNumber(passedStudents.length)} জন)`
                      : `Combined Final CGPA Merit Order (Total Passed: ${passedStudents.length})`
                    : language === 'bn'
                    ? `মেধা অনুযায়ী ক্রমানুসারী তালিকা (মোট উত্তীর্ণ: ${passedStudents.length} জন)`
                    : `Complete Merit Ranked Order (Total Passed: ${passedStudents.length})`}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Sorted by: Highest {scoreMetricLabel} &rarr; Highest Total Marks &rarr; Roll
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px] print:border-slate-900">
                      <th className="py-3 px-3 text-center">মেধা স্থান (Rank)</th>
                      <th className="py-3 px-3">Roll & ID</th>
                      <th className="py-3 px-3">Student Name</th>
                      <th className="py-3 px-3">Section & Shift</th>
                      {isCombinedMode &&
                        effectiveExams.map((ex, eIdx) => (
                          <th
                            key={ex.id}
                            className="py-3 px-2 text-center border-l border-slate-200 text-[10px] bg-blue-50/50"
                            title={ex.nameEn}
                          >
                            <div className="truncate max-w-[90px]">
                              {language === 'bn' ? ex.nameBn || ex.nameEn : ex.nameEn}
                            </div>
                            <div className="text-[9px] font-semibold text-blue-700">
                              GPA {useCustomExamWeights ? `(${meritExamWeights[ex.id] ?? 1}%)` : `#${eIdx + 1}`}
                            </div>
                          </th>
                        ))}
                      <th className="py-3 px-3 text-center border-l border-slate-200">Total Marks</th>
                      <th className="py-3 px-3 text-center">%</th>
                      <th className="py-3 px-3 text-center bg-blue-50 text-blue-900">
                        {isCombinedMode ? 'Final CGPA' : 'GPA'}
                      </th>
                      <th className="py-3 px-3 text-center">Grade</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-right print:hidden">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {passedStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10 + (isCombinedMode ? effectiveExams.length : 0)}
                          className="py-10 text-center text-slate-400"
                        >
                          {language === 'bn'
                            ? 'এই শ্রেণি ও ফিল্টারের জন্য কোনো উত্তীর্ণ শিক্ষার্থীর ফলাফল পাওয়া যায়নি। অনুগ্রহ করে নম্বর এন্ট্রি সম্পন্ন করুন।'
                            : 'No passed students found for current filter. Please ensure marks entry has been entered.'}
                        </td>
                      </tr>
                    ) : (
                      passedStudents.map((item, idx) => {
                        const rank = idx + 1;
                        return (
                          <tr key={item.student.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Merit Rank Badge */}
                            <td className="py-3 px-3 text-center">
                              {rank === 1 ? (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 border border-amber-300 text-amber-800 font-black text-xs shadow-xs">
                                  1st
                                </span>
                              ) : rank === 2 ? (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 border border-slate-300 text-slate-800 font-black text-xs shadow-xs">
                                  2nd
                                </span>
                              ) : rank === 3 ? (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 border border-amber-700 text-amber-900 font-black text-xs shadow-xs">
                                  3rd
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                                  {language === 'bn' ? `${toBnNumber(rank)}ম` : `${rank}th`}
                                </span>
                              )}
                            </td>

                            {/* Roll & Student ID */}
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900">
                                Roll: {language === 'bn' ? toBnNumber(item.student.roll) : item.student.roll}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {item.student.studentId}
                              </div>
                            </td>

                            {/* Student Name */}
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900">
                                {language === 'bn' ? item.student.nameBn || item.student.nameEn : item.student.nameEn}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {item.student.group ? `${item.student.group} • ` : ''}
                                {item.student.nameEn}
                              </div>
                            </td>

                            {/* Section & Shift */}
                            <td className="py-3 px-3">
                              <span className="font-medium text-slate-700">Sec {item.student.section}</span>
                              <span className="text-[10px] text-slate-500 block">{item.student.shift}</span>
                            </td>

                            {/* Per-Exam Breakdowns (Combined mode) */}
                            {isCombinedMode &&
                              item.examBreakdowns.map((eb) => (
                                <td
                                  key={eb.examId}
                                  className="py-3 px-2 text-center border-l border-slate-100"
                                >
                                  {!eb.hasData ? (
                                    <span className="text-slate-300 text-[10px]">—</span>
                                  ) : eb.hasFail ? (
                                    <div>
                                      <span className="font-bold text-rose-600 text-[11px]">0.00</span>
                                      <span className="block text-[9px] text-rose-500">({eb.totalObtained})</span>
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="font-bold text-slate-800 text-[11px]">
                                        {eb.gpa.toFixed(2)}
                                      </span>
                                      <span className="block text-[9px] text-slate-400">
                                        ({eb.totalObtained})
                                      </span>
                                    </div>
                                  )}
                                </td>
                              ))}

                            {/* Obtained Marks */}
                            <td className="py-3 px-3 text-center font-bold text-slate-900 border-l border-slate-100">
                              {item.totalObtained}
                              <span className="text-[10px] text-slate-400 block font-normal">/{item.fullMarks}</span>
                            </td>

                            {/* Percentage */}
                            <td className="py-3 px-3 text-center font-semibold text-slate-700">
                              {item.percentage}%
                            </td>

                            {/* Final CGPA / GPA */}
                            <td className="py-3 px-3 text-center bg-blue-50/50">
                              <span className="font-black text-blue-800 text-xs">
                                {item.gpa.toFixed(2)}
                              </span>
                            </td>

                            {/* Overall Grade */}
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded font-black text-xs ${
                                  item.overallGrade === 'A+'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.overallGrade === 'A'
                                    ? 'bg-blue-100 text-blue-800'
                                    : item.overallGrade === 'A-'
                                    ? 'bg-cyan-100 text-cyan-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {item.overallGrade}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Passed</span>
                              </span>
                            </td>

                            {/* Action */}
                            <td className="py-3 px-3 text-right print:hidden">
                              <button
                                onClick={() => handleOpenTranscript(item.student)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-semibold text-[11px] transition-colors"
                              >
                                {language === 'bn' ? 'মার্কশিট' : 'Transcript'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* UNRANKED / FAILED STUDENTS SECTION */}
            {failedStudents.length > 0 && (
              <div className="bg-white rounded-xl border border-rose-200 shadow-xs overflow-hidden print:border-slate-900">
                <div className="p-4 bg-rose-50/70 border-b border-rose-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-rose-950 text-xs">
                      {language === 'bn'
                        ? `অনুত্তীর্ণ শিক্ষার্থী তালিকা (Unranked / Needs Improvement) - মোট: ${failedStudents.length} জন`
                        : `Unranked / Supplementary List (Total: ${failedStudents.length})`}
                    </span>
                  </div>
                  <span className="text-[11px] text-rose-700">
                    {isCombinedMode
                      ? language === 'bn'
                        ? 'সমন্বিত চূড়ান্ত ফলাফলে অকৃতকার্য বা নম্বর অসম্পূর্ণ'
                        : 'Failed or incomplete marks in combined final result'
                      : language === 'bn'
                      ? 'NCTB নিয়ম অনুযায়ী কোনো বিষয়ে F গ্রেড পেলে মেধা তালিকায় স্থান পাবে না'
                      : 'Students with F grade in any subject are placed in supplementary list'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                        <th className="py-2.5 px-4">Roll</th>
                        <th className="py-2.5 px-4">Student Name</th>
                        <th className="py-2.5 px-4">Section & Shift</th>
                        <th className="py-2.5 px-4 text-center">
                          {isCombinedMode
                            ? language === 'bn'
                              ? 'ফেল / অনুপস্থিত পরীক্ষা'
                              : 'Failed / Incomplete Exams'
                            : 'Failed Subjects'}
                        </th>
                        <th className="py-2.5 px-4 text-center">Marks</th>
                        <th className="py-2.5 px-4 text-center">{scoreMetricLabel}</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4 text-right print:hidden">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {failedStudents.map((item) => (
                        <tr key={item.student.id} className="hover:bg-rose-50/40">
                          <td className="py-2.5 px-4 font-bold text-slate-800">Roll: {item.student.roll}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">
                            {language === 'bn' ? item.student.nameBn || item.student.nameEn : item.student.nameEn}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">Sec {item.student.section} • {item.student.shift}</td>
                          <td className="py-2.5 px-4 text-center font-bold text-rose-600">
                            {isCombinedMode
                              ? item.examsCompletedCount === 0
                                ? 'No Exam Marks'
                                : `${item.failedCount} Exam(s)`
                              : item.failedCount > 0
                              ? `${item.failedCount} Subject(s)`
                              : 'Incomplete Marks'}
                          </td>
                          <td className="py-2.5 px-4 text-center font-semibold text-slate-700">{item.totalObtained}</td>
                          <td className="py-2.5 px-4 text-center font-bold text-rose-600">0.00 (F)</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              FAILED
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right print:hidden">
                            <button
                              onClick={() => handleOpenTranscript(item.student)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[11px]"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Print Signature Footer for Merit List */}
            <div className="hidden print:grid grid-cols-3 items-start gap-6 pt-8 mt-6 text-xs font-bold text-slate-800">
              <div className="text-center">
                <ClassTeacherSignatureDisplay
                  school={school}
                  className={selectedClass}
                  section={meritSection !== 'all' ? meritSection : undefined}
                  staffList={staffList}
                  fallbackText=""
                  heightClass="h-10"
                />
                <div className="border-t-2 border-slate-800 pt-1 mx-auto w-40">
                  {language === 'bn' ? 'শ্রেণি শিক্ষকের স্বাক্ষর' : 'Class Teacher'}
                </div>
              </div>
              <div className="text-center">
                <div className="h-10 mb-0.5" />
                <div className="border-t-2 border-slate-800 pt-1 mx-auto w-44">
                  {language === 'bn' ? 'পরীক্ষা নিয়ন্ত্রকের স্বাক্ষর' : 'Controller of Examinations'}
                </div>
              </div>
              <div className="text-center">
                <PrincipalSignatureDisplay school={school} fallbackText="" heightClass="h-10" />
                <div className="border-t-2 border-slate-800 pt-1 mx-auto w-48">
                  {language === 'bn' ? 'অধ্যক্ষ / প্রধান শিক্ষকের স্বাক্ষর ও সিল' : 'Principal Signature & Seal'}
                </div>
              </div>
            </div>

            {/* FORMULA & RANKING EXPLANATION MODAL */}
            {showFormulaModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                <div className="bg-white rounded-2xl max-w-lg w-full p-6 text-xs text-slate-800 shadow-2xl border border-slate-200 animate-in zoom-in-95">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                      <HelpCircle className="w-5 h-5 text-blue-600" />
                      <h4 className="font-bold text-slate-900 text-sm">
                        {language === 'bn' ? 'মেধা তালিকা ও ফাইনাল CGPA নির্ধারণের নিয়ম' : 'Merit List & Final CGPA Rules'}
                      </h4>
                    </div>
                    <button
                      onClick={() => setShowFormulaModal(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="mt-4 space-y-3.5 leading-relaxed text-slate-700">
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 font-medium">
                      বাংলাদেশ শিক্ষা বোর্ড ও NCTB কারিকুলাম নীতিমালা অনুযায়ী একক পরীক্ষার GPA অথবা একাধিক (৩, ৪, ৫, ৬টি) পরীক্ষার সমন্বয়ে চূড়ান্ত CGPA হিসাব করা হয়:
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-start space-x-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          ১
                        </span>
                        <div>
                          <strong className="text-slate-900">সমন্বিত চূড়ান্ত CGPA (Combined CGPA):</strong>
                          <p className="text-[11px] text-slate-600">
                            নির্বাচিত সকল পরীক্ষার (৩/৪/৫/৬টি) GPA-কে সমান গড় অথবা কাস্টম % ওয়েটেজ অনুযায়ী সমন্বয় করে ১টি চূড়ান্ত CGPA (সর্বোচ্চ ৫.০০) তৈরি করা হয়।
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          ২
                        </span>
                        <div>
                          <strong className="text-slate-900">টাই-ব্রেকার (মোট প্রাপ্ত নম্বর):</strong>
                          <p className="text-[11px] text-slate-600">
                            একাধিক শিক্ষার্থীর CGPA সমান হলে নির্বাচিত সকল পরীক্ষার মোট প্রাপ্ত নম্বর (Total Marks) অনুযায়ী যার নম্বর বেশি সে মেধা তালিকায় এগিয়ে থাকবে।
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          ৩
                        </span>
                        <div>
                          <strong className="text-slate-900">ক্লাস রোল অগ্রাধিকার:</strong>
                          <p className="text-[11px] text-slate-600">
                            CGPA এবং মোট নম্বর উভয়ই সমান হলে শিক্ষার্থীর পূর্বের ক্লাস রোল অনুযায়ী ক্রম নির্ধারণ করা হয়।
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2">
                        <span className="w-5 h-5 rounded-full bg-rose-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          ৪
                        </span>
                        <div>
                          <strong className="text-rose-900">পাস / ফেইল নিয়ম:</strong>
                          <p className="text-[11px] text-slate-600">
                            "Cumulative" মোডে সকল পরীক্ষা মিলিয়ে গড় CGPA কমপক্ষে ১.০০ হলে পাস; আর "Strict" মোডে প্রতিটি নির্বাচিত পরীক্ষায় আলাদাভাবে পাস করা বাধ্যতামূলক।
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => setShowFormulaModal(false)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs"
                    >
                      {language === 'bn' ? 'বুঝতে পেরেছি' : 'Got it'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* CLASS PROMOTION & YEAR CHANGE MODAL FROM MERIT LIST */}
            <MeritPromotionModal
              isOpen={showMeritPromotionModal}
              onClose={() => setShowMeritPromotionModal(false)}
              school={school}
              currentExam={currentExam}
              selectedClass={selectedClass}
              passedStudents={passedStudents}
              failedStudents={failedStudents}
              isCombinedCGPA={isCombinedMode}
              includedExamsCount={effectiveExams.length}
              language={language}
              toBnNumber={toBnNumber}
              onPromoted={(msg) => setPromotionFeedback(msg)}
            />
            </div>

            {/* OFFICIAL MERIT LIST PRINT PREVIEW & EXPORT MODAL */}
            {showMeritPrintModal && (() => {
              const escapeHtml = (val: string | number | undefined | null) =>
                String(val ?? '')
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');

              const examHeadingText = isCombinedMode
                ? language === 'bn'
                  ? `চূড়ান্ত সমন্বিত মেধা তালিকা (${toBnNumber(effectiveExams.length)}টি পরীক্ষার CGPA)`
                  : `Final Combined CGPA Merit List (${effectiveExams.length} Exams)`
                : `${currentExam ? (language === 'bn' ? currentExam.nameBn || currentExam.nameEn : currentExam.nameEn) : 'Examination'} — ${
                    language === 'bn' ? 'অফিসিয়াল মেধা তালিকা (Merit List)' : 'Official Merit List'
                  }`;

              const passRate =
                meritEligibleStudents.length > 0
                  ? Math.round((passedStudents.length / meritEligibleStudents.length) * 100)
                  : 0;

              const triggerDirectPrint = () => {
                setMeritPrintNotice(null);
                try {
                  window.print();
                } catch {
                  setMeritPrintNotice(
                    language === 'bn'
                      ? 'সরাসরি প্রিন্ট এই ব্রাউজারে ব্লক থাকলে পাশের "PDF / প্রিন্টেবল শিট ডাউনলোড" বাটনে চাপ দিন।'
                      : 'If direct printing is restricted in this browser, use "Download Printable Sheet (HTML/PDF)".'
                  );
                }
              };

              const handleDownloadPrintableHtml = () => {
                const printedDate = new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                });
                const combinedExamColsHeader = isCombinedMode
                  ? effectiveExams
                      .map(
                        (ex, idx) =>
                          `<th>${escapeHtml(language === 'bn' ? ex.nameBn || ex.nameEn : ex.nameEn)}<br/><span style="font-weight:500;font-size:9px;color:#1d4ed8;">GPA ${
                            useCustomExamWeights ? `(${meritExamWeights[ex.id] ?? 1}%)` : `#${idx + 1}`
                          }</span></th>`
                      )
                      .join('')
                  : '';

                const top3Html =
                  meritPrintIncludeTop3 && passedStudents.length > 0
                    ? `<div class="top3-grid">
                        ${[
                          { label: '১ম স্থান (1st)', item: top1, bg: '#fef3c7', border: '#f59e0b' },
                          { label: '২য় স্থান (2nd)', item: top2, bg: '#f1f5f9', border: '#94a3b8' },
                          { label: '৩য় স্থান (3rd)', item: top3, bg: '#ffedd5', border: '#d97706' },
                        ]
                          .filter((x) => !!x.item)
                          .map(
                            (x) => `
                          <div class="top-card" style="background:${x.bg};border:1.5px solid ${x.border};">
                            <div class="top-rank">${escapeHtml(x.label)}</div>
                            <div class="top-name">${escapeHtml(x.item!.student.nameBn || x.item!.student.nameEn)}</div>
                            <div class="top-sub">Roll: ${escapeHtml(x.item!.student.roll)} • Sec ${escapeHtml(x.item!.student.section)} • ${escapeHtml(x.item!.student.studentId)}</div>
                            <div class="top-score">${escapeHtml(scoreMetricLabel)}: <strong>${x.item!.gpa.toFixed(2)}</strong> (${escapeHtml(x.item!.overallGrade)}) • Marks: <strong>${x.item!.totalObtained}/${x.item!.fullMarks}</strong></div>
                          </div>`
                          )
                          .join('')}
                      </div>`
                    : '';

                const passedRowsHtml =
                  passedStudents.length === 0
                    ? `<tr><td colspan="${9 + (isCombinedMode ? effectiveExams.length : 0)}" style="text-align:center;padding:18px;color:#64748b;">কোনো উত্তীর্ণ শিক্ষার্থী পাওয়া যায়নি।</td></tr>`
                    : passedStudents
                        .map((item, idx) => {
                          const rank = idx + 1;
                          const examCells = isCombinedMode
                            ? item.examBreakdowns
                                .map((eb) =>
                                  !eb.hasData
                                    ? `<td style="text-align:center;color:#94a3b8;">—</td>`
                                    : eb.hasFail
                                    ? `<td style="text-align:center;color:#e11d48;font-weight:700;">0.00<br/><span style="font-size:9px;">(${eb.totalObtained})</span></td>`
                                    : `<td style="text-align:center;font-weight:700;">${eb.gpa.toFixed(2)}<br/><span style="font-size:9px;color:#64748b;font-weight:400;">(${eb.totalObtained})</span></td>`
                                )
                                .join('')
                            : '';

                          return `<tr>
                            <td style="text-align:center;font-weight:800;">${rank}</td>
                            <td><strong>${escapeHtml(item.student.roll)}</strong><br/><span style="font-size:9px;color:#64748b;">${escapeHtml(item.student.studentId)}</span></td>
                            <td><strong>${escapeHtml(item.student.nameBn || item.student.nameEn)}</strong><br/><span style="font-size:9px;color:#475569;">${escapeHtml(item.student.nameEn)}${item.student.group ? ` • ${escapeHtml(item.student.group)}` : ''}</span></td>
                            <td style="text-align:center;">Sec ${escapeHtml(item.student.section)}<br/><span style="font-size:9px;color:#64748b;">${escapeHtml(item.student.shift)}</span></td>
                            ${examCells}
                            <td style="text-align:center;font-weight:700;">${item.totalObtained}<span style="font-size:9px;color:#64748b;">/${item.fullMarks}</span></td>
                            <td style="text-align:center;">${item.percentage}%</td>
                            <td style="text-align:center;font-weight:800;color:#1e40af;background:#eff6ff;">${item.gpa.toFixed(2)}</td>
                            <td style="text-align:center;font-weight:800;">${escapeHtml(item.overallGrade)}</td>
                            <td style="text-align:center;color:#047857;font-weight:700;">Passed</td>
                          </tr>`;
                        })
                        .join('');

                const failedSectionHtml =
                  meritPrintIncludeFailed && failedStudents.length > 0
                    ? `<div class="failed-box">
                        <div class="section-title failed-title">অনুত্তীর্ণ / অসম্পূর্ণ শিক্ষার্থী তালিকা (Unranked / Needs Improvement — মোট: ${failedStudents.length} জন)</div>
                        <table>
                          <thead>
                            <tr>
                              <th style="width:70px;">Roll</th>
                              <th>Student Name</th>
                              <th>Section & Shift</th>
                              <th>${isCombinedMode ? 'Failed / Incomplete Exams' : 'Failed Subjects'}</th>
                              <th>Marks</th>
                              <th>${escapeHtml(scoreMetricLabel)}</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${failedStudents
                              .map(
                                (item) => `<tr>
                                <td style="text-align:center;font-weight:700;">${escapeHtml(item.student.roll)}</td>
                                <td><strong>${escapeHtml(item.student.nameBn || item.student.nameEn)}</strong></td>
                                <td style="text-align:center;">Sec ${escapeHtml(item.student.section)} • ${escapeHtml(item.student.shift)}</td>
                                <td style="text-align:center;color:#e11d48;font-weight:700;">${
                                  isCombinedMode
                                    ? item.examsCompletedCount === 0
                                      ? 'No Exam Marks'
                                      : `${item.failedCount} Exam(s)`
                                    : item.failedCount > 0
                                    ? `${item.failedCount} Subject(s)`
                                    : 'Incomplete Marks'
                                }</td>
                                <td style="text-align:center;">${item.totalObtained}</td>
                                <td style="text-align:center;color:#e11d48;font-weight:700;">0.00 (F)</td>
                                <td style="text-align:center;color:#be123c;font-weight:700;">FAILED</td>
                              </tr>`
                              )
                              .join('')}
                          </tbody>
                        </table>
                      </div>`
                    : '';

                const signaturesHtml = meritPrintIncludeSignatures
                  ? `<div class="footer">
                      <div class="sig-col">
                        <div class="sig-slot">${buildClassTeacherSignatureHtml(school, selectedClass, meritSection !== 'all' ? meritSection : undefined, staffList)}</div>
                        <div class="sig">শ্রেণি শিক্ষকের স্বাক্ষর<br/><span style="font-size:9px;font-weight:400;color:#64748b;">Class Teacher</span></div>
                      </div>
                      <div class="sig-col">
                        <div class="sig-slot"></div>
                        <div class="sig">পরীক্ষা নিয়ন্ত্রকের স্বাক্ষর<br/><span style="font-size:9px;font-weight:400;color:#64748b;">Controller of Examinations</span></div>
                      </div>
                      <div class="sig-col">
                        <div class="sig-slot">${buildPrincipalSignatureHtml(school)}</div>
                        <div class="sig">অধ্যক্ষ / প্রধান শিক্ষকের স্বাক্ষর ও সিল<br/><span style="font-size:9px;font-weight:400;color:#64748b;">Principal Signature & Seal</span></div>
                      </div>
                    </div>`
                  : '';

                const htmlDoc = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(selectedClass)} - Merit List</title>
  <style>
    @page { size: A4 ${meritPrintOrientation}; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif; color: #0f172a; margin: 0; padding: 16px; background: #fff; }
    .print-bar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1; }
    .btn-print { padding: 8px 16px; background: #d97706; color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; }
    .sheet { border: 2px solid #0f172a; padding: 16px; border-radius: 8px; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 10px; }
    .header-top { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .header img { width: 52px; height: 52px; object-fit: contain; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 900; }
    .header h2 { margin: 2px 0 0; font-size: 12px; color: #334155; text-transform: uppercase; letter-spacing: 0.05em; }
    .header p { margin: 4px 0 0; font-size: 11px; color: #475569; }
    .badge { display: inline-block; margin-top: 8px; padding: 4px 14px; background: #0f172a; color: #fff; font-size: 11px; font-weight: 800; border-radius: 4px; }
    .meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 7px 12px; border-radius: 6px; font-size: 11px; margin-bottom: 12px; }
    .top3-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .top-card { padding: 8px 10px; border-radius: 6px; font-size: 11px; }
    .top-rank { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #78350f; }
    .top-name { font-size: 13px; font-weight: 900; margin: 2px 0; }
    .top-sub { font-size: 10px; color: #475569; }
    .top-score { font-size: 11px; margin-top: 4px; }
    .section-title { font-size: 12px; font-weight: 800; padding: 6px 10px; background: #f1f5f9; border: 1px solid #0f172a; border-bottom: none; }
    .failed-box { margin-top: 14px; }
    .failed-title { background: #fff1f2; color: #9f1239; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #334155; padding: 6px 7px; vertical-align: middle; }
    th { background: #e2e8f0; font-weight: 800; text-align: center; font-size: 10px; text-transform: uppercase; }
    .footer { margin-top: 24px; display: grid; grid-template-columns: repeat(3, 1fr); align-items: start; gap: 20px; font-size: 11px; }
    .sig-col { text-align: center; }
    .sig-slot { height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px; }
    .sig { border-top: 1.5px solid #0f172a; padding-top: 4px; text-align: center; font-weight: 700; }
    @media print {
      .print-bar { display: none !important; }
      body { padding: 0; }
      .sheet { border-width: 1.5px; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div class="header-top">
        <img src="${escapeHtml(school.logoUrl || DEFAULT_SCHOOL_LOGO)}" alt="Logo" />
        <div>
          <h1>${escapeHtml(school.nameBn || school.nameEn)}</h1>
          <h2>${escapeHtml(school.nameEn)}</h2>
        </div>
      </div>
      <p>${escapeHtml(school.addressBn || school.addressEn)}${school.eiin ? ` • EIIN: ${escapeHtml(school.eiin)}` : ''} • ফোন: ${escapeHtml(school.phone)} • Session: ${escapeHtml(school.currentSession)}</p>
      <div class="badge">${escapeHtml(examHeadingText)} • ${escapeHtml(selectedClass)}</div>
    </div>
    <div class="meta">
      <span><strong>শ্রেণি:</strong> ${escapeHtml(selectedClass)} | <strong>শাখা:</strong> ${escapeHtml(meritSection === 'all' ? 'সকল' : meritSection)} | <strong>শিফট:</strong> ${escapeHtml(meritShift === 'all' ? 'সকল' : meritShift)} | <strong>বিভাগ:</strong> ${escapeHtml(meritGroup === 'all' ? 'সকল' : meritGroup)}</span>
      <span><strong>মোট পরীক্ষার্থী:</strong> ${meritEligibleStudents.length} • <strong>উত্তীর্ণ:</strong> ${passedStudents.length} • <strong>পাসের হার:</strong> ${passRate}% • <strong>তারিখ:</strong> ${escapeHtml(printedDate)}</span>
    </div>
    ${top3Html}
    <div class="section-title">মেধা অনুযায়ী ক্রমানুসারী তালিকা (Ranked Merit List - মোট উত্তীর্ণ: ${passedStudents.length} জন)</div>
    <table>
      <thead>
        <tr>
          <th style="width:52px;">স্থান (Rank)</th>
          <th style="width:95px;">Roll & ID</th>
          <th style="text-align:left;">Student Name</th>
          <th style="width:85px;">Section & Shift</th>
          ${combinedExamColsHeader}
          <th style="width:70px;">Total Marks</th>
          <th style="width:45px;">%</th>
          <th style="width:65px;">${escapeHtml(scoreMetricLabel)}</th>
          <th style="width:50px;">Grade</th>
          <th style="width:60px;">Status</th>
        </tr>
      </thead>
      <tbody>${passedRowsHtml}</tbody>
    </table>
    ${failedSectionHtml}
    ${signaturesHtml}
  </div>
</body>
</html>`;

                const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Merit_List_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setMeritPrintNotice(
                  language === 'bn'
                    ? '✓ প্রিন্টেবল মেধা তালিকা ফাইল ডাউনলোড হয়েছে! ফাইলটি ওপেন করে সহজেই Print বা Save as PDF করতে পারবেন।'
                    : '✓ Printable Merit List HTML file downloaded! Open it to Print or Save as PDF.'
                );
              };

              const handleDownloadMeritCsv = () => {
                const headers = [
                  'Merit Rank',
                  'Roll',
                  'Student ID',
                  'Name (Bn)',
                  'Name (En)',
                  'Class',
                  'Section',
                  'Shift',
                  'Group',
                  ...(isCombinedMode ? effectiveExams.map((ex) => `${ex.nameEn} GPA`) : []),
                  'Obtained Marks',
                  'Full Marks',
                  'Percentage',
                  scoreMetricLabel,
                  'Grade',
                  'Status',
                ];
                const escapeCsv = (v: string | number | undefined | null) => {
                  const s = String(v ?? '');
                  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                    return `"${s.replace(/"/g, '""')}"`;
                  }
                  return s;
                };
                const rows: (string | number)[][] = [];
                passedStudents.forEach((item, idx) => {
                  rows.push([
                    idx + 1,
                    item.student.roll,
                    item.student.studentId,
                    item.student.nameBn || item.student.nameEn,
                    item.student.nameEn,
                    item.student.className,
                    item.student.section,
                    item.student.shift,
                    item.student.group || 'General',
                    ...(isCombinedMode
                      ? item.examBreakdowns.map((eb) => (!eb.hasData ? '-' : eb.hasFail ? '0.00 (F)' : eb.gpa.toFixed(2)))
                      : []),
                    item.totalObtained,
                    item.fullMarks,
                    `${item.percentage}%`,
                    item.gpa.toFixed(2),
                    item.overallGrade,
                    'Passed',
                  ]);
                });
                if (meritPrintIncludeFailed) {
                  failedStudents.forEach((item) => {
                    rows.push([
                      'Unranked',
                      item.student.roll,
                      item.student.studentId,
                      item.student.nameBn || item.student.nameEn,
                      item.student.nameEn,
                      item.student.className,
                      item.student.section,
                      item.student.shift,
                      item.student.group || 'General',
                      ...(isCombinedMode
                        ? item.examBreakdowns.map((eb) => (!eb.hasData ? '-' : eb.hasFail ? '0.00 (F)' : eb.gpa.toFixed(2)))
                        : []),
                      item.totalObtained,
                      item.fullMarks,
                      `${item.percentage}%`,
                      '0.00',
                      'F',
                      'FAILED',
                    ]);
                  });
                }
                const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Merit_List_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setMeritPrintNotice(
                  language === 'bn' ? '✓ Excel / CSV ফাইল ডাউনলোড সম্পন্ন হয়েছে!' : '✓ Excel / CSV exported successfully!'
                );
              };

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-slate-950/80 backdrop-blur-xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:block">
                  <style>{`
                    @media print {
                      @page { size: A4 ${meritPrintOrientation}; margin: 10mm; }
                      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
                    }
                  `}</style>
                  <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-6xl w-full p-4 sm:p-6 text-xs max-h-[96vh] overflow-y-auto flex flex-col justify-between print:border-none print:shadow-none print:max-h-none print:p-0 print:rounded-none print:overflow-visible">
                    {/* Print Modal Top Controls (Hidden when printing) */}
                    <div className="space-y-3 pb-4 border-b border-slate-200 print:hidden shrink-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                            <Printer className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-black text-slate-900 text-sm sm:text-base">
                              {language === 'bn'
                                ? 'মেধা তালিকা প্রিন্ট প্রিভিউ ও ডাউনলোড'
                                : 'Merit List Print Preview & Export'}
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              {examHeadingText} • {selectedClass} • মোট উত্তীর্ণ: {passedStudents.length} জন
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={triggerDirectPrint}
                            className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl font-black text-xs shadow-md flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                            <span>{language === 'bn' ? 'প্রিন্ট করুন (A4)' : 'Print Now (A4)'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDownloadPrintableHtml}
                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                            <span>{language === 'bn' ? 'PDF / প্রিন্টেবল ফাইল' : 'Download Printable HTML'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDownloadMeritCsv}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center space-x-1.5 cursor-pointer"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>{language === 'bn' ? 'Excel / CSV' : 'Export CSV'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowMeritPrintModal(false)}
                            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                            aria-label="Close"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Customization Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px]">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="inline-flex rounded-lg bg-white p-0.5 border border-slate-200">
                            <button
                              type="button"
                              onClick={() => setMeritPrintOrientation('portrait')}
                              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                                meritPrintOrientation === 'portrait'
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              A4 Portrait
                            </button>
                            <button
                              type="button"
                              onClick={() => setMeritPrintOrientation('landscape')}
                              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                                meritPrintOrientation === 'landscape'
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              A4 Landscape
                            </button>
                          </div>

                          <label className="flex items-center space-x-1.5 font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={meritPrintIncludeTop3}
                              onChange={(e) => setMeritPrintIncludeTop3(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-amber-600"
                            />
                            <span>{language === 'bn' ? 'টপ ৩ কার্ড দেখান' : 'Show Top 3 Summary'}</span>
                          </label>

                          <label className="flex items-center space-x-1.5 font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={meritPrintIncludeFailed}
                              onChange={(e) => setMeritPrintIncludeFailed(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-rose-600"
                            />
                            <span>{language === 'bn' ? 'অকৃতকার্য তালিকা যুক্ত' : 'Include Unranked/Failed'}</span>
                          </label>

                          <label className="flex items-center space-x-1.5 font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={meritPrintIncludeSignatures}
                              onChange={(e) => setMeritPrintIncludeSignatures(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-blue-600"
                            />
                            <span>{language === 'bn' ? 'স্বাক্ষর ও সিল' : 'Signatures'}</span>
                          </label>
                        </div>

                        {meritPrintNotice && (
                          <span className="text-emerald-700 font-bold">{meritPrintNotice}</span>
                        )}
                      </div>
                    </div>

                    {/* Printable Official A4 Merit List Sheet */}
                    <div className="bg-white p-5 sm:p-7 border-2 border-slate-900 rounded-xl my-4 text-slate-900 print:my-0 print:p-4">
                      {/* School Header */}
                      <div className="text-center pb-3.5 border-b-2 border-slate-900">
                        <div className="flex items-center justify-center space-x-3 mb-1.5">
                          <img
                            src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                            alt="School Logo"
                            className="w-14 h-14 object-contain"
                          />
                          <div>
                            <h1 className="text-xl font-black text-slate-950 leading-tight">
                              {school.nameBn || school.nameEn}
                            </h1>
                            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              {school.nameEn}
                            </h2>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {school.addressBn || school.addressEn}{' '}
                          {school.eiin ? `• EIIN: ${school.eiin}` : ''} • ফোন: {school.phone} • Session:{' '}
                          {school.currentSession}
                        </p>
                        <div className="inline-block mt-2 px-5 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded print:bg-black">
                          {examHeadingText} • {selectedClass}
                        </div>
                      </div>

                      {/* Filter & Summary Meta Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-slate-100 border border-slate-300 rounded text-[11px] font-semibold my-3">
                        <span>
                          শ্রেণি: <strong>{selectedClass}</strong> • শাখা:{' '}
                          <strong>{meritSection === 'all' ? 'সকল' : meritSection}</strong> • শিফট:{' '}
                          <strong>{meritShift === 'all' ? 'সকল' : meritShift}</strong> • বিভাগ:{' '}
                          <strong>{meritGroup === 'all' ? 'সকল' : meritGroup}</strong>
                        </span>
                        <span>
                          মোট পরীক্ষার্থী: <strong>{meritEligibleStudents.length}</strong> • উত্তীর্ণ:{' '}
                          <strong className="text-emerald-700">{passedStudents.length}</strong> • পাসের হার:{' '}
                          <strong>{passRate}%</strong>
                        </span>
                      </div>

                      {/* Optional Top 3 Merit Summary Cards */}
                      {meritPrintIncludeTop3 && passedStudents.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                          {[
                            { title: '১ম স্থান (Champion)', entry: top1, cls: 'bg-amber-50 border-amber-400' },
                            { title: '২য় স্থান (2nd Place)', entry: top2, cls: 'bg-slate-50 border-slate-400' },
                            { title: '৩য় স্থান (3rd Place)', entry: top3, cls: 'bg-orange-50 border-orange-400' },
                          ]
                            .filter((x) => !!x.entry)
                            .map((x) => (
                              <div key={x.title} className={`p-2.5 rounded-lg border ${x.cls}`}>
                                <div className="text-[10px] font-black uppercase text-amber-900">{x.title}</div>
                                <div className="font-black text-xs text-slate-900 truncate">
                                  {x.entry!.student.nameBn || x.entry!.student.nameEn}
                                </div>
                                <div className="text-[10px] text-slate-600">
                                  Roll: {x.entry!.student.roll} • Sec {x.entry!.student.section}
                                </div>
                                <div className="text-[11px] font-bold text-slate-800 mt-1">
                                  {scoreMetricLabel}: {x.entry!.gpa.toFixed(2)} ({x.entry!.overallGrade}) • Marks:{' '}
                                  {x.entry!.totalObtained}/{x.entry!.fullMarks}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}

                      {/* Ranked Passed Students Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[11px] border border-slate-900">
                          <thead>
                            <tr className="bg-slate-200 text-slate-900 font-black text-center">
                              <th className="py-2 px-2 border border-slate-800 w-16">স্থান (Rank)</th>
                              <th className="py-2 px-2 border border-slate-800 text-left">Roll & ID</th>
                              <th className="py-2 px-2 border border-slate-800 text-left">Student Name</th>
                              <th className="py-2 px-2 border border-slate-800">Section & Shift</th>
                              {isCombinedMode &&
                                effectiveExams.map((ex, eIdx) => (
                                  <th key={ex.id} className="py-2 px-1.5 border border-slate-800 text-[10px]">
                                    <div>{language === 'bn' ? ex.nameBn || ex.nameEn : ex.nameEn}</div>
                                    <div className="text-[9px] text-blue-800 font-semibold">
                                      GPA {useCustomExamWeights ? `(${meritExamWeights[ex.id] ?? 1}%)` : `#${eIdx + 1}`}
                                    </div>
                                  </th>
                                ))}
                              <th className="py-2 px-2 border border-slate-800">Total Marks</th>
                              <th className="py-2 px-2 border border-slate-800">%</th>
                              <th className="py-2 px-2 border border-slate-800 bg-blue-100">{scoreMetricLabel}</th>
                              <th className="py-2 px-2 border border-slate-800">Grade</th>
                              <th className="py-2 px-2 border border-slate-800">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {passedStudents.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={9 + (isCombinedMode ? effectiveExams.length : 0)}
                                  className="py-6 text-center text-slate-500 border border-slate-800"
                                >
                                  {language === 'bn'
                                    ? 'কোনো উত্তীর্ণ শিক্ষার্থীর ফলাফল পাওয়া যায়নি।'
                                    : 'No passed students found.'}
                                </td>
                              </tr>
                            ) : (
                              passedStudents.map((item, idx) => (
                                <tr key={item.student.id} className="border-b border-slate-800">
                                  <td className="py-2 px-2 border border-slate-800 text-center font-black">
                                    {language === 'bn' ? `${toBnNumber(idx + 1)}ম` : `${idx + 1}`}
                                  </td>
                                  <td className="py-2 px-2 border border-slate-800">
                                    <div className="font-bold">Roll: {item.student.roll}</div>
                                    <div className="text-[9px] text-slate-600 font-mono">{item.student.studentId}</div>
                                  </td>
                                  <td className="py-2 px-2 border border-slate-800">
                                    <div className="font-bold text-slate-900">
                                      {item.student.nameBn || item.student.nameEn}
                                    </div>
                                    <div className="text-[9px] text-slate-600">
                                      {item.student.nameEn}
                                      {item.student.group ? ` • ${item.student.group}` : ''}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 border border-slate-800 text-center">
                                    <div>Sec {item.student.section}</div>
                                    <div className="text-[9px] text-slate-600">{item.student.shift}</div>
                                  </td>
                                  {isCombinedMode &&
                                    item.examBreakdowns.map((eb) => (
                                      <td key={eb.examId} className="py-2 px-1.5 border border-slate-800 text-center">
                                        {!eb.hasData ? (
                                          '—'
                                        ) : eb.hasFail ? (
                                          <span className="text-rose-700 font-bold">0.00 ({eb.totalObtained})</span>
                                        ) : (
                                          <span className="font-bold">
                                            {eb.gpa.toFixed(2)} <span className="font-normal text-[9px]">({eb.totalObtained})</span>
                                          </span>
                                        )}
                                      </td>
                                    ))}
                                  <td className="py-2 px-2 border border-slate-800 text-center font-bold">
                                    {item.totalObtained}/{item.fullMarks}
                                  </td>
                                  <td className="py-2 px-2 border border-slate-800 text-center">
                                    {item.percentage}%
                                  </td>
                                  <td className="py-2 px-2 border border-slate-800 text-center font-black text-blue-900 bg-blue-50">
                                    {item.gpa.toFixed(2)}
                                  </td>
                                  <td className="py-2 px-2 border border-slate-800 text-center font-black">
                                    {item.overallGrade}
                                  </td>
                                  <td className="py-2 px-2 border border-slate-800 text-center font-bold text-emerald-700">
                                    Passed
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Optional Failed / Unranked Table */}
                      {meritPrintIncludeFailed && failedStudents.length > 0 && (
                        <div className="mt-4">
                          <div className="px-3 py-1.5 bg-rose-50 border border-slate-900 border-b-0 font-bold text-rose-900 text-[11px]">
                            অনুত্তীর্ণ / অসম্পূর্ণ শিক্ষার্থী তালিকা (Unranked — মোট: {failedStudents.length} জন)
                          </div>
                          <table className="w-full text-left border-collapse text-[11px] border border-slate-900">
                            <thead>
                              <tr className="bg-slate-100 text-slate-800 font-bold text-center">
                                <th className="py-1.5 px-2 border border-slate-800 w-16">Roll</th>
                                <th className="py-1.5 px-2 border border-slate-800 text-left">Student Name</th>
                                <th className="py-1.5 px-2 border border-slate-800">Section & Shift</th>
                                <th className="py-1.5 px-2 border border-slate-800">
                                  {isCombinedMode ? 'Failed / Incomplete Exams' : 'Failed Subjects'}
                                </th>
                                <th className="py-1.5 px-2 border border-slate-800">Marks</th>
                                <th className="py-1.5 px-2 border border-slate-800">{scoreMetricLabel}</th>
                                <th className="py-1.5 px-2 border border-slate-800">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {failedStudents.map((item) => (
                                <tr key={item.student.id}>
                                  <td className="py-1.5 px-2 border border-slate-800 text-center font-bold">
                                    {item.student.roll}
                                  </td>
                                  <td className="py-1.5 px-2 border border-slate-800 font-semibold">
                                    {item.student.nameBn || item.student.nameEn}
                                  </td>
                                  <td className="py-1.5 px-2 border border-slate-800 text-center">
                                    Sec {item.student.section} • {item.student.shift}
                                  </td>
                                  <td className="py-1.5 px-2 border border-slate-800 text-center text-rose-700 font-bold">
                                    {isCombinedMode
                                      ? item.examsCompletedCount === 0
                                        ? 'No Exam Marks'
                                        : `${item.failedCount} Exam(s)`
                                      : item.failedCount > 0
                                      ? `${item.failedCount} Subject(s)`
                                      : 'Incomplete Marks'}
                                  </td>
                                  <td className="py-1.5 px-2 border border-slate-800 text-center">
                                    {item.totalObtained}
                                  </td>
                                  <td className="py-1.5 px-2 border border-slate-800 text-center text-rose-700 font-bold">
                                    0.00 (F)
                                  </td>
                                  <td className="py-1.5 px-2 border border-slate-800 text-center text-rose-700 font-bold">
                                    FAILED
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Official Signatures */}
                      {meritPrintIncludeSignatures && (
                        <div className="grid grid-cols-3 items-start gap-6 pt-6 mt-6 text-xs text-slate-800">
                          <div className="text-center">
                            <ClassTeacherSignatureDisplay
                              school={school}
                              className={selectedClass}
                              section={meritSection !== 'all' ? meritSection : undefined}
                              staffList={staffList}
                              fallbackText=""
                              heightClass="h-10"
                              textClassName="font-serif italic font-black text-sm text-slate-900"
                            />
                            <div className="border-t-2 border-slate-800 pt-1 mx-auto w-40 font-bold">
                              শ্রেণি শিক্ষকের স্বাক্ষর
                            </div>
                            <span className="text-[10px] text-slate-500">Class Teacher</span>
                          </div>
                          <div className="text-center">
                            <div className="h-10 mb-0.5" />
                            <div className="border-t-2 border-slate-800 pt-1 mx-auto w-44 font-bold">
                              পরীক্ষা নিয়ন্ত্রকের স্বাক্ষর
                            </div>
                            <span className="text-[10px] text-slate-500">Controller of Examinations</span>
                          </div>
                          <div className="text-center">
                            <PrincipalSignatureDisplay
                              school={school}
                              fallbackText=""
                              heightClass="h-10"
                              textClassName="font-serif italic font-black text-sm text-slate-900"
                            />
                            <div className="border-t-2 border-slate-800 pt-1 mx-auto w-48 font-bold">
                              অধ্যক্ষ / প্রধান শিক্ষকের স্বাক্ষর ও সিল
                            </div>
                            <span className="text-[10px] text-slate-500">Principal Signature & Seal</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Official Academic Transcript / Marksheet Modal (Single + Whole-Class Bulk + Bilingual/English) */}
      {showTranscriptModal && transcriptStudent && (() => {
        const bulkStudentsPool =
          activeRole === 'student'
            ? [transcriptStudent]
            : filteredReportCardStudents.length > 0 &&
              filteredReportCardStudents.some((s) => s.className === transcriptStudent.className)
            ? filteredReportCardStudents
            : students
                .filter((s) => s.className === transcriptStudent.className && s.status === 'active')
                .sort(compareStudentsByRoll);

        const targetClassStudentsAll = students
          .filter((s) => s.className === transcriptStudent.className && s.status === 'active')
          .sort(compareStudentsByRoll);

        const targetClassSubjects = subjects.filter((s) => s.className === transcriptStudent.className);

        const meritMap = computeClassExamMeritMap({
          classStudents: targetClassStudentsAll.length > 0 ? targetClassStudentsAll : [transcriptStudent],
          classSubjects: targetClassSubjects,
          getSubjectsForStudent: (std, subs) => getSubjectsForStudent(std, subs, academicClasses),
          getStudentMarkForSubject,
        });

        const studentsToRender = marksheetBulkMode && activeRole !== 'student' ? bulkStudentsPool : [transcriptStudent];

        const handleDownloadMarksheetsHtml = () => {
          const htmlDoc = buildMarksheetsPrintableHtml({
            studentsToRender,
            school,
            defaultLogoUrl: DEFAULT_SCHOOL_LOGO,
            exam: currentExam,
            classSubjects: targetClassSubjects,
            staffList,
            langMode: marksheetLangMode,
            getSubjectsForStudent: (std, subs) => getSubjectsForStudent(std, subs, academicClasses),
            getStudentMarkForSubject,
            meritMap,
            title: marksheetBulkMode
              ? `${transcriptStudent.className} - All Marksheets`
              : `${transcriptStudent.nameEn} - Marksheet`,
          });

          const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = marksheetBulkMode
            ? `Marksheets_${transcriptStudent.className.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`
            : `Marksheet_${transcriptStudent.studentId || transcriptStudent.roll}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setMarksheetPrintNotice(
            language === 'bn'
              ? '✓ প্রিন্টেবল মার্কশিট ফাইল ডাউনলোড হয়েছে — ওপেন করে সরাসরি Print বা Save as PDF করতে পারবেন!'
              : '✓ Printable marksheet file downloaded! Open it to Print or Save as PDF.'
          );
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:static print:inset-auto print:block print:p-0 print:bg-white print:overflow-visible">
            <style>{`
              @media print {
                @page { size: A4 portrait; margin: 8mm; }
                body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
                .marksheet-page-break { page-break-after: always !important; break-after: page !important; }
                .marksheet-page-break:last-child { page-break-after: auto !important; break-after: auto !important; }
              }
            `}</style>
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-3.5 md:p-5 my-4 max-h-[96vh] overflow-y-auto print:p-0 print:m-0 print:border-none print:shadow-none print:max-h-none print:max-w-none print:w-full print:rounded-none print:overflow-visible">
              {/* Modal Top Toolbar (Hidden on Print) */}
              <div className="space-y-2.5 pb-3 mb-3 border-b border-slate-200 print:hidden">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500 shrink-0" />
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                      {marksheetBulkMode
                        ? language === 'bn'
                          ? `পুরো শ্রেণির মার্কশিট (${transcriptStudent.className} — মোট ${studentsToRender.length} জন)`
                          : `Whole Class Marksheets (${transcriptStudent.className} — ${studentsToRender.length} Students)`
                        : language === 'bn'
                        ? 'অফিসিয়াল মার্কশিট ও গ্রেড ট্রান্সক্রিপ্ট'
                        : 'Official Academic Transcript'}
                    </h3>
                    {!marksheetBulkMode && transcriptStudent.group && (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[10px] font-bold">
                        {language === 'bn' ? 'গ্রুপ' : 'Group'}: {transcriptStudent.group}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {canManage && !marksheetBulkMode && (
                      <button
                        type="button"
                        onClick={() => setShowTranscriptSigEditor((v) => !v)}
                        className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                          showTranscriptSigEditor
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>{language === 'bn' ? 'শ্রেণি শিক্ষক স্বাক্ষর' : 'Class Teacher Sign'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleDownloadMarksheetsHtml}
                      className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                      title={
                        language === 'bn'
                          ? 'মোবাইল বা PDF প্রিন্টের জন্য ডাউনলোড করুন'
                          : 'Download printable file for PDF / Mobile'
                      }
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'PDF / HTML' : 'Download HTML/PDF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-xs"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>
                        {marksheetBulkMode
                          ? language === 'bn'
                            ? `সব প্রিন্ট (${studentsToRender.length})`
                            : `Print All (${studentsToRender.length})`
                          : language === 'bn'
                          ? 'প্রিন্ট'
                          : 'Print'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowTranscriptSigEditor(false);
                        setShowTranscriptModal(false);
                        setMarksheetPrintNotice(null);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Language Toggle + Single/Bulk Toggle Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-600">
                      {language === 'bn' ? 'মার্কশিটের ভাষা:' : 'Language:'}
                    </span>
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
                      {(
                        [
                          { id: 'bilingual', label: 'বাংলা + English' },
                          { id: 'bn', label: 'শুধু বাংলা' },
                          { id: 'en', label: 'English Only' },
                        ] as { id: MarksheetLanguageMode; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMarksheetLangMode(opt.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                            marksheetLangMode === opt.id
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeRole !== 'student' && bulkStudentsPool.length > 1 && (
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
                      <button
                        type="button"
                        onClick={() => setMarksheetBulkMode(false)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                          !marksheetBulkMode
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {language === 'bn' ? '১ জন শিক্ষার্থী' : 'Single Student'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTranscriptSigEditor(false);
                          setMarksheetBulkMode(true);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors flex items-center gap-1 ${
                          marksheetBulkMode
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Users className="w-3 h-3" />
                        <span>
                          {language === 'bn'
                            ? `পুরো শ্রেণি একসাথে (${bulkStudentsPool.length} জন)`
                            : `Whole Class (${bulkStudentsPool.length})`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {marksheetPrintNotice && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                    {marksheetPrintNotice}
                  </div>
                )}
              </div>

              {/* Inline Quick Class Teacher Signature Setup (Screen Only, Single Mode) */}
              {canManage && showTranscriptSigEditor && !marksheetBulkMode && (
                <div className="mb-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl print:hidden text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950">
                      {language === 'bn'
                        ? `${transcriptStudent.className} — শ্রেণি শিক্ষকের স্বাক্ষর সেট করুন`
                        : `${transcriptStudent.className} — Set Class Teacher Signature`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTranscriptSigEditor(false)}
                      className="text-slate-500 hover:text-slate-800 text-[11px] font-semibold"
                    >
                      {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={transcriptClassTeacherNameDraft}
                      onChange={(e) => setTranscriptClassTeacherNameDraft(e.target.value)}
                      placeholder={language === 'bn' ? 'শ্রেণি শিক্ষকের নাম লিখুন' : 'Class teacher name'}
                      className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const prevMap = school.classTeacherSignatures || {};
                        updateSchoolProfile({
                          ...school,
                          classTeacherSignatures: {
                            ...prevMap,
                            [transcriptStudent.className]: {
                              ...(prevMap[transcriptStudent.className] || {}),
                              name: transcriptClassTeacherNameDraft.trim(),
                            },
                          },
                        });
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs"
                    >
                      {language === 'bn' ? 'নাম সেভ' : 'Save Name'}
                    </button>
                    <label className="flex items-center space-x-1 px-3 py-1.5 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold cursor-pointer">
                      <PenTool className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'স্বাক্ষর ছবি আপলোড' : 'Upload Signature'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          let dataUrl = '';
                          try {
                            dataUrl = await compressSignatureImage(file, {
                              maxWidth: 420,
                              maxHeight: 140,
                              autoTransparentBg: true,
                            });
                          } catch {
                            dataUrl = await new Promise<string>((resolve) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve(String(reader.result || ''));
                              reader.readAsDataURL(file);
                            });
                          }
                          if (!dataUrl) return;
                          const prevMap = school.classTeacherSignatures || {};
                          updateSchoolProfile({
                            ...school,
                            classTeacherSignatures: {
                              ...prevMap,
                              [transcriptStudent.className]: {
                                ...(prevMap[transcriptStudent.className] || {}),
                                name:
                                  transcriptClassTeacherNameDraft.trim() ||
                                  prevMap[transcriptStudent.className]?.name ||
                                  '',
                                signatureUrl: dataUrl,
                              },
                            },
                          });
                        }}
                      />
                    </label>
                    {school.classTeacherSignatures?.[transcriptStudent.className]?.signatureUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const prevMap = school.classTeacherSignatures || {};
                          updateSchoolProfile({
                            ...school,
                            classTeacherSignatures: {
                              ...prevMap,
                              [transcriptStudent.className]: {
                                ...(prevMap[transcriptStudent.className] || {}),
                                signatureUrl: '',
                              },
                            },
                          });
                        }}
                        className="px-2.5 py-1.5 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-xs font-semibold"
                      >
                        {language === 'bn' ? 'স্বাক্ষর মুছুন' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Rendered Official Marksheet(s) — Single or Whole-Class (1 per A4 Page) */}
              <div className={marksheetBulkMode ? 'space-y-6 print:space-y-0' : ''}>
                {studentsToRender.map((std, idx) => {
                  const meritRes = meritMap.get(std.id) || {
                    status: 'pending' as const,
                    classRank: null,
                    classPassedCount: 0,
                    classTotalStudents: studentsToRender.length,
                    sectionRank: null,
                    sectionPassedCount: 0,
                    sectionTotalStudents: 0,
                    totalObtained: 0,
                    totalFullMarks: 0,
                    gpa: 0,
                    overallGrade: '—',
                    failedCount: 0,
                  };
                  return (
                    <React.Fragment key={std.id}>
                      {marksheetBulkMode && (
                        <div className="flex items-center justify-between px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 print:hidden">
                          <span>
                            {language === 'bn'
                              ? `পাতা ${idx + 1} / ${studentsToRender.length} • রোল ${std.roll} — ${std.nameBn || std.nameEn}`
                              : `Page ${idx + 1} of ${studentsToRender.length} • Roll ${std.roll} — ${std.nameEn}`}
                          </span>
                          <span className="font-mono text-slate-500">{std.studentId}</span>
                        </div>
                      )}
                      <OfficialMarksheetSheet
                        student={std}
                        school={school}
                        exam={currentExam}
                        classSubjects={targetClassSubjects}
                        staffList={staffList}
                        langMode={marksheetLangMode}
                        getSubjectsForStudent={(s, subs) => getSubjectsForStudent(s, subs, academicClasses)}
                        getStudentMarkForSubject={getStudentMarkForSubject}
                        meritResult={meritRes}
                        isBulkPage={marksheetBulkMode && idx < studentsToRender.length - 1}
                      />
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / Edit Exam Modal */}
      {showAddExamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingExam
                  ? (language === 'bn' ? 'পরীক্ষা সম্পাদনা করুন' : 'Edit Examination')
                  : (language === 'bn' ? 'নতুন পরীক্ষা তৈরি করুন' : 'Create New Examination')}
              </h3>
              <button
                onClick={() => {
                  setShowAddExamModal(false);
                  setEditingExam(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Quick Presets for Exam Types */}
            {!editingExam && (
              <div className="mt-3 p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <span className="text-[11px] font-bold text-blue-900 block mb-1.5 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>{language === 'bn' ? 'প্রচলিত পরীক্ষার প্রিসেট (ক্লিক করে অটো-পূরণ করুন):' : 'Standard Exam Presets (1-Click Auto-Fill):'}</span>
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleApplyExamPreset('1st Model Test Examination 2026', '১ম মডেল টেস্ট পরীক্ষা ২০২৬', 'model_test', '2026-03-20', '2026-03-31')}
                    className="p-1.5 bg-white hover:bg-blue-100/70 border border-blue-200 rounded text-left font-medium text-slate-800 transition-colors"
                  >
                    1. 1st Model Test (১ম মডেল টেস্ট)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyExamPreset('1st Semester Examination 2026', '১ম সেমিস্টার পরীক্ষা ২০২৬', 'half_yearly', '2026-06-15', '2026-06-30')}
                    className="p-1.5 bg-white hover:bg-blue-100/70 border border-blue-200 rounded text-left font-medium text-slate-800 transition-colors"
                  >
                    2. 1st Semester Exam (১ম সেমিস্টার)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyExamPreset('2nd Model Test Examination 2026', '২য় মডেল টেস্ট পরীক্ষা ২০২৬', 'model_test', '2026-08-10', '2026-08-20')}
                    className="p-1.5 bg-white hover:bg-blue-100/70 border border-blue-200 rounded text-left font-medium text-slate-800 transition-colors"
                  >
                    3. 2nd Model Test (২য় মডেল টেস্ট)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyExamPreset('2nd Semester Examination 2026', '২য় সেমিস্টার পরীক্ষা ২০২৬', 'half_yearly', '2026-09-15', '2026-09-30')}
                    className="p-1.5 bg-white hover:bg-blue-100/70 border border-blue-200 rounded text-left font-medium text-slate-800 transition-colors"
                  >
                    4. 2nd Semester Exam (২য় সেমিস্টার)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyExamPreset('3rd Model Test Examination 2026', '৩য় মডেল টেস্ট পরীক্ষা ২০২৬', 'model_test', '2026-10-25', '2026-11-05')}
                    className="p-1.5 bg-white hover:bg-blue-100/70 border border-blue-200 rounded text-left font-medium text-slate-800 transition-colors"
                  >
                    5. 3rd Model Test (৩য় মডেল টেস্ট)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyExamPreset('3rd Semester Examination 2026', '৩য় সেমিস্টার পরীক্ষা ২০২৬', 'annual', '2026-11-20', '2026-12-10')}
                    className="p-1.5 bg-white hover:bg-blue-100/70 border border-blue-200 rounded text-left font-medium text-slate-800 transition-colors"
                  >
                    6. 3rd Semester Exam (৩য় সেমিস্টার)
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateExam} className="mt-4 space-y-3">
              <div>
                <label className="block font-semibold mb-1">Exam Name (English) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1st Model Test Examination 2026"
                  value={newExamNameEn}
                  onChange={(e) => setNewExamNameEn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">পরীক্ষার নাম (বাংলায়)</label>
                <input
                  type="text"
                  placeholder="যেমন: ১ম মডেল টেস্ট পরীক্ষা ২০২৬"
                  value={newExamNameBn}
                  onChange={(e) => setNewExamNameBn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Exam Term / Type</label>
                <select
                  value={newExamTerm}
                  onChange={(e) => setNewExamTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="model_test">Model Test / Pre-Test (মডেল টেস্ট)</option>
                  <option value="half_yearly">Semester / Mid-Term (সেমিস্টার পরীক্ষা)</option>
                  <option value="annual">Final / Annual (চূড়ান্ত / বার্ষিক)</option>
                  <option value="1st_term">Class Test / 1st Term (ক্লাস টেস্ট)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newExamStart}
                    onChange={(e) => setNewExamStart(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">End Date</label>
                  <input
                    type="date"
                    value={newExamEnd}
                    onChange={(e) => setNewExamEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddExamModal(false);
                    setEditingExam(null);
                  }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs"
                >
                  {editingExam
                    ? (language === 'bn' ? 'পরিবর্তন সংরক্ষণ করুন' : 'Save Changes')
                    : (language === 'bn' ? 'পরীক্ষা তৈরি করুন' : 'Create Exam')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT EXAM ROUTINE ITEM MODAL */}
      {showRoutineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingRoutineItem
                    ? (language === 'bn' ? 'পরীক্ষার সময়সূচি সম্পাদনা' : 'Edit Exam Routine Subject')
                    : (language === 'bn' ? `${selectedClass}-এর পরীক্ষার সময়সূচি যোগ` : `Add Subject Schedule for ${selectedClass}`)}
                </h3>
              </div>
              <button
                onClick={() => setShowRoutineModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoutineItem} className="mt-4 space-y-3.5">
              <div>
                <label className="block font-semibold mb-1 text-slate-700">
                  {language === 'bn' ? 'বিষয় নির্বাচন করুন *' : 'Select Subject *'}
                </label>
                <select
                  required
                  value={routineSubjectId}
                  onChange={(e) => setRoutineSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold text-blue-900"
                >
                  {classSubjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.code} • {sub.nameEn} ({sub.nameBn})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'পরীক্ষার তারিখ *' : 'Exam Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={routineDate}
                    onChange={(e) => {
                      setRoutineDate(e.target.value);
                      if (e.target.value) {
                        const d = new Date(e.target.value);
                        setRoutineDay(daysOfWeek[d.getDay()] || 'Monday');
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'বার (Day of Week)' : 'Day of Week'}
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`${routineDay} ${daysOfWeekBn[routineDay] ? `(${daysOfWeekBn[routineDay]})` : ''}`}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'শুরুর সময় *' : 'Start Time *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10:00 AM"
                    value={routineStartTime}
                    onChange={(e) => setRoutineStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'শেষের সময় *' : 'End Time *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 01:00 PM"
                    value={routineEndTime}
                    onChange={(e) => setRoutineEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">
                  {language === 'bn' ? 'পরীক্ষা কক্ষ / হল নং' : 'Exam Room / Hall No'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Room 201 / Main Hall"
                  value={routineRoom}
                  onChange={(e) => setRoutineRoom(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRoutineModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs"
                >
                  {editingRoutineItem
                    ? (language === 'bn' ? 'হালনাগাদ করুন' : 'Update Subject')
                    : (language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Subject')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SMART AUTO EXAM ROUTINE GENERATOR MODAL */}
      {showAutoRoutineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 text-xs max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <span>{language === 'bn' ? 'স্বয়ংক্রিয় পরীক্ষার রুটিন জেনারেটর' : 'Smart Auto Exam Routine Generator'}</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[10px] font-bold">
                      Bangladesh Curriculum
                    </span>
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {language === 'bn'
                      ? 'ছুটির দিন বাদ দিয়ে এবং বিজ্ঞান, বাণিজ্য, মানবিক ও ভোকেশনাল ৪টি গ্রুপ বিষয় একই তারিখে প্যারালাল স্লট করে দ্রুত রুটিন তৈরি করুন।'
                      : 'Auto-generate schedule excluding off-days & aligning 4 group electives on identical dates.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAutoRoutineModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Presets Box */}
            <div className="mt-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50/70 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-600 fill-current shrink-0" />
                <div>
                  <strong className="text-slate-900 text-xs font-black">
                    {language === 'bn' ? '১ম মডেল টেস্ট পরীক্ষা প্রিসেট:' : '1st Model Test Preset:'}
                  </strong>
                  <span className="text-slate-600 text-[11px] ml-1">
                    ০৫/০৩/২০২৬ থেকে ২০/০৩/২০২৬ (শুক্রবার, শনিবার ও সরকারি ছুটি বাদ)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleApply1stModelTestPreset}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-xs transition-colors shrink-0"
              >
                {language === 'bn' ? 'এই প্রিসেট লোড করুন' : 'Load Preset'}
              </button>
            </div>

            <form onSubmit={handleExecuteSmartRoutine} className="mt-4 space-y-4">
              {/* Exam & Class Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold mb-1 text-slate-700">
                    {language === 'bn' ? 'টার্গেট পরীক্ষা *' : 'Target Exam *'}
                  </label>
                  <select
                    value={autoRoutineExamId || selectedExamId}
                    onChange={(e) => setAutoRoutineExamId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold text-slate-900"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.nameBn || ex.nameEn} ({ex.session})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1 text-slate-700">
                    {language === 'bn' ? 'কোন শ্রেণির জন্য রুটিন? *' : 'Target Class *'}
                  </label>
                  <select
                    value={autoRoutineTargetClass}
                    onChange={(e) => setAutoRoutineTargetClass(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold text-blue-900"
                  >
                    {[...activeClassInfos].reverse().map((cls) => (
                      <option key={cls.id} value={cls.name}>
                        {formatClassOptionLabel(cls, language)}
                        {cls.hasGroups ? (language === 'bn' ? ' - গ্রুপ সমন্বিত' : ' - Multi-Group') : ''}
                      </option>
                    ))}
                    <option value="all">
                      {language === 'bn'
                        ? `সকল শ্রেণি (${activeClassInfos[0]?.name || 'Start'} থেকে ${activeClassInfos[activeClassInfos.length - 1]?.name || 'End'} - All Classes)`
                        : 'All Active Classes'}
                    </option>
                  </select>
                </div>
              </div>

              {/* Date Range Selection */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center space-x-1.5">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>{language === 'bn' ? 'পরীক্ষার সময়সীমা (Date Range)' : 'Exam Date Range'}</span>
                  </span>
                  <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 rounded-full font-bold text-[11px]">
                    কার্যকরী কার্যদিবস: {previewWorkingDates.length} দিন
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                      {language === 'bn' ? 'শুরুর তারিখ (Start Date) *' : 'Start Date *'}
                    </label>
                    <input
                      type="date"
                      required
                      value={autoRoutineStartDate}
                      onChange={(e) => setAutoRoutineStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                      {language === 'bn' ? 'শেষের তারিখ (End Date) *' : 'End Date *'}
                    </label>
                    <input
                      type="date"
                      required
                      value={autoRoutineEndDate}
                      onChange={(e) => setAutoRoutineEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Exam Timing & Hall */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1 text-slate-700">
                    {language === 'bn' ? 'শুরুর সময় (Start Time) *' : 'Start Time *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10:00 AM"
                    value={autoRoutineStartTime}
                    onChange={(e) => setAutoRoutineStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1 text-slate-700">
                    {language === 'bn' ? 'শেষের সময় (End Time) *' : 'End Time *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 01:00 PM"
                    value={autoRoutineEndTime}
                    onChange={(e) => setAutoRoutineEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1 text-slate-700">
                    {language === 'bn' ? 'পরীক্ষা কক্ষ / হল (Hall/Room)' : 'Hall / Room'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Exam Hall / Room 201"
                    value={autoRoutineRoom}
                    onChange={(e) => setAutoRoutineRoom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                  />
                </div>
              </div>

              {/* Smart Skip & Group Parallel Rules */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <h5 className="font-extrabold text-slate-900 text-xs">
                  {language === 'bn' ? 'ছুটির দিন ও অটোমেটিক স্লটিং নিয়মাবলী:' : 'Off-Day & Smart Slotting Rules:'}
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer p-2 bg-white rounded-xl border border-slate-200 hover:border-blue-300">
                    <input
                      type="checkbox"
                      checked={autoRoutineSkipFridays}
                      onChange={(e) => setAutoRoutineSkipFridays(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="font-semibold text-slate-800">
                      {language === 'bn' ? 'শুক্রবার সাপ্তাহিক ছুটি বাদ দিন' : 'Skip Fridays (Weekly Weekend)'}
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer p-2 bg-white rounded-xl border border-slate-200 hover:border-blue-300">
                    <input
                      type="checkbox"
                      checked={autoRoutineSkipSaturdays}
                      onChange={(e) => setAutoRoutineSkipSaturdays(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="font-semibold text-slate-800">
                      {language === 'bn' ? 'শনিবার ছুটি বাদ দিন (স্কুল নিয়ম)' : 'Skip Saturdays (School Weekend)'}
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer p-2 bg-white rounded-xl border border-slate-200 hover:border-blue-300">
                    <input
                      type="checkbox"
                      checked={autoRoutineSkipHolidays}
                      onChange={(e) => setAutoRoutineSkipHolidays(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="font-semibold text-slate-800">
                      {language === 'bn' ? 'সরকারি ও প্রাতিষ্ঠানিক ছুটি বাদ দিন' : 'Skip Official School Holidays'}
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer p-2 bg-white rounded-xl border border-slate-200 hover:border-blue-300">
                    <input
                      type="checkbox"
                      checked={autoRoutineHasGaps}
                      onChange={(e) => setAutoRoutineHasGaps(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="font-semibold text-slate-800">
                      {language === 'bn' ? 'সম্ভব হলে ১ দিন প্রস্তুতি ছুটি (Gap)' : '1-Day Study Gap (If time permits)'}
                    </span>
                  </label>
                </div>

                {/* Highlighted Rule: 4 Group subjects on identical dates */}
                <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-300 rounded-xl">
                  <label className="flex items-start space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRoutineParallelGroup}
                      onChange={(e) => setAutoRoutineParallelGroup(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded mt-0.5"
                    />
                    <div>
                      <strong className="text-blue-950 text-xs block">
                        {language === 'bn'
                          ? 'বিজ্ঞান, ব্যবসায় শিক্ষা, মানবিক ও ভোকেশনাল বিষয় একই তারিখে সমান্তরাল স্লট করুন (সুপারিশকৃত)'
                          : 'Schedule Science, Commerce, Humanities & Vocational Electives on the Same Date (Recommended)'}
                      </strong>
                      <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                        {language === 'bn'
                          ? 'মাধ্যমিকের ৪টি বিভাগের শিক্ষার্থীরা একই সময়ে তাদের নিজস্ব বিভাগীয় বিষয়ে পরীক্ষা দিবে (যেমন: বিজ্ঞান পদার্থবিজ্ঞান, বাণিজ্য হিসাববিজ্ঞান, মানবিক ইতিহাস, ভোকেশনাল ট্রেড ১ একই দিনে)। ফলে পরীক্ষা মাত্র ৯টি কার্যদিবসে ২০/০৩/২০২৬-এর মধ্যে শেষ হবে।'
                          : 'All 4 streams take their respective departmental exam on the same day in parallel, ensuring the exam completes comfortably before March 20.'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Live Preview Timeline */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <h5 className="font-extrabold text-slate-900 text-xs">
                      {language === 'bn' ? 'রুটিন সময়সূচি লাইভ প্রিভিউ (Generated Preview)' : 'Generated Schedule Preview'}
                    </h5>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px]">
                    <span className="font-bold text-slate-600">
                      মোট স্লট: <strong className="text-blue-700">{previewSlots.length}টি</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-bold text-emerald-700">
                      {previewWorkingDates.length >= previewSlots.length
                        ? '✓ সময়সীমা নিখুঁতভাবে সমন্বিত'
                        : '⚠️ কিছু পরীক্ষা অতিরিক্ত দিনে গড়াতে পারে'}
                    </span>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {previewSlots.map((slot, sIdx) => {
                    const assignedDate = previewWorkingDates[sIdx] || {
                      dateStr: 'তারিখ হিসাব হচ্ছে...',
                      dayName: '—',
                    };

                    return (
                      <div key={sIdx} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 hover:bg-slate-50 text-[11px]">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-900 font-black flex items-center justify-center shrink-0">
                            {sIdx + 1}
                          </span>
                          <div>
                            <strong className="text-slate-900 block font-bold">
                              {slot.title}
                            </strong>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {slot.subjects.map((sub) => (
                                <span
                                  key={sub.id}
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    sub.group === 'Science'
                                      ? 'bg-blue-100 text-blue-900'
                                      : sub.group === 'Commerce'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : sub.group === 'Humanities'
                                      ? 'bg-amber-100 text-amber-900'
                                      : sub.group === 'Vocational'
                                      ? 'bg-purple-100 text-purple-900'
                                      : 'bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  {sub.group ? `${sub.group}: ` : ''}{sub.nameBn || sub.nameEn} ({sub.code})
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-slate-900 block">
                            {assignedDate.dateStr}
                          </span>
                          <span className="text-[10px] text-blue-600 font-semibold">
                            {assignedDate.dayName} {daysOfWeekBn[assignedDate.dayName] ? `(${daysOfWeekBn[assignedDate.dayName]})` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAutoRoutineModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl font-black shadow-md flex items-center space-x-1.5 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>
                    {language === 'bn' ? 'রুটিন তৈরি ও সংরক্ষণ করুন' : 'Generate & Save Routine'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Exam Routine Print Preview Modal */}
      {showRoutinePrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-5xl w-full p-4 sm:p-6 text-xs max-h-[96vh] overflow-y-auto flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 print:hidden shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">
                    {language === 'bn' ? 'পরীক্ষা রুটিন অফিসিয়াল প্রিন্ট প্রিভিউ' : 'Official Exam Timetable Print Preview'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {currentExam?.nameBn || currentExam?.nameEn} • {selectedClass} • সেশন ২০২৬
                  </p>
                </div>
              </div>

              {/* Group Filter inside Modal & Print Buttons */}
              <div className="flex items-center space-x-2">
                {classHasGroups(selectedClass, academicClasses) && (
                  <select
                    value={routineGroupFilter}
                    onChange={(e) => setRoutineGroupFilter(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs bg-slate-50 font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="all">সকল বিভাগ (All Groups)</option>
                    <option value="Science">বিজ্ঞান (Science)</option>
                    <option value="Commerce">ব্যবসায় শিক্ষা (Commerce)</option>
                    <option value="Humanities">মানবিক (Humanities)</option>
                    <option value="Vocational">ভোকেশনাল (Vocational)</option>
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-black text-xs shadow-md flex items-center space-x-1.5 active:scale-95 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>{language === 'bn' ? '🖨️ রুটিন প্রিন্ট করুন (A4)' : 'Print Routine (A4)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRoutinePrintModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Exam Routine Sheet */}
            <div className="printable-exam-sheet bg-white p-6 sm:p-8 border-2 border-slate-900 rounded-xl my-4 text-slate-900">
              {/* Institutional Header */}
              <div className="text-center pb-4 border-b-2 border-slate-900">
                <div className="flex items-center justify-center space-x-3 mb-2">
                  <img
                    src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="Logo"
                    className="w-14 h-14 object-contain"
                  />
                  <div className="text-center">
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                      {school.nameBn || school.nameEn}
                    </h1>
                    <h2 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                      {school.nameEn}
                    </h2>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600">
                  {school.addressBn} • EIIN: {school.eiin} • ফোন: {school.phone}
                </p>
                <div className="inline-block mt-2.5 px-5 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-md">
                  {currentExam?.nameBn || currentExam?.nameEn} - ২০২৬ • অফিসিয়াল পরীক্ষা সময়সূচি
                </div>
              </div>

              {/* Meta Info Bar */}
              <div className="flex flex-wrap items-center justify-between py-2 px-3 bg-slate-100 border-b border-slate-300 text-xs font-bold my-3">
                <span>শ্রেণি: <strong className="text-blue-900">{selectedClass}</strong></span>
                {classHasGroups(selectedClass, academicClasses) && (
                  <span>বিভাগ: <strong className="text-blue-900">{routineGroupFilter === 'all' ? 'সকল বিভাগ (সম্মিলিত)' : routineGroupFilter}</strong></span>
                )}
                <span>সেশন: <strong>২০২৬ (Session 2026)</strong></span>
                <span>মোট বিষয়: <strong>{displayClassRoutines.length} টি</strong></span>
              </div>

              {/* Subject Schedule Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border-2 border-slate-900">
                  <thead>
                    <tr className="bg-slate-200 border-b-2 border-slate-900 text-slate-900 font-black text-center">
                      <th className="py-2.5 px-3 border border-slate-900 w-12">ক্র.নং</th>
                      <th className="py-2.5 px-3 border border-slate-900 w-20">কোড</th>
                      <th className="py-2.5 px-3 border border-slate-900 text-left">বিষয়ের নাম (Subject)</th>
                      <th className="py-2.5 px-3 border border-slate-900 w-44">তারিখ ও বার (Exam Date & Day)</th>
                      <th className="py-2.5 px-3 border border-slate-900 w-36">সময় (Time)</th>
                      <th className="py-2.5 px-3 border border-slate-900 w-28">কক্ষ (Hall)</th>
                      <th className="py-2.5 px-3 border border-slate-900 w-28">গ্রুপ / শাখা</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayClassRoutines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400 font-bold border border-slate-900">
                          এই শ্রেণির জন্য কোনো পরীক্ষার রুটিন নির্ধারিত নেই।
                        </td>
                      </tr>
                    ) : (
                      displayClassRoutines.map((item, idx) => (
                        <tr key={item.id || idx} className="border-b border-slate-900 text-center hover:bg-slate-50">
                          <td className="py-2.5 px-2 font-bold border border-slate-900">{idx + 1}</td>
                          <td className="py-2.5 px-2 font-mono font-bold border border-slate-900 text-blue-900">{item.subjectCode}</td>
                          <td className="py-2.5 px-3 font-bold text-left border border-slate-900 text-slate-900">
                            {item.subjectNameBn || item.subjectNameEn}
                          </td>
                          <td className="py-2.5 px-3 border border-slate-900 font-mono font-bold text-slate-900">
                            {item.examDate}
                            <span className="block text-[10px] font-sans font-medium text-blue-700">
                              {item.dayOfWeek ? (daysOfWeekBn[item.dayOfWeek as keyof typeof daysOfWeekBn] || item.dayOfWeek) : ''}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 font-mono font-bold border border-slate-900 text-slate-800">
                            {item.startTime} - {item.endTime}
                          </td>
                          <td className="py-2.5 px-2 border border-slate-900 font-semibold text-slate-700">
                            {item.roomNo || 'মূল কেন্দ্র'}
                          </td>
                          <td className="py-2.5 px-2 border border-slate-900 font-bold text-slate-700 text-[10px]">
                            {item.group ? item.group : 'আবশ্যিক'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Instructions Box */}
              <div className="mt-4 p-3 bg-slate-50 border border-slate-300 rounded-lg text-[11px] text-slate-700 space-y-1">
                <span className="font-bold text-slate-900 block">পরীক্ষার্থীদের জন্য বিশেষ নির্দেশনাবলী:</span>
                <p>১. পরীক্ষা আরম্ভের অন্তত ৩০ (ত্রিশ) মিনিট পূর্বে পরীক্ষার্থীদের পরীক্ষা কক্ষে আসন গ্রহণ করতে হবে।</p>
                <p>২. প্রবেশপত্র (Admit Card) ব্যতীত কোনো অবস্থাতেই পরীক্ষা কেন্দ্রে প্রবেশ করতে দেওয়া হবে না।</p>
                <p>৩. পরীক্ষা কেন্দ্রে কোনো প্রকার মোবাইল ফোন, স্মার্টওয়াচ বা অনুমোদিত নয় এমন ডিভাইস আনা সম্পূর্ণ নিষিদ্ধ।</p>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 items-start gap-4 pt-6 mt-6 text-xs text-slate-800">
                <div className="text-center">
                  <ClassTeacherSignatureDisplay
                    school={school}
                    className={selectedClass}
                    staffList={staffList}
                    fallbackText=""
                    heightClass="h-11"
                    textClassName="font-serif italic font-black text-sm text-slate-900"
                  />
                  <div className="border-t-2 border-slate-800 pt-1 mx-auto w-40 sm:w-44 font-bold">
                    শ্রেণি শিক্ষকের স্বাক্ষর
                  </div>
                  <span className="text-[10px] text-slate-500">Class Teacher</span>
                </div>
                <div className="text-center">
                  <div className="h-11 mb-0.5" />
                  <div className="border-t-2 border-slate-800 pt-1 mx-auto w-40 sm:w-44 font-bold">
                    পরীক্ষা নিয়ন্ত্রকের স্বাক্ষর
                  </div>
                  <span className="text-[10px] text-slate-500">Controller of Examinations</span>
                </div>
                <div className="text-center">
                  <PrincipalSignatureDisplay
                    school={school}
                    fallbackText="Principal"
                    heightClass="h-11"
                    textClassName="font-serif italic font-black text-sm text-slate-900"
                  />
                  <div className="border-t-2 border-slate-800 pt-1 mx-auto w-44 sm:w-48 font-bold">
                    অধ্যক্ষ / প্রধান শিক্ষকের স্বাক্ষর ও সিল
                  </div>
                  <span className="text-[10px] text-slate-500">Principal Signature & Seal</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal for SuperAdmin */}
      {rejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 text-xs">
            <h4 className="font-bold text-slate-900 text-sm">
              {language === 'bn' ? 'সংশোধনের জন্য ফেরত পাঠান' : 'Return Draft for Revision'}
            </h4>
            <p className="text-slate-500 mt-1">
              {rejectDialog.label}
            </p>
            <form onSubmit={handleConfirmRejectDialog} className="mt-3 space-y-3">
              <textarea
                rows={3}
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                placeholder={
                  language === 'bn'
                    ? 'শিক্ষকের জন্য সংশোধন নির্দেশনা লিখুন...'
                    : 'Enter feedback or reason for returning draft...'
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectDialog(null)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 font-semibold"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
                >
                  {language === 'bn' ? 'ফেরত পাঠান' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
