// ============================================================
// LTC Home Bus 2
// Homepage: https://kimneko214.github.io/home-test/
// Endpoints:
//   /arrivals?stops=2407,322,2097
//   /vehicle?tripId=...&route=27&stopId=322
//   /route-vehicles?route=27
// Secret: TRANSITLAND_API_KEY
// ============================================================

const BASE="https://transit.land/api/v2/rest";
const STATIC_FEED="f-dpwh-londontransit";
const RT_FEED="f-dpwh-londontransit~rt";
const ALLOWED_ORIGIN="https://kimneko214.github.io";
const LOOK_AHEAD=10800;

const ROUTE_ONESTOP={
  "20":"r-dpwh-20",
  "27":"r-dpwh-27",
  "127":"r-dpwhw-127"
};

const DASHBOARD_ROUTES=["20","27","127"];

function cors(){
  return {
    "Access-Control-Allow-Origin":ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods":"GET,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type",
    "Cache-Control":"no-store"
  };
}
function json(data,status=200){return Response.json(data,{status,headers:cors()})}
function pick(obj,...keys){
  for(const k of keys){
    if(obj&&obj[k]!==undefined&&obj[k]!==null)return obj[k];
  }
  return undefined;
}
async function tl(url,key,cache=0){
  const opts={headers:{apikey:key}};
  if(cache>0)opts.cf={cacheEverything:true,cacheTtl:cache};
  const r=await fetch(url,opts);
  if(!r.ok)throw new Error(`Transitland ${r.status}: ${(await r.text()).slice(0,500)}`);
  return r.json();
}

async function getStopsForRoutes(apiKey,routeNumbers){
  const all=[],seen=new Set();
  for(const n of routeNumbers){
    const rid=ROUTE_ONESTOP[String(n)];
    if(!rid)continue;
    const q=new URLSearchParams({
      served_by_onestop_ids:rid,
      feed_onestop_id:STATIC_FEED,
      location_type:"0",
      limit:"400"
    });
    const d=await tl(`${BASE}/stops?${q}`,apiKey,21600);
    for(const s of (Array.isArray(d.stops)?d.stops:[])){
      const k=s.onestop_id||`${s.stop_id}-${s.stop_code}`;
      if(seen.has(k))continue;
      seen.add(k);all.push(s);
    }
  }
  return all;
}
function findStop(stops,code){
  return stops.find(s=>String(s.stop_code||"")===String(code));
}
async function getDepartures(stop,key){
  if(!stop.onestop_id)throw new Error(`Stop ${stop.stop_code} has no Onestop ID`);
  const q=new URLSearchParams({
    relative_date:"TODAY",
    next:String(LOOK_AHEAD),
    limit:"100",
    include_alerts:"false"
  });
  return tl(`${BASE}/stops/${encodeURIComponent(stop.onestop_id)}/departures?${q}`,key,15);
}
function eventOf(d){return d.departure||d.arrival||null}
function bestTime(d){
  const e=eventOf(d);if(!e)return null;
  for(const f of ["estimated_unix","time_unix","scheduled_unix"]){
    if(e[f]!==undefined&&e[f]!==null){
      const n=Number(e[f]);if(Number.isFinite(n))return n;
    }
  }
  for(const f of ["estimated_utc","time_utc","scheduled_utc"]){
    if(e[f]){
      const ms=Date.parse(e[f]);if(Number.isFinite(ms))return Math.floor(ms/1000);
    }
  }
  return null;
}
function isRealtime(d){
  const e=eventOf(d);if(!e)return false;
  if(String(d.schedule_relationship||"").toUpperCase()==="STATIC")return false;
  return (e.time_unix!==undefined&&e.time_unix!==null) ||
         (e.estimated_delay!==undefined&&e.estimated_delay!==null) ||
         (e.delay!==undefined&&e.delay!==null);
}
function routeNum(d){
  const r=d.trip?.route;
  return String(r?.route_short_name||r?.route_id||d.trip?.route_id||"");
}
function tripIdOf(d){return String(d.trip?.trip_id||d.trip?.id||"")}
function headsignOf(d){return String(d.stop_headsign||d.trip?.trip_headsign||d.trip?.route?.route_long_name||"")}

async function vehicleFeed(key){
  return tl(`${BASE}/feeds/${encodeURIComponent(RT_FEED)}/download_latest_rt/vehicle_positions.json`,key,15);
}
function parseVehicle(entity){
  const v=pick(entity,"vehicle","Vehicle");if(!v)return null;
  const t=pick(v,"trip","Trip")||{};
  const p=pick(v,"position","Position")||{};
  const vd=pick(v,"vehicle","Vehicle")||{};
  const lat=Number(pick(p,"latitude","Latitude"));
  const lon=Number(pick(p,"longitude","Longitude"));
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;

  const ts=Number(pick(v,"timestamp","Timestamp"));
  const directionId=pick(t,"directionId","direction_id","DirectionId");

  return {
    tripId:String(pick(t,"tripId","trip_id","TripId")??""),
    routeId:String(pick(t,"routeId","route_id","RouteId")??""),
    directionId:directionId===undefined||directionId===null?null:Number(directionId),
    lat,lon,
    bearing:Number(pick(p,"bearing","Bearing")),
    speed:Number(pick(p,"speed","Speed")),
    id:String(pick(vd,"id","Id")??""),
    label:String(pick(vd,"label","Label")??""),
    timestamp:Number.isFinite(ts)?ts:null
  };
}
function vehicleOut(v){
  let updatedText=null;
  if(v.timestamp){
    updatedText=new Date(v.timestamp*1000).toLocaleString("zh-CN",{
      timeZone:"America/Toronto",
      month:"numeric",day:"numeric",
      hour:"2-digit",minute:"2-digit",second:"2-digit",
      hour12:false
    });
  }
  return {...v,updatedText};
}

async function handleArrivals(url,env){
  const codes=(url.searchParams.get("stops")||"2407,322,2097").split(",").map(x=>x.trim()).filter(Boolean);
  const stops=await getStopsForRoutes(env.TRANSITLAND_API_KEY,DASHBOARD_ROUTES);
  const resolved=[],missingStops=[];
  for(const c of codes){
    const s=findStop(stops,c);
    s?resolved.push({code:c,stop:s}):missingStops.push(c);
  }

  const results=await Promise.all(resolved.map(async x=>{
    try{return {...x,data:await getDepartures(x.stop,env.TRANSITLAND_API_KEY),error:null}}
    catch(e){return {...x,data:null,error:String(e.message||e)}}
  }));

  const now=Math.floor(Date.now()/1000),arrivals=[],stopErrors=[];
  for(const r of results){
    if(r.error){stopErrors.push({stopCode:r.code,error:r.error});continue}
    const rs=Array.isArray(r.data?.stops)?r.data.stops:[];
    const deps=Array.isArray(rs[0]?.departures)?rs[0].departures:[];
    for(const d of deps){
      const route=routeNum(d);
      if(!DASHBOARD_ROUTES.includes(route))continue;
      const rel=String(d.schedule_relationship||"").toUpperCase();
      if(["CANCELED","SKIPPED","DELETED"].includes(rel))continue;
      const unix=bestTime(d);if(!unix)continue;
      const sec=unix-now;if(sec<-90||sec>LOOK_AHEAD+120)continue;
      arrivals.push({
        route,
        stopId:r.code,
        stopCode:r.code,
        gtfsStopId:r.stop.stop_id,
        onestopId:r.stop.onestop_id,
        stopName:r.stop.stop_name,
        tripId:tripIdOf(d),
        headsign:headsignOf(d),
        minutes:Math.max(0,Math.round(sec/60)),
        arrivalTime:unix,
        realtime:isRealtime(d),
        source:isRealtime(d)?"realtime":"scheduled"
      });
    }
  }
  arrivals.sort((a,b)=>a.arrivalTime-b.arrivalTime);
  const seen=new Set();
  const unique=arrivals.filter(x=>{
    const k=x.tripId?`${x.route}|${x.stopId}|${x.tripId}`:`${x.route}|${x.stopId}|${x.arrivalTime}`;
    if(seen.has(k))return false;seen.add(k);return true;
  });
  return json({
    generatedAt:new Date().toISOString(),
    requestedStops:codes,
    missingStops,stopErrors,
    arrivals:unique.slice(0,60)
  });
}

async function handleRouteVehicles(url,env){
  const route=String(url.searchParams.get("route")||"").trim().replace(/^route\s*/i,"");
  if(!route)return json({error:"Missing route"},400);

  const feed=await vehicleFeed(env.TRANSITLAND_API_KEY);
  const entities=pick(feed,"entity","Entity")||[];
  const vehicles=[];

  for(const e of entities){
    const v=parseVehicle(e);
    if(!v)continue;
    if(String(v.routeId)!==route)continue;
    vehicles.push(vehicleOut(v));
  }

  vehicles.sort((a,b)=>{
    if(a.directionId===b.directionId)return String(a.label||a.id).localeCompare(String(b.label||b.id));
    return Number(a.directionId??99)-Number(b.directionId??99);
  });

  return json({
    generatedAt:new Date().toISOString(),
    route,
    vehicles
  });
}

async function handleVehicle(url,env){
  const tripId=String(url.searchParams.get("tripId")||"");
  const route=String(url.searchParams.get("route")||"");
  const stopCode=String(url.searchParams.get("stopId")||"");
  if(!tripId)return json({error:"Missing tripId"},400);

  const stops=await getStopsForRoutes(env.TRANSITLAND_API_KEY,[route]);
  const stop=stopCode?findStop(stops,stopCode):null;
  let stopInfo=null;
  if(stop){
    const c=stop.geometry?.coordinates;
    stopInfo={
      code:String(stop.stop_code||stopCode),
      name:String(stop.stop_name||""),
      lat:Array.isArray(c)?Number(c[1]):null,
      lon:Array.isArray(c)?Number(c[0]):null
    };
  }

  const feed=await vehicleFeed(env.TRANSITLAND_API_KEY);
  const entities=pick(feed,"entity","Entity")||[];
  let matched=null;
  for(const e of entities){
    const v=parseVehicle(e);
    if(v&&v.tripId===tripId){matched=v;break}
  }

  let updatedArrival=null;
  if(stop){
    try{
      const d=await getDepartures(stop,env.TRANSITLAND_API_KEY);
      const rs=Array.isArray(d?.stops)?d.stops:[];
      const deps=Array.isArray(rs[0]?.departures)?rs[0].departures:[];
      const now=Math.floor(Date.now()/1000);
      for(const dep of deps){
        if(tripIdOf(dep)!==tripId)continue;
        const unix=bestTime(dep);if(!unix)continue;
        updatedArrival={
          minutes:Math.max(0,Math.round((unix-now)/60)),
          headsign:headsignOf(dep),
          realtime:isRealtime(dep)
        };
        break;
      }
    }catch{}
  }

  return json({
    generatedAt:new Date().toISOString(),
    tripId,route,
    headsign:updatedArrival?.headsign||"",
    minutes:updatedArrival?.minutes??null,
    realtime:updatedArrival?.realtime??Boolean(matched),
    vehicle:matched?vehicleOut(matched):null,
    stop:stopInfo
  });
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==="OPTIONS")return new Response(null,{headers:cors()});
    if(!env.TRANSITLAND_API_KEY)return json({error:"TRANSITLAND_API_KEY secret is missing"},500);

    if(url.pathname==="/"||url.pathname==="/health"){
      return json({
        ok:true,
        service:"LTC Home Bus 2",
        homepage:"https://kimneko214.github.io/home-test/",
        endpoints:[
          "/arrivals?stops=2407,322,2097",
          "/vehicle?tripId=...&route=27&stopId=322",
          "/route-vehicles?route=27"
        ]
      });
    }

    try{
      if(url.pathname==="/arrivals")return await handleArrivals(url,env);
      if(url.pathname==="/vehicle")return await handleVehicle(url,env);
      if(url.pathname==="/route-vehicles")return await handleRouteVehicles(url,env);
      return json({error:"Not Found"},404);
    }catch(e){
      return json({error:"Worker request failed",detail:String(e.message||e)},502);
    }
  }
};