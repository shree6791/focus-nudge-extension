# Focus Nudge Backend

Backend API for Stripe payment processing and license verification.

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Get your Stripe keys from [Stripe Dashboard](https://dashboard.stripe.com):
   - **Secret Key**: `sk_test_...` (for testing) or `sk_live_...` (for production)
   - **Publishable Key**: `pk_test_...` (for testing) or `pk_live_...` (for production)
   - **Webhook Secret**: Create a webhook endpoint in Stripe Dashboard and copy the secret

3. Update `.env` with your keys:
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   PORT=3000
   ```

### 3. Set Up Stripe Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Endpoint URL: `https://your-domain.com/api/webhook` (use ngrok for local testing)
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy the webhook signing secret to `.env`

### 4. Run the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Local Testing with ngrok

For local webhook testing:

```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com

# Start your server
npm start

# In another terminal, expose local server
ngrok http 3000

# Use the ngrok URL in Stripe webhook configuration
# Example: https://abc123.ngrok.io/api/webhook
```

## API Endpoints

### `GET /api/verify-license`
Verify if a user has a valid Pro license.

**Query Parameters:**
- `userId`: User identifier (e.g., Chrome extension ID)
- `licenseKey`: License key to verify

**Response:**
```json
{
  "valid": true,
  "isPro": true
}
```

### `POST /api/create-checkout-session`
Create a Stripe Checkout session for Pro subscription.

**Body:**
```json
{
  "userId": "user123",
  "returnUrl": "https://..."
}
```

**Response:**
```json
{
  "sessionId": "cs_...",
  "url": "https://checkout.stripe.com/..."
}
```

### `POST /api/create-portal-session`
Create a Stripe Customer Portal session for managing subscription.

**Body:**
```json
{
  "userId": "user123",
  "returnUrl": "https://..."
}
```

### `POST /api/webhook`
Stripe webhook endpoint (handles subscription events).

## Production Considerations

1. **Database**: Replace in-memory `licenses` Map with a database (PostgreSQL, MongoDB, etc.)
2. **User ID**: Use a stable user identifier (Chrome extension ID, email, etc.)
3. **Security**: Add rate limiting, authentication, CORS restrictions
4. **Monitoring**: Add logging, error tracking (Sentry, etc.)
5. **Deployment**: Deploy to Heroku, Railway, AWS, etc.

## License Storage

Currently uses in-memory storage. For production, use a database:

```javascript
// Example with PostgreSQL
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Store license
await pool.query(
  'INSERT INTO licenses (user_id, license_key, stripe_customer_id, status) VALUES ($1, $2, $3, $4)',
  [userId, licenseKey, customerId, 'active']
);
```
