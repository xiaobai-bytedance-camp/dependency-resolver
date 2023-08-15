#!/usr/bin/env node
const {program} = require('commander')

program
  .command('hello')
  .description('Test that this puppet works')
  .action(hello)

program.parse()


function hello(){
  console.log("It's working! ")
}

