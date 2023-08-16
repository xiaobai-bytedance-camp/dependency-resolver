#!/usr/bin/env -S node --loader ts-node/esm --experimental-specifier-resolution=node
import { Command } from 'commander'

const program = new Command()

program
  .command('hello')
  .description('Test that this puppet works')
  .action(hello)

program.parse()


function hello(){
  console.log("It's working! ")
}

