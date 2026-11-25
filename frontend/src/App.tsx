import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { Overview } from './components/Overview';
import { ImageAnalyzer } from './components/ImageAnalyzer';
import { VideoAnalyzer } from './components/VideoAnalyzer';
import { DetectionHistory } from './components/DetectionHistory';
import { fetchModelStatus, fetchOverviewStats, fetchHistory } from './services/api';
import type { ModelStatus, OverviewStats, DetectionEvent } from './types';
import { AlertCircle } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'image' | 'video' | 'history'>('overview');
  const [selectedHistoryFolderId, setSelectedHistoryFolderId] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [historyEvents, setHistoryEvents] = useState<DetectionEvent[]>([]);
  const [backendError, setBackendError] = useState<boolean>(false);

  // Theme Management: Light mode is the default on every first open.
  // If the user toggles to dark mode, it is remembered for their active session.
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const sessionTheme = sessionStorage.getItem('thermal_theme') as 'dark' | 'light';
    if (sessionTheme === 'dark' || sessionTheme === 'light') {
      return sessionTheme;
    }
    return 'light';
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      sessionStorage.setItem('thermal_theme', next);
      localStorage.setItem('thermal_theme', next);
      return next;
    });
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  }, [theme]);

  const loadData = useCallback(async () => {
    try {
      const [mStatus, oStats, hEvents] = await Promise.all([
        fetchModelStatus().catch(() => null),
        fetchOverviewStats().catch(() => null),
        fetchHistory().catch(() => []),
      ]);

      if (mStatus) setModelStatus(mStatus);
      if (oStats) setOverviewStats(oStats);
      if (hEvents) setHistoryEvents(hEvents);
      setBackendError(!mStatus && !oStats);
    } catch {
      setBackendError(true);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const totalFoldersCount = useMemo(() => {
    const videoJobs = new Set<string>();
    historyEvents.forEach((ev) => {
      if (ev.job_id) videoJobs.add(ev.job_id);
      else if (ev.filename) videoJobs.add(ev.filename);
    });
    let imageFoldersCount = 0;
    try {
      const raw = localStorage.getItem('thermal_image_folders');
      if (raw) imageFoldersCount = JSON.parse(raw).length;
    } catch {
      imageFoldersCount = 0;
    }
    return videoJobs.size + imageFoldersCount;
  }, [historyEvents]);

  return (
    <div
      className={`min-h-screen ${
        theme === 'light' ? 'bg-[#f1f5f9] text-slate-800' : 'bg-[#04070d] text-slate-200'
      } flex flex-col font-sans selection:bg-[#00c8e6] selection:text-black surveillance-grid transition-colors duration-200`}
    >
      {/* Top Surveillance Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        modelStatus={modelStatus}
        historyCount={totalFoldersCount}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Backend connection warning banner if server is starting or offline */}
      {backendError && (
        <div className="bg-amber-950/60 border-b border-amber-500/40 px-4 py-2 text-xs font-mono text-amber-300 flex items-center justify-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Connecting to AI backend service... Launching Python model engine.</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 pt-8">
        {activeTab === 'overview' && (
          <Overview
            stats={overviewStats}
            events={historyEvents}
            onNavigate={(tab, folderId) => {
              if (folderId) setSelectedHistoryFolderId(folderId);
              setActiveTab(tab);
            }}
          />
        )}
        {activeTab === 'image' && <ImageAnalyzer />}
        {activeTab === 'video' && <VideoAnalyzer />}
        {activeTab === 'history' && (
          <DetectionHistory
            events={historyEvents}
            onRefresh={loadData}
            initialFolderId={selectedHistoryFolderId}
            onSelectFolder={setSelectedHistoryFolderId}
          />
        )}
      </main>
    </div>
  );
}

export default App;
