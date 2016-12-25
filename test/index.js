'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

const Toa = require('toa')
const tman = require('tman')
const assert = require('assert')
const thunk = require('thunks')()
const request = require('supertest')
const redis = require('thunk-redis')
const ratelimit = require('..')

const redisClient = redis.createClient()

tman.suite('toa-ratelimit', function () {
  this.timeout(10000)

  tman.beforeEach(function * () {
    let keys = yield redisClient.keys('*LIMIT:*')
    if (keys.length) yield redisClient.del(keys)
  })

  tman.it('should throw error with wrong options', function () {
    assert.throws(() => ratelimit({}))
    assert.throws(() => ratelimit({getId: 'test'}))
    assert.throws(() => ratelimit({getId: function (req) {}, policy: []}))
  })

  tman.it('should work without redis options', function () {
    let app = new Toa()

    app.use(ratelimit({
      duration: 500,
      policy: {
        'GET': 5
      },
      getId: function () {
        return this.ip
      }
    }))
    app.use(function () {
      this.body = 'Hello'
    })

    let now = Date.now() / 1000
    let after = (Date.now() + 500) / 1000
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

  tman.it('should work with simple options', function * () {
    let app = new Toa()

    app.use(ratelimit({
      redis: redisClient,
      getId: function () {
        return this.ip
      },
      policy: {
        'GET': [3, 1000]
      }
    }))
    app.use(function () {
      this.body = 'Hello'
    })

    let now = Date.now() / 1000
    let after = (Date.now() + 1000) / 1000
    let server = app.listen()

    yield [
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
    ]
  })

  tman.it('should work with vary policy', function * () {
    let app = new Toa()
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
    app.use(function () {
      this.body = 'Hello'
    })

    let server = app.listen()

    yield [
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
    ]
  })

  tman.it('should work with multiple policy', function * () {
    let app = new Toa()
    app.use(ratelimit({
      redis: redisClient,
      getId: function () {
        return this.ip
      },
      policy: {
        'GET': [3, 500, 2, 1000, 1, 1000]
      }
    }))
    app.use(function () {
      this.body = 'Hello'
    })

    let server = app.listen()
    // policy [3, 500]
    yield [
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
    ]

    // policy [2, 1000]
    yield [
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
    ]

    // policy [1, 1000]
    yield [
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
    ]
    // return to default policy [3, 500]
    yield request(server)
      .get('/')
      .expect(200)
      .expect(function (res) {
        assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
      })
  })

  tman.it('should remove rate limit data', function * () {
    let app = new Toa()
    let limiter = ratelimit({
      redis: redisClient,
      getId: function () {
        return this.ip
      },
      policy: {
        'GET': [1, 500]
      }
    })
    app.use(limiter)
    app.use(function * () {
      assert.strictEqual(yield limiter.remove(this), 1)
    })
    app.use(function () {
      this.body = 'Hello'
    })

    let server = app.listen()
    yield request(server)
      .get('/')
      .expect(200)
      .expect(function (res) {
        assert.strictEqual(res.text, 'Hello')
        assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
        assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
      })

    yield request(server)
      .get('/')
      .expect(200)
      .expect(function (res) {
        assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
        assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
      })

    yield request(server)
      .get('/')
      .expect(200)
      .expect(function (res) {
        assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
        assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
      })
  })
})
