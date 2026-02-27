# Compact Month Card

![Home
Assistant](https://img.shields.io/badge/Home%20Assistant-2023.0%2B-blue?logo=home-assistant)
![Lovelace](https://img.shields.io/badge/Lovelace-Custom%20Card-blue)
![License](https://img.shields.io/badge/License-MIT-green)

A compact and elegant calendar overview designed for structured Home
Assistant dashboards.

Compact Month Card combines a clean monthly grid with a focused daily
event panel,\
providing visual clarity without sacrificing information density.

Built with dashboard composition in mind, it prioritizes layout
balance,\
multi-calendar workflows, and subtle visual hierarchy over traditional
planner-style complexity.

------------------------------------------------------------------------

## ✨ Features

-   **Compact Month Grid** -- clean 7×6 layout optimized for dashboards
-   **Dedicated Day Detail Panel** -- focused event list for selected
    date
-   **Multi-Calendar Support** -- merge multiple calendars seamlessly
-   **Priority-Based Indicators** -- control dot hierarchy per calendar
-   **Today Shortcut** -- instant jump to the current date
-   **Event Counter & Limit** -- maintain predictable layout density
-   **Optional Ongoing Highlight** -- subtle real-time progress
    indicator
-   **Custom Section Backgrounds** -- style selector, month and events
    independently

------------------------------------------------------------------------

## 🎯 Designed For

-   Structured grid dashboards
-   Multi-calendar setups (Google + Local + Shared)
-   Users who value visual hierarchy and layout control
-   Compact but information-rich views

------------------------------------------------------------------------

## 📦 Installation

1.  Copy `compact-month-card.js` into your Home Assistant `/www` folder.

2.  Add the resource in Lovelace:

        /local/compact-month-card.js

    Type: **JavaScript Module**

3.  Add the card using YAML configuration.

------------------------------------------------------------------------

## ⚙️ Example Configuration

``` yaml
type: custom:compact-month-card
calendars:
  - entity: calendar.google_work
    icon: mdi:briefcase
    color: "#3b82f6"
    priority: 1
  - entity: calendar.local_home
    icon: mdi:home
    color: "rgba(16,185,129,1)"
    priority: 2

backgrounds:
  card: "rgba(0,0,0,0.15)"
  selector: "rgba(255,255,255,0.02)"
  month: "rgba(255,255,255,0.02)"
  events: "rgba(255,255,255,0.02)"

events:
  max_items: 8
  show_more: true
  show_count: true

day_tiles:
  background: true
  today_only: true

now:
  enabled: false
  update_seconds: 30
  show_progress: true
  show_text: true
  text_mode: remaining
```

------------------------------------------------------------------------

## 🧩 Configuration

### Calendars

| Option           | Type    | Default      | Description                  |
|------------------|---------|--------------|------------------------------|
| `entity`         | string  | required     | Target Calendar entity ID    |
| `icon`           | string  | mdi:calendar | Icon displayed in selector   |
| `color`          | string  | required     | Dot and event indicator color|
| `priority`       | number  | 999          | Defines dot display order    |
------------------------------------------------------------------------

### Backgrounds

| Option     | Type   | Default        | Description                        |
|------------|--------|---------------|------------------------------------|
| `card`     | string | `null`        | Entire card background             |
| `selector` | string | `transparent` | Calendar selector panel background |
| `month`    | string | `transparent` | Month grid section background      |
| `events`   | string | `transparent` | Event list panel background        |
------------------------------------------------------------------------

### Events

| Option          | Type             | Default | Description                                  |
|-----------------|------------------|---------|----------------------------------------------|
| `max_items`     | number \| null   | `null`  | Maximum number of events displayed           |
| `show_more`     | boolean          | `true`  | Show "+N more" indicator                     |
| `show_count`    | boolean          | `true`  | Display total event count                    |
| `gap_reduction` | number           | `16`    | Reduces spacing between time and title       |
------------------------------------------------------------------------

### Day Tiles

| Option        | Type    | Default | Description                                   |
|---------------|---------|---------|-----------------------------------------------|
| `background`  | boolean | `true`  | Enable subtle tile background                 |
| `today_only`  | boolean | `false` | Apply tile background only to today           |
------------------------------------------------------------------------

### Ongoing Event (Optional)

| Option            | Type    | Default      | Description                                     |
|-------------------|---------|-------------|--------------------------------------------------|
| `enabled`         | boolean | `false`     | Enable live ongoing detection                    |
| `update_seconds`  | number  | `30`        | Refresh interval (seconds)                       |
| `show_progress`   | boolean | `true`      | Show visual progress overlay                     |
| `show_text`       | boolean | `true`      | Display elapsed/remaining time                   |
| `text_mode`       | string  | `remaining` | `remaining`, `elapsed`, `both`                   |
-------------------------------------------------------------------------

-------------------------------------------------------------------------
## 🌍 Language Support

The card is currently optimized for Czech (cs-CZ) language environments.

Internationalization support may be added in future iterations.

-------------------------------------------------------------------------

## ⚠️ Project Scope

This card is primarily developed for personal dashboard use.

Feature requests may not always be implemented.
The component evolves based on practical usage.

Pull requests are welcome.

------------------------------------------------------------------------

## 📄 License

MIT License
