const CACHE =
  "dashboard-v7";


const ASSETS = [

  "./",

  "./index.html",

  "./style.css",

  "./config.js",

  "./app.js",

  "./manifest.webmanifest",

  "./icon.svg"

];



self.addEventListener(
  "install",
  event => {

    event.waitUntil(

      caches
        .open(
          CACHE
        )
        .then(
          cache =>
            cache.addAll(
              ASSETS
            )
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
                    caches.delete(
                      key
                    )
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


    // Worker API 永远不缓存
    if (
      url.hostname.endsWith(
        "workers.dev"
      )
    ) {

      return;

    }


    event.respondWith(

      fetch(
        event.request
      )

        .then(
          response => {


            const copy =
              response.clone();


            caches
              .open(
                CACHE
              )
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
