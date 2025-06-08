// js/data.js
// Handles fetching and processing of fuel data.

import { DATA_SOURCES, parseLocation, STANDARD_PETROL_CODE, ALT_STANDARD_PETROL_CODES, STANDARD_DIESEL_CODE, ALT_STANDARD_DIESEL_CODES } from './config.js';
import { state } from './state.js';
import { addStationToCluster, createFilterControls, updateDynamicPriceScaleAndLegend } from './map-renderer.js';


// NEW: List of reliable public CORS proxies
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://cors.eu.org/',
    'https://proxy.cors.sh/'
];

// NEW: Advanced fetch function with proxy fallback and retry logic
async function fetchWithProxy(url) {
    for (const proxy of CORS_PROXIES) {
        const proxiedUrl = proxy + encodeURIComponent(url);
        try {
            const response = await fetch(proxiedUrl, {
                headers: {
                    // Some proxies require an origin header
                    'x-requested-with': 'XMLHttpRequest'
                }
            });
            if (response.ok) {
                // If we get a good response, return it and stop trying other proxies
                return response.json(); 
            }
            // If the response is not ok, we'll log it and the loop will try the next proxy
            console.warn(`Proxy ${proxy} failed for ${url} with status ${response.status}`);
        } catch (error) {
            // If a fetch fails completely (e.g., network error), log it and try the next proxy
            console.warn(`Proxy ${proxy} encountered a network error for ${url}:`, error);
        }
    }
    // If all proxies fail, throw an error to be caught by the main loop
    throw new Error(`All proxies failed to fetch ${url}`);
}


export async function fetchAndProcessData() {
    if (!state.map) { console.error("Map object is not available!"); return; }
    console.log("Fetching fuel price data...");
    state.allStationsData.length = 0;
    Object.keys(state.brandMarkerClusters).forEach(brandName => {
        if (state.brandMarkerClusters[brandName]) state.map.removeLayer(state.brandMarkerClusters[brandName]);
        delete state.brandMarkerClusters[brandName];
    });

    let totalStationsAddedToMap = 0;

    // MODIFIED: Use the new resilient fetch logic
    for (const source of DATA_SOURCES) {
        try {
            // Use the new fetch function that tries multiple proxies
            const data = await fetchWithProxy(source.url);
            
            const lastUpdated = data.last_updated;

            if (data && data.stations && Array.isArray(data.stations)) {
                data.stations.forEach(station => {
                    const loc = source.locationParser ? source.locationParser(station.location) : parseLocation(station.location);
                    if (loc && !isNaN(loc.latitude) && !isNaN(loc.longitude) && (loc.latitude !== 0 || loc.longitude !== 0)) {
                        state.allStationsData.push({ ...station, sourceName: source.name, lat: loc.latitude, lon: loc.longitude, lastUpdated });
                        totalStationsAddedToMap++;
                    }
                });
            }
            console.log(`Successfully fetched data for ${source.name}.`);
        } catch (error) {
            console.error(`Ultimately failed to fetch data for ${source.name}:`, error);
        }
    }
    
    console.log(`Processing complete. Found ${totalStationsAddedToMap} stations.`);
    state.allStationsData.forEach(sData => addStationToCluster(sData));
    Object.values(state.brandMarkerClusters).forEach(clusterGroup => state.map.addLayer(clusterGroup));
    updateDynamicPriceScaleAndLegend();
    createFilterControls();
}

export function getStationPrice(station, fuelCode) {
     if (station.prices) {
        const altCodes = fuelCode === STANDARD_PETROL_CODE ? ALT_STANDARD_PETROL_CODES :
                         fuelCode === STANDARD_DIESEL_CODE ? ALT_STANDARD_DIESEL_CODES : [];
        const primaryPrice = station.prices[fuelCode.toUpperCase().trim()];
        if (primaryPrice !== undefined && primaryPrice !== null) return parseFloat(primaryPrice);
        for (const altCode of altCodes) {
            const altPrice = station.prices[altCode.toUpperCase().trim()];
            if (altPrice !== undefined && altPrice !== null) return parseFloat(altPrice);
        }
    }
    return null;
}