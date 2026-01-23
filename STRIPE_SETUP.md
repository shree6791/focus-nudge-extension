# Stripe Payment Integration Setup

## Overview

Focus Nudge now supports Stripe payments for Pro subscriptions. This guide will help you set up the complete payment flow.

## Architecture

```
Extension (Chrome) → Backend API → Stripe
     ↓                    ↓
  License Check    Webhook Handler
     ↓                    ↓
  Pro Features    License Storage
```

## Step 1: Set Up Stripe Account

1. **Create Stripe Account**: Go to [stripe.com](https://stripe.com) and create an account
2. **Get API Keys**: 
   - Go to [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys)
   - Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)
   - **Note**: Publishable key is NOT needed since we use Stripe Checkout (server-side redirect), not Stripe.js

## Step 2: Set Up Backend Server

### 2.1 Install Dependencies

```bash
cd backend
npm install
```

### 2.2 Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Stripe keys:
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...  # Will get this after webhook setup
   STRIPE_PRICE_ID=price_xxxxx  # Required: Your Stripe Price ID
   BACKEND_URL=https://your-backend-url.com  # Optional: defaults to render.com URL
   PORT=3000
   ```
   
   **Note**: `STRIPE_PUBLISHABLE_KEY` is NOT needed - we use Stripe Checkout (server-side redirect), not Stripe.js (client-side)
   
   **Note on STRIPE_PRICE_ID**: 
   - **Required**: Must be set to your Stripe Price ID (starts with `price_`)
   - You can find this in Stripe Dashboard → Products → Your Product → Pricing section
   - The server will exit with an error if this is not set

### 2.3 Deploy Backend

**Option A: Stripe CLI (Recommended for Local Testing)**
```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Or download from: https://stripe.com/docs/stripe-cli

# Start your backend server
npm start

# In another terminal, forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhook

# This will give you a webhook signing secret (whsec_...)
# Copy this to your .env file as STRIPE_WEBHOOK_SECRET
```

**Option B: Free Hosting (Railway/Render/Heroku)**
```bash
# Railway (easiest, free tier available)
# 1. Go to railway.app
# 2. New Project → Deploy from GitHub
# 3. Add environment variables
# 4. Get your URL: https://your-app.railway.app

# Render (free tier)
# 1. Go to render.com
# 2. New Web Service → Connect GitHub
# 3. Add environment variables
# 4. Get your URL: https://your-app.onrender.com

# Heroku (free tier discontinued, but still works)
# 1. Install Heroku CLI
# 2. heroku create your-app-name
# 3. git push heroku main
# 4. heroku config:set STRIPE_SECRET_KEY=...
```

**Option C: Other Tunneling Services**
```bash
# Cloudflare Tunnel (free)
cloudflared tunnel --url http://localhost:3000

# LocalTunnel (free, npm package)
npx localtunnel --port 3000

# Serveo (SSH-based, free)
ssh -R 80:localhost:3000 serveo.net
```

## Step 3: Configure Stripe Webhook

### Option A: Stripe CLI (Local Testing - No Public URL Needed)

1. **Install Stripe CLI**: 
   - macOS: `brew install stripe/stripe-cli/stripe`
   - Or download from [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli)

2. **Start webhook forwarding**:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```

3. **Copy webhook secret**: The CLI will output a webhook signing secret (starts with `whsec_`)
   - Copy this to your `.env` file as `STRIPE_WEBHOOK_SECRET`

4. **No webhook setup needed in Stripe Dashboard** - CLI handles it automatically!

### Option B: Deploy to Free Hosting (For Webhook Testing)

1. **Deploy backend** to Railway/Render/Heroku (see Step 2.3)

2. **Go to Stripe Dashboard → Webhooks**: [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)

3. **Add Endpoint**:
   - Endpoint URL: `https://your-app.railway.app/api/webhook` (or your hosting URL)

4. **Select Events**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

5. **Copy Webhook Secret**: After creating, copy the signing secret (starts with `whsec_`) to your `.env` file

## Step 4: Update Extension Configuration

### 4.1 Update Backend URL

Edit `extension/src/shared/plan.js`:
```javascript
const API_BASE_URL = 'https://your-backend-domain.com'; // Update this
```


### 4.3 Update Manifest Host Permissions

Edit `extension/manifest.json`:
```json
"host_permissions": [
  "https://www.linkedin.com/*",
  "https://your-backend-domain.com/*"
]
```

## Step 5: Test the Flow

### 5.1 Test Backend (Local)

```bash
# Start backend
cd backend
npm start

# Test health endpoint
curl http://localhost:3000/health

# Test license verification (should return false for new user)
curl "http://localhost:3000/api/verify-license?userId=test123&licenseKey=test"
```

### 5.2 Test with Stripe CLI (Recommended)

```bash
# Terminal 1: Start backend
cd backend
npm start

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:3000/api/webhook
# Copy the webhook secret (whsec_...) to .env

# Terminal 3: Trigger test events (optional)
stripe trigger checkout.session.completed
```

### 5.3 Test Extension

1. **Load Extension**: Load unpacked extension in Chrome
2. **Update API URL**: In `plan.js`, set `API_BASE_URL = 'http://localhost:3000'` (for local testing)
3. **Open Options**: Right-click extension → Options
4. **Click "Upgrade to Pro"**: Should redirect to Stripe Checkout
5. **Use Test Card**: 
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., 12/34)
   - CVC: Any 3 digits (e.g., 123)
   - ZIP: Any 5 digits (e.g., 12345)
6. **Complete Payment**: After payment, Stripe CLI will forward webhook to your local server
7. **Verify Pro**: Options page should show "Pro" status after license activates

## Step 6: Production Checklist

- [ ] Switch to Stripe Live keys (not test keys)
- [ ] Update backend URL in extension
- [ ] Update manifest host_permissions with production URL
- [ ] Set up database for license storage (replace in-memory Map)
- [ ] Add error monitoring (Sentry, etc.)
- [ ] Set up SSL certificate for backend
- [ ] Test webhook with Stripe CLI or production webhook
- [ ] Remove dev toggle from production builds
- [ ] Test complete payment flow end-to-end

## Troubleshooting

### Webhook Not Receiving Events

**If using Stripe CLI:**
1. **Check CLI is running**: `stripe listen --forward-to localhost:3000/api/webhook`
2. **Verify Secret**: Make sure `STRIPE_WEBHOOK_SECRET` matches CLI output
3. **Check Backend Logs**: Backend should log webhook events
4. **Test webhook manually**:
   ```bash
   stripe trigger checkout.session.completed
   ```

**If using hosted backend:**
1. **Check Webhook URL**: Must be publicly accessible
2. **Verify Secret**: Make sure `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
3. **Check Logs**: Backend should log webhook events
4. **Test in Stripe Dashboard**: Go to Webhooks → Click on your endpoint → "Send test webhook"

### License Not Activating

1. **Check Webhook**: Verify `checkout.session.completed` event is received
2. **Check User ID**: Make sure `client_reference_id` is set correctly
3. **Check Backend Logs**: Look for license activation messages
4. **Verify License Key**: Check storage after webhook processes

### Extension Can't Connect to Backend

1. **Check CORS**: Backend should allow extension origin
2. **Check Host Permissions**: Manifest must include backend URL
3. **Check Network**: Open DevTools → Network tab to see requests
4. **Check API URL**: Verify `API_BASE_URL` in `plan.js` is correct

## API Reference

### Verify License
```
GET /api/verify-license?userId=xxx&licenseKey=xxx
Response: { valid: boolean, isPro: boolean }
```

### Create Checkout
```
POST /api/create-checkout-session
Body: { userId: string }
Response: { sessionId: string, url: string }
```

**Note**: Coupon codes are handled natively by Stripe Checkout. Users can enter promotion codes directly on the checkout page.

### Create Portal
```
POST /api/create-portal-session
Body: { userId: string, returnUrl: string, licenseKey?: string }
Response: { url: string }
```

**Note**: `licenseKey` is optional but helps with license lookup if database was cleared.

## Security Notes

- **Never expose secret keys** in extension code (we use server-side Stripe Checkout, so no keys in extension)
- **Always verify webhook signatures** (already implemented)
- **Use HTTPS** in production
- **Store licenses in database** (not in-memory)
- **Add rate limiting** to API endpoints
- **Validate user IDs** to prevent abuse

## Next Steps

1. Set up database for license storage
2. Add email notifications for subscription events
3. Add analytics/tracking (privacy-compliant)
4. Add subscription tiers (if needed)
5. Add trial periods (if desired)
