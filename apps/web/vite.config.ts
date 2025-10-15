import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createServer } from 'http';
import { execSync } from 'child_process';

// Function to check if Node.js is installed
const isNodeInstalled = () => {
  try {
    execSync('node --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
};

export default defineConfig(({ mode }) => {
  // Load env file based on mode
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'icons/*.svg',
          'icons/*.png',
          'ocr-models/*.traineddata',
        ],
        manifest: false, // We're using a custom manifest file
        workbox: {
          globPatterns: [
            '**/*.{js,css,html,ico,png,svg}',
            'ocr-models/*.traineddata',
            'icons/*.svg',
            'icons/*.png',
          ],
          // Cache the Tesseract.js worker and language data
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/raw\.githubusercontent\.com\/naptha\/tessdata\/.*\.traineddata$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tesseract-lang-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tesseract-cdn-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
          ],
        },
      }),
      basicSsl(),
      // Local API server middleware
      {
        name: 'local-api-server',
        configureServer(server) {
          // Check if Node.js is available before trying to use API route
          if (isNodeInstalled()) {
            server.middlewares.use('/api/translate', async (req, res) => {
              // Only handle POST requests
              if (req.method === 'POST') {
                try {
                  // Get request body
                  const chunks = [];
                  for await (const chunk of req) {
                    chunks.push(chunk);
                  }
                  const body = Buffer.concat(chunks).toString();
                  const requestBody = JSON.parse(body || '{}');
                  
                  try {
                    // Import the local translation service
                    console.log('Local API server: Processing translation request');
                    const translationModule = await import('./src/services/local-translate-api');
                    const result = await translationModule.processTranslation(requestBody);
                    
                    // Return the response
                    res.setHeader('Content-Type', 'application/json');
                    res.statusCode = 200;
                    res.end(JSON.stringify(result));
                    
                  } catch (error) {
                    // Handle any errors
                    console.error('Translation API error:', error);
                    res.setHeader('Content-Type', 'application/json');
                    res.statusCode = 500;
                    res.end(JSON.stringify({ 
                      error: 'Translation service unavailable',
                      message: error.message 
                    }));
                  }
                } catch (error) {
                  console.error('API error:', error);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ 
                    error: 'Internal Server Error',
                    message: error.message
                  }));
                }
              } else {
                // Handle OPTIONS requests for CORS
                if (req.method === 'OPTIONS') {
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                  res.statusCode = 200;
                  res.end();
                } else {
                  res.statusCode = 405;
                  res.end('Method Not Allowed');
                }
              }
            });
          } else {
            console.warn('Node.js not detected. Local API server will not be available.');
          }
        }
      }
    ],
    server: {
      host: true
    },
  }
});