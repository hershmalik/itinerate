// Log localStorage content at the VERY START of script execution
console.log("[second-page.js] SCRIPT EXECUTION STARTED. Reading localStorage immediately:");
console.log(`[second-page.js] Initial read - tripDestination: '${localStorage.getItem('tripDestination')}'`);
console.log(`[second-page.js] Initial read - tripDepartureDate: '${localStorage.getItem('tripDepartureDate')}'`);
console.log(`[second-page.js] Initial read - tripArrivalDate: '${localStorage.getItem('tripArrivalDate')}'`);
console.log(`[second-page.js] Initial read - tripPreferences: '${localStorage.getItem('tripPreferences')}'`);
console.log("All localStorage keys/values at script start:", {...localStorage});
// End of immediate localStorage check

console.log("[second-page.js] TOP OF FILE: tripDestination =", localStorage.getItem('tripDestination'));
window.addEventListener('DOMContentLoaded', () => {
  console.log("[second-page.js] DOMContentLoaded: tripDestination =", localStorage.getItem('tripDestination'));
});
window.addEventListener('load', () => {
  console.log("[second-page.js] window.load: tripDestination =", localStorage.getItem('tripDestination'));
});
window.addEventListener('storage', (e) => {
  console.log("[second-page.js] storage event fired!", e);
});

const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    console.warn(`[localStorage.setItem OVERRIDE] Key: ${key}, Value: ${value}`);
    originalSetItem.apply(this, arguments);
};

console.log("[second-page.js] Initializing second page...");

let map; // Make map globally accessible within this script
let geocoder; // Make geocoder globally accessible
let itineraryData = []; // Store itinerary data globally for map use

// Called by Google Maps API script load
async function initMapAndItinerary() {
    console.log("[second-page.js] Google Maps API loaded.");
    
    // Basic map initialization (will be centered later)
    const initialCenter = { lat: 0, lng: 0 }; 
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 10, // Adjust zoom as needed
        center: initialCenter,
        mapId: "ITINERARY_MAP" // Optional: Map ID for cloud styling
    });
    geocoder = new google.maps.Geocoder();
    
    console.log("[second-page.js] Map initialized.");

    // Now that map is ready, proceed with loading itinerary
    try {
        displayPreferences(); // Ensure this doesn't clear or interfere with tripDetails
        const tripDetails = getTripDetailsFromStorage(); // This is the critical call

        if (tripDetails) {
            console.log("[second-page.js] Successfully loaded trip details from storage:", tripDetails);
            const destinationElements = document.querySelectorAll("[id^='selected-destination']");
            destinationElements.forEach(element => {
                if (element) element.textContent = tripDetails.destination || "your destination";
            });
            await generateItinerary(); // Wait for itinerary generation
        } else {
            console.error("[second-page.js] getTripDetailsFromStorage returned null or undefined.");
            handleInitializationError("Could not load your trip details. Please go back and try again.");
        }
    } catch (error) {
        console.error("[second-page.js] Error initializing page:", error);
        handleInitializationError("An error occurred while loading the page.");
    }
}

function handleInitializationError(message) {
     console.error(message);
     const errorMessage = document.getElementById("error-message");
     if (errorMessage) {
         errorMessage.textContent = message;
         errorMessage.style.display = "block";
     }
     // Hide loading indicator if it was shown
     const loadingIndicator = document.getElementById("loading-indicator");
     if (loadingIndicator) loadingIndicator.style.display = "none";
}

// Display preferences from localStorage
function displayPreferences() {
    const preferencesList = document.getElementById("preferences-list");
    if (preferencesList) {
        const preferences = JSON.parse(localStorage.getItem("tripPreferences") || "[]"); // Changed "selectedPreferences" to "tripPreferences"
        if (preferences.length === 0) {
            preferencesList.innerHTML = "<li>No preferences selected</li>";
        } else {
            preferencesList.innerHTML = preferences
                .map(pref => `<li class="preference-item">${pref}</li>`) // Added class for potential styling
                .join("");
        }
    }
}

// Fetch itinerary data from server
async function generateItinerary() {
    const loadingIndicator = document.getElementById("loading-indicator");
    const errorMessageDiv = document.getElementById("error-message");
    const itineraryTableBody = document.querySelector("#itinerary-table tbody");
    const itineraryDisplayDiv = document.getElementById("itinerary-display"); 
    const mapContainer = document.getElementById("map-container");

    try {
        // Hide content, show loading, clear previous errors/table
        if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "none"; // Hide table display
        if (mapContainer) mapContainer.style.display = "none";
        if (errorMessageDiv) errorMessageDiv.style.display = "none";
        if (loadingIndicator) loadingIndicator.style.display = "block";
        if (itineraryTableBody) itineraryTableBody.innerHTML = ""; 

        const tripDetails = getTripDetailsFromStorage();
        if (!tripDetails || !tripDetails.destination || !tripDetails.departureDate || !tripDetails.arrivalDate) {
            throw new Error("Missing destination or dates for generating itinerary.");
        }
        
        const { destination, preferences, departureDate, arrivalDate } = tripDetails;
        console.log("Generating itinerary for:", destination, preferences, departureDate, arrivalDate);
        
        const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:9876' 
            : '';
        const apiUrl = `${baseUrl}/generate-itinerary?destination=${encodeURIComponent(destination)}&preferences=${encodeURIComponent(JSON.stringify(preferences || []))}&departureDate=${encodeURIComponent(departureDate)}&arrivalDate=${encodeURIComponent(arrivalDate)}`;
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            let errorBody = "API request failed";
            try { errorBody = await response.text(); } catch (e) {}
            throw new Error(`API error: ${response.status} - ${response.statusText}. Details: ${errorBody}`);
        }

        const data = await response.json();
        itineraryData = data.itinerary || [];

        document.querySelectorAll("[id^='selected-destination']").forEach(el => {
            if (el) el.textContent = destination;
        });
        
        if (itineraryData.length > 0) {
            populateItineraryTable(itineraryData);
            if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "block"; // Show table display
            await displayMapAndMarkers(itineraryData); 
            if (mapContainer) mapContainer.style.display = "block";
        } else {
            if (itineraryTableBody) itineraryTableBody.innerHTML = '<tr><td colspan="3">No itinerary details were generated.</td></tr>'; // Colspan is 3
            if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "block"; // Show table display even for "no details" message
            if (mapContainer) mapContainer.style.display = "none"; 
        }
        
    } catch (error) {
        console.error("Error generating itinerary:", error);
        if (errorMessageDiv) {
            errorMessageDiv.textContent = `Failed to generate itinerary: ${error.message}`;
            errorMessageDiv.style.display = "block";
        }
        if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "none"; // Hide table on error
        if (mapContainer) mapContainer.style.display = "none";
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = "none";
    }
}

function populateItineraryTable(itineraryItems) {
    const itineraryTableBody = document.querySelector("#itinerary-table tbody");
    if (!itineraryTableBody) return;
    itineraryTableBody.innerHTML = ""; 

    // Group by day first
    const groupedByDay = itineraryItems.reduce((acc, item) => {
        const day = item.day || "Unspecified Day";
        if (!acc[day]) {
            acc[day] = [];
        }
        acc[day].push(item);
        return acc;
    }, {});

    Object.keys(groupedByDay).forEach(day => {
        // Add a header row for the day
        const dayHeaderRow = itineraryTableBody.insertRow();
        dayHeaderRow.classList.add('day-header-row'); // Add a class for styling if needed
        const dayCell = dayHeaderRow.insertCell();
        dayCell.colSpan = 3; // Span across all columns
        dayCell.textContent = day;
        dayCell.style.textAlign = "center"; // Center the day header
        dayCell.style.backgroundColor = "#e8f0fe"; // Style for day header
        dayCell.style.fontWeight = "bold";
        dayCell.style.padding = "10px";

        groupedByDay[day].forEach(item => {
            const row = itineraryTableBody.insertRow();
            row.insertCell().textContent = item.time || "N/A";
            row.insertCell().textContent = item.activity || "N/A";
            row.insertCell().textContent = item.location || "N/A"; // Assuming 'location' is the detailed location string
        });
    });
}

// --- ADDED: Map Functions ---
async function displayMapAndMarkers(items) {
    if (!map || !geocoder) {
        console.error("Map or Geocoder not initialized.");
        return;
    }

    const bounds = new google.maps.LatLngBounds();
    let locationsFound = 0;
    const markerPromises = []; // Store promises for marker creation

    // Use Advanced Markers (requires marker library)
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    items.forEach((item, index) => {
        if (item.location && item.location.trim() !== "") {
            const markerPromise = geocodeLocation(item.location)
                .then(results => {
                    if (results && results.length > 0) {
                        const location = results[0].geometry.location;
                        const position = { lat: location.lat(), lng: location.lng() };
                        
                        console.log(`Geocoded '${item.location}' to`, position);
                        locationsFound++;
                        bounds.extend(position); // Extend map bounds

                        // Create marker
                        const marker = new AdvancedMarkerElement({
                            map: map,
                            position: position,
                            title: `${item.activity}\n${item.location}`, // Tooltip on hover
                            // Use index + 1 for label (A, B, C...) - requires converting number to letter
                            // content: buildMarkerContent(index + 1) // Optional: Custom marker appearance
                        });

                        // Optional: Add info window on click
                        const infoWindow = new google.maps.InfoWindow({
                             content: `<b>${item.activity}</b><br>${item.location}<br><i>${item.time || ''} (${item.day || ''})</i>`
                        });
                        marker.addListener('click', () => {
                             infoWindow.open(map, marker);
                        });

                    } else {
                        console.warn(`Geocoding failed for location: ${item.location}`);
                    }
                })
                .catch(error => {
                    console.error(`Geocoding error for ${item.location}:`, error);
                });
            markerPromises.push(markerPromise);
        }
    });

    // Wait for all geocoding and marker creations to attempt completion
    await Promise.allSettled(markerPromises); 

    console.log(`Found ${locationsFound} geocodable locations.`);

    // Adjust map view
    if (locationsFound > 0) {
        map.fitBounds(bounds);
        // Prevent over-zooming if only one point
        if (locationsFound === 1) {
            map.setZoom(14); // Or your preferred zoom level
        }
    } else {
        // If no locations found, center on destination roughly (or keep default)
        console.log("No locations found to display on map.");
         map.setCenter({ lat: 0, lng: 0 });
         map.setZoom(2);
    }
}

// Helper function to geocode a location string
function geocodeLocation(address) {
    return new Promise((resolve, reject) => {
        if (!geocoder) return reject("Geocoder not initialized");
        geocoder.geocode({ 'address': address }, (results, status) => {
            if (status === 'OK') {
                resolve(results);
            } else if (status === google.maps.GeocoderStatus.ZERO_RESULTS) {
                 resolve(null); // No results found is not necessarily an error here
            } else {
                reject(new Error(`Geocode was not successful for the following reason: ${status}`));
            }
        });
    });
}

// Optional: Helper to create custom marker content (e.g., A, B, C)
/*
function buildMarkerContent(labelIndex) {
    const markerElement = document.createElement('div');
    markerElement.style.width = '25px';
    markerElement.style.height = '25px';
    markerElement.style.borderRadius = '50%';
    markerElement.style.backgroundColor = '#FF4C4C'; // Brand color
    markerElement.style.color = 'white';
    markerElement.style.display = 'flex';
    markerElement.style.justifyContent = 'center';
    markerElement.style.alignItems = 'center';
    markerElement.style.fontWeight = 'bold';
    markerElement.textContent = String.fromCharCode(64 + labelIndex); // A=65, B=66...
    return markerElement;
}
*/
// --- END ADDED ---

function getTripDetailsFromStorage() {
    console.log('[second-page.js] Attempting to get trip details from localStorage...');
    try {
        const destination = localStorage.getItem('tripDestination');
        const departureDate = localStorage.getItem('tripDepartureDate');
        const arrivalDate = localStorage.getItem('tripArrivalDate');
        const preferencesJson = localStorage.getItem('tripPreferences');
        
        console.log(`[second-page.js] Retrieved directly from localStorage:`);
        console.log(`[second-page.js] Destination: '${destination}' (Type: ${typeof destination})`);
        console.log(`[second-page.js] Departure Date: '${departureDate}' (Type: ${typeof departureDate})`);
        console.log(`[second-page.js] Arrival Date: '${arrivalDate}' (Type: ${typeof arrivalDate})`);
        console.log(`[second-page.js] Preferences JSON: '${preferencesJson}' (Type: ${typeof preferencesJson})`);

        const preferences = preferencesJson ? JSON.parse(preferencesJson) : [];

        // Check if any of the crucial string values are null, undefined, or empty strings
        if (destination === "null" || departureDate === "null" || arrivalDate === "null") {
            console.warn("[second-page.js] One or more values in localStorage are the string 'null'.");
            return null;
        }

        if (destination && destination.trim() !== "" && 
            departureDate && departureDate.trim() !== "" && 
            arrivalDate && arrivalDate.trim() !== "") {
            console.log('[second-page.js] All required details (destination, departureDate, arrivalDate) are present and non-empty.');
            return {
                destination,
                departureDate,
                arrivalDate,
                preferences
            };
        }
        console.warn('[second-page.js] Validation FAILED in getTripDetailsFromStorage: One or more required details (destination, departureDate, arrivalDate) are missing or empty from localStorage.');
        if (!destination || destination.trim() === "") console.warn("[second-page.js] Destination is missing or empty.");
        if (!departureDate || departureDate.trim() === "") console.warn("[second-page.js] Departure Date is missing or empty.");
        if (!arrivalDate || arrivalDate.trim() === "") console.warn("[second-page.js] Arrival Date is missing or empty.");
        return null;
    } catch (e) {
        console.error("[second-page.js] Error in getTripDetailsFromStorage (e.g., parsing preferences):", e);
        return null;
    }
}


