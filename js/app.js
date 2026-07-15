/* Overschie gebiedsprofiel — app-logica.
   Elk onderdeel initialiseert geïsoleerd: als één grafiek faalt,
   blijven de rest van de grafieken, de kaart en de interactie werken. */
function veilig(naam, fn){
  try { fn(); }
  catch(e){ console.error("[" + naam + "]", e.message); }
}

/* Faal zichtbaar, niet stil: zonder Chart.js geen grafieken, maar wel uitleg. */
if (typeof Chart === "undefined") {
  document.querySelectorAll(".chart-wrap").forEach(el => {
    el.innerHTML = '<p style="padding:20px;color:#B0452F">Grafiekbibliotheek (assets/chart.umd.js) niet geladen — controleer of de map assets/ naast index.html staat.</p>';
  });
  console.error("Chart.js ontbreekt");
}


/* ---------- gedeelde chartstijl ---------- */
if (typeof Chart !== "undefined") {
  Chart.defaults.font.family = '"Helvetica Neue",Helvetica,Arial,sans-serif';
  Chart.defaults.color = "#3A4036";
}
const ASFALT="#22261F", GEEL="#E8B006", SCHIE="#2E6F8E", POLDER="#557A46", BETON="#E3E1D4";
const GRIJS="#7A7A6C";
/* vaste kleuren per OV-vervoerwijze, gedeeld door OV-kaart en spits/dal-grafiek */
const KLEUR_SOORT = {metro:"#B0452F", tram:GEEL, bus:SCHIE, trein:ASFALT, veer:POLDER, overig:GRIJS};
const gridOpt = {color:"rgba(34,38,31,.10)"};

/* gedeelde kaartondergrond: CartoDB Positron (licht, laat dataoverlays spreken) */
function basiskaart(){
  return L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {maxZoom:19, subdomains:"abcd",
     attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers © <a href="https://carto.com/attributions">CARTO</a>'});
}
function pctTip(unit){ return {callbacks:{label:c=>` ${c.parsed.y ?? c.parsed.x ?? c.parsed}${unit}`}}; }

/* gedeeld over blokken heen */
let chBuurtObj=null, toonIndicator=null, updateKaart=null, initKaart=null, wijkLijn=null;
let kaart=null, buurtLaag=null, wmsLaag=null, laatsteKey="inkomen";

/* ---------- verrijking uit gegenereerde CBS-data (js/cbs_mobiliteit.js) ----------
   Vervangt de afgeleide RDW-schatting door officiële KWB-cijfers en voegt de
   afstand tot het treinstation per buurt toe. Draait vóór de buurtvergelijking. */
/* Gegenereerd wijkprofiel (CBS OData) over de redactionele basis in js/data.js heen;
   draait vóór alle grafiekblokken zodat elke D.*-consument de CBS-cijfers ziet. */
veilig("profiel", () => {
  if (typeof PROFIEL === "undefined")
    throw new Error("js/profiel.js niet geladen — draai scripts/bouw_data.py --alleen profiel");
  Object.assign(D, PROFIEL);
});

veilig("cbs-verrijking", () => {
  if (typeof CBSMOB === "undefined") return;
  const volg = D.buurtVergelijk.cbsBuurten;      // CBS-namen in buurtvolgorde
  const wijkVan = per => {                       // wijkrij staat onder de WK-code
    const k = Object.keys(per).find(k => k.startsWith("WK"));
    return k ? per[k] : null;
  };
  const a = CBSMOB.autosPerHuishouden;
  D.buurtVergelijk.indicatoren.autos = {
    naam:"Auto's per huishouden", eenheid:"personenauto's / huishouden",
    values: volg.map(b => a.perBuurt[b] ?? null), wijk: wijkVan(a.perBuurt),
    foot:"Bron: " + a.bron + " (peiljaar " + a.peildatum + ", niveau: " + a.niveau + "). " + a.caveat
  };
  const n = CBSMOB.nabijheid;
  D.buurtVergelijk.indicatoren.trein = {
    naam:"Afstand treinstation", eenheid:"km over de weg",
    values: volg.map(b => n.perBuurt[b] ? n.perBuurt[b].trein : null),
    wijk: (wijkVan(n.perBuurt) || {}).trein ?? null,
    foot:"Bron: " + n.bron + " (niveau: " + n.niveau + "). " + n.caveat
  };
  /* nabijheidsgrafiek: wijkrij uit dezelfde jaarlijkse CBS-tabel */
  const w = wijkVan(n.perBuurt);
  if (w) {
    D.nabijheid = {
      labels:["Basisschool","Kinderdagverblijf","Grote supermarkt","Huisartsenpraktijk","Treinstation"],
      values:[w.basisschool, w.kinderopvang, w.supermarkt, w.huisarts, w.trein]
    };
  }
  /* gemeentereferentie (Rotterdam) per indicator — tweede lijn in de buurtvergelijking;
     alleen invullen als het profiel geen zelfde-jaargang-waarde meegaf */
  if (CBSMOB.rdamReferentie) {
    Object.entries(CBSMOB.rdamReferentie.waarden).forEach(([k, v]) => {
      if (D.buurtVergelijk.indicatoren[k] && v != null)
        D.buurtVergelijk.indicatoren[k].rdam ??= v;
    });
  }
});

veilig("grafiek-groei", () => {
/* groei: lijn met alleen echte peilpunten */
new Chart(chGroei, {type:"line", data:{labels:D.groei.labels, datasets:[{
    data:D.groei.values, borderColor:ASFALT, backgroundColor:GEEL,
    pointRadius:6, pointBorderColor:ASFALT, pointBorderWidth:2, borderWidth:2.5,
    borderDash:[6,5], tension:0
  }]},
  options:{maintainAspectRatio:false, plugins:{legend:{display:false},
    tooltip:{callbacks:{label:c=>` ${c.parsed.y.toLocaleString("nl-NL")} inwoners`}}},
    scales:{y:{grid:gridOpt, ticks:{callback:v=>v.toLocaleString("nl-NL")}, suggestedMin:15000},
            x:{grid:{display:false}}}}});
});

veilig("grafiek-leeftijd", () => {
/* leeftijd: horizontale balken */
new Chart(chLeeftijd, {type:"bar", data:{labels:D.leeftijd.labels, datasets:[{
    data:D.leeftijd.values,
    backgroundColor:[POLDER,BETON,SCHIE,BETON,GEEL], borderColor:ASFALT, borderWidth:1
  }]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.parsed.x}%`}}},
    scales:{x:{grid:gridOpt, max:32, ticks:{callback:v=>v+"%"}}, y:{grid:{display:false}}}}});
});

veilig("grafiek-huishoudens", () => {
/* huishoudens: doughnut */
new Chart(chHuish, {type:"doughnut", data:{labels:D.huishoudens.labels, datasets:[{
    data:D.huishoudens.values, backgroundColor:[SCHIE,BETON,GEEL],
    borderColor:"#FAFAF5", borderWidth:3
  }]},
  options:{maintainAspectRatio:false, cutout:"55%",
    plugins:{legend:{position:"bottom"}, tooltip:{callbacks:{label:c=>` ${c.label}: ${c.parsed}%`}}}}});
});

veilig("grafiek-inkomen", () => {
/* inkomen: toggle per maat */
let chInkomenObj = new Chart(chInkomen, {type:"bar",
  data:{labels:D.inkomen.ontvanger.labels, datasets:[{
    data:D.inkomen.ontvanger.values, backgroundColor:[GEEL,BETON], borderColor:ASFALT, borderWidth:1, maxBarThickness:110
  }]},
  options:{maintainAspectRatio:false, plugins:{legend:{display:false},
    tooltip:{callbacks:{label:c=>` € ${(c.parsed.y*1000).toLocaleString("nl-NL")}`}}},
    scales:{y:{grid:gridOpt, title:{display:true,text:"× € 1.000"}}, x:{grid:{display:false}}}}});
document.querySelectorAll("[data-ink]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("[data-ink]").forEach(b=>b.classList.remove("actief"));
  btn.classList.add("actief");
  const d = D.inkomen[btn.dataset.ink];
  chInkomenObj.data.datasets[0].data = d.values;
  chInkomenObj.update();
}));
});

veilig("grafiek-opleiding", () => {
/* opleiding */
new Chart(chOpleiding, {type:"bar", data:{labels:D.opleiding.labels, datasets:[{
    data:D.opleiding.values, backgroundColor:[BETON,SCHIE,POLDER], borderColor:ASFALT, borderWidth:1, maxBarThickness:110
  }]},
  options:{maintainAspectRatio:false, plugins:{legend:{display:false},
    tooltip:{callbacks:{label:c=>` ${c.parsed.y}%`}}},
    scales:{y:{grid:gridOpt, max:40, ticks:{callback:v=>v+"%"}}, x:{grid:{display:false}}}}});
});

veilig("buurtvergelijking", () => {
/* ---------- buurtvergelijking met indicator-switcher ---------- */
const BV = D.buurtVergelijk;
/* vaste volgorde = GEO/PDOK-buurtvolgorde; kleuren rouleren bij meer buurten */
const buurtKleuren = BV.buurten.map((_, i) =>
  ["#B0452F", GEEL, SCHIE, BETON, POLDER, GRIJS][i % 6]);

/* plugin: referentielijnen voor wijkgemiddelde en gemeente (Rotterdam) */
wijkLijn = {
  id:"wijkLijn", huidige:null, rdam:null,
  afterDraw(chart){
    const {ctx, chartArea:a, scales:{y}} = chart;
    const lijn = (waarde, kleur, label) => {
      if (waarde==null) return;
      const yp = y.getPixelForValue(waarde);
      ctx.save();
      ctx.strokeStyle = kleur; ctx.setLineDash([5,4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.left, yp); ctx.lineTo(a.right, yp); ctx.stroke();
      ctx.setLineDash([]); ctx.font = "700 11px Helvetica"; ctx.fillStyle = kleur;
      ctx.fillText(label, a.left+4, yp-5);
      ctx.restore();
    };
    lijn(wijkLijn.huidige, ASFALT, "wijkgemiddelde");
    lijn(wijkLijn.rdam, SCHIE, "Rotterdam");
  }
};

chBuurtObj = new Chart(chBuurt, {type:"bar",
  data:{labels:BV.buurten, datasets:[{data:[], backgroundColor:buurtKleuren,
        borderColor:ASFALT, borderWidth:1, maxBarThickness:90}]},
  options:{maintainAspectRatio:false,
    plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=> c.parsed.y==null ? " geen cijfer" : ` ${c.parsed.y.toLocaleString("nl-NL")}`}}},
    scales:{y:{grid:gridOpt, beginAtZero:true}, x:{grid:{display:false}}}},
  plugins:[wijkLijn]});

toonIndicator = function(key){
  const ind = BV.indicatoren[key];
  chBuurtObj.data.datasets[0].data = ind.values;
  chBuurtObj.options.scales.y.title = {display:true, text:ind.eenheid};
  wijkLijn.huidige = ind.wijk;
  wijkLijn.rdam = ind.rdam ?? null;
  chBuurtObj.update();
  document.getElementById("buurtSub").textContent =
    ind.naam + " per buurt. Ontbrekende balk = cijfer niet gepubliceerd op buurtniveau. " +
    "Stippellijnen: wijkgemiddelde (zwart) en gemeente Rotterdam (blauw), indien beschikbaar.";
  document.getElementById("buurtFoot").textContent = ind.foot;
  document.querySelectorAll("#buurtToggle button").forEach(b=>
    b.classList.toggle("actief", b.dataset.key===key));
  if (updateKaart) updateKaart(key);
}
const bt = document.getElementById("buurtToggle");
Object.entries(BV.indicatoren).forEach(([key,ind])=>{
  const b = document.createElement("button");
  b.dataset.key = key; b.textContent = ind.naam;
  b.addEventListener("click", ()=>toonIndicator(key));
  bt.appendChild(b);
});
if (toonIndicator) toonIndicator("inkomen");
});

veilig("kaart", () => {
/* ---------- kaart: buurt-choropleth (PDOK-geometrie) + optionele lagen ---------- */
/* CBS-buurtnaam -> index in D.buurtVergelijk.buurten; ontbreekt = geen buurtcijfers */
const naarIdx = {};
D.buurtVergelijk.cbsBuurten.forEach((n, i) => { naarIdx[n] = i; });

/* CBS 100×100m-laag: curated WMS-stijlen. De PDOK-service is per jaargang; de nieuwste
   wordt bij het laden automatisch gezocht (huidig jaar en drie jaar terug). */
let wmsJaar = null;
const wmsUrl = () =>
  `https://service.pdok.nl/cbs/vierkantstatistieken100m/${wmsJaar}/wms/v1_0`;
async function zoekWmsJaar(){
  /* probe via de vaste legenda-PNG i.p.v. fetch: afbeeldingen kennen geen CORS-check,
     dus niet-bestaande jaargangen (404 zonder CORS-headers) vervuilen de console niet */
  const probeer = j => new Promise(res => {
    const img = new Image();
    img.onload = () => res(true);
    img.onerror = () => res(false);
    img.src = `https://service.pdok.nl/cbs/vierkantstatistieken100m/${j}` +
      `/wms/v1_0/legend/vierkant_100m/${WMS_STANDAARD}.png`;
  });
  const nu = new Date().getFullYear();
  for (let j = nu; j >= nu - 3; j--) {
    if (await probeer(j)) return j;
  }
  return null;
}
const WMS_STIJLEN = [
  ["Bevolking & wonen", [
    ["cbsvierkant100m_aantal_inwoners",                        "aantal inwoners"],
    ["cbsvierkant100m_aantal_inwoners_0_tot_15_jaar",          "inwoners 0–15 jaar"],
    ["cbsvierkant100m_aantal_inwoners_65_jaar_en_ouder",       "inwoners 65+"],
    ["cbsvierkant100m_gemiddelde_huishoudensgrootte",          "huishoudensgrootte"],
    ["cbsvierkant100m_aantal_woningen",                        "aantal woningen"],
    ["cbsvierkant100m_gemiddelde_woz_waarde_woning",           "WOZ-waarde"],
    ["cbsvierkant100m_percentage_koopwoningen",                "% koopwoningen"],
    ["cbsvierkant100m_aantal_personen_met_uitkering_onder_aowlft", "personen met uitkering (onder AOW-lft)"]
  ]],
  ["Bereikbaarheid (afstand in km)", [
    ["cbsvierkant100m_dichtstbijzijnde_treinstation_afstand_in_km",          "treinstation"],
    ["cbsvierkant100m_dichtstbijzijnde_overstapstation_afstand_in_km",       "overstapstation"],
    ["cbsvierkant100m_dichtstbijzijnde_oprit_hoofdverkeersweg_afstand_in_km","oprit hoofdverkeersweg"],
    ["cbsvierkant100m_dichtstbijzijnde_grote_supermarkt_afstand_in_km",      "grote supermarkt"],
    ["cbsvierkant100m_dichtstbijzijnde_huisartsenpraktijk_afstand_in_km",    "huisartsenpraktijk"],
    ["cbsvierkant100m_dichtstbijzijnde_basisonderwijs_afstand_in_km",        "basisonderwijs"]
  ]]
];
const WMS_STANDAARD = WMS_STIJLEN[0][1][0][0];
/* stijlnaam -> JSON-property in de GetFeatureInfo-response (camelCase zonder prefix;
   naamgeving geverifieerd tegen een echte celrespons) */
const wmsProperty = stijl => stijl.replace("cbsvierkant100m_", "")
  .split("_").map((d, i) => i ? d.charAt(0).toUpperCase() + d.slice(1) : d).join("");
/* celwaarde opmaken; CBS-onthullingscodes worden tekst */
const cbsCelWaarde = (stijl, ruw) => {
  const n = Number(ruw);
  if (ruw == null || ruw === "" || !isFinite(n)) return null;
  if (n === -99997) return "geheim (te weinig waarnemingen)";
  if (n === -99995) return "geen gegeven / n.v.t.";
  if (stijl.endsWith("_afstand_in_km")) return n.toLocaleString("nl-NL") + " km";
  if (stijl.includes("percentage")) return n.toLocaleString("nl-NL") + "%";
  if (stijl.includes("woz")) return "€ " + (n * 1000).toLocaleString("nl-NL");
  return n.toLocaleString("nl-NL");
};
/* buurtindicator -> best passende 100m-stijl (ontbreekt = geen 100m-equivalent) */
const INDICATOR_NAAR_WMS = {
  woz:      "cbsvierkant100m_gemiddelde_woz_waarde_woning",
  hhgrootte:"cbsvierkant100m_gemiddelde_huishoudensgrootte",
  trein:    "cbsvierkant100m_dichtstbijzijnde_treinstation_afstand_in_km"
};
let wmsActief = false;
let bijwerkLegenda = null;

initKaart = function(){
  kaart = L.map("kaart",{scrollWheelZoom:false}).setView([51.946,4.433],12);
  basiskaart()
    .on("tileerror", () => {
      const f = document.getElementById("kaartFout");
      if (f) f.textContent = "Kaartondergrond laadt niet (geen internet of geblokkeerd door netwerk). De buurtvlakken en grafieken werken wel.";
    }).addTo(kaart);

  if (typeof GEO === "undefined") throw new Error("js/geo.js niet geladen — draai scripts/bouw_data.py");
  buurtLaag = L.geoJSON({type:"FeatureCollection", features:GEO.features},
    {style:{color:ASFALT, weight:1.5, fillColor:"#B9B7A8", fillOpacity:.35}}).addTo(kaart);
  kaart.fitBounds(buurtLaag.getBounds());

  const stijlKiezer = document.getElementById("wmsStijl");
  WMS_STIJLEN.forEach(([groep, stijlen]) => {
    const og = document.createElement("optgroup");
    og.label = groep;
    stijlen.forEach(([waarde, label]) => {
      const opt = document.createElement("option");
      opt.value = waarde; opt.textContent = label;
      og.appendChild(opt);
    });
    stijlKiezer.appendChild(og);
  });
  const legenda = document.getElementById("wmsLegenda");
  const toonLegenda = () => {
    legenda.style.display = wmsActief ? "block" : "none";
    if (!wmsActief) return;
    const label = stijlKiezer.selectedOptions[0].textContent;
    /* PDOK kent geen GetLegendGraphic; de legenda staat als vaste PNG per stijl online */
    let html =
      `<img alt="Legenda CBS 100×100m-laag (${label})" ` +
      `src="${wmsUrl()}/legend/vierkant_100m/${stijlKiezer.value}.png" ` +
      `style="max-width:100%" onerror="this.replaceWith('(legenda niet beschikbaar — PDOK niet bereikbaar?)')"> ` +
      `<span>CBS 100×100 m: ${label} (${wmsJaar}, CC BY 4.0). Klik op de kaart voor de celwaarden.</span>`;
    const ind = D.buurtVergelijk.indicatoren[laatsteKey];
    if (ind && !INDICATOR_NAAR_WMS[laatsteKey]) html +=
      `<br><span style="color:#B0452F">De gekozen buurtindicator “${ind.naam}” heeft geen ` +
      `100 m-equivalent; de 100 m-laag toont los daarvan “${label}”.</span>`;
    legenda.innerHTML = html;
  };
  bijwerkLegenda = toonLegenda;
  /* toggle pas bruikbaar zodra de nieuwste PDOK-jaargang gevonden is */
  const wmsToggle = document.getElementById("wmsToggle");
  wmsToggle.disabled = true;
  zoekWmsJaar().then(jaar => {
    if (jaar == null) {
      legenda.style.display = "block";
      legenda.textContent =
        "CBS 100×100 m-laag niet beschikbaar (PDOK niet bereikbaar of geblokkeerd).";
      return;
    }
    wmsJaar = jaar;
    wmsLaag = L.tileLayer.wms(wmsUrl(),
      {layers:"vierkant_100m", styles:stijlKiezer.value || WMS_STANDAARD,
       format:"image/png", transparent:true, opacity:.7,
       attribution:`CBS vierkantstatistieken ${wmsJaar} via PDOK (CC BY 4.0)`});
    wmsToggle.disabled = false;
  });
  stijlKiezer.addEventListener("change", () => {
    if (wmsLaag) wmsLaag.setParams({styles: stijlKiezer.value});
    toonLegenda();
  });
  wmsToggle.addEventListener("change", e=>{
    if (!wmsLaag) return;
    wmsActief = e.target.checked;
    /* buurtvlakken alleen als omtrek zolang de 100m-laag aanstaat (anders bedekken ze hem) */
    if (wmsActief) { wmsLaag.addTo(kaart); } else { kaart.removeLayer(wmsLaag); }
    toonLegenda();
    if (updateKaart) updateKaart(laatsteKey);
  });

  /* klik met actieve 100m-laag: celwaarden opvragen via GetFeatureInfo (JSON, CORS open) */
  kaart.on("click", async e => {
    if (!wmsActief || !wmsJaar || kaart.getZoom() < 12) return;
    const size = kaart.getSize(), pt = kaart.latLngToContainerPoint(e.latlng);
    const sw = L.CRS.EPSG3857.project(kaart.getBounds().getSouthWest());
    const ne = L.CRS.EPSG3857.project(kaart.getBounds().getNorthEast());
    const url = wmsUrl() + "?" + new URLSearchParams({
      service:"WMS", version:"1.1.1", request:"GetFeatureInfo",
      layers:"vierkant_100m", query_layers:"vierkant_100m", styles:"",
      srs:"EPSG:3857", bbox:`${sw.x},${sw.y},${ne.x},${ne.y}`,
      width:size.x, height:size.y, x:Math.round(pt.x), y:Math.round(pt.y),
      info_format:"application/json", feature_count:"1"});
    let inhoud;
    try {
      const data = await (await fetch(url)).json();
      const f = (data.features || [])[0];
      if (!f) {
        inhoud = "Geen 100 m-cel met gegevens op deze plek.";
      } else {
        /* actieve stijl bovenaan (vet), daarna de overige thema's uit de kiezer */
        const alle = WMS_STIJLEN.flatMap(([, stijlen]) => stijlen);
        alle.sort(([a], [b]) => (b === stijlKiezer.value) - (a === stijlKiezer.value));
        const regels = alle.map(([stijl, label]) => {
          const w = cbsCelWaarde(stijl, f.properties[wmsProperty(stijl)]);
          if (w == null) return "";
          return stijl === stijlKiezer.value
            ? `<b>${label}: ${w}</b>` : `${label}: ${w}`;
        }).filter(Boolean).join("<br>");
        inhoud = `<b>CBS 100×100 m-cel</b> ${f.properties.crs28992res100m ?? ""}<br>` +
          `${regels}<br><i>CBS vierkantstatistieken ${wmsJaar}, CC BY 4.0</i>`;
      }
    } catch (err) {
      inhoud = "Celwaarden niet opgehaald (PDOK niet bereikbaar?).";
    }
    L.popup({maxHeight:260}).setLatLng(e.latlng).setContent(inhoud).openOn(kaart);
  });

  /* OV-haltes (GTFS) en fietsnetwerk (OSM) als optionele lagen, indien gegenereerd */
  const lagen = {};
  if (typeof OV !== "undefined") {
    lagen.ovToggle = L.layerGroup(OV.haltes.map(h =>
      L.circleMarker([h.lat, h.lon],
        {radius: h.lijnen.includes("E") ? 7 : 4.5,
         color:"#FAFAF5", weight:1, fillColor: h.binnen ? SCHIE : "#7A7A6C", fillOpacity:.9})
       .bindPopup(`<b>${h.naam}</b><br>lijn ${h.lijnen.join(", ")}<br>` +
                  `${h.vertrekken.toLocaleString("nl-NL")} vertrekken op ${OV.peildatum}` +
                  (h.binnen ? "" : "<br><i>buiten de wijkgrens</i>"))));
  }
  if (typeof INFRA !== "undefined") {
    lagen.fietsToggle = L.geoJSON(INFRA.fietsnet, {style:{color:POLDER, weight:2, opacity:.8}});
  }
  Object.entries(lagen).forEach(([id, laag]) => {
    const cb = document.getElementById(id);
    if (!cb) return;
    cb.disabled = false;
    cb.addEventListener("change", e => {
      if (e.target.checked) { laag.addTo(kaart); } else { kaart.removeLayer(laag); }
    });
  });

  if (updateKaart) updateKaart(laatsteKey);
}

/* gegradueerde legenda voor de buurt-choropleth: vier stappen van min naar max met
   exact de kaart-opaciteit (.15+.65·v/max), plus het grijs voor "geen buurtcijfer" */
const bijwerkBuurtLegenda = (ind, max) => {
  const el = document.getElementById("buurtLegenda");
  if (!el) return;
  const geldig = ind.values.filter(v => v != null);
  if (wmsActief || !geldig.length || !(max > 0)) { el.style.display = "none"; return; }
  const min = Math.min(...geldig);
  const blok = (v, kleur, op) =>
    `<span style="display:inline-block;width:20px;height:12px;background:${kleur};` +
    `opacity:${op.toFixed(2)};border:1px solid var(--grid);vertical-align:-2px"></span>`;
  const dec = max - min < 10 ? 1 : 0;
  el.innerHTML = `${ind.naam} (${ind.eenheid}): ` +
    [0, 1/3, 2/3, 1].map(t => {
      const v = min + t * (max - min);
      return `${blok(v, SCHIE, .15 + .65 * (v / max))} ` +
        v.toLocaleString("nl-NL", {maximumFractionDigits: dec});
    }).join(" ") +
    ` &nbsp;·&nbsp; ${blok(0, "#B9B7A8", .3)} geen buurtcijfer`;
  el.style.display = "block";
};

updateKaart = function(key){
  laatsteKey = key;
  if(!kaart || !buurtLaag) return;
  const ind = D.buurtVergelijk.indicatoren[key];
  const geldig = ind.values.filter(v=>v!=null);
  const max = Math.max(...geldig);
  buurtLaag.eachLayer(laag => {
    const p = laag.feature.properties;
    const idx = naarIdx[p.naam];
    const v = idx==null ? null : ind.values[idx];
    if (v==null){
      laag.setStyle({fillColor:"#B9B7A8", fillOpacity: wmsActief ? 0 : .3});
      laag.bindPopup(`<b>${p.naam}</b><br>${ind.naam}: geen buurtcijfer<br>` +
                     `${(p.inwoners ?? 0).toLocaleString("nl-NL")} inwoners`);
    } else {
      laag.setStyle({fillColor:SCHIE, fillOpacity: wmsActief ? 0 : .15 + .65*(v/max)});
      laag.bindPopup(`<b>${p.naam}</b><br>${ind.naam}: ${v.toLocaleString("nl-NL")} ${ind.eenheid}<br>` +
                     `${(p.inwoners ?? 0).toLocaleString("nl-NL")} inwoners`);
    }
  });
  /* 100m-laag volgt de indicator wanneer er een passende CBS-stijl bestaat */
  const stijlKiezer = document.getElementById("wmsStijl");
  const passend = INDICATOR_NAAR_WMS[key];
  if (wmsActief && passend && stijlKiezer && stijlKiezer.value !== passend) {
    stijlKiezer.value = passend;
    stijlKiezer.dispatchEvent(new Event("change"));
  }
  /* legenda-tekst volgt altijd mee (toont ook de melding "geen 100m-equivalent") */
  if (bijwerkLegenda) bijwerkLegenda();
  bijwerkBuurtLegenda(ind, max);
}

try {
  if (typeof L === "undefined") throw new Error("Leaflet (assets/leaflet.js) niet geladen");
  initKaart && initKaart();
} catch (e) {
  document.getElementById("kaart").innerHTML =
    '<p style="padding:20px;color:#B0452F">Kaart niet beschikbaar: ' + e.message +
    '. De grafieken werken hier los van.</p>';
}
});

veilig("grafiek-nabijheid", () => {
/* nabijheid: horizontale balken, station uitgelicht */
new Chart(chNabij, {type:"bar", data:{labels:D.nabijheid.labels, datasets:[{
    data:D.nabijheid.values,
    backgroundColor:D.nabijheid.labels.map(l => l === "Treinstation" ? "#B0452F" : POLDER),
    borderColor:ASFALT, borderWidth:1
  }]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.parsed.x.toLocaleString("nl-NL")} km`}}},
    scales:{x:{grid:gridOpt, title:{display:true,text:"km over de weg"}}, y:{grid:{display:false}}}}});
});

veilig("ov-tabel", () => {
/* ---------- OV-aanbod: lijnen + kerncijfers uit GTFS (js/ov.js) ---------- */
if (typeof OV === "undefined") return;
const body = document.querySelector("#ovTabel tbody");
if (!body) return;
OV.lijnen.filter(l => l.binnenWijk).forEach(l => {
  const tr = document.createElement("tr");
  const traject = (l.traject && l.traject !== "lijn") ? l.traject : "—";
  tr.innerHTML =
    `<td><b>${l.soort} ${l.lijn}</b></td>` +
    `<td>${traject}</td>` +
    `<td style="text-align:right">${l.ritten.toLocaleString("nl-NL")}</td>` +
    `<td>${l.eerste.slice(0,5)}–${l.laatste.slice(0,5)}</td>`;
  body.appendChild(tr);
});
/* lijnen die alleen haltes nét buiten de wijkgrens aandoen: compact, niet als rij */
const nabij = OV.lijnen.filter(l => !l.binnenWijk)
  .map(l => `${l.soort} ${l.lijn}`).join(" · ");
if (nabij) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td colspan="4" style="color:var(--asfalt-zacht)">Haltes nét buiten de
    wijkgrens (≤300 m, of station ≤1 km): ${nabij}</td>`;
  body.appendChild(tr);
}
const binnen = OV.haltes.filter(h => h.binnen).length;
const feiten = document.getElementById("ovFeiten");
if (feiten) {
  const stations = Object.entries(OV.stationsNabijM || {})
    .map(([n, m]) => `${n} (±${m.toLocaleString("nl-NL")} m buiten de wijkgrens)`);
  feiten.innerHTML =
    `<div class="cell"><div class="num">${binnen}</div>` +
    `<div class="lbl">OV-halteplaatsen binnen de wijk</div><div class="src">GTFS/NDOV ${OV.peildatum}</div></div>` +
    (stations.length ? `<div class="cell"><div class="num">${stations.length}</div>` +
      `<div class="lbl">station(s) nabij: ${stations.join(", ")}</div><div class="src">GTFS/NDOV</div></div>` : "");
}
const foot = document.getElementById("ovFoot");
if (foot) foot.textContent = "Bron: " + OV.bron + " · peildatum " + OV.peildatum +
  " (niveau: " + OV.niveau + "). " + OV.caveat;
});

veilig("grafiek-spits", () => {
/* ---------- vertrekken per uur: spits en dal (GTFS, js/ov.js) ---------- */
if (typeof OV === "undefined" || !OV.vertrekPerUur) return;
const el = document.getElementById("chSpits");
if (!el) return;
const uren = [...Array(24).keys()].map(u => u + ":00");
new Chart(el, {type:"bar",
  data:{labels:uren, datasets:Object.entries(OV.vertrekPerUur).map(([soort, v]) => ({
    label:soort, data:v, backgroundColor:KLEUR_SOORT[soort] || GRIJS,
    borderColor:ASFALT, borderWidth:.5, maxBarThickness:22}))},
  options:{maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y.toLocaleString("nl-NL")} vertrekken`}}},
    scales:{x:{stacked:true, grid:{display:false}},
            y:{stacked:true, grid:gridOpt, title:{display:true, text:"vertrekken per uur"}}}}});
const foot = document.getElementById("spitsFoot");
if (foot) foot.textContent = "Bron: " + OV.bron + " · peildatum " + OV.peildatum +
  " (niveau: halte, alleen haltes binnen de wijkgrens). " + OV.caveat;
});

veilig("kaart-ov", () => {
/* ---------- OV-kaart: lijnvoering (GTFS-shapes) + haltes ---------- */
if (typeof OV === "undefined" || typeof L === "undefined") return;
const el = document.getElementById("kaartOV");
if (!el) return;
const kOV = L.map("kaartOV", {scrollWheelZoom:false});
basiskaart().addTo(kOV);
if (typeof GEO !== "undefined"){
  const grens = L.geoJSON({type:"FeatureCollection", features:GEO.features},
    {style:{color:ASFALT, weight:1.2, fill:false, dashArray:"4 3"}}).addTo(kOV);
  kOV.fitBounds(grens.getBounds().pad(.15));
} else {
  kOV.setView([51.946, 4.433], 13);
}

const metGeom = OV.lijnen.filter(l => Array.isArray(l.geom) && l.geom.length);
const zonderGeom = OV.lijnen.filter(l => !(Array.isArray(l.geom) && l.geom.length));
const maxR = Math.max(...OV.lijnen.map(l => l.ritten), 1);
const maxV = Math.max(...OV.haltes.map(h => h.vertrekken), 1);

/* één laag per vervoerwijze; tekenvolgorde bus onderop, metro bovenop */
const groepen = {};
["bus","tram","trein","veer","overig","metro"].forEach(soort => {
  const lijnen = metGeom.filter(l => l.soort === soort);
  if (!lijnen.length) return;
  groepen[soort] = L.layerGroup(lijnen.map(l =>
    L.polyline(l.geom, {color: KLEUR_SOORT[soort] || GRIJS,
      weight: 1.5 + 3.5*Math.sqrt(l.ritten/maxR), opacity:.8})
     .bindPopup(`<b>${l.soort} ${l.lijn}</b> — ${l.vervoerder}<br>` +
       ((l.traject && l.traject !== "lijn") ? l.traject + "<br>" : "") +
       `${l.ritten.toLocaleString("nl-NL")} ritten op ${OV.peildatum} · ` +
       `${l.eerste.slice(0,5)}–${l.laatste.slice(0,5)}`)));
});
groepen.haltes = L.layerGroup(OV.haltes.map(h =>
  L.circleMarker([h.lat, h.lon],
    {radius: 2.5 + 4.5*Math.sqrt(h.vertrekken/maxV),
     color:"#FAFAF5", weight:1, fillColor: h.binnen ? ASFALT : GRIJS, fillOpacity:.85})
   .bindPopup(`<b>${h.naam}</b><br>lijn ${h.lijnen.join(", ")}<br>` +
              `${h.vertrekken.toLocaleString("nl-NL")} vertrekken op ${OV.peildatum}` +
              (h.binnen ? "" : "<br><i>buiten de wijkgrens</i>"))));

const toggles = document.getElementById("kaartOVToggles");
const chip = (naam, label, swatch) => {
  const lab = document.createElement("label");
  lab.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin:0 14px 6px 0;font-size:13.5px;cursor:pointer";
  lab.innerHTML = `<input type="checkbox" checked>${swatch}${label}`;
  lab.querySelector("input").addEventListener("change", e => {
    if (e.target.checked) { groepen[naam].addTo(kOV); } else { kOV.removeLayer(groepen[naam]); }
  });
  toggles.appendChild(lab);
  groepen[naam].addTo(kOV);
};
if (toggles) {
  Object.keys(groepen).filter(s => s !== "haltes").forEach(soort => {
    const n = metGeom.filter(l => l.soort === soort).length;
    chip(soort, `${soort} (${n} lijn${n === 1 ? "" : "en"})`,
      `<span style="width:14px;height:4px;background:${KLEUR_SOORT[soort] || GRIJS};display:inline-block"></span>`);
  });
  chip("haltes", `haltes (${OV.haltes.length})`,
    `<span style="width:11px;height:11px;border-radius:50%;background:${ASFALT};display:inline-block"></span>`);
}

const foot = document.getElementById("kaartOVFoot");
if (foot) foot.textContent = "Bron: " + OV.bron + " · peildatum " + OV.peildatum +
  " (niveau: " + OV.niveau + "). " + OV.caveat +
  (zonderGeom.length ? " Zonder routegeometrie in de GTFS-feed: " +
    zonderGeom.map(l => `${l.soort} ${l.lijn}`).join(", ") + "." : "");
});

/* canonieke vervoerwijze-labels: ODiN-microdata (KHvm) en StatLine gebruiken nét
   andere benamingen; hier samengebracht zodat één grafiek drie niveaus kan tonen */
function kanonVervoerwijze(l){
  l = l.toLowerCase();
  if (l.includes("bestuurder")) return "Auto (bestuurder)";
  if (l.includes("passagier")) return "Auto (passagier)";
  if (l.includes("trein")) return "Trein";
  if (l.includes("bus")) return "Bus/tram/metro";
  if (l.includes("fiets")) return "Fiets";
  if (l.includes("voet") || l.includes("lopen")) return "Lopen";
  return "Overig";
}
const VERVOERWIJZEN = ["Auto (bestuurder)","Auto (passagier)","Bus/tram/metro",
                       "Trein","Fiets","Lopen","Overig"];
/* Nederlandse decimaalkomma voor percentages e.d. */
const nl = x => (x == null ? "–" : String(x).replace(".", ","));

veilig("grafiek-modal", () => {
/* ---------- modal split op drie niveaus: wijk & gemeente (ODiN-microdata) + provincie (StatLine) ---------- */
const reeksen = [];
const bronnen = [];
const naarShares = lijst => {
  const uit = Object.fromEntries(VERVOERWIJZEN.map(w => [w, 0]));
  lijst.forEach(r => { uit[kanonVervoerwijze(r.label)] += r.share; });
  return VERVOERWIJZEN.map(w => Math.round(uit[w] * 10) / 10 || null);
};
if (typeof ODINW !== "undefined") {
  reeksen.push({label:`Overschie — wijk (n=${ODINW.n.verplaatsingen})`, kleur:GEEL,
                data:naarShares(ODINW.modalSplit.wijk)});
  reeksen.push({label:`Rotterdam — gemeente (n=${ODINW.modalSplit.nRotterdam.toLocaleString("nl-NL")})`,
                kleur:SCHIE, data:naarShares(ODINW.modalSplit.rotterdam)});
  bronnen.push(ODINW.bron + " (" + ODINW.peildatum + ")");
}
if (typeof CBSMOB !== "undefined" && CBSMOB.modalSplit) {
  const ms = CBSMOB.modalSplit;
  const jaar = Object.keys(ms.jaren).sort().at(-1);
  const zh = ms.jaren[jaar].regios["Zuid-Holland"];
  if (zh) {
    const totaal = zh["Totaal"];
    const lijst = Object.entries(zh).filter(([k]) => k.trim() !== "Totaal")
      .map(([k, v]) => ({label:k, share: 100 * v / totaal}));
    reeksen.push({label:`Zuid-Holland — provincie (${jaar}, ${ms.jaren[jaar].status.toLowerCase()})`,
                  kleur:GRIJS, data:naarShares(lijst)});
    bronnen.push(ms.bron);
  }
}
if (!reeksen.length) return;
new Chart(chModal, {type:"bar",
  data:{labels:VERVOERWIJZEN, datasets:reeksen.map(r => ({
    label:r.label, data:r.data, backgroundColor:r.kleur,
    borderColor:ASFALT, borderWidth:1, maxBarThickness:13
  }))},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label.split(" (")[0]}: ${nl(c.parsed.x)}% van de verplaatsingen`}}},
    scales:{x:{grid:gridOpt, title:{display:true,text:"% van de verplaatsingen"}}, y:{grid:{display:false}}}}});
const sub = document.getElementById("modalSub");
if (sub) sub.textContent = "Aandeel verplaatsingen per hoofdvervoerwijze; drie meetniveaus naast elkaar.";
const foot = document.getElementById("modalFoot");
if (foot) foot.textContent = "Bronnen: " + bronnen.join(" · ") +
  (typeof ODINW !== "undefined" ? ". " + ODINW.caveat : "");
});

veilig("odin-afstand", () => {
/* ---------- hoe ver en waarmee: modal split per afstandsband (wijk vs Rotterdam) ---------- */
if (typeof ODINW === "undefined" || !ODINW.afstandModaliteit) return;
const el = document.getElementById("chAfstand");
if (!el) return;
const AM = ODINW.afstandModaliteit;
const GROEPEN = ["Auto","OV","Fiets","Lopen","Overig"];
const KLEUR_GROEP = {Auto:GRIJS, OV:SCHIE, Fiets:POLDER, Lopen:GEEL, Overig:BETON};
const naarGroep = l => l.includes("verig") ? "Overig" : l;
const shares = rijen => {
  const uit = Object.fromEntries(GROEPEN.map(g => [g, AM.banden.map(() => null)]));
  rijen.forEach((r, i) => {
    if (r.onderdrukt) return;
    r.modes.forEach(m => { uit[naarGroep(m.label)][i] = m.share; });
  });
  return uit;
};
const wijkS = shares(AM.wijk), rdamS = shares(AM.rotterdam);
const dataset = (groep, stack, data, vaag) => ({
  label:(vaag ? "_" : "") + groep, stack, data,
  backgroundColor:KLEUR_GROEP[groep] + (vaag ? "80" : ""),
  borderColor:ASFALT, borderWidth:.5, maxBarThickness:22});
new Chart(el, {type:"bar",
  data:{labels:AM.banden, datasets:[
    ...GROEPEN.map(g => dataset(g, "wijk", wijkS[g], false)),
    ...GROEPEN.map(g => dataset(g, "rdam", rdamS[g], true))
  ]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{
      legend:{position:"bottom", labels:{filter:i => !i.text.startsWith("_")}},
      tooltip:{callbacks:{label:c => {
        const groep = c.dataset.label.replace(/^_/, "");
        const bron = c.dataset.stack === "wijk" ? "wijk" : "Rotterdam";
        const rij = (c.dataset.stack === "wijk" ? AM.wijk : AM.rotterdam)[c.dataIndex];
        return ` ${groep} (${bron}): ${nl(c.parsed.x)}% — n band=${rij.n}`;
      }}}
    },
    scales:{x:{stacked:true, max:100, grid:gridOpt,
               title:{display:true, text:"% van de verplaatsingen in de afstandsband"}},
            y:{stacked:true, grid:{display:false}}}}});
let sub = "Per afstandsband twee gestapelde balken: bovenste = wijkbewoners (vol), " +
  "onderste = alle Rotterdammers (doorzichtig). Percentages tellen per balk op tot 100.";
const onderdrukte = AM.wijk.filter(r => r.onderdrukt).map(r => r.band);
if (onderdrukte.length) sub += ` Banden met te weinig waarnemingen zijn weggelaten: ${onderdrukte.join(", ")}.`;
document.getElementById("afstandSub").textContent = sub;
document.getElementById("afstandFoot").textContent =
  "Bron: " + ODINW.bron + " · niveau: " + ODINW.niveau + ". " + AM.caveat + " " + ODINW.caveat;
});

veilig("odin-caveat", () => {
/* representativiteitsblok bovenaan de ODiN-sectie */
if (typeof ODINW === "undefined") return;
const el = document.getElementById("odinCaveat");
if (el) el.innerHTML = "<b>Representativiteit:</b> " + ODINW.caveat +
  " Niveau: " + ODINW.niveau + ".";
});

veilig("odin-motieven", () => {
/* ---------- waarom: motieven wijk vs gemeente (ODiN-microdata) ---------- */
if (typeof ODINW === "undefined") return;
const labels = ODINW.motieven.wijk.map(r => r.label);
const rdam = Object.fromEntries(ODINW.motieven.rotterdam.map(r => [r.label, r.share]));
new Chart(chMotief, {type:"bar",
  data:{labels, datasets:[
    {label:"Overschie (wijk)", data:ODINW.motieven.wijk.map(r => r.share),
     backgroundColor:GEEL, borderColor:ASFALT, borderWidth:1, maxBarThickness:14},
    {label:"Rotterdam (gemeente)", data:labels.map(l => rdam[l] ?? null),
     backgroundColor:SCHIE, borderColor:ASFALT, borderWidth:1, maxBarThickness:14}
  ]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${nl(c.parsed.x)}%`}}},
    scales:{x:{grid:gridOpt, title:{display:true,text:"% van de verplaatsingen"}}, y:{grid:{display:false}}}}});
});

veilig("odin-bestemmingen", () => {
/* ---------- waarheen: daily urban system (flow-kaart + aandelen) ---------- */
if (typeof ODINW === "undefined" || typeof L === "undefined") return;
const el = document.getElementById("kaartBestemming");
if (!el) return;
const [hlat, hlon] = ODINW.herkomstCentroid;
const k = L.map("kaartBestemming", {scrollWheelZoom:false}).setView([hlat, hlon], 11);
basiskaart().addTo(k);
if (typeof GEO !== "undefined")
  L.geoJSON({type:"FeatureCollection", features:GEO.features},
    {style:{color:ASFALT, weight:1.2, fill:false, dashArray:"4 3"}}).addTo(k);
const doelen = [...ODINW.bestemmingen.topWijkenBinnenGemeente,
                ...ODINW.bestemmingen.topGemeentenBuiten];
const punten = [[hlat, hlon]];
doelen.forEach(b => {
  punten.push([b.lat, b.lon]);
  L.polyline([[hlat, hlon], [b.lat, b.lon]],
    {color:SCHIE, weight:1.5 + b.share * 1.1, opacity:.7}).addTo(k)
   .bindPopup(`<b>${b.naam}</b><br>${nl(b.share)}% van de verplaatsingen van wijkbewoners (n=${b.n})`);
  L.circleMarker([b.lat, b.lon], {radius:5, color:"#FAFAF5", weight:1,
    fillColor:SCHIE, fillOpacity:.95}).addTo(k)
   .bindPopup(`<b>${b.naam}</b><br>${nl(b.share)}% (n=${b.n})`);
});
L.circleMarker([hlat, hlon], {radius:7, color:ASFALT, weight:2,
  fillColor:GEEL, fillOpacity:1}).addTo(k).bindPopup("<b>Overschie</b> (herkomst)");
k.fitBounds(L.latLngBounds(punten).pad(.25));

const d = ODINW.bestemmingen.delen;
const strip = document.getElementById("bestemmingStrip");
if (strip) strip.innerHTML =
  `<div class="cell"><div class="num">${nl(d.binnenWijk.share)}%</div>` +
  `<div class="lbl">van de verplaatsingen blijft binnen de wijk</div><div class="src">n=${d.binnenWijk.n}</div></div>` +
  `<div class="cell"><div class="num">${nl(d.binnenGemeente.share)}%</div>` +
  `<div class="lbl">gaat naar elders in de gemeente</div><div class="src">n=${d.binnenGemeente.n}</div></div>` +
  `<div class="cell"><div class="num">${nl(d.buitenGemeente.share)}%</div>` +
  `<div class="lbl">gaat de gemeente uit — verspreid over ${ODINW.bestemmingen.aantalGemeentenBuiten} gemeenten, geen enkele ≥10 waarnemingen</div><div class="src">n=${d.buitenGemeente.n}</div></div>` +
  `<div class="cell"><div class="num">${ODINW.gemAfstandKm.wijk.toLocaleString("nl-NL")} km</div>` +
  `<div class="lbl">gem. afstand per verplaatsing (Rotterdam: ${ODINW.gemAfstandKm.rotterdam.toLocaleString("nl-NL")} km)</div><div class="src">gewogen</div></div>`;
const foot = document.getElementById("bestemmingFoot");
if (foot) foot.textContent = "Bron: " + ODINW.bron + " · niveau: " + ODINW.niveau + ". " + ODINW.caveat;
});

veilig("odin-dagdelen", () => {
/* ---------- wanneer: vertrektijden per dagdeel ---------- */
if (typeof ODINW === "undefined") return;
const labels = ODINW.dagdelen.wijk.map(r => r.label);
const rdam = Object.fromEntries(ODINW.dagdelen.rotterdam.map(r => [r.label, r.share]));
new Chart(chDagdeel, {type:"bar",
  data:{labels, datasets:[
    {label:"Overschie (wijk)", data:ODINW.dagdelen.wijk.map(r => r.share),
     backgroundColor:GEEL, borderColor:ASFALT, borderWidth:1, maxBarThickness:44},
    {label:"Rotterdam (gemeente)", data:labels.map(l => rdam[l] ?? null),
     backgroundColor:SCHIE, borderColor:ASFALT, borderWidth:1, maxBarThickness:44}
  ]},
  options:{maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${nl(c.parsed.y)}%`}}},
    scales:{y:{grid:gridOpt, ticks:{callback:v=>v+"%"}}, x:{grid:{display:false}}}}});
});

veilig("odin-bezoekers", () => {
/* ---------- wie komt hierheen: bezoekers van buiten de wijk ---------- */
if (typeof ODINW === "undefined" || !ODINW.bezoekers) return;
const b = ODINW.bezoekers;
const strip = document.getElementById("bezoekersStrip");
if (!strip) return;
const topM = b.motieven.slice(0, 3);
const herkomst = b.topHerkomst;
strip.innerHTML =
  `<div class="cell"><div class="num">${b.n}</div>` +
  `<div class="lbl">verplaatsingen van niet-bewoners mét bestemming in de wijk (steekproef)</div><div class="src">ODiN gepoold</div></div>` +
  topM.map(m => `<div class="cell"><div class="num">${nl(m.share)}%</div>` +
    `<div class="lbl">motief: ${m.label.toLowerCase()}</div><div class="src">n=${m.n}</div></div>`).join("") +
  (herkomst.length ? `<div class="cell"><div class="num">${nl(herkomst[0].share)}%</div>` +
    `<div class="lbl">komt uit ${herkomst[0].gemeente}` +
    (herkomst.length > 1 ? `; daarna ${herkomst.slice(1).map(h =>
      `${h.gemeente} (${nl(h.share)}%)`).join(", ")}` : "") +
    `</div><div class="src">n=${herkomst.map(h => h.n).join("/")}</div></div>` : "");
});

veilig("voorz-vergelijk", () => {
/* ---------- voorzieningen per 1.000 inwoners: wijk vs gemeente ---------- */
if (typeof VOORZ === "undefined" || !VOORZ.vergelijk) return;
const cats = Object.keys(VOORZ.categorieen);
const v = VOORZ.vergelijk.perCategorie;
new Chart(chVoorz, {type:"bar",
  data:{labels:cats.map(c => VOORZ.categorieen[c]), datasets:[
    {label:"Overschie (wijk)", data:cats.map(c => v[c].wijkPer1000),
     backgroundColor:GEEL, borderColor:ASFALT, borderWidth:1, maxBarThickness:16},
    {label:"Rotterdam (gemeente)", data:cats.map(c => v[c].gemeentePer1000),
     backgroundColor:SCHIE, borderColor:ASFALT, borderWidth:1, maxBarThickness:16}
  ]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>{
        const cat = cats[c.dataIndex];
        const abs = c.datasetIndex === 0 ? v[cat].wijkAantal : v[cat].gemeenteAantal;
        return ` ${c.dataset.label}: ${nl(c.parsed.x)} per 1.000 inwoners (${abs.toLocaleString("nl-NL")} locaties)`;
      }}}},
    scales:{x:{grid:gridOpt, title:{display:true,text:"locaties per 1.000 inwoners"}}, y:{grid:{display:false}}}}});
const foot = document.getElementById("voorzVergelijkFoot");
if (foot) foot.textContent = "Bron: " + VOORZ.vergelijk.bron + ". " + VOORZ.vergelijk.caveat;
});

veilig("infra-strip", () => {
/* ---------- infrastructuur-kerncijfers (OSM via OSMnx, js/infra.js) ---------- */
if (typeof INFRA === "undefined") return;
const strip = document.getElementById("infraStrip");
if (!strip) return;
const refs = (INFRA.barriereRefs || []).join("/") || "snelweg";
const o = INFRA.omrijfactor;
strip.innerHTML =
  `<div class="cell"><div class="num">${INFRA.kmVrijliggendFietspad.toLocaleString("nl-NL")} km</div>` +
  `<div class="lbl">vrijliggend fietspad binnen de wijk</div><div class="src">OSM ${INFRA.peildatum}</div></div>` +
  `<div class="cell"><div class="num">${INFRA.snelwegKruisingenFiets}</div>` +
  `<div class="lbl">fietskruisingen (over/onder) met de ${refs}</div><div class="src">OSM</div></div>` +
  `<div class="cell"><div class="num">${o.kruisendSnelweg.mediaan.toLocaleString("nl-NL")}×</div>` +
  `<div class="lbl">mediane omrijfactor fiets, ${refs} kruisend (n=${o.kruisendSnelweg.n})</div><div class="src">OSM-netwerk</div></div>` +
  `<div class="cell"><div class="num">${o.zelfdeZijde.mediaan.toLocaleString("nl-NL")}×</div>` +
  `<div class="lbl">idem, zelfde zijde (n=${o.zelfdeZijde.n}) — referentie</div><div class="src">OSM-netwerk</div></div>`;
const foot = document.getElementById("infraFoot");
if (foot) foot.textContent = "Bron: " + INFRA.bron + " · peildatum " + INFRA.peildatum +
  ". Omrijfactor = netwerkafstand ÷ hemelsbrede afstand, paren " + o.afstandsklasse + ". " + INFRA.caveat;
});

veilig("kaart-fiets", () => {
/* ---------- fietskaart: vrijliggend fietsnetwerk (OSM, js/infra.js) ---------- */
if (typeof INFRA === "undefined" || typeof L === "undefined") return;
const el = document.getElementById("kaartFiets");
if (!el) return;
const kF = L.map("kaartFiets", {scrollWheelZoom:false});
basiskaart().addTo(kF);
let grens = null;
if (typeof GEO !== "undefined")
  grens = L.geoJSON({type:"FeatureCollection", features:GEO.features},
    {style:{color:ASFALT, weight:1.2, fill:false, dashArray:"4 3"}}).addTo(kF);
const net = L.geoJSON(INFRA.fietsnet,
  {style:{color:POLDER, weight:2.5, opacity:.85}}).addTo(kF);
kF.fitBounds((grens || net).getBounds().pad(.06));

/* optionele onderlegger: RIVM-jaargemiddeldekaart luchtkwaliteit (Atlas Leefomgeving).
   De alias-lagen *_actueel verwijzen altijd naar de nieuwste NSL-kaart; het peiljaar
   wordt lui uit de capabilities gehaald (pas bij eerste gebruik — het bestand is groot). */
const ALO_WMS = "https://data.rivm.nl/geo/alo/wms";
const luchtToggle = document.getElementById("luchtToggle");
const luchtStof = document.getElementById("luchtStof");
const luchtLegenda = document.getElementById("luchtLegenda");
if (luchtToggle && luchtStof && luchtLegenda) {
  let luchtLaag = null, luchtActief = false, luchtPeiljaar = null;
  const toonLuchtLegenda = () => {
    luchtLegenda.style.display = luchtActief ? "block" : "none";
    if (!luchtActief) return;
    const label = luchtStof.selectedOptions[0].textContent;
    luchtLegenda.innerHTML =
      `<img alt="Legenda luchtkwaliteit (${label})" ` +
      `src="${ALO_WMS}?service=WMS&version=1.1.1&request=GetLegendGraphic&format=image/png&layer=${luchtStof.value}" ` +
      `style="max-width:100%" onerror="this.replaceWith('(legenda niet beschikbaar — RIVM niet bereikbaar?)')"> ` +
      `<span>RIVM grootschalige concentratiekaart (NSL-monitoring), jaargemiddelde ` +
      `${luchtPeiljaar ?? "meest recente jaar"} in µg/m³. Klik op de kaart voor de waarde ter plekke.</span>`;
  };
  const zoekLuchtPeiljaar = async () => {
    if (luchtPeiljaar) return;
    try {
      const xml = await (await fetch(ALO_WMS + "?service=WMS&request=GetCapabilities")).text();
      const m = xml.match(/rivm_nsl_\d{8}_gm_NO2(\d{4})/);
      if (m) { luchtPeiljaar = m[1]; toonLuchtLegenda(); }
    } catch (e) { /* peiljaar blijft "meest recente jaar" */ }
  };
  luchtToggle.disabled = false;
  luchtToggle.addEventListener("change", e => {
    luchtActief = e.target.checked;
    if (luchtActief) {
      if (!luchtLaag) luchtLaag = L.tileLayer.wms(ALO_WMS,
        {layers:luchtStof.value, format:"image/png", transparent:true, opacity:.55,
         attribution:"RIVM/NSL-monitoring via Atlas Leefomgeving"});
      luchtLaag.addTo(kF);
      zoekLuchtPeiljaar();
    } else if (luchtLaag) { kF.removeLayer(luchtLaag); }
    toonLuchtLegenda();
  });
  luchtStof.addEventListener("change", () => {
    if (luchtLaag) luchtLaag.setParams({layers: luchtStof.value});
    toonLuchtLegenda();
  });
  /* klik met actieve laag: concentratie ter plekke (GetFeatureInfo, GRAY_INDEX in µg/m³) */
  kF.on("click", async e => {
    if (!luchtActief) return;
    const size = kF.getSize(), pt = kF.latLngToContainerPoint(e.latlng);
    const sw = L.CRS.EPSG3857.project(kF.getBounds().getSouthWest());
    const ne = L.CRS.EPSG3857.project(kF.getBounds().getNorthEast());
    const url = ALO_WMS + "?" + new URLSearchParams({
      service:"WMS", version:"1.1.1", request:"GetFeatureInfo",
      layers:luchtStof.value, query_layers:luchtStof.value, styles:"",
      srs:"EPSG:3857", bbox:`${sw.x},${sw.y},${ne.x},${ne.y}`,
      width:size.x, height:size.y, x:Math.round(pt.x), y:Math.round(pt.y),
      info_format:"application/json", feature_count:"1"});
    let inhoud;
    try {
      const data = await (await fetch(url)).json();
      const g = data.features?.[0]?.properties?.GRAY_INDEX;
      const label = luchtStof.selectedOptions[0].textContent;
      inhoud = (g == null)
        ? "Geen waarde op deze plek."
        : `<b>${label}</b> hier: ${Number(g).toLocaleString("nl-NL", {maximumFractionDigits:1})} µg/m³` +
          `<br><i>RIVM/NSL jaargemiddelde ${luchtPeiljaar ?? ""}</i>`;
    } catch (err) {
      inhoud = "Waarde niet opgehaald (RIVM niet bereikbaar?).";
    }
    L.popup().setLatLng(e.latlng).setContent(inhoud).openOn(kF);
  });
}

const foot = document.getElementById("kaartFietsFoot");
if (foot) foot.textContent = "Bron: " + INFRA.bron + " · peildatum " + INFRA.peildatum +
  " (niveau: " + INFRA.niveau + "). " + INFRA.caveat +
  " Zelfde selectie als de laag 'vrijliggend fietspad' in sectie 02 (" +
  INFRA.kmVrijliggendFietspad.toLocaleString("nl-NL") + " km binnen de wijk).";
});

veilig("ongevallen", () => {
/* ---------- verkeersongevallenkaart (BRON/RWS, js/ongevallen.js) ---------- */
if (typeof ONGEVALLEN === "undefined" || typeof L === "undefined") return;
const el = document.getElementById("kaartOngeval");
if (!el) return;
const kO = L.map("kaartOngeval", {scrollWheelZoom:false});
basiskaart().addTo(kO);
if (typeof GEO !== "undefined"){
  const grens = L.geoJSON({type:"FeatureCollection", features:GEO.features},
    {style:{color:ASFALT, weight:1.2, fill:false, dashArray:"4 3"}}).addTo(kO);
  kO.fitBounds(grens.getBounds().pad(.05));
} else {
  kO.setView([51.946, 4.433], 13);
}

/* tekenvolgorde en opmaak per afloop; UMS standaard uit (grootste, minst volledige
   categorie — zou de letsel-/dodelijke punten volledig overstemmen) */
const AFLOOP_STIJL = {
  "Uitsluitend materiele schade": {kleur:GRIJS,     r:3.5, aan:false, label:"uitsluitend materiële schade"},
  "Letsel":                       {kleur:GEEL,      r:6,   aan:true,  label:"letsel"},
  "Dodelijk":                     {kleur:"#B0452F", r:8,   aan:true,  label:"dodelijk"}
};
const soorten = Object.keys(AFLOOP_STIJL)
  .concat([...new Set(ONGEVALLEN.punten.map(p => p.afloop))]
    .filter(a => !AFLOOP_STIJL[a]));
const groepen = {};
const toggles = document.getElementById("ongevalToggles");
soorten.forEach(afloop => {
  const st = AFLOOP_STIJL[afloop] || {kleur:GRIJS, r:4, aan:true, label:afloop.toLowerCase()};
  const pts = ONGEVALLEN.punten.filter(p => p.afloop === afloop);
  if (!pts.length) return;
  const laag = L.layerGroup(pts.map(p =>
    L.circleMarker([p.lat, p.lon],
      {radius:st.r, color:"#FAFAF5", weight:1, fillColor:st.kleur, fillOpacity:.85})
     .bindPopup(`<b>${p.afloop}</b> · ${p.jaar}` +
       (p.aard ? `<br>${p.aard}` : "") +
       (p.partijen && p.partijen.length ? `<br>${p.partijen.join(" × ")}` : "") +
       (p.straat ? `<br>${p.straat}` : "") +
       (p.vmax ? ` · max ${p.vmax} km/u` : ""))));
  groepen[afloop] = laag;
  if (st.aan) laag.addTo(kO);
  if (toggles) {
    const lab = document.createElement("label");
    lab.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin:0 14px 6px 0;font-size:13.5px;cursor:pointer";
    lab.innerHTML = `<input type="checkbox"${st.aan ? " checked" : ""}>` +
      `<span style="width:11px;height:11px;border-radius:50%;background:${st.kleur};display:inline-block"></span>` +
      `${st.label} (${pts.length.toLocaleString("nl-NL")})`;
    lab.querySelector("input").addEventListener("change", e => {
      if (e.target.checked) { laag.addTo(kO); } else { kO.removeLayer(laag); }
    });
    toggles.appendChild(lab);
  }
});

const strip = document.getElementById("ongevalStrip");
if (strip) {
  const tel = a => ONGEVALLEN.punten.filter(p => p.afloop === a).length;
  const kwetsbaar = ONGEVALLEN.punten.filter(p =>
    (p.partijen || []).some(o => /fiets|voetganger/i.test(o))).length;
  strip.innerHTML =
    `<div class="cell"><div class="num">${tel("Dodelijk")}</div>` +
    `<div class="lbl">dodelijke ongevallen (${ONGEVALLEN.peildatum})</div><div class="src">BRON/RWS</div></div>` +
    `<div class="cell"><div class="num">${tel("Letsel").toLocaleString("nl-NL")}</div>` +
    `<div class="lbl">letselongevallen (${ONGEVALLEN.peildatum})</div><div class="src">BRON/RWS</div></div>` +
    `<div class="cell"><div class="num">${kwetsbaar.toLocaleString("nl-NL")}</div>` +
    `<div class="lbl">ongevallen met fietser of voetganger als geregistreerde partij</div><div class="src">BRON/RWS</div></div>` +
    `<div class="cell"><div class="num">${ONGEVALLEN.punten.length.toLocaleString("nl-NL")}</div>` +
    `<div class="lbl">geregistreerde ongevallen totaal, incl. uitsluitend materiële schade</div><div class="src">BRON/RWS</div></div>`;
}
const foot = document.getElementById("ongevalFoot");
if (foot) foot.textContent = "Bron: " + ONGEVALLEN.bron + " · periode " + ONGEVALLEN.peildatum +
  " (niveau: " + ONGEVALLEN.niveau + "). " + ONGEVALLEN.caveat;
});

veilig("voorzieningen", () => {
/* ---------- voorzieningenkaart (OSM, js/voorzieningen.js) ---------- */
if (typeof VOORZ === "undefined" || typeof L === "undefined") return;
const el = document.getElementById("kaartVoorz");
if (!el) return;
const KLEUR = {zorg:"#B0452F", onderwijs:GEEL, cultuur:SCHIE, dagelijks:ASFALT, sport:POLDER};
const kaartV = L.map("kaartVoorz", {scrollWheelZoom:false}).setView([51.946,4.433],13);
basiskaart().addTo(kaartV);
if (typeof GEO !== "undefined"){
  const grens = L.geoJSON({type:"FeatureCollection", features:GEO.features},
    {style:{color:ASFALT, weight:1.2, fill:false, dashArray:"4 3"}}).addTo(kaartV);
  kaartV.fitBounds(grens.getBounds());
}
const groepen = {};
VOORZ.punten.forEach(p => {
  (groepen[p.cat] ??= L.layerGroup()).addLayer(
    L.circleMarker([p.lat, p.lon], {radius:5.5, color:"#FAFAF5", weight:1,
      fillColor:KLEUR[p.cat] || "#7A7A6C", fillOpacity:.9})
     .bindPopup(`<b>${p.n}</b><br>${VOORZ.categorieen[p.cat]}`));
});
const toggles = document.getElementById("voorzToggles");
Object.entries(VOORZ.categorieen).forEach(([cat, label]) => {
  const n = VOORZ.telling[cat] || 0;
  const lab = document.createElement("label");
  lab.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin:0 14px 6px 0;font-size:13.5px;cursor:pointer";
  lab.innerHTML = `<input type="checkbox" checked>` +
    `<span style="width:11px;height:11px;border-radius:50%;background:${KLEUR[cat]};display:inline-block"></span>` +
    `${label} (${n})`;
  lab.querySelector("input").addEventListener("change", e => {
    if (!groepen[cat]) return;
    if (e.target.checked) { groepen[cat].addTo(kaartV); } else { kaartV.removeLayer(groepen[cat]); }
  });
  toggles.appendChild(lab);
  if (groepen[cat]) groepen[cat].addTo(kaartV);
});
const foot = document.getElementById("voorzFoot");
if (foot) foot.textContent = "Bron: " + VOORZ.bron + " · peildatum " + VOORZ.peildatum +
  " (niveau: " + VOORZ.niveau + "). " + VOORZ.caveat;
});

veilig("buurtkaarten", () => {
/* ---------- buurtenkaarten ---------- */
const bc = document.getElementById("buurten");
D.buurten.forEach(b=>{
  const el = document.createElement("div");
  el.className="buurt"; el.tabIndex=0; el.setAttribute("role","button");
  el.innerHTML = `<div class="naam">${b.n}</div><div class="tag">${b.t}</div><div class="meer">${b.m}</div>`;
  const t=()=>el.classList.toggle("open");
  el.addEventListener("click",t);
  el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();t();}});
  bc.appendChild(el);
});
});

veilig("scroll", () => {
/* ---------- scroll: spine-progress + reveals ---------- */
const prog = document.getElementById("progress");
addEventListener("scroll",()=>{
  const h = document.documentElement;
  prog.style.height = (h.scrollTop/(h.scrollHeight-h.clientHeight)*100)+"vh";
},{passive:true});

const io = new IntersectionObserver(es=>es.forEach(e=>{
  if(e.isIntersecting){e.target.classList.add("on"); io.unobserve(e.target);}
}),{threshold:.12});
document.querySelectorAll(".reveal").forEach(el=>io.observe(el));
});
