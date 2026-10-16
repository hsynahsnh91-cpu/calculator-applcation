import { copyToClipboard } from "../../utils/cn";
import React, { useState } from "react";
import { SCIENTIFIC_CONSTANTS } from "../../utils/constants";
import { KaTeXDisplay } from "../common/KaTeXDisplay";
import { Tex } from "../common/Tex";
import { soundHaptics } from "../../utils/soundHaptics";
import { Search, BookOpen, Atom, Copy, Check, Hash } from "lucide-react";

interface FormulaItem {
  id: string;
  category: string;
  title: string;
  latex: string;
  description?: string;
}

const FORMULA_DATABASE: FormulaItem[] = [
  {
    id: "space_coordinates",
    category: "الهندسة الفراغية",
    title: "إحداثيات الشعاع والمسافة في الفضاء",
    latex:
      "\\overrightarrow{AB}=(x_B-x_A,y_B-y_A,z_B-z_A),\\quad AB=\\|\\overrightarrow{AB}\\|",
    description:
      "الصيغ المترية في معلم متعامد متجانس؛ عكس الاتجاه لا يغير الطول.",
  },
  {
    id: "space_dependence",
    category: "الهندسة الفراغية",
    title: "الارتباط الخطي والاستقامة والاستواء",
    latex:
      "\\vec u\\times\\vec v=\\vec0,\\quad\\det(\\vec u,\\vec v,\\vec w)=0",
    description:
      "الأول شرط ارتباط شعاعين، والثاني ارتباط ثلاثة. مع أشعة من نقطة مشتركة نستنتج استقامة3 نقاط أو استواء4 نقاط. المعدوم لا يحدد اتجاهًا.",
  },
  {
    id: "space_barycenter",
    category: "الهندسة الفراغية",
    title: "مركز الأبعاد المتناسبة والتجميع",
    latex:
      "G=\\frac{\\sum_i\\alpha_i A_i}{\\sum_i\\alpha_i},\\quad\\sum_i\\alpha_i\\ne0,\\quad\\sum_i\\alpha_i\\overrightarrow{GA_i}=\\vec0",
    description:
      "الأوزان المتساوية تعطي مركز الثقل. لتجميع مجموعة فرعية يجب ألا يكون مجموع أوزانها صفرًا.",
  },
  {
    id: "space_dot",
    category: "الهندسة الفراغية",
    title: "الجداء السلمي والتعامد",
    latex:
      "\\vec u\\cdot\\vec v=u_1v_1+u_2v_2+u_3v_3=\\|u\\|\\|v\\|\\cos\\theta",
    description:
      "تكون زاوية الشعاعين معرفة إذا كانا غير معدومين. اتجاهان متعامدان لا يثبتان تقاطع مستقيمين متخالفين.",
  },
  {
    id: "space_plane",
    category: "الهندسة الفراغية",
    title: "المستوي وشعاعه الناظم",
    latex: "P:ax+by+cz+d=0,\\quad\\vec n=(a,b,c)\\ne\\vec0",
    description:
      "ثلاث نقاط غير مستقيمة تعطي ناظمًا بالجداء الشعاعي؛ ثلاث نقاط مستقيمة لا تعطي مستويًا وحيدًا.",
  },
  {
    id: "space_parametric",
    category: "الهندسة الفراغية",
    title: "التمثيل البارامتري للمستقيم",
    latex:
      "M=A+t\\vec u,\\quad\\begin{cases}x=x_A+tu_1\\\\y=y_A+tu_2\\\\z=z_A+tu_3\\end{cases},\\quad\\vec u\\ne\\vec0",
    description:
      "الوسيط نفسه في الإحداثيات الثلاث. الشروط الخاصة باتجاهين معدومين لا تعرّف مستقيمين.",
  },
  {
    id: "space_relative",
    category: "الهندسة الفراغية",
    title: "أوضاع المستقيم والمستوي",
    latex: "P(A+t\\vec u)=(\\vec n\\cdot\\vec u)t+(\\vec n\\cdot A+d)",
    description:
      "إذا كان معامل الوسيط غير معدوم فتقاطع وحيد؛ إذا انعدم نختبر الحد الثابت للاحتواء أو التوازي.",
  },
  {
    id: "space_point_plane",
    category: "الهندسة الفراغية",
    title: "بعد نقطة عن مستوٍ ومسقطها العمودي",
    latex:
      "d(M,P)=\\frac{|ax_M+by_M+cz_M+d|}{\\sqrt{a^2+b^2+c^2}},\\quad H=M-\\frac{ax_M+by_M+cz_M+d}{a^2+b^2+c^2}\\vec n",
    description:
      "فحص انتماء H وتوازي MH مع الناظم يوفر تحققًا مستقلًا من قانون البعد.",
  },
  {
    id: "space_sphere",
    category: "الهندسة الفراغية",
    title: "المعادلة الديكارتية للكرة وقطرها",
    latex:
      "(x-a)^2+(y-b)^2+(z-c)^2=R^2,\\quad K=\\frac{A+B}{2},\\quad R^2=\\frac{AB^2}{4}",
    description:
      "المركز K(a,b,c). معاملات الحدود التربيعية متساوية، ولا حدود مختلطة؛ R²<0 لا يعطي كرة حقيقية.",
  },
  {
    id: "space_volume",
    category: "الهندسة الفراغية",
    title: "حجم رباعي الوجوه والارتفاع",
    latex:
      "V_{ABCD}=\\frac16|\\det(\\overrightarrow{AB},\\overrightarrow{AC},\\overrightarrow{AD})|=\\frac13 S_{ABC}h",
    description:
      "حجم متوازي السطوح هو قيمة المحدد المطلقة بلا قسمة6. إذا كانت القاعدة مستقيمة فلا تعطي مستويًا وحيدًا للارتفاع.",
  },
  // Trigonometry
  {
    id: "trig_pythagoras",
    category: "المثلثات والمتطابقات",
    title: "المتطابقة المثلثية الأساسية",
    latex: "\\cos^2(x) + \\sin^2(x) = 1",
    description: "العلاقة الأساسية بين الجيب وجيب التمام لجميع الزوايا",
  },
  {
    id: "trig_tan",
    category: "المثلثات والمتطابقات",
    title: "علاقة الظل مع القاطع",
    latex: "1 + \\tan^2(x) = \\frac{1}{\\cos^2(x)} = \\sec^2(x)",
    description: "صالحة من أجل x ≠ π/2 + kπ",
  },
  {
    id: "trig_double_sin",
    category: "المثلثات والمتطابقات",
    title: "جيب ضعف الزاوية",
    latex: "\\sin(2x) = 2\\sin(x)\\cos(x)",
    description: "قانون تحويل ضعف الزاوية",
  },
  {
    id: "trig_double_cos",
    category: "المثلثات والمتطابقات",
    title: "جيب تمام ضعف الزاوية",
    latex:
      "\\cos(2x) = \\cos^2(x) - \\sin^2(x) = 2\\cos^2(x) - 1 = 1 - 2\\sin^2(x)",
  },
  {
    id: "trig_sum_cos",
    category: "المثلثات والمتطابقات",
    title: "دستور جمع زاويتين لـ cos",
    latex: "\\cos(a \\pm b) = \\cos(a)\\cos(b) \\mp \\sin(a)\\sin(b)",
  },
  {
    id: "trig_sum_sin",
    category: "المثلثات والمتطابقات",
    title: "دستور جمع زاويتين لـ sin",
    latex: "\\sin(a \\pm b) = \\sin(a)\\cos(b) \\pm \\cos(a)\\sin(b)",
  },

  // Derivatives
  {
    id: "deriv_power",
    category: "قواعد الاشتقاق",
    title: "مشتقة دالة القوة",
    latex:
      "\\frac{d}{dx}\\left(x^n\\right) = n x^{n-1} \\quad , \\quad \\frac{d}{dx}\\left(u(x)^n\\right) = n u'(x) u(x)^{n-1}",
  },
  {
    id: "deriv_product",
    category: "قواعد الاشتقاق",
    title: "مشتقة جداء دالتين",
    latex: "\\frac{d}{dx}(u \\cdot v) = u' \\cdot v + u \\cdot v'",
  },
  {
    id: "deriv_quotient",
    category: "قواعد الاشتقاق",
    title: "مشتقة كسر دالتين",
    latex:
      "\\frac{d}{dx}\\left(\\frac{u}{v}\\right) = \\frac{u' \\cdot v - u \\cdot v'}{v^2}",
  },
  {
    id: "deriv_exp_log",
    category: "قواعد الاشتقاق",
    title: "مشتقة الدالة الأسية واللوغاريتمية",
    latex:
      "\\frac{d}{dx}(e^{u(x)}) = u'(x) e^{u(x)} \\quad , \\quad \\frac{d}{dx}(\\ln(u(x))) = \\frac{u'(x)}{u(x)}",
  },
  {
    id: "deriv_sqrt",
    category: "قواعد الاشتقاق",
    title: "مشتقة الدالة الجذرية",
    latex: "\\frac{d}{dx}(\\sqrt{u(x)}) = \\frac{u'(x)}{2\\sqrt{u(x)}}",
  },

  // Integrals
  {
    id: "int_power",
    category: "قواعد التكامل",
    title: "التكامل الأساسي لدالة القوة",
    latex: "\\int x^n \\, dx = \\frac{x^{n+1}}{n+1} + C \\quad (n \\ne -1)",
  },
  {
    id: "int_fraction_log",
    category: "قواعد التكامل",
    title: "تكامل مشتق على دالة",
    latex: "\\int \\frac{u'(x)}{u(x)} \\, dx = \\ln|u(x)| + C",
  },
  {
    id: "int_by_parts",
    category: "قواعد التكامل",
    title: "المكاملة بالتجزئة (Integration by Parts)",
    latex:
      "\\int u(x) \\cdot v'(x) \\, dx = u(x)v(x) - \\int u'(x) v(x) \\, dx",
  },

  // Limits
  {
    id: "limit_famous_sin",
    category: "النهايات الشهيرة",
    title: "نهاية مشهورة لدالة الجيب",
    latex:
      "\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1 \\quad , \\quad \\lim_{x \\to 0} \\frac{1 - \\cos(x)}{x^2} = \\frac{1}{2}",
  },
  {
    id: "limit_famous_exp",
    category: "النهايات الشهيرة",
    title: "التزايد المقارن للدالة الأسية",
    latex:
      "\\lim_{x \\to +\\infty} \\frac{e^x}{x^n} = +\\infty \\quad , \\quad \\lim_{x \\to -\\infty} x^n e^x = 0",
  },
  {
    id: "limit_famous_ln",
    category: "النهايات الشهيرة",
    title: "التزايد المقارن للدالة اللوغاريتمية",
    latex:
      "\\lim_{x \\to +\\infty} \\frac{\\ln(x)}{x^n} = 0 \\quad , \\quad \\lim_{x \\to 0^+} x^n \\ln(x) = 0",
  },

  // Sequences
  {
    id: "seq_arith_sum",
    category: "المتتاليات والمجاميع",
    title: "مجموع متتالية حسابية",
    latex: "S_n = \\sum_{k=p}^n u_k = \\frac{n - p + 1}{2} (u_p + u_n)",
  },
  {
    id: "seq_geom_sum",
    category: "المتتاليات والمجاميع",
    title: "مجموع متتالية هندسية",
    latex:
      "S_n = u_p \\cdot \\frac{1 - q^{n - p + 1}}{1 - q} \\quad (q \\ne 1)",
  },
  {
    id: "seq_infinite_geom",
    category: "المتتاليات والمجاميع",
    title: "مجموع متسلسلة هندسية غير منتهية متقاربة",
    latex:
      "S_\\infty = \\sum_{k=0}^{\\infty} u_0 q^k = \\frac{u_0}{1 - q} \\quad (|q| < 1)",
  },

  // Probability
  {
    id: "prob_sample_space",
    category: "الاحتمالات والإحصاء",
    title: "الفضاء العيني حسب نمط السحب",
    latex: String.raw`n(\Omega)=\begin{cases}\binom nr&\text{معًا، دون إعادة}\\ P_n^r=\dfrac{n!}{(n-r)!}&\text{متتاليًا، دون إعادة}\\ n^r&\text{متتاليًا، مع إعادة}\end{cases}`,
    description:
      "الترتيب والتكرار هما ما يميز قواعد العدّ؛ الكرات المادية متميزة ولو تشابه لونها.",
  },
  {
    id: "prob_classical",
    category: "الاحتمالات والإحصاء",
    title: "الاحتمال الكلاسيكي والمستحيل والمؤكد",
    latex: String.raw`P(A)=\dfrac{n(A)}{n(\Omega)},\quad P(\varnothing)=0,\quad P(\Omega)=1`,
    description: "قانون العدّ للحالات الأولية المتساوية الاحتمال فقط.",
  },
  {
    id: "prob_discrete_law",
    category: "الاحتمالات والإحصاء",
    title: "قيم المتحول وقانون الاحتمال والعزم الثاني",
    latex: String.raw`X(\Omega)=\{x_i:p_i>0\},\quad\sum_i p_i=1,\quad E(X^2)=\sum_i x_i^2p_i,\quad\sigma_X=\sqrt{V(X)}`,
  },
  {
    id: "prob_joint_independence",
    category: "الاحتمالات والإحصاء",
    title: "استقلال متحولين عشوائيين",
    latex: String.raw`p_X(x_i)=\sum_jp_{ij},\quad p_Y(y_j)=\sum_ip_{ij},\quad\forall i,j:\ p_{ij}=p_X(x_i)p_Y(y_j)`,
    description: "نفحص جميع الأزواج، ولا يكفي انعدام الارتباط.",
  },
  {
    id: "prob_tails",
    category: "الاحتمالات والإحصاء",
    title: "بالضبط، أو أكثر، وأقل",
    latex: String.raw`P(X=k)=p_k,\quad P(X\ge k)=\sum_{j\ge k}p_j,\quad P(X<k)=\sum_{j<k}p_j`,
    description: "هذه مقارنات لعدد الوقوع؛ لا تغيّر تعريف p في التجربة.",
  },
  {
    id: "prob_histogram",
    category: "الاحتمالات والإحصاء",
    title: "التكرارات والمتوسط وتباين المجتمع والعينة",
    latex: String.raw`N=\sum_if_i,\quad\bar x=\dfrac{\sum_if_ix_i}{N},\quad\sigma^2=\dfrac{\sum_if_i(x_i-\bar x)^2}{N},\quad s^2=\dfrac{N}{N-1}\sigma^2`,
    description:
      "المدرج التكراري يمثل تكرارات فئات متجاورة؛ s² غير معرف عند N=1.",
  },
  {
    id: "prob_bayes",
    category: "الاحتمالات والإحصاء",
    title: "قانون الاحتمال الشرطي وقاعدة بايز",
    description:
      "يشترط P(B)>0؛ الشرط ذو الاحتمال صفر لا يعرّف احتمالًا شرطيًا.",
    latex:
      "P(A|B) = \\frac{P(A \\cap B)}{P(B)} = \\frac{P(B|A) \\cdot P(A)}{P(B)}",
  },
  {
    id: "prob_binomial_law",
    category: "الاحتمالات والإحصاء",
    title: "قانون التوزيع الثنائي B(n,p)",
    latex:
      "P(X = k) = \\binom{n}{k} p^k (1-p)^{n-k} \\quad , \\quad E(X) = np, \\ V(X) = np(1-p)",
  },
  {
    id: "prob_union",
    category: "الاحتمالات والإحصاء",
    title: "احتمال اتحاد حدثين",
    latex: "P(A \\cup B) = P(A) + P(B) - P(A \\cap B)",
  },
  {
    id: "prob_complement",
    category: "الاحتمالات والإحصاء",
    title: "الحدث المعاكس",
    latex: "P(\\overline{A}) = 1 - P(A)",
  },
  {
    id: "prob_total",
    category: "الاحتمالات والإحصاء",
    title: "دستور الاحتمالات الكلية",
    latex: "P(B) = \\sum_{i=1}^{n} P(A_{i})\\, P(B \\mid A_{i})",
  },
  {
    id: "prob_indep",
    category: "الاحتمالات والإحصاء",
    title: "استقلال حدثين",
    latex: "A, B \\ \\text{مستقلان} \\iff P(A \\cap B) = P(A)\\, P(B)",
  },
  {
    id: "prob_comb",
    category: "الاحتمالات والإحصاء",
    title: "التراتيب والتوافيق",
    latex:
      "A_{n}^{k} = \\dfrac{n!}{(n-k)!} \\quad , \\quad \\binom{n}{k} = \\dfrac{n!}{k!\\,(n-k)!}",
  },
  {
    id: "prob_newton",
    category: "الاحتمالات والإحصاء",
    title: "دستور ثنائي الحد لنيوتن",
    latex: "(a + b)^{n} = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^{k}",
  },
  {
    id: "prob_pascal",
    category: "الاحتمالات والإحصاء",
    title: "علاقة باسكال",
    latex: "\\binom{n}{k} + \\binom{n}{k+1} = \\binom{n+1}{k+1}",
  },
  {
    id: "prob_expect",
    category: "الاحتمالات والإحصاء",
    title: "الأمل الرياضي والتباين",
    latex:
      "E(X) = \\sum x_{i}\\, p_{i} \\quad , \\quad V(X) = E(X^{2}) - \\left(E(X)\\right)^{2}",
  },
  {
    id: "prob_poisson",
    category: "الاحتمالات والإحصاء",
    title: "قانون بواسون",
    latex:
      "P(X = k) = \\dfrac{\\lambda^{k} e^{-\\lambda}}{k!} \\quad , \\quad E(X) = V(X) = \\lambda",
  },
  {
    id: "prob_normal",
    category: "الاحتمالات والإحصاء",
    title: "التوزيع الطبيعي والمتغير المعياري",
    latex:
      "f(x) = \\dfrac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}} \\quad , \\quad Z = \\dfrac{X - \\mu}{\\sigma}",
  },
  {
    id: "prob_exp",
    category: "الاحتمالات والإحصاء",
    title: "القانون الأسي",
    latex:
      "P(X \\leq t) = 1 - e^{-\\lambda t} \\quad , \\quad E(X) = \\dfrac{1}{\\lambda}",
  },

  // Equations
  {
    id: "eq_quad",
    category: "المعادلات والجبر",
    title: "حل المعادلة من الدرجة الثانية",
    latex:
      "ax^{2} + bx + c = 0 \\ , \\ \\Delta = b^{2} - 4ac \\ , \\ x_{1,2} = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a}",
  },
  {
    id: "eq_vieta2",
    category: "المعادلات والجبر",
    title: "علاقات فييت (الدرجة الثانية)",
    latex:
      "x_{1} + x_{2} = -\\dfrac{b}{a} \\quad , \\quad x_{1}\\, x_{2} = \\dfrac{c}{a}",
  },
  {
    id: "eq_vieta3",
    category: "المعادلات والجبر",
    title: "علاقات فييت (الدرجة الثالثة)",
    latex:
      "x_{1} + x_{2} + x_{3} = -\\dfrac{b}{a} \\ , \\ x_{1}x_{2} + x_{1}x_{3} + x_{2}x_{3} = \\dfrac{c}{a} \\ , \\ x_{1}x_{2}x_{3} = -\\dfrac{d}{a}",
  },
  {
    id: "eq_canon",
    category: "المعادلات والجبر",
    title: "الشكل النموذجي لكثير حدود الدرجة الثانية",
    latex:
      "ax^{2} + bx + c = a\\left(x + \\dfrac{b}{2a}\\right)^{2} - \\dfrac{\\Delta}{4a}",
  },
  {
    id: "eq_identities",
    category: "المعادلات والجبر",
    title: "المتطابقات الشهيرة",
    latex:
      "(a \\pm b)^{2} = a^{2} \\pm 2ab + b^{2} \\quad , \\quad a^{2} - b^{2} = (a - b)(a + b)",
  },
  {
    id: "eq_cubes",
    category: "المعادلات والجبر",
    title: "مجموع وفرق مكعبين",
    latex: "a^{3} \\pm b^{3} = (a \\pm b)(a^{2} \\mp ab + b^{2})",
  },
  {
    id: "eq_cramer",
    category: "المعادلات والجبر",
    title: "قاعدة كرامر",
    latex:
      "x = \\dfrac{D_{x}}{D} \\quad , \\quad y = \\dfrac{D_{y}}{D} \\quad (D \\neq 0)",
  },

  // Logs & exponentials
  {
    id: "log_props",
    category: "اللوغاريتمات والأسس",
    title: "خواص اللوغاريتم",
    latex:
      "\\ln(ab) = \\ln a + \\ln b \\ , \\ \\ln\\dfrac{a}{b} = \\ln a - \\ln b \\ , \\ \\ln a^{n} = n \\ln a",
  },
  {
    id: "log_base",
    category: "اللوغاريتمات والأسس",
    title: "تغيير الأساس",
    latex:
      "\\log_{b} x = \\dfrac{\\ln x}{\\ln b} \\quad , \\quad \\log x = \\dfrac{\\ln x}{\\ln 10}",
  },
  {
    id: "exp_props",
    category: "اللوغاريتمات والأسس",
    title: "خواص الأسس",
    latex:
      "a^{m} \\cdot a^{n} = a^{m+n} \\ , \\ \\dfrac{a^{m}}{a^{n}} = a^{m-n} \\ , \\ (a^{m})^{n} = a^{mn}",
  },
  {
    id: "exp_ln",
    category: "اللوغاريتمات والأسس",
    title: "العلاقة بين e و ln",
    latex:
      "e^{\\ln x} = x \\ (x > 0) \\quad , \\quad \\ln(e^{x}) = x \\quad , \\quad a^{x} = e^{x \\ln a}",
  },

  // More trig
  {
    id: "trig_values",
    category: "المثلثات والمتطابقات",
    title: "القيم الشهيرة",
    latex:
      "\\sin\\dfrac{\\pi}{6} = \\dfrac{1}{2} \\ , \\ \\sin\\dfrac{\\pi}{4} = \\dfrac{\\sqrt{2}}{2} \\ , \\ \\sin\\dfrac{\\pi}{3} = \\dfrac{\\sqrt{3}}{2}",
  },
  {
    id: "trig_tan_sum",
    category: "المثلثات والمتطابقات",
    title: "ظل مجموع زاويتين",
    latex:
      "\\tan(a \\pm b) = \\dfrac{\\tan a \\pm \\tan b}{1 \\mp \\tan a \\tan b}",
  },
  {
    id: "trig_sine_law",
    category: "المثلثات والمتطابقات",
    title: "قانون الجيوب",
    latex:
      "\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C} = 2R",
  },
  {
    id: "trig_cos_law",
    category: "المثلثات والمتطابقات",
    title: "قانون جيوب التمام (الكاشي)",
    latex: "a^{2} = b^{2} + c^{2} - 2bc\\cos A",
  },
  {
    id: "trig_linear",
    category: "المثلثات والمتطابقات",
    title: "تخفيض القوة",
    latex:
      "\\cos^{2}x = \\dfrac{1 + \\cos 2x}{2} \\quad , \\quad \\sin^{2}x = \\dfrac{1 - \\cos 2x}{2}",
  },

  // More derivatives
  {
    id: "deriv_chain",
    category: "قواعد الاشتقاق",
    title: "مشتقة دالة مركبة (قاعدة السلسلة)",
    latex: "\\left(f \\circ g\\right)'(x) = f'\\left(g(x)\\right) \\cdot g'(x)",
  },
  {
    id: "deriv_trig",
    category: "قواعد الاشتقاق",
    title: "مشتقات الدوال المثلثية",
    latex:
      "(\\sin u)' = u'\\cos u \\ , \\ (\\cos u)' = -u'\\sin u \\ , \\ (\\tan u)' = \\dfrac{u'}{\\cos^{2} u}",
  },
  {
    id: "deriv_inv_trig",
    category: "قواعد الاشتقاق",
    title: "مشتقات الدوال المثلثية العكسية",
    latex:
      "(\\arcsin x)' = \\dfrac{1}{\\sqrt{1 - x^{2}}} \\ , \\ (\\arctan x)' = \\dfrac{1}{1 + x^{2}}",
  },
  {
    id: "deriv_tangent",
    category: "قواعد الاشتقاق",
    title: "معادلة المماس",
    latex: "y = f'(x_{0})\\,(x - x_{0}) + f(x_{0})",
  },
  {
    id: "deriv_taylor",
    category: "قواعد الاشتقاق",
    title: "منشور تايلور",
    latex: "f(x) = \\sum_{n=0}^{\\infty} \\dfrac{f^{(n)}(a)}{n!}\\,(x - a)^{n}",
  },
  {
    id: "deriv_lhopital",
    category: "قواعد الاشتقاق",
    title: "قاعدة لوبيتال",
    latex:
      "\\lim_{x \\to a} \\dfrac{f(x)}{g(x)} = \\lim_{x \\to a} \\dfrac{f'(x)}{g'(x)} \\quad \\left(\\tfrac{0}{0} \\text{ أو } \\tfrac{\\infty}{\\infty}\\right)",
  },

  // More integrals
  {
    id: "int_ftc",
    category: "قواعد التكامل",
    title: "المبرهنة الأساسية للتكامل",
    latex: "\\int_{a}^{b} f(x)\\, dx = F(b) - F(a) \\quad , \\quad F' = f",
  },
  {
    id: "int_exp",
    category: "قواعد التكامل",
    title: "تكاملات أساسية",
    latex:
      "\\int e^{x}\\, dx = e^{x} + C \\ , \\ \\int \\dfrac{dx}{x} = \\ln|x| + C",
  },
  {
    id: "int_trig",
    category: "قواعد التكامل",
    title: "تكامل الدوال المثلثية",
    latex:
      "\\int \\sin x\\, dx = -\\cos x + C \\ , \\ \\int \\cos x\\, dx = \\sin x + C",
  },
  {
    id: "int_arctan",
    category: "قواعد التكامل",
    title: "تكامل يعطي arctan و arcsin",
    latex:
      "\\int \\dfrac{dx}{1 + x^{2}} = \\arctan x + C \\ , \\ \\int \\dfrac{dx}{\\sqrt{1 - x^{2}}} = \\arcsin x + C",
  },
  {
    id: "int_subst",
    category: "قواعد التكامل",
    title: "التكامل بتغيير المتغير",
    latex:
      "\\int f\\left(g(x)\\right) g'(x)\\, dx = \\int f(u)\\, du \\quad (u = g(x))",
  },
  {
    id: "int_mean",
    category: "قواعد التكامل",
    title: "القيمة المتوسطة لدالة",
    latex: "\\mu = \\dfrac{1}{b - a} \\int_{a}^{b} f(x)\\, dx",
  },
  {
    id: "int_volume",
    category: "قواعد التكامل",
    title: "حجم مجسم دوراني",
    latex: "V = \\pi \\int_{a}^{b} \\left(f(x)\\right)^{2} dx",
  },

  // More limits
  {
    id: "limit_e",
    category: "النهايات الشهيرة",
    title: "تعريف العدد e",
    latex:
      "\\lim_{n \\to +\\infty} \\left(1 + \\dfrac{1}{n}\\right)^{n} = e \\quad , \\quad \\lim_{x \\to 0} \\dfrac{e^{x} - 1}{x} = 1",
  },
  {
    id: "limit_ln1",
    category: "النهايات الشهيرة",
    title: "نهاية لوغاريتمية شهيرة",
    latex: "\\lim_{x \\to 0} \\dfrac{\\ln(1 + x)}{x} = 1",
  },

  // More sequences
  {
    id: "seq_arith_def",
    category: "المتتاليات والمجاميع",
    title: "المتتالية الحسابية",
    latex: "u_{n+1} = u_{n} + r \\quad , \\quad u_{n} = u_{p} + (n - p)\\, r",
  },
  {
    id: "seq_geom_def",
    category: "المتتاليات والمجاميع",
    title: "المتتالية الهندسية",
    latex: "u_{n+1} = q\\, u_{n} \\quad , \\quad u_{n} = u_{p}\\, q^{\\,n - p}",
  },
  {
    id: "seq_sum_n",
    category: "المتتاليات والمجاميع",
    title: "مجموع الأعداد الطبيعية",
    latex:
      "\\sum_{k=1}^{n} k = \\dfrac{n(n+1)}{2} \\quad , \\quad \\sum_{k=1}^{n} k^{2} = \\dfrac{n(n+1)(2n+1)}{6}",
  },
  {
    id: "seq_sum_cubes",
    category: "المتتاليات والمجاميع",
    title: "مجموع المكعبات",
    latex: "\\sum_{k=1}^{n} k^{3} = \\left(\\dfrac{n(n+1)}{2}\\right)^{2}",
  },
  {
    id: "seq_geom_limit",
    category: "المتتاليات والمجاميع",
    title: "نهاية qⁿ",
    latex:
      "\\lim_{n \\to +\\infty} q^{n} = \\begin{cases} 0 & |q| < 1 \\\\ 1 & q = 1 \\\\ +\\infty & q > 1 \\end{cases}",
  },
  {
    id: "seq_fixed",
    category: "المتتاليات والمجاميع",
    title: "النقطة الصامدة للمتتالية التراجعية",
    latex:
      "u_{n+1} = a\\, u_{n} + b \\implies l = \\dfrac{b}{1 - a} \\ , \\ v_{n} = u_{n} - l = v_{0}\\, a^{n}",
  },

  // Matrices
  {
    id: "mat_det2",
    category: "المصفوفات",
    title: "محدد مصفوفة 2 × 2",
    latex: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc",
  },
  {
    id: "mat_inv2",
    category: "المصفوفات",
    title: "مقلوب مصفوفة 2 × 2",
    latex:
      "A^{-1} = \\dfrac{1}{ad - bc} \\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}",
  },
  {
    id: "mat_inv",
    category: "المصفوفات",
    title: "المقلوب بالمصفوفة المرافقة",
    latex:
      "A^{-1} = \\dfrac{1}{\\det(A)}\\, \\operatorname{adj}(A) \\quad , \\quad A\\, A^{-1} = I",
  },
  {
    id: "mat_det_prod",
    category: "المصفوفات",
    title: "خواص المحدد",
    latex:
      "\\det(AB) = \\det(A)\\det(B) \\ , \\ \\det(A^{T}) = \\det(A) \\ , \\ \\det(kA) = k^{n}\\det(A)",
  },
  {
    id: "mat_transpose",
    category: "المصفوفات",
    title: "خواص المنقول والمقلوب",
    latex: "(AB)^{T} = B^{T} A^{T} \\quad , \\quad (AB)^{-1} = B^{-1} A^{-1}",
  },
  {
    id: "mat_eigen",
    category: "المصفوفات",
    title: "المعادلة المميزة",
    latex:
      "\\det(A - \\lambda I) = 0 \\quad , \\quad \\lambda_{1} + \\lambda_{2} = \\operatorname{tr}(A) \\ , \\ \\lambda_{1}\\lambda_{2} = \\det(A)",
  },
  {
    id: "mat_system",
    category: "المصفوفات",
    title: "حل جملة بالمصفوفات",
    latex: "AX = B \\implies X = A^{-1} B",
  },

  // Complex numbers
  {
    id: "cx_forms",
    category: "الأعداد المركبة",
    title: "أشكال العدد المركب",
    latex: "z = a + bi = r(\\cos\\theta + i\\sin\\theta) = r\\, e^{i\\theta}",
  },
  {
    id: "cx_mod",
    category: "الأعداد المركبة",
    title: "الطويلة والمرافق",
    latex:
      "|z| = \\sqrt{a^{2} + b^{2}} \\quad , \\quad z\\, \\overline{z} = |z|^{2}",
  },
  {
    id: "cx_arg",
    category: "الأعداد المركبة",
    title: "خواص العمدة",
    latex:
      "\\arg(z_{1} z_{2}) = \\arg z_{1} + \\arg z_{2} \\quad , \\quad \\arg\\dfrac{z_{1}}{z_{2}} = \\arg z_{1} - \\arg z_{2}",
  },
  {
    id: "cx_moivre",
    category: "الأعداد المركبة",
    title: "دستور دوموافر",
    latex:
      "\\left(\\cos\\theta + i\\sin\\theta\\right)^{n} = \\cos n\\theta + i\\sin n\\theta",
  },
  {
    id: "cx_euler",
    category: "الأعداد المركبة",
    title: "دساتير أويلر",
    latex:
      "\\cos\\theta = \\dfrac{e^{i\\theta} + e^{-i\\theta}}{2} \\quad , \\quad \\sin\\theta = \\dfrac{e^{i\\theta} - e^{-i\\theta}}{2i}",
  },
  {
    id: "cx_identity",
    category: "الأعداد المركبة",
    title: "متطابقة أويلر",
    latex: "e^{i\\pi} + 1 = 0",
  },
  {
    id: "cx_euler_core",
    category: "الأعداد المركبة",
    title: "قانون أويلر: الربط بين المثلثي والأسي",
    latex: String.raw`e^{i\theta}=\cos\theta+i\sin\theta`,
    description: "الزاوية في الأس بالراديان، وθ عدد حقيقي.",
  },
  {
    id: "cx_point",
    category: "الأعداد المركبة",
    title: "العدد العقدي والنقطة والشعاع",
    latex: String.raw`z=x+iy\longleftrightarrow M(x,y),\quad\overrightarrow{OM}=(x,y)`,
  },
  {
    id: "cx_distance",
    category: "الأعداد المركبة",
    title: "المسافة بين نقطتين",
    latex: String.raw`AB=|z_B-z_A|`,
  },
  {
    id: "cx_angle",
    category: "الأعداد المركبة",
    title: "زاوية شعاعين بعمدة النسبة",
    latex: String.raw`(\overrightarrow{OA},\overrightarrow{OB})=\arg\left(\frac{z_B}{z_A}\right)\pmod{2\pi}`,
    description: "يشترط أن يكون الشعاعان غير صفريين؛ ترتيب النسبة مهم.",
  },
  {
    id: "cx_translation",
    category: "الأعداد المركبة",
    title: "الانسحاب",
    latex: String.raw`z'=z+b`,
  },
  {
    id: "cx_homothety",
    category: "الأعداد المركبة",
    title: "التحاكي",
    latex: String.raw`z'-\omega=k(z-\omega),\quad k\in\mathbb R`,
  },
  {
    id: "cx_rotation",
    category: "الأعداد المركبة",
    title: "الدوران حول مركز",
    latex: String.raw`z'-\omega=e^{i\theta}(z-\omega)`,
  },
  {
    id: "cx_roots",
    category: "الأعداد المركبة",
    title: "الجذور النونية",
    latex:
      "w_{k} = \\sqrt[n]{r}\\; e^{\\,i\\frac{\\theta + 2k\\pi}{n}} \\quad , \\quad k = 0, 1, \\dots, n - 1",
  },
];

export const FormulaReference: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"formulas" | "constants">(
    "formulas",
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("الكل");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = [
    "الكل",
    "المعادلات والجبر",
    "اللوغاريتمات والأسس",
    "المثلثات والمتطابقات",
    "قواعد الاشتقاق",
    "قواعد التكامل",
    "النهايات الشهيرة",
    "المتتاليات والمجاميع",
    "الاحتمالات والإحصاء",
    "المصفوفات",
    "الأعداد المركبة",
  ];

  const filteredFormulas = FORMULA_DATABASE.filter((f) => {
    const matchesCat =
      selectedCategory === "الكل" || f.category === selectedCategory;
    const matchesQuery =
      !searchQuery ||
      f.title.includes(searchQuery) ||
      f.category.includes(searchQuery) ||
      f.latex.includes(searchQuery);
    return matchesCat && matchesQuery;
  });

  const filteredConstants = SCIENTIFIC_CONSTANTS.filter((c) => {
    return (
      !searchQuery ||
      c.name.includes(searchQuery) ||
      c.symbol.includes(searchQuery) ||
      c.category.includes(searchQuery)
    );
  });

  const handleCopy = async (id: string, text: string) => {
    soundHaptics.playClick();
    if (!(await copyToClipboard(text))) {
      soundHaptics.playError();
      return;
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Top Main Tab Toggle */}
      <div className="flex items-center justify-between bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex items-center gap-1.5 w-full">
          <button
            onClick={() => {
              soundHaptics.playClick();
              setActiveTab("formulas");
            }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              activeTab === "formulas"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>بنك القوانين الرياضية الشاملة</span>
          </button>

          <button
            onClick={() => {
              soundHaptics.playClick();
              setActiveTab("constants");
            }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              activeTab === "constants"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Atom className="w-4 h-4" />
            <span>الثوابت الفيزيائية والكيميائية القياسية</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث عن قانون، متطابقة، مشتق، أو ثابت علمي..."
          className="w-full pl-4 pr-10 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:border-emerald-500 outline-none"
        />
      </div>

      {/* Category Filter Chips for Formulas */}
      {activeTab === "formulas" && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                soundHaptics.playClick();
                setSelectedCategory(cat);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-sm"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Formulas Content Grid */}
      {activeTab === "formulas" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredFormulas.map((f) => (
            <div
              key={f.id}
              className="bg-slate-900 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 shadow-xl space-y-2.5 flex flex-col justify-between transition-all group"
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-slate-200">
                      {f.title}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                    {f.category}
                  </span>
                </div>

                {/* font shrinks with formula length; the box itself scrolls sideways to the end of long formulas */}
                <div
                  dir="ltr"
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 overflow-x-auto overflow-y-hidden my-2 touch-pan-x"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <div
                    className="w-max min-w-full flex justify-center"
                    style={{
                      fontSize:
                        f.latex.length > 170
                          ? "0.72rem"
                          : f.latex.length > 120
                            ? "0.82rem"
                            : f.latex.length > 80
                              ? "0.92rem"
                              : "1rem",
                    }}
                  >
                    <Tex math={f.latex} />
                  </div>
                </div>

                {f.description && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {f.description}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => handleCopy(f.id, f.latex)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-all"
                >
                  {copiedId === f.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedId === f.id ? "تم النسخ" : "نسخ الصيغة"}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scientific Constants Content Grid */}
      {activeTab === "constants" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filteredConstants.map((c, i) => (
            <div
              key={i}
              className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg flex flex-col justify-between space-y-2"
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" />
                    <span>{c.symbol}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded">
                    {c.category}
                  </span>
                </div>
                <div className="text-xs text-slate-200 mt-2 font-medium">
                  {c.name}
                </div>
                <div
                  className="text-sm font-bold text-emerald-400 font-mono mt-1"
                  dir="ltr"
                >
                  <KaTeXDisplay math={c.latex} />
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-slate-800">
                <button
                  onClick={() => handleCopy(c.symbol, String(c.value))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-all"
                >
                  {copiedId === c.symbol ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedId === c.symbol ? "تم النسخ" : "نسخ القيمة"}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
