'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

/*global describe, it, before, beforeEach*/

var toa = require('toa')
var assert = require('assert')
var request = require('supertest')
var redis = require('thunk-redis')
var thunk = require('thunks')()

var ratelimit = require('..')

var db = redis.createClient()

describe('toa-ratelimit', function () {
  var rateLimitDuration = 1000
  var goodBody = 'Hit: '

  before(function (done) {
    db.keys('LIMIT:*')(function (err, keys) {
      if (err) throw err
      return thunk.all(keys.map(function (key) {
        return db.del(key)
      }))
    })(done)
  })

  describe('limit', function () {
    var guard = null
    var server = null

    function routeHitOnlyOnce () {
      assert.strictEqual(guard, 1)
    }

    beforeEach(function (done) {
      var app = toa(function () {
        guard++
        this.body = goodBody + guard
      })

      app.use(ratelimit({
        duration: rateLimitDuration,
        db: db,
        max: 1
      }))

      guard = 0
      server = app.listen()
      thunk.delay(rateLimitDuration)(function () {
        request(server)
        .get('/')
        .expect(200, goodBody + '1')
        .expect(routeHitOnlyOnce)
        .end(done)
      })
    })

    it('responds with 429 when rate limit is exceeded', function (done) {
      request(server)
        .get('/')
        // .expect('X-RateLimit-Remaining', '0')
        .expect(429)
        .end(done)
    })

    it('should not yield downstream if ratelimit is exceeded', function (done) {
      request(server)
        .get('/')
        .expect(429)
        .end(function () {
          routeHitOnlyOnce()
          done()
        })
    })
  })

  describe('id', function (done) {
    it('should allow specifying a custom `id` function', function (done) {
      var app = toa(function () {
        this.body = '123'
      })

      app.use(ratelimit({
        db: db,
        max: 1,
        id: function () {
          return this.request.header.foo
        }
      }))

      request(app.listen())
        .get('/')
        .set('foo', 'bar')
        .expect('X-RateLimit-Remaining', '0')
        .end(done)
    })

    it('should not limit if `id` returns `false`', function (done) {
      var app = toa(function () {
        this.body = '123'
      })

      app.use(ratelimit({
        db: db,
        max: 5,
        id: function () {
          return false
        }
      }))

      request(app.listen())
        .get('/')
        .expect(function (res) {
          assert.strictEqual(res.headers.hasOwnProperty('x-ratelimit-remaining'), false)
        })
        .end(done)
    })

    it('should limit using the `id` value', function (done) {
      var app = toa(function () {
        this.body = this.request.header.foo
      })

      app.use(ratelimit({
        db: db,
        max: 1,
        id: function () {
          return this.request.header.foo
        }
      }))
      var server = app.listen()
      request(server)
        .get('/')
        .set('foo', 'bar')
        .expect(200, 'bar')
        .end(function () {
          request(server)
            .get('/')
            .set('foo', 'biz')
            .expect(200, 'biz')
            .end(done)
        })
    })
  })
})
