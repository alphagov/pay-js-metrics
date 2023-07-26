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

const customMetrics: CustomMetrics = {}
const path = new RegExp('^/metrics?$')

let defaultMetricsLabels: DefaultMetricsLabels = {}
let expressHttpHistogram: Histogram
let ecsLabelsRequired: boolean = false
let ecsLabelsValidated: boolean = false

const middleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.url.match(path)) {
    if (ecsLabelsValidated || !ecsLabelsRequired) {
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
    } else {
      res.setHeader('Content-Type', 'application/json')
      res.status(501).send(JSON.stringify({ error: 'metrics initialization error' }))
    }
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

const configure = (opts: MetricsConfigurationOptions = {}) => {
  if (env.NODE_ENV === 'production') {
    ecsLabelsRequired = true
  }

  if (opts.defaultMetricsLabels) {
    defaultMetricsLabels = opts.defaultMetricsLabels
    prometheus.register.setDefaultLabels(defaultMetricsLabels)
  }

  if (opts.fetchECSLabels) {
    getECSMetadata()
      .then((ecsLabels) => {
        defaultMetricsLabels = {
          ...defaultMetricsLabels,
          ...ecsLabels,
        }
        ecsLabelsValidated = hasRequiredLabels(defaultMetricsLabels)
        prometheus.register.setDefaultLabels(defaultMetricsLabels)
      })
      .catch((error: Error) => console.warn(error.message))
  }

  prometheus.collectDefaultMetrics()

  expressHttpHistogram = new prometheus.Histogram({
    name: 'express_http',
    help: 'Duration of http responses',
    labelNames: [EXPRESS_METRIC_STATUS_CODE, EXPRESS_METRIC_HTTP_METHOD, EXPRESS_METRIC_PATH],
  })

  return middleware
}

const registerCounter = (name: string, help: string, labelNames: string[]): Counter => {
  customMetrics[name] = new prometheus.Counter({
    name,
    help,
    labelNames,
  })
  return customMetrics[name] as Counter
}

const registerGauge = (name: string, help: string, labelNames: string[]): Gauge => {
  customMetrics[name] = new prometheus.Gauge({
    name,
    help,
    labelNames,
  })
  return customMetrics[name] as Gauge
}

const registerHistogram = (name: string, help: string, labelNames: string[], buckets?: number[]): Histogram => {
  customMetrics[name] = new prometheus.Histogram({
    name,
    help,
    labelNames,
    ...(buckets != undefined && { buckets }),
  })
  return customMetrics[name] as Histogram
}

const getECSMetadata = (): Promise<ECSLabels> => {
  return new Promise((resolve, reject) => {
    try {
      const metadataURL = new URL(env.ECS_CONTAINER_METADATA_URI_V4)
      const options: RequestOptions = {
        protocol: metadataURL.protocol,
        host: metadataURL.hostname,
        port: metadataURL.port || '80',
        path: metadataURL.pathname,
        timeout: 5000,
      }

      const containerRequest = http.get(options, (response: IncomingMessage) => {
        let data = ''
        let ecsMetadataLabels: ECSLabels

        response.on('data', (chunk) => {
          data += chunk
        })

        response.on('end', () => {
          try {
            const containerMetadata = JSON.parse(data)
            const taskARN: string = containerMetadata.Labels['com.amazonaws.ecs.task-arn']
            const clusterName: string = containerMetadata.Labels['com.amazonaws.ecs.cluster'].split('/')[1]

            ecsMetadataLabels = {
              containerImageTag: containerMetadata.Image.split(':')[1],
              ecsClusterName: clusterName,
              ecsServiceName: containerMetadata.DockerName,
              ecsTaskID: taskARN.substring(taskARN.lastIndexOf('/') + 1),
              awsAccountName: clusterName.split('-')[0]!,
              instance: containerMetadata.Networks[0].IPv4Addresses[0],
            }
            resolve(ecsMetadataLabels)
          } catch (error) {
            reject(new Error(`Error retrieving container metadata: ${error}`))
          }
        })
      })

      containerRequest.on('error', (error: Error) => {
        reject(new Error(`Error retrieving container metadata: ${error}`))
      })

      containerRequest.end()
    } catch (error) {
      reject(new Error(`Error parsing metadata url from environment: ${error}`))
    }
  })
}

module.exports = {
  configure,
  registerCounter,
  registerGauge,
  registerHistogram,
}

// --- PRIVATE

const hasRequiredLabels = (labels: DefaultMetricsLabels) => {
  if (typeof labels !== 'object') {
    return false
  }

  const requiredKeys: string[] = [
    'containerImageTag',
    'ecsClusterName',
    'ecsServiceName',
    'ecsTaskID',
    'awsAccountName',
    'instance',
  ]

  const missingKeys = requiredKeys.filter((key) => !(key in labels))
  if (missingKeys.length > 0) {
    return false
  }

  for (const key of requiredKeys) {
    const value = labels[key]
    if (value === undefined || value === null || value === '') {
      return false
    }
  }

  return true
}

// --- TYPES

export type CustomMetrics = {
  [name: string]: Gauge | Counter | Histogram
}

export type DefaultMetricsLabels = {
  [key: string]: string
}

export type MetricsConfigurationOptions = {
  fetchECSLabels?: boolean
  defaultMetricsLabels?: DefaultMetricsLabels
}

export type ECSLabels = {
  containerImageTag: string
  ecsClusterName: string
  ecsServiceName: string
  ecsTaskID: string
  awsAccountName: string
  instance: string
}
