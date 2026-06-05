const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const natural = require('natural');
const https = require('https');

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced dictionary with more words (FIXED: Added day/month/year)
const dictionary = {
    // Common spelling mistakes
    'recieve': 'receive',
    'recieved': 'received',
    'recieving': 'receiving',
    'definately': 'definitely',
    'definatly': 'definitely',
    'seperate': 'separate',
    'seperated': 'separated',
    'occured': 'occurred',
    'occuring': 'occurring',
    'accomodate': 'accommodate',
    'accomodation': 'accommodation',
    'embarass': 'embarrass',
    'embarassed': 'embarrassed',
    'embarassing': 'embarrassing',
    
    // Names
    'michal': 'michael',
    'jonh': 'john',
    'jhon': 'john',
    'jenifer': 'jennifer',
    'chistopher': 'christopher',
    'christoper': 'christopher',
    'mathew': 'matthew',
    'josh': 'joshua',
    
    // Email related
    'emial': 'email',
    'emali': 'email',
    'eamil': 'email',
    'gmial': 'gmail',
    'gamil': 'gmail',
    'yaho': 'yahoo',
    'hotmai': 'hotmail',
    'hotmal': 'hotmail',
    
    // Address related
    'adress': 'address',
    'addres': 'address',
    'adres': 'address',
    'adrees': 'address',
    'streer': 'street',
    'stret': 'street',
    'avenue': 'ave',
    'appartment': 'apartment',
    'aprtment': 'apartment',
    
    // Form fields
    'pasword': 'password',
    'passwrd': 'password',
    'paswrd': 'password',
    'pssword': 'password',
    'frist': 'first',
    'firts': 'first',
    'lastt': 'last',
    'lasst': 'last',
    'middel': 'middle',
    'surnmae': 'surname',
    'surrname': 'surname',
    
    // Phone
    'phne': 'phone',
    'phonne': 'phone',
    'mobil': 'mobile',
    'telephon': 'telephone',
    'celll': 'cell',
    
    // Other
    'contat': 'contact',
    'confrim': 'confirm',
    'submt': 'submit',
    'cntry': 'country',
    'citty': 'city',
    'zipcde': 'zipcode',
    'statte': 'state',
    'county': 'country',
    'birht': 'birth',
    'birhday': 'birthday',
    'datte': 'date',
    
    // ADDED: Day/month/year variations (COMPLETE LIST)
    'day': 'day',
    'daY': 'day',
    'dya': 'day',
    'daz': 'day',
    'dey': 'day',
    'month': 'month',
    'mnth': 'month',
    'mnt': 'month',
    'mont': 'month',
    'monht': 'month',
    'monh': 'month',
    'year': 'year',
    'yr': 'year',
    'yer': 'year',
    'yeer': 'year',
    'yera': 'year',
    
    // Date formats
    'january': 'january',
    'february': 'february',
    'march': 'march',
    'april': 'april',
    'may': 'may',
    'june': 'june',
    'july': 'july',
    'august': 'august',
    'september': 'september',
    'october': 'october',
    'november': 'november',
    'december': 'december',
    
    // Short months
    'jan': 'jan',
    'feb': 'feb',
    'mar': 'mar',
    'apr': 'apr',
    'jun': 'jun',
    'jul': 'jul',
    'aug': 'aug',
    'sep': 'sep',
    'sept': 'sep',
    'oct': 'oct',
    'nov': 'nov',
    'dec': 'dec'
};

// Create spellchecker
const spellcheck = new natural.Spellcheck(Object.keys(dictionary));

// ========== GRAMMAR CHECKER FUNCTION ==========
async function checkGrammar(text) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            text: text,
            language: 'en-US'
        });

        const options = {
            hostname: 'api.languagetool.org',
            path: '/v2/check',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    const matches = result.matches || [];
                    
                    const corrections = matches.map(match => ({
                        message: match.message,
                        original: match.context.text.substring(
                            match.context.offset, 
                            match.context.offset + match.context.length
                        ),
                        suggestions: match.replacements.map(r => r.value),
                        offset: match.context.offset,
                        length: match.context.length,
                        rule: match.rule.id
                    }));
                    
                    resolve({
                        corrected: applyCorrections(text, corrections),
                        corrections: corrections,
                        count: corrections.length
                    });
                } catch (error) {
                    resolve({ corrected: text, corrections: [], count: 0 });
                }
            });
        });

        req.on('error', (error) => {
            console.log('Grammar check error:', error);
            resolve({ corrected: text, corrections: [], count: 0 });
        });

        req.write(postData);
        req.end();
    });
}

// Helper function to apply corrections
function applyCorrections(text, corrections) {
    let result = text;
    const sorted = [...corrections].sort((a, b) => b.offset - a.offset);
    
    for (let corr of sorted) {
        if (corr.suggestions && corr.suggestions.length > 0) {
            const before = result.substring(0, corr.offset);
            const after = result.substring(corr.offset + corr.length);
            result = before + corr.suggestions[0] + after;
        }
    }
    return result;
}

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'FormEase Pro API',
        version: '2.0.0',
        status: 'online',
        message: 'Server is running!',
        dictionary_size: Object.keys(dictionary).length,
        endpoints: {
            health: '/api/health',
            spelling_check: '/api/spelling/check',
            spelling_batch: '/api/spelling/batch',
            spelling_learn: '/api/spelling/learn',
            spelling_stats: '/api/spelling/stats',
            grammar_check: '/api/grammar/check',
            grammar_batch: '/api/grammar/batch'
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        dictionary_size: Object.keys(dictionary).length
    });
});

// ========== SPELLING ENDPOINTS ==========

// Spell check endpoint
app.post('/api/spelling/check', (req, res) => {
    const startTime = Date.now();
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ 
            error: true,
            message: 'Text is required' 
        });
    }
    
    const original = text;
    const lowerText = text.toLowerCase().trim();
    
    console.log(`🔍 Checking spelling: "${text}"`);
    
    // Check exact match in dictionary
    if (dictionary[lowerText]) {
        console.log(`✅ Dictionary match: ${text} -> ${dictionary[lowerText]}`);
        return res.json({
            original,
            corrected: dictionary[lowerText],
            corrections: [{
                original: text,
                corrected: dictionary[lowerText],
                confidence: 1.0
            }],
            confidence: 1.0,
            processing_time: (Date.now() - startTime) / 1000,
            source: 'dictionary'
        });
    }
    
    // Try natural spellcheck
    try {
        const suggestions = spellcheck.getCorrections(lowerText, 3);
        
        if (suggestions && suggestions.length > 0 && suggestions[0] !== lowerText) {
            console.log(`🤖 Natural match: ${text} -> ${suggestions[0]}`);
            return res.json({
                original,
                corrected: suggestions[0],
                corrections: suggestions.map(s => ({
                    original: lowerText,
                    corrected: s,
                    confidence: 0.85
                })),
                confidence: 0.85,
                processing_time: (Date.now() - startTime) / 1000,
                source: 'natural'
            });
        }
    } catch (error) {
        console.log('Natural error:', error.message);
    }
    
    // No correction found
    console.log(`❌ No spelling correction for: ${text}`);
    res.json({
        original,
        corrected: text,
        corrections: [],
        confidence: 1.0,
        processing_time: (Date.now() - startTime) / 1000,
        source: 'none'
    });
});

// Batch spell check
app.post('/api/spelling/batch', (req, res) => {
    const startTime = Date.now();
    const { texts } = req.body;
    
    if (!texts || !Array.isArray(texts)) {
        return res.status(400).json({
            error: true,
            message: 'Texts array is required'
        });
    }
    
    const results = texts.map(text => {
        const lowerText = text.toLowerCase().trim();
        
        if (dictionary[lowerText]) {
            return {
                original: text,
                corrected: dictionary[lowerText],
                source: 'dictionary'
            };
        }
        
        return {
            original: text,
            corrected: text,
            source: 'none'
        };
    });
    
    res.json({
        results,
        count: results.length,
        processing_time: (Date.now() - startTime) / 1000
    });
});

// Learn new corrections
app.post('/api/spelling/learn', (req, res) => {
    const { wrong, correct } = req.body;
    
    if (!wrong || !correct) {
        return res.status(400).json({
            error: true,
            message: 'Wrong and correct words are required'
        });
    }
    
    const lowerWrong = wrong.toLowerCase().trim();
    const lowerCorrect = correct.toLowerCase().trim();
    
    // Add to dictionary
    dictionary[lowerWrong] = lowerCorrect;
    
    // Update spellchecker
    spellcheck.words = Object.keys(dictionary);
    
    console.log(`📚 Learned spelling: ${wrong} -> ${correct}`);
    
    res.json({
        success: true,
        message: `Learned: ${wrong} → ${correct}`,
        dictionary_size: Object.keys(dictionary).length
    });
});

// Get dictionary stats
app.get('/api/spelling/stats', (req, res) => {
    res.json({
        total_words: Object.keys(dictionary).length,
        dictionary: dictionary
    });
});

// ========== GRAMMAR CHECK ENDPOINTS ==========

app.post('/api/grammar/check', async (req, res) => {
    const startTime = Date.now();
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ 
            error: true, 
            message: 'Text is required' 
        });
    }
    
    console.log(`📝 Grammar check: "${text.substring(0,50)}${text.length > 50 ? '...' : ''}"`);
    
    const result = await checkGrammar(text);
    
    res.json({
        original: text,
        ...result,
        processing_time: (Date.now() - startTime) / 1000
    });
});

// Batch grammar check
app.post('/api/grammar/batch', async (req, res) => {
    const { texts } = req.body;
    
    if (!texts || !Array.isArray(texts)) {
        return res.status(400).json({ error: true, message: 'Texts array required' });
    }
    
    const results = [];
    for (let text of texts) {
        const result = await checkGrammar(text);
        results.push({
            original: text,
            corrected: result.corrected,
            corrections: result.corrections
        });
    }
    
    res.json({
        results,
        count: results.length
    });
});

// ========== ADD HEALTH CHECK ENDPOINT FOR BACKEND STATUS ==========
app.get('/api/backend-status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: Date.now(),
        version: '2.0.0',
        features: {
            spelling: true,
            grammar: true,
            learning: true
        }
    });
});

// ========== ADD CORS PREFLIGHT HANDLING ==========
app.options('*', cors());

// ========== ERROR HANDLING MIDDLEWARE ==========
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({
        error: true,
        message: 'Internal server error',
        timestamp: Date.now()
    });
});

// ========== 404 HANDLER ==========
app.use((req, res) => {
    res.status(404).json({
        error: true,
        message: 'Endpoint not found',
        path: req.path
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 FormEase Pro Backend Server v2.0');
    console.log('='.repeat(60));
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`📚 Dictionary: ${Object.keys(dictionary).length} words`);
    console.log('\n📌 Available Endpoints:');
    console.log(`   • Health: http://localhost:${PORT}/api/health`);
    console.log(`   • Backend Status: http://localhost:${PORT}/api/backend-status`);
    console.log(`   • Spelling check: POST /api/spelling/check`);
    console.log(`   • Spelling learn: POST /api/spelling/learn`);
    console.log(`   • Grammar check: POST /api/grammar/check`);
    console.log('='.repeat(60) + '\n');
    
    // Log dictionary sample for debugging
    console.log('📖 Dictionary sample (day/month/year):');
    const sampleWords = ['day', 'month', 'year', 'jan', 'feb', 'mar'];
    sampleWords.forEach(word => {
        if (dictionary[word]) {
            console.log(`   • ${word} -> ${dictionary[word]}`);
        }
    });
    console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});