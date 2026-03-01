// OLED Dark Mode v3 - Content Script
// Runs in every frame at document_start.
// Handles: class toggle, per-site overrides, theme presets,
// native dark-mode detection, text readability, smart inline-bg fixing.

(function () {
  "use strict";

  // ── State ──
  var currentActive = false;
  var currentSettings = null;
  var observer = null;
  var _fixScheduled = false;
  var _fixThrottleId = 0;

  // ── Apply state to the page ──

  function applyState(active, settings) {
    currentActive = active;
    currentSettings = settings;
    var root = document.documentElement;
    if (!root) return;

    // Check if site already provides dark mode and user wants to respect it
    if (active && settings && settings.respectNativeDark && siteHasNativeDark()) {
      active = false;
    }

    if (active) {
      root.classList.add("oled-dark-active");

      // Theme preset
      var theme = getEffectiveTheme(settings);
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

      // Text readability
      if (settings && settings.textReadability) {
        root.classList.add("oled-readable-text");
      } else {
        root.classList.remove("oled-readable-text");
      }

      // Extra filter adjustments
      applyExtraFilter(root, settings);

      // Fix bright inline backgrounds
      fixInlineBackgrounds();

      startObserver();
    } else {
      root.classList.remove("oled-dark-active", "oled-dim-images", "oled-readable-text");
      root.removeAttribute("data-oled-theme");
      root.style.removeProperty("--oled-image-opacity");
      root.style.removeProperty("--oled-extra-filter");

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
    var host = location.hostname;
    if (settings.siteOverrides && settings.siteOverrides[host]) {
      var override = settings.siteOverrides[host];
      if (override.theme) return override.theme;
    }
    return settings.theme || "oled";
  }

  // ── Extra filter (brightness / contrast / sepia / grayscale) ──

  function applyExtraFilter(root, settings) {
    if (!settings) return;
    var s = getMergedSettings(settings);
    var parts = [];
    if (s.brightness !== 100) parts.push("brightness(" + s.brightness + "%)");
    if (s.contrast !== 100) parts.push("contrast(" + s.contrast + "%)");
    if (s.sepia > 0) parts.push("sepia(" + s.sepia + "%)");
    if (s.grayscale > 0) parts.push("grayscale(" + s.grayscale + "%)");

    if (parts.length > 0) {
      if (document.body) document.body.style.filter = parts.join(" ");
    } else {
      if (document.body) document.body.style.removeProperty("filter");
    }
  }

  function getMergedSettings(settings) {
    var base = {
      brightness: settings.brightness || 100,
      contrast: settings.contrast || 100,
      sepia: settings.sepia || 0,
      grayscale: settings.grayscale || 0
    };
    var host = location.hostname;
    if (settings.siteOverrides && settings.siteOverrides[host]) {
      var o = settings.siteOverrides[host];
      if (o.brightness !== undefined) base.brightness = o.brightness;
      if (o.contrast !== undefined) base.contrast = o.contrast;
      if (o.sepia !== undefined) base.sepia = o.sepia;
      if (o.grayscale !== undefined) base.grayscale = o.grayscale;
    }
    return base;
  }

  // ── Native dark-mode detection ──

  function siteHasNativeDark() {
    if (!document.body) return false;
    var bg = getComputedStyle(document.body).backgroundColor;
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return false;
    return isDarkColor(bg);
  }

  function isDarkColor(color) {
    var m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    var lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
    return lum < 50;
  }

  // ── Inline background fixing ──

  function isLightColor(color) {
    if (!color) return false;
    var m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    var lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
    return lum > 180;
  }

  var MEDIA_TAGS = {
    img: 1, video: 1, canvas: 1, picture: 1, svg: 1,
    iframe: 1, object: 1, embed: 1
  };

  function fixInlineBackgrounds() {
    if (_fixScheduled) return;
    _fixScheduled = true;
    requestAnimationFrame(function () {
      _fixScheduled = false;
      var els = document.querySelectorAll("[style*='background']");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (MEDIA_TAGS[el.tagName.toLowerCase()]) continue;
        if (el.dataset.oledFixed) continue;
        var bg = el.style.backgroundColor || "";
        if (isLightColor(bg)) {
          el.dataset.oledOrigBg = bg;
          el.dataset.oledFixed = "1";
          el.style.backgroundColor = "#000";
        }
      }
    });
  }

  function restoreBackgrounds() {
    var fixed = document.querySelectorAll("[data-oled-fixed]");
    for (var i = 0; i < fixed.length; i++) {
      var el = fixed[i];
      if (el.dataset.oledOrigBg) {
        el.style.backgroundColor = el.dataset.oledOrigBg;
      }
      delete el.dataset.oledOrigBg;
      delete el.dataset.oledFixed;
    }
    if (document.body) document.body.style.removeProperty("filter");
  }

  // ── MutationObserver for dynamic content (throttled) ──

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (mutations) {
      if (!document.documentElement.classList.contains("oled-dark-active")) return;
      var needsFix = false;
      for (var j = 0; j < mutations.length; j++) {
        var mut = mutations[j];
        if (mut.type === "childList" && mut.addedNodes.length > 0) {
          needsFix = true;
          break;
        }
        if (mut.type === "attributes" && mut.attributeName === "style") {
          needsFix = true;
          break;
        }
      }
      if (needsFix) {
        // Throttle: max one fix per 100ms
        clearTimeout(_fixThrottleId);
        _fixThrottleId = setTimeout(fixInlineBackgrounds, 100);
      }
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

  // Re-check once body is available (for native dark detection)
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
