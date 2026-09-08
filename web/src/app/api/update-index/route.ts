import { spawn } from "child_process";
import path from "path";
import { NextResponse } from "next/server";

let running = false;
let lastResult: { ok: boolean; output: string; finishedAt: string } | null = null;

export async function GET() {
  return NextResponse.json({ running, lastResult });
}

export async function POST() {
  if (running) return NextResponse.json({ error: "Update already in progress" }, { status: 409 });

  const mlDir = path.resolve(process.cwd(), "..", "ml");
  if (!require("fs").existsSync(path.join(mlDir, "update_index.py"))) {
    return NextResponse.json(
      { error: "Not available in production. Run the ML pipeline locally and redeploy." },
      { status: 501 }
    );
  }

  running = true;
  lastResult = null;

  const venvPython = path.join(mlDir, ".venv", "Scripts", "python.exe");
  const pythonBin = require("fs").existsSync(venvPython) ? venvPython : "python";
  const child = spawn(pythonBin, ["update_index.py"], {
    cwd: mlDir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (d: Buffer) => { output += d.toString(); });
  child.stderr.on("data", (d: Buffer) => { output += d.toString(); });

  child.on("close", (code) => {
    running = false;
    lastResult = {
      ok: code === 0,
      output: output.slice(-2000),
      finishedAt: new Date().toISOString(),
    };
  });

  child.on("error", (err) => {
    running = false;
    lastResult = {
      ok: false,
      output: `Failed to start: ${err.message}`,
      finishedAt: new Date().toISOString(),
    };
  });

  return NextResponse.json({ started: true });
}
