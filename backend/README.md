# Focus Nudge Backend

Backend API for Stripe payment processing and license verification.

> **📖 For complete setup instructions, see [STRIPE_SETUP.md](../STRIPE_SETUP.md)**

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment (see STRIPE_SETUP.md for details)
cp .env.example .env
# Edit .env with your Stripe keys

# Run server
npm start
```

## Environment Variables

Required:
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret
- `STRIPE_PRICE_ID` - Your Stripe Price ID (required)

Optional:
- `PORT` - Server port (default: 3000)
- `BACKEND_URL` - Backend URL (default: render.com URL)
- `NODE_ENV` - Environment (production/development)

## API Endpoints

See [STRIPE_SETUP.md](../STRIPE_SETUP.md#api-reference) for detailed API documentation.

- `GET /api/verify-license` - Verify Pro license
- `POST /api/create-checkout-session` - Create Stripe Checkout session
- `POST /api/create-portal-session` - Create Customer Portal session
- `POST /api/webhook` - Stripe webhook handler

## Production Considerations

1. **Database**: Replace in-memory `licenses` Map with a database (PostgreSQL, MongoDB, etc.)
2. **User ID**: Use a stable user identifier (Chrome extension ID, email, etc.)
3. **Security**: Add rate limiting, authentication, CORS restrictions
4. **Monitoring**: Add logging, error tracking (Sentry, etc.)
5. **Deployment**: Deploy to Heroku, Railway, AWS, etc.

## License Storage

### Current Implementation (In-Memory)

**⚠️ Important:** The backend currently uses in-memory storage (`Map`) for licenses. This means:
- Licenses are **lost when the server restarts**
- A fallback mechanism queries Stripe API to recover licenses (slower, but works)
- This is **fine for testing/small-scale use**, but **not ideal for production**

**Database Migration:** We plan to migrate to a database (PostgreSQL, MongoDB, etc.) later. The current Stripe lookup fallback ensures the system continues to work even after server restarts, but a database will provide:
- Persistent storage (survives server restarts)
- Better performance (no Stripe API lookups needed)
- Scalability for production use

### Future Database Implementation

When migrating to a database, use something like:

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
