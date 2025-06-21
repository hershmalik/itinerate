// Log localStorage content at the VERY START of script execution
console.log("[second-page.js] SCRIPT EXECUTION STARTED. Reading localStorage immediately:");
console.log(`[second-page.js] Initial read - tripDestination: '${localStorage.getItem('tripDestination')}'`);
console.log(`[second-page.js] Initial read - tripDepartureDate: '${localStorage.getItem('tripDepartureDate')}'`);
console.log(`[second-page.js] Initial read - tripArrivalDate: '${localStorage.getItem('tripArrivalDate')}'`);
console.log(`[second-page.js] Initial read - tripPreferences: '${localStorage.getItem('tripPreferences')}'`);
console.log("All localStorage keys/values at script start:", {...localStorage});

let map, geocoder, itineraryData = [], currentMarkers = [], dayPaths = [], dayGroups = {};
const markerData = new WeakMap();
let weatherForecasts = [];

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
    
    // Check if Google Maps is loaded
    if (typeof google === 'undefined' || !google.maps) {
        console.error('Google Maps API not loaded');
        document.getElementById("error-message").textContent = "Map service unavailable. Other features will work normally.";
        document.getElementById("error-message").style.display = "block";
        // Continue without map
        displayPreferences();
        initializePreferenceToggles();
        await generateItinerary();
        return;
    }
    
    try {
        map = new google.maps.Map(document.getElementById("map"), {
            zoom: 12,
            center: { lat: 40.7128, lng: -74.0060 }, // Default to NYC
            mapId: "ITINERARY_MAP"
            // styles: [ ... ] // REMOVED: Cannot use styles with mapId
        });
        geocoder = new google.maps.Geocoder();
        console.log("Map initialized successfully");
    } catch (error) {
        console.error("Error initializing map:", error);
        // Continue without map
    }
    
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
    // Match exactly the same preferences as page 1
    const preferenceOptions = [
        { id: 'culture', label: 'Culture & History' },
        { id: 'food', label: 'Food & Dining' },
        { id: 'nature', label: 'Nature & Parks' },
        { id: 'adventure', label: 'Adventure' },
        { id: 'nightlife', label: 'Nightlife' },
        { id: 'shopping', label: 'Shopping' },
        { id: 'art', label: 'Arts & Culture' },
        { id: 'relaxation', label: 'Wellness' },
        { id: 'sports', label: 'Sports & Events' },
        { id: 'architecture', label: 'Architecture' },
        { id: 'beaches', label: 'Beaches & Water' },
        { id: 'photography', label: 'Photography' }
    ];

    const togglesContainer = document.querySelector('.preference-toggles');
    if (togglesContainer) {
        // Don't clear - the HTML already has the correct buttons
        // Just add event listeners
        const existingButtons = togglesContainer.querySelectorAll('.preference-toggle');
        existingButtons.forEach(button => {
            button.addEventListener('click', function() {
                this.classList.toggle('active');
            });
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
        await generateItinerary();
        displayPreferences();
        showNotification('Itinerary updated with your new preferences!');
    } catch (error) {
        console.error('Error regenerating itinerary:', error);
        alert('Error updating itinerary. Please try again.');
    } finally {
        if (regenerateBtn) {
            regenerateBtn.innerHTML = '<span class="regenerate-icon">🔄</span> Regenerate Itinerary';
            regenerateBtn.disabled = false;
        }
    }
}

// Enhanced generateItinerary function with better loading
async function generateItinerary() {
    const errorMessageDiv = document.getElementById("error-message");
    const itineraryDisplayDiv = document.getElementById("itinerary-display");

    try {
        showLoadingWithProgression();
        
        if (errorMessageDiv) errorMessageDiv.style.display = "none";
        if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "none";

        const tripDetails = getTripDetailsFromStorage();
        if (!tripDetails) {
            throw new Error("Trip details not found. Please return to the previous page.");
        }

        // Simple base URL detection
        let baseUrl;
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            baseUrl = 'http://localhost:3001';
        } else {
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

        renderItineraryCards(itineraryData);
        await populateItineraryTable(itineraryData);
        await displayMapAndMarkers(itineraryData); // always show all pins after load
        populateDaySelectors(itineraryData);

        // Update hero stats
        try {
            const activitiesCount = itineraryData.length;
            const uniqueLocations = new Set(itineraryData.map(item => item.location)).size;
            const uniqueDays = new Set(itineraryData.map(item => item.day)).size;
            document.getElementById('activities-count').textContent = activitiesCount;
            document.getElementById('trip-duration').textContent = uniqueDays + (uniqueDays === 1 ? ' day' : ' days');
            document.getElementById('destinations-count').textContent = uniqueLocations;
        } catch (e) {
            // If elements not found, do nothing
        }

        if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "block";
    } catch (error) {
        console.error("Error generating itinerary:", error);
        if (errorMessageDiv) {
            errorMessageDiv.textContent = `Error: ${error.message}`;
            errorMessageDiv.style.display = "block";
        }
    } finally {
        const loadingIndicator = document.getElementById("loading-indicator");
        if (loadingIndicator) {
            setTimeout(() => {
                loadingIndicator.style.display = "none";
            }, 500);
        }
    }
}

// Render itinerary as VRBO-inspired cards
function getUnsplashImageUrl(query) {
    // Use Unsplash source API for demo (no API key needed, random image)
    return `https://source.unsplash.com/800x400/?${encodeURIComponent(query)}`;
}

function renderItineraryCards(itineraryItems) {
    const container = document.getElementById('itinerary-cards-container');
    if (!container) return;
    container.innerHTML = '';
    // Group by day
    const dayGroups = {};
    itineraryItems.forEach((item, idx) => {
        if (!dayGroups[item.day]) dayGroups[item.day] = [];
        dayGroups[item.day].push({ ...enhanceActivityData(item, idx) });
    });
    // Sort days by extracting the date from the day string if possible
    const sortedDayKeys = Object.keys(dayGroups).sort((a, b) => {
        const dateA = a.match(/Day (\d+): (.+)/);
        const dateB = b.match(/Day (\d+): (.+)/);
        if (dateA && dateB) {
            return parseInt(dateA[1]) - parseInt(dateB[1]);
        }
        return a.localeCompare(b);
    });
    sortedDayKeys.forEach((dayName, dayIndex) => {
        const activities = dayGroups[dayName];
        const weatherInfo = generateWeatherForDay(dayIndex);
        let displayDate = dayName;
        const match = dayName.match(/Day (\d+): (.+)/);
        if (match) {
            displayDate = match[2];
        }
        // Day card container
        const dayCard = document.createElement('div');
        dayCard.className = 'itinerary-day-card'; // Use a class for styling
        // Day header (blue gradient)
        const dayHeader = document.createElement('div');
        dayHeader.className = 'itinerary-day-header'; // Use a class for styling
        dayHeader.innerHTML = `
            <div class="itinerary-day-header-title">
                <span>📅</span> ${displayDate}
            </div>
            <div class="itinerary-day-header-weather">
                <span>☀️ Partly Cloudy, ${weatherInfo.temp}</span>
            </div>
        `;
        dayCard.appendChild(dayHeader);

        // New wrapper for all cards of the day
        const cardsWrapper = document.createElement('div');
        cardsWrapper.className = 'itinerary-day-cards-wrapper';

        activities.forEach(item => {
            const card = document.createElement('div');
            card.className = 'itinerary-card';
            card.innerHTML = `
                <div class="itinerary-card-header">
                    <span>🕒 ${item.time || ''}</span>
                    <span>⏱️ ${item.duration || ''}</span>
                </div>
                <div class="itinerary-card-title">${item.activity || ''}</div>
                <div class="itinerary-card-desc">${item.description || ''}</div>
                <div class="itinerary-card-meta">
                    ${item.price ? `<span class="itinerary-card-price"><span class="icon">💰</span> ${item.price}</span>` : ''}
                    ${item.rating ? `<span class="itinerary-card-rating"><span class="icon">⭐</span> ${item.rating}</span>` : ''}
                    ${item.reviews ? `<span class="itinerary-card-reviews">${item.reviews} reviews</span>` : ''}
                </div>
                <div class="itinerary-card-location"><span>📍</span> <span>${item.location || ''}</span></div>
                ${item.mapLink ? `<a href="${item.mapLink}" target="_blank" class="itinerary-card-map-link">View Location</a>` : ''}
            `;
            cardsWrapper.appendChild(card);
        });
        dayCard.appendChild(cardsWrapper);
        container.appendChild(dayCard);
    });
}

// Helper function to show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#28a745' : '#dc3545'};
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Parse time helper function
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return 0;
    
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
}

// Enhanced loading with progression
function showLoadingWithProgression() {
    const loadingIndicator = document.getElementById("loading-indicator");
    if (!loadingIndicator) return;

    loadingIndicator.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner">
                <div class="spinner"></div>
            </div>
            <div class="loading-text" id="loading-text">Creating your perfect itinerary...</div>
            <div class="loading-progress">
                <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                </div>
                <div class="progress-text" id="progress-text">0%</div>
            </div>
        </div>
    `;

    loadingIndicator.style.display = "flex";
    
    // Start the progression animation
    startProgressAnimation();
    
    // Add CSS for loading animation if not already present
    if (!document.getElementById('loading-styles')) {
        const style = document.createElement('style');
        style.id = 'loading-styles';
        style.textContent = `
            .loading-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
                padding: 2rem;
            }
            
            .spinner {
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #FF4C4C;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .progress-bar {
                width: 300px;
                height: 8px;
                background: #f0f0f0;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 10px;
            }
            
            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #FF4C4C, #ff7a7f);
                width: 0%;
                transition: width 0.3s ease;
                border-radius: 4px;
            }
            
            .progress-text {
                font-size: 0.875rem;
                color: var(--text-secondary);
                font-weight: 500;
            }
        `;
        document.head.appendChild(style);
    }
}

function startProgressAnimation() {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const loadingText = document.getElementById('loading-text');
    if (!progressFill || !progressText || !loadingText) return;
    // Make earlier stages much longer, 'almost ready' very short
    const steps = [
        { progress: 30, text: 'Analyzing your preferences...', duration: 2000 },
        { progress: 60, text: 'Finding perfect locations...', duration: 3000 },
        { progress: 90, text: 'Crafting your itinerary...', duration: 3000 },
        { progress: 100, text: 'Almost ready! 🎉', duration: 400 }
    ];
    let currentStep = 0;
    function updateProgress() {
        if (currentStep < steps.length) {
            const step = steps[currentStep];
            progressFill.style.width = step.progress + '%';
            progressText.textContent = step.progress + '%';
            loadingText.textContent = step.text;
            currentStep++;
            setTimeout(updateProgress, step.duration);
        }
    }
    updateProgress();
}

// Simplified functions for the core functionality
function enhanceAndFixItinerary(rawItinerary, tripDetails) {
    console.log('Enhancing itinerary with raw data:', rawItinerary);
    
    if (!rawItinerary || rawItinerary.length === 0) {
        // Generate basic itinerary if none provided
        return generateBasicItinerary(tripDetails);
    }
    
    return rawItinerary;
}

function generateBasicItinerary(tripDetails) {
    const startDate = new Date(tripDetails.departureDate);
    const endDate = new Date(tripDetails.arrivalDate);
    const tripDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    const basicItinerary = [];
    
    for (let i = 0; i < tripDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dayName = `Day ${i + 1}: ${currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
        
        // Add basic activities
        basicItinerary.push({
            day: dayName,
            time: '9:00 AM',
            activity: `Explore ${tripDetails.destination}`,
            location: `Main area of ${tripDetails.destination}`
        });
        
        basicItinerary.push({
            day: dayName,
            time: '1:00 PM',
            activity: 'Lunch at local restaurant',
            location: `Restaurant in ${tripDetails.destination}`
        });
        
        basicItinerary.push({
            day: dayName,
            time: '3:00 PM',
            activity: 'Visit local attraction',
            location: `Popular spot in ${tripDetails.destination}`
        });
    }
    
    return basicItinerary;
}

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

    // Group items by day
    const dayGroups = {};
    itineraryItems.forEach(item => {
        if (!dayGroups[item.day]) dayGroups[item.day] = [];
        dayGroups[item.day].push(item);
    });

    // Populate table with enhanced data
    Object.keys(dayGroups).forEach((dayName, dayIndex) => {
        const dayItems = dayGroups[dayName];
        
        // Add weather info to day header
        const weatherInfo = generateWeatherForDay(dayIndex);
        
        // Day header with weather
        const dayHeaderRow = document.createElement("tr");
        dayHeaderRow.className = "day-header-row";
        dayHeaderRow.innerHTML = `
            <td colspan="5">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>${dayName}</strong>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 24px;">${weatherInfo.icon}</span>
                        <span style="font-size: 14px;">${weatherInfo.temp}</span>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(dayHeaderRow);

        // Day activities with enhanced information
        dayItems.forEach((item, index) => {
            const enhancedItem = enhanceActivityData(item, index);
            const row = document.createElement("tr");
            row.innerHTML = `
                <td style="font-weight: 600;">${enhancedItem.time || "N/A"}</td>
                <td>
                    <div style="font-weight: 600; margin-bottom: 4px;">${enhancedItem.activity || "No activity"}</div>
                    ${enhancedItem.description ? `<div style="font-size: 0.85rem; color: var(--text-secondary);">${enhancedItem.description}</div>` : ''}
                </td>
                <td>
                    <div>${enhancedItem.location || "No location"}</div>
                    ${enhancedItem.mapLink ? `<a href="${enhancedItem.mapLink}" target="_blank" style="color: var(--accent-color); font-size: 0.8rem; text-decoration: none;">📍 View on Google Maps</a>` : ''}
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <div style="color: #ffa500; font-size: 14px;">${enhancedItem.stars}</div>
                        <div style="font-weight: 600; font-size: 0.9rem;">${enhancedItem.rating}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">(${enhancedItem.reviews})</div>
                    </div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: var(--text-secondary);">💰</span>
                            <span style="font-weight: 600;">${enhancedItem.price}</span>
                            <span>${enhancedItem.priceLevel}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span>${enhancedItem.categoryIcon}</span>
                            <span style="background: ${enhancedItem.categoryColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;">${enhancedItem.category}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: var(--text-secondary);">⏱️</span>
                            <span>${enhancedItem.duration}</span>
                        </div>
                        ${enhancedItem.paymentMethod ? `<div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: var(--text-secondary);">💳</span>
                            <span style="font-size: 0.75rem;">${enhancedItem.paymentMethod}</span>
                        </div>` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    });
}

// Helper function to generate weather data for each day
function generateWeatherForDay(dayIndex) {
    const weatherOptions = [
        { icon: "☀️", temp: "72°/56°F" },
        { icon: "🌤️", temp: "68°/52°F" },
        { icon: "⛅", temp: "65°/48°F" },
        { icon: "🌦️", temp: "62°/45°F" },
        { icon: "☁️", temp: "70°/54°F" }
    ];
    return weatherOptions[dayIndex % weatherOptions.length];
}

// Helper function to enhance activity data with ratings, prices, categories
function enhanceActivityData(item, index) {
    // Generate realistic ratings and data based on activity type
    const activity = item.activity?.toLowerCase() || '';
    
    // Determine category and styling based on activity content
    let category, categoryIcon, categoryColor;
    if (activity.includes('breakfast') || activity.includes('lunch') || activity.includes('dinner') || activity.includes('restaurant') || activity.includes('market')) {
        category = 'Dining';
        categoryIcon = '🍽️';
        categoryColor = '#e67e22';
    } else if (activity.includes('museum') || activity.includes('observatory') || activity.includes('building') || activity.includes('tour')) {
        category = 'Attraction';
        categoryIcon = '🏛️';
        categoryColor = '#3498db';
    } else if (activity.includes('park') || activity.includes('outdoor') || activity.includes('walk') || activity.includes('line')) {
        category = 'Outdoor';
        categoryIcon = '🌿';
        categoryColor = '#27ae60';
    } else {
        category = 'Activity';
        categoryIcon = '⭐';
        categoryColor = '#9b59b6';
    }

    // Generate realistic ratings (3.5-4.8 range)
    const ratings = [3.7, 4.6, 4.5, 3.9, 4.2, 4.4, 4.1, 3.8];
    const rating = ratings[index % ratings.length];
    const stars = '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '☆' : '');
    
    // Generate review counts
    const reviewCounts = ['705', '255', '520', '342', '186', '890', '127', '612'];
    const reviews = reviewCounts[index % reviewCounts.length];
    
    // Generate price levels
    const priceLevels = ['Moderate', 'Inexpensive', 'Moderate', 'Moderate', 'Expensive', 'Moderate'];
    const priceLevel = priceLevels[index % priceLevels.length];
    const priceSymbols = {
        'Inexpensive': '$',
        'Moderate': '$$',
        'Expensive': '$$$'
    };
    
    // Generate duration based on activity type
    let duration;
    if (category === 'Dining') {
        duration = ['1-2 hours', '1 hour', '2 hours'][index % 3];
    } else if (category === 'Attraction') {
        duration = ['1-2 hours', '2-3 hours', '1 hour'][index % 3];
    } else {
        duration = ['1-2 hours', '2-3 hours', '3-4 hours'][index % 3];
    }

    // Generate Google Maps link
    const mapLink = item.location ? 
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}` : 
        null;

    // Add payment method for some activities
    const paymentMethods = ['Bring payment method', 'Cash recommended', 'Cards accepted', null];
    const paymentMethod = Math.random() > 0.6 ? paymentMethods[index % paymentMethods.length] : null;

    return {
        ...item,
        rating: rating.toFixed(1),
        stars: stars,
        reviews: reviews,
        price: priceSymbols[priceLevel],
        priceLevel: priceLevel,
        category: category,
        categoryIcon: categoryIcon,
        categoryColor: categoryColor,
        duration: duration,
        mapLink: mapLink,
        paymentMethod: paymentMethod,
        description: generateActivityDescription(item.activity)
    };
}

// Generate brief descriptions for activities
function generateActivityDescription(activity) {
    if (!activity) return '';
    
    const descriptions = {
        'breakfast': 'Start your day with delicious local flavors',
        'lunch': 'Enjoy authentic cuisine in a welcoming atmosphere',
        'dinner': 'Perfect spot for an evening meal',
        'museum': 'Explore fascinating exhibits and collections',
        'observatory': 'Stunning views and architectural marvel',
        'building': 'Iconic landmark with rich history',
        'park': 'Beautiful outdoor space for relaxation',
        'market': 'Vibrant local market with unique finds'
    };
    
    const activityLower = activity.toLowerCase();
    for (const [key, desc] of Object.entries(descriptions)) {
        if (activityLower.includes(key)) {
            return desc;
        }
    }
    
    return '';
}

async function displayMapAndMarkers(items) {
    if (!map || !geocoder) return;
    const tripDetails = getTripDetailsFromStorage();
    if (tripDetails?.destination) {
        console.log('[Map] Geocoding destination:', tripDetails.destination);
        try {
            // Center on the first valid location if available, else on destination
            let centerPos = null;
            for (const item of items) {
                if (item.location && item.location !== tripDetails.destination) {
                    try {
                        centerPos = await geocodeLocation(item.location);
                        break;
                    } catch (err) {
                        console.warn('[Map] Could not geocode activity location:', item.location, err);
                    }
                }
            }
            if (!centerPos) {
                try {
                    centerPos = await geocodeLocation(tripDetails.destination);
                } catch (err) {
                    console.error('[Map] Geocoding destination failed:', tripDetails.destination, err);
                }
            }
            if (!centerPos) {
                document.getElementById("error-message").textContent = `Could not geocode destination: ${tripDetails.destination}`;
                document.getElementById("error-message").style.display = "block";
                return;
            }
            map.setCenter(centerPos);
            map.setZoom(15); // Zoom in more for better detail
            // Clear existing markers
            currentMarkers.forEach(marker => marker.setMap(null));
            currentMarkers = [];
            // Calculate bounds to fit all pins
            const bounds = new google.maps.LatLngBounds();
            let pathCoords = [];
            // Add markers for each location
            const locationCounts = {};
            items.forEach(item => {
                if (item.location && item.location !== tripDetails.destination) {
                    const location = item.location;
                    if (!locationCounts[location]) {
                        locationCounts[location] = [];
                    }
                    locationCounts[location].push(item);
                }
            });
            for (const [location, activities] of Object.entries(locationCounts)) {
                try {
                    const locationPos = await geocodeLocation(location);
                    pathCoords.push(locationPos);
                    bounds.extend(locationPos);
                    const marker = new google.maps.Marker({
                        position: locationPos,
                        map: map,
                        title: location,
                        icon: {
                            url: getMarkerIcon(activities[0]),
                            scaledSize: new google.maps.Size(30, 30)
                        }
                    });
                    const infoWindow = new google.maps.InfoWindow({
                        content: createInfoWindowContent(location, activities)
                    });
                    marker.addListener('click', () => {
                        infoWindow.open(map, marker);
                    });
                    currentMarkers.push(marker);
                } catch (err) {
                    console.warn(`[Map] Could not geocode location: ${location}`);
                }
            }
            // Fit map to show all pins if there are any, else center on centerPos
            if (pathCoords.length > 0) {
                map.fitBounds(bounds);
            } else {
                map.setCenter(centerPos);
                map.setZoom(12);
            }
            // Remove previous polylines
            if (window.currentPolyline) window.currentPolyline.setMap(null);
            // Draw polyline if there are at least 2 points and not in 'all' mode
            const isAllDays = document.getElementById('day-selector')?.value === 'all';
            if (!isAllDays && pathCoords.length > 1) {
                window.currentPolyline = new google.maps.Polyline({
                    path: pathCoords,
                    geodesic: true,
                    strokeColor: '#FF5A5F',
                    strokeOpacity: 0.8,
                    strokeWeight: 4
                });
                window.currentPolyline.setMap(map);
            }
        } catch (err) {
            console.warn("Could not geocode destination");
        }
    }
}

// Google Maps geocoding helper
async function geocodeLocation(address) {
    return new Promise((resolve, reject) => {
        if (!geocoder) return reject(new Error("Geocoder not initialized"));
        geocoder.geocode({ address }, (results, status) => {
            if (status === "OK" && results[0]) {
                resolve(results[0].geometry.location);
            } else {
                reject(new Error("Geocoding failed: " + status));
            }
        });
    });
}

// Helper function to get appropriate marker icon based on activity type
function getMarkerIcon(activity) {
    const activityLower = activity.activity?.toLowerCase() || '';
    
    if (activityLower.includes('restaurant') || activityLower.includes('lunch') || activityLower.includes('dinner') || activityLower.includes('breakfast')) {
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="12" fill="#e67e22" stroke="white" stroke-width="2"/>
                <text x="15" y="20" text-anchor="middle" fill="white" font-size="14">🍽️</text>
            </svg>
        `);
    } else if (activityLower.includes('museum') || activityLower.includes('observatory') || activityLower.includes('building')) {
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="12" fill="#3498db" stroke="white" stroke-width="2"/>
                <text x="15" y="20" text-anchor="middle" fill="white" font-size="14">🏛️</text>
            </svg>
        `);
    } else if (activityLower.includes('park') || activityLower.includes('outdoor')) {
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="12" fill="#27ae60" stroke="white" stroke-width="2"/>
                <text x="15" y="20" text-anchor="middle" fill="white" font-size="14">🌿</text>
            </svg>
        `);
    } else {
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="12" fill="#9b59b6" stroke="white" stroke-width="2"/>
                <text x="15" y="20" text-anchor="middle" fill="white" font-size="14">⭐</text>
            </svg>
        `);
    }
}

// Create info window content for map markers
function createInfoWindowContent(location, activities) {
    const activitiesList = activities.map(activity => 
        `<div style="margin: 4px 0; font-size: 0.9rem;">
            <strong>${activity.time}</strong> - ${activity.activity}
        </div>`
    ).join('');
    
    return `
        <div style="max-width: 250px; padding: 8px;">
            <h4 style="margin: 0 0 8px 0; color: #333;">${location}</h4>
            ${activitiesList}
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}" 
               target="_blank" 
               style="color: #FF5A5F; text-decoration: none; font-size: 0.8rem; margin-top: 8px; display: inline-block;">
                📍 View on Google Maps
            </a>
        </div>
    `;
}

// Populate both day selectors (table and map) and add filtering logic
function populateDaySelectors(items) {
    const daySelector = document.getElementById('day-selector');
    const itineraryDaySelector = document.getElementById('itinerary-day-selector');
    if (!daySelector || !itineraryDaySelector) return;
    
    // Get unique days and their dates
    const uniqueDays = [];
    const dayDateMap = {};
    items.forEach(item => {
        if (!uniqueDays.includes(item.day)) {
            uniqueDays.push(item.day);
            // Extract date from day string if present, else fallback to today + index
            const match = item.day.match(/Day (\d+): (.+)/);
            if (match) {
                dayDateMap[item.day] = match[2];
            } else {
                dayDateMap[item.day] = item.day;
            }
        }
    });
    // Helper to clear and repopulate a selector
    function setOptions(selector) {
        while (selector.children.length > 1) {
            selector.removeChild(selector.lastChild);
        }
        uniqueDays.forEach((day) => {
            const option = document.createElement('option');
            option.value = day;
            option.textContent = day;
            selector.appendChild(option);
        });
    }
    setOptions(daySelector);
    setOptions(itineraryDaySelector);
    
    // Map selector: filter pins
    daySelector.onchange = function() {
        filterMapByDay(this.value, items);
    };
    // Table selector: filter table
    itineraryDaySelector.onchange = function() {
        filterItineraryTableByDay(this.value, items);
    };
}

// Filter itinerary table by selected day
function filterItineraryTableByDay(selectedDay, items) {
    if (selectedDay === 'all') {
        populateItineraryTable(items);
        return;
    }
    const filtered = items.filter(item => item.day === selectedDay);
    populateItineraryTable(filtered, selectedDay);
}

// Filter map markers by selected day
function filterMapByDay(selectedDay, items) {
    if (selectedDay === 'all') {
        displayMapAndMarkers(items);
        return;
    }
    const filtered = items.filter(item => item.day === selectedDay);
    displayMapAndMarkers(filtered);
}

// Patch: call populateDaySelectors after itinerary is loaded
// In generateItinerary, after await populateItineraryTable(itineraryData); and await displayMapAndMarkers(itineraryData);
// Add:
// populateDaySelectors(itineraryData);

// Ensure Google Maps callback works
window.initMapAndItinerary = initMapAndItinerary;