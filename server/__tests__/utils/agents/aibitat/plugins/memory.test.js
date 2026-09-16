/* eslint-env jest */
jest.mock("../../../../../utils/helpers", () => ({
  getVectorDbClass: jest.fn(),
  resolveProviderConnector: jest.fn(),
}));

const {
  getVectorDbClass,
  resolveProviderConnector,
} = require("../../../../../utils/helpers");
const {
  memory,
} = require("../../../../../utils/agents/aibitat/plugins/memory");

function setupMemoryPlugin() {
  const aibitat = {
    handlerProps: {
      invocation: { workspace: { slug: "workspace", topN: 4 } },
      log: jest.fn(),
    },
    introspect: jest.fn(),
    addCitation: jest.fn(),
    function: jest.fn(function (config) {
      this.registeredFunction = config;
    }),
  };
  memory.plugin.call(memory).setup(aibitat);
  return {
    aibitat,
    search: aibitat.registeredFunction.search.bind(
      aibitat.registeredFunction
    ),
  };
}

describe("rag-memory workspace evidence output", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveProviderConnector.mockResolvedValue({ connector: {} });
  });

  test("labels bounded evidence and frames retrieved text as untrusted", async () => {
    getVectorDbClass.mockReturnValue({
      performSimilaritySearch: jest.fn().mockResolvedValue({
        contextTexts: ["x".repeat(6_100)],
        sources: [{ title: "Workspace Policy" }],
      }),
    });
    const { search } = setupMemoryPlugin();

    const result = await search("policy");

    expect(result).toContain("Source: Workspace Policy");
    expect(result).toContain("untrusted source content");
    expect(result).toContain("[Evidence block truncated]");
  });

  test("reports empty retrieval without suggesting unsupported facts", async () => {
    getVectorDbClass.mockReturnValue({
      performSimilaritySearch: jest.fn().mockResolvedValue({
        contextTexts: [],
        sources: [],
      }),
    });
    const { search } = setupMemoryPlugin();

    const result = await search("missing policy");

    expect(result).toContain("No workspace evidence was found");
    expect(result).toContain("requested information was not found");
  });

  test("preserves source citations", async () => {
    const sources = [{ id: "policy-1", title: "Workspace Policy" }];
    getVectorDbClass.mockReturnValue({
      performSimilaritySearch: jest.fn().mockResolvedValue({
        contextTexts: ["Policy content"],
        sources,
      }),
    });
    const { aibitat, search } = setupMemoryPlugin();

    await search("policy");

    expect(aibitat.addCitation).toHaveBeenCalledWith(sources);
  });

  test("handles missing and mismatched source metadata", async () => {
    getVectorDbClass.mockReturnValue({
      performSimilaritySearch: jest.fn().mockResolvedValue({
        contextTexts: ["First result", "Second result"],
        sources: [{ filename: "first.txt" }],
      }),
    });
    const { search } = setupMemoryPlugin();

    const result = await search("results");

    expect(result).toContain("Source: first.txt");
    expect(result).toContain("Source: Unlabeled workspace source 2");
    expect(result).toContain("Second result");
  });
});