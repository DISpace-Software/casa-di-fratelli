import { useId } from "react";
import { projectCofeinTable } from "../../domain/floorPlans/cofeinGeometry.js";
import "./cofein-map.css";

function Seat({ x, y, width = 22, height = 16, rotate = 0, fill }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <rect x={-width / 2} y={-height / 2} width={width} height={height} rx="3.5" fill="#35262b" stroke="#272321" strokeWidth="1.2" />
    <rect x={-width / 2 + 2} y={-height / 2 + 2} width={width - 4} height={height - 4} rx="2.5" fill={fill} />
    <path d={`M${-width / 2 + 3},${-height / 2 + 3}H${width / 2 - 3}`} stroke="#b7929f" strokeOpacity=".5" />
  </g>;
}

export default function CofeinTableVisual({ table, placement, status = "available", selected = false }) {
  const uid = useId().replace(/:/g, "");
  const p = placement || projectCofeinTable(table);
  if (!p) return null;
  const compact = p.compact;
  const paired = p.kind === "paired";
  const booth = p.kind === "booth" || p.kind === "u-booth";
  const uBooth = p.kind === "u-booth";
  const tableWidth = compact ? 29 : paired ? 62 : booth ? 62 : 40;
  const label = String(table.id);
  const labelWidth = compact ? 36 : p.width - 12;
  const baseFontSize = compact ? 11 : 15;
  const fittedLabel = label.length * baseFontSize * 0.7 > labelWidth;
  const labelFontSize = Math.min(baseFontSize, labelWidth / Math.max(1, label.length * 0.7));
  const tableHeight = compact ? 28 : paired ? 34 : booth ? 38 : 40;
  const effectiveStatus = selected ? "selected" : status;
  const upholstery = `url(#${uid}-upholstery)`;
  const availableStatus = ["available", "free", "unknown"].includes(status);

  return <svg
    className="cofein-map-table-visual"
    data-status={effectiveStatus}
    viewBox={`${-p.width / 2} ${-p.height / 2} ${p.width} ${p.height}`}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#805536" /><stop offset=".45" stopColor="#60402c" /><stop offset="1" stopColor="#3d2b21" />
      </linearGradient>
      <linearGradient id={`${uid}-upholstery`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#92717f" /><stop offset=".3" stopColor="#785465" /><stop offset="1" stopColor="#4a3542" />
      </linearGradient>
      <pattern id={`${uid}-grain`} width="13" height="7" patternUnits="userSpaceOnUse">
        <path d="M0 2C4 1 7 4 13 2M0 6C4 4 8 7 13 5" fill="none" stroke="#d1aa76" strokeWidth=".45" opacity=".2" />
      </pattern>
    </defs>
    <g className="cofein-map-table-furniture" transform={`rotate(${p.rotation})`}>
      {booth ? <>
        <Seat x={0} y={-34} width={72} height={22} fill={upholstery} />
        {!p.openEnd && !uBooth && <Seat x={0} y={34} width={72} height={22} rotate={180} fill={upholstery} />}
        {uBooth && <>
          <Seat x={-37} y={0} width={52} height={17} rotate={-90} fill={upholstery} />
          <Seat x={37} y={0} width={52} height={17} rotate={90} fill={upholstery} />
        </>}
        <path d="M-13-42V-26M13-42V-26" className="cofein-map-seat-seam" />
        {!p.openEnd && !uBooth && <path d="M-13 26V42M13 26V42" className="cofein-map-seat-seam" />}
      </> : paired ? <>
        {[-16, 16].map((x) => <g key={x}><Seat x={x} y={-27} fill={upholstery} /><Seat x={x} y={27} rotate={180} fill={upholstery} /></g>)}
      </> : <>
        {[0, 90, 180, 270].map((angle) => <g key={angle} transform={`rotate(${angle})`}><Seat x={0} y={compact ? -18 : -29} width={compact ? 15 : 23} height={compact ? 9 : 15} fill={upholstery} /></g>)}
      </>}
      <rect x={-tableWidth / 2} y={-tableHeight / 2 + 2} width={tableWidth} height={tableHeight} rx="2.5" fill="#261d17" />
      <rect className="cofein-map-table-top" x={-tableWidth / 2} y={-tableHeight / 2} width={tableWidth} height={tableHeight} rx="2.5" fill={`url(#${uid}-wood)`} stroke="#ae8050" strokeWidth=".9" />
      <rect x={-tableWidth / 2 + 1} y={-tableHeight / 2 + 1} width={tableWidth - 2} height={tableHeight - 2} rx="2" fill={`url(#${uid}-grain)`} />
      {paired && <path d={`M0 ${-tableHeight / 2}V${tableHeight / 2}`} stroke="#201a15" strokeWidth="1.1" opacity=".7" />}
      <rect className="cofein-map-table-status-ring" x={-tableWidth / 2 - 2.5} y={-tableHeight / 2 - 2.5} width={tableWidth + 5} height={tableHeight + 5} rx="5" fill="none" strokeWidth="2.5" />
    </g>
    <g className="cofein-map-table-type">
      <text className="cofein-map-table-id" y={compact ? 0 : -2} fontSize={labelFontSize} textLength={fittedLabel ? labelWidth : undefined} lengthAdjust="spacingAndGlyphs" textAnchor="middle">{label}</text>
      <g transform={`translate(0 ${compact ? 10 : 11})`}>
        <circle cx="-7" cy="-3.5" r="1.6" fill="currentColor" />
        <path d="M-10 1C-10-3-4-3-4 1Z" fill="currentColor" />
        <text className="cofein-map-table-seats" x="3" y="1" fontSize={compact ? 7 : 9} textAnchor="middle">{table.seats}</text>
      </g>
    </g>
    {!availableStatus && !selected && <g className="cofein-map-status-badge" transform={`translate(${compact ? 18 : 28} ${compact ? -18 : -22})`}>
      <circle r={compact ? 5 : 7} />
      {["blocked", "unavailable"].includes(status) ? <path d="M-2.5-2.5 2.5 2.5M2.5-2.5-2.5 2.5" />
        : status === "arrived" ? <path d="m-3 0 2 2 4-4" />
          : status === "late" ? <path d="M0-3V0M0 2V3" />
            : <path d="M0-3V0L2 1" />}
    </g>}
    {selected && <g className="cofein-map-status-badge" transform={`translate(${compact ? 18 : 28} ${compact ? -18 : -22})`}><circle r={compact ? 5 : 7} /><path d="m-3 0 2 2 4-4" /></g>}
  </svg>;
}
