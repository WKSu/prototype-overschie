/* Gebiedsprofiel — app-logica.
   Elk onderdeel initialiseert geïsoleerd: als één grafiek faalt,
   blijven de rest van de grafieken, de kaart en de interactie werken. */
/* Mislukte blokken worden niet alleen gelogd maar ook op <body> gezet. Console-uitvoer van een
   pagina is niet betrouwbaar af te lezen bij een headless controle, waardoor een blok stil kon
   wegvallen zonder dat de rooktest dat zag. Nu staat het in de DOM en valt het op. */
const VEILIG_FOUTEN = [];
function veilig(naam, fn){
  try { fn(); }
  catch(e){
    VEILIG_FOUTEN.push(naam + ": " + e.message);
    console.error("[" + naam + "]", e.message);
    if (document.body) document.body.dataset.veiligFouten = VEILIG_FOUTEN.join(" | ");
  }
}

/* Eén kerncijfervierkant, met een expliciet anker voor de reviewmodus (js/review.js).
   De sleutel wordt hier meegegeven en niet uit het label afgeleid: labels dragen jaartallen,
   buurtnamen en waarnemingsaantallen die per gebied verschillen, dus een afgeleide sleutel
   zou per gebied een ander anker opleveren en historische opmerkingen laten zweven.
   Zonder sleutel blijft het vierkant gewoon werken; het is dan alleen als onderdeel van
   zijn strook te becommentariëren. `class="cell"` staat vooraan omdat scripts/rooktest.js
   op die letterlijke tekst telt. */
function sleutelbaar(tekst) {
  return String(tekst).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  /* é -> e, zodat de sleutel ASCII blijft */
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function tegelHtml(num, lbl, src, sleutel, stijl) {
  return `<div class="cell"${stijl ? ` style="${stijl}"` : ""}` +
    `${sleutel ? ` data-onderwerp="${sleutel}"` : ""}>` +
    `<div class="num">${num}</div><div class="lbl">${lbl}</div>` +
    `<div class="src">${src}</div></div>`;
}

/* ---------- welk gebied tonen we? ----------
   Alle gebiedsafhankelijke labels lezen hieruit, zodat er nergens meer een wijknaam of
   gemeentenaam in de code staat. GEO is de bron: die draagt sinds het gebiedsmodel de code,
   naam en het niveau van het gebied. Ontbreekt GEO, dan valt alles terug op js/laad.js. */
const GEBIEDCODE = (typeof GEO !== "undefined" && GEO.gebiedcode)
  || (typeof PROFIEL !== "undefined" && PROFIEL.gebiedcode)
  || (typeof HUIDIG_GEBIED !== "undefined" ? HUIDIG_GEBIED : "");
/* PROFIEL als tweede bron: bij een gedeeltelijke build (alleen profiel en odin, zoals voor
   de referentielaag) ontbreekt GEO, en dan stond overal de kale gebiedscode in de tekst. */
const GEBIEDNAAM = (typeof GEO !== "undefined" && GEO.gebiednaam)
  || (typeof PROFIEL !== "undefined" && PROFIEL.wijknaam) || GEBIEDCODE || "dit gebied";
const GEBIEDNIVEAU = (typeof GEO !== "undefined" && GEO.gebiedniveau)
  || (typeof PROFIEL !== "undefined" && PROFIEL.gebiedniveau) || "gebied";
const GEMEENTENAAM = (typeof GEBIEDEN !== "undefined" && GEBIEDEN.gemeente
  && GEBIEDEN.gemeente.naam) || "de gemeente";
const GEBIEDLABEL = `${GEBIEDNAAM} (${GEBIEDNIVEAU})`;
const TEKST = typeof tekstenVoor === "function" ? tekstenVoor(GEBIEDCODE) : {};
const getalNL = n => n == null ? "—" : n.toLocaleString("nl-NL");
/* GTFS telt na middernacht door: een rit om 01:10 die bij de dienstdag van gisteren hoort,
   staat er als 25:10. Rekenen moet op die doorlopende telling — anders is het laatste vertrek
   "vroeger" dan het eerste en klopt een bedieningsvenster niet — maar een lezer verwacht een
   klok. Dus alleen bij het tonen terug naar 00–23; vergelijken en aftrekken blijven op de
   ruwe tijd. */
const klokGTFS = t => {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${String(Number(h) % 24).padStart(2, "0")}:${m}`;
};
/* Een bediening van eerste tot laatste vertrek. Na middernacht is de kale kloktijd meestal
   ondubbelzinnig: 05:26–00:56 leest vanzelf als "tot na middernacht". Behalve als de dienst
   (bijna) de klok rond gaat: het nachtnet geeft 04:02–28:57, en als 04:02–04:57 leest dat als
   een uur treindienst. Alleen dan "+1 dag" erachter. */
const vensterGTFS = (eerste, laatste) => {
  const van = klokGTFS(eerste), tot = klokGTFS(laatste);
  const volgendeDag = parseInt(eerste, 10) < 24 && parseInt(laatste, 10) >= 24 && tot >= van;
  /* nowrap op beide delen: in een smalle kolom breekt de regel dan tussen het bereik en
     "+1 dag", niet na het streepje of midden in "+1 dag" */
  return `<span style="white-space:nowrap">${van}–${tot}</span>` + (volgendeDag
    ? ' <span style="white-space:nowrap;color:var(--asfalt-zacht)" title="laatste vertrek ' +
      'valt op de volgende kalenderdag">+1 dag</span>'
    : "");
};

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
  /* Chart.js laat standaard de rand aan de voet van een balk weg (borderSkipped: "start").
     Bij onze zwarte balkranden leest dat als een open bakje: "de bar is niet gesloten, er
     mist een zwarte lijn aan de onderkant" (#107). Op één plek, zodat elke staafgrafiek het
     krijgt, ook een nieuwe. */
  Chart.defaults.elements.bar.borderSkipped = false;
}
const ASFALT="#22261F", GEEL="#E8B006", SCHIE="#2E6F8E", POLDER="#557A46", BETON="#E3E1D4";
const GRIJS="#7A7A6C";
/* vaste kleuren per OV-vervoerwijze, gedeeld door OV-kaart en spits/dal-grafiek */
const KLEUR_SOORT = {metro:"#B0452F", tram:GEEL, bus:SCHIE, trein:ASFALT, veer:POLDER, overig:GRIJS};
const gridOpt = {color:"rgba(34,38,31,.10)"};

/* ---------- referentiereeksen: met wie vergelijk je? (#48, #7) ----------
   Elke grafiek vergeleek het gebied met de gemeente. Voor een wijk is dat de juiste
   buitenstaander. Voor een rayon niet: Noord buiten de Ring is 163.560 van 672.950 inwoners,
   bijna een kwart, dus het gemeentegemiddelde bevat het rayon zelf. Die vergelijking is
   deels circulair en de verschillen zijn structureel klein.

   De natuurlijke peer group van een rayon zijn de andere drie rayons: vergelijkbaar in
   omvang en bestuurlijke functie, en precies de vergelijking die in een rayonplan gemaakt
   wordt. Vandaar een standaardkeuze per niveau, en niet één vaste referentie.

   Dit blok staat vóór de eerste grafiek en niet halverwege het bestand: de grafieken van
   sectie 02 en 03 schrijven zich tijdens hun eigen blok in bij `bijRefWijziging()`, en stond
   die functie lager, dan zat `refAbonnees` op dat moment nog in de temporal dead zone en zou
   veilig() die blokken netjes laten vallen. Netjes gevallen blokken zijn nog steeds gevallen
   blokken. */
const REF = (typeof REFERENTIE !== "undefined" && REFERENTIE.gebieden) || {};
/* De code van de gemeente, voor grafieken die Rotterdam al als vaste reeks tekenen. */
const GEMEENTECODE = (typeof GEBIEDEN !== "undefined" && GEBIEDEN.gemeente
  && GEBIEDEN.gemeente.code) || "";
const REF_KLEUR = {gemeente: SCHIE, rayon: "#7B4B94", wijk: POLDER, gebied: POLDER};

function referentiekandidaten() {
  const eigen = GEBIEDCODE;
  const alle = Object.entries(REF).map(([code, r]) => ({code, ...r}));
  const rayons = alle.filter(r => r.niveau === "rayon" && r.code !== eigen);
  const gemeente = alle.filter(r => r.niveau === "gemeente" && r.code !== eigen);
  if (GEBIEDNIVEAU === "rayon") {
    /* de zusterrayons standaard aan, de gemeente beschikbaar maar uit */
    return [...rayons.map(r => ({...r, standaard: true})),
            ...gemeente.map(r => ({...r, standaard: false}))];
  }
  if (GEBIEDNIVEAU === "gemeente") {
    /* op gemeenteniveau zijn de vier rayons de interne verdeling, geen buitenstaander */
    return rayons.map(r => ({...r, standaard: true}));
  }
  /* wijk of gebied: de gemeente is hier wél een zinnige buitenstaander, en het eigen rayon
     is de directe context waarin dit gebied bestuurlijk valt */
  const rayonLijst = typeof GEBIEDEN !== "undefined" ? GEBIEDEN.rayons || [] : [];
  const eigenRayon = rayonLijst.find(r => (r.gebieden || []).some(g => g.code === eigen));
  /* Daarnaast de andere gebieden (#106). Tot nu toe kon Overschie alleen naast Rotterdam en
     zijn eigen rayon, terwijl de vraag in een gebiedsplan juist is hoe het zich verhoudt tot
     Hillegersberg-Schiebroek of tot een gebied elders in de stad. referentie.js heeft alle
     veertien gebieden al, dus dit is alleen een kwestie van ze aanbieden.

     Standaard uit, ook de zusters. Drie à vier extra reeksen in elk staafdiagram maakt de
     standaardweergave onleesbaar; wie wil vergelijken, zet ze aan. De zusters staan als vinkje
     in de balk, de rest in een keuzelijst per rayon (`extra`). De volgorde komt uit de
     gebiedsboom en niet uit referentie.js, zodat hij per rayon gegroepeerd is. */
  const rayonVan = {};
  rayonLijst.forEach(r => (r.gebieden || []).forEach(g => { rayonVan[g.code] = r; }));
  const volgorde = rayonLijst.flatMap(r => (r.gebieden || []).map(g => g.code));
  const gebieden = alle
    .filter(r => r.code !== eigen && r.niveau !== "rayon" && r.niveau !== "gemeente"
              && volgorde.includes(r.code))
    .sort((a, b) => volgorde.indexOf(a.code) - volgorde.indexOf(b.code));
  const zuster = r => eigenRayon && rayonVan[r.code] === eigenRayon;
  return [
    ...gemeente.map(r => ({...r, standaard: true})),
    ...rayons.filter(r => eigenRayon && r.code === eigenRayon.code)
             .map(r => ({...r, standaard: true})),
    ...gebieden.filter(zuster).map(r => ({...r, standaard: false})),
    ...gebieden.filter(r => !zuster(r)).map(r =>
      ({...r, standaard: false, extra: true, rayonNaam: (rayonVan[r.code] || {}).naam || ""})),
  ];
}

const REF_KANDIDATEN = referentiekandidaten();

/* Peers op hetzelfde niveau: de eenheden waarmee dit gebied zich láát vergelijken.
   Voor een rayon de andere rayons; voor een wijk of gebied de andere gebieden in hetzelfde
   rayon — dezelfde bestuurlijke context en ongeveer dezelfde omvang, en dat is de vergelijking
   die in een gebiedsplan gemaakt wordt. Tussen niveaus vergelijken doen we bewust niet: dan
   presenteer je een omvangseffect als een verschil.

   Eén plek, want zowel de zelfvoorzienendheid (#49) als het signaleringsoverzicht (#67) heeft
   dezelfde groep nodig, en twee kopieën van deze regel gaan uit elkaar lopen. */
function peersOpNiveau(heeft = () => true, binnenEigenRayon = true) {
  const eigenRayon = (typeof GEBIEDEN !== "undefined" ? GEBIEDEN.rayons || [] : [])
    .find(r => (r.gebieden || []).some(g => g.code === GEBIEDCODE));
  /* `binnenEigenRayon` beperkt de groep tot de zusters in hetzelfde rayon. Dat is nodig waar
     de omvang van het gebied de uitkomst stuurt — zelfvoorzienendheid (#49) — maar niet bij
     WOZ, inkomen of armoede. En het is niet gratis: een rayon van drie gebieden levert maar
     twee peers, en met twee vergelijkingen is "de hoogste" een toevalligheid. Voor het
     signaleringsoverzicht zijn daarom alle veertien gebieden de groep. */
  const zusters = GEBIEDNIVEAU === "rayon" || GEBIEDNIVEAU === "gemeente" || !binnenEigenRayon
    ? null
    : new Set((eigenRayon ? eigenRayon.gebieden : []).map(g => g.code));
  const peers = Object.entries(REF)
    .filter(([code, r]) => code !== GEBIEDCODE && r.niveau === GEBIEDNIVEAU
                        && heeft(r) && (!zusters || zusters.has(code)))
    .map(([code, r]) => ({code, ...r}));
  return {
    peers,
    /* Hoe je die groep noemt in een zin. Bij een wijk is "de andere rayons" onjuist. */
    groepNaam: zusters && eigenRayon
      ? `andere gebieden in ${eigenRayon.naam}`
      : GEBIEDNIVEAU === "wijk" ? "andere Rotterdamse gebieden" : `andere ${GEBIEDNIVEAU}s`,
    /* Hoeveel peers zíjn er, los van hoeveel er gebouwd zijn. Zonder dat onderscheid meldt
       het dashboard "bouw de overige gebieden" bij een gemeente die per definitie geen peer
       heeft, en dat is een aanwijzing die nergens toe leidt. */
    mogelijk: GEBIEDNIVEAU === "gemeente" ? 0
      : GEBIEDNIVEAU === "rayon" ? Math.max(0, (GEBIEDEN?.rayons || []).length - 1)
      : zusters ? Math.max(0, zusters.size - 1)
      : Math.max(0, (GEBIEDEN?.rayons || []).reduce((n, r) => n + (r.gebieden || []).length, 0) - 1),
  };
}
/* De keuze staat in de URL-hash (`vergelijk=`), zodat een link mét vergelijking te delen is
   (#106). Ontbreekt de parameter, dan de standaardkeuze; staat hij er leeg, dan bewust geen
   enkele vergelijking. Onbekende codes vallen weg: een link van een rayonpagina bevat geen
   kandidaten voor een wijkpagina. Een gebiedswissel zet de hash op alleen `gebied=` en
   begint dus weer met de standaard van het nieuwe niveau — terecht, want de kandidaten
   verschillen per niveau. `typeof location`: de referentielaag draait ook in Node
   (scripts/check_referentielaag.js), zonder browser. */
function refUitHash() {
  if (typeof location === "undefined") return null;
  const m = /(?:^|[#&])vergelijk=([A-Za-z0-9_,]*)/.exec(location.hash || "");
  return m ? m[1].split(",").filter(c => REF_KANDIDATEN.some(k => k.code === c)) : null;
}
const _refUitHash = refUitHash();
const refAan = new Set(_refUitHash
  || REF_KANDIDATEN.filter(r => r.standaard).map(r => r.code));
/* Welke kandidaten als vinkje in beeld staan. De `extra` gebieden pas nadat ze gekozen zijn;
   uitzetten laat het vinkje staan, zodat een misklik terug te draaien is. */
const refGetoond = new Set(REF_KANDIDATEN.filter(r => !r.extra || refAan.has(r.code))
  .map(r => r.code));
function refNaarHash() {
  if (typeof history === "undefined" || !history.replaceState) return;
  /* replaceState en niet location.hash: die laatste springt naar een anker en voegt voor
     elk vinkje een stap aan de browsergeschiedenis toe. De andere parameters (gebied=,
     naar=, review=) blijven staan. */
  const delen = (location.hash || "").replace(/^#/, "").split("&")
    .filter(d => d && !d.startsWith("vergelijk="));
  delen.push("vergelijk=" + [...refAan].join(","));
  history.replaceState(null, "", "#" + delen.join("&"));
}

/* ---------- de referentiekeuze als pagina-brede instelling (#7) ----------
   De keuze stond in sectie 02 en gold voor één grafiek: de buurtvergelijking. Dat is de
   verkeerde plek voor iets wat het hele dashboard aangaat. Wie in sectie 07 leest hoe
   bewoners reizen wil daar kunnen zien hoe dat zich verhoudt tot het rayon, en niet vijf
   secties terugscrollen naar een keuzevakje dat op die grafiek geen effect had.

   Eén toestand (`refAan`), meerdere bedieningen: elk element met `data-refkeuze` krijgt
   dezelfde keuzevakjes, een wijziging waar dan ook werkt de andere bij en laat elke
   ingeschreven grafiek zichzelf opnieuw tekenen. Een grafiek die zich niet inschrijft
   verandert niet — dat is zichtbaar, en beter dan een pagina die half bijgewerkt is.

   Waarom niet één referentie per grafiek: dan vergelijkt sectie 03 met de gemeente en
   sectie 07 met het rayon, en is het verschil tussen twee grafieken niet meer te lezen als
   een verschil in de data. Consistentie over de secties heen is hier de hele opgave. */
const refAbonnees = [];
function bijRefWijziging(naam, fn) { refAbonnees.push([naam, fn]); }
function refGewijzigd() {
  /* Eén grafiek die struikelt mag de andere niet meenemen. Dat is precies wat veilig() doet,
     dus dat gebruiken we ook: een hertekenfout komt zo op body[data-veilig-fouten] terecht en
     valt op in de rooktest. Alleen in de console loggen zou een grafiek zonder referentielijn
     er net zo uit laten zien als een grafiek die er geen heeft. */
  refAbonnees.forEach(([naam, fn]) => veilig("referentie:" + naam, fn));
}
function refActief() { return REF_KANDIDATEN.filter(r => refAan.has(r.code)); }
/* De ODiN-grafieken tekenden Rotterdam altijd, uit hun eigen uitdraai, ook als de gemeente in
   de balk uitstond (#109). Op een rayonpagina, waar de gemeente standaard uit staat, leek de
   grafiek daardoor de balk te negeren. Nu hangt de zichtbaarheid aan dezelfde keuze; de
   cijfers blijven uit ODINW.*.rotterdam komen, met hun eigen n. Zonder referentielaag blijft
   Rotterdam staan als enige buitenstaander, zoals de buurtvergelijking ook terugvalt. Op de
   gemeentepagina zelf nooit: dat is dan het gebied zelf, twee keer. */
function gemeenteReeksAan() {
  if (GEBIEDNIVEAU === "gemeente") return false;
  if (!REF_KANDIDATEN.length) return true;
  return refAan.has(GEMEENTECODE);
}

/* Kleur per niveau — maar op rayonniveau staan er drie zusterrayons naast elkaar, en die
   kregen alle drie dezelfde paarse lijn. Drie ononderscheidbare lijnen met drie namen in de
   legenda is geen vergelijking.

   Daarom de tint van het niveau vasthouden en binnen dat niveau de lichtheid variëren: paars
   blijft "rayon", maar de drie rayons zijn uit elkaar te houden. Een andere hue per rayon zou
   dat verband juist weggooien. De volgorde komt uit REF_KANDIDATEN en is dus stabiel: hetzelfde
   rayon houdt dezelfde tint over alle grafieken heen, en dat is waar #7 om draait.

   De lichtheid wordt begrensd: te licht verdwijnt tegen de achtergrond, te donker wordt zwart. */
function _hexNaarHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, sat * 100, l * 100];
}
function _hslNaarHex(h, sp, lp) {
  const sat = sp / 100, l = lp / 100;
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const naar = v => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + naar(r) + naar(g) + naar(b);
}
/* Verschuiving per positie binnen het niveau. De eerste houdt de basiskleur, zodat een
   grafiek met één referentie er precies zo uitziet als voorheen. */
const _L_VERSCHUIVING = [0, 18, -13, 32, -22];
/* De groep waarbinnen de tint verschuift. Tot vijf kandidaten per niveau is dat de hele groep,
   zodat een rayon altijd dezelfde tint houdt, ook als je andere rayons aan- of uitzet. Een
   wijkpagina heeft er sinds #106 dertien, en met vijf tinten zouden er dan twee gebieden
   dezelfde kleur krijgen. Daar telt de positie onder de aangezette gebieden: tussen de
   grafieken blijft de kleur gelijk, alleen een andere keuze kan hem verschuiven. */
function _refKleurgroep(r) {
  const zelfde = REF_KANDIDATEN.filter(k => k.niveau === r.niveau);
  return zelfde.length > _L_VERSCHUIVING.length
    ? zelfde.filter(k => refAan.has(k.code)) : zelfde;
}
function refKleurVan(r) {
  const basis = REF_KLEUR[r.niveau] || GRIJS;
  const zelfde = _refKleurgroep(r);
  if (zelfde.length < 2) return basis;
  const i = Math.max(0, zelfde.findIndex(k => k.code === r.code));
  const [h, sat, l] = _hexNaarHsl(basis);
  const verschoven = l + (_L_VERSCHUIVING[i % _L_VERSCHUIVING.length] || 0);
  return _hslNaarHex(h, sat, Math.min(68, Math.max(22, verschoven)));
}

/* Streeppatroon per positie binnen het niveau. Kleur alleen is niet genoeg — vier lijnen in
   vier tinten van dezelfde paars zijn voor een kleurenblinde lezer vier keer grijs — dus de
   lijnen krijgen er een vorm bij. Dezelfde volgorde als de tinten. */
const _STREEP = [[5, 4], [2, 3], [9, 4], [1, 3], [12, 3, 3, 3]];
function refStreepVan(r) {
  const zelfde = _refKleurgroep(r);
  const i = Math.max(0, zelfde.findIndex(k => k.code === r.code));
  return _STREEP[i % _STREEP.length];
}

/* Waarde diep uit een referentierij: "verdelingen.leeftijd", "odin.motieven". */
function refPad(rij, pad) {
  return pad.split(".").reduce((o, k) => (o == null ? o : o[k]), rij);
}

/* Referentiereeksen, uitgelijnd op de labels van de grafiek zelf.

   Uitlijnen op label en niet op positie. Een referentiegebied kan een categorie missen — te
   weinig ODiN-waarnemingen, of een CBS-klasse die daar niet voorkomt — en bij uitlijnen op
   positie schuift de rest van de reeks dan één plek op zonder dat iemand het ziet.

   Drie vormen komen binnen: {labels, values} voor een verdeling, {jaren, waarden} voor een
   tijdreeks, en [{label, share, n}] uit ODiN. Die laatste draagt `n` mee, en daar geldt de
   drempel van #13 ook: een peer-aandeel dat op negen verplaatsingen rust hoort niet in beeld,
   ook niet als vergelijking. */
function refReeksen(pad, labels, opties = {}) {
  const drempel = (typeof ODINW !== "undefined" && ODINW.drempel && ODINW.drempel.nMin) || 20;
  /* `zonder` laat een grafiek een referentiegebied overslaan dat hij al als vaste reeks
     tekent. De ODiN-grafieken hebben Rotterdam altijd al staan, uit dezelfde uitdraai; die
     er nog een keer naast zetten leverde twee identieke balken met dezelfde naam. */
  const zonder = opties.zonder || [];
  return refActief().filter(r => !zonder.includes(r.code)).map(r => {
    const bron = refPad(REF[r.code] || {}, pad);
    let bij = null;
    let onderDrempel = 0;
    /* Zelfde markering als bij de buurtvergelijking (#37): een aggregaat met onderdrukte
       deelgebieden is een ondergrens, en dat hoort in het label te staan waar de lezer de
       lijn ziet — niet alleen in een voetnoot drie grafieken verderop. */
    const onvolledig = bron && bron.volledig === false;
    if (Array.isArray(bron)) {
      bij = {};
      bron.forEach(x => {
        if (x.onderdrukt) return;                       // verantwoordingsregel, geen categorie
        if (typeof x.n === "number" && x.n < drempel) { onderDrempel++; return; }
        bij[x.label] = x.share;
      });
    } else if (bron && Array.isArray(bron.labels) && Array.isArray(bron.values)) {
      bij = Object.fromEntries(bron.labels.map((l, i) => [l, bron.values[i]]));
    } else if (bron && Array.isArray(bron.jaren) && Array.isArray(bron.waarden)) {
      /* Een tijdreeks noemt zijn as `jaren`/`waarden` en niet `labels`/`values`. Zonder deze
         tak gaf refReeksen() stilletjes niets terug: de legenda stond er, de lijnen niet. */
      bij = Object.fromEntries(bron.jaren.map((j, i) => [j, bron.waarden[i]]));
    }
    if (!bij) return null;
    const waarden = labels.map(l => (typeof bij[l] === "number" ? bij[l] : null));
    /* Niets bruikbaars is geen reeks. Een lijn van louter gaten leest als "nul". */
    if (!waarden.some(v => v !== null)) return null;
    return {code: r.code, naam: r.naam, niveau: r.niveau, kleur: refKleurVan(r),
            streep: refStreepVan(r),
            label: r.naam + (onvolledig ? ` (≥, ${bron.nOnderdrukt || 0} onderdrukt)` : ""),
            waarden, onderDrempel};
  }).filter(Boolean);
}

/* Eén getal per referentiegebied: "inkomen.ontvanger", "indicatoren.woz.waarde".

   Het getal mag kaal zijn of verpakt als {waarde, volledig, nOnderdrukt}. Dat tweede is het
   geval waar het om gaat: het gemeentelijke inkomen rust op 14 van de 21 wijken en is dus een
   ondergrens, en dat hoort in het label te staan (#37). */
function refWaarden(pad) {
  return refActief().map(r => {
    const v = refPad(REF[r.code] || {}, pad);
    const waarde = typeof v === "number" ? v
      : (v && typeof v.waarde === "number" ? v.waarde : null);
    if (waarde === null) return null;
    const onvolledig = v && v.volledig === false;
    return {code: r.code, naam: r.naam, niveau: r.niveau, kleur: refKleurVan(r), waarde,
            label: r.naam + (onvolledig ? ` (≥, ${v.nOnderdrukt || 0} onderdrukt)` : "")};
  }).filter(Boolean);
}

/* Chart.js-balkdatasets naast de eigen reeks. Dunner dan de eigen balk: het gebied blijft het
   onderwerp en de referentie staat ernaast, niet ervoor. */
function refDatasets(pad, labels, opties = {}) {
  return refReeksen(pad, labels, opties).map(r => ({
    label: r.label, data: r.waarden, backgroundColor: r.kleur, borderColor: ASFALT,
    borderWidth: 1, maxBarThickness: opties.maxBarThickness || 14,
  }));
}

/* Eén stijl voor een referentielijn, gedeeld door de tijdreeks en de bevolkingsgroei: dun,
   gestreept, in de kleur van het niveau. `data` gaat apart mee omdat de groeigrafiek zijn
   reeks eerst indexeert, en de tijdreeks per jaargang een open stip zet. */
function refLijn(ref, data, extra = {}) {
  return {label: ref.label, data, borderColor: ref.kleur, backgroundColor: ref.kleur,
          borderWidth: 2, borderDash: ref.streep || [5, 4], pointRadius: 2.5,
          pointBorderColor: ref.kleur, pointBackgroundColor: ref.kleur, tension: 0,
          spanGaps: false, fill: false, ...extra};
}

/* Hoeveel referentiecategorieën onder de ODiN-drempel zijn weggelaten; leeg als er niets weg
   is. Hoort in de voetnoot van de grafiek, niet in de console. */
function refDrempelTekst(pad, labels, opties = {}) {
  const weg = refReeksen(pad, labels, opties).filter(r => r.onderDrempel);
  return weg.length
    ? " Bij " + weg.map(r => `${r.naam} (${r.onderDrempel})`).join(", ") +
      " zijn categorieën met te weinig waarnemingen uit de referentie gelaten."
    : "";
}

/* De bediening. Twee vormen: met uitleg (in sectie 02, waar de keuze wordt geïntroduceerd)
   en compact (in de balk bovenaan, die op elke sectie meescrollt). */
function bouwRefKeuze(el) {
  if (!REF_KANDIDATEN.length) { el.remove(); return; }
  const compact = el.hasAttribute("data-refcompact");
  const uitleg = GEBIEDNIVEAU === "rayon"
    ? "Vergelijk met de andere rayons — vergelijkbaar in omvang en functie. De gemeente " +
      "bevat dit rayon zelf voor ruwweg een kwart, dus die vergelijking zegt minder."
    : GEBIEDNIVEAU === "gemeente"
      ? "De vier rayons als interne verdeling van de gemeente."
      : "Vergelijk met de gemeente, met het rayon waar dit gebied onder valt, of met andere " +
        "gebieden — die staan standaard uit, anders wordt elke grafiek een woud van balken.";
  const vinkjes = REF_KANDIDATEN.filter(r => refGetoond.has(r.code));
  /* De rest als keuzelijst, per rayon gegroepeerd: dertien vinkjes passen niet in een balk
     die op een telefoon al twee regels beslaat. */
  const nogTeKiezen = REF_KANDIDATEN.filter(r => r.extra && !refGetoond.has(r.code));
  const groepen = [...new Set(nogTeKiezen.map(r => r.rayonNaam))];
  const keuzelijst = nogTeKiezen.length
    ? '<select data-refextra aria-label="Vergelijk met een ander gebied">' +
      '<option value="">+ ander gebied…</option>' +
      groepen.map(g => `<optgroup label="${g}">` +
        nogTeKiezen.filter(r => r.rayonNaam === g)
          .map(r => `<option value="${r.code}">${r.naam}</option>`).join("") +
        "</optgroup>").join("") +
      "</select>"
    : "";
  el.innerHTML =
    (compact
      ? '<label style="margin-right:2px">Vergelijk met</label>'
      : `<span style="color:var(--asfalt-zacht)">${uitleg} Geldt voor alle grafieken op ` +
        "deze pagina.</span><br>") +
    vinkjes.map(r =>
      '<label style="cursor:pointer;margin-right:12px;white-space:nowrap">' +
      `<input type="checkbox" data-ref="${r.code}"${refAan.has(r.code) ? " checked" : ""}> ` +
      /* In de donkere balk is de reekskleur zelf niet leesbaar als tekstkleur — SCHIE op
         asfalt haalt geen enkel contrastminimum. Daar wordt het een stip naast lichte tekst;
         in de sectie, op lichte achtergrond, blijft de naam zelf gekleurd. */
      (compact
        ? `<span class="stip" style="background:${refKleurVan(r)}"></span>${r.naam}`
        : `<span style="color:${refKleurVan(r)}">${r.naam}</span>`) +
      "</label>").join("") + keuzelijst;
  el.querySelectorAll("input[data-ref]").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) refAan.add(cb.dataset.ref); else refAan.delete(cb.dataset.ref);
      refKeuzeToegepast();
    });
  });
  const lijst = el.querySelector("select[data-refextra]");
  if (lijst) lijst.addEventListener("change", () => {
    if (!lijst.value) return;
    refAan.add(lijst.value);
    refGetoond.add(lijst.value);
    refKeuzeToegepast();
  });
}

/* Na elke wijziging alle bedieningen opnieuw opbouwen, niet alleen het ene vinkje bijzetten.
   De andere bedieningen moeten dezelfde toestand tonen — anders staat de balk bovenaan iets
   anders aan dan het blok in sectie 02 — en op een wijkpagina kan een keuze de kleur van de
   andere gebieden verschuiven (zie _refKleurgroep), dus de stippen moeten mee. */
function refKeuzeToegepast() {
  document.querySelectorAll("[data-refkeuze]").forEach(bouwRefKeuze);
  refNaarHash();
  refGewijzigd();
}


/* gedeelde kaartondergrond: PDOK BRT Achtergrondkaart, grijze variant (#91).
   CARTO levert zijn tegels niet meer zonder API-sleutel, en een sleutel kan in dit dashboard
   nergens veilig staan: het opent via file://, dus zonder domein om hem aan te binden, en een
   gecommitte sleutel is een publieke sleutel. PDOK vraagt geen sleutel en levert al de
   CBS-kaartlagen. Grijs en niet standaard: de ondergrond moet zwijgen zodat de dataoverlays
   spreken — dat was ook de reden voor Positron. De tegels staan in EPSG:3857, Leaflets
   standaardprojectie, dus een gewone tileLayer volstaat. */
/* Waar een registry-element (leeg slot, verkenner) komt. Sinds #112 mag `sectie` een
   subsectie zijn ("s5-ov"). Bestaat die niet — een oudere index.js tegen een nieuwere pagina of
   andersom — dan de sectie zelf ("s5"), zodat het element er nog staat, alleen minder precies. */
function plekVoor(sectie) {
  return document.getElementById(sectie)
    || document.getElementById(String(sectie || "").split("-")[0]);
}

function basiskaart(){
  return L.tileLayer(
    "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png",
    {maxZoom:19,
     attribution:'Kaartgegevens © <a href="https://www.kadaster.nl">Kadaster</a>'});
}

/* ---------- elke kaart schermvullend (#110) ----------
   "Ik wil dat je alle kaarten kan vergroten op het scherm." De kaarten zijn 300 à 400 px hoog,
   en voor een rayon met negentien buurten of de gemeente met 92 is dat te klein om te lezen.

   Via een init-hook op L.Map en niet per kaart: dan krijgt elke kaart de knop, ook een die
   later bijkomt, en de rooktest telt of dat klopt (knoppen = kaarten). Schermvullend gaat
   het blok om de kaart heen (de chart-box), niet de kaart alleen: legenda, laagkiezer en
   bronregel horen erbij, anders is de vergrote kaart een plaatje zonder uitleg.

   De Fullscreen API werkt ook onder file://. Waar hij ontbreekt (Safari op een iPhone kent
   hem niet voor gewone elementen) valt het terug op een CSS-klasse die het blok over het
   scherm legt; Escape sluit beide. Geen plugin: voor één knop is dat een dependency te veel. */
function kaartBlok(map) {
  const c = map.getContainer();
  return c.closest(".chart-box") || c.parentElement;
}
function kaartVolledig(map, aan) {
  const blok = kaartBlok(map);
  const c = map.getContainer();
  const api = blok.requestFullscreen && document.fullscreenEnabled !== false;
  if (aan) {
    blok.classList.add("kaart-vol");
    c.classList.add("kaart-vol-kaart");
    if (api) blok.requestFullscreen().catch(() => blok.classList.add("kaart-vol-css"));
    else blok.classList.add("kaart-vol-css");
  } else {
    if (document.fullscreenElement === blok) document.exitFullscreen();
    blok.classList.remove("kaart-vol", "kaart-vol-css");
    c.classList.remove("kaart-vol-kaart");
  }
  map._kaartVol = aan;
  const knop = c.querySelector(".kaart-vergroot a");
  if (knop) {
    knop.textContent = aan ? "×" : "⤢";
    knop.title = aan ? "Verkleinen (Esc)" : "Kaart vergroten";
    knop.setAttribute("aria-label", knop.title);
  }
  /* Leaflet meet zijn container bij het aanmaken; na een maatwissel moet hij opnieuw meten,
     anders blijven de tegels in het oude kader staan. */
  setTimeout(() => map.invalidateSize(), 150);
}
if (typeof L !== "undefined") {
  const VergrootKnop = L.Control.extend({
    options: {position: "topleft"},
    onAdd(map) {
      const div = L.DomUtil.create("div", "leaflet-bar kaart-vergroot");
      const a = L.DomUtil.create("a", "", div);
      a.href = "#"; a.role = "button"; a.textContent = "⤢";
      a.title = "Kaart vergroten"; a.setAttribute("aria-label", a.title);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, "click", e => {
        L.DomEvent.preventDefault(e);
        kaartVolledig(map, !map._kaartVol);
      });
      /* Esc of de browserknop sluit de echte fullscreen buiten ons om: dan de klassen en de
         knop ook terugzetten. */
      document.addEventListener("fullscreenchange", () => {
        if (map._kaartVol && document.fullscreenElement !== kaartBlok(map)
            && !kaartBlok(map).classList.contains("kaart-vol-css")) kaartVolledig(map, false);
      });
      document.addEventListener("keydown", e => {
        if (e.key === "Escape" && map._kaartVol) kaartVolledig(map, false);
      });
      return div;
    },
  });
  L.Map.addInitHook(function () { this.addControl(new VergrootKnop()); });

  /* ---------- een kaart in een verborgen blok opent niet meer op zoom 19 (#131) ----------
     Drie keer dezelfde fout (lagenkaart #115, autobezit, parkeren): het blok staat nog op
     `hidden` als de kaart zich aan het gebied aanpast. De kaart is dan 0 × 0 px, fitBounds
     komt uit op de maximale zoom, en een losse invalidateSize() erna maakt hem niet opnieuw
     passend. Per blok repareren vergeet je bij het volgende blok; daarom hier, voor elke kaart:
     de laatste fitBounds onthouden, en zodra de container van nul naar een echte maat gaat
     opnieuw meten en opnieuw passend maken.

     En de zoom op de container (data-zoom), zodat de rooktest een kaart kan afkeuren die na
     het laden op zoom 18 of dieper staat — dat is een paar straten, geen gebied. */
  L.Map.addInitHook(function () {
    const map = this, c = map.getContainer();
    const fit = map.fitBounds;
    map.fitBounds = function (bounds, opties) {
      map._laatstePassing = [bounds, opties];
      return fit.call(map, bounds, opties);
    };
    const zetZoom = () => { c.dataset.zoom = String(map.getZoom()); };
    map.on("zoomend load viewreset", zetZoom);
    if (typeof ResizeObserver === "undefined") return;
    let wasLeeg = !c.clientWidth || !c.clientHeight;
    new ResizeObserver(() => {
      const leeg = !c.clientWidth || !c.clientHeight;
      if (wasLeeg && !leeg) {
        map.invalidateSize();
        if (map._laatstePassing) fit.call(map, ...map._laatstePassing);
        zetZoom();
      }
      wasLeeg = leeg;
    }).observe(c);
  });
}
/* ---------- #30: toetsen aan een norm ----------
   Kleuren op basis van een norm is interpretatie, en dit dashboard houdt interpretatie in het
   duidingsblok. Na overleg met de opdrachtgever geldt daarom: alleen een wettelijke of
   vastgestelde norm, nooit het gemeentegemiddelde — bij elke indicator ligt de helft van de
   gebieden daaronder, en dan kleurt de helft rood zonder dat er een opgave is.

   Daarom staat dit alleen bij luchtkwaliteit: dat is de enige indicator in dit dashboard met
   een harde grenswaarde. Op WOZ, inkomen en armoede komt geen norm; de registry legt uit
   waarom. Geluid volgt met #19.

   Geen kleur alleen: bij de markering staat altijd de norm, het soort en het peiljaar in
   tekst. Rood/groen zonder woorden sluit kleurenblinde lezers uit, en een kleur zonder norm
   is een oordeel zonder onderbouwing. */
function normtoets(sleutel, waarde) {
  const normen = (typeof GEBIEDEN !== "undefined" && GEBIEDEN.normen) || {};
  const lijst = normen[sleutel];
  if (!lijst || !lijst.length || typeof waarde !== "number" || !isFinite(waarde)) return "";
  const regels = lijst.map(n => {
    const over = n.richting === "boven" ? waarde > n.waarde : waarde < n.waarde;
    /* Woorden vóór de kleur, en het teken erbij: "boven" en "onder" staan er letterlijk. */
    const kleur = over ? "var(--rood)" : "var(--polder)";
    const teken = over ? "boven" : "onder";
    const soort = n.soort === "wettelijk" ? "wettelijke grenswaarde" : "advieswaarde";
    return `<span style="color:${kleur};font-weight:700">${over ? "▲" : "▼"} ${teken}</span>` +
      ` de ${soort} van ${n.waarde.toLocaleString("nl-NL")} ${n.eenheid}` +
      `<span style="color:#7a7a6c"> (${n.naam}, ${n.bron}, ${n.peiljaar})</span>`;
  });
  return "<br>" + regels.join("<br>");
}

function pctTip(unit){ return {callbacks:{label:c=>` ${c.parsed.y ?? c.parsed.x ?? c.parsed}${unit}`}}; }

/* gedeeld over blokken heen */
let chBuurtObj=null, toonIndicator=null, updateKaart=null, initKaart=null, wijkLijn=null,
    bereikKappen=null;
let kaart=null, buurtLaag=null, wmsLaag=null, laatsteKey="inkomen";
/* De gevonden PDOK-jaargang van de CBS 100 m-laag, gedeeld met de lagenkaart (#115). Die las
   `wmsJaar`, maar dat staat met let binnen veilig("kaart") en is daarbuiten niet zichtbaar:
   typeof gaf altijd "undefined", en de laag meldde altijd "jaargang nog niet gevonden".
   {jaar, url(stijl)} zodra de zoektocht klaar is; null zolang hij loopt of mislukt. */
let cbsWms = null;

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
  /* Sinds de indicatorregistry komen álle zes buurtindicatoren uit profiel.js, met dezelfde
     vorm en hetzelfde peiljaar. Wat hier overblijft is de nabijheidsgrafiek, die nog uit
     CBSMOB komt, en een terugval voor de gemeentereferentie bij oudere databestanden. */
  if (typeof CBSMOB === "undefined") return;
  const n = CBSMOB.nabijheid;
  const nabijGebied = (n.gebied !== undefined ? n.gebied : null) || {};
  if (Object.keys(nabijGebied).length) {
    D.nabijheid = {
      labels:["Basisschool","Kinderdagverblijf","Grote supermarkt","Huisartsenpraktijk","Treinstation"],
      values:[nabijGebied.basisschool, nabijGebied.kinderopvang, nabijGebied.supermarkt,
              nabijGebied.huisarts, nabijGebied.trein],
      /* De verantwoording moet mee: deze override verving een blok dat wél `aggregatie`
         droeg, waardoor het cijfer zich als gepubliceerd voordeed terwijl het bij de
         gemeente op 3 onderdrukte wijken rust. Voorkeur voor de CBSMOB-variant, want die
         hoort bij de waarden die we hier neerzetten. */
      aggregatie: n.aggregatie || (D.nabijheid && D.nabijheid.aggregatie) || null,
      peiljaar: n.peildatum || (D.nabijheid && D.nabijheid.peiljaar)
    };
  }
  /* Terugval voor databestanden van vóór de registry, waarin de gemeentereferentie nog
     alleen in CBSMOB stond. Nieuwe bestanden dragen hem per indicator zelf. */
  if (CBSMOB.rdamReferentie) {
    Object.entries(CBSMOB.rdamReferentie.waarden).forEach(([k, v]) => {
      if (D.buurtVergelijk.indicatoren[k] && v != null)
        D.buurtVergelijk.indicatoren[k].rdam ??= v;
    });
  }
});

veilig("gebiedsselectie", () => {
/* ---------- meelopende gebiedskiezer (data/index.js) ----------
   Wisselen herlaadt de pagina met een nieuwe hash: de databestanden definiëren globale
   consts en die zijn niet te overschrijven, dus half bijwerken zou een mengsel van twee
   gebieden opleveren. Alleen gebouwde gebieden staan in de lijst. */
if (typeof GEBIEDEN === "undefined") return;
/* Zonder gebouwd.js (verse clone, of het bestand is gitignored en niet gebouwd) tonen
   we de hele boom: laden mag mislukken, veilig() vangt dat op. Beter een keuze die
   404 geeft dan een kiezer die doet alsof er maar één gebied bestaat. */
const gebouwd = typeof GEBOUWD !== "undefined" ? GEBOUWD : null;
const heeft = c => !gebouwd || !!gebouwd[c];
const naamVan = {};
(GEBIEDEN.rayons || []).forEach(r => {
  naamVan[r.code] = r.naam;
  (r.gebieden || []).forEach(g => { naamVan[g.code] = g.naam; });
});
(GEBIEDEN.buitenGebiedsindeling?.gebieden || []).forEach(g => { naamVan[g.code] = g.naam; });
if (GEBIEDEN.gemeente) naamVan[GEBIEDEN.gemeente.code] = GEBIEDEN.gemeente.naam;

/* groepeer op niveau, zodat de lijst leesbaar blijft als er straks 19 gebieden staan */
const groepen = [
  ["Gemeente", [GEBIEDEN.gemeente?.code].filter(c => c && heeft(c))],
  ["Rayon", (GEBIEDEN.rayons || []).map(r => r.code).filter(heeft)],
  ["Gebied / wijk", (GEBIEDEN.rayons || [])
    .flatMap(r => (r.gebieden || []).map(g => g.code)).filter(heeft)],
];
const totaal = groepen.reduce((n, [, codes]) => n + codes.length, 0);

const balk = document.createElement("div");
balk.className = "gebiedsbalk";
balk.innerHTML =
  '<label for="gebiedKeuze">Gebied</label>' +
  '<select id="gebiedKeuze"></select>' +
  `<span class="niveaubadge">${GEBIEDNIVEAU}</span>` +
  /* De referentiekeuze hoort bij elke sectie, dus in de balk die meescrollt (#7). Leeg als
     er geen referentiegebieden zijn; bouwRefKeuze() haalt hem dan weg. */
  '<span class="refkeuze" data-refkeuze data-refcompact></span>' +
  (totaal > 1 ? "" : '<span class="hint">alleen dit gebied is gebouwd — ' +
    "<code>uv run scripts/bouw_data.py --alle-gebieden</code></span>");
document.body.insertBefore(balk, document.body.firstChild);

const sel = balk.querySelector("#gebiedKeuze");
groepen.forEach(([kop, codes]) => {
  if (!codes.length) return;
  const g = document.createElement("optgroup");
  g.label = kop;
  codes.forEach(code => {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = naamVan[code] || code;
    o.selected = code === GEBIEDCODE;
    g.appendChild(o);
  });
  sel.appendChild(g);
});
/* huidig gebied ontbreekt in de lijst (bijv. handmatig gebouwd): toch tonen */
if (!sel.value && GEBIEDCODE) {
  const o = document.createElement("option");
  o.value = GEBIEDCODE; o.textContent = GEBIEDNAAM; o.selected = true;
  sel.insertBefore(o, sel.firstChild);
}
sel.addEventListener("change", () => {
  location.hash = `gebied=${sel.value}`;
  location.reload();
});
});

veilig("hero", () => {
/* ---------- hero: naam en kerncijfers uit de data, niet uit de HTML ---------- */
const titel = document.getElementById("heroTitel");
if (titel) {
  /* eerste helft van de naam normaal, tweede helft in contour — het bestaande
     signatuurelement, nu op een willekeurige gebiedsnaam */
  const naam = GEBIEDNAAM;
  const knip = naam.includes(" ") ? naam.indexOf(" ") + 1 : Math.floor(naam.length / 2);
  titel.innerHTML =
    naam.slice(0, knip) + `<span class="accent">${naam.slice(knip)}</span>`;
  document.title = `${naam} — gebiedsprofiel in cijfers`;
}
const eyebrow = document.getElementById("heroEyebrow");
if (eyebrow) eyebrow.textContent =
  `Gebiedsprofiel · ${GEMEENTENAAM} · ${GEBIEDNIVEAU} · mobiliteit`;

const lead = document.getElementById("heroLead");
if (lead) {
  const wijken = (typeof GEO !== "undefined" && GEO.wijkcodes) ? GEO.wijkcodes.length : 0;
  const buurten = (typeof GEO !== "undefined" && GEO.features) ? GEO.features.length : 0;
  lead.innerHTML = TEKST.lead || (
    `${GEBIEDNAAM} is in dit dashboard afgebakend als ${GEBIEDNIVEAU}` +
    (wijken > 1 ? ` van ${wijken} CBS-wijken` : "") +
    (buurten ? ` met ${buurten} buurten` : "") +
    `. Dit profiel beschrijft wie er wonen, hoe ze wonen en wat dat betekent voor ` +
    `mobiliteit. Er is voor dit gebied nog geen redactionele karakterschets ` +
    `(zie <code>js/teksten.js</code>).`);
}

const strip = document.getElementById("heroStrip");
if (!strip || typeof PROFIEL === "undefined") return;
const k = PROFIEL.kerncijfers || {};
const groei = PROFIEL.groei || {labels: [], values: []};
const cellen = [];
const cel = (num, lbl, src, sleutel) =>
  cellen.push(tegelHtml(num, lbl, src, `kerncijfers/${sleutel}`));

if (k.inwoners != null)
  cel(getalNL(k.inwoners), `inwoners`, `CBS KWB ${k.peiljaar ?? ""}`, "inwoners");
if (groei.values.length > 1) {
  const eerste = groei.values[0], laatst = groei.values.at(-1);
  const pct = Math.round(100 * (laatst / eerste - 1));
  cel(`${pct >= 0 ? "+" : ""}${pct}%`,
    `bevolkingsgroei ${groei.labels[0]}–${groei.labels.at(-1)}`, "CBS KWB", "groei");
}
if (k.oppervlakteLandKm2 != null)
  cel(`${k.oppervlakteLandKm2.toLocaleString("nl-NL")} km²`, "landoppervlak", "CBS/PDOK",
      "landoppervlak");
if (k.huishoudens != null)
  cel(getalNL(k.huishoudens), "huishoudens", `CBS KWB ${k.peiljaar ?? ""}`, "huishoudens");
const trein = (typeof CBSMOB !== "undefined" && CBSMOB.nabijheid && CBSMOB.nabijheid.gebied)
  ? CBSMOB.nabijheid.gebied.trein : null;
if (trein != null)
  cel(`${trein.toLocaleString("nl-NL")} km`, "gem. afstand tot treinstation", "CBS nabijheid",
      "afstand-trein");
/* Zelfvoorzienendheid hoort bij de kerncijfers, niet als bijschrift onder een kaart in
   sectie 07 (#49). Voor een rayon is dit het cijfer dat zegt of het gebied zijn eigen
   verplaatsingen bevat — een beleidsvraag, geen mobiliteitsdetail. */
const zelfDeel = (typeof ODINW !== "undefined" && !ODINW.leeg && ODINW.bestemmingen)
  ? (ODINW.bestemmingen.delen.binnenWijk || {}) : {};
/* ODiN-drempel geldt ook voor een herotegel — juist daar, want die wordt het meest gelezen. */
const zelf = (zelfDeel.n != null && zelfDeel.n < ((ODINW.drempel && ODINW.drempel.nMin) || 20))
  ? null : zelfDeel.share ?? null;
if (zelf != null)
  cel(`${zelf.toLocaleString("nl-NL")}%`, "verplaatsingen blijven binnen het gebied",
      "ODiN (steekproef)", "zelfvoorzienendheid");
/* Bij een gebied van meerdere wijken is een gemiddelde een rekenkundig artefact: de
   WOZ-waarde van dit rayon is 404 terwijl de buurten van 250 tot 779 lopen. Daarom bij
   meerdere wijken de spreiding erbij, en niet alleen het middelpunt. */
const woz = D.buurtVergelijk?.indicatoren?.woz;
const wozBuurten = (woz?.values || []).filter(v => typeof v === "number");
if (woz && woz.wijk != null) {
  const meer = GEBIEDNIVEAU !== "wijk" && wozBuurten.length > 1
    ? ` (buurten € ${Math.round(Math.min(...wozBuurten))}k–${Math.round(Math.max(...wozBuurten))}k)`
    : "";
  cel(`€ ${Math.round(woz.wijk)}k`, "gemiddelde WOZ-waarde" + meer,
    `CBS KWB ${woz.peiljaar ?? ""}`, "woz");
}
/* Geen enkele tegel: een gebied zonder inwoners, huishoudens of woningen — de haven-,
   bedrijven- en watergebieden. CBS publiceert daar niets, en dat hoort er te staan in plaats
   van een lege strook (#38). */
strip.innerHTML = cellen.length
  ? cellen.join("")
  : tegelHtml("—", "CBS publiceert voor dit gebied geen kerncijfers; het heeft geen of " +
      "vrijwel geen inwoners", `CBS KWB ${k.peiljaar ?? ""}`, "kerncijfers/leeg");
});

veilig("overzichtskaart", () => {
/* ---------- #111: waar ligt het gebied en wat zit erin? ----------
   Review Kevin: "Goed om ook een kaart te laten zien van het gebied dat geselecteerd is, met
   inzicht in de gebieden/buurten erin en wat de grenzen daar zijn. Handig als de naam van de
   buurten op de kaart te zien is zonder erop te klikken." De eerste kaart stond pas in sectie
   02, als datakaart, en daar zie je een naam alleen na een klik.

   Dit is een oriëntatiekaart, geen datakaart: de vlakken krijgen een neutrale kleur per
   eenheid (gebied bij een rayon, rayon bij de gemeente), geen kleur die iets meet (#30).

   Een aparte gebiedsgrens staat niet in geo.js. De buurtcode draagt de wijk
   (BU0599·04·51 hoort bij WK0599·04), dus de indeling is af te leiden; de grens tussen twee
   gebieden is de rand waar de kleur wisselt. Een echte samengevoegde grens is een
   pipelinewijziging en een vervolgstap. */
if (typeof GEO === "undefined" || typeof L === "undefined" || !GEO.features?.length) return;
const box = document.getElementById("overzichtBox");
if (!box) return;

const wijkVan = code => "WK" + code.slice(2, 8);
const rayons = typeof GEBIEDEN !== "undefined" ? GEBIEDEN.rayons || [] : [];
const naamVan = {}, rayonVan = {};
rayons.forEach(r => (r.gebieden || []).forEach(g => { naamVan[g.code] = g.naam; rayonVan[g.code] = r; }));
(typeof GEBIEDEN !== "undefined" ? GEBIEDEN.buitenGebiedsindeling?.gebieden || [] : [])
  .forEach(g => { naamVan[g.code] = g.naam; });

/* Waarop kleuren we? Bij een wijk is er één eenheid; dan zegt kleur niets en blijft alles
   hetzelfde. Bij een rayon de gebieden; bij de gemeente de rayons, met de haven- en
   bedrijvengebieden apart, want die horen bij geen rayon. */
const eenheidVan = f => {
  const w = wijkVan(f.properties.code);
  if (GEBIEDNIVEAU === "gemeente") return rayonVan[w] ? rayonVan[w].naam : "buiten de rayonindeling";
  return naamVan[w] || w;
};
const PALET = ["#C9D6C1", "#D9CBB0", "#C3CFDA", "#D8C4CF", "#CFCFB8", "#BFD3D0"];
const eenheden = [...new Set(GEO.features.map(eenheidVan))];
const kleurVan = e => e === "buiten de rayonindeling" ? "#E3E1D4"
  : PALET[eenheden.filter(x => x !== "buiten de rayonindeling").indexOf(e) % PALET.length];

/* Eerst zichtbaar, dan de kaart: Leaflet meet zijn container bij het aanmaken, en een
   verborgen blok meet nul. */
box.hidden = false;
/* zoomSnap in kwarten: met hele zoomstappen past een rayon net niet op niveau 12 en valt hij
   terug naar 11, en dan is het gebied een postzegel in een leeg kader. */
const k = L.map("kaartOverzicht", {scrollWheelZoom: false, zoomSnap: .25});
basiskaart().addTo(k);
const laag = L.geoJSON({type: "FeatureCollection", features: GEO.features}, {
  style: f => ({color: ASFALT, weight: 1, fillColor: kleurVan(eenheidVan(f)), fillOpacity: .6}),
  onEachFeature: (f, l) => l.bindPopup(`<b>${f.properties.naam}</b><br>` +
    `${naamVan[wijkVan(f.properties.code)] || ""}` +
    (f.properties.inwoners != null
      ? `<br>${f.properties.inwoners.toLocaleString("nl-NL")} inwoners` : "")),
}).addTo(k);
k.fitBounds(laag.getBounds(), {padding: [10, 10]});

/* Buurtnamen altijd bij een wijk of rayon (6 à 19 labels). Bij de gemeente zijn het er 92:
   dan eerst de gebiedsnamen, en de buurtnamen pas vanaf een zoomniveau waarop ze uit elkaar
   liggen. Een label staat op de centroïde uit geo.js, dezelfde als elders in het dashboard. */
const buurtTips = GEO.features
  .filter(f => Array.isArray(f.properties.centroid))
  .map(f => Object.assign(L.tooltip({permanent: true, direction: "center",
                                     className: "kaartlabel", interactive: false})
    .setLatLng(f.properties.centroid).setContent(f.properties.naam),
    {_prio: f.properties.inwoners || 0}));
const buurtLabels = L.layerGroup(buurtTips);
const perGebied = {};
GEO.features.forEach(f => {
  const w = wijkVan(f.properties.code), c = f.properties.centroid;
  if (!Array.isArray(c)) return;
  (perGebied[w] = perGebied[w] || []).push([c, f.properties.inwoners || 1]);
});
/* Gebiedslabel op het inwonersgewogen midden van zijn buurten: bij een gebied met een lege
   polder aan de rand valt de naam dan in het bewoonde deel, waar de lezer hem zoekt. */
/* Bij de gemeente alleen de veertien gebieden uit de rayonindeling: de haven- en
   bedrijvengebieden liggen midden tussen de woongebieden en hun namen dekten die af. Ze staan
   wel in de legenda en in de popup. */
const gebiedTips = Object.entries(perGebied)
  .filter(([w]) => naamVan[w] && (GEBIEDNIVEAU !== "gemeente" || rayonVan[w]))
  .map(([w, punten]) => {
    const tot = punten.reduce((s, [, n]) => s + n, 0);
    const lat = punten.reduce((s, [c, n]) => s + c[0] * n, 0) / tot;
    const lon = punten.reduce((s, [c, n]) => s + c[1] * n, 0) / tot;
    return Object.assign(L.tooltip({permanent: true, direction: "center",
                                    className: "kaartlabel gebied", interactive: false})
      .setLatLng([lat, lon]).setContent(naamVan[w]), {_prio: 1e9 + tot});
  });
const gebiedLabels = L.layerGroup(gebiedTips);
/* Leaflet kent geen botsingsdetectie voor labels. Zonder dat liepen bij een rayon de namen
   van kleine buurten door elkaar. Daarom na elke zoom: in volgorde van belang (gebieden voor
   buurten, grote buurten voor kleine) tonen, en een label dat een al getoond label raakt
   verbergen. Wat verborgen is, komt terug bij verder inzoomen. */
const ontwar = () => {
  const getoond = [];
  [...gebiedTips, ...buurtTips]
    .filter(t => k.hasLayer(t) || (t._map && t.getElement()))
    .sort((a, b) => b._prio - a._prio)
    .forEach(t => {
      const el = t.getElement();
      if (!el) return;
      el.style.visibility = "visible";
      const r = el.getBoundingClientRect();
      const raakt = getoond.some(o => r.left < o.right && r.right > o.left &&
                                      r.top < o.bottom && r.bottom > o.top);
      if (raakt) el.style.visibility = "hidden"; else getoond.push(r);
    });
};
const veelBuurten = GEO.features.length > 30;
const labelsBijwerken = () => {
  const z = k.getZoom();
  const buurtAan = !veelBuurten || z >= 13;
  /* Bij een rayon staan de gebieden al in de legenda en als kleur; hun namen over de
     buurtnamen heen maakten die onleesbaar. Pas uitgezoomd (onder 11) nemen ze het over. */
  const gebiedAan = GEBIEDNIVEAU === "gemeente" ? z < 13
    : GEBIEDNIVEAU === "rayon" ? z < 11 : false;
  if (buurtAan) buurtLabels.addTo(k); else k.removeLayer(buurtLabels);
  if (gebiedAan) gebiedLabels.addTo(k); else k.removeLayer(gebiedLabels);
  requestAnimationFrame(ontwar);
};
k.on("zoomend", labelsBijwerken);
labelsBijwerken();

const legenda = eenheden.length > 1
  ? " " + eenheden.map(e => `<span style="display:inline-block;width:12px;height:12px;` +
      `background:${kleurVan(e)};border:1px solid ${ASFALT};vertical-align:-2px"></span> ${e}`)
      .join(" &nbsp; ")
  : "";
document.getElementById("overzichtSub").innerHTML =
  `${GEO.features.length} buurt${GEO.features.length === 1 ? "" : "en"} in ${GEBIEDNAAM}` +
  (GEBIEDNIVEAU === "gemeente"
    ? `, gekleurd per rayon.${veelBuurten ? " Zoom in voor de buurtnamen." : ""}`
    : GEBIEDNIVEAU === "rayon" ? ", gekleurd per gebied." : ".") +
  (legenda ? `<br>${legenda}` : "");
document.getElementById("overzichtFoot").textContent =
  `Buurtgrenzen: ${GEO.bron}. Kleur geeft alleen de indeling aan, geen waarde. Klik op een ` +
  "buurt voor naam en inwonertal.";
});

veilig("sectieteksten", () => {
/* ---------- kopjes en intro's: redactioneel waar beschikbaar, anders neutraal ---------- */
const zet = (id, waarde) => {
  const el = document.getElementById(id);
  if (el && waarde) el.innerHTML = waarde;
};
const buurten = (typeof GEO !== "undefined" && GEO.features) ? GEO.features.length : 0;
/* Bij een rayon en de gemeente opent de sectie met de gebieden (#135), dus de kop ook. */
const gebiedenAantal = (typeof GEO !== "undefined" && GEO.features)
  ? new Set(GEO.features.map(f => String(f.properties.code).slice(2, 8))).size : 0;
const perGebied = (GEBIEDNIVEAU === "rayon" || GEBIEDNIVEAU === "gemeente") && gebiedenAantal > 1;
zet("gebiedKop", TEKST.gebiedKop || (perGebied
  ? `${gebiedenAantal} gebieden, ${buurten} buurten`
  : buurten ? `${buurten} buurten` : "Het gebied"));
zet("gebiedIntro", TEKST.gebiedIntro || (perGebied
  ? `${GEBIEDNAAM} bestaat uit ${gebiedenAantal} gebieden. Klik op een gebied voor een kort ` +
    "overzicht en zijn buurten, of ga door naar de gebiedspagina."
  : `Alle ${buurten} buurten binnen ${GEBIEDNAAM}, met de cijfers per buurt. ` +
    "Klik op een buurt voor de details."));
const groei = (typeof PROFIEL !== "undefined" && PROFIEL.groei) || null;
zet("bevolkingKop", TEKST.bevolkingKop || "Bevolkingsontwikkeling");
zet("bevolkingIntro", TEKST.bevolkingIntro || (groei && groei.values.length > 1
  ? `${GEBIEDNAAM} ging van ${getalNL(groei.values[0])} inwoners in ${groei.labels[0]} ` +
    `naar ${getalNL(groei.values.at(-1))} in ${groei.labels.at(-1)}.`
  : ""));
zet("sociaalKop", TEKST.sociaalKop || "Inkomen en opleiding");
/* "Eén gemiddelde bestaat niet" is bij een rayon nóg waarder dan bij een wijk: de spreiding
   tussen de 19 buurten is groter dan die tussen wijk en stad. Kop volgt het niveau. */
zet("vergelijkKop", `Eén ${GEBIEDNIVEAU}gemiddelde bestaat niet`);
zet("voorzKop", `Voorzieningen in ${GEBIEDNAAM}`);
zet("wonenKop", TEKST.wonenKop || "Woningvoorraad");
zet("sociaalIntro", TEKST.sociaalIntro || "");
zet("leeftijdSub", `Aandeel inwoners per leeftijdsklasse, ${GEBIEDNAAM}.`);
const hh = (typeof PROFIEL !== "undefined" && PROFIEL.kerncijfers) || {};
zet("huishSub", (hh.huishoudens != null ? `${getalNL(hh.huishoudens)} huishoudens, ` : "") +
  `${GEBIEDNAAM}.`);
zet("inkomenSub", `${GEBIEDNAAM} vergeleken met Nederland (× € 1.000 per jaar).`);

/* Duiding (sectie 09): uitsluitend redactioneel. Geen tekst voor dit gebied, dan zeggen we
   dat — niet de interpretatie van een ander gebied hergebruiken, want die staat vol met
   cijfers die hier niet gelden. */
const duidingEl = document.getElementById("duidingBlok");
if (duidingEl) {
  if (TEKST.duiding && TEKST.duiding.length) {
    duidingEl.innerHTML = "<h3>Interpretatie van de opsteller</h3><ul>" +
      TEKST.duiding.map(([kop, tekst]) => `<li><b>${kop}.</b> ${tekst}</li>`).join("") +
      "</ul>";
  } else {
    duidingEl.innerHTML =
      `<h3>Nog geen duiding voor ${GEBIEDNAAM}</h3>` +
      "<p>Alle cijfers hierboven gelden voor dit gebied, maar de interpretatie is nog niet " +
      "geschreven. Die hoort van een mens te komen: vastleggen in " +
      "<code>js/teksten.js</code> onder de gebiedcode. Bewust niet overgenomen van een " +
      "ander gebied — zulke duiding verwijst naar cijfers die hier niet gelden.</p>";
  }
}

/* Sectie 02: intro en spreidingstegels stonden hardgecodeerd op Overschie — met buurtnamen
   en cijfers, maar zonder het woord "Overschie", waardoor ze bij het onthardcoden buiten
   beeld bleven. Nu berekend uit de buurtvergelijking: welke buurt het hoogst en laagst
   scoort volgt uit de data en verandert dus mee per gebied en per jaargang. */
const uitersten = sleutel => {
  const i = D.buurtVergelijk?.indicatoren?.[sleutel];
  const namen = D.buurtVergelijk?.buurten || [];
  if (!i || !i.values) return null;
  const paren = i.values
    .map((v, idx) => ({v, naam: namen[idx]}))
    .filter(p => typeof p.v === "number");
  if (paren.length < 2) return null;
  const hoog = paren.reduce((a, b) => (b.v > a.v ? b : a));
  const laag = paren.reduce((a, b) => (b.v < a.v ? b : a));
  return laag.v > 0 ? {hoog, laag, factor: hoog.v / laag.v} : {hoog, laag, factor: null};
};

const vIntro = document.getElementById("vergelijkIntro");
if (vIntro) {
  const ink = uitersten("inkomen");
  const woz = uitersten("woz");
  const n = (D.buurtVergelijk?.buurten || []).length;
  const delen = [];
  if (ink && ink.factor)
    delen.push(`${ink.hoog.naam} verdient ${ink.factor.toFixed(1)}× zoveel per ` +
      `inkomensontvanger als ${ink.laag.naam}`);
  if (woz && woz.factor)
    delen.push(`de gemiddelde woningwaarde verschilt ${woz.factor.toFixed(1)}× tussen ` +
      `${woz.hoog.naam} en ${woz.laag.naam}`);
  vIntro.textContent = delen.length
    ? `Het ${GEBIEDNIVEAU}gemiddelde middelt ${n} buurten uit die ver uiteenlopen: ` +
      delen.join(", en ") + ". Kies een indicator om de spreiding te zien."
    : `De ${n} buurten van ${GEBIEDNAAM} naast elkaar. Kies een indicator.`;
}

const sStrip = document.getElementById("spreidingStrip");
if (sStrip) {
  const tegels = [];
  const tegel = (num, lbl, src, sleutel) =>
    tegels.push(tegelHtml(num, lbl, src, `spreiding/${sleutel}`));
  const bron = `CBS KWB ${D.buurtVergelijk?.indicatoren?.woz?.peiljaar ?? ""}`;
  const ink = uitersten("inkomen");
  if (ink && ink.factor)
    tegel(`${ink.factor.toFixed(1)}×`,
      `inkomensverschil hoogste vs. laagste buurt (${ink.hoog.naam} vs. ${ink.laag.naam})`,
      bron, "inkomen");
  const woz = uitersten("woz");
  if (woz && woz.factor)
    tegel(`${woz.factor.toFixed(1)}×`,
      `verschil in woningwaarde (${woz.hoog.naam} vs. ${woz.laag.naam})`, bron, "woz");
  const autos = uitersten("autos");
  if (autos)
    tegel(`${autos.hoog.v.toLocaleString("nl-NL")} vs ${autos.laag.v.toLocaleString("nl-NL")}`,
      `auto's per huishouden: ${autos.hoog.naam} vs. ${autos.laag.naam}`, bron, "autos");
  const arm = uitersten("armoede");
  if (arm)
    tegel(`${arm.hoog.v.toLocaleString("nl-NL")}% vs ${arm.laag.v.toLocaleString("nl-NL")}%`,
      `personen in armoede: ${arm.hoog.naam} vs. ${arm.laag.naam}`, bron, "armoede");
  /* Geen enkele tegel: te weinig buurten met gepubliceerde waarden om een uiterste te
     bepalen — dat gebeurt bij een klein of onbewoond gebied. Dan hoort er te staan dat er
     niets te vergelijken valt, niet een lege strook. */
  sStrip.innerHTML = tegels.length
    ? tegels.join("")
    : tegelHtml("—", "te weinig buurten met gepubliceerde cijfers om spreiding te tonen",
        bron, "spreiding/leeg");
}

/* Sectie 05 Wonen: stond volledig hardgecodeerd op Overschie (8.924 woningen, € 364.000).
   Voor een rayon was dat gewoon onjuist — en het sprak de hero op dezelfde pagina tegen.
   Wat CBS levert komt nu uit de data; energielabels en gasverbruik hebben geen bron in deze
   pipeline en staan als expliciet gat, niet als een cijfer van een ander gebied. */
const wonenStrip = document.getElementById("wonenStrip");
if (wonenStrip) {
  const k = (typeof PROFIEL !== "undefined" && PROFIEL.kerncijfers) || {};
  const woz = D.buurtVergelijk?.indicatoren?.woz;
  const wozWaarden = (woz?.values || []).filter(v => typeof v === "number");
  const cellen = [];
  const cel = (num, lbl, src, sleutel, gepland) => cellen.push(
    tegelHtml(num, lbl, src, `wonen-kerncijfers/${sleutel}`,
      gepland ? "opacity:.55" : null));

  if (k.woningen != null)
    cel(getalNL(k.woningen), "woningen", `CBS KWB ${k.peiljaar ?? ""}`, "woningen");
  if (woz && woz.wijk != null)
    cel(`€ ${Math.round(woz.wijk)}k`, "gemiddelde WOZ-waarde", `CBS KWB ${woz.peiljaar ?? ""}`,
      "woz");
  /* Spreiding is bij een rayon belangrijker dan het gemiddelde: zie de intro hieronder. */
  if (wozWaarden.length > 1) {
    const min = Math.min(...wozWaarden), max = Math.max(...wozWaarden);
    cel(`€ ${Math.round(min)}k–${Math.round(max)}k`, "WOZ-spreiding tussen buurten",
      `CBS KWB ${woz.peiljaar ?? ""}`, "woz-spreiding");
  }
  cel("—", "energielabels", "geen bron in deze pipeline (RVO)", "energielabels", true);
  cel("—", "gasverbruik per woning", "geen bron in deze pipeline (CBS/netbeheer)",
    "gasverbruik", true);
  wonenStrip.innerHTML = cellen.join("");

  const intro = document.getElementById("wonenIntro");
  if (intro) {
    const factor = wozWaarden.length > 1
      ? (Math.max(...wozWaarden) / Math.min(...wozWaarden)).toFixed(1) : null;
    intro.innerHTML = (k.woningen != null
      ? `${getalNL(k.woningen)} woningen in ${GEBIEDNAAM}` +
        (woz && woz.wijk != null ? `, gemiddelde WOZ-waarde € ${Math.round(woz.wijk)}.000` : "")
      : `Woningvoorraad van ${GEBIEDNAAM}`) +
      (factor && factor > 1.5
        ? `. Dat gemiddelde dekt een spreiding van ${factor}× tussen de buurten — bij een ` +
          `${GEBIEDNIVEAU} zegt de spreiding meer dan het gemiddelde.`
        : ".");
  }
  const foot = document.getElementById("wonenFoot");
  if (foot) foot.textContent =
    "Woningvoorraad en WOZ-waarde uit CBS Kerncijfers wijken en buurten. Energielabels " +
    "(RVO) en gasverbruik (CBS/netbeheer) zijn nog niet als bron opgenomen; de tegels " +
    "staan er als expliciet gat in plaats van met cijfers van een ander gebied.";
}

/* Sectie 06-intro: was een zin over metrostation Meijersplein en Park Zestienhoven. De
   feitelijke inhoud zit in de data — nabijheidscijfers en de haltelijst uit GTFS — dus die
   wordt hier opgebouwd in plaats van per gebied opnieuw geschreven. */
const mIntro = document.getElementById("mobiliteitIntro");
if (mIntro) {
  const nab = (typeof CBSMOB !== "undefined" && CBSMOB.nabijheid && CBSMOB.nabijheid.gebied)
    || {};
  const delen = [];
  if (nab.supermarkt != null && nab.huisarts != null) {
    const dagelijks = Math.max(nab.supermarkt, nab.huisarts);
    delen.push(`dagelijkse voorzieningen liggen gemiddeld binnen ${dagelijks.toLocaleString("nl-NL")} km van ` +
      "het woonadres");
  }
  if (nab.trein != null) delen.push(`het dichtstbijzijnde treinstation op ${nab.trein.toLocaleString("nl-NL")} km`);
  /* railstations binnen versus net buiten het gebied: uit GTFS, niet uit een aanname */
  if (typeof OV !== "undefined") {
    const railBinnen = (OV.haltes || []).filter(h => h.binnen &&
      (h.lijnen || []).some(nr => ["metro", "trein"].includes((OV.lijnen || [])
        .find(l => l.lijn === nr)?.soort)));
    const nabij = Object.entries(OV.stationsNabijM || {})
      .sort((a, b) => a[1] - b[1]).slice(0, 2)
      .map(([n, m]) => `${n} (±${getalNL(m)} m buiten de grens)`);
    if (railBinnen.length) {
      delen.push(`${railBinnen.length} trein- of metrohalte(s) binnen de grens`);
    } else if (nabij.length) {
      delen.push(`binnen de grens ligt geen trein- of metrostation; het dichtstbij zijn ` +
        nabij.join(" en "));
    }
  }
  /* Geen enkel deel te melden — dat komt voor bij een gebied waarvoor de OV- en
     nabijheidsstappen niet gebouwd zijn. Dan het element weghalen in plaats van een lege
     alinea laten staan: een lege alinea leest als "hier stond iets en het is stuk". */
  if (delen.length) {
    mIntro.textContent = delen.join("; ").replace(/^./, c => c.toUpperCase()) + ".";
  } else {
    mIntro.remove();
  }
}

/* Barrièreparagraaf: welke snelwegen, en de gemeten gevolgen. Stond als vaste zin over de
   A13 en Kleinpolder in de HTML. */
const bIntro = document.getElementById("barriereIntro");
if (bIntro) {
  const refs = (typeof INFRA !== "undefined" && INFRA.barriereRefs) || [];
  const lijst = refs.length === 1 ? refs[0]
    : refs.length ? refs.slice(0, -1).join(", ") + " en " + refs.at(-1) : "";
  bIntro.textContent = (lijst
    ? `${lijst} doorsnijden of begrenzen ${GEBIEDNAAM}. `
    : `Voor ${GEBIEDNAAM} zijn geen snelwegen als barrière gevonden. `) +
    "Onderstaande cijfers zijn berekend op het OpenStreetMap-netwerk.";
}

/* Ligging: welke snelwegen het gebied doorsnijden komt uit de OSM-analyse (INFRA), niet uit
   een handgeschreven zin over de A13. */
const ligging = document.getElementById("liggingKnel");
if (ligging) {
  const refs = (typeof INFRA !== "undefined" && INFRA.barriereRefs) || [];
  if (TEKST.ligging) {
    ligging.innerHTML = `<b>Ligging:</b> ${TEKST.ligging}`;
  } else if (refs.length) {
    const lijst = refs.length === 1 ? refs[0]
      : refs.slice(0, -1).join(", ") + " en " + refs.at(-1);
    ligging.innerHTML = `<b>Ligging:</b> ${GEBIEDNAAM} wordt doorsneden of begrensd door ` +
      `${lijst}. Kruisingen en omrijfactoren staan in sectie 06.`;
  } else {
    ligging.remove();
  }
}

/* Spreiding tussen buurten: berekend uit de buurtvergelijking, niet ingetypt. Zo klopt het
   voor elk gebied en verouderd het niet bij een nieuwe jaargang. */
const spreiding = document.getElementById("spreidingKnel");
if (spreiding) {
  const ind = D.buurtVergelijk?.indicatoren || {};
  const stukken = [];
  const beschrijf = (sleutel, tekst, opmaak, eenheid = "") => {
    const i = ind[sleutel];
    if (!i || !i.values) return;
    const g = i.values.filter(v => typeof v === "number");
    if (g.length < 2) return;
    const min = Math.min(...g), max = Math.max(...g);
    if (min === max) return;
    stukken.push(`${tekst} van ${opmaak(min)} tot ${opmaak(max)}${eenheid}`);
  };
  const nl = v => v.toLocaleString("nl-NL");
  beschrijf("inkomen", "loopt het inkomen per ontvanger uiteen",
    v => "€ " + Math.round(v * 1000).toLocaleString("nl-NL"));
  beschrijf("autos", "het autobezit", nl, " auto per huishouden");
  beschrijf("armoede", "het aandeel personen in armoede", nl, "%");
  if (stukken.length) {
    spreiding.innerHTML =
      `<b>Wat het ${GEBIEDNIVEAU}gemiddelde niet laat zien:</b> tussen de buurten ` +
      stukken.join(", ") + `. Elk cijfer dat op ${GEBIEDNIVEAU}niveau wordt gerapporteerd, ` +
      "middelt deze spreiding uit.";
  } else {
    spreiding.remove();
  }
}

/* Aggregatieniveau-badges en kopjes zeiden "wijk", ook bij een rayon of de gemeente. De
   badge hoort te zeggen op welk niveau het cijfer gemeten is, dus die volgt het gebied. */
document.querySelectorAll(".status.niveau").forEach(el => {
  const t = el.textContent;
  if (/\bwijk\b/.test(t)) el.textContent = t.replace(/\bwijk\b/g, GEBIEDNIVEAU);
});
document.querySelectorAll("h4, h3").forEach(el => {
  if (el.children.length === 0 && /\bde wijk\b/.test(el.textContent)) {
    el.textContent = el.textContent.replace(/\bde wijk\b/g, "het gebied");
  } else {
    /* koppen met een badge erin: alleen de eigen tekstknopen aanpassen */
    el.childNodes.forEach(n => {
      if (n.nodeType === 3 && /\bde wijk\b/.test(n.nodeValue)) {
        n.nodeValue = n.nodeValue.replace(/\bde wijk\b/g, "het gebied");
      }
    });
  }
});

/* ---------- signatuurbordjes per sectie (#51) ----------
   Dit waren hectometerbordjes: "A13 · 1,8". Twee problemen, en het tweede is het ernstigste.

   Vorm: een reeks hectometerstanden suggereert een lineaire reis langs één weg. Voor Overschie
   klopt dat — de A13 loopt er dwars door en is de bepalende barrière. Voor Noord buiten de Ring
   niet: dat wordt door drie snelwegen begrensd en door geen enkele gestructureerd.

   Inhoud: die kilometerstanden waren **verzonnen**. 0,0 · 1,0 · 1,8 · 2,4 stonden als vaste
   HTML in de pagina en hoorden bij Overschie; ze zijn nooit gemeten. In een dashboard dat als
   uitgangspunt heeft dat bij elk cijfer een bron en een peiljaar staat, is een decoratief
   getal dat eruitziet als een meting het verkeerde soort ornament.

   Gekozen: de vorm houden, de bewering laten vallen. Het bordje toont het sectienummer — dat
   is een feit.

   Ik had een uitzondering ingebouwd voor een gebied met precies één structurerende snelweg,
   want daar zou het wegnummer wél kloppen. Die tak vuurt nergens: `INFRA.barriereRefs` geeft
   voor Overschie óók ["A13","A16","A20"], omdat de OSM-analyse doorsnijden en begrenzen niet
   onderscheidt. De signatuur was dus zelfs voor de wijk waarvoor hij bedoeld was niet door de
   data gedekt. Dode code die een gedrag suggereert dat niet voorkomt is erger dan geen code,
   dus de uitzondering is eruit. Wil je hem terug, dan moet `bouw_infra` eerst onderscheid
   maken tussen wegen die het gebied doorsnijden en wegen die het begrenzen. */
document.querySelectorAll(".hm").forEach(el => {
  /* Het nummer komt uit de eyebrow van de eigen sectie, niet uit een tweede lijst in de code:
     dan kan het niet uit de pas lopen als er een sectie bij komt of de volgorde wijzigt. */
  const nr = el.closest("section")?.querySelector(".eyebrow")
    ?.textContent.trim().match(/^\d+/)?.[0];
  if (!nr) { el.remove(); return; }   // de hero heeft geen sectienummer
  el.textContent = "SECTIE";
  const onder = document.createElement("span");
  onder.textContent = nr;
  el.appendChild(onder);
  el.title = `Sectie ${nr}`;
});
});


veilig("grafiek-groei", () => {
/* groei: lijn met alleen echte peilpunten */
/* Vergelijken kan hier niet in absolute aantallen: de gemeente telt 673.000 inwoners en een
   gebied 20.000, dus naast elkaar op één as wordt de gebiedslijn een streep onderaan. Zodra
   er een referentie aan staat schakelt de grafiek daarom naar een index — eerste peiljaar =
   100 — en dan gaat het over het enige dat vergelijkbaar is: het tempo. De as-titel en de
   tooltip zeggen welke van de twee je ziet; een index die eruitziet als een aantal is erger
   dan geen vergelijking. */
const jaar0 = D.groei.values.findIndex(v => typeof v === "number" && v > 0);
/* Indexeren op hetzelfde basisjaar als de eigen reeks, niet op het eigen eerste peiljaar:
   twee lijnen met een verschillend basisjaar zijn niet vergelijkbaar, ook al ziet het er
   vergelijkbaar uit. Heeft een referentiegebied dat jaar niet, dan valt de reeks weg — dat
   is zichtbaar, en beter dan een lijn op een andere schaal. */
const indexeer = reeks => {
  const basis = reeks[jaar0];
  if (typeof basis !== "number" || !basis) return reeks.map(() => null);
  return reeks.map(v => typeof v === "number" ? Math.round(1000 * v / basis) / 10 : null);
};
const eigen = {label:GEBIEDLABEL, data:D.groei.values, borderColor:ASFALT, backgroundColor:GEEL,
  pointRadius:6, pointBorderColor:ASFALT, pointBorderWidth:2, borderWidth:2.5,
  borderDash:[6,5], tension:0};
let geindexeerd = false;
const g = new Chart(chGroei, {type:"line",
  data:{labels:D.groei.labels, datasets:[eigen]},
  options:{maintainAspectRatio:false,
    plugins:{legend:{display:false, position:"bottom"},
    tooltip:{callbacks:{label:c=> geindexeerd
      ? ` ${c.dataset.label}: ${c.parsed.y.toLocaleString("nl-NL")} (${D.groei.labels[jaar0]} = 100)`
      : ` ${c.dataset.label}: ${c.parsed.y.toLocaleString("nl-NL")} inwoners`}}},
    scales:{y:{grid:gridOpt, ticks:{callback:v=>v.toLocaleString("nl-NL")}, suggestedMin:15000},
            x:{grid:{display:false}}}}});
bijRefWijziging("groei", () => {
  const ref = refReeksen("groei", D.groei.labels);
  geindexeerd = ref.length > 0 && jaar0 >= 0;
  g.data.datasets = [
    {...eigen, data: geindexeerd ? indexeer(D.groei.values) : D.groei.values},
    ...ref.map(r => refLijn(r, indexeer(r.waarden))),
  ];
  g.options.plugins.legend.display = geindexeerd;
  g.options.scales.y.suggestedMin = geindexeerd ? 95 : 15000;
  g.options.scales.y.title = geindexeerd
    ? {display:true, text:`index, ${D.groei.labels[jaar0]} = 100`}
    : {display:true, text:"inwoners"};
  g.update();
});
});

veilig("grafiek-leeftijd", () => {
/* leeftijd: horizontale balken */
/* Eén kleur voor de eigen reeks, en dat is GEEL zoals overal elders in het dashboard waar
   een gebied naast een referentie staat. De vijf wisselende klassekleuren waren decoratief —
   ze betekenden niets — maar zodra er een referentie naast staat betekenen ze wél iets
   verkeerds: één ervan was SCHIE, precies de kleur van de gemeentereferentie. Twee
   verschillende dingen in dezelfde kleur in dezelfde grafiek. */
const eigen = {label:GEBIEDLABEL, data:D.leeftijd.values,
  backgroundColor:GEEL, borderColor:ASFALT, borderWidth:1};
const g = new Chart(chLeeftijd, {type:"bar",
  data:{labels:D.leeftijd.labels, datasets:[eigen]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{display:false, position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.x}%`}}},
    scales:{x:{grid:gridOpt, beginAtZero:true, max:32, ticks:{callback:v=>v+"%"}}, y:{grid:{display:false}}}}});
/* De vaste bovengrens van 32% was op Overschie geijkt. Zodra er een referentiegebied naast
   staat kan die overschreden worden, en een balk die tegen de rand aan stopt liegt over zijn
   lengte. Daarom rekt de as mee met wat er werkelijk getekend wordt. */
bijRefWijziging("leeftijd", () => {
  const ref = refDatasets("verdelingen.leeftijd", D.leeftijd.labels, {maxBarThickness:11});
  g.data.datasets = [eigen, ...ref];
  g.options.plugins.legend.display = ref.length > 0;
  const hoogste = Math.max(...[eigen, ...ref]
    .flatMap(d => d.data.filter(v => typeof v === "number")));
  g.options.scales.x.max = Math.max(32, Math.ceil(hoogste / 5) * 5);
  g.update();
});
});

veilig("grafiek-huishoudens", () => {
/* huishoudens: gestapelde balk per gebied.

   Dit was een donut. Een donut kan geen tweede gebied tonen: extra ringen eromheen waren
   onleesbaar — drie concentrische ringen zonder eigen label, en de lezer kan niet zien welke
   ring welk gebied is. Ringen dunner maken of vervagen maakt dat erger, niet beter.

   Een gestapelde balk per gebied lost precies dat op: de drie categorieën houden hun kleur,
   het gebied staat als aslabel, en de segmenten beginnen op dezelfde lijn zodat "meer
   eenpersoons dan Rotterdam" af te lezen is in plaats van af te leiden uit twee hoeken. De
   eigen balk staat bovenaan.

   Dat de kleuren hier categorieën coderen en niet gebieden is geen uitzondering op de
   afspraak elders: het gebied is hier de as, niet de reeks. */
const KLEUR_HH = [SCHIE, BETON, GEEL];
const g = new Chart(chHuish, {type:"bar",
  data:{labels:[GEBIEDNAAM], datasets:D.huishoudens.labels.map((l, i) => ({
    label:l, data:[D.huishoudens.values[i]], backgroundColor:KLEUR_HH[i],
    borderColor:ASFALT, borderWidth:1, maxBarThickness:46}))},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.x}%`}}},
    scales:{x:{stacked:true, grid:gridOpt, max:100, ticks:{callback:v=>v+"%"}},
            y:{stacked:true, grid:{display:false}}}}});
bijRefWijziging("huishoudens", () => {
  const ref = refReeksen("verdelingen.huishoudens", D.huishoudens.labels);
  g.data.labels = [GEBIEDNAAM, ...ref.map(r => r.label)];
  g.data.datasets = D.huishoudens.labels.map((l, i) => ({
    label:l,
    data:[D.huishoudens.values[i], ...ref.map(r => r.waarden[i])],
    backgroundColor:KLEUR_HH[i], borderColor:ASFALT, borderWidth:1, maxBarThickness:46,
  }));
  g.update();
});
});

veilig("grafiek-inkomen", () => {
/* inkomen: toggle per maat */
/* Inkomen is één getal per gebied, geen verdeling: de referentie komt er dus als extra balk
   naast in plaats van als tweede reeks. De bestaande "Nederland"-balk blijft staan — dat is
   de landelijke ijking die CBS zelf meelevert, en die staat los van de gebiedsvergelijking. */
let chInkomenObj = new Chart(chInkomen, {type:"bar",
  data:{labels:D.inkomen.ontvanger.labels, datasets:[{
    data:D.inkomen.ontvanger.values, backgroundColor:[GEEL,BETON], borderColor:ASFALT, borderWidth:1, maxBarThickness:110
  }]},
  options:{maintainAspectRatio:false, plugins:{legend:{display:false},
    tooltip:{callbacks:{label:c=>` € ${(c.parsed.y*1000).toLocaleString("nl-NL")}`}}},
    scales:{y:{grid:gridOpt, beginAtZero:true, title:{display:true,text:"× € 1.000"}}, x:{grid:{display:false}}}}});
function toonInkomen(maat) {
  const d = D.inkomen[maat];
  const ref = refWaarden(`inkomen.${maat}`);
  chInkomenObj.data.labels = [...d.labels, ...ref.map(r => r.label)];
  chInkomenObj.data.datasets[0].data = [...d.values, ...ref.map(r => r.waarde)];
  chInkomenObj.data.datasets[0].backgroundColor = [GEEL, BETON, ...ref.map(r => r.kleur)];
  chInkomenObj.update();
}
document.querySelectorAll("[data-ink]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("[data-ink]").forEach(b=>b.classList.remove("actief"));
  btn.classList.add("actief");
  toonInkomen(btn.dataset.ink);
}));
bijRefWijziging("inkomen", () => {
  const actief = document.querySelector("[data-ink].actief");
  toonInkomen(actief ? actief.dataset.ink : "ontvanger");
});
});

veilig("grafiek-opleiding", () => {
/* opleiding */
/* Eén kleur, om dezelfde reden als bij de leeftijdsopbouw: BETON/SCHIE/POLDER was decoratief
   en SCHIE botst met de gemeentereferentie. */
const eigen = {label:GEBIEDLABEL, data:D.opleiding.values,
  backgroundColor:GEEL, borderColor:ASFALT, borderWidth:1, maxBarThickness:110};
const g = new Chart(chOpleiding, {type:"bar",
  data:{labels:D.opleiding.labels, datasets:[eigen]},
  options:{maintainAspectRatio:false,
    plugins:{legend:{display:false, position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y}%`}}},
    scales:{y:{grid:gridOpt, beginAtZero:true, max:40, ticks:{callback:v=>v+"%"}}, x:{grid:{display:false}}}}});
bijRefWijziging("opleiding", () => {
  const ref = refDatasets("verdelingen.opleiding", D.opleiding.labels, {maxBarThickness:36});
  g.data.datasets = [eigen, ...ref];
  g.options.plugins.legend.display = ref.length > 0;
  const hoogste = Math.max(...[eigen, ...ref]
    .flatMap(d => d.data.filter(v => typeof v === "number")));
  g.options.scales.y.max = Math.max(40, Math.ceil(hoogste / 5) * 5);
  g.update();
});
});

/* ---------- hoe is dit cijfer samengesteld, en is het volledig? (#37) ----------
   Sinds het gebiedsmodel draagt elk gebiedscijfer zijn eigen verantwoording mee: `regel`,
   `gewicht`, `volledig`, `nOnderdrukt`, `nWijken`. De frontend deed daar niets mee, dus de
   data zat er wel en zag niemand het. Op gemeenteniveau zijn bij inkomen 7 wijken onderdrukt,
   bij armoede 6 en bij WOZ 5 — dat getoonde cijfer is dan een **ondergrens** en dit dashboard
   heeft als uitgangspunt dat bron, peiljaar en niveau bij elk cijfer staan.

   Bewust geen nieuw visueel idioom: dit wordt een `.status`-badge naast de bestaande
   niveaubadge. Bij één wijk (`regel: "gepubliceerd"`) verschijnt er niets — dat is het
   normale geval, en een badge bij elk cijfer leert je badges negeren. */
function aggregatieTekst(meta) {
  if (!meta || meta.regel === "gepubliceerd") return null;
  if (meta.regel === "niet_aggregeerbaar") {
    return {klasse: "ontbreekt", kort: "niet samen te vatten",
            lang: meta.reden || "deze maat is niet op te tellen of te middelen over gebieden"};
  }
  const n = meta.nWijken || meta.nGebruikt || 0;
  const hoe = meta.gewicht ? `gewogen naar ${meta.gewicht}` : "opgeteld";
  if (meta.volledig === false) {
    const mist = meta.nOnderdrukt || 0;
    return {
      klasse: "ontbreekt",
      kort: mist ? `ondergrens · ${mist} van ${n} onderdrukt` : "ondergrens",
      lang: `Samengesteld uit ${n} wijken (${hoe}), maar ${mist} wijk(en) publiceert CBS ` +
        "niet. Die cellen zijn overgeslagen, niet als nul meegeteld — het getoonde cijfer " +
        "is daarom een ondergrens, geen totaal.",
    };
  }
  return {
    klasse: "cbs",
    kort: `samengesteld uit ${n} wijken`,
    lang: `Samengesteld uit ${n} wijken (${hoe}); alle wijken publiceren een cijfer.`,
  };
}

/* Zet de badge in de kop van het kaartje waar dit canvas in staat, en de uitleg in de
   voetnoot. Een onvolledig cijfer krijgt rode tekst: dit is een voorbehoud, geen bijzaak, en
   het hoort niet in dezelfde neutrale grijstint als de rest van de verantwoording. */
function zetAggregatie(canvasId, meta) {
  const canvas = document.getElementById(canvasId);
  const box = canvas && canvas.closest(".chart-box");
  if (!box) return;
  const t = aggregatieTekst(meta);
  /* Altijd eerst opruimen: bij een grafiek met een schakelaar — inkomen per ontvanger versus
     per inwoner, of de zes indicatoren in sectie 02 — wisselt de verantwoording mee. Zonder
     opruimen stapelen de badges zich op en blijft een oud voorbehoud staan bij een cijfer
     waar het niet meer over gaat. */
  box.querySelector("h4 .status.agg")?.remove();
  box.querySelector(".foot .aggUitleg")?.remove();
  if (!t) return;
  const kop = box.querySelector("h4");
  if (kop) {
    const b = document.createElement("span");
    b.className = `status ${t.klasse} agg`;
    b.textContent = t.kort;
    b.title = t.lang;
    /* Direct achter de niveaubadge, niet aan het eind van de kop: bij een kaartje met een
       schakelaar in de kop — sectie 02, en inkomen — belandde de badge anders onder de
       knoppenrij, los van het cijfer waar hij over gaat. */
    const niveau = kop.querySelector(".status.niveau");
    if (niveau) {
      niveau.after(b);
      niveau.after(document.createTextNode(" "));
    } else {
      kop.appendChild(document.createTextNode(" "));
      kop.appendChild(b);
    }
  }
  const foot = box.querySelector(".foot");
  if (foot) {
    const el = document.createElement("div");
    el.className = "aggUitleg";
    el.style.marginTop = "3px";
    el.innerHTML = t.klasse === "ontbreekt"
      ? `<b style="color:var(--rood)">${t.lang}</b>`
      : t.lang;
    foot.appendChild(el);
  }
}

veilig("zelfvoorzienendheid", () => {
/* ---------- zelfvoorzienendheid hoog in de pagina (#49) ----------
   ODiN levert per gebied het aandeel verplaatsingen dat binnen het gebied begint én eindigt.
   Voor een wijk is dat een detail; voor een rayon is het een hoofdcijfer. Een rayon dat
   driekwart van zijn eigen verplaatsingen bevat vraagt andere investeringen dan een rayon
   dat zijn verkeer exporteert — het zegt of voorzieningen, werk en scholen binnen bereik
   liggen, precies de vraag van een gebiedsplan. Het stond als bijschrift bij een kaart
   onderaan sectie 07.

   Eén percentage zegt niets zonder vergelijking: is 73,1% veel of weinig? Daarom staan de
   peers uit REFERENTIE ernaast. Vergelijken tússen niveaus is wél onzinnig — een groter
   gebied houdt per definitie meer binnen — en dat voorbehoud staat eronder. */
const box = document.getElementById("zelfvoorzienendBox");
const canvas = document.getElementById("chZelfvoorzienend");
if (!box || !canvas || typeof Chart === "undefined") return;
const eigen = (typeof ODINW !== "undefined" && !ODINW.leeg && ODINW.bestemmingen)
  ? ODINW.bestemmingen.delen : null;
if (!eigen) return;

const DELEN = [
  ["binnenWijk", "binnen het gebied", POLDER],
  ["binnenGemeente", "elders in de gemeente", SCHIE],
  ["buitenGemeente", "buiten de gemeente", GRIJS],
];
/* Alleen peers van hetzelfde niveau: een rayon naast de gemeente leggen zou het
   omvangseffect als een verschil presenteren. Voor een wijk zijn dat de andere gebieden in
   hetzelfde rayon — dezelfde bestuurlijke context en ongeveer dezelfde omvang, en dat is de
   vergelijking die in een gebiedsplan gemaakt wordt. */
const {peers: peerRijen, groepNaam} = peersOpNiveau(r => r.zelfvoorzienend);
const peers = peerRijen.map(r => ({naam: r.naam, delen: r.zelfvoorzienend}));
const rijen = [{naam: GEBIEDNAAM, delen: eigen, eigen: true}, ...peers];

/* ODiN-drempel (#13): geen getoonde uitkomst mag op minder dan N_MIN respondenten rusten.
   Dat geldt hier net zo goed als in sectie 07 — Hoek van Holland heeft 6 waarnemingen voor
   "elders in de gemeente". Onder de drempel laten we het deel leeg; de balk sluit dan niet
   op 100% en dat staat er expliciet bij, want stilzwijgend samenvoegen zou het cijfer
   ophogen met iets wat we niet mogen tonen. */
const N_DREMPEL = (ODINW.drempel && ODINW.drempel.nMin) || 20;
const onderDrempel = [];
rijen.forEach(r => {
  DELEN.forEach(([sleutel, label]) => {
    const deel = r.delen[sleutel];
    /* Sinds #87 komt een deel onder de drempel leeg uit de pipeline (onderdrukt, zonder n);
       de n-toets blijft voor data die van vóór die wijziging is. */
    if (deel && !deel.nvt && (deel.onderdrukt || (deel.n != null && deel.n < N_DREMPEL))) {
      onderDrempel.push(`${r.naam} — ${label}` + (deel.n != null ? ` (n=${deel.n})` : ""));
      deel.onderDrempel = true;
    }
  });
});

new Chart(canvas, {
  type: "bar",
  data: {
    labels: rijen.map(r => r.naam),
    datasets: DELEN.map(([sleutel, label, kleur]) => ({
      label, backgroundColor: kleur, borderColor: ASFALT, borderWidth: 1,
      data: rijen.map(r => {
        const deel = r.delen[sleutel] || {};
        return deel.onderDrempel ? null : (deel.share ?? null);
      }),
    })),
  },
  options: {
    indexAxis: "y", maintainAspectRatio: false,
    scales: {x: {stacked: true, max: 100, grid: gridOpt,
                 title: {display: true, text: "% van de verplaatsingen"}},
             /* Het eigen gebied vet, anders is in de balken niet te zien welke rij het
                onderwerp is en welke de vergelijking. */
             y: {stacked: true, grid: {display: false},
                 ticks: {font: c => ({weight: c.index === 0 ? "700" : "400", size: 11})}}},
    plugins: {
      legend: {position: "bottom", labels: {boxWidth: 12, font: {size: 11}}},
      tooltip: {callbacks: {label: c => {
        const r = rijen[c.dataIndex];
        const [sleutel, label] = DELEN[c.datasetIndex];
        const deel = r.delen[sleutel] || {};
        if (deel.nvt) return ` ${label}: bestaat niet op dit niveau`;
        if (deel.onderDrempel) return ` ${label}: te weinig waarnemingen` +
          (deel.n != null ? ` (n=${deel.n})` : "");
        return ` ${label}: ${c.parsed.x.toLocaleString("nl-NL")}%` +
          (deel.n != null ? ` (n=${deel.n})` : "");
      }}},
    },
  },
});

const pct = v => v.toLocaleString("nl-NL") + "%";
const eigenDeel = eigen.binnenWijk || {};
const eigenShare = eigenDeel.onderDrempel ? null : eigenDeel.share;
const anderen = peers
  .map(p => p.delen.binnenWijk || {})
  .filter(d => !d.onderDrempel && d.share != null)
  .map(d => d.share);
let sub = eigenShare == null
  ? `Voor ${GEBIEDNAAM} zijn er te weinig waarnemingen om te tonen welk deel van de ` +
    "verplaatsingen binnen het gebied blijft."
  : `${pct(eigenShare)} van de verplaatsingen van bewoners begint én eindigt binnen ` +
    `${GEBIEDNAAM}.`;
if (anderen.length && eigenShare != null) {
  const hoogste = Math.max(...anderen), laagste = Math.min(...anderen);
  const groep = groepNaam;
  sub += ` De ${groep} liggen tussen ${pct(laagste)} en ${pct(hoogste)}, dus dit is ` +
    (eigenShare > hoogste ? "het hoogste van allemaal."
     : eigenShare < laagste ? "het laagste van allemaal." : "daarbinnen.");
} else if (eigenShare != null) {
  sub += " Er zijn geen vergelijkbare gebieden op dit niveau gebouwd, dus dit getal staat " +
    "op zichzelf.";
}
document.getElementById("zelfvoorzienendSub").innerHTML = sub +
  (onderDrempel.length
    ? `<br><b style="color:var(--rood)">Let op: minder dan ${N_DREMPEL} waarnemingen voor ` +
      `${onderDrempel.join("; ")} — die delen zijn leeggelaten, dus die balk sluit niet ` +
      "op 100%.</b>"
    : "");
document.getElementById("zelfvoorzienendFoot").innerHTML =
  `${ODINW.bron} · niveau ${ODINW.niveau}. ` +
  "<b>Hoog is niet vanzelf goed:</b> het kan betekenen dat het gebied compleet is, maar ook " +
  "dat mensen weinig mobiel zijn of dat de afbakening ruim is. Een groter gebied houdt per " +
  `definitie meer binnen, dus vergelijken tussen niveaus is onzinnig en tussen ${GEBIEDNIVEAU}s ` +
  "juist wel zinvol. Steekproefcijfer met een PC4-benadering die de grens niet exact volgt.";
box.hidden = false;
});

veilig("buurtvergelijking", () => {
/* ---------- buurtvergelijking met indicator-switcher ---------- */
const BV = D.buurtVergelijk;
/* Kleur per gebied, niet per buurt. Voorheen rouleerde de kleur per zes buurten, wat een
   groepering suggereerde die er niet is. Nu draagt de kleur informatie: je ziet in de
   buurtweergave meteen of buurten van hetzelfde gebied bij elkaar liggen of door de hele
   verdeling verspreid staan — precies de tussen-of-binnen-vraag uit sectie 02. */
const GEBIED_PALET = ["#B0452F", SCHIE, POLDER, GEEL, GRIJS, "#7B4B94", "#3F7F6F"];
const gebiedKleur = {};
(BV.gebieden || []).forEach((g, i) => {
  gebiedKleur[g.code] = GEBIED_PALET[i % GEBIED_PALET.length];
});
const buurtKleuren = BV.buurten.map((_, i) => {
  const code = (BV.buurtGebied || [])[i];
  return gebiedKleur[code] || SCHIE;
});


/* plugin: referentielijnen — het gebied zelf plus de gekozen peers */
wijkLijn = {
  id:"wijkLijn", huidige:null, reeksen:[],
  afterDraw(chart){
    const {ctx, chartArea:a, scales:{y}} = chart;
    const getekend = [];
    const lijn = (waarde, kleur, label, dik) => {
      if (waarde==null) return;
      const yp = y.getPixelForValue(waarde);
      if (yp < a.top || yp > a.bottom) return;   // buiten beeld: geen label op de rand
      ctx.save();
      ctx.strokeStyle = kleur; ctx.setLineDash([5,4]); ctx.lineWidth = dik ? 2 : 1.25;
      ctx.beginPath(); ctx.moveTo(a.left, yp); ctx.lineTo(a.right, yp); ctx.stroke();
      /* Het eigen gebied links, de referenties rechts. Bij vier rayons liggen de waarden
         vaak dicht op elkaar. Botsende labels wijken **horizontaal** uit, nooit verticaal:
         een label dat omhoog schuift suggereert een hogere waarde dan de lijn heeft, en dat
         is precies de leesfout die dit dashboard niet mag maken. Een dekkend plaatje achter
         de tekst houdt hem leesbaar boven een balk. */
      ctx.font = (dik ? "700" : "400") + " 11px Helvetica";
      const b = ctx.measureText(label).width;
      const ly = yp - 5;
      let x = dik ? a.left + 4 : a.right - b - 4;
      while (getekend.some(v => Math.abs(v.y - ly) < 12
                             && x < v.x + v.b + 6 && x + b + 6 > v.x)) {
        x -= b + 10;
      }
      getekend.push({x, y: ly, b});
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(240,238,230,.82)";
      ctx.fillRect(x - 2, ly - 10, b + 4, 13);
      ctx.fillStyle = kleur;
      ctx.fillText(label, x, ly);
      ctx.restore();
    };
    lijn(wijkLijn.huidige, ASFALT, GEBIEDNAAM + " (gemiddelde)", true);
    wijkLijn.reeksen.forEach(r => lijn(r.waarde, r.kleur, r.label, false));
  }
};

/* plugin: dwarsstreepjes op de uiteinden van de bereiklijn (gebiedsmodus) ----------------
   De bereiklijn is een staaf van drie pixels: Chart.js doet daarmee de plaatsing per
   categorie, maar de uiteinden zijn dan niet te zien en de lijn oogt als een streepje dat
   ergens ophoudt. Deze plugin zet er koppen op, zodat laagste en hoogste buurt aanwijsbaar
   zijn. Alleen actief in de gebiedsmodus; in de buurtmodus staat `bereiken` leeg. */
bereikKappen = {
  id: "bereikKappen", bereiken: [], breedte: 15,
  afterDatasetsDraw(chart) {
    if (!bereikKappen.bereiken.length) return;
    const meta = chart.getDatasetMeta(0);
    const {ctx, chartArea: a, scales: {y}} = chart;
    ctx.save();
    ctx.strokeStyle = ASFALT; ctx.lineWidth = 2; ctx.lineCap = "butt";
    bereikKappen.bereiken.forEach((b, i) => {
      const el = meta.data[i];
      if (!b || !el) return;
      const half = bereikKappen.breedte / 2;
      for (const waarde of [b.min, b.max]) {
        const yp = y.getPixelForValue(waarde);
        if (yp < a.top || yp > a.bottom) continue;
        ctx.beginPath();
        ctx.moveTo(el.x - half, yp); ctx.lineTo(el.x + half, yp); ctx.stroke();
      }
    });
    ctx.restore();
  }
};

/* Welke referentiewaarden horen bij deze indicator? Onvolledige aggregaten krijgen een ≥,
   want een cijfer met onderdrukte deelgebieden is een ondergrens (#37). */
function refReeksenVoor(sleutel) {
  return REF_KANDIDATEN
    .filter(r => refAan.has(r.code))
    .map(r => {
      const i = (r.indicatoren || {})[sleutel] || {};
      if (typeof i.waarde !== "number") return null;
      return {
        waarde: i.waarde,
        /* refKleurVan en niet de vlakke niveaukleur: met meerdere gebieden aan waren die
           lijnen anders allemaal hetzelfde groen (#106). */
        kleur: refKleurVan(r),
        label: r.naam + (i.volledig === false ? ` (≥, ${i.nOnderdrukt} onderdrukt)` : ""),
      };
    })
    .filter(Boolean);
}

chBuurtObj = new Chart(chBuurt, {type:"bar",
  data:{labels:BV.buurten, datasets:[{data:[], backgroundColor:buurtKleuren,
        borderColor:ASFALT, borderWidth:1, maxBarThickness:90}]},
  options:{maintainAspectRatio:false,
    plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=> c.parsed.y==null ? " geen cijfer" : ` ${c.parsed.y.toLocaleString("nl-NL")}`}}},
    scales:{y:{grid:gridOpt, beginAtZero:true}, x:{grid:{display:false}}}},
  plugins:[wijkLijn, bereikKappen]});

/* ---- niveaukeuze: per gebied of per buurt ----
   Bij een rayon is de eerste vraag niet "hoe scoort dit rayon" maar "zit het verschil tussen
   mijn gebieden of erbinnen". De gebiedsweergave antwoordt dat in één beeld: per gebied een
   lijn van de laagste tot de hoogste buurt, met een ruit op de eigen gebiedswaarde.
   Bij een gebied van één wijk is er geen tussenniveau en verdwijnt de keuze. */
/* Op gemeenteniveau zijn de constituerende wijken alle 22 CBS-wijken, inclusief de acht
   haven-, bedrijven- en watergebieden. Die horen bij geen rayon en zijn als vergelijkings-
   eenheid ruis ("Groot water" naast Ommoord). Ze blijven meetellen in het gemeentetotaal,
   maar vallen uit de uitsplitsing. */
const buitenIndeling = new Set(
  ((typeof GEBIEDEN !== "undefined" && GEBIEDEN.buitenGebiedsindeling
    && GEBIEDEN.buitenGebiedsindeling.gebieden) || []).map(g => g.code));
const alleGebieden = BV.gebieden || [];
BV.gebieden = alleGebieden.filter(g => !buitenIndeling.has(g.code));
const gebiedenWeggelaten = alleGebieden.length - BV.gebieden.length;
const heeftGebieden = BV.gebieden.length > 1;
let niveau = heeftGebieden ? "gebied" : "buurt";

/* buurtindex -> gebiedcode, om per gebied de min en max over zijn buurten te bepalen */
const buurtGebied = BV.buurtGebied || [];
const spreidingPerGebied = ind => BV.gebieden.map(g => {
  const waarden = ind.values
    .filter((v, i) => buurtGebied[i] === g.code && typeof v === "number");
  return waarden.length
    ? {min: Math.min(...waarden), max: Math.max(...waarden), n: waarden.length}
    : null;
});

toonIndicator = function(key){
  const ind = BV.indicatoren[key];
  const perGebiedAanwezig = ind.gebieden && Object.keys(ind.gebieden).length > 1;
  const gebiedModus = niveau === "gebied" && heeftGebieden && perGebiedAanwezig;
  let zonderCijfer = 0, uitersten2 = null;

  if (gebiedModus) {
    /* Was een zwevende balk van laagste tot hoogste buurt. Die balk begon niet bij nul en las
       daardoor als een afgekapte staaf: een staaf codeert lengte vanaf nul, en deze codeerde
       een bereik. Nu een dunne lijn met dwarsstreepjes op de uiteinden plus een ruit op het
       gebiedscijfer — een puntweergave met bereik, waar geen nulpunt bij hoort. De drager
       blijft een `bar` van drie pixels, want daarmee doet Chart.js de plaatsing per categorie;
       de koppen komen van de plugin bereikKappen. */
    const spreiding = spreidingPerGebied(ind);
    bereikKappen.bereiken = spreiding;
    chBuurtObj.data.labels = BV.gebieden.map(g => g.naam);
    chBuurtObj.data.datasets = [
      { label: "laagste–hoogste buurt", type: "bar", order: 2,
        data: spreiding.map(s => s ? [s.min, s.max] : null),
        backgroundColor: ASFALT, borderWidth: 0, maxBarThickness: 3},
      { /* Het gepubliceerde cijfer van het gebied zelf. Ligt per definitie binnen het bereik,
           dus het moet er bovenop en met contrast: order lager = later getekend, en een witte
           rand zodat de ruit ook op de lijn leesbaar blijft. */
        label: "gebiedscijfer", type: "line", order: 1, showLine: false,
        data: BV.gebieden.map(g => ind.gebieden[g.code] ?? null),
        borderColor: "#FAFAF5", backgroundColor: "#B0452F", borderWidth: 2,
        pointStyle: "rectRot", pointRadius: 9, pointHoverRadius: 11},
    ];
    chBuurtObj.options.plugins.legend.display = true;
    /* Een lijn van drie pixels is niet aan te wijzen; de tooltip volgt daarom de kolom in
       plaats van het element. */
    chBuurtObj.options.interaction = {mode: "index", intersect: false};
    chBuurtObj.options.plugins.tooltip.callbacks.label = c => {
      if (c.dataset.type === "line")
        return ` gebiedscijfer: ${c.parsed.y.toLocaleString("nl-NL")}`;
      const s = spreiding[c.dataIndex];
      return s ? ` buurten: ${s.min.toLocaleString("nl-NL")} – ` +
        `${s.max.toLocaleString("nl-NL")} (${s.n} met cijfer)` : " geen buurtcijfers";
    };
  } else {
    bereikKappen.bereiken = [];
    chBuurtObj.options.interaction = {};
    /* Gesorteerd op waarde, niet op geometrie-volgorde: bij 19 of 92 buurten is de
       PDOK-volgorde willekeurig en verbergt hij de verdeling. Buurten zonder gepubliceerd
       cijfer vallen weg in plaats van als nulbalk te verschijnen — dat las als "nul", niet
       als "onbekend". Hoeveel er wegvielen staat in de ondertitel. */
    const rijen = BV.buurten
      .map((naam, i) => ({naam, v: ind.values[i], kleur: buurtKleuren[i],
        gebied: (BV.buurtGebied || [])[i]}))
      .filter(r => typeof r.v === "number")
      .sort((a, b) => b.v - a.v);
    zonderCijfer = BV.buurten.length - rijen.length;
    chBuurtObj.data.labels = rijen.map(r => r.naam);
    chBuurtObj.data.datasets = [{data: rijen.map(r => r.v),
      backgroundColor: rijen.map(r => r.kleur),
      borderColor: ASFALT, borderWidth: 1, maxBarThickness: 90}];
    chBuurtObj.options.plugins.legend.display = false;
    const naamVanGebied = Object.fromEntries((BV.gebieden || []).map(g => [g.code, g.naam]));
    chBuurtObj.options.plugins.tooltip.callbacks.label = c => {
      const r = rijen[c.dataIndex];
      return ` ${c.parsed.y.toLocaleString("nl-NL")}` +
        (r && naamVanGebied[r.gebied] ? ` — ${naamVanGebied[r.gebied]}` : "");
    };
    /* Boven de dertig eenheden zijn de aslabels niet meer te lezen; dan alleen nog de
       uitersten benoemen in de ondertitel en de rest via de tooltip. */
    chBuurtObj.options.scales.x.ticks = rijen.length > 30
      ? {display: false}
      : {display: true, autoSkip: false, maxRotation: 60, minRotation: 45};
    uitersten2 = rijen.length > 1 ? {hoog: rijen[0], laag: rijen.at(-1)} : null;
  }
  chBuurtObj.options.scales.y.title = {display:true, text:ind.eenheid};
  wijkLijn.huidige = ind.wijk;
  /* Geen referentielaag beschikbaar: terugvallen op het gemeentecijfer dat elke indicator
     zelf al meedraagt, zodat er altijd één buitenstaander in beeld staat. */
  wijkLijn.reeksen = REF_KANDIDATEN.length
    ? refReeksenVoor(key)
    : (GEBIEDNIVEAU !== "gemeente" && ind.rdam != null
        ? [{waarde: ind.rdam, kleur: SCHIE, label: GEMEENTENAAM}] : []);
  chBuurtObj.update();

  /* Ondertitel benoemt waar de spreiding zit — dat is de boodschap, niet het gemiddelde. */
  let sub;
  if (gebiedModus) {
    const gw = BV.gebieden.map(g => ind.gebieden[g.code]).filter(v => typeof v === "number");
    const bw = ind.values.filter(v => typeof v === "number");
    const f = (a) => a.length > 1 && Math.min(...a) > 0
      ? (Math.max(...a) / Math.min(...a)) : null;
    const fG = f(gw), fB = f(bw);
    sub = `${ind.naam} per gebied. Lijn = laagste tot hoogste buurt binnen dat gebied, ` +
      `ruit = het gepubliceerde gebiedscijfer.`;
    if (fG && fB) sub += ` Tussen gebieden ${fG.toFixed(1)}×, binnen buurten ${fB.toFixed(1)}× — ` +
      (fB > fG * 1.3
        ? "het verschil zit dus vooral bínnen de gebieden, niet ertussen."
        : fG > fB * 1.3
          ? "het verschil zit dus vooral tússen de gebieden."
          : "beide niveaus verschillen ongeveer even sterk.");
  } else {
    sub = `${ind.naam} per buurt, hoog naar laag`;
    if (uitersten2) sub += `: van ${uitersten2.hoog.naam} ` +
      `(${uitersten2.hoog.v.toLocaleString("nl-NL")}) tot ${uitersten2.laag.naam} ` +
      `(${uitersten2.laag.v.toLocaleString("nl-NL")})`;
    sub += ".";
    if (heeftGebieden) sub += " Kleur = gebied, zodat te zien is of buurten van hetzelfde " +
      "gebied bij elkaar liggen of door de verdeling verspreid staan.";
    if (zonderCijfer) sub += ` ${zonderCijfer} buurt(en) zonder gepubliceerd cijfer zijn ` +
      "weggelaten (onthullingsgrenzen), niet als nul getoond.";
  }
  /* De legenda van de stippellijnen volgt wat er werkelijk getekend is, niet een vaste zin
     over "Rotterdam" — anders belooft het bijschrift een lijn die er niet staat. */
  const namen = wijkLijn.reeksen.map(r => r.label);
  sub += ` Stippellijnen: ${GEBIEDNAAM} (zwart)` +
    (namen.length ? " en " + namen.join(", ") : "") + ".";
  if (gebiedenWeggelaten) sub += ` ${gebiedenWeggelaten} haven-, bedrijven- en ` +
    "watergebieden zijn uit de uitsplitsing gelaten; ze tellen wel mee in het totaal.";
  document.getElementById("buurtSub").textContent = sub;
  /* #37: de verantwoording wisselt per indicator — bij de gemeente is WOZ op 5 onderdrukte
     wijken gebaseerd en huishoudensgrootte op 2. Daarom bij elke wissel opnieuw zetten, en
     niet één keer bij het opbouwen van de pagina. De pipeline zet "LET OP: N wijk(en)
     onderdrukt" al in ind.foot, maar in dezelfde neutrale grijstint als de bronvermelding —
     en een voorbehoud dat eruitziet als een bronvermelding leest als een bronvermelding. */
  document.getElementById("buurtFoot").textContent = ind.foot;
  zetAggregatie("chBuurt", ind.aggregatie);
  document.querySelectorAll("#buurtToggle button").forEach(b=>
    b.classList.toggle("actief", b.dataset.key===key));
  document.querySelectorAll("#niveauToggle button").forEach(b=>
    b.classList.toggle("actief", b.dataset.niveau===niveau));
  if (updateKaart) updateKaart(key);
}
const bt = document.getElementById("buurtToggle");
Object.entries(BV.indicatoren).forEach(([key,ind])=>{
  const b = document.createElement("button");
  b.dataset.key = key; b.textContent = ind.naam;
  b.addEventListener("click", ()=>toonIndicator(key));
  bt.appendChild(b);
});
/* Keuzevakjes voor de referentie. De standaard doet het werk — dat is wat iemand ziet die
   niets aanklikt, en dat is het meeste gebruik — maar wie een andere peer wil kan hem
   aanzetten. */
/* De keuzevakjes zelf worden onderaan voor de hele pagina gebouwd (#7); dit blok schrijft
   zich alleen in, zodat de buurtvergelijking meebeweegt met een keuze die elders is gemaakt. */
bijRefWijziging("buurtvergelijking", () => {
  const actief = document.querySelector("#buurtToggle button.actief");
  toonIndicator(actief ? actief.dataset.key : "inkomen");
});

const nt = document.getElementById("niveauToggle");
if (nt && heeftGebieden) {
  [["gebied", `per gebied (${BV.gebieden.length})`],
   ["buurt", `per buurt (${BV.buurten.length})`]].forEach(([n, label]) => {
    const b = document.createElement("button");
    b.dataset.niveau = n; b.textContent = label;
    b.addEventListener("click", () => {
      niveau = n;
      const actief = document.querySelector("#buurtToggle button.actief");
      toonIndicator(actief ? actief.dataset.key : "inkomen");
    });
    nt.appendChild(b);
  });
}
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
/* Jaargang per stijl (#108). De zoektocht keek alleen of de standaardstijl (inwoners) in een
   jaargang bestond en nam dan aan dat alle stijlen er waren. CBS publiceert de
   nabijheidsvariabelen van de vierkantstatistiek echter niet altijd tegelijk met de rest, en
   dan gaven de zes stijlen onder "Bereikbaarheid" in de nieuwste jaargang niets terug — "de
   bereikbaarheidsindicatoren werken hier niet". Nu heeft elke stijl zijn eigen nieuwste
   jaargang, en een stijl die in geen van de vier jaargangen bestaat wordt in de kiezer
   uitgeschakeld in plaats van een lege laag te tonen. null = nergens gevonden. */
const stijlJaar = {};
const jaarVan = stijl => (stijl in stijlJaar ? stijlJaar[stijl] : wmsJaar);
const wmsUrl = (jaar = wmsJaar) =>
  `https://service.pdok.nl/cbs/vierkantstatistieken100m/${jaar}/wms/v1_0`;
/* probe via de vaste legenda-PNG i.p.v. fetch: afbeeldingen kennen geen CORS-check,
   dus niet-bestaande jaargangen (404 zonder CORS-headers) vervuilen de console niet */
const legendaBestaat = (j, stijl) => new Promise(res => {
  const img = new Image();
  img.onload = () => res(true);
  img.onerror = () => res(false);
  img.src = `${wmsUrl(j)}/legend/vierkant_100m/${stijl}.png`;
});
const WMS_JAREN = (() => {
  const nu = new Date().getFullYear();
  return [nu, nu - 1, nu - 2, nu - 3];
})();
async function zoekWmsJaar(){
  for (const j of WMS_JAREN) {
    if (await legendaBestaat(j, WMS_STANDAARD)) return j;
  }
  return null;
}
/* Per stijl de nieuwste jaargang, alle stijlen tegelijk. De standaardstijl is al bekend. */
async function zoekStijlJaren(stijlen){
  await Promise.all(stijlen.map(async stijl => {
    if (stijl === WMS_STANDAARD) { stijlJaar[stijl] = wmsJaar; return; }
    for (const j of WMS_JAREN) {
      if (await legendaBestaat(j, stijl)) { stijlJaar[stijl] = j; return; }
    }
    stijlJaar[stijl] = null;
  }));
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
/* Koppeling indicator -> 100 m-stijl. Komt uit de indicatorregistry mee in de data, zodat
   een nieuwe indicator met kaartlaag niet ook hier ingetypt hoeft te worden. */
const INDICATOR_NAAR_WMS = Object.fromEntries(
  Object.entries(D.buurtVergelijk.indicatoren)
    .filter(([, i]) => i.wms)
    .map(([k, i]) => [k, i.wms]));
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
      /* het kale label apart, want de optietekst krijgt straks de jaargang erbij */
      opt.dataset.label = label;
      og.appendChild(opt);
    });
    stijlKiezer.appendChild(og);
  });
  const legenda = document.getElementById("wmsLegenda");
  const toonLegenda = () => {
    legenda.style.display = wmsActief ? "block" : "none";
    if (!wmsActief) return;
    const optie = stijlKiezer.selectedOptions[0];
    const label = optie.dataset.label || optie.textContent;
    const jaar = jaarVan(stijlKiezer.value);
    /* PDOK kent geen GetLegendGraphic; de legenda staat als vaste PNG per stijl online */
    let html =
      `<img alt="Legenda CBS 100×100m-laag (${label})" ` +
      `src="${wmsUrl(jaar)}/legend/vierkant_100m/${stijlKiezer.value}.png" ` +
      `style="max-width:100%" onerror="this.replaceWith('(legenda niet beschikbaar — PDOK niet bereikbaar?)')"> ` +
      `<span>CBS 100×100 m: ${label} (${jaar}, CC BY 4.0). Klik op de kaart voor de celwaarden.</span>`;
    /* Hoe de 100 m-laag zich verhoudt tot de buurtindicator. Dit stond er als rode melding
       "heeft geen 100 m-equivalent", en omdat de standaardindicator (inkomen) er geen heeft,
       stond die melding er vrijwel altijd — ook bij iemand die bewust een andere laag koos.
       Het is uitleg, geen fout (#108): dus neutraal, en alleen als er iets uit te leggen is. */
    const ind = D.buurtVergelijk.indicatoren[laatsteKey];
    const passend = INDICATOR_NAAR_WMS[laatsteKey];
    if (ind && passend === stijlKiezer.value) html +=
      `<br><span style="color:var(--asfalt-zacht)">Volgt de buurtindicator “${ind.naam}”.</span>`;
    else if (ind) html +=
      `<br><span style="color:var(--asfalt-zacht)">Staat los van de buurtindicator ` +
      `“${ind.naam}”` + (passend ? "." : ": daarvan publiceert CBS geen 100 m-cijfer.") +
      "</span>";
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
    cbsWms = {jaar, url: stijl => wmsUrl(jaarVan(stijl))};
    return zoekStijlJaren(WMS_STIJLEN.flatMap(([, stijlen]) => stijlen.map(([w]) => w)));
  }).then(() => {
    if (wmsJaar == null) return;
    /* In de kiezer zichtbaar maken wat er per stijl te krijgen is: een oudere jaargang staat
       erbij, een ontbrekende stijl is uitgeschakeld. Anders is een lege laag niet te
       onderscheiden van een gebied waar niemand woont. */
    stijlKiezer.querySelectorAll("option").forEach(opt => {
      const j = stijlJaar[opt.value];
      if (j === null) {
        opt.disabled = true;
        opt.textContent = `${opt.dataset.label} — niet bij PDOK (${WMS_JAREN.at(-1)}–${WMS_JAREN[0]})`;
      } else if (j !== wmsJaar) {
        opt.textContent = `${opt.dataset.label} (${j})`;
      }
    });
    /* De jaargang staat in de legenda, die per stijl wisselt; in de attributie zou hij na
       een stijlwissel blijven hangen. */
    wmsLaag = L.tileLayer.wms(wmsUrl(jaarVan(stijlKiezer.value || WMS_STANDAARD)),
      {layers:"vierkant_100m", styles:stijlKiezer.value || WMS_STANDAARD,
       format:"image/png", transparent:true, opacity:.7,
       attribution:"CBS vierkantstatistieken via PDOK (CC BY 4.0)"});
    wmsToggle.disabled = false;
  });
  stijlKiezer.addEventListener("change", () => {
    if (wmsLaag) {
      /* Een stijl uit een andere jaargang zit op een andere service-URL. */
      const url = wmsUrl(jaarVan(stijlKiezer.value));
      if (wmsLaag._url !== url) wmsLaag.setUrl(url, true);
      wmsLaag.setParams({styles: stijlKiezer.value});
    }
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
    const celJaar = jaarVan(stijlKiezer.value);
    const size = kaart.getSize(), pt = kaart.latLngToContainerPoint(e.latlng);
    const sw = L.CRS.EPSG3857.project(kaart.getBounds().getSouthWest());
    const ne = L.CRS.EPSG3857.project(kaart.getBounds().getNorthEast());
    const url = wmsUrl(celJaar) + "?" + new URLSearchParams({
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
          `${regels}<br><i>CBS vierkantstatistieken ${celJaar}, CC BY 4.0</i>`;
      }
    } catch (err) {
      inhoud = "Celwaarden niet opgehaald (PDOK niet bereikbaar?).";
    }
    L.popup({maxHeight:260}).setLatLng(e.latlng).setContent(inhoud).openOn(kaart);
  });

  /* Geen OV- of fietslaag meer op deze kaart (#129): die hebben hun eigen kaart in sectie 06
     en staan samen in de lagenkaart. Deze kaart gaat over de buurtindicatoren. */

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
  /* Niet naar een stijl springen die in de kiezer is uitgeschakeld omdat PDOK hem niet heeft. */
  const passendOptie = stijlKiezer && stijlKiezer.querySelector(`option[value="${passend}"]`);
  if (wmsActief && passend && stijlKiezer && stijlKiezer.value !== passend
      && !(passendOptie && passendOptie.disabled)) {
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

veilig("bereik", () => {
/* ---------- aandeel inwoners binnen de drempelafstand (#50) ----------
   Een gemiddelde afstand beschrijft een rayon van 45 km² met stedelijk gebied, villawijken,
   bedrijventerrein en veenweidepolder niet: "gemiddeld 2,8 km tot een treinstation" geldt
   voor niemand. Het aandeel binnen een drempel wel, en het aggregeert bovendien zuiver — een
   gewogen aandeel over buurten in plaats van een gemiddelde van gemiddelden.

   Deze grafiek staat vóór het gemiddelde, niet in plaats ervan: het gaat erom wat vooraan
   staat. */
const bd = (typeof CBSMOB !== "undefined" && CBSMOB.nabijheid)
  ? CBSMOB.nabijheid.binnenDrempel : null;
const box = document.getElementById("bereikBox");
const canvas = document.getElementById("chBereik");
if (!bd || !box || !canvas || typeof Chart === "undefined") return;
const rijen = Object.values(bd).filter(d => d.aandeel != null);
if (!rijen.length) return;
/* Slechtst bereikbaar bovenaan: dat is de kant waar een gebiedsplan over gaat. */
rijen.sort((a, b) => a.aandeel - b.aandeel);

new Chart(canvas, {
  type: "bar",
  data: {
    labels: rijen.map(d => `${d.naam} (${d.km.toLocaleString("nl-NL")} km)`),
    datasets: [
      {label: "binnen bereik", backgroundColor: POLDER, borderColor: ASFALT, borderWidth: 1,
       data: rijen.map(d => d.aandeel)},
      {label: "daarbuiten", backgroundColor: "#B0452F", borderColor: ASFALT, borderWidth: 1,
       data: rijen.map(d => Math.round((100 - d.aandeel) * 10) / 10)},
    ],
  },
  options: {
    indexAxis: "y", maintainAspectRatio: false,
    scales: {x: {stacked: true, max: 100, grid: gridOpt,
                 title: {display: true, text: "% van de inwoners"}},
             y: {stacked: true, grid: {display: false}}},
    plugins: {
      legend: {position: "bottom", labels: {boxWidth: 12, font: {size: 11}}},
      tooltip: {callbacks: {label: c => {
        const d = rijen[c.dataIndex];
        const aantal = c.datasetIndex === 0 ? d.inwonersBinnen : d.inwonersBuiten;
        return ` ${c.dataset.label}: ${c.parsed.x.toLocaleString("nl-NL")}% ` +
          `(${getalNL(aantal)} inwoners)`;
      }}},
    },
  },
});

const slechtst = rijen[0];
document.getElementById("bereikSub").textContent =
  `Aandeel inwoners dat binnen de drempelafstand van een voorziening woont. Slechtst ` +
  `bereikbaar is de ${slechtst.naam}: ${(100 - slechtst.aandeel).toLocaleString("nl-NL")}% ` +
  `van de inwoners (${getalNL(slechtst.inwonersBuiten)}) woont er verder vandaan dan ` +
  `${slechtst.km.toLocaleString("nl-NL")} km.`;

/* Welke buurten buiten bereik vallen — dat is het antwoord waar een gebiedsplan om vraagt,
   niet het rekenkundige midden. */
const regels = rijen
  .filter(d => d.buitenBereik && d.buitenBereik.length)
  .map(d => `<b>${d.naam}:</b> ` + d.buitenBereik
    .map(r => `${r.buurt} (${getalNL(r.inwoners)} inw., ${r.km.toLocaleString("nl-NL")} km` +
      /* Een buurt die net over de drempel ligt kantelt op een tiende kilometer, en omdat we
         met het buurtgemiddelde rekenen woont een deel van die inwoners feitelijk wél binnen
         bereik. Dat markeren is eerlijker dan het in een algemene voetnoot verstoppen. */
      (r.grensgeval ? ", <i>net buiten</i>" : "") + ")")
    .join(" · "));
/* Hoeveel mensen hangen aan zo'n randgeval? Bij één grote buurt kan dat het aandeel
   merkbaar verschuiven, en dan is het getal minder hard dan het lijkt. */
const grens = rijen.flatMap(d => (d.buitenBereik || []).filter(r => r.grensgeval));
const grensInw = grens.reduce((s, r) => s + r.inwoners, 0);
document.getElementById("bereikBuiten").innerHTML = regels.length
  ? `<div style="color:var(--asfalt-zacht)">Buiten bereik, grootste buurt eerst:</div>` +
    regels.map(r => `<div style="margin-top:2px">${r}</div>`).join("") +
    (grens.length
      ? `<div style="margin-top:6px;color:var(--asfalt-zacht)"><i>Net buiten</i> = binnen ` +
        `een kwart boven de drempel (${grens.length} keer, samen ${getalNL(grensInw)} ` +
        "inwoners). Daar is de indeling het minst hard: we rekenen met het buurtgemiddelde, " +
        "dus een deel van die inwoners woont feitelijk wél binnen bereik.</div>"
      : "")
  : '<div style="color:var(--asfalt-zacht)">Elke buurt ligt binnen alle drempels.</div>';

document.getElementById("bereikFoot").textContent =
  `${CBSMOB.nabijheid.bron}. De drempels zijn een keuze en staan in ` +
  `scripts/indicatoren.py: ` +
  rijen.map(d => `${d.naam} ${d.km.toLocaleString("nl-NL")} km (${d.waarom})`).join(", ") +
  ". " + (CBSMOB.nabijheid.drempelCaveat || "");
box.hidden = false;
});

veilig("grafiek-nabijheid", () => {
/* nabijheid: horizontale balken, station uitgelicht */
const eigen = {label:GEBIEDLABEL, data:D.nabijheid.values,
  backgroundColor:D.nabijheid.labels.map(l => l === "Treinstation" ? "#B0452F" : POLDER),
  borderColor:ASFALT, borderWidth:1};
const g = new Chart(chNabij, {type:"bar",
  data:{labels:D.nabijheid.labels, datasets:[eigen]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{display:false, position:"bottom"},
      tooltip:{callbacks:{label:c=>
        ` ${c.dataset.label}: ${c.parsed.x.toLocaleString("nl-NL")} km`}}},
    scales:{x:{grid:gridOpt, beginAtZero:true, title:{display:true,text:"km over de weg"}}, y:{grid:{display:false}}}}});
/* Deze grafiek krijgt (nog) géén referentiereeks, en dat is een bewuste uitzondering.

   `D.nabijheid` wordt in het blok "cbs-verrijking" bovenaan overschreven door de
   CBSMOB-variant, met vijf categorieën en andere namen: "Grote supermarkt" in plaats van
   "Supermarkt", plus een kinderdagverblijf dat in profiel.js niet voorkomt. De referentielaag
   komt uit de profielstap en kent die labels dus niet. Uitgelijnd op label leverde dat een
   referentie op die bij twee van de vijf balken stond en bij drie niet — en een ontbrekende
   balk leest als "daar is het nul", niet als "die vergelijking hebben we niet".

   Hoort bij #88: de bron is de `cbs`-stap, die `bouw_referentie()` niet draait. Zodra die stap
   meedoet komt hier dezelfde `bijRefWijziging()`-inschrijving als bij de andere grafieken.

   Let op wat hier sowieso vergeleken wordt: een gemiddelde afstand, geen bereikbaarheidsmaat.
   Het aandeel binnen de drempel staat een grafiek hoger en is het hoofdcijfer. */
});

veilig("ov-tabel", () => {
/* ---------- OV-aanbod: samenvatting, knooppunten en volledige lijnlijst (js/ov.js) ---------- */
if (typeof OV === "undefined") return;
/* Geen halte in of nabij het gebied: uitkomst, geen storing (#38). */
if (OV.leeg) {
  const box = document.getElementById("ovTabel")?.closest(".chart-box");
  if (box) {
    box.innerHTML =
      '<h4>OV-aanbod <span class="status ontbreekt">geen haltes</span></h4>' +
      `<div class="sub"><b style="color:var(--rood)">Geen haltes in of nabij ` +
      `${GEBIEDNAAM}.</b> ${OV.caveat}</div>`;
  }
  return;
}

/* volgorde waarin vervoerwijzen getoond worden; onbekende soorten volgen alfabetisch */
const SOORT_VOLGORDE = ["trein", "metro", "tram", "bus", "veer"];
const rangSoort = s => {
  const i = SOORT_VOLGORDE.indexOf(s);
  return i === -1 ? SOORT_VOLGORDE.length : i;
};
const getal = n => n.toLocaleString("nl-NL");
/* GTFS telt na middernacht door (24:00+); "eerste" is dus de vroegste, "laatste" de laatste */
const vroegste = (a, b) => (!a || b < a ? b : a);
const laatste = (a, b) => (!a || b > a ? b : a);
/* Gemiddeld aantal per bedieningsuur (#132): per dag gedeeld door de uren tussen eerste en
   laatste vertrek. GTFS-tijden lopen na middernacht door (25:10), dus gewoon aftrekken klopt.
   Een venster van nul (één rit, of eerste = laatste) geeft geen getal in plaats van oneindig.
   Een daggemiddelde: de spitsfrequentie volgt in #101. */
const minuten = t => { const [h, m] = (t || "").split(":").map(Number); return h * 60 + m; };
const perUur = (aantal, eerste, laatste) => {
  const uren = (minuten(laatste) - minuten(eerste)) / 60;
  if (!(uren > 0) || !Number.isFinite(uren) || aantal == null) return "—";
  const v = aantal / uren;
  return v.toLocaleString("nl-NL", {maximumFractionDigits: v < 10 ? 1 : 0});
};
/* Een halte kent alleen lijnnummers, en een nummer kan bij meerdere vervoerders voorkomen
   (bus 395 rijdt voor drie). Daarom per nummer álle lijnen, en het venster over die samen. */
const lijnenVan = {};
OV.lijnen.forEach(l => { (lijnenVan[l.lijn] = lijnenVan[l.lijn] || []).push(l); });

/* lijn -> soort, zodat haltes (die alleen lijnnummers kennen) per vervoerwijze telbaar zijn */
const soortVanLijn = {};
OV.lijnen.forEach(l => { soortVanLijn[l.lijn] = l.soort; });

/* ---- samenvattingstabel: totalen per vervoerwijze ---- */
const sBody = document.querySelector("#ovSamenvatting tbody");
if (sBody) {
  const perSoort = {};
  OV.lijnen.forEach(l => {
    const r = perSoort[l.soort] || (perSoort[l.soort] =
      {lijnen: 0, ritten: 0, haltes: new Set(), eerste: "", laatste: ""});
    r.lijnen += 1;
    r.ritten += l.ritten;
    r.eerste = vroegste(r.eerste, l.eerste);
    r.laatste = laatste(r.laatste, l.laatste);
  });
  /* een halte telt mee bij elke vervoerwijze die er stopt */
  OV.haltes.forEach(h => (h.lijnen || []).forEach(nr => {
    const s = soortVanLijn[nr];
    if (perSoort[s]) perSoort[s].haltes.add(h.naam);
  }));

  const rijen = Object.entries(perSoort)
    .sort((a, b) => rangSoort(a[0]) - rangSoort(b[0]) || a[0].localeCompare(b[0], "nl"));
  rijen.forEach(([soort, r]) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td><b style="color:${KLEUR_SOORT[soort] || ASFALT}">■</b> ${soort}</td>` +
      `<td class="getal">${getal(r.lijnen)}</td>` +
      `<td class="getal">${getal(r.ritten)}</td>` +
      `<td class="getal">${perUur(r.ritten, r.eerste, r.laatste)}</td>` +
      `<td class="getal">${getal(r.haltes.size)}</td>` +
      `<td>${vensterGTFS(r.eerste, r.laatste)}</td>`;
    sBody.appendChild(tr);
  });
  const tot = rijen.reduce((a, [, r]) => ({
    lijnen: a.lijnen + r.lijnen, ritten: a.ritten + r.ritten,
    eerste: vroegste(a.eerste, r.eerste), laatste: laatste(a.laatste, r.laatste)}),
    {lijnen: 0, ritten: 0, eerste: "", laatste: ""});
  const tr = document.createElement("tr");
  tr.className = "totaal";
  tr.innerHTML =
    `<td>totaal</td><td class="getal">${getal(tot.lijnen)}</td>` +
    `<td class="getal">${getal(tot.ritten)}</td>` +
    `<td class="getal">${perUur(tot.ritten, tot.eerste, tot.laatste)}</td>` +
    `<td class="getal">${getal(OV.haltes.length)}</td>` +
    `<td>${vensterGTFS(tot.eerste, tot.laatste)}</td>`;
  sBody.appendChild(tr);
}

/* ---- knooppunten: haltes met de meeste lijnen ---- */
const kBody = document.querySelector("#ovKnooppunten tbody");
if (kBody) {
  const top = [...OV.haltes]
    .sort((a, b) => (b.lijnen || []).length - (a.lijnen || []).length ||
                    b.vertrekken - a.vertrekken)
    .slice(0, 5);
  top.forEach(h => {
    const nrs = (h.lijnen || []).map(nr =>
      `<b style="color:${KLEUR_SOORT[soortVanLijn[nr]] || ASFALT}">${nr}</b>`).join(" · ");
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${h.naam}</td>` +
      `<td>${nrs} <span style="color:var(--asfalt-zacht)">(${(h.lijnen || []).length})</span></td>` +
      `<td class="getal">${getal(h.vertrekken)}</td>` +
      /* Een halte kent in de data geen eigen eerste en laatste vertrek; het venster van zijn
         lijnen is de benadering (zie de voetnoot). */
      `<td class="getal">${perUur(h.vertrekken,
        (h.lijnen || []).flatMap(nr => (lijnenVan[nr] || []).map(l => l.eerste)).reduce(vroegste, ""),
        (h.lijnen || []).flatMap(nr => (lijnenVan[nr] || []).map(l => l.laatste)).reduce(laatste, ""))}</td>` +
      `<td>${h.binnen ? "in het gebied" : "net buiten de grens"}</td>`;
    kBody.appendChild(tr);
  });
}

/* ---- volledige lijnlijst, uitklapbaar: álle lijnen, niet alleen die met halte binnen ---- */
const body = document.querySelector("#ovTabel tbody");
if (body) {
  [...OV.lijnen]
    .sort((a, b) => rangSoort(a.soort) - rangSoort(b.soort) ||
                    a.soort.localeCompare(b.soort, "nl") ||
                    b.ritten - a.ritten ||
                    String(a.lijn).localeCompare(String(b.lijn), "nl", {numeric: true}))
    .forEach(l => {
      const tr = document.createElement("tr");
      const traject = (l.traject && l.traject !== "lijn") ? l.traject : "—";
      tr.innerHTML =
        `<td><b style="color:${KLEUR_SOORT[l.soort] || ASFALT}">${l.soort} ${l.lijn}</b></td>` +
        `<td>${traject}</td>` +
        `<td class="getal">${getal(l.ritten)}</td>` +
        `<td class="getal">${perUur(l.ritten, l.eerste, l.laatste)}</td>` +
        `<td>${vensterGTFS(l.eerste, l.laatste)}</td>` +
        `<td>${l.binnenWijk ? "ja" : "nee — halte net buiten"}</td>`;
      body.appendChild(tr);
    });
  const label = document.getElementById("ovDetailsLabel");
  const binnenLijnen = OV.lijnen.filter(l => l.binnenWijk).length;
  if (label) label.textContent =
    `Alle ${OV.lijnen.length} lijnen afzonderlijk — ${binnenLijnen} met een halte in het ` +
    `gebied, ${OV.lijnen.length - binnenLijnen} alleen net erbuiten`;
}

const binnen = OV.haltes.filter(h => h.binnen).length;
const feiten = document.getElementById("ovFeiten");
if (feiten) {
  const stations = Object.entries(OV.stationsNabijM || {})
    .map(([n, m]) => `${n} (±${m.toLocaleString("nl-NL")} m buiten de wijkgrens)`);
  feiten.innerHTML =
    tegelHtml(binnen, "OV-halteplaatsen binnen de wijk", `GTFS/NDOV ${OV.peildatum}`,
      "ov-tabel/halteplaatsen") +
    (stations.length
      ? tegelHtml(stations.length, `station(s) nabij: ${stations.join(", ")}`, "GTFS/NDOV",
          "ov-tabel/stations-nabij")
      : "");
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
       vensterGTFS(l.eerste, l.laatste))));
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

/* Rijen zonder de verantwoordingsregel: die hoort niet als staaf in een grafiek, want het is
   geen categorie maar een mededeling over wat er mist. */
const odinZichtbaar = lijst => (Array.isArray(lijst) ? lijst : []).filter(r => !r.onderdrukt);
/* Melding in een grafiekvoetnoot; leeg als er niets onderdrukt is. */
const odinOnderdruktTekst = lijst => {
  const o = (Array.isArray(lijst) ? lijst : []).find(r => r.onderdrukt);
  if (!o) return "";
  return o.share == null
    ? ` ${o.label || "Een categorie"} heeft te weinig waarnemingen en is leeggelaten.`
    : ` ${o.categorieen} categorie${o.categorieen === 1 ? "" : "ën"} met te weinig ` +
      `waarnemingen (samen ${o.share}% van de verplaatsingen) is weggelaten.`;
};
/* Vervangt een grafiek door een rode melding als de selectie onder de drempel valt. */
const odinTeKlein = (canvasId, wat) => {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const p = document.createElement("p");
  p.style.cssText = "padding:18px;color:var(--rood);font-weight:700";
  p.textContent = `Te weinig waarnemingen voor ${wat} in dit gebied ` +
    `(drempel: ${(typeof ODINW !== "undefined" && ODINW.drempel && ODINW.drempel.nMin) || 20}` +
    " waarnemingen). Deze cijfers zijn niet betrouwbaar en worden daarom niet getoond.";
  c.replaceWith(p);
};

/* De niveaubadge van een grafiek zegt welke meetniveaus er in beeld staan. Bij de
   ODiN-grafieken hangt dat sinds #109 af van de keuze in de balk, dus de badge ook: een vaste
   "wijk · gemeente · provincie" klopte niet meer zodra de gemeente uitstond. */
function zetNiveauBadge(onderwerp, niveaus) {
  const el = document.querySelector(`[data-onderwerp="${onderwerp}"] .status.niveau`);
  if (el) el.textContent = [...new Set(niveaus)].join(" · ");
}

veilig("grafiek-modal", () => {
/* ---------- modal split op drie niveaus: wijk & gemeente (ODiN-microdata) + provincie (StatLine) ---------- */
let eigenReeks = null, rdamReeks = null, zhReeks = null;
const bronnen = [];
const naarShares = lijst => {
  const uit = Object.fromEntries(VERVOERWIJZEN.map(w => [w, 0]));
  lijst.forEach(r => { uit[kanonVervoerwijze(r.label)] += r.share; });
  return VERVOERWIJZEN.map(w => Math.round(uit[w] * 10) / 10 || null);
};
if (typeof ODINW !== "undefined" && ODINW.modalSplit) {
  eigenReeks = {label:`${GEBIEDNAAM} — ${GEBIEDNIVEAU} (n=${ODINW.n.verplaatsingen})`, kleur:GEEL,
                data:naarShares(odinZichtbaar(ODINW.modalSplit.wijk))};
  rdamReeks = {label:`Rotterdam — gemeente (n=${ODINW.modalSplit.nRotterdam.toLocaleString("nl-NL")})`,
                kleur:SCHIE, data:naarShares(odinZichtbaar(ODINW.modalSplit.rotterdam))};
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
    zhReeks = {label:`Zuid-Holland — provincie (${jaar}, ${ms.jaren[jaar].status.toLowerCase()})`,
                  kleur:GRIJS, data:naarShares(lijst)};
    bronnen.push(ms.bron);
  }
}
if (!eigenReeks && !zhReeks) return;
/* Referentiegebieden als extra reeks. Hun ODiN-verdeling gaat door dezelfde canonisering als
   de eigen reeks: in de microdata heet het "Personenauto - bestuurder" en in de grafiek
   "Auto", en twee reeksen die verschillend zijn gegroepeerd vergelijken niets. De drempel van
   20 waarnemingen (#13) geldt ook hier — een categorie eronder valt weg in plaats van als
   dunne balk mee te doen. */
const refModal = () => refActief().filter(r => r.code !== GEMEENTECODE).map(r => {
  const rijen = ((REF[r.code] || {}).odin || {}).modalSplit;
  if (!Array.isArray(rijen)) return null;
  const drempel = (ODINW.drempel && ODINW.drempel.nMin) || 20;
  const bruikbaar = rijen.filter(x =>
    !x.onderdrukt && !(typeof x.n === "number" && x.n < drempel));
  if (!bruikbaar.length) return null;
  return {label:`${r.naam} — ${r.niveau}`, kleur:refKleurVan(r), data:naarShares(bruikbaar)};
}).filter(Boolean);
const modalDataset = r => ({
  label:r.label, data:r.data, backgroundColor:r.kleur,
  borderColor:ASFALT, borderWidth:1, maxBarThickness:13});
/* Zuid-Holland staat niet in de balk — het is geen gebied uit de gebiedsboom maar een andere
   bron (StatLine, eigen methode en jaargang). Daarom een eigen vinkje bij deze grafiek,
   standaard uit, zodat "wat in de balk staat, staat in de grafiek" ook hier geldt (#109). */
const sub = document.getElementById("modalSub");
let zhVinkje = null;
if (zhReeks && sub) {
  const l = document.createElement("label");
  l.style.cssText = "display:block;margin-top:4px;cursor:pointer";
  l.innerHTML = '<input type="checkbox" data-modal-zh> Ook Zuid-Holland tonen ' +
    '<span style="color:var(--asfalt-zacht)">(CBS StatLine: andere bron en methode dan ODiN)</span>';
  sub.after(l);
  zhVinkje = l.querySelector("input");
}
const zichtbareReeksen = () => [
  ...(eigenReeks ? [eigenReeks] : []),
  ...(rdamReeks && gemeenteReeksAan() ? [rdamReeks] : []),
  ...(zhReeks && zhVinkje && zhVinkje.checked ? [zhReeks] : []),
  ...(eigenReeks ? refModal() : []),
];
const gModal = new Chart(chModal, {type:"bar",
  data:{labels:VERVOERWIJZEN, datasets:zichtbareReeksen().map(modalDataset)},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label.split(" (")[0]}: ${nl(c.parsed.x)}% van de verplaatsingen`}}},
    scales:{x:{grid:gridOpt, beginAtZero:true, title:{display:true,text:"% van de verplaatsingen"}}, y:{grid:{display:false}}}}});
const tekenModal = () => {
  gModal.data.datasets = zichtbareReeksen().map(modalDataset);
  gModal.update();
  zetNiveauBadge("grafiek-modal", [GEBIEDNIVEAU,
    ...(rdamReeks && gemeenteReeksAan() ? ["gemeente"] : []),
    ...refActief().filter(r => r.code !== GEMEENTECODE).map(r => r.niveau),
    ...(zhVinkje && zhVinkje.checked ? ["provincie"] : [])]);
};
bijRefWijziging("modal-split", tekenModal);
if (zhVinkje) zhVinkje.addEventListener("change", tekenModal);
/* De modal split gaat door naarShares(), dus refDrempelTekst() (die op labels uitlijnt) past
   hier niet; wat er onder de drempel viel staat al in de voetnoot van de eigen reeks via
   odinOnderdruktTekst(). */
if (sub) sub.textContent = "Aandeel verplaatsingen per hoofdvervoerwijze. De vergelijking volgt " +
  "de keuze in de balk bovenaan.";
const foot = document.getElementById("modalFoot");
if (foot) {
  const weg = typeof ODINW !== "undefined" && ODINW.modalSplit
    ? odinOnderdruktTekst(ODINW.modalSplit.wijk) : "";
  foot.innerHTML = "Bronnen: " + bronnen.join(" · ") +
    (typeof ODINW !== "undefined" ? ". " + ODINW.caveat : "") +
    (weg ? `<br><b style="color:var(--rood)">${weg.trim()}</b>` : "");
}
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
    /* De verantwoordingsregel uit _verdeling() is geen vervoerwijze maar een mededeling over
       wat er mist; die hoort niet in de stapel. Een onbekend label negeren we ook: schrijven
       naar uit[onbekend] gooide voorheen de hele grafiek om. */
    (r.modes || []).forEach(m => {
      if (m.onderdrukt) return;
      const groep = naarGroep(m.label);
      if (uit[groep]) uit[groep][i] = m.share;
    });
  });
  return uit;
};
const wijkS = shares(AM.wijk), rdamS = shares(AM.rotterdam);
const dataset = (groep, stack, data, vaag) => ({
  label:(vaag ? "_" : "") + groep, stack, data,
  backgroundColor:KLEUR_GROEP[groep] + (vaag ? "80" : ""),
  borderColor:ASFALT, borderWidth:.5, maxBarThickness:22});
const gAfstand = new Chart(el, {type:"bar",
  data:{labels:AM.banden, datasets:[
    ...GROEPEN.map(g => dataset(g, "wijk", wijkS[g], false)),
    ...GROEPEN.map(g => dataset(g, "rdam", rdamS[g], true))
  ]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{
      legend:{position:"bottom", labels:{filter:i => !i.text.startsWith("_")}},
      tooltip:{callbacks:{label:c => {
        const groep = c.dataset.label.replace(/^_/, "");
        const bron = c.dataset.stack === "wijk" ? "gebied" : GEMEENTENAAM;
        const rij = (c.dataset.stack === "wijk" ? AM.wijk : AM.rotterdam)[c.dataIndex];
        return ` ${groep} (${bron}): ${nl(c.parsed.x)}% — n band=${rij.n}`;
      }}}
    },
    scales:{x:{stacked:true, max:100, grid:gridOpt,
               title:{display:true, text:"% van de verplaatsingen in de afstandsband"}},
            y:{stacked:true, grid:{display:false}}}}});
/* De Rotterdam-stapel volgt de balk, net als de andere ODiN-grafieken (#109). Andere
   vergelijkingsgebieden kan deze grafiek niet tonen: de afstandsverdeling staat niet in de
   referentielaag. Dat staat er dan bij, in plaats van dat een gekozen rayon stil ontbreekt. */
const onderdrukte = AM.wijk.filter(r => r.onderdrukt).map(r => r.band);
bijRefWijziging("odin-afstand", () => {
  const rdamAan = gemeenteReeksAan();
  gAfstand.data.datasets.forEach(d => { if (d.stack === "rdam") d.hidden = !rdamAan; });
  gAfstand.update();
  const anderen = refActief().filter(r => r.code !== GEMEENTECODE).map(r => r.naam);
  let sub = rdamAan
    ? "Per afstandsband twee gestapelde balken: bovenste = bewoners van het gebied (vol), " +
      "onderste = alle Rotterdammers (doorzichtig). Percentages tellen per balk op tot 100."
    : "Per afstandsband de verdeling over vervoerwijzen voor bewoners van het gebied; " +
      "percentages tellen per balk op tot 100.";
  if (onderdrukte.length) sub += ` Banden met te weinig waarnemingen zijn weggelaten: ${onderdrukte.join(", ")}.`;
  if (anderen.length) sub += ` Voor ${anderen.join(", ")} is deze verdeling niet beschikbaar; ` +
    "alleen Rotterdam kan hier ernaast.";
  document.getElementById("afstandSub").textContent = sub;
  zetNiveauBadge("odin-afstand", [GEBIEDNIVEAU, ...(rdamAan ? ["gemeente"] : [])]);
});
document.getElementById("afstandFoot").textContent =
  "Bron: " + ODINW.bron + " · niveau: " + ODINW.niveau + ". " + AM.caveat + " " + ODINW.caveat;
});

veilig("odin-caveat", () => {
/* representativiteitsblok bovenaan de ODiN-sectie */
if (typeof ODINW === "undefined") return;
const el = document.getElementById("odinCaveat");
if (!el) return;
/* Geen ODiN-uitkomst voor dit gebied — te klein voor een PC4-benadering, of te weinig
   respondenten. Dat is een uitkomst van de afbakening, geen storing, en het hoort hier te
   staan in plaats van dat de sectie stilzwijgend leeg blijft (#38). */
if (ODINW.leeg) {
  el.innerHTML = `<b style="color:var(--rood)">Geen verplaatsingscijfers voor ` +
    `${GEBIEDNAAM}.</b> ${ODINW.caveat}`;
  document.querySelectorAll("#s5c .chart-box").forEach(b => b.remove());
  return;
}
const drempel = ODINW.drempel || {};
/* Overzicht van wat de drempel in dit gebied wegneemt. Niet als voetnoot onderaan maar
   bovenaan de sectie: wie de grafieken leest moet weten dat de aandelen niet op 100%
   sluiten. */
const blokken = [
  ["modal split", ODINW.modalSplit && ODINW.modalSplit.wijk],
  ["motieven", ODINW.motieven && ODINW.motieven.wijk],
  ["dagdelen", ODINW.dagdelen && ODINW.dagdelen.wijk],
];
const leeg = blokken.filter(([, l]) => Array.isArray(l) && !l.length).map(([n]) => n);
const deels = blokken
  .filter(([, l]) => Array.isArray(l) && l.some(r => r.onderdrukt))
  .map(([n, l]) => {
    const o = l.filter(r => r.onderdrukt);
    /* Een dagdeel onder de drempel (#87) is leeg, ook zijn aandeel: dan het label noemen. */
    const leegLabels = o.filter(r => r.share == null).map(r => r.label).filter(Boolean);
    if (leegLabels.length) return `${n} (${leegLabels.join(", ")})`;
    const r = o[0];
    return `${n} (${r.categorieen} categorie${r.categorieen === 1 ? "" : "ën"}, ${r.share}%)`;
  });
let waarschuwing = "";
if (leeg.length) {
  waarschuwing += `<br><b style="color:var(--rood)">Let op: te weinig waarnemingen voor ` +
    `${leeg.join(", ")} — deze cijfers zijn niet betrouwbaar en worden niet getoond.</b>`;
}
if (deels.length) {
  waarschuwing += `<br><b style="color:var(--rood)">Let op: categorieën met minder dan ` +
    `${drempel.nMin ?? 20} waarnemingen zijn weggelaten bij ${deels.join(", ")}. ` +
    "De getoonde aandelen sluiten daarom niet op 100%.</b>";
}
/* Eerst de korte, vaste boodschap en dan pas de verantwoording (#97). Het blok stond al
   bovenaan, maar begon met de telling en de pooling; wie alleen de eerste regel leest, moet
   al weten dat dit een steekproef is en geen registratie. */
el.innerHTML = `<b>Indicatief — steekproefcijfers.</b> ODiN is een landelijke enquête onder ` +
  `een steekproef van Nederlanders en is niet ontworpen voor uitspraken op ` +
  `${GEBIEDNIVEAU}niveau. Hoe kleiner het aantal waarnemingen, hoe groter de marge: kleine ` +
  "verschillen met een vergelijkingsgebied kunnen toeval zijn. Elke grafiek met ODiN-cijfers " +
  "draagt daarom het label <span class=\"status odin\">ODiN · steekproef</span> met het " +
  "aantal waarnemingen erbij.<br><b>Representativiteit:</b> " + ODINW.caveat +
  ` Niveau: ${ODINW.niveau}. Steekproef in dit gebied: ` +
  `${ODINW.n.personen.toLocaleString("nl-NL")} personen, ` +
  `${ODINW.n.verplaatsingen.toLocaleString("nl-NL")} verplaatsingen.` +
  (drempel.toelichting ? " " + drempel.toelichting : "") + waarschuwing;
});


veilig("odin-motieven", () => {
/* ---------- waarom: motieven wijk vs gemeente (ODiN-microdata) ---------- */
if (typeof ODINW === "undefined" || ODINW.leeg) return;
const mWijk = odinZichtbaar(ODINW.motieven.wijk);
if (!mWijk.length) { odinTeKlein("chMotief", "reismotieven"); return; }
const labels = mWijk.map(r => r.label);
const rdam = Object.fromEntries(odinZichtbaar(ODINW.motieven.rotterdam)
  .map(r => [r.label, r.share]));
const eigenReeksen = () => [
  {label:GEBIEDLABEL, data:labels.map(l =>
     (mWijk.find(r => r.label === l) || {}).share ?? null),
   backgroundColor:GEEL, borderColor:ASFALT, borderWidth:1, maxBarThickness:14},
  ...(gemeenteReeksAan() ? [{label:GEMEENTENAAM + " (gemeente)", data:labels.map(l => rdam[l] ?? null),
   backgroundColor:SCHIE, borderColor:ASFALT, borderWidth:1, maxBarThickness:14}] : []),
];
const gMotief = new Chart(chMotief, {type:"bar",
  data:{labels, datasets:eigenReeksen()},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${nl(c.parsed.x)}%`}}},
    scales:{x:{grid:gridOpt, beginAtZero:true, title:{display:true,text:"% van de verplaatsingen"}}, y:{grid:{display:false}}}}});
/* De gemeentereeks komt uit dezelfde ODiN-uitdraai als de eigen reeks, maar staat er alleen
   als de gemeente in de balk aanstaat (#109). De andere referenties komen ernaast, met
   dezelfde drempel van 20 waarnemingen als de eigen reeks (#13). */
const motiefFoot = document.getElementById("motiefFoot");
const motiefBasis = motiefFoot ? motiefFoot.textContent : "";
bijRefWijziging("motieven", () => {
  const refs = refDatasets("odin.motieven", labels, {maxBarThickness:9, zonder:[GEMEENTECODE]});
  gMotief.data.datasets = [...eigenReeksen(), ...refs];
  gMotief.update();
  zetNiveauBadge("odin-motieven", [GEBIEDNIVEAU, ...(gemeenteReeksAan() ? ["gemeente"] : []),
    ...refReeksen("odin.motieven", labels, {zonder:[GEMEENTECODE]}).map(r => r.niveau)]);
  /* Wat er uit een referentiereeks is weggelaten hoort onder de grafiek, niet in de console:
     anders sluiten de aandelen van een peer stil niet op 100%. */
  if (motiefFoot) {
    motiefFoot.textContent = motiefBasis +
      refDrempelTekst("odin.motieven", labels, {zonder:[GEMEENTECODE]});
  }
});
});

veilig("odin-bestemmingen", () => {
/* ---------- waarheen: daily urban system (stroomkaart + aandelen) ----------
   #151: de pijlen laten de omvang zien. Dikte ∝ √(verplaatsingen per dag), zodat een stroom van
   100.000 niet alles wegdrukt en een van 2.000 nog zichtbaar is; kleur in vier klassen van één
   tint (#30: geen rood/groen), zodat ook wie dikte slecht onderscheidt de volgorde ziet.
   Het verkeer dat binnen het gebied blijft, is meestal verreweg de grootste stroom en stond eerst
   alleen als tegel onder de kaart. Nu staat het óp de kaart: een cirkel rond de herkomst, en de
   stromen tussen de delen van het gebied (wijken van een rayon, PC4-gebieden van een wijk).
   Een stroom van een deel naar zichzelf is een ring.

   De pijlen worden in schermpixels berekend en bij elke zoomstap opnieuw getekend: een boog in
   graden wordt bij een andere zoom een andere boog, en een pijlpunt in graden groeit mee. */
if (typeof ODINW === "undefined" || ODINW.leeg || typeof L === "undefined") return;
const el = document.getElementById("kaartBestemming");
if (!el) return;
const B = ODINW.bestemmingen;
const NMIN = ODINW.drempel?.nMin ?? 20;
const [hlat, hlon] = ODINW.herkomstCentroid;
const k = L.map("kaartBestemming", {scrollWheelZoom:false}).setView([hlat, hlon], 11);
basiskaart().addTo(k);
if (typeof GEO !== "undefined")
  L.geoJSON({type:"FeatureCollection", features:GEO.features},
    {style:{color:ASFALT, weight:1.2, fill:false, dashArray:"4 3"}, interactive:false}).addTo(k);

const TINTEN = ["#B9D0DE", "#7FA8C2", "#4A7F9F", "#1F4F6B"];   // één tint, licht → donker
const heel = v => Math.round(v).toLocaleString("nl-NL");
const perDag = v => `${heel(v)} per dag`;

/* Twee lezingen: waar bewoners heen gaan, of waar bezoekers vandaan komen. Die tweede alleen
   als de pipeline coördinaten meegeeft (data van vóór #151 heeft ze niet). */
const heen = [
  ...B.topWijkenBinnenGemeente.map(b => ({...b, soort: "gemeente"})),
  ...B.topGemeentenBuiten.map(b => ({...b, soort: "buiten"})),
].filter(b => b.lat != null);
/* De eigen gemeente niet als één pijl: haar zwaartepunt ligt in de haven. Uit de eigen
   gemeente per herkomstwijk; die heeft de pipeline apart (topHerkomstWijken). */
const eigenGem = GEMEENTENAAM;
const bezoek = [
  ...(ODINW.bezoekers?.topHerkomstWijken || []),
  ...(ODINW.bezoekers?.topHerkomst || []).filter(b => b.gemeente !== eigenGem)
    .map(b => ({...b, naam: b.gemeente})),
].filter(b => b.lat != null && b.vpd != null);
const intern = B.intern || null;

let modus = "heen";
const laag = L.layerGroup().addTo(k);

/* Klassengrenzen op de verplaatsingen per dag van wat nu getekend wordt: kwartielen, afgerond
   op een leesbaar getal. Zo blijven de klassen bruikbaar van Hoek van Holland tot de gemeente. */
function klassen(waarden) {
  const s = [...waarden].sort((a, b) => a - b);
  if (!s.length) return [];
  const rond = v => { const m = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1); return Math.round(v / m) * m; };
  return [.25, .5, .75].map(q => rond(s[Math.min(s.length - 1, Math.floor(q * s.length))]));
}
const klasseVan = (v, grenzen) => grenzen.filter(g => v >= g).length;

/* Kwadratische boog van a naar b in pixels, uitbuigend naar rechts, plus de pijlpunt. */
function boog(a, b, buig = .18) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const c = L.point((a.x + b.x) / 2 - dy * buig, (a.y + b.y) / 2 + dx * buig);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    pts.push(L.point(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y));
  }
  return {pts, len};
}
function pijl(van, naar, dikte, kleur, popup, {buig = .18, inkorten = 6} = {}) {
  const a = k.latLngToLayerPoint(van), b = k.latLngToLayerPoint(naar);
  const {pts, len} = boog(a, b, buig);
  if (len < 4) return;
  /* Laat de lijn iets vóór het doel stoppen, zodat de punt op de stip valt en niet erachter. */
  /* Pijlpunt meeschalen met de dikte, maar nooit meer dan een derde van de pijl: bij een korte
     stroom (naar de buurwijk) werd de punt anders groter dan de lijn. */
  const kop = Math.min(Math.max(7, dikte * 2.2), len * .35);
  dikte = Math.min(dikte, kop * .8);
  const eind = pts[pts.length - 1], voor = pts[pts.length - 3];
  const ang = Math.atan2(eind.y - voor.y, eind.x - voor.x);
  const punt = L.point(eind.x - Math.cos(ang) * inkorten, eind.y - Math.sin(ang) * inkorten);
  const basis = L.point(punt.x - Math.cos(ang) * kop, punt.y - Math.sin(ang) * kop);
  const lijn = pts.slice(0, -2).concat([basis]).map(p => k.layerPointToLatLng(p));
  L.polyline(lijn, {color:kleur, weight:dikte, opacity:.85, lineCap:"butt"})
    .bindPopup(popup).addTo(laag);
  const zij = kop * .62;
  const drie = [punt,
    L.point(basis.x + Math.sin(ang) * zij, basis.y - Math.cos(ang) * zij),
    L.point(basis.x - Math.sin(ang) * zij, basis.y + Math.cos(ang) * zij)];
  L.polygon(drie.map(p => k.layerPointToLatLng(p)),
    {color:kleur, weight:1, fillColor:kleur, fillOpacity:.95}).bindPopup(popup).addTo(laag);
}

function teken() {
  laag.clearLayers();
  const stromen = modus === "heen" ? heen : bezoek;
  const binnen = modus === "heen" && intern ? intern.stromen : [];
  const alleVpd = [...stromen, ...binnen].map(s => s.vpd).filter(v => v > 0);
  const max = Math.max(1, ...alleVpd);
  const dikte = v => 1.5 + 13 * Math.sqrt(v / max);
  const grenzen = klassen(alleVpd);
  const kleur = v => TINTEN[klasseVan(v, grenzen)];

  /* intern: eerst, zodat de stromen naar buiten erbovenop liggen */
  if (modus === "heen" && intern) {
    const eigenDeel = B.delen.binnenWijk;
    if (eigenDeel?.share != null) {
      L.circleMarker([hlat, hlon], {radius: 10 + 34 * Math.sqrt(eigenDeel.share / 100),
        color:GEEL, weight:2, fillColor:GEEL, fillOpacity:.18, interactive:false}).addTo(laag);
    }
    for (const s of binnen) {
      const pop = `<b>${s.van === s.naar ? `binnen ${s.van}` : `${s.van} → ${s.naar}`}</b><br>` +
        `${perDag(s.vpd)} · ${nl(s.share)}% van de verplaatsingen van bewoners (n=${s.n})`;
      if (s.van === s.naar) {
        L.circleMarker(s.vanLatLon, {radius: 4 + 9 * Math.sqrt(s.vpd / max), color:kleur(s.vpd),
          weight: Math.max(2, dikte(s.vpd) * .6), fill:false}).bindPopup(pop).addTo(laag);
      } else {
        pijl(s.vanLatLon, s.naarLatLon, dikte(s.vpd) * .8, kleur(s.vpd), pop, {buig:.25, inkorten:4});
      }
    }
  }
  for (const s of stromen) {
    const pop = modus === "heen"
      ? `<b>${s.naam}</b><br>${perDag(s.vpd)} · ${nl(s.share)}% van de verplaatsingen van ` +
        `bewoners (n=${s.n})`
      : `<b>uit ${s.naam}</b><br>${perDag(s.vpd)} · ${nl(s.share)}% van de bezoekers (n=${s.n})`;
    const [van, naar] = modus === "heen" ? [[hlat, hlon], [s.lat, s.lon]] : [[s.lat, s.lon], [hlat, hlon]];
    pijl(van, naar, dikte(s.vpd), kleur(s.vpd), pop);
    L.circleMarker([s.lat, s.lon], {radius:4, color:"#FAFAF5", weight:1, fillColor:ASFALT,
      fillOpacity:.9}).bindPopup(pop).addTo(laag);
  }
  L.circleMarker([hlat, hlon], {radius:7, color:ASFALT, weight:2, fillColor:GEEL, fillOpacity:1})
    .bindPopup(`<b>${GEBIEDNAAM}</b>` + (B.delen.binnenWijk?.share != null && modus === "heen"
      ? `<br>${nl(B.delen.binnenWijk.share)}% blijft binnen het gebied` +
        (intern ? ` (${perDag(intern.vpd)})` : "") : "")).addTo(laag);
  legenda(grenzen, max, dikte, stromen.length + binnen.length);
}

function legenda(grenzen, max, dikte, aantal) {
  const box = document.getElementById("bestemmingLegenda");
  if (!box) return;
  if (!aantal) {
    box.innerHTML = `<b style="color:var(--rood)">Geen enkele ${modus === "heen" ? "bestemming" : "herkomst"} ` +
      `heeft ${NMIN} of meer waarnemingen; er is dus geen stroom te tekenen.</b>`;
    return;
  }
  const van = [0, ...grenzen], tot = [...grenzen, null];
  const stukken = TINTEN.slice(0, grenzen.length + 1).map((t, i) => {
    const midden = tot[i] == null ? max : (van[i] + tot[i]) / 2;
    return `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px">` +
      `<span style="display:inline-block;width:26px;height:${Math.max(2, Math.round(dikte(midden)))}px;` +
      `background:${t}"></span>${tot[i] == null ? `${heel(van[i])} of meer` : `${heel(van[i])}–${heel(tot[i])}`}</span>`;
  }).join("");
  const onder = modus === "heen" ? (B.onderDrempel || {}) : {};
  const nOnder = (onder.buitenGemeente || 0) + (onder.binnenGemeente || 0) + (intern?.onderDrempel || 0);
  box.innerHTML = `<b>Verplaatsingen per dag</b> (gewogen, gemiddelde dag): ${stukken}` +
    (modus === "heen" && intern
      ? `<br><span style="display:inline-block;width:14px;height:14px;border-radius:50%;` +
        `border:2px solid ${GEEL};background:${GEEL}2E;vertical-align:-3px"></span> ` +
        `verkeer dat binnen ${GEBIEDNAAM} blijft; ringen en korte pijlen zijn de stromen ` +
        `binnen het gebied (per ${intern.eenheid === "wijk" ? "wijk" : "postcodegebied (PC4)"}).`
      : "") +
    (nOnder ? `<br>${heel(nOnder)} stromen met minder dan ${NMIN} waarnemingen zijn niet getekend (#13).` : "");
}

/* Schakelaar uitgaand/inkomend, alleen als er iets inkomends te tekenen valt. */
const kop = el.parentElement.querySelector(".sub");
if (bezoek.length && kop) {
  const knoppen = document.createElement("div");
  knoppen.className = "knoppenrij";
  knoppen.style.cssText = "display:flex;gap:6px;margin:6px 0 8px;flex-wrap:wrap";
  [["heen", "Waar gaan bewoners heen"], ["bezoek", "Waar komen bezoekers vandaan"]].forEach(([m, t]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t; b.className = "keuzeknop";
    b.style.cssText = "font:inherit;font-size:12.5px;padding:4px 10px;cursor:pointer;" +
      "border:1px solid var(--asfalt);background:var(--wit);color:var(--asfalt)";
    const zet = () => knoppen.querySelectorAll("button").forEach(x => {
      const aan = x === b ? m === modus : x.dataset.m === modus;
      x.setAttribute("aria-pressed", String(aan));
      x.style.background = aan ? "var(--asfalt)" : "var(--wit)";
      x.style.color = aan ? "var(--wit)" : "var(--asfalt)";
    });
    b.dataset.m = m;
    b.addEventListener("click", () => { modus = m; zet(); passend(); teken(); });
    knoppen.appendChild(b);
    setTimeout(zet, 0);
  });
  kop.after(knoppen);
}

/* Passend maken op wat getekend wordt, maar nooit dichter dan zoom 13: zonder bestemmingen
   boven de drempel is er alleen de herkomst, en dan zoomde de kaart in tot straatniveau
   (rooktest, Hoek van Holland).
   Per lezing apart: de herkomst van bezoekers ligt vaak verder weg dan de bestemmingen van
   bewoners, en samen passend maken drukte het interne verkeer tot een stip. */
function passend() {
  const punten = [[hlat, hlon], ...(modus === "heen"
    ? [...heen.map(b => [b.lat, b.lon]), ...(intern?.stromen || []).flatMap(s => [s.vanLatLon, s.naarLatLon])]
    : bezoek.map(b => [b.lat, b.lon]))];
  k.fitBounds(L.latLngBounds(punten).pad(.15), {maxZoom:13, animate:false});
}
k.on("zoomend", teken);
passend();
teken();
setTimeout(() => { k.invalidateSize(); passend(); teken(); }, 0);

const d = ODINW.bestemmingen.delen;
/* Een deel onder de drempel (#87) heeft geen aandeel en geen n; "nvt" is de gemeente, waar
   "elders in de gemeente" niet bestaat. Geen van beide als 0% tonen. */
const deelWaarde = x => x.nvt ? "n.v.t." : x.share == null ? "–" : `${nl(x.share)}%`;
const deelVoet = x => x.nvt ? "geen categorie op dit niveau"
  : x.share == null ? `te weinig waarnemingen (&lt;${ODINW.drempel?.nMin ?? 20})` : `n=${x.n}`;
const strip = document.getElementById("bestemmingStrip");
if (strip) strip.innerHTML =
  tegelHtml(deelWaarde(d.binnenWijk), "van de verplaatsingen blijft binnen de wijk",
    deelVoet(d.binnenWijk), "odin-bestemmingen/binnen-wijk") +
  tegelHtml(deelWaarde(d.binnenGemeente), "gaat naar elders in de gemeente",
    deelVoet(d.binnenGemeente), "odin-bestemmingen/binnen-gemeente") +
  tegelHtml(deelWaarde(d.buitenGemeente),
    `gaat de gemeente uit — verspreid over ${ODINW.bestemmingen.aantalGemeentenBuiten} ` +
    /* De drempel uit de data en niet als getal in de tekst: hier stond "≥10" terwijl de
       pipeline 20 hanteert (#127). En alleen "geen enkele" als dat zo is — een rayon noemt er
       wel een paar, en toen stond er toch dat er geen enkele was. */
    "gemeenten" + (ODINW.bestemmingen.topGemeentenBuiten.length
      ? ` (op de kaart: de ${ODINW.bestemmingen.topGemeentenBuiten.length} met ` +
        `≥${ODINW.drempel?.nMin ?? 20} waarnemingen)`
      : `, geen enkele met ≥${ODINW.drempel?.nMin ?? 20} waarnemingen`),
    deelVoet(d.buitenGemeente), "odin-bestemmingen/buiten-gemeente") +
  tegelHtml(`${ODINW.gemAfstandKm.wijk.toLocaleString("nl-NL")} km`,
    `gem. afstand per verplaatsing (Rotterdam: ${ODINW.gemAfstandKm.rotterdam.toLocaleString("nl-NL")} km)`,
    "gewogen", "odin-bestemmingen/gem-afstand");
const foot = document.getElementById("bestemmingFoot");
if (foot) foot.textContent = "Bron: " + ODINW.bron + " · niveau: " + ODINW.niveau + ". " + ODINW.caveat;
});

veilig("odin-dagdelen", () => {
/* ---------- wanneer: vertrektijden per dagdeel ---------- */
if (typeof ODINW === "undefined" || ODINW.leeg) return;
const labels = odinZichtbaar(ODINW.dagdelen.wijk).map(r => r.label);
const rdam = Object.fromEntries(odinZichtbaar(ODINW.dagdelen.rotterdam).map(r => [r.label, r.share]));
const eigenReeksen = () => [
  {label:GEBIEDLABEL, data:labels.map(l =>
     (ODINW.dagdelen.wijk.find(r => r.label === l) || {}).share ?? null),
   backgroundColor:GEEL, borderColor:ASFALT, borderWidth:1, maxBarThickness:44},
  ...(gemeenteReeksAan() ? [{label:GEMEENTENAAM + " (gemeente)", data:labels.map(l => rdam[l] ?? null),
   backgroundColor:SCHIE, borderColor:ASFALT, borderWidth:1, maxBarThickness:44}] : []),
];
const gDagdeel = new Chart(chDagdeel, {type:"bar",
  data:{labels, datasets:eigenReeksen()},
  options:{maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${nl(c.parsed.y)}%`}}},
    scales:{y:{grid:gridOpt, beginAtZero:true, ticks:{callback:v=>v+"%"}}, x:{grid:{display:false}}}}});
bijRefWijziging("dagdelen", () => {
  gDagdeel.data.datasets = [...eigenReeksen(),
    ...refDatasets("odin.dagdelen", labels, {maxBarThickness:22, zonder:[GEMEENTECODE]})];
  gDagdeel.update();
  zetNiveauBadge("odin-dagdelen", [GEBIEDNIVEAU, ...(gemeenteReeksAan() ? ["gemeente"] : []),
    ...refReeksen("odin.dagdelen", labels, {zonder:[GEMEENTECODE]}).map(r => r.niveau)]);
});
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
  tegelHtml(b.n,
    "verplaatsingen van niet-bewoners mét bestemming in de wijk (steekproef)",
    "ODiN gepoold", "odin-bezoekers/aantal") +
  /* Sleutel uit het motieflabel en niet uit de positie: de top-3 staat per gebied in een
     andere volgorde, en dan zou opmerking nummer twee van gebied tot gebied verspringen. */
  topM.map(m => tegelHtml(`${nl(m.share)}%`, `motief: ${m.label.toLowerCase()}`, `n=${m.n}`,
    `odin-bezoekers/motief-${sleutelbaar(m.label)}`)).join("") +
  (herkomst.length
    ? tegelHtml(`${nl(herkomst[0].share)}%`,
        `komt uit ${herkomst[0].gemeente}` +
        (herkomst.length > 1 ? `; daarna ${herkomst.slice(1).map(h =>
          `${h.gemeente} (${nl(h.share)}%)`).join(", ")}` : ""),
        `n=${herkomst.map(h => h.n).join("/")}`, "odin-bezoekers/herkomst")
    : "");
});

veilig("voorz-vergelijk", () => {
/* ---------- voorzieningen per 1.000 inwoners: wijk vs gemeente ---------- */
if (typeof VOORZ === "undefined" || !VOORZ.vergelijk) return;
const cats = Object.keys(VOORZ.categorieen);
const v = VOORZ.vergelijk.perCategorie;
new Chart(chVoorz, {type:"bar",
  data:{labels:cats.map(c => VOORZ.categorieen[c]), datasets:[
    {label:GEBIEDLABEL, data:cats.map(c => v[c].wijkPer1000),
     backgroundColor:GEEL, borderColor:ASFALT, borderWidth:1, maxBarThickness:16},
    {label:GEMEENTENAAM + " (gemeente)", data:cats.map(c => v[c].gemeentePer1000),
     backgroundColor:SCHIE, borderColor:ASFALT, borderWidth:1, maxBarThickness:16}
  ]},
  options:{indexAxis:"y", maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>{
        const cat = cats[c.dataIndex];
        const abs = c.datasetIndex === 0 ? v[cat].wijkAantal : v[cat].gemeenteAantal;
        return ` ${c.dataset.label}: ${nl(c.parsed.x)} per 1.000 inwoners (${abs.toLocaleString("nl-NL")} locaties)`;
      }}}},
    scales:{x:{grid:gridOpt, beginAtZero:true, title:{display:true,text:"locaties per 1.000 inwoners"}}, y:{grid:{display:false}}}}});
const foot = document.getElementById("voorzVergelijkFoot");
if (foot) foot.textContent = "Bron: " + VOORZ.vergelijk.bron + ". " + VOORZ.vergelijk.caveat;
});

veilig("infra-strip", () => {
/* ---------- infrastructuur-kerncijfers (OSM via OSMnx, js/infra.js) ---------- */
if (typeof INFRA === "undefined") return;
const strip = document.getElementById("infraStrip");
if (!strip) return;
const heeftSnelweg = (INFRA.barriereRefs || []).length > 0;
const refs = (INFRA.barriereRefs || []).join("/") || "snelweg";
const o = INFRA.omrijfactor;
/* Een gebied zonder snelweg — Rotterdam Centrum, Noord, Delfshaven — heeft geen omrijfactor:
   die maat ís het effect van de barrière. Dan die twee tegels weglaten in plaats van een
   streepje tonen, want een streepje leest als "onbekend" en dit is "niet van toepassing". */
const tegel = (num, lbl, src, sleutel) =>
  tegelHtml(num, lbl, src, `infra-strip/${sleutel}`);
let cellen =
  tegel(`${INFRA.kmVrijliggendFietspad.toLocaleString("nl-NL")} km`,
        `vrijliggend fietspad binnen ${GEBIEDNAAM}`, `OSM ${INFRA.peildatum}`, "fietspad-km") +
  tegel(INFRA.snelwegKruisingenFiets,
        heeftSnelweg ? `fietskruisingen (over/onder) met de ${refs}`
                     : "fietskruisingen met een snelweg — geen snelweg in dit gebied", "OSM",
        "fietskruisingen");
if (o.kruisendSnelweg.mediaan != null) {
  cellen += tegel(`${o.kruisendSnelweg.mediaan.toLocaleString("nl-NL")}×`,
    `mediane omrijfactor fiets, ${refs} kruisend (n=${o.kruisendSnelweg.n})`, "OSM-netwerk",
    "omrijfactor-kruisend") +
    tegel(`${o.zelfdeZijde.mediaan != null ? o.zelfdeZijde.mediaan.toLocaleString("nl-NL") : "—"}×`,
      `idem, zelfde zijde (n=${o.zelfdeZijde.n}) — referentie`, "OSM-netwerk",
      "omrijfactor-zelfde-zijde");
}
strip.innerHTML = cellen;
const foot = document.getElementById("infraFoot");
if (foot) foot.textContent = "Bron: " + INFRA.bron + " · peildatum " + INFRA.peildatum +
  (o.reden
    ? ". " + o.reden.charAt(0).toUpperCase() + o.reden.slice(1) + ". "
    : ". Omrijfactor = netwerkafstand ÷ hemelsbrede afstand, paren " + o.afstandsklasse + ". ") +
  INFRA.caveat;
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
          `<br><i>RIVM/NSL jaargemiddelde ${luchtPeiljaar ?? ""}</i>` +
          normtoets(luchtStof.value.includes("NO2") ? "lucht_no2" : "lucht_pm25", Number(g));
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
/* Nul ongevallen is een uitkomst, geen storing (#38). Dat hoort te staan waar de kaart zou
   komen, in plaats van een sectie die stilzwijgend leeg blijft. */
if (ONGEVALLEN.leeg) {
  const melding = document.createElement("div");
  melding.style.padding = "12px 0";
  melding.innerHTML = `<b style="color:var(--rood)">Geen geregistreerde ongevallen in ` +
    `${GEBIEDNAAM}.</b> ${ONGEVALLEN.caveat}`;
  el.replaceWith(melding);
  return;
}
const kO = L.map("kaartOngeval", {scrollWheelZoom:false});
basiskaart().addTo(kO);
if (typeof GEO !== "undefined"){
  const grens = L.geoJSON({type:"FeatureCollection", features:GEO.features},
    {style:{color:ASFALT, weight:1.2, fill:false, dashArray:"4 3"}}).addTo(kO);
  kO.fitBounds(grens.getBounds().pad(.05));
} else {
  kO.setView([51.946, 4.433], 13);
}

/* opmaak per afloop; UMS staat in de puntweergave standaard aan noch uit via een vaste
   vlag meer — de selectie hieronder bepaalt alles, zodat raster en punten hetzelfde
   filter delen */
const AFLOOP_STIJL = {
  "Uitsluitend materiele schade": {kleur:GRIJS,     r:3.5, label:"uitsluitend materiële schade"},
  "Letsel":                       {kleur:GEEL,      r:6,   label:"letsel"},
  "Dodelijk":                     {kleur:"#B0452F", r:8,   label:"dodelijk"}
};
const stijlVan = a => AFLOOP_STIJL[a] || {kleur:GRIJS, r:4, label:a.toLowerCase()};
const jaren = (ONGEVALLEN.jaren && ONGEVALLEN.jaren.length)
  ? ONGEVALLEN.jaren.slice()
  : [...new Set(ONGEVALLEN.punten.map(p => p.jaar))].sort();
/* Categorieën en aantallen komen uit perJaar, niet uit de puntenlijst: bij een groot gebied
   is die lijst bewust ingekort (zie puntenVolledig) terwijl perJaar altijd compleet is. */
const perJaar = ONGEVALLEN.perJaar || {};
const telAfloop = (a, jaarSet) => Object.keys(perJaar)
  .filter(j => !jaarSet || jaarSet.has(Number(j)))
  .reduce((s, j) => s + (perJaar[j][a] || 0), 0);
const afloopSoorten = Object.keys(AFLOOP_STIJL)
  .concat([...new Set(Object.values(perJaar).flatMap(Object.keys))].filter(a => !AFLOOP_STIJL[a]))
  .filter(a => telAfloop(a) > 0);

/* actieve selectie; beide filters werken op raster én punten */
const actiefJaar = new Set(jaren);
const actiefAfloop = new Set(afloopSoorten);
let weergave = ONGEVALLEN.raster ? "raster" : "punten";

const kiesRij = (container, kop, items, opLabel, opWissel) => {
  if (!container) return;
  container.insertAdjacentHTML("beforeend",
    '<span style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;' +
    `color:var(--asfalt-zacht);margin-right:10px">${kop}</span>`);
  items.forEach(item => {
    const lab = document.createElement("label");
    lab.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin:0 14px 6px 0;font-size:13.5px;cursor:pointer";
    lab.innerHTML = `<input type="checkbox" checked>${opLabel(item)}`;
    lab.querySelector("input").addEventListener("change", e => opWissel(item, e.target.checked));
    container.appendChild(lab);
  });
};

/* ---- periodekiezer ---- */
const telJaar = j => Object.values((ONGEVALLEN.perJaar || {})[String(j)] || {})
  .reduce((a, b) => a + b, 0);
kiesRij(document.getElementById("ongevalPeriode"), "Periode", jaren,
  j => `${j} <span style="color:var(--asfalt-zacht)">(${telJaar(j).toLocaleString("nl-NL")})</span>`,
  (j, aan) => { if (aan) { actiefJaar.add(j); } else { actiefJaar.delete(j); } hertekenKaart(); });

/* ---- afloopkiezer ---- */
kiesRij(document.getElementById("ongevalToggles"), "Afloop", afloopSoorten,
  a => {
    const st = stijlVan(a);
    return `<span style="width:11px;height:11px;border-radius:50%;background:${st.kleur};` +
      `display:inline-block"></span>${st.label} (${telAfloop(a).toLocaleString("nl-NL")})`;
  },
  (a, aan) => { if (aan) { actiefAfloop.add(a); } else { actiefAfloop.delete(a); } hertekenKaart(); });

/* ---- weergavekeuze: hotspotraster of losse punten ---- */
const weergaveBox = document.getElementById("ongevalWeergave");
if (weergaveBox && ONGEVALLEN.raster) {
  weergaveBox.innerHTML =
    '<span class="toggle"><button data-w="raster" class="actief">hotspotraster</button>' +
    '<button data-w="punten">losse punten</button></span>';
  weergaveBox.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => {
      weergave = b.dataset.w;
      weergaveBox.querySelectorAll("button").forEach(x => x.classList.toggle("actief", x === b));
      hertekenKaart();
    }));
}

const laagGroep = L.layerGroup().addTo(kO);
const legenda = document.getElementById("ongevalLegenda");

/* celtelling volgens de actieve jaar- en afloopselectie */
const celTelling = cel => {
  let n = 0;
  for (const jaar of Object.keys(cel.perJaar || {})) {
    if (!actiefJaar.has(Number(jaar))) continue;
    for (const [afloop, aantal] of Object.entries(cel.perJaar[jaar])) {
      if (actiefAfloop.has(afloop)) n += aantal;
    }
  }
  return n;
};

/* Vijf klassen op kwantielen van de werkelijke spreiding, niet op vaste grenzen: een
   wijk met 236 cellen en de gemeente met duizenden moeten beide leesbaar zijn. */
const RASTER_KLEUREN = ["#F6E3B4", "#EFC169", "#DE9134", "#C25E22", "#8E2F16"];
const klassegrenzen = tellingen => {
  const gesorteerd = [...tellingen].sort((a, b) => a - b);
  const grenzen = [];
  for (let i = 1; i < RASTER_KLEUREN.length; i++) {
    const g = gesorteerd[Math.floor((i / RASTER_KLEUREN.length) * gesorteerd.length)];
    if (g !== undefined && grenzen[grenzen.length - 1] !== g) grenzen.push(g);
  }
  return grenzen;
};

function tekenRaster() {
  const cellen = (ONGEVALLEN.raster.cellen || [])
    .map(c => ({bbox:c.bbox, n:celTelling(c)})).filter(c => c.n > 0);
  if (!cellen.length) {
    if (legenda) legenda.textContent = "Geen ongevallen in de gekozen periode of categorieën.";
    return;
  }
  const grenzen = klassegrenzen(cellen.map(c => c.n));
  const kleurVan = n => {
    let i = 0;
    while (i < grenzen.length && n > grenzen[i]) i++;
    return RASTER_KLEUREN[Math.min(i, RASTER_KLEUREN.length - 1)];
  };
  const cel = ONGEVALLEN.raster.celMeters;
  const jr = [...actiefJaar].sort().join(", ");
  cellen.forEach(c => {
    const [zuid, west, noord, oost] = c.bbox;
    L.rectangle([[zuid, west], [noord, oost]],
      {stroke:false, fillColor:kleurVan(c.n), fillOpacity:.72})
      .bindPopup(`<b>${c.n}</b> ongeval${c.n === 1 ? "" : "len"} in deze cel van ` +
        `${cel} × ${cel} m<br><i>periode ${jr}</i>`)
      .addTo(laagGroep);
  });
  const max = Math.max(...cellen.map(c => c.n));
  if (legenda) {
    const blokjes = RASTER_KLEUREN.map((k, i) => {
      const van = i === 0 ? 1 : grenzen[i - 1] + 1;
      const tot = i < grenzen.length ? grenzen[i] : max;
      if (van > tot) return "";
      return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px">' +
        `<span style="width:14px;height:11px;background:${k};display:inline-block"></span>` +
        `${van === tot ? van : van + "–" + tot}</span>`;
    }).join("");
    legenda.innerHTML = `Ongevallen per cel van ${cel} m: ${blokjes}<br>` +
      `${cellen.length.toLocaleString("nl-NL")} cellen met minstens één ongeval, hoogste ` +
      `celtelling ${max}. Klassegrenzen volgen de spreiding in de huidige selectie, dus ze ` +
      "verschuiven als je de periode of categorieën wijzigt.";
  }
}

function tekenPunten() {
  const aanwezig = new Set(ONGEVALLEN.punten.map(p => p.afloop));
  const ontbreekt = [...actiefAfloop].filter(a => !aanwezig.has(a) && telAfloop(a) > 0);
  const zichtbaar = ONGEVALLEN.punten.filter(p =>
    actiefJaar.has(p.jaar) && actiefAfloop.has(p.afloop));
  zichtbaar.forEach(p => {
    const st = stijlVan(p.afloop);
    L.circleMarker([p.lat, p.lon],
      {radius:st.r, color:"#FAFAF5", weight:1, fillColor:st.kleur, fillOpacity:.85})
      .bindPopup(`<b>${p.afloop}</b> · ${p.jaar}` +
        (p.aard ? `<br>${p.aard}` : "") +
        (p.partijen && p.partijen.length ? `<br>${p.partijen.join(" × ")}` : "") +
        (p.straat ? `<br>${p.straat}` : "") +
        (p.vmax ? ` · max ${p.vmax} km/u` : "") +
        (p.straat === undefined ? "<br><i>voor deze categorie zijn geen details vastgelegd</i>" : ""))
      .addTo(laagGroep);
  });
  if (legenda) {
    legenda.innerHTML =
      `${zichtbaar.length.toLocaleString("nl-NL")} ongevallen als punt in de huidige selectie. ` +
      (ontbreekt.length
        ? `<b style="color:var(--rood)">Niet als punt beschikbaar: ` +
          `${ontbreekt.map(a => stijlVan(a).label).join(", ")} — schakel over naar het ` +
          `hotspotraster om die te zien.</b> `
        : "") +
      (ONGEVALLEN.puntenCaveat || "");
  }
}

/* ---- kerncijfers, meebewegend met de periodeselectie ---- */
function bijwerkStrip() {
  const strip = document.getElementById("ongevalStrip");
  if (!strip) return;
  /* tellingen uit perJaar (altijd compleet); kwetsbare partijen uit de puntenlijst, want
     die informatie zit alleen daar en alleen bij letsel en dodelijk */
  const tel = a => telAfloop(a, actiefJaar);
  const totaal = afloopSoorten.reduce((s, a) => s + tel(a), 0);
  const kwetsbaar = ONGEVALLEN.punten.filter(p =>
    actiefJaar.has(p.jaar) && (p.partijen || []).some(o => /fiets|voetganger/i.test(o))).length;
  const jr = [...actiefJaar].sort();
  const per = !jr.length ? "geen jaar gekozen"
    : jr.length === 1 ? String(jr[0]) : `${jr[0]}–${jr[jr.length - 1]}`;
  strip.innerHTML =
    tegelHtml(tel("Dodelijk"), `dodelijke ongevallen (${per})`, "BRON/RWS",
      "kaart-ongevallen/dodelijk") +
    tegelHtml(tel("Letsel").toLocaleString("nl-NL"), `letselongevallen (${per})`, "BRON/RWS",
      "kaart-ongevallen/letsel") +
    tegelHtml(kwetsbaar.toLocaleString("nl-NL"),
      "met fietser of voetganger als geregistreerde partij — alleen vastgelegd bij letsel " +
      "en dodelijk", "BRON/RWS", "kaart-ongevallen/kwetsbaar") +
    tegelHtml(totaal.toLocaleString("nl-NL"),
      "geregistreerde ongevallen totaal, incl. uitsluitend materiële schade", "BRON/RWS",
      "kaart-ongevallen/totaal");
}

function hertekenKaart() {
  laagGroep.clearLayers();
  if (weergave === "raster" && ONGEVALLEN.raster) { tekenRaster(); } else { tekenPunten(); }
  bijwerkStrip();
}

hertekenKaart();

const foot = document.getElementById("ongevalFoot");
if (foot) foot.textContent = "Bron: " + ONGEVALLEN.bron + " · periode " + ONGEVALLEN.peildatum +
  " (niveau: " + ONGEVALLEN.niveau + "). " + ONGEVALLEN.caveat;
});

veilig("ongevallen-trend", () => {
/* ---------- trend per jaar, gestapeld naar afloop (data/<gebied>/ongevallen.js) ---------- */
if (typeof ONGEVALLEN === "undefined" || typeof Chart === "undefined") return;
const el = document.getElementById("chOngevalTrend");
if (!el || !ONGEVALLEN.perJaar) return;
const KLEUR_AFLOOP = {
  "Uitsluitend materiele schade": GRIJS, "Letsel": GEEL, "Dodelijk": "#B0452F"
};
const jaren = Object.keys(ONGEVALLEN.perJaar).sort();
/* dodelijk bovenop de stapel: kleinste categorie, anders onzichtbaar */
const soorten = [...new Set(jaren.flatMap(j => Object.keys(ONGEVALLEN.perJaar[j])))]
  .sort((a, b) => (a === "Dodelijk" ? 1 : 0) - (b === "Dodelijk" ? 1 : 0));
new Chart(el, {type:"bar",
  data:{labels:jaren, datasets:soorten.map(s => ({
    label: s === "Uitsluitend materiele schade" ? "uitsluitend materiële schade" : s.toLowerCase(),
    data: jaren.map(j => ONGEVALLEN.perJaar[j][s] || 0),
    backgroundColor: KLEUR_AFLOOP[s] || GRIJS, borderColor:ASFALT, borderWidth:.5,
    maxBarThickness:64}))},
  options:{maintainAspectRatio:false,
    plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c => ` ${c.dataset.label}: ${c.parsed.y.toLocaleString("nl-NL")}`}}},
    scales:{x:{stacked:true, grid:{display:false}},
            y:{stacked:true, grid:gridOpt, beginAtZero:true,
               title:{display:true, text:"geregistreerde ongevallen"}}}}});
const foot = document.getElementById("ongevalTrendFoot");
if (foot) foot.textContent = "Bron: " + ONGEVALLEN.bron +
  ". RWS publiceert online alleen de laatste drie jaargangen; de reeks groeit alleen doordat " +
  "scripts/cache/bron/ bewaard blijft — die cache weggooien betekent oudere jaren " +
  "onherstelbaar kwijt.";
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
/* ---------- buurtenkaarten ----------
   Buurten komen uit GEO (elk gebied), de karakterisering uit js/teksten.js (alleen waar
   iemand die geschreven heeft). Zonder redactionele tekst tonen we naam en inwonertal —
   geen verzonnen typering. */
const bc = document.getElementById("buurten");
if (!bc) return;
const redactie = TEKST.buurten || {};
const uitGeo = (typeof GEO !== "undefined" && GEO.features)
  ? GEO.features.map(f => ({naam: f.properties.naam, inwoners: f.properties.inwoners}))
  : [];
const lijst = uitGeo.length
  ? uitGeo
  : (D.buurten || []).map(b => ({naam: b.n, tag: b.t, meer: b.m}));
lijst.sort((a, b) => (b.inwoners ?? 0) - (a.inwoners ?? 0));
const maakBuurt = b => {
  const r = redactie[b.naam] || {};
  const tag = r.tag || b.tag ||
    (b.inwoners != null ? `${getalNL(b.inwoners)} inwoners` : "");
  const meer = r.meer || b.meer ||
    "Voor deze buurt is nog geen redactionele karakterschets vastgelegd.";
  const el = document.createElement("div");
  el.className = "buurt"; el.tabIndex = 0; el.setAttribute("role", "button");
  el.innerHTML = `<div class="naam">${b.naam}</div><div class="tag">${tag}</div>` +
    `<div class="meer">${meer}</div>`;
  const t = () => el.classList.toggle("open");
  el.addEventListener("click", t);
  el.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t(); }
  });
  return el;
};

/* Bij een rayon of de gemeente eerst de gebieden, en de buurten pas na een klik (#135).
   Negentien buurtkaarten naast elkaar zijn een lijst, geen overzicht; de eenheid waarvoor een
   gebiedsplan geschreven wordt, is het gebied (#45). De buurtcode draagt de wijk
   (BU0599·04·51 → WK0599·04), dus de indeling komt uit GEO zelf. Alle buurtkaarten worden wel
   gebouwd, verborgen per gebied, zodat de rooktest nog steeds elke buurt terugvindt. */
const perGebiedModus = (GEBIEDNIVEAU === "rayon" || GEBIEDNIVEAU === "gemeente") && uitGeo.length;
if (!perGebiedModus) {
  lijst.forEach(b => bc.appendChild(maakBuurt(b)));
} else {
  const wijkVan = code => "WK" + String(code).slice(2, 8);
  const naamVan = {}, rayonVan = {};
  (typeof GEBIEDEN !== "undefined" ? GEBIEDEN.rayons || [] : []).forEach(r =>
    (r.gebieden || []).forEach(g => { naamVan[g.code] = g.naam; rayonVan[g.code] = r.naam; }));
  (typeof GEBIEDEN !== "undefined" ? GEBIEDEN.buitenGebiedsindeling?.gebieden || [] : [])
    .forEach(g => { naamVan[g.code] = g.naam; });
  const groepen = {};
  GEO.features.forEach(f => {
    const w = wijkVan(f.properties.code);
    (groepen[w] = groepen[w] || []).push({naam: f.properties.naam, inwoners: f.properties.inwoners});
  });
  const totaal = Object.values(groepen).flat().reduce((n, b) => n + (b.inwoners || 0), 0);
  const gebieden = Object.entries(groepen).map(([code, bs]) => ({
    code, naam: naamVan[code] || code, rayon: rayonVan[code] || "buiten de rayonindeling",
    buurten: bs.sort((a, b) => (b.inwoners ?? 0) - (a.inwoners ?? 0)),
    inwoners: bs.reduce((n, b) => n + (b.inwoners || 0), 0),
  })).sort((a, b) => b.inwoners - a.inwoners);

  bc.classList.add("gebieden");
  const detail = document.createElement("div");
  detail.className = "gebieddetail";
  detail.hidden = true;
  const panelen = {};
  gebieden.forEach(g => {
    const kaart = document.createElement("div");
    kaart.className = "gebiedkaart"; kaart.tabIndex = 0; kaart.setAttribute("role", "button");
    kaart.setAttribute("aria-expanded", "false");
    kaart.dataset.gebied = g.code;
    const aandeel = totaal ? Math.round(1000 * g.inwoners / totaal) / 10 : null;
    kaart.innerHTML = `<div class="naam">${g.naam}</div>` +
      `<div class="tag">${GEBIEDNIVEAU === "gemeente" ? g.rayon : "gebied"}</div>` +
      `<div class="cijfers"><b>${getalNL(g.inwoners)}</b> inwoners · ${g.buurten.length} ` +
      `buurt${g.buurten.length === 1 ? "" : "en"}` +
      (aandeel != null ? ` · ${getalNL(aandeel)}% van ${GEBIEDNAAM}` : "") + "</div>";
    bc.appendChild(kaart);

    const paneel = document.createElement("div");
    paneel.hidden = true;
    const grootste = g.buurten[0];
    paneel.innerHTML = `<h4>${g.naam} <span class="status niveau">gebied</span></h4>` +
      `<div class="sub">${getalNL(g.inwoners)} inwoners in ${g.buurten.length} ` +
      `buurt${g.buurten.length === 1 ? "" : "en"}` +
      (aandeel != null ? `, ${getalNL(aandeel)}% van de inwoners van ${GEBIEDNAAM}` : "") +
      (grootste && g.buurten.length > 1
        ? `. Grootste buurt: ${grootste.naam} (${getalNL(grootste.inwoners)}).` : ".") +
      ` <a href="#gebied=${g.code}" data-naar-gebied="${g.code}">Naar de gebiedspagina →</a></div>`;
    const lijstEl = document.createElement("div");
    lijstEl.className = "buurten";
    g.buurten.forEach(b => lijstEl.appendChild(maakBuurt(b)));
    paneel.appendChild(lijstEl);
    /* De hash alleen zetten is niet genoeg: de databestanden zijn globale consts en laten zich
       niet overschrijven, dus een gebiedswissel is een herlaadbeurt (zie gebiedsselectie). */
    paneel.querySelector("[data-naar-gebied]").addEventListener("click", e => {
      e.preventDefault();
      location.hash = `gebied=${g.code}`;
      location.reload();
    });
    detail.appendChild(paneel);
    panelen[g.code] = paneel;

    const kies = () => {
      const open = !paneel.hidden;
      Object.values(panelen).forEach(pn => { pn.hidden = true; });
      bc.querySelectorAll(".gebiedkaart").forEach(k => {
        k.classList.remove("open"); k.setAttribute("aria-expanded", "false"); });
      if (!open) {
        paneel.hidden = false;
        kaart.classList.add("open"); kaart.setAttribute("aria-expanded", "true");
      }
      detail.hidden = open;
    };
    kaart.addEventListener("click", kies);
    kaart.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kies(); }
    });
  });
  bc.after(detail);
}
/* Hoeveel buurten hóórden er te zijn? De rooktest rekende af op minimaal drie kaarten, en
   Pernis heeft er één — dan faalt een test op iets wat klopt, en een test die vals alarm geeft
   leert je hem negeren. Met dit getal kan de rooktest toetsen wat hij bedoelde: heeft elke
   buurt een kaart gekregen. */
document.body.dataset.buurtenVerwacht = String(lijst.length);
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

veilig("datastatus", () => {
/* ---------- datastatus: de volledige inventaris, inclusief wat er nog niet in zit ----------
   Stond als handgeschreven HTML-tabel met tien rijen, die onvermijdelijk uit de pas liep met
   wat er werkelijk in het dashboard zat. Komt nu uit de registry in scripts/indicatoren.py,
   samen met de geplande en geblokkeerde elementen. Zo is in één oogopslag te zien wat er
   mist, in plaats van dat het onzichtbaar afwezig is. */
if (typeof GEBIEDEN === "undefined" || !GEBIEDEN.elementen) return;
const tb = document.querySelector("#datastatusTabel tbody");
if (!tb) return;
const STIJL = {
  verwerkt:    ["cbs", "verwerkt"],
  deels:       ["schatting", "deels"],
  /* Eigen kleur: een cijfer uit een niet-openbare levering is verwerkt, maar niet door een
     derde na te rekenen. Dat onderscheid moet zichtbaar blijven. */
  intern:      ["intern", "niet-openbare bron"],
  gepland:     ["schatting", "gepland"],
  onderzoek:   ["schatting", "onderzoek"],
  geblokkeerd: ["ontbreekt", "geblokkeerd"],
};
const ISSUE_URL = "https://github.com/WKSu/rayonplannen/issues/";
const telling = {};
GEBIEDEN.elementen.forEach(e => {
  telling[e.status] = (telling[e.status] || 0) + 1;
  const [klasse, label] = STIJL[e.status] || ["ontbreekt", e.status];
  const tr = document.createElement("tr");
  /* geplande en geblokkeerde regels lichter, zodat de tabel leest als voortgang en niet als
     een lijst waarin alles even hard is */
  if (e.status !== "verwerkt") tr.style.opacity = ".72";
  tr.innerHTML =
    `<td><b>${e.naam}</b>` +
    (e.toelichting ? `<div style="color:var(--asfalt-zacht);font-size:12.5px">${e.toelichting}</div>` : "") +
    (e.issue ? `<div style="font-size:12px"><a href="${ISSUE_URL}${e.issue}">issue #${e.issue}</a></div>` : "") +
    "</td>" +
    `<td><span class="status ${klasse}">${label}</span></td>` +
    `<td>${e.bron}${e.verversing && e.verversing !== "—" ? ` <span style="color:var(--asfalt-zacht)">(${e.verversing})</span>` : ""}</td>` +
    `<td>${e.niveau}</td>`;
  tb.appendChild(tr);
});
const intro = document.getElementById("datastatusIntro");
if (intro) {
  const n = GEBIEDEN.elementen.length;
  const klaar = (telling.verwerkt || 0) + (telling.deels || 0) + (telling.intern || 0);
  intro.innerHTML =
    `${n} data-elementen in beeld, waarvan <b>${klaar} verwerkt</b>. De rest staat er ` +
    "bewust leeg bij: " +
    [[telling.gepland, "gepland"], [telling.onderzoek, "eerst uitzoeken of het kan"],
     [telling.geblokkeerd, "geblokkeerd, bron niet beschikbaar"]]
      .filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(", ") +
    ". Zo is zichtbaar wat er mist in plaats van dat het onzichtbaar afwezig is." +
    (telling.intern
      ? ` Van de verwerkte elementen komen er <b>${telling.intern}</b> uit een ` +
        "niet-openbare levering: daarvan staan alleen geaggregeerde uitkomsten in het " +
        "dashboard, en een derde kan ze niet narekenen."
      : "");
}
const foot = document.getElementById("datastatusFoot");
if (foot) foot.textContent =
  "Deze tabel wordt gegenereerd uit scripts/indicatoren.py; hij kan dus niet uit de pas " +
  "lopen met wat er werkelijk in het dashboard zit. Een element toevoegen of van status " +
  "veranderen doe je daar.";

/* ---------- lege slots in de secties zelf ----------
   De tabel hierboven vertelt wat er mist, maar staat helemaal onderaan. Wie sectie 06 leest
   ziet daar niet dat parkeerdruk ontbreekt — die leest gewoon wat er wél staat en denkt dat
   het compleet is. Daarom krijgt elk gepland element ook een lege kaart in de sectie waar
   het thuis zou horen, met dezelfde vormtaal als een gevulde kaart maar zonder cijfer.
   Geblokkeerde elementen krijgen bewust geen slot: daar is besloten dat het er niet komt. */
const WACHT = {gepland: "gepland", onderzoek: "uitzoeken"};
const slots = GEBIEDEN.elementen.filter(e => e.sectie && WACHT[e.status]);
for (const e of slots) {
  const sec = plekVoor(e.sectie);
  if (!sec) { console.warn(`[slot] sectie ${e.sectie} bestaat niet voor ${e.naam}`); continue; }
  const box = document.createElement("div");
  box.className = "chart-box leeg";
  box.dataset.slot = e.status;
  /* Ook een kaart die er nog niet is verdient een anker: juist hier kan een adviseur kwijt
     of hij dit nodig heeft of dat het kan vervallen (zie js/review.js). */
  box.dataset.onderwerp = "slot/" + sleutelbaar(e.naam);
  box.innerHTML =
    `<h4>${e.naam} <span class="status ontbreekt">${WACHT[e.status]}</span></h4>` +
    `<div class="sub">${e.toelichting || "Nog niet in het dashboard."}</div>` +
    `<div class="foot">Beoogde bron: ${e.bron}` +
    (e.niveau && e.niveau !== "onbekend" ? `, niveau ${e.niveau}` : "") +
    (e.issue ? ` — <a href="${ISSUE_URL}${e.issue}">issue #${e.issue}</a>` : "") +
    "</div>";
  sec.appendChild(box);
}

/* Stippellijn en gedempte kleur: de kaart moet leesbaar zijn als "hier komt iets" en niet
   te verwarren zijn met een kaart die wél een cijfer toont. */
const stijl = document.createElement("style");
stijl.textContent =
  ".chart-box.leeg{border-style:dashed;background:transparent;opacity:.66}" +
  ".chart-box.leeg h4{font-weight:600}";
document.head.appendChild(stijl);
});


/* ---------- gedeeld door de blokken uit niet-openbare leveringen ----------
   `INTERN` komt uit data/<gebied>/intern.js en bevat per bron een blok met de cijfers én de
   verantwoording. Die verantwoording is niet optioneel: bij een bron die niemand anders
   heeft, is de enige controle op een cijfer de tekst eronder. */
/* getalNL bestaat al bovenin; voor hele aantallen ronden we eerst af, want een schatting uit
   grootteklassen levert halve personen op en "1.142,5 werkzame personen" is schijnprecisie. */
const heelNL = v => v == null ? "onbekend" : Math.round(v).toLocaleString("nl-NL");

const internBron = sleutel =>
  (typeof INTERN !== "undefined" && INTERN.bronnen && !(INTERN.bronnen[sleutel] || {}).leeg)
    ? INTERN.bronnen[sleutel] : null;

/* De voetnoot van zo'n blok: bron, peiljaar, niveau, caveat, drempel en — als hij niet
   openbaar is — dat het cijfer niet door een derde na te rekenen valt. */
function internFoot(b, extra) {
  const delen = [`Bron: ${b.bron}`];
  if (b.niveau) delen.push(`niveau: ${b.niveau}`);
  const regel = delen.join(" · ") + ". " + (extra ? extra + " " : "") + (b.caveat || "");
  const staart = b.openbaar
    ? " Reguliere publicatie; hier als levering ingelezen."
    : " Niet-openbare levering: alleen geaggregeerde uitkomsten staan in dit dashboard, " +
      "en een derde kan dit cijfer niet narekenen. Voorwaarden: " + b.voorwaarden;
  /* Een drempel van 1 is geen drempel; die zin erbij zetten maakt de voetnoot langer en de
     lezer niet wijzer. */
  const drempel = (b.drempel && b.drempel.nMin > 1) ? " " + b.drempel.toelichting : "";
  return regel + staart + drempel;
}

/* Stippellijn op een vaste waarde, voor grafieken met een referentiepunt (Rotterdam = de
   stedelijke score). Kleiner broertje van wijkLijn, dat aan chBuurt vastzit. */
function refLijnPlugin(as) {
  return {
    id: "refLijn" + as, waarde: null, label: "",
    afterDatasetsDraw(chart) {
      const p = chart.$refLijn;
      if (!p || p.waarde == null) return;
      const schaal = chart.scales[as];
      const {ctx, chartArea: a} = chart;
      const px = schaal.getPixelForValue(p.waarde);
      if (px < (as === "x" ? a.left : a.top) || px > (as === "x" ? a.right : a.bottom)) return;
      ctx.save();
      ctx.strokeStyle = SCHIE; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (as === "x") { ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); }
      else { ctx.moveTo(a.left, px); ctx.lineTo(a.right, px); }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "700 11px Helvetica"; ctx.fillStyle = SCHIE;
      const b = ctx.measureText(p.label).width;
      /* Een dekkend plaatje achter de tekst: de lijn loopt over de balken heen en zonder
         achtergrond is het label daar onleesbaar. */
      const lx = as === "x" ? Math.min(px + 4, a.right - b - 2) : a.left + 4;
      const ly = as === "x" ? a.top + 11 : Math.max(px - 4, a.top + 11);
      ctx.fillStyle = "rgba(250,250,245,.85)";
      ctx.fillRect(lx - 2, ly - 10, b + 4, 13);
      ctx.fillStyle = SCHIE;
      ctx.fillText(p.label, lx, ly);
      ctx.restore();
    },
  };
}


veilig("wijkprofiel", () => {
/* ---------- wijkprofiel: de drie hoofdscores over zeven peiljaren ----------
   Hoort in sectie 02 omdat het dezelfde vraag beantwoordt: binnen één gebied verschillen de
   wijken meer dan de gebieden onderling. En omdat het wijkprofiel géén rayonscore kent —
   een indexscore middelen over gebieden is geen geldige bewerking — is dit precies het
   soort cijfer waar "één rayongemiddelde bestaat niet" letterlijk voor geldt.

   Let op de dubbele betekenis van "wijk": de 71 wijken hieronder zijn de Rotterdamse
   wijkindeling, niet de CBS-wijk waar de rest van dit dashboard op draait. */
const b = internBron("wijkprofiel");
const box = document.getElementById("wijkprofielBox");
if (!b || !box || !b.indices) return;

const KEUZE = [["SI", "Sociaal"], ["FI", "Fysiek"], ["VI", "Veiligheid"]];
let gekozen = "SI";

const jaren = b.peiljaren.map(String);
const gebiedCodes = Object.keys(b.indices.SI.perGebied);
const meerdere = gebiedCodes.length > 1;

const grafiek = new Chart(document.getElementById("chWijkprofiel"), {
  type: "line",
  data: {labels: jaren, datasets: []},
  options: {maintainAspectRatio: false, spanGaps: true,
    plugins: {legend: {display: true, position: "bottom"},
      tooltip: {callbacks: {label: c => ` ${c.dataset.label}: ${c.parsed.y ?? "geen score"}`}}},
    scales: {y: {grid: gridOpt, title: {display: true, text: "indexscore"}},
             x: {grid: {display: false}}}},
});

const wijkenGrafiek = new Chart(document.getElementById("chWijkprofielWijken"), {
  type: "bar",
  data: {labels: [], datasets: [{data: [], backgroundColor: SCHIE, borderColor: ASFALT,
    borderWidth: 1, maxBarThickness: 26}]},
  options: {indexAxis: "y", maintainAspectRatio: false,
    plugins: {legend: {display: false},
      tooltip: {callbacks: {label: c => ` ${c.parsed.x ?? "geen score"}`}}},
    scales: {x: {grid: gridOpt, beginAtZero: true, title: {display: true, text: "indexscore"}},
             y: {grid: {display: false}}}},
  plugins: [refLijnPlugin("x")],
});

function teken() {
  const idx = b.indices[gekozen];
  const kleuren = [ASFALT, SCHIE, POLDER, GEEL, "#B0452F", GRIJS];
  grafiek.data.datasets = gebiedCodes.map((code, i) => ({
    label: (GEBIEDEN.gemeente.wijken && meerdere)
      ? (naamVanCode(code) || code) : GEBIEDNAAM,
    data: idx.perGebied[code],
    borderColor: kleuren[i % kleuren.length],
    backgroundColor: kleuren[i % kleuren.length],
    tension: .25, pointRadius: 3,
  })).concat([{
    label: GEMEENTENAAM, data: idx.rotterdam, borderColor: GRIJS, backgroundColor: GRIJS,
    borderDash: [5, 4], tension: .25, pointRadius: 2,
  }]);
  grafiek.update();

  const nieuwste = b.peiljaren.at(-1);
  const rij = b.wijken
    .map(w => ({naam: w.naam, v: w[gekozen]}))
    .filter(w => typeof w.v === "number")
    .sort((a, c) => c.v - a.v);
  wijkenGrafiek.data.labels = rij.map(w => w.naam);
  wijkenGrafiek.data.datasets[0].data = rij.map(w => w.v);
  wijkenGrafiek.$refLijn = {waarde: idx.rotterdam.at(-1), label: GEMEENTENAAM};
  /* Hoogte meegroeien met het aantal wijken: een rayon heeft er tot negentien, en in een vak
     van 230 px slaat Chart.js dan labels over — dan staat er een balk zonder naam. */
  wijkenGrafiek.canvas.parentNode.style.height = (44 + 22 * rij.length) + "px";
  wijkenGrafiek.resize();
  wijkenGrafiek.update();

  const eigen = meerdere ? null : idx.perGebied[gebiedCodes[0]].at(-1);
  document.getElementById("wijkprofielSub").textContent =
    `${idx.naam} per peiljaar. 100 is het Rotterdams gemiddelde van het ijkjaar; ` +
    `${GEMEENTENAAM} staat in ${nieuwste} op ${getalNL(idx.rotterdam.at(-1))}` +
    (eigen != null ? `, ${GEBIEDNAAM} op ${getalNL(eigen)}` : "") + ". " +
    (meerdere
      ? "Een rayonscore bestaat niet: het wijkprofiel publiceert per gebied, en indexscores " +
        "zijn niet te middelen. Daarom een lijn per gebied."
      : "");
  document.getElementById("wijkprofielWijkKop").textContent =
    `Rotterdamse wijken binnen dit gebied, ${nieuwste}`;
}

function naamVanCode(code) {
  for (const r of (GEBIEDEN.rayons || [])) {
    const g = r.gebieden.find(x => x.code === code);
    if (g) return g.naam;
  }
  return null;
}

const tg = document.getElementById("wijkprofielToggle");
KEUZE.forEach(([k, label], i) => {
  const knop = document.createElement("button");
  knop.type = "button"; knop.textContent = label; knop.dataset.k = k;
  if (i === 0) knop.classList.add("actief");
  knop.addEventListener("click", () => {
    gekozen = k;
    [...tg.children].forEach(x => x.classList.toggle("actief", x.dataset.k === k));
    teken();
  });
  tg.appendChild(knop);
});

teken();
document.getElementById("wijkprofielFoot").textContent = internFoot(b, b.wijkToelichting);
box.hidden = false;
});


veilig("arbeidsplaatsen", () => {
/* ---------- vestigingen en werkzame personen ----------
   Geen arbeidsplaatsentelling, en dat moet de lezer meteen zien. De levering bevat alleen
   vestigingen met vijf of meer werkenden, in grootteklassen; het aantal werkzame personen is
   dus een ondergrens. De sectorverdeling is robuuster dan het niveau, en die staat daarom in
   de grafiek — het absolute getal alleen in de strip, met "ten minste" ervoor. */
const b = internBron("arbeidsplaatsen");
const box = document.getElementById("werkBox");
if (!b || !box || !b.sectoren) return;

document.getElementById("werkStrip").innerHTML =
  tegelHtml(heelNL(b.vestigingen), "vestigingen met 5 of meer werkenden",
    "KVK, levering gemeente", "arbeidsplaatsen/vestigingen") +
  tegelHtml(`≥ ${heelNL(b.werkzamePersonen)}`,
    "werkzame personen, geschat uit grootteklassen", "ondergrens",
    "arbeidsplaatsen/werkzame-personen");

const rij = b.sectoren.filter(s => s.vestigingen > 0);
const canvasWerk = document.getElementById("chWerk");
/* Eenentwintig SBI-secties passen niet in een vak van vaste hoogte; Chart.js slaat dan
   labels over en er staat een balk zonder naam. */
canvasWerk.parentNode.style.height = (44 + 22 * rij.length) + "px";
new Chart(canvasWerk, {
  type: "bar",
  data: {labels: rij.map(s => s.naam),
    datasets: [{data: rij.map(s => s.werkzaam), backgroundColor: SCHIE,
      borderColor: ASFALT, borderWidth: 1, maxBarThickness: 22}]},
  options: {indexAxis: "y", maintainAspectRatio: false,
    plugins: {legend: {display: false},
      tooltip: {callbacks: {label: c => {
        const s = rij[c.dataIndex];
        return s.werkzaam == null
          ? ` ${s.vestigingen} vestiging(en) — te weinig voor een schatting`
          : ` ten minste ${heelNL(s.werkzaam)} werkzame personen in ${s.vestigingen} vestigingen`;
      }}}},
    scales: {x: {grid: gridOpt, beginAtZero: true,
        title: {display: true, text: "werkzame personen (ondergrens)"}},
      y: {grid: {display: false}}}},
});

const d = b.dekking || {};
document.getElementById("werkSub").textContent =
  `Werkzame personen per SBI-sectie, geschat uit de grootteklasse van elke vestiging. ` +
  `Sectoren met minder dan ${b.drempel.nMin} vestigingen krijgen geen schatting.`;
document.getElementById("werkFoot").textContent = internFoot(b,
  `Van de ${heelNL(d.inLevering)} vestigingen in de levering konden er ${heelNL(d.zonderLocatie)} ` +
  "niet op een pand worden gelokaliseerd; die tellen nergens mee.");
box.hidden = false;
});


veilig("autobezit", () => {
/* ---------- autobezit per woonadres, zeven peildata ----------
   De noemer is het woonadres en niet het huishouden, dus dit cijfer is níet hetzelfde als
   "auto's per huishouden" uit de CBS Kerncijfers een paar grafieken hierboven. Dat staat in
   de voetnoot, want twee bijna-gelijke getallen naast elkaar zonder uitleg is erger dan één. */
const b = internBron("autobezit");
const box = document.getElementById("autobezitBox");
if (!b || !box || !b.totaal) return;

const jaren = b.peiljaren;
const codes = Object.keys(b.perGebied || {});
const meerdere = codes.length > 1;
const kleuren = [ASFALT, SCHIE, POLDER, GEEL, "#B0452F", GRIJS];

const reeksen = meerdere
  ? codes.map((code, i) => ({label: b.perGebied[code].naam,
      data: b.perGebied[code].perWoonadres, borderColor: kleuren[i % kleuren.length],
      backgroundColor: kleuren[i % kleuren.length], tension: .25, pointRadius: 3}))
  : [{label: GEBIEDNAAM, data: b.totaal.perWoonadres, borderColor: ASFALT,
      backgroundColor: ASFALT, tension: .25, pointRadius: 3}];

new Chart(document.getElementById("chAutobezit"), {
  type: "line",
  data: {labels: jaren, datasets: reeksen},
  options: {maintainAspectRatio: false, spanGaps: true,
    plugins: {legend: {display: meerdere, position: "bottom"},
      tooltip: {callbacks: {label: c => ` ${c.dataset.label}: ${getalNL(c.parsed.y)}`}}},
    /* Geen beginAtZero hier: dit is een lijn door de tijd, geen staaf. Het verschil tussen
       gebieden zit in de tweede decimaal, en vanaf nul is dat een vlakke streep. Dezelfde
       keuze als bij de bevolkingsreeks. */
    scales: {y: {grid: gridOpt, title: {display: true, text: "personenauto's per woonadres"}},
      x: {grid: {display: false}}}},
});

const KLEUR_KLASSE = {"0": POLDER, "1": SCHIE, "2": GEEL, "3": "#B0452F",
  "4 of meer": ASFALT, "onbekend": "#B9B7A8"};
const KLASSELABEL = k => k === "onbekend" ? "onbekend" : k + (k === "1" ? " auto" : " auto's");
new Chart(document.getElementById("chAutobezitVerdeling"), {
  type: "bar",
  data: {labels: jaren,
    datasets: b.klassen.map(k => ({label: KLASSELABEL(k),
      data: b.totaal.verdeling[k], backgroundColor: KLEUR_KLASSE[k] || GRIJS,
      borderColor: ASFALT, borderWidth: .5}))},
  options: {maintainAspectRatio: false,
    plugins: {legend: {display: true, position: "bottom"},
      tooltip: pctTip(" % van de woonadressen")},
    scales: {y: {stacked: true, grid: gridOpt, max: 100,
        ticks: {callback: v => v + "%"}},
      x: {stacked: true, grid: {display: false}}}},
});

/* Subbuurtkaart: fijner dan de CBS-buurt uit sectie 02, dus hij laat spreiding zien die daar
   niet te zien is. Zelfde kleurcodering als de buurt-choropleth, zodat de twee kaarten niet
   elk hun eigen taal spreken. */
const waarden = b.subbuurten.map(s => s.perWoonadres).filter(v => v != null);
const maxW = waarden.length ? Math.max(...waarden) : 0;
const kaart = L.map("kaartAutobezit", {scrollWheelZoom: false});
basiskaart().addTo(kaart);
const laag = L.geoJSON(b.kaart, {
  style: f => ({color: ASFALT, weight: 1, fillColor: SCHIE,
    fillOpacity: f.properties.perWoonadres == null ? .12
      : .15 + .65 * (f.properties.perWoonadres / (maxW || 1))}),
  onEachFeature: (f, l) => {
    const p = f.properties;
    l.bindPopup(`<b>${p.naam}</b> (subbuurt ${p.code})<br>` +
      (p.perWoonadres == null
        ? "geen cijfer (onderdrukt of te klein)"
        : `${getalNL(p.perWoonadres)} auto's per woonadres`));
  },
}).addTo(kaart);
kaart.fitBounds(laag.getBounds(), {padding: [10, 10]});
setTimeout(() => kaart.invalidateSize(), 0);
if (maxW > 0) {
  const blok = op => `<span style="display:inline-block;width:20px;height:12px;` +
    `background:${SCHIE};opacity:${op.toFixed(2)};border:1px solid var(--grid);` +
    `vertical-align:-2px"></span>`;
  document.getElementById("autobezitLegenda").innerHTML =
    "Auto's per woonadres: " +
    [0, 1 / 3, 2 / 3, 1].map(t => `${blok(.15 + .65 * t)} ${getalNL(Math.round(t * maxW * 100) / 100)}`).join(" ") +
    ` &nbsp;·&nbsp; ${blok(.12)} geen cijfer`;
}

const laatste = b.totaal.perWoonadres.at(-1);
const nul = b.totaal.verdeling["0"].at(-1);
const onvolledig = b.totaal.volledig.some(v => v === false);
document.getElementById("autobezitSub").textContent =
  `Peildatum 1 januari, ${jaren[0]} tot en met ${jaren.at(-1)}. In ${jaren.at(-1)} ` +
  `${getalNL(laatste)} personenauto's per woonadres; ${getalNL(nul)}% van de woonadressen heeft ` +
  "geen auto." + (meerdere ? " Bij een rayon één lijn per gebied." : "");
document.getElementById("autobezitFoot").textContent = internFoot(b, onvolledig
  ? "In ten minste één subbuurt is een cel onderdrukt; de opgetelde aantallen zijn daardoor " +
    "een ondergrens en de percentages een benadering."
  : "");
box.hidden = false;
});


veilig("parkeersectoren", () => {
/* ---------- parkeervergunningen per sector ----------
   Bewust geen gebiedstotaal. Parkeersectoren overlappen elkaar en volgen de gebiedsgrens
   niet, dus optellen zou dubbeltellen en een grens suggereren die er niet is. Wat er wél
   staat: per sector de cijfers, met erbij hoeveel van die sector in dit gebied ligt. */
const b = internBron("parkeersectoren");
const box = document.getElementById("parkeerBox");
if (!b || !box) return;
if (!b.sectoren || !b.sectoren.length) {
  document.getElementById("parkeerSub").textContent =
    `Geen parkeersector ligt voor ${b.minOverlapPct}% of meer in ${GEBIEDNAAM}: hier geldt ` +
    "geen vergunningregime, of de sector ligt vrijwel geheel buiten het gebied.";
  document.getElementById("kaartParkeer").style.display = "none";
  document.getElementById("parkeerDetails").style.display = "none";
  document.getElementById("parkeerFoot").textContent = internFoot(b, b.geenTotaal);
  box.hidden = false;
  return;
}

/* Bezetting (#149): (vergunningen bewoners + bedrijven) ÷ fiscale capaciteit, uitgerekend in de
   pipeline zodat de check daar dezelfde regel ziet. Kaart en tabel lezen allebei dat ene getal. */
const bez = s => (s?.cijfers || {}).bezetting ?? null;
const wacht = v => v == null ? "&lt; drempel" : heelNL(v);
const kaart = L.map("kaartParkeer", {scrollWheelZoom: false});
basiskaart().addTo(kaart);
const opSector = Object.fromEntries(b.sectoren.map(s => [s.id, s]));
const laag = L.geoJSON(b.kaart, {
  style: f => {
    const s = opSector[f.properties.id];
    // Een sector die het gebied alleen raakt (#134): omtrek zonder vulling, geen cijfer.
    if (!s) return {color: ASFALT, weight: 1, dashArray: "3 3", fill: false, opacity: .6};
    // Eén tint, geen rood bij 100% (#30: normatieve kleuring is uitgesteld). De schaal loopt
    // door tot 150%, want juist boven de 100% verschillen de sectoren onderling het meest.
    const v = bez(s);
    return {color: ASFALT, weight: 1, fillColor: SCHIE,
      fillOpacity: v == null ? .05 : .08 + .72 * Math.min(v / 150, 1)};
  },
  onEachFeature: (f, l) => {
    const s = opSector[f.properties.id];
    if (!s) {
      l.bindPopup(`<b>Parkeersector ${f.properties.id}</b><br>` +
        `${getalNL(100 * f.properties.deel)}% van de sector ligt in ${GEBIEDNAAM}; ` +
        `onder de ${b.minOverlapPct}% en daarom niet in de tabel.`);
      return;
    }
    const c = s.cijfers || {};
    l.bindPopup(`<b>Parkeersector ${s.id}</b><br>` +
      `${getalNL(s.deelInGebied)}% van de sector ligt in ${GEBIEDNAAM}<br>` +
      `vergunningen bewoners: ${heelNL(c.vergunningenBewoners)} (wachtlijst ${wacht(c.wachtlijstBewoners)})<br>` +
      `vergunningen bedrijven: ${heelNL(c.vergunningenBedrijven)} (wachtlijst ${wacht(c.wachtlijstBedrijven)})<br>` +
      `fiscale capaciteit: ${heelNL(c.capaciteit)}<br>` +
      `bezetting door vergunningen: ${c.bezetting == null ? "onbekend" : getalNL(c.bezetting) + "%"}`);
  },
}).addTo(kaart);
/* De gebiedsgrens erbij (#133): sectoren volgen de grens niet, dus zonder omtrek is niet te zien
   welk deel van een sector in het gebied ligt. Passend maken op sectoren én grens samen. */
let grenzen = laag.getBounds();
if (typeof GEO !== "undefined" && GEO.features?.length) {
  const grens = L.geoJSON({type: "FeatureCollection", features: GEO.features},
    {style: {color: ASFALT, weight: 1.5, fill: false, dashArray: "4 3"}, interactive: false})
    .addTo(kaart);
  grenzen = grenzen.extend(grens.getBounds());
}
kaart.fitBounds(grenzen, {padding: [10, 10]});
setTimeout(() => kaart.invalidateSize(), 0);
const nRaakt = (b.kaart?.features || []).filter(f => !opSector[f.properties.id]).length;
document.getElementById("parkeerLegenda").innerHTML =
  `Kleurverloop: bezetting door vergunningen, ${b.bezettingRegel || "vergunningen ÷ capaciteit"}: ` +
  `<span style="display:inline-block;width:90px;height:12px;vertical-align:-2px;` +
  `border:1px solid var(--grid);background:linear-gradient(90deg,` +
  `color-mix(in srgb,${SCHIE} 8%,transparent),color-mix(in srgb,${SCHIE} 80%,transparent))">` +
  `</span> 0% tot 150% of meer.` +
  (nRaakt ? ` Gestippelde omtrek: ${nRaakt} sector(en) die het gebied alleen raken.` : "");

const tb = document.querySelector("#parkeerTabel tbody");
for (const s of b.sectoren) {
  const c = s.cijfers || {};
  const tr = document.createElement("tr");
  tr.innerHTML =
    `<td>${s.id}</td>` +
    `<td class="getal">${getalNL(s.deelInGebied)}%</td>` +
    `<td class="getal rand">${heelNL(c.vergunningenBewoners)}</td>` +
    `<td class="getal">${wacht(c.wachtlijstBewoners)}</td>` +
    `<td class="getal">${heelNL(c.plafondBewoners)}</td>` +
    `<td class="getal rand">${heelNL(c.vergunningenBedrijven)}</td>` +
    `<td class="getal">${wacht(c.wachtlijstBedrijven)}</td>` +
    `<td class="getal">${heelNL(c.plafondBedrijven)}</td>` +
    `<td class="getal rand">${c.bezetting == null ? "—" : getalNL(c.bezetting) + "%"}</td>`;
  tb.appendChild(tr);
}
document.getElementById("parkeerDetailsLabel").textContent =
  `Alle ${b.sectoren.length} sectoren — vergunningen, wachtlijst en bezetting`;

const metWacht = b.sectoren.filter(s => (s.cijfers || {}).wachtlijstBewoners > 0).length;
const metWachtBed = b.sectoren.filter(s => (s.cijfers || {}).wachtlijstBedrijven > 0).length;
const vol = b.sectoren.filter(s => bez(s) != null && bez(s) >= 100).length;
document.getElementById("parkeerSub").textContent =
  `${b.sectoren.length} parkeersector(en) liggen voor ${b.minOverlapPct}% of meer in ${GEBIEDNAAM}. ` +
  `In ${metWacht} daarvan staan bewoners op een wachtlijst, in ${metWachtBed} bedrijven; ` +
  `in ${vol} zijn meer vergunningen uitgegeven dan er fiscale plaatsen zijn. ` +
  "De cijfers gelden voor de hele sector, ook het deel buiten dit gebied.";
document.getElementById("parkeerFoot").textContent = internFoot(b,
  `Bezetting = ${b.bezettingRegel || "(vergunningen bewoners + bedrijven) ÷ fiscale capaciteit"}. ` +
  "Bewoners- en bedrijfsvergunningen tellen tegen dezelfde fiscale plaatsen; een bezetting " +
  "boven 100% betekent meer vergunningen dan plaatsen, niet dat de straat vol staat — niet " +
  "elke vergunninghouder parkeert tegelijk. Plafonds zijn de tijdelijke berekening uit de " +
  "levering.");
box.hidden = false;
});


veilig("viewers", () => {
/* ---------- losse verkenners: naar de diepere analyse, zonder hem mee te slepen ----------
   Naast dit dashboard bestaan er afzonderlijke producten die één vraag veel dieper
   beantwoorden (parkeercapaciteit tot op het losse vak, invloedsgebieden per ov-halte). Die
   staan in scripts/viewers.py en komen via data/index.js binnen — er staat hier bewust geen
   lijst met URL's, net als bij de WMS-koppeling.

   Waarom een tussenstap en niet meteen een iframe: één van die producten is één HTML-bestand
   van 35 MB. Dat zou bij elke opening van het dashboard meeladen, ook voor wie er niet naar
   kijkt, en het dashboard moet offline blijven werken. Het iframe wordt dus pas gebouwd als
   iemand erop klikt. Openen in een nieuw tabblad kan altijd.

   Vóór de sectienavigatie, zodat die de h4's van deze kaarten meeneemt in het zoekvak. */
if (typeof GEBIEDEN === "undefined" || !Array.isArray(GEBIEDEN.viewers)) return;

const vStijl = document.createElement("style");
vStijl.textContent =
  ".chart-box.viewer .knoppen{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:4px 0 10px}" +
  ".chart-box.viewer button{font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;" +
  "padding:7px 13px;border:1px solid var(--asfalt);background:var(--asfalt);color:var(--wit)}" +
  ".chart-box.viewer button:hover{background:var(--asfalt-zacht);border-color:var(--asfalt-zacht)}" +
  /* #137: een verkenner is een ander, rijker product dan een grafiek, en moet er ook zo uitzien.
     Volle breedte, een accentrand en een beeld van wat je krijgt. */
  ".chart-box.viewer{border-left:6px solid var(--schie);background:#EEF3F5;padding:18px 20px}" +
  ".chart-box.viewer .viewerlabel{font-size:11px;font-weight:800;letter-spacing:.14em;" +
  "text-transform:uppercase;color:var(--schie);margin-bottom:4px}" +
  ".chart-box.viewer h4{font-size:19px}" +
  ".chart-box.viewer .viewergrid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);" +
  "gap:20px;align-items:start;margin-top:8px}" +
  "@media(max-width:820px){.chart-box.viewer .viewergrid{grid-template-columns:1fr}}" +
  ".chart-box.viewer .viewerbeeld{position:relative;display:block;border:1px solid var(--asfalt);" +
  "box-shadow:0 4px 14px rgba(34,38,31,.18);line-height:0}" +
  ".chart-box.viewer .viewerbeeld img{width:100%;height:auto}" +
  ".chart-box.viewer .viewerbeeld span{position:absolute;right:10px;bottom:10px;line-height:1.2;" +
  "background:var(--asfalt);color:var(--wit);font-size:12.5px;font-weight:700;padding:6px 10px}" +
  ".chart-box.viewer ul{margin:8px 0 12px 18px;font-size:13.5px}" +
  ".chart-box.viewer li{margin:3px 0}" +
  ".chart-box.viewer a.hoofdknop{display:inline-block;background:var(--schie);color:var(--wit);" +
  "font-weight:800;font-size:14px;padding:10px 16px;text-decoration:none}" +
  ".chart-box.viewer a.hoofdknop:hover{background:var(--asfalt)}" +
  ".meer-details{font-size:13px;margin-top:10px;padding:7px 10px;background:#EEF3F5;" +
  "border-left:4px solid var(--schie);color:var(--asfalt-zacht)}" +
  ".meer-details a{font-weight:800}" +
  ".chart-box.viewer iframe{width:100%;border:1px solid var(--grid);background:var(--beton)}" +
  ".chart-box.viewer .selectie{font-size:12px;color:var(--asfalt-zacht)}" +
  "@media print{.chart-box.viewer iframe,.chart-box.viewer .knoppen{display:none!important}}";
document.head.appendChild(vStijl);

for (const v of GEBIEDEN.viewers) {
  const sec = plekVoor(v.sectie);
  if (!sec) { console.warn(`[viewer] sectie ${v.sectie} bestaat niet voor ${v.naam}`); continue; }

  /* De deeplink is per gebied in de pipeline uitgerekend. Is er geen, dan zeggen we dat —
     stil terugvallen op de stadskaart zou suggereren dat je naar dit gebied kijkt. */
  const link = (v.links || {})[GEBIEDCODE];
  const doel = link ? link.url : v.url;

  /* Geen .reveal: de IntersectionObserver in veilig("scroll") heeft de DOM al doorlopen
     voordat dit blok draait, dus een .reveal die er later bij komt blijft op opacity 0. */
  const box = document.createElement("div");
  box.className = "chart-box viewer";
  box.dataset.viewer = v.sleutel;
  /* Ook een extern product is een onderwerp: "hier wil ik liever een eigen grafiek van" is
     precies het soort oordeel waar de reviewronde om vraagt (js/review.js). */
  box.dataset.onderwerp = "viewer/" + v.sleutel;
  const label = document.createElement("div");
  label.className = "viewerlabel";
  label.textContent = "Verdieping · aparte verkenner";
  box.appendChild(label);
  const kop = document.createElement("h4");
  kop.innerHTML = `${v.naam} <span class="status niveau">extern product</span>`;
  box.appendChild(kop);

  /* Links het beeld (klikbaar), rechts wat je er kunt en de knoppen. Zonder beeld in de
     registry vult de tekstkolom de hele breedte. */
  const grid = document.createElement("div");
  grid.className = "viewergrid";
  if (v.voorbeeld) {
    const beeld = document.createElement("a");
    beeld.className = "viewerbeeld";
    beeld.href = doel; beeld.target = "_blank"; beeld.rel = "noopener noreferrer";
    beeld.innerHTML = `<img src="${v.voorbeeld}" loading="lazy" ` +
      `alt="Voorbeeld van de verkenner ${v.naam}"><span>Open de verkenner ↗</span>`;
    /* Ontbreekt het bestand toch, dan geen gebroken plaatje maar geen beeld. */
    beeld.querySelector("img").addEventListener("error", () => {
      beeld.remove(); grid.style.gridTemplateColumns = "1fr";
    }, {once: true});
    grid.appendChild(beeld);
  } else {
    grid.style.gridTemplateColumns = "1fr";
  }
  const tekst = document.createElement("div");
  grid.appendChild(tekst);
  box.appendChild(grid);

  const sub = document.createElement("div");
  sub.className = "sub";
  sub.textContent = v.omschrijving;
  tekst.appendChild(sub);
  if ((v.kunnen || []).length) {
    const intro = document.createElement("div");
    intro.className = "sub";
    intro.style.marginBottom = "0";
    intro.innerHTML = "<b>Wat je er kunt:</b>";
    const ul = document.createElement("ul");
    ul.innerHTML = v.kunnen.map(k => `<li>${k}</li>`).join("");
    tekst.appendChild(intro);
    tekst.appendChild(ul);
  }

  const knoppen = document.createElement("div");
  knoppen.className = "knoppen";
  if (v.modus === "facade") {
    const knop = document.createElement("button");
    knop.type = "button";
    knop.textContent = "Verkenner laden op deze pagina";
    knop.addEventListener("click", () => {
      const frame = document.createElement("iframe");
      frame.src = doel;
      frame.height = v.hoogte || 600;
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer";
      frame.title = v.naam;
      knop.remove();
      /* Onder het raster, over de volle breedte: in de tekstkolom zou hij een derde smal zijn. */
      box.insertBefore(frame, grid.nextSibling);
    }, {once: true});
    knoppen.appendChild(knop);
  }
  const extern = document.createElement("a");
  extern.className = "hoofdknop";
  extern.href = doel;
  extern.target = "_blank";
  extern.rel = "noopener noreferrer";
  extern.textContent = "Open de verkenner ↗";
  /* De hoofdknop vóór de knop om in te bedden: in een eigen tabblad is een product van 35 MB,
     of met een eigen bediening, het prettigst te gebruiken. */
  knoppen.prepend(extern);

  const selectie = document.createElement("span");
  selectie.className = "selectie";
  selectie.textContent = link
    ? `opent met ${link.selectie} geselecteerd`
    : "dit product kent geen selectie voor dit gebied; de link opent de stadskaart";
  knoppen.appendChild(selectie);
  tekst.appendChild(knoppen);

  const foot = document.createElement("div");
  foot.className = "foot";
  foot.textContent =
    `Bron: ${v.bron}` + (v.peiljaar ? ` (${v.peiljaar})` : "") +
    ` · niveau: ${v.niveau}. ${v.caveat} ` +
    "Dit is een apart product met een eigen bouw en eigen bronnen; de cijfers komen niet " +
    "uit deze pipeline en dragen dus niet de aggregatieverantwoording van dit dashboard. " +
    `Zonder internet blijft het leeg: ${v.url}`;
  box.appendChild(foot);

  sec.appendChild(box);

  /* "Meer details" bij de grafieken waar de vraag leeft (#98). De ankers komen uit de registry
     (scripts/viewers.py), niet uit een lijst hier. Een regel en geen tweede kaart: de lezer
     moet weten dat er een diepere verkenner is, niet twee keer dezelfde uitleg lezen. Een
     anker dat niet (meer) bestaat, meldt zich in de console en valt verder weg. */
  for (const anker of v.ankers || []) {
    const doelBlok = document.querySelector(`[data-onderwerp="${anker}"]`);
    if (!doelBlok) { console.warn(`[viewer] anker ${anker} bestaat niet voor ${v.naam}`); continue; }
    const regel = document.createElement("div");
    regel.className = "meer-details";
    regel.dataset.viewerAnker = v.sleutel;
    const a = document.createElement("a");
    a.href = doel; a.target = "_blank"; a.rel = "noopener";
    a.textContent = `Meer details → ${v.naam}`;
    regel.appendChild(a);
    regel.appendChild(document.createTextNode(
      " (extern product, opent in een nieuw tabblad" +
      (link ? `; selectie: ${link.selectie})` : "; toont heel Rotterdam)")));
    const voet = doelBlok.querySelector(":scope > .foot");
    if (voet) voet.before(regel); else doelBlok.appendChild(regel);
  }
}
});


veilig("aggregatie-verantwoording", () => {
/* ---------- #37: bij elk geaggregeerd cijfer tonen hoe het is samengesteld ----------
   Als laatste blok, zodat de kaartjes al bestaan (ook de lege slots uit de inventaris) en de
   badge in de kop terechtkomt in plaats van in een nog niet gerenderd element.

   De koppeling staat hier bij elkaar in plaats van verspreid over de grafiekblokken: dan is
   in één oogopslag te zien welke cijfers verantwoording dragen en welke nog niet. */
if (typeof D === "undefined") return;
const koppeling = [
  ["chLeeftijd", D.leeftijd],
  ["chHuish", D.huishoudens],
  ["chOpleiding", D.opleiding],
  ["chNabij", D.nabijheid],
];
for (const [canvasId, blok] of koppeling) {
  if (blok && blok.aggregatie) zetAggregatie(canvasId, blok.aggregatie);
}

/* Inkomen heeft twee maten met elk hun eigen verantwoording: per inkomensontvanger weegt
   naar het aantal ontvangers, per inwoner naar inwoners, en die kunnen verschillend
   onderdrukt zijn. Dus meeschakelen met de knop. */
const inkKnoppen = document.querySelectorAll("[data-ink]");
const zetInkomen = maat => zetAggregatie("chInkomen", (D.inkomen?.[maat] || {}).aggregatie);
if (inkKnoppen.length && D.inkomen) {
  inkKnoppen.forEach(btn =>
    btn.addEventListener("click", () => zetInkomen(btn.dataset.ink)));
  const actief = document.querySelector("[data-ink].actief");
  zetInkomen(actief ? actief.dataset.ink : "ontvanger");
}

/* Sectie 02 zet zijn eigen badge, want die wisselt per indicator: de ene indicator kan
   volledig zijn terwijl de andere vijf onderdrukte wijken heeft. Dat gebeurt in
   toonIndicator(); hier alleen de kerncijfers, die niet in een chart-box staan. */
const kern = (D.kerncijfers || {}).aggregatie;
const t = aggregatieTekst(kern);
const strip = document.getElementById("heroStrip");
if (t && strip && t.klasse === "ontbreekt") {
  /* Alleen melden als de tellingen onvolledig zijn. Een volledige som in de hero hoeft geen
     badge: daar staat al bij elke tegel uit welke bron en welk peiljaar hij komt. */
  const el = document.createElement("div");
  el.style.cssText = "flex-basis:100%;font-size:12.5px;margin-top:6px";
  el.innerHTML = `<b style="color:var(--rood)">${t.lang}</b>`;
  strip.appendChild(el);
}
});


veilig("sectienavigatie", () => {
/* ---------- #66: van verhaal naar naslagwerk ----------
   Scrollytelling is sterk om een gebied te leren kennen, één keer. Daarna komt een adviseur
   terug voor één cijfer, en dan is een lineaire pagina van negen secties het verkeerde
   gereedschap. Dit blok voegt twee dingen toe: een inhoudsopgave die meescrollt, en een
   zoekveld dat op naam naar een cijfer springt.

   Als laatste blok, zodat elk kaartje al bestaat — ook de lege slots uit de inventaris (#5)
   en de blokken die zichzelf verwijderen als hun bron ontbreekt. De index wordt uit de
   gerenderde pagina gelezen en niet uit een tweede lijst in de code: dan kan hij niet uit de
   pas lopen met wat er werkelijk staat. */
const secties = [...document.querySelectorAll("main > section")]
  .map(sec => {
    const eyebrow = sec.querySelector(".eyebrow")?.textContent.trim() || "";
    const nr = eyebrow.match(/^\d+/)?.[0] || "";
    /* "03 · Bevolking" -> naam "Bevolking". De hero heeft geen nummer en heet zo. */
    const naam = nr ? eyebrow.replace(/^\d+\s*·?\s*/, "") : "Overzicht";
    return {id: sec.id, nr, naam, el: sec};
  })
  .filter(s => s.id);
if (secties.length < 2) return;

const balk = document.createElement("div");
balk.className = "sectiebalk";
const nav = document.createElement("nav");
nav.setAttribute("aria-label", "Secties");
balk.appendChild(nav);

/* Springen doen we zelf in plaats van via een href-anker: de hash draagt al de gebiedscode
   (#gebied=…), dus een gewone ankerlink zou die overschrijven en het dashboard herladen op
   het standaardgebied. */
const linkVan = {};
for (const s of secties) {
  const a = document.createElement("a");
  a.href = "#";
  a.innerHTML = (s.nr ? `<span class="nr">${s.nr}</span>` : "") + s.naam;
  a.addEventListener("click", ev => { ev.preventDefault(); springNaar(s.id); });
  nav.appendChild(a);
  linkVan[s.id] = a;
}

/* ---------- zoeken op naam ---------- */
const wrap = document.createElement("div");
wrap.className = "zoekwrap";
wrap.innerHTML = '<input type="search" id="indicatorZoek" placeholder="Zoek een cijfer…" ' +
  'aria-label="Zoek een indicator of cijfer" autocomplete="off">';
balk.appendChild(wrap);

/* De index komt uit de pagina zelf: elke kaartkop, elke indicatorknop en elke sectietitel.
   Badges tellen niet mee als naam — die zeggen iets over het cijfer, niet welk cijfer het is. */
const index = [];
const sectieVan = el => el.closest("section")?.id;
document.querySelectorAll("main .chart-box").forEach(box => {
  const kop = box.querySelector("h4");
  if (!kop) return;
  const naam = [...kop.childNodes]
    .filter(n => n.nodeType === 3).map(n => n.nodeValue).join(" ")
    .replace(/\s+/g, " ").trim();
  if (!naam) return;
  const gepland = box.dataset.slot;
  index.push({
    naam, waar: gepland ? `nog niet in het dashboard (${gepland})` : null,
    sectie: sectieVan(box), doel: box,
  });
});
document.querySelectorAll("#buurtToggle button").forEach(btn => {
  index.push({
    naam: btn.textContent.trim(), waar: "vergelijking binnen het gebied",
    sectie: sectieVan(btn), doel: btn.closest(".chart-box"), knop: btn,
  });
});
for (const s of secties) {
  if (s.nr) index.push({naam: s.naam, waar: `sectie ${s.nr}`, sectie: s.id, doel: s.el});
}
/* Subsecties (#112): sectie 06 is opgesplitst per thema. Ze komen in het zoekvak en in een
   rij knoppen bovenaan hun sectie. Niet in de sectiebalk zelf: die moet op een telefoon op
   één regel blijven passen, en vijf extra items rekenen dat niet. */
const subNaam = sub => [...(sub.querySelector("h3")?.childNodes || [])]
  .filter(n => n.nodeType === 3).map(n => n.nodeValue).join(" ").replace(/\s+/g, " ").trim();
for (const s of secties) {
  const subs = [...s.el.querySelectorAll(":scope > .subsectie")].filter(sub => sub.id && subNaam(sub));
  subs.forEach(sub => index.push({naam: subNaam(sub), waar: `sectie ${s.nr}`, sectie: s.id, doel: sub}));
  const rij = s.el.querySelector(":scope > .subnav");
  if (!rij || !subs.length) continue;
  subs.forEach(sub => {
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = subNaam(sub);
    /* springNaar staat hieronder als functiedeclaratie en is dus al beschikbaar */
    a.addEventListener("click", ev => { ev.preventDefault(); springNaar(sub); });
    rij.appendChild(a);
  });
}

const zoekveld = wrap.querySelector("input");
let lijst = null;
const sluit = () => { lijst?.remove(); lijst = null; };

function toon(treffers) {
  sluit();
  lijst = document.createElement("ul");
  if (!treffers.length) {
    lijst.innerHTML = '<li class="leeg">Niets gevonden. Alles wat het dashboard toont staat ' +
      "in de datastatus-tabel in sectie 09.</li>";
  }
  for (const t of treffers.slice(0, 12)) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = t.naam + (t.waar ? `<span class="waar">${t.waar}</span>` : "");
    b.addEventListener("click", () => {
      sluit();
      zoekveld.value = "";
      /* Een indicatortreffer zet ook de grafiek op die indicator; anders spring je naar het
         kaartje en staat er nog een ander cijfer in. */
      if (t.knop) t.knop.click();
      springNaar(t.doel);
    });
    li.appendChild(b);
    lijst.appendChild(li);
  }
  wrap.appendChild(lijst);
}

zoekveld.addEventListener("input", () => {
  const q = zoekveld.value.trim().toLowerCase();
  if (q.length < 2) { sluit(); return; }
  /* Beginnend-met eerst, daarna elders-in-de-naam: bij "auto" wil je "Auto's per huishouden"
     boven "Wagenpark naar brandstof" met auto in de toelichting. */
  const begint = index.filter(i => i.naam.toLowerCase().startsWith(q));
  const bevat = index.filter(i => !begint.includes(i) && i.naam.toLowerCase().includes(q));
  toon([...begint, ...bevat]);
});
zoekveld.addEventListener("keydown", ev => {
  if (ev.key === "Escape") { sluit(); zoekveld.blur(); }
  if (ev.key === "ArrowDown" && lijst) { ev.preventDefault(); lijst.querySelector("button")?.focus(); }
  if (ev.key === "Enter" && lijst) { ev.preventDefault(); lijst.querySelector("button")?.click(); }
});
document.addEventListener("click", ev => { if (!wrap.contains(ev.target)) sluit(); });

/* ---------- plaatsing en meescrollen ---------- */
const gebiedsbalk = document.querySelector(".gebiedsbalk");
if (gebiedsbalk) gebiedsbalk.after(balk); else document.body.insertBefore(balk, document.body.firstChild);

/* De sectiebalk moet onder de gebiedsbalk blijven kleven. Die hoogte varieert — de balk mag
   afbreken op een smal scherm — dus meten in plaats van vastzetten. */
function plaatsBalk() {
  const h = gebiedsbalk ? gebiedsbalk.offsetHeight : 0;
  balk.style.top = h + "px";
  /* De subsectierijen (#136) kleven onder beide balken. */
  document.querySelectorAll(".subnav").forEach(r => { r.style.top = (h + balk.offsetHeight) + "px"; });
  return h + balk.offsetHeight;
}
let vasteHoogte = plaatsBalk();
window.addEventListener("resize", () => { vasteHoogte = plaatsBalk(); });

function springNaar(doel) {
  const el = typeof doel === "string" ? document.getElementById(doel) : doel;
  if (!el) return;
  /* Zelf rekenen in plaats van scrollIntoView: die schuift het doel onder de twee sticky
     balken, en dan lijkt het alsof je op de verkeerde plek bent aangekomen. */
  const soepel = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* Binnen een sectie met een zwevende subsectierij valt die ook nog over het doel heen. */
  const rij = el.closest("section")?.querySelector(":scope > .subnav");
  const extra = rij && rij.offsetHeight && el !== el.closest("section") ? rij.offsetHeight : 0;
  const y = el.getBoundingClientRect().top + window.scrollY - vasteHoogte - extra - 8;
  window.scrollTo({top: Math.max(0, y), behavior: soepel ? "smooth" : "instant"});
  /* De reveal-animatie zet nieuwe blokken op opacity:0 tot ze in beeld komen. Bij een sprong
     is het doel per definitie in beeld, dus meteen aanzetten — anders spring je naar iets
     onzichtbaars. */
  el.classList.add("on");
  el.querySelectorAll(".reveal").forEach(n => n.classList.add("on"));
}

/* Welke sectie is in beeld? Met de sticky balken als bovengrens, zodat de markering omslaat
   op het moment dat de kop onder de balk verdwijnt en niet pas halverwege. */
if ("IntersectionObserver" in window) {
  const zichtbaar = new Set();
  const obs = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) zichtbaar.add(e.target.id); else zichtbaar.delete(e.target.id);
    }
    const eerste = secties.find(s => zichtbaar.has(s.id));
    for (const s of secties) {
      const a = linkVan[s.id];
      if (eerste && s.id === eerste.id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
    if (eerste) linkVan[eerste.id].scrollIntoView({block: "nearest", inline: "nearest"});
  }, {rootMargin: `-${vasteHoogte + 10}px 0px -55% 0px`});
  secties.forEach(s => obs.observe(s.el));

  /* Welke subsectie is in beeld (#136)? Zelfde aanpak als bij de secties, met de zwevende rij
     erbij als bovengrens. */
  document.querySelectorAll("section > .subnav").forEach(rij => {
    const subs = [...rij.parentElement.querySelectorAll(":scope > .subsectie")];
    const links = [...rij.querySelectorAll("a")];
    if (!subs.length || subs.length !== links.length) return;
    const inBeeld = new Set();
    const subObs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) inBeeld.add(e.target); else inBeeld.delete(e.target);
      }
      const eerste = subs.findIndex(sb => inBeeld.has(sb));
      links.forEach((a, i) => {
        if (i === eerste) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
      if (eerste >= 0) links[eerste].scrollIntoView({block: "nearest", inline: "nearest"});
    }, {rootMargin: `-${vasteHoogte + rij.offsetHeight + 10}px 0px -55% 0px`});
    subs.forEach(sb => subObs.observe(sb));
  });
}
});


veilig("signalering", () => {
/* ---------- #67: waar valt dit gebied op? ----------
   Negen secties, ruwweg veertig cijfers, allemaal in dezelfde toon. Een adviseur moet daaruit
   een handvol kandidaat-opgaven halen en doet dat nu door alles te lezen. Het dashboard weet
   meer dan het zegt: sinds #48 staan de peers erbij, dus het kán uitrekenen waar dit gebied
   het meest uit de toon valt.

   Dit is beschrijvend, niet normatief. Er staat waar het verschil groot is, niet dat het
   slecht is, niet welke kant goed is, en er komt geen kleur aan te pas. Dat blijft #30. */
const box = document.getElementById("signaleringBox");
const tb = document.querySelector("#signaleringTabel tbody");
if (!box || !tb || typeof D === "undefined") return;

/* Alle gebieden op hetzelfde niveau, niet alleen de zusters uit het eigen rayon: bij WOZ,
   inkomen en armoede speelt de omvang van het gebied geen rol, en een rayon van drie gebieden
   zou maar twee peers opleveren. */
const {peers, groepNaam, mogelijk} = peersOpNiveau(() => true, false);
/* Onder de drie peers is elke uitspraak over spreiding schijnprecisie: met twee vergelijkingen
   is "de hoogste van allemaal" een toevalligheid. Dan liever niets tonen dan iets zwaks — maar
   wél zeggen waaróm, en of dat aan de indeling ligt of aan wat er gebouwd is. */
if (peers.length < 3) {
  box.hidden = false;
  document.getElementById("signaleringSub").textContent = mogelijk < 3
    ? `Op ${GEBIEDNIVEAU}niveau zijn er ${mogelijk} vergelijkbare gebieden. Dat is te weinig ` +
      "om iets over spreiding te zeggen — dit is een eigenschap van de indeling, niet iets " +
      "wat door meer te bouwen verandert."
    : `${peers.length} van de ${mogelijk} vergelijkbare gebieden zijn gebouwd. Vanaf drie is ` +
      "er iets over spreiding te zeggen; bouw de rest met --alle-gebieden.";
  document.querySelector("#signaleringTabel").hidden = true;
  document.getElementById("signaleringFoot").textContent = "";
  return;
}

const BV = D.buurtVergelijk || {};
const nl = (v, dec) => v == null ? "—"
  : v.toLocaleString("nl-NL", {minimumFractionDigits: dec, maximumFractionDigits: dec});

const regels = [];
for (const [sleutel, ind] of Object.entries(BV.indicatoren || {})) {
  const eigen = ind.wijk;
  if (typeof eigen !== "number") continue;
  const waarden = peers
    .map(p => (p.indicatoren || {})[sleutel])
    .filter(i => i && typeof i.waarde === "number" && i.volledig !== false)
    .map(i => i.waarde);
  if (waarden.length < 3) continue;
  const laag = Math.min(...waarden), hoog = Math.max(...waarden);
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const midden = gesorteerd.length % 2
    ? gesorteerd[(gesorteerd.length - 1) / 2]
    : (gesorteerd[gesorteerd.length / 2 - 1] + gesorteerd[gesorteerd.length / 2]) / 2;
  /* Afwijking uitdrukken in de spreiding van de peers zelf, niet in procenten: 10% verschil
     bij armoede is iets heel anders dan 10% bij de WOZ. Het verschil met de mediaan gedeeld
     door de spreidingsbreedte is in één regel uit te leggen en heeft geen verdelingsaanname
     nodig — met vier peers is een standaarddeviatie schijnprecisie. */
  const breedte = hoog - laag;
  const afwijking = breedte > 0 ? (eigen - midden) / breedte : 0;
  const dec = Math.max(0, (ind.eenheid || "").includes("€ 1.000") ? 0 : 1);
  regels.push({
    sleutel, naam: ind.naam, eenheid: ind.eenheid, eigen, laag, hoog, afwijking, dec,
    /* Onvolledig eigen cijfer: dan is de afwijking gebaseerd op een ondergrens en zegt hij
       niets. Wel tonen, met het voorbehoud, in plaats van stil weglaten (#37). */
    onvolledig: (ind.aggregatie || {}).volledig === false,
    nOnderdrukt: (ind.aggregatie || {}).nOnderdrukt || 0,
    positie: eigen > hoog ? "hoger dan alle vergelijkbare gebieden"
      : eigen < laag ? "lager dan alle vergelijkbare gebieden"
      : "binnen de spreiding",
  });
}
if (!regels.length) return;
regels.sort((a, b) => Math.abs(b.afwijking) - Math.abs(a.afwijking));

for (const r of regels) {
  const tr = document.createElement("tr");
  const buiten = r.positie !== "binnen de spreiding";
  tr.innerHTML =
    `<td><a href="#" data-naar="${r.sleutel}">${r.naam}</a>` +
    (r.onvolledig
      ? `<div style="font-size:11.5px"><b style="color:var(--rood)">ondergrens: ` +
        `${r.nOnderdrukt} wijk(en) onderdrukt, dus deze positie is onzeker</b></div>`
      : "") +
    "</td>" +
    `<td class="getal"><b>${nl(r.eigen, r.dec)}</b><div style="font-size:11px;color:#7a7a6c">` +
    `${r.eenheid}</div></td>` +
    `<td>${nl(r.laag, r.dec)} – ${nl(r.hoog, r.dec)}<div style="font-size:11px;color:#7a7a6c">` +
    `${peers.length} ${groepNaam}</div></td>` +
    `<td>${buiten ? "<b>" + r.positie + "</b>" : r.positie}` +
    `<div style="font-size:11px;color:#7a7a6c">afstand tot de mediaan: ` +
    `${r.afwijking > 0 ? "+" : ""}${r.afwijking.toLocaleString("nl-NL", {maximumFractionDigits: 2})}` +
    "× de spreidingsbreedte</div></td>";
  tb.appendChild(tr);
}
/* Klik op een indicatornaam zet de vergelijkingsgrafiek erop en springt erheen — dezelfde
   handeling als de zoeker uit #66, zodat een signaal meteen na te kijken is. */
tb.querySelectorAll("a[data-naar]").forEach(a => {
  a.addEventListener("click", ev => {
    ev.preventDefault();
    document.querySelector(`#buurtToggle button[data-key="${a.dataset.naar}"]`)?.click();
    document.getElementById("chBuurt")?.closest(".chart-box")
      ?.scrollIntoView({block: "center"});
  });
});

const buitenSpreiding = regels.filter(r => r.positie !== "binnen de spreiding" && !r.onvolledig);
document.getElementById("signaleringSub").textContent = buitenSpreiding.length
  ? `${buitenSpreiding.length} van de ${regels.length} indicatoren ` +
    `${buitenSpreiding.length === 1 ? "ligt" : "liggen"} buiten de spreiding ` +
    `van de ${peers.length} ${groepNaam}: ` +
    buitenSpreiding.map(r => r.naam.toLowerCase()).join(", ") +
    ". Gesorteerd op afstand tot de mediaan van die groep."
  : `Geen van de ${regels.length} indicatoren ligt buiten de spreiding van de ${peers.length} ` +
    `${groepNaam}. Gesorteerd op afstand tot de mediaan van die groep.`;
document.getElementById("signaleringFoot").innerHTML =
  "<b>Beschrijvend, niet beoordelend.</b> Hier staat waar het verschil groot is, niet of dat " +
  "goed of slecht is: welke kant wenselijk is volgt uit beleid, niet uit de cijfers. " +
  "Rekenregel: het verschil tussen dit gebied en de mediaan van de vergelijkbare gebieden, " +
  `gedeeld door de breedte van hun spreiding. Bij ${peers.length} vergelijkingen is dat een ` +
  "grove maat — hij ordent, hij meet niet. Onvolledige cijfers (onderdrukte wijken) blijven " +
  "buiten de vergelijking van de peers en staan met een voorbehoud in de lijst.";
box.hidden = false;
});


veilig("feitenblad", () => {
/* ---------- #68: het gebied als citeerbare tekst ----------
   Het eindproduct van een adviseur is een document. Elk cijfer moet met bron, peiljaar en
   aggregatieniveau in een gebiedsplan belanden, en overtypen uit een browser is precies waar
   de bronvermelding sneuvelt — de regel waar dit dashboard op gebouwd is.

   Eén ingang in plaats van twintig knopjes: een paneel met de volledige tekst, een
   kopieerknop en een printknop. Wie één cijfer wil, selecteert die regel; wie de hele
   mobiliteitsparagraaf begint, neemt het geheel. */
if (typeof D === "undefined") return;
const balk = document.querySelector(".sectiebalk");
if (!balk) return;

/* dec = null: tot één decimaal, zonder opvulling. Een vast aantal decimalen per eenheid gaf
   fouten in beide richtingen — 46 waar de bron 45,9 zegt, of 25,0 waar 25 hoort. */
const nl1 = (v, dec = 1) => v == null ? "onbekend"
  : v.toLocaleString("nl-NL", dec === null
    ? {maximumFractionDigits: 1}
    : {minimumFractionDigits: dec, maximumFractionDigits: dec});
const heel = v => v == null ? "onbekend" : v.toLocaleString("nl-NL");

/* Regels afbreken op 96 tekens, want dit is platte tekst die in een Word-document belandt en
   een regel van 400 tekens is daar onleesbaar. */
function wikkel(tekst, indent = "    ", breedte = 96) {
  const woorden = String(tekst).split(/\s+/).filter(Boolean);
  const uit = [];
  let regel = indent;
  for (const w of woorden) {
    if (regel.length + w.length + 1 > breedte && regel.trim()) { uit.push(regel); regel = indent; }
    regel += (regel === indent ? "" : " ") + w;
  }
  if (regel.trim()) uit.push(regel);
  return uit;
}

/* De bronregel bevat bron én caveat én de wegingsuitleg door elkaar. Voor de bronnenlijst
   alleen de tabelverwijzing; de caveat hoort bij de indicator waar hij over gaat, niet in een
   lijst waar hij tien bijna-duplicaten oplevert. */
const kortebron = s => (/^(.*?\(tabel[^)]*\))/.exec(s) || [null, String(s).split(". ")[0]])[1];

/* Verantwoording van een geaggregeerd cijfer in één regel. Een ondergrens moet ook in de
   gekopieerde tekst als ondergrens leesbaar zijn: juist bij overnemen mag dat voorbehoud niet
   wegvallen, want dan reist een ondergrens als totaal het plan in (#37). */
function verantwoording(meta) {
  if (!meta || meta.regel === "gepubliceerd") return "gepubliceerd wijkcijfer (CBS)";
  const n = meta.nWijken || meta.nGebruikt || 0;
  const hoe = meta.gewicht ? "gewogen naar " + meta.gewicht : "opgeteld";
  return "samengesteld uit " + n + " wijken, " + hoe +
    (meta.volledig === false
      ? " — LET OP: " + (meta.nOnderdrukt || 0) + " wijk(en) onderdrukt, dit is een ondergrens"
      : "");
}

function bouwTekst() {
  const r = [];
  const bronnen = new Set();
  const k = D.kerncijfers || {};
  r.push("FEITENBLAD — " + GEBIEDNAAM + " (" + GEBIEDNIVEAU + ")");
  r.push(...wikkel("Gegenereerd " + new Date().toLocaleDateString("nl-NL") +
    " uit het dashboard datalade gebiedsplannen. Alle cijfers met bron en peiljaar; " +
    "niets is afgerond buiten wat de bron zelf publiceert.", ""));
  r.push("");
  r.push("KERNCIJFERS (CBS Kerncijfers wijken en buurten " + (k.peiljaar || "?") + ")");
  r.push("  inwoners                 " + heel(k.inwoners));
  r.push("  huishoudens              " + heel(k.huishoudens));
  r.push("  woningen                 " + heel(k.woningen));
  r.push("  landoppervlak            " + nl1(k.oppervlakteLandKm2) + " km2");
  r.push(...wikkel(verantwoording(k.aggregatie), "  "));
  bronnen.add("CBS Kerncijfers wijken en buurten " + (k.peiljaar || "") + " (OData)");

  const bv = D.buurtVergelijk || {};
  if (bv.indicatoren) {
    r.push("");
    r.push("INDICATOREN — gebiedscijfer met de spreiding tussen de buurten");
    for (const ind of Object.values(bv.indicatoren)) {
      const w = (ind.values || []).filter(v => typeof v === "number");
      /* Geen vaste decimalen per eenheid: dan werd 45,9 (inkomen per ontvanger) afgerond op
         46 omdat de eenheid "× € 1.000" bevat, terwijl de bron één decimaal publiceert. Tot
         één decimaal, zonder opvulling — 404 blijft 404 en 45,9 blijft 45,9. */
      const dec = null;
      r.push("  " + ind.naam + " (" + ind.eenheid + "), peiljaar " + (ind.peiljaar || "?"));
      r.push("    " + GEBIEDNAAM + ": " + nl1(ind.wijk, dec) +
        (typeof ind.rdam === "number" ? "   " + GEMEENTENAAM + ": " + nl1(ind.rdam, dec) : ""));
      if (w.length) {
        r.push("    buurten: " + nl1(Math.min(...w), dec) + " – " + nl1(Math.max(...w), dec) +
          " (" + w.length + " van " + (ind.values || []).length + " gepubliceerd)");
      }
      r.push(...wikkel(verantwoording(ind.aggregatie), "    "));
      if (ind.foot) {
        const schoon = ind.foot.replace(/^Bron:\s*/, "").split(" Gebiedswaarde")[0].trim();
        bronnen.add(kortebron(schoon));
        /* De caveat staat achter de bronverwijzing in dezelfde regel; die hoort mee, want een
           cijfer zonder zijn voorbehoud is in een plan gevaarlijker dan geen cijfer. */
        const caveat = schoon.slice(kortebron(schoon).length).replace(/^\.\s*/, "").trim();
        if (caveat) r.push(...wikkel(caveat, "      "));
      }
    }
  }

  const bd = (typeof CBSMOB !== "undefined" && CBSMOB.nabijheid)
    ? CBSMOB.nabijheid.binnenDrempel : null;
  if (bd) {
    r.push("");
    r.push("BEREIKBAARHEID — aandeel inwoners binnen de drempelafstand");
    for (const d of Object.values(bd)) {
      if (d.aandeel == null) continue;
      r.push("  " + d.naam + " binnen " + nl1(d.km) + " km: " + nl1(d.aandeel) + "% (" +
        heel(d.inwonersBuiten) + " inwoners daarbuiten)");
    }
    r.push("    De drempel is een keuze, vastgelegd in scripts/indicatoren.py. Het aandeel is");
    r.push("    afgeleid uit buurtgemiddelden: een buurt telt volledig binnen of buiten mee.");
    bronnen.add(CBSMOB.nabijheid.bron);
  }

  const zelf = (typeof ODINW !== "undefined" && !ODINW.leeg && ODINW.bestemmingen)
    ? ODINW.bestemmingen.delen : null;
  if (zelf) {
    const drempel = (ODINW.drempel && ODINW.drempel.nMin) || 20;
    r.push("");
    r.push("ZELFVOORZIENENDHEID — waar beginnen en eindigen verplaatsingen");
    const delen = [["binnenWijk", "binnen het gebied"],
      ["binnenGemeente", "elders in de gemeente"], ["buitenGemeente", "buiten de gemeente"]];
    for (const paar of delen) {
      const deel = zelf[paar[0]] || {};
      r.push("  " + paar[1].padEnd(24) + " " + (deel.n != null && deel.n < drempel
        ? "niet getoond (n=" + deel.n + ", onder de drempel van " + drempel + ")"
        : nl1(deel.share) + "%  (n=" + heel(deel.n) + ")"));
    }
    r.push("    Steekproef, PC4-benadering van de gebiedsgrens. Een groter gebied houdt per");
    r.push("    definitie meer binnen, dus vergelijken tussen niveaus is onzinnig.");
    bronnen.add(ODINW.bron);
  }

  if (typeof INFRA !== "undefined") {
    r.push("");
    r.push("NETWERK EN BARRIERES");
    r.push("  vrijliggend fietspad     " + nl1(INFRA.kmVrijliggendFietspad) + " km");
    const refs = (INFRA.barriereRefs || []).join(", ");
    r.push("  snelwegen                " + (refs || "geen snelweg in of langs dit gebied"));
    r.push("  fietskruisingen          " + heel(INFRA.snelwegKruisingenFiets));
    const o = INFRA.omrijfactor || {};
    if (o.kruisendSnelweg && o.kruisendSnelweg.mediaan != null) {
      r.push("  omrijfactor kruisend     " + nl1(o.kruisendSnelweg.mediaan, 2) + "x (n=" +
        o.kruisendSnelweg.n + "), zelfde zijde " + nl1(o.zelfdeZijde.mediaan, 2) + "x");
    }
    bronnen.add(INFRA.bron);
  }

  if (typeof OV !== "undefined" && !OV.leeg && Array.isArray(OV.lijnen)) {
    /* ov.js levert lijnen en haltes, geen samenvatting — die rekent de tabel in sectie 06
       zelf uit. Hier dus opnieuw optellen in plaats van een veld te verzinnen dat niet
       bestaat; anders viel het OV-blok stil weg uit het feitenblad. */
    const perSoort = {};
    for (const l of OV.lijnen) {
      const s = perSoort[l.soort] || (perSoort[l.soort] = {lijnen: 0, ritten: 0});
      s.lijnen += 1;
      s.ritten += l.ritten || 0;
    }
    const haltesBinnen = (OV.haltes || []).filter(h => h.binnen).length;
    r.push("");
    r.push("OV-AANBOD (GTFS-dienstregeling " + (OV.peildatum || "?") + ")");
    for (const soort of Object.keys(perSoort).sort()) {
      const s = perSoort[soort];
      r.push("  " + soort.padEnd(10) + String(s.lijnen).padStart(3) + " lijnen, " +
        String(heel(s.ritten)).padStart(6) + " ritten/dag");
    }
    r.push("  haltes binnen de grens: " + heel(haltesBinnen) + " van " +
      heel((OV.haltes || []).length) + " in of nabij het gebied");
    bronnen.add(OV.bron);
  }

  r.push("");
  r.push("BRONNEN");
  const lijst = [...bronnen].filter(Boolean).sort();
  for (const b of lijst) r.push("  - " + b);
  r.push("");
  r.push("Alle bronnen zijn open en jaarlijks gepubliceerd. Interpretatie staat niet in dit");
  r.push("feitenblad: die hoort in het duidingsblok, expliciet gelabeld.");
  return r.join("\n");
}

/* ---------- paneel ---------- */
const knop = document.createElement("button");
knop.type = "button";
knop.className = "feitenknop";
knop.textContent = "Feitenblad";
knop.title = "Alle cijfers met bron en peiljaar als tekst, om over te nemen in een plan";
balk.appendChild(knop);

const dialoog = document.createElement("div");
dialoog.id = "feitenblad";
dialoog.innerHTML =
  '<div class="paneel" role="dialog" aria-modal="true" aria-label="Feitenblad">' +
  "<header><h3>Feitenblad — " + GEBIEDNAAM + "</h3>" +
  '<span class="melding" id="feitenMelding"></span>' +
  '<button type="button" class="feitenknop" id="feitenKopieer">Kopieer alles</button>' +
  '<button type="button" class="feitenknop" id="feitenPrint">Print / PDF</button>' +
  '<button type="button" class="feitenknop" id="feitenSluit">Sluiten</button></header>' +
  '<textarea readonly spellcheck="false" id="feitenTekst"></textarea></div>';
document.body.appendChild(dialoog);
const veld = dialoog.querySelector("#feitenTekst");
const melding = dialoog.querySelector("#feitenMelding");

knop.addEventListener("click", () => {
  veld.value = bouwTekst();
  dialoog.setAttribute("open", "");
  melding.textContent = "";
  veld.focus();
  veld.setSelectionRange(0, 0);
});
const sluit = () => dialoog.removeAttribute("open");
dialoog.querySelector("#feitenSluit").addEventListener("click", sluit);
dialoog.addEventListener("click", ev => { if (ev.target === dialoog) sluit(); });
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && dialoog.hasAttribute("open")) sluit();
});
dialoog.querySelector("#feitenPrint").addEventListener("click", () => {
  sluit();
  window.print();
});
dialoog.querySelector("#feitenKopieer").addEventListener("click", () => {
  /* Onder file:// is de Clipboard API niet altijd toegestaan. Dan valt het terug op de
     selectie in het tekstveld, zodat Ctrl+C werkt — geen bibliotheek, geen stille
     mislukking, en de gebruiker weet wat hij moet doen. */
  veld.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(veld.value)
      .then(() => { melding.textContent = "gekopieerd"; })
      .catch(() => { melding.textContent = "selectie staat klaar — gebruik Ctrl+C"; });
  } else {
    melding.textContent = "selectie staat klaar — gebruik Ctrl+C";
  }
});
});


veilig("kaart-alles", () => {
/* ---------- #12: alle kaartlagen op één kaart ----------
   Er zijn zes losse kaarten, elk met hun eigen stukje context. Je kunt lagen dus nooit over
   elkaar heen leggen, terwijl juist de combinatie de vraag beantwoordt: liggen de ongevallen
   op de plek waar het fietsnetwerk onderbroken is, wonen de mensen zonder supermarkt binnen
   bereik ook aan de drukke kant van de snelweg.

   Dit vervangt de sectiekaarten niet — die blijven de focusweergave bij hun eigen verhaal.
   Dit voegt de integrale kaart toe, onderaan, waar je zelf combineert.

   Elke laag wordt pas gebouwd als je hem aanzet. Op gemeenteniveau zijn het duizenden punten;
   alles vooraf opbouwen zou de pagina seconden laten staan voor lagen die niemand aanzet. */
if (typeof L === "undefined") return;
const el = document.getElementById("kaartAlles");
const box = document.getElementById("alleslaagBox");
if (!el || !box || typeof GEO === "undefined" || !GEO.features) return;

const kaart = L.map("kaartAlles", {scrollWheelZoom: false});
basiskaart().addTo(kaart);

/* De gebiedsgrens staat altijd aan: zonder die omtrek weet je niet waar je kijkt. */
const grens = L.geoJSON({type: "FeatureCollection", features: GEO.features},
  {style: {color: ASFALT, weight: 1.5, fill: false, dashArray: "4 3"}}).addTo(kaart);
kaart.fitBounds(grens.getBounds(), {padding: [12, 12]});

/* laagnaam -> functie die de laag bouwt. Pas uitgevoerd bij de eerste keer aanzetten. */
const bouwers = {};
const gebouwd = {};

if (typeof OV !== "undefined" && !OV.leeg && Array.isArray(OV.haltes)) {
  bouwers["OV-haltes"] = () => L.layerGroup(OV.haltes.map(h => {
    const soorten = (h.lijnen || []).map(nr =>
      (OV.lijnen || []).find(l => l.lijn === nr)?.soort).filter(Boolean);
    const soort = ["trein", "metro", "tram", "veer"].find(s => soorten.includes(s)) || "bus";
    return L.circleMarker([h.lat, h.lon], {
      radius: soort === "bus" ? 3 : 5, color: KLEUR_SOORT[soort] || GRIJS,
      weight: 1, fillOpacity: h.binnen ? .85 : .35,
    }).bindPopup(`<b>${h.naam}</b><br>${soort} · ${getalNL(h.vertrekken)} vertrekken/dag` +
      (h.binnen ? "" : "<br><i>net buiten de gebiedsgrens</i>"));
  }));
  bouwers["OV-lijnen"] = () => L.layerGroup((OV.lijnen || [])
    .filter(l => Array.isArray(l.geom) && l.geom.length)
    .map(l => L.polyline(l.geom, {
      color: KLEUR_SOORT[l.soort] || GRIJS, weight: l.soort === "bus" ? 1.5 : 2.5, opacity: .7,
    }).bindPopup(`<b>${l.soort} ${l.lijn}</b><br>${l.traject}<br>` +
      `${getalNL(l.ritten)} ritten/dag · ${l.vervoerder}`)));
}

if (typeof INFRA !== "undefined" && INFRA.fietsnet) {
  bouwers["Vrijliggend fietspad"] = () =>
    L.geoJSON(INFRA.fietsnet, {style: {color: POLDER, weight: 2, opacity: .8}});
}

if (typeof VOORZ !== "undefined" && Array.isArray(VOORZ.punten)) {
  /* Dezelfde kleuren als de voorzieningenkaart hierboven, zodat een categorie op beide
     kaarten dezelfde kleur heeft. Die tabel staat daar binnen het blok, dus hier opnieuw —
     twee kopieen van vijf kleuren is minder erg dan een globale die niemand verwacht. */
  const CAT_KLEUR = {zorg: "#B0452F", onderwijs: GEEL, cultuur: SCHIE, dagelijks: ASFALT,
    sport: POLDER};
  const perCat = {};
  for (const p of VOORZ.punten) (perCat[p.cat] = perCat[p.cat] || []).push(p);
  for (const [cat, punten] of Object.entries(perCat)) {
    const label = VOORZ.categorieen?.[cat] || cat;
    bouwers["Voorzieningen: " + label] = () =>
      L.layerGroup(punten.map(p => L.circleMarker([p.lat, p.lon], {
        radius: 4, color: "#FAFAF5", weight: 1,
        fillColor: CAT_KLEUR[cat] || GRIJS, fillOpacity: .9,
      }).bindPopup(`<b>${p.n || "(naamloos)"}</b><br>${label}`)));
  }
}

if (typeof ONGEVALLEN !== "undefined" && !ONGEVALLEN.leeg) {
  const cellen = ONGEVALLEN.raster?.cellen || [];
  if (cellen.length) {
    /* Hotspotraster in plaats van losse punten: dat is de laag die met andere lagen te
       combineren valt zonder het beeld dicht te stippen. */
    const max = Math.max(...cellen.map(c =>
      Object.values(c.perJaar).reduce((s, j) => s + Object.values(j).reduce((a, b) => a + b, 0), 0)));
    bouwers["Ongevallen (hotspots)"] = () => L.layerGroup(cellen.map(c => {
      const totaal = Object.values(c.perJaar)
        .reduce((s, j) => s + Object.values(j).reduce((a, b) => a + b, 0), 0);
      const [zuid, west, noord, oost] = c.bbox;
      return L.rectangle([[zuid, west], [noord, oost]], {
        color: "#B0452F", weight: 0, fillOpacity: .15 + .55 * (totaal / (max || 1)),
      }).bindPopup(`<b>${totaal} ongeval(len)</b> in deze cel van 100 m<br>` +
        Object.entries(c.perJaar).map(([j, v]) =>
          `${j}: ${Object.entries(v).map(([k, n]) => `${k} ${n}`).join(", ")}`).join("<br>"));
    }));
  }
}

/* CBS 100 m-vierkanten en luchtkwaliteit zijn WMS-lagen: die zijn licht om aan te zetten,
   want de server tekent ze. Alleen de nieuwste PDOK-jaargang, zoals de kaart in sectie 02. */
/* Registreren zonder op de jaargang (cbsWms) te wachten: dat wordt asynchroon gevonden en is op dit moment
   nog null. De jaargang wordt pas gebruikt bij het aanzetten van de laag, en ontbreekt hij dan
   nog, dan zegt de melding dat — in plaats van dat de laag stil afwezig is. */
bouwers["CBS 100 m: inwoners"] = () => {
  if (!cbsWms) {
    /* De jaargang wordt bij het laden van de pagina opgezocht en dat duurt een paar seconden.
       Niet als gebouwd markeren, dus een tweede klik probeert het opnieuw. */
    throw new Error("PDOK-jaargang nog niet gevonden — probeer het over een paar seconden " +
      "opnieuw, of PDOK is niet bereikbaar");
  }
  return L.tileLayer.wms(cbsWms.url("cbsvierkant100m_aantal_inwoners"), {
    layers: "vierkant_100m", styles: "cbsvierkant100m_aantal_inwoners",
    format: "image/png", transparent: true, opacity: .6,
    attribution: "CBS vierkantstatistieken via PDOK (CC BY 4.0)",
  });
};
/* Laagnamen uit de bestaande keuzelijst in sectie 06 in plaats van hier hergetypt: mijn eerste
   versie had een verzonnen naam (rivm_nsl_..._no22022) die stil niets opleverde. Eén plek waar
   die namen staan, en als RIVM ze wijzigt breekt het op één plek. */
for (const optie of document.querySelectorAll("#luchtStof option")) {
  bouwers["Lucht: " + optie.textContent.trim()] = () =>
    L.tileLayer.wms("https://data.rivm.nl/geo/alo/wms", {
      layers: optie.value, format: "image/png", transparent: true, opacity: .5,
      attribution: "RIVM/NSL-monitoring via Atlas Leefomgeving",
    });
}

const namen = Object.keys(bouwers);
if (!namen.length) return;

/* Leaflet's eigen laagbeheer: geen eigen widget, want dit is precies waar het voor bestaat en
   een adviseur kent het uit elke kaartviewer. */
const beheer = L.control.layers(null, {}, {collapsed: false, position: "topright"}).addTo(kaart);
const proxy = {};
for (const naam of namen) {
  /* Een lege laaggroep als plaatshouder: Leaflet wil een laagobject om te kunnen aanvinken,
     en de echte inhoud komt er pas in bij de eerste activering. */
  proxy[naam] = L.layerGroup();
  beheer.addOverlay(proxy[naam], naam);
}
kaart.on("overlayadd", ev => {
  const naam = namen.find(n => proxy[n] === ev.layer);
  if (!naam || gebouwd[naam]) return;
  try {
    const laag = bouwers[naam]();
    laag.addTo(proxy[naam]);
    gebouwd[naam] = true;
  } catch (e) {
    console.warn(`[kaart-alles] laag ${naam} kon niet gebouwd worden:`, e);
    /* De reden erbij: "kon niet geladen worden" laat de lezer met niets achter, en bij de
       PDOK-laag is de reden juist dat hij het over een paar seconden wél kan. */
    document.getElementById("alleslaagLegenda").innerHTML =
      `<b style="color:var(--rood)">Laag “${naam}” kon niet geladen worden: ${e.message}</b>`;
  }
});

document.getElementById("alleslaagSub").textContent =
  `${namen.length} lagen om te combineren. Zet aan wat je naast elkaar wilt zien — de losse ` +
  "kaarten in de secties hierboven blijven bestaan als focusweergave bij hun eigen verhaal.";
document.getElementById("alleslaagFoot").textContent =
  "Lagen worden pas opgebouwd als je ze aanzet; op gemeenteniveau zijn het duizenden punten. " +
  "Klik op een element voor de details. Bronnen staan bij de losse kaarten in de secties " +
  "hierboven, met peiljaar en caveat per laag.";
box.hidden = false;
/* Leaflet berekent zijn afmetingen bij het aanmaken; het kaartje zat toen nog in een
   verborgen blok. Zonder dit blijft de kaart een grijs vlak tot je het venster verschaalt.
   En opnieuw passend maken: de fitBounds hierboven rekende met een kaart van 0 × 0 px en
   kwam daardoor uit op zoom 19, een paar straten groot. Daar tekent een WMS-laag niets
   (Leaflet stopt bij zoom 18), dus de 100 m-laag leek ook na #115 niet te laden. */
setTimeout(() => {
  kaart.invalidateSize();
  kaart.fitBounds(grens.getBounds(), {padding: [12, 12]});
}, 0);
});


veilig("tijdreeks", () => {
/* ---------- #9: ontwikkeling in de tijd ----------
   Een opgave is vaak een beweging, geen niveau. De WOZ van Noord buiten de Ring ging van 193
   naar 404 sinds 2016; dat is een ander verhaal dan "de WOZ is 404". Zonder tijdreeks is een
   probleem niet van een schommeling te onderscheiden.

   Breuken worden niet weggeïnterpoleerd: waar de bron geen cijfer geeft, of waar niet alle
   wijken van dit gebied een cijfer hebben, ligt de lijn open. Een doorgetrokken lijn over een
   definitiewijziging is een bewering die CBS niet doet. */
if (typeof D === "undefined" || !D.reeksen || typeof Chart === "undefined") return;
const box = document.getElementById("reeksBox");
const canvas = document.getElementById("chReeks");
const toggle = document.getElementById("reeksToggle");
if (!box || !canvas || !toggle) return;

/* Alleen reeksen met minstens drie punten: met twee jaargangen is "ontwikkeling" een groot
   woord voor een streepje tussen twee stippen. */
const bruikbaar = Object.entries(D.reeksen)
  .filter(([, r]) => (r.waarden || []).filter(w => w !== null).length >= 3);
if (!bruikbaar.length) return;

let grafiek = null;
const nl1 = v => v == null ? "—" : v.toLocaleString("nl-NL", {maximumFractionDigits: 1});

function toon(sleutel) {
  const r = D.reeksen[sleutel];
  const punten = r.waarden.map((w, i) => (r.volledig[i] === false && w !== null) ? w : w);
  /* Een jaar waarin niet alle wijken een cijfer hebben is een ondergrens. Dat markeren met een
     open stip: de waarde staat er, maar hij rust op minder wijken dan de rest van de reeks. */
  /* Gevuld geel met een zwarte rand, zoals het eigen gebied in elke andere grafiek (#130); dat
     was hier zwart, en dan leest de reeks als een referentie in plaats van als het onderwerp. */
  const stijl = r.waarden.map((w, i) =>
    w === null ? "transparent" : (r.volledig[i] === false ? "#FAFAF5" : GEEL));
  if (grafiek) grafiek.destroy();
  grafiek = new Chart(canvas, {
    type: "line",
    data: {
      labels: r.jaren,
      datasets: [{
        label: GEBIEDLABEL,
        data: punten,
        borderColor: ASFALT, backgroundColor: GEEL, borderWidth: 2.5,
        pointRadius: 5, pointBackgroundColor: stijl, pointBorderColor: ASFALT,
        pointBorderWidth: 2,
        /* false: de lijn springt niet over een ontbrekend jaar heen. Dat is het hele punt. */
        spanGaps: false,
      },
      /* Referentiereeksen in dezelfde eenheid, dus zonder index: WOZ in duizenden euro's is
         voor een rayon en voor de gemeente hetzelfde getal-formaat. Alleen de jaren die deze
         reeks zelf heeft, uitgelijnd op het jaarlabel.

         De open stip voor een onvolledige jaargang geldt hier ook. `volledig` is bij een
         tijdreeks geen vlag maar een lijst per jaar — een reeks kan in 2019 op alle wijken
         rusten en in 2024 op een deel — dus dat kan refDatasets() niet generiek doen. */
      ...refReeksen(`reeksen.${sleutel}`, r.jaren).map(ref => {
        /* Uit refReeksen() en niet uit refDatasets(): die laatste laat reeksen zonder enkele
           bruikbare waarde weg, en dan lopen de posities niet meer gelijk met refActief().
           Hier is de code van het gebied nodig om zijn eigen volledig-lijst op te halen. */
        const vol = ((REF[ref.code] || {}).reeksen || {})[sleutel]?.volledig;
        return refLijn(ref, ref.waarden, {
          pointBackgroundColor: ref.waarden.map((w, j) =>
            w === null ? "transparent"
              : (Array.isArray(vol) && vol[j] === false ? "#FAFAF5" : ref.kleur)),
        });
      })],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {display: refActief().length > 0, position: "bottom"},
        tooltip: {callbacks: {label: c => {
          const i = c.dataIndex;
          /* De verantwoording over onvolledige jaargangen geldt de eigen reeks; een
             referentiereeks draagt zijn eigen volledigheid niet mee en doet die bewering dus
             niet. */
          if (c.datasetIndex > 0) {
            return c.parsed.y == null ? " geen cijfer in deze jaargang"
              : ` ${c.dataset.label}: ${nl1(c.parsed.y)} ${r.eenheid}`;
          }
          if (r.waarden[i] === null) return " geen cijfer in deze jaargang";
          return ` ${c.dataset.label}: ${nl1(r.waarden[i])} ${r.eenheid}` +
            (r.volledig[i] === false ? " (ondergrens: niet alle wijken)" : "");
        }}},
      },
      scales: {
        y: {grid: gridOpt, title: {display: true, text: r.eenheid}},
        x: {grid: {display: false}},
      },
    },
  });

  const gevuld = r.waarden.map((w, i) => [r.jaren[i], w]).filter(([, w]) => w !== null);
  const gaten = r.waarden.filter(w => w === null).length;
  const onvolledig = r.volledig.filter((v, i) => v === false && r.waarden[i] !== null).length;
  let sub = "";
  if (gevuld.length >= 2) {
    const [jEerst, wEerst] = gevuld[0];
    const [jLaatst, wLaatst] = gevuld.at(-1);
    /* Procentuele verandering, niet een factor: "+34%" is voor een adviseur directer dan
       "×1,3", en bij een daling leest "×0,8" ronduit verwarrend. */
    const pct = wEerst ? Math.round(100 * (wLaatst / wEerst - 1)) : null;
    const jaren = Number(jLaatst) - Number(jEerst);
    sub = `${r.naam}: ${nl1(wEerst)} in ${jEerst} naar ${nl1(wLaatst)} in ${jLaatst}` +
      (pct != null ? ` — ${pct >= 0 ? "+" : ""}${pct}% over ${jaren} jaar` : "") + ".";
  }
  if (gaten) {
    sub += ` ${gaten} jaargang(en) zonder cijfer; de lijn ligt daar open in plaats van ` +
      "doorgetrokken.";
  }
  if (onvolledig) {
    sub += ` ${onvolledig} jaargang(en) rusten op minder wijken dan de rest — open stip.`;
  }
  document.getElementById("reeksSub").textContent = sub;
  document.getElementById("reeksFoot").textContent =
    "Bron: CBS Kerncijfers wijken en buurten, alle jaargangen sinds 2013. " +
    (r.regel === "gepubliceerd"
      ? "Gepubliceerde wijkcijfers."
      : `Per jaargang samengesteld uit de wijken van dit gebied, ${r.gewicht
          ? "gewogen naar " + r.gewicht : "opgeteld"} van datzelfde jaar.`) +
    " CBS wijzigt tussen jaargangen soms definities en buurtindelingen; een sprong in de reeks " +
    "kan dus ook een definitiewijziging zijn en niet alleen een echte verandering.";
  toggle.querySelectorAll("button").forEach(b =>
    b.classList.toggle("actief", b.dataset.reeks === sleutel));
}

for (const [sleutel, r] of bruikbaar) {
  const b = document.createElement("button");
  b.dataset.reeks = sleutel;
  b.textContent = r.naam;
  b.addEventListener("click", () => toon(sleutel));
  toggle.appendChild(b);
}
toon(bruikbaar[0][0]);
/* Deze grafiek wordt bij elke wissel opnieuw opgebouwd, dus hertekenen = opnieuw tonen wat
   er nu geselecteerd staat. */
bijRefWijziging("tijdreeks", () => {
  const actief = toggle.querySelector("button.actief");
  toon(actief ? actief.dataset.reeks : bruikbaar[0][0]);
});
box.hidden = false;
});


veilig("segmenten", () => {
/* ---------- #8: soorten bewoners ----------
   De gemiste invalshoek: het onderscheid tussen gebieden gaat over meer dan inkomen alleen.
   De CPB-indeling is niet openbaar op wijkniveau (onderzoek staat in issue #8); dit is CBS'
   eigen SES-WOA — financiële welvaart, opleidingsniveau en arbeidsverleden gecombineerd, met
   de spreiding bínnen het gebied en een 95%-interval erbij.

   De score is relatief: 0 is het landelijk gemiddelde. Een score zonder die referentie is
   betekenisloos, dus die staat in elke regel. */
if (typeof SEGMENTEN === "undefined") return;
const box = document.getElementById("segmentenBox");
const tb = document.querySelector("#segmentenTabel tbody");
const canvas = document.getElementById("chSegmenten");
if (!box || !tb || !canvas || typeof Chart === "undefined") return;

const S = SEGMENTEN;
/* Drie decimalen, want CBS publiceert er drie en de scores liggen dicht bij nul: op twee
   decimalen werd het 95%-interval van Overschie "-0,01 tot 0,00", wat leest als een lege
   uitspraak terwijl de bron -0,011 tot -0,004 zegt. */
const nl3 = v => typeof v !== "number" ? "—"
  : v.toLocaleString("nl-NL", {minimumFractionDigits: 3, maximumFractionDigits: 3,
                               signDisplay: "exceptZero"});

/* Woorden bij het getal, want een z-scoreachtige waarde zegt een adviseur niets. Bewust
   beschrijvend en niet waarderend: "onder het landelijk gemiddelde" is een feit, "slecht" een
   oordeel — dat blijft #30. */
function betekenis(v) {
  if (typeof v !== "number") return "niet gepubliceerd";
  const richting = v > 0 ? "boven" : v < 0 ? "onder" : "gelijk aan";
  const sterkte = Math.abs(v) < 0.05 ? "vlak " : Math.abs(v) < 0.25 ? "" : "duidelijk ";
  return v === 0 ? "gelijk aan het landelijk gemiddelde"
    : `${sterkte}${richting} het landelijk gemiddelde`;
}

const dimensies = [
  ["totaal", "Totaalscore SES-WOA"],
  ["welvaart", "Financiële welvaart"],
  ["opleiding", "Opleidingsniveau"],
  ["arbeid", "Arbeidsverleden"],
];
for (const [sleutel, naam] of dimensies) {
  const v = S.gebied[sleutel];
  const onder = sleutel === "totaal" ? S.gebied.totaal_onder : null;
  const boven = sleutel === "totaal" ? S.gebied.totaal_boven : null;
  const tr = document.createElement("tr");
  tr.innerHTML =
    `<td>${naam}</td>` +
    `<td class="getal"><b>${nl3(v)}</b>` +
    (typeof onder === "number" && typeof boven === "number"
      ? `<div style="font-size:11px;color:#7a7a6c">95%: ${nl3(onder)} tot ${nl3(boven)}</div>`
      : "") +
    "</td>" +
    `<td>${betekenis(v)}</td>`;
  tb.appendChild(tr);
}
/* De spreiding is de reden dat dit dashboard bestaat: bij een hoge spreiding beschrijft het
   gebiedscijfer niemand. CBS publiceert hem hier zelf, in plaats van dat wij hem afleiden. */
if (typeof S.gebied.spreiding === "number") {
  const tr = document.createElement("tr");
  tr.innerHTML =
    "<td>Spreiding binnen het gebied</td>" +
    `<td class="getal"><b>${S.gebied.spreiding.toLocaleString("nl-NL",
      {minimumFractionDigits: 2, maximumFractionDigits: 2})}</b></td>` +
    `<td>${S.gebied.spreiding > 1 ? "meer" : "minder"} verschil tussen huishoudens dan ` +
    "landelijk gemiddeld (1,00)</td>";
  tb.appendChild(tr);
}

/* Arbeidsverleden per deelgebied: bij een rayon de drie gebieden, bij een wijk de buurten.
   Dat is waar "soorten bewoners" ruimtelijk zichtbaar wordt. */
const heeftWijken = Object.keys(S.perWijk || {}).length > 0;
const eenheden = heeftWijken
  ? Object.entries(S.perWijk).map(([code, v]) => [
      (typeof GEBIEDEN !== "undefined"
        ? (GEBIEDEN.rayons || []).flatMap(r => r.gebieden || []).find(x => x.code === code)?.naam
        : null) || code, v])
  : Object.entries(S.perBuurt || {});
const rijen = [[GEBIEDNAAM, S.gebied], ...eenheden];
const KLEUREN = [POLDER, SCHIE, "#B0452F", GRIJS];

new Chart(canvas, {
  type: "bar",
  data: {
    labels: rijen.map(([naam]) => naam),
    datasets: S.arbeidsverleden.sleutels.map((sleutel, i) => ({
      label: S.arbeidsverleden.labels[i],
      backgroundColor: KLEUREN[i], borderColor: ASFALT, borderWidth: 1,
      data: rijen.map(([, v]) => typeof v[sleutel] === "number"
        ? Math.round(v[sleutel] * 10) / 10 : null),
    })),
  },
  options: {
    indexAxis: "y", maintainAspectRatio: false,
    scales: {x: {stacked: true, max: 100, grid: gridOpt,
                 title: {display: true, text: S.arbeidsverleden.eenheid}},
             /* eigen gebied vet, zoals bij zelfvoorzienendheid: anders is niet te zien welke
                rij het onderwerp is en welke de uitsplitsing */
             y: {stacked: true, grid: {display: false},
                 ticks: {font: c => ({weight: c.index === 0 ? "700" : "400", size: 11})}}},
    plugins: {
      legend: {position: "bottom", labels: {boxWidth: 12, font: {size: 11}}},
      tooltip: {callbacks: {label: c => ` ${c.dataset.label}: ` +
        `${c.parsed.x.toLocaleString("nl-NL")}%`}},
    },
  },
});

const deelRichtingen = new Set(["welvaart", "opleiding", "arbeid"]
  .map(k => S.gebied[k])
  .filter(v => typeof v === "number")
  .map(v => Math.sign(v)));
const agg = S.aggregatie || {};
document.getElementById("segmentenSub").textContent =
  `${GEBIEDNAAM} scoort ${nl3(S.gebied.totaal)} op de gecombineerde SES-WOA-score: ` +
  `${betekenis(S.gebied.totaal)}. Opgebouwd uit welvaart ${nl3(S.gebied.welvaart)}, ` +
  `opleidingsniveau ${nl3(S.gebied.opleiding)} en arbeidsverleden ${nl3(S.gebied.arbeid)}` +
  /* Alleen zeggen dat de deelscores uiteenlopen als dat zo is; anders is het een bewering over
     de data in plaats van een beschrijving ervan. */
  (deelRichtingen.size > 1
    ? " — de deelscores lopen dus niet dezelfde kant op."
    : ", alle drie dezelfde kant op.");
document.getElementById("segmentenFoot").innerHTML =
  `${S.bron}, peiljaar ${S.peildatum}. ${S.caveat}` +
  (agg.regel && agg.regel !== "gepubliceerd"
    ? ` Samengesteld uit ${agg.nWijken} wijken, gewogen naar ${agg.gewicht}.` +
      (agg.intervalWeggelaten ? ` <b>${agg.intervalWeggelaten}</b>` : "")
    : "");
box.hidden = false;
});

veilig("odin-badges", () => {
/* ---------- een steekproeflabel bij elk ODiN-cijfer, waar het ook staat (#97) ----------
   De representativiteitswaarschuwing stond alleen in sectie 07, terwijl de
   zelfvoorzienendheid in sectie 01 — inmiddels een hoofdindicator (#49) — uit dezelfde
   steekproef komt. Wie alleen de bovenkant leest, zag een ODiN-percentage zonder voorbehoud.

   Welke blokken ODiN tonen staat als data-bron="odin" op het blok zelf in index.html, naast
   de grafiek en niet in een lijst hier: een nieuwe ODiN-grafiek krijgt het label door één
   attribuut, en de rooktest telt of elk gemarkeerd blok het ook echt heeft
   (data-odin-badge). Onderaan het bestand, zodat blokken die hun kop pas tijdens het opbouwen
   vullen het label niet overschrijven. */
const blokken = document.querySelectorAll('[data-bron~="odin"]');
const heeftData = typeof ODINW !== "undefined" && !ODINW.leeg && ODINW.n;
blokken.forEach(blok => {
  /* Zonder ODiN-data verwijdert odin-caveat de grafieken al en blijft de zelfvoorzienendheid
     verborgen. Het merkteken zegt dan dat het blok gezien is, niet dat er een label staat. */
  if (!heeftData) { blok.dataset.odinBadge = "geen-data"; return; }
  /* De bezoekers zijn een andere steekproef dan de bewoners — niet-bewoners met een
     bestemming in het gebied — dus daar hoort hun eigen aantal bij. */
  const bezoekers = blok.dataset.odinN === "bezoekers";
  const n = bezoekers ? (ODINW.bezoekers || {}).n : ODINW.n.verplaatsingen;
  const wat = bezoekers ? "verplaatsingen van bezoekers" : "verplaatsingen";
  const label = document.createElement("a");
  label.className = "status odin";
  label.href = "#odinCaveat";
  label.textContent = n != null
    ? `ODiN · steekproef · n = ${n.toLocaleString("nl-NL")}` : "ODiN · steekproef";
  label.title = `Uit de ODiN-steekproef (${ODINW.peildatum})` +
    (n != null ? `, ${n.toLocaleString("nl-NL")} ${wat}` : "") +
    ". Indicatief; zie de representativiteit bovenaan sectie 07.";
  const kop = /^H[1-4]$/.test(blok.tagName) ? blok : blok.querySelector("h3, h4");
  if (kop) kop.append(" ", label);
  else blok.prepend(label);
  blok.dataset.odinBadge = "ja";
});
});

veilig("uitleg-intensiteit", () => {
/* ---------- #146/#150: wat betekent een etmaalintensiteit? ----------
   "10.000 mvt/etmaal" zegt de meeste lezers niets, en omrekenen naar "per uur" of "per minuut"
   (de eerste versie, #146) zegt nauwelijks meer: het blijft een rekensom. Dit blok laat het getal
   voelen op vier manieren die iedereen kent:
   - een straat waar de voertuigen in echte tijd langskomen, in het tempo van het drukste uur;
   - hoe lang je gemiddeld wacht op een gat om over te steken;
   - hoe lang de file is als je alle voertuigen van één etmaal achter elkaar zet;
   - hoe het getal zich verhoudt tot alle personenauto's van het eigen gebied.
   Alles volgt uit één getal plus één aanname (het aandeel van het drukste uur, 8–10 %, instelbaar).
   Geen data nodig, behalve voor het laatste paneel.

   Rekenaanname voor de straat en het oversteken: voertuigen komen onafhankelijk van elkaar
   (Poisson). Dat is de standaardaanname voor ongeregeld verkeer. Een verkeerslicht verderop maakt
   er groepjes van, met langere gaten ertussen — dan valt de wachttijd in werkelijkheid korter uit.
   Dat staat in de voetnoot.

   De maatlat met wegtypen is een orde van grootte om het getal te plaatsen, geen norm en geen
   oordeel — daarom één neutrale kleur (#30). */
const box = document.getElementById("intUitleg");
if (!box) return;
const schuif = document.getElementById("intSchuif");
const spits = document.getElementById("intSpits");
const knoppen = box.querySelector(".intknoppen");
const SNEL = [100, 1000, 10000, 50000];
const LOG_MIN = 2, LOG_MAX = 5;
/* Indicatief, afgerond, per wegtype. Ranges overlappen bewust: het wegtype bepaalt het getal niet. */
const BANDEN = [
  {naam: "woonstraat", van: 100, tot: 2000},
  {naam: "wijkontsluitingsweg", van: 3000, tot: 15000},
  {naam: "stedelijke hoofdweg", van: 12000, tot: 40000},
  {naam: "snelweg", van: 40000, tot: 100000},
];
/* Oversteektijd: 5 s is een volwassene over een rijbaan van ca. 7 m (1,4 m/s); 8 s een kind,
   iemand met een rollator of met boodschappen. */
const GATEN = [{t: 5, wie: "een volwassene"}, {t: 8, wie: "een kind of iemand die langzaam loopt"}];
/* Eén voertuig in een file: 4,5 m auto plus 1,5 m tussenruimte. Vrachtwagens en bussen maken de
   file langer; dit is dus een ondergrens. */
const M_PER_VOERTUIG = 6;
/* Hemelsbreed vanaf Rotterdam Centraal; de afstand wordt hieronder uitgerekend, niet getypt. */
const RCS = [51.9244, 4.4690];
function kmTussen([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const PLAATSEN = [
  ["Schiedam", 51.9217, 4.4094], ["Delft", 52.0067, 4.3569], ["Dordrecht", 51.8079, 4.6684],
  ["Gouda", 52.0172, 4.7048], ["Den Haag", 52.0802, 4.3249], ["Leiden", 52.1664, 4.4819],
  ["Breda", 51.5955, 4.7800], ["Utrecht", 52.0894, 5.1101], ["Amsterdam", 52.3789, 4.9003],
  ["Antwerpen", 51.2172, 4.4211], ["Eindhoven", 51.4433, 5.4814], ["Brussel", 50.8456, 4.3571],
  ["Groningen", 53.2105, 6.5641], ["Parijs", 48.8809, 2.3553],
].map(([naam, la, lo]) => ({naam, km: kmTussen(RCS, [la, lo])})).sort((a, b) => a.km - b.km);
const OMTREK_AARDE_KM = 40075;

const nlGetal = (v, dec = 0) => v.toLocaleString("nl-NL", {maximumFractionDigits: dec});
/* Een duur leesbaar: seconden, minuten of uren, met één cijfer achter de komma waar dat telt. */
function duur(s) {
  if (s < 1) return "minder dan een seconde";
  if (s < 90) return `${nlGetal(s, s < 10 ? 1 : 0)} seconden`;
  if (s < 5400) return `${nlGetal(s / 60, s < 600 ? 1 : 0)} minuten`;
  return `${nlGetal(s / 3600, s < 36000 ? 1 : 0)} uur`;
}
let huidig = null;
const pos = n => 100 * (Math.log10(n) - LOG_MIN) / (LOG_MAX - LOG_MIN);

SNEL.forEach(n => {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = nlGetal(n); b.dataset.n = n;
  b.addEventListener("click", () => toon(n));
  knoppen.appendChild(b);
});

/* maatlat: banden en tikken één keer tekenen, de wijzer schuift mee */
const lat = document.getElementById("intLat");
lat.innerHTML = BANDEN.map((bd, i) =>
  `<div class="band" style="left:${pos(bd.van)}%;width:${pos(bd.tot) - pos(bd.van)}%;` +
  `top:${i % 2 ? 24 : 0}px" title="${bd.naam}: ca. ${nlGetal(bd.van)}–${nlGetal(bd.tot)}">` +
  `${bd.naam}</div>`).join("") +
  [100, 1000, 10000, 100000].map(t => `<div class="tik" style="left:${pos(t)}%">${nlGetal(t)}</div>`).join("") +
  '<div class="wijzer"><span></span></div>';
const wijzer = lat.querySelector(".wijzer");

/* ---------- de straat: voertuigen in echte tijd ----------
   Twee rijstroken, elk met de helft van de intensiteit. Een voertuig doet 5 s over het beeld
   (70 m bij 50 km/u); korter, en bij 10.000 per etmaal is de straat meestal leeg in beeld. Aankomsten per strook zijn Poisson, maar nooit dichter op elkaar dan een
   voertuiglengte plus een halve seconde: anders schuiven ze bij 50.000 door elkaar. */
const doek = document.getElementById("intStraat");
const ctx = doek.getContext("2d");
const BEELD_M = 70, OVERSTEEK_S = 5;
const SOORTEN = [{kans: .88, l: 4.5, h: 1.8}, {kans: .08, l: 6, h: 2}, {kans: .04, l: 12, h: 2.5}];
const stilVoorkeur = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const kleur = naam => getComputedStyle(document.documentElement).getPropertyValue(naam).trim();
let stroken = [], simTijd = 0, geteld = 0, factor = 1, gepauzeerd = stilVoorkeur, zichtbaar = true;
let laatsteFrame = null, qPerS = 0;
const expo = rate => rate > 0 ? -Math.log(1 - Math.random()) / rate : Infinity;
function soort() {
  let r = Math.random();
  for (const s of SOORTEN) { if ((r -= s.kans) <= 0) return s; }
  return SOORTEN[0];
}
function resetStraat() {
  simTijd = 0; geteld = 0;
  /* Begin met een gevulde straat, niet met een lege: plaats voertuigen alsof het al liep. */
  stroken = [0, 1].map(richting => {
    const s = {richting, voertuigen: [], volgende: 0};
    let t = -OVERSTEEK_S;
    for (;;) {
      t += expo(qPerS / 2);
      if (t >= 0) break;
      s.voertuigen.push({start: t, ...soort()});
    }
    s.volgende = t;
    return s;
  });
}
function stap(dt) {
  simTijd += dt;
  for (const s of stroken) {
    while (s.volgende <= simTijd) {
      const v = {start: s.volgende, ...soort()};
      const vorige = s.voertuigen[s.voertuigen.length - 1];
      if (vorige) v.start = Math.max(v.start, vorige.start + (vorige.l / BEELD_M) * OVERSTEEK_S + .5);
      s.voertuigen.push(v);
      geteld++;
      s.volgende = v.start + expo(qPerS / 2);
    }
    s.voertuigen = s.voertuigen.filter(v => simTijd - v.start < OVERSTEEK_S * 1.6);
  }
}
function teken() {
  const b = doek.clientWidth, h = doek.clientHeight, dpr = window.devicePixelRatio || 1;
  if (!b || !h) return;
  if (doek.width !== Math.round(b * dpr)) { doek.width = Math.round(b * dpr); doek.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, b, h);
  const pxm = b / BEELD_M, midden = h / 2;
  /* stoepranden en middenstreep */
  ctx.fillStyle = kleur("--grid") || "#ccc";
  ctx.fillRect(0, 10, b, 2); ctx.fillRect(0, h - 12, b, 2);
  ctx.strokeStyle = kleur("--asfalt-zacht") || "#777"; ctx.setLineDash([12, 10]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, midden); ctx.lineTo(b, midden); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = kleur("--asfalt") || "#222";
  for (const s of stroken) {
    for (const v of s.voertuigen) {
      const af = (simTijd - v.start) / OVERSTEEK_S;                // 0 = binnenkomst
      const kop = af * (BEELD_M + v.l) * pxm;                       // voorkant in px vanaf de rand
      const x = s.richting ? kop - v.l * pxm : b - kop;
      const y = s.richting ? midden + 8 : midden - 8 - v.h * pxm;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, v.l * pxm, v.h * pxm, 3);
      else ctx.rect(x, y, v.l * pxm, v.h * pxm);
      ctx.fill();
    }
  }
}
function tekstTeller() {
  const s = simTijd;
  const tijd = s < 60 ? `${Math.floor(s)} s` : `${Math.floor(s / 60)} min ${Math.floor(s % 60)} s`;
  document.getElementById("intTeller").textContent = gepauzeerd && stilVoorkeur && s === 0
    ? "De animatie staat uit volgens je systeeminstelling; druk op ‘start’ om ze te laten lopen."
    : `In ${tijd}${factor > 1 ? " (versneld)" : ""} kwamen hier ${nlGetal(geteld)} ` +
      `voertuig${geteld === 1 ? "" : "en"} langs.`;
}
function frame(t) {
  if (laatsteFrame != null && !gepauzeerd && zichtbaar) {
    stap(Math.min(.1, (t - laatsteFrame) / 1000) * factor);
    teken(); tekstTeller();
  }
  laatsteFrame = t;
  requestAnimationFrame(frame);
}
/* Buiten beeld stil: een animatie die niemand ziet, kost alleen batterij. */
if ("IntersectionObserver" in window) {
  new IntersectionObserver(e => { zichtbaar = e[0].isIntersecting; }).observe(doek);
}
const knopVersneld = document.getElementById("intVersneld");
const knopPauze = document.getElementById("intPauze");
knopVersneld.addEventListener("click", () => {
  factor = factor > 1 ? 1 : 10;
  knopVersneld.setAttribute("aria-pressed", String(factor > 1));
});
const zetPauze = p => {
  gepauzeerd = p;
  knopPauze.setAttribute("aria-pressed", String(p));
  knopPauze.textContent = p ? "start" : "pauze";
};
knopPauze.addEventListener("click", () => zetPauze(!gepauzeerd));
zetPauze(gepauzeerd);

/* ---------- het eigen gebied: personenauto's ≈ huishoudens × auto's per huishouden ---------- */
const eigenAutos = (() => {
  if (typeof PROFIEL === "undefined") return null;
  const hh = PROFIEL.kerncijfers?.huishoudens;
  const reeks = PROFIEL.reeksen?.autos?.waarden || [];
  const perHh = [...reeks].reverse().find(v => v != null);
  return hh && perHh ? hh * perHh : null;
})();
const rond100 = v => nlGetal(Math.round(v / 100) * 100);

function toon(n, {straatOpnieuw = true} = {}) {
  n = Math.max(10 ** LOG_MIN, Math.min(10 ** LOG_MAX, Math.round(n)));
  const nieuwGetal = n !== huidig;
  huidig = n;
  const aandeel = Number(spits.value) / 100;
  const piek = n * aandeel;              // voertuigen in het drukste uur, beide richtingen
  qPerS = piek / 3600;
  schuif.value = String(Math.log10(n));
  document.getElementById("intWaarde").textContent = nlGetal(n);
  document.getElementById("intSpitsWaarde").textContent = `${nlGetal(aandeel * 100, 1)}%`;
  knoppen.querySelectorAll("button").forEach(b =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.n) === n)));

  /* straat */
  const tussen = 3600 / piek;
  document.getElementById("intLiveKop").textContent =
    `Zo ziet ${nlGetal(n)} per etmaal eruit in het drukste uur: gemiddeld elke ` +
    `${duur(tussen)} een voertuig, in echte tijd.`;
  doek.setAttribute("aria-label",
    `Animatie van een straat met gemiddeld elke ${duur(tussen)} een voertuig`);
  if ((nieuwGetal && straatOpnieuw) || !stroken.length) resetStraat();
  teken(); tekstTeller();

  /* oversteken: verwachte wachttijd op een gat van T seconden, E = (e^(qT) − 1 − qT) / q */
  document.getElementById("intOversteek").innerHTML = GATEN.map(({t, wie}) => {
    const qt = qPerS * t;
    const wacht = qPerS > 0 ? (Math.exp(qt) - 1 - qt) / qPerS : 0;
    const kans = Math.exp(-qt);
    return `<div class="intrij"><div class="intgroot">${wacht < 1 ? "direct" : duur(wacht)}</div>` +
      `<div class="intklein">gemiddeld wachten voor ${wie} (${t} s nodig). ` +
      `${kans < .001 ? "minder dan 0,1" : nlGetal(100 * kans, kans < .1 ? 1 : 0)}% van de gaten is lang genoeg.` +
      (wacht > 1800 ? " Zonder verkeerslicht of oversteekplaats komt er in de praktijk geen gat." : "") +
      `</div></div>`;
  }).join("");

  /* file */
  const km = n * M_PER_VOERTUIG / 1000;
  const voorbij = [...PLAATSEN].reverse().find(p => p.km <= km);
  const verder = PLAATSEN.find(p => p.km > km) || PLAATSEN[PLAATSEN.length - 1];
  const schaal = Math.max(km, verder.km) * 1.05;
  const perJaar = km * 365;
  document.getElementById("intFile").innerHTML =
    `<div class="intgroot">${nlGetal(km, km < 10 ? 1 : 0)} km</div>` +
    `<div class="intklein">${voorbij
      ? `hemelsbreed van Rotterdam Centraal tot voorbij ${voorbij.naam} (${nlGetal(voorbij.km)} km)`
      : `minder dan van Rotterdam Centraal tot ${PLAATSEN[0].naam} (${nlGetal(PLAATSEN[0].km)} km)`}` +
    `</div><div class="intfilebalk" aria-hidden="true"><b style="width:${100 * km / schaal}%"></b>` +
    /* Alleen de plaats die je voorbij bent en de volgende, en die tweede alleen als de labels
       elkaar niet raken (Amsterdam en Antwerpen liggen 20 km uit elkaar). */
    [voorbij, verder].filter((p, i) => p && (i === 0 || !voorbij ||
      (verder.km - voorbij.km) / schaal > .22)).map((p, i) =>
      `<i style="left:${100 * p.km / schaal}%"><span style="${p === verder ? "right:0;left:auto" : ""}">` +
      `${p.naam}</span></i>`).join("") + `</div>` +
    `<div class="intklein">Een jaar lang elke dag zo: ${nlGetal(perJaar)} km` +
    (perJaar >= OMTREK_AARDE_KM / 10
      ? `, ${nlGetal(perJaar / OMTREK_AARDE_KM, 1)} keer de aarde rond.` : ".") + `</div>`;

  /* eigen gebied */
  const per = document.getElementById("intGebied");
  const jaar = `<div class="intklein" style="margin-top:8px">Per jaar: ` +
    `${nlGetal(n * 365 / 1e6, n * 365 < 1e7 ? 1 : 0)} miljoen passages langs dat ene punt.</div>`;
  if (eigenAutos) {
    const r = n / eigenAutos;
    document.getElementById("intGebiedKop").textContent = `Tegen ${GEBIEDNAAM}`;
    per.innerHTML =
      `<div class="intgroot">${r >= 1 ? `${nlGetal(r, r < 10 ? 1 : 0)}×` : `${nlGetal(100 * r, r < .1 ? 1 : 0)}%`}</div>` +
      `<div class="intklein">${r >= 1
        ? `alle personenauto's van ${GEBIEDNAAM} (ongeveer ${rond100(eigenAutos)}), zo vaak op één dag langs één punt`
        : `van alle ongeveer ${rond100(eigenAutos)} personenauto's van ${GEBIEDNAAM}, op één dag langs één punt`}.</div>` + jaar;
  } else {
    per.innerHTML = jaar;
  }

  wijzer.style.left = `${pos(n)}%`;
  wijzer.querySelector("span").textContent = nlGetal(n);
  /* rechts van het midden het label links van de wijzer, anders loopt het buiten de maatlat */
  wijzer.querySelector("span").style.left = pos(n) > 70 ? "auto" : "5px";
  wijzer.querySelector("span").style.right = pos(n) > 70 ? "5px" : "auto";
}
/* Voor een kaart die een wegvak kan aanklikken: toonIntensiteit(n) zet het getal hier. */
window.toonIntensiteit = n => { toon(n); };

schuif.addEventListener("input", () => toon(10 ** Number(schuif.value)));
/* Het drukste-uuraandeel verandert het tempo, niet het getal: de straat loopt door. */
spits.addEventListener("input", () => toon(huidig, {straatOpnieuw: false}));
window.addEventListener("resize", () => teken());
document.getElementById("intFoot").textContent =
  "Rekenregels. Drukste uur = etmaal × het gekozen aandeel (vuistregel 8–10 %), beide richtingen " +
  "samen. Straat en oversteken nemen aan dat voertuigen onafhankelijk van elkaar komen (Poisson); " +
  "de verwachte wachttijd op een gat van T seconden bij q voertuigen per seconde is " +
  "(e^(qT) − 1 − qT) ÷ q. Een verkeerslicht in de buurt bundelt verkeer in groepjes met langere " +
  "gaten, en een middenberm halveert wat je in één keer oversteekt; dan wacht je korter. File: 6 m " +
  "per voertuig (auto plus tussenruimte), afstanden hemelsbreed. Personenauto's van het gebied ≈ " +
  "huishoudens × auto's per huishouden (CBS, op één decimaal gepubliceerd, dus een benadering). " +
  "De wegtypen zijn een indicatieve orde van grootte, geen norm of streefwaarde. Een kaart die per " +
  "rijrichting telt, geeft voor een tweerichtingsweg ongeveer de helft van het etmaal van beide " +
  "richtingen samen.";
toon(1000);
requestAnimationFrame(frame);
});

veilig("paginabreedte", () => {
/* ---------- steekt er iets buiten het scherm? (#114) ----------
   Op een telefoon van 390 px was de pagina 651 px breed: een knoppenrij en vijf tabellen
   rekten hem op, en de lezer moest zijwaarts schuiven om een grafiek te zien. Dat valt niet op
   bij een desktop-rooktest. Daarom meet de pagina het zelf en zet het in de DOM; de rooktest
   faalt erop, en een dump bij telefoonbreedte laat het zien. Onderaan, na de blokken die
   tabellen en knoppen vullen. */
const W = document.documentElement.clientWidth;
const breed = document.documentElement.scrollWidth;
document.body.dataset.paginabreedte = `${breed}/${W}`;
});

veilig("referentiekeuze", () => {
/* ---------- de bedieningen, nadat alle grafieken zich hebben ingeschreven (#7) ----------
   Onderaan en niet bovenaan: een grafiek schrijft zich in tijdens het opbouwen van zijn
   eigen blok, en een keuzevakje dat klikbaar is voordat er iets luistert doet niets. */
document.querySelectorAll("[data-refkeuze]").forEach(bouwRefKeuze);
/* En één keer tekenen met de standaardkeuze. De grafieken zijn opgebouwd zonder referentie —
   ze schrijven zich in en wachten — dus zonder deze regel staan de vakjes aan terwijl er
   niets getekend is. Dat is het ergste van twee werelden: een bewering in de bediening die
   het beeld niet waarmaakt. */
refGewijzigd();
});
