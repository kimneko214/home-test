// Personal Dashboard visit logger v10
// Records one row when this page is loaded/reloaded.
// It never reads GPS or the saved home address.

(() => {
  if (window.__visitLoggedV10) return;
  window.__visitLoggedV10 = true;

  const api = String(
    window.CONFIG?.TRANSIT_API_URL || ""
  ).replace(/\/+$/, "");

  if (!api) return;

  const payload = {
    page: location.pathname + location.search,
    referrer: document.referrer || "",
    language: navigator.language || ""
  };

  fetch(`${api}/visit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    keepalive: true,
    cache: "no-store"
  }).catch(() => {
    // Logging failure must never break the dashboard.
  });
})();
