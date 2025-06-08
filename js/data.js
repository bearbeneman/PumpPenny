// js/data.js
// Handles fetching and processing of fuel data with a resilient, multi-proxy approach.

import { DATA_SOURCES, parseLocation, STANDARD_PETROL_CODE, ALT_STANDARD_PETROL_CODES, STANDARD_DIESEL_CODE, ALT_STANDARD_DIESEL_CODES } from './config.js';
import { state } from './state.js';
import { addStationToCluster, createFilterControls, updateDynamicPriceScaleAndLegend } from './map-renderer.js';

// A list of public CORS proxies. The script will try them in order.
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://cors.eu.org/',
];

/**
 * A more robust fetch function that tries multiple proxies if the first one fails.
 * @param {string} url The target URL to fetch.
 * @returns {Promise<any>} A promise that resolves with the JSON data.
 */
async function fetchWithProxyFallbacks(url) {
    for (const proxy of CORS_PROXIES) {
        const proxiedUrl = proxy + encodeURIComponent(url);
        try {
            const response = await fetch(proxiedUrl);
            if (response.ok) {
                // Try to parse the response as JSON
                const data = await response.json();
                console.log(`Success with proxy ${proxy.substring(0, 20)}... for ${url}`);
                return data; // If successful, return the data and exit the loop
            }
            // If response is not ok (e.g., 404, 500), log it and try the next proxy
            console.warn(`Proxy ${proxy.substring(0, 20)}... failed for ${url} with status ${response.status}`);
        } catch (error) {
            // If fetch fails completely (network error, or if response.json() fails), log it and try next proxy
            console.warn(`Proxy ${proxy.substring(0, 20)}... encountered an error for ${url}:`, error.message);
        }
    }
    // If all proxies have been tried and failed, throw an error.
    throw new Error(`All proxies failed to fetch ${url}`);
}

/**
 * A helper function to introduce a delay.
 * @param {number} ms The delay in milliseconds.
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchAndProcessData() {
    if (!state.map) { console.error("Map object is not available!"); return; }
    console.log("Fetching fuel price data...");
    state.allStationsData.length = 0;
    Object.keys(state.brandMarkerClusters).forEach(brandName => {
        if (state.brandMarkerClusters[brandName]) state.map.removeLayer(state.brandMarkerClusters[brandName]);
        delete state.brandMarkerClusters[brandName];
    });

    let totalStationsAddedToMap = 0;

    // Fetch data sequentially with a delay to be polite to the APIs and proxies
    for (const source of DATA_SOURCES) {
        try {
            // Use the new resilient fetch function
            const data = await fetchWithProxyFallbacks(source.url);
            
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
            console.log(`Successfully processed data for ${source.name}.`);
        } catch (error) {
            // This logs only if ALL proxies failed for a given source
            console.error(`Gave up on ${source.name} after trying all proxies. Error:`, error.message);
        }

        // Add a small delay between each request to avoid rate-limiting
        await delay(250);
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