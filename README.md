<<<<<<< HEAD
# thermalvision-ai
AI-powered thermal infrared pedestrian detection and tracking system for night-time surveillance.
=======
# Thermal Vision – Pedestrian Detection for Night Vision Surveillance

A full-stack, real-time thermal surveillance dashboard and inference engine adapted for **1-Channel Infrared Pedestrian Detection** using custom YOLOv8 and the **FLIR Thermal Dataset (26,061 frames)**.

![Surveillance Dashboard UI](frontend/dist/index.html)

---

## Key Features

1. **Overview Dashboard:**
   - Real-time model health and hardware telemetry (Custom YOLOv8 1-Channel, Device CPU/CUDA, FLIR Dataset stats).
   - Dynamic session counters (Total Videos Analyzed, Total Pedestrian Detections, Total Frames Processed).
   - Heuristics breakdown: 1-channel luminance extraction, adapted Layer 0 conv (`Conv2d(1, 16, 3, 2, 1)`), multi-scale anchor grids, and evidentiary vault logging.
   - Recent detections activity feed with confidence badges.

2. **Live Monitor:**
   - Continuous camera stream with real-time single-channel grayscale conversion.
   - On-canvas bounding box tracking with neon cyan surveillance brackets and confidence score overlays.
   - Live telemetry HUD: Pedestrian target count, inference latency (ms), and frame rate (FPS).
   - Audio alert triggers and one-click Evidentiary Snapshot capture to the forensic vault.
   - **Academic Notice:** Explicitly labelled as grayscale webcam verification (simulated luminance), distinguishing algorithmic testing from physical LWIR hardware.

3. **Video Analyzer:**
   - Drag-and-drop thermal video ingestion supporting **MP4, AVI, MOV**.
   - Asynchronous background frame-by-frame analysis with real-time progress bar, frame counter, and live detection counter.
   - Integrated playback viewer with scrubber bar, replay, audio controls, and frame navigation.
   - Surveillance telemetry panel displaying Scene Verdict, Pedestrian Threat Index, Peak Frame, and Evidentiary Snapshot.
   - One-click export of forensic JSON dossiers and annotated output video downloads.

4. **Incident Evidence Vault (Detection History):**
   - Forensic archive grouped upload-wise by video session.
   - 3-column evidentiary cards displaying peak detection frame clippings, timestamps, and confidence percentages.
   - Fullscreen evidence viewer, annotated video download links, individual record deletion, and bulk vault clearing with modal confirmation.

---

## Architecture Overview

```
CV_Project/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI server, CORS, static routes, and REST endpoints
│   │   ├── model_loader.py      # Configurable 1-ch YOLOv8 manager with channel preprocessing
│   │   ├── video_processor.py   # Asynchronous video processing worker with OpenCV
│   │   └── database.py          # SQLite storage for detection events and sessions
│   └── data/
│       └── surveillance.db      # Persistent SQLite database
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx       # Top surveillance header with live status badges
│   │   │   ├── Overview.tsx     # Hero dual cards, heuristics, and recent detections
│   │   │   ├── LiveMonitor.tsx  # Webcam/simulation stream with HUD and tracker
│   │   │   ├── VideoAnalyzer.tsx# Drag-and-drop video ingestion & telemetry viewer
│   │   │   └── DetectionHistory.tsx # Evidence vault with snapshot cards
│   │   ├── services/api.ts      # REST client for backend endpoints
│   │   ├── types/index.ts       # TypeScript interfaces
│   │   ├── App.tsx              # Root application state & navigation
│   │   └── index.css            # Tailwind CSS v4 styling & dark theme
│   ├── dist/                    # Compiled production build
│   └── vite.config.ts           # Vite + Tailwind configuration with API proxy
├── models/
│   └── best.pt                  # Trained 1-channel YOLOv8 checkpoint
├── uploads/                     # Uploaded videos & test clips
├── outputs/                     # Annotated processed videos
├── snapshots/                   # Captured forensic snapshot images
└── scripts/
    ├── test_api_endpoints.py    # Automated integration test suite
    └── create_demo_thermal_video.py # Generates demo FLIR video from test frames
```

---

## Quickstart & Execution

### 1. Model Configuration
By default, the backend automatically looks for your trained checkpoint at `models/best.pt` or `weights/yolov8n_thermal_1ch.pt`.

To specify a custom checkpoint path:
```powershell
$env:MODEL_PATH = "E:\CV_Project\models\best.pt"
```

### 2. Launch the System (Unified Production Server)
The FastAPI backend serves both the REST API and the compiled React frontend:

```powershell
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
Open your browser and navigate to: **`http://localhost:8000`**

### 3. Development Mode (Optional)
If modifying the React UI in real-time with Vite Hot-Module Replacement (HMR):

**Terminal 1 (Backend):**
```powershell
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Frontend Dev Server):**
```powershell
cd frontend
npm run dev
```
Open your browser at: **`http://localhost:5173`** (Vite proxies all `/api` requests to port 8000).

---

## API Documentation

Interactive Swagger documentation is available at **`http://localhost:8000/docs`**:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & model status |
| `GET` | `/api/model/status` | Returns architecture, input channels (`1`), and device |
| `GET` | `/api/overview/stats` | Aggregate video counts, detections, and recent sessions |
| `POST` | `/api/detect/image` | Runs 1-channel inference on Base64 image |
| `POST` | `/api/detect/image-file` | Runs 1-channel inference on uploaded image/frame file |
| `POST` | `/api/detect/video` | Initiates asynchronous video processing job |
| `GET` | `/api/detect/video/{job_id}/status` | Polls job progress, frame counters, and live metrics |
| `GET` | `/api/detect/video/{job_id}/result` | Retrieves completed video result and download URL |
| `GET` | `/api/history` | Fetches archived forensic detection events |
| `POST` | `/api/history/snapshot` | Saves live evidentiary snapshot directly to vault |
| `DELETE` | `/api/history/{id}` | Deletes individual evidence record |
| `DELETE` | `/api/history` | Clears all detection sessions and event history |

>>>>>>> 4d9740937 (Initial commit)
