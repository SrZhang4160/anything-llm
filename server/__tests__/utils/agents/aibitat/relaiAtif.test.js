const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createRelaiAtifRecorder,
} = require("../../../../utils/agents/aibitat/relaiAtif");

describe("optional RELAI trajectory recording", () => {
  let directory;
  let originalPath;

  beforeEach(() => {
    originalPath = process.env.RELAI_ATIF_TRAJECTORY_PATH;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "anythingllm-atif-"));
    delete process.env.RELAI_ATIF_TRAJECTORY_PATH;
  });

  afterEach(() => {
    if (originalPath === undefined)
      delete process.env.RELAI_ATIF_TRAJECTORY_PATH;
    else process.env.RELAI_ATIF_TRAJECTORY_PATH = originalPath;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test("ordinary app sessions do not create a recorder or files", () => {
    expect(createRelaiAtifRecorder()).toBeNull();
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  test("records user and assistant turns as complete readable snapshots", () => {
    const destination = path.join(directory, "nested", "trajectory.json");
    process.env.RELAI_ATIF_TRAJECTORY_PATH = destination;
    const recorder = createRelaiAtifRecorder();
    recorder.message({ from: "@user", content: "What does the policy say?" });
    expect(JSON.parse(fs.readFileSync(destination, "utf8")).steps).toHaveLength(
      1
    );
    recorder.message({
      from: "@agent",
      content: "The policy requires review.",
    });
    const document = JSON.parse(fs.readFileSync(destination, "utf8"));
    expect(document.schema_version).toBe("ATIF-v1.7");
    expect(
      document.steps.map(({ step_id, source }) => ({ step_id, source }))
    ).toEqual([
      { step_id: 1, source: "user" },
      { step_id: 2, source: "agent" },
    ]);
    expect(fs.readdirSync(path.dirname(destination))).toEqual([
      "trajectory.json",
    ]);
  });

  test("continues an existing trajectory across adapter invocations", () => {
    const destination = path.join(directory, "trajectory.json");
    process.env.RELAI_ATIF_TRAJECTORY_PATH = destination;
    createRelaiAtifRecorder().message({ from: "@user", content: "First turn" });
    createRelaiAtifRecorder().message({
      from: "@agent",
      content: "Second turn",
    });
    const document = JSON.parse(fs.readFileSync(destination, "utf8"));
    expect(document.steps.map((step) => step.message)).toEqual([
      "First turn",
      "Second turn",
    ]);
    expect(document.steps[1].step_id).toBe(2);
  });
});
