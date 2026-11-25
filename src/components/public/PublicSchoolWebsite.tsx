import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowRight,
  Atom,
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Cpu,
  ExternalLink,
  Facebook,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  Image as ImageIcon,
  Instagram,
  Laptop,
  Layers,
  Linkedin,
  Loader2,
  LogIn,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  Monitor,
  Palette,
  Phone,
  Play,
  QrCode,
  Quote,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  User,
  Users,
  X,
  Youtube,
} from 'lucide-react';
import {
  PublicAcademicProgramItem,
  PublicBlogSummary,
  PublicNoticeSummary,
  PublicSchoolWebsiteData,
  WebsiteGalleryCategory,
} from '../../types';
import {
  buildPublicWebsitePayloadFromERP,
  fetchPublicWebsiteFromFirestore,
  getAllCachedPublicWebsites,
  getCachedPublicWebsite,
  getPreferredPublicSchoolId,
  isPlaceholderPublicSchool,
  listPublishedSchoolsFromFirestore,
  publishPublicWebsiteSnapshot,
  resolveCleanHeroImage,
  resolvePublicStatCards,
  setPreferredPublicSchoolId,
  submitPublicContactMessage,
} from '../../services/publicWebsiteService';
import { isGenericSchoolName } from '../../utils/schoolNameResolver';
import { StorageService } from '../../services/storage';
import { SAAS_ACTIVE_SCHOOL_KEY } from '../../services/cloudSync';
import { safeGetLocalStorage } from '../../utils/storageHelper';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { HeroLoginView } from '../auth/HeroLoginView';
import { PublicAdmissionModal } from './PublicAdmissionModal';
import {
  PublicAllNoticesModal,
  PublicBlogModal,
  PublicGalleryLightbox,
  PublicLegalModal,
  PublicNoticeDetailModal,
  PublicPrincipalModal,
  PublicProgramModal,
  PublicResultsPortalModal,
  PublicVideoModal,
} from './PublicDetailModals';

interface PublicSchoolWebsiteProps {
  isAuthenticatedPreview?: boolean;
  onBackToDashboard?: () => void;
  initialShowLoginModal?: boolean;
}

const GALLERY_FILTER_CATEGORIES: Array<{
  value: 'All' | WebsiteGalleryCategory;
  labelEn: string;
  labelBn: string;
}> = [
  { value: 'All', labelEn: 'All', labelBn: 'সকল' },
  { value: 'Campus', labelEn: 'Campus', labelBn: 'ক্যাম্পাস' },
  { value: 'Classroom', labelEn: 'Classroom', labelBn: 'শ্রেণিকক্ষ' },
  { value: 'Sports', labelEn: 'Sports', labelBn: 'খেলাধুলা' },
  { value: 'Cultural Events', labelEn: 'Cultural Events', labelBn: 'সাংস্কৃতিক অনুষ্ঠান' },
  { value: 'Annual Programs', labelEn: 'Annual Programs', labelBn: 'বার্ষিক অনুষ্ঠান' },
  { value: 'Student Activities', labelEn: 'Student Activities', labelBn: 'শিক্ষার্থী কার্যক্রম' },
];

function getGalleryCategoryLabel(cat: WebsiteGalleryCategory | string, isBn: boolean): string {
  const match = GALLERY_FILTER_CATEGORIES.find((item) => item.value === cat);
  if (!match) return cat;
  return isBn ? match.labelBn : match.labelEn;
}

function renderIconByKey(iconKey: string, className = 'w-6 h-6') {
  switch (iconKey) {
    case 'monitor':
      return <Monitor className={className} />;
    case 'cpu':
      return <Cpu className={className} />;
    case 'flask':
      return <FlaskConical className={className} />;
    case 'book':
      return <BookOpen className={className} />;
    case 'trophy':
      return <Trophy className={className} />;
    case 'bus':
      return <Bus className={className} />;
    case 'qr':
      return <QrCode className={className} />;
    case 'users':
      return <Users className={className} />;
    case 'award':
      return <Award className={className} />;
    case 'graduation':
      return <GraduationCap className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'shield':
      return <ShieldCheck className={className} />;
    case 'laptop':
      return <Laptop className={className} />;
    case 'palette':
      return <Palette className={className} />;
    case 'layers':
      return <Layers className={className} />;
    case 'atom':
      return <Atom className={className} />;
    case 'globe':
      return <Globe className={className} />;
    case 'briefcase':
      return <Briefcase className={className} />;
    default:
      return <GraduationCap className={className} />;
  }
}

function buildSafeMapEmbedUrl(customUrl?: string, address?: string): string | null {
  const raw = (customUrl || '').trim();
  if (raw) {
    let candidate = raw;
    if (/<iframe\b/i.test(raw)) {
      const m = raw.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      candidate = m?.[1] || '';
    }
    try {
      const parsed = new URL(candidate);
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        /(^|\.)google\.com$/i.test(parsed.hostname) &&
        parsed.pathname.includes('/maps')
      ) {
        return parsed.toString();
      }
    } catch {
      // Fall through to address-based map URL
    }
  }
  const cleanAddress = (address || '').trim();
  if (!cleanAddress || cleanAddress.toLowerCase() === 'bangladesh') {
    return 'https://maps.google.com/maps?q=Dhaka,%20Bangladesh&t=&z=12&ie=UTF8&iwloc=&output=embed';
  }
  return `https://maps.google.com/maps?q=${encodeURIComponent(cleanAddress)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
}

function buildLocalFallbackWebsite(schoolIdOverride?: string): PublicSchoolWebsiteData {
  const activeSaasId = safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY);
  const schoolId = schoolIdOverride || activeSaasId || 'local_school';
  return buildPublicWebsitePayloadFromERP({
    schoolId,
    profile: StorageService.getSchoolProfile(),
    classes: StorageService.getClasses(),
    subjects: StorageService.getSubjects(),
    students: StorageService.getStudents(),
    staff: StorageService.getStaff(),
    notices: StorageService.getNotices(),
    blogPosts: StorageService.getBlogPosts(),
    marks: StorageService.getMarks(),
    exams: StorageService.getExams(),
  });
}

export const PublicSchoolWebsite: React.FC<PublicSchoolWebsiteProps> = ({
  isAuthenticatedPreview = false,
  onBackToDashboard,
  initialShowLoginModal = false,
}) => {
  const { saasSession } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const isBn = language === 'bn';

  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(() => {
    if (isAuthenticatedPreview && saasSession?.school?.schoolId) {
      return saasSession.school.schoolId;
    }
    return getPreferredPublicSchoolId() || saasSession?.school?.schoolId || 'local_school';
  });

  const [websiteData, setWebsiteData] = useState<PublicSchoolWebsiteData>(() => {
    if (isAuthenticatedPreview) {
      return buildLocalFallbackWebsite(saasSession?.school?.schoolId || 'local_school');
    }
    const preferredId = getPreferredPublicSchoolId();
    const cached = getCachedPublicWebsite(preferredId);
    if (cached && (!preferredId || cached.schoolId === preferredId)) {
      return cached;
    }
    return buildLocalFallbackWebsite(preferredId || 'local_school');
  });

  const [availableSchools, setAvailableSchools] = useState<PublicSchoolWebsiteData[]>(() => {
    const cachedList = getAllCachedPublicWebsites();
    return cachedList;
  });
  const [loadingCloud, setLoadingCloud] = useState<boolean>(false);

  // Navigation & Interactive States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(initialShowLoginModal);
  const [noticeFilter, setNoticeFilter] = useState<string>('All');
  const [galleryFilter, setGalleryFilter] = useState<'All' | WebsiteGalleryCategory>('All');

  // Detail Modals
  const [selectedNotice, setSelectedNotice] = useState<PublicNoticeSummary | null>(null);
  const [showAllNoticesModal, setShowAllNoticesModal] = useState(false);
  const [showPrincipalModal, setShowPrincipalModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<PublicAcademicProgramItem | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedBlog, setSelectedBlog] = useState<PublicBlogSummary | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | null>(null);

  // Admission Modal
  const [admissionModalState, setAdmissionModalState] = useState<{
    open: boolean;
    mode: 'apply' | 'info';
    defaultClass?: string;
  }>({ open: false, mode: 'apply' });

  // Contact Form State
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSent, setContactSent] = useState(false);

  // Load remote Firestore public data & directory cleanly
  useEffect(() => {
    let active = true;

    const loadPublicData = async () => {
      if (isAuthenticatedPreview) {
        const liveLocal = buildLocalFallbackWebsite(saasSession?.school?.schoolId || 'local_school');
        if (active) setWebsiteData(liveLocal);
        return;
      }

      const preferredId = selectedSchoolId || getPreferredPublicSchoolId();
      setLoadingCloud(true);

      try {
        const [directDoc, remoteList] = await Promise.all([
          preferredId && preferredId !== 'local_school'
            ? fetchPublicWebsiteFromFirestore(preferredId)
            : Promise.resolve(null),
          listPublishedSchoolsFromFirestore(),
        ]);

        if (!active) return;

        // Merge directory cleanly (preserving multi-school isolation and hiding generic ERP placeholder)
        const cachedList = getAllCachedPublicWebsites();
        const mergedMap = new Map<string, PublicSchoolWebsiteData>();
        cachedList.forEach((s) => {
          if (!isPlaceholderPublicSchool(s)) mergedMap.set(s.schoolId, s);
        });
        remoteList.forEach((s) => {
          if (!isPlaceholderPublicSchool(s)) mergedMap.set(s.schoolId, s);
        });
        if (directDoc && !isPlaceholderPublicSchool(directDoc)) {
          mergedMap.set(directDoc.schoolId, directDoc);
        }

        const mergedSchools = Array.from(mergedMap.values()).filter(
          (s) => s.isPublished !== false && !isPlaceholderPublicSchool(s)
        );
        setAvailableSchools(mergedSchools);

        if (directDoc && !isPlaceholderPublicSchool(directDoc)) {
          setWebsiteData(directDoc);
          setSelectedSchoolId(directDoc.schoolId);
          setPreferredPublicSchoolId(directDoc.schoolId);
        } else if (mergedSchools.length > 0) {
          const preferredMatch = mergedSchools.find((s) => s.schoolId === preferredId);
          const chosen = preferredMatch || mergedSchools[0];
          setWebsiteData(chosen);
          setSelectedSchoolId(chosen.schoolId);
          setPreferredPublicSchoolId(chosen.schoolId);
        } else {
          const cached = getCachedPublicWebsite(preferredId);
          if (cached) {
            setWebsiteData(cached);
          } else {
            const localPayload = buildLocalFallbackWebsite(preferredId || 'local_school');
            setWebsiteData(localPayload);
            if (!isPlaceholderPublicSchool(localPayload)) {
              void publishPublicWebsiteSnapshot(localPayload);
            }
          }
        }
      } finally {
        if (active) setLoadingCloud(false);
      }
    };

    void loadPublicData();
    return () => {
      active = false;
    };
  }, [selectedSchoolId, isAuthenticatedPreview, saasSession?.school?.schoolId]);

  // Listen to live updates from Admin CMS, Notices, Blog, and Storage
  useEffect(() => {
    const refreshLive = (e?: Event) => {
      const custom = e as CustomEvent<PublicSchoolWebsiteData>;
      if (custom?.detail?.schoolId && (!selectedSchoolId || custom.detail.schoolId === selectedSchoolId)) {
        setWebsiteData(custom.detail);
        return;
      }
      if (isAuthenticatedPreview || selectedSchoolId === 'local_school' || selectedSchoolId === safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY)) {
        setWebsiteData(buildLocalFallbackWebsite(selectedSchoolId));
      } else {
        const cached = getCachedPublicWebsite(selectedSchoolId);
        if (cached) setWebsiteData(cached);
      }
    };

    window.addEventListener('public_website_updated', refreshLive);
    window.addEventListener('school_profile_updated', refreshLive);
    window.addEventListener('school_cloud_data_synced', refreshLive);
    return () => {
      window.removeEventListener('public_website_updated', refreshLive);
      window.removeEventListener('school_profile_updated', refreshLive);
      window.removeEventListener('school_cloud_data_synced', refreshLive);
    };
  }, [selectedSchoolId, isAuthenticatedPreview]);

  const { schoolInfo, websiteConfig } = websiteData;
  const displaySchoolName = isBn && schoolInfo.nameBn ? schoolInfo.nameBn : schoolInfo.nameEn || 'Smart School BD';
  const displaySlogan =
    (isBn ? schoolInfo.mottoBn : schoolInfo.mottoEn) ||
    (isBn ? 'জ্ঞান · শৃঙ্খলা · সমৃদ্ধি' : 'Knowledge · Discipline · Prosperity');

  // Dynamic SEO document title on public website
  useEffect(() => {
    if (!isAuthenticatedPreview) {
      document.title = `${schoolInfo.nameEn || 'Smart School BD'} | Official School Website`;
    }
  }, [schoolInfo.nameEn, isAuthenticatedPreview]);

  const cleanHeroImage = resolveCleanHeroImage(schoolInfo.heroImageUrl);
  const cleanAboutImage = resolveCleanHeroImage(schoolInfo.aboutImageUrl || schoolInfo.heroImageUrl);

  const statCards = useMemo(() => resolvePublicStatCards(websiteData, language), [websiteData, language]);

  const visibleMenuItems = useMemo(
    () => (websiteConfig.headerMenuItems || []).filter((item) => item.enabled !== false),
    [websiteConfig.headerMenuItems]
  );

  const visibleNotices = useMemo(() => {
    const list = websiteData.notices || [];
    if (noticeFilter === 'All') return list.slice(0, 5);
    return list.filter((n) => n.category === noticeFilter).slice(0, 5);
  }, [websiteData.notices, noticeFilter]);

  const enabledFacilities = useMemo(
    () => (websiteConfig.facilities || []).filter((f) => f.enabled !== false),
    [websiteConfig.facilities]
  );

  const enabledWhyChoose = useMemo(
    () => (websiteConfig.whyChooseUs || []).filter((w) => w.enabled !== false),
    [websiteConfig.whyChooseUs]
  );

  const galleryItems = websiteConfig.gallery || [];
  const filteredGallery = useMemo(() => {
    if (galleryFilter === 'All') return galleryItems;
    return galleryItems.filter((g) => g.category === galleryFilter);
  }, [galleryItems, galleryFilter]);

  const testimonials = websiteConfig.testimonials || [];
  const blogPosts = websiteData.blogPosts || [];

  const principalName =
    (isBn ? schoolInfo.principalNameBn : schoolInfo.principalNameEn) ||
    schoolInfo.principalNameEn ||
    schoolInfo.principalNameBn ||
    (isBn ? 'প্রধান শিক্ষক' : 'School Principal');

  const principalDesignation =
    (isBn ? websiteConfig.principalDesignationBn : websiteConfig.principalDesignationEn) ||
    (isBn ? 'অধ্যক্ষ / প্রধান শিক্ষক' : 'Principal');

  const principalMessage =
    (isBn ? websiteConfig.principalMessageBn : websiteConfig.principalMessageEn) ||
    (isBn
      ? 'আমাদের লক্ষ্য হলো জ্ঞানসমৃদ্ধ, শৃঙ্খলাবদ্ধ এবং নৈতিক মূল্যবোধসম্পন্ন একটি আলোকিত প্রজন্ম গড়ে তোলা।'
      : 'Our aim is to build a knowledgeable, disciplined and value-based generation ready to lead tomorrow.');

  const heroBadge =
    (isBn ? websiteConfig.heroBadgeBn : websiteConfig.heroBadgeEn) ||
    (isBn ? 'আমাদের বিদ্যালয়ে স্বাগতম' : 'Welcome to Our School');

  const heroHeading =
    (isBn ? websiteConfig.heroHeadingBn : websiteConfig.heroHeadingEn) ||
    'Build a Bright Future with Quality Education';

  const heroHighlight = (websiteConfig.heroHeadingHighlightEn || 'Quality Education').trim();

  const heroDescription =
    (isBn ? websiteConfig.heroDescriptionBn : websiteConfig.heroDescriptionEn) ||
    'Our institution is committed to providing quality education, moral values, discipline and modern learning opportunities for every student.';

  const mapEmbedUrl = buildSafeMapEmbedUrl(
    websiteConfig.googleMapEmbedUrl,
    schoolInfo.addressEn
  );

  const handleSchoolSwitch = (newSchoolId: string) => {
    if (!newSchoolId || newSchoolId === selectedSchoolId) return;
    setSelectedSchoolId(newSchoolId);
    setPreferredPublicSchoolId(newSchoolId);
    const match = availableSchools.find((s) => s.schoolId === newSchoolId);
    if (match) {
      setWebsiteData(match);
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('school', newSchoolId);
      window.history.replaceState({}, '', url.toString());
    }
    setNoticeFilter('All');
    setGalleryFilter('All');
  };

  const scrollToSection = (href: string) => {
    setMobileMenuOpen(false);
    if (!href) return;
    if (href === '#home' || href === '#') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const targetId = href.replace(/^#/, '');
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSent(false);

    if (!contactName.trim() || !contactPhone.trim() || !contactMessage.trim()) {
      setContactError(
        isBn
          ? 'অনুগ্রহ করে আপনার নাম, মোবাইল নম্বর এবং বার্তা লিখুন।'
          : 'Please enter your name, phone number, and message.'
      );
      return;
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setContactError(isBn ? 'সঠিক ইমেইল ঠিকানা দিন।' : 'Please provide a valid email address.');
      return;
    }

    setContactSubmitting(true);
    try {
      const res = await submitPublicContactMessage(websiteData.schoolId, {
        senderName: contactName.trim(),
        phone: contactPhone.trim(),
        email: contactEmail.trim() || undefined,
        subject: contactSubject.trim() || undefined,
        message: contactMessage.trim(),
      });
      if (res.success && res.message) {
        const activeSaasId = safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY);
        if (
          websiteData.schoolId === 'local_school' ||
          (activeSaasId && websiteData.schoolId === activeSaasId)
        ) {
          StorageService.addWebsiteMessage(res.message);
        }
        setContactSent(true);
        setContactName('');
        setContactPhone('');
        setContactEmail('');
        setContactSubject('');
        setContactMessage('');
      } else {
        setContactError(res.error || (isBn ? 'বার্তা পাঠানো যায়নি।' : 'Failed to send message.'));
      }
    } catch {
      setContactError(
        isBn
          ? 'সার্ভারে সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।'
          : 'Unable to send message right now. Please try again.'
      );
    } finally {
      setContactSubmitting(false);
    }
  };

  const renderHeroHeadline = () => {
    if (isBn || !heroHighlight) {
      return <span>{heroHeading}</span>;
    }
    const idx = heroHeading.toLowerCase().indexOf(heroHighlight.toLowerCase());
    if (idx === -1) {
      return <span>{heroHeading}</span>;
    }
    const before = heroHeading.slice(0, idx);
    const match = heroHeading.slice(idx, idx + heroHighlight.length);
    const after = heroHeading.slice(idx + heroHighlight.length);

    return (
      <>
        {before}
        <span className="relative inline-block text-[#1D63ED]">
          {match}
          <svg
            viewBox="0 0 280 14"
            fill="none"
            className="w-full h-3 absolute -bottom-1.5 left-0 text-[#16A34A]"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M3 10.5C74 3.5 196 1.5 277 7.5"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        {after}
      </>
    );
  };

  const statBadgePalette = [
    'bg-[#1D63ED] text-white',
    'bg-[#15803D] text-white',
    'bg-[#6D28D9] text-white',
    'bg-[#D97706] text-white',
    'bg-[#16A34A] text-white',
  ];

  const getStatIcon = (id: string) => {
    switch (id) {
      case 'students':
        return <Users className="w-6 h-6" />;
      case 'teachers':
        return <GraduationCap className="w-6 h-6" />;
      case 'classes':
        return <Building2 className="w-6 h-6" />;
      case 'years':
        return <Award className="w-6 h-6" />;
      case 'success':
        return <TrendingUp className="w-6 h-6" />;
      default:
        return <Award className="w-6 h-6" />;
    }
  };

  const getNoticeCategoryStyle = (cat: PublicNoticeSummary['category']) => {
    switch (cat) {
      case 'Admission':
        return { text: 'text-[#1D63ED]', iconBg: 'bg-blue-50 text-[#1D63ED]' };
      case 'Exam':
        return { text: 'text-[#15803D]', iconBg: 'bg-emerald-50 text-[#15803D]' };
      case 'Holiday':
        return { text: 'text-amber-700', iconBg: 'bg-amber-50 text-amber-700' };
      case 'Emergency':
        return { text: 'text-rose-700', iconBg: 'bg-rose-50 text-rose-700' };
      default:
        return { text: 'text-violet-700', iconBg: 'bg-violet-50 text-violet-700' };
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FC] text-slate-900 flex flex-col">
      {/* Authenticated Preview Banner */}
      {isAuthenticatedPreview && onBackToDashboard && (
        <div className="bg-slate-900 text-white px-4 py-2 text-xs flex items-center justify-between gap-3 z-50">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">
              {isBn
                ? `লাইভ ওয়েবসাইট প্রিভিউ: ${displaySchoolName}`
                : `Live School Website Preview: ${displaySchoolName}`}
            </span>
          </div>
          <button
            type="button"
            onClick={onBackToDashboard}
            className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{isBn ? 'ইআরপি ড্যাশবোর্ডে ফিরুন' : 'Back to ERP Dashboard'}</span>
          </button>
        </div>
      )}

      {/* 1. Top Information Bar */}
      <div className="bg-[#0B47B8] text-white text-xs border-b border-blue-700/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-10 flex items-center justify-between gap-4">
          {/* Left: Phone & Email */}
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            {schoolInfo.phone && (
              <a
                href={`tel:${schoolInfo.phone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1.5 hover:text-blue-100 transition-colors whitespace-nowrap shrink-0"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span className="tabular-nums font-medium">{schoolInfo.phone}</span>
              </a>
            )}
            {schoolInfo.email && (
              <a
                href={`mailto:${schoolInfo.email}`}
                className="hidden sm:inline-flex items-center gap-1.5 hover:text-blue-100 transition-colors truncate"
              >
                <Mail className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span className="truncate">{schoolInfo.email}</span>
              </a>
            )}
          </div>

          {/* Right: Quick Links + Language + Universal Login */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-4 text-blue-50">
              <button
                type="button"
                onClick={() => scrollToSection('#notices')}
                className="hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                {isBn ? 'নোটিশ' : 'Notice'}
              </button>
              <button
                type="button"
                onClick={() => setShowResultsModal(true)}
                className="hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                {isBn ? 'ফলাফল' : 'Results'}
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('#gallery')}
                className="hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                {isBn ? 'গ্যালারি' : 'Gallery'}
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('#blog')}
                className="hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                {isBn ? 'ব্লগ' : 'Blog'}
              </button>
            </div>

            {availableSchools.length > 1 && !isAuthenticatedPreview && (
              <div className="hidden sm:flex items-center">
                <select
                  aria-label="Switch School"
                  value={selectedSchoolId}
                  onChange={(e) => handleSchoolSwitch(e.target.value)}
                  className="bg-[#083A9E] text-white text-xs font-medium px-2.5 py-1 rounded border border-blue-500/60 focus:outline-none max-w-[165px] truncate cursor-pointer"
                >
                  {availableSchools.map((s) => (
                    <option key={s.schoolId} value={s.schoolId} className="text-slate-900 bg-white">
                      {isBn && s.schoolInfo.nameBn && !isGenericSchoolName(s.schoolInfo.nameBn)
                        ? s.schoolInfo.nameBn
                        : s.schoolInfo.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={toggleLanguage}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Toggle language"
            >
              {language === 'en' ? 'বাংলা' : 'EN'}
            </button>

            {!isAuthenticatedPreview && (
              <button
                type="button"
                onClick={() => setShowLoginModal(true)}
                className="px-3.5 py-1.5 rounded-full bg-[#1D63ED] hover:bg-[#1552CC] text-white font-semibold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{isBn ? 'লগইন' : 'Login'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Sticky Main Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-4">
          {/* Zone 1: Brand Lockup */}
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('#home');
            }}
            className="flex items-center gap-3 min-w-0 shrink-0"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center overflow-hidden shrink-0">
              {schoolInfo.logoUrl ? (
                <img
                  src={schoolInfo.logoUrl}
                  alt={displaySchoolName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-0.5"
                />
              ) : (
                <GraduationCap className="w-6 h-6 text-[#0B47B8]" />
              )}
            </div>
            <div className="min-w-0">
              <span className="block text-base sm:text-lg font-extrabold text-[#0B2D7A] tracking-tight truncate max-w-[180px] sm:max-w-[230px]">
                {displaySchoolName}
              </span>
              <span className="hidden sm:block text-[11px] font-medium text-[#15803D] truncate max-w-[230px]">
                {displaySlogan}
              </span>
            </div>
          </a>

          {/* Zone 2: Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-5 text-sm font-semibold text-slate-700">
            {visibleMenuItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(item.href);
                }}
                className="hover:text-[#0B47B8] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#0B47B8]"
              >
                {isBn ? item.labelBn : item.labelEn}
              </a>
            ))}
          </nav>

          {/* Zone 3: Primary Action + Mobile Menu Trigger */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setAdmissionModalState({ open: true, mode: 'apply' })}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#15803D] hover:bg-[#166534] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isBn
                  ? websiteConfig.admissionButtonTextBn || 'নতুন ভর্তি'
                  : websiteConfig.admissionButtonTextEn || 'New Admission'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="xl:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="xl:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3 shadow-lg">
            <div className="grid grid-cols-2 gap-2">
              {visibleMenuItems.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(item.href);
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#0B47B8] transition-colors"
                >
                  {isBn ? item.labelBn : item.labelEn}
                </a>
              ))}
            </div>

            {availableSchools.length > 1 && !isAuthenticatedPreview && (
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  {isBn ? 'স্কুল নির্বাচন করুন' : 'Select School'}
                </label>
                <select
                  value={selectedSchoolId}
                  onChange={(e) => handleSchoolSwitch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  {availableSchools.map((s) => (
                    <option key={s.schoolId} value={s.schoolId}>
                      {isBn && s.schoolInfo.nameBn && !isGenericSchoolName(s.schoolInfo.nameBn)
                        ? s.schoolInfo.nameBn
                        : s.schoolInfo.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdmissionModalState({ open: true, mode: 'apply' });
                }}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#15803D] text-white text-xs font-semibold text-center cursor-pointer"
              >
                {isBn
                  ? websiteConfig.admissionButtonTextBn || 'নতুন ভর্তি'
                  : websiteConfig.admissionButtonTextEn || 'New Admission'}
              </button>
              {!isAuthenticatedPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowLoginModal(true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-[#0B47B8] text-white text-xs font-semibold text-center cursor-pointer"
                >
                  {isBn ? 'লগইন' : 'Login'}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* 3. Premium Hero Section */}
        <section id="home" className="relative bg-[#EFF5FF] overflow-hidden">
          {/* Desktop Atmospheric Campus Background (right-weighted so text stays sharp on left) */}
          <div className="hidden lg:block absolute inset-0 pointer-events-none">
            <img
              src={cleanHeroImage}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-right"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#F4F8FF] via-[#F4F8FF]/92 via-45% to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#F4F7FC] to-transparent" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12 lg:pt-14 lg:pb-24">
            <div className="grid lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                {/* Welcome Badge */}
                <div className="inline-flex items-center gap-2 pl-3 pr-4 py-1.5 rounded-full bg-[#0B2D7A] text-white text-xs sm:text-sm font-semibold shadow-sm border-r-4 border-[#16A34A]">
                  <GraduationCap className="w-4 h-4 text-blue-200 shrink-0" />
                  <span>{heroBadge}</span>
                </div>

                {/* Display H1 */}
                <h1 className="text-3xl sm:text-4xl lg:text-[46px] font-extrabold text-[#0B245B] leading-[1.15] tracking-tight text-balance max-w-2xl">
                  {renderHeroHeadline()}
                </h1>

                <p className="text-sm sm:text-base text-slate-700 leading-relaxed max-w-xl">
                  {heroDescription}
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setAdmissionModalState({ open: true, mode: 'apply' })}
                    className="px-5 py-3 rounded-full bg-[#1D63ED] hover:bg-[#1552CC] text-white text-sm font-semibold flex items-center gap-2 shadow-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>
                      {isBn
                        ? websiteConfig.heroPrimaryBtnBn || 'নতুন ভর্তি'
                        : websiteConfig.heroPrimaryBtnEn || 'New Admission'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowVideoModal(true)}
                    className="px-5 py-3 rounded-full bg-white hover:bg-slate-50 text-[#0B245B] border border-slate-300 text-sm font-semibold flex items-center gap-2 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#1D63ED]/10 text-[#1D63ED] flex items-center justify-center">
                      <Play className="w-3 h-3 fill-current" />
                    </span>
                    <span>
                      {isBn
                        ? websiteConfig.heroVideoBtnBn || 'বিদ্যালয়ের ভিডিও দেখুন'
                        : websiteConfig.heroVideoBtnEn || 'Watch School Video'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => scrollToSection('#about')}
                    className="px-4 py-3 rounded-full bg-white/90 hover:bg-white text-[#0B245B] border border-slate-200 text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <ArrowDownCircle className="w-4 h-4 text-[#15803D]" />
                    <span>
                      {isBn
                        ? websiteConfig.heroSecondaryBtnBn || 'বিদ্যালয় সম্পর্কে জানুন'
                        : websiteConfig.heroSecondaryBtnEn || 'Explore Our School'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Mobile / Tablet Stacked Campus Image */}
              <div className="lg:hidden">
                <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-white aspect-[16/10]">
                  <img
                    src={cleanHeroImage}
                    alt={`${displaySchoolName} Campus`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. School Statistics Strip */}
        <section aria-label="School Statistics" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 -mt-6 lg:-mt-12">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/90 p-4 sm:p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-0 lg:divide-x divide-slate-100">
              {statCards.map((stat, idx) => (
                <div
                  key={stat.id}
                  className="flex items-center gap-3.5 px-2 sm:px-4 py-1 last:col-span-2 sm:last:col-span-1"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                      statBadgePalette[idx % statBadgePalette.length]
                    }`}
                  >
                    {getStatIcon(stat.id)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-extrabold text-[#0B245B] tabular-nums leading-tight">
                      {stat.value}
                    </p>
                    <p className="text-xs font-medium text-slate-600 truncate">
                      {stat.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Principal's Message & Latest Notices Split Grid */}
        <section id="notices" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="grid lg:grid-cols-12 gap-6 items-stretch">
            {/* Left: Message from the Principal */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 pt-4 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0B2D7A] text-white text-sm font-bold border-r-4 border-[#16A34A]">
                  <GraduationCap className="w-4 h-4 text-blue-200" />
                  <span>{isBn ? 'অধ্যক্ষ / প্রধান শিক্ষকের বাণী' : 'Message from the Principal'}</span>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col sm:flex-row gap-5 items-center sm:items-start">
                <div className="w-32 h-36 sm:w-36 sm:h-44 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {websiteConfig.principalPhotoUrl ? (
                    <img
                      src={websiteConfig.principalPhotoUrl}
                      alt={principalName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-50 to-emerald-50 flex flex-col items-center justify-center text-[#0B47B8]">
                      <User className="w-12 h-12 opacity-70" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between h-full text-center sm:text-left">
                  <div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-[#0B245B] truncate">
                      {principalName}
                    </h2>
                    <p className="text-xs sm:text-sm font-bold text-[#15803D] mt-0.5">
                      {principalDesignation}
                    </p>
                    <div className="mt-3 flex items-start gap-2 text-left">
                      <Quote className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-4">
                        {principalMessage}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowPrincipalModal(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? 'বিস্তারিত পড়ুন' : 'Read More'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Latest Notices */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0B2D7A] text-white text-sm font-bold border-r-4 border-[#16A34A]">
                  <Megaphone className="w-4 h-4 text-emerald-300" />
                  <span>{isBn ? 'সাম্প্রতিক নোটিশ বোর্ড' : 'Latest Notices'}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAllNoticesModal(true)}
                  className="px-3.5 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-[#0B47B8] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{isBn ? 'সকল নোটিশ' : 'View All'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Notice Category Filter */}
              <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto">
                {[
                  { id: 'All', en: 'All', bn: 'সকল' },
                  { id: 'Admission', en: 'Admission', bn: 'ভর্তি' },
                  { id: 'Exam', en: 'Exam', bn: 'পরীক্ষা' },
                  { id: 'Holiday', en: 'Holiday', bn: 'ছুটি' },
                  { id: 'General', en: 'General Notice', bn: 'সাধারণ' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setNoticeFilter(cat.id)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      noticeFilter === cat.id
                        ? 'bg-[#0B47B8] text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {isBn ? cat.bn : cat.en}
                  </button>
                ))}
              </div>

              <div className="p-4 flex-1 divide-y divide-slate-100">
                {loadingCloud && visibleNotices.length === 0 ? (
                  <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-[#0B47B8]" />
                    <span>{isBn ? 'নোটিশ লোড হচ্ছে...' : 'Loading notices...'}</span>
                  </div>
                ) : visibleNotices.length === 0 ? (
                  <div className="py-10 text-center space-y-1.5">
                    <p className="text-sm font-semibold text-slate-700">
                      {isBn ? 'কোনো প্রকাশিত নোটিশ নেই' : 'No published notices in this category yet'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isBn
                        ? 'অ্যাডমিন প্যানেল থেকে নতুন নোটিশ প্রকাশ করলে এখানে স্বয়ংক্রিয়ভাবে দেখাবে।'
                        : 'Notices published for All from the ERP Notice Board appear here automatically.'}
                    </p>
                  </div>
                ) : (
                  visibleNotices.map((notice) => {
                    const catStyle = getNoticeCategoryStyle(notice.category);
                    return (
                      <button
                        key={notice.id}
                        type="button"
                        onClick={() => setSelectedNotice(notice)}
                        className="w-full py-3 px-2 text-left flex items-center justify-between gap-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${catStyle.iconBg}`}
                          >
                            <Megaphone className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className={`font-bold ${catStyle.text}`}>{notice.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{notice.date}</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900 group-hover:text-[#0B47B8] truncate mt-0.5">
                              {notice.title}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[#0B47B8] hidden sm:inline-flex items-center gap-1 shrink-0">
                          <span>{isBn ? 'দেখুন' : 'View Details'}</span>
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 6. About Us Section */}
        <section id="about" className="bg-white border-y border-slate-200/80 py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-slate-100 aspect-[4/3]">
                <img
                  src={cleanAboutImage}
                  alt={`About ${displaySchoolName}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="lg:col-span-7 space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
                  {isBn ? 'আমাদের প্রতিষ্ঠান সম্পর্কে' : 'About Our Institution'}
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B245B] mt-1.5 text-balance">
                  {(isBn ? websiteConfig.aboutTitleBn : websiteConfig.aboutTitleEn) ||
                    'Shaping Young Minds with Excellence & Character'}
                </h2>
              </div>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                {(isBn ? websiteConfig.aboutDescriptionBn : websiteConfig.aboutDescriptionEn) ||
                  'Combining dedicated teaching, safe campus culture, science and ICT learning, and modern digital school management.'}
              </p>

              <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-500">{isBn ? 'প্রতিষ্ঠাকাল' : 'Established'}</p>
                  <p className="text-base font-bold text-[#0B245B] tabular-nums">
                    {schoolInfo.establishedYear || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">{isBn ? 'বর্তমান শিক্ষাবর্ষ' : 'Academic Session'}</p>
                  <p className="text-base font-bold text-[#0B245B] tabular-nums">
                    {schoolInfo.currentSession || new Date().getFullYear()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">{isBn ? 'ইআইআইএন / কোড' : 'EIIN / School Code'}</p>
                  <p className="text-base font-bold text-[#0B245B] tabular-nums">
                    {schoolInfo.eiin || schoolInfo.schoolCode || 'Verified'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Academic Programs */}
        <section id="academics" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div id="programs" className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
              {isBn ? 'একাডেমিক কার্যক্রম' : 'Academic Programs'}
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B245B] text-balance">
              {isBn ? 'শ্রেণি ও বিভাগভিত্তিক শিক্ষা কার্যক্রম' : 'Structured Learning Across Every Stage'}
            </h2>
            <p className="text-sm text-slate-600">
              {isBn
                ? 'স্কুলে চলমান সক্রিয় শ্রেণি, শাখা এবং বিভাগ অনুযায়ী ডাইনামিক কারিকুলাম।'
                : 'Dynamic academic wings tailored to our active classes, sections, and study groups.'}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {websiteData.academicPrograms.map((prog) => (
              <div
                key={prog.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="space-y-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#0B47B8] flex items-center justify-center">
                    {renderIconByKey(prog.iconKey, 'w-5 h-5')}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#0B245B]">
                      {isBn ? prog.titleBn : prog.titleEn}
                    </h3>
                    <p className="text-xs font-semibold text-[#15803D] mt-0.5">
                      {isBn ? prog.subtitleBn : prog.subtitleEn}
                    </p>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-3">
                    {isBn ? prog.descriptionBn : prog.descriptionEn}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    {prog.totalSubjects > 0
                      ? isBn
                        ? `${prog.totalSubjects}টি বিষয়`
                        : `${prog.totalSubjects} Subjects`
                      : isBn
                      ? 'এনসিটিবি সিলেবাস'
                      : 'Core Curriculum'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProgram(prog)}
                    className="text-xs font-bold text-[#0B47B8] hover:text-[#083A9E] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <span>{isBn ? 'বিস্তারিত' : 'Learn More'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 8. School Facilities */}
        <section id="facilities" className="bg-white border-y border-slate-200/80 py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
                {isBn ? 'ক্যাম্পাস সুবিধাসমূহ' : 'School Facilities'}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B245B] text-balance">
                {isBn ? 'আধুনিক শিক্ষা ও সহশিক্ষা অবকাঠামো' : 'Modern Campus & Digital Facilities'}
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {enabledFacilities.map((fac) => (
                <div
                  key={fac.id}
                  className="rounded-2xl bg-[#F8FAFC] border border-slate-200 overflow-hidden hover:border-emerald-300 hover:bg-white transition-all flex flex-col"
                >
                  {fac.imageUrl ? (
                    <div className="h-36 bg-slate-100 overflow-hidden">
                      <img
                        src={fac.imageUrl}
                        alt={isBn ? fac.titleBn : fac.titleEn}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="p-5 space-y-2.5 flex-1">
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#15803D] flex items-center justify-center">
                      {renderIconByKey(fac.iconKey, 'w-5 h-5')}
                    </div>
                    <h3 className="text-base font-bold text-[#0B245B]">
                      {isBn ? fac.titleBn : fac.titleEn}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {isBn ? fac.descriptionBn : fac.descriptionEn}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 9. Photo Gallery */}
        <section id="gallery" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
                {isBn ? 'ফটো গ্যালারি' : 'Campus Life'}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B245B]">
                {isBn ? 'বিদ্যালয়ের ফটো গ্যালারি' : 'Photo Gallery'}
              </h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {GALLERY_FILTER_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setGalleryFilter(cat.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    galleryFilter === cat.value
                      ? 'bg-[#0B47B8] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isBn ? cat.labelBn : cat.labelEn}
                </button>
              ))}
            </div>
          </div>

          {filteredGallery.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0B47B8] flex items-center justify-center mx-auto">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                {isBn ? 'এই বিভাগে এখনো ছবি যুক্ত করা হয়নি' : 'No gallery photos published in this category yet'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {isBn
                  ? 'অ্যাডমিন সেটিংস থেকে ক্যাম্পাস, শ্রেণিকক্ষ ও অনুষ্ঠানের ছবি আপলোড করলে এখানে প্রদর্শিত হবে।'
                  : 'Campus, Classroom, Sports, and Event photos uploaded via Admin CMS Settings will appear here.'}
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredGallery.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className="group bg-white rounded-2xl border border-slate-200 overflow-hidden text-left hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
                    <img
                      src={item.imageUrl}
                      alt={item.titleEn}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold text-[#15803D]">
                      {getGalleryCategoryLabel(item.category, isBn)}
                    </p>
                    <p className="text-sm font-bold text-[#0B245B] mt-0.5 truncate">
                      {isBn && item.titleBn ? item.titleBn : item.titleEn}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 10. Online Admission CTA Banner */}
        <section id="admission" className="max-w-7xl mx-auto px-4 sm:px-6 pb-14 sm:pb-16">
          <div className="rounded-3xl bg-gradient-to-r from-[#0B2D7A] via-[#0B47B8] to-[#15803D] text-white p-7 sm:p-10 lg:p-12 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2.5 max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                {isBn ? 'অনলাইন ভর্তি কার্যক্রম' : `Session ${schoolInfo.currentSession || new Date().getFullYear()}`}
              </p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-balance">
                {(isBn ? websiteConfig.admissionBannerTitleBn : websiteConfig.admissionBannerTitleEn) ||
                  'Admission is Open'}
              </h2>
              <p className="text-sm sm:text-base text-blue-100">
                {(isBn
                  ? websiteConfig.admissionBannerSubtitleBn
                  : websiteConfig.admissionBannerSubtitleEn) ||
                  'Give your child the opportunity to learn, grow and succeed.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setAdmissionModalState({ open: true, mode: 'apply' })}
                className="px-6 py-3 rounded-full bg-white text-[#0B2D7A] hover:bg-blue-50 text-sm font-bold flex items-center gap-2 shadow-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>{isBn ? 'অনলাইনে আবেদন করুন' : 'Apply Online'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAdmissionModalState({ open: true, mode: 'info' })}
                className="px-5 py-3 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/30 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                {isBn ? 'ভর্তির তথ্য জানুন' : 'Admission Information'}
              </button>
            </div>
          </div>
        </section>

        {/* 11. Why Choose Our School */}
        <section id="why-choose" className="bg-white border-y border-slate-200/80 py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
                {isBn ? 'আমাদের স্বাতন্ত্র্য' : 'Our Commitment'}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B245B]">
                {isBn ? 'কেন আমাদের বিদ্যালয় সেরা?' : 'Why Choose Our School'}
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enabledWhyChoose.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-6 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#0B47B8] flex items-center justify-center">
                      {renderIconByKey(item.iconKey, 'w-5 h-5')}
                    </div>
                    <span className="text-xs font-bold text-slate-400 tabular-nums">
                      0{idx + 1}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#0B245B]">
                    {isBn ? item.titleBn : item.titleEn}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {isBn ? item.descriptionBn : item.descriptionEn}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 12. Testimonials */}
        <section id="testimonials" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
              {isBn ? 'অভিভাবক ও শিক্ষার্থীদের মতামত' : 'Community Voices'}
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B245B]">
              {isBn ? 'অভিভাবক ও শিক্ষার্থীদের অভিজ্ঞতা' : 'Parent & Student Testimonials'}
            </h2>
          </div>

          {testimonials.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-600">
              {isBn
                ? 'অ্যাডমিন সেটিংস থেকে অভিভাবক ও শিক্ষার্থীদের বাস্তব মতামত যোগ করলে এখানে দেখাবে।'
                : 'Verified parent and student testimonials added in Admin CMS Settings will be displayed here.'}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <div
                  key={t.id}
                  className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: Math.max(1, Math.min(5, t.rating || 5)) }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-current" />
                      ))}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">“{t.feedback}”</p>
                  </div>

                  <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-[#0B47B8] flex items-center justify-center overflow-hidden shrink-0 font-bold text-sm">
                      {t.photoUrl ? (
                        <img
                          src={t.photoUrl}
                          alt={t.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        t.name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0B245B] truncate">{t.name}</p>
                      <p className="text-xs text-slate-500 truncate">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 13. Latest News / Blog */}
        <section id="blog" className="bg-white border-y border-slate-200/80 py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
                {isBn ? 'সংবাদ ও সাময়িকী' : 'News & Publications'}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B245B]">
                {isBn ? 'সাম্প্রতিক সংবাদ ও স্কুল ব্লগ' : 'Latest School News & Blog'}
              </h2>
            </div>

            {blogPosts.length === 0 ? (
              <div className="rounded-2xl bg-[#F8FAFC] border border-slate-200 p-8 text-center text-sm text-slate-600">
                {isBn
                  ? 'ব্লগ মডিউল থেকে নতুন আর্টিকেল প্রকাশ করলে এখানে স্বয়ংক্রিয়ভাবে প্রদর্শিত হবে।'
                  : 'Published articles from the ERP Blog Module will appear here automatically.'}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {blogPosts.slice(0, 6).map((post) => (
                  <article
                    key={post.id}
                    className="bg-[#F8FAFC] rounded-2xl border border-slate-200 overflow-hidden flex flex-col hover:bg-white hover:shadow-md transition-all"
                  >
                    <div className="h-44 bg-gradient-to-br from-[#0B2D7A] to-[#15803D] overflow-hidden relative flex items-center justify-center">
                      {post.coverImage ? (
                        <img
                          src={post.coverImage}
                          alt={isBn && post.titleBn ? post.titleBn : post.titleEn}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen className="w-12 h-12 text-white/75" />
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-[#15803D]">
                            {isBn ? post.categoryBn || post.category : post.category}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Calendar className="w-3 h-3" />
                            {post.publishedAt}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-[#0B245B] line-clamp-2">
                          {isBn && post.titleBn ? post.titleBn : post.titleEn}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 line-clamp-3">
                          {post.excerpt}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedBlog(post)}
                        className="text-xs font-bold text-[#0B47B8] hover:text-[#083A9E] inline-flex items-center gap-1 cursor-pointer self-start"
                      >
                        <span>{isBn ? 'আরও পড়ুন' : 'Read More'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 14. Contact Section */}
        <section id="contact" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
              {isBn ? 'যোগাযোগ করুন' : 'Get In Touch'}
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B245B]">
              {isBn ? 'আমাদের ঠিকানা ও যোগাযোগ ফরম' : 'Contact Us'}
            </h2>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 items-start">
            {/* Left: Contact Info & Google Map */}
            <div className="lg:col-span-6 space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0B47B8] flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      {isBn ? 'বিদ্যালয়ের ঠিকানা' : 'School Address'}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">
                      {(isBn ? schoolInfo.addressBn : schoolInfo.addressEn) || 'Bangladesh'}
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#15803D] flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-500">{isBn ? 'ফোন' : 'Phone'}</p>
                      <p className="text-sm font-semibold text-slate-800 tabular-nums mt-0.5 truncate">
                        {schoolInfo.phone || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0B47B8] flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-500">{isBn ? 'ইমেইল' : 'Email'}</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">
                        {schoolInfo.email || '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {(websiteConfig.officeHoursEn || websiteConfig.officeHoursBn) && (
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                    {isBn ? websiteConfig.officeHoursBn : websiteConfig.officeHoursEn}
                  </p>
                )}
              </div>

              {mapEmbedUrl && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden h-64 shadow-xs">
                  <iframe
                    src={mapEmbedUrl}
                    title={`${displaySchoolName} Location Map`}
                    className="w-full h-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}
            </div>

            {/* Right: Contact Form */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
              <h3 className="text-lg font-bold text-[#0B245B] mb-1">
                {isBn ? 'সরাসরি বার্তা পাঠান' : 'Send a Message'}
              </h3>
              <p className="text-xs text-slate-500 mb-5">
                {isBn
                  ? 'আপনার বার্তা সরাসরি স্কুল অ্যাডমিন ইনবক্সে সংরক্ষিত হবে।'
                  : 'Questions about admissions, academics, or campus visits go straight to school administration.'}
              </p>

              {contactSent && (
                <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {isBn
                      ? 'আপনার বার্তা সফলভাবে পাঠানো হয়েছে। ধন্যবাদ!'
                      : 'Your message has been sent successfully. Our office will respond shortly.'}
                  </span>
                </div>
              )}

              {contactError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {contactError}
                </div>
              )}

              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isBn ? 'আপনার নাম *' : 'Your Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder={isBn ? 'পূর্ণ নাম লিখুন' : 'Full name'}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isBn ? 'মোবাইল নম্বর *' : 'Phone Number *'}
                    </label>
                    <input
                      type="tel"
                      required
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isBn ? 'ইমেইল (ঐচ্ছিক)' : 'Email (Optional)'}
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isBn ? 'বিষয়' : 'Subject'}
                    </label>
                    <input
                      type="text"
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      placeholder={isBn ? 'ভর্তি / সাধারণ জিজ্ঞাসা' : 'Admission / General inquiry'}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'বার্তা *' : 'Message *'}
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder={isBn ? 'আপনার প্রশ্ন বা বার্তা বিস্তারিত লিখুন...' : 'Write your message here...'}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#0B47B8] hover:bg-[#083A9E] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {contactSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isBn ? 'পাঠানো হচ্ছে...' : 'Sending...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{isBn ? 'বার্তা পাঠান' : 'Send Message'}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* 15. Footer */}
      <footer className="bg-[#071A42] text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Col 1: Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
                {schoolInfo.logoUrl ? (
                  <img
                    src={schoolInfo.logoUrl}
                    alt={displaySchoolName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain p-0.5"
                  />
                ) : (
                  <GraduationCap className="w-6 h-6 text-[#0B47B8]" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-white truncate">{displaySchoolName}</p>
                <p className="text-xs text-emerald-400 truncate">{displaySlogan}</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              {(isBn ? websiteConfig.footerTextBn : websiteConfig.footerTextEn) ||
                'Committed to quality education, moral discipline, and holistic student development.'}
            </p>
            {/* Social Links */}
            <div className="flex items-center gap-2.5 pt-1">
              {websiteConfig.socialLinks?.facebook && (
                <a
                  href={websiteConfig.socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#1D63ED] text-white flex items-center justify-center transition-colors"
                >
                  <Facebook className="w-4 h-4" />
                </a>
              )}
              {websiteConfig.socialLinks?.youtube && (
                <a
                  href={websiteConfig.socialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                >
                  <Youtube className="w-4 h-4" />
                </a>
              )}
              {websiteConfig.socialLinks?.instagram && (
                <a
                  href={websiteConfig.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-pink-600 text-white flex items-center justify-center transition-colors"
                >
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {websiteConfig.socialLinks?.linkedin && (
                <a
                  href={websiteConfig.socialLinks.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-sky-600 text-white flex items-center justify-center transition-colors"
                >
                  <Linkedin className="w-4 h-4" />
                </a>
              )}
              {websiteConfig.socialLinks?.website && (
                <a
                  href={websiteConfig.socialLinks.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Official Website"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white">
              {isBn ? 'দ্রুত লিংক' : 'Quick Links'}
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('#about')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {isBn ? 'আমাদের সম্পর্কে' : 'About Us'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('#academics')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {isBn ? 'একাডেমিক প্রোগ্রাম' : 'Academic Programs'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('#facilities')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {isBn ? 'স্কুল সুবিধাসমূহ' : 'School Facilities'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('#gallery')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {isBn ? 'ফটো গ্যালারি' : 'Photo Gallery'}
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Important Links */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white">
              {isBn ? 'গুরুত্বপূর্ণ লিংক' : 'Important Links'}
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => setAdmissionModalState({ open: true, mode: 'apply' })}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {isBn ? 'অনলাইন ভর্তি আবেদন' : 'Online Admission'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setShowAllNoticesModal(true)}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {isBn ? 'নোটিশ বোর্ড' : 'Notice Board'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setShowResultsModal(true)}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {isBn ? 'পরীক্ষার ফলাফল' : 'Exam Results'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('#blog')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {isBn ? 'স্কুল সংবাদ ও ব্লগ' : 'News & Blog'}
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Contact Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white">
              {isBn ? 'যোগাযোগ' : 'Contact Details'}
            </h3>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{(isBn ? schoolInfo.addressBn : schoolInfo.addressEn) || 'Bangladesh'}</span>
              </li>
              {schoolInfo.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="tabular-nums">{schoolInfo.phone}</span>
                </li>
              )}
              {schoolInfo.email && (
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">{schoolInfo.email}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <p>
              {websiteConfig.copyrightText ||
                `© ${new Date().getFullYear()} ${schoolInfo.nameEn}. All rights reserved.`}
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setLegalModalType('privacy')}
                className="hover:text-white transition-colors cursor-pointer"
              >
                {isBn ? 'গোপনীয়তা নীতি' : 'Privacy Policy'}
              </button>
              <button
                type="button"
                onClick={() => setLegalModalType('terms')}
                className="hover:text-white transition-colors cursor-pointer"
              >
                {isBn ? 'শর্তাবলি' : 'Terms & Conditions'}
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Login Modal triggered from Topbar Login Button */}
      {showLoginModal && !isAuthenticatedPreview && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md my-auto">
            <HeroLoginView
              isModal={true}
              onClose={() => setShowLoginModal(false)}
              schoolName={displaySchoolName}
              schoolLogoUrl={schoolInfo.logoUrl}
            />
          </div>
        </div>
      )}

      {/* Online Admission & Admission Info Modal */}
      <PublicAdmissionModal
        isOpen={admissionModalState.open}
        mode={admissionModalState.mode}
        onClose={() => setAdmissionModalState((prev) => ({ ...prev, open: false }))}
        onSwitchMode={(mode) => setAdmissionModalState((prev) => ({ ...prev, mode }))}
        schoolId={websiteData.schoolId}
        schoolName={displaySchoolName}
        activeClasses={websiteData.activeClasses}
        admissionInfoText={
          (isBn ? websiteConfig.admissionInfoBn : websiteConfig.admissionInfoEn) || ''
        }
        language={language}
        defaultClass={admissionModalState.defaultClass}
      />

      {/* All Other Interactive Detail Modals */}
      <PublicNoticeDetailModal
        notice={selectedNotice}
        onClose={() => setSelectedNotice(null)}
        language={language}
      />
      <PublicAllNoticesModal
        isOpen={showAllNoticesModal}
        notices={websiteData.notices || []}
        onClose={() => setShowAllNoticesModal(false)}
        onSelectNotice={(n) => {
          setShowAllNoticesModal(false);
          setSelectedNotice(n);
        }}
        language={language}
      />
      <PublicPrincipalModal
        isOpen={showPrincipalModal}
        onClose={() => setShowPrincipalModal(false)}
        principalName={principalName}
        designation={principalDesignation}
        photoUrl={websiteConfig.principalPhotoUrl}
        schoolName={displaySchoolName}
        message={principalMessage}
        language={language}
      />
      <PublicProgramModal
        program={selectedProgram}
        onClose={() => setSelectedProgram(null)}
        onApplyForClass={(className) =>
          setAdmissionModalState({ open: true, mode: 'apply', defaultClass: className })
        }
        language={language}
      />
      <PublicGalleryLightbox
        items={filteredGallery}
        activeIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChangeIndex={(idx) => setLightboxIndex(idx)}
        language={language}
      />
      <PublicBlogModal
        post={selectedBlog}
        onClose={() => setSelectedBlog(null)}
        language={language}
      />
      <PublicVideoModal
        isOpen={showVideoModal}
        videoUrl={websiteConfig.heroVideoUrl}
        schoolName={displaySchoolName}
        heroImageUrl={cleanHeroImage}
        onClose={() => setShowVideoModal(false)}
        language={language}
      />
      <PublicResultsPortalModal
        isOpen={showResultsModal}
        onClose={() => setShowResultsModal(false)}
        onOpenLogin={() => setShowLoginModal(true)}
        schoolName={displaySchoolName}
        language={language}
      />
      <PublicLegalModal
        type={legalModalType}
        schoolName={displaySchoolName}
        privacyText={websiteConfig.privacyPolicyText || ''}
        termsText={websiteConfig.termsConditionsText || ''}
        onClose={() => setLegalModalType(null)}
        language={language}
      />
    </div>
  );
};
