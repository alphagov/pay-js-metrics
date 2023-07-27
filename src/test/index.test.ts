import type { Express } from 'express'
import type { MetricsConfigurationOptions } from '../index'

const request = require('supertest')
const express = require('express')
const path = require('path')
const fs = require('fs')
let { env } = require('node:process')

const metricsConfig: MetricsConfigurationOptions = {
  defaultMetricsLabels: {
    one: 'test1',
    two: 'test2',
    three: 'test3',
  },
}

jest.mock('node:http', () => ({
  get: (_: any, callback: any) => {
    const response = {
      on: (event: string, handler: any) => {
        if (event === 'data') {
          const filePath = path.resolve(__dirname, '../../ecs_metadata/container.json')
          const mockData = fs.readFileSync(filePath, 'utf8')
          handler(Buffer.from(mockData))
        } else if (event === 'end') {
          handler()
        }
      },
      end: () => {},
    }
    return callback(response)
  },
}))
describe('/metrics endpoint', () => {
  const warnLogSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const errorLogSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

  let app: Express
  let metrics = require('../index')

  beforeEach(() => {
    jest.resetModules()
    app = express()
    metrics = require('../index')
    env.NODE_ENV = 'development'
    env.ECS_CONTAINER_METADATA_URI_V4 = undefined
  })

  it('should return metrics as plain text by default', async () => {
    app.use(metrics.configure(metricsConfig))
    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(response.text).toContain('nodejs_eventloop_lag_stddev_seconds')
    expect(response.text).toContain('nodejs_gc_duration_seconds')
    expect(response.text).toContain('process_resident_memory_bytes')
  })

  it('should return metrics as json when Accept header is set', async () => {
    app.use(metrics.configure(metricsConfig))
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

  it('should return custom metrics with default and custom labels', async () => {
    app.use(metrics.configure(metricsConfig))
    const test_counter = metrics.registerCounter('test_counter', 'test counter metric', ['test_type'])
    const test_gauge = metrics.registerGauge('test_gauge', 'test gauge metric', ['test_type'])
    const test_histogram = metrics.registerHistogram('test_histogram', 'test histogram metric', ['test_type'])

    test_counter.labels({ test_type: 'COUNTER' }).inc(1)
    test_gauge.labels({ test_type: 'GAUGE' }).set(24)
    test_histogram.labels({ test_type: 'HISTOGRAM' }).observe(9)

    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.text).toContain('test_counter{test_type="COUNTER",one="test1",two="test2",three="test3"} 1')
    expect(response.text).toContain('test_gauge{test_type="GAUGE",one="test1",two="test2",three="test3"} 24')
    expect(response.text).toContain(
      'test_histogram_bucket{le="10",test_type="HISTOGRAM",one="test1",two="test2",three="test3"} 1'
    )
  })

  it('should return histogram with custom buckets', async () => {
    app.use(metrics.configure(metricsConfig))
    const test_histogram_custom_buckets = metrics.registerHistogram(
      'test_histogram',
      'test histogram metric',
      ['test_type'],
      [20, 30, 40]
    )
    test_histogram_custom_buckets.labels({ test_type: 'CUSTOM_BUCKETS' }).observe(29)

    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.text).toContain(
      'test_histogram_bucket{le="20",test_type="CUSTOM_BUCKETS",one="test1",two="test2",three="test3"} 0'
    )
    expect(response.text).toContain(
      'test_histogram_bucket{le="30",test_type="CUSTOM_BUCKETS",one="test1",two="test2",three="test3"} 1'
    )
    expect(response.text).toContain(
      'test_histogram_bucket{le="40",test_type="CUSTOM_BUCKETS",one="test1",two="test2",three="test3"} 1'
    )
  })

  it('should return metrics with ecs labels when configured', async () => {
    env.ECS_CONTAINER_METADATA_URI_V4 = 'http://1.2.3.4:8080/path/'
    app.use(metrics.configure(metricsConfig))

    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.text).toContain(
      'nodejs_eventloop_lag_mean_seconds{one="test1",two="test2",three="test3",containerImageTag="latest",ecsClusterName="test-12-fargate",ecsServiceName="curl",ecsTaskID="cd189a933e5849daa93386466019ab50",awsAccountName="test",instance="192.0.2.3"}'
    )
    expect(response.text).toContain(
      'process_cpu_seconds_total{one="test1",two="test2",three="test3",containerImageTag="latest",ecsClusterName="test-12-fargate",ecsServiceName="curl",ecsTaskID="cd189a933e5849daa93386466019ab50",awsAccountName="test",instance="192.0.2.3"}'
    )
  })

  it('should not return metrics when ecs labels are missing and environment type is production', async () => {
    env.NODE_ENV = 'production'
    app.use(metrics.configure(metricsConfig))

    const response = await request(app).get('/metrics')
    expect(response.status).toBe(501)
    expect(errorLogSpy).toHaveBeenCalledWith('ECS_CONTAINER_METADATA_URI_V4 not found in environment')
    expect(response.text).toBe(JSON.stringify({ error: 'metrics initialization error' }))
  })

  it('should return metrics when environment type is not production and metadata uri is not available', async () => {
    app.use(metrics.configure(metricsConfig))

    const response = await request(app).get('/metrics')
    expect(response.status).toBe(200)
    expect(response.text).toContain('nodejs_eventloop_lag_stddev_seconds')
    expect(warnLogSpy).toHaveBeenCalledWith('ECS_CONTAINER_METADATA_URI_V4 not found in environment')
  })
})
