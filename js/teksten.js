/* Redactionele teksten per gebied — handgeschreven, niet gegenereerd.

   Dit bestand bevat het enige deel van het dashboard dat niet uit data volgt: de
   karakterisering van een gebied en de duiding. Ontbreekt een gebied hier, dan valt het
   dashboard terug op een neutrale, uit de data opgebouwde formulering. Dat is bewust: een
   half verzonnen karakterschets is erger dan geen schets.

   Sleutel is de gebiedcode (WKxxxxxx, GMxxxx of een rayoncode uit scripts/regios.py). */

const TEKSTEN = {
  WK059904: {
    lead:
      "Een oud Schie-dorp, in 1941 geannexeerd, dat vandaag wordt doorsneden door de A13, " +
      "grenst aan Rotterdam The Hague Airport en tegelijk het grootste veenweidegebied " +
      "binnen de gemeente herbergt. Dit profiel beschrijft wie er wonen, hoe ze wonen en " +
      "wat dat betekent voor mobiliteit.",
    gebiedKop: "Zes buurten, drie gezichten",
    gebiedIntro:
      "Overschie is klein qua stedelijk gebied maar zeer gemêleerd: een historische " +
      "dorpskern aan de Schie, naoorlogse flats in Kleinpolder, villa's, bedrijventerrein " +
      "en een weids veenweidegebied in het noorden. Klik op een buurt voor karakteristiek.",
    bevolkingKop: "Een wijk die hard groeit",
    sociaalKop: "Bovengemiddeld inkomen, gemengd opgeleid",
    sociaalIntro:
      "Anders dan het Rotterdamse gemiddelde ligt het inkomen in Overschie <em>boven</em> " +
      "het landelijk gemiddelde. Het opleidingsniveau is vrijwel gelijk verdeeld over laag, " +
      "middelbaar en hoog — een brede middenklasse-wijk.",
    /* buurttyperingen: alleen redactioneel, de cijfers komen uit de data */
    buurten: {
      "Overschie": {tag: "historische dorpskern",
        meer: "Dorps weefsel aan de Schie, gemengd wonen en kleine bedrijvigheid."},
      "Kleinpolder": {tag: "naoorlogse stadswijk",
        meer: "Grootste buurt, veel gestapelde huurwoningen, direct aan de A13 en A20."},
      "Zestienhoven": {tag: "nieuwbouw en luchthaven",
        meer: "Park Zestienhoven: de motor achter de bevolkingsgroei van de wijk."},
      "Landzicht": {tag: "kleine woonbuurt",
        meer: "Compacte buurt tussen dorpskern en polder."},
      "Noord Kethel": {tag: "veenweidegebied",
        meer: "Nauwelijks bewoond; open landschap richting Schiedam."},
      "Schieveen": {tag: "polder en bedrijventerrein",
        meer: "Grootste oppervlak van de wijk, weinig inwoners."},
    },
    /* Sectie 09: het enige blok met interpretatie. Cijfers hierin verwijzen naar Overschie
       en gelden niet voor een ander gebied — daarom per gebied vastgelegd. */
    duiding: [
      ["Gezinswijk in groei",
        "Ruim 1 op 5 inwoners is jonger dan 15 en 39% van de huishoudens heeft kinderen. " +
        "School-, sport- en zorgverplaatsingen domineren dan doorgaans; veilige fietsroutes " +
        "en oversteekbaarheid wegen hier vermoedelijk zwaarder dan spitsdoorstroming."],
      ["Autogeoriënteerd door ligging",
        "Bovengemiddeld inkomen, eengezinswoningen, directe snelwegtoegang en 3,8 km tot " +
        "het spoor maken de auto voor veel verplaatsingen de voor de hand liggende keuze; " +
        "metro E ligt alleen voor Park Zestienhoven op loopafstand."],
      ["Differentieer per buurt, niet per wijk",
        "Zestienhoven en Kleinpolder verschillen onderling sterker dan de wijk van de stad " +
        "(inkomen 2,6×, autobezit 1,2 vs 0,7 per huishouden). Wijkgemiddelde sturing mist " +
        "beide staarten."],
      ["Leefbaarheid en mobiliteit zijn hier één dossier",
        "De A13 levert het gebied bereikbaarheid én geluid- en luchtbelasting op " +
        "aanliggende woningen; de 16 fietskruisingen en omrijfactor 1,42 hierboven " +
        "kwantificeren de barrièrewerking."],
    ],
  },
};

/* Neutrale terugval: uit de data opgebouwd, zonder karakterisering. */
function tekstenVoor(code) {
  return TEKSTEN[code] || {};
}
