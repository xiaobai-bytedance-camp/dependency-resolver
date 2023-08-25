#!/usr/bin/env -S node --loader ts-node/esm --experimental-specifier-resolution=node
import { Command } from "commander";
import { buildJson } from "./tojson";
import { buildGraph, getRootPackageName } from "./toam";
import { drawGraph } from "./graph";
import open from "open";
import * as fs from "fs/promises";

const program = new Command();

program
  .command("hello")
  .description("Test that this puppet works")
  .action(() => {
    console.log("It's working!");
  });

program
  .argument(
    "<path>",
    "Path to the package to resolve. It should contain package.json. ",
  )
  .option(
    "--json <filepath>",
    "Output the result to a json file, don't draw it or open browser. ",
  )
  .action(async (path, opt) => {
    if (opt.json) {
      const result = await buildJson(path);
      await fs.writeFile(opt.json, result);
    } else {
      const graph = await buildGraph(path);
      const rootName = await getRootPackageName(path);

      const svg = drawGraph(graph, rootName);

      const filename = "./.tmp_output.svg";
      await fs.writeFile(filename, svg);
      await open(filename);

      // The browser will store it in memory...
      // await fs.rm(filename)
    }
  });

await program.parseAsync();
