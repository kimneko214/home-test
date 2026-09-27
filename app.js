const cfg = CONFIG;


// ============================================================
// 教材库
// ============================================================

const libraryBtn =
  document.getElementById("libraryBtn");

if (
  libraryBtn &&
  cfg.TEXTBOOK_LIBRARY_URL
) {
  libraryBtn.href =
    cfg.TEXTBOOK_LIBRARY_URL;
}


// ============================================================
// 顶部本机日期 / 时间
// ============================================================

function updateClock() {
  const now =
    new Date();

  const localTime =
    new Intl.DateTimeFormat(
      "zh-CN",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    ).format(now);

  const localDate =
    new Intl.DateTimeFormat(
      "zh-CN",
      {
        month: "long",
        day: "numeric",
        weekday: "short"
      }
    ).format(now);

  const todayText =
    document.getElementById(
      "todayText"
    );

  const localTimeElement =
    document.getElementById(
      "localTime"
    );

  if (todayText) {
    todayText.textContent =
      localDate;
  }

  if (localTimeElement) {
    localTimeElement.textContent =
      localTime;
  }
}

updateClock();

setInterval(
  updateClock,
  30000
);


// ============================================================
// 日本邮政包裹：直接在卡片显示实时状态
// ============================================================

function japanPostTrackingUrl(
  trackingNumber
) {
  return (
    "https://trackings.post.japanpost.jp/services/srv/search/direct" +
    "?locale=ja" +
    "&searchKind=S002" +
    `&reqCodeNo1=${encodeURIComponent(trackingNumber)}`
  );
}


async function copyTrackingNumber(
  trackingNumber,
  button
) {
  try {
    await navigator
      .clipboard
      .writeText(
        trackingNumber
      );

    const oldText =
      button.textContent;

    button.textContent =
      "已复制";

    setTimeout(
      () => {
        button.textContent =
          oldText;
      },
      1200
    );
  }

  catch (error) {
    window.prompt(
      "复制这个追踪号码：",
      trackingNumber
    );
  }
}


function packageStatusMeta(
  category
) {
  const map = {

    delivered: {
      label:
        "已送达",
      className:
        "delivered",
      icon:
        "✓"
    },

    out_for_delivery: {
      label:
        "正在派送",
      className:
        "out-for-delivery",
      icon:
        "●"
    },

    customs: {
      label:
        "海关处理中",
      className:
        "customs",
      icon:
        "●"
    },

    held: {
      label:
        "保管中",
      className:
        "held",
      icon:
        "●"
    },

    accepted: {
      label:
        "日本邮政已收件",
      className:
        "accepted",
      icon:
        "●"
    },

    returned: {
      label:
        "退回中",
      className:
        "returned",
      icon:
        "!"
    },

    in_transit: {
      label:
        "运输中",
      className:
        "in-transit",
      icon:
        "●"
    }

  };

  return (
    map[category] ||
    {
      label:
        "运输状态",
      className:
        "unknown",
      icon:
        "●"
    }
  );
}


function renderPackageSkeletons() {
  const container =
    document.getElementById(
      "packageList"
    );

  if (!container) {
    return;
  }

  const packages =
    Array.isArray(
      cfg.JAPAN_POST_PACKAGES
    )
      ? cfg.JAPAN_POST_PACKAGES
      : [];

  if (
    packages.length === 0
  ) {
    container.innerHTML = `

      <div class="package-empty">
        暂无包裹
      </div>

    `;

    return;
  }

  container.innerHTML =
    packages
      .map(
        (item, index) => {

          const trackingNumber =
            String(
              item.trackingNumber ||
              ""
            )
            .trim()
            .toUpperCase();

          const label =
            item.label ||
            `包裹 ${index + 1}`;

          return `

            <div
              class="package-item"
              data-package-number="${escapeHtml(trackingNumber)}"
            >

              <div class="package-item-top">

                <div>

                  <strong>
                    ${escapeHtml(label)}
                  </strong>

                  <small>
                    ${escapeHtml(
                      item.note ||
                      "日本 → 加拿大"
                    )}
                  </small>

                </div>

                <span class="package-badge">
                  Japan Post
                </span>

              </div>


              <div class="package-live-loading">

                <span class="package-loading-dot"></span>

                正在读取日本邮政…

              </div>


              <code>
                ${escapeHtml(trackingNumber)}
              </code>

            </div>

          `;

        }
      )
      .join("");
}


function renderPackageResult(
  configItem,
  result,
  index
) {
  const trackingNumber =
    String(
      configItem.trackingNumber ||
      ""
    )
    .trim()
    .toUpperCase();

  const label =
    configItem.label ||
    `包裹 ${index + 1}`;

  const note =
    configItem.note ||
    "日本 → 加拿大";

  const officialUrl =
    result?.officialUrl ||
    japanPostTrackingUrl(
      trackingNumber
    );

  if (
    !result ||
    !result.ok
  ) {
    return `

      <div
        class="package-item"
        data-package-number="${escapeHtml(trackingNumber)}"
      >

        <div class="package-item-top">

          <div>

            <strong>
              ${escapeHtml(label)}
            </strong>

            <small>
              ${escapeHtml(note)}
            </small>

          </div>

          <span class="package-badge">
            Japan Post
          </span>

        </div>


        <div class="package-status-line error">

          <span class="package-status-dot">
            !
          </span>

          <div>

            <strong>
              暂时无法自动读取
            </strong>

            <small>
              ${escapeHtml(
                result?.error ||
                "稍后会自动重试"
              )}
            </small>

          </div>

        </div>


        <code>
          ${escapeHtml(trackingNumber)}
        </code>


        <div class="package-actions">

          <a
            href="${escapeHtml(officialUrl)}"
            target="_blank"
            rel="noopener"
          >
            官方详情
          </a>

          <button
            type="button"
            class="copy-tracking"
            data-tracking="${escapeHtml(trackingNumber)}"
          >
            复制单号
          </button>

        </div>

      </div>

    `;
  }


  const latest =
    result.latest ||
    {};

  const meta =
    packageStatusMeta(
      latest.category
    );

  const location = [
    latest.office,
    latest.region
  ]
    .filter(Boolean)
    .join(" · ");

  const history =
    Array.isArray(
      result.history
    )
      ? result.history
      : [];

  const historyHtml =
    history
      .slice(
        0,
        3
      )
      .map(
        (event, eventIndex) => {

          const eventLocation = [
            event.office,
            event.region
          ]
            .filter(Boolean)
            .join(" · ");

          return `

            <div
              class="package-history-row ${
                eventIndex === 0
                  ? "latest"
                  : ""
              }"
            >

              <span class="package-history-marker"></span>

              <div class="package-history-body">

                <strong>
                  ${escapeHtml(
                    event.statusZh ||
                    event.status ||
                    "更新"
                  )}
                </strong>

                <small>
                  ${escapeHtml(
                    event.date ||
                    ""
                  )}
                  ${
                    eventLocation
                      ? ` · ${escapeHtml(eventLocation)}`
                      : ""
                  }
                </small>

              </div>

            </div>

          `;

        }
      )
      .join("");


  return `

    <div
      class="package-item"
      data-package-number="${escapeHtml(trackingNumber)}"
    >

      <div class="package-item-top">

        <div>

          <strong>
            ${escapeHtml(label)}
          </strong>

          <small>
            ${escapeHtml(note)}
          </small>

        </div>

        <span class="package-badge">
          ${escapeHtml(
            result.productType ||
            "Japan Post"
          )}
        </span>

      </div>


      <div
        class="package-status-line ${meta.className}"
      >

        <span class="package-status-dot">
          ${meta.icon}
        </span>

        <div>

          <strong>
            ${escapeHtml(
              latest.statusZh ||
              meta.label
            )}
          </strong>

          <small>
            ${escapeHtml(
              latest.status ||
              ""
            )}
          </small>

        </div>

      </div>


      <div class="package-latest-meta">

        <span>
          ${escapeHtml(
            latest.date ||
            "—"
          )}
        </span>

        ${
          location
            ? `
              <span>
                ${escapeHtml(location)}
              </span>
            `
            : ""
        }

      </div>


      ${
        latest.detail
          ? `
            <div class="package-detail">
              ${escapeHtml(latest.detail)}
            </div>
          `
          : ""
      }


      <code>
        ${escapeHtml(trackingNumber)}
      </code>


      ${
        historyHtml
          ? `
            <div class="package-history">
              ${historyHtml}
            </div>
          `
          : ""
      }


      <div class="package-actions">

        <a
          href="${escapeHtml(officialUrl)}"
          target="_blank"
          rel="noopener"
        >
          官方详情
        </a>

        <button
          type="button"
          class="copy-tracking"
          data-tracking="${escapeHtml(trackingNumber)}"
        >
          复制单号
        </button>

      </div>

    </div>

  `;
}


function bindPackageButtons() {
  document
    .querySelectorAll(
      ".copy-tracking"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            copyTrackingNumber(
              button.dataset.tracking,
              button
            );

          }
        );

      }
    );
}


async function loadPackages() {
  const container =
    document.getElementById(
      "packageList"
    );

  const refreshButton =
    document.getElementById(
      "refreshPackages"
    );

  if (!container) {
    return;
  }

  const packages =
    Array.isArray(
      cfg.JAPAN_POST_PACKAGES
    )
      ? cfg.JAPAN_POST_PACKAGES
      : [];

  if (
    packages.length === 0
  ) {
    renderPackageSkeletons();
    return;
  }

  refreshButton
    ?.classList
    .add(
      "spinning"
    );

  try {
    const numbers =
      packages
        .map(
          item =>
            String(
              item.trackingNumber ||
              ""
            )
            .trim()
            .toUpperCase()
        )
        .filter(Boolean);

    const api =
      String(
        cfg.TRANSIT_API_URL ||
        ""
      )
      .replace(
        /\/+$/,
        ""
      );

    if (!api) {
      throw new Error(
        "没有配置 Worker 地址"
      );
    }

    const response =
      await fetch(
        `${api}/japan-post?tracking=${encodeURIComponent(
          numbers.join(",")
        )}`,
        {
          cache:
            "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `Worker HTTP ${response.status}: ${await response.text()}`
      );
    }

    const data =
      await response.json();

    if (data.error) {
      throw new Error(
        data.detail ||
        data.error
      );
    }

    const results =
      Array.isArray(
        data.packages
      )
        ? data.packages
        : [];

    const byNumber =
      new Map(
        results.map(
          item => [
            String(
              item.trackingNumber ||
              ""
            )
            .toUpperCase(),
            item
          ]
        )
      );

    container.innerHTML =
      packages
        .map(
          (item, index) =>
            renderPackageResult(
              item,
              byNumber.get(
                String(
                  item.trackingNumber ||
                  ""
                )
                .trim()
                .toUpperCase()
              ),
              index
            )
        )
        .join("");

    bindPackageButtons();

    const update =
      document.getElementById(
        "packageUpdatedAt"
      );

    if (update) {
      const generated =
        new Date(
          data.generatedAt ||
          Date.now()
        );

      update.textContent =
        `更新 ${generated.toLocaleTimeString(
          "zh-CN",
          {
            hour:
              "2-digit",
            minute:
              "2-digit"
          }
        )}`;
    }
  }

  catch (error) {
    console.error(
      "Japan Post:",
      error
    );

    container.innerHTML =
      packages
        .map(
          (item, index) =>
            renderPackageResult(
              item,
              {
                ok:
                  false,

                error:
                  error.message ||
                  String(error),

                officialUrl:
                  japanPostTrackingUrl(
                    item.trackingNumber
                  )
              },
              index
            )
        )
        .join("");

    bindPackageButtons();
  }

  finally {
    refreshButton
      ?.classList
      .remove(
        "spinning"
      );
  }
}


renderPackageSkeletons();

document
  .getElementById(
    "refreshPackages"
  )
  ?.addEventListener(
    "click",
    loadPackages
  );

loadPackages();

setInterval(
  loadPackages,
  Number(
    cfg.JAPAN_POST_REFRESH_MS ||
    600000
  )
);


// ============================================================
// 第二张重要通知
// ============================================================

function renderImportantNotice() {
  const notice =
    cfg.IMPORTANT_NOTICE ||
    {};

  const icon =
    document.getElementById(
      "noticeIcon"
    );

  const title =
    document.getElementById(
      "noticeTitle"
    );

  const text =
    document.getElementById(
      "noticeText"
    );

  const detail =
    document.getElementById(
      "noticeDetail"
    );

  const button =
    document.getElementById(
      "noticeButton"
    );

  if (icon) {
    icon.textContent =
      notice.icon ||
      "🔔";
  }

  if (title) {
    title.textContent =
      notice.title ||
      "重要提醒";
  }

  if (text) {
    text.textContent =
      notice.text ||
      "";
  }

  if (detail) {
    detail.textContent =
      notice.detail ||
      "";
  }

  if (
    button &&
    notice.buttonText &&
    notice.buttonUrl
  ) {
    button.hidden =
      false;

    button.textContent =
      notice.buttonText;

    button.href =
      notice.buttonUrl;
  }

  else if (button) {
    button.hidden =
      true;
  }
}

renderImportantNotice();


// ============================================================
// 回家
// ============================================================

const HOME_ADDRESS_KEY =
  "dashboard.homeAddress";

const MAP_PROVIDER_KEY =
  "dashboard.mapProvider";

const homeDialog =
  document.getElementById("homeDialog");

const homeForm =
  document.getElementById("homeForm");

const homeAddress =
  document.getElementById("homeAddress");

const mapProvider =
  document.getElementById("mapProvider");

const homeStatus =
  document.getElementById("homeStatus");

function getHome() {
  return (
    localStorage.getItem(
      HOME_ADDRESS_KEY
    ) || ""
  );
}

function getProvider() {
  return (
    localStorage.getItem(
      MAP_PROVIDER_KEY
    ) || "google"
  );
}

function refreshHomeStatus() {
  homeStatus.textContent =
    getHome()
      ? "地址已保存在这台设备。"
      : "第一次使用请设置家的地址。";
}

function openHomeSettings() {
  homeAddress.value =
    getHome();

  mapProvider.value =
    getProvider();

  homeDialog.showModal();
}

function navigateHome() {
  const address =
    getHome();

  if (!address) {
    openHomeSettings();
    return;
  }

  const encoded =
    encodeURIComponent(
      address
    );

  const url =
    getProvider() === "apple"
      ? `https://maps.apple.com/?daddr=${encoded}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;

  window.open(
    url,
    "_blank",
    "noopener"
  );
}

document
  .getElementById("editHomeBtn")
  ?.addEventListener(
    "click",
    openHomeSettings
  );

document
  .getElementById("goHomeBtn")
  ?.addEventListener(
    "click",
    navigateHome
  );

homeForm?.addEventListener(
  "submit",
  event => {
    if (
      event.submitter?.value !==
      "save"
    ) {
      return;
    }

    event.preventDefault();

    const value =
      homeAddress
        .value
        .trim();

    if (!value) {
      homeAddress.focus();
      return;
    }

    localStorage.setItem(
      HOME_ADDRESS_KEY,
      value
    );

    localStorage.setItem(
      MAP_PROVIDER_KEY,
      mapProvider.value
    );

    homeDialog.close();

    refreshHomeStatus();
  }
);

document
  .getElementById("clearHomeBtn")
  ?.addEventListener(
    "click",
    () => {
      localStorage.removeItem(
        HOME_ADDRESS_KEY
      );

      localStorage.removeItem(
        MAP_PROVIDER_KEY
      );

      homeDialog.close();

      refreshHomeStatus();
    }
  );

refreshHomeStatus();


// ============================================================
// 整条线路搜索
// ============================================================

function openRouteMap(route) {
  const clean =
    String(route || "")
      .trim()
      .replace(
        /^route\s*/i,
        ""
      );

  if (!clean) return;

  location.href =
    `route.html?route=${encodeURIComponent(clean)}`;
}

document
  .getElementById("routeSearchForm")
  ?.addEventListener(
    "submit",
    event => {
      event.preventDefault();

      openRouteMap(
        document
          .getElementById(
            "routeSearchInput"
          )
          .value
      );
    }
  );

document
  .querySelectorAll(
    "[data-route]"
  )
  .forEach(
    button => {
      button.addEventListener(
        "click",
        () =>
          openRouteMap(
            button.dataset.route
          )
      );
    }
  );



// ============================================================
// 公交
// ============================================================

const arrivalsEl =
  document.getElementById(
    "arrivals"
  );

const transitStatus =
  document.getElementById(
    "transitStatus"
  );

const updatedAt =
  document.getElementById(
    "updatedAt"
  );

const refreshTransit =
  document.getElementById(
    "refreshTransit"
  );

function escapeHtml(
  value = ""
) {
  return String(value)
    .replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character])
    );
}

function getAllStopIds() {
  return [
    ...new Set(
      cfg.BUS_GROUPS
        .flatMap(
          group =>
            Array.isArray(
              group.stopIds
            )
              ? group.stopIds
              : []
        )
        .map(String)
    )
  ];
}

function matchesHeadsign(
  item,
  group
) {
  if (
    !Array.isArray(
      group.headsignIncludes
    ) ||
    group.headsignIncludes.length === 0
  ) {
    return true;
  }

  const headsign =
    String(
      item.headsign || ""
    ).toLowerCase();

  return group
    .headsignIncludes
    .some(
      keyword =>
        headsign.includes(
          String(keyword)
            .toLowerCase()
        )
    );
}

function getGroupArrivals(
  arrivals,
  group
) {
  return arrivals
    .filter(
      item =>
        String(item.route) ===
          String(group.route) &&
        group.stopIds
          .map(String)
          .includes(
            String(item.stopId)
          ) &&
        matchesHeadsign(
          item,
          group
        )
    )
    .sort(
      (a, b) =>
        Number(a.minutes) -
        Number(b.minutes)
    )
    .slice(
      0,
      3
    );
}

function buildBusMapUrl(
  item
) {
  const params =
    new URLSearchParams({
      tripId:
        item.tripId || "",
      route:
        item.route || "",
      stopId:
        item.stopId || "",
      minutes:
        String(
          item.minutes ?? ""
        ),
      headsign:
        item.headsign || "",
      realtime:
        item.realtime
          ? "1"
          : "0"
    });

  return (
    `bus.html?${params.toString()}`
  );
}


// ============================================================
// 延误显示
// ============================================================

function getDelayDisplay(
  item
) {
  if (
    !item.realtime ||
    item.delayMinutes === null ||
    item.delayMinutes === undefined ||
    !Number.isFinite(
      Number(
        item.delayMinutes
      )
    )
  ) {
    return null;
  }

  const delay =
    Number(
      item.delayMinutes
    );

  if (
    Math.abs(delay) <= 1
  ) {
    return {
      text: "基本准点",
      className:
        "ontime"
    };
  }

  if (
    delay > 0
  ) {
    return {
      text:
        `晚点 +${delay} min`,
      className:
        delay >= 5
          ? "late-strong"
          : "late"
    };
  }

  return {
    text:
      `提前 ${Math.abs(delay)} min`,
    className:
      "early"
  };
}


// ============================================================
// ETA chip
// ============================================================

function renderTimeChip(
  item
) {
  const minutes =
    Number(
      item.minutes
    );

  const mainText =
    Number.isFinite(minutes)
      ? (
          minutes <= 0
            ? "到站"
            : `${minutes} min`
        )
      : "--";

  const delay =
    getDelayDisplay(
      item
    );

  const predicted =
    item.predictedTime ||
    "";

  const scheduled =
    item.scheduledTime ||
    "";

  let timingHtml = "";

  if (
    item.realtime
  ) {
    timingHtml += `

      <span class="bus-timing-row live-row">

        <span>
          ● 实时
        </span>

        <b>
          ${escapeHtml(
            predicted || "--:--"
          )}
        </b>

      </span>

    `;

    if (
      scheduled
    ) {
      timingHtml += `

        <span class="bus-timing-row scheduled-row">

          <span>
            ○ 表定
          </span>

          <b>
            ${escapeHtml(
              scheduled
            )}
          </b>

        </span>

      `;
    }
  }

  else {
    timingHtml += `

      <span class="bus-timing-row scheduled-row">

        <span>
          ○ 表定
        </span>

        <b>
          ${escapeHtml(
            scheduled ||
            predicted ||
            "--:--"
          )}
        </b>

      </span>

    `;
  }

  if (delay) {
    timingHtml += `

      <span
        class="bus-delay ${delay.className}"
      >

        ${escapeHtml(
          delay.text
        )}

      </span>

    `;
  }

  if (
    item.scheduleInterpolated
  ) {
    timingHtml += `

      <span class="bus-estimated-note">

        表定时间为 GTFS 插值

      </span>

    `;
  }

  return `

    <a
      class="bus-time-chip ${
        item.realtime
          ? "live"
          : "scheduled"
      }"
      href="${escapeHtml(
        buildBusMapUrl(item)
      )}"
    >

      <strong>
        ${escapeHtml(
          mainText
        )}
      </strong>

      <div class="bus-timing-detail">
        ${timingHtml}
      </div>

    </a>

  `;
}


// ============================================================
// Render groups
// ============================================================

function renderTransitGroups(
  arrivals
) {
  arrivalsEl.innerHTML =
    cfg.BUS_GROUPS
      .map(
        group => {
          const buses =
            getGroupArrivals(
              arrivals,
              group
            );

          const times =
            buses.length
              ? buses
                  .map(
                    renderTimeChip
                  )
                  .join("")
              : `
                  <div class="no-bus">
                    暂无即将到站班次
                  </div>
                `;

          const headsign =
            buses[0]?.headsign ||
            "";

          return `

            <section class="bus-direction">

              <div class="bus-direction-head">

                <div class="bus-route">
                  ${escapeHtml(
                    group.route
                  )}
                </div>

                <div class="bus-direction-info">

                  <strong>
                    ${escapeHtml(
                      group.title
                    )}
                  </strong>

                  <small>
                    ${escapeHtml(
                      group.subtitle
                    )}
                  </small>

                  ${
                    headsign
                      ? `
                          <span class="bus-headsign">
                            ${escapeHtml(
                              headsign
                            )}
                          </span>
                        `
                      : ""
                  }

                </div>

              </div>

              <div class="bus-times">
                ${times}
              </div>

            </section>

          `;
        }
      )
      .join("");
}


// ============================================================
// Load Transit
// ============================================================

async function loadTransit() {
  refreshTransit
    ?.classList
    .add(
      "spinning"
    );

  transitStatus.textContent =
    "正在更新实时公交…";

  try {
    const stopIds =
      getAllStopIds();

    const api =
      cfg
        .TRANSIT_API_URL
        .replace(
          /\/+$/,
          ""
        );

    const response =
      await fetch(
        `${api}/arrivals?stops=${encodeURIComponent(
          stopIds.join(",")
        )}`,
        {
          cache:
            "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `Worker HTTP ${response.status}: ${await response.text()}`
      );
    }

    const data =
      await response.json();

    if (data.error) {
      throw new Error(
        data.detail ||
        data.error
      );
    }

    const arrivals =
      Array.isArray(
        data.arrivals
      )
        ? data.arrivals
        : [];

    renderTransitGroups(
      arrivals
    );

    const liveCount =
      arrivals.filter(
        item =>
          item.realtime === true
      ).length;

    transitStatus.textContent =
      arrivals.length
        ? `实时公交 · ${liveCount} 条实时预测 · 已显示表定时间对比`
        : "目前没有即将到站车辆。";

    const time =
      new Date(
        data.generatedAt ||
        Date.now()
      );

    updatedAt.textContent =
      `更新 ${time.toLocaleTimeString(
        "zh-CN",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      )}`;
  }

  catch (error) {
    console.error(error);

    transitStatus.textContent =
      "实时公交读取失败";

    arrivalsEl.innerHTML = `

      <div class="bus-error">
        ${escapeHtml(
          error.message ||
          String(error)
        )}
      </div>

    `;

    updatedAt.textContent =
      "连接失败";
  }

  finally {
    refreshTransit
      ?.classList
      .remove(
        "spinning"
      );
  }
}

refreshTransit
  ?.addEventListener(
    "click",
    loadTransit
  );

loadTransit();

setInterval(
  loadTransit,
  30000
);


// ============================================================
// Service Worker
// ============================================================

if (
  "serviceWorker" in navigator
) {
  window.addEventListener(
    "load",
    () =>
      navigator
        .serviceWorker
        .register(
          "./sw.js"
        )
        .catch(
          () => {}
        )
  );
}
