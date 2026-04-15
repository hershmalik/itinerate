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

const API_BASE_URL = "http://localhost:10000";

window.addEventListener('DOMContentLoaded', () => {
  console.log('[DEBUG] DOMContentLoaded fired');
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

  // --- Interests & Advanced Options Modal Logic ---
  const interestsBtn = document.getElementById('open-interests-modal');
  const interestsModal = document.getElementById('interests-modal');
  const interestsClose = document.getElementById('close-interests-modal');
  const interestsApply = document.getElementById('apply-interests-modal');
  if (interestsBtn && interestsModal) interestsBtn.onclick = () => interestsModal.style.display = 'flex';
  if (interestsClose && interestsModal) interestsClose.onclick = () => interestsModal.style.display = 'none';
  if (interestsApply && interestsModal) interestsApply.onclick = () => { interestsModal.style.display = 'none'; };

  // Advanced Modal (for both button and link)
  const advBtn = document.getElementById('open-advanced-modal');
  const advLink = document.getElementById('open-advanced-modal-link');
  const advModal = document.getElementById('advanced-modal');
  const advClose = document.getElementById('close-advanced-modal');
  const advApply = document.getElementById('apply-advanced-modal');

  if (advBtn && advModal) {
    advBtn.onclick = () => advModal.style.display = 'flex';
  }
  if (advLink && advModal) {
    advLink.onclick = (e) => { e.preventDefault(); advModal.style.display = 'flex'; };
  }
  if (advClose && advModal) {
    advClose.onclick = () => advModal.style.display = 'none';
  }
  if (advApply && advModal) {
    advApply.onclick = () => {
      // Collect advanced options (e.g. price, room type)
      const checked = Array.from(advModal.querySelectorAll('input[type="checkbox"]:checked'));
      const selected = checked.map(cb => cb.value);
      localStorage.setItem('advancedPreferences', JSON.stringify(selected));
      advModal.style.display = 'none';
      // Optionally, regenerate itinerary if advanced options affect it
      regenerateItineraryWithUpdatedPreferences();
    };
  }

  // Custom Instructions Modal
  const customInstructionsLink = document.getElementById('open-custom-instructions-link');
  const customInstructionsModal = document.getElementById('custom-instructions-modal');
  const customInstructionsClose = document.getElementById('close-custom-instructions-modal');
  const customInstructionsApply = document.getElementById('apply-custom-instructions-modal');
  if (customInstructionsLink && customInstructionsModal) customInstructionsLink.onclick = (e) => { e.preventDefault(); customInstructionsModal.style.display = 'flex'; };
  if (customInstructionsClose && customInstructionsModal) customInstructionsClose.onclick = () => customInstructionsModal.style.display = 'none';
  if (customInstructionsApply && customInstructionsModal) customInstructionsApply.onclick = () => {
    const textarea = document.getElementById('custom-instructions-textarea');
    if (textarea) {
      localStorage.setItem('customInstructions', textarea.value);
    }
    customInstructionsModal.style.display = 'none';
  };

  // Close modals on outside click
  window.onclick = function(event) {
    if (event.target === interestsModal) interestsModal.style.display = 'none';
    if (event.target === advModal) advModal.style.display = 'none';
  };

  // --- Compact Form Enhancements (Date Picker, Autocomplete, Modals) ---
  // Date pickers
  if (window.flatpickr) {
    const depPicker = flatpickr('#compact-departure-date', {
      minDate: 'today',
      dateFormat: 'Y-m-d',
      onChange: function(selectedDates, dateStr) {
        arrPicker.set('minDate', dateStr);
      }
    });
    const arrPicker = flatpickr('#compact-arrival-date', {
      minDate: 'today',
      dateFormat: 'Y-m-d'
    });
    // --- PATCH: Set values from localStorage after flatpickr init ---
    const depVal = localStorage.getItem('tripDepartureDate');
    const arrVal = localStorage.getItem('tripArrivalDate');
    if (depVal) document.getElementById('compact-departure-date').value = depVal;
    if (arrVal) document.getElementById('compact-arrival-date').value = arrVal;
  }
  // REMOVE custom autocomplete for destination input entirely. Only use Google Maps Places Autocomplete

  // Modal popups for filters and advanced (compact form, use unique variable names)
  const compactFiltersBtn = document.getElementById('open-filters-modal');
  const compactFiltersModal = document.getElementById('filters-modal');
  const compactFiltersClose = document.getElementById('close-filters-modal');
  const compactFiltersApply = document.getElementById('apply-filters-modal');
  if (compactFiltersBtn && compactFiltersModal) compactFiltersBtn.onclick = () => compactFiltersModal.style.display = 'flex';
  if (compactFiltersClose && compactFiltersModal) compactFiltersClose.onclick = () => compactFiltersModal.style.display = 'none';
  if (compactFiltersApply && compactFiltersModal) compactFiltersApply.onclick = () => { compactFiltersModal.style.display = 'none'; };
  const compactAdvBtn = document.getElementById('open-advanced-modal');
  const compactAdvModal = document.getElementById('advanced-modal');
  const compactAdvClose = document.getElementById('close-advanced-modal');
  const compactAdvApply = document.getElementById('apply-advanced-modal');
  if (compactAdvBtn && compactAdvModal) compactAdvBtn.onclick = () => compactAdvModal.style.display = 'flex';
  if (compactAdvClose && compactAdvModal) compactAdvClose.onclick = () => compactAdvModal.style.display = 'none';
  if (compactAdvApply && compactAdvModal) compactAdvApply.onclick = () => { compactAdvModal.style.display = 'none'; };
  window.addEventListener('click', function(event) {
    if (event.target === compactFiltersModal) compactFiltersModal.style.display = 'none';
    if (event.target === compactAdvModal) compactAdvModal.style.display = 'none';
  });

  // Remove the 'Refine Your Journey' card if it exists
  const refineCard = document.getElementById('customize-preferences');
  if (refineCard) refineCard.style.display = 'none';

  // Make the 'Your Vision' card much smaller
  const visionCard = document.getElementById('preferences-summary');
  if (visionCard) {
    visionCard.style.padding = '0.75rem 1.2rem';
    visionCard.style.marginBottom = '1rem';
    visionCard.style.borderRadius = '0.5rem';
    visionCard.style.fontSize = '0.95rem';
    visionCard.querySelector('.section-title').style.fontSize = '1.1rem';
    visionCard.querySelector('.section-title').style.marginBottom = '0.5rem';
    visionCard.querySelector('.section-title').style.fontWeight = '600';
    visionCard.querySelector('.section-title').style.padding = '0';
    visionCard.querySelector('.section-title').style.border = 'none';
    visionCard.querySelector('.section-title').style.boxShadow = 'none';
    visionCard.querySelector('.section-title').style.background = 'none';
    visionCard.style.boxShadow = 'none';
    visionCard.style.border = '1px solid var(--border-color)';
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
            itineraryData = JSON.parse(sharedItinerary);
            if (!destination || !departureDate || !arrivalDate) {
                // Only show error if itineraryData is empty
                if (!itineraryData || itineraryData.length === 0) {
                    document.getElementById("error-message").textContent = "Trip details not found. Please start from the home page.";
                    document.getElementById("error-message").style.display = "block";
                }
                return null;
            }
            // Hide error if data is present
            document.getElementById("error-message").style.display = "none";
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
        if (!destination || !departureDate || !arrivalDate) {
            // Only show error if itineraryData is empty
            if (!itineraryData || itineraryData.length === 0) {
                document.getElementById("error-message").textContent = "Trip details not found. Please start from the home page.";
                document.getElementById("error-message").style.display = "block";
            }
            return null;
        }
        // Hide error if data is present
        document.getElementById("error-message").style.display = "none";
        return { destination, departureDate, arrivalDate, preferences, tripStyle };
    } catch (e) {
        console.error('Error parsing localStorage:', e);
        document.getElementById("error-message").textContent = "Trip details not found. Please start from the home page.";
        document.getElementById("error-message").style.display = "block";
        return null;
    }
}

// Initialize map and generate itinerary
async function initMapAndItinerary() {
    console.log('[DEBUG] initMapAndItinerary called');
    console.log("Google Maps API loaded, initializing...");
    
    // Check if Google Maps is loaded
    if (typeof google === 'undefined' || !google.maps) {
        console.error('[DEBUG] Google Maps API not loaded');
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
            center: { lat: 40.7128, lng: -74.0060 },
            mapId: "ITINERARY_MAP"
        });
        geocoder = new google.maps.Geocoder();
        console.log('[DEBUG] Map initialized successfully');
    } catch (error) {
        console.error('[DEBUG] Error initializing map:', error);
        // Continue without map
    }
    
    try {
        displayPreferences();
        initializePreferenceToggles();
        await generateItinerary();
        console.log('[DEBUG] Itinerary generation complete');
    } catch (error) {
        console.error('[DEBUG] Error initializing:', error);
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

// generateItinerary: uses SSE streaming so cards appear as each chunk completes
async function generateItinerary() {
    console.log('[DEBUG] generateItinerary called');
    const errorMessageDiv = document.getElementById("error-message");
    const itineraryDisplayDiv = document.getElementById("itinerary-display");
    showLoadingWithProgression();
    if (errorMessageDiv) errorMessageDiv.style.display = "none";
    if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "none";

    // Wait up to 1s for localStorage to be populated
    let tripDetails = getTripDetailsFromStorage();
    let waited = 0;
    while (!tripDetails && waited < 1000) {
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
        tripDetails = getTripDetailsFromStorage();
    }
    if (!tripDetails) {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = "Trip details not found. Please return to the previous page.";
            errorMessageDiv.style.display = "block";
        }
        document.getElementById("loading-indicator").style.display = "none";
        return;
    }

    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;

    // Kick off weather fetch in parallel — don't await, cards use cache when ready
    fetchRealWeather(tripDetails.destination, baseUrl);

    const params = new URLSearchParams({
        destination: tripDetails.destination,
        departureDate: tripDetails.departureDate,
        arrivalDate: tripDetails.arrivalDate,
        preferences: JSON.stringify(tripDetails.preferences || []),
        advancedPreferences: JSON.stringify([]),
        tripStyle: tripDetails.tripStyle || 'balanced'
    });

    return new Promise((resolve, reject) => {
        let accumulatedActivities = [];
        let firstChunkReceived = false;

        const evtSource = new EventSource(`${baseUrl}/generate-itinerary-stream?${params}`);

        evtSource.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'chunk') {
                    accumulatedActivities.push(...data.activities);
                    // Show cards as each chunk arrives
                    itineraryData = enhanceAndFixItinerary([...accumulatedActivities], tripDetails);
                    renderItineraryCards(itineraryData);
                    if (!firstChunkReceived) {
                        firstChunkReceived = true;
                        if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "block";
                        document.getElementById("loading-indicator").style.display = "none";
                    }
                } else if (data.type === 'complete') {
                    evtSource.close();
                    itineraryData = enhanceAndFixItinerary(data.itinerary, tripDetails);
                    renderItineraryCards(itineraryData);
                    initDragAndDrop();
                    loadActivityPhotos(itineraryData, baseUrl);
                    loadYelpRatings(itineraryData);
                    await populateItineraryTable(itineraryData);
                    await displayMapAndMarkers(itineraryData);
                    populateDaySelectors(itineraryData);
                    updateHeroStats(itineraryData);
                    // Budget with currency conversion
                    loadCurrencyRate(tripDetails.destination).then(() => updateBudgetPanel(itineraryData));
                    // Flights
                    loadFlightPrices();
                    if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "block";
                    document.getElementById("loading-indicator").style.display = "none";
                    resolve();
                } else if (data.type === 'error') {
                    evtSource.close();
                    throw new Error(data.message);
                }
            } catch (err) {
                evtSource.close();
                if (errorMessageDiv) {
                    errorMessageDiv.textContent = `Error: ${err.message}`;
                    errorMessageDiv.style.display = "block";
                }
                document.getElementById("loading-indicator").style.display = "none";
                reject(err);
            }
        };

        evtSource.onerror = () => {
            evtSource.close();
            // Fall back to regular endpoint if SSE fails
            const fallbackUrl = `${baseUrl}/generate-itinerary?${params}`;
            fetch(fallbackUrl)
                .then(r => r.json())
                .then(async data => {
                    itineraryData = enhanceAndFixItinerary(data.itinerary, tripDetails);
                    renderItineraryCards(itineraryData);
                    loadActivityPhotos(itineraryData, baseUrl);
                    await populateItineraryTable(itineraryData);
                    await displayMapAndMarkers(itineraryData);
                    populateDaySelectors(itineraryData);
                    updateHeroStats(itineraryData);
                    updateBudgetPanel(itineraryData);
                    if (itineraryDisplayDiv) itineraryDisplayDiv.style.display = "block";
                    document.getElementById("loading-indicator").style.display = "none";
                    resolve();
                })
                .catch(err => {
                    if (errorMessageDiv) {
                        errorMessageDiv.textContent = `Error: ${err.message}`;
                        errorMessageDiv.style.display = "block";
                    }
                    document.getElementById("loading-indicator").style.display = "none";
                    reject(err);
                });
        };
    });
}

function updateHeroStats(data) {
    try {
        document.getElementById('activities-count').textContent = data.length;
        document.getElementById('trip-duration').textContent = new Set(data.map(i => i.day)).size + ' days';
        document.getElementById('destinations-count').textContent = new Set(data.map(i => i.location)).size;
    } catch (e) { /* elements may not exist */ }
}

// Render itinerary as VRBO-inspired cards
function getUnsplashImageUrl(query) {
    // Use Unsplash source API for demo (no API key needed, random image)
    return `https://source.unsplash.com/800x400/?${encodeURIComponent(query)}`;
}

function renderItineraryCards(itineraryItems) {
    normalizeDayLabels(itineraryItems);
    const container = document.getElementById('itinerary-cards-container');
    if (!container) return;
    container.innerHTML = '';
    // Group by day
    const dayGroups = {};
    itineraryItems.forEach((item, idx) => {
        if (!dayGroups[item.day]) dayGroups[item.day] = [];
        dayGroups[item.day].push({ ...enhanceActivityData(item, idx), _globalIdx: idx });
    });
    const sortedDayKeys = Object.keys(dayGroups).sort((a, b) => {
        const valA = getDaySortValue(a, itineraryItems.findIndex(i => i.day === a));
        const valB = getDaySortValue(b, itineraryItems.findIndex(i => i.day === b));
        return valA - valB;
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
        dayCard.className = 'itinerary-day-card';
        // Day header (blue gradient)
        const dayHeader = document.createElement('div');
        dayHeader.className = 'itinerary-day-header';
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

        activities.forEach((item, activityIdx) => {
            const card = document.createElement('div');
            card.className = 'itinerary-card';
            card.setAttribute('data-day', dayName);
            card.setAttribute('data-time', item.time);
            card.setAttribute('data-activity', item.activity);
            card.setAttribute('data-location', item.location || '');
            // Modern icon buttons only, horizontally aligned with time
            card.innerHTML = `
                <div class="itinerary-card-header-row">
                  <div class="itinerary-card-time"><span class="material-symbols-rounded time-icon">schedule</span> ${item.time || ''}</div>
                  <div class="itinerary-card-actions">
                    <button class="icon-btn regen-btn modern-action-btn" title="Regenerate activity" aria-label="Regenerate activity" tabindex="0">
                      <span class="material-symbols-rounded">autorenew</span>
                    </button>
                    <button class="icon-btn delete-btn modern-action-btn" title="Delete activity" aria-label="Delete activity" tabindex="0">
                      <span class="material-symbols-rounded">delete</span>
                    </button>
                  </div>
                </div>
                <div class="itinerary-card-title">${item.activity || ''}</div>
                <div class="itinerary-card-meta">
                    ${item.price ? `<span class="itinerary-card-price"><span class="icon">💰</span> ${item.price}</span>` : ''}
                    ${item.rating ? `<span class="itinerary-card-rating"><span class="icon">⭐</span> ${item.rating}</span>` : ''}
                </div>
                ${item.location && item.mapLink ? `<div class="itinerary-card-location"><a href="${item.mapLink}" target="_blank" class="itinerary-card-map-link">📍 ${item.location}</a></div>` : item.location ? `<div class="itinerary-card-location">📍 ${item.location}</div>` : ''}
            `;
            cardsWrapper.appendChild(card);
        });
        dayCard.appendChild(cardsWrapper);
        // Modern add button (icon only, more modern look)
        const addDayBtn = document.createElement('button');
        addDayBtn.className = 'add-activity-btn modern-action-btn modern-plus-btn';
        addDayBtn.title = 'Add activity to this day';
        addDayBtn.setAttribute('aria-label', 'Add activity to this day');
        addDayBtn.innerHTML = '<span class="material-symbols-rounded">add</span>';
        addDayBtn.setAttribute('data-day', dayName);
        addDayBtn.onclick = handleAddActivity;
        dayCard.appendChild(addDayBtn);
        container.appendChild(dayCard);
    });

    // Attach event listeners for actions
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = handleDeleteActivity;
    });
    container.querySelectorAll('.regen-btn').forEach(btn => {
        btn.onclick = handleRegenerateActivity;
    });
}

// Helper: normalize all day labels to match the first occurrence for each date
function normalizeDayLabels(itineraryItems) {
    // Map from date string (e.g. '2025-06-25') to canonical day label
    const dateToDayLabel = {};
    // Helper to extract date from day label
    function extractDate(dayLabel) {
        // Try to extract ISO or US date
        let match = dayLabel.match(/(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
        match = dayLabel.match(/([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/);
        if (match) return new Date(match[1]).toISOString().split('T')[0];
        match = dayLabel.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
        if (match) return new Date(match[1]).toISOString().split('T')[0];
        return dayLabel;
    }
    // First pass: build map
    itineraryItems.forEach(item => {
        const date = extractDate(item.day);
        if (date && !dateToDayLabel[date]) {
            dateToDayLabel[date] = item.day;
        }
    });
    // Second pass: update all day fields
    itineraryItems.forEach(item => {
        const date = extractDate(item.day);
        if (date && dateToDayLabel[date]) {
            item.day = dateToDayLabel[date];
        }
    });
}

// Helper: get canonical day label for a given day (by date or by fuzzy match)
function getCanonicalDayLabel(day, itineraryItems) {
    // Try exact match first
    if (itineraryItems.some(item => item.day === day)) return day;
    // Try to match by date (e.g., 'Tuesday, June 24, 2025' vs 'Tuesday')
    // Extract date from any day label in the itinerary
    function extractDate(dayLabel) {
        let match = dayLabel.match(/(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
        match = dayLabel.match(/([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/);
        if (match) return new Date(match[1]).toISOString().split('T')[0];
        match = dayLabel.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
        if (match) return new Date(match[1]).toISOString().split('T')[0];
        return null;
    }
    // Try to match by weekday name
    const dayWeekday = day.split(',')[0].trim();
    for (const item of itineraryItems) {
        const itemWeekday = item.day.split(',')[0].trim();
        if (itemWeekday === dayWeekday) return item.day;
        // Try by date
        const dayDate = extractDate(day);
        const itemDate = extractDate(item.day);
        if (dayDate && itemDate && dayDate === itemDate) return item.day;
    }
    // Fallback: return the original
    return day;
}

// Helper function to extract and sort day values
function getDaySortValue(dayLabel, fallbackIndex = 0) {
  // Try to extract a date from any part of the label (e.g. 'Monday, June 24, 2025' or 'Day 2: Monday, June 24, 2025')
  // Match: e.g. 'Monday, June 24, 2025' or 'June 24, 2025' or '2025-06-24'
  let dateMatch = dayLabel.match(/(\d{4}-\d{2}-\d{2})|([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})|([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
  if (dateMatch) {
    let dateStr = dateMatch[1] || dateMatch[2] || dateMatch[3];
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) return parsed;
  }
  // Fallback: use the order in which the day appears (for stable sort)
  return 1000000 + fallbackIndex;
}

// Fix add activity: insert new activity at the end of the correct day in the flat array
async function handleAddActivity(e) {
    let day = e.target.getAttribute('data-day');
    if (!day && e.target.parentElement) {
        day = e.target.parentElement.getAttribute('data-day');
    }
    const tripDetails = getTripDetailsFromStorage();
    if (!day || !tripDetails?.destination) return;
    let baseUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:10000';
    } else {
        baseUrl = window.location.origin;
    }
    try {
        const response = await fetch(`${baseUrl}/api/add-activity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                day,
                destination: tripDetails.destination,
                departureDate: tripDetails.departureDate,
                arrivalDate: tripDetails.arrivalDate,
                preferences: tripDetails.preferences,
                tripStyle: tripDetails.tripStyle,
                itinerary: itineraryData
            })
        });
        if (!response.ok) throw new Error('Failed to add activity');
        const newActivity = await response.json();
        // Find last index of this day in the flat array
        let lastIdx = -1;
        for (let i = itineraryData.length - 1; i >= 0; i--) {
            if (itineraryData[i].day === day) {
                lastIdx = i;
                break;
            }
        }
        if (lastIdx !== -1) {
            // Force newActivity.day to match canonical label
            newActivity.day = getCanonicalDayLabel(day, itineraryData);
            itineraryData.splice(lastIdx + 1, 0, newActivity);
        } else {
            newActivity.day = getCanonicalDayLabel(day, itineraryData);
            itineraryData.push(newActivity);
        }
        normalizeDayLabels(itineraryData);
        renderItineraryCards(itineraryData);
        await populateItineraryTable(itineraryData);
        await displayMapAndMarkers(itineraryData);
        populateDaySelectors(itineraryData);
    } catch (err) {
        alert('Error adding activity: ' + err.message);
    }
}

// Fix regenerate: use day, time, activity to find and replace the correct activity
async function handleRegenerateActivity(e) {
    const card = e.target.closest('.itinerary-card');
    if (!card) return;
    const day = card.getAttribute('data-day');
    const time = card.getAttribute('data-time');
    const activity = card.getAttribute('data-activity');
    const tripDetails = getTripDetailsFromStorage();
    if (!day || !time || !activity || !tripDetails?.destination) return;
    // Find the correct activity in the flat array
    const idx = itineraryData.findIndex(item => item.day === day && item.time === time && item.activity === activity);
    if (idx === -1) return;
    const activityToReplace = itineraryData[idx];
    let baseUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:10000';
    } else {
        baseUrl = window.location.origin;
    }
    try {
        const response = await fetch(`${baseUrl}/api/regenerate-activity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                day,
                time: activityToReplace.time,
                destination: tripDetails.destination,
                departureDate: tripDetails.departureDate,
                arrivalDate: tripDetails.arrivalDate,
                preferences: tripDetails.preferences,
                tripStyle: tripDetails.tripStyle,
                itinerary: itineraryData,
                oldActivity: activityToReplace
            })
        });
        if (!response.ok) throw new Error('Failed to regenerate activity');
        const regeneratedActivity = await response.json();
        // Force regeneratedActivity.day to match canonical label
        regeneratedActivity.day = getCanonicalDayLabel(day, itineraryData);
        itineraryData[idx] = regeneratedActivity;
        normalizeDayLabels(itineraryData);
        renderItineraryCards(itineraryData);
        await populateItineraryTable(itineraryData);
        await displayMapAndMarkers(itineraryData);
        populateDaySelectors(itineraryData);
        // Scroll the updated card into view
        setTimeout(() => {
            const updatedCard = document.querySelector(`.itinerary-card[data-day="${day}"][data-time="${time}"][data-activity="${activity}"]`);
            if (updatedCard) {
                updatedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 300);
    } catch (err) {
        alert('Error regenerating activity: ' + err.message);
    }
}

// Add handleDeleteActivity for itinerary card delete button
function handleDeleteActivity(e) {
    const card = e.target.closest('.itinerary-card');
    if (!card) return;
    const day = card.getAttribute('data-day');
    const time = card.getAttribute('data-time');
    const activity = card.getAttribute('data-activity');
    // Find the correct activity in the flat array
    const idx = itineraryData.findIndex(item => item.day === day && item.time === time && item.activity === activity);
    if (idx === -1) return;
    itineraryData.splice(idx, 1);
    renderItineraryCards(itineraryData);
    populateItineraryTable(itineraryData);
    displayMapAndMarkers(itineraryData);
    populateDaySelectors(itineraryData);
}

// Add flatpickr library and CSS for date pickers if not already present
(function ensureFlatpickrLoaded() {
  if (!window.flatpickr) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    document.head.appendChild(link);
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
    script.onload = function() {
      // Re-initialize date pickers after flatpickr loads
      if (window.flatpickr) {
        flatpickr('#compact-departure-date', {
          minDate: 'today',
          dateFormat: 'Y-m-d',
          onChange: function(selectedDates, dateStr) {
            if (window.compactArrPicker) window.compactArrPicker.set('minDate', dateStr);
          }
        });
        window.compactArrPicker = flatpickr('#compact-arrival-date', {
          minDate: 'today',
          dateFormat: 'Y-m-d'
        });
      }
    };
    document.body.appendChild(script);
  }
})();

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
                    <th>Day</th>
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

    // Robust sort by date, fallback to original order
    const sortedDayKeys = Object.keys(dayGroups).sort((a, b) => {
        const valA = getDaySortValue(a, itineraryItems.findIndex(i => i.day === a));
        const valB = getDaySortValue(b, itineraryItems.findIndex(i => i.day === b));
        return valA - valB;
    });

    sortedDayKeys.forEach((dayName, dayIndex) => {
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
                <td>${dayName}</td>
            `;
            tbody.appendChild(row);
        });
    });
}

// Real weather cache — populated on load from OWM
let weatherForecastCache = [];

async function fetchRealWeather(destination, baseUrl) {
    try {
        const resp = await fetch(`${baseUrl}/api/weather?location=${encodeURIComponent(destination)}`);
        const data = await resp.json();
        weatherForecastCache = data.forecast || [];
        console.log(`[Weather] Loaded ${weatherForecastCache.length} days (source: ${data.source})`);
    } catch (e) {
        console.warn('[Weather] Could not fetch weather:', e.message);
    }
}

const OWM_ICON_MAP = {
    '01': '☀️', '02': '🌤️', '03': '⛅', '04': '☁️',
    '09': '🌧️', '10': '🌦️', '11': '⛈️', '13': '❄️', '50': '🌫️'
};

function generateWeatherForDay(dayIndex) {
    if (weatherForecastCache.length > dayIndex) {
        const fc = weatherForecastCache[dayIndex];
        const iconKey = (fc.icon || '01d').substring(0, 2);
        const emoji = OWM_ICON_MAP[iconKey] || '🌤️';
        return { icon: emoji, temp: `${Math.round(fc.high)}°/${Math.round(fc.low)}°F` };
    }
    // Fallback for days beyond forecast range
    const fallbacks = [
        { icon: '☀️', temp: '72°/56°F' }, { icon: '🌤️', temp: '68°/52°F' },
        { icon: '⛅', temp: '65°/48°F' }, { icon: '🌦️', temp: '62°/45°F' }
    ];
    return fallbacks[dayIndex % fallbacks.length];
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
    let mapLink = null;
    if (item.location) {
        const tripDetails = getTripDetailsFromStorage && getTripDetailsFromStorage();
        let fullLocation = item.location;
        if (tripDetails && tripDetails.destination && !fullLocation.toLowerCase().includes(tripDetails.destination.toLowerCase())) {
            fullLocation = `${fullLocation}, ${tripDetails.destination}`;
        }
        mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullLocation)}`;
    }

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
                    // Append destination if not already present in location string
                    let fullLocation = item.location;
                    if (!fullLocation.toLowerCase().includes(tripDetails.destination.toLowerCase())) {
                        fullLocation = `${fullLocation}, ${tripDetails.destination}`;
                    }
                    if (!locationCounts[fullLocation]) {
                        locationCounts[fullLocation] = [];
                    }
                    // Store the original item but with the fullLocation for geocoding
                    locationCounts[fullLocation].push({ ...item, _fullLocation: fullLocation });
                }
            });
            // Geocode all locations in parallel instead of one-by-one
            const geocodeResults = await Promise.all(
                Object.entries(locationCounts).map(async ([fullLocation, activities]) => {
                    try {
                        const pos = await geocodeLocation(fullLocation);
                        return { fullLocation, activities, pos };
                    } catch {
                        return { fullLocation, activities, pos: null };
                    }
                })
            );

            for (const { fullLocation, activities, pos } of geocodeResults) {
                if (!pos) { console.warn(`[Map] Could not geocode: ${fullLocation}`); continue; }
                pathCoords.push(pos);
                bounds.extend(pos);
                const marker = new google.maps.Marker({
                    position: pos,
                    map: map,
                    title: fullLocation,
                    icon: {
                        url: getMarkerIcon(activities[0]),
                        scaledSize: new google.maps.Size(30, 30)
                    }
                });
                const infoWindow = new google.maps.InfoWindow({
                    content: createInfoWindowContent(fullLocation, activities)
                });
                marker.addListener('click', () => { infoWindow.open(map, marker); });
                currentMarkers.push(marker);
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

// --- Google Places Autocomplete for 'Where to' field ---
document.addEventListener('DOMContentLoaded', function() {
  if (window.google && window.google.maps && window.google.maps.places) {
    var input = document.getElementById('compact-destination');
    if (input) {
      new google.maps.places.Autocomplete(input, {
        types: ['(cities)'],
        fields: ['address_components', 'geometry', 'name']
      });
    }
  }
});

// Custom Instructions Modal
const customInstructionsLink = document.getElementById('open-custom-instructions-link');
const customInstructionsModal = document.getElementById('custom-instructions-modal');
const customInstructionsClose = document.getElementById('close-custom-instructions-modal');
const customInstructionsApply = document.getElementById('apply-custom-instructions-modal');
if (customInstructionsLink && customInstructionsModal) customInstructionsLink.onclick = (e) => { e.preventDefault(); customInstructionsModal.style.display = 'flex'; };
if (customInstructionsClose && customInstructionsModal) customInstructionsClose.onclick = () => customInstructionsModal.style.display = 'none';
if (customInstructionsApply && customInstructionsModal) customInstructionsApply.onclick = () => {
  const textarea = document.getElementById('custom-instructions-textarea');
  if (textarea) {
    localStorage.setItem('customInstructions', textarea.value);
  }
  customInstructionsModal.style.display = 'none';
};

// --- Add handler for compact trip form (search bar) ---
const compactTripForm = document.getElementById('compact-trip-form');
if (compactTripForm) {
  compactTripForm.addEventListener('submit', function(e) {
    e.preventDefault();
    // Save current search bar values to localStorage
    const destination = document.getElementById('compact-destination')?.value || '';
    const departureDate = document.getElementById('compact-departure-date')?.value || '';
    const arrivalDate = document.getElementById('compact-arrival-date')?.value || '';
    const tripStyle = document.getElementById('compact-trip-style')?.value || 'balanced';
    localStorage.setItem('tripDestination', destination);
    localStorage.setItem('tripDepartureDate', departureDate);
    localStorage.setItem('tripArrivalDate', arrivalDate);
    localStorage.setItem('tripStyle', tripStyle);
    // Remove any override so getTripDetailsFromStorage uses latest
    delete window.getTripDetailsFromStorageOverride;
    // Regenerate itinerary with new values
    generateItinerary();
    // Close the mobile drawer after search
    const drawer = document.getElementById('mobile-search-drawer');
    if (drawer) drawer.classList.remove('open');
    const openBtn = document.getElementById('open-search-drawer');
    if (openBtn) openBtn.style.display = 'block';
  });
}

// Ensure itinerary generation always runs
document.addEventListener('DOMContentLoaded', function() {
    // Ensure itinerary generation always runs
    if (typeof window.initMapAndItinerary === 'function') {
        window.initMapAndItinerary();
    }
});

// --- Mobile drawer logic ---
function isMobileDrawerEnabled() {
  // Always enable the drawer, regardless of screen size
  return true;
}

function showMobileDrawer(show) {
  const drawer = document.getElementById('mobile-search-drawer');
  const openBtn = document.getElementById('open-search-drawer');
  if (!drawer || !openBtn) return;
  if (show) {
    drawer.classList.add('open');
    openBtn.style.display = 'none';
  } else {
    drawer.classList.remove('open');
    openBtn.style.display = 'block';
  }
}

function setupMobileDrawer() {
  const drawer = document.getElementById('mobile-search-drawer');
  const openBtn = document.getElementById('open-search-drawer');
  const closeBtn = document.getElementById('close-search-drawer');
  if (!drawer || !openBtn || !closeBtn) return;
  openBtn.onclick = () => showMobileDrawer(true);
  closeBtn.onclick = () => showMobileDrawer(false);
  drawer.addEventListener('click', function(e) {
    if (e.target === drawer) showMobileDrawer(false);
  });
  // Always start closed
  showMobileDrawer(false);
}

// --- Call setupMobileDrawer IMMEDIATELY so menu always works ---
setupMobileDrawer();

// --- Call setupMobileDrawer on DOMContentLoaded ---
// window.addEventListener('DOMContentLoaded', () => {
//   setupMobileDrawer();
// });

// Refine Results button opens the drawer on desktop
document.addEventListener('DOMContentLoaded', function() {
  var refineBtn = document.getElementById('refine-results-btn');
  var refineModal = document.getElementById('refine-modal');
  var closeRefineModal = document.getElementById('close-refine-modal');
  if (refineBtn && refineModal) {
    refineBtn.addEventListener('click', function() {
      refineModal.style.display = 'flex';
      setupRefineAccordion(); // Ensure accordion logic is always attached when modal opens
    });
  }
  if (closeRefineModal && refineModal) {
    closeRefineModal.addEventListener('click', function() {
      refineModal.style.display = 'none';
    });
  }
  window.addEventListener('click', function(event) {
    if (event.target === refineModal) refineModal.style.display = 'none';
  });
});

// --- Refine Modal Enhancements ---
window.addEventListener('DOMContentLoaded', () => {
  // a) Make refine button less tall
  const refineBtn = document.getElementById('refine-update-itinerary');
  if (refineBtn) {
    refineBtn.style.padding = '0.5rem 1rem';
    refineBtn.style.height = '2.2rem';
    refineBtn.style.fontSize = '0.9rem';
  }

  // b) Date picker and city autocomplete for modal
  if (window.flatpickr) {
    const refineDepPicker = flatpickr('#refine-departure-date', {
      minDate: 'today',
      dateFormat: 'Y-m-d',
      onChange: function(selectedDates, dateStr) {
        if (window.refineArrPicker) window.refineArrPicker.set('minDate', dateStr);
      }
    });
    window.refineArrPicker = flatpickr('#refine-arrival-date', {
      minDate: 'today',
      dateFormat: 'Y-m-d'
    });
    // Set values from localStorage if available
    const depVal = localStorage.getItem('tripDepartureDate');
    const arrVal = localStorage.getItem('tripArrivalDate');
    if (depVal) document.getElementById('refine-departure-date').value = depVal;
    if (arrVal) document.getElementById('refine-arrival-date').value = arrVal;
  }
  if (window.google && window.google.maps && window.google.maps.places) {
    var refineInput = document.getElementById('refine-destination');
    if (refineInput) {
      new google.maps.places.Autocomplete(refineInput, {
        types: ['(cities)'],
        fields: ['address_components', 'geometry', 'name']
      });
    }
  }

  // c) Add event listeners for modal's advanced, interests, and custom instructions buttons
  const refineInterestsBtn = document.getElementById('refine-open-interests-modal');
  const refineCustomInstructionsBtn = document.getElementById('refine-open-custom-instructions-link');
  const refineAdvancedBtn = document.getElementById('refine-open-advanced-modal-link');
  if (refineInterestsBtn) refineInterestsBtn.onclick = () => document.getElementById('interests-modal').style.display = 'flex';
  if (refineCustomInstructionsBtn) refineCustomInstructionsBtn.onclick = (e) => { e.preventDefault(); document.getElementById('custom-instructions-modal').style.display = 'flex'; };
  if (refineAdvancedBtn) refineAdvancedBtn.onclick = (e) => { e.preventDefault(); document.getElementById('advanced-modal').style.display = 'flex'; };

  // d) Inline checkboxes for interests, advanced, and custom instructions in refine modal (optional: see HTML for full move)
  // (If you want to move the content inline, update the HTML as well)
});

// Accordion logic for refine modal
function setupRefineAccordion() {
  const accordions = document.querySelectorAll('#refine-modal .accordion-section');
  accordions.forEach(section => {
    const toggle = section.querySelector('.accordion-toggle');
    const content = section.querySelector('.accordion-content');
    // Collapse all by default
    section.classList.remove('expanded');
    toggle.setAttribute('aria-expanded', 'false');
    section.querySelector('.accordion-arrow').textContent = '▶';
    content.style.display = 'none';
    // Toggle logic
    toggle.addEventListener('click', function() {
      const expanded = section.classList.contains('expanded');
      // Collapse all
      accordions.forEach(s => {
        s.classList.remove('expanded');
        s.querySelector('.accordion-toggle').setAttribute('aria-expanded', 'false');
        s.querySelector('.accordion-arrow').textContent = '▶';
        s.querySelector('.accordion-content').style.display = 'none';
      });
      // Expand this one if it was not already expanded
      if (!expanded) {
        section.classList.add('expanded');
        toggle.setAttribute('aria-expanded', 'true');
        section.querySelector('.accordion-arrow').textContent = '▼';
        content.style.display = '';
      }
    });
  });
}

// Accordion logic for mobile search drawer (same as desktop)
function setupMobileDrawerAccordion() {
  const drawer = document.getElementById('mobile-search-drawer');
  if (!drawer) return;
  const accordions = drawer.querySelectorAll('.accordion-section');
  accordions.forEach(section => {
    const toggle = section.querySelector('.accordion-toggle');
    const content = section.querySelector('.accordion-content');
    // Collapse all by default
    section.classList.remove('expanded');
    toggle.setAttribute('aria-expanded', 'false');
    section.querySelector('.accordion-arrow').textContent = '\u25b6';
    content.style.display = 'none';
    // Toggle logic
    toggle.addEventListener('click', function() {
      const expanded = section.classList.contains('expanded');
      // Collapse all
      accordions.forEach(s => {
        s.classList.remove('expanded');
        s.querySelector('.accordion-toggle').setAttribute('aria-expanded', 'false');
        s.querySelector('.accordion-arrow').textContent = '\u25b6';
        s.querySelector('.accordion-content').style.display = 'none';
      });
      // Expand this one if it was not already expanded
      if (!expanded) {
        section.classList.add('expanded');
        toggle.setAttribute('aria-expanded', 'true');
        section.querySelector('.accordion-arrow').textContent = '\u25bc';
        content.style.display = '';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  // ...existing code...
  setupRefineAccordion();
  setupMobileDrawerAccordion();
  // ...existing code...
});

// --- Robust Google Maps Autocomplete for mobile drawer ---
function attachMobileAutocomplete() {
  const input = document.getElementById('compact-destination');
  if (!input) return;
  // Remove any previous autocomplete instance
  if (input._autocompleteInstance && input._autocompleteInstance.unbindAll) {
    input._autocompleteInstance.unbindAll();
    input._autocompleteInstance = null;
  }
  if (window.google && window.google.maps && window.google.maps.places) {
    input._autocompleteInstance = new google.maps.places.Autocomplete(input, {
      types: ['(cities)'],
      fields: ['address_components', 'geometry', 'name']
    });
    // Move .pac-container to body and position it above overlays
    input.addEventListener('focus', function() {
      setTimeout(() => {
        const pac = document.querySelector('.pac-container');
        if (pac && pac.parentNode !== document.body) {
          document.body.appendChild(pac);
        }
        if (pac) {
          pac.style.position = 'absolute';
          pac.style.zIndex = '3000';
          const rect = input.getBoundingClientRect();
          pac.style.top = (window.scrollY + rect.bottom) + 'px';
          pac.style.left = (window.scrollX + rect.left) + 'px';
          pac.style.width = rect.width + 'px';
        }
      }, 200);
    });
  }
}
const openBtn2 = document.getElementById('open-search-drawer');
if (openBtn2) {
  openBtn2.addEventListener('click', function() {
    setTimeout(attachMobileAutocomplete, 200);
  });
}

// =====================================================================
// SHARE FEATURE
// =====================================================================
async function shareItinerary() {
    if (!itineraryData || itineraryData.length === 0) return;
    const tripDetails = getTripDetailsFromStorage();
    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;
    try {
        const resp = await fetch(`${baseUrl}/api/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itinerary: itineraryData,
                destination: tripDetails?.destination,
                departureDate: tripDetails?.departureDate,
                arrivalDate: tripDetails?.arrivalDate,
                preferences: tripDetails?.preferences,
                tripStyle: tripDetails?.tripStyle
            })
        });
        const { shareUrl } = await resp.json();
        const modal = document.getElementById('share-modal');
        const input = document.getElementById('share-url-input');
        if (modal && input) {
            input.value = shareUrl;
            modal.style.display = 'flex';
        }
    } catch (err) {
        alert('Could not generate share link: ' + err.message);
    }
}

function copyShareLink() {
    const input = document.getElementById('share-url-input');
    if (!input) return;
    input.select();
    document.execCommand('copy');
    const btn = document.getElementById('copy-link-btn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
}

// On load: check for ?share=ID in URL and pre-load that itinerary
(async function checkSharedItinerary() {
    const shareId = new URLSearchParams(window.location.search).get('share');
    if (!shareId) return;
    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;
    try {
        const resp = await fetch(`${baseUrl}/api/share/${shareId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        localStorage.setItem('tripDestination', data.destination || '');
        localStorage.setItem('tripDepartureDate', data.departureDate || '');
        localStorage.setItem('tripArrivalDate', data.arrivalDate || '');
        localStorage.setItem('tripPreferences', JSON.stringify(data.preferences || []));
        localStorage.setItem('tripStyle', data.tripStyle || 'balanced');
        localStorage.setItem('sharedItinerary', JSON.stringify(data.itinerary));
    } catch (err) {
        console.warn('Could not load shared itinerary:', err);
    }
})();

// =====================================================================
// REAL ACTIVITY PHOTOS (lazy-loaded in parallel)
// =====================================================================
async function loadActivityPhotos(items, baseUrl) {
    if (!baseUrl) baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;

    const cards = document.querySelectorAll('.itinerary-card');
    const photoPromises = Array.from(cards).map(async (card) => {
        const activity = card.getAttribute('data-activity') || '';
        const location = card.getAttribute('data-location') || '';
        if (!activity) return;
        const query = `${activity} ${location}`.trim();
        try {
            const resp = await fetch(`${baseUrl}/api/activity-image?query=${encodeURIComponent(query)}`);
            const data = await resp.json();
            if (data.imageUrl) {
                const img = document.createElement('img');
                img.src = data.imageUrl;
                img.className = 'activity-card-photo';
                img.alt = activity;
                img.onerror = () => img.remove();
                card.insertBefore(img, card.firstChild);
            }
        } catch { /* silently skip */ }
    });
    await Promise.all(photoPromises);
}

// =====================================================================
// BUDGET TRACKER
// =====================================================================
const BUDGET_ESTIMATES = {
    dining: { low: 15, mid: 40, high: 90 },
    attraction: { low: 10, mid: 25, high: 60 },
    outdoor: { low: 0, mid: 10, high: 30 },
    activity: { low: 20, mid: 50, high: 100 }
};

function estimateCost(item) {
    const a = (item.activity || '').toLowerCase();
    let cat = 'activity';
    if (a.includes('breakfast') || a.includes('lunch') || a.includes('dinner') || a.includes('restaurant') || a.includes('cafe') || a.includes('bar')) cat = 'dining';
    else if (a.includes('museum') || a.includes('tour') || a.includes('show') || a.includes('ticket')) cat = 'attraction';
    else if (a.includes('park') || a.includes('walk') || a.includes('hike') || a.includes('beach')) cat = 'outdoor';
    return BUDGET_ESTIMATES[cat].mid;
}

function updateBudgetPanel(items) {
    const panel = document.getElementById('budget-panel');
    if (!panel) return;

    const dayGroups = {};
    items.forEach(item => {
        if (!dayGroups[item.day]) dayGroups[item.day] = [];
        dayGroups[item.day].push(item);
    });

    let totalEstimate = 0;
    const dayRows = Object.entries(dayGroups).map(([day, acts]) => {
        const dayTotal = acts.reduce((sum, a) => sum + estimateCost(a), 0);
        totalEstimate += dayTotal;
        const label = day.match(/Day (\d+):/)?.[0] || day.split(',')[0];
        const localAmt = currencyRate !== 1 ? ` (${currencySymbol} ${Math.round(dayTotal * currencyRate).toLocaleString()})` : '';
        return `<div class="budget-day-row"><span>${label}</span><span>~$${dayTotal}${localAmt}</span></div>`;
    }).join('');

    panel.innerHTML = `
        <div class="budget-header">
            <span>💰 Budget Estimate</span>
            <button onclick="document.getElementById('budget-body').style.display=document.getElementById('budget-body').style.display==='none'?'block':'none'" class="budget-toggle-btn">▾</button>
        </div>
        <div id="budget-body">
            <div class="budget-day-rows">${dayRows}</div>
            <div class="budget-total-row"><strong>Total Estimate</strong><strong>~$${totalEstimate}${currencyRate !== 1 ? ` · ${currencySymbol} ${Math.round(totalEstimate * currencyRate).toLocaleString()}` : ''}</strong></div>
            <p class="budget-note">Estimates based on typical mid-range spending. Actual costs vary.</p>
        </div>`;
    panel.style.display = 'block';
}

// =====================================================================
// PDF EXPORT
// =====================================================================
function exportToPDF() {
    window.print();
}

// =====================================================================
// CALENDAR EXPORT (downloads .ics file)
// =====================================================================
function exportToCalendar() {
    const tripDetails = getTripDetailsFromStorage();
    if (!itineraryData || !tripDetails) return;

    const pad = n => String(n).padStart(2, '0');
    const toICSDate = (dateStr, timeStr) => {
        try {
            const d = new Date(dateStr);
            const timeParts = timeStr?.match(/(\d+):(\d+)\s*(AM|PM)/i);
            let h = 9, m = 0;
            if (timeParts) {
                h = parseInt(timeParts[1]);
                m = parseInt(timeParts[2]);
                if (timeParts[3].toUpperCase() === 'PM' && h !== 12) h += 12;
                if (timeParts[3].toUpperCase() === 'AM' && h === 12) h = 0;
            }
            return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
        } catch { return null; }
    };

    // Map day labels to actual ISO dates
    const startDate = new Date(tripDetails.departureDate);
    const dayLabelToDate = {};
    itineraryData.forEach(item => {
        if (!dayLabelToDate[item.day]) {
            // Try to parse date from day label
            const match = item.day.match(/([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2})/);
            if (match) {
                const parsed = new Date(match[1] + ', ' + startDate.getFullYear());
                if (!isNaN(parsed)) dayLabelToDate[item.day] = parsed.toISOString().split('T')[0];
            }
            if (!dayLabelToDate[item.day]) dayLabelToDate[item.day] = tripDetails.departureDate;
        }
    });

    let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AItinerate//EN\r\nCALSCALE:GREGORIAN\r\n`;

    itineraryData.forEach((item, i) => {
        const dateStr = dayLabelToDate[item.day] || tripDetails.departureDate;
        const dtStart = toICSDate(dateStr, item.time);
        const dtEnd = toICSDate(dateStr, item.time); // same time, 1hr duration assumed
        if (!dtStart) return;

        // Bump end by 1 hour
        const endHour = parseInt(dtEnd.substring(9, 11)) + 1;
        const dtEndAdjusted = dtEnd.substring(0, 9) + pad(endHour % 24) + dtEnd.substring(11);

        ics += `BEGIN:VEVENT\r\n`;
        ics += `UID:aitinerate-${i}-${Date.now()}@aitinerate\r\n`;
        ics += `DTSTART:${dtStart}\r\n`;
        ics += `DTEND:${dtEndAdjusted}\r\n`;
        ics += `SUMMARY:${item.activity?.replace(/[,;\\]/g, ' ')}\r\n`;
        ics += `LOCATION:${item.location?.replace(/[,;\\]/g, ' ')}\r\n`;
        ics += `END:VEVENT\r\n`;
    });

    ics += `END:VCALENDAR`;

    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tripDetails.destination || 'itinerary'}.ics`;
    a.click();
    URL.revokeObjectURL(url);
}

// =====================================================================
// AI CHAT PANEL
// =====================================================================
let chatHistory = [];

function initChatPanel() {
    const btn = document.getElementById('chat-fab');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');

    if (!btn || !panel) return;

    btn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        if (panel.style.display === 'flex' && input) input.focus();
    });
    if (closeBtn) closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = input?.value?.trim();
            if (!message) return;
            input.value = '';
            await sendChatMessage(message);
        });
    }
}

function appendChatMessage(role, text) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${role}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

async function sendChatMessage(message) {
    appendChatMessage('user', message);
    appendChatMessage('assistant', '...');

    const tripDetails = getTripDetailsFromStorage();
    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;

    try {
        const resp = await fetch(`${baseUrl}/api/chat-refine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                itinerary: itineraryData,
                destination: tripDetails?.destination,
                tripStyle: tripDetails?.tripStyle
            })
        });
        const data = await resp.json();

        // Remove the "..." placeholder
        const messages = document.getElementById('chat-messages');
        if (messages) messages.lastChild?.remove();

        if (data.type === 'update' && Array.isArray(data.itinerary)) {
            itineraryData = enhanceAndFixItinerary(data.itinerary, tripDetails);
            renderItineraryCards(itineraryData);
            populateItineraryTable(itineraryData);
            displayMapAndMarkers(itineraryData);
            updateBudgetPanel(itineraryData);
            appendChatMessage('assistant', data.content || 'Itinerary updated!');
            showNotification('Itinerary updated by AI assistant');
        } else {
            appendChatMessage('assistant', data.content || 'Done!');
        }
    } catch (err) {
        const messages = document.getElementById('chat-messages');
        if (messages) messages.lastChild?.remove();
        appendChatMessage('assistant', 'Sorry, something went wrong. Please try again.');
    }
}

// Initialize chat panel when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initChatPanel();
    // Share button
    document.getElementById('share-btn')?.addEventListener('click', shareItinerary);
    document.getElementById('copy-link-btn')?.addEventListener('click', copyShareLink);
    document.getElementById('share-modal-close')?.addEventListener('click', () => {
        document.getElementById('share-modal').style.display = 'none';
    });
    // Export buttons
    document.getElementById('export-pdf-btn')?.addEventListener('click', exportToPDF);
    document.getElementById('export-cal-btn')?.addEventListener('click', exportToCalendar);
    // Saved trips
    document.getElementById('save-trip-btn')?.addEventListener('click', saveTrip);
    document.getElementById('my-trips-btn')?.addEventListener('click', openMyTrips);
    document.getElementById('my-trips-close')?.addEventListener('click', () => {
        document.getElementById('my-trips-modal').style.display = 'none';
    });
    // Init Clerk
    initClerk();
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
});

// =====================================================================
// FLIGHT PRICES (Google Flights deep link)
// =====================================================================
async function loadFlightPrices() {
    const tripDetails = getTripDetailsFromStorage();
    const originCity = localStorage.getItem('tripOriginCity');
    const panel = document.getElementById('flights-panel');
    if (!panel || !tripDetails) return;
    if (!originCity) {
        panel.innerHTML = `<div class="flights-note">Add your departure city on the home page to see flight options.</div>`;
        panel.style.display = 'block';
        return;
    }

    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;

    try {
        const params = new URLSearchParams({ origin: originCity, destination: tripDetails.destination });
        const resp = await fetch(`${baseUrl}/api/flights?${params}`);
        const data = await resp.json();

        if (!data.available) { panel.style.display = 'none'; return; }

        panel.innerHTML = `
            <div class="flights-header">
                <span>✈️ ${data.origin} → ${data.destination}</span>
            </div>
            <a href="${data.googleFlightsUrl}" target="_blank" rel="noopener" class="google-flights-btn">
                Search flights on Google ↗
            </a>
            <p class="flights-note">Opens Google Flights for live prices and booking</p>`;
        panel.style.display = 'block';
    } catch {
        panel.style.display = 'none';
    }
}

// =====================================================================
// YELP RATINGS (enriches cards after render)
// =====================================================================
async function loadYelpRatings(items) {
    const tripDetails = getTripDetailsFromStorage();
    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;

    // Only enrich dining and attraction cards — batch with small concurrency
    const cards = Array.from(document.querySelectorAll('.itinerary-card'));
    const enrichQueue = cards.filter(c => {
        const a = (c.getAttribute('data-activity') || '').toLowerCase();
        return a.includes('restaurant') || a.includes('lunch') || a.includes('dinner') ||
               a.includes('breakfast') || a.includes('cafe') || a.includes('museum') ||
               a.includes('bar') || a.includes('attraction');
    }).slice(0, 10); // cap at 10 to avoid hammering API

    await Promise.all(enrichQueue.map(async (card) => {
        const activity = card.getAttribute('data-activity') || '';
        const location = card.getAttribute('data-location') || tripDetails?.destination || '';
        try {
            const resp = await fetch(`${baseUrl}/api/yelp?term=${encodeURIComponent(activity)}&location=${encodeURIComponent(location)}`);
            const data = await resp.json();
            if (!data.available) return;

            // Update rating on card
            const ratingEl = card.querySelector('.itinerary-card-rating');
            if (ratingEl) {
                ratingEl.innerHTML = `<span class="icon">⭐</span> ${data.rating} <span style="color:#999;font-size:0.75rem;">(${data.reviewCount?.toLocaleString()})</span>`;
            }
            // Update price on card
            if (data.price) {
                const priceEl = card.querySelector('.itinerary-card-price');
                if (priceEl) priceEl.innerHTML = `<span class="icon">💰</span> ${data.price}`;
            }
            // Add Yelp link
            if (data.url) {
                const locEl = card.querySelector('.itinerary-card-location');
                if (locEl && !locEl.querySelector('.yelp-link')) {
                    const a = document.createElement('a');
                    a.href = data.url; a.target = '_blank'; a.rel = 'noopener';
                    a.className = 'yelp-link';
                    a.textContent = ' · Google reviews';
                    a.style.cssText = 'color:#1a73e8;font-size:0.78rem;text-decoration:none;margin-left:4px;';
                    locEl.appendChild(a);
                }
            }
        } catch { /* silently skip */ }
    }));
}

// =====================================================================
// CURRENCY DISPLAY
// =====================================================================
let currencyRate = 1;
let currencySymbol = 'USD';

async function loadCurrencyRate(destination) {
    try {
        // Detect currency from destination country name
        const countryToCurrency = {
            japan: 'JPY', france: 'EUR', germany: 'EUR', italy: 'EUR', spain: 'EUR',
            portugal: 'EUR', greece: 'EUR', netherlands: 'EUR', uk: 'GBP', britain: 'GBP',
            england: 'GBP', australia: 'AUD', canada: 'CAD', mexico: 'MXN',
            brazil: 'BRL', india: 'INR', thailand: 'THB', singapore: 'SGD',
            indonesia: 'IDR', bali: 'IDR', vietnam: 'VND', morocco: 'MAD',
            turkey: 'TRY', egypt: 'EGP', south_africa: 'ZAR', south africa: 'ZAR',
            argentina: 'ARS', colombia: 'COP', peru: 'PEN', chile: 'CLP',
            switzerland: 'CHF', sweden: 'SEK', norway: 'NOK', denmark: 'DKK',
            iceland: 'ISK', new_zealand: 'NZD', new zealand: 'NZD', dubai: 'AED',
            uae: 'AED', israel: 'ILS', china: 'CNY', korea: 'KRW', taiwan: 'TWD'
        };
        const destLower = (destination || '').toLowerCase();
        let currency = 'USD';
        for (const [key, code] of Object.entries(countryToCurrency)) {
            if (destLower.includes(key)) { currency = code; break; }
        }
        if (currency === 'USD') return; // no conversion needed

        const resp = await fetch(`https://open.er-api.com/v6/latest/USD`);
        const data = await resp.json();
        if (data.rates?.[currency]) {
            currencyRate = data.rates[currency];
            currencySymbol = currency;
            console.log(`[Currency] 1 USD = ${currencyRate} ${currencySymbol}`);
        }
    } catch { /* silently skip */ }
}

// =====================================================================
// SORTABLEJS DRAG-AND-DROP
// =====================================================================
function initDragAndDrop() {
    // SortableJS loaded from CDN — init each day's card wrapper
    if (typeof Sortable === 'undefined') return;
    document.querySelectorAll('.itinerary-day-cards-wrapper').forEach(wrapper => {
        Sortable.create(wrapper, {
            animation: 150,
            handle: '.itinerary-card-time',
            ghostClass: 'drag-ghost',
            onEnd(evt) {
                // Sync the reorder back to itineraryData
                const dayName = evt.item.getAttribute('data-day');
                const dayItems = itineraryData.filter(i => i.day === dayName);
                const otherItems = itineraryData.filter(i => i.day !== dayName);
                // Re-order based on new DOM order
                const newOrder = Array.from(wrapper.querySelectorAll('.itinerary-card'))
                    .map(card => dayItems.find(i => i.activity === card.getAttribute('data-activity') && i.time === card.getAttribute('data-time')))
                    .filter(Boolean);
                itineraryData = [...otherItems, ...newOrder];
                updateBudgetPanel(itineraryData);
            }
        });
    });
}

// =====================================================================
// CLERK AUTH + SAVED TRIPS
// =====================================================================
let clerkInstance = null;
let clerkSessionToken = null;

async function initClerk() {
    const publishableKey = window.__CLERK_PUBLISHABLE_KEY__;
    if (!publishableKey || typeof Clerk === 'undefined') return;
    try {
        clerkInstance = window.Clerk;
        await clerkInstance.load({ publishableKey });

        const userBtn = document.getElementById('clerk-user-btn');
        if (userBtn && clerkInstance.user) {
            clerkInstance.mountUserButton(userBtn);
            clerkSessionToken = await clerkInstance.session?.getToken();
            document.getElementById('save-trip-btn')?.removeAttribute('hidden');
            document.getElementById('my-trips-btn')?.removeAttribute('hidden');
        } else if (userBtn) {
            clerkInstance.mountSignInButton(userBtn, { mode: 'modal' });
        }
    } catch (e) {
        console.warn('[Clerk] Init error:', e.message);
    }
}

async function getAuthHeader() {
    if (!clerkInstance?.session) return {};
    const token = await clerkInstance.session.getToken();
    return { Authorization: `Bearer ${token}` };
}

async function saveTrip() {
    const tripDetails = getTripDetailsFromStorage();
    if (!itineraryData?.length || !tripDetails) return;
    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;
    try {
        const headers = { 'Content-Type': 'application/json', ...await getAuthHeader() };
        const resp = await fetch(`${baseUrl}/api/trips`, {
            method: 'POST', headers,
            body: JSON.stringify({ ...tripDetails, itinerary: itineraryData, name: tripDetails.destination })
        });
        if (!resp.ok) throw new Error('Save failed');
        showNotification('Trip saved to your account!');
    } catch (e) {
        alert('Could not save trip: ' + e.message);
    }
}

async function openMyTrips() {
    const modal = document.getElementById('my-trips-modal');
    const list = document.getElementById('my-trips-list');
    if (!modal || !list) return;
    modal.style.display = 'flex';
    list.innerHTML = '<p style="color:#999;">Loading...</p>';

    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;
    try {
        const headers = await getAuthHeader();
        const resp = await fetch(`${baseUrl}/api/trips`, { headers });
        const trips = await resp.json();
        if (!trips.length) { list.innerHTML = '<p style="color:#999;">No saved trips yet.</p>'; return; }
        list.innerHTML = trips.map(t => `
            <div class="saved-trip-row" data-id="${t.id}">
                <div>
                    <strong>${t.name || t.destination}</strong>
                    <div style="font-size:0.82rem;color:#717171;">${t.departure_date} → ${t.arrival_date} · ${t.trip_style}</div>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="loadSavedTrip('${t.id}')" style="padding:0.3rem 0.8rem;background:#2563eb;color:#fff;border:none;border-radius:0.4rem;cursor:pointer;font-size:0.82rem;">Load</button>
                    <button onclick="deleteSavedTrip('${t.id}',this)" style="padding:0.3rem 0.8rem;background:#fff;color:#e53e3e;border:1px solid #e53e3e;border-radius:0.4rem;cursor:pointer;font-size:0.82rem;">Delete</button>
                </div>
            </div>`).join('');
    } catch { list.innerHTML = '<p style="color:#e53e3e;">Could not load trips.</p>'; }
}

async function loadSavedTrip(id) {
    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;
    const headers = await getAuthHeader();
    const resp = await fetch(`${baseUrl}/api/trips/${id}`, { headers });
    const trip = await resp.json();
    localStorage.setItem('tripDestination', trip.destination);
    localStorage.setItem('tripDepartureDate', trip.departure_date);
    localStorage.setItem('tripArrivalDate', trip.arrival_date);
    localStorage.setItem('tripPreferences', JSON.stringify(trip.preferences || []));
    localStorage.setItem('tripStyle', trip.trip_style || 'balanced');
    document.getElementById('my-trips-modal').style.display = 'none';
    itineraryData = trip.itinerary;
    const tripDetails = getTripDetailsFromStorage();
    renderItineraryCards(itineraryData);
    populateItineraryTable(itineraryData);
    displayMapAndMarkers(itineraryData);
    updateBudgetPanel(itineraryData);
    showNotification(`Loaded: ${trip.name || trip.destination}`);
}

async function deleteSavedTrip(id, btn) {
    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000' : window.location.origin;
    const headers = await getAuthHeader();
    await fetch(`${baseUrl}/api/trips/${id}`, { method: 'DELETE', headers });
    btn.closest('.saved-trip-row').remove();
}