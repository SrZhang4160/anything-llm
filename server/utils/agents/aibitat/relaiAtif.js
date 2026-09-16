const fs = require("fs");
const path = require("path");

class RelaiAtifRecorder {
  constructor() {
    this.path = process.env.RELAI_ATIF_TRAJECTORY_PATH;
    if (!this.path) return;
    this.document = this.load();
  }

  load() {
    try {
      const existing = JSON.parse(fs.readFileSync(this.path, "utf8"));
      if (
        existing?.schema_version === "ATIF-v1.7" &&
        Array.isArray(existing.steps)
      )
        return existing;
    } catch {
      // A missing file starts a recording; an unreadable prior snapshot is left untouched.
    }
    return {
      schema_version: "ATIF-v1.7",
      agent: { name: "AnythingLLM AIbitat", version: "1.16.1" },
      steps: [],
    };
  }

  message(chat) {
    if (!this.path || typeof chat?.content !== "string" || !chat.content)
      return;
    const source = chat.from === "@user" ? "user" : "agent";
    this.document.steps.push({
      step_id: this.document.steps.length + 1,
      source,
      message: chat.content,
    });
    const directory = path.dirname(this.path);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(
      directory,
      `.${path.basename(this.path)}.${process.pid}.tmp`
    );
    fs.writeFileSync(temporary, JSON.stringify(this.document), "utf8");
    fs.renameSync(temporary, this.path);
  }
}

function createRelaiAtifRecorder() {
  return process.env.RELAI_ATIF_TRAJECTORY_PATH
    ? new RelaiAtifRecorder()
    : null;
}

module.exports = { createRelaiAtifRecorder };
