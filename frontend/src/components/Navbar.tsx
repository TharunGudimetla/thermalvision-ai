import React from 'react';
import { LayoutGrid, Camera, Film, RotateCcw, Zap, TrendingUp } from 'lucide-react';
import type { ModelStatus } from '../types';

interface NavbarProps {
  activeTab: 'overview' | 'live' | 'video' | 'history';
  setActiveTab: (tab: 'overview' | 'live' | 'video' | 'history') => void;
  modelStatus: ModelStatus | null;
  historyCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  modelStatus: _modelStatus,
  historyCount,
}) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-[#06080e]/95 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Branding & Status Badges */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#09152b] border border-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-950/40">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-wide text-white">
                Sentinel Vanguard
              </span>
            </div>
            <div className="text-[10px] font-bold tracking-widest text-cyan-400 font-mono">
              ACCIDENT DETECTION
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2.5 ml-3 pl-3 border-l border-slate-800">
            {/* Local Analyzer Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0b1b36] border border-cyan-500/40 text-[11px] text-cyan-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              LOCAL ANALYZER
            </div>

            {/* Simulate incident Button */}
            <button
              onClick={() => setActiveTab('video')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0e1626] hover:bg-[#15233c] border border-slate-700/80 text-[11px] text-amber-400 font-medium transition-colors cursor-pointer"
            >
              <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
              Simulate incident
            </button>
          </div>
        </div>

        {/* Right: Navigation Tabs */}
        <nav className="flex items-center gap-1.5 bg-[#080d18] p-1 rounded-xl border border-slate-800/90">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#155fc3] text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'live'
                ? 'bg-[#155fc3] text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Live Monitor</span>
          </button>

          <button
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'video'
                ? 'bg-[#155fc3] text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Video Analyzer</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#155fc3] text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Incident History</span>
            {historyCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-cyan-950 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold">
                {historyCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
};
