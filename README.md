# Work Tracker

Automatic work time tracker for macOS. Tracks when you lock/unlock your screen - no manual input required.

## How It Works

- **Unlock screen** = Work starts
- **Lock screen** = Work ends

That's it. Simple.

## Features

- Runs silently in the background
- Starts automatically at login
- CSV export for BambooHR

## Requirements

- macOS 12+
- [Bun](https://bun.sh/)

## Installation

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone and install
git clone <repo-url>
cd working-time
./install.sh
```

## Usage

### Check status
```bash
work-tracker status
```
```
Status: Working
Started: 09:15
Duration: 4h 32m
```

### Today's summary
```bash
work-tracker today
```
```
Date: 2026-01-22
Total: 7h 15m (7.25 hours)

Sessions:
  09:15 - 12:30: 3h 15m
  13:15 - ongoing: 4h 0m
```

### Weekly report
```bash
work-tracker report
```
```
Date        | Start | End   | Hours
------------|-------|-------|------
2026-01-22  | 09:15 | 12:30 |   3.3
2026-01-22  | 13:15 | now   |   4.0
2026-01-21  | 08:45 | 17:30 |   8.8
------------|-------|-------|------
Total: 16h 6m over 2 days
Average: 8h 3m per day
```

### Export to CSV
```bash
work-tracker export --days 30 -o hours.csv
```
```csv
Date,Start Time,End Time,Total Hours
2026-01-21,08:45,17:30,8.75
2026-01-22,09:15,12:30,3.25
2026-01-22,13:15,17:45,4.50
```

## Uninstall

```bash
./uninstall.sh
```

## Data

Stored in `~/.work-tracker/sessions.json`
