// Webhook Handlers: Process Stripe webhook events
const { createLicense, findUserIdByCustomerId } = require('./licenseService');

/**
 * Initialize webhook handlers with Stripe instance
 * @param {Object} stripeInstance - Initialized Stripe instance
 */
function initWebhookHandlers(stripeInstance) {

  /**
   * Handle checkout.session.completed event
   * Creates license when payment is completed
   */
  async function handleCheckoutCompleted(session, licenses) {
    const userId = session.client_reference_id || session.metadata?.userId;
    
    console.log(`[WEBHOOK] Checkout completed - userId: ${userId}, mode: ${session.mode}, subscription: ${session.subscription}`);
    console.log(`[WEBHOOK] client_reference_id: ${session.client_reference_id}`);
    console.log(`[WEBHOOK] metadata:`, JSON.stringify(session.metadata));
    
    if (!userId || session.mode !== 'subscription') {
      console.warn(`[WEBHOOK] ⚠️ Checkout completed but missing userId or not subscription mode. userId: ${userId}, mode: ${session.mode}`);
      return;
    }

    try {
      const subscription = await stripeInstance.subscriptions.retrieve(session.subscription);
      const customerId = subscription.customer;
      
      console.log(`[WEBHOOK] Subscription retrieved - customerId: ${customerId}, status: ${subscription.status}`);
      
      // Check if license already exists
      const existing = licenses.get(userId);
      if (existing && existing.status === 'active') {
        console.log(`[WEBHOOK] ⚠️ License already exists for userId: ${userId}, skipping creation`);
        return;
      }
      
      const licenseKey = createLicense(userId, customerId, subscription.id, licenses);
      
      console.log(`[WEBHOOK] ✅ License activated for userId: ${userId}, licenseKey: ${licenseKey}`);
      console.log(`[WEBHOOK] Total licenses now: ${licenses.size}`);
    } catch (error) {
      console.error(`[WEBHOOK] Error processing checkout.session.completed:`, error);
      throw error;
    }
  }

  /**
   * Handle subscription update/delete events
   * Updates license status based on subscription status
   */
  function handleSubscriptionUpdate(subscription, licenses) {
    const customerId = subscription.customer;
    const userId = findUserIdByCustomerId(customerId, licenses);
    
    if (!userId) {
      console.warn(`[WEBHOOK] ⚠️ Subscription update for unknown customer: ${customerId}`);
      return;
    }
    
    const license = licenses.get(userId);
    if (!license) {
      return;
    }
    
    // Update license status based on subscription status
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';
    licenses.set(userId, { 
      ...license, 
      status: isActive ? 'active' : 'canceled' 
    });
    
    console.log(`[WEBHOOK] License updated for userId: ${userId}, status: ${subscription.status}`);
  }

  return {
    handleCheckoutCompleted,
    handleSubscriptionUpdate
  };
}

module.exports = { initWebhookHandlers };
