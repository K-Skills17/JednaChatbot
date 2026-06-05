import crypto from 'crypto';
import Stripe from 'stripe';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  starter: env.STRIPE_STARTER_PRICE_ID,
  pro: env.STRIPE_PRO_PRICE_ID,
  enterprise: env.STRIPE_ENTERPRISE_PRICE_ID,
};

function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export class BillingService {
  private get stripe() {
    return getStripe();
  }

  /** Ensure the tenant has a Stripe customer, creating one if needed */
  async getOrCreateCustomer(tenantId: string): Promise<string> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      name: tenant.businessName,
      metadata: { tenantId: tenant.id },
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeCustomerId: customer.id },
    });

    logger.info({ tenantId, customerId: customer.id }, 'Stripe customer created');
    return customer.id;
  }

  /** Create a Stripe Checkout session for a new subscription */
  async createCheckoutSession(tenantId: string, plan: string, successUrl: string, cancelUrl: string) {
    const priceId = PLAN_PRICE_MAP[plan];
    if (!priceId) throw new Error(`No Stripe price configured for plan: ${plan}`);

    const customerId = await this.getOrCreateCustomer(tenantId);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tenantId, plan },
      subscription_data: { metadata: { tenantId, plan } },
    });

    logger.info({ tenantId, plan, sessionId: session.id }, 'Checkout session created');
    return { sessionId: session.id, url: session.url };
  }

  /** Create a Stripe Customer Portal session for managing subscription */
  async createPortalSession(tenantId: string, returnUrl: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.stripeCustomerId) {
      throw new Error('Tenant has no Stripe customer — create a subscription first');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /** Get the current subscription for a tenant */
  async getSubscription(tenantId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return subscription;
  }

  /** List invoices for a tenant */
  async listInvoices(tenantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where: { tenantId } }),
    ]);

    return { invoices, total, page, limit };
  }

  /** Get billing overview for a tenant */
  async getBillingOverview(tenantId: string) {
    const [tenant, subscription, recentInvoices] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.subscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.findMany({
        where: { tenantId },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!tenant) throw new Error('Tenant not found');

    return {
      plan: tenant.plan,
      status: subscription?.status ?? 'none',
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      usage: {
        messagesThisMonth: tenant.messagesThisMonth,
        monthlyAiCostUsd: tenant.monthlyAiCostUsd,
        aiCostLimitUsd: tenant.aiCostLimitUsd,
      },
      recentInvoices,
    };
  }

  // ─── Stripe Webhook Handlers ──────────────────────────────

  /** Handle checkout.session.completed */
  async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const plan = session.metadata?.plan;
    if (!tenantId || !plan) {
      logger.warn({ sessionId: session.id }, 'Checkout session missing tenantId/plan metadata');
      return;
    }

    // Update tenant plan
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan, status: 'active' },
    });

    logger.info({ tenantId, plan }, 'Tenant plan updated from checkout');
  }

  /** Handle subscription created/updated */
  async handleSubscriptionUpdated(sub: Stripe.Subscription) {
    const tenantId = sub.metadata?.tenantId;
    if (!tenantId) {
      logger.warn({ subscriptionId: sub.id }, 'Subscription missing tenantId metadata');
      return;
    }

    const plan = sub.metadata?.plan ?? 'starter';
    const firstItem = sub.items.data[0];
    const priceId = firstItem?.price?.id ?? '';
    const periodStart = new Date((firstItem?.current_period_start ?? sub.start_date) * 1000);
    const periodEnd = new Date((firstItem?.current_period_end ?? sub.start_date) * 1000);

    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: sub.id },
      create: {
        id: crypto.randomUUID(),
        tenantId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        plan,
        status: sub.status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      },
      update: {
        stripePriceId: priceId,
        plan,
        status: sub.status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      },
    });

    // Sync plan to tenant
    const tenantPlan = sub.status === 'active' || sub.status === 'trialing' ? plan : 'starter';
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: tenantPlan },
    });

    logger.info({ tenantId, subscriptionId: sub.id, status: sub.status, plan }, 'Subscription synced');
  }

  /** Handle subscription deleted (canceled) */
  async handleSubscriptionDeleted(sub: Stripe.Subscription) {
    const tenantId = sub.metadata?.tenantId;
    if (!tenantId) return;

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: sub.id },
      data: { status: 'canceled', canceledAt: new Date() },
    });

    // Downgrade to starter
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: 'starter' },
    });

    logger.info({ tenantId, subscriptionId: sub.id }, 'Subscription canceled — downgraded to starter');
  }

  /** Handle invoice events */
  async handleInvoiceEvent(invoice: Stripe.Invoice) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;

    const tenant = await prisma.tenant.findUnique({ where: { stripeCustomerId: customerId } });
    if (!tenant) {
      logger.warn({ customerId, invoiceId: invoice.id }, 'Invoice for unknown customer');
      return;
    }

    await prisma.invoice.upsert({
      where: { stripeInvoiceId: invoice.id },
      create: {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        stripeInvoiceId: invoice.id,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status ?? 'draft',
        invoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdf: invoice.invoice_pdf ?? null,
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000),
        paidAt: invoice.status === 'paid' ? new Date() : null,
      },
      update: {
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        status: invoice.status ?? 'draft',
        invoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdf: invoice.invoice_pdf ?? null,
        paidAt: invoice.status === 'paid' ? new Date() : null,
      },
    });

    logger.info({ tenantId: tenant.id, invoiceId: invoice.id, status: invoice.status }, 'Invoice synced');
  }
}

export const billingService = new BillingService();
