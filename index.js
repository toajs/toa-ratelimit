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

  limit.remove = function (ctx) {
    return ctx.thunk(function (done) {
      var args = getArgs(ctx)
      if (!args) return done()
      limiter.remove(args[0])(done)
    })
  }
  return limit

  function limit (next) {
    var ctx = this
    var args = getArgs(this)
    if (!args) return next()
    limiter.get(args)(function (err, res) {
      if (err) throw err
      // header fields
      ctx.set('x-ratelimit-limit', res.total)
      ctx.set('x-ratelimit-remaining', res.remaining - 1)
      ctx.set('x-ratelimit-reset', Math.ceil(res.reset / 1000))
      if (res.remaining) return

      var after = Math.ceil((res.reset - Date.now()) / 1000)
      ctx.set('retry-after', after)
      ctx.status = 429
      ctx.body = 'Rate limit exceeded, retry in ' + after + ' seconds.'
      ctx.end()
    })(next)
  }

  function getArgs (ctx) {
    var id = getId.call(ctx)
    if (!id) return null

    var method = ctx.method
    var pathname = ctx.path
    var limitKey = method + ' ' + pathname
    if (!policy[limitKey]) {
      limitKey = pathname
      if (!policy[limitKey]) {
        limitKey = method
        if (!policy[limitKey]) return null
      }
    }

    var args = policy[limitKey]
    if (Array.isArray(args)) args = args.slice()
    else args = [args]
    args.unshift(id + limitKey)
    return args
  }
}
