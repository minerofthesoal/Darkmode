// OLED Dark Mode v3 - Background Script
// Manages global + per-site state, tab-specific overrides,
// whitelist/blacklist mode, schedule, system theme detection,
// keyboard shortcut, badge, import/export.

const DEFAULT_SETTINGS = {
  enabled: true,
  // Visual
  brightness: 100,
  contrast: 100,
  sepia: 0,
  grayscale: 0,
  theme: "oled",          // "oled" | "dark" | "midnight" | "charcoal" | "nord" | "solarized"
  dimImages: false,
  imageOpacity: 90,
  // Text readability
  textReadability: false,  // Force better text contrast
  // Site filtering
  mode: "blacklist",      // "blacklist" = dark on all except excluded
                          // "whitelist" = dark only on listed sites
  excludedSites: [],
  whitelistedSites: [],
  // Per-site overrides  { "example.com": { brightness: 80, theme: "dark", ... } }
  siteOverrides: {},
  // Schedule
  scheduleEnabled: false,
  scheduleStart: "20:00",
  scheduleEnd: "07:00",
  // Behaviour
  respectNativeDark: false,
  followSystemTheme: false  // Auto dark when OS is dark
};

// Tab-specific overrides (not persisted — cleared on tab close)
const tabOverrides = {};

// ── State helpers ──

async function getSettings() {
  const result = await browser.storage.local.get("settings");
  return Object.assign({}, DEFAULT_SETTINGS, result.settings || {});
}

async function saveSettings(settings) {
  await browser.storage.local.set({ settings });
}

function isWithinSchedule(settings) {
  if (!settings.scheduleEnabled) return true;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const parts = settings.scheduleStart.split(":");
  const sh = Number(parts[0]);
  const sm = Number(parts[1]);
  const endParts = settings.scheduleEnd.split(":");
  const eh = Number(endParts[0]);
  const em = Number(endParts[1]);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
}

function hostnameFromUrl(url) {
  try { return new URL(url).hostname; }
  catch (e) { return ""; }
}

function isSiteActive(settings, url) {
  const host = hostnameFromUrl(url);
  if (!host) return true;
  if (settings.mode === "whitelist") {
    return settings.whitelistedSites.some(
      function (s) { return host === s || host.endsWith("." + s); }
    );
  }
  return !settings.excludedSites.some(
    function (s) { return host === s || host.endsWith("." + s); }
  );
}

// ── Badge ──

async function updateBadge(tabId, active) {
  var text = active ? "ON" : "OFF";
  var color = active ? "#00e676" : "#757575";
  try {
    await browser.browserAction.setBadgeText({ text: text, tabId: tabId });
    await browser.browserAction.setBadgeBackgroundColor({ color: color, tabId: tabId });
  } catch (e) { /* tab may have closed */ }
}

// ── Resolve final state for a tab ──

async function resolveStateForTab(tab) {
  var settings = await getSettings();
  var active = settings.enabled && isWithinSchedule(settings);

  if (active && tab && tab.url) {
    if (!isSiteActive(settings, tab.url)) active = false;
  }

  // Tab-specific override
  if (tab && tab.id !== undefined && tabOverrides[tab.id] !== undefined) {
    active = tabOverrides[tab.id];
  }

  return { active: active, settings: settings };
}

// ── Broadcast to all tabs ──

async function broadcastToAllTabs() {
  var tabs = await browser.tabs.query({});
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
    try {
      var result = await resolveStateForTab(tab);
      browser.tabs.sendMessage(tab.id, {
        type: "UPDATE_STATE",
        active: result.active,
        settings: result.settings
      });
      updateBadge(tab.id, result.active);
    } catch (e) { /* content script not ready */ }
  }
}

// ── Message handler ──

browser.runtime.onMessage.addListener(function (msg, sender) {
  switch (msg.type) {

    case "GET_STATE": {
      var tab = sender.tab || null;
      return resolveStateForTab(tab).then(function (result) {
        if (sender.tab) updateBadge(sender.tab.id, result.active);
        return { active: result.active, settings: result.settings };
      });
    }

    case "GET_STATE_FOR_TAB":
      return browser.tabs.query({ active: true, currentWindow: true }).then(async function (tabs) {
        var tab = tabs[0] || null;
        var result = await resolveStateForTab(tab);
        if (tab) updateBadge(tab.id, result.active);
        var hasTabOverride = tab && tab.id !== undefined && tabOverrides[tab.id] !== undefined;
        return {
          active: result.active,
          settings: result.settings,
          url: tab ? tab.url : "",
          tabOverride: hasTabOverride
        };
      });

    case "TOGGLE":
      return getSettings().then(async function (settings) {
        settings.enabled = !settings.enabled;
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { enabled: settings.enabled };
      });

    case "TOGGLE_TAB":
      return browser.tabs.query({ active: true, currentWindow: true }).then(async function (tabs) {
        var tab = tabs[0];
        if (!tab) return { ok: false };
        var result = await resolveStateForTab(tab);
        // Flip tab-specific override
        tabOverrides[tab.id] = !result.active;
        try {
          browser.tabs.sendMessage(tab.id, {
            type: "UPDATE_STATE",
            active: !result.active,
            settings: result.settings
          });
          updateBadge(tab.id, !result.active);
        } catch (e) { /* tab not ready */ }
        return { ok: true, active: !result.active };
      });

    case "CLEAR_TAB_OVERRIDE":
      return browser.tabs.query({ active: true, currentWindow: true }).then(async function (tabs) {
        var tab = tabs[0];
        if (tab && tab.id !== undefined) {
          delete tabOverrides[tab.id];
          var result = await resolveStateForTab(tab);
          try {
            browser.tabs.sendMessage(tab.id, {
              type: "UPDATE_STATE",
              active: result.active,
              settings: result.settings
            });
            updateBadge(tab.id, result.active);
          } catch (e) { /* tab not ready */ }
        }
        return { ok: true };
      });

    case "SAVE_SETTINGS":
      return saveSettings(msg.settings).then(async function () {
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "EXCLUDE_SITE":
      return getSettings().then(async function (settings) {
        var host = hostnameFromUrl(msg.url);
        if (!host) return { ok: false };
        if (settings.mode === "blacklist") {
          if (!settings.excludedSites.includes(host)) {
            settings.excludedSites.push(host);
          }
        } else {
          settings.whitelistedSites = settings.whitelistedSites.filter(function (s) { return s !== host; });
        }
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "INCLUDE_SITE":
      return getSettings().then(async function (settings) {
        var host = hostnameFromUrl(msg.url);
        if (!host) return { ok: false };
        if (settings.mode === "blacklist") {
          settings.excludedSites = settings.excludedSites.filter(function (s) { return s !== host; });
        } else {
          if (!settings.whitelistedSites.includes(host)) {
            settings.whitelistedSites.push(host);
          }
        }
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "SAVE_SITE_OVERRIDE":
      return getSettings().then(async function (settings) {
        var host = hostnameFromUrl(msg.url);
        if (!host) return { ok: false };
        if (!settings.siteOverrides) settings.siteOverrides = {};
        settings.siteOverrides[host] = msg.override;
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "CLEAR_SITE_OVERRIDE":
      return getSettings().then(async function (settings) {
        var host = hostnameFromUrl(msg.url);
        if (settings.siteOverrides) delete settings.siteOverrides[host];
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "EXPORT_SETTINGS":
      return getSettings().then(function (settings) {
        return { json: JSON.stringify(settings, null, 2) };
      });

    case "IMPORT_SETTINGS":
      return (async function () {
        try {
          var imported = JSON.parse(msg.json);
          var merged = Object.assign({}, DEFAULT_SETTINGS, imported);
          await saveSettings(merged);
          await broadcastToAllTabs();
          return { ok: true };
        } catch (e) {
          return { ok: false, error: "Invalid JSON" };
        }
      })();

    default:
      return false;
  }
});

// ── Tab events ──

browser.tabs.onActivated.addListener(async function (info) {
  try {
    var tab = await browser.tabs.get(info.tabId);
    var result = await resolveStateForTab(tab);
    updateBadge(info.tabId, result.active);
  } catch (e) { /* tab not found */ }
});

browser.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  if (changeInfo.status === "loading") {
    var result = await resolveStateForTab(tab);
    updateBadge(tabId, result.active);
  }
});

// Clean up tab overrides when tab closes
browser.tabs.onRemoved.addListener(function (tabId) {
  delete tabOverrides[tabId];
});

// ── Keyboard shortcut ──

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(async function (command) {
    if (command === "toggle-dark-mode") {
      var settings = await getSettings();
      settings.enabled = !settings.enabled;
      await saveSettings(settings);
      await broadcastToAllTabs();
    }
  });
}
