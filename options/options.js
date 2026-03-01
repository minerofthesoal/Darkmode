// OLED Dark Mode - Options page script
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const scheduleEnabled = $("scheduleEnabled");
  const scheduleRow = $("scheduleRow");
  const scheduleStart = $("scheduleStart");
  const scheduleEnd = $("scheduleEnd");
  const excludedList = $("excludedList");
  const newSite = $("newSite");
  const addSiteBtn = $("addSiteBtn");
  const saveBtn = $("saveBtn");
  const savedMsg = $("savedMsg");

  let settings = null;

  // ── Load ──
  async function load() {
    const resp = await browser.runtime.sendMessage({ type: "GET_STATE" });
    settings = resp.settings;

    scheduleEnabled.checked = settings.scheduleEnabled;
    scheduleRow.style.display = settings.scheduleEnabled ? "flex" : "none";
    scheduleStart.value = settings.scheduleStart;
    scheduleEnd.value = settings.scheduleEnd;

    renderExcluded();
  }

  function renderExcluded() {
    excludedList.innerHTML = "";
    settings.excludedSites.forEach((site) => {
      const li = document.createElement("li");
      li.textContent = site;
      const btn = document.createElement("button");
      btn.textContent = "\u00d7";
      btn.title = "Remove";
      btn.addEventListener("click", () => {
        settings.excludedSites = settings.excludedSites.filter((s) => s !== site);
        renderExcluded();
      });
      li.appendChild(btn);
      excludedList.appendChild(li);
    });
  }

  load();

  // ── Events ──

  scheduleEnabled.addEventListener("change", () => {
    scheduleRow.style.display = scheduleEnabled.checked ? "flex" : "none";
  });

  addSiteBtn.addEventListener("click", () => {
    const val = newSite.value.trim().toLowerCase();
    if (val && !settings.excludedSites.includes(val)) {
      settings.excludedSites.push(val);
      renderExcluded();
      newSite.value = "";
    }
  });

  newSite.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSiteBtn.click();
  });

  saveBtn.addEventListener("click", async () => {
    settings.scheduleEnabled = scheduleEnabled.checked;
    settings.scheduleStart = scheduleStart.value;
    settings.scheduleEnd = scheduleEnd.value;

    await browser.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings
    });

    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 2000);
  });
})();
