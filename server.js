require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/query', async (req, res) => {
  try {
    const { systemPrompt, userMessage, previousResponses, streaming } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not set in .env' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: systemPrompt + '\n\n' + userMessage
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 2000
      }
    };

    const endpoint = streaming
      ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    if (streaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        
        res.end();
      } catch (error) {
        console.error('Streaming error:', error);
        res.status(500).json({ error: 'Streaming failed: ' + error.message });
      }
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, personaId } = req.body;
    console.log(`[TTS] Received request for persona: ${personaId}`);

    if (!text || !personaId) {
      console.warn('[TTS] Missing text or personaId');
      return res.status(400).json({ error: 'text and personaId required' });
    }

    // If no ElevenLabs key, return error (client will fall back to Web Speech)
    if (!process.env.ELEVENLABS_API_KEY) {
      console.warn('[TTS] ELEVENLABS_API_KEY not configured');
      return res.status(503).json({ error: 'ElevenLabs not configured, use Web Speech fallback' });
    }

    const voiceMap = {
      cassandra: 'TxGi1N29NQoCaYD4fcU5',
      fortuna: 'l4Coq6695JDX9xtLqXDE',
      athena: 'PhtMKZZUVGIa9xB8vfo6',
      sage: 'am5XuPVtut7uKJQKMja2',
      titan: 'Obuyk6KKzg9olSLPaCbl',
      moderator: 'K5ZVtkkBnuPY6YqXs70E'
    };

    const voiceId = voiceMap[personaId];
    if (!voiceId) {
      return res.status(400).json({ error: `Unknown persona: ${personaId}` });
    }

    // Voice settings per persona (can customize per voice if needed)
    const voiceSettingsMap = {
      athena: {
        stability: 0.4,
        similarity_boost: 0.8,
        use_speaker_boost: true
      },
      default: {
        stability: 0.5,
        similarity_boost: 0.75,
        use_speaker_boost: true
      }
    };

    const voiceSettings = voiceSettingsMap[personaId] || voiceSettingsMap.default;

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    console.log(`[TTS] Calling ElevenLabs API for ${personaId}...`);
    
    const response = await fetch(elevenLabsUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: voiceSettings
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[TTS] ElevenLabs API error for ${personaId}: ${response.status} ${response.statusText}`, error);
      return res.status(response.status).json({ 
        error: 'ElevenLabs API failed',
        fallback: 'Use Web Speech API'
      });
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`[TTS] ✓ Successfully got audio from ElevenLabs (${audioBuffer.byteLength} bytes) for ${personaId}`);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ 
      error: 'TTS failed: ' + error.message,
      fallback: 'Use Web Speech API'
    });
  }
});

app.listen(PORT, () => {
  console.log(`🏛️ Consensus server running at http://localhost:${PORT}`);
  console.log('✓ Static files served');
  console.log('✓ Secure Gemini proxy active at /api/query');
  if (process.env.ELEVENLABS_API_KEY) {
    console.log('✓ ElevenLabs TTS active at /api/tts');
  } else {
    console.log('⚠ ElevenLabs not configured, using Web Speech API fallback');
  }
});
