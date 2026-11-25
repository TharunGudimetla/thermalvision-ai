import os
import uuid
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timedelta
import cv2
import numpy as np

from .model_loader import global_model_manager
from .database import add_detection_event, add_video_session, remove_existing_entries_for_filename

# In-memory registry of active and completed jobs
active_jobs: Dict[str, Dict[str, Any]] = {}

def get_job_status(job_id: str) -> Optional[Dict[str, Any]]:
    return active_jobs.get(job_id)


def compute_perceptual_hash(frame: np.ndarray, hash_size: int = 8) -> int:
    """
    Computes a 64-bit difference perceptual hash (dHash) for an image frame.
    dHash is invariant to minor lighting variations, scale, and sensor noise.
    """
    if len(frame.shape) == 3:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    else:
        gray = frame
    resized = cv2.resize(gray, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = resized[:, 1:] > resized[:, :-1]
    h = 0
    for val in diff.flatten():
        h = (h << 1) | int(val)
    return h


def is_visually_duplicate_frame(
    candidate_hash: int,
    candidate_count: int,
    candidate_centroids: List[Tuple[float, float]],
    saved_history: List[Tuple[int, int, List[Tuple[float, float]]]],
    max_hamming_distance: int = 3,
    centroid_threshold: float = 16.0
) -> bool:
    """
    Determines if candidate frame is visually identical or near-identical to an already-saved frame in this video.
    Returns True if duplicate (should be skipped), False if unique (should be saved).
    """
    for prev_hash, prev_count, prev_centroids in saved_history:
        # If pedestrian count differs, this is a distinct detection state
        if candidate_count != prev_count:
            continue

        # Compute hamming distance between 64-bit perceptual hashes
        xor_diff = candidate_hash ^ prev_hash
        dist = bin(xor_diff).count("1")

        if dist <= max_hamming_distance:
            # Perceptual hash is visually near-identical.
            # If 0 detections, visual near-identity means duplicate background frame
            if candidate_count == 0:
                return True

            # If same number of detections, verify centroid displacement
            if len(candidate_centroids) == len(prev_centroids):
                displacements = [
                    ((c1[0] - c2[0])**2 + (c1[1] - c2[1])**2)**0.5
                    for c1, c2 in zip(candidate_centroids, prev_centroids)
                ]
                if all(d < centroid_threshold for d in displacements):
                    return True
    return False


def compute_box_iou(boxA: list, boxB: list) -> float:
    """Computes Intersection over Union (IoU) between two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter_area = max(0.0, xB - xA) * max(0.0, yB - yA)
    boxA_area = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
    boxB_area = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])
    union_area = boxA_area + boxB_area - inter_area
    return inter_area / union_area if union_area > 0 else 0.0


def merge_sub_body_boxes(boxes: list) -> list:
    """
    Suppresses redundant sub-body detections (e.g. upper torso, lower legs, or feet)
    that belong to the same physical person, merging them into an enclosing human bounding box.
    """
    if not boxes or len(boxes) <= 1:
        return boxes

    # Sort boxes by area descending so full-body boxes take precedence
    sorted_b = sorted(boxes, key=lambda b: (b["x2"] - b["x1"]) * (b["y2"] - b["y1"]), reverse=True)
    merged = []

    for b in sorted_b:
        bw = b["x2"] - b["x1"]
        bh = b["y2"] - b["y1"]
        is_part = False

        for m in merged:
            mw = m["x2"] - m["x1"]
            mh = m["y2"] - m["y1"]

            # Check horizontal overlap ratio (columns occupied)
            x_left = max(b["x1"], m["x1"])
            x_right = min(b["x2"], m["x2"])
            x_overlap = max(0.0, x_right - x_left)
            x_ratio = x_overlap / min(bw, mw) if min(bw, mw) > 0 else 0.0

            # If horizontally aligned along the same vertical person axis (>45% horizontal overlap)
            if x_ratio > 0.45:
                y_top = max(b["y1"], m["y1"])
                y_bot = min(b["y2"], m["y2"])
                y_overlap = max(0.0, y_bot - y_top)

                # Either b is vertically inside m, or vertically stacked/adjacent (e.g. torso + legs)
                if y_overlap > 0 or abs(b["y1"] - m["y2"]) < 60 or abs(m["y1"] - b["y2"]) < 60:
                    m["x1"] = min(m["x1"], b["x1"])
                    m["y1"] = min(m["y1"], b["y1"])
                    m["x2"] = max(m["x2"], b["x2"])
                    m["y2"] = max(m["y2"], b["y2"])
                    m["confidence"] = max(m["confidence"], b["confidence"])
                    is_part = True
                    break

        if not is_part:
            merged.append(b.copy())

    return merged


def calculate_unique_pedestrians(tracked_identities: dict, total_frames: int, total_detections: int) -> int:
    """
    Calculates true unique pedestrians by:
    1. Filtering out transient 1-2 frame detection noise/flickers.
    2. Merging fragmented tracklets of the same pedestrian across time and space.
    """
    if not tracked_identities:
        return 1 if total_detections > 0 else 0

    # Minimum persistence: 4 frames for short clips (<100 frames), 10 frames for full videos
    min_persist = 4 if total_frames < 100 else 10
    confirmed_tracks = {tid: t for tid, t in tracked_identities.items() if len(t["frames"]) >= min_persist}

    if not confirmed_tracks:
        return 1 if total_detections > 0 else 0

    # Cluster tracks that represent continuous trajectory segments or overlapping detections of the same pedestrian
    pedestrian_clusters = []
    for tid, t_data in sorted(confirmed_tracks.items(), key=lambda item: item[1]["frames"][0]):
        start_f = t_data["frames"][0]
        end_f = t_data["frames"][-1]
        start_pt = t_data["centroids"][0]
        end_pt = t_data["centroids"][-1]

        merged = False
        for cluster in pedestrian_clusters:
            last_f = cluster["last_f"]
            last_pt = cluster["last_pt"]
            f_gap = start_f - last_f
            spatial_dist = ((start_pt[0] - last_pt[0])**2 + (start_pt[1] - last_pt[1])**2)**0.5

            # If track starts near where previous track ended within 60 frames (2s)
            # or if tracks overlap in time and share spatial proximity (<200px)
            if (0 <= f_gap <= 60 and spatial_dist < 300) or (f_gap < 0 and spatial_dist < 200):
                cluster["tids"].append(tid)
                cluster["last_f"] = max(cluster["last_f"], end_f)
                cluster["last_pt"] = end_pt
                merged = True
                break

        if not merged:
            pedestrian_clusters.append({
                "tids": [tid],
                "last_f": end_f,
                "last_pt": end_pt
            })

    return max(1, len(pedestrian_clusters)) if total_detections > 0 else 0


class H264VideoWriter:
    """
    Encodes video frames directly into browser-compatible H.264 (AVC1) MP4.
    Uses imageio-ffmpeg with yuv420p pixel format and +faststart flag so HTML5 <video> tags
    in Chrome, Edge, Safari, and Firefox can immediately stream and play the video.
    """
    def __init__(self, output_path: Path, fps: float, width: int, height: int):
        self.output_path = Path(output_path)
        self.fps = max(1.0, float(fps))
        # Ensure dimensions are strictly even (required by libx264)
        self.width = width - (width % 2)
        self.height = height - (height % 2)
        self.imageio_writer = None
        self.cv2_writer = None
        self.temp_cv2_path = None

        try:
            import imageio
            self.imageio_writer = imageio.get_writer(
                str(self.output_path),
                fps=self.fps,
                codec='libx264',
                pixelformat='yuv420p',
                macro_block_size=None,
                ffmpeg_params=['-movflags', '+faststart', '-preset', 'veryfast', '-crf', '22']
            )
        except Exception as e:
            print(f"[!] Warning: imageio writer init failed ({e}), falling back to cv2 writer + ffmpeg remux")
            self.temp_cv2_path = self.output_path.with_name(f"temp_{self.output_path.name}")
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            self.cv2_writer = cv2.VideoWriter(
                str(self.temp_cv2_path),
                fourcc,
                self.fps,
                (self.width, self.height)
            )

    def write(self, bgr_frame: np.ndarray):
        h, w = bgr_frame.shape[:2]
        if w != self.width or h != self.height:
            bgr_frame = cv2.resize(bgr_frame, (self.width, self.height))

        if self.imageio_writer is not None:
            rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
            self.imageio_writer.append_data(rgb_frame)
        elif self.cv2_writer is not None:
            self.cv2_writer.write(bgr_frame)

    def release(self):
        if self.imageio_writer is not None:
            try:
                self.imageio_writer.close()
            except Exception as e:
                print(f"[!] Error closing imageio writer: {e}")
            self.imageio_writer = None

        if self.cv2_writer is not None:
            try:
                self.cv2_writer.release()
            except Exception as e:
                print(f"[!] Error releasing cv2 writer: {e}")
            self.cv2_writer = None

            if self.temp_cv2_path and self.temp_cv2_path.exists():
                try:
                    import imageio_ffmpeg, subprocess
                    exe = imageio_ffmpeg.get_ffmpeg_exe()
                    subprocess.run([
                        exe, '-y',
                        '-i', str(self.temp_cv2_path),
                        '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart',
                        '-preset', 'veryfast',
                        str(self.output_path)
                    ], check=True, capture_output=True)
                    self.temp_cv2_path.unlink()
                except Exception as ex:
                    print(f"[!] Failed to remux to H.264: {ex}")
                    if self.temp_cv2_path.exists():
                        self.temp_cv2_path.rename(self.output_path)


def run_video_analysis_job(
    job_id: str,
    input_video_path: Path,
    original_filename: str,
    conf_threshold: float = 0.25
):
    cap = None
    writer = None
    try:
        # Overwrite prior database events/session for this file if already stored
        remove_existing_entries_for_filename(original_filename, current_job_id=job_id)

        active_jobs[job_id]["status"] = "processing"

        cap = cv2.VideoCapture(str(input_video_path))
        if not cap.isOpened():
            raise RuntimeError(f"Could not open uploaded video file: {input_video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        raw_fps = cap.get(cv2.CAP_PROP_FPS)
        fps = 25.0 if (raw_fps is None or np.isnan(raw_fps) or raw_fps <= 0) else float(raw_fps)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        # Probe first frame if properties not populated by container header
        if width <= 0 or height <= 0:
            ret_probe, probe_frame = cap.read()
            if ret_probe and probe_frame is not None:
                height, width = probe_frame.shape[:2]
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            else:
                width, height = 640, 480

        if total_frames <= 0:
            total_frames = 100 # Reasonable baseline; dynamically updated

        duration_sec = total_frames / fps if fps > 0 else 0.0

        active_jobs[job_id]["total_frames"] = total_frames
        active_jobs[job_id]["fps"] = round(fps, 1)
        active_jobs[job_id]["resolution"] = f"{width}x{height}"
        active_jobs[job_id]["duration_seconds"] = round(duration_sec, 1)

        # Output video preparation
        outputs_dir = Path("outputs")
        outputs_dir.mkdir(parents=True, exist_ok=True)
        snapshots_dir = Path("snapshots")
        snapshots_dir.mkdir(parents=True, exist_ok=True)

        # Dedicated isolated folder for frames extracted from this specific video upload
        video_frames_dir = snapshots_dir / job_id / "frames"
        video_frames_dir.mkdir(parents=True, exist_ok=True)

        output_filename = f"{job_id}_annotated.mp4"
        output_video_path = outputs_dir / output_filename

        # If resolution is larger than 1080p (e.g. 4K UHD), scale down to 1080p
        # for smooth browser decoding and reasonable file size
        out_w = width
        out_h = height
        if out_w > 1920:
            scale = 1920.0 / out_w
            out_w = int(out_w * scale)
            out_h = int(out_h * scale)
        # Ensure dimensions are strictly even and valid for H.264
        out_w = max(16, out_w - (out_w % 2))
        out_h = max(16, out_h - (out_h % 2))

        # Initialize web-compatible H.264 writer
        writer = H264VideoWriter(
            output_video_path,
            fps=fps,
            width=out_w,
            height=out_h
        )

        # Reset ByteTrack tracker state for every new video upload session
        global_model_manager.reset_tracker()
        unique_track_ids: set[int] = set()
        tracked_identities: Dict[int, Dict[str, Any]] = {}

        frame_idx = 0
        total_detections = 0
        frame_pedestrian_counts = []
        peak_conf = 0.0
        peak_frame_idx = 0
        peak_snapshot_path = None
        keyframe_events = []
        cached_boxes = []
        unique_count = 0
        # Dedicated per-video record for duplicate frame detection using perceptual hashing
        saved_frame_records: List[Tuple[int, int, List[Tuple[float, float]]]] = []
        job_start_time = datetime.now()

        # Adaptive stride: for long videos, stride=2 provides 2x speedup while maintaining tracking precision
        stride = 2 if total_frames > 250 else 1

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1

            # Run model inference on key stride frames, interpolate for non-stride frames
            if frame_idx % stride == 0 or frame_idx == 1 or not cached_boxes:
                det_result = global_model_manager.predict_frame(frame, conf_threshold=conf_threshold)
                boxes = merge_sub_body_boxes(det_result["boxes"])
                cached_boxes = boxes
            else:
                # Reuse boxes for intermediate frame
                boxes = [b.copy() for b in cached_boxes]

            count = len(boxes)
            frame_pedestrian_counts.append(count)

            if count > 0:
                total_detections += count

                # Active tracks eligible for association within 45 frames (1.5s recovery window)
                active_tids = [
                    tid for tid, t_data in tracked_identities.items()
                    if frame_idx - t_data["frames"][-1] <= 45
                ]
                assigned_tids = set()

                # Associate clean detections with continuous pedestrian tracks (1-to-1 matching)
                for b in boxes:
                    cx = (b["x1"] + b["x2"]) / 2.0
                    cy = (b["y1"] + b["y2"]) / 2.0
                    cur_box = [b["x1"], b["y1"], b["x2"], b["y2"]]

                    best_tid = None
                    best_score = float("inf")

                    for tid in active_tids:
                        if tid in assigned_tids:
                            continue
                        t_data = tracked_identities[tid]
                        last_cx, last_cy = t_data["centroids"][-1]
                        last_box = t_data["boxes"][-1]
                        dist = ((cx - last_cx)**2 + (cy - last_cy)**2)**0.5
                        iou = compute_box_iou(cur_box, last_box)

                        # Cost metric: heavily rewards IoU overlap, uses Euclidean distance for motion continuity
                        cost = dist - (iou * 200.0)
                        if dist < 250.0 and cost < best_score:
                            best_score = cost
                            best_tid = tid

                    if best_tid is not None:
                        b["track_id"] = best_tid
                        b["iou"] = round(float(iou), 2)
                        assigned_tids.add(best_tid)
                        unique_track_ids.add(best_tid)
                        tracked_identities[best_tid]["frames"].append(frame_idx)
                        tracked_identities[best_tid]["centroids"].append((cx, cy))
                        tracked_identities[best_tid]["boxes"].append(cur_box)
                    else:
                        new_tid = len(tracked_identities) + 1
                        b["track_id"] = new_tid
                        assigned_tids.add(new_tid)
                        unique_track_ids.add(new_tid)
                        tracked_identities[new_tid] = {
                            "frames": [frame_idx],
                            "centroids": [(cx, cy)],
                            "boxes": [cur_box]
                        }

                # Check for peak confidence in frame
                frame_peak = max(b["confidence"] for b in boxes)
                if frame_peak > peak_conf:
                    peak_conf = frame_peak
                    peak_frame_idx = frame_idx

                    # Save peak snapshot into dedicated frames folder
                    snapshot_filename = f"peak_frame_{frame_idx}.jpg"
                    snap_path = video_frames_dir / snapshot_filename
                    annotated_snap = global_model_manager.annotate_frame(frame, boxes)
                    cv2.imwrite(str(snap_path), annotated_snap)
                    peak_snapshot_path = f"/snapshots/{job_id}/frames/{snapshot_filename}"

                # Evidentiary frame extraction with perceptual duplicate suppression
                # Candidates: frames with pedestrian detections, or sampled every 2 seconds
                if count > 0 or frame_idx % max(1, int(fps * 2)) == 0:
                    frame_hash = compute_perceptual_hash(frame)
                    cur_centroids = [
                        ((b["x1"] + b["x2"]) / 2.0, (b["y1"] + b["y2"]) / 2.0)
                        for b in boxes
                    ]

                    # Check against previously saved frames for this video to skip near-identical duplicates
                    if not is_visually_duplicate_frame(frame_hash, count, cur_centroids, saved_frame_records):
                        # Unique frame! Save into isolated video frames folder
                        frame_file = f"frame_{frame_idx:05d}.jpg"
                        ev_path = video_frames_dir / frame_file
                        annotated_ev = global_model_manager.annotate_frame(frame, boxes)
                        cv2.imwrite(str(ev_path), annotated_ev)

                        # Record for future duplicate comparisons
                        saved_frame_records.append((frame_hash, count, cur_centroids))

                        # Preserve frame sequence and original timestamp
                        frame_time = (job_start_time + timedelta(seconds=frame_idx / fps)).isoformat()
                        event_id = str(uuid.uuid4())
                        ev_data = {
                            "event_id": event_id,
                            "job_id": job_id,
                            "filename": original_filename,
                            "frame_number": frame_idx,
                            "timestamp": frame_time,
                            "pedestrians_count": count,
                            "confidence": float(frame_peak),
                            "snapshot_url": f"/snapshots/{job_id}/frames/{frame_file}",
                            "processed_video_url": f"/outputs/{output_filename}",
                            "unique_pedestrians": calculate_unique_pedestrians(tracked_identities, total_frames, total_detections)
                        }
                        keyframe_events.append(ev_data)
                        add_detection_event(**ev_data)

            # Annotate and write to H.264 video
            annotated_frame = global_model_manager.annotate_frame(frame, boxes)
            writer.write(annotated_frame)

            # Unique pedestrians calculation: throttled to every 15 frames to prevent CPU bottleneck
            if frame_idx % 15 == 0 or frame_idx == total_frames:
                unique_count = calculate_unique_pedestrians(tracked_identities, total_frames, total_detections)

            # Update progress
            progress_pct = (frame_idx / total_frames * 100.0) if total_frames > 0 else 0.0
            active_jobs[job_id]["current_frame"] = frame_idx
            active_jobs[job_id]["progress_percent"] = round(progress_pct, 1)
            active_jobs[job_id]["current_pedestrians"] = count  # People detected in current frame
            active_jobs[job_id]["unique_pedestrians_count"] = unique_count  # Distinct tracked people throughout video
            active_jobs[job_id]["pedestrian_detections_count"] = unique_count  # Primary count: Unique Pedestrians
            active_jobs[job_id]["total_detection_instances"] = total_detections  # Secondary count: Total Instances
            active_jobs[job_id]["peak_confidence"] = round(peak_conf, 3)
            active_jobs[job_id]["peak_frame_index"] = peak_frame_idx

        # Final unique count with part-body merging and trajectory continuity
        final_unique_count = calculate_unique_pedestrians(tracked_identities, total_frames, total_detections)

        # Safely release resources
        cap.release()
        cap = None
        writer.release()
        writer = None

        # If no pedestrians detected at all, take middle frame as representative snapshot
        if peak_snapshot_path is None:
            cap_mid = cv2.VideoCapture(str(input_video_path))
            cap_mid.set(cv2.CAP_PROP_POS_FRAMES, max(0, total_frames // 2))
            ret_mid, frame_mid = cap_mid.read()
            cap_mid.release()
            if ret_mid and frame_mid is not None:
                mid_filename = "thumbnail.jpg"
                mid_path = video_frames_dir / mid_filename
                cv2.imwrite(str(mid_path), frame_mid)
                peak_snapshot_path = f"/snapshots/{job_id}/frames/{mid_filename}"

        # Record session in database with both unique pedestrians and total detection instances
        original_vid_url = f"/uploads/{input_video_path.name}"
        add_video_session(
            job_id=job_id,
            filename=original_filename,
            total_frames=frame_idx,
            pedestrian_detections=total_detections,
            peak_confidence=round(peak_conf, 3),
            snapshot_url=peak_snapshot_path,
            processed_video_url=f"/outputs/{output_filename}",
            unique_pedestrians=final_unique_count,
            original_video_url=original_vid_url
        )

        active_jobs[job_id]["status"] = "completed"
        active_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        active_jobs[job_id]["original_video_url"] = original_vid_url
        active_jobs[job_id]["processed_video_url"] = f"/outputs/{output_filename}"
        active_jobs[job_id]["peak_snapshot_url"] = peak_snapshot_path
        active_jobs[job_id]["progress_percent"] = 100.0
        active_jobs[job_id]["current_pedestrians"] = frame_pedestrian_counts[0] if frame_pedestrian_counts else 0
        active_jobs[job_id]["unique_pedestrians_count"] = final_unique_count
        active_jobs[job_id]["pedestrian_detections_count"] = final_unique_count
        active_jobs[job_id]["total_detection_instances"] = total_detections
        active_jobs[job_id]["frame_pedestrian_counts"] = frame_pedestrian_counts

        print(f"[+] Video analysis completed for {original_filename}: {final_unique_count} unique pedestrians (from {total_detections} total detections across {frame_idx} frames).")

    except Exception as e:
        print(f"[!] Video analysis failed for job {job_id}: {e}")
        active_jobs[job_id]["status"] = "failed"
        active_jobs[job_id]["error_message"] = str(e)
    finally:
        if cap is not None:
            cap.release()
        if writer is not None:
            writer.release()


def start_video_processing_thread(
    job_id: str,
    input_video_path: Path,
    original_filename: str,
    conf_threshold: float = 0.25
):
    active_jobs[job_id] = {
        "job_id": job_id,
        "filename": original_filename,
        "status": "pending",
        "current_frame": 0,
        "total_frames": 0,
        "progress_percent": 0.0,
        "unique_pedestrians_count": 0,
        "pedestrian_detections_count": 0,
        "total_detection_instances": 0,
        "peak_confidence": 0.0,
        "peak_frame_index": 0,
        "created_at": datetime.now().isoformat(),
        "fps": 25.0,
        "duration_seconds": 0.0,
        "resolution": "640x480"
    }

    t = threading.Thread(
        target=run_video_analysis_job,
        args=(job_id, input_video_path, original_filename, conf_threshold),
        daemon=True
    )
    t.start()
