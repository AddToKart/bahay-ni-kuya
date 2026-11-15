# Bahay ni Kuya adapter for codex-cli hooks (verified against codex-cli 0.166.0).
#
# Codex runs this per hook event and pipes the hook payload as JSON on stdin. Every failure is
# swallowed: the script always exits 0 and never writes to stdout (stdout is a hook protocol
# channel, and Bahay ni Kuya is an observer, not a gate).
#
# Payload fields observed in the codex binary: transcript_path, cwd, hook_event_name,
# permission_mode, agent_transcript_path, stop_hook_active, last_assistant_message, prompt,
# tool_name, tool_input. There is no session_id field, so the session id is derived from the
# transcript file name (stable for the life of the thread).

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

function Clip-Value([object]$Value, [int]$Max) {
  if ($null -eq $Value) { return $null }
  $text = [string]$Value
  $text = $text.Trim()
  if ($text.Length -eq 0) { return $null }
  if ($text.Length -gt $Max) { return $text.Substring(0, $Max) }
  return $text
}

function Get-SessionIdFromPath([object]$Path) {
  if ($null -eq $Path) { return $null }
  $text = [string]$Path
  if ($text.Trim().Length -eq 0) { return $null }
  try {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($text)
    if ($name -and $name.Trim().Length -gt 0) { return $name.Trim() }
  } catch { }
  return $null
}

try {
  $raw = [Console]::In.ReadToEnd()
  if (-not $raw -or $raw.Trim().Length -eq 0) { exit 0 }
  $payload = $raw | ConvertFrom-Json
  if (-not $payload) { exit 0 }

  $hook = [string]$payload.hook_event_name
  if (-not $hook) { exit 0 }

  $sessionId = Get-SessionIdFromPath $payload.transcript_path
  $directory = Clip-Value $payload.cwd 200

  $endpoint = [string]$env:BAHAY_NI_KUYA_URL
  if (-not $endpoint -or $endpoint.Trim().Length -eq 0) { $endpoint = 'http://127.0.0.1:4777/event' }
  $endpoint = $endpoint.Trim().TrimEnd('/')

  $events = @()
  $tool = Clip-Value $payload.tool_name 60

  switch ($hook) {
    'SessionStart' {
      $events += @{ type = 'session_start'; state = 'idle'; sessionId = $sessionId; directory = $directory }
    }
    'UserPromptSubmit' {
      $events += @{
        type = 'state'; state = 'working'; sessionId = $sessionId; directory = $directory
        title = (Clip-Value $payload.prompt 80)
      }
    }
    'PreToolUse' {
      $events += @{ type = 'tool'; state = 'working'; sessionId = $sessionId; tool = $tool; directory = $directory }
    }
    'PostToolUse' {
      $events += @{ type = 'tool'; state = 'working'; sessionId = $sessionId; tool = $tool; directory = $directory }
    }
    'PermissionRequest' {
      # Permissions are not modelled in Bahay ni Kuya; keep the character working.
      $events += @{ type = 'tool'; state = 'working'; sessionId = $sessionId; tool = $tool; directory = $directory }
    }
    'Stop' {
      $events += @{ type = 'state'; state = 'idle'; sessionId = $sessionId; directory = $directory }
    }
    'Interrupt' {
      $events += @{ type = 'state'; state = 'idle'; sessionId = $sessionId; directory = $directory }
    }
    'SessionEnd' {
      $events += @{ type = 'session_end'; sessionId = $sessionId }
    }
    'SubagentStart' {
      $child = Get-SessionIdFromPath $payload.agent_transcript_path
      if (-not $child) { $child = 'sub-' + [string]$sessionId }
      if ($child -and $child -ne 'sub-') {
        $events += @{
          type = 'session_start'; state = 'working'; sessionId = $child
          parentSessionId = $sessionId; directory = $directory
          title = (Clip-Value $payload.last_assistant_message 80)
        }
      }
    }
    'SubagentStop' {
      $child = Get-SessionIdFromPath $payload.agent_transcript_path
      if (-not $child) { $child = 'sub-' + [string]$sessionId }
      if ($child -and $child -ne 'sub-') {
        $events += @{ type = 'session_end'; sessionId = $child }
      }
    }
    default {
      if ($sessionId) { $events += @{ type = 'state'; state = 'working'; sessionId = $sessionId; directory = $directory } }
    }
  }

  foreach ($event in $events) {
    try {
      if (-not $event.sessionId) { continue }
      $event['harness'] = 'codex'
      $body = $event | ConvertTo-Json -Compress -Depth 4
      Invoke-RestMethod -Method Post -Uri $endpoint -ContentType 'application/json' -Body $body -TimeoutSec 1 | Out-Null
    } catch {
      # silent drop: Bahay ni Kuya being down must never disturb codex
    }
  }
} catch {
  # malformed payload / missing stdin: still a no-op for codex
}

exit 0
