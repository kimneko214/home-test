const CACHE = "home-test-v6";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./app.js",
  "./bus.html",
  "./route.html",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener(
  "install",
  event => {
    event.waitUntil(
      caches
        .open(CACHE)
        .then(
          cache =>
            cache.addAll(ASSETS)
        )
    );

    self.skipWaiting();
  }
);

self.addEventListener(
  "activate",
  event => {
    event.waitUntil(
      caches
        .keys()
        .then(
          keys =>
            Promise.all(
              keys
                .filter(
                  key =>
                    key !== CACHE
                )
                .map(
                  key =>
                    caches.delete(key)
                )
            )
        )
    );

    self.clients.claim();
  }
);

self.addEventListener(
  "fetch",
  event => {
    if (
      event.request.method !==
      "GET"
    ) {
      return;
    }

    const url =
      new URL(
        event.request.url
      );

    if (
      url.hostname.endsWith(
        "workers.dev"
      ) ||
      url.hostname.includes(
        "tile.openstreetmap.org"
      ) ||
      url.hostname ===
        "unpkg.com" ||
      url.hostname ===
        "trackings.post.japanpost.jp"
    ) {
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then(
          response => {
            const copy =
              response.clone();

            caches
              .open(CACHE)
              .then(
                cache =>
                  cache.put(
                    event.request,
                    copy
                  )
              );

            return response;
          }
        )
        .catch(
          () =>
            caches.match(
              event.request
            )
        )
    );
  }
);
