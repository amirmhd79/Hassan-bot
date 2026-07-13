require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const SIGNALS_FILE = path.join(__dirname, 'signals.json');
const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

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

Never guess. If the provided candle data is insufficient to determine a zone, structure, or liquidity event, say so explicitly in the reasoning, treat that criterion as failing, and lower the score accordingly.

OUTPUT
Respond with ONLY valid JSON, no markdown fences, no preamble, no text outside the JSON, matching exactly this schema:
{
  "symbol": string,
  "generated_at": ISO8601 string,
  "daily_bias": string, "h4_bias": string, "h1_bias": string, "m15_bias": string,
  "trend": string,
  "market_structure": string,
  "current_supply_zone": string,
  "current_demand_zone": string,
  "fresh_zone": string,
  "original_zone": string,
  "liquidity_status": string,
  "bos": string,
  "choch": string,
  "zone_quality": {
    "momentum": string, "departure": string, "base_quality": string,
    "number_of_base_candles": string, "distance_to_opposing_zone": string,
    "profit_margin": string, "freshness": string, "reaction_probability": string
  },
  "trade_filters_triggered": string[],
  "entry": number | null,
  "stop_loss": number | null,
  "take_profit_1": number | null,
  "take_profit_2": number | null,
  "take_profit_3": number | null,
  "risk_reward": number | null,
  "confidence_pct": number,
  "score_breakdown": {
    "trend_alignment": number, "market_structure": number,
    "supply_demand_quality": number, "liquidity": number, "entry_confirmation": number
  },
  "trade_score": number,
  "decision": "BUY" | "SELL" | "NO_TRADE",
  "reasoning": string
}
Explain every decision based only on Price Action and Supply & Demand. Never guess. If information is insufficient, clearly state that no valid setup exists and return NO_TRADE.`;

async function analyzeWithAI(symbol, candleData) {
  const userMessage = `Symbol: ${symbol}\nCandle data (JSON, per timeframe, most recent last):\n${JSON.stringify(candleData)}`;
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://sd-bot.local',
      'X-Title': 'SD Analysis Bot'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ]
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('OpenRouter API error: ' + JSON.stringify(data));
  const text = data.choices[0].message.content;
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function runAnalysis(symbol) {
  const candleData = {};
  for (const [label, interval] of Object.entries(TIMEFRAMES)) {
    candleData[label] = await fetchCandles(symbol, interval);
  }
  const result = await analyzeWithAI(symbol, candleData);
  const signals = readJSON(SIGNALS_FILE, {});
  signals[symbol] = result;
  writeJSON(SIGNALS_FILE, signals);
  return result;
}

app.get('/api/analyze/:symbol', async (req, res) => {
  try {
    const result = await runAnalysis(decodeURIComponent(req.params.symbol));
    res.json({ status: 'ok', result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/signals', (req, res) => {
  res.json(readJSON(SIGNALS_FILE, {}));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
