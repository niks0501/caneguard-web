import { createServer } from "vite";

let input = "";
for await (const chunk of process.stdin) input += chunk;

const server = await createServer({
  configFile: false,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const { fieldValidationQueueResponseSchema } = await server.ssrLoadModule(
    "/src/data/api/schemas/fieldValidation.schema.ts",
  );
  const result = fieldValidationQueueResponseSchema.safeParse(JSON.parse(input));
  if (!result.success) {
    console.error(JSON.stringify(result.error.issues));
    process.exitCode = 1;
  }
} finally {
  await server.close();
}
