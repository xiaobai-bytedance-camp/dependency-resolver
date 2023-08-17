#!/usr/bin/env -S node --loader ts-node/esm --experimental-specifier-resolution=node
import * as fs from "fs/promises";
import path from "path";

type adjacencyMatrix = { [key: string]: { [key: string]: boolean } };

export async function buildGraph(dir: string): Promise<adjacencyMatrix> {
  let allPackages = await collectPackages(path.join(dir, "node_modules"));

  const mainRaw = await fs.readFile(path.join(dir, "package.json"), "utf8");
  const mainPackage = new Package(mainRaw);
  allPackages.push(mainPackage);

  // Resolve dependencies
  for (const p of allPackages) {
    p.resolveDependencies(allPackages);
  }

  // Generate the graph (adjacencyMatrix)
  let matrix: adjacencyMatrix = {};
  for (const i of allPackages) {
    matrix[i.id] = {};
    for (const j of allPackages) {
      matrix[i.id][j.id] = false;
    }
  }

  for (const p of allPackages) {
    for (const d of p.dependencies) {
      matrix[p.id][d.id] = true;
    }
  }

  return matrix;
}

async function hasDirectory(path: string): Promise<boolean> {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

/*
 * Collect packages recursively into @xxx, but don't
 * resolve their dependencies.
 *
 * :param: dir: string The node_modules directory path
 *         For example: ../node_modules
 */
async function collectPackages(dir: string): Promise<Package[]> {
  // Find all packages in current directory
  const dir_contents = await fs.readdir(dir);

  // Discard hidden files
  const package_names = dir_contents.filter((x) => !x.startsWith("."));

  // Process them, recursively if needed
  let all_packages: Package[] = [];
  for (const name of package_names) {
    if (name.startsWith("@")) {
      const inner_packages = await collectPackages(path.join(dir, name));
      all_packages = all_packages.concat(inner_packages);
    } else {
      const raw = await fs.readFile(
        path.join(dir, name, "package.json"),
        "utf8",
      );
      const p = new Package(raw);
      all_packages.push(p);
    }

    const inner_path = path.join(dir, name, "node_modules");
    if (await hasDirectory(inner_path)) {
      const inner_packages = await collectPackages(inner_path);
      all_packages = all_packages.concat(inner_packages);
    }
  }

  return all_packages;
}

class Package {
  name: string;
  version: string; // An exact versoin
  dependencies: Package[];
  raw: any;

  constructor(packageJson: string) {
    const p = JSON.parse(packageJson);
    this.raw = p;

    this.name = p.name;
    this.version = p.version;
    this.dependencies = []; // Resolve later, otherwise might go to dead loop
  }

  resolveDependencies(allPackages: Package[]) {
    console.log(`Resolving dependencies of ${this.name}`);
    for (const name of Object.keys(this.raw.dependencies ?? {})) {
      const verreqs: string = this.raw.dependencies[name];
      const reqs = new PackageRequirements(this.name, verreqs);

      const matches = reqs.match(allPackages);
      const dep = PackageRequirement.chooseLatest(matches);
      this.dependencies.push(dep);
    }
  }

  get id(): string {
    return `${this.name}@${this.version}`;
  }
}

interface Requirement {
  match(pool: Package[]): Package[];
}

enum VersionRequirementType {
  Exact,
  Tilde, // 1.0.x
  Caret, // 1.x.x
  GreaterOrEqual,
  LessThan,
  GitUrl,
  Any,
}
class PackageRequirement implements Requirement {
  name: string;
  type: VersionRequirementType;
  ver: string;

  constructor(name: string, ver: string) {
    this.name = name;
    if (ver.startsWith("~")) {
      this.type = VersionRequirementType.Tilde;
      this.ver = ver.slice(1);
    } else if (ver.startsWith("^")) {
      this.type = VersionRequirementType.Caret;
      this.ver = ver.slice(1);
    } else if (ver.startsWith(">=")) {
      this.type = VersionRequirementType.GreaterOrEqual;
      this.ver = ver.slice(2);
    } else if (ver.startsWith("http") || ver.startsWith("git")) {
      this.type = VersionRequirementType.GitUrl;
      this.ver = ver;
    } else if (ver == "*") {
      this.type = VersionRequirementType.Any;
      this.ver = "";
    } else {
      this.type = VersionRequirementType.Exact;
      this.ver = ver;
    }
  }

  parseVersions(vera: string, verb: string): Number[][] {
    const aa = vera.split("-")[0];
    let ab = aa.split(".").map((x) => Number(x));
    while (ab.length < 3) {
      ab.push(0);
    }

    const ba = verb.split("-")[0];
    const bb = ba.split(".").map((x) => Number(x));
    while (bb.length < 3) {
      bb.push(0);
    }

    if (ab.length != 3 || bb.length != 3) {
      console.error(
        `Cannot parse ${vera} and ${verb}; split(".") isn't 3 parts.`,
      );
      throw "CannotParse";
    }

    return [ab, bb];
  }

  match(pool: Package[]): Package[] {
    // pool: All packages from node_modules
    const name_matches = pool.filter((p) => p.name == this.name);
    if (name_matches.length == 0) {
      console.warn(`${this.name} is not in pool`);
      return [pool[0]]; // TODO: Why can this happen...
      // throw "NotInPool"
    }

    const version_range_matched = name_matches.filter((p) => {
      let thisv, pv;

      switch (this.type) {
        case VersionRequirementType.Exact:
          return p.version == this.ver;
        case VersionRequirementType.Tilde: // 1.0.x
          [thisv, pv] = this.parseVersions(this.ver, p.version);
          return (
            thisv[0] == pv[0] &&
            thisv[1] == pv[1] &&
            compareVersion(p.version, this.ver) > 0
          );
        case VersionRequirementType.Caret: // 1.x.x
          [thisv, pv] = this.parseVersions(this.ver, p.version);
          return thisv[0] == pv[0] && compareVersion(p.version, this.ver) > 0;
        case VersionRequirementType.GreaterOrEqual:
          return compareVersion(p.version, this.ver) > 0;
        case VersionRequirementType.GitUrl:
          return p.version == this.ver;
        case VersionRequirementType.Any:
          return true;
        case VersionRequirementType.LessThan:
          return compareVersion(p.version, this.ver) < 0;
      }
    });

    return version_range_matched;
  }

  static chooseLatest(packages: Package[]): Package {
    // Here we need Newer<0, so add `-` before compareVersion()
    const sorted = packages
      .slice()
      .sort((a, b) => -compareVersion(a.version, b.version));

    return sorted[0];
  }
}

enum RequirementRelationship {
  And,
  Or,
}
class PackageRequirements implements Requirement {
  reqs: Requirement[] = [];
  relationship: RequirementRelationship;

  constructor(name: string, verreq: string) {
    if (verreq.includes(" || ")) {
      this.relationship = RequirementRelationship.Or;
      const reqs = verreq.split(" || ");
      this.reqs = reqs.map((req) => new PackageRequirements(name, req));
    } else if (verreq.includes(">=") && verreq.includes("<")) {
      this.relationship = RequirementRelationship.And;
      const [a, b, c, d] = verreq.split(" ");

      const reqa = [a, b].join(" ");
      const reqb = [c, d].join(" ");

      this.reqs.push(new PackageRequirements(name, reqa));
      this.reqs.push(new PackageRequirements(name, reqb));
    } else {
      this.relationship = RequirementRelationship.Or;
      this.reqs = [new PackageRequirement(name, verreq)];
    }
  }

  match(pool: Package[]): Package[] {
    let result: Package[] = [];

    const candidates = this.reqs.map((req) => req.match(pool));
    switch (this.relationship) {
      case RequirementRelationship.And:
        for (const p of candidates[0]) {
          let existEverywhere = true;
          for (const c of candidates.slice(1)) {
            if (!c.includes(p)) {
              existEverywhere = false;
              break;
            }
          }

          if (existEverywhere) {
            result.push(p);
          }
        }
        return result;
      case RequirementRelationship.Or:
        for (const c of candidates) {
          for (const p of c) {
            if (result.includes(p)) {
              continue;
            }

            result.push(p);
          }
        }
        return result;
    }
  }
}

// Newer>0 Equal=0 Older<0
function compareVersion(a: string, b: string): number {
  // Remove tailing `-security` such things
  const av = a.split("-")[0];
  const bv = b.split("-")[0];

  // Split 1.1.0 into [1,1,0]
  const aver = av.split(".").map((s) => Number(s));
  const bver = bv.split(".").map((s) => Number(s));

  if (aver.length != bver.length) {
    console.error(
      `Which son of bitch wrote this package? It has v${a} and v${b}, different number of "."s!`,
    );
    throw "SonOfBitchPackage";
  }

  for (let i = 0; i < aver.length; i++) {
    if (aver[i] > bver[i]) {
      // a is newer than b, it comes first
      return 1;
    } else if (aver[i] == bver[i]) {
      continue;
    } else {
      // aver[i]<bver[i]
      return -1;
    }
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Not being imported, but being run directly
  // Run tests
  const graph = await buildGraph("/home/ken/Projects/element-web");

  console.log("Graph is", graph);
}
