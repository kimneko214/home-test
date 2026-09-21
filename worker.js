// Cloudflare Worker: London Transit GTFS-Realtime -> 简单 JSON
// 官方 TripUpdates JSON:
// https://gtfs.ltconline.ca/TripUpdate/TripUpdates.json

const FEED_URL = "https://gtfs.ltconline.ca/TripUpdate/TripUpdates.json";

function corsHeaders(origin="*"){
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function pick(obj, ...keys){
  for(const k of keys){
    if(obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function epochFromStopUpdate(stu){
  const arrival=pick(stu,"arrival","Arrival");
  const departure=pick(stu,"departure","Departure");
  const a=pick(arrival,"time","Time");
  const d=pick(departure,"time","Time");
  const raw=a ?? d;
  if(raw === undefined || raw === null) return null;
  const n=Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default {
  async fetch(request) {
    const url=new URL(request.url);

    if(request.method==="OPTIONS"){
      return new Response(null,{headers:corsHeaders()});
    }

    if(url.pathname==="/" || url.pathname==="/health"){
      return Response.json({
        ok:true,
        service:"LTC realtime proxy",
        endpoint:"/arrivals?stops=2407,2408,2409"
      },{headers:corsHeaders()});
    }

    if(url.pathname!=="/arrivals"){
      return new Response("Not found",{status:404,headers:corsHeaders()});
    }

    const stopIds=(url.searchParams.get("stops")||"")
      .split(",")
      .map(x=>x.trim())
      .filter(Boolean);

    if(!stopIds.length){
      return Response.json({error:"Missing stops query parameter"},{status:400,headers:corsHeaders()});
    }

    const stopSet=new Set(stopIds);
    const upstream=await fetch(FEED_URL,{
      cf:{cacheTtl:10,cacheEverything:true},
      headers:{"User-Agent":"PersonalDashboard/1.0"}
    });

    if(!upstream.ok){
      return Response.json(
        {error:"LTC feed request failed",status:upstream.status},
        {status:502,headers:corsHeaders()}
      );
    }

    const feed=await upstream.json();
    const entities=pick(feed,"entity","Entity") || [];
    const now=Math.floor(Date.now()/1000);
    const results=[];

    for(const entity of entities){
      const tu=pick(entity,"tripUpdate","trip_update","TripUpdate");
      if(!tu) continue;

      const trip=pick(tu,"trip","Trip") || {};
      const route=String(pick(trip,"routeId","route_id","RouteId") ?? "");
      const direction=pick(trip,"directionId","direction_id","DirectionId");
      const tripId=String(pick(trip,"tripId","trip_id","TripId") ?? "");
      const updates=pick(tu,"stopTimeUpdate","stop_time_update","StopTimeUpdate") || [];

      for(const stu of updates){
        const stopId=String(pick(stu,"stopId","stop_id","StopId") ?? "");
        if(!stopSet.has(stopId)) continue;

        const epoch=epochFromStopUpdate(stu);
        if(!epoch) continue;

        const seconds=epoch-now;
        // 只返回未来 2 小时，允许刚刚到站的 90 秒
        if(seconds < -90 || seconds > 7200) continue;

        results.push({
          route,
          direction: direction ?? null,
          tripId,
          stopId,
          epoch,
          minutes: Math.max(0,Math.round(seconds/60))
        });
      }
    }

    // 去重：同一路线、同一站、同一预计时间只保留一条
    const seen=new Set();
    const arrivals=results
      .sort((a,b)=>a.epoch-b.epoch)
      .filter(x=>{
        const key=`${x.route}|${x.stopId}|${x.epoch}`;
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0,30);

    return Response.json({
      generatedAt:new Date().toISOString(),
      stops:stopIds,
      arrivals
    },{headers:corsHeaders()});
  }
};
