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
  AlertCircle,
  Activity,
  Sliders,
  RefreshCw,
  Eye,
  X,
} from 'lucide-react';
import {
  startVideoDetection,
  fetchVideoJobStatus,
  getMediaUrl,
  fetchHealth,
  fetchHistory,
} from '../services/api';
import type { VideoJobProgress, DetectionEvent } from '../types';

export const VideoAnalyzer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confThreshold, setConfThreshold] = useState<number>(0.25);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<VideoJobProgress | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(true);
  const [isCheckingBackend, setIsCheckingBackend] = useState<boolean>(false);

  // Frames strictly from the most recently uploaded and processed video
  const [recentVideoFrames, setRecentVideoFrames] = useState<DetectionEvent[]>([]);
  const [selectedEnlargedFrame, setSelectedEnlargedFrame] = useState<DetectionEvent | null>(null);
  const [activeSeekFrameNum, setActiveSeekFrameNum] = useState<number | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState<boolean>(false);

  // Extract client-side keyframes from the uploaded video file immediately
  const extractClientFrames = (file: File) => {
    setIsExtractingFrames(true);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const fileUrl = URL.createObjectURL(file);
    video.src = fileUrl;

    const cleanup = () => {
      URL.revokeObjectURL(fileUrl);
      setIsExtractingFrames(false);
    };

    const timer = setTimeout(cleanup, 8000);

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration && !isNaN(video.duration) && isFinite(video.duration) ? video.duration : 10;
        setVideoDuration(duration);
        const frameCount = Math.min(8, Math.max(4, Math.floor(duration)));
        const step = duration / (frameCount + 1);
        const extracted: DetectionEvent[] = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        for (let i = 1; i <= frameCount; i++) {
          const seekTime = i * step;
          await new Promise<void>((resolve) => {
            let resolved = false;
            let to: ReturnType<typeof setTimeout> | null = null;
            const onSeek = () => {
              if (resolved) return;
              resolved = true;
              if (to) clearTimeout(to);
              video.removeEventListener('seeked', onSeek);
              try {
                canvas.width = Math.min(video.videoWidth || 640, 640);
                canvas.height = Math.min(video.videoHeight || 480, 480);
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  extracted.push({
                    id: `preview-frame-${i}`,
                    job_id: 'preview',
                    filename: file.name,
                    frame_number: Math.max(1, Math.round(seekTime * 25)),
                    pedestrians_count: 0,
                    confidence: 0,
                    snapshot_url: canvas.toDataURL('image/jpeg', 0.75),
                    timestamp: new Date().toISOString(),
                  });
                }
              } catch (err) {
                console.warn('Frame capture failed', err);
              }
              resolve();
            };

            to = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                video.removeEventListener('seeked', onSeek);
                resolve();
              }
            }, 600);

            video.addEventListener('seeked', onSeek);
            video.currentTime = seekTime;
          });
        }

        if (extracted.length > 0) {
          setRecentVideoFrames(extracted);
        }
      } catch (e) {
        console.warn('Frame extraction error:', e);
      } finally {
        clearTimeout(timer);
        cleanup();
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
    };
  };

  // Create preview URL and extract initial frames whenever selectedFile changes
  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setSelectedFilePreviewUrl(url);
      extractClientFrames(selectedFile);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setSelectedFilePreviewUrl(null);
    }
  }, [selectedFile]);

  // Check backend server connection
  const checkBackendHealth = async () => {
    try {
      setIsCheckingBackend(true);
      await fetchHealth();
      setBackendOnline(true);
      setErrorMsg(null);
    } catch {
      setBackendOnline(false);
    } finally {
      setIsCheckingBackend(false);
    }
  };

  useEffect(() => {
    checkBackendHealth();
    const hInterval = setInterval(checkBackendHealth, 8000);
    return () => clearInterval(hInterval);
  }, []);

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

  // Extract frames directly from the annotated/processed output video (contains all bounding boxes)
  const extractFramesFromAnnotatedVideo = async (
    videoUrl: string,
    targetJobId: string,
    targetFilename: string,
    totalFrames: number = 100,
    fpsVal: number = 25.0
  ): Promise<DetectionEvent[]> => {
    return new Promise((resolve) => {
      const vid = document.createElement('video');
      vid.crossOrigin = 'anonymous';
      vid.src = getMediaUrl(videoUrl);
      vid.muted = true;
      vid.playsInline = true;

      const cleanup = () => {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 10000);

      vid.onloadedmetadata = async () => {
        try {
          const duration = vid.duration && isFinite(vid.duration) && vid.duration > 0
            ? vid.duration
            : (totalFrames / fpsVal || 10);
          const frameCount = Math.min(10, Math.max(4, Math.floor(duration)));
          const step = duration / (frameCount + 1);
          const extracted: DetectionEvent[] = [];
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          for (let i = 1; i <= frameCount; i++) {
            const seekTime = i * step;
            await new Promise<void>((res) => {
              let resolved = false;
              let to: ReturnType<typeof setTimeout> | null = null;
              const onSeek = () => {
                if (resolved) return;
                resolved = true;
                if (to) clearTimeout(to);
                vid.removeEventListener('seeked', onSeek);
                try {
                  canvas.width = Math.min(vid.videoWidth || 640, 640);
                  canvas.height = Math.min(vid.videoHeight || 480, 480);
                  if (ctx) {
                    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
                    extracted.push({
                      id: `annotated-frame-${i}-${targetJobId}`,
                      job_id: targetJobId,
                      filename: targetFilename,
                      frame_number: Math.max(1, Math.round(seekTime * fpsVal)),
                      pedestrians_count: 1,
                      confidence: 0.85,
                      snapshot_url: canvas.toDataURL('image/jpeg', 0.85),
                      processed_video_url: videoUrl,
                      timestamp: new Date().toISOString(),
                    });
                  }
                } catch (e) {
                  console.warn('Canvas frame extraction failed:', e);
                }
                res();
              };

              to = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  vid.removeEventListener('seeked', onSeek);
                  res();
                }
              }, 800);

              vid.addEventListener('seeked', onSeek);
              vid.currentTime = seekTime;
            });
          }
          resolve(extracted);
        } catch {
          resolve([]);
        } finally {
          clearTimeout(timer);
          cleanup();
        }
      };

      vid.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve([]);
      };
    });
  };

  // Load keyframe detections exclusively for this video session with bounding boxes
  const loadRecentFrames = async (targetJobId: string, targetFilename: string, currentJobProg?: VideoJobProgress | null) => {
    try {
      const allEvents = await fetchHistory();
      const matching = allEvents.filter(
        (ev) => ev.job_id === targetJobId || (targetJobId && ev.job_id?.startsWith(targetJobId))
      );
      matching.sort((a, b) => (a.frame_number || 0) - (b.frame_number || 0));

      const prog = currentJobProg || jobProgress;
      if (matching.length >= 4) {
        setRecentVideoFrames(matching);
      } else if (prog?.processed_video_url) {
        // Extract annotated frames from the processed video (contains bounding boxes on all frames)
        const extracted = await extractFramesFromAnnotatedVideo(
          prog.processed_video_url,
          targetJobId,
          targetFilename,
          prog.total_frames || 100,
          prog.fps || 25.0
        );
        if (extracted.length > 0) {
          setRecentVideoFrames(extracted);
        } else if (matching.length > 0) {
          setRecentVideoFrames(matching);
        } else if (prog?.peak_snapshot_url) {
          setRecentVideoFrames([
            {
              id: `peak-${targetJobId}`,
              job_id: targetJobId,
              filename: targetFilename,
              frame_number: prog.peak_frame_index || 1,
              pedestrians_count: prog.unique_pedestrians_count ?? prog.pedestrian_detections_count ?? 1,
              confidence: prog.peak_confidence || 0.85,
              snapshot_url: prog.peak_snapshot_url,
              processed_video_url: prog.processed_video_url,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } else if (matching.length > 0) {
        setRecentVideoFrames(matching);
      } else if (prog?.peak_snapshot_url) {
        setRecentVideoFrames([
          {
            id: `peak-${targetJobId}`,
            job_id: targetJobId,
            filename: targetFilename,
            frame_number: prog.peak_frame_index || 1,
            pedestrians_count: prog.unique_pedestrians_count ?? prog.pedestrian_detections_count ?? 1,
            confidence: prog.peak_confidence || 0.85,
            snapshot_url: prog.peak_snapshot_url,
            processed_video_url: prog.processed_video_url,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to load recent video frames:', err);
    }
  };

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
            if (status.status === 'failed') {
              setErrorMsg(status.error_message || 'Video analysis encountered an error.');
            } else if (status.status === 'completed') {
              loadRecentFrames(jobId, selectedFile?.name || '', status);
            }
          }
        } catch (err) {
          console.error('Polling job status failed:', err);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, jobProgress?.status, selectedFile?.name]);

  // Handle file select (replaces previous frames)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setJobId(null);
      setJobProgress(null);
      setErrorMsg(null);
      setRecentVideoFrames([]);
      setActiveSeekFrameNum(null);
      setSelectedEnlargedFrame(null);
    }
  };

  // Drag and drop (replaces previous frames)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setJobId(null);
      setJobProgress(null);
      setErrorMsg(null);
      setRecentVideoFrames([]);
      setActiveSeekFrameNum(null);
      setSelectedEnlargedFrame(null);
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

  // Reset & Upload another video (clears recent frames)
  const handleResetVideo = () => {
    setSelectedFile(null);
    setJobId(null);
    setJobProgress(null);
    setErrorMsg(null);
    setIsPlaying(false);
    setRecentVideoFrames([]);
    setActiveSeekFrameNum(null);
    setSelectedEnlargedFrame(null);
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
    <div className="space-y-8 pb-16">
      {/* Backend Offline Connection Warning */}
      {!backendOnline && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-300 text-xs font-mono shadow-xl">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <div>
              <span className="font-bold text-white">Backend Inference Server Offline (Port 8000)</span>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                The FastAPI model worker is not reachable. Ensure the server is running or double-click <span className="text-white font-bold underline">start_app.bat</span> in your project directory.
              </p>
            </div>
          </div>
          <button
            onClick={checkBackendHealth}
            disabled={isCheckingBackend}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs uppercase transition-all shadow-md cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingBackend ? 'animate-spin' : ''}`} />
            {isCheckingBackend ? 'Checking...' : 'Retry Connection'}
          </button>
        </div>
      )}

      {/* Top Banner when a video is loaded / analyzing / completed */}
      {selectedFile && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#080e18] border border-[#11243b] shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#050b14] border border-[#11243b] flex items-center justify-center text-[#00e5ff]">
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
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-950/90 border border-cyan-500/50 text-[#00e5ff] flex items-center gap-1.5 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
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
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#071322] hover:bg-red-950/40 border border-[#11243b] hover:border-red-500/40 text-slate-300 hover:text-red-300 text-xs font-medium transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Video & Upload Another
            </button>

            {jobProgress?.status === 'completed' && (
              <>
                <button
                  onClick={handleExportReport}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#071322] hover:bg-[#0c1c30] border border-[#11243b] text-cyan-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-[#00e5ff]" />
                  Export Report (JSON)
                </button>

                {jobProgress.processed_video_url && (
                  <a
                    href={getMediaUrl(jobProgress.processed_video_url)}
                    download={`processed_${selectedFile.name}`}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 text-xs font-bold transition-colors shadow-lg shadow-cyan-950/40 cursor-pointer"
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
            className="p-12 rounded-3xl bg-[#080e18] border-2 border-dashed border-[#11243b] hover:border-[#00e5ff] transition-all text-center flex flex-col items-center justify-center relative overflow-hidden group shadow-2xl"
          >
            <div className="absolute inset-0 surveillance-grid opacity-20 pointer-events-none" />

            <div className="w-20 h-20 rounded-2xl bg-[#050b14] border border-[#11243b] flex items-center justify-center text-[#00e5ff] mb-6 group-hover:scale-105 transition-transform shadow-lg shadow-cyan-950/30">
              <Upload className="w-10 h-10" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Ingest Thermal Surveillance Footage
            </h2>
            <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
              Upload MP4, AVI, MOV, MKV, or WEBM thermal video files. The backend feeds every frame through your genuine 1-channel YOLOv8 model for pedestrian detection.
            </p>

            <label className="cursor-pointer px-6 py-3 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 font-extrabold text-xs tracking-wider uppercase transition-all shadow-lg shadow-cyan-950/40 mb-4 inline-flex items-center gap-2">
              <Film className="w-4 h-4" />
              Select Video from Computer
              <input
                type="file"
                accept="*/*,video/*,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.m4v,.ts"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <div className="text-[11px] text-slate-400 font-mono">
              Supported Formats: MP4, AVI, MOV, MKV, WEBM, FLV, WMV, TS • All Containers Allowed
            </div>
          </div>
        </div>
      ) : jobProgress?.status === 'failed' ? (
        /* Failed Analysis Screen */
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-[#080e18] border border-rose-500/40 text-center space-y-6 shadow-2xl shadow-rose-950/20">
          <div className="w-16 h-16 rounded-2xl bg-rose-950/50 border border-rose-500/50 flex items-center justify-center mx-auto text-rose-400">
            <AlertCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white">
              Video Analysis Encountered an Issue
            </h3>
            <p className="text-xs text-rose-300 font-mono bg-rose-950/30 p-3 rounded-xl border border-rose-900/50 break-words">
              {jobProgress?.error_message || errorMsg || 'Unable to decode or process this video format.'}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleResetVideo}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#071322] hover:bg-[#0c1c30] border border-[#11243b] text-white font-bold text-xs uppercase tracking-wider transition-all"
            >
              Select Another Video
            </button>
            <button
              onClick={handleStartAnalysis}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-rose-500/20"
            >
              Retry Video Ingestion
            </button>
          </div>
        </div>
      ) : jobProgress?.status === 'processing' || isUploading ? (
        /* Progress Screen */
        <div className="max-w-2xl mx-auto p-8 rounded-3xl bg-[#080e18] border border-[#11243b] text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-center mx-auto text-[#00e5ff] animate-pulse">
            <Activity className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white mb-1">
              Processing Thermal Video Frame-by-Frame
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Converting frames to 1-channel grayscale matrices &amp; running YOLOv8 inference...
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">
                Frame: {jobProgress?.current_frame || 0} / {jobProgress?.total_frames || '...'}
              </span>
              <span className="text-[#00e5ff] font-bold">
                {jobProgress?.progress_percent ? jobProgress.progress_percent.toFixed(1) : 0}%
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-[#050b14] border border-[#11243b] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 via-cyan-400 to-[#00e5ff] transition-all duration-300 shadow-lg shadow-cyan-500/50"
                style={{ width: `${jobProgress?.progress_percent || 5}%` }}
              />
            </div>
          </div>

          {/* Live detection counter during processing */}
          <div className="p-4 rounded-xl bg-[#071322] border border-[#11243b] flex items-center justify-around text-xs font-mono">
            <div>
              <div className="text-slate-400">Current Pedestrians</div>
              <div className="text-xl font-black text-amber-400">
                {jobProgress?.current_pedestrians ?? 0}
              </div>
            </div>
            <div className="w-px h-8 bg-[#11243b]" />
            <div>
              <div className="text-slate-400">Total Unique Pedestrians</div>
              <div className="text-xl font-black text-[#00e5ff]">
                {jobProgress?.unique_pedestrians_count ?? 0}
              </div>
            </div>
            <div className="w-px h-8 bg-[#11243b]" />
            <div>
              <div className="text-slate-400">Peak Confidence</div>
              <div className="text-xl font-black text-white">
                {jobProgress?.peak_confidence ? (jobProgress.peak_confidence * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Video Player & Surveillance Telemetry Split View (Matches Screenshot 6) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* Left: Video Player Feed (2 Cols) */}
          <div className="lg:col-span-2 flex flex-col justify-between h-full">
            <div className="relative aspect-video rounded-2xl bg-[#080e18] border border-[#11243b] overflow-hidden shadow-2xl flex items-center justify-center">
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
              ) : selectedFilePreviewUrl ? (
                <video
                  ref={videoRef}
                  key={selectedFilePreviewUrl}
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
                  <source src={selectedFilePreviewUrl} type={selectedFile?.type || 'video/mp4'} />
                  Your browser does not support HTML5 video playback.
                </video>
              ) : (
                <div className="text-center p-6 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-[#050b14] border border-[#11243b] flex items-center justify-center mx-auto text-slate-400">
                    <Film className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white mb-1">
                      Ready to Analyze: {selectedFile.name}
                    </div>
                  </div>
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

                  <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-[#11243b] text-[10px] font-mono text-slate-300 pointer-events-none">
                    <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
                    BYTETRACK • 1-CH FEED
                  </div>
                </>
              )}
            </div>

            {/* Analyzer Option Controls Bar (Pre-Analysis) */}
            {(!jobProgress || jobProgress.status !== 'completed') && (
              <div className="p-4 rounded-2xl bg-[#080e18] border border-[#11243b] space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Confidence Slider */}
                  <div className="flex-1 w-full text-left">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Sliders className="w-3.5 h-3.5 text-[#00e5ff]" />
                        Min Confidence Threshold:
                      </span>
                      <span className="font-mono text-[#00e5ff] font-bold">
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
                      className="w-full accent-[#00e5ff] cursor-pointer"
                    />
                  </div>

                  {/* Start 1-Channel Analysis Button */}
                  <button
                    onClick={handleStartAnalysis}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-950/40 cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                  >
                    <Activity className="w-4 h-4 text-slate-950" />
                    <span>Start 1-Channel Analysis</span>
                  </button>
                </div>
              </div>
            )}

            {/* Custom Playback Controls Bar */}
            {jobProgress?.status === 'completed' && (
              <div className="p-3.5 rounded-xl bg-[#071322] border border-[#11243b] flex items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlayPause}
                    className="p-2 rounded-lg bg-[#050b14] hover:bg-[#0c1c30] border border-[#11243b] text-white hover:text-[#00e5ff] transition-colors cursor-pointer"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-[#00e5ff]" />}
                  </button>

                  <button
                    onClick={handleReplay}
                    className="p-2 rounded-lg bg-[#050b14] hover:bg-[#0c1c30] border border-[#11243b] text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Replay from start"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 rounded-lg bg-[#050b14] hover:bg-[#0c1c30] border border-[#11243b] text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#00e5ff]" />}
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
                    className="w-full accent-[#00e5ff] cursor-pointer"
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
          <div className="h-full flex flex-col">
            {jobProgress?.status === 'completed' ? (
              <div className="h-full p-4 sm:p-5 rounded-2xl bg-[#080e18] border border-[#11243b] shadow-xl flex flex-col justify-between">
                <div className="space-y-2.5">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-[#11243b] pb-2">
                    <span className="text-xs font-mono tracking-wider text-slate-400 uppercase font-semibold">
                      PEDESTRIAN TELEMETRY
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                      AI VERIFIED
                    </span>
                  </div>

                  {/* Unique Pedestrians Hero Banner */}
                  <div className="p-3 rounded-xl bg-[#071322] border border-[#11243b] shadow-md flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono tracking-wider text-[#00e5ff] uppercase font-semibold">
                        TOTAL UNIQUE PEDESTRIANS
                      </div>
                      <div className="text-2xl font-black font-mono mt-0.5">
                        <span className={(jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0) > 0 ? "text-red-400" : "text-[#00e5ff]"}>
                          {jobProgress?.unique_pedestrians_count ?? jobProgress?.pedestrian_detections_count ?? 0}
                        </span>
                      </div>
                    </div>

                    <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1.5 ${
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

                  {/* Threat Index Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-400">Threat Index:</span>
                      <span className={`font-bold ${(jobProgress?.pedestrian_detections_count || 0) > 0 ? 'text-red-400' : 'text-[#10b981]'}`}>
                        {(jobProgress?.pedestrian_detections_count || 0) > 0 ? 'Elevated Warning' : 'Safe / Low Risk'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#050b14] border border-[#11243b] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          (jobProgress?.pedestrian_detections_count || 0) > 0
                            ? 'bg-gradient-to-r from-amber-500 to-red-500'
                            : 'bg-[#10b981]'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(10, (jobProgress?.peak_confidence || 0.1) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* 4-Grid Key Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2 rounded-lg bg-[#050b14] border border-[#11243b]">
                      <div className="text-[9px] text-slate-400 uppercase">CURRENT IN FRAME</div>
                      <div className="text-sm font-bold text-amber-400 mt-0.5">{currentPedestriansInFrame}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#050b14] border border-[#11243b]">
                      <div className="text-[9px] text-slate-400 uppercase">PEAK CONFIDENCE</div>
                      <div className="text-sm font-bold text-[#00e5ff] mt-0.5">
                        {jobProgress?.peak_confidence ? `${(jobProgress.peak_confidence * 100).toFixed(1)}%` : '0.0%'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#050b14] border border-[#11243b]">
                      <div className="text-[9px] text-slate-400 uppercase">TOTAL DETECTIONS</div>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {jobProgress?.total_detection_instances || jobProgress?.pedestrian_detections_count || 0}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#050b14] border border-[#11243b]">
                      <div className="text-[9px] text-slate-400 uppercase">TOTAL FRAMES</div>
                      <div className="text-sm font-bold text-slate-200 mt-0.5">{jobProgress?.total_frames || 0}</div>
                    </div>
                  </div>

                  {/* Evidentiary Snapshot directly inside the dossier card with compact height */}
                  {jobProgress?.peak_snapshot_url && (
                    <div className="space-y-1 pt-0.5">
                      <div className="flex items-center justify-between text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
                        <span>CAPTURED EVIDENTIARY SNAPSHOT</span>
                        {jobProgress?.peak_frame_index && (
                          <span className="text-[#00e5ff]">Frame #{jobProgress.peak_frame_index}</span>
                        )}
                      </div>
                      <div className="w-full h-24 sm:h-28 rounded-xl bg-[#050b14] border border-[#11243b] overflow-hidden flex items-center justify-center relative">
                        <img
                          src={getMediaUrl(jobProgress.peak_snapshot_url)}
                          alt="Peak pedestrian capture"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Action CTA Button pinned to bottom */}
                <button
                  onClick={handleExportReport}
                  className="w-full mt-3 py-2.5 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4 text-slate-950" />
                  LOG FORENSIC INCIDENT DOSSIER
                </button>
              </div>
            ) : (
              <div className="h-full p-4 sm:p-5 rounded-2xl bg-[#080e18] border border-[#11243b] shadow-xl flex flex-col justify-between">
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-[#11243b] pb-2.5">
                    <span className="text-xs font-mono tracking-wider text-slate-400 uppercase font-semibold">
                      PEDESTRIAN TELEMETRY
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                      STANDBY
                    </span>
                  </div>

                  {/* System Armed Banner */}
                  <div className="p-3.5 rounded-xl bg-[#071322] border border-[#11243b] shadow-md flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono tracking-wider text-[#00e5ff] uppercase font-semibold">
                        SURVEILLANCE STATUS
                      </div>
                      <div className="text-base font-black font-mono text-white mt-0.5">
                        Ready for Ingestion
                      </div>
                    </div>
                    <div className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-950/40 text-[#00e5ff] text-[10px] font-mono font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
                      SYSTEM ARMED
                    </div>
                  </div>

                  {/* 4-Grid Specs */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-[#050b14] border border-[#11243b]">
                      <div className="text-[9px] text-slate-400 uppercase">MODEL ARCHITECTURE</div>
                      <div className="text-sm font-bold text-[#00e5ff] mt-0.5">YOLOv8 1-CH</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#050b14] border border-[#11243b]">
                      <div className="text-[9px] text-slate-400 uppercase">TRACKING ENGINE</div>
                      <div className="text-sm font-bold text-[#10b981] mt-0.5">ByteTrack</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#050b14] border border-[#11243b]">
                      <div className="text-[9px] text-slate-400 uppercase">COLOR FORMAT</div>
                      <div className="text-sm font-bold text-slate-200 mt-0.5">Grayscale 8-bit</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#050b14] border border-[#11243b]">
                      <div className="text-[9px] text-slate-400 uppercase">TARGET CLASS</div>
                      <div className="text-sm font-bold text-amber-400 mt-0.5">Pedestrian</div>
                    </div>
                  </div>

                  {/* ByteTrack Architecture Note */}
                  <div className="p-3 rounded-xl bg-[#050b14] border border-[#11243b] text-[11px] font-mono text-slate-400 leading-relaxed">
                    <span className="text-[#00e5ff] font-semibold">ByteTrack Object Tracking:</span> Video processing maps each frame through 1-channel thermal matrices, assigning unique IDs to every detected pedestrian.
                  </div>
                </div>

                {/* Start Analysis Helper */}
                <div className="p-3 rounded-xl bg-[#050b14] border border-cyan-500/20 text-center mt-3">
                  <p className="text-xs font-mono text-slate-400">
                    Click <span className="text-[#00e5ff] font-semibold">Start 1-Channel Analysis</span> to process footage and extract evidence frames.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          BOTTOM SECTION: EXTRACTED VIDEO FRAMES (DISPLAY ONLY FRAMES)
          Displays frames from ONLY the most recently uploaded and processed video.
          Replaces with new frames when a new upload is processed.
         ========================================================================= */}
      {selectedFile && (
        <div className="p-6 rounded-2xl bg-[#080e18] border border-[#11243b] space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#11243b] pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#071322] border border-cyan-500/50 flex items-center justify-center text-[#00e5ff] shadow-md shadow-cyan-950/40">
                <Film className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center flex-wrap gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Extracted Video Frames
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                    Latest Upload: {selectedFile.name}
                  </span>
                  {jobProgress?.status === 'completed' ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-500/40 text-[#00e5ff]">
                      IoU Pedestrian Detection
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                      Raw Preview • Click Start Analysis for Detection Boxes
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Frames extracted exclusively from the current video session. Click any frame to seek video timeline.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="px-3 py-1 rounded-lg bg-[#071322] border border-[#11243b] text-[#00e5ff] font-mono font-bold text-xs">
                {recentVideoFrames.length} Keyframe{recentVideoFrames.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {isExtractingFrames && recentVideoFrames.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="aspect-video rounded-xl bg-[#050b14] border border-[#11243b] animate-pulse flex flex-col items-center justify-center text-slate-500 text-xs font-mono gap-2"
                >
                  <Activity className="w-4 h-4 text-[#00e5ff] animate-spin" />
                  <span>Extracting #{i}...</span>
                </div>
              ))}
            </div>
          ) : recentVideoFrames.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {recentVideoFrames.map((frame, idx) => {
                const isCurrentSeek = activeSeekFrameNum === frame.frame_number;
                const hasPeds = (frame.pedestrians_count || 0) > 0;

                return (
                  <div
                    key={frame.id || idx}
                    onClick={() => {
                      if (videoRef.current) {
                        const fps = jobProgress?.fps || 25.0;
                        const sec = frame.frame_number ? frame.frame_number / fps : (idx * 2);
                        videoRef.current.currentTime = sec;
                        setCurrentTimeSec(sec);
                        setCurrentFrameNum(frame.frame_number || 1);
                        setActiveSeekFrameNum(frame.frame_number || 1);
                      }
                    }}
                    className={`group relative rounded-xl bg-[#050b14] border transition-all cursor-pointer overflow-hidden flex flex-col justify-between ${
                      isCurrentSeek
                        ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-950/50'
                        : 'border-[#11243b] hover:border-cyan-500/50 hover:bg-[#071322]'
                    }`}
                  >
                    {/* Frame Snapshot */}
                    <div className="relative aspect-video bg-black overflow-hidden">
                      {frame.snapshot_url ? (
                        <img
                          src={getMediaUrl(frame.snapshot_url)}
                          alt={`Frame #${frame.frame_number}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Film className="w-5 h-5" />
                        </div>
                      )}

                      {/* Frame # Tag */}
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-sm border border-cyan-500/40 text-[9px] font-mono font-bold text-[#00e5ff]">
                        #{frame.frame_number || idx + 1}
                      </div>

                      {/* Enlarge preview button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEnlargedFrame(frame);
                        }}
                        title="Enlarge frame"
                        className="absolute top-1.5 right-1.5 p-1 rounded bg-black/80 hover:bg-cyan-500/30 text-slate-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Eye className="w-3 h-3 text-[#00e5ff]" />
                      </button>
                    </div>

                    {/* Frame Card Footer */}
                    <div className="p-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span
                          className={`font-bold ${
                            hasPeds ? 'text-red-400' : 'text-[#10b981]'
                          }`}
                        >
                          {hasPeds
                            ? `${frame.pedestrians_count} Ped`
                            : jobProgress?.status === 'completed'
                            ? 'Clear'
                            : 'Keyframe'}
                        </span>
                        <span className="text-[#00e5ff] font-bold">
                          {frame.confidence ? `${((frame.confidence) * 100).toFixed(0)}%` : 'Ready'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs font-mono">
              Extracting frames from video session...
            </div>
          )}
        </div>
      )}

      {/* Modal for Enlarged Frame View */}
      {selectedEnlargedFrame && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSelectedEnlargedFrame(null)}
        >
          <div
            className="max-w-3xl w-full rounded-2xl bg-[#080e18] border border-[#11243b] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#11243b] flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">
                  {selectedFile?.name} — Frame #{selectedEnlargedFrame.frame_number}
                </h4>
                <div className="text-[11px] font-mono text-[#00e5ff] mt-0.5">
                  Detected: {selectedEnlargedFrame.pedestrians_count || 1} Pedestrian(s) • Confidence: {((selectedEnlargedFrame.confidence || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <button
                onClick={() => setSelectedEnlargedFrame(null)}
                className="p-1.5 rounded-lg bg-[#071322] hover:bg-[#0c1c30] text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-black flex items-center justify-center max-h-[70vh] overflow-hidden">
              <img
                src={getMediaUrl(selectedEnlargedFrame.snapshot_url)}
                alt={`Frame #${selectedEnlargedFrame.frame_number}`}
                className="max-w-full max-h-[68vh] object-contain rounded-lg"
              />
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
