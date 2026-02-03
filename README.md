# Work Tracker

[![CI](https://github.com/cassmtnr/working-time/actions/workflows/ci.yml/badge.svg)](https://github.com/cassmtnr/working-time/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/cassmtnr/working-time/graph/badge.svg)](https://codecov.io/gh/cassmtnr/working-time)
![Platform](https://img.shields.io/badge/platform-macOS-blue)
![License](https://img.shields.io/badge/license-MIT-green)

Automatic work time tracker for macOS. Tracks when you lock/unlock your screen - no manual input required.

## How It Works

- **Unlock screen** = Work starts
- **Lock screen** = Work ends

That's it. Simple.

## Features

- Runs silently in the background
- Starts automatically at login
- Manual session management (add, edit, delete)
- CSV export for HR systems
- View daily summaries and weekly reports

## Requirements

- macOS 12+
- [Bun](https://bun.sh/) (automatically installed if not present)

## Installation

```bash
# Clone and install
git clone https://github.com/cassmtnr/working-time.git
cd working-time
./install.sh
```

The installer will automatically install Bun if it's not already installed.

After installation, restart your terminal or run:
```bash
source ~/.zshrc
```

## Commands

### Status

Check if you're currently working and view today's sessions.

```bash
work-tracker status
```

**Output:**
```
Sessions for 2026-01-22:

┌──────────┬───────┬───────┬───────┐
│    ID    │ Start │  End  │ Hours │
├──────────┼───────┼───────┼───────┤
│ a1b2c3d4 │ 09:15 │ 12:30 │   3.3 │
├──────────┼───────┼───────┼───────┤
│ e5f6g7h8 │ 13:15 │ now   │   4.0 │
└──────────┴───────┼───────────────┤
                   │ Total Day: 7.3 │
                   └───────────────┘

Use --id with edit/delete commands
```

Or when no sessions:
```
No sessions for 2026-01-22
```

### Today's Summary

View all work sessions for today with total hours.

```bash
work-tracker today
```

**Output:**
```
Date: 2026-01-22
Total: 7h 15m (7.25 hours)

Sessions:
  09:15 - 12:30: 3h 15m
  13:15 - ongoing: 4h 0m
```

### Work Report

View work report for all recorded sessions.

```bash
work-tracker report
```

**Output:**
```
Work Report

2026-01-21:

┌──────────┬───────┬───────┬───────┐
│    ID    │ Start │  End  │ Hours │
├──────────┼───────┼───────┼───────┤
│ x9y8z7w6 │ 08:45 │ 17:30 │   8.8 │
└──────────┴───────┼───────────────┤
                   │ Total Day: 8.8 │
                   └───────────────┘

2026-01-22:

┌──────────┬───────┬───────┬───────┐
│    ID    │ Start │  End  │ Hours │
├──────────┼───────┼───────┼───────┤
│ a1b2c3d4 │ 09:15 │ 12:30 │   3.3 │
├──────────┼───────┼───────┼───────┤
│ e5f6g7h8 │ 13:15 │ now   │   4.0 │
└──────────┴───────┼───────────────┤
                   │ Total Day: 7.3 │
                   └───────────────┘

─────────────────────────────────────
Total Month: 16h 6m over 2 days
Average: 8h 3m per day
```

### Export to CSV

Export all sessions to CSV format for HR systems.

```bash
# Print to stdout
work-tracker export

# Save to file
work-tracker export -o hours.csv
work-tracker export --output weekly-hours.csv
```

**Output:**
```csv
Date,Start Time,End Time,Hours
2026-01-21,08:45,17:30,8.75
2026-01-21,Total Day,,8.75

2026-01-22,09:15,12:30,3.25
2026-01-22,13:15,17:45,4.50
2026-01-22,Total Day,,7.75

Total Month,,,16.50
```

### Manual Session Control

Start or stop sessions manually (useful when automatic detection isn't desired).

```bash
# Start a new session
work-tracker start

# Stop the current session
work-tracker stop
```

**Output:**
```
Started at 09:15
```
```
Stopped. Duration: 3h 45m
```

### Add Past Session

Manually add a work session for a past date/time.

```bash
# Add session for today
work-tracker add --date 2026-01-22 --start 09:00 --end 12:30

# Add session for a past date
work-tracker add --date 2026-01-20 --start 08:30 --end 17:00
```

**Output:**
```
Added: 2026-01-22 09:00 - 12:30 (3h 30m)
```

### List Sessions

List all sessions for a specific date with their IDs (needed for edit/delete).

```bash
# List today's sessions (default)
work-tracker list

# List sessions for a specific date
work-tracker list --date 2026-01-22
```

**Output:**
```
Sessions for 2026-01-22:

┌──────────┬───────┬───────┬───────┐
│    ID    │ Start │  End  │ Hours │
├──────────┼───────┼───────┼───────┤
│ a1b2c3d4 │ 09:15 │ 12:30 │   3.3 │
├──────────┼───────┼───────┼───────┤
│ e5f6g7h8 │ 13:15 │ 17:45 │   4.5 │
└──────────┴───────┼───────────────┤
                   │ Total Day: 7.8 │
                   └───────────────┘

Use --id with edit/delete commands
```

### Edit Session

Modify an existing session's start time, end time, or date.

```bash
# Edit start time
work-tracker edit --id a1b2c3d4 --start 09:00

# Edit end time
work-tracker edit --id a1b2c3d4 --end 18:00

# Edit both
work-tracker edit --id a1b2c3d4 --start 08:30 --end 17:30

# Move to different date
work-tracker edit --id a1b2c3d4 --date 2026-01-21 --start 09:00 --end 17:00
```

**Output:**
```
Updated: 2026-01-22 09:00 - 18:00
```

### Delete Session

Remove a session permanently.

```bash
# Delete by ID (prefix is enough)
work-tracker delete --id a1b2c3d4
```

**Output:**
```
Deleted: 2026-01-22 09:15
```

### Event Log

View recent lock/unlock events for debugging.

```bash
work-tracker log
```

**Output:**
```
Recent events:

[2026-01-22T09:15:00.000Z] startup
[2026-01-22T12:30:00.000Z] lock
[2026-01-22T13:15:00.000Z] unlock
[2026-01-22T17:45:00.000Z] lock
```

### Help

Show all available commands.

```bash
work-tracker help
work-tracker -h
work-tracker --help
```

## Command Reference

| Command | Description |
|---------|-------------|
| `status` | Current session status (same as list for today) |
| `today` | Today's work summary |
| `report` | Work report for all sessions |
| `export` | Export all sessions to CSV |
| `start` | Manually start a session |
| `stop` | Manually stop current session |
| `add` | Add a past session |
| `list` | List sessions for a date |
| `edit` | Edit an existing session |
| `delete` | Delete a session |
| `log` | Show event log |
| `help` | Show help |

## Options Reference

| Option | Description | Example |
|--------|-------------|---------|
| `-o, --output FILE` | Output file for export | `-o hours.csv` |
| `--date YYYY-MM-DD` | Target date for add/list/edit | `--date 2026-01-22` |
| `--start HH:MM` | Start time | `--start 09:00` |
| `--end HH:MM` | End time | `--end 17:30` |
| `--id ID` | Session ID for edit/delete | `--id a1b2c3d4` |

## Data Storage

All data is stored in `~/.work-tracker/`:

| File | Description |
|------|-------------|
| `sessions.json` | All work session data |
| `events.log` | Lock/unlock event history |
| `daemon.log` | Daemon process logs |

## Daemon Management

The daemon starts automatically at login via macOS LaunchAgent.

```bash
# Check if daemon is running
launchctl list | grep worktracker

# Manually restart daemon
launchctl unload ~/Library/LaunchAgents/com.worktracker.daemon.plist
launchctl load ~/Library/LaunchAgents/com.worktracker.daemon.plist

# View daemon logs
cat ~/.work-tracker/daemon.log
```

## Uninstall

```bash
./uninstall.sh
```

This will:
- Stop the daemon
- Remove the LaunchAgent
- Remove `~/.work-tracker` directory
- Remove the `work-tracker` command

## Troubleshooting

### Command not found

If `work-tracker` is not found after installation:

```bash
# Option 1: Source your shell profile
source ~/.zshrc

# Option 2: Use full path
~/.work-tracker/work-tracker status

# Option 3: Create symlink manually
sudo ln -sf ~/.work-tracker/work-tracker /usr/local/bin/work-tracker
```

### Lock/unlock not detected

Check if the daemon is running and viewing events:

```bash
# Check daemon status
launchctl list | grep worktracker

# Check event log
work-tracker log

# Check daemon logs for errors
cat ~/.work-tracker/daemon.log
```

### Reset all data

```bash
rm ~/.work-tracker/sessions.json
```

## Development

### Setup

```bash
# Install dependencies
bun install

# Run CLI in development
bun run cli status

# Run daemon in development
bun run start
```

### Testing

The project includes comprehensive regression tests using Bun's built-in test runner.

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage report
bun test --coverage
```

### Test Coverage

Run `bun test --coverage` to see detailed coverage report.

The test suite includes:
- **120+ unit tests** covering utilities, validation, and state machine logic
- **Integration tests** that run the actual CLI commands
- **~70% line coverage** overall

Note: CLI command handlers have lower unit test coverage because they perform file I/O. These are tested through integration tests that run the CLI as a subprocess.

### Linting and Type Checking

```bash
# Run ESLint
bun run lint

# Fix lint issues automatically
bun run lint:fix

# Run TypeScript type checking
bun run typecheck
```

### Building

```bash
# Build native binaries
bun run build
```

This creates two compiled executables:
- `work-tracker` - CLI binary
- `work-tracker-daemon` - Daemon binary

## License

MIT
