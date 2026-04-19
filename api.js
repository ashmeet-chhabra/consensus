/**
 * Query Gemini API with streaming support (via backend proxy)
 * @param {string} systemPrompt - System instructions for the persona
 * @param {string} userQuery - The user's decision/question
 * @param {array} previousResponses - Array of previous persona responses [optional]
 * @param {function} onChunk - Callback for each streamed chunk
 * @returns {Promise<string>} Full response text
 */
async function queryGemini(systemPrompt, userQuery, previousResponses = [], onChunk = null) {
  let fullPrompt = systemPrompt;

  if (previousResponses && previousResponses.length > 0) {
    if (fullPrompt.includes('${previous_responses}')) {
      const responsesText = previousResponses
        .map((resp, idx) => `Response ${idx + 1}:\n${resp}`)
        .join('\n\n---\n\n');
      fullPrompt = fullPrompt.replace('${previous_responses}', responsesText);
    }
  }

  fullPrompt = fullPrompt.replace('[USER QUERY]', userQuery);

  try {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemPrompt: fullPrompt,
        userMessage: userQuery,
        previousResponses: previousResponses,
        streaming: false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Backend error: ${response.status} - ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    let fullResponse = '';
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
        fullResponse = candidate.content.parts[0].text || '';
      }
    }

    if (onChunk && fullResponse) {
      onChunk(fullResponse);
    }

    console.log('✅ Response received:', fullResponse.trim());
    return fullResponse.trim();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

async function queryGeminiFallback(systemPrompt, userQuery, previousResponses = []) {
  let fullPrompt = systemPrompt;

  if (previousResponses && previousResponses.length > 0) {
    if (fullPrompt.includes('${previous_responses}')) {
      const responsesText = previousResponses
        .map((resp, idx) => `Response ${idx + 1}:\n${resp}`)
        .join('\n\n---\n\n');
      fullPrompt = fullPrompt.replace('${previous_responses}', responsesText);
    }
  }

  fullPrompt = fullPrompt.replace('[USER QUERY]', userQuery);

  try {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemPrompt: fullPrompt,
        userMessage: userQuery,
        previousResponses: previousResponses,
        streaming: false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Backend error: ${response.status} - ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
        return candidate.content.parts[0].text || '';
      }
    }

    throw new Error('Unexpected response format from Gemini API');
  } catch (error) {
    console.error('Fallback API Error:', error);
    throw error;
  }
}

async function initializeApi() {
  try {
    console.log('🔐 API initialized (backend proxy mode - no keys stored in browser)');
    console.log('✓ All Gemini calls proxied through secure backend');
  } catch (error) {
    console.error('❌ Error initializing API:', error.message);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeApi);
