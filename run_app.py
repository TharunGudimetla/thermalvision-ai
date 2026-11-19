"""
One-click application launcher for Thermal Pedestrian Detection Surveillance System.
Starts the FastAPI backend (which also serves the frontend build) and opens your browser.
"""

import sys
import os
import time
import socket
import webbrowser
import subprocess

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex((host, port)) == 0

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)

    print("=" * 65)
    print("  Thermal & Infrared Pedestrian Detection Surveillance System")
    print("=" * 65)
    
    port = 8000
    host = "127.0.0.1"
    url = f"http://{host}:{port}"

    if is_port_in_use(port, host):
        print(f"\n[INFO] Inference server is already running at {url}")
        print(f"[INFO] Opening application in your web browser...")
        webbrowser.open(url)
        return

    print(f"\n[INFO] Starting Uvicorn backend server on {host}:{port}...")
    cmd = [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", host, "--port", str(port)]
    
    # Launch uvicorn
    proc = subprocess.Popen(cmd)
    
    # Wait for server to become responsive
    max_wait = 15
    started = False
    for i in range(max_wait):
        if is_port_in_use(port, host):
            started = True
            break
        time.sleep(1.0)
        print(f"Waiting for backend to initialize ({i+1}/{max_wait}s)...")

    if started:
        print(f"\n[SUCCESS] Application is online at {url}")
        print("[SUCCESS] Opening in default browser...")
        webbrowser.open(url)
        print("\nPress Ctrl+C at any time to stop the server.")
        try:
            proc.wait()
        except KeyboardInterrupt:
            print("\nShutting down backend server...")
            proc.terminate()
            proc.wait()
    else:
        print("\n[ERROR] Failed to start server within timeout. Please check error logs.")
        proc.terminate()

if __name__ == "__main__":
    main()
