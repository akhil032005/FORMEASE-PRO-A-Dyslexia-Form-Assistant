document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 FormEase Pro - Popup Loaded with All Features");
    
    // ========== GLOBAL VARIABLES ==========
    let voiceInputActive = false;
    
    // ========== LOAD ALL SETTINGS ==========
    chrome.storage.sync.get([
        'ttsEnabled', 
        'dyslexiaEnabled',
        'wordByWord',
        'validationEnabled',
        'progressEnabled',
        'assistanceLevel',
        'speechSpeed',
        'readingRulerEnabled',
        'autoBackupEnabled',
        'readingGuideEnabled'
    ], function(data) {
        console.log("Loaded settings:", data);
        
        // Set toggles
        const ttsToggle = document.getElementById('ttsToggle');
        if (ttsToggle) {
            ttsToggle.checked = data.ttsEnabled || false;
        }
        
        const wordToggle = document.getElementById('wordByWordToggle');
        if (wordToggle) wordToggle.checked = data.wordByWord || false;
        
        const validationToggle = document.getElementById('validationToggle');
        if (validationToggle) validationToggle.checked = data.validationEnabled !== false;
        
        const progressToggle = document.getElementById('progressToggle');
        if (progressToggle) progressToggle.checked = data.progressEnabled !== false;
        
        const rulerToggle = document.getElementById('readingRulerToggle');
        if (rulerToggle) rulerToggle.checked = data.readingRulerEnabled || false;
        
        const backupToggle = document.getElementById('autoBackupToggle');
        if (backupToggle) backupToggle.checked = data.autoBackupEnabled !== false;
        
        const guideToggle = document.getElementById('readingGuideToggle');
        if (guideToggle) guideToggle.checked = data.readingGuideEnabled || false;
        
        // Set sliders
        const assistanceSlider = document.getElementById('assistanceLevel');
        const speedSlider = document.getElementById('speechSpeed');
        
        if (assistanceSlider) assistanceSlider.value = data.assistanceLevel || 2;
        if (speedSlider) speedSlider.value = data.speechSpeed || 1.0;
        
        updateSliderLabels();
        
        // Set dyslexia mode buttons
        const enableBtn = document.getElementById('enableBtn');
        const disableBtn = document.getElementById('disableBtn');
        
        if (enableBtn && disableBtn) {
            if (data.dyslexiaEnabled) {
                enableBtn.disabled = true;
                disableBtn.disabled = false;
            } else {
                enableBtn.disabled = false;
                disableBtn.disabled = true;
            }
        }
        
        // Load and display user stats
        loadUserStats();
    });
    
    // ========== UPDATE SLIDER LABELS ==========
    function updateSliderLabels() {
        const assistanceValue = document.getElementById('assistanceLevel')?.value;
        const speedValue = document.getElementById('speechSpeed')?.value;
        
        if (assistanceValue) {
            const assistanceText = ['Minimal', 'Adaptive', 'Maximum'][assistanceValue - 1];
            const assistanceLabel = document.getElementById('assistanceValue');
            if (assistanceLabel) assistanceLabel.textContent = assistanceText;
        }
        
        if (speedValue) {
            const speedText = speedValue < 0.8 ? 'Slow' : 
                            speedValue > 1.2 ? 'Fast' : 'Medium';
            const speedLabel = document.getElementById('speedValue');
            if (speedLabel) speedLabel.textContent = speedText;
        }
    }
    
    // ========== LOAD USER STATISTICS ==========
    function loadUserStats() {
        chrome.storage.local.get(['userPerformance'], function(data) {
            if (data.userPerformance) {
                const perf = data.userPerformance;
                const fields = Object.keys(perf.fieldStats || {}).length;
                const corrections = perf.corrections || 0;
                const timeSaved = Math.round(corrections * 0.5);
                
                const fieldsCompleted = document.getElementById('fieldsCompleted');
                const correctionsUsed = document.getElementById('correctionsUsed');
                const timeSavedEl = document.getElementById('timeSaved');
                const efficiencyBar = document.getElementById('efficiencyBar');
                const efficiencyPercent = document.getElementById('efficiencyPercent');
                
                if (fieldsCompleted) fieldsCompleted.textContent = fields;
                if (correctionsUsed) correctionsUsed.textContent = corrections;
                if (timeSavedEl) timeSavedEl.textContent = timeSaved + ' min';
                
                const efficiency = perf.errors > 0 ? 
                    Math.min(100, Math.round((corrections / perf.errors) * 100)) : 100;
                if (efficiencyBar) efficiencyBar.style.width = efficiency + '%';
                if (efficiencyPercent) efficiencyPercent.textContent = efficiency + '%';
            }
        });
    }
    
    // ========== SEND MESSAGE TO ACTIVE TAB ==========
    function sendMessageToActiveTab(action, data = {}, callback = null) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs && tabs[0] && tabs[0].id) {
                const message = { action, ...data };
                
                // Add timestamp to avoid caching issues
                message.timestamp = Date.now();
                
                chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
                    if (chrome.runtime.lastError) {
                        console.log(`Error sending ${action}:`, chrome.runtime.lastError);
                        
                        // Special handling for voice input
                        if (action === "toggleVoiceInput") {
                            showNotification("🎤 Click on a text field first, then try again", "warning");
                        } else {
                            showNotification("⚠️ Please refresh the page and try again", "warning");
                        }
                        
                        if (callback) callback({ error: true, message: "Content script not ready" });
                    } else {
                        if (callback) callback(response);
                    }
                });
            } else {
                showNotification("⚠️ No active tab found", "warning");
                if (callback) callback({ error: true, message: "No active tab" });
            }
        });
    }
    
    // ========== CHECK MICROPHONE PERMISSION ==========
    function checkMicrophonePermission() {
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'microphone' }).then(function(permissionStatus) {
                console.log('🎤 Microphone permission:', permissionStatus.state);
                
                const voiceBtn = document.getElementById('voiceInputBtn');
                if (!voiceBtn) return;
                
                if (permissionStatus.state === 'denied') {
                    voiceBtn.disabled = true;
                    voiceBtn.title = 'Microphone access denied - please enable in browser settings';
                    voiceBtn.style.opacity = '0.5';
                    voiceBtn.style.cursor = 'not-allowed';
                    
                    // Add a warning message
                    const warningDiv = document.createElement('div');
                    warningDiv.className = 'mic-warning';
                    warningDiv.style.cssText = `
                        font-size: 11px;
                        color: #e74c3c;
                        margin-top: 8px;
                        padding: 8px;
                        background: #fef5f5;
                        border-radius: 6px;
                        border-left: 3px solid #e74c3c;
                    `;
                    warningDiv.innerHTML = '🎤 Microphone access is blocked. Please enable it in your browser settings to use voice input.';
                    
                    // Insert after voice input section
                    const voiceSection = document.querySelector('.section:has(#voiceInputBtn)');
                    if (voiceSection && !voiceSection.querySelector('.mic-warning')) {
                        voiceSection.appendChild(warningDiv);
                    }
                } else if (permissionStatus.state === 'prompt') {
                    voiceBtn.title = 'Click to start voice input (microphone permission required)';
                } else {
                    voiceBtn.title = 'Click to start voice typing';
                }
                
                // Listen for permission changes
                permissionStatus.onchange = function() {
                    console.log('🎤 Microphone permission changed to:', this.state);
                    if (this.state === 'granted') {
                        voiceBtn.disabled = false;
                        voiceBtn.style.opacity = '1';
                        voiceBtn.style.cursor = 'pointer';
                        
                        // Remove warning if exists
                        const warning = document.querySelector('.mic-warning');
                        if (warning) warning.remove();
                    }
                };
            }).catch(error => {
                console.log('Permission query not supported:', error);
            });
        }
    }
    
    // ========== VOICE ASSISTANCE HANDLERS ==========
    
    // TTS Toggle
    document.getElementById('ttsToggle')?.addEventListener('change', function() {
        const isEnabled = this.checked;
        console.log("TTS Toggle changed to:", isEnabled);
        
        chrome.storage.sync.set({ ttsEnabled: isEnabled });
        
        sendMessageToActiveTab("updateTTS", { enabled: isEnabled }, function(response) {
            showNotification(isEnabled ? "🔊 Voice assistance ON" : "🔇 Voice assistance OFF", "success");
        });
    });
    
    // Word by Word Toggle
    document.getElementById('wordByWordToggle')?.addEventListener('change', function() {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ wordByWord: isEnabled });
        
        sendMessageToActiveTab("updateWordByWord", { enabled: isEnabled });
        showNotification(isEnabled ? "📝 Word-by-word reading ON" : "📝 Word-by-word reading OFF", "info");
    });
    
    // Speech Speed Slider
    document.getElementById('speechSpeed')?.addEventListener('input', function() {
        updateSliderLabels();
        const speed = parseFloat(this.value);
        chrome.storage.sync.set({ speechSpeed: speed });
        
        sendMessageToActiveTab("updateSpeechSpeed", { speed: speed });
    });
    
    // ========== VALIDATION HANDLERS ==========
    
    document.getElementById('validationToggle')?.addEventListener('change', function() {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ validationEnabled: isEnabled });
        sendMessageToActiveTab("updateValidationEnabled", { enabled: isEnabled });
        showNotification(isEnabled ? "✅ Smart validation ON" : "✅ Smart validation OFF", "info");
    });
    
    document.getElementById('progressToggle')?.addEventListener('change', function() {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ progressEnabled: isEnabled });
        sendMessageToActiveTab("updateProgressEnabled", { enabled: isEnabled });
    });
    
    document.getElementById('assistanceLevel')?.addEventListener('input', function() {
        updateSliderLabels();
        chrome.storage.sync.set({ assistanceLevel: parseInt(this.value) });
    });
    
    // ========== READING RULER ==========
    
    document.getElementById('readingRulerToggle')?.addEventListener('change', function() {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ readingRulerEnabled: isEnabled });
        
        sendMessageToActiveTab("toggleReadingRuler", { enabled: isEnabled });
        showNotification(isEnabled ? "📏 Reading Ruler ON - Move mouse to see it!" : "📏 Reading Ruler OFF", "info");
    });
    
    // ========== AUTO BACKUP ==========
    
    document.getElementById('autoBackupToggle')?.addEventListener('change', function() {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ autoBackupEnabled: isEnabled });
        showNotification(isEnabled ? "💾 Auto Backup ON" : "💾 Auto Backup OFF", "info");
    });
    
    document.getElementById('backupNowBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("backupFormData", {}, function(response) {
            showNotification("✅ Form data backed up!", "success");
        });
    });
    
    document.getElementById('restoreBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("restoreFormData", {}, function(response) {
            showNotification("🔄 Form data restored!", "success");
        });
    });
    
    // ========== VOICE INPUT (ENHANCED) ==========
    
    // Check microphone permission on load
    checkMicrophonePermission();
    
    document.getElementById('voiceInputBtn')?.addEventListener('click', function() {
        const btn = document.getElementById('voiceInputBtn');
        
        // Visual feedback
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            btn.style.transform = 'scale(1)';
        }, 200);
        
        // First check if there's an active tab
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (!tabs || !tabs[0] || !tabs[0].id) {
                showNotification("⚠️ No active tab found", "warning");
                return;
            }
            
            // Check if we're on a valid page (not chrome:// or edge://)
            if (tabs[0].url && (tabs[0].url.startsWith('chrome://') || 
                tabs[0].url.startsWith('edge://') || 
                tabs[0].url.startsWith('about:'))) {
                showNotification("⚠️ Voice input not available on browser pages", "warning");
                return;
            }
            
            // Toggle voice input
            voiceInputActive = !voiceInputActive;
            
            sendMessageToActiveTab("toggleVoiceInput", {}, function(response) {
                if (response && response.error) {
                    voiceInputActive = false;
                    return;
                }
                
                if (voiceInputActive) {
                    btn.innerHTML = '🛑 Stop Voice Typing';
                    btn.style.background = 'linear-gradient(145deg, #e74c3c, #c0392b)';
                    btn.classList.add('voice-active');
                    
                    showNotification("🎤 Click on any text field and speak!", "info");
                    
                    // Auto-reset after 15 seconds if no response
                    setTimeout(() => {
                        if (voiceInputActive) {
                            voiceInputActive = false;
                            btn.innerHTML = '🎤 Start Voice Typing';
                            btn.style.background = 'linear-gradient(145deg, #e67e22, #d35400)';
                            btn.classList.remove('voice-active');
                            showNotification("🕒 Voice input timed out", "info");
                        }
                    }, 15000);
                } else {
                    btn.innerHTML = '🎤 Start Voice Typing';
                    btn.style.background = 'linear-gradient(145deg, #e67e22, #d35400)';
                    btn.classList.remove('voice-active');
                    showNotification("🛑 Voice input stopped", "info");
                }
            });
        });
    });
    
    // ========== THEME BUTTONS ==========
    
    document.getElementById('themeDefault')?.addEventListener('click', function() {
        sendMessageToActiveTab("applyTheme", { theme: "default" });
        chrome.storage.sync.set({ selectedTheme: "default" });
        showNotification("🎨 Default theme applied", "success");
    });
    
    document.getElementById('themeCream')?.addEventListener('click', function() {
        sendMessageToActiveTab("applyTheme", { theme: "cream" });
        chrome.storage.sync.set({ selectedTheme: "cream" });
        showNotification("🎨 Cream theme applied", "success");
    });
    
    document.getElementById('themeBlue')?.addEventListener('click', function() {
        sendMessageToActiveTab("applyTheme", { theme: "blue" });
        chrome.storage.sync.set({ selectedTheme: "blue" });
        showNotification("🎨 Blue Light theme applied", "success");
    });
    
    document.getElementById('themeGreen')?.addEventListener('click', function() {
        sendMessageToActiveTab("applyTheme", { theme: "green" });
        chrome.storage.sync.set({ selectedTheme: "green" });
        showNotification("🎨 Green Comfort theme applied", "success");
    });
    
    document.getElementById('themeDark')?.addEventListener('click', function() {
        sendMessageToActiveTab("applyTheme", { theme: "dark" });
        chrome.storage.sync.set({ selectedTheme: "dark" });
        showNotification("🎨 High Contrast theme applied", "success");
    });
    
    // ========== AUTO-FILL HANDLERS ==========
    
    document.getElementById('saveProfileBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("saveUserProfile", {}, function(response) {
            showNotification("✅ Profile saved successfully!", "success");
        });
    });
    
    document.getElementById('loadProfileBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("loadUserProfile", {}, function(response) {
            showNotification("📋 Profile loaded! Ready to auto-fill", "info");
        });
    });
    
    document.getElementById('autoFillBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("autoFillForm", {}, function(response) {
            // Response handled by content script
        });
    });
    
    // ========== FONT HANDLERS ==========
    
    document.getElementById('increaseFontBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("changeFontSize", { direction: "increase" });
        showNotification("🔤 Font size increased", "info");
    });
    
    document.getElementById('decreaseFontBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("changeFontSize", { direction: "decrease" });
        showNotification("🔤 Font size decreased", "info");
    });
    
    document.getElementById('fontArial')?.addEventListener('click', function() {
        sendMessageToActiveTab("changeFontFamily", { family: "arial" });
        showNotification("🔤 Font changed to Arial", "info");
    });
    
    document.getElementById('fontComic')?.addEventListener('click', function() {
        sendMessageToActiveTab("changeFontFamily", { family: "comic" });
        showNotification("🔤 Font changed to Comic Sans", "info");
    });
    
    document.getElementById('fontOpenDyslexic')?.addEventListener('click', function() {
        sendMessageToActiveTab("changeFontFamily", { family: "opendyslexic" });
        showNotification("🔤 Font changed to OpenDyslexic", "info");
    });
    
    document.getElementById('fontVerdana')?.addEventListener('click', function() {
        sendMessageToActiveTab("changeFontFamily", { family: "verdana" });
        showNotification("🔤 Font changed to Verdana", "info");
    });
    
    // ========== READING GUIDE ==========
    
    document.getElementById('readingGuideToggle')?.addEventListener('change', function() {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ readingGuideEnabled: isEnabled });
        
        sendMessageToActiveTab("toggleReadingGuide", { enabled: isEnabled });
        showNotification(isEnabled ? "📖 Reading Guide ON" : "📖 Reading Guide OFF", "info");
    });
    
    // ========== ERROR SUMMARY ==========
    
    document.getElementById('showErrorSummaryBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("showErrorSummary", {}, function(response) {
            // Response handled by content script
        });
    });
    
    // ========== DATA MANAGEMENT ==========
    
    document.getElementById('exportDataBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("exportSession", {}, function(response) {
            showNotification("📤 Export started - check downloads", "success");
        });
    });
    
    document.getElementById('importDataBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("importSession", {}, function(response) {
            showNotification("📥 Select a backup file to import", "info");
        });
    });
    
    // ========== RESET STATS ==========
    
    document.getElementById('resetStats')?.addEventListener('click', function() {
        if (confirm("Reset all statistics?")) {
            chrome.storage.local.remove('userPerformance', function() {
                loadUserStats();
                showNotification("📊 Statistics reset successfully!", "success");
            });
        }
    });
    
    // ========== DYSLEXIA MODE BUTTONS ==========
    
    document.getElementById('enableBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("enableDyslexia", {}, function(response) {
            chrome.storage.sync.set({ dyslexiaEnabled: true });
            
            document.getElementById('enableBtn').disabled = true;
            document.getElementById('disableBtn').disabled = false;
            
            showNotification("✅ Dyslexia mode enabled permanently!", "success");
        });
    });
    
    document.getElementById('disableBtn')?.addEventListener('click', function() {
        sendMessageToActiveTab("disableDyslexia", {}, function(response) {
            chrome.storage.sync.set({ dyslexiaEnabled: false });
            
            document.getElementById('enableBtn').disabled = false;
            document.getElementById('disableBtn').disabled = true;
            
            showNotification("❌ Dyslexia mode disabled permanently!", "info");
        });
    });
    
    // ========== NOTIFICATION FUNCTION ==========
    function showNotification(message, type = "info") {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.popup-notification');
        existingNotifications.forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = 'popup-notification';
        
        const colors = {
            success: '#27ae60',
            warning: '#e67e22',
            error: '#e74c3c',
            info: '#3498db'
        };
        
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            right: 10px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            text-align: center;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: slideUp 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 2800);
    }
    
    // ========== ADD CSS ANIMATIONS ==========
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        .section {
            transition: all 0.3s ease;
        }
        
        .section:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        
        button {
            transition: all 0.3s ease;
            cursor: pointer;
        }
        
        button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .popup-notification {
            transition: all 0.3s ease;
        }
        
        .voice-active {
            animation: pulse 1.5s infinite !important;
        }
    `;
    document.head.appendChild(style);
    
    console.log("✅ FormEase Pro Popup - All Features Initialized");
    
    // Check if TTS was previously enabled
    chrome.storage.sync.get(['ttsEnabled'], function(data) {
        if (data.ttsEnabled) {
            console.log("TTS was previously enabled");
        }
    });
    
    // Add keyboard shortcut hint
    console.log("🎤 Voice Input: Click the microphone button, then click any text field and speak!");
});