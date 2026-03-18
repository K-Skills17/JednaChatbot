import Stripe from 'stripe';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { billingService } from './billing.service';

export function registerStripeWebhookRoutes(app: FastifyInstance): void {
  // Stripe needs the raw body for signature verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post(
    '/webhook/stripe',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
        logger.warn('Stripe webhook received but STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not configured');
        return reply.code(500).send({ error: 'Stripe not configured' });
      }

      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      const sig = request.headers['stripe-signature'] as string;

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          request.body as Buffer,
          sig,
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Stripe webhook signature verification failed');
        return reply.code(400).send({ error: 'Invalid signature' });
      }

      logger.info({ type: event.type, id: event.id }, 'Stripe webhook received');

      try {
        switch (event.type) {
          case 'checkout.session.completed':
            await billingService.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
            break;

          case 'customer.subscription.created':
          case 'customer.subscription.updated':
            await billingService.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
            break;

          case 'customer.subscription.deleted':
            await billingService.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
            break;

          case 'invoice.created':
          case 'invoice.paid':
          case 'invoice.payment_failed':
          case 'invoice.finalized':
            await billingService.handleInvoiceEvent(event.data.object as Stripe.Invoice);
            break;

          default:
            logger.debug({ type: event.type }, 'Unhandled Stripe event type');
        }
      } catch (err) {
        logger.error({ err, type: event.type }, 'Error processing Stripe webhook');
        return reply.code(500).send({ error: 'Webhook processing failed' });
      }

      return reply.send({ received: true });
    },
  );
}
