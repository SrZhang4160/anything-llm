const AIbitat = require("../../../../utils/agents/aibitat");
const {
  MODEL_PRICING,
} = require("../../../../utils/helpers/modelPricing");

describe("AIbitat.getProviderForConfig providerSlug wiring", () => {
  const originalOpenAiKey = process.env.OPEN_AI_KEY;

  beforeAll(() => {
    // The OpenAI SDK refuses to construct without an api key - the tests
    // never make a request, so any value works.
    process.env.OPEN_AI_KEY = "test-key";
  });

  afterAll(() => {
    if (originalOpenAiKey === undefined) delete process.env.OPEN_AI_KEY;
    else process.env.OPEN_AI_KEY = originalOpenAiKey;
  });

  afterEach(() => jest.restoreAllMocks());

  test("stamps the instance with the AnythingLLM slug it was built from", () => {
    const aibitat = new AIbitat({ provider: "openai", model: "gpt-4o" });
    const provider = aibitat.getProviderForConfig({
      provider: "openai",
      model: "gpt-4o",
    });

    // The slug must be the pricing-map key ("openai"), not the class name
    // ("OpenAIProvider") that goes into the metrics `provider` field.
    expect(provider.providerSlug).toBe("openai");
    expect(provider.constructor.name).not.toBe(provider.providerSlug);
  });

  test("re-routing to a different slug stamps the new delegate's slug", () => {
    // Mirrors a model router re-route: same aibitat, a new per-turn provider
    // instance built from the resolved delegate's slug.
    const aibitat = new AIbitat({ provider: "openai", model: "gpt-4o" });
    const first = aibitat.getProviderForConfig({
      provider: "openai",
      model: "gpt-4o",
    });
    const second = aibitat.getProviderForConfig({
      provider: "ollama",
      model: "llama3:latest",
    });

    expect(first.providerSlug).toBe("openai");
    expect(second.providerSlug).toBe("ollama");
  });

  test("a pre-built provider instance keeps its own slug", () => {
    const aibitat = new AIbitat({ provider: "openai", model: "gpt-4o" });
    const prebuilt = aibitat.getProviderForConfig({
      provider: "openai",
      model: "gpt-4o",
    });
    prebuilt.providerSlug = "custom-slug";

    // config.provider as an object bypasses construction entirely - the
    // stamp must not overwrite the slug the instance already carries.
    const returned = aibitat.getProviderForConfig({ provider: prebuilt });
    expect(returned).toBe(prebuilt);
    expect(returned.providerSlug).toBe("custom-slug");
  });

  test("the stamped slug is what reaches the pricing lookup", () => {
    const getCostBreakdown = jest
      .spyOn(MODEL_PRICING, "getCostBreakdown")
      .mockReturnValue({ inputCost: 1, outputCost: 2, totalCost: 3 });

    const aibitat = new AIbitat({ provider: "openai", model: "gpt-4o" });
    const provider = aibitat.getProviderForConfig({
      provider: "openai",
      model: "gpt-4o",
    });

    provider.resetUsage();
    provider.recordUsage({ prompt_tokens: 100, completion_tokens: 10 });

    expect(getCostBreakdown).toHaveBeenCalledWith(
      "openai",
      "gpt-4o",
      expect.objectContaining({ prompt_tokens: 100, completion_tokens: 10 })
    );
    expect(provider.getCumulativeUsage().totalCost).toBe(3);
  });
});

describe("AIbitat tool guidance", () => {
  const originalRerankerSetting = process.env.AGENT_SKILL_RERANKER_ENABLED;

  beforeAll(() => {
    process.env.AGENT_SKILL_RERANKER_ENABLED = "false";
  });

  afterAll(() => {
    if (originalRerankerSetting === undefined)
      delete process.env.AGENT_SKILL_RERANKER_ENABLED;
    else
      process.env.AGENT_SKILL_RERANKER_ENABLED = originalRerankerSetting;
  });

  afterEach(() => jest.restoreAllMocks());

  function buildAgent({ supportsAgentStreaming, functions = [] }) {
    const aibitat = new AIbitat({
      provider: "openai",
      chats: [
        {
          from: "@user",
          to: "@agent",
          content: "Check the workspace policy.",
          state: "success",
        },
      ],
      handlerProps: { log: jest.fn() },
    });
    aibitat.agent("@agent", {
      role: "You are helpful.",
      functions,
    });
    aibitat.agent("@user", { role: "User" });
    jest.spyOn(aibitat, "getProviderForConfig").mockReturnValue({
      supportsAgentStreaming,
      attachHandlerProps: jest.fn(),
    });
    return aibitat;
  }

  test.each([
    ["streaming", true, "handleAsyncExecution"],
    ["non-streaming", false, "handleExecution"],
  ])(
    "injects available tool guidance into the %s path",
    async (_, streaming, handlerName) => {
      const aibitat = buildAgent({
        supportsAgentStreaming: streaming,
        functions: ["workspace-tool"],
      });
      aibitat.function({
        name: "workspace-tool",
        description: "Search the workspace.",
        parameters: {},
        agentGuidance: "Search workspace sources before answering.",
      });
      const execution = jest
        .spyOn(aibitat, handlerName)
        .mockResolvedValue("Grounded answer");

      await aibitat.reply({ from: "@agent", to: "@user" });

      const messages = execution.mock.calls[0][0];
      expect(messages).toContainEqual({
        role: "system",
        content: expect.stringContaining(
          "Search workspace sources before answering."
        ),
      });
    }
  );

  test.each([
    ["tool-free chat", []],
    ["an unavailable tool", ["missing-tool"]],
  ])("does not inject guidance for %s", async (_, functions) => {
    const aibitat = buildAgent({
      supportsAgentStreaming: false,
      functions,
    });
    aibitat.function({
      name: "other-tool",
      description: "An unrelated tool.",
      parameters: {},
      agentGuidance: "Guidance that must not leak.",
    });
    const execution = jest
      .spyOn(aibitat, "handleExecution")
      .mockResolvedValue("Ordinary answer");

    await aibitat.reply({ from: "@agent", to: "@user" });

    const messages = execution.mock.calls[0][0];
    expect(messages).not.toContainEqual({
      role: "system",
      content: expect.stringContaining("Guidance that must not leak."),
    });
  });

  test("keeps guidance in post-tool recursive completions", async () => {
    jest
      .spyOn(
        require("../../../../models/telemetry").Telemetry,
        "sendTelemetry"
      )
      .mockResolvedValue();
    const aibitat = new AIbitat({
      provider: "openai",
      handlerProps: { log: jest.fn() },
    });
    aibitat.function({
      name: "workspace-tool",
      handler: jest.fn().mockResolvedValue("Workspace evidence"),
    });
    aibitat.providerInstance = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          functionCall: {
            name: "workspace-tool",
            arguments: { query: "policy" },
          },
        })
        .mockResolvedValueOnce({
          functionCall: null,
          textResponse: "Grounded answer",
        }),
      resetCumulativeUsage: jest.fn(),
      getCumulativeUsage: jest.fn().mockReturnValue({}),
    };
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "system", content: "Tool guidance remains active." },
      { role: "user", content: "What is the policy?" },
    ];

    await aibitat.handleExecution(messages, [
      aibitat.functions.get("workspace-tool"),
    ]);

    const recursiveMessages =
      aibitat.providerInstance.complete.mock.calls[1][0];
    expect(recursiveMessages).toContainEqual(messages[1]);
    expect(recursiveMessages).toContainEqual(
      expect.objectContaining({
        role: "function",
        content: "Workspace evidence",
      })
    );
  });
});
