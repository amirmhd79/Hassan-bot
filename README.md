# ربات خودکار تحلیل Supply & Demand (Alfonso Moreno Style)

**هشدار مهم:** این ابزار صرفاً یک کمک‌تحلیل‌گر است، نه یک مشاور مالی مجاز. خروجی مدل زبانی می‌تواند اشتباه باشد. قبل از هر معامله‌ی واقعی، تصمیم نهایی و مدیریت ریسک با خودت است.

## این سیستم چیکار می‌کند؟
سرور خودش هر چند دقیقه یک‌بار مستقیم به Twelve Data (سرویس رایگان که کریپتو، فارکس، و سهام را پوشش می‌دهد) وصل می‌شود، قیمت را می‌گیرد، و خودکار به Claude API می‌فرستد تا طبق منطق Supply & Demand تحلیل کند. نتیجه در یک داشبورد ساده‌ی وب نمایش داده می‌شود.

## مراحل راه‌اندازی

### ۱. گرفتن دو تا کلید رایگان
- Claude API Key: console.anthropic.com
- Twelve Data API Key: twelvedata.com

### ۲. دیپلوی روی Render
1. render.com -> Sign up با گیت‌هاب
2. New + -> Web Service -> ریپوی sd-bot را انتخاب کن
3. Build Command: npm install
4. Start Command: npm start
5. Environment Variables اضافه کن:
   - CLAUDE_API_KEY
   - TWELVEDATA_API_KEY
   - SYMBOLS = BTC/USD,EUR/USD,AAPL
   - RUN_EVERY_MINUTES = 15

### ۳. دیدن نتیجه
- داشبورد: آدرس-سرور/dashboard.html
- تحلیل فوری یک نماد: آدرس-سرور/api/analyze/AAPL

## محدودیت‌های واقعی
- پلن رایگان Twelve Data محدودیت تعداد درخواست دارد.
- تحلیل مدل زبانی، محاسبه‌ی قطعی ریاضی نیست.
- این سیستم معامله‌گری خودکار نیست؛ فقط سیگنال تولید می‌کند.
