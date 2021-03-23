const fs = require('fs')
const YAML = require('yaml')
const Queue = require('buffered-queue')
const express = require('express')
const app = express()
const cookieParser = require('cookie-parser')
const fetch = require('node-fetch')


const file = fs.readFileSync('./settings.yml', 'utf8')
const settings = YAML.parse(file)
const pixels = settings.pixels || {}
const graphBaseUrl = settings.graphBaseUrl || "https://graph.facebook.com/v10.0"

for (pixelID in pixels) {
  pixels[pixelID].queue = new Queue(pixelID.toString(), {
    size: settings.buffer_size || 1,
    flushTimeout: settings.buffer_interval || null,
  })
  pixels[pixelID].queue.on('flush', function(data, pixelID) {
    const url = graphBaseUrl + "/" + pixelID + "/events?access_token=" + pixels[pixelID].token
    const postBody = {
      "data": data,
    }
    if ("test_code" in pixels[pixelID]) {
      postBody["test_event_code"] = pixels[pixelID].test_code
    }
    fetch(url, {
      method: 'post',
      timeout: settings.timeout || 10000,
      body:    JSON.stringify(postBody),
      headers: { 'Content-Type': 'application/json' },
    })
    .then(res => res.json())
    .then(json => console.log(json))
  })
}
const currentTs = () => {
  return Math.floor(Date.now() / 1000)
}
const fullUrl = (req) => {
  return req.protocol + '://' + req.get('Host') + req.url
}
const prepareData = (req, eventName, eventData, eventID) => {
  const pixelData = {
    "event_name": eventName,
    "event_time": currentTs(),
    "event_source_url": req.get('Referrer') || fullUrl(req),
    "action_source": "website",
    "user_data": {
      "client_user_agent": req.get('User-Agent'),
      "client_ip_address": req.ip,
    },
    "custom_data": eventData
  }
  if (eventID) {
    pixelData["event_id"] = eventID
  }
  if (eventName === "Purchase") {
    // pixelData["user_data"]["ph"] = eventData["phone"]
  }
  if ('_fbc' in req.cookies) {
    pixelData["user_data"]["fbc"] = req.cookies._fbc
  }
  if ('_fbp' in req.cookies) {
    pixelData["user_data"]["fbp"] = req.cookies._fbp
  }
  return pixelData
}

console.log(settings)

app.enable('trust proxy')
app.use(cookieParser())

app.get('/pixel/:pixelID/:eventName', function (req, res) {
  res.send('oke')
  
  const pixelID = req.params.pixelID
  if (pixelID in pixels) {
    const customData = JSON.parse(req.query.customData)
    const eventID = req.query.eventID || null
    const pixelData = prepareData(req, req.params.eventName, customData, eventID)
    pixels[pixelID].queue.add(pixelData)
  }
})

const listenPort = process.env.PORT || 3000
app.listen(listenPort, () => {
    console.log('Running')
})