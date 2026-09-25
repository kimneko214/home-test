const CONFIG = {

  TEXTBOOK_LIBRARY_URL:
    "https://kimneko214.github.io/textbook/",

  TRANSIT_API_URL:
    "https://ltc-home-bus2.jiangfan0611.workers.dev",

  BUS_GROUPS: [

    {
      id: "20-fanshawe",
      route: "20",
      title: "20 → Downtown / Fanshawe",
      subtitle: "Oakcrossing · Stop #2407",
      stopIds: ["2407"],
      headsignIncludes: ["Fanshawe"]
    },

    {
      id: "27-western",
      route: "27",
      title: "27 → Western",
      subtitle: "Capulet Lane at Capulet Walk SB · Stop #322",
      stopIds: ["322"],
      headsignIncludes: []
    },

    {
      id: "127-western",
      route: "127",
      title: "127 → Western / Natural Science",
      subtitle: "Wonderland at Beaverbrook NB · Stop #2097",
      stopIds: ["2097"],
      headsignIncludes: ["Natural Science"]
    }

  ],

  ROUTE_DIRECTION_NAMES: {

    "20": {
      "0": "Fanshawe College / Downtown",
      "1": "Beaverbrook / Downtown"
    },

    "27": {
      "0": "Fanshawe College via Western",
      "1": "Capulet Lane via Western"
    },

    "127": {
      "0": "Natural Science via Wonderland",
      "1": "Westmount Mall via Wonderland"
    }

  },

  JAPAN_POST_PACKAGES: [

    {
      label: "包裹 1",
      trackingNumber: "CN134577206JP",
      note: "日本 → 加拿大"
    },

    {
      label: "包裹 2",
      trackingNumber: "LX331479647JP",
      note: "日本 → 加拿大"
    }

  ],

  IMPORTANT_NOTICE: {

    icon: "🔔",

    title: "重要提醒",

    text:
      "暂无其他重要通知。",

    detail:
      "以后可以直接在 config.js 里改成出愿截止、航班、酒店、纪念日或学校事项。",

    buttonText:
      "",

    buttonUrl:
      ""

  }

};
