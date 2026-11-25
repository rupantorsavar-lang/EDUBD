import { describe, it, expect } from 'vitest';
import {
  isGenericSchoolName,
  resolveSchoolDisplayName,
  hydrateSchoolProfileFromSaaSSchool,
} from '../schoolNameResolver';
import { initialSchoolProfile } from '../../data/initialData';

describe('schoolNameResolver', () => {
  it('detects default placeholder school names accurately', () => {
    expect(isGenericSchoolName('Smart School BD ERP')).toBe(true);
    expect(isGenericSchoolName('স্মার্ট স্কুল বিডি ইআরপি')).toBe(true);
    expect(isGenericSchoolName('  ')).toBe(true);
    expect(isGenericSchoolName('Dhakas school')).toBe(false);
    expect(isGenericSchoolName('ঢাকা মডেল স্কুল')).toBe(false);
  });

  it('falls back to SaaS schoolName when Institutional Profile still has placeholder defaults', () => {
    const resolvedEn = resolveSchoolDisplayName(
      initialSchoolProfile,
      { schoolName: 'Dhakas school' },
      'en'
    );
    const resolvedBn = resolveSchoolDisplayName(
      initialSchoolProfile,
      { schoolName: 'Dhakas school' },
      'bn'
    );

    expect(resolvedEn).toBe('Dhakas school');
    expect(resolvedBn).toBe('Dhakas school');
  });

  it('prefers customized Institutional Profile name over SaaS schoolName so Settings edits reflect in Topbar', () => {
    const customizedProfile = {
      ...initialSchoolProfile,
      nameEn: 'Dhaka Model High School',
      nameBn: 'ঢাকা মডেল উচ্চ বিদ্যালয়',
    };

    expect(
      resolveSchoolDisplayName(customizedProfile, { schoolName: 'Dhakas school' }, 'en')
    ).toBe('Dhaka Model High School');
    expect(
      resolveSchoolDisplayName(customizedProfile, { schoolName: 'Dhakas school' }, 'bn')
    ).toBe('ঢাকা মডেল উচ্চ বিদ্যালয়');
  });

  it('hydrates placeholder Institutional Profile fields from SaaS school metadata without overwriting custom edits', () => {
    const { profile: hydrated, changed } = hydrateSchoolProfileFromSaaSSchool(
      initialSchoolProfile,
      {
        schoolId: 'SCH001',
        schoolCode: 'SCH001',
        schoolName: 'Dhakas school',
        email: 'admin@dmc.com',
        contactNumber: '01711000000',
        address: 'Mirpur, Dhaka',
        principalName: 'Amzad Hossain',
      }
    );

    expect(changed).toBe(true);
    expect(hydrated.nameEn).toBe('Dhakas school');
    expect(hydrated.nameBn).toBe('Dhakas school');
    expect(hydrated.schoolCode).toBe('SCH001');
    expect(hydrated.email).toBe('admin@dmc.com');
    expect(hydrated.phone).toBe('01711000000');
    expect(hydrated.addressEn).toBe('Mirpur, Dhaka');
    expect(hydrated.addressBn).toBe('Mirpur, Dhaka');
    expect(hydrated.principalNameEn).toBe('Amzad Hossain');
    expect(hydrated.principalNameBn).toBe('Amzad Hossain');

    // Second pass when already customized should report changed = false and preserve user values
    const customProfile = {
      ...hydrated,
      nameEn: 'Dhakas Ideal School',
      nameBn: 'ঢাকাস আইডিয়াল স্কুল',
      email: 'info@dhakasideal.edu.bd',
    };
    const secondPass = hydrateSchoolProfileFromSaaSSchool(customProfile, {
      schoolId: 'SCH001',
      schoolName: 'Dhakas school',
      email: 'admin@dmc.com',
    });

    expect(secondPass.changed).toBe(false);
    expect(secondPass.profile.nameEn).toBe('Dhakas Ideal School');
    expect(secondPass.profile.nameBn).toBe('ঢাকাস আইডিয়াল স্কুল');
    expect(secondPass.profile.email).toBe('info@dhakasideal.edu.bd');
  });
});
