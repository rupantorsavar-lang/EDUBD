import React, { useEffect, useMemo, useState } from 'react';
import {
  Exam,
  ExamSeatAssignment,
  ExamSeatPlanConfig,
  ExamSeatRoom,
  SchoolProfile,
  Student,
} from '../../types';
import { StorageService } from '../../services/storage';
import { getManagedClassNames } from '../../utils/academicClasses';
import { compareRolls, compareStudentsByClassAndRoll } from '../../utils/studentSort';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';
import { DigitInput } from '../common/DigitInput';
import {
  Building,
  CheckCircle2,
  Edit2,
  Grid,
  Layers,
  LayoutGrid,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Scissors,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Users,
  X,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  buildSuperAdminPublishMeta,
  buildTeacherDraftMeta,
  getApprovalStatusBadgeInfo,
  isSuperAdminApprover,
} from '../../utils/approvalWorkflow';
import { DraftApprovalStatus } from '../../types';

interface ExamSeatPlanTabProps {
  school: SchoolProfile;
  currentExam?: Exam;
  selectedExamId: string;
  selectedClass: string;
  allStudents: Student[];
  canManage: boolean;
  language: 'bn' | 'en';
  toBnNumber: (num: number | string | undefined | null) => string;
}

type PrintLayoutMode = 'room_map' | 'desk_stickers' | 'notice_summary';
type SeatStrategy = 'sequential' | 'zigzag_class' | 'zigzag_roll';

const DEFAULT_ROOMS: ExamSeatRoom[] = [
  {
    id: 'room_101',
    roomNo: 'Room 101',
    building: 'Academic Building (Ground Floor)',
    columns: 2,
    benchesPerColumn: 5,
    seatsPerBench: 2,
    invigilatorName: '',
  },
  {
    id: 'room_102',
    roomNo: 'Room 102',
    building: 'Academic Building (Ground Floor)',
    columns: 2,
    benchesPerColumn: 5,
    seatsPerBench: 2,
    invigilatorName: '',
  },
];

function getRoomCapacity(room: ExamSeatRoom): number {
  return Math.max(1, room.columns) * Math.max(1, room.benchesPerColumn) * room.seatsPerBench;
}

function getSeatPositionLabel(pos: number, seatsPerBench: number, lang: 'bn' | 'en'): string {
  if (seatsPerBench === 1) return lang === 'bn' ? 'একক' : 'Single';
  if (seatsPerBench === 2) {
    return pos === 1 ? (lang === 'bn' ? 'বাম' : 'L') : lang === 'bn' ? 'ডান' : 'R';
  }
  if (pos === 1) return lang === 'bn' ? 'বাম' : 'L';
  if (pos === 2) return lang === 'bn' ? 'মাঝ' : 'M';
  return lang === 'bn' ? 'ডান' : 'R';
}

export const ExamSeatPlanTab: React.FC<ExamSeatPlanTabProps> = ({
  school,
  currentExam,
  selectedExamId,
  selectedClass,
  allStudents,
  canManage,
  language,
  toBnNumber,
}) => {
  const { activeRole, currentUser } = useAuth();
  const isApprover = isSuperAdminApprover(activeRole);
  const actorName = currentUser?.nameBn || currentUser?.name || (isApprover ? 'Super Admin' : 'Teacher');

  const [rooms, setRooms] = useState<ExamSeatRoom[]>(DEFAULT_ROOMS);
  const [assignments, setAssignments] = useState<ExamSeatAssignment[]>([]);
  const [strategy, setStrategy] = useState<SeatStrategy>('sequential');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([selectedClass]);
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [printLayout, setPrintLayout] = useState<PrintLayoutMode>('room_map');
  const [printRoomFilter, setPrintRoomFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<DraftApprovalStatus>('draft');
  const [planSubmittedBy, setPlanSubmittedBy] = useState<string | undefined>(undefined);
  const [planApprovedBy, setPlanApprovedBy] = useState<string | undefined>(undefined);
  const [planRejectionNote, setPlanRejectionNote] = useState<string | undefined>(undefined);
  const [showRejectBox, setShowRejectBox] = useState<boolean>(false);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');

  // Add/Edit Room Modal
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ExamSeatRoom | null>(null);
  const [roomNoInput, setRoomNoInput] = useState('');
  const [buildingInput, setBuildingInput] = useState('');
  const [columnsInput, setColumnsInput] = useState(2);
  const [benchesInput, setBenchesInput] = useState(5);
  const [seatsPerBenchInput, setSeatsPerBenchInput] = useState<1 | 2 | 3>(2);
  const [invigilatorInput, setInvigilatorInput] = useState('');

  // Load saved seat plan for current exam
  const syncFromStorage = () => {
    const saved = StorageService.getExamSeatPlan(selectedExamId);
    if (saved) {
      setRooms(saved.rooms?.length ? saved.rooms : DEFAULT_ROOMS);
      setAssignments(saved.assignments || []);
      setStrategy(saved.strategy || 'sequential');
      setSelectedClasses(
        saved.selectedClasses?.length ? saved.selectedClasses : [selectedClass]
      );
      const effective: DraftApprovalStatus =
        saved.approvalStatus || (saved.isPublished === false ? 'draft' : 'published');
      setPlanStatus(effective);
      setPlanSubmittedBy(saved.submittedBy);
      setPlanApprovedBy(saved.approvedBy);
      setPlanRejectionNote(saved.rejectionNote);
    } else {
      setRooms(DEFAULT_ROOMS);
      setAssignments([]);
      setStrategy('sequential');
      setSelectedClasses([selectedClass]);
      setPlanStatus('draft');
      setPlanSubmittedBy(undefined);
      setPlanApprovedBy(undefined);
      setPlanRejectionNote(undefined);
    }
  };

  useEffect(() => {
    syncFromStorage();
    setPrintRoomFilter('all');
    setShowRejectBox(false);
    setRejectReasonInput('');
  }, [selectedExamId, selectedClass]);

  useEffect(() => {
    const handleSync = () => syncFromStorage();
    window.addEventListener('school_cloud_data_synced', handleSync);
    return () => window.removeEventListener('school_cloud_data_synced', handleSync);
  }, [selectedExamId, selectedClass]);

  const [managedClassNames, setManagedClassNames] = useState<string[]>(() =>
    getManagedClassNames(StorageService.getClasses())
  );

  useEffect(() => {
    const refreshClasses = () => {
      setManagedClassNames(getManagedClassNames(StorageService.getClasses()));
    };
    window.addEventListener('school_classes_updated', refreshClasses);
    window.addEventListener('school_cloud_data_synced', refreshClasses);
    return () => {
      window.removeEventListener('school_classes_updated', refreshClasses);
      window.removeEventListener('school_cloud_data_synced', refreshClasses);
    };
  }, []);

  const activeStudents = useMemo(
    () => allStudents.filter((s) => s.status === 'active'),
    [allStudents]
  );

  // Classes from Academic Structure + any active students' classes
  const availableClasses = useMemo(() => {
    const orderedNames = Array.from(
      new Set([
        ...managedClassNames,
        ...activeStudents.map((s) => s.className).filter(Boolean),
      ])
    );
    return orderedNames.map((cls) => ({
      name: cls,
      count: activeStudents.filter((s) => s.className === cls).length,
    }));
  }, [activeStudents, managedClassNames]);

  // Pool of eligible students based on class toggles, section, shift
  const eligibleStudents = useMemo(() => {
    const classSet = new Set(selectedClasses);
    return activeStudents
      .filter((s) => {
        if (!classSet.has(s.className)) return false;
        if (sectionFilter !== 'all' && s.section !== sectionFilter) return false;
        if (shiftFilter !== 'all' && s.shift !== shiftFilter) return false;
        return true;
      })
      .sort(compareStudentsByClassAndRoll);
  }, [activeStudents, selectedClasses, sectionFilter, shiftFilter]);

  const totalCapacity = useMemo(
    () => rooms.reduce((sum, r) => sum + getRoomCapacity(r), 0),
    [rooms]
  );

  const persistSeatPlan = (
    nextRooms: ExamSeatRoom[],
    nextAssignments: ExamSeatAssignment[],
    nextStrategy: SeatStrategy = strategy,
    nextClasses: string[] = selectedClasses
  ) => {
    const meta = isApprover
      ? buildSuperAdminPublishMeta(actorName)
      : buildTeacherDraftMeta(currentUser, 'draft');
    const isPub = isApprover;
    const payload: ExamSeatPlanConfig = {
      examId: selectedExamId,
      rooms: nextRooms,
      assignments: nextAssignments,
      strategy: nextStrategy,
      selectedClasses: nextClasses,
      updatedAt: new Date().toISOString(),
      ...meta,
      isPublished: isPub,
    };
    StorageService.saveExamSeatPlan(payload);
    setPlanStatus(meta.approvalStatus);
    setPlanSubmittedBy(meta.submittedBy);
    setPlanApprovedBy(meta.approvedBy);
    setPlanRejectionNote(undefined);
  };

  const handleSubmitSeatPlanDraft = () => {
    if (assignments.length === 0) {
      notify(
        language === 'bn'
          ? 'প্রথমে "স্বয়ংক্রিয় আসন বণ্টন" করে আসন বিন্যাসের খসড়া তৈরি করুন।'
          : 'Please auto-allocate seats first before submitting.'
      );
      return;
    }
    StorageService.submitExamSeatPlanDraft(selectedExamId, {
      name: actorName,
      id: currentUser?.id,
    });
    syncFromStorage();
    notify(
      language === 'bn'
        ? 'আসন বিন্যাসের খসড়া সুপার অ্যাডমিনের অনুমোদনের জন্য পাঠানো হয়েছে!'
        : 'Seat plan draft submitted for SuperAdmin approval!'
    );
  };

  const handleApproveAndPublishSeatPlan = () => {
    if (!isApprover) return;
    const ok = StorageService.approveExamSeatPlan(selectedExamId, actorName);
    if (!ok) {
      persistSeatPlan(rooms, assignments, strategy, selectedClasses);
    } else {
      syncFromStorage();
    }
    notify(
      language === 'bn'
        ? 'আসন বিন্যাস অনুমোদন ও আনুষ্ঠানিকভাবে প্রকাশ করা হয়েছে।'
        : 'Exam seat plan approved and published!'
    );
  };

  const handleConfirmRejectSeatPlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isApprover) return;
    StorageService.rejectExamSeatPlan(selectedExamId, actorName, rejectReasonInput);
    setShowRejectBox(false);
    setRejectReasonInput('');
    syncFromStorage();
    notify(
      language === 'bn'
        ? 'আসন বিন্যাস সংশোধনের জন্য শিক্ষকের কাছে ফেরত পাঠানো হয়েছে।'
        : 'Seat plan returned to teacher for revision.'
    );
  };

  const notify = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const toggleClassSelection = (clsName: string) => {
    setSelectedClasses((prev) => {
      if (prev.includes(clsName)) {
        if (prev.length === 1) return prev; // Keep at least 1 selected
        return prev.filter((c) => c !== clsName);
      }
      return [...prev, clsName];
    });
  };

  // Auto-allocate algorithm
  const handleAutoAllocate = () => {
    if (rooms.length === 0) {
      notify(
        language === 'bn'
          ? 'অনুগ্রহ করে প্রথমে অন্তত ১টি পরীক্ষা কক্ষ (Room) যোগ করুন।'
          : 'Please add at least 1 exam room first.'
      );
      return;
    }
    if (eligibleStudents.length === 0) {
      notify(
        language === 'bn'
          ? 'নির্বাচিত শ্রেণি ও ফিল্টারে কোনো সক্রিয় শিক্ষার্থী পাওয়া যায়নি।'
          : 'No active students found for the selected class/filters.'
      );
      return;
    }

    // Build ordered queue based on strategy
    let orderedQueue: Student[] = [];

    if (strategy === 'sequential') {
      orderedQueue = [...eligibleStudents];
    } else if (strategy === 'zigzag_class') {
      // Interleave students across classes (or sections if only 1 class)
      const buckets = new Map<string, Student[]>();
      const useClassBuckets = selectedClasses.length > 1;
      eligibleStudents.forEach((st) => {
        const key = useClassBuckets ? st.className : `${st.className}_${st.section}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(st);
      });
      const bucketLists = Array.from(buckets.values());
      let added = true;
      let idx = 0;
      while (added) {
        added = false;
        for (const list of bucketLists) {
          if (idx < list.length) {
            orderedQueue.push(list[idx]);
            added = true;
          }
        }
        idx++;
      }
    } else if (strategy === 'zigzag_roll') {
      // Odd index rolls paired with second half rolls so consecutive rolls don't sit together
      const half = Math.ceil(eligibleStudents.length / 2);
      const firstHalf = eligibleStudents.slice(0, half);
      const secondHalf = eligibleStudents.slice(half);
      for (let i = 0; i < half; i++) {
        if (firstHalf[i]) orderedQueue.push(firstHalf[i]);
        if (secondHalf[i]) orderedQueue.push(secondHalf[i]);
      }
    }

    // Fill rooms bench-by-bench (column by column, bench by bench, seat by seat)
    const generated: ExamSeatAssignment[] = [];
    let studentCursor = 0;

    for (const room of rooms) {
      if (studentCursor >= orderedQueue.length) break;
      let benchCounter = 1;
      for (let col = 1; col <= room.columns; col++) {
        for (let row = 1; row <= room.benchesPerColumn; row++) {
          const currentBenchNo = benchCounter++;
          for (let seatPos = 1; seatPos <= room.seatsPerBench; seatPos++) {
            if (studentCursor >= orderedQueue.length) break;
            const st = orderedQueue[studentCursor++];
            const seatLetter = seatPos === 1 ? 'A' : seatPos === 2 ? 'B' : 'C';
            generated.push({
              id: `seat_${selectedExamId}_${room.id}_${currentBenchNo}_${seatPos}`,
              examId: selectedExamId,
              roomId: room.id,
              roomNo: room.roomNo,
              columnIndex: col,
              benchNumber: currentBenchNo,
              seatPosition: seatPos,
              seatLabel: `${room.roomNo}-B${currentBenchNo}-${seatLetter}`,
              studentId: st.id,
              studentCode: st.studentId,
              studentNameEn: st.nameEn,
              studentNameBn: st.nameBn || st.nameEn,
              className: st.className,
              section: st.section,
              shift: st.shift,
              group: st.group,
              roll: st.roll,
            });
          }
        }
      }
    }

    setAssignments(generated);
    persistSeatPlan(rooms, generated, strategy, selectedClasses);

    const overflow = orderedQueue.length - generated.length;
    if (overflow > 0) {
      notify(
        language === 'bn'
          ? `${toBnNumber(generated.length)} জন শিক্ষার্থীর আসন বণ্টন সম্পন্ন হয়েছে! আরও ${toBnNumber(overflow)} জন শিক্ষার্থীর জন্য অতিরিক্ত কক্ষ বা বেঞ্চ প্রয়োজন।`
          : `Allocated ${generated.length} seats. ${overflow} students still need extra room capacity!`
      );
    } else {
      notify(
        language === 'bn'
          ? `সকল ${toBnNumber(generated.length)} জন শিক্ষার্থীর আসন বিন্যাস সফলভাবে তৈরি ও সংরক্ষিত হয়েছে!`
          : `Successfully allocated & saved seats for all ${generated.length} students!`
      );
    }
  };

  const handleClearAssignments = () => {
    setAssignments([]);
    persistSeatPlan(rooms, [], strategy, selectedClasses);
    notify(language === 'bn' ? 'আসন বণ্টন রিসেট করা হয়েছে।' : 'Seat assignments cleared.');
  };

  // Room Modal handlers
  const openAddRoomModal = () => {
    setEditingRoom(null);
    const nextNum = 101 + rooms.length;
    setRoomNoInput(`Room ${nextNum}`);
    setBuildingInput(language === 'bn' ? 'একাডেমিক ভবন' : 'Academic Building');
    setColumnsInput(2);
    setBenchesInput(5);
    setSeatsPerBenchInput(2);
    setInvigilatorInput('');
    setShowRoomModal(true);
  };

  const openEditRoomModal = (room: ExamSeatRoom) => {
    setEditingRoom(room);
    setRoomNoInput(room.roomNo);
    setBuildingInput(room.building || '');
    setColumnsInput(room.columns);
    setBenchesInput(room.benchesPerColumn);
    setSeatsPerBenchInput(room.seatsPerBench);
    setInvigilatorInput(room.invigilatorName || '');
    setShowRoomModal(true);
  };

  const handleSaveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNoInput.trim()) return;
    let nextRooms: ExamSeatRoom[];
    if (editingRoom) {
      nextRooms = rooms.map((r) =>
        r.id === editingRoom.id
          ? {
              ...r,
              roomNo: roomNoInput.trim(),
              building: buildingInput.trim(),
              columns: Math.max(1, Math.min(6, Number(columnsInput) || 2)),
              benchesPerColumn: Math.max(1, Math.min(20, Number(benchesInput) || 5)),
              seatsPerBench: seatsPerBenchInput,
              invigilatorName: invigilatorInput.trim(),
            }
          : r
      );
    } else {
      const created: ExamSeatRoom = {
        id: `room_${Date.now()}`,
        roomNo: roomNoInput.trim(),
        building: buildingInput.trim(),
        columns: Math.max(1, Math.min(6, Number(columnsInput) || 2)),
        benchesPerColumn: Math.max(1, Math.min(20, Number(benchesInput) || 5)),
        seatsPerBench: seatsPerBenchInput,
        invigilatorName: invigilatorInput.trim(),
      };
      nextRooms = [...rooms, created];
    }
    setRooms(nextRooms);
    // Sync roomNo labels on existing assignments if room renamed
    const updatedAssignments = editingRoom
      ? assignments.map((a) =>
          a.roomId === editingRoom.id ? { ...a, roomNo: roomNoInput.trim() } : a
        )
      : assignments;
    setAssignments(updatedAssignments);
    persistSeatPlan(nextRooms, updatedAssignments);
    setShowRoomModal(false);
  };

  const handleDeleteRoom = (roomId: string) => {
    const nextRooms = rooms.filter((r) => r.id !== roomId);
    const nextAssignments = assignments.filter((a) => a.roomId !== roomId);
    setRooms(nextRooms);
    setAssignments(nextAssignments);
    persistSeatPlan(nextRooms, nextAssignments);
  };

  // Filtered rooms for display/print
  const visibleRooms = useMemo(() => {
    if (printRoomFilter === 'all') return rooms;
    return rooms.filter((r) => r.id === printRoomFilter);
  }, [rooms, printRoomFilter]);

  const visibleAssignments = useMemo(() => {
    if (printRoomFilter === 'all') return assignments;
    return assignments.filter((a) => a.roomId === printRoomFilter);
  }, [assignments, printRoomFilter]);

  // Notice Board Summary Data per room
  const roomSummaries = useMemo(() => {
    return rooms.map((room) => {
      const roomSeats = assignments.filter((a) => a.roomId === room.id);
      const classGroups = new Map<string, string[]>();
      roomSeats.forEach((seat) => {
        if (!classGroups.has(seat.className)) classGroups.set(seat.className, []);
        classGroups.get(seat.className)!.push(seat.roll);
      });
      const breakdown = Array.from(classGroups.entries()).map(([cls, rolls]) => {
        const sortedRolls = [...rolls].sort((a, b) => compareRolls(a, b));
        const minRoll = sortedRolls[0];
        const maxRoll = sortedRolls[sortedRolls.length - 1];
        return {
          className: cls,
          count: rolls.length,
          rollRange: sortedRolls.length === 1 ? minRoll : `${minRoll} – ${maxRoll}`,
        };
      });
      return {
        room,
        capacity: getRoomCapacity(room),
        assignedCount: roomSeats.length,
        breakdown,
      };
    });
  }, [rooms, assignments]);

  const unassignedCount = Math.max(0, eligibleStudents.length - assignments.length);

  return (
    <div className="space-y-4">
      {/* Print CSS for clean A4 layout */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
          }
          .seatplan-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .seatplan-page-break:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .seatplan-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* CONTROL PANEL (Hidden when printing) */}
      <div className="space-y-4 print:hidden">
        {/* Top Banner */}
        <div className="p-5 bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white rounded-2xl shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-extrabold uppercase tracking-wider">
                {language === 'bn' ? 'প্রিন্ট-রেডি আসন বিন্যাস' : 'Printable Exam Seat Plan'}
              </span>
              <span className="text-blue-200 text-xs font-semibold">
                {currentExam ? (language === 'bn' ? currentExam.nameBn : currentExam.nameEn) : 'Exam'}
              </span>
            </div>
            <h3 className="text-lg font-black mt-1">
              {language === 'bn'
                ? 'পরীক্ষার হল ও আসন বিন্যাস (Exam Seat Plan)'
                : 'Exam Hall & Seat Plan Manager'}
            </h3>
            <p className="text-xs text-blue-200 mt-0.5">
              {language === 'bn'
                ? 'কক্ষ ও বেঞ্চ নির্ধারণ করে স্বয়ংক্রিয়ভাবে সিট প্ল্যান তৈরি করুন এবং কক্ষ ম্যাপ, বেঞ্চ স্টিকার বা নোটিশ শিট A4 কাগজে প্রিন্ট করুন।'
                : 'Configure rooms & benches, auto-allocate students, and print Room Maps, Desk Stickers, or Notice Board Summaries.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={openAddRoomModal}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/25 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-emerald-300" />
                  <span>{language === 'bn' ? 'নতুন কক্ষ যোগ' : 'Add Room'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleAutoAllocate}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{language === 'bn' ? 'স্বয়ংক্রিয় আসন বণ্টন' : 'Auto Allocate Seats'}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              disabled={assignments.length === 0 && printLayout !== 'room_map'}
              className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'bn' ? 'প্রিন্ট করুন (A4)' : 'Print Seat Plan (A4)'}</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedback}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-emerald-700 hover:text-emerald-950">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Draft -> SuperAdmin Approval Status Bar */}
        {(() => {
          const badge = getApprovalStatusBadgeInfo(planStatus, language);
          return (
            <div
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                badge.status === 'published'
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : badge.status === 'pending_approval'
                  ? 'bg-amber-50 border-amber-200'
                  : badge.status === 'rejected'
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${badge.badgeClass}`}>
                    {badge.label}
                  </span>
                  {planSubmittedBy && badge.status !== 'published' && (
                    <span className="text-[11px] text-slate-600 font-medium">
                      {language === 'bn' ? `প্রস্তুতকারক: ${planSubmittedBy}` : `Prepared by: ${planSubmittedBy}`}
                    </span>
                  )}
                  {planApprovedBy && badge.status === 'published' && (
                    <span className="text-[11px] text-emerald-800 font-medium">
                      {language === 'bn' ? `অনুমোদনকারী: ${planApprovedBy}` : `Approved by: ${planApprovedBy}`}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600">
                  {badge.status === 'published'
                    ? (language === 'bn'
                        ? 'এই পরীক্ষার আসন বিন্যাস সুপার অ্যাডমিন কর্তৃক অনুমোদিত ও প্রকাশিত।'
                        : 'This seat plan is approved and officially published.')
                    : badge.status === 'pending_approval'
                    ? (language === 'bn'
                        ? 'আসন বিন্যাসটি সুপার অ্যাডমিনের অনুমোদনের অপেক্ষায় রয়েছে।'
                        : 'Seat plan draft is awaiting SuperAdmin approval.')
                    : badge.status === 'rejected'
                    ? (language === 'bn'
                        ? `সংশোধনের জন্য ফেরত: ${planRejectionNote || 'পুনরায় যাচাই করে জমা দিন'}`
                        : `Returned: ${planRejectionNote || 'Please revise and resubmit.'}`)
                    : (language === 'bn'
                        ? 'আসন বিন্যাসটি খসড়া হিসেবে সংরক্ষিত আছে। অনুমোদনের জন্য সুপার অ্যাডমিনের কাছে পাঠান।'
                        : 'Seat plan is saved as a draft. Submit for SuperAdmin approval to publish.')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!isApprover && canManage && assignments.length > 0 && badge.status !== 'published' && (
                  <button
                    type="button"
                    onClick={handleSubmitSeatPlanDraft}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {badge.status === 'pending_approval'
                        ? (language === 'bn' ? 'পুনরায় অনুমোদনে পাঠান' : 'Resubmit Draft')
                        : (language === 'bn' ? 'অনুমোদনের জন্য পাঠান' : 'Submit to SuperAdmin')}
                    </span>
                  </button>
                )}

                {isApprover && assignments.length > 0 && badge.status !== 'published' && (
                  <>
                    <button
                      type="button"
                      onClick={handleApproveAndPublishSeatPlan}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {language === 'bn' ? 'অনুমোদন ও প্রকাশ করুন' : 'Approve & Publish'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRejectBox((prev) => !prev)}
                      className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-xl font-bold cursor-pointer"
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

        {isApprover && showRejectBox && (
          <form
            onSubmit={handleConfirmRejectSeatPlan}
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs"
          >
            <input
              type="text"
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder={language === 'bn' ? 'সংশোধনের কারণ লিখুন (যেমন: কক্ষ নং ১০২ যোগ করুন)...' : 'Reason for returning seat plan...'}
              className="flex-1 px-3 py-2 bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
              >
                {language === 'bn' ? 'নিশ্চিত করে ফেরত দিন' : 'Confirm Return'}
              </button>
              <button
                type="button"
                onClick={() => setShowRejectBox(false)}
                className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
            </div>
          </form>
        )}

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                {language === 'bn' ? 'মোট পরীক্ষা কক্ষ' : 'Exam Rooms'}
              </div>
              <div className="text-xl font-black text-slate-900 mt-0.5">
                {language === 'bn' ? toBnNumber(rooms.length) : rooms.length}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <Building className="w-5 h-5" />
            </div>
          </div>
          <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                {language === 'bn' ? 'মোট আসন ধারণক্ষমতা' : 'Total Seat Capacity'}
              </div>
              <div className="text-xl font-black text-indigo-700 mt-0.5">
                {language === 'bn' ? toBnNumber(totalCapacity) : totalCapacity}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <LayoutGrid className="w-5 h-5" />
            </div>
          </div>
          <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                {language === 'bn' ? 'নির্বাচিত পরীক্ষার্থী' : 'Eligible Students'}
              </div>
              <div className="text-xl font-black text-slate-900 mt-0.5">
                {language === 'bn' ? toBnNumber(eligibleStudents.length) : eligibleStudents.length}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                {language === 'bn' ? 'আসন বরাদ্দ হয়েছে' : 'Assigned Seats'}
              </div>
              <div className="text-xl font-black text-emerald-700 mt-0.5">
                {language === 'bn' ? toBnNumber(assignments.length) : assignments.length}
                {unassignedCount > 0 && assignments.length > 0 && (
                  <span className="text-[11px] font-bold text-rose-600 ml-1.5">
                    ({language === 'bn' ? `বাকি ${toBnNumber(unassignedCount)}` : `${unassignedCount} left`})
                  </span>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Configuration Panel: Classes + Strategy + Rooms */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Student Pool & Strategy */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                <span>
                  {language === 'bn'
                    ? '১. শ্রেণি ও আসন বিন্যাস নিয়ম'
                    : '1. Classes & Allocation Rules'}
                </span>
              </h4>
              {assignments.length > 0 && canManage && (
                <button
                  type="button"
                  onClick={handleClearAssignments}
                  className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center space-x-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{language === 'bn' ? 'রিসেট' : 'Reset'}</span>
                </button>
              )}
            </div>

            {/* Multi-Class Toggle Chips */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5 text-[11px]">
                {language === 'bn'
                  ? 'পরীক্ষার কক্ষে যে শ্রেণিগুলো বসবে (একাধিক শ্রেণি মিশিয়ে বসানো যাবে):'
                  : 'Select Classes to Seat (Select multiple for mixed-class benches):'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableClasses.map((cls) => {
                  const isSelected = selectedClasses.includes(cls.name);
                  return (
                    <button
                      key={cls.name}
                      type="button"
                      onClick={() => toggleClassSelection(cls.name)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cls.name} ({language === 'bn' ? toBnNumber(cls.count) : cls.count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section, Shift & Strategy */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-semibold text-slate-600 mb-1 text-[11px]">
                  {language === 'bn' ? 'শাখা (Section)' : 'Section'}
                </label>
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                >
                  <option value="all">{language === 'bn' ? 'সকল শাখা' : 'All Sections'}</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1 text-[11px]">
                  {language === 'bn' ? 'শিফট (Shift)' : 'Shift'}
                </label>
                <select
                  value={shiftFilter}
                  onChange={(e) => setShiftFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                >
                  <option value="all">{language === 'bn' ? 'সকল শিফট' : 'All Shifts'}</option>
                  <option value="Morning">Morning</option>
                  <option value="Day">Day</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1 text-[11px]">
                {language === 'bn' ? 'বসানোর পদ্ধতি (Seating Strategy)' : 'Seating Strategy'}
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as SeatStrategy)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg bg-slate-50 font-bold text-slate-800"
              >
                <option value="sequential">
                  {language === 'bn'
                    ? 'ধারাবাহিক রোল অনুযায়ী (Sequential Roll Order)'
                    : 'Sequential by Class & Roll'}
                </option>
                <option value="zigzag_class">
                  {language === 'bn'
                    ? 'ভিন্ন শ্রেণি/শাখা পাশাপাশি (Zig-Zag Anti-Copy)'
                    : 'Zig-Zag Mixed Classes / Sections (Anti-Copy)'}
                </option>
                <option value="zigzag_roll">
                  {language === 'bn'
                    ? 'ভিন্ন রোল পাশাপাশি (Split Half Interleaved)'
                    : 'Split-Half Roll Interleaved'}
                </option>
              </select>
            </div>
          </div>

          {/* Right: Room Configuration List */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
                <Building className="w-4 h-4 text-indigo-600" />
                <span>
                  {language === 'bn'
                    ? '২. পরীক্ষা কক্ষ ও বেঞ্চ তালিকা (Rooms Setup)'
                    : '2. Exam Rooms & Bench Capacity'}
                </span>
              </h4>
              {canManage && (
                <button
                  type="button"
                  onClick={openAddRoomModal}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-[11px] flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'কক্ষ যোগ করুন' : 'Add Room'}</span>
                </button>
              )}
            </div>

            {rooms.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                {language === 'bn'
                  ? 'কোনো কক্ষ যোগ করা হয়নি। "+ কক্ষ যোগ করুন" বাটনে ক্লিক করুন।'
                  : 'No rooms configured. Click "Add Room" to get started.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {rooms.map((room) => {
                  const cap = getRoomCapacity(room);
                  const used = assignments.filter((a) => a.roomId === room.id).length;
                  return (
                    <div
                      key={room.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:border-indigo-300 transition-colors flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-slate-900 text-xs flex items-center space-x-1.5">
                            <span>{room.roomNo}</span>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                              {used}/{cap} {language === 'bn' ? 'জন' : 'seats'}
                            </span>
                          </div>
                          {room.building && (
                            <div className="text-[10px] text-slate-500 mt-0.5">{room.building}</div>
                          )}
                          <div className="text-[10px] text-slate-600 mt-1 font-medium">
                            {room.columns} Col × {room.benchesPerColumn} Bench × {room.seatsPerBench}{' '}
                            {language === 'bn' ? 'আসন/বেঞ্চ' : 'seat/bench'}
                          </div>
                          {room.invigilatorName && (
                            <div className="text-[10px] text-blue-700 font-semibold mt-0.5">
                              {language === 'bn' ? 'পরিদর্শক:' : 'Invigilator:'}{' '}
                              {room.invigilatorName}
                            </div>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditRoomModal(room)}
                              className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-white"
                              title="Edit Room"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRoom(room.id)}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-white"
                              title="Delete Room"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Print Format Switcher Bar */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700 flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>{language === 'bn' ? 'প্রিন্ট ফরম্যাট:' : 'Print Format:'}</span>
            </span>
            <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 gap-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setPrintLayout('room_map')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  printLayout === 'room_map'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>
                  {language === 'bn' ? 'কক্ষভিত্তিক বেঞ্চ ম্যাপ (Room Map)' : 'Room Bench Map'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPrintLayout('desk_stickers')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  printLayout === 'desk_stickers'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>
                  {language === 'bn' ? 'বেঞ্চের সিট স্টিকার (Desk Stickers)' : 'Desk Seat Stickers'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPrintLayout('notice_summary')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  printLayout === 'notice_summary'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>
                  {language === 'bn' ? 'নোটিশ বোর্ড সামারি (Summary Chart)' : 'Notice Board Summary'}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {printLayout !== 'notice_summary' && (
              <select
                value={printRoomFilter}
                onChange={(e) => setPrintRoomFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-800"
              >
                <option value="all">
                  {language === 'bn' ? `সকল কক্ষ (${rooms.length})` : `All Rooms (${rooms.length})`}
                </option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNo}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>{language === 'bn' ? 'প্রিন্ট প্রিভিউ / প্রিন্ট' : 'Print Now'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* PRINTABLE PREVIEW CANVAS */}
      {assignments.length === 0 ? (
        <div className="p-10 bg-white rounded-2xl border border-dashed border-slate-300 text-center space-y-3 print:hidden">
          <LayoutGrid className="w-10 h-10 text-indigo-400 mx-auto" />
          <h4 className="font-bold text-slate-800 text-sm">
            {language === 'bn'
              ? 'এখনো কোনো সিট প্ল্যান জেনারেট করা হয়নি'
              : 'No Seat Plan Generated Yet'}
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {language === 'bn'
              ? 'উপর থেকে শ্রেণি ও কক্ষ নির্বাচন করে "স্বয়ংক্রিয় আসন বণ্টন" বাটনে ক্লিক করলে প্রিন্ট করার উপযোগী সিট প্ল্যান তৈরি হয়ে যাবে।'
              : 'Select classes and rooms above, then click "Auto Allocate Seats" to generate printable Room Maps, Desk Stickers, and Notice Charts.'}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={handleAutoAllocate}
              className="inline-flex items-center space-x-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>
                {language === 'bn' ? 'এখনই আসন বণ্টন তৈরি করুন' : 'Generate Seat Plan Now'}
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6 print:space-y-0">
          {/* LAYOUT 1: ROOM-WISE VISUAL BENCH MAP (1 Room per A4 Page) */}
          {printLayout === 'room_map' &&
            visibleRooms.map((room) => {
              const roomSeats = assignments.filter((a) => a.roomId === room.id);
              const summary = roomSummaries.find((s) => s.room.id === room.id);
              let benchSerial = 1;

              return (
                <div
                  key={room.id}
                  className="seatplan-page-break bg-white p-5 sm:p-7 rounded-2xl border-2 border-slate-900 shadow-xs text-slate-900 print:rounded-none print:shadow-none print:p-4"
                >
                  {/* Institutional Header */}
                  <div className="text-center pb-3 border-b-2 border-slate-900">
                    <div className="flex items-center justify-center space-x-3">
                      <img
                        src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                        alt="Logo"
                        className="w-12 h-12 object-contain"
                      />
                      <div>
                        <h1 className="text-lg sm:text-xl font-black text-slate-950 leading-tight">
                          {school.nameBn || school.nameEn}
                        </h1>
                        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          {school.nameEn}
                        </p>
                        <p className="text-[10px] text-slate-600">
                          {school.addressBn} {school.eiin ? `• EIIN: ${school.eiin}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="inline-block mt-2 px-4 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded print:bg-black">
                      {currentExam ? currentExam.nameBn || currentExam.nameEn : 'Examination'} •{' '}
                      {language === 'bn'
                        ? `পরীক্ষার আসন বিন্যাস — ${room.roomNo}`
                        : `EXAM SEAT PLAN — ${room.roomNo}`}
                      {planStatus !== 'published' ? (language === 'bn' ? ' [খসড়া]' : ' [DRAFT]') : ''}
                    </div>
                  </div>

                  {/* Room Meta Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2 px-3 bg-slate-100 border border-slate-300 rounded-lg my-3 text-[11px] font-bold">
                    <div>
                      {language === 'bn' ? 'কক্ষ নং:' : 'Room:'}{' '}
                      <span className="text-blue-900">{room.roomNo}</span>
                    </div>
                    <div>
                      {language === 'bn' ? 'অবস্থান:' : 'Location:'}{' '}
                      <span>{room.building || 'Main Building'}</span>
                    </div>
                    <div>
                      {language === 'bn' ? 'বরাদ্দকৃত পরীক্ষার্থী:' : 'Total Seated:'}{' '}
                      <span className="text-emerald-800">
                        {language === 'bn'
                          ? `${toBnNumber(roomSeats.length)} / ${toBnNumber(getRoomCapacity(room))} জন`
                          : `${roomSeats.length} / ${getRoomCapacity(room)}`}
                      </span>
                    </div>
                    <div>
                      {language === 'bn' ? 'পরিদর্শক:' : 'Invigilator:'}{' '}
                      <span>{room.invigilatorName || '________________'}</span>
                    </div>
                  </div>

                  {/* Class & Roll Range Breakdown Chips */}
                  {summary && summary.breakdown.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px] font-bold">
                      <span className="text-slate-600 uppercase">
                        {language === 'bn' ? 'শ্রেণি ও রোল রেঞ্জ:' : 'Roll Summary:'}
                      </span>
                      {summary.breakdown.map((b) => (
                        <span
                          key={b.className}
                          className="px-2 py-0.5 rounded bg-blue-50 border border-blue-300 text-blue-950"
                        >
                          {b.className}: {language === 'bn' ? 'রোল' : 'Roll'} {b.rollRange} (
                          {language === 'bn' ? `${toBnNumber(b.count)} জন` : b.count})
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Front of Room (Blackboard) */}
                  <div className="w-2/3 mx-auto mb-3 py-1 bg-slate-800 text-white text-center text-[10px] font-black uppercase tracking-widest rounded print:bg-black">
                    {language === 'bn'
                      ? 'ব্ল্যাকবোর্ড / শিক্ষকের ডেস্ক (কক্ষের সম্মুখভাগ)'
                      : 'BLACKBOARD / INVIGILATOR DESK (FRONT)'}
                  </div>

                  {/* Visual Column × Bench Grid */}
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${room.columns}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: room.columns }).map((_, colIdx) => {
                      const colNumber = colIdx + 1;
                      return (
                        <div key={colNumber} className="space-y-2">
                          <div className="text-center text-[10px] font-black uppercase bg-slate-200 py-1 rounded border border-slate-400">
                            {language === 'bn'
                              ? `সারি / কলাম ${toBnNumber(colNumber)}`
                              : `Column ${colNumber}`}
                          </div>
                          {Array.from({ length: room.benchesPerColumn }).map((__, rowIdx) => {
                            const currentBenchNo = benchSerial++;
                            return (
                              <div
                                key={rowIdx}
                                className="seatplan-avoid-break border border-slate-700 rounded-lg overflow-hidden bg-white"
                              >
                                <div className="bg-slate-100 px-2 py-0.5 border-b border-slate-400 flex items-center justify-between text-[9px] font-extrabold text-slate-700">
                                  <span>
                                    {language === 'bn'
                                      ? `বেঞ্চ #${toBnNumber(currentBenchNo)}`
                                      : `Bench #${currentBenchNo}`}
                                  </span>
                                  <span>
                                    {room.seatsPerBench}{' '}
                                    {language === 'bn' ? 'আসন' : 'Seats'}
                                  </span>
                                </div>
                                <div
                                  className="grid divide-x divide-slate-400"
                                  style={{
                                    gridTemplateColumns: `repeat(${room.seatsPerBench}, minmax(0, 1fr))`,
                                  }}
                                >
                                  {Array.from({ length: room.seatsPerBench }).map((___, sIdx) => {
                                    const seatPos = sIdx + 1;
                                    const seat = roomSeats.find(
                                      (a) =>
                                        a.benchNumber === currentBenchNo &&
                                        a.seatPosition === seatPos
                                    );
                                    const posLabel = getSeatPositionLabel(
                                      seatPos,
                                      room.seatsPerBench,
                                      language
                                    );
                                    return (
                                      <div
                                        key={seatPos}
                                        className={`p-1.5 min-h-[54px] flex flex-col justify-center ${
                                          seat ? 'bg-white' : 'bg-slate-50/70'
                                        }`}
                                      >
                                        {seat ? (
                                          <>
                                            <div className="flex items-center justify-between gap-1">
                                              <span className="text-[11px] font-black text-blue-950">
                                                {language === 'bn' ? 'রোল:' : 'Roll:'}{' '}
                                                {language === 'bn'
                                                  ? toBnNumber(seat.roll)
                                                  : seat.roll}
                                              </span>
                                              <span className="text-[8px] font-bold px-1 rounded bg-slate-200 text-slate-700">
                                                {posLabel}
                                              </span>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-900 truncate leading-tight mt-0.5">
                                              {language === 'bn'
                                                ? seat.studentNameBn || seat.studentNameEn
                                                : seat.studentNameEn}
                                            </div>
                                            <div className="text-[9px] text-slate-600 font-semibold truncate">
                                              {seat.className} • Sec {seat.section}
                                            </div>
                                          </>
                                        ) : (
                                          <div className="text-center text-[9px] text-slate-300 font-semibold">
                                            — ({posLabel}) —
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
                      );
                    })}
                  </div>

                  {/* Signature Footer */}
                  <div className="grid grid-cols-3 items-start gap-4 pt-6 mt-6 text-[11px] font-bold text-slate-800 border-t border-slate-200">
                    <div className="text-center">
                      <div className="h-9 mb-0.5" />
                      <div className="border-t border-slate-800 pt-1 mx-auto w-40">
                        {language === 'bn' ? 'কক্ষ পরিদর্শকের স্বাক্ষর' : 'Invigilator Signature'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="h-9 mb-0.5" />
                      <div className="border-t border-slate-800 pt-1 mx-auto w-44">
                        {language === 'bn'
                          ? 'পরীক্ষা নিয়ন্ত্রকের স্বাক্ষর'
                          : 'Controller of Examinations'}
                      </div>
                    </div>
                    <div className="text-center">
                      <PrincipalSignatureDisplay school={school} fallbackText="" heightClass="h-9" />
                      <div className="border-t border-slate-800 pt-1 mx-auto w-44">
                        {language === 'bn' ? 'অধ্যক্ষ / প্রধান শিক্ষক' : 'Principal / Head Teacher'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

          {/* LAYOUT 2: CUT-AND-PASTE DESK SEAT STICKERS */}
          {printLayout === 'desk_stickers' && (
            <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 print:border-none print:p-0">
              <div className="mb-3 pb-2 border-b border-slate-200 flex items-center justify-between text-xs print:hidden">
                <span className="font-bold text-slate-700">
                  {language === 'bn'
                    ? `মোট ${toBnNumber(visibleAssignments.length)}টি বেঞ্চের সিট স্টিকার (কেটে বেঞ্চে লাগানোর জন্য)`
                    : `${visibleAssignments.length} Printable Desk Seat Stickers (Cut along dashed lines)`}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {visibleAssignments.map((seat) => {
                  const roomObj = rooms.find((r) => r.id === seat.roomId);
                  const posLabel = getSeatPositionLabel(
                    seat.seatPosition,
                    roomObj?.seatsPerBench || 2,
                    language
                  );
                  return (
                    <div
                      key={seat.id}
                      className="seatplan-avoid-break border-2 border-dashed border-slate-700 rounded-lg p-2.5 bg-white flex flex-col justify-between text-slate-900"
                    >
                      <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-1.5">
                        <span className="text-[9px] font-black uppercase truncate max-w-[130px]">
                          {school.nameBn || school.nameEn}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[9px] font-black print:bg-black">
                          {seat.roomNo}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold text-slate-600">
                            {seat.className} • Sec {seat.section}
                          </div>
                          <div className="text-xs font-black text-slate-950 leading-tight mt-0.5">
                            {language === 'bn'
                              ? seat.studentNameBn || seat.studentNameEn
                              : seat.studentNameEn}
                          </div>
                          <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                            ID: {seat.studentCode}
                          </div>
                        </div>
                        <div className="text-center px-2.5 py-1 border-2 border-slate-900 rounded-lg bg-slate-50 shrink-0">
                          <div className="text-[8px] font-bold uppercase text-slate-500">
                            {language === 'bn' ? 'রোল' : 'ROLL'}
                          </div>
                          <div className="text-lg font-black text-slate-950 leading-none">
                            {language === 'bn' ? toBnNumber(seat.roll) : seat.roll}
                          </div>
                        </div>
                      </div>

                      <div className="mt-1.5 pt-1 border-t border-slate-200 flex items-center justify-between text-[9px] font-bold text-slate-600">
                        <span className="truncate max-w-[120px]">
                          {currentExam ? currentExam.nameBn || currentExam.nameEn : 'Exam'}
                        </span>
                        <span className="text-blue-900">
                          {language === 'bn'
                            ? `বেঞ্চ #${toBnNumber(seat.benchNumber)} (${posLabel})`
                            : `Bench #${seat.benchNumber} (${posLabel})`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LAYOUT 3: NOTICE BOARD MASTER ROOM SUMMARY CHART */}
          {printLayout === 'notice_summary' && (
            <div className="bg-white p-6 sm:p-8 rounded-2xl border-2 border-slate-900 text-slate-900 print:rounded-none print:p-4">
              {/* Institutional Header */}
              <div className="text-center pb-4 border-b-2 border-slate-900">
                <div className="flex items-center justify-center space-x-3">
                  <img
                    src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt="Logo"
                    className="w-14 h-14 object-contain"
                  />
                  <div>
                    <h1 className="text-xl font-black text-slate-950">
                      {school.nameBn || school.nameEn}
                    </h1>
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {school.nameEn}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      {school.addressBn} {school.eiin ? `• EIIN: ${school.eiin}` : ''}
                    </p>
                  </div>
                </div>
                <div className="inline-block mt-2.5 px-5 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded print:bg-black">
                  {currentExam ? currentExam.nameBn || currentExam.nameEn : 'Examination'} •{' '}
                  {language === 'bn'
                    ? 'নোটিশ বোর্ড: কক্ষভিত্তিক পরীক্ষার আসন বিন্যাস তালিকা'
                    : 'NOTICE BOARD: MASTER EXAM SEAT PLAN SUMMARY'}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border-2 border-slate-900">
                  <thead>
                    <tr className="bg-slate-200 border-b-2 border-slate-900 text-slate-950 font-black">
                      <th className="py-2.5 px-3 border border-slate-900 w-12 text-center">
                        {language === 'bn' ? 'ক্র.নং' : 'SL'}
                      </th>
                      <th className="py-2.5 px-3 border border-slate-900">
                        {language === 'bn' ? 'কক্ষ নং ও অবস্থান' : 'Room No & Building'}
                      </th>
                      <th className="py-2.5 px-3 border border-slate-900">
                        {language === 'bn' ? 'শ্রেণি ও রোল নম্বর রেঞ্জ' : 'Class & Roll Range'}
                      </th>
                      <th className="py-2.5 px-3 border border-slate-900 text-center w-28">
                        {language === 'bn' ? 'মোট পরীক্ষার্থী' : 'Total Students'}
                      </th>
                      <th className="py-2.5 px-3 border border-slate-900">
                        {language === 'bn' ? 'কক্ষ পরিদর্শক' : 'Invigilator'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomSummaries.map((item, idx) => (
                      <tr key={item.room.id} className="border-b border-slate-900">
                        <td className="py-2.5 px-3 border border-slate-900 text-center font-bold">
                          {language === 'bn' ? toBnNumber(idx + 1) : idx + 1}
                        </td>
                        <td className="py-2.5 px-3 border border-slate-900">
                          <div className="font-black text-slate-950">{item.room.roomNo}</div>
                          {item.room.building && (
                            <div className="text-[10px] text-slate-600">{item.room.building}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 border border-slate-900">
                          {item.breakdown.length === 0 ? (
                            <span className="text-slate-400 italic">
                              {language === 'bn' ? 'খালি কক্ষ' : 'Empty'}
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {item.breakdown.map((b) => (
                                <div key={b.className} className="font-semibold">
                                  <span className="font-black text-blue-950">{b.className}:</span>{' '}
                                  {language === 'bn' ? 'রোল' : 'Roll'} {b.rollRange} (
                                  {language === 'bn' ? `${toBnNumber(b.count)} জন` : `${b.count}`})
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 border border-slate-900 text-center font-black">
                          {language === 'bn'
                            ? `${toBnNumber(item.assignedCount)} জন`
                            : item.assignedCount}
                        </td>
                        <td className="py-2.5 px-3 border border-slate-900 font-semibold">
                          {item.room.invigilatorName || '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-black">
                      <td colSpan={3} className="py-2.5 px-3 border border-slate-900 text-right">
                        {language === 'bn' ? 'সর্বমোট বরাদ্দকৃত পরীক্ষার্থী:' : 'Grand Total Seated:'}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-900 text-center text-sm">
                        {language === 'bn'
                          ? `${toBnNumber(assignments.length)} জন`
                          : assignments.length}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-900"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 items-start gap-8 pt-8 mt-6 text-xs font-bold text-slate-800">
                <div className="text-center">
                  <div className="h-10 mb-0.5" />
                  <div className="border-t-2 border-slate-800 pt-1 mx-auto w-48">
                    {language === 'bn' ? 'পরীক্ষা নিয়ন্ত্রকের স্বাক্ষর' : 'Controller of Examinations'}
                  </div>
                </div>
                <div className="text-center">
                  <PrincipalSignatureDisplay school={school} fallbackText="" heightClass="h-10" />
                  <div className="border-t-2 border-slate-800 pt-1 mx-auto w-52">
                    {language === 'bn'
                      ? 'অধ্যক্ষ / প্রধান শিক্ষকের স্বাক্ষর ও সিল'
                      : 'Principal Signature & Seal'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADD / EDIT ROOM MODAL */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs print:hidden">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-xs text-slate-800 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <Building className="w-4 h-4 text-indigo-600" />
                <span>
                  {editingRoom
                    ? language === 'bn'
                      ? 'পরীক্ষা কক্ষ সম্পাদনা'
                      : 'Edit Exam Room'
                    : language === 'bn'
                    ? 'নতুন পরীক্ষা কক্ষ যোগ'
                    : 'Add New Exam Room'}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setShowRoomModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoom} className="mt-4 space-y-3">
              <div>
                <label className="block font-bold mb-1">
                  {language === 'bn' ? 'কক্ষ নম্বর / নাম *' : 'Room No / Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={roomNoInput}
                  onChange={(e) => setRoomNoInput(e.target.value)}
                  placeholder="e.g. Room 101"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">
                  {language === 'bn' ? 'ভবন ও তলা (ঐচ্ছিক)' : 'Building / Floor (Optional)'}
                </label>
                <input
                  type="text"
                  value={buildingInput}
                  onChange={(e) => setBuildingInput(e.target.value)}
                  placeholder="e.g. Main Building - 2nd Floor"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold mb-1 text-[11px]">
                    {language === 'bn' ? 'সারি / কলাম' : 'Columns'}
                  </label>
                  <DigitInput
                    min={1}
                    max={6}
                    value={columnsInput}
                    onValueChange={(val) => setColumnsInput(val)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1 text-[11px]">
                    {language === 'bn' ? 'বেঞ্চ / কলাম' : 'Benches / Col'}
                  </label>
                  <DigitInput
                    min={1}
                    max={20}
                    value={benchesInput}
                    onValueChange={(val) => setBenchesInput(val)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1 text-[11px]">
                    {language === 'bn' ? 'আসন / বেঞ্চ' : 'Seats / Bench'}
                  </label>
                  <select
                    value={seatsPerBenchInput}
                    onChange={(e) => setSeatsPerBenchInput(Number(e.target.value) as 1 | 2 | 3)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold text-center">
                {language === 'bn' ? 'এই কক্ষের মোট ধারণক্ষমতা:' : 'Total Room Capacity:'}{' '}
                {Math.max(1, columnsInput) * Math.max(1, benchesInput) * seatsPerBenchInput}{' '}
                {language === 'bn' ? 'জন শিক্ষার্থী' : 'Students'}
              </div>

              <div>
                <label className="block font-bold mb-1">
                  {language === 'bn' ? 'কক্ষ পরিদর্শকের নাম (ঐচ্ছিক)' : 'Invigilator Name (Optional)'}
                </label>
                <input
                  type="text"
                  value={invigilatorInput}
                  onChange={(e) => setInvigilatorInput(e.target.value)}
                  placeholder="Teacher name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRoomModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-600"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center space-x-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Room'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
