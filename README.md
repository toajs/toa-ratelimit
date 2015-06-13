toa-ratelimit
==========
Rate limiter module for toa.

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]

## Requirements

- Redis 2.8+

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

## Options

 - `db` redis connection instance
 - `max` max requests within `duration` [2500]
 - `duration` of limit in milliseconds [3600000]
 - `id` id to compare requests [ip]

## Responses

Example 200 with header fields:

```
HTTP/1.1 200 OK
X-Powered-By: toa
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1434201713302
Content-Type: text/plain; charset=utf-8
Content-Length: 6
Date: Sat, 13 Jun 2015 12:21:53 GMT
Connection: keep-alive

Stuff!
```


## Who's using

### [Teambition](https://www.teambition.com/)
1. Teambition community https://bbs.teambition.com/

[npm-url]: https://npmjs.org/package/toa-ratelimit
[npm-image]: http://img.shields.io/npm/v/toa-ratelimit.svg

[travis-url]: https://travis-ci.org/toajs/toa-ratelimit
[travis-image]: http://img.shields.io/travis/toajs/toa-ratelimit.svg
