import path from "node:path";
import process from "node:process";
import {
  executeStandaloneStep,
  parseCliArgs,
  repoRoot,
  runCommand,
} from "./pipeline-lib.mjs";

const options = parseCliArgs();

await executeStandaloneStep("extract", async (logger, config) => {
  const runner = path.join(
    repoRoot,
    "tools",
    "dataset-pipeline",
    "scripts",
    "susy",
    process.platform === "win32" ? "run-susy-export.ps1" : "run-susy-export.sh",
  );
  const env = {
    SUSY_INSTANCE_DIR: config.paths.instanceDir,
    SUSY_DATASET_VERSION_ID: config.pack.versionId,
    SUSY_DATASET_VERSION_LABEL: config.pack.versionLabel,
    SUSY_DATASET_OUT_DIR: config.paths.datasetDir,
    SUSY_RAW_EXPORT_DIR: config.paths.rawExportDir,
    SUSY_EXPORT_PHASE: "extract",
  };

  const command = process.platform === "win32" ? "powershell.exe" : "bash";
  const args = process.platform === "win32"
    ? ["-ExecutionPolicy", "Bypass", "-File", runner]
    : [runner];
  await runCommand(command, args, {
    logger,
    env,
    label: "Extract recipes and rendered icons from the SUSY client",
    progress: "Extracting game resources",
    shell: false,
  });
  return {
    rawRecipeDump: path.join(config.paths.rawExportDir, "recipedump.json"),
    renderedIconDir: path.join(config.paths.rawExportDir, "rendered-icons"),
  };
}, options);
