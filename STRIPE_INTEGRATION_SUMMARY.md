# Stripe Integration Summary

## ✅ What's Been Implemented

### Backend (`backend/`)
- ✅ Express server with Stripe integration
- ✅ License verification API (`/api/verify-license`)
- ✅ Stripe Checkout session creation (`/api/create-checkout-session`)
- ✅ Customer Portal session (`/api/create-portal-session`)
- ✅ Webhook handler for subscription events
- ✅ In-memory license storage (ready for database migration)

### Extension Updates
- ✅ Updated `plan.js` to verify licenses with backend API
- ✅ License caching (5-minute cache to reduce API calls)
- ✅ Fallback to dev toggle if API unavailable
- ✅ Options page with Stripe Checkout integration
- ✅ "Upgrade to Pro" button
- ✅ "Manage Subscription" button (for Pro users)
- ✅ Automatic license key retrieval after checkout

## Configuration Required

### 1. Backend URL
**File**: `extension/src/shared/plan.js`
```javascript
const API_BASE_URL = 'https://your-backend-domain.com'; // UPDATE THIS
```

### 2. Stripe Publishable Key
**File**: `extension/src/ui/options/options.js`
```javascript
stripePublishableKey = 'pk_test_...'; // UPDATE THIS
```

### 3. Manifest Host Permissions
**File**: `extension/manifest.json`
```json
"host_permissions": [
  "https://www.linkedin.com/*",
  "https://your-backend-domain.com/*"  // UPDATE THIS
]
```

### 4. Backend Environment
**File**: `backend/.env`
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PORT=3000
```

## Payment Flow

1. **User clicks "Upgrade to Pro"** in Options page
2. **Extension calls backend** → `/api/create-checkout-session`
3. **Backend creates Stripe session** → Returns checkout URL
4. **User redirected to Stripe Checkout** → Completes payment
5. **Stripe sends webhook** → Backend activates license
6. **User redirected back** → Extension polls for license key
7. **License key stored** → Pro features activated

## Testing Flow

### 1. Set Up Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Stripe keys
npm start
```

### 2. Set Up ngrok (for local testing)
```bash
ngrok http 3000
# Use ngrok URL in Stripe webhook: https://abc123.ngrok.io/api/webhook
```

### 3. Configure Extension
- Update `API_BASE_URL` in `plan.js` (use ngrok URL for testing)
- Update `stripePublishableKey` in `options.js`
- Update manifest `host_permissions`

### 4. Test Payment
- Load extension
- Open Options → Click "Upgrade to Pro"
- Use test card: `4242 4242 4242 4242`
- Complete payment
- Verify Pro status activates

## Production Checklist

- [ ] Deploy backend to production (Heroku, Railway, AWS, etc.)
- [ ] Update `API_BASE_URL` to production URL
- [ ] Update manifest `host_permissions` with production URL
- [ ] Switch to Stripe Live keys (not test keys)
- [ ] Set up production webhook in Stripe Dashboard
- [ ] Replace in-memory license storage with database
- [ ] Add error monitoring (Sentry, etc.)
- [ ] Test complete payment flow end-to-end
- [ ] Remove dev toggle from production builds

## Database Migration (Recommended)

Replace in-memory `licenses` Map with database:

```javascript
// Example with PostgreSQL
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Store license
await pool.query(
  'INSERT INTO licenses (user_id, license_key, stripe_customer_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET license_key = $2, status = $4',
  [userId, licenseKey, customerId, 'active']
);

// Get license
const result = await pool.query('SELECT * FROM licenses WHERE user_id = $1', [userId]);
```

## Security Notes

- ✅ Webhook signature verification (already implemented)
- ✅ Never expose secret keys in extension
- ⚠️ Add rate limiting to API endpoints
- ⚠️ Add authentication/authorization
- ⚠️ Use HTTPS in production
- ⚠️ Validate user IDs to prevent abuse

## Next Steps

1. **Deploy backend** to production
2. **Configure Stripe** with production keys
3. **Set up database** for license storage
4. **Test payment flow** end-to-end
5. **Monitor webhooks** for any issues
6. **Add analytics** (optional, privacy-compliant)

## Support

See `STRIPE_SETUP.md` for detailed setup instructions.
