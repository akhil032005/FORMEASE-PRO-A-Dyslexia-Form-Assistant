// ========== BACKEND CONFIGURATION ==========
const BACKEND_URL = 'http://localhost:8000';  // Your running backend

// Track if backend is available
let backendAvailable = false;

// ========== GLOBAL VARIABLES (ALL MISSING ONES ADDED) ==========
let ttsEnabled = false;
let speechRate = 1.0;
let lastSpokenTime = 0;
const SPEECH_COOLDOWN = 1000;

// MISSING VARIABLES - ADDED HERE
let wordByWordEnabled = false;
let validationEnabled = true;
let progressEnabled = true;
let offlineMode = !navigator.onLine;
let grammarCheckEnabled = true;
let passwordGeneratorEnabled = true;
let readingRulerEnabled = false;
let readingGuideEnabled = false;
let autoBackupEnabled = true;
let lastWord = ''; // For word-by-word tracking

// ========== DICTIONARY (BACKUP ONLY) ==========
const spellingDictionary = {
  'emial': 'email', 'emali': 'email', 'eamil': 'email', 'maiil': 'email',
  'gmial': 'gmail', 'gamil': 'gmail',
  'adress': 'address', 'addres': 'address', 'adres': 'address', 'adrees': 'address',
  'pasword': 'password', 'passwrd': 'password', 'paswrd': 'password', 'pssword': 'password',
  'frist': 'first', 'lastt': 'last', 'middel': 'middle', 'surnmae': 'surname',
  'phne': 'phone', 'mobil': 'mobile', 'telephon': 'telephone',
  'contat': 'contact', 'confrim': 'confirm', 'submt': 'submit',
  'cntry': 'country', 'citty': 'city', 'zipcde': 'zipcode', 'statte': 'state',
  // ADDED: Common day/month misspellings
  'daY': 'day', 'dya': 'day', 'daz': 'day',
  'mnth': 'month', 'mnt': 'month',
  'yr': 'year', 'yer': 'year'
};

// ========== USER PERFORMANCE TRACKING ==========
let userPerformance = {
  errors: 0,
  corrections: 0,
  startTime: Date.now(),
  fieldStats: {}
};

// ========== OFFLINE MODE DETECTION ==========
window.addEventListener('online', () => {
    offlineMode = false;
    showNotification('🌐 Back online - full features available', 'success');
    checkBackendHealth();
});

window.addEventListener('offline', () => {
    offlineMode = true;
    showNotification('📴 Offline mode - using local dictionary only', 'warning');
});

// Check backend health on startup
async function checkBackendHealth() {
    if (offlineMode) {
        backendAvailable = false;
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/api/health`);
        if (response.ok) {
            backendAvailable = true;
            console.log('✅ Connected to FormEase backend');
        } else {
            backendAvailable = false;
            console.log('⚠️ Backend not responding');
        }
    } catch (error) {
        backendAvailable = false;
        console.log('⚠️ Backend not available (using local dictionary)');
    }
}

// Call this when extension loads
checkBackendHealth();

console.log("🚀 FormEase Pro - Complete Edition with HYBRID Spell Check Loaded!");

// ========== HYBRID SPELL CHECKER CLASS (API + Dictionary) ==========
class HybridSpellChecker {
  constructor() {
    this.cache = new Map();           // Store previous results
    this.pendingChecks = new Map();   // Avoid duplicate API calls
    this.dictionary = spellingDictionary; // Your existing dictionary
    this.lastCallTime = 0;
    this.minDelay = 300; // 300ms between API calls (respect rate limits)
    this.apiFailures = 0;
    this.useApi = true; // Toggle API on/off based on failures
    this.maxCacheSize = 100; // Prevent memory leaks
    
    // Periodic cache cleanup
    setInterval(() => this.cleanCache(), 300000); // Clean every 5 minutes
  }
  
  // Clean cache to prevent memory leaks
  cleanCache() {
    if (this.cache.size > this.maxCacheSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, this.cache.size - this.maxCacheSize);
      keysToDelete.forEach(key => this.cache.delete(key));
      console.log(`🧹 Cache cleaned, now ${this.cache.size} items`);
    }
  }
  
  // Main method to check spelling
  async check(word, inputElement = null) {
    // Clean the word
    word = word.toLowerCase().trim().replace(/[.,!?;:]$/, '');
    
    // Skip short words
    if (word.length < 3 || /^\d+$/.test(word)) return null;
    
    // STEP 1: Check local cache (instant)
    if (this.cache.has(word)) {
      console.log(`Cache hit for: ${word}`);
      return this.cache.get(word);
    }
    
    // STEP 2: Check dictionary (instant, offline)
    if (this.dictionary[word]) {
      const result = {
        correct: this.dictionary[word],
        source: 'dictionary',
        confidence: 1.0
      };
      this.cache.set(word, result);
      return result;
    }
    
    // STEP 3: Try API if online and API is enabled
    if (!offlineMode && navigator.onLine && this.useApi) {
      // Avoid duplicate API calls for same word
      if (this.pendingChecks.has(word)) {
        return this.pendingChecks.get(word);
      }
      
      // Rate limiting
      const now = Date.now();
      if (now - this.lastCallTime < this.minDelay) {
        await new Promise(resolve => setTimeout(resolve, this.minDelay));
      }
      this.lastCallTime = Date.now();
      
      // Create promise for this check
      const promise = this._checkWithAPI(word);
      this.pendingChecks.set(word, promise);
      
      try {
        const result = await promise;
        this.pendingChecks.delete(word);
        
        if (result) {
          this.cache.set(word, result);
          this.apiFailures = 0; // Reset failures on success
          return result;
        } else {
          // API returned no result
          this.apiFailures++;
          if (this.apiFailures > 5) {
            console.log("Too many API failures, disabling temporarily");
            this.useApi = false;
            setTimeout(() => { this.useApi = true; }, 60000); // Try again after 1 minute
          }
        }
      } catch (error) {
        console.log("API error:", error);
        this.pendingChecks.delete(word);
        this.apiFailures++;
      }
    }
    
    // STEP 4: No suggestion found
    return null;
  }
  
  // API call to Datamuse (free, no key required)
  async _checkWithAPI(word) {
    try {
      // Using Datamuse API - completely free, no rate limits mentioned
      const response = await fetch(
        `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=3&md=s`
      );
      
      if (!response.ok) {
        throw new Error(`API responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        // Find the best suggestion (not exact match)
        for (let item of data) {
          if (item.word.toLowerCase() !== word) {
            // Calculate confidence based on score (if available)
            const confidence = item.score ? Math.min(item.score / 10000, 0.95) : 0.8;
            
            return {
              correct: item.word,
              source: 'api',
              confidence: confidence,
              alternatives: data.slice(0, 3).map(i => i.word)
            };
          }
        }
      }
      
      // Try fuzzy match as fallback
      const fuzzyResponse = await fetch(
        `https://api.datamuse.com/words?s=${encodeURIComponent(word)}&max=3`
      );
      
      const fuzzyData = await fuzzyResponse.json();
      
      if (fuzzyData && fuzzyData.length > 0) {
        for (let item of fuzzyData) {
          if (item.word.toLowerCase() !== word) {
            return {
              correct: item.word,
              source: 'api-fuzzy',
              confidence: 0.7
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.log("API check failed:", error);
      return null;
    }
  }
  
  // Check entire text (for future use)
  async checkText(text) {
    const words = text.split(/\s+/);
    const corrections = [];
    
    for (let word of words) {
      const result = await this.check(word);
      if (result) {
        corrections.push({
          original: word,
          ...result
        });
      }
    }
    
    return corrections;
  }
  
  // Clear cache (optional)
  clearCache() {
    this.cache.clear();
    console.log("Spell check cache cleared");
  }
}

// Initialize the spell checker
const spellChecker = new HybridSpellChecker();

// ========== ENHANCED SPELL CHECK WITH BACKEND (FIXED FOR OFFLINE) ==========
async function checkSpellingWithBackend(inputElement) {
    const userInput = inputElement.value.trim();
    
    if (!userInput || userInput.length < 3) {
        removeSuggestion(inputElement);
        inputElement.classList.remove('input-error');
        return null;
    }
    
    // Get last word
    const words = userInput.split(/\s+/);
    const lastWord = words[words.length - 1].replace(/[.,!?;:]$/, '');
    
    if (lastWord.length < 3) return null;
    
    // Try backend first (if available and not offline)
    if (!offlineMode && backendAvailable) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/spelling/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: lastWord })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.corrected && data.corrected !== lastWord) {
                    // Backend found correction
                    inputElement.classList.add('input-error');
                    
                    // Show source (backend)
                    const sourceIcon = '☁️';
                    createEnhancedSuggestion(inputElement, data.corrected, sourceIcon, data.source);
                    trackUserPerformance(inputElement, 'error');
                    
                    return data.corrected;
                }
            }
        } catch (error) {
            console.log('Backend error, using local fallback');
            backendAvailable = false; // Temporarily disable
            setTimeout(checkBackendHealth, 30000); // Try again in 30 seconds
        }
    }
    
    // Fallback to local hybrid spell checker
    const result = await spellChecker.check(lastWord);
    
    if (result) {
        inputElement.classList.add('input-error');
        createEnhancedSuggestion(inputElement, result.correct, '💻', result.source);
        trackUserPerformance(inputElement, 'error');
        return result.correct;
    }
    
    // No correction found
    inputElement.classList.remove('input-error');
    removeSuggestion(inputElement);
    return null;
}

// ========== FIXED ENHANCED SUGGESTION CREATION (NO WHITE SCREEN ISSUE) ==========
function createEnhancedSuggestion(inputElement, correctWord, icon = '☁️', source = 'backend') {
    // Remove any existing suggestion
    removeSuggestion(inputElement);
    
    const suggestionDiv = document.createElement('div');
    suggestionDiv.className = 'spelling-suggestion';
    suggestionDiv.id = 'suggestion-' + Date.now();
    
    // FIXED: Ensure proper HTML structure with clear styling
    suggestionDiv.innerHTML = `
        <span class="suggestion-text" style="color:#666; font-size:12px;">Did you mean: </span>
        <strong class="spelling-suggestion-word" style="color:#27ae60 !important; cursor:pointer !important; text-decoration:underline !important; font-weight:bold !important; padding:2px 4px !important; background-color:transparent !important; display:inline-block !important;">${correctWord}</strong>
        <span style="font-size:10px; color:#999; margin-left:5px;" title="Source: ${source}">${icon}</span>
    `;
    
    // Style the container
    Object.assign(suggestionDiv.style, {
        fontSize: '12px',
        marginTop: '5px',
        padding: '8px 12px',
        background: '#f8fff9',
        borderRadius: '6px',
        border: '1px solid #27ae60',
        borderLeft: '4px solid #27ae60',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        animation: 'fadeIn 0.3s ease-in',
        position: 'relative',
        zIndex: '10000',
        pointerEvents: 'auto',
        display: 'block',
        width: '100%',
        boxSizing: 'border-box'
    });
    
    // Get the green word element
    const greenWord = suggestionDiv.querySelector('.spelling-suggestion-word');
    
    if (!greenWord) {
        console.error("Failed to create suggestion word element");
        return null;
    }
    
    // DIRECT CLICK HANDLER - FIXED to prevent white screen
    greenWord.onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        console.log("✅ Green word clicked:", correctWord);
        
        // Store wrong word for learning
        const wrongWord = inputElement.value;
        
        // Apply correction
        inputElement.value = correctWord;
        inputElement.classList.remove('input-error');
        
        // Remove suggestion with animation
        suggestionDiv.style.opacity = '0';
        suggestionDiv.style.transform = 'translateY(-10px)';
        suggestionDiv.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
            if (suggestionDiv.parentNode) {
                suggestionDiv.parentNode.removeChild(suggestionDiv);
            }
        }, 300);
        
        // Track performance
        trackUserPerformance(inputElement, 'correction');
        
        // Send to backend for learning (if online)
        if (!offlineMode && backendAvailable) {
            fetch(`${BACKEND_URL}/api/spelling/learn`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wrong: wrongWord,
                    correct: correctWord
                })
            }).catch(() => {});
        }
        
        // Focus on input
        inputElement.focus();
        
        // Speak if TTS enabled
        if (ttsEnabled) {
            speakText(`Corrected to ${correctWord}`);
        }
    };
    
    // Add hover effect
    greenWord.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#e8f5e9';
    });
    
    greenWord.addEventListener('mouseleave', function() {
        this.style.backgroundColor = 'transparent';
    });
    
    // Insert after input
    if (inputElement.nextElementSibling) {
        inputElement.parentNode.insertBefore(suggestionDiv, inputElement.nextElementSibling);
    } else {
        inputElement.parentNode.appendChild(suggestionDiv);
    }
    
    // Speak suggestion if TTS enabled
    if (ttsEnabled) {
        setTimeout(() => {
            speakText(`Did you mean ${correctWord}?`);
        }, 500);
    }
    
    console.log(`✅ Suggestion created: ${correctWord}`);
    return suggestionDiv;
}

// ========== TTS FUNCTION ==========
function speakText(text) {
  if (!ttsEnabled || !('speechSynthesis' in window)) return;
  
  const now = Date.now();
  if (now - lastSpokenTime < SPEECH_COOLDOWN) return;
  
  window.speechSynthesis.cancel();
  
  setTimeout(() => {
    lastSpokenTime = Date.now();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate;
    utterance.volume = 0.8;
    
    utterance.onerror = function() {
      lastSpokenTime = 0;
    };
    
    window.speechSynthesis.speak(utterance);
  }, 50);
}

// ========== CLICK HANDLER FOR SUGGESTIONS ==========
let isProcessingClick = false;

function handleSuggestionClick(event) {
  if (isProcessingClick) return;
  
  let target = event.target;
  
  const isSuggestionWord = target.classList && 
    target.classList.contains('spelling-suggestion-word');
  
  if (!isSuggestionWord) return;
  
  event.preventDefault();
  event.stopPropagation();
  isProcessingClick = true;
  
  console.log("✅ Green word clicked in handler:", target.textContent);
  
  const suggestionDiv = target.closest('.spelling-suggestion');
  if (!suggestionDiv) {
    isProcessingClick = false;
    return;
  }
  
  let inputField = suggestionDiv.previousElementSibling;
  
  if (!inputField || (inputField.tagName !== 'INPUT' && inputField.tagName !== 'TEXTAREA')) {
    let sibling = suggestionDiv.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === 'INPUT' || sibling.tagName === 'TEXTAREA') {
        inputField = sibling;
        break;
      }
      sibling = sibling.previousElementSibling;
    }
  }
  
  if (!inputField || (inputField.tagName !== 'INPUT' && inputField.tagName !== 'TEXTAREA')) {
    console.error("❌ Could not find input field for suggestion");
    isProcessingClick = false;
    return;
  }
  
  const correctWord = target.textContent.trim();
  const wrongWord = inputField.value.trim();
  
  inputField.value = correctWord;
  inputField.classList.remove('input-error');
  
  trackUserPerformance(inputField, 'correction');
  
  inputField.focus();
  
  suggestionDiv.style.opacity = '0';
  suggestionDiv.style.transform = 'translateY(-10px)';
  suggestionDiv.style.transition = 'all 0.3s ease';
  
  setTimeout(() => {
    if (suggestionDiv.parentNode) {
      suggestionDiv.parentNode.removeChild(suggestionDiv);
    }
    isProcessingClick = false;
  }, 300);
  
  if (ttsEnabled) {
    setTimeout(() => {
      speakText(`Corrected to ${correctWord}`);
    }, 200);
  }
  
  console.log(`Applied correction: ${correctWord} to field`);
}

// ========== SETUP CLICK DELEGATION ==========
function setupEventDelegation() {
  document.addEventListener('click', handleSuggestionClick, true);
  console.log("Event delegation setup with capture phase");
}

// ========== SPELLING CHECK FUNCTION (USING HYBRID) ==========
let spellCheckTimeouts = new Map();

async function checkSpelling(inputElement) {
  return await checkSpellingWithBackend(inputElement);
}

// Loading indicator functions
function showLoadingIndicator(inputElement) {
  if (!inputElement.parentNode.querySelector('.spell-check-loading')) {
    const loader = document.createElement('span');
    loader.className = 'spell-check-loading';
    loader.textContent = '🔍';
    loader.style.cssText = `
      position: absolute;
      right: 35px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 12px;
      opacity: 0.6;
      animation: pulse 1s infinite;
    `;
    
    if (getComputedStyle(inputElement.parentNode).position === 'static') {
      inputElement.parentNode.style.position = 'relative';
    }
    
    inputElement.parentNode.appendChild(loader);
  }
}

function hideLoadingIndicator(inputElement) {
  const loader = inputElement.parentNode.querySelector('.spell-check-loading');
  if (loader) loader.remove();
}

function findSuggestionForInput(inputElement) {
  let sibling = inputElement.nextElementSibling;
  while (sibling) {
    if (sibling.classList && sibling.classList.contains('spelling-suggestion')) {
      return sibling;
    }
    sibling = sibling.nextElementSibling;
  }
  return null;
}

function removeSuggestion(inputElement) {
  const suggestion = findSuggestionForInput(inputElement);
  if (suggestion) {
    suggestion.style.opacity = '0';
    suggestion.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (suggestion.parentNode) {
        suggestion.parentNode.removeChild(suggestion);
      }
    }, 300);
  }
}

function updateSuggestion(suggestionDiv, correctWord, source = '') {
  const strongElement = suggestionDiv.querySelector('strong');
  const sourceElement = suggestionDiv.querySelector('.suggestion-source');
  
  if (strongElement) {
    strongElement.textContent = correctWord;
  }
  
  if (sourceElement) {
    sourceElement.textContent = source ? `(${source})` : '';
  }
}

function createSuggestion(inputElement, correctWord, source = '') {
  createEnhancedSuggestion(inputElement, correctWord, source === 'api' ? '☁️' : '💻', source);
}

// ========== GRAMMAR CHECK CONFIG ==========
let grammarCheckTimeouts = new Map();

// ========== GRAMMAR CHECK FUNCTION ==========
async function checkGrammar(inputElement) {
    const text = inputElement.value.trim();
    
    if (!text || text.length < 10) return null; // Only check sentences
    
    // Don't check if last keystroke was recent
    const now = Date.now();
    if (grammarCheckTimeouts.has(inputElement)) {
        clearTimeout(grammarCheckTimeouts.get(inputElement));
    }
    
    // Check if backend is available and not offline
    if (offlineMode || !backendAvailable) return null;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/grammar/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (data.corrections && data.corrections.length > 0) {
            // Show grammar suggestions in orange color
            showGrammarSuggestions(inputElement, data.corrections, data.corrected);
            return data.corrections;
        } else {
            // Remove grammar highlights if no errors
            removeGrammarHighlights(inputElement);
        }
        
    } catch (error) {
        console.log('Grammar check error:', error);
    }
    
    return null;
}

// ========== SHOW GRAMMAR SUGGESTIONS ==========
function showGrammarSuggestions(inputElement, corrections, correctedText) {
    // Remove old grammar highlights
    removeGrammarHighlights(inputElement);
    
    // Create grammar suggestion div
    const grammarDiv = document.createElement('div');
    grammarDiv.className = 'grammar-suggestion';
    grammarDiv.id = 'grammar-' + Date.now();
    
    let html = `
        <div style="margin-bottom:5px; color:#e67e22; font-weight:bold;">📝 Grammar Suggestions:</div>
    `;
    
    corrections.forEach((corr, index) => {
        const suggestionText = corr.suggestions.length > 0 
            ? corr.suggestions[0] 
            : '[no suggestion]';
        
        html += `
            <div class="grammar-item" data-correction='${JSON.stringify(corr)}' style="
                padding:8px;
                margin-bottom:5px;
                background:#fef5e7;
                border-left:3px solid #e67e22;
                border-radius:3px;
                cursor:pointer;
                font-size:12px;
                transition:all 0.2s;
            ">
                <div style="font-weight:600; color:#e67e22;">⚠️ ${corr.message}</div>
                <div style="margin-top:3px;">
                    <span style="color:#999;">Suggestion:</span>
                    <strong style="color:#e67e22; text-decoration:underline; margin-left:5px;">${suggestionText}</strong>
                </div>
            </div>
        `;
    });
    
    html += `
        <div style="margin-top:8px; text-align:right;">
            <button class="grammar-fix-all" style="
                background:#e67e22;
                color:white;
                border:none;
                padding:5px 10px;
                border-radius:3px;
                font-size:11px;
                cursor:pointer;
                margin-right:5px;
            ">Fix All</button>
            <button class="grammar-ignore" style="
                background:#95a5a6;
                color:white;
                border:none;
                padding:5px 10px;
                border-radius:3px;
                font-size:11px;
                cursor:pointer;
            ">Ignore</button>
        </div>
    `;
    
    grammarDiv.innerHTML = html;
    
    // Style the container
    Object.assign(grammarDiv.style, {
        fontSize: '12px',
        marginTop: '8px',
        padding: '12px',
        background: '#fff9f0',
        borderRadius: '8px',
        border: '2px solid #e67e22',
        boxShadow: '0 4px 8px rgba(230,126,34,0.2)',
        animation: 'fadeIn 0.3s ease',
        position: 'relative',
        zIndex: '10001'
    });
    
    // Add click handlers
    grammarDiv.querySelectorAll('.grammar-item').forEach((item, index) => {
        item.addEventListener('click', function() {
            const correction = JSON.parse(this.dataset.correction);
            if (correction.suggestions.length > 0) {
                // Replace the text
                const before = inputElement.value.substring(0, correction.offset);
                const after = inputElement.value.substring(correction.offset + correction.length);
                inputElement.value = before + correction.suggestions[0] + after;
                
                // Remove this item
                this.remove();
                
                // If no more items, remove entire div
                if (grammarDiv.querySelectorAll('.grammar-item').length === 0) {
                    grammarDiv.remove();
                }
            }
        });
        
        item.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#fdedd7';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#fef5e7';
        });
    });
    
    // Fix all button
    grammarDiv.querySelector('.grammar-fix-all')?.addEventListener('click', function() {
        inputElement.value = correctedText;
        grammarDiv.remove();
    });
    
    // Ignore button
    grammarDiv.querySelector('.grammar-ignore')?.addEventListener('click', function() {
        grammarDiv.remove();
    });
    
    // Insert after input
    if (inputElement.nextElementSibling) {
        inputElement.parentNode.insertBefore(grammarDiv, inputElement.nextElementSibling);
    } else {
        inputElement.parentNode.appendChild(grammarDiv);
    }
}

// ========== REMOVE GRAMMAR HIGHLIGHTS ==========
function removeGrammarHighlights(inputElement) {
    const existing = inputElement.parentNode.querySelector('.grammar-suggestion');
    if (existing) existing.remove();
}

// ========== 🔥 COMPLETELY REWRITTEN FIELD VALIDATION - NO MORE PHONE ERRORS ==========

/**
 * ULTIMATE FIX: Properly identifies field types with 100% accuracy
 * No more phone validation on year fields!
 */
function getFieldType(field) {
  // ===== STEP 1: Check by type attribute (most reliable) =====
  if (field.type) {
    const type = field.type.toLowerCase();
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    if (type === 'password') return 'password';
  }
  
  // ===== STEP 2: Collect ALL possible identifiers =====
  const name = (field.name || '').toLowerCase();
  const id = (field.id || '').toLowerCase();
  const placeholder = (field.placeholder || '').toLowerCase();
  const className = (field.className || '').toLowerCase();
  const ariaLabel = (field.getAttribute('aria-label') || '').toLowerCase();
  const title = (field.title || '').toLowerCase();
  
  // Get label text if exists
  let labelText = '';
  if (field.labels && field.labels.length > 0) {
    labelText = field.labels[0].textContent.toLowerCase();
  }
  
  // Get parent element text for additional context
  let parentText = '';
  if (field.parentElement) {
    parentText = field.parentElement.textContent.toLowerCase();
  }
  
  // Combine ALL text for comprehensive analysis
  const allText = `${name} ${id} ${placeholder} ${className} ${ariaLabel} ${title} ${labelText} ${parentText}`;
  
  // Debug log to see what we're analyzing
  console.log(`🔍 Analyzing field: "${allText.substring(0, 100)}..."`);
  
  // ===== STEP 3: Check for YEAR first (CRITICAL - must come before phone) =====
  // Look for specific year-related keywords
  const yearPatterns = [
    /\byear\b/,           // exact word "year"
    /\byyyy\b/,           // "yyyy"
    /\byy\b/,             // "yy" as whole word
    /[^\w]yr[^\w]/,       // "yr" as separate word
    /^year$/i,            // exactly "year"
    /birth\s*year/i,      // "birth year"
    /graduation\s*year/i, // "graduation year"
  ];
  
  for (let pattern of yearPatterns) {
    if (pattern.test(allText)) {
      console.log('✅ DETECTED: YEAR field');
      return 'year';
    }
  }
  
  // Check for "year" in placeholder specifically (common case)
  if (placeholder.includes('year') || placeholder.includes('yyyy') || placeholder === 'yy') {
    console.log('✅ DETECTED: YEAR field from placeholder');
    return 'year';
  }
  
  // ===== STEP 4: Check for MONTH =====
  const monthPatterns = [
    /\bmonth\b/,          // exact word "month"
    /\bmm\b/,             // "mm" as whole word
    /[^\w]mon[^\w]/,      // "mon" as separate word
    /^month$/i,           // exactly "month"
    /birth\s*month/i,     // "birth month"
  ];
  
  for (let pattern of monthPatterns) {
    if (pattern.test(allText)) {
      console.log('✅ DETECTED: MONTH field');
      return 'month';
    }
  }
  
  if (placeholder.includes('month') || placeholder.includes('mm')) {
    console.log('✅ DETECTED: MONTH field from placeholder');
    return 'month';
  }
  
  // ===== STEP 5: Check for DAY =====
  const dayPatterns = [
    /\bday\b/,            // exact word "day"
    /\bdd\b/,             // "dd" as whole word
    /^day$/i,             // exactly "day"
    /birth\s*day/i,       // "birth day" but not "birthday"
  ];
  
  for (let pattern of dayPatterns) {
    if (pattern.test(allText) && 
        !allText.includes('birthday') && 
        !allText.includes('today') && 
        !allText.includes('weekday') && 
        !allText.includes('sunday') && 
        !allText.includes('monday') && 
        !allText.includes('tuesday') && 
        !allText.includes('wednesday') && 
        !allText.includes('thursday') && 
        !allText.includes('friday') && 
        !allText.includes('saturday')) {
      console.log('✅ DETECTED: DAY field');
      return 'day';
    }
  }
  
  if ((placeholder.includes('day') || placeholder.includes('dd')) && 
      !placeholder.includes('birthday') && 
      !placeholder.includes('today')) {
    console.log('✅ DETECTED: DAY field from placeholder');
    return 'day';
  }
  
  // ===== STEP 6: Check for DATE (full date) =====
  if (allText.includes('date') || 
      allText.includes('dob') || 
      allText.includes('birth') ||
      placeholder.includes('dd/mm') ||
      placeholder.includes('mm/dd') ||
      placeholder.includes('yyyy-mm-dd')) {
    console.log('✅ DETECTED: DATE field');
    return 'date';
  }
  
  // ===== STEP 7: Check for EMAIL =====
  if (allText.includes('email') || 
      allText.includes('e-mail') || 
      allText.includes('mail') ||
      field.type === 'email') {
    console.log('✅ DETECTED: EMAIL field');
    return 'email';
  }
  
  // ===== STEP 8: Check for PHONE - ONLY AFTER ensuring it's not a year/month/day =====
  // IMPORTANT: Phone detection should be AFTER year/month/day checks
  const phonePatterns = [
    /\bphone\b/,
    /\bmobile\b/,
    /\btel\b/,
    /\btelephone\b/,
    /\bcell\b/,
    /\bcontact\s*number\b/,
    /^phone$/i,
  ];
  
  for (let pattern of phonePatterns) {
    if (pattern.test(allText)) {
      console.log('✅ DETECTED: PHONE field');
      return 'tel';
    }
  }
  
  // Check for phone in placeholder
  if (placeholder.includes('phone') || 
      placeholder.includes('mobile') || 
      placeholder.includes('tel') ||
      placeholder.includes('(123)') ||
      placeholder.includes('123-')) {
    console.log('✅ DETECTED: PHONE field from placeholder');
    return 'tel';
  }
  
  // ===== STEP 9: Check for PASSWORD =====
  if (allText.includes('password') || 
      allText.includes('pass') || 
      allText.includes('pwd') ||
      field.type === 'password') {
    console.log('✅ DETECTED: PASSWORD field');
    return 'password';
  }
  
  // ===== STEP 10: Check for ZIP/POSTAL =====
  if (allText.includes('zip') || 
      allText.includes('postal') || 
      allText.includes('pincode') || 
      allText.includes('pin code')) {
    console.log('✅ DETECTED: ZIP field');
    return 'zip';
  }
  
  // ===== STEP 11: Default =====
  console.log('✅ DETECTED: TEXT field (default)');
  return 'text';
}

/**
 * FIXED: Phone validation - will NEVER trigger on year fields
 */
function validatePhone(phone) {
  // SAFETY CHECK: If it's 1-4 digits, it's definitely NOT a phone number
  // This protects against year fields (2024 is 4 digits)
  if (phone.length <= 4 && /^\d+$/.test(phone)) {
    console.log(`📱 Skipping phone validation for short number: "${phone}" (likely year/day)`);
    return true; // Skip validation - this is probably a year or day
  }
  
  // Remove all non-digit characters except + at beginning
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Allow + at beginning, then 10-15 digits
  const isValid = /^\+?\d{10,15}$/.test(cleaned);
  
  console.log(`📱 Phone validation: "${phone}" -> ${isValid ? 'valid' : 'invalid'}`);
  return isValid;
}

/**
 * FIXED: Year validation - handles 2-digit and 4-digit years
 */
function validateYear(year) {
  const cleaned = year.replace(/\D/g, '');
  if (!cleaned) return false;
  
  const yearNum = parseInt(cleaned, 10);
  const currentYear = new Date().getFullYear();
  
  // Handle 2-digit years (e.g., 24 -> 2024)
  if (cleaned.length === 2) {
    const twoDigitYear = 2000 + yearNum;
    const isValid = twoDigitYear >= 2000 && twoDigitYear <= currentYear + 10;
    console.log(`📅 Year validation (2-digit): ${year} -> ${twoDigitYear} -> ${isValid}`);
    return isValid;
  }
  
  // Handle 4-digit years
  const isValid = !isNaN(yearNum) && yearNum >= 1900 && yearNum <= currentYear + 10;
  console.log(`📅 Year validation (4-digit): ${year} -> ${isValid}`);
  return isValid;
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  return password.length >= 8 && 
         /[a-zA-Z]/.test(password) && 
         /\d/.test(password);
}

function validateZipCode(zip) {
  return /^[A-Z0-9\s\-]{4,10}$/i.test(zip);
}

function validateDate(date) {
  const patterns = [
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/
  ];
  return patterns.some(pattern => pattern.test(date));
}

function validateDay(day) {
  // Remove any non-digit characters
  const cleaned = day.replace(/\D/g, '');
  if (!cleaned) return false;
  
  const dayNum = parseInt(cleaned, 10);
  return !isNaN(dayNum) && dayNum >= 1 && dayNum <= 31;
}

function validateMonth(month) {
  // Handle text months as well
  const monthLower = month.toLowerCase().trim();
  const monthMap = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
  };
  
  // Check if it's text month
  if (monthMap[monthLower]) return true;
  
  // Check if it's number
  const cleaned = month.replace(/\D/g, '');
  if (!cleaned) return false;
  
  const monthNum = parseInt(cleaned, 10);
  return !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12;
}

/**
 * FIXED: Main validation function with proper year handling
 */
function validateField(field) {
  const fieldType = getFieldType(field);
  const value = field.value.trim();
  
  console.log(`🔍 Validating field: type=${fieldType}, value="${value}"`);
  
  field.classList.remove('input-error', 'input-success', 'input-warning');
  removeValidationMessage(field);
  
  if (!value) return true;
  
  let isValid = true;
  let message = '';
  
  switch(fieldType) {
    case 'email':
      if (!validateEmail(value)) {
        isValid = false;
        message = 'Please enter a valid email address (example: name@domain.com)';
      } else {
        field.classList.add('input-success');
      }
      break;
      
    case 'tel':
    case 'phone':
      // EXTREME SAFETY: If it's 1-4 digits, it's NOT a phone (probably year)
      if (value.length <= 4 && /^\d+$/.test(value)) {
        console.log(`📱 Field identified as phone but value "${value}" looks like a year - skipping validation`);
        field.classList.add('input-success');
        break;
      }
      if (!validatePhone(value)) {
        isValid = false;
        message = 'Please enter a valid phone number (10-15 digits, may include +)';
      } else {
        field.classList.add('input-success');
      }
      break;
      
    case 'password':
      if (!validatePassword(value)) {
        isValid = false;
        message = 'Password should be at least 8 characters with letters and numbers';
      } else {
        field.classList.add('input-success');
      }
      break;
      
    case 'zip':
    case 'zipcode':
    case 'postal':
      if (!validateZipCode(value)) {
        isValid = false;
        message = 'Please enter a valid postal/zip code';
      } else {
        field.classList.add('input-success');
      }
      break;
      
    case 'date':
      if (!validateDate(value)) {
        isValid = false;
        message = 'Please enter date in format: DD/MM/YYYY or YYYY-MM-DD';
      } else {
        field.classList.add('input-success');
      }
      break;
      
    case 'day':
      if (!validateDay(value)) {
        isValid = false;
        message = 'Please enter a valid day (1-31)';
      } else {
        field.classList.add('input-success');
      }
      break;
      
    case 'month':
      if (!validateMonth(value)) {
        isValid = false;
        message = 'Please enter a valid month (1-12 or Jan-Dec)';
      } else {
        field.classList.add('input-success');
      }
      break;
      
    case 'year':
      if (!validateYear(value)) {
        const currentYear = new Date().getFullYear();
        isValid = false;
        message = `Please enter a valid year (1900-${currentYear + 10} or 2-digit year)`;
      } else {
        field.classList.add('input-success');
        console.log('✅ Year validation passed');
      }
      break;
      
    // Default case - no validation needed
    default:
      field.classList.add('input-success');
      break;
  }
  
  if (!isValid) {
    field.classList.add('input-error');
    showValidationMessage(field, message);
    trackUserPerformance(field, 'error');
    
    if (ttsEnabled) {
      setTimeout(() => {
        speakText(`Validation error: ${message}`);
      }, 300);
    }
  }
  
  return isValid;
}

function showValidationMessage(field, message) {
  removeValidationMessage(field);
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'validation-message';
  msgDiv.textContent = message;
  
  Object.assign(msgDiv.style, {
    fontSize: '11px',
    color: '#e74c3c',
    marginTop: '3px',
    padding: '5px 8px',
    background: '#fff5f5',
    borderRadius: '3px',
    borderLeft: '3px solid #e74c3c',
    animation: 'fadeIn 0.3s ease'
  });
  
  if (field.nextElementSibling) {
    field.parentNode.insertBefore(msgDiv, field.nextElementSibling);
  } else {
    field.parentNode.appendChild(msgDiv);
  }
}

function removeValidationMessage(field) {
  const nextSibling = field.nextElementSibling;
  if (nextSibling && nextSibling.classList && 
      nextSibling.classList.contains('validation-message')) {
    nextSibling.remove();
  }
}

// Helper function to add hint for date fields
function addDateFieldHint(field) {
  const fieldType = getFieldType(field);
  if (fieldType === 'day' && !field.placeholder) {
    field.placeholder = 'DD (1-31)';
  } else if (fieldType === 'month' && !field.placeholder) {
    field.placeholder = 'MM (1-12)';
  } else if (fieldType === 'year' && !field.placeholder) {
    field.placeholder = 'YYYY';
  }
}

// ========== PROGRESS TRACKING ==========
function createProgressIndicator(form) {
  if (form.querySelector('.form-progress')) return;
  
  const progressDiv = document.createElement('div');
  progressDiv.className = 'form-progress';
  
  Object.assign(progressDiv.style, {
    position: 'relative',
    marginBottom: '15px',
    padding: '10px',
    background: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #ddd'
  });
  
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  
  Object.assign(progressBar.style, {
    height: '6px',
    background: '#27ae60',
    borderRadius: '3px',
    width: '0%',
    transition: 'width 0.5s ease'
  });
  
  const progressText = document.createElement('div');
  progressText.className = 'progress-text';
  progressText.textContent = 'Progress: 0%';
  
  Object.assign(progressText.style, {
    fontSize: '12px',
    color: '#666',
    marginTop: '5px',
    fontWeight: 'bold'
  });
  
  progressDiv.appendChild(progressBar);
  progressDiv.appendChild(progressText);
  
  if (form.firstChild) {
    form.insertBefore(progressDiv, form.firstChild);
  } else {
    form.appendChild(progressDiv);
  }
}

function updateFormProgress(form) {
  const fields = form.querySelectorAll('input, textarea, select');
  const filledFields = Array.from(fields).filter(field => {
    return field.value && field.value.trim() !== '';
  });
  
  const progress = fields.length > 0 ? 
    Math.round((filledFields.length / fields.length) * 100) : 0;
  
  const progressBar = form.querySelector('.progress-bar');
  const progressText = form.querySelector('.progress-text');
  
  if (progressBar && progressText) {
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `Progress: ${progress}% (${filledFields.length}/${fields.length} fields)`;
    
    if (progress < 30) {
      progressBar.style.background = '#e74c3c';
    } else if (progress < 70) {
      progressBar.style.background = '#f39c12';
    } else {
      progressBar.style.background = '#27ae60';
    }
    
    if (ttsEnabled && (progress === 25 || progress === 50 || progress === 75 || progress === 100)) {
      setTimeout(() => {
        speakText(`Form is ${progress} percent complete`);
      }, 500);
    }
  }
}

// ========== USER PERFORMANCE TRACKING ==========
function trackUserPerformance(field, eventType) {
  const fieldId = field.id || field.name || `field_${Date.now()}`;
  
  if (!userPerformance.fieldStats[fieldId]) {
    userPerformance.fieldStats[fieldId] = {
      errors: 0,
      corrections: 0,
      focusCount: 0,
      lastError: null
    };
  }
  
  const stats = userPerformance.fieldStats[fieldId];
  
  switch(eventType) {
    case 'error':
      stats.errors++;
      userPerformance.errors++;
      break;
    case 'correction':
      stats.corrections++;
      userPerformance.corrections++;
      break;
    case 'focus':
      stats.focusCount++;
      break;
  }
  
  stats.lastError = eventType === 'error' ? Date.now() : stats.lastError;
  
  chrome.storage.local.set({ 'userPerformance': userPerformance });
}

function getAssistanceLevel() {
  const sessionDuration = (Date.now() - userPerformance.startTime) / 60000;
  const errorRate = userPerformance.errors / Math.max(sessionDuration, 1);
  const correctionRate = userPerformance.corrections / Math.max(userPerformance.errors, 1);
  
  if (errorRate > 2 || correctionRate < 0.3) {
    return 'high';
  } else if (errorRate < 0.5 && correctionRate > 0.7) {
    return 'low';
  }
  
  return 'medium';
}

function applyAdaptiveAssistance(field) {
  const level = getAssistanceLevel();
  
  switch(level) {
    case 'high':
      field.style.borderColor = '#e74c3c';
      field.style.boxShadow = '0 0 0 2px rgba(231, 76, 60, 0.3)';
      break;
    case 'medium':
      field.style.borderColor = '#3498db';
      field.style.boxShadow = '0 0 0 2px rgba(52, 152, 219, 0.2)';
      break;
    case 'low':
      field.style.borderColor = '#2ecc71';
      field.style.boxShadow = 'none';
      break;
  }
}

// ========== FEATURE 1: PASSWORD GENERATOR ==========
function generateStrongPassword() {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let password = '';
    
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    const allChars = uppercase + lowercase + numbers + symbols;
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

function addPasswordGeneratorButton(passwordField) {
    if (passwordField.dataset.hasGenerator) return;
    
    const container = document.createElement('div');
    container.className = 'password-generator-container';
    container.style.cssText = `
        display: flex;
        align-items: center;
        margin-top: 5px;
        gap: 8px;
    `;
    
    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'password-generator-btn';
    generateBtn.innerHTML = '🔐 Generate Strong Password';
    generateBtn.style.cssText = `
        background: #3498db;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.3s ease;
    `;
    
    const strengthIndicator = document.createElement('span');
    strengthIndicator.className = 'password-strength';
    strengthIndicator.style.cssText = `
        font-size: 11px;
        padding: 4px 8px;
        background: #f8f9fa;
        border-radius: 3px;
    `;
    
    generateBtn.addEventListener('mouseenter', () => {
        generateBtn.style.background = '#2980b9';
    });
    
    generateBtn.addEventListener('mouseleave', () => {
        generateBtn.style.background = '#3498db';
    });
    
    generateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const newPassword = generateStrongPassword();
        passwordField.value = newPassword;
        passwordField.classList.add('input-success');
        
        strengthIndicator.textContent = '✅ Strong Password Generated';
        strengthIndicator.style.background = '#d4edda';
        strengthIndicator.style.color = '#155724';
        
        if (ttsEnabled) {
            speakText('Strong password generated');
        }
        
        setTimeout(() => {
            strengthIndicator.textContent = 'Password copied to clipboard!';
            navigator.clipboard.writeText(newPassword);
        }, 1000);
    });
    
    container.appendChild(generateBtn);
    container.appendChild(strengthIndicator);
    
    passwordField.parentNode.insertBefore(container, passwordField.nextSibling);
    passwordField.dataset.hasGenerator = 'true';
}

// ========== FEATURE 2: VISUAL READING RULER ==========
let rulerElement = null;
let rulerTimeout = null;
let lastMouseY = 0;

function createReadingRuler() {
    if (rulerElement) return;
    
    rulerElement = document.createElement('div');
    rulerElement.className = 'reading-ruler';
    rulerElement.style.cssText = `
        position: fixed;
        height: 32px;
        background: rgba(255, 215, 0, 0.25);
        border-bottom: 3px solid #ffaa00;
        border-top: 3px solid #ffaa00;
        pointer-events: none;
        z-index: 999999;
        display: none;
        width: 100%;
        left: 0;
        transition: top 0.05s linear, background-color 0.3s ease;
        box-shadow: 0 4px 15px rgba(255, 170, 0, 0.3);
        backdrop-filter: blur(2px);
    `;
    
    document.body.appendChild(rulerElement);
    
    // Add a small instruction badge that appears briefly
    const instruction = document.createElement('div');
    instruction.className = 'ruler-instruction-badge';
    instruction.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2c3e50;
        color: white;
        padding: 8px 15px;
        border-radius: 30px;
        font-size: 12px;
        font-weight: bold;
        z-index: 1000000;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        border-left: 4px solid #ffaa00;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
    `;
    instruction.innerHTML = '📏 Reading Ruler Active - Move mouse to see it follow';
    document.body.appendChild(instruction);
    
    // Show instruction briefly
    setTimeout(() => {
        instruction.style.opacity = '1';
        setTimeout(() => {
            instruction.style.opacity = '0';
            setTimeout(() => instruction.remove(), 500);
        }, 3000);
    }, 500);
}

// Throttled mouse move handler for better performance
function updateRulerPosition(e) {
    if (!rulerElement || !readingRulerEnabled) return;
    
    // Throttle updates to 60fps (roughly every 16ms)
    if (rulerTimeout) return;
    
    rulerTimeout = setTimeout(() => {
        let mouseY;
        if (e) {
            mouseY = e.clientY;
        } else {
            // If no event, use last known position or center
            mouseY = lastMouseY || window.innerHeight / 2;
        }
        
        // Store last position
        lastMouseY = mouseY;
        
        // Position ruler centered on mouse
        rulerElement.style.top = `${mouseY - 16}px`; // Half of height (32px)
        rulerElement.style.display = 'block';
        
        // Add slight visual feedback when moving
        rulerElement.style.backgroundColor = 'rgba(255, 235, 150, 0.35)';
        setTimeout(() => {
            if (rulerElement) {
                rulerElement.style.backgroundColor = 'rgba(255, 215, 0, 0.25)';
            }
        }, 100);
        
        rulerTimeout = null;
    }, 16); // ~60fps
}

function toggleReadingRuler(enable) {
    readingRulerEnabled = enable;
    
    if (!rulerElement) {
        createReadingRuler();
    }
    
    if (enable) {
        // Show ruler
        rulerElement.style.display = 'block';
        
        // Position initially in the center of screen
        const centerY = window.innerHeight / 2;
        rulerElement.style.top = `${centerY - 16}px`;
        
        // Add event listeners
        document.addEventListener('mousemove', updateRulerPosition);
        document.addEventListener('scroll', () => updateRulerPosition());
        window.addEventListener('resize', () => updateRulerPosition());
        
        // Show notification
        showNotification('📏 Reading Ruler Activated - Move your mouse!', 'info');
        
        if (ttsEnabled) {
            speakText('Reading ruler activated. Move your mouse to see the guide.');
        }
    } else {
        // Hide ruler
        rulerElement.style.display = 'none';
        
        // Remove event listeners
        document.removeEventListener('mousemove', updateRulerPosition);
        document.removeEventListener('scroll', updateRulerPosition);
        window.removeEventListener('resize', updateRulerPosition);
        
        // Clear any pending timeouts
        if (rulerTimeout) {
            clearTimeout(rulerTimeout);
            rulerTimeout = null;
        }
    }
}

// ========== FEATURE 3: FORM DATA BACKUP & RECOVERY ==========
function backupFormData() {
    const forms = document.querySelectorAll('form');
    const backup = {};
    
    forms.forEach((form, formIndex) => {
        const formId = form.id || `form_${formIndex}`;
        backup[formId] = {};
        
        const fields = form.querySelectorAll('input, textarea, select');
        fields.forEach(field => {
            const fieldId = field.id || field.name || `field_${Date.now()}_${Math.random()}`;
            if (field.type !== 'password') {
                backup[formId][fieldId] = {
                    value: field.value,
                    type: field.type,
                    name: field.name
                };
            }
        });
    });
    
    chrome.storage.local.set({ 'formBackup': backup }, function() {
        console.log('✅ Form data backed up successfully');
        showNotification('Form data saved! Will restore if page refreshes', 'info');
    });
}

function restoreFormData() {
    chrome.storage.local.get(['formBackup'], function(data) {
        if (data.formBackup) {
            const backup = data.formBackup;
            
            Object.keys(backup).forEach(formId => {
                const form = document.getElementById(formId) || 
                           document.querySelector(`form[id="${formId}"]`) ||
                           document.forms[formId.split('_')[1]];
                
                if (form) {
                    Object.keys(backup[formId]).forEach(fieldId => {
                        const field = document.getElementById(fieldId) || 
                                     document.querySelector(`[name="${backup[formId][fieldId].name}"]`);
                        
                        if (field && backup[formId][fieldId].value) {
                            field.value = backup[formId][fieldId].value;
                            field.classList.add('input-success');
                        }
                    });
                }
            });
            
            showNotification('✨ Form data restored!', 'success');
            
            if (ttsEnabled) {
                speakText('Your form data has been restored');
            }
        }
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'form-notification';
    
    const colors = {
        info: { bg: '#3498db', icon: 'ℹ️' },
        success: { bg: '#27ae60', icon: '✅' },
        warning: { bg: '#f39c12', icon: '⚠️' },
        error: { bg: '#e74c3c', icon: '❌' }
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type].bg};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 100002;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: none;
    `;
    
    notification.innerHTML = `
        <span style="font-size: 18px;">${colors[type].icon}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

let backupInterval = null;

function startAutoBackup() {
    if (backupInterval) clearInterval(backupInterval);
    backupInterval = setInterval(backupFormData, 30000);
}

// ========== FEATURE 4: VOICE INPUT DICTATION (FIXED & ENHANCED) ==========
let voiceRecognition = null;
let isListening = false;
let voiceButton = null;
let activeVoiceField = null;
let voiceTimeout = null;

// Initialize speech recognition with proper configuration
function initVoiceRecognition() {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.log('❌ Speech recognition not supported in this browser');
        showNotification('❌ Voice input not supported in this browser', 'error');
        return false;
    }
    
    try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceRecognition = new SpeechRecognition();
        
        // Configure for better accuracy
        voiceRecognition.continuous = false;        // Stop after one phrase
        voiceRecognition.interimResults = false;     // Only final results
        voiceRecognition.lang = 'en-US';             // English
        voiceRecognition.maxAlternatives = 1;         // Best match only
        
        // Event handlers
        voiceRecognition.onstart = function() {
            isListening = true;
            console.log('🎤 Voice recognition started');
            
            // Update button UI if exists
            if (voiceButton) {
                voiceButton.innerHTML = '🔴';
                voiceButton.style.background = '#e74c3c';
                voiceButton.style.transform = 'translateY(-50%) scale(1.1)';
                voiceButton.style.animation = 'listeningPulse 1s infinite';
                voiceButton.title = 'Click to stop listening';
            }
            
            showNotification('🎤 Listening... Speak now', 'info');
            
            // Auto-stop after 8 seconds of silence
            if (voiceTimeout) clearTimeout(voiceTimeout);
            voiceTimeout = setTimeout(() => {
                if (isListening && voiceRecognition) {
                    console.log('🎤 Auto-stopping after timeout');
                    voiceRecognition.stop();
                }
            }, 8000);
        };
        
        voiceRecognition.onresult = function(event) {
            console.log('🎤 Voice result received:', event);
            
            // Clear timeout
            if (voiceTimeout) {
                clearTimeout(voiceTimeout);
                voiceTimeout = null;
            }
            
            // Get the transcript
            const transcript = event.results[0][0].transcript;
            console.log(`🎤 Recognized: "${transcript}"`);
            
            // Find active field or use last focused field
            const targetField = activeVoiceField || document.activeElement;
            
            if (targetField && (targetField.tagName === 'INPUT' || targetField.tagName === 'TEXTAREA')) {
                // Insert at cursor position or append
                const start = targetField.selectionStart || 0;
                const end = targetField.selectionEnd || 0;
                const currentValue = targetField.value;
                
                // Add space if needed
                const needsSpace = start > 0 && currentValue[start - 1] !== ' ';
                
                // Insert transcript at cursor position
                targetField.value = currentValue.substring(0, start) + 
                                   (needsSpace ? ' ' : '') + 
                                   transcript + ' ' + 
                                   currentValue.substring(end);
                
                // Move cursor to end of inserted text
                const newPosition = start + (needsSpace ? 1 : 0) + transcript.length + 1;
                targetField.selectionStart = targetField.selectionEnd = newPosition;
                
                // Visual feedback
                targetField.classList.add('input-success');
                targetField.style.transition = 'all 0.3s ease';
                
                showNotification(`✅ Added: "${transcript}"`, 'success');
                
                // Trigger input event for spell check
                targetField.dispatchEvent(new Event('input', { bubbles: true }));
                
                if (ttsEnabled) {
                    speakText(`Added: ${transcript}`);
                }
            } else {
                showNotification('❌ No text field focused', 'warning');
            }
            
            // Automatically stop after getting result
            setTimeout(() => {
                if (isListening && voiceRecognition) {
                    voiceRecognition.stop();
                }
            }, 500);
        };
        
        voiceRecognition.onerror = function(event) {
            console.error('🎤 Speech recognition error:', event.error);
            
            if (voiceTimeout) {
                clearTimeout(voiceTimeout);
                voiceTimeout = null;
            }
            
            let errorMessage = 'Voice input error';
            switch(event.error) {
                case 'no-speech':
                    errorMessage = 'No speech detected. Please try again.';
                    break;
                case 'audio-capture':
                    errorMessage = 'Microphone not found. Check your microphone.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Microphone access denied. Please allow access.';
                    break;
                case 'network':
                    errorMessage = 'Network error. Check your connection.';
                    break;
                case 'aborted':
                    errorMessage = 'Voice input was stopped.';
                    break;
                default:
                    errorMessage = `Error: ${event.error}`;
            }
            
            showNotification(`❌ ${errorMessage}`, 'error');
            isListening = false;
            
            // Reset button
            if (voiceButton) {
                voiceButton.innerHTML = '🎤';
                voiceButton.style.background = '#3498db';
                voiceButton.style.transform = 'translateY(-50%) scale(1)';
                voiceButton.style.animation = 'none';
                voiceButton.title = 'Click to speak';
            }
        };
        
        voiceRecognition.onend = function() {
            console.log('🎤 Voice recognition ended');
            isListening = false;
            
            if (voiceTimeout) {
                clearTimeout(voiceTimeout);
                voiceTimeout = null;
            }
            
            // Reset button
            if (voiceButton) {
                voiceButton.innerHTML = '🎤';
                voiceButton.style.background = '#3498db';
                voiceButton.style.transform = 'translateY(-50%) scale(1)';
                voiceButton.style.animation = 'none';
                voiceButton.title = 'Click to speak';
            }
            
            activeVoiceField = null;
        };
        
        console.log('✅ Voice recognition initialized successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to initialize voice recognition:', error);
        showNotification('❌ Voice input initialization failed', 'error');
        return false;
    }
}

// Toggle voice input with better feedback
function toggleVoiceInput() {
    console.log('🎤 Toggle voice input called, current state:', isListening);
    
    // Check if browser supports speech recognition
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showNotification('❌ Voice input is not supported in your browser', 'error');
        console.error('Speech recognition not supported');
        return;
    }
    
    // Initialize if not already done
    if (!voiceRecognition) {
        const initialized = initVoiceRecognition();
        if (!initialized) return;
    }
    
    // Store the currently focused field
    activeVoiceField = document.activeElement;
    
    if (isListening) {
        // Stop listening
        try {
            voiceRecognition.stop();
            showNotification('🛑 Listening stopped', 'info');
        } catch (error) {
            console.error('Error stopping voice recognition:', error);
        }
    } else {
        // Check if there's a focused text field
        const activeField = document.activeElement;
        if (!activeField || (activeField.tagName !== 'INPUT' && activeField.tagName !== 'TEXTAREA')) {
            showNotification('⚠️ Click on a text field first', 'warning');
            return;
        }
        
        // Check if field is appropriate for voice input
        if (activeField.type === 'password') {
            showNotification('⚠️ Voice input not available for password fields', 'warning');
            return;
        }
        
        // Try to start listening
        try {
            voiceRecognition.start();
            console.log('🎤 Voice recognition start command sent');
        } catch (error) {
            console.error('Error starting voice recognition:', error);
            
            // If already started, try to restart
            if (error.message && error.message.includes('started')) {
                try {
                    voiceRecognition.stop();
                    setTimeout(() => {
                        voiceRecognition.start();
                    }, 200);
                } catch (e) {
                    console.error('Failed to restart:', e);
                    showNotification('❌ Failed to start voice input', 'error');
                }
            } else {
                showNotification('❌ Failed to start voice input', 'error');
            }
        }
    }
}

// Enhanced voice button with better UI and positioning
function addVoiceInputButton(field) {
    if (field.dataset.hasVoiceButton === 'true') return;
    
    // Don't add to password fields
    if (field.type === 'password') return;
    
    // Create container for better positioning
    const container = document.createElement('div');
    container.className = 'voice-input-container';
    container.style.cssText = `
        position: relative;
        display: inline-block;
        width: 0;
        height: 0;
        overflow: visible;
        z-index: 10000;
    `;
    
    // Create the button
    const voiceBtn = document.createElement('button');
    voiceBtn.type = 'button';
    voiceBtn.className = 'voice-input-btn';
    voiceBtn.innerHTML = '🎤';
    voiceBtn.title = 'Click to use voice input (speak into this field)';
    
    voiceBtn.style.cssText = `
        position: absolute;
        right: -45px;
        top: 50%;
        transform: translateY(-50%);
        background: #3498db;
        color: white;
        border: none;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(52, 152, 219, 0.5);
        z-index: 10001;
        border: 2px solid white;
    `;
    
    // Add hover effects
    voiceBtn.addEventListener('mouseenter', () => {
        if (!isListening || voiceButton !== voiceBtn) {
            voiceBtn.style.background = '#2980b9';
            voiceBtn.style.transform = 'translateY(-50%) scale(1.15)';
            voiceBtn.style.boxShadow = '0 6px 16px rgba(52, 152, 219, 0.7)';
        }
    });
    
    voiceBtn.addEventListener('mouseleave', () => {
        if (!isListening || voiceButton !== voiceBtn) {
            voiceBtn.style.background = '#3498db';
            voiceBtn.style.transform = 'translateY(-50%) scale(1)';
            voiceBtn.style.boxShadow = '0 4px 12px rgba(52, 152, 219, 0.5)';
        }
    });
    
    // Click handler
    voiceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🎤 Voice button clicked for field:', field);
        
        // Store reference to this button
        voiceButton = voiceBtn;
        
        // Focus the field
        field.focus();
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Toggle voice input
        toggleVoiceInput();
    });
    
    // Add to page
    container.appendChild(voiceBtn);
    
    // Position relative to field
    if (getComputedStyle(field.parentNode).position === 'static') {
        field.parentNode.style.position = 'relative';
    }
    
    field.parentNode.appendChild(container);
    field.dataset.hasVoiceButton = 'true';
    field.dataset.voiceButtonId = 'voice-' + Date.now();
    
    console.log('✅ Voice button added to field:', field);
}

// ========== FEATURE 5: COLOR THEME CUSTOMIZATION ==========
const themes = {
    default: {
        name: 'Default',
        background: '#ffffff',
        text: '#333333',
        border: '#3498db',
        highlight: '#fffacd'
    },
    cream: {
        name: 'Cream',
        background: '#fef9e7',
        text: '#3e2723',
        border: '#8d6e63',
        highlight: '#ffe0b2'
    },
    blue: {
        name: 'Blue Light',
        background: '#e3f2fd',
        text: '#0d47a1',
        border: '#42a5f5',
        highlight: '#bbdefb'
    },
    green: {
        name: 'Green Comfort',
        background: '#e8f5e9',
        text: '#1b5e20',
        border: '#66bb6a',
        highlight: '#c8e6c9'
    },
    dark: {
        name: 'High Contrast',
        background: '#1a1a1a',
        text: '#ffffff',
        border: '#ffaa00',
        highlight: '#333333'
    }
};

let currentTheme = 'default';

function applyTheme(themeName) {
    currentTheme = themeName;
    const theme = themes[themeName] || themes.default;
    
    document.body.style.backgroundColor = theme.background;
    document.body.style.color = theme.text;
    
    const fields = document.querySelectorAll('input, textarea, select');
    fields.forEach(field => {
        field.style.backgroundColor = theme.background;
        field.style.color = theme.text;
        field.style.borderColor = theme.border;
    });
    
    chrome.storage.sync.set({ 'selectedTheme': themeName });
    
    showNotification(`🎨 Theme changed to: ${theme.name}`, 'success');
}

function addThemeSelector() {
    if (document.querySelector('.theme-selector')) return;
    
    const selector = document.createElement('div');
    selector.className = 'theme-selector';
    selector.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: white;
        padding: 15px;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 100003;
        border: 2px solid #3498db;
        width: 200px;
    `;
    
    selector.innerHTML = `
        <h4 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 14px;">🎨 Dyslexia Themes</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            ${Object.keys(themes).map(key => `
                <button data-theme="${key}" style="
                    background: ${themes[key].background};
                    color: ${themes[key].text};
                    border: 2px solid ${themes[key].border};
                    padding: 8px 12px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.3s ease;
                ">
                    <span style="width: 16px; height: 16px; background: ${themes[key].border}; border-radius: 3px;"></span>
                    ${themes[key].name}
                </button>
            `).join('')}
        </div>
        <button id="hideThemeSelector" style="
            width: 100%;
            margin-top: 10px;
            padding: 5px;
            background: #e74c3c;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
        ">✕ Hide</button>
    `;
    
    document.body.appendChild(selector);
    
    selector.querySelectorAll('button[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
        });
    });
    
    selector.querySelector('#hideThemeSelector').addEventListener('click', () => {
        selector.remove();
    });
}

// ========== PERSISTENCE FIX - Check saved state ==========
function checkSavedState() {
    chrome.storage.sync.get(['dyslexiaEnabled'], function(data) {
        if (data.dyslexiaEnabled === true) {
            console.log("🔄 Restoring dyslexia mode from saved state");
            document.body.classList.add('dyslexia-mode');
            enhanceForms();
            
            // Also restore other settings
            chrome.storage.sync.get([
                'ttsEnabled', 
                'speechSpeed',
                'readingRulerEnabled',
                'selectedTheme',
                'autoBackupEnabled',
                'readingGuideEnabled',
                'wordByWord',
                'validationEnabled',
                'progressEnabled'
            ], function(settings) {
                if (settings.ttsEnabled) ttsEnabled = true;
                if (settings.speechSpeed) speechRate = settings.speechSpeed;
                if (settings.readingRulerEnabled) toggleReadingRuler(true);
                if (settings.selectedTheme) applyTheme(settings.selectedTheme);
                if (settings.readingGuideEnabled) toggleReadingGuide(true);
                if (settings.wordByWord) wordByWordEnabled = true;
                if (settings.validationEnabled === false) validationEnabled = false;
                if (settings.progressEnabled === false) progressEnabled = false;
            });
        }
    });
}

// ========== MAIN FORM ENHANCEMENT FUNCTION ==========
function enhanceForms() {
    console.log("Looking for forms...");
    
    const inputs = document.querySelectorAll('input, textarea, select');
    console.log(`Found ${inputs.length} form elements`);
    
    const forms = document.querySelectorAll('form');
    forms.forEach(form => createProgressIndicator(form));
    
    inputs.forEach(input => {
        if (input.dataset.enhanced === 'true') return;
        
        input.dataset.enhanced = 'true';
        input.classList.add('dyslexia-mode');
        
        Object.assign(input.style, {
            transition: 'all 0.2s ease',
            border: '2px solid #ddd',
            borderRadius: '4px',
            padding: '8px 12px'
        });
        
        // Add hint for date fields
        addDateFieldHint(input);
        
        // Add password generator for password fields
        if (input.type === 'password') {
            addPasswordGeneratorButton(input);
        }
        
        // Add voice input button for text fields
        if (input.type === 'text' || input.type === 'email' || input.type === 'tel' || 
            input.type === 'search' || input.type === 'url' || input.tagName === 'TEXTAREA') {
            addVoiceInputButton(input);
        }
        
        let lastFocusTime = 0;
        let lastWordTyped = '';
        
        input.addEventListener('focus', function() {
            const now = Date.now();
            if (now - lastFocusTime < 500) return;
            lastFocusTime = now;
            
            applyAdaptiveAssistance(this);
            trackUserPerformance(this, 'focus');
            
            if (ttsEnabled) {
                let label = '';
                if (this.placeholder) {
                    label = this.placeholder;
                } else if (this.labels && this.labels.length > 0) {
                    label = this.labels[0].textContent;
                } else if (this.name) {
                    label = this.name.replace(/([A-Z])/g, ' $1').toLowerCase();
                    label = label.charAt(0).toUpperCase() + label.slice(1);
                } else if (this.id) {
                    label = this.id.replace(/([A-Z])/g, ' $1').toLowerCase();
                    label = label.charAt(0).toUpperCase() + label.slice(1);
                } else if (this.type) {
                    label = this.type + ' field';
                } else {
                    label = 'field';
                }
                
                label = label.replace(/[_\*]/g, ' ').trim();
                label = label.replace(/[:*?]/g, '');
                
                // Enhanced TTS for day/month/year fields
                const fieldType = getFieldType(this);
                if (fieldType === 'day') {
                    label = 'Day field. Please enter a number between 1 and 31';
                } else if (fieldType === 'month') {
                    label = 'Month field. Please enter a number between 1 and 12';
                } else if (fieldType === 'year') {
                    const currentYear = new Date().getFullYear();
                    label = `Year field. Please enter a year between 1900 and ${currentYear + 10}`;
                }
                
                if (label && label !== 'undefined' && label.length > 1) {
                    setTimeout(() => speakText(label), 300);
                }
            }
        });
        
        input.addEventListener('blur', function() {
            this.style.borderColor = '#ddd';
            this.style.boxShadow = 'none';
            if (validationEnabled) {
                validateField(this);
            }
            
            const form = this.closest('form');
            if (form && progressEnabled) updateFormProgress(form);
            
            // Auto-backup on blur
            if (autoBackupEnabled) {
                backupFormData();
            }
        });
        
        // Input event with debounce for spell check
        input.addEventListener('input', function() {
            if (this.spellingTimeout) clearTimeout(this.spellingTimeout);
            if (this.validationTimeout) clearTimeout(this.validationTimeout);
            
            // FIXED: Word-by-word reading
            if (ttsEnabled && wordByWordEnabled) {
                const words = this.value.split(' ');
                const currentWord = words[words.length - 1];
                
                // Only speak if it's a new word (not just continuing to type same word)
                if (currentWord && 
                    currentWord !== lastWordTyped && 
                    currentWord.length > 1 && 
                    this.value.endsWith(' ') === false) {
                    
                    // Don't speak if we're still typing the same word
                    if (lastWordTyped && currentWord.startsWith(lastWordTyped)) {
                        // Still typing same word, skip
                    } else {
                        lastWordTyped = currentWord;
                        setTimeout(() => speakText(currentWord), 500);
                    }
                }
                
                // Reset lastWord when space is pressed
                if (this.value.endsWith(' ')) {
                    lastWordTyped = '';
                }
            }
            
            // Real-time validation for important fields
            const fieldType = getFieldType(this);
            if (validationEnabled && (fieldType === 'email' || fieldType === 'tel' || fieldType === 'phone' || 
                fieldType === 'password' || fieldType === 'day' || fieldType === 'month' || 
                fieldType === 'year' || fieldType === 'date')) {
                this.validationTimeout = setTimeout(() => {
                    validateField(this);
                }, 300);
            }
            
            // Spelling check with debounce (only for text fields, not numbers)
            if (fieldType === 'text' || fieldType === 'email' || fieldType === 'tel') {
                this.spellingTimeout = setTimeout(async () => {
                    if (this.value.length >= 3) {
                        await checkSpellingWithBackend(this);
                    } else if (this.value.length === 0) {
                        removeSuggestion(this);
                        this.classList.remove('input-error');
                    }
                }, 800);
            }
            
            // Update progress
            const form = this.closest('form');
            if (form && progressEnabled) updateFormProgress(form);
        });
        
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const suggestion = findSuggestionForInput(this);
                if (suggestion) {
                    const greenWord = suggestion.querySelector('.spelling-suggestion-word');
                    if (greenWord) {
                        greenWord.click();
                    }
                }
            }
        });
    });
}

// ========== ADD GLOBAL STYLES ==========
function addGlobalStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.6; }
            100% { transform: scale(1); opacity: 1; }
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        
        @keyframes listeningPulse {
            0% {
                transform: translateY(-50%) scale(1);
                box-shadow: 0 4px 15px rgba(231, 76, 60, 0.6);
            }
            50% {
                transform: translateY(-50%) scale(1.2);
                box-shadow: 0 4px 25px rgba(231, 76, 60, 0.9);
            }
            100% {
                transform: translateY(-50%) scale(1);
                box-shadow: 0 4px 15px rgba(231, 76, 60, 0.6);
            }
        }
        
        .input-error {
            border-color: #e74c3c !important;
            background-color: #fff9f9 !important;
            animation: shake 0.5s ease;
        }
        
        .input-success {
            border-color: #27ae60 !important;
            background-color: #f8fff9 !important;
            transition: all 0.3s ease;
        }
        
        .input-warning {
            border-color: #f39c12 !important;
            background-color: #fff9e6 !important;
        }
        
        .dyslexia-mode {
            font-family: 'Comic Sans MS', 'Arial Rounded MT Bold', Arial, sans-serif !important;
            letter-spacing: 0.05em !important;
            line-height: 1.6 !important;
        }
        
        .spelling-suggestion-word:hover {
            background-color: #e8f5e9 !important;
            animation: pulse 0.3s ease;
        }
        
        .suggestion-text {
            color: #666;
            font-size: 12px;
        }
        
        .validation-message {
            animation: fadeIn 0.3s ease;
        }
        
        .form-progress {
            animation: fadeIn 0.5s ease;
        }
        
        .password-generator-btn:hover {
            animation: pulse 0.3s ease;
        }
        
        .voice-input-btn {
            transition: all 0.3s ease !important;
        }
        
        .voice-input-btn:hover {
            animation: pulse 0.3s ease;
        }
        
        .reading-ruler {
            pointer-events: none;
            transition: background-color 0.3s ease;
        }
        
        .form-notification {
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        .theme-selector {
            animation: slideInRight 0.5s ease;
        }
        
        *:focus-visible {
            outline: 3px solid #3498db !important;
            outline-offset: 2px !important;
        }
        
        .spell-check-loading {
            animation: pulse 1s infinite;
        }
        
        .suggestion-source {
            font-size: 10px;
            color: #999;
            margin-left: 5px;
        }
    `;
    document.head.appendChild(style);
    console.log("Global styles added with all features");
}

// ========== INITIALIZATION ==========
function initialize() {
    console.log("Initializing FormEase Pro with HYBRID spell check...");
    
    // Check saved state first - this ensures persistence
    checkSavedState();
    
    chrome.storage.sync.get([
        'ttsEnabled', 
        'speechSpeed',
        'readingRulerEnabled',
        'selectedTheme',
        'autoBackupEnabled',
        'wordByWord',
        'validationEnabled',
        'progressEnabled',
        'readingGuideEnabled'
    ], function(data) {
        ttsEnabled = data.ttsEnabled || false;
        speechRate = data.speechSpeed || 1.0;
        wordByWordEnabled = data.wordByWord || false;
        validationEnabled = data.validationEnabled !== false; // default true
        progressEnabled = data.progressEnabled !== false; // default true
        readingGuideEnabled = data.readingGuideEnabled || false;
        autoBackupEnabled = data.autoBackupEnabled !== false; // default true
        
        if (data.readingRulerEnabled) {
            toggleReadingRuler(true);
        }
        
        if (data.selectedTheme) {
            applyTheme(data.selectedTheme);
        }
        
        if (readingGuideEnabled) {
            toggleReadingGuide(true);
        }
        
        console.log("Loaded settings - TTS:", ttsEnabled, "Speed:", speechRate, "WordByWord:", wordByWordEnabled);
    });
    
    chrome.storage.local.get(['userPerformance'], function(data) {
        if (data.userPerformance) {
            userPerformance = data.userPerformance;
        }
        userPerformance.startTime = Date.now();
    });
    
    // Initialize voice recognition
    initVoiceRecognition();
    
    createReadingRuler();
    
    if (autoBackupEnabled) {
        startAutoBackup();
    }
    
    setTimeout(() => {
        restoreFormData();
    }, 1000);
    
    addGlobalStyles();
    setupEventDelegation();
    
    setTimeout(() => {
        enhanceForms();
        console.log("Enhanced form enhancement complete");
    }, 1000);
}

// ========== MUTATION OBSERVER ==========
const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length > 0) {
            const hasFormElements = Array.from(mutation.addedNodes).some(node => {
                if (node.nodeType === 1) {
                    return node.querySelector('input, textarea, select') || 
                           ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName);
                }
                return false;
            });
            
            if (hasFormElements) {
                setTimeout(enhanceForms, 500);
            }
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// ========== COMPLETE MESSAGE HANDLING (ALL MISSING HANDLERS ADDED) ==========
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("Received message:", request.action);
    
    if (request.action === "enableDyslexia") {
        document.body.classList.add('dyslexia-mode');
        enhanceForms();
        // Save state
        chrome.storage.sync.set({ dyslexiaEnabled: true });
        sendResponse({status: "enabled"});
    }
    
    if (request.action === "disableDyslexia") {
        document.body.classList.remove('dyslexia-mode');
        // Save state
        chrome.storage.sync.set({ dyslexiaEnabled: false });
        sendResponse({status: "disabled"});
    }
    
    if (request.action === "updateTTS") {
        ttsEnabled = request.enabled;
        if (!ttsEnabled) window.speechSynthesis.cancel();
        chrome.storage.sync.set({ ttsEnabled: ttsEnabled });
        sendResponse({status: "tts updated"});
    }
    
    // MISSING HANDLER - ADDED
    if (request.action === "updateWordByWord") {
        wordByWordEnabled = request.enabled;
        chrome.storage.sync.set({ wordByWord: wordByWordEnabled });
        console.log("Word by word updated to:", wordByWordEnabled);
        sendResponse({status: "word by word updated"});
    }
    
    // MISSING HANDLER - ADDED
    if (request.action === "updateValidationEnabled") {
        validationEnabled = request.enabled;
        chrome.storage.sync.set({ validationEnabled: validationEnabled });
        sendResponse({status: "validation updated"});
    }
    
    // MISSING HANDLER - ADDED
    if (request.action === "updateProgressEnabled") {
        progressEnabled = request.enabled;
        chrome.storage.sync.set({ progressEnabled: progressEnabled });
        sendResponse({status: "progress updated"});
    }
    
    if (request.action === "updateSpeechSpeed") {
        speechRate = request.speed;
        chrome.storage.sync.set({ speechSpeed: speechRate });
        console.log("Speech speed updated to:", speechRate);
        sendResponse({status: "speed updated"});
    }
    
    if (request.action === "toggleReadingRuler") {
        toggleReadingRuler(request.enabled);
        chrome.storage.sync.set({ readingRulerEnabled: request.enabled });
        sendResponse({status: "ruler toggled"});
    }
    
    if (request.action === "backupFormData") {
        backupFormData();
        sendResponse({status: "backed up"});
    }
    
    if (request.action === "restoreFormData") {
        restoreFormData();
        sendResponse({status: "restored"});
    }
    
    if (request.action === "toggleVoiceInput") {
        toggleVoiceInput();
        sendResponse({status: "voice toggled", active: isListening});
    }
    
    if (request.action === "applyTheme") {
        applyTheme(request.theme);
        sendResponse({status: "theme applied"});
    }
    
    if (request.action === "showThemeSelector") {
        addThemeSelector();
        sendResponse({status: "selector shown"});
    }
    
    if (request.action === "getTTSStatus") {
        sendResponse({ ttsEnabled: ttsEnabled });
    }
    
    if (request.action === "saveUserProfile") {
        saveUserProfile();
        sendResponse({status: "saved"});
    }
    
    if (request.action === "loadUserProfile") {
        loadUserProfile();
        sendResponse({status: "loaded"});
    }
    
    if (request.action === "autoFillForm") {
        autoFillForm();
        sendResponse({status: "autofilled"});
    }
    
    if (request.action === "changeFontSize") {
        changeFontSize(request.direction);
        sendResponse({status: "font size changed"});
    }
    
    if (request.action === "changeFontFamily") {
        changeFontFamily(request.family);
        sendResponse({status: "font family changed"});
    }
    
    if (request.action === "toggleReadingGuide") {
        toggleReadingGuide(request.enabled);
        chrome.storage.sync.set({ readingGuideEnabled: request.enabled });
        sendResponse({status: "reading guide toggled"});
    }
    
    if (request.action === "showErrorSummary") {
        showErrorSummary();   
        sendResponse({status: "summary shown"});
    }
    
    if (request.action === "exportSession") {
        exportSessionData();
        sendResponse({status: "exported"});
    }
    
    if (request.action === "importSession") {
        importSessionData();
        sendResponse({status: "import started"});
    }
    
    // Return true for async response
    return true;
});

// ========== FEATURE 13: FORM AUTO-FILL WITH ONE CLICK ==========
let savedProfile = null;

function saveUserProfile() {
    const profile = {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        zipCode: '',
        day: '',
        month: '',
        year: ''
    };
    
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        const value = input.value;
        if (!value) return;
        
        const name = (input.name || input.id || '').toLowerCase();
        const type = input.type.toLowerCase();
        const fieldType = getFieldType(input);
        
        if (name.includes('first') || name.includes('fname')) {
            profile.firstName = value;
        } else if (name.includes('last') || name.includes('lname')) {
            profile.lastName = value;
        } else if (name.includes('email') || type === 'email') {
            profile.email = value;
        } else if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
            profile.phone = value;
        } else if (name.includes('address') || name.includes('addr')) {
            profile.address = value;
        } else if (name.includes('city')) {
            profile.city = value;
        } else if (name.includes('zip') || name.includes('postal') || name.includes('pincode')) {
            profile.zipCode = value;
        } else if (fieldType === 'day') {
            profile.day = value;
        } else if (fieldType === 'month') {
            profile.month = value;
        } else if (fieldType === 'year') {
            profile.year = value;
        }
    });
    
    chrome.storage.local.set({ 'userProfile': profile }, function() {
        showNotification('✅ Profile saved! You can now auto-fill forms', 'success');
    });
    
    return profile;
}

function loadUserProfile() {
    chrome.storage.local.get(['userProfile'], function(data) {
        if (data.userProfile) {
            savedProfile = data.userProfile;
            showNotification('📋 Profile loaded! Ready to auto-fill', 'info');
        } else {
            showNotification('❌ No saved profile found. Fill and save first', 'error');
        }
    });
}

function autoFillForm() {
    if (!savedProfile) {
        chrome.storage.local.get(['userProfile'], function(data) {
            if (data.userProfile) {
                savedProfile = data.userProfile;
                performAutoFill();
            } else {
                showNotification('❌ Please save your profile first', 'error');
            }
        });
    } else {
        performAutoFill();
    }
}

function performAutoFill() {
    if (!savedProfile) return;
    
    let filledCount = 0;
    const inputs = document.querySelectorAll('input:not([type="password"])');
    
    inputs.forEach(input => {
        const name = (input.name || input.id || '').toLowerCase();
        const type = input.type.toLowerCase();
        const placeholder = (input.placeholder || '').toLowerCase();
        const fieldType = getFieldType(input);
        
        let valueToSet = '';
        
        if (name.includes('first') || name.includes('fname') || placeholder.includes('first')) {
            valueToSet = savedProfile.firstName;
        } else if (name.includes('last') || name.includes('lname') || placeholder.includes('last')) {
            valueToSet = savedProfile.lastName;
        } else if (name.includes('email') || type === 'email' || placeholder.includes('email')) {
            valueToSet = savedProfile.email;
        } else if (name.includes('phone') || name.includes('mobile') || name.includes('tel') || placeholder.includes('phone')) {
            valueToSet = savedProfile.phone;
        } else if (name.includes('address') || name.includes('addr') || placeholder.includes('address')) {
            valueToSet = savedProfile.address;
        } else if (name.includes('city') || placeholder.includes('city')) {
            valueToSet = savedProfile.city;
        } else if (name.includes('zip') || name.includes('postal') || name.includes('pincode') || placeholder.includes('zip')) {
            valueToSet = savedProfile.zipCode;
        } else if (fieldType === 'day') {
            valueToSet = savedProfile.day;
        } else if (fieldType === 'month') {
            valueToSet = savedProfile.month;
        } else if (fieldType === 'year') {
            valueToSet = savedProfile.year;
        }
        
        if (valueToSet && !input.value) {
            input.value = valueToSet;
            input.classList.add('input-success');
            filledCount++;
        }
    });
    
    showNotification(`✨ Auto-filled ${filledCount} fields!`, 'success');
    
    if (ttsEnabled) {
        speakText(`Auto-filled ${filledCount} fields`);
    }
}

// ========== FEATURE 14: FONT SIZE & STYLE CUSTOMIZATION ==========
const fontSettings = {
    size: '16px',
    family: 'Arial, sans-serif',
    lineHeight: '1.6'
};

function applyFontSettings(settings) {
    const style = document.createElement('style');
    style.id = 'dyslexia-font-styles';
    style.textContent = `
        .dyslexia-mode, 
        .dyslexia-mode input, 
        .dyslexia-mode textarea, 
        .dyslexia-mode select {
            font-size: ${settings.size} !important;
            font-family: ${settings.family} !important;
            line-height: ${settings.lineHeight} !important;
        }
    `;
    
    const oldStyle = document.getElementById('dyslexia-font-styles');
    if (oldStyle) oldStyle.remove();
    
    document.head.appendChild(style);
    
    chrome.storage.sync.set({ 'fontSettings': settings });
    
    showNotification(`🔤 Font updated: ${settings.size}`, 'info');
}

function changeFontSize(action) {
    const sizes = ['14px', '16px', '18px', '20px', '24px'];
    let currentIndex = sizes.indexOf(fontSettings.size);
    
    if (action === 'increase' && currentIndex < sizes.length - 1) {
        fontSettings.size = sizes[currentIndex + 1];
    } else if (action === 'decrease' && currentIndex > 0) {
        fontSettings.size = sizes[currentIndex - 1];
    }
    
    applyFontSettings(fontSettings);
}

function changeFontFamily(family) {
    const fontFamilies = {
        'arial': 'Arial, sans-serif',
        'comic': 'Comic Sans MS, cursive, sans-serif',
        'opendyslexic': 'OpenDyslexic, Arial, sans-serif',
        'verdana': 'Verdana, sans-serif',
        'times': 'Times New Roman, serif'
    };
    
    fontSettings.family = fontFamilies[family] || fontFamilies.arial;
    applyFontSettings(fontSettings);
}

// Load OpenDyslexic font from CDN
function loadOpenDyslexicFont() {
    const link = document.createElement('link');
    link.href = 'https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic-regular.css';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    document.head.appendChild(link);
}

// Call this in initialize()
loadOpenDyslexicFont();

// ========== FEATURE 15: READING GUIDE (LINE HIGHLIGHTER) ==========
let guideElement = null;
let currentHighlightedField = null;

function createReadingGuide() {
    if (guideElement) return;
    
    guideElement = document.createElement('div');
    guideElement.className = 'reading-guide';
    guideElement.style.cssText = `
        position: fixed;
        height: 40px;
        background: rgba(255, 255, 150, 0.25);
        border-left: 4px solid #ffaa00;
        pointer-events: none;
        z-index: 99999;
        display: none;
        transition: all 0.2s ease;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(guideElement);
}

function toggleReadingGuide(enable) {
    readingGuideEnabled = enable;
    
    if (!guideElement) {
        createReadingGuide();
    }
    
    if (enable) {
        document.addEventListener('mouseover', highlightField);
        document.addEventListener('click', highlightField);
        document.addEventListener('scroll', updateGuidePosition);
        
        showNotification('📖 Reading Guide activated - Hover over text to highlight', 'info');
    } else {
        guideElement.style.display = 'none';
        document.removeEventListener('mouseover', highlightField);
        document.removeEventListener('click', highlightField);
        document.removeEventListener('scroll', updateGuidePosition);
        
        if (currentHighlightedField) {
            currentHighlightedField.style.outline = 'none';
            currentHighlightedField = null;
        }
    }
}

function highlightField(e) {
    if (!readingGuideEnabled) return;
    
    const target = e.target;
    const isTextField = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.tagName === 'SELECT' ||
                       target.isContentEditable;
    
    if (isTextField) {
        if (currentHighlightedField) {
            currentHighlightedField.style.outline = 'none';
        }
        
        target.style.outline = '3px solid #ffaa00';
        target.style.outlineOffset = '2px';
        
        const rect = target.getBoundingClientRect();
        guideElement.style.display = 'block';
        guideElement.style.top = rect.top + 'px';
        guideElement.style.left = rect.left + 'px';
        guideElement.style.width = rect.width + 'px';
        guideElement.style.height = rect.height + 'px';
        
        currentHighlightedField = target;
    } else {
        guideElement.style.display = 'none';
        if (currentHighlightedField) {
            currentHighlightedField.style.outline = 'none';
            currentHighlightedField = null;
        }
    }
}

function updateGuidePosition() {
    if (!readingGuideEnabled || !currentHighlightedField) return;
    
    const rect = currentHighlightedField.getBoundingClientRect();
    guideElement.style.top = rect.top + 'px';
    guideElement.style.left = rect.left + 'px';
}

// ========== ADD BACKUP/RESTORE BUTTONS UNDER READING RULER ==========
function addBackupButtonsToPage() {
    // Check if buttons already exist
    if (document.querySelector('.backup-restore-container')) return;
    
    // Create container for backup/restore buttons
    const container = document.createElement('div');
    container.className = 'backup-restore-container';
    container.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: white;
        padding: 15px;
        border-radius: 12px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        z-index: 999998;
        border: 2px solid #3498db;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 200px;
        animation: slideInRight 0.3s ease;
        backdrop-filter: blur(5px);
        background: rgba(255, 255, 255, 0.95);
    `;
    
    container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
            <span style="font-size: 18px;">💾</span>
            <span style="font-weight: bold; color: #2c3e50;">Form Data Backup</span>
        </div>
        <div style="font-size: 12px; color: #7f8c8d; margin-bottom: 10px;">
            Save your work and restore it anytime!
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="backupNowPageBtn" style="
                flex: 1;
                background: #27ae60;
                color: white;
                border: none;
                padding: 10px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                transition: all 0.3s ease;
            ">
                💾 Backup Now
            </button>
            <button id="restoreNowPageBtn" style="
                flex: 1;
                background: #3498db;
                color: white;
                border: none;
                padding: 10px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                transition: all 0.3s ease;
            ">
                🔄 Restore
            </button>
        </div>
        <div id="backupStatus" style="font-size: 11px; text-align: center; margin-top: 8px; color: #95a5a6;">
            Last backup: Never
        </div>
        <button id="hideBackupPanel" style="
            position: absolute;
            top: -8px;
            right: -8px;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #e74c3c;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        ">✕</button>
    `;
    
    document.body.appendChild(container);
    
    // Add hover effects
    const backupBtn = document.getElementById('backupNowPageBtn');
    const restoreBtn = document.getElementById('restoreNowPageBtn');
    
    backupBtn.addEventListener('mouseenter', () => {
        backupBtn.style.background = '#229954';
        backupBtn.style.transform = 'scale(1.05)';
    });
    backupBtn.addEventListener('mouseleave', () => {
        backupBtn.style.background = '#27ae60';
        backupBtn.style.transform = 'scale(1)';
    });
    
    restoreBtn.addEventListener('mouseenter', () => {
        restoreBtn.style.background = '#2980b9';
        restoreBtn.style.transform = 'scale(1.05)';
    });
    restoreBtn.addEventListener('mouseleave', () => {
        restoreBtn.style.background = '#3498db';
        restoreBtn.style.transform = 'scale(1)';
    });
    
    // Backup button click handler
    backupBtn.addEventListener('click', () => {
        backupFormData();
        
        // Update status
        const statusDiv = document.getElementById('backupStatus');
        const now = new Date();
        statusDiv.innerHTML = `Last backup: ${now.toLocaleTimeString()}`;
        statusDiv.style.color = '#27ae60';
        
        // Show success animation
        backupBtn.style.background = '#2ecc71';
        setTimeout(() => {
            backupBtn.style.background = '#27ae60';
        }, 200);
        
        if (ttsEnabled) {
            speakText('Form data backed up successfully');
        }
    });
    
    // Restore button click handler
    restoreBtn.addEventListener('click', () => {
        restoreFormData();
        
        // Show success animation
        restoreBtn.style.background = '#5dade2';
        setTimeout(() => {
            restoreBtn.style.background = '#3498db';
        }, 200);
        
        if (ttsEnabled) {
            speakText('Form data restored');
        }
    });
    
    // Hide panel button
    document.getElementById('hideBackupPanel').addEventListener('click', () => {
        container.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => container.remove(), 300);
    });
    
    // Check for existing backup
    chrome.storage.local.get(['formBackup'], function(data) {
        if (data.formBackup) {
            const statusDiv = document.getElementById('backupStatus');
            statusDiv.innerHTML = '✅ Backup available!';
            statusDiv.style.color = '#27ae60';
        }
    });
}

// ========== UPDATE READING RULER TO SHOW BACKUP BUTTONS ==========
function toggleReadingRuler(enable) {
    readingRulerEnabled = enable;
    
    if (!rulerElement) {
        createReadingRuler();
    }
    
    if (enable) {
        // Show ruler
        rulerElement.style.display = 'block';
        
        // Position initially in the center of screen
        const centerY = window.innerHeight / 2;
        rulerElement.style.top = `${centerY - 16}px`;
        
        // Add event listeners
        document.addEventListener('mousemove', updateRulerPosition);
        document.addEventListener('scroll', () => updateRulerPosition());
        window.addEventListener('resize', () => updateRulerPosition());
        
        // Show backup buttons when reading ruler is enabled
        addBackupButtonsToPage();
        
        showNotification('📏 Reading Ruler Activated - Move your mouse!', 'info');
        
        if (ttsEnabled) {
            speakText('Reading ruler activated. Move your mouse to see the guide.');
        }
    } else {
        // Hide ruler
        rulerElement.style.display = 'none';
        
        // Hide backup buttons when reading ruler is disabled
        const backupPanel = document.querySelector('.backup-restore-container');
        if (backupPanel) {
            backupPanel.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => backupPanel.remove(), 300);
        }
        
        // Remove event listeners
        document.removeEventListener('mousemove', updateRulerPosition);
        document.removeEventListener('scroll', updateRulerPosition);
        window.removeEventListener('resize', updateRulerPosition);
        
        // Clear any pending timeouts
        if (rulerTimeout) {
            clearTimeout(rulerTimeout);
            rulerTimeout = null;
        }
    }
}

// ========== FEATURE 16: ERROR SUMMARY DASHBOARD ==========
function showErrorSummary() {
    const errorFields = document.querySelectorAll('.input-error');
    const warningFields = document.querySelectorAll('.input-warning');
    
    if (errorFields.length === 0 && warningFields.length === 0) {
        showNotification('✅ No errors found! Great job!', 'success');
        return;
    }
    
    const summaryPanel = document.createElement('div');
    summaryPanel.className = 'error-summary-panel';
    summaryPanel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 350px;
        max-height: 500px;
        overflow-y: auto;
        background: white;
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        z-index: 100000;
        padding: 20px;
        border: 2px solid #e74c3c;
        animation: slideInDown 0.3s ease;
    `;
    
    let errorHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin:0; color:#2c3e50;">⚠️ Form Errors</h3>
            <button id="closeErrorSummary" style="background:#e74c3c; color:white; border:none; width:30px; height:30px; border-radius:50%; cursor:pointer; font-weight:bold;">✕</button>
        </div>
        <p style="color:#7f8c8d; margin-bottom:16px;">Found ${errorFields.length} errors, ${warningFields.length} warnings</p>
    `;
    
    if (errorFields.length > 0) {
        errorHtml += `<div style="margin-bottom:16px;"><h4 style="color:#e74c3c; margin-bottom:8px;">🔴 Errors</h4>`;
        errorFields.forEach((field, index) => {
            const label = field.placeholder || field.name || field.id || `Field ${index+1}`;
            errorHtml += `
                <div class="error-item" data-field-id="${index}" style="padding:10px; background:#fff5f5; border-radius:8px; margin-bottom:8px; cursor:pointer; border-left:3px solid #e74c3c;">
                    <div style="font-weight:600;">${label}</div>
                    <div style="font-size:11px; color:#7f8c8d;">Value: "${field.value.substring(0,30)}${field.value.length > 30 ? '...' : ''}"</div>
                </div>
            `;
        });
        errorHtml += `</div>`;
    }
    
    if (warningFields.length > 0) {
        errorHtml += `<div><h4 style="color:#f39c12; margin-bottom:8px;">🟡 Warnings</h4>`;
        warningFields.forEach((field, index) => {
            const label = field.placeholder || field.name || field.id || `Field ${index+1}`;
            errorHtml += `
                <div class="warning-item" data-field-id="${index}" style="padding:10px; background:#fff9e6; border-radius:8px; margin-bottom:8px; cursor:pointer; border-left:3px solid #f39c12;">
                    <div style="font-weight:600;">${label}</div>
                    <div style="font-size:11px; color:#7f8c8d;">Value: "${field.value.substring(0,30)}${field.value.length > 30 ? '...' : ''}"</div>
                </div>
            `;
        });
        errorHtml += `</div>`;
    }
    
    errorHtml += `
        <div style="display:flex; gap:10px; margin-top:20px;">
            <button id="fixAllErrors" style="flex:1; background:#27ae60; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer;">✨ Try Auto-fix</button>
            <button id="clearAllErrors" style="flex:1; background:#95a5a6; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer;">🗑️ Clear All</button>
        </div>
    `;
    
    summaryPanel.innerHTML = errorHtml;
    document.body.appendChild(summaryPanel);
    
    summaryPanel.querySelectorAll('.error-item, .warning-item').forEach((item, index) => {
        item.addEventListener('click', () => {
            const field = errorFields[index] || warningFields[index - errorFields.length];
            field.focus();
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            summaryPanel.remove();
        });
    });
    
    document.getElementById('closeErrorSummary').addEventListener('click', () => {
        summaryPanel.remove();
    });
    
    document.getElementById('fixAllErrors')?.addEventListener('click', () => {
        errorFields.forEach(field => {
            if (field.type === 'email' && !validateEmail(field.value)) {
                const atIndex = field.value.indexOf('@');
                if (atIndex === -1 && field.value.includes('.')) {
                    field.value = field.value.replace('.', '@');
                }
            }
        });
        summaryPanel.remove();
        showNotification('✨ Attempted to fix errors', 'success');
    });
    
    document.getElementById('clearAllErrors')?.addEventListener('click', () => {
        errorFields.forEach(field => {
            field.classList.remove('input-error');
        });
        warningFields.forEach(field => {
            field.classList.remove('input-warning');
        });
        summaryPanel.remove();
        showNotification('🗑️ Error indicators cleared', 'info');
    });
}

// ========== FEATURE 17: SESSION EXPORT/IMPORT ==========
function exportSessionData() {
    chrome.storage.local.get(['userPerformance', 'userProfile', 'formBackup'], function(data) {
        const exportData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            data: data
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `form-ease-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        
        showNotification('📦 Data exported successfully!', 'success');
        
        if (ttsEnabled) {
            speakText('Data exported successfully');
        }
    });
}

function importSessionData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const imported = JSON.parse(e.target.result);
                
                if (imported.version && imported.data) {
                    if (imported.data.userPerformance) {
                        chrome.storage.local.set({ 'userPerformance': imported.data.userPerformance });
                        userPerformance = imported.data.userPerformance;
                    }
                    if (imported.data.userProfile) {
                        chrome.storage.local.set({ 'userProfile': imported.data.userProfile });
                        savedProfile = imported.data.userProfile;
                    }
                    if (imported.data.formBackup) {
                        chrome.storage.local.set({ 'formBackup': imported.data.formBackup });
                    }
                    
                    showNotification('✅ Data imported successfully!', 'success');
                    
                    if (ttsEnabled) {
                        speakText('Data imported successfully');
                    }
                } else {
                    showNotification('❌ Invalid backup file', 'error');
                }
            } catch (error) {
                showNotification('❌ Error importing file', 'error');
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

// ========== RUN ON PAGE LOAD ==========
window.addEventListener('load', initialize);

// Also run immediately if document already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initialize, 100);
}

// ========== DEBUG EXPORTS ==========
window.FormEaseDebug = {
    checkSpelling: checkSpellingWithBackend,
    speakText,
    enhanceForms,
    validateField,
    getPerformance: () => userPerformance,
    generatePassword: generateStrongPassword,
    toggleReadingRuler,
    toggleVoiceInput,
    applyTheme,
    backupFormData,
    restoreFormData,
    spellChecker,
    getFieldType: getFieldType, // Added for debugging
    get ttsEnabled() { return ttsEnabled; },
    set ttsEnabled(value) { ttsEnabled = value; }
};

console.log("🎉 FormEase Pro - Complete Edition with Backend Integration and Persistence Fix is READY!");