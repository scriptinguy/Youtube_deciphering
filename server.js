// server.js
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import ytdl from "@distube/ytdl-core";
import { CurrentIos } from "./YoutubePlayback$CurrentIos.js"; // <--- Import here

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.post("/youtube/resolve", async (req, res) => {
    try {
        const { url, videoId } = req.body;
        const target = url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

        if (!target || !ytdl.validateURL(target)) {
            return res.status(400).json({ error: "Invalid YouTube URL or ID" });
        }

        // Use CurrentIos headers inside ytdl request options here:
        const info = await ytdl.getInfo(target, {
            requestOptions: {
                headers: CurrentIos.getHeaders()
            }
        });
        
        const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
        const bestFormat = audioFormats[0] || info.formats.find(f => f.hasAudio);

        if (!bestFormat) {
            return res.status(404).json({ error: "No suitable audio format found" });
        }

        res.json({
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            duration: parseInt(info.videoDetails.lengthSeconds, 10),
            streamUrl: bestFormat.url,
            mimeType: bestFormat.mimeType,
            contentLength: bestFormat.contentLength || null
        });
    } catch (error) {
        console.error("YouTube resolution error:", error);
        res.status(500).json({ 
            error: "Failed to resolve YouTube audio stream", 
            message: error.message 
        });
    }
});


/**
 * YouTube Audio Stream Proxy
 * Pipes raw audio bytes directly back to client (useful if host blocks CORS or requires agent headers).
 */
app.get("/youtube/stream", async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl || !ytdl.validateURL(videoUrl)) {
            return res.status(400).json({ error: "Valid 'url' query parameter is required" });
        }

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Transfer-Encoding", "chunked");

        ytdl(videoUrl, {
            filter: "audioonly",
            quality: "highestaudio",
            highWaterMark: 1 << 25
        }).pipe(res);
    } catch (error) {
        console.error("YouTube streaming error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to stream YouTube audio" });
        }
    }
});

// Create HTTP server and attach WebSocket server for API streaming tasks
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
    ws.on("message", (data) => {
        // Reserved for real-time PCM audio streaming / Gemini WebSocket relay
    });
});

server.listen(PORT, () => {
    console.log(`Verity Proxy Server running on port ${PORT}`);
});
