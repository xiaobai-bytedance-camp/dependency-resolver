#!/usr/bin/env -S node --loader ts-node/esm --experimental-specifier-resolution=node
import * as fs from 'fs/promises'
import path from 'path'

type adjacencyMatrix={ [key: string]: { [key: string]: boolean} }

export async function buildGraph(dir: string): Promise<adjacencyMatrix> {
  let allPackages=await collectPackages(
    path.join(dir,"node_modules")
  )
    
  const mainRaw=await fs.readFile(
    path.join(dir,"package.json"),
    "utf8"
  )
  const mainPackage=new Package(mainRaw)
  allPackages.push(mainPackage)

  // Resolve dependencies
  for(const p of allPackages){
    p.resolveDependencies(allPackages)
  }

  // Generate the graph (adjacencyMatrix)
  let matrix: adjacencyMatrix={}
  for(const i of allPackages){
    matrix[i.id]={}
    for(const j of allPackages){
      matrix[i.id][j.id]=false
    }
  }

  for(const p of allPackages){
    for(const d of p.dependencies){
      matrix[p.id][d.id]=true
    }
  }
  
  return matrix
}

/*
 * Collect packages recursively into @xxx, but don't 
 * resolve their dependencies. 
 *
 * :param: dir: string The node_modules directory path
 *         For example: ../node_modules
*/
async function collectPackages(dir: string): Promise<Package[]>{
  // Find all packages in current directory
  const dir_contents=await fs.readdir(dir)

  // Discard hidden files
  const package_names=dir_contents.filter(x => !x.startsWith("."))

  // Process them, recursively if needed
  let all_packages: Package[]=[]
  for(const name of package_names){
    if(name.startsWith("@")){
      const inner_packages=await collectPackages(
        path.join(dir,name)
      )
      all_packages=all_packages.concat(inner_packages)
    }else{
      const raw=await fs.readFile(
        path.join(dir,name,"package.json"),
        "utf8"
      )
      const p=new Package(raw)
      all_packages.push(p)
    }
  }

  return all_packages
}


class Package {
  name: string
  version: string  // An exact versoin
  dependencies: Package[]
  raw: any

  constructor(packageJson: string){
    const p=JSON.parse(packageJson)
    this.raw=p
    
    this.name=p.name
    this.version=p.version
    this.dependencies=[]  // Resolve later, otherwise might go to dead loop
  }
  
  resolveDependencies(allPackages: Package[]){
    Object.keys
    for(const name of Object.keys(this.raw.dependencies ?? {})){
      const verreq=this.raw.dependencies[name]
      const p=new PackageRequirement(name,verreq)

      const dep=p.match(allPackages)
      this.dependencies.push(dep)
    }
  }

  get id(): string{
    return `${this.name}@${this.version}`
  }
}

enum VersionRequirementType{
  Exact,
  Tilde, // 1.0.x
  Caret, // 1.x.x
  GreaterOrEqual,
  GitUrl,
}
class PackageRequirement {

  name: string
  type: VersionRequirementType
  ver: string

  constructor(name: string, ver: string){
    this.name=name
    if(ver.startsWith("~")){
      this.type=VersionRequirementType.Tilde
      this.ver=ver.slice(1)
    }else if(ver.startsWith("^")){
      this.type=VersionRequirementType.Caret
      this.ver=ver.slice(1)
    }else if(ver.startsWith(">=")){
      this.type=VersionRequirementType.GreaterOrEqual
      this.ver=ver.slice(2)
    }else if(ver.startsWith("http")||ver.startsWith("git")){
      this.type=VersionRequirementType.GitUrl
      this.ver=ver
    }else{
      this.type=VersionRequirementType.Exact
      this.ver=ver
    }
  }

  match(pool: Package[]): Package{
    // pool: All packages from node_modules
    const name_matches=pool.filter(p => p.name==this.name)
    if(name_matches.length==0){
      console.error(`${this.name} is not in pool`)
      throw "NotInPool"
    }

    const version_range_matched=name_matches.filter(p => {
      const thisv=this.ver.split("-")[0].split(".").map(x => Number(x))
      const pv=p.version.split("-")[0].split(".").map(x => Number(x))
      if(thisv.length!=3||pv.length!=3){
        console.error(`A son of bitch wrote ${p.name} whose version is ${p.version}`)
        throw "SonOfBitchPackage"
      }

      switch(this.type){
        case VersionRequirementType.Exact:
          return p.version==this.ver
        case VersionRequirementType.Tilde: // 1.0.x
          return thisv[0]==pv[0] && thisv[1]==pv[1] && pv[2]>=thisv[2]
        case VersionRequirementType.Caret: // 1.x.x
          return thisv[0]==pv[0] && (
            (pv[1] > thisv[1]) ||
            (pv[1] == thisv[1] && pv[2] >= thisv[2])
          )
        case VersionRequirementType.GreaterOrEqual:
          return compareVersion(p.version,this.ver)>0
        case VersionRequirementType.GitUrl:
          return p.version==this.ver
      }
    })

    // Here we need Newer<0, so add `-` before compareVersion()
    version_range_matched.sort((a,b) => {
      return -compareVersion(a.version,b.version)
    })
    const sorted=version_range_matched

    if(sorted.length==0){
      console.error(`Failed to resolve dependency request for ${this.name}, type ${this.type}, version ${this.ver}`)
      throw "FailedToResolveDependency"
    }
    return sorted[0]
  }
}

// Newer>0 Equal=0 Older<0
function compareVersion(a: string, b: string): number {
  // Remove tailing `-security` such things
  const av=a.split("-")[0]
  const bv=b.split("-")[0]

  // Split 1.1.0 into [1,1,0]
  const aver=av.split(".").map(s => Number(s))
  const bver=bv.split(".").map(s => Number(s))

  if(aver.length!=bver.length){
    console.error(`Which son of bitch wrote this package? It has v${a} and v${b}, different number of "."s!`)
    throw "SonOfBitchPackage"
  }

  for(let i=0;i<aver.length;i++){
    if(aver[i]>bver[i]){
      // a is newer than b, it comes first
      return 1
    }else if(aver[i]==bver[i]){
      continue
    }else{
      // aver[i]<bver[i]
      return -1
    }
  }

  console.error(`A package has repeated instances`)
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`){
  // Not being imported, but being run directly
  // Run tests
  const graph=await buildGraph("..")

  console.log("Graph is",graph)
}