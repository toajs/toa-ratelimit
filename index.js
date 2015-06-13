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
    max: opts.max,
    db: opts.db
  }

  if (opts.id && typeof opts.id !== 'function') throw new Error('id must be function')
  var getId = opts.id || function () { return this.ip }
  var limiter = new Limiter(options)
  ratelimitT.limiter = limiter
  return ratelimitT

  function ratelimitT (next) {
    var id = getId.call(this)
    if (id === false) return next()

    var ctx = this
    limiter.get(id)(function (err, limit) {
      if (err) throw err
      var remaining = limit.remaining > 0 ? limit.remaining - 1 : 0

      // header fields
      ctx.set('X-RateLimit-Limit', limit.total)
      ctx.set('X-RateLimit-Remaining', remaining)
      ctx.set('X-RateLimit-Reset', limit.reset)

      debug('remaining %s/%s %s', id, remaining, limit.total)
      if (limit.remaining) return

      var after = Math.floor((limit.reset - Date.now()) / 1000)
      ctx.set('Retry-After', after)
      ctx.throw(429, 'Rate limit exceeded, retry in ' + after + ' seconds.')
    })(next)
  }
}
