import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log("Loaded OpenAI API Key:", process.env.OPENAI_API_KEY ? "Exists" : "Missing");
console.log("Loaded Google Maps API Key:", process.env.GOOGLE_MAPS_API_KEY ? "Exists" : "Missing");

// ---- Supabase service client (admin operations) ----
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

// ---- Supabase anon client (JWT verification) ----
const supabaseAnon = (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;

// Auth middleware — verifies Supabase JWT, attaches req.userId
async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    if (!supabaseAnon) return res.status(503).json({ error: 'Auth not configured' });
    try {
        const { data, error } = await supabaseAnon.auth.getUser(token);
        if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' });
        req.userId = data.user.id;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}


// Middleware — checks owner OR accepted collaborator, attaches req.tripRole
async function requireTripAccess(req, res, next) {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const tripId = req.params.id;
    const { data: trip } = await supabase.from('trips').select('id, user_id').eq('id', tripId).single();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.user_id === req.userId) { req.tripRole = 'owner'; return next(); }
    const { data: collab } = await supabase.from('trip_collaborators')
        .select('role, accepted_at').eq('trip_id', tripId).eq('user_id', req.userId).single();
    if (collab?.accepted_at) { req.tripRole = collab.role; return next(); }
    return res.status(403).json({ error: 'Access denied' });
}

if (!process.env.OPENAI_API_KEY) {
    console.error("OpenAI API key is missing. Please check your .env file.");
    process.exit(1);
}

// Add missing constant
const MAX_DAYS_PER_CHUNK = 5;

const PORT = process.env.PORT || 10000; // Use standard port 3000, let hosting platform handle it

const app = express();

// --------- MIDDLEWARE SETUP ---------
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '5mb' }));
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

// Public config endpoint — returns non-secret client-side keys
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    });
});

app.get('/api/weather', async (req, res) => {
  const { location } = req.query;
  if (!location) return res.status(400).json({ error: 'Location required' });

  const fallback = {
    current: { temp: 72, description: 'partly cloudy', icon: '02d', humidity: 65, windSpeed: 8 },
    forecast: [
      { date: new Date().toISOString().split('T')[0], high: 75, low: 58, description: 'sunny', icon: '01d' },
      { date: new Date(Date.now()+86400000).toISOString().split('T')[0], high: 73, low: 60, description: 'cloudy', icon: '03d' },
      { date: new Date(Date.now()+172800000).toISOString().split('T')[0], high: 71, low: 55, description: 'light rain', icon: '10d' },
      { date: new Date(Date.now()+259200000).toISOString().split('T')[0], high: 74, low: 59, description: 'sunny', icon: '01d' },
      { date: new Date(Date.now()+345600000).toISOString().split('T')[0], high: 76, low: 61, description: 'partly cloudy', icon: '02d' }
    ]
  };

  const API_KEY = process.env.WEATHER_API_KEY;
  if (!API_KEY) return res.json({ ...fallback, source: 'mock' });

  try {
    // Geocode first (OWM Geocoding API)
    const geoResp = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${API_KEY}`
    );
    const geoData = await geoResp.json();
    if (!geoData.length) return res.json({ ...fallback, source: 'mock' });

    const { lat, lon } = geoData[0];
    const fcResp = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=imperial&cnt=40`
    );
    const fcData = await fcResp.json();
    if (fcData.cod !== '200') return res.json({ ...fallback, source: 'mock' });

    const daily = processDailyForecasts(fcData.list);
    res.json({
      source: 'live',
      current: {
        temp: Math.round(daily[0]?.high || 72),
        description: daily[0]?.description || 'clear sky',
        icon: daily[0]?.icon || '01d',
        humidity: fcData.list[0]?.main?.humidity || 65,
        windSpeed: Math.round((fcData.list[0]?.wind?.speed || 8) * 10) / 10
      },
      forecast: daily
    });
  } catch (err) {
    console.error('Weather API error:', err.message);
    res.json({ ...fallback, source: 'mock' });
  }
});

app.get('/api/place-details', async (req, res) => {
  const { name, location } = req.query;
  if (!name || !location) return res.status(400).json({ error: 'Name and location parameters are required' });

  const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Google Places API key not configured' });

  try {
    const query = `${name} ${location}`;
    const searchResp = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address&key=${API_KEY}`
    );
    const searchData = await searchResp.json();
    if (!searchData.candidates?.length) return res.json({ found: false });

    const candidate = searchData.candidates[0];
    const detailsResp = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${candidate.place_id}&fields=rating,user_ratings_total,price_level,url&key=${API_KEY}`
    );
    const detailsData = await detailsResp.json();
    const p = detailsData.result || {};
    res.json({
      found: true,
      name: candidate.name || name,
      address: candidate.formatted_address || location,
      rating: p.rating || null,
      totalRatings: p.user_ratings_total || 0,
      priceLevel: p.price_level != null ? p.price_level : null,
      url: p.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + location)}`
    });
  } catch (error) {
    console.error('Place Details API Error:', error);
    res.status(500).json({ error: 'Failed to fetch place details', message: error.message });
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

// generateFullItinerary: all chunks run in parallel - no sequential delays
async function generateFullItinerary(destination, preferences, startDate, endDate, advancedPreferences = [], customInstructions = "", tripStyle = "balanced", multiCity = false, additionalCities = []) {
  const timeDiff = endDate.getTime() - startDate.getTime();
  const numberOfDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

  console.log(`Generating itinerary for ${destination}: ${numberOfDays} days, style: ${tripStyle}`);

  const styleConfig = {
    relaxed: { min: 2, max: 3 },
    balanced: { min: 4, max: 6 },
    packed: { min: 6, max: 8 }
  }[tripStyle] || { min: 4, max: 6 };

  // Build chunk params
  const chunkParams = [];
  for (let chunkStart = 0; chunkStart < numberOfDays; chunkStart += MAX_DAYS_PER_CHUNK) {
    const daysInThisChunk = Math.min(MAX_DAYS_PER_CHUNK, numberOfDays - chunkStart);
    const chunkStartDate = new Date(startDate);
    chunkStartDate.setDate(startDate.getDate() + chunkStart);
    const chunkEndDate = new Date(chunkStartDate);
    chunkEndDate.setDate(chunkStartDate.getDate() + daysInThisChunk - 1);
    chunkParams.push({ chunkStart, chunkStartDate, chunkEndDate });
  }

  console.log(`Processing ${chunkParams.length} chunk(s) in parallel`);

  // All chunks fire simultaneously
  const chunkResults = await Promise.all(
    chunkParams.map(({ chunkStart, chunkStartDate, chunkEndDate }) =>
      generateItineraryChunk(
        destination, preferences, chunkStartDate, chunkEndDate,
        chunkStart, numberOfDays, advancedPreferences, customInstructions,
        tripStyle, multiCity, additionalCities
      ).catch(err => {
        console.error(`Chunk starting day ${chunkStart} failed:`, err);
        return generateFallbackItinerary(chunkStartDate, chunkEndDate, destination, styleConfig);
      })
    )
  );

  let completeItinerary = chunkResults.flat();

  const daysInCompleteItinerary = new Set(
    completeItinerary.map(item => {
      const parts = item.day?.split(',');
      return parts && parts.length > 1 ? parts[1].trim() : item.day;
    })
  ).size;

  console.log(`Generated ${completeItinerary.length} activities covering ${daysInCompleteItinerary} days`);

  if (daysInCompleteItinerary < numberOfDays) {
    console.log(`Filling ${numberOfDays - daysInCompleteItinerary} missing day(s)...`);
    completeItinerary = await fillMissingDays(completeItinerary, destination, preferences, startDate, endDate, tripStyle);
  }

  return removeDuplicateActivities(completeItinerary);
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
    if (!item || !item.activity || !item.day || !item.time || !item.location) return; // filter blanks
    // Use day, time, activity, and location for uniqueness
    const dayKey = (typeof item.day === 'string') ? item.day.toLowerCase().trim() : '';
    const timeKey = (typeof item.time === 'string') ? item.time.toLowerCase().trim() : '';
    const activityKey = (typeof item.activity === 'string') ? item.activity.toLowerCase().trim() : '';
    const locationKey = (typeof item.location === 'string') ? item.location.toLowerCase().trim() : '';
    const key = `${dayKey}-${timeKey}-${activityKey}-${locationKey}`;
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

// --------- GOOGLE FLIGHTS DEEP LINK ---------
app.get('/api/flights', (req, res) => {
    const { origin, destination } = req.query;
    if (!origin || !destination) return res.json({ available: false });
    const googleFlightsUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination}`)}`;
    res.json({ available: true, googleFlightsUrl, origin, destination });
});

// --------- GOOGLE PLACES RATINGS (replaces Yelp) ---------
app.get('/api/yelp', async (req, res) => {
    const { term, location } = req.query;
    const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!API_KEY) return res.json({ available: false });
    try {
        const query = `${term} ${location}`;
        const searchResp = await fetch(
            `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${API_KEY}`
        );
        const searchData = await searchResp.json();
        if (!searchData.candidates?.length) return res.json({ available: false });

        const placeId = searchData.candidates[0].place_id;
        const detailsResp = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,price_level,url&key=${API_KEY}`
        );
        const detailsData = await detailsResp.json();
        const p = detailsData.result;
        if (!p?.rating) return res.json({ available: false });

        res.json({
            available: true,
            rating: p.rating,
            reviewCount: p.user_ratings_total,
            price: p.price_level != null ? '$'.repeat(p.price_level + 1) : null,
            url: p.url
        });
    } catch (err) {
        console.error('Places ratings error:', err.message);
        res.json({ available: false });
    }
});

// --------- SAVED TRIPS ---------
app.post('/api/trips', requireAuth, express.json(), async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { itinerary, destination, departureDate, arrivalDate, preferences, tripStyle, name } = req.body;
    const { data, error } = await supabase.from('trips').insert({
        user_id: req.userId,
        name: name || destination,
        destination, departure_date: departureDate, arrival_date: arrivalDate,
        preferences, trip_style: tripStyle, itinerary
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/trips', requireAuth, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { data, error } = await supabase.from('trips')
        .select('id, name, destination, departure_date, arrival_date, trip_style, created_at')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/trips/:id', requireAuth, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { data, error } = await supabase.from('trips')
        .select('*').eq('id', req.params.id).eq('user_id', req.userId).single();
    if (error) return res.status(404).json({ error: 'Trip not found' });
    res.json(data);
});

app.delete('/api/trips/:id', requireAuth, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { error } = await supabase.from('trips')
        .delete().eq('id', req.params.id).eq('user_id', req.userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// PUT /api/trips/:id — update itinerary (owner or accepted editor)
app.put('/api/trips/:id', requireAuth, requireTripAccess, async (req, res) => {
    const { itinerary, name, destination, departureDate, arrivalDate, preferences, tripStyle } = req.body;
    const payload = { itinerary, updated_at: new Date().toISOString() };
    if (req.tripRole === 'owner') Object.assign(payload, {
        name, destination, departure_date: departureDate,
        arrival_date: arrivalDate, preferences, trip_style: tripStyle
    });
    const { data, error } = await supabase.from('trips').update(payload)
        .eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// GET /api/trips/:id/access — returns role + full trip for owner or accepted collaborator
app.get('/api/trips/:id/access', requireAuth, requireTripAccess, async (req, res) => {
    const { data: trip, error } = await supabase.from('trips').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Trip not found' });
    res.json({ role: req.tripRole, trip });
});

// POST /api/trips/:id/invite — create a collaborator invite link (owner only)
app.post('/api/trips/:id/invite', requireAuth, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { data: trip } = await supabase.from('trips').select('id').eq('id', req.params.id).eq('user_id', req.userId).single();
    if (!trip) return res.status(403).json({ error: 'Not your trip' });
    const token = crypto.randomBytes(24).toString('hex');
    const { data, error } = await supabase.from('trip_collaborators').insert({
        trip_id: req.params.id, invite_token: token,
        invited_email: req.body.invited_email || null, role: 'editor'
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    const inviteUrl = `${req.protocol}://${req.get('host')}/second-page.html?invite=${token}&trip=${req.params.id}`;
    res.json({ inviteUrl, collaboratorId: data.id });
});

// POST /api/trips/:id/accept — claim invite token and become a collaborator
app.post('/api/trips/:id/accept', requireAuth, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const { data: collab, error } = await supabase.from('trip_collaborators')
        .select('*').eq('trip_id', req.params.id).eq('invite_token', token).is('accepted_at', null).single();
    if (error || !collab) return res.status(404).json({ error: 'Invalid or already used invite' });
    const { data: trip } = await supabase.from('trips').select('user_id').eq('id', req.params.id).single();
    if (trip?.user_id === req.userId) return res.status(400).json({ error: 'You are already the owner' });
    // Check if this user already accepted a different token for this trip
    const { data: existing } = await supabase.from('trip_collaborators')
        .select('id').eq('trip_id', req.params.id).eq('user_id', req.userId).not('accepted_at', 'is', null).single();
    if (existing) return res.json({ success: true, tripId: req.params.id, role: collab.role, alreadyMember: true });
    const { error: updateErr } = await supabase.from('trip_collaborators')
        .update({ user_id: req.userId, accepted_at: new Date().toISOString() }).eq('id', collab.id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });
    res.json({ success: true, tripId: req.params.id, role: collab.role });
});

// GET /api/trips/:id/collaborators — list collaborators (owner only)
app.get('/api/trips/:id/collaborators', requireAuth, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { data: trip } = await supabase.from('trips').select('user_id').eq('id', req.params.id).single();
    if (!trip || trip.user_id !== req.userId) return res.status(403).json({ error: 'Not your trip' });
    const { data, error } = await supabase.from('trip_collaborators')
        .select('id, user_id, invited_email, role, accepted_at, created_at')
        .eq('trip_id', req.params.id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// DELETE /api/trips/:id/collaborators/:collabId — remove a collaborator (owner only)
app.delete('/api/trips/:id/collaborators/:collabId', requireAuth, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { data: trip } = await supabase.from('trips').select('user_id').eq('id', req.params.id).single();
    if (!trip || trip.user_id !== req.userId) return res.status(403).json({ error: 'Not your trip' });
    const { error } = await supabase.from('trip_collaborators').delete().eq('id', req.params.collabId).eq('trip_id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// --------- IN-MEMORY SHARE STORE ---------
const sharedItineraries = new Map();

// --------- SSE STREAMING ENDPOINT ---------
// Sends each 5-day chunk to the client as soon as it's ready
app.get('/generate-itinerary-stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (type, data) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
        const destination = req.query.destination || 'Unknown';
        const preferences = req.query.preferences ? JSON.parse(req.query.preferences) : [];
        const advancedPreferences = req.query.advancedPreferences ? JSON.parse(req.query.advancedPreferences) : [];
        const customInstructions = req.query.customInstructions || '';
        const tripStyle = req.query.tripStyle || 'balanced';
        const multiCity = req.query.multiCity === 'true';
        const additionalCities = req.query.additionalCities ? JSON.parse(req.query.additionalCities) : [];
        const startDate = new Date(req.query.departureDate);
        const endDate = new Date(req.query.arrivalDate);
        const numberOfDays = Math.ceil((endDate - startDate) / (1000 * 3600 * 24)) + 1;

        const styleConfig = {
            relaxed: { min: 2, max: 3 },
            balanced: { min: 4, max: 6 },
            packed: { min: 6, max: 8 }
        }[tripStyle] || { min: 4, max: 6 };

        const chunkParams = [];
        for (let chunkStart = 0; chunkStart < numberOfDays; chunkStart += MAX_DAYS_PER_CHUNK) {
            const daysInThisChunk = Math.min(MAX_DAYS_PER_CHUNK, numberOfDays - chunkStart);
            const chunkStartDate = new Date(startDate);
            chunkStartDate.setDate(startDate.getDate() + chunkStart);
            const chunkEndDate = new Date(chunkStartDate);
            chunkEndDate.setDate(chunkStartDate.getDate() + daysInThisChunk - 1);
            chunkParams.push({ chunkStart, chunkStartDate, chunkEndDate });
        }

        send('status', { message: 'Building your itinerary...', totalChunks: chunkParams.length });

        const allActivities = [];

        // Each chunk streams to client as soon as it completes
        await Promise.all(
            chunkParams.map(async ({ chunkStart, chunkStartDate, chunkEndDate }, idx) => {
                try {
                    const chunk = await generateItineraryChunk(
                        destination, preferences, chunkStartDate, chunkEndDate,
                        chunkStart, numberOfDays, advancedPreferences, customInstructions,
                        tripStyle, multiCity, additionalCities
                    );
                    allActivities.push(...chunk);
                    send('chunk', { activities: chunk, chunkIndex: idx, totalChunks: chunkParams.length });
                } catch (err) {
                    const fallback = generateFallbackItinerary(chunkStartDate, chunkEndDate, destination, styleConfig);
                    allActivities.push(...fallback);
                    send('chunk', { activities: fallback, chunkIndex: idx, totalChunks: chunkParams.length });
                }
            })
        );

        const finalItinerary = removeDuplicateActivities(allActivities);
        send('complete', { destination, itinerary: finalItinerary, preferences, tripStyle });
    } catch (err) {
        send('error', { message: err.message });
    }
    res.end();
});

// --------- SHARE ENDPOINTS (Supabase-backed when available, in-memory fallback) ---------
app.post('/api/share', async (req, res) => {
    const { itinerary, destination, departureDate, arrivalDate, preferences, tripStyle } = req.body;
    const shareId = Math.random().toString(36).substring(2, 10);
    const payload = { itinerary, destination, departureDate, arrivalDate, preferences, tripStyle };

    if (supabase) {
        try { await supabase.from('shared_itineraries').insert({ share_id: shareId, ...payload }); } catch {}
    }
    sharedItineraries.set(shareId, payload); // always keep in-memory as fallback

    const shareUrl = `${req.protocol}://${req.get('host')}/second-page.html?share=${shareId}`;
    res.json({ shareId, shareUrl });
});

app.get('/api/share/:id', async (req, res) => {
    // Try Supabase first (survives server restarts), fall back to in-memory
    if (supabase) {
        let data = null;
        try {
            const result = await supabase.from('shared_itineraries').select('*').eq('share_id', req.params.id).single();
            data = result?.data || null;
        } catch {}
        if (data) return res.json(data);
    }
    const data = sharedItineraries.get(req.params.id);
    if (!data) return res.status(404).json({ error: 'Shared itinerary not found or expired' });
    res.json(data);
});


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
    html = html.replace(/__GOOGLE_MAPS_API_KEY__/g, process.env.GOOGLE_MAPS_API_KEY || '');
    html = html.replace(/__SUPABASE_URL__/g, process.env.SUPABASE_URL || '');
    html = html.replace(/__SUPABASE_ANON_KEY__/g, process.env.SUPABASE_ANON_KEY || '');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(html);
});

// PWA files
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.join(__dirname, '../src/manifest.json'));
});
app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, '../src/service-worker.js'));
});

// Serve the main page
app.get('/', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    html = html.replace(/__GOOGLE_MAPS_API_KEY__/g, process.env.GOOGLE_MAPS_API_KEY || '');
    html = html.replace(/__SUPABASE_URL__/g, process.env.SUPABASE_URL || '');
    html = html.replace(/__SUPABASE_ANON_KEY__/g, process.env.SUPABASE_ANON_KEY || '');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(html);
});

// Handle second-page.html specifically
app.get('/second-page.html', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, '../src/second-page.html'), 'utf8');
    html = html.replace(/__GOOGLE_MAPS_API_KEY__/g, process.env.GOOGLE_MAPS_API_KEY || '');
    html = html.replace(/__SUPABASE_URL__/g, process.env.SUPABASE_URL || '');
    html = html.replace(/__SUPABASE_ANON_KEY__/g, process.env.SUPABASE_ANON_KEY || '');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
        html = html.replace(/__GOOGLE_MAPS_API_KEY__/g, process.env.GOOGLE_MAPS_API_KEY || '');
        html = html.replace(/__SUPABASE_URL__/g, process.env.SUPABASE_URL || '');
        html = html.replace(/__SUPABASE_ANON_KEY__/g, process.env.SUPABASE_ANON_KEY || '');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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


// === PACKING LIST ENDPOINT ===
app.post('/api/packing-list', async (req, res) => {
    try {
        const { destination, departureDate, arrivalDate, activities, tripStyle } = req.body;
        const days = activities ? Math.max(...[...new Set(activities.map(a => a.day))].map((_, i) => i + 1), 1) : 7;
        const activityTypes = [...new Set((activities || []).map(a => a.activity?.toLowerCase()))].slice(0, 20).join(', ');

        const prompt = `Create a packing list for a ${days}-day ${tripStyle || 'balanced'} trip to ${destination}.
Key activities: ${activityTypes || 'sightseeing, dining, exploring'}.
Dates: ${departureDate || 'upcoming'} to ${arrivalDate || ''}.
Return ONLY a JSON object with this structure:
{
  "categories": [
    { "name": "Clothing", "emoji": "👕", "items": ["item1", "item2"] },
    { "name": "Documents & Money", "emoji": "📄", "items": [...] },
    { "name": "Electronics", "emoji": "💻", "items": [...] },
    { "name": "Toiletries", "emoji": "🧴", "items": [...] },
    { "name": "Health & Safety", "emoji": "💊", "items": [...] },
    { "name": "Destination Essentials", "emoji": "🗺️", "items": [...] }
  ]
}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [
                { role: 'system', content: 'You are a professional travel packing expert.' },
                { role: 'user', content: prompt }
            ], temperature: 0.7, max_tokens: 1000 })
        });
        if (!response.ok) throw new Error('OpenAI error');
        const data = await response.json();
        let raw = data.choices[0].message.content.replace(/```json/g,'').replace(/```/g,'').trim();
        let result;
        try { result = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); result = m ? JSON.parse(m[0]) : { categories: [] }; }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === NEIGHBORHOODS ENDPOINT ===
app.post('/api/neighborhoods', async (req, res) => {
    try {
        const { destination, activities } = req.body;
        const activityLocations = [...new Set((activities || []).map(a => a.location).filter(Boolean))].slice(0, 15).join(', ');

        const prompt = `Recommend 3 great neighborhoods or areas to stay in ${destination} for a traveler with these planned activities and locations: ${activityLocations || 'general sightseeing'}.
For each neighborhood, provide:
- name: neighborhood name
- vibe: 1 short sentence on the vibe/character
- bestFor: what type of traveler or activity it suits
- priceRange: budget / mid-range / upscale
- tip: 1 practical insider tip

Return ONLY a JSON array of 3 objects with fields: name, vibe, bestFor, priceRange, tip`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [
                { role: 'system', content: 'You are an expert local travel guide.' },
                { role: 'user', content: prompt }
            ], temperature: 0.7, max_tokens: 800 })
        });
        if (!response.ok) throw new Error('OpenAI error');
        const data = await response.json();
        let raw = data.choices[0].message.content.replace(/```json/g,'').replace(/```/g,'').trim();
        let neighborhoods;
        try { neighborhoods = JSON.parse(raw); } catch { const m = raw.match(/\[[\s\S]*\]/); neighborhoods = m ? JSON.parse(m[0]) : []; }
        res.json({ neighborhoods: Array.isArray(neighborhoods) ? neighborhoods : [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
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