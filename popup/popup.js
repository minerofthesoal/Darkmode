// OLED Dark Mode - Popup script
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const globalToggle = $("globalToggle");
  const siteLabel = $("siteLabel");
  const siteToggle = $("siteToggle");
  const brightness = $("brightness");
  const contrast = $("contrast");
  const sepia = $("sepia");
  const grayscale = $("grayscale");
  const dimImages = $("dimImages");
  const imageOpacity = $("imageOpacity");
  const opacityRow = $("opacityRow");
  const resetBtn = $("resetBtn");
  const optionsLink = $("optionsLink");

  let currentSettings = null;
  let currentUrl = "";

  // ── Load state ──
  async function loadState() {
    const resp = await browser.runtime.sendMessage({ type: "GET_STATE_FOR_TAB" });
    currentSettings = resp.settings;
    currentUrl = resp.url || "";

    globalToggle.checked = currentSettings.enabled;

    // Site label
    try {
      const host = new URL(currentUrl).hostname;
      siteLabel.textContent = host;
      const excluded = currentSettings.excludedSites.includes(host);
      siteToggle.textContent = excluded ? "Include site" : "Exclude site";
    } catch {
      siteLabel.textContent = "—";
      siteToggle.disabled = true;
    }

    // Sliders
    brightness.value = currentSettings.brightness;
    $("brightnessVal").textContent = currentSettings.brightness + "%";
    contrast.value = currentSettings.contrast;
    $("contrastVal").textContent = currentSettings.contrast + "%";
    sepia.value = currentSettings.sepia;
    $("sepiaVal").textContent = currentSettings.sepia + "%";
    grayscale.value = currentSettings.grayscale;
    $("grayscaleVal").textContent = currentSettings.grayscale + "%";

    dimImages.checked = currentSettings.dimImages;
    imageOpacity.value = currentSettings.imageOpacity;
    $("imageOpacityVal").textContent = currentSettings.imageOpacity + "%";
    opacityRow.style.display = currentSettings.dimImages ? "flex" : "none";
  }

  loadState();

  // ── Event handlers ──

  globalToggle.addEventListener("change", async () => {
    await browser.runtime.sendMessage({ type: "TOGGLE" });
    await loadState();
  });

  siteToggle.addEventListener("click", async () => {
    try {
      const host = new URL(currentUrl).hostname;
      const excluded = currentSettings.excludedSites.includes(host);
      await browser.runtime.sendMessage({
        type: excluded ? "INCLUDE_SITE" : "EXCLUDE_SITE",
        url: currentUrl
      });
      await loadState();
    } catch {}
  });

  function saveSliders() {
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

  // Debounced save for sliders
  let saveTimer = null;
  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSliders, 200);
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
    currentSettings.brightness = 100;
    currentSettings.contrast = 100;
    currentSettings.sepia = 0;
    currentSettings.grayscale = 0;
    currentSettings.dimImages = false;
    currentSettings.imageOpacity = 90;
    await browser.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: currentSettings
    });
    await loadState();
  });

  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
})();
