# Work Tracker

Automatic work time tracker for macOS. Runs in the background and tracks when you start and stop working based on system events (screen lock/unlock, sleep/wake). No manual input required.

## Features

- **Automatic tracking**: Detects work start/stop via screen lock, sleep/wake events
- **Idle detection**: Automatically subtracts idle time (>15 minutes)
- **Multiple sessions**: Tracks multiple work sessions per day
- **Break tracking**: Records breaks and their duration
- **CLI reports**: View daily, weekly, or monthly summaries
- **CSV export**: Export data for BambooHR or spreadsheets
- **Runs at startup**: LaunchAgent keeps it running automatically

## Requirements

- macOS (tested on macOS 12+)
- [Bun](https://bun.sh/) runtime

## Installation

1. Install Bun if you haven't:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. Clone and install:
   ```bash
   git clone <repo-url>
   cd working-time
   ./install.sh
   ```

The installer will:
- Build the TypeScript code into standalone executables
- Install a LaunchAgent to run at login
- Start the tracking daemon immediately

## Usage

### Check current status
```bash
work-tracker status
```

Output:
```
Status: Working
Started: 09:15
Duration: 4h 32m
Breaks: 1 (45m total)
```

### View today's summary
```bash
work-tracker today
```

Output:
```
Date: 2026-01-22
Total: 7h 15m (7.25 hours)

Sessions:
  09:15 - 12:30: 3h 15m
  13:15 - ongoing: 4h 0m
```

### View weekly report
```bash
work-tracker report
work-tracker report --days 30  # Last 30 days
```

Output:
```
Work Report (last 7 days)

Date        | Hours | Sessions
------------|-------|----------
2026-01-22  |   7.3 | 2
2026-01-21  |   8.1 | 1
2026-01-20  |   7.8 | 2
------------|-------|----------
Total: 23h 12m over 3 days
Average: 7h 44m per day
```

### Export to CSV
```bash
work-tracker export                          # Print to stdout
work-tracker export --days 30 -o hours.csv   # Save to file
```

CSV format:
```csv
Date,Start Time,End Time,Break Minutes,Total Hours
2026-01-22,09:15,12:30,0,3.25
2026-01-22,13:15,17:30,15,4.00
```

### Manual start/stop
```bash
work-tracker start  # Manually start a session
work-tracker stop   # Manually end current session
```

### View event log
```bash
work-tracker log
```

## How It Works

The daemon monitors macOS system events:

| Event | Action |
|-------|--------|
| **Screen unlock / Wake** | Start or resume work session |
| **Screen lock / Sleep** | Start a break |
| **Idle > 15 minutes** | Start a break (subtracted from work time) |
| **Break > 4 hours** | Auto-end session at break start |
| **New day** | End previous session, start new one |

### Data Storage

All data is stored in `~/.work-tracker/`:
- `sessions.json` - Work session data
- `events.log` - Raw event log
- `daemon.log` - Daemon output log

## Uninstall

```bash
./uninstall.sh
```

This stops the daemon and removes the LaunchAgent. You can choose to keep or delete your tracking data.

## Troubleshooting

### Daemon not running
```bash
# Check status
launchctl list | grep worktracker

# View logs
cat ~/.work-tracker/daemon.log
cat ~/.work-tracker/daemon.error.log

# Restart manually
launchctl unload ~/Library/LaunchAgents/com.worktracker.daemon.plist
launchctl load ~/Library/LaunchAgents/com.worktracker.daemon.plist
```

### Screen lock detection not working
The daemon uses a Swift helper for reliable screen lock detection. If it fails to compile, it falls back to polling-based detection which may be slightly less accurate.

Ensure Xcode command-line tools are installed:
```bash
xcode-select --install
```

## License

MIT
