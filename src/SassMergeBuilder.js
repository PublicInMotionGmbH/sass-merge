const fs = require('fs')
const execFile = require('child_process').execFile
const stream = require('stream')
const path = require('path')
const uuid = require('uuid/v4')

const SassMergeFile = require('./SassMergeFile')
const determineFileFormat = require('./determineFileFormat')
const removeUnnecessaryWhitespaces = require('./removeUnnecessaryWhitespaces')
const removeComments = require('./removeComments')
const removeRedundantVariables = require('./removeRedundantVariables')
const removeRedundantFunctionsAndMixins = require('./removeRedundantFunctionsAndMixins')

/**
 * Builder for SassMerge.
 * FIXME: CSS files can contain SCSS code now - it will not cause CSS syntax error.
 *
 * @property {SassMerge} runner
 * @property {boolean} progress
 * @property {object} cache
 *
 * @class
 */
class SassMergeBuilder {
  /**
   * @param {SassMerge} sassMerger
   *
   * @constructor
   */
  constructor (sassMerger) {
    if (!sassMerger || typeof sassMerger !== 'object') {
      throw new Error('SassMergeBuilder needs to have SassMerge passed as the argument!')
    }

    this.urls = {}
    this.progress = false

    Object.defineProperty(this, 'runner', {
      value: sassMerger,
      configurable: false
    })
  }

  /**
   * Read file from disk.
   *
   * @param {string} filePath
   * @returns {string}
   */
  readFile (filePath) {
    // Determine file format for later use
    const format = determineFileFormat(filePath)

    // Get file contents from disk
    let result = fs.readFileSync(filePath, 'utf8')

    // Resolve url() clauses
    if (this.runner.options.resolveUrl != null) {
      result = this.resolveUrls(filePath, result, format)
    }

    // Resolve imports inside of file (with absolute paths)
    result = this.resolveImports(filePath, result, format)

    // Optimize basic stuff
    return this.initiallyOptimize(result, format)
  }

  /**
   * Resolve imports file paths inside code.
   *
   * @param {string} filePath
   * @param {string} content
   * @param {string} format
   * @returns {string}
   */
  resolveImports (filePath, content, format) {
    const regex = format === 'scss'
      ? /(@import\s+)(?:'((?:\\.|[^'])+)'|"((?:\\.|[^"])+)")()(\s*(;|$))/g
      : /(@import\s+)(?:'((?:\\.|[^'])+)'|"((?:\\.|[^"])+)"|(.+?))(\s*(\n|$))/g

    return content.replace(regex, ($0, before, singleQuote, doubleQuote, literal, spacing) => {
      const rawFilePath = (singleQuote || doubleQuote || literal).replace(/\\(.)/g, ($0, character) => character)

      // Ignore external URLs
      if (rawFilePath.startsWith('url(')) {
        return $0
      }

      const _filePath = this.runner.resolveFilePath(rawFilePath, filePath)

      if (!_filePath) {
        throw new Error(`SassMerge: cannot resolve "${rawFilePath}" in "${filePath}"!`)
      }

      return `${before}"${_filePath.replace(/"/g, '\\"')}"${spacing}`
    })
  }

  /**
   * Optimize basic stuff in code.
   *
   * @param {string} content
   * @param {string} format
   * @returns {string}
   */
  initiallyOptimize (content, format) {
    if (this.runner.options.removeComments) {
      content = removeComments(content, format)
    }

    if (this.runner.options.removeUnnecessaryWhitespaces) {
      content = removeUnnecessaryWhitespaces(content, format)
    }
    
    return content
  }

  /**
   * Load file, either from cache or from disk.
   *
   * @param {string} filePath
   * @param {string} cycleId  last update cycleId
   * @param {object} [cache]
   * @returns {Promise<SassMergeFile>}
   */
  getFile (filePath, cycleId, cache) {
    cache = cache || {}

    const content = this.readFile(filePath)

    if (!cache[filePath] || cache[filePath].getUnprocessedContent() !== content) {
      cache[filePath] = new SassMergeFile(filePath, content, cycleId)
    }

    return cache[filePath]
  }

  /**
   * Load all files which are in @import chain to memory.
   *
   * @param {string} cycleId  cycle id
   * @param {object} [cache]  cache container
   * @returns {Promise<{input: SassMergeFile, files: object}>}
   */
  async loadAllFiles (cycleId, cache) {
    cache = cache || {}

    const inputFilePath = this.runner.resolveFilePath(this.runner.inputFilePath)

    // Initialize required variables
    const files = {}
    const requirements = {}
    const initiated = { [inputFilePath]: true }
    const queuedFilePaths = [ inputFilePath ]

    // Load contents of all files
    while (queuedFilePaths.length) {
      const file = this.getFile(queuedFilePaths.shift(), cycleId, cache)

      const localImports = file.getImports()

      files[file.path] = file
      requirements[file.path] = localImports

      for (let i = 0; i < localImports.length; i++) {
        const importedFilePath = localImports[i].filePath

        if (initiated[importedFilePath]) {
          continue
        }

        if (!initiated[importedFilePath]) {
          initiated[importedFilePath] = []
        }

        initiated[importedFilePath].push(file.path)
        queuedFilePaths.push(importedFilePath)
      }
    }

    return {
      input: files[inputFilePath],
      files: files
    }
  }

  /**
   * Prepare all files from object to have desired format.
   *
   * @param {object} files
   * @param {string} format
   * @param {string} cycleId
   * @returns {Promise<string[]>}  File paths of files which were converted
   */
  async prepareFilesToFormat (files, format, cycleId) {
    const requiredFiles = []
    const convertable = []

    // Detect files which should be converted to desired format
    for (const filePath of Object.keys(files)) {
      const file = files[filePath]

      // This file has been already converted to desired format
      if (file.hasUnprocessedContent(format)) {
        continue
      }

      // Queue file for conversion
      requiredFiles.push(file)
      convertable.push(file.path)
    }

    // Do not call 'sass-convert' if there is no files to convert
    if (!convertable.length) {
      return convertable
    }

    // Generate unique ID to create multi-part SASS/SCSS file to convert
    const header = uuid()

    // Build regular expression to detect such header
    const regex = new RegExp(`(?:^|\n)\\/\\/ ${header}_BEGIN<([^>]+)>\n([^]+?)\n\\/\\/ ${header}_END\n`, 'g')

    // It is much faster to bundle all files and call 'sass-convert' single time, than passing each file separately
    let bundledContent = requiredFiles
      .map(file => `\n// ${header}_BEGIN<${file.path}>\n${file.getUnprocessedContent()}\n// ${header}_END\n`)
      .join('')

    // It will work, because:
    // In case of 'scss' target, only 'sass' files needs to be converted
    // In case of 'sass' target, 'css' files can be converted as 'scss' files
    const result = await this.convertFile(
      bundledContent,
      format === 'scss' ? 'sass' : 'scss',
      format
    )

    // Retrieve all parts from result file and update data
    let r
    while ((r = regex.exec(result))) {
      const file = files[r[1]]
      file.setUnprocessedContent(format, r[2], cycleId)
    }

    return convertable
  }

  /**
   * Build final file contents and return it.
   * FIXME: indent @imports correctly, otherwise it will break for 'sass' target for imports nested in blocks
   *
   * @param {string} format
   * @param {SassMergeFile} inputFile
   * @param {object} files
   * @param {string} cycleId
   * @param {string[]} [importPath]
   * @returns {string}
   */
  buildFinalFile (format, inputFile, files, cycleId, importPath = []) {
    // Detect circular dependency
    if (importPath.indexOf(inputFile.path) !== -1) {
      throw new Error('SassMerge: circular dependency detected:\n⇢ ' + importPath.concat(inputFile.path).reverse().join('\n⇡ '))
    }

    // Retrieve information about input file @import clauses
    const imports = inputFile.getImports(format)

    // Check if this file has been already built
    if (inputFile.hasFinalContent(format)) {
      const dependencies = imports.map(dependency => files[dependency.filePath])

      // Check if all dependencies has been built in same cycle or has changed
      if (dependencies.findIndex(x => x.cycleId === inputFile.cycleId) === -1) {
        return inputFile.getFinalContent(format)
      }
    }

    // Retrieve original content to include imported files inside
    let content = inputFile.getUnprocessedContent(format)

    // Go from end, so indexes will be always correct
    for (let i = imports.length - 1; i >= 0; i--) {
      const partial = imports[i]
      const partialFile = files[partial.filePath]

      // Check if partial file exists (it shouldn't happen)
      if (!partialFile) {
        throw new Error('SassMerge: can\'t find file "' + partial.filePath + '" from "' + inputFile.path + '"')
      }

      // Build partial code
      const partialContent = this.buildFinalFile(format, partialFile, files, cycleId, importPath.concat(inputFile.path))

      // Replace @import clause with partial code
      content = content.substr(0, partial.index) + partialContent + content.substr(partial.endIndex)
    }

    // Optimize output

    if (this.runner.options.removeUnnecessaryWhitespaces) {
      content = removeUnnecessaryWhitespaces(content, format)
    }

    if (this.runner.options.optimizeRedundantFunctionsAndMixins) {
      content = removeRedundantFunctionsAndMixins(content, format)
    }

    if (this.runner.options.optimizeRedundantVariables) {
      content = removeRedundantVariables(content, format)
    }

    if (this.runner.options.removeUnnecessaryWhitespaces) {
      content = removeUnnecessaryWhitespaces(content, format)
    }

    // Set final content for later use (cache)
    inputFile.setFinalContent(format, content, cycleId)

    return content
  }

  /**
   * Resolve URLs in file.
   *
   * @param {string} filePath
   * @param {string} content
   * @param {string} format
   */
  resolveUrls (filePath, content, format) {
    const regex = /url\((?:'((?:[^'\n]|\\.)+)'|"((?:[^\n"]|\\.)+)"|((?:[^)\r\n\t ]|\\.)+))\)/g
    const external = /^(?:(?:http|ftp)s?:)?\/\//

    return content.replace(regex, ($0, quote, doubleQuote, literal) => {
      const url = (quote || doubleQuote || literal).replace(/\\(.)/g, ($0, $1) => $1)

      // Ignore URLs which starts with "/" as they will match exactly in domain
      if (url.startsWith('/')) {
        return $0
      }

      // Ignore absolute external URLs
      if (external.test(url)) {
        return $0
      }

      const absolutePath = this.runner.resolveFilePath(url) || path.resolve(path.join(path.dirname(filePath), url))

      return 'url("' + this.resolveUrl(absolutePath, filePath, url).replace(/"/g, '\\"') + '")'
    })
  }

  /**
   * Resolve url(local-address) from stylesheets.
   *
   * @param {string} filePath  absolute file path calculated from local address
   * @param {string} initiatorFilePath  absolute file path of parent stylesheet
   * @param {string} relativePath  relative file path from parent stylesheet
   * @return {string}
   */
  resolveUrl (filePath, initiatorFilePath, relativePath) {
    const resolveUrl = this.runner.options.resolveUrl
    const publicPath = this.runner.options.publicPath

    // Ignore when there is no URL resolver
    if (resolveUrl == null) {
      return filePath
    }

    // Resolve by manifest file
    if (typeof resolveUrl === 'string') {
      return this.urls[filePath] ? publicPath + this.urls[filePath] : publicPath
    }

    // Resolve by function
    if (typeof resolveUrl === 'function') {
      return resolveUrl(filePath, initiatorFilePath, relativePath)
    }

    // Resolve by files mapping
    if (typeof resolveUrl === 'object') {
      return resolveUrl[filePath] ? publicPath + resolveUrl[filePath] : publicPath
    }

    return filePath
  }

  /**
   * Load manifest file with file mapping
   */
  loadFilesMapping () {
    if (typeof this.runner.options.resolveUrl !== 'string') {
      return
    }

    const file = fs.readFileSync(this.runner.options.resolveUrl, 'utf8')
    this.urls = JSON.parse(file)
  }

  /**
   * @private
   * @returns {Promise<{ stylesheet: string, files: object }>}
   */
  async _build (cache) {
    // Initialize cache
    cache = cache || {}

    // Update manifest file
    try {
      this.loadFilesMapping()
    } catch (error) {
      throw new Error('SassMerge: manifest file with files mapping is broken!')
    }

    // Get information about target language
    const target = this.runner.options.target

    // Build cycle ID to detect changes in cached files
    const cycleId = uuid()

    // Load files and information about input one
    const { input, files } = await this.loadAllFiles(cycleId, cache)

    // Convert all files to desired format
    await this.prepareFilesToFormat(files, target, cycleId)

    // Build ready to use stylesheet
    return {
      stylesheet: this.buildFinalFile(target, input, files, cycleId),
      files: files
    }
  }

  /**
   * Start building
   * @returns {Promise<{ stylesheet: string, files: object }>}
   */
  async build (cache) {
    // Allow only single build from one builder at a time,
    // to make sure that there will nothing break between.
    if (this.progress) {
      throw new Error('SassMerge: only single build can be running!')
    }

    // Mark Builder as 'in progress'
    this.progress = true

    try {
      // Build
      const result = await this._build(cache)

      // Mark Builder as 'finished'
      this.progress = false

      return result
    } catch (error) {
      // Mark Builder as 'finished'
      this.progress = false

      // Stop all processes which are no longer required
      // TODO: this.stop()?

      // Rethrow error
      throw error
    }
  }

  /**
   * Convert stylesheet from current to desired format.
   *
   * @param {string} content
   * @param {string} fromFormat
   * @param {string} toFormat
   * @returns {Promise<string>}
   */
  convertFile (content, fromFormat, toFormat) {
    // TODO: add `stop` method which will stop all procedures and kill spawned processes
    return new Promise((resolve, reject) => {
      const args = [ '--from', fromFormat, '--to', toFormat, '--stdin' ]
      const options = { maxBuffer: this.runner.options.maxBuffer }

      const child = execFile(this.runner.options.binary, args, options, (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      })

      const rs = new stream.Readable()
      rs.push(content)
      rs.push(null)
      rs.pipe(child.stdin)
    })
  }

  /**
   * TODO: Stop any on-going procedure.
   */
  stop () {

  }
}

module.exports = SassMergeBuilder
