import React from 'react';
import { SchoolProfile, Staff } from '../../types';
import { resolveClassTeacherSignature, isValidSignatureSrc } from '../../utils/signatureHelper';

interface ClassTeacherSignatureDisplayProps {
  school?: Partial<SchoolProfile> | null;
  className?: string;
  section?: string;
  staffList?: Staff[];
  fallbackText?: string;
  heightClass?: string;
  imgClassName?: string;
  textClassName?: string;
  textStyle?: React.CSSProperties;
}

/**
 * Renders the resolved Class Teacher digital signature image cleanly above a
 * document's signature line, falling back to stylized italic teacher name text
 * if no signature image has been uploaded yet.
 */
export const ClassTeacherSignatureDisplay: React.FC<ClassTeacherSignatureDisplayProps> = ({
  school,
  className,
  section,
  staffList,
  fallbackText = '',
  heightClass = 'h-10',
  imgClassName = 'max-h-full max-w-[160px] object-contain mx-auto',
  textClassName = 'font-serif italic font-black text-sm text-slate-900 truncate',
  textStyle,
}) => {
  const resolved = resolveClassTeacherSignature(school, className, section, staffList, fallbackText);

  if (isValidSignatureSrc(resolved.signatureUrl)) {
    return (
      <div className={`${heightClass} flex flex-col items-center justify-end overflow-hidden mb-0.5`}>
        <img
          src={resolved.signatureUrl}
          alt={resolved.name ? `${resolved.name} Signature` : 'Class Teacher Signature'}
          className={imgClassName}
        />
      </div>
    );
  }

  if (!resolved.name) {
    return <div className={`${heightClass} mb-0.5`} />;
  }

  return (
    <div
      className={`${heightClass} flex items-end justify-center mb-0.5 ${textClassName}`}
      style={textStyle}
    >
      {resolved.name}
    </div>
  );
};
