/* Prototype settings panel: a subtle gear (top-left) opens the toggles. Not part of the design. */
(() => {
  const gear = document.getElementById("protoGear");
  const panel = document.getElementById("protoPanel");
  if (!gear || !panel) return;
  const set = (open) => { panel.hidden = !open; gear.setAttribute("aria-expanded", String(open)); };
  gear.addEventListener("click", (e) => { e.stopPropagation(); set(panel.hidden); });
  document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target)) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
})();
