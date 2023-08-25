#!/usr/bin/env -S node --loader ts-node/esm --experimental-specifier-resolution=node
import * as fs from "fs/promises";
import path from "path";
import { collectPackages, Package } from "./resolve-utils/Package";

export type adjacencyMatrix = Record<string, Record<string, boolean>>;

export async function buildGraph(dir: string): Promise<adjacencyMatrix> {
  const allPackages = await collectPackages(path.join(dir, "node_modules"));

  const mainRaw = await fs.readFile(path.join(dir, "package.json"), "utf8");
  const mainPackage = new Package(mainRaw, undefined, true);
  allPackages.push(mainPackage);

  // Resolve dependencies
  for (const p of allPackages) {
    p.resolveDependencies(allPackages);
  }

  // Generate the graph (adjacencyMatrix)
  const matrix: adjacencyMatrix = {};
  for (const i of allPackages) {
    matrix[i.id] = {};
    for (const j of allPackages) {
      matrix[i.id][j.id] = false;
    }
  }

  for (const p of allPackages) {
    for (const d of p.dependencies) {
      if (d == undefined) {
        console.log(`d is undefined, p is`, p);
      }
      matrix[p.id][d.id] = true;
    }
  }

  return matrix;
}

export async function getRootPackageName(dir: string): Promise<string> {
  const mainRaw = await fs.readFile(path.join(dir, "package.json"), "utf8");
  const mainPackage = new Package(mainRaw, undefined, true);

  return mainPackage.id;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Not being imported, but being run directly
  // Run tests
  await buildGraph("/home/ken/Projects/element-web");

  // console.log("Graph is",graph)
  console.log("Done");
}
