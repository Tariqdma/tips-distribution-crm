import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { TerritoryBoundary } from "@/lib/crm-store";

export type GeographicRep = { id: string; name: string; territory: string; latitude: number; longitude: number; outsideTerritory?: boolean; path?: Array<{ latitude: number; longitude: number }> };
export type GeographicMapProps = { boundaries: TerritoryBoundary[]; reps?: GeographicRep[]; height?: number; onMapPress?: (point: { latitude: number; longitude: number }) => void };

export function GeographicMap({ boundaries, reps = [], height = 300, onMapPress }: GeographicMapProps) {
  const node = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const validBoundsRef = useRef<import("leaflet").LatLngBounds | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const boundariesKey = JSON.stringify(boundaries);
  const repsKey = JSON.stringify(reps);

  const recenter = useCallback(() => {
    const map = mapRef.current; const bounds = validBoundsRef.current;
    if (!map) return;
    if (bounds?.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 14 });
    else map.setView([15.5007, 32.5599], 11);
  }, []);

  useEffect(() => {
    let active = true;
    let map: import("leaflet").Map | undefined;
    setIsLoading(true); setIgnoredCount(0);
    void import("leaflet").then((module) => {
      if (!active || !node.current) return;
      const L = module.default ?? module;
      map = L.map(node.current, { zoomControl: true, attributionControl: true });
      mapRef.current = map;
      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
      tiles.on("loading", () => active && setIsLoading(true)); tiles.on("load", () => active && setIsLoading(false)); tiles.on("tileerror", () => active && setIsLoading(false)); tiles.addTo(map);
      const bounds = L.latLngBounds([]); let ignored = 0;
      const validPoint = (point: { latitude: unknown; longitude: unknown } | null | undefined): point is { latitude: number; longitude: number } => Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude)) && Math.abs(Number(point?.latitude)) <= 90 && Math.abs(Number(point?.longitude)) <= 180;
      boundaries.forEach((boundary) => {
        const rawPoints = boundary.polygonPoints ?? [];
        const points = rawPoints.filter(validPoint).map((point) => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) }));
        ignored += rawPoints.length - points.length;
        if (points.length >= 3) {
          const polygon = L.polygon(points.map((point) => [point.latitude, point.longitude] as [number, number]), { color: "#0F766E", weight: 2, fillColor: "#34D399", fillOpacity: 0.18 });
          polygon.bindTooltip(boundary.name, { direction: "top", sticky: true }); polygon.addTo(map!); bounds.extend(polygon.getBounds()); return;
        }
        const center: [number, number] = [Number(boundary.centerLatitude), Number(boundary.centerLongitude)]; const radius = Number(boundary.radiusMeters);
        if (!Number.isFinite(center[0]) || !Number.isFinite(center[1]) || !Number.isFinite(radius) || radius <= 0) { ignored += 1; return; }
        const circle = L.circle(center, { radius, color: "#0F766E", weight: 2, fillColor: "#34D399", fillOpacity: 0.16 });
        circle.bindTooltip(boundary.name, { direction: "top", sticky: true }); circle.addTo(map!); bounds.extend(circle.getBounds());
      });
      reps.forEach((rep) => {
        if (!validPoint(rep)) { ignored += 1; return; }
        const rawPath = rep.path ?? []; const routePoints = rawPath.filter(validPoint).map((point) => [Number(point.latitude), Number(point.longitude)] as [number, number]); ignored += rawPath.length - routePoints.length;
        if (routePoints.length > 1) { const route = L.polyline(routePoints, { color: rep.outsideTerritory ? "#DC2626" : "#D97706", weight: 3, dashArray: "7 5", opacity: 0.88 }); route.addTo(map!); bounds.extend(route.getBounds()); }
        const marker = L.circleMarker([Number(rep.latitude), Number(rep.longitude)], { radius: 9, color: "#FFFFFF", weight: 3, fillColor: rep.outsideTerritory ? "#DC2626" : "#0D9488", fillOpacity: 1 });
        marker.bindTooltip(`${rep.name} · ${rep.territory}`, { direction: "top", offset: [0, -9] }); marker.addTo(map!); bounds.extend(marker.getLatLng());
      });
      validBoundsRef.current = bounds; if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 14 }); else map.setView([15.5007, 32.5599], 11);
      if (onMapPress) map.on("click", (event) => onMapPress({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
      if (active) { setIgnoredCount(ignored); window.setTimeout(() => setIsLoading(false), 1400); }
    }).catch(() => { if (active) setIsLoading(false); });
    return () => { active = false; mapRef.current = null; validBoundsRef.current = null; map?.remove(); };
  }, [boundariesKey, repsKey, onMapPress]);

  return <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", background: "#EAF6F2", position: "relative" }}><style>{"@keyframes leafletMapSpin { to { transform: rotate(360deg); } }"}</style><div ref={node} style={{ height: "100%", width: "100%", cursor: onMapPress ? "crosshair" : "grab" }} />{isLoading ? <div style={overlayStyle}><span style={spinnerStyle} /> <span>جارٍ تحميل الخريطة…</span></div> : null}<button type="button" onClick={recenter} style={recenterStyle} aria-label="إعادة تمركز الخريطة"><span style={{ fontSize: 15 }}>⌖</span> إعادة التمركز</button>{ignoredCount > 0 ? <div style={noticeStyle}>تم تجاهل {ignoredCount} عنصر/عناصر جغرافية غير صالحة.</div> : null}</div>;
}

const overlayStyle = { position: "absolute" as const, inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(248, 253, 251, 0.78)", color: "#075E54", fontSize: 12, fontWeight: 800, zIndex: 700 };
const spinnerStyle = { width: 17, height: 17, borderRadius: "50%", border: "2px solid #B9DED3", borderTopColor: "#0D8068", display: "inline-block", animation: "leafletMapSpin 0.8s linear infinite" };
const recenterStyle = { position: "absolute" as const, left: 10, top: 10, zIndex: 720, border: 0, borderRadius: 9, background: "#FFFFFF", color: "#075E54", boxShadow: "0 2px 8px rgba(8,35,29,.16)", padding: "7px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer" };
const noticeStyle = { position: "absolute" as const, right: 10, bottom: 10, zIndex: 720, maxWidth: "78%", borderRadius: 9, background: "#FFF6E5", color: "#8A5A05", boxShadow: "0 2px 8px rgba(8,35,29,.12)", padding: "7px 9px", fontSize: 10, fontWeight: 700, textAlign: "right" as const };
