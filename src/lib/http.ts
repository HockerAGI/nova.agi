import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import type { JsonObject } from "../types.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(reply: FastifyReply, status: number, payload: unknown): FastifyReply {
  return reply.code(status).header("cache-control", "no-store").send(payload);
}

export function cryptoRandomId(): string {
  return crypto.randomUUID();
}

export function requestId(req: FastifyRequest): string {
  const rid = req.headers["x-request-id"];
  return typeof rid === "string" && rid.trim() ? rid.trim() : cryptoRandomId();
}

export function requireAuth(req: FastifyRequest): void {
  const expected = String(config.orchestratorKey ?? "").trim();

  if (!expected) {
    return;
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    throw new HttpError(401, "Falta autorización Bearer.");
  }

  const token = auth.slice(7).trim();
  if (!token) {
    throw new HttpError(401, "Bearer vacío.");
  }

  const a = Buffer.from(token);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(403, "Token inválido.");
  }
}

export async function readJsonBody<T extends JsonObject = JsonObject>(req: FastifyRequest): Promise<T> {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Body JSON inválido.");
  }
  return body as T;
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof Error) {
    return new HttpError(500, error.message);
  }

  return new HttpError(500, "Error interno.");
}