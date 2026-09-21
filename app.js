// ============================================================
// Personal Dashboard
// app.js
// ============================================================

const cfg = CONFIG;


// ============================================================
// 教材库链接
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
// 时间
// ============================================================

function updateClocks() {

  const now =
    new Date();


  // ========================================================
  // 顶部：
  // 使用手机 / 电脑自己的系统时区
  // ========================================================

  const localTime =
    new Intl.DateTimeFormat(
      "zh-CN",
      {
        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false
      }
    )
    .format(now);


  const localDate =
    new Intl.DateTimeFormat(
      "zh-CN",
      {
        month:
          "long",

        day:
          "numeric",

        weekday:
          "short"
      }
    )
    .format(now);


  const todayText =
    document.getElementById(
      "todayText"
    );


  const topTime =
    document.getElementById(
      "tokyoTime"
    );


  if (todayText) {

    todayText.textContent =
      localDate;

  }


  if (topTime) {

    topTime.textContent =
      `本机 ${localTime}`;

  }



  // ========================================================
  // Tokyo
  // ========================================================

  const tokyoTime =
    new Intl.DateTimeFormat(
      "zh-CN",
      {
        timeZone:
          "Asia/Tokyo",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false
      }
    )
    .format(now);


  const tokyoDate =
    new Intl.DateTimeFormat(
      "zh-CN",
      {
        timeZone:
          "Asia/Tokyo",

        month:
          "long",

        day:
          "numeric",

        weekday:
          "short"
      }
    )
    .format(now);


  const tokyoClock =
    document.getElementById(
      "tokyoClock"
    );


  const tokyoDateElement =
    document.getElementById(
      "tokyoDate"
    );


  if (tokyoClock) {

    tokyoClock.textContent =
      tokyoTime;

  }


  if (tokyoDateElement) {

    tokyoDateElement.textContent =
      tokyoDate;

  }



  // ========================================================
  // London, Ontario
  // 自动处理 EST / EDT
  // ========================================================

  const londonTime =
    new Intl.DateTimeFormat(
      "zh-CN",
      {
        timeZone:
          "America/Toronto",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false
      }
    )
    .format(now);


  const londonDate =
    new Intl.DateTimeFormat(
      "zh-CN",
      {
        timeZone:
          "America/Toronto",

        month:
          "long",

        day:
          "numeric",

        weekday:
          "short"
      }
    )
    .format(now);


  const londonClock =
    document.getElementById(
      "londonClock"
    );


  const londonDateElement =
    document.getElementById(
      "londonDate"
    );


  if (londonClock) {

    londonClock.textContent =
      londonTime;

  }


  if (londonDateElement) {

    londonDateElement.textContent =
      londonDate;

  }

}


updateClocks();


// 每 30 秒更新时钟
setInterval(
  updateClocks,
  30000
);



// ============================================================
// 回家导航
// ============================================================

const HOME_ADDRESS_KEY =
  "dashboard.homeAddress";


const MAP_PROVIDER_KEY =
  "dashboard.mapProvider";


const homeDialog =
  document.getElementById(
    "homeDialog"
  );


const homeForm =
  document.getElementById(
    "homeForm"
  );


const homeAddress =
  document.getElementById(
    "homeAddress"
  );


const mapProvider =
  document.getElementById(
    "mapProvider"
  );


const homeStatus =
  document.getElementById(
    "homeStatus"
  );


const goHomeBtn =
  document.getElementById(
    "goHomeBtn"
  );


const editHomeBtn =
  document.getElementById(
    "editHomeBtn"
  );


const clearHomeBtn =
  document.getElementById(
    "clearHomeBtn"
  );



// ============================================================
// 获取家庭地址
// ============================================================

function getHome() {

  return (
    localStorage.getItem(
      HOME_ADDRESS_KEY
    ) || ""
  );

}



// ============================================================
// 获取地图提供商
// ============================================================

function getProvider() {

  return (
    localStorage.getItem(
      MAP_PROVIDER_KEY
    ) || "google"
  );

}



// ============================================================
// 更新“回家”状态
// ============================================================

function refreshHomeStatus() {

  if (!homeStatus) {

    return;

  }


  if (getHome()) {

    homeStatus.textContent =
      "地址已保存在这台设备。";

  }

  else {

    homeStatus.textContent =
      "第一次使用请设置家的地址。";

  }

}



// ============================================================
// 打开设置
// ============================================================

function openHomeSettings() {

  if (
    !homeDialog ||
    !homeAddress ||
    !mapProvider
  ) {

    return;

  }


  homeAddress.value =
    getHome();


  mapProvider.value =
    getProvider();


  if (
    typeof homeDialog.showModal ===
    "function"
  ) {

    homeDialog.showModal();

  }

}



// ============================================================
// 一键导航回家
// ============================================================

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


  let url;


  if (
    getProvider() ===
    "apple"
  ) {

    url =
      `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;

  }

  else {

    url =
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;

  }


  window.open(
    url,
    "_blank",
    "noopener"
  );

}



// ============================================================
// 回家按钮事件
// ============================================================

if (editHomeBtn) {

  editHomeBtn.addEventListener(
    "click",
    openHomeSettings
  );

}


if (goHomeBtn) {

  goHomeBtn.addEventListener(
    "click",
    navigateHome
  );

}



// ============================================================
// 保存家庭地址
// ============================================================

if (homeForm) {

  homeForm.addEventListener(
    "submit",
    event => {


      // 如果不是“保存”按钮
      // 比如点 X 关闭
      if (
        event.submitter?.value !==
        "save"
      ) {

        return;

      }


      event.preventDefault();


      const value =
        homeAddress
          ? homeAddress.value.trim()
          : "";


      if (!value) {

        if (homeAddress) {

          homeAddress.focus();

        }

        return;

      }


      localStorage.setItem(
        HOME_ADDRESS_KEY,
        value
      );


      localStorage.setItem(
        MAP_PROVIDER_KEY,
        mapProvider
          ? mapProvider.value
          : "google"
      );


      if (homeDialog) {

        homeDialog.close();

      }


      refreshHomeStatus();

    }
  );

}



// ============================================================
// 清除家庭地址
// ============================================================

if (clearHomeBtn) {

  clearHomeBtn.addEventListener(
    "click",
    () => {


      localStorage.removeItem(
        HOME_ADDRESS_KEY
      );


      localStorage.removeItem(
        MAP_PROVIDER_KEY
      );


      if (homeAddress) {

        homeAddress.value =
          "";

      }


      if (mapProvider) {

        mapProvider.value =
          "google";

      }


      if (homeDialog) {

        homeDialog.close();

      }


      refreshHomeStatus();

    }
  );

}


refreshHomeStatus();



// ============================================================
// 实时公交
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



// ============================================================
// HTML 转义
// ============================================================

function escapeHtml(
  value = ""
) {

  return String(value)
    .replace(

      /[&<>"']/g,

      character => ({

        "&":
          "&amp;",

        "<":
          "&lt;",

        ">":
          "&gt;",

        '"':
          "&quot;",

        "'":
          "&#039;"

      }[character])

    );

}



// ============================================================
// 获取所有需要请求的 Stop ID
//
// 根据 config.js 的 BUS_GROUPS 自动生成
// ============================================================

function getAllStopIds() {

  if (
    !Array.isArray(
      cfg.BUS_GROUPS
    )
  ) {

    throw new Error(
      "config.js 中没有找到 BUS_GROUPS"
    );

  }


  const ids =
    cfg.BUS_GROUPS.flatMap(

      group =>

        Array.isArray(
          group.stopIds
        )

          ? group.stopIds

          : []

    );


  return [

    ...new Set(
      ids.map(String)
    )

  ];

}



// ============================================================
// 判断公交 headsign 是否符合这一组
//
// 例如：
//
// Fanshawe College via Downtown
//
// 能匹配：
// "Fanshawe"
// ============================================================

function matchesHeadsign(
  arrival,
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
      arrival.headsign || ""
    )
    .toLowerCase();


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



// ============================================================
// 获取某一个方向对应的公交
// ============================================================

function getGroupArrivals(
  allArrivals,
  group
) {

  return allArrivals

    .filter(
      item => {


        // 路线
        const routeMatches =

          String(item.route) ===
          String(group.route);


        // 站点
        const stopMatches =

          Array.isArray(
            group.stopIds
          )

          &&

          group.stopIds
            .map(String)
            .includes(
              String(
                item.stopId
              )
            );


        // 方向
        const headsignMatches =

          matchesHeadsign(
            item,
            group
          );


        return (

          routeMatches &&
          stopMatches &&
          headsignMatches

        );

      }
    )

    // 时间排序
    .sort(

      (
        a,
        b
      ) =>

        Number(a.minutes) -
        Number(b.minutes)

    )

    // 首页每个方向显示最近三班
    .slice(
      0,
      3
    );

}



// ============================================================
// 渲染一个到站时间
// ============================================================

function renderTimeChip(
  item
) {

  const minutes =
    Number(
      item.minutes
    );


  let timeText;


  if (
    !Number.isFinite(
      minutes
    )
  ) {

    timeText =
      "--";

  }

  else if (
    minutes <= 0
  ) {

    timeText =
      "到站";

  }

  else {

    timeText =
      `${minutes} min`;

  }


  const realtime =
    item.realtime === true;


  return `

    <div
      class="bus-time-chip ${
        realtime
          ? "live"
          : "scheduled"
      }"
    >

      <strong>
        ${escapeHtml(timeText)}
      </strong>

      <small>

        ${
          realtime
            ? "● 实时"
            : "○ 计划"
        }

      </small>

    </div>

  `;

}



// ============================================================
// 渲染公交方向卡片
// ============================================================

function renderTransitGroups(
  allArrivals
) {

  if (!arrivalsEl) {

    return;

  }


  if (
    !Array.isArray(
      cfg.BUS_GROUPS
    )
  ) {

    throw new Error(
      "config.js 中 BUS_GROUPS 格式错误"
    );

  }


  arrivalsEl.innerHTML =

    cfg.BUS_GROUPS
      .map(
        group => {


          const arrivals =
            getGroupArrivals(

              allArrivals,

              group

            );


          let timesHtml;


          // ==================================================
          // 有公交
          // ==================================================

          if (
            arrivals.length > 0
          ) {

            timesHtml =

              arrivals
                .map(
                  renderTimeChip
                )
                .join("");

          }


          // ==================================================
          // 暂时没有车
          // ==================================================

          else {

            timesHtml = `

              <div class="no-bus">

                暂无即将到站班次

              </div>

            `;

          }


          // 第一班车的真正 headsign
          const realHeadsign =

            arrivals.length > 0

              ? (
                  arrivals[0]
                    .headsign || ""
                )

              : "";


          return `

            <section class="bus-direction">


              <div
                class="bus-direction-head"
              >


                <div
                  class="bus-route"
                >

                  ${escapeHtml(
                    group.route
                  )}

                </div>


                <div
                  class="bus-direction-info"
                >


                  <strong>

                    ${escapeHtml(
                      group.title
                    )}

                  </strong>


                  <small>

                    ${escapeHtml(
                      group.subtitle || ""
                    )}

                  </small>


                  ${
                    realHeadsign

                      ? `

                        <span
                          class="bus-headsign"
                        >

                          ${escapeHtml(
                            realHeadsign
                          )}

                        </span>

                      `

                      : ""
                  }


                </div>


              </div>


              <div
                class="bus-times"
              >

                ${timesHtml}

              </div>


            </section>

          `;

        }
      )
      .join("");

}



// ============================================================
// 加载实时公交
// ============================================================

async function loadTransit() {

  if (
    !transitStatus ||
    !arrivalsEl
  ) {

    return;

  }


  // ========================================================
  // 刷新动画
  // ========================================================

  if (refreshTransit) {

    refreshTransit
      .classList
      .add(
        "spinning"
      );

  }


  transitStatus.textContent =
    "正在更新实时公交…";


  try {


    // ======================================================
    // 检查 API 地址
    // ======================================================

    if (
      !cfg.TRANSIT_API_URL
    ) {

      throw new Error(
        "config.js 中没有 TRANSIT_API_URL"
      );

    }


    // ======================================================
    // 获取需要查询的站
    // ======================================================

    const stopIds =
      getAllStopIds();


    if (
      stopIds.length === 0
    ) {

      throw new Error(
        "config.js 中没有配置公交站"
      );

    }


    // ======================================================
    // Worker 地址
    // ======================================================

    const workerBase =

      String(
        cfg.TRANSIT_API_URL
      )
      .replace(
        /\/+$/,
        ""
      );


    const apiUrl =

      `${workerBase}/arrivals?stops=` +

      encodeURIComponent(
        stopIds.join(",")
      );


    console.log(
      "Transit API URL:",
      apiUrl
    );


    // ======================================================
    // 请求 Worker
    // ======================================================

    const response =
      await fetch(

        apiUrl,

        {

          cache:
            "no-store"

        }

      );


    // ======================================================
    // Worker 返回错误
    // ======================================================

    if (
      !response.ok
    ) {

      const text =
        await response.text();


      throw new Error(

        `Worker HTTP ${response.status}: ${text}`

      );

    }


    // ======================================================
    // 读取 JSON
    // ======================================================

    const data =
      await response.json();


    console.log(
      "Transit API Response:",
      data
    );


    // ======================================================
    // Worker 自己返回 error
    // ======================================================

    if (
      data &&
      data.error
    ) {

      throw new Error(

        data.detail

          ? `${data.error}: ${data.detail}`

          : data.error

      );

    }


    // ======================================================
    // Arrivals
    // ======================================================

    const arrivals =

      Array.isArray(
        data.arrivals
      )

        ? data.arrivals

        : [];


    // ======================================================
    // 渲染
    // ======================================================

    renderTransitGroups(
      arrivals
    );


    // ======================================================
    // 统计实时班次
    // ======================================================

    const liveCount =

      arrivals.filter(

        item =>
          item.realtime === true

      ).length;


    // ======================================================
    // 顶部状态
    // ======================================================

    if (
      arrivals.length === 0
    ) {

      transitStatus.textContent =
        "目前没有查到即将到站车辆。";

    }

    else if (
      liveCount > 0
    ) {

      transitStatus.textContent =

        `实时公交 · ${liveCount} 条实时预测`;

    }

    else {

      transitStatus.textContent =
        "当前显示计划时刻";

    }


    // ======================================================
    // 更新时间
    // ======================================================

    const generatedAt =
      data.generatedAt
        ? new Date(
            data.generatedAt
          )
        : new Date();


    if (updatedAt) {

      updatedAt.textContent =

        `更新 ${generatedAt.toLocaleTimeString(

          "zh-CN",

          {
            hour:
              "2-digit",

            minute:
              "2-digit",

            second:
              "2-digit"
          }

        )}`;

    }

  }


  // ========================================================
  // ERROR
  // ========================================================

  catch (
    error
  ) {


    console.error(
      "Transit Error:",
      error
    );


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


    if (updatedAt) {

      updatedAt.textContent =
        "连接失败";

    }

  }


  // ========================================================
  // FINALLY
  // ========================================================

  finally {


    if (refreshTransit) {

      refreshTransit
        .classList
        .remove(
          "spinning"
        );

    }

  }

}



// ============================================================
// 手动刷新公交
// ============================================================

if (refreshTransit) {

  refreshTransit.addEventListener(
    "click",
    loadTransit
  );

}



// ============================================================
// 首次加载
// ============================================================

loadTransit();



// ============================================================
// 每 30 秒自动刷新
// ============================================================

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
    () => {


      navigator
        .serviceWorker
        .register(
          "./sw.js"
        )
        .catch(
          error => {

            console.warn(
              "Service Worker 注册失败:",
              error
            );

          }
        );

    }
  );

}
