#!/usr/bin/env node
// To Adjacency Matrix (From Package.json)

// TODO: Handle versions with `>=` (currently only ^)

import fetch from 'node-fetch'

// matrix[a][b]==true means: a depends on b
type adjacencyMatrix={ [key: string]: { [key: string]: boolean} }

class Package{
  name: string
  version: string // with the ^

  constructor(name: string, version: string) {
    this.name=name
    this.version=version
  }

  get id(): string {
    return `${this.name}@${this.version}`
  }
}

// Read the package.json and output an adjacency matrix
export function buildDependencyGraphFromPackageJson(src: string): adjacencyMatrix{
  const p=JSON.parse(src)
  const dp=p["dependencies"];
  const packages=Object.keys(dp).map(key => {
    return new Package(
      key,
      dp[key],
    )
  })

  const graph=generateDependecyGraph(packages)

  return graph
}

function generateDependecyGraph(packages: Package[]): adjacencyMatrix {
  let resolver=new DependencyResolver(packages)
  return resolver.graph
}

interface DistInfo{
  nextVersion: string,
  latestVersion: string,
}

interface VersionInfo{
  name: string,
  dependencies?: { [key: string]: string },
  version: string,
}

interface PackageDetail{
  name: string,
  dist: DistInfo,
  versions: { [key: string]: VersionInfo},
  
}

class DependencyResolver {
  allPackages: Package[] = []
  graph: adjacencyMatrix = {}
  packages: Package[]

  constructor(packages: Package[]){
    this.packages=packages
  }

  async resolve(){
    for(const i of this.packages){
      this.resolvePackage(i)
    }
  }

  async resolvePackage(p: Package) {
    const dep=await DependencyResolver.getDirectDependencies(p)

    for(const i of dep){
      // This thing is already considered
      // Its dependencies are already considered or being considered, don't loop back
      if(this.allPackages.includes(i)) { continue } 

      this.allPackages.push(i)

      if(!this.graph.hasOwnProperty(p.id)){
        // This key doens't exist, create an empty dict here
        this.graph[p.id]={}
      }
      this.graph[p.id][i.id]=true;

      // Recursively get them all!
      this.resolvePackage(i)
    }
  }
  
  static async getDirectDependencies(p: Package): Promise<Package[]> {
    const details=await DependencyResolver.getPackageDetails(p.name)
    const versions=details.versions
    const version_string=p.version.slice(1)
    const versionInfo: VersionInfo = versions[version_string]
  
    const dependencies=versionInfo.dependencies ?? {}
  
    const deps=Object.keys(dependencies).map(key => {
      const fver=dependencies[key]
      if(fver.startsWith('>=')){
        console.error("Versions with >= are not currently supported")
        throw new Error("Versions with >= are not currently supported");
      }
      const ver=fver.slice(1) // Remove the starting `^`

      const rp = new Package(key,ver)
      return rp
    })

    return deps
  }
  
  static async getPackageDetails(name: string): Promise<PackageDetail> {
    const prefix="https://repo.nju.edu.cn/repository/npm/"
    const url=prefix+name

    const info=await fetch(url)
    const data=await info.json() as PackageDetail

    return data
  }
}


// Test
if (require.main === module){
  // Not being imported, but being run directly

  const example_package_json=`
{
  "name": "dependency-resolver",
  "version": "1.0.0",
  "description": "Resolve packages in package.json and draw a graph of them",
  "main": "index.js",
  "scripts": {
    "build": "npx tsc",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "2023字节跳动青训营-小白队",
  "license": "MIT",
  "dependencies": {
    "commander": "^11.0.0",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "@types/node": "^20.5.0",
    "typescript": "^5.1.6"
  }
}
  `.trim()
  const graph=buildDependencyGraphFromPackageJson(example_package_json)

}

