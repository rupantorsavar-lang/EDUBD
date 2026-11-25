import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type TileColorVariant =
  | 'red'
  | 'green'
  | 'sky'
  | 'teal'
  | 'amber'
  | 'purple'
  | 'indigo'
  | 'orange'
  | 'blue';

export interface LauncherTileItem {
  id: string;
  label: string;
  icon: LucideIcon;
  color: TileColorVariant;
  onClick: () => void;
  active?: boolean;
  badge?: string | number;
  title?: string;
}

interface LauncherIconGridProps {
  items: LauncherTileItem[];
  columns?: 4 | 5 | 6;
  compact?: boolean;
  className?: string;
}

const TILE_GRADIENTS: Record<TileColorVariant, string> = {
  red: 'bg-gradient-to-b from-[#EF4444] to-[#D92D2A] shadow-[0_6px_14px_-3px_rgba(220,38,38,0.34)] text-white',
  green: 'bg-gradient-to-b from-[#26B35F] to-[#19944A] shadow-[0_6px_14px_-3px_rgba(22,163,74,0.34)] text-white',
  sky: 'bg-gradient-to-b from-[#1EA4E9] to-[#0D82C5] shadow-[0_6px_14px_-3px_rgba(14,165,233,0.34)] text-white',
  blue: 'bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] shadow-[0_6px_14px_-3px_rgba(37,99,235,0.34)] text-white',
  teal: 'bg-gradient-to-b from-[#1396BD] to-[#0B7596] shadow-[0_6px_14px_-3px_rgba(14,116,144,0.34)] text-white',
  amber: 'bg-gradient-to-b from-[#FFD43B] to-[#F3B60A] shadow-[0_6px_14px_-3px_rgba(245,158,11,0.35)] text-slate-900',
  purple: 'bg-gradient-to-b from-[#9B4DF0] to-[#7D2ED8] shadow-[0_6px_14px_-3px_rgba(147,51,234,0.34)] text-white',
  indigo: 'bg-gradient-to-b from-[#5B52EC] to-[#4338CA] shadow-[0_6px_14px_-3px_rgba(79,70,229,0.34)] text-white',
  orange: 'bg-gradient-to-b from-[#FB8332] to-[#E05C0A] shadow-[0_6px_14px_-3px_rgba(234,88,12,0.34)] text-white',
};

const ACTIVE_RINGS: Record<TileColorVariant, string> = {
  red: 'ring-red-600',
  green: 'ring-emerald-600',
  sky: 'ring-sky-600',
  blue: 'ring-blue-600',
  teal: 'ring-cyan-700',
  amber: 'ring-amber-500',
  purple: 'ring-purple-600',
  indigo: 'ring-indigo-600',
  orange: 'ring-orange-600',
};

export const LauncherIconGrid: React.FC<LauncherIconGridProps> = ({
  items,
  columns = 5,
  compact = false,
  className = '',
}) => {
  if (!items || items.length === 0) return null;

  const gridColsClass =
    columns === 4
      ? 'grid-cols-3 sm:grid-cols-4'
      : columns === 6
      ? 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-6'
      : 'grid-cols-3 sm:grid-cols-5';

  return (
    <div
      className={`grid ${gridColsClass} ${
        compact ? 'gap-x-2.5 gap-y-3.5 sm:gap-x-4 sm:gap-y-4' : 'gap-x-3 gap-y-4 sm:gap-x-5 sm:gap-y-5'
      } print:hidden ${className}`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const hasBadge = item.badge !== undefined && item.badge !== null && item.badge !== '' && item.badge !== 0 && item.badge !== '0';

        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            title={item.title || item.label}
            aria-pressed={item.active}
            className="group flex flex-col items-center justify-start focus:outline-none cursor-pointer select-none"
          >
            <div
              className={`relative flex items-center justify-center ${
                compact
                  ? 'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl'
                  : 'w-14 h-14 sm:w-[62px] sm:h-[62px] rounded-[18px]'
              } ${TILE_GRADIENTS[item.color]} ring-1 ring-inset ring-white/25 transition-all duration-150 group-hover:scale-[1.05] group-active:scale-95 ${
                item.active
                  ? `ring-[3px] ring-offset-2 ring-offset-[#F1F5F9] ${ACTIVE_RINGS[item.color]} scale-[1.04]`
                  : ''
              }`}
            >
              {/* Subtle soft inner shine matching glossy app-tile feel */}
              <span className="pointer-events-none absolute inset-x-1.5 top-1 h-2.5 rounded-full bg-white/15 blur-[1px]" />
              <Icon
                className={`${compact ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-7 h-7 sm:w-[30px] sm:h-[30px]'} stroke-[2] relative z-10 drop-shadow-2xs`}
              />
              {hasBadge && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold border-2 border-[#F1F5F9] flex items-center justify-center shadow-xs z-20 tabular-nums">
                  {item.badge}
                </span>
              )}
            </div>
            <span
              className={`mt-2 text-center leading-snug line-clamp-2 max-w-[96px] sm:max-w-[110px] transition-colors ${
                compact ? 'text-[11px] sm:text-xs' : 'text-[11.5px] sm:text-[13px]'
              } ${
                item.active
                  ? 'font-extrabold text-blue-700'
                  : 'font-bold text-slate-800 group-hover:text-slate-950'
              }`}
            >
              {item.label}
            </span>
            {item.active && (
              <span className="mt-1 w-5 h-1 rounded-full bg-blue-600" />
            )}
          </button>
        );
      })}
    </div>
  );
};
