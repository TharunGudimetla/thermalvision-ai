import os
import uuid
import base64
from pathlib import Path
from typing import Optional
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
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        res = global_model_manager.predict_frame(frame, conf_threshold=conf)
        return res

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect/video")
async def detect_video(
    video: UploadFile = File(...),
    conf: float = Form(0.25)
):
    # Validate extension
    ext = Path(video.filename).suffix.lower()
    if ext not in [".mp4", ".avi", ".mov", ".mkv", ".webm"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format: '{ext}'. Please upload an MP4, AVI, MOV, or WEBM file."
        )

    job_id = str(uuid.uuid4())[:8]
    save_filename = f"{job_id}_{video.filename}"
    upload_path = Path("uploads") / save_filename

    try:
        with open(upload_path, "wb") as f:
            while chunk := await video.read(1024 * 1024): # 1MB chunk
                f.write(chunk)

        # Launch background processing worker
        start_video_processing_thread(
            job_id=job_id,
            input_video_path=upload_path,
            original_filename=video.filename,
            conf_threshold=conf
        )

        return {
            "job_id": job_id,
            "filename": video.filename,
            "message": "Video successfully uploaded. 1-Channel analysis started."
        }

    except Exception as e:
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
dist_path = Path("frontend/dist")
if dist_path.exists():
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")

