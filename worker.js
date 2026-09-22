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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
      !env.TRANSITLAND_API_KEY
    ) {
      return jsonResponse(
        {
          error:
            "TRANSITLAND_API_KEY secret is missing"
        },
        500
      );
    }

    if (
      url.pathname === "/" ||
      url.pathname === "/health"
    ) {
      return jsonResponse({
        ok: true,
        service:
          "LTC Home Bus 2 v4",
        homepage:
          "https://kimneko214.github.io/home-test/",
        endpoints: [
          "/arrivals?stops=2407,322,2097",
          "/vehicle?tripId=...&route=27&stopId=322",
          "/route-vehicles?route=27"
        ]
      });
    }

    try {
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
