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
    const { userId, extensionId, extensionOptionsUrl, couponCode } = req.body;

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
    console.log(`[CHECKOUT] Coupon Code: ${couponCode || 'not provided'}`);
    console.log(`[CHECKOUT] Using Price ID: ${STRIPE_PRICE_ID}`);

    // Build checkout session config
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
    };

    // Add coupon code if provided
    if (couponCode) {
      sessionConfig.discounts = [{
        coupon: couponCode,
      }];
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
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
 * Get public configuration (publishable key)
 * GET /api/config
 */
app.get('/api/config', (req, res) => {
  try {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      return res.status(500).json({ error: 'Stripe publishable key not configured' });
    }

    // Security check: Ensure it's a publishable key, not a secret key
    if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
      console.error('SECURITY WARNING: STRIPE_PUBLISHABLE_KEY appears to be a secret key!');
      return res.status(500).json({ 
        error: 'Invalid publishable key format. Must start with pk_test_ or pk_live_' 
      });
    }

    res.json({ 
      stripePublishableKey: publishableKey 
    });
  } catch (error) {
    console.error('Config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Success page (after Stripe checkout)
 * Automatically redirects to extension options page
 */
app.get('/success', (req, res) => {
  const { session_id, userId, extId, extUrl } = req.query;
  
  // Build extension options URL with payment success params
  const extensionOptionsUrl = extUrl 
    ? `${extUrl}?payment_success=1&session_id=${session_id || ''}&userId=${encodeURIComponent(userId || '')}`
    : (extId 
      ? `chrome-extension://${extId}/src/ui/options/options.html?payment_success=1&session_id=${session_id || ''}&userId=${encodeURIComponent(userId || '')}`
      : null);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful - Focus Nudge</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: system-ui, -apple-system, Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          text-align: center;
          max-width: 500px;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        h1 { 
          color: #4CAF50; 
          margin: 0 0 20px 0; 
          font-size: 28px;
        }
        .success-icon {
          font-size: 64px;
          margin-bottom: 20px;
        }
        p { 
          color: #666; 
          line-height: 1.6; 
          margin: 10px 0;
        }
        .redirect-message {
          color: #999;
          font-size: 14px;
          margin-top: 30px;
        }
        .button {
          display: inline-block;
          margin-top: 20px;
          padding: 12px 24px;
          background: #4CAF50;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          transition: background 0.2s;
          cursor: pointer;
          border: none;
        }
        .button:hover { 
          background: #45a049; 
        }
        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #4CAF50;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-left: 10px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">✅</div>
        <h1>Payment Successful!</h1>
        <p><strong>Your Focus Nudge Pro subscription is now active.</strong></p>
        <p class="redirect-message">
          <strong>Next step:</strong> Open the Focus Nudge extension options page to activate your Pro features.
        </p>
        <ol style="text-align: left; max-width: 400px; margin: 20px auto; color: #666;">
          <li>Right-click the Focus Nudge extension icon in your browser toolbar</li>
          <li>Click "Options" from the menu</li>
          <li>Your Pro features will activate automatically!</li>
        </ol>
        ${extensionOptionsUrl ? `
        <button class="button" id="openExtensionBtn">
          Try Opening Extension Options
        </button>
        <p style="font-size: 12px; color: #999; margin-top: 10px;">
          If the button doesn't work, use the steps above.
        </p>
        ` : ''}
      </div>
      <script>
        ${extensionOptionsUrl ? `
        // Chrome blocks chrome-extension:// URLs from web pages for security
        // So we can't auto-redirect, but we can try to open it on button click
        const extensionUrl = ${JSON.stringify(extensionOptionsUrl)};
        
        // Handle button click - try to open extension (may be blocked by Chrome)
        const btn = document.getElementById('openExtensionBtn');
        if (btn) {
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            // Try to open extension URL (Chrome may block this)
            try {
              // Method 1: Try direct link
              const link = document.createElement('a');
              link.href = extensionUrl;
              link.target = '_blank';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              // If that doesn't work, show alert
              setTimeout(() => {
                alert('If the extension options page didn\'t open, please:\n\n1. Right-click the Focus Nudge extension icon\n2. Click "Options"\n3. Your Pro features will activate automatically!');
              }, 500);
            } catch (e) {
              console.warn('Could not open extension URL:', e);
              alert('Please manually open the extension options page:\n\n1. Right-click the Focus Nudge extension icon\n2. Click "Options"\n3. Your Pro features will activate automatically!');
            }
          });
        }
        ` : ''}
        
        // Store payment info for extension to pick up
        if ('${session_id || ''}') {
          try {
            localStorage.setItem('focusNudgePaymentSuccess', '${session_id || ''}');
            localStorage.setItem('focusNudgePaymentTime', Date.now().toString());
            localStorage.setItem('focusNudgePaymentUserId', '${userId || ''}');
          } catch(e) {
            console.warn('Could not store payment success in localStorage');
          }
        }
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
