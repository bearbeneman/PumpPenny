// js/data.js
// Handles fetching and processing of fuel data.

import { DATA_SOURCES, parseLocation, STANDARD_PETROL_CODE, ALT_STANDARD_PETROL_CODES, STANDARD_DIESEL_CODE, ALT_STANDARD_DIESEL_CODES } from './config.js';
import { state } from './state.js';
import { addStationToCluster, createFilterControls, updateDynamicPriceScaleAndLegend } from './map-renderer.js';

export async function fetchAndProcessData() {
    if (!state.map) { console.error("Map object is not available!"); return; }
    console.log("Fetching fuel price data...");
    state.allStationsData.length = 0;
    Object.keys(state.brandMarkerClusters).forEach(brandName => {
        if (state.brandMarkerClusters[brandName]) state.map.removeLayer(state.brandMarkerClusters[brandName]);
        delete state.brandMarkerClusters[brandName];
    });

    let totalStationsAddedToMap = 0;
    const fetchPromises = DATA_SOURCES.map(source =>
        fetch(source.url, { cache: "no-store" })
            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
            .then(data => ({ name: source.name, data, sourceConfig: source }))
            .catch(error => {
                console.error(`Failed to fetch data for ${source.name}:`, error);
                return { name: source.name, error };
            })
    );

    for (const promise of fetchPromises) {
        const result = await promise;
        if (result.error) continue;
        const { name, data, sourceConfig } = result;
        // MODIFIED: Capture the last_updated time from the source file
        const lastUpdated = data.last_updated;

        if (data && data.stations && Array.isArray(data.stations)) {
            data.stations.forEach(station => {
                const loc = sourceConfig.locationParser ? sourceConfig.locationParser(station.location) : parseLocation(station.location);
                if (loc && !isNaN(loc.latitude) && !isNaN(loc.longitude) && (loc.latitude !== 0 || loc.longitude !== 0)) {
                    // MODIFIED: Add the lastUpdated property to each station object
                    state.allStationsData.push({ ...station, sourceName: name, lat: loc.latitude, lon: loc.longitude, lastUpdated });
                    totalStationsAddedToMap++;
                }
            });
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