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
        
        console.log("Generating itinerary for:", destination);
        console.log("Destination sent to OpenAI:", destination);
        console.log("Preferences:", preferences);
        
        // Call OpenAI API
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful travel assistant that creates detailed itineraries. Always respond with properly formatted JSON."
                    },
                    {
                        role: "user",
                        content: `Create a 3-day itinerary for ${destination}. 
                                  Include daily activities, locations, and suggested times. 
                                  The traveler has these preferences: ${preferences.join(', ')}.
                                  IMPORTANT: Format your ENTIRE response as a JSON array with objects having day, activity, location, and time fields.
                                  Do not include any text before or after the JSON array.`
                    }
                ]
            })
        });
        
        if (!openAIResponse.ok) {
            const errorData = await openAIResponse.json();
            console.error("OpenAI API error:", errorData);
            throw new Error(`OpenAI API error: ${errorData.error?.message || openAIResponse.status}`);
        }
        
        const openAIData = await openAIResponse.json();
        console.log("OpenAI response received:", openAIData.choices[0].message.content.substring(0, 100) + "...");
        
        // FIX: Improved JSON parsing with better error handling
        let itinerary = [];
        try {
            const responseText = openAIData.choices[0].message.content.trim();
            
            // Try direct parsing first
            try {
                // If the response is already a clean JSON array
                itinerary = JSON.parse(responseText);
            } catch (directParseError) {
                // If direct parsing fails, try to extract JSON from the text
                const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
                if (jsonMatch) {
                    itinerary = JSON.parse(jsonMatch[0]);
                } else {
                    // If no JSON array found, look for JSON objects
                    const items = [];
                    const objectMatches = responseText.match(/\{[^{}]*\}/g);
                    if (objectMatches) {
                        for (const match of objectMatches) {
                            try {
                                const item = JSON.parse(match);
                                if (item.day && item.activity) {
                                    items.push(item);
                                }
                            } catch (e) {
                                console.log("Failed to parse object:", match);
                            }
                        }
                        if (items.length > 0) {
                            itinerary = items;
                        }
                    }
                }
            }
            
            // Verify we have valid itinerary data
            if (!Array.isArray(itinerary) || itinerary.length === 0) {
                throw new Error("Could not extract valid itinerary data");
            }
            
            // Validate and clean up each item
            itinerary = itinerary.map(item => ({
                day: item.day || "Day",
                activity: item.activity || "Explore the area",
                location: item.location || destination,
                time: item.time || "10:00 AM"
            }));
            
            console.log("Successfully parsed itinerary:", itinerary);
        } catch (parseError) {
            console.error("Error parsing OpenAI response:", parseError);
            console.error("Response content:", openAIData.choices[0].message.content);
            
            // Fallback itinerary
            itinerary = [
                { day: "Day 1", activity: `Explore ${destination}`, location: destination, time: "10:00 AM" },
                { day: "Day 2", activity: `Visit local attractions in ${destination}`, location: destination, time: "1:00 PM" },
                { day: "Day 3", activity: `Experience local cuisine in ${destination}`, location: destination, time: "7:00 PM" },
            ];
        }
        
        // Send the response
        res.json({
            destination: destination,
            preferences: preferences,
            itinerary: itinerary
        });
        
    } catch (error) {
        console.error("Server Error:", error);
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