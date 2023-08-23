# pay-js-metrics

GOV.UK Pay Express middleware for prometheus metrics instrumentation

## Usage instructions

### Setting up

To enable `pay-js-metrics` in your Express app, use the middleware like so:

```js
const express = require('express')
const metrics = require('pay-js-metrics')

const app = express()
app.use(metrics.initialise())
```
`pay-js-metrics` will begin collecting the following baseline metrics automatically:

- Node runtime metrics
- Process CPU and memory metrics
- Express HTTP request metrics

These metrics will be published on `your.app/metrics`

### Initialisation

#### ECS

This middleware supports ECS metadata as labels for all metrics, when the `ECS_CONTAINER_METADATA_URI_V4` 
environment variable is available (automatically injected into ECS tasks) the middleware will contact the 
endpoint and retrieve the metadata. The following fields are extracted and included automatically:

- `containerImageTag`
- `ecsClusterName`
- `ecsServiceName`
- `ecsTaskID`
- `awsAccountName`
- `instance`

__IMPORTANT__: If the `NODE_ENV` is set to `production` then these fields are mandatory, the `/metrics` endpoint will 
not initialise without these labels being present.

#### Optional configuration

`pay-js-metrics` takes an optional configuration object that has the following properties:

```ts
type MetricsConfigurationOptions = {
  defaultMetricsLabels?: {
    [key: string]: string
  }
}
```

`defaultMetricsLabels` is an object of KV strings that will be applied as labels to all metrics. These labels will be included with the ECS labels (if enabled).

### Registering custom metrics

`pay-js-metrics` supports the following metric types:

- Histograms
  - A histogram samples observations (usually things like request durations or response sizes) and counts them in configurable buckets
- Counters
  - A counter is a cumulative metric that represents a single monotonically increasing counter whose value can only increase or be reset to zero on restart
- Gauges
  - A gauge is a metric that represents a single numerical value that can arbitrarily go up and down

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

## Releasing

After a pull request is merged, Concourse will automatically create a new release pull request that increments the package version. 

This pull request must be reviewed and merged by a developer. 

Once the release pull request is merged, GitHub Actions will publish the new versioned package to NPM.

__IMPORTANT__: Other pull requests will be blocked from merging until the release pull request is merged or closed.

## Licence

[MIT License](LICENSE)

## Vulnerability Disclosure

GOV.UK Pay aims to stay secure for everyone. If you are a security researcher and have discovered a security vulnerability in this code, we appreciate your help in disclosing it to us in a responsible manner. Please refer to our [vulnerability disclosure policy](https://www.gov.uk/help/report-vulnerability) and our [security.txt](https://vdp.cabinetoffice.gov.uk/.well-known/security.txt) file for details.
