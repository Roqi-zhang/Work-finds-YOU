// Persist theme across preview pages
(function () {
  const saved = localStorage.getItem("swiss-theme") || "light";
  document.documentElement.dataset.theme = saved;
  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    btn.setAttribute("aria-label", "toggle theme");
    btn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("swiss-theme", next);
    });
  });
})();
