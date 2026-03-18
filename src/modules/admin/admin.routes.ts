import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { adminService } from './admin.service';
import { adminAuthMiddleware, superadminOnly } from '../../middleware/admin-auth';
import { env } from '../../config/env';
import { prisma } from '../../config/database';

export function registerAdminRoutes(app: FastifyInstance): void {
  // ─── Public Admin Auth Routes ──────────────────────────────

  // Setup first admin (requires ADMIN_PASSWORD or existing superadmin)
  app.post(
    '/api/admin/register',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        email?: string;
        password?: string;
        name?: string;
        role?: string;
        setupKey?: string;
      };

      if (!body?.email || !body?.password || !body?.name) {
        return reply.code(400).send({ error: 'Missing required fields: email, password, name' });
      }

      if (body.password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' });
      }

      // Check if this is the first admin (bootstrap)
      const adminCount = await prisma.adminUser.count();
      const isBootstrap = adminCount === 0;

      if (isBootstrap) {
        // First admin requires ADMIN_PASSWORD as setupKey
        if (!env.ADMIN_PASSWORD || body.setupKey !== env.ADMIN_PASSWORD) {
          return reply.code(403).send({ error: 'Invalid setup key. Use ADMIN_PASSWORD to create the first admin.' });
        }
      } else {
        // Subsequent admins require superadmin JWT
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          return reply.code(401).send({ error: 'Superadmin JWT required to register new admins' });
        }
        try {
          const payload = adminService.verifyToken(authHeader.slice(7));
          if (payload.role !== 'superadmin') {
            return reply.code(403).send({ error: 'Only superadmins can create new admin accounts' });
          }
        } catch {
          return reply.code(401).send({ error: 'Invalid admin token' });
        }
      }

      try {
        const result = await adminService.register({
          email: body.email,
          password: body.password,
          name: body.name,
          role: isBootstrap ? 'superadmin' : (body.role ?? 'admin'),
        });

        await adminService.audit({
          adminUserId: result.user.id,
          action: isBootstrap ? 'admin.bootstrap' : 'admin.register',
          entityType: 'admin_user',
          entityId: result.user.id,
          ipAddress: request.ip,
        });

        return reply.code(201).send(result);
      } catch (err: any) {
        if (err.message === 'Email already registered') {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // Admin login
  app.post(
    '/api/admin/auth/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { email?: string; password?: string };

      if (!body?.email || !body?.password) {
        return reply.code(400).send({ error: 'Missing required fields: email, password' });
      }

      try {
        const result = await adminService.login(body.email, body.password);

        await adminService.audit({
          adminUserId: result.user.id,
          action: 'admin.login',
          entityType: 'admin_user',
          entityId: result.user.id,
          ipAddress: request.ip,
        });

        return reply.send(result);
      } catch (err: any) {
        if (err.message === 'Invalid credentials') {
          return reply.code(401).send({ error: 'Invalid email or password' });
        }
        throw err;
      }
    },
  );

  // ─── Protected Admin Routes ────────────────────────────────

  // Get current admin profile
  app.get(
    '/api/admin/me',
    { preHandler: adminAuthMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const admin = request.adminUser!;
      const user = await prisma.adminUser.findUnique({
        where: { id: admin.adminId },
        select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
      });
      return reply.send(user);
    },
  );

  // Platform-wide analytics
  app.get(
    '/api/admin/analytics',
    { preHandler: adminAuthMiddleware },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const analytics = await adminService.getPlatformAnalytics();
      return reply.send(analytics);
    },
  );

  // Audit logs
  app.get(
    '/api/admin/audit-logs',
    { preHandler: adminAuthMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { page?: string; limit?: string };
      const page = Math.max(1, parseInt(query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
      const logs = await adminService.getAuditLogs(page, limit);
      return reply.send(logs);
    },
  );

  // List admin users (superadmin only)
  app.get(
    '/api/admin/users',
    { preHandler: [adminAuthMiddleware, superadminOnly] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const admins = await adminService.listAdmins();
      return reply.send({ admins });
    },
  );

  // Delete admin user (superadmin only)
  app.delete(
    '/api/admin/users/:adminId',
    { preHandler: [adminAuthMiddleware, superadminOnly] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const caller = request.adminUser!;
      const { adminId } = request.params as { adminId: string };

      try {
        await adminService.deleteAdmin(adminId, caller.adminId);

        await adminService.audit({
          adminUserId: caller.adminId,
          action: 'admin.delete',
          entityType: 'admin_user',
          entityId: adminId,
          ipAddress: request.ip,
        });

        return reply.code(204).send();
      } catch (err: any) {
        if (err.message === 'Cannot delete your own account') {
          return reply.code(400).send({ error: err.message });
        }
        if (err.message === 'Admin not found') {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // ─── Tenant management (with audit logging) ───────────────

  // Suspend tenant
  app.post(
    '/api/admin/tenants/:tenantId/suspend',
    { preHandler: adminAuthMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const caller = request.adminUser!;
      const { tenantId } = request.params as { tenantId: string };

      const tenant = await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'suspended' },
      });

      await adminService.audit({
        adminUserId: caller.adminId,
        action: 'tenant.suspend',
        entityType: 'tenant',
        entityId: tenantId,
        ipAddress: request.ip,
      });

      return reply.send(tenant);
    },
  );

  // Activate tenant
  app.post(
    '/api/admin/tenants/:tenantId/activate',
    { preHandler: adminAuthMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const caller = request.adminUser!;
      const { tenantId } = request.params as { tenantId: string };

      const tenant = await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'active' },
      });

      await adminService.audit({
        adminUserId: caller.adminId,
        action: 'tenant.activate',
        entityType: 'tenant',
        entityId: tenantId,
        ipAddress: request.ip,
      });

      return reply.send(tenant);
    },
  );
}
