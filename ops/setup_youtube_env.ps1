<#
  setup_youtube_env.ps1 — one-time YouTube upload enablement for the daily pipeline.

  Run this in a NORMAL PowerShell window (it prompts interactively):
      powershell -NoProfile -ExecutionPolicy Bypass -File ops\setup_youtube_env.ps1

  Prerequisite (done in the browser, ~2 clicks — the OAuth client itself):
    console.cloud.google.com/apis/credentials?project=pymasters-app
    → Create Credentials → OAuth client ID → Application type: Desktop app
    → Create → Download JSON.
  (If prompted to configure the consent screen first: External, add your own
   Google account under Test users, no scopes needed at this stage.)

  This script then:
    1. asks for the path of that downloaded client-secret JSON,
    2. copies it to a stable location outside Downloads,
    3. sets User-scope env vars the 06:30 pipeline reads,
    4. launches the one-time authorization (your browser opens — click Allow).
  The refresh token is cached by the tool at pipeline\.youtube_token.json
  (gitignored) and renews itself from then on.
#>
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\muthu.MSG\PycharmProjects\PyMasters'
$py   = 'C:\Users\muthu.MSG\AppData\Local\Programs\Python\Python312\python.exe'

$src = Read-Host 'Path to the downloaded client_secret*.json'
$src = $src.Trim('"')
if (-not (Test-Path $src)) { throw "File not found: $src" }

$destDir = Join-Path $env:USERPROFILE '.pymasters'
if (-not (Test-Path $destDir)) { New-Item -ItemType Directory $destDir | Out-Null }
$dest = Join-Path $destDir 'youtube_client_secret.json'
Copy-Item $src $dest -Force
Write-Host "Stored: $dest"

[Environment]::SetEnvironmentVariable('YOUTUBE_CLIENT_SECRETS_FILE', $dest, 'User')
[Environment]::SetEnvironmentVariable('YOUTUBE_UPLOAD', '1', 'User')
$priv = Read-Host 'Video privacy for a trial period? [unlisted/public] (default: unlisted)'
if (-not $priv) { $priv = 'unlisted' }
[Environment]::SetEnvironmentVariable('YOUTUBE_PRIVACY', $priv, 'User')
Write-Host "Env vars set (User scope): YOUTUBE_CLIENT_SECRETS_FILE, YOUTUBE_UPLOAD=1, YOUTUBE_PRIVACY=$priv"

# One-time interactive authorization + first upload — your browser opens;
# click Allow, then today's two videos upload at the privacy chosen above.
$env:YOUTUBE_CLIENT_SECRETS_FILE = $dest
$env:YOUTUBE_UPLOAD = '1'
$env:YOUTUBE_PRIVACY = $priv
Set-Location $repo
& $py -m pipeline.video.upload_youtube --date (Get-Date -Format 'yyyy-MM-dd')
Write-Host ''
Write-Host 'Done. The 06:30 pipeline will upload daily from now on.'
