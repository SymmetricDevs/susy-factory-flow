import path from "node:path";
import process from "node:process";
import {
  executeStandaloneStep,
  parseCliArgs,
  repoRoot,
  runCommand,
  saveConfig,
  updateConfigPaths,
} from "./pipeline-lib.mjs";

const options = parseCliArgs();

await executeStandaloneStep("download", async (logger, config) => {
  const resolver = path.join(
    repoRoot,
    "tools",
    "dataset-pipeline",
    "scripts",
    "susy",
    "resolve-susy-instance.mjs",
  );
  const args = [resolver, "--json"];
  if (config.settings?.instanceExplicit) {
    args.push("--instance", config.paths.instanceDir);
  } else {
    args.push("--bootstrap-dir", config.paths.instanceDir);
  }
  if (config.pack?.ref) args.push("--ref", String(config.pack.ref));
  if (config.settings?.bootstrap === false) args.push("--no-bootstrap");
  if (config.settings?.bootstrap !== false) args.push("--bootstrap-if-missing");

  const result = await runCommand(process.execPath, args, {
    logger,
    label: "Resolve or bootstrap the Supersymmetry instance",
    progress: "Downloading / preparing Supersymmetry pack",
  });
  let resolved;
  try {
    resolved = JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`Could not parse instance resolver output: ${error.message}`);
  }
  if (!resolved?.found || !resolved.instanceDir) {
    throw new Error("The resolver did not return a usable Supersymmetry instance.");
  }

  config.paths.instanceDir = path.resolve(resolved.instanceDir);
  config.pack.versionId = config.pack.versionId ?? resolved.version;
  config.pack.versionLabel = config.pack.versionLabel ??
    (resolved.version ? `SUSY ${resolved.version}` : undefined);
  config.pack.ref = config.pack.ref ?? resolved.ref;
  updateConfigPaths(config);
  await saveConfig(config);
  logger.info(`Using instance ${config.paths.instanceDir}.`);
  logger.info(`Dataset version: ${config.pack.versionId ?? "not specified"}.`);
  return {
    instanceDir: config.paths.instanceDir,
    versionId: config.pack.versionId,
    versionLabel: config.pack.versionLabel,
  };
}, options);
