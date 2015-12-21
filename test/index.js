'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

/*global describe, it, beforeEach*/

var toa = require('toa')
var assert = require('assert')
var thunk = require('thunks')()
var request = require('supertest')
var redis = require('thunk-redis')
var ratelimit = require('..')

var redisClient = redis.createClient()

describe('toa-ratelimit', function () {
  beforeEach(function (done) {
    redisClient.keys('*LIMIT:*')(function (err, keys) {
      if (err) throw err
      return thunk.all(keys.map(function (key) {
        return redisClient.del(key)
      }))
    })(done)
  })

  it('should throw error with wrong options', function () {
    assert.throws(function () {
      ratelimit({})
    })

    assert.throws(function () {
      ratelimit({
        getId: 'test'
      })
    })

    assert.throws(function () {
      ratelimit({
        getId: function (req) {},
        policy: []
      })
    })
  })

  it('should work without redis options', function () {
    var app = toa(function () {
      this.body = 'Hello'
    })

    app.use(ratelimit({
      duration: 500,
      policy: {
        'GET': 5
      },
      getId: function () {
        return this.ip
      }
    }))

    var now = Date.now() / 1000
    var after = (Date.now() + 500) / 1000
    return request(app.listen())
      .get('/')
      .expect(200)
      .expect(function (res) {
        assert.strictEqual(res.text, 'Hello')
        assert.strictEqual(res.headers['x-ratelimit-limit'], '5')
        assert.strictEqual(res.headers['x-ratelimit-remaining'], '4')
        assert.strictEqual(+res.headers['x-ratelimit-reset'] > now, true)
        assert.strictEqual(+res.headers['x-ratelimit-reset'] <= Math.ceil(after), true)
      })
  })

  it('should work with simple options', function (done) {
    var app = toa(function () {
      this.body = 'Hello'
    })

    app.use(ratelimit({
      redis: redisClient,
      getId: function () {
        return this.ip
      },
      policy: {
        'GET': [3, 1000]
      }
    }))

    var now = Date.now() / 1000
    var after = (Date.now() + 1000) / 1000
    var server = app.listen()

    thunk.all([
      request(server)
        .get('/')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.text, 'Hello')
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '2')
          assert.strictEqual(+res.headers['x-ratelimit-reset'] > now, true)
          assert.strictEqual(+res.headers['x-ratelimit-reset'] <= Math.ceil(after), true)
        }),
      request(server)
        .get('/')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
        }),
      request(server)
        .get('/')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
        }),
      request(server)
        .get('/')
        .expect(429)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
        }),
      request(server)
        .get('/')
        .expect(429)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
        })
    ])(done)
  })

  it('should work with vary policy', function (done) {
    var app = toa(function () {
      this.body = 'Hello'
    })
    app.use(ratelimit({
      duration: 1000,
      redis: redisClient,
      getId: function () {
        return this.ip
      },
      policy: {
        'GET': [5, 500],
        'GET /path1': [4, 500],
        '/path2': 3
      }
    }))

    var server = app.listen()

    thunk.all([
      request(server)
        .get('/')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.text, 'Hello')
          assert.strictEqual(res.headers['x-ratelimit-limit'], '5')
        }),
      request(server)
        .get('/path1')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.text, 'Hello')
          assert.strictEqual(res.headers['x-ratelimit-limit'], '4')
        }),
      request(server)
        .get('/path2')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.text, 'Hello')
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
        }),
      request(server)
        .post('/')
        .send({})
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.text, 'Hello')
          assert.strictEqual(res.headers['x-ratelimit-limit'], undefined)
        })
    ])(done)
  })

  it('should work with multiple policy', function (done) {
    var app = toa(function () {
      this.body = 'Hello'
    })
    app.use(ratelimit({
      redis: redisClient,
      getId: function () {
        return this.ip
      },
      policy: {
        'GET': [3, 500, 2, 1000, 1, 1000]
      }
    }))

    var server = app.listen()
    // policy [3, 500]
    thunk.all([
      request(server)
        .get('/')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '2')
        }),
      request(server)
        .get('/')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
        }),
      request(server)
        .get('/path2')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
        }),
      request(server)
        .get('/')
        .expect(429)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
          assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
        }),
      thunk.delay(600)
    ])(function () {
      // policy [2, 1000]
      return thunk.all([
        request(server)
          .get('/')
          .expect(200)
          .expect(function (res) {
            assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
            assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
          }),
        request(server)
          .get('/')
          .expect(200)
          .expect(function (res) {
            assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
            assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
          }),
        request(server)
          .get('/path2')
          .expect(429)
          .expect(function (res) {
            assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
            assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
          }),
        thunk.delay(1100)
      ])
    })(function () {
      // policy [1, 1000]
      return thunk.all([
        request(server)
          .get('/')
          .expect(200)
          .expect(function (res) {
            assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
            assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
          }),
        request(server)
          .get('/')
          .expect(429)
          .expect(function (res) {
            assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
            assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
          }),
        // this delay exceed policy duration(1000 * 2), will restore to default policy
        thunk.delay(2100)
      ])
    })(function () {
      // return to default policy [3, 500]
      return request(server)
        .get('/')
        .expect(200)
        .expect(function (res) {
          assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
        })
    })(done)
  })
})
