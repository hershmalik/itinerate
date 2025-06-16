import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log("Loaded OpenAI API Key:", process.env.OPENAI_API_KEY ? "Exists" : "Missing");

if (!process.env.OPENAI_API_KEY) {
    console.error("OpenAI API key is missing. Please check your .env file.");
    process.exit(1);
}

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
        console.log(`Departure Date: ${departureDateStr}`);
        console.log(`Arrival Date: ${arrivalDateStr}`);
        
        // Generate the full itinerary using our service
        const completeItinerary = await generateFullItinerary(
            destination,
            preferences,
            startDate,
            endDate,
            advancedPreferences,
            customInstructions
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

app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// --------- STATIC FILES & PAGE ROUTES AFTER API ROUTES ---------
app.use(express.static(path.join(__dirname, '../src')));

// Specific routes for HTML pages
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, '../src/index.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error loading page');
    const replaced = data.replace(/__GOOGLE_MAPS_API_KEY__/g, process.env.GOOGLE_MAPS_API_KEY || '');
    res.send(replaced);
  });
});

app.get('/second-page', (req, res) => {
  const filePath = path.join(__dirname, '../src/second-page.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error loading page');
    const replaced = data.replace(/__GOOGLE_MAPS_API_KEY__/g, process.env.GOOGLE_MAPS_API_KEY || '');
    res.send(replaced);
  });
});

// --------- CATCH-ALL ROUTE LAST ---------
app.get('*', (req, res) => {
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  const filePath = path.join(__dirname, '../src/index.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error loading page');
    const replaced = data.replace(/__GOOGLE_MAPS_API_KEY__/g, process.env.GOOGLE_MAPS_API_KEY || '');
    res.send(replaced);
  });
});

// Helper function to map Visual Crossing weather conditions to OpenWeatherMap icons for consistency
function mapWeatherConditionToIcon(conditions, iconCode) {
  if (!conditions) return '03d';
  
  const conditionLower = conditions.toLowerCase();
  
  if (conditionLower.includes('clear') || conditionLower.includes('sunny')) {
    return '01d';
  } else if (conditionLower.includes('partly cloudy') || conditionLower.includes('partly-cloudy')) {
    return '02d';
  } else if (conditionLower.includes('cloudy') || conditionLower.includes('overcast')) {
    return '04d';
  } else if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) {
    return '10d';
  } else if (conditionLower.includes('thunder') || conditionLower.includes('lightning')) {
    return '11d';
  } else if (conditionLower.includes('snow') || conditionLower.includes('ice')) {
    return '13d';
  } else if (conditionLower.includes('fog') || conditionLower.includes('mist')) {
    return '50d';
  }
  
  return '03d';
}

// Helper function to process 3-hour forecasts into daily forecasts
function processDailyForecasts(forecastList) {
  const dailyMap = new Map();
  
  forecastList.forEach(item => {
    const date = new Date(item.dt * 1000);
    const dateKey = date.toISOString().split('T')[0];
    
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        day: date.toLocaleDateString('en-US', { weekday: 'long' }),
        temps: [],
        icons: [],
        descriptions: [],
        precipitation: 0,
        hasRain: false
      });
    }
    
    const dayData = dailyMap.get(dateKey);
    dayData.temps.push(item.main.temp);
    dayData.icons.push(item.weather[0].icon);
    dayData.descriptions.push(item.weather[0].description);
    
    if (item.rain && item.rain['3h'] > 0) {
      dayData.precipitation += item.rain['3h'];
      dayData.hasRain = true;
    }
    if (item.snow && item.snow['3h'] > 0) {
      dayData.precipitation += item.snow['3h'];
    }
  });
  
  return Array.from(dailyMap.values()).map(day => {
    return {
      date: day.date,
      day: day.day,
      high: Math.round(Math.max(...day.temps)),
      low: Math.round(Math.min(...day.temps)),
      icon: getMostFrequentIcon(day.icons),
      description: getMostFrequentDescription(day.descriptions),
      precipitation: Math.round(day.precipitation * 10) / 10,
      hasRain: day.hasRain
    };
  }).slice(0, 5);
}

function getMostFrequentIcon(icons) {
  const counts = {};
  let maxIcon = icons[0];
  let maxCount = 1;
  
  for (const icon of icons) {
    counts[icon] = (counts[icon] || 0) + 1;
    if (counts[icon] > maxCount) {
      maxCount = counts[icon];
      maxIcon = icon;
    }
  }
  
  return maxIcon;
}

function getMostFrequentDescription(descriptions) {
  const counts = {};
  let maxDescription = descriptions[0];
  let maxCount = 1;
  
  for (const desc of descriptions) {
    counts[desc] = (counts[desc] || 0) + 1;
    if (counts[desc] > maxCount) {
      maxCount = counts[desc];
      maxDescription = desc;
    }
  }
  
  return maxDescription;
}

// Maximum days to process in a single API call
const MAX_DAYS_PER_CHUNK = 3;

/**
 * Generates a full itinerary for the given date range
 */
async function generateFullItinerary(destination, preferences, startDate, endDate, advancedPreferences = [], customInstructions = "") {
  // Calculate the total number of days
  const timeDiff = endDate.getTime() - startDate.getTime();
  const numberOfDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
  
  console.log(`Generating itinerary for ${destination} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`Total days: ${numberOfDays}, preferences: ${preferences.join(', ')}`);
  
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
        customInstructions
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
    completeItinerary = await fillMissingDays(completeItinerary, destination, preferences, startDate, endDate);
  }

  // Remove duplicate activities across days
  completeItinerary = removeDuplicateActivities(completeItinerary);

  return completeItinerary;
}

/**
 * Generate itinerary for a specific chunk of days
 */
async function generateItineraryChunk(destination, preferences, chunkStartDate, chunkEndDate, chunkStart, totalDays, advancedPreferences = [], customInstructions = "") {
  const chunkStartDateStr = chunkStartDate.toISOString().split('T')[0];
  const chunkEndDateStr = chunkEndDate.toISOString().split('T')[0];
  
  let systemPrompt = `You are a helpful travel assistant that creates detailed itineraries. Always respond with properly formatted JSON. The response MUST be a JSON array of objects, where each object represents a single activity and has the fields "day" (e.g., "Tuesday, May 6", "Wednesday, May 7"), "time" (e.g., "9:00 AM"), "activity" (description), and "location" (specific address or landmark name). Do not include any introductory text, explanations, or summaries outside the JSON array. Ensure each day has multiple activities covering morning, afternoon, and evening where appropriate. Each day should have at least 4 activities.`;
  
  let userPrompt = `Create a detailed ${chunkEndDate.getDate() - chunkStartDate.getDate() + 1}-day itinerary for ${destination} from ${chunkStartDateStr} to ${chunkEndDateStr}. 
                This is part ${Math.floor(chunkStart / MAX_DAYS_PER_CHUNK) + 1} of a ${Math.ceil(totalDays / MAX_DAYS_PER_CHUNK)}-part ${totalDays}-day trip.
                For each day, include 4-5 activities (morning, lunch, afternoon, dinner/evening) with specific locations (addresses if possible) and suggested times.
                For the "day" field in each JSON object, use the actual date and day of the week (e.g., "Tuesday, May 6").
                The traveler has these preferences: ${preferences.join(', ')}.`;

  // Add advanced preferences to the prompt if they exist
  if (advancedPreferences && advancedPreferences.length > 0) {
    userPrompt += `\n\nAdditional traveler preferences:\n- ${advancedPreferences.join('\n- ')}`;
  }
  
  // Add custom instructions if provided
  if (customInstructions && customInstructions.trim().length > 0) {
    userPrompt += `\n\nSpecific traveler instructions: "${customInstructions}"`;
  }

  // Add special note for Orlando
  if (destination.toLowerCase().includes('orlando')) {
    userPrompt += "\n\nNOTE: For Orlando, be sure to include world-famous theme parks like Universal Studios and Walt Disney World in the itinerary, unless the user specifically asks to avoid them.";
  }

  const mustSeeAttractions = {
    "orlando": [
      "Universal Studios Florida",
      "Walt Disney World Resort",
      "SeaWorld Orlando"
    ],
    "anaheim": [
      "Disneyland Park"
    ],
    "paris": [
      "Disneyland Paris"
    ],
    // Add more cities as needed
  };

  const city = destination.toLowerCase();
  if (mustSeeAttractions[city]) {
    userPrompt += `\n\nFor ${destination}, always include these must-see attractions: ${mustSeeAttractions[city].join(', ')}.`;
  }

  // Add must-see attractions for certain cities
  const cityKey = Object.keys(mustSeeAttractions).find(city =>
    destination.toLowerCase().includes(city)
  );
  if (cityKey) {
    userPrompt += `\n\nFor ${destination}, always include these must-see attractions: ${mustSeeAttractions[cityKey].join(', ')}.`;
  }
  
  userPrompt += `\n\nIMPORTANT: Format your ENTIRE response strictly as a JSON array of objects with "day", "activity", "location", and "time" fields. No extra text.`;

  const messagesForOpenAI = [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: userPrompt
    }
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
        temperature: 0.7,
        max_tokens: 3000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const responseData = await response.json();
    const responseText = responseData.choices[0].message.content;
    
    // Parse the JSON response
    let chunkItinerary;
    try {
      chunkItinerary = JSON.parse(responseText);
      if (!Array.isArray(chunkItinerary)) {
        throw new Error("Response is not an array.");
      }
    } catch (parseError) {
      console.warn(`Direct JSON parsing failed:`, parseError.message);
      console.log("Attempting to extract JSON array from text...");
      const jsonMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (jsonMatch && jsonMatch[0]) {
        try {
          chunkItinerary = JSON.parse(jsonMatch[0]);
          if (!Array.isArray(chunkItinerary)) {
            throw new Error("Extracted JSON is not an array.");
          }
        } catch (regexParseError) {
          console.error("Failed to parse extracted JSON array:", regexParseError);
          chunkItinerary = [];
        }
      } else {
        console.error("Could not find a valid JSON array structure in the response.");
        chunkItinerary = [];
      }
    }
    
    // Make sure the required fields are present
    return chunkItinerary.map(item => ({
      day: item.day || `Date missing`,
      activity: item.activity || "No activity specified",
      location: item.location || destination,
      time: item.time || "Time N/A"
    }));
  } catch (error) {
    console.error("Error generating itinerary chunk:", error);
    throw error;
  }
}

/**
 * Attempt to fill in any missing days in the itinerary
 */
async function fillMissingDays(existingItinerary, destination, preferences, startDate, endDate) {
  // Identify which days are missing
  const existingDays = new Set();
  existingItinerary.forEach(item => {
    const day = item.day.split(',')[1].trim();
    existingDays.add(day);
  });
  
  const missingDays = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const day = currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    if (!existingDays.has(day)) {
      missingDays.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Generate activities for each missing day
  let updatedItinerary = [...existingItinerary];
  
  for (const missingDate of missingDays) {
    console.log(`Generating activities for missing day: ${missingDate.toLocaleDateString()}`);
    
    const endOfDay = new Date(missingDate);
    
    try {
      const dayActivities = await generateItineraryChunk(
        destination,
        preferences,
        missingDate,
        endOfDay,
        0,
        1
      );
      
      updatedItinerary = [...updatedItinerary, ...dayActivities];
    } catch (error) {
      console.error(`Failed to generate activities for ${missingDate.toLocaleDateString()}:`, error);
    }
    
    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return updatedItinerary;
}

// Remove activities with the same name appearing on multiple days
function removeDuplicateActivities(itinerary) {
  const seen = new Set();
  return itinerary.filter(item => {
    const key = item.activity ? item.activity.toLowerCase() : '';
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    console.error("Failed to start server:", err.message);
});