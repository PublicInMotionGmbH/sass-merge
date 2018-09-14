/**
 * Create regular expression to find @mixins and @functions.
 *
 * @param {string} flags
 * @returns {RegExp}
 */
function createDeclarationRegExp (flags) {
  const maxDepth = 30

  // FIXME: if function is not declared globally it may occasionally break
  let detectFunctionMixinRegex =
    '@(mixin|function)\\s+' + // Prelude
    '([a-zA-Z_-]+)\\s*' + // Mixin/function name
    '(?:\\([^)]+\\))?\\s*' + // Optional arguments
    '\\{(?:\\{[^}]+}|[^}])+\\}'

  for (let i = 1; i <= maxDepth; i++) {
    detectFunctionMixinRegex = detectFunctionMixinRegex.replace('\\{[^}]+}', '(?:\\{(?:\\{[^}]+}|[^}])+\\})')
  }

  return new RegExp(detectFunctionMixinRegex, flags)
}

/**
 * Remove duplicated functions and mixins.
 * TODO: handle it also in SASS.
 *
 * @param {string} content
 * @param {string} format
 * @returns {string}
 */
function removeRedundantFunctionsAndMixins (content, format) {
  if (format === 'scss') {
    const regex = createDeclarationRegExp('ig')

    const functions = {}
    const mixins = {}

    return content.replace(regex, (code, prelude, name) => {
      const container = prelude === 'mixin' ? mixins : functions

      if (container[name] === code) {
        // Remove duplicate
        return ''
      }

      container[name] = code
      return code
    })
  }

  return content
}

module.exports = removeRedundantFunctionsAndMixins
