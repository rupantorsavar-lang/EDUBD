import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { SchoolProfile, Staff, Student } from '../../types';
import { StorageService } from '../../services/storage';
import { isValidSignatureSrc } from './PrincipalSignatureDisplay';

export type IDCardTheme =
  | 'executive_royal'
  | 'classic_academic'
  | 'modern_emerald'
  | 'amber_charcoal';

export const ID_CARD_THEME_OPTIONS: Array<{
  id: IDCardTheme;
  labelBn: string;
  labelEn: string;
  activeClass: string;
}> = [
  {
    id: 'executive_royal',
    labelBn: '1. ক্রিমসন ও নেভি',
    labelEn: '1. Crimson Navy',
    activeClass: 'bg-[#A61C24] text-white shadow-xs',
  },
  {
    id: 'classic_academic',
    labelBn: '2. রয়্যাল ইনডিগো',
    labelEn: '2. Royal Indigo',
    activeClass: 'bg-[#1E2678] text-white shadow-xs',
  },
  {
    id: 'modern_emerald',
    labelBn: '3. টিল ও ম্যাজেন্টা',
    labelEn: '3. Teal & Rose',
    activeClass: 'bg-[#0F6A73] text-white shadow-xs',
  },
  {
    id: 'amber_charcoal',
    labelBn: '4. অ্যাম্বার চারকোল',
    labelEn: '4. Amber Charcoal',
    activeClass: 'bg-[#D97706] text-white shadow-xs',
  },
];

function useCardQrUrl(providedQrUrl: string | undefined, buildPayload: () => string): string {
  const [autoQrUrl, setAutoQrUrl] = useState<string>('');

  useEffect(() => {
    if (providedQrUrl) return;
    let active = true;
    const generate = async () => {
      try {
        const payload = buildPayload();
        const url = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 320,
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (active) setAutoQrUrl(url);
      } catch (e) {
        console.error('ID Card QR generation error:', e);
      }
    };
    generate();
    return () => {
      active = false;
    };
  }, [providedQrUrl, buildPayload]);

  return providedQrUrl || autoQrUrl;
}

function formatCardDate(raw?: string, fallback = '01/01/2026'): string {
  if (!raw) return fallback;
  const parts = raw.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return raw;
}

function resolveExpiryDate(session?: string): string {
  const yr = (session || '2026').replace(/[^0-9]/g, '').slice(0, 4) || '2026';
  return `31/12/${yr}`;
}

function formatStudentGroupLabel(student: Student): string {
  const g = student.group;
  if (!g || g === 'General') {
    return ['Class 9', 'Class 10'].includes(student.className) ? 'Science' : 'General';
  }
  if (g === 'Commerce') return 'Business Studies';
  if (g === 'Arts') return 'Humanities';
  return g;
}

/**
 * Generates a crisp, deterministic black-on-white Code-128 style vector barcode.
 */
export const DeterministicBarcodeSVG: React.FC<{
  value: string;
  className?: string;
}> = ({ value, className = 'w-[175px] h-[28px]' }) => {
  const seedStr = (value || 'SSBD-0001').toUpperCase();
  const bars: Array<{ x: number; w: number }> = [];

  let cursor = 2;
  bars.push({ x: cursor, w: 2 });
  cursor += 3.5;
  bars.push({ x: cursor, w: 1 });
  cursor += 2.5;
  bars.push({ x: cursor, w: 2 });
  cursor += 4;

  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let step = 0;
  while (cursor < 204) {
    hash ^= (hash << 13) ^ (step * 73856093);
    hash = Math.imul(hash, 16777619);
    const barW = [1.5, 2.5, 3.5, 1.5, 4.5, 2][Math.abs(hash) % 6];
    const gapW = [1.5, 2.5, 2, 3.5, 1.5, 2.5][Math.abs(hash >> 4) % 6];
    if (cursor + barW > 205) break;
    bars.push({ x: Number(cursor.toFixed(1)), w: barW });
    cursor += barW + gapW;
    step++;
  }

  bars.push({ x: 208, w: 2 });
  bars.push({ x: 211.5, w: 1 });
  bars.push({ x: 214, w: 3 });

  return (
    <svg
      viewBox="0 0 220 30"
      className={className}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-label={`Barcode ${seedStr}`}
    >
      <rect x="0" y="0" width="220" height="30" fill="#ffffff" />
      {bars.map((b, idx) => (
        <rect key={idx} x={b.x} y="0" width={b.w} height="30" fill="#000000" />
      ))}
    </svg>
  );
};

const PrincipalSignatureBlock: React.FC<{
  principalName?: string;
  signatureUrl?: string;
  darkBg?: boolean;
  accentColor?: string;
}> = ({ principalName, signatureUrl, darkBg = false, accentColor = '#0F2744' }) => (
  <div className="text-center min-w-[92px] max-w-[136px]">
    {isValidSignatureSrc(signatureUrl) ? (
      <div
        className={`h-6 flex items-end justify-center mx-auto mb-0.5 ${
          darkBg ? 'bg-white/95 rounded px-1.5 py-0.5' : ''
        }`}
      >
        <img
          src={signatureUrl}
          alt={principalName ? `${principalName} Signature` : 'Principal Signature'}
          className="max-h-full max-w-[100px] object-contain mx-auto"
        />
      </div>
    ) : (
      <svg
        viewBox="0 0 96 22"
        className={`w-16 h-4 mx-auto -mb-0.5 ${darkBg ? 'text-white' : 'text-slate-900'}`}
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M8,16 C14,4 22,4 20,14 C18,20 10,18 14,12 C18,6 28,15 35,12 C42,9 46,15 54,11 C62,7 72,13 88,8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
    <div
      className={`border-t pt-0.5 ${darkBg ? 'border-white/50' : 'border-slate-700'}`}
    >
      <span
        className="block text-[9px] font-bold leading-tight truncate"
        style={{ color: darkBg ? '#FDE68A' : accentColor }}
      >
        {principalName || 'Principal'}
      </span>
      <span
        className={`block text-[7.5px] uppercase tracking-wider font-semibold ${
          darkBg ? 'text-slate-200' : 'text-slate-600'
        }`}
      >
        Principal&apos;s Signature
      </span>
    </div>
  </div>
);

interface PhotoFrameProps {
  src?: string;
  alt: string;
  initial: string;
  shape: 'hexagon' | 'circle' | 'rounded';
  borderColor: string;
  bgColor: string;
  sizeClass?: string;
}

const CardPhotoFrame: React.FC<PhotoFrameProps> = ({
  src,
  alt,
  initial,
  shape,
  borderColor,
  bgColor,
  sizeClass = 'w-[86px] h-[88px]',
}) => {
  if (shape === 'hexagon') {
    const hexClip = 'polygon(50% 0%, 96% 24%, 96% 76%, 50% 100%, 4% 76%, 4% 24%)';
    return (
      <div
        className={`${sizeClass} flex items-center justify-center p-[3px] shadow-md shrink-0`}
        style={{ clipPath: hexClip, backgroundColor: borderColor }}
      >
        <div
          className="w-full h-full flex items-center justify-center overflow-hidden"
          style={{ clipPath: hexClip, backgroundColor: bgColor }}
        >
          {src ? (
            <img src={src} alt={alt} className="w-full h-full object-cover object-top" />
          ) : (
            <span className="text-2xl font-black" style={{ color: borderColor }}>
              {initial}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (shape === 'circle') {
    return (
      <div
        className={`${sizeClass} rounded-full overflow-hidden flex items-center justify-center shadow-md shrink-0`}
        style={{ border: `3px solid ${borderColor}`, backgroundColor: bgColor }}
      >
        {src ? (
          <img src={src} alt={alt} className="w-full h-full object-cover object-top" />
        ) : (
          <span className="text-2xl font-black" style={{ color: borderColor }}>
            {initial}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-xl overflow-hidden flex items-center justify-center shadow-md shrink-0`}
      style={{ border: `2.5px solid ${borderColor}`, backgroundColor: bgColor }}
    >
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover object-top" />
      ) : (
        <span className="text-2xl font-black" style={{ color: borderColor }}>
          {initial}
        </span>
      )}
    </div>
  );
};

/* ============================================================================ */
/* 1. STUDENT ID CARD — FRONT SIDE                                              */
/* ============================================================================ */

const StudentFrontArtwork: React.FC<{ theme: IDCardTheme }> = ({ theme }) => {
  if (theme === 'executive_royal') {
    // Design 1 (Top-Right / Top-Left sheet: Navy top + Crimson V-chevron)
    return (
      <svg
        viewBox="0 0 320 500"
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect width="320" height="500" fill="#F8FAFC" />
        <polygon points="0,0 320,0 320,66 160,118 0,66" fill="#0F2744" />
        <polygon points="0,66 160,118 320,66 320,92 160,144 0,92" fill="#A61C24" />
        <polygon points="0,92 160,144 320,92 320,98 160,150 0,98" fill="#E2E8F0" />
        <rect x="0" y="492" width="320" height="8" fill="#0F2744" />
      </svg>
    );
  }

  if (theme === 'modern_emerald') {
    // Design 3 (Navy & Magenta/Rose angled geometric blocks)
    return (
      <svg
        viewBox="0 0 320 500"
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect width="320" height="500" fill="#FFFFFF" />
        <polygon points="0,0 320,0 320,74 0,116" fill="#0F1B3D" />
        <polygon points="215,52 320,42 320,136 226,112" fill="#C81E68" />
        <polygon points="0,476 320,476 320,500 0,500" fill="#0F1B3D" />
        <rect x="0" y="472" width="320" height="4" fill="#C81E68" />
      </svg>
    );
  }

  if (theme === 'amber_charcoal') {
    // Design 4 (Charcoal & Amber diagonal top banner + Amber bottom bar)
    return (
      <svg
        viewBox="0 0 320 500"
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect width="320" height="500" fill="#FFFFFF" />
        <polygon points="0,0 320,0 320,114 0,88" fill="#1F242D" />
        <polygon points="0,68 95,105 0,148" fill="#E5891C" />
        <polygon points="180,100 320,114 320,134 150,110" fill="#E5891C" />
        <rect x="0" y="474" width="320" height="26" fill="#E5891C" />
      </svg>
    );
  }

  // classic_academic — Design 2 (Royal Indigo header + bokeh + Gold stripe)
  return (
    <svg
      viewBox="0 0 320 500"
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect width="320" height="500" fill="#FFFFFF" />
      <rect x="0" y="0" width="320" height="108" fill="#1E2678" />
      <circle cx="38" cy="24" r="34" fill="#2D38A8" opacity="0.55" />
      <circle cx="286" cy="40" r="42" fill="#2D38A8" opacity="0.5" />
      <rect x="0" y="108" width="320" height="5" fill="#D99B26" />
      <rect x="0" y="473" width="320" height="27" fill="#1E2678" />
      <rect x="0" y="471" width="320" height="2.5" fill="#D99B26" />
    </svg>
  );
};

export interface ModernStudentIDCardFrontProps {
  student: Student;
  school: Partial<SchoolProfile>;
  scopedStudentId: string;
  theme?: IDCardTheme;
  qrUrl?: string;
  widthClass?: string;
  heightClass?: string;
}

export const ModernStudentIDCardFront: React.FC<ModernStudentIDCardFrontProps> = ({
  student,
  school,
  scopedStudentId,
  theme = 'classic_academic',
  qrUrl,
  widthClass = 'w-[320px]',
  heightClass = 'h-[500px]',
}) => {
  const resolvedQrUrl = useCardQrUrl(qrUrl, () =>
    StorageService.generateStudentQRData(student)
  );

  const cfg =
    theme === 'executive_royal'
      ? {
          accent: '#A61C24',
          nameColor: '#0F2744',
          shape: 'hexagon' as const,
          photoBorder: '#A61C24',
          photoBg: '#FEE2E2',
          footerBg: false,
          footerText: 'STUDENT IDENTITY CARD',
        }
      : theme === 'modern_emerald'
      ? {
          accent: '#C81E68',
          nameColor: '#C81E68',
          shape: 'hexagon' as const,
          photoBorder: '#C81E68',
          photoBg: '#FCE7F3',
          footerBg: true,
          footerText: 'STUDENT IDENTITY CARD',
        }
      : theme === 'amber_charcoal'
      ? {
          accent: '#E5891C',
          nameColor: '#1F242D',
          shape: 'circle' as const,
          photoBorder: '#E5891C',
          photoBg: '#FEF3C7',
          footerBg: true,
          footerText: 'STUDENT ID CARD',
        }
      : {
          accent: '#D99B26',
          nameColor: '#1E2678',
          shape: 'rounded' as const,
          photoBorder: '#D99B26',
          photoBg: '#E0E7FF',
          footerBg: true,
          footerText: 'STUDENT ID CARD',
        };

  const groupLabel = formatStudentGroupLabel(student);
  const schoolAddr = school.addressEn || school.addressBn || 'Dhaka, Bangladesh';

  return (
    <div
      className={`${widthClass} ${heightClass} bg-white rounded-2xl overflow-hidden relative font-sans text-slate-900 flex flex-col justify-between shrink-0 border border-slate-300 shadow-xl print:shadow-none print:border-2 print:border-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact]`}
    >
      <StudentFrontArtwork theme={theme} />

      {/* Top Lanyard Slot */}
      <div
        className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-white/85 z-20"
        aria-hidden="true"
      />

      {/* Foreground Stack */}
      <div className="relative z-10 flex flex-col justify-between h-full">
        {/* TOP HEADER: School Logo + Name + Address + Phone */}
        <div className="px-3 pt-4 pb-1 flex items-center gap-2 text-white">
          <div className="w-9 h-9 rounded-lg bg-white p-0.5 shadow-sm shrink-0 flex items-center justify-center">
            <img
              src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
              alt="Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <h4 className="font-black text-[11.5px] uppercase tracking-tight text-white truncate">
              {school.nameEn || 'SMART SCHOOL BD'}
            </h4>
            <p className="text-[8px] text-slate-100/95 truncate flex items-center gap-1 mt-0.5">
              <MapPin className="w-2.5 h-2.5 shrink-0 text-amber-300" />
              <span className="truncate">{schoolAddr}</span>
            </p>
            <p className="text-[8px] font-mono text-amber-200 font-bold truncate flex items-center gap-1">
              <Phone className="w-2.5 h-2.5 shrink-0" />
              <span>{school.phone || '+880 1700-000000'}</span>
            </p>
          </div>
        </div>

        {/* CENTER: Photo + Name + Structured Info Table */}
        <div className="px-3.5 flex flex-col items-center">
          <CardPhotoFrame
            src={student.photoUrl}
            alt={student.nameEn}
            initial={(student.nameEn || 'S').charAt(0).toUpperCase()}
            shape={cfg.shape}
            borderColor={cfg.photoBorder}
            bgColor={cfg.photoBg}
            sizeClass="w-[84px] h-[86px]"
          />

          <div className="text-center w-full mt-1.5">
            <h3
              className="font-black text-[13.5px] uppercase tracking-tight leading-tight truncate"
              style={{ color: cfg.nameColor }}
            >
              {student.nameEn || student.nameBn}
            </h3>
            {student.nameBn && student.nameBn !== student.nameEn && (
              <p className="text-[9.5px] font-bold text-slate-600 truncate leading-tight">
                {student.nameBn}
              </p>
            )}
          </div>

          {/* All Required Student Fields */}
          <div className="w-full mt-2 bg-white/90 rounded-lg border border-slate-200/90 px-2.5 py-1.5 text-[9.5px] space-y-1 shadow-2xs">
            <div className="flex justify-between items-center border-b border-slate-100 pb-0.5">
              <span className="text-slate-500 font-semibold">Student ID:</span>
              <span
                className="font-mono font-black tracking-tight"
                style={{ color: cfg.nameColor }}
              >
                {scopedStudentId}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-2 border-b border-slate-100 pb-0.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Class:</span>
                <strong className="text-slate-900">{student.className}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Roll:</span>
                <strong className="font-mono text-slate-900">{student.roll}</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-2 border-b border-slate-100 pb-0.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Section:</span>
                <strong className="text-slate-900">{student.section || 'A'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Session:</span>
                <strong className="font-mono text-slate-900">
                  {student.session || school.currentSession || '2026'}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-2 border-b border-slate-100 pb-0.5">
              <div className="flex justify-between items-center gap-1 min-w-0">
                <span className="text-slate-500 font-semibold shrink-0">Group:</span>
                <strong className="text-slate-900 truncate">{groupLabel}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold">Blood:</span>
                <strong className="text-rose-600 font-black">
                  {student.bloodGroup || 'B+'}
                </strong>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold">Guardian Mob:</span>
              <strong className="font-mono text-slate-900 font-bold">
                {student.guardianPhone || 'N/A'}
              </strong>
            </div>
          </div>
        </div>

        {/* BOTTOM ZONE: Barcode on Left + Small Corner QR on Right */}
        <div>
          <div className="px-3.5 pb-1.5 flex items-end justify-between gap-2">
            <div className="flex-1 min-w-0 flex flex-col items-start">
              <DeterministicBarcodeSVG
                value={scopedStudentId}
                className="w-full max-w-[184px] h-[28px] border border-slate-200 rounded-2xs"
              />
              <span className="mt-0.5 font-mono font-bold text-[8px] text-slate-600 tracking-wider">
                ID: {scopedStudentId}
              </span>
            </div>

            {/* Small Corner QR Code (front-এ নিচে কোনায় ছোট QR) */}
            <div className="p-0.5 bg-white border border-slate-900 rounded-md shadow-2xs shrink-0">
              {resolvedQrUrl ? (
                <img
                  src={resolvedQrUrl}
                  alt="Student Mini QR"
                  className="w-[50px] h-[50px] object-contain"
                />
              ) : (
                <div className="w-[50px] h-[50px] flex items-center justify-center text-[7px] font-mono font-bold">
                  QR
                </div>
              )}
            </div>
          </div>

          <div
            className={`py-1 text-center text-[8.5px] font-black uppercase tracking-widest ${
              cfg.footerBg ? 'text-white' : 'text-slate-800 bg-slate-100 border-t border-slate-200'
            }`}
          >
            {cfg.footerText}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================ */
/* 2. STUDENT ID CARD — BACK SIDE                                               */
/* ============================================================================ */

export interface ModernStudentIDCardBackProps {
  student: Student;
  school: Partial<SchoolProfile>;
  scopedStudentId: string;
  theme?: IDCardTheme;
  qrUrl?: string;
  widthClass?: string;
  heightClass?: string;
}

export const ModernStudentIDCardBack: React.FC<ModernStudentIDCardBackProps> = ({
  student,
  school,
  scopedStudentId,
  theme = 'classic_academic',
  qrUrl,
  widthClass = 'w-[320px]',
  heightClass = 'h-[500px]',
}) => {
  const resolvedQrUrl = useCardQrUrl(qrUrl, () =>
    StorageService.generateStudentQRData(student)
  );

  const themeAccent =
    theme === 'executive_royal'
      ? { primary: '#0F2744', accent: '#A61C24' }
      : theme === 'modern_emerald'
      ? { primary: '#0F1B3D', accent: '#C81E68' }
      : theme === 'amber_charcoal'
      ? { primary: '#1F242D', accent: '#E5891C' }
      : { primary: '#1E2678', accent: '#D99B26' };

  const issueDate = formatCardDate(student.admissionDate, '01/01/2026');
  const expiryDate = resolveExpiryDate(student.session || school.currentSession);
  const emergencyNo =
    student.fatherPhone || student.motherPhone || student.guardianPhone || school.phone || 'N/A';
  const permanentAddr =
    student.permanentAddress || student.presentAddress || school.addressEn || 'Bangladesh';
  const schoolAddr = school.addressEn || school.addressBn || 'Dhaka, Bangladesh';

  return (
    <div
      className={`${widthClass} ${heightClass} bg-white text-slate-900 rounded-2xl overflow-hidden relative font-sans flex flex-col justify-between shrink-0 border-2 border-slate-900 shadow-xl print:shadow-none print:border-2 print:border-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact]`}
    >
      {/* Top Colored Header Strip matching Front Theme */}
      <div
        className="px-3 py-2 text-white text-center relative shrink-0"
        style={{
          backgroundColor: themeAccent.primary,
          borderBottom: `3px solid ${themeAccent.accent}`,
        }}
      >
        <h4 className="font-black text-[10.5px] uppercase tracking-wider truncate">
          {school.nameEn || 'SMART SCHOOL BD'}
        </h4>
        <p className="text-[8px] font-bold tracking-widest uppercase text-amber-200">
          STUDENT IDENTITY CARD • VERIFICATION &amp; QR
        </p>
      </div>

      {/* Main Content */}
      <div className="px-3.5 py-2 flex-1 flex flex-col justify-between">
        {/* Large High-Contrast Pitch-Black QR Code on Pure White */}
        <div className="flex flex-col items-center justify-center">
          <div className="p-1.5 bg-white rounded-xl border-2 border-black shadow-2xs relative">
            {resolvedQrUrl ? (
              <img
                src={resolvedQrUrl}
                alt="Student Attendance QR"
                className="w-[104px] h-[104px] object-contain"
              />
            ) : (
              <div className="w-[104px] h-[104px] bg-white border border-black flex items-center justify-center text-xs font-mono font-bold">
                QR CODE
              </div>
            )}
          </div>
          <span className="mt-1 font-mono font-black text-[10px] text-black tracking-wider">
            ID: {scopedStudentId}
          </span>
        </div>

        {/* Required Back Details Table */}
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-2 text-[9px] space-y-1 text-slate-900">
          <div className="flex justify-between border-b border-slate-200 pb-0.5">
            <span className="font-semibold text-slate-600">Date of Birth:</span>
            <strong className="font-mono text-black">{formatCardDate(student.dob, 'N/A')}</strong>
          </div>

          <div className="border-b border-slate-200 pb-0.5">
            <span className="font-semibold text-slate-600">Permanent Address: </span>
            <span className="font-bold text-black leading-tight">{permanentAddr}</span>
          </div>

          <div className="flex justify-between border-b border-slate-200 pb-0.5">
            <span className="font-semibold text-slate-600">Guardian Mobile:</span>
            <strong className="font-mono text-black">{student.guardianPhone || 'N/A'}</strong>
          </div>

          <div className="flex justify-between border-b border-slate-200 pb-0.5">
            <span className="font-semibold text-slate-600">Emergency Contact:</span>
            <strong className="font-mono text-rose-700">{emergencyNo}</strong>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono text-[8.5px]">
            <div>
              <span className="text-slate-500 font-sans font-semibold">Issue: </span>
              <strong className="text-black">{issueDate}</strong>
            </div>
            <div className="text-right">
              <span className="text-slate-500 font-sans font-semibold">Expiry: </span>
              <strong className="text-black">{expiryDate}</strong>
            </div>
          </div>
        </div>

        {/* Lost Card Notice & School Address */}
        <div className="border border-dashed border-slate-400 rounded-lg p-1.5 text-[7.5px] leading-snug text-slate-800 bg-amber-50/50 space-y-0.5">
          <p className="font-bold text-slate-950 flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
            <span>হারিয়ে গেলে যোগাযোগের নির্দেশনা / Lost Return Policy:</span>
          </p>
          <p>
            এই কার্ডটি হারিয়ে গেলে বা পাওয়া গেলে অনুগ্রহ করে{' '}
            <strong>{school.nameEn || 'স্কুল অফিসে'}</strong> জমা দিন অথবা কল করুন:{' '}
            <strong className="font-mono">{school.phone || '+880 1700-000000'}</strong>।
          </p>
          <p className="text-slate-700">
            <strong>School Address:</strong> {schoolAddr}
          </p>
        </div>

        {/* Bottom Principal Signature */}
        <div className="pt-1 flex items-end justify-between">
          <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wide">
            Scan at Smart Gate Kiosk
          </span>
          <PrincipalSignatureBlock
            principalName={school.principalNameEn}
            signatureUrl={school.principalSignatureUrl}
            accentColor={themeAccent.primary}
          />
        </div>
      </div>

      {/* Bottom Accent Bar */}
      <div
        className="py-1 text-center text-[8px] font-bold text-white tracking-wider shrink-0"
        style={{ backgroundColor: themeAccent.primary }}
      >
        {school.website || school.email || school.phone || 'SMART SCHOOL BD'}
      </div>
    </div>
  );
};

/* ============================================================================ */
/* 3. TEACHER / STAFF ID CARD — FRONT SIDE                                      */
/* ============================================================================ */

const TeacherFrontArtwork: React.FC<{ theme: IDCardTheme }> = ({ theme }) => {
  if (theme === 'executive_royal') {
    // Design 1 (Crimson chevron wings + bottom crimson wave)
    return (
      <svg
        viewBox="0 0 320 500"
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect width="320" height="500" fill="#FFFFFF" />
        <polygon points="0,38 58,76 58,128 0,90" fill="#8B1220" />
        <polygon points="0,98 44,128 44,142 0,112" fill="#0F2744" />
        <polygon points="320,38 262,76 262,128 320,90" fill="#8B1220" />
        <polygon points="320,98 276,128 276,142 320,112" fill="#0F2744" />
        <path
          d="M0,446 C95,478 225,478 320,446 L320,500 L0,500 Z"
          fill="#8B1220"
        />
      </svg>
    );
  }

  if (theme === 'modern_emerald') {
    // Design 3 (Teal header with Coral/Rose diagonal stripe + Teal footer)
    return (
      <svg
        viewBox="0 0 320 500"
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect width="320" height="500" fill="#FFFFFF" />
        <polygon points="0,0 320,0 320,104 0,80" fill="#0F6A73" />
        <polygon points="0,80 320,104 320,115 0,91" fill="#F47280" />
        <rect x="0" y="473" width="320" height="27" fill="#0F6A73" />
        <rect x="0" y="470" width="320" height="3" fill="#F47280" />
      </svg>
    );
  }

  if (theme === 'amber_charcoal') {
    // Design 4 (St. Mark's Navy & Gold academic faculty card)
    return (
      <svg
        viewBox="0 0 320 500"
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect width="320" height="500" fill="#FFFFFF" />
        <polygon points="0,0 320,0 320,76 0,108" fill="#0B2447" />
        <polygon points="0,108 320,76 320,86 0,118" fill="#D98A2B" />
        <rect x="0" y="473" width="320" height="27" fill="#0B2447" />
        <rect x="0" y="470" width="320" height="3" fill="#D98A2B" />
      </svg>
    );
  }

  // classic_academic — Design 2 (Midnight Navy with Blue & Gold accent pills)
  return (
    <svg
      viewBox="0 0 320 500"
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect width="320" height="500" fill="#FFFFFF" />
      <rect x="0" y="0" width="320" height="106" fill="#0C2348" />
      <rect
        x="72"
        y="36"
        width="58"
        height="16"
        rx="8"
        transform="rotate(-38 72 36)"
        fill="#E59819"
      />
      <rect
        x="208"
        y="108"
        width="44"
        height="13"
        rx="6.5"
        transform="rotate(-38 208 108)"
        fill="#3B82F6"
      />
      <circle cx="242" cy="52" r="24" stroke="#1E40AF" strokeWidth="1.5" fill="none" />
      <rect x="0" y="472" width="320" height="28" fill="#0C2348" />
    </svg>
  );
};

export interface ModernTeacherIDCardFrontProps {
  member: Staff;
  school: Partial<SchoolProfile>;
  scopedEmployeeId: string;
  theme?: IDCardTheme;
  qrUrl?: string;
  widthClass?: string;
  heightClass?: string;
}

export const ModernTeacherIDCardFront: React.FC<ModernTeacherIDCardFrontProps> = ({
  member,
  school,
  scopedEmployeeId,
  theme = 'classic_academic',
  qrUrl,
  widthClass = 'w-[320px]',
  heightClass = 'h-[500px]',
}) => {
  const resolvedQrUrl = useCardQrUrl(qrUrl, () =>
    StorageService.generateStaffQRData(member)
  );

  const cfg =
    theme === 'executive_royal'
      ? {
          headerDark: false,
          primary: '#8B1220',
          accent: '#0F2744',
          shape: 'circle' as const,
          photoBorder: '#8B1220',
          photoBg: '#FEE2E2',
          footerText: 'FACULTY & STAFF ID CARD',
        }
      : theme === 'modern_emerald'
      ? {
          headerDark: true,
          primary: '#0F6A73',
          accent: '#F47280',
          shape: 'hexagon' as const,
          photoBorder: '#F47280',
          photoBg: '#CCFBF1',
          footerText: 'EMPLOYEE ID CARD',
        }
      : theme === 'amber_charcoal'
      ? {
          headerDark: true,
          primary: '#0B2447',
          accent: '#D98A2B',
          shape: 'hexagon' as const,
          photoBorder: '#D98A2B',
          photoBg: '#FEF3C7',
          footerText: 'FACULTY ID CARD',
        }
      : {
          headerDark: true,
          primary: '#0C2348',
          accent: '#E59819',
          shape: 'circle' as const,
          photoBorder: '#FFFFFF',
          photoBg: '#DBEAFE',
          footerText: member.department ? `Department of ${member.department}` : 'FACULTY ID CARD',
        };

  const subjectLabel =
    member.subject ||
    (member.assignedSubjects && member.assignedSubjects.length > 0
      ? member.assignedSubjects.join(', ')
      : member.department || 'General');

  return (
    <div
      className={`${widthClass} ${heightClass} bg-white rounded-2xl overflow-hidden relative font-sans text-slate-900 flex flex-col justify-between shrink-0 border border-slate-300 shadow-xl print:shadow-none print:border-2 print:border-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact]`}
    >
      <TeacherFrontArtwork theme={theme} />

      {/* Top Lanyard Slot */}
      <div
        className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full z-20 ${
          cfg.headerDark ? 'bg-white/80' : 'bg-slate-300'
        }`}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col justify-between h-full">
        {/* TOP HEADER: School Logo + School Name */}
        <div
          className={`px-3.5 pt-4 pb-1 flex items-center justify-center gap-2 ${
            cfg.headerDark ? 'text-white' : 'text-slate-900'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-white p-0.5 shadow-sm shrink-0 flex items-center justify-center border border-slate-200/70">
            <img
              src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
              alt="Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1 leading-tight text-left">
            <h4
              className="font-black text-[11.5px] uppercase tracking-tight line-clamp-2 leading-tight"
              style={{ color: cfg.headerDark ? '#FFFFFF' : '#0F2744' }}
            >
              {school.nameEn || 'SMART SCHOOL BD'}
            </h4>
            <p
              className="text-[8px] font-bold tracking-wider uppercase truncate"
              style={{ color: cfg.headerDark ? '#FDE68A' : '#8B1220' }}
            >
              TEACHER &amp; STAFF IDENTITY
            </p>
          </div>
        </div>

        {/* CENTER: Photo + Teacher Name + Designation + All Front Fields */}
        <div className="px-3.5 flex flex-col items-center">
          <CardPhotoFrame
            src={member.photoUrl}
            alt={member.nameEn}
            initial={(member.nameEn || 'T').charAt(0).toUpperCase()}
            shape={cfg.shape}
            borderColor={cfg.photoBorder}
            bgColor={cfg.photoBg}
            sizeClass="w-[88px] h-[90px]"
          />

          <div className="text-center w-full mt-1.5">
            <h3
              className="font-black text-[13.5px] uppercase tracking-tight leading-tight truncate"
              style={{ color: cfg.primary }}
            >
              {member.nameEn || member.nameBn}
            </h3>
            <p className="text-[10px] font-bold text-slate-600 truncate">
              {member.designation || 'Teacher'}
            </p>
          </div>

          {/* Required Teacher Front Info Rows */}
          <div className="w-full mt-2 bg-white/95 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9.5px] space-y-1 shadow-2xs">
            <div className="flex justify-between items-center border-b border-slate-100 pb-0.5">
              <span className="text-slate-500 font-semibold">Teacher ID:</span>
              <strong
                className="font-mono font-black"
                style={{ color: cfg.primary }}
              >
                {scopedEmployeeId}
              </strong>
            </div>

            <div className="flex justify-between items-center border-b border-slate-100 pb-0.5 gap-2">
              <span className="text-slate-500 font-semibold shrink-0">Designation:</span>
              <strong className="text-slate-900 truncate">{member.designation}</strong>
            </div>

            <div className="flex justify-between items-center border-b border-slate-100 pb-0.5 gap-2">
              <span className="text-slate-500 font-semibold shrink-0">Department:</span>
              <strong className="text-slate-900 truncate">{member.department}</strong>
            </div>

            <div className="flex justify-between items-center border-b border-slate-100 pb-0.5 gap-2">
              <span className="text-slate-500 font-semibold shrink-0">Subject:</span>
              <strong className="text-slate-900 truncate">{subjectLabel}</strong>
            </div>

            <div className="grid grid-cols-2 gap-x-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold">Joining:</span>
                <strong className="font-mono text-slate-900">
                  {formatCardDate(member.joiningDate, '01/01/2026')}
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold">Blood:</span>
                <strong className="text-rose-600 font-black">
                  {member.bloodGroup || 'B+'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM: Barcode on Left + Small Corner QR on Right */}
        <div>
          <div className="px-3.5 pb-1.5 flex items-end justify-between gap-2">
            <div className="flex-1 min-w-0 flex flex-col items-start">
              <DeterministicBarcodeSVG
                value={scopedEmployeeId}
                className="w-full max-w-[184px] h-[28px] border border-slate-200 rounded-2xs"
              />
              <span className="mt-0.5 font-mono font-bold text-[8px] text-slate-600 tracking-wider">
                EMP ID: {scopedEmployeeId}
              </span>
            </div>

            <div className="p-0.5 bg-white border border-slate-900 rounded-md shadow-2xs shrink-0">
              {resolvedQrUrl ? (
                <img
                  src={resolvedQrUrl}
                  alt="Teacher Mini QR"
                  className="w-[50px] h-[50px] object-contain"
                />
              ) : (
                <div className="w-[50px] h-[50px] flex items-center justify-center text-[7px] font-mono font-bold">
                  QR
                </div>
              )}
            </div>
          </div>

          <div className="py-1 text-center text-[8.5px] font-black uppercase tracking-widest text-white">
            {cfg.footerText}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================ */
/* 4. TEACHER / STAFF ID CARD — BACK SIDE                                       */
/* ============================================================================ */

export interface ModernTeacherIDCardBackProps {
  member: Staff;
  school: Partial<SchoolProfile>;
  scopedEmployeeId: string;
  theme?: IDCardTheme;
  qrUrl?: string;
  widthClass?: string;
  heightClass?: string;
}

export const ModernTeacherIDCardBack: React.FC<ModernTeacherIDCardBackProps> = ({
  member,
  school,
  scopedEmployeeId,
  theme = 'classic_academic',
  qrUrl,
  widthClass = 'w-[320px]',
  heightClass = 'h-[500px]',
}) => {
  const resolvedQrUrl = useCardQrUrl(qrUrl, () =>
    StorageService.generateStaffQRData(member)
  );

  const isDarkBack = theme === 'modern_emerald' || theme === 'amber_charcoal';
  const palette =
    theme === 'executive_royal'
      ? { primary: '#8B1220', secondary: '#0F2744' }
      : theme === 'modern_emerald'
      ? { primary: '#0F6A73', secondary: '#F47280' }
      : theme === 'amber_charcoal'
      ? { primary: '#0B2447', secondary: '#D98A2B' }
      : { primary: '#0C2348', secondary: '#3B82F6' };

  const permanentAddr =
    member.permanentAddress || school.addressEn || school.addressBn || 'Dhaka, Bangladesh';
  const emergencyNo = member.emergencyContact || member.phone || school.phone || 'N/A';
  const issueDate = formatCardDate(member.joiningDate, '01/01/2026');

  return (
    <div
      className={`${widthClass} ${heightClass} rounded-2xl overflow-hidden relative font-sans flex flex-col justify-between shrink-0 border-2 border-slate-900 shadow-xl print:shadow-none print:border-2 print:border-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact]`}
      style={{
        backgroundColor: isDarkBack ? palette.primary : '#FFFFFF',
        color: isDarkBack ? '#FFFFFF' : '#0F172A',
      }}
    >
      {/* Top Colored Header Strip */}
      <div
        className="px-3 py-2 text-center shrink-0"
        style={{
          backgroundColor: isDarkBack ? 'rgba(0,0,0,0.22)' : palette.primary,
          borderBottom: `3px solid ${palette.secondary}`,
          color: '#FFFFFF',
        }}
      >
        <h4 className="font-black text-[10.5px] uppercase tracking-wider truncate">
          {school.nameEn || 'SMART SCHOOL BD'}
        </h4>
        <p className="text-[8px] font-bold tracking-widest uppercase text-amber-200">
          FACULTY &amp; STAFF ID • BACK SIDE
        </p>
      </div>

      {/* Main Content */}
      <div className="px-3.5 py-2 flex-1 flex flex-col justify-between">
        {/* Crisp Pitch-Black on White QR Code */}
        <div className="flex flex-col items-center justify-center">
          <div className="p-1.5 bg-white rounded-xl border-2 border-black shadow-xs">
            {resolvedQrUrl ? (
              <img
                src={resolvedQrUrl}
                alt="Teacher Attendance QR"
                className="w-[104px] h-[104px] object-contain"
              />
            ) : (
              <div className="w-[104px] h-[104px] bg-white border border-black flex items-center justify-center text-xs font-mono font-bold text-black">
                QR CODE
              </div>
            )}
          </div>
          <span
            className={`mt-1 font-mono font-black text-[10px] tracking-wider ${
              isDarkBack ? 'text-amber-200' : 'text-black'
            }`}
          >
            EMP ID: {scopedEmployeeId}
          </span>
        </div>

        {/* Required Teacher Back Details */}
        <div
          className={`rounded-xl p-2 text-[9px] space-y-1 border ${
            isDarkBack
              ? 'bg-white/10 border-white/25 text-white'
              : 'bg-slate-50 border-slate-300 text-slate-900'
          }`}
        >
          <div
            className={`flex justify-between items-center border-b pb-0.5 ${
              isDarkBack ? 'border-white/15' : 'border-slate-200'
            }`}
          >
            <span className="flex items-center gap-1 opacity-80 font-semibold">
              <Phone className="w-2.5 h-2.5" />
              <span>Mobile Number:</span>
            </span>
            <strong className="font-mono">{member.phone || 'N/A'}</strong>
          </div>

          <div
            className={`flex justify-between items-center border-b pb-0.5 gap-1 ${
              isDarkBack ? 'border-white/15' : 'border-slate-200'
            }`}
          >
            <span className="flex items-center gap-1 opacity-80 font-semibold shrink-0">
              <Mail className="w-2.5 h-2.5" />
              <span>Email:</span>
            </span>
            <strong className="font-mono truncate">{member.email || school.email || 'N/A'}</strong>
          </div>

          <div
            className={`border-b pb-0.5 ${
              isDarkBack ? 'border-white/15' : 'border-slate-200'
            }`}
          >
            <span className="opacity-80 font-semibold">Permanent Address: </span>
            <strong className="leading-tight">{permanentAddr}</strong>
          </div>

          <div
            className={`flex justify-between items-center border-b pb-0.5 ${
              isDarkBack ? 'border-white/15' : 'border-slate-200'
            }`}
          >
            <span className="opacity-80 font-semibold">Emergency Contact:</span>
            <strong className={`font-mono ${isDarkBack ? 'text-amber-200' : 'text-rose-700'}`}>
              {emergencyNo}
            </strong>
          </div>

          <div className="grid grid-cols-2 gap-1 text-[8.5px]">
            <div>
              <span className="opacity-80 font-semibold">Issue Date: </span>
              <strong className="font-mono">{issueDate}</strong>
            </div>
            <div className="text-right">
              <span className="opacity-80 font-semibold">School Tel: </span>
              <strong className="font-mono">{school.phone || 'N/A'}</strong>
            </div>
          </div>
        </div>

        {/* Lost Card Return Instructions */}
        <div
          className={`rounded-lg p-1.5 text-[7.5px] leading-snug border border-dashed ${
            isDarkBack
              ? 'bg-black/20 border-white/30 text-slate-100'
              : 'bg-amber-50/60 border-slate-400 text-slate-800'
          }`}
        >
          <p className="font-bold flex items-center gap-1">
            <ShieldCheck className="w-2.5 h-2.5 shrink-0 text-amber-400" />
            <span>হারিয়ে গেলে ফেরত দেওয়ার নির্দেশনা / Return Policy:</span>
          </p>
          <p>
            এই কার্ডটি প্রতিষ্ঠানের সম্পত্তি। হারিয়ে গেলে অনুগ্রহ করে{' '}
            <strong>{school.nameEn || 'স্কুল অফিসে'}</strong> ফেরত দিন অথবা যোগাযোগ করুন:{' '}
            <strong className="font-mono">{school.phone || '+880 1700-000000'}</strong>।
          </p>
        </div>

        {/* Principal Signature */}
        <div className="pt-0.5 flex items-end justify-between">
          <span
            className={`text-[7.5px] font-semibold uppercase tracking-wide ${
              isDarkBack ? 'text-slate-200' : 'text-slate-500'
            }`}
          >
            Gate QR Attendance
          </span>
          <PrincipalSignatureBlock
            principalName={school.principalNameEn}
            signatureUrl={school.principalSignatureUrl}
            darkBg={isDarkBack}
            accentColor={palette.primary}
          />
        </div>
      </div>

      {/* Bottom Footer Bar */}
      <div
        className="py-1 text-center text-[8px] font-bold tracking-wider shrink-0"
        style={{
          backgroundColor: isDarkBack ? 'rgba(0,0,0,0.28)' : palette.primary,
          borderTop: `2px solid ${palette.secondary}`,
          color: '#FFFFFF',
        }}
      >
        {school.website || school.email || school.phone || 'SMART SCHOOL BD'}
      </div>
    </div>
  );
};
