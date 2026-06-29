const APP_ID = "top.bayanlistening.tafsirlingo";

const $ = (id) => document.getElementById(id);

async function loadStatus() {
  const dot = $("dot");
  const label = $("label");
  try {
    const resp = await browser.runtime.sendNativeMessage(APP_ID, { type: "GET_CONFIG" });
    if (resp?.ok && resp?.config?.hasKey) {
      dot.classList.add("popup__dot--ok");
      label.textContent = "AI Configured";
    } else {
      label.textContent = "Not Configured";
    }
  } catch (e) {
    label.textContent = "Native bridge unavailable";
  }
}

$("open-settings").addEventListener("click", async () => {
  try {
    await browser.runtime.sendNativeMessage(APP_ID, { type: "OPEN_SETTINGS" });
  } catch (e) {
    console.error("[TafsirLingo] open settings failed", e);
  }
});

loadStatus();