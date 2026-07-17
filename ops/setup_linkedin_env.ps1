<#
  setup_linkedin_env.ps1 — one-time LinkedIn autopost enablement.

  Run in a NORMAL PowerShell window (it prompts interactively; secrets are
  masked and never echoed):
      powershell -NoProfile -ExecutionPolicy Bypass -File ops\setup_linkedin_env.ps1

  Prerequisites (LinkedIn side — only a page admin can do this, see
  pipeline\LINKEDIN_SETUP.md for details):
    * LinkedIn app associated with the PyMasters company page
    * "Community Management API" product added (w_organization_social scope)
    * Client ID + Client Secret from the app's Auth tab
    * A refresh token (and optionally a current access token) from the OAuth flow
    * The page URN id from linkedin.com/company/<id>/admin/

  Sets User-scope env vars read by the 06:30 pipeline; the poster caches and
  auto-refreshes tokens in pipeline\.linkedin_tokens.json (gitignored).
#>
$ErrorActionPreference = 'Stop'

function Read-Secret([string]$label) {
    $sec = Read-Host $label -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$orgId = Read-Host 'Company page id (digits from linkedin.com/company/<id>/admin/)'
if ($orgId -notmatch '^\d+$') { throw 'Page id must be digits only' }
$clientId     = Read-Host   'LINKEDIN_CLIENT_ID'
$clientSecret = Read-Secret 'LINKEDIN_CLIENT_SECRET (hidden)'
$refreshTok   = Read-Secret 'LINKEDIN_REFRESH_TOKEN (hidden)'
$accessTok    = Read-Secret 'LINKEDIN_ACCESS_TOKEN (hidden, optional - Enter to skip)'

[Environment]::SetEnvironmentVariable('LINKEDIN_AUTOPOST', '1', 'User')
[Environment]::SetEnvironmentVariable('LINKEDIN_ORG_URN', "urn:li:organization:$orgId", 'User')
[Environment]::SetEnvironmentVariable('LINKEDIN_CLIENT_ID', $clientId, 'User')
[Environment]::SetEnvironmentVariable('LINKEDIN_CLIENT_SECRET', $clientSecret, 'User')
[Environment]::SetEnvironmentVariable('LINKEDIN_REFRESH_TOKEN', $refreshTok, 'User')
if ($accessTok) { [Environment]::SetEnvironmentVariable('LINKEDIN_ACCESS_TOKEN', $accessTok, 'User') }

Write-Host ''
Write-Host 'Env vars set (User scope): LINKEDIN_AUTOPOST=1, LINKEDIN_ORG_URN, CLIENT_ID/SECRET, REFRESH_TOKEN' + $(if ($accessTok) { ', ACCESS_TOKEN' })
Write-Host 'The 06:30 pipeline will now auto-post daily.'
Write-Host 'To post today''s (already cleaned) draft right now, in a NEW shell run:'
Write-Host '    cd C:\Users\muthu.MSG\PycharmProjects\PyMasters'
Write-Host '    C:\Users\muthu.MSG\AppData\Local\Programs\Python\Python312\python.exe pipeline\post_now.py'
