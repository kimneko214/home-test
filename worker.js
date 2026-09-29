// ============================================================
// LTC Home Bus 2 - v4
// Cloudflare Worker
//
// Homepage:
// https://kimneko214.github.io/home-test/
//
// Endpoints:
//   /health
//   /arrivals?stops=2407,322,2097
//   /vehicle?tripId=...&route=27&stopId=322
//   /route-vehicles?route=27
//   /japan-post?tracking=CN134577206JP,LX331479647JP
//
// Secret:
//   TRANSITLAND_API_KEY
//
// v4:
// - 每个 departure 同时返回：
//   scheduledTime   静态 GTFS 表定时间
//   predictedTime   GTFS-Realtime 预计时间
//   delayMinutes    实时预计 - 表定
// - 保留 v3 的线路全程、direction_id、trip shape、VehiclePosition
// ============================================================

const BASE = "https://transit.land/api/v2/rest";
const STATIC_FEED = "f-dpwh-londontransit";
const RT_FEED = "f-dpwh-londontransit~rt";
const ALLOWED_ORIGIN = "https://kimneko214.github.io";
const LOOK_AHEAD_SECONDS = 3 * 60 * 60;
const LOCAL_TIME_ZONE = "America/Toronto";


// ============================================================
// Basic helpers
// ============================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
    "Cache-Control": "no-store"
  };
}

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders()
  });
}

function pick(object, ...keys) {
  for (const key of keys) {
    if (
      object &&
      object[key] !== undefined &&
      object[key] !== null
    ) {
      return object[key];
    }
  }
  return undefined;
}

async function transitlandFetch(url, apiKey, cacheSeconds = 0) {
  const options = {
    headers: {
      apikey: apiKey
    }
  };

  if (cacheSeconds > 0) {
    options.cf = {
      cacheEverything: true,
      cacheTtl: cacheSeconds
    };
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Transitland ${response.status}: ${text.slice(0, 700)}`
    );
  }

  return response.json();
}

function normalizeRoute(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/^route\s*/i, "");

  if (!text) return "";

  if (/^\d+$/.test(text)) {
    return String(Number(text));
  }

  return text.toUpperCase();
}

function routeMatches(value, requested) {
  return normalizeRoute(value) === normalizeRoute(requested);
}


// ============================================================
// Route lookup
// ============================================================

async function resolveRoute(routeInput, apiKey) {
  const requested = String(routeInput || "").trim();

  if (!requested) {
    throw new Error("Missing route");
  }

  {
    const params = new URLSearchParams({
      feed_onestop_id: STATIC_FEED,
      route_id: requested,
      include_geometry: "true",
      include_stops: "true",
      limit: "10"
    });

    const data = await transitlandFetch(
      `${BASE}/routes?${params.toString()}`,
      apiKey,
      3600
    );

    const routes = Array.isArray(data.routes)
      ? data.routes
      : [];

    const exact = routes.find(route =>
      routeMatches(route.route_id, requested) ||
      routeMatches(route.route_short_name, requested)
    );

    if (exact) return exact;
  }

  {
    const params = new URLSearchParams({
      feed_onestop_id: STATIC_FEED,
      search: requested,
      include_geometry: "true",
      include_stops: "true",
      limit: "25"
    });

    const data = await transitlandFetch(
      `${BASE}/routes?${params.toString()}`,
      apiKey,
      3600
    );

    const routes = Array.isArray(data.routes)
      ? data.routes
      : [];

    const exact = routes.find(route =>
      routeMatches(route.route_id, requested) ||
      routeMatches(route.route_short_name, requested)
    );

    if (exact) return exact;
  }

  throw new Error(`LTC route ${requested} not found`);
}


// ============================================================
// Stops
// ============================================================

async function getStopsForRoutes(apiKey, routeInputs) {
  const allStops = [];
  const seen = new Set();

  for (const routeInput of routeInputs) {
    const route = await resolveRoute(routeInput, apiKey);

    if (!route.onestop_id) continue;

    const params = new URLSearchParams({
      served_by_onestop_ids: route.onestop_id,
      feed_onestop_id: STATIC_FEED,
      location_type: "0",
      limit: "500"
    });

    const data = await transitlandFetch(
      `${BASE}/stops?${params.toString()}`,
      apiKey,
      21600
    );

    const stops = Array.isArray(data.stops)
      ? data.stops
      : [];

    for (const stop of stops) {
      const key =
        stop.onestop_id ||
        `${stop.stop_id}-${stop.stop_code}`;

      if (seen.has(key)) continue;

      seen.add(key);
      allStops.push(stop);
    }
  }

  return allStops;
}

function findStop(stops, code) {
  return stops.find(
    stop =>
      String(stop.stop_code || "") ===
      String(code)
  );
}


// ============================================================
// Departures
// ============================================================

async function getDepartures(stop, apiKey) {
  if (!stop?.onestop_id) {
    throw new Error(
      `Stop ${stop?.stop_code || "?"} has no Onestop ID`
    );
  }

  const params = new URLSearchParams({
    relative_date: "TODAY",
    next: String(LOOK_AHEAD_SECONDS),
    limit: "100",
    include_alerts: "false"
  });

  return transitlandFetch(
    `${BASE}/stops/${encodeURIComponent(stop.onestop_id)}/departures?${params.toString()}`,
    apiKey,
    15
  );
}

function getEvent(departure) {
  return (
    departure?.departure ||
    departure?.arrival ||
    null
  );
}


// ============================================================
// Scheduled / realtime time comparison
// ============================================================

function parseGtfsClock(clock) {
  const match = String(clock || "")
    .trim()
    .match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);

  if (!match) return null;

  const totalHours = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);

  if (
    !Number.isFinite(totalHours) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return {
    dayOffset: Math.floor(totalHours / 24),
    hour: totalHours % 24,
    minute,
    second
  };
}

function getTimeZoneOffsetMillis(date, timeZone) {
  const formatter = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }
  );

  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function zonedGtfsTimeToUnix(
  serviceDate,
  gtfsClock,
  timeZone = LOCAL_TIME_ZONE
) {
  const dateMatch = String(serviceDate || "")
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const clock = parseGtfsClock(gtfsClock);

  if (!dateMatch || !clock) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const wallUtcMillis = Date.UTC(
    year,
    month - 1,
    day + clock.dayOffset,
    clock.hour,
    clock.minute,
    clock.second
  );

  let offset = getTimeZoneOffsetMillis(
    new Date(wallUtcMillis),
    timeZone
  );

  let result = wallUtcMillis - offset;

  // DST 边界时再算一次 offset
  const secondOffset = getTimeZoneOffsetMillis(
    new Date(result),
    timeZone
  );

  if (secondOffset !== offset) {
    result = wallUtcMillis - secondOffset;
  }

  return Math.floor(result / 1000);
}

function formatUnixClock(
  unix,
  timeZone = LOCAL_TIME_ZONE
) {
  if (!Number.isFinite(Number(unix))) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  ).format(
    new Date(Number(unix) * 1000)
  );
}

function formatScheduledClock(clock) {
  const parsed = parseGtfsClock(clock);

  if (!parsed) {
    return null;
  }

  const hh = String(parsed.hour).padStart(2, "0");
  const mm = String(parsed.minute).padStart(2, "0");

  if (parsed.dayOffset <= 0) {
    return `${hh}:${mm}`;
  }

  if (parsed.dayOffset === 1) {
    return `次日 ${hh}:${mm}`;
  }

  return `+${parsed.dayOffset}日 ${hh}:${mm}`;
}

function getScheduledClockRaw(departure) {
  return (
    departure?.departure_time ||
    departure?.arrival_time ||
    null
  );
}

function getRealtimeUnix(departure) {
  const event = getEvent(departure);

  if (!event) return null;

  for (const field of [
    "estimated_unix",
    "time_unix"
  ]) {
    if (
      event[field] !== undefined &&
      event[field] !== null
    ) {
      const value = Number(event[field]);

      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  for (const field of [
    "estimated_utc",
    "time_utc"
  ]) {
    if (event[field]) {
      const millis = Date.parse(event[field]);

      if (Number.isFinite(millis)) {
        return Math.floor(millis / 1000);
      }
    }
  }

  return null;
}

function getScheduledUnix(departure) {
  const event = getEvent(departure);

  if (event) {
    if (
      event.scheduled_unix !== undefined &&
      event.scheduled_unix !== null
    ) {
      const value = Number(event.scheduled_unix);

      if (Number.isFinite(value)) {
        return value;
      }
    }

    if (event.scheduled_utc) {
      const millis = Date.parse(event.scheduled_utc);

      if (Number.isFinite(millis)) {
        return Math.floor(millis / 1000);
      }
    }
  }

  const serviceDate =
    departure?.service_date ||
    departure?.date ||
    null;

  const scheduledClock =
    getScheduledClockRaw(departure);

  if (
    !serviceDate ||
    !scheduledClock
  ) {
    return null;
  }

  return zonedGtfsTimeToUnix(
    serviceDate,
    scheduledClock
  );
}

function getRealtimeDelaySeconds(departure) {
  const event = getEvent(departure);

  if (event) {
    for (const field of [
      "estimated_delay",
      "delay"
    ]) {
      if (
        event[field] !== undefined &&
        event[field] !== null
      ) {
        const value = Number(event[field]);

        if (Number.isFinite(value)) {
          return value;
        }
      }
    }
  }

  const realtimeUnix =
    getRealtimeUnix(departure);

  const scheduledUnix =
    getScheduledUnix(departure);

  if (
    Number.isFinite(realtimeUnix) &&
    Number.isFinite(scheduledUnix)
  ) {
    return realtimeUnix - scheduledUnix;
  }

  return null;
}

function getTimingInfo(departure) {
  const scheduledClockRaw =
    getScheduledClockRaw(departure);

  const scheduledUnix =
    getScheduledUnix(departure);

  const realtimeUnix =
    getRealtimeUnix(departure);

  const delaySeconds =
    getRealtimeDelaySeconds(departure);

  const realtime =
    isRealtime(departure) &&
    Number.isFinite(realtimeUnix);

  return {
    scheduledTime:
      formatScheduledClock(
        scheduledClockRaw
      ),

    scheduledTimeRaw:
      scheduledClockRaw,

    scheduledUnix:
      Number.isFinite(scheduledUnix)
        ? scheduledUnix
        : null,

    predictedTime:
      realtime
        ? formatUnixClock(realtimeUnix)
        : (
            Number.isFinite(scheduledUnix)
              ? formatUnixClock(scheduledUnix)
              : formatScheduledClock(scheduledClockRaw)
          ),

    predictedUnix:
      realtime
        ? realtimeUnix
        : (
            Number.isFinite(scheduledUnix)
              ? scheduledUnix
              : null
          ),

    delaySeconds:
      realtime &&
      Number.isFinite(delaySeconds)
        ? Math.round(delaySeconds)
        : null,

    delayMinutes:
      realtime &&
      Number.isFinite(delaySeconds)
        ? Math.round(delaySeconds / 60)
        : null,

    realtime,

    interpolated:
      Number(departure?.interpolated) === 1,

    timepoint:
      departure?.timepoint === undefined ||
      departure?.timepoint === null
        ? null
        : Number(departure.timepoint)
  };
}

function getBestTime(departure) {
  const timing =
    getTimingInfo(departure);

  return timing.predictedUnix;
}

function isRealtime(departure) {
  const event = getEvent(departure);

  if (!event) return false;

  const relationship = String(
    departure?.schedule_relationship || ""
  ).toUpperCase();

  if (
    relationship === "STATIC" ||
    relationship === "NO_DATA"
  ) {
    return false;
  }

  return (
    Number.isFinite(
      getRealtimeUnix(departure)
    ) ||
    (event.estimated_delay !== undefined &&
      event.estimated_delay !== null) ||
    (event.delay !== undefined &&
      event.delay !== null)
  );
}

function getRouteNumber(departure) {
  const route = departure?.trip?.route;

  return String(
    route?.route_short_name ||
    route?.route_id ||
    departure?.trip?.route_id ||
    ""
  );
}

function getHeadsign(departure) {
  return String(
    departure?.stop_headsign ||
    departure?.trip?.trip_headsign ||
    departure?.trip?.route?.route_long_name ||
    ""
  );
}

function getTripId(departure) {
  return String(
    departure?.trip?.trip_id ||
    departure?.trip?.id ||
    ""
  );
}


// ============================================================
// Vehicle positions
// ============================================================

async function getVehicleFeed(apiKey) {
  return transitlandFetch(
    `${BASE}/feeds/${encodeURIComponent(RT_FEED)}/download_latest_rt/vehicle_positions.json`,
    apiKey,
    15
  );
}

function parseVehicleEntity(entity) {
  const vehicle = pick(
    entity,
    "vehicle",
    "Vehicle"
  );

  if (!vehicle) return null;

  const trip =
    pick(vehicle, "trip", "Trip") || {};

  const position =
    pick(vehicle, "position", "Position") || {};

  const descriptor =
    pick(vehicle, "vehicle", "Vehicle") || {};

  const lat = Number(
    pick(position, "latitude", "Latitude")
  );

  const lon = Number(
    pick(position, "longitude", "Longitude")
  );

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  const timestampRaw =
    pick(vehicle, "timestamp", "Timestamp");

  const timestamp =
    timestampRaw !== undefined &&
    timestampRaw !== null
      ? Number(timestampRaw)
      : null;

  const rawDirectionId = pick(
    trip,
    "directionId",
    "direction_id",
    "DirectionId"
  );

  return {
    tripId: String(
      pick(
        trip,
        "tripId",
        "trip_id",
        "TripId"
      ) ?? ""
    ),

    routeId: String(
      pick(
        trip,
        "routeId",
        "route_id",
        "RouteId"
      ) ?? ""
    ),

    realtimeDirectionId:
      rawDirectionId === undefined ||
      rawDirectionId === null
        ? null
        : Number(rawDirectionId),

    lat,
    lon,

    bearing: Number(
      pick(position, "bearing", "Bearing")
    ),

    speed: Number(
      pick(position, "speed", "Speed")
    ),

    id: String(
      pick(descriptor, "id", "Id") ?? ""
    ),

    label: String(
      pick(descriptor, "label", "Label") ?? ""
    ),

    timestamp:
      Number.isFinite(timestamp)
        ? timestamp
        : null
  };
}

function formatVehicle(vehicle) {
  let updatedText = null;

  if (vehicle.timestamp) {
    updatedText =
      new Date(vehicle.timestamp * 1000)
        .toLocaleString(
          "zh-CN",
          {
            timeZone: LOCAL_TIME_ZONE,
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          }
        );
  }

  return {
    ...vehicle,
    updatedText
  };
}


// ============================================================
// Static trip metadata
// ============================================================

async function getTripMetadata(
  routeEntity,
  tripId,
  apiKey
) {
  if (
    !routeEntity?.onestop_id ||
    !tripId
  ) {
    return null;
  }

  const params = new URLSearchParams({
    trip_id: tripId,
    include_geometry: "true",
    limit: "1"
  });

  const data = await transitlandFetch(
    `${BASE}/routes/${encodeURIComponent(routeEntity.onestop_id)}/trips?${params.toString()}`,
    apiKey,
    21600
  );

  const trip =
    Array.isArray(data.trips)
      ? data.trips[0]
      : null;

  if (!trip) return null;

  return {
    tripId: String(
      trip.trip_id || tripId
    ),

    directionId:
      trip.direction_id === undefined ||
      trip.direction_id === null
        ? null
        : Number(trip.direction_id),

    headsign: String(
      trip.trip_headsign || ""
    ),

    shapeId: String(
      trip.shape_id || ""
    ),

    shape:
      trip?.shape?.geometry || null
  };
}


// ============================================================
// Geometry
// ============================================================

function cleanGeometry(geometry) {
  if (!geometry) return null;

  if (
    geometry.type === "LineString" &&
    Array.isArray(geometry.coordinates)
  ) {
    return {
      type: "LineString",
      coordinates: geometry.coordinates
    };
  }

  if (
    geometry.type === "MultiLineString" &&
    Array.isArray(geometry.coordinates)
  ) {
    return {
      type: "MultiLineString",
      coordinates: geometry.coordinates
    };
  }

  return null;
}

function getRouteGeometry(routeEntity) {
  return cleanGeometry(
    routeEntity?.geometry
  );
}

function getRouteStops(routeEntity) {
  const items =
    Array.isArray(routeEntity?.route_stops)
      ? routeEntity.route_stops
      : [];

  return items
    .map(item => {
      const stop = item?.stop;

      if (!stop) return null;

      const coordinates =
        stop?.geometry?.coordinates;

      return {
        code: String(
          stop.stop_code || ""
        ),

        id: String(
          stop.stop_id || ""
        ),

        name: String(
          stop.stop_name || ""
        ),

        lat:
          Array.isArray(coordinates)
            ? Number(coordinates[1])
            : null,

        lon:
          Array.isArray(coordinates)
            ? Number(coordinates[0])
            : null
      };
    })
    .filter(Boolean);
}


// ============================================================
// /arrivals
// ============================================================

async function handleArrivals(url, env) {
  const requestedCodes =
    (
      url.searchParams.get("stops") ||
      "2407,322,2097"
    )
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

  const routeInputs = [
    "20",
    "27",
    "127"
  ];

  const allStops =
    await getStopsForRoutes(
      env.TRANSITLAND_API_KEY,
      routeInputs
    );

  const resolvedStops = [];
  const missingStops = [];

  for (const code of requestedCodes) {
    const stop =
      findStop(allStops, code);

    if (stop) {
      resolvedStops.push({
        code,
        stop
      });
    } else {
      missingStops.push(code);
    }
  }

  const results =
    await Promise.all(
      resolvedStops.map(
        async item => {
          try {
            return {
              ...item,
              data:
                await getDepartures(
                  item.stop,
                  env.TRANSITLAND_API_KEY
                ),
              error: null
            };
          } catch (error) {
            return {
              ...item,
              data: null,
              error: String(
                error.message || error
              )
            };
          }
        }
      )
    );

  const nowUnix =
    Math.floor(Date.now() / 1000);

  const arrivals = [];
  const stopErrors = [];

  for (const result of results) {
    if (result.error) {
      stopErrors.push({
        stopCode: result.code,
        error: result.error
      });
      continue;
    }

    const returnedStops =
      Array.isArray(result.data?.stops)
        ? result.data.stops
        : [];

    const departures =
      Array.isArray(
        returnedStops[0]?.departures
      )
        ? returnedStops[0].departures
        : [];

    for (const departure of departures) {
      const route =
        getRouteNumber(departure);

      if (
        !routeInputs.some(
          value =>
            routeMatches(value, route)
        )
      ) {
        continue;
      }

      const relationship =
        String(
          departure
            ?.schedule_relationship || ""
        ).toUpperCase();

      if (
        [
          "CANCELED",
          "SKIPPED",
          "DELETED"
        ].includes(relationship)
      ) {
        continue;
      }

      const timing =
        getTimingInfo(departure);

      const unix =
        timing.predictedUnix;

      if (!unix) continue;

      const seconds =
        unix - nowUnix;

      if (
        seconds < -90 ||
        seconds >
          LOOK_AHEAD_SECONDS + 120
      ) {
        continue;
      }

      arrivals.push({
        route,
        stopId: result.code,
        stopCode: result.code,
        gtfsStopId:
          result.stop.stop_id,
        onestopId:
          result.stop.onestop_id,
        stopName:
          result.stop.stop_name,
        tripId:
          getTripId(departure),
        headsign:
          getHeadsign(departure),
        minutes:
          Math.max(
            0,
            Math.round(seconds / 60)
          ),
        arrivalTime: unix,

        realtime:
          timing.realtime,

        source:
          timing.realtime
            ? "realtime"
            : "scheduled",

        scheduledTime:
          timing.scheduledTime,

        scheduledUnix:
          timing.scheduledUnix,

        predictedTime:
          timing.predictedTime,

        predictedUnix:
          timing.predictedUnix,

        delayMinutes:
          timing.delayMinutes,

        delaySeconds:
          timing.delaySeconds,

        scheduleInterpolated:
          timing.interpolated,

        scheduleTimepoint:
          timing.timepoint,

        scheduleRelationship:
          relationship || "STATIC"
      });
    }
  }

  arrivals.sort(
    (a, b) =>
      a.arrivalTime - b.arrivalTime
  );

  const seen = new Set();

  const unique =
    arrivals.filter(item => {
      const key =
        item.tripId
          ? `${item.route}|${item.stopId}|${item.tripId}`
          : `${item.route}|${item.stopId}|${item.arrivalTime}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  return jsonResponse({
    generatedAt:
      new Date().toISOString(),

    source:
      "Transitland / London Transit",

    requestedStops:
      requestedCodes,

    missingStops,

    stopErrors,

    arrivals:
      unique.slice(0, 60)
  });
}


// ============================================================
// /route-vehicles
// ============================================================

async function handleRouteVehicles(
  url,
  env
) {
  const requestedRoute =
    String(
      url.searchParams.get("route") || ""
    )
      .trim()
      .replace(/^route\s*/i, "");

  if (!requestedRoute) {
    return jsonResponse(
      {
        error: "Missing route"
      },
      400
    );
  }

  const routeEntity =
    await resolveRoute(
      requestedRoute,
      env.TRANSITLAND_API_KEY
    );

  const canonicalRoute =
    String(
      routeEntity.route_short_name ||
      routeEntity.route_id ||
      requestedRoute
    );

  const feed =
    await getVehicleFeed(
      env.TRANSITLAND_API_KEY
    );

  const entities =
    pick(feed, "entity", "Entity") || [];

  const rawVehicles = [];

  for (const entity of entities) {
    const vehicle =
      parseVehicleEntity(entity);

    if (!vehicle) continue;

    if (
      !routeMatches(
        vehicle.routeId,
        canonicalRoute
      ) &&
      !routeMatches(
        vehicle.routeId,
        routeEntity.route_id
      )
    ) {
      continue;
    }

    rawVehicles.push(vehicle);
  }

  const vehicles =
    await Promise.all(
      rawVehicles.map(
        async vehicle => {
          let trip = null;

          try {
            trip =
              await getTripMetadata(
                routeEntity,
                vehicle.tripId,
                env.TRANSITLAND_API_KEY
              );
          } catch (error) {
            // 单个 trip lookup 失败不影响其他车
          }

          const directionId =
            trip?.directionId ??
            vehicle.realtimeDirectionId ??
            null;

          return formatVehicle({
            ...vehicle,

            directionId,

            headsign:
              trip?.headsign || "",

            shapeId:
              trip?.shapeId || "",

            shape:
              cleanGeometry(
                trip?.shape
              )
          });
        }
      )
    );

  vehicles.sort((a, b) => {
    const da =
      a.directionId === null
        ? 99
        : Number(a.directionId);

    const db =
      b.directionId === null
        ? 99
        : Number(b.directionId);

    if (da !== db) {
      return da - db;
    }

    return String(
      a.label || a.id
    ).localeCompare(
      String(
        b.label || b.id
      )
    );
  });

  const directionShapes = [];
  const directionSeen = new Set();

  for (const vehicle of vehicles) {
    if (
      vehicle.directionId === null ||
      !vehicle.shape
    ) {
      continue;
    }

    const key =
      String(vehicle.directionId);

    if (directionSeen.has(key)) {
      continue;
    }

    directionSeen.add(key);

    directionShapes.push({
      directionId:
        vehicle.directionId,

      headsign:
        vehicle.headsign || "",

      geometry:
        vehicle.shape
    });
  }

  const directionMap = new Map();

  for (const vehicle of vehicles) {
    const key =
      vehicle.directionId === null
        ? "unknown"
        : String(vehicle.directionId);

    if (!directionMap.has(key)) {
      directionMap.set(key, {
        directionId:
          vehicle.directionId,

        headsign:
          vehicle.headsign || "",

        vehicleCount: 0
      });
    }

    const group =
      directionMap.get(key);

    group.vehicleCount += 1;

    if (
      !group.headsign &&
      vehicle.headsign
    ) {
      group.headsign =
        vehicle.headsign;
    }
  }

  return jsonResponse({
    generatedAt:
      new Date().toISOString(),

    route: {
      requested:
        requestedRoute,

      routeId:
        routeEntity.route_id,

      routeShortName:
        routeEntity.route_short_name,

      routeLongName:
        routeEntity.route_long_name,

      onestopId:
        routeEntity.onestop_id,

      geometry:
        getRouteGeometry(
          routeEntity
        ),

      stops:
        getRouteStops(
          routeEntity
        )
    },

    directions:
      [...directionMap.values()],

    directionShapes,

    vehicles
  });
}


// ============================================================
// /vehicle
// ============================================================

async function handleVehicle(
  url,
  env
) {
  const tripId =
    String(
      url.searchParams.get("tripId") || ""
    );

  const routeInput =
    String(
      url.searchParams.get("route") || ""
    );

  const stopCode =
    String(
      url.searchParams.get("stopId") || ""
    );

  if (!tripId) {
    return jsonResponse(
      {
        error: "Missing tripId"
      },
      400
    );
  }

  const routeEntity =
    await resolveRoute(
      routeInput,
      env.TRANSITLAND_API_KEY
    );

  const stops =
    await getStopsForRoutes(
      env.TRANSITLAND_API_KEY,
      [routeInput]
    );

  const stop =
    stopCode
      ? findStop(stops, stopCode)
      : null;

  let stopInfo = null;

  if (stop) {
    const coordinates =
      stop?.geometry?.coordinates;

    stopInfo = {
      code:
        String(
          stop.stop_code || stopCode
        ),

      name:
        String(
          stop.stop_name || ""
        ),

      lat:
        Array.isArray(coordinates)
          ? Number(coordinates[1])
          : null,

      lon:
        Array.isArray(coordinates)
          ? Number(coordinates[0])
          : null
    };
  }

  const feed =
    await getVehicleFeed(
      env.TRANSITLAND_API_KEY
    );

  const entities =
    pick(feed, "entity", "Entity") || [];

  let matchedVehicle = null;

  for (const entity of entities) {
    const vehicle =
      parseVehicleEntity(entity);

    if (
      vehicle &&
      vehicle.tripId === tripId
    ) {
      matchedVehicle =
        vehicle;
      break;
    }
  }

  let tripMeta = null;

  try {
    tripMeta =
      await getTripMetadata(
        routeEntity,
        tripId,
        env.TRANSITLAND_API_KEY
      );
  } catch (error) {
    // 保持页面可用
  }

  let updatedArrival = null;

  if (stop) {
    try {
      const data =
        await getDepartures(
          stop,
          env.TRANSITLAND_API_KEY
        );

      const returnedStops =
        Array.isArray(data?.stops)
          ? data.stops
          : [];

      const departures =
        Array.isArray(
          returnedStops[0]?.departures
        )
          ? returnedStops[0].departures
          : [];

      const nowUnix =
        Math.floor(
          Date.now() / 1000
        );

      for (const departure of departures) {
        if (
          getTripId(departure) !==
          tripId
        ) {
          continue;
        }

        const timing =
          getTimingInfo(departure);

        if (!timing.predictedUnix) {
          continue;
        }

        updatedArrival = {
          minutes:
            Math.max(
              0,
              Math.round(
                (
                  timing.predictedUnix -
                  nowUnix
                ) / 60
              )
            ),

          headsign:
            getHeadsign(departure),

          ...timing
        };

        break;
      }
    } catch (error) {
      // 保持页面可用
    }
  }

  return jsonResponse({
    generatedAt:
      new Date().toISOString(),

    tripId,

    route:
      routeEntity.route_short_name ||
      routeEntity.route_id ||
      routeInput,

    directionId:
      tripMeta?.directionId ?? null,

    headsign:
      updatedArrival?.headsign ||
      tripMeta?.headsign ||
      "",

    minutes:
      updatedArrival?.minutes ?? null,

    realtime:
      updatedArrival?.realtime ??
      Boolean(matchedVehicle),

    scheduledTime:
      updatedArrival?.scheduledTime ??
      null,

    scheduledUnix:
      updatedArrival?.scheduledUnix ??
      null,

    predictedTime:
      updatedArrival?.predictedTime ??
      null,

    predictedUnix:
      updatedArrival?.predictedUnix ??
      null,

    delayMinutes:
      updatedArrival?.delayMinutes ??
      null,

    delaySeconds:
      updatedArrival?.delaySeconds ??
      null,

    scheduleInterpolated:
      updatedArrival?.interpolated ??
      null,

    scheduleTimepoint:
      updatedArrival?.timepoint ??
      null,

    vehicle:
      matchedVehicle
        ? formatVehicle({
            ...matchedVehicle,

            directionId:
              tripMeta?.directionId ??
              matchedVehicle
                .realtimeDirectionId ??
              null,

            headsign:
              tripMeta?.headsign || ""
          })
        : null,

    stop:
      stopInfo,

    shape:
      cleanGeometry(
        tripMeta?.shape
      )
  });
}



// ============================================================
// Japan Post live tracking
//
// 从日本邮政官方追踪结果页读取“履歴情報”表格，
// 转换成 JSON 给主页显示。
// ============================================================

function decodeBasicHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

function htmlCellToText(html) {
  return decodeBasicHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractTableBySummary(html, summary) {
  const escaped = String(summary)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const match = String(html || "").match(
    new RegExp(
      `<table\\b[^>]*summary\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/table>`,
      "i"
    )
  );

  return match ? match[1] : null;
}

function extractTdCells(rowHtml) {
  const cells = [];
  const regex =
    /<td\b[^>]*>([\s\S]*?)<\/td>/gi;

  let match;

  while (
    (match = regex.exec(rowHtml)) !== null
  ) {
    cells.push(
      htmlCellToText(match[1])
    );
  }

  return cells;
}

function parseJapanPostHistory(html) {
  // 不再依赖日文 summary="履歴情報"。
  // Japan Post 英文页的表格标题会变化，但追踪历史的第一列一定是日期，
  // 第二列是状态，所以直接扫描所有 table / tr 更稳。
  const tables =
    String(html || "")
      .match(
        /<table\b[^>]*>[\s\S]*?<\/table>/gi
      ) || [];

  let bestRows = [];

  for (
    const table of tables
  ) {
    const rows = [];
    const rowRegex =
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let match;

    while (
      (match = rowRegex.exec(table)) !== null
    ) {
      const cells =
        extractTdCells(
          match[1]
        );

      if (
        cells.length < 2
      ) {
        continue;
      }

      const date =
        String(
          cells[0] || ""
        ).trim();

      const status =
        String(
          cells[1] || ""
        ).trim();

      // 英文页通常类似：
      // Sep 26 16:07
      // 日文页通常类似：
      // 2026/09/26 16:07
      const looksLikeDate =
        /(?:\d{4}\/\d{1,2}\/\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\d{1,2}\/\d{1,2})/i
          .test(
            date
          );

      if (
        !looksLikeDate ||
        !status
      ) {
        continue;
      }

      const officeParts =
        String(
          cells[3] || ""
        )
          .split(/\n+/)
          .map(
            value =>
              value.trim()
          )
          .filter(Boolean);

      const office =
        officeParts[0] ||
        "";

      const postcode =
        cells[5] ||
        officeParts.find(
          value =>
            /^\d{3}-?\d{4}$/.test(
              value
            )
        ) ||
        "";

      rows.push({
        date,

        status,

        detail:
          cells[2] || "",

        office,

        region:
          cells[4] || "",

        postcode
      });
    }

    if (
      rows.length >
      bestRows.length
    ) {
      bestRows =
        rows;
    }
  }

  return bestRows;
}

function parseJapanPostProductType(html) {
  // 产品类型只是主页右上角的小标签。
  // 为了不再依赖日本邮政页面的语言/编码，这里不给它强制解析。
  return "";
}

function parseJapanPostError(html) {
  const text =
    htmlCellToText(
      String(
        html || ""
      )
    );

  if (
    /お問い合わせ番号が見つかりません|not found|no information|cannot be found/i
      .test(
        text
      )
  ) {
    return "日本邮政暂时没有这个号码的追踪记录";
  }

  return null;
}

function classifyJapanPostStatus(status) {
  const value =
    String(status || "");

  if (
    /Final delivery|delivered|お届け先にお届け済み|お届け済み|配達完了/i
      .test(
        value
      )
  ) {
    return "delivered";
  }

  if (
    /Item out for physical delivery|Allocated to delivery staff|Out for delivery|配達局から出発|持ち出し中/i
      .test(
        value
      )
  ) {
    return "out_for_delivery";
  }

  if (
    /Return to Sender|Returned to Sender|差出人に返送済み|差出人に返送|返送/i
      .test(
        value
      )
  ) {
    return "returned";
  }

  if (
    /Customs|通関|税関/i
      .test(
        value
      )
  ) {
    return "customs";
  }

  if (
    /Retention|Held|保管/i
      .test(
        value
      )
  ) {
    return "held";
  }

  if (
    /Posting\/Collection|引受/i
      .test(
        value
      )
  ) {
    return "accepted";
  }

  if (
    /Arrival|Dispatch|Departure|Processing|En route|exchange|発送|到着|国際交換局/i
      .test(
        value
      )
  ) {
    return "in_transit";
  }

  return "unknown";
}

function translateJapanPostStatus(status) {
  const value =
    String(status || "")
      .trim();

  const exact = {
    "Posting/Collection":
      "已收件",

    "Arrival at outward office of exchange":
      "到达日本国际交换局",

    "Dispatch from outward office of exchange":
      "已从日本国际交换局发出",

    "Departure from outward office of exchange":
      "已从日本国际交换局发出",

    "Arrival at inward office of exchange":
      "已到达目的地国际交换局",

    "Departure from inward office of exchange":
      "已离开目的地国际交换局",

    "Item presented to import Customs":
      "已提交进口海关",

    "In Customs":
      "清关处理中",

    "Held by import Customs":
      "进口海关处理中",

    "Item returned from import Customs":
      "已完成进口海关处理",

    "Processing at delivery Post Office":
      "正在投递邮局处理",

    "Allocated to delivery staff":
      "已交给投递员",

    "Item out for physical delivery":
      "正在派送",

    "Final delivery":
      "已送达",

    "Final delivery - Collected at counter":
      "已在柜台领取",

    "Retention":
      "保管中",

    "Absence. Attempted delivery":
      "投递未成功",

    "Return to Sender":
      "正在退回寄件人",

    "Returned to Sender":
      "已退回寄件人",

    "引受":
      "已收件",

    "国際交換局に到着":
      "到达国际交换局",

    "国際交換局から発送":
      "已从国际交换局发出",

    "通関手続中":
      "清关处理中",

    "到着":
      "已到达",

    "配達局から出発":
      "正在派送",

    "持ち出し中":
      "正在派送",

    "保管":
      "保管中",

    "お届け先にお届け済み":
      "已送达",

    "お届け済み":
      "已送达"
  };

  if (
    exact[value]
  ) {
    return exact[value];
  }

  if (
    /Final delivery|delivered|お届け.*済み|配達完了/i
      .test(
        value
      )
  ) {
    return "已送达";
  }

  if (
    /Item out for physical delivery|Allocated to delivery staff|Out for delivery|配達局から出発|持ち出し/i
      .test(
        value
      )
  ) {
    return "正在派送";
  }

  if (
    /Arrival at inward office of exchange/i
      .test(
        value
      )
  ) {
    return "已到达目的地国际交换局";
  }

  if (
    /Dispatch from outward office of exchange/i
      .test(
        value
      )
  ) {
    return "已从日本国际交换局发出";
  }

  if (
    /Customs|通関|税関/i
      .test(
        value
      )
  ) {
    return "海关处理中";
  }

  if (
    /Return|返送/i
      .test(
        value
      )
  ) {
    return "退回中";
  }

  if (
    /Arrival|到着/i
      .test(
        value
      )
  ) {
    return "已到达";
  }

  if (
    /Dispatch|Departure|Processing|En route|発送/i
      .test(
        value
      )
  ) {
    return "运输中";
  }

  return (
    value ||
    "状态未知"
  );
}

async function fetchJapanPostTracking(
  trackingNumber
) {
  const number =
    String(trackingNumber || "")
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z0-9]{11,13}$/.test(number)
  ) {
    return {
      trackingNumber:
        number,

      ok:
        false,

      error:
        "追踪号码格式不正确"
    };
  }

  const officialUrl =
    "https://trackings.post.japanpost.jp/services/srv/search/direct" +
    `?reqCodeNo1=${encodeURIComponent(number)}` +
    "&searchKind=S002" +
    "&locale=en";

  const response =
    await fetch(
      officialUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; PersonalDashboard/1.0)",
          "Accept-Language":
            "ja,en;q=0.8"
        },

        cf: {
          cacheEverything:
            true,

          cacheTtl:
            300
        }
      }
    );

  if (!response.ok) {
    return {
      trackingNumber:
        number,

      ok:
        false,

      officialUrl,

      error:
        `Japan Post HTTP ${response.status}`
    };
  }

  // 使用日本邮政官方英文结果页。
  // 英文状态避免日文页面内部历史数据的乱码问题。
  const html =
    await response.text();

  const error =
    parseJapanPostError(
      html
    );

  const history =
    parseJapanPostHistory(
      html
    );

  if (
    error &&
    history.length === 0
  ) {
    return {
      trackingNumber:
        number,

      ok:
        false,

      officialUrl,

      error
    };
  }

  if (
    history.length === 0
  ) {
    return {
      trackingNumber:
        number,

      ok:
        false,

      officialUrl,

      error:
        "日本邮政暂时没有返回可解析的追踪历史"
    };
  }

  const latest =
    history[
      history.length - 1
    ];

  return {
    trackingNumber:
      number,

    ok:
      true,

    officialUrl,

    productType:
      parseJapanPostProductType(
        html
      ),

    latest: {
      ...latest,

      statusZh:
        translateJapanPostStatus(
          latest.status
        ),

      category:
        classifyJapanPostStatus(
          latest.status
        )
    },

    history:
      history
        .slice(-4)
        .reverse()
        .map(item => ({
          ...item,

          statusZh:
            translateJapanPostStatus(
              item.status
            ),

          category:
            classifyJapanPostStatus(
              item.status
            )
        }))
  };
}

async function handleJapanPost(
  url
) {
  const raw =
    url.searchParams.get(
      "tracking"
    ) || "";

  const numbers =
    [
      ...new Set(
        raw
          .split(",")
          .map(
            value =>
              value
                .trim()
                .toUpperCase()
          )
          .filter(Boolean)
      )
    ]
    .slice(
      0,
      10
    );

  if (
    numbers.length === 0
  ) {
    return jsonResponse(
      {
        error:
          "Missing tracking"
      },
      400
    );
  }

  const packages =
    await Promise.all(
      numbers.map(
        fetchJapanPostTracking
      )
    );

  return jsonResponse({
    generatedAt:
      new Date()
        .toISOString(),

    source:
      "Japan Post official tracking page",

    packages
  });
}


// ============================================================
// Visit logging (Cloudflare D1)
//
// D1 binding: VISITS_DB
// Secret:      ADMIN_KEY
// ============================================================

function cleanLogText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}


async function ensureVisitSchema(db) {
  // Safe to run repeatedly. This removes the need to manually execute
  // schema.sql before the first visit/admin request.
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visited_at TEXT NOT NULL,
      ip TEXT NOT NULL,
      country TEXT,
      region TEXT,
      city TEXT,
      timezone TEXT,
      asn INTEGER,
      colo TEXT,
      user_agent TEXT,
      page TEXT,
      referrer TEXT,
      language TEXT
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_visits_visited_at
    ON visits(visited_at DESC)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_visits_ip
    ON visits(ip)
  `).run();
}

async function handleVisit(request, env) {
  if (!env.VISITS_DB) {
    return jsonResponse(
      { ok: false, error: "VISITS_DB binding is missing" },
      503
    );
  }

  await ensureVisitSchema(
    env.VISITS_DB
  );

  let body = {};

  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }

  const cf = request.cf || {};
  const now = new Date().toISOString();
  const ip = cleanLogText(getClientIp(request), 100);
  const page = cleanLogText(body.page || "/", 500);
  const referrer = cleanLogText(body.referrer || "", 1000);
  const language = cleanLogText(
    body.language || request.headers.get("Accept-Language") || "",
    200
  );
  const userAgent = cleanLogText(
    request.headers.get("User-Agent") || "",
    1000
  );

  await env.VISITS_DB.prepare(`
    INSERT INTO visits (
      visited_at,
      ip,
      country,
      region,
      city,
      timezone,
      asn,
      colo,
      user_agent,
      page,
      referrer,
      language
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    now,
    ip,
    cleanLogText(cf.country || "", 20),
    cleanLogText(cf.region || cf.regionCode || "", 100),
    cleanLogText(cf.city || "", 100),
    cleanLogText(cf.timezone || "", 100),
    Number.isFinite(Number(cf.asn)) ? Number(cf.asn) : null,
    cleanLogText(cf.colo || "", 20),
    userAgent,
    page,
    referrer,
    language
  ).run();

  return jsonResponse({ ok: true });
}

function isAdmin(request, env) {
  const expected = String(env.ADMIN_KEY || "");
  const provided = String(request.headers.get("X-Admin-Key") || "");

  if (!expected || !provided) return false;

  // Constant-time-ish comparison for short secrets in Workers JS.
  if (expected.length !== provided.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

async function handleAdminVisits(request, url, env) {
  if (!env.VISITS_DB) {
    return jsonResponse(
      { error: "VISITS_DB binding is missing" },
      503
    );
  }

  if (!env.ADMIN_KEY) {
    return jsonResponse(
      { error: "ADMIN_KEY secret is missing" },
      503
    );
  }

  if (!isAdmin(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  await ensureVisitSchema(
    env.VISITS_DB
  );

  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 100, 1),
    500
  );
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const ipFilter = cleanLogText(url.searchParams.get("ip") || "", 100);

  let rowsQuery;
  let countQuery;

  if (ipFilter) {
    rowsQuery = env.VISITS_DB.prepare(`
      SELECT *
      FROM visits
      WHERE ip LIKE ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).bind(`%${ipFilter}%`, limit, offset);

    countQuery = env.VISITS_DB.prepare(`
      SELECT COUNT(*) AS count
      FROM visits
      WHERE ip LIKE ?
    `).bind(`%${ipFilter}%`);
  } else {
    rowsQuery = env.VISITS_DB.prepare(`
      SELECT *
      FROM visits
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset);

    countQuery = env.VISITS_DB.prepare(`
      SELECT COUNT(*) AS count
      FROM visits
    `);
  }

  const [rowsResult, countResult, uniqueResult, last24Result] =
    await Promise.all([
      rowsQuery.all(),
      countQuery.first(),
      env.VISITS_DB.prepare(`
        SELECT COUNT(DISTINCT ip) AS count
        FROM visits
      `).first(),
      env.VISITS_DB.prepare(`
        SELECT COUNT(*) AS count
        FROM visits
        WHERE datetime(visited_at) >= datetime('now', '-24 hours')
      `).first()
    ]);

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    stats: {
      total: Number(countResult?.count || 0),
      uniqueIps: Number(uniqueResult?.count || 0),
      last24Hours: Number(last24Result?.count || 0)
    },
    pagination: {
      limit,
      offset,
      returned: rowsResult.results?.length || 0
    },
    visits: rowsResult.results || []
  });
}

// ============================================================
// Router
// ============================================================

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    if (
      url.pathname === "/" ||
      url.pathname === "/health"
    ) {
      return jsonResponse({
        ok: true,
        service:
          "LTC Home Bus 2 v10.2 + Visit Log",
        homepage:
          "https://kimneko214.github.io/home-test/",
        endpoints: [
          "/arrivals?stops=2407,322,2097",
          "/vehicle?tripId=...&route=27&stopId=322",
          "/route-vehicles?route=27",
          "/japan-post?tracking=CN134577206JP,LX331479647JP",
          "POST /visit",
          "GET /admin/visits (X-Admin-Key required)"
        ]
      });
    }

    try {
      if (
        url.pathname === "/visit" &&
        request.method === "POST"
      ) {
        return await handleVisit(
          request,
          env
        );
      }

      if (
        url.pathname === "/admin/visits" &&
        request.method === "GET"
      ) {
        return await handleAdminVisits(
          request,
          url,
          env
        );
      }

      const isTransitEndpoint =
        url.pathname === "/arrivals" ||
        url.pathname === "/vehicle" ||
        url.pathname === "/route-vehicles";

      if (
        isTransitEndpoint &&
        !env.TRANSITLAND_API_KEY
      ) {
        return jsonResponse(
          { error: "TRANSITLAND_API_KEY secret is missing" },
          500
        );
      }

      if (
        url.pathname === "/arrivals"
      ) {
        return await handleArrivals(
          url,
          env
        );
      }

      if (
        url.pathname === "/vehicle"
      ) {
        return await handleVehicle(
          url,
          env
        );
      }

      if (
        url.pathname ===
        "/route-vehicles"
      ) {
        return await handleRouteVehicles(
          url,
          env
        );
      }

      if (
        url.pathname ===
        "/japan-post"
      ) {
        return await handleJapanPost(
          url
        );
      }

      return jsonResponse(
        {
          error: "Not Found"
        },
        404
      );
    } catch (error) {
      return jsonResponse(
        {
          error:
            "Worker request failed",

          detail:
            String(
              error.message || error
            )
        },
        502
      );
    }
  }
};
