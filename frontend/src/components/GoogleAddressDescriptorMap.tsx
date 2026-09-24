/**
 * @license
 * Copyright 2024 Google LLC. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { loadGoogleMaps } from '../services/googleMapsLoader';
import { MapPin, Navigation, Compass, AlertCircle } from 'lucide-react';

export interface AddressDescriptorLocation {
  formattedAddress: string;
  combinedAddress: string;
  latitude: number;
  longitude: number;
  landmark?: string;
  addressComponents?: {
    streetNumber?: string;
    route?: string;
    aptSuite?: string;
    city?: string;
    stateProvince?: string;
    postalCode?: string;
    country?: string;
  };
}

interface GoogleAddressDescriptorMapProps {
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  height?: string;
  onLocationSelect?: (location: AddressDescriptorLocation) => void;
  className?: string;
}

export const GoogleAddressDescriptorMap: React.FC<GoogleAddressDescriptorMapProps> = ({
  initialCenter = { lat: 28.43268, lng: 77.0459 }, // Initial center coordinates (Gurgaon default from Google demo)
  initialZoom = 16,
  height = '420px',
  onLocationSelect,
  className = '',
}) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const aptSuiteInputRef = useRef<HTMLInputElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const stateProvinceInputRef = useRef<HTMLInputElement>(null);
  const zipPostalCodeInputRef = useRef<HTMLInputElement>(null);
  const countryInputRef = useRef<HTMLInputElement>(null);
  const landmarksSelectRef = useRef<HTMLSelectElement>(null);
  const combinedAddressInputRef = useRef<HTMLTextAreaElement>(null);

  const [mapError, setMapError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [_activeLandmark, setActiveLandmark] = useState<string>('');

  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const descriptorMarkersRef = useRef<any[]>([]);
  const geocoderRef = useRef<any>(null);
  const formattedAddressRef = useRef<string>('');

  const updateCombinedAddress = useCallback(() => {
    const address = formattedAddressRef.current;
    const select = landmarksSelectRef.current;
    let landmarkText = '';
    if (select && select.selectedIndex >= 0 && select.options[select.selectedIndex]) {
      landmarkText = select.options[select.selectedIndex].text;
    }
    const combined = landmarkText ? `${address}\n${landmarkText}` : address;
    if (combinedAddressInputRef.current) {
      combinedAddressInputRef.current.value = combined;
    }
    if (window.M?.updateTextFields) {
      window.M.updateTextFields();
    }

    if (onLocationSelect && markerRef.current?.position) {
      const pos = markerRef.current.position;
      const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
      const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;

      onLocationSelect({
        formattedAddress: address,
        combinedAddress: combined,
        latitude: lat,
        longitude: lng,
        landmark: landmarkText,
        addressComponents: {
          streetNumber: addressInputRef.current?.value.split(' ')[0] || '',
          route: addressInputRef.current?.value.split(' ').slice(1).join(' ') || '',
          aptSuite: aptSuiteInputRef.current?.value || '',
          city: cityInputRef.current?.value || '',
          stateProvince: stateProvinceInputRef.current?.value || '',
          postalCode: zipPostalCodeInputRef.current?.value || '',
          country: countryInputRef.current?.value || '',
        },
      });
    }
  }, [onLocationSelect]);

  const fillInAddress = useCallback((place: any) => {
    if (aptSuiteInputRef.current) aptSuiteInputRef.current.value = '';
    if (cityInputRef.current) cityInputRef.current.value = '';
    if (stateProvinceInputRef.current) stateProvinceInputRef.current.value = '';
    if (zipPostalCodeInputRef.current) zipPostalCodeInputRef.current.value = '';
    if (countryInputRef.current) countryInputRef.current.value = '';

    if (!place.address_components) return;

    for (const component of place.address_components) {
      const componentType = component.types[0];

      switch (componentType) {
        case 'street_number': {
          if (addressInputRef.current) addressInputRef.current.value = `${component.long_name} `;
          break;
        }
        case 'route': {
          if (addressInputRef.current) addressInputRef.current.value += component.short_name;
          break;
        }
        case 'premise':
        case 'subpremise': {
          if (aptSuiteInputRef.current) aptSuiteInputRef.current.value = component.short_name;
          break;
        }
        case 'locality': {
          if (cityInputRef.current) cityInputRef.current.value = component.long_name;
          break;
        }
        case 'administrative_area_level_1': {
          if (stateProvinceInputRef.current) stateProvinceInputRef.current.value = component.short_name;
          break;
        }
        case 'postal_code': {
          if (zipPostalCodeInputRef.current) zipPostalCodeInputRef.current.value = component.long_name;
          break;
        }
        case 'country': {
          if (countryInputRef.current) countryInputRef.current.value = component.long_name;
          break;
        }
      }
    }

    if (window.M?.updateTextFields) {
      window.M.updateTextFields();
    }
  }, []);

  const addressDescriptorPlaceIdLookup = useCallback(async (placeId: string, googleMapsModule: any, InfoWindow: any, AdvancedMarkerElement: any) => {
    const geocoder = geocoderRef.current || new googleMapsModule.Geocoder();
    const map = mapInstanceRef.current;
    const landmarksSelect = landmarksSelectRef.current;

    geocoder.geocode({
      placeId: placeId,
      extraComputations: ['ADDRESS_DESCRIPTORS'],
      fulfillOnZeroResults: true,
    }, (results: any, status: string) => {
      if (status === 'OK' && results && results[0]) {
        const addressDescriptor = results[0].address_descriptor;
        if (addressDescriptor && landmarksSelect) {
          const descriptors = addressDescriptor.landmarks || [];
          landmarksSelect.innerHTML = '<option value="" disabled selected>Choose your Landmark</option>';

          // Clear existing descriptor markers
          descriptorMarkersRef.current.forEach((m) => {
            if (m.map) m.map = null;
          });
          descriptorMarkersRef.current = [];

          descriptors.forEach((descriptor: any, index: number) => {
            const option = document.createElement('option');
            option.value = descriptor.display_name;
            option.text = `${descriptor.spatial_relationship || 'Near'} ${descriptor.display_name}`;
            landmarksSelect.appendChild(option);

            const descriptorMarkerContent = document.createElement('div');
            if (index === 0) {
              descriptorMarkerContent.className = 'descriptor-marker highlighted';
            } else {
              descriptorMarkerContent.className = 'descriptor-marker';
            }
            descriptorMarkerContent.textContent = String(index + 1);

            // Get landmark location
            geocoder.geocode({ placeId: descriptor.place_id }, (landmarkResults: any, landmarkStatus: string) => {
              if (landmarkStatus === 'OK' && landmarkResults && landmarkResults[0]) {
                const landmarkInfoWindow = new InfoWindow({
                  content: `<div style="font-family:sans-serif;font-size:12px;padding:4px 6px;"><strong>${descriptor.display_name}</strong><div style="color:#666;font-size:11px;">${descriptor.spatial_relationship || 'Landmark'}</div></div>`,
                  headerDisabled: true,
                });

                const landmarkMarker = new AdvancedMarkerElement({
                  map: map,
                  position: landmarkResults[0].geometry.location,
                  content: descriptorMarkerContent,
                });
                descriptorMarkersRef.current.push(landmarkMarker);

                descriptorMarkerContent.addEventListener('mouseover', () => {
                  landmarkInfoWindow.open(map, landmarkMarker);
                });
                descriptorMarkerContent.addEventListener('mouseout', () => {
                  landmarkInfoWindow.close();
                });
              }
            });
          });

          // Autoselect first option
          if (landmarksSelect.options.length > 1) {
            landmarksSelect.selectedIndex = 1;
            setActiveLandmark(landmarksSelect.options[1].text);
            updateCombinedAddress();
            if (window.M?.FormSelect?.init) {
              window.M.FormSelect.init(landmarksSelect);
            }
          }
        } else if (landmarksSelect) {
          landmarksSelect.innerHTML = '<option value="" disabled selected>No landmarks available</option>';
          if (combinedAddressInputRef.current) {
            combinedAddressInputRef.current.value = formattedAddressRef.current;
          }
        }
      }
    });
  }, [updateCombinedAddress]);

  useEffect(() => {
    let isCancelled = false;

    async function initMap() {
      try {
        setIsLoading(true);
        setMapError(null);

        const google = await loadGoogleMaps();
        if (isCancelled || !mapElementRef.current) return;

        const { Map, InfoWindow } = await google.maps.importLibrary('maps');
        const { Autocomplete } = await google.maps.importLibrary('places');
        const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

        const mapOptions = {
          center: initialCenter,
          zoom: initialZoom,
          mapId: 'f8b9e6163e48e501',
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
        };

        const map = new Map(mapElementRef.current, mapOptions);
        mapInstanceRef.current = map;

        const geocoder = new google.maps.Geocoder();
        geocoderRef.current = geocoder;

        const marker = new AdvancedMarkerElement({
          map,
          position: mapOptions.center,
          gmpDraggable: true,
        });
        markerRef.current = marker;

        const addressInput = addressInputRef.current;
        if (addressInput) {
          const autocomplete = new Autocomplete(addressInput, {
            fields: ['place_id', 'address_components', 'formatted_address', 'geometry', 'name'],
          });

          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.geometry) {
              console.error("No details available for input: '" + place.name + "'");
              return;
            }

            marker.position = place.geometry.location;
            map.setCenter(place.geometry.location);

            fillInAddress(place);
            formattedAddressRef.current = place.formatted_address || '';

            if (place.place_id) {
              addressDescriptorPlaceIdLookup(place.place_id, google.maps, InfoWindow, AdvancedMarkerElement);
            }

            const infoWindow = new InfoWindow({
              content: `<div style="font-family:sans-serif;font-size:12px;padding:4px 6px;"><strong>${place.name}</strong></div>`,
              headerDisabled: true,
            });
            infoWindow.open(map, marker);
          });
        }

        // Marker dragend listener
        marker.addListener('dragend', () => {
          const newPosition = marker.position;
          geocoder.geocode({
            location: newPosition,
            extraComputations: ['ADDRESS_DESCRIPTORS'],
            fulfillOnZeroResults: true,
          }, (results: any, status: string) => {
            if (status === 'OK' && results && results[0]) {
              const place = results[0];
              fillInAddress(place);
              formattedAddressRef.current = place.formatted_address || '';
              updateCombinedAddress();

              if (place.place_id) {
                addressDescriptorPlaceIdLookup(place.place_id, google.maps, InfoWindow, AdvancedMarkerElement);
              }
              map.setCenter(newPosition);
            }
          });
        });

        // Trigger initial geocode for Gurgaon center coordinates
        geocoder.geocode({
          location: initialCenter,
          extraComputations: ['ADDRESS_DESCRIPTORS'],
          fulfillOnZeroResults: true,
        }, (results: any, status: string) => {
          if (status === 'OK' && results && results[0]) {
            const place = results[0];
            fillInAddress(place);
            if (addressInput) addressInput.value = place.formatted_address || '';
            formattedAddressRef.current = place.formatted_address || '';
            if (place.place_id) {
              addressDescriptorPlaceIdLookup(place.place_id, google.maps, InfoWindow, AdvancedMarkerElement);
            }
          }
        });

        setIsLoading(false);
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Google Maps initialization failed:', err);
          setMapError(err.message || 'Google Maps failed to load');
          setIsLoading(false);
        }
      }
    }

    initMap();

    return () => {
      isCancelled = true;
    };
  }, [initialCenter, initialZoom, fillInAddress, addressDescriptorPlaceIdLookup, updateCombinedAddress]);

  const handleLandmarkChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveLandmark(e.target.value);
    updateCombinedAddress();

    const selectedIndex = e.target.selectedIndex - 1;
    descriptorMarkersRef.current.forEach((m) => {
      if (m.content) {
        const textIdx = parseInt(m.content.textContent || '0', 10) - 1;
        if (selectedIndex === textIdx) {
          m.content.classList.add('highlighted');
        } else {
          m.content.classList.remove('highlighted');
        }
      }
    });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Autocomplete Input Bar */}
      <div className="space-y-1.5">
        <label htmlFor="address-autocomplete" className="block text-xs font-semibold text-stone-700">
          Search Pickup Address & Landmarks
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
            <MapPin className="w-4 h-4 text-emerald-800" />
          </div>
          <input
            id="address-autocomplete"
            ref={addressInputRef}
            type="text"
            placeholder="Search address or landmark with Google Places Autocomplete..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-lg text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-emerald-600 shadow-sm"
          />
        </div>
      </div>

      {/* Map Canvas with ID="map" */}
      <div className="relative rounded-xl overflow-hidden border border-stone-300 shadow-sm bg-stone-100">
        <div
          id="map"
          ref={mapElementRef}
          style={{ width: '100%', height }}
          className="z-0"
        />

        {isLoading && (
          <div className="absolute inset-0 bg-stone-50/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-stone-600 text-xs">
            <Compass className="w-6 h-6 text-emerald-800 animate-spin" />
            <span>Loading Google Maps & Address Descriptors...</span>
          </div>
        )}

        {mapError && (
          <div className="absolute inset-0 bg-stone-50 p-4 flex flex-col items-center justify-center text-center gap-2 text-xs text-stone-600">
            <AlertCircle className="w-6 h-6 text-amber-600" />
            <p className="font-semibold text-stone-800">Google Maps unavailable</p>
            <p className="max-w-xs text-[11px] text-stone-500">
              Provide an API key via <code className="bg-stone-200 px-1 py-0.5 rounded">VITE_GOOGLE_MAPS_API_KEY</code> or continue typing the address below.
            </p>
          </div>
        )}

        {/* Draggable pin notice */}
        <div className="absolute top-2 right-2 bg-stone-900/80 backdrop-blur-xs text-white text-[10px] font-mono px-2.5 py-1 rounded-md shadow-sm pointer-events-none flex items-center gap-1.5">
          <Navigation className="w-3 h-3 text-emerald-400" />
          <span>Pin is Draggable (Auto Landmark Reverse Geocoding)</span>
        </div>
      </div>

      {/* Address Descriptors / Landmark Selector */}
      <div className="space-y-1.5">
        <label htmlFor="landmarks" className="block text-xs font-semibold text-stone-700">
          Landmark Descriptor (Address Descriptors API)
        </label>
        <select
          id="landmarks"
          ref={landmarksSelectRef}
          onChange={handleLandmarkChange}
          className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-800 focus:outline-none focus:border-emerald-600 shadow-sm"
        >
          <option value="" disabled selected>Choose your Landmark</option>
        </select>
        <p className="text-[11px] text-stone-500">
          Google Address Descriptors automatically pins nearby visual landmarks with relative directions for transporters.
        </p>
      </div>

      {/* Structured Form Fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
        <div>
          <label htmlFor="apt-suite" className="block text-[11px] font-semibold text-stone-600 mb-1">
            Apt / Suite / Unit
          </label>
          <input
            id="apt-suite"
            ref={aptSuiteInputRef}
            type="text"
            placeholder="e.g. Loading Dock #2"
            className="w-full bg-stone-50 border border-stone-200 rounded-md px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label htmlFor="city" className="block text-[11px] font-semibold text-stone-600 mb-1">
            City
          </label>
          <input
            id="city"
            ref={cityInputRef}
            type="text"
            placeholder="City"
            className="w-full bg-stone-50 border border-stone-200 rounded-md px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label htmlFor="state-province" className="block text-[11px] font-semibold text-stone-600 mb-1">
            State / Province
          </label>
          <input
            id="state-province"
            ref={stateProvinceInputRef}
            type="text"
            placeholder="State"
            className="w-full bg-stone-50 border border-stone-200 rounded-md px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label htmlFor="zip-postal-code" className="block text-[11px] font-semibold text-stone-600 mb-1">
            ZIP / Postal Code
          </label>
          <input
            id="zip-postal-code"
            ref={zipPostalCodeInputRef}
            type="text"
            placeholder="Postal Code"
            className="w-full bg-stone-50 border border-stone-200 rounded-md px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div className="col-span-2">
          <label htmlFor="country" className="block text-[11px] font-semibold text-stone-600 mb-1">
            Country
          </label>
          <input
            id="country"
            ref={countryInputRef}
            type="text"
            placeholder="Country"
            className="w-full bg-stone-50 border border-stone-200 rounded-md px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      {/* Combined Address Field */}
      <div className="space-y-1.5 pt-1">
        <label htmlFor="combined-address" className="block text-xs font-semibold text-stone-700">
          Combined Address for Pickup & Navigation
        </label>
        <textarea
          id="combined-address"
          ref={combinedAddressInputRef}
          rows={2}
          readOnly
          placeholder="Formatted address with landmark instructions..."
          className="w-full bg-stone-100/70 border border-stone-300 rounded-lg p-2.5 text-xs font-mono text-stone-800 focus:outline-none"
        />
      </div>
    </div>
  );
};
