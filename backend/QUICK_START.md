# Quick Start: Stripe Integration (No ngrok Required)

## Option 1: Stripe CLI (Easiest for Local Testing)

### Setup

1. **Install Stripe CLI**:
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Or download from: https://stripe.com/docs/stripe-cli
   ```

2. **Login to Stripe**:
   ```bash
   stripe login
   ```

3. **Start Backend**:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your Stripe keys
   npm start
   ```

4. **Forward Webhooks** (in another terminal):
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```
   
   This will output a webhook secret like: `whsec_...`
   Copy this to your `.env` file as `STRIPE_WEBHOOK_SECRET`

5. **Update Extension**:
   - Edit `extension/src/shared/plan.js`: 
     ```javascript
     const API_BASE_URL = 'http://localhost:3000'; // For local testing
     ```
   - Edit `extension/src/ui/options/options.js`:
     ```javascript
     stripePublishableKey = 'pk_test_...'; // Your Stripe publishable key
     ```

6. **Test**:
   - Load extension in Chrome
   - Open Options → Click "Upgrade to Pro"
   - Use test card: `4242 4242 4242 4242`

## Option 2: Free Hosting (Railway - Recommended)

### Setup

1. **Create Railway Account**: Go to [railway.app](https://railway.app)

2. **Deploy Backend**:
   - New Project → Deploy from GitHub
   - Connect your repository
   - Select `backend/` folder
   - Railway auto-detects Node.js

3. **Add Environment Variables**:
   - Go to Variables tab
   - Add:
     - `STRIPE_SECRET_KEY=sk_test_...`
     - `STRIPE_PUBLISHABLE_KEY=pk_test_...`
     - `STRIPE_WEBHOOK_SECRET=whsec_...` (get from Stripe Dashboard)
     - `PORT=3000` (Railway sets this automatically)

4. **Get Your URL**: Railway gives you a URL like `https://your-app.railway.app`

5. **Configure Stripe Webhook**:
   - Go to Stripe Dashboard → Webhooks
   - Add endpoint: `https://your-app.railway.app/api/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy webhook secret to Railway variables

6. **Update Extension**:
   - Edit `extension/src/shared/plan.js`: 
     ```javascript
     const API_BASE_URL = 'https://your-app.railway.app';
     ```
   - Edit `extension/manifest.json`: Add Railway URL to `host_permissions`

7. **Test**: Same as Option 1, but using Railway URL

## Option 3: Render (Alternative Free Hosting)

Same process as Railway, but:
- Go to [render.com](https://render.com)
- New Web Service → Connect GitHub
- Select `backend/` folder
- Add environment variables
- Get URL: `https://your-app.onrender.com`

## Testing Checklist

- [ ] Backend server running
- [ ] Webhook forwarding active (Stripe CLI) OR webhook configured (hosted)
- [ ] Extension API URL configured
- [ ] Stripe publishable key in options.js
- [ ] Test payment with card `4242 4242 4242 4242`
- [ ] Verify license activates after payment
- [ ] Pro features unlock

## Common Issues

**"Cannot connect to backend"**
- Check API_BASE_URL is correct
- Check backend is running
- Check host_permissions in manifest

**"Webhook not received"**
- If using Stripe CLI: Make sure `stripe listen` is running
- If using hosted: Check webhook URL in Stripe Dashboard
- Check webhook secret matches

**"License not activating"**
- Check backend logs for webhook events
- Verify webhook handler is processing events
- Check license storage (in-memory Map)
