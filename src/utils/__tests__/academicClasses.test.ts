import { describe, it, expect } from 'vitest';
import {
  getManagedClassList,
  getManagedClassNames,
  getSectionsForClass,
  classHasGroups,
  isEarlyChildhoodClass,
  formatClassOptionLabel,
  buildClassSequence,
} from '../academicClasses';
import { ClassInfo } from '../../types';

const sampleClasses: ClassInfo[] = [
  { id: 'c_play', name: 'Play', nameBn: 'প্লে', order: 0, sections: ['A'], shifts: ['Morning'], hasGroups: false, isActive: true },
  { id: 'c_nur', name: 'Nursery', nameBn: 'নার্সারি', order: 1, sections: ['A', 'B'], shifts: ['Morning'], hasGroups: false, isActive: true },
  { id: 'c_kg', name: 'KG', nameBn: 'কেজি', order: 2, sections: ['A'], shifts: ['Morning'], hasGroups: false, isActive: false },
  { id: 'c_9', name: 'Class 9', nameBn: '৯ম শ্রেণি', order: 10, sections: ['A', 'B', 'C'], shifts: ['Day'], hasGroups: true, isActive: true },
  { id: 'c_custom', name: 'Hifz-1', nameBn: 'হিফজ-১', order: 11, sections: ['A'], shifts: ['Morning'], hasGroups: true, isActive: true },
];

describe('academicClasses helper', () => {
  it('filters active classes by default, sorts by order, and includes custom classes like Play', () => {
    const names = getManagedClassNames([...sampleClasses].reverse());
    expect(names).toEqual(['Play', 'Nursery', 'Class 9', 'Hifz-1']);
    expect(names).not.toContain('KG'); // inactive excluded by default

    const allNames = getManagedClassNames(sampleClasses, { includeInactive: true });
    expect(allNames).toContain('KG');
  });

  it('falls back to all classes if every class is marked inactive', () => {
    const allInactive = sampleClasses.map((c) => ({ ...c, isActive: false }));
    expect(getManagedClassList(allInactive)).toHaveLength(sampleClasses.length);
  });

  it('resolves class-specific sections and group flags dynamically from Academic Structure', () => {
    expect(getSectionsForClass('Play', sampleClasses)).toEqual(['A']);
    expect(getSectionsForClass('Nursery', sampleClasses)).toEqual(['A', 'B']);
    expect(getSectionsForClass('Unknown', sampleClasses)).toEqual(['A', 'B', 'C']);

    expect(classHasGroups('Play', sampleClasses)).toBe(false);
    expect(classHasGroups('Class 9', sampleClasses)).toBe(true);
    expect(classHasGroups('Hifz-1', sampleClasses)).toBe(true);
  });

  it('detects early childhood classes and formats Bengali labels cleanly', () => {
    expect(isEarlyChildhoodClass('Play')).toBe(true);
    expect(isEarlyChildhoodClass('Nurany')).toBe(true);
    expect(isEarlyChildhoodClass('Nursery')).toBe(true);
    expect(isEarlyChildhoodClass('KG')).toBe(true);
    expect(isEarlyChildhoodClass('Class 5')).toBe(false);

    expect(formatClassOptionLabel(sampleClasses[0], 'bn')).toBe('Play (প্লে)');
    expect(formatClassOptionLabel(sampleClasses[0], 'en')).toBe('Play');
    expect(buildClassSequence(sampleClasses)).toEqual(['Play', 'Nursery', 'Class 9', 'Hifz-1']);
  });
});
