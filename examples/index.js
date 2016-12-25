'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

const Toa = require('toa')
const ratelimit = require('..')

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
