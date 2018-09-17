const determineFileFormat = require('./determineFileFormat')

/**
 * Class which represents stylesheet file.
 *
 * @property {string} path
 * @property {string} originalFormat
 * @property {number} buildTime  ID of cycle when last time this file has been updated
 * @property {object} content
 * @property {object} content.css
 * @property {null|string} content.css.original  not processed code
 * @property {null|string} content.css.final  processed code
 * @property {object[]|Array<{ filePath: string, index: number, indentation: string }>|null} content.css.imports  list of @import clauses in unprocessed code
 * @property {object} content.scss
 * @property {null|string} content.scss.original  not processed code
 * @property {null|string} content.scss.final  processed code
 * @property {object[]|Array<{ filePath: string, index: number, indentation: string }>|null} content.scss.imports  list of @import clauses in unprocessed code
 * @property {object} content.sass
 * @property {null|string} content.sass.original  not processed code
 * @property {null|string} content.sass.final  processed code
 * @property {object[]|Array<{ filePath: string, index: number, indentation: string }>|null} content.sass.imports  list of @import clauses in unprocessed code
 * @class
 */
class SassMergeFile {
  /**
   * @param {string} filePath
   * @param {string} content  Basic content
   * @param {number} buildTime  ID of current cycle
   * @constructor
   */
  constructor (filePath, content, buildTime) {
    this.path = filePath
    this.originalFormat = determineFileFormat(filePath)
    this.content = {
      css: { original: null, final: null, imports: [] },
      scss: { original: null, final: null, imports: null },
      sass: { original: null, final: null, imports: null }
    }

    if (!this.originalFormat) {
      throw new Error('SassMerge: cannot determine file format of `' + filePath + '` file!')
    }

    this.setUnprocessedContent(this.originalFormat, content, buildTime)
  }

  /**
   * Get unprocessed file content (if exists) in specified format.
   *
   * @param {string} format
   * @returns {string|null}
   */
  getUnprocessedContent (format = this.originalFormat) {
    return this.content[format] ? this.content[format].original : null
  }

  /**
   * Get processed file content (if exists) in specified format.
   *
   * @param {string} format
   * @returns {string|null}
   */
  getFinalContent (format = this.originalFormat) {
    return this.content[format] ? this.content[format].final : null
  }

  /**
   * Set unprocessed file content in specified format.
   *
   * @param {string} format
   * @param {string} content
   * @param {number} buildTime  current cycle ID
   * @returns {string|null}
   */
  setUnprocessedContent (format, content, buildTime) {
    if (buildTime == null) {
      throw new Error('SassMerge: cycle ID is required')
    }

    if (format === 'css') {
      this.content.css.original = content
      this.content.css.final = content
      this.content.scss.original = content
      this.content.scss.final = content
      this.content.scss.imports = []
    } else if (format === 'scss') {
      this.content.scss.original = content
      this.content.scss.final = null
      this.content.scss.imports = null
    } else if (format === 'sass') {
      this.content.sass.original = content
      this.content.sass.final = null
      this.content.sass.imports = null
    }

    this.buildTime = buildTime
  }

  /**
   * Set processed file content in specified format.
   *
   * @param {string} format
   * @param {string} content
   * @param {number} buildTime  current cycle ID
   * @returns {string|null}
   */
  setFinalContent (format, content, buildTime) {
    if (buildTime == null) {
      throw new Error('SassMerge: cycle ID is required')
    }

    if (format === 'css') {
      this.content.css.final = content
      this.content.scss.final = content
    } else if (format === 'scss') {
      this.content.scss.final = content
    } else if (format === 'sass') {
      this.content.sass.final = content
    }

    this.buildTime = buildTime
  }

  /**
   * Check if file has already processed content in specified format.
   *
   * @param {string} [format]  defaults: original one
   * @returns {boolean}
   */
  hasFinalContent (format = this.originalFormat) {
    return this.content[format] && this.content[format].final !== null
  }

  /**
   * Check if file has already unprocessed content in specified format.
   *
   * @param {string} [format]  defaults: original one
   * @returns {boolean}
   */
  hasUnprocessedContent (format = this.originalFormat) {
    return this.content[format] && this.content[format].original !== null
  }

  /**
   * Get all imports from code in specified format.
   *
   * @param {string} [format]  defaults: original one
   * @returns {object[]|Array<{ filePath: string, index: number, indentation: string }>}
   */
  getImports (format = this.originalFormat) {
    // Check if there is such format
    if (!this.content[format]) {
      return []
    }

    // Check if there isn't already built @imports list (either cached or CSS)
    if (this.content[format].imports) {
      return this.content[format].imports
    }

    // Load unprocessed content in specified format
    const content = this.content[format].original

    // Check if it has any content in specified format
    if (content == null) {
      return []
    }

    // Determine regular expression for @import
    const regex = format === 'scss'
      ? /()()@import\s+(?:'((?:\\.|[^'])+)'|"((?:\\.|[^"])+)")()(\s*([;}]|$))/g
      : /((^|\n)[\t\r ]*)@import\s+(?:'((?:\\.|[^'])+)'|"((?:\\.|[^"])+)"|(.+?))(\s*(\n|$))/gm

    // Build list of @imports
    const imports = []

    // Find all occurrences of @import clauses
    let result
    while (result = regex.exec(content)) {
      const rawFilePath = (result[3] || result[4] || result[5]).replace(/\\(.)/g, ($0, character) => character)

      // Ignore external URLs
      if (rawFilePath.startsWith('url(')) {
        continue
      }

      imports.push({
        index: result.index + result[1].length + result[2].length,
        endIndex: result.index + result[0].length,
        indentation: result[1].substr(result[2].length),
        filePath: rawFilePath
      })
    }

    // Cache @import clauses
    this.content[format].imports = imports

    return imports
  }

  /**
   * Check against other files if this file should be rebuilt.
   *
   * @param {string} format
   * @param {object} files  map of files, filePath => SassMergeFile
   * @returns {boolean}
   */
  hasChanges (format, files) {
    const dependencies = this.getImports(format)

    // Has changed, when still there is no final content available
    if (!this.hasFinalContent(format)) {
      return true
    }

    // Iterate over all dependencies
    for (const dependency of dependencies) {
      const file = files[dependency.filePath]

      // Dependency has changed, because it was built in different cycle
      if (file.buildTime > this.buildTime) {
        return true
      }

      // Dependency has changed, because it hasn't ready code
      if (!file.hasFinalContent(format)) {
        return true
      }

      // Deep dependencies have changed
      if (file.hasChanges(format, files)) {
        return true
      }
    }

    return false
  }
}

module.exports = SassMergeFile
