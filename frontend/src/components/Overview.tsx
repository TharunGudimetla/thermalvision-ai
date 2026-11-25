import React, { useState, useMemo } from 'react';
import {
  Image as ImageIcon,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
  Film,
  Radio,
  FileText,
  MonitorCheck,
  Check,
  Scan,
  GitFork,
  Gauge,
  Folder,
  FolderOpen,
  Eye,
  X,
} from 'lucide-react';
import type { OverviewStats, DetectionEvent, HistoryFolder, HistoryFolderItem } from '../types';
import { getMediaUrl } from '../services/api';

interface OverviewProps {
  stats: OverviewStats | null;
  events?: DetectionEvent[];
  onNavigate: (tab: 'overview' | 'image' | 'video' | 'history', folderId?: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({ stats, events, onNavigate }) => {
  const modelStatus = stats?.model_status;
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(6); // Default to '08 Nov' (last index)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [selectedEnlargedMedia, setSelectedEnlargedMedia] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // 1. Load LocalStorage Image Folders
  const localImageFolders = useMemo<HistoryFolder[]>(() => {
    try {
      const raw = localStorage.getItem('thermal_image_folders');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  // 2. Build Video Folders & Group Each Input as an Organized Folder
  // If an input is already stored in the database, overwrite with the new data!
  const inputFolders = useMemo<HistoryFolder[]>(() => {
    // Sort events descending by timestamp so newest sessions appear first
    const sortedEventsDesc = [...(events || [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const normalizeFileKey = (name: string) => name.toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
    const videoGroups: { [normKey: string]: { latestJobId: string; displayFilename: string; events: DetectionEvent[] } } = {};

    sortedEventsDesc.forEach((ev) => {
      const isVideo =
        Boolean(ev.job_id) ||
        Boolean(ev.processed_video_url) ||
        /\.(mp4|avi|mov|mkv|webm|flv|wmv|ts)$/i.test(ev.filename);

      if (isVideo) {
        const normKey = normalizeFileKey(ev.filename);
        if (!videoGroups[normKey]) {
          // Newest session for this normalized filename (overwrites prior duplicates)
          videoGroups[normKey] = {
            latestJobId: ev.job_id || normKey,
            displayFilename: ev.filename,
            events: [ev],
          };
        } else if (ev.job_id && ev.job_id === videoGroups[normKey].latestJobId) {
          // Additional events belonging to the newest session
          videoGroups[normKey].events.push(ev);
        }
      }
    });

    const videoFoldersList: HistoryFolder[] = Object.values(videoGroups).map(
      (groupData) => {
        const groupEvents = groupData.events;
        const filename = groupData.displayFilename;
        const firstEv = groupEvents[0];
        const peakConf = Math.max(...groupEvents.map((e) => e.confidence || 0));
        const maxPeds = Math.max(
          ...groupEvents.map((e) => e.unique_pedestrians || e.pedestrians_count || 0)
        );

        const sortedEvents = [...groupEvents].sort(
          (a, b) => (a.frame_number || 0) - (b.frame_number || 0)
        );

        const items: HistoryFolderItem[] = sortedEvents.map((e) => ({
          id: e.id,
          filename: e.filename,
          snapshotUrl: e.snapshot_url,
          frameNumber: e.frame_number,
          pedestriansCount: e.pedestrians_count,
          confidence: e.confidence,
          timestamp: e.timestamp,
        }));

        const cleanJobId = groupData.latestJobId;

        return {
          id: `video-folder-${cleanJobId}`,
          name: filename,
          inputType: 'video',
          timestamp: firstEv.timestamp,
          jobId: cleanJobId,
          totalItems: groupEvents.length,
          totalPedestrians: maxPeds,
          peakConfidence: peakConf,
          processedVideoUrl: firstEv.processed_video_url || `/outputs/${cleanJobId}_annotated.mp4`,
          originalVideoUrl: `/uploads/${cleanJobId}_${firstEv.filename}`,
          coverImageUrl: firstEv.snapshot_url,
          items,
        };
      }
    );

    // If events didn't have entries yet, fallback to stats.recent_sessions (deduplicated by normalized filename)
    if (videoFoldersList.length === 0 && stats?.recent_sessions) {
      const seenFilenames = new Set<string>();
      stats.recent_sessions.forEach((sess) => {
        const norm = normalizeFileKey(sess.filename);
        if (!seenFilenames.has(norm)) {
          seenFilenames.add(norm);
          videoFoldersList.push({
            id: `video-folder-${sess.job_id}`,
            name: sess.filename,
            inputType: 'video',
            timestamp: sess.timestamp,
            jobId: sess.job_id,
            totalItems: sess.total_frames,
            totalPedestrians: sess.unique_pedestrians ?? sess.pedestrian_detections,
            peakConfidence: sess.peak_confidence,
            processedVideoUrl: sess.processed_video_url,
            coverImageUrl: sess.snapshot_url,
            items: sess.snapshot_url
              ? [
                  {
                    id: `sess-peak-${sess.job_id}`,
                    filename: sess.filename,
                    snapshotUrl: sess.snapshot_url,
                    frameNumber: 1,
                    pedestriansCount: sess.unique_pedestrians ?? sess.pedestrian_detections,
                    confidence: sess.peak_confidence,
                    timestamp: sess.timestamp,
                  },
                ]
              : [],
          });
        }
      });
    }

    // Deduplicate local image folders by name (keeping newest overwrite)
    const uniqueImageFolders: HistoryFolder[] = [];
    const seenImageNames = new Set<string>();
    localImageFolders.forEach((f) => {
      const norm = normalizeFileKey(f.name);
      if (!seenImageNames.has(norm)) {
        seenImageNames.add(norm);
        uniqueImageFolders.push(f);
      }
    });

    const all = [...uniqueImageFolders, ...videoFoldersList].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Ensure strict deduplication across all types (image + video) so duplicates are never shown
    const deduplicated: HistoryFolder[] = [];
    const seenAllNorm = new Set<string>();
    for (const f of all) {
      const norm = normalizeFileKey(f.name);
      if (!seenAllNorm.has(norm)) {
        seenAllNorm.add(norm);
        deduplicated.push(f);
      }
    }

    return deduplicated;
  }, [events, localImageFolders, stats?.recent_sessions]);

  // 7 Days list matching reference screenshot
  const daysList = [
    '02 Nov',
    '03 Nov',
    '04 Nov',
    '05 Nov',
    '06 Nov',
    '07 Nov',
    '08 Nov',
  ];

  return (
    <div className="space-y-10 pb-16">
      {/* =========================================================================
          HERO SECTION (Matches Reference Screenshot)
         ========================================================================= */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
        {/* Left Column: Headlines & Actions (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Tag Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#071322] border border-cyan-500/40 text-[11px] font-mono font-semibold text-[#00e5ff] tracking-wider shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
            AI-POWERED THERMAL SURVEILLANCE
          </div>

          {/* Main Huge Title */}
          <div className="space-y-1">
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-black text-white tracking-tight leading-[1.12]">
              See Beyond the Visible.
            </h1>
            <div className="text-4xl sm:text-5xl lg:text-[54px] font-black text-[#00e5ff] tracking-tight leading-[1.12]">
              Detect Every Pedestrian.
            </div>
          </div>

          {/* Descriptive Body */}
          <p className="text-sm sm:text-[15px] text-slate-400 leading-relaxed max-w-xl font-normal">
            Transform thermal and infrared imagery into actionable visual intelligence. Identify pedestrians, track their movement, and analyze surveillance footage using advanced deep learning and computer vision.
          </p>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              onClick={() => onNavigate('image')}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 font-extrabold text-xs tracking-wider shadow-lg shadow-cyan-950/60 transition-all cursor-pointer transform hover:-translate-y-0.5"
            >
              <ImageIcon className="w-4 h-4 text-slate-950" />
              <span>Analyze an Image</span>
              <ArrowRight className="w-4 h-4 text-slate-950" />
            </button>

            <button
              onClick={() => onNavigate('video')}
              className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-[#071322] hover:bg-[#0c1c30] border border-[#11243b] hover:border-cyan-500/40 text-slate-200 font-bold text-xs tracking-wide transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>Analyze a Video</span>
            </button>
          </div>

          {/* Micro Telemetry Specs Row */}
          <div className="pt-5 flex items-center gap-10 border-t border-[#11243b]">
            <div>
              <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-bold">
                DETECTION
              </div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                YOLOv8
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-bold">
                TRACKING
              </div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                ByteTrack
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-bold">
                INPUT
              </div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                Thermal / IR
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Network Telemetry Card (5 Cols) */}
        <div className="lg:col-span-5">
          <div className="p-6 rounded-3xl bg-[#080e18] border border-[#11243b] shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 surveillance-grid opacity-20 pointer-events-none" />

            {/* Card Header */}
            <div className="flex items-center justify-between pb-5 border-b border-[#11243b] relative z-10">
              <div className="flex items-center gap-2 text-[#00e5ff]">
                <Radio className="w-4 h-4 animate-pulse text-[#00e5ff]" />
                <span className="text-xs font-mono font-bold tracking-wider uppercase">
                  THERMAL DETECTION METRICS
                </span>
              </div>
              <span className="px-3 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/50 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                SYSTEM STATUS
              </span>
            </div>

            {/* 2x2 Telemetry Metric Boxes */}
            <div className="grid grid-cols-2 gap-3.5 my-5 relative z-10">
              {/* Box 1 */}
              <div className="p-4 rounded-xl bg-[#050b14] border border-[#11243b] space-y-1">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                  INFERENCE ENGINE
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  YOLOv8
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Custom thermal model
                </div>
              </div>

              {/* Box 2 */}
              <div className="p-4 rounded-xl bg-[#050b14] border border-[#11243b] space-y-1">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                  PEDESTRIAN TRACKING
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  ByteTrack
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Identity association
                </div>
              </div>

              {/* Box 3 */}
              <div className="p-4 rounded-xl bg-[#050b14] border border-[#11243b] space-y-1">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                  IMAGE PROCESSING
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  1-Channel
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Grayscale input
                </div>
              </div>

              {/* Box 4 */}
              <div className="p-4 rounded-xl bg-[#050b14] border border-[#11243b] space-y-1">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                  TARGET CLASS
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  Person
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Pedestrian detection
                </div>
              </div>
            </div>

            {/* Bottom Timeline: LAST 7 DAYS */}
            <div className="pt-4 border-t border-[#11243b] relative z-10 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono tracking-wider font-semibold">
                <span className="text-slate-400 uppercase">DETECTION ACTIVITY</span>
                <span className="text-slate-500 uppercase">LAST 7 DAYS</span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[11px] font-mono">
                {daysList.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDayIndex(i)}
                    className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      selectedDayIndex === i
                        ? 'text-[#00e5ff] font-bold bg-[#071322] border border-cyan-500/40 shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2: TWO VIEWS, ONE ENGINE (Matches Reference Screenshot)
         ========================================================================= */}
      <section className="relative pt-6 border-t border-[#11243b]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-[11px] font-mono tracking-widest text-[#00e5ff] uppercase font-bold mb-1.5">
              TWO VIEWS, ONE ENGINE
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Watch live, or interrogate the footage
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md font-normal leading-relaxed">
            Both views feed the same analyzer, so an incident looks identical whether it arrived from a camera or a file.
          </p>
        </div>

        {/* Dual Primary Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Camera View (Live) */}
          <div
            onClick={() => onNavigate('image')}
            className="group cursor-pointer relative overflow-hidden rounded-2xl bg-[#080e18] border border-[#11243b] hover:border-cyan-500/50 transition-all duration-300 p-6 flex flex-col justify-between shadow-xl hover:shadow-cyan-950/30"
          >
            <div>
              {/* Badge Tag */}
              <div className="inline-block px-2.5 py-1 rounded bg-[#071322] border border-[#11243b] text-[10px] font-mono font-bold text-[#00e5ff] tracking-wider mb-4">
                IMAGE VIEW
              </div>

              {/* Vector Graphic: Road Perspective with Cyan & Amber Lines */}
              <div className="h-32 w-full rounded-xl bg-[#050b14] border border-[#11243b] mb-5 relative flex items-center justify-center overflow-hidden">
                <svg className="w-full h-full" viewBox="0 0 360 140" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="horizonDisc" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#0a192f" />
                      <stop offset="100%" stopColor="#040711" />
                    </linearGradient>
                    <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glowAmber" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Horizon Elliptical Ring */}
                  <ellipse cx="180" cy="38" rx="46" ry="12" fill="url(#horizonDisc)" stroke="#0284c7" strokeWidth="1.2" opacity="0.8" />
                  <ellipse cx="180" cy="38" rx="20" ry="5" fill="#0369a1" fillOpacity="0.3" />

                  {/* Road Boundary Perspective Lines */}
                  <path d="M 0 140 L 145 38 L 215 38 L 360 140" fill="none" stroke="#131e33" strokeWidth="1.5" />
                  <path d="M 50 140 L 155 38" fill="none" stroke="#101d36" strokeWidth="1" />
                  <path d="M 310 140 L 205 38" fill="none" stroke="#101d36" strokeWidth="1" />

                  {/* Center Line */}
                  <line x1="180" y1="140" x2="180" y2="38" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 6" />

                  {/* Left Cyan Streaks */}
                  <line x1="120" y1="140" x2="168" y2="38" stroke="#38bdf8" strokeWidth="2.5" filter="url(#glowCyan)" />
                  <line x1="140" y1="140" x2="173" y2="38" stroke="#0ea5e9" strokeWidth="1.5" opacity="0.9" />

                  {/* Right Amber Streaks */}
                  <line x1="240" y1="140" x2="192" y2="38" stroke="#f59e0b" strokeWidth="2.5" filter="url(#glowAmber)" />
                  <line x1="220" y1="140" x2="187" y2="38" stroke="#d97706" strokeWidth="1.5" opacity="0.9" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                Thermal image analyzer
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Connect a webcam or run a procedural scenario at 1.6 fps. Tracker brackets, a threat meter and an audio alert fire the moment the signal spikes, and the incident is filed automatically.
              </p>

              <ul className="space-y-2 text-xs text-slate-300 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Webcam + 4 simulator scenarios</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>On-screen tracker &amp; threat meter</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Auto-filed incidents</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-[#11243b] flex items-center justify-between text-xs font-semibold text-[#00e5ff] group-hover:text-cyan-300">
              <span className="tracking-wider uppercase font-mono">OPEN LIVE MONITOR</span>
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform" />
            </div>
          </div>

          {/* Card 2: Video Upload View */}
          <div
            onClick={() => onNavigate('video')}
            className="group cursor-pointer relative overflow-hidden rounded-2xl bg-[#080e18] border border-[#11243b] hover:border-cyan-500/50 transition-all duration-300 p-6 flex flex-col justify-between shadow-xl hover:shadow-cyan-950/30"
          >
            <div>
              <div className="inline-block px-2.5 py-1 rounded bg-[#071322] border border-[#11243b] text-[10px] font-mono font-bold text-[#00e5ff] tracking-wider mb-4">
                VIDEO UPLOAD VIEW
              </div>

              {/* Vector Graphic: Road Perspective with Cyan & Red Lines */}
              <div className="h-32 w-full rounded-xl bg-[#050b14] border border-[#11243b] mb-5 relative flex items-center justify-center overflow-hidden">
                <svg className="w-full h-full" viewBox="0 0 360 140" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="horizonDiscRed" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#240c12" />
                      <stop offset="100%" stopColor="#040711" />
                    </linearGradient>
                    <filter id="glowRed" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Horizon Elliptical Ring */}
                  <ellipse cx="180" cy="38" rx="46" ry="12" fill="url(#horizonDiscRed)" stroke="#ef4444" strokeWidth="1.2" opacity="0.8" />
                  <ellipse cx="180" cy="38" rx="20" ry="5" fill="#dc2626" fillOpacity="0.3" />

                  {/* Road Boundary Perspective Lines */}
                  <path d="M 0 140 L 145 38 L 215 38 L 360 140" fill="none" stroke="#131e33" strokeWidth="1.5" />
                  <path d="M 50 140 L 155 38" fill="none" stroke="#101d36" strokeWidth="1" />
                  <path d="M 310 140 L 205 38" fill="none" stroke="#101d36" strokeWidth="1" />

                  {/* Center Line */}
                  <line x1="180" y1="140" x2="180" y2="38" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 6" />

                  {/* Left Cyan Streaks */}
                  <line x1="120" y1="140" x2="168" y2="38" stroke="#38bdf8" strokeWidth="2.5" filter="url(#glowCyan)" />
                  <line x1="140" y1="140" x2="173" y2="38" stroke="#0ea5e9" strokeWidth="1.5" opacity="0.9" />

                  {/* Right Red Streaks */}
                  <line x1="240" y1="140" x2="192" y2="38" stroke="#ef4444" strokeWidth="2.5" filter="url(#glowRed)" />
                  <line x1="220" y1="140" x2="187" y2="38" stroke="#dc2626" strokeWidth="1.5" opacity="0.9" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                Forensic video ingestion
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Drop an MP4, WebM or MOV and the whole clip is sampled frame by frame. You get collision markers on the scrubber, keyframe clippings and a full report card you can save to the archive.
              </p>

              <ul className="space-y-2 text-xs text-slate-300 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Timestamped collision markers</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Keyframe clipping gallery</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Report card + JSON &amp; PDF export</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-[#11243b] flex items-center justify-between text-xs font-semibold text-[#00e5ff] group-hover:text-cyan-300">
              <span className="tracking-wider uppercase font-mono">OPEN VIDEO ANALYZER</span>
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform" />
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 3: HEURISTICS YOU CAN READ END TO END (Matches Reference Image 2)
         ========================================================================= */}
      <section>
        <h2 className="text-2xl font-bold text-white mb-5 tracking-tight">
          Heuristics you can read end to end
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Item 01 */}
          <div className="p-5 rounded-xl bg-[#080e18] border border-[#11243b] hover:border-cyan-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <Scan className="w-4 h-4 text-[#00e5ff]" />
                <span className="font-bold">01</span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">Luminance matrix sampling</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Extracts downsampled luminance grids across frames, measuring localized differential motion without heavy per-frame tracking overhead.
              </p>
            </div>
          </div>

          {/* Item 02 */}
          <div className="p-5 rounded-xl bg-[#080e18] border border-[#11243b] hover:border-cyan-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <GitFork className="w-4 h-4 text-[#00e5ff]" />
                <span className="font-bold">02</span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">Dual-branch kinematic flow</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Evaluates spatial trajectory deviations against an adaptive scene velocity baseline, decoupling camera jitter from acute impact spikes.
              </p>
            </div>
          </div>

          {/* Item 03 */}
          <div className="p-5 rounded-xl bg-[#080e18] border border-[#11243b] hover:border-cyan-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <Gauge className="w-4 h-4 text-[#00e5ff]" />
                <span className="font-bold">03</span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">Severity threshold trigger</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dynamic acceleration thresholds filter transient sensor noise while registering acute kinetic collisions with sub-second latency.
              </p>
            </div>
          </div>

          {/* Item 04 */}
          <div className="p-5 rounded-xl bg-[#080e18] border border-[#11243b] hover:border-cyan-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <Cpu className="w-4 h-4 text-[#00e5ff]" />
                <span className="font-bold">04</span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">Auditable forensic vault</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Captures timestamped keyframes and telemetry matrices directly into an immutable tamper-evident incident archive.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: SYSTEM TELEMETRY & MODEL STATUS ROW (Real Backend Data)
         ========================================================================= */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Model Card */}
        <div className="p-4 rounded-xl bg-[#080e18] border border-[#11243b] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Model Status</span>
            <Cpu className="w-4 h-4 text-[#00e5ff]" />
          </div>
          <div>
            <div className="text-base font-bold text-white flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  modelStatus?.loaded ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-amber-400'
                }`}
              />
              {modelStatus?.loaded ? 'Online (Loaded)' : 'Offline / Standby'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1 truncate">
              {modelStatus?.model_name || 'Custom YOLOv8 1-Channel'}
            </div>
          </div>
        </div>

        {/* Dataset Card */}
        <div className="p-4 rounded-xl bg-[#080e18] border border-[#11243b] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Dataset Modality</span>
            <Layers className="w-4 h-4 text-[#00e5ff]" />
          </div>
          <div>
            <div className="text-base font-bold text-white">FLIR Thermal 2024</div>
            <div className="text-[11px] text-[#00e5ff]/90 font-mono mt-1">
              26,061 1-Ch Frames (LWIR)
            </div>
          </div>
        </div>

        {/* Total Videos Analyzed */}
        <div className="p-4 rounded-xl bg-[#080e18] border border-[#11243b] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Videos Analyzed</span>
            <Film className="w-4 h-4 text-[#00e5ff]" />
          </div>
          <div>
            <div className="text-2xl font-black text-white font-mono">
              {stats?.total_videos_analyzed ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">Recorded sessions</div>
          </div>
        </div>

        {/* Total Frames Processed */}
        <div className="p-4 rounded-xl bg-[#080e18] border border-[#11243b] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Frames Processed</span>
            <MonitorCheck className="w-4 h-4 text-[#00e5ff]" />
          </div>
          <div>
            <div className="text-2xl font-black text-white font-mono">
              {stats?.total_frames_processed ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">Thermal frames analyzed</div>
          </div>
        </div>

        {/* Total Pedestrian Detections */}
        <div className="p-4 rounded-xl bg-[#080e18] border border-[#11243b] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Total Detections</span>
            <ShieldCheck className="w-4 h-4 text-[#00e5ff]" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#00e5ff] font-mono">
              {stats?.total_pedestrian_detections ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">Targets logged</div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: INPUT EVIDENCE FOLDERS & ORGANIZED FRAMES
         ========================================================================= */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-semibold">
              LATEST ACTIVITY
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Input Evidence Folders</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                {inputFolders.length} Folders
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Each input is organized into its own folder. Open any folder to inspect its extracted frames.
            </p>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-mono font-semibold text-[#00e5ff] hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer self-start sm:self-center"
          >
            <span>FULL DETECTION ARCHIVE</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {inputFolders.length > 0 ? (
          <div className="space-y-4">
            {/* Square Boxes Medium Icons Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {inputFolders.map((folder) => {
                const isExpanded = expandedFolderIds.has(folder.id);
                const isVideo = folder.inputType === 'video';
                const isMulti = folder.inputType === 'multiple-images';
                const hasPeds = folder.totalPedestrians > 0;

                return (
                  <div
                    key={folder.id}
                    onClick={() => toggleFolder(folder.id)}
                    className={`group aspect-square rounded-2xl bg-[#080e18] hover:bg-[#071322] border transition-all cursor-pointer p-3.5 flex flex-col items-center justify-between text-center relative overflow-hidden shadow-lg ${
                      isExpanded
                        ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-cyan-950/50 bg-[#071322]'
                        : 'border-[#11243b] hover:border-cyan-500/50 hover:shadow-cyan-950/30'
                    }`}
                  >
                    {/* Top Status & Type Badges */}
                    <div className="w-full flex items-center justify-between text-[9px] font-mono">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                        isVideo ? 'bg-blue-950/80 text-blue-300 border border-blue-500/30' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {isVideo ? 'VIDEO' : isMulti ? 'BATCH' : 'IMG'}
                      </span>

                      <div className="flex items-center gap-1">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${
                          hasPeds ? 'bg-red-950/80 text-red-400 border border-red-500/30' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {hasPeds ? `${folder.totalPedestrians} Ped` : 'Clear'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate('history', folder.id);
                          }}
                          title="Open in full Forensic Vault"
                          className="p-0.5 rounded hover:bg-cyan-950 text-slate-500 hover:text-[#00e5ff] transition-colors"
                        >
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Center: Medium Icon Box */}
                    <div className="w-20 h-16 sm:w-22 sm:h-16 rounded-xl bg-[#050b14] border border-[#11243b] group-hover:border-cyan-400/60 transition-all flex items-center justify-center relative overflow-hidden shadow-md my-auto">
                      {folder.coverImageUrl && !failedImages[folder.id] ? (
                        <>
                          <img
                            src={getMediaUrl(folder.coverImageUrl)}
                            alt={folder.name}
                            onError={() => setFailedImages((prev) => ({ ...prev, [folder.id]: true }))}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/25 pointer-events-none" />
                          {isExpanded ? (
                            <FolderOpen className="absolute bottom-1 right-1 w-3.5 h-3.5 text-[#00e5ff] drop-shadow" />
                          ) : (
                            <Folder className="absolute bottom-1 right-1 w-3.5 h-3.5 text-[#00e5ff] drop-shadow" />
                          )}
                        </>
                      ) : isExpanded ? (
                        <FolderOpen className="w-10 h-10 text-[#00e5ff] group-hover:scale-110 transition-transform" />
                      ) : (
                        <Folder className="w-10 h-10 text-[#00e5ff] group-hover:scale-110 transition-transform" />
                      )}
                    </div>

                    {/* Bottom: Name & Item Count */}
                    <div className="w-full space-y-0.5">
                      <div
                        title={folder.name}
                        className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition-colors w-full px-1"
                      >
                        {folder.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center justify-center gap-1.5">
                        <span>{folder.items.length || folder.totalItems} {isVideo ? 'frames' : 'items'}</span>
                        <span>•</span>
                        <span className="text-[#00e5ff]">{(folder.peakConfidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Extracted Frames Gallery for the currently expanded folder in Overview */}
            {Array.from(expandedFolderIds).map((expId) => {
              const folder = inputFolders.find((f) => f.id === expId);
              if (!folder || folder.items.length === 0) return null;

              return (
                <div
                  key={`expanded-${folder.id}`}
                  className="p-5 rounded-2xl bg-[#080e18] border border-cyan-500/40 space-y-4 shadow-xl animate-in fade-in duration-200"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#11243b] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#071322] border border-cyan-500/50 flex items-center justify-center text-[#00e5ff] shadow-md shadow-cyan-950/40">
                        {folder.inputType === 'video' ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center flex-wrap gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-white">
                            Extracted Evidence Frames
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                            Folder: {folder.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Frames belonging exclusively to this input folder. Click any frame to enlarge or open full folder in vault.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <button
                        onClick={() => onNavigate('history', folder.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 font-bold text-xs transition-all shadow-md cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Open in Forensic Vault</span>
                      </button>
                      <span className="px-3 py-1 rounded-lg bg-[#071322] border border-[#11243b] text-[#00e5ff] font-mono font-bold text-xs">
                        {folder.items.length} Frame{folder.items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                    {folder.items.map((item, fIdx) => (
                      <div
                        key={item.id || fIdx}
                        onClick={() =>
                          setSelectedEnlargedMedia({
                            url: item.snapshotUrl || item.annotatedUrl || item.originalUrl || '',
                            title: `${folder.name} — Frame #${item.frameNumber || fIdx + 1}`,
                            subtitle: `Detected: ${item.pedestriansCount} Pedestrian(s) • Confidence: ${((item.confidence || 0) * 100).toFixed(1)}%`,
                          })
                        }
                        className="group/frame relative rounded-xl bg-[#050b14] border border-[#11243b] hover:border-cyan-400 transition-all cursor-pointer overflow-hidden flex flex-col justify-between shadow-md"
                      >
                        <div className="relative aspect-video bg-black overflow-hidden">
                          <img
                            src={getMediaUrl(item.snapshotUrl || item.annotatedUrl || item.originalUrl)}
                            alt={`Frame #${item.frameNumber || fIdx + 1}`}
                            className="w-full h-full object-cover group-hover/frame:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-sm border border-cyan-500/40 text-[9px] font-mono font-bold text-[#00e5ff]">
                            #{item.frameNumber || fIdx + 1}
                          </div>
                          <div className="absolute top-1.5 right-1.5 p-1 rounded bg-black/80 text-slate-300 opacity-0 group-hover/frame:opacity-100 transition-opacity">
                            <Eye className="w-3 h-3 text-[#00e5ff]" />
                          </div>
                        </div>

                        <div className="p-2 space-y-0.5">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className={`font-bold ${item.pedestriansCount > 0 ? 'text-red-400' : 'text-[#10b981]'}`}>
                              {item.pedestriansCount > 0 ? `${item.pedestriansCount} Ped` : 'Clear'}
                            </span>
                            <span className="text-[#00e5ff] font-bold">
                              {((item.confidence || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-xl bg-[#080e18] border border-dashed border-[#11243b] text-center">
            <Film className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-300 mb-1">
              No detection folders recorded yet
            </div>
            <div className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              Upload a thermal video in the Video Analyzer or images in the Image Analyzer to generate input folders and extracted evidence frames.
            </div>
          </div>
        )}
      </section>

      {/* Modal for Enlarged Frame View from Overview Folder */}
      {selectedEnlargedMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSelectedEnlargedMedia(null)}
        >
          <div
            className="max-w-3xl w-full rounded-2xl bg-[#080e18] border border-[#11243b] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#11243b] flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white truncate max-w-md">
                  {selectedEnlargedMedia.title}
                </h4>
                {selectedEnlargedMedia.subtitle && (
                  <div className="text-[11px] font-mono text-[#00e5ff] mt-0.5">
                    {selectedEnlargedMedia.subtitle}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedEnlargedMedia(null)}
                className="p-1.5 rounded-lg bg-[#071322] hover:bg-[#0c1c30] text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-black flex items-center justify-center max-h-[70vh] overflow-hidden">
              <img
                src={getMediaUrl(selectedEnlargedMedia.url)}
                alt={selectedEnlargedMedia.title}
                className="max-w-full max-h-[68vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
