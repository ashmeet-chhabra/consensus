
const personaAudioState = {
  cassandra: { audioElement: null, isPlaying: false, isSynthesizing: false },
  fortuna: { audioElement: null, isPlaying: false, isSynthesizing: false },
  athena: { audioElement: null, isPlaying: false, isSynthesizing: false },
  sage: { audioElement: null, isPlaying: false, isSynthesizing: false },
  titan: { audioElement: null, isPlaying: false, isSynthesizing: false },
  moderator: { audioElement: null, isPlaying: false, isSynthesizing: false }
};

const audioCache = {};

const synthesisQueue = {};

function clearAudioCache() {
  console.log('🧹 Clearing audio cache and stopping all playback...');
  
  Object.keys(personaAudioState).forEach(personaId => {
    const state = personaAudioState[personaId];
    if (state.audioElement) {
      state.audioElement.pause();
      state.audioElement.currentTime = 0;
      state.isPlaying = false;
      
      if (state.audioElement.src && state.audioElement.src.startsWith('blob:')) {
        URL.revokeObjectURL(state.audioElement.src);
      }
      
      state.audioElement = null;
    }
    state.isSynthesizing = false;
    updatePlayButtonUI(personaId, 'stopped');
  });
  
  Object.keys(synthesisQueue).forEach(key => delete synthesisQueue[key]);
  Object.keys(audioCache).forEach(key => delete audioCache[key]);
  
  console.log('✓ Audio cache cleared');
}

const voiceSettings = {
  cassandra: { rate: 0.85, pitch: 0.9 },
  fortuna: { rate: 1.15, pitch: 1.2 },
  athena: { rate: 1.0, pitch: 1.0 },
  sage: { rate: 0.95, pitch: 1.1 },
  titan: { rate: 1.2, pitch: 1.3 },
  moderator: { rate: 1.0, pitch: 0.95 }
};

function synthesizeAudio(text, personaId) {
  return new Promise(async (resolve) => {
    if (!text || !personaId) {
      resolve(null);
      return;
    }

    const state = personaAudioState[personaId];
    if (!state) {
      console.error(`Unknown persona: ${personaId}`);
      resolve(null);
      return;
    }

    try {
      stopOtherPersonas(personaId);

      if (synthesisQueue[personaId]) {
        console.log(`[${personaId}] Synthesis already in-flight, skipping duplicate request`);
        resolve(null);
        return;
      }

      synthesisQueue[personaId] = true;
      state.isSynthesizing = true;
      updatePlayButtonUI(personaId, 'loading');

      if (state.audioElement && !state.isPlaying) {
        const isValidAudioElement = state.audioElement.src && state.audioElement.src.startsWith('blob:');
        if (isValidAudioElement) {
          console.log(`[${personaId}] Playing pre-synthesized audio (instant playback)`);
          
          stopOtherPersonas(personaId);
          
          state.isPlaying = true;
          updatePlayButtonUI(personaId, 'playing');
          
          state.audioElement.currentTime = 0;
          
          const playPromise = state.audioElement.play();
          if (playPromise) {
            playPromise.then(() => {
              console.log(`[${personaId}] Pre-synthesized audio now playing`);
            }).catch(e => {
              console.warn(`[${personaId}] Play failed:`, e);
              state.isPlaying = false;
              updatePlayButtonUI(personaId, 'stopped');
            });
          }
          
          delete synthesisQueue[personaId];
          resolve({ source: 'PreSynthesized', persona: personaId });
          return;
        }
      }

      if (audioCache[personaId] && audioCache[personaId].text === text && audioCache[personaId].isReady) {
        console.log(`[${personaId}] Using ready cached audio`);
        
        stopOtherPersonas(personaId);
        
        const cachedElement = audioCache[personaId].audioElement;
        state.audioElement = cachedElement;
        state.isPlaying = true;
        updatePlayButtonUI(personaId, 'playing');
        cachedElement.currentTime = 0;
        
        const playPromise = cachedElement.play();
        if (playPromise) {
          playPromise.then(() => {
            console.log(`[${personaId}] Cached audio playing`);
          }).catch(e => {
            console.warn(`[${personaId}] Cached playback failed:`, e);
            state.isPlaying = false;
            updatePlayButtonUI(personaId, 'stopped');
          });
        }
        
        delete synthesisQueue[personaId];
        resolve({ source: 'Cached', persona: personaId });
        return;
      }

      const elevenLabsResult = await synthesizeWithElevenLabs(text, personaId);
      if (elevenLabsResult) {
        const playPromise = state.audioElement.play();
        if (playPromise) {
          playPromise.then(() => {
            console.log(`[${personaId}] Playback started`);
            state.isPlaying = true;
            updatePlayButtonUI(personaId, 'playing');
          }).catch(e => {
            console.warn(`[${personaId}] Playback failed:`, e);
            state.isPlaying = false;
            updatePlayButtonUI(personaId, 'stopped');
          });
        }
        
        delete synthesisQueue[personaId];
        resolve(elevenLabsResult);
        return;
      }

      console.error(`[${personaId}] ElevenLabs synthesis failed, no fallback available`);
      state.isSynthesizing = false;
      delete synthesisQueue[personaId];
      resolve(null);
    } catch (error) {
      console.error(`[${personaId}] Synthesis error:`, error);
      delete synthesisQueue[personaId];
      personaAudioState[personaId].isSynthesizing = false;
      updatePlayButtonUI(personaId, 'stopped');
      resolve(null);
    }
  });
}

function stopOtherPersonas(currentPersonaId) {
  const allAudioElements = document.querySelectorAll('audio');
  allAudioElements.forEach(audio => {
    if (audio && !audio.paused) {
      console.log(`🛑 FORCE stopping audio element in DOM`);
      audio.pause();
      audio.currentTime = 0;
    }
  });

  Object.keys(personaAudioState).forEach(personaId => {
    if (personaId !== currentPersonaId) {
      const state = personaAudioState[personaId];
      if (state.audioElement) {
        console.log(`🛑 Forcibly stopping audio for ${personaId}`);
        state.audioElement.pause();
        state.audioElement.currentTime = 0;
        state.isPlaying = false;
        updatePlayButtonUI(personaId, 'stopped');
      }
    }
  });
}

async function preSynthesizeAudio(text, personaId) {
  return new Promise(async (resolve) => {
    if (!text || !personaId) {
      resolve(null);
      return;
    }

    try {
      const state = personaAudioState[personaId];
      const cached = audioCache[personaId];

      if (
        cached &&
        cached.text === text &&
        cached.isReady &&
        cached.audioElement &&
        cached.audioElement.src
      ) {
        console.log(`[${personaId}] Audio already cached and ready`);
        if (state) {
          state.audioElement = cached.audioElement;
        }
        resolve(cached);
        return;
      }

      if (synthesisQueue[personaId]) {
        console.log(`[${personaId}] Pre-synthesis already in-flight, skipping duplicate request`);
        resolve(null);
        return;
      }

      console.log(`[${personaId}] Pre-synthesizing audio during loading...`);
      synthesisQueue[personaId] = true;
      
      // Try ElevenLabs
      const elevenLabsResult = await synthesizeWithElevenLabs(text, personaId, true);
      if (elevenLabsResult && elevenLabsResult.audioElement) {
        console.log(`[${personaId}] ⏳ Pre-synthesis successful, waiting for media to be ready...`);
        // Wait for media to be canplaythrough before marking as ready
        await new Promise((resolveReady, rejectReady) => {
          const timeoutId = setTimeout(() => {
            console.warn(`[${personaId}] ⚠️ Canplaythrough timeout, marking ready anyway`);
            resolveReady();
          }, 3000); // 3s timeout
          
          elevenLabsResult.audioElement.addEventListener('canplaythrough', () => {
            clearTimeout(timeoutId);
            console.log(`[${personaId}] ✓ Media ready (canplaythrough) - instant playback ready!`);
            resolveReady();
          }, { once: true });
          
          elevenLabsResult.audioElement.addEventListener('error', (e) => {
            clearTimeout(timeoutId);
            console.error(`[${personaId}] Media load error:`, e);
            rejectReady(e);
          }, { once: true });
        });
        
        // Store in cache with ready flag
        audioCache[personaId] = {
          text: text,
          audioElement: elevenLabsResult.audioElement,
          isReady: true
        };
        console.log(`[${personaId}] 🎯 Audio cached and verified ready for instant playback`);
        delete synthesisQueue[personaId];
        resolve(elevenLabsResult);
        return;
      }

      console.log(`[${personaId}] Pre-synthesis fallback skipped (will use on-demand)`);
      delete synthesisQueue[personaId];
      resolve(null);
    } catch (error) {
      delete synthesisQueue[personaId];
      console.error(`Pre-synthesis error for ${personaId}:`, error);
      resolve(null);
    }
  });
}

async function synthesizeWithElevenLabs(text, personaId, isPreSynthesis = false) {
  try {
    const timerId = `${personaId}-${Date.now()}`;
    if (!isPreSynthesis) {
      console.time(`[${timerId}] ElevenLabs Total`);
    }
    console.time(`[${timerId}] Fetch`);
    console.log(`[${personaId}] Calling /api/tts endpoint${isPreSynthesis ? ' (pre-synthesis)' : ''}...`);
    
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, personaId })
    });
    
    console.timeEnd(`[${timerId}] Fetch`);
    console.log(`[${personaId}] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(`❌ ElevenLabs unavailable (${response.status}): ${errorText}, falling back to Web Speech`);
      return null;
    }

    // Get audio blob
    console.time(`[${timerId}] Blob conversion`);
    const audioBlob = await response.blob();
    console.timeEnd(`[${timerId}] Blob conversion`);
    console.log('✓ ElevenLabs audio received:', audioBlob.size, 'bytes');
    
    const audioUrl = URL.createObjectURL(audioBlob);

    // Create audio element
    const audioElement = new Audio();
    audioElement.src = audioUrl;

    // Use per-persona state (HIGH FIX 2: per-persona state prevents cross-contamination)
    const state = personaAudioState[personaId];
    
    if (state) {
      state.audioElement = audioElement;
    }

    const onPlay = () => {
      if (!isPreSynthesis) {
        console.timeEnd(`[${timerId}] ElevenLabs Total`);
      }
      if (state) {
        state.isPlaying = true;
        state.isSynthesizing = false;
        updatePlayButtonUI(personaId, 'playing');
      }
    };

    const onPause = () => {
      if (state) {
        state.isPlaying = false;
        updatePlayButtonUI(personaId, 'paused');
      }
    };

    const onEnded = () => {
      if (state) {
        state.isPlaying = false;
        updatePlayButtonUI(personaId, 'stopped');
      }
      console.log(`[${personaId}] Playback finished - cached audio preserved for replay`);
    };

    const onError = (e) => {
      console.error(`[${personaId}] Audio playback error:`, e);
      if (state) {
        state.isPlaying = false;
        state.isSynthesizing = false;
        updatePlayButtonUI(personaId, 'stopped');
      }
    };

    // Add event listeners (HIGH FIX 2: use once: true to prevent stale listeners)
    audioElement.addEventListener('play', onPlay, { once: false });
    audioElement.addEventListener('pause', onPause, { once: false });
    audioElement.addEventListener('ended', onEnded, { once: true }); // Remove after first end
    audioElement.addEventListener('error', onError, { once: true });

    console.log(`[${personaId}] Audio ${isPreSynthesis ? 'pre-synthesized' : 'synthesized'} and ready for playback`);

    return {
      source: 'ElevenLabs',
      persona: personaId,
      audioElement: audioElement
    };
  } catch (error) {
    console.error('ElevenLabs error:', error);
    return null;
  }
}



function stopAudio() {
  Object.keys(personaAudioState).forEach(personaId => {
    const state = personaAudioState[personaId];
    if (state.audioElement) {
      state.audioElement.pause();
      state.audioElement.currentTime = 0;
    }
    state.isPlaying = false;
    updatePlayButtonUI(personaId, 'stopped');
  });
}

/**
 * Pause audio for a specific persona (with personaId parameter - HIGH FIX 2)
 */
function pauseAudio(personaId) {
  const state = personaAudioState[personaId];
  if (!state) return;
  
  if (state.isPlaying) {
    // Pause audio element
    if (state.audioElement) {
      state.audioElement.pause();
    }
    state.isPlaying = false;
    updatePlayButtonUI(personaId, 'paused');
  }
}

/**
 * Resume audio for a specific persona (with personaId parameter - HIGH FIX 2, HIGH FIX 4)
 * HIGH FIX 4: Validate audio element exists and is valid before resuming
 */
function resumeAudio(personaId) {
  const state = personaAudioState[personaId];
  if (!state) return;
  
  if (state.audioElement && !state.isPlaying) {
      if (state.audioElement.src && state.audioElement.src.startsWith('blob:')) {
      const playPromise = state.audioElement.play();
      if (playPromise) {
        playPromise.then(() => {
          state.isPlaying = true;
          updatePlayButtonUI(personaId, 'playing');
        }).catch(e => {
          console.warn(`[${personaId}] Resume failed:`, e);
          state.isPlaying = false;
          updatePlayButtonUI(personaId, 'paused');
        });
      }
    }
  }
}

function updatePlayButtonUI(personaId, state) {
  const playBtn = document.querySelector(`[data-persona="${personaId}"] .btn-play`);
  if (playBtn) {
    playBtn.classList.remove('playing', 'paused', 'loading');
    switch(state) {
      case 'loading':
        playBtn.textContent = '⏳ Synth...';
        playBtn.classList.add('loading');
        playBtn.disabled = true;
        break;
      case 'playing':
        playBtn.textContent = '⏸ Playing';
        playBtn.classList.add('playing');
        playBtn.disabled = false;
        break;
      case 'paused':
        playBtn.textContent = '▶ Paused';
        playBtn.classList.add('paused');
        playBtn.disabled = false;
        break;
      case 'stopped':
      default:
        playBtn.textContent = '🎙️ Play';
        playBtn.disabled = false;
    }
  }
}

function getVoiceIndexForPersona(personaId, voiceCount) {
  // Simple hash to pick a consistent voice per persona
  const hash = personaId.charCodeAt(0) % voiceCount;
  return hash;
}

// ElevenLabs TTS only - Web Speech API removed
