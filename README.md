# OLED Dark Mode for Firefox

A universal OLED dark mode extension for Firefox that works on **any website**, preserves images, and runs on both **Android** and **desktop**.

## Features

### Core
- **True OLED black** (#000000) via CSS filter inversion — saves battery on AMOLED screens
- **Images stay untouched** — media elements (img, video, canvas, SVG, iframe) are re-inverted so they display normally
- **Works on every site** — injected at `document_start` so pages never flash white
- **Android + desktop** — Manifest V2 with `gecko_android` support

### Theme Presets
| Theme | Background | Description |
|-------|-----------|-------------|
| **OLED** | `#000000` | Pure black, maximum battery savings |
| **Dark** | `#0a0a0a` | Slightly softer dark gray |
| **Midnight** | `#020210` | Deep midnight blue tint |
| **Charcoal** | `#101010` | Warm charcoal gray |

### Per-Site Settings
- Save custom brightness, contrast, sepia, grayscale, and theme per domain
- Each site remembers its own settings independently
- Clear per-site overrides with one click

### Filtering Modes
- **Blacklist mode** (default) — dark on all sites, exclude specific ones
- **Whitelist mode** — dark only on sites you choose

### Adjustments
- **Brightness** (50%–150%)
- **Contrast** (50%–150%)
- **Sepia** (0%–100%)
- **Grayscale** (0%–100%)
- **Image dimming** with adjustable opacity (hover to reveal full brightness)

### Schedule
- Auto-enable dark mode during set hours (e.g. 8 PM to 7 AM)
- Supports overnight schedules that cross midnight

### Smart Behaviour
- **Native dark mode detection** — optionally skip sites that already have dark backgrounds
- **Dynamic content handling** — MutationObserver catches elements added after page load
- **Inline background fixing** — bright inline `background-color` styles are neutralised
- **Form controls** — inputs, textareas, selects get dark styling via `color-scheme: dark`
- **Print safe** — dark mode is disabled in print stylesheets
- **Smooth transitions** — toggle fades in/out instead of flashing

### Extras
- **Keyboard shortcut** — `Ctrl+Shift+D` (configurable in `about:addons`)
- **Import/Export** — backup and restore all settings as JSON
- **Badge indicator** — ON/OFF badge on the toolbar icon per tab
- **Dark popup and settings UI** — the extension itself is fully dark-themed

## Installation

### Desktop (Firefox)
1. Download the latest release `.xpi` file from [Releases](../../releases)
2. Open Firefox and navigate to `about:addons`
3. Click the gear icon and select "Install Add-on From File..."
4. Select the downloaded `.xpi` file

**Or for development:**
1. Clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select the `manifest.json` file

### Android (Firefox for Android)
1. Download the `.xpi` file
2. In Firefox for Android, go to Settings > Add-ons
3. Install from file, or submit to [AMO](https://addons.mozilla.org) for permanent installation

## Usage

1. Click the extension icon in the toolbar to open the popup
2. Use the main toggle to enable/disable globally
3. Click **Exclude site** / **Include site** to manage per-site filtering
4. Choose a theme preset (OLED, Dark, Midnight, Charcoal)
5. Adjust brightness, contrast, sepia, and grayscale with sliders
6. Enable **Per-site settings** to save adjustments for the current domain only
7. Open **Settings** for schedule, whitelist mode, import/export, and more

## How It Works

The extension uses a CSS filter-based approach:

1. `filter: invert(100%) hue-rotate(180deg)` is applied to `<html>`, inverting all colors
2. Media elements (`img`, `video`, `canvas`, `iframe`, etc.) receive a second inversion, restoring them to their original appearance
3. A content script monitors the DOM for dynamically added elements and fixes bright inline backgrounds
4. Form elements use `color-scheme: dark` for native dark styling

This approach works universally across all websites without needing site-specific CSS rules.

## File Structure

```
├── manifest.json          # Extension manifest (MV2)
├── background.js          # State management, messaging, badge
├── content.js             # DOM manipulation, filter application
├── darkmode.css           # Core dark mode stylesheet
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
├── options/
│   ├── options.html       # Settings page
│   ├── options.css        # Settings styles
│   └── options.js         # Settings logic
└── icons/
    ├── icon-16.svg
    ├── icon-32.svg
    ├── icon-48.svg
    └── icon-96.svg
```

## Permissions

| Permission | Reason |
|-----------|--------|
| `activeTab` | Read the current tab's URL for per-site settings |
| `storage` | Persist settings across sessions |
| `tabs` | Update badge text per tab, broadcast state changes |
| `<all_urls>` | Inject dark mode CSS/JS on all websites |

## License

See [LICENSE](LICENSE) for details.
