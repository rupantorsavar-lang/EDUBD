import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLocalMap: Record<string, string> = {};
const mockSessionMap: Record<string, string> = {};

Object.defineProperty(globalThis, 'localStorage', {
  value: {
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
  },
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
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
  },
  configurable: true,
});

const mockState = vi.hoisted(() => {
  const docs = new Map<string, any>();
  const state = {
    firestoreDocs: docs,
    simulatedGetDocError: null as Error | null,
    setDocSpy: vi.fn(async (ref: { path: string }, data: any) => {
      docs.set(ref.path, data);
    }),
  };
  return state;
});

vi.mock('../../services/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'admin_uid_1', email: 'admin@dmc.com' },
  },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: any, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    if (mockState.simulatedGetDocError) {
      throw mockState.simulatedGetDocError;
    }
    const data = mockState.firestoreDocs.get(ref.path);
    return {
      exists: () => data !== undefined,
      data: () => data,
    };
  }),
  setDoc: mockState.setDocSpy,
  onSnapshot: vi.fn(() => () => {}),
}));

import { CloudSyncService } from '../../services/cloudSync';

describe('CloudSyncService safety against empty-cache overwrites', () => {
  beforeEach(() => {
    mockState.firestoreDocs.clear();
    mockState.simulatedGetDocError = null;
    Object.keys(mockLocalMap).forEach((k) => delete mockLocalMap[k]);
    Object.keys(mockSessionMap).forEach((k) => delete mockSessionMap[k]);
    mockState.setDocSpy.mockClear();
    CloudSyncService.clearTenantSession();
  });

  it('aborts syncBidirectional and refuses to overwrite Firestore when pullFromCloud fails', async () => {
    // Firestore holds existing admitted students
    mockState.firestoreDocs.set('schools/SCH001/slices/students', {
      school_erp_students: [{ id: 'std_1', nameEn: 'Mahid Yafee', roll: '01' }],
      school_erp_enquiries: [],
      updatedAt: '2026-11-16T10:00:00.000Z',
    });

    // Simulate network failure on first tenant activation pull
    mockState.simulatedGetDocError = new Error('Simulated offline Firestore error');
    await CloudSyncService.setActiveSaaSTenant('SCH001', true);
    expect(mockState.setDocSpy).not.toHaveBeenCalled();

    // Calling syncBidirectional while pull still fails must return false and NEVER push
    const syncResult = await CloudSyncService.syncBidirectional();
    expect(syncResult).toBe(false);
    expect(mockState.setDocSpy).not.toHaveBeenCalled();
    expect(mockState.firestoreDocs.get('schools/SCH001/slices/students').school_erp_students).toHaveLength(1);
  });

  it('marks pullFromCloud as failed if a chunked slice is missing a chunk, preventing destructive overwrites', async () => {
    mockState.firestoreDocs.set('schools/SCH001/slices/students', {
      __chunked: true,
      chunkCount: 2,
      updatedAt: '2026-11-16T10:00:00.000Z',
    });
    // Missing chunk 1!
    mockState.firestoreDocs.set('schools/SCH001/slices/students__c0', { data: '{"school_erp_students":' });

    await CloudSyncService.setActiveSaaSTenant('SCH001', true);
    expect(mockState.setDocSpy).not.toHaveBeenCalled();
    expect(mockLocalMap['school_erp_students']).toBeUndefined();
  });

  it('pulls existing students intact and skips pushing unpopulated slices during pushLocalToCloud', async () => {
    mockState.firestoreDocs.set('schools/SCH001/slices/students', {
      school_erp_students: [
        { id: 'std_1', studentId: 'SCH001-S-2026-1001', nameEn: 'Mahid Yafee', roll: '01', className: 'Class 10' },
        { id: 'std_2', studentId: 'SCH001-S-2026-1002', nameEn: 'Hiya Akhter', roll: '02', className: 'Class 10' },
      ],
      school_erp_enquiries: [],
      updatedAt: '2026-11-16T10:00:00.000Z',
    });

    await CloudSyncService.setActiveSaaSTenant('SCH001', true);
    const pulledStudents = JSON.parse(mockLocalMap['school_erp_students'] || '[]');
    expect(pulledStudents).toHaveLength(2);
    expect(pulledStudents.map((s: any) => s.nameEn)).toEqual(['Mahid Yafee', 'Hiya Akhter']);

    // Even if syncBidirectional runs when other slices aren't in localStorage, students remain intact
    // and unpopulated slices are NOT written as empty {} docs.
    const ok = await CloudSyncService.syncBidirectional();
    expect(ok).toBe(true);
    expect(mockState.firestoreDocs.get('schools/SCH001/slices/students').school_erp_students).toHaveLength(2);
    expect(mockState.firestoreDocs.get('schools/SCH001/slices/online_payments')).toBeUndefined();
  });

  it('hydrates prioritySlices immediately and pulls remaining slices in background', async () => {
    mockState.firestoreDocs.set('schools/SCH001/slices/profile', {
      school_erp_profile: { id: 'SCH001', nameEn: 'Dhakas School' },
      updatedAt: '2026-11-16T10:00:00.000Z',
    });
    mockState.firestoreDocs.set('schools/SCH001/slices/staff', {
      school_erp_staff: [{ id: 'st_100', nameEn: 'Amzad Hossain' }],
      updatedAt: '2026-11-16T10:00:00.000Z',
    });
    mockState.firestoreDocs.set('schools/SCH001/slices/students', {
      school_erp_students: [{ id: 'std_1', nameEn: 'Mahid Yafee', roll: '01' }],
      updatedAt: '2026-11-16T10:00:00.000Z',
    });

    await CloudSyncService.setActiveSaaSTenant('SCH001', true, {
      prioritySlices: ['profile', 'staff'],
      backgroundRemainingPull: true,
    });

    // Priority slices are already in localStorage right when setActiveSaaSTenant resolves
    expect(JSON.parse(mockLocalMap['school_erp_profile'] || '{}').nameEn).toBe('Dhakas School');
    expect(JSON.parse(mockLocalMap['school_erp_staff'] || '[]')).toHaveLength(1);

    // Background pull completes remaining slices
    await new Promise((r) => setTimeout(r, 30));
    expect(JSON.parse(mockLocalMap['school_erp_students'] || '[]')).toHaveLength(1);
  });
});
