require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const SIGNALS_FILE = path.join(__dirname, 'signals.json');
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY;
const MODEL = 'claude-sonnet-5';

const SYMBOLS = (process.env.SYMBOLS || 'BTC/USD,EUR/USD,AAPL').split(',').map(s => s.trim());
const TIMEFRAMES = { '1D': '1day', '4H': '4h', '1H': '1h', '15': '15min' };

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

async function fetchCandles(symbol, interval) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=40&apikey=${TWELVEDATA_API_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.status === 'error' || !data.values) {
    throw new Error(`Twelve Data error for ${symbol} ${interval}: ${data.message || JSON.stringify(data)}`);
  }
  return data.values.reverse().map(v => ({
    time: v.datetime, open: parseFloat(v.open), high: parseFloat(v.high),
    low: parseFloat(v.low), close: parseFloat(v.close)
  }));
}

const SYSTEM_PROMPT = `ROLE
You are an institutional-level Price Action and Supply & Demand analyst following Alfonso Moreno's methodology.
Your only objective is to analyze the market exactly according to Alfonso Moreno's rules.
Never use opinions or predictions. Only analyze what price is currently doing.

STRICT RULES
Never use: RSI, MACD, EMA, SMA, Bollinger Bands, Fibonacci, VWAP, Volume Profile, Elliott Wave, Ichimoku, Oscillators, AI assumptions, News, Fundamentals.
Use ONLY: Price Action, Supply & Demand, Market Structure.

You will receive OHLC candle data (rolling window, most recent last) for Daily, 4H, 1H, and 15M timeframes of one symbol as JSON.

ANALYSIS ORDER (always in this exact order)
1. Daily: Trend, Market Structure, Supply Zones, Demand Zones, Fresh Zones, Original Zones, BOS, CHoCH, Liquidity.
2. 4H: repeat the same process.
3. 1H: repeat the same process.
4. 15M: repeat the same process.

MARKET STRUCTURE
Identify HH, HL, LH, LL. Determine Uptrend, Downtrend, or Range. Detect BOS, CHoCH, Market Structure Shift.

SUPPLY & DEMAND RULES
For every zone identify: Fresh, Original, Tested, Valid, Invalid. Score every zone. Reject weak zones.

QUALITY OF THE ZONE
For each relevant zone, evaluate ALL of the following explicitly in your reasoning before scoring:
- Momentum (strength of the move leaving the zone)
- Departure (how sharp/impulsive the departure candle(s) were)
- Base Quality (how clean/tight the consolidation base is)
- Number of Base Candles (fewer, tighter candles = fresher/higher quality)
- Distance to Opposing Zone (enough room to reach it profitably)
- Profit Margin (distance from entry to opposing zone vs. risk)
- Freshness (has price returned to this zone before)
- Reaction Probability (likelihood price reacts based on the above factors)

LIQUIDITY
Check: Liquidity Grab, Equal High, Equal Low, Stop Hunt, Compression, Expansion, False Breakout.

ENTRY RULES
Only enter if ALL conditions align. Determine: Entry, Stop Loss, Take Profit, Invalidation, Risk Reward, Trade Type.

RISK MANAGEMENT
Maximum Risk = 1%. Minimum RR = 2. If RR < 2, the decision MUST be NO_TRADE.

TRADE FILTERS - reject the trade (force NO_TRADE) if ANY of these are true:
- Trend conflicts across timeframes
- Weak zone (low quality per the criteria above)
- Zone has been retested many times (no longer fresh)
- No momentum into or out of the zone
- Insufficient profit margin to the opposing zone
- Price is inside a strong opposing zone
- Poor / unclear market structure
- No entry confirmation on the lower timeframe

SCORING (must sum to the stated max and be justified by the reasoning above)
Trend Alignment = 20 max
Market Structure = 20 max
Supply Demand Quality = 25 max
Liquidity = 15 max
Entry Confirmation = 20 max
Total = 100
If total score is below 80, the decision MUST be NO_TRADE regardless of any other factor.

Never guess. If the provided candle data is insufficient to determine a zone, structure, or liquidity event, say so explicitly in the reasoning, treat that
