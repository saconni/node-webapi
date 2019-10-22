let fs = require('fs')
let path = require('path')
let { validate } = require('@saconni/validate')
let debug = require('debug')('node-webapi')

module.exports.webapi = function (app, options) {
  debug(`initializing webapi:`)
  debug(options)
  fs.readdirSync(options.location).forEach(file => {
    debug(`found file ${file}`)
    if(file.endsWith('.js')) {
      debug(`importing ${file}`)
      let lib = require(path.join(options.location, file))
      Object.keys(lib).forEach(id => {
        debug(`found api controller ${id}:`)
        debug(lib[id])
        let deps = lib[id].dependencies || []
        deps = deps.map(d => {
          if(!options.dependencies || !options.dependencies[d]) {
            throw new Error(`dependency ${d} is required to invoke ${file}:${id}`)
          }
          if(typeof options.dependencies[d] === 'function') {
            return options.dependencies[d]()
          }
          else {
            return options.dependencies[d]
          }
        })
        let middleware = lib[id].handler.apply(null, deps)
        app[lib[id].method](options.base + lib[id].path, (req, res, next) => {
          if(lib[id].request) {
            err = validate(req, { schema: lib[id].request })
            if(err) {
              res.status(400).json(err)
              return
            }
          }
          let r = middleware(req, res, next)
          if(r && typeof r.catch === 'function') {
            r.catch(err => next(err))
          }
        })
      })
    }
  })
}