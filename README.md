# Overschie — gebiedsprofiel in cijfers

Interactief scrollytelling-dashboard over het gebied Overschie (Rotterdam, wijk WK059904),
gebouwd als statische site zonder buildstap. Openen: dubbelklik `index.html` (werkt via
`file://`). Neutrale feiten met bron, peiljaar en aggregatieniveau-badge per grafiek;
interpretatie staat uitsluitend in het expliciet gelabelde duidingsblok (sectie 09).

## Structuur

```
index.html            alle opmaak en secties (hero, gebied, buurtvergelijking, bevolking,
                      sociaal-economisch, wonen, mobiliteit, verplaatsingspatronen,
                      voorzieningen, duiding)
js/data.js            redactioneel: alleen de buurttyperingen; alle cijferreeksen komen
                      uit js/profiel.js en worden bij het laden hierover heen gelegd
js/profiel.js         GEGENEREERD — wijkprofiel uit CBS KWB/nabijheid (groei, leeftijd,
                      huishoudens, inkomen, opleiding, buurtvergelijking incl. armoede)
js/app.js             grafieken (Chart.js), kaarten (Leaflet, CartoDB Positron), interactie
js/regios.js          GEGENEREERD — gebiedsboom gemeente/rayon/gebied + de wijken buiten de
                      rayonindeling (PDOK, CC0; rayonindeling gemeente Rotterdam)
js/geo.js             GEGENEREERD — buurtpolygonen (PDOK, CC0)
js/ov.js              GEGENEREERD — OV-haltes, lijnen, routegeometrie, ritfrequenties en
                      uurprofiel (GTFS NDOV/OVapi)
js/ongevallen.js      GEGENEREERD — verkeersongevallen (BRON via RWS WFS, CC0): hotspotraster
                      van 100 m per jaar en afloop, plus losse punten met details
js/infra.js           GEGENEREERD — fietsnetwerk, snelwegkruisingen, omrijfactor (OSM)
js/voorzieningen.js   GEGENEREERD — voorzieningen in 5 categorieën + vergelijking met de
                      gemeente per 1.000 inwoners (OSM + CBS)
js/cbs_mobiliteit.js  GEGENEREERD — nabijheid & auto's/hh per buurt, gemeentereferenties,
                      ODiN-modal-split provincie (StatLine)
js/odin_wijk.js       GEGENEREERD — verplaatsingspatronen wijkbewoners uit ODiN-microdata
                      (alleen aggregaten, zie AVG-paragraaf)
scripts/bouw_data.py  bouwt alle gegenereerde bestanden (PEP 723, zie hieronder)
scripts/regios.py     gebiedsindeling Rotterdam: rayon -> CBS-wijken. Bron van waarheid voor
                      het rayonniveau; netwerkvrij en offline te controleren
scripts/indicatoren.py registry van de buurtvergelijking-indicatoren: bron, zoekterm,
                      aggregatieregel, noemer, afronding en kaartlaag per indicator.
                      Eén entry toevoegen = een werkende indicator
scripts/aggregatie.py som, gewogen gemiddelde en niet-aggregeerbaar, met de CBS-
                      onderdrukkingscodes; netwerkvrij
scripts/rooktest.js   controleert een gedumpte DOM: is elk verwacht element gevuld
scripts/check_indicatoren.py  toetst de registry tegen een gebouwd profiel.js
scripts/cache/        gedownloade brondata (GTFS ~230 MB, PC4-geometrie, OSM-cache) én de
                      lokaal geplaatste ODiN-microdata (map ODIN/<jaar>/) — niet meeleveren
assets/               chart.umd.js 4.4.1, leaflet.js/css 1.9.4 — lokaal gevendord
```

## Data verversen

```bash
uv run scripts/bouw_data.py                    # alle stappen, wijk WK059904 (Overschie)
uv run scripts/bouw_data.py --alleen geo,cbs   # subset (sneller itereren)
uv run scripts/bouw_data.py --alleen regios    # gebiedsboom + dekkingscontrole
```

Het gebied kies je met `--gebied`: een CBS-wijkcode (`WK059904`), de gemeente (`GM0599`) of een
rayon (`RAYON_NOORD_BUITEN`, `RAYON_NOORD_BINNEN`, `RAYON_ZUID_BINNEN`,
`RAYON_KLEINE_KERNEN`). `--wijk WKxxxxxx` blijft werken als alias.

```bash
uv run scripts/bouw_data.py --gebied RAYON_NOORD_BUITEN --alleen geo
uv run scripts/bouw_data.py --gebied GM0599 --alleen geo
uv run scripts/bouw_data.py --alleen odin      # alleen de ODiN-microdata-analyse
uv run scripts/bouw_data.py --alleen profiel   # wijkprofiel (vervangt handmatige data.js)
uv run scripts/bouw_data.py --alleen ongevallen # BRON-verkeersongevallen (RWS WFS)
```

Het script kiest **automatisch de nieuwste gepubliceerde jaargang** per bron (CBS-catalogus,
PDOK-jaargangen, CBS PC4-dossierpagina) — een 2026-editie wordt bij herbouw vanzelf
opgepakt. Elke stap schrijft een eigen `js/`-bestand met `bron`, `peildatum` en `niveau`;
een falende stap legt de rest niet plat en het dashboard degradeert netjes als een bestand
ontbreekt. Let op: PDOK hernoemt properties per jaargang (2024 camelCase, 2025 snake_case);
de lezers accepteren beide.

### Rayonniveau: wat wel en niet werkt

Het rayonniveau bestaat in geen enkele open bron. `scripts/regios.py` legt vast welke
CBS-wijken bij welk rayon horen; de wijken worden op **naam** geresolveerd, zodat een
CBS-herindeling luid faalt in plaats van stil de verkeerde wijk te pakken.

**Rotterdam heeft 22 CBS-wijken, niet 14.** De veertien gebieden vormen de rayons; de acht
haven-, bedrijven- en watergebieden (Spaanse Polder, Nieuw Mathenesse, Waalhaven-Eemhaven,
Vondelingenplaat, Botlek-Europoort-Maasvlakte, Rotterdam-Noord-West, Rivium, Groot water)
vallen erbuiten. Het gemeentetotaal is daarom **niet** de som van de rayons: circa 3.040
inwoners verschil (peiljaar 2025), vrijwel helemaal Nieuw Mathenesse.

Op dit moment zijn de polygoon-gestuurde stappen (`geo`, en daarmee `ov`, `infra`,
`voorzieningen`, `ongevallen`, de PC4-afbakening voor `odin`) gebiedsgeneriek. De stappen die
op een gepubliceerde CBS-regel leunen (`profiel`, `cbs`) werken nog alleen op één wijk en
stoppen met een duidelijke melding bij een rayon — aggregatie met de juiste wegingsregel per
indicator volgt apart.

## Een andere wijk (prototype-hergebruik in 6 stappen)

1. Kies de CBS-wijkcode (bijv. via [PDOK wijken-viewer]) en draai
   `uv run scripts/bouw_data.py --wijk WKxxxxxx`. Alle stappen zijn wijk-generiek:
   buurtgeometrie, GTFS-filtering, OSM-netwerk/voorzieningen, CBS-referenties en de
   PC4-afbakening voor ODiN worden automatisch afgeleid (PC4-vangnet: `--pc4 1234,5678`).
2. Controleer de scriptuitvoer: PC4-set, steekproef-n's, lijnenlijst.
3. De cijferreeksen (inkomen, WOZ, groei, leeftijd, …) volgen automatisch uit de
   `profiel`-stap; in `js/data.js` hoeven alleen de redactionele buurttyperingen
   herschreven te worden.
4. Pas de teksten in `index.html` aan (hero, buurtenkaarten, barrière-teksten, duiding) —
   dit is bewust redactioneel werk, geen code.
5. De gemeentereferentie ("Rotterdam") volgt automatisch uit de wijkcode; labels in
   `js/app.js` gebruiken vaste teksten "Rotterdam" op twee plekken — pas aan bij een
   andere gemeente.
6. Open `index.html` en loop de datastatus-tabel na.

## Bronnen (open data, jaarlijks of vaker ververst)

| Bron | Wat | Niveau | Verversing | Licentie |
|---|---|---|---|---|
| CBS KWB (OData, nieuwste jaargang) | auto's/hh; gemeentereferenties (ook inkomen/WOZ/hh-grootte) | buurt + gemeente | jaarlijks | CC BY 4.0 |
| CBS Nabijheid (OData, nieuwste) | afstanden voorzieningen/station/oprit | buurt | jaarlijks | CC BY 4.0 |
| CBS ODiN StatLine 84710NED | verplaatsingen p.p./dag per vervoerwijze | provincie (laagste reguliere publicatie) | jaarlijks | CC BY 4.0 |
| **ODiN-microdata (CBS via DANS)** | modal split, motieven, bestemmingen, dagdelen, bezoekers op wijkniveau | wijk (PC4-benadering), 2022–2023 gepoold | jaarlijkse release; lokaal plaatsen in `scripts/cache/ODIN/<jaar>/` | DANS-gebruiksvoorwaarden |
| CBS PC4-geometrie (download.cbs.nl) | wijk→PC4-afbakening | PC4 | jaarlijks | CC BY 4.0 |
| PDOK Wijken en Buurten | buurt-/wijk-/gemeentegeometrie | buurt–gemeente | jaarlijks | CC0 |
| PDOK vierkantstatistieken (WMS-laag + legenda) | CBS-thema's op 100×100 m (stijlkiezer) | 100 m | jaarlijks | CC BY 4.0 |
| GTFS NL via NDOV/OVapi | haltes, lijnen, ritten, routegeometrie (shapes), uurprofiel | halte | dagelijks | open (NDOV) |
| BRON via Rijkswaterstaat WFS | verkeersongevallen (locatie, afloop, partijen) | locatie | jaarlijks (± april; rollend 3-jaarsvenster, lokale cache) | CC0 |
| RIVM Atlas Leefomgeving WMS | NO₂/PM2,5-jaargemiddelde (NSL-monitoring, kaartlaag) | raster ±25 m | jaarlijks | CC BY |
| OpenStreetMap via OSMnx | netwerk, kruisingen, voorzieningen (wijk + gemeente) | locatie | doorlopend | ODbL |
| Kaartondergrond | CartoDB Positron | — | — | © OSM-bijdragers © CARTO |

Bewust **niet** gebruikt: PDF-/rapportcijfers en incidentele maatwerktabellen. Een reguliere
wijk-modal-split bestaat niet — daarom de microdata-route hierboven, met de provincie als
gepubliceerde referentie.

## ODiN-microdata: methode, representativiteit en AVG

- **Selectie**: bewoners = respondenten met `WoPC` in de PC4-set van de wijk (PC4's met
  >50% oppervlakte-overlap; volgt de wijkgrens dus niet exact). Overschie: 3042, 3043,
  3045, 3046, 3047 → **146 personen / 474 verplaatsingen** gepoold over 2022–2023.
- **Pooling & weging**: gewicht `FactorV`, gedeeld door het aantal gepoolde jaren.
  Rotterdam-referentie (WoGem=599) uit dezelfde bestanden: ±16.800 verplaatsingen.
- **Onthulling**: categorieën met **n<10 worden samengevoegd**; blokken met te weinig
  waarnemingen vervallen. In `js/odin_wijk.js` staan uitsluitend aggregaten; de microdata
  blijft in `scripts/cache/ODIN/` en hoort niet in verspreide kopieën van dit dashboard.
- **Waarom 2024 ontbreekt**: de DANS-editie 2024 bevat geen woonlocatie (WoPC/WoGem) en
  alleen PRAM-verstoorde postcodes (`VertPC_PRAM`) — ongeschikt voor bewonersselectie.
- **Interpretatiegrens**: wijkniveau, geen buurtniveau of kruistabellen; uren samengevat
  tot dagdelen; bestemmingen alleen benoemd bij ≥10 waarnemingen (binnen de gemeente per
  bestemmingswijk via dominante PC4-overlap).

## Kaarten en grafieken (sectie 06)

- **Spits/dal-grafiek**: vertrekken per uur van de dag (haltes binnen de wijkgrens),
  gestapeld per vervoerwijze; GTFS-tijden na middernacht (24:00+) tellen bij 0–3 uur.
- **OV-kaart**: lijnvoering per lijn en richting (meest gereden GTFS-shape, afgekapt op
  ±4 km rond de wijk, ~10 m vereenvoudigd) + haltes; lijndikte = ritten/dag, haltegrootte =
  vertrekken/dag; kleur per vervoerwijze; aan/uit-chips per vervoerwijze. Lijnen zonder
  shape in de feed staan in de voetnoot.
- **Fietskaart**: vrijliggend fietsnetwerk (OSM) met wijkgrens — zelfde selectie als de
  fietslaag in sectie 02. Optionele onderlegger: RIVM-jaargemiddeldekaart NO₂/PM2,5
  (alias-lagen `rivm_jaargemiddeld_*_actueel` verwijzen altijd naar de nieuwste
  NSL-kaart; peiljaar wordt lui uit de capabilities gelezen); klik = waarde in µg/m³.
- **Ongevallen**: een trendgrafiek per jaar (gestapeld naar afloop) en een kaart met twee
  weergaven. Standaard een **hotspotraster** van 100 × 100 m — dezelfde celmaat als de
  CBS-vierkantstatistieken in sectie 02 — met vijf kwantielklassen die meebewegen met de
  selectie. Daarnaast de losse punten met details per ongeval. Periode en afloopcategorie
  zijn los te kiezen; beide filters werken op raster én punten, en de KPI-strip beweegt mee.

  Tellingen in het raster zijn **ongewogen**: een dodelijk ongeval telt er even zwaar als
  materiële schade, omdat zwaarte wegen een normatieve keuze is (zie de backlog).

  Twee dingen om te weten bij het lezen: bij afloop *uitsluitend materiële schade* worden
  geen straatnaam, aard, partijen of snelheidslimiet bewaard, en boven 5.000 ongevallen in
  een gebied staat die categorie **alleen nog in het raster** en niet als losse punten
  (op gemeenteniveau gaat het om ruim 19.000 van de 24.000 punten). De tellingen blijven
  onverkort; alleen de klikbare puntweergave van die ene categorie ontbreekt, en het
  dashboard meldt dat expliciet. `ONGEVALLEN.puntenVolledig` geeft aan of er is ingekort.

  Het **datavenster** is een aandachtspunt: RWS publiceert online alleen de laatste drie
  jaargangen. De reeks groeit uitsluitend doordat `scripts/cache/bron/` bewaard blijft — wie
  die cache weggooit, verliest oudere jaren onherstelbaar.

Sectie 07 bevat daarnaast de ODiN-grafiek **vervoerwijze naar afstand** (gewogen modal
split per afstandsband, wijk naast Rotterdam; cellen met n<10 gevouwen in "Overig").

## Kaartlagen (sectie 02)

- Buurt-choropleth volgt de gekozen indicator; stippellijnen in de vergelijkingsgrafiek:
  wijkgemiddelde (zwart) en gemeente Rotterdam (blauw).
- CBS 100×100m-laag: eigen **stijlkiezer** in twee groepen — bevolking & wonen (inwoners,
  leeftijden, WOZ, % koop, …) en bereikbaarheid (afstand tot treinstation, overstapstation,
  oprit hoofdverkeersweg, supermarkt, huisarts, basisschool) — met de **officiële
  PDOK-legenda** onder de kaart (vaste PNG per stijl: `<WMS-URL>/legend/vierkant_100m/<stijl>.png`;
  de service kent géén GetLegendGraphic). Zolang de laag aanstaat tonen buurtvlakken
  alleen hun omtrek (geen occlusie). Bij indicatoren met een 100m-equivalent (WOZ,
  huishoudensgrootte, treinafstand) springt de laagstijl automatisch mee; bij de overige
  verschijnt onder de kaart de melding dat een 100m-equivalent ontbreekt. De laag is
  alleen zichtbaar vanaf ± zoomniveau 12 (MaxScaleDenominator 1:150.000).

## Internet-afhankelijke onderdelen

Alleen de kaartondergrond (CARTO-tegels) en de CBS 100×100m-laag (PDOK WMS + legenda)
vereisen internet. Grafieken, buurtpolygonen, OV-haltes, voorzieningen en alle
ODiN-uitkomsten werken volledig offline.

## Plan-historie

- **v1 (2026-07-14, uitgevoerd)**: kaartbug ("BV is not defined") + dode WMS-URL gefixt;
  datapijplijn met PDOK/GTFS/OSMnx/CBS-OData; buurt-choropleth; OV-tabel;
  infrastructuurcijfers; voorzieningenkaart; aggregatieniveau-badges; de-interpretatie.
- **v2 (2026-07-15, uitgevoerd)**: ODiN-microdata-analyse op wijkniveau (sectie 07);
  CartoDB Positron; WMS-stijlkiezer + legenda + occlusiefix; Rotterdam-referenties in
  buurtvergelijking en voorzieningen; verdere generalisatie (--wijk/--pc4, auto-nieuwste
  jaargangen).
- **v3 (2026-07-15, uitgevoerd)**: OV-kaart met GTFS-lijnvoering (shapes.txt) + haltes;
  fietsnetwerkkaart; 100×100m-legenda gerepareerd (PDOK kent geen GetLegendGraphic —
  vaste legenda-PNG per stijl), melding bij buurtindicatoren zonder 100m-equivalent,
  stijlkiezer uitgebreid met bereikbaarheidsthema's (optgroups).
- **v4 (2026-07-15, uitgevoerd)**: js/profiel.js vervangt de handmatige cijfers in
  data.js (CBS KWB via OData, per blok de nieuwste gevulde jaargang; 'sociaal minimum'
  → 'personen in armoede', groeireeks alle jaargangen 2013+); 100m-laag klikbaar
  (GetFeatureInfo, onthullingscodes vertaald) met automatische jaargangkeuze;
  gegradueerde choropleth-legenda; OV-spits/dal-uurprofiel; luchtkwaliteitslaag
  (RIVM/NSL) op de fietskaart; BRON-ongevallenkaart (RWS WFS, lokale jaarcache);
  ODiN vervoerwijze × afstandsband.

## Testen

Rooktest: open `index.html` (file://) en controleer de console (0 fouten verwacht).
Headless: `msedge --headless=new --dump-dom` + `--enable-logging=stderr` toont
console-fouten. `uvx ruff format scripts/ && uvx ruff check scripts/` en
`node --check js/*.js` voor de code.
