'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

/*global describe, it, beforeEach*/

var toa = require('toa')
var assert = require('assert')
var request = require('supertest')
var redis = require('thunk-redis')
var thunk = require('thunks')()

var ratelimit = require('..')

request.Test.prototype.toThunk = function () {
  var ctx = this
  return function (done) {
    ctx.end(done)
  }
}

var db = redis.createClient()

describe('toa-ratelimit', function () {
  beforeEach(function (done) {
    db.keys('LIMIT:*')(function (err, keys) {
      if (err) throw err
      return thunk.all(keys.map(function (key) {
        return db.del(key)
      }))
    })(done)
  })

  describe('limit', function () {
    it('should responds with 200 each of duration', function (done) {
      var app = toa(function () {
        this.body = 'Hi'
      })

      app.use(ratelimit({
        duration: 1000,
        db: db,
        max: 1
      }))

      var server = app.listen()

      thunk.all([
        request(server)
          .get('/')
          .expect('X-RateLimit-Remaining', '0')
          .expect(200, 'Hi'),
        thunk.delay(1100)(function () {
          request(server)
            .get('/')
            .expect('X-RateLimit-Remaining', '0')
            .expect(200, 'Hi')
        })
      ])(done)
    })

    it('should responds with 429 when rate limit is exceeded', function (done) {
      var app = toa(function () {
        this.body = 'Hi'
      })

      app.use(ratelimit({
        duration: 1000,
        db: db,
        max: 1
      }))

      var server = app.listen()

      thunk.all([
        request(server)
          .get('/')
          .expect('X-RateLimit-Remaining', '0')
          .expect(200, 'Hi'),
        request(server)
          .get('/')
          .expect('X-RateLimit-Remaining', '0')
          .expect(429)
      ])(done)
    })

    it('should responds related headers', function (done) {
      var app = toa(function () {
        this.body = 'Hi'
      })

      app.use(ratelimit({
        duration: 10000,
        db: db,
        max: 2
      }))

      var server = app.listen()

      thunk.all([
        request(server)
          .get('/')
          .expect(200, 'Hi')
          .expect('X-RateLimit-Remaining', '1'),
        request(server)
          .get('/')
          .expect(200, 'Hi')
          .expect(function (res) {
            var headers = res.headers
            assert.strictEqual(headers['x-ratelimit-limit'], '2')
            assert.strictEqual(headers['x-ratelimit-remaining'], '0')
            assert(+headers['x-ratelimit-reset'] <= (Date.now() + 10000))
          }),
        request(server)
          .get('/')
          .expect(429, /Rate limit exceeded/)
          .expect(function (res) {
            var headers = res.headers
            assert.strictEqual(headers['x-ratelimit-limit'], '2')
            assert.strictEqual(headers['x-ratelimit-remaining'], '0')
            assert(+headers['x-ratelimit-reset'] <= (Date.now() + 10000))
            assert(+headers['retry-after'] * 1000 <= 10000)
          })
      ])(done)
    })
  })

  describe('id', function (done) {
    it('should allow specifying a custom `id` function', function (done) {
      var app = toa(function () {
        this.body = 'Good'
      })

      app.use(ratelimit({
        db: db,
        max: 1,
        id: function () {
          return this.request.header.foo
        }
      }))

      var server = app.listen()
      thunk.all([
        request(server)
          .get('/')
          .set('foo', 'bar')
          .expect(200)
          .expect('X-RateLimit-Remaining', '0'),
        request(server)
          .get('/')
          .set('foo', 'bar')
          .expect(429)
          .expect('X-RateLimit-Remaining', '0')
      ])(done)
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
      thunk.all([
        request(server)
          .get('/')
          .set('foo', 'bar1')
          .expect(200, 'bar1'),
        request(server)
          .get('/')
          .set('foo', 'biz1')
          .expect(200, 'biz1'),
        request(server)
          .get('/')
          .set('foo', 'biz1')
          .expect(429)
          .expect('X-RateLimit-Remaining', '0')
      ])(done)
    })
  })

  describe('multi-mode', function (done) {
    it('should allow different parameters', function (done) {
      var ratelimitT = ratelimit({
        db: db,
        max: 1000
      })

      var app = toa(function () {
        return this.thunk()(function () {
          switch (this.path) {
            case '/a':
              return ratelimitT.limit(this.path, 1, 1000)
            case '/b':
              return ratelimitT.limit(this.path, 2, 500)
            default:
              return ratelimitT
          }
        })(function () {
          this.body = 'Good'
        })
      })
      var server = app.listen()
      thunk.all([
        request(server)
          .get('/a')
          .expect(200, 'Good')
          .expect('X-RateLimit-Remaining', '0'),
        request(server)
          .get('/a')
          .expect(429)
          .expect('X-RateLimit-Remaining', '0'),
        request(server)
          .get('/b')
          .expect(200, 'Good')
          .expect('X-RateLimit-Remaining', '1'),
        request(server)
          .get('/b')
          .expect(200, 'Good')
          .expect('X-RateLimit-Remaining', '0'),
        thunk.delay(510)(function () {
          return request(server)
            .get('/b')
            .expect(200, 'Good')
            .expect('X-RateLimit-Remaining', '1')
        }),
        request(server)
          .get('/c')
          .expect(200, 'Good')
          .expect('X-RateLimit-Remaining', '999')
      ])(done)
    })
  })
})
