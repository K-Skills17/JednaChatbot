import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service';
import { jwtAuthMiddleware } from '../../middleware/jwt-auth';

export function registerAuthRoutes(app: FastifyInstance): void {
  // ─── Public Routes (no auth required) ────────────────────

  // Register a new tenant user (requires admin API key to create first user)
  app.post(
    '/api/auth/register',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Registration requires either admin API key or JWT from an existing owner
      const apiKey = request.headers['x-api-key'] as string | undefined;
      const authHeader = request.headers.authorization;
      let callerTenantId: string | undefined;
      let callerRole: string | undefined;

      if (authHeader?.startsWith('Bearer ')) {
        try {
          const payload = authService.verifyToken(authHeader.slice(7));
          callerTenantId = payload.tenantId;
          callerRole = payload.role;
        } catch {
          // invalid token
        }
      }

      const isAdmin = apiKey && (await isAdminKey(apiKey));

      const body = request.body as {
        tenantId?: string;
        email?: string;
        password?: string;
        name?: string;
        role?: string;
      };

      if (!body?.email || !body?.password || !body?.name) {
        return reply.code(400).send({ error: 'Missing required fields: email, password, name' });
      }

      if (body.password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' });
      }

      // Determine tenantId: from body (admin), or from caller's JWT
      const tenantId = body.tenantId ?? callerTenantId;
      if (!tenantId) {
        return reply.code(400).send({ error: 'Missing tenantId (provide in body or use JWT)' });
      }

      // Only admins and owners can register new users
      if (!isAdmin && callerRole !== 'owner') {
        return reply.code(403).send({ error: 'Only admins or tenant owners can register users' });
      }

      // Only owners can create other owners
      if (body.role === 'owner' && !isAdmin) {
        return reply.code(403).send({ error: 'Only admins can create owner accounts' });
      }

      try {
        const result = await authService.register({
          tenantId,
          email: body.email,
          password: body.password,
          name: body.name,
          role: body.role,
        });
        return reply.code(201).send(result);
      } catch (err: any) {
        if (err.message === 'Email already registered') {
          return reply.code(409).send({ error: err.message });
        }
        if (err.message === 'Tenant not found') {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // Login
  app.post(
    '/api/auth/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { email?: string; password?: string };

      if (!body?.email || !body?.password) {
        return reply.code(400).send({ error: 'Missing required fields: email, password' });
      }

      try {
        const result = await authService.login(body.email, body.password);
        return reply.send(result);
      } catch (err: any) {
        if (err.message === 'Invalid credentials') {
          return reply.code(401).send({ error: 'Invalid email or password' });
        }
        throw err;
      }
    },
  );

  // ─── Protected Routes (JWT required) ─────────────────────

  // Get current user profile
  app.get(
    '/api/auth/me',
    { preHandler: jwtAuthMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).jwtUser;
      const profile = await authService.getProfile(user.userId);
      return reply.send(profile);
    },
  );

  // Change password
  app.post(
    '/api/auth/change-password',
    { preHandler: jwtAuthMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).jwtUser;
      const body = request.body as { currentPassword?: string; newPassword?: string };

      if (!body?.currentPassword || !body?.newPassword) {
        return reply.code(400).send({ error: 'Missing required fields: currentPassword, newPassword' });
      }

      if (body.newPassword.length < 8) {
        return reply.code(400).send({ error: 'New password must be at least 8 characters' });
      }

      try {
        await authService.changePassword(user.userId, body.currentPassword, body.newPassword);
        return reply.send({ message: 'Password changed successfully' });
      } catch (err: any) {
        if (err.message === 'Current password is incorrect') {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // List users for the tenant (owner only)
  app.get(
    '/api/auth/users',
    { preHandler: jwtAuthMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).jwtUser;
      if (user.role !== 'owner') {
        return reply.code(403).send({ error: 'Only owners can list users' });
      }

      const users = await authService.listUsers(user.tenantId);
      return reply.send({ users });
    },
  );

  // Delete a user (owner only)
  app.delete(
    '/api/auth/users/:userId',
    { preHandler: jwtAuthMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const caller = (request as any).jwtUser;
      if (caller.role !== 'owner') {
        return reply.code(403).send({ error: 'Only owners can delete users' });
      }

      const { userId } = request.params as { userId: string };
      try {
        await authService.deleteUser(userId, caller.userId);
        return reply.code(204).send();
      } catch (err: any) {
        if (err.message === 'Cannot delete your own account') {
          return reply.code(400).send({ error: err.message });
        }
        if (err.message === 'User not found') {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}

/** Check if the given key is a valid admin/global API key */
async function isAdminKey(key: string): Promise<boolean> {
  const { env } = await import('../../config/env');
  return key === env.API_KEY && key !== 'not-set';
}
