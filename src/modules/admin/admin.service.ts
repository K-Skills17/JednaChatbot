import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const SALT_ROUNDS = 12;

export interface AdminJwtPayload {
  adminId: string;
  email: string;
  role: string;
  type: 'admin';
}

export class AdminService {
  /** Register a new admin user (superadmin only, or first admin via ADMIN_PASSWORD) */
  async register(input: { email: string; password: string; name: string; role?: string }) {
    const existing = await prisma.adminUser.findUnique({ where: { email: input.email } });
    if (existing) throw new Error('Email already registered');

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const user = await prisma.adminUser.create({
      data: {
        id: crypto.randomUUID(),
        email: input.email,
        passwordHash,
        name: input.name,
        role: input.role ?? 'admin',
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    logger.info({ adminId: user.id }, 'Admin user registered');

    const token = this.generateToken({
      adminId: user.id,
      email: user.email,
      role: user.role,
      type: 'admin',
    });

    return { user, token, expiresIn: env.JWT_EXPIRES_IN };
  }

  /** Login with email and password */
  async login(email: string, password: string) {
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.generateToken({
      adminId: user.id,
      email: user.email,
      role: user.role,
      type: 'admin',
    });

    logger.info({ adminId: user.id }, 'Admin user logged in');

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  /** Verify an admin JWT token */
  verifyToken(token: string): AdminJwtPayload {
    const payload = jwt.verify(token, env.JWT_SECRET) as AdminJwtPayload;
    if (payload.type !== 'admin') throw new Error('Not an admin token');
    return payload;
  }

  /** List all admin users */
  async listAdmins() {
    return prisma.adminUser.findMany({
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Delete an admin user */
  async deleteAdmin(adminId: string, requesterId: string) {
    if (adminId === requesterId) throw new Error('Cannot delete your own account');
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new Error('Admin not found');
    await prisma.adminUser.delete({ where: { id: adminId } });
    logger.info({ adminId, deletedBy: requesterId }, 'Admin user deleted');
  }

  /** Get platform-wide analytics */
  async getPlatformAnalytics() {
    const [
      totalTenants,
      activeTenants,
      totalContacts,
      totalConversations,
      totalBookings,
      totalMessages,
      totalReviews,
      tenantsByPlan,
      tenantsByStatus,
      recentTenants,
      totalRevenue,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'active' } }),
      prisma.contact.count(),
      prisma.conversation.count(),
      prisma.booking.count(),
      prisma.message.count(),
      prisma.review.count(),
      prisma.tenant.groupBy({ by: ['plan'], _count: { id: true } }),
      prisma.tenant.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.tenant.findMany({
        select: { id: true, businessName: true, plan: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.invoice.aggregate({ _sum: { amountPaid: true }, where: { status: 'paid' } }),
    ]);

    // Aggregate AI cost across all tenants
    const aiCostAgg = await prisma.tenant.aggregate({ _sum: { monthlyAiCostUsd: true } });

    return {
      totalTenants,
      activeTenants,
      totalContacts,
      totalConversations,
      totalBookings,
      totalMessages,
      totalReviews,
      totalRevenueCents: totalRevenue._sum.amountPaid ?? 0,
      totalMonthlyAiCost: aiCostAgg._sum.monthlyAiCostUsd ?? 0,
      tenantsByPlan: Object.fromEntries(tenantsByPlan.map((p) => [p.plan, p._count.id])),
      tenantsByStatus: Object.fromEntries(tenantsByStatus.map((s) => [s.status, s._count.id])),
      recentTenants,
    };
  }

  /** Record an audit log entry */
  async audit(entry: {
    adminUserId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: any;
    ipAddress?: string;
  }) {
    await prisma.auditLog.create({ data: { id: crypto.randomUUID(), ...entry } });
  }

  /** Get audit logs (paginated) */
  async getAuditLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { adminUser: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);
    return { logs, total, page, limit };
  }

  private generateToken(payload: AdminJwtPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
  }
}

export const adminService = new AdminService();
