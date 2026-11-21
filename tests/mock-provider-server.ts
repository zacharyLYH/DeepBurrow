import { MOCK_PROVIDER_PORT, startMockProvider } from "./mock-provider.ts";

const provider = await startMockProvider({
  port: MOCK_PROVIDER_PORT,
  latencyMs: Number(process.env.MOCK_LATENCY_MS ?? 500),
});
console.log(`mock provider ${provider.url}`);
