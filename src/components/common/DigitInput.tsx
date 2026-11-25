import React, { useEffect, useState } from 'react';
import { parseLocaleNumber, sanitizeNumericInput, toEnNumber } from '../../utils/i18n';

export interface DigitInputProps {
  value: number | '' | undefined | null;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  emptyWhenZero?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  title?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

/**
 * Universal numeric input that accepts BOTH English (0-9) and Bengali (0-9) digits
 * from any keyboard, converts them immediately to standard English digits (0-9),
 * and eliminates mobile <input type="number"> zero/cursor glitches.
 */
export const DigitInput: React.FC<DigitInputProps> = ({
  value,
  onValueChange,
  min = 0,
  max,
  allowDecimal = false,
  emptyWhenZero = false,
  placeholder,
  disabled = false,
  required = false,
  className = '',
  title,
  id,
  name,
  'aria-label': ariaLabel,
}) => {
  const formatPropValue = (v: number | '' | undefined | null): string => {
    if (v === '' || v === undefined || v === null || Number.isNaN(Number(v))) return '';
    const num = Number(v);
    if (emptyWhenZero && num === 0) return '';
    return toEnNumber(num);
  };

  const [text, setText] = useState<string>(() => formatPropValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(formatPropValue(value));
    }
  }, [value, focused, emptyWhenZero]);

  const clampValue = (num: number): number => {
    let next = num;
    if (typeof min === 'number' && next < min) next = min;
    if (typeof max === 'number' && next > max) next = max;
    return next;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = sanitizeNumericInput(e.target.value, {
      allowDecimal,
      allowNegative: typeof min === 'number' && min < 0,
    });

    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
      setText(cleaned);
      onValueChange(typeof min === 'number' && min > 0 ? min : 0);
      return;
    }

    const parsed = parseLocaleNumber(cleaned, 0);
    if (typeof max === 'number' && parsed > max) {
      const clamped = clampValue(parsed);
      setText(String(clamped));
      onValueChange(clamped);
      return;
    }

    setText(cleaned);
    onValueChange(typeof min === 'number' && parsed < min && min === 0 ? 0 : parsed);
  };

  const handleBlur = () => {
    setFocused(false);
    if (text === '' || text === '-' || text === '.' || text === '-.') {
      const fallback = typeof min === 'number' && min > 0 ? min : 0;
      onValueChange(fallback);
      setText(emptyWhenZero && fallback === 0 ? '' : String(fallback));
      return;
    }
    const clamped = clampValue(parseLocaleNumber(text, 0));
    onValueChange(clamped);
    setText(emptyWhenZero && clamped === 0 ? '' : String(clamped));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    // Select all so typing immediately replaces an existing 0 cleanly on mobile/desktop
    requestAnimationFrame(() => {
      try {
        e.target.select();
      } catch {
        // Ignore selection errors on unsupported input types
      }
    });
  };

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      disabled={disabled}
      required={required}
      value={text}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      className={className}
    />
  );
};
