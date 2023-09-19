import type { Express } from 'express'

const request = require('supertest')
const express = require('express')
const path = require('path')
const fs = require('fs')
let { env } = require('node:process')

describe('/metrics endpoint', () => {
  const warnLogSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const errorLogSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

  let app: Express
  let metrics = require('../index')

  beforeEach(() => {
    jest.resetModules()
    app = express()
    metrics = require('../index')
    app.use(metrics.initialise())
    env.NODE_ENV = 'development'
  })

  it('should return metrics as plain text by default', async () => {
    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(response.text).toContain('nodejs_eventloop_lag_stddev_seconds')
    expect(response.text).toContain('nodejs_gc_duration_seconds')
    expect(response.text).toContain('process_resident_memory_bytes')
  })

  it('should return metrics as json when Accept header is set', async () => {
    const response = await request(app).get('/metrics').set('Accept', 'application/json')
    let jsonArray = [{}]
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(() => (jsonArray = JSON.parse(response.text))).not.toThrow()

    const expectedKeyValuePairs = [
      { name: 'process_cpu_user_seconds_total' },
      { name: 'nodejs_active_resources' },
      { name: 'nodejs_heap_space_size_available_bytes' },
    ]

    expectedKeyValuePairs.forEach((pair) => {
      expect(jsonArray).toContainEqual(expect.objectContaining(pair))
    })
  })

  it('should return custom metrics with custom labels', async () => {
    const test_counter = metrics.registerCounter('test_counter', 'test counter metric', ['test_type'])
    const test_gauge = metrics.registerGauge('test_gauge', 'test gauge metric', ['test_type'])
    const test_histogram = metrics.registerHistogram('test_histogram', 'test histogram metric', ['test_type'])

    test_counter.labels({ test_type: 'COUNTER' }).inc(1)
    test_gauge.labels({ test_type: 'GAUGE' }).set(24)
    test_histogram.labels({ test_type: 'HISTOGRAM' }).observe(9)

    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.text).toContain('test_counter{test_type="COUNTER"} 1')
    expect(response.text).toContain('test_gauge{test_type="GAUGE"} 24')
    expect(response.text).toContain('test_histogram_bucket{le="10",test_type="HISTOGRAM"} 1')
  })

  it('should return histogram with custom buckets', async () => {
    const test_histogram_custom_buckets = metrics.registerHistogram(
      'test_histogram',
      'test histogram metric',
      ['test_type'],
      [20, 30, 40]
    )
    test_histogram_custom_buckets.labels({ test_type: 'CUSTOM_BUCKETS' }).observe(29)

    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.text).toContain('test_histogram_bucket{le="20",test_type="CUSTOM_BUCKETS"} 0')
    expect(response.text).toContain('test_histogram_bucket{le="30",test_type="CUSTOM_BUCKETS"} 1')
    expect(response.text).toContain('test_histogram_bucket{le="40",test_type="CUSTOM_BUCKETS"} 1')
  })

  it('should return express http metrics', async () => {
    app.get('/test', async (_, res) => {
      res.sendStatus(200)
    })
    app.get('/test/:withparam', async (_, res) => {
      res.sendStatus(200)
    })
    await request(app).get('/test')
    await request(app).get('/test/ishouldnotbeinthemetrics')
    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.text).toContain('express_http_count{status_code="200",http_method="GET",path="/test"} 1')
    expect(response.text).toContain('express_http_count{status_code="200",http_method="GET",path="/test/:withparam"} 1')
    expect(response.text).not.toContain('ishouldnotbeinthemetrics')
  })
})
