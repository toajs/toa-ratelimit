# toa-ratelimit

Smart rate limiter module for toa.

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Downloads][downloads-image]][downloads-url]

## Requirements

- Redis 2.8+ with thunk-redis client

## Installation

```sh
npm install toa-ratelimit
```

## Example

```js
const Toa = require('toa')
const ratelimit = require('toa-ratelimit')

const app = new Toa()
app.use(ratelimit({
  redis: 6379,
  duration: 10000,
  getId: function () { return this.ip },
  policy: {
    'GET': [3, 5000],
    'GET /test': [3, 5000, 3, 10000],
    '/test': 5
  }
}))
app.use(function () {
  this.body = this.res._headers
})

app.listen(3000, () => console.log('listening on port 3000'))
```

## API

```js
const ratelimit = require('toa-ratelimit')
```

`limiter` is a thunk function. It can be used as middleware or module.

**Use as a module:**

```js
const limiter = ratelimit({
  redis: 6379,
  duration: 10000,
  getId: function () { return this.ip },
  policy: {
    'GET': [3, 5000],
    'POST': [3, 5000, 3, 10000]
  }
})

const app = new Toa()
app.use(function * () {
  // ...
  // Used ratelimit only for `/api/test`:
  if (this.path === '/api/test') yield limiter
})
```

- `options.prefix`: *Optional*, Type: `String`, redis key namespace, default to `LIMIT`.
- `options.redis`: *Optional*, {Mix}, thunk-redis instance or [thunk-redis options](https://github.com/thunks/thunk-redis#api-more)
- `options.duration`: *Optional*, {Number}, of limit in milliseconds, default to `3600000`
- `options.getId`: *Required*, {Function}, generate a identifier for requests
- `options.policy`: *Required*, {Object}, limit policy

    **policy key:**
    It support 3 types: `METHOD /path`, `/path` and `METHOD`. Limiter will try match `METHOD /path` first, then `/path`, then `METHOD`. It means that `METHOD /path` has highest priority, then fallback to `/path` and `METHOD`.

    **policy value:**
    If value is a member, it means max count with `options.duration`. If value is array, it should be a pair of `max` and `duration`, support one more pairs.

    The first pair is default limit policy. If someone touch the maximum of default limit,
    then the next policy will be apply, and so on. So next policy should be stricter than previous one.

    If someone touch the maximum of limit and request again after double current `duration` time, it will rollback to default policy.

    **example policy:**
    ```js
    options.policy = {
      'HEAD': 100,
      'GET': [60, 60000, 30, 60000, 30, 120000],
      'PUT': [40, 60000, 20, 60000, 10, 120000],
      'POST': [40, 60000, 10, 60000],
      'DELETE': [40, 60000, 10, 60000],
      'POST /api/organizations': [10, 60000, 2, 60000],
      'POST /api/projects': [20, 60000, 5, 60000],
      '/api/auth': [10, 60000, 5, 120000],
    }
    ```

### limiter.remove(context)

Remove `context`'s rate limit data. Return thunk function.

```js
yield limiter.remove(this)(function (err, res) {
  console.log(err, res) // null, 1
})
```

## Responses

Example 200 with header fields:

```text
HTTP/1.1 200 OK

Connection:keep-alive
Content-Length:111
Content-Type:application/json; charset=utf-8
Date:Thu, 10 Dec 2015 13:21:55 GMT
X-Powered-By:Toa
X-RateLimit-Limit:3
X-RateLimit-Remaining:2
X-RateLimit-Reset:1449753721
```

Example 429 with header fields:

```text
HTTP/1.1 429 Too Many Requests

Connection:keep-alive
Content-Length:39
Content-Type:text/html; charset=utf-8
Date:Thu, 10 Dec 2015 13:22:36 GMT
Retry-After:3
X-Powered-By:Toa
X-RateLimit-Limit:3
X-RateLimit-Remaining:-1
X-RateLimit-Reset:1449753759
```

[npm-url]: https://npmjs.org/package/toa-ratelimit
[npm-image]: http://img.shields.io/npm/v/toa-ratelimit.svg

[travis-url]: https://travis-ci.org/toajs/toa-ratelimit
[travis-image]: http://img.shields.io/travis/toajs/toa-ratelimit.svg

[downloads-url]: https://npmjs.org/package/toa-ratelimit
[downloads-image]: http://img.shields.io/npm/dm/toa-ratelimit.svg?style=flat-square
