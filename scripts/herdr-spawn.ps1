<#
.SYNOPSIS
  Helper script to spawn an agent tab in Herdr workspace with RightHand persona.

.DESCRIPTION
  Creates a new Herdr tab in the specified workspace with a standardized label
  '<role>-<ticket>', prepares a ticket-numbered git worktree for writer roles,
  and starts Command Code with the requested persona.

.PARAMETER Workspace
  Herdr workspace ID (e.g. w1, w2)

.PARAMETER Role
  Profile persona name (e.g. orchestrator, backend, frontend, worker, code-reviewer, test-engineer)

.PARAMETER Ticket
  Ticket identifier (e.g. T1, T2, T3)

.PARAMETER Description
  Short slug for ticket/worktree (e.g. auth-api, login-ui)

.EXAMPLE
  .\scripts\herdr-spawn.ps1 -Workspace "w1" -Role "backend" -Ticket "T1" -Description "auth-api"
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

$WriterRoles = @('backend', 'frontend', 'devops', 'worker')
$IsWriter = $WriterRoles -contains $Role.ToLower()

$Label = if ($Ticket) { "$Role-$Ticket" } else { $Role }

Write-Host "==> Creating Herdr tab in workspace '$Workspace' with label '$Label'..." -ForegroundColor Cyan

# 1. Prepare worktree if writer role
$WorkDir = "."
if ($IsWriter -and $Ticket) {
    $Slug = if ($Description) { "$Ticket-$Description" } else { "$Ticket-$Role" }
    $WorktreePath = "wt/$Slug"
    $BranchName = $Slug

    if (-not (Test-Path $WorktreePath)) {
        Write-Host "==> Setting up isolated worktree at '$WorktreePath' (branch: $BranchName)..." -ForegroundColor Yellow
        git worktree add $WorktreePath -b $BranchName
    } else {
        Write-Host "==> Worktree '$WorktreePath' already exists." -ForegroundColor Yellow
    }
    $WorkDir = $WorktreePath
}

# 2. Spawn Herdr tab
Write-Host "==> Executing: herdr tab create --workspace $Workspace --label $Label" -ForegroundColor Green
herdr tab create --workspace $Workspace --label $Label

Write-Host "==> Success! In the new tab, run:" -ForegroundColor Green
Write-Host "    cd $WorkDir; cmdc --mod-option default=$Role" -ForegroundColor White
