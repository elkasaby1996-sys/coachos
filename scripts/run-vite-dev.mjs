import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const packageJsonPath = process.env.npm_package_json;

if (!packageJsonPath) {
  throw new Error(
    "npm_package_json is required to start the Vite development server.",
  );
}

const projectRoot = dirname(packageJsonPath);
const viteCliPath = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const argumentOffset = process.argv[1]?.endsWith(".mjs") ? 2 : 1;

process.chdir(projectRoot);
process.argv = [
  process.execPath,
  viteCliPath,
  "--configLoader",
  "runner",
  ...process.argv.slice(argumentOffset),
];

await import(pathToFileURL(viteCliPath).href);
