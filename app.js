let appState = {
  currentScreen: 'landing',
  userDecision: '',
  userEmotionalState: '',
  userBiggestWorry: '',
  responses: {}
};

let debateWarmupState = {
  decision: '',
  started: false,
  completed: false,
  inFlightPromise: null
};

function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const targetScreen = document.getElementById(`${screenName}-screen`);
  if (targetScreen) {
    targetScreen.classList.add('active');
    appState.currentScreen = screenName;
  }
}

function initLanding() {
  const conveneBtn = document.getElementById('convene-btn');
  const decisionInput = document.getElementById('decision-input');
  const meetPanelBtn = document.getElementById('meet-panel-btn');

  meetPanelBtn.addEventListener('click', () => {
    showScreen('panel-intro');
  });

  const promptTags = document.querySelectorAll('.prompt-tag');
  promptTags.forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.preventDefault();
      const promptText = tag.getAttribute('data-prompt');
      decisionInput.value = promptText;
      decisionInput.focus();
      decisionInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  conveneBtn.addEventListener('click', () => {
    const decision = decisionInput.value.trim();
    if (!decision) {
      alert_warning('Missing Decision', 'Please tell us your decision or dilemma.');
      return;
    }

    appState.userDecision = decision;
    moveToIntake();
  });

  decisionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      conveneBtn.click();
    }
  });
}

function moveToIntake() {
  const decisionDisplay = document.getElementById('intake-decision-display');

  if (decisionDisplay) {
    decisionDisplay.value = appState.userDecision;
  }

  showScreen('intake');
  startDebateWarmup();
}

function initPanelIntro() {
  const backBtn = document.getElementById('back-to-landing-btn');
  const startDebateBtn = document.getElementById('start-debate-from-intro');

  backBtn.addEventListener('click', () => {
    showScreen('landing');
  });

  startDebateBtn.addEventListener('click', () => {
    // Return to landing page so user can start debate from there
    showScreen('landing');
  });
}

function initIntake() {
  const intakeForm = document.getElementById('intake-form');
  const worryRadios = document.querySelectorAll('input[name="biggest_worry"]');
  const customWorryContainer = document.getElementById('custom-worry-container');
  const customWorryInput = document.getElementById('custom-worry-input');

  worryRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'other') {
        customWorryContainer.style.display = 'block';
        customWorryInput.focus();
      } else {
        customWorryContainer.style.display = 'none';
        customWorryInput.value = '';
      }
    });
  });

  intakeForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const emotionalState = document.querySelector('input[name="emotional_state"]:checked')?.value;
    const biggestWorry = document.querySelector('input[name="biggest_worry"]:checked')?.value;

    if (!emotionalState || !biggestWorry) {
      alert_warning('Incomplete Form', 'Please answer both context questions.');
      return;
    }

    if (biggestWorry === 'other') {
      const customText = customWorryInput.value.trim();
      if (!customText) {
        alert_warning('Missing Details', 'Please tell us what\'s weighing on you.');
        return;
      }
      appState.userBiggestWorry = customText;
    } else {
      appState.userBiggestWorry = biggestWorry;
    }

    appState.userEmotionalState = emotionalState;
    startDebate();
  });
}

function initPanel() {
  const newQueryBtn = document.getElementById('new-query-btn');

  newQueryBtn.addEventListener('click', () => {
    clearAudioCache();
    resetDebatePlaylistState();

    debateWarmupState = {
      decision: '',
      started: false,
      completed: false,
      inFlightPromise: null
    };

    appState = {
      currentScreen: 'landing',
      userDecision: '',
      userEmotionalState: '',
      userBiggestWorry: '',
      responses: {}
    };

    const decisionInput = document.getElementById('decision-input');
    if (decisionInput) decisionInput.value = '';

    const emotionalRadios = document.querySelectorAll('input[name="emotional_state"]');
    emotionalRadios.forEach(radio => radio.checked = false);
    
    const worryRadios = document.querySelectorAll('input[name="biggest_worry"]');
    worryRadios.forEach(radio => radio.checked = false);
    
    const customWorry = document.getElementById('custom-worry-input');
    if (customWorry) customWorry.value = '';
    
    const customWorryContainer = document.getElementById('custom-worry-container');
    if (customWorryContainer) customWorryContainer.style.display = 'none';

    // Clear panel cards
    document.querySelectorAll('.persona-card .response-text').forEach(el => {
      el.textContent = '';
    });

    document.querySelectorAll('.persona-card .cursor').forEach(el => {
      el.classList.remove('hidden');
    });

    // Clear status
    const statusEl = document.getElementById('panel-status');
    if (statusEl) statusEl.textContent = '';

    showScreen('landing');
  });

  document.querySelectorAll('.persona-card .btn-play').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const card = e.target.closest('.persona-card');
      if (!card) return;
      const persona = card.dataset.persona;
      const text = card.querySelector('.response-text').textContent;

      if (text && text.trim()) {
        const state = personaAudioState[persona];
        if (!state) return;

        resetDebatePlaylistState();

        // Check if this persona is already playing
        if (state.isPlaying) {
          // Toggle pause
          pauseAudio(persona);
        } else if (state.audioElement && state.audioElement.src && state.audioElement.src.startsWith('blob:')) {
          // Resume if paused and has valid audio element
          resumeAudio(persona);
        } else {
          // Start new audio synthesis
          synthesizeAudio(text, persona).catch(e => console.error('Audio synthesis error:', e));
        }
      }
    });
  });
}

async function getPersonaResponse(personaId, systemPrompt, previousResponses = []) {
  try {
    let fullResponse = '';

    fullResponse = await queryGemini(
      systemPrompt,
      appState.userDecision,
      previousResponses,
      (chunk) => {
        fullResponse += chunk;
        streamResponseChunk(personaId, chunk);
      }
    );

    return fullResponse;
  } catch (error) {
    console.warn(`Streaming failed for ${personaId}, trying fallback...`);
    try {
      const fallbackResponse = await queryGeminiFallback(
        systemPrompt,
        appState.userDecision,
        previousResponses
      );
      displayResponse(personaId, fallbackResponse);
      return fallbackResponse;
    } catch (fallbackError) {
      console.error(`Failed for ${personaId}:`, fallbackError);
      const errorResponse = `[Error getting response from ${personaId}]`;
      displayResponse(personaId, errorResponse);
      return errorResponse;
    }
  }
}

async function getPersonaResponseSilent(systemPrompt, previousResponses = []) {
  try {
    return await queryGemini(systemPrompt, appState.userDecision, previousResponses);
  } catch (error) {
    console.warn('Silent streaming failed, trying fallback...');
    return await queryGeminiFallback(systemPrompt, appState.userDecision, previousResponses);
  }
}

async function startDebate(skipLoaderScreen = false) {
  const personaOrder = getNonModeratorPersonas();
  const MIN_LOADER_DURATION = 12000; // 12 seconds minimum

  if (
    debateWarmupState.started &&
    debateWarmupState.decision === appState.userDecision &&
    debateWarmupState.inFlightPromise
  ) {
    const loaderStartTime = Date.now();

    if (!skipLoaderScreen) {
      showScreen('debate-loader');
    }

    const loaderMusic = document.getElementById('loader-music');
    if (loaderMusic) {
      loaderMusic.volume = 0.5;
      const playPromise = loaderMusic.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    }

    try {
      await debateWarmupState.inFlightPromise;

      // Keep loader visible for at least MIN_LOADER_DURATION
      const elapsedTime = Date.now() - loaderStartTime;
      const remainingTime = Math.max(0, MIN_LOADER_DURATION - elapsedTime);
      if (remainingTime > 0) {
        await sleep(remainingTime);
      }

      if (loaderMusic) {
        loaderMusic.pause();
        loaderMusic.currentTime = 0;
      }

      showScreen('panel');
      updatePanelStatus('Moderator is synthesizing... [6/6]');

      const allResponses = personaOrder.map(p => appState.responses[p.id]);
      const moderatorSystemPrompt = buildModeratorPrompt(allResponses);

      const moderatorCard = document.getElementById('card-moderator');
      if (moderatorCard) {
        moderatorCard.querySelector('.response-text').textContent = '';
        moderatorCard.querySelector('.cursor').classList.remove('hidden');
      }

      const moderatorResponse = await getPersonaResponse('moderator', moderatorSystemPrompt, allResponses);
      appState.responses['moderator'] = moderatorResponse;

      if (moderatorCard) {
        moderatorCard.querySelector('.cursor').classList.add('hidden');
      }

      setTimeout(() => {
        showFollowUpSection();
        showDebatePlaylist();
      }, 1000);

      updatePanelStatus('✓ Debate complete.');
      return;
    } catch (error) {
      console.error('Debate error:', error);
      updatePanelStatus('✗ Error during debate.');
      return;
    }
  }

  clearAudioCache();

  if (!skipLoaderScreen) {
    showScreen('debate-loader');
  }
  
  const loaderMusic = document.getElementById('loader-music');
  if (loaderMusic) {
    loaderMusic.volume = 0.5;
    console.log('🎵 Starting loader music...');
    const playPromise = loaderMusic.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => console.log('✓ Loader music playing'))
        .catch(e => console.warn('⚠️ Audio autoplay blocked (browser policy):', e.message));
    }
  }
  
  const loaderStartTime = Date.now();

  try {
    const personaPromises = personaOrder.map((persona, i) => {
      const systemPrompt = buildPersonaPrompt(persona, personaOrder, []);
      
      return getPersonaResponse(persona.id, systemPrompt, [])
        .then(response => {
          appState.responses[persona.id] = response;
          // Display response as it arrives
          const card = document.getElementById(`card-${persona.id}`);
          if (card) {
            displayResponse(persona.id, response);
          }
          
          // NOTE: preSynthesizeAudio will be called in displayResponse() with clean text
          // Don't call it here - it would be called twice with different text (raw vs stripped)
          
          return response;
        })
        .catch(e => {
          console.error(`Error for ${persona.id}:`, e);
          const errorResponse = `[Error getting response from ${persona.id}]`;
          appState.responses[persona.id] = errorResponse;
          displayResponse(persona.id, errorResponse);
          return errorResponse;
        });
    });

    // Wait for all personas to complete OR minimum loader duration, whichever is longer
    const allPersonaResponses = await Promise.all(personaPromises);

    // Ensure we show for at least MIN_LOADER_DURATION
    const elapsedTime = Date.now() - loaderStartTime;
    const remainingTime = Math.max(0, MIN_LOADER_DURATION - elapsedTime);

    if (remainingTime > 0) {
      await sleep(remainingTime);
    }

    // Stop elevator music and show panel screen
    if (loaderMusic) {
      loaderMusic.pause();
      loaderMusic.currentTime = 0;
    }
    showScreen('panel');

    // Get moderator response
    updatePanelStatus('Moderator is synthesizing... [6/6]');
    
    const allResponses = personaOrder.map(p => appState.responses[p.id]);
    const moderatorSystemPrompt = buildModeratorPrompt(allResponses);

    // Clear moderator card
    const moderatorCard = document.getElementById('card-moderator');
    if (moderatorCard) {
      moderatorCard.querySelector('.response-text').textContent = '';
      moderatorCard.querySelector('.cursor').classList.remove('hidden');
    }

    const moderatorResponse = await getPersonaResponse('moderator', moderatorSystemPrompt, allResponses);

    appState.responses['moderator'] = moderatorResponse;

    // Hide cursor after moderator response
    if (moderatorCard) {
      moderatorCard.querySelector('.cursor').classList.add('hidden');
    }

    // Show follow-up section and debate playlist after moderator completes
    setTimeout(() => {
      showFollowUpSection();
      showDebatePlaylist();
    }, 1000);

    updatePanelStatus('✓ Debate complete.');
  } catch (error) {
    console.error('Debate error:', error);
    updatePanelStatus('✗ Error during debate.');
  }
}

function startDebateWarmup() {
  if (!appState.userDecision) return;

  if (
    debateWarmupState.started &&
    debateWarmupState.decision === appState.userDecision &&
    debateWarmupState.inFlightPromise
  ) {
    return;
  }

  clearAudioCache();
  appState.responses = {};

  debateWarmupState = {
    decision: appState.userDecision,
    started: true,
    completed: false,
    inFlightPromise: null
  };

  const personaOrder = getNonModeratorPersonas();

  const warmupPromise = Promise.all(
    personaOrder.map(persona => {
      const systemPrompt = buildPersonaPrompt(persona, personaOrder, []);

      return getPersonaResponse(persona.id, systemPrompt, [])
        .then(response => {
          appState.responses[persona.id] = response;
          displayResponse(persona.id, response);
          return response;
        })
        .catch(e => {
          console.error(`Warmup error for ${persona.id}:`, e);
          const errorResponse = `[Error getting response from ${persona.id}]`;
          appState.responses[persona.id] = errorResponse;
          displayResponse(persona.id, errorResponse);
          return errorResponse;
        });
    })
  )
    .then(() => {
      debateWarmupState.completed = true;
    })
    .catch(e => {
      console.error('Warmup failed:', e);
    });

  debateWarmupState.inFlightPromise = warmupPromise;
}

function displayResponse(personaId, text) {
  const card = document.getElementById(`card-${personaId}`);
  if (!card) return;

  const responseText = card.querySelector('.response-text');
  const cursor = card.querySelector('.cursor');

  // Strip markdown first
  text = stripMarkdown(text);

  // START AUDIO PRE-SYNTHESIS IMMEDIATELY (don't wait for text to finish displaying)
  // This ensures audio is ready by the time user clicks play
  // Uses clean text (markdown stripped) for consistent cache matching
  if (text && text.trim() && !text.includes('[Error')) {
    console.log(`[${personaId}] Response received - starting audio synthesis with cleaned text`);
    preSynthesizeAudio(text, personaId)
      .catch(e => console.error(`Audio pre-synthesis failed for ${personaId}:`, e));
  }

  // Clear previous content
  responseText.textContent = '';
  cursor.classList.remove('hidden');

  // Stream text character by character
  let charIndex = 0;
  const streamInterval = setInterval(() => {
    if (charIndex < text.length) {
      responseText.textContent += text[charIndex];
      charIndex++;
    } else {
      clearInterval(streamInterval);
      cursor.classList.add('hidden');
    }
  }, 20); // 20ms per character = ~3000ms for 150 words
}

/**
 * Strip markdown formatting for clean display
 */
function stripMarkdown(text) {
  // Remove persona response headers (e.g., "Nero's Response:", "Aria's Response:", etc.)
  text = text.replace(/^[A-Za-z]+'s Response:\s*/gm, '');
  text = text.replace(/^[A-Za-z]+:\s*/gm, '');
  
  // Remove bold (**text** or __text__)
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');
  
  // Remove italic (*text* or _text_)
  text = text.replace(/\*(.+?)\*/g, '$1');
  text = text.replace(/_(.+?)_/g, '$1');
  
  // Remove inline code (`text`)
  text = text.replace(/`(.+?)`/g, '$1');
  
  // Remove links [text](url)
  text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1');
  
  // Remove headers (#, ##, ###, etc.)
  text = text.replace(/^#+\s+/gm, '');
  
  // Remove list markers (-, *, +, 1. etc.)
  text = text.replace(/^[\s]*([-*+]|\d+\.)\s+/gm, '');
  
  return text;
}

/**
 * Stream individual chunk to card (used during Gemini streaming)
 * Appends chunk and continues the typewriter effect
 */
function streamResponseChunk(personaId, chunk) {
  const card = document.getElementById(`card-${personaId}`);
  if (!card) return;

  const responseText = card.querySelector('.response-text');
  const cursor = card.querySelector('.cursor');

  // Strip markdown and append the chunk
  const cleanChunk = stripMarkdown(chunk);
  responseText.textContent += cleanChunk;

  // Ensure cursor is visible
  cursor.classList.remove('hidden');
}

function updatePanelStatus(status) {
  const statusEl = document.getElementById('panel-status');
  if (statusEl) {
    statusEl.textContent = status;
  }
}

/**
 * Get non-moderator personas in fixed debate order
 */
function getNonModeratorPersonas() {
  const order = ['cassandra', 'fortuna', 'athena', 'sage', 'titan'];
  
  return order
    .map(id => personas.find(p => p.id === id))
    .filter(p => p);
}

/**
 * Build persona system prompt with previous responses embedded
 * @param {object} persona - The persona object
 * @param {array} personaOrder - Array of persona objects in order
 * @param {array} previousResponses - Array of response texts from previous personas
 */
function buildPersonaPrompt(persona, personaOrder, previousResponses = []) {
  let prompt = persona.systemPrompt;

  // In parallel mode (no previousResponses), remove all references to other personas
  // and add instruction to NOT speculate about others
  if (!previousResponses || previousResponses.length === 0) {
    // Remove response placeholders
    prompt = prompt.replace(/\[CASSANDRA_RESPONSE\]/g, '');
    prompt = prompt.replace(/\[FORTUNA_RESPONSE\]/g, '');
    prompt = prompt.replace(/\[ATHENA_RESPONSE\]/g, '');
    prompt = prompt.replace(/\[SAGE_RESPONSE\]/g, '');
    prompt = prompt.replace(/\[TITAN_RESPONSE\]/g, '');
    
    // Remove lines that reference other perspectives
    prompt = prompt.replace(/You.*?heard.*?perspective.*?\n/gi, '');
    prompt = prompt.replace(/You.*?heard.*?perspectives.*?\n/gi, '');
    prompt = prompt.replace(/You.*?heard.*?takes.*?\n/gi, '');
    
    // Add instruction to NOT reference other personas
    prompt += `\n\nIMPORTANT: Give your independent perspective ONLY. Do NOT mention, reference, speculate about, or try to counter other viewpoints. Just speak from your own viewpoint.`;
  } else {
    // Sequential mode - replace response placeholders normally
    for (let i = 0; i < previousResponses.length && i < personaOrder.length; i++) {
      const prevPersona = personaOrder[i];
      const placeholder = `[${prevPersona.name.toUpperCase()}_RESPONSE]`;
      const response = previousResponses[i] || '[No response]';
      prompt = prompt.replace(placeholder, response);
    }
  }

  // Add intake context for all personas
  if (prompt.includes('[USER_EMOTIONAL_STATE]')) {
    prompt = prompt.replace('[USER_EMOTIONAL_STATE]', appState.userEmotionalState);
  }
  if (prompt.includes('[USER_BIGGEST_WORRY]')) {
    prompt = prompt.replace('[USER_BIGGEST_WORRY]', appState.userBiggestWorry);
  }

  return prompt;
}

/**
 * Build moderator synthesis prompt
 */
function buildModeratorPrompt(allResponses) {
  let prompt = personas.find(p => p.id === 'moderator').systemPrompt;

  // Replace all persona responses
  // allResponses is built from getNonModeratorPersonas() order: ['athena', 'sage', 'fortuna', 'titan', 'cassandra']
  const personaOrder = getNonModeratorPersonas();
  for (let i = 0; i < personaOrder.length; i++) {
    const placeholder = `[${personaOrder[i].name.toUpperCase()}_RESPONSE]`;
    const response = allResponses[i] || '[No response]';
    prompt = prompt.replace(placeholder, response);
  }

  // Replace context
  prompt = prompt.replace('[USER_DECISION]', appState.userDecision);
  prompt = prompt.replace('[USER_EMOTIONAL_STATE]', appState.userEmotionalState);
  prompt = prompt.replace('[USER_BIGGEST_WORRY]', appState.userBiggestWorry);

  return prompt;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showFollowUpSection() {
  const section = document.getElementById('moderator-followup-section');
  if (section) {
    section.style.display = 'block';
  }

  // Add follow-up submission handler
  const submitBtn = document.getElementById('followup-submit-btn');
  if (submitBtn && !submitBtn.hasListener) {
    submitBtn.addEventListener('click', handleModeratorFollowUp);
    submitBtn.hasListener = true;
  }

  const followupPlayBtn = document.querySelector('#followup-audio-controls .btn-play');
  if (followupPlayBtn && !followupPlayBtn.hasListener) {
    followupPlayBtn.addEventListener('click', handleFollowUpAudioPlay);
    followupPlayBtn.hasListener = true;
  }
}

function handleFollowUpAudioPlay(e) {
  e.preventDefault();

  const text = document.querySelector('#followup-response .response-text')?.textContent || '';
  const persona = 'moderator';
  const state = personaAudioState[persona];

  if (!text.trim() || !state) return;

  resetDebatePlaylistState();

  if (state.isPlaying) {
    pauseAudio(persona);
  } else if (state.audioElement && state.audioElement.src && state.audioElement.src.startsWith('blob:')) {
    resumeAudio(persona);
  } else {
    synthesizeAudio(text, persona).catch(err => console.error('Follow-up audio synthesis error:', err));
  }
}

async function handleModeratorFollowUp() {
  const input = document.getElementById('followup-input');
  const message = input.value.trim();
  
  if (!message) {
    alert_warning('Empty Message', 'Please write something to discuss with the moderator.');
    return;
  }

  const submitBtn = document.getElementById('followup-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Moderator thinking...';

  try {
    // Build follow-up prompt for moderator
    const allResponses = getNonModeratorPersonas().map(p => appState.responses[p.id]);
    let prompt = `You are the Moderator. 
    
User's decision: ${appState.userDecision}
User's emotional state: ${appState.userEmotionalState}
User's biggest worry: ${appState.userBiggestWorry}

Previous debate summary:
${allResponses.map((r, i) => `- ${getNonModeratorPersonas()[i].name}: ${r.substring(0, 100)}...`).join('\n')}

Your previous synthesis: ${appState.responses['moderator'].substring(0, 200)}...

User's follow-up question: ${message}

Respond as the moderator, addressing their follow-up question. Be warm, direct, and wise. 100-150 words.`;

    // Get follow-up response without streaming into the main moderator card
    const followUpResponse = await getPersonaResponseSilent(prompt, []);
    
    // Display follow-up response
    const responseDiv = document.getElementById('followup-response');
    const responseText = responseDiv.querySelector('.response-text');
    responseText.textContent = '';
    responseDiv.style.display = 'block';

    // Stream the response
    let charIndex = 0;
    const streamInterval = setInterval(() => {
      if (charIndex < followUpResponse.length) {
        responseText.textContent += followUpResponse[charIndex];
        charIndex++;
      } else {
        clearInterval(streamInterval);
        
        // Pre-synthesize audio for follow-up
        preSynthesizeAudio(followUpResponse, 'moderator')
          .then(() => {
            const audioControls = document.getElementById('followup-audio-controls');
            if (audioControls) audioControls.style.display = 'block';
          })
          .catch(e => console.error('Follow-up audio pre-synthesis failed:', e));
      }
    }, 15);

    // Clear input
    input.value = '';
  } catch (error) {
    console.error('Follow-up error:', error);
    alert_warning('Error', 'Failed to get moderator response.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sort This Out';
  }
}

function showDebatePlaylist() {
  const section = document.getElementById('debate-playlist-section');
  if (section) {
    section.style.display = 'block';
  }

  updateDebatePlaylistUI(debatePlaylistState.status);

  // Add playlist handler
  const playBtn = document.getElementById('playlist-play-btn');
  if (playBtn && !playBtn.hasListener) {
    playBtn.addEventListener('click', playFullDebate);
    playBtn.hasListener = true;
  }
}

const debatePlaylistState = {
  initialized: false,
  orderedIds: [],
  queue: [],
  currentIndex: 0,
  status: 'idle' // idle | loading | playing | paused | ended
};

function getPlaylistNowPlayingText(currentId) {
  if (!currentId) return 'Now playing: —';

  const persona = personas.find(p => p.id === currentId);
  const name = persona ? persona.name : currentId;
  return `Now playing: ${name}`;
}

function getReadyPlaylistAudioElement(personaId) {
  const state = personaAudioState[personaId];
  if (state && state.audioElement && state.audioElement.src) {
    return state.audioElement;
  }

  const cached = audioCache[personaId];
  if (cached && cached.isReady && cached.audioElement && cached.audioElement.src) {
    if (state) {
      state.audioElement = cached.audioElement;
    }
    return cached.audioElement;
  }

  return null;
}

function updateDebatePlaylistUI(status, currentId = null) {
  const playBtn = document.getElementById('playlist-play-btn');
  const nowPlayingEl = document.getElementById('playlist-now-playing');

  if (playBtn) {
    switch (status) {
      case 'loading':
        playBtn.textContent = '⏳ Loading Debate...';
        break;
      case 'playing':
        playBtn.textContent = '⏸ Pause Debate';
        break;
      case 'paused':
        playBtn.textContent = '▶ Resume Debate';
        break;
      case 'ended':
      case 'idle':
      default:
        playBtn.textContent = '▶ Play Full Debate';
        break;
    }
  }

  if (nowPlayingEl) {
    if (status === 'paused' && currentId) {
      nowPlayingEl.textContent = `${getPlaylistNowPlayingText(currentId)} (Paused)`;
    } else if (status === 'playing' && currentId) {
      nowPlayingEl.textContent = getPlaylistNowPlayingText(currentId);
    } else {
      nowPlayingEl.textContent = 'Now playing: —';
    }
  }
}

function resetDebatePlaylistState(resetAudio = true) {
  const audio = document.getElementById('debate-audio');

  if (audio) {
    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    audio.onerror = null;

    if (resetAudio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }

  debatePlaylistState.initialized = false;
  debatePlaylistState.orderedIds = [];
  debatePlaylistState.queue = [];
  debatePlaylistState.currentIndex = 0;
  debatePlaylistState.status = 'idle';

  updateDebatePlaylistUI('idle');
}

function getCurrentDebatePlaylistPersonaId() {
  return debatePlaylistState.orderedIds[debatePlaylistState.currentIndex] || null;
}

function syncDebatePlaylistUIFromAudio() {
  const audio = document.getElementById('debate-audio');
  if (!audio || !debatePlaylistState.initialized) {
    return;
  }

  const currentId = getCurrentDebatePlaylistPersonaId();
  const status = audio.paused ? 'paused' : 'playing';
  debatePlaylistState.status = status;
  updateDebatePlaylistUI(status, currentId);
}

async function startDebatePlaylistPlayback(audio) {
  const currentSrc = debatePlaylistState.queue[debatePlaylistState.currentIndex];
  if (!currentSrc) {
    resetDebatePlaylistState();
    return false;
  }

  if (audio.src !== currentSrc) {
    audio.src = currentSrc;
  }

  try {
    await audio.play();
    return true;
  } catch (e) {
    console.warn('Playback failed:', e);
    resetDebatePlaylistState();
    alert_warning('Playback Error', 'Could not start full debate playback. Please try again.');
    return false;
  }
}

async function playFullDebate() {
  const audio = document.getElementById('debate-audio');
  if (!audio) return;

  // Recover from stale state if queue/audio got out of sync
  if (debatePlaylistState.initialized && (!audio.src || debatePlaylistState.queue.length === 0)) {
    resetDebatePlaylistState();
  }

  if (debatePlaylistState.initialized && debatePlaylistState.status === 'playing') {
    audio.pause();
    return;
  }

  if (debatePlaylistState.initialized && debatePlaylistState.status === 'paused') {
    await startDebatePlaylistPlayback(audio);
    return;
  }

  if (debatePlaylistState.initialized && debatePlaylistState.status === 'loading') {
    return;
  }

  const orderedIds = [...getNonModeratorPersonas().map(p => p.id), 'moderator'];

  const missingIds = orderedIds.filter(id => {
    return !getReadyPlaylistAudioElement(id);
  });

  if (missingIds.length > 0) {
    return;
  }

  stopAudio();

  debatePlaylistState.orderedIds = orderedIds;
  debatePlaylistState.queue = orderedIds.map(id => getReadyPlaylistAudioElement(id).src);
  debatePlaylistState.currentIndex = 0;
  debatePlaylistState.initialized = true;
  debatePlaylistState.status = 'loading';
  updateDebatePlaylistUI('loading');

  audio.onplay = () => {
    syncDebatePlaylistUIFromAudio();
  };

  audio.onpause = () => {
    if (!debatePlaylistState.initialized) {
      return;
    }

    if (debatePlaylistState.status !== 'ended') {
      syncDebatePlaylistUIFromAudio();
    }
  };

  audio.onended = async () => {
    debatePlaylistState.currentIndex += 1;
    if (debatePlaylistState.currentIndex < debatePlaylistState.queue.length) {
      debatePlaylistState.status = 'loading';
      updateDebatePlaylistUI('loading', getCurrentDebatePlaylistPersonaId());
      await startDebatePlaylistPlayback(audio);
    } else {
      debatePlaylistState.status = 'ended';
      resetDebatePlaylistState();
    }
  };

  audio.onerror = () => {
    resetDebatePlaylistState();
    alert_warning('Playback Error', 'Could not continue full debate playback. Please try again.');
  };

  await startDebatePlaylistPlayback(audio);
}

document.addEventListener('DOMContentLoaded', async () => {
  initializeApi();

  initLanding();
  initPanelIntro();
  initIntake();
  initPanel();

  // Show landing screen by default
  showScreen('landing');

  // Verify TTS system
  if (typeof synthesizeAudio === 'function') {
    console.log('✓ Web Speech API TTS ready');
  }
  
  console.log('✓ Consensus app initialized.');
});
