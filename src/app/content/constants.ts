// Physical constants shared with the offline formula reference.
export const SCIENTIFIC_CONSTANTS = [
  { symbol: 'π', name: 'النسبة التقريبية (Pi)', value: Math.PI, latex: '\\pi', category: 'رياضيات' },
  { symbol: 'e', name: 'العدد النيبيري (Euler)', value: Math.E, latex: 'e', category: 'رياضيات' },
  { symbol: 'φ', name: 'النسبة الذهبية (Golden Ratio)', value: 1.618033988749895, latex: '\\phi = \\frac{1+\\sqrt{5}}{2}', category: 'رياضيات' },
  { symbol: 'c', name: 'سرعة الضوء في الفراغ (m/s)', value: 299792458, latex: 'c = 2.9979 \\times 10^8 \\text{ m/s}', category: 'فيزياء' },
  { symbol: 'h', name: 'ثابت بلانك (J·s)', value: 6.62607015e-34, latex: 'h = 6.626 \\times 10^{-34} \\text{ J}\\cdot\\text{s}', category: 'فيزياء' },
  { symbol: 'ħ', name: 'ثابت ديراك (ħ = h/2π)', value: 1.054571817e-34, latex: '\\hbar = 1.054 \\times 10^{-34} \\text{ J}\\cdot\\text{s}', category: 'فيزياء' },
  { symbol: 'G', name: 'ثابت الجذب العام (N·m²/kg²)', value: 6.6743e-11, latex: 'G = 6.674 \\times 10^{-11} \\text{ N}\\cdot\\text{m}^2/\\text{kg}^2', category: 'فيزياء' },
  { symbol: 'g', name: 'تسارع الجاذبية الأرضية (m/s²)', value: 9.80665, latex: 'g = 9.80665 \\text{ m/s}^2', category: 'فيزياء' },
  { symbol: 'N_A', name: 'عدد أفوغادرو (mol⁻¹)', value: 6.02214076e23, latex: 'N_A = 6.022 \\times 10^{23} \\text{ mol}^{-1}', category: 'كيمياء وفيرياء' },
  { symbol: 'k_B', name: 'ثابت بولتزمان (J/K)', value: 1.380649e-23, latex: 'k_B = 1.380 \\times 10^{-23} \\text{ J/K}', category: 'فيزياء' },
  { symbol: 'q_e', name: 'الشحنة الأولية للإلكترون (C)', value: 1.602176634e-19, latex: 'e = 1.602 \\times 10^{-19} \\text{ C}', category: 'فيزياء' },
  { symbol: 'm_e', name: 'كتلة الإلكترون (kg)', value: 9.1093837e-31, latex: 'm_e = 9.109 \\times 10^{-31} \\text{ kg}', category: 'فيزياء' },
  { symbol: 'ε_0', name: 'سماحية الفراغ (F/m)', value: 8.8541878128e-12, latex: '\\varepsilon_0 = 8.854 \\times 10^{-12} \\text{ F/m}', category: 'فيزياء' },
  { symbol: 'μ_0', name: 'نفاذية الفراغ (N/A²)', value: 1.25663706212e-6, latex: '\\mu_0 = 4\\pi \\times 10^{-7} \\text{ N/A}^2', category: 'فيزياء' },
  { symbol: 'R', name: 'ثابت الغازات العام (J/(mol·K))', value: 8.314462618, latex: 'R = 8.314 \\text{ J}/(\\text{mol}\\cdot\\text{K})', category: 'كيمياء' },
  { symbol: 'σ', name: 'ثابت ستيفان-بولتزمان (W/(m²·K⁴))', value: 5.670374419e-8, latex: '\\sigma = 5.670 \\times 10^{-8} \\text{ W}/(\\text{m}^2\\text{K}^4)', category: 'فيزياء' }
];
