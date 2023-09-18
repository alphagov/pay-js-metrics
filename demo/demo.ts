import type { Request, Response } from 'express'

const { env } = require('node:process')
const express = require('express')
const metrics = require('../src')

const app = express()
const PORT = 3001

app.use(metrics.initialise())

const hello_counter = metrics.registerCounter('hello_counter', '/hello example counter metric', ['http_method'])
const hello_param_counter = metrics.registerCounter('hello_param_counter', '/hello/:id example counter metric', [
  'http_method',
])
const hello_gauge = metrics.registerGauge('hello_gauge', '/hello example gauge metric', ['http_method'])
const hello_histogram = metrics.registerHistogram(
  'hello_histogram',
  '/hello example histogram metric',
  ['http_method'],
  [0.001, 0.01, 0.1, 1, 2]
)

app.get('/hello', async (_: Request, res: Response) => {
  const stop = hello_histogram.labels({ http_method: 'GET' }).startTimer()
  hello_counter.labels({ http_method: 'GET' }).inc(1)
  hello_gauge.labels({ http_method: 'GET' }).set(Math.floor(Math.random() * 100) + 1)
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ message: 'hello world' }), () => {
    stop() // automatically observed in the histogram metric by stopping the timer
  })
})

app.get('/hello/:name', async (req: Request, res: Response) => {
  hello_param_counter.labels({ http_method: 'GET' }).inc(1)
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ message: `hello ${req.params['name']}` }))
})

app.listen(PORT, () => {
  console.log(`express server started on port ${PORT}`)
})
