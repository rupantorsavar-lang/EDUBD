import React from 'react';
import { SchoolProfile } from '../../types';
import { isValidSignatureSrc } from '../../utils/signatureHelper';

export { isValidSignatureSrc };

interface PrincipalSignatureDisplayProps {
  school?: Partial<SchoolProfile> | null;
  fallbackText?: string;
  heightClass?: string;
  imgClassName?: string;
  textClassName?: string;
  textStyle?: React.CSSProperties;
}

/**
 * Renders the uploaded Principal/Head Teacher signature image cleanly above a
 * document's signature line, falling back to stylized italic principal name text
 * if no image has been uploaded yet.
 */
export const PrincipalSignatureDisplay: React.FC<PrincipalSignatureDisplayProps> = ({
  school,
  fallbackText = 'Principal / Head Teacher',
  heightClass = 'h-10',
  imgClassName = 'max-h-full max-w-[160px] object-contain mx-auto',
  textClassName = 'font-serif italic font-black text-sm text-slate-900 truncate',
  textStyle,
}) => {
  const sigUrl = school?.principalSignatureUrl;
  const principalName = school?.principalNameEn?.trim() || school?.principalNameBn?.trim();

  if (isValidSignatureSrc(sigUrl)) {
    return (
      <div className={`${heightClass} flex items-end justify-center overflow-hidden mb-0.5`}>
        <img
          src={sigUrl}
          alt={principalName ? `${principalName} Signature` : 'Principal Signature'}
          className={imgClassName}
        />
      </div>
    );
  }

  if (!fallbackText && !principalName) {
    return <div className={`${heightClass} mb-0.5`} />;
  }

  return (
    <div
      className={`${heightClass} flex items-end justify-center mb-0.5 ${textClassName}`}
      style={textStyle}
    >
      {principalName || fallbackText}
    </div>
  );
};
