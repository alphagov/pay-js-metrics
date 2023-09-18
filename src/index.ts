import type { NextFunction, Request, Response } from 'express'
import type { Gauge, Counter, Histogram } from 'prom-client'
import type { IncomingMessage, RequestOptions } from 'node:http'

const prometheus = require('prom-client')
const onFinished = require('on-finished')
const { env } = require('node:process')
const http = require('node:http')

const EXPRESS_METRIC_STATUS_CODE = 'status_code'
const EXPRESS_METRIC_HTTP_METHOD = 'http_method'
const EXPRESS_METRIC_PATH = 'path'
const METRICS_PATH = /^\/metrics?$/

let expressHttpHistogram: Histogram
let ecsLabelsRequired: boolean = false
let ecsLabelsValidated: boolean = false
let metadataUrl: URL | undefined

const middleware = (req: Request, res: Response, next: NextFunction) => {
  if (RegExp(METRICS_PATH).exec(req.url)) {
    res.format({
      'text/plain': async () => {
        res.set('Content-Type', prometheus.register.contentType)
        res.end(await prometheus.register.metrics())
      },
      'application/json': async () => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(await prometheus.register.getMetricsAsJSON()))
      },
      default: async () => {
        res.set('Content-Type', prometheus.register.contentType)
        res.end(await prometheus.register.metrics())
      },
    })

    return
  }

  const expressResponseMetrics: { [key: string]: number | string } = {}
  const stop = expressHttpHistogram.startTimer(expressResponseMetrics)
  onFinished(res, () => {
    expressResponseMetrics[EXPRESS_METRIC_STATUS_CODE] = res.statusCode
    expressResponseMetrics[EXPRESS_METRIC_HTTP_METHOD] = req.method
    if (req.route) {
      expressResponseMetrics[EXPRESS_METRIC_PATH] = req.route.path
    }
    stop()
  })
  next()
}

const initialise = () => {
  prometheus.collectDefaultMetrics()

  expressHttpHistogram = new prometheus.Histogram({
    name: 'express_http',
    help: 'Duration of http responses',
    labelNames: [EXPRESS_METRIC_STATUS_CODE, EXPRESS_METRIC_HTTP_METHOD, EXPRESS_METRIC_PATH],
  })

  return middleware
}

const registerCounter = (name: string, help: string, labelNames: string[]): Counter => {
  return new prometheus.Counter({
    name,
    help,
    labelNames,
  })
}

const registerGauge = (name: string, help: string, labelNames: string[]): Gauge => {
  return new prometheus.Gauge({
    name,
    help,
    labelNames,
  })
}

const registerHistogram = (name: string, help: string, labelNames: string[], buckets?: number[]): Histogram => {
  return new prometheus.Histogram({
    name,
    help,
    labelNames,
    ...(buckets != undefined && { buckets }),
  })
}

module.exports = {
  initialise,
  registerCounter,
  registerGauge,
  registerHistogram,
}
