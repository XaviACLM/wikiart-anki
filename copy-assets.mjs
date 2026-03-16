// Copies static files (HTML, manifest) into dist/ after tsc compilation.
import { copyFile, mkdir } from "fs/promises";

await mkdir("dist/popup",   { recursive: true });
await mkdir("dist/options", { recursive: true });

await copyFile("src/popup/popup.html",     "dist/popup/popup.html");
await copyFile("src/options/options.html", "dist/options/options.html");

console.log("Assets copied.");
