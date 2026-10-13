import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppMode, AngleMode, HistoryEntry } from './types';
import { localDB } from './utils/localDB';
import { Header } from './components/common/Header';
import { ScientificCalculator } from './components/scientific/ScientificCalculator';
import { EquationSolver } from './components/equations/EquationSolver';
import { SequenceSolver } from './components/sequences/SequenceSolver';
import { CalculusSolver } from './components/calculus/CalculusSolver';
import { IntegrationSolver } from './components/integration/IntegrationSolver';
import { GeometrySolver } from './components/geometry/GeometrySolver';
import { ProbabilitySolver } from './components/probability/ProbabilitySolver';
import { MatrixSolver } from './components/matrices/MatrixSolver';
import { ComplexSolver } from './components/complex/ComplexSolver';
import { FormulaReference } from './components/reference/FormulaReference';
import { HistoryDrawer } from './components/history/HistoryDrawer';
import { HelpTutorialModal } from './components/common/HelpTutorialModal';
import { soundHaptics } from './utils/soundHaptics';
import { 
  Calculator, 
  Variable, 
  TrendingUp, 
  Activity, 
  Sigma,
  Infinity,
  Box,
  Dice5, 
  Grid, 
  Compass, 
  BookOpen, 
  History
} from 'lucide-react';

export default function App() {
  const [currentMode, setCurrentMode] = useState<AppMode>('scientific');
  const [angleMode, setAngleMode] = useState<AngleMode>(() => {
    return localDB.getSettings().angleMode || 'DEG';
  });
  const [history, setHistory] = useState<HistoryEntry[]>(() => localDB.getHistory());
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Sync settings
  const handleAngleModeChange = useCallback((mode: AngleMode) => {
    setAngleMode(mode);
    localDB.saveSettings({ angleMode: mode });
  }, []);

  const refreshHistory = useCallback(() => {
    setHistory(localDB.getHistory());
  }, []);

  const handleSaveHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    localDB.saveHistoryEntry(entry);
    refreshHistory();
  }, [refreshHistory]);

  // Initial load
  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Only the active section stays mounted: the others are not rendered,
  // so switching sections does not keep heavy charts and formulas alive.
  const activeSection = useMemo(() => {
    switch (currentMode) {
      case 'scientific':
        return (
          <ScientificCalculator
            angleMode={angleMode}
            onAngleModeChange={handleAngleModeChange}
            onSaveHistory={handleSaveHistory}
          />
        );
      case 'equations':
        return <EquationSolver onSaveHistory={handleSaveHistory} />;
      case 'sequences':
        return <SequenceSolver onSaveHistory={handleSaveHistory} />;
      case 'calculus':
        return <CalculusSolver onSaveHistory={handleSaveHistory} initialMode="derivative" modeOnly />;
      case 'integration':
        return <IntegrationSolver onSaveHistory={handleSaveHistory} />;
      case 'limits':
        return <CalculusSolver onSaveHistory={handleSaveHistory} initialMode="limits" modeOnly />;
      case 'geometry':
        return <GeometrySolver />;
      case 'probability':
        return <ProbabilitySolver onSaveHistory={handleSaveHistory} />;
      case 'matrices':
        return <MatrixSolver onSaveHistory={handleSaveHistory} />;
      case 'complex':
        return <ComplexSolver onSaveHistory={handleSaveHistory} />;
      case 'reference':
        return <FormulaReference />;
      case 'history':
        return <HistoryDrawer history={history} onRefreshHistory={refreshHistory} />;
      default:
        return null;
    }
  }, [currentMode, angleMode, handleAngleModeChange, handleSaveHistory, history, refreshHistory]);

  const mobileNavItems = [
    { mode: 'scientific', label: 'حاسبة', icon: Calculator },
    { mode: 'equations', label: 'معادلات', icon: Variable },
    { mode: 'sequences', label: 'متتاليات', icon: TrendingUp },
    { mode: 'calculus', label: 'اشتقاق', icon: Activity },
    { mode: 'integration', label: 'تكامل', icon: Sigma },
    { mode: 'limits', label: 'نهايات', icon: Infinity },
    { mode: 'geometry', label: 'هندسة', icon: Box },
    { mode: 'probability', label: 'احتمالات', icon: Dice5 },
    { mode: 'matrices', label: 'مصفوفات', icon: Grid },
    { mode: 'complex', label: 'مركبة', icon: Compass },
    { mode: 'reference', label: 'قوانين', icon: BookOpen },
    { mode: 'history', label: 'السجل', icon: History }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white font-cairo">
      {/* Top Main Navigation Header */}
      <Header
        currentMode={currentMode}
        onSelectMode={(mode) => setCurrentMode(mode)}
        angleMode={angleMode}
        onToggleHelp={() => setIsHelpOpen(true)}
        historyCount={history.length}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 pb-24 md:pb-12">
        {activeSection}
      </main>

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-800/90 py-1.5 px-2 flex items-center justify-around shadow-2xl overflow-x-auto">
        {mobileNavItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentMode === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => {
                soundHaptics.playClick();
                setCurrentMode(item.mode as AppMode);
              }}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-400 font-bold scale-105'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="text-[10px] mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Help Walkthrough Modal */}
      <HelpTutorialModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}
