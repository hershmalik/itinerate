// Log localStorage content at the VERY START of script execution
console.log("[second-page.js] SCRIPT EXECUTION STARTED. Reading localStorage immediately:");
console.log(`[second-page.js] Initial read - tripDestination: '${localStorage.getItem('tripDestination')}'`);
console.log(`[second-page.js] Initial read - tripDepartureDate: '${localStorage.getItem('tripDepartureDate')}'`);
console.log(`[second-page.js] Initial read - tripArrivalDate: '${localStorage.getItem('tripArrivalDate')}'`);
console.log(`[second-page.js] Initial read - tripPreferences: '${localStorage.getItem('tripPreferences')}'`);
console.log("All localStorage keys/values at script start:", {...localStorage});

console.log("[second-page.js] TOP OF FILE: tripDestination =", localStorage.getItem('tripDestination'));

window.addEventListener('DOMContentLoaded', () => {
  console.log("[second-page.js] DOMContentLoaded: tripDestination =", localStorage.getItem('tripDestination'));
  
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
    toggleHours.checked = false;
    toggleHours.addEventListener('change', function(e) {
      const show = e.target.checked;
      document.querySelectorAll('#itinerary-table th:nth-child(5), #itinerary-table td:nth-child(5)').forEach(el => {
        el.style.display = show ? '' : 'none';
      });
    });
  }

  const toggleRatings = document.getElementById('toggle-ratings');
  if (toggleRatings) {
    toggleRatings.checked = false;
    toggleRatings.addEventListener('change', function(e) {
      const show = e.target.checked;
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

console.log("[second-page.js] Initializing...");

let map, geocoder, itineraryData = [], currentMarkers = [], dayPaths = [], dayGroups = {};
const markerData = new WeakMap();
let weatherForecasts = [];

// Get trip details from storage
function getTripDetailsFromStorage() {
    if (window.getTripDetailsFromStorageOverride) {
        return window.getTripDetailsFromStorageOverride();
    }
    
    // Check if this is a shared itinerary first
    const sharedItinerary = localStorage.getItem('sharedItinerary');
    if (sharedItinerary) {
        try {
            const destination = localStorage.getItem('tripDestination');
            const departureDate = localStorage.getItem('tripDepartureDate');
            const arrivalDate = localStorage.getItem('tripArrivalDate');
            const preferences = JSON.parse(localStorage.getItem('tripPreferences') || '[]');
            const tripStyle = localStorage.getItem('tripStyle') || 'balanced';
            
            // Parse the shared itinerary data
            itineraryData = JSON.parse(sharedItinerary);
            
            if (!destination || !departureDate || !arrivalDate) return null;
            
            return { destination, departureDate, arrivalDate, preferences, tripStyle };
        } catch (e) {
            console.error('Error parsing shared itinerary:', e);
        }
    }
    
    try {
        const destination = localStorage.getItem('tripDestination');
        const departureDate = localStorage.getItem('tripDepartureDate');
        const arrivalDate = localStorage.getItem('tripArrivalDate');
        const preferences = JSON.parse(localStorage.getItem('tripPreferences') || '[]');
        const tripStyle = localStorage.getItem('tripStyle') || 'balanced';
        
        if (!destination || !departureDate || !arrivalDate) return null;
        
        return { destination, departureDate, arrivalDate, preferences, tripStyle };
    } catch (e) {
        console.error('Error parsing localStorage:', e);
        return null;
    }
}

// Initialize map and generate itinerary
async function initMapAndItinerary() {
    console.log("Google Maps API loaded, initializing...");
    
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 10,
        center: { lat: 0, lng: 0 },
        mapId: "ITINERARY_MAP"
    });
    geocoder = new google.maps.Geocoder();
    
    try {
        displayPreferences();
        initializePreferenceToggles();
        await generateItinerary();
    } catch (error) {
        console.error("Error initializing:", error);
        document.getElementById("error-message").textContent = error.message;
        document.getElementById("error-message").style.display = "block";
    }
}

// Display preferences
function displayPreferences() {
    const preferencesList = document.getElementById("preferences-list");
    if (!preferencesList) return;
    
    const tripDetails = getTripDetailsFromStorage();
    const preferences = tripDetails ? tripDetails.preferences || [] : [];
    
    preferencesList.innerHTML = "";
    
    if (preferences.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No preferences selected";
        preferencesList.appendChild(li);
    } else {
        preferences.forEach(pref => {
            const li = document.createElement("li");
            li.textContent = pref.charAt(0).toUpperCase() + pref.slice(1);
            preferencesList.appendChild(li);
        });
    }
}

// Initialize preference toggles
function initializePreferenceToggles() {
    const preferenceOptions = [
        { id: 'culture', label: 'Culture' },
        { id: 'landmarks', label: 'Landmarks' },
        { id: 'food', label: 'Foodie' },
        { id: 'historical', label: 'Historical' },
        { id: 'art', label: 'Art' },
        { id: 'nature', label: 'Nature' },
        { id: 'nightlife', label: 'Nightlife' },
        { id: 'theme_parks', label: 'Theme Parks' }
    ];

    const togglesContainer = document.querySelector('.preference-toggles');
    if (togglesContainer) {
        togglesContainer.innerHTML = '';
        
        preferenceOptions.forEach(option => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'preference-toggle';
            button.textContent = option.label;
            button.dataset.preference = option.id;
            
            button.addEventListener('click', function() {
                this.classList.toggle('active');
            });
            
            togglesContainer.appendChild(button);
        });
    }

    const regenerateButton = document.getElementById('regenerate-itinerary');
    if (regenerateButton) {
        regenerateButton.innerHTML = '<span class="regenerate-icon">🔄</span> Regenerate Itinerary';
        regenerateButton.addEventListener('click', regenerateItineraryWithUpdatedPreferences);
    }
}

// Regenerate itinerary with updated preferences
async function regenerateItineraryWithUpdatedPreferences() {
    const tripDetails = getTripDetailsFromStorage();
    if (!tripDetails) return;

    const selectedPreferences = [];
    document.querySelectorAll('.preference-toggle.active').forEach(toggle => {
        selectedPreferences.push(toggle.dataset.preference);
    });

    if (selectedPreferences.length === 0) {
        alert("Please select at least one preference.");
        return;
    }

    // Update localStorage
    localStorage.setItem('tripPreferences', JSON.stringify(selectedPreferences));

    // Update override function
    window.getTripDetailsFromStorageOverride = function() {
        return {
            ...tripDetails,
            preferences: selectedPreferences
        };
    };

    // Show loading state
    const regenerateBtn = document.getElementById('regenerate-itinerary');
    if (regenerateBtn) {
        regenerateBtn.innerHTML = '<span class="regenerate-icon">⏳</span> Regenerating...';
        regenerateBtn.disabled = true;
    }

    try {
        // Regenerate the itinerary
        await generateItinerary();
        displayPreferences();
        
        // Show success message
        showNotification('Itinerary updated with your new preferences!');
    } catch (error) {
        console.error('Error regenerating itinerary:', error);
        alert('Error updating itinerary. Please try again.');
    } finally {
        // Reset button
        if (regenerateBtn) {
            regenerateBtn.innerHTML = '<span class="regenerate-icon">🔄</span> Regenerate Itinerary';
            regenerateBtn.disabled = false;
        }
    }
}

// Generate itinerary
async function generateItinerary() {
    const loadingIndicator = document.getElementById("loading-indicator");
    const errorMessageDiv = document.getElementById("error-message");
    const itineraryDisplayDiv = document.getElementById("itinerary-display");

    try {
        if (loadingIndicator) loadingIndicator.style.display = "flex";
        if (errorMessageDiv) errorMessageDiv.style.display = "none";
        if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "none";

        const tripDetails = getTripDetailsFromStorage();
        if (!tripDetails) {
            throw new Error("Trip details not found. Please return to the previous page.");
        }

        // Simple base URL detection - use current origin in production, localhost in development
        let baseUrl;
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            baseUrl = 'http://localhost:10000';
        } else {
            // Production - just use the current origin (works for any hosting platform)
            baseUrl = window.location.origin;
        }
        
        console.log('Using API base URL:', baseUrl);

        const params = new URLSearchParams({
            destination: tripDetails.destination,
            departureDate: tripDetails.departureDate,
            arrivalDate: tripDetails.arrivalDate,
            preferences: JSON.stringify(tripDetails.preferences || []),
            advancedPreferences: JSON.stringify([]),
            tripStyle: tripDetails.tripStyle || 'balanced'
        });

        console.log('Request URL:', `${baseUrl}/generate-itinerary?${params.toString()}`);

        const response = await fetch(`${baseUrl}/generate-itinerary?${params.toString()}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server response:', errorText);
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        let rawItinerary = data.itinerary;

        // Fix and enhance the itinerary data
        itineraryData = enhanceAndFixItinerary(rawItinerary, tripDetails);

        await populateItineraryTable(itineraryData);
        await displayMapAndMarkers(itineraryData);

        if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "block";
    } catch (error) {
        console.error("Error generating itinerary:", error);
        if (errorMessageDiv) {
            errorMessageDiv.textContent = `Error: ${error.message}`;
            errorMessageDiv.style.display = "block";
        }
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = "none";
    }
}

// Parse time string to minutes for sorting
function parseTime(timeString) {
    if (!timeString) return 0;
    
    // Handle various time formats
    const timeMatch = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!timeMatch) return 0;
    
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : null;
    
    // Convert to 24-hour format if AM/PM is specified
    if (ampm) {
        if (ampm === 'PM' && hours !== 12) {
            hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
            hours = 0;
        }
    }
    
    // Return total minutes from midnight
    return hours * 60 + minutes;
}

// New function to enhance and fix itinerary issues
function enhanceAndFixItinerary(rawItinerary, tripDetails) {
    console.log('Enhancing itinerary with raw data:', rawItinerary);
    
    // Calculate trip duration
    const startDate = new Date(tripDetails.departureDate);
    const endDate = new Date(tripDetails.arrivalDate);
    const tripDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Generate proper day names
    const dayNames = [];
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (let i = 0; i < tripDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dayName = `Day ${i + 1}: ${dayOfWeek[currentDate.getDay()]}, ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        dayNames.push(dayName);
    }
    
    // Organize activities by day and ensure proper distribution
    const enhancedItinerary = [];
    const activitiesPerDay = getActivitiesPerDay(tripDetails.tripStyle);
    
    // If we have raw itinerary data, try to organize it properly
    if (rawItinerary && rawItinerary.length > 0) {
        const organizedData = organizeExistingActivities(rawItinerary, dayNames, activitiesPerDay);
        enhancedItinerary.push(...organizedData);
    }
    
    // Fill in missing days or add more activities if needed
    for (let dayIndex = 0; dayIndex < tripDays; dayIndex++) {
        const dayName = dayNames[dayIndex];
        const existingActivities = enhancedItinerary.filter(activity => activity.day === dayName);
        
        if (existingActivities.length < activitiesPerDay) {
            const additionalActivities = generateActivitiesForDay(
                dayName, 
                tripDetails, 
                activitiesPerDay - existingActivities.length,
                existingActivities
            );
            enhancedItinerary.push(...additionalActivities);
        }
    }
    
    // Sort activities by day and time
    enhancedItinerary.sort((a, b) => {
        const dayComparison = dayNames.indexOf(a.day) - dayNames.indexOf(b.day);
        if (dayComparison !== 0) return dayComparison;
        
        const timeA = parseTime(a.time) || 0;
        const timeB = parseTime(b.time) || 0;
        return timeA - timeB;
    });
    
    console.log('Enhanced itinerary:', enhancedItinerary);
    return enhancedItinerary;
}

// Organize existing activities properly
function organizeExistingActivities(rawItinerary, dayNames, activitiesPerDay) {
    const organized = [];
    const activitiesByOriginalDay = {};
    
    // Group by original day names
    rawItinerary.forEach(activity => {
        const originalDay = activity.day || 'Day 1';
        if (!activitiesByOriginalDay[originalDay]) {
            activitiesByOriginalDay[originalDay] = [];
        }
        activitiesByOriginalDay[originalDay].push(activity);
    });
    
    // Redistribute activities to proper day names
    const originalDays = Object.keys(activitiesByOriginalDay).sort();
    
    originalDays.forEach((originalDay, index) => {
        const activities = activitiesByOriginalDay[originalDay];
        const properDayName = dayNames[index] || dayNames[dayNames.length - 1];
        
        activities.forEach(activity => {
            organized.push({
                ...activity,
                day: properDayName,
                time: activity.time || generateTimeForActivity(organized.filter(a => a.day === properDayName).length)
            });
        });
    });
    
    return organized;
}

// Generate activities for a specific day
function generateActivitiesForDay(dayName, tripDetails, count, existingActivities) {
    const activities = [];
    const destination = tripDetails.destination;
    const preferences = tripDetails.preferences || [];
    
    // Define activity templates based on preferences
    const activityTemplates = getActivityTemplates(preferences, destination);
    
    for (let i = 0; i < count; i++) {
        const existingCount = existingActivities.length + i;
        const time = generateTimeForActivity(existingCount);
        const template = activityTemplates[i % activityTemplates.length];
        
        activities.push({
            day: dayName,
            time: time,
            activity: template.activity.replace('{destination}', destination),
            location: template.location.replace('{destination}', destination)
        });
    }
    
    return activities;
}

// Get number of activities per day based on trip style
function getActivitiesPerDay(tripStyle) {
    switch(tripStyle) {
        case 'adventure_seeker':
        case 'adventure-seeker':
            return 5;
        case 'cultural_explorer':
        case 'cultural-explorer':
            return 4;
        case 'foodie':
            return 4;
        case 'relaxed':
        case 'leisure':
            return 3;
        case 'balanced':
        default:
            return 4;
    }
}

// Generate appropriate time for activity based on its position in the day
function generateTimeForActivity(activityIndex) {
    const baseTimes = [
        '9:00 AM',   // Morning start
        '11:30 AM',  // Late morning
        '1:00 PM',   // Lunch time
        '3:30 PM',   // Afternoon
        '6:00 PM',   // Evening
        '8:00 PM'    // Night
    ];
    
    return baseTimes[activityIndex] || baseTimes[baseTimes.length - 1];
}

// Get activity templates based on preferences
function getActivityTemplates(preferences, destination) {
    const templates = [];
    
    // Morning activities
    templates.push(
        { activity: 'Morning coffee and breakfast at local cafe', location: 'Popular cafe in {destination}' },
        { activity: 'Visit famous landmark or monument', location: 'Historic center of {destination}' }
    );
    
    // Based on preferences, add specific activities
    if (preferences.includes('culture') || preferences.includes('historical')) {
        templates.push(
            { activity: 'Explore local museum or cultural center', location: 'Main museum in {destination}' },
            { activity: 'Walking tour of historic district', location: 'Historic quarter of {destination}' }
        );
    }
    
    if (preferences.includes('food') || preferences.includes('foodie')) {
        templates.push(
            { activity: 'Food market exploration and tasting', location: 'Local market in {destination}' },
            { activity: 'Lunch at highly-rated local restaurant', location: 'Popular restaurant in {destination}' }
        );
    }
    
    if (preferences.includes('art')) {
        templates.push(
            { activity: 'Visit art gallery or contemporary museum', location: 'Art district in {destination}' },
            { activity: 'Street art tour', location: 'Artistic neighborhood in {destination}' }
        );
    }
    
    if (preferences.includes('nature')) {
        templates.push(
            { activity: 'Walk through city park or gardens', location: 'Main park in {destination}' },
            { activity: 'Scenic viewpoint visit', location: 'Best viewpoint in {destination}' }
        );
    }
    
    if (preferences.includes('nightlife')) {
        templates.push(
            { activity: 'Evening drinks at rooftop bar', location: 'Popular bar district in {destination}' },
            { activity: 'Dinner at trendy restaurant', location: 'Restaurant row in {destination}' }
        );
    }
    
    // Default activities if no specific preferences
    if (templates.length < 4) {
        templates.push(
            { activity: 'Explore main shopping area', location: 'Shopping district in {destination}' },
            { activity: 'Visit popular attraction', location: 'Tourist area in {destination}' },
            { activity: 'Lunch at local restaurant', location: 'Restaurant in {destination}' },
            { activity: 'Evening stroll through city center', location: 'City center of {destination}' }
        );
    }
    
    return templates;
}

// Populate itinerary table with enhanced organization
async function populateItineraryTable(itineraryItems) {
    const itineraryDisplayDiv = document.getElementById("itinerary-display");
    if (!itineraryDisplayDiv) return;

    let table = document.getElementById("itinerary-table");
    if (!table) {
        table = document.createElement("table");
        table.id = "itinerary-table";
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Activity</th>
                    <th>Location</th>
                    <th>Rating</th>
                    <th>Info</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        itineraryDisplayDiv.appendChild(table);
    }

    const tbody = table.querySelector("tbody");
    tbody.innerHTML = "";

    // Group items by day - maintain the enhanced day order
    const dayGroups = {};
    itineraryItems.forEach(item => {
        if (!dayGroups[item.day]) dayGroups[item.day] = [];
        dayGroups[item.day].push(item);
    });

    // Sort day groups by day order (Day 1, Day 2, etc.)
    const sortedDayNames = Object.keys(dayGroups).sort((a, b) => {
        const dayNumA = parseInt(a.match(/Day (\d+)/)?.[1] || 0);
        const dayNumB = parseInt(b.match(/Day (\d+)/)?.[1] || 0);
        return dayNumA - dayNumB;
    });

    // Add day navigation
    addDayNavigation(sortedDayNames);

    // Get trip details for weather calculation
    const tripDetails = getTripDetailsFromStorage();
    let dayIndex = 0;

    // Populate table with proper day order
    for (const dayName of sortedDayNames) {
        const dayItems = dayGroups[dayName];
        
        // Sort activities within each day by time
        dayItems.sort((a, b) => {
            const timeA = parseTime(a.time) || 0;
            const timeB = parseTime(b.time) || 0;
            return timeA - timeB;
        });
        
        // Day header with weather
        const dayHeaderRow = document.createElement("tr");
        dayHeaderRow.className = "day-header-row";
        
        // Calculate the actual date for this day
        const startDate = new Date(tripDetails.departureDate);
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + dayIndex);
        
        // Get weather for this day
        const weather = await getWeatherForDay(tripDetails.destination, currentDate);
        
        dayHeaderRow.innerHTML = `
            <td colspan="5">
                <div class="day-title-with-weather">
                    <span class="day-title">${dayName}</span>
                    <span class="weather-info">
                        ${weather.icon} ${weather.high}°/${weather.low}°F
                    </span>
                </div>
            </td>
        `;
        tbody.appendChild(dayHeaderRow);

        // Day activities
        for (const item of dayItems) {
            const row = document.createElement("tr");
            
            // Create cells
            const timeCell = document.createElement("td");
            timeCell.textContent = item.time || "N/A";
            
            const activityCell = document.createElement("td");
            activityCell.textContent = item.activity || "No activity";
            
            const locationCell = document.createElement("td");
            locationCell.textContent = item.location || "No location";
            
            const ratingCell = document.createElement("td");
            ratingCell.innerHTML = '<div class="loading-place-data">Loading...</div>';
            
            const hoursCell = document.createElement("td");
            hoursCell.innerHTML = '<div class="loading-place-data">Loading...</div>';
            
            // Add cells to row
            row.appendChild(timeCell);
            row.appendChild(activityCell);
            row.appendChild(locationCell);
            row.appendChild(ratingCell);
            row.appendChild(hoursCell);
            
            tbody.appendChild(row);
            
            // Fetch place details asynchronously
            fetchAndDisplayPlaceDetails(item.activity, item.location, ratingCell, hoursCell);
        }
        
        dayIndex++;
    }

    // Initialize the new features after table is populated
    setTimeout(() => {
        addSocialShareButtons();
        addEnhancedVisualFeatures();
    }, 1000);
}

// Get weather for a specific day
async function getWeatherForDay(destination, date) {
    try {
        const weatherConditions = [
            { icon: '☀️', condition: 'sunny', high: 75, low: 55 },
            { icon: '⛅', condition: 'partly-cloudy', high: 68, low: 52 },
            { icon: '☁️', condition: 'cloudy', high: 62, low: 48 },
            { icon: '🌧️', condition: 'rainy', high: 58, low: 45 },
            { icon: '⛈️', condition: 'stormy', high: 65, low: 50 }
        ];
        
        const seed = date.getDate() + destination.length;
        const weatherIndex = seed % weatherConditions.length;
        const baseWeather = weatherConditions[weatherIndex];
        
        const tempVariation = (date.getDate() % 10) - 5;
        
        return {
            icon: baseWeather.icon,
            high: baseWeather.high + tempVariation,
            low: baseWeather.low + tempVariation,
            condition: baseWeather.condition
        };
    } catch (error) {
        console.error('Error getting weather:', error);
        return {
            icon: '🌤️',
            high: 70,
            low: 55,
            condition: 'partly-cloudy'
        };
    }
}

// Add enhanced visual features
function addEnhancedVisualFeatures() {
    console.log("Enhanced visual features initialized");
    
    const table = document.getElementById('itinerary-table');
    if (table) {
        table.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        table.style.borderRadius = '8px';
        table.style.overflow = 'hidden';
    }
    
    const style = document.createElement('style');
    style.textContent = `
        .day-title-with-weather {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
        }
        
        .day-title {
            font-size: 18px;
            font-weight: bold;
            color: #333;
        }
        
        .weather-info {
            font-size: 16px;
            font-weight: 600;
            color: #666;
            background: rgba(116, 185, 255, 0.1);
            padding: 4px 12px;
            border-radius: 20px;
            border: 1px solid rgba(116, 185, 255, 0.3);
        }
        
        .day-header-row {
            background: #f8f9fa !important;
        }
        
        .day-header-row td {
            padding: 15px !important;
            border-bottom: 2px solid #dee2e6 !important;
        }
    `;
    document.head.appendChild(style);
}

// Jump to day function
function jumpToDay(selectedDay) {
    const dayHeaders = document.querySelectorAll('.day-header-row');
    for (const header of dayHeaders) {
        const dayTitle = header.querySelector('.day-title');
        if (dayTitle && dayTitle.textContent.trim() === selectedDay.trim()) {
            header.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
    }
}

// Estimate activity duration based on activity type
function estimateActivityDuration(activity) {
    const activityLower = activity.toLowerCase();
    
    // Museums, galleries, historical sites
    if (activityLower.includes('museum') || activityLower.includes('gallery') || 
        activityLower.includes('historical') || activityLower.includes('palace') ||
        activityLower.includes('castle') || activityLower.includes('cathedral')) {
        return '2-3 hours';
    }
    
    // Theme parks, zoos, large attractions
    if (activityLower.includes('park') || activityLower.includes('zoo') ||
        activityLower.includes('disneyland') || activityLower.includes('theme')) {
        return '4-8 hours';
    }
    
    // Walking tours, city tours
    if (activityLower.includes('tour') || activityLower.includes('walk') ||
        activityLower.includes('explore')) {
        return '2-4 hours';
    }
    
    // Restaurants, dining
    if (activityLower.includes('restaurant') || activityLower.includes('dining') ||
        activityLower.includes('lunch') || activityLower.includes('dinner') ||
        activityLower.includes('breakfast') || activityLower.includes('cafe')) {
        return '1-2 hours';
    }
    
    // Shopping
    if (activityLower.includes('shop') || activityLower.includes('market') ||
        activityLower.includes('mall') || activityLower.includes('bazaar')) {
        return '2-3 hours';
    }
    
    // Shows, performances
    if (activityLower.includes('show') || activityLower.includes('performance') ||
        activityLower.includes('theater') || activityLower.includes('concert')) {
        return '2-3 hours';
    }
    
    // Outdoor activities
    if (activityLower.includes('hike') || activityLower.includes('beach') ||
        activityLower.includes('nature') || activityLower.includes('outdoor')) {
        return '3-5 hours';
    }
    
    // Default for other activities
    return '1-2 hours';
}

// Display map and markers
async function displayMapAndMarkers(items) {
    // Clear existing markers and paths
    currentMarkers.forEach(marker => {
        if (marker.setMap) marker.setMap(null);
        else marker.map = null;
    });
    currentMarkers = [];
    dayPaths.forEach(path => path.setMap(null));
    dayPaths = [];
    
    if (!map || !geocoder) {
        console.error("Map or Geocoder not initialized for displayMapAndMarkers.");
        return;
    }

    // Get trip details to calculate correct dates
    const tripDetails = getTripDetailsFromStorage();
    if (!tripDetails) {
        console.error('Trip details not found for map');
        return;
    }
    
    // Group items by their original day names (don't modify them)
    dayGroups = {};
    items.forEach(item => {
        const dayName = item.day;
        if (!dayGroups[dayName]) {
            dayGroups[dayName] = [];
        }
        dayGroups[dayName].push(item);
    });
    
    console.log("Day groups for map:", dayGroups);
    
    const daySelector = document.getElementById('day-selector');
    if (daySelector) {
        // Clear previous day options except for "Show all days"
        while (daySelector.options.length > 1) {
            daySelector.remove(1);
        }
        
        // Add day options using the actual day names from itinerary
        Object.keys(dayGroups).forEach(day => {
            const option = document.createElement('option');
            option.value = day;
            option.textContent = day;
            daySelector.appendChild(option);
        });
        daySelector.value = 'all'; // Reset to "Show all days"
        
        // Add event listener for day filtering
        daySelector.addEventListener('change', filterMapByDay);
    }

    const bounds = new google.maps.LatLngBounds();
    let locationsFound = 0;
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    const tripDestinationCityContext = tripDetails.destination;
    let dayIndex = 0;

    for (const [dayName, dayItems] of Object.entries(dayGroups)) {
        const dayCoordinates = [];

        for (const item of dayItems) {
            if (item.location && item.location.trim() !== "") {
                try {
                    const locationWithContext = `${item.location}, ${tripDestinationCityContext}`;
                    const position = await geocodeLocation(locationWithContext);
                    
                    const marker = new AdvancedMarkerElement({
                        position: position,
                        map: map,
                        title: `${item.activity} at ${item.time || 'Time not specified'}`
                    });

                    // Store the exact day name from the itinerary
                    markerData.set(marker, { day: dayName, activity: item.activity, time: item.time });
                    marker.dayName = dayName; // Add this property directly to the marker
                    currentMarkers.push(marker);
                    dayCoordinates.push(position);
                    bounds.extend(position);
                    locationsFound++;
                    
                    console.log(`Added marker for ${item.activity} on ${dayName}`);
                } catch (error) {
                    console.warn(`Could not geocode location: ${item.location}`, error);
                }
            }
        }

        // Create polyline for the day's route
        if (dayCoordinates.length > 1) {
            const dayPath = new google.maps.Polyline({
                path: dayCoordinates,
                geodesic: true,
                strokeColor: getColorForDay(dayIndex),
                strokeOpacity: 1.0,
                strokeWeight: 3,
                map: map
            });

            // Store the day name for filtering
            dayPath.dayName = dayName;
            dayPaths.push(dayPath);
            console.log(`Created polyline for ${dayName} with ${dayCoordinates.length} points`);
        }
        dayIndex++;
    }
    
    if (locationsFound > 0) {
        map.fitBounds(bounds);
        // Better zoom control
        google.maps.event.addListenerOnce(map, 'bounds_changed', function() {
            if (map.getZoom() > 14) {
                map.setZoom(14);
            }
            if (map.getZoom() < 10) {
                map.setZoom(10);
            }
        });
    } else if (tripDestinationCityContext) {
        try {
            const cityCenter = await geocodeLocation(tripDestinationCityContext);
            map.setCenter(cityCenter);
            map.setZoom(12);
        } catch (error) {
            console.warn(`Could not center map on ${tripDestinationCityContext}`, error);
        }
    }
    
    // Apply initial filter state
    filterMapByDay();
}

// Filter map by day function
function filterMapByDay() {
    const selectedDay = document.getElementById('day-selector')?.value || 'all';
    const bounds = new google.maps.LatLngBounds();
    let visibleMarkersExist = false;

    console.log("Filtering map by day:", selectedDay);
    console.log("Available markers:", currentMarkers.length);

    // Show/hide markers based on selected day
    currentMarkers.forEach(marker => {
        const shouldShow = selectedDay === 'all' || marker.dayName === selectedDay;
        
        if (shouldShow) {
            marker.map = map;
            bounds.extend(marker.position);
            visibleMarkersExist = true;
            console.log(`Showing marker for ${marker.dayName}`);
        } else {
            marker.map = null;
        }
    });
    
    // Show/hide paths based on selected day
    dayPaths.forEach(path => {
        const shouldShow = selectedDay === 'all' || path.dayName === selectedDay;
        path.setMap(shouldShow ? map : null);
        
        if (shouldShow && path.getPath().getLength() > 0) {
            path.getPath().forEach(point => bounds.extend(point));
        }
    });
    
    // Update map bounds for the filtered markers
    if (visibleMarkersExist) {
        map.fitBounds(bounds);
        
        // Better zoom control for filtered view
        google.maps.event.addListenerOnce(map, 'bounds_changed', function() {
            const zoom = map.getZoom();
            if (selectedDay !== 'all') {
                // For single day, zoom in more
                if (zoom > 15) map.setZoom(15);
                if (zoom < 12) map.setZoom(12);
            } else {
                // For all days, moderate zoom
                if (zoom > 14) map.setZoom(14);
                if (zoom < 10) map.setZoom(10);
            }
        });
    } else if (selectedDay !== 'all') {
        console.log(`No locations found for ${selectedDay}`);
        // Center on destination if no markers for selected day
        const tripDetails = getTripDetailsFromStorage();
        if (tripDetails?.destination) {
            geocodeLocation(tripDetails.destination).then(position => {
                map.setCenter(position);
                map.setZoom(12);
            }).catch(err => console.warn("Could not geocode destination"));
        }
    }
}

// Get color for day function
function getColorForDay(dayIndex) {
    const colors = ['#FF4C4C', '#4C8BFF', '#4CFF4C', '#FFD700', '#FF69B4', '#8A2BE2', '#FF6347', '#40E0D0'];
    return colors[dayIndex % colors.length];
}

// Add social share buttons
function addSocialShareButtons() {
    const shareContainer = document.createElement('div');
    shareContainer.className = 'share-container';
    shareContainer.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 20px;
        margin: 20px 0;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    `;
    
    shareContainer.innerHTML = `
        <h3 style="margin-bottom: 15px; color: #333; font-size: 20px;">📱 Share Your Itinerary</h3>
        <div class="share-buttons" style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button onclick="shareItinerary('twitter')" class="share-btn twitter" style="background: #1da1f2; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: 600;">🐦 Twitter</button>
            <button onclick="shareItinerary('facebook')" class="share-btn facebook" style="background: #4267b2; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: 600;">📘 Facebook</button>
            <button onclick="shareItinerary('email')" class="share-btn email" style="background: #dc3545; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: 600;">✉️ Email</button>
            <button onclick="shareItinerary('copy')" class="share-btn copy" style="background: #6c757d; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: 600;">🔗 Copy Link</button>
            <button onclick="shareItinerary('download')" class="share-btn download" style="background: #28a745; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: 600;">📸 Download Image</button>
        </div>
    `;
    
    const itineraryDisplay = document.getElementById('itinerary-display');
    if (itineraryDisplay) {
        itineraryDisplay.appendChild(shareContainer);
    }
}

// Social sharing functions
function createShareableURL() {
    const tripDetails = getTripDetailsFromStorage();
    if (!tripDetails || !itineraryData || itineraryData.length === 0) {
        return window.location.href;
    }
    
    // Create a MUCH shorter shareable URL using base64 encoding
    const shareData = {
        d: tripDetails.destination,
        s: tripDetails.departureDate,
        e: tripDetails.arrivalDate,
        p: tripDetails.preferences || [],
        i: itineraryData.slice(0, 10) // Only include first 10 activities to keep URL shorter
    };
    
    const compressed = btoa(JSON.stringify(shareData)).substring(0, 200); // Limit to 200 chars
    const baseUrl = window.location.origin + window.location.pathname.replace('second-page.html', 'index.html');
    
    return `${baseUrl}?share=${compressed}`;
}

function shareItinerary(platform) {
    const tripDetails = getTripDetailsFromStorage();
    const shareableUrl = createShareableURL();
    const text = `Check out my ${tripDetails.destination} itinerary! 🌍✈️ AI-planned ${Math.ceil((new Date(tripDetails.arrivalDate) - new Date(tripDetails.departureDate)) / (1000 * 60 * 60 * 24))} day trip with ${itineraryData.length} amazing activities.`;
    
    switch(platform) {
        case 'twitter':
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareableUrl)}`);
            break;
        case 'facebook':
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareableUrl)}`);
            break;
        case 'email':
            const subject = `My ${tripDetails.destination} Travel Itinerary`;
            const body = `${text}\n\nView the full itinerary here: ${shareableUrl}\n\nCreated with AItinerate.com`;
            window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            break;
        case 'copy':
            navigator.clipboard.writeText(shareableUrl).then(() => {
                showNotification('Shareable link copied to clipboard!');
            });
            break;
        case 'download':
            downloadShareableImage();
            break;
    }
}

function createShareableItinerary() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1200;
    canvas.height = Math.max(1600, 200 + (itineraryData.length * 40)); // Dynamic height for full itinerary
    
    // Create beautiful gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#FF4C4C');
    gradient.addColorStop(1, '#FF7676');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const tripDetails = getTripDetailsFromStorage();
    
    // Header section
    ctx.fillStyle = 'white';
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.fillText(`✈️ ${tripDetails.destination}`, 50, 80);
    
    ctx.font = '28px Arial, sans-serif';
    const duration = Math.ceil((new Date(tripDetails.arrivalDate) - new Date(tripDetails.departureDate)) / (1000 * 60 * 60 * 24));
    ctx.fillText(`${duration} Day Adventure • ${tripDetails.departureDate} - ${tripDetails.arrivalDate}`, 50, 120);
    
    // Trip stats in a nice box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(50, 150, 500, 80);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText(`📍 ${itineraryData.length} Amazing Activities`, 70, 180);
    ctx.fillText(`🎯 ${tripDetails.preferences ? tripDetails.preferences.length : 0} Personal Interests`, 70, 210);
    
    // FULL ITINERARY - Show ALL activities, not just highlights
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillText('📋 Complete Itinerary:', 50, 280);
    
    ctx.font = '18px Arial, sans-serif';
    let yPosition = 320;
    let currentDay = '';
    
    itineraryData.forEach((activity, index) => {
        // Add day header when day changes
        if (activity.day !== currentDay) {
            currentDay = activity.day;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(50, yPosition - 5, 1100, 30);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 20px Arial, sans-serif';
            ctx.fillText(`📅 ${currentDay}`, 60, yPosition + 15);
            yPosition += 40;
            ctx.font = '18px Arial, sans-serif';
        }
        
        // Activity details
        let activityText = `${activity.time || 'TBD'} - ${activity.activity}`;
        if (activityText.length > 80) {
            activityText = activityText.substring(0, 77) + '...';
        }
        
        ctx.fillStyle = 'white';
        ctx.fillText(`  • ${activityText}`, 70, yPosition);
        
        // Location on next line if it exists
        if (activity.location) {
            ctx.font = '16px Arial, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            let locationText = `    📍 ${activity.location}`;
            if (locationText.length > 90) {
                locationText = locationText.substring(0, 87) + '...';
            }
            ctx.fillText(locationText, 70, yPosition + 20);
            yPosition += 45;
            ctx.font = '18px Arial, sans-serif';
        } else {
            yPosition += 30;
        }
    });
    
    // Add preferences if available
    if (tripDetails.preferences && tripDetails.preferences.length > 0) {
        yPosition += 20;
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px, Arial, sans-serif';
        ctx.fillText('🎨 Tailored for:', 50, yPosition);
        yPosition += 30;
        
        ctx.font = '18px Arial, sans-serif';
        const prefsText = tripDetails.preferences.join(' • ');
        ctx.fillText(prefsText, 50, yPosition);
    }
    
    // Enhanced branding section at bottom
    const footerY = canvas.height - 80;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(0, footerY, canvas.width, 80);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText('🤖 AI-Planned by AItinerate.com', 50, footerY + 30);
    
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText('Create your own perfect itinerary in seconds!', 50, footerY + 55);
    
    return canvas.toDataURL('image/png');
}

// Download shareable image function
function downloadShareableImage() {
    try {
        const imageDataUrl = createShareableItinerary();
        const link = document.createElement('a');
        const tripDetails = getTripDetailsFromStorage();
        const fileName = `${tripDetails.destination.replace(/[^a-zA-Z0-9]/g, '_')}_Itinerary_${new Date().toISOString().split('T')[0]}.png`;
        
        link.download = fileName;
        link.href = imageDataUrl;
        link.click();
        
        showNotification('✅ Itinerary image downloaded successfully!');
    } catch (error) {
        console.error('Error downloading image:', error);
        showNotification('❌ Error downloading image. Please try again.', 'error');
    }
}

// Fetch place details from Google Places API
async function fetchPlaceDetails(activity, location) {
    try {
        const tripDetails = getTripDetailsFromStorage();
        if (!tripDetails) return { found: false };

        // Enhanced base URL detection for Vercel and Render
        let baseUrl;
        const hostname = window.location.hostname;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            // Local development - use port 10000 to match server
            baseUrl = `http://localhost:10000`;
        } else {
            // Production on Vercel or Render
            baseUrl = window.location.origin;
        }

        const params = new URLSearchParams({
            name: activity,
            location: `${location}, ${tripDetails.destination}`
        });

        const response = await fetch(`${baseUrl}/api/place-details?${params.toString()}`);
        
        if (!response.ok) {
            console.warn(`Place details API error: ${response.status}`);
            return { found: false };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching place details:', error);
        return { found: false };
    }
}

// Fetch activity image - disable for now since API doesn't exist
async function fetchActivityImage(activity, location) {
    return null;
}

// Fetch and display place details for each activity
async function fetchAndDisplayPlaceDetails(activity, location, ratingCell, hoursCell) {
    try {
        const placeDetails = await fetchPlaceDetails(activity, location);
        
        if (placeDetails.found) {
            if (placeDetails.rating) {
                const stars = '★'.repeat(Math.floor(placeDetails.rating));
                const emptyStars = '☆'.repeat(5 - Math.floor(placeDetails.rating));
                
                const imageUrl = placeDetails.imageUrl || await fetchActivityImage(activity, location);
                
                ratingCell.innerHTML = `
                    <div class="place-rating enhanced">
                        ${imageUrl ? `<div class="rating-image">
                            <img src="${imageUrl}" 
                                 alt="${activity}" 
                                 style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; margin-bottom: 8px; cursor: pointer;"
                                 onerror="this.style.display='none'"
                                 onclick="showImageModal('${imageUrl}', '${activity.replace(/'/g, "\\'")}')">
                        </div>` : ''}
                        <div class="stars">${stars}${emptyStars}</div>
                        <div class="rating-value">${placeDetails.rating.toFixed(1)}</div>
                        <div class="rating-count">(${placeDetails.totalRatings || 0})</div>
                        ${placeDetails.youtubeUrl ? `<a href="${placeDetails.youtubeUrl}" target="_blank" class="youtube-link">🎥 Watch</a>` : ''}
                    </div>
                `;
            } else {
                ratingCell.innerHTML = '<div class="rating-value">N/A</div>';
            }
            
            const usefulInfo = generateUsefulActivityInfo(placeDetails, activity);
            
            hoursCell.innerHTML = `
                <div class="activity-info enhanced">
                    ${usefulInfo}
                    ${placeDetails.url ? `<a href="${placeDetails.url}" target="_blank" class="google-maps-link">📍 View on Google Maps</a>` : ''}
                </div>
            `;
        } else {
            ratingCell.innerHTML = '<div class="rating-value">N/A</div>';
            hoursCell.innerHTML = '<div class="activity-info">No additional info available</div>';
        }
    } catch (error) {
        console.error('Error fetching place details:', error);
        ratingCell.innerHTML = '<div class="rating-value">Error</div>';
        hoursCell.innerHTML = '<div class="activity-info">Error loading info</div>';
    }
}

// Generate useful activity information instead of problematic hours
function generateUsefulActivityInfo(placeDetails, activity) {
    const info = [];
    
    // Price level indicator
    if (placeDetails.priceLevel !== undefined) {
        const dollarSigns = '$'.repeat(placeDetails.priceLevel + 1);
        const priceText = ['Free', 'Inexpensive', 'Moderate', 'Expensive', 'Very Expensive'][placeDetails.priceLevel];
        info.push(`<div class="price-info">💰 ${dollarSigns} ${priceText}</div>`);
    }
    
    // Activity type indicator
    const activityType = getActivityType(activity);
    if (activityType) {
        info.push(`<div class="activity-type">${activityType.icon} ${activityType.label}</div>`);
    }
    
    // Duration estimate
    const duration = estimateActivityDuration(activity);
    info.push(`<div class="duration-info">⏱️ ${duration}</div>`);
    
    // Helpful tips
    const tips = getActivityTips(activity);
    if (tips.length > 0) {
        info.push(`<div class="activity-tips">${tips.join(' ')}</div>`);
    }
    
    return info.join('');
}

// Determine activity type with appropriate icon
function getActivityType(activity) {
    const activityLower = activity.toLowerCase();
    
    if (activityLower.includes('museum') || activityLower.includes('gallery')) {
        return { icon: '🏛️', label: 'Museum/Gallery' };
    }
    if (activityLower.includes('restaurant') || activityLower.includes('dining') || 
        activityLower.includes('lunch') || activityLower.includes('dinner')) {
        return { icon: '🍽️', label: 'Dining' };
    }
    if (activityLower.includes('park') || activityLower.includes('garden') || 
        activityLower.includes('outdoor')) {
        return { icon: '🌳', label: 'Outdoor' };
    }
    if (activityLower.includes('tour') || activityLower.includes('visit') || activityLower.includes('explore')) {
        return { icon: '🗺️', label: 'Sightseeing' };
    }
    if (activityLower.includes('shop') || activityLower.includes('market')) {
        return { icon: '🛍️', label: 'Shopping' };
    }
    if (activityLower.includes('show') || activityLower.includes('theater') || 
        activityLower.includes('performance')) {
        return { icon: '🎭', label: 'Entertainment' };
    }
    if (activityLower.includes('beach')) {
        return { icon: '🏖️', label: 'Beach' };
    }
    if (activityLower.includes('historical') || activityLower.includes('monument')) {
        return { icon: '🏺', label: 'Historical' };
    }
    
    return { icon: '📍', label: 'Attraction' };
}

// Get helpful tips for activities
function getActivityTips(activity) {
    const tips = [];
    const activityLower = activity.toLowerCase();
    
    if (activityLower.includes('museum') || activityLower.includes('gallery')) {
        tips.push('💡 Consider audio guide');
    }
    if (activityLower.includes('restaurant') && activityLower.includes('dinner')) {
        tips.push('📞 Reservations recommended');
    }
    if (activityLower.includes('beach') || activityLower.includes('outdoor')) {
        tips.push('☀️ Check weather');
    }
    if (activityLower.includes('shopping') || activityLower.includes('market')) {
        tips.push('💳 Bring payment method');
    }
    if (activityLower.includes('tour')) {
        tips.push('👟 Comfortable shoes');
    }
    if (activityLower.includes('popular') || activityLower.includes('famous')) {
        tips.push('🎫 Book tickets ahead');
    }
    
    return tips;
}

// Helper function to group activities by day
function groupActivitiesByDay() {
    const dayGroups = {};
    itineraryData.forEach(item => {
        if (!dayGroups[item.day]) dayGroups[item.day] = [];
        dayGroups[item.day].push(item);
    });
    return dayGroups;
}

// Export to PDF function
function exportToPDF() {
    try {
        const tripDetails = getTripDetailsFromStorage();
        if (!tripDetails || !itineraryData || itineraryData.length === 0) {
            alert('No itinerary data to export');
            return;
        }

        if (typeof jsPDF === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = function() {
                createPDF(tripDetails);
            };
            document.head.appendChild(script);
        } else {
            createPDF(tripDetails);
        }
    } catch (error) {
        console.error('Error loading PDF export:', error);
        alert('Error loading PDF export functionality. Please try again.');
    }
}

function createPDF(tripDetails) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);
        
        // COMPACT RED HEADER
        doc.setFillColor(255, 76, 76);
        doc.rect(0, 0, pageWidth, 25, 'F');
        
        // Compact title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('AItinerate', margin, 15);
        
        // Smaller subtitle
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('AI Travel Planning', margin, 21);
        
        let yPosition = 35;
        
        // COMPACT TRIP INFO
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(tripDetails.destination, margin, yPosition);
        
        yPosition += 10;
        
        // Compact date range
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const startDate = new Date(tripDetails.departureDate);
        const endDate = new Date(tripDetails.arrivalDate);
        const dateText = `${startDate.toLocaleDateString('en-US', { 
            month: '2-digit', day: '2-digit', year: 'numeric' 
        })} - ${endDate.toLocaleDateString('en-US', { 
            month: '2-digit', day: '2-digit', year: 'numeric' 
        })}`;
        doc.text(dateText, margin, yPosition);
        
        yPosition += 8;
        
        // Compact interests
        if (tripDetails.preferences && tripDetails.preferences.length > 0) {
            doc.text(`Interests: ${tripDetails.preferences.join(', ')}`, margin, yPosition);
            yPosition += 12;
        } else {
            yPosition += 5;
        }
        
        // SUPER CONDENSED ITINERARY
        let currentDay = '';
        let dayNumber = 1;
        
        itineraryData.forEach((activity, index) => {
            // Check for new page - much more generous space usage
            if (yPosition > pageHeight - 25) {
                doc.addPage();
                yPosition = 15;
            }
            
            // COMPACT DAY HEADER
            if (activity.day !== currentDay) {
                currentDay = activity.day;
                
                if (index > 0) {
                    yPosition += 5; // Minimal space between days
                }
                
                // Very small red day divider
                doc.setFillColor(255, 76, 76);
                doc.rect(margin, yPosition - 2, contentWidth, 8, 'F');
                
                // Compact day text
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.text(`Day ${dayNumber}: ${currentDay}`, margin + 2, yPosition + 3);
                
                dayNumber++;
                yPosition += 10;
            }
            
            // VERY COMPACT ACTIVITY ENTRY
            doc.setTextColor(60, 60, 60);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            
            // Time - very close to left margin
            if (activity.time) {
                doc.text(activity.time, margin + 3, yPosition);
            }
            
            // Activity - close to time column
            doc.setFont('helvetica', 'bold');
            const activityText = activity.activity || 'Activity';
            doc.text(activityText, margin + 35, yPosition);
            
            yPosition += 6; // Minimal line spacing
            
            // Location - very compact, smaller font
            if (activity.location) {
                doc.setFontSize(6);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(120, 120, 120);
                doc.text(activity.location, margin + 35, yPosition);
                yPosition += 5; // Very tight spacing
            } else {
                yPosition += 2;
            }
        });
        
        // Compact footer
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setTextColor(120, 120, 120);
            doc.setFontSize(6);
            doc.text('AItinerate.com', margin, pageHeight - 5);
            doc.text(`${i}/${totalPages}`, pageWidth - margin - 10, pageHeight - 5);
        }
        
        // Save
        const fileName = `${tripDetails.destination.replace(/[^a-zA-Z0-9]/g, '_')}_Itinerary.pdf`;
        doc.save(fileName);
        
        showNotification('✅ PDF downloaded successfully!');
        
    } catch (error) {
        console.error('Error creating PDF:', error);
        alert('Error creating PDF file. Please try again.');
    }
}

// Export to Excel function
function exportToExcel() {
    try {
        const tripDetails = getTripDetailsFromStorage();
        if (!tripDetails || !itineraryData || itineraryData.length === 0) {
            alert('No itinerary data to export');
            return;
        }

        if (typeof XLSX === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.onload = function() {
                createExcel(tripDetails);
            };
            document.head.appendChild(script);
        } else {
            createExcel(tripDetails);
        }
    } catch (error) {
        console.error('Error loading Excel export:', error);
        alert('Error loading Excel export functionality. Please try again.');
    }
}

function createExcel(tripDetails) {
    try {
        const workbook = XLSX.utils.book_new();
        
        // TAB 1: ITINERARY (matching your screenshot format)
        const itineraryData_ws = [];
        itineraryData_ws.push(['AItinerate - AI Travel Planning', '', '', '', '', '', `Generated: ${new Date().toLocaleDateString()}`]);
        itineraryData_ws.push([`Destination: ${tripDetails.destination}`, '', '', '', '', '', '']);
        itineraryData_ws.push([`Travel Dates: ${tripDetails.departureDate} - ${tripDetails.arrivalDate}`, '', '', '', '', '', '']);
        itineraryData_ws.push([`Interests: ${tripDetails.preferences ? tripDetails.preferences.join(', ') : 'None'}`, '', '', '', '', '', '']);
        itineraryData_ws.push(['', '', '', '', '', '', '']);
        itineraryData_ws.push(['📅 Day', '🕐 Time', '🎯 Activity', '📍 Location', '🏷️ Type', '⭐ Priority']);
        
        // Group by day and add each activity
        const dayGroups = groupActivitiesByDay();
        
        Object.entries(dayGroups).forEach(([dayName, dayActivities]) => {
            dayActivities.forEach((activity, index) => {
                const activityType = getSimpleActivityType(activity.activity);
                const priority = index < 2 ? '⭐⭐' : '⭐'; // First 2 activities per day get higher priority
                
                itineraryData_ws.push([
                    index === 0 ? dayName : '', // Only show day name on first activity
                    activity.time || 'Flexible',
                    activity.activity,
                    activity.location || 'Location TBD',
                    `${getActivityIcon(activityType)} ${activityType}`,
                    priority
                ]);
            });
        });

        const itineraryWS = XLSX.utils.aoa_to_sheet(itineraryData_ws);
        itineraryWS['!cols'] = [
            { width: 25 }, { width: 12 }, { width: 50 }, 
            { width: 35 }, { width: 18 }, { width: 12 }
        ];
        XLSX.utils.book_append_sheet(workbook, itineraryWS, "Itinerary");

        // TAB 2: SUMMARY (matching your screenshot)
        const summaryData = [];
        summaryData.push(['⭐ TRIP SUMMARY', '', '']);
        summaryData.push(['', '', '']);
        summaryData.push(['📊 Trip Statistics', '', '']);
        
        const startDate = new Date(tripDetails.departureDate);
        const endDate = new Date(tripDetails.arrivalDate);
        const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        summaryData.push(['Total Days:', duration, '']);
        summaryData.push(['Total Activities:', itineraryData.length, '']);
        summaryData.push(['Departure Date:', startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }), '']);
        summaryData.push(['Return Date:', endDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }), '']);
        summaryData.push(['', '', '']);
        
        // Activity breakdown with emojis
        summaryData.push(['🎯 Activity Breakdown', '', '']);
        const activityTypes = {};
        itineraryData.forEach(activity => {
            const type = getSimpleActivityType(activity.activity);
            activityTypes[type] = (activityTypes[type] || 0) + 1;
        });
        
        const totalActivities = itineraryData.length;
        Object.entries(activityTypes).forEach(([type, count]) => {
            const percentage = Math.round((count / totalActivities) * 100);
            summaryData.push([`${getActivityIcon(type)} ${type}`, count, `${percentage}%`]);
        });
        
        summaryData.push(['', '', '']);
        summaryData.push(['✈️ Travel Checklist', '', '']);
        summaryData.push(['☐ Book flights', '', '']);
        summaryData.push(['☐ Book accommodations', '', '']);
        summaryData.push(['☐ Check passport/visa requirements', '', '']);
        summaryData.push(['☐ Get travel insurance', '', '']);
        summaryData.push(['☐ Notify bank of travel', '', '']);
        summaryData.push(['☐ Download offline maps', '', '']);
        summaryData.push(['☐ Pack essentials', '', '']);
        summaryData.push(['☐ Confirm all reservations', '', '']);

        const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
        summaryWS['!cols'] = [{ width: 25 }, { width: 15 }, { width: 15 }];
        XLSX.utils.book_append_sheet(workbook, summaryWS, "Summary");

        // TAB 3: PACKING (comprehensive packing list)
        const packingData = [];
        packingData.push(['🧳 PACKING LIST', '', '']);
        packingData.push(['', '', '']);
        packingData.push(['👕 Clothing', '', '']);
        packingData.push(['☐ Shirts/tops', '', '']);
        packingData.push(['☐ Pants/bottoms', '', '']);
        packingData.push(['☐ Underwear', '', '']);
        packingData.push(['☐ Socks', '', '']);
        packingData.push(['☐ Pajamas', '', '']);
        packingData.push(['☐ Jacket/coat', '', '']);
        packingData.push(['☐ Comfortable walking shoes', '', '']);
        packingData.push(['☐ Dress shoes (if needed)', '', '']);
        packingData.push(['', '', '']);
        packingData.push(['🧴 Toiletries', '', '']);
        packingData.push(['☐ Toothbrush & toothpaste', '', '']);
        packingData.push(['☐ Shampoo & conditioner', '', '']);
        packingData.push(['☐ Body wash/soap', '', '']);
        packingData.push(['☐ Deodorant', '', '']);
        packingData.push(['☐ Skincare products', '', '']);
        packingData.push(['☐ Medications', '', '']);
        packingData.push(['☐ Sunscreen', '', '']);
        packingData.push(['☐ First aid kit', '', '']);
        packingData.push(['', '', '']);
        packingData.push(['📱 Electronics', '', '']);
        packingData.push(['☐ Phone & charger', '', '']);
        packingData.push(['☐ Camera & accessories', '', '']);
        packingData.push(['☐ Power bank', '', '']);
        packingData.push(['☐ Travel adapter', '', '']);
        packingData.push(['☐ Headphones', '', '']);
        packingData.push(['☐ Laptop/tablet (if needed)', '', '']);
        packingData.push(['', '', '']);
        packingData.push(['📄 Documents', '', '']);
        packingData.push(['☐ Passport/ID', '', '']);
        packingData.push(['☐ Flight tickets', '', '']);
        packingData.push(['☐ Hotel confirmations', '', '']);
        packingData.push(['☐ Travel insurance', '', '']);
        packingData.push(['☐ Emergency contacts', '', '']);
        packingData.push(['☐ Copies of important documents', '', '']);
        packingData.push(['', '', '']);
        packingData.push(['🎯 Activities', '', '']);

        const packingWS = XLSX.utils.aoa_to_sheet(packingData);
        packingWS['!cols'] = [{ width: 35 }, { width: 15 }, { width: 15 }];
        XLSX.utils.book_append_sheet(workbook, packingWS, "Packing");

        // TAB 4: NOTES (travel tips and useful info)
        const notesData = [];
        notesData.push(['📝 TRAVEL NOTES', '', '']);
        notesData.push(['', '', '']);
        notesData.push([`Tips for ${tripDetails.destination}`, '', '']);
        notesData.push(['', '', '']);
        notesData.push(['⭐ Must-Know Information:', '', '']);
        notesData.push(['• Check local customs and etiquette', '', '']);
        notesData.push(['• Learn basic local phrases', '', '']);
        notesData.push(['• Research tipping culture', '', '']);
        notesData.push(['• Check local weather patterns', '', '']);
        notesData.push(['• Identify emergency services numbers', '', '']);
        notesData.push(['', '', '']);
        notesData.push(['📱 Useful Apps to Download:', '', '']);
        notesData.push(['• Google Translate', '', '']);
        notesData.push(['• Google Maps (offline)', '', '']);
        notesData.push(['• Local transportation apps', '', '']);
        notesData.push(['• Weather app', '', '']);
        notesData.push(['• Currency converter', '', '']);
        notesData.push(['', '', '']);
        notesData.push(['✏️ Personal Notes:', '', '']);
        // Add blank lines for personal notes
        for (let i = 0; i < 20; i++) {
            notesData.push(['', '', '']);
        }

        const notesWS = XLSX.utils.aoa_to_sheet(notesData);
        notesWS['!cols'] = [{ width: 50 }, { width: 20 }, { width: 20 }];
        XLSX.utils.book_append_sheet(workbook, notesWS, "Notes");

        // Save the file
        const fileName = `${tripDetails.destination.replace(/[^a-zA-Z0-9]/g, '_')}_Itinerary.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
        showNotification('✅ Comprehensive Excel itinerary downloaded!');
        
    } catch (error) {
        console.error('Error creating Excel:', error);
        alert('Error creating Excel file. Please try again.');
    }
}

// Helper function to get activity icons
function getActivityIcon(activityType) {
    const icons = {
        'Culture': '🏛️',
        'Dining': '🍽️', 
        'Nature': '🌳',
        'Sightseeing': '🗺️',
        'Shopping': '🛍️',
        'Entertainment': '🎭',
        'Beach': '🏖️',
        'Historical': '🏺',
        'Activity': '📍'
    };
    return icons[activityType] || '📍';
}

// Export to Calendar function (Enhanced ICS format with better Google Calendar support)

function exportToCalendar() {
    try {
        const tripDetails = getTripDetailsFromStorage();
        if (!tripDetails || !itineraryData || itineraryData.length === 0) {
            alert('No itinerary data to export');
            return;
        }

        // Show options for different calendar formats
        const calendarChoice = confirm(
            "Choose calendar export format:\n\n" +
            "OK = Enhanced Google Calendar Package (recommended)\n" +
            "Cancel = Simple ICS file"
        );

        if (calendarChoice) {
            exportGoogleCalendarPackage(tripDetails);
        } else {
            exportSimpleICS(tripDetails);
        }

    } catch (error) {
        console.error('Error creating calendar:', error);
        alert('Error creating calendar file. Please try again.');
    }
}

// Export enhanced Google Calendar package
async function exportGoogleCalendarPackage(tripDetails) {
    try {
        // Load JSZip library if not already loaded
        if (typeof JSZip === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            await new Promise(resolve => {
                script.onload = resolve;
                document.head.appendChild(script);
            });
        }

        const zip = new JSZip();
        
        // Create main calendar file with enhanced Google Calendar support
        const mainCalendar = createEnhancedICS(tripDetails);
        zip.file(`${tripDetails.destination.replace(/[^a-zA-Z0-9]/g, '_')}_Complete_Trip.ics`, mainCalendar);

        // Create separate calendar for each day (for better organization)
        const dayGroups = groupActivitiesByDay();
        const dayNames = Object.keys(dayGroups);
        
        dayNames.forEach((dayName, dayIndex) => {
            const dayCalendar = createDaySpecificICS(tripDetails, dayName, dayGroups[dayName], dayIndex);
            const dayFileName = `Day_${dayIndex + 1}_${dayName.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
            zip.file(dayFileName, dayCalendar);
        });

        // Create a comprehensive README file
        const readmeContent = createCalendarReadme(tripDetails);
        zip.file('README_Import_Instructions.txt', readmeContent);

        // Create a quick import HTML file for easy Google Calendar import
        const importHTML = createGoogleCalendarImportHTML(tripDetails);
        zip.file('Quick_Import_Google_Calendar.html', importHTML);

        // Generate and download the zip file
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${tripDetails.destination.replace(/[^a-zA-Z0-9]/g, '_')}_Calendar_Package.zip`;
        link.click();

        showNotification('✅ Calendar package downloaded! Check the README for import instructions.');

    } catch (error) {
        console.error('Error creating calendar package:', error);
        // Fallback to simple ICS
        exportSimpleICS(tripDetails);
    }
}

// Create enhanced ICS with better Google Calendar support
function createEnhancedICS(tripDetails) {
    const dayGroups = groupActivitiesByDay();
    const dayNames = Object.keys(dayGroups);
    
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//AItinerate//Travel Itinerary//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:🌍 ${tripDetails.destination} Trip`,
        `X-WR-CALDESC:Complete travel itinerary for ${tripDetails.destination} • ${Math.ceil((new Date(tripDetails.arrivalDate) - new Date(tripDetails.departureDate)) / (1000 * 60 * 60 * 24))} days • Generated by AItinerate`,
        'X-WR-TIMEZONE:America/New_York',
        `X-WR-RELCALID:${tripDetails.destination.toLowerCase().replace(/[^a-z0-9]/g, '-')}-trip`,
        'COLOR:FF4C4C' // Red color for the calendar
    ];

    // Add trip overview event
    const tripStart = new Date(tripDetails.departureDate);
    const tripEnd = new Date(tripDetails.arrivalDate);
    const tripOverviewId = `trip-overview-${Date.now()}@aitinerate.com`;
    
    icsContent.push(
        'BEGIN:VEVENT',
        `UID:${tripOverviewId}`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '')}Z`,
        `DTSTART;VALUE=DATE:${tripStart.toISOString().slice(0, 10).replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${tripEnd.toISOString().slice(0, 10).replace(/-/g, '')}`,
        `SUMMARY:🌍 ${tripDetails.destination} Trip`,
        `DESCRIPTION:Your amazing ${Math.ceil((tripEnd - tripStart) / (1000 * 60 * 60 * 24))}-day adventure to ${tripDetails.destination}!\\n\\n📍 ${itineraryData.length} activities planned\\n🎯 Interests: ${tripDetails.preferences ? tripDetails.preferences.join(', ') : 'None'}\\n\\n✈️ Created with AItinerate.com`,
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT',
        'CATEGORIES:TRAVEL,VACATION',
        'END:VEVENT'
    );

    // Add each activity with enhanced details
    itineraryData.forEach((activity, index) => {
        const eventId = `activity-${index}-${Date.now()}@aitinerate.com`;
        const now = new Date().toISOString().replace(/[-:.]/g, '');
        
        const activityDate = new Date(tripDetails.departureDate);
        const dayIndex = dayNames.indexOf(activity.day);
        if (dayIndex >= 0) {
            activityDate.setDate(activityDate.getDate() + dayIndex);
        }
        
        let startTime = '090000';
        let endTime = '110000';
        
        if (activity.time) {
            const timeMatch = activity.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = timeMatch[2];
                const ampm = timeMatch[3].toUpperCase();
                
                if (ampm === 'PM' && hours !== 12) hours += 12;
                if (ampm === 'AM' && hours === 12) hours = 0;
                
                startTime = `${hours.toString().padStart(2, '0')}${minutes}00`;
                
                // Estimate duration based on activity type
                const duration = estimateActivityDurationMinutes(activity.activity);
                const endDate = new Date(activityDate);
                endDate.setHours(hours, parseInt(minutes) + duration);
                endTime = `${endDate.getHours().toString().padStart(2, '0')}${endDate.getMinutes().toString().padStart(2, '0')}00`;
            }
        }
        
        const dateStr = activityDate.toISOString().slice(0, 10).replace(/-/g, '');
        const activityType = getActivityType(activity.activity);
        
        icsContent.push(
            'BEGIN:VEVENT',
            `UID:${eventId}`,
            `DTSTAMP:${now}`,
            `DTSTART:${dateStr}T${startTime}Z`,
            `DTEND:${dateStr}T${endTime}Z`,
            `SUMMARY:${activityType.icon} ${activity.activity}`,
            `LOCATION:${activity.location || ''}`,
            `DESCRIPTION:${activity.day} Activity\\n\\n🕐 Time: ${activity.time || 'Flexible'}\\n📍 Location: ${activity.location || 'TBD'}\\n${activityType.icon} Type: ${activityType.label}\\n\\n💡 Tip: ${getActivityTips(activity.activity)[0] || 'Enjoy the experience!'}\\n\\n✈️ Part of your ${tripDetails.destination} itinerary\\nCreated with AItinerate.com`,
            'STATUS:CONFIRMED',
            'TRANSP:OPAQUE',
            `CATEGORIES:TRAVEL,${activityType.label.toUpperCase()}`,
            'END:VEVENT'
        );
    });

    icsContent.push('END:VCALENDAR');
    return icsContent.join('\r\n');
}

// Create day-specific ICS file
function createDaySpecificICS(tripDetails, dayName, dayActivities, dayIndex) {
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//AItinerate//Travel Itinerary//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${dayName} - ${tripDetails.destination}`,
        `X-WR-CALDESC:Day ${dayIndex + 1} activities for ${tripDetails.destination} trip`,
        'X-WR-TIMEZONE:America/New_York'
    ];

    const activityDate = new Date(tripDetails.departureDate);
    activityDate.setDate(activityDate.getDate() + dayIndex);

    dayActivities.forEach((activity, index) => {
        const eventId = `day${dayIndex}-activity${index}-${Date.now()}@aitinerate.com`;
        const now = new Date().toISOString().replace(/[-:.]/g, '');
        
        let startTime = '090000';
        let endTime = '110000';
        
        if (activity.time) {
            const timeMatch = activity.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = timeMatch[2];
                const ampm = timeMatch[3].toUpperCase();
                
                if (ampm === 'PM' && hours !== 12) hours += 12;
                if (ampm === 'AM' && hours === 12) hours = 0;
                
                startTime = `${hours.toString().padStart(2, '0')}${minutes}00`;
                
                const duration = estimateActivityDurationMinutes(activity.activity);
                const endDate = new Date(activityDate);
                endDate.setHours(hours, parseInt(minutes) + duration);
                endTime = `${endDate.getHours().toString().padStart(2, '0')}${endDate.getMinutes().toString().padStart(2, '0')}00`;
            }
        }
        
        const dateStr = activityDate.toISOString().slice(0, 10).replace(/-/g, '');
        const activityType = getActivityType(activity.activity);
        
        icsContent.push(
            'BEGIN:VEVENT',
            `UID:${eventId}`,
            `DTSTAMP:${now}`,
            `DTSTART:${dateStr}T${startTime}Z`,
            `DTEND:${dateStr}T${endTime}Z`,
            `SUMMARY:${activityType.icon} ${activity.activity}`,
            `LOCATION:${activity.location || ''}`,
            `DESCRIPTION:${dayName} - Activity ${index + 1}\\n\\n🕐 ${activity.time || 'Flexible'}\\n📍 ${activity.location || 'TBD'}\\n\\n${activityType.icon} ${activityType.label}\\n\\n✈️ ${tripDetails.destination} Trip\\nCreated with AItinerate.com`,
            'STATUS:CONFIRMED',
            'TRANSP:OPAQUE',
            `CATEGORIES:TRAVEL,${activityType.label.toUpperCase()}`,
            'END:VEVENT'
        );
    });

    icsContent.push('END:VCALENDAR');
    return icsContent.join('\r\n');
}

// Helper function to estimate activity duration in minutes
function estimateActivityDurationMinutes(activity) {
    const activityLower = activity.toLowerCase();
    
    if (activityLower.includes('museum') || activityLower.includes('gallery')) return 180; // 3 hours
    if (activityLower.includes('park') || activityLower.includes('zoo') || activityLower.includes('theme')) return 360; // 6 hours
    if (activityLower.includes('tour') || activityLower.includes('explore')) return 150; // 2.5 hours
    if (activityLower.includes('lunch') || activityLower.includes('breakfast')) return 90; // 1.5 hours
    if (activityLower.includes('dinner')) return 120; // 2 hours
    if (activityLower.includes('shopping')) return 120; // 2 hours
    if (activityLower.includes('show') || activityLower.includes('performance')) return 150; // 2.5 hours
    if (activityLower.includes('beach') || activityLower.includes('outdoor')) return 240; // 4 hours
    
    return 120; // 2 hours default
}

// Create README file for calendar import
function createCalendarReadme(tripDetails) {
    return `🌍 ${tripDetails.destination} Trip Calendar Package
Generated by AItinerate.com

📅 WHAT'S INCLUDED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✈️ Complete Trip Calendar (${tripDetails.destination.replace(/[^a-zA-Z0-9]/g, '_')}_Complete_Trip.ics)
   - All ${itineraryData.length} activities in one calendar
   - ${Math.ceil((new Date(tripDetails.arrivalDate) - new Date(tripDetails.departureDate)) / (1000 * 60 * 60 * 24))} days from ${tripDetails.departureDate} to ${tripDetails.arrivalDate}
   - Color-coded by activity type

📱 Individual Day Calendars
   - Separate .ics file for each day
   - Perfect if you want to share specific days with travel companions

🚀 GOOGLE CALENDAR IMPORT (EASIEST METHOD):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

METHOD 1 - Quick Import (Recommended):
1. Open "Quick_Import_Google_Calendar.html" in your browser
2. Click the Google Calendar import links
3. Each calendar will open directly in Google Calendar
4. Click "Add Calendar" for each one

METHOD 2 - Manual Import:
1. Go to calendar.google.com
2. Click the "+" next to "Other calendars"
3. Select "Import"
4. Choose the .ics file(s) you want to import
5. Select which Google Calendar to add them to
6. Click "Import"

📱 MOBILE IMPORT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

iOS (iPhone/iPad):
1. Email the .ics files to yourself
2. Tap the .ics file in your email
3. Choose "Add to Calendar"

Android:
1. Email the .ics files to yourself
2. Download and tap the .ics file
3. Choose your calendar app to import

🎯 PRO TIPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Import the complete trip calendar for overview
✓ Create a new Google Calendar specifically for your trip
✓ Set up notifications 1 hour before each activity
✓ Share individual day calendars with travel companions
✓ The calendar includes estimated durations for each activity
✓ Activities are categorized for easy filtering

⚠️ TIMEZONE NOTE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Times are set in Eastern Time (America/New_York). 
Google Calendar will automatically adjust to your local timezone.
You may want to adjust times based on your destination's timezone.

🆘 NEED HELP?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Visit AItinerate.com for support or to create more itineraries!

Happy travels! ✈️🌟`;
}

// Create HTML file for easy Google Calendar import
function createGoogleCalendarImportHTML(tripDetails) {
    const dayGroups = groupActivitiesByDay();
    const dayNames = Object.keys(dayGroups);
    
    let dayLinks = '';
    dayNames.forEach((dayName, index) => {
        const fileName = `Day_${index + 1}_${dayName.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
        dayLinks += `
        <div class="calendar-option">
            <h3>📅 ${dayName}</h3>
            <p>${dayGroups[dayName].length} activities</p>
            <a href="data:text/calendar;charset=utf8,${encodeURIComponent(createDaySpecificICS(tripDetails, dayName, dayGroups[dayName], index))}" 
               download="${fileName}" class="import-btn">
                📥 Import ${dayName}
            </a>
        </div>`;
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${tripDetails.destination} Trip - Calendar Import</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { text-align: center; background: #FF4C4C; color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; }
        .calendar-section { background: white; padding: 25px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .calendar-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .calendar-option { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .import-btn { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 5px; }
        .import-btn:hover { background: #218838; }
        .complete-trip { background: #FF4C4C; }
        .complete-trip:hover { background: #e63946; }
        .instructions { background: #e3f2fd; padding: 20px; border-radius: 8px; margin-top: 20px; }
        .step { margin: 10px 0; padding: 10px; background: white; border-radius: 6px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🌍 ${tripDetails.destination} Trip</h1>
        <p>Easy Google Calendar Import</p>
        <p>${tripDetails.departureDate} - ${tripDetails.arrivalDate}</p>
    </div>

    <div class="calendar-section">
        <h2>📱 Complete Trip Calendar</h2>
        <p>Import all ${itineraryData.length} activities at once:</p>
        <div style="text-align: center;">
            <a href="data:text/calendar;charset=utf8,${encodeURIComponent(createEnhancedICS(tripDetails))}" 
               download="${tripDetails.destination.replace(/[^a-zA-Z0-9]/g, '_')}_Complete_Trip.ics" 
               class="import-btn complete-trip">
                📥 Import Complete Trip
            </a>
        </div>
    </div>

    <div class="calendar-section">
        <h2>📅 Individual Days</h2>
        <p>Import specific days separately:</p>
        <div class="calendar-grid">
            ${dayLinks}
        </div>
    </div>

    <div class="instructions">
        <h3>📝 Import Instructions:</h3>
        <div class="step">
            <strong>Step 1:</strong> Click any "Import" button above
        </div>
        <div class="step">
            <strong>Step 2:</strong> The .ics file will download automatically
        </div>
        <div class="step">
            <strong>Step 3:</strong> Go to <a href="https://calendar.google.com" target="_blank">calendar.google.com</a>
        </div>
        <div class="step">
            <strong>Step 4:</strong> Click the "+" next to "Other calendars" → "Import"
        </div>
        <div class="step">
            <strong>Step 5:</strong> Select your downloaded .ics file and click "Import"
        </div>
    </div>

    <div style="text-align: center; margin-top: 30px; color: #666;">
        <p>Created with ❤️ by <a href="https://aitinerate.com" style="color: #FF4C4C;">AItinerate.com</a></p>
    </div>
</body>
</html>`;
}

// Simple ICS export (fallback)
function exportSimpleICS(tripDetails) {
    const icsContent = createEnhancedICS(tripDetails);
    
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${tripDetails.destination.replace(/[^a-zA-Z0-9]/g, '_')}_Trip.ics`;
    link.click();
    
    showNotification('✅ Calendar file downloaded! Import it into Google Calendar.');
}

// Geocode location
async function geocodeLocation(location) {
    return new Promise((resolve, reject) => {
        geocoder.geocode({ address: location }, (results, status) => {
            if (status === 'OK' && results[0]) {
                resolve(results[0].geometry.location);
            } else {
                reject(new Error(`Geocoding failed: ${status}`));
            }
        });
    });
}

// Add day navigation
function addDayNavigation(days) {
    let navigation = document.getElementById('day-navigation');
    if (!navigation) {
        navigation = document.createElement('div');
        navigation.id = 'day-navigation';
        navigation.style.marginBottom = '20px';
        navigation.innerHTML = `
            <label for="jump-to-day">Jump to day:</label>
            <select id="jump-to-day">
                <option value="">Select a day...</option>
            </select>
        `;
        
        const itineraryDisplay = document.getElementById('itinerary-display');
        itineraryDisplay.insertBefore(navigation, itineraryDisplay.firstChild);
    }

    const select = document.getElementById('jump-to-day');
    select.innerHTML = '<option value="">Select a day...</option>';
    
    days.forEach(day => {
        const option = document.createElement('option');
        option.value = day;
        option.textContent = day;
        select.appendChild(option);
    });

    select.addEventListener('change', function() {
        if (this.value) jumpToDay(this.value);
    });
}

// Add the missing getSimpleActivityType function
function getSimpleActivityType(activity) {
    const activityLower = activity.toLowerCase();
    
    if (activityLower.includes('museum') || activityLower.includes('gallery') || activityLower.includes('art')) {
        return 'Culture';
    } else if (activityLower.includes('lunch') || activityLower.includes('dinner') || activityLower.includes('breakfast') || activityLower.includes('cafe') || activityLower.includes('restaurant')) {
        return 'Dining';
    } else if (activityLower.includes('park') || activityLower.includes('garden') || activityLower.includes('outdoor')) {
        return 'Nature';
    } else if (activityLower.includes('tour') || activityLower.includes('visit') || activityLower.includes('explore')) {
        return 'Sightseeing';
    } else if (activityLower.includes('shop') || activityLower.includes('market')) {
        return 'Shopping';
    } else if (activityLower.includes('show') || activityLower.includes('theater') || activityLower.includes('concert')) {
        return 'Entertainment';
    } else if (activityLower.includes('beach')) {
        return 'Beach';
    } else if (activityLower.includes('historical') || activityLower.includes('monument')) {
        return 'Historical';
    }
    
    return 'Activity';
}

// Show image modal function
function showImageModal(imageUrl, activityName) {
    // Remove existing modal if any
    const existingModal = document.querySelector('.image-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        cursor: pointer;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        text-align: center;
    `;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = activityName;
    img.style.cssText = `
        max-width: 100%;
        max-height: 80vh;
        border-radius: 8px;
        object-fit: cover;
        margin-bottom: 8px;
        cursor: pointer;
    `;
    
    const caption = document.createElement('div');
    caption.textContent = activityName;
    caption.style.cssText = `
        color: white;
        font-size: 18px;
        font-weight: 600;
        margin-top: 15px;
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    `;
    

    
    modalContent.appendChild(img);
    modalContent.appendChild(caption);
    modal.appendChild(modalContent);
    
    // Close modal when clicked
    modal.addEventListener('click', () => {
        modal.remove();
    });
    
    document.body.appendChild(modal);
}

// Make all export functions globally available
window.exportToPDF = exportToPDF;
window.exportToExcel = exportToExcel;
window.exportToCalendar = exportToCalendar;
window.initMapAndItinerary = initMapAndItinerary;

// Show notification function
function showNotification(message, type = 'success') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#28a745' : '#dc3545'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        font-weight: 600;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Add mobile detection and debugging
function addMobileDebugging() {
    // Mobile detection
    const isMobile = /Android|webOS|iPhone|iPad|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /iPad|Android/i.test(navigator.userAgent) && window.screen.width >= 768;
    
    console.log('Device detection:', {
        isMobile,
        isTablet,
        userAgent: navigator.userAgent,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        connectionInfo: {
            host: window.location.host,
            url: window.location.href,
            origin: window.location.origin,
            platform: getPlatformType()
        }
    });
    
    // Add mobile-specific styles
    if (isMobile) {
        const style = document.createElement('style');
        style.textContent = `
            /* Mobile-specific debugging styles */
            .mobile-debug {
                position: fixed;
                top: 0;
                left: 0;
                background: rgba(255, 0, 0, 0.8);
                color: white;
                padding: 8px;
                font-size: 11px;
                z-index: 10000;
                max-width: 250px;
                border-radius: 0 0 8px 0;
                font-family: monospace;
            }
            
            /* COMPLETE MOBILE TABLE OVERHAUL */
            @media (max-width: 768px) {
                
                /* Hide the original table structure */
                #itinerary-table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                    background: transparent !important;
                    box-shadow: none !important;
                }
                
                #itinerary-table thead {
                    display: none !important;
                }
                
                #itinerary-table tbody {
                    display: block !important;
                }
                
                /* Day headers stay the same but mobile-friendly */
                .day-header-row {
                    display: table-row !important;
                    width: 100% !important;
                    margin-bottom: 15px !important;
                }
                
                .day-header-row td {
                    display: table-cell !important;
                    width: 100% !important;
                    padding: 15px 10px !important;
                    background: #f8f9fa !important;
                    border-radius: 12px !important;
                    margin-bottom: 10px !important;
                }
                
                .day-title-with-weather {
                    flex-direction: column !important;
                    text-align: center !important;
                    gap: 8px !important;
                }
                
                .day-title {
                    font-size: 16px !important;
                    font-weight: bold !important;
                }
                
                .weather-info {
                    font-size: 14px !important;
                    padding: 6px 12px !important;
                    align-self: center !important;
                }
                
                /* Transform regular rows into mobile cards */
                #itinerary-table tr:not(.day-header-row) {
                    display: block !important;
                    background: white !important;
                    border: 1px solid #e0e0e0 !important;
                    border-radius: 12px !important;
                    margin: 0 0 12px 0 !important;
                    padding: 15px !important;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
                    position: relative !important;
                }
                
                #itinerary-table td {
                    display: block !important;
                    border: none !important;
                    padding: 4px 0 !important;
                    text-align: left !important;
                    width: 100% !important;
                }
                
                /* Mobile card layout for activities */
                #itinerary-table tr:not(.day-header-row) td:nth-child(1) {
                    position: absolute !important;
                    top: 15px !important;
                    right: 15px !important;
                    background: #FF4C4C !important;
                    color: white !important;
                    padding: 4px 8px !important;
                    border-radius: 4px !important;
                    font-size: 12px !important;
                    font-weight: bold !important;
                    width: auto !important;
                }
                
                #itinerary-table tr:not(.day-header-row) td:nth-child(2) {
                    font-size: 16px !important;
                    font-weight: bold !important;
                    color: #333 !important;
                    margin-bottom: 8px !important;
                    padding-right: 80px !important;
                    line-height: 1.3 !important;
                }
                
                #itinerary-table tr:not(.day-header-row) td:nth-child(3) {
                    font-size: 14px !important;
                    color: #666 !important;
                    margin-bottom: 8px !important;
                    display: flex !important;
                    align-items: center !important;
                }
                
                #itinerary-table tr:not(.day-header-row) td:nth-child(3):before {
                    content: "📍 " !important;
                    margin-right: 4px !important;
                }
                
                #itinerary-table tr:not(.day-header-row) td:nth-child(4) {
                    margin: 8px 0 !important;
                }
                
                #itinerary-table tr:not(.day-header-row) td:nth-child(5) {
                    margin-top: 8px !important;
                    font-size: 12px !important;
                }
                
                /* Improve mobile rating display */
                .place-rating.enhanced {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    flex-wrap: wrap !important;
                }
                
                .rating-image {
                    display: none !important; /* Hide images on mobile for space */
                }
                
                .stars {
                    font-size: 14px !important;
                }
                
                .rating-value {
                    font-weight: bold !important;
                    color: #FF4C4C !important;
                }
                
                .rating-count {
                    font-size: 12px !important;
                    color: #999 !important;
                }
                
                /* Mobile activity info */
                .activity-info.enhanced {
                    display: flex !important;
                    flex-wrap: wrap !important;
                    gap: 6px !important;
                    align-items: center !important;
                }
                
                .price-info, .activity-type, .duration-info {
                    background: #f0f0f0 !important;
                    padding: 2px 6px !important;
                    border-radius: 4px !important;
                    font-size: 11px !important;
                    white-space: nowrap !important;
                }
                
                .google-maps-link {
                    background: #4285f4 !important;
                    color: white !important;
                    padding: 4px 8px !important;
                    border-radius: 4px !important;
                    text-decoration: none !important;
                    font-size: 11px !important;
                    margin-top: 4px !important;
                    display: inline-block !important;
                }
            }
            
            /* Better mobile touch targets */
            button, .preference-toggle, .action-button, .share-btn {
                min-height: 44px !important;
                min-width: 44px !important;
                padding: 12px 16px !important;
                font-size: 14px !important;
            }
            
            /* Mobile navigation improvements */
            .preference-toggles {
                display: grid !important;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)) !important;
                gap: 8px !important;
                margin: 15px 0 !important;
            }
            
            .preference-toggle {
                padding: 10px 8px !important;
                font-size: 13px !important;
                border-radius: 6px !important;
                text-align: center !important;
            }
            
            /* Better mobile map */
            #map {
                height: 250px !important;
                margin: 15px 0 !important;
                border-radius: 8px !important;
                width: 100% !important;
            }
            
            /* Mobile-friendly controls */
            .map-controls, .day-navigation {
                flex-direction: column !important;
                gap: 10px !important;
                margin: 15px 0 !important;
            }
            
            .day-filter, #jump-to-day, #day-selector {
                width: 100% !important;
                padding: 12px !important;
                font-size: 16px !important;
                border-radius: 8px !important;
                border: 1px solid #ddd !important;
            }
            
            /* Share buttons mobile layout */
            .share-buttons {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 8px !important;
            }
            
            .share-btn {
                justify-content: center !important;
                text-align: center !important;
                padding: 12px 8px !important;
                font-size: 13px !important;
            }
            
            /* Mobile export section */
            .export-section {
                display: grid !important;
                grid-template-columns: 1fr !important;
                gap: 10px !important;
                margin: 20px 0 !important;
            }
            
            /* Mobile page padding */
            body {
                padding: 10px !important;
            }
            
            /* Mobile container max width */
            .container, .main-content {
                max-width: 100% !important;
                padding: 0 10px !important;
            }
        `;
        document.head.appendChild(style);
        
        // Add debug info with connection details
        const debugDiv = document.createElement('div');
        debugDiv.className = 'mobile-debug';
        debugDiv.innerHTML = `
            📱 Mobile Mode<br>
            Screen: ${window.screen.width}x${window.screen.height}<br>
            Platform: ${getPlatformType()}<br>
            Host: ${window.location.host}
        `;
        document.body.appendChild(debugDiv);
        
        // Remove debug info after 3 seconds
        setTimeout(() => {
            if (debugDiv.parentNode) {
                debugDiv.remove();
            }
        }, 3000);
        
        // Add mobile touch feedback
        document.addEventListener('touchstart', function(e) {
            if (e.target.matches('button, .preference-toggle, .share-btn')) {
                e.target.style.transform = 'scale(0.95)';
                e.target.style.transition = 'transform 0.1s';
            }
        });
        
        document.addEventListener('touchend', function(e) {
            if (e.target.matches('button, .preference-toggle, .share-btn')) {
                setTimeout(() => {
                    e.target.style.transform = 'scale(1)';
                }, 100);
            }
        });
        
        // Force refresh table layout on mobile
        setTimeout(() => {
            const table = document.getElementById('itinerary-table');
            if (table) {
                table.style.display = 'table';
                setTimeout(() => {
                    console.log('Mobile table layout refreshed');
                }, 100);
            }
        }, 1000);
    }
}

// Helper function to detect platform type
function getPlatformType() {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '162.120.186.64') {
        return 'Local Dev';
    } else if (hostname.includes('vercel.app')) {
        return 'Vercel';
    } else if (hostname.includes('render.com')) {
        return 'Render';
    } else if (hostname.includes('aitinerate')) {
        return 'Custom Domain';
    } else {
        return 'Unknown';
    }
}