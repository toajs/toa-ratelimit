toa-ratelimit
==========
Rate limiter module for toa.

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]

## Requirements

- Redis 2.8+ with thunk-redis client

## Installation

```
npm install toa-ratelimit
```

## Example

```js
var ratelimit = require('toa-ratelimit')
var redis = require('thunk-redis')
var toa = require('toa')


var app = toa(function () {
  this.body = 'Stuff!'
})

// apply rate limit

app.use(ratelimit({
  db: redis.createClient(),
  duration: 60000,
  max: 100,
  id: function () {
    return this.ip
  }
}));

app.listen(3000);
console.log('listening on port 3000');
```

## API

```js
var ratelimit = require('toa-ratelimit')
```

### ratelimit(options)

```js
var ratelimitT = ratelimit(options)
```

`ratelimitT` is a thunk function. It can be used as middleware or module.

- `options.db`: *Required*, {Object}, redis connection instance
- `options.max`: *Optional*, {Number}, max requests within `duration`, default to `2500`
- `options.duration`: *Optional*, {Number}, of limit in milliseconds, default to `3600000`
- `options.id`: *Optional*, {Function}, generate a identifier to compare requests, `this` of the function is toa `context`, default to `function () { return this.ip }`
- `options.prefix`: *Optional*, Type: `String`, redis key namespace, default to `LIMIT`.

**Use as a middleware:**
```js
var ratelimitT = ratelimit({
  db: redis.createClient(),
  id: function () { return this.user._id }
})

app.use(ratelimitT)
```

**Use as a module:**
```js
var ratelimitT = ratelimit({
  db: redis.createClient(),
  id: function () { return this.user._id }
})

var app = toa(function *() {
  // ...
  // Used ratelimit only for `POST` request:

  if (this.method === 'POST') yield ratelimitT
})
```

#### ratelimitT.limit(id[, max, duration])

return a thunk function.

- `id`: *Required*, {String}, the identifier to limit against (typically a user id)
- `max`: *Optional*, {Number}, max requests within `duration`, default to `options.max`
- `duration`: *Optional*, {Number}, of limit in milliseconds, default to `options.duration`

```js
var ratelimitT = ratelimit({
  db: redis.createClient(),
  max: 100,
  duration: 30 * 60 * 1000,
  id: function () {
    return this.user._id
  }
})

var app = toa(function *() {

  // Used ratelimit only for `POST` and `PUT` request:
  if (/POST|PUT/.test(this.method)) {
    switch (this.user.role) {
      case 2: // owner, 1000 ops
        yield ratelimitT.limit(this.user._id, 1000)
        break
      case 1: // admin, 500 ops
        yield ratelimitT.limit(this.user._id, 500)
        break
      default: // member, 100 ops
        yield ratelimitT
    }
  }

  // do others
})
```

#### ratelimitT.limiter

The instance of `thunk-ratelimiter`.

## Responses

Example 200 with header fields:

```
HTTP/1.1 200 OK

Connection:keep-alive
Content-Length:2
Content-Type:text/plain; charset=utf-8
Date:Mon, 15 Jun 2015 16:23:29 GMT
X-Powered-By:Toa
X-RateLimit-Limit:10
X-RateLimit-Remaining:9
X-RateLimit-Reset:1434386009498

Hi
```

Example 429 with header fields:

```
HTTP/1.1 429 Too Many Requests

Connection:keep-alive
Content-Length:42
Content-Type:text/plain; charset=utf-8
Date:Mon, 15 Jun 2015 16:24:10 GMT
Retry-After:558
X-Powered-By:Toa
X-RateLimit-Limit:10
X-RateLimit-Remaining:0
X-RateLimit-Reset:1434386009498

Rate limit exceeded, retry in 558 seconds.
```


## Who's using

### [Teambition](https://www.teambition.com/)
1. Teambition community https://bbs.teambition.com/

[npm-url]: https://npmjs.org/package/toa-ratelimit
[npm-image]: http://img.shields.io/npm/v/toa-ratelimit.svg

[travis-url]: https://travis-ci.org/toajs/toa-ratelimit
[travis-image]: http://img.shields.io/travis/toajs/toa-ratelimit.svg
