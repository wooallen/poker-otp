import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const outDir = path.join(rootDir, "out");

console.log("1. Building static export for /poker-otp...");
execSync("npm run build", {
  cwd: rootDir,
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_BASE_PATH: "/poker-otp" },
});

// Ensure .nojekyll is present so GitHub Pages serves _next/ static assets
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

const remoteUrl = execSync("git remote get-url origin", {
  cwd: rootDir,
  encoding: "utf8",
}).trim();

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "poker-otp-pages-"));

try {
  fs.cpSync(outDir, tempDir, { recursive: true });
  execSync("git init -b gh-pages", { cwd: tempDir, stdio: "ignore" });
  execSync('git config user.name "wooallen"', { cwd: tempDir });
  execSync('git config user.email "wooallen@users.noreply.github.com"', {
    cwd: tempDir,
  });
  execSync("git add -A", { cwd: tempDir });
  execSync('git commit -m "deploy: static build to GitHub Pages"', {
    cwd: tempDir,
    stdio: "inherit",
  });
  console.log("2. Pushing static site to origin/gh-pages...");
  execSync(
    `git -c credential.helper='!gh auth git-credential' push --force "${remoteUrl}" gh-pages:gh-pages`,
    { cwd: tempDir, stdio: "inherit" }
  );
  console.log("✓ Deployed to gh-pages branch!");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
