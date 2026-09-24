import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  info?: string;
  type: 'DONOR' | 'RECEIVER' | 'DRIVER';
}

export interface MapRoute {
  id: string;
  donorCoords: [number, number];
  receiverCoords: [number, number];
  driverCoords?: [number, number];
  status: string;
  mode: string;
}

interface RescueMapProps {
  points?: MapPoint[];
  routes?: MapRoute[];
  center?: [number, number];
  zoom?: number;
  height?: string;
}

export const RescueMap: React.FC<RescueMapProps> = ({
  points = [],
  routes = [],
  center = [40.7306, -73.9866],
  zoom = 13,
  height = '420px',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const initialView = useRef({ center, zoom });
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: initialView.current.center,
        zoom: initialView.current.zoom,
        zoomControl: true,
      });

      // Modern dark tile layer from CartoDB
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers and polylines on props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // Custom Icon Creators using L.divIcon
    const createCustomIcon = (type: 'DONOR' | 'RECEIVER' | 'DRIVER') => {
      let bg = 'bg-emerald-500';
      let iconText = '🏪';
      let shadowColor = 'shadow-none';

      if (type === 'RECEIVER') {
        bg = 'bg-stone-900';
        iconText = '🏠';
        shadowColor = 'shadow-none';
      } else if (type === 'DRIVER') {
        bg = 'bg-amber-500';
        iconText = '🚗';
        shadowColor = 'shadow-none';
      }

      return L.divIcon({
        className: 'custom-map-pin',
        html: `<div class="w-8 h-8 rounded-full ${bg} ${shadowColor} shadow-none border-2 border-stone-200 flex items-center justify-center text-sm transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition hover:scale-110">
          <span>${iconText}</span>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    };

    // Plot Points
    points.forEach((p) => {
      if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return;
      const marker = L.marker([p.latitude, p.longitude], {
        icon: createCustomIcon(p.type),
      });

      const popup = document.createElement('div');
      popup.className = 'map-popup';
      const title = document.createElement('strong');
      title.textContent = p.name;
      const info = document.createElement('span');
      info.textContent = p.info || p.type;
      popup.append(title, info);
      marker.bindPopup(popup);

      layerGroup.addLayer(marker);
    });

    // Plot Routes
    routes.forEach((r) => {
      const latlngs: [number, number][] = [];
      if (r.driverCoords) {
        latlngs.push(r.driverCoords);
      }
      latlngs.push(r.donorCoords);
      latlngs.push(r.receiverCoords);

      const color = r.mode === 'PLATFORM_DRIVER' ? '#3b82f6' : '#10b981';

      const polyline = L.polyline(latlngs, {
        color,
        weight: 3,
        opacity: 0.85,
        dashArray: '6, 8',
      });

      const popup = document.createElement('div');
      popup.className = 'map-popup';
      popup.textContent = `Estimated connection · ${r.mode.replaceAll('_', ' ')} · ${r.status.replaceAll('_', ' ')}`;
      polyline.bindPopup(popup);

      layerGroup.addLayer(polyline);
    });

    // Fit bounds if multiple points exist
    if (points.length > 1) {
      const validCoords = points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map((p) => [p.latitude, p.longitude] as [number, number]);
      const bounds = L.latLngBounds(validCoords);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [points, routes]);

  return (
    <div className="relative rounded-lg overflow-hidden border border-stone-200 shadow-none bg-white">
      <div ref={mapContainerRef} style={{ height, width: '100%' }} />

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95  px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-700 flex flex-wrap items-center gap-2 max-w-[90%] shadow-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>Donors</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-stone-900" />
          <span>Receivers</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>Platform Couriers</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-stone-300" />
          <span>Estimated connection</span>
        </div>
      </div>
    </div>
  );
};
