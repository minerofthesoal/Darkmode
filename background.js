// OLED Dark Mode v2 - Background Script
// Manages global + per-site state, whitelist/blacklist mode,
// schedule, keyboard shortcut, badge, import/export.

const DEFAULT_SETTINGS = {
  enabled: true,
  // Visual
  brightness: 100,
  contrast: 100,
  sepia: 0,
  grayscale: 0,
  theme: "oled",          // "oled" | "dark" | "midnight" | "charcoal"
  dimImages: false,
  imageOpacity: 90,
  // Site filtering
  mode: "blacklist",      // "blacklist" = dark on all sites except excluded
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
  respectNativeDark: false
};

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
  const [sh, sm] = settings.scheduleStart.split(":").map(Number);
  const [eh, em] = settings.scheduleEnd.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
}

function hostnameFromUrl(url) {
  try { return new URL(url).hostname; }
  catch { return ""; }
}

function isSiteActive(settings, url) {
  const host = hostnameFromUrl(url);
  if (!host) return true; // Can't determine — leave enabled
  if (settings.mode === "whitelist") {
    return settings.whitelistedSites.some(
      (s) => host === s || host.endsWith("." + s)
    );
  }
  // blacklist mode
  return !settings.excludedSites.some(
    (s) => host === s || host.endsWith("." + s)
  );
}

// ── Badge ──

async function updateBadge(tabId, active) {
  const text = active ? "ON" : "OFF";
  const color = active ? "#00e676" : "#757575";
  try {
    await browser.browserAction.setBadgeText({ text, tabId });
    await browser.browserAction.setBadgeBackgroundColor({ color, tabId });
  } catch {}
}

// ── Resolve final state for a tab ──

async function resolveStateForTab(tab) {
  const settings = await getSettings();
  let active = settings.enabled && isWithinSchedule(settings);
  if (active && tab && tab.url) {
    if (!isSiteActive(settings, tab.url)) active = false;
  }
  return { active, settings };
}

// ── Broadcast to all tabs ──

async function broadcastToAllTabs() {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    try {
      const { active, settings } = await resolveStateForTab(tab);
      browser.tabs.sendMessage(tab.id, {
        type: "UPDATE_STATE",
        active,
        settings
      });
      updateBadge(tab.id, active);
    } catch {}
  }
}

// ── Message handler ──

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {

    case "GET_STATE": {
      const tab = sender.tab || null;
      return resolveStateForTab(tab).then(({ active, settings }) => {
        if (sender.tab) updateBadge(sender.tab.id, active);
        return { active, settings };
      });
    }

    case "GET_STATE_FOR_TAB":
      return browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
        const tab = tabs[0] || null;
        const { active, settings } = await resolveStateForTab(tab);
        if (tab) updateBadge(tab.id, active);
        return { active, settings, url: tab ? tab.url : "" };
      });

    case "TOGGLE":
      return getSettings().then(async (settings) => {
        settings.enabled = !settings.enabled;
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { enabled: settings.enabled };
      });

    case "SAVE_SETTINGS":
      return saveSettings(msg.settings).then(async () => {
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "EXCLUDE_SITE":
      return getSettings().then(async (settings) => {
        const host = hostnameFromUrl(msg.url);
        if (!host) return { ok: false };
        if (settings.mode === "blacklist") {
          if (!settings.excludedSites.includes(host)) {
            settings.excludedSites.push(host);
          }
        } else {
          // whitelist mode — remove from whitelist
          settings.whitelistedSites = settings.whitelistedSites.filter((s) => s !== host);
        }
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "INCLUDE_SITE":
      return getSettings().then(async (settings) => {
        const host = hostnameFromUrl(msg.url);
        if (!host) return { ok: false };
        if (settings.mode === "blacklist") {
          settings.excludedSites = settings.excludedSites.filter((s) => s !== host);
        } else {
          // whitelist mode — add to whitelist
          if (!settings.whitelistedSites.includes(host)) {
            settings.whitelistedSites.push(host);
          }
        }
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "SAVE_SITE_OVERRIDE":
      return getSettings().then(async (settings) => {
        const host = hostnameFromUrl(msg.url);
        if (!host) return { ok: false };
        if (!settings.siteOverrides) settings.siteOverrides = {};
        settings.siteOverrides[host] = msg.override;
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "CLEAR_SITE_OVERRIDE":
      return getSettings().then(async (settings) => {
        const host = hostnameFromUrl(msg.url);
        if (settings.siteOverrides) delete settings.siteOverrides[host];
        await saveSettings(settings);
        await broadcastToAllTabs();
        return { ok: true };
      });

    case "EXPORT_SETTINGS":
      return getSettings().then((settings) => {
        return { json: JSON.stringify(settings, null, 2) };
      });

    case "IMPORT_SETTINGS":
      return (async () => {
        try {
          const imported = JSON.parse(msg.json);
          const merged = Object.assign({}, DEFAULT_SETTINGS, imported);
          await saveSettings(merged);
          await broadcastToAllTabs();
          return { ok: true };
        } catch {
          return { ok: false, error: "Invalid JSON" };
        }
      })();

    default:
      return false;
  }
});

// ── Tab events ──

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await browser.tabs.get(tabId);
    const { active } = await resolveStateForTab(tab);
    updateBadge(tabId, active);
  } catch {}
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    const { active } = await resolveStateForTab(tab);
    updateBadge(tabId, active);
  }
});

// ── Keyboard shortcut ──

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(async (command) => {
    if (command === "toggle-dark-mode") {
      const settings = await getSettings();
      settings.enabled = !settings.enabled;
      await saveSettings(settings);
      await broadcastToAllTabs();
    }
  });
}
