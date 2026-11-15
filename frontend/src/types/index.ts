export interface ModelStatus {
  loaded: boolean;
  model_name: string;
  model_path: string;
  architecture: string;
  input_channels: number;
  classes: string[];
  device: string;
  dataset_name: string;
}

export interface OverviewStats {
  model_status: ModelStatus;
  total_videos_analyzed: number;
  total_pedestrian_detections: number;
  total_unique_pedestrians?: number;
  total_frames_processed: number;
  recent_sessions: DetectionSessionSummary[];
}

export interface DetectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  class_id: number;
  class_name: string;
  track_id?: number | null;
}

export interface FrameDetectionResult {
  frame_index?: number;
  pedestrians_count: number;
  boxes: DetectionBox[];
  inference_time_ms: number;
  annotated_image_base64?: string;
}

export interface VideoJobProgress {
  job_id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  current_frame: number;
  total_frames: number;
  progress_percent: number;
  unique_pedestrians_count: number;
  current_pedestrians?: number;        // People detected in current frame
  pedestrian_detections_count: number; // Mirrors unique count for primary displays
  total_detection_instances: number;   // Total accumulated instances across all frames
  frame_pedestrian_counts?: number[];  // Per-frame counts for playback tracking
  peak_confidence: number;
  peak_frame_index: number;
  peak_snapshot_url?: string;
  processed_video_url?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  fps: number;
  duration_seconds: number;
  resolution: string;
}

export interface DetectionEvent {
  id: string;
  job_id: string;
  filename: string;
  frame_number: number;
  timestamp: string;
  pedestrians_count: number;
  confidence: number;
  snapshot_url: string;
  processed_video_url?: string;
  unique_pedestrians?: number;
}

export interface DetectionSessionSummary {
  job_id: string;
  filename: string;
  timestamp: string;
  total_frames: number;
  pedestrian_detections: number;
  unique_pedestrians?: number;
  peak_confidence: number;
  snapshot_url?: string;
  processed_video_url?: string;
}
