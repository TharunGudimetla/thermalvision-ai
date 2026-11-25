import React, { useState, useMemo } from 'react';
import {
  Image as ImageIcon,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Play,
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
  Eye,
  X,
} from 'lucide-react';
import type { OverviewStats, DetectionEvent, HistoryFolder, HistoryFolderItem } from '../types';
import { getMediaUrl } from '../services/api';
import thermalImagePreview from '../assets/thermal-image-preview.jpg';
import thermalVideoPreview from '../assets/thermal-video-preview.jpg';

interface OverviewProps {
  stats: OverviewStats | null;
  events?: DetectionEvent[];
  onNavigate: (tab: 'overview' | 'image' | 'video' | 'history', folderId?: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({ stats, events, onNavigate }) => {
  const modelStatus = stats?.model_status;
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(6); // Default to today (last index)
  const [folderNav, setFolderNav] = useState<{
    category: 'videos' | 'images' | null;
    selectedFolderId: string | null;
  }>({
    category: null,
    selectedFolderId: null,
  });
  const [selectedEnlargedMedia, setSelectedEnlargedMedia] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const normalizeFileKey = (name: string) => name.toLowerCase().replace(/[\s_\-]+/g, ' ').trim();

  // 1. Load LocalStorage Image Folders (for session fallback)
  const localImageFolders = useMemo<HistoryFolder[]>(() => {
    try {
      const raw = localStorage.getItem('thermal_image_folders');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  // 2. Build Video Folders: Strictly one folder per uploaded video
  const videoFolders = useMemo<HistoryFolder[]>(() => {
    const sortedEventsDesc = [...(events || [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const videoGroups: { [normKey: string]: { latestJobId: string; displayFilename: string; events: DetectionEvent[] } } = {};

    sortedEventsDesc.forEach((ev) => {
      const isVideo =
        Boolean(ev.job_id && !ev.job_id.startsWith('img_')) ||
        Boolean(ev.processed_video_url && ev.processed_video_url.endsWith('.mp4')) ||
        /\.(mp4|avi|mov|mkv|webm|flv|wmv|ts|3gp|m4v)$/i.test(ev.filename);

      if (isVideo) {
        const normKey = normalizeFileKey(ev.filename);
        if (!videoGroups[normKey]) {
          videoGroups[normKey] = {
            latestJobId: ev.job_id || normKey,
            displayFilename: ev.filename,
            events: [ev],
          };
        } else if (ev.job_id && ev.job_id === videoGroups[normKey].latestJobId) {
          videoGroups[normKey].events.push(ev);
        }
      }
    });

    const list: HistoryFolder[] = Object.values(videoGroups).map((groupData) => {
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
    });

    // Fallback to stats.recent_sessions if needed
    if (list.length === 0 && stats?.recent_sessions) {
      const seenFilenames = new Set<string>();
      stats.recent_sessions.forEach((sess) => {
        const norm = normalizeFileKey(sess.filename);
        if (!seenFilenames.has(norm)) {
          seenFilenames.add(norm);
          list.push({
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

    return list;
  }, [events, stats?.recent_sessions]);

  // 3. Build Image Folders: Strictly one folder per uploaded image
  const imageFolders = useMemo<HistoryFolder[]>(() => {
    const imgGroups: { [normKey: string]: HistoryFolder } = {};

    // First load from persistent backend events
    (events || []).forEach((ev) => {
      const isVideo =
        Boolean(ev.job_id && !ev.job_id.startsWith('img_')) ||
        Boolean(ev.processed_video_url && ev.processed_video_url.endsWith('.mp4')) ||
        /\.(mp4|avi|mov|mkv|webm|flv|wmv|ts|3gp|m4v)$/i.test(ev.filename);

      if (!isVideo) {
        const normKey = normalizeFileKey(ev.filename);
        if (!imgGroups[normKey]) {
          const origUrl = ev.processed_video_url || ev.snapshot_url;
          const annotUrl = ev.snapshot_url;
          imgGroups[normKey] = {
            id: `image-folder-${ev.id}`,
            name: ev.filename,
            inputType: 'single-image',
            timestamp: ev.timestamp,
            totalItems: 2,
            totalPedestrians: ev.pedestrians_count || 0,
            peakConfidence: ev.confidence || 0,
            originalVideoUrl: origUrl,
            processedVideoUrl: annotUrl,
            coverImageUrl: annotUrl,
            items: [
              {
                id: `${ev.id}-orig`,
                filename: `Original — ${ev.filename}`,
                originalUrl: origUrl,
                snapshotUrl: origUrl,
                pedestriansCount: ev.pedestrians_count || 0,
                confidence: ev.confidence || 0,
                timestamp: ev.timestamp,
              },
              {
                id: `${ev.id}-annot`,
                filename: `Detection Result — ${ev.filename}`,
                annotatedUrl: annotUrl,
                snapshotUrl: annotUrl,
                pedestriansCount: ev.pedestrians_count || 0,
                confidence: ev.confidence || 0,
                timestamp: ev.timestamp,
              },
            ],
          };
        }
      }
    });

    // Merge any localStorage image folders if present
    localImageFolders.forEach((f) => {
      const normKey = normalizeFileKey(f.name);
      if (!imgGroups[normKey]) {
        imgGroups[normKey] = f;
      }
    });

    return Object.values(imgGroups).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [events, localImageFolders]);

  // Combined inputFolders
  const inputFolders = useMemo<HistoryFolder[]>(() => {
    return [...videoFolders, ...imageFolders];
  }, [videoFolders, imageFolders]);

  const currentCategoryFolders = folderNav.category === 'videos' ? videoFolders : imageFolders;
  const activeFolder = currentCategoryFolders.find((f) => f.id === folderNav.selectedFolderId) || null;

  // Dynamically generate the rolling 7-day timeline ending today
  const daysList = useMemo(() => {
    const list: {
      label: string;
      dateKey: string;
      fullDate: string;
      isToday: boolean;
      isYesterday: boolean;
      count: number;
    }[] = [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const countsByDate: Record<string, number> = {};

    const registerDate = (rawTs: string | undefined | null) => {
      if (!rawTs) return;
      const d = new Date(rawTs);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      countsByDate[key] = (countsByDate[key] || 0) + 1;
    };

    (events || []).forEach((ev) => registerDate(ev.timestamp));
    (stats?.recent_sessions || []).forEach((s) => registerDate(s.timestamp));
    (localImageFolders || []).forEach((f) => registerDate(f.timestamp));

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayNum = String(d.getDate()).padStart(2, '0');
      const monthStr = d.toLocaleString('en-US', { month: 'short' });
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${dayNum}`;

      list.push({
        label: `${dayNum} ${monthStr}`,
        dateKey: key,
        fullDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        isToday: i === 0,
        isYesterday: i === 1,
        count: countsByDate[key] || 0,
      });
    }

    return list;
  }, [events, stats?.recent_sessions, localImageFolders]);

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

            {/* Bottom Timeline: DETECTION ACTIVITY / LAST 7 DAYS */}
            <div className="pt-4 border-t border-[#11243b] relative z-10 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono tracking-wider font-semibold">
                <span className="text-slate-400 uppercase">DETECTION ACTIVITY</span>
                <span className="text-slate-500 uppercase">
                  {daysList[selectedDayIndex]?.isToday
                    ? 'TODAY'
                    : daysList[selectedDayIndex]?.isYesterday
                    ? 'YESTERDAY'
                    : 'LAST 7 DAYS'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[11px] font-mono">
                {daysList.map((dayItem, i) => (
                  <button
                    key={dayItem.label}
                    onClick={() => setSelectedDayIndex(i)}
                    title={`${dayItem.fullDate}${dayItem.count > 0 ? ` (${dayItem.count} detections)` : ''}`}
                    className={`relative px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                      selectedDayIndex === i
                        ? 'text-[#00e5ff] font-bold bg-[#071322] border border-cyan-500/40 shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <span>{dayItem.label}</span>
                    {dayItem.count > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono pt-0.5">
                <span className="text-slate-500">
                  {daysList[selectedDayIndex]?.isToday
                    ? 'Today'
                    : daysList[selectedDayIndex]?.isYesterday
                    ? 'Yesterday'
                    : daysList[selectedDayIndex]?.fullDate}
                </span>
                <span className={daysList[selectedDayIndex]?.count ? 'text-[#00e5ff] font-bold' : 'text-slate-500'}>
                  {daysList[selectedDayIndex]?.count
                    ? `${daysList[selectedDayIndex]?.count} detection${daysList[selectedDayIndex]?.count > 1 ? 's' : ''} logged`
                    : 'No detections logged'}
                </span>
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

              {/* Thermal Image Preview */}
              <div className="h-44 sm:h-48 w-full rounded-xl bg-[#050b14] border border-[#11243b] mb-5 relative flex items-center justify-center overflow-hidden">
                <img
                  src={thermalImagePreview}
                  alt="Thermal Image Analysis Preview"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                Thermal Image Analysis
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Upload a thermal or infrared image to identify pedestrians using the custom-trained YOLOv8 model. View detected objects with bounding boxes and confidence scores.
              </p>

              <ul className="space-y-2 text-xs text-slate-300 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>AI-powered pedestrian detection</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Bounding box visualization</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Detection confidence scores</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Processed image results</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-[#11243b] flex items-center justify-between text-xs font-semibold text-[#00e5ff] group-hover:text-cyan-300">
              <span className="tracking-wider uppercase font-mono">OPEN IMAGE ANALYZER</span>
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

              {/* Thermal Video Preview */}
              <div className="h-44 sm:h-48 w-full rounded-xl bg-[#050b14] border border-[#11243b] mb-5 relative flex items-center justify-center overflow-hidden">
                <img
                  src={thermalVideoPreview}
                  alt="Thermal Video Analysis Preview"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                Thermal Video Analysis
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Upload a thermal or infrared video and process it frame by frame using YOLOv8 and ByteTrack. Detect pedestrians, track their movement, and generate an annotated video with tracking IDs and pedestrian statistics.
              </p>

              <ul className="space-y-2 text-xs text-slate-300 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Frame-by-frame pedestrian detection</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Automatic pedestrian tracking IDs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Annotated video with bounding boxes</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#00e5ff] flex-shrink-0" />
                  <span>Unique pedestrian count and detection results</span>
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
          SECTION 3: THERMAL DETECTION PIPELINE
         ========================================================================= */}
      <section>
        <h2 className="text-2xl font-bold text-white mb-5 tracking-tight">
          Thermal Detection Pipeline
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Item 01 */}
          <div className="p-5 rounded-xl bg-[#080e18] border border-[#11243b] hover:border-cyan-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <Scan className="w-4 h-4 text-[#00e5ff]" />
                <span className="font-bold">01</span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">Thermal Image Preprocessing</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Convert thermal and infrared images into grayscale input suitable for the custom-trained YOLOv8 model.
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
              <h3 className="font-bold text-white text-sm mb-1.5">YOLOv8 Pedestrian Detection</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Identify pedestrians in thermal frames and generate bounding boxes with confidence scores.
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
              <h3 className="font-bold text-white text-sm mb-1.5">ByteTrack Object Tracking</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Associate pedestrian detections across video frames and assign tracking IDs to follow their movement.
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
              <h3 className="font-bold text-white text-sm mb-1.5">Detection Results &amp; Analytics</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Generate annotated images and videos with pedestrian tracking IDs, detection details, and unique pedestrian counts.
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
              best.pt
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
            <div className="text-[11px] text-slate-400 font-mono mt-1">Pedestrian detections</div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: EVIDENCE FOLDERS (Simple 2-Category Organization)
         ========================================================================= */}
      <section className="space-y-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-semibold">
              ORGANIZED FILE SYSTEM
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Evidence Folders</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                {inputFolders.length} Folders
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Persistent folder-based storage for videos and images with isolated frame sequences.
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

        {/* 1. INITIAL VIEW: Exactly Two Main Options (Videos and Images) */}
        {!folderNav.category && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
            {/* Option 1: Videos */}
            <div
              onClick={() => setFolderNav({ category: 'videos', selectedFolderId: null })}
              className="group cursor-pointer rounded-2xl bg-[#080e18] hover:bg-[#071322] border border-[#11243b] hover:border-cyan-500/50 transition-all duration-300 p-6 flex flex-col justify-between shadow-xl hover:shadow-cyan-950/30 relative overflow-hidden"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-[#050b14] border border-[#11243b] group-hover:border-cyan-500/50 flex items-center justify-center text-[#00e5ff] shadow-md transition-colors">
                    <Film className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-500/30">
                    {videoFolders.length} Video Folder{videoFolders.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-2">
                    <Folder className="w-5 h-5 text-[#00e5ff]" />
                    <span>Videos</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mt-2">
                    Open the video folder view. Every uploaded video has its own folder containing the recorded video file and its corresponding extracted frames.
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-[#11243b] mt-6 flex items-center justify-between text-xs font-semibold text-[#00e5ff] group-hover:text-cyan-300 font-mono">
                <span>OPEN VIDEOS FOLDER VIEW</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform" />
              </div>
            </div>

            {/* Option 2: Images */}
            <div
              onClick={() => setFolderNav({ category: 'images', selectedFolderId: null })}
              className="group cursor-pointer rounded-2xl bg-[#080e18] hover:bg-[#071322] border border-[#11243b] hover:border-cyan-500/50 transition-all duration-300 p-6 flex flex-col justify-between shadow-xl hover:shadow-cyan-950/30 relative overflow-hidden"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-[#050b14] border border-[#11243b] group-hover:border-cyan-500/50 flex items-center justify-center text-[#00e5ff] shadow-md transition-colors">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                    {imageFolders.length} Image Folder{imageFolders.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-2">
                    <Folder className="w-5 h-5 text-[#00e5ff]" />
                    <span>Images</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mt-2">
                    Open the image folder view. Every uploaded image has its own folder containing the original thermal image and its processed YOLOv8 detection result.
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-[#11243b] mt-6 flex items-center justify-between text-xs font-semibold text-[#00e5ff] group-hover:text-cyan-300 font-mono">
                <span>OPEN IMAGES FOLDER VIEW</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform" />
              </div>
            </div>
          </div>
        )}

        {/* 2. CATEGORY FOLDERS LIST: Shows folders inside the chosen category */}
        {folderNav.category && !folderNav.selectedFolderId && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Breadcrumb Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#080e18] border border-[#11243b]">
              <div className="flex items-center gap-2 text-xs font-mono">
                <button
                  onClick={() => setFolderNav({ category: null, selectedFolderId: null })}
                  className="text-slate-400 hover:text-[#00e5ff] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Evidence Folders</span>
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-[#00e5ff] font-bold uppercase">
                  {folderNav.category === 'videos' ? 'Videos' : 'Images'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981] ml-1.5">
                  {currentCategoryFolders.length} Folders
                </span>
              </div>

              <button
                onClick={() => setFolderNav({ category: null, selectedFolderId: null })}
                className="text-xs font-mono text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors self-start sm:self-center"
              >
                <span>Back to Categories</span>
              </button>
            </div>

            {/* Folders Grid */}
            {currentCategoryFolders.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {currentCategoryFolders.map((folder) => {
                  const isVideo = folderNav.category === 'videos';
                  const hasPeds = folder.totalPedestrians > 0;

                  return (
                    <div
                      key={folder.id}
                      onClick={() => setFolderNav({ category: folderNav.category, selectedFolderId: folder.id })}
                      className="group aspect-square rounded-2xl bg-[#080e18] hover:bg-[#071322] border border-[#11243b] hover:border-cyan-500/50 hover:shadow-cyan-950/30 transition-all cursor-pointer p-3.5 flex flex-col items-center justify-between text-center relative overflow-hidden shadow-lg"
                    >
                      {/* Top Badges */}
                      <div className="w-full flex items-center justify-between text-[9px] font-mono">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${
                          isVideo ? 'bg-blue-950/80 text-blue-300 border border-blue-500/30' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {isVideo ? 'VIDEO' : 'IMAGE'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded font-bold ${
                          hasPeds ? 'bg-red-950/80 text-red-400 border border-red-500/30' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {hasPeds ? `${folder.totalPedestrians} Ped` : 'Clear'}
                        </span>
                      </div>

                      {/* Center Thumbnail */}
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
                            <Folder className="absolute bottom-1 right-1 w-3.5 h-3.5 text-[#00e5ff] drop-shadow" />
                          </>
                        ) : (
                          <Folder className="w-10 h-10 text-[#00e5ff] group-hover:scale-110 transition-transform" />
                        )}
                      </div>

                      {/* Bottom Info */}
                      <div className="w-full space-y-0.5">
                        <div
                          title={folder.name}
                          className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition-colors w-full px-1"
                        >
                          {folder.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-center gap-1.5">
                          <span>{isVideo ? `${folder.items.length || folder.totalItems} frames` : '2 files'}</span>
                          <span>•</span>
                          <span className="text-[#00e5ff]">{(folder.peakConfidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-[#080e18] border border-dashed border-[#11243b] text-center">
                <Folder className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-300 mb-1">
                  No {folderNav.category === 'videos' ? 'video' : 'image'} folders recorded yet
                </div>
                <div className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                  {folderNav.category === 'videos'
                    ? 'Upload a thermal video in the Video Analyzer to automatically create a dedicated folder.'
                    : 'Upload a thermal image in the Image Analyzer to automatically create a dedicated folder.'}
                </div>
                <button
                  onClick={() => onNavigate(folderNav.category === 'videos' ? 'video' : 'image')}
                  className="px-4 py-2 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 font-bold text-xs tracking-wider transition-all cursor-pointer"
                >
                  {folderNav.category === 'videos' ? 'Launch Video Analyzer' : 'Launch Image Analyzer'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. OPEN FOLDER VIEW: Displays the files inside the opened folder */}
        {folderNav.category && activeFolder && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Breadcrumb Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#080e18] border border-cyan-500/40 shadow-xl">
              <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
                <button
                  onClick={() => setFolderNav({ category: null, selectedFolderId: null })}
                  className="text-slate-400 hover:text-[#00e5ff] cursor-pointer transition-colors"
                >
                  Evidence Folders
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <button
                  onClick={() => setFolderNav({ category: folderNav.category, selectedFolderId: null })}
                  className="text-slate-400 hover:text-[#00e5ff] cursor-pointer transition-colors uppercase"
                >
                  {folderNav.category === 'videos' ? 'Videos' : 'Images'}
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-[#00e5ff] font-bold truncate max-w-xs sm:max-w-md">
                  {activeFolder.name}
                </span>
              </div>

              <button
                onClick={() => setFolderNav({ category: folderNav.category, selectedFolderId: null })}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition-colors self-start sm:self-center"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to {folderNav.category === 'videos' ? 'Videos' : 'Images'}</span>
              </button>
            </div>

            {/* Video Folder Content: Video File + Isolated Extracted Frames */}
            {folderNav.category === 'videos' && (
              <div className="space-y-6">
                {/* 1. Video File Player Card */}
                <div className="p-5 rounded-2xl bg-[#080e18] border border-[#11243b] space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#11243b] pb-3">
                    <div className="flex items-center gap-2.5">
                      <Film className="w-5 h-5 text-[#00e5ff]" />
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-white">
                          Video File: {activeFolder.name}
                        </h4>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Session: {activeFolder.jobId || 'Recorded'} • Peak Confidence: {((activeFolder.peakConfidence || 0) * 100).toFixed(1)}% • Pedestrians: {activeFolder.totalPedestrians}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigate('video')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#071322] hover:bg-[#0c1c30] border border-[#11243b] hover:border-cyan-500/40 text-[#00e5ff] font-mono font-bold text-xs transition-all cursor-pointer self-start sm:self-center"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Open in Video Analyzer</span>
                    </button>
                  </div>

                  {/* HTML5 Video Player */}
                  {(activeFolder.processedVideoUrl || activeFolder.originalVideoUrl) && (
                    <div className="w-full rounded-xl bg-black overflow-hidden border border-[#11243b] max-h-[380px] flex items-center justify-center">
                      <video
                        controls
                        playsInline
                        src={getMediaUrl(activeFolder.processedVideoUrl || activeFolder.originalVideoUrl)}
                        className="w-full max-h-[380px] object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* 2. Extracted Frames Section */}
                <div className="p-5 rounded-2xl bg-[#080e18] border border-[#11243b] space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-[#11243b] pb-3">
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                        <span>Extracted Evidence Frames</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                          {activeFolder.items.length} Frames
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Frames belonging strictly to {activeFolder.name}. Kept separate from other videos. Click any frame to enlarge.
                      </p>
                    </div>
                  </div>

                  {activeFolder.items.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                      {activeFolder.items.map((item, fIdx) => (
                        <div
                          key={item.id || fIdx}
                          onClick={() =>
                            setSelectedEnlargedMedia({
                              url: item.snapshotUrl || item.annotatedUrl || item.originalUrl || '',
                              title: `${activeFolder.name} — Frame #${item.frameNumber || fIdx + 1}`,
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
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-500 font-mono">
                      No extracted frames found for this video.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Image Folder Content: Original Image + Processed Detection Result */}
            {folderNav.category === 'images' && (
              <div className="p-5 rounded-2xl bg-[#080e18] border border-[#11243b] space-y-5 shadow-xl">
                <div className="border-b border-[#11243b] pb-3">
                  <h4 className="text-sm sm:text-base font-bold text-white">
                    Image Folder: {activeFolder.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Original thermal image input and corresponding processed detection result.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* File 1: Original Image */}
                  <div
                    onClick={() =>
                      setSelectedEnlargedMedia({
                        url: activeFolder.originalVideoUrl || activeFolder.items[0]?.originalUrl || activeFolder.items[0]?.snapshotUrl || activeFolder.coverImageUrl || '',
                        title: `Original Image — ${activeFolder.name}`,
                        subtitle: 'Raw thermal input frame',
                      })
                    }
                    className="p-4 rounded-xl bg-[#050b14] border border-[#11243b] hover:border-cyan-400 transition-all cursor-pointer space-y-3 group shadow-md"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-slate-300">1. Original Image</span>
                      <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-500/30 text-[10px]">
                        RAW INPUT
                      </span>
                    </div>

                    <div className="aspect-video w-full rounded-lg bg-black overflow-hidden relative flex items-center justify-center">
                      <img
                        src={getMediaUrl(activeFolder.originalVideoUrl || activeFolder.items[0]?.originalUrl || activeFolder.items[0]?.snapshotUrl || activeFolder.coverImageUrl)}
                        alt={`Original — ${activeFolder.name}`}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-4 h-4 text-[#00e5ff]" />
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1">
                      <span className="truncate max-w-[200px]">{activeFolder.name}</span>
                      <span className="text-[#00e5ff] font-semibold">Click to enlarge</span>
                    </div>
                  </div>

                  {/* File 2: Processed Detection Result */}
                  <div
                    onClick={() =>
                      setSelectedEnlargedMedia({
                        url: activeFolder.processedVideoUrl || activeFolder.items[1]?.annotatedUrl || activeFolder.items[1]?.snapshotUrl || activeFolder.coverImageUrl || '',
                        title: `Detection Result — ${activeFolder.name}`,
                        subtitle: `${activeFolder.totalPedestrians} Pedestrian(s) Detected • Confidence: ${((activeFolder.peakConfidence || 0) * 100).toFixed(1)}%`,
                      })
                    }
                    className="p-4 rounded-xl bg-[#050b14] border border-[#11243b] hover:border-cyan-400 transition-all cursor-pointer space-y-3 group shadow-md"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-slate-300">2. Processed Detection Result</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 text-[10px]">
                        ANNOTATED RESULT
                      </span>
                    </div>

                    <div className="aspect-video w-full rounded-lg bg-black overflow-hidden relative flex items-center justify-center">
                      <img
                        src={getMediaUrl(activeFolder.processedVideoUrl || activeFolder.items[1]?.annotatedUrl || activeFolder.items[1]?.snapshotUrl || activeFolder.coverImageUrl)}
                        alt={`Detection Result — ${activeFolder.name}`}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-4 h-4 text-[#00e5ff]" />
                      </div>
                    </div>

                    <div className="text-[11px] font-mono flex items-center justify-between pt-1">
                      <span className={activeFolder.totalPedestrians > 0 ? 'text-red-400 font-bold' : 'text-[#10b981] font-bold'}>
                        {activeFolder.totalPedestrians > 0 ? `${activeFolder.totalPedestrians} Pedestrian(s) Detected` : 'No Pedestrians Detected'}
                      </span>
                      <span className="text-[#00e5ff] font-bold">
                        {((activeFolder.peakConfidence || 0) * 100).toFixed(0)}% Conf
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
