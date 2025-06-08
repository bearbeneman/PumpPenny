/* =========== FILE: script.js =========== */
// --- Configuration ---
const parseLonLatLocation = (location) => {
    if (location && typeof location.longitude === 'number' && typeof location.latitude === 'number') {
        return { latitude: location.latitude, longitude: location.longitude };
    }
    if (location && typeof location.longitude === 'string' && typeof location.latitude === 'string') {
        return { latitude: parseFloat(location.latitude), longitude: parseFloat(location.longitude) };
    }
    return null;
};

const FUEL_TYPE_DESCRIPTIONS = {
    "E5": "Premium Unleaded (E5)", "E10": "Unleaded (E10)", "B7": "Diesel (B7)",
    "SDV": "Super Diesel", "UNL": "Unleaded", "DSL": "Diesel", "PUL": "Premium Unleaded",
    "SUL": "Super Unleaded", "PDL": "Premium Diesel",
};

const STANDARD_PETROL_CODE = "E10", ALT_STANDARD_PETROL_CODES = ["UNL"];
const STANDARD_DIESEL_CODE = "B7", ALT_STANDARD_DIESEL_CODES = ["DSL"];

const DATA_SOURCES = [
    { name: "Shell", url: "https://www.shell.co.uk/fuel-prices-data.html" },
    { name: "AppleGreen", url: "https://applegreenstores.com/fuel-prices/data.json" },
    { name: "AsconaGroup", url: "https://fuelprices.asconagroup.co.uk/newfuel.json" },
    { name: "Asda", url: "https://storelocator.asda.com/fuel_prices_data.json" },
    { name: "BP", url: "https://www.bp.com/en_gb/united-kingdom/home/fuelprices/fuel_prices_data.json" },
    { name: "Esso", url: "https://fuelprices.esso.co.uk/latestdata.json" },
    { name: "JET", url: "https://jetlocal.co.uk/fuel_prices_data.json" },
    { name: "Morrisons", url: "https://www.morrisons.com/fuel-prices/fuel.json", locationParser: parseLonLatLocation },
    { name: "MotoWay", url: "https://moto-way.com/fuel-price/fuel_prices.json" },
    { name: "MotorFuelGroup", url: "https://fuel.motorfuelgroup.com/fuel_prices_data.json" },
    { name: "Rontec", url: "https://www.rontec-servicestations.co.uk/fuel-prices/data/fuel_prices_data.json", locationParser: parseLonLatLocation },
    { name: "Sainsbury's", url: "https://api.sainsburys.co.uk/v1/exports/latest/fuel_prices_data.json" },
    { name: "SGN Retail", url: "https://www.sgnretail.uk/files/data/SGN_daily_fuel_prices.json", locationParser: parseLonLatLocation },
    { name: "Tesco", url: "https://www.tesco.com/fuel_prices/fuel_prices_data.json" }
];
const UK_CENTER = [54.5, -2.5], INITIAL_UK_ZOOM = 6, MAX_ZOOM = 18;
const DISABLE_CLUSTERING_ZOOM = 10;
const NUM_PRICE_BINS = 5;
const PRICE_BIN_COLORS = ['#2ECC40', '#7FDBFF', '#FFDC00', '#FFA500', '#FF4136']; // Green, Aqua, Yellow, Orange, Red

// --- DOM Elements & Global Vars ---
const mapElement = document.getElementById('map');
const fuelTypeColorSelect = document.getElementById('fuel-type-color');
let map, allStationsData = [], priceLegend = null, cheapestFlagLegend = null,
    currentPriceScale = [];
let visibleCheapestPetrolStation = null, visibleCheapestDieselStation = null;
let visibleCheapestPetrolPrice = Infinity, visibleCheapestDieselPrice = Infinity;
const brandMarkerClusters = {}, allBrandNames = new Set();
let filterOverlay, filterPanel;

// --- Marker Icons ---
function createFlagIcon(isCheapestPetrol, isCheapestDiesel, color = null) {
    let htmlContent = '';
    // --- MODIFIED: All icons now have the same size and anchor points ---
    const iconOptions = {
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        className: 'leaflet-div-icon'
    };
    let flagHtml = '';

    // Determine flag HTML and add classes for positioning
    if (isCheapestPetrol && isCheapestDiesel) {
        flagHtml = `<div class="icon-flag-diesel">D</div><div class="icon-flag-petrol">P</div>`;
        iconOptions.className += ' cheapest-both-icon';
    } else if (isCheapestPetrol) {
        flagHtml = `<div class="icon-flag">P</div>`;
        iconOptions.className += ' cheapest-petrol-icon';
    } else if (isCheapestDiesel) {
        flagHtml = `<div class="icon-flag">D</div>`;
        iconOptions.className += ' cheapest-diesel-icon';
    }

    // --- MODIFIED: Generate SVG for colored markers ---
    if (color) {
        // SVG path for the standard Leaflet marker shape
        const markerSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
                <path fill-rule="evenodd" clip-rule="evenodd"
                    d="M12.5 0C5.596 0 0 5.596 0 12.5C0 19.404 12.5 41 12.5 41S25 19.404 25 12.5C25 5.596 19.404 0 12.5 0z"
                    fill="${color}" stroke="#555" stroke-width="0.5">
                </path>
            </svg>`;
        htmlContent = `<div style="position:relative;">${markerSvg}${flagHtml}</div>`;
        iconOptions.className += ' price-colored-marker-icon';
        // No separate shadow image needed; handled by CSS filter
    } else { // Default marker image
        htmlContent = `<div style="position:relative;"><img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" />${flagHtml}</div>`;
        iconOptions.shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
        iconOptions.shadowSize = [41, 41];
        iconOptions.shadowAnchor = [12, 41];
    }
    
    return L.divIcon({ html: htmlContent, ...iconOptions });
}


// --- Initialize Map & UI ---
function initializeMap(center, zoom) {
    try {
        map = L.map('map', { zoomControl: false }).setView(center, zoom);
        L.control.zoom({ position: 'topright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: MAX_ZOOM }).addTo(map);
        
        createFilterUI();

        map.on('moveend', updateDynamicPriceScaleAndLegend);
        map.on('zoomend', updateDynamicPriceScaleAndLegend);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    map.setView([position.coords.latitude, position.coords.longitude], 10);
                    fetchAndProcessData();
                },
                (error) => {
                    console.warn("Geolocation error:", error.message);
                    map.setView(UK_CENTER, INITIAL_UK_ZOOM); fetchAndProcessData();
                }, { timeout: 8000, enableHighAccuracy: false }
            );
        } else {
            map.setView(UK_CENTER, INITIAL_UK_ZOOM); fetchAndProcessData();
        }
    } catch (error) {
        console.error("Critical error during map initialization:", error);
        if (mapElement) mapElement.innerHTML = "Error initializing map.";
    }
}

// --- Filter UI Creation (Unchanged) ---
function createFilterUI() {
    filterOverlay = L.DomUtil.create('div', 'hidden', document.body);
    filterOverlay.id = 'filter-overlay';
    
    filterPanel = L.DomUtil.create('div', 'hidden', document.body);
    filterPanel.id = 'filter-panel';
    
    filterPanel.innerHTML = `
        <div id="filter-panel-header">
            <span>Filter by Brand</span>
        </div>
        <div id="filter-panel-content">
            <div id="filter-brands-list"></div>
        </div>
        <div id="filter-panel-footer">
            <button id="close-filters-btn">Done</button>
        </div>
    `;

    const FilterControl = L.Control.extend({
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-filter');
            container.innerHTML = `<a href="#" title="Filter by Brand" role="button"></a>`;
            L.DomEvent.on(container, 'click', L.DomEvent.stop).on(container, 'click', toggleFilterPanel);
            return container;
        }
    });
    new FilterControl({ position: 'topright' }).addTo(map);
    
    const closeButton = filterPanel.querySelector('#close-filters-btn');
    L.DomEvent.on(closeButton, 'click', toggleFilterPanel);
    L.DomEvent.on(filterOverlay, 'click', toggleFilterPanel);
}

function toggleFilterPanel() {
    filterOverlay.classList.toggle('visible');
    filterPanel.classList.toggle('visible');
}

// --- Data Fetching & Processing (Unchanged) ---
async function fetchAndProcessData() {
    if (!map) { console.error("Map object is not available!"); return; }
    console.log("Fetching fuel price data...");
    allStationsData = [];
    Object.keys(brandMarkerClusters).forEach(brandName => {
        if (brandMarkerClusters[brandName]) map.removeLayer(brandMarkerClusters[brandName]);
        delete brandMarkerClusters[brandName];
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
        if (data && data.stations && Array.isArray(data.stations)) {
            data.stations.forEach(station => {
                const loc = (sourceConfig.locationParser) ? sourceConfig.locationParser(station.location) :
                    { latitude: parseFloat(station.location.latitude), longitude: parseFloat(station.location.longitude) };
                if (loc && !isNaN(loc.latitude) && !isNaN(loc.longitude) && (loc.latitude !== 0 || loc.longitude !== 0)) {
                    allStationsData.push({ ...station, sourceName: name, lat: loc.latitude, lon: loc.longitude });
                    totalStationsAddedToMap++;
                }
            });
        }
    }
    
    console.log(`Processing complete. Found ${totalStationsAddedToMap} stations.`);
    allStationsData.forEach(sData => addStationToCluster(sData));
    Object.values(brandMarkerClusters).forEach(clusterGroup => map.addLayer(clusterGroup));
    updateDynamicPriceScaleAndLegend();
    createFilterControls();
}

// --- Rest of the script is unchanged ---

function addStationToCluster(stationData) {
    let brand = (stationData.brand || stationData.sourceName || "Unknown Brand").trim();
    if (brand === "") brand = "Unknown Brand";
    allBrandNames.add(brand);

    let pricesHtml = "No price data available.";
    if (stationData.prices && Object.keys(stationData.prices).length > 0) {
        pricesHtml = Object.entries(stationData.prices).map(([code, price]) => {
            const name = FUEL_TYPE_DESCRIPTIONS[code.toUpperCase().trim()] || code.trim();
            const formatted = (price === null || isNaN(parseFloat(price))) ? 'N/A' : (price < 10 ? '£'+parseFloat(price).toFixed(2) : parseFloat(price).toFixed(1)+'p');
            return `<div class="fuel-price"><span class="fuel-name">${name}</span>: ${formatted}</div>`;
        }).join('');
    }
    const popupContent = `<strong>${stationData.address || "N/A"}</strong><div class="brand-name">${brand} - ${stationData.postcode || "N/A"}</div><hr>${pricesHtml}`;
    
    const marker = L.marker([stationData.lat, stationData.lon], { icon: createFlagIcon(false, false, null) });
    marker.bindPopup(popupContent);
    marker.bindTooltip(`<strong>${brand}</strong><br>${stationData.address || ''}`);
    marker.stationData = stationData;

    if (!brandMarkerClusters[brand]) {
        brandMarkerClusters[brand] = L.markerClusterGroup({
            chunkedLoading: true, maxClusterRadius: 60, disableClusteringAtZoom: DISABLE_CLUSTERING_ZOOM
        });
    }
    brandMarkerClusters[brand].addLayer(marker);
}

function getStationPrice(station, fuelCode, altFuelCodes = []) {
     if (station.prices) {
        const primaryPrice = station.prices[fuelCode.toUpperCase().trim()];
        if (primaryPrice !== undefined && primaryPrice !== null) return parseFloat(primaryPrice);
        for (const altCode of altFuelCodes) {
            const altPrice = station.prices[altCode.toUpperCase().trim()];
            if (altPrice !== undefined && altPrice !== null) return parseFloat(altPrice);
        }
    }
    return null;
}

function updateDynamicPriceScaleAndLegend() {
    if (!map || allStationsData.length === 0) return;
    const selectedFuelForColor = fuelTypeColorSelect.value;
    const mapBounds = map.getBounds();
    const visibleMarkers = [], visiblePricesForScale = [];
    currentPriceScale = [];
    visibleCheapestPetrolStation = null; visibleCheapestDieselStation = null;
    visibleCheapestPetrolPrice = Infinity; visibleCheapestDieselPrice = Infinity;

    Object.values(brandMarkerClusters).forEach(clusterGroup => {
        if (map.hasLayer(clusterGroup)) {
            clusterGroup.eachLayer(marker => {
                const stationData = marker.stationData;
                if (stationData && mapBounds.contains(L.latLng(stationData.lat, stationData.lon))) {
                    visibleMarkers.push(marker);
                    const petrolPrice = getStationPrice(stationData, STANDARD_PETROL_CODE, ALT_STANDARD_PETROL_CODES);
                    if (petrolPrice !== null && petrolPrice < visibleCheapestPetrolPrice) {
                        visibleCheapestPetrolPrice = petrolPrice; visibleCheapestPetrolStation = stationData;
                    }
                    const dieselPrice = getStationPrice(stationData, STANDARD_DIESEL_CODE, ALT_STANDARD_DIESEL_CODES);
                    if (dieselPrice !== null && dieselPrice < visibleCheapestDieselPrice) {
                        visibleCheapestDieselPrice = dieselPrice; visibleCheapestDieselStation = stationData;
                    }
                    if (selectedFuelForColor !== 'none') {
                        const price = getStationPrice(stationData, selectedFuelForColor);
                        if (price !== null && !isNaN(price)) visiblePricesForScale.push(price);
                    }
                }
            });
        }
    });
    
    if (selectedFuelForColor !== 'none' && visiblePricesForScale.length > 0) {
        const minPrice = Math.min(...visiblePricesForScale), maxPrice = Math.max(...visiblePricesForScale);
        if (minPrice === maxPrice) {
            currentPriceScale = [{ limit: minPrice, color: PRICE_BIN_COLORS[2] }];
        } else {
            const step = (maxPrice - minPrice) / NUM_PRICE_BINS;
            for (let i = 0; i < NUM_PRICE_BINS; i++) {
                currentPriceScale.push({ limit: minPrice + step * (i + 1), color: PRICE_BIN_COLORS[i] });
            }
        }
    }
    
    updateMarkersUI(selectedFuelForColor, visibleMarkers);
    updatePriceLegendUI(selectedFuelForColor);
    updateCheapestFlagLegend();
}

function updateMarkersUI(fuelCodeForColoring, visibleMarkers) {
    visibleMarkers.forEach(marker => {
        const stationData = marker.stationData;
        if (!stationData) return;
        const isCheapestP = visibleCheapestPetrolStation && stationData.site_id === visibleCheapestPetrolStation.site_id && stationData.sourceName === visibleCheapestPetrolStation.sourceName;
        const isCheapestD = visibleCheapestDieselStation && stationData.site_id === visibleCheapestDieselStation.site_id && stationData.sourceName === visibleCheapestDieselStation.sourceName;
        let iconColor = null;
        if (fuelCodeForColoring !== 'none' && currentPriceScale.length > 0) {
            const price = getStationPrice(stationData, fuelCodeForColoring);
            if (price !== null) {
                iconColor = currentPriceScale[currentPriceScale.length - 1].color;
                for (const bin of currentPriceScale) {
                    if (price <= bin.limit) { iconColor = bin.color; break; }
                }
            }
        }
        marker.setIcon(createFlagIcon(isCheapestP, isCheapestD, iconColor));
    });
}
function updatePriceLegendUI(selectedFuelCode) {
    if (priceLegend) { map.removeControl(priceLegend); priceLegend = null; }
    if (selectedFuelCode === 'none' || currentPriceScale.length === 0) return;
    priceLegend = L.control({ position: 'bottomright' });
    priceLegend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        const fuelDesc = FUEL_TYPE_DESCRIPTIONS[selectedFuelCode.toUpperCase().trim()] || selectedFuelCode;
        div.innerHTML = `<h4>${fuelDesc} Price</h4>`;
        currentPriceScale.forEach((bin, index) => {
            const lowerBound = (index === 0 || currentPriceScale.length === 1) ? 0 : currentPriceScale[index-1].limit;
            let rangeText = (currentPriceScale.length === 1) ? `${bin.limit.toFixed(1)}p`
                : (index === 0) ? `≤ ${bin.limit.toFixed(1)}p`
                : `> ${lowerBound.toFixed(1)}p - ${bin.limit.toFixed(1)}p`;
            div.innerHTML += `<div class="legend-item"><i style="background:${bin.color}"></i><span class="legend-text">${rangeText}</span></div>`;
        });
        return div;
    };
    priceLegend.addTo(map);
}
function updateCheapestFlagLegend() {
    if (cheapestFlagLegend) { map.removeControl(cheapestFlagLegend); cheapestFlagLegend = null; }
    if (visibleCheapestPetrolStation || visibleCheapestDieselStation) {
        cheapestFlagLegend = L.control({position: 'bottomleft'});
        cheapestFlagLegend.onAdd = function() {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = '<h4>Cheapest (Visible)</h4>';
            if (visibleCheapestPetrolStation) div.innerHTML += `<div class="legend-item"><span class="flag-icon flag-petrol">P</span><span class="legend-text">Petrol @ ${visibleCheapestPetrolPrice.toFixed(1)}p</span></div>`;
            if (visibleCheapestDieselStation) div.innerHTML += `<div class="legend-item"><span class="flag-icon flag-diesel">D</span><span class="legend-text">Diesel @ ${visibleCheapestDieselPrice.toFixed(1)}p</span></div>`;
            return div;
        };
        cheapestFlagLegend.addTo(map);
    }
}

function createFilterControls() {
    const brandsListContainer = document.getElementById('filter-brands-list');
    if (!brandsListContainer) return;
    brandsListContainer.innerHTML = '';
    const sortedBrandNames = Array.from(allBrandNames).sort((a, b) => a.localeCompare(b));
    if (sortedBrandNames.length === 0) { 
        brandsListContainer.innerHTML = 'No brands found to filter.';
        return;
    }
    sortedBrandNames.forEach(brand => {
        const checkboxId = `filter-${brand.replace(/[^a-zA-Z0-9-]/g, '-')}`;
        const label = document.createElement('label');
        label.htmlFor = checkboxId;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.id = checkboxId; checkbox.value = brand; checkbox.checked = true;
        checkbox.addEventListener('change', handleFilterChange);
        label.appendChild(checkbox); label.appendChild(document.createTextNode(brand));
        brandsListContainer.appendChild(label);
    });
}

function handleFilterChange(event) {
    const brand = event.target.value;
    const isChecked = event.target.checked;
    if (brandMarkerClusters[brand]) {
        if (isChecked) map.addLayer(brandMarkerClusters[brand]);
        else map.removeLayer(brandMarkerClusters[brand]);
    }
    updateDynamicPriceScaleAndLegend();
}

function parseUkDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (parts) return new Date(parts[3], parts[2] - 1, parts[1]);
    return null;
}

fuelTypeColorSelect.addEventListener('change', updateDynamicPriceScaleAndLegend);
document.addEventListener('DOMContentLoaded', () => initializeMap(UK_CENTER, INITIAL_UK_ZOOM));