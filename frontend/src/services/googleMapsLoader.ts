/**
 * Google Maps JavaScript API Dynamic Loader
 * Supports Google Maps importLibrary API with Places, Advanced Marker, and Address Descriptors.
 */

declare global {
  interface Window {
    google?: any;
    M?: any;
    initGoogleMapCallback?: () => void;
  }
}

// Provide a safe Materialize CSS shim if not present so M.* calls do not throw
if (typeof window !== 'undefined') {
  if (!window.M) {
    window.M = {
      updateTextFields: () => {},
      FormSelect: {
        init: () => {},
        getInstance: (el: any) => ({
          destroy: () => {},
        }),
      },
    };
  }
}

let loadPromise: Promise<any> | null = null;

export function loadGoogleMaps(apiKey?: string): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only be loaded in a browser environment'));
  }

  if (window.google?.maps?.importLibrary) {
    return Promise.resolve(window.google);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('google-maps-script') as HTMLScriptElement | null;
    if (existingScript) {
      if (window.google?.maps?.importLibrary) {
        resolve(window.google);
        return;
      }
      existingScript.addEventListener('load', () => resolve(window.google));
      existingScript.addEventListener('error', (err) => reject(err));
      return;
    }

    const key = apiKey || (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    // Load with weekly version, marker, places, and geometry libraries
    script.src = `https://maps.googleapis.com/maps/api/js?${key ? `key=${encodeURIComponent(key)}&` : ''}v=weekly&libraries=maps,places,marker,geometry`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(new Error('Google Maps script loaded but window.google is undefined'));
      }
    };

    script.onerror = (err) => {
      console.warn('Google Maps script failed to load. Check network or API key configuration:', err);
      reject(err);
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
