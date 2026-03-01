// OLED Dark Mode v3 - Popup script
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // Elements
  var globalToggle = $("globalToggle");
  var siteLabel = $("siteLabel");
  var modeBadge = $("modeBadge");
  var siteToggle = $("siteToggle");
  var tabToggle = $("tabToggle");
  var themeRow = $("themeRow");
  var themeRow2 = $("themeRow2");
  var brightness = $("brightness");
  var contrast = $("contrast");
  var sepia = $("sepia");
  var grayscale = $("grayscale");
  var dimImages = $("dimImages");
  var imageOpacity = $("imageOpacity");
  var opacityRow = $("opacityRow");
  var textReadability = $("textReadability");
  var perSiteToggle = $("perSiteToggle");
  var perSiteInfo = $("perSiteInfo");
  var clearOverride = $("clearOverride");
  var resetBtn = $("resetBtn");
  var optionsLink = $("optionsLink");

  var currentSettings = null;
  var currentUrl = "";
  var currentHost = "";
  var perSiteMode = false;

  // ── Load state from background ──

  async function loadState() {
    var resp = await browser.runtime.sendMessage({ type: "GET_STATE_FOR_TAB" });
    currentSettings = resp.settings;
    currentUrl = resp.url || "";

    globalToggle.checked = currentSettings.enabled;

    // Mode badge
    modeBadge.textContent = currentSettings.mode === "whitelist" ? "whitelist" : "blacklist";

    // Tab toggle indicator
    if (resp.tabOverride) {
      tabToggle.classList.add("active");
      tabToggle.title = "Tab has override — click to clear";
    } else {
      tabToggle.classList.remove("active");
      tabToggle.title = "Toggle this tab only";
    }

    // Site label
    try {
      currentHost = new URL(currentUrl).hostname;
      siteLabel.textContent = currentHost;
      siteToggle.disabled = false;

      if (currentSettings.mode === "blacklist") {
        var excluded = currentSettings.excludedSites.includes(currentHost);
        siteToggle.textContent = excluded ? "Include site" : "Exclude site";
      } else {
        var included = currentSettings.whitelistedSites.includes(currentHost);
        siteToggle.textContent = included ? "Remove site" : "Add site";
      }
    } catch (e) {
      currentHost = "";
      siteLabel.textContent = "--";
      siteToggle.disabled = true;
    }

    // Check for per-site override
    var override = currentHost && currentSettings.siteOverrides &&
      currentSettings.siteOverrides[currentHost];
    perSiteMode = !!override;
    perSiteToggle.checked = perSiteMode;
    perSiteInfo.style.display = perSiteMode ? "flex" : "none";

    // Load values (per-site override wins)
    var vals = getEffectiveValues();
    brightness.value = vals.brightness;
    $("brightnessVal").textContent = vals.brightness + "%";
    contrast.value = vals.contrast;
    $("contrastVal").textContent = vals.contrast + "%";
    sepia.value = vals.sepia;
    $("sepiaVal").textContent = vals.sepia + "%";
    grayscale.value = vals.grayscale;
    $("grayscaleVal").textContent = vals.grayscale + "%";

    dimImages.checked = currentSettings.dimImages;
    imageOpacity.value = currentSettings.imageOpacity;
    $("imageOpacityVal").textContent = currentSettings.imageOpacity + "%";
    opacityRow.style.display = currentSettings.dimImages ? "flex" : "none";

    textReadability.checked = currentSettings.textReadability || false;

    // Active theme — highlight in both rows
    var activeTheme = vals.theme || "oled";
    var allBtns = document.querySelectorAll(".theme-btn");
    for (var i = 0; i < allBtns.length; i++) {
      var btn = allBtns[i];
      if (btn.dataset.theme === activeTheme) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    }
  }

  function getEffectiveValues() {
    var s = currentSettings;
    var base = {
      brightness: s.brightness,
      contrast: s.contrast,
      sepia: s.sepia,
      grayscale: s.grayscale,
      theme: s.theme || "oled"
    };
    if (currentHost && s.siteOverrides && s.siteOverrides[currentHost]) {
      var o = s.siteOverrides[currentHost];
      if (o.brightness !== undefined) base.brightness = o.brightness;
      if (o.contrast !== undefined) base.contrast = o.contrast;
      if (o.sepia !== undefined) base.sepia = o.sepia;
      if (o.grayscale !== undefined) base.grayscale = o.grayscale;
      if (o.theme) base.theme = o.theme;
    }
    return base;
  }

  loadState();

  // ── Event handlers ──

  globalToggle.addEventListener("change", async function () {
    await browser.runtime.sendMessage({ type: "TOGGLE" });
    await loadState();
  });

  // Tab-specific toggle
  tabToggle.addEventListener("click", async function () {
    if (tabToggle.classList.contains("active")) {
      // Clear tab override
      await browser.runtime.sendMessage({ type: "CLEAR_TAB_OVERRIDE" });
    } else {
      await browser.runtime.sendMessage({ type: "TOGGLE_TAB" });
    }
    await loadState();
  });

  siteToggle.addEventListener("click", async function () {
    if (!currentHost) return;
    var isExcluded = currentSettings.mode === "blacklist"
      ? currentSettings.excludedSites.includes(currentHost)
      : !currentSettings.whitelistedSites.includes(currentHost);

    await browser.runtime.sendMessage({
      type: isExcluded ? "INCLUDE_SITE" : "EXCLUDE_SITE",
      url: currentUrl
    });
    await loadState();
  });

  // Theme buttons — handle both rows
  function handleThemeClick(e) {
    var btn = e.target.closest(".theme-btn");
    if (!btn) return;
    var theme = btn.dataset.theme;

    if (perSiteMode && currentHost) {
      var override = (currentSettings.siteOverrides && currentSettings.siteOverrides[currentHost]) || {};
      override.theme = theme;
      browser.runtime.sendMessage({
        type: "SAVE_SITE_OVERRIDE",
        url: currentUrl,
        override: override
      }).then(function () { loadState(); });
    } else {
      currentSettings.theme = theme;
      browser.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        settings: currentSettings
      }).then(function () { loadState(); });
    }
  }
  themeRow.addEventListener("click", handleThemeClick);
  themeRow2.addEventListener("click", handleThemeClick);

  // Per-site toggle
  perSiteToggle.addEventListener("change", async function () {
    perSiteMode = perSiteToggle.checked;
    perSiteInfo.style.display = perSiteMode ? "flex" : "none";

    if (perSiteMode && currentHost) {
      var override = {
        brightness: Number(brightness.value),
        contrast: Number(contrast.value),
        sepia: Number(sepia.value),
        grayscale: Number(grayscale.value),
        theme: getEffectiveValues().theme
      };
      await browser.runtime.sendMessage({
        type: "SAVE_SITE_OVERRIDE",
        url: currentUrl,
        override: override
      });
    } else if (!perSiteMode && currentHost) {
      await browser.runtime.sendMessage({
        type: "CLEAR_SITE_OVERRIDE",
        url: currentUrl
      });
    }
    await loadState();
  });

  clearOverride.addEventListener("click", async function () {
    if (!currentHost) return;
    await browser.runtime.sendMessage({
      type: "CLEAR_SITE_OVERRIDE",
      url: currentUrl
    });
    perSiteToggle.checked = false;
    await loadState();
  });

  // Slider save logic
  function saveSliders() {
    if (perSiteMode && currentHost) {
      var override = {
        brightness: Number(brightness.value),
        contrast: Number(contrast.value),
        sepia: Number(sepia.value),
        grayscale: Number(grayscale.value),
        theme: getEffectiveValues().theme
      };
      browser.runtime.sendMessage({
        type: "SAVE_SITE_OVERRIDE",
        url: currentUrl,
        override: override
      });
    } else {
      currentSettings.brightness = Number(brightness.value);
      currentSettings.contrast = Number(contrast.value);
      currentSettings.sepia = Number(sepia.value);
      currentSettings.grayscale = Number(grayscale.value);
      currentSettings.dimImages = dimImages.checked;
      currentSettings.imageOpacity = Number(imageOpacity.value);
      currentSettings.textReadability = textReadability.checked;
      browser.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        settings: currentSettings
      });
    }
  }

  var saveTimer = null;
  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSliders, 150);
  }

  [brightness, contrast, sepia, grayscale, imageOpacity].forEach(function (slider) {
    slider.addEventListener("input", function () {
      $(slider.id + "Val").textContent = slider.value + "%";
      debounceSave();
    });
  });

  dimImages.addEventListener("change", function () {
    opacityRow.style.display = dimImages.checked ? "flex" : "none";
    debounceSave();
  });

  textReadability.addEventListener("change", function () {
    currentSettings.textReadability = textReadability.checked;
    browser.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: currentSettings
    });
  });

  resetBtn.addEventListener("click", async function () {
    if (perSiteMode && currentHost) {
      await browser.runtime.sendMessage({
        type: "CLEAR_SITE_OVERRIDE",
        url: currentUrl
      });
    }
    currentSettings.brightness = 100;
    currentSettings.contrast = 100;
    currentSettings.sepia = 0;
    currentSettings.grayscale = 0;
    currentSettings.dimImages = false;
    currentSettings.imageOpacity = 90;
    currentSettings.theme = "oled";
    currentSettings.textReadability = false;
    await browser.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: currentSettings
    });
    perSiteToggle.checked = false;
    await loadState();
  });

  optionsLink.addEventListener("click", function (e) {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
})();
