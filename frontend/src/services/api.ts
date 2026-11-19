import type {
  ModelStatus,
  OverviewStats,
  FrameDetectionResult,
  VideoJobProgress,
  DetectionEvent,
  BatchDetectionResponse,
} from '../types';

// Dynamically resolve base URL:
// When accessed via VS Code forwarded address, tunnels, or LAN, use relative paths ('')
// so requests route through the current host's proxy rather than calling the friend's localhost!
const getBackendBase = (): string => {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost) {
      return '';
    }
  }
  return envUrl;
};

const BACKEND_BASE = getBackendBase();
const API_BASE = BACKEND_BASE ? `${BACKEND_BASE}/api` : '/api';

/**
 * Universal fetch wrapper that automatically attaches tunnel bypass headers
 * (so localtunnel, ngrok, and dev tunnels never intercept API calls with reminder pages)
 */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  headers.set('Bypass-Tunnel-Reminder', 'true');
  headers.set('bypass-tunnel-reminder', 'true');
  return fetch(input, { ...init, headers });
}

export function getMediaUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_BASE}${cleanPath}`;
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await apiFetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json();
}

export async function fetchModelStatus(): Promise<ModelStatus> {
  const res = await apiFetch(`${API_BASE}/model/status`);
  if (!res.ok) throw new Error('Failed to fetch model status');
  return res.json();
}

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const res = await apiFetch(`${API_BASE}/overview/stats`);
  if (!res.ok) throw new Error('Failed to fetch overview stats');
  return res.json();
}

export async function detectImageFrame(
  imageBlobOrBase64: Blob | string,
  confThreshold: number = 0.25
): Promise<FrameDetectionResult> {
  let body: FormData | string;
  let headers: HeadersInit = {};

  if (typeof imageBlobOrBase64 === 'string') {
    body = JSON.stringify({ image: imageBlobOrBase64, conf: confThreshold });
    headers = { 'Content-Type': 'application/json' };
    const res = await apiFetch(`${API_BASE}/detect/image`, {
      method: 'POST',
      headers,
      body,
    });
    if (!res.ok) throw new Error('Inference request failed');
    return res.json();
  } else {
    const formData = new FormData();
    formData.append('file', imageBlobOrBase64, 'frame.jpg');
    formData.append('conf', confThreshold.toString());
    const res = await apiFetch(`${API_BASE}/detect/image-file`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Inference request failed');
    return res.json();
  }
}

export async function detectBatchImages(
  files: File[],
  confThreshold: number = 0.25
): Promise<BatchDetectionResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  formData.append('conf', confThreshold.toString());

  const res = await apiFetch(`${API_BASE}/detect/images-batch`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Batch image inference failed');
  }
  return res.json();
}

export async function startVideoDetection(
  file: File,
  confThreshold: number = 0.25
): Promise<{ job_id: string; message: string }> {
  const formData = new FormData();
  formData.append('video', file);
  formData.append('conf', confThreshold.toString());

  const res = await apiFetch(`${API_BASE}/detect/video`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to submit video for detection');
  }
  return res.json();
}

export async function fetchVideoJobStatus(jobId: string): Promise<VideoJobProgress> {
  const res = await apiFetch(`${API_BASE}/detect/video/${jobId}/status`);
  if (!res.ok) throw new Error('Failed to fetch video job status');
  return res.json();
}

export async function fetchHistory(): Promise<DetectionEvent[]> {
  const res = await apiFetch(`${API_BASE}/history`);
  if (!res.ok) throw new Error('Failed to fetch detection history');
  return res.json();
}

export async function deleteHistoryItem(id: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_BASE}/history/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete history item');
  return res.json();
}

export async function clearAllHistory(): Promise<{ success: boolean; cleared_count: number }> {
  const res = await apiFetch(`${API_BASE}/history`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to clear history');
  return res.json();
}

export async function saveSnapshotEvent(
  imageBlob: Blob,
  metadata: {
    filename?: string;
    frame_number?: number;
    pedestrians_count: number;
    confidence: number;
  }
): Promise<{ success: boolean; id: string; snapshot_url: string }> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'snapshot.jpg');
  formData.append('filename', metadata.filename || 'webcam_capture.jpg');
  formData.append('frame_number', (metadata.frame_number || 1).toString());
  formData.append('pedestrians_count', metadata.pedestrians_count.toString());
  formData.append('confidence', metadata.confidence.toString());

  const res = await apiFetch(`${API_BASE}/history/snapshot`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to save snapshot to history');
  return res.json();
}
