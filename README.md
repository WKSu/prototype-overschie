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

js/                   handgeschreven frontend
  laad.js             leest het gebied uit de URL-hash (#gebied=…) en injecteert de
                      databestanden van dat gebied als <script>-tags, daarna app.js
  app.js              grafieken (Chart.js), kaarten (Leaflet, PDOK BRT Achtergrondkaart
                      grijs), referentielaag en interactie; elk blok in een veilig()-guard
  data.js             redactioneel: de buurttyperingen
  teksten.js          redactioneel: karakterisering en duiding per gebied; ontbreekt een
                      gebied, dan een neutrale formulering uit de data
  review.js           reviewmodus, alleen geladen met ?review=1

data/                 GEGENEREERD door scripts/bouw_data.py — niet met de hand bewerken
  index.js            gebiedsboom (gemeente → rayons → gebieden, plus de wijken buiten de
                      rayonindeling), inventaris van data-elementen, normen (#30) en de
                      losse verkenners met hun deeplink per gebied
  referentie.js       gebiedstotalen, verdelingen, groei en tijdreeksen van álle gebieden,
                      voor de vergelijkingsreeksen (--referentie)
  gebouwd.js          lokale bouwstatus: welke stappen per gebied gebouwd zijn — gitignored
  <gebiedcode>/       één map per gebied (GM0599, RAYON_*, WK0599xx):
    profiel.js        wijkprofiel uit CBS KWB/nabijheid (groei, leeftijd, huishoudens,
                      inkomen, opleiding, buurtvergelijking incl. armoede)
    geo.js            buurtpolygonen (PDOK, CC0)
    ov.js             OV-haltes, lijnen, routegeometrie, ritfrequenties en uurprofiel
                      (GTFS NDOV/OVapi)
    ongevallen.js     verkeersongevallen (BRON via RWS WFS, CC0): hotspotraster van 100 m
                      per jaar en afloop, plus losse punten met details
    infra.js          fietsnetwerk, snelwegkruisingen, omrijfactor (OSM)
    voorzieningen.js  voorzieningen in 5 categorieën + vergelijking met de gemeente per
                      1.000 inwoners (OSM + CBS)
    cbs_mobiliteit.js nabijheid & auto's/hh per buurt, gemeentereferenties,
                      ODiN-modal-split provincie (StatLine)
    odin_wijk.js      verplaatsingspatronen bewoners uit ODiN-microdata (alleen
                      aggregaten, zie AVG-paragraaf)
    segmenten.js      soorten bewoners: CBS SES-WOA per wijk (#8)
    intern.js         geaggregeerde uitkomsten uit de niet-openbare leveringen, boven de
                      onthullingsdrempel (zie bronnen/intern/)

scripts/              pipeline, registry's en controles
  bouw_data.py        bouwt alle gegenereerde bestanden (PEP 723, zie hieronder)
  regios.py           gebiedsindeling Rotterdam: rayon -> CBS-wijken. Bron van waarheid voor
                      het rayonniveau; netwerkvrij en offline te controleren
  indicatoren.py      registry van de indicatoren: bron, zoekterm, aggregatieregel, noemer,
                      afronding en kaartlaag per indicator, plus de inventaris, DREMPELS en
                      NORMEN. Eén entry toevoegen = een werkende indicator
  aggregatie.py       som, gewogen gemiddelde en niet-aggregeerbaar, met de CBS-
                      onderdrukkingscodes; netwerkvrij
  bronnen_intern.py   registry van de niet-openbare leveringen: map, verwachte bestanden,
                      aggregatieregel, voorwaarden en onthullingsdrempel per bron
  intern_lezers.py    één lezer per levering: welk werkblad, welke kolom, welke koppeling
                      — en waar je in dat bestand verkeerd kunt lezen zonder dat het opvalt
  inspecteer_intern.py  beschrijft een levering (kolommen, typen, aantallen) zonder
                      celwaarden te tonen; draaien vóór je een bron aanmeldt
  viewers.py          registry van de losse verkenners: URL, (sub)sectie, ankers en de per
                      gebied uitgerekende deeplink
  rooktest.js         controleert een gedumpte DOM: is elk verwacht element gevuld, heeft
                      elk ODiN-blok een label, elke kaart een vergrootknop, scrollt de
                      pagina niet zijwaarts
  check_indicatoren.py  toetst de registry tegen een gebouwd profiel.js
  check_referentielaag.js  draait de referentielaag uit js/app.js in Node tegen
                      data/referentie.js: lijnen de reeksen uit op de gebiedslabels,
                      geldt de ODiN-drempel, is een ondergrens gemarkeerd
  check_onderwerpen.js  controleert de review-ankers (data-onderwerp) in een gedumpte DOM
                      tegen de momentopname onderwerpen.txt
  onderwerpen.txt     momentopname van de review-ankers
  check_viewers.py    toetst (met netwerk) of de deeplinks van de verkenners nog op het
                      bedoelde gebied uitkomen
  cache/              gedownloade brondata (GTFS ~230 MB, PC4-geometrie, OSM-cache) én de
                      lokaal geplaatste ODiN-microdata (map ODIN/<jaar>/) — gitignored,
                      niet meeleveren

bronnen/intern/       inleverplek voor niet-openbare leveringen — buiten git, alleen
                      LEESMIJ.md staat in de repo
assets/               chart.umd.js 4.4.1, leaflet.js/css 1.9.4 — lokaal gevendord
.claude/commands/     volgende.md: de procedure voor /volgende
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
uv run scripts/bouw_data.py --alleen intern    # niet-openbare leveringen, alleen geaggregeerd
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
| PDOK BRT Achtergrondkaart (WMTS) | kaartondergrond, grijze variant | — | doorlopend | naamsvermelding © Kadaster |

Bewust **niet** gebruikt: PDF-/rapportcijfers en incidentele maatwerktabellen. Een reguliere
wijk-modal-split bestaat niet — daarom de microdata-route hierboven, met de provincie als
gepubliceerde referentie.

## Niet-openbare bronnen

Een deel van de interessantste data wordt geléverd in plaats van gepubliceerd: arbeidsplaatsen
(#29), parkeervergunningen en wachtlijst (#22), meldingen openbare ruimte (#26), de
omnibusenquête (#27). Die leveringen gaan in `bronnen/intern/<map>/` — buiten git — en worden
aangemeld in `scripts/bronnen_intern.py`. De stap `intern` schrijft er **uitsluitend
geaggregeerde uitkomsten** per gebied uit, boven de onthullingsdrempel `n_min` van die bron;
alleen díe uitkomsten worden gecommit.

| Bron | Wat | Niveau | Verversing | Voorwaarden |
|---|---|---|---|---|
| CBS-maatwerktabel autobezit (CBS, RDW, BAG) | auto's per woonadres en de verdeling 0/1/2+, 1 jan 2019–2025 | subbuurt | op aanvraag | CBS-maatwerk voor de gemeente; alleen geaggregeerd publiceren |
| KVK Bedrijven op de Kaart | vestigingen met ≥5 werkenden en hun grootteklasse + SBI-sector | vestiging (punt) | op aanvraag | KVK-voorwaarden; geen bedrijfsnamen of adressen |
| Vergunningenplafond (Parksaver, BAG, CBS) | toegekende vergunningen, wachtlijst, plafond, bezetting | parkeersector | op aanvraag | interne werktabel; alleen per sector publiceren |
| **Wijkprofiel Rotterdam** (dataset voor derden) | Sociale, Fysieke en Veiligheidsindex, 2014–2026 | gebied + Rotterdamse wijk | tweejaarlijks | *reguliere publicatie*; vrij met bronvermelding |

De laatste is geen niet-openbare bron: hij ligt hier omdat hij als bestand werd aangeleverd.
Het registryveld `openbaar` legt dat vast, en dat bepaalt of de badge *niet-openbare bron* bij
een grafiek verschijnt. Dat onderscheid zegt of een lezer het cijfer zelf kan narekenen.

Wat elk van de vier oplevert:

- **Autobezit** — reeks per woonadres 2019–2025, de verdeling 0/1/2/3/4+ per peiljaar, en de
  subbuurten op de kaart (sectie 06). De koppeling subbuurt → gebied loopt via de meegeleverde
  subbuurtenkaart en matcht op 501 van de 501 codes, dus aggregeren naar gebied en rayon is
  exact. De noemer is het **woonadres**, niet het huishouden: dit cijfer is daarom niet gelijk
  aan `auto's per huishouden` uit de KWB.
- **Vestigingen en werkzame personen** — aantallen en de sectorverdeling per SBI-sectie
  (sectie 04). Geen arbeidsplaatsentelling: alleen vestigingen met vijf of meer werkenden, in
  grootteklassen, dus het aantal werkzame personen is een ondergrens.
- **Parkeervergunningen** — per sector die het gebied voor ≥5 % raakt: vergunningen,
  wachtlijst, plafond en bezetting, met kaart (sectie 06). Geen gebiedstotaal — sectoren
  overlappen elkaar en volgen de gebiedsgrens niet.
- **Wijkprofiel** — de drie hoofdscores per peiljaar voor het gebied, met de Rotterdamse
  wijken erbinnen (sectie 02). Een rayonscore bestaat niet; bij een rayon dus een lijn per
  gebied.

Wat er bij zo'n bron anders is dan bij de open bronnen hierboven:

- **Niet na te rekenen door een derde.** Een cijfer uit deze categorie krijgt daarom in de
  datastatus de eigen status `niet-openbare bron`, en in het blok zelf de bron, de
  leveringsvoorwaarden en de gehanteerde drempel.
- **Onder de drempel blijft het leeg, niet nul.** Een buurt met te weinig waarnemingen telt als
  *onderdrukt*: het gebiedstotaal is dan onvolledig, niet lager. Dezelfde regel als bij de
  CBS-onderdrukkingscodes en de ODiN-drempel.
- **Een lege run overschrijft nooit een gevuld bestand.** Wie zonder de leveringen een
  volledige herbouw doet, houdt de gecommitte uitkomsten; de stap meldt dat hij overslaat.

Voordat je een bron aanmeldt: `uv run scripts/inspecteer_intern.py` beschrijft wat er in een
levering zit — bestanden, kolommen, typen, aantallen, kandidaat-gebieds- en
coördinaatkolommen — zonder celwaarden te tonen. Zie verder `bronnen/intern/LEESMIJ.md`.

## Losse verkenners

Naast dit dashboard staan er afzonderlijke producten die één vraag dieper beantwoorden. Ze
hebben een eigen repo en eigen publicatie; hier staan alleen de verwijzing en de deeplink, in
`scripts/viewers.py`.

| Verkenner | Wat | Deeplink per gebied |
|---|---|---|
| [Parkeercapaciteit per gebied](https://wksu.github.io/parkeercapaciteit/) | parkeercapaciteit tot op het losse vak, met eigen telregels | ja — ook voor een rayon, als selectie van zijn gebieden |
| [Invloedsgebied ov-haltes](https://wksu.github.io/loopbaarheid-ov/) | wat op loopafstand van welke halte ligt, over het looproutenetwerk | nee — dit product kent geen gebiedsselectie |

Ze verschijnen als kaart in sectie 06, met een knop die de verkenner pas op de pagina laadt als
je erop klikt. Dat is bewust: `loopbaarheid-ov` is één HTML-bestand van ruim 35 MB, en het
dashboard moet ook zonder internet openen. Openen in een nieuw tabblad kan altijd.

## ODiN-microdata: methode, representativiteit en AVG

- **Selectie**: bewoners = respondenten met `WoPC` in de PC4-set van de wijk (PC4's met
  >50% oppervlakte-overlap; volgt de wijkgrens dus niet exact). Overschie: 3042, 3043,
  3045, 3046, 3047 → **146 personen / 474 verplaatsingen** gepoold over 2022–2023.
- **Pooling & weging**: gewicht `FactorV`, gedeeld door het aantal gepoolde jaren.
  Rotterdam-referentie (WoGem=599) uit dezelfde bestanden: ±16.800 verplaatsingen.
- **Onthulling**: geen getoonde uitkomst rust op minder dan **20 waarnemingen** (`N_MIN` in
  `scripts/bouw_data.py`, #13). Categorieën eronder worden **leeggelaten, niet samengevoegd**:
  ze vallen uit de verdeling en staan als aparte verantwoordingsregel ("niet getoond — k
  categorie(ën) met n<20"), zodat de getoonde aandelen niet stil op minder dan 100% sluiten.
  Een heel blok onder de drempel vervalt. In `data/<gebiedcode>/odin_wijk.js` staan uitsluitend aggregaten; de microdata
  blijft in `scripts/cache/ODIN/` en hoort niet in verspreide kopieën van dit dashboard.
- **Waarom 2024 ontbreekt**: de DANS-editie 2024 bevat geen woonlocatie (WoPC/WoGem) en
  alleen PRAM-verstoorde postcodes (`VertPC_PRAM`) — ongeschikt voor bewonersselectie.
- **Interpretatiegrens**: wijkniveau, geen buurtniveau of kruistabellen; uren samengevat
  tot dagdelen; bestemmingen alleen benoemd bij ≥20 waarnemingen (binnen de gemeente per
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
split per afstandsband, wijk naast Rotterdam; vervoerwijzen met n<20 binnen een band
vallen uit de verdeling en staan als aparte verantwoordingsregel).

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

Alleen de kaartondergrond (PDOK WMTS-tegels) en de CBS 100×100m-laag (PDOK WMS + legenda)
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

## Reviewmodus

Voor een reviewronde met collega's: zet `?review=1` achter de URL
(`index.html?review=1`, of op GitHub Pages `…/index.html?review=1#gebied=WK059904`).
Zonder die parameter wordt `js/review.js` niet geladen — voor een gewone bezoeker
bestaat de laag niet, hij is niet alleen verborgen.

Wat een reviewer kan doen, en niets ervan is verplicht:

- **per kaart, tabel of kerncijfervierkant** één klik op *onmisbaar · nuttig · niet
  interessant · anders vormgeven*, plus desgewenst een toelichting en de opgave die het
  raakt. De vraag is nadrukkelijk niet of het cijfer klopt — dat is de pipeline — maar of
  de indicator nuttig is en of hij zo getekend moet worden;
- **per sectie** "wat mis je hier?", want het antwoord op *sluit dit aan op onze opgaven*
  is vaak "wat ik nodig heb staat er niet", en daar is geen kaart voor om op te klikken;
- **één slotvraag** over het geheel.

Alles staat in de `localStorage` van de reviewer zelf; er gaat niets naar een server.
**Dat is geen bewaarplaats**: wie zijn browser opschoont of van apparaat wisselt is zijn
opmerkingen kwijt. Het geëxporteerde bestand is de bron van waarheid, dus de balk onderaan
waarschuwt zolang er niet geëxporteerd is, en de pagina vraagt bij het sluiten om bevestiging.

Twee exports:

- **Exporteer JSON** — alleen de eigen opmerkingen, herimporteerbaar. Meerdere bestanden
  tegelijk importeren voegt ze samen op reviewer: een tweede export van dezelfde persoon
  vervangt zijn eerdere, die van een ander blijft staan.
- **Markdown voor issue** — alle geïmporteerde reviewers samengevoegd, gegroepeerd per
  onderwerp, met een tabel van waar de meeste twijfel zit. Klaar om als issuebody te plakken.

Een opmerking hangt aan het `data-onderwerp`-attribuut van de kaart, niet aan een
selectorpad of de koptekst: `js/app.js` herschrijft koppen en niveaubadges per gebied, dus
een afgeleid anker zou per gebied verspringen. Toont een kaart meerdere indicatoren achter
een knoppenrij (de buurtvergelijking, het inkomen, de tijdreeks), dan draagt de sleutel de
actieve keuze: `buurtvergelijking#woz`. Verdwijnt een sleutel toch, dan komt de opmerking
bij import in een lijst "onderwerp bestaat niet meer" en wordt hij niet stil weggegooid.

Op `file://` deelt Chrome één opslagruimte over alle lokale bestanden: twee checkouts van
dit dashboard op dezelfde computer delen dan hun opmerkingen. Op https speelt dat niet.

## Testen

Rooktest: open `index.html` (file://) en controleer de console (0 fouten verwacht).
Headless: `msedge --headless=new --dump-dom` + `--enable-logging=stderr` toont
console-fouten. `uvx ruff format scripts/ && uvx ruff check scripts/` en
`node --check js/*.js` voor de code.

Ankers van de reviewmodus: `DOM=<dump> node scripts/check_onderwerpen.js`. Die controleert
dat elke `.chart-box` en `.strip` een `data-onderwerp` heeft, dat de sleutels uniek zijn en
dat ze overeenkomen met `scripts/onderwerpen.txt`. Hernoem je bewust een kaart, werk die
momentopname dan in dezelfde commit bij (`--schrijf`) — een verdwenen sleutel betekent dat
opmerkingen uit eerdere rondes nergens meer op slaan.
