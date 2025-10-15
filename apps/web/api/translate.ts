import type { VercelRequest, VercelResponse } from '@vercel/node';

// Environment variables for Google Cloud
// These should be set in your deployment platform (Vercel, Netlify, Cloudflare)
const GOOGLE_PROJECT_ID = process.env.GCLOUD_PROJECT_ID || process.env.VITE_GCLOUD_PROJECT_ID || '';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY || '';

// Debug log
console.log('Translation API: Environment check', {
  hasApiKey: !!GOOGLE_API_KEY,
  hasProjectId: !!GOOGLE_PROJECT_ID,
  nodeEnv: process.env.NODE_ENV
});

// Simple in-memory cache (will reset on function cold start)
interface CacheItem {
  value: any;
  timestamp: number;
}

const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const MAX_CACHE_ITEMS = 1000;
const cache = new Map<string, CacheItem>();

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // In production, restrict this to your domain
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Serverless handler function for translation API
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).set(corsHeaders).end();
    return;
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405)
      .set(corsHeaders)
      .json({ error: 'Method not allowed' });
  }
  
  try {
    // Validate API key
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY environment variable not configured');
    }
    
    // Parse request body
    const { 
      sourceLang = 'he', 
      targetLang = 'en', 
      sentences = [], 
      tokens = [] 
    } = req.body || {};
    
    // Validate required parameters
    if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
      return res.status(400)
        .set(corsHeaders)
        .json({ error: 'Missing or invalid sentences parameter' });
    }
    
    // Limit request size
    const totalCharacters = sentences.reduce((sum, s) => sum + s.length, 0);
    if (totalCharacters > 5000) {
      return res.status(400)
        .set(corsHeaders)
        .json({ error: 'Request too large. Maximum 5000 characters allowed.' });
    }
    
    // Create cache key
    const cacheKey = JSON.stringify({
      sourceLang,
      targetLang,
      sentences,
      tokens
    });
    
    // Check cache
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return res.status(200)
          .set(corsHeaders)
          .json(cached.value);
      }
    }
    
    // Translate sentences
    let sentenceTranslations: string[];
    
    try {
      // Call Google Translate API
      const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
      const body = {
        q: sentences,
        source: sourceLang,
        target: targetLang,
        format: 'text'
      };
      
      const resp = await fetch(url, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Google API error (${resp.status}): ${errorText}`);
      }
      
      const json = await resp.json();
      sentenceTranslations = json?.data?.translations?.map((t: any) => t.translatedText) || [];
      
      if (sentenceTranslations.length !== sentences.length) {
        throw new Error('Unexpected response format from Google API');
      }
    } catch (error) {
      console.error('Translation API error:', error);
      return res.status(500)
        .set(corsHeaders)
        .json({ error: 'Translation service unavailable' });
    }
    
    // Handle token glosses (basic implementation)
    let tokenGlosses: string[][] | undefined;
    
    if (tokens && Array.isArray(tokens) && tokens.length > 0) {
      // For this basic implementation, we'll return placeholder glosses
      // A full implementation would use Google Translate API for each token
      // or use a glossary/dictionary API
      tokenGlosses = tokens.map(tokenArray => 
        tokenArray.map(() => '—')
      );
    }
    
    // Prepare response
    const result = {
      sentenceTranslations,
      tokenGlosses
    };
    
    // Update cache (with basic LRU cache eviction)
    if (cache.size >= MAX_CACHE_ITEMS) {
      // Remove oldest entry
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    
    cache.set(cacheKey, {
      value: result,
      timestamp: Date.now()
    });
    
    // Return response
    return res.status(200)
      .set(corsHeaders)
      .json(result);
      
  } catch (error) {
    console.error('Unhandled error:', error);
    return res.status(500)
      .set(corsHeaders)
      .json({ 
        error: 'Internal server error', 
        message: process.env.NODE_ENV === 'development' 
          ? (error as Error).message 
          : undefined 
      });
  }
}