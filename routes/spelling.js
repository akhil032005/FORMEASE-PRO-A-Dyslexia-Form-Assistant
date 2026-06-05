const express = require('express');
const router = express.Router();
const natural = require('natural');
const Fuse = require('fuse.js');

module.exports = (dictionary) => {
    
    // Setup Fuse.js for fuzzy matching (better than Levenshtein)
    const fuseOptions = {
        includeScore: true,
        threshold: 0.4,
        keys: ['word']
    };
    
    // Create searchable list
    const dictionaryList = Object.keys(dictionary.flat).map(word => ({
        word: word,
        correction: dictionary.flat[word]
    }));
    
    const fuse = new Fuse(dictionaryList, fuseOptions);
    
    // ===== SPELL CHECK ENDPOINT =====
    router.post('/check', (req, res) => {
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
        
        console.log(`🔍 Checking: "${text}"`);
        
        // 1. Check exact match in dictionary
        if (dictionary.flat[lowerText]) {
            console.log(`✅ Dictionary match: ${text} -> ${dictionary.flat[lowerText]}`);
            return res.json({
                original,
                corrected: dictionary.flat[lowerText],
                corrections: [{
                    original: text,
                    corrected: dictionary.flat[lowerText],
                    confidence: 1.0
                }],
                confidence: 1.0,
                processing_time: (Date.now() - startTime) / 1000,
                source: 'dictionary'
            });
        }
        
        // 2. Try natural's spellcheck
        try {
            const spellcheck = new natural.Spellcheck(Object.keys(dictionary.flat));
            const suggestions = spellcheck.getCorrections(lowerText, 3);
            
            if (suggestions && suggestions.length > 0 && suggestions[0] !== lowerText) {
                console.log(`🤖 Natural match: ${text} -> ${suggestions[0]}`);
                return res.json({
                    original,
                    corrected: suggestions[0],
                    corrections: suggestions.map(s => ({
                        original: lowerText,
                        corrected: s,
                        confidence: 0.8
                    })),
                    confidence: 0.8,
                    processing_time: (Date.now() - startTime) / 1000,
                    source: 'natural'
                });
            }
        } catch (error) {
            console.log('Natural error:', error.message);
        }
        
        // 3. Try Fuse.js fuzzy search
        try {
            const results = fuse.search(lowerText);
            
            if (results.length > 0 && results[0].score < 0.4) {
                const bestMatch = results[0];
                console.log(`🔍 Fuse match: ${text} -> ${bestMatch.item.correction} (score: ${bestMatch.score})`);
                
                return res.json({
                    original,
                    corrected: bestMatch.item.correction,
                    corrections: results.slice(0, 3).map(r => ({
                        original: r.item.word,
                        corrected: r.item.correction,
                        confidence: 1 - r.score
                    })),
                    confidence: 1 - bestMatch.score,
                    processing_time: (Date.now() - startTime) / 1000,
                    source: 'fuse'
                });
            }
        } catch (error) {
            console.log('Fuse error:', error.message);
        }
        
        // No correction found
        console.log(`❌ No correction for: ${text}`);
        res.json({
            original,
            corrected: text,
            corrections: [],
            confidence: 1.0,
            processing_time: (Date.now() - startTime) / 1000,
            source: 'none'
        });
    });
    
    // ===== BATCH CHECK =====
    router.post('/batch', (req, res) => {
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
            
            if (dictionary.flat[lowerText]) {
                return {
                    original: text,
                    corrected: dictionary.flat[lowerText],
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
    
    // ===== LEARNING ENDPOINT =====
    router.post('/learn', (req, res) => {
        const { wrong, correct } = req.body;
        
        if (!wrong || !correct) {
            return res.status(400).json({
                error: true,
                message: 'Wrong and correct words are required'
            });
        }
        
        const lowerWrong = wrong.toLowerCase();
        const lowerCorrect = correct.toLowerCase();
        
        // Add to dictionary
        if (!dictionary.common) dictionary.common = {};
        dictionary.common[lowerWrong] = lowerCorrect;
        dictionary.flat[lowerWrong] = lowerCorrect;
        
        // Update Fuse list
        dictionaryList.push({
            word: lowerWrong,
            correction: lowerCorrect
        });
        
        console.log(`📚 Learned: ${wrong} -> ${correct}`);
        
        res.json({
            success: true,
            message: `Learned: ${wrong} → ${correct}`,
            dictionary_size: Object.keys(dictionary.flat).length
        });
    });
    
    // ===== STATS ENDPOINT =====
    router.get('/stats', (req, res) => {
        res.json({
            total_words: Object.keys(dictionary.flat).length,
            categories: Object.keys(dictionary).filter(k => k !== 'flat').map(cat => ({
                name: cat,
                count: Object.keys(dictionary[cat] || {}).length
            }))
        });
    });
    
    return router;
};