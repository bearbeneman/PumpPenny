// js/map-renderer.js
// Renders and updates markers, icons, and legends on the map.

import { state } from './state.js';
import * as config from './config.js';
import { getStationPrice } from './data.js';
import { handleFilterChange } from './ui.js';

function formatPriceAsPounds(priceInPence) {
    if (priceInPence === null || isNaN(priceInPence)) {
        return 'N/A';
    }
    const priceInPounds = priceInPence / 100;
    return `£${priceInPounds.toFixed(3)}`;
}

function formatOnMapPrice(priceInPence) {
    if (priceInPence === null || isNaN(priceInPence)) {
        return null; // Return null so we don't show a label if no price
    }
    const priceInPounds = priceInPence / 100;
    return `£${priceInPounds.toFixed(2)}`;
}

function formatTooltipTime(dateString) {
    if (!dateString || typeof dateString !== 'string') return '';
    const datePart = dateString.substring(0, 5);
    const timePart = dateString.substring(11, 16);
    if (!datePart || !timePart) return '';
    return `${datePart} ${timePart}`;
}

function createFlagIcon(isCheapestPetrol, isCheapestDiesel, color = null, priceText = null) {
    let htmlContent = '';
    const iconOptions = {
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], className: 'leaflet-div-icon'
    };
    let flagHtml = '';
    let priceLabelHtml = '';

    if (isCheapestPetrol && isCheapestDiesel) {
        flagHtml = `<div class="icon-flag-diesel">Cheapest Diesel</div><div class="icon-flag-petrol">Cheapest Petrol</div>`;
        iconOptions.className += ' cheapest-both-icon';
    } else if (isCheapestPetrol) {
        flagHtml = `<div class="icon-flag">Cheapest Petrol</div>`; 
        iconOptions.className += ' cheapest-petrol-icon';
    } else if (isCheapestDiesel) {
        flagHtml = `<div class="icon-flag">Cheapest Diesel</div>`; 
        iconOptions.className += ' cheapest-diesel-icon';
    }

    if (priceText) {
        priceLabelHtml = `<span class="marker-price-label">${priceText}</span>`;
    }

    if (color) {
        const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.5 0C5.596 0 0 5.596 0 12.5C0 19.404 12.5 41 12.5 41S25 19.404 25 12.5C25 5.596 19.404 0 12.5 0z" fill="${color}" stroke="#555" stroke-width="0.5"></path></svg>`;
        htmlContent = `<div style="position:relative;">${markerSvg}${flagHtml}${priceLabelHtml}</div>`;
        iconOptions.className += ' price-colored-marker-icon';
    } else {
        htmlContent = `<div style="position:relative;"><img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" />${flagHtml}${priceLabelHtml}</div>`;
        iconOptions.shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
        iconOptions.shadowSize = [41, 41];
        iconOptions.shadowAnchor = [12, 41];
    }
    return L.divIcon({ html: htmlContent, ...iconOptions });
}

export function addStationToCluster(stationData) {
    let brand = (stationData.brand || stationData.sourceName || "Unknown Brand").trim();
    if (brand === "") brand = "Unknown Brand";
    state.allBrandNames.add(brand);
    stationData.displayBrand = brand;

    let pricesHtml = "No price data available.";
    if (stationData.prices && Object.keys(stationData.prices).length > 0) {
        pricesHtml = Object.entries(stationData.prices).map(([code, price]) => {
            const name = config.FUEL_TYPE_DESCRIPTIONS[code.toUpperCase().trim()] || code.trim();
            const formatted = formatPriceAsPounds(parseFloat(price));
            return `<div class="fuel-price"><span class="fuel-name">${name}</span>: ${formatted}</div>`;
        }).join('');
    }
    
    const popupContent = `<strong>${stationData.address || "N/A"}</strong><div class="brand-name">${brand} - ${stationData.postcode || "N/A"}</div><hr>${pricesHtml}<div class="popup-footer"><span class="popup-updated-time">Updated: ${stationData.lastUpdated || 'Unknown'}</span><a href="https://www.google.com/maps/dir/?api=1&destination=${stationData.lat},${stationData.lon}" target="_blank" class="navigate-link">Navigate</a></div>`;
    const marker = L.marker([stationData.lat, stationData.lon], { icon: createFlagIcon(false, false, null) });
    marker.bindTooltip(`<strong>${brand}</strong>`);
    marker.bindPopup(popupContent);
    marker.stationData = stationData;

    if (!state.brandMarkerClusters[brand]) {
        state.brandMarkerClusters[brand] = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60, disableClusteringAtZoom: config.DISABLE_CLUSTERING_ZOOM });
    }
    state.brandMarkerClusters[brand].addLayer(marker);
}

export function updateDynamicPriceScaleAndLegend() {
    if (!state.map || state.allStationsData.length === 0) return;
    const activeButton = document.querySelector('#fuel-type-buttons .active');
    const selectedFuelForColor = activeButton ? activeButton.dataset.value : 'none';
    const mapBounds = state.map.getBounds();
    const visibleMarkers = [], visiblePricesForScale = [];
    state.currentPriceScale.length = 0;
    state.visibleCheapestPetrolStation = null;
    state.visibleCheapestDieselStation = null;
    state.visibleCheapestPetrolPrice = Infinity;
    state.visibleCheapestDieselPrice = Infinity;
    state.visibleHighestPetrolPrice = 0;
    state.visibleHighestDieselPrice = 0;
    Object.values(state.brandMarkerClusters).forEach(clusterGroup => {
        if (state.map.hasLayer(clusterGroup)) {
            clusterGroup.eachLayer(marker => {
                const stationData = marker.stationData;
                if (stationData && mapBounds.contains(L.latLng(stationData.lat, stationData.lon))) {
                    visibleMarkers.push(marker);
                    const petrolPrice = getStationPrice(stationData, config.STANDARD_PETROL_CODE);
                    if (petrolPrice !== null) { if (petrolPrice < state.visibleCheapestPetrolPrice) { state.visibleCheapestPetrolPrice = petrolPrice; state.visibleCheapestPetrolStation = stationData; } if (petrolPrice > state.visibleHighestPetrolPrice) { state.visibleHighestPetrolPrice = petrolPrice; } }
                    const dieselPrice = getStationPrice(stationData, config.STANDARD_DIESEL_CODE);
                    if (dieselPrice !== null) { if (dieselPrice < state.visibleCheapestDieselPrice) { state.visibleCheapestDieselPrice = dieselPrice; state.visibleCheapestDieselStation = stationData; } if (dieselPrice > state.visibleHighestDieselPrice) { state.visibleHighestDieselPrice = dieselPrice; } }
                    if (selectedFuelForColor !== 'none') { const price = getStationPrice(stationData, selectedFuelForColor); if (price !== null && !isNaN(price)) visiblePricesForScale.push(price); }
                }
            });
        }
    });
    
    if (selectedFuelForColor !== 'none' && visiblePricesForScale.length > 0) {
        const minPrice = Math.min(...visiblePricesForScale), maxPrice = Math.max(...visiblePricesForScale);
        if (minPrice === maxPrice) {
            state.currentPriceScale.push({ limit: minPrice, color: config.PRICE_BIN_COLORS[2] });
        } else {
            const step = (maxPrice - minPrice) / config.NUM_PRICE_BINS;
            for (let i = 0; i < config.NUM_PRICE_BINS; i++) {
                state.currentPriceScale.push({ limit: minPrice + step * (i + 1), color: config.PRICE_BIN_COLORS[i] });
            }
        }
    }
    updateMarkersUI(selectedFuelForColor, visibleMarkers);
    updatePriceLegendUI(selectedFuelForColor);
    updateHeaderSummary();
    updateCheapestStationsLegend();
}

function updateMarkersUI(fuelCodeForColoring, visibleMarkers) {
    visibleMarkers.forEach(marker => {
        const stationData = marker.stationData;
        if (!stationData) return;
        const isCheapestP = state.visibleCheapestPetrolStation && stationData.site_id === state.visibleCheapestPetrolStation.site_id && stationData.sourceName === state.visibleCheapestPetrolStation.sourceName;
        const isCheapestD = state.visibleCheapestDieselStation && stationData.site_id === state.visibleCheapestDieselStation.site_id && stationData.sourceName === state.visibleCheapestDieselStation.sourceName;
        
        let iconColor = null;
        let onMapPriceText = null;

        if (fuelCodeForColoring !== 'none') {
            const price = getStationPrice(stationData, fuelCodeForColoring);
            if (price !== null) {
                onMapPriceText = formatOnMapPrice(price);
                if (state.currentPriceScale.length > 0) {
                    iconColor = state.currentPriceScale[state.currentPriceScale.length - 1].color;
                    for (const bin of state.currentPriceScale) {
                        if (price <= bin.limit) { iconColor = bin.color; break; }
                    }
                }
            }
        }
        
        const unleadedPrice = getStationPrice(stationData, config.STANDARD_PETROL_CODE);
        const unleadedPriceText = formatPriceAsPounds(unleadedPrice);
        const dieselPrice = getStationPrice(stationData, config.STANDARD_DIESEL_CODE);
        const dieselPriceText = formatPriceAsPounds(dieselPrice);
        const updateTimeText = formatTooltipTime(stationData.lastUpdated);

        const tooltipContent = `<div class="tooltip-brand">${stationData.displayBrand}</div><table class="tooltip-table"><tr><td class="tooltip-label">Unleaded:</td><td class="tooltip-value">${unleadedPriceText}</td></tr><tr><td class="tooltip-label">Diesel:</td><td class="tooltip-value">${dieselPriceText}</td></tr><tr><td class="tooltip-label tooltip-updated">Updated:</td><td class="tooltip-value tooltip-updated">${updateTimeText || 'N/A'}</td></tr></table>`;
        
        marker.setTooltipContent(tooltipContent);
        marker.setIcon(createFlagIcon(isCheapestP, isCheapestD, iconColor, onMapPriceText));
    });
}

function updatePriceLegendUI(selectedFuelCode) {
    if (state.priceLegend) { state.map.removeControl(state.priceLegend); state.priceLegend = null; }
    if (selectedFuelCode === 'none' || state.currentPriceScale.length === 0) return;
    state.priceLegend = L.control({ position: 'bottomright' });
    state.priceLegend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = `<h4>${config.FUEL_TYPE_DESCRIPTIONS[selectedFuelCode.toUpperCase().trim()] || selectedFuelCode} Price</h4>`;
        state.currentPriceScale.forEach((bin, index) => {
            const lowerBound = (index === 0 || state.currentPriceScale.length === 1) ? 0 : state.currentPriceScale[index-1].limit;
            let rangeText;
            if (state.currentPriceScale.length === 1) {
                rangeText = formatPriceAsPounds(bin.limit);
            } else if (index === 0) {
                rangeText = `≤ ${formatPriceAsPounds(bin.limit)}`;
            } else {
                rangeText = `> ${formatPriceAsPounds(lowerBound)} - ${formatPriceAsPounds(bin.limit)}`;
            }
            div.innerHTML += `<div class="legend-item"><i style="background:${bin.color}"></i><span class="legend-text">${rangeText}</span></div>`;
        });
        return div;
    };
    state.priceLegend.addTo(state.map);
}

function updateHeaderSummary() {
    const summaryContainer = document.getElementById('header-summary');
    if (!summaryContainer) return;

    const activeButton = document.querySelector('#fuel-type-buttons .active');
    const selectedFuel = activeButton ? activeButton.dataset.value : 'none';
        
    let minPrice, maxPrice;
    const petrolTypes = ['E10', 'E5'];
    const dieselTypes = ['B7', 'SDV'];

    if (petrolTypes.includes(selectedFuel)) {
        minPrice = state.visibleCheapestPetrolPrice;
        maxPrice = state.visibleHighestPetrolPrice;
    } else if (dieselTypes.includes(selectedFuel)) {
        minPrice = state.visibleCheapestDieselPrice;
        maxPrice = state.visibleHighestDieselPrice;
    } else {
        summaryContainer.innerHTML = '';
        return;
    }

    const spread = maxPrice - minPrice;
    if (spread > 0 && isFinite(minPrice)) {
        const savings = (spread * 50) / 100;
        summaryContainer.innerHTML = `
            <div class="summary-savings">Save up to <strong>£${savings.toFixed(2)}</strong> on a 50L tank</div>
            <div class="summary-spread-container">
                <span>Visible Price Spread: </span>
                <span class="summary-spread-value">${formatPriceAsPounds(spread)}</span>
            </div>
        `;
    } else {
        summaryContainer.innerHTML = ''; // Clear summary if no spread
    }
}

function updateCheapestStationsLegend() {
    if (state.cheapestFlagLegend) { state.map.removeControl(state.cheapestFlagLegend); state.cheapestFlagLegend = null; }
    if (!state.visibleCheapestPetrolStation && !state.visibleCheapestDieselStation) return;

    state.cheapestFlagLegend = L.control({position: 'bottomleft'});
    state.cheapestFlagLegend.onAdd = function() {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>Cheapest (Visible)</h4>';
        if (state.visibleCheapestPetrolStation) div.innerHTML += `<div class="legend-item"><span class="flag-icon flag-petrol"></span><span class="legend-text">Cheapest Petrol @ ${formatPriceAsPounds(state.visibleCheapestPetrolPrice)}</span></div>`;
        if (state.visibleCheapestDieselStation) div.innerHTML += `<div class="legend-item"><span class="flag-icon flag-diesel"></span><span class="legend-text">Cheapest Diesel @ ${formatPriceAsPounds(state.visibleCheapestDieselPrice)}</span></div>`;
        return div;
    };
    state.cheapestFlagLegend.addTo(state.map);
}

export function createFilterControls() {
    const brandsListContainer = document.getElementById('filter-brands-list');
    if (!brandsListContainer) return;
    brandsListContainer.innerHTML = '';
    const sortedBrandNames = Array.from(state.allBrandNames).sort((a, b) => a.localeCompare(b));
    if (sortedBrandNames.length === 0) { 
        brandsListContainer.innerHTML = 'No brands found to filter.'; 
        return; 
    }
    sortedBrandNames.forEach(brand => {
        const checkboxId = `filter-${brand.replace(/[^a-zA-Z0-9-]/g, '-')}`;
        const label = document.createElement('label'); 
        label.htmlFor = checkboxId;
        const checkbox = document.createElement('input'); 
        checkbox.type = 'checkbox'; 
        checkbox.id = checkboxId; 
        checkbox.value = brand; 
        checkbox.checked = true;
        checkbox.addEventListener('change', handleFilterChange);
        label.appendChild(checkbox); 
        label.appendChild(document.createTextNode(brand));
        brandsListContainer.appendChild(label);
    });
}