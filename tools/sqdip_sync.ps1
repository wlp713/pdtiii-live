param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$shareRoot = '\\10.3.176.15\All_Dept2\GAT PRODUCTION DM\Pro SQDIP 2026'
$stageRoot = Join-Path $env:USERPROFILE 'Desktop\_sqdip_stage\automation'
$inputDir = Join-Path $stageRoot 'input'
$statePath = Join-Path $stageRoot 'sync-state.json'
$manifestPath = Join-Path $stageRoot 'source-manifest.json'
$logDir = Join-Path $stageRoot 'logs'
$script:transcriptStarted = $false

function ConvertTo-WslPath([string]$path) {
    $fullPath = [System.IO.Path]::GetFullPath($path)
    if ($fullPath -notmatch '^([A-Za-z]):\\(.*)$') { throw "Cannot map Windows path into WSL: $fullPath" }
    return '/mnt/' + $Matches[1].ToLowerInvariant() + '/' + ($Matches[2] -replace '\\', '/')
}

function Test-PeriodName([string]$name, [string]$period) {
    $year = $period.Substring(0, 4)
    $month = [int]$period.Substring(5, 2)
    $monthWords = @(
        'jan(?:uary)?','feb(?:ruary)?','mar(?:ch)?','apr(?:il)?','may','jun(?:e)?',
        'jul(?:y)?','aug(?:ust)?','sep(?:tember)?','oct(?:ober)?','nov(?:ember)?','dec(?:ember)?'
    )
    $numericMonth = '(?:0?' + $month + ')'
    $numericPattern = '(?<!\d)' + $numericMonth + '[\s._-]+' + $year + '(?!\d)'
    if ([regex]::IsMatch($name, $numericPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) { return $true }
    $yearFirstPattern = '(?<!\d)' + $year + '[\s._-]+' + $numericMonth + '(?!\d)'
    if ([regex]::IsMatch($name, $yearFirstPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) { return $true }
    $monthNamePattern = '(?i)(?<![a-z])' + $monthWords[$month - 1] + '[\s._-]*' + $year + '(?!\d)'
    if ([regex]::IsMatch($name, $monthNamePattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) { return $true }
    return $false
}

function Get-SourceFile([string]$id, [string]$folder, [string]$period) {
    $directory = Join-Path $shareRoot $folder
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw "Shared folder unavailable for $id." }
    $candidates = @(Get-ChildItem -LiteralPath $directory -File | Where-Object {
        $_.Extension -match '^\.(xls|xlsx)$' -and $_.Name -notlike '~$*' -and (Test-PeriodName $_.BaseName $period)
    })
    if ($id -eq 'PRO.3') {
        $newVersions = @($candidates | Where-Object { $_.BaseName -match '(?i)\bnew\b' })
        if ($newVersions.Count -gt 0) { $candidates = $newVersions }
        else { $candidates = @($candidates | Where-Object { $_.BaseName -notmatch '(?i)\bold\b' }) }
    }
    if ($candidates.Count -eq 0) { throw "No $period workbook found for $id." }
    return $candidates | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
}

function Copy-StableSource($source, [string]$destination) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $before = Get-Item -LiteralPath $source.FullName
        Copy-Item -LiteralPath $source.FullName -Destination $destination -Force
        $after = Get-Item -LiteralPath $source.FullName
        if ($before.Length -eq $after.Length -and $before.LastWriteTimeUtc -eq $after.LastWriteTimeUtc) { return $after }
        Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
    throw "Workbook kept changing during copy: $($source.Name)"
}

try {
    New-Item -ItemType Directory -Path $inputDir -Force | Out-Null
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $logPath = Join-Path $logDir ('sync-' + (Get-Date -Format 'yyyyMMdd') + '.log')
    Start-Transcript -Path $logPath -Append | Out-Null
    $script:transcriptStarted = $true

    $period = (Get-Date).ToString('yyyy-MM')
    $plants = @(
        @{ id = 'PRO.1'; folder = 'SQDIP Pro.1\SQDIP'; alias = 'p1.xls' },
        @{ id = 'PRO.2'; folder = 'SQDIP Pro.2'; alias = 'p2.xlsx' },
        @{ id = 'PRO.3'; folder = 'SQDIP Pro.3'; alias = 'p3.xlsx' },
        @{ id = 'PRO.4-5'; folder = 'SQDIP Pro.4-5'; alias = 'p45.xlsx' },
        @{ id = 'PRO.6'; folder = 'SQDIP Pro.6'; alias = 'p6.xlsx' }
    )

    $sources = @{}
    foreach ($plant in $plants) { $sources[$plant.alias] = Get-SourceFile $plant.id $plant.folder $period }

    $sourceStats = @{}
    foreach ($plant in $plants) {
        $file = $sources[$plant.alias]
        $sourceStats[$plant.alias] = @{
            name = $file.Name
            size = [int64]$file.Length
            lastWriteUtc = $file.LastWriteTimeUtc.ToString('o')
        }
    }

    if (-not $DryRun -and (Test-Path -LiteralPath $statePath)) {
        $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $same = ($state.period -eq $period)
        foreach ($plant in $plants) {
            $old = $state.files.PSObject.Properties[$plant.id]
            $oldFile = if ($old) { $old.Value } else { $null }
            $now = $sourceStats[$plant.alias]
            $oldTicks = if ($oldFile) { ([datetime]$oldFile.lastWriteUtc).ToUniversalTime().Ticks } else { -1 }
            $nowTicks = ([datetime]$now.lastWriteUtc).ToUniversalTime().Ticks
            if (-not $oldFile -or $oldFile.name -ne $now.name -or [int64]$oldFile.size -ne $now.size -or $oldTicks -ne $nowTicks) { $same = $false }
        }
        if ($same) {
            Write-Output "No workbook change detected for $period; no Firebase write."
            return
        }
    }

    foreach ($plant in $plants) {
        $destination = Join-Path $inputDir $plant.alias
        $copied = Copy-StableSource $sources[$plant.alias] $destination
        $sourceStats[$plant.alias] = @{
            name = $copied.Name
            size = [int64]$copied.Length
            lastWriteUtc = $copied.LastWriteTimeUtc.ToString('o')
        }
        Write-Output ("Staged {0}: {1:N1} MB" -f $plant.id, ($copied.Length / 1MB))
    }

    $manifest = @{ period = $period; files = $sourceStats }
    [System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))

    $wslPython = '/home/wlp77713/.openclaw/workspace/pdtiii_live/tools/sync_sqdip_firebase.py'
    $wslManifest = ConvertTo-WslPath $manifestPath
    $wslStage = ConvertTo-WslPath $stageRoot
    $wslExe = Join-Path $env:SystemRoot 'System32\wsl.exe'
    $wslArgs = @('-d','Ubuntu-22.04','--exec','/usr/bin/python3',$wslPython,'--manifest',$wslManifest,'--stage-dir',$wslStage)
    if ($DryRun) { $wslArgs += '--dry-run' }
    & $wslExe @wslArgs
    if ($LASTEXITCODE -ne 0) { throw "SQDIP parser or Firebase write failed (exit $LASTEXITCODE)." }
}
catch {
    Write-Error $_
    exit 1
}
finally {
    if ($script:transcriptStarted) { Stop-Transcript | Out-Null }
}
