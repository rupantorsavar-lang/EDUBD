import { Student } from '../types';

export type NormalizedGender = 'male' | 'female' | 'other';
export type NormalizedReligion = 'islam' | 'hinduism' | 'christianity' | 'buddhism' | 'other';

export interface StudentDemographicCounts {
  total: number;
  active: number;
  male: number;
  female: number;
  otherGender: number;
  islam: number;
  hinduism: number;
  christianity: number;
  buddhism: number;
  otherReligion: number;
  morningShift: number;
  dayShift: number;
}

export interface ClassDemographicRow extends StudentDemographicCounts {
  className: string;
  sections: string[];
}

export interface ClassWiseDemographicsResult {
  rows: ClassDemographicRow[];
  totals: StudentDemographicCounts;
}

export const STANDARD_CLASS_ORDER = [
  'Play',
  'Nurany',
  'Nursery',
  'KG',
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
] as const;

export function normalizeStudentGender(gender?: string | null): NormalizedGender {
  const g = (gender || '').trim().toLowerCase();
  if (!g) return 'other';
  if (g === 'male' || g === 'm' || g === 'boy' || g === 'boys' || g === 'ছাত্র' || g === 'পুরুষ' || g === 'বালক') {
    return 'male';
  }
  if (g === 'female' || g === 'f' || g === 'girl' || g === 'girls' || g === 'ছাত্রী' || g === 'মহিলা' || g === 'নারী' || g === 'বালিকা') {
    return 'female';
  }
  return 'other';
}

export function normalizeStudentReligion(religion?: string | null): NormalizedReligion {
  const r = (religion || '').trim().toLowerCase();
  if (!r) return 'other';
  if (
    r === 'islam' ||
    r === 'muslim' ||
    r.includes('islam') ||
    r.includes('muslim') ||
    r.includes('ইসলাম') ||
    r.includes('মুসলিম') ||
    r.includes('মুসলমান')
  ) {
    return 'islam';
  }
  if (
    r === 'hinduism' ||
    r === 'hindu' ||
    r.includes('hindu') ||
    r.includes('হিন্দু') ||
    r.includes('সনাতন')
  ) {
    return 'hinduism';
  }
  if (
    r === 'christianity' ||
    r === 'christian' ||
    r.includes('christ') ||
    r.includes('খ্রিস্ট') ||
    r.includes('খ্রিষ্ট')
  ) {
    return 'christianity';
  }
  if (
    r === 'buddhism' ||
    r === 'buddhist' ||
    r.includes('buddh') ||
    r.includes('বৌদ্ধ')
  ) {
    return 'buddhism';
  }
  return 'other';
}

export function formatGenderLabel(gender?: string | null, language: 'bn' | 'en' = 'bn'): string {
  const norm = normalizeStudentGender(gender);
  if (norm === 'male') return language === 'bn' ? 'ছাত্র' : 'Boy';
  if (norm === 'female') return language === 'bn' ? 'ছাত্রী' : 'Girl';
  return language === 'bn' ? 'অন্যান্য' : 'Other';
}

export function formatReligionLabel(religion?: string | null, language: 'bn' | 'en' = 'bn'): string {
  const norm = normalizeStudentReligion(religion);
  if (norm === 'islam') return language === 'bn' ? 'মুসলিম' : 'Islam';
  if (norm === 'hinduism') return language === 'bn' ? 'হিন্দু' : 'Hindu';
  if (norm === 'christianity') return language === 'bn' ? 'খ্রিস্টান' : 'Christian';
  if (norm === 'buddhism') return language === 'bn' ? 'বৌদ্ধ' : 'Buddhist';
  return language === 'bn' ? 'অন্যান্য' : 'Other';
}

export function computeStudentDemographics(students: Student[]): StudentDemographicCounts {
  const counts: StudentDemographicCounts = {
    total: students.length,
    active: 0,
    male: 0,
    female: 0,
    otherGender: 0,
    islam: 0,
    hinduism: 0,
    christianity: 0,
    buddhism: 0,
    otherReligion: 0,
    morningShift: 0,
    dayShift: 0,
  };

  for (const s of students) {
    if (s.status === 'active') counts.active += 1;

    const gender = normalizeStudentGender(s.gender);
    if (gender === 'male') counts.male += 1;
    else if (gender === 'female') counts.female += 1;
    else counts.otherGender += 1;

    const religion = normalizeStudentReligion(s.religion);
    if (religion === 'islam') counts.islam += 1;
    else if (religion === 'hinduism') counts.hinduism += 1;
    else if (religion === 'christianity') counts.christianity += 1;
    else if (religion === 'buddhism') counts.buddhism += 1;
    else counts.otherReligion += 1;

    if (s.shift === 'Morning') counts.morningShift += 1;
    else if (s.shift === 'Day') counts.dayShift += 1;
  }

  return counts;
}

export function computeClassWiseDemographics(students: Student[]): ClassWiseDemographicsResult {
  const classMap = new Map<string, Student[]>();

  for (const s of students) {
    const cls = (s.className || 'Other').trim() || 'Other';
    const existing = classMap.get(cls);
    if (existing) {
      existing.push(s);
    } else {
      classMap.set(cls, [s]);
    }
  }

  const orderedClasses: string[] = [
    ...STANDARD_CLASS_ORDER.filter((cls) => classMap.has(cls)),
    ...[...classMap.keys()]
      .filter((cls) => !(STANDARD_CLASS_ORDER as readonly string[]).includes(cls))
      .sort((a, b) => a.localeCompare(b)),
  ];

  const rows: ClassDemographicRow[] = orderedClasses.map((className) => {
    const list = classMap.get(className) || [];
    const stats = computeStudentDemographics(list);
    const sections = Array.from(
      new Set(list.map((s) => (s.section || '').trim()).filter(Boolean))
    ).sort();

    return {
      className,
      sections,
      ...stats,
    };
  });

  return {
    rows,
    totals: computeStudentDemographics(students),
  };
}
