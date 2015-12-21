'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

var toa = require('toa')
var ratelimit = require('..')

var app = toa(function () {
  this.body = this.res._headers
})

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

app.listen(3000, function () {
  console.log('listening on port 3000')
})
