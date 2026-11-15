import React, { useState } from 'react';
import {
  Camera,
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
} from 'lucide-react';
import type { OverviewStats } from '../types';
import { getMediaUrl } from '../services/api';

interface OverviewProps {
  stats: OverviewStats | null;
  onNavigate: (tab: 'live' | 'video' | 'history') => void;
}

export const Overview: React.FC<OverviewProps> = ({ stats, onNavigate }) => {
  const modelStatus = stats?.model_status;
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(6); // Default to '08 Nov' (last index)

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
    <div className="space-y-12 pb-16">
      {/* =========================================================================
          HERO SECTION (Matches Reference Screenshot media_1794295062251_e663d66d.jpg)
         ========================================================================= */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
        {/* Left Column: Headlines & Actions (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Tag Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#09152b] border border-blue-500/40 text-[11px] font-mono font-semibold text-blue-400 tracking-wider shadow-sm">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            LOCAL VISION ANALYZER (HEURISTIC)
          </div>

          {/* Main Huge Title */}
          <div className="space-y-1">
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-black text-white tracking-tight leading-[1.12]">
              Every impact leaves a
            </h1>
            <div className="text-4xl sm:text-5xl lg:text-[54px] font-black text-[#38bdf8] tracking-tight leading-[1.12]">
              pixel signature.
            </div>
          </div>

          {/* Descriptive Body */}
          <p className="text-sm sm:text-[15px] text-slate-400 leading-relaxed max-w-xl font-normal">
            Sentinel Vanguard watches a live camera or any uploaded footage, samples it into luminance grids, and flags the exact second a collision breaks the scene's own motion baseline — with the confidence, severity and region written into an auditable incident log.
          </p>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              onClick={() => onNavigate('live')}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#1689ea] hover:bg-[#1a94fe] text-white font-bold text-xs tracking-wider shadow-lg shadow-sky-950/60 transition-all cursor-pointer transform hover:-translate-y-0.5"
            >
              <Camera className="w-4 h-4 text-white" />
              <span>LAUNCH LIVE CAMERA</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>

            <button
              onClick={() => onNavigate('video')}
              className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-[#0b1322] hover:bg-[#111e33] border border-slate-700/80 text-white font-semibold text-xs tracking-wide transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-300" />
              <span>Analyze a video file</span>
            </button>
          </div>

          {/* Micro Telemetry Specs Row */}
          <div className="pt-5 flex items-center gap-10 border-t border-slate-800/80">
            <div>
              <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-bold">
                SAMPLING
              </div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                25 fps live
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-bold">
                GRID
              </div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                40 × 24 cells
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-bold">
                TRIGGER
              </div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                0.3 sensitivity
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Network Telemetry Card (5 Cols) */}
        <div className="lg:col-span-5">
          <div className="p-6 rounded-3xl bg-[#080d1a] border border-[#1a253c] shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 surveillance-grid opacity-20 pointer-events-none" />

            {/* Card Header */}
            <div className="flex items-center justify-between pb-5 border-b border-slate-800/80 relative z-10">
              <div className="flex items-center gap-2 text-[#38bdf8]">
                <Radio className="w-4 h-4 animate-pulse text-[#38bdf8]" />
                <span className="text-xs font-mono font-bold tracking-wider uppercase">
                  NETWORK TELEMETRY
                </span>
              </div>
              <span className="px-3 py-0.5 rounded-full bg-[#2b0c13] border border-red-500/50 text-red-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                CRITICAL
              </span>
            </div>

            {/* 2x2 Telemetry Metric Boxes */}
            <div className="grid grid-cols-2 gap-3.5 my-5 relative z-10">
              {/* Box 1 */}
              <div className="p-4 rounded-xl bg-[#050811] border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                  INFERENCE LATENCY
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  &lt; 35 ms
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Real-time GPU/MPS stream
                </div>
              </div>

              {/* Box 2 */}
              <div className="p-4 rounded-xl bg-[#050811] border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                  DETECTION ACCURACY
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  89.2%
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Adaptive Kinematic Model
                </div>
              </div>

              {/* Box 3 */}
              <div className="p-4 rounded-xl bg-[#050811] border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                  FORENSIC CAPTURE
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  Instant
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Auto-saved tamper proof
                </div>
              </div>

              {/* Box 4 */}
              <div className="p-4 rounded-xl bg-[#050811] border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                  DISPATCH TIME
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  0.4 sec
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Acoustic &amp; Twilio alert
                </div>
              </div>
            </div>

            {/* Bottom Timeline: LAST 7 DAYS */}
            <div className="pt-4 border-t border-slate-800/80 relative z-10 space-y-2">
              <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
                LAST 7 DAYS
              </div>
              <div className="flex items-center justify-between gap-1 text-[11px] font-mono">
                {daysList.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDayIndex(i)}
                    className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      selectedDayIndex === i
                        ? 'text-[#38bdf8] font-bold bg-[#0c1d36] border border-sky-500/40 shadow-sm'
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
          SECTION 2: TWO VIEWS, ONE ENGINE (Matches Reference Screenshot media_1794295079912_a899143e.jpg)
         ========================================================================= */}
      <section className="relative pt-6 border-t border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-[11px] font-mono tracking-widest text-[#38bdf8] uppercase font-bold mb-1.5">
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
            onClick={() => onNavigate('live')}
            className="group cursor-pointer relative overflow-hidden rounded-2xl bg-[#080d19] border border-[#192338] hover:border-sky-500/50 transition-all duration-300 p-6 flex flex-col justify-between shadow-xl hover:shadow-sky-950/30"
          >
            <div>
              {/* Badge Tag */}
              <div className="inline-block px-2.5 py-1 rounded bg-[#0b1424] border border-[#1e3458] text-[10px] font-mono font-bold text-sky-400 tracking-wider mb-4">
                CAMERA VIEW
              </div>

              {/* Vector Graphic: Road Perspective with Cyan & Amber Lines */}
              <div className="h-32 w-full rounded-xl bg-[#060912] border border-[#141d30] mb-5 relative flex items-center justify-center overflow-hidden">
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

              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-sky-300 transition-colors">
                Live camera surveillance
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Connect a webcam or run a procedural scenario at 1.6 fps. Tracker brackets, a threat meter and an audio alert fire the moment the signal spikes, and the incident is filed automatically.
              </p>

              <ul className="space-y-2 text-xs text-slate-300 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span>Webcam + 4 simulator scenarios</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span>On-screen tracker &amp; threat meter</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span>Auto-filed incidents</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-sky-400 group-hover:text-sky-300">
              <span className="tracking-wider uppercase font-mono">OPEN LIVE MONITOR</span>
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform" />
            </div>
          </div>

          {/* Card 2: Video Upload View */}
          <div
            onClick={() => onNavigate('video')}
            className="group cursor-pointer relative overflow-hidden rounded-2xl bg-[#080d19] border border-[#192338] hover:border-sky-500/50 transition-all duration-300 p-6 flex flex-col justify-between shadow-xl hover:shadow-sky-950/30"
          >
            <div>
              <div className="inline-block px-2.5 py-1 rounded bg-[#0b1424] border border-[#1e3458] text-[10px] font-mono font-bold text-sky-400 tracking-wider mb-4">
                VIDEO UPLOAD VIEW
              </div>

              {/* Vector Graphic: Road Perspective with Cyan & Red Lines */}
              <div className="h-32 w-full rounded-xl bg-[#060912] border border-[#141d30] mb-5 relative flex items-center justify-center overflow-hidden">
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

              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-sky-300 transition-colors">
                Forensic video ingestion
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Drop an MP4, WebM or MOV and the whole clip is sampled frame by frame. You get collision markers on the scrubber, keyframe clippings and a full report card you can save to the archive.
              </p>

              <ul className="space-y-2 text-xs text-slate-300 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span>Timestamped collision markers</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span>Keyframe clipping gallery</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span>Report card + JSON &amp; PDF export</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-sky-400 group-hover:text-sky-300">
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
          <div className="p-5 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <Scan className="w-4 h-4 text-sky-400" />
                <span className="font-bold">01</span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">Luminance matrix sampling</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Extracts downsampled luminance grids across frames, measuring localized differential motion without heavy per-frame tracking overhead.
              </p>
            </div>
          </div>

          {/* Item 02 */}
          <div className="p-5 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <GitFork className="w-4 h-4 text-sky-400" />
                <span className="font-bold">02</span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">Dual-branch kinematic flow</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Evaluates spatial trajectory deviations against an adaptive scene velocity baseline, decoupling camera jitter from acute impact spikes.
              </p>
            </div>
          </div>

          {/* Item 03 */}
          <div className="p-5 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <Gauge className="w-4 h-4 text-sky-400" />
                <span className="font-bold">03</span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">Severity threshold trigger</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dynamic acceleration thresholds filter transient sensor noise while registering acute kinetic collisions with sub-second latency.
              </p>
            </div>
          </div>

          {/* Item 04 */}
          <div className="p-5 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-xs mb-3">
                <Cpu className="w-4 h-4 text-sky-400" />
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
        <div className="p-4 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Model Status</span>
            <Cpu className="w-4 h-4 text-sky-400" />
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
        <div className="p-4 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Dataset Modality</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="text-base font-bold text-white">FLIR Thermal 2024</div>
            <div className="text-[11px] text-sky-400/90 font-mono mt-1">
              26,061 1-Ch Frames (LWIR)
            </div>
          </div>
        </div>

        {/* Total Videos Analyzed */}
        <div className="p-4 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Videos Analyzed</span>
            <Film className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white font-mono">
              {stats?.total_videos_analyzed ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">Recorded sessions</div>
          </div>
        </div>

        {/* Total Frames Processed */}
        <div className="p-4 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Frames Processed</span>
            <MonitorCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white font-mono">
              {stats?.total_frames_processed ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">Thermal frames analyzed</div>
          </div>
        </div>

        {/* Total Pedestrian Detections */}
        <div className="p-4 rounded-xl bg-[#080d19] border border-[#192338] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Total Detections</span>
            <ShieldCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-sky-400 font-mono">
              {stats?.total_pedestrian_detections ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">Targets logged</div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: RECENT DETECTIONS LIST
         ========================================================================= */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-semibold">
              LATEST ACTIVITY
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Recent detections</h2>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-mono font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>FULL DETECTION ARCHIVE</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {stats?.recent_sessions && stats.recent_sessions.length > 0 ? (
          <div className="space-y-2.5">
            {stats.recent_sessions.map((sess, idx) => (
              <div
                key={sess.job_id || idx}
                onClick={() => onNavigate('history')}
                className="group cursor-pointer p-3 sm:p-4 rounded-xl bg-[#080d19] hover:bg-[#0d1526] border border-[#192338] hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 h-10 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {sess.snapshot_url ? (
                      <img
                        src={getMediaUrl(sess.snapshot_url)}
                        alt="Detection preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white group-hover:text-sky-300 transition-colors">
                      {sess.filename}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {sess.total_frames} frames processed • {sess.timestamp}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-950/40 border border-red-500/40 text-red-400 text-xs font-bold font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    {(sess.unique_pedestrians ?? sess.pedestrian_detections) > 0
                      ? `${sess.unique_pedestrians ?? sess.pedestrian_detections} UNIQUE PEDESTRIANS`
                      : 'CLEAR PATH'}
                  </div>
                  <div className="text-xs font-mono font-bold text-white">
                    {(sess.peak_confidence * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500 font-mono hidden sm:inline">Just now</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-xl bg-[#080d19] border border-dashed border-slate-800 text-center">
            <Film className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-300 mb-1">
              No detection sessions recorded yet
            </div>
            <div className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              Upload a thermal video in the Video Analyzer or start a stream in the Live Monitor to begin detecting and logging incidents.
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
