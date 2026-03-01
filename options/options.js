// OLED Dark Mode v3 - Options page script
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // Elements
  var modeBlacklist = $("modeBlacklist");
  var modeWhitelist = $("modeWhitelist");
  var excludedSection = $("excludedSection");
  var whitelistSection = $("whitelistSection");
  var excludedList = $("excludedList");
  var whitelistedList = $("whitelistedList");
  var newExcludedSite = $("newExcludedSite");
  var addExcludedBtn = $("addExcludedBtn");
  var newWhitelistSite = $("newWhitelistSite");
  var addWhitelistBtn = $("addWhitelistBtn");
  var overridesList = $("overridesList");
  var noOverrides = $("noOverrides");
  var scheduleEnabled = $("scheduleEnabled");
  var scheduleRow = $("scheduleRow");
  var scheduleStart = $("scheduleStart");
  var scheduleEnd = $("scheduleEnd");
  var respectNativeDark = $("respectNativeDark");
  var followSystemTheme = $("followSystemTheme");
  var textReadabilityOpt = $("textReadabilityOpt");
  var exportBtn = $("exportBtn");
  var importBtn = $("importBtn");
  var jsonArea = $("jsonArea");
  var importActions = $("importActions");
  var confirmImport = $("confirmImport");
  var cancelImport = $("cancelImport");
  var saveBtn = $("saveBtn");
  var savedMsg = $("savedMsg");

  var settings = null;

  // ── Load ──

  async function load() {
    var resp = await browser.runtime.sendMessage({ type: "GET_STATE" });
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
    followSystemTheme.checked = settings.followSystemTheme || false;
    textReadabilityOpt.checked = settings.textReadability || false;

    renderExcluded();
    renderWhitelisted();
    renderOverrides();
  }

  function updateModeVisibility() {
    var isWhitelist = modeWhitelist.checked;
    excludedSection.style.display = isWhitelist ? "none" : "block";
    whitelistSection.style.display = isWhitelist ? "block" : "none";
  }

  // ── Render lists ──

  function renderExcluded() {
    while (excludedList.firstChild) excludedList.firstChild.remove();
    (settings.excludedSites || []).forEach(function (site) {
      excludedList.appendChild(createListItem(site, function () {
        settings.excludedSites = settings.excludedSites.filter(function (s) { return s !== site; });
        renderExcluded();
      }));
    });
  }

  function renderWhitelisted() {
    while (whitelistedList.firstChild) whitelistedList.firstChild.remove();
    (settings.whitelistedSites || []).forEach(function (site) {
      whitelistedList.appendChild(createListItem(site, function () {
        settings.whitelistedSites = settings.whitelistedSites.filter(function (s) { return s !== site; });
        renderWhitelisted();
      }));
    });
  }

  function renderOverrides() {
    while (overridesList.firstChild) overridesList.firstChild.remove();
    var overrides = settings.siteOverrides || {};
    var keys = Object.keys(overrides);
    noOverrides.style.display = keys.length === 0 ? "block" : "none";

    keys.forEach(function (site) {
      var o = overrides[site];
      var details = [];
      if (o.theme) details.push(o.theme);
      if (o.brightness !== undefined && o.brightness !== 100) details.push("b:" + o.brightness);
      if (o.contrast !== undefined && o.contrast !== 100) details.push("c:" + o.contrast);

      var li = document.createElement("li");
      var textSpan = document.createElement("span");
      textSpan.textContent = site;
      if (details.length > 0) {
        var detailSpan = document.createElement("span");
        detailSpan.className = "override-detail";
        detailSpan.textContent = details.join(", ");
        textSpan.appendChild(detailSpan);
      }
      li.appendChild(textSpan);

      var btn = document.createElement("button");
      btn.textContent = "\u00d7";
      btn.title = "Remove override";
      btn.addEventListener("click", function () {
        delete settings.siteOverrides[site];
        renderOverrides();
      });
      li.appendChild(btn);
      overridesList.appendChild(li);
    });
  }

  function createListItem(text, onRemove) {
    var li = document.createElement("li");
    var span = document.createElement("span");
    span.textContent = text;
    li.appendChild(span);
    var btn = document.createElement("button");
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

  scheduleEnabled.addEventListener("change", function () {
    scheduleRow.style.display = scheduleEnabled.checked ? "flex" : "none";
  });

  addExcludedBtn.addEventListener("click", function () {
    var val = newExcludedSite.value.trim().toLowerCase();
    if (val && !settings.excludedSites.includes(val)) {
      settings.excludedSites.push(val);
      renderExcluded();
      newExcludedSite.value = "";
    }
  });
  newExcludedSite.addEventListener("keydown", function (e) {
    if (e.key === "Enter") addExcludedBtn.click();
  });

  addWhitelistBtn.addEventListener("click", function () {
    var val = newWhitelistSite.value.trim().toLowerCase();
    if (!settings.whitelistedSites) settings.whitelistedSites = [];
    if (val && !settings.whitelistedSites.includes(val)) {
      settings.whitelistedSites.push(val);
      renderWhitelisted();
      newWhitelistSite.value = "";
    }
  });
  newWhitelistSite.addEventListener("keydown", function (e) {
    if (e.key === "Enter") addWhitelistBtn.click();
  });

  // Import / Export
  exportBtn.addEventListener("click", async function () {
    var resp = await browser.runtime.sendMessage({ type: "EXPORT_SETTINGS" });
    jsonArea.value = resp.json;
    jsonArea.style.display = "block";
    jsonArea.select();
    importActions.style.display = "none";
  });

  importBtn.addEventListener("click", function () {
    jsonArea.value = "";
    jsonArea.style.display = "block";
    importActions.style.display = "flex";
    jsonArea.focus();
  });

  confirmImport.addEventListener("click", async function () {
    var json = jsonArea.value.trim();
    if (!json) return;
    var resp = await browser.runtime.sendMessage({ type: "IMPORT_SETTINGS", json: json });
    if (resp.ok) {
      jsonArea.style.display = "none";
      importActions.style.display = "none";
      flash("Imported!");
      await load();
    } else {
      flash("Error: " + (resp.error || "Invalid JSON"), true);
    }
  });

  cancelImport.addEventListener("click", function () {
    jsonArea.style.display = "none";
    importActions.style.display = "none";
  });

  // Save
  saveBtn.addEventListener("click", async function () {
    settings.mode = modeWhitelist.checked ? "whitelist" : "blacklist";
    settings.scheduleEnabled = scheduleEnabled.checked;
    settings.scheduleStart = scheduleStart.value;
    settings.scheduleEnd = scheduleEnd.value;
    settings.respectNativeDark = respectNativeDark.checked;
    settings.followSystemTheme = followSystemTheme.checked;
    settings.textReadability = textReadabilityOpt.checked;

    await browser.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: settings
    });

    flash("Saved!");
  });

  function flash(text, isError) {
    savedMsg.textContent = text;
    savedMsg.style.color = isError ? "#f44336" : "#00c853";
    savedMsg.classList.add("show");
    setTimeout(function () { savedMsg.classList.remove("show"); }, 2000);
  }
})();
