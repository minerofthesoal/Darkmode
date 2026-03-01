// OLED Dark Mode v2 - Options page script
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Elements
  const modeBlacklist = $("modeBlacklist");
  const modeWhitelist = $("modeWhitelist");
  const excludedSection = $("excludedSection");
  const whitelistSection = $("whitelistSection");
  const excludedList = $("excludedList");
  const whitelistedList = $("whitelistedList");
  const newExcludedSite = $("newExcludedSite");
  const addExcludedBtn = $("addExcludedBtn");
  const newWhitelistSite = $("newWhitelistSite");
  const addWhitelistBtn = $("addWhitelistBtn");
  const overridesList = $("overridesList");
  const noOverrides = $("noOverrides");
  const scheduleEnabled = $("scheduleEnabled");
  const scheduleRow = $("scheduleRow");
  const scheduleStart = $("scheduleStart");
  const scheduleEnd = $("scheduleEnd");
  const respectNativeDark = $("respectNativeDark");
  const exportBtn = $("exportBtn");
  const importBtn = $("importBtn");
  const jsonArea = $("jsonArea");
  const importActions = $("importActions");
  const confirmImport = $("confirmImport");
  const cancelImport = $("cancelImport");
  const saveBtn = $("saveBtn");
  const savedMsg = $("savedMsg");

  let settings = null;

  // ── Load ──

  async function load() {
    const resp = await browser.runtime.sendMessage({ type: "GET_STATE" });
    settings = resp.settings;

    // Mode
    if (settings.mode === "whitelist") {
      modeWhitelist.checked = true;
    } else {
      modeBlacklist.checked = true;
    }
    updateModeVisibility();

    // Schedule
    scheduleEnabled.checked = settings.scheduleEnabled;
    scheduleRow.style.display = settings.scheduleEnabled ? "flex" : "none";
    scheduleStart.value = settings.scheduleStart;
    scheduleEnd.value = settings.scheduleEnd;

    // Behaviour
    respectNativeDark.checked = settings.respectNativeDark || false;

    renderExcluded();
    renderWhitelisted();
    renderOverrides();
  }

  function updateModeVisibility() {
    const isWhitelist = modeWhitelist.checked;
    excludedSection.style.display = isWhitelist ? "none" : "block";
    whitelistSection.style.display = isWhitelist ? "block" : "none";
  }

  // ── Render lists ──

  function renderExcluded() {
    while (excludedList.firstChild) excludedList.firstChild.remove();
    (settings.excludedSites || []).forEach((site) => {
      excludedList.appendChild(createListItem(site, () => {
        settings.excludedSites = settings.excludedSites.filter((s) => s !== site);
        renderExcluded();
      }));
    });
  }

  function renderWhitelisted() {
    while (whitelistedList.firstChild) whitelistedList.firstChild.remove();
    (settings.whitelistedSites || []).forEach((site) => {
      whitelistedList.appendChild(createListItem(site, () => {
        settings.whitelistedSites = settings.whitelistedSites.filter((s) => s !== site);
        renderWhitelisted();
      }));
    });
  }

  function renderOverrides() {
    while (overridesList.firstChild) overridesList.firstChild.remove();
    const overrides = settings.siteOverrides || {};
    const keys = Object.keys(overrides);
    noOverrides.style.display = keys.length === 0 ? "block" : "none";

    keys.forEach((site) => {
      const o = overrides[site];
      const details = [];
      if (o.theme) details.push(o.theme);
      if (o.brightness !== undefined && o.brightness !== 100) details.push("b:" + o.brightness);
      if (o.contrast !== undefined && o.contrast !== 100) details.push("c:" + o.contrast);

      const li = document.createElement("li");
      const textSpan = document.createElement("span");
      textSpan.textContent = site;
      if (details.length > 0) {
        const detailSpan = document.createElement("span");
        detailSpan.className = "override-detail";
        detailSpan.textContent = details.join(", ");
        textSpan.appendChild(detailSpan);
      }
      li.appendChild(textSpan);

      const btn = document.createElement("button");
      btn.textContent = "\u00d7";
      btn.title = "Remove override";
      btn.addEventListener("click", () => {
        delete settings.siteOverrides[site];
        renderOverrides();
      });
      li.appendChild(btn);
      overridesList.appendChild(li);
    });
  }

  function createListItem(text, onRemove) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = text;
    li.appendChild(span);
    const btn = document.createElement("button");
    btn.textContent = "\u00d7";
    btn.title = "Remove";
    btn.addEventListener("click", onRemove);
    li.appendChild(btn);
    return li;
  }

  load();

  // ── Events ──

  modeBlacklist.addEventListener("change", updateModeVisibility);
  modeWhitelist.addEventListener("change", updateModeVisibility);

  scheduleEnabled.addEventListener("change", () => {
    scheduleRow.style.display = scheduleEnabled.checked ? "flex" : "none";
  });

  addExcludedBtn.addEventListener("click", () => {
    const val = newExcludedSite.value.trim().toLowerCase();
    if (val && !settings.excludedSites.includes(val)) {
      settings.excludedSites.push(val);
      renderExcluded();
      newExcludedSite.value = "";
    }
  });
  newExcludedSite.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addExcludedBtn.click();
  });

  addWhitelistBtn.addEventListener("click", () => {
    const val = newWhitelistSite.value.trim().toLowerCase();
    if (!settings.whitelistedSites) settings.whitelistedSites = [];
    if (val && !settings.whitelistedSites.includes(val)) {
      settings.whitelistedSites.push(val);
      renderWhitelisted();
      newWhitelistSite.value = "";
    }
  });
  newWhitelistSite.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addWhitelistBtn.click();
  });

  // Import / Export
  exportBtn.addEventListener("click", async () => {
    const resp = await browser.runtime.sendMessage({ type: "EXPORT_SETTINGS" });
    jsonArea.value = resp.json;
    jsonArea.style.display = "block";
    jsonArea.select();
    importActions.style.display = "none";
  });

  importBtn.addEventListener("click", () => {
    jsonArea.value = "";
    jsonArea.style.display = "block";
    importActions.style.display = "flex";
    jsonArea.focus();
  });

  confirmImport.addEventListener("click", async () => {
    const json = jsonArea.value.trim();
    if (!json) return;
    const resp = await browser.runtime.sendMessage({ type: "IMPORT_SETTINGS", json });
    if (resp.ok) {
      jsonArea.style.display = "none";
      importActions.style.display = "none";
      flash("Imported!");
      await load();
    } else {
      flash("Error: " + (resp.error || "Invalid JSON"), true);
    }
  });

  cancelImport.addEventListener("click", () => {
    jsonArea.style.display = "none";
    importActions.style.display = "none";
  });

  // Save
  saveBtn.addEventListener("click", async () => {
    settings.mode = modeWhitelist.checked ? "whitelist" : "blacklist";
    settings.scheduleEnabled = scheduleEnabled.checked;
    settings.scheduleStart = scheduleStart.value;
    settings.scheduleEnd = scheduleEnd.value;
    settings.respectNativeDark = respectNativeDark.checked;

    await browser.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings
    });

    flash("Saved!");
  });

  function flash(text, isError) {
    savedMsg.textContent = text;
    savedMsg.style.color = isError ? "#f44336" : "#00c853";
    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 2000);
  }
})();
