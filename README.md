# ThermalVision AI – Thermal Pedestrian Detection System

An AI-powered thermal surveillance dashboard and inference engine adapted for **1-Channel Infrared Pedestrian Detection and Tracking** using a customized YOLOv8 model trained on the **FLIR Thermal Dataset (26,061 frames)**.

---

## 🌟 Available Modules & Features

### 1. 🎛️ Overview Dashboard
- **Model Telemetry:** Real-time status of the custom 1-channel YOLOv8 model, device assignment (CPU/CUDA), and dataset specifications.
- **Session Counters:** Dynamic counters for total videos analyzed, unique pedestrian identities, and total frames processed.
- **Input Evidence Folders:** Square-box folder grid organizing each analyzed input with cover thumbnails, pedestrian counts, and instant frame inspection.
- **Automatic Deduplication:** Automatically overwrites previous entries for repeat uploads of the same media file.

### 2. 🖼️ Image Analyzer
- **Single & Batch Ingestion:** Ingest individual thermal images or upload entire batches of images (`JPG`, `PNG`, `WEBM`, `TIFF`).
- **Interactive View Modes:** Inspect detections using **Side-by-Side**, **Annotated Only**, or **Original Thermal** views.
- **Bounding Boxes & Overlap:** Highlights detected pedestrians with cyan bounding boxes, confidence percentages, and count indicators.

### 3. 📹 Video Analyzer
- **Multi-Format Support:** Ingests thermal video files (`MP4`, `AVI`, `MOV`, `MKV`, `WEBM`, `FLV`, `WMV`, `TS`).
- **Adaptive Stride & Tracking:** ByteTrack tracking engine with adaptive frame stride for fast, smooth pedestrian identification.
- **Integrated Video Player:** Synchronized timeline scrubber, play/pause controls, frame-by-frame navigation, and volume controls.
- **Evidentiary Snapshot:** Automatically captures peak detection frames during processing.
- **Forensic Dossier Export:** One-click JSON export of detection telemetry and download of annotated H.264 video.
- **Bottom Keyframe Gallery:** Interactive thumbnail gallery displaying extracted detection frames with click-to-seek playback.

### 4. 🗄️ Incident History
- **Organized Evidence Vault:** Stores analyzed sessions in dedicated folders.
- **Detailed Frame Explorer:** Review all captured frames, view enlarged snapshots, delete individual records, or clear vault history.

---

## 📂 Project Structure

```
thermalvision-ai/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI server, REST API & frontend static bundle serving
│   │   ├── model_loader.py      # Configurable 1-channel YOLOv8 manager & preprocessing
│   │   ├── video_processor.py   # Asynchronous video processing, tracking & H.264 encoding
│   │   └── database.py          # SQLite database storage & deduplication
│   ├── data/                    # Persistent SQLite database
│   └── models/
│       └── best.pt              # Trained 1-channel YOLOv8 checkpoint
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx           # Surveillance navigation header
│   │   │   ├── Overview.tsx         # Dashboard metrics & evidence folders
│   │   │   ├── ImageAnalyzer.tsx    # Single & batch thermal image detection
│   │   │   ├── VideoAnalyzer.tsx    # Video ingestion, player & keyframe gallery
│   │   │   └── DetectionHistory.tsx # Incident vault & history folders
│   │   ├── services/api.ts          # REST client with dynamic relative routing
│   │   ├── types/index.ts           # TypeScript type definitions
│   │   ├── App.tsx                  # Application state & routing
│   │   └── index.css                # Tailwind CSS styling
│   ├── dist/                        # Pre-compiled production bundle
│   └── vite.config.ts               # Vite configuration & proxy settings
├── run_app.py                   # Python application launcher
├── start_app.bat                # Windows one-click startup script
├── requirements.txt             # Python dependencies
└── README.md                    # Project documentation
```

---

## 🚀 How to Run

### 1. Installation

**Prerequisites:** Python 3.10+ and Node.js 18+ (optional, only needed if modifying frontend source).

```bash
# Clone the repository
git clone https://github.com/TharunGudimetla/thermalvision-ai.git
cd thermalvision-ai

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Start the Application (One-Click)

On **Windows**, double-click **`start_app.bat`** or run:
```powershell
python run_app.py
```

This starts the backend on **Port 8000** (which serves both the API and the React frontend) and automatically opens:
👉 **`http://localhost:8000`**

### 3. Frontend Development Mode (Optional)

If developing the frontend with Vite Hot Module Replacement (HMR):
```powershell
# Terminal 1: Backend
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** (Vite proxies all `/api` requests to port 8000).

---

## 🌐 Sharing via VS Code Port Forwarding

To share the application with another person using VS Code:

1. Open the **PORTS** tab in VS Code (bottom panel next to Terminal).
2. Click **Forward a Port** and enter **`8000`**.
3. Right-click the forwarded port and set **Port Visibility** to **Public**.
4. Copy the generated **Forwarded Address** and share it.
   - *Because the frontend and backend are unified on port 8000, your collaborator can open the link in any browser and use the full application without extra configuration.*

---

## 📡 REST API Endpoints

The FastAPI backend provides interactive documentation at **`http://localhost:8000/docs`**:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & model status |
| `GET` | `/api/model/status` | Model architecture, input channels (`1`), and device |
| `GET` | `/api/overview/stats` | Aggregated surveillance telemetry & recent sessions |
| `POST` | `/api/detect/image` | Base64-encoded image thermal pedestrian inference |
| `POST` | `/api/detect/image-file` | File-based thermal pedestrian inference |
| `POST` | `/api/detect/images-batch` | Batch multi-image thermal pedestrian inference |
| `POST` | `/api/detect/video` | Asynchronous thermal video processing job |
| `GET` | `/api/detect/video/{id}/status` | Video job progress, frame counters & live metrics |
| `GET` | `/api/history` | Fetches archived incident events & sessions |
| `POST` | `/api/history/snapshot` | Saves an evidentiary snapshot to the database |
| `DELETE` | `/api/history/{id}` | Deletes an individual history event |
| `DELETE` | `/api/history` | Clears all detection sessions and event records |

---

## 🔬 Model Specifications

- **Architecture:** YOLOv8n (Adapted 1-Channel)
- **Input Channels:** 1 (Grayscale / Long-Wave Infrared)
- **First Convolutional Layer:** `Conv2d(1, 16, kernel_size=(3, 3), stride=(2, 2), padding=(1, 1))`
- **Target Class:** `person` (Pedestrian Detection)
- **Training Dataset:** FLIR Thermal Dataset (26,061 frames)
- **Tracking:** ByteTrack with spatial centroid association
- **Output Encoding:** Browser-compatible H.264 (AVC1) MP4 with FastStart
