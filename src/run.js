const { spawn } = require("child_process");

function clampOutput(s, maxChars) {
  if (!s) return "";
  return s.length > maxChars ? s.slice(0, maxChars) + "\n[output truncated]" : s;
}

function runProcess({ cmd, args, input, timeoutMs, maxOutputChars }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      p.kill("SIGKILL");
    }, timeoutMs);

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      clearTimeout(timer);
      const runtimeMs = Date.now() - started;

      stdout = clampOutput(stdout, maxOutputChars);
      stderr = clampOutput(stderr, maxOutputChars);

      resolve({
        code,
        runtimeMs,
        killed,
        stdout,
        stderr
      });
    });

    if (input != null) p.stdin.write(String(input));
    p.stdin.end();
  });
}

function normalize(s) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

// ---- Language runners ----
// IMPORTANT: This is “inside the container”, NOT container-per-run.
// Later we can upgrade to stronger sandboxing.
async function runPython({ sourceCode, input, timeoutMs, maxOutputChars }) {
  // run code by piping into python -c
  // Expect the user to provide a solve(input) and print output OR just script that reads stdin.
  const code = sourceCode;
  return runProcess({
    cmd: "python3",
    args: ["-c", code],
    input,
    timeoutMs,
    maxOutputChars
  });
}

async function runJavaScript({ sourceCode, input, timeoutMs, maxOutputChars }) {
  const code = sourceCode;
  return runProcess({
    cmd: "node",
    args: ["-e", code],
    input,
    timeoutMs,
    maxOutputChars
  });
}

async function evaluate({ language, sourceCode, testcases, timeoutMs, maxOutputChars }) {
  const results = [];

  for (const tc of testcases) {
    const expected = normalize(tc.output);
    const input = tc.input ?? "";

    let r;
    if (language === "python") {
      r = await runPython({ sourceCode, input, timeoutMs, maxOutputChars });
    } else if (language === "javascript") {
      r = await runJavaScript({ sourceCode, input, timeoutMs, maxOutputChars });
    } else {
      return { ok: false, error: "Unsupported language" };
    }

    const actual = normalize(r.stdout);
    const passed = !r.killed && r.code === 0 && actual === expected;

    results.push({
      passed,
      actualOutput: actual,
      error: r.killed ? "Time limit exceeded" : (r.stderr || ""),
      runtimeMs: r.runtimeMs
    });
  }

  return { ok: true, results };
}

async function runHandler(req, res) {
  try {
    const { language, sourceCode, testcases } = req.body || {};

    if (!language || !sourceCode || !Array.isArray(testcases) || testcases.length === 0) {
      return res.status(400).json({ ok: false, error: "language, sourceCode, testcases[] required" });
    }

    const timeoutMs = Number(process.env.TIMEOUT_MS || 2000);
    const maxOutputChars = Number(process.env.MAX_OUTPUT_CHARS || 20000);

    const out = await evaluate({ language, sourceCode, testcases, timeoutMs, maxOutputChars });
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Runner error" });
  }
}

module.exports = { runHandler };
