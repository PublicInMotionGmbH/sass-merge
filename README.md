# SassMerge tool

Node.js library which is responsible for concatenating and optimizing SASS/SCSS/CSS files for further parsing.
It allows output target as either `sass` (indented syntax) or `scss`, but it will resolve and convert both meanwhile.
It will go through all `@import`s and inline them inside single file.

## Requirements

This library depends on `sass-convert` (which is required for conversion between types), so you need to install [Ruby Sass gem](https://rubygems.org/gems/sass).
Also, because it's using some new JavaScript syntax, you should have Node.js 9+ installed.

## Installation

- Install on machine [Ruby](https://www.ruby-lang.org/en/documentation/installation/) with [Sass gem](https://rubygems.org/gems/sass) (`gem install sass`)
- Run `npm install @talixo/sass-merge --save`

## Examples

You can find examples in `examples` directory, for now it is:

* `basic.js` - basic example with some simple benchmarking
* `watcher.js` - example of watcher which also resolves URLs

## CLI

```
Usage: sass-merge --input FILE_PATH --output FILE_PATH [option(s)]

Options:
  --help          Show help                                            [boolean]
  --version       Show version number                                  [boolean]
  --binary, -b    sass-convert executable file
                               [string] [default: "/usr/local/bin/sass-convert"]
  --target, -t    Type of file which will be generated
                                     [choices: "scss", "sass"] [default: "scss"]
  --input, -i     Input file to optimize for use             [string] [required]
  --output, -o    Path where result should be stored         [string] [required]
  --optimize      Unsafe optimizations                [boolean] [default: false]
  --watch, -w     Should watch for file changes?      [boolean] [default: false]
  --polling       Should use polling for watchers?    [boolean] [default: false]
  --colors, -c    Should color watcher output?         [boolean] [default: true]
  --manifest, -m  Manifest file path for url() mapping                  [string]
  --public, -p    Public path of manifest files           [string] [default: ""]
  --encoding      default encoding to use                               [string]
```

## Node.js API reference

### SassMerge

Merging files is as simple as:

```js
const SassMerge = require('sass-merge')

const inputStylesheetPath = "src/styles/main.scss"
const options = {}

const merger = new SassMerge(inputStylesheetPath, options)

merger.build().then(console.log, console.error)
````

#### Available methods

| Name                                             | Example                                       | Description
|--------------------------------------------------|-----------------------------------------------|-----------------------------------
| `build() : Promise<string, Error>`               | `const stylesheet = await merger.build()`     | Build merged stylesheet
| `build(cache: object) : Promise<string, Error>`  | `const cache = {}; await merger.build(cache)` | Build merged stylesheet with cache. `cache` object will be mutated to store data between builds.
| `clean() : void`                                 | `merger.clean()`                              | Clean cache of resolved file paths

#### Options schema

| Name                                  | Default value                  | Description 
|---------------------------------------|--------------------------------|-------------
| `target`                              | `"scss"`                       | target output: `"scss"` or `"sass"`
| `resolveUrl`                          | -                              | resolver for `url(address)` clauses; either: map of files mapping, JSON file path with such map or function which will build it
| `publicPath`                          | -                              | when `resolveUrl` is files mapping or JSON file path, this path will be added as prefix for mapped file path
| `removeUnnecessaryWhitespaces`        | `true`                         | should remove unnecessary whitespaces, so end file will be smaller?
| `optimizeRedundantVariables`          | `false`                        | should remove redundant variables? see *Limitations* section
| `optimizeRedundantFunctionsAndMixins` | `false`                        | should remove redundant functions and mixins? see *Limitations* section
| `cacheFilePaths`                      | `true`                         | should cache resolved file paths or rebuild them each time?
| `resolveUrlsStartingWithSlash`            | `false`                        | should be enabled, when i.e. you have absolute URLs used, and you want to resolve them using `resolveUrl` (example: `background-image: url("/Users/rangoo/Projects/image.png")`)
| `globalDirectories`                   | `node_modules` near input file | directories where should be files searched for as well
| `globalPrefixes`                      | `[ "", "~" ]`                  | prefixes which means that file may be in global directory
| `extensions`                          | `[ "", ".scss", ".sass", ".css", "/index.scss", "/index.sass", "/index.css" ]` | extensions which should be automatically resolved
| `maxBuffer`                           | `500 * 1024`                   | max buffer for child process; you may need to increase it for bigger files
| `binary`                              | global `sass-convert`          | path to `sass-convert` executable file
| `usePolling`                          | `false`                        | should use polling for watchers? (slower, but it's required on some environments)
| `encoding`                            | -                              | default file encoding passed to `sass-convert`

### SassMergeWatcher

Sometimes you may need to watch for file changes to update your code. You can obtain watcher using `createWatcher()` method:

```js
const watcher = merger.createWatcher()

watcher.on('run', () => console.log('Building stylesheet...'))
watcher.on('ready', ({ stylesheet, took }) => console.log('Built stylesheet in ' + took + 'ms'))
watcher.on('error', ({ error, took }) => console.log('Build failed after ' + took + 'ms', error.message))

watcher.run()
````

#### Available events

`SassMergeWatcher` implements [`EventEmitter`](https://nodejs.org/api/events.html#events_class_eventemitter),
so you can use methods like `on(eventName, callback)` or `once(eventName, callback)` to watch for events.

| Event name | Arguments                              | Description
|------------|----------------------------------------|---------------
| `run`      | Cause of running (file system event)   | Build has started
| `ready`    | `{ stylesheet: string, took: number }` | Build has been finished successfully
| `error`    | `{ error: Error, took: number }`       | Build has failed
| `stop`     | -                                      | Watcher has been stopped

#### Available methods

It has `EventEmitter` methods like `on` and `once`. Also:

| Name              | Example           | Description
|-------------------|-------------------|-----------------------------------
| `run() : Promise` | `watcher.run()`   | Start build and watch for files changes
| `stop() : void`   | `watcher.stop()`  | Stop watching for files
| `clean() : void`  | `watcher.clean()` | Clean cache of resolved and converted files

## Limitations

This tool is not parsing SCSS/SASS files, it is working on regular expressions instead to make it faster.
Unfortunately, it may cause some unexpected problems, mostly with nested code.

### Known problems

* `optimizeRedundantVariables` may incorrectly detect redundancy for nested variables with same names
* `optimizeRedundantFunctionsAndMixins` may incorrectly detect redundancy for nested functions/mixins with same names
* CSS files are neither parsed nor validated, so they may contain target code (`sass` or `scss`)

## Changelog

- *0.1.15* - resolve `//host.com/filePath` URLs correctly (without protocol) 
- *0.1.14* - fix problems with resolving absolute paths with `resolveUrlsStartingWithSlash` option
- *0.1.13* - add `resolveUrlsStartingWithSlash` option
- *0.1.12* - fix problems with empty single-line comments (without any character inside)
- *0.1.11* - add possibility to pass default file encoding
- *0.1.10* - fix issues with cache, so files are invalidated correctly
- *0.1.9* - remove unnecessary logging
- *0.1.8* - fix removing redundant variables, to not include code behind
- *0.1.7* - fix resolving paths of advanced URLs (with query strings and hashes)
- *0.1.6* - fix resolving URLs of not existing files (with manifest file)
- *0.1.5* - add possibility to use polling
- *0.1.4* - improve watcher, to watch files in case of error as well
- *0.1.3* - fix multiple imports in SASS syntax
- *0.1.2* - added CLI executable `sass-merge` command
- *0.1.1* - fix nested `@import`s for `target: "sass"`
- *0.1.0* - initial version
