const EventEmitter = require('events')
const chokidar = require('chokidar')
const microtime = require('microtime')

const SassMergeBuilder = require('./SassMergeBuilder')

/**
 * Helper to watch for stylesheet files changes, which will cause rebuilding new merged file.
 *
 * @property {object} cache
 * @property {object} watcher
 * @property {SassMergeBuilder} builder
 * @property {boolean} isWatchingOnManifestFile
 *
 * @class
 */
class SassMergeWatcher extends EventEmitter {
  /**
   * @param {SassMerge} sassMerger
   * @constructor
   */
  constructor (sassMerger) {
    super()

    // Initialize cache
    this.cache = {}

    // Initialize watcher
    const watcher = chokidar.watch([], {
      usePolling: !!sassMerger.options.usePolling,
      ignoreInitial: true
    })

    watcher.on('all', (...args) => this.run(...args))
    this.isWatchingOnManifestFile = false

    // Set up options
    Object.defineProperties(this, {
      builder: {
        value: new SassMergeBuilder(sassMerger),
        configurable: false
      },
      watcher: {
        value: watcher,
        configurable: false
      }
    })
  }

  /**
   * Update list of watched files.
   *
   * @param {string[]} filePaths
   */
  watchFiles (filePaths) {
    // Get list of previously watched files and update with new files
    const watched = this.previouslyWatched || []
    this.previouslyWatched = filePaths

    // Find files to remove and add watcher
    const toRemove = watched.filter(x => filePaths.indexOf(x) === -1)
    const toAdd = filePaths.filter(x => watched.indexOf(x) === -1)

    // Remove no longer required watchers
    if (toRemove.length > 0) {
      this.watcher.unwatch(toRemove)
    }

    // Add watchers for new files
    if (toAdd.length > 0) {
      this.addWatcherSilently(toAdd)
    }
  }

  addWatcherSilently (...args) {
    this.watcher.add(...args)
  }

  /**
   * Try to watch for manifest file with files mapping.
   */
  watchForManifestFile () {
    if (this.isWatchingOnManifestFile) {
      return
    }

    const manifestFilePath = this.builder.runner.options.resolveUrl

    if (typeof manifestFilePath !== 'string') {
      return
    }

    this.addWatcherSilently(manifestFilePath)
    this.isWatchingOnManifestFile = true
  }

  /**
   * Run build and emit connected events.
   * TODO: stop already spawned processes on run
   *
   * @returns {Promise}
   */
  async run (...args) {
    this.emit('run', ...args)
    const startTime = microtime.now()

    try {
      this.watchForManifestFile()

      const result = await this.builder._build(this.cache)
      const filePaths = Object.keys(result.files)

      this.watchFiles(filePaths)

      this.emit('ready', {
        stylesheet: result.stylesheet,
        took: (microtime.now() - startTime) / 1000
      })
    } catch (error) {
      const watchedFiles = [].concat(this.previouslyWatched || [])

      if (error && error.availablePaths) {
        watchedFiles.push(...error.availablePaths)
      }

      if (error && error.files) {
        watchedFiles.push(...error.files)
      }

      if (watchedFiles.length) {
        this.watchFiles(watchedFiles)
      }

      this.emit('error', {
        error: error,
        took: (microtime.now() - startTime) / 1000
      })
    }
  }

  /**
   * Stop watching files.
   */
  stop () {
    this.watcher.close()
    this.isWatchingOnManifestFile = false
    this.emit('stop')
  }

  /**
   * Clean cache of files.
   */
  clean () {
    this.cache = {}
  }
}

module.exports = SassMergeWatcher
