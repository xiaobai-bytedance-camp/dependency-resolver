#!/usr/bin/env -S node --loader ts-node/esm --experimental-specifier-resolution=node
import * as echarts from "echarts";
import { adjacencyMatrix } from "./toam";
import { buildGraph, getRootPackageName } from "./toam";

const NODE_SIZE = 50;
const NODE_HORIZONTAL_MARGIN = 400;
const NODE_VERTICLE_MARGIN = 1000;

export function drawGraph(
  graphMatrix: adjacencyMatrix,
  rootName: string,
): string {
  const allNames = Object.keys(graphMatrix);
  const allNodes: Record<string, Node> = {};
  for (const name of allNames) {
    allNodes[name] = new Node(name);
  }

  const root = allNodes[rootName];

  for (const name of allNames) {
    const node = allNodes[name]!;
    node.link(allNodes, graphMatrix);
  }

  root.calcSize();
  root.calcRelaPos();
  root.pos = [0, 0];
  root.calcPos();

  const chart = echarts.init(null, null, {
    renderer: "svg",
    ssr: true,
    width: root.size![0],
    height: root.size![1],
  });

  const links = [];
  for (const from of Object.keys(graphMatrix)) {
    for (const to of Object.keys(graphMatrix[from])) {
      if (graphMatrix[from][to]) {
        links.push({
          source: from,
          target: to,
          lineStyle: {
            width: 5,
            color: "rgba(200,200,200,1)",
          },
        });
      }
    }
  }

  chart.hideLoading();

  chart.setOption({
    title: {
      text: "dependency resolver graph",
    },
    series: [
      {
        type: "graph",
        layout: "none",
        symbolSize: NODE_SIZE,
        label: {
          show: true,
        },
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: [10, 10],
        data: Object.keys(allNodes)
          .filter((key) => {
            const node = allNodes[key];

            // devDependency would have null pos
            return node.pos != null;
          })
          .map((key) => {
            const node = allNodes[key];

            return {
              name: node.name,
              id: node.name,
              x: node.pos![0],
              y: node.pos![1],
            };
          }),
        links: links,
      },
    ],
    animation: false,
  });

  const svg = chart.renderToSVGString();
  return svg;
}

enum NodeActions {
  construct,
  link,
  calcSize,
  calcRelaPos,
  calcPos,
}

class Node {
  name: string;
  peers: Node[];
  children: Node[];

  posRelativeTo: Node | null;
  relativePos: [number, number] | null;
  pos: [number, number] | null;

  size: [number, number] | null;

  doneAction: NodeActions;

  constructor(name: string) {
    this.name = name;
    this.peers = [];
    this.children = [];
    this.size = null;
    this.posRelativeTo = null;
    this.relativePos = null;
    this.pos = null;
    this.doneAction = NodeActions.construct;
  }

  link(pool: Record<string, Node>, matrix: adjacencyMatrix) {
    if (this.doneAction != NodeActions.construct) {
      throw "link should be called after construct";
    }
    const peer_names = Object.keys(matrix[this.name]!);
    for (const name of peer_names) {
      if (matrix[this.name][name]) {
        const peer = pool[name]!;
        this.peers.push(peer);

        if (peer.posRelativeTo == null) {
          peer.posRelativeTo = this;
          this.children.push(peer);
        }
      }
    }

    this.doneAction = NodeActions.link;
  }

  calcSize() {
    if (this.doneAction != NodeActions.link) {
      throw "calcSize should be called after link";
    }
    for (const c of this.children) {
      if (c.doneAction != NodeActions.link) {
        throw "Children's calcSize should be called after link";
      }
      c.calcSize();
    }

    const widths = this.children.map((c) => c.size![0]);
    const width_sum = widths.reduce((prev, curr) => prev + curr, 0);
    const width = Math.max(
      width_sum + NODE_HORIZONTAL_MARGIN * (this.children.length - 1),
      NODE_SIZE,
    );

    const heights = this.children.map((c) => c.size![1]);
    const height = Math.max(
      NODE_SIZE,
      Math.max(...heights) + NODE_VERTICLE_MARGIN,
    );

    this.size = [width, height];
    this.doneAction = NodeActions.calcSize;
  }

  calcRelaPos() {
    if (this.doneAction != NodeActions.calcSize) {
      throw "calcRelaPos should be called after calcSize";
    }

    let accumulatedWidth = 0;
    for (const c of this.children) {
      if (c.doneAction != NodeActions.calcSize) {
        throw "Children's calcRelaPos should be called after calcSize";
      }
      c.relativePos = [accumulatedWidth, NODE_SIZE + NODE_VERTICLE_MARGIN];

      accumulatedWidth += c.size![0] + NODE_HORIZONTAL_MARGIN;

      c.calcRelaPos();
    }

    this.doneAction = NodeActions.calcRelaPos;
  }

  calcPos() {
    // Call this after setting the root node's position
    if (this.doneAction != NodeActions.calcRelaPos) {
      throw "calcPos should be called after calcRelaPos";
    }

    if (this.posRelativeTo != null) {
      this.pos = [
        this.posRelativeTo.pos![0] + this.relativePos![0],
        this.posRelativeTo.pos![1] + this.relativePos![1],
      ];
    }

    for (const c of this.children) {
      c.calcPos();
    }

    this.doneAction = NodeActions.calcPos;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Not being imported, but being run directly
  // Run tests

  const dir = "..";
  const graph = await buildGraph(dir);
  const root = await getRootPackageName(dir);

  console.log("Graph built, root package name is", root);

  const svg = drawGraph(graph, root);
  console.log(svg);
}
