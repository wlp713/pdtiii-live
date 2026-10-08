# SQDIP workbook sync

The SQDIP panel is part of PDTIII, but it has no visible launch button. When opened later, it reads the current monthly snapshot from the shared PDTIII Firebase Realtime Database.

## Flow

1. A Windows Task Scheduler task runs at 10:00, 12:00 and 15:00 local time.
2. `sqdip_sync.ps1` checks the current-month workbook in each of the five Pro folders on the company share. It prefers the Pro.3 workbook marked `New`; other folders use the newest matching monthly workbook.
3. If the selected names, sizes and modification times are unchanged, the run stops without copying or uploading. Otherwise it copies all five files to `%USERPROFILE%\Desktop\_sqdip_stage\automation\input` and invokes the WSL Python importer. A source that changes while being copied is retried.
4. `sync_sqdip_firebase.py` uses the existing `extract_sqdip.py` workbook rules, validates all five plants, hashes the staged files, then makes one Firebase update. The update replaces `sqdip/current` and the matching `sqdip/periods/YYYY-MM` snapshot together. Earlier months remain available.
5. The local content fingerprint is saved only after Firebase accepts the update. A failed read, parse, or write leaves the last Firebase snapshot intact; the next scheduled run retries.

The parser reads the `SQDIP` sheet for Pro.1, Pro.2, Pro.3 and Pro.6; Pro.4-5 uses `SQDIP (ข้อมูล)`. It continues to use the existing summary `Total` column and metric selection rules.

The current Firebase rules accept unauthenticated REST updates for this node, matching existing PDTIII writers. The importer only patches the SQDIP node and stores no credential. If the rules later require authentication, the scheduled writer must be configured with a local service credential before that change.

## Install and run on this PC

Open Windows PowerShell as the signed-in user with access to the share, from the PDTIII mirror's `tools` folder:

```powershell
.\register_sqdip_task.ps1
```

This installs or updates the task `PDTIII SQDIP Auto Sync`. It uses the interactive Windows account so the SMB share permissions are available, enables `StartWhenAvailable` and `WakeToRun`, and runs WSL Ubuntu-22.04 with the Python packages already used by the parser.

For a non-writing source check:

```powershell
.\sqdip_sync.ps1 -DryRun
```

Run without `-DryRun` to import immediately. Logs and the local fingerprint are kept under `%USERPROFILE%\Desktop\_sqdip_stage\automation\`.

The computer must be on and signed in for the share credentials to be available. If it is asleep at a trigger, the task requests wake; if it was off, Windows starts the missed run when available. GitHub Actions is not used to read the private SMB share.
