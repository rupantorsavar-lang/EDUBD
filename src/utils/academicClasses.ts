import { ClassInfo, ClassLevel } from '../types';

export const DEFAULT_CLASS_LEVELS: ClassLevel[] = [
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
];

function synthesizeDefaultClassInfos(): ClassInfo[] {
  return DEFAULT_CLASS_LEVELS.map((name, idx) => ({
    id: `fallback_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    nameBn: name,
    order: idx,
    sections: ['A', 'B'],
    shifts: ['Morning', 'Day'],
    hasGroups: name === 'Class 9' || name === 'Class 10',
    isActive: true,
  }));
}

/**
 * Returns sorted ClassInfo entries sourced from Academic Structure (StorageService.getClasses()).
 * By default returns only active classes (isActive !== false), falling back to all classes
 * if every class is temporarily inactive, or default class levels if list is empty.
 */
export function getManagedClassList(
  classes: ClassInfo[],
  options?: { includeInactive?: boolean }
): ClassInfo[] {
  if (!Array.isArray(classes) || classes.length === 0) {
    return synthesizeDefaultClassInfos();
  }
  const sorted = [...classes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (options?.includeInactive) {
    return sorted;
  }
  const activeOnly = sorted.filter((c) => c.isActive !== false);
  return activeOnly.length > 0 ? activeOnly : sorted;
}

export function getManagedClassNames(
  classes: ClassInfo[],
  options?: { includeInactive?: boolean }
): ClassLevel[] {
  const seen = new Set<string>();
  const result: ClassLevel[] = [];
  for (const cls of getManagedClassList(classes, options)) {
    const trimmed = (cls.name || '').trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed as ClassLevel);
    }
  }
  return result;
}

export function getSectionsForClass(className: string, classes: ClassInfo[]): string[] {
  const clean = (className || '').trim().toLowerCase();
  const matched = classes.find((c) => (c.name || '').trim().toLowerCase() === clean);
  if (matched && Array.isArray(matched.sections) && matched.sections.length > 0) {
    return matched.sections;
  }
  return ['A', 'B', 'C'];
}

export function classHasGroups(className: string, classes: ClassInfo[]): boolean {
  const clean = (className || '').trim().toLowerCase();
  const matched = classes.find((c) => (c.name || '').trim().toLowerCase() === clean);
  if (matched) {
    return Boolean(matched.hasGroups);
  }
  return ['Class 9', 'Class 10'].includes(className);
}

export function isEarlyChildhoodClass(className: string): boolean {
  return /^(play|nurany|nursery|kg|prep|pre-?primary)/i.test((className || '').trim());
}

export function formatClassOptionLabel(cls: ClassInfo, language: 'bn' | 'en'): string {
  const en = (cls.name || '').trim();
  const bn = (cls.nameBn || '').trim();
  if (language === 'bn' && bn && bn !== en) {
    return `${en} (${bn})`;
  }
  return en;
}

export function buildClassSequence(classes: ClassInfo[]): string[] {
  return getManagedClassNames(classes, { includeInactive: false });
}
