'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

var Limiter = require('thunk-ratelimiter')

module.exports = function ratelimit (opts) {
  if (!opts || typeof opts.getId !== 'function') throw new Error('getId function required')
  if (!opts.policy || opts.policy.constructor !== Object) throw new Error('policy required')

  var getId = opts.getId

  var redis = opts.redis
  if (!redis) redis = []
  else if (!Array.isArray(redis)) redis = [redis]

  var policy = Object.create(null)
  Object.keys(opts.policy).map(function (key) {
    policy[key] = opts.policy[key]
  })

  var limiter = new Limiter({
    prefix: opts.prefix,
    duration: opts.duration
  })

  limiter.connect.apply(limiter, redis)
  ratelimitT.limiter = limiter
  return ratelimitT

  function ratelimitT (next) {
    var ctx = this
    var id = getId.call(this)
    if (!id) return next()

    var method = this.method
    var pathname = this.path
    var limitKey = method + ' ' + pathname
    if (!policy[limitKey]) {
      limitKey = pathname
      if (!policy[limitKey]) {
        limitKey = method
        if (!policy[limitKey]) return next()
      }
    }

    var args = policy[limitKey]
    if (Array.isArray(args)) args = args.slice()
    else args = [args]
    args.unshift(id + limitKey)

    limiter.get(args)(function (err, res) {
      if (err) throw err
      // header fields
      ctx.set('X-RateLimit-Limit', res.total)
      ctx.set('X-RateLimit-Remaining', res.remaining - 1)
      ctx.set('X-RateLimit-Reset', Math.ceil(res.reset / 1000))
      if (res.remaining) return

      var after = Math.ceil((res.reset - Date.now()) / 1000)
      ctx.set('Retry-After', after)
      ctx.status = 429
      ctx.body = 'Rate limit exceeded, retry in ' + after + ' seconds.'
      ctx.end()
    })(next)
  }
}
