import { watch, readdirSync, statSync } from "fs";
import { join, extname } from "path";

export function startWatch(
  inputPath: string,
  onFileChange: (files: string[]) => void
): void {
  const isDir = statSync(inputPath).isDirectory();
  const cssFiles = isDir ? findCSSFiles(inputPath) : [inputPath];

  console.log(`Watching ${cssFiles.length} CSS file(s)...`);

  for (const file of cssFiles) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    watch(file, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log(`Changed: ${file}`);
        onFileChange(cssFiles);
      }, 100);
    });
  }
}

function findCSSFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCSSFiles(full));
    } else if (extname(entry.name) === ".css") {
      results.push(full);
    }
  }
  return results;
}
