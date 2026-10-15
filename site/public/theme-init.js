// Runs before first paint (a blocking script in <head>) so the page never flashes the wrong theme.
// It is a separate file, not an inline script, so the Content-Security-Policy can stay `script-src 'self'`.
// Stored choice wins, then prefers-color-scheme, then dark (the default).
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("theme");
  } catch (e) {
    /* storage unavailable */
  }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
