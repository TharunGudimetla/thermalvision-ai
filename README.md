# ThermalVision AI – Thermal & Infrared Pedestrian Detection System

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg)](https://tailwindcss.com/)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-1--Channel%20Adapted-FF6F00.svg)](https://github.com/ultralytics/ultralytics)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An end-to-end, full-stack thermal surveillance dashboard and inference engine adapted for **1-Channel Long-Wave Infrared (LWIR) Pedestrian Detection and Tracking** using a customized YOLOv8 model architecture trained on the **FLIR Thermal Dataset (26,061 frames)**.

---

## 🌟 Key Capabilities & Architecture

### 1. 🎛️ Overview & Telemetry Dashboard
- **Hardware & Model Telemetry:** Real-time health monitoring of the 1-channel YOLOv8 model, CPU/CUDA device allocation, and FLIR dataset metrics.
- **Aggregated Analytics:** Live counters for total videos analyzed, unique pedestrian identities, total frames processed, and peak detection confidence.
- **Input Evidence Folders:** Clean, square-box medium folder icon grid displaying analyzed inputs with cover thumbnails, pedestrian counts, and instant frame inspection.
- **Automatic Deduplication:** Automatically overwrites repeat uploads for the same media file to eliminate duplicate history records.

### 2. 📹 Video Analyzer & Adaptive Tracking
- **Multi-Format Ingestion:** Drag-and-drop support for thermal surveillance formats: `MP4`, `AVI`, `MOV`, `MKV`, `WEBM`, `FLV`, `WMV`, and `TS`.
- **High-Performance Inference:** Adaptive frame stride and optimized ByteTrack identity tracking delivering **2x–3x faster** inference on CPU/GPU.
- **Interactive Scrubber:** Synchronized video player with timeline scrubber, play/pause, replay, and frame-accurate navigation.
- **Evidentiary Snapshot & Forensic Dossier:** Automatic extraction of peak detection keyframes and one-click JSON incident dossier export.
- **Bottom Keyframe Gallery:** Interactive thumbnails displaying extracted detection frames with confidence badges and timeline seek triggers.

### 3. 🖼️ Image & Batch Analyzer
- **Dual Modality Analysis:** Supports both single-image analysis and multi-file batch uploads (`JPG`, `PNG`, `WEBM`, `TIFF`).
- **Side-by-Side Comparison:** Interactive view toggles between *Side-by-Side*, *Annotated Only*, and *Original Thermal*.
- **Bounding Boxes & IoU Badges:** Renders neon cyan target brackets, confidence scores, and IoU overlap indicators.

### 4. 🔴 Live Stream / Camera Monitor
- **Real-Time Grayscale Matrix Conversion:** Converts incoming camera feeds to single-channel luminance matrices.
- **On-Screen Heads-Up Display (HUD):** Active pedestrian target counters, real-time FPS counter, and inference latency in milliseconds (`ms`).
- **Forensic Snapshot Capture:** Instantly captures and logs evidentiary frames into the persistent SQLite database.

### 5. 🗄️ Forensic Detection Vault (History)
- **Organized Evidence Folders:** Grouped upload-wise by video session and image batch.
- **Comprehensive Dossiers:** Search, filter, inspect enlarged frames, download annotated MP4 videos, and export forensic JSON reports.

---

## 📂 Project Structure

```
thermalvision-ai/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI server, REST routes, static file serving & SPA fallback
│   │   ├── model_loader.py      # Custom 1-channel YOLOv8 engine & preprocessing
│   │   ├── video_processor.py   # Asynchronous video inference, ByteTrack & H.264 writer
│   │   └── database.py          # SQLite database storage & session deduplication
│   ├── data/                    # Persistent SQLite database (surveillance.db)
│   └── models/
│       └── best.pt              # Trained 1-channel YOLOv8 checkpoint
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx           # Surveillance navigation header
│   │   │   ├── Overview.tsx         # Dashboard stats & evidence folder view
│   │   │   ├── VideoAnalyzer.tsx    # Video player, scrubber & keyframes gallery
│   │   │   ├── ImageAnalyzer.tsx    # Single/batch image thermal detection
│   │   │   ├── LiveMonitor.tsx      # Real-time camera feed & HUD
│   │   │   └── DetectionHistory.tsx # Incident vault & frame explorer
│   │   ├── services/api.ts          # Unified REST API client (dynamic relative routing)
│   │   ├── types/index.ts           # TypeScript interfaces
│   │   ├── App.tsx                  # Root application state & navigation
│   │   └── index.css                # Cyber surveillance Tailwind v4 styling
│   ├── dist/                        # Pre-built production frontend bundle
│   └── vite.config.ts               # Vite bundler configuration & API proxy
├── run_app.py                   # Python one-click application launcher
├── start_app.bat                # Windows double-click startup batch script
├── requirements.txt             # Backend Python dependencies
└── README.md                    # Project documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm** (for frontend development)

### 1. Clone the Repository
```bash
git clone https://github.com/TharunGudimetla/thermalvision-ai.git
cd thermalvision-ai
```

### 2. Install Dependencies
```bash
# Backend dependencies
pip install -r requirements.txt

# Frontend dependencies (optional for dev)
cd frontend
npm install
cd ..
```

### 3. One-Click Launch (Recommended)
On Windows, double-click **`start_app.bat`** or run:
```powershell
python run_app.py
```
This automatically initializes the backend, serves the bundled frontend on **Port 8000**, and opens your browser at **`http://localhost:8000`**.

---

## 🛠️ Development Mode (With Hot Reload)

If you are developing and modifying React components with Vite Hot-Module Replacement (HMR):

**Terminal 1 — Backend:**
```powershell
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```powershell
cd frontend
npm run dev
```
Open **`http://localhost:5173`** in your browser (Vite automatically proxies `/api` calls to port 8000).

---

## 🌐 Network & Remote Sharing

### 1. VS Code Port Forwarding (Easiest)
1. Open the **PORTS** tab in the bottom panel of VS Code.
2. Forward Port **`8000`**.
3. Right-click the forwarded port and set **Port Visibility** to **Public**.
4. Share the generated HTTPS link with your team or collaborator. Both the UI and YOLOv8 inference will work out-of-the-box.

### 2. Local Wi-Fi / LAN
Because the server binds to `0.0.0.0:8000`, any device on the same local network can access the application directly via your machine's local IP:
```
http://<your-local-ip>:8000
```

---

## 📡 REST API Reference

Interactive Swagger documentation is available at **`http://localhost:8000/docs`**:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status & model loading state |
| `GET` | `/api/model/status` | Model architecture, input channels, and active device |
| `GET` | `/api/overview/stats` | Aggregated surveillance telemetry & recent sessions |
| `POST` | `/api/detect/image` | Base64-encoded image thermal pedestrian inference |
| `POST` | `/api/detect/image-file` | Multipart file thermal pedestrian inference |
| `POST` | `/api/detect/images-batch` | Batch multi-image thermal pedestrian inference |
| `POST` | `/api/detect/video` | Asynchronous background thermal video processing |
| `GET` | `/api/detect/video/{id}/status` | Video job progress, frame counter & active detections |
| `GET` | `/api/history` | Retrieves all archived incident dossiers |
| `POST` | `/api/history/snapshot` | Logs evidentiary snapshot into database |
| `DELETE` | `/api/history/{id}` | Deletes a single incident record |
| `DELETE` | `/api/history` | Purges all detection sessions & event archives |

---

## 🔬 Model Specifications

| Parameter | Specification |
|---|---|
| **Base Architecture** | YOLOv8n (Adapted Single-Channel) |
| **Input Channels** | 1 (Grayscale / Long-Wave Infrared Luminance) |
| **Layer 0 Conv** | `Conv2d(1, 16, kernel_size=(3, 3), stride=(2, 2), padding=(1, 1))` |
| **Target Class** | `person` (ID 0) |
| **Training Dataset** | FLIR Thermal Surveillance Dataset (26,061 annotated frames) |
| **Tracking Engine** | ByteTrack with spatial centroid association |
| **Video Encoding** | H.264 (AVC1) Web-Compatible MP4 with FastStart |

---

## 📄 License
This project is open-source and licensed under the [MIT License](LICENSE).
