import React, { useEffect, useRef, useState } from 'react';
import { SchoolProfile, Student } from '../../types';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { formatGroupName } from '../../utils/i18n';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';
import { ClassTeacherSignatureDisplay } from '../common/ClassTeacherSignatureDisplay';
import { StorageService } from '../../services/storage';

export type LandscapeCertDocType = 'testimonial' | 'transfer' | 'character' | 'bonafide';

interface LandscapeCertificate3x2Props {
  docType: LandscapeCertDocType;
  school: SchoolProfile;
  student: Student;
  scopedStudentId: string;
  activeSchoolCode: string;
  serialNo: string;
  issueDate: string;
  qrUrl: string;
  language: 'bn' | 'en';
  certSize: 'a4_landscape' | 'fourteen_by_eleven';
}

const BASE_WIDTH = 1050; // Exact 3:2 ratio matching 1536 x 1024 px (1536 / 1024 = 1.5)
const BASE_HEIGHT = 700;

interface ThemeSpec {
  bgGradient: string;
  primary: string;
  secondary: string;
  accent: string;
  accentLight: string;
  tableBorder: string;
  tableHeaderBg: string;
  ribbonColorA: string;
  ribbonColorB: string;
  sealRing: string;
  badgeLabel: string;
  titleEn: string;
  subtitleBn: string;
  footerTextEn: string;
  footerTextBn: string;
  leftSigEn: string;
  leftSigBn: string;
}

export const LandscapeCertificate3x2: React.FC<LandscapeCertificate3x2Props> = ({
  docType,
  school,
  student,
  scopedStudentId,
  activeSchoolCode,
  serialNo,
  issueDate,
  qrUrl,
  language,
  certSize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const availableWidth = containerRef.current.clientWidth;
      if (availableWidth > 0) {
        setScale(Math.min(1, availableWidth / BASE_WIDTH));
      }
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  const formattedSerial =
    docType === 'transfer'
      ? serialNo.replace(/^AC/, 'TC')
      : docType === 'character'
      ? serialNo.replace(/^AC/, 'CC')
      : docType === 'bonafide'
      ? serialNo.replace(/^AC/, 'BON')
      : serialNo.replace(/^AC/, 'TST');

  const themes: Record<LandscapeCertDocType, ThemeSpec> = {
    testimonial: {
      bgGradient: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, #eff6ff 100%)',
      primary: '#082567',
      secondary: '#0C327A',
      accent: '#D4AF37',
      accentLight: '#FDE68A',
      tableBorder: 'border-blue-100',
      tableHeaderBg: 'bg-white/75',
      ribbonColorA: '#DC2626',
      ribbonColorB: '#B91C1C',
      sealRing: '#006A4E',
      badgeLabel: 'ROYAL NAVY & GOLD',
      titleEn: 'Testimonial Certificate',
      subtitleBn: 'প্রাতিষ্ঠানিক প্রশংসাপত্র • Institutional Testimonial',
      footerTextEn: `This is to certify that the above mentioned student has successfully studied in this institution with exemplary conduct and satisfactory academic record under ${school.nameEn}.`,
      footerTextBn: `প্রত্যয়ন করা যাচ্ছে যে, উল্লিখিত শিক্ষার্থী অত্র প্রতিষ্ঠানে নিয়মিত অধ্যয়ন করেছে এবং তার আচার-আচরণ, নৈতিক চরিত্র ও একাডেমিক ফলাফল অত্যন্ত সন্তোষজনক।`,
      leftSigEn: 'Class Teacher / Prepared By',
      leftSigBn: 'শ্রেণি শিক্ষক / যাচাইকারী কর্মকর্তা',
    },
    transfer: {
      bgGradient: 'linear-gradient(135deg, #fffaf5 0%, #ffffff 52%, #fef2f2 100%)',
      primary: '#7F1D1D',
      secondary: '#991B1B',
      accent: '#C58B1B',
      accentLight: '#FDE68A',
      tableBorder: 'border-rose-200/80',
      tableHeaderBg: 'bg-rose-50/35',
      ribbonColorA: '#1E3A8A',
      ribbonColorB: '#172554',
      sealRing: '#7F1D1D',
      badgeLabel: 'CRIMSON HERITAGE TC',
      titleEn: 'Transfer Certificate (TC)',
      subtitleBn: 'বিদ্যালয় ত্যাগের ছাড়পত্র • Official Transfer Certificate',
      footerTextEn: `This Transfer Certificate is issued upon guardian application after verifying all institutional dues are cleared and official registers of ${school.nameEn}.`,
      footerTextBn: `অভিভাবকের আবেদনের প্রেক্ষিতে এবং বিদ্যালয়ের সকল পাওনা ও বকেয়া পরিশোধ সাপেক্ষে অত্র ছাড়পত্র (Transfer Certificate) প্রদান করা হলো।`,
      leftSigEn: 'Head Clerk / Accountant',
      leftSigBn: 'প্রধান সহকারী / হিসাবরক্ষক',
    },
    character: {
      bgGradient: 'linear-gradient(135deg, #f2fbf6 0%, #ffffff 50%, #ecfdf5 100%)',
      primary: '#064E3B',
      secondary: '#047857',
      accent: '#B45309',
      accentLight: '#FCD34D',
      tableBorder: 'border-emerald-200/80',
      tableHeaderBg: 'bg-emerald-50/35',
      ribbonColorA: '#047857',
      ribbonColorB: '#065F46',
      sealRing: '#064E3B',
      badgeLabel: 'EMERALD LAUREL CREST',
      titleEn: 'Character Certificate',
      subtitleBn: 'চারিত্রিক সনদপত্র • Official Character Certificate',
      footerTextEn: `To the best of my knowledge and institutional records, he/she bears a sublime moral character and never participated in any activity against institutional discipline.`,
      footerTextBn: `আমার জানামতে ও বিদ্যালয়ের নথিপত্র অনুযায়ী সে উত্তম নৈতিক চরিত্র ও শৃঙ্খলাপরায়ণ আচরণের অধিকারী। তার উজ্জ্বল ভবিষ্যৎ কামনা করছি।`,
      leftSigEn: 'Moral & Discipline Proctor',
      leftSigBn: 'শৃঙ্খলা ও নথিপত্র নিরীক্ষক',
    },
    bonafide: {
      bgGradient: 'linear-gradient(135deg, #eef2ff 0%, #ffffff 52%, #f0fdfa 100%)',
      primary: '#312E81',
      secondary: '#0F766E',
      accent: '#D4AF37',
      accentLight: '#99F6E4',
      tableBorder: 'border-indigo-200/80',
      tableHeaderBg: 'bg-indigo-50/35',
      ribbonColorA: '#0D9488',
      ribbonColorB: '#115E59',
      sealRing: '#312E81',
      badgeLabel: 'INDIGO TEAL VERIFIED',
      titleEn: 'Bonafide Certificate',
      subtitleBn: 'অধ্যয়নরত প্রত্যয়নপত্র • Bonafide Student Certificate',
      footerTextEn: `This is to certify that the above mentioned student is a regular and bonafide student currently enrolled at ${school.nameEn}, valid for passport, scholarship & official use.`,
      footerTextBn: `প্রত্যয়ন করা যাচ্ছে যে, উল্লিখিত শিক্ষার্থী অত্র প্রতিষ্ঠানের একজন নিয়মিত ও বৈধ অধ্যয়নরত শিক্ষার্থী। অফিসিয়াল ও প্রাতিষ্ঠানিক কাজে ব্যবহারের জন্য এই সনদ প্রদান করা হলো।`,
      leftSigEn: 'Admission & Office Registrar',
      leftSigBn: 'ভর্তি ও অফিস নিবন্ধক',
    },
  };

  const t = themes[docType];
  const verifySite = (school.website || '').trim() || `Code: ${activeSchoolCode}`;

  const renderBackgroundSvg = () => {
    if (docType === 'testimonial') {
      // DESIGN 1: Royal Navy-Gold Swept Diagonal Corners + Architectural Silhouettes
      return (
        <svg viewBox="0 0 1536 1024" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="tstNavy" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#061D4F" />
              <stop offset="65%" stopColor="#0C327A" />
              <stop offset="100%" stopColor="#13459E" />
            </linearGradient>
            <linearGradient id="tstGold" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#B8860B" />
              <stop offset="45%" stopColor="#F5D77F" />
              <stop offset="75%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#AA771C" />
            </linearGradient>
          </defs>
          <polygon points="0,300 1536,0 1536,380 0,680" fill="#EFF6FF" opacity="0.5" />
          {/* Top-Left Corner Sweep (compact so it frames logo cleanly) */}
          <path d="M 0 0 L 340 0 C 210 55, 95 160, 0 320 Z" fill="url(#tstNavy)" />
          <path d="M 0 225 C 80 130, 175 50, 280 0 L 322 0 C 202 60, 98 152, 0 278 Z" fill="url(#tstGold)" />
          {/* Bottom-Right Corner Sweep (tucked cleanly below signature area) */}
          <path d="M 1536 1024 L 1185 1024 C 1315 970, 1435 875, 1536 725 Z" fill="url(#tstNavy)" />
          <path d="M 1536 805 C 1455 900, 1355 970, 1245 1024 L 1295 1024 C 1395 965, 1475 895, 1536 838 Z" fill="url(#tstGold)" />
          {/* Faint Memorial Silhouette Bottom-Left */}
          <g transform="translate(36, 725)" opacity="0.14" fill="#3B6CB7">
            <polygon points="105,0 116,250 94,250" />
            <polygon points="105,18 136,250 74,250" opacity="0.65" />
            <polygon points="105,55 160,250 50,250" opacity="0.5" />
            <polygon points="105,105 182,250 28,250" opacity="0.35" />
            <rect x="8" y="250" width="194" height="7" rx="2" />
          </g>
          {/* Double Gold Frame */}
          <rect x="20" y="20" width="1496" height="984" fill="none" stroke="url(#tstGold)" strokeWidth="5" rx="6" />
          <rect x="31" y="31" width="1474" height="962" fill="none" stroke="#D4AF37" strokeWidth="1.5" rx="4" />
        </svg>
      );
    }

    if (docType === 'transfer') {
      // DESIGN 2: Imperial Crimson & Champagne Gold — 4-Corner Chamfered Rosettes + Guilloché Registry Border
      return (
        <svg viewBox="0 0 1536 1024" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="tcCrimson" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#691212" />
              <stop offset="55%" stopColor="#991B1B" />
              <stop offset="100%" stopColor="#B91C1C" />
            </linearGradient>
            <linearGradient id="tcGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#B45309" />
              <stop offset="50%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#92400E" />
            </linearGradient>
          </defs>
          {/* Subtle top & bottom crimson header strips */}
          <rect x="0" y="0" width="1536" height="22" fill="url(#tcCrimson)" />
          <rect x="0" y="1002" width="1536" height="22" fill="url(#tcCrimson)" />
          {/* 4-Corner Stepped Heraldic Shields */}
          <path d="M 24 24 L 180 24 L 145 58 L 58 58 L 58 145 L 24 180 Z" fill="url(#tcCrimson)" />
          <path d="M 1512 24 L 1356 24 L 1391 58 L 1478 58 L 1478 145 L 1512 180 Z" fill="url(#tcCrimson)" />
          <path d="M 24 1000 L 180 1000 L 145 966 L 58 966 L 58 879 L 24 844 Z" fill="url(#tcCrimson)" />
          <path d="M 1512 1000 L 1356 1000 L 1391 966 L 1478 966 L 1478 879 L 1512 844 Z" fill="url(#tcCrimson)" />
          {/* Outer & Inner Security Guilloche Lines */}
          <rect x="24" y="24" width="1488" height="976" fill="none" stroke="url(#tcGold)" strokeWidth="4.5" />
          <rect x="36" y="36" width="1464" height="952" fill="none" stroke="#991B1B" strokeWidth="1.5" strokeDasharray="8 4" />
          <rect x="44" y="44" width="1448" height="936" fill="none" stroke="#D97706" strokeWidth="1" opacity="0.65" />
          {/* Corner Gold Diamonds */}
          <polygon points="44,44 64,44 44,64" fill="url(#tcGold)" />
          <polygon points="1492,44 1472,44 1492,64" fill="url(#tcGold)" />
          <polygon points="44,980 64,980 44,960" fill="url(#tcGold)" />
          <polygon points="1492,980 1472,980 1492,960" fill="url(#tcGold)" />
        </svg>
      );
    }

    if (docType === 'character') {
      // DESIGN 3: Royal Emerald & Antique Bronze — Ornamental Arched Frame + Botanical Flourish Corners
      return (
        <svg viewBox="0 0 1536 1024" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ccEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#064E3B" />
              <stop offset="50%" stopColor="#047857" />
              <stop offset="100%" stopColor="#065F46" />
            </linearGradient>
            <linearGradient id="ccBronze" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#92400E" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
          </defs>
          {/* Soft Botanical Aura */}
          <ellipse cx="768" cy="512" rx="640" ry="380" fill="#ECFDF5" opacity="0.55" />
          {/* Ornamental Outer Rounded Border */}
          <rect x="22" y="22" width="1492" height="980" rx="28" fill="none" stroke="url(#ccEmerald)" strokeWidth="7" />
          <rect x="36" y="36" width="1464" height="952" rx="20" fill="none" stroke="url(#ccBronze)" strokeWidth="2.5" />
          <rect x="46" y="46" width="1444" height="932" rx="14" fill="none" stroke="#047857" strokeWidth="1" opacity="0.4" />
          {/* Top-Left & Top-Right Botanical Corner Medallions */}
          <g fill="url(#ccEmerald)" opacity="0.92">
            <path d="M 22 145 L 22 50 Q 22 22 50 22 L 155 22 Q 95 62 22 145 Z" />
            <path d="M 1514 145 L 1514 50 Q 1514 22 1486 22 L 1381 22 Q 1441 62 1514 145 Z" />
            <path d="M 22 879 L 22 974 Q 22 1002 50 1002 L 155 1002 Q 95 962 22 879 Z" />
            <path d="M 1514 879 L 1514 974 Q 1514 1002 1486 1002 L 1381 1002 Q 1441 962 1514 879 Z" />
          </g>
          {/* Decorative Bronze Arc Accents */}
          <path d="M 55 130 Q 85 75 145 52" fill="none" stroke="url(#ccBronze)" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 1481 130 Q 1451 75 1391 52" fill="none" stroke="url(#ccBronze)" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 55 894 Q 85 949 145 972" fill="none" stroke="url(#ccBronze)" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 1481 894 Q 1451 949 1391 972" fill="none" stroke="url(#ccBronze)" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    }

    // DESIGN 4: BONAFIDE — Imperial Indigo & Teal Geometric Architectural Bands
    return (
      <svg viewBox="0 0 1536 1024" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bonIndigo" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1E1B4B" />
            <stop offset="50%" stopColor="#312E81" />
            <stop offset="100%" stopColor="#0F766E" />
          </linearGradient>
          <linearGradient id="bonGold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0D9488" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#312E81" />
          </linearGradient>
        </defs>
        {/* Top & Bottom Precision Architectural Bands */}
        <path d="M 0 0 L 1536 0 L 1536 48 Q 1150 22 768 42 Q 384 62 0 34 Z" fill="url(#bonIndigo)" opacity="0.92" />
        <path d="M 0 34 Q 384 62 768 42 Q 1150 22 1536 48 L 1536 56 Q 1150 30 768 50 Q 384 70 0 42 Z" fill="#F59E0B" />
        <path d="M 0 1024 L 1536 1024 L 1536 984 Q 1150 1006 768 986 Q 384 966 0 992 Z" fill="url(#bonIndigo)" opacity="0.92" />
        <path d="M 0 984 Q 384 958 768 978 Q 1150 998 1536 976 L 1536 984 Q 1150 1006 768 986 Q 384 966 0 992 Z" fill="#F59E0B" />
        {/* Side Geometric Pillar Frame */}
        <rect x="24" y="54" width="1488" height="916" fill="none" stroke="url(#bonGold)" strokeWidth="3" rx="10" />
        <rect x="34" y="64" width="1468" height="896" fill="none" stroke="#6366F1" strokeWidth="1" opacity="0.4" rx="6" />
        {/* Side Accent Pillars */}
        <rect x="24" y="220" width="8" height="584" fill="#0F766E" rx="4" />
        <rect x="1504" y="220" width="8" height="584" fill="#312E81" rx="4" />
      </svg>
    );
  };

  const renderTitleBanner = () => {
    if (docType === 'testimonial') {
      // Scalloped Navy-Gold Plaque (generous height so 2 lines sit cleanly inside!)
      return (
        <div className="relative flex items-center justify-center w-[510px] h-[74px]">
          <svg viewBox="0 0 510 74" className="absolute inset-0 w-full h-full drop-shadow-sm">
            <path
              d="M 22 5 Q 42 5 48 16 L 462 16 Q 468 5 488 5 Q 506 37 488 69 Q 468 69 462 58 L 48 58 Q 42 69 22 69 Q 4 37 22 5 Z"
              fill="#082567"
              stroke="#D4AF37"
              strokeWidth="3.5"
            />
            <path
              d="M 28 11 Q 45 11 51 21 L 459 21 Q 465 11 482 11 Q 497 37 482 63 Q 465 63 459 53 L 51 53 Q 45 63 28 63 Q 13 37 28 11 Z"
              fill="none"
              stroke="#F5D77F"
              strokeWidth="1"
              opacity="0.7"
            />
          </svg>
          <div className="relative z-10 text-center px-10">
            <div className="text-[21px] font-serif font-bold text-white tracking-wide leading-tight">{t.titleEn}</div>
            <div className="text-[11px] font-semibold text-amber-200 tracking-wide leading-tight mt-0.5">{t.subtitleBn}</div>
          </div>
        </div>
      );
    }

    if (docType === 'transfer') {
      // Pointed Crimson Ribbon Banner with Gold Trim
      return (
        <div className="relative flex items-center justify-center w-[520px] h-[72px]">
          <svg viewBox="0 0 520 72" className="absolute inset-0 w-full h-full drop-shadow-sm">
            <polygon points="8,12 48,12 60,4 460,4 472,12 512,12 494,36 512,60 472,60 460,68 60,68 48,60 8,60 26,36" fill="#7F1D1D" stroke="#FBBF24" strokeWidth="2.8" />
            <rect x="64" y="10" width="392" height="52" rx="4" fill="none" stroke="#FDE68A" strokeWidth="1" opacity="0.65" />
          </svg>
          <div className="relative z-10 text-center px-12">
            <div className="text-[21px] font-serif font-bold text-white tracking-wide leading-tight">{t.titleEn}</div>
            <div className="text-[11px] font-semibold text-amber-200 tracking-wide leading-tight mt-0.5">{t.subtitleBn}</div>
          </div>
        </div>
      );
    }

    if (docType === 'character') {
      // Rounded Emerald & Antique Gold Arch Plaque
      return (
        <div className="relative flex items-center justify-center w-[500px] h-[74px]">
          <svg viewBox="0 0 500 74" className="absolute inset-0 w-full h-full drop-shadow-sm">
            <rect x="18" y="6" width="464" height="62" rx="31" fill="#064E3B" stroke="#F59E0B" strokeWidth="3.2" />
            <rect x="26" y="12" width="448" height="50" rx="25" fill="none" stroke="#FDE68A" strokeWidth="1" opacity="0.7" />
            <circle cx="44" cy="37" r="5" fill="#FBBF24" />
            <circle cx="456" cy="37" r="5" fill="#FBBF24" />
          </svg>
          <div className="relative z-10 text-center px-10">
            <div className="text-[21px] font-serif font-bold text-white tracking-wide leading-tight">{t.titleEn}</div>
            <div className="text-[11px] font-semibold text-emerald-100 tracking-wide leading-tight mt-0.5">{t.subtitleBn}</div>
          </div>
        </div>
      );
    }

    // BONAFIDE: Angled Geometric Indigo-Teal Hexagonal Plate
    return (
      <div className="relative flex items-center justify-center w-[510px] h-[72px]">
        <svg viewBox="0 0 510 72" className="absolute inset-0 w-full h-full drop-shadow-sm">
          <defs>
            <linearGradient id="bonBannerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1E1B4B" />
              <stop offset="50%" stopColor="#312E81" />
              <stop offset="100%" stopColor="#0F766E" />
            </linearGradient>
          </defs>
          <polygon points="32,6 478,6 502,36 478,66 32,66 8,36" fill="url(#bonBannerGrad)" stroke="#F59E0B" strokeWidth="3" />
          <polygon points="38,12 472,12 492,36 472,60 38,60 18,36" fill="none" stroke="#99F6E4" strokeWidth="1" opacity="0.7" />
        </svg>
        <div className="relative z-10 text-center px-12">
          <div className="text-[21px] font-serif font-bold text-white tracking-wide leading-tight">{t.titleEn}</div>
          <div className="text-[11px] font-semibold text-teal-100 tracking-wide leading-tight mt-0.5">{t.subtitleBn}</div>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="w-full flex justify-center print:block">
      <div
        className="landscape-cert-3x2-outer relative"
        style={{
          width: `${BASE_WIDTH * scale}px`,
          height: `${BASE_HEIGHT * scale}px`,
        }}
      >
        <div
          data-cert-size={certSize}
          data-cert-design={docType}
          className="landscape-cert-3x2 relative overflow-hidden bg-white text-slate-900 shadow-2xl select-none"
          style={{
            width: `${BASE_WIDTH}px`,
            height: `${BASE_HEIGHT}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: t.bgGradient,
          }}
        >
          {/* Design-Specific SVG Background Layer */}
          {renderBackgroundSvg()}

          {/* Center Watermark */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.045] pointer-events-none">
            <img src={school.logoUrl || DEFAULT_SCHOOL_LOGO} alt="" className="w-[330px] h-[330px] object-contain" />
          </div>

          {/* Foreground Content Grid */}
          <div className="relative z-10 h-full flex flex-col justify-between px-12 py-8">
            {/* ROW 1: Top Header */}
            <div className="grid grid-cols-3 items-start gap-4">
              {/* Left: Institutional Brand Emblem */}
              <div className={`flex items-center gap-3 pt-2 ${docType === 'testimonial' ? 'pl-14' : 'pl-4'}`}>
                <div
                  className="w-15 h-15 rounded-xl bg-white/95 border-2 p-1 shadow-xs flex items-center justify-center shrink-0"
                  style={{ borderColor: t.accent }}
                >
                  <img src={school.logoUrl || DEFAULT_SCHOOL_LOGO} alt={school.nameEn} className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0 bg-white/80 px-2 py-1 rounded-lg">
                  <div className="text-[14px] font-black leading-tight truncate" style={{ color: t.primary }}>
                    {activeSchoolCode}
                  </div>
                  <div className="text-[11px] font-bold text-slate-700 leading-tight mt-0.5">
                    EIIN: {school.eiin || 'N/A'}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                    Est. {school.establishedYear || '2005'}
                  </div>
                </div>
              </div>

              {/* Center: Official Circular Seal + Institution Name */}
              <div className="flex flex-col items-center text-center pt-1">
                <div
                  className="w-[74px] h-[74px] rounded-full border-[3px] bg-white p-1 shadow-xs flex items-center justify-center"
                  style={{ borderColor: t.sealRing }}
                >
                  <div
                    className="w-full h-full rounded-full border overflow-hidden flex items-center justify-center bg-slate-50"
                    style={{ borderColor: t.accent }}
                  >
                    <img src={school.logoUrl || DEFAULT_SCHOOL_LOGO} alt={school.nameEn} className="w-12 h-12 object-contain" />
                  </div>
                </div>
                <h1 className="mt-1.5 text-[18px] font-black leading-tight tracking-tight" style={{ color: t.primary }}>
                  {school.nameBn || school.nameEn}
                </h1>
                <h2 className="text-[11.5px] font-extrabold text-slate-800 uppercase tracking-wider leading-tight">
                  {school.nameEn}
                </h2>
                <p className="text-[10px] text-slate-600 font-medium mt-0.5 truncate max-w-[340px]">
                  {school.addressBn || school.addressEn}
                </p>
              </div>

              {/* Right: Slogan + Serial & Issue Date */}
              <div className="text-right pr-3 pt-2 flex flex-col items-end">
                <div className="text-[17px] font-black leading-snug" style={{ color: t.primary }}>
                  {school.mottoBn || 'শিক্ষা নিয়ে গড়ব দেশ'}
                </div>
                <div className="text-[14px] font-extrabold leading-tight" style={{ color: t.secondary }}>
                  স্মার্ট হবে বাংলাদেশ
                </div>
                <svg width="144" height="10" viewBox="0 0 150 12" className="mt-0.5">
                  <path d="M 8 9 Q 75 1 142 6" stroke={t.accent} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 28 11 Q 82 5 130 9" stroke={t.primary} strokeWidth="1.3" fill="none" strokeLinecap="round" />
                </svg>
                <div
                  className="mt-1.5 text-[10.5px] font-mono text-slate-700 bg-white/90 px-2.5 py-1 rounded border"
                  style={{ borderColor: t.accent }}
                >
                  <div>
                    Sl No: <strong style={{ color: t.primary }}>{formattedSerial}</strong>
                  </div>
                  <div>
                    Date: <strong className="text-slate-900">{issueDate}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* ROW 2: Design-Specific Banner + Star Divider */}
            <div className="flex flex-col items-center">
              {renderTitleBanner()}
              <div className="flex items-center justify-center gap-3 w-[340px] mt-1.5">
                <div className="h-[1.5px] flex-1" style={{ background: `linear-gradient(to right, transparent, ${t.accent})` }} />
                <span className="text-sm leading-none" style={{ color: t.accent }}>
                  {docType === 'character' ? '✦' : docType === 'transfer' ? '❖' : docType === 'bonafide' ? '◈' : '★'}
                </span>
                <div className="h-[1.5px] flex-1" style={{ background: `linear-gradient(to left, transparent, ${t.accent})` }} />
              </div>
            </div>

            {/* ROW 3: Student Photo · Student Particulars · QR Verification */}
            <div className="grid grid-cols-[152px_1fr_152px] items-center gap-6 px-3">
              {/* Left: Student Portrait Frame */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-[140px] h-[168px] border-[2.5px] p-1 bg-white shadow-sm overflow-hidden ${
                    docType === 'character'
                      ? 'rounded-t-[68px] rounded-b-2xl'
                      : docType === 'transfer'
                      ? 'rounded-lg'
                      : 'rounded-2xl'
                  }`}
                  style={{ borderColor: t.primary }}
                >
                  {student.photoUrl ? (
                    <img
                      src={student.photoUrl}
                      alt={student.nameEn}
                      className={`w-full h-full object-cover bg-sky-500 ${
                        docType === 'character'
                          ? 'rounded-t-[62px] rounded-b-xl'
                          : docType === 'transfer'
                          ? 'rounded-md'
                          : 'rounded-xl'
                      }`}
                    />
                  ) : (
                    <div
                      className={`w-full h-full flex flex-col items-center justify-center text-white ${
                        docType === 'character'
                          ? 'rounded-t-[62px] rounded-b-xl'
                          : docType === 'transfer'
                          ? 'rounded-md'
                          : 'rounded-xl'
                      }`}
                      style={{ background: `linear-gradient(180deg, ${t.secondary}, ${t.primary})` }}
                    >
                      <span className="text-4xl font-black">{student.nameEn.charAt(0)}</span>
                      <span className="text-[10px] font-semibold mt-1 opacity-90">Roll {student.roll}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Center: Particulars Key : Value Table */}
              <div className={`rounded-xl px-4 py-2 border ${t.tableBorder} ${t.tableHeaderBg}`}>
                <table className="w-full text-[13px] leading-[1.55] font-serif text-slate-900">
                  <tbody>
                    <tr>
                      <td className="w-[144px] font-bold" style={{ color: t.primary }}>Student Name</td>
                      <td className="w-4 font-bold" style={{ color: t.primary }}>:</td>
                      <td className="font-bold text-slate-950">
                        {student.nameEn}
                        {student.nameBn ? (
                          <span className="font-sans text-[11.5px] font-semibold text-slate-700 ml-1.5">
                            ({student.nameBn})
                          </span>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-bold" style={{ color: t.primary }}>Father&apos;s Name</td>
                      <td className="font-bold" style={{ color: t.primary }}>:</td>
                      <td className="font-semibold">{student.fatherNameEn || student.fatherNameBn || '—'}</td>
                    </tr>
                    <tr>
                      <td className="font-bold" style={{ color: t.primary }}>Mother&apos;s Name</td>
                      <td className="font-bold" style={{ color: t.primary }}>:</td>
                      <td className="font-semibold">{student.motherNameEn || student.motherNameBn || '—'}</td>
                    </tr>
                    <tr>
                      <td className="font-bold" style={{ color: t.primary }}>Roll No</td>
                      <td className="font-bold" style={{ color: t.primary }}>:</td>
                      <td className="font-mono font-bold text-slate-950">
                        {student.roll}
                        {student.dob ? (
                          <span className="font-sans text-[11px] font-semibold text-slate-600 ml-3">
                            DOB: {student.dob}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-bold" style={{ color: t.primary }}>Student ID</td>
                      <td className="font-bold" style={{ color: t.primary }}>:</td>
                      <td className="font-mono font-bold" style={{ color: t.secondary }}>{scopedStudentId}</td>
                    </tr>
                    <tr>
                      <td className="font-bold" style={{ color: t.primary }}>Class &amp; Section</td>
                      <td className="font-bold" style={{ color: t.primary }}>:</td>
                      <td className="font-bold">
                        {student.className} (Sec: {student.section})
                        {['Class 9', 'Class 10'].includes(student.className) && student.group
                          ? ` · ${formatGroupName(student.group, language)}`
                          : ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-bold" style={{ color: t.primary }}>Institute</td>
                      <td className="font-bold" style={{ color: t.primary }}>:</td>
                      <td className="font-semibold truncate max-w-[350px]">{school.nameEn}</td>
                    </tr>
                    <tr>
                      <td className="font-bold" style={{ color: t.primary }}>
                        {docType === 'transfer' ? 'Dues / Status' : docType === 'bonafide' ? 'Enrollment Status' : 'Academic Session'}
                      </td>
                      <td className="font-bold" style={{ color: t.primary }}>:</td>
                      <td className="font-bold">
                        {docType === 'transfer' ? (
                          <span className="font-sans text-[11.5px] text-emerald-700">
                            Full Dues Cleared · Session {student.session || school.currentSession || '2026'}
                          </span>
                        ) : docType === 'bonafide' ? (
                          <span className="font-sans text-[11.5px] text-teal-700">
                            Active &amp; Regular · Session {student.session || school.currentSession || '2026'}
                          </span>
                        ) : (
                          <span>{student.session || school.currentSession || '2026'}</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Right: QR Verification Box */}
              <div className="flex flex-col items-center text-center">
                <div
                  className={`w-[134px] h-[134px] border-[2.5px] bg-white p-2 shadow-xs flex items-center justify-center ${
                    docType === 'transfer' ? 'rounded-lg' : 'rounded-2xl'
                  }`}
                  style={{ borderColor: t.primary }}
                >
                  {qrUrl ? (
                    <img src={qrUrl} alt="Student Verification QR" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-[10px] text-slate-400 font-mono">QR Generating...</div>
                  )}
                </div>
                <div className="mt-1.5 text-[11.5px] font-bold leading-tight" style={{ color: t.primary }}>
                  Verify Online
                </div>
                <div className="text-[10px] font-semibold truncate max-w-[146px]" style={{ color: t.secondary }}>
                  {verifySite}
                </div>
              </div>
            </div>

            {/* ROW 4: Formal Certification Statement */}
            <div className="px-14 text-center">
              <p className="font-serif italic text-[13.5px] leading-snug font-medium" style={{ color: t.primary }}>
                {t.footerTextEn}
              </p>
              <p className="text-[11px] text-slate-700 font-medium mt-1">
                {t.footerTextBn}
              </p>
            </div>

            {/* ROW 5: Bottom Signatures & Design-Specific Ribbon Foil Seal */}
            <div className="grid grid-cols-3 items-end px-12 pb-3">
              {/* Left Signature */}
              <div className="flex flex-col items-center text-center">
                {docType !== 'transfer' ? (
                  <div className="w-52 bg-white/75 px-2 rounded-t">
                    <ClassTeacherSignatureDisplay
                      school={school}
                      className={student.className}
                      section={student.section}
                      staffList={StorageService.getStaff()}
                      fallbackText=""
                      heightClass="h-10"
                      imgClassName="max-h-9 max-w-[160px] object-contain mx-auto"
                      textClassName="font-serif italic font-bold text-sm text-slate-800 truncate"
                    />
                  </div>
                ) : (
                  <div className="h-8 flex items-end justify-center font-serif italic text-base text-slate-700" />
                )}
                <div className="w-52 border-t-[1.5px] pt-1 bg-white/75 rounded-b px-2" style={{ borderColor: t.primary }}>
                  <div className="text-[12.5px] font-bold text-slate-900">{t.leftSigEn}</div>
                  <div className="text-[10px] text-slate-600">{t.leftSigBn}</div>
                </div>
              </div>

              {/* Center Foil Seal with Design-Matched Ribbons */}
              <div className="flex flex-col items-center justify-center -mb-2">
                <svg viewBox="0 0 140 136" className="w-[98px] h-[96px] drop-shadow-sm">
                  <defs>
                    <radialGradient id={`sealFace_${docType}`} cx="40%" cy="35%" r="65%">
                      <stop offset="0%" stopColor="#FFF4B8" />
                      <stop offset="45%" stopColor="#E6B94D" />
                      <stop offset="100%" stopColor="#A67415" />
                    </radialGradient>
                  </defs>
                  {/* Tailored Ribbons */}
                  <polygon points="44,86 30,132 48,120 58,134 68,92" fill={t.ribbonColorA} />
                  <polygon points="96,86 110,132 92,120 82,134 72,92" fill={t.ribbonColorB} />
                  {/* Seal Face */}
                  {docType === 'bonafide' ? (
                    <polygon points="70,8 84,18 100,15 106,30 118,40 112,56 118,72 104,80 98,94 82,92 70,100 58,92 42,94 36,80 22,72 28,56 22,40 34,30 40,15 56,18" fill={`url(#sealFace_${docType})`} stroke="#FFF5CC" strokeWidth="1.5" />
                  ) : (
                    <>
                      <circle cx="70" cy="52" r="43" fill="#B8860B" />
                      <circle cx="70" cy="52" r="40" fill={`url(#sealFace_${docType})`} stroke="#FFF5CC" strokeWidth="1.5" />
                    </>
                  )}
                  <circle cx="70" cy="52" r="32" fill="none" stroke="#8B5E0B" strokeWidth="1.4" strokeDasharray="3 2" />
                  <path
                    d="M 54 42 Q 62 37 70 42 Q 78 37 86 42 L 86 58 Q 78 53 70 58 Q 62 53 54 58 Z"
                    fill="none"
                    stroke="#6B4405"
                    strokeWidth="2"
                  />
                  <line x1="70" y1="42" x2="70" y2="58" stroke="#6B4405" strokeWidth="1.8" />
                  <text
                    x="70"
                    y="73"
                    textAnchor="middle"
                    fill="#5C3A04"
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {activeSchoolCode.slice(0, 8)}
                  </text>
                </svg>
              </div>

              {/* Right Signature: Principal / Headmaster */}
              <div className="flex flex-col items-center text-center">
                <div className="w-54 bg-white/80 px-2 rounded-t">
                  <PrincipalSignatureDisplay
                    school={school}
                    fallbackText="Principal / Headmaster"
                    heightClass="h-11"
                    imgClassName="max-h-10 max-w-[180px] object-contain mx-auto"
                    textClassName="font-serif italic font-bold text-[17px] truncate max-w-[220px]"
                    textStyle={{ color: t.primary }}
                  />
                </div>
                <div className="w-54 border-t-[1.5px] pt-1 bg-white/85 rounded-b px-2" style={{ borderColor: t.primary }}>
                  <div className="text-[12.5px] font-bold text-slate-900">Principal / Headmaster</div>
                  {(school.principalNameEn || school.principalNameBn) && school.principalSignatureUrl && (
                    <div className="text-[10px] font-semibold text-slate-700 truncate">
                      {school.principalNameEn || school.principalNameBn}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-600 truncate">
                    প্রধান শিক্ষক / অধ্যক্ষ · {school.nameBn || school.nameEn}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
