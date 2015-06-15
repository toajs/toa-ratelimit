'use strict'
// **Github:** https://github.com/toajs/toa-ratelimit
//
// **License:** MIT

var toa = require('toa')
var redis = require('thunk-redis')
var ratelimit = require('..')

var app = toa(function () {
  this.body = 'Hi'
})

app.use(ratelimit({
  db: redis.createClient(),
  max: 10,
  duration: 10 * 60 * 1000,
  id: function () { return '1111111111' }
}))

app.listen(3000)
