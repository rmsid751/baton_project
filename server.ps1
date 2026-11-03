# BATON local dev server (Windows PowerShell 5.1, no Node needed)
# - Serves the static SPA from this folder
# - POST /api/ai proxies to Gemini (non-streaming) using GEMINI_API_KEY
#   from the environment or from .env.local (GEMINI_API_KEY=...)
param([int]$Port = 5173)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$utf8 = New-Object System.Text.UTF8Encoding($false)

$envFile = Join-Path $root '.env.local'
if (Test-Path $envFile) {
  foreach ($line in [IO.File]::ReadAllLines($envFile, $utf8)) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
  }
}
$prompts = [IO.File]::ReadAllText((Join-Path $root 'api\_prompts.json'), $utf8) | ConvertFrom-Json
# Models are tried in order. On the free tier each model has its own small daily quota
# (e.g. 20 requests/day), so when one returns 429/503/404 the next one is used.
# gemini-2.5-flash is no longer offered to new keys (404). Override with GEMINI_MODEL=a,b,c
$modelList = if ($env:GEMINI_MODEL) { $env:GEMINI_MODEL } else { 'gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.5-flash' }
$models = @($modelList -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$model = $models -join ' > '

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.webp' = 'image/webp'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'
}

function Send($ctx, [int]$status, [string]$type, [byte[]]$bytes) {
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = $type
  $ctx.Response.Headers['Cache-Control'] = 'no-store'
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Invoke-Gemini($kind, $inputText) {
  $key = $env:GEMINI_API_KEY
  if (-not $key) { throw 'GEMINI_API_KEY is not set' }
  $system = $prompts.$kind
  if (-not $system) { throw 'unknown kind' }
  $payload = @{
    systemInstruction = @{ parts = @(@{ text = $system }) }
    contents = @(@{ role = 'user'; parts = @(@{ text = $inputText }) })
    generationConfig = @{ temperature = 0.3; maxOutputTokens = 2048 }
  } | ConvertTo-Json -Depth 10 -Compress
  $lastError = 'no model'
  $sawQuota = $false
  foreach ($m in $models) {
    try {
      $wc = New-Object Net.WebClient
      $wc.Encoding = $utf8
      $wc.Headers.Add('Content-Type', 'application/json')
      $wc.Headers.Add('x-goog-api-key', $key)
      $raw = $wc.UploadString("https://generativelanguage.googleapis.com/v1beta/models/$($m):generateContent", $payload)
      $json = $raw | ConvertFrom-Json
      Write-Host "AI ok: $m"
      # skip "thought" parts that thinking models may return
      return (($json.candidates[0].content.parts | Where-Object { -not $_.thought } | ForEach-Object { $_.text }) -join '')
    } catch [Net.WebException] {
      $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
      $lastError = "$m -> $code"
      if ($code -eq 429) { $sawQuota = $true }
      Write-Host "AI fallback: $lastError"
      if ($code -notin 404, 429, 500, 503, 0) { throw }
    }
  }
  if ($sawQuota) { throw "QUOTA ($lastError)" }
  throw "all models failed ($lastError)"
}

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "BATON dev server: http://localhost:$Port/  (model: $model, key: $([bool]$env:GEMINI_API_KEY))"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/api/ai') {
      if ($ctx.Request.HttpMethod -ne 'POST') { Send $ctx 405 'text/plain' $utf8.GetBytes('POST only'); continue }
      $reader = New-Object IO.StreamReader($ctx.Request.InputStream, $utf8)
      $body = $reader.ReadToEnd() | ConvertFrom-Json
      if (-not $body.input -or $body.input.Length -gt 40000) { Send $ctx 400 'text/plain' $utf8.GetBytes('bad request'); continue }
      try {
        $text = Invoke-Gemini $body.kind $body.input
        Send $ctx 200 'text/plain; charset=utf-8' $utf8.GetBytes($text)
      } catch {
        Write-Host "AI error: $($_.Exception.Message)"
        $status = if ($_.Exception.Message -like 'QUOTA*') { 429 } else { 502 }
        Send $ctx $status 'text/plain; charset=utf-8' $utf8.GetBytes("AI error: $($_.Exception.Message)")
      }
      continue
    }
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
    if (-not $full.StartsWith($root) -or -not (Test-Path $full -PathType Leaf)) {
      Send $ctx 404 'text/plain' $utf8.GetBytes('not found'); continue
    }
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    Send $ctx 200 $type ([IO.File]::ReadAllBytes($full))
  } catch {
    Write-Host "error: $($_.Exception.Message)"
    try { Send $ctx 500 'text/plain' $utf8.GetBytes('server error') } catch {}
  } finally {
    $ctx.Response.Close()
  }
}
