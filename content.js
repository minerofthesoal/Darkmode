// OLED Dark Mode v2 - Content Script
// Runs in every frame at document_start.
// Handles: class toggle, per-site overrides, theme presets,
// native dark-mode detection, smart inline-bg fixing.

(function () {
  "use strict";

  // ── State ──
  let currentActive = false;
  let currentSettings = null;
  let observer = null;
  let _fixScheduled = false;

  // ── Apply state to the page ──

  function applyState(active, settings) {
    currentActive = active;
    currentSettings = settings;
    const root = document.documentElement;
    if (!root) return;

    // Check if site already provides dark mode and user wants to respect it
    if (active && settings && settings.respectNativeDark && siteHasNativeDark()) {
      active = false;
    }

    if (active) {
      root.classList.add("oled-dark-active");

      // Theme preset
      const theme = getEffectiveTheme(settings);
      root.setAttribute("data-oled-theme", theme);

      // Image dimming
      if (settings && settings.dimImages) {
        root.classList.add("oled-dim-images");
        root.style.setProperty(
          "--oled-image-opacity",
          String((settings.imageOpacity || 90) / 100)
        );
      } else {
        root.classList.remove("oled-dim-images");
        root.style.removeProperty("--oled-image-opacity");
      }

      // Extra filter adjustments
      applyExtraFilter(root, settings);

      // Fix bright inline backgrounds
      fixInlineBackgrounds();

      startObserver();
    } else {
      root.classList.remove("oled-dark-active", "oled-dim-images");
      root.removeAttribute("data-oled-theme");
      root.style.removeProperty("--oled-image-opacity");
      root.style.removeProperty("--oled-extra-filter");

      // Restore any backgrounds we overrode
      restoreBackgrounds();

      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
  }

  // ── Theme helpers ──

  function getEffectiveTheme(settings) {
    if (!settings) return "oled";
    // Per-site override takes priority
    const host = location.hostname;
    if (settings.siteOverrides && settings.siteOverrides[host]) {
      const override = settings.siteOverrides[host];
      if (override.theme) return override.theme;
    }
    return settings.theme || "oled";
  }

  // ── Extra filter (brightness / contrast / sepia / grayscale) ──

  function applyExtraFilter(root, settings) {
    if (!settings) return;
    // Merge per-site overrides
    const s = getMergedSettings(settings);
    const parts = [];
    if (s.brightness !== 100) parts.push("brightness(" + s.brightness + "%)");
    if (s.contrast !== 100) parts.push("contrast(" + s.contrast + "%)");
    if (s.sepia > 0) parts.push("sepia(" + s.sepia + "%)");
    if (s.grayscale > 0) parts.push("grayscale(" + s.grayscale + "%)");

    if (parts.length > 0) {
      // Layer extra filters via a wrapper style on body
      document.body &&
        (document.body.style.filter = parts.join(" "));
    } else {
      document.body &&
        document.body.style.removeProperty("filter");
    }
  }

  function getMergedSettings(settings) {
    const base = {
      brightness: settings.brightness || 100,
      contrast: settings.contrast || 100,
      sepia: settings.sepia || 0,
      grayscale: settings.grayscale || 0
    };
    const host = location.hostname;
    if (settings.siteOverrides && settings.siteOverrides[host]) {
      const o = settings.siteOverrides[host];
      if (o.brightness !== undefined) base.brightness = o.brightness;
      if (o.contrast !== undefined) base.contrast = o.contrast;
      if (o.sepia !== undefined) base.sepia = o.sepia;
      if (o.grayscale !== undefined) base.grayscale = o.grayscale;
    }
    return base;
  }

  // ── Native dark-mode detection ──

  function siteHasNativeDark() {
    // Check if the page's computed background is already dark
    if (!document.body) return false;
    const bg = getComputedStyle(document.body).backgroundColor;
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return false;
    return isDarkColor(bg);
  }

  function isDarkColor(color) {
    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    const lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
    return lum < 50;
  }

  // ── Inline background fixing ──

  function isLightColor(color) {
    if (!color) return false;
    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    const lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
    return lum > 180;
  }

  const MEDIA_TAGS = new Set(["img", "video", "canvas", "picture", "svg", "iframe", "object", "embed"]);

  function fixInlineBackgrounds() {
    if (_fixScheduled) return;
    _fixScheduled = true;
    requestAnimationFrame(() => {
      _fixScheduled = false;
      const els = document.querySelectorAll("[style*='background']");
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (MEDIA_TAGS.has(el.tagName.toLowerCase())) continue;
        if (el.dataset.oledFixed) continue;
        const bg = el.style.backgroundColor || "";
        if (isLightColor(bg)) {
          el.dataset.oledOrigBg = bg;
          el.dataset.oledFixed = "1";
          el.style.backgroundColor = "#000";
        }
      }
    });
  }

  function restoreBackgrounds() {
    const fixed = document.querySelectorAll("[data-oled-fixed]");
    for (let i = 0; i < fixed.length; i++) {
      const el = fixed[i];
      if (el.dataset.oledOrigBg) {
        el.style.backgroundColor = el.dataset.oledOrigBg;
      }
      delete el.dataset.oledOrigBg;
      delete el.dataset.oledFixed;
    }
    // Also clear body filter
    document.body && document.body.style.removeProperty("filter");
  }

  // ── MutationObserver for dynamic content ──

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!document.documentElement.classList.contains("oled-dark-active")) return;
      let needsFix = false;
      for (const mut of mutations) {
        if (mut.type === "childList" && mut.addedNodes.length > 0) {
          needsFix = true;
          break;
        }
        if (mut.type === "attributes" && mut.attributeName === "style") {
          needsFix = true;
          break;
        }
      }
      if (needsFix) fixInlineBackgrounds();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"]
    });
  }

  // ── Init ──

  function init() {
    browser.runtime
      .sendMessage({ type: "GET_STATE" })
      .then(function (resp) {
        applyState(resp.active, resp.settings);
      })
      .catch(function () {
        // Background may not be ready; retry once
        setTimeout(function () {
          browser.runtime
            .sendMessage({ type: "GET_STATE" })
            .then(function (resp) {
              applyState(resp.active, resp.settings);
            })
            .catch(function () {});
        }, 500);
      });
  }

  if (document.documentElement) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }

  // Also re-check once body is available (for native dark detection)
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", function () {
      if (currentActive && currentSettings && currentSettings.respectNativeDark && siteHasNativeDark()) {
        applyState(false, currentSettings);
      }
    }, { once: true });
  }

  // ── Listen for live updates from background ──
  browser.runtime.onMessage.addListener(function (msg) {
    if (msg.type === "UPDATE_STATE") {
      applyState(msg.active, msg.settings);
    }
  });
})();
