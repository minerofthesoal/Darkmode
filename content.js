// OLED Dark Mode - Content Script
// Runs in every frame at document_start.
// Adds / removes the "oled-dark-active" class on <html> based on state.

(function () {
  "use strict";

  // ── Helpers ──

  function applyState(active, settings) {
    const root = document.documentElement;
    if (!root) return;

    if (active) {
      root.classList.add("oled-dark-active");

      // Image dimming
      if (settings && settings.dimImages) {
        root.classList.add("oled-dim-images");
        root.style.setProperty(
          "--oled-image-opacity",
          (settings.imageOpacity || 90) / 100
        );
      } else {
        root.classList.remove("oled-dim-images");
      }

      // Brightness / contrast / sepia / grayscale tweaks layered on top
      const extra = buildExtraFilter(settings);
      if (extra) {
        root.style.setProperty("--oled-extra-filter", extra);
      }

      // Fix elements with inline background-color that are bright
      fixInlineBackgrounds();
    } else {
      root.classList.remove("oled-dark-active", "oled-dim-images");
      root.style.removeProperty("--oled-image-opacity");
      root.style.removeProperty("--oled-extra-filter");
    }
  }

  function buildExtraFilter(settings) {
    if (!settings) return "";
    const parts = [];
    if (settings.brightness !== undefined && settings.brightness !== 100) {
      parts.push(`brightness(${settings.brightness}%)`);
    }
    if (settings.contrast !== undefined && settings.contrast !== 100) {
      parts.push(`contrast(${settings.contrast}%)`);
    }
    if (settings.sepia !== undefined && settings.sepia > 0) {
      parts.push(`sepia(${settings.sepia}%)`);
    }
    if (settings.grayscale !== undefined && settings.grayscale > 0) {
      parts.push(`grayscale(${settings.grayscale}%)`);
    }
    return parts.join(" ");
  }

  // Scan visible elements with bright inline backgrounds and neutralise them
  // so the filter inversion yields true OLED black instead of off-white.
  let _fixScheduled = false;
  function fixInlineBackgrounds() {
    if (_fixScheduled) return;
    _fixScheduled = true;
    requestAnimationFrame(() => {
      _fixScheduled = false;
      const elements = document.querySelectorAll("[style*='background']");
      elements.forEach((el) => {
        // Skip media elements
        const tag = el.tagName.toLowerCase();
        if (
          ["img", "video", "canvas", "picture", "svg", "iframe"].includes(tag)
        )
          return;
        const bg = el.style.backgroundColor || "";
        if (isLightColor(bg)) {
          el.dataset.oledOrigBg = bg;
          el.style.backgroundColor = "#000";
        }
      });
    });
  }

  function isLightColor(color) {
    if (!color) return false;
    // Parse rgb(r,g,b) or rgba
    const m = color.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
    );
    if (!m) return false;
    const [, r, g, b] = m.map(Number);
    // Perceived luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 180;
  }

  // ── Observe DOM changes to re-fix new bright elements ──
  let observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!document.documentElement.classList.contains("oled-dark-active"))
        return;
      let needsFix = false;
      for (const m of mutations) {
        if (m.type === "childList" && m.addedNodes.length > 0) {
          needsFix = true;
          break;
        }
        if (
          m.type === "attributes" &&
          m.attributeName === "style"
        ) {
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

  // Request state from background immediately
  function init() {
    browser.runtime
      .sendMessage({ type: "GET_STATE" })
      .then(({ active, settings }) => {
        applyState(active, settings);
        if (active) startObserver();
      })
      .catch(() => {
        // Extension context may not be ready yet; retry once
        setTimeout(() => {
          browser.runtime
            .sendMessage({ type: "GET_STATE" })
            .then(({ active, settings }) => {
              applyState(active, settings);
              if (active) startObserver();
            })
            .catch(() => {});
        }, 500);
      });
  }

  // Run as soon as possible
  if (document.documentElement) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }

  // Listen for live updates from background
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "UPDATE_STATE") {
      applyState(msg.active, msg.settings);
      if (msg.active) {
        startObserver();
      } else if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
  });
})();
