/* Reviewmodus — handgeschreven, niet gegenereerd.

   Wordt alleen geladen als ?review=1 in de URL staat (zie js/laad.js). Voor een gewone
   bezoeker bestaat dit bestand niet: de laag is afwezig, niet verborgen.

   Waar dit voor is: de projectgroep moet per grafiek kunnen zeggen of een indicator nuttig
   is, hoe ze hem gevisualiseerd willen zien en of hij aansluit op hun opgaven. Niet of het
   cijfer klopt — dat is de pipeline. Niets is verplicht; wie alleen bij drie kaarten iets
   vindt, levert een geldige export op.

   Opslag zit in localStorage van de reviewer zelf. Er gaat niets naar een server. Het
   geëxporteerde bestand is de bron van waarheid, niet de browseropslag: wie zijn browser
   opschoont of van apparaat wisselt is zijn opmerkingen kwijt. Daarom is de exportknop luid,
   waarschuwt de pagina bij het sluiten, en kun je een export terug importeren.

   Ankers zijn de data-onderwerp-attributen in index.html en js/app.js. Expliciet gezet, niet
   afgeleid van selectorpaden of kopteksten: app.js herschrijft koppen en niveaubadges per
   gebied, dus een afgeleid anker zou per gebied verspringen. Verdwijnt een sleutel toch, dan
   komt de opmerking bij import in de weeslijst en wordt hij niet stil weggegooid. */

/* Eigen guard: een fout in de reviewlaag mag het dashboard niet meenemen. Losse kopie van
   veilig() uit js/app.js, omdat deze laag ook moet werken als daar iets gevallen is. */
const REVIEW_FOUTEN = [];
function veiligReview(naam, fn) {
  try { return fn(); }
  catch (e) {
    REVIEW_FOUTEN.push(naam + ": " + e.message);
    console.error("[review/" + naam + "]", e.message);
    if (document.body) document.body.dataset.reviewFouten = REVIEW_FOUTEN.join(" | ");
  }
}

/* Eén as: hoe nuttig is dit? "anders vormgeven" staat erbij als losse uitkomst, want
   "nuttige indicator, verkeerd getekend" valt anders weg tegen "niet interessant" — en dat
   onderscheid is juist wat we willen weten. */
const MENINGEN = [
  ["onmisbaar", "Onmisbaar"],
  ["nuttig", "Nuttig"],
  ["niet-interessant", "Niet interessant"],
  ["anders-vormgeven", "Anders vormgeven"],
];
const MENINGLABEL = Object.fromEntries(MENINGEN);

const REVIEW_VERSIE = 1;
const GEBIED = typeof GEBIEDCODE !== "undefined" ? GEBIEDCODE : "onbekend";
const OPSLAGSLEUTEL = "rayonreview/" + GEBIED;

/* ---------- opslag ----------
   Alles in try/catch: localStorage kan gooien in een privévenster, met geblokkeerde
   sitegegevens, of onder een strikt beleid. Faalt hij, dan werken we in het geheugen door en
   staat er een blijvende rode regel in de balk. Stil doorwerken en de opmerkingen bij het
   sluiten kwijtraken is het ene scenario dat deze laag niet mag hebben.

   Let op bij file://: Chrome deelt één opslagruimte over alle lokale bestanden. De sleutel
   draagt daarom de gebiedcode, maar twee checkouts van dit dashboard op dezelfde computer
   delen wel hun opmerkingen. Op https (GitHub Pages) speelt dat niet. */
let opslagWerkt = true;

function leegDossier() {
  return {versie: REVIEW_VERSIE, reviewer: "", onderwerpen: {}, secties: {}, slotvraag: ""};
}

/* eigen = wat deze reviewer zelf invult; binnen = geïmporteerde dossiers van anderen,
   die we alleen lezen. Gescheiden houden, anders exporteert iemand na een import de
   opmerkingen van zijn collega's als de zijne. */
let eigen = leegDossier();
let binnen = [];
let onopgeslagen = false;   /* iets gewijzigd sinds de laatste export? */

function laadOpslag() {
  try {
    const ruw = localStorage.getItem(OPSLAGSLEUTEL);
    if (!ruw) return;
    const o = JSON.parse(ruw);
    if (o && typeof o === "object") {
      eigen = Object.assign(leegDossier(), o.eigen || o);
      binnen = Array.isArray(o.binnen) ? o.binnen : [];
      onopgeslagen = !!o.onopgeslagen;
    }
  } catch (e) {
    opslagWerkt = false;
    console.warn("[review] opslag niet leesbaar:", e.message);
  }
}

function bewaar() {
  onopgeslagen = true;
  try {
    localStorage.setItem(OPSLAGSLEUTEL, JSON.stringify({eigen, binnen, onopgeslagen}));
  } catch (e) {
    opslagWerkt = false;
    console.warn("[review] opslag niet schrijfbaar:", e.message);
  }
  tekenBalk();
}

/* ---------- onderwerpen inventariseren ---------- */

/* De naam die in de export komt te staan. Bij een kaart de h4 zonder de badges (dezelfde
   truc als de zoekindex in js/app.js), bij een kerncijfervierkant het label, bij een strook
   de dichtstbijzijnde kop erboven. Alleen voor de leesbaarheid van de export — de sleutel is
   wat telt, dus een gewijzigde naam breekt niets. */
function naamVan(el) {
  if (el.classList.contains("cell")) {
    const lbl = el.querySelector(".lbl");
    return lbl ? lbl.textContent.trim() : "kerncijfer";
  }
  const kop = el.querySelector("h4");
  if (kop) {
    const t = [...kop.childNodes].filter(n => n.nodeType === 3)
      .map(n => n.nodeValue).join(" ").replace(/\s+/g, " ").trim();
    if (t) return t;
  }
  /* Een strook heeft zelf geen kop. Zit hij in een kaart, dan hoort hij bij die kaart;
     staat hij los in de sectie, dan bij de laatste h2/h3 erboven. */
  const doos = el.parentElement && el.parentElement.closest(".chart-box");
  if (doos) return naamVan(doos) + " — kerncijfers";
  let n = el.previousElementSibling;
  while (n) {
    if (/^H[234]$/.test(n.tagName)) {
      return [...n.childNodes].filter(x => x.nodeType === 3)
        .map(x => x.nodeValue).join(" ").replace(/\s+/g, " ").trim() + " — kerncijfers";
    }
    n = n.previousElementSibling;
  }
  return "kerncijfers";
}

/* Bron, peiljaar en aggregatieniveau van een kaart, uit de kaart zelf. Staat allemaal al in
   de DOM, dus geen tweede dataleiding. Voor een gemengd publiek is dit het verschil tussen
   een oordeel over een plaatje en een oordeel over een keuze: "is dit nuttig" is niet te
   beantwoorden als je niet ziet dat het om buurtgemiddelden gaat. */
function herkomstVan(el) {
  const doos = el.classList.contains("chart-box") ? el : el.closest(".chart-box") || el;
  const uit = [];
  const niveau = doos.querySelector("h4 .status.niveau");
  if (niveau) uit.push(["Aggregatieniveau", niveau.textContent.trim()]);
  const agg = doos.querySelector("h4 .status.agg");
  if (agg) uit.push(["Aggregatie", (agg.getAttribute("title") || agg.textContent).trim()]);
  const sub = doos.querySelector(".sub");
  if (sub && sub.textContent.trim()) uit.push(["Methode", sub.textContent.trim()]);
  const foot = doos.querySelector(".foot");
  if (foot && foot.textContent.trim()) uit.push(["Bron", foot.textContent.trim()]);
  if (el.classList.contains("cell")) {
    const src = el.querySelector(".src");
    if (src && src.textContent.trim()) uit.unshift(["Bron van dit getal", src.textContent.trim()]);
  }
  return uit;
}

/* Sommige kaarten tonen achter een knoppenrij meerdere indicatoren: de buurtvergelijking zes,
   het inkomen twee maten, de tijdreeks meerdere reeksen. Dan moet de actieve keuze in de
   sleutel, anders hangt "deze wil ik als kaart zien" straks aan een grafiek die inmiddels
   iets anders toont. data-niveau blijft er bewust buiten: dat is een kijkstand, geen
   indicator. */
function volledigeSleutel(el) {
  const basis = el.dataset.onderwerp;
  const knop = el.querySelector(
    ".toggle button.actief[data-key], .toggle button.actief[data-ink], " +
    ".toggle button.actief[data-reeks], button.actief[data-key], " +
    "button.actief[data-ink], button.actief[data-reeks]");
  if (!knop) return basis;
  const v = knop.dataset.key || knop.dataset.ink || knop.dataset.reeks;
  return v ? `${basis}#${v}` : basis;
}

function sectieVan(el) {
  const sec = el.closest("section");
  return sec ? sec.id : "";
}

/* De negen secties, uit de gerenderde pagina en niet uit een tweede lijst — zelfde redenering
   als de sectienavigatie in js/app.js: dan kan hij niet uit de pas lopen. */
function secties() {
  return [...document.querySelectorAll("main > section")].map(sec => {
    const eyebrow = sec.querySelector(".eyebrow");
    const tekst = eyebrow ? eyebrow.textContent.trim() : "";
    const nr = (tekst.match(/^\d+/) || [""])[0];
    return {id: sec.id, nr, naam: nr ? tekst.replace(/^\d+\s*·?\s*/, "") : "Overzicht", el: sec};
  });
}

function ankers() {
  return [...document.querySelectorAll("main [data-onderwerp]")];
}

/* Kaarten en stroken tellen mee in de voortgang; losse kerncijfervierkanten niet, anders
   zegt "18 van 90" niets meer over hoe ver iemand is. */
function kaartAnkers() {
  return ankers().filter(el => el.classList.contains("chart-box") || el.classList.contains("strip"));
}

/* ---------- opmaak ----------
   In het bestand zelf en niet in index.html, zodat er buiten reviewmodus geen regel CSS voor
   deze laag in de pagina staat. */
function zetStijl() {
  const css = `
  [data-onderwerp]:hover{outline:2px dashed var(--schie);outline-offset:2px}
  [data-onderwerp].heeft-review{outline:2px solid var(--markering);outline-offset:2px}
  /* Bewust in de stroom en niet zwevend op hover. Een zwevende rij boven de kaart verdwijnt
     onder de twee sticky balken zodra je scrolt — dan is de knop er wel maar niet aan te
     klikken. In reviewmodus staat de rij dus gewoon altijd zichtbaar onder zijn kaart. */
  .reviewknoppen{
    display:flex;gap:2px;flex-wrap:wrap;align-items:center;
    margin:10px 0 0;padding-top:8px;border-top:1px dotted var(--grid);
  }
  .reviewknoppen button{
    font:inherit;font-size:11px;line-height:1.1;cursor:pointer;white-space:nowrap;
    background:var(--beton);color:var(--asfalt);border:1px solid var(--grid);padding:3px 6px;
  }
  .reviewknoppen button:hover{background:var(--beton-diep)}
  .reviewknoppen button[aria-pressed="true"]{background:var(--asfalt);color:var(--wit)}
  .reviewknoppen button.schrijf{background:var(--markering);border-color:var(--markering);font-weight:700}
  /* Een strook is een CSS-grid van vierkanten: een rij erin wordt een extra vierkant. Daarom
     staat die rij ernaast in de DOM, met een eigen markering. */
  .reviewknoppen.los{margin:2px 0 18px;border-top:0;padding-top:0}
  .reviewknoppen .waarover{font-size:11px;color:var(--asfalt-zacht);margin-right:4px}
  /* Een kerncijfervierkant is te klein voor vijf knoppen; daar alleen de schrijfknop. */
  .cell .reviewknoppen{margin-top:8px;padding-top:6px}
  .cell .reviewknoppen button:not(.schrijf){display:none}

  /* Vast onderaan en niet sticky bovenaan: daar staan de gebiedsbalk en de sectiebalk al,
     en die stapelen met een berekende offset. Onderaan is de balk bovendien altijd in beeld,
     en dat is precies wat de exportknop nodig heeft — die moet niet weg te scrollen zijn. */
  .reviewbalk{
    position:fixed;left:0;right:0;bottom:0;z-index:21;
    display:flex;align-items:center;gap:10px;flex-wrap:wrap;
    background:var(--markering);color:var(--asfalt);padding:6px 24px;font-size:12.5px;
    border-top:1px solid var(--asfalt);box-shadow:0 -2px 8px rgba(0,0,0,.18);
  }
  body.reviewmodus{padding-bottom:64px}
  .reviewbalk strong{font-size:11px;text-transform:uppercase;letter-spacing:.12em}
  .reviewbalk input[type=text]{font:inherit;font-size:12.5px;padding:3px 6px;
    border:1px solid var(--asfalt);background:var(--wit);width:150px}
  .reviewbalk button{font:inherit;font-size:12px;font-weight:600;cursor:pointer;
    background:var(--asfalt);color:var(--wit);border:1px solid var(--asfalt);padding:4px 10px}
  .reviewbalk button:hover{background:var(--asfalt-zacht)}
  .reviewbalk .teller{flex:1;font-variant-numeric:tabular-nums}
  .reviewbalk .let-op{background:var(--rood);color:var(--wit);padding:2px 8px;font-weight:700}

  .reviewpanel{position:fixed;inset:0;z-index:40;background:rgba(34,38,31,.55);padding:24px;
    display:none;border:0}
  .reviewpanel[open]{display:flex;align-items:center;justify-content:center}
  .reviewpanel .paneel{background:var(--wit);border:1px solid var(--asfalt);max-width:720px;
    width:100%;max-height:85vh;overflow:auto;padding:22px 24px}
  .reviewpanel h3{margin:0 0 2px;font-size:17px}
  .reviewpanel .waar{font-size:12px;color:var(--asfalt-zacht);margin-bottom:14px}
  .reviewpanel dl{margin:0 0 16px;font-size:12px;border-left:3px solid var(--grid);padding-left:10px}
  .reviewpanel dt{font-weight:700;margin-top:6px}
  .reviewpanel dd{margin:0;color:var(--asfalt-zacht)}
  .reviewpanel label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;
    letter-spacing:.1em;margin:14px 0 4px}
  .reviewpanel textarea,.reviewpanel input[type=text]{font:inherit;font-size:13.5px;width:100%;
    box-sizing:border-box;padding:7px 8px;border:1px solid var(--asfalt);background:var(--wit)}
  .reviewpanel textarea{min-height:110px;resize:vertical}
  .reviewpanel .keuze{display:flex;gap:4px;flex-wrap:wrap}
  .reviewpanel .keuze button{font:inherit;font-size:12.5px;cursor:pointer;padding:5px 10px;
    background:var(--beton);color:var(--asfalt);border:1px solid var(--grid)}
  .reviewpanel .keuze button[aria-pressed="true"]{background:var(--asfalt);color:var(--wit)}
  .reviewpanel .acties{display:flex;gap:8px;margin-top:20px;align-items:center}
  .reviewpanel .acties button{font:inherit;font-size:13px;font-weight:600;cursor:pointer;
    background:var(--asfalt);color:var(--wit);border:1px solid var(--asfalt);padding:6px 14px}
  .reviewpanel .acties .weg{background:transparent;color:var(--rood);border-color:var(--rood)}
  .reviewpanel .acties .sluit{background:transparent;color:var(--asfalt);border-color:var(--grid)}
  .reviewpanel .uitvoer{font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;min-height:280px}

  .reviewsectie{border:1px dashed var(--schie);background:var(--wit);padding:12px 14px;
    margin:22px 0 4px}
  .reviewsectie label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;
    letter-spacing:.1em;margin-bottom:5px;color:var(--schie)}
  .reviewsectie textarea{font:inherit;font-size:13.5px;width:100%;box-sizing:border-box;
    padding:7px 8px;border:1px solid var(--grid);background:var(--wit);min-height:62px;
    resize:vertical}
  .reviewslot{border:2px solid var(--schie);background:var(--wit);padding:18px 20px;margin:28px 0}
  .reviewslot h3{margin:0 0 4px;font-size:16px}
  .reviewslot p{font-size:12.5px;color:var(--asfalt-zacht);margin:0 0 8px}
  .reviewslot textarea{font:inherit;font-size:13.5px;width:100%;box-sizing:border-box;
    padding:8px;border:1px solid var(--asfalt);background:var(--wit);min-height:90px;
    resize:vertical}
  .weeslijst{background:var(--beton-diep);border-left:4px solid var(--rood);padding:10px 12px;
    font-size:12.5px;margin-bottom:14px}`;
  const el = document.createElement("style");
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- balk ---------- */
let balkEl = null;

function initialen(naam) {
  const d = String(naam || "").trim().split(/\s+/).filter(Boolean);
  if (!d.length) return "?";
  return d.map(w => w[0].toUpperCase()).join("").slice(0, 3);
}

function aantalIngevuld(dossier) {
  return Object.values(dossier.onderwerpen || {})
    .filter(o => o.mening || (o.opmerking || "").trim() || (o.opgave || "").trim()).length;
}

function tekenBalk() {
  if (!balkEl) return;
  const teller = balkEl.querySelector(".teller");
  const kaarten = kaartAnkers().length;
  const beoordeeld = kaartAnkers()
    .filter(el => {
      const o = eigen.onderwerpen[volledigeSleutel(el)];
      return o && (o.mening || (o.opmerking || "").trim());
    }).length;
  const bekeken = Object.values(eigen.secties).filter(x => x && x.bekeken).length;
  const totaalSecties = secties().length;
  const delen = [
    `${beoordeeld} van ${kaarten} kaarten`,
    `${aantalIngevuld(eigen)} ingevuld`,
    `${bekeken} van ${totaalSecties} secties bekeken`,
  ];
  if (binnen.length) delen.push(`${binnen.length} geïmporteerd`);
  teller.textContent = delen.join(" · ");

  /* De luidruchtige waarschuwing. Browseropslag is geen bewaarplaats: wie zijn browser
     opschoont of van apparaat wisselt is alles kwijt zonder export. */
  const waarschuwing = balkEl.querySelector(".let-op");
  if (!opslagWerkt) {
    waarschuwing.hidden = false;
    waarschuwing.textContent = "opslag werkt niet in deze browser — exporteer vóór je sluit";
  } else if (onopgeslagen && aantalIngevuld(eigen)) {
    waarschuwing.hidden = false;
    waarschuwing.textContent = "nog niet geëxporteerd";
  } else {
    waarschuwing.hidden = true;
  }
}

function bouwBalk() {
  balkEl = document.createElement("div");
  balkEl.className = "reviewbalk";
  balkEl.innerHTML =
    "<strong>Reviewmodus</strong>" +
    '<label style="font-size:11px">naam <input type="text" id="reviewNaam" ' +
    'placeholder="je naam" autocomplete="name"></label>' +
    '<span class="teller"></span>' +
    '<span class="let-op" hidden></span>' +
    '<button type="button" id="reviewMd">Markdown voor issue</button>' +
    '<button type="button" id="reviewJson">Exporteer JSON</button>' +
    '<button type="button" id="reviewImport">Importeer…</button>' +
    '<input type="file" id="reviewBestand" accept="application/json,.json" multiple hidden>';
  document.body.appendChild(balkEl);
  document.body.classList.add("reviewmodus");

  const naam = balkEl.querySelector("#reviewNaam");
  naam.value = eigen.reviewer || "";
  naam.addEventListener("input", () => { eigen.reviewer = naam.value; bewaar(); });

  balkEl.querySelector("#reviewJson").addEventListener("click", exporteerJson);
  balkEl.querySelector("#reviewMd").addEventListener("click", toonMarkdown);
  const bestand = balkEl.querySelector("#reviewBestand");
  balkEl.querySelector("#reviewImport").addEventListener("click", () => bestand.click());
  bestand.addEventListener("change", () => {
    importeer([...bestand.files]);
    bestand.value = "";
  });
}

/* ---------- knoppen op de kaart zelf ----------
   Bewust zonder dialoog: wie in twee minuten het hele dashboard wil langslopen moet niet per
   kaart een venster hoeven openen en sluiten. Het paneel is voor wie iets wil typen. */
/* Welke knoppenrij bij welk element hoort. Een Map en geen querySelector op het element
   zelf, omdat de rij van een strook ernaast in de DOM staat en niet erin. */
const rijVan = new Map();

/* Een kaart met een strook erin krijgt drie knoppenrijen onder elkaar: één per
   kerncijfervierkant, één voor de strook en één voor de kaart zelf. Zonder label is niet te
   zien welke waarover gaat, dus draagt elke rij er een. */
function plaatsRij(el, rij) {
  const label = document.createElement("span");
  label.className = "waarover";
  if (el.classList.contains("strip")) {
    /* .strip is een grid: een kind erin wordt een extra vierkant en verpest de kolommen. */
    rij.classList.add("los");
    label.textContent = "↑ deze kerncijfers:";
    rij.insertBefore(label, rij.firstChild);
    el.parentNode.insertBefore(rij, el.nextSibling);
  } else if (el.classList.contains("cell")) {
    el.appendChild(rij);
  } else {
    label.textContent = "↑ deze kaart:";
    rij.insertBefore(label, rij.firstChild);
    el.appendChild(rij);
  }
}

function tekenKnoppen(el) {
  const sleutel = volledigeSleutel(el);
  const huidig = eigen.onderwerpen[sleutel] || {};
  let rij = rijVan.get(el);
  if (!rij) {
    rij = document.createElement("div");
    rij.className = "reviewknoppen";
    for (const [waarde, label] of MENINGEN) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.mening = waarde;
      b.textContent = label;
      b.addEventListener("click", ev => {
        ev.stopPropagation();
        veiligReview("mening", () => zetVeld(el, "mening",
          eigen.onderwerpen[volledigeSleutel(el)] &&
          eigen.onderwerpen[volledigeSleutel(el)].mening === waarde ? null : waarde));
      });
      rij.appendChild(b);
    }
    const schrijf = document.createElement("button");
    schrijf.type = "button";
    schrijf.className = "schrijf";
    schrijf.textContent = "✎ toelichten";
    schrijf.addEventListener("click", ev => {
      ev.stopPropagation();
      veiligReview("paneel", () => openPaneel(el));
    });
    rij.appendChild(schrijf);
    rijVan.set(el, rij);
    plaatsRij(el, rij);
  }
  /* Welke rij waarbij hoort, ook in de DOM. De rij van een strook staat namelijk náást de
     strook en dus binnen dezelfde kaart, zodat een kaart met een strook twee rijen als
     direct kind heeft. De laag zelf zoekt via rijVan, maar zonder dit is in de DOM niet te
     zien welke rij waarover gaat — bij een controle of een bugmelding is dat precies wat je
     wilt weten. */
  rij.dataset.voor = sleutel;
  for (const b of rij.querySelectorAll("button[data-mening]")) {
    b.setAttribute("aria-pressed", String(huidig.mening === b.dataset.mening));
  }
  const gevuld = huidig.mening || (huidig.opmerking || "").trim() || (huidig.opgave || "").trim();
  el.classList.toggle("heeft-review", !!gevuld);
}

function zetVeld(el, veld, waarde) {
  const sleutel = volledigeSleutel(el);
  const o = eigen.onderwerpen[sleutel] || {};
  o[veld] = waarde;
  o.naam = naamVan(el);
  o.sectie = sectieVan(el);
  o.ts = new Date().toISOString();
  /* Helemaal leeg? Dan de regel weggooien in plaats van een lege opmerking exporteren. */
  if (!o.mening && !(o.opmerking || "").trim() && !(o.opgave || "").trim()) {
    delete eigen.onderwerpen[sleutel];
  } else {
    eigen.onderwerpen[sleutel] = o;
  }
  bewaar();
  tekenKnoppen(el);
}

/* ---------- paneel ----------
   Zelfde vormtaal als het feitenblad in js/app.js: een dialog met een paneel erin. */
let paneelEl = null;

function bouwPaneel() {
  paneelEl = document.createElement("dialog");
  paneelEl.className = "reviewpanel";
  paneelEl.innerHTML =
    '<form method="dialog" class="paneel">' +
    '<h3 id="revKop"></h3><div class="waar" id="revWaar"></div>' +
    '<dl id="revHerkomst"></dl>' +
    "<label>Wat vind je ervan?</label>" +
    '<div class="keuze" id="revKeuze"></div>' +
    '<label for="revTekst">Toelichting — is dit nuttig, hoe wil je het zien?</label>' +
    '<textarea id="revTekst" placeholder="Bijvoorbeeld: nuttig, maar ik wil dit per tijdvak ' +
    'uitgesplitst zien; of: dit zegt me niets voor mijn gebied."></textarea>' +
    '<label for="revOpgave">Raakt welke opgave? (optioneel, één regel)</label>' +
    '<input type="text" id="revOpgave" list="revOpgaven" placeholder="bijv. verkeersveiligheid schoolomgeving">' +
    '<datalist id="revOpgaven"></datalist>' +
    '<div class="acties"><button type="submit" value="ok">Bewaren</button>' +
    '<button type="button" class="weg">Wissen</button>' +
    '<button type="submit" value="sluit" class="sluit">Sluiten</button></div>' +
    "</form>";
  document.body.appendChild(paneelEl);
}

/* Alle opgaven die al genoemd zijn, als suggestielijst. Zo groeit er vanzelf een vocabulaire
   waar later js/opgaven.js uit gevuld kan worden, zonder dat de reviewer nu al uit een lijst
   moet kiezen die er niet is. */
function genoemdeOpgaven() {
  const uit = new Set();
  for (const d of [eigen, ...binnen]) {
    for (const o of Object.values(d.onderwerpen || {})) {
      const v = (o.opgave || "").trim();
      if (v) uit.add(v);
    }
  }
  return [...uit].sort((a, b) => a.localeCompare(b, "nl"));
}

function openPaneel(el) {
  if (!paneelEl) bouwPaneel();
  const sleutel = volledigeSleutel(el);
  const o = eigen.onderwerpen[sleutel] || {};
  const sec = secties().find(s => s.id === sectieVan(el));

  paneelEl.querySelector("#revKop").textContent = naamVan(el);
  paneelEl.querySelector("#revWaar").textContent =
    (sec ? `${sec.nr ? sec.nr + " · " : ""}${sec.naam} · ` : "") + sleutel;

  const dl = paneelEl.querySelector("#revHerkomst");
  dl.innerHTML = herkomstVan(el)
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("") ||
    "<dt>Herkomst</dt><dd>niet vermeld op de kaart zelf</dd>";

  const keuze = paneelEl.querySelector("#revKeuze");
  keuze.innerHTML = MENINGEN.map(([w, l]) =>
    `<button type="button" data-mening="${w}" aria-pressed="${o.mening === w}">${l}</button>`).join("");
  for (const b of keuze.querySelectorAll("button")) {
    b.addEventListener("click", () => {
      const nieuw = b.getAttribute("aria-pressed") === "true" ? null : b.dataset.mening;
      for (const x of keuze.querySelectorAll("button")) {
        x.setAttribute("aria-pressed", String(x.dataset.mening === nieuw));
      }
    });
  }

  paneelEl.querySelector("#revTekst").value = o.opmerking || "";
  paneelEl.querySelector("#revOpgave").value = o.opgave || "";
  paneelEl.querySelector("#revOpgaven").innerHTML =
    genoemdeOpgaven().map(v => `<option value="${v.replace(/"/g, "&quot;")}">`).join("");

  const wis = paneelEl.querySelector(".weg");
  wis.onclick = () => {
    delete eigen.onderwerpen[sleutel];
    bewaar();
    tekenKnoppen(el);
    paneelEl.close("gewist");
  };

  paneelEl.onclose = () => veiligReview("paneel-sluiten", () => {
    if (paneelEl.returnValue !== "ok") return;
    const gekozen = keuze.querySelector('button[aria-pressed="true"]');
    const o2 = eigen.onderwerpen[sleutel] || {};
    o2.mening = gekozen ? gekozen.dataset.mening : null;
    o2.opmerking = paneelEl.querySelector("#revTekst").value.trim();
    o2.opgave = paneelEl.querySelector("#revOpgave").value.trim();
    o2.naam = naamVan(el);
    o2.sectie = sectieVan(el);
    o2.ts = new Date().toISOString();
    if (!o2.mening && !o2.opmerking && !o2.opgave) delete eigen.onderwerpen[sleutel];
    else eigen.onderwerpen[sleutel] = o2;
    bewaar();
    tekenKnoppen(el);
  });

  paneelEl.showModal();
  paneelEl.querySelector("#revTekst").focus();
}

/* ---------- per sectie: wat mis je hier? ----------
   De vraag "sluit dit aan op onze opgaven" wordt vaak beantwoord met "wat ik nodig heb staat
   er niet". Daar is per definitie geen kaart voor om op te klikken, dus krijgt elke sectie
   een eigen veld. */
function bouwSectievragen() {
  for (const s of secties()) {
    if (!s.id) continue;
    const doos = document.createElement("div");
    doos.className = "reviewsectie";
    const id = "revMist-" + s.id;
    doos.innerHTML =
      `<label for="${id}">Wat mis je in ${s.nr ? s.nr + " · " : ""}${s.naam}?</label>` +
      `<textarea id="${id}" placeholder="Welk cijfer of welke uitsplitsing heb je hier nodig ` +
      'die er niet staat?"></textarea>';
    const ta = doos.querySelector("textarea");
    ta.value = (eigen.secties[s.id] || {}).mist || "";
    ta.addEventListener("change", () => {
      const rec = eigen.secties[s.id] || {};
      rec.mist = ta.value.trim();
      rec.naam = s.naam;
      rec.nr = s.nr;
      eigen.secties[s.id] = rec;
      bewaar();
    });
    s.el.appendChild(doos);
  }
}

/* Eén slotvraag, buiten alle kaarten om — de enige plek waar de vraag onbegrensd gesteld
   kan worden. */
function bouwSlotvraag() {
  const doos = document.createElement("div");
  doos.className = "reviewslot";
  doos.innerHTML =
    "<h3>Tot slot</h3>" +
    "<p>Welke vraag uit je werk kun je met dit dashboard <em>niet</em> beantwoorden?</p>" +
    '<textarea id="revSlot"></textarea>';
  const main = document.querySelector("main");
  if (!main) return;
  main.appendChild(doos);
  const ta = doos.querySelector("#revSlot");
  ta.value = eigen.slotvraag || "";
  ta.addEventListener("change", () => { eigen.slotvraag = ta.value.trim(); bewaar(); });
}

/* ---------- bekeken secties ----------
   Zonder dit is stilte over sectie 07 niet te onderscheiden van er nooit geweest zijn. De
   teller staat in de balk, voor de reviewer zelf zichtbaar: een voortgangsmeter, niet iets
   wat achter zijn rug om wordt bijgehouden. */
function volgBekeken() {
  if (!("IntersectionObserver" in window)) return;
  const kijker = new IntersectionObserver(items => {
    let gewijzigd = false;
    for (const i of items) {
      if (!i.isIntersecting) continue;
      const id = i.target.id;
      if (!id) continue;
      const rec = eigen.secties[id] || {};
      if (!rec.bekeken) { rec.bekeken = true; eigen.secties[id] = rec; gewijzigd = true; }
    }
    if (gewijzigd) bewaar();
  }, {threshold: .35});
  for (const s of secties()) if (s.id) kijker.observe(s.el);
}

/* ---------- export ---------- */

function dossierAlsDocument() {
  const secs = secties();
  const naamVanSectie = id => {
    const s = secs.find(x => x.id === id);
    return s ? `${s.nr ? s.nr + " · " : ""}${s.naam}` : id;
  };
  return {
    bestand: "rayonplannen-review",
    versie: REVIEW_VERSIE,
    gebied: GEBIED,
    gebiednaam: typeof GEBIEDNAAM !== "undefined" ? GEBIEDNAAM : "",
    gebiedniveau: typeof GEBIEDNIVEAU !== "undefined" ? GEBIEDNIVEAU : "",
    peildatum: (typeof GEBIEDEN !== "undefined" && GEBIEDEN.peildatum) || "",
    reviewer: eigen.reviewer || "",
    geexporteerd: new Date().toISOString(),
    /* Welke blokken zijn gevallen bij dit bezoek. Zonder dit lees je achteraf "deze grafiek
       is leeg" als een inhoudelijk oordeel, terwijl er gewoon een databestand ontbrak. */
    veiligFouten: document.body.dataset.veiligFouten || "",
    bekekenSecties: Object.entries(eigen.secties)
      .filter(([, v]) => v && v.bekeken).map(([k]) => k),
    opmerkingen: Object.entries(eigen.onderwerpen)
      .map(([sleutel, o]) => ({
        onderwerp: sleutel,
        naam: o.naam || "",
        sectie: o.sectie || "",
        sectienaam: naamVanSectie(o.sectie || ""),
        mening: o.mening || null,
        opmerking: o.opmerking || "",
        opgave: o.opgave || "",
        ts: o.ts || "",
      }))
      .sort((a, b) => (a.sectie + a.onderwerp).localeCompare(b.sectie + b.onderwerp, "nl")),
    secties: Object.entries(eigen.secties)
      .filter(([, v]) => v && (v.mist || "").trim())
      .map(([id, v]) => ({sectie: id, naam: naamVanSectie(id), mist: v.mist})),
    slotvraag: eigen.slotvraag || "",
  };
}

function download(naam, inhoud, type) {
  const blob = new Blob([inhoud], {type: type + ";charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = naam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exporteerJson() {
  veiligReview("export-json", () => {
    /* Alleen het eigen dossier: wie geïmporteerd heeft mag de opmerkingen van zijn collega's
       niet als de zijne terugexporteren. */
    const doc = dossierAlsDocument();
    const datum = new Date().toISOString().slice(0, 10);
    const wie = initialen(eigen.reviewer).toLowerCase();
    download(`review-${GEBIED}-${wie}-${datum}.json`, JSON.stringify(doc, null, 2),
      "application/json");
    onopgeslagen = false;
    bewaar();
    onopgeslagen = false;
    try {
      localStorage.setItem(OPSLAGSLEUTEL, JSON.stringify({eigen, binnen, onopgeslagen}));
    } catch (e) { /* al afgevangen in bewaar() */ }
    tekenBalk();
  });
}

/* ---------- markdown ----------
   Gegroepeerd per onderwerp en niet per reviewer: dan zie je in één oogopslag dat vier mensen
   iets over dezelfde grafiek zeggen. */
function alleDossiers() {
  return [dossierAlsDocument(), ...binnen];
}

function bouwMarkdown() {
  const docs = alleDossiers().filter(d =>
    (d.opmerkingen || []).length || (d.secties || []).length || (d.slotvraag || "").trim());
  const n = docs.length;
  const eersteDoc = docs[0] || dossierAlsDocument();
  const wie = docs.map(d => initialen(d.reviewer)).join(", ") || "—";

  /* per onderwerp verzamelen */
  const perOnderwerp = new Map();
  for (const d of docs) {
    for (const o of d.opmerkingen || []) {
      if (!perOnderwerp.has(o.onderwerp)) {
        perOnderwerp.set(o.onderwerp, {
          onderwerp: o.onderwerp, naam: o.naam, sectie: o.sectie,
          sectienaam: o.sectienaam || o.sectie, regels: [],
        });
      }
      perOnderwerp.get(o.onderwerp).regels.push({who: initialen(d.reviewer), ...o});
    }
  }

  const telling = r => {
    const t = {};
    for (const x of r) if (x.mening) t[x.mening] = (t[x.mening] || 0) + 1;
    const stukken = MENINGEN.filter(([w]) => t[w]).map(([w, l]) => `${l.toLowerCase()} ${t[w]}`);
    const leeg = n - r.filter(x => x.mening).length;
    if (leeg > 0) stukken.push(`niets ingevuld ${leeg}`);
    return {tekst: stukken.join(" · "), t};
  };

  const uit = [];
  uit.push(`# Reviewronde — ${eersteDoc.gebiednaam || GEBIED}` +
    (eersteDoc.gebiedniveau ? ` (${eersteDoc.gebiedniveau})` : ""));
  uit.push("");
  uit.push(`Gebied \`${eersteDoc.gebied}\`` +
    (eersteDoc.peildatum ? ` · data-peildatum ${eersteDoc.peildatum}` : "") +
    ` · ${n} reviewer${n === 1 ? "" : "s"}: ${wie}` +
    ` · samengesteld ${new Date().toISOString().slice(0, 10)}`);
  uit.push("");
  /* Deze regel hoort erbij te blijven staan. Zodra de tabel hieronder los circuleert is niet
     meer te zien hoe klein n is, en gaat "3× niet interessant" klinken als een meting. Een
     leeg vakje is "niet ingevuld", niet "akkoord" — dezelfde fout als een onderdrukte
     CBS-cel als nul lezen. */
  uit.push(`> ${n} mening${n === 1 ? "" : "en"}, geen meting. Niets invullen was toegestaan, ` +
    "dus een leeg vakje betekent “niet ingevuld” en niet “akkoord”. " +
    "Wie zich niet meldde is bovendien niet dezelfde groep als wie het dashboard gaat " +
    "gebruiken. Lees dit als agenda voor een gesprek, niet als besluit.");
  uit.push("");

  /* samenvattende tabel */
  const gesorteerd = [...perOnderwerp.values()].sort((a, b) => {
    const score = x => x.regels.filter(r =>
      r.mening === "niet-interessant" || r.mening === "anders-vormgeven").length;
    return score(b) - score(a) || a.onderwerp.localeCompare(b.onderwerp, "nl");
  });
  const opvallend = gesorteerd.filter(g => g.regels.some(r =>
    r.mening === "niet-interessant" || r.mening === "anders-vormgeven"));
  if (opvallend.length) {
    uit.push("## Waar de meeste twijfel zit");
    uit.push("");
    uit.push("| onderwerp | niet interessant | anders vormgeven | nuttig | onmisbaar | niets ingevuld |");
    uit.push("|---|---|---|---|---|---|");
    for (const g of opvallend) {
      const t = telling(g.regels).t;
      const leeg = n - g.regels.filter(x => x.mening).length;
      uit.push(`| ${g.naam} (\`${g.onderwerp}\`) | ${t["niet-interessant"] || 0} | ` +
        `${t["anders-vormgeven"] || 0} | ${t.nuttig || 0} | ${t.onmisbaar || 0} | ${leeg} |`);
    }
    uit.push("");
  }

  /* per sectie, per onderwerp */
  const perSectie = new Map();
  for (const g of perOnderwerp.values()) {
    const k = g.sectienaam || "Overig";
    if (!perSectie.has(k)) perSectie.set(k, []);
    perSectie.get(k).push(g);
  }
  for (const [sectienaam, groepen] of perSectie) {
    uit.push(`## ${sectienaam}`);
    uit.push("");
    for (const g of groepen.sort((a, b) => a.onderwerp.localeCompare(b.onderwerp, "nl"))) {
      uit.push(`### ${g.naam} — \`${g.onderwerp}\``);
      const tel = telling(g.regels).tekst;
      if (tel) uit.push("");
      if (tel) uit.push(tel);
      const metTekst = g.regels.filter(r => (r.opmerking || "").trim() || (r.opgave || "").trim());
      if (metTekst.length) {
        uit.push("");
        for (const r of metTekst) {
          const opgave = (r.opgave || "").trim() ? ` _(opgave: ${r.opgave.trim()})_` : "";
          uit.push(`- **${r.who}**: ${(r.opmerking || "").trim() || "—"}${opgave}`);
        }
      }
      uit.push("");
    }
  }

  const mist = [];
  for (const d of docs) for (const s of d.secties || []) {
    mist.push(`- **${initialen(d.reviewer)}** bij ${s.naam}: ${s.mist}`);
  }
  if (mist.length) { uit.push("## Wat er per sectie gemist wordt"); uit.push(""); uit.push(...mist); uit.push(""); }

  const slot = docs.filter(d => (d.slotvraag || "").trim());
  if (slot.length) {
    uit.push("## Welke vraag het dashboard niet beantwoordt");
    uit.push("");
    for (const d of slot) uit.push(`- **${initialen(d.reviewer)}**: ${d.slotvraag.trim()}`);
    uit.push("");
  }

  /* De genoemde opgaven, met tellingen. Hier groeit de lijst uit die er nog niet is. */
  const opgaven = new Map();
  for (const d of docs) for (const o of d.opmerkingen || []) {
    const v = (o.opgave || "").trim();
    if (v) opgaven.set(v, (opgaven.get(v) || 0) + 1);
  }
  if (opgaven.size) {
    uit.push("## Genoemde opgaven");
    uit.push("");
    for (const [v, c] of [...opgaven].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "nl"))) {
      uit.push(`- ${v} (${c}×)`);
    }
    uit.push("");
  }

  const fouten = docs.map(d => d.veiligFouten).filter(Boolean);
  if (fouten.length) {
    uit.push("## Gevallen blokken tijdens de review");
    uit.push("");
    uit.push("Deze blokken waren stuk toen er gekeken werd; een opmerking dat er niets staat " +
      "kan daaraan liggen en niet aan de keuze.");
    uit.push("");
    for (const f of [...new Set(fouten)]) uit.push(`- \`${f}\``);
    uit.push("");
  }

  return uit.join("\n");
}

/* Kopiëren via een textarea met select-all naast navigator.clipboard: die API vraagt een
   beveiligde context en gedraagt zich op file:// anders dan op https. Downloaden kan altijd. */
function toonMarkdown() {
  veiligReview("export-markdown", () => {
    if (!paneelEl) bouwPaneel();
    const md = bouwMarkdown();
    const dlg = document.createElement("dialog");
    dlg.className = "reviewpanel";
    dlg.innerHTML =
      '<form method="dialog" class="paneel"><h3>Markdown voor een GitHub-issue</h3>' +
      '<div class="waar">Plak dit als issuebody. Alles staat er ook nog in je browser, dus ' +
      "je kunt straks opnieuw exporteren.</div>" +
      '<textarea class="uitvoer" readonly></textarea>' +
      '<div class="acties"><button type="button" class="kopieer">Kopieer</button>' +
      '<button type="button" class="bewaar">Download .md</button>' +
      '<button type="submit" class="sluit">Sluiten</button></div></form>';
    document.body.appendChild(dlg);
    const ta = dlg.querySelector(".uitvoer");
    ta.value = md;
    dlg.querySelector(".kopieer").addEventListener("click", async () => {
      const knop = dlg.querySelector(".kopieer");
      ta.select();
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(md);
          ok = true;
        }
      } catch (e) { ok = false; }
      if (!ok) { try { ok = document.execCommand("copy"); } catch (e) { ok = false; } }
      knop.textContent = ok ? "Gekopieerd" : "Selecteer en kopieer zelf";
    });
    dlg.querySelector(".bewaar").addEventListener("click", () => {
      const datum = new Date().toISOString().slice(0, 10);
      download(`review-${GEBIED}-${datum}.md`, md, "text/markdown");
    });
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  });
}

/* ---------- import ----------
   Meerdere bestanden tegelijk; samenvoegen op reviewer, zodat een tweede export van dezelfde
   persoon zijn eigen eerdere vervangt en die van een ander niet raakt. */
function importeer(bestanden) {
  let klaar = 0;
  const gelezen = [];
  for (const f of bestanden) {
    const lezer = new FileReader();
    lezer.onload = () => {
      veiligReview("import", () => {
        const doc = JSON.parse(lezer.result);
        if (doc && doc.bestand === "rayonplannen-review") gelezen.push(doc);
        else console.warn(`[review] ${f.name} is geen reviewbestand`);
      });
      if (++klaar === bestanden.length) verwerkImport(gelezen);
    };
    lezer.onerror = () => {
      console.warn(`[review] ${f.name} niet leesbaar`);
      if (++klaar === bestanden.length) verwerkImport(gelezen);
    };
    lezer.readAsText(f);
  }
}

function verwerkImport(docs) {
  veiligReview("import-verwerken", () => {
    const bekend = new Set(ankers().map(volledigeSleutel));
    const wezen = [];
    const anderGebied = [];
    for (const doc of docs) {
      if (doc.gebied && doc.gebied !== GEBIED) anderGebied.push(`${doc.gebied} (${initialen(doc.reviewer)})`);
      for (const o of doc.opmerkingen || []) {
        if (!bekend.has(o.onderwerp)) wezen.push({...o, who: initialen(doc.reviewer)});
      }
      /* Zelfde reviewer opnieuw ingeladen: vervangen, niet stapelen. */
      const sleutel = (doc.reviewer || "").trim().toLowerCase();
      binnen = binnen.filter(d => (d.reviewer || "").trim().toLowerCase() !== sleutel);
      binnen.push(doc);
    }
    bewaar();
    meldImport(docs.length, wezen, anderGebied);
  });
}

/* Een opmerking waarvan het onderwerp niet meer bestaat gaat niet stil verloren: hij komt
   in beeld met de tekst erbij, zodat je hem met de hand kunt verplaatsen. Dit is precies het
   geval waarvoor de ankers expliciet zijn — en het is te verwachten zodra het dashboard
   verandert tussen twee rondes. */
function meldImport(aantal, wezen, anderGebied) {
  const dlg = document.createElement("dialog");
  dlg.className = "reviewpanel";
  let html = '<form method="dialog" class="paneel"><h3>Geïmporteerd</h3>' +
    `<div class="waar">${aantal} bestand${aantal === 1 ? "" : "en"} ingelezen. ` +
    "De markdown-export voegt ze samen met je eigen opmerkingen; je JSON-export blijft " +
    "alleen die van jezelf.</div>";
  if (anderGebied.length) {
    html += '<div class="weeslijst"><b>Let op: ander gebied.</b> ' +
      `Deze bestanden gaan over ${anderGebied.join(", ")}, en deze pagina toont ${GEBIED}. ` +
      "De opmerkingen zijn ingeladen, maar de ankers kunnen elders staan.</div>";
  }
  if (wezen.length) {
    html += '<div class="weeslijst"><b>' + wezen.length + " opmerking" +
      (wezen.length === 1 ? "" : "en") + " zonder onderwerp.</b> " +
      "Deze kaarten bestaan niet meer op deze pagina — hernoemd of verwijderd. " +
      "Ze zijn niet weggegooid en staan hieronder en in de markdown-export.<ul>" +
      wezen.map(w => `<li><code>${w.onderwerp}</code> — <b>${w.who}</b>: ` +
        `${(w.opmerking || "").trim() || w.mening || "(alleen mening)"}</li>`).join("") +
      "</ul></div>";
  }
  html += '<div class="acties"><button type="submit" class="sluit">Sluiten</button></div></form>';
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.showModal();
}

/* ---------- starten ---------- */
veiligReview("start", () => {
  laadOpslag();
  zetStijl();
  bouwBalk();
  bouwSectievragen();
  bouwSlotvraag();
  for (const el of ankers()) veiligReview("anker:" + el.dataset.onderwerp, () => tekenKnoppen(el));
  volgBekeken();
  tekenBalk();

  /* De knoppen van een kaart met een indicatorschakelaar moeten meebewegen: schakel je van
     WOZ naar autobezit, dan hoort de mening van WOZ niet meer opgelicht te staan. */
  document.addEventListener("click", ev => {
    const knop = ev.target.closest("button[data-key],button[data-ink],button[data-reeks]");
    if (!knop) return;
    setTimeout(() => veiligReview("herteken", () => {
      for (const el of ankers()) tekenKnoppen(el);
      tekenBalk();
    }), 0);
  }, true);

  window.addEventListener("beforeunload", ev => {
    if (!onopgeslagen || !aantalIngevuld(eigen)) return;
    ev.preventDefault();
    ev.returnValue = "";
  });

  document.body.dataset.reviewmodus = "1";
  console.info(`[review] reviewmodus actief voor ${GEBIED}: ` +
    `${ankers().length} ankers, ${kaartAnkers().length} kaarten.`);
});
