'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

const Limiter = require('thunk-ratelimiter')

module.exports = function ratelimit (opts) {
  if (!opts || typeof opts.getId !== 'function') throw new Error('getId function required')
  if (!opts.policy || opts.policy.constructor !== Object) throw new Error('policy required')

  const getId = opts.getId

  let redis = opts.redis
  if (!redis) redis = []
  else if (!Array.isArray(redis)) redis = [redis]

  const policy = Object.create(null)
  for (let key of Object.keys(opts.policy)) {
    policy[key] = opts.policy[key]
  }

  const limiter = new Limiter({
    prefix: opts.prefix,
    duration: opts.duration
  })

  limiter.connect.apply(limiter, redis)

  function limit (next) {
    let args = getArgs(this)
    if (!args) return next()
    let ctx = this
    limiter.get(args)((err, res) => {
      if (err) throw err
      // header fields
      ctx.set('x-ratelimit-limit', res.total)
      ctx.set('x-ratelimit-remaining', res.remaining)
      ctx.set('x-ratelimit-reset', Math.ceil(res.reset / 1000))
      if (res.remaining >= 0) return

      let after = Math.ceil((res.reset - Date.now()) / 1000)
      ctx.status = 429
      ctx.set('retry-after', after)
      ctx.body = `Rate limit exceeded, retry in ${after} seconds.`
      ctx.end()
    })(next)
  }

  limit.remove = function (ctx) {
    return (done) => {
      let args = getArgs(ctx)
      if (!args) return done()
      limiter.remove(args[0])(done)
    }
  }

  function getArgs (ctx) {
    let id = getId.call(ctx)
    if (!id) return null

    let method = ctx.method
    let pathname = ctx.path
    let limitKey = method + ' ' + pathname
    if (!policy[limitKey]) {
      limitKey = pathname
      if (!policy[limitKey]) {
        limitKey = method
        if (!policy[limitKey]) return null
      }
    }

    let args = policy[limitKey]
    if (Array.isArray(args)) args = args.slice()
    else args = [args]
    args.unshift(id + limitKey)
    return args
  }

  return limit
}
