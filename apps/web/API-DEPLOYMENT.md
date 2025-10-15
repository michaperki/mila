# API Deployment Guide

This document explains how to deploy the translation API used by the ReadLearn application.

## Overview

ReadLearn includes an optional Google Translation API integration. This requires:

1. A Google Cloud account with the Translation API enabled
2. A server/serverless environment to host the proxy API
3. Environment variables to store API keys securely

## Option 1: Deploy to Vercel

The easiest way to deploy the API is using Vercel:

1. **Create a Vercel account** at [vercel.com](https://vercel.com) if you don't have one
2. **Install the Vercel CLI**:
   ```
   npm install -g vercel
   ```
3. **Log in to Vercel**:
   ```
   vercel login
   ```
4. **Deploy the API**:
   ```
   cd apps/web
   vercel
   ```
5. **Set up environment variables**:
   - Go to your project settings in the Vercel dashboard
   - Add the following environment variables:
     - `GOOGLE_API_KEY`: Your Google Cloud API key with Translation API access
     - `GCLOUD_PROJECT_ID`: Your Google Cloud project ID
   
6. **Redeploy with environment variables**:
   ```
   vercel --prod
   ```

## Option 2: Deploy to Netlify

Netlify also supports serverless functions:

1. **Create a Netlify account** at [netlify.com](https://netlify.com)
2. **Install the Netlify CLI**:
   ```
   npm install -g netlify-cli
   ```
3. **Log in to Netlify**:
   ```
   netlify login
   ```
4. **Initialize Netlify configuration**:
   ```
   netlify init
   ```
5. **Create a `netlify.toml` file**:
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"
     functions = "api"
   
   [[redirects]]
     from = "/api/*"
     to = "/.netlify/functions/:splat"
     status = 200
   ```
6. **Set up environment variables**:
   - Go to your project settings in the Netlify dashboard
   - Add the environment variables as described above
   
7. **Deploy to Netlify**:
   ```
   netlify deploy --prod
   ```

## Option 3: Self-Host

You can also self-host the API on any Node.js server:

1. Set up a Node.js server (e.g., Express)
2. Create an endpoint that uses the code from `api/translate.ts`
3. Configure environment variables on your server
4. Update the `VITE_API_BASE` environment variable in the client app to point to your server

## Setting Up Google Cloud Translation API

1. **Create a Google Cloud account** at [cloud.google.com](https://cloud.google.com)
2. **Create a new project** in the Google Cloud Console
3. **Enable the Cloud Translation API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Cloud Translation API" and enable it
4. **Create an API key**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create credentials" > "API key"
   - Restrict the key to only the Cloud Translation API
5. **Set up billing**:
   - The Translation API requires billing to be enabled
   - There is a free tier with monthly quotas

## Using the API in the App

The app will automatically use the real translation API if:

1. The `useRealTranslate` flag is set to `true` (via settings or environment)
2. The API is properly deployed and accessible

If the API fails for any reason, the app will automatically fall back to using mock translations.

## Environment Variables

### Server-side (API)
- `GOOGLE_API_KEY`: Your Google Cloud API key
- `GCLOUD_PROJECT_ID`: Your Google Cloud project ID

### Client-side (App)
- `VITE_USE_REAL_TRANSLATE`: Set to 'true' to enable real translation
- `VITE_API_BASE`: Base URL for the API (defaults to empty, which means same origin)

You can also configure these settings via the in-app settings UI.

## API Usage Limits

The free tier of Google Cloud Translation API has limitations:

- 500,000 characters per month
- After that, $20 per million characters

The API implementation includes:
- Caching to reduce API calls
- Character count limits to prevent excessive usage
- Client ID tracking for potential rate limiting