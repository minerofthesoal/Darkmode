// OLED Dark Mode v2 - Popup script
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Elements
  const globalToggle = $("globalToggle");
  const siteLabel = $("siteLabel");
  const modeBadge = $("modeBadge");
  const siteToggle = $("siteToggle");
  const themeRow = $("themeRow");
  const brightness = $("brightness");
  const contrast = $("contrast");
  const sepia = $("sepia");
  const grayscale = $("grayscale");
  const dimImages = $("dimImages");
  const imageOpacity = $("imageOpacity");
  const opacityRow = $("opacityRow");
  const perSiteToggle = $("perSiteToggle");
  const perSiteInfo = $("perSiteInfo");
  const clearOverride = $("clearOverride");
  const resetBtn = $("resetBtn");
  const optionsLink = $("optionsLink");

  let currentSettings = null;
  let currentUrl = "";
  let currentHost = "";
  let perSiteMode = false;

  // ── Load state from background ──

  async function loadState() {
    const resp = await browser.runtime.sendMessage({ type: "GET_STATE_FOR_TAB" });
    currentSettings = resp.settings;
    currentUrl = resp.url || "";

    globalToggle.checked = currentSettings.enabled;

    // Mode badge
    modeBadge.textContent = currentSettings.mode === "whitelist" ? "whitelist" : "blacklist";

    // Site label
    try {
      currentHost = new URL(currentUrl).hostname;
      siteLabel.textContent = currentHost;
      siteToggle.disabled = false;

      if (currentSettings.mode === "blacklist") {
        const excluded = currentSettings.excludedSites.includes(currentHost);
        siteToggle.textContent = excluded ? "Include site" : "Exclude site";
      } else {
        const included = currentSettings.whitelistedSites.includes(currentHost);
        siteToggle.textContent = included ? "Remove site" : "Add site";
      }
    } catch {
      currentHost = "";
      siteLabel.textContent = "--";
      siteToggle.disabled = true;
    }

    // Check for per-site override
    const override = currentHost && currentSettings.siteOverrides &&
      currentSettings.siteOverrides[currentHost];
    perSiteMode = !!override;
    perSiteToggle.checked = perSiteMode;
    perSiteInfo.style.display = perSiteMode ? "flex" : "none";

    // Load values (per-site override wins)
    const vals = getEffectiveValues();
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

    // Active theme
    const activeTheme = vals.theme || "oled";
    themeRow.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === activeTheme);
    });
  }

  function getEffectiveValues() {
    const s = currentSettings;
    const base = {
      brightness: s.brightness,
      contrast: s.contrast,
      sepia: s.sepia,
      grayscale: s.grayscale,
      theme: s.theme || "oled"
    };
    if (currentHost && s.siteOverrides && s.siteOverrides[currentHost]) {
      const o = s.siteOverrides[currentHost];
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

  globalToggle.addEventListener("change", async () => {
    await browser.runtime.sendMessage({ type: "TOGGLE" });
    await loadState();
  });

  siteToggle.addEventListener("click", async () => {
    if (!currentHost) return;
    const isExcluded = currentSettings.mode === "blacklist"
      ? currentSettings.excludedSites.includes(currentHost)
      : !currentSettings.whitelistedSites.includes(currentHost);

    await browser.runtime.sendMessage({
      type: isExcluded ? "INCLUDE_SITE" : "EXCLUDE_SITE",
      url: currentUrl
    });
    await loadState();
  });

  // Theme buttons
  themeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".theme-btn");
    if (!btn) return;
    const theme = btn.dataset.theme;

    if (perSiteMode && currentHost) {
      // Save as per-site override
      const override = (currentSettings.siteOverrides && currentSettings.siteOverrides[currentHost]) || {};
      override.theme = theme;
      browser.runtime.sendMessage({
        type: "SAVE_SITE_OVERRIDE",
        url: currentUrl,
        override
      }).then(() => loadState());
    } else {
      currentSettings.theme = theme;
      browser.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        settings: currentSettings
      }).then(() => loadState());
    }
  });

  // Per-site toggle
  perSiteToggle.addEventListener("change", async () => {
    perSiteMode = perSiteToggle.checked;
    perSiteInfo.style.display = perSiteMode ? "flex" : "none";

    if (perSiteMode && currentHost) {
      // Create override from current slider values
      const override = {
        brightness: Number(brightness.value),
        contrast: Number(contrast.value),
        sepia: Number(sepia.value),
        grayscale: Number(grayscale.value),
        theme: getEffectiveValues().theme
      };
      await browser.runtime.sendMessage({
        type: "SAVE_SITE_OVERRIDE",
        url: currentUrl,
        override
      });
    } else if (!perSiteMode && currentHost) {
      await browser.runtime.sendMessage({
        type: "CLEAR_SITE_OVERRIDE",
        url: currentUrl
      });
    }
    await loadState();
  });

  clearOverride.addEventListener("click", async () => {
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
      const override = {
        brightness: Number(brightness.value),
        contrast: Number(contrast.value),
        sepia: Number(sepia.value),
        grayscale: Number(grayscale.value),
        theme: getEffectiveValues().theme
      };
      browser.runtime.sendMessage({
        type: "SAVE_SITE_OVERRIDE",
        url: currentUrl,
        override
      });
    } else {
      currentSettings.brightness = Number(brightness.value);
      currentSettings.contrast = Number(contrast.value);
      currentSettings.sepia = Number(sepia.value);
      currentSettings.grayscale = Number(grayscale.value);
      currentSettings.dimImages = dimImages.checked;
      currentSettings.imageOpacity = Number(imageOpacity.value);
      browser.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        settings: currentSettings
      });
    }
  }

  let saveTimer = null;
  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSliders, 150);
  }

  [brightness, contrast, sepia, grayscale, imageOpacity].forEach((slider) => {
    slider.addEventListener("input", () => {
      $(slider.id + "Val").textContent = slider.value + "%";
      debounceSave();
    });
  });

  dimImages.addEventListener("change", () => {
    opacityRow.style.display = dimImages.checked ? "flex" : "none";
    debounceSave();
  });

  resetBtn.addEventListener("click", async () => {
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
    await browser.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: currentSettings
    });
    perSiteToggle.checked = false;
    await loadState();
  });

  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
})();
