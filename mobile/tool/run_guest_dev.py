#!/usr/bin/env python3
"""Start guest API against the explicitly created isolated local databases.

Requires mobile/.local/guest-dev.json (see docs/GUEST_ACCOUNTS.md).
Never reads production connection strings or uses remote database hosts.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess

mobile = Path(__file__).resolve().parents[1]
root = mobile.parent
state = json.loads((mobile / ".local" / "guest-dev.json").read_text())
port = int(state["port"])
if not 1024 <= port <= 65535:
    raise SystemExit("Invalid local database port")
pg_config = shutil.which("pg_config")
if not pg_config:
    raise SystemExit("PostgreSQL tools are required.")
pg = Path(subprocess.check_output([pg_config, "--bindir"], text=True).strip())
cluster = Path(state["root"])
if subprocess.run([str(pg / "pg_ctl"), "-D", str(cluster / "data"), "status"], stdout=subprocess.DEVNULL).returncode != 0:
    subprocess.run([str(pg / "pg_ctl"), "-D", str(cluster / "data"), "-l", str(cluster / "postgres.log"), "-o", f"-p {port} -h 127.0.0.1 -k {cluster}", "start"], check=True)
environment = dict(os.environ)
environment.update({
    "ASPNETCORE_ENVIRONMENT": "Development",
    "ASPNETCORE_URLS": "http://127.0.0.1:5289",
    "Platform__Enabled": "true",
    "Platform__FrontendOrigins__0": "http://127.0.0.1:5188",
    "ConnectionStrings__SeatMapPlatform": f"Host=127.0.0.1;Port={port};Database=seatmap_guest_dev;Username=seatmap_dev",
    "ConnectionStrings__DefaultConnection": f"Host=127.0.0.1;Port={port};Database=seatmap_restaurant_dev;Username=seatmap_dev",
    "Tenancy__MigrateOnStartup": "true",
    "Tenancy__Tenants__0__NotificationsEnabled": "false",
    "Tenancy__Tenants__0__ReservationConfirmationMode": "Automatic",
    "Tenancy__Tenants__0__SeedDefaultMenu": "false",
    "Logging__LogLevel__Default": "Warning",
})
configured_dotnet = environment.get("SEATMAP_DOTNET")
root_dotnet = Path(environment.get("DOTNET_ROOT", "")) / "dotnet"
dotnet = configured_dotnet or (str(root_dotnet) if root_dotnet.is_file() else shutil.which("dotnet"))
if not dotnet or int(subprocess.check_output([dotnet, "--version"], text=True).strip().split(".")[0]) < 8:
    raise SystemExit(".NET 8+ SDK required; set SEATMAP_DOTNET to its executable.")
project = root / "backend" / "SeatMap.Api"
subprocess.run([dotnet, "build", str(project)], env=environment, check=True)
dll = project / "bin" / "Debug" / "net8.0" / "SeatMap.Api.dll"
subprocess.run([dotnet, str(dll), "--MigratePlatform=true"], cwd=project, env=environment, check=True)
print("Guest development API: http://127.0.0.1:5289 (isolated local PostgreSQL)", flush=True)
os.chdir(project)
os.execve(dotnet, [dotnet, str(dll)], environment)
