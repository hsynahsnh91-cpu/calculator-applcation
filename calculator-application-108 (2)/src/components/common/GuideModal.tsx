import React, { useState } from 'react';
import { HelpCircle, X, Sparkles, CheckCircle2, BookOpen } from 'lucide-react';
import { soundHaptics } from '../../utils/soundHaptics';
import { RichText } from './Tex';

export interface GuideSection {
  title: string;
  badge?: string;
  intro: string;
  features: {
    title: string;
    description: string;
    mathExample?: string;
  }[];
  inputTips?: string[];
}

interface GuideModalProps {
  guide: GuideSection;
  buttonLabel?: string;
  className?: string;
}

export const GuideButton: React.FC<GuideModalProps> = ({ guide, buttonLabel, className = '' }) => {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    soundHaptics.playClick();
    setOpen(true);
  };

  const handleClose = () => {
    soundHaptics.playClick();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={`دليل ومميزات: ${guide.title}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60 hover:border-cyan-400 active:scale-95 transition-all shadow-sm shrink-0 touch-manipulation ${className}`}
      >
        <HelpCircle className="w-4 h-4 text-cyan-400" />
        {buttonLabel ? <span>{buttonLabel}</span> : <span className="hidden sm:inline">دليل القسم</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
          onClick={handleClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[85vh] rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-cyan-500/40 shadow-2xl shadow-cyan-950/50 flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-100 truncate">
                      دليل ومميزات: {guide.title}
                    </h3>
                    {guide.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60">
                        {guide.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">شرح ما يقدمه المحرك وكيفية الحصول على أدق النتائج</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed" dir="rtl">
              {/* Intro Banner */}
              <div className="p-3 rounded-2xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-100 leading-6">
                <RichText text={guide.intro} />
              </div>

              {/* Features List */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                  <span>ماذا يستطيع هذا القسم حله وتقديمه؟</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {guide.features.map((feat, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="font-bold text-slate-100 text-xs block">{feat.title}</span>
                          <p className="text-[11px] text-slate-400 leading-5 mt-0.5">
                            <RichText text={feat.description} />
                          </p>
                        </div>
                      </div>
                      {feat.mathExample && (
                        <div className="mr-6 p-2 rounded-lg bg-slate-900 border border-slate-800/80 text-[13px] text-emerald-300 overflow-x-auto" dir="ltr">
                          <RichText text={`$${feat.mathExample}$`} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Input Tips */}
              {guide.inputTips && guide.inputTips.length > 0 && (
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <BookOpen className="w-4 h-4" />
                    <span>إرشادات الإدخال للحصول على برهان دقيق:</span>
                  </div>
                  <ul className="space-y-1 mr-4 list-disc text-[11px] text-slate-400">
                    {guide.inputTips.map((tip, i) => (
                      <li key={i}>
                        <RichText text={tip} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <span>فهمت ذلك</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
