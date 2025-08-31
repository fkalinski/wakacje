# Holiday Park CLI

A command-line tool for searching and monitoring Holiday Park vacation availabilities locally.

## Features

- 🔍 **Search**: Execute vacation searches with customizable parameters
- 📊 **Monitor**: Continuously monitor saved searches on a schedule
- 💾 **Local Storage**: SQLite database for persistent storage
- 🔔 **Notifications**: Local notifications for new/removed availabilities
- 📋 **Results Tracking**: Compare results between runs to track changes

## Installation

### Quick Install

```bash
# Run the install script
./install.sh
```

### Manual Install

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# (Optional) Install globally
npm link
```

## Usage

After installation, you can use either `hp` or `holiday-park` command. If installed locally, use `./hp` from the CLI directory.

### Interactive Search

Create a new search interactively:

```bash
hp search --interactive
```

### Quick Search

Execute a search with specific parameters:

```bash
# Search for 7-day stays in the next 3 months
hp search -d 2024-01-01:2024-03-31 -s 7

# Search specific resorts and accommodation types
hp search -d 2024-06-01:2024-08-31 -s 7 -r 1 2 -t 1 3

# Save the search for future use
hp search -d 2024-06-01:2024-08-31 -s 7 --save
```

### List Saved Searches

View all saved searches:

```bash
hp list

# View results for a specific search
hp list -r <search-id>

# Delete a search
hp list -d <search-id>

# Enable/disable a search
hp list -e <search-id>  # Enable
hp list --disable <search-id>  # Disable
```

### Monitor Searches

Run saved searches continuously:

```bash
# Run all enabled searches once
hp monitor --once

# Monitor continuously every 30 minutes
hp monitor -i 30

# Monitor a specific search
hp monitor -s <search-id>
```

## Command Options

### search
- `-d, --dates <ranges...>`: Date ranges in format YYYY-MM-DD:YYYY-MM-DD
- `-s, --stay <lengths...>`: Stay lengths in days (default: 7)
- `-r, --resorts <ids...>`: Resort IDs to search
- `-t, --types <ids...>`: Accommodation type IDs
- `-n, --name <name>`: Name for the search
- `--save`: Save this search for future use
- `--interactive`: Interactive mode

### monitor
- `-i, --interval <minutes>`: Check interval in minutes (default: 30)
- `-o, --once`: Run all searches once and exit
- `-s, --search <id>`: Monitor specific search by ID

### list
- `-r, --results <searchId>`: Show results for specific search
- `-d, --delete <searchId>`: Delete a saved search
- `-e, --enable <searchId>`: Enable a search
- `--disable <searchId>`: Disable a search

## Data Storage

The CLI stores all data locally in SQLite database at:
- `~/.holiday-park-cli/searches.db`

## Resort IDs

- 1: Pobierowo
- 2: Ustronie Morskie
- 5: Niechorze
- 6: Rowy
- 7: Kołobrzeg
- 8: Mielno
- 9: Uzdrowisko Cieplice Zdrój

## Accommodation Type IDs

- 1: Domek
- 2: Apartament
- 3: Apartament 55m²
- 4: Domek z ogrodem
- 5: Apartament z ogrodem

## Development

```bash
# Development mode
npm run dev

# Build
npm run build

# Lint
npm run lint
```