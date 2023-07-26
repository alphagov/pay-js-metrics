# pay-js-metrics

GOV.UK Pay Express middleware for prometheus metrics instrumentation

## Usage instructions

### Setting up

To enable `pay-js-metrics` in your Express app, use the middleware like so:

```js
const express = require('express')
const metrics = require('pay-js-metrics')

const app = express()
app.use(metrics.configure())
```
`pay-js-metrics` will begin collecting the following baseline metrics automatically:

- Node runtime metrics
- Process CPU and memory metrics
- Express HTTP request metrics

These metrics will be published on `{your.app}/metrics`

`pay-js-metrics` takes an optional configuration object that has the following properties:

```ts
type MetricsConfigurationOptions = {
  fetchECSLabels?: boolean
  defaultMetricsLabels?: {
    [key: string]: string
  }
}
```

`fetchECSLabels` will configure all metrics with the following default labels obtained via the `ECS_CONTAINER_METADATA_URI` if set to `true`:

- `containerImageTag`
- `ecsClusterName`
- `ecsServiceName` 
- `ecsTaskID` 
- `awsAccountName` 
- `instance`

__IMPORTANT__: If the `NODE_ENV` is set to `production` then these fields are mandatory, the metrics middleware will not initialise without these labels being present.

`defaultMetricsLabels` is an object of KV strings that will be applied as labels to all metrics. These labels will be included with the ECS labels (if enabled).

### Registering custom metrics

`pay-js-metrics` supports the following metric types:

- Histograms
  - Histograms track sizes and frequency of events
- Counters
  - Counters go up, and reset when the process restarts
- Gauges
  - Gauges are similar to Counters but a Gauge's value can be decreased

Custom metrics can be registered via the exported helper functions:

```
metrics.registerCounter(name: string, help: string, labelNames: string[])
metrics.registerGauge(name: string, help: string, labelNames: string[])
metrics.registerHistogram(name: string, help: string, labelNames: string[], buckets?: number[])
```
Example registration of a custom Counter metric:

```js
const hello_counter = metrics.registerCounter('hello_counter', '/hello example counter metric', ['http_method'])
```
`name` is the name of your metric, it is exported as
```
# TYPE hello_counter counter
```

`help` is the description of your metric, it is exported as
```
# HELP hello_counter /hello example counter metric
```

`labelNames` is an array of label keys that are assigned values when your metric is observed, for example:
```js
hello_counter.labels({ http_method: 'GET' }).inc(1)
```
would be exported as:
```
hello_counter{http_method="GET"} 2
```

Histogram metrics take an additional optional `buckets` parameter that customises the bucket values for observed events, this is an array of type `number`

__IMPORTANT__: Custom metrics are not viewable before they have been observed at least once

For more examples of how metrics can be registered and used, see the [demo code](ecs_metadata/demo.ts).

## Contributing

`npm run test` checks the code formatting and executes the Jest test suite

`npm run build` complies the project to CommonJS, outputs to `dist`

`npm run format` runs the formatter rule set and will automatically update any src files that are failing 

`npm run demo` starts the ecs metadata stub and the demo express app 

## Licence

[MIT License](LICENSE)

## Vulnerability Disclosure

GOV.UK Pay aims to stay secure for everyone. If you are a security researcher and have discovered a security vulnerability in this code, we appreciate your help in disclosing it to us in a responsible manner. Please refer to our [vulnerability disclosure policy](https://www.gov.uk/help/report-vulnerability) and our [security.txt](https://vdp.cabinetoffice.gov.uk/.well-known/security.txt) file for details.
