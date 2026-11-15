import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Film,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Trash2,
  FileText,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  Activity,
  Sliders,
} from 'lucide-react';
import { startVideoDetection, fetchVideoJobStatus, getMediaUrl } from '../services/api';
import type { VideoJobProgress } from '../types';

export const VideoAnalyzer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confThreshold, setConfThreshold] = useState<number>(0.25);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<VideoJobProgress | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Playback state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [currentFrameNum, setCurrentFrameNum] = useState<number>(0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Current pedestrians in the active playback frame
  const currentPedestriansInFrame = jobProgress?.frame_pedestrian_counts && jobProgress.frame_pedestrian_counts.length > 0
    ? (jobProgress.frame_pedestrian_counts[Math.min(Math.max(0, currentFrameNum - 1), jobProgress.frame_pedestrian_counts.length - 1)] ?? 0)
    : (jobProgress?.current_pedestrians ?? 0);

  // Poll video processing status
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (jobId && jobProgress?.status !== 'completed' && jobProgress?.status !== 'failed') {
      interval = setInterval(async () => {
        try {
          const status = await fetchVideoJobStatus(jobId);
          setJobProgress(status);

          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(interval);
          }
        } catch (err) {
          console.error('Polling job status failed:', err);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, jobProgress?.status]);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setJobId(null);
      setJobProgress(null);
      setErrorMsg(null);
    }
  };

  // Drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setJobId(null);
      setJobProgress(null);
      setErrorMsg(null);
    }
  };

  // Start Analysis
  const handleStartAnalysis = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setErrorMsg(null);
      const res = await startVideoDetection(selectedFile, confThreshold);
      setJobId(res.job_id);
      setIsUploading(false);
    } catch (err: unknown) {
      setIsUploading(false);
      setErrorMsg((err as Error).message || 'Failed to start video processing');
    }
  };

  // Reset & Upload another video
  const handleResetVideo = () => {
    setSelectedFile(null);
    setJobId(null);
    setJobProgress(null);
    setErrorMsg(null);
    setIsPlaying(false);
  };

  // Video playback controls
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleReplay = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play();
    setIsPlaying(true);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTimeSec(time);
    const fps = jobProgress?.fps || 25;
    setCurrentFrameNum(Math.round(time * fps));
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setVideoDuration(videoRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTimeSec(time);
  };

  // Export JSON dossier
  const handleExportReport = () => {
    if (!jobProgress) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(jobProgress, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${jobProgress.filename}_detection_dossier.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner when a video is loaded / analyzing / completed */}
      {selectedFile && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0a0d16] border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <span className="font-bold text-sm text-white">{selectedFile.name}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    jobProgress?.status === 'completed'
                      ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
                      : jobProgress?.status === 'processing'
                      ? 'bg-cyan-950 border border-cyan-500/40 text-cyan-300 animate-pulse'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {jobProgress?.status?.toUpperCase() || 'LOADED'}
                </span>

                {jobProgress?.status === 'completed' && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-950/90 border border-cyan-500/50 text-cyan-300 flex items-center gap-1.5 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    TOTAL UNIQUE PEDESTRIANS: {jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {jobProgress ? (
                  <>
                    {jobProgress.fps || 25.0} FPS • {jobProgress.resolution || '640x480'} • Thermal Video Stream
                  </>
                ) : (
                  <>Ready for 1-channel thermal analysis • {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={handleResetVideo}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-red-950/40 border border-slate-800 hover:border-red-500/40 text-slate-300 hover:text-red-300 text-xs font-medium transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Video & Upload Another
            </button>

            {jobProgress?.status === 'completed' && (
              <>
                <button
                  onClick={handleExportReport}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  Export Report (JSON)
                </button>

                {jobProgress.processed_video_url && (
                  <a
                    href={getMediaUrl(jobProgress.processed_video_url)}
                    download={`processed_${selectedFile.name}`}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold transition-colors shadow-lg shadow-cyan-950/40 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Video
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Container */}
      {!selectedFile ? (
        /* Video Upload Dropzone */
        <div className="max-w-3xl mx-auto py-10">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="p-12 rounded-3xl bg-[#090d16] border-2 border-dashed border-slate-800 hover:border-cyan-500/60 transition-all text-center flex flex-col items-center justify-center relative overflow-hidden group shadow-2xl"
          >
            <div className="absolute inset-0 surveillance-grid opacity-20 pointer-events-none" />

            <div className="w-20 h-20 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-105 transition-transform shadow-lg shadow-cyan-950/30">
              <Upload className="w-10 h-10" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Ingest Thermal Surveillance Footage
            </h2>
            <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
              Upload MP4, AVI or MOV thermal video files. The backend feeds every frame through your genuine 1-channel YOLOv8 model for pedestrian detection.
            </p>

            <label className="cursor-pointer px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-cyan-950/40 mb-4 inline-flex items-center gap-2">
              <Film className="w-4 h-4" />
              Select Video from Computer
              <input
                type="file"
                accept="video/*,.mp4,.avi,.mov,.mkv,.webm,video/mp4,video/avi,video/quicktime,video/x-msvideo"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <div className="text-[11px] text-slate-500 font-mono">
              Supported Formats: MP4, AVI, MOV • Model: YOLOv8 1-Channel Pedestrian Only
            </div>
          </div>
        </div>
      ) : jobProgress?.status === 'processing' || isUploading ? (
        /* Progress Screen */
        <div className="max-w-2xl mx-auto p-8 rounded-3xl bg-[#090d16] border border-slate-800 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-center mx-auto text-cyan-400 animate-pulse">
            <Activity className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white mb-1">
              Processing Thermal Video Frame-by-Frame
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Converting frames to 1-channel grayscale matrices & running YOLOv8 inference...
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">
                Frame: {jobProgress?.current_frame || 0} / {jobProgress?.total_frames || '...'}
              </span>
              <span className="text-cyan-400 font-bold">
                {jobProgress?.progress_percent ? jobProgress.progress_percent.toFixed(1) : 0}%
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300 shadow-lg shadow-cyan-500/50"
                style={{ width: `${jobProgress?.progress_percent || 5}%` }}
              />
            </div>
          </div>

          {/* Live detection counter during processing */}
          <div className="p-4 rounded-xl bg-[#06080e] border border-slate-800 flex items-center justify-around text-xs font-mono">
            <div>
              <div className="text-slate-500">Current Pedestrians</div>
              <div className="text-xl font-black text-amber-400">
                {jobProgress?.current_pedestrians ?? 0}
              </div>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div>
              <div className="text-slate-500">Total Unique Pedestrians</div>
              <div className="text-xl font-black text-cyan-400">
                {jobProgress?.unique_pedestrians_count ?? 0}
              </div>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div>
              <div className="text-slate-500">Peak Confidence</div>
              <div className="text-xl font-black text-white">
                {jobProgress?.peak_confidence ? (jobProgress.peak_confidence * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Video Player & Surveillance Telemetry Split View (Matches Screenshot 6) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Video Player Feed (2 Cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative aspect-video rounded-2xl bg-[#06080e] border border-slate-800 overflow-hidden shadow-2xl flex items-center justify-center">
              <div className="absolute inset-0 surveillance-grid opacity-30 pointer-events-none" />

              {/* Native Video Element */}
              {jobProgress?.processed_video_url ? (
                <video
                  ref={videoRef}
                  key={jobProgress.processed_video_url}
                  className="w-full h-full object-contain cursor-pointer"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onClick={togglePlayPause}
                  muted={isMuted}
                  playsInline
                  preload="auto"
                  controls
                >
                  <source src={getMediaUrl(jobProgress.processed_video_url)} type="video/mp4" />
                  Your browser does not support HTML5 video playback.
                </video>
              ) : (
                <div className="text-center p-6 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                    <Film className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white mb-1">
                      Ready to Analyze: {selectedFile.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      Configure minimum confidence and click "Start Analysis" below.
                    </div>
                  </div>

                  {/* Confidence Slider before analysis */}
                  <div className="max-w-xs mx-auto text-left pt-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="flex items-center gap-1 font-mono">
                        <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                        Min Confidence Threshold:
                      </span>
                      <span className="font-mono text-cyan-400 font-bold">
                        {(confThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.80"
                      step="0.05"
                      value={confThreshold}
                      onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={handleStartAnalysis}
                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-950/40 cursor-pointer"
                  >
                    Start 1-Channel Analysis
                  </button>
                </div>
              )}

              {/* Overlay HUD Tags */}
              {jobProgress?.status === 'completed' && (
                <>
                  <div className="absolute top-4 left-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 pointer-events-none">
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-red-500/50 text-xs font-mono font-bold text-red-400 shadow-xl">
                      <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                      TOTAL UNIQUE PEDESTRIANS: {jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-amber-500/40 text-xs font-mono font-bold text-amber-300 shadow-xl">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      CURRENT IN FRAME: {currentPedestriansInFrame}
                    </div>
                  </div>

                  <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-slate-800 text-[10px] font-mono text-slate-300 pointer-events-none">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    BYTETRACK • 1-CH FEED
                  </div>
                </>
              )}
            </div>

            {/* Custom Playback Controls Bar */}
            {jobProgress?.status === 'completed' && (
              <div className="p-3.5 rounded-xl bg-[#0a0d16] border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlayPause}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-cyan-400" />}
                  </button>

                  <button
                    onClick={handleReplay}
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Replay from start"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
                  </button>
                </div>

                {/* Scrubber slider */}
                <div className="flex-1 flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max={videoDuration || 100}
                    step="0.04"
                    value={currentTimeSec}
                    onChange={handleSeek}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Frame Counter */}
                <div className="text-xs font-mono text-slate-400 whitespace-nowrap">
                  Frame: <span className="text-white font-bold">{currentFrameNum}</span> / {jobProgress.total_frames}
                </div>
              </div>
            )}
          </div>

          {/* Right: Surveillance Telemetry & Snapshot Dossier (1 Col) */}
          <div className="space-y-5">
            {/* Telemetry Card */}
            <div className="p-5 rounded-2xl bg-[#0a0d18] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-mono tracking-wider text-slate-400 uppercase font-semibold">
                  PEDESTRIAN TELEMETRY
                </span>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-950 border border-emerald-500/50 text-emerald-400">
                  LIVE SENSOR
                </span>
              </div>

              {/* Prominent Unique Pedestrians Display */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-[#0c1322] to-[#070b14] border border-cyan-500/40 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono tracking-wider text-cyan-400 uppercase font-semibold">
                      TOTAL UNIQUE PEDESTRIANS (BYTETRACK)
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1 flex items-baseline gap-2">
                      <span className={jobProgress && (jobProgress.unique_pedestrians_count ?? jobProgress.pedestrian_detections_count) > 0 ? "text-red-400" : "text-emerald-400"}>
                        Total Unique Pedestrians: {jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-300 mt-1 flex items-center gap-3">
                      <span>Current in Frame: <span className="text-amber-400 font-bold">{currentPedestriansInFrame}</span></span>
                      <span className="text-slate-600">•</span>
                      <span>Total Detections: <span className="text-slate-200 font-semibold">{jobProgress?.total_detection_instances || jobProgress?.pedestrian_detections_count || 0}</span></span>
                    </div>
                  </div>
                  <div className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1.5 ${
                    (jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0) > 0
                      ? 'bg-red-950/80 border-red-500/50 text-red-300'
                      : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      (jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0) > 0 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'
                    }`} />
                    {(jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0) > 0 ? 'ACTIVE TARGETS' : 'PATH CLEAR'}
                  </div>
                </div>
              </div>

              {/* Scene Verdict Box */}
              <div className="p-4 rounded-xl bg-[#06080e] border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      (jobProgress?.pedestrian_detections_count || 0) > 0
                        ? 'bg-red-950/60 text-red-400 border border-red-500/40'
                        : 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/40'
                    }`}
                  >
                    {(jobProgress?.pedestrian_detections_count || 0) > 0 ? (
                      <ShieldAlert className="w-5 h-5" />
                    ) : (
                      <ShieldCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">SCENE VERDICT</div>
                    <div className="text-sm font-bold text-white">
                      {(jobProgress?.pedestrian_detections_count || 0) > 0
                        ? 'Pedestrian Targets Detected'
                        : 'Clear Surveillance Corridor'}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">RISK SCORE</div>
                  <div className="text-base font-black text-cyan-400 font-mono">
                    {jobProgress?.peak_confidence
                      ? `${(jobProgress.peak_confidence * 100).toFixed(1)}%`
                      : '0.0%'}
                  </div>
                </div>
              </div>

              {/* Attention Index Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Pedestrian Threat Index:</span>
                  <span
                    className={`font-bold ${
                      (jobProgress?.pedestrian_detections_count || 0) > 0
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {(jobProgress?.pedestrian_detections_count || 0) > 0
                      ? 'Elevated / Active Warning'
                      : 'Safe / Low Risk'}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (jobProgress?.pedestrian_detections_count || 0) > 0
                        ? 'bg-gradient-to-r from-amber-500 to-red-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(10, (jobProgress?.peak_confidence || 0.1) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-[#06080e] border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">CURRENT PEDESTRIANS</div>
                  <div className="text-sm font-bold text-amber-400 mt-0.5">
                    {currentPedestriansInFrame}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#06080e] border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">TOTAL UNIQUE PEDESTRIANS</div>
                  <div className="text-sm font-bold text-cyan-400 mt-0.5">
                    {jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#06080e] border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">TOTAL DETECTION INSTANCES</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {jobProgress?.total_detection_instances || jobProgress?.pedestrian_detections_count || 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#06080e] border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">PEAK CONFIDENCE</div>
                  <div className="text-sm font-bold text-cyan-400 mt-0.5">
                    {jobProgress?.peak_confidence ? `${(jobProgress.peak_confidence * 100).toFixed(1)}%` : '0.0%'}
                  </div>
                </div>
              </div>

              {/* ByteTrack Tracking Architecture Note */}
              <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80 text-[10px] font-mono text-slate-400 leading-relaxed">
                <span className="text-cyan-300 font-semibold">ByteTrack Object Tracking:</span> Unique pedestrian count assigns and maintains persistent track IDs across frames using motion affinity. Occlusion over 30 frames or thermal contrast shifts may trigger ID switches.
              </div>

              {/* Big Red/Cyan Emergency Dispatch CTA */}
              <button
                onClick={handleExportReport}
                disabled={!jobProgress || jobProgress.status !== 'completed'}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg shadow-red-950/50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                LOG FORENSIC INCIDENT DOSSIER
              </button>
            </div>

            {/* Evidentiary Snapshot Card */}
            <div className="p-5 rounded-2xl bg-[#0a0d18] border border-slate-800 space-y-3">
              <div className="text-xs font-mono tracking-wider text-slate-400 uppercase font-semibold">
                CAPTURED EVIDENTIARY SNAPSHOT
              </div>

              <div className="w-full aspect-video rounded-xl bg-[#06080e] border border-slate-800 overflow-hidden flex items-center justify-center relative">
                {jobProgress?.peak_snapshot_url ? (
                  <img
                    src={getMediaUrl(jobProgress.peak_snapshot_url)}
                    alt="Peak pedestrian capture"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-4">
                    <Film className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                    <span className="text-xs text-slate-500 font-mono">No snapshot captured yet</span>
                  </div>
                )}
                {jobProgress?.peak_frame_index && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-cyan-400">
                    Frame #{jobProgress.peak_frame_index}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
