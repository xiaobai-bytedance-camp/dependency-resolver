#!/usr/bin/env -S node --loader ts-node/esm --experimental-specifier-resolution=node
import { buildGraph } from "./toam";

export async function buildJson(directory: string): Promise<string> {
  const graph = await buildGraph(directory);

  const dependencies: { [key: string]: string[] } = {};
  for (const from of Object.keys(graph)) {
    dependencies[from] = Object.keys(graph[from]).filter(
      (key) => graph[from][key] == true,
    );
  }

  return JSON.stringify(dependencies);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Not being imported, but being run directly
  // Run tests
  await buildJson("/home/ken/Projects/element-web");

  console.log("Done");
}
