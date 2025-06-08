// js/data.js
// Handles fetching and processing of fuel data with caching and loading indication.

import { DATA_SOURCES, parseLocation, STANDARD_PETROL_CODE, ALT_STANDARD_PETROL_CODES, STANDARD_DIESEL_CODE, ALT_STANDARD_DIESEL_CODES } from './config.js';
import { state } from './state.js';
import { addStationToCluster, createFilterControls, updateDynamicPriceScaleAndLegend } from './map-renderer.js';

const CORS_PROXIES = ['https://api.allorigins.win/raw?url=', 'https://cors.eu.org/'];
const CACHE_KEY = 'fuelDataCache';
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

async function fetchWithProxyFallbacks(url) {
    for (const proxy of CORS_PROXIES) {
        const proxiedUrl = proxy + encodeURIComponent(url);
        try {
            const response = await fetch(proxiedUrl);
            if (response.ok) {
                const data = await response.json();
                console.log(`Success with proxy for ${url}`);
                return data;
            }
            console.warn(`Proxy failed for ${url} with status ${response.status}`);
        } catch (error) {
            console.warn(`Proxy encountered a network error for ${url}:`, error.message);
        }
    }
    throw new Error(`All proxies failed to fetch ${url}`);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// NEW: Function to process and render data, used by both fetch and cache logic
function processAndRenderData(data, totalStations) {
    state.allStationsData = data;
    console.log(`Processing complete. Found ${totalStations} stations.`);
    
    state.allStationsData.forEach(sData => addStationToCluster(sData));
    Object.values(state.brandMarkerClusters).forEach(clusterGroup => state.map.addLayer(clusterGroup));
    
    updateDynamicPriceScaleAndLegend();
    createFilterControls();
}

export async function fetchAndProcessData() {
    if (!state.map) { console.error("Map object is not available!"); return; }
    
    const loadingOverlay = document.getElementById('loading-overlay');

    // Check for cached data first
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
        const { timestamp, data, totalStations } = JSON.parse(cachedData);
        if (Date.now() - timestamp < CACHE_DURATION_MS) {
            console.log("Loading data from cache.");
            processAndRenderData(data, totalStations);
            return; // Exit if cache is valid
        } else {
            console.log("Cache is stale, fetching new data.");
        }
    }

    // If no valid cache, show the loading indicator and fetch new data
    loadingOverlay.classList.add('visible');
    console.log("Fetching latest fuel prices...");

    state.allStationsData.length = 0;
    Object.keys(state.brandMarkerClusters).forEach(brandName => {
        if (state.brandMarkerClusters[brandName]) state.map.removeLayer(state.brandMarkerClusters[brandName]);
        delete state.brandMarkerClusters[brandName];
    });

    let freshData = [];
    let totalStationsAddedToMap = 0;

    for (const source of DATA_SOURCES) {
        try {
            const data = await fetchWithProxyFallbacks(source.url);
            const lastUpdated = data.last_updated;
            if (data && data.stations && Array.isArray(data.stations)) {
                data.stations.forEach(station => {
                    const loc = source.locationParser ? source.locationParser(station.location) : parseLocation(station.location);
                    if (loc && !isNaN(loc.latitude) && !isNaN(loc.longitude) && (loc.latitude !== 0 || loc.longitude !== 0)) {
                        freshData.push({ ...station, sourceName: source.name, lat: loc.latitude, lon: loc.longitude, lastUpdated });
                        totalStationsAddedToMap++;
                    }
                });
            }
            console.log(`Successfully processed data for ${source.name}.`);
        } catch (error) {
            console.error(`Gave up on ${source.name} after trying all proxies. Error:`, error.message);
        }
        // MODIFIED: Reduced delay
        await delay(25); 
    }
    
    // NEW: Save the newly fetched data to the cache
    const cachePayload = {
        timestamp: Date.now(),
        data: freshData,
        totalStations: totalStationsAddedToMap,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
    
    // Process and render the fresh data
    processAndRenderData(freshData, totalStationsAddedToMap);
    
    // Hide the loading indicator
    loadingOverlay.classList.remove('visible');
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