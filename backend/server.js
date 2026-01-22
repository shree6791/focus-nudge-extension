// Backend server for Focus Nudge extension
// Handles Stripe payments and license verification

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'application/json' })); // For webhook signature verification

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

    const license = licenses.get(userId);

    if (!license || license.status !== 'active') {
      return res.status(404).json({ error: 'No active license found' });
    }

    return res.json({ licenseKey: license.licenseKey });
  } catch (error) {
    console.error('Get license error:', error);
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

    if (!license) {
      return res.json({ valid: false, isPro: false });
    }

    if (license.licenseKey !== licenseKey) {
      return res.json({ valid: false, isPro: false });
    }

    if (license.status !== 'active') {
      return res.json({ valid: false, isPro: false });
    }

    // Check expiration (if subscription-based)
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
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
    const { userId, returnUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Focus Nudge Pro',
              description: 'Unlock customizable nudges and advanced features',
            },
            unit_amount: 999, // $9.99 in cents
            recurring: {
              interval: 'month', // Monthly subscription
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: returnUrl || `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnUrl || `${req.headers.origin}/cancel`,
      client_reference_id: userId, // Store userId for webhook
      metadata: {
        userId: userId,
      },
    });

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
 */
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.userId;
        
        if (userId && session.mode === 'subscription') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const customerId = subscription.customer;
          
          // Generate license key
          const licenseKey = `fn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          licenses.set(userId, {
            licenseKey,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            status: 'active',
            expiresAt: null, // Subscription-based, no expiration
          });
          
          console.log(`License activated for userId: ${userId}`);
        }
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        // Find user by customer ID
        for (const [userId, license] of licenses.entries()) {
          if (license.stripeCustomerId === customerId) {
            if (subscription.status === 'active' || subscription.status === 'trialing') {
              licenses.set(userId, { ...license, status: 'active' });
            } else {
              licenses.set(userId, { ...license, status: 'canceled' });
            }
            console.log(`License updated for userId: ${userId}, status: ${subscription.status}`);
            break;
          }
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Focus Nudge backend server running on port ${PORT}`);
  console.log(`Stripe webhook endpoint: http://localhost:${PORT}/api/webhook`);
});
