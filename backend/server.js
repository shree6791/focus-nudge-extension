// Backend server for Focus Nudge extension
// Handles Stripe payments and license verification

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createLicense, findUserIdByCustomerId, isValidLicense } = require('./licenseService');
const { initWebhookHandlers } = require('./webhookHandlers');

// Initialize webhook handlers with Stripe instance
const { handleCheckoutCompleted, handleSubscriptionUpdate } = initWebhookHandlers(stripe);

const app = express();
const PORT = process.env.PORT || 3000;

// Constants
const BACKEND_URL = process.env.BACKEND_URL || 'https://focus-nudge-extension.onrender.com';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID; // Required: Your Stripe Price ID (e.g., 'price_xxxxx')

if (!STRIPE_PRICE_ID) {
  console.error('ERROR: STRIPE_PRICE_ID environment variable is required');
  process.exit(1);
}

// Middleware
app.use(cors());

// IMPORTANT: Webhook endpoint must receive raw body for signature verification
// Skip JSON parsing for webhook route - it needs raw body
app.use((req, res, next) => {
  if (req.path === '/api/webhook') {
    // Skip JSON parsing for webhook - it will use raw body parser in route handler
    next();
  } else {
    // Parse JSON for all other routes
    express.json()(req, res, next);
  }
});

// In-memory license store (replace with database in production)
const licenses = new Map(); // userId -> { licenseKey, stripeCustomerId, status, expiresAt }

/**
 * Get license key for user (after successful checkout)
 * GET /api/get-license?userId=xxx
 */
app.get('/api/get-license', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    console.log(`[GET-LICENSE] Request for userId: ${userId}`);
    console.log(`[GET-LICENSE] Total licenses in store: ${licenses.size}`);
    console.log(`[GET-LICENSE] License exists: ${licenses.has(userId)}`);

    const license = licenses.get(userId);

    if (!license) {
      console.log(`[GET-LICENSE] ❌ No license found for userId: ${userId}`);
      // List all userIds for debugging
      const allUserIds = Array.from(licenses.keys());
      console.log(`[GET-LICENSE] Available userIds: ${allUserIds.join(', ')}`);
      return res.status(404).json({ error: 'No license found for this user' });
    }

    if (!isValidLicense(license)) {
      console.log(`[GET-LICENSE] ❌ License exists but invalid. Status: ${license.status}`);
      return res.status(404).json({ error: 'License found but not active' });
    }

    console.log(`[GET-LICENSE] ✅ Returning license key for userId: ${userId}`);
    return res.json({ licenseKey: license.licenseKey });
  } catch (error) {
    console.error('[GET-LICENSE] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Verify license key
 * GET /api/verify-license?userId=xxx&licenseKey=xxx
 */
app.get('/api/verify-license', async (req, res) => {
  try {
    const { userId, licenseKey } = req.query;

    if (!userId || !licenseKey) {
      return res.status(400).json({ error: 'Missing userId or licenseKey' });
    }

    const license = licenses.get(userId);

    if (!license || license.licenseKey !== licenseKey || !isValidLicense(license)) {
      return res.json({ valid: false, isPro: false });
    }

    return res.json({ valid: true, isPro: true });
  } catch (error) {
    console.error('License verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Create Stripe Checkout Session
 * POST /api/create-checkout-session
 */
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { userId, extensionId, extensionOptionsUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Stripe can't redirect to chrome-extension:// URLs directly
    // Use web-accessible success page that will redirect to extension
    const safeBaseUrl = BACKEND_URL.includes('chrome-extension') 
      ? 'https://focus-nudge-extension.onrender.com' 
      : BACKEND_URL;
    
    // Include extension info in success URL for proper redirect
    const successUrl = `${safeBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}&userId=${encodeURIComponent(userId)}${extensionId ? `&extId=${encodeURIComponent(extensionId)}` : ''}${extensionOptionsUrl ? `&extUrl=${encodeURIComponent(extensionOptionsUrl)}` : ''}`;
    const cancelUrl = `${safeBaseUrl}/cancel`;
    
    console.log(`[CHECKOUT] Creating session for userId: ${userId}`);
    console.log(`[CHECKOUT] Extension ID: ${extensionId || 'not provided'}`);
    console.log(`[CHECKOUT] Extension Options URL: ${extensionOptionsUrl || 'not provided'}`);
    console.log(`[CHECKOUT] Using Price ID: ${STRIPE_PRICE_ID}`);
    console.log(`[CHECKOUT] Note: Coupon codes can be entered directly on Stripe Checkout page`);

    // Build checkout session config
    // Stripe Checkout will automatically show "Have a promo code?" link
    // Users can enter coupon codes directly on the checkout page
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [{
        price: STRIPE_PRICE_ID,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: { userId },
      // Allow promotion codes to be entered on checkout page
      allow_promotion_codes: true,
    };

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    
    // Return user-friendly error messages
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ 
        error: 'Stripe error',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create Portal Session (for managing subscription)
 * POST /api/create-portal-session
 */
app.post('/api/create-portal-session', async (req, res) => {
  try {
    const { userId, returnUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const license = licenses.get(userId);
    if (!license || !license.stripeCustomerId) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: license.stripeCustomerId,
      return_url: returnUrl || `${req.headers.origin}/options`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal session error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stripe Webhook Handler
 * Handles subscription events
 * NOTE: This route MUST receive raw body for signature verification
 */
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // req.body is now a Buffer (raw body) - required for signature verification
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log(`[WEBHOOK] Received event: ${event.type}, id: ${event.id}`);
    
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object, licenses);
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        handleSubscriptionUpdate(event.data.object, licenses);
        break;

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * Auto-create license from Stripe session (fallback if webhook didn't fire)
 * POST /api/auto-create-license
 * Body: { sessionId: "cs_...", userId: "fn_..." }
 * This is called by the extension as a fallback if webhook is delayed
 */
app.post('/api/auto-create-license', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ error: 'Missing sessionId or userId' });
    }

    // Check if license already exists
    const existing = licenses.get(userId);
    if (isValidLicense(existing)) {
      return res.json({ 
        success: true, 
        licenseKey: existing.licenseKey,
        message: 'License already exists' 
      });
    }

    // Retrieve and validate session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Validate session
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }
    if (session.mode !== 'subscription') {
      return res.status(400).json({ error: 'Not a subscription session' });
    }

    // Get subscription and validate
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(400).json({ error: `Subscription status is ${subscription.status}, not active` });
    }

    // Create license using shared function
    const licenseKey = createLicense(userId, subscription.customer, subscription.id, licenses);
    
    console.log(`[AUTO-CREATE] License created for userId: ${userId}, sessionId: ${sessionId}`);
    
    res.json({ 
      success: true, 
      licenseKey,
      message: 'License created successfully' 
    });
  } catch (error) {
    console.error('[AUTO-CREATE] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug endpoints (only in development)
 * These are disabled in production for security
 */
const IS_DEV = process.env.NODE_ENV !== 'production';

if (IS_DEV) {
  /**
   * Debug endpoint: Manually create license from Stripe customer
   * GET /api/debug/create-license?userId=xxx&customerId=xxx
   */
  app.get('/api/debug/create-license', async (req, res) => {
    try {
      const { userId, customerId } = req.query;

      if (!userId || !customerId) {
        return res.status(400).json({ error: 'Missing userId or customerId' });
      }

      // Verify customer exists in Stripe
      await stripe.customers.retrieve(customerId);
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 1 });

      if (subscriptions.data.length === 0) {
        return res.status(404).json({ error: 'No subscription found for this customer' });
      }

      const subscription = subscriptions.data[0];
      
      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        return res.status(400).json({ error: `Subscription status is ${subscription.status}, not active` });
      }

      // Create license using shared function
      const licenseKey = createLicense(userId, customerId, subscription.id, licenses);
      
      console.log(`[DEBUG] License manually created for userId: ${userId}, customerId: ${customerId}`);
      
      res.json({ 
        success: true, 
        licenseKey,
        message: 'License created successfully' 
      });
    } catch (error) {
      console.error('[DEBUG] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Debug endpoint: List all licenses (for debugging)
   * GET /api/debug/licenses
   */
  app.get('/api/debug/licenses', (req, res) => {
    const licenseList = Array.from(licenses.entries()).map(([userId, license]) => ({
      userId,
      licenseKey: license.licenseKey,
      customerId: license.stripeCustomerId,
      status: license.status
    }));
    
    res.json({ count: licenses.size, licenses: licenseList });
  });
}


/**
 * Success page (after Stripe checkout)
 * Minimal redirect page - extension handles activation automatically
 */
app.get('/success', (req, res) => {
  const { session_id, userId, extId, extUrl } = req.query;
  
  // Build extension options URL with payment success params
  const extensionOptionsUrl = extUrl 
    ? `${extUrl}?payment_success=1&session_id=${session_id || ''}&userId=${encodeURIComponent(userId || '')}`
    : (extId 
      ? `chrome-extension://${extId}/src/ui/options/options.html?payment_success=1&session_id=${session_id || ''}&userId=${encodeURIComponent(userId || '')}`
      : null);
  
  // Ultra-simple page - just redirect attempt
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful</title>
      <meta charset="utf-8">
      ${extensionOptionsUrl ? `<meta http-equiv="refresh" content="0;url=${extensionOptionsUrl}">` : ''}
    </head>
    <body style="font-family: system-ui; text-align: center; padding: 50px;">
      <h1>✅ Payment Successful!</h1>
      <p>Redirecting to extension...</p>
      ${extensionOptionsUrl ? `<p><a href="${extensionOptionsUrl}">Click here if not redirected</a></p>` : ''}
      <script>
        ${extensionOptionsUrl ? `try { window.location.href = ${JSON.stringify(extensionOptionsUrl)}; } catch(e) {}` : ''}
      </script>
    </body>
    </html>
  `);
});

/**
 * Cancel page (if user cancels checkout)
 */
app.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Cancelled - Focus Nudge</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: system-ui, -apple-system, Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 500px;
        }
        h1 { color: #666; margin: 0 0 20px 0; }
        p { color: #666; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Payment Cancelled</h1>
        <p>You can return to the extension and try again anytime.</p>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Focus Nudge backend server running on port ${PORT}`);
  console.log(`Stripe webhook endpoint: http://localhost:${PORT}/api/webhook`);
});
