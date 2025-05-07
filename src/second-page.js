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
let currentMarkers = []; // Store all created markers
let dayPaths = []; // Store polylines for each day
let dayGroups = {}; // Store activities grouped by day
const markerData = new WeakMap(); // Store marker data that can't be directly attached
let weatherForecasts = []; // Store weather forecasts globally

// Fix the completely broken getSeasonalWeatherData function
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
      baseUrl = 'http://localhost:9876';
    } else {
      // For production deployment - use relative URL
      baseUrl = '';
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
      baseUrl = 'http://localhost:9876';
    } else {
      // For production deployment - use relative URL
      baseUrl = '';
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
      baseUrl = 'http://localhost:9876';
    } else {
      // For production deployment - use relative URL
      baseUrl = '';
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
        displayPreferences(); // Ensure this doesn't clear or interfere with tripDetails
        const tripDetails = getTripDetailsFromStorage(); // This is the critical call

        if (tripDetails) {
            console.log("[second-page.js] Successfully loaded trip details from storage:", tripDetails);
            const destinationElements = document.querySelectorAll("[id^='selected-destination']");
            destinationElements.forEach(element => {
                if (element) element.textContent = tripDetails.destination || "your destination";
            });
            
            // Fetch weather data in parallel with the itinerary
            fetchWeatherData().catch(error => {
                console.error("Weather data fetch failed:", error);
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
        let preferences = [];
        
        // Try using the override first if available
        if (window.getTripDetailsFromStorageOverride) {
            const details = window.getTripDetailsFromStorageOverride();
            if (details && details.preferences) {
                preferences = details.preferences;
            }
        } else {
            // Fall back to regular localStorage
            preferences = JSON.parse(localStorage.getItem("tripPreferences") || "[]");
        }
        
        if (preferences.length === 0) {
            preferencesList.innerHTML = "<li>No preferences selected</li>";
        } else {
            preferencesList.innerHTML = preferences
                .map(pref => `<li class="preference-item">${pref}</li>`)
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
        
        // Add this debug section:
        console.log("Received itinerary data from server:");
        console.log("Total items:", itineraryData.length);
        console.log("Days covered:", new Set(itineraryData.map(item => item.day)).size);
        console.log("Days are:", [...new Set(itineraryData.map(item => item.day))]);

        document.querySelectorAll("[id^='selected-destination']").forEach(el => {
            if (el) el.textContent = destination;
        });
        
        if (itineraryData.length > 0) {
            populateItineraryTable(itineraryData);
            populateDayNavigation(); // Add this after populating the itinerary table
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

// Update populateItineraryTable function to fix issue with hours and weather source
async function populateItineraryTable(itineraryItems) {
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

    // Process each day in the itinerary
    for (const dayHeader of Object.keys(groupedByDay)) {
        // Parse the date from the day header (e.g., "Friday, May 27")
        const dateMatch = dayHeader.match(/([A-Za-z]+),\s+([A-Za-z]+)\s+(\d+)/);
        let matchingForecast = null;
        let dayOfWeek = "";
        
        if (dateMatch) {
            dayOfWeek = dateMatch[1]; // Extract day name (e.g., "Friday")
            const monthName = dateMatch[2];
            const day = dateMatch[3];
            
            // Convert month name to month number
            const months = {
                'January': '01', 'February': '02', 'March': '03', 'April': '04',
                'May': '05', 'June': '06', 'July': '07', 'August': '08',
                'September': '09', 'October': '10', 'November': '11', 'December': '12'
            };
            
            // Assume current year for simplicity
            const currentYear = new Date().getFullYear();
            const formattedDate = `${currentYear}-${months[monthName]}-${day.padStart(2, '0')}`;
            
            // Find matching forecast
            matchingForecast = forecastByDate[formattedDate];
        }

        // Add a header row for the day with weather information
        const dayHeaderRow = itineraryTableBody.insertRow();
        dayHeaderRow.classList.add('day-header-row');
        dayHeaderRow.setAttribute('data-day', dayHeader); // Add data attribute for navigation
        
        if (matchingForecast) {
            // Create a day header with weather information (REMOVED SOURCE)
            
            // Create a table row with columns for day header
            const dayCell = dayHeaderRow.insertCell();
            dayCell.textContent = dayHeader;
            dayCell.className = 'day-header';
            
            // Weather information in the Activity column
            const weatherCell = dayHeaderRow.insertCell();
            weatherCell.innerHTML = `${matchingForecast.high}°F / ${matchingForecast.low}°F`;
            
            // Weather description in the Location column
            const descCell = dayHeaderRow.insertCell();
            descCell.innerHTML = `${matchingForecast.description}`;
            
            // Empty cells for rating and hours columns in header row
            dayHeaderRow.insertCell();
            dayHeaderRow.insertCell();
            
            // Apply styling to the entire row
            dayHeaderRow.style.backgroundColor = '#e8f0fe';
            dayHeaderRow.style.fontWeight = 'bold';
            
            // Add weather icon
            const iconSpan = document.createElement('span');
            iconSpan.style.marginLeft = '5px';
            iconSpan.style.position = 'relative';
            iconSpan.style.top = '5px';
            const iconImg = document.createElement('img');
            iconImg.src = `https://openweathermap.org/img/wn/${matchingForecast.icon}.png`;
            iconImg.alt = matchingForecast.description;
            iconImg.style.width = '25px';
            iconImg.style.height = '25px';
            iconSpan.appendChild(iconImg);
            weatherCell.appendChild(iconSpan);
        } else {
            // Default header without weather
            const dayCell = dayHeaderRow.insertCell();
            dayCell.colSpan = 5; // Span all columns
            dayCell.textContent = dayHeader;
            dayCell.classList.add('day-header');
            dayCell.style.textAlign = "center";
            dayCell.style.backgroundColor = "#e8f0fe";
            dayCell.style.fontWeight = "bold";
            dayCell.style.padding = "10px";
        }

        // Get day of week for hours display
        const dayOfWeekIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            .findIndex(day => day === dayOfWeek.toLowerCase());

        // Add the activities for this day
        for (const item of groupedByDay[dayHeader]) {
            const row = itineraryTableBody.insertRow();
            row.insertCell().textContent = item.time || "N/A";
            
            const activityCell = row.insertCell();
            activityCell.textContent = item.activity || "N/A";
            
            const locationCell = row.insertCell();
            locationCell.textContent = item.location || "N/A";
            
            // Add placeholder cells for rating and hours
            const ratingCell = row.insertCell();
            ratingCell.innerHTML = '<div class="loading-place-data">Loading...</div>';
            
            const hoursCell = row.insertCell();
            hoursCell.innerHTML = '<div class="loading-place-data">Loading...</div>';
            
            // Fetch place details asynchronously
            fetchPlaceDetails(item.activity, item.location).then(placeDetails => {
                if (placeDetails.found) {
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
                        // Find hours for this specific day of week (accounting for API format that might have "day: hours")
                        let todaysHours = "Hours not available";
                        
                        if (dayOfWeekIndex >= 0) {
                            const dayHoursRegex = new RegExp(`${dayOfWeek}:?\\s*(.+)`, 'i');
                            
                            // Try to find hours for this specific day
                            for (const hourText of placeDetails.hours) {
                                const match = hourText.match(dayHoursRegex);
                                if (match) {
                                    todaysHours = match[1] || match[0];
                                    break;
                                }
                            }
                        }
                        
                        hoursCell.innerHTML = `<div class="place-hours">${todaysHours}</div>`;
                    } else {
                        hoursCell.textContent = "Hours not available";
                    }
                    
                    // Add Google Maps link to location
                    if (placeDetails.url) {
                        const mapLink = document.createElement('a');
                        mapLink.href = placeDetails.url;
                        mapLink.target = "_blank";
                        mapLink.classList.add('google-maps-link');
                        mapLink.textContent = "View on Google Maps";
                        locationCell.appendChild(document.createElement('br'));
                        locationCell.appendChild(mapLink);
                    }
                } else {
                    ratingCell.textContent = "N/A";
                    hoursCell.textContent = "N/A";
                }
            }).catch(error => {
                console.error('Error processing place details:', error);
                ratingCell.textContent = "Error loading";
                hoursCell.textContent = "Error loading";
            });
        }
    }
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
    currentMarkers.forEach(marker => marker.map = null);
    currentMarkers = [];
    dayPaths.forEach(path => path.setMap(null));
    dayPaths = [];
    
    if (!map || !geocoder) {
        console.error("Map or Geocoder not initialized.");
        return;
    }

    // Group items by day
    dayGroups = groupItemsByDay(items);
    
    // Populate the day selector dropdown
    const daySelector = document.getElementById('day-selector');
    if (daySelector) {
        // Clear existing options except "Show all days"
        while (daySelector.options.length > 1) {
            daySelector.remove(1);
        }
        
        // Add an option for each day
        Object.keys(dayGroups).forEach(day => {
            const option = document.createElement('option');
            option.value = day;
            option.textContent = day;
            daySelector.appendChild(option);
        });
    }

    const bounds = new google.maps.LatLngBounds();
    let locationsFound = 0;
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    // Process all items and create markers
    for (const [dayName, dayItems] of Object.entries(dayGroups)) {
        for (const item of dayItems) {
            if (item.location && item.location.trim() !== "") {
                try {
                    const results = await geocodeLocation(item.location);
                    if (results && results.length > 0) {
                        const location = results[0].geometry.location;
                        const position = { lat: location.lat(), lng: location.lng() };
                        
                        locationsFound++;
                        bounds.extend(position);
                        
                        // Create marker properly without custom properties
                        const marker = new AdvancedMarkerElement({
                            map: map,
                            position: position,
                            title: `${item.activity}\n${item.location}\n${item.time}`
                        });
                        
                        // Store day info in WeakMap instead
                        markerData.set(marker, {
                            dayGroup: dayName,
                            item: item
                        });
                        
                        // Add custom styling to show day number
                        const dayIndex = Object.keys(dayGroups).indexOf(dayName) + 1;
                        const markerElement = document.createElement('div');
                        markerElement.className = 'custom-marker';
                        markerElement.style.backgroundColor = getColorForDay(dayIndex-1);
                        markerElement.innerHTML = `<span>${dayIndex}</span>`;
                        marker.content = markerElement;
                        
                        // Add info window
                        const infoWindow = new google.maps.InfoWindow({
                            content: `<b>${item.activity}</b><br>${item.location}<br><i>${item.time} (${dayName})</i>`
                        });
                        marker.addListener('click', () => {
                            infoWindow.open(map, marker);
                        });
                        
                        // Store marker for filtering
                        currentMarkers.push(marker);
                        
                        // Add position to item for route drawing
                        item.position = position;
                    }
                } catch (error) {
                    console.error(`Geocoding error for ${item.location}:`, error);
                }
            }
        }
    }
    
    // Draw route lines for each day
    Object.entries(dayGroups).forEach(([day, dayItems], index) => {
        const validItems = dayItems.filter(item => item.position);
        if (validItems.length >= 2) {
            const dayPath = new google.maps.Polyline({
                path: validItems.map(item => item.position),
                geodesic: true,
                strokeColor: getColorForDay(index),
                strokeOpacity: 0.8,
                strokeWeight: 3
            });
            dayPath.set("dayGroup", day); // This works for polylines
            dayPath.setMap(map);
            dayPaths.push(dayPath);
        }
    });

    if (locationsFound > 0) {
        map.fitBounds(bounds);
        if (locationsFound === 1) map.setZoom(14);
    }
}

// Add event listener for day selector
document.addEventListener('DOMContentLoaded', () => {
    const daySelector = document.getElementById('day-selector');
    if (daySelector) {
        daySelector.addEventListener('change', filterMapByDay);
    }
});

// Filter function
function filterMapByDay() {
    const selectedDay = document.getElementById('day-selector').value;
    
    // Show/hide markers based on selected day
    currentMarkers.forEach(marker => {
        // Get dayGroup from our WeakMap
        const data = markerData.get(marker);
        if (selectedDay === 'all' || (data && data.dayGroup === selectedDay)) {
            marker.map = map;
        } else {
            marker.map = null;
        }
    });
    
    // Show/hide paths based on selected day
    dayPaths.forEach(path => {
        const pathDay = path.get("dayGroup");
        if (selectedDay === 'all' || pathDay === selectedDay) {
            path.setMap(map);
        } else {
            path.setMap(null);
        }
    });
    
    // Update map bounds for the filtered markers if specific day is selected
    if (selectedDay !== 'all') {
        const visibleMarkers = currentMarkers.filter(marker => {
            const data = markerData.get(marker);
            return data && data.dayGroup === selectedDay;
        });
        
        if (visibleMarkers.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            visibleMarkers.forEach(marker => bounds.extend(marker.position));
            map.fitBounds(bounds);
            if (visibleMarkers.length === 1) map.setZoom(14);
        }
    } else {
        // If showing all, fit to all markers
        const bounds = new google.maps.LatLngBounds();
        currentMarkers.forEach(marker => bounds.extend(marker.position));
        map.fitBounds(bounds);
    }
}

// Helper to get different colors for each day's route
function getColorForDay(index) {
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A1', '#33FFF0'];
    return colors[index % colors.length];
}

// Helper to group items by day
function groupItemsByDay(items) {
    return items.reduce((groups, item) => {
        const day = item.day || 'Unknown';
        if (!groups[day]) groups[day] = [];
        groups[day].push(item);
        return groups;
    }, {});
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

const app = {};
app.something = function() { /* ... */ };


