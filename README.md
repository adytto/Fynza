# Fynza

A polished personal finance dashboard built with React and Vite. This repository includes a working browser app with local persistence and optional Supabase sync.

## Features

- transactional dashboard
- income vs expense summaries
- month and category filters
- add, edit, and delete transactions
- budget and category mix insights
- local storage persistence
- optional Supabase sync if environment variables are configured

## Local development

1. Install dependencies:
   npm install
2. Copy `.env.example` to `.env` and fill in your Supabase project values.
3. Start the app:
   npm run dev
4. Build for production:
   npm run build

## Supabase setup

Create a `transactions` table in Supabase with columns like:

- id: uuid or text
- title: text
- type: text
- amount: numeric
- date: date
- category: text
- account: text
- notes: text
- user_id: text

If the app is running without Supabase environment variables, it falls back to local browser storage so it still works as a complete front-end demo.

## Deployment

This app is designed for a standard Vite deployment. If you want a public SaaS-style experience, deploy the frontend with Vercel or Netlify, and keep the marketing page or app shell separated as needed.
