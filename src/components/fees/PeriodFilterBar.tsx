import React from 'react';
import { CalendarDays } from 'lucide-react';
import { DateFilterPeriod } from '../../utils/financeFilters';

interface PeriodFilterBarProps {
  period: DateFilterPeriod;
  onPeriodChange: (period: DateFilterPeriod) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (val: string) => void;
  onCustomEndChange: (val: string) => void;
  language: 'bn' | 'en';
  compact?: boolean;
}

export const PeriodFilterBar: React.FC<PeriodFilterBarProps> = ({
  period,
  onPeriodChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  language,
  compact = false,
}) => {
  const options: Array<{ id: DateFilterPeriod; labelBn: string; labelEn: string }> = [
    { id: 'today', labelBn: 'আজকের', labelEn: 'Today' },
    { id: 'week', labelBn: 'এই সপ্তাহ', labelEn: 'This Week' },
    { id: 'month', labelBn: 'এই মাস', labelEn: 'This Month' },
    { id: 'year', labelBn: 'এই বছর', labelEn: 'This Year' },
    { id: 'custom', labelBn: 'কাস্টম তারিখ', labelEn: 'Custom Date' },
    { id: 'all', labelBn: 'সবসময়', labelEn: 'All Time' },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 mr-1">
          <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
          <span>{language === 'bn' ? 'সময়কাল:' : 'Period:'}</span>
        </span>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onPeriodChange(opt.id)}
            className={`${
              compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
            } rounded-xl font-bold transition-colors border ${
              period === opt.id
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {language === 'bn' ? opt.labelBn : opt.labelEn}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 bg-blue-50/70 border border-blue-200 rounded-xl px-3 py-1.5 text-xs">
          <label className="flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="text-[11px] text-blue-800">{language === 'bn' ? 'শুরু:' : 'From:'}</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="px-2 py-1 bg-white border border-blue-200 rounded-lg text-xs font-semibold text-slate-800"
            />
          </label>
          <span className="text-slate-400 font-bold">–</span>
          <label className="flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="text-[11px] text-blue-800">{language === 'bn' ? 'শেষ:' : 'To:'}</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="px-2 py-1 bg-white border border-blue-200 rounded-lg text-xs font-semibold text-slate-800"
            />
          </label>
        </div>
      )}
    </div>
  );
};
