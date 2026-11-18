#!/usr/bin/env python3
"""Create private loopback-only PostgreSQL development databases."""
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

mobile = Path(__file__).resolve().parents[1]
state = mobile / ".local" / "guest-dev.json"
if state.exists():
    print("Local database configuration already exists; retaining its data.")
    raise SystemExit(0)
pg_config = shutil.which("pg_config")
if not pg_config:
    raise SystemExit("Install PostgreSQL tools first (pg_config/initdb/pg_ctl/createdb).")
pg = Path(subprocess.check_output([pg_config, "--bindir"], text=True).strip())
root = Path(tempfile.mkdtemp(prefix="seatmap-guest-development-"))
with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
subprocess.run([str(pg / "initdb"), "-D", str(root / "data"), "-U", "seatmap_dev", "--auth=trust", "--encoding=UTF8", "--no-locale"], check=True, stdout=subprocess.DEVNULL)
subprocess.run([str(pg / "pg_ctl"), "-D", str(root / "data"), "-l", str(root / "postgres.log"), "-o", f"-p {port} -h 127.0.0.1 -k {root}", "start"], check=True)
for database in ("seatmap_guest_dev", "seatmap_guest_checks", "seatmap_restaurant_dev"):
    subprocess.run([str(pg / "createdb"), "-h", "127.0.0.1", "-p", str(port), "-U", "seatmap_dev", database], check=True)
state.parent.mkdir(exist_ok=True)
state.write_text(json.dumps({"root": str(root), "port": port, "api": "http://127.0.0.1:5289"}))
print(f"Development databases ready on 127.0.0.1:{port}. Run python3 tool/run_guest_dev.py.")
