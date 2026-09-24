/// <reference types="@types/google.maps" />
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { loadGoogleMaps } from '../services/googleMapsLoader';
import { useTheme } from '../context/ThemeContext';

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
  center = [28.43268, 77.0459], // Default Gurgaon coordinates from Google Maps snippet
  zoom = 13,
  height = '420px',
}) => {
  const { theme } = useTheme();
  const [mapEngine, setMapEngine] = useState<'google' | 'leaflet'>('google');
  const [tileError, setTileError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Google Maps references
  const googleMapRef = useRef<any>(null);
  const googleMarkersRef = useRef<any[]>([]);
  const googlePolylinesRef = useRef<any[]>([]);

  // Leaflet references (fallback)
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const leafletTileLayerRef = useRef<L.TileLayer | null>(null);

  // 1. Initialize Map Engine
  useEffect(() => {
    if (!containerRef.current) return;
    let isCancelled = false;

    async function setupMap() {
      try {
        const google = await loadGoogleMaps();
        if (isCancelled || !containerRef.current) return;

        const { Map } = await google.maps.importLibrary('maps');

        const map = new Map(containerRef.current, {
          center: { lat: center[0], lng: center[1] },
          zoom,
          mapId: 'f8b9e6163e48e501', // User-specified Map ID
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
        });

        googleMapRef.current = map;
        setMapEngine('google');
      } catch {
        // Fallback to Leaflet if Google Maps is unavailable
        if (isCancelled || !containerRef.current) return;
        setMapEngine('leaflet');

        const map = L.map(containerRef.current, {
          center,
          zoom,
          zoomControl: true,
        });

        const tileUrl = theme === 'dark'
          ? 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

        const tileLayer = L.tileLayer(tileUrl, {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 19,
        })
          .on('tileerror', () => setTileError(true))
          .on('tileload', () => setTileError(false))
          .addTo(map);

        leafletTileLayerRef.current = tileLayer;
        leafletLayerGroupRef.current = L.layerGroup().addTo(map);
        leafletMapRef.current = map;
      }
    }


    setupMap();

    const resizeObserver = new ResizeObserver(() => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      isCancelled = true;
      resizeObserver.disconnect();

      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      googleMapRef.current = null;
      googleMarkersRef.current = [];
      googlePolylinesRef.current = [];
    };
  }, []);

  // Dynamically update map tiles when theme changes
  useEffect(() => {
    if (mapEngine === 'leaflet' && leafletMapRef.current && leafletTileLayerRef.current) {
      leafletMapRef.current.removeLayer(leafletTileLayerRef.current);
      const tileUrl = theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

      const newTileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      })
        .on('tileerror', () => setTileError(true))
        .on('tileload', () => setTileError(false))
        .addTo(leafletMapRef.current);

      leafletTileLayerRef.current = newTileLayer;
    }
  }, [theme, mapEngine]);

  // 2. Render Points & Routes on Google Maps
  useEffect(() => {

    if (mapEngine !== 'google' || !googleMapRef.current || !window.google?.maps) return;

    let isCancelled = false;

    async function updateGoogleMap() {
      const google = window.google;
      const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary('marker');
      const { InfoWindow } = await google.maps.importLibrary('maps');
      const map = googleMapRef.current;

      if (isCancelled || !map) return;

      // Clear previous markers
      googleMarkersRef.current.forEach((m) => { if (m.map) m.map = null; });
      googleMarkersRef.current = [];

      // Clear previous polylines
      googlePolylinesRef.current.forEach((p) => { p.setMap(null); });
      googlePolylinesRef.current = [];

      const bounds = new google.maps.LatLngBounds();
      let hasValidCoords = false;

      // Plot Points with AdvancedMarkerElement & PinElement
      points.forEach((p) => {
        if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return;

        let bg = '#10b981';
        let glyphText = '🏪';
        if (p.type === 'RECEIVER') {
          bg = '#1c1917';
          glyphText = '🏠';
        } else if (p.type === 'DRIVER') {
          bg = '#f59e0b';
          glyphText = '🚗';
        }

        const pin = new PinElement({
          background: bg,
          glyphText,
          glyphColor: '#ffffff',
          borderColor: '#ffffff',
          scale: 1.15,
        });

        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: p.latitude, lng: p.longitude },
          content: pin.element,
          title: p.name,
        });

        const infoWindow = new InfoWindow({
          content: `<div style="font-family:sans-serif;font-size:12px;padding:4px 6px;"><strong>${p.name}</strong><div style="color:#666;font-size:11px;margin-top:2px;">${p.info || p.type}</div></div>`,
          headerDisabled: true,
        });

        pin.element.addEventListener('click', () => {
          infoWindow.open(map, marker);
        });

        googleMarkersRef.current.push(marker);
        bounds.extend({ lat: p.latitude, lng: p.longitude });
        hasValidCoords = true;
      });

      // Plot Routes with Polyline
      routes.forEach((r) => {
        const path: { lat: number; lng: number }[] = [];
        if (r.driverCoords) {
          path.push({ lat: r.driverCoords[0], lng: r.driverCoords[1] });
        }
        path.push({ lat: r.donorCoords[0], lng: r.donorCoords[1] });
        path.push({ lat: r.receiverCoords[0], lng: r.receiverCoords[1] });

        const strokeColor = r.mode === 'PLATFORM_DRIVER' ? '#3b82f6' : '#10b981';

        const polyline = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor,
          strokeOpacity: 0.85,
          strokeWeight: 4,
          map,
        });

        googlePolylinesRef.current.push(polyline);
      });

      // Fit bounds if multiple points exist
      if (hasValidCoords && points.length > 1) {
        map.fitBounds(bounds, 50);
      } else if (hasValidCoords && points.length === 1) {
        const first = points[0];
        map.setCenter({ lat: first.latitude, lng: first.longitude });
        map.setZoom(14);
      }
    }

    updateGoogleMap();

    return () => {
      isCancelled = true;
    };
  }, [mapEngine, points, routes]);

  // 3. Fallback Leaflet Plotter
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !leafletMapRef.current || !leafletLayerGroupRef.current) return;

    const map = leafletMapRef.current;
    const layerGroup = leafletLayerGroupRef.current;
    layerGroup.clearLayers();

    const createCustomIcon = (type: 'DONOR' | 'RECEIVER' | 'DRIVER') => {
      let bg = 'bg-emerald-500';
      let iconText = '🏪';
      if (type === 'RECEIVER') {
        bg = 'bg-stone-900';
        iconText = '🏠';
      } else if (type === 'DRIVER') {
        bg = 'bg-amber-500';
        iconText = '🚗';
      }

      return L.divIcon({
        className: 'custom-map-pin',
        html: `<div class="w-8 h-8 rounded-full ${bg} shadow-md border-2 border-white flex items-center justify-center text-sm transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition hover:scale-110">
          <span>${iconText}</span>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    };

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

    routes.forEach((r) => {
      const latlngs: [number, number][] = [];
      if (r.driverCoords) latlngs.push(r.driverCoords);
      latlngs.push(r.donorCoords);
      latlngs.push(r.receiverCoords);

      const color = r.mode === 'PLATFORM_DRIVER' ? '#3b82f6' : '#10b981';
      const polyline = L.polyline(latlngs, {
        color,
        weight: 3,
        opacity: 0.85,
        dashArray: '6, 8',
      });

      layerGroup.addLayer(polyline);
    });

    if (points.length > 1) {
      const validCoords = points
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        .map((p) => [p.latitude, p.longitude] as [number, number]);
      const bounds = L.latLngBounds(validCoords);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [mapEngine, points, routes]);

  return (
    <div className="relative rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800 shadow-none bg-white dark:bg-stone-900 transition-colors">
      <div ref={containerRef} style={{ height, width: '100%' }} />

      {tileError && (
        <p role="status" className="absolute top-3 right-3 left-12 z-[1000] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded px-3 py-2 text-xs text-stone-700 dark:text-stone-300">
          Map tiles unavailable. Use the pickup and destination details to continue.
        </p>
      )}

      {/* Engine and Legend Overlay */}
      <div className="bg-white dark:bg-stone-900 px-3 py-2 border-t border-stone-200 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300 flex flex-wrap items-center justify-between gap-2 transition-colors">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Donors</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-stone-900 dark:bg-stone-200" />
            <span>Receivers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Platform Couriers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-stone-400 dark:border-stone-600" />
            <span>Estimated connection</span>
          </div>
        </div>

        <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded border border-stone-200 dark:border-stone-700">
          {mapEngine === 'google' ? 'Google Maps (MapID: f8b9e6163e48e501)' : 'Leaflet Fallback'}
        </span>
      </div>
    </div>
  );
};
