/**
 * Remove unnecessary whitespaces from code.
 *
 * @param {string} code
 * @param {string} format
 * @returns {string}
 */
function removeUnnecessaryWhitespaces (code, format) {
  code = code.replace(/\r?\n([\t\r ]*?\n)+/g, '\n')

  if (format === 'scss' || format === 'css') {
    code = code.replace(/(?:(^|\n)(?:\s+))/g, '$1')
  }

  // if (format === 'scss') {
  //   // It may break strings, i.e. `content: "bla; "` will became `content: "bla"`
  //   code = code.replace(/;\s+/g, ';')
  // }

  return code
}

module.exports = removeUnnecessaryWhitespaces
