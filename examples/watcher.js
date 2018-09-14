const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const SassMerge = require('../src/SassMerge')

// Configuration

const target = 'scss'
const outputFilePath = path.join(__dirname, 'watch-output.' + target)
const inputFilePath = path.join(__dirname, 'styles', 'index.scss')
const assetsPath = path.join(__dirname)

// Create runner

const merger = new SassMerge(inputFilePath, {
  target: target,
  resolveUrl: filePath => '/public/' + path.relative(assetsPath, filePath).replace(/\.\.[/]?/g, ''),
  optimizeRedundantFunctionsAndMixins: true,
  optimizeRedundantVariables: true
})

const watcher = merger.createWatcher()

watcher.on('run', () => console.log('Building stylesheet...'))
watcher.on('ready', ({ stylesheet, took }) => console.log(chalk.green('Built stylesheet in ' + took + 'ms')))
watcher.on('error', ({ error, took }) => console.log(chalk.red('Build failed after ' + took + 'ms'), error.message))
watcher.on('ready', ({ stylesheet }) => fs.writeFileSync(outputFilePath, stylesheet))

watcher.run()
