const CONFIG = {

  TEXTBOOK_LIBRARY_URL:
    "https://kimneko214.github.io/textbook/",

  TRANSIT_API_URL:
    "https://ltc-home-bus.jiangfan0611.workers.dev",

  BUS_GROUPS: [

    {
      id: "20-fanshawe",

      route: "20",

      title:
        "20 → Downtown / Fanshawe",

      subtitle:
        "Oakcrossing · Stop #2407",

      stopIds: [
        "2407"
      ],

      headsignIncludes: [
        "Fanshawe"
      ]
    },


    {
      id: "27-fanshawe",

      route: "27",

      title:
        "27 → Western / Fanshawe",

      subtitle:
        "Wonderland at Beaverbrook · Stop #2097",

      stopIds: [
        "2097"
      ],

      headsignIncludes: [
        "Fanshawe"
      ]
    },


    {
      id: "27-capulet",

      route: "27",

      title:
        "27 → Capulet Lane",

      subtitle:
        "Beaverbrook at Capulet · Stop #2415",

      stopIds: [
        "2415"
      ],

      headsignIncludes: [
        "Capulet"
      ]
    }

  ]

};
