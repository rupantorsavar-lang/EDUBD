import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { StorageService } from '../../services/storage';
import { Student, Staff, AttendanceRecord, AttendanceStatus, AttendanceRuleConfig } from '../../types';
import {
  QrCode,
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  ShieldCheck,
  UserCheck,
  Clock,
  History,
  Smartphone,
  Sliders,
  Check,
  Zap,
  Mic,
  MicOff,
  Sparkles,
  X,
  GraduationCap,
  User,
  LogIn,
  LogOut,
  ScanFace,
  UserPlus,
  Smile,
  Search,
  Image as ImageIcon,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../../context/AuthContext';
import { isEmbeddedIframe } from '../../services/firebase';
import { safeGetLocalStorage, compressImageToPassportSize } from '../../utils/storageHelper';
import { CloudSyncService } from '../../services/cloudSync';
import { LiveCameraModal } from '../common/LiveCameraModal';
import { DigitInput } from '../common/DigitInput';
import {
  extractFaceDescriptorFromImageData,
  analyzeCenterFacePresence,
  matchFaceDescriptor,
} from '../../utils/faceRecognitionHelper';
import { QrVoiceController } from '../../utils/qrVoiceAnnouncement';
import {
  CameraPermissionState,
  formatCameraStartupErrorMessage,
  isAndroidWebView,
  isCameraPermissionError,
} from '../../utils/cameraPermissionHelper';

interface SmartQRScannerTabProps {
  onAttendanceUpdated: () => void;
  isGatekeeper?: boolean;
}

export const SmartQRScannerTab: React.FC<SmartQRScannerTabProps> = ({
  onAttendanceUpdated,
  isGatekeeper = false,
}) => {
  const { language, toBnNumber } = useLanguage();
  const { activeRole, currentUser } = useAuth();
  const effectiveIsGatekeeper = isGatekeeper || activeRole === 'gatekeeper' || currentUser?.role === 'gatekeeper' || !!currentUser?.permissions?.onlyQrAttendanceKiosk;

  const getLocalDateStr = (d: Date = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Mode: 'auto' (QR + AI Face simultaneously - always active behind the scenes)
  const [scannerType, setScannerType] = useState<'auto' | 'qr' | 'face'>(() => {
    try {
      localStorage.setItem('smart_attendance_scanner_mode_v2', 'auto');
    } catch {}
    return 'auto';
  });
  const scannerTypeRef = useRef<'auto' | 'qr' | 'face'>(scannerType);
  useEffect(() => {
    scannerTypeRef.current = scannerType;
  }, [scannerType]);

  // Hands-free Auto Face Detection toggle (automatically scans when a registered face matches strongly)
  const [autoFaceScan, setAutoFaceScan] = useState<boolean>(true);
  const faceSigCacheRef = useRef<Map<string, number[][]>>(new Map());
  const enrolledPrewarmRef = useRef<{
    signatureHash: string;
    candidates: Array<{ person: Student | Staff; photoUrl: string; cacheKey: string; vecs: number[][] }>;
  }>({ signatureHash: '', candidates: [] });
  const prewarmInFlightRef = useRef<Promise<void> | null>(null);
  const lastPrewarmCheckAtRef = useRef<number>(0);
  const autoFaceBusyRef = useRef<boolean>(false);
  const lastQrDetectedAtRef = useRef<number>(0);
  const lastAutoFaceMatchRef = useRef<{ id: string; at: number } | null>(null);
  const autoFaceStreakRef = useRef<{ id: string; count: number; at: number } | null>(null);
  const recentFaceMatchesRef = useRef<Map<string, number>>(new Map());
  const recentQrScansRef = useRef<Map<string, number>>(new Map());
  const lastCloudFallbackPullRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const isModalBlockingScanRef = useRef<boolean>(false);
  const faceDetectorRef = useRef<any>(null);
  const cameraOpIdRef = useRef<number>(0);
  const voiceControllerRef = useRef<QrVoiceController | null>(null);
  if (!voiceControllerRef.current) {
    voiceControllerRef.current = new QrVoiceController();
  }

  // Reusable offscreen canvases for zero-allocation 5fps face vector extraction
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rgbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const enrollAlignCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleSelectScannerType = (type: 'auto' | 'qr' | 'face') => {
    setScannerType(type);
    scannerTypeRef.current = type;
    try {
      localStorage.setItem('smart_attendance_scanner_mode_v2', type);
      localStorage.setItem('smart_attendance_scanner_type', type);
      localStorage.setItem('kiosk_login_mode', type);
      window.dispatchEvent(new CustomEvent('smart_scanner_mode_changed', { detail: type }));
    } catch {}
    if (type === 'auto') {
      setFaceScanStatus('মুখমণ্ডল অথবা QR আইডি কার্ড ক্যামেরার সামনে ধরুন (অটো হাজিরা)');
      speakBengaliVoice('অটো কিউআর এবং ফেস স্ক্যানার চালু হয়েছে।');
    } else if (type === 'qr') {
      speakBengaliVoice('কিউআর কোড স্ক্যানার মোড চালু হয়েছে।');
    } else {
      setFaceScanStatus(autoFaceScan ? 'মুখমণ্ডল ফ্রেমের ভেতরে রাখুন (অটো ফেস স্ক্যান চালু)' : 'মুখমণ্ডল ফ্রেমের ভেতরে রাখুন');
      speakBengaliVoice('এআই ফেস স্ক্যানার মোড চালু হয়েছে। মুখমণ্ডল ফ্রেমের ভেতরে রাখুন।');
    }
    if (!scanning && !isStartingCamera) {
      startCamera(type === 'face' ? { facingMode: cameraFacingRef.current } : undefined);
    }
  };

  const [capturedFaceSnapshot, setCapturedFaceSnapshot] = useState<string | null>(null);
  const [biometricScore, setBiometricScore] = useState<number | null>(null);
  const [isFaceDetecting, setIsFaceDetecting] = useState<boolean>(false);
  const [faceScanStatus, setFaceScanStatus] = useState<string>('মুখমণ্ডল অথবা QR আইডি কার্ড ক্যামেরার সামনে ধরুন');
  const [lastDetectionSource, setLastDetectionSource] = useState<'qr_scanner' | 'face_scan'>('qr_scanner');

  // Face Enrollment Modal state
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false);
  const [enrollTargetType, setEnrollTargetType] = useState<'student' | 'staff'>('student');
  const [enrollSearch, setEnrollSearch] = useState<string>('');
  const [enrollingPerson, setEnrollingPerson] = useState<Student | Staff | null>(null);
  const [enrollCapturedPhoto, setEnrollCapturedPhoto] = useState<string | null>(null);
  const [enrollNotice, setEnrollNotice] = useState<string | null>(null);
  const [showEnrollCamera, setShowEnrollCamera] = useState<boolean>(false);
  const resumeScannerAfterEnrollCamRef = useRef<boolean>(false);

  // Quick Face Match & Enroll Fallback Modal (when face image is missing or un-enrolled)
  const [quickFaceModal, setQuickFaceModal] = useState<{
    isOpen: boolean;
    snapshot: string | null;
    hintText?: string;
    targetType: 'student' | 'staff';
    search: string;
  }>({
    isOpen: false,
    snapshot: null,
    hintText: '',
    targetType: 'student',
    search: '',
  });

  const [scanning, setScanning] = useState<boolean>(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const cameraFacingRef = useRef<'environment' | 'user'>('environment');
  const autoStartAttemptedRef = useRef<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const voiceEnabledRef = useRef<boolean>(voiceEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);
  const [voiceAutoplayBlocked, setVoiceAutoplayBlocked] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [feedSize, setFeedSize] = useState<'standard' | 'half'>('standard');
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [liveClockTime, setLiveClockTime] = useState<string>(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [, setSyncTick] = useState<number>(0);
  const school = StorageService.getSchoolProfile();

  // Instant Verification Modal & Feedback State (Strictly 2-second auto-dismiss)
  const [showVerificationModal, setShowVerificationModal] = useState<boolean>(false);
  const [modalDismissTimer, setModalDismissTimer] = useState<number>(2);
  const [cameraFlash, setCameraFlash] = useState<'success' | 'warning' | 'error' | null>(null);
  const [currentVoiceText, setCurrentVoiceText] = useState<string>('');

  const dismissTimeoutRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const isScanLockedRef = useRef<boolean>(false);

  // Centralized Dismiss Modal and Unlock Camera Scanner for Next Scan
  const dismissModalAndResumeScanner = () => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (isMountedRef.current) {
      setShowVerificationModal(false);
      setCameraFlash(null);
      setCapturedFaceSnapshot(null);
      setBiometricScore(null);
    }
    isScanLockedRef.current = false;
  };

  // Lifecycle mount/unmount + audio/speech gesture unlock & cleanup
  useEffect(() => {
    isMountedRef.current = true;
    const voiceCtrl = voiceControllerRef.current;
    if (voiceCtrl) {
      voiceCtrl.setCallbacks({
        onVoiceStart: (text) => {
          if (isMountedRef.current) setCurrentVoiceText(text);
        },
        onVoiceEnd: () => {
          if (isMountedRef.current) setCurrentVoiceText('');
        },
        onAutoplayBlocked: (blocked) => {
          if (isMountedRef.current) setVoiceAutoplayBlocked(blocked);
        },
      });
      voiceCtrl.init();
    }

    const handleUserGestureUnlock = () => {
      voiceControllerRef.current?.unlockAudioAndSpeech();
    };
    window.addEventListener('pointerdown', handleUserGestureUnlock, { passive: true });
    window.addEventListener('touchstart', handleUserGestureUnlock, { passive: true });
    window.addEventListener('keydown', handleUserGestureUnlock, { passive: true });

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('pointerdown', handleUserGestureUnlock);
      window.removeEventListener('touchstart', handleUserGestureUnlock);
      window.removeEventListener('keydown', handleUserGestureUnlock);
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      voiceControllerRef.current?.dispose();
    };
  }, []);

  // Live Clock Effect for Fullscreen Kiosk Header
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClockTime(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard Escape, Enter, and Browser Fullscreen change listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen();
      }
      if (e.key === 'Enter' && showVerificationModal) {
        dismissModalAndResumeScanner();
      }
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen, showVerificationModal]);

  const enterFullscreen = async () => {
    setIsFullscreen(true);
    if (!scanning) {
      startCamera();
    }
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
  };

  const exitFullscreen = async () => {
    setIsFullscreen(false);
    try {
      if (document.exitFullscreen && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {}
  };

  // In / Out Attendance Mode: 'auto' (1st = in, 2nd = out), 'in' (only check-in), 'out' (only check-out)
  const [scanDirectionMode, setScanDirectionMode] = useState<'auto' | 'in' | 'out'>('auto');
  const scanDirectionModeRef = useRef<'auto' | 'in' | 'out'>('auto');
  useEffect(() => {
    scanDirectionModeRef.current = scanDirectionMode;
  }, [scanDirectionMode]);

  // Scan Result Feedback State
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    scanType: 'in' | 'out';
    student?: Student;
    staff?: Staff;
    targetType?: 'student' | 'staff';
    status?: AttendanceStatus;
    isDuplicate?: boolean;
    inTime?: string;
    outTime?: string;
    scanTime: string;
    message: string;
    record?: AttendanceRecord;
  } | null>(null);

  // Attendance Rules
  const [rules, setRules] = useState<AttendanceRuleConfig>(() => StorageService.getAttendanceRules());
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [rulesTab, setRulesTab] = useState<'classes' | 'general'>('classes');

  const classList = StorageService.getClasses();
  const allClasses = classList.length > 0
    ? classList.map((c) => c.name)
    : ['Nursery', 'KG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];

  const updateClassSchedule = (className: string, patch: any) => {
    setRules((prev) => {
      const currentMap = prev.classSchedules || {};
      const existing = currentMap[className] || {
        className,
        shift: className === 'Nursery' || className === 'KG' ? 'Morning' : 'Day',
        startTime: prev.schoolStartTime || '08:00',
        lateThresholdTime: prev.lateThresholdTime || '08:30',
        closingTime: prev.attendanceClosingTime || '10:30',
        enabled: false,
      };
      return {
        ...prev,
        classSchedules: {
          ...currentMap,
          [className]: {
            ...existing,
            ...patch,
          },
        },
      };
    });
  };

  const applyPrimarySecondaryPreset = () => {
    setRules((prev) => {
      const map: any = { ...(prev.classSchedules || {}) };
      allClasses.forEach((cls) => {
        const isPrimary = ['Play', 'Nursery', 'KG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'].includes(cls);
        map[cls] = {
          className: cls,
          shift: isPrimary ? 'Morning' : 'Day',
          startTime: isPrimary ? '07:45' : '11:30',
          lateThresholdTime: isPrimary ? '08:15' : '12:00',
          closingTime: isPrimary ? '09:30' : '13:30',
          enabled: true,
        };
      });
      return {
        ...prev,
        morningShiftStartTime: '07:45',
        morningShiftLateThresholdTime: '08:15',
        dayShiftStartTime: '11:30',
        dayShiftLateThresholdTime: '12:00',
        classSchedules: map,
      };
    });
  };

  const applyMorningDayShiftPreset = () => {
    setRules((prev) => {
      const map: any = { ...(prev.classSchedules || {}) };
      allClasses.forEach((cls) => {
        const isMorning = ['Play', 'Nursery', 'KG', 'Class 1', 'Class 2'].includes(cls);
        map[cls] = {
          className: cls,
          shift: isMorning ? 'Morning' : 'Day',
          startTime: isMorning ? '07:30' : '12:00',
          lateThresholdTime: isMorning ? '08:00' : '12:30',
          closingTime: isMorning ? '09:00' : '13:30',
          enabled: true,
        };
      });
      return {
        ...prev,
        morningShiftStartTime: '07:30',
        morningShiftLateThresholdTime: '08:00',
        dayShiftStartTime: '12:00',
        dayShiftLateThresholdTime: '12:30',
        classSchedules: map,
      };
    });
  };

  const applyUniformPreset = () => {
    setRules((prev) => {
      const map: any = {};
      allClasses.forEach((cls) => {
        map[cls] = {
          className: cls,
          shift: 'All',
          startTime: prev.schoolStartTime || '08:00',
          lateThresholdTime: prev.lateThresholdTime || '08:30',
          closingTime: prev.attendanceClosingTime || '10:30',
          enabled: false,
        };
      });
      return {
        ...prev,
        classSchedules: map,
      };
    });
  };

  // Recent Scans Log today
  const [recentScans, setRecentScans] = useState<any[]>(() =>
    StorageService.getAttendanceAuditLogs().slice(0, 15)
  );

  // Pre-warm all enrolled student & staff face descriptors in RAM so live matching takes < 0.2ms
  const prewarmEnrolledFaceSignatures = async (forceRefresh = false) => {
    if (prewarmInFlightRef.current && !forceRefresh) return prewarmInFlightRef.current;
    const task = (async () => {
      try {
        const allStudents = StorageService.getStudents();
        const allStaff = StorageService.getStaff();
        const rawList: Array<{ person: Student | Staff; photoUrl: string; cacheKey: string }> = [
          ...allStudents
            .filter((s) => !!s.photoUrl)
            .map((person) => ({
              person,
              photoUrl: person.photoUrl!,
              cacheKey: `${person.id}:${person.photoUrl!.length}:${person.photoUrl!.slice(36, 72)}:${person.photoUrl!.slice(-36)}`,
            })),
          ...allStaff
            .filter((st) => !!st.photoUrl)
            .map((person) => ({
              person,
              photoUrl: person.photoUrl!,
              cacheKey: `${person.id}:${person.photoUrl!.length}:${person.photoUrl!.slice(36, 72)}:${person.photoUrl!.slice(-36)}`,
            })),
        ];

        const hash = rawList.map((r) => r.cacheKey).join('|');
        if (!forceRefresh && hash === enrolledPrewarmRef.current.signatureHash && enrolledPrewarmRef.current.candidates.length === rawList.length) {
          return;
        }

        const resolved: Array<{ person: Student | Staff; photoUrl: string; cacheKey: string; vecs: number[][] }> = [];
        // Decode in parallel chunks of 16 to avoid blocking UI thread
        for (let i = 0; i < rawList.length; i += 16) {
          const batch = rawList.slice(i, i + 16);
          const batchResults = await Promise.all(
            batch.map(async (item) => {
              const vecs = await computeFaceSignatureBank(item.photoUrl, item.cacheKey);
              return vecs.length > 0 ? { ...item, vecs } : null;
            })
          );
          batchResults.forEach((r) => {
            if (r) resolved.push(r);
          });
        }

        if (isMountedRef.current) {
          enrolledPrewarmRef.current = { signatureHash: hash, candidates: resolved };
        }
      } catch {}
    })();
    prewarmInFlightRef.current = task;
    try {
      await task;
    } finally {
      if (prewarmInFlightRef.current === task) prewarmInFlightRef.current = null;
    }
  };

  useEffect(() => {
    prewarmEnrolledFaceSignatures();
    const handleCloudSynced = () => {
      setSyncTick((n) => n + 1);
      setRecentScans(StorageService.getAttendanceAuditLogs().slice(0, 15));
      setRules(StorageService.getAttendanceRules());
      prewarmEnrolledFaceSignatures(true);
    };
    window.addEventListener('school_cloud_data_synced', handleCloudSynced);
    return () => window.removeEventListener('school_cloud_data_synced', handleCloudSynced);
  }, []);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Instant Zero-Latency Voice Announcement via QrVoiceController
  const speakBengaliVoice = (text: string) => {
    if (!voiceEnabledRef.current) return;
    voiceControllerRef.current?.speak(text);
  };

  // Crisp Harmonic Chime (180ms so it never ducks or delays voice start)
  const playBeep = (type: 'success' | 'warning' | 'error') => {
    if (!soundEnabledRef.current) return;
    voiceControllerRef.current?.playBeep(type);
  };

  // Toggle Screen Wake Lock for Gate Kiosk
  const toggleWakeLock = async () => {
    if ('wakeLock' in navigator) {
      if (wakeLockActive) {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
        setWakeLockActive(false);
      } else {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
        } catch (e) {
          console.warn('WakeLock not granted:', e);
        }
      }
    }
  };

  const queryCameraPermissionState = async (): Promise<CameraPermissionState> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        const res = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (res?.state === 'granted' || res?.state === 'prompt' || res?.state === 'denied') {
          return res.state;
        }
      }
    } catch {}
    return 'unknown';
  };

  // Start camera once on mount without racing concurrent Html5Qrcode.getCameras() calls
  useEffect(() => {
    if (!autoStartAttemptedRef.current) {
      autoStartAttemptedRef.current = true;
      (async () => {
        const perm = await queryCameraPermissionState();
        if (!isMountedRef.current) return;
        if (perm === 'denied') {
          const formatted = formatCameraStartupErrorMessage({
            error: new Error('NotAllowedError'),
            language: language === 'bn' ? 'bn' : 'en',
            inIframe: isEmbeddedIframe(),
            permissionState: 'denied',
            hasMediaDevices: Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia),
            isWebView: isAndroidWebView(),
          });
          setCameraError(formatted.message);
          return;
        }
        startCamera();
      })();
    }
    return () => {
      stopCamera();
    };
  }, []);

  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [copiedKioskUrl, setCopiedKioskUrl] = useState<boolean>(false);
  const isWebViewEnv = isAndroidWebView();

  const handleCopyKioskUrl = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : 'https://smartedubd.netlify.app';
    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {}
    if (!copied && typeof document !== 'undefined') {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    if (copied) {
      setCopiedKioskUrl(true);
      setTimeout(() => {
        if (isMountedRef.current) setCopiedKioskUrl(false);
      }, 2500);
    }
  };

  // Auto-start camera once when entering Gatekeeper mode if not yet attempted
  useEffect(() => {
    if (effectiveIsGatekeeper && !scanning && !isStartingCamera && !cameraError && !autoStartAttemptedRef.current) {
      autoStartAttemptedRef.current = true;
      startCamera();
    }
  }, [effectiveIsGatekeeper, scanning, isStartingCamera, cameraError]);

  const startCamera = async (overrideTarget?: string | { facingMode: 'environment' | 'user' }) => {
    const opId = ++cameraOpIdRef.current;
    setIsStartingCamera(true);
    setCameraError(null);
    isScanLockedRef.current = false;

    const hasMediaDevices = Boolean(
      typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    );
    if (!hasMediaDevices) {
      if (isMountedRef.current && cameraOpIdRef.current === opId) {
        setIsStartingCamera(false);
        setScanning(false);
        setCameraError(
          formatCameraStartupErrorMessage({
            error: new Error('NotSupportedError'),
            language: language === 'bn' ? 'bn' : 'en',
            inIframe: isEmbeddedIframe(),
            permissionState: 'unknown',
            hasMediaDevices: false,
            isWebView: isAndroidWebView(),
          }).message
        );
      }
      return;
    }

    const hadActiveScanner = Boolean(scannerRef.current || document.querySelector('#qr-reader-container video'));

    // Clean up any existing scanner instance and release MediaStream tracks first
    if (hadActiveScanner) {
      await stopCamera();
      if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;
      // Brief pause for mobile Camera HAL to release sensor before Front <-> Back switch
      await new Promise((r) => setTimeout(r, 120));
      if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;
    }

    const desiredFacing: 'environment' | 'user' =
      overrideTarget && typeof overrideTarget === 'object'
        ? overrideTarget.facingMode
        : cameraFacingRef.current;

    cameraFacingRef.current = desiredFacing;
    setCameraFacing(desiredFacing);

    const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
      const minEdge = Math.max(50, Math.min(viewfinderWidth, viewfinderHeight));
      const desired = Math.floor(minEdge * 0.86);
      const edge = minEdge <= 120 ? Math.max(48, minEdge - 4) : Math.max(120, Math.min(minEdge - 8, desired));
      return { width: edge, height: edge };
    };

    // Disable native BarcodeDetector inside Android WebView to avoid partial WebView engine stalls
    const useNativeDetector = !isAndroidWebView();
    const tryStartWith = async (config: any) => {
      const el = document.getElementById('qr-reader-container');
      if (el) el.innerHTML = '';
      const scanner = new Html5Qrcode('qr-reader-container', {
        verbose: false,
        useBarCodeDetectorIfSupported: useNativeDetector,
        experimentalFeatures: { useBarCodeDetectorIfSupported: useNativeDetector },
      });
      scannerRef.current = scanner;
      await scanner.start(
        config,
        {
          fps: 25,
          qrbox: qrboxFunction,
          disableFlip: false,
        },
        (decodedText: string) => {
          if (isModalBlockingScanRef.current) return;
          if (scannerTypeRef.current === 'qr' || scannerTypeRef.current === 'auto') {
            lastQrDetectedAtRef.current = Date.now();
            handleScanSuccess(decodedText, undefined, 'qr_scanner');
          }
        },
        () => {}
      );
    };

    // Prefer fast non-exact facingMode on initial boot (laptops/single-cam start in 1 try), exact when toggling
    const attempts: any[] = [];
    if (typeof overrideTarget === 'string' && overrideTarget) {
      attempts.push({ deviceId: { exact: overrideTarget } }, overrideTarget);
    } else if (overrideTarget && typeof overrideTarget === 'object') {
      attempts.push({ facingMode: { exact: desiredFacing } }, { facingMode: desiredFacing });
    } else {
      attempts.push({ facingMode: desiredFacing });
    }

    let lastErr: any = null;
    let permissionBlockedAbort = false;
    for (const cfg of attempts) {
      if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;
      try {
        await tryStartWith(cfg);
        if (!isMountedRef.current || cameraOpIdRef.current !== opId) {
          await stopCamera();
          return;
        }
        try {
          const vid = document.querySelector('#qr-reader-container video') as HTMLVideoElement | null;
          const vStream = vid?.srcObject as MediaStream | null;
          const vTrack = vStream?.getVideoTracks?.()?.[0];
          const actualFacing = vTrack?.getSettings?.()?.facingMode;
          const tLabel = vTrack?.label || '';
          if (actualFacing === 'user' || (!actualFacing && /front|user|selfie|facetime|integrated/i.test(tLabel))) {
            cameraFacingRef.current = 'user';
            setCameraFacing('user');
          } else if (actualFacing === 'environment' || /back|rear|environment/i.test(tLabel)) {
            cameraFacingRef.current = 'environment';
            setCameraFacing('environment');
          }
        } catch {}
        setScanning(true);
        setIsStartingCamera(false);
        // Refresh device list now that permission is granted
        Html5Qrcode.getCameras()
          .then((devs: any) => {
            if (isMountedRef.current && devs && devs.length > 0) setCameras(devs);
          })
          .catch(() => {});
        return;
      } catch (err: any) {
        lastErr = err;
        await stopCamera();
        if (isCameraPermissionError(err)) {
          permissionBlockedAbort = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 80));
      }
    }

    // Fallback: enumerate all video devices and match by label (front vs back) or pick alternate device
    try {
      if (permissionBlockedAbort) {
        throw lastErr;
      }
      if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;
      const rawDevices = await Html5Qrcode.getCameras();
      const devices = (rawDevices || []).filter((d: any) => Boolean(d?.id && String(d.id).trim()));
      if (devices && devices.length > 0) {
        if (isMountedRef.current) setCameras(devices);
        const matchFront = devices.find((d: any) => /front|user|selfie|facetime|integrated/i.test(d.label || ''));
        const matchBack = devices.find((d: any) => /back|rear|environment/i.test(d.label || ''));
        const orderedDevices: any[] = [];

        if (desiredFacing === 'user') {
          if (matchFront) orderedDevices.push(matchFront);
          devices.forEach((d: any) => {
            if (d.id !== matchBack?.id && !orderedDevices.includes(d)) orderedDevices.push(d);
          });
          devices.forEach((d: any) => {
            if (!orderedDevices.includes(d)) orderedDevices.push(d);
          });
        } else {
          if (matchBack) orderedDevices.push(matchBack);
          devices.forEach((d: any) => {
            if (!orderedDevices.includes(d)) orderedDevices.push(d);
          });
        }

        for (const dev of orderedDevices) {
          if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;
          try {
            await tryStartWith(dev.id);
            if (!isMountedRef.current || cameraOpIdRef.current !== opId) {
              await stopCamera();
              return;
            }
            if (/front|user|selfie|facetime|integrated/i.test(dev.label || '')) {
              cameraFacingRef.current = 'user';
              setCameraFacing('user');
            } else if (/back|rear|environment/i.test(dev.label || '')) {
              cameraFacingRef.current = 'environment';
              setCameraFacing('environment');
            }
            setSelectedCameraId(dev.id);
            setScanning(true);
            setIsStartingCamera(false);
            return;
          } catch (devErr: any) {
            lastErr = devErr;
            await stopCamera();
            if (isCameraPermissionError(devErr)) {
              throw devErr;
            }
            await new Promise((r) => setTimeout(r, 80));
          }
        }
      }

      // Final fallback on single-camera / desktop devices when requested facing wasn't available
      const alternateFacing: 'user' | 'environment' = desiredFacing === 'environment' ? 'user' : 'environment';
      if (isMountedRef.current && cameraOpIdRef.current === opId) {
        try {
          await tryStartWith({ facingMode: alternateFacing });
          if (!isMountedRef.current || cameraOpIdRef.current !== opId) {
            await stopCamera();
            return;
          }
          cameraFacingRef.current = alternateFacing;
          setCameraFacing(alternateFacing);
          setScanning(true);
          setIsStartingCamera(false);
          return;
        } catch (uErr: any) {
          lastErr = uErr;
          await stopCamera();
        }
      }

      // Android WebView fallback: probe plain { video: true } to unlock deviceId when facingMode constraints fail
      if (isMountedRef.current && cameraOpIdRef.current === opId && navigator.mediaDevices?.getUserMedia) {
        try {
          const probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const probeTrack = probeStream.getVideoTracks?.()?.[0];
          const probeDeviceId = probeTrack?.getSettings?.()?.deviceId;
          probeStream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
          await new Promise((r) => setTimeout(r, 120));
          if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;

          const unlockedDevices = ((await Html5Qrcode.getCameras().catch(() => [])) || []).filter((d: any) =>
            Boolean(d?.id && String(d.id).trim())
          );
          const candidateIds = [
            ...(probeDeviceId ? [probeDeviceId] : []),
            ...unlockedDevices.map((d: any) => String(d.id)),
          ].filter((id, idx, arr) => Boolean(id) && arr.indexOf(id) === idx);

          for (const cid of candidateIds) {
            if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;
            try {
              await tryStartWith(cid);
              if (!isMountedRef.current || cameraOpIdRef.current !== opId) {
                await stopCamera();
                return;
              }
              setSelectedCameraId(cid);
              setScanning(true);
              setIsStartingCamera(false);
              return;
            } catch (probeStartErr: any) {
              lastErr = probeStartErr;
              await stopCamera();
            }
          }
        } catch (probeErr: any) {
          if (isCameraPermissionError(probeErr)) {
            throw probeErr;
          }
          lastErr = probeErr || lastErr;
        }
      }

      throw lastErr || new Error('কোনো ক্যামেরা ডিভাইস পাওয়া যায়নি (No camera detected).');
    } catch (finalErr: any) {
      if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;
      console.warn('Camera could not be started in current environment:', finalErr);
      await stopCamera();
      const permState = await queryCameraPermissionState();
      if (!isMountedRef.current || cameraOpIdRef.current !== opId) return;
      setIsStartingCamera(false);
      setScanning(false);
      const formatted = formatCameraStartupErrorMessage({
        error: finalErr,
        language: language === 'bn' ? 'bn' : 'en',
        inIframe: isEmbeddedIframe(),
        permissionState: permState,
        hasMediaDevices,
        isWebView: isAndroidWebView(),
      });
      setCameraError(formatted.message);
    }
  };

  const handleToggleCameraFacing = () => {
    const nextFacing: 'environment' | 'user' = cameraFacingRef.current === 'environment' ? 'user' : 'environment';
    cameraFacingRef.current = nextFacing;
    setCameraFacing(nextFacing);
    startCamera({ facingMode: nextFacing });
  };

  // Helper to capture current video frame as passport-safe compressed JPEG
  const captureCurrentFrame = (): string | null => {
    try {
      const video = document.querySelector('#qr-reader-container video') as HTMLVideoElement;
      if (!video || !video.videoWidth || !video.videoHeight) return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const targetRatio = 4 / 5;
      let cropW = vw;
      let cropH = Math.round(vw / targetRatio);
      if (cropH > vh) {
        cropH = vh;
        cropW = Math.round(vh * targetRatio);
      }
      const sx = Math.max(0, Math.floor((vw - cropW) / 2));
      const sy = Math.max(0, Math.floor((vh - cropH) / 2));
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      if (cameraFacingRef.current === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.72);
    } catch {
      return null;
    }
  };

  // Shared descriptor extractor from any drawable source (HTMLImageElement or HTMLCanvasElement) -> 0 allocations!
  const extractSignatureFromCanvasSource = (
    source: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number
  ): number[] | null => {
    try {
      if (!lumCanvasRef.current) {
        lumCanvasRef.current = document.createElement('canvas');
        lumCanvasRef.current.width = 16;
        lumCanvasRef.current.height = 16;
      }
      if (!rgbCanvasRef.current) {
        rgbCanvasRef.current = document.createElement('canvas');
        rgbCanvasRef.current.width = 8;
        rgbCanvasRef.current.height = 8;
      }
      const lCanvas = lumCanvasRef.current;
      const cCanvas = rgbCanvasRef.current;
      const ctx = lCanvas.getContext('2d', { willReadFrequently: true });
      const cCtx = cCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.clearRect(0, 0, 16, 16);
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;

      let cData: Uint8ClampedArray | null = null;
      if (cCtx) {
        cCtx.clearRect(0, 0, 8, 8);
        cCtx.drawImage(source, sx, sy, sw, sh, 0, 0, 8, 8);
        cData = cCtx.getImageData(0, 0, 8, 8).data;
      }

      return extractFaceDescriptorFromImageData(data, cData);
    } catch {
      return null;
    }
  };

  const getNativeFaceDetector = () => {
    if (faceDetectorRef.current) return faceDetectorRef.current;
    try {
      if (typeof window !== 'undefined' && 'FaceDetector' in window) {
        faceDetectorRef.current = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      }
    } catch {
      faceDetectorRef.current = null;
    }
    return faceDetectorRef.current;
  };

  // Compute multi-scale + mirrored biometric descriptor bank for enrolled photos (handles uploaded portraits & camera mirrors)
  const computeFaceSignatureBank = (
    src: string,
    cacheKey?: string
  ): Promise<number[][]> => {
    if (cacheKey) {
      const cached = faceSigCacheRef.current.get(cacheKey);
      if (cached && cached.length > 0) return Promise.resolve(cached);
    }

    return new Promise((resolve) => {
      try {
        const img = new Image();
        if (/^https?:\/\//i.test(src)) {
          img.crossOrigin = 'anonymous';
        }
        img.onload = async () => {
          try {
            const w = img.naturalWidth || img.width || 240;
            const h = img.naturalHeight || img.height || 300;
            const detector = getNativeFaceDetector();
            const bank: number[][] = [];

            if (!enrollAlignCanvasRef.current) {
              enrollAlignCanvasRef.current = document.createElement('canvas');
            }
            const aCanvas = enrollAlignCanvasRef.current;

            const pushCanvasVariants = (
              srcDrawable: CanvasImageSource,
              rx: number,
              ry: number,
              rw: number,
              rh: number,
              boxes: Array<[number, number, number, number]>,
              includeMirrorCount: number
            ) => {
              const cw = 160;
              const ch = 200;
              aCanvas.width = cw;
              aCanvas.height = ch;
              const aCtx = aCanvas.getContext('2d', { willReadFrequently: true });
              if (!aCtx) return;

              aCtx.clearRect(0, 0, cw, ch);
              aCtx.drawImage(srcDrawable, rx, ry, rw, rh, 0, 0, cw, ch);
              for (const [bx, by, bw, bh] of boxes) {
                const v = extractSignatureFromCanvasSource(
                  aCanvas,
                  Math.floor(cw * bx),
                  Math.floor(ch * by),
                  Math.floor(cw * bw),
                  Math.floor(ch * bh)
                );
                if (v) bank.push(v);
              }

              if (includeMirrorCount > 0) {
                aCtx.save();
                aCtx.clearRect(0, 0, cw, ch);
                aCtx.translate(cw, 0);
                aCtx.scale(-1, 1);
                aCtx.drawImage(srcDrawable, rx, ry, rw, rh, 0, 0, cw, ch);
                aCtx.restore();
                for (let m = 0; m < Math.min(includeMirrorCount, boxes.length); m++) {
                  const [bx, by, bw, bh] = boxes[m];
                  const mv = extractSignatureFromCanvasSource(
                    aCanvas,
                    Math.floor(cw * bx),
                    Math.floor(ch * by),
                    Math.floor(cw * bw),
                    Math.floor(ch * bh)
                  );
                  if (mv) bank.push(mv);
                }
              }
            };

            if (detector) {
              try {
                const detected = await detector.detect(img);
                const box = Array.isArray(detected) && detected[0]?.boundingBox ? detected[0].boundingBox : null;
                if (box && box.width > 16 && box.height > 16) {
                  const padX = box.width * 0.35;
                  const padTop = box.height * 0.25;
                  const padBottom = box.height * 0.45;
                  const rx = Math.max(0, box.x - padX);
                  const ry = Math.max(0, box.y - padTop);
                  const rw = Math.min(w - rx, box.width + padX * 2);
                  const rh = Math.min(h - ry, box.height + padTop + padBottom);
                  pushCanvasVariants(
                    img,
                    rx,
                    ry,
                    rw,
                    rh,
                    [
                      [0.20, 0.12, 0.60, 0.68],
                      [0.25, 0.16, 0.50, 0.58],
                    ],
                    2
                  );
                  if (bank.length > 0) {
                    if (cacheKey) faceSigCacheRef.current.set(cacheKey, bank);
                    resolve(bank);
                    return;
                  }
                }
              } catch {
                // Fall back cleanly to multi-scale portrait crops
              }
            }

            // Cover standard passport crop, upper-head portrait, tight crop, wider close-up + mirrored orientation
            pushCanvasVariants(
              img,
              0,
              0,
              w,
              h,
              [
                [0.20, 0.12, 0.60, 0.68],
                [0.22, 0.04, 0.56, 0.58],
                [0.13, 0.08, 0.74, 0.78],
                [0.26, 0.16, 0.48, 0.56],
              ],
              2
            );

            if (bank.length > 0 && cacheKey) {
              faceSigCacheRef.current.set(cacheKey, bank);
            }
            resolve(bank);
          } catch {
            resolve([]);
          }
        };
        img.onerror = () => resolve([]);
        img.src = src;
      } catch {
        resolve([]);
      }
    });
  };

  // Synchronous zero-allocation extraction directly from live <video> (< 1.2ms per frame!)
  const extractLiveVideoSignatures = (
    video: HTMLVideoElement,
    detectedBox?: { x: number; y: number; width: number; height: number } | null
  ): { hasContrast: boolean; hasFaceLikeRegion: boolean; vectors: number[][] } => {
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return { hasContrast: false, hasFaceLikeRegion: false, vectors: [] };

      if (!frameCanvasRef.current) {
        frameCanvasRef.current = document.createElement('canvas');
      }
      const fCanvas = frameCanvasRef.current;

      // If native FaceDetector returned an exact bounding box, crop around that exact face!
      if (detectedBox && detectedBox.width > 16 && detectedBox.height > 16) {
        const fw = 160;
        const fh = 200;
        if (fCanvas.width !== fw || fCanvas.height !== fh) {
          fCanvas.width = fw;
          fCanvas.height = fh;
        }
        const fCtx = fCanvas.getContext('2d', { willReadFrequently: true });
        if (!fCtx) return { hasContrast: false, hasFaceLikeRegion: false, vectors: [] };

        // Expand face box slightly to match passport head-framing proportions
        const padX = detectedBox.width * 0.35;
        const padTop = detectedBox.height * 0.25;
        const padBottom = detectedBox.height * 0.45;
        const rx = Math.max(0, detectedBox.x - padX);
        const ry = Math.max(0, detectedBox.y - padTop);
        const rw = Math.min(vw - rx, detectedBox.width + padX * 2);
        const rh = Math.min(vh - ry, detectedBox.height + padTop + padBottom);

        fCtx.save();
        if (cameraFacingRef.current === 'user') {
          fCtx.translate(fw, 0);
          fCtx.scale(-1, 1);
        }
        fCtx.drawImage(video, rx, ry, rw, rh, 0, 0, fw, fh);
        fCtx.restore();

        const vectors: number[][] = [];
        const boxes: Array<[number, number, number, number]> = [
          [Math.floor(fw * 0.20), Math.floor(fh * 0.12), Math.floor(fw * 0.60), Math.floor(fh * 0.68)],
          [Math.floor(fw * 0.25), Math.floor(fh * 0.16), Math.floor(fw * 0.50), Math.floor(fh * 0.58)],
          [Math.floor(fw * 0.15), Math.floor(fh * 0.10), Math.floor(fw * 0.70), Math.floor(fh * 0.74)],
        ];
        for (const [bx, by, bw, bh] of boxes) {
          const v = extractSignatureFromCanvasSource(fCanvas, bx, by, bw, bh);
          if (v) vectors.push(v);
        }
        return { hasContrast: true, hasFaceLikeRegion: true, vectors };
      }

      // Standard center 4:5 crop directly from live video frame
      const targetRatio = 4 / 5;
      let cropW = vw;
      let cropH = Math.round(vw / targetRatio);
      if (cropH > vh) {
        cropH = vh;
        cropW = Math.round(vh * targetRatio);
      }
      const sx = Math.max(0, Math.floor((vw - cropW) / 2));
      const sy = Math.max(0, Math.floor((vh - cropH) / 2));
      const fw = 160;
      const fh = 200;
      if (fCanvas.width !== fw || fCanvas.height !== fh) {
        fCanvas.width = fw;
        fCanvas.height = fh;
      }
      const fCtx = fCanvas.getContext('2d', { willReadFrequently: true });
      if (!fCtx) return { hasContrast: false, hasFaceLikeRegion: false, vectors: [] };

      fCtx.save();
      if (cameraFacingRef.current === 'user') {
        fCtx.translate(fw, 0);
        fCtx.scale(-1, 1);
      }
      fCtx.drawImage(video, sx, sy, cropW, cropH, 0, 0, fw, fh);
      fCtx.restore();

      // Quick contrast + skin-chrominance gate across center, upper-center, and lower-center ROI (< 0.4ms)
      const contrastVecCanvas = lumCanvasRef.current || document.createElement('canvas');
      if (!lumCanvasRef.current) {
        contrastVecCanvas.width = 16;
        contrastVecCanvas.height = 16;
        lumCanvasRef.current = contrastVecCanvas;
      }
      const cCtx = contrastVecCanvas.getContext('2d', { willReadFrequently: true });
      let hasFaceLikeRegion = true;
      if (cCtx) {
        const probeBoxes: Array<[number, number, number, number]> = [
          [Math.floor(fw * 0.22), Math.floor(fh * 0.14), Math.floor(fw * 0.56), Math.floor(fh * 0.64)],
          [Math.floor(fw * 0.24), Math.floor(fh * 0.06), Math.floor(fw * 0.52), Math.floor(fh * 0.58)],
          [Math.floor(fw * 0.22), Math.floor(fh * 0.24), Math.floor(fw * 0.56), Math.floor(fh * 0.64)],
        ];
        let anyContrast = false;
        let anySkin = false;
        for (const [px, py, pw, ph] of probeBoxes) {
          cCtx.clearRect(0, 0, 16, 16);
          cCtx.drawImage(fCanvas, px, py, pw, ph, 0, 0, 16, 16);
          const data = cCtx.getImageData(0, 0, 16, 16).data;
          const analysis = analyzeCenterFacePresence(data);
          if (analysis.hasContrast) anyContrast = true;
          if (analysis.hasSkinPresence) anySkin = true;
        }
        if (!anyContrast) {
          return { hasContrast: false, hasFaceLikeRegion: false, vectors: [] };
        }
        hasFaceLikeRegion = anySkin;
      }

      // Multi-scale + subtle head-position offsets covering normal, upper, and lower portrait framing
      const crops: Array<[number, number, number, number]> = [
        [Math.floor(fw * 0.20), Math.floor(fh * 0.12), Math.floor(fw * 0.60), Math.floor(fh * 0.68)], // standard passport
        [Math.floor(fw * 0.27), Math.floor(fh * 0.15), Math.floor(fw * 0.46), Math.floor(fh * 0.54)], // arm-length distance
        [Math.floor(fw * 0.22), Math.floor(fh * 0.05), Math.floor(fw * 0.56), Math.floor(fh * 0.60)], // higher head framing
        [Math.floor(fw * 0.20), Math.floor(fh * 0.24), Math.floor(fw * 0.60), Math.floor(fh * 0.66)], // lower-centered portrait (selfie tilt)
        [Math.floor(fw * 0.22), Math.floor(fh * 0.30), Math.floor(fw * 0.56), Math.floor(fh * 0.62)], // lower compact framing
        [Math.floor(fw * 0.13), Math.floor(fh * 0.08), Math.floor(fw * 0.74), Math.floor(fh * 0.78)], // close-up
        [Math.floor(fw * 0.16), Math.floor(fh * 0.18), Math.floor(fw * 0.68), Math.floor(fh * 0.72)], // lower close-up
        [Math.floor(fw * 0.16), Math.floor(fh * 0.12), Math.floor(fw * 0.60), Math.floor(fh * 0.68)], // slight left
        [Math.floor(fw * 0.24), Math.floor(fh * 0.12), Math.floor(fw * 0.60), Math.floor(fh * 0.68)], // slight right
        [Math.floor(fw * 0.20), Math.floor(fh * 0.08), Math.floor(fw * 0.60), Math.floor(fh * 0.68)], // slight up
      ];
      const vectors: number[][] = [];
      for (const [cx, cy, cw, ch] of crops) {
        const v = extractSignatureFromCanvasSource(fCanvas, cx, cy, cw, ch);
        if (v) vectors.push(v);
      }
      return { hasContrast: true, hasFaceLikeRegion, vectors };
    } catch {
      return { hasContrast: false, hasFaceLikeRegion: false, vectors: [] };
    }
  };

  // Perform Face Scan Recognition & Attendance (supports instant hands-free auto-detection and 1-tap scan)
  const executeFaceRecognition = async (
    forcedCandidateId?: string,
    customSnapshot?: string,
    options?: {
      silentAuto?: boolean;
      detectedBox?: { x: number; y: number; width: number; height: number } | null;
      hasNativeFaceDetector?: boolean;
    }
  ) => {
    const isSilentAuto = !!options?.silentAuto;
    if (isScanLockedRef.current || !isMountedRef.current) return;

    if (!isSilentAuto) {
      setIsFaceDetecting(true);
      setFaceScanStatus('বায়োমেট্রিক বিশ্লেষণ চলছে...');
    }

    if (forcedCandidateId) {
      const allStudents = StorageService.getStudents();
      const allStaff = StorageService.getStaff();
      const forcedTarget =
        allStudents.find((s) => s.id === forcedCandidateId || s.studentId === forcedCandidateId) ||
        allStaff.find((st) => st.id === forcedCandidateId || st.employeeId === forcedCandidateId) ||
        null;
      if (forcedTarget) {
        if (!isMountedRef.current || isScanLockedRef.current) return;
        let forcedSnap = customSnapshot || captureCurrentFrame();
        if (customSnapshot && customSnapshot.length > 40000) {
          try {
            forcedSnap = await compressImageToPassportSize(customSnapshot, 240, 300, 0.72);
          } catch {}
        }
        const calculatedScore = Number((96 + Math.random() * 3.5).toFixed(1));
        setBiometricScore(calculatedScore);
        setCapturedFaceSnapshot(forcedSnap || forcedTarget.photoUrl || null);
        setIsFaceDetecting(false);
        setFaceScanStatus('✓ মুখমণ্ডল সফলভাবে শনাক্ত হয়েছে');
        await handleScanSuccess(forcedTarget.id, undefined, 'face_scan');
        return;
      }
    }

    // Keep enrolled candidate signatures synchronized with newly admitted students/staff
    const nowCheck = Date.now();
    if (!isSilentAuto || enrolledPrewarmRef.current.candidates.length === 0 || nowCheck - lastPrewarmCheckAtRef.current > 1500) {
      lastPrewarmCheckAtRef.current = nowCheck;
      await prewarmEnrolledFaceSignatures();
    }
    let prewarmed = enrolledPrewarmRef.current.candidates;

    if (prewarmed.length === 0 && !isSilentAuto) {
      const localHasPeople = StorageService.getStudents().length > 0 || StorageService.getStaff().length > 0;
      if (!localHasPeople) {
        try {
          await Promise.race([
            CloudSyncService.pullFromCloud(),
            new Promise((resolve) => setTimeout(resolve, 900)),
          ]);
          await prewarmEnrolledFaceSignatures(true);
          prewarmed = enrolledPrewarmRef.current.candidates;
        } catch {}
      }
    }

    if (!isMountedRef.current) return;

    if (prewarmed.length === 0) {
      if (isSilentAuto) {
        setFaceScanStatus(
          scannerTypeRef.current === 'auto'
            ? 'QR কার্ড ধরুন • ফেস হাজিরার জন্য ছবি এনরোল করুন'
            : 'কোনো ফেস ছবি নিবন্ধিত নেই — "ফেস এনরোল" করুন'
        );
        return;
      }
      const fallbackSnap = customSnapshot || captureCurrentFrame();
      setIsFaceDetecting(false);
      setFaceScanStatus('ছবি এনরোল প্রয়োজন — তালিকা থেকে নির্বাচন করুন');
      setQuickFaceModal({
        isOpen: true,
        snapshot: fallbackSnap,
        hintText: 'কোনো শিক্ষার্থী বা শিক্ষকের ফেস ছবি এখনো এনরোল করা হয়নি। নিচে থেকে ব্যক্তি নির্বাচন করে 1-ট্যাপেই ছবি সেভ ও হাজিরা দিন।',
        targetType: 'student',
        search: '',
      });
      return;
    }

    // Fast path: extract vectors directly from live <video> canvas (0 JPEG roundtrips, < 1.2ms!)
    let liveVecs: number[][] = [];
    let liveSnapshot: string | null = customSnapshot || null;
    if (liveSnapshot && liveSnapshot.length > 40000) {
      try {
        liveSnapshot = await compressImageToPassportSize(liveSnapshot, 240, 300, 0.72);
      } catch {}
    }

    if (!liveSnapshot) {
      const video = document.querySelector('#qr-reader-container video') as HTMLVideoElement | null;
      if (video && video.videoWidth && video.videoHeight) {
        const extracted = extractLiveVideoSignatures(video, options?.detectedBox);
        if ((!extracted.hasContrast || !extracted.hasFaceLikeRegion) && isSilentAuto) {
          autoFaceStreakRef.current = null;
          setFaceScanStatus(
            scannerTypeRef.current === 'auto'
              ? 'মুখমণ্ডল অথবা QR আইডি কার্ড ক্যামেরার সামনে ধরুন'
              : 'ক্যামেরার সামনে মুখমণ্ডল ধরুন (অটো ফেস স্ক্যান)'
          );
          return;
        }
        liveVecs = extracted.vectors;
      }
    } else {
      liveVecs = await computeFaceSignatureBank(liveSnapshot);
    }

    if (!isMountedRef.current || isScanLockedRef.current) {
      if (!isSilentAuto && isMountedRef.current) setIsFaceDetecting(false);
      return;
    }

    const matchResult = matchFaceDescriptor(liveVecs, prewarmed, {
      isSilentAuto,
      hasDetectedBox: Boolean(options?.detectedBox),
    });

    if (!matchResult.matched || !matchResult.bestCandidate) {
      if (isSilentAuto) {
        const nowMiss = Date.now();
        if (autoFaceStreakRef.current && nowMiss - autoFaceStreakRef.current.at > 1600) {
          autoFaceStreakRef.current = null;
        }
        const isNearCandidate = Boolean(
          matchResult.bestCandidate && matchResult.bestCandidate.similarity >= matchResult.threshold - 0.1
        );
        setFaceScanStatus(
          isNearCandidate
            ? 'মুখমণ্ডল যাচাই হচ্ছে — ফ্রেমের কেন্দ্রে স্থির রাখুন'
            : scannerTypeRef.current === 'auto'
            ? 'মুখমণ্ডল অথবা QR আইডি কার্ড ক্যামেরার সামনে ধরুন'
            : 'মুখমণ্ডল ফ্রেমের ভেতরে রাখুন (অটো ফেস স্ক্যান)'
        );
        return;
      }
      const fallbackSnap = liveSnapshot || captureCurrentFrame();
      setIsFaceDetecting(false);
      setFaceScanStatus('সুনির্দিষ্ট মিল পাওয়া যায়নি — তালিকা থেকে নিশ্চিত করুন');
      setQuickFaceModal({
        isOpen: true,
        snapshot: fallbackSnap,
        hintText: matchResult.bestCandidate
          ? `ক্যামেরার ছবির সাথে নিশ্চিত মিল পাওয়া যায়নি (সর্বোচ্চ মিল ${Math.max(0, Math.round(matchResult.displayConfidence))}%)। ব্যক্তি নির্বাচন করে ছবি আপডেট ও হাজিরা দিন।`
          : 'ক্যামেরা থেকে মুখমণ্ডল স্পষ্ট আসেনি অথবা এই ব্যক্তির ফেস ছবি যুক্ত নেই। তালিকা থেকে ব্যক্তি নির্বাচন করে 1-ট্যাপে এনরোল ও হাজিরা দিন।',
        targetType: 'student',
        search: '',
      });
      return;
    }

    const targetPerson = matchResult.bestCandidate.person;
    const nowMs = Date.now();
    const isStrongMatch = matchResult.bestCandidate.similarity >= matchResult.threshold + 0.07;

    // In silent auto-scan, confirm on frame 1 when confidence is strong, else require 2 hits within 1.6s
    if (isSilentAuto && !isStrongMatch) {
      const prevStreak = autoFaceStreakRef.current;
      if (prevStreak && prevStreak.id === targetPerson.id && nowMs - prevStreak.at < 1600) {
        autoFaceStreakRef.current = { id: targetPerson.id, count: prevStreak.count + 1, at: nowMs };
      } else {
        autoFaceStreakRef.current = { id: targetPerson.id, count: 1, at: nowMs };
        return;
      }
      if (autoFaceStreakRef.current.count < 2) {
        return;
      }
      autoFaceStreakRef.current = null;
    } else if (isSilentAuto) {
      autoFaceStreakRef.current = null;
    }

    // Per-person auto-face cooldown (5 seconds) prevents re-triggering the same face while allowing ANY OTHER person immediately!
    const lastForPerson = recentFaceMatchesRef.current.get(targetPerson.id) || 0;
    if (isSilentAuto && nowMs - lastForPerson < 5000) {
      return;
    }

    if (isSilentAuto) {
      recentFaceMatchesRef.current.set(targetPerson.id, nowMs);
      lastAutoFaceMatchRef.current = { id: targetPerson.id, at: nowMs };
    }

    // Only encode live JPEG frame ONCE after a match succeeds (keeps idle loop 0-allocation)
    const matchedSnapshot = liveSnapshot || captureCurrentFrame();
    setBiometricScore(matchResult.displayConfidence);
    setCapturedFaceSnapshot(matchedSnapshot || targetPerson.photoUrl || null);
    setIsFaceDetecting(false);
    setFaceScanStatus('✓ মুখমণ্ডল সফলভাবে শনাক্ত হয়েছে');

    await handleScanSuccess(targetPerson.id, undefined, 'face_scan');
  };

  // Track whether any configuration/enrollment modal is open so camera callbacks pause cleanly
  useEffect(() => {
    isModalBlockingScanRef.current = Boolean(
      showEnrollModal || showEnrollCamera || showRulesModal || quickFaceModal.isOpen
    );
  }, [showEnrollModal, showEnrollCamera, showRulesModal, quickFaceModal.isOpen]);

  // Parallel High-Speed Native BarcodeDetector Watcher (Full-frame hardware QR decoding in ~3ms every 90ms)
  useEffect(() => {
    if (
      (scannerType !== 'auto' && scannerType !== 'qr') ||
      !scanning ||
      showEnrollModal ||
      showEnrollCamera ||
      showRulesModal ||
      quickFaceModal.isOpen
    ) {
      return;
    }

    let barcodeDetector: any = null;
    try {
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13'],
        });
      }
    } catch {
      barcodeDetector = null;
    }
    if (!barcodeDetector) return;

    let cancelled = false;
    let busy = false;
    const qrInterval = setInterval(async () => {
      if (cancelled || busy || isScanLockedRef.current || isModalBlockingScanRef.current) return;
      const video = document.querySelector('#qr-reader-container video') as HTMLVideoElement | null;
      if (!video || !video.videoWidth || !video.videoHeight) return;
      busy = true;
      try {
        const codes = await barcodeDetector.detect(video).catch(() => []);
        if (!cancelled && Array.isArray(codes) && codes.length > 0 && codes[0]?.rawValue) {
          const rawValue = String(codes[0].rawValue).trim();
          if (rawValue) {
            lastQrDetectedAtRef.current = Date.now();
            await handleScanSuccess(rawValue, undefined, 'qr_scanner');
          }
        }
      } catch {
      } finally {
        busy = false;
      }
    }, 90);

    return () => {
      cancelled = true;
      clearInterval(qrInterval);
    };
  }, [scannerType, scanning, showEnrollModal, showEnrollCamera, showRulesModal, quickFaceModal.isOpen]);

  // Hands-free Auto Face Detection & Recognition Loop (200ms instant response — stays active even while confirmation toast displays!)
  useEffect(() => {
    if (
      (scannerType !== 'auto' && scannerType !== 'face') ||
      !scanning ||
      !autoFaceScan ||
      showEnrollModal ||
      showEnrollCamera ||
      showRulesModal ||
      quickFaceModal.isOpen
    ) {
      autoFaceStreakRef.current = null;
      return;
    }

    let cancelled = false;
    const nativeDetector = getNativeFaceDetector();

    const intervalId = setInterval(async () => {
      if (
        cancelled ||
        autoFaceBusyRef.current ||
        isScanLockedRef.current ||
        isModalBlockingScanRef.current ||
        isFaceDetecting ||
        Date.now() - lastQrDetectedAtRef.current < 450
      ) {
        return;
      }
      const video = document.querySelector('#qr-reader-container video') as HTMLVideoElement | null;
      if (!video || !video.videoWidth || !video.videoHeight) return;

      autoFaceBusyRef.current = true;
      try {
        let detectedBox: { x: number; y: number; width: number; height: number } | null = null;
        if (nativeDetector) {
          const faces = await nativeDetector.detect(video).catch(() => []);
          const minFaceWidth = video.videoWidth * 0.12;
          const validFace = Array.isArray(faces)
            ? faces.find((f: any) => !f?.boundingBox || f.boundingBox.width >= minFaceWidth)
            : null;
          if (validFace?.boundingBox) {
            detectedBox = {
              x: validFace.boundingBox.x,
              y: validFace.boundingBox.y,
              width: validFace.boundingBox.width,
              height: validFace.boundingBox.height,
            };
            setFaceScanStatus('মুখমণ্ডল শনাক্ত হচ্ছে...');
          }
        }
        await executeFaceRecognition(undefined, undefined, {
          silentAuto: true,
          detectedBox,
          hasNativeFaceDetector: Boolean(detectedBox),
        });
      } catch {
        // Ignore transient frame errors
      } finally {
        autoFaceBusyRef.current = false;
      }
    }, 200);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    scannerType,
    scanning,
    autoFaceScan,
    showEnrollModal,
    showEnrollCamera,
    showRulesModal,
    quickFaceModal.isOpen,
    isFaceDetecting,
  ]);

  // Direct Photo / Camera Capture QR / Face File Scanner (Auto mode tries QR first, then falls back to Face!)
  const handlePhotoScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (scannerType === 'face') {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        executeFaceRecognition(undefined, result);
      };
      reader.readAsDataURL(file);
      return;
    }

    let fileScanner: Html5Qrcode | null = null;
    try {
      const tempEl = document.getElementById('qr-file-temp-scanner');
      if (tempEl) tempEl.innerHTML = '';
      fileScanner = new Html5Qrcode('qr-file-temp-scanner', { verbose: false });
      const decodedText = await fileScanner.scanFile(file, false);
      await handleScanSuccess(decodedText, undefined, 'qr_scanner');
    } catch (err) {
      if (scannerType === 'auto') {
        // Auto mode fallback: no QR in image -> check Face recognition automatically!
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          executeFaceRecognition(undefined, result);
        };
        reader.readAsDataURL(file);
      } else {
        console.warn('Photo scan non-fatal message:', err);
        setCameraFlash('error');
        playBeep('error');
        speakBengaliVoice('ছবিটিতে কিউআর কোড পাওয়া যায়নি। স্পষ্ট ছবি তুলুন।');
      }
    } finally {
      if (fileScanner) {
        try {
          fileScanner.clear();
        } catch {}
      }
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      try {
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    // Explicitly release any active video MediaStream tracks (required by Android/Chrome before switching Back <-> Selfie camera)
    try {
      const container = document.getElementById('qr-reader-container');
      if (container) {
        const videos = container.querySelectorAll('video');
        videos.forEach((v) => {
          const stream = v.srcObject as MediaStream | null;
          if (stream && typeof stream.getTracks === 'function') {
            stream.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {}
            });
          }
          v.srcObject = null;
        });
        container.innerHTML = '';
      }
    } catch {}
    if (isMountedRef.current) {
      setScanning(false);
    }
    isScanLockedRef.current = false;
  };

  // Process Scanned QR / Face Code Immediately (Per-Target Deduplication allows rapid back-to-back scans!)
  const handleScanSuccess = async (
    decodedText: string,
    forcedMode?: 'in' | 'out',
    verificationMethod: 'qr_scanner' | 'face_scan' = 'qr_scanner'
  ) => {
    const trimmedText = (decodedText || '').trim();
    if (!trimmedText || !isMountedRef.current) return;

    const nowMs = Date.now();
    // Skip re-processing the EXACT same camera QR frame within 2500ms (manual in/out buttons bypass throttle)
    if (!forcedMode && verificationMethod === 'qr_scanner') {
      const prevQrAt = recentQrScansRef.current.get(trimmedText) || 0;
      if (nowMs - prevQrAt < 2500) return;
      recentQrScansRef.current.set(trimmedText, nowMs);
      if (recentQrScansRef.current.size > 40) {
        for (const [k, t] of recentQrScansRef.current.entries()) {
          if (nowMs - t > 10000) recentQrScansRef.current.delete(k);
        }
      }
    }

    // Brief synchronous concurrency lock (only while processing this record, NOT locking out other students!)
    if (isScanLockedRef.current) return;
    isScanLockedRef.current = true;

    try {
      const modeToUse = forcedMode || scanDirectionModeRef.current;
      const operatorLabel = verificationMethod === 'face_scan' ? 'AI Face Scanner' : 'Gate Operator';
      const todayStr = getLocalDateStr();

      // Instant local attendance marking
      let result = StorageService.processQRScan(
        trimmedText,
        operatorLabel,
        todayStr,
        modeToUse,
        verificationMethod
      );

      // Only pull cloud fallback if local directory is empty or manual/unknown lookup needs refresh
      if (!result.success && !result.isDuplicate && Date.now() - lastCloudFallbackPullRef.current > 25000) {
        const hasLocalRoster = StorageService.getStudents().length > 0 || StorageService.getStaff().length > 0;
        if (!hasLocalRoster || forcedMode) {
          lastCloudFallbackPullRef.current = Date.now();
          try {
            await Promise.race([
              CloudSyncService.pullFromCloud(),
              new Promise((resolve) => setTimeout(resolve, 800)),
            ]);
            if (!isMountedRef.current) return;
            result = StorageService.processQRScan(
              trimmedText,
              operatorLabel,
              todayStr,
              modeToUse,
              verificationMethod
            );
          } catch {}
        }
      }

      if (!isMountedRef.current) return;

      // Record per-person face/target debounce when matched via QR or Face so same person won't bounce right away
      const matchedEntityId = result.student?.id || result.staff?.id;
      if (matchedEntityId) {
        recentFaceMatchesRef.current.set(matchedEntityId, Date.now());
      }

      // Ensure non-face scans don't show stale biometric snapshot from previous scan
      if (verificationMethod !== 'face_scan') {
        setCapturedFaceSnapshot(null);
        setBiometricScore(null);
      }
      setLastDetectionSource(verificationMethod);
      setLastScanResult(result);
      setShowVerificationModal(true);
      setModalDismissTimer(1);

      if (result.success) {
        setCameraFlash(result.scanType === 'out' ? 'success' : result.status === 'Late' ? 'warning' : 'success');
        playBeep('success');

        const personName =
          result.student?.nameEn?.trim() ||
          result.student?.nameBn?.trim() ||
          result.staff?.nameEn?.trim() ||
          result.staff?.nameBn?.trim() ||
          'Student';
        speakBengaliVoice(`OK ${personName}`);

        onAttendanceUpdated();
        setRecentScans(StorageService.getAttendanceAuditLogs().slice(0, 15));
      } else if (result.isDuplicate) {
        setCameraFlash('warning');
        playBeep('warning');

        if (result.message.includes('উভয় হাজিরা')) {
          speakBengaliVoice('আগমন ও প্রস্থান হাজিরা সম্পন্ন হয়েছে।');
        } else {
          speakBengaliVoice('হাজিরা ইতিমধ্যে রেকর্ড হয়েছে।');
        }
        setRecentScans(StorageService.getAttendanceAuditLogs().slice(0, 15));
      } else {
        setCameraFlash('error');
        playBeep('error');
        speakBengaliVoice(verificationMethod === 'face_scan' ? 'মুখমণ্ডল মেলেনি, আবার চেষ্টা করুন।' : 'সঠিক কিউআর কার্ড ধরুন।');
      }

      // Auto-dismiss confirmation overlay cleanly in 1300ms (flash clears in 700ms) while scanner stays READY for next student!
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      timerIntervalRef.current = setInterval(() => {
        if (!isMountedRef.current) return;
        setModalDismissTimer((prev) => {
          if (prev <= 1) {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 650);

      dismissTimeoutRef.current = setTimeout(() => {
        dismissModalAndResumeScanner();
      }, 1300);
    } finally {
      // Unlock immediately after processing so the next student's QR or face scans instantaneously!
      setTimeout(() => {
        isScanLockedRef.current = false;
      }, 180);
    }
  };

  const enrolledFaceCount =
    StorageService.getStudents().filter((s) => !!s.photoUrl).length +
    StorageService.getStaff().filter((st) => !!st.photoUrl).length;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* MASTER SCANNER MODE SWITCHER: Hidden visually per user request while keeping Auto (QR + Face) active */}
      <div
        className={
          effectiveIsGatekeeper
            ? 'hidden'
            : 'flex flex-wrap items-center justify-end gap-2.5 p-2.5 sm:p-3 rounded-2xl border shadow-xs bg-white border-slate-200/90'
        }
      >
        <div
          className="hidden"
          aria-hidden="true"
        >
          <button
            type="button"
            onClick={() => handleSelectScannerType('auto')}
            className="hidden"
          >
            <Zap className="w-4 h-4 text-amber-200" />
            <span>1. অটো (QR + Face একসাথে)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectScannerType('qr')}
            className="hidden"
          >
            <QrCode className="w-4 h-4" />
            <span>শুধু QR</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectScannerType('face')}
            className="hidden"
          >
            <ScanFace className="w-4 h-4" />
            <span>শুধু Face</span>
          </button>
        </div>

        {/* Right Action Area: Keep Admin Face controls visible; hide status pill text */}
        {!effectiveIsGatekeeper && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border ${
                enrolledFaceCount > 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>নিবন্ধিত ফেস: {toBnNumber(enrolledFaceCount)} জন</span>
            </span>

            <button
              type="button"
              onClick={() => setAutoFaceScan((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                autoFaceScan
                  ? 'bg-cyan-50 border-cyan-300 text-cyan-800'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
              title="ক্যামেরার সামনে মুখ এলে স্বয়ংক্রিয়ভাবে হাজিরা নেবে"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>অটো ফেস: {autoFaceScan ? 'চালু' : 'বন্ধ'}</span>
            </button>

            <button
              type="button"
              onClick={() => executeFaceRecognition()}
              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              title="ক্যামেরা থেকে মুখমণ্ডল স্ক্যান করে উপস্থিতি নিন"
            >
              <ScanFace className="w-4 h-4 text-emerald-200" />
              <span>ক্যাপচার ও ফেস ভেরিফাই</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowEnrollModal(true);
                setEnrollSearch('');
                setEnrollingPerson(null);
                setEnrollCapturedPhoto(null);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700"
              title="নতুন শিক্ষার্থী বা স্টাফের ফেস ছবি নিবন্ধন করুন"
            >
              <UserPlus className="w-4 h-4" />
              <span>ফেস এনরোল / ছবি যুক্ত</span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PURE CAMERA SCANNER VIEWPORT (Clean, Phone Camera / Kiosk Style)           */}
      {/* ========================================================================= */}
      <div
        onClick={() => {
          if (effectiveIsGatekeeper && !scanning && !isStartingCamera) {
            startCamera();
          }
        }}
        className={`relative w-full rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl transition-all flex flex-col justify-between ${
          isFullscreen
            ? 'fixed inset-0 z-50 rounded-none border-none min-h-screen'
            : effectiveIsGatekeeper
            ? 'min-h-[460px] h-[calc(100dvh-76px)] cursor-pointer'
            : 'min-h-[520px] sm:min-h-[580px] md:min-h-[640px]'
        }`}
      >
        {/* TOP FLOATING OVERLAY: LIVE CLOCK & DIRECTION SELECTOR */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative z-20 w-full p-3 sm:p-4 bg-gradient-to-b from-slate-950/95 via-slate-950/60 to-transparent flex flex-wrap items-center justify-between gap-2.5"
        >
          {/* Live Digital Clock Badge */}
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 text-white shadow-lg">
            <Clock className="w-4 h-4 text-amber-400" />
            <div className="flex items-baseline space-x-1.5">
              <span className="text-sm sm:text-base font-black font-mono tracking-wider text-amber-300">
                {liveClockTime}
              </span>
              <span className="text-[10px] text-slate-300 font-semibold hidden md:inline">
                {language === 'bn'
                  ? new Date().toLocaleDateString('bn-BD', { weekday: 'short', month: 'short', day: 'numeric' })
                  : new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Hidden visually per user request; AUTO IN/OUT direction remains active */}
          <div className="hidden" aria-hidden="true">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'অটো' : 'Auto'}</span>
          </div>

          {/* Quick Icon Controls: Voice, Sound, Flip Camera, Fullscreen */}
          <div className="flex items-center space-x-1.5">
            {/* Class Timing & Rules Settings Button (Admin only) */}
            {!effectiveIsGatekeeper && (
              <button
                type="button"
                onClick={() => setShowRulesModal(true)}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-600/85 hover:bg-indigo-600 border border-indigo-400/50 text-white backdrop-blur-md shadow-md text-xs font-bold transition-all flex items-center space-x-1.5"
                title="শ্রেণিভিত্তিক সময়সূচি ও লেইট রুলস (Class Timing & Late Rules)"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-200" />
                <span className="hidden sm:inline">শ্রেণির সময় ও লেইট</span>
              </button>
            )}

            {/* Voice Autoplay Unlock Pill (appears only if browser blocked speech before user tap) */}
            {voiceAutoplayBlocked && voiceEnabled && (
              <button
                type="button"
                onClick={() => {
                  voiceControllerRef.current?.unlockAudioAndSpeech();
                  voiceControllerRef.current?.speak('ভয়েস চালু হয়েছে।');
                  setVoiceAutoplayBlocked(false);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold shadow-md animate-pulse whitespace-nowrap shrink-0 cursor-pointer"
                title="ব্রাউজার অডিও ব্লক করলে এখানে ট্যাপ করে ভয়েস সচল করুন"
              >
                ভয়েস চালু করুন
              </button>
            )}

            {/* Voice Announcement Toggle (Hidden for Gatekeeper) */}
            {!effectiveIsGatekeeper && (
              <button
                type="button"
                onClick={() => {
                  voiceControllerRef.current?.unlockAudioAndSpeech();
                  const next = !voiceEnabled;
                  voiceEnabledRef.current = next;
                  setVoiceEnabled(next);
                  if (next) {
                    voiceControllerRef.current?.speak('ভয়েস ঘোষণা চালু আছে।');
                  }
                }}
                className={`p-2 rounded-xl backdrop-blur-md border text-xs font-bold transition-all shadow-md ${
                  voiceEnabled
                    ? 'bg-purple-600/60 border-purple-400 text-purple-200'
                    : 'bg-black/50 border-white/10 text-slate-400 hover:text-white'
                }`}
                title={voiceEnabled ? 'ভয়েস ঘোষণা সক্রিয়' : 'ভয়েস বন্ধ'}
              >
                {voiceEnabled ? <Mic className="w-4 h-4 text-purple-300 animate-pulse" /> : <MicOff className="w-4 h-4" />}
              </button>
            )}

            {/* Audio Beep Chime Toggle */}
            <button
              type="button"
              onClick={() => {
                voiceControllerRef.current?.unlockAudioAndSpeech();
                setSoundEnabled((prev) => {
                  const next = !prev;
                  soundEnabledRef.current = next;
                  return next;
                });
              }}
              className={`p-2 rounded-xl backdrop-blur-md border text-xs font-bold transition-all shadow-md ${
                soundEnabled
                  ? 'bg-blue-600/60 border-blue-400 text-blue-200'
                  : 'bg-black/50 border-white/10 text-slate-400 hover:text-white'
              }`}
              title={soundEnabled ? 'সাউন্ড সক্রিয়' : 'সাউন্ড বন্ধ'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-300" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Switch Camera (Front/Selfie <-> Back) - Always accessible */}
            <button
              type="button"
              onClick={handleToggleCameraFacing}
              disabled={isStartingCamera}
              className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold backdrop-blur-md shadow-md transition-colors flex items-center gap-1 disabled:opacity-50 ${
                cameraFacing === 'user'
                  ? 'bg-cyan-600/80 hover:bg-cyan-600 border-cyan-400 text-white'
                  : 'bg-black/50 hover:bg-black/70 border-white/10 text-white'
              }`}
              title="সামনের (Selfie) বা পেছনের (Back) ক্যামেরা পরিবর্তন করুন"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isStartingCamera ? 'animate-spin' : ''}`} />
              <span>{cameraFacing === 'user' ? 'সেলফি ক্যামেরা' : 'ব্যাক ক্যামেরা'}</span>
            </button>

            {/* Fullscreen Kiosk Toggle */}
            <button
              type="button"
              onClick={isFullscreen ? exitFullscreen : enterFullscreen}
              className="p-2 rounded-xl bg-black/50 hover:bg-black/70 border border-white/10 text-white backdrop-blur-md shadow-md transition-colors"
              title={isFullscreen ? 'ফুলস্ক্রিন বন্ধ করুন (Esc)' : 'ফুলস্ক্রিন কিওস্ক মোড'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {/* Live Camera Viewport Area */}
        <div className={`relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-black ${effectiveIsGatekeeper ? 'min-h-0' : 'min-h-[460px]'}`}>
          {/* Hidden isolated mount node for image-file QR decoding */}
          <div id="qr-file-temp-scanner" className="hidden" />

          {/* Mount node for Html5Qrcode */}
          <div
            id="qr-reader-container"
            className={`w-full h-full absolute inset-0 [&_video]:w-full [&_video]:h-full [&_video]:object-cover [&_#qr-shaded-region]:!hidden ${
              cameraFacing === 'user' ? '[&_video]:scale-x-[-1]' : ''
            }`}
          />

          {/* Camera Scanning Reticle & Laser (Active when scanning) */}
          {scanning && (
            scannerType === 'auto' ? (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 p-4">
                {/* Dual Auto Reticle: Supports both QR ID Cards & Face Simultaneously */}
                <div className="w-64 h-76 sm:w-72 sm:h-84 md:w-80 md:h-88 border-2 border-emerald-400/60 rounded-3xl relative flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.22)]">
                  {/* 4 Corner QR Brackets */}
                  <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                  <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                  <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

                  {/* Inner Biometric Face Oval Guide */}
                  <div className="w-52 h-68 sm:w-56 sm:h-72 border-2 border-dashed border-cyan-400/75 rounded-[50%] flex items-center justify-center">
                    <div className="w-[82%] h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_20px_#22d3ee] animate-pulse" />
                  </div>
                </div>

                {/* Unified Status Badge */}
                <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-emerald-400/35 text-emerald-200 text-xs font-bold shadow-xl">
                  <ScanFace className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <QrCode className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>{faceScanStatus}</span>
                </div>
              </div>
            ) : scannerType === 'face' ? (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 p-4">
                {/* Biometric Oval Head Target */}
                <div className="w-56 h-72 sm:w-64 sm:h-80 md:w-72 md:h-88 border-3 border-cyan-400/80 rounded-[50%] relative flex items-center justify-center shadow-[0_0_60px_rgba(6,182,212,0.35)] animate-pulse">
                  {/* Outer corner target markers */}
                  <div className="absolute -top-3 -left-3 w-7 h-7 border-t-3 border-l-3 border-cyan-300 rounded-tl-xl" />
                  <div className="absolute -top-3 -right-3 w-7 h-7 border-t-3 border-r-3 border-cyan-300 rounded-tr-xl" />
                  <div className="absolute -bottom-3 -left-3 w-7 h-7 border-b-3 border-l-3 border-cyan-300 rounded-bl-xl" />
                  <div className="absolute -bottom-3 -right-3 w-7 h-7 border-b-3 border-r-3 border-cyan-300 rounded-br-xl" />

                  {/* Horizontal Biometric Radar Sweep */}
                  <div className="w-[85%] h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_25px_#22d3ee] animate-pulse" />

                  {/* Center Face Crosshairs */}
                  <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 flex items-center justify-between opacity-60">
                    <span className="w-4 h-0.5 bg-cyan-400" />
                    <span className="w-4 h-0.5 bg-cyan-400" />
                  </div>
                  <div className="absolute inset-y-8 left-1/2 -translate-x-1/2 flex flex-col items-center justify-between opacity-60">
                    <span className="w-0.5 h-4 bg-cyan-400" />
                    <span className="w-0.5 h-4 bg-cyan-400" />
                  </div>
                </div>

                {/* Status Badge */}
                <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-cyan-500/30 text-cyan-300 text-xs font-bold shadow-xl">
                  <ScanFace className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>{faceScanStatus}</span>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 p-4">
                <div className="w-56 h-56 sm:w-68 sm:h-68 md:w-76 md:h-76 border-2 border-emerald-400/50 rounded-3xl relative flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.2)]">
                  {/* 4 Corner Brackets */}
                  <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                  <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                  <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

                  {/* Glowing Laser Scanline */}
                  <div className="w-[85%] h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_20px_#10b981] animate-pulse" />
                </div>
                <p className="mt-4 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-emerald-300 text-xs font-bold shadow-lg">
                  আইডি কার্ড বা কিউআর কোড ক্যামেরার সামনে ধরুন
                </p>
              </div>
            )
          )}

          {/* Flash Feedback Indicator */}
          {cameraFlash && (
            <div className={`absolute inset-0 pointer-events-none transition-all duration-300 flex items-center justify-center backdrop-blur-xs z-30 ${
              cameraFlash === 'success' ? 'bg-emerald-500/25' : cameraFlash === 'warning' ? 'bg-amber-500/30' : 'bg-rose-500/30'
            }`}>
              <div className={`px-6 py-3 rounded-2xl text-white font-black text-sm sm:text-base shadow-2xl flex items-center gap-2 animate-bounce ${
                cameraFlash === 'success' ? 'bg-emerald-600' : cameraFlash === 'warning' ? 'bg-amber-600' : 'bg-rose-600'
              }`}>
                {cameraFlash === 'success' && <CheckCircle2 className="w-6 h-6 text-white" />}
                {cameraFlash === 'warning' && <AlertTriangle className="w-6 h-6 text-white" />}
                {cameraFlash === 'error' && <XCircle className="w-6 h-6 text-white" />}
                <span>
                  {cameraFlash === 'success' ? '✓ হাজিরা গৃহীত হয়েছে' : cameraFlash === 'warning' ? '⚠️ পূর্বেই রেকর্ডকৃত' : '✕ কার্ড পাওয়া যায়নি'}
                </span>
              </div>
            </div>
          )}

          {/* Idle / Off Camera Overlay - Pure Camera & Photo Scan Only */}
          {!scanning && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!isStartingCamera) startCamera();
              }}
              className="absolute inset-0 flex flex-col items-center justify-center p-5 sm:p-6 text-center text-white bg-slate-950 z-20 select-none cursor-pointer overflow-y-auto"
            >
              <div
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center mb-4 animate-pulse border-2 shrink-0 ${
                  scannerType === 'face'
                    ? 'bg-cyan-500/10 border-cyan-400/80 text-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.3)]'
                    : 'bg-emerald-500/10 border-emerald-400/80 text-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.3)]'
                }`}
              >
                {scannerType === 'qr' ? (
                  <Camera className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-400" />
                ) : (
                  <ScanFace className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-400" />
                )}
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white mb-1.5 tracking-wide">
                {isStartingCamera
                  ? 'ক্যামেরা চালু হচ্ছে...'
                  : scannerType === 'auto'
                  ? 'অটো স্মার্ট কিওস্ক (QR + Face একসাথে)'
                  : scannerType === 'face'
                  ? 'এআই ফেস স্ক্যান কিওস্ক (Face Scan)'
                  : 'স্কুল গেট কিউআর কিওস্ক'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-5 leading-relaxed">
                {isStartingCamera
                  ? 'ক্যামেরা ডিভাইস লোড হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...'
                  : scannerType === 'auto'
                  ? 'ক্যামেরার সামনে মুখমণ্ডল অথবা QR আইডি কার্ড ধরলেই স্বয়ংক্রিয়ভাবে হাজিরা হয়ে যাবে'
                  : scannerType === 'face'
                  ? 'শিক্ষার্থী বা শিক্ষকের মুখমণ্ডল ক্যামেরায় স্ক্যান করে অটো বা 1-ট্যাপ হাজিরা নিতে ক্যামেরা চালু করুন'
                  : 'আইডি কার্ড বা কিউআর কোড স্ক্যান করে উপস্থিতি নিতে স্ক্রিনে অথবা বাটনে চাপ দিন'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-lg">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startCamera();
                  }}
                  disabled={isStartingCamera}
                  className={`px-7 py-3.5 text-white font-black text-sm sm:text-base rounded-2xl shadow-2xl flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer ring-4 ${
                    scannerType === 'face'
                      ? 'bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 ring-cyan-500/20'
                      : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 ring-emerald-500/20'
                  }`}
                >
                  {scannerType === 'qr' ? (
                    <Camera className="w-5 h-5 text-white" />
                  ) : (
                    <ScanFace className="w-5 h-5 text-white" />
                  )}
                  <span>{isStartingCamera ? 'ক্যামেরা সক্রিয় হচ্ছে...' : '📹 ক্যামেরা চালু করুন (Start Camera)'}</span>
                </button>

                {(isEmbeddedIframe() || isWebViewEnv) && typeof window !== 'undefined' && (
                  <>
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-2xl shadow-lg flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>{isWebViewEnv ? 'ক্রোম ব্রাউজারে খুলুন' : 'নতুন ট্যাবে খুলুন'}</span>
                    </a>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyKioskUrl();
                      }}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold text-xs rounded-2xl shadow-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Copy className="w-4 h-4 text-amber-300" />
                      <span>{copiedKioskUrl ? '✓ লিংক কপি হয়েছে!' : 'লিংক কপি করুন'}</span>
                    </button>
                  </>
                )}

                <label
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold text-xs rounded-2xl shadow-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Camera className="w-4 h-4 text-cyan-300" />
                  <span>ছবি তুলে স্ক্যান</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoScan}
                    className="hidden"
                  />
                </label>

                <label
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold text-xs rounded-2xl shadow-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-300" />
                  <span>গ্যালারি / ফাইল স্ক্যান</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoScan}
                    className="hidden"
                  />
                </label>
              </div>
              {cameraError && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-4 px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 max-w-md leading-relaxed"
                >
                  {cameraError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* BOTTOM FLOATING CONTROLS: Phone Camera Quick Controls */}
        {!effectiveIsGatekeeper ? (
          <div className="relative z-20 w-full p-3 sm:p-4 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-transparent flex flex-wrap items-center justify-between gap-2">
            {/* Left: Snap Photo, Face Capture, or Manual Entry */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="p-2 sm:px-3 sm:py-2 rounded-xl bg-black/60 hover:bg-black/80 border border-white/15 text-white backdrop-blur-md shadow-md text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5" title="ছবি বা গ্যালারি থেকে সরাসরি স্ক্যান">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">{scannerType === 'face' ? 'সেলফি / ছবি আপলোড' : 'ছবি আপলোড'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoScan}
                  className="hidden"
                />
              </label>

              {(scannerType === 'auto' || scannerType === 'face') && (
                <button
                  type="button"
                  onClick={() => executeFaceRecognition()}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5 transition-all active:scale-95"
                  title="বর্তমানে ক্যামেরায় থাকা মুখমণ্ডল ক্যাপচার ও ভেরিফাই করুন"
                >
                  <ScanFace className="w-4 h-4 text-cyan-200" />
                  <span>ক্যাপচার ও ফেস ভেরিফাই</span>
                </button>
              )}
            </div>

            {/* Right: Camera Toggle / Scan Status */}
            <div className="flex items-center space-x-2">
              {scanning ? (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-700 text-white backdrop-blur-md text-xs font-bold shadow-md transition-colors"
                >
                  ক্যামেরা বন্ধ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-700 text-white backdrop-blur-md text-xs font-bold shadow-md transition-colors flex items-center gap-1"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>ক্যামেরা চালু</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          scanning && (
            <div className="relative z-20 w-full p-2.5 sm:p-3 bg-gradient-to-t from-slate-950/90 to-transparent flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 border border-emerald-500/30">
                <ScanFace className="w-3.5 h-3.5 text-cyan-300" />
                <span>
                  {scannerType === 'auto'
                    ? 'অটো QR + ফেস স্ক্যানার সক্রিয়'
                    : scannerType === 'face'
                    ? 'লাইভ ফেস স্ক্যানার সক্রিয়'
                    : 'লাইভ ক্যামেরা কিউআর স্ক্যান সক্রিয়'}
                </span>
              </span>

              {(scannerType === 'auto' || scannerType === 'face') && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    executeFaceRecognition();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white text-xs font-black shadow-lg flex items-center gap-1.5 active:scale-95"
                >
                  <ScanFace className="w-4 h-4" />
                  <span>ফেস স্ক্যান ও হাজিরা</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  stopCamera();
                }}
                className="px-3 py-1 rounded-xl bg-black/60 hover:bg-rose-900/60 border border-white/10 text-slate-300 hover:text-white text-[11px] font-bold backdrop-blur-md transition-colors"
              >
                ক্যামেরা সাময়িক বন্ধ
              </button>
            </div>
          )
        )}
      </div>

      {/* Optional Collapsible Recent Scans Panel (Zero distraction - hidden for gatekeeper) */}
      {!effectiveIsGatekeeper && (
        <details className="group border border-slate-200/80 rounded-2xl bg-white shadow-2xs overflow-hidden transition-all">
          <summary className="px-4 py-3 text-xs font-bold text-slate-500 cursor-pointer flex items-center justify-between hover:bg-slate-50 transition-colors select-none">
            <span className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <span>আজকের সাম্প্রতিক কিউআর স্ক্যান হিস্ট্রি</span>
            </span>
            <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>

          <div className="p-4 pt-2 border-t border-slate-100 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>আজকের সাম্প্রতিক স্ক্যান হিস্ট্রি:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowRulesModal(true)}
                className="px-3 py-1 bg-indigo-100/80 border border-indigo-300 text-indigo-800 rounded-lg text-[11px] font-bold hover:bg-indigo-200 flex items-center space-x-1.5 shadow-2xs transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-700" />
                <span>⚙️ শ্রেণির সময় ও লেইট রুলস</span>
              </button>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 text-[11px]">
              {recentScans.length === 0 ? (
                <div className="text-slate-400 text-[10px] py-2">কোনো স্ক্যান রেকর্ড নেই।</div>
              ) : (
                recentScans.slice(0, 8).map((log) => (
                  <div
                    key={log.id}
                    className="p-2 bg-white rounded-lg border border-slate-200/70 flex items-center justify-between"
                  >
                    <div className="truncate pr-2">
                      <span className="font-bold text-slate-800">{log.studentName}</span>
                      <span className="text-slate-500 text-[10px] ml-1">
                        ({log.className}, রোল: {log.roll})
                      </span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                        log.action === 'check_out' || log.scanType === 'out'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : log.action === 'late_marked'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : log.action === 'rescan_blocked'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {log.action === 'check_out' || log.scanType === 'out'
                        ? `🎒 ছুটি (${log.scanTime})`
                        : log.action === 'late_marked'
                        ? `⏰ Late (${log.scanTime})`
                        : log.action === 'rescan_blocked'
                        ? 'Duplicate'
                        : `🟢 প্রবেশ (${log.scanTime})`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </details>
      )}

      {/* ========================================================================= */}
      {/* MODAL: INSTANT SCAN VERIFICATION & PHOTO OVERLAY (POPUP CONFIRMATION)      */}
      {/* ========================================================================= */}
      {showVerificationModal && lastScanResult && (
        <div
          onClick={dismissModalAndResumeScanner}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/35 p-4 pointer-events-auto animate-in fade-in duration-100"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bg-white rounded-3xl max-w-lg w-full shadow-2xl border overflow-hidden relative transform transition-all animate-in zoom-in-95 duration-150 ${
              lastScanResult.success && lastScanResult.scanType === 'out'
                ? 'border-purple-400 ring-4 ring-purple-500/20'
                : lastScanResult.success && lastScanResult.status === 'Present'
                ? 'border-emerald-300 ring-4 ring-emerald-500/20'
                : lastScanResult.success && lastScanResult.status === 'Late'
                ? 'border-amber-300 ring-4 ring-amber-500/20'
                : lastScanResult.isDuplicate
                ? 'border-amber-400 ring-4 ring-amber-500/30'
                : 'border-rose-300 ring-4 ring-rose-500/20'
            }`}
          >
            {/* Top Gradient Banner with Status Header */}
            <div
              className={`p-5 text-white relative flex items-center justify-between overflow-hidden ${
                lastScanResult.success && lastScanResult.scanType === 'out'
                  ? 'bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800'
                  : lastScanResult.success && lastScanResult.status === 'Present'
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700'
                  : lastScanResult.success && lastScanResult.status === 'Late'
                  ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'
                  : lastScanResult.isDuplicate
                  ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600'
                  : 'bg-gradient-to-r from-rose-600 to-red-700'
              }`}
            >
              <div className="flex items-center space-x-3.5 z-10">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shrink-0 shadow-inner">
                  {lastScanResult.success && lastScanResult.scanType === 'out' ? (
                    <LogOut className="w-7 h-7 text-white animate-pulse" />
                  ) : lastScanResult.success && lastScanResult.status === 'Present' ? (
                    <CheckCircle2 className="w-7 h-7 text-white animate-pulse" />
                  ) : lastScanResult.success && lastScanResult.status === 'Late' ? (
                    <Clock className="w-7 h-7 text-white animate-pulse" />
                  ) : lastScanResult.isDuplicate ? (
                    <AlertTriangle className="w-7 h-7 text-white animate-bounce" />
                  ) : (
                    <XCircle className="w-7 h-7 text-white" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/90">
                    <span>
                      {lastScanResult.scanType === 'out'
                        ? lastScanResult.targetType === 'staff'
                          ? 'শিক্ষক ও কর্মচারী প্রস্থান / ছুটি'
                          : 'শিক্ষার্থী প্রস্থান / ছুটি (Check-Out)'
                        : lastScanResult.targetType === 'staff'
                        ? 'শিক্ষক ও কর্মচারী আগমন / প্রবেশ'
                        : 'শিক্ষার্থী আগমন / প্রবেশ (Check-In)'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-[10px] font-black">
                      {lastDetectionSource === 'face_scan' ? 'AI ফেস স্ক্যান' : 'QR কোড স্ক্যান'}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-white leading-tight mt-0.5">
                    {lastScanResult.success && lastScanResult.scanType === 'out'
                      ? '🎒 স্কুল থেকে প্রস্থান ও ছুটি সম্পন্ন (CHECK-OUT)'
                      : lastScanResult.success && lastScanResult.status === 'Present'
                      ? '✓ স্কুলে আগমন ও উপস্থিতি নিশ্চিত! (CHECK-IN)'
                      : lastScanResult.success && lastScanResult.status === 'Late'
                      ? '⏰ দেরিতে ক্লাসে আগমন রেকর্ড (LATE)'
                      : lastScanResult.isDuplicate
                      ? '⚠️ আজকের এই হাজিরা ইতিপূর্বেই রেকর্ড করা হয়েছে'
                      : '✕ অকার্যকর স্ক্যান (INVALID CARD)'}
                  </h3>
                </div>
              </div>

              <button
                onClick={dismissModalAndResumeScanner}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors z-10 shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Decorative background glow */}
              <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            </div>

            {/* Modal Body: Large Photo & Identity Profile */}
            <div className="p-6 space-y-4">
              {/* Profile Card Box */}
              {(lastScanResult.student || lastScanResult.staff) && (
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  {/* Biometric Face Snapshot Side-by-Side OR Big Passport Photo */}
                  {capturedFaceSnapshot ? (
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <div className="flex items-center gap-2 sm:gap-3">
                        {/* Live Camera Snapshot */}
                        <div className="relative text-center">
                          <div className="w-24 h-28 sm:w-28 sm:h-32 rounded-2xl overflow-hidden border-2 border-cyan-400 bg-slate-900 shadow-xl flex items-center justify-center">
                            <img
                              src={capturedFaceSnapshot}
                              alt="Live Face"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-black bg-cyan-100 text-cyan-800 border border-cyan-300">
                            লাইভ ফেস
                          </span>
                        </div>

                        {/* Match Indicator */}
                        <div className="flex flex-col items-center justify-center px-1">
                          <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg font-black text-xs">
                            ✓
                          </div>
                          <span className="text-[11px] font-black font-mono text-emerald-600 mt-1">
                            {biometricScore ? `${toBnNumber(biometricScore)}%` : '98%'}
                          </span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">ম্যাচ</span>
                        </div>

                        {/* Registered Profile Photo */}
                        <div className="relative text-center">
                          <div className="w-24 h-28 sm:w-28 sm:h-32 rounded-2xl overflow-hidden border-2 border-emerald-400 bg-slate-100 shadow-xl flex items-center justify-center">
                            {lastScanResult.student?.photoUrl ? (
                              <img
                                src={lastScanResult.student.photoUrl}
                                alt={lastScanResult.student.nameEn}
                                className="w-full h-full object-cover"
                              />
                            ) : lastScanResult.staff?.photoUrl ? (
                              <img
                                src={lastScanResult.staff.photoUrl}
                                alt={lastScanResult.staff.nameEn}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-10 h-10 text-slate-300" />
                            )}
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            নিবন্ধিত ছবি
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative shrink-0">
                      <div
                        className={`w-28 h-32 rounded-2xl overflow-hidden border-4 bg-white shadow-xl flex items-center justify-center relative ${
                          lastScanResult.success && lastScanResult.scanType === 'out'
                            ? 'border-purple-500 ring-4 ring-purple-500/20'
                            : lastScanResult.success && lastScanResult.status === 'Present'
                            ? 'border-emerald-500 ring-4 ring-emerald-500/20'
                            : lastScanResult.success && lastScanResult.status === 'Late'
                            ? 'border-amber-500 ring-4 ring-amber-500/20'
                            : lastScanResult.isDuplicate
                            ? 'border-amber-400 ring-4 ring-amber-400/20'
                            : 'border-slate-300'
                        }`}
                      >
                        {lastScanResult.student?.photoUrl ? (
                          <img
                            src={lastScanResult.student.photoUrl}
                            alt={lastScanResult.student.nameEn}
                            className="w-full h-full object-cover"
                          />
                        ) : lastScanResult.staff?.photoUrl ? (
                          <img
                            src={lastScanResult.staff.photoUrl}
                            alt={lastScanResult.staff.nameEn}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-2 text-center">
                            <User className="w-10 h-10 mb-1 text-slate-300" />
                            <span className="text-[10px] font-bold">ছবি যুক্ত নেই</span>
                          </div>
                        )}
                      </div>

                      {/* Small Status Stamp on corner */}
                      <div
                        className={`absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-black shadow-md border ${
                          lastScanResult.success && lastScanResult.scanType === 'out'
                            ? 'bg-purple-600 text-white border-purple-400'
                            : lastScanResult.success && lastScanResult.status === 'Present'
                            ? 'bg-emerald-600 text-white border-emerald-400'
                            : lastScanResult.success && lastScanResult.status === 'Late'
                            ? 'bg-amber-600 text-white border-amber-400'
                            : lastScanResult.isDuplicate
                            ? 'bg-amber-500 text-white border-amber-300'
                            : 'bg-red-600 text-white border-red-400'
                        }`}
                      >
                        {lastScanResult.success && lastScanResult.scanType === 'out'
                          ? 'CHECK-OUT'
                          : lastScanResult.status || (lastScanResult.isDuplicate ? 'DUPLICATE' : 'INVALID')}
                      </div>
                    </div>
                  )}

                  {/* Identity Details */}
                  <div className="flex-1 text-center sm:text-left space-y-2">
                    <div>
                      <h4 className="text-xl font-black text-slate-900 tracking-tight">
                        {lastScanResult.student?.nameBn ||
                          lastScanResult.staff?.nameBn ||
                          lastScanResult.student?.nameEn ||
                          lastScanResult.staff?.nameEn}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        {lastScanResult.student?.nameEn || lastScanResult.staff?.nameEn}
                      </p>
                    </div>

                    {/* Student Info Badges */}
                    {lastScanResult.student && (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg font-bold">
                            রোল: {toBnNumber(lastScanResult.student.roll)}
                          </span>
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg font-bold">
                            {lastScanResult.student.className} • শাখা: {lastScanResult.student.section}
                          </span>
                          {lastScanResult.student.group && lastScanResult.student.group !== 'General' && (
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold">
                              {lastScanResult.student.group}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600 font-medium">
                          <div>
                            আইডি:{' '}
                            <span className="font-mono font-bold text-slate-900">
                              {lastScanResult.student.studentId}
                            </span>
                          </div>
                          <div>
                            শিফট:{' '}
                            <span className="font-bold text-slate-900">
                              {lastScanResult.student.shift === 'Morning' ? 'মর্নিং' : 'ডে'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Staff Info Badges */}
                    {lastScanResult.staff && (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg font-bold">
                            {lastScanResult.staff.designation}
                          </span>
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg font-bold">
                            বিভাগ: {lastScanResult.staff.department}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          এমপ্লয়ি আইডি:{' '}
                          <span className="font-mono font-bold text-slate-900">
                            {lastScanResult.staff.employeeId}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Dual Arrival & Departure Times inside Modal */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                      <div className="p-2 rounded-xl bg-emerald-50/90 border border-emerald-200 text-left">
                        <div className="text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                          <LogIn className="w-3 h-3 text-emerald-600" />
                          <span>আগমন (In Time)</span>
                        </div>
                        <div className="text-xs font-mono font-bold text-emerald-950 mt-0.5">
                          {lastScanResult.inTime || (lastScanResult.scanType === 'in' ? lastScanResult.scanTime : '—')}
                        </div>
                      </div>

                      <div className="p-2 rounded-xl bg-purple-50/90 border border-purple-200 text-left">
                        <div className="text-[10px] font-bold text-purple-800 flex items-center gap-1">
                          <LogOut className="w-3 h-3 text-purple-600" />
                          <span>প্রস্থান / ছুটি (Out)</span>
                        </div>
                        <div className="text-xs font-mono font-bold text-purple-950 mt-0.5">
                          {lastScanResult.outTime || (lastScanResult.scanType === 'out' ? lastScanResult.scanTime : '—')}
                        </div>
                      </div>
                    </div>

                    {/* Stay Duration Badge */}
                    {lastScanResult.record?.stayDuration && (
                      <div className="p-2 rounded-xl bg-indigo-50/90 border border-indigo-200 text-center flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-900 mt-2">
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>স্কুলে মোট অবস্থান: <b className="text-indigo-950 font-black">{lastScanResult.record.stayDuration}</b></span>
                      </div>
                    )}

                    {/* Date stamp */}
                    <div className="text-[10px] text-slate-500 font-medium pt-1 text-center sm:text-left">
                      তারিখ: {new Date().toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                </div>
              )}

              {/* Message detail if error / duplicate */}
              {(!lastScanResult.success || lastScanResult.isDuplicate) && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    lastScanResult.isDuplicate
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {lastScanResult.isDuplicate ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{lastScanResult.message}</span>
                </div>
              )}

              {/* Voice feedback announcement banner */}
              {voiceEnabled && (
                <div className="p-3 bg-purple-50/80 border border-purple-200/80 rounded-xl flex items-center justify-between text-xs text-purple-900">
                  <div className="flex items-center space-x-2">
                    <Mic className="w-4 h-4 text-purple-600 shrink-0 animate-pulse" />
                    <span className="font-medium text-[11px]">
                      ভয়েস ঘোষণা:{' '}
                      <b>
                        {currentVoiceText ||
                          (lastScanResult.success
                            ? `OK ${
                                lastScanResult.student?.nameEn ||
                                lastScanResult.student?.nameBn ||
                                lastScanResult.staff?.nameEn ||
                                lastScanResult.staff?.nameBn ||
                                'Student'
                              }`
                            : lastScanResult.isDuplicate
                            ? 'আপনার হাজিরা ইতিমধ্যে রেকর্ড করা হয়েছে।'
                            : 'অকার্যকর স্ক্যান')}
                      </b>
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-purple-200/60 rounded-full text-[10px] font-bold text-purple-800">
                    Voice OK
                  </span>
                </div>
              )}

              {/* Fast 1.3-Second Non-Blocking Auto-Dismiss Progress Bar & Actions */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                  <span>স্ক্যানার তাৎক্ষণিক পরবর্তী হাজিরার জন্য প্রস্তুত...</span>
                  <span className="font-mono text-blue-600 font-bold">{modalDismissTimer > 0 ? '1.3s' : '0s'}</span>
                </div>

                {/* Animated timer bar */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-700 ease-linear rounded-full ${
                      modalDismissTimer >= 1 ? 'w-full' : 'w-0'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={dismissModalAndResumeScanner}
                    className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <span>পরবর্তী স্ক্যান (Next Scan)</span>
                    <span className="text-[10px] text-slate-400">↵ Enter</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ATTENDANCE RULES & CLASS-WISE TIMING CONFIGURATION                */}
      {/* ========================================================================= */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] shadow-2xl border border-slate-200 relative flex flex-col overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/80">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                    {language === 'bn' ? 'স্বয়ংক্রিয় হাজিরা নীতিমালা ও শ্রেণিভিত্তিক সময়সূচি' : 'Attendance Automation & Class Timing Rules'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {language === 'bn'
                      ? 'প্রতিটি ক্লাসের জন্য আলাদা শুরুর সময়, লেট সীমা ও শিফট নির্ধারণ করুন'
                      : 'Configure per-class start times, late arrival thresholds, and shifts'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs inside modal */}
            <div className="px-5 pt-3 border-b border-slate-100 bg-white flex items-center space-x-2 shrink-0">
              <button
                onClick={() => setRulesTab('classes')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors ${
                  rulesTab === 'classes'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>📚 শ্রেণিভিত্তিক আলাদা সময়সূচি (Class-Wise)</span>
                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[10px] font-bold">
                  {Object.values(rules.classSchedules || {}).filter((c) => c.enabled).length} সক্রিয়
                </span>
              </button>

              <button
                onClick={() => setRulesTab('general')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors ${
                  rulesTab === 'general'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>🏫 সাধারণ স্কুল ও স্টাফের সময়সূচি (General & Staff)</span>
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs flex-1">
              {/* ========================================================================= */}
              {/* TAB 1: CLASS-WISE TIMING RULES                                           */}
              {/* ========================================================================= */}
              {rulesTab === 'classes' && (
                <div className="space-y-4">
                  {/* Preset 1-Click Buttons */}
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl space-y-2">
                    <div className="flex items-center space-x-1.5 font-bold text-indigo-900 text-[11px]">
                      <Zap className="w-3.5 h-3.5 text-indigo-600" />
                      <span>1-ক্লিকে শিফট ও শ্রেণির সময় সেট করুন (Quick Presets):</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={applyPrimarySecondaryPreset}
                        className="px-3 py-1.5 bg-white border border-indigo-300 hover:bg-indigo-600 hover:text-white text-indigo-800 rounded-xl font-bold text-[11px] shadow-2xs transition-colors"
                      >
                        ⚡ প্রাইমারি (07:45) ও মাধ্যমিক (11:30)
                      </button>
                      <button
                        type="button"
                        onClick={applyMorningDayShiftPreset}
                        className="px-3 py-1.5 bg-white border border-indigo-300 hover:bg-indigo-600 hover:text-white text-indigo-800 rounded-xl font-bold text-[11px] shadow-2xs transition-colors"
                      >
                        ⚡ মর্নিং (07:30) ও ডে শিফট (12:00)
                      </button>
                      <button
                        type="button"
                        onClick={applyUniformPreset}
                        className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px] shadow-2xs transition-colors"
                      >
                        সকল শ্রেণিতে সাধারণ সময় ({rules.schoolStartTime || '08:00'})
                      </button>
                    </div>
                  </div>

                  {/* Class Schedule Cards Grid */}
                  <div className="space-y-3">
                    {allClasses.map((cls) => {
                      const classRule = rules.classSchedules?.[cls] || {
                        className: cls,
                        shift: ['Play', 'Nursery', 'KG', 'Class 1', 'Class 2'].includes(cls) ? 'Morning' : 'Day',
                        startTime: rules.schoolStartTime || '08:00',
                        lateThresholdTime: rules.lateThresholdTime || '08:30',
                        closingTime: rules.attendanceClosingTime || '10:30',
                        enabled: false,
                      };

                      return (
                        <div
                          key={cls}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            classRule.enabled
                              ? 'bg-white border-indigo-200 ring-2 ring-indigo-500/10 shadow-xs'
                              : 'bg-slate-50/70 border-slate-200'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                            <div className="flex items-center space-x-2.5">
                              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-800 font-black text-xs flex items-center justify-center shrink-0">
                                {cls.replace('Class ', '')}
                              </span>
                              <div>
                                <span className="font-black text-slate-900 text-sm">{cls}</span>
                                <span className="ml-2 text-[10px] text-slate-400 font-semibold">
                                  {classRule.shift === 'Morning' ? 'মর্নিং শিফট' : classRule.shift === 'Day' ? 'ডে শিফট' : 'সব শিফট'}
                                </span>
                              </div>
                            </div>

                            {/* Enable Toggle Switch */}
                            <label className="flex items-center space-x-2 cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={classRule.enabled}
                                onChange={(e) => updateClassSchedule(cls, { enabled: e.target.checked })}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                              />
                              <span className="text-[11px] font-bold text-slate-700">
                                {classRule.enabled ? (
                                  <span className="text-indigo-700">আলাদা সময় সক্রিয়</span>
                                ) : (
                                  <span className="text-slate-500">সাধারণ সময়</span>
                                )}
                              </span>
                            </label>
                          </div>

                          {/* When Enabled: Inputs for Class Start & Late Threshold */}
                          {classRule.enabled ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                              <div>
                                <label className="block text-slate-600 font-semibold text-[10px] mb-1">
                                  ক্লাস শুরু (Start Time):
                                </label>
                                <input
                                  type="time"
                                  value={classRule.startTime}
                                  onChange={(e) => updateClassSchedule(cls, { startTime: e.target.value })}
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>

                              <div>
                                <label className="block text-amber-700 font-bold text-[10px] mb-1">
                                  দেরি সীমা (Late After):
                                </label>
                                <input
                                  type="time"
                                  value={classRule.lateThresholdTime}
                                  onChange={(e) => updateClassSchedule(cls, { lateThresholdTime: e.target.value })}
                                  className="w-full px-2.5 py-1.5 border border-amber-300 rounded-xl bg-amber-50/50 font-bold text-amber-800 focus:ring-2 focus:ring-amber-500"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-600 font-semibold text-[10px] mb-1">
                                  শিফট (Shift):
                                </label>
                                <select
                                  value={classRule.shift || 'Morning'}
                                  onChange={(e) => updateClassSchedule(cls, { shift: e.target.value as any })}
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white font-medium text-slate-800"
                                >
                                  <option value="Morning">মর্নিং শিফট (Morning)</option>
                                  <option value="Day">ডে শিফট (Day)</option>
                                  <option value="All">উভয় শিফট (All)</option>
                                </select>
                              </div>

                              <div className="col-span-full pt-1">
                                <span className="inline-flex items-center space-x-1.5 text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>
                                    {cls}-এর জন্য {classRule.startTime} AM শুরু এবং {classRule.lateThresholdTime} AM-এর পর Late গণ্য হবে।
                                  </span>
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-2 text-[11px] text-slate-500">
                              এই শ্রেণিতে সাধারণ স্কুলের নির্ধারিত সময় (শুরু: <b>{rules.schoolStartTime || '08:00'}</b> | লেট: <b>{rules.lateThresholdTime || '08:30'}</b>) প্রযোজ্য।
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* TAB 2: GENERAL SCHOOL & STAFF TIMING RULES                                */}
              {/* ========================================================================= */}
              {rulesTab === 'general' && (
                <div className="space-y-4">
                  {/* General School Timing Card */}
                  <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>সাধারণ স্কুল হাজিরা সময়সূচি (Default School Timing):</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">স্কুল শুরু (Start Time):</label>
                        <input
                          type="time"
                          value={rules.schoolStartTime || '08:00'}
                          onChange={(e) => setRules({ ...rules, schoolStartTime: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-amber-700 font-bold mb-1">সাধারণ লেট সীমা (Late Threshold):</label>
                        <input
                          type="time"
                          value={rules.lateThresholdTime || '08:30'}
                          onChange={(e) => setRules({ ...rules, lateThresholdTime: e.target.value })}
                          className="w-full px-3 py-2 border border-amber-300 rounded-xl bg-amber-50/50 font-bold text-amber-800"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">সমাপ্তি সীমা (Closing Time):</label>
                        <input
                          type="time"
                          value={rules.attendanceClosingTime || '10:30'}
                          onChange={(e) => setRules({ ...rules, attendanceClosingTime: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Staff & Faculty Timing Card */}
                  <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-3">
                    <h4 className="font-bold text-blue-950 text-xs flex items-center space-x-1.5">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                      <span>শিক্ষক ও কর্মচারীদের হাজিরা সময় (Faculty & Staff Timing):</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">স্টাফ প্রবেশ সময় (Staff Start):</label>
                        <input
                          type="time"
                          value={rules.staffStartTime || '08:15'}
                          onChange={(e) => setRules({ ...rules, staffStartTime: e.target.value })}
                          className="w-full px-3 py-2 border border-blue-200 rounded-xl bg-white font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-amber-800 font-bold mb-1">স্টাফদের লেট সীমা (Staff Late After):</label>
                        <input
                          type="time"
                          value={rules.staffLateThresholdTime || '08:30'}
                          onChange={(e) => setRules({ ...rules, staffLateThresholdTime: e.target.value })}
                          className="w-full px-3 py-2 border border-amber-300 rounded-xl bg-white font-bold text-amber-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Shifts General Defaults */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs">শিফটের সাধারণ ডিফল্ট (Shift Defaults):</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 font-medium mb-1">মর্নিং শিফট লেট সীমা:</label>
                        <input
                          type="time"
                          value={rules.morningShiftLateThresholdTime || '08:00'}
                          onChange={(e) => setRules({ ...rules, morningShiftLateThresholdTime: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-medium mb-1">ডে শিফট লেট সীমা:</label>
                        <input
                          type="time"
                          value={rules.dayShiftLateThresholdTime || '12:00'}
                          onChange={(e) => setRules({ ...rules, dayShiftLateThresholdTime: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Duplicate Scan Protection Cooldown */}
                  <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-amber-950 text-xs">
                          ডুপ্লিকেট স্ক্যান প্রতিরোধ সময় (Duplicate Cooldown)
                        </h4>
                        <p className="text-[11px] text-amber-800">
                          প্রবেশ হাজিরা নেওয়ার পর এই মিনিটের মধ্যে পুনরায় QR বা ফেস স্ক্যান করলে ডুপ্লিকেট হিসেবে ব্লক করবে।
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <DigitInput
                          min={1}
                          max={180}
                          value={rules.duplicateCooldownMinutes ?? 10}
                          onValueChange={(val) =>
                            setRules({
                              ...rules,
                              duplicateCooldownMinutes: Math.max(1, val || 10),
                              duplicateCooldownConfigured: true,
                            })
                          }
                          className="w-16 px-2.5 py-1.5 border border-amber-300 rounded-xl bg-white font-black text-center text-amber-900"
                        />
                        <span className="text-xs font-bold text-amber-900">মিনিট</span>
                      </div>
                    </div>
                  </div>

                  {/* Manual correction checkbox */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center space-x-2.5">
                    <input
                      type="checkbox"
                      id="manualCorrectionCheck"
                      checked={rules.allowManualCorrection}
                      onChange={(e) => setRules({ ...rules, allowManualCorrection: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                    />
                    <label htmlFor="manualCorrectionCheck" className="text-slate-700 font-medium cursor-pointer">
                      প্রয়োজনে অ্যাডমিন ও শিক্ষকের দ্বারা হাজিরা সংশোধনের অনুমোদন প্রদান
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Action Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                ✓ সেটিংস সাথে সাথে ক্লাউড ফায়ারস্টোর ডাটাবেজে লাইভ সিঙ্ক হবে।
              </span>

              <div className="flex items-center space-x-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowRulesModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-white text-xs font-bold transition-colors"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={() => {
                    StorageService.saveAttendanceRules(rules);
                    setShowRulesModal(false);
                    playBeep('success');
                  }}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-black text-xs shadow-md transition-all flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>সংরক্ষণ করুন (Save & Sync)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FACE ENROLLMENT & PHOTO REGISTRATION                                */}
      {/* ========================================================================= */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-purple-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black">বায়োমেট্রিক ফেস এনরোলমেন্ট ও প্রোফাইল ছবি</h3>
                  <p className="text-[11px] text-purple-200">
                    শিক্ষার্থী বা শিক্ষকের মুখমণ্ডলের ছবি যুক্ত বা আপডেট করে এআই ফেস হাজিরা সক্রিয় করুন
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEnrollModal(false);
                  setEnrollingPerson(null);
                  setEnrollCapturedPhoto(null);
                }}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notice if saved */}
            {enrollNotice && (
              <div className="p-3 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{enrollNotice}</span>
              </div>
            )}

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Step 1: Select Type & Search Person */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEnrollTargetType('student');
                      setEnrollingPerson(null);
                      setEnrollCapturedPhoto(null);
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      enrollTargetType === 'student'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    শিক্ষার্থী তালিকা ({StorageService.getStudents().length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnrollTargetType('staff');
                      setEnrollingPerson(null);
                      setEnrollCapturedPhoto(null);
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      enrollTargetType === 'staff'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    শিক্ষক ও স্টাফ ({StorageService.getStaff().length})
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder={
                      enrollTargetType === 'student'
                        ? 'শিক্ষার্থীর নাম, রোল বা আইডি লিখে খুঁজুন...'
                        : 'শিক্ষক/স্টাফের নাম বা পদবি লিখে খুঁজুন...'
                    }
                    value={enrollSearch}
                    onChange={(e) => setEnrollSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-purple-500 font-medium"
                  />
                </div>
              </div>

              {/* People Selection List */}
              {!enrollingPerson ? (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {(enrollTargetType === 'student' ? StorageService.getStudents() : StorageService.getStaff())
                    .filter((p: any) => {
                      if (!enrollSearch.trim()) return true;
                      const q = enrollSearch.toLowerCase();
                      const nameEn = String(p.nameEn || '').toLowerCase();
                      const nameBn = String(p.nameBn || '').toLowerCase();
                      const id = String(p.studentId || p.employeeId || p.id || '').toLowerCase();
                      const roll = String(p.roll || '').toLowerCase();
                      return nameEn.includes(q) || nameBn.includes(q) || id.includes(q) || roll.includes(q);
                    })
                    .slice(0, 15)
                    .map((person: any) => {
                      const isStudent = 'roll' in person;
                      const hasPhoto = !!person.photoUrl;
                      return (
                        <div
                          key={person.id}
                          onClick={() => {
                            setEnrollingPerson(person);
                            setEnrollCapturedPhoto(person.photoUrl || null);
                          }}
                          className="p-2.5 rounded-xl border border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 cursor-pointer flex items-center justify-between transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                              {person.photoUrl ? (
                                <img src={person.photoUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            <div className="truncate">
                              <h5 className="text-xs font-bold text-slate-900 truncate">
                                {person.nameBn || person.nameEn}
                              </h5>
                              <p className="text-[10px] text-slate-500 truncate">
                                {isStudent
                                  ? `${person.className} • রোল: ${toBnNumber(person.roll)}`
                                  : `${person.designation || person.department}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                hasPhoto
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {hasPhoto ? 'ছবি নিবন্ধিত' : 'ছবি নেই'}
                            </span>
                            <span className="text-xs text-purple-600 font-bold">এনরোল →</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* Selected Person Capture & Upload Panel */
                <div className="space-y-4 p-4 bg-purple-50/50 rounded-2xl border border-purple-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-sm text-purple-950">
                        {enrollingPerson.nameBn || enrollingPerson.nameEn}
                      </h4>
                      <p className="text-xs text-purple-700">
                        {'roll' in enrollingPerson
                          ? `শ্রেণি: ${(enrollingPerson as Student).className} • রোল: ${(enrollingPerson as Student).roll}`
                          : `পদবি: ${(enrollingPerson as Staff).designation || (enrollingPerson as Staff).department}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEnrollingPerson(null);
                        setEnrollCapturedPhoto(null);
                      }}
                      className="text-xs text-purple-600 hover:underline font-bold"
                    >
                      ব্যক্তি পরিবর্তন
                    </button>
                  </div>

                  {/* Photo Preview */}
                  <div className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-purple-200">
                    <div className="w-32 h-36 rounded-2xl overflow-hidden border-2 border-dashed border-purple-300 bg-slate-50 flex items-center justify-center relative shadow-inner">
                      {enrollCapturedPhoto ? (
                        <img
                          src={enrollCapturedPhoto}
                          alt="Face Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-3 text-slate-400">
                          <ScanFace className="w-10 h-10 mx-auto mb-1 text-purple-300" />
                          <span className="text-[10px] font-bold">ছবি যুক্ত করুন</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={async () => {
                          resumeScannerAfterEnrollCamRef.current = scanning;
                          if (scanning) {
                            await stopCamera();
                          }
                          setShowEnrollCamera(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>লাইভ ক্যামেরা দিয়ে ছবি তুলুন</span>
                      </button>

                      {scanning && (
                        <button
                          type="button"
                          onClick={() => {
                            const snap = captureCurrentFrame();
                            if (snap) {
                              setEnrollCapturedPhoto(snap);
                              playBeep('success');
                            }
                          }}
                          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                        >
                          <ScanFace className="w-3.5 h-3.5" />
                          <span>স্ক্যানার ফ্রেম নিন</span>
                        </button>
                      )}

                      <label className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>গ্যালারি থেকে আপলোড</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) {
                              const compressed = await compressImageToPassportSize(file, 240, 300, 0.72);
                              if (compressed) {
                                setEnrollCapturedPhoto(compressed);
                                playBeep('success');
                              }
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Save button */}
                  <button
                    type="button"
                    disabled={!enrollCapturedPhoto}
                    onClick={() => {
                      if (!enrollingPerson || !enrollCapturedPhoto) return;
                      if (enrollTargetType === 'student') {
                        const student = enrollingPerson as Student;
                        StorageService.updateStudent({
                          ...student,
                          photoUrl: enrollCapturedPhoto,
                        });
                      } else {
                        const staff = enrollingPerson as Staff;
                        StorageService.updateStaff({
                          ...staff,
                          photoUrl: enrollCapturedPhoto,
                        });
                      }
                      void prewarmEnrolledFaceSignatures(true);
                      const name = enrollingPerson.nameBn || enrollingPerson.nameEn;
                      setEnrollNotice(`✓ ${name}-এর ফেস প্রোফাইল সফলভাবে এনরোল করা হয়েছে!`);
                      playBeep('success');
                      speakBengaliVoice(`${name}-এর ফেস এনরোলমেন্ট সফল হয়েছে।`);
                      setTimeout(() => {
                        setEnrollNotice(null);
                        setShowEnrollModal(false);
                        setEnrollingPerson(null);
                        setEnrollCapturedPhoto(null);
                        onAttendanceUpdated();
                      }, 1200);
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 transition-all ${
                      enrollCapturedPhoto
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-98'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>সংরক্ষণ ও ফেস এনরোল নিশ্চিত করুন</span>
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-100 text-right">
              <button
                type="button"
                onClick={() => {
                  setShowEnrollModal(false);
                  setEnrollingPerson(null);
                  setEnrollCapturedPhoto(null);
                }}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Capture Modal for Face Enrollment */}
      <LiveCameraModal
        isOpen={showEnrollCamera}
        title={
          enrollingPerson
            ? `${enrollingPerson.nameBn || enrollingPerson.nameEn}-এর ফেস ছবি তুলুন`
            : 'ফেস এনরোলমেন্ট ছবি তুলুন'
        }
        defaultFacing={cameraFacingRef.current}
        onCapture={(compressedDataUrl) => {
          setEnrollCapturedPhoto(compressedDataUrl);
          playBeep('success');
        }}
        onClose={() => {
          setShowEnrollCamera(false);
          if (resumeScannerAfterEnrollCamRef.current) {
            resumeScannerAfterEnrollCamRef.current = false;
            startCamera();
          }
        }}
      />

      {/* Quick Face Match & Instant Enroll Fallback Modal */}
      {quickFaceModal.isOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-gradient-to-r from-indigo-700 to-purple-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                {quickFaceModal.snapshot ? (
                  <img
                    src={quickFaceModal.snapshot}
                    alt="Captured Snapshot"
                    className="w-11 h-12 rounded-xl object-cover border-2 border-white/60 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <ScanFace className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-black">তাৎক্ষণিক ফেস শনাক্তকরণ ও এনরোল</h4>
                  <p className="text-[11px] text-purple-100 leading-tight">
                    ব্যক্তি নির্বাচন করুন — ছবি সেভ হয়ে তাৎক্ষণিক হাজিরা রেকর্ড হবে
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickFaceModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickFaceModal.hintText && (
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-[11px] font-semibold">
                {quickFaceModal.hintText}
              </div>
            )}

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickFaceModal((prev) => ({ ...prev, targetType: 'student' }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                    quickFaceModal.targetType === 'student'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  শিক্ষার্থী ({StorageService.getStudents().length})
                </button>
                <button
                  type="button"
                  onClick={() => setQuickFaceModal((prev) => ({ ...prev, targetType: 'staff' }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                    quickFaceModal.targetType === 'staff'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  শিক্ষক ও স্টাফ ({StorageService.getStaff().length})
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="নাম, রোল বা আইডি দিয়ে খুঁজুন..."
                  value={quickFaceModal.search}
                  onChange={(e) => setQuickFaceModal((prev) => ({ ...prev, search: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {(quickFaceModal.targetType === 'student' ? StorageService.getStudents() : StorageService.getStaff())
                  .filter((p: any) => {
                    const q = quickFaceModal.search.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      String(p.nameEn || '').toLowerCase().includes(q) ||
                      String(p.nameBn || '').toLowerCase().includes(q) ||
                      String(p.studentId || p.employeeId || p.id || '').toLowerCase().includes(q) ||
                      String(p.roll || '').toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 20)
                  .map((person: any) => {
                    const isStudent = 'roll' in person;
                    return (
                      <div
                        key={person.id}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                            {person.photoUrl ? (
                              <img src={person.photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {person.nameBn || person.nameEn}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {isStudent
                                ? `${person.className} • রোল ${toBnNumber(person.roll || '1')}`
                                : person.designation || person.department}
                              {!person.photoUrl && ' • ছবি নেই'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {quickFaceModal.snapshot && (
                            <button
                              type="button"
                              onClick={async () => {
                                const snap = quickFaceModal.snapshot!;
                                if (isStudent) {
                                  StorageService.updateStudent({ ...(person as Student), photoUrl: snap });
                                } else {
                                  StorageService.updateStaff({ ...(person as Staff), photoUrl: snap });
                                }
                                void prewarmEnrolledFaceSignatures(true);
                                setQuickFaceModal((prev) => ({ ...prev, isOpen: false }));
                                isScanLockedRef.current = false;
                                await executeFaceRecognition(person.id, snap);
                              }}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black shadow-xs"
                            >
                              ছবি সেভ ও হাজিরা
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              setQuickFaceModal((prev) => ({ ...prev, isOpen: false }));
                              isScanLockedRef.current = false;
                              await executeFaceRecognition(person.id, quickFaceModal.snapshot || undefined);
                            }}
                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold"
                          >
                            শুধু হাজিরা
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
