import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  AdmissionEnquiry,
  BlogPost,
  ClassInfo,
  Exam,
  MarksEntry,
  Notice,
  PublicAcademicProgramItem,
  PublicBlogSummary,
  PublicNoticeSummary,
  PublicSchoolWebsiteData,
  SchoolProfile,
  Staff,
  Student,
  Subject,
  WebsiteFacilityItem,
  WebsiteHeaderMenuItem,
  WebsiteMessage,
  WebsiteSettingsConfig,
  WebsiteStatsOverrides,
  WebsiteWhyChooseItem,
} from '../types';
import { safeGetLocalStorage, safeSetLocalStorage } from '../utils/storageHelper';
import { isGenericSchoolName } from '../utils/schoolNameResolver';
import campusBackdropImg from '../assets/images/smart_school_campus_1794653963006.jpg';

const PUBLIC_CACHE_KEY = 'smartschool_public_website_cache_v1';
const ACTIVE_PUBLIC_SCHOOL_KEY = 'smartschool_active_public_school_id';
const LEGACY_HERO_MOCKUP_PATH = '/assets/aistudio/school_hero.webp';

export const DEFAULT_CAMPUS_HERO_IMAGE = campusBackdropImg;

export function resolveCleanHeroImage(url?: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed === LEGACY_HERO_MOCKUP_PATH) {
    return DEFAULT_CAMPUS_HERO_IMAGE;
  }
  return trimmed;
}

export function isPlaceholderPublicSchool(data?: PublicSchoolWebsiteData | null): boolean {
  if (!data || !data.schoolId) return true;
  if (data.schoolId === 'local_school' || data.schoolId === 'school_main') return true;
  const enGeneric = isGenericSchoolName(data.schoolInfo?.nameEn);
  const bnGeneric = isGenericSchoolName(data.schoolInfo?.nameBn);
  return enGeneric && bnGeneric;
}

export const DEFAULT_HEADER_MENU_ITEMS: WebsiteHeaderMenuItem[] = [
  { id: 'home', labelEn: 'Home', labelBn: 'হোম', href: '#home', enabled: true },
  { id: 'about', labelEn: 'About Us', labelBn: 'আমাদের সম্পর্কে', href: '#about', enabled: true },
  { id: 'academics', labelEn: 'Academics', labelBn: 'একাডেমিক', href: '#academics', enabled: true },
  { id: 'admission', labelEn: 'Admission', labelBn: 'ভর্তি', href: '#admission', enabled: true },
  { id: 'students', labelEn: 'Students', labelBn: 'শিক্ষার্থী', href: '#programs', enabled: true },
  { id: 'parents', labelEn: 'Parents', labelBn: 'অভিভাবক', href: '#testimonials', enabled: true },
  { id: 'notices', labelEn: 'Notices', labelBn: 'নোটিশ', href: '#notices', enabled: true },
  { id: 'contact', labelEn: 'Contact', labelBn: 'যোগাযোগ', href: '#contact', enabled: true },
];

export const DEFAULT_FACILITIES: WebsiteFacilityItem[] = [
  {
    id: 'fac_smart_classroom',
    titleEn: 'Smart Classroom',
    titleBn: 'স্মার্ট শ্রেণিকক্ষ',
    descriptionEn: 'Multimedia projectors, interactive boards, and well-ventilated seating for engaging daily lessons.',
    descriptionBn: 'মাল্টিমিডিয়া প্রজেক্টর ও আধুনিক শিক্ষণ উপকরণ সমৃদ্ধ পরিচ্ছন্ন শ্রেণিকক্ষ।',
    iconKey: 'monitor',
    enabled: true,
  },
  {
    id: 'fac_computer_lab',
    titleEn: 'Computer Lab',
    titleBn: 'কম্পিউটার ও আইসিটি ল্যাব',
    descriptionEn: 'High-speed networked workstations for practical ICT, coding, and digital literacy.',
    descriptionBn: 'ব্যবহারিক আইসিটি ও ডিজিটাল দক্ষতা অর্জনের জন্য আধুনিক কম্পিউটার ল্যাব।',
    iconKey: 'cpu',
    enabled: true,
  },
  {
    id: 'fac_science_lab',
    titleEn: 'Science Lab',
    titleBn: 'বিজ্ঞান গবেষণাগার',
    descriptionEn: 'Dedicated Physics, Chemistry, and Biology apparatus for hands-on experiments.',
    descriptionBn: 'পদার্থ, রসায়ন ও জীববিজ্ঞানের ব্যবহারিক পরীক্ষার জন্য সমৃদ্ধ ল্যাবরেটরি।',
    iconKey: 'flask',
    enabled: true,
  },
  {
    id: 'fac_library',
    titleEn: 'Library',
    titleBn: 'সমৃদ্ধ পাঠাগার',
    descriptionEn: 'Curated collection of academic references, literature, science journals, and reading space.',
    descriptionBn: 'পাঠ্যসহায়ক বই, সাহিত্য ও জ্ঞান-বিজ্ঞানের বইয়ে সমৃদ্ধ শান্ত পরিবেশের পাঠাগার।',
    iconKey: 'book',
    enabled: true,
  },
  {
    id: 'fac_playground',
    titleEn: 'Playground',
    titleBn: 'খেলার মাঠ',
    descriptionEn: 'Spacious campus field for athletics, cricket, football, and annual sports activities.',
    descriptionBn: 'শিক্ষার্থীদের শারীরিক ও মানসিক বিকাশের জন্য প্রশস্ত ও নিরাপদ খেলার মাঠ।',
    iconKey: 'trophy',
    enabled: true,
  },
  {
    id: 'fac_transport',
    titleEn: 'Transport',
    titleBn: 'নিরাপদ পরিবহন ব্যবস্থা',
    descriptionEn: 'Managed school transport routes with verified drivers and scheduled pickup stops.',
    descriptionBn: 'নিরাপদ রুট ও সময়সূচি অনুযায়ী শিক্ষার্থীদের জন্য স্কুল পরিবহন সুবিধা।',
    iconKey: 'bus',
    enabled: true,
  },
  {
    id: 'fac_digital_attendance',
    titleEn: 'Digital Attendance',
    titleBn: 'ডিজিটাল হাজিরা',
    descriptionEn: 'Smart QR & instant attendance tracking keeping guardians informed in real time.',
    descriptionBn: 'স্মার্ট কিউআর ও ডিজিটাল উপস্থিতি যা অভিভাবকদের তাৎক্ষণিক নিশ্চয়তা দেয়।',
    iconKey: 'qr',
    enabled: true,
  },
  {
    id: 'fac_teachers',
    titleEn: 'Experienced Teachers',
    titleBn: 'অভিজ্ঞ শিক্ষকমণ্ডলী',
    descriptionEn: 'Qualified, caring subject specialists mentoring students academically and morally.',
    descriptionBn: 'যোগ্য, প্রশিক্ষিত ও যত্নশীল শিক্ষকমণ্ডলীর নিবিড় তত্ত্বাবধান ও পাঠদান।',
    iconKey: 'users',
    enabled: true,
  },
];

export const DEFAULT_WHY_CHOOSE_ITEMS: WebsiteWhyChooseItem[] = [
  {
    id: 'why_quality',
    titleEn: 'Quality Education',
    titleBn: 'মানসম্মত শিক্ষা',
    descriptionEn: 'Structured NCTB-aligned curriculum focused on conceptual clarity and academic excellence.',
    descriptionBn: 'জাতীয় শিক্ষাক্রম অনুসরণে সহজবোধ্য ও মানসম্মত পাঠদান পদ্ধতি।',
    iconKey: 'award',
    enabled: true,
  },
  {
    id: 'why_teachers',
    titleEn: 'Experienced Teachers',
    titleBn: 'দক্ষ ও অভিজ্ঞ শিক্ষক',
    descriptionEn: 'Dedicated educators committed to personalized guidance and continuous assessment.',
    descriptionBn: 'প্রতিটি শিক্ষার্থীর প্রতি ব্যক্তিগত যত্নশীল অভিজ্ঞ শিক্ষকমণ্ডলী।',
    iconKey: 'graduation',
    enabled: true,
  },
  {
    id: 'why_environment',
    titleEn: 'Modern Learning Environment',
    titleBn: 'আধুনিক শিক্ষার পরিবেশ',
    descriptionEn: 'Clean green campus with smart classrooms, science labs, library, and co-curricular clubs.',
    descriptionBn: 'সবুজ ক্যাম্পাস, স্মার্ট ক্লাসরুম ও সহশিক্ষা কার্যক্রমের আদর্শ পরিবেশ।',
    iconKey: 'sparkles',
    enabled: true,
  },
  {
    id: 'why_discipline',
    titleEn: 'Discipline and Values',
    titleBn: 'শৃঙ্খলা ও নৈতিক মূল্যবোধ',
    descriptionEn: 'Cultivating honesty, respect, responsibility, and leadership in daily school life.',
    descriptionBn: 'সততা, শৃঙ্খলা, মানবিক মূল্যবোধ ও নেতৃত্বের গুণাবলি চর্চা।',
    iconKey: 'heart',
    enabled: true,
  },
  {
    id: 'why_safety',
    titleEn: 'Student Safety',
    titleBn: 'শিক্ষার্থীর সার্বিক নিরাপত্তা',
    descriptionEn: 'Monitored campus entry, attendance verification, and attentive staff supervision.',
    descriptionBn: 'নিরাপদ ক্যাম্পাস, গেট মনিটরিং এবং সার্বক্ষণিক তত্ত্বাবধান।',
    iconKey: 'shield',
    enabled: true,
  },
  {
    id: 'why_erp',
    titleEn: 'Digital School Management',
    titleBn: 'ডিজিটাল স্কুল ব্যবস্থাপনা',
    descriptionEn: 'Transparent results, digital attendance, online fee tracking, and parent portal access.',
    descriptionBn: 'ফলাফল, হাজিরা, নোটিশ ও অভিভাবক পোর্টালসহ সম্পূর্ণ ডিজিটাল সিস্টেম।',
    iconKey: 'laptop',
    enabled: true,
  },
];

function pickNonEmpty(...values: Array<string | undefined | null>): string {
  for (const val of values) {
    const trimmed = typeof val === 'string' ? val.trim() : '';
    if (trimmed) return trimmed;
  }
  return '';
}

export function getDefaultWebsiteConfig(profile?: Partial<SchoolProfile>): WebsiteSettingsConfig {
  const existing = profile?.websiteConfig || {};
  return {
    isPublished: existing.isPublished ?? true,
    headerMenuItems:
      existing.headerMenuItems && existing.headerMenuItems.length > 0
        ? existing.headerMenuItems
        : DEFAULT_HEADER_MENU_ITEMS,
    admissionButtonTextEn: existing.admissionButtonTextEn || 'New Admission',
    admissionButtonTextBn: existing.admissionButtonTextBn || 'নতুন ভর্তি',
    heroBadgeEn: existing.heroBadgeEn || 'Welcome to Our School',
    heroBadgeBn:
      pickNonEmpty(existing.heroBadgeBn, profile?.heroTaglineBn) || 'আমাদের বিদ্যালয়ে স্বাগতম',
    heroHeadingEn: existing.heroHeadingEn || 'Build a Bright Future with Quality Education',
    heroHeadingHighlightEn: existing.heroHeadingHighlightEn || 'Quality Education',
    heroHeadingBn: existing.heroHeadingBn || 'মানসম্মত শিক্ষায় গড়ি উজ্জ্বল ভবিষ্যৎ',
    heroDescriptionEn:
      existing.heroDescriptionEn ||
      'Our institution is committed to providing quality education, moral values, discipline and modern learning opportunities for every student.',
    heroDescriptionBn:
      pickNonEmpty(existing.heroDescriptionBn, profile?.heroSubtitleBn) ||
      'মানসম্মত শিক্ষা, নৈতিক মূল্যবোধ, শৃঙ্খলা এবং আধুনিক শিক্ষার সুযোগ প্রদানের মাধ্যমে প্রতিটি শিক্ষার্থীর উজ্জ্বল ভবিষ্যৎ গঠনে আমাদের প্রতিষ্ঠান প্রতিশ্রুতিবদ্ধ।',
    heroPrimaryBtnEn: existing.heroPrimaryBtnEn || 'New Admission',
    heroPrimaryBtnBn: existing.heroPrimaryBtnBn || 'নতুন ভর্তি',
    heroSecondaryBtnEn: existing.heroSecondaryBtnEn || 'Explore Our School',
    heroSecondaryBtnBn: existing.heroSecondaryBtnBn || 'বিদ্যালয় সম্পর্কে জানুন',
    heroVideoBtnEn: existing.heroVideoBtnEn || 'Watch School Video',
    heroVideoBtnBn: existing.heroVideoBtnBn || 'বিদ্যালয়ের ভিডিও দেখুন',
    heroVideoUrl: existing.heroVideoUrl || '',
    statsDisplayMode: existing.statsDisplayMode || 'manual_or_live',
    statsOverrides: {
      students: pickNonEmpty(existing.statsOverrides?.students, profile?.statsStudents),
      teachers: pickNonEmpty(existing.statsOverrides?.teachers, profile?.statsTeachers),
      classes: pickNonEmpty(existing.statsOverrides?.classes, profile?.statsClassrooms),
      yearsOfExcellence: pickNonEmpty(
        existing.statsOverrides?.yearsOfExcellence,
        profile?.statsExperience
      ),
      successRate: existing.statsOverrides?.successRate?.trim() ?? '',
    },
    principalPhotoUrl: existing.principalPhotoUrl || '',
    principalDesignationEn: existing.principalDesignationEn || 'Principal',
    principalDesignationBn: existing.principalDesignationBn || 'প্রধান শিক্ষক / অধ্যক্ষ',
    principalMessageEn:
      existing.principalMessageEn ||
      'Our aim is to build a knowledgeable, disciplined and value-based generation prepared for tomorrow with confidence, compassion, and academic excellence.',
    principalMessageBn:
      existing.principalMessageBn ||
      'আমাদের লক্ষ্য হলো জ্ঞানসমৃদ্ধ, শৃঙ্খলাবদ্ধ এবং নৈতিক মূল্যবোধসম্পন্ন একটি আলোকিত প্রজন্ম গড়ে তোলা যারা আগামীর বাংলাদেশ নির্মাণে নেতৃত্ব দেবে।',
    aboutTitleEn: existing.aboutTitleEn || 'Shaping Young Minds with Excellence & Character',
    aboutTitleBn: existing.aboutTitleBn || 'সুশিক্ষা ও চরিত্র গঠনের নির্ভরযোগ্য প্রতিষ্ঠান',
    aboutDescriptionEn:
      existing.aboutDescriptionEn ||
      'Combining dedicated teaching, safe campus culture, science & ICT learning, and modern digital school management to help every learner reach their highest potential.',
    aboutDescriptionBn:
      existing.aboutDescriptionBn ||
      'অভিজ্ঞ শিক্ষক, নিরাপদ ক্যাম্পাস, বিজ্ঞান ও আইসিটি চর্চা এবং আধুনিক ডিজিটাল স্কুল ব্যবস্থাপনার সমন্বয়ে প্রতিটি শিক্ষার্থীর মেধা বিকাশে আমরা কাজ করে যাচ্ছি।',
    facilities:
      existing.facilities && existing.facilities.length > 0
        ? existing.facilities
        : DEFAULT_FACILITIES,
    gallery: existing.gallery || [],
    admissionBannerTitleEn: existing.admissionBannerTitleEn || 'Admission is Open',
    admissionBannerTitleBn: existing.admissionBannerTitleBn || 'ভর্তি কার্যক্রম চলছে',
    admissionBannerSubtitleEn:
      existing.admissionBannerSubtitleEn ||
      'Give your child the opportunity to learn, grow and succeed.',
    admissionBannerSubtitleBn:
      existing.admissionBannerSubtitleBn ||
      'আপনার সন্তানের শেখা, বেড়ে ওঠা এবং সাফল্যের সঠিক সুযোগ দিন।',
    admissionInfoEn:
      existing.admissionInfoEn ||
      'Applications are open for the upcoming academic session across Nursery to Class 10. Required documents: Birth Certificate copy, 2 passport photos, previous school academic transcript / TC (if applicable), and Guardian NID copy.',
    admissionInfoBn:
      existing.admissionInfoBn ||
      'আসন্ন শিক্ষাবর্ষে নার্সারি থেকে দশম শ্রেণি পর্যন্ত ভর্তি আবেদন চলছে। প্রয়োজনীয় কাগজপত্র: জন্ম নিবন্ধন সনদ, ২ কপি পাসপোর্ট ছবি, পূর্ববর্তী শ্রেণির নম্বরপত্র / ছাড়পত্র (প্রযোজ্য ক্ষেত্রে) এবং অভিভাবকের এনআইডি কপি।',
    whyChooseUs:
      existing.whyChooseUs && existing.whyChooseUs.length > 0
        ? existing.whyChooseUs
        : DEFAULT_WHY_CHOOSE_ITEMS,
    testimonials: existing.testimonials || [],
    programDescriptions: existing.programDescriptions || {},
    contactAddressEn: pickNonEmpty(existing.contactAddressEn, profile?.addressEn),
    contactAddressBn: pickNonEmpty(existing.contactAddressBn, profile?.addressBn),
    contactPhone: pickNonEmpty(existing.contactPhone, profile?.phone),
    contactEmail: pickNonEmpty(existing.contactEmail, profile?.email),
    officeHoursEn: existing.officeHoursEn || 'Saturday – Thursday: 8:00 AM – 4:00 PM',
    officeHoursBn: existing.officeHoursBn || 'শনিবার – বৃহস্পতিবার: সকাল ৮:০০ – বিকাল ৪:০০',
    googleMapEmbedUrl: existing.googleMapEmbedUrl || '',
    socialLinks: existing.socialLinks || {},
    footerTextEn:
      existing.footerTextEn ||
      'Committed to quality education, moral discipline, and holistic student development.',
    footerTextBn:
      existing.footerTextBn ||
      'মানসম্মত শিক্ষা, নৈতিক শৃঙ্খলা এবং শিক্ষার্থীদের সার্বিক বিকাশে প্রতিশ্রুতিবদ্ধ।',
    copyrightText:
      existing.copyrightText ||
      `© ${new Date().getFullYear()} ${profile?.nameEn || 'Smart School BD'}. All rights reserved.`,
    privacyPolicyText:
      existing.privacyPolicyText ||
      'We respect the privacy of students, parents, and visitors. Information submitted through online admission or contact forms is used strictly by authorized school administration and never shared publicly.',
    termsConditionsText:
      existing.termsConditionsText ||
      'All admission applications are subject to seat availability and institutional verification. Academic calendars, fee schedules, and exam notices published by the school administration apply to enrolled students.',
  };
}

export function buildAcademicProgramsFromERP(
  classes: ClassInfo[],
  subjects: Subject[],
  overrides: WebsiteSettingsConfig['programDescriptions'] = {}
): PublicAcademicProgramItem[] {
  const activeClasses = classes.filter((c) => c.isActive !== false);
  const activeNames = activeClasses.map((c) => c.name);
  const hasName = (re: RegExp) => activeClasses.some((c) => re.test(c.name));

  const getSubjectsFor = (classFilter: (s: Subject) => boolean) => {
    const filtered = subjects.filter(classFilter);
    const names = Array.from(new Set(filtered.map((s) => s.nameEn))).slice(0, 6);
    return { names, total: filtered.length };
  };

  const candidates: PublicAcademicProgramItem[] = [];

  // 1. Nursery / Play / KG
  const earlyClasses = activeClasses.filter((c) => /^(play|nurany|nursery|kg)$/i.test(c.name));
  if (earlyClasses.length > 0 || activeClasses.length === 0) {
    const subInfo = getSubjectsFor((s) => /^(play|nurany|nursery|kg)$/i.test(s.className));
    candidates.push({
      id: 'prog_nursery',
      key: 'nursery',
      titleEn: 'Nursery & Pre-Primary',
      titleBn: 'নার্সারি ও প্রাক-প্রাথমিক',
      subtitleEn: earlyClasses.map((c) => c.name).join(' • ') || 'Play • Nursery • KG',
      subtitleBn: earlyClasses.map((c) => c.nameBn).join(' • ') || 'প্লে • নার্সারি • কেজি',
      descriptionEn:
        'Joyful early childhood foundation focusing on phonics, numeracy, handwriting, rhymes, and creative expression.',
      descriptionBn:
        'ছবি, ছড়া, বর্ণমালা ও খেলার মাধ্যমে শিশুদের আনন্দময় প্রাথমিক শিক্ষার ভিত্তি গঠন।',
      subjectsPreview: subInfo.names,
      totalSubjects: subInfo.total,
      classesIncluded: earlyClasses.map((c) => c.name),
      sectionsPreview: Array.from(new Set(earlyClasses.flatMap((c) => c.sections || []))),
      shiftsPreview: Array.from(new Set(earlyClasses.flatMap((c) => c.shifts || []))),
      iconKey: 'palette',
    });
  }

  // 2. Primary (Class 1–5)
  const primaryClasses = activeClasses.filter((c) => /^class\s*[1-5]$/i.test(c.name));
  if (primaryClasses.length > 0 || activeClasses.length === 0) {
    const subInfo = getSubjectsFor((s) => /^class\s*[1-5]$/i.test(s.className));
    candidates.push({
      id: 'prog_primary',
      key: 'primary',
      titleEn: 'Primary (Class 1–5)',
      titleBn: 'প্রাথমিক শাখা (১ম – ৫ম শ্রেণি)',
      subtitleEn: primaryClasses.map((c) => c.name).join(', ') || 'Class 1 – Class 5',
      subtitleBn: '১ম থেকে ৫ম শ্রেণি',
      descriptionEn:
        'Strong literacy in Bangla and English, core Mathematics, Science, moral education, and activity-based learning.',
      descriptionBn:
        'বাংলা, ইংরেজি, গণিত, বিজ্ঞান ও নৈতিক শিক্ষার মাধ্যমে সুদৃঢ় প্রাথমিক শিক্ষা নিশ্চিতকরণ।',
      subjectsPreview: subInfo.names,
      totalSubjects: subInfo.total,
      classesIncluded: primaryClasses.map((c) => c.name),
      sectionsPreview: Array.from(new Set(primaryClasses.flatMap((c) => c.sections || []))),
      shiftsPreview: Array.from(new Set(primaryClasses.flatMap((c) => c.shifts || []))),
      iconKey: 'book',
    });
  }

  // 3. Junior Secondary (Class 6–8)
  const juniorClasses = activeClasses.filter((c) => /^class\s*[6-8]$/i.test(c.name));
  if (juniorClasses.length > 0 || activeClasses.length === 0) {
    const subInfo = getSubjectsFor((s) => /^class\s*[6-8]$/i.test(s.className));
    candidates.push({
      id: 'prog_junior',
      key: 'class_6_8',
      titleEn: 'Class 6–8 (Junior Secondary)',
      titleBn: 'নিম্ন মাধ্যমিক (৬ষ্ঠ – ৮ম শ্রেণি)',
      subtitleEn: juniorClasses.map((c) => c.name).join(', ') || 'Class 6 – Class 8',
      subtitleBn: '৬ষ্ঠ থেকে ৮ম শ্রেণি',
      descriptionEn:
        'Analytical thinking, Digital Technology, Mathematics, Science labs, and comprehensive academic assessments.',
      descriptionBn:
        'বিশ্লেষণধর্মী শিক্ষা, ডিজিটাল প্রযুক্তি, বিজ্ঞান ও গণিতে দক্ষতা বৃদ্ধির নিবিড় কার্যক্রম।',
      subjectsPreview: subInfo.names,
      totalSubjects: subInfo.total,
      classesIncluded: juniorClasses.map((c) => c.name),
      sectionsPreview: Array.from(new Set(juniorClasses.flatMap((c) => c.sections || []))),
      shiftsPreview: Array.from(new Set(juniorClasses.flatMap((c) => c.shifts || []))),
      iconKey: 'layers',
    });
  }

  // 4. Secondary (Class 9–10)
  const secondaryClasses = activeClasses.filter((c) => /^class\s*(9|10)$/i.test(c.name));
  if (secondaryClasses.length > 0 || activeClasses.length === 0) {
    const subInfo = getSubjectsFor((s) => /^class\s*(9|10)$/i.test(s.className));
    candidates.push({
      id: 'prog_secondary',
      key: 'class_9_10',
      titleEn: 'Class 9–10 (Secondary / SSC)',
      titleBn: 'মাধ্যমিক শাখা (৯ম – ১০ম শ্রেণি)',
      subtitleEn: secondaryClasses.map((c) => c.name).join(', ') || 'Class 9 – Class 10',
      subtitleBn: 'এসএসসি প্রস্তুতি ও বিভাগভিত্তিক পাঠদান',
      descriptionEn:
        'Board exam preparation with regular model tests, practical lab sessions, and specialized group mentoring.',
      descriptionBn:
        'মডেল টেস্ট, ব্যবহারিক ক্লাস ও অভিজ্ঞ শিক্ষকদের তত্ত্বাবধানে এসএসসি বোর্ড পরীক্ষার পূর্ণাঙ্গ প্রস্তুতি।',
      subjectsPreview: subInfo.names,
      totalSubjects: subInfo.total,
      classesIncluded: secondaryClasses.map((c) => c.name),
      sectionsPreview: Array.from(new Set(secondaryClasses.flatMap((c) => c.sections || []))),
      shiftsPreview: Array.from(new Set(secondaryClasses.flatMap((c) => c.shifts || []))),
      iconKey: 'graduation',
    });
  }

  const hasGroupsInClasses = activeClasses.some((c) => c.hasGroups) || hasName(/^class\s*(9|10)$/i);

  // 5. Science Group
  const scienceSubs = getSubjectsFor((s) => s.group === 'Science');
  if (hasGroupsInClasses || scienceSubs.total > 0) {
    candidates.push({
      id: 'prog_science',
      key: 'science',
      titleEn: 'Science Group',
      titleBn: 'বিজ্ঞান বিভাগ',
      subtitleEn: 'Physics • Chemistry • Biology • Higher Math',
      subtitleBn: 'পদার্থবিজ্ঞান • রসায়ন • জীববিজ্ঞান • উচ্চতর গণিত',
      descriptionEn:
        'In-depth theoretical and practical science education equipping learners for engineering, medical, and STEM pathways.',
      descriptionBn:
        'হাতে-কলমে ল্যাব ব্যবহারিকসহ বিজ্ঞান ও প্রযুক্তিতে উচ্চশিক্ষার সুদৃঢ় ভিত্তি।',
      subjectsPreview:
        scienceSubs.names.length > 0
          ? scienceSubs.names
          : ['Physics', 'Chemistry', 'Biology', 'Higher Mathematics'],
      totalSubjects: scienceSubs.total,
      classesIncluded: secondaryClasses.map((c) => c.name),
      sectionsPreview: [],
      shiftsPreview: ['Day'],
      iconKey: 'atom',
    });
  }

  // 6. Humanities Group
  const humanitiesSubs = getSubjectsFor((s) => s.group === 'Humanities' || s.group === 'Arts');
  if (hasGroupsInClasses || humanitiesSubs.total > 0) {
    candidates.push({
      id: 'prog_humanities',
      key: 'humanities',
      titleEn: 'Humanities Group',
      titleBn: 'মানবিক বিভাগ',
      subtitleEn: 'History • Civics • Geography • Economics',
      subtitleBn: 'ইতিহাস • পৌরনীতি • ভূগোল • অর্থনীতি',
      descriptionEn:
        'Developing civic awareness, critical writing, social research, and leadership skills across humanities disciplines.',
      descriptionBn:
        'ইতিহাস, সমাজবিজ্ঞান, অর্থনীতি ও নাগরিক মূল্যবোধ চর্চায় সমৃদ্ধ মানবিক বিভাগ।',
      subjectsPreview:
        humanitiesSubs.names.length > 0
          ? humanitiesSubs.names
          : ['History & Civilization', 'Civics & Citizenship', 'Geography', 'Economics'],
      totalSubjects: humanitiesSubs.total,
      classesIncluded: secondaryClasses.map((c) => c.name),
      sectionsPreview: [],
      shiftsPreview: ['Day'],
      iconKey: 'globe',
    });
  }

  // 7. Business Studies Group
  const businessSubs = getSubjectsFor(
    (s) => s.group === 'Business Studies' || s.group === 'Commerce'
  );
  if (hasGroupsInClasses || businessSubs.total > 0) {
    candidates.push({
      id: 'prog_business',
      key: 'business_studies',
      titleEn: 'Business Studies',
      titleBn: 'ব্যবসায় শিক্ষা বিভাগ',
      subtitleEn: 'Accounting • Finance • Business Ent. • Management',
      subtitleBn: 'হিসাববিজ্ঞান • ফিন্যান্স ও ব্যাংকিং • ব্যবসায় উদ্যোগ',
      descriptionEn:
        'Practical foundations in accounting, finance, banking, and modern entrepreneurship.',
      descriptionBn:
        'হিসাববিজ্ঞান, ফিন্যান্স, ব্যাংকিং ও আধুনিক ব্যবসায় উদ্যোগের বাস্তবমুখী শিক্ষা।',
      subjectsPreview:
        businessSubs.names.length > 0
          ? businessSubs.names
          : ['Accounting', 'Finance & Banking', 'Business Entrepreneurship'],
      totalSubjects: businessSubs.total,
      classesIncluded: secondaryClasses.map((c) => c.name),
      sectionsPreview: [],
      shiftsPreview: ['Day'],
      iconKey: 'briefcase',
    });
  }

  // Any custom classes not in Nursery-10 (e.g., Class 11/12 or Hifz/Alim)
  const standardRegex = /^(play|nurany|nursery|kg|class\s*([1-9]|10))$/i;
  const customClasses = activeClasses.filter((c) => !standardRegex.test(c.name));
  if (customClasses.length > 0) {
    const customNames = new Set(customClasses.map((c) => c.name));
    const subInfo = getSubjectsFor((s) => customNames.has(s.className));
    candidates.push({
      id: 'prog_special',
      key: 'special',
      titleEn: customClasses.map((c) => c.name).join(', '),
      titleBn: customClasses.map((c) => c.nameBn).join(', '),
      subtitleEn: `${customClasses.length} Specialized Program(s)`,
      subtitleBn: `${customClasses.length}টি বিশেষ শ্রেণি`,
      descriptionEn: 'Active specialized academic programs offered by our institution.',
      descriptionBn: 'আমাদের প্রতিষ্ঠানে পরিচালিত বিশেষ একাডেমিক প্রোগ্রামসমূহ।',
      subjectsPreview: subInfo.names,
      totalSubjects: subInfo.total,
      classesIncluded: customClasses.map((c) => c.name),
      sectionsPreview: Array.from(new Set(customClasses.flatMap((c) => c.sections || []))),
      shiftsPreview: Array.from(new Set(customClasses.flatMap((c) => c.shifts || []))),
      iconKey: 'sparkles',
    });
  }

  return candidates
    .filter((item) => overrides?.[item.key]?.enabled !== false)
    .map((item) => {
      const ov = overrides?.[item.key];
      if (!ov) return item;
      return {
        ...item,
        titleEn: ov.titleEn?.trim() || item.titleEn,
        titleBn: ov.titleBn?.trim() || item.titleBn,
        descriptionEn: ov.descriptionEn?.trim() || item.descriptionEn,
        descriptionBn: ov.descriptionBn?.trim() || item.descriptionBn,
        imageUrl: ov.imageUrl || item.imageUrl,
      };
    });
}

export function computeRealSchoolStats(params: {
  profile: SchoolProfile;
  students: Student[];
  staff: Staff[];
  classes: ClassInfo[];
  marks: MarksEntry[];
  subjects: Subject[];
  exams: Exam[];
}): PublicSchoolWebsiteData['stats'] {
  const { profile, students, staff, classes, marks, subjects } = params;
  const activeStudentsCount = students.filter(
    (s) => s.status !== 'inactive' && s.status !== 'transferred'
  ).length;
  const activeTeachersCount = staff.filter(
    (s) => s.status === 'active' && (s.role === 'teacher' || s.role === 'admin' || s.role === 'super_admin' || !s.role)
  ).length;
  const activeClassesCount = classes.filter((c) => c.isActive !== false).length;

  let actualSuccessRate: number | null = null;
  if (marks.length > 0) {
    const subjectPassMap = new Map<string, number>();
    subjects.forEach((sub) => {
      subjectPassMap.set(sub.id, sub.passMarks || 33);
    });
    const evaluated = marks.filter((m) =>
      Number.isFinite(Number(m.totalMarks ?? m.total))
    );
    if (evaluated.length > 0) {
      const passed = evaluated.filter((m) => {
        if (typeof m.isPassed === 'boolean') return m.isPassed;
        const passMark = subjectPassMap.get(m.subjectId) ?? 33;
        return Number(m.totalMarks ?? m.total) >= passMark;
      }).length;
      actualSuccessRate = Math.round((passed / evaluated.length) * 100);
    }
  }

  const websiteConfig = getDefaultWebsiteConfig(profile);

  return {
    actualStudentsCount: activeStudentsCount,
    actualTeachersCount: activeTeachersCount,
    actualClassesCount: activeClassesCount,
    actualSuccessRate,
    manualOverrides: {
      students: pickNonEmpty(websiteConfig.statsOverrides?.students, profile.statsStudents),
      teachers: pickNonEmpty(websiteConfig.statsOverrides?.teachers, profile.statsTeachers),
      classes: pickNonEmpty(websiteConfig.statsOverrides?.classes, profile.statsClassrooms),
      yearsOfExcellence: pickNonEmpty(
        websiteConfig.statsOverrides?.yearsOfExcellence,
        profile.statsExperience
      ),
      successRate: websiteConfig.statsOverrides?.successRate?.trim() ?? '',
    },
  };
}

export function resolvePublicStatCards(
  data: PublicSchoolWebsiteData,
  language: 'en' | 'bn'
): {
  id: string;
  value: string;
  label: string;
  isConfigured: boolean;
}[] {
  const { stats, schoolInfo, websiteConfig } = data;
  const ov = stats.manualOverrides || {};
  const preferLiveOnly = websiteConfig?.statsDisplayMode === 'live_only';

  const parseOverride = (val?: string) => {
    const trimmed = (val || '').trim();
    if (!trimmed || trimmed === '0' || trimmed === '০') return '';
    return trimmed;
  };

  // 1. Students
  const studentsOverride = parseOverride(ov.students);
  const studentsVal = preferLiveOnly
    ? stats.actualStudentsCount > 0
      ? stats.actualStudentsCount.toLocaleString()
      : studentsOverride || '0'
    : studentsOverride ||
      (stats.actualStudentsCount > 0 ? stats.actualStudentsCount.toLocaleString() : '0');

  // 2. Teachers
  const teachersOverride = parseOverride(ov.teachers);
  const teachersVal = preferLiveOnly
    ? stats.actualTeachersCount > 0
      ? stats.actualTeachersCount.toLocaleString()
      : teachersOverride || '0'
    : teachersOverride ||
      (stats.actualTeachersCount > 0 ? stats.actualTeachersCount.toLocaleString() : '0');

  // 3. Classes
  const classesOverride = parseOverride(ov.classes);
  const classesVal = preferLiveOnly
    ? stats.actualClassesCount > 0
      ? stats.actualClassesCount.toLocaleString()
      : classesOverride || '0'
    : classesOverride ||
      (stats.actualClassesCount > 0 ? stats.actualClassesCount.toLocaleString() : '0');

  // 4. Years of Excellence (Manual override or calculated from valid establishedYear)
  const yearsOverride = parseOverride(ov.yearsOfExcellence);
  let yearsVal = preferLiveOnly ? '' : yearsOverride;
  if (!yearsVal) {
    const estNum = Number(schoolInfo.establishedYear);
    const currentYear = new Date().getFullYear();
    if (Number.isFinite(estNum) && estNum >= 1850 && estNum <= currentYear) {
      const diff = Math.max(1, currentYear - estNum);
      yearsVal = `${diff}+`;
    } else {
      yearsVal = yearsOverride || '0';
    }
  }

  // 5. Success Rate (Admin override or real exam pass rate, else 0%)
  const rateOverride = parseOverride(ov.successRate);
  let successVal = '';
  if (preferLiveOnly) {
    if (stats.actualSuccessRate !== null) {
      successVal = `${stats.actualSuccessRate}%`;
    } else if (rateOverride) {
      successVal = rateOverride.includes('%') ? rateOverride : `${rateOverride}%`;
    } else {
      successVal = '0%';
    }
  } else if (rateOverride) {
    successVal = rateOverride.includes('%') ? rateOverride : `${rateOverride}%`;
  } else if (stats.actualSuccessRate !== null) {
    successVal = `${stats.actualSuccessRate}%`;
  } else {
    successVal = '0%';
  }

  return [
    {
      id: 'students',
      value: studentsVal,
      label: language === 'bn' ? 'মোট শিক্ষার্থী' : 'Total Students',
      isConfigured: studentsVal !== '0',
    },
    {
      id: 'teachers',
      value: teachersVal,
      label: language === 'bn' ? 'মোট শিক্ষক' : 'Total Teachers',
      isConfigured: teachersVal !== '0',
    },
    {
      id: 'classes',
      value: classesVal,
      label: language === 'bn' ? 'মোট শ্রেণি' : 'Total Classes',
      isConfigured: classesVal !== '0',
    },
    {
      id: 'years',
      value: yearsVal,
      label: language === 'bn' ? 'গৌরবময় বছর' : 'Years of Excellence',
      isConfigured: yearsVal !== '0',
    },
    {
      id: 'success',
      value: successVal,
      label: language === 'bn' ? 'সাফল্যের হার' : 'Success Rate',
      isConfigured: successVal !== '0%',
    },
  ];
}

function readPublicCacheMap(): Record<string, PublicSchoolWebsiteData> {
  try {
    const raw = safeGetLocalStorage(PUBLIC_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getCachedPublicWebsite(schoolId?: string): PublicSchoolWebsiteData | null {
  const map = readPublicCacheMap();
  if (schoolId && schoolId !== 'local_school' && map[schoolId] && !isPlaceholderPublicSchool(map[schoolId])) {
    return map[schoolId];
  }
  const preferredId = safeGetLocalStorage(ACTIVE_PUBLIC_SCHOOL_KEY);
  if (preferredId && preferredId !== 'local_school' && map[preferredId] && !isPlaceholderPublicSchool(map[preferredId])) {
    return map[preferredId];
  }
  const realValues = Object.values(map).filter((w) => !isPlaceholderPublicSchool(w));
  if (realValues.length > 0) {
    return realValues.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
  }
  if (schoolId && map[schoolId]) {
    return map[schoolId];
  }
  return null;
}

export function getAllCachedPublicWebsites(): PublicSchoolWebsiteData[] {
  const map = readPublicCacheMap();
  return Object.values(map).filter(
    (w) => w && w.isPublished !== false && !isPlaceholderPublicSchool(w)
  );
}

export function saveCachedPublicWebsite(data: PublicSchoolWebsiteData): void {
  try {
    const map = readPublicCacheMap();
    if (!isPlaceholderPublicSchool(data)) {
      delete map['local_school'];
      delete map['school_main'];
      map[data.schoolId] = data;
      safeSetLocalStorage(PUBLIC_CACHE_KEY, JSON.stringify(map));
      safeSetLocalStorage(ACTIVE_PUBLIC_SCHOOL_KEY, data.schoolId);
      return;
    }
    const hasRealSchool = Object.values(map).some((w) => !isPlaceholderPublicSchool(w));
    if (!hasRealSchool) {
      map[data.schoolId] = data;
      safeSetLocalStorage(PUBLIC_CACHE_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function getPreferredPublicSchoolId(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const paramSchool = params.get('school') || params.get('schoolId') || params.get('code');
    if (paramSchool && /^[a-zA-Z0-9_-]{1,128}$/.test(paramSchool.trim())) {
      return paramSchool.trim();
    }
    const pathMatch = window.location.pathname.match(/^\/school\/([a-zA-Z0-9_-]{1,128})/);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }
  }
  return (
    safeGetLocalStorage('school_erp_active_saas_school_id') ||
    safeGetLocalStorage(ACTIVE_PUBLIC_SCHOOL_KEY) ||
    ''
  );
}

export function setPreferredPublicSchoolId(schoolId: string): void {
  if (!schoolId) return;
  safeSetLocalStorage(ACTIVE_PUBLIC_SCHOOL_KEY, schoolId);
}

function trimPayloadForFirestore(payload: PublicSchoolWebsiteData): PublicSchoolWebsiteData {
  // Keep Firestore document comfortably below the 1 MiB document size ceiling
  const copy: PublicSchoolWebsiteData = JSON.parse(JSON.stringify(payload));
  copy.notices = copy.notices.slice(0, 50);
  copy.blogPosts = copy.blogPosts.slice(0, 30);

  const measure = () => JSON.stringify(copy).length;
  if (measure() <= 850_000) return copy;

  // Progressively trim large embedded gallery or blog images only if doc exceeds 850KB
  if (copy.websiteConfig.gallery && copy.websiteConfig.gallery.length > 12) {
    copy.websiteConfig.gallery = copy.websiteConfig.gallery.slice(0, 12);
  }
  if (measure() <= 850_000) return copy;

  copy.blogPosts = copy.blogPosts.map((b, idx) =>
    idx > 6 && b.coverImage && b.coverImage.startsWith('data:')
      ? { ...b, coverImage: undefined }
      : b
  );
  return copy;
}

export function buildPublicWebsitePayloadFromERP(params: {
  schoolId: string;
  profile: SchoolProfile;
  classes: ClassInfo[];
  subjects: Subject[];
  students: Student[];
  staff: Staff[];
  notices: Notice[];
  blogPosts: BlogPost[];
  marks: MarksEntry[];
  exams: Exam[];
}): PublicSchoolWebsiteData {
  const { schoolId, profile, classes, subjects, students, staff, notices, blogPosts, marks, exams } =
    params;

  const websiteConfig = getDefaultWebsiteConfig(profile);
  const publicNotices: PublicNoticeSummary[] = notices
    .filter((n) => n.targetAudience === 'All')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 60)
    .map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      date: n.date,
      category: n.category,
      author: n.author,
      isImportant: Boolean(n.isImportant),
    }));

  const publicBlogs: PublicBlogSummary[] = blogPosts
    .filter((b) => b.published)
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, 30)
    .map((b) => ({
      id: b.id,
      titleEn: b.titleEn,
      titleBn: b.titleBn,
      category: b.category,
      categoryBn: b.categoryBn,
      excerpt: b.excerpt,
      content: b.content,
      coverImage:
        b.coverImage && b.coverImage !== LEGACY_HERO_MOCKUP_PATH ? b.coverImage : undefined,
      authorName: b.authorName,
      authorRole: b.authorRole,
      publishedAt: b.publishedAt,
      featured: Boolean(b.featured),
    }));

  const academicPrograms = buildAcademicProgramsFromERP(
    classes,
    subjects,
    websiteConfig.programDescriptions
  );
  const activeClasses = classes
    .filter((c) => c.isActive !== false)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.name);

  const stats = computeRealSchoolStats({
    profile,
    students,
    staff,
    classes,
    marks,
    subjects,
    exams,
  });

  const cleanHeroUrl =
    profile.heroImageUrl && profile.heroImageUrl !== LEGACY_HERO_MOCKUP_PATH
      ? profile.heroImageUrl
      : '';
  const cleanAboutUrl =
    profile.aboutImageUrl && profile.aboutImageUrl !== LEGACY_HERO_MOCKUP_PATH
      ? profile.aboutImageUrl
      : '';

  return {
    schoolId,
    schoolCode: profile.schoolCode || schoolId,
    isPublished: websiteConfig.isPublished !== false,
    updatedAt: new Date().toISOString(),
    schoolInfo: {
      nameEn: profile.nameEn || 'Smart School BD',
      nameBn: profile.nameBn || 'স্মার্ট স্কুল বিডি',
      eiin: profile.eiin || '',
      schoolCode: profile.schoolCode || schoolId,
      phone: websiteConfig.contactPhone || profile.phone || '',
      email: websiteConfig.contactEmail || profile.email || '',
      website: profile.website || '',
      addressEn: websiteConfig.contactAddressEn || profile.addressEn || '',
      addressBn: websiteConfig.contactAddressBn || profile.addressBn || '',
      establishedYear: profile.establishedYear || '',
      currentSession: profile.currentSession || String(new Date().getFullYear()),
      logoUrl: profile.logoUrl || '',
      heroImageUrl: cleanHeroUrl,
      aboutImageUrl: cleanAboutUrl,
      heroTaglineEn: websiteConfig.heroBadgeEn || profile.heroTaglineEn || '',
      heroTaglineBn: websiteConfig.heroBadgeBn || profile.heroTaglineBn || '',
      heroSubtitleEn: websiteConfig.heroDescriptionEn || profile.heroSubtitleEn || '',
      heroSubtitleBn: websiteConfig.heroDescriptionBn || profile.heroSubtitleBn || '',
      mottoEn: profile.mottoEn || '',
      mottoBn: profile.mottoBn || '',
      principalNameEn: profile.principalNameEn || '',
      principalNameBn: profile.principalNameBn || '',
    },
    stats,
    notices: publicNotices,
    blogPosts: publicBlogs,
    academicPrograms,
    activeClasses,
    websiteConfig,
  };
}

function cleanUndefinedDeep<T>(val: T): T {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((item) => cleanUndefinedDeep(item)) as unknown as T;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) {
      out[k] = cleanUndefinedDeep(v);
    }
  }
  return out as T;
}

export async function publishPublicWebsiteSnapshot(
  payload: PublicSchoolWebsiteData
): Promise<boolean> {
  // Always update local cache so same-browser public preview stays instant
  saveCachedPublicWebsite(payload);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('public_website_updated', { detail: payload }));
  }

  const schoolId = payload.schoolId;
  if (!auth.currentUser || !schoolId || !/^[a-zA-Z0-9_-]{1,128}$/.test(schoolId)) {
    return false;
  }

  // Only push to Firestore when signed-in user belongs to an active SaaS tenant (or Master Admin)
  const activeSaasId = safeGetLocalStorage('school_erp_active_saas_school_id');
  if (!activeSaasId && schoolId === 'local_school') {
    return false;
  }

  const targetId = activeSaasId || schoolId;
  const trimmed = cleanUndefinedDeep(trimPayloadForFirestore({ ...payload, schoolId: targetId }));

  try {
    await setDoc(doc(db, 'public_websites', targetId), trimmed);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `public_websites/${targetId}`);
    return false;
  }
}

export async function fetchPublicWebsiteFromFirestore(
  schoolId: string
): Promise<PublicSchoolWebsiteData | null> {
  if (!schoolId || !/^[a-zA-Z0-9_-]{1,128}$/.test(schoolId)) return null;
  try {
    const snap = await getDoc(doc(db, 'public_websites', schoolId));
    if (!snap.exists()) return null;
    const data = snap.data() as PublicSchoolWebsiteData;
    saveCachedPublicWebsite(data);
    return data;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `public_websites/${schoolId}`);
    return null;
  }
}

export async function listPublishedSchoolsFromFirestore(): Promise<PublicSchoolWebsiteData[]> {
  try {
    const q = query(
      collection(db, 'public_websites'),
      where('isPublished', '==', true),
      limit(25)
    );
    const snaps = await getDocs(q);
    const list: PublicSchoolWebsiteData[] = [];
    snaps.forEach((docSnap) => {
      const data = docSnap.data() as PublicSchoolWebsiteData;
      if (data && data.schoolId && !isPlaceholderPublicSchool(data)) {
        saveCachedPublicWebsite(data);
        list.push(data);
      }
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'public_websites');
    return [];
  }
}

export async function submitPublicAdmissionApplication(
  schoolId: string,
  input: Omit<AdmissionEnquiry, 'id' | 'status' | 'appliedDate' | 'applicationNo'>
): Promise<{ success: boolean; enquiry?: AdmissionEnquiry; savedToCloud: boolean; error?: string }> {
  const id = `adm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const applicationNo = `APP-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const appliedDate = new Date().toISOString().split('T')[0];
  const createdAt = new Date().toISOString();

  const enquiry: AdmissionEnquiry = {
    id,
    applicationNo,
    photoUrl: input.photoUrl || undefined,
    applicantNameEn: input.applicantNameEn.trim().slice(0, 160),
    applicantNameBn: (input.applicantNameBn || input.applicantNameEn).trim().slice(0, 160),
    applyingClass: input.applyingClass.trim().slice(0, 60),
    gender: input.gender === 'Female' ? 'Female' : 'Male',
    dob: input.dob.trim().slice(0, 32),
    bloodGroup: input.bloodGroup?.trim().slice(0, 16) || undefined,
    guardianName: input.guardianName.trim().slice(0, 160),
    phone: input.phone.trim().slice(0, 32),
    email: input.email?.trim().slice(0, 160) || undefined,
    address: input.address.trim().slice(0, 400),
    previousSchool: input.previousSchool?.trim().slice(0, 200) || undefined,
    gpa: input.gpa?.trim().slice(0, 20) || undefined,
    remarks: input.remarks?.trim().slice(0, 500) || undefined,
    status: 'Pending',
    appliedDate,
  };

  let savedToCloud = false;
  if (schoolId && schoolId !== 'local_school' && /^[a-zA-Z0-9_-]{1,128}$/.test(schoolId)) {
    const cloudDoc = cleanUndefinedDeep({
      id,
      schoolId,
      applicationNo,
      photoUrl: enquiry.photoUrl && enquiry.photoUrl.length <= 240000 ? enquiry.photoUrl : undefined,
      applicantNameEn: enquiry.applicantNameEn,
      applicantNameBn: enquiry.applicantNameBn,
      applyingClass: enquiry.applyingClass,
      gender: enquiry.gender,
      dob: enquiry.dob,
      bloodGroup: enquiry.bloodGroup,
      guardianName: enquiry.guardianName,
      phone: enquiry.phone,
      email: enquiry.email,
      address: enquiry.address,
      previousSchool: enquiry.previousSchool,
      gpa: enquiry.gpa,
      remarks: enquiry.remarks,
      status: 'Pending' as const,
      appliedDate,
      createdAt,
    });
    try {
      await setDoc(doc(db, 'public_websites', schoolId, 'public_admissions', id), cloudDoc);
      savedToCloud = true;
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `public_websites/${schoolId}/public_admissions/${id}`
      );
    }
  }

  return { success: true, enquiry, savedToCloud };
}

export async function submitPublicContactMessage(
  schoolId: string,
  input: {
    senderName: string;
    phone: string;
    email?: string;
    subject?: string;
    message: string;
  }
): Promise<{ success: boolean; message?: WebsiteMessage; savedToCloud: boolean; error?: string }> {
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const sentAt = `${now.toISOString().split('T')[0]} ${now.toTimeString().slice(0, 5)}`;
  const createdAt = now.toISOString();

  const localMsg: WebsiteMessage = {
    id,
    senderName: input.senderName.trim().slice(0, 160),
    phone: input.phone.trim().slice(0, 32),
    email: input.email?.trim().slice(0, 160) || undefined,
    subject: input.subject?.trim().slice(0, 200) || undefined,
    message: input.message.trim().slice(0, 3000),
    sentAt,
    isRead: false,
  };

  let savedToCloud = false;
  if (schoolId && schoolId !== 'local_school' && /^[a-zA-Z0-9_-]{1,128}$/.test(schoolId)) {
    const cloudDoc = cleanUndefinedDeep({
      id,
      schoolId,
      senderName: localMsg.senderName,
      phone: localMsg.phone,
      email: localMsg.email,
      subject: localMsg.subject,
      message: localMsg.message,
      sentAt,
      isRead: false,
      createdAt,
    });
    try {
      await setDoc(doc(db, 'public_websites', schoolId, 'public_messages', id), cloudDoc);
      savedToCloud = true;
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `public_websites/${schoolId}/public_messages/${id}`
      );
    }
  }

  return { success: true, message: localMsg, savedToCloud };
}

export async function fetchPublicAdmissionsQueue(schoolId: string): Promise<AdmissionEnquiry[]> {
  if (!auth.currentUser || !schoolId || !/^[a-zA-Z0-9_-]{1,128}$/.test(schoolId)) {
    return [];
  }
  try {
    const snaps = await getDocs(
      query(collection(db, 'public_websites', schoolId, 'public_admissions'), limit(100))
    );
    const items: AdmissionEnquiry[] = [];
    snaps.forEach((docSnap) => {
      const d = docSnap.data() as any;
      if (d?.id && d?.applicantNameEn) {
        items.push({
          id: d.id,
          applicationNo: d.applicationNo,
          photoUrl: d.photoUrl,
          applicantNameEn: d.applicantNameEn,
          applicantNameBn: d.applicantNameBn || d.applicantNameEn,
          applyingClass: d.applyingClass,
          gender: d.gender === 'Female' ? 'Female' : 'Male',
          dob: d.dob,
          bloodGroup: d.bloodGroup,
          guardianName: d.guardianName,
          phone: d.phone,
          email: d.email,
          address: d.address,
          previousSchool: d.previousSchool,
          gpa: d.gpa,
          remarks: d.remarks,
          status: d.status || 'Pending',
          appliedDate: d.appliedDate || new Date().toISOString().split('T')[0],
        });
      }
    });
    return items;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.LIST,
      `public_websites/${schoolId}/public_admissions`
    );
    return [];
  }
}

export async function fetchPublicMessagesInbox(schoolId: string): Promise<WebsiteMessage[]> {
  if (!auth.currentUser || !schoolId || !/^[a-zA-Z0-9_-]{1,128}$/.test(schoolId)) {
    return [];
  }
  try {
    const snaps = await getDocs(
      query(collection(db, 'public_websites', schoolId, 'public_messages'), limit(100))
    );
    const items: WebsiteMessage[] = [];
    snaps.forEach((docSnap) => {
      const d = docSnap.data() as any;
      if (d?.id && d?.senderName) {
        items.push({
          id: d.id,
          senderName: d.senderName,
          phone: d.phone,
          email: d.email,
          subject: d.subject,
          message: d.message,
          sentAt: d.sentAt,
          isRead: Boolean(d.isRead),
        });
      }
    });
    return items;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.LIST,
      `public_websites/${schoolId}/public_messages`
    );
    return [];
  }
}
