import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { TerritoryBoundary } from "@/lib/crm-store";

export type GeographicRep = { id: string; name: string; territory: string; latitude: number; longitude: number; outsideTerritory?: boolean; path?: Array<{ latitude: number; longitude: number }> };
export type GeographicMapProps = { boundaries: TerritoryBoundary[]; reps?: GeographicRep[]; height?: number; onMapPress?: (point: { latitude: number; longitude: number }) => void };

export function GeographicMap({ boundaries, reps = [], height = 300, onMapPress }: GeographicMapProps) {
  const node = useRef<HTMLDivElement | null>(null);
  const boundariesKey = JSON.stringify(boundaries);
  const repsKey = JSON.stringify(reps);

  useEffect(() => {
    let active = true;
    let map: import("leaflet").Map | undefined;
    void import("leaflet").then((module) => {
      if (!active || !node.current) return;
      const L = module.default ?? module;
      map = L.map(node.current, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const bounds = L.latLngBounds([]);
      boundaries.forEach((boundary) => {
        const points = boundary.polygonPoints ?? [];
        if (points.length >= 3) {
          const polygon = L.polygon(points.map((point) => [point.latitude, point.longitude] as [number, number]), { color: "#0F766E", weight: 2, fillColor: "#34D399", fillOpacity: 0.18 });
          polygon.bindTooltip(boundary.name, { direction: "top", sticky: true });
          polygon.addTo(map!);
          bounds.extend(polygon.getBounds());
        } else {
          const center: [number, number] = [Number(boundary.centerLatitude), Number(boundary.centerLongitude)];
          if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return;
          const circle = L.circle(center, { radius: boundary.radiusMeters, color: "#0F766E", weight: 2, fillColor: "#34D399", fillOpacity: 0.16 });
          circle.bindTooltip(boundary.name, { direction: "top", sticky: true });
          circle.addTo(map!);
          bounds.extend(circle.getBounds());
        }
      });
      reps.forEach((rep) => {
        if (rep.path && rep.path.length > 1) {
          const route = L.polyline(rep.path.map((point) => [point.latitude, point.longitude] as [number, number]), { color: rep.outsideTerritory ? "#DC2626" : "#D97706", weight: 3, dashArray: "7 5", opacity: 0.88 });
          route.addTo(map!); bounds.extend(route.getBounds());
        }
        const marker = L.circleMarker([rep.latitude, rep.longitude], { radius: 9, color: "#FFFFFF", weight: 3, fillColor: rep.outsideTerritory ? "#DC2626" : "#0D9488", fillOpacity: 1 });
        marker.bindTooltip(`${rep.name} · ${rep.territory}`, { direction: "top", offset: [0, -9] });
        marker.addTo(map!); bounds.extend(marker.getLatLng());
      });
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 14 });
      else map.setView([15.5007, 32.5599], 11);
      if (onMapPress) map.on("click", (event) => onMapPress({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    });
    return () => { active = false; map?.remove(); };
  }, [boundariesKey, repsKey, onMapPress]);

  return <div ref={node} style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", background: "#EAF6F2", cursor: onMapPress ? "crosshair" : "grab" }} />;
}
