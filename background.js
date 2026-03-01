// OLED Dark Mode - Background Script
// Manages global state, per-site state, keyboard shortcut, and badge icon.

const DEFAULT_SETTINGS = {
  enabled: true,
  brightness: 100,
  contrast: 100,
  sepia: 0,
  grayscale: 0,
  excludedSites: [],
  scheduleEnabled: false,
  scheduleStart: "20:00",
  scheduleEnd: "07:00",
  dimImages: false,
  imageOpacity: 90
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
  const h = now.getHours();
  const m = now.getMinutes();
  const current = h * 60 + m;
  const [sh, sm] = settings.scheduleStart.split(":").map(Number);
  const [eh, em] = settings.scheduleEnd.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) {
    return current >= start && current < end;
  }
  // Wraps past midnight
  return current >= start || current < end;
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isSiteExcluded(settings, url) {
  const host = hostnameFromUrl(url);
  return settings.excludedSites.some(
    (s) => host === s || host.endsWith("." + s)
  );
}

// ── Badge / icon ──

async function updateBadge(tabId, active) {
  const text = active ? "ON" : "OFF";
  const color = active ? "#00e676" : "#757575";
  await browser.browserAction.setBadgeText({ text, tabId });
  await browser.browserAction.setBadgeBackgroundColor({ color, tabId });
}

// ── Messaging ──

async function resolveStateForTab(tab) {
  const settings = await getSettings();
  let active = settings.enabled && isWithinSchedule(settings);
  if (tab && tab.url) {
    if (isSiteExcluded(settings, tab.url)) active = false;
  }
  return { active, settings };
}

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
    } catch {
      // Tab may not have content script (e.g. about:pages)
    }
  }
}

// Listen for messages from popup / content scripts
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "GET_STATE") {
    const tab = sender.tab || null;
    return resolveStateForTab(tab).then(({ active, settings }) => {
      if (sender.tab) updateBadge(sender.tab.id, active);
      return { active, settings };
    });
  }

  if (msg.type === "GET_STATE_FOR_TAB") {
    return browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      const tab = tabs[0] || null;
      const { active, settings } = await resolveStateForTab(tab);
      if (tab) updateBadge(tab.id, active);
      return { active, settings, url: tab ? tab.url : "" };
    });
  }

  if (msg.type === "TOGGLE") {
    return getSettings().then(async (settings) => {
      settings.enabled = !settings.enabled;
      await saveSettings(settings);
      await broadcastToAllTabs();
      return { enabled: settings.enabled };
    });
  }

  if (msg.type === "SAVE_SETTINGS") {
    return saveSettings(msg.settings).then(async () => {
      await broadcastToAllTabs();
      return { ok: true };
    });
  }

  if (msg.type === "EXCLUDE_SITE") {
    return getSettings().then(async (settings) => {
      const host = hostnameFromUrl(msg.url);
      if (host && !settings.excludedSites.includes(host)) {
        settings.excludedSites.push(host);
        await saveSettings(settings);
        await broadcastToAllTabs();
      }
      return { ok: true };
    });
  }

  if (msg.type === "INCLUDE_SITE") {
    return getSettings().then(async (settings) => {
      const host = hostnameFromUrl(msg.url);
      settings.excludedSites = settings.excludedSites.filter((s) => s !== host);
      await saveSettings(settings);
      await broadcastToAllTabs();
      return { ok: true };
    });
  }
});

// Update badge when tab changes
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

// Keyboard shortcut (Ctrl+Shift+D)
browser.commands && browser.commands.onCommand &&
  browser.commands.onCommand.addListener(async (command) => {
    if (command === "toggle-dark-mode") {
      const settings = await getSettings();
      settings.enabled = !settings.enabled;
      await saveSettings(settings);
      await broadcastToAllTabs();
    }
  });
