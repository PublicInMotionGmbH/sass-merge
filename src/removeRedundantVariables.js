/**
 * Remove redundant variables from code.
 * FIXME: it is ignoring context of variable, i.e. @mixin variable will be treat as global
 * TODO: it should remove not only '!default' variables
 *
 * @param {string} content
 * @param {string} format
 * @returns {string}
 */
function removeRedundantVariables (content, format) {
  const regex = /(\$[a-z0-9A-Z\-_]+):\s*([^;]+?)\s*!default\s*(?:[;}]|$)/g
  const matches = {}

  return content.replace(regex, ($0, name) => {
    if (matches[name]) {
      return ''
    }

    matches[name] = true
    return $0
  })
}

module.exports = removeRedundantVariables
