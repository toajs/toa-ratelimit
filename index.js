'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

var Limiter = require('thunk-ratelimiter')
var debug = require('debug')('ratelimit')

module.exports = function ratelimit (opts) {
  var options = {
    duration: opts.duration,
    prefix: opts.prefix,
    max: opts.max
  }

  if (opts.id && typeof opts.id !== 'function') throw new Error('id must be function')
  var getId = opts.id || function () { return this.ip }
  var limiter = new Limiter(options)
  limiter.connect(opts.db)
  ratelimitT.limiter = limiter
  ratelimitT.limit = limit
  return ratelimitT

  function ratelimitT (next) {
    var id = getId.call(this)
    if (id === false) return next()
    limit(id).call(this, next)
  }

  function limit (id, max, duration) {
    return function (callback) {
      var ctx = this
      limiter.get(id, max, duration)(function (err, res) {
        if (err) throw err
        var remaining = res.remaining > 0 ? res.remaining - 1 : 0

        // header fields
        ctx.set('X-RateLimit-Limit', res.total)
        ctx.set('X-RateLimit-Remaining', remaining)
        ctx.set('X-RateLimit-Reset', res.reset)

        debug('remaining %s/%s %s', id, remaining, res.total)
        if (res.remaining) return

        var after = Math.floor((res.reset - Date.now()) / 1000)
        ctx.set('Retry-After', after)
        ctx.status = 429
        ctx.body = 'Rate limit exceeded, retry in ' + after + ' seconds.'
        ctx.end()
      })(callback)
    }
  }
}
