import React from 'react';
import { Sparkles, Layers, LucideIcon } from 'lucide-react';
import { soundHaptics } from '../shared/utils/soundHaptics';

export interface WhatOption {
  id: string;
  label: string;
  badge?: string;
  icon?: LucideIcon;
  description?: string;
}

interface WhatDoYouWantProps {
  options: WhatOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  title?: string;
  subtitle?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
  className?: string;
}

export const WhatDoYouWant: React.FC<WhatDoYouWantProps> = ({
  options,
  selectedId,
  onSelect,
  title = 'ماذا تريد أن تستعرض أو تحسب؟',
  subtitle = 'اختر الخانة المناسبة لعرض الحل والبرهان المحدد، أو اختر عرض الحل الشامل:',
  showAllOption = true,
  allOptionLabel = 'عرض الحل الشامل الكامل والبرهان',
  className = ''
}) => {
  const handleSelect = (id: string) => {
    soundHaptics.playClick();
    onSelect(id);
  };

  const allItems: WhatOption[] = showAllOption
    ? [{ id: 'all', label: allOptionLabel, icon: Layers, badge: 'شامل' }, ...options]
    : options;

  return (
    <div className={`p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 border border-cyan-500/40 shadow-xl space-y-3 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-cyan-300 tracking-tight">
              {title}
            </h3>
            {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
          </div>
        </div>
      </div>

      {/* Small Interactive Chips / Cards */}
      <div className="flex flex-wrap gap-2">
        {allItems.map((item) => {
          const active = selectedId === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border touch-manipulation active:scale-95 ${
                active
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-md shadow-cyan-950/50 scale-[1.02]'
                  : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white hover:bg-slate-900'
              }`}
            >
              {Icon && <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-cyan-400'}`} />}
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-900 text-cyan-400 border border-slate-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
