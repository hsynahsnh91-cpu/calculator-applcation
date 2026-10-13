import React, { useState } from 'react';
import { AppMode, AngleMode } from '../../types';
import { soundHaptics } from '../../utils/soundHaptics';
import { 
  Calculator, 
  Variable, 
  TrendingUp, 
  Activity, 
  Dice5, 
  Grid, 
  Compass, 
  BookOpen, 
  History, 
  Volume2, 
  VolumeX, 
  Menu, 
  X,
  HelpCircle,
  Sigma,
  Infinity,
  Box
} from 'lucide-react';

interface HeaderProps {
  currentMode: AppMode;
  onSelectMode: (mode: AppMode) => void;
  angleMode: AngleMode;
  onToggleHelp: () => void;
  historyCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentMode,
  onSelectMode,
  angleMode,
  onToggleHelp,
  historyCount
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(soundHaptics.soundEnabled);

  const toggleSound = () => {
    const next = !soundOn;
    soundHaptics.soundEnabled = next;
    setSoundOn(next);
    if (next) soundHaptics.playClick();
  };

  const navItems = [
    { mode: 'scientific', label: 'حاسبة علمية طبيعية', icon: Calculator, badge: 'عرض طبيعي' },
    { mode: 'equations', label: 'حل المعادلات', icon: Variable, badge: 'درجة 1، 2، 3' },
    { mode: 'sequences', label: 'حل المتتاليات', icon: TrendingUp, badge: 'شاملة' },
    { mode: 'calculus', label: 'الاشتقاق', icon: Activity, badge: 'مشتقات ومماس' },
    { mode: 'integration', label: 'التكامل', icon: Sigma, badge: 'محدد وغير محدد' },
    { mode: 'limits', label: 'النهايات والتقارب', icon: Infinity, badge: 'نهايات ومقاربات' },
    { mode: 'geometry', label: 'الهندسة الفراغية', icon: Box, badge: 'مجسمات ومتجهات' },
    { mode: 'probability', label: 'الاحتمالات والإحصاء', icon: Dice5, badge: 'محرك دقيق' },
    { mode: 'matrices', label: 'المصفوفات', icon: Grid },
    { mode: 'complex', label: 'الأعداد المركبة', icon: Compass },
    { mode: 'reference', label: 'بنك القوانين', icon: BookOpen },
    { mode: 'history', label: 'السجل', icon: History, count: historyCount }
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-950/95 border-b border-slate-800 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { soundHaptics.playClick(); setMobileMenuOpen(!mobileMenuOpen); }}
            className="2xl:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div
            onClick={() => onSelectMode('scientific')}
            className="flex items-center gap-2.5 cursor-pointer group select-none"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-950 group-hover:scale-105 transition-transform">
              <Calculator className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base md:text-lg tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                  الآلة الحاسبة العلمية
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  PRO
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">
                للثانوية والجامعات والباحثين
              </span>
            </div>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav aria-label="التنقل الرئيسي" className="hidden 2xl:flex max-w-[54vw] items-center gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800 shadow-inner overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentMode === item.mode;
            return (
              <button
                key={item.mode}
                onClick={() => {
                  soundHaptics.playClick();
                  onSelectMode(item.mode as AppMode);
                }}
                className={`relative px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono text-emerald-400">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Quick Controls */}
        <div className="flex items-center gap-2">
          {/* Angle mode indicator */}
          <div className="hidden sm:flex items-center px-2 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold text-emerald-400">
            {angleMode}
          </div>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            title={soundOn ? 'كتم الصوت' : 'تفعيل المؤثرات الصوتية'}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Tutorial / Help */}
          <button
            onClick={() => { soundHaptics.playClick(); onToggleHelp(); }}
            title="دليل الاستخدام والعرض الطبيعي"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="2xl:hidden bg-slate-950 border-b border-slate-800 p-4 space-y-2 animate-fadeIn">
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentMode === item.mode;
              return (
                <button
                  key={item.mode}
                  onClick={() => {
                    soundHaptics.playClick();
                    onSelectMode(item.mode as AppMode);
                    setMobileMenuOpen(false);
                  }}
                  className={`p-3 rounded-xl text-right transition-all flex items-center gap-2.5 ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-950'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800/80'
                  }`}
                >
                  <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs font-bold block">{item.label}</span>
                    {item.badge && <span className="text-[10px] text-slate-400 block">{item.badge}</span>}
                  </div>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono text-emerald-400">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
