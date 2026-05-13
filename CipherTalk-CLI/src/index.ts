import { createProgram } from './cli.js'

createProgram().parseAsync(process.argv).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
