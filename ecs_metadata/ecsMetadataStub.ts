import type { Request, Response } from 'express'

const fs = require('fs')
const path = require('path')
const express = require('express')
const app = express()
const ECS_METADATA_PORT = 3002

app.get('/', (_: Request, res: Response) => {
  try {
    const filePath = path.resolve(__dirname, './container.json')
    const data = fs.readFileSync(filePath, 'utf8')
    const jsonData = JSON.parse(data)
    res.json(jsonData)
  } catch (err) {
    console.error('Error reading or parsing the JSON file:', err)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.listen(ECS_METADATA_PORT, () => {
  console.info(`metadata stub service started on port ${ECS_METADATA_PORT}`)
})
