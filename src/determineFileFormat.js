/**
 * Determine stylesheet format by file path.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function determineFileFormat (filePath) {
  const match = filePath.match(/\.(css|sass|scss)/i)

  return match ? match[1] : null
}

module.exports = determineFileFormat
