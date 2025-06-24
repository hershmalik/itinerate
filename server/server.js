import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log("Loaded OpenAI API Key:", process.env.OPENAI_API_KEY ? "Exists" : "Missing");
console.log("Loaded Google Maps API Key:", process.env.GOOGLE_MAPS_API_KEY ? "Exists" : "Missing");

if (!process.env.OPENAI_API_KEY) {
    console.error("OpenAI API key is missing. Please check your .env file.");
    process.exit(1);
}

// Add missing constant
const MAX_DAYS_PER_CHUNK = 5;

const PORT = process.env.PORT || 3000; // Use standard port 3000, let hosting platform handle it

const app = express();

// --------- MIDDLEWARE SETUP ---------
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --------- API ROUTES FIRST ---------
// API middleware - ensure proper Content-Type for API responses ONLY
app.use('/api/*', (req, res, next) => {
  res.header('Content-Type', 'application/json');
  next();
});

app.get('/api/weather', async (req, res) => {
  try {
    const { location } = req.query;
    
    if (!location) {
      return res.status(400).json({ error: 'Location parameter is required' });
    }
    
    console.log(`Weather request received for location: ${location}`);
    
    // Mock weather data for now to prevent API failures
    const mockWeatherData = {
      current: {
        temp: 72,
        description: 'partly cloudy',
        icon: '02d',
        humidity: 65,
        windSpeed: 8
      },
      forecast: [
        { date: '2025-06-17', high: 75, low: 58, description: 'sunny', icon: '01d' },
        { date: '2025-06-18', high: 73, low: 60, description: 'cloudy', icon: '03d' },
        { date: '2025-06-19', high: 71, low: 55, description: 'light rain', icon: '10d' },
        { date: '2025-06-20', high: 74, low: 59, description: 'sunny', icon: '01d' },
        { date: '2025-06-21', high: 76, low: 61, description: 'partly cloudy', icon: '02d' }
      ]
    };
    
    res.json(mockWeatherData);
    
  } catch (error) {
    console.error('Weather API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch weather data', 
      message: error.message || 'Unknown error'
    });
  }
});

app.get('/api/place-details', async (req, res) => {
  try {
    const { name, location } = req.query;
    
    if (!name || !location) {
      return res.status(400).json({ error: 'Name and location parameters are required' });
    }
    
    console.log(`Place details request for: ${name}, ${location}`);
    
    // Mock place details for now
    const mockPlaceDetails = {
      found: true,
      name: name,
      address: location,
      rating: Math.random() * 2 + 3, // Random rating between 3-5
      totalRatings: Math.floor(Math.random() * 1000) + 50,
      priceLevel: Math.floor(Math.random() * 4),
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + location)}`
    };
    
    res.json(mockPlaceDetails);
    
  } catch (error) {
    console.error('Place Details API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch place details', 
      message: error.message || 'Unknown error'
    });
  }
});

app.get('/generate-itinerary', async (req, res) => {
    try {
        console.log('=== ITINERARY REQUEST RECEIVED ===');
        console.log('Query params:', req.query);
        
        const destination = req.query.destination || "Unknown";
        const preferences = req.query.preferences ? JSON.parse(req.query.preferences) : [];
        const advancedPreferences = req.query.advancedPreferences ? JSON.parse(req.query.advancedPreferences) : [];
        const customInstructions = req.query.customInstructions || ""; 
        const tripStyle = req.query.tripStyle || "balanced";
        const departureDateStr = req.query.departureDate; 
        const arrivalDateStr = req.query.arrivalDate;
        const multiCity = req.query.multiCity === 'true';
        const additionalCities = req.query.additionalCities ? JSON.parse(req.query.additionalCities) : [];
        
        if (!departureDateStr || !arrivalDateStr) {
            return res.status(400).json({ error: 'Missing departure or arrival date' });
        }

        // Parse dates
        const startDate = new Date(departureDateStr);
        const endDate = new Date(arrivalDateStr);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ error: "Invalid date format received." });
        }
        if (endDate < startDate) {
            return res.status(400).json({ error: "Arrival date cannot be before departure date." });
        }

        console.log('--- Parsed Request ---');
        console.log(`Destination: ${destination}`);
        console.log(`Multi-City: ${multiCity}`);
        console.log(`Additional Cities: ${additionalCities.join(', ')}`);
        console.log(`Preferences: ${preferences.join(', ')}`);
        console.log(`Trip Style: ${tripStyle}`);
        console.log(`Departure Date: ${departureDateStr}`);
        console.log(`Arrival Date: ${arrivalDateStr}`);
        
        // Generate the full itinerary using our service
        const completeItinerary = await generateFullItinerary(
            destination,
            preferences,
            startDate,
            endDate,
            advancedPreferences,
            customInstructions,
            tripStyle,
            multiCity,
            additionalCities
        );
        
        console.log("--- Generated Itinerary ---");
        console.log("Total activities:", completeItinerary.length);
        console.log("Days covered:", new Set(completeItinerary.map(item => item.day)).size);
        
        res.json({
            destination: destination,
            preferences: preferences,
            advancedPreferences: advancedPreferences,
            customInstructions: customInstructions,
            tripStyle: tripStyle,
            multiCity: multiCity,
            additionalCities: additionalCities,
            itinerary: completeItinerary
        });
        
    } catch (error) {
        console.error("=== ITINERARY GENERATION ERROR ===");
        console.error("Error details:", error);
        console.error("Stack trace:", error.stack);
        
        res.status(500).json({ 
            error: "Failed to generate itinerary",
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Update the generateFullItinerary function signature:
async function generateFullItinerary(destination, preferences, startDate, endDate, advancedPreferences = [], customInstructions = "", tripStyle = "balanced", multiCity = false, additionalCities = []) {
  // Calculate the total number of days (fix the missing day issue)
  const timeDiff = endDate.getTime() - startDate.getTime();
  const numberOfDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // This was correct, the issue is elsewhere
  
  console.log(`Generating itinerary for ${destination} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`Total days calculated: ${numberOfDays}, preferences: ${preferences.join(', ')}, trip style: ${tripStyle}`);
  
  let completeItinerary = [];
  
  // Process the itinerary in manageable chunks
  for (let chunkStart = 0; chunkStart < numberOfDays; chunkStart += MAX_DAYS_PER_CHUNK) {
    // Calculate days for this chunk
    const daysInThisChunk = Math.min(MAX_DAYS_PER_CHUNK, numberOfDays - chunkStart);
    
    // Calculate date range for this chunk
    const chunkStartDate = new Date(startDate);
    chunkStartDate.setDate(startDate.getDate() + chunkStart);
    
    const chunkEndDate = new Date(chunkStartDate);
    chunkEndDate.setDate(chunkStartDate.getDate() + daysInThisChunk - 1);
    
    console.log(`Processing chunk ${Math.floor(chunkStart / MAX_DAYS_PER_CHUNK) + 1} of ${Math.ceil(numberOfDays / MAX_DAYS_PER_CHUNK)}: ${daysInThisChunk} days`);
    
    try {
      // Generate itinerary for this chunk
      const chunkItinerary = await generateItineraryChunk(
        destination, 
        preferences, 
        chunkStartDate, 
        chunkEndDate,
        chunkStart,
        numberOfDays,
        advancedPreferences,
        customInstructions,
        tripStyle, // Add this parameter
        multiCity,
        additionalCities
      );
      
      // Add this chunk to the complete itinerary
      completeItinerary = [...completeItinerary, ...chunkItinerary];
    } catch (error) {
      console.error(`Error processing chunk ${Math.floor(chunkStart / MAX_DAYS_PER_CHUNK) + 1}:`, error);
    }
    
    // Brief delay between chunks to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Final verification
  const daysInCompleteItinerary = new Set(completeItinerary.map(item => item.day.split(',')[1].trim())).size;
  console.log(`Generated itinerary with ${completeItinerary.length} activities covering ${daysInCompleteItinerary} days`);
  
  // If we're missing days in the itinerary, try to fill them in
  if (daysInCompleteItinerary < numberOfDays) {
    console.log(`Missing ${numberOfDays - daysInCompleteItinerary} days in the itinerary. Attempting to fill gaps...`);
    completeItinerary = await fillMissingDays(completeItinerary, destination, preferences, startDate, endDate, tripStyle);
  }

  // Remove duplicate activities across days
  completeItinerary = removeDuplicateActivities(completeItinerary);

  return completeItinerary;
}

// Update generateItineraryChunk function:
async function generateItineraryChunk(destination, preferences, chunkStartDate, chunkEndDate, chunkStart, totalDays, advancedPreferences = [], customInstructions = "", tripStyle = "balanced", multiCity = false, additionalCities = []) {
  const chunkStartDateStr = chunkStartDate.toISOString().split('T')[0];
  const chunkEndDateStr = chunkEndDate.toISOString().split('T')[0];
  
  // Calculate actual number of days in this chunk
  const actualDays = Math.ceil((chunkEndDate - chunkStartDate) / (1000 * 60 * 60 * 24)) + 1;
  
  // Define activity counts based on trip style
  const activityCounts = {
    relaxed: { min: 2, max: 3, description: "~2-3 leisurely activities" },
    balanced: { min: 4, max: 6, description: "~4-6 well-spaced activities" },
    packed: { min: 6, max: 8, description: "~6-8 exciting activities" }
  };
  
  const styleConfig = activityCounts[tripStyle] || activityCounts.balanced;
  
  let systemPrompt = `You are a travel planner that creates detailed daily itineraries. You MUST follow the exact date range and activity requirements. Always respond with properly formatted JSON array only, no other text.`;
  
  // Create explicit day-by-day requirements
  const dayRequirements = [];
  const currentDate = new Date(chunkStartDate);
  
  for (let i = 0; i < actualDays; i++) {
    const dayName = currentDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    dayRequirements.push(`Day ${i + 1} (${dayName}): MUST have exactly ${styleConfig.min}-${styleConfig.max} activities`);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  let userPrompt = `Create a ${actualDays}-day itinerary for ${destination} covering ALL dates from ${chunkStartDateStr} to ${chunkEndDateStr}.

CRITICAL REQUIREMENTS - MUST FOLLOW:
${dayRequirements.join('\n')}

TOTAL ACTIVITIES REQUIRED: ${actualDays * styleConfig.min} to ${actualDays * styleConfig.max} activities across ALL ${actualDays} days

TRIP STYLE: ${tripStyle.toUpperCase()}
${tripStyle === 'relaxed' ? 'Focus on leisurely experiences with downtime' : 
  tripStyle === 'balanced' ? 'Balance activities with free time' : 
  'Pack in maximum experiences efficiently'}

ACTIVITY COUNT: Aim for ~${styleConfig.min}-${styleConfig.max} activities per day (may vary based on activity type and duration)`;

  // Add multi-city instructions if enabled
  if (multiCity && additionalCities.length > 0) {
    const allCities = [destination, ...additionalCities];
    const daysPerCity = Math.ceil(actualDays / allCities.length);
    
    userPrompt += `\n\nMULTI-CITY EXPLORATION:
This is a multi-city trip covering: ${allCities.join(', ')}
- Distribute ${actualDays} days across these ${allCities.length} cities
- Spend approximately ${daysPerCity} days in each city
- Include travel time between cities in the itinerary
- Suggest optimal hotel locations for each city segment
- Consider day trips between nearby cities when appropriate
- For each city, focus on its unique attractions and experiences

CITY-SPECIFIC GUIDANCE:
${allCities.map((city, index) => `${city}: Days ${index * daysPerCity + 1}-${Math.min((index + 1) * daysPerCity, actualDays)} - Focus on ${city}'s signature attractions, local culture, and must-see destinations`).join('\n')}`;
  }

  userPrompt += `\n\nSCHEDULING RULES:
- Schedule activities during appropriate business hours when venues will be open
- Breakfast: 7-10 AM, Lunch: 11 AM-2 PM, Dinner: 5-9 PM
- Museums/attractions: 9 AM-5 PM (avoid Mondays for major attractions)
- Shopping: 10 AM-8 PM
- Outdoor activities: During daylight hours
- Nightlife: After 6 PM

EXACT DATES TO USE:
${generateDateMapping(chunkStartDate, chunkEndDate)}

For each activity, use the "day" field format exactly as shown above (e.g., "Monday, June 17").

Traveler preferences: ${preferences.join(', ')}.`;

  if (advancedPreferences && advancedPreferences.length > 0) {
    userPrompt += `\nAdditional preferences: ${advancedPreferences.join(', ')}`;
  }
  
  if (customInstructions && customInstructions.trim().length > 0) {
    userPrompt += `\nSpecific instructions: "${customInstructions}"`;
  }

  userPrompt += `\n\nResponse format: JSON array only with objects containing "day", "time", "activity", "location" fields. NO other text.`;

  const messagesForOpenAI = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: messagesForOpenAI,
        temperature: 0.8, // Increase creativity
        max_tokens: 4000 // Increase token limit
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const responseData = await response.json();
    let responseText = responseData.choices[0].message.content;
    
    // Clean up the response text
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let chunkItinerary;
    try {
      chunkItinerary = JSON.parse(responseText);
      if (!Array.isArray(chunkItinerary)) {
        throw new Error("Response is not an array.");
      }
    } catch (parseError) {
      console.warn(`JSON parsing failed, attempting extraction...`);
      const jsonMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (jsonMatch) {
        chunkItinerary = JSON.parse(jsonMatch[0]);
      } else {
        console.error("Could not extract valid JSON");
        chunkItinerary = generateFallbackItinerary(chunkStartDate, chunkEndDate, destination, styleConfig);
      }
    }
    
    // Validate and fix the itinerary
    return validateAndFixItinerary(chunkItinerary, chunkStartDate, chunkEndDate, styleConfig, destination);
    
  } catch (error) {
    console.error("Error generating itinerary chunk:", error);
    // Return fallback itinerary instead of throwing
    return generateFallbackItinerary(chunkStartDate, chunkEndDate, destination, styleConfig);
  }
}

// Add validation function
function validateAndFixItinerary(itinerary, startDate, endDate, styleConfig, destination) {
  const fixedItinerary = [];
  const daysRequired = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  
  // Group activities by day
  const dayGroups = {};
  itinerary.forEach(item => {
    const day = item.day || "Unknown Day";
    if (!dayGroups[day]) dayGroups[day] = [];
    dayGroups[day].push(item);
  });
  
  // Ensure we have the right number of days with proper activities
  const currentDate = new Date(startDate);
  for (let i = 0; i < daysRequired; i++) {
    const dayName = currentDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    
    let dayActivities = dayGroups[dayName] || [];
    
    // Ensure each day has minimum activities
    while (dayActivities.length < styleConfig.min) {
      const timeSlots = ["9:00 AM", "1:00 PM", "6:00 PM"];
      const defaultActivities = [
        `Explore ${destination} downtown`,
        `Visit local attractions in ${destination}`,
        `Dining experience in ${destination}`,
        `Cultural activity in ${destination}`,
        `Shopping in ${destination}`
      ];
      
      dayActivities.push({
        day: dayName,
        time: timeSlots[dayActivities.length % timeSlots.length],
        activity: defaultActivities[dayActivities.length % defaultActivities.length],
        location: destination
      });
    }
    
    // Limit to max activities
    dayActivities = dayActivities.slice(0, styleConfig.max);
    
    fixedItinerary.push(...dayActivities);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return fixedItinerary;
}

// Add fallback function
function generateFallbackItinerary(startDate, endDate, destination, styleConfig) {
  const fallbackItinerary = [];
  const daysRequired = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  
  const timeSlots = ["9:00 AM", "12:00 PM", "3:00 PM", "6:00 PM"];
  const activities = [
    `Visit ${destination} city center`,
    `Explore local museums in ${destination}`,
    `Lunch at popular restaurant`,
    `Walking tour of ${destination}`,
    `Visit local market`,
    `Dinner at recommended restaurant`,
    `Evening entertainment`,
    `Cultural experience`
  ];
  
  const currentDate = new Date(startDate);
  
  for (let day = 0; day < daysRequired; day++) {
    const dayName = currentDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Add required number of activities for this day
    for (let i = 0; i < styleConfig.min; i++) {
      fallbackItinerary.push({
        day: dayName,
        time: timeSlots[i % timeSlots.length],
        activity: activities[(day * styleConfig.min + i) % activities.length],
        location: destination
      });
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return fallbackItinerary;
}

// Add the missing generateDateMapping function
function generateDateMapping(startDate, endDate) {
  const dateMapping = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dayName = currentDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    dateMapping.push(dayName);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dateMapping.map((day, index) => `Day ${index + 1}: ${day}`).join('\n');
}

// Add the missing removeDuplicateActivities function
function removeDuplicateActivities(itinerary) {
  const seen = new Set();
  const uniqueItinerary = [];
  
  itinerary.forEach(item => {
    // Safe toLowerCase for activity and location
    const activityKey = (item && typeof item.activity === 'string') ? item.activity.toLowerCase().trim() : '';
    const locationKey = (item && typeof item.location === 'string') ? item.location.toLowerCase().trim() : '';
    const key = `${activityKey}-${locationKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItinerary.push(item);
    }
  });
  
  console.log(`Removed ${itinerary.length - uniqueItinerary.length} duplicate activities`);
  return uniqueItinerary;
}

// Add the missing fillMissingDays function
async function fillMissingDays(itinerary, destination, preferences, startDate, endDate, tripStyle) {
  const existingDays = new Set(itinerary.map(item => item.day));
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  
  const currentDate = new Date(startDate);
  for (let i = 0; i < totalDays; i++) {
    const dayName = currentDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (!existingDays.has(dayName)) {
      // Add default activities for missing days
      const defaultActivities = [
        {
          day: dayName,
          time: "9:00 AM",
          activity: `Explore ${destination} downtown`,
          location: `City center of ${destination}`
        },
        {
          day: dayName,
          time: "1:00 PM",
          activity: `Lunch at local restaurant`,
          location: `Restaurant in ${destination}`
        },
        {
          day: dayName,
          time: "6:00 PM",
          activity: `Evening stroll and dinner`,
          location: `Popular area in ${destination}`
        }
      ];
      
      // Add based on trip style
      const activitiesPerDay = tripStyle === 'relaxed' ? 2 : tripStyle === 'packed' ? 4 : 3;
      itinerary.push(...defaultActivities.slice(0, activitiesPerDay));
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return itinerary;
}

// Update the processDailyForecasts function
function processDailyForecasts(forecastList) {
    const dailyForecasts = [];
    const processedDates = new Set();
    
    forecastList.forEach(forecast => {
        const date = forecast.dt_txt.split(' ')[0]; // Get just the date part
        
        if (!processedDates.has(date)) {
            processedDates.add(date);
            
            const dayData = {
                date: date,
                high: forecast.main.temp_max,
                low: forecast.main.temp_min,
                description: forecast.weather[0].description,
                icon: forecast.weather[0].icon
            };
            
            dailyForecasts.push(dayData);
        }
    });
    
    return dailyForecasts.slice(0, 5); // Return up to 5 days
}

function mapWeatherConditionToIcon(conditions, icon) {
    // Simple mapping - you can expand this
    const conditionMap = {
        'clear': '01d',
        'sunny': '01d',
        'cloudy': '02d',
        'overcast': '04d',
        'rain': '10d',
        'snow': '13d'
    };
    const lowerConditions = (typeof conditions === 'string') ? conditions.toLowerCase() : '';
    for (const [key, value] of Object.entries(conditionMap)) {
        if (lowerConditions.includes(key)) {
            return value;
        }
    }
    return icon || '01d'; // Default icon
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    console.error("Failed to start server:", err.message);
});

// Add this new API endpoint after the existing ones:
app.get('/api/activity-image', async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }
        
        console.log(`Image search request received for: ${query}`);
        
        const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
        if (!API_KEY) {
            return res.status(500).json({ error: 'Google Places API key not configured' });
        }
        
        // Use Google Places API to find the place and get photos
        const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,photos&key=${API_KEY}`;
        
        const searchResponse = await fetch(searchUrl);
        
        if (!searchResponse.ok) {
            throw new Error(`Google Places Search API error: ${searchResponse.status}`);
        }
        
        const searchData = await searchResponse.json();
        
        if (!searchData.candidates || searchData.candidates.length === 0 || !searchData.candidates[0].photos) {
            return res.json({ imageUrl: null });
        }
        
        // Get the first photo reference
        const photoReference = searchData.candidates[0].photos[0].photo_reference;
        
        // Construct the photo URL
        const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=200&photo_reference=${photoReference}&key=${API_KEY}`;
        
        res.json({ imageUrl: photoUrl });
        
    } catch (error) {
        console.error('Activity Image API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch activity image', 
            message: error.message || 'Unknown error'
        });
    }
});

// Add this AFTER your API routes but BEFORE app.listen()
// Replace the placeholder with actual API key for the frontend
app.use('/second-page', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, '../src/second-page.html'), 'utf8');
    html = html.replace('__GOOGLE_MAPS_API_KEY__', process.env.GOOGLE_MAPS_API_KEY || '');
    res.send(html);
});

// Serve the main page
app.get('/', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    html = html.replace('__GOOGLE_MAPS_API_KEY__', process.env.GOOGLE_MAPS_API_KEY || '');
    res.send(html);
});

// Handle second-page.html specifically
app.get('/second-page.html', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, '../src/second-page.html'), 'utf8');
    html = html.replace('__GOOGLE_MAPS_API_KEY__', process.env.GOOGLE_MAPS_API_KEY || '');
    res.send(html);
});

// --------- SERVE STATIC FILES BEFORE FALLBACK ---------
// Serve static files from src directory AFTER API routes but BEFORE fallback
// Exclude HTML files from static serving so they go through our custom handlers
app.use(express.static(path.join(__dirname, '../src'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  },
  // Skip HTML files so they go through our custom handlers
  ignore: ['*.html']
}));

// Fallback - serve index.html for any other routes (ONLY for HTML routes)
app.get('*', (req, res) => {
    // Only serve index.html for non-file requests
    if (!req.path.includes('.')) {
        let html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
        html = html.replace('__GOOGLE_MAPS_API_KEY__', process.env.GOOGLE_MAPS_API_KEY || '');
        res.send(html);
    } else {
        // For file requests that aren't handled by static middleware, return 404
        res.status(404).send('File not found');
    }
});

// Add this new API endpoint after the existing ones:
app.get('/api/trending-destinations', async (req, res) => {
    try {
        console.log('Trending destinations request received');
        
        // Enhanced trending destinations with multi-city suggestions
        const trendingDestinations = [
            {
                id: 1,
                name: 'Iceland Adventure',
                primaryCity: 'Reykjavik',
                additionalCities: ['Golden Circle', 'South Coast'],
                description: 'Northern lights, geysers, and stunning landscapes',
                imageUrl: 'https://images.unsplash.com/photo-1539066834862-2f447f4ffa8e?w=400',
                duration: '7 days',
                highlights: ['Blue Lagoon', 'Gullfoss Waterfall', 'Northern Lights'],
                multiCityOption: true
            },
            {
                id: 2,
                name: 'Japan Explorer',
                primaryCity: 'Tokyo',
                additionalCities: ['Kyoto', 'Osaka', 'Nara'],
                description: 'Traditional culture meets modern innovation',
                imageUrl: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400',
                duration: '10 days',
                highlights: ['Temples & Shrines', 'Sushi & Ramen', 'Cherry Blossoms'],
                multiCityOption: true
            },
            {
                id: 3,
                name: 'Italian Romance',
                primaryCity: 'Rome',
                additionalCities: ['Florence', 'Venice', 'Naples'],
                description: 'History, art, and incredible cuisine',
                imageUrl: 'https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?w=400',
                duration: '8 days',
                highlights: ['Colosseum', 'Vatican City', 'Tuscan Countryside'],
                multiCityOption: true
            },
            {
                id: 4,
                name: 'Tropical Paradise',
                primaryCity: 'Bali',
                additionalCities: ['Ubud', 'Seminyak', 'Canggu'],
                description: 'Beaches, temples, and tropical vibes',
                imageUrl: 'https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?w=400',
                duration: '6 days',
                highlights: ['Rice Terraces', 'Beach Clubs', 'Temple Tours'],
                multiCityOption: true
            },
            {
                id: 5,
                name: 'Greek Islands',
                primaryCity: 'Athens',
                additionalCities: ['Santorini', 'Mykonos', 'Crete'],
                description: 'Ancient history and pristine beaches',
                imageUrl: 'https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=400',
                duration: '9 days',
                highlights: ['Acropolis', 'Sunset Views', 'Island Hopping'],
                multiCityOption: true
            },
            {
                id: 6,
                name: 'Morocco Adventure',
                primaryCity: 'Marrakech',
                additionalCities: ['Fez', 'Casablanca', 'Chefchaouen'],
                description: 'Vibrant markets and desert landscapes',
                imageUrl: 'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=400',
                duration: '7 days',
                highlights: ['Sahara Desert', 'Medina Markets', 'Atlas Mountains'],
                multiCityOption: true
            }
        ];
        
        res.json(trendingDestinations);
        
    } catch (error) {
        console.error('Trending Destinations API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch trending destinations', 
            message: error.message || 'Unknown error'
        });
    }
});

// === ADD ACTIVITY ENDPOINT (AI-Generated) ===
app.post('/api/add-activity', async (req, res) => {
    try {
        const { day, destination, preferences, itinerary, advancedPreferences, tripStyle } = req.body;
        if (!day || !destination || !preferences || !Array.isArray(itinerary)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Generate descriptor tags for existing activities
        const existingTags = new Set(itinerary.map(a => (a && typeof a.activity === 'string' ? a.activity.toLowerCase().trim() : '')));
        // Compose prompt for OpenAI
        let userPrompt = `Suggest a single new activity for a travel itinerary in ${destination} on ${day}.\n` +
            `Traveler preferences: ${preferences.join(', ')}.\n` +
            (advancedPreferences && advancedPreferences.length > 0 ? `Advanced preferences: ${advancedPreferences.join(', ')}.\n` : '') +
            (tripStyle ? `Trip style: ${tripStyle}.\n` : '') +
            `Do NOT suggest any of these activities: ${Array.from(existingTags).join('; ')}.\n` +
            `Respond as a JSON object with fields: day, time, activity, location, and a descriptorTags array (e.g. [\"museum\", \"art\", \"morning\"]).`;
        const messages = [
            { role: 'system', content: 'You are a travel planner AI.' },
            { role: 'user', content: userPrompt }
        ];
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages,
                temperature: 0.8,
                max_tokens: 400
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }
        let responseText = (await response.json()).choices[0].message.content;
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        let newActivity;
        try {
            newActivity = JSON.parse(responseText);
        } catch (e) {
            // fallback: try to extract JSON
            const match = responseText.match(/\{[\s\S]*\}/);
            newActivity = match ? JSON.parse(match[0]) : null;
        }
        newActivity = sanitizeActivityObject(newActivity);
        if (!newActivity) return res.status(500).json({ error: 'Failed to parse AI response' });
        res.json(newActivity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add activity', message: error.message });
    }
});

// === REGENERATE ACTIVITY ENDPOINT (AI-Generated) ===
app.post('/api/regenerate-activity', async (req, res) => {
    try {
        const { day, time, destination, preferences, itinerary, oldActivity, advancedPreferences, tripStyle } = req.body;
        if (!day || !time || !destination || !preferences || !Array.isArray(itinerary) || !oldActivity) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Generate descriptor tags for old activity
        const oldTags = oldActivity.descriptorTags || [];
        const existingTags = new Set(itinerary.map(a => (a && typeof a.activity === 'string' ? a.activity.toLowerCase().trim() : '')));
        // Compose prompt for OpenAI
        let userPrompt = `Suggest a new activity for a travel itinerary in ${destination} on ${day} at ${time}.\n` +
            `Traveler preferences: ${preferences.join(', ')}.\n` +
            (advancedPreferences && advancedPreferences.length > 0 ? `Advanced preferences: ${advancedPreferences.join(', ')}.\n` : '') +
            (tripStyle ? `Trip style: ${tripStyle}.\n` : '') +
            `The new activity should be similar to this one: ${oldActivity.activity}.\n` +
            (oldTags.length > 0 ? `Descriptor tags: ${oldTags.join(', ')}.\n` : '') +
            `Do NOT suggest any of these activities: ${Array.from(existingTags).join('; ')}.\n` +
            `Respond as a JSON object with fields: day, time, activity, location, and a descriptorTags array (e.g. [\"museum\", \"art\", \"morning\"]).`;
        const messages = [
            { role: 'system', content: 'You are a travel planner AI.' },
            { role: 'user', content: userPrompt }
        ];
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages,
                temperature: 0.8,
                max_tokens: 400
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }
        let responseText = (await response.json()).choices[0].message.content;
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        let newActivity;
        try {
            newActivity = JSON.parse(responseText);
        } catch (e) {
            // fallback: try to extract JSON
            const match = responseText.match(/\{[\s\S]*\}/);
            newActivity = match ? JSON.parse(match[0]) : null;
        }
        newActivity = sanitizeActivityObject(newActivity);
        if (!newActivity) return res.status(500).json({ error: 'Failed to parse AI response' });
        res.json(newActivity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to regenerate activity', message: error.message });
    }
});

// Helper to sanitize activity objects
function sanitizeActivityObject(obj) {
    if (!obj) return obj;
    if (!obj.activity || typeof obj.activity !== 'string' || !obj.activity.trim()) {
        obj.activity = 'Unknown Activity';
    }
    if (!obj.location || typeof obj.location !== 'string' || !obj.location.trim()) {
        obj.location = 'Unknown Location';
    }
    if (!obj.day || typeof obj.day !== 'string' || !obj.day.trim()) {
        obj.day = 'Unknown Day';
    }
    if (!obj.time || typeof obj.time !== 'string' || !obj.time.trim()) {
        obj.time = 'Unknown Time';
    }
    return obj;
}