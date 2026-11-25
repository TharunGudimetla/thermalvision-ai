import os
import uuid
import base64
from pathlib import Path
from typing import Optional, List
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from .model_loader import global_model_manager
from .video_processor import start_video_processing_thread, get_job_status
from .database import (
    init_db,
    add_detection_event,
    get_all_events,
    delete_event,
    clear_all_events,
    get_overview_stats
)

# Initialize database tables
init_db()

# Ensure directories exist
for d in ["uploads", "outputs", "snapshots", "models"]:
    Path(d).mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Thermal Vision - Pedestrian Detection System API",
    description="Backend API for 1-Channel Thermal Pedestrian Surveillance using YOLOv8",
    version="2.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file mounts for video playback and snapshot images
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")
app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")

# Pydantic models
class ImageDetectRequest(BaseModel):
    image: str # Base64 encoded JPEG/PNG
    conf: Optional[float] = 0.25

# Endpoints
@app.get("/api/health")
def get_health():
    return {
        "status": "healthy",
        "service": "Thermal Vision Pedestrian Detection",
        "model_loaded": global_model_manager.is_loaded
    }

@app.get("/api/model/status")
def get_model_status():
    return global_model_manager.get_status()

@app.get("/api/overview/stats")
def get_overview_statistics():
    db_stats = get_overview_stats()
    return {
        "model_status": global_model_manager.get_status(),
        "total_videos_analyzed": db_stats["total_videos_analyzed"],
        "total_pedestrian_detections": db_stats["total_pedestrian_detections"],
        "total_frames_processed": db_stats["total_frames_processed"],
        "recent_sessions": db_stats["recent_sessions"]
    }

@app.post("/api/detect/image")
async def detect_image_base64(req: ImageDetectRequest):
    try:
        # Decode base64 string
        encoded_data = req.image
        if "," in encoded_data:
            encoded_data = encoded_data.split(",")[1]

        image_bytes = base64.b64decode(encoded_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Could not decode base64 image")

        res = global_model_manager.predict_frame(frame, conf_threshold=req.conf or 0.25)
        return res

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect/image-file")
async def detect_image_file(
    file: UploadFile = File(...),
    conf: float = Form(0.25)
):
    try:
        import re
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        res = global_model_manager.predict_frame(frame, conf_threshold=conf)

        # Persistent storage: Save original image and annotated detection result
        img_id = str(uuid.uuid4())[:8]
        raw_name = Path(file.filename or "image.jpg").name
        clean_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', raw_name).strip()
        if not clean_name:
            clean_name = f"image_{img_id}.jpg"

        orig_filename = f"{img_id}_{clean_name}"
        orig_path = Path("uploads") / orig_filename
        with open(orig_path, "wb") as f:
            f.write(contents)

        # Generate and save annotated image with bounding boxes
        annotated_frame = global_model_manager.annotate_frame(frame, res.get("boxes", []))
        annotated_filename = f"{img_id}_annotated_{clean_name}"
        if not annotated_filename.lower().endswith(('.jpg', '.jpeg', '.png')):
            annotated_filename += ".jpg"
        annotated_path = Path("snapshots") / annotated_filename
        cv2.imwrite(str(annotated_path), annotated_frame)

        # Convert annotated frame to base64 for direct preview compatibility
        _, buffer = cv2.imencode('.jpg', annotated_frame)
        res["annotated_image_base64"] = f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"
        res["original_url"] = f"/uploads/{orig_filename}"
        res["annotated_url"] = f"/snapshots/{annotated_filename}"

        # Persist event in SQLite database
        boxes = res.get("boxes", [])
        max_conf = max([b.get("confidence", 0) for b in boxes], default=0.0)
        peds_count = res.get("pedestrians_count", 0)

        add_detection_event(
            event_id=img_id,
            job_id=None,
            filename=clean_name,
            frame_number=1,
            pedestrians_count=peds_count,
            confidence=max_conf,
            snapshot_url=f"/snapshots/{annotated_filename}",
            processed_video_url=f"/uploads/{orig_filename}",
            unique_pedestrians=peds_count
        )

        return res

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect/images-batch")
async def detect_images_batch(
    files: List[UploadFile] = File(...),
    conf: float = Form(0.25)
):
    """
    Batch thermal pedestrian detection for multiple uploaded images.
    Independently runs each image through the existing 1-channel YOLOv8 pipeline.
    Handles per-image errors gracefully without failing the entire batch.
    """
    allowed_exts = {".jpg", ".jpeg", ".png"}
    batch_results = []
    total_pedestrians = 0
    total_inference_ms = 0.0

    for file in files:
        filename = file.filename or "unknown"
        ext = Path(filename).suffix.lower()

        if ext not in allowed_exts:
            batch_results.append({
                "filename": filename,
                "status": "error",
                "error": f"Unsupported format: '{ext}'. Supported formats: JPG, JPEG, PNG.",
                "pedestrians_count": 0,
                "boxes": [],
                "inference_time_ms": 0.0
            })
            continue

        try:
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                batch_results.append({
                    "filename": filename,
                    "status": "error",
                    "error": "Failed to decode image data",
                    "pedestrians_count": 0,
                    "boxes": [],
                    "inference_time_ms": 0.0
                })
                continue

            # Run 1-channel thermal inference
            res = global_model_manager.predict_frame(frame, conf_threshold=conf)
            count = res.get("pedestrians_count", 0)
            inf_time = res.get("inference_time_ms", 0.0)

            total_pedestrians += count
            total_inference_ms += inf_time

            # Persistent storage: Save original image and annotated detection result
            import re
            img_id = str(uuid.uuid4())[:8]
            clean_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', Path(filename).name).strip()
            if not clean_name:
                clean_name = f"image_{img_id}.jpg"

            orig_filename = f"{img_id}_{clean_name}"
            orig_path = Path("uploads") / orig_filename
            with open(orig_path, "wb") as f:
                f.write(contents)

            annotated_frame = global_model_manager.annotate_frame(frame, res.get("boxes", []))
            annotated_filename = f"{img_id}_annotated_{clean_name}"
            if not annotated_filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                annotated_filename += ".jpg"
            annotated_path = Path("snapshots") / annotated_filename
            cv2.imwrite(str(annotated_path), annotated_frame)

            boxes = res.get("boxes", [])
            max_conf = max([b.get("confidence", 0) for b in boxes], default=0.0)

            add_detection_event(
                event_id=img_id,
                job_id=None,
                filename=clean_name,
                frame_number=1,
                pedestrians_count=count,
                confidence=max_conf,
                snapshot_url=f"/snapshots/{annotated_filename}",
                processed_video_url=f"/uploads/{orig_filename}",
                unique_pedestrians=count
            )

            batch_results.append({
                "filename": filename,
                "status": "success",
                "pedestrians_count": count,
                "boxes": boxes,
                "inference_time_ms": inf_time,
                "original_url": f"/uploads/{orig_filename}",
                "annotated_url": f"/snapshots/{annotated_filename}"
            })

        except Exception as e:
            batch_results.append({
                "filename": filename,
                "status": "error",
                "error": str(e),
                "pedestrians_count": 0,
                "boxes": [],
                "inference_time_ms": 0.0
            })

    return {
        "total_images": len(files),
        "successful_images": sum(1 for r in batch_results if r["status"] == "success"),
        "total_pedestrians": total_pedestrians,
        "total_inference_time_ms": round(total_inference_ms, 2),
        "results": batch_results
    }

@app.post("/api/detect/video")
async def detect_video(
    video: UploadFile = File(...),
    conf: float = Form(0.25)
):
    # Validate video format / extension
    raw_name = Path(video.filename).name
    ext = Path(raw_name).suffix.lower()
    allowed_exts = [
        ".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v", ".flv",
        ".wmv", ".ts", ".3gp", ".mpeg", ".mpg", ".ogg", ".asf", ".m2ts"
    ]
    if ext and ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format: '{ext}'. Supported formats: MP4, AVI, MOV, MKV, WEBM, FLV, WMV, TS, M4V."
        )

    import re
    job_id = str(uuid.uuid4())[:8]
    # Sanitize filename for Windows: remove chars that are illegal on Windows (< > : " / \ | ? *)
    clean_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', raw_name).strip()
    if not clean_name or clean_name.startswith('.'):
        clean_name = f"video_{job_id}{ext if ext else '.mp4'}"

    save_filename = f"{job_id}_{clean_name}"
    upload_path = Path("uploads") / save_filename

    try:
        with open(upload_path, "wb") as f:
            while chunk := await video.read(1024 * 1024): # 1MB chunk
                f.write(chunk)

        # Validate that the file is actually readable as a video stream
        test_cap = cv2.VideoCapture(str(upload_path))
        if not test_cap.isOpened():
            test_cap.release()
            upload_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"The uploaded file '{video.filename}' could not be decoded as a valid video stream. Please ensure the file is not corrupted."
            )
        test_cap.release()

        # Launch background processing worker
        start_video_processing_thread(
            job_id=job_id,
            input_video_path=upload_path,
            original_filename=raw_name,
            conf_threshold=conf
        )

        return {
            "job_id": job_id,
            "filename": raw_name,
            "message": "Video successfully uploaded. 1-Channel analysis started."
        }

    except HTTPException:
        raise
    except Exception as e:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save video: {e}")

@app.get("/api/detect/video/{job_id}/status")
def get_video_status(job_id: str):
    status = get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    return status

@app.get("/api/detect/video/{job_id}/result")
def get_video_result(job_id: str):
    status = get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")

    if status.get("status") != "completed":
        return JSONResponse(status_code=202, content=status)

    out_url = status.get("processed_video_url")
    return {
        "status": "completed",
        "job_id": job_id,
        "processed_video_url": out_url,
        "details": status
    }

@app.get("/api/history")
def get_history_events():
    return get_all_events()

@app.post("/api/history/snapshot")
async def save_live_snapshot(
    file: UploadFile = File(...),
    pedestrians_count: int = Form(0),
    confidence: float = Form(0.0)
):
    try:
        snap_id = str(uuid.uuid4())
        filename = f"live_capture_{snap_id[:8]}.jpg"
        save_path = Path("snapshots") / filename

        contents = await file.read()
        with open(save_path, "wb") as f:
            f.write(contents)

        add_detection_event(
            event_id=snap_id,
            job_id=None,
            filename="Live Camera Feed",
            frame_number=1,
            pedestrians_count=pedestrians_count,
            confidence=confidence,
            snapshot_url=f"/snapshots/{filename}",
            processed_video_url=None
        )

        return {"success": True, "snapshot_url": f"/snapshots/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/history/{event_id}")
def delete_single_event(event_id: str):
    success = delete_event(event_id)
    if not success:
        raise HTTPException(status_code=404, detail="History event not found")
    return {"success": True, "deleted_id": event_id}

@app.delete("/api/history")
def clear_history():
    count = clear_all_events()
    return {"success": True, "cleared_count": count}

# Optional: Mount frontend build dist for seamless single-origin deployment
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
dist_path = (PROJECT_ROOT / "frontend" / "dist").resolve()

if dist_path.exists():
    # Mount static assets first
    assets_dir = dist_path / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/")
    async def serve_index():
        index_file = dist_path / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return JSONResponse({"status": "ready", "service": "Thermal Vision Pedestrian Detection", "docs": "/docs"})

    @app.get("/{full_path:path}")
    async def serve_spa_fallback(full_path: str):
        if full_path.startswith(("api", "uploads", "outputs", "snapshots", "docs", "openapi.json", "redoc")):
            raise HTTPException(status_code=404, detail="Not Found")
        target_file = dist_path / full_path
        if target_file.is_file():
            return FileResponse(str(target_file))
        index_file = dist_path / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        raise HTTPException(status_code=404, detail="Not Found")
else:
    @app.get("/")
    def serve_fallback():
        return {
            "message": "Thermal Vision Pedestrian Detection API is online.",
            "frontend_dev_url": "http://localhost:5173",
            "api_docs": "/docs",
            "health": "/api/health"
        }

