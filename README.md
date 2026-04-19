# Consensus

Consensus is a debate orchestration app that helps users think through difficult decisions by simulating a panel of AI personas with distinct viewpoints, then synthesizing a moderator verdict and audio recording.

## What it does

- Accepts a decision or dilemma from the user
- Collects a small amount of context to frame the debate
- Runs five personas in a structured debate, then asks a moderator to synthesize the result
- Plays persona responses as audio using ElevenLabs, with a browser speech fallback
- Includes a follow-up flow so users can ask the moderator for more guidance

## Tech Stack

- HTML, CSS, JavaScript
- Node.js and Express
- Google Gemini API
- ElevenLabs TTS

## Getting Started

### Prerequisites

- Node.js 18+
- API keys for Gemini and ElevenLabs

### Install

```bash
npm install
```

### Environment

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

### Run locally

```bash
npm start
```

Then open:

```bash
http://localhost:3000
```

## Project Structure

```text
consensus/
├── index.html
├── style.css
├── app.js
├── tts.js
├── api.js
├── personas.js
├── modal.js
├── server.js
├── .env.example
└── README.md
```

## Notes

- Gemini and ElevenLabs keys are kept server-side through the Express backend.
- If ElevenLabs is unavailable, the app falls back to browser speech synthesis.
- The app is designed for a live demo flow: landing page, context form, debate playback, and moderator follow-up.

## Deployment

Any host that supports a persistent Node.js server should work, such as Render, Railway, Fly.io, or a VPS.

Set the same environment variables on the host:

```bash
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...
```

## License

Built for MLH AI Hackfest 2026.