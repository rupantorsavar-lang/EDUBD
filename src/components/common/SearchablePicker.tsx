import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { SearchFilterResult } from '../../utils/personSearchFilter';

export interface SearchablePickerProps<T> {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  getId: (item: T) => string;
  filterItems: (items: T[], query: string, limit: number) => SearchFilterResult<T>;
  getPrimaryLabel: (item: T) => string;
  getSecondaryLabel?: (item: T) => string;
  getBadgeText?: (item: T) => string | undefined;
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  language?: 'bn' | 'en';
  borderTone?: 'blue' | 'slate';
  maxResults?: number;
  resetKey?: string | number | boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export function SearchablePicker<T>({
  items,
  value,
  onChange,
  getId,
  filterItems,
  getPrimaryLabel,
  getSecondaryLabel,
  getBadgeText,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  language = 'en',
  borderTone = 'blue',
  maxResults = 60,
  resetKey,
  disabled = false,
  ariaLabel,
}: SearchablePickerProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(
    () => (value ? items.find((item) => getId(item) === value) || null : null),
    [items, value, getId]
  );

  const filtered = useMemo(
    () => filterItems(items, query, maxResults),
    [items, query, maxResults, filterItems]
  );

  useEffect(() => {
    setIsOpen(false);
    setQuery('');
  }, [resetKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const openAndFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleSelect = (item: T) => {
    onChange(getId(item));
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange('');
    setQuery('');
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const borderClass =
    borderTone === 'blue'
      ? 'border-blue-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20'
      : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20';

  return (
    <div ref={containerRef} className="relative w-full">
      {selectedItem && !isOpen ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={ariaLabel || placeholder}
          onClick={openAndFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openAndFocus();
            }
          }}
          className={`w-full px-2.5 py-1.5 rounded-lg border ${borderClass} bg-white text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
            disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'hover:border-blue-400'
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900 truncate">
              {getPrimaryLabel(selectedItem)}
            </div>
            {getSecondaryLabel && (
              <div className="text-[11px] text-slate-500 truncate">
                {getSecondaryLabel(selectedItem)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                aria-label={language === 'bn' ? 'বাছাই মুছুন' : 'Clear selection'}
                title={language === 'bn' ? 'বাছাই মুছুন' : 'Clear'}
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      ) : (
        <div
          className={`w-full rounded-lg border ${borderClass} bg-white flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
            disabled ? 'opacity-60 bg-slate-100' : ''
          }`}
        >
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={query}
            aria-label={ariaLabel || placeholder}
            placeholder={isOpen ? searchPlaceholder || placeholder : placeholder}
            onFocus={() => {
              if (!disabled) setIsOpen(true);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setIsOpen(false);
                setQuery('');
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (isOpen && filtered.items.length === 1) {
                  handleSelect(filtered.items[0]);
                }
              }
            }}
            className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none min-w-0"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label={language === 'bn' ? 'সার্চ মুছুন' : 'Clear search'}
              className="p-0.5 rounded text-slate-400 hover:text-slate-700 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : selectedItem ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label={language === 'bn' ? 'বাছাই মুছুন' : 'Clear selection'}
              className="p-0.5 rounded text-slate-400 hover:text-rose-600 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
              } else {
                openAndFocus();
              }
            }}
            aria-label={language === 'bn' ? 'তালিকা দেখুন' : 'Toggle dropdown'}
            className="p-0.5 text-slate-400 hover:text-slate-700 shrink-0"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="px-2.5 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] font-semibold text-slate-500">
            <span>
              {query.trim()
                ? language === 'bn'
                  ? `পাওয়া গেছে: ${filtered.totalMatches} জন`
                  : `Found: ${filtered.totalMatches}`
                : language === 'bn'
                ? `মোট ${items.length} জন — নাম, আইডি, রোল বা মোবাইল লিখে খুঁজুন`
                : `Total ${items.length} — type name, ID, roll, or mobile`}
            </span>
            {selectedItem && (
              <button
                type="button"
                onClick={handleClear}
                className="text-rose-600 hover:text-rose-700 font-bold"
              >
                {language === 'bn' ? 'বাছাই মুছুন' : 'Clear'}
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto overscroll-contain divide-y divide-slate-100">
            {filtered.items.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                {emptyMessage ||
                  (language === 'bn'
                    ? `"${query}" অনুযায়ী কোনো তথ্য পাওয়া যায়নি।`
                    : `No matches found for "${query}".`)}
              </div>
            ) : (
              filtered.items.map((item) => {
                const itemId = getId(item);
                const isSelected = itemId === value;
                const badge = getBadgeText?.(item);
                return (
                  <button
                    key={itemId}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={`w-full px-3 py-2 text-left flex items-start justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-950'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate flex items-center gap-1.5">
                        <span className="truncate">{getPrimaryLabel(item)}</span>
                        {badge && (
                          <span className="text-[10px] font-semibold text-blue-700 shrink-0">
                            · {badge}
                          </span>
                        )}
                      </div>
                      {getSecondaryLabel && (
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {getSecondaryLabel(item)}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
                  </button>
                );
              })
            )}
          </div>

          {filtered.hasMore && (
            <div className="px-2.5 py-1.5 bg-blue-50/70 border-t border-blue-100 text-[10px] font-medium text-blue-800">
              {language === 'bn'
                ? `মোট ${filtered.totalMatches} জনের মধ্যে প্রথম ${filtered.items.length} জন দেখাচ্ছে — আরও নির্দিষ্ট করে খুঁজতে নাম/আইডি/রোল লিখুন`
                : `Showing first ${filtered.items.length} of ${filtered.totalMatches} — type more to narrow results`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
