/* Laadt de datamap van het gekozen gebied en daarna app.js.

   Waarom dynamisch en niet met vaste <script>-tags: het dashboard moet van gebied kunnen
   wisselen, en het moet blijven werken door dubbel te klikken op index.html. Onder file://
   faalt fetch() van een lokaal bestand op CORS, maar een <script>-tag mag wel. Dus injecteren
   we scripttags met async=false, wat de uitvoeringsvolgorde garandeert.

   Het gekozen gebied staat in de URL-hash (#gebied=RAYON_NOORD_BUITEN), zodat een gebied
   deelbaar en herlaadbaar is. Wisselen herlaadt de pagina: eenmaal geladen globale consts
   zijn niet te overschrijven, en een herlaad is eerlijker dan half bijwerken. */

const STANDAARD_GEBIED = "WK059904";

/* stapnaam -> bestandsnaam; spiegel van STAP_BESTAND in scripts/bouw_data.py */
const DATA_BESTANDEN = [
  ["profiel", "profiel.js"],
  /* regios.js is er niet meer: negentien identieke bestanden met de gebiedsboom die al in
     data/index.js staat, en REGIOS werd nergens gelezen (#39). */
  ["geo", "geo.js"],
  ["odin", "odin_wijk.js"],
  ["ov", "ov.js"],
  ["infra", "infra.js"],
  ["voorzieningen", "voorzieningen.js"],
  ["cbs", "cbs_mobiliteit.js"],
  ["segmenten", "segmenten.js"],
  ["ongevallen", "ongevallen.js"],
];

function gekozenGebied() {
  const m = /(?:^|[#&])gebied=([A-Za-z0-9_]+)/.exec(location.hash || "");
  const uit = m ? m[1] : STANDAARD_GEBIED;
  /* Alleen gebieden die volgens data/gebouwd.js lokaal gebouwd zijn. Anders krijg je een
     pagina met louter ontbrekende bestanden en een console vol 404's. Ontbreekt gebouwd.js
     — het is gitignored, dus in een verse clone is dat normaal — dan proberen we het gewoon
     en degraderen de blokken via veilig(). */
  if (typeof GEBOUWD !== "undefined" && !GEBOUWD[uit]) {
    console.warn(`[laad] gebied ${uit} is niet gebouwd; terug naar ${STANDAARD_GEBIED}`);
    return STANDAARD_GEBIED;
  }
  return uit;
}

const HUIDIG_GEBIED = gekozenGebied();

/* welke stappen bestaan voor dit gebied? Ontbrekende stappen slaan we over in plaats van
   een 404 te forceren; app.js degradeert dan netjes via zijn veilig()-guards. */
function stappenVan(code) {
  if (typeof GEBOUWD !== "undefined" && GEBOUWD[code]) {
    return new Set(GEBOUWD[code]);
  }
  return null; // onbekend: alles proberen
}

(function laad() {
  const beschikbaar = stappenVan(HUIDIG_GEBIED);
  const paden = DATA_BESTANDEN
    .filter(([stap]) => !beschikbaar || beschikbaar.has(stap))
    .map(([, bestand]) => `data/${HUIDIG_GEBIED}/${bestand}`);
  /* Gebiedstotalen van álle gebieden, voor de referentiereeksen in de grafieken. Staat los
     van de gebiedsmap: vergelijken moet kunnen zonder dat het vergeleken gebied volledig
     gebouwd is. Ontbreekt het bestand, dan valt de vergelijking terug op de gemeente. */
  paden.push("data/referentie.js");
  paden.push("js/app.js");

  const ontbreekt = DATA_BESTANDEN
    .filter(([stap]) => beschikbaar && !beschikbaar.has(stap))
    .map(([stap]) => stap);
  if (ontbreekt.length) {
    console.info(`[laad] ${HUIDIG_GEBIED}: stappen niet gebouwd, overgeslagen: ${ontbreekt}`);
  }

  let laatste = null;
  for (const pad of paden) {
    const s = document.createElement("script");
    s.src = pad;
    s.async = false; // bewaart de uitvoeringsvolgorde
    s.onerror = () => console.warn(`[laad] ${pad} niet geladen`);
    document.head.appendChild(s);
    laatste = s;
  }

  /* Deelbare link naar een sectie: #gebied=X&naar=s1b springt na het renderen naar dat
     element. De hash zelf kan niet als ankerlink dienen omdat hij al de gebiedcode draagt. */
  const naar = /(?:^|[#&])naar=([A-Za-z0-9_-]+)/.exec(location.hash || "");
  if (naar && laatste) {
    laatste.addEventListener("load", () => {
      const el = document.getElementById(naar[1]);
      /* "instant" en niet de CSS-default: html heeft scroll-behavior:smooth, en bij een
         deeplink wil je aankomen, niet een halve pagina langs zien scrollen. */
      if (el) el.scrollIntoView({behavior: "instant", block: "start"});
      else console.warn(`[laad] sectie ${naar[1]} niet gevonden`);
    });
  }
})();
