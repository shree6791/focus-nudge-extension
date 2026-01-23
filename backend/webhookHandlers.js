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
    
    if (!userId || session.mode !== 'subscription') {
      return;
    }

    try {
      const subscription = await stripeInstance.subscriptions.retrieve(session.subscription);
      const customerId = subscription.customer;
      
      // Check if license already exists
      const existing = licenses.get(userId);
      if (existing && existing.status === 'active') {
        return;
      }
      
      createLicense(userId, customerId, subscription.id, licenses);
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
    
  }

  return {
    handleCheckoutCompleted,
    handleSubscriptionUpdate
  };
}

module.exports = { initWebhookHandlers };
