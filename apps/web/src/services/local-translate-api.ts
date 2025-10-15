/**
 * Local translation API implementation
 * This file provides a direct implementation of the translation API 
 * that can be used during local development without environment variables
 */

// Hard-code the API key directly for local testing
const GOOGLE_API_KEY = 'AIzaSyDW5Peea3tl_edEW95qisNN62upnQz9o-o';
const GCLOUD_PROJECT_ID = 'mila-374801';

// Simple in-memory cache
const cache = new Map<string, any>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

type TranslationRequest = {
  sourceLang: string;
  targetLang: string;
  sentences: string[];
  tokens?: string[][];
};

type TranslationResponse = {
  sentenceTranslations: string[];
  tokenGlosses?: string[][];
};

/**
 * Process a translation request
 */
export async function processTranslation(req: TranslationRequest): Promise<TranslationResponse> {
  try {
    // Validate request
    if (!req.sentences || !Array.isArray(req.sentences) || req.sentences.length === 0) {
      throw new Error('Missing or invalid sentences parameter');
    }

    // Create cache key
    const cacheKey = JSON.stringify(req);
    
    // Check cache
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('Using cached translation');
        return cached.value;
      }
    }

    // Call Google Translate API
    const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
    const body = {
      q: req.sentences,
      source: req.sourceLang || 'he',
      target: req.targetLang || 'en',
      format: 'text'
    };
    
    console.log('Calling Google Translation API');
    
    const apiResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!apiResp.ok) {
      const errorText = await apiResp.text();
      console.error('Google API error:', apiResp.status, errorText);
      throw new Error(`Google API error (${apiResp.status}): ${errorText}`);
    }
    
    const json = await apiResp.json();
    console.log('Translation API response received');
    
    const sentenceTranslations = json?.data?.translations?.map((t: any) => t.translatedText) || [];
    
    // Handle token glosses with real translation
    let tokenGlosses: string[][] | undefined;
    if (req.tokens && Array.isArray(req.tokens) && req.tokens.length > 0) {
      // Process each token group separately
      tokenGlosses = [];

      for (const tokenArray of req.tokens) {
        if (tokenArray.length === 0) {
          tokenGlosses.push([]);
          continue;
        }

        // Call Google Translate API for each token
        try {
          const tokenUrl = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
          const tokenBody = {
            q: tokenArray,
            source: req.sourceLang || 'he',
            target: req.targetLang || 'en',
            format: 'text'
          };

          const tokenResp = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokenBody)
          });

          if (!tokenResp.ok) {
            throw new Error(`Token translation error: ${tokenResp.status}`);
          }

          const tokenJson = await tokenResp.json();
          const tokenTranslations = tokenJson?.data?.translations?.map((t: any) => t.translatedText) || [];

          // Add the translated tokens to results
          tokenGlosses.push(tokenTranslations);
        } catch (error) {
          console.error('Token translation error:', error);
          // Fallback to placeholders if translation fails
          tokenGlosses.push(tokenArray.map(() => '—'));
        }
      }
    }
    
    const result: TranslationResponse = {
      sentenceTranslations,
      tokenGlosses
    };
    
    // Update cache
    cache.set(cacheKey, {
      value: result,
      timestamp: Date.now()
    });
    
    return result;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}