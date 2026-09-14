param(
    [string]$Repository = 'mnikn/text-wuxia'
)

$ErrorActionPreference = 'Stop'

function Invoke-Gh {
    param([string[]]$NativeArgs)

    $output = & gh @NativeArgs
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "gh failed with exit code ${exitCode}: gh $($NativeArgs -join ' ')"
    }
    return $output
}

function Read-FrontMatter {
    param([string]$Path)

    $raw = Get-Content -LiteralPath $Path -Raw
    $match = [regex]::Match($raw, '(?s)^---\r?\n(?<front>.*?)\r?\n---\r?\n(?<body>.*)$')
    if (-not $match.Success) {
        throw "Missing front matter: $Path"
    }

    $front = $match.Groups['front'].Value
    $blocked = @()
    $inBlocked = $false
    foreach ($line in ($front -split '\r?\n')) {
        if ($line -match '^blocked_by:\s*\[\]\s*$') {
            $inBlocked = $false
            continue
        }
        if ($line -match '^blocked_by:\s*$') {
            $inBlocked = $true
            continue
        }
        if ($inBlocked -and $line -match '^\s+-\s+(?<value>.+)$') {
            $blocked += $Matches['value'].Trim()
            continue
        }
        if ($line -match '^(?<key>title|label|status):\s*(?<value>.+)$') {
            Set-Variable -Name $Matches['key'] -Value $Matches['value'].Trim() -Scope Local
        }
    }

    [pscustomobject]@{
        Title = $title
        Label = $label
        Status = $status
        BlockedBy = $blocked
        Body = $match.Groups['body'].Value.Trim()
    }
}

$labels = @(
    @{ Name = 'wayfinder:map'; Color = '6f42c1'; Description = 'Wayfinder canonical planning map' },
    @{ Name = 'wayfinder:research'; Color = '0969da'; Description = 'AFK research decision ticket' },
    @{ Name = 'wayfinder:prototype'; Color = 'fbca04'; Description = 'HITL prototype decision ticket' },
    @{ Name = 'wayfinder:grilling'; Color = 'd93f0b'; Description = 'HITL decision interview ticket' },
    @{ Name = 'wayfinder:task'; Color = '0e8a16'; Description = 'Prerequisite task that unblocks a decision' }
)

foreach ($label in $labels) {
    Invoke-Gh @('label', 'create', $label.Name, '--repo', $Repository, '--color', $label.Color, '--description', $label.Description, '--force') | Out-Null
}

$existing = @(Invoke-Gh @('issue', 'list', '--repo', $Repository, '--state', 'all', '--limit', '200', '--json', 'number,title,url,state') | ConvertFrom-Json)
$mapPath = Join-Path $PSScriptRoot 'map.md'
$mapData = Read-FrontMatter -Path $mapPath
$mapIssue = $existing | Where-Object { $_.title -eq $mapData.Title } | Select-Object -First 1
if (-not $mapIssue) {
    $mapUrl = Invoke-Gh @('issue', 'create', '--repo', $Repository, '--title', $mapData.Title, '--label', $mapData.Label, '--body-file', $mapPath)
    $mapIssue = Invoke-Gh @('issue', 'view', $mapUrl, '--repo', $Repository, '--json', 'number,title,url,state') | ConvertFrom-Json
}

$tickets = @{}
$ticketFiles = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'tickets') -Filter '*.md' | Sort-Object Name
foreach ($file in $ticketFiles) {
    $ticket = Read-FrontMatter -Path $file.FullName
    $issue = $existing | Where-Object { $_.title -eq $ticket.Title } | Select-Object -First 1
    $sourceUrl = "https://github.com/$Repository/blob/main/planning/wayfinder/tickets/$($file.Name)"
    $body = "[仓库规划源文件]($sourceUrl)`n`n$($ticket.Body)"
    $bodyPath = [System.IO.Path]::GetTempFileName()
    try {
        Set-Content -LiteralPath $bodyPath -Value $body -Encoding utf8
        if (-not $issue) {
            $issueUrl = Invoke-Gh @('issue', 'create', '--repo', $Repository, '--title', $ticket.Title, '--label', $ticket.Label, '--body-file', $bodyPath)
            $issue = Invoke-Gh @('issue', 'view', $issueUrl, '--repo', $Repository, '--json', 'number,title,url,state') | ConvertFrom-Json
        } else {
            Invoke-Gh @('issue', 'edit', [string]$issue.number, '--repo', $Repository, '--add-label', $ticket.Label, '--body-file', $bodyPath) | Out-Null
        }
    } finally {
        Remove-Item -LiteralPath $bodyPath -Force -ErrorAction SilentlyContinue
    }

    if ($ticket.Status -eq 'closed' -and $issue.state -ne 'CLOSED') {
        Invoke-Gh @('issue', 'close', [string]$issue.number, '--repo', $Repository, '--reason', 'completed') | Out-Null
    }

    $rest = Invoke-Gh @('api', "repos/$Repository/issues/$($issue.number)") | ConvertFrom-Json
    $tickets[$file.BaseName] = [pscustomobject]@{
        File = $file.Name
        Number = [int]$issue.number
        Id = [long]$rest.id
        Url = $issue.url
        Status = $ticket.Status
        BlockedBy = $ticket.BlockedBy
        Title = $ticket.Title
    }
}

$mapRest = Invoke-Gh @('api', "repos/$Repository/issues/$($mapIssue.number)") | ConvertFrom-Json
foreach ($ticket in $tickets.Values) {
    $existingChildren = @(Invoke-Gh @('api', "repos/$Repository/issues/$($mapIssue.number)/sub_issues", '--paginate') | ConvertFrom-Json)
    if ($ticket.Id -notin @($existingChildren.id)) {
        Invoke-Gh @('api', '--method', 'POST', '-H', 'X-GitHub-Api-Version: 2026-03-10', "repos/$Repository/issues/$($mapIssue.number)/sub_issues", '-F', "sub_issue_id=$($ticket.Id)") | Out-Null
    }
}

foreach ($ticket in $tickets.Values) {
    if ($ticket.BlockedBy.Count -eq 0) {
        continue
    }
    $existingBlockers = @(Invoke-Gh @('api', "repos/$Repository/issues/$($ticket.Number)/dependencies/blocked_by", '--paginate') | ConvertFrom-Json)
    foreach ($blockerKey in $ticket.BlockedBy) {
        $blocker = $tickets[$blockerKey]
        if (-not $blocker) {
            throw "Unknown blocker '$blockerKey' for '$($ticket.Title)'"
        }
        if ($blocker.Id -notin @($existingBlockers.id)) {
            Invoke-Gh @('api', '--method', 'POST', '-H', 'X-GitHub-Api-Version: 2026-03-10', "repos/$Repository/issues/$($ticket.Number)/dependencies/blocked_by", '-F', "issue_id=$($blocker.Id)") | Out-Null
        }
    }
}

$mapBody = $mapData.Body
foreach ($ticket in $tickets.Values) {
    $escapedFile = [regex]::Escape("tickets/$($ticket.File)")
    $mapBody = [regex]::Replace($mapBody, "\($escapedFile\)", "($($ticket.Url))")
}
$mapSourceUrl = "https://github.com/$Repository/blob/main/planning/wayfinder/map.md"
$mapBody = "[仓库规划源文件]($mapSourceUrl)`n`n$mapBody"
$mapBodyPath = [System.IO.Path]::GetTempFileName()
try {
    Set-Content -LiteralPath $mapBodyPath -Value $mapBody -Encoding utf8
    Invoke-Gh @('issue', 'edit', [string]$mapIssue.number, '--repo', $Repository, '--add-label', $mapData.Label, '--body-file', $mapBodyPath) | Out-Null
} finally {
    Remove-Item -LiteralPath $mapBodyPath -Force -ErrorAction SilentlyContinue
}

[pscustomobject]@{
    Repository = $Repository
    Map = [pscustomobject]@{ Number = [int]$mapIssue.number; Id = [long]$mapRest.id; Url = $mapIssue.url }
    Tickets = @($tickets.Values | Sort-Object Number)
} | ConvertTo-Json -Depth 6
