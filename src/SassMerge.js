const EventEmitter = require('events')
const path = require('path')
const fs = require('fs')
const findNodeModules = require('find-node-modules')
const defaults = require('lodash/defaults')
const which = require('which')

const SassMergeBuilder = require('./SassMergeBuilder')
const SassMergeWatcher = require('./SassMergeWatcher')

const defaultOptions = {
  binary: which.sync('sass-convert', { nothrow: true }),
  target: 'scss',
  extensions: [ '', '.scss', '.sass', '.css', '/index.scss', '/index.sass', '/index.css' ],
  globalDirectories: null,
  globalPrefixes: [ '', '~' ],
  maxBuffer: 500 * 1024,
  cacheFilePaths: true,
  usePolling: false,
  removeUnnecessaryWhitespaces: true,
  removeComments: true,
  optimizeRedundantVariables: false,
  optimizeRedundantFunctionsAndMixins: false,
  resolveUrl: null,
  publicPath: '',
  encoding: null
}

/**
 * Runner for SassMerge.
 *
 * @property {string} inputFilePath
 * @property {EventEmitter} events
 * @property {object} options
 * @property {string[]} options.extensions
 * @property {string[]} options.globalDirectories
 * @property {string[]} options.globalPrefixes
 * @property {string} options.binary
 * @property {string} options.target
 * @property {number} options.maxBuffer
 * @property {boolean} options.usePolling
 * @property {boolean} options.cacheFilePaths
 * @property {boolean} options.removeComments
 * @property {boolean} options.removeUnnecessaryWhitespaces
 * @property {boolean} options.optimizeRedundantVariables
 * @property {boolean} options.optimizeRedundantFunctionsAndMixins
 * @property {string} options.encoding
 * @property {function|string|object|null} options.resolveUrl  either - function to resolve, path to JSON file with map of URLs, or map itself
 * @property {string} options.publicPath  when resolveUrl is JSON file path, it will add it on beginning of resolved URLs
 *
 * @class
 */
class SassMerge {
  /**
   * @param {string} inputFilePath
   * @param {object} [options]
   * @param {string[]} [options.extensions]
   * @param {string[]} [options.globalDirectories]
   * @param {string[]} [options.globalPrefixes]
   * @param {string} [options.binary]
   * @param {string} [options.target]
   * @param {number} [options.maxBuffer]
   * @param {boolean} [options.usePolling]
   * @param {boolean} [options.cacheFilePaths]
   * @param {boolean} [options.removeComments]
   * @param {boolean} [options.removeUnnecessaryWhitespaces]
   * @param {boolean} [options.optimizeRedundantVariables]
   * @param {boolean} [options.optimizeRedundantFunctionsAndMixins]
   * @param {string} [options.encoding]
   * @param {function|string|object} [options.resolveUrl]  either - function to resolve, path to JSON file with map of URLs, or map itself
   * @param {string} [options.publicPath]  when resolveUrl is JSON file path, it will add it on beginning of resolved URLs
   *
   * @constructor
   */
  constructor (inputFilePath, options) {
    // Validate input path
    if (!inputFilePath || typeof inputFilePath !== 'string') {
      throw new Error('SassMerge: input file path is required!')
    }

    // Resolve input file path
    inputFilePath = path.resolve(inputFilePath)

    // Validate options object
    if (options && typeof options !== 'object') {
      throw new Error('SassMerge: options should be an object!')
    }

    // Load options
    options = defaults(Object.assign({}, options), defaultOptions)

    // Validate options
    if (!options.binary) {
      throw new Error('SassMerge options: can\'t find `sass-convert` binary!')
    }

    if (options.target !== 'sass' && options.target !== 'scss') {
      throw new Error('SassMerge options: `target` can be set to either `sass` or `scss`')
    }

    // TODO: it shouldn't be required, but otherwise imports are not detected correctly.
    if (!options.removeComments) {
      throw new Error('SassMerge options: Sorry, for now we need to remove comments.')
    }

    const extensions = options.extensions
    if (!extensions || !Array.isArray(extensions) || extensions.findIndex(x => typeof x !== 'string') !== -1) {
      throw new Error('SassMerge options: extensions should be an array of strings!')
    }

    const prefixes = options.globalPrefixes
    if (!prefixes || !Array.isArray(prefixes) || prefixes.findIndex(x => typeof x !== 'string') !== -1) {
      throw new Error('SassMerge options: globalPrefixes should be an array of strings!')
    }

    if (!options.globalDirectories) {
      options.globalDirectories = findNodeModules({ cwd: inputFilePath, relative: false })
    }

    const directories = options.globalDirectories
    if (!Array.isArray(directories) || directories.findIndex(x => typeof x !== 'string') !== -1) {
      throw new Error('SassMerge options: globalPrefixes should be an array of strings!')
    }

    // Validate and fix URL resolver
    if (typeof options.resolveUrl === 'string') {
      if (typeof options.publicPath !== 'string') {
        throw new Error('SassMerge options: Using JSON file for resolving URLs, you need to pass publicPath as a string!')
      }

      options.resolveUrl = path.resolve(options.resolveUrl)
    } else if (typeof options.resolveUrl === 'object') {
      if (typeof options.publicPath !== 'string') {
        throw new Error('SassMerge options: Using files map for resolving URLs, you need to pass publicPath as a string!')
      }
    } else if (typeof options.resolveUrl !== 'function') {
      options.resolveUrl = null
      options.publicPath = ''
    }

    // Create copy of array options
    options.extensions = options.extensions.slice()
    options.globalPrefixes = options.globalPrefixes.slice()
    options.globalDirectories = options.globalDirectories.slice().map(dirPath => path.resolve(dirPath))

    // Freeze options
    Object.freeze(options)
    Object.freeze(options.extensions)
    Object.freeze(options.globalPrefixes)
    Object.freeze(options.globalDirectories)

    // Set up basic data
    Object.defineProperties(this, {
      inputFilePath: {
        value: inputFilePath,
        configurable: false
      },
      options: {
        value: options,
        configurable: false
      }
    })

    // Set up cache for file paths
    this.cache = {}
  }

  /**
   * Resolve file path (may be get from cache)
   *
   * @param {string} filePath
   * @param {string} [fromFilePath]
   * @returns {string|null}
   */
  resolveFilePath (filePath, fromFilePath = filePath) {
    const cwd = path.dirname(fromFilePath)
    const id = `${filePath}<${cwd}`

    if (!this.options.cacheFilePaths) {
      return this._resolveFilePath(filePath, cwd)
    }

    if (!this.cache[id]) {
      this.cache[id] = this._resolveFilePath(filePath, cwd)
    }

    return this.cache[id]
  }

  /**
   * @param {string} filePath
   * @param {string} cwd
   *
   * @returns {string|null}
   * @private
   */
  _resolveFilePath (filePath, cwd) {
    // Build possible file names (including their extensions)
    const fileNames = this.options.extensions.map(extension => filePath + extension)

    // Build absolute file paths for these file names
    for (let fileName of fileNames) {
      if (!path.isAbsolute(fileName)) {
        fileName = path.resolve(path.join(cwd, fileName))
      }

      if (fs.existsSync(fileName)) {
        return fileName
      }
    }

    // Try to reach file also in global directories
    for (const prefix of this.options.globalPrefixes) {
      if (!filePath.startsWith(prefix)) {
        continue
      }

      const globalFileNames = fileNames.map(fileName => fileName.substr(prefix.length))

      for (const directory of this.options.globalDirectories) {
        for (const fileName of globalFileNames) {
          const _filePath = path.join(directory, fileName)

          if (fs.existsSync(_filePath)) {
            return _filePath
          }
        }
      }
    }

    return null
  }

  /**
   * Get list of possible file paths for specified file name.
   *
   * @param {string} filePath
   * @param {string} [fromFilePath]
   * @returns {string|null}
   */
  getAvailableFilePaths (filePath, fromFilePath = filePath) {
    const cwd = path.dirname(fromFilePath)

    return this._getAvailableFilePaths(filePath, cwd)
  }

  /**
   * @param {string} filePath
   * @param {string} cwd
   *
   * @returns {string|null}
   * @private
   */
  _getAvailableFilePaths (filePath, cwd) {
    const possibilities = []

    // Build possible file names (including their extensions)
    const fileNames = this.options.extensions.map(extension => filePath + extension)

    // Build absolute file paths for these file names
    for (let fileName of fileNames) {
      if (!path.isAbsolute(fileName)) {
        fileName = path.resolve(path.join(cwd, fileName))
      }

      possibilities.push(fileName)
    }

    // Try to reach file also in global directories
    for (const prefix of this.options.globalPrefixes) {
      if (!filePath.startsWith(prefix)) {
        continue
      }

      const globalFileNames = fileNames.map(fileName => fileName.substr(prefix.length))

      for (const directory of this.options.globalDirectories) {
        for (const fileName of globalFileNames) {
          const _filePath = path.join(directory, fileName)

          possibilities.push(_filePath)
        }
      }
    }

    return possibilities
  }

  /**
   * Run single-time build.
   *
   * @param {object} [cache]
   * @returns {Promise<string>}
   */
  build (cache) {
    return new SassMergeBuilder(this)
      .build(cache || {})
      .then(x => x.stylesheet)
  }

  /**
   * Create watcher for recurrent building.
   */
  createWatcher () {
    return new SassMergeWatcher(this)
  }

  /**
   * Clean cache of file paths.
   */
  clean () {
    this.cache = {}
  }
}

module.exports = SassMerge
