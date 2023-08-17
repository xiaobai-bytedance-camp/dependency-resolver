import * as fs from "fs/promises";
import path from "path";
import { PackageRequirements, chooseLatest } from "./Requirement";

/*
 * Collect packages recursively into @xxx, but don't
 * resolve their dependencies.
 *
 * :param: dir: string The node_modules directory path
 *         For example: ../node_modules
 */
export async function collectPackages(dir: string): Promise<Package[]> {
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
      const p = new Package(raw, name);
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

export class Package {
  name: string;
  version: string; // An exact versoin
  dependencies: Package[];
  raw: any;

  constructor(packageJson: string, name: string | undefined = undefined) {
    const p = JSON.parse(packageJson);
    this.raw = p;

    if (name != undefined) {
      const parts: string[] = (p.name as string).split("/");
      const new_name = parts.slice(0, -1).concat([name]);
      this.name = new_name.join("/");
    } else {
      this.name = p.name;
    }
    this.version = p.version;
    this.dependencies = []; // Resolve later, otherwise might go to dead loop
  }

  resolveDependencies(allPackages: Package[]) {
    // console.log(`Resolving dependencies of ${this.name}`)
    for (const name of Object.keys(this.raw.dependencies ?? {})) {
      const verreqs: string = this.raw.dependencies[name];
      const reqs = new PackageRequirements(name, verreqs);

      const matches = reqs.match(allPackages);
      const dep = chooseLatest(matches);
      if (dep == undefined) {
        console.error(
          `Failed to resolve dependency ${name}@${verreqs} for ${this.id}`,
        );
        continue;
      }
      this.dependencies.push(dep);
    }
  }

  get id(): string {
    return `${this.name}@${this.version}`;
  }
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
