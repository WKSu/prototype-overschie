/* Redactionele inhoud: buurttyperingen (handgeschreven, niet uit een databron af te
   leiden). Alle cijferreeksen komen uit het GEGENEREERDE js/profiel.js (CBS OData;
   draai scripts/bouw_data.py --alleen profiel) en worden bij het laden over dit
   object heen gelegd. Bewust een .js-bestand met globale const: fetch() van lokale
   JSON faalt op file:// (CORS). */

const D = {
  buurten: [
    {n:"Overschie (dorpskern)", t:"historische kern aan de Schie",
     m:"Oude dorpskern waar Delfshavense, Schiedamse en Rotterdamse Schie samenkomen. Historische bebouwing, dorpse maat, hoge sociale cohesie."},
    {n:"Kleinpolder", t:"naoorlogse stadswijk",
     m:"Direct na de oorlog bebouwd; flats en portieketages. Grootste bevolkingsconcentratie, direct aan de A13 en het Kleinpolderplein."},
    {n:"Park Zestienhoven", t:"nieuwbouw & groei",
     m:"Recente uitbreidingslocatie nabij het vliegveld; verklaart een groot deel van de +30% bevolkingsgroei sinds 2013. Veel jonge gezinnen, label A-woningen."},
    {n:"Landzicht", t:"kleinschalig woongebied",
     m:"Klein buurtschap tussen de infrastructuurbundels; beperkt aantal inwoners."},
    {n:"Noord-Kethel", t:"veenweide & linten",
     m:"Weids, dun bebouwd polderlandschap met woonlinten en agrarische bedrijven — recreatief uitloopgebied."},
    {n:"Schieveen", t:"polder & bedrijven",
     m:"Polder Schieveen: natuur- en bedrijvenontwikkeling; nauwelijks bewoners, wel verkeer van/naar N471 en vliegveld."}
  ]
};
