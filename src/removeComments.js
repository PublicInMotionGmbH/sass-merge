/**
 * Remove single-line and multi-line comments from code.
 *
 * @param {string} code
 * @param {string} format
 * @returns {string}
 */
function removeComments (code, format) {
  // Remove single line comments
  const lineCommentsRegex = /(?:(url)\(\s*['"]?(?:[a-z]+:)?)?\/\/[^\n]*/gi
  code = code.replace(lineCommentsRegex, ($0, isURL) => isURL ? $0 : '')

  // Remove multi line comments
  const multiLineCommentsRegex = /\/\*(?:(?!\*\/)[^])*\*\//g
  code = code.replace(multiLineCommentsRegex, '')

  return code
}

module.exports = removeComments
