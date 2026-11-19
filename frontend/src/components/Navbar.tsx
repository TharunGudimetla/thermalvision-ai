import React from 'react';
import {
  LayoutGrid,
  Image as ImageIcon,
  Film,
  RotateCcw,
  TrendingUp,
  Sun,
} from 'lucide-react';
import type { ModelStatus } from '../types';

interface NavbarProps {
  activeTab: 'overview' | 'image' | 'video' | 'history';
  setActiveTab: (tab: 'overview' | 'image' | 'video' | 'history') => void;
  modelStatus: ModelStatus | null;
  historyCount: number;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  modelStatus: _modelStatus,
  historyCount,
  theme,
  toggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-[#04070d]/95 backdrop-blur-md border-b border-[#11243b] px-4 lg:px-8 py-3.5 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Branding & Status Badges */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#071322] border border-cyan-500/50 flex items-center justify-center shadow-lg shadow-cyan-950/40">
            <TrendingUp className="w-5 h-5 text-[#00e5ff]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base sm:text-lg tracking-wide text-white">
                THERMAL VISION AI
              </span>
            </div>
            <div className="text-[10px] font-bold tracking-widest text-[#00d2c4] font-mono">
              Advanced Thermal Surveillance
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2.5 ml-3 pl-3 border-l border-[#11243b]">
            {/* System Online Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#042017] border border-[#10b981]/40 text-[#10b981] font-mono text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
              SYSTEM ONLINE
            </div>

            <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
              AI Detection Active
            </span>
          </div>
        </div>

        {/* Right: Navigation Tabs & Light/Dark Mode Switch */}
        <div className="flex items-center flex-wrap gap-2">
          <nav className="flex items-center gap-1 bg-[#071322] p-1 rounded-xl border border-[#11243b]">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-[#00c8e6] text-slate-950 shadow-md shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-[#0b1c30]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('image')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'image'
                  ? 'bg-[#00c8e6] text-slate-950 shadow-md shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-[#0b1c30]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Image Analyzer</span>
            </button>

            <button
              onClick={() => setActiveTab('video')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'video'
                  ? 'bg-[#00c8e6] text-slate-950 shadow-md shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-[#0b1c30]'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Video Analyzer</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#00c8e6] text-slate-950 shadow-md shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-[#0b1c30]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Incident History</span>
              {historyCount > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'history'
                      ? 'bg-slate-950 text-[#00e5ff]'
                      : 'bg-[#052331] border border-cyan-400 text-[#00e5ff]'
                  }`}
                >
                  {historyCount}
                </span>
              )}
            </button>
          </nav>

          {/* Circle Sun Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Light and Dark Mode"
            className="w-9 h-9 rounded-full bg-[#071322] hover:bg-[#0c1c30] border border-[#11243b] hover:border-cyan-400 flex items-center justify-center transition-all cursor-pointer shadow-md shadow-cyan-950/40 group relative"
          >
            <Sun
              className={`w-4 h-4 transition-all duration-300 group-hover:rotate-90 group-hover:scale-110 ${
                theme === 'dark'
                  ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                  : 'text-amber-500 fill-amber-400/30'
              }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
};
