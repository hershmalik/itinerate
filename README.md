# Itinerary Planner

This project is a Node.js application that generates travel itineraries using OpenAI and various external APIs.

## Project Structure

```
.
├── server            # Express server
│   └── server.js
├── src               # Static client files
│   ├── index.html
│   ├── second-page.html
│   └── ...
└── .env.example      # Example environment variables
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and provide the required API keys:
   - `OPENAI_API_KEY`
   - `WEATHER_API_KEY`
   - `VISUAL_CROSSING_API_KEY`
   - `GOOGLE_PLACES_API_KEY`
   - `GOOGLE_MAPS_API_KEY`
3. Start the server:
   ```bash
   npm start
   ```
   The application will run on `http://localhost:5000` unless the `PORT` variable is set.

## Development

Static files are served from the `src` directory. The server code is located in `server/server.js`.

## License

MIT
