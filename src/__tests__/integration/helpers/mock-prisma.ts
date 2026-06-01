/**
 * In-memory Prisma mock for integration tests.
 * Provides find/create/update/upsert for the models used by conversation.engine.ts
 * and webhook.handler.ts, storing data in plain Maps.
 */
import { vi } from 'vitest';

// ── In-memory stores ──────────────────────────────────────
export const stores = {
  tenants: new Map<string, any>(),
  contacts: new Map<string, any>(),
  conversations: new Map<string, any>(),
  messages: new Map<string, any>(),
  bookings: new Map<string, any>(),
  complianceAudits: new Map<string, any>(),
  handoffs: new Map<string, any>(),
  events: new Map<string, any>(),
  notifications: new Map<string, any>(),
  campaignContacts: new Map<string, any>(),
  reviews: new Map<string, any>(),
};

let _idCounter = 0;
function nextId(): string { return `test-${++_idCounter}`; }

export function resetStores() {
  for (const store of Object.values(stores)) store.clear();
  _idCounter = 0;
}

// ── Generic model builder ─────────────────────────────────
function buildModel(store: Map<string, any>, uniqueKeys?: string[][]) {
  return {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.id) return store.get(where.id) ?? null;
      // composite unique (e.g. tenantId_phone)
      for (const row of store.values()) {
        let match = true;
        for (const key of Object.keys(where)) {
          if (typeof where[key] === 'object') {
            // composite key like { tenantId_phone: { tenantId, phone } }
            const inner = where[key];
            for (const ik of Object.keys(inner)) {
              if (row[ik] !== inner[ik]) { match = false; break; }
            }
          } else if (row[key] !== where[key]) {
            match = false;
          }
          if (!match) break;
        }
        if (match) return row;
      }
      return null;
    }),
    findFirst: vi.fn(async ({ where }: any = {}) => {
      for (const row of store.values()) {
        let match = true;
        if (where) {
          for (const [k, v] of Object.entries(where)) {
            if (typeof v === 'object' && v !== null && 'in' in (v as any)) {
              if (!(v as any).in.includes(row[k])) { match = false; break; }
            } else if (row[k] !== v) {
              match = false; break;
            }
          }
        }
        if (match) return row;
      }
      return null;
    }),
    findMany: vi.fn(async ({ where, orderBy, take, select }: any = {}) => {
      let results = [...store.values()];
      if (where) {
        results = results.filter((row) => {
          for (const [k, v] of Object.entries(where)) {
            if (row[k] !== v) return false;
          }
          return true;
        });
      }
      if (orderBy) {
        const key = Object.keys(orderBy)[0];
        const dir = (orderBy as any)[key];
        results.sort((a, b) => {
          const av = a[key], bv = b[key];
          if (av < bv) return dir === 'desc' ? 1 : -1;
          if (av > bv) return dir === 'desc' ? -1 : 1;
          return 0;
        });
      }
      if (take) results = results.slice(0, take);
      return results;
    }),
    create: vi.fn(async ({ data }: any) => {
      const id = data.id ?? nextId();
      // Check unique constraints on whatsappMessageId
      if (data.whatsappMessageId) {
        for (const row of store.values()) {
          if (row.whatsappMessageId === data.whatsappMessageId) {
            const err: any = new Error('Unique constraint failed');
            err.code = 'P2002';
            throw err;
          }
        }
      }
      const row = { id, createdAt: new Date(), ...data };
      store.set(id, row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const id = where.id;
      const existing = store.get(id);
      if (!existing) throw new Error(`Record not found: ${id}`);
      // Handle increment
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'object' && v !== null && 'increment' in (v as any)) {
          data[k] = (existing[k] ?? 0) + (v as any).increment;
        }
      }
      const updated = { ...existing, ...data };
      store.set(id, updated);
      return updated;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const [id, row] of store.entries()) {
        let match = true;
        if (where) {
          for (const [k, v] of Object.entries(where)) {
            if (row[k] !== v) { match = false; break; }
          }
        }
        if (match) {
          store.set(id, { ...row, ...data });
          count++;
        }
      }
      return { count };
    }),
    upsert: vi.fn(async ({ where, create: createData, update: updateData }: any) => {
      // Try to find existing
      for (const row of store.values()) {
        let match = true;
        for (const [k, v] of Object.entries(where)) {
          if (typeof v === 'object' && v !== null) {
            for (const [ik, iv] of Object.entries(v as any)) {
              if (row[ik] !== iv) { match = false; break; }
            }
          } else if (row[k] !== v) {
            match = false;
          }
          if (!match) break;
        }
        if (match) {
          const updatedRow = { ...row };
          for (const [k, v] of Object.entries(updateData)) {
            if (v !== undefined) updatedRow[k] = v;
          }
          store.set(row.id, updatedRow);
          return updatedRow;
        }
      }
      // Create new
      const id = createData.id ?? nextId();
      const newRow = { id, createdAt: new Date(), ...createData };
      store.set(id, newRow);
      return newRow;
    }),
    delete: vi.fn(async ({ where }: any) => {
      const id = where.id;
      const row = store.get(id);
      store.delete(id);
      return row;
    }),
  };
}

// ── Build the mock prisma object ──────────────────────────
export const mockPrisma = {
  tenant: buildModel(stores.tenants),
  contact: buildModel(stores.contacts),
  conversation: buildModel(stores.conversations),
  message: buildModel(stores.messages),
  booking: buildModel(stores.bookings),
  complianceAudit: buildModel(stores.complianceAudits),
  handoff: buildModel(stores.handoffs),
  event: buildModel(stores.events),
  notification: buildModel(stores.notifications),
  campaignContact: buildModel(stores.campaignContacts),
  review: buildModel(stores.reviews),
};
