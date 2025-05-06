import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
 
console.log("Loaded OpenAI API Key:", process.env.OPENAI_API_KEY ? "Exists" : "Missing");

if (!process.env.OPENAI_API_KEY) {
    console.error("OpenAI API key is missing. Please check your .env file.");
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../src')));
// This allows serving files from project root

// Uncomment this line:
app.use('/src', express.static(path.join(__dirname, '../src')));

const PORT = process.env.PORT || 9876;

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!' });
}); 

// Itinerary generation endpoint
app.get('/generate-itinerary', async (req, res) => {
    try {
        const destination = req.query.destination || "Unknown";
        const preferences = req.query.preferences ? JSON.parse(req.query.preferences) : [];
        const departureDateStr = req.query.departureDate; 
        const arrivalDateStr = req.query.arrivalDate;

        // Validate dates
        if (!departureDateStr || !arrivalDateStr) {
            return res.status(400).json({ error: 'Missing departure or arrival date' });
        }

        // Calculate number of days
        let numberOfDays = 3; // Default to 3 days if calculation fails
        try {
            const startDate = new Date(departureDateStr);
            const endDate = new Date(arrivalDateStr);
            // Ensure dates are valid
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                 throw new Error("Invalid date format received.");
            }
            if (endDate < startDate) {
                throw new Error("Arrival date cannot be before departure date.");
            }
            const timeDiff = endDate.getTime() - startDate.getTime();
            // Calculate days (inclusive of start and end day)
            numberOfDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; 
            // Add a sanity check for maximum days if needed
            if (numberOfDays <= 0) numberOfDays = 1; // Ensure at least 1 day

        } catch (dateError) {
             console.error("Error calculating trip duration:", dateError.message);
        }

        console.log('--- New Itinerary Request ---');
        console.log(`Destination: ${destination}`);
        console.log(`Preferences: ${preferences.join(', ')}`);
        console.log(`Departure Date: ${departureDateStr}`);
        console.log(`Arrival Date: ${arrivalDateStr}`);
        console.log(`Calculated Number of Days: ${numberOfDays}`);
        
        const messagesForOpenAI = [
            {
                role: "system",
                content: `You are a helpful travel assistant that creates detailed itineraries. Always respond with properly formatted JSON. The response MUST be a JSON array of objects, where each object represents a single activity and has the fields "day" (e.g., "Tuesday, May 6", "Wednesday, May 7"), "time" (e.g., "9:00 AM"), "activity" (description), and "location" (specific address or landmark name). Do not include any introductory text, explanations, or summaries outside the JSON array. Ensure each day has multiple activities covering morning, afternoon, and evening where appropriate.`
            },
            {
                role: "user",
                content: `Create a detailed ${numberOfDays}-day itinerary for ${destination} from ${departureDateStr} to ${arrivalDateStr}. 
                          For each day, include multiple activities (morning, afternoon, evening) with specific locations (addresses if possible) and suggested times.
                          For the "day" field in each JSON object, use the actual date and day of the week (e.g., "Tuesday, May 6").
                          The traveler has these preferences: ${preferences.join(', ')}.
                          IMPORTANT: Format your ENTIRE response strictly as a JSON array of objects with "day", "activity", "location", and "time" fields. No extra text.`
            }
        ];

        console.log('--- Sending to OpenAI ---');
        console.log('Messages:', JSON.stringify(messagesForOpenAI, null, 2)); // Log the messages array

        // Call OpenAI API
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo", // Or a newer model like gpt-4-turbo
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
        console.log("--- OpenAI Raw Response ---");
        console.log("Content:", responseText);
        
        let itinerary = [];
        try {
            itinerary = JSON.parse(responseText);
            
            if (!Array.isArray(itinerary)) {
                 console.warn("Parsed response is not an array, attempting extraction...");
                 throw new Error("Parsed response is not an array.");
            }
            
            console.log("Successfully parsed itinerary directly.");

        } catch (parseError) {
            console.warn("Direct JSON parsing failed:", parseError.message);
            console.log("Attempting to extract JSON array from text...");
            const jsonMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
            if (jsonMatch && jsonMatch[0]) {
                try {
                    itinerary = JSON.parse(jsonMatch[0]);
                    if (!Array.isArray(itinerary)) {
                         throw new Error("Extracted JSON is not an array.");
                    }
                    console.log("Successfully extracted and parsed JSON array via regex.");
                } catch (regexParseError) {
                    console.error("Failed to parse extracted JSON array:", regexParseError);
                    itinerary = [];
                }
            } else {
                 console.error("Could not find a valid JSON array structure in the response.");
                 itinerary = [];
            }
        }

        if (!Array.isArray(itinerary) || itinerary.length === 0) {
            console.error("Failed to obtain valid itinerary data after parsing attempts.");
            throw new Error("Could not extract valid itinerary data from OpenAI response.");
        }
            
        itinerary = itinerary.map(item => ({
            day: item.day || `Date missing`, // Expecting "Tuesday, May 6"
            activity: item.activity || "No activity specified",
            location: item.location || destination,
            time: item.time || "Time N/A"
        }));
            
        console.log("--- Final Processed Itinerary ---");
        console.log("Length:", itinerary.length);
        if (itinerary.length > 0) {
            console.log("First item:", JSON.stringify(itinerary[0], null, 2));
        }
        
        res.json({
            destination: destination,
            preferences: preferences,
            itinerary: itinerary
        });
        
    } catch (error) {
        console.error("Server Error in /generate-itinerary:", error);
        res.status(500).json({ 
            error: "Failed to generate itinerary",
            message: error.message
        });
    }
});

// Serve the main page for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../src/index.html'));
});

// Add specific route for second-page
app.get('/second-page', (req, res) => {
  res.sendFile(path.join(__dirname, '../src/second-page.html'));
});

// Catch-all route to serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../src/index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    console.error("Failed to start server:", err.message);
});