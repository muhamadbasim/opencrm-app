import { beforeEach, describe, expect, it, vi } from "bun:test";

type PlatformSettingRow = {
  key: string;
  value: string;
};

const state = {
  rows: [] as PlatformSettingRow[],
  upserts: [] as Array<{ where?: { key?: string }; update?: { value?: string } }>,
  transactions: 0,
  cacheWrites: 0,
  cacheInvalidations: 0,
};

vi.mock("../src/lib/prisma", () => ({
  default: {
    platform_settings: {
      findMany: vi.fn(async () => state.rows),
      upsert: vi.fn(async (payload: any) => {
        state.upserts.push(payload || {});
        return payload;
      }),
    },
    $transaction: vi.fn(async (ops: unknown[]) => {
      state.transactions += 1;
      return ops;
    }),
  },
}));

vi.mock("../src/lib/redis", () => ({
  default: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {
      state.cacheWrites += 1;
      return "OK";
    }),
    del: vi.fn(async () => {
      state.cacheInvalidations += 1;
      return 1;
    }),
  },
}));

vi.mock("../src/modules/business-webhooks/dispatch-service", () => ({
  BusinessWebhookDispatchService: {},
}));

vi.mock("../src/modules/flow/runtime-service", () => ({
  FlowRuntimeService: {},
}));

const { AIService } = await import("../src/modules/ai/service");

function providerConfig(baseUrl: string, modelName = "gpt-4o-mini") {
  return JSON.stringify({
    base_url: baseUrl,
    model_name: modelName,
  });
}

describe("AIService provider configuration", () => {
  beforeEach(() => {
    state.rows = [];
    state.upserts = [];
    state.transactions = 0;
    state.cacheWrites = 0;
    state.cacheInvalidations = 0;
  });

  it("auto-selects sumopod as active embedding provider when configured", async () => {
    state.rows = [
      { key: "ai.provider.active", value: "growthcircle" },
      {
        key: "ai.provider.config.growthcircle",
        value: providerConfig("https://ai.growthcircle.id/v1", "gpt-5.4"),
      },
      {
        key: "ai.provider.config.sumopod",
        value: providerConfig("https://api.sumopod.ai/v1", "gpt-4o-mini"),
      },
    ];

    const payload = await AIService.getProviderConfigurations();
    expect(payload.active_provider).toBe("growthcircle");
    expect(payload.active_embedding_provider).toBe("sumopod");
  });

  it("falls back to active provider when sumopod is not configured", async () => {
    state.rows = [
      { key: "ai.provider.active", value: "azure" },
      {
        key: "ai.provider.config.azure",
        value: providerConfig("https://contoso.openai.azure.com", "gpt-4o"),
      },
    ];

    const payload = await AIService.getProviderConfigurations();
    expect(payload.active_provider).toBe("azure");
    expect(payload.active_embedding_provider).toBe("azure");
  });

  it("persists explicit active embedding provider updates", async () => {
    const selected = await AIService.setActiveEmbeddingProvider("azure");
    expect(selected).toBe("azure");
    expect(
      state.upserts.some(
        (entry) =>
          entry.where?.key === "ai.provider.embedding.active" &&
          entry.update?.value === "azure",
      ),
    ).toBe(true);
    expect(state.cacheInvalidations).toBeGreaterThan(0);
  });
});
