(function() {
    'use strict';
    
    // Encapsulate everything in an IIFE to avoid global conflicts
    let selectedDestination = '';
    
    // Google Maps initialization
    function initializeGoogleMaps() {
        const destinationInput = document.getElementById('destination');
        
        if (destinationInput && typeof google !== 'undefined' && google.maps) {
            try {
                const autocomplete = new google.maps.places.Autocomplete(destinationInput, {
                    types: ['(cities)']
                });

                autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();
                    selectedDestination = place.formatted_address || place.name || destinationInput.value;
                    console.log('Selected place:', selectedDestination);
                });

                destinationInput.addEventListener('input', () => {
                    selectedDestination = destinationInput.value;
                });
                
                console.log('Google Maps autocomplete initialized');
            } catch (error) {
                console.error('Error initializing Google Maps:', error);
                fallbackDestinationInput();
            }
        } else {
            fallbackDestinationInput();
        }
    }
    
    // Fallback for when Google Maps is not available
    function fallbackDestinationInput() {
        const destinationInput = document.getElementById('destination');
        if (destinationInput) {
            destinationInput.addEventListener('input', () => {
                selectedDestination = destinationInput.value;
            });
            console.log('Using fallback destination input');
        }
    }
    
    // Global initMap function for Google Maps callback
    window.initMap = function() {
        initializeGoogleMaps();
    };
    
    // Handle shared itinerary URLs
    function handleSharedItinerary() {
        const urlParams = new URLSearchParams(window.location.search);
        
        if (urlParams.get('shared') === 'true') {
            try {
                const destination = urlParams.get('destination');
                const departureDate = urlParams.get('departureDate');
                const arrivalDate = urlParams.get('arrivalDate');
                const preferences = urlParams.get('preferences');
                const itinerary = urlParams.get('itinerary');
                
                if (destination && departureDate && arrivalDate && itinerary) {
                    localStorage.setItem('tripDestination', destination);
                    localStorage.setItem('tripDepartureDate', departureDate);
                    localStorage.setItem('tripArrivalDate', arrivalDate);
                    localStorage.setItem('tripPreferences', preferences || '[]');
                    localStorage.setItem('sharedItinerary', itinerary);
                    
                    showSharedItineraryMessage(destination);
                    
                    setTimeout(() => {
                        window.location.href = '/second-page';
                    }, 2000);
                }
            } catch (error) {
                console.error('Error handling shared itinerary:', error);
            }
        }
    }

    // Show shared itinerary message
    function showSharedItineraryMessage(destination) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8); display: flex; align-items: center;
            justify-content: center; z-index: 1000; padding: 20px;
        `;
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; padding: 40px; max-width: 500px; width: 100%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #FF4C4C 0%, #FF7676 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 36px;">✈️</div>
                <h3 style="margin-bottom: 15px; color: #333; font-size: 24px;">Welcome to a Shared Itinerary!</h3>
                <p style="margin-bottom: 25px; color: #666; line-height: 1.6; font-size: 16px;">Someone has shared their amazing <strong>${destination}</strong> travel plan with you. Loading their itinerary now...</p>
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #FF4C4C; border-radius: 50%; animation: spin 1s linear infinite; margin: 20px auto;"></div>
                <p style="color: #888; font-size: 14px;">Powered by AItinerate</p>
            </div>
        `;
        
        const style = document.createElement('style');
        style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
        document.body.appendChild(modal);
    }

    // Initialize date pickers
    function initializeDatePickers() {
        const departureDateInput = document.getElementById('departure-date');
        const arrivalDateInput = document.getElementById('arrival-date');

        if (departureDateInput && arrivalDateInput) {
            try {
                if (typeof flatpickr !== 'undefined') {
                    flatpickr(departureDateInput, { 
                        dateFormat: "m/d/Y",
                        minDate: "today",
                        allowInput: true
                    });
                    flatpickr(arrivalDateInput, { 
                        dateFormat: "m/d/Y",
                        minDate: "today",
                        allowInput: true
                    });
                    console.log('Flatpickr initialized successfully');
                } else {
                    console.warn('Flatpickr not loaded, using native date inputs');
                    departureDateInput.type = 'date';
                    arrivalDateInput.type = 'date';
                    departureDateInput.min = new Date().toISOString().split('T')[0];
                    arrivalDateInput.min = new Date().toISOString().split('T')[0];
                }

                [departureDateInput, arrivalDateInput].forEach(input => {
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                        }
                    });
                });
            } catch (error) {
                console.error('Error initializing date pickers:', error);
                departureDateInput.type = 'date';
                arrivalDateInput.type = 'date';
            }
        }
    }

    // Handle advanced options toggle
    function setupAdvancedToggle() {
        const advancedToggle = document.getElementById('advanced-toggle');
        const advancedOptions = document.getElementById('advanced-options');
        const toggleIcon = document.querySelector('.toggle-icon');

        if (advancedToggle && advancedOptions) {
            console.log('Setting up advanced toggle');
            
            advancedToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const isExpanded = advancedOptions.classList.contains('expanded');
                console.log('Toggle clicked, expanded:', isExpanded);
                
                if (isExpanded) {
                    advancedOptions.classList.remove('expanded');
                    if (toggleIcon) {
                        toggleIcon.textContent = '▼';
                        toggleIcon.style.transform = 'rotate(0deg)';
                    }
                } else {
                    advancedOptions.classList.add('expanded');
                    if (toggleIcon) {
                        toggleIcon.textContent = '▲';
                        toggleIcon.style.transform = 'rotate(180deg)';
                    }
                }
            });
        } else {
            console.error('Advanced toggle elements not found');
        }
    }

    // Setup interactive form options
    function setupFormInteractions() {
        // Radio button selections
        function setupRadioOptions(selector, groupName) {
            const options = document.querySelectorAll(selector);
            options.forEach(option => {
                const radio = option.querySelector(`input[name="${groupName}"]`);
                
                option.addEventListener('click', (e) => {
                    e.preventDefault();
                    options.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    if (radio) radio.checked = true;
                });
            });
        }

        // Checkbox selections
        function setupCheckboxOptions(selector, inputName) {
            const options = document.querySelectorAll(selector);
            options.forEach(option => {
                const checkbox = option.querySelector(`input[name="${inputName}"]`);
                const card = option.querySelector('.interest-card, .transport-card');
                
                option.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        if (card) {
                            card.classList.toggle('selected', checkbox.checked);
                        }
                    }
                });
                
                if (checkbox && card) {
                    card.classList.toggle('selected', checkbox.checked);
                }
            });
        }

        setupRadioOptions('.coverage-option', 'trip-coverage');
        setupRadioOptions('.style-option', 'trip-style');
        setupRadioOptions('.budget-option', 'budget');
        setupRadioOptions('.dining-option', 'dining');
        
        setupCheckboxOptions('.interest-item', 'interests');
        setupCheckboxOptions('.transport-option', 'transportation');
    }

    // Form submission handler
    function setupFormSubmission() {
        const tripForm = document.getElementById('trip-form');
        const departureDateInput = document.getElementById('departure-date');
        const arrivalDateInput = document.getElementById('arrival-date');

        if (tripForm && departureDateInput && arrivalDateInput) {
            tripForm.addEventListener('submit', function (event) {
                event.preventDefault();

                const departureDate = departureDateInput.value.trim();
                const arrivalDate = arrivalDateInput.value.trim();
                const destinationInput = document.getElementById('destination');
                const destination = selectedDestination || (destinationInput ? destinationInput.value : '');

                if (!destination) {
                    alert('Please enter a destination.');
                    return;
                }

                if (!departureDate || !arrivalDate) {
                    alert('Please enter both departure and arrival dates.');
                    return;
                }

                if (new Date(departureDate) > new Date(arrivalDate)) {
                    alert('Departure date cannot be after arrival date');
                    return;
                }

                // Collect form data
                const selectedInterests = Array.from(document.querySelectorAll('input[name="interests"]:checked')).map(cb => cb.value);
                const tripCoverage = document.querySelector('input[name="trip-coverage"]:checked')?.value || 'single-city';
                const tripStyle = document.querySelector('input[name="trip-style"]:checked')?.value || 'balanced';
                const budget = document.querySelector('input[name="budget"]:checked')?.value || 'mid-range';
                const groupSize = document.getElementById('group-size')?.value || '2';
                const selectedTransportation = Array.from(document.querySelectorAll('input[name="transportation"]:checked')).map(cb => cb.value);
                const dining = document.querySelector('input[name="dining"]:checked')?.value || 'local';

                // Store in localStorage
                localStorage.setItem('tripDestination', destination);
                localStorage.setItem('tripDepartureDate', departureDate);
                localStorage.setItem('tripArrivalDate', arrivalDate);
                localStorage.setItem('tripCoverage', tripCoverage);
                localStorage.setItem('tripPreferences', JSON.stringify(selectedInterests));
                localStorage.setItem('tripStyle', tripStyle);
                localStorage.setItem('tripBudget', budget);
                localStorage.setItem('tripGroupSize', groupSize);
                localStorage.setItem('tripTransportation', JSON.stringify(selectedTransportation));
                localStorage.setItem('tripDining', dining);

                console.log('Form data stored, redirecting...');
                window.location.href = '/second-page';
            });
        }
    }

    // Inspiration destinations data - focused on activities
const inspirationData = {
    featured: [
        {
            title: "Tokyo, Japan",
            description: "Experience ancient temples, modern technology, and incredible street food culture",
            image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=800&q=80",
            badges: ["Culture", "Food", "Adventure"],
            activities: "Temple hopping, sushi making, robot shows"
        },
        {
            title: "Santorini, Greece",
            description: "Stunning sunsets, white-washed villages, and crystal-clear Mediterranean waters",
            image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=800&q=80",
            badges: ["Romance", "Photography", "Relaxation"],
            activities: "Sunset viewing, wine tasting, cliff hiking"
        },
        {
            title: "Bali, Indonesia",
            description: "Tropical paradise with rice terraces, spiritual temples, and vibrant culture",
            image: "https://plus.unsplash.com/premium_photo-1677829177642-30def98b0963?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
            badges: ["Nature", "Wellness", "Culture"],
            activities: "Temple visits, yoga retreats, volcano hiking"
        }
    ],
    
    weekend: [
        {
            title: "Napa Valley, CA",
            description: "World-class wineries and gourmet dining experiences",
            image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=600&q=80",
            badges: ["Food & Wine", "Romance"],
            activities: "Wine tastings, vineyard tours, spa treatments"
        },
        {
            title: "Charleston, SC",
            description: "Historic charm with Southern hospitality and amazing cuisine",
            image: "https://images.unsplash.com/photo-1518602164578-cd0074062767?auto=format&fit=crop&w=600&q=80",
            badges: ["History", "Food", "Architecture"],
            activities: "Historic tours, carriage rides, food walking tours"
        },
        {
            title: "Big Sur, CA",
            description: "Dramatic coastline with redwood forests and artistic communities",
            image: "https://plus.unsplash.com/premium_photo-1723708940528-58fbf9c73983?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
            badges: ["Nature", "Photography", "Art"],
            activities: "Coastal drives, forest hikes, art galleries"
        },
        {
            title: "Asheville, NC",
            description: "Mountain town with craft breweries and outdoor adventures",
            image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=600&q=80",
            badges: ["Adventure", "Craft Beer", "Music"],
            activities: "Brewery tours, mountain biking, live music"
        }
    ],
    
    adventure: [
        {
            title: "Iceland Adventure",
            description: "Northern lights, glaciers, and volcanic landscapes await exploration",
            image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=800&q=80",
            badges: ["Adventure", "Nature", "Photography"],
            activities: "Glacier hiking, northern lights tours, hot springs"
        },
        {
            title: "Costa Rica Zip-lining",
            description: "Canopy adventures through tropical rainforests",
            image: "https://images.unsplash.com/photo-1600176812877-8108bafde6e6?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
            badges: ["Adventure", "Wildlife", "Nature"],
            activities: "Zip-lining, wildlife tours, volcano hikes"
        },
        {
            title: "Patagonia Trek",
            description: "Epic hiking through pristine wilderness and dramatic peaks",
            image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80",
            badges: ["Hiking", "Wilderness", "Photography"],
            activities: "Multi-day treks, wildlife spotting, camping"
        }
    ],
    
    romantic: [
        {
            title: "Paris, France",
            description: "City of love with charming cafes and romantic river cruises",
            image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80",
            badges: ["Romance", "Culture", "Art"],
            activities: "Seine cruises, Louvre visits, wine tastings"
        },
        {
            title: "Venice, Italy",
            description: "Gondola rides through historic canals and intimate dining",
            image: "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=800&q=80",
            badges: ["Romance", "History", "Food"],
            activities: "Gondola rides, St. Mark's Square, romantic dinners"
        }
    ],
    
    family: [
        {
            title: "Orlando, Florida",
            description: "Theme park capital with magical experiences for all ages",
            image: "https://images.unsplash.com/photo-1597466599360-3b9775841aec?q=80&w=928&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
            badges: ["Family", "Entertainment", "Adventure"],
            activities: "Disney World, Universal Studios, water parks"
        },
        {
            title: "Yellowstone National Park",
            description: "Wildlife encounters and geothermal wonders for nature-loving families",
            image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
            badges: ["Nature", "Wildlife", "Education"],
            activities: "Geyser viewing, wildlife safaris, junior ranger programs"
        },
        {
            title: "San Diego, CA",
            description: "Perfect weather, beaches, and family-friendly attractions",
            image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
            badges: ["Beaches", "Zoo", "Family"],
            activities: "San Diego Zoo, beach days, Balboa Park"
        }
    ],
    
    group: [
        {
            title: "Las Vegas, Nevada",
            description: "Entertainment capital with shows, dining, and nightlife adventures",
            image: "https://images.unsplash.com/photo-1581351721010-8cf859cb14a4?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
            badges: ["Nightlife", "Entertainment", "Dining"],
            activities: "Shows, casino games, pool parties, group dining"
        },
        {
            title: "Austin, Texas",
            description: "Live music scene with BBQ tours and outdoor group activities",
            image: "https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=800&q=80",
            badges: ["Music", "Food", "Culture"],
            activities: "Live music venues, BBQ tours, kayaking on Lady Bird Lake"
        }
    ]
};

// Function to create inspiration cards
function createInspirationCard(destination, cardClass = 'inspiration-card') {
    // Only show the city name (title) on the card
    // On mobile, zoom out the background image
    const isMobile = window.innerWidth <= 768;
    const bgSize = isMobile ? '120%' : 'cover';
    return `
        <a href="#" class="${cardClass}" style="background-image: url('${destination.image}'); background-size: ${bgSize}; background-position: center;">
            <div class="card-overlay"></div>
            <div class="card-info">
                <h4 class="card-title">${destination.title}</h4>
            </div>
        </a>
    `;
}

// Populate inspiration sections
function populateInspirations() {
    const isMobile = window.innerWidth <= 768;
    // Featured destinations
    const featuredGrid = document.getElementById('featured-grid');
    if (featuredGrid) {
        featuredGrid.innerHTML = inspirationData.featured
            .map(dest => createInspirationCard(dest, 'featured-card'))
            .join('');
    }
    // Weekend getaways
    const weekendGrid = document.getElementById('weekend-grid');
    if (weekendGrid) {
        // Remove duplicates by image URL
        const uniqueWeekend = inspirationData.weekend.filter((dest, idx, arr) =>
            arr.findIndex(d => d.image === dest.image) === idx
        );
        weekendGrid.innerHTML = uniqueWeekend
            .map(dest => createInspirationCard(dest, 'weekend-card'))
            .join('');
    }
    if (!isMobile) {
        // Desktop: show all sections
        const adventureGrid = document.getElementById('adventure-grid');
        if (adventureGrid) {
            adventureGrid.innerHTML = inspirationData.adventure
                .map(dest => createInspirationCard(dest, 'adventure-card'))
                .join('');
        }
        const romanticGrid = document.getElementById('romantic-grid');
        if (romanticGrid) {
            romanticGrid.innerHTML = inspirationData.romantic
                .map(dest => createInspirationCard(dest, 'romantic-card'))
                .join('');
        }
        const familyGrid = document.getElementById('family-grid');
        if (familyGrid) {
            familyGrid.innerHTML = inspirationData.family
                .map(dest => createInspirationCard(dest, 'family-card'))
                .join('');
        }
        const groupGrid = document.getElementById('group-grid');
        if (groupGrid) {
            groupGrid.innerHTML = inspirationData.group
                .map(dest => createInspirationCard(dest, 'group-card'))
                .join('');
        }
    } else {
        // Mobile: hide last 3 sections
        const adventureSection = document.querySelector('.adventure-section');
        if (adventureSection) adventureSection.style.display = 'none';
        const romanticSection = document.querySelector('.romantic-section');
        if (romanticSection) romanticSection.style.display = 'none';
        const familySection = document.querySelector('.family-section');
        if (familySection) familySection.style.display = 'none';
        const groupSection = document.querySelector('.group-section');
        if (groupSection) groupSection.style.display = 'none';
    }
}

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, initializing app...');
        
        // Initialize all components
        handleSharedItinerary();
        initializeDatePickers();
        setupAdvancedToggle();
        setupFormInteractions();
        setupFormSubmission();
        populateInspirations();
        
        // Initialize Google Maps with delay to ensure DOM is ready
        setTimeout(() => {
            if (typeof google === 'undefined' || !google.maps) {
                console.warn('Google Maps not loaded, using fallback');
                fallbackDestinationInput();
            } else {
                initializeGoogleMaps();
            }
        }, 1000);
        
        console.log('App initialization complete');
    });

})();