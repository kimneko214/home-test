// Personal Dashboard visit logger v10.3
// Records one row when this page is loaded/reloaded.
// It never reads GPS or the saved home address.

(() => {
  if (window.__visitLoggedV103) return;
  window.__visitLoggedV103 = true;

  // IMPORTANT:
  // config.js uses `const CONFIG = {...}`.
  // Top-level const does NOT become window.CONFIG,
  // so use CONFIG directly when it exists.
  const api = String(
    (
      typeof CONFIG !== "undefined" &&
      CONFIG &&
      CONFIG.TRANSIT_API_URL
    )
      ? CONFIG.TRANSIT_API_URL
      : "https://ltc-home-bus2.jiangfan0611.workers.dev"
  ).replace(/\/+$/, "");

  const payload = {
    page:
      location.pathname +
      location.search,

    referrer:
      document.referrer || "",

    language:
      navigator.language || ""
  };

  fetch(
    `${api}/visit`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(
          payload
        ),

      keepalive:
        true,

      cache:
        "no-store"
    }
  )
    .then(
      response => {
        if (!response.ok) {
          console.warn(
            "Visit log failed:",
            response.status
          );
        }
      }
    )
    .catch(
      error => {
        // Logging failure must never break the dashboard,
        // but keep a console message for diagnostics.
        console.warn(
          "Visit log request failed:",
          error
        );
      }
    );
})();
