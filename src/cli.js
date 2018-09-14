const yargs = require('yargs')
const which = require('which')
const fs = require('fs')
const chalk = require('chalk')

const SassMerge = require('./SassMerge')

// Set up command line

const argv = yargs
  .usage(`Usage: $0 --input FILE_PATH --output FILE_PATH [option(s)]`)
  .default({
    target: 'scss',
    binary: which.sync('sass-convert', { nothrow: true }),
    optimize: false,
    watch: false,
    colors: !process.env.CI,
    public: ''
  })
  .alias('watch', 'w')
  .alias('binary', 'b')
  .alias('input', 'i')
  .alias('output', 'o')
  .alias('target', 't')
  .alias('manifest', 'm')
  .alias('public', 'p')
  .alias('colors', 'c')
  .describe('binary', 'sass-convert executable file')
  .string('binary')
  .describe('target', 'Type of file which will be generated')
  .choices('target', [ 'scss', 'sass' ])
  .describe('input', 'Input file to optimize for use')
  .string('input')
  .describe('output', 'Path where result should be stored')
  .string('output')
  .describe('optimize', 'Unsafe optimizations')
  .boolean('optimize')
  .describe('watch', 'Should watch for file changes?')
  .boolean('watch')
  .describe('colors', 'Should color watcher output?')
  .boolean('colors')
  .describe('manifest', 'Manifest file path for url() mapping')
  .string('manifest')
  .describe('public', 'Public path of manifest files')
  .string('public')
  .demandOption([ 'input', 'output' ])
  .argv

const merger = new SassMerge(argv.input, {
  binary: argv.binary,
  target: argv.target,
  optimizeRedundantFunctionsAndMixins: argv.optimize,
  optimizeRedundantVariables: argv.optimize,
  resolveUrl: argv.resolveUrl || null,
  public: argv.public
})

if (argv.watch) {
  const messages = {
    building: 'Building stylesheet...',
    success: 'Built stylesheet in {took}ms',
    error: 'Built failed after {took}ms'
  }

  if (argv.colors) {
    messages.success = chalk.green(messages.success)
    messages.error = chalk.red(messages.error)
  }

  const watcher = merger.createWatcher()

  watcher.on('run', () => console.log(messages.building))
  watcher.on('ready', ({ stylesheet, took }) => console.log(messages.success.replace('{took}', took)))
  watcher.on('error', ({ error, took }) => console.log(messages.error.replace('{took}', took), error.message))
  watcher.on('ready', ({ stylesheet }) => fs.writeFileSync(argv.output, stylesheet))

  watcher.run()
} else {
  function saveFile (stylesheet) {
    fs.writeFileSync(argv.output, stylesheet)
  }

  function fail (error) {
    console.error(error)
    process.exit(1)
  }

  merger.build().then(saveFile, fail)
}
