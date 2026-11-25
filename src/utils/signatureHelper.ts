import { SchoolProfile, Staff } from '../types';
import { sanitizeSafeMediaUrl } from './htmlSanitizer';

export function isValidSignatureSrc(src?: string | null): boolean {
  return sanitizeSafeMediaUrl(src).length > 0;
}

function escapeHtmlAttr(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface ClassTeacherSignatureEntry {
  name?: string;
  signatureUrl?: string;
}

export interface ResolvedClassTeacherSignature {
  name: string;
  signatureUrl: string;
}

/**
 * Resolves the Class Teacher signature image and display name following priority order:
 * 1. Section-specific entry (`${className}_${section}`) in school.classTeacherSignatures
 * 2. Class-specific entry (`className`) in school.classTeacherSignatures
 * 3. Active staff member assigned to `className` with a signatureUrl or name
 * 4. Default school-wide classTeacherSignatureUrl / classTeacherName
 */
export function resolveClassTeacherSignature(
  school?: Partial<SchoolProfile> | null,
  className?: string,
  section?: string,
  staffList?: Staff[],
  fallbackText = ''
): ResolvedClassTeacherSignature {
  const map = school?.classTeacherSignatures || {};
  const cleanClass = (className || '').trim();
  const cleanSection = (section || '').trim();

  const sectionKey = cleanClass && cleanSection ? `${cleanClass}_${cleanSection}` : '';
  const sectionEntry: ClassTeacherSignatureEntry | undefined = sectionKey ? map[sectionKey] : undefined;
  const classEntry: ClassTeacherSignatureEntry | undefined = cleanClass ? map[cleanClass] : undefined;

  const assignedStaff = (staffList || []).filter(
    (s) =>
      s.status === 'active' &&
      cleanClass &&
      Array.isArray(s.assignedClasses) &&
      s.assignedClasses.includes(cleanClass)
  );
  const staffWithSig = assignedStaff.find((s) => isValidSignatureSrc(s.signatureUrl));
  const primaryStaff = staffWithSig || assignedStaff[0];
  const staffName = primaryStaff?.nameEn?.trim() || primaryStaff?.nameBn?.trim() || '';

  const hasSectionOverride =
    Boolean(sectionEntry && (isValidSignatureSrc(sectionEntry.signatureUrl) || sectionEntry.name?.trim()));
  const hasClassOverride =
    Boolean(classEntry && (isValidSignatureSrc(classEntry.signatureUrl) || classEntry.name?.trim()));

  if (hasSectionOverride) {
    return {
      signatureUrl: isValidSignatureSrc(sectionEntry?.signatureUrl) ? sectionEntry!.signatureUrl!.trim() : '',
      name: sectionEntry?.name?.trim() || classEntry?.name?.trim() || staffName || fallbackText,
    };
  }

  if (hasClassOverride) {
    return {
      signatureUrl: isValidSignatureSrc(classEntry?.signatureUrl) ? classEntry!.signatureUrl!.trim() : '',
      name: classEntry?.name?.trim() || staffName || fallbackText,
    };
  }

  if (primaryStaff && (isValidSignatureSrc(primaryStaff.signatureUrl) || staffName)) {
    const fallbackSig = isValidSignatureSrc(school?.classTeacherSignatureUrl)
      ? school!.classTeacherSignatureUrl!.trim()
      : '';
    return {
      signatureUrl: isValidSignatureSrc(primaryStaff.signatureUrl)
        ? primaryStaff.signatureUrl!.trim()
        : fallbackSig,
      name: staffName || school?.classTeacherName?.trim() || fallbackText,
    };
  }

  return {
    signatureUrl: isValidSignatureSrc(school?.classTeacherSignatureUrl)
      ? school!.classTeacherSignatureUrl!.trim()
      : '',
    name: school?.classTeacherName?.trim() || fallbackText,
  };
}

/**
 * Generates safe HTML markup for the Principal signature image (or styled text fallback)
 * used in standalone printable HTML reports (Merit Lists, Due Lists, Document Vault).
 */
export function buildPrincipalSignatureHtml(
  school?: Partial<SchoolProfile> | null,
  fallbackText = ''
): string {
  const sigUrl = school?.principalSignatureUrl?.trim();
  const principalName = school?.principalNameEn?.trim() || school?.principalNameBn?.trim() || fallbackText;

  if (isValidSignatureSrc(sigUrl)) {
    const imgHtml = `<img src="${escapeHtmlAttr(sigUrl!)}" alt="Principal Signature" style="max-height:40px;max-width:160px;object-fit:contain;display:block;margin:0 auto 2px auto;" />`;
    if (principalName) {
      return `${imgHtml}<div style="font-size:10px;font-weight:700;color:#0f172a;margin-bottom:2px;">${escapeHtmlAttr(principalName)}</div>`;
    }
    return imgHtml;
  }

  if (!principalName) return '';
  return `<div style="font-style:italic;font-weight:800;margin-bottom:2px;">${escapeHtmlAttr(principalName)}</div>`;
}

/**
 * Generates safe HTML markup for the Class Teacher signature image or stylized name fallback
 * used in standalone printable HTML reports (Merit Lists, Academic Sheets).
 */
export function buildClassTeacherSignatureHtml(
  school?: Partial<SchoolProfile> | null,
  className?: string,
  section?: string,
  staffList?: Staff[],
  fallbackText = ''
): string {
  const resolved = resolveClassTeacherSignature(school, className, section, staffList, fallbackText);

  if (isValidSignatureSrc(resolved.signatureUrl)) {
    const imgHtml = `<img src="${escapeHtmlAttr(resolved.signatureUrl)}" alt="Class Teacher Signature" style="max-height:40px;max-width:160px;object-fit:contain;display:block;margin:0 auto 2px auto;" />`;
    if (resolved.name) {
      return `${imgHtml}<div style="font-size:10px;font-weight:700;color:#0f172a;margin-bottom:2px;">${escapeHtmlAttr(resolved.name)}</div>`;
    }
    return imgHtml;
  }

  if (!resolved.name) return '';
  return `<div style="font-style:italic;font-weight:800;margin-bottom:2px;">${escapeHtmlAttr(resolved.name)}</div>`;
}

