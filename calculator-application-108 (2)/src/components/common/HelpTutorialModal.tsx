import React from 'react';
import { X, Sparkles, CheckCircle2, Calculator, Variable, TrendingUp, Activity, Dice5 } from 'lucide-react';
import { soundHaptics } from '../../utils/soundHaptics';

interface HelpTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpTutorialModal: React.FC<HelpTutorialModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-base text-slate-100">دليل وميزات الآلة الحاسبة الاحترافية</h3>
          </div>
          <button
            onClick={() => { soundHaptics.playClick(); onClose(); }}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
          {/* Feature 1: Natural Display */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-emerald-500/30 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Calculator className="w-4 h-4" />
              <span>1. العرض الرياضي الطبيعي المربعي (Natural Display):</span>
            </div>
            <p>
              تم تصميم هذه الآلة الحاسبة لتعمل بمحاكاة الخطوط الرياضية الطبيعية تماماً:
            </p>
            <ul className="space-y-1.5 mr-4 list-disc text-slate-300">
              <li><strong>الأسس:</strong> لا تظهر الرمز <code>^</code> بل يظهر مربع حقيقي أعلى الأساس لتكتب فيه الأس.</li>
              <li><strong>الكسور:</strong> تظهر بسطاً ومقاماً حقيقيين بخط كسر دون إظهار علامة <code>/</code>.</li>
              <li><strong>العمليات:</strong> الضرب يظهر <code>×</code> والقسمة <code>÷</code> والجذور بمربعات بداخلها.</li>
              <li><strong>التنقل بالأسهم:</strong> يمكنك النقر المباشر على أي مربع، أو استخدام أزرار الأسهم للتنقل بين البسط والمقام والأس.</li>
            </ul>
          </div>

          {/* Feature 2: Equation Solver */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-cyan-500/30 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <Variable className="w-4 h-4" />
              <span>2. حل المعادلات الشامل من الدرجة 1 و 2 و 3:</span>
            </div>
            <p>
              محرك دقيق يحل المعادلات الخطية، والتربيعية بحساب المميز دلتا والجذور الحقيقية والمركبة والذروة، والتكعيبية بطريقة كاردانو، مع جمل المعادلات 2×2 و 3×3 بقاعدة كرامر.
            </p>
          </div>

          {/* Feature 3: Sequences */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-purple-500/30 space-y-2">
            <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
              <TrendingUp className="w-4 h-4" />
              <span>3. دراسة المتتاليات الحسابية والهندسية والتراجعية:</span>
            </div>
            <p>
              استخراج الحد العام بدلالة n، حساب مجاميع الحدود، دراسة الرتابة (تزايد وتناقص)، دراسة التقارب والنهايات عند +∞، مع جدول القيم والتمثيل البياني.
            </p>
          </div>

          {/* Feature 4: Calculus */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Activity className="w-4 h-4" />
              <span>4. الاشتقاق، المماس، التكامل والنهايات:</span>
            </div>
            <p>
              اشتقاق الدوال مهما بلغت درجة صعوبتها رمزياً مع خطوات تفصيلية لقواعد الاشتقاق، إيجاد معادلة المماس عند أي نقطة، وحساب التكاملات المحددة بدقة متناهية.
            </p>
          </div>

          {/* Feature 5: Probability */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-rose-500/30 space-y-2">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <Dice5 className="w-4 h-4" />
              <span>5. محرك الاحتمالات وتجارب السحب (لا يخطئ أبداً):</span>
            </div>
            <p>
              حل تجارب سحب الكرات من الصناديق (في آن واحد، على التوالي بإرجاع وبدون إرجاع)، التوزيع الثنائي B(n,p)، التوزيع الطبيعي الغاوصي مع قيم Z-Score، والإحصاء الوصفي.
            </p>
          </div>

          {/* Box 6: credits */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-950/40 to-slate-950/70 border border-amber-500/40 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <span className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/50 flex items-center justify-center text-xs font-extrabold" style={{ fontFamily: 'KaTeX_Main, serif' }}>6</span>
              <span>جودة وإتقان:</span>
            </div>
            <p className="text-sm font-semibold text-slate-100 leading-7">
              تم انشاء هذا التطبيق بأعلى معايير الجودة بواسطة المهندس : أبوعمر
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-3">
          <div className="flex items-center justify-end">
            <button
              onClick={() => { soundHaptics.playClick(); onClose(); }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>فهمت ذلك، ابدأ الاستخدام!</span>
            </button>
          </div>

          {/* WhatsApp contact option (bottom of the section) */}
          <a
            href={`https://wa.me/963964846310?text=${encodeURIComponent('الدعم الفني والاقتراحات :\n"هل واجهت مشكلة في حل مصفوفة أو حساب تكامل؟ أو لديك فكرة لتطوير الآلة الحاسبة؟"')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => soundHaptics.playClick()}
            className="flex items-center justify-between gap-3 w-full px-4 py-3 rounded-2xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/40 transition-all"
          >
            <span className="text-xs font-bold text-slate-200">التواصل عبر واتساب</span>
            <span className="flex items-center gap-2.5" dir="ltr">
              <span className="text-sm font-bold text-[#25D366] tracking-wide" style={{ fontFamily: 'KaTeX_Main, serif' }}>0964846310</span>
              <svg viewBox="0 0 32 32" className="w-7 h-7" aria-label="WhatsApp" role="img">
                <circle cx="16" cy="16" r="16" fill="#25D366" />
                <path
                  fill="#fff"
                  d="M23.3 8.6A10.2 10.2 0 0 0 6.9 20.9L5.6 26.4l5.6-1.3a10.2 10.2 0 0 0 4.9 1.3h0A10.2 10.2 0 0 0 23.3 8.6zm-7.2 15.7a8.5 8.5 0 0 1-4.3-1.2l-.3-.2-3.3.8.9-3.2-.2-.3a8.5 8.5 0 1 1 7.2 4.1zm4.7-6.4c-.3-.1-1.5-.7-1.8-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a7 7 0 0 1-3.5-3c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.200 5.100 5.100 0 0 0 1.100 2.800 11.600 11.600 0 0 0 4.500 4c1.700.7 2.400.8 3.200.7a2.700 2.700 0 0 0 1.800-1.300c.2-.5.2-1 .2-1.100-.1-.1-.3-.2-.6-.3z"
                />
              </svg>
            </span>
          </a>
        </div>
      </div>
    </div>
  );
};
