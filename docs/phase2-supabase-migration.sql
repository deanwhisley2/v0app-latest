-- Phase 2 tables for Expert/Joelin/Auto-Trader
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS "AnalysisHistory" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "timeWindow" INT NOT NULL,
  action TEXT NOT NULL,
  confidence INT NOT NULL,
  reasons TEXT[],
  "entryPrice" FLOAT,
  timestamp TIMESTAMP DEFAULT NOW(),
  "tradeExecuted" BOOLEAN DEFAULT FALSE,
  "tradeResult" JSONB
);

CREATE TABLE IF NOT EXISTS "NotificationRecord" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence INT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  deleted BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "TradeSession" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  "totalAmount" FLOAT NOT NULL,
  "usedAmount" FLOAT DEFAULT 0,
  "startTime" TIMESTAMP DEFAULT NOW(),
  "endTime" TIMESTAMP,
  config JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS "TradeOrder" (
  id TEXT PRIMARY KEY,
  "sessionId" TEXT REFERENCES "TradeSession"(id),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  type TEXT NOT NULL,
  price FLOAT NOT NULL,
  quantity FLOAT NOT NULL,
  "quoteAmount" FLOAT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "filledAt" TIMESTAMP
);
