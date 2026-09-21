const CONFIG = {
  TEXTBOOK_LIBRARY_URL: "https://kimneko214.github.io/textbook/",
  TRANSIT_API_URL: "https://ltc-home-bus2.jiangfan0611.workers.dev",

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

  title:
    "27 → Western",

  subtitle:
    "Capulet Lane at Capulet Walk SB · Stop #322",

  stopIds: [
    "322"
  ],

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
  }
};
