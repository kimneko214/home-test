const cfg = CONFIG;

// 教材库
const libraryBtn = document.getElementById("libraryBtn");
if (libraryBtn && cfg.TEXTBOOK_LIBRARY_URL) libraryBtn.href = cfg.TEXTBOOK_LIBRARY_URL;

// 时间
function updateClocks() {
  const now = new Date();
  const localTime = new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
  const localDate = new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",weekday:"short"}).format(now);
  document.getElementById("todayText").textContent = localDate;
  document.getElementById("tokyoTime").textContent = `本机 ${localTime}`;

  document.getElementById("tokyoClock").textContent =
    new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
  document.getElementById("tokyoDate").textContent =
    new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Tokyo",month:"long",day:"numeric",weekday:"short"}).format(now);

  document.getElementById("londonClock").textContent =
    new Intl.DateTimeFormat("zh-CN",{timeZone:"America/Toronto",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
  document.getElementById("londonDate").textContent =
    new Intl.DateTimeFormat("zh-CN",{timeZone:"America/Toronto",month:"long",day:"numeric",weekday:"short"}).format(now);
}
updateClocks();
setInterval(updateClocks,30000);

// 回家
const HOME_ADDRESS_KEY="dashboard.homeAddress";
const MAP_PROVIDER_KEY="dashboard.mapProvider";
const homeDialog=document.getElementById("homeDialog");
const homeForm=document.getElementById("homeForm");
const homeAddress=document.getElementById("homeAddress");
const mapProvider=document.getElementById("mapProvider");
const homeStatus=document.getElementById("homeStatus");

function getHome(){return localStorage.getItem(HOME_ADDRESS_KEY)||""}
function getProvider(){return localStorage.getItem(MAP_PROVIDER_KEY)||"google"}
function refreshHomeStatus(){homeStatus.textContent=getHome()?"地址已保存在这台设备。":"第一次使用请设置家的地址。"}
function openHomeSettings(){homeAddress.value=getHome();mapProvider.value=getProvider();homeDialog.showModal()}
function navigateHome(){
  const a=getHome();
  if(!a){openHomeSettings();return}
  const e=encodeURIComponent(a);
  const u=getProvider()==="apple"
    ? `https://maps.apple.com/?daddr=${e}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${e}`;
  window.open(u,"_blank","noopener");
}
document.getElementById("editHomeBtn")?.addEventListener("click",openHomeSettings);
document.getElementById("goHomeBtn")?.addEventListener("click",navigateHome);
homeForm?.addEventListener("submit",e=>{
  if(e.submitter?.value!=="save")return;
  e.preventDefault();
  const v=homeAddress.value.trim();
  if(!v){homeAddress.focus();return}
  localStorage.setItem(HOME_ADDRESS_KEY,v);
  localStorage.setItem(MAP_PROVIDER_KEY,mapProvider.value);
  homeDialog.close();
  refreshHomeStatus();
});
document.getElementById("clearHomeBtn")?.addEventListener("click",()=>{
  localStorage.removeItem(HOME_ADDRESS_KEY);
  localStorage.removeItem(MAP_PROVIDER_KEY);
  homeDialog.close();
  refreshHomeStatus();
});
refreshHomeStatus();

// 线路搜索
function openRouteMap(route){
  const clean=String(route||"").trim().replace(/^route\s*/i,"");
  if(!clean)return;
  location.href=`route.html?route=${encodeURIComponent(clean)}`;
}
document.getElementById("routeSearchForm")?.addEventListener("submit",e=>{
  e.preventDefault();
  openRouteMap(document.getElementById("routeSearchInput").value);
});
document.querySelectorAll("[data-route]").forEach(btn=>{
  btn.addEventListener("click",()=>openRouteMap(btn.dataset.route));
});

// 公交
const arrivalsEl=document.getElementById("arrivals");
const transitStatus=document.getElementById("transitStatus");
const updatedAt=document.getElementById("updatedAt");
const refreshTransit=document.getElementById("refreshTransit");

function escapeHtml(v=""){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function getAllStopIds(){
  return [...new Set(cfg.BUS_GROUPS.flatMap(g=>Array.isArray(g.stopIds)?g.stopIds:[]).map(String))];
}
function matchesHeadsign(item,group){
  if(!Array.isArray(group.headsignIncludes)||!group.headsignIncludes.length)return true;
  const h=String(item.headsign||"").toLowerCase();
  return group.headsignIncludes.some(k=>h.includes(String(k).toLowerCase()));
}
function getGroupArrivals(arrivals,group){
  return arrivals.filter(item=>
    String(item.route)===String(group.route) &&
    group.stopIds.map(String).includes(String(item.stopId)) &&
    matchesHeadsign(item,group)
  ).sort((a,b)=>Number(a.minutes)-Number(b.minutes)).slice(0,3);
}
function buildBusMapUrl(item){
  const p=new URLSearchParams({
    tripId:item.tripId||"",
    route:item.route||"",
    stopId:item.stopId||"",
    minutes:String(item.minutes??""),
    headsign:item.headsign||"",
    realtime:item.realtime?"1":"0"
  });
  return `bus.html?${p.toString()}`;
}
function renderTimeChip(item){
  const text=Number(item.minutes)<=0?"到站":`${item.minutes} min`;
  return `<a class="bus-time-chip ${item.realtime?"live":"scheduled"}" href="${escapeHtml(buildBusMapUrl(item))}">
    <strong>${escapeHtml(text)}</strong>
    <small>${item.realtime?"● 实时":"○ 计划"}</small>
  </a>`;
}
function renderTransitGroups(arrivals){
  arrivalsEl.innerHTML=cfg.BUS_GROUPS.map(group=>{
    const buses=getGroupArrivals(arrivals,group);
    const times=buses.length?buses.map(renderTimeChip).join(""):`<div class="no-bus">暂无即将到站班次</div>`;
    const h=buses[0]?.headsign||"";
    return `<section class="bus-direction">
      <div class="bus-direction-head">
        <div class="bus-route">${escapeHtml(group.route)}</div>
        <div class="bus-direction-info">
          <strong>${escapeHtml(group.title)}</strong>
          <small>${escapeHtml(group.subtitle)}</small>
          ${h?`<span class="bus-headsign">${escapeHtml(h)}</span>`:""}
        </div>
      </div>
      <div class="bus-times">${times}</div>
    </section>`;
  }).join("");
}
async function loadTransit(){
  refreshTransit?.classList.add("spinning");
  transitStatus.textContent="正在更新实时公交…";
  try{
    const ids=getAllStopIds();
    const api=cfg.TRANSIT_API_URL.replace(/\/+$/,"");
    const r=await fetch(`${api}/arrivals?stops=${encodeURIComponent(ids.join(","))}`,{cache:"no-store"});
    if(!r.ok)throw new Error(`Worker HTTP ${r.status}: ${await r.text()}`);
    const data=await r.json();
    if(data.error)throw new Error(data.detail||data.error);
    const arrivals=Array.isArray(data.arrivals)?data.arrivals:[];
    renderTransitGroups(arrivals);
    const live=arrivals.filter(x=>x.realtime===true).length;
    transitStatus.textContent=arrivals.length?`实时公交 · ${live} 条实时预测`:"目前没有即将到站车辆。";
    const t=new Date(data.generatedAt||Date.now());
    updatedAt.textContent=`更新 ${t.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
  }catch(err){
    transitStatus.textContent="实时公交读取失败";
    arrivalsEl.innerHTML=`<div class="bus-error">${escapeHtml(err.message||String(err))}</div>`;
    updatedAt.textContent="连接失败";
  }finally{
    refreshTransit?.classList.remove("spinning");
  }
}
refreshTransit?.addEventListener("click",loadTransit);
loadTransit();
setInterval(loadTransit,30000);

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
