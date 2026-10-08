$ErrorActionPreference = 'Stop'

$taskName = 'PDTIII SQDIP Auto Sync'
$syncScript = Join-Path $PSScriptRoot 'sqdip_sync.ps1'
if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) { throw "Sync script not found: $syncScript" }

$powerShell = Join-Path $PSHOME 'powershell.exe'
$arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $syncScript + '"'
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$triggers = @(
    (New-ScheduledTaskTrigger -Daily -At '10:00'),
    (New-ScheduledTaskTrigger -Daily -At '12:00'),
    (New-ScheduledTaskTrigger -Daily -At '15:00')
)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 60)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description 'Checks the five Pro SQDIP workbooks on the company share at 10:00, 12:00 and 15:00 Bangkok time; writes only changed snapshots to the PDTIII Firebase SQDIP node.' -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State