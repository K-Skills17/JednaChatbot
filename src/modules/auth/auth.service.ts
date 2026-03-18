import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const SALT_ROUNDS = 12;

export interface JwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  token: string;
  expiresIn: string;
}

export class AuthService {
  /** Register a new tenant user */
  async register(input: {
    tenantId: string;
    email: string;
    password: string;
    name: string;
    role?: string;
  }) {
    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    // Check for existing user with same email
    const existing = await prisma.tenantUser.findUnique({ where: { email: input.email } });
    if (existing) throw new Error('Email already registered');

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const user = await prisma.tenantUser.create({
      data: {
        tenantId: input.tenantId,
        email: input.email,
        passwordHash,
        name: input.name,
        role: input.role ?? 'owner',
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    logger.info({ userId: user.id, tenantId: user.tenantId }, 'Tenant user registered');

    const tokens = this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    return { user, ...tokens };
  }

  /** Login with email and password */
  async login(email: string, password: string) {
    const user = await prisma.tenantUser.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    // Update last login
    await prisma.tenantUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    logger.info({ userId: user.id, tenantId: user.tenantId }, 'Tenant user logged in');

    return {
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    };
  }

  /** Verify a JWT token and return the payload */
  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  }

  /** Get current user profile */
  async getProfile(userId: string) {
    const user = await prisma.tenantUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
        tenant: {
          select: {
            businessName: true,
            plan: true,
            status: true,
          },
        },
      },
    });

    if (!user) throw new Error('User not found');
    return user;
  }

  /** Change password */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.tenantUser.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new Error('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.tenantUser.update({
      where: { id: userId },
      data: { passwordHash },
    });

    logger.info({ userId }, 'Password changed');
  }

  /** List users for a tenant */
  async listUsers(tenantId: string) {
    return prisma.tenantUser.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Delete a tenant user */
  async deleteUser(userId: string, requesterId: string) {
    if (userId === requesterId) throw new Error('Cannot delete your own account');

    const user = await prisma.tenantUser.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    await prisma.tenantUser.delete({ where: { id: userId } });
    logger.info({ userId, deletedBy: requesterId }, 'Tenant user deleted');
  }

  private generateTokens(payload: JwtPayload): AuthTokens {
    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    return { token, expiresIn: env.JWT_EXPIRES_IN };
  }
}

export const authService = new AuthService();
