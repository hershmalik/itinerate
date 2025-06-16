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
  
  // Handle examples dropdown toggle
  const examplesToggle = document.querySelector('.examples-toggle');
  const examplesContent = document.querySelector('.examples-content');
  
  if (examplesToggle && examplesContent) {
    examplesToggle.addEventListener('click', function() {
      examplesContent.classList.toggle('visible');
      examplesToggle.textContent = examplesContent.classList.contains('visible') ? 'Hide examples ▴' : 'See examples ▾';
    });
  }
  
  // Handle slider inputs on second page
  const sliders = document.querySelectorAll('.preference-slider');
  sliders.forEach(slider => {
    slider.addEventListener('input', function() {
      const value = parseInt(this.value);
      const minValue = this.dataset.min;
      const maxValue = this.dataset.max;
      
      // Remove any previous selections for this pair
      if (minValue) {
        const minCheckbox = document.querySelector(`input[name="advanced-prefs-second"][value="${minValue}"]`);
        if (minCheckbox) minCheckbox.checked = false;
      }
      
      if (maxValue) {
        const maxCheckbox = document.querySelector(`input[name="advanced-prefs-second"][value="${maxValue}"]`);
        if (maxCheckbox) maxCheckbox.checked = false;
      }
      
      // Set the appropriate checkbox based on the slider value
      if (value === 1 && minValue) {
        const minCheckbox = document.querySelector(`input[name="advanced-prefs-second"][value="${minValue}"]`);
        if (minCheckbox) minCheckbox.checked = true;
      } else if (value === 5 && maxValue) {
        const maxCheckbox = document.querySelector(`input[name="advanced-prefs-second"][value="${maxValue}"]`);
        if (maxCheckbox) maxCheckbox.checked = true;
      }
    });
  });
  
  // Initialize advanced preferences from localStorage (if they exist)
  const storedAdvancedPrefs = localStorage.getItem('advancedPreferences');
  if (storedAdvancedPrefs) {
    try {
      const advancedPrefs = JSON.parse(storedAdvancedPrefs);
      advancedPrefs.forEach(pref => {
        const checkbox = document.querySelector(`input[name="advanced-prefs-second"][value="${pref}"]`);
        if (checkbox) checkbox.checked = true;
        
        // Also update sliders if needed
        const minSlider = document.querySelector(`.preference-slider[data-min="${pref}"]`);
        if (minSlider) minSlider.value = 1;
        
        const maxSlider = document.querySelector(`.preference-slider[data-max="${pref}"]`);
        if (maxSlider) maxSlider.value = 5;
      });
    } catch (e) {
      console.error('Error parsing stored advanced preferences:', e);
    }
  }

  // Initialize collapse sections
  const collapseSections = document.querySelectorAll('.collapse-header');
  collapseSections.forEach(header => {
    const contentId = header.nextElementSibling.id;
    header.setAttribute('aria-controls', contentId);
    header.setAttribute('aria-expanded', 'false');
  });
 
  const toggleHours = document.getElementById('toggle-hours');
  if (toggleHours) {
    toggleHours.checked = false; // Off by default
    toggleHours.addEventListener('change', function(e) {
      const show = e.target.checked;
      document.querySelectorAll('#itinerary-table th:nth-child(5), #itinerary-table td:nth-child(5)').forEach(el => {
        el.style.display = show ? '' : 'none'; // Empty string reverts to default display (table-cell)
      });
    });
  }

  // ADD THIS NEW BLOCK FOR RATINGS TOGGLE
  const toggleRatings = document.getElementById('toggle-ratings');
  if (toggleRatings) {
    toggleRatings.checked = false; // Off by default
    toggleRatings.addEventListener('change', function(e) {
      const show = e.target.checked;
      // The Ratings column is the 4th column
      document.querySelectorAll('#itinerary-table th:nth-child(4), #itinerary-table td:nth-child(4)').forEach(el => {
        el.style.display = show ? '' : 'none';
      });
    });
  }
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
let currentMarkers = []; // Store all created markers
let dayPaths = []; // Store polylines for each day
let dayGroups = {}; // Store activities grouped by day
const markerData = new WeakMap(); // Store marker data that can't be directly attached
let weatherForecasts = []; // Store weather forecasts globally

// Replace the broken function with this fixed version
function getSeasonalWeatherData(location, month) {
  // Get hemisphere based on location (rough approximation)
  const isNorthernHemisphere = true; // Default to Northern hemisphere
  
  let season;
  if (isNorthernHemisphere) {
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'fall';
    else season = 'winter';
  } else {
    if (month >= 2 && month <= 4) season = 'fall';
    else if (month >= 5 && month <= 7) season = 'winter';
    else if (month >= 8 && month <= 10) season = 'spring';
    else season = 'summer';
  }
  
  // Seasonal patterns
  const seasonalPatterns = {
    spring: {
      highTemp: 68,
      lowTemp: 45,
      description: 'typical spring conditions',
      icon: '03d' // Partly cloudy icon
    },
    summer: {
      highTemp: 85,
      lowTemp: 65,
      description: 'typical summer conditions',
      icon: '01d' // Clear sky icon
    },
    fall: {
      highTemp: 65,
      lowTemp: 42,
      description: 'typical fall conditions',
      icon: '04d' // Cloudy icon
    },
    winter: {
      highTemp: 42,
      lowTemp: 28,
      description: 'typical winter conditions',
      icon: '13d' // Snow icon
    }
  };
  
  return seasonalPatterns[season];
}

// Replace the weather icon mapping function
function getWeatherIconClass(iconCode) {
  const iconMap = {
    '01d': 'wi wi-day-sunny',
    '01n': 'wi wi-night-clear',
    '02d': 'wi wi-day-cloudy',
    '02n': 'wi wi-night-alt-cloudy',
    '03d': 'wi wi-cloud',
    '03n': 'wi wi-cloud',
    '04d': 'wi wi-cloudy',
    '04n': 'wi wi-cloudy',
    '09d': 'wi wi-showers',
    '09n': 'wi wi-showers',
    '10d': 'wi wi-day-rain',
    '10n': 'wi wi-night-alt-rain',
    '11d': 'wi wi-thunderstorm',
    '11n': 'wi wi-thunderstorm',
    '13d': 'wi wi-snow',
    '13n': 'wi wi-snow',
    '50d': 'wi wi-fog',
    '50n': 'wi wi-fog'
  };
  
  return iconMap[iconCode] || 'wi wi-day-sunny';
}

// Update the createWeatherDisplay function

function createWeatherDisplay(forecast) {
  if (!forecast) return '';
  
  return `
    <div class="weather-display">
      <i class="${getWeatherIconClass(forecast.icon)}" aria-hidden="true"></i>
      <div class="weather-temps">
        ${Math.round(forecast.high)}°F / ${Math.round(forecast.low)}°F
      </div>
    </div>
  `;
}

// Fix the fetchWeatherData function
async function fetchWeatherData() {
  const weatherError = document.getElementById('weather-error');
  const weatherLoading = document.getElementById('weather-loading');

  try {
    // Show loading, hide errors
    if (weatherLoading) weatherLoading.style.display = 'block';
    if (weatherError) weatherError.style.display = 'none';

    // Get trip details from storage
    const tripDetails = getTripDetailsFromStorage();
    if (!tripDetails || !tripDetails.destination) {
      throw new Error('Destination information not available');
    }

    // Construct proper API URL
    let baseUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      baseUrl = 'http://localhost:5000'; // Change to match your new port
    } else {
      baseUrl = window.location.origin;
    }
    
    console.log(`Weather API URL: ${baseUrl}/api/weather?location=${encodeURIComponent(tripDetails.destination)}`);
    
    const response = await fetch(`${baseUrl}/api/weather?location=${encodeURIComponent(tripDetails.destination)}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Weather API error: ${response.status} - ${errorText}`);
    }

    // Check if response is HTML instead of JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.indexOf('text/html') !== -1) {
      throw new Error('Server returned HTML instead of JSON. API endpoint may be misconfigured.');
    }

    const data = await response.json();
    console.log("Weather data received:", data);
    
    // Parse trip dates
    const startDate = new Date(tripDetails.departureDate);
    const endDate = new Date(tripDetails.arrivalDate);
    
    const tripDurationMs = endDate.getTime() - startDate.getTime();
    const tripDays = Math.ceil(tripDurationMs / (1000 * 60 * 60 * 24)) + 1;
    
    // Extract forecast data into a map for easy lookup
    const forecastMap = {};
    if (data.forecast && Array.isArray(data.forecast)) {
      data.forecast.forEach(day => {
        forecastMap[day.date] = day;
      });
    }
    
    console.log("Forecast data mapped by date:", forecastMap);
    
    // Enhanced storage for both forecast and historical data
    const combinedWeatherData = [];
    
    // Get current date for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Iterate through each day of the trip
    for (let i = 0; i < tripDays; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      
      const dateString = currentDate.toISOString().split('T')[0]; 
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
      const formattedDate = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      console.log(`Processing date: ${dateString} (${dayName}, ${formattedDate})`);
      
      let weatherData;
      
      // Check if date is in the forecast range
      const daysDiff = Math.floor((currentDate - today) / (1000 * 60 * 60 * 24));
      const isWithinForecastRange = daysDiff >= 0 && daysDiff <= 5;
      
      console.log(`Day difference from today: ${daysDiff}, Within forecast range: ${isWithinForecastRange}`);
      
      // PRIORITY 1: Real forecast data from OpenWeatherMap API
      if (forecastMap[dateString]) {
        console.log(`Found forecast data for ${dateString}`);
        weatherData = forecastMap[dateString];
        weatherData.isHistorical = false;
        weatherData.source = "OpenWeatherMap Forecast";
      } 
      // PRIORITY 2: For dates within forecast range but not in our forecast, use approximation
      else if (isWithinForecastRange && Object.keys(forecastMap).length > 0) {
        const firstForecastDate = Object.keys(forecastMap)[0];
        console.log(`No exact match for ${dateString}, using nearest forecast from ${firstForecastDate}`);
        weatherData = {...forecastMap[firstForecastDate]};
        weatherData.date = dateString;
        weatherData.isHistorical = false;
        weatherData.source = "OpenWeatherMap Approximate";
      }
      // PRIORITY 3: Visual Crossing historical data for dates outside forecast range
      else {
        console.log(`Using historical data for ${dateString}`);
        weatherData = await fetchHistoricalWeather(tripDetails.destination, dateString);
      }
      
      // Store the weather data for this day
      if (weatherData) {
        weatherData.date = dateString;
        combinedWeatherData.push(weatherData);
        console.log(`Added weather data for ${dateString}:`, weatherData);
      }
    }
    
    // Store combined forecast data globally for itinerary table use
    window.weatherForecasts = combinedWeatherData;
    console.log("Final weather data:", combinedWeatherData);
    
    // If the itinerary is already loaded, refresh it with weather data
    if (itineraryData && itineraryData.length > 0) {
      populateItineraryTable(itineraryData);
    }

  } catch (error) {
    console.error('Error fetching weather data:', error);
    if (weatherError) {
      weatherError.textContent = `Could not load weather data: ${error.message}`;
      weatherError.style.display = 'block';
    }
  } finally {
    if (weatherLoading) weatherLoading.style.display = 'none';
  }
}

// Update fetchHistoricalWeather to handle HTML errors
async function fetchHistoricalWeather(location, date) {
  try {
    // PRIORITY 2: Visual Crossing API for historical data
    let baseUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      baseUrl = 'http://localhost:5000'; // Change to match your new port
    } else {
      baseUrl = window.location.origin;
    }
      
    console.log(`Fetching historical weather from Visual Crossing for ${location} on ${date}`);
    
    const response = await fetch(
      `${baseUrl}/api/historical-weather?location=${encodeURIComponent(location)}&date=${date}`
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Historical weather API error: ${response.status} - ${errorText}`);
    }
    
    // Check if response is HTML instead of JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.indexOf('text/html') !== -1) {
      throw new Error('Server returned HTML instead of JSON. API endpoint may be misconfigured.');
    }
    
    const data = await response.json();
    console.log(`Received Visual Crossing historical data for ${date}:`, data);
    
    return {
      high: data.high,
      low: data.low,
      description: data.description,
      icon: data.icon,
      isHistorical: true,
      source: "Visual Crossing Historical"
    };
  } catch (error) {
    console.error('Error fetching Visual Crossing historical weather data:', error);
    
    // PRIORITY 3: Fall back to seasonal patterns if API fails
    console.log(`Falling back to hardcoded seasonal data for ${location} on ${date}`);
    const month = new Date(date).getMonth();
    const seasonalData = getSeasonalWeatherData(location, month);
    
    return {
      high: seasonalData.highTemp,
      low: seasonalData.lowTemp,
      description: seasonalData.description,
      icon: seasonalData.icon,
      isHistorical: true,
      source: "Hardcoded Seasonal Fallback"
    };
  }
}

// Fix fetchPlaceDetails with better error handling
async function fetchPlaceDetails(activity, location) {
  try {
    // Construct proper API URL
    let baseUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      baseUrl = 'http://localhost:5000'; // Change to match your new port
    } else {
      baseUrl = window.location.origin;
    }
      
    console.log(`Fetching place details for: ${activity} at ${location}`);
    
    const response = await fetch(
      `${baseUrl}/api/place-details?name=${encodeURIComponent(activity)}&location=${encodeURIComponent(location)}`
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Place details API error: ${response.status} - ${errorText}`);
    }
    
    // Check if response is HTML instead of JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.indexOf('text/html') !== -1) {
      throw new Error('Server returned HTML instead of JSON. API endpoint may be misconfigured.');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching place details:', error);
    return { found: false };
  }
}

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
        displayPreferences();
        // Initialize preference toggles after displaying preferences
        initializePreferenceToggles();
        
        const tripDetails = getTripDetailsFromStorage();
        if (tripDetails) {
            document.querySelectorAll("[id^='selected-destination']").forEach(el => {
                el.textContent = tripDetails.destination;
            });
            await generateItinerary();
            await fetchWeatherData();
        } else {
            handleInitializationError("Trip details not found. Please return to the previous page and try again.");
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

// Replace the existing displayPreferences function
function displayPreferences() {
    const preferencesList = document.getElementById("preferences-list");
    if (preferencesList) {
        let preferences = [];
        
        // Try using the override first if available
        if (window.getTripDetailsFromStorageOverride) {
            const tripDetails = window.getTripDetailsFromStorageOverride();
            if (tripDetails && tripDetails.preferences) {
                preferences = tripDetails.preferences;
            }
        } else {
            const preferencesJson = localStorage.getItem('tripPreferences');
            if (preferencesJson) {
                try {
                    preferences = JSON.parse(preferencesJson);
                } catch (e) {
                    console.error("Error parsing preferences:", e);
                }
            }
        }
        
        console.log("Displaying preferences:", preferences);
        
        // Clear existing preferences
        preferencesList.innerHTML = "";
        
        if (preferences.length === 0) {
            const li = document.createElement("li");
            li.textContent = "No preferences selected";
            preferencesList.appendChild(li);
        } else {
            // Create a list item for each preference
            preferences.forEach(pref => {
                const li = document.createElement("li");
                // Capitalize first letter of preference
                const formattedPref = pref.charAt(0).toUpperCase() + pref.slice(1);
                li.textContent = formattedPref;
                preferencesList.appendChild(li);
            });
        }
        
        // Also update the toggle buttons
        document.querySelectorAll('.preference-toggle').forEach(toggle => {
            const preference = toggle.dataset.preference;
            if (preferences.includes(preference)) {
                toggle.classList.add('active');
            } else {
                toggle.classList.remove('active');
            }
        });
    }
}

// Add this function after displayPreferences()
function initializePreferenceToggles() {
    const toggles = document.querySelectorAll('.preference-toggle');
    const regenerateButton = document.getElementById('regenerate-itinerary');
    
    console.log("Found toggles:", toggles.length);
    
    // Get current preferences from storage
    const tripDetails = getTripDetailsFromStorage();
    const currentPreferences = tripDetails ? tripDetails.preferences || [] : [];
    
    console.log("Current preferences:", currentPreferences);
    
    // Set initial active state based on stored preferences
    toggles.forEach(toggle => {
        const preference = toggle.dataset.preference;
        if (currentPreferences.includes(preference)) {
            toggle.classList.add('active');
        }
        
        // Add click event listener with proper toggle behavior
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            this.classList.toggle('active');
            console.log(`Toggle ${preference}: ${this.classList.contains('active') ? 'active' : 'inactive'}`);
        });
    });
    
    // Add event listener for regenerate button
    if (regenerateButton) {
        regenerateButton.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("Regenerate button clicked");
            regenerateItineraryWithUpdatedPreferences();
        });
    } else {
        console.error("Regenerate button not found");
    }
}

// Fix the regenerateItineraryWithUpdatedPreferences function
async function regenerateItineraryWithUpdatedPreferences() {
  // Get current trip details
  const tripDetails = getTripDetailsFromStorage();
  if (!tripDetails) {
    alert("Could not retrieve trip details. Please try again.");
    return;
  }
  
  // Get selected preferences from toggle buttons
  const selectedPreferences = [];
  document.querySelectorAll('.preference-toggle.active').forEach(toggle => {
    selectedPreferences.push(toggle.dataset.preference);
  });
  
  // Get selected advanced preferences
  const advancedPreferences = [];
  document.querySelectorAll('input[name="advanced-prefs-second"]:checked').forEach((checkbox) => {
    advancedPreferences.push(checkbox.value);
  });
  
  // Get custom instructions
  const customInstructions = document.getElementById('custom-instructions').value.trim();
  
  // Debug logging
  console.log("Selected preferences for regeneration:", selectedPreferences);
  console.log("Advanced preferences for regeneration:", advancedPreferences);
  console.log("Custom instructions for regeneration:", customInstructions);
  
  // If no preferences selected, show an alert
  if (selectedPreferences.length === 0) {
    alert("Please select at least one preference before regenerating the itinerary.");
    return;
  }
  
  // Update tripDetails object with new preferences
  tripDetails.preferences = selectedPreferences;
  
  // Update localStorage with new preferences
  localStorage.setItem('tripPreferences', JSON.stringify(selectedPreferences));
  localStorage.setItem('advancedPreferences', JSON.stringify(advancedPreferences));
  console.log("Updated preferences in localStorage:", selectedPreferences);
  
  // Show loading state
  const loadingIndicator = document.getElementById("loading-indicator");
  const itineraryDisplayDiv = document.getElementById("itinerary-display");
  if (loadingIndicator) loadingIndicator.style.display = "flex";
  if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "none";
  
  try {
    // Store updated trip details for the API call
    window.getTripDetailsFromStorageOverride = function() {
      return {
        destination: tripDetails.destination,
        departureDate: tripDetails.departureDate,
        arrivalDate: tripDetails.arrivalDate,
        preferences: selectedPreferences,
        advancedPreferences: advancedPreferences,
        customInstructions: customInstructions
      };
    };
    
    // Call the generateItinerary function 
    await generateItinerary();
    
    // Update preference list display
    displayPreferences();
  } catch (error) {
    console.error("Error regenerating itinerary:", error);
    alert("Failed to regenerate itinerary. Please try again.");
  }
}

// Update the generateItinerary function to include custom instructions

async function generateItinerary() {
    const loadingIndicator = document.getElementById("loading-indicator");
    const errorMessageDiv = document.getElementById("error-message");
    const itineraryTableBody = document.querySelector("#itinerary-table tbody");
    const itineraryDisplayDiv = document.getElementById("itinerary-display");
    const mapContainer = document.getElementById("map-container");

    try {
        // Hide content, show loading
        if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "none";
        if (loadingIndicator) loadingIndicator.style.display = "flex";
        if (errorMessageDiv) errorMessageDiv.style.display = "none";

        // Get trip details from storage
        const tripDetails = getTripDetailsFromStorage();
        if (!tripDetails) {
            throw new Error("Trip details not found. Please return to the previous page and try again.");
        }

        // Get advanced preferences
        const advancedPreferences = tripDetails.advancedPreferences || 
            (localStorage.getItem('advancedPreferences') ? JSON.parse(localStorage.getItem('advancedPreferences')) : []);
        
        // Get custom instructions
        const customInstructions = tripDetails.customInstructions || 
            document.getElementById('custom-instructions')?.value?.trim() || "";
        
        // Log for debugging
        console.log(`Generating itinerary for: ${tripDetails.destination} ${tripDetails.preferences} ${tripDetails.departureDate} ${tripDetails.arrivalDate}`);
        console.log(`Advanced preferences: ${advancedPreferences}`);
        console.log(`Custom instructions: ${customInstructions}`);

        // Construct proper API URL
        let baseUrl;
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            baseUrl = 'http://localhost:5000'; // Change to match your new port
        } else {
            baseUrl = window.location.origin;
        }

        // Make the API request, including advanced preferences and custom instructions
        const response = await fetch(
            `${baseUrl}/generate-itinerary?destination=${encodeURIComponent(tripDetails.destination)}` +
            `&preferences=${encodeURIComponent(JSON.stringify(tripDetails.preferences))}` +
            `&departureDate=${encodeURIComponent(tripDetails.departureDate)}` +
            `&arrivalDate=${encodeURIComponent(tripDetails.arrivalDate)}` +
            `&advancedPreferences=${encodeURIComponent(JSON.stringify(advancedPreferences))}` +
            `&customInstructions=${encodeURIComponent(customInstructions)}`
        );

        if (!response.ok) {
            throw new Error(`Failed to generate itinerary. Server responded with ${response.status}: ${response.statusText}`);
        } 

        const data = await response.json();
        console.log("Received itinerary data from server:");
        console.log("Total items:", data.itinerary.length);
        console.log("Days covered:", new Set(data.itinerary.map(item => item.day)).size);
        console.log("Days are:", [...new Set(data.itinerary.map(item => item.day))]);

        // Store itinerary data globally
        itineraryData = data.itinerary;
        
        // Update destination header
        const destinationHeader = document.getElementById("selected-destination-header");
        if (destinationHeader) {
            destinationHeader.textContent = data.destination;
        }

        // Populate itinerary table and display
        await populateItineraryTable(data.itinerary);

        // Show itinerary display
        if (itineraryDisplayDiv) {
            itineraryDisplayDiv.style.display = "block";
        }

        // Populate day navigation
        populateDayNavigation();

        // Display map with markers for each location
        displayMapAndMarkers(data.itinerary);

        // Fetch place details for each location
        for (const item of data.itinerary) {
            fetchPlaceDetails(item.activity, item.location)
                .then(details => {
                    // Update the UI with place details
                    const activityRow = document.querySelector(`tr[data-activity="${item.activity}"]`);
                    if (activityRow) {
                        const ratingCell = activityRow.querySelector('.place-rating');
                        const hoursCell = activityRow.querySelector('.place-hours');
                        
                        if (ratingCell && details.found) {
                            // Update rating display
                            if (details.rating) {
                                const stars = '★'.repeat(Math.round(details.rating)) + '☆'.repeat(5 - Math.round(details.rating));
                                ratingCell.innerHTML = `
                                    <div class="stars">${stars}</div>
                                    <div class="rating-value">${details.rating}</div>
                                    <div class="rating-count">(${details.totalRatings} reviews)</div>
                                `;
                            }
                        }
                        
                        if (hoursCell && details.found) {
                            // Update hours display
                            if (details.hours) {
                                hoursCell.innerHTML = `
                                    <div class="${details.openNow ? 'open-now' : 'closed-now'}">
                                        ${details.openNow ? 'Open Now' : 'Closed Now'}
                                    </div>
                                `;
                                
                                if (details.url) {
                                    hoursCell.innerHTML += `
                                        <a href="${details.url}" target="_blank" class="google-maps-link">View on Google Maps</a>
                                    `;
                                }
                            }
                        }
                    }
                })
                .catch(err => console.error(`Error fetching details for ${item.activity}:`, err));
        }
        
    } catch (error) {
        console.error("Error generating itinerary:", error);
        if (errorMessageDiv) {
            errorMessageDiv.textContent = error.message || "Failed to generate itinerary. Please try again.";
            errorMessageDiv.style.display = "block";
        }
    } finally {
        if (loadingIndicator) {
            loadingIndicator.style.display = "none";
        }
    }
}

// Add this function after generateItinerary
function displayItinerarySummary(itineraryData) {
    const uniqueDays = [...new Set(itineraryData.map(item => item.day))];
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'itinerary-summary';
    summaryDiv.innerHTML = `
        <p>Your itinerary covers ${uniqueDays.length} days with ${itineraryData.length} activities</p>
        <div class="itinerary-days-list">
            ${uniqueDays.map(day => `<span class="day-chip">${day}</span>`).join('')}
        </div>
    `;
    
    const itineraryDisplay = document.getElementById('itinerary-display');
    if (itineraryDisplay) {
        // Insert summary at the top of the itinerary display
        const firstChild = itineraryDisplay.firstChild;
        if (firstChild) {
            itineraryDisplay.insertBefore(summaryDiv, firstChild);
        } else {
            itineraryDisplay.appendChild(summaryDiv);
        }
    }
}

// Add this CSS to style the summary
const styleElement = document.createElement('style');
styleElement.textContent = `
    .itinerary-summary {
        background: #f0f7ff;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 20px;
    }
    
    .itinerary-days-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
    }
    
    .day-chip {
        background: #e1e9f8;
        padding: 5px 10px;
        border-radius: 15px;
        font-size: 13px;
    }
`;
document.head.appendChild(styleElement);

// Update populateItineraryTable function to fix issue with hours and weather source
async function populateItineraryTable(itineraryItems) {
    const itineraryTableBody = document.querySelector("#itinerary-table tbody");
    if (!itineraryTableBody) {
        console.error("Itinerary table body not found!");
        return;
    }
    itineraryTableBody.innerHTML = ""; // Clear previous items

    // Group by day first
    const groupedByDay = itineraryItems.reduce((acc, item) => {
        const day = item.day || "Unspecified Day";
        if (!acc[day]) {
            acc[day] = [];
        }
        acc[day].push(item);
        return acc;
    }, {});

    // Get forecast data from our state
    const forecasts = window.weatherForecasts || [];
    const forecastByDate = {};
    
    // Create a mapping of dates to forecast data
    forecasts.forEach(forecast => {
        forecastByDate[forecast.date] = forecast;
    });

    // Update table headers to include new columns
    const headerRow = document.querySelector("#itinerary-table thead tr");
    if (headerRow) {
        headerRow.innerHTML = `
            <th>Time</th>
            <th>Activity</th>
            <th>Location Details</th>
            <th>Rating</th>
            <th>Hours</th>
        `;
    }

    const tripDetails = getTripDetailsFromStorage();
    const startDate = tripDetails ? new Date(tripDetails.departureDate) : new Date();

    // Process each day in the itinerary
    const dayKeys = Object.keys(groupedByDay);
    dayKeys.forEach((dayHeader, idx) => {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + idx);
        const displayHeader = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        // Render day header row (no weather here)
        const dayRow = document.createElement('tr');
        dayRow.className = 'day-header-row';
        const dayCell = document.createElement('td');
        dayCell.colSpan = 5; // Adjust if you have more/less columns
        dayCell.innerHTML = `<span class="day-title">${displayHeader}</span>`;
        dayRow.appendChild(dayCell);
        itineraryTableBody.appendChild(dayRow);

        const dateKey = currentDate.toISOString().split('T')[0];
        const forecast = forecastByDate[dateKey];
        if (forecast) {
            const weatherRow = document.createElement('tr');
            weatherRow.className = 'weather-row';
            const weatherCell = document.createElement('td');
            weatherCell.colSpan = 5;
            weatherCell.innerHTML = createWeatherDisplay(forecast);
            weatherRow.appendChild(weatherCell);
            itineraryTableBody.appendChild(weatherRow);
        }
  
        // Get day of week for hours display
        const dayOfWeekIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            .findIndex(day => day === dayHeader.toLowerCase());

        // Add the activities for this day
        for (const item of groupedByDay[dayHeader]) {
            const row = itineraryTableBody.insertRow();
            row.insertCell().textContent = item.time || "N/A";
            
            const activityCell = row.insertCell();
            activityCell.textContent = item.activity || "N/A";
            
            const locationCell = row.insertCell();
            locationCell.innerHTML = '<div class="loading-place-data">Loading...</div>';
            
            // Add placeholder cells for rating and hours
            const ratingCell = row.insertCell();
            ratingCell.innerHTML = '<div class="loading-place-data">Loading...</div>';
            
            const hoursCell = row.insertCell();
            hoursCell.innerHTML = '<div class="loading-place-data">Loading...</div>';
            
            // Fetch place details asynchronously
            fetchPlaceDetails(item.activity, item.location).then(placeDetails => {
                if (placeDetails.found) {
                    // Update location cell
                    const displayAddress = placeDetails.address || item.location || "Address not available";
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress)}`;
                    locationCell.innerHTML = `<a href="${mapsUrl}" target="_blank" rel="noopener">${displayAddress}</a>`;
                    
                    // Update rating cell
                    if (placeDetails.rating) {
                        const stars = '★'.repeat(Math.round(placeDetails.rating)) + 
                                     '☆'.repeat(Math.max(0, 5 - Math.round(placeDetails.rating)));
                        ratingCell.innerHTML = `
                            <div class="place-rating">
                                <div class="stars">${stars}</div>
                                <div class="rating-value">${placeDetails.rating}/5</div>
                                <div class="rating-count">(${placeDetails.totalRatings} reviews)</div>
                            </div>
                        `;
                    } else {
                        ratingCell.textContent = "No ratings";
                    }
                    
                    // Update hours cell - CHANGED TO SHOW SPECIFIC DAY HOURS
                    if (placeDetails.hours && placeDetails.hours.length > 0) {
                        let todaysHours = "Hours not available";
                        const dayName = dayHeader.split(',')[0].trim(); // e.g., "Monday"
                        const dayHoursRegex = new RegExp(`^${dayName}:?\\s*(.+)`, 'i');
                        for (const hourText of placeDetails.hours) {
                            const match = hourText.match(dayHoursRegex);
                            if (match) {
                                todaysHours = match[1] || match[0];
                                break;
                            }
                        }
                        hoursCell.innerHTML = `<div class="place-hours">${todaysHours}</div>`;
                    } else {
                        hoursCell.textContent = "Hours not available";
                    }
                } else {
                    locationCell.textContent = "Address not available";
                    ratingCell.textContent = "N/A";
                    hoursCell.textContent = "N/A";
                }
            }).catch(error => {
                console.error('Error processing place details:', error);
                locationCell.textContent = "Error loading";
                ratingCell.textContent = "Error loading";
                hoursCell.textContent = "Error loading";
            });
        }
    });

    // AFTER ALL ROWS ARE ADDED AND POPULATED:
    const toggleHoursCheckbox = document.getElementById('toggle-hours');
    if (toggleHoursCheckbox && !toggleHoursCheckbox.checked) {
        document.querySelectorAll('#itinerary-table th:nth-child(5), #itinerary-table td:nth-child(5)').forEach(el => {
            el.style.display = 'none';
        });
    }

    // ADD THIS NEW BLOCK FOR RATINGS COLUMN
    const toggleRatingsCheckbox = document.getElementById('toggle-ratings');
    if (toggleRatingsCheckbox && !toggleRatingsCheckbox.checked) {
        // The Ratings column is the 4th column
        document.querySelectorAll('#itinerary-table th:nth-child(4), #itinerary-table td:nth-child(4)').forEach(el => {
            el.style.display = 'none';
        });
    }
    console.log("populateItineraryTable finished, hours and ratings column states checked.");
}

// Add this after populating the itinerary table
function populateDayNavigation() {
    const dayNavigation = document.getElementById('jump-to-day');
    if (!dayNavigation) return;
    
    // Clear existing options
    dayNavigation.innerHTML = '';
    
    // Get unique days
    const days = [...new Set(itineraryData.map(item => item.day))];
    
    // Add options for each day
    days.forEach(day => {
        const option = document.createElement('option');
        option.value = day;
        option.textContent = day;
        dayNavigation.appendChild(option);
    });
    
    // Show the navigation if we have multiple days
    if (days.length > 1) {
        document.getElementById('day-navigation').style.display = 'block';
        
        // Add event listener
        dayNavigation.addEventListener('change', (e) => {
            const selectedDay = e.target.value;
            const dayRow = document.querySelector(`tr[data-day="${selectedDay}"]`);
            if (dayRow) {
                dayRow.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}

// --- ADDED: Map Functions ---
async function displayMapAndMarkers(items) {
    // Clear existing markers and paths
    currentMarkers.forEach(marker => marker.map = null); // For google.maps.Marker
    currentMarkers.forEach(marker => { if (marker.setMap) marker.setMap(null); else marker.map = null; }); // For AdvancedMarkerElement
    currentMarkers = [];
    dayPaths.forEach(path => path.setMap(null));
    dayPaths = [];
    
    if (!map || !geocoder) {
        console.error("Map or Geocoder not initialized for displayMapAndMarkers.");
        return;
    }

    dayGroups = groupItemsByDay(items); // Ensure dayGroups is populated correctly
    
    const daySelector = document.getElementById('day-selector');
    if (daySelector) {
        // Clear previous day options except for "Show all days"
        while (daySelector.options.length > 1) {
            daySelector.remove(1);
        }
        Object.keys(dayGroups).forEach(day => {
            const option = document.createElement('option');
            option.value = day;
            option.textContent = day;
            daySelector.appendChild(option);
        });
        daySelector.value = 'all'; // Reset to "Show all days"
    }

    const bounds = new google.maps.LatLngBounds();
    let locationsFound = 0;
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    const tripDetails = getTripDetailsFromStorage();
    const tripDestinationCityContext = tripDetails ? tripDetails.destination : ""; 

    let dayIndex = 0; // For assigning different colors to paths

    for (const [dayName, dayItems] of Object.entries(dayGroups)) {
        const dayCoordinates = [];

        for (const item of dayItems) {
            if (item.location && item.location.trim() !== "") {
                let locationToGeocode = item.location;
                if (tripDestinationCityContext) {
                    const mainTripCity = tripDestinationCityContext.split(',')[0].trim().toLowerCase();
                    const itemLocationLower = item.location.toLowerCase();
                    if (item.location.length < 50 && !item.location.includes(',') && !itemLocationLower.includes(mainTripCity)) {
                        locationToGeocode = `${item.location}, ${tripDestinationCityContext.split(',')[0].trim()}`;
                    }
                }

                try {
                    const position = await geocodeLocation(locationToGeocode);
                    if (position) {
                        locationsFound++;
                        const marker = new AdvancedMarkerElement({
                            map: map, // Initially add to map, will be filtered
                            position: position,
                            title: `${item.activity} (${item.time})`,
                        });
                        
                        marker.dayName = dayName; // Associate marker with the day
                        markerData.set(marker, item); 
                        currentMarkers.push(marker);
                        bounds.extend(position);
                        dayCoordinates.push(position);

                        marker.addListener('click', () => { // For AdvancedMarkerElement, click is direct
                            const itemData = markerData.get(marker);
                            const infoWindow = new google.maps.InfoWindow({
                                content: `<h5>${itemData.activity}</h5><p>${itemData.time}</p><p>${itemData.location}</p>`
                            });
                            // For AdvancedMarkerElement, InfoWindow needs a LatLng position if not anchored to a classic marker
                            // Or, you can create a custom overlay. For simplicity, let's try anchoring to position.
                            infoWindow.setPosition(marker.position);
                            infoWindow.open(map);
                        });
                    }
                } catch (error) {
                    console.warn(`Could not geocode location for map: "${locationToGeocode}"`, error);
                }
            }
        }

        // Create and draw polyline for the current day's route
        if (dayCoordinates.length > 1) {
            const dayPath = new google.maps.Polyline({
                path: dayCoordinates,
                geodesic: true,
                strokeColor: getColorForDay(dayIndex),
                strokeOpacity: 0.8,
                strokeWeight: 4,
                map: map // Initially add to map, will be filtered
            });
            dayPath.dayName = dayName; // Associate path with the day
            dayPaths.push(dayPath);
        }
        dayIndex++;
    }
    
    if (locationsFound > 0) {
        map.fitBounds(bounds);
        if (locationsFound === 1 && map.getZoom() > 15) {
            map.setZoom(15);
        }
    } else if (tripDestinationCityContext) {
        try {
            const position = await geocodeLocation(tripDestinationCityContext);
            if (position) map.setCenter(position);
        } catch (error) {
            console.warn(`Could not geocode trip destination for map fallback: "${tripDestinationCityContext}"`, error);
        }
    }
    filterMapByDay(); // Apply initial filter (which should be "all")
}

// Add event listener for day selector
document.addEventListener('DOMContentLoaded', () => {
    const daySelector = document.getElementById('day-selector');
    if (daySelector) {
        daySelector.addEventListener('change', filterMapByDay);
    }
    // ... other DOMContentLoaded initializations
});

// Filter function
function filterMapByDay() {
    const selectedDay = document.getElementById('day-selector').value;
    const bounds = new google.maps.LatLngBounds();
    let visibleMarkersExist = false;

    // Show/hide markers based on selected day
    currentMarkers.forEach(marker => {
        const shouldShow = (selectedDay === 'all' || marker.dayName === selectedDay);
        // For AdvancedMarkerElement, setMap(null) or setMap(map)
        if (marker.setMap) { // Check if it's an old marker instance, unlikely now
             marker.setMap(shouldShow ? map : null);
        } else { // For AdvancedMarkerElement
             marker.map = shouldShow ? map : null;
        }
        if (shouldShow && marker.position) {
            bounds.extend(marker.position);
            visibleMarkersExist = true;
        }
    });
    
    // Show/hide paths based on selected day
    dayPaths.forEach(path => {
        const shouldShow = (selectedDay === 'all' || path.dayName === selectedDay);
        path.setMap(shouldShow ? map : null);
        if (shouldShow) {
            path.getPath().forEach(point => bounds.extend(point));
            // No need to set visibleMarkersExist again if paths are shown, markers are primary for bounds
        }
    });
    
    // Update map bounds for the filtered markers if specific day is selected or all
    if (visibleMarkersExist) {
        map.fitBounds(bounds);
        // If only one marker is visible after filtering, prevent over-zooming
        const visibleMarkersCount = currentMarkers.filter(m => (selectedDay === 'all' || m.dayName === selectedDay) && m.map).length;
        if (visibleMarkersCount === 1 && map.getZoom() > 15) {
            map.setZoom(15);
        }
    } else if (selectedDay !== 'all') {
        // If a specific day is selected and has no markers, maybe show a message or zoom out to trip destination
        console.log(`No locations found on map for ${selectedDay}.`);
        // Optionally, center on the trip's main destination if no markers for the selected day
        const tripDetails = getTripDetailsFromStorage();
        if (tripDetails && tripDetails.destination) {
            geocodeLocation(tripDetails.destination).then(position => {
                if (position) map.setCenter(position); map.setZoom(10); // Reset zoom
            }).catch(err => console.warn("Could not geocode trip destination for empty day filter"));
        }
    }
}

// Helper to get different colors for each day's route
function getColorForDay(index) {
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFA1', '#FF8C00', '#00CED1'];
    return colors[index % colors.length];
}

// Helper to group items by day (ensure this is robust)
function groupItemsByDay(items) {
    return items.reduce((acc, item) => {
        const day = item.day || "Unspecified Day"; // Handle items that might be missing a day
        if (!acc[day]) {
            acc[day] = [];
        }
        acc[day].push(item);
        return acc;
    }, {});
}

// Helper function to geocode a location string (ensure this is robust)
function geocodeLocation(address) {
    return new Promise((resolve, reject) => {
        if (!geocoder) {
            return reject(new Error("Geocoder not initialized."));
        }
        geocoder.geocode({ 'address': address }, (results, status) => {
            if (status === 'OK' && results[0]) {
                resolve(results[0].geometry.location);
            } else {
                reject(new Error('Geocode was not successful for the following reason: ' + status + ' for address: ' + address));
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
    
    // Use the override function if it exists
    if (window.getTripDetailsFromStorageOverride) {
        return window.getTripDetailsFromStorageOverride();
    }
    
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

        // First check if ANY values are null or the string "null"
        if (!destination || !departureDate || !arrivalDate || 
            destination === "null" || departureDate === "null" || arrivalDate === "null") {
            console.warn("[second-page.js] One or more values in localStorage are null or the string 'null'.");
            return null;
        }

        // Now check for empty strings
        if (destination.trim() === "" || departureDate.trim() === "" || arrivalDate.trim() === "") {
            console.warn('[second-page.js] One or more values in localStorage are empty strings.');
            return null;
        }

        // Parse preferences
        const preferences = preferencesJson ? JSON.parse(preferencesJson) : [];

        console.log('[second-page.js] All required details are present and non-empty.');
        return {
            destination,
            departureDate,
            arrivalDate,
            preferences
        };
    } catch (e) {
        console.error("[second-page.js] Error in getTripDetailsFromStorage:", e);
        return null;
    }
}

// Add this function to handle collapsible sections

function toggleCollapse(contentId) {
  const content = document.getElementById(contentId);
  const header = content.previousElementSibling;
  const icon = header.querySelector('.collapse-icon');
  
  content.classList.toggle('expanded');
  icon.classList.toggle('expanded');
  
  // Update aria-expanded attribute for accessibility
  const isExpanded = content.classList.contains('expanded');
  header.setAttribute('aria-expanded', isExpanded);
}

const preferenceOptions = [
    { id: 'culture', label: 'Culture' },
    { id: 'landmarks', label: 'Landmarks' },
    { id: 'food', label: 'Foodie' },
    { id: 'historical', label: 'Historical' },
    { id: 'art', label: 'Art' },
    { id: 'nature', label: 'Nature' },
    { id: 'nightlife', label: 'Nightlife' },
    { id: 'theme_parks', label: 'Theme Parks' } // <-- Add this
];

