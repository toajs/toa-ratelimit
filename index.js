'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

const Limiter = require('thunk-ratelimiter')
const slice = Array.prototype.slice

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

  function middleware () {
    let args = getArgs(this)
    if (!args) return Promise.resolve()
    return limiter.get(args).then((res) => {
      // header fields
      this.set('x-ratelimit-limit', res.total)
      this.set('x-ratelimit-remaining', res.remaining)
      this.set('x-ratelimit-reset', Math.ceil(res.reset / 1000))
      if (res.remaining >= 0) return

      let after = Math.ceil((res.reset - Date.now()) / 1000)
      this.status = 429
      this.set('retry-after', after)
      this.body = `Rate limit exceeded, retry in ${after} seconds.`
      this.end()
    })
  }

  middleware.get = function (id, max, duration) {
    return limiter.get(slice.call(arguments))
  }

  middleware.remove = function (ctx) {
    let args = getArgs(ctx)
    return args ? limiter.remove(args[0]) : Promise.resolve()
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

  return middleware
}
