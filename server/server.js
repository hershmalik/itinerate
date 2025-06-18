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

if (!process.env.OPENAI_API_KEY) {
    console.error("OpenAI API key is missing. Please check your .env file.");
    process.exit(1);
}

// Add missing constant
const MAX_DAYS_PER_CHUNK = 5; // Process itinerary in 5-day chunks

const PORT = process.env.PORT || 5000; // Using port 5000 instead

const app = express();

// --------- KEEP MIDDLEWARE HERE ---------
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

// --------- DEFINE ALL API ROUTES FIRST ---------

// API middleware - ensure proper Content-Type for API responses ONLY
app.use('/api/*', (req, res, next) => {
  res.header('Content-Type', 'application/json');
  next();
});

// Keep your existing API routes below this line
app.get('/api/weather', async (req, res) => {
  try {
    const { location } = req.query;
    
    if (!location) {
      return res.status(400).json({ error: 'Location parameter is required' });
    }
    
    console.log(`Weather request received for location: ${location}`);
    
    const API_KEY = process.env.WEATHER_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'Weather API key not configured' });
    }
    
    const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=imperial&appid=${API_KEY}`;
    console.log(`Calling OpenWeatherMap API for current weather: ${currentWeatherUrl}`);
    
    const currentResponse = await fetch(currentWeatherUrl);
    
    if (!currentResponse.ok) {
      const errorText = await currentResponse.text();
      console.error(`OpenWeatherMap API error (${currentResponse.status}):`, errorText);
      return res.status(currentResponse.status).json({ 
        error: 'Weather service error', 
        message: `OpenWeatherMap API returned status ${currentResponse.status}`
      });
    }
    
    const currentData = await currentResponse.json();
    
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&units=imperial&appid=${API_KEY}`;
    console.log(`Calling OpenWeatherMap API for forecast: ${forecastUrl}`);
    
    const forecastResponse = await fetch(forecastUrl);
    
    if (!forecastResponse.ok) {
      const errorText = await forecastResponse.text();
      console.error(`OpenWeatherMap Forecast API error (${forecastResponse.status}):`, errorText);
      return res.json({
        current: {
          temp: currentData.main.temp,
          description: currentData.weather[0].description,
          icon: currentData.weather[0].icon,
          humidity: currentData.main.humidity,
          windSpeed: currentData.wind.speed
        },
        forecast: []
      });
    }
    
    const forecastData = await forecastResponse.json();
    
    const dailyForecasts = processDailyForecasts(forecastData.list);
    
    res.json({
      current: {
        temp: currentData.main.temp,
        description: currentData.weather[0].description,
        icon: currentData.weather[0].icon,
        humidity: currentData.main.humidity,
        windSpeed: currentData.wind.speed
      },
      forecast: dailyForecasts
    });
    
  } catch (error) {
    console.error('Weather API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch weather data', 
      message: error.message || 'Unknown error'
    });
  }
});

app.get('/api/historical-weather', async (req, res) => {
  try {
    const { location, date } = req.query;
    
    if (!location || !date) {
      return res.status(400).json({ error: 'Location and date parameters are required' });
    }
    
    console.log(`Historical weather request received for location: ${location}, date: ${date}`);
    
    const VC_API_KEY = process.env.VISUAL_CROSSING_API_KEY;
    const historicalUrl = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(location)}/${date}?unitGroup=us&include=days&key=${VC_API_KEY}&contentType=json`;
    
    console.log(`Calling Visual Crossing API for historical data: ${historicalUrl}`);
    
    const response = await fetch(historicalUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Visual Crossing API error (${response.status}):`, errorText);
      throw new Error(`Visual Crossing API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const weatherData = {
      high: data.days[0].tempmax,
      low: data.days[0].tempmin,
      description: data.days[0].conditions,
      icon: mapWeatherConditionToIcon(data.days[0].conditions, data.days[0].icon),
      source: 'Visual Crossing Weather API',
      isHistorical: true
    };
    
    res.json(weatherData);
    
  } catch (error) {
    console.error('Historical Weather API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch historical weather data', 
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
    
    console.log(`Google Places request received for: ${name}, ${location}`);
    
    const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'Google Places API key not configured' });
    }
    
    const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(name + ' ' + location)}&inputtype=textquery&fields=place_id,name,formatted_address,rating,user_ratings_total&key=${API_KEY}`;
    
    const searchResponse = await fetch(searchUrl);
    
    if (!searchResponse.ok) {
      throw new Error(`Google Places Search API error: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    if (!searchData.candidates || searchData.candidates.length === 0) {
      return res.json({ 
        found: false,
        name: name,
        location: location
      });
    }
    
    const placeId = searchData.candidates[0].place_id;
    
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,rating,user_ratings_total,opening_hours,url,price_level&key=${API_KEY}`;
    
    const detailsResponse = await fetch(detailsUrl);
    
    if (!detailsResponse.ok) {
      throw new Error(`Google Places Details API error: ${detailsResponse.status}`);
    }
    
    const detailsData = await detailsResponse.json();
    
    const placeDetails = {
      found: true,
      name: searchData.candidates[0].name || name,
      address: searchData.candidates[0].formatted_address || location,
      rating: searchData.candidates[0].rating || null,
      totalRatings: searchData.candidates[0].user_ratings_total || 0
    };
    
    if (detailsData.result && detailsData.result.opening_hours) {
      placeDetails.openNow = detailsData.result.opening_hours.open_now;
      placeDetails.hours = detailsData.result.opening_hours.weekday_text;
    }
    
    if (detailsData.result && detailsData.result.url) {
      placeDetails.url = detailsData.result.url;
    }
    
    if (detailsData.result && detailsData.result.price_level !== undefined) {
      placeDetails.priceLevel = detailsData.result.price_level;
    }
    
    res.json(placeDetails);
    
  } catch (error) {
    console.error('Google Places API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch place details', 
      message: error.message || 'Unknown error'
    });
  }
});

app.get('/generate-itinerary', async (req, res) => {
    try {
        const destination = req.query.destination || "Unknown";
        const preferences = req.query.preferences ? JSON.parse(req.query.preferences) : [];
        const advancedPreferences = req.query.advancedPreferences ? JSON.parse(req.query.advancedPreferences) : [];
        const customInstructions = req.query.customInstructions || ""; 
        const tripStyle = req.query.tripStyle || "balanced"; // Add this line
        const departureDateStr = req.query.departureDate; 
        const arrivalDateStr = req.query.arrivalDate;
        
        if (!departureDateStr || !arrivalDateStr) {
            return res.status(400).json({ error: 'Missing departure or arrival date' });
        }

        // Parse dates
        const startDate = new Date(departureDateStr);
        const endDate = new Date(arrivalDateStr);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error("Invalid date format received.");
        }
        if (endDate < startDate) {
            throw new Error("Arrival date cannot be before departure date.");
        }

        console.log('--- New Itinerary Request ---');
        console.log(`Destination: ${destination}`);
        console.log(`Preferences: ${preferences.join(', ')}`);
        console.log(`Advanced Preferences: ${advancedPreferences.join(', ')}`);
        console.log(`Custom Instructions: ${customInstructions}`);
        console.log(`Trip Style: ${tripStyle}`); // Add this log
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
            tripStyle // Add this parameter
        );
        
        console.log("--- Final Complete Itinerary ---");
        console.log("Total activities:", completeItinerary.length);
        console.log("Days covered:", new Set(completeItinerary.map(item => item.day)).size);
        console.log("Days are:", [...new Set(completeItinerary.map(item => item.day))]);
        
        res.json({
            destination: destination,
            preferences: preferences,
            advancedPreferences: advancedPreferences,
            customInstructions: customInstructions,
            tripStyle: tripStyle, // Add this
            itinerary: completeItinerary
        });
        
    } catch (error) {
        console.error("Server Error in /generate-itinerary:", error);
        res.status(500).json({ 
            error: "Failed to generate itinerary",
            message: error.message
        });
    }
});

// Update the generateFullItinerary function signature:
async function generateFullItinerary(destination, preferences, startDate, endDate, advancedPreferences = [], customInstructions = "", tripStyle = "balanced") {
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
        tripStyle // Add this parameter
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
async function generateItineraryChunk(destination, preferences, chunkStartDate, chunkEndDate, chunkStart, totalDays, advancedPreferences = [], customInstructions = "", tripStyle = "balanced") {
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

ACTIVITY COUNT: Aim for ~${styleConfig.min}-${styleConfig.max} activities per day (may vary based on activity type and duration)

SCHEDULING RULES:
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
    
    const lowerConditions = conditions.toLowerCase();
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

// Serve static files from src directory
app.use(express.static(path.join(__dirname, '../src')));

// Fallback - serve index.html for any other routes
app.get('*', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    html = html.replace('__GOOGLE_MAPS_API_KEY__', process.env.GOOGLE_MAPS_API_KEY || '');
    res.send(html);
});