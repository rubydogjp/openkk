import * as prettier from "prettier";

export async function formatGenerated(filePath, source) {
  const options = await prettier.resolveConfig(filePath);
  return prettier.format(source, { ...options, filepath: filePath });
}
