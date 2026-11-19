import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  Film,
  Image as ImageIcon,
  ArrowLeft,
  Trash2,
  Download,
  Eye,
  AlertTriangle,
  X,
  CheckCircle2,
  Search,
  Filter,
  ShieldAlert,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import type { DetectionEvent, HistoryFolder, HistoryFolderItem } from '../types';
import { deleteHistoryItem, clearAllHistory, getMediaUrl } from '../services/api';

interface DetectionHistoryProps {
  events: DetectionEvent[];
  onRefresh: () => void;
  initialFolderId?: string | null;
  onSelectFolder?: (id: string | null) => void;
}

export const DetectionHistory: React.FC<DetectionHistoryProps> = ({
  events,
  onRefresh,
  initialFolderId,
  onSelectFolder,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId || null);

  useEffect(() => {
    if (initialFolderId !== undefined && initialFolderId !== null) {
      setSelectedFolderId(initialFolderId);
    }
  }, [initialFolderId]);

  const handleSelectFolder = (id: string | null) => {
    setSelectedFolderId(id);
    setSelectedImageItemIndex(0);
    setActiveSeekFrameNum(null);
    if (onSelectFolder) onSelectFolder(id);
  };
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'image'>('all');
  const [selectedPreviewFolderId, setSelectedPreviewFolderId] = useState<string | null>(null);
  const [selectedImageItemIndex, setSelectedImageItemIndex] = useState<number>(0);
  const [activeSeekFrameNum, setActiveSeekFrameNum] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedEnlargedMedia, setSelectedEnlargedMedia] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [activeImageSubTab, setActiveImageSubTab] = useState<{ [key: string]: 'side' | 'analyzed' | 'original' }>({});

  const handleExportFolderDossier = (folder: HistoryFolder) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(folder, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${folder.name}_incident_dossier.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
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

  // 2. Build Video Folders & Backend Snapshot Folders from events
  // If an input is already stored in the database, overwrite with the new data!
  const computedFolders = useMemo<HistoryFolder[]>(() => {
    // Sort events descending by timestamp so newest sessions appear first
    const sortedEventsDesc = [...events].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const normalizeFileKey = (name: string) => name.toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
    const videoGroups: { [normKey: string]: { latestJobId: string; displayFilename: string; events: DetectionEvent[] } } = {};
    const standaloneSnapshotEvents: DetectionEvent[] = [];

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
        // Older sessions for the same normalized filename are overwritten/ignored
      } else {
        standaloneSnapshotEvents.push(ev);
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

        // Sort events by frame number ascending
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

    // Group any standalone snapshots
    let standaloneImageFolder: HistoryFolder[] = [];
    if (standaloneSnapshotEvents.length > 0) {
      const items: HistoryFolderItem[] = standaloneSnapshotEvents.map((e) => ({
        id: e.id,
        filename: e.filename || 'snapshot.jpg',
        originalUrl: e.snapshot_url,
        annotatedUrl: e.snapshot_url,
        snapshotUrl: e.snapshot_url,
        pedestriansCount: e.pedestrians_count,
        confidence: e.confidence,
        timestamp: e.timestamp,
      }));

      standaloneImageFolder = [
        {
          id: 'folder-live-snapshots',
          name: 'Manual Thermal Snapshot Captures',
          inputType: items.length > 1 ? 'multiple-images' : 'single-image',
          timestamp: standaloneSnapshotEvents[0].timestamp,
          totalItems: items.length,
          totalPedestrians: Math.max(...items.map((i) => i.pedestriansCount)),
          peakConfidence: Math.max(...items.map((i) => i.confidence)),
          coverImageUrl: items[0]?.snapshotUrl,
          items,
        },
      ];
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

    // Merge: unique image folders + deduplicated video folders + standalone snapshots
    const all = [...uniqueImageFolders, ...videoFoldersList, ...standaloneImageFolder].sort(
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
  }, [events, localImageFolders]);

  // Filter & Search Folders
  const filteredFolders = useMemo(() => {
    return computedFolders.filter((f) => {
      const matchesSearch =
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.timestamp.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType =
        filterType === 'all'
          ? true
          : filterType === 'video'
          ? f.inputType === 'video'
          : f.inputType === 'single-image' || f.inputType === 'multiple-images';

      return matchesSearch && matchesType;
    });
  }, [computedFolders, searchQuery, filterType]);

  const totalVaultPedestrians = useMemo(() => {
    return computedFolders.reduce((acc, f) => acc + (f.totalPedestrians || 0), 0);
  }, [computedFolders]);

  // Currently opened folder object
  const activeFolder = useMemo(() => {
    return computedFolders.find((f) => f.id === selectedFolderId) || null;
  }, [computedFolders, selectedFolderId]);

  // Preview folder for the bottom frames section when viewing all folders
  const previewFolder = useMemo(() => {
    if (selectedPreviewFolderId) {
      const found = computedFolders.find((f) => f.id === selectedPreviewFolderId);
      if (found) return found;
    }
    return filteredFolders.length > 0 ? filteredFolders[0] : (computedFolders.length > 0 ? computedFolders[0] : null);
  }, [computedFolders, filteredFolders, selectedPreviewFolderId]);

  // Delete an entire folder
  const handleDeleteFolder = async (folder: HistoryFolder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // 1. If it's an image folder in localStorage, remove it
    if (folder.id.startsWith('img-folder-') || folder.id.startsWith('folder-')) {
      const raw = localStorage.getItem('thermal_image_folders');
      if (raw) {
        const existing: HistoryFolder[] = JSON.parse(raw);
        const filtered = existing.filter((f) => f.id !== folder.id);
        localStorage.setItem('thermal_image_folders', JSON.stringify(filtered));
      }
    }

    // 2. If it contains backend events, delete them
    try {
      for (const item of folder.items) {
        if (item.id && !item.id.startsWith('item-')) {
          await deleteHistoryItem(item.id).catch(() => {});
        }
      }
      onRefresh();
    } catch (err) {
      console.error('Failed to delete folder items:', err);
    }

    if (selectedFolderId === folder.id) {
      handleSelectFolder(null);
    }
  };

  // Clear all evidence
  const handleClearAll = async () => {
    try {
      setIsDeleting(true);
      localStorage.removeItem('thermal_image_folders');
      await clearAllHistory();
      setIsDeleting(false);
      setShowClearConfirm(false);
      setSelectedFolderId(null);
      onRefresh();
    } catch (err) {
      console.error('Clear failed:', err);
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8 pb-16 font-sans">
      {/* =========================================================================
          VAULT DIRECTORY HEADER
         ========================================================================= */}
      <div className="p-6 rounded-2xl bg-[#080e18] border border-[#11243b] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#050b14] border border-[#11243b] flex items-center justify-center text-[#00e5ff] flex-shrink-0 shadow-lg shadow-cyan-950/40">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Incident Evidence Vault
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Organized folder directory for every uploaded input ({totalVaultPedestrians} pedestrians detected across {computedFolders.length} input folders) with corresponding detection outputs and extracted frames.
            </p>
          </div>
        </div>

        {computedFolders.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="self-start md:self-center flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 font-semibold text-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Vault Archive</span>
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#080e18] border border-red-500/40 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-lg font-bold text-white">Clear Evidence Vault?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently delete all {computedFolders.length} input folders, video dossiers, and image analysis sessions from your archive. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-xl bg-[#071322] hover:bg-[#0c1c30] border border-[#11243b] text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-colors cursor-pointer shadow-lg shadow-red-950/60"
              >
                {isDeleting ? 'Clearing...' : 'Confirm Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Large Image / Frame Modal */}
      {selectedEnlargedMedia && (
        <div
          onClick={() => setSelectedEnlargedMedia(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden border border-[#11243b] bg-black shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-3.5 bg-[#080e18] border-b border-[#11243b]">
              <span className="text-xs font-mono font-bold text-white truncate max-w-md">
                {selectedEnlargedMedia.title}
              </span>
              <button
                onClick={() => setSelectedEnlargedMedia(null)}
                className="p-1.5 rounded-lg bg-[#071322] hover:bg-[#0c1c30] text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center bg-black overflow-auto">
              <img
                src={getMediaUrl(selectedEnlargedMedia.url)}
                alt={selectedEnlargedMedia.title}
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 1: FOLDER DIRECTORY (When no folder is currently opened)
         ========================================================================= */}
      {!activeFolder && (
        <div className="space-y-6">
          {/* Search Bar & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-[#080e18] border border-[#11243b]">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search folders by input name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#050b14] border border-[#11243b] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00e5ff]"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1 mr-1 hidden sm:inline" />
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-[#00c8e6] text-slate-950 shadow-md shadow-cyan-950/50'
                    : 'bg-[#071322] text-slate-400 hover:text-white border border-[#11243b]'
                }`}
              >
                All Folders ({computedFolders.length})
              </button>
              <button
                onClick={() => setFilterType('video')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterType === 'video'
                    ? 'bg-[#00c8e6] text-slate-950 shadow-md shadow-cyan-950/50'
                    : 'bg-[#071322] text-slate-400 hover:text-white border border-[#11243b]'
                }`}
              >
                Videos ({computedFolders.filter((f) => f.inputType === 'video').length})
              </button>
              <button
                onClick={() => setFilterType('image')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterType === 'image'
                    ? 'bg-[#00c8e6] text-slate-950 shadow-md shadow-cyan-950/50'
                    : 'bg-[#071322] text-slate-400 hover:text-white border border-[#11243b]'
                }`}
              >
                Images ({computedFolders.filter((f) => f.inputType !== 'video').length})
              </button>
            </div>
          </div>

          {/* Folders Grid: Square Boxes Like Medium Icons */}
          {filteredFolders.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredFolders.map((folder) => {
                const isVideo = folder.inputType === 'video';
                const isMulti = folder.inputType === 'multiple-images';
                const hasDetections = folder.totalPedestrians > 0;
                const isPreviewSelected = previewFolder?.id === folder.id;

                return (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedPreviewFolderId(folder.id)}
                    onDoubleClick={() => handleSelectFolder(folder.id)}
                    className={`group aspect-square rounded-2xl bg-[#080e18] hover:bg-[#071322] border transition-all cursor-pointer p-3.5 flex flex-col items-center justify-between text-center relative overflow-hidden shadow-lg ${
                      isPreviewSelected
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
                          hasDetections ? 'bg-red-950/80 text-red-400 border border-red-500/30' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {hasDetections ? `${folder.totalPedestrians} Ped` : 'Clear'}
                        </span>
                        <button
                          onClick={(e) => handleDeleteFolder(folder, e)}
                          title="Delete folder"
                          className="p-0.5 rounded hover:bg-red-950/60 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Center: Medium Icon Box */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectFolder(folder.id);
                      }}
                      className="w-20 h-16 sm:w-22 sm:h-16 rounded-xl bg-[#050b14] border border-[#11243b] group-hover:border-cyan-400/60 transition-all flex items-center justify-center relative overflow-hidden shadow-md my-auto"
                    >
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

                    {/* Bottom: Name & Item Count */}
                    <div className="w-full space-y-0.5">
                      <div
                        title={folder.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFolder(folder.id);
                        }}
                        className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition-colors w-full px-1"
                      >
                        {folder.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center justify-center gap-1.5">
                        <span>{folder.totalItems} {isVideo ? 'frames' : 'items'}</span>
                        <span>•</span>
                        <span className="text-[#00e5ff]">{(folder.peakConfidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-16 rounded-2xl bg-[#080e18] border border-dashed border-[#11243b] text-center space-y-3">
              <Folder className="w-12 h-12 text-slate-600 mx-auto" />
              <div className="text-base font-bold text-slate-300">
                No Detection Folders Found
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchQuery
                  ? `No folders match query "${searchQuery}".`
                  : 'Every uploaded video, single image, or batch of images will automatically create its own organized folder here.'}
              </p>
            </div>
          )}
          {/* =========================================================================
              BOTTOM SECTION: EXTRACTED FRAMES FOR SELECTED VAULT FOLDER
              Displays frames from ONLY the selected/previewed archive entry.
             ========================================================================= */}
          {previewFolder && previewFolder.items.length > 0 && (
            <div className="p-6 rounded-2xl bg-[#080e18] border border-[#11243b] space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#11243b] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#071322] border border-cyan-500/50 flex items-center justify-center text-[#00e5ff] shadow-md shadow-cyan-950/40">
                    {previewFolder.inputType === 'video' ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center flex-wrap gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-white">
                        Extracted Evidence Frames
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                        Folder: {previewFolder.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Frames extracted exclusively from this archive entry. Click any frame to inspect or open full folder.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <button
                    onClick={() => handleSelectFolder(previewFolder.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 font-bold text-xs transition-all shadow-md cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open Full Folder</span>
                  </button>
                  <span className="px-3 py-1 rounded-lg bg-[#071322] border border-[#11243b] text-[#00e5ff] font-mono font-bold text-xs">
                    {previewFolder.items.length} Frame{previewFolder.items.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {previewFolder.items.map((item, idx) => {
                  const hasPeds = (item.pedestriansCount || 0) > 0;
                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => handleSelectFolder(previewFolder.id)}
                      className="group relative rounded-xl bg-[#050b14] border border-[#11243b] hover:border-cyan-500/50 hover:bg-[#071322] transition-all cursor-pointer overflow-hidden flex flex-col justify-between"
                    >
                      <div className="relative aspect-video bg-black overflow-hidden">
                        <img
                          src={getMediaUrl(item.annotatedUrl || item.snapshotUrl || item.originalUrl)}
                          alt={`Frame #${item.frameNumber || idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-sm border border-cyan-500/40 text-[9px] font-mono font-bold text-[#00e5ff]">
                          #{item.frameNumber || idx + 1}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEnlargedMedia({
                              url: item.annotatedUrl || item.snapshotUrl || item.originalUrl || '',
                              title: `${previewFolder.name} - Frame #${item.frameNumber || idx + 1}`,
                            });
                          }}
                          title="Enlarge frame"
                          className="absolute top-1.5 right-1.5 p-1 rounded bg-black/80 hover:bg-cyan-500/30 text-slate-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Eye className="w-3 h-3 text-[#00e5ff]" />
                        </button>
                      </div>

                      <div className="p-2 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className={`font-bold ${hasPeds ? 'text-red-400' : 'text-[#10b981]'}`}>
                            {hasPeds ? `${item.pedestriansCount} Ped` : 'Clear'}
                          </span>
                          <span className="text-[#00e5ff] font-bold">
                            {item.confidence ? `${((item.confidence) * 100).toFixed(0)}%` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 2: INSIDE OPENED FOLDER (Organized Contents View)
          Two-Panel Layout matching Video & Image Analyzers + Bottom Frames Section
         ========================================================================= */}
      {activeFolder && (
        <div className="space-y-6">
          {/* Breadcrumb & Navigation Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#080e18] border border-[#11243b]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSelectFolder(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#071322] hover:bg-[#0c1c30] border border-[#11243b] text-xs font-bold text-[#00e5ff] transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-[#00e5ff]" />
                <span>All Folders</span>
              </button>

              <div className="border-l border-[#11243b] pl-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-[#00e5ff]" />
                  <h2 className="text-base sm:text-lg font-bold text-white truncate max-w-md">
                    {activeFolder.name}
                  </h2>
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                  Input Type:{' '}
                  <span className="text-[#00e5ff] uppercase font-bold">
                    {activeFolder.inputType.replace('-', ' ')}
                  </span>{' '}
                  • Archived on {activeFolder.timestamp.replace('T', ' ').substring(0, 19)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => handleExportFolderDossier(activeFolder)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#071322] hover:bg-[#0c1c30] border border-[#11243b] text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span>Export Dossier</span>
              </button>
              <button
                onClick={() => handleDeleteFolder(activeFolder)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Folder</span>
              </button>
            </div>
          </div>

          {/* ===================================================================
              TWO-PANEL ANALYZER VIEW
              Left: Processed Media Viewer (2 Cols)
              Right: Pedestrian Telemetry & Scene Dossier (1 Col)
             =================================================================== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* Left Panel: Media Player / High-Res Inspector (2 Cols) */}
            <div className="lg:col-span-2 flex flex-col justify-between h-full">
              {activeFolder.inputType === 'video' ? (
                <>
                  <div className="relative aspect-video rounded-2xl bg-[#080e18] border border-[#11243b] overflow-hidden shadow-2xl flex items-center justify-center">
                    <div className="absolute inset-0 surveillance-grid opacity-30 pointer-events-none" />
                    {activeFolder.processedVideoUrl ? (
                      <video
                        ref={videoRef}
                        controls
                        className="w-full h-full object-contain"
                        src={getMediaUrl(activeFolder.processedVideoUrl)}
                      >
                        Your browser does not support HTML5 video playback.
                      </video>
                    ) : (
                      <div className="text-center p-6 text-slate-500 font-mono text-xs">
                        Video media file not available
                      </div>
                    )}
                  </div>

                  {/* Video Playback Details Bar */}
                  <div className="p-3.5 rounded-xl bg-[#071322] border border-[#11243b] flex items-center justify-between gap-4 shadow-xl">
                    <div className="flex items-center gap-2.5 text-xs font-mono text-slate-300">
                      <Film className="w-4 h-4 text-[#00e5ff]" />
                      <span className="font-bold text-white truncate max-w-sm">{activeFolder.name}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-[#00e5ff]">ByteTrack 1-Ch Feed</span>
                    </div>

                    {activeFolder.processedVideoUrl && (
                      <a
                        href={getMediaUrl(activeFolder.processedVideoUrl)}
                        download={`processed_${activeFolder.name}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Video</span>
                      </a>
                    )}
                  </div>
                </>
              ) : (
                /* Image Inspector for Image Folders */
                <div className="space-y-4">
                  {activeFolder.items[selectedImageItemIndex] && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#080e18] border border-[#11243b]">
                        <div className="flex items-center gap-2.5">
                          <ImageIcon className="w-4 h-4 text-[#00e5ff]" />
                          <span className="text-sm font-bold text-white truncate max-w-xs">
                            {activeFolder.items[selectedImageItemIndex].filename}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                              activeFolder.items[selectedImageItemIndex].pedestriansCount > 0
                                ? 'bg-red-950/60 border-red-500/40 text-red-400'
                                : 'bg-[#042017] border border-[#10b981]/40 text-[#10b981]'
                            }`}
                          >
                            {activeFolder.items[selectedImageItemIndex].pedestriansCount > 0
                              ? `${activeFolder.items[selectedImageItemIndex].pedestriansCount} Pedestrians`
                              : 'Clear Path'}
                          </span>
                        </div>

                        {/* View Switchers */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setActiveImageSubTab((prev) => ({
                                ...prev,
                                [activeFolder.items[selectedImageItemIndex].id]: 'side',
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              (activeImageSubTab[activeFolder.items[selectedImageItemIndex].id] || 'side') === 'side'
                                ? 'bg-[#00c8e6] text-slate-950'
                                : 'bg-[#071322] border border-[#11243b] text-slate-400 hover:text-white'
                            }`}
                          >
                            Side-by-Side
                          </button>
                          <button
                            onClick={() =>
                              setActiveImageSubTab((prev) => ({
                                ...prev,
                                [activeFolder.items[selectedImageItemIndex].id]: 'analyzed',
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              activeImageSubTab[activeFolder.items[selectedImageItemIndex].id] === 'analyzed'
                                ? 'bg-[#00c8e6] text-slate-950'
                                : 'bg-[#071322] border border-[#11243b] text-slate-400 hover:text-white'
                            }`}
                          >
                            Analyzed
                          </button>
                          <button
                            onClick={() =>
                              setActiveImageSubTab((prev) => ({
                                ...prev,
                                [activeFolder.items[selectedImageItemIndex].id]: 'original',
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              activeImageSubTab[activeFolder.items[selectedImageItemIndex].id] === 'original'
                                ? 'bg-[#00c8e6] text-slate-950'
                                : 'bg-[#071322] border border-[#11243b] text-slate-400 hover:text-white'
                            }`}
                          >
                            Original
                          </button>
                        </div>
                      </div>

                      {/* Display Selected Image */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {((activeImageSubTab[activeFolder.items[selectedImageItemIndex].id] || 'side') === 'side' ||
                          activeImageSubTab[activeFolder.items[selectedImageItemIndex].id] === 'original') && (
                          <div
                            onClick={() =>
                              setSelectedEnlargedMedia({
                                url:
                                  activeFolder.items[selectedImageItemIndex].originalUrl ||
                                  activeFolder.items[selectedImageItemIndex].snapshotUrl ||
                                  '',
                                title: `Original - ${activeFolder.items[selectedImageItemIndex].filename}`,
                              })
                            }
                            className="relative rounded-2xl overflow-hidden bg-black border border-[#11243b] aspect-video flex items-center justify-center cursor-pointer group shadow-xl"
                          >
                            <img
                              src={getMediaUrl(
                                activeFolder.items[selectedImageItemIndex].originalUrl ||
                                  activeFolder.items[selectedImageItemIndex].snapshotUrl
                              )}
                              alt="Original"
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-slate-300">
                              Original Input
                            </div>
                          </div>
                        )}

                        {((activeImageSubTab[activeFolder.items[selectedImageItemIndex].id] || 'side') === 'side' ||
                          activeImageSubTab[activeFolder.items[selectedImageItemIndex].id] === 'analyzed') && (
                          <div
                            onClick={() =>
                              setSelectedEnlargedMedia({
                                url:
                                  activeFolder.items[selectedImageItemIndex].annotatedUrl ||
                                  activeFolder.items[selectedImageItemIndex].snapshotUrl ||
                                  '',
                                title: `Analyzed Overlays - ${activeFolder.items[selectedImageItemIndex].filename}`,
                              })
                            }
                            className="relative rounded-2xl overflow-hidden bg-black border border-[#11243b] aspect-video flex items-center justify-center cursor-pointer group shadow-xl"
                          >
                            <img
                              src={getMediaUrl(
                                activeFolder.items[selectedImageItemIndex].annotatedUrl ||
                                  activeFolder.items[selectedImageItemIndex].snapshotUrl
                              )}
                              alt="Analyzed"
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-[#00e5ff]">
                              Analyzed Overlays (YOLOv8)
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right Panel: Surveillance Telemetry & Snapshot Dossier (1 Col) */}
            <div className="h-full flex flex-col">
              {/* Telemetry Card */}
              <div className="h-full p-4 sm:p-5 rounded-2xl bg-[#080e18] border border-[#11243b] shadow-xl flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#11243b] pb-2">
                    <span className="text-xs font-mono tracking-wider text-slate-400 uppercase font-semibold">
                      INCIDENT TELEMETRY
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                      ARCHIVED DOSSIER
                    </span>
                  </div>

                {/* Unique Pedestrians Display */}
                <div className="p-4 rounded-xl bg-[#071322] border border-[#11243b] shadow-lg relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono tracking-wider text-[#00e5ff] uppercase font-semibold">
                        TOTAL PEDESTRIANS DETECTED
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1 flex items-baseline gap-2">
                        <span className={activeFolder.totalPedestrians > 0 ? 'text-red-400' : 'text-[#00e5ff]'}>
                          {activeFolder.totalPedestrians} Pedestrian{activeFolder.totalPedestrians === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-300 mt-1 flex items-center gap-3">
                        <span>Total Items: <span className="text-white font-bold">{activeFolder.totalItems}</span></span>
                        <span className="text-slate-600">•</span>
                        <span>Peak: <span className="text-cyan-300 font-semibold">{(activeFolder.peakConfidence * 100).toFixed(1)}%</span></span>
                      </div>
                    </div>
                    <div
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1.5 ${
                        activeFolder.totalPedestrians > 0
                          ? 'bg-red-950/80 border-red-500/50 text-red-300'
                          : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activeFolder.totalPedestrians > 0 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'
                        }`}
                      />
                      {activeFolder.totalPedestrians > 0 ? 'TARGET DETECTED' : 'CLEAR PATH'}
                    </div>
                  </div>
                </div>

                {/* Scene Verdict Box */}
                <div className="p-4 rounded-xl bg-[#050b14] border border-[#11243b] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        activeFolder.totalPedestrians > 0
                          ? 'bg-red-950/60 text-red-400 border border-red-500/40'
                          : 'bg-[#042017] text-[#10b981] border border-[#10b981]/40'
                      }`}
                    >
                      {activeFolder.totalPedestrians > 0 ? (
                        <ShieldAlert className="w-5 h-5" />
                      ) : (
                        <ShieldCheck className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-slate-400 uppercase">INCIDENT VERDICT</div>
                      <div className="text-sm font-bold text-white">
                        {activeFolder.totalPedestrians > 0
                          ? 'Pedestrian Targets Identified'
                          : 'Clear Surveillance Zone'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">CONFIDENCE</div>
                    <div className="text-base font-black text-[#00e5ff] font-mono">
                      {(activeFolder.peakConfidence * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Threat Index Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Pedestrian Threat Index:</span>
                    <span
                      className={`font-bold ${
                        activeFolder.totalPedestrians > 0 ? 'text-red-400' : 'text-[#10b981]'
                      }`}
                    >
                      {activeFolder.totalPedestrians > 0 ? 'Elevated / Active Warning' : 'Safe / Low Risk'}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#050b14] border border-[#11243b] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        activeFolder.totalPedestrians > 0
                          ? 'bg-gradient-to-r from-amber-500 to-red-500'
                          : 'bg-[#10b981]'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(10, (activeFolder.peakConfidence || 0.1) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-[#050b14] border border-[#11243b]">
                    <div className="text-[10px] text-slate-400 uppercase">
                      {activeFolder.inputType === 'video' ? 'TOTAL FRAMES' : 'TOTAL IMAGES'}
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">{activeFolder.totalItems}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#050b14] border border-[#11243b]">
                    <div className="text-[10px] text-slate-400 uppercase">PEDESTRIANS</div>
                    <div className="text-sm font-bold text-amber-400 mt-0.5">{activeFolder.totalPedestrians}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#050b14] border border-[#11243b]">
                    <div className="text-[10px] text-slate-400 uppercase">PEAK CONFIDENCE</div>
                    <div className="text-sm font-bold text-[#00e5ff] mt-0.5">
                      {(activeFolder.peakConfidence * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#050b14] border border-[#11243b]">
                    <div className="text-[10px] text-slate-400 uppercase">PIPELINE STATUS</div>
                    <div className="text-sm font-bold text-[#10b981] mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>VERIFIED</span>
                    </div>
                  </div>
                </div>

                {/* Evidentiary Snapshot directly inside the dossier card */}
                {(activeFolder.coverImageUrl || activeFolder.items[0]?.snapshotUrl) && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
                      CAPTURED EVIDENTIARY SNAPSHOT
                    </div>
                    <div className="w-full h-24 sm:h-28 rounded-xl bg-[#050b14] border border-[#11243b] overflow-hidden flex items-center justify-center relative">
                      <img
                        src={getMediaUrl(activeFolder.coverImageUrl || activeFolder.items[0]?.snapshotUrl)}
                        alt="Evidentiary capture"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}
                </div>

                {/* Dossier Download CTA pinned to bottom */}
                <button
                  onClick={() => handleExportFolderDossier(activeFolder)}
                  className="w-full mt-3 py-2.5 rounded-xl bg-[#00c8e6] hover:bg-[#00e5ff] text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-950" />
                  <span>LOG FORENSIC INCIDENT DOSSIER</span>
                </button>
              </div>
            </div>
          </div>

          {/* =========================================================================
              BOTTOM SECTION: EXTRACTED EVIDENCE FRAMES (DISPLAY ONLY FRAMES)
              Displays frames from ONLY this opened folder/incident.
             ========================================================================= */}
          <div className="p-6 rounded-2xl bg-[#080e18] border border-[#11243b] space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#11243b] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#071322] border border-cyan-500/50 flex items-center justify-center text-[#00e5ff] shadow-md shadow-cyan-950/40">
                  {activeFolder.inputType === 'video' ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                </div>
                <div>
                  <div className="flex items-center flex-wrap gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Extracted Evidence Frames
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#042017] border border-[#10b981]/40 text-[#10b981]">
                      Folder: {activeFolder.name}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-500/40 text-[#00e5ff]">
                      IoU Pedestrian Detection
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {activeFolder.inputType === 'video'
                      ? 'Frames extracted exclusively from this video session. Click any frame to seek video timeline.'
                      : 'Individual image frames from this batch. Click any frame to inspect telemetry above.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <span className="px-3 py-1 rounded-lg bg-[#071322] border border-[#11243b] text-[#00e5ff] font-mono font-bold text-xs">
                  {activeFolder.items.length} Keyframe{activeFolder.items.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {activeFolder.items.map((item, idx) => {
                const isSelected =
                  activeFolder.inputType === 'video'
                    ? activeSeekFrameNum === item.frameNumber
                    : selectedImageItemIndex === idx;
                const hasPeds = (item.pedestriansCount || 0) > 0;

                return (
                  <div
                    key={item.id || idx}
                    onClick={() => {
                      if (activeFolder.inputType === 'video') {
                        if (videoRef.current && item.frameNumber) {
                          const sec = item.frameNumber / 25.0;
                          videoRef.current.currentTime = sec;
                          setActiveSeekFrameNum(item.frameNumber);
                        }
                      } else {
                        setSelectedImageItemIndex(idx);
                      }
                    }}
                    className={`group relative rounded-xl bg-[#050b14] border transition-all cursor-pointer overflow-hidden flex flex-col justify-between ${
                      isSelected
                        ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-950/50'
                        : 'border-[#11243b] hover:border-cyan-500/50 hover:bg-[#071322]'
                    }`}
                  >
                    {/* Frame Snapshot */}
                    <div className="relative aspect-video bg-black overflow-hidden">
                      <img
                        src={getMediaUrl(item.annotatedUrl || item.snapshotUrl || item.originalUrl)}
                        alt={`Frame #${item.frameNumber || idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />

                      {/* Frame # Tag */}
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-sm border border-cyan-500/40 text-[9px] font-mono font-bold text-[#00e5ff]">
                        #{item.frameNumber || idx + 1}
                      </div>

                      {/* Enlarge preview button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEnlargedMedia({
                            url: item.annotatedUrl || item.snapshotUrl || item.originalUrl || '',
                            title: `${activeFolder.name} - Frame #${item.frameNumber || idx + 1}`,
                          });
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
                        <span className={`font-bold ${hasPeds ? 'text-red-400' : 'text-[#10b981]'}`}>
                          {hasPeds ? `${item.pedestriansCount} Ped` : 'Clear'}
                        </span>
                        <span className="text-[#00e5ff] font-bold">
                          {item.confidence ? `${((item.confidence) * 100).toFixed(0)}%` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
