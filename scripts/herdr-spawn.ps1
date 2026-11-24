<#
.SYNOPSIS
  Helper script to spawn an agent tab in Herdr workspace with RightHand persona.

.DESCRIPTION
  Creates a new Herdr tab in the specified workspace with a standardized label
  '<role>-<ticket>', prepares a ticket-numbered git worktree for writer roles
  via Herdr (never an in-repo worktree directory), and starts Command Code with
  the requested persona.

.PARAMETER Workspace
  Herdr workspace ID (e.g. w1, w2)

.PARAMETER Role
  Profile persona name (e.g. palm, index, pinky, thumb, ring, middle). Legacy names
  such as backend, worker, or code-reviewer still resolve to their canonical persona.

.PARAMETER Ticket
  Ticket identifier (e.g. T1, T2, T3)

.PARAMETER Description
  Short slug for ticket/worktree (e.g. auth-api, login-ui)

.EXAMPLE
  .\scripts\herdr-spawn.ps1 -Workspace "w1" -Role "thumb" -Ticket "T1" -Description "auth-api"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$Workspace,

    [Parameter(Mandatory=$true)]
    [string]$Role,

    [Parameter(Mandatory=$false)]
    [string]$Ticket = "",

    [Parameter(Mandatory=$false)]
    [string]$Description = ""
)

# Canonical writers first, then the legacy names that resolve onto them, so an
# un-migrated invocation still gets its worktree lane.
$WriterRoles = @('thumb', 'ring', 'backend', 'frontend', 'devops', 'worker')
$IsWriter = $WriterRoles -contains $Role.ToLower()

$Label = if ($Ticket) { "$Role-$Ticket" } else { $Role }

Write-Host "==> Creating Herdr tab in workspace '$Workspace' with label '$Label'..." -ForegroundColor Cyan

# 1. Prepare worktree if writer role (Herdr-managed lane, never an in-repo worktree dir)
$WorkDir = "."
if ($IsWriter -and $Ticket) {
    $Slug = if ($Description) { "$Ticket-$Description" } else { "$Ticket-$Role" }
    $BranchName = $Slug
    $MainCheckout = (Get-Location).Path
    $Base = "main"
    try {
        $detected = (git -C $MainCheckout symbolic-ref refs/remotes/origin/HEAD 2>$null)
        if ($detected) { $Base = $detected.Trim() -replace '^refs/remotes/origin/', '' }
    } catch { }
    if (-not $Base) { $Base = "main" }

    Write-Host "==> Creating Herdr lane (branch: $BranchName, base: $Base)..." -ForegroundColor Yellow
    $JsonOutput = herdr worktree create --cwd $MainCheckout --branch $BranchName --base $Base --label "$Label" --no-focus
    $LanePath = ($JsonOutput | ConvertFrom-Json).worktree.path
    if (-not $LanePath) { throw "Herdr did not return a worktree path." }
    $WorkDir = $LanePath
}

# 2. Spawn Herdr tab
Write-Host "==> Executing: herdr tab create --workspace $Workspace --label $Label" -ForegroundColor Green
herdr tab create --workspace $Workspace --label $Label

Write-Host "==> Success! In the new tab, run:" -ForegroundColor Green
Write-Host "    cd $WorkDir; cmdc --mod-option default=$Role" -ForegroundColor White
