import sqlite3
import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_DIR = Path("backend/data")
DB_PATH = DB_DIR / "surveillance.db"

def get_connection():
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Table for individual evidentiary frame captures
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS detection_events (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        filename TEXT NOT NULL,
        frame_number INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        pedestrians_count INTEGER NOT NULL,
        confidence REAL NOT NULL,
        snapshot_url TEXT NOT NULL,
        processed_video_url TEXT,
        unique_pedestrians INTEGER DEFAULT 0
    )
    """)

    # Table for video analysis sessions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_sessions (
        job_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        total_frames INTEGER NOT NULL,
        pedestrian_detections INTEGER NOT NULL,
        peak_confidence REAL NOT NULL,
        snapshot_url TEXT,
        processed_video_url TEXT,
        unique_pedestrians INTEGER DEFAULT 0
    )
    """)

    # Automatic column migration if database already exists
    try:
        cursor.execute("ALTER TABLE video_sessions ADD COLUMN unique_pedestrians INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # Column already exists

    try:
        cursor.execute("ALTER TABLE detection_events ADD COLUMN unique_pedestrians INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()

def remove_existing_entries_for_filename(filename: str, current_job_id: Optional[str] = None):
    """If inputs with this filename already exist in the database, delete old records so new data overwrites them."""
    import re
    from pathlib import Path
    conn = get_connection()
    cursor = conn.cursor()
    norm_target = re.sub(r'[\s_\-]+', ' ', Path(filename).name).strip().lower()

    # Query candidate sessions to remove matching by exact or normalized filename
    cursor.execute("SELECT job_id, filename FROM video_sessions")
    all_sessions = cursor.fetchall()
    jobs_to_remove = []
    for row in all_sessions:
        jid, fname = row[0], row[1]
        if current_job_id and jid == current_job_id:
            continue
        if fname == filename or re.sub(r'[\s_\-]+', ' ', Path(fname).name).strip().lower() == norm_target:
            jobs_to_remove.append(jid)

    for jid in jobs_to_remove:
        cursor.execute("DELETE FROM detection_events WHERE job_id = ?", (jid,))
        cursor.execute("DELETE FROM video_sessions WHERE job_id = ?", (jid,))

    # Also delete any non-job events matching filename
    cursor.execute("DELETE FROM detection_events WHERE (job_id IS NULL OR job_id = '') AND filename = ?", (filename,))
    conn.commit()
    conn.close()

def add_detection_event(
    event_id: str,
    job_id: Optional[str],
    filename: str,
    frame_number: int,
    pedestrians_count: int,
    confidence: float,
    snapshot_url: str,
    processed_video_url: Optional[str] = None,
    timestamp: Optional[str] = None,
    unique_pedestrians: int = 0
):
    if not timestamp:
        timestamp = datetime.now().isoformat()

    # Overwrite prior sessions for this same filename
    remove_existing_entries_for_filename(filename, current_job_id=job_id)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO detection_events (id, job_id, filename, frame_number, timestamp, pedestrians_count, confidence, snapshot_url, processed_video_url, unique_pedestrians)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (event_id, job_id, filename, frame_number, timestamp, pedestrians_count, confidence, snapshot_url, processed_video_url, unique_pedestrians))
    conn.commit()
    conn.close()

def add_video_session(
    job_id: str,
    filename: str,
    total_frames: int,
    pedestrian_detections: int,
    peak_confidence: float,
    snapshot_url: Optional[str] = None,
    processed_video_url: Optional[str] = None,
    timestamp: Optional[str] = None,
    unique_pedestrians: int = 0
):
    if not timestamp:
        timestamp = datetime.now().isoformat()

    # Overwrite prior sessions for this same filename
    remove_existing_entries_for_filename(filename, current_job_id=job_id)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO video_sessions (job_id, filename, timestamp, total_frames, pedestrian_detections, peak_confidence, snapshot_url, processed_video_url, unique_pedestrians)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (job_id, filename, timestamp, total_frames, pedestrian_detections, peak_confidence, snapshot_url, processed_video_url, unique_pedestrians))
    conn.commit()
    conn.close()

def get_all_events(limit: int = 100) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, job_id, filename, frame_number, timestamp, pedestrians_count, confidence, snapshot_url, processed_video_url, unique_pedestrians
    FROM detection_events
    ORDER BY timestamp DESC
    LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_event(event_id: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detection_events WHERE id = ?", (event_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def clear_all_events() -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detection_events")
    cursor.execute("DELETE FROM video_sessions")
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return count

def get_overview_stats() -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM video_sessions")
    total_videos = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(pedestrian_detections), 0) FROM video_sessions")
    total_pedestrians = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(unique_pedestrians), 0) FROM video_sessions")
    total_unique_pedestrians = cursor.fetchone()[0]

    # Also count live snapshot events if any
    cursor.execute("SELECT COALESCE(SUM(pedestrians_count), 0) FROM detection_events WHERE job_id IS NULL OR job_id = ''")
    live_pedestrians = cursor.fetchone()[0]
    total_pedestrians += live_pedestrians

    cursor.execute("SELECT COALESCE(SUM(total_frames), 0) FROM video_sessions")
    total_frames = cursor.fetchone()[0]

    cursor.execute("""
    SELECT job_id, filename, timestamp, total_frames, pedestrian_detections, peak_confidence, snapshot_url, processed_video_url, unique_pedestrians
    FROM video_sessions
    ORDER BY timestamp DESC
    """)
    all_sessions = [dict(r) for r in cursor.fetchall()]

    import re
    from pathlib import Path
    seen_names = set()
    recent_sessions = []
    for s in all_sessions:
        norm = re.sub(r'[\s_\-]+', ' ', Path(s['filename']).name).strip().lower()
        if norm not in seen_names:
            seen_names.add(norm)
            recent_sessions.append(s)
            if len(recent_sessions) >= 5:
                break

    conn.close()
    return {
        "total_videos_analyzed": total_videos,
        "total_pedestrian_detections": total_pedestrians,
        "total_unique_pedestrians": total_unique_pedestrians,
        "total_frames_processed": total_frames,
        "recent_sessions": recent_sessions
    }
