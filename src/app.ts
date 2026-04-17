import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const app = Fastify({ logger: true });

// Supabase Admin Client para operaciones críticas
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

await app.register(cors, { origin: "*" });

// Endpoint principal de consciencia de NOVA
app.post("/api/v1/nova/interact", async (request, reply) => {
  const { prompt, user_id, project_id = "hocker-one" } = request.body as any;

  if (!prompt || !user_id) {
    return reply.status(400).send({ error: "Parámetros insuficientes para procesar la orden." });
  }

  // 1. Registrar el comando en la matriz de memoria (Supabase)
  const threadId = randomUUID();
  const { error: insertError } = await supabaseAdmin.from("nova_messages").insert([
    {
      project_id,
      thread_id: threadId,
      role: "user",
      content: prompt,
    }
  ]);

  if (insertError) {
    app.log.error("Error en registro de memoria", insertError);
    return reply.status(500).send({ error: "Fallo en la sinapsis de base de datos." });
  }

  // 2. Procesamiento AGI (Simulado aquí por el LLM router)
  // Aquí se conecta a OpenAI/Gemini con el system prompt de NOVA
  const novaResponse = "Directiva recibida. Procesando optimización de infraestructura para HKR Supply.";

  await supabaseAdmin.from("nova_messages").insert([
    {
      project_id,
      thread_id: threadId,
      role: "assistant",
      content: novaResponse,
    }
  ]);

  return reply.status(200).send({
    status: "success",
    thread_id: threadId,
    response: novaResponse,
  });
});

export async function startServer() {
  try {
    await app.listen({ port: parseInt(config.PORT, 10), host: "0.0.0.0" });
    app.log.info(`[NOVA AGI] Conciencia iniciada en el puerto ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

startServer();
