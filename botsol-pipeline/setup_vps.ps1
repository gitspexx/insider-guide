# ═══════════════════════════════════════════════════════════
# Botsol Pipeline — VPS Setup Script (Windows Server 2025)
# Run this script as Administrator on the Contabo VPS
# ═══════════════════════════════════════════════════════════

Write-Host "═══ Botsol Pipeline Setup ═══" -ForegroundColor Cyan

# 1. Create folder structure
Write-Host "`n[1/6] Creating folders..." -ForegroundColor Yellow
$folders = @(
    "C:\Botsol",
    "C:\Botsol\input",
    "C:\Botsol\output",
    "C:\Botsol\archive",
    "C:\Botsol\pipeline"
)
foreach ($f in $folders) {
    New-Item -ItemType Directory -Force -Path $f | Out-Null
    Write-Host "  Created: $f"
}

# 2. Install Python
Write-Host "`n[2/6] Installing Python..." -ForegroundColor Yellow
$pythonInstaller = "C:\Botsol\python-installer.exe"
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "  Downloading Python 3.12..."
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe" -OutFile $pythonInstaller
    Write-Host "  Installing..."
    Start-Process -FilePath $pythonInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait
    Write-Host "  Python installed!"
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
} else {
    Write-Host "  Python already installed: $(python --version)"
}

# 3. Install Python dependencies
Write-Host "`n[3/6] Installing Python packages..." -ForegroundColor Yellow
python -m pip install --upgrade pip
python -m pip install requests

# 4. Set environment variables
Write-Host "`n[4/6] Setting environment variables..." -ForegroundColor Yellow
$envVars = @{
    "SUPABASE_URL"         = "https://qbzmsvfphpfgnlztskma.supabase.co"
    "SUPABASE_SERVICE_KEY" = "PASTE_YOUR_SERVICE_KEY_HERE"
    "BOTSOL_INPUT"         = "C:\Botsol\input"
    "BOTSOL_OUTPUT"        = "C:\Botsol\output"
    "ARCHIVE_FOLDER"       = "C:\Botsol\archive"
    "QUEUE_FILE"           = "C:\Botsol\queue.json"
    "STATUS_FILE"          = "C:\Botsol\status.json"
    "API_KEY"              = "spexx-botsol-2026"
}
foreach ($key in $envVars.Keys) {
    [System.Environment]::SetEnvironmentVariable($key, $envVars[$key], "Machine")
    Write-Host "  Set: $key"
}

# 5. Create initial queue
Write-Host "`n[5/6] Creating initial queue..." -ForegroundColor Yellow
$queue = @("colombia", "brazil", "guatemala") | ConvertTo-Json
Set-Content -Path "C:\Botsol\queue.json" -Value $queue
Write-Host "  Queue: colombia, brazil, guatemala"

# 6. Create Windows Task Scheduler jobs
Write-Host "`n[6/6] Creating Task Scheduler jobs..." -ForegroundColor Yellow

# Remote API — runs on startup, always on
$apiAction = New-ScheduledTaskAction -Execute "python" -Argument "C:\Botsol\pipeline\remote_api.py" -WorkingDirectory "C:\Botsol\pipeline"
$apiTrigger = New-ScheduledTaskTrigger -AtStartup
$apiSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "Botsol-RemoteAPI" -Action $apiAction -Trigger $apiTrigger -Settings $apiSettings -User "SYSTEM" -RunLevel Highest -Force
Write-Host "  Created: Botsol-RemoteAPI (runs at startup)"

# CSV Watcher — runs on startup, always on
$watchAction = New-ScheduledTaskAction -Execute "python" -Argument "C:\Botsol\pipeline\csv_processor.py watch" -WorkingDirectory "C:\Botsol\pipeline"
$watchTrigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "Botsol-CSVWatcher" -Action $watchAction -Trigger $watchTrigger -Settings $apiSettings -User "SYSTEM" -RunLevel Highest -Force
Write-Host "  Created: Botsol-CSVWatcher (runs at startup)"

# Email Verifier — runs daily at 6 AM
$verifyAction = New-ScheduledTaskAction -Execute "python" -Argument "C:\Botsol\pipeline\email_verifier.py" -WorkingDirectory "C:\Botsol\pipeline"
$verifyTrigger = New-ScheduledTaskTrigger -Daily -At "06:00"
Register-ScheduledTask -TaskName "Botsol-EmailVerifier" -Action $verifyAction -Trigger $verifyTrigger -User "SYSTEM" -RunLevel Highest -Force
Write-Host "  Created: Botsol-EmailVerifier (daily 6 AM)"

Write-Host "`n═══ Setup Complete! ═══" -ForegroundColor Green
Write-Host @"

Next steps:
1. Install Botsol from the MSI: C:\Botsol\Botsol-Scraper-14.2.msi
2. Activate with license: 94D17181BD54
3. Activate text file search: 5B917AA7C3A0
4. Configure Botsol to read keywords from: C:\Botsol\input\keywords.txt
5. Configure Botsol to output CSV to: C:\Botsol\output\
6. Update SUPABASE_SERVICE_KEY in System Environment Variables
7. Copy pipeline scripts to C:\Botsol\pipeline\
8. Open firewall port 8899 for remote API
9. Restart the server

Remote API will be at: http://<VPS-IP>:8899
  GET  /status  — Check pipeline status
  POST /scrape  — Start: {"country": "colombia"}
  POST /queue   — Add: {"countries": ["peru", "mexico"]}
  Header: X-Api-Key: spexx-botsol-2026
"@
