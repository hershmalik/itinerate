import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

const PORT = process.env.PORT || 9876;

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
    
    const API_KEY = process.env.WEATHER_API_KEY || 'abd222e02532f30bf10623599a48fba5';
    
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
    
    const API_KEY = 'AIzaSyDsiIuDg6F3hT2Oj871DQYzH7RMXhJ5JKg';
    
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
        const departureDateStr = req.query.departureDate; 
        const arrivalDateStr = req.query.arrivalDate;

        if (!departureDateStr || !arrivalDateStr) {
            return res.status(400).json({ error: 'Missing departure or arrival date' });
        }

        let numberOfDays = 3;
        let startDate, endDate;
        try {
            startDate = new Date(departureDateStr);
            endDate = new Date(arrivalDateStr);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                 throw new Error("Invalid date format received.");
            }
            if (endDate < startDate) {
                throw new Error("Arrival date cannot be before departure date.");
            }
            const timeDiff = endDate.getTime() - startDate.getTime();
            numberOfDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; 
            if (numberOfDays <= 0) numberOfDays = 1;

        } catch (dateError) {
             console.error("Error calculating trip duration:", dateError.message);
        }

        console.log('--- New Itinerary Request ---');
        console.log(`Destination: ${destination}`);
        console.log(`Preferences: ${preferences.join(', ')}`);
        console.log(`Departure Date: ${departureDateStr}`);
        console.log(`Arrival Date: ${arrivalDateStr}`);
        console.log(`Calculated Number of Days: ${numberOfDays}`);
        
        // NEW: Break longer trips into chunks of maximum 7 days each
        const MAX_DAYS_PER_CHUNK = 7;
        let completeItinerary = [];
        
        for (let chunkStart = 0; chunkStart < numberOfDays; chunkStart += MAX_DAYS_PER_CHUNK) {
            // Calculate days for this chunk
            const daysInThisChunk = Math.min(MAX_DAYS_PER_CHUNK, numberOfDays - chunkStart);
            
            // Calculate date range for this chunk
            const chunkStartDate = new Date(startDate);
            chunkStartDate.setDate(startDate.getDate() + chunkStart);
            
            const chunkEndDate = new Date(chunkStartDate);
            chunkEndDate.setDate(chunkStartDate.getDate() + daysInThisChunk - 1);
            
            // Format dates for the message
            const chunkStartDateStr = chunkStartDate.toISOString().split('T')[0];
            const chunkEndDateStr = chunkEndDate.toISOString().split('T')[0];
            
            console.log(`Generating chunk ${chunkStart / MAX_DAYS_PER_CHUNK + 1}: ${daysInThisChunk} days from ${chunkStartDateStr} to ${chunkEndDateStr}`);
            
            const messagesForOpenAI = [
                {
                    role: "system",
                    content: `You are a helpful travel assistant that creates detailed itineraries. Always respond with properly formatted JSON. The response MUST be a JSON array of objects, where each object represents a single activity and has the fields "day" (e.g., "Tuesday, May 6", "Wednesday, May 7"), "time" (e.g., "9:00 AM"), "activity" (description), and "location" (specific address or landmark name). Do not include any introductory text, explanations, or summaries outside the JSON array. Ensure each day has multiple activities covering morning, afternoon, and evening where appropriate.`
                },
                {
                    role: "user",
                    content: `Create a detailed ${daysInThisChunk}-day itinerary for ${destination} from ${chunkStartDateStr} to ${chunkEndDateStr}. 
                              This is part ${chunkStart / MAX_DAYS_PER_CHUNK + 1} of a ${Math.ceil(numberOfDays / MAX_DAYS_PER_CHUNK)}-part ${numberOfDays}-day trip.
                              For each day, include multiple activities (morning, afternoon, evening) with specific locations (addresses if possible) and suggested times.
                              For the "day" field in each JSON object, use the actual date and day of the week (e.g., "Tuesday, May 6").
                              The traveler has these preferences: ${preferences.join(', ')}.
                              IMPORTANT: Format your ENTIRE response strictly as a JSON array of objects with "day", "activity", "location", and "time" fields. No extra text.`
                }
            ];

            console.log('--- Sending chunk to OpenAI ---');
            console.log('Days in chunk:', daysInThisChunk);

            const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: messagesForOpenAI
                })
            });
            
            if (!openAIResponse.ok) {
                const errorText = await openAIResponse.text();
                console.error("OpenAI API error status:", openAIResponse.status);
                console.error("OpenAI API error response:", errorText);
                let errorMessage = `OpenAI API error: ${openAIResponse.status}`;
                try {
                     const errorData = JSON.parse(errorText);
                     errorMessage = `OpenAI API error: ${errorData.error?.message || openAIResponse.status}`;
                } catch(e) { }
                throw new Error(errorMessage);
            }
            
            const openAIData = await openAIResponse.json();
            
            const responseText = openAIData.choices[0].message.content.trim();
            console.log(`--- OpenAI Raw Response for chunk ${chunkStart / MAX_DAYS_PER_CHUNK + 1} ---`);
            console.log("Content length:", responseText.length);
            
            let chunkItinerary = [];
            try {
                chunkItinerary = JSON.parse(responseText);
                
                if (!Array.isArray(chunkItinerary)) {
                     console.warn("Parsed response is not an array, attempting extraction...");
                     throw new Error("Parsed response is not an array.");
                }
                
                console.log("Successfully parsed itinerary chunk directly.");

            } catch (parseError) {
                console.warn("Direct JSON parsing failed:", parseError.message);
                console.log("Attempting to extract JSON array from text...");
                const jsonMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
                if (jsonMatch && jsonMatch[0]) {
                    try {
                        chunkItinerary = JSON.parse(jsonMatch[0]);
                        if (!Array.isArray(chunkItinerary)) {
                             throw new Error("Extracted JSON is not an array.");
                        }
                        console.log("Successfully extracted and parsed JSON array via regex.");
                    } catch (regexParseError) {
                        console.error("Failed to parse extracted JSON array:", regexParseError);
                        chunkItinerary = [];
                    }
                } else {
                     console.error("Could not find a valid JSON array structure in the response.");
                     chunkItinerary = [];
                }
            }

            // Process and validate the itinerary items
            chunkItinerary = chunkItinerary.map(item => ({
                day: item.day || `Date missing`,
                activity: item.activity || "No activity specified",
                location: item.location || destination,
                time: item.time || "Time N/A"
            }));
            
            console.log(`Chunk ${chunkStart / MAX_DAYS_PER_CHUNK + 1} contained ${chunkItinerary.length} activities`);
            
            // Add this chunk to the complete itinerary
            completeItinerary = [...completeItinerary, ...chunkItinerary];
            
            // Brief delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }
            
        console.log("--- Final Complete Itinerary ---");
        console.log("Total activities:", completeItinerary.length);
        console.log("Days covered:", new Set(completeItinerary.map(item => item.day)).size);
        
        res.json({
            destination: destination,
            preferences: preferences,
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
  res.sendFile(path.join(__dirname, '../src/index.html'));
});

app.get('/second-page', (req, res) => {
  res.sendFile(path.join(__dirname, '../src/second-page.html'));
});

// --------- CATCH-ALL ROUTE LAST ---------
app.get('*', (req, res) => {
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../src/index.html'));
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

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    console.error("Failed to start server:", err.message);
});