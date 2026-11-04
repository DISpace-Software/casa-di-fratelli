import { useId } from "react";
import { COFEIN_MAP_WORLD } from "../../domain/floorPlans/cofeinGeometry.js";
import "./cofein-map.css";

const strings = {
  bg: { garden: "Градина", street: "Улица", storage: "Склад", prep: "Подготовка", kitchen: "Кухня", wash: "Миялно", bar: "Бар", exterior: "ВЪНШНА ЗАЛА", interior: "ВЪТРЕШНА ЗАЛА", gardenExit: "Към градината", streetEntry: "Вход / изход", glass: "Остъкляване" },
  en: { garden: "Garden", street: "Street", storage: "Storage", prep: "Preparation", kitchen: "Kitchen", wash: "Wash-up", bar: "Bar", exterior: "EXTERIOR", interior: "INTERIOR", gardenExit: "To the garden", streetEntry: "Entrance / exit", glass: "Glazing" },
  ru: { garden: "Сад", street: "Улица", storage: "Склад", prep: "Подготовка", kitchen: "Кухня", wash: "Моечная", bar: "Бар", exterior: "ВНЕШНИЙ ЗАЛ", interior: "ВНУТРЕННИЙ ЗАЛ", gardenExit: "Выход в сад", streetEntry: "Вход / выход", glass: "Остекление" },
};

const point = (x, y) => [(x - 740) / 2, (y - 350) / 2];

function Label({ x, y, children, className = "cofein-map-room-label", rotate = 0, anchor = "middle" }) {
  const [px, py] = point(x, y);
  return <text x={px} y={py} textAnchor={anchor} className={className} transform={rotate ? `rotate(${rotate} ${px} ${py})` : undefined}>{children}</text>;
}

function Glazing({ d }) {
  return <g fill="none" strokeLinecap="square" strokeLinejoin="miter">
    <path d={d} stroke="#3f4240" strokeWidth="14" />
    <path d={d} stroke="#b6c6c4" strokeWidth="9" />
    <path d={d} stroke="#f1eee5" strokeWidth="5" />
    <path d={d} stroke="#819591" strokeWidth="1.5" />
  </g>;
}

function Door({ x, y, rotation = 0, width = 80, reverse = false }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${reverse ? -1 : 1} 1)`} fill="none">
    <path d={`M0 0V${-width}A${width} ${width} 0 0 1 ${width} 0`} stroke="#8e806d" strokeWidth="2" strokeDasharray="4 3" />
    <path d={`M0 0V${-width}`} stroke="#584f42" strokeWidth="4" />
    <circle r="3.5" fill="#584f42" />
  </g>;
}

/** The photographed building is one connected floor. Only furniture controls
 * are interactive; this SVG is a stable, scalable architectural underlay. */
export default function CofeinArchitecture({ language = "bg", className = "" }) {
  const uid = useId().replace(/:/g, "");
  const t = strings[language] || strings.bg;
  const floor = "M880 730H1440L1725 455H1900V610H2190V825L2280 740L2490 945L2290 1125L2470 1230L1910 1775V1940L2340 2370L1940 2780L1820 2890L1240 3460H895V1090H880Z";
  const outerWalls = "M880 995V730H1440L1725 455H1900V610H2190V825L2280 740L2490 945L2290 1125L2470 1230L1910 1775V1940L2340 2370M895 1090V1815M895 1965V2460M1455 2190V2250L1940 2780";
  const serviceWalls = "M1065 730V945H1015M1120 955H1440L1600 955L1630 925V770L1730 680H1770M1870 680H1900V610M1900 720V740M1900 835V955H2190M1900 780H2050M2050 780H2190M2050 640V675M2050 750V780M2050 805V840M2050 920V955M1900 955V1035H2130V1090M2130 1170V1325H2045L1925 1440V1570M2190 955L2240 1005M2290 1125L2190 1045";
  const columns = [[895,1090],[895,1475],[895,1965],[895,2460],[895,2690],[895,2960],[895,3230],[895,3460],[1240,3460],[1455,1090],[1455,1475],[1455,1910],[1490,2250],[1740,2510],[1940,2780],[2135,2580],[2340,2370],[1120,1090],[1120,1475],[1120,1965],[1120,2690],[1120,2960],[1120,3230]];

  return <svg
    className={`cofein-map-architecture ${className}`.trim()}
    viewBox={`0 0 ${COFEIN_MAP_WORLD.width} ${COFEIN_MAP_WORLD.height}`}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#f4edde" /><stop offset=".55" stopColor="#e9dfce" /><stop offset="1" stopColor="#eee5d6" />
      </linearGradient>
      <pattern id={`${uid}-tiles`} width="74" height="74" patternUnits="userSpaceOnUse">
        <path d="M74 0H0V74" fill="none" stroke="#fffdf5" strokeOpacity=".8" strokeWidth="1.5" />
        <path d="M73 1H1V73" fill="none" stroke="#ac9b8260" strokeWidth=".7" />
        <path d="M11 13 22 15 28 13M48 48 60 45" fill="none" stroke="#ab998020" strokeWidth=".8" />
      </pattern>
      <linearGradient id={`${uid}-bar`} x1="0" y1="0" x2="1" y2="0">
        <stop stopColor="#382b22" /><stop offset=".45" stopColor="#5d4936" /><stop offset="1" stopColor="#30261f" />
      </linearGradient>
      <linearGradient id={`${uid}-seat`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#92717f" /><stop offset="1" stopColor="#4e3546" />
      </linearGradient>
      <filter id={`${uid}-wall-shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="5" dy="8" stdDeviation="4" floodColor="#221c15" floodOpacity=".2" />
      </filter>
      <clipPath id={`${uid}-floor-clip`}><path d={floor} /></clipPath>
    </defs>
    <rect width="900" height="1600" fill="#f3ecdf" />
    <g transform="matrix(.5 0 0 .5 -370 -175)">
      <path d={floor} fill={`url(#${uid}-floor)`} />
      <path d="M1455 1090H2130V1325L1925 1570L1910 1940L2340 2370L1940 2780L1490 2235L1455 2135Z" fill="#dcccb63b" />
      <path d="M880 730H1440L1725 455H1900V610H2190V825L2280 740L2490 945L2290 1125L2470 1230L1910 1775V1570L2130 1325V1090H1455V990H1120V1090H880Z" fill="#dfd8cb90" />
      <rect x="850" y="450" width="1660" height="3040" fill={`url(#${uid}-tiles)`} clipPath={`url(#${uid}-floor-clip)`} />

      <g fill="none" strokeLinecap="square" strokeLinejoin="miter" filter={`url(#${uid}-wall-shadow)`}>
        <path d={outerWalls} stroke="#2f2e2a" strokeWidth="22" />
        <path d={serviceWalls} stroke="#35322d" strokeWidth="18" />
        <path d={outerWalls} stroke="#5b5245" strokeWidth="4" />
        <path d={serviceWalls} stroke="#655b4c" strokeWidth="2.5" />
      </g>

      {/* The main glazed partition is shown in the same position as the photo. */}
      <Glazing d="M1455 1090V2050" />
      <Glazing d="M895 2480V3460H1240L1750 2930" />
      <Glazing d="M1940 2780L2340 2370" />
      <Glazing d="M895 2460H1230" />
      {/* Upper side boundary remains a light partition: glazing is unconfirmed. */}
      <path d="M1120 1090V1815M1120 1970V2460" stroke="#8d8272" strokeWidth="4" fill="none" />

      {/* Door leaves and arcs are navigation context, not evacuation routes. */}
      <Door x={895} y={1090} rotation={-90} width={95} />
      <Door x={895} y={1965} rotation={-90} width={150} />
      <Door x={1230} y={2460} width={100} />
      <Door x={1455} y={2190} width={140} reverse />
      <Door x={1750} y={2930} rotation={45} width={93} />
      <Door x={1880} y={2800} rotation={225} width={93} />
      <Door x={1120} y={955} width={95} />
      <Door x={1870} y={680} width={100} reverse />
      <Door x={2050} y={750} rotation={-90} width={75} />
      <Door x={2050} y={920} rotation={-90} width={80} />
      <Door x={2130} y={1170} rotation={180} width={80} />

      {/* Fixtures are subdued and cannot become booking targets. */}
      <g fill="#cabfac" stroke="#968a77" strokeWidth="2">
        <rect x="1230" y="855" width="220" height="68" rx="2" />
        <rect x="1235" y="750" width="100" height="31" rx="2" />
        <rect x="1500" y="882" width="68" height="65" rx="2" />
        <rect x="1930" y="975" width="180" height="42" rx="2" />
        <rect x="2148" y="1178" width="40" height="120" rx="2" />
        <path d="M2245 835 2285 795 2425 935 2375 985 2395 1005 2450 945 2285 780 2230 835Z" />
      </g>
      <rect x="1850" y="1170" width="70" height="400" rx="5" fill={`url(#${uid}-bar)`} stroke="#2d251e" strokeWidth="5" />
      <path d="M1860 1182V1558M1910 1182V1558" fill="none" stroke="#aa8d5d" strokeOpacity=".35" strokeWidth="2" />
      {[1200,1260,1320,1380,1440,1500].map((y) => <g key={y}>
        <rect x="1779" y={y - 18} width="36" height="36" rx="7" fill="#49323c" stroke="#2d2528" strokeWidth="3" />
        <rect x="1783" y={y - 14} width="28" height="27" rx="5" fill={`url(#${uid}-seat)`} stroke="#b18a9a" strokeWidth="1" />
      </g>)}
      {columns.map(([x,y], i) => <g key={i}>
        <rect x={x - 12} y={y - 12} width="24" height="24" fill="#3b3831" stroke="#24241f" strokeWidth="2" />
        <path d={`M${x - 9} ${y + 9}V${y - 9}H${x + 9}`} stroke="#807465" strokeWidth="2" fill="none" />
      </g>)}
    </g>
    <Label x={980} y={840}>{t.storage}</Label>
    <Label x={1300} y={825}>{t.storage}</Label>
    <Label x={1785} y={550}>{t.storage}</Label>
    <Label x={2120} y={715}>WC</Label>
    <Label x={2120} y={884}>WC</Label>
    <Label x={2335} y={910} rotate={-45}>{t.prep}</Label>
    <Label x={2315} y={1250}>{t.kitchen}</Label>
    <Label x={2135} y={1485} rotate={-45}>{t.wash}</Label>
    <Label x={1886} y={1370} rotate={-90} className="cofein-map-bar-label">{t.bar}</Label>
    <Label x={1202} y={1700} rotate={-90} className="cofein-map-zone-label">{t.exterior}</Label>
    <Label x={1700} y={1670} rotate={-90} className="cofein-map-zone-label">{t.interior}</Label>
    <Label x={1260} y={2880} rotate={-45} className="cofein-map-zone-label">{t.exterior}</Label>
    <Label x={1920} y={2350} rotate={45} className="cofein-map-zone-label">{t.interior}</Label>
    <Label x={785} y={2260} rotate={-90}>{t.garden}</Label>
    <Label x={1790} y={3090}>{t.street}</Label>
    <g fill="none" stroke="#927b5b" strokeWidth="1">
      <path d="M30 345H62L70 358M30 782H62L70 794M550 1290H592" />
    </g>
    <Label x={795} y={1010} anchor="start" className="cofein-map-direction-label">{t.gardenExit}</Label>
    <Label x={795} y={1885} anchor="start" className="cofein-map-direction-label">{t.gardenExit}</Label>
    <Label x={1950} y={2925} anchor="start" className="cofein-map-direction-label">{t.streetEntry}</Label>
  </svg>;
}
