import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  analyzeCenterFacePresence,
  cosineSimilarity,
  extractFaceDescriptorFromImageData,
  matchFaceDescriptor,
} from '../faceRecognitionHelper';
import { Staff, Student } from '../../types';

const mockLocalMap: Record<string, string> = {};
const mockSessionMap: Record<string, string> = {};

const localStorageMock = {
  getItem: (k: string) => (k in mockLocalMap ? mockLocalMap[k] : null),
  setItem: (k: string, v: string) => {
    mockLocalMap[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mockLocalMap[k];
  },
  clear: () => {
    Object.keys(mockLocalMap).forEach((k) => delete mockLocalMap[k]);
  },
  key: (i: number) => Object.keys(mockLocalMap)[i] ?? null,
  get length() {
    return Object.keys(mockLocalMap).length;
  },
};

const sessionStorageMock = {
  getItem: (k: string) => (k in mockSessionMap ? mockSessionMap[k] : null),
  setItem: (k: string, v: string) => {
    mockSessionMap[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mockSessionMap[k];
  },
  clear: () => {
    Object.keys(mockSessionMap).forEach((k) => delete mockSessionMap[k]);
  },
  key: (i: number) => Object.keys(mockSessionMap)[i] ?? null,
  get length() {
    return Object.keys(mockSessionMap).length;
  },
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, configurable: true });

vi.mock('../../services/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'write', DELETE: 'delete', GET: 'get', LIST: 'list' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
}));

const { pushSliceMock } = vi.hoisted(() => ({
  pushSliceMock: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../services/cloudSync', () => ({
  SAAS_ACTIVE_SCHOOL_KEY: 'school_erp_saas_active_school_id',
  CloudSyncService: {
    pushSliceToCloud: pushSliceMock,
    pushLocalToCloud: vi.fn(() => Promise.resolve(true)),
    scheduleCloudSync: vi.fn(),
  },
}));

import { StorageService } from '../../services/storage';

function makeSyntheticFaceRgba(brightnessOffset = 0, shiftBg = false): { rgba16: Uint8ClampedArray; rgba8: Uint8ClampedArray } {
  const rgba16 = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = (y * 16 + x) * 4;
      const dx = (x - 7.5) / 6.2;
      const dy = (y - 7.5) / 7.0;
      const insideFace = dx * dx + dy * dy <= 1.0;

      let r = shiftBg ? 175 : 215;
      let g = shiftBg ? 182 : 220;
      let b = shiftBg ? 192 : 228;

      if (insideFace) {
        // Warm human skin base
        r = 198;
        g = 152;
        b = 122;
        // Eyes
        if (y === 5 && (x === 5 || x === 10)) {
          r = 45;
          g = 35;
          b = 30;
        }
        // Nose bridge shading
        if ((y === 7 || y === 8) && x === 7) {
          r = 175;
          g = 128;
          b = 98;
        }
        // Mouth
        if (y === 11 && x >= 6 && x <= 9) {
          r = 148;
          g = 86;
          b = 76;
        }
      }

      rgba16[idx] = Math.max(0, Math.min(255, r + brightnessOffset));
      rgba16[idx + 1] = Math.max(0, Math.min(255, g + brightnessOffset));
      rgba16[idx + 2] = Math.max(0, Math.min(255, b + brightnessOffset));
      rgba16[idx + 3] = 255;
    }
  }

  const rgba8 = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const srcIdx = (y * 2 * 16 + x * 2) * 4;
      const dstIdx = (y * 8 + x) * 4;
      rgba8[dstIdx] = rgba16[srcIdx];
      rgba8[dstIdx + 1] = rgba16[srcIdx + 1];
      rgba8[dstIdx + 2] = rgba16[srcIdx + 2];
      rgba8[dstIdx + 3] = 255;
    }
  }

  return { rgba16, rgba8 };
}

function makeSyntheticDifferentFaceRgba(): { rgba16: Uint8ClampedArray; rgba8: Uint8ClampedArray } {
  const rgba16 = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = (y * 16 + x) * 4;
      // Opposite lighting / distinct facial geometry pattern
      const checker = (x < 8 ? 175 : 105) + (y > 9 ? -30 : 15);
      rgba16[idx] = Math.min(255, checker + 20);
      rgba16[idx + 1] = checker;
      rgba16[idx + 2] = Math.max(0, checker - 25);
      rgba16[idx + 3] = 255;
    }
  }
  const rgba8 = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i++) {
    rgba8[i * 4] = rgba16[i * 8];
    rgba8[i * 4 + 1] = rgba16[i * 8 + 1];
    rgba8[i * 4 + 2] = rgba16[i * 8 + 2];
    rgba8[i * 4 + 3] = 255;
  }
  return { rgba16, rgba8 };
}

const makeStudent = (overrides: Partial<Student> = {}): Student => ({
  id: overrides.id || 'std_1001',
  studentId: overrides.studentId || 'SCH001-S-2026-1001',
  roll: overrides.roll ?? '01',
  session: '2026',
  nameEn: overrides.nameEn || 'Mahid Yafee',
  nameBn: overrides.nameBn || 'মাহিদ ইয়াফি',
  className: overrides.className || 'Class 10',
  section: 'A',
  shift: 'Day',
  guardianName: 'Shafiq Ahmed',
  guardianPhone: '01942529984',
  guardianRelation: 'Father',
  fatherNameEn: 'Shafiq Ahmed',
  fatherNameBn: 'শফিক আহমেদ',
  motherNameEn: 'Mow Akhter',
  motherNameBn: 'মৌ আখতার',
  presentAddress: 'Dhaka',
  permanentAddress: 'Dhaka',
  admissionDate: '2026-01-01',
  status: 'active',
  gender: 'Male',
  religion: 'Islam',
  bloodGroup: 'O+',
  dob: '2011-01-01',
  ...overrides,
});

const makeStaff = (overrides: Partial<Staff> = {}): Staff => ({
  id: overrides.id || 'stf_2001',
  employeeId: overrides.employeeId || 'SCH001-EMP-2026-01',
  nameEn: overrides.nameEn || 'Amzad Hossain',
  nameBn: overrides.nameBn || 'আমজাদ হোসেন',
  gender: overrides.gender || 'Male',
  designation: 'Assistant Teacher',
  department: 'Science',
  role: 'teacher',
  phone: '01711223344',
  email: 'amzad@school.edu',
  qualification: 'M.Sc',
  joiningDate: '2020-01-01',
  basicSalary: 25000,
  houseRentAllowance: 5000,
  medicalAllowance: 1500,
  otherAllowance: 500,
  providentFundDeduction: 1000,
  status: 'active',
  ...overrides,
});

describe('Face Recognition Helper', () => {
  it('extracts a 960-dim descriptor with RGB and stays invariant to uniform brightness & background shifts', () => {
    const enrolled = makeSyntheticFaceRgba(0, false);
    const brighterSameFace = makeSyntheticFaceRgba(22, true);
    const otherFace = makeSyntheticDifferentFaceRgba();

    const vEnrolled = extractFaceDescriptorFromImageData(enrolled.rgba16, enrolled.rgba8)!;
    const vBrighter = extractFaceDescriptorFromImageData(brighterSameFace.rgba16, brighterSameFace.rgba8)!;
    const vOther = extractFaceDescriptorFromImageData(otherFace.rgba16, otherFace.rgba8)!;
    const vNoRgb = extractFaceDescriptorFromImageData(enrolled.rgba16, null)!;

    expect(vEnrolled).toHaveLength(960);
    expect(vNoRgb).toHaveLength(768);

    const sameSim = cosineSimilarity(vEnrolled, vBrighter);
    const otherSim = cosineSimilarity(vEnrolled, vOther);

    expect(sameSim).toBeGreaterThan(0.75);
    expect(otherSim).toBeLessThan(0.5);
  });

  it('rejects blank white walls and monochrome QR patterns in skin-presence check while accepting real faces', () => {
    // 1. Blank white wall
    const wall = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < wall.length; i += 4) {
      wall[i] = 240;
      wall[i + 1] = 240;
      wall[i + 2] = 240;
      wall[i + 3] = 255;
    }
    const wallRes = analyzeCenterFacePresence(wall);
    expect(wallRes.hasContrast).toBe(false);
    expect(wallRes.hasSkinPresence).toBe(false);

    // 2. Monochrome QR-like high-contrast grid (black/white, zero skin chrominance)
    const qrGrid = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 256; i++) {
      const c = i % 2 === 0 ? 15 : 240;
      qrGrid[i * 4] = c;
      qrGrid[i * 4 + 1] = c;
      qrGrid[i * 4 + 2] = c;
      qrGrid[i * 4 + 3] = 255;
    }
    const qrRes = analyzeCenterFacePresence(qrGrid);
    expect(qrRes.hasContrast).toBe(true);
    expect(qrRes.hasSkinPresence).toBe(false);

    // 3. Real synthetic face
    const face = makeSyntheticFaceRgba();
    const faceRes = analyzeCenterFacePresence(face.rgba16);
    expect(faceRes.hasContrast).toBe(true);
    expect(faceRes.hasSkinPresence).toBe(true);
    expect(faceRes.skinRatio).toBeGreaterThanOrEqual(0.1);
  });

  it('enforces calibrated silent vs manual thresholds and rejects ambiguous near-ties', () => {
    const faceA = makeSyntheticFaceRgba(0, false);
    const faceB = makeSyntheticDifferentFaceRgba();
    const vecA = extractFaceDescriptorFromImageData(faceA.rgba16, faceA.rgba8)!;
    const vecB = extractFaceDescriptorFromImageData(faceB.rgba16, faceB.rgba8)!;

    // Slight perturbation should match in silent auto mode cleanly
    const liveA = extractFaceDescriptorFromImageData(
      makeSyntheticFaceRgba(12, false).rgba16,
      makeSyntheticFaceRgba(12, false).rgba8
    )!;
    const cleanMatch = matchFaceDescriptor(
      [liveA],
      [
        { person: 'Alice', vec: vecA },
        { person: 'Bob', vec: vecB },
      ],
      { isSilentAuto: true, hasDetectedBox: true }
    );
    expect(cleanMatch.matched).toBe(true);
    expect(cleanMatch.bestCandidate?.person).toBe('Alice');

    // Near-identical scores between two different people in [0.66, 0.82) must trigger ambiguity guard
    const nearTie = matchFaceDescriptor(
      [vecA],
      [
        { person: 'Twin1', vec: vecA.map((v, idx) => (idx < 300 ? v : 0)) },
        { person: 'Twin2', vec: vecA.map((v, idx) => (idx < 296 ? v : 0)) },
      ],
      { isSilentAuto: true, hasDetectedBox: true }
    );
    expect(nearTie.isAmbiguous).toBe(true);
    expect(nearTie.matched).toBe(false);
  });

  it('matches horizontally mirrored selfies and directional window lighting via multi-variant candidate vecs without self-ambiguity', () => {
    const faceBase = makeSyntheticFaceRgba(0, false);

    // Horizontally mirror faceBase to simulate selfie vs back/uploaded camera difference
    const mirrored16 = new Uint8ClampedArray(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const srcIdx = (y * 16 + (15 - x)) * 4;
        const dstIdx = (y * 16 + x) * 4;
        mirrored16[dstIdx] = faceBase.rgba16[srcIdx];
        mirrored16[dstIdx + 1] = faceBase.rgba16[srcIdx + 1];
        mirrored16[dstIdx + 2] = faceBase.rgba16[srcIdx + 2];
        mirrored16[dstIdx + 3] = 255;
      }
    }
    const mirrored8 = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const srcIdx = (y * 2 * 16 + x * 2) * 4;
        const dstIdx = (y * 8 + x) * 4;
        mirrored8[dstIdx] = mirrored16[srcIdx];
        mirrored8[dstIdx + 1] = mirrored16[srcIdx + 1];
        mirrored8[dstIdx + 2] = mirrored16[srcIdx + 2];
        mirrored8[dstIdx + 3] = 255;
      }
    }

    // Add strong directional left-to-right lighting ramp on top of mirrored face
    const litMirrored16 = new Uint8ClampedArray(mirrored16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const idx = (y * 16 + x) * 4;
        const ramp = Math.round((x - 7.5) * 4);
        litMirrored16[idx] = Math.max(0, Math.min(255, litMirrored16[idx] + ramp));
        litMirrored16[idx + 1] = Math.max(0, Math.min(255, litMirrored16[idx + 1] + ramp));
        litMirrored16[idx + 2] = Math.max(0, Math.min(255, litMirrored16[idx + 2] + ramp));
      }
    }

    const vecNormal = extractFaceDescriptorFromImageData(faceBase.rgba16, faceBase.rgba8)!;
    const vecMirrored = extractFaceDescriptorFromImageData(mirrored16, mirrored8)!;
    const vecLiveLitMirrored = extractFaceDescriptorFromImageData(litMirrored16, mirrored8)!;
    const other = makeSyntheticDifferentFaceRgba();
    const vecOther = extractFaceDescriptorFromImageData(other.rgba16, other.rgba8)!;

    // Multi-variant bank (normal + mirrored) for same person alongside another distinct student
    const matchRes = matchFaceDescriptor(
      [vecLiveLitMirrored],
      [
        { person: { id: 'stu_self' }, vecs: [vecNormal, vecMirrored] },
        { person: { id: 'stu_other' }, vecs: [vecOther] },
      ],
      { isSilentAuto: true, hasDetectedBox: false }
    );

    expect(matchRes.isAmbiguous).toBe(false);
    expect(matchRes.matched).toBe(true);
    expect(matchRes.bestCandidate?.person.id).toBe('stu_self');

    // Cool indoor LED tint should still satisfy analyzeCenterFacePresence
    const coolFace = new Uint8ClampedArray(faceBase.rgba16);
    for (let i = 0; i < coolFace.length; i += 4) {
      coolFace[i] = Math.max(0, coolFace[i] - 10);
      coolFace[i + 2] = Math.min(255, coolFace[i + 2] + 18);
    }
    expect(analyzeCenterFacePresence(coolFace).hasSkinPresence).toBe(true);
  });
});

describe('QR & Face Attendance Storage Pipeline', () => {
  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    vi.clearAllMocks();
    localStorageMock.setItem(
      'school_erp_profile',
      JSON.stringify({ nameEn: 'Dhakas school', schoolCode: 'SCH001', currentSession: '2026' })
    );
    localStorageMock.setItem(
      'school_erp_attendance_rules',
      JSON.stringify({
        lateThresholdTime: '08:30',
        staffLateThresholdTime: '08:30',
        duplicateCooldownMinutes: 10,
      })
    );
  });

  it('round-trips generated Student & Staff QR payloads and resolves priority tiers safely without empty-roll collision', () => {
    const stuZeroRoll = makeStudent({ id: 'std_1001', studentId: 'SCH001-S-2026-1001', roll: '' as any });
    const stuWithRoll = makeStudent({ id: 'std_1002', studentId: 'SCH001-S-2026-1002', roll: '05', guardianPhone: '01812345678' });
    const staff = makeStaff({ id: 'stf_2001', employeeId: 'SCH001-EMP-2026-01', phone: '01799887766' });

    localStorageMock.setItem('school_erp_students', JSON.stringify([stuZeroRoll, stuWithRoll]));
    localStorageMock.setItem('school_erp_staff', JSON.stringify([staff]));

    const stuQR = StorageService.generateStudentQRData(stuWithRoll);
    const staffQR = StorageService.generateStaffQRData(staff);

    expect(StorageService.parseAttendanceQRData(stuQR)).toMatchObject({
      targetType: 'student',
      id: 'std_1002',
    });
    expect(StorageService.parseAttendanceQRData(staffQR)).toMatchObject({
      targetType: 'staff',
      id: 'stf_2001',
    });

    // Bengali digits and scoped ID lookup
    expect(StorageService.parseAttendanceQRData('SCH001-S-2026-১০০২')).toMatchObject({
      targetType: 'student',
      id: 'std_1002',
    });

    // "0" must NOT falsely match student whose roll is empty string ""!
    const zeroMatch = StorageService.parseAttendanceQRData('0');
    expect(zeroMatch?.id).toBe('0');

    // Numeric roll "5" matches "05"
    expect(StorageService.parseAttendanceQRData('5')).toMatchObject({
      targetType: 'student',
      id: 'std_1002',
    });

    // Phone suffix (>= 6 digits) matches
    expect(StorageService.parseAttendanceQRData('9887766')).toMatchObject({
      targetType: 'staff',
      id: 'stf_2001',
    });
  });

  it('handles Face/QR Check-In, duplicate cooldown block, Check-Out duration, and manual-roll-call upgrade cleanly', () => {
    const student = makeStudent({ id: 'std_1001', studentId: 'SCH001-S-2026-1001', roll: '01' });
    const staff = makeStaff({ id: 'stf_2001', employeeId: 'SCH001-EMP-2026-01' });
    localStorageMock.setItem('school_erp_students', JSON.stringify([student]));
    localStorageMock.setItem('school_erp_staff', JSON.stringify([staff]));

    const testDate = '2026-11-16';

    // 1. Face check-in when manual roll-call record already exists WITHOUT inTime/inTimestamp
    localStorageMock.setItem(
      'school_erp_attendance',
      JSON.stringify([
        {
          id: `att_${student.id}_${testDate}`,
          targetType: 'student',
          targetId: student.id,
          targetName: student.nameEn,
          rollOrEmpId: student.roll,
          className: student.className,
          date: testDate,
          status: 'Present',
          scanTime: '—',
          method: 'manual',
          recordedBy: 'Class Teacher',
        },
      ])
    );

    const checkInRes = StorageService.processQRScan(
      student.id,
      'Gate Kiosk',
      testDate,
      'auto',
      'face_scan'
    );
    expect(checkInRes.success).toBe(true);
    expect(checkInRes.scanType).toBe('in');
    expect(checkInRes.record?.method).toBe('face_scan');
    expect(checkInRes.record?.outTime).toBeUndefined();
    expect(checkInRes.record?.inTime).toBeTruthy();

    // 2. Immediate re-scan in 'auto' mode within cooldown -> duplicate blocked
    const dupRes = StorageService.processQRScan(
      student.id,
      'Gate Kiosk',
      testDate,
      'auto',
      'face_scan'
    );
    expect(dupRes.success).toBe(false);
    expect(dupRes.isDuplicate).toBe(true);

    // 3. Explicit Check-Out via scanMode='out' computes clean stayDuration
    const savedAttendance = StorageService.getAttendance();
    savedAttendance[0].inTimestamp = Date.now() - 185 * 60000; // 3h 5m ago
    localStorageMock.setItem('school_erp_attendance', JSON.stringify(savedAttendance));

    const checkOutRes = StorageService.processQRScan(
      student.id,
      'Gate Kiosk',
      testDate,
      'out',
      'qr_scanner'
    );
    expect(checkOutRes.success).toBe(true);
    expect(checkOutRes.scanType).toBe('out');
    expect(checkOutRes.record?.outTime).toBeTruthy();
    expect(checkOutRes.record?.stayDuration).toContain('3 ঘণ্টা');

    // 4. Staff face enrollment update triggers immediate 'staff' cloud push
    vi.clearAllMocks();
    StorageService.updateStaff({ ...staff, photoUrl: 'data:image/jpeg;base64,abc' });
    expect(pushSliceMock).toHaveBeenCalledWith('staff', true);
  });

  it('persists face photo across admission enquiry -> enrollment and marks face_scan attendance immediately', () => {
    const faceDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/testface';
    StorageService.addEnquiry({
      id: 'enq_face_1',
      applicationNo: 'APP-2026-9901',
      applicantNameEn: 'Sabbir Rahman',
      applicantNameBn: 'সাব্বির রহমান',
      applyingClass: 'Class 8',
      gender: 'Male',
      dob: '2012-03-10',
      bloodGroup: 'O+',
      photoUrl: faceDataUrl,
      guardianName: 'Kamal Rahman',
      phone: '01711009988',
      address: 'Mirpur, Dhaka',
      status: 'Approved',
      appliedDate: '2026-11-18',
    });

    const enrolled = StorageService.convertEnquiryToStudent(
      'enq_face_1',
      '07',
      'A',
      'Day',
      'SCH001-S-2026-1099',
      undefined,
      'O+',
      '2026'
    );

    expect(enrolled).not.toBeNull();
    expect(enrolled!.photoUrl).toBe(faceDataUrl);
    expect(enrolled!.status).toBe('active');

    const storedStudent = StorageService.getStudents().find((s) => s.id === enrolled!.id);
    expect(storedStudent?.photoUrl).toBe(faceDataUrl);

    const faceScanRes = StorageService.processQRScan(
      enrolled!.id,
      'AI Face Scanner',
      '2026-11-18',
      'auto',
      'face_scan'
    );
    expect(faceScanRes.success).toBe(true);
    expect(faceScanRes.scanType).toBe('in');
    expect(faceScanRes.record?.method).toBe('face_scan');
    expect(faceScanRes.record?.targetId).toBe(enrolled!.id);
  });
});
