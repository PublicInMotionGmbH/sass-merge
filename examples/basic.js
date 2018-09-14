const fs = require('fs')
const path = require('path')
const SassMerge = require('../src/SassMerge')

// Configuration

const target = 'scss'
const outputFilePath = path.join(__dirname, 'output.' + target)
const inputFilePath = path.join(__dirname, 'styles', 'index.scss')
const updateFilePath = inputFilePath
const exampleUpdate = 'bla { x: 10%; }'

// Benchmark utils

function benchmark (name, func) {
  return (...args) => {
    const now = Date.now()
    const result = func(...args)

    if (result && result.then) {
      return result.then(x => {
        console.log(name, 'took ' + (Date.now() - now) + 'ms')
        return x
      })
    }

    console.log(name, 'took ' + (Date.now() - now) + 'ms')
    return result
  }
}

// Create runner

const merger = new SassMerge(inputFilePath, {
  target: target,
  optimizeRedundantFunctionsAndMixins: true,
  optimizeRedundantVariables: true
})

const cache = {}

Promise.resolve()
  // Single build
  .then(benchmark('Single build', () => merger.build()))

  // Build with cache
  .then(benchmark('Initial build', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))

  .then(() => fs.writeFileSync(updateFilePath, exampleUpdate + fs.readFileSync(updateFilePath, 'utf8')))
  .then(benchmark('Build with cache (changed)', () => merger.build(cache)))

  .then(() => fs.writeFileSync(updateFilePath, fs.readFileSync(updateFilePath, 'utf8').substr(exampleUpdate.length)))
  .then(benchmark('Build with cache (changed back)', () => merger.build(cache)))

  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))
  .then(benchmark('Build with cache', () => merger.build(cache)))

  .then(output => fs.writeFileSync(outputFilePath, output))
  .catch(console.error)
